// ESSAI 2 — LES RÉFÉRENCES. Capture par le moteur lui-même (page.screenshot), qui sert d'étalon
// aux candidats SnapDOM et html-to-image.
//
// WEBKIT EST LA RÉFÉRENCE PRINCIPALE : c'est le moteur de Safari. Vérifié avant de m'y fier —
// le WebKit de Playwright annonce « Version/26.5 Safari/605.1.15 », donc proche du Safari 26.3 de
// Christophe, sans être le Safari réel (pas de Centre de contrôle, pas d'extensions, pas de
// politique de confidentialité de l'app).
//
// UNE ÉTAPE = (index de diapositive, revealIndex). Lu de window._adocPresentState, jamais compté
// à l'avance : adocPresentRevealNext/Prev sont de portée module et ne sont pas exposés, et
// window.adocPresentNext() épuise d'abord la révélation de la diapositive courante avant d'avancer
// — c'est donc LUI qui définit la suite des étapes. Une diapositive à un seul bloc a revealTotal 0
// et revealIndex null : une seule étape, conformément au brief.
//
// IL N'Y A AUCUNE ANIMATION DE COMPTEUR, contrairement à ce que supposait le brief :
// adocPresentUpdateCounter écrit son texte de façon synchrone. Ce qu'il faut attendre, c'est la
// transition de diapositive (~260 ms, setTimeout + transition CSS) et document.fonts.ready. Le
// repos de 320 ms est la règle maison déjà mesurée sur ce lecteur.
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');

const RACINE = __dirname;
const ENTREES = path.join(RACINE, 'entrees');
const IMAGES = path.join(RACINE, 'images');
const SELECTEUR = '#cc-ws-present-slide-inner';
// 800 ms, et non 320 : adocPresentAnimateNumberIfEligible anime 700 ms en requestAnimationFrame
// tout bloc de texte simple commençant par un chiffre. MESURÉ sur la fixture « nombres » : à
// t+0 ms la capture montre « 1 % », à t+300 ms « 16 % », et la valeur finale « 37 % » n'apparaît
// qu'à t+800 ms. Un repos de 320 ms produisait donc une image plausible portant un CHIFFRE FAUX —
// le pire défaut possible pour une présentation clinique. 700 ms d'animation + une image de marge.
const REPOS_MS = 800;
// FENÊTRE DE COMPARAISON, trouvée par la mesure et non choisie : #cc-ws-present-slide-inner a
// TOUJOURS 1422x800 en mise en page (offsetWidth/offsetHeight), tandis que sa boîte RENDUE varie
// avec la fenêtre — l'échelle est posée sur un ancêtre, pas sur lui. À 1920x1080 il est rendu à
// 1746x982 ; à 1596x898 la boîte rendue égale la mise en page, donc l'échelle vaut exactement 1.
// C'est la seule fenêtre où une capture de bibliothèque (qui lit la MISE EN PAGE) et une capture du
// moteur (qui lit le RENDU) produisent la même géométrie et sont donc comparables pixel à pixel.
// Mesuré : 1920x1080 → 1746x982 ; 1596x898 → 1422x800 ; 1500x860 → 1354x762.
const FENETRE = { width: 1596, height: 898 };
// Et la sortie visée pour le montage reste 1920x1080 : 1920/1422 = 1.3502 de rapport de pixels.
const RAPPORT_1920 = +(1920 / 1422).toFixed(4);
const { servir } = require('./outils/serveur.cjs');

async function etat(page) {
  return page.evaluate(() => {
    const s = window._adocPresentState;
    if (!s) return null;
    const el = document.getElementById('cc-ws-present-slide-inner');
    const carte = el && el.querySelector('.adoc-sc-card');
    return { index: s.index, revealIndex: s.revealIndex, revealTotal: s.revealTotal,
             diapositives: s.doc.blocks.length,
             boite: el ? { l: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null,
             // Débordement : mesuré sur la carte, qui est l'élément qui défile.
             deborde: carte ? (carte.scrollHeight - carte.clientHeight) : null,
             hauteur_contenu: carte ? carte.scrollHeight : null,
             hauteur_visible: carte ? carte.clientHeight : null };
  });
}

async function capturerUnJeu(moteur, nomMoteur, url, nomJeu) {
  const nav = await pw[moteur].launch();
  const page = await nav.newPage({ viewport: FENETRE });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  // Servi par http://127.0.0.1 : les modules ES de SnapDOM ne s'importent pas depuis file://,
  // et le brief demande de toute façon un banc ouvert sur localhost.
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(REPOS_MS);

  const etapes = [];
  let precedent = null, garde = 0;
  for (;;) {
    const e = await etat(page);
    if (!e) break;
    const cle = e.index + ':' + e.revealIndex;
    if (precedent === cle) break;                 // adocPresentNext n'a plus rien à faire
    precedent = cle;
    const t0 = Date.now();
    const nom = nomJeu + '-' + nomMoteur + '-ref-' + String(etapes.length).padStart(2, '0') + '.png';
    const el = await page.$(SELECTEUR);
    await el.screenshot({ path: path.join(IMAGES, nom) });
    const ms = Date.now() - t0;
    const octets = fs.statSync(path.join(IMAGES, nom)).size;
    etapes.push({ etape: etapes.length, index: e.index, revealIndex: e.revealIndex,
                  revealTotal: e.revealTotal, boite: e.boite, deborde_px: e.deborde,
                  hauteur_contenu: e.hauteur_contenu, hauteur_visible: e.hauteur_visible,
                  image: nom, octets: octets, duree_ms: ms });
    if (++garde > 40) break;                      // garde-fou : jamais une boucle infinie
    await page.evaluate(() => window.adocPresentNext());
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(REPOS_MS);
  }
  const ua = await page.evaluate(() => navigator.userAgent);
  await nav.close();
  return { moteur: nomMoteur, userAgent: ua, jeu: nomJeu, etapes, erreurs };
}

(async () => {
  fs.mkdirSync(IMAGES, { recursive: true });
  const { serveur, port } = await servir(RACINE, 0);
  const jeux = fs.readdirSync(ENTREES).filter((f) => f.endsWith('.html'));
  if (!jeux.length) { console.error('aucune entrée dans entrees/ — lancer d\'abord outils/produire-exports.cjs'); process.exit(1); }
  const moteurs = [];
  for (const m of ['webkit', 'chromium']) {
    try { const b = await pw[m].launch(); await b.close(); moteurs.push(m); }
    catch (e) { console.log('  moteur ' + m + ' indisponible : ' + String(e.message).split('\n')[0].slice(0, 90)); }
  }
  console.log('RÉFÉRENCES — moteurs disponibles : ' + moteurs.join(', ')
    + (moteurs[0] === 'webkit' ? '  (webkit = référence principale, moteur de Safari)' : ''));
  console.log('');
  const tout = [];
  for (const m of moteurs) {
    for (const j of jeux) {
      const nomJeu = path.basename(j, '.html');
      const r = await capturerUnJeu(m, m, 'http://127.0.0.1:' + port + '/entrees/' + j, nomJeu);
      tout.push(r);
      const deb = r.etapes.filter((e) => e.deborde_px > 0).length;
      console.log('  ' + (m + '/' + nomJeu).padEnd(30) + r.etapes.length + ' étape(s)'
        + '  boîte ' + (r.etapes[0] ? r.etapes[0].boite.l + 'x' + r.etapes[0].boite.h : '?')
        + '  ' + (deb ? deb + ' étape(s) en débordement' : 'aucun débordement')
        + (r.erreurs.length ? '  ERREURS: ' + r.erreurs.length : ''));
    }
  }
  serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai2-references.json'),
    JSON.stringify({ selecteur: SELECTEUR, repos_ms: REPOS_MS,
      fenetre: FENETRE.width + 'x' + FENETRE.height + ' (échelle 1 — mesurée, cf. commentaire)',
      rapport_pour_1920: RAPPORT_1920, resultats: tout }, null, 2), 'utf8');
  console.log('\n  références écrites dans images/, relevé dans mesures/essai2-references.json');
})();
