// LE PASSAGE HUMAIN SANS CONNEXION NI WORKER — éprouvé de bout en bout.
//
// Christophe ne peut pas se connecter depuis http://127.0.0.1:8765 : le Worker n'autorise qu'une
// seule origine, et ce n'est pas celle-là. Les deux passages qu'il doit faire — mesurer sur une
// vraie Présentation, et relire le lot 1a — ne doivent donc dépendre d'aucun secret.
//
// CE QUE CE TEST PROUVE, en une seule traversée :
//   1. un export autonome produit par l'application se recharge dans le banc ;
//   2. il ne porte AUCUNE narration — c'est la règle du lot 1a, et elle tient ;
//   3. ses images embarquées suffisent, aucune requête ne part vers le Worker ;
//   4. le document s'ouvre dans l'espace de travail et le champ Narration y apparaît ;
//   5. une narration écrite se retrouve dans le fichier de travail téléchargé ;
//   6. rechargé, ce fichier rend la narration à l'éditeur.
//
// CE QUE CE TEST NE PROUVE PAS — lu à mes dépens le 8 octobre.
//
// Il interroge le DOM. Or l'écran de connexion de l'application est posé en
// `position:fixed; inset:0; z-index:99999` : TOUT l'éditeur existe dessous, intact et
// fonctionnel, pendant qu'un humain ne voit qu'un champ de mot de passe. Ce test passait donc
// 6/6 alors que Christophe ne pouvait pas atteindre le champ Narration.
//
// Précisément : `boite.hidden === false` ne dit rien d'un recouvrement ; `el.click()` par script
// traverse tous les recouvrements ; `zone.value = …` n'est pas une frappe au clavier. Et ce test
// ne clique jamais « Réduire le panneau », qui est l'étape où Christophe butait.
//
// Ce qu'un HUMAIN atteint est éprouvé par tests/verify-porte-locale.cjs, qui demande au
// navigateur quel élément recevrait le clic (elementFromPoint) et tape au clavier.
//
//   NODE_PATH=<playwright> node tests/verify-banc-sans-connexion.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const BANC = path.join(RACINE, 'banc-chutier');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
// L'adresse que la page appellerait si elle tentait quoi que ce soit côté serveur.
const WORKER = 'clone-proxy';

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const telechargements = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-'));
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    // CE QUI EST VRAI DES APPELS AU WORKER, et ce qui ne l'est pas. L'application interroge le
    // Worker à son démarrage — bibliothèque, chartes — et ces appels partent quoi qu'on fasse,
    // de façon asynchrone. Les attribuer à l'action en cours s'est révélé faux : ils retombent
    // dans n'importe quelle phase selon le moment où ils aboutissent. L'affirmation juste n'est
    // donc pas « aucun appel », mais : AUCUN n'aboutit, aucun ne concerne la connexion ni les
    // documents, et la boucle entière réussit malgré leur échec. C'est cela qui se mesure.
    const appels = [];
    page.on('request', (r) => { if (r.url().indexOf(WORKER) !== -1) appels.push({ url: r.url(), statut: null }); });
    page.on('response', (r) => {
      if (r.url().indexOf(WORKER) === -1) return;
      const e = appels.find((x) => x.url === r.url() && x.statut === null);
      if (e) e.statut = r.status();
    });
    page.on('requestfailed', (r) => {
      if (r.url().indexOf(WORKER) === -1) return;
      const e = appels.find((x) => x.url === r.url() && x.statut === null);
      if (e) e.statut = 'échec réseau';
    });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));

    // ── 1. Un export autonome RÉEL, produit par l'application elle-même ───────────────────────
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const chemin = path.join(BANC, 'export-pour-essai.html');
    const fabrication = await page.evaluate(async ({ d, imgs }) => {
      window.ADOC_EXPORT_IMAGES = imgs;
      const doc = JSON.parse(JSON.stringify(d));
      // Le document de DÉPART porte une narration : c'est ce qui permet de vérifier que l'export
      // ne l'emporte pas, au lieu de constater une absence qui n'aurait jamais existé.
      window.adocNarrationWrite(doc, window.adocPresentStepList(doc)[0].stepId,
        'Narration de départ, qui ne doit PAS partir dans l\'export.');
      const html = await window.adocBuildStandalonePresentationHTML(doc, {});
      return { html, narrationsDepart: (doc.narration || []).length };
    }, { d: PRESENTATIONS[0].doc, imgs: IMAGES_EMBARQUEES });
    assert.equal(fabrication.narrationsDepart, 1, 'le document de départ doit porter une narration');
    fs.writeFileSync(chemin, fabrication.html, 'utf8');
    assert.ok(fabrication.html.indexOf('Narration de départ') === -1,
      'l\'export ne doit PAS contenir le texte de la narration');
    // Frontière : tout ce qui précède appartient à la FABRICATION de l'export, qui est un geste
    // de l'application et non du banc. Elle appelle /fetch-image pour embarquer les images — ici
    // sans clé, donc elle embarque un aplat de repli, ce qui est précisément ce qu'elle doit faire
    // quand elle ne peut pas joindre le Worker. Seul ce qui SUIT cette ligne juge le banc.
    const apresFabrication = appels.length;
    console.log('      pendant la fabrication de l\'export : ' + apresFabrication + ' appel(s) au Worker');
    pass('export autonome produit (' + Math.round(fabrication.html.length / 1024) + ' Ko), sans le texte de la narration.');

    // ── 2. Le banc le relit, sans connexion ───────────────────────────────────────────────────
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.setInputFiles('#bc-export', chemin);
    await page.waitForFunction(() => /Export lu/.test(document.getElementById('bc-etat').textContent),
      { timeout: 20000 });
    const etat = await page.textContent('#bc-etat');
    assert.match(etat, /diapositives/, 'le compte de diapositives doit être annoncé : ' + etat);
    assert.match(etat, /images embarquées/, 'les images embarquées doivent être reprises');
    assert.match(etat, /AUCUNE/, 'l\'absence de narration doit être DITE, pas tue : ' + etat);
    const options = await page.$$eval('#bc-presentation option', (o) => o.map((x) => x.textContent));
    assert.ok(options.some((t) => t.indexOf('EXPORT —') === 0), 'la présentation chargée doit entrer dans la liste');
    pass('export rechargé dans le banc : ' + etat.split('\n')[0].trim());

    // ── 3. Ouverture dans l'espace de travail, et le champ Narration apparaît ─────────────────
    phase = 'ouvrir dans l\'espace de travail';
    await page.click('#bc-atelier');
    await page.waitForFunction(() => /espace de travail/.test(document.getElementById('bc-etat').textContent),
      { timeout: 30000 });
    const champ = await page.evaluate(() => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      const etapes = window.adocPresentStepList(d);
      const el = document.getElementById(etapes[0].stepId) || document.getElementById('root:card-title:' + etapes[0].cardId);
      if (el) el.click();
      const boite = document.querySelector('.cc-editor-narration');
      return { etapes: etapes.length, narrationDoc: (d.narration || []).length,
               boite: !!boite, cache: boite ? boite.hidden : null,
               libelle: boite ? boite.querySelector('.cc-editor-narration-etape').textContent : null };
    });
    assert.equal(champ.narrationDoc, 0, 'le document venu de l\'export ne porte aucune narration');
    assert.equal(champ.boite, true, 'le champ Narration doit exister');
    assert.equal(champ.cache, false, 'et être visible sur l\'étape sélectionnée');
    assert.match(champ.libelle, /Diapositive/, 'libellé d\'étape : ' + champ.libelle);
    pass('document ouvert dans l\'espace de travail, champ Narration visible — ' + champ.libelle);

    // ── 4. Écrire une narration, la télécharger ───────────────────────────────────────────────
    const TEXTE = 'Vous commencez par nommer ce qui se passe, sans le juger.';
    const ecrit = await page.evaluate((t) => {
      const zone = document.querySelector('[data-editor-narration]');
      zone.value = t;
      zone.dispatchEvent(new Event('input', { bubbles: true }));
      return { narration: window._adocArtifacts['banc']._adocStructuredDoc.narration, stepId: zone.dataset.stepId };
    }, TEXTE);
    assert.equal(ecrit.narration.length, 1, 'la narration doit entrer dans le document');
    assert.equal(ecrit.narration[0].text, TEXTE);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bc-telecharger')]);
    const fichier = path.join(telechargements, dl.suggestedFilename());
    await dl.saveAs(fichier);
    const travail = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    assert.equal((travail.narration || []).length, 1, 'le fichier de travail doit porter la narration');
    assert.equal(travail.narration[0].text, TEXTE);
    assert.match(dl.suggestedFilename(), /^document-de-travail-.*\.json$/, 'nom du fichier : ' + dl.suggestedFilename());
    pass('narration écrite dans l\'éditeur et retrouvée dans le fichier de travail téléchargé.');

    // ── 5. Rechargé, le fichier rend la narration ─────────────────────────────────────────────
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.setInputFiles('#bc-fichier', fichier);
    await page.waitForFunction(() => /Chargé/.test(document.getElementById('bc-etat').textContent), { timeout: 20000 });
    await page.click('#bc-atelier');
    await page.waitForFunction(() => /espace de travail/.test(document.getElementById('bc-etat').textContent), { timeout: 30000 });
    const relu = await page.evaluate(() => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      const etapes = window.adocPresentStepList(d);
      const el = document.getElementById(etapes[0].stepId) || document.getElementById('root:card-title:' + etapes[0].cardId);
      if (el) el.click();
      const zone = document.querySelector('[data-editor-narration]');
      return { valeur: zone ? zone.value : null, compte: document.querySelector('.cc-editor-narration-compte').textContent };
    });
    assert.equal(relu.valeur, TEXTE, 'la narration doit revenir dans le champ : ' + relu.valeur);
    assert.match(relu.compte, /mots/, 'et son compte de mots avec : ' + relu.compte);
    pass('fichier de travail rechargé : la narration revient dans l\'éditeur (' + relu.compte.split('—')[0].trim() + ').');

    // ── 6. AUCUN appel au Worker sur tout le parcours ─────────────────────────────────────────
    // Aucune route de connexion, aucune route de document : seules les routes de garnissage
    // d'interface sont touchées, et c'est vérifié par leur chemin, pas par leur nombre.
    const apresBanc = appels.slice(apresFabrication);
    const chemins = Array.from(new Set(apresBanc.map((a) => a.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0])));
    const ATTENDUS = ['/library-facets', '/library-stats', '/brand-kits'];
    const inattendus = chemins.filter((c) => ATTENDUS.indexOf(c) === -1);
    assert.deepEqual(inattendus, [],
      'seules les routes de garnissage d\'interface peuvent être appelées : ' + inattendus.join(', '));
    assert.equal(chemins.indexOf('/login'), -1, 'jamais la route de connexion');
    // ET AUCUN N'ABOUTIT. C'est ce qui prouve que la boucle ne dépend d'aucun d'eux : elle vient
    // de réussir alors que le Worker n'a rien accordé.
    assert.equal(chemins.indexOf('/fetch-image'), -1,
      'une fois l\'export relu, aucune image ne doit être redemandée : elles sont embarquées');
    const aboutis = appels.filter((a) => typeof a.statut === 'number' && a.statut >= 200 && a.statut < 300);
    assert.deepEqual(aboutis, [], 'aucun appel au Worker ne doit aboutir : ' + JSON.stringify(aboutis.slice(0, 2)));
    const statuts = Array.from(new Set(appels.map((a) => String(a.statut))));
    console.log('      après la fabrication : ' + apresBanc.length + ' appel(s) sur ' + chemins.length
      + ' route(s) — ' + (chemins.join(', ') || 'aucune'));
    console.log('      statuts obtenus : ' + statuts.join(', ') + ' — aucun n\'aboutit, et la boucle a réussi quand même.');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    pass('le Worker n\'accorde rien — aucun appel abouti, jamais /login — et la boucle entière'
      + ' a réussi malgré cela.');

    fs.rmSync(telechargements, { recursive: true, force: true });
    console.log('\nPASS verify-banc-sans-connexion — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
