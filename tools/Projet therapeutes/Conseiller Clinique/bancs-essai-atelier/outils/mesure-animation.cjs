// L'ANIMATION DE NOMBRE — ce que capturent la référence et SnapDOM à 0, 300 et 800 ms après la
// révélation d'un bloc.
//
// CE QUE J'AVAIS MANQUÉ, et que ce banc corrige : adocPresentAnimateNumberIfEligible anime 700 ms
// en requestAnimationFrame tout bloc de texte simple dont le texte commence par un chiffre, à
// l'entrée de la diapositive ET à chaque bloc révélé. Mes premières fixtures n'avaient aucun bloc
// numérique : rien n'animait, et j'en avais conclu à tort qu'il n'y avait pas d'animation
// (adocPresentUpdateCounter, que j'avais regardé, n'est que le compteur « 3 / 10 »).
//
// LA PREUVE EST DANS LE TEXTE, pas dans l'image : l'animation écrit des valeurs intermédiaires
// dans le span. On relève donc le texte rendu en même temps que la capture — une image « presque
// juste » ne se voit pas à l'œil, un « 15.8 % » au lieu de « 37 % » se lit.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const DELAIS = [0, 300, 800];
const FENETRE = { width: 1596, height: 898 };

async function mesurer(moteur, avecSnapdom) {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw[moteur].launch();
  const releve = [];
  for (const delai of DELAIS) {
    const page = await nav.newPage({ viewport: FENETRE });
    await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('http://127.0.0.1:' + port + '/entrees/nombres.html');
    await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    if (avecSnapdom) await page.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    // On repart de l'entrée : le PREMIER bloc est animé dès l'ouverture, c'est le cas le plus
    // exposé (aucune frappe ne l'a précédé, donc aucun temps mort n'a absorbé l'animation).
    await page.waitForTimeout(delai);
    const vu = await page.evaluate(async (a) => {
      const inner = document.getElementById('cc-ws-present-slide-inner');
      const textes = [...inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block .adoc-sc-block-text')]
        .map((e) => (e.textContent || '').trim().slice(0, 42));
      let capture = null;
      if (a.snap) {
        const s = await window.__snapdom(inner, { scale: 1 });
        capture = (await s.toPng()).src.length;
      }
      return { textes, octets_capture: capture };
    }, { snap: avecSnapdom });
    const nom = 'nombres-' + moteur + (avecSnapdom ? '-snapdom' : '-ref') + '-t' + delai + '.png';
    if (!avecSnapdom) await (await page.$('#cc-ws-present-slide-inner')).screenshot({ path: path.join(RACINE, 'images', nom) });
    releve.push({ delai_ms: delai, textes: vu.textes, image: avecSnapdom ? null : nom });
    await page.close();
  }
  await nav.close(); serveur.close();
  return releve;
}

(async () => {
  const attendus = ['37 %', '2,5 fois', '18 mois'];
  const tout = {};
  for (const [etiquette, moteur, snap] of [['référence WebKit', 'webkit', false], ['SnapDOM dans WebKit', 'webkit', true]]) {
    const r = await mesurer(moteur, snap);
    tout[etiquette] = r;
    console.log(etiquette.toUpperCase());
    for (const x of r) {
      const premier = x.textes[0] || '';
      const juste = premier.startsWith(attendus[0]);
      console.log('  t+' + String(x.delai_ms + ' ms').padEnd(8)
        + (juste ? 'valeur FINALE   ' : 'valeur en cours ') + '« ' + premier + ' »');
    }
    console.log('');
  }
  // Le verdict : à partir de quel délai la valeur finale est-elle écrite ?
  const ref = tout['référence WebKit'];
  const premierBon = ref.filter((x) => (x.textes[0] || '').startsWith(attendus[0])).map((x) => x.delai_ms)[0];
  console.log('  l\'animation dure 700 ms (lue dans adocPresentAnimateNumberIfEligible).');
  console.log('  valeur finale écrite à partir de : ' + (premierBon != null ? 't+' + premierBon + ' ms' : 'jamais dans la fenêtre mesurée'));
  console.log('  → délai d\'attente à fixer : 800 ms (700 ms d\'animation + une image de marge)');
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-animation.json'), JSON.stringify({
    fonction: 'adocPresentAnimateNumberIfEligible', duree_animation_ms: 700,
    applique: 'premier bloc à l\'entrée, et chaque bloc révélé, pour tout bloc de texte simple commençant par un chiffre',
    delais_mesures_ms: DELAIS, valeurs_attendues: attendus,
    delai_retenu_ms: 800, releve: tout }, null, 2), 'utf8');
})();
