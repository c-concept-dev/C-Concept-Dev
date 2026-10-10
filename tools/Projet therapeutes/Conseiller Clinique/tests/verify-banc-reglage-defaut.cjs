// LE RÉGLAGE QUE LA PAGE EMPLOIE VRAIMENT — et non celui qu'elle annonce.
//
// LE DÉFAUT QUE CE TEST REND IMPOSSIBLE. Le moteur avait le mode vidéo (d) pour défaut, et je
// l'avais annoncé comme tel. La page du banc, elle, envoyait « scène du lecteur » et « typo x1 »
// de façon EXPLICITE, ce qui écrasait ce défaut sans que rien ne le dise : elle rendait (a) en
// affichant deux listes dont les valeurs de départ n'avaient jamais été rapprochées de la
// décision du 6 octobre. Christophe l'a vu sur ses propres images — un corps de texte à 20 px
// là où (d) en donne 42 — c'est-à-dire par la mesure, pas par la lecture du code.
//
// Ce test vérifie ce que la page OBTIENT, pas ce qu'elle déclare : il rend des images par le
// bouton réel et lit la scène et l'échelle employées.
//
//   NODE_PATH=<playwright> node tests/verify-banc-reglage-defaut.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
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
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');

    // ── 1. Un seul sélecteur, quatre réglages, (d) choisi au départ ───────────────────────────
    const sel = await page.evaluate(() => {
      const s = document.getElementById('bc-reglage');
      return { existe: !!s, valeur: s && s.value,
               options: s ? Array.from(s.options).map((o) => o.value) : [],
               libelle: s ? s.options[s.selectedIndex].textContent : null,
               plancher: (document.getElementById('bc-plancher') || {}).value,
               anciens: !!document.getElementById('bc-scene') || !!document.getElementById('bc-typo') };
    });
    assert.equal(sel.existe, true, 'la page doit porter un sélecteur de réglage');
    // DÉCISION DU 9 OCTOBRE : le défaut est la scène par diapositive. Les quatre scènes fixes
    // restent atteignables pour comparer, et elles DISENT qu'elles sont fixes.
    assert.deepEqual(sel.options, ['auto', 'a', 'b', 'c', 'd'],
      'le défaut « auto » plus les quatre scènes fixes : ' + sel.options.join(','));
    assert.equal(sel.valeur, 'auto', '« auto » doit être choisi au départ : ' + sel.valeur);
    assert.match(sel.libelle, /SCÈNE PAR DIAPOSITIVE/, 'libellé : ' + sel.libelle);
    assert.equal(sel.anciens, false, 'les deux anciennes listes, qui écrasaient le défaut, doivent avoir disparu');
    assert.equal(sel.plancher, '2', 'le plancher de lisibilité par défaut est 2,0 % : ' + sel.plancher);
    pass('un seul sélecteur, « auto » au départ, plancher à ' + sel.plancher + ' % — ' + sel.libelle.trim());

    // ── 2. CE QUE LA PAGE OBTIENT, en rendant vraiment ────────────────────────────────────────
    await page.click('#bc-rendre');
    await page.waitForFunction(() => /terminé/.test(document.getElementById('bc-etat').textContent), { timeout: 120000 });
    const recap = await page.$$eval('#bc-recap tr', (r) => r.map((x) => x.cells[0].textContent + ' = ' + x.cells[1].textContent));
    const trouve = (c) => recap.find((l) => l.indexOf(c) === 0) || '';
    // CE QUE LA PAGE OBTIENT doit être ce qu'elle annonce. Le 7 octobre, elle annonçait (d) et
    // rendait (a) : c'est ce contrôle qui l'aurait vu, et c'est pourquoi il lit le RELEVÉ.
    assert.match(trouve('scène'), /UNE PAR DIAPOSITIVE/,
      'la page doit rendre avec une scène par diapositive : ' + trouve('scène'));
    assert.match(trouve('plancher de lisibilité'), /2 %/,
      'et au plancher annoncé : ' + trouve('plancher de lisibilité'));
    assert.match(trouve('échelle typographique'), /aucune/,
      'le texte reste tel quel : ' + trouve('échelle typographique'));
    assert.ok(recap.some((l) => /^ {2}diapositive 1/.test(l)),
      'le relevé doit détailler la scène de chaque diapositive : '
      + recap.filter((l) => /diapositive/.test(l)).join(' | '));
    // LA COLONNE NOMME CE QU'ELLE MESURE : « corps NN px, soit X % », et non « texte X % » pour
    // une valeur qui mesurait le titre. La taille en pixels est dans la ligne, donc le lecteur
    // peut refaire le calcul — c'est ainsi que Christophe a trouvé l'erreur.
    const lignesDiapo = recap.filter((l) => /^ {2}diapositive /.test(l));
    lignesDiapo.forEach((l) => {
      assert.match(l, /corps \d+(\.\d+)? px, soit \d+(\.\d+)? % de la hauteur du cadre/,
        'la ligne doit nommer la taille du corps et son pourcentage : ' + l);
    });
    // LE TRAVELLING A SA LIGNE, lui aussi. La présentation du départ tient dans son cadre à
    // chaque étape — c'est tout l'objet de la scène par diapositive — donc la page doit
    // DIRE qu'il n'y a rien à faire défiler, et non taire la question.
    assert.match(trouve('travellings'), /aucun/,
      'la page doit dire ce qu\'il y a à faire défiler : ' + trouve('travellings'));
    assert.match(trouve('format'), /image\/png/, 'PNG par défaut : ' + trouve('format'));
    assert.match(trouve('citations et sources'), /visibles/, 'citations visibles par défaut (décision en attente)');
    console.log('      ' + trouve('scène'));
    console.log('      ' + trouve('plancher de lisibilité') + '   |   ' + trouve('échelle typographique'));
    recap.filter((l) => /^ {2}diapositive/.test(l)).forEach((l) => console.log('      ' + l));
    pass('la page REND bien avec une scène par diapositive, lue dans le relevé.');

    // ── 3. Le réglage (a) reste atteignable, et donne l'ancien rendu ──────────────────────────
    await page.selectOption('#bc-reglage', 'a');
    // L'état porte encore « terminé » du rendu précédent : sans le vider, l'attente se satisfait
    // aussitôt et on relirait l'ancien tableau. Mesuré — le contrôle échouait sur un tableau vide.
    await page.evaluate(() => { document.getElementById('bc-etat').textContent = ''; });
    await page.click('#bc-rendre');
    await page.waitForFunction(() => /terminé/.test(document.getElementById('bc-etat').textContent), { timeout: 120000 });
    const recapA = await page.$$eval('#bc-recap tr', (r) => r.map((x) => x.cells[0].textContent + ' = ' + x.cells[1].textContent));
    const trouveA = (c) => recapA.find((l) => l.indexOf(c) === 0) || '';
    assert.match(trouveA('scène puis sortie'), /1422x800/, 'réglage (a) : ' + trouveA('scène puis sortie'));
    assert.match(trouveA('échelle typographique'), /aucune/, 'et sans échelle : ' + trouveA('échelle typographique'));
    pass('le réglage (a) reste disponible et rend bien 1422x800 sans échelle.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    pass('aucune erreur de page.');
    console.log('\nPASS verify-banc-reglage-defaut — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
