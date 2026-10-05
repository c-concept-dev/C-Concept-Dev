#!/usr/bin/env node
// COMPLÉMENT 4 — PAQUET DE CONTRÔLE HUMAIN
//
// Tout ce qui ne peut pas être tranché par un script est rassemblé ici, dans controle-humain/,
// dossier IGNORÉ par git (le dépôt est public, et rien de produit n'y entre). Le paquet est
// AUTONOME : une fois bâti, il ne dépend plus d'aucun fichier suivi par git, donc il s'ouvre
// encore après un changement de branche.
//
//   A. Quatre MP4 de 12 s, identiques à la liste d'édition près, aux deux fréquences. Ils sortent
//      du MÊME code que les fichiers mesurés par ffmpeg et afconvert (outils/produire-mp4-essai.cjs),
//      sinon l'écoute ne porterait pas sur ce qui a été mesuré.
//   B. Une vidéo de comparaison de 20 s : moteur à 1920 en haut, SnapDOM en bas, PIXEL POUR PIXEL,
//      un encodage unique pour les deux côtés.
//   C. Une copie autonome de la page de netteté, à ouvrir dans le Safari réel.
//
// POURQUOI UN PARTAGE HAUT/BAS ET NON GAUCHE/DROITE : à 1920x1080, deux moitiés côte à côte
// feraient 960 de large chacune. Il faudrait réduire chaque image de moitié — exactement
// l'opération qui détruit ce qu'on cherche à juger. Le partage horizontal garde la largeur
// entière et les pixels d'origine ; le contenu des diapositives tient dans les premières lignes,
// donc il est visible dans les deux moitiés. Aucun rééchantillonnage n'est appliqué.

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const pw = require('playwright');
const { servir } = require('./serveur.cjs');
const { produireMp4 } = require('./produire-mp4-essai.cjs');

const RACINE = path.resolve(path.join(__dirname, '..'));
const PAQUET = path.join(RACINE, 'controle-humain');
const FF = path.join(RACINE, 'ffmpeg-externe', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const INSTANTS = [1, 5, 9];
const AMORCE_ECH = 2112;
const JEUX = ['couverture', 'dense', 'nombres', 'questionnaire'];
const SECONDES_PAR_JEU = 5;
const CIBLE = { l: 1920, h: 1080 };

function ecrirePng(fichier, dataUrl) {
  fs.writeFileSync(fichier, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
}
async function ouvrir(nav, fenetre) {
  const page = await nav.newPage({ viewport: fenetre });
  await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  return page;
}
// 800 ms : l'animation de nombre dure 700 ms. Capturer plus tôt enregistre une valeur en cours.
async function preparer(page) {
  await page.evaluate(() => { const b = document.querySelector('#cc-ws-present-start button'); if (b) b.click(); });
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')
    && document.getElementById('cc-ws-present-overlay').classList.contains('open'));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);
}

(async () => {
  for (const [quoi, chemin] of [['ffmpeg', FF], ['entrees/', path.join(RACINE, 'entrees', 'nombres.html')]]) {
    if (!fs.existsSync(chemin)) {
      console.error(quoi + ' absent : ' + chemin);
      console.error('  entrees/ se reconstruit par  node outils/produire-exports.cjs');
      console.error('  ffmpeg s\'installe dans ffmpeg-externe/ (voir le rapport)');
      process.exit(1);
    }
  }
  fs.mkdirSync(PAQUET, { recursive: true });
  fs.mkdirSync(path.join(PAQUET, 'vendeur'), { recursive: true });
  const tmp = path.join(PAQUET, '.images-temporaires');
  fs.mkdirSync(tmp, { recursive: true });

  const { serveur, port } = await servir(RACINE, 0);
  const base = 'http://127.0.0.1:' + port;
  const nav = await pw.webkit.launch();
  const fait = [];

  // ── A. les quatre MP4 ────────────────────────────────────────────────────────────────────────
  console.log('A. MP4 de la liste d\'édition');
  for (const se of [48000, 44100]) {
    for (const variante of ['sans', 'avec']) {
      const page = await ouvrir(nav, { width: 1280, height: 900 });
      await page.goto(base + '/essai3-mp4.html');
      await page.waitForFunction(() => typeof window.__essai3Api === 'object');
      const b64 = await produireMp4(page, { se, instants: INSTANTS,
        decalage: variante === 'avec' ? -AMORCE_ECH / se : 0, duree: 12 });
      await page.close();
      const nom = 'A-' + (variante === 'avec' ? 'AVEC' : 'SANS') + '-liste-edition-' + se + 'Hz.mp4';
      const f = path.join(PAQUET, nom);
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      const elst = fs.readFileSync(f).includes('elst');
      const attendu = (variante === 'avec');
      if (elst !== attendu) {
        console.error('  ROUGE ' + nom + ' : elst ' + (elst ? 'présent' : 'absent') + ' contre l\'attendu');
        process.exit(1);
      }
      console.log('  ' + nom.padEnd(42) + Math.round(fs.statSync(f).size / 1024) + ' Ko   elst '
        + (elst ? 'présent' : 'absent') + ' (conforme)');
      fait.push(nom);
    }
  }

  // ── B. la vidéo de comparaison ───────────────────────────────────────────────────────────────
  console.log('B. vidéo de comparaison, moteur contre SnapDOM');
  let rang = 0;
  for (const jeu of JEUX) {
    const url = base + '/entrees/' + jeu + '.html';
    // le moteur, rendant réellement à 1920x1080 (fenêtre 2094x1178, calibrée au lot 0)
    let p = await ouvrir(nav, { width: 2094, height: 1178 });
    await p.goto(url); await preparer(p);
    const boite = await p.evaluate(() => {
      const r = document.getElementById('cc-ws-present-slide-inner').getBoundingClientRect();
      return Math.round(r.width) + 'x' + Math.round(r.height);
    });
    await (await p.$('#cc-ws-present-slide-inner')).screenshot({ path: path.join(tmp, jeu + '-moteur.png') });
    await p.close();
    if (boite !== CIBLE.l + 'x' + CIBLE.h) {
      console.error('  ROUGE ' + jeu + ' : le moteur rend ' + boite + ' et non ' + CIBLE.l + 'x' + CIBLE.h);
      process.exit(1);
    }
    // SnapDOM, sur la même diapositive
    p = await ouvrir(nav, { width: 1596, height: 898 });
    await p.goto(url); await preparer(p);
    const snap = await p.evaluate(async (c) => {
      const { snapdom } = await import('/vendeur/snapdom.mjs');
      const el = document.getElementById('cc-ws-present-slide-inner');
      const res = await snapdom(el, {});
      const img = await res.toSvg();
      if (!img.complete) { await img.decode().catch(() => {}); }
      const cv = document.createElement('canvas'); cv.width = c.l; cv.height = c.h;
      const ctx = cv.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.l, c.h);
      ctx.drawImage(img, 0, 0, c.l, c.h);
      return cv.toDataURL('image/png');
    }, CIBLE);
    ecrirePng(path.join(tmp, jeu + '-snapdom.png'), snap);
    await p.close();

    // montage haut/bas, pixel pour pixel, et étiquettes dessinées dans la page
    p = await ouvrir(nav, { width: 400, height: 300 });
    await p.goto(base + '/essai3-mp4.html');
    const montage = await p.evaluate(async (a) => {
      const charger = (src) => new Promise((ok, ko) => {
        const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src;
      });
      const [mo, sn] = await Promise.all([charger(a.moteur), charger(a.snapdom)]);
      const cv = document.createElement('canvas'); cv.width = a.l; cv.height = a.h;
      const ctx = cv.getContext('2d', { alpha: false });
      const demi = a.h / 2;
      // PAS DE MISE À L'ÉCHELLE : on prend les `demi` premières lignes de chaque source, telles
      // quelles. Le contenu des diapositives tient dans cette bande.
      ctx.drawImage(mo, 0, 0, a.l, demi, 0, 0, a.l, demi);
      ctx.drawImage(sn, 0, 0, a.l, demi, 0, demi, a.l, demi);
      ctx.strokeStyle = '#e4002b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, demi); ctx.lineTo(a.l, demi); ctx.stroke();
      ctx.font = '600 26px -apple-system, system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      for (const [texte, y] of [['HAUT — le MOTEUR rendant à 1920 (référence)', demi - 14],
                                ['BAS — SnapDOM (ce que la bibliothèque sait faire)', a.h - 14]]) {
        const l = ctx.measureText(texte).width;
        ctx.fillStyle = 'rgba(0,0,0,.72)';
        ctx.fillRect(a.l - l - 36, y - 34, l + 24, 42);
        ctx.fillStyle = '#fff';
        ctx.fillText(texte, a.l - l - 24, y);
      }
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      const t = 'jeu : ' + a.jeu;
      const lt = ctx.measureText(t).width;
      ctx.fillRect(12, 12, lt + 24, 42);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
      ctx.fillText(t, 24, 20);
      return cv.toDataURL('image/png');
    }, { l: CIBLE.l, h: CIBLE.h, jeu,
         moteur: 'data:image/png;base64,' + fs.readFileSync(path.join(tmp, jeu + '-moteur.png')).toString('base64'),
         snapdom: snap });
    await p.close();
    rang++;
    ecrirePng(path.join(tmp, 'B-' + String(rang).padStart(2, '0') + '.png'), montage);
    console.log('  ' + jeu.padEnd(16) + 'montage haut/bas prêt (moteur ' + boite + ', sans rééchelle)');
  }

  await nav.close(); serveur.close();

  // Un SEUL encodage pour les deux côtés : aucun réglage ne peut favoriser l'un ou l'autre.
  const videoB = path.join(PAQUET, 'B-comparaison-nettete-moteur-haut-snapdom-bas.mp4');
  execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(1 / SECONDES_PAR_JEU), '-i', path.join(tmp, 'B-%02d.png'),
    '-r', '30', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoB], { stdio: 'pipe' });
  const duree = JEUX.length * SECONDES_PAR_JEU;
  console.log('  ' + path.basename(videoB) + '   ' + Math.round(fs.statSync(videoB).size / 1024)
    + ' Ko, ' + duree + ' s, un seul encodage libx264 crf 14');
  fait.push(path.basename(videoB));

  // ── C. la page autonome ─────────────────────────────────────────────────────────────────────
  console.log('C. page de netteté autonome');
  const sourcePage = path.join(RACINE, 'entrees', 'nombres-nettete.html');
  if (!fs.existsSync(sourcePage)) {
    console.error('  entrees/nombres-nettete.html absent — lancer outils/forger-page-nettete.cjs');
    process.exit(1);
  }
  for (const lib of ['snapdom.mjs', 'html-to-image.js', 'mediabunny.mjs']) {
    fs.copyFileSync(path.join(RACINE, 'vendeur', lib), path.join(PAQUET, 'vendeur', lib));
  }
  let html = fs.readFileSync(sourcePage, 'utf8');
  const avant = (html.match(/\.\/\.\.\/vendeur\//g) || []).length;
  html = html.split('./../vendeur/').join('./vendeur/');
  const apres = (html.match(/\.\/\.\.\/vendeur\//g) || []).length;
  if (avant === 0 || apres !== 0) {
    console.error('  ROUGE : réécriture des chemins de bibliothèque non concluante ('
      + avant + ' avant, ' + apres + ' après)');
    process.exit(1);
  }
  // Toute autre référence relative sortant du dossier briserait l'autonomie.
  const fuites = (html.match(/(?:src|href)="\.\.\//g) || []).length
               + (html.match(/from\s+["']\.\.\//g) || []).length;
  if (fuites) { console.error('  ROUGE : ' + fuites + ' référence(s) remontant hors du paquet'); process.exit(1); }
  const pageAutonome = path.join(PAQUET, 'C-nettete-dans-safari.html');
  fs.writeFileSync(pageAutonome, html, 'utf8');
  console.log('  ' + path.basename(pageAutonome) + '   ' + Math.round(html.length / 1024)
    + ' Ko, ' + avant + ' chemin(s) de bibliothèque réécrit(s), 0 référence hors du paquet');
  fait.push(path.basename(pageAutonome));

  fs.rmSync(tmp, { recursive: true, force: true });

  // ── la feuille d'instructions ───────────────────────────────────────────────────────────────
  const PORT = 8777;
  const commande = 'python3 -m http.server ' + PORT + ' --directory "' + PAQUET + '"';
  const feuille = `# Contrôle humain — lot 0 (une page)

Dossier du paquet, chemin absolu :

    ${PAQUET}

Ce dossier est **ignoré par git** et **autonome** : il ne dépend d'aucun fichier suivi, donc il
reste utilisable même après un changement de branche.

---

## 1. Les quatre MP4 — à écouter dans QuickTime Player

Double-clic suffit, aucun serveur nécessaire. Flash blanc et bip à **1 s, 5 s et 9 s**.

| Fichier | Liste d'édition | Fréquence |
|---|---|---|
| \`A-SANS-liste-edition-48000Hz.mp4\` | aucune | 48 kHz |
| \`A-AVEC-liste-edition-48000Hz.mp4\` | \`elst\`, media_time 2112 | 48 kHz |
| \`A-SANS-liste-edition-44100Hz.mp4\` | aucune | 44,1 kHz |
| \`A-AVEC-liste-edition-44100Hz.mp4\` | \`elst\`, media_time 2112 | 44,1 kHz |

**La question :** le bip tombe-t-il **avec** le flash, ou **après** ?

Ce qui est mesuré, et ce qui ne l'est pas :

- **Vérifié avec afconvert et ffmpeg** : au décodage, SANS liste d'édition, ffmpeg place le bip
  à +48,2 ms (48 kHz) et +52,1 ms (44,1 kHz), tandis qu'afconvert le place à +4,2 ms. AVEC la
  liste d'édition, les deux décodeurs donnent +4,2 ms.
- **À vérifier dans QuickTime** : rien de ce qui précède ne dit comment **QuickTime Player** se
  comporte. \`afconvert\` est un décodeur en ligne de commande, pas le lecteur. Les quatre fichiers
  sont là pour cela. Si les quatre semblent identiques à l'oreille, c'est une information : note-le.

---

## 2. La vidéo de comparaison — netteté

\`B-comparaison-nettete-moteur-haut-snapdom-bas.mp4\` — ${duree} s, ${JEUX.length} séquences de
${SECONDES_PAR_JEU} s (${JEUX.join(', ')}). Double-clic, aucun serveur.

Dans chaque image : **en haut le moteur** rendant à 1920, **en bas SnapDOM**. Les deux moitiés sont
les pixels d'origine, sans aucun rééchantillonnage, et un **seul** encodage H.264 couvre les deux.

**La question :** vue comme en vidéoprojection, la moitié basse est-elle acceptable ?

- **Vérifié par script** : SnapDOM rend un gradient sur contours de 92,5 contre 162,5 pour le
  moteur, soit l'équivalent du moteur flouté d'environ **un pixel**. Six chemins de capture
  différents donnent le même 92,5.
- **À vérifier à l'œil** : un écart mesurable n'est pas forcément un écart gênant. C'est cette
  question, et elle seule, qui décide si le module de montage peut se contenter de SnapDOM.

---

## 3. La page de netteté — dans TON Safari

Une seule commande, copiable depuis n'importe quel dossier du Terminal :

    ${commande}

Puis, dans Safari :

    http://localhost:${PORT}/C-nettete-dans-safari.html

Cliquer **1. Préparer**, puis **2. Tout mesurer**, puis **3. Télécharger**.

**Trois questions :**

1. Le panneau affiche-t-il un **« REFUS DE SÉCURITÉ »** ? WebKit piloté n'en produit aucun, mais
   le Safari réel n'a pas été éprouvé.
2. Les gradients valent-ils **92,5** comme en WebKit piloté, pour (a) et (b) ?
3. Les candidats (c) et (d) sont donnés **pour mémoire** : ils rendent le contenu à une autre
   échelle (1,35 fois trop grand pour (c), 0,74 fois pour (d)), donc leurs chiffres plus élevés ne
   sont pas comparables. Vérifie seulement qu'ils se comportent comme en WebKit.

Pour arrêter le serveur : \`Ctrl-C\` dans le Terminal.
`;
  fs.writeFileSync(path.join(PAQUET, 'INSTRUCTIONS.md'), feuille, 'utf8');
  fait.push('INSTRUCTIONS.md');

  console.log('');
  console.log('Paquet bâti : ' + PAQUET);
  for (const f of fait) {
    console.log('  ' + f.padEnd(50) + Math.round(fs.statSync(path.join(PAQUET, f)).size / 1024) + ' Ko');
  }
  console.log('');
  console.log('Commande unique pour Christophe :');
  console.log('  ' + commande);
})();
