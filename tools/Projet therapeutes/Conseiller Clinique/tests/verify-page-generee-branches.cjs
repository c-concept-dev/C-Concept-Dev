// D2 — LES AUTRES CHEMINS DE LA PAGE CRÉÉE PAR LE STUDIO.
//
// verify-page-generee.cjs suit le chemin heureux : une phrase, un aperçu, une insertion. Ici on
// prend les chemins qu'on emprunte quand ça se passe moins bien, et celui qu'on emprunte quand
// on ne sait pas quoi demander :
//
//   1. CHAMP VIDE : le Studio propose d'après les diapositives voisines. Le texte des voisines
//      doit réellement partir dans l'appel, sinon « proposer d'après les voisines » est un mot.
//   2. ÉCHEC DE L'APPEL : rien n'est inséré, et le message le dit.
//   3. REFAIRE : un second appel part, et le document n'a toujours pas bougé.
//   4. ABANDONNER : rien n'est inséré, et le panneau se ferme.
//
//   NODE_PATH=<playwright> node tests/verify-page-generee-branches.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION, PAGE_SIMULEE } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const etat = { appels: [], refuser: false };
  const s = http.createServer((q, r) => {
    if (q.method === 'POST') {
      let corps = '';
      q.on('data', (c) => { corps += c; });
      q.on('end', () => {
        if (q.url !== '/') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
        etat.appels.push(corps);
        if (etat.refuser) { r.writeHead(500, { 'content-type': 'application/json' });
                            return r.end(JSON.stringify({ error: 'panne simulée' })); }
        r.writeHead(200, { 'content-type': 'application/json' });
        return r.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_new_slide', input: PAGE_SIMULEE }] }));
      });
      return;
    }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  let coupees = 0;
  const reponsesDehors = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    coupees++; return route.abort();
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!(u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))) reponsesDehors.push(r.status());
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);
  const dialogues = [];
  page.on('dialog', (d) => { dialogues.push(d.message()); d.dismiss().catch(() => {}); });

  const ouvrir = () => page.evaluate(async (d) => {
    const cle = 'branches';
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    await window.adocOpenWorkspace(cle);
    return window._adocArtifacts[cle]._adocStructuredDoc.blocks.length;
  }, PRESENTATION);
  const nbCartes = () => page.evaluate(() => window._adocArtifacts['branches']._adocStructuredDoc.blocks.length);
  const ouvrirLeFormulaire = async (direction) => {
    await page.evaluate(() => {
      const d = window._adocArtifacts['branches']._adocStructuredDoc;
      document.getElementById(d.blocks[2].content.blocks[0].id)?.click();
    });
    await page.waitForTimeout(350);
    const libelle = direction === 'end' ? 'Ajouter une page à la fin'
                  : direction === 'before' ? 'Insérer une page avant' : 'Insérer une page après';
    await page.getByRole('button', { name: new RegExp('^' + libelle + '$') }).click();
    await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
  };
  const cliquer = (t) => page.evaluate((lib) => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === lib);
    if (!b) throw new Error('bouton introuvable : ' + lib);
    b.click();
  }, t);

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    assert.equal(await ouvrir(), 5, 'cinq diapositives au départ');

    // ── 1. CHAMP VIDE : LE STUDIO PROPOSE D'APRÈS LES VOISINES ────────────────────────────
    await ouvrirLeFormulaire('after');
    etat.appels.length = 0;
    await cliquer('Créer la page');
    await page.waitForSelector('[data-page-apercu]', { timeout: 30000 });
    assert.equal(etat.appels.length, 1, 'un seul appel : ' + etat.appels.length);
    const envoye = JSON.parse(etat.appels[0]).payload;
    assert.ok(/propose toi-même le sujet/i.test(envoye.system || ''),
      'champ vide : le prompt doit demander au Studio de proposer le sujet');
    // Le texte des voisines part vraiment : on va chercher une phrase qui n'existe que là.
    const phraseVoisine = PRESENTATION.blocks[2].content.blocks
      .map((b) => b.content && b.content.text).filter(Boolean)[0];
    assert.ok(phraseVoisine && (envoye.system || '').includes(phraseVoisine.slice(0, 40)),
      'le texte des diapositives voisines doit réellement partir dans l\'appel');
    assert.ok(/aucune référence bibliographique/i.test(envoye.system || ''),
      'la consigne « aucune référence bibliographique » doit être présente');
    pass('champ vide : le Studio propose, et le texte des voisines part réellement dans l\'appel.');

    // ── 2. REFAIRE : UN SECOND APPEL, ET LE DOCUMENT N'A PAS BOUGÉ ────────────────────────
    await cliquer('Refaire');
    await page.waitForTimeout(800);
    assert.equal(etat.appels.length, 2, '« Refaire » doit relancer un appel : ' + etat.appels.length);
    assert.equal(await nbCartes(), 5, '« Refaire » ne doit rien insérer : ' + await nbCartes());
    pass('« Refaire » relance l\'appel et n\'insère toujours rien.');

    // ── 3. ABANDONNER : RIEN N'EST INSÉRÉ, LE PANNEAU SE FERME ────────────────────────────
    await page.waitForSelector('[data-page-apercu]', { timeout: 30000 });
    await cliquer('Abandonner');
    await page.waitForTimeout(400);
    assert.equal(await nbCartes(), 5, '« Abandonner » ne doit rien insérer');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-page-apercu]').length), 0,
      '« Abandonner » doit fermer l\'aperçu');
    assert.equal(await page.evaluate(() => window._adocPageInsertState === null), true,
      '« Abandonner » doit oublier la page en attente');
    pass('« Abandonner » n\'insère rien et ferme l\'aperçu.');

    // ── 4. L'APPEL ÉCHOUE : RIEN N'EST INSÉRÉ, ET LE MESSAGE LE DIT ───────────────────────
    etat.refuser = true;
    await ouvrirLeFormulaire('end');
    await cliquer('Créer la page');
    await page.waitForFunction(() => {
      const r = document.querySelector('.cc-block-edit-result');
      return r && /impossible/i.test(r.textContent || '');
    }, { timeout: 30000 });
    const message = await page.evaluate(() => document.querySelector('.cc-block-edit-result').textContent);
    assert.equal(await nbCartes(), 5, 'un appel qui échoue n\'insère rien : ' + await nbCartes());
    assert.ok(/Rien n’a été inséré|Rien n'a été inséré/.test(message),
      'le message doit dire que rien n\'a été inséré : ' + JSON.stringify(message.slice(0, 160)));
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-page-apercu]').length), 0,
      'aucun aperçu après un échec');
    // « Rien n'est inséré » ne suffit pas : il ne doit rien rester D'INSÉRABLE non plus. Une
    // falsification l'a montré — on pouvait armer une page de secours après l'échec sans que ce
    // contrôle bronche, parce qu'aucun bouton ne l'insérait à cet instant. Une page armée en
    // silence finit par entrer.
    assert.equal(await page.evaluate(() => {
      const ps = window._adocPageInsertState; return ps ? !!ps.page : false; }), false,
      'après un échec, aucune page ne doit rester armée');
    pass('appel en échec : rien n\'est inséré, et le message le dit — « ' + message.trim().slice(0, 70) + '… »');

    assert.equal(reponsesDehors.length, 0,
      'aucune réponse ne doit venir de l\'extérieur ; ' + reponsesDehors.length
      + ' reçue(s) pour ' + coupees + ' tentative(s) coupée(s)');
    pass('réseau : ' + coupees + ' tentative(s) coupées, 0 réponse venue du dehors.');
  } finally {
    await ctx.close(); await nav.close(); s.close();
  }
  console.log('\nPASS verify-page-generee-branches — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
