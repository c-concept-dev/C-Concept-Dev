// LA PAGE D'ESSAI STATIQUE (tests/preparer-essai.html) FAIT-ELLE CE QU'ELLE DIT ?
//
// Lu sur la VRAIE page du Studio, servie par le VRAI relais lancé SANS CLÉ : aucun appel ne peut
// partir, et aucune dépense n'est possible. Ce que ce contrôle mesure :
//
//   1. Un seul clic suffit : cinq diapositives dans l'éditeur, et les trois gestes de page.
//   2. AUCUNE requête ne sort de l'origine du relais, hormis les ressources de la page
//      (cdnjs, polices Google) — en particulier AUCUNE vers le vrai Worker. C'est le défaut
//      que cette page existe pour corriger : par la console, le Studio démarrait avant que
//      `workerUrl` ne soit posé et appelait le Worker réel deux fois.
//   3. `persist: false` est bien posé : rien de cet essai ne peut écrire dans la base.
//
//   NODE_PATH=<playwright> node tests/verify-page-preparation-essai.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');

const RELAIS = require('node:os').homedir()
  + '/Documents/Studio-Clinique-Outils/relais-essai-lot2c.py';
const ORIGINE = 'http://127.0.0.1:8777';
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

const attendreLePort = () => new Promise((ok, ko) => {
  const depart = Date.now();
  (function essayer() {
    const s = net.connect(8777, '127.0.0.1');
    s.on('connect', () => { s.destroy(); ok(); });
    s.on('error', () => { s.destroy();
      if (Date.now() - depart > 20000) return ko(new Error('le relais n\'a pas démarré'));
      setTimeout(essayer, 150); });
  })();
});

(async () => {
  const relais = spawn('python3', ['-u', RELAIS, '--sans-cle'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const journal = [];
  relais.stdout.on('data', (d) => journal.push(String(d)));
  await attendreLePort();
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  // Toutes les requêtes de TOUS les onglets, comptées par hôte. On ne garde que l'hôte :
  // jamais une adresse complète dans une sortie qui peut finir dans un rapport.
  const parHote = {};
  const interne = (u) => u.startsWith(ORIGINE + '/') || u.startsWith('data:') || u.startsWith('blob:');
  ctx.on('request', (r) => {
    if (interne(r.url())) return;
    let h = '?';
    try { h = new URL(r.url()).host; } catch (e) {}
    parHote[h] = (parHote[h] || 0) + 1;
  });
  // RIEN NE SORT DE LA MACHINE pendant ce contrôle, ni pendant sa falsification. Une mutation
  // qui retire l'étape (a) rendrait le Studio à son adresse par défaut : sans ce garde, la
  // falsification enverrait de vraies requêtes au Worker. Elles sont donc COUPÉES — et comptées
  // quand même, puisque le compteur ci-dessus voit la requête avant son abandon.
  await ctx.route('**/*', (route) => interne(route.request().url()) ? route.continue() : route.abort());
  try {
    const prep = await ctx.newPage();
    await prep.goto(ORIGINE + '/preparer-essai.html');
    assert.ok(await prep.getByRole('button', { name: /Préparer et ouvrir l’essai/ }).isVisible(),
      'la page d\'essai doit offrir son bouton');

    // ── 1. UN SEUL CLIC ────────────────────────────────────────────────────────────────────
    const [studio] = await Promise.all([
      ctx.waitForEvent('page'),
      prep.getByRole('button', { name: /Préparer et ouvrir l’essai/ }).click(),
    ]);
    await studio.waitForLoadState('domcontentloaded');
    // ── ATTENDRE QUELQUE CHOSE QUI SE PRODUIT VRAIMENT ────────────────────────────────────
    // Première version : j'attendais `#cc-ws-doc-card`. Cet élément est STATIQUE dans
    // studio-clinique.html (ligne 3957, vide) : la condition était vraie dès l'analyse du HTML
    // et ne prouvait rien. Le contrôle courait devant la page d'essai, et ne la jugeait pas.
    // On attend donc, d'abord, que la page d'essai DISE qu'elle a fini — c'est elle qu'on juge —
    // puis que le document soit réellement rendu dans la carte.
    await prep.waitForFunction(() => /Prêt\./.test(document.getElementById('etat').textContent || ''),
      { timeout: 60000 });
    await studio.waitForFunction(
      () => !!document.querySelector('#cc-ws-doc-card .adoc-sc-card, #cc-ws-doc-card .adoc-sc-cover'),
      { timeout: 60000 });
    const vu = await studio.evaluate(() => {
      const art = window._adocArtifacts['essai'];
      const d = art._adocStructuredDoc;
      return { diapositives: d.blocks.length, titre: d.title,
               etapes: window.adocPresentStepList(d).length,
               persist: art._adocCapabilities.persist,
               url: localStorage.getItem('workerUrl'),
               cle: localStorage.getItem('workerApiKey') };
    });
    assert.equal(vu.diapositives, 5, 'cinq diapositives : ' + vu.diapositives);
    assert.equal(vu.etapes, 8, 'huit étapes : ' + vu.etapes);
    assert.equal(vu.url, ORIGINE, 'workerUrl doit viser le relais : ' + vu.url);

    await studio.evaluate(() => {
      const d = window._adocArtifacts['essai']._adocStructuredDoc;
      document.getElementById(d.blocks[2].content.blocks[0].id)?.click();
    });
    await studio.waitForTimeout(500);
    const gestes = await studio.evaluate(() => {
      const p = document.querySelector('.cc-block-edit-controls');
      return p ? [...p.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
        .filter((t) => /page/i.test(t)) : [];
    });
    assert.equal(gestes.length, 3, 'les trois gestes de page : ' + JSON.stringify(gestes));
    pass('un seul clic : « ' + vu.titre + ' », ' + vu.diapositives + ' diapositives, '
      + vu.etapes + ' étapes, et les trois gestes — ' + JSON.stringify(gestes));

    // ── 2. RIEN NE SORT, SAUF LES RESSOURCES ───────────────────────────────────────────────
    // Les ressources de la page sont connues et sans rapport avec le Worker. Tout autre hôte
    // — et le Worker au premier chef — est un échec : c'est le défaut que cette page corrige.
    const RESSOURCES = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
    const intrus = Object.keys(parHote).filter((h) => RESSOURCES.indexOf(h) < 0);
    assert.deepEqual(intrus, [],
      'aucun hôte hors des ressources de la page ; vus : ' + JSON.stringify(intrus));
    pass('aucune requête vers le Worker : seuls ' + (Object.keys(parHote).sort().join(', ') || '(aucun hôte)')
      + ' sont visés, et ce sont les ressources de la page — toutes coupées, rien n\'a quitté la machine.');

    // ── 3. AUCUNE ÉCRITURE POSSIBLE ────────────────────────────────────────────────────────
    assert.equal(vu.persist, false, 'persist doit valoir false : ' + vu.persist);
    assert.notEqual(vu.cle, null, 'une valeur factice doit être posée');
    assert.ok(/factice/i.test(vu.cle || ''), 'la valeur posée doit se dire factice');
    pass('persist: false, et la valeur d\'accès du navigateur se dit factice.');
  } finally {
    await nav.close();
    relais.kill('SIGTERM');
  }
  console.log('\nPASS verify-page-preparation-essai — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
