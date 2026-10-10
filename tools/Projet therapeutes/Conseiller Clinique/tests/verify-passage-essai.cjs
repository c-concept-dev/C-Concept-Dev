// LE PASSAGE HUMAIN DU LOT 1a, ÉPROUVÉ EN ENTIER SUR LA PRÉSENTATION D'ESSAI.
//
// narration tapée au clavier → document de travail (JSON) → rechargement → export HTML autonome.
// Le mot-témoin ne doit JAMAIS apparaître dans un export : la narration est une note de travail.
//
// Le chemin est celui de Christophe, pas un raccourci : champ de fichier réel, boutons réels,
// frappe au clavier réelle, et la question posée au navigateur est « qui recevrait le clic ? ».
//
//   NODE_PATH=<playwright> node tests/verify-passage-essai.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const ESSAI = path.join(RACINE, 'banc-chutier', 'entrees', 'presentation-essai-sans-citation.html');
const TEMOIN = 'TEMOIN-NARRATION-20261008';
const TEXTE = 'Ici je ralentis et je laisse le silence durer. ' + TEMOIN;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  assert.ok(fs.existsSync(ESSAI), 'présentation d\'essai absente — lancez d\'abord '
    + 'node tests/forger-presentation-essai.cjs');
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    page.on('dialog', (d) => d.accept());
    const BANC = 'http://127.0.0.1:' + port + '/banc-chutier/chutier.html?atelier-local=1';
    await page.goto(BANC, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('bc-export') !== null);

    // ── 1. L'export d'essai se charge, et ne porte aucune narration ──────────────────────────
    await page.setInputFiles('#bc-export', ESSAI);
    await page.waitForFunction(() => /Export lu/.test(document.getElementById('bc-etat').textContent),
      { timeout: 30000 });
    const lu = await page.evaluate(() => document.getElementById('bc-etat').textContent.replace(/\s+/g, ' '));
    assert.match(lu, /narration : AUCUNE/, 'un export ne porte jamais de narration : ' + lu);
    pass('export d\'essai chargé, sans connexion — ' + (lu.match(/(\d+) diapositives, (\d+) étapes/) || []).slice(1).join(' diapositives, ') + ' étapes.');

    // ── 2. Espace de travail, panneau réduit, champ Narration ATTEINT ────────────────────────
    await page.click('#bc-atelier');
    await page.waitForFunction(() => /espace de travail/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    await page.click('#bc-reduire');
    await page.waitForTimeout(400);
    const vue = await page.evaluate(async () => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId) || document.getElementById('root:card-title:' + e.cardId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 400));
      const champ = document.querySelector('[data-editor-narration]');
      if (!champ) return { erreur: 'champ absent' };
      champ.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 300));
      const r = champ.getBoundingClientRect();
      const dessus = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { atteint: dessus === champ || (dessus && champ.contains(dessus)),
               libelle: (document.querySelector('.cc-editor-narration-etape') || {}).textContent,
               etapes: window.adocPresentStepList(d).length };
    });
    assert.equal(vue.erreur, undefined, vue.erreur);
    assert.equal(vue.atteint, true, 'le champ Narration doit être atteint par le pointeur');
    pass('panneau réduit : champ Narration atteint — ' + (vue.libelle || '').trim());

    // ── 3. La narration est tapée AU CLAVIER ─────────────────────────────────────────────────
    await page.click('[data-editor-narration]');
    await page.keyboard.type(TEXTE);
    const ecrit = await page.evaluate(() => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      return { n: (d.narration || []).length, texte: (d.narration || [])[0] && d.narration[0].text };
    });
    assert.equal(ecrit.n, 1, 'la narration doit entrer dans le document');
    assert.equal(ecrit.texte, TEXTE);
    pass('narration tapée au clavier et portée par le document.');

    // ── 4. Le document de travail la porte ───────────────────────────────────────────────────
    await page.evaluate(() => { document.getElementById('banc-chutier').style.display = ''; });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bc-telecharger')]);
    const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    assert.equal((json.narration || []).length, 1, 'le document de travail doit porter la narration');
    assert.equal(json.narration[0].text, TEXTE);
    pass('document de travail téléchargé (' + dl.suggestedFilename() + '), narration comprise.');

    // ── 5. Rechargé, il rend la narration ────────────────────────────────────────────────────
    const chemin = await dl.path();
    await page.goto(BANC, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('bc-fichier') !== null);
    await page.setInputFiles('#bc-fichier', chemin);
    await page.waitForFunction(() => /Chargé|Document lu|JSON/.test(document.getElementById('bc-etat').textContent),
      { timeout: 30000 });
    await page.click('#bc-atelier');
    await page.waitForFunction(() => /espace de travail/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    const rendu = await page.evaluate(async () => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId) || document.getElementById('root:card-title:' + e.cardId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 400));
      const z = document.querySelector('[data-editor-narration]');
      return { dansLeDoc: (d.narration || []).length, dansLEditeur: z ? z.value : null };
    });
    assert.equal(rendu.dansLeDoc, 1, 'le document rechargé doit porter la narration');
    assert.equal(rendu.dansLEditeur, TEXTE, 'et l\'éditeur doit l\'afficher : ' + rendu.dansLEditeur);
    pass('rechargé, le document de travail rend la narration à l\'éditeur.');

    // ── 6. LES DEUX EXPORTS : contrôle qualité passé, et AUCUN mot-témoin ────────────────────
    const exports = await page.evaluate(async () => {
      const art = window._adocArtifacts['banc'];
      const doc = art._adocStructuredDoc;
      const controle = await window.adocExportClinicalDocumentHTML(doc, art._adocStructuredSnapshot, null);
      const autonome = await window.adocBuildStandalonePresentationHTML(doc, {});
      return {
        bloque: !!controle.blocked,
        bloquant: (controle.qc && controle.qc.blocking) || [],
        htmlControle: controle.html || '',
        htmlAutonome: autonome,
        imagesEmbarquees: (window._adocLastExportImageReport || {}).telecharges,
        echecsImages: ((window._adocLastExportImageReport || {}).echecs || []).length,
      };
    });
    assert.equal(exports.bloque, false, 'export bloqué : ' + exports.bloquant.join(' | '));
    assert.deepEqual(exports.bloquant, [], 'aucune ligne bloquante attendue sans citation');
    pass('contrôle qualité passé sur le document rechargé : 0 ligne bloquante.');

    assert.equal(exports.htmlControle.indexOf(TEMOIN), -1, 'le mot-témoin ne doit PAS être dans l\'export contrôlé');
    assert.equal(exports.htmlAutonome.indexOf(TEMOIN), -1, 'le mot-témoin ne doit PAS être dans l\'export autonome');
    // Le témoin du témoin : le mot EST bien dans le document de travail, donc son absence de
    // l'export veut dire quelque chose.
    assert.ok(JSON.stringify(json).indexOf(TEMOIN) !== -1,
      'le mot-témoin doit être dans le document de travail, sinon son absence de l\'export ne prouve rien');
    // PAS dans entrees/ : c'est le dossier où Christophe choisit ses documents à charger, et un
    // fichier de vérification n'a rien à y faire.
    const sortie = path.join(RACINE, 'banc-chutier', 'verifications', 'essai-reexport-verification.html');
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, exports.htmlAutonome);
    pass('mot-témoin présent dans le document de travail, ABSENT des deux exports.');

    console.log('\n      export autonome réexporté pour vérification à la main :\n        ' + sortie);
    console.log('      images réembarquées en mode local : ' + (exports.imagesEmbarquees || 0)
      + ' (échecs : ' + exports.echecsImages + ') — sans Worker, les photos ne se réembarquent pas.');
    console.log('\n      LE GREP EXACT, à lancer par Christophe :');
    console.log('        grep -c "' + TEMOIN + '" "' + sortie + '"');
    console.log('      il doit répondre  0  — et sur le document de travail :');
    console.log('        grep -c "' + TEMOIN + '" ~/Downloads/' + dl.suggestedFilename());
    console.log('      il doit répondre  1');
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nPASS verify-passage-essai — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
