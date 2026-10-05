// COMPLÉMENT 2, POINT 2 — SNAPDOM SUR UN CONTENEUR DONT LA MISE EN PAGE FAIT 1920x1080.
//
// Ce qui est établi : SnapDOM lit la MISE EN PAGE de l'élément visé, jamais son rendu. Son option
// `scale` agrandit donc une rastérisation faite à 1x. D'où l'expérience : viser un conteneur dont
// la mise en page fait RÉELLEMENT 1920x1080, et qui contient la diapositive agrandie par
// transform: scale(). Si SnapDOM applique la transformation interne en rastérisant à 1x, le texte
// doit être net à 1920 — et le chemin devient utilisable dans le Safari réel.
//
// COMPARAISON À TAILLE ÉGALE UNIQUEMENT : la référence du moteur est prise à 1920x1080 elle aussi
// (fenêtre 2094x1178, mesurée au complément précédent). Comparer 1422 à 1920 ne voudrait rien dire.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { PNG } = require('pngjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const SEUIL = 60;
const CIBLE = { l: 1920, h: 1080 };
const MISE_EN_PAGE = { l: 1422, h: 800 };

function contours(fichier) {
  const p = PNG.sync.read(fs.readFileSync(fichier));
  const y0 = Math.round(p.height * 0.25), y1 = Math.round(p.height * 0.75);
  let francs = 0, total = 0, somme = 0, pic = 0;
  for (let y = y0; y < y1; y++) for (let x = 1; x < p.width; x++) {
    const i = (y * p.width + x) * 4, j = i - 4;
    const g = Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i+1] - p.data[j+1]) + Math.abs(p.data[i+2] - p.data[j+2]);
    total++;
    if (g > SEUIL) { francs++; somme += g; if (g > pic) pic = g; }
  }
  return { taille: p.width + 'x' + p.height, densite: +(100 * francs / total).toFixed(3),
           gradient_moyen: +(somme / (francs || 1)).toFixed(1), pic, octets: fs.statSync(fichier).size };
}

async function ouvrir(nav, fenetre) {
  const page = await nav.newPage({ viewport: fenetre });
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  return page;
}

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const base = 'http://127.0.0.1:' + port + '/entrees/nombres.html';
  const I = (n) => path.join(RACINE, 'images', n);

  // ── (c) la référence : le MOTEUR rendant à 1920x1080 ────────────────────────────────────────
  let p = await ouvrir(nav, { width: 2094, height: 1178 });
  await p.goto(base);
  await p.evaluate(() => { const b = document.querySelector('#cc-ws-present-start button'); if (b) b.click(); });
  await p.waitForFunction(() => document.getElementById('cc-ws-present-overlay')
    && document.getElementById('cc-ws-present-overlay').classList.contains('open'));
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(800);
  const boite = await p.evaluate(() => {
    const r = document.getElementById('cc-ws-present-slide-inner').getBoundingClientRect();
    return Math.round(r.width) + 'x' + Math.round(r.height);
  });
  await (await p.$('#cc-ws-present-slide-inner')).screenshot({ path: I('n2-c-moteur-1920.png') });
  await p.close();

  // ── (e) SnapDOM sur un conteneur de mise en page 1920x1080 ──────────────────────────────────
  // POURQUOI flex:0 0 auto ET min-width/min-height SUR L'ENVELOPPE : sans eux, la mise en page de
  // l'enveloppe ne valait PAS 1920x1080 et la capture sortait en 1422x1080. Diagnostic mesuré :
  // #cc-ws-present-slide-outer est un conteneur flex, l'enveloppe en était un objet flexible, et
  // flex-shrink écrasait sa largeur — une enveloppe vide à qui on pose width:1920px en ligne
  // calculait 816,95px. Ni rognage par la fenêtre (le résultat est identique en 1596x898 et en
  // 2094x1178), ni règle !important (aucune règle de feuille de style n'atteint l'enveloppe).
  // L'assertion plus bas refuse la capture si la mise en page réelle n'est pas celle visée : une
  // enveloppe comprimée ne doit plus pouvoir se faire passer pour une enveloppe de 1920.
  p = await ouvrir(nav, { width: 2094, height: 1178 });
  await p.goto(base);
  await p.evaluate(() => { const b = document.querySelector('#cc-ws-present-start button'); if (b) b.click(); });
  await p.waitForFunction(() => document.getElementById('cc-ws-present-overlay')
    && document.getElementById('cc-ws-present-overlay').classList.contains('open'));
  await p.evaluate(async () => { window.__snapdom = (await import('/vendeur/snapdom.mjs')).snapdom; });
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(800);
  const r = await p.evaluate(async (a) => {
    const slide = document.getElementById('cc-ws-present-slide-inner');
    // Enveloppe AJOUTÉE AUTOUR de la diapositive, sans la détacher : sa mise en page fait
    // réellement 1920x1080, et la diapositive y est agrandie par transform. On remet tout en
    // place après la capture — le banc ne doit rien laisser derrière lui.
    const parent = slide.parentNode, suivant = slide.nextSibling;
    const env = document.createElement('div');
    env.id = '__enveloppe1920';
    env.style.cssText = 'width:' + a.cible.l + 'px;height:' + a.cible.h + 'px;'
      + 'min-width:' + a.cible.l + 'px;min-height:' + a.cible.h + 'px;flex:0 0 auto;'
      + 'position:relative;overflow:hidden;background:#000;';
    const ancienStyle = slide.getAttribute('style') || '';
    parent.insertBefore(env, suivant);
    env.appendChild(slide);
    slide.style.transformOrigin = 'top left';
    slide.style.transform = 'scale(' + (a.cible.l / a.mise.l) + ')';
    // Mise en page RÉELLEMENT obtenue, lue avant toute capture.
    const reelle = env.offsetWidth + 'x' + env.offsetHeight;
    const conforme = (env.offsetWidth === a.cible.l && env.offsetHeight === a.cible.h);
    let url = null, erreur = null;
    if (!conforme) {
      erreur = 'mise en page de l\'enveloppe non conforme : ' + reelle
        + ' au lieu de ' + a.cible.l + 'x' + a.cible.h + ' — capture refusée';
    } else {
      try {
        const s = await window.__snapdom(env, { scale: 1 });
        url = (await s.toPng()).src;
      } catch (e) { erreur = String(e && e.message || e); }
    }
    // remise en place
    parent.insertBefore(slide, env);
    slide.setAttribute('style', ancienStyle);
    env.remove();
    return { url, erreur, mise_en_page_enveloppe: reelle, conforme: conforme };
  }, { cible: CIBLE, mise: MISE_EN_PAGE });
  await p.close();
  await nav.close(); serveur.close();

  // Capture refusée ou en échec : on EFFACE la sortie précédente. Sans cela, un lancement raté
  // réaffiche le PNG d'un lancement antérieur et le tableau annonce une mesure qui n'a pas eu lieu.
  if (r.url) fs.writeFileSync(I('n2-e-snapdom-enveloppe1920.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  else if (fs.existsSync(I('n2-e-snapdom-enveloppe1920.png'))) fs.unlinkSync(I('n2-e-snapdom-enveloppe1920.png'));

  console.log('NETTETÉ À TAILLE ÉGALE — 1920x1080 des deux côtés');
  console.log('  (boîte rendue par le moteur à la fenêtre 2094x1178 : ' + boite + ')');
  console.log('');
  console.log('  chemin                                    taille      densité   gradient  pic   poids');
  const lignes = [];
  const ajoute = (etiquette, fichier) => {
    if (!fs.existsSync(fichier)) { console.log('  ' + etiquette.padEnd(42) + 'ABSENT'); return; }
    const c = contours(fichier);
    lignes.push({ chemin: etiquette, ...c });
    console.log('  ' + etiquette.padEnd(42) + c.taille.padEnd(12)
      + String(c.densite + ' %').padEnd(10) + String(c.gradient_moyen).padEnd(10)
      + String(c.pic).padEnd(6) + (c.octets / 1024).toFixed(0) + ' Ko');
  };
  ajoute('(c) le MOTEUR rendant à 1920', I('n2-c-moteur-1920.png'));
  ajoute('(e) SnapDOM, enveloppe de mise en page 1920', I('n2-e-snapdom-enveloppe1920.png'));
  ajoute('(b) SnapDOM scale 1.35 (rappel)', I('geo-scale_1920_1422.png'));
  if (r.erreur) console.log('  erreur SnapDOM : ' + r.erreur);
  const c = lignes.filter((x) => x.chemin.startsWith('(c)'))[0];
  const e = lignes.filter((x) => x.chemin.startsWith('(e)'))[0];
  if (c && e && e.taille === c.taille) {
    const ecart = +((e.gradient_moyen / c.gradient_moyen - 1) * 100).toFixed(1);
    console.log('');
    console.log('  → à taille égale, l\'enveloppe SnapDOM est ' + (ecart >= 0 ? 'PLUS' : 'MOINS')
      + ' franche de ' + Math.abs(ecart) + ' % que le moteur');
  } else if (e && c) {
    console.log('');
    console.log('  → tailles différentes (' + e.taille + ' contre ' + c.taille + ') : NON comparable');
  }
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-nettete-1920.json'),
    JSON.stringify({ seuil_contour: SEUIL, cible: CIBLE, mise_en_page_diapositive: MISE_EN_PAGE,
      boite_moteur_a_2094x1178: boite, enveloppe: r.mise_en_page_enveloppe,
      erreur_snapdom: r.erreur, lignes }, null, 2), 'utf8');
})();
