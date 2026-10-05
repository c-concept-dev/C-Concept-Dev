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
// Liste d'édition VOLONTAIREMENT exagérée : quatre fois l'amorce, soit media_time 8448 à 48 kHz.
// À cette valeur, un lecteur qui applique la liste d'édition saute 176 ms de contenu, ce qui
// s'entend sans appareil de mesure. C'est le seul moyen de savoir, à l'oreille, si un LECTEUR
// honore l'elst — ce qu'aucun décodage en ligne de commande ne peut dire à sa place.
const CALIB_FACTEUR = 4;
const CALIB_SE = 48000;

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

  // ── F. le MP4 de calibration, liste d'édition exagérée ──────────────────────────────────────
  console.log('F. MP4 de calibration, liste d\'édition exagérée');
  {
    const mt = AMORCE_ECH * CALIB_FACTEUR;
    const page = await ouvrir(nav, { width: 1280, height: 900 });
    await page.goto(base + '/essai3-mp4.html');
    await page.waitForFunction(() => typeof window.__essai3Api === 'object');
    // Mediabunny écrit media_time = intoTimescale(-startTimestamp, timescale) : -8448/48000
    // donne donc 8448 échantillons, sans aucune retouche d'octets.
    const b64 = await produireMp4(page, { se: CALIB_SE, instants: INSTANTS,
      decalage: -mt / CALIB_SE, duree: 12 });
    await page.close();
    const nom = 'F-CALIBRATION-liste-edition-exageree-' + CALIB_SE + 'Hz.mp4';
    const fichier = path.join(PAQUET, nom);
    const octets = Buffer.from(b64, 'base64');
    fs.writeFileSync(fichier, octets);
    // On RELIT le media_time écrit : livrer un fichier de calibration dont la valeur n'est pas
    // celle annoncée rendrait le contrôle humain trompeur.
    const i = octets.indexOf('elst');
    const lu = (i >= 0) ? octets.readInt32BE(i + 16) : null;
    if (lu !== mt) {
      console.error('  ROUGE : media_time lu ' + lu + ' au lieu de ' + mt + ' — fichier non livrable');
      process.exit(1);
    }
    console.log('  ' + nom.padEnd(50) + Math.round(fs.statSync(fichier).size / 1024)
      + ' Ko   media_time ' + lu + ' éch. = ' + (1000 * mt / CALIB_SE).toFixed(0) + ' ms (relu, conforme)');
    fait.push(nom);
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
  // Trois pages autonomes. Chacune est contrôlée : aucune référence ne doit remonter hors du
  // paquet, sinon elle cesserait de fonctionner après un changement de branche.
  const pages = [
    { source: sourcePage, cible: 'C-nettete-dans-safari.html', reecrire: true, annexes: [] },
    { source: path.join(RACINE, 'essai1-micro.html'), cible: 'D-micro-dans-safari.html',
      reecrire: false, annexes: ['essai1-worklet.js'] },
    { source: path.join(RACINE, 'essai3-mp4.html'), cible: 'E-mp4-dans-safari.html',
      reecrire: false, annexes: [] },
    // Banc du complément 7 : il lit les variantes V1 à V5, déjà dans le paquet.
    { source: path.join(RACINE, 'banc-images.html'), cible: 'G-images-presentees.html',
      reecrire: false, annexes: [] },
  ];
  for (const p of pages) {
    if (!fs.existsSync(p.source)) { console.error('  source absente : ' + p.source); process.exit(1); }
    let html = fs.readFileSync(p.source, 'utf8');
    let reecrits = 0;
    if (p.reecrire) {
      reecrits = (html.match(/\.\/\.\.\/vendeur\//g) || []).length;
      html = html.split('./../vendeur/').join('./vendeur/');
      if (reecrits === 0 || (html.match(/\.\/\.\.\/vendeur\//g) || []).length !== 0) {
        console.error('  ROUGE ' + p.cible + ' : réécriture des chemins non concluante');
        process.exit(1);
      }
    }
    const fuites = (html.match(/(?:src|href)="\.\.\//g) || []).length
                 + (html.match(/from\s+["']\.\.\//g) || []).length
                 + (html.match(/import\(\s*["']\.\.\//g) || []).length
                 + (html.match(/["']\.\/\.\.\//g) || []).length;
    if (fuites) {
      console.error('  ROUGE ' + p.cible + ' : ' + fuites + ' référence(s) remontant hors du paquet');
      process.exit(1);
    }
    fs.writeFileSync(path.join(PAQUET, p.cible), html, 'utf8');
    for (const a of p.annexes) {
      if (!fs.existsSync(path.join(RACINE, a))) { console.error('  annexe absente : ' + a); process.exit(1); }
      fs.copyFileSync(path.join(RACINE, a), path.join(PAQUET, a));
    }
    console.log('  ' + p.cible.padEnd(32) + Math.round(html.length / 1024) + ' Ko'
      + (reecrits ? ', ' + reecrits + ' chemin(s) réécrit(s)' : '')
      + (p.annexes.length ? ', annexe(s) : ' + p.annexes.join(', ') : '')
      + ', 0 référence hors du paquet');
    fait.push(p.cible);
    for (const a of p.annexes) fait.push(a);
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  // ── la feuille d'instructions ───────────────────────────────────────────────────────────────
  const PORT = 8777;
  const commande = 'python3 -m http.server ' + PORT + ' --directory "' + PAQUET + '"';
  const feuille = [
'# Contrôle humain — lot 0 (une page)',
'',
'Dossier du paquet, chemin absolu :',
'',
'    ' + PAQUET,
'',
'Ignoré par git, et autonome : il ne dépend d\'aucun fichier suivi, donc il reste utilisable même',
'après un changement de branche.',
'',
'**Une seule commande, copiable depuis n\'importe quel dossier du Terminal :**',
'',
'    ' + commande,
'',
'Laisser ce Terminal ouvert. Pour arrêter : `Ctrl-C`. Les trois pages s\'ouvrent ensuite dans',
'Safari aux adresses données plus bas. Les MP4 se lisent par simple double-clic, sans serveur.',
'',
'---',
'',
'## 1. Les MP4 de la liste d\'édition — QuickTime Player, Safari, Chrome',
'',
'Flash blanc et bip à **1 s, 5 s et 9 s**. À essayer dans les **trois** lecteurs, car rien ne dit',
'qu\'ils se comportent pareil.',
'',
'| Fichier | Liste d\'édition | Fréquence |',
'|---|---|---|',
'| `A-SANS-liste-edition-48000Hz.mp4` | aucune | 48 kHz |',
'| `A-AVEC-liste-edition-48000Hz.mp4` | `media_time` 2112 (= l\'amorce) | 48 kHz |',
'| `A-SANS-liste-edition-44100Hz.mp4` | aucune | 44,1 kHz |',
'| `A-AVEC-liste-edition-44100Hz.mp4` | `media_time` 2112 | 44,1 kHz |',
'',
'**La question :** le bip tombe-t-il **avec** le flash, **avant**, ou **après** ?',
'',
'**Ce qui est attendu, et qui reste une PRÉDICTION, pas un résultat.** AVFoundation, la pile média',
'd\'Apple sur laquelle QuickTime et Safari sont bâtis, a été mesurée : elle retire l\'amorce ET',
'applique la liste d\'édition. Si QuickTime se comporte comme elle, alors `A-SANS` tombera juste',
'et `A-AVEC` partira **environ 40 ms en avance** (44 ms à 44,1 kHz). Si au contraire les quatre',
'fichiers semblent identiques, QuickTime ignore la liste d\'édition. **Les deux réponses sont',
'utiles** ; c\'est l\'écoute qui tranche, pas la mesure.',
'',
'## 2. Le MP4 de calibration — celui qui tranche',
'',
'`F-CALIBRATION-liste-edition-exageree-48000Hz.mp4` porte une liste d\'édition **volontairement',
'exagérée**, quatre fois l\'amorce (`media_time` 8448, soit 176 ms).',
'',
'**Comment lire le résultat, en une phrase :** si le bip est **nettement en avance** sur le flash',
'(environ 1/6 de seconde, audible sans appareil), le lecteur **applique** la liste d\'édition ; s\'il',
'n\'y a **aucun écart** par rapport au fichier `A-SANS`, le lecteur **l\'ignore**.',
'',
'Mesuré par trois décodeurs, pour situer ce que l\'oreille devrait entendre — **ce sont des',
'mesures de décodeurs, pas de lecteurs** :',
'',
'| Décodeur | `A-SANS` | `A-AVEC` | `F-CALIBRATION` |',
'|---|---|---|---|',
'| AVFoundation (pile Apple) | +4,2 ms | **−39,8 ms** | **−171,8 ms** |',
'| `afconvert` (CoreAudio) | +4,2 ms | +4,2 ms | +4,2 ms |',
'| ffmpeg 6.0 | +48,2 ms | +4,2 ms | −127,8 ms |',
'',
'Noter la réponse pour chacun des trois lecteurs. C\'est elle qui dira si la correction d\'amorce',
'doit être appliquée, et pour qui — et pour l\'instant la mesure dit de **ne pas l\'appliquer**,',
'parce qu\'elle dégraderait la pile Apple au lieu de la corriger.',
'',
'## 3. La comparaison de netteté — déjà acceptée',
'',
'`B-comparaison-nettete-moteur-haut-snapdom-bas.mp4`, 20 s. Conservée pour mémoire : SnapDOM est',
'retenu. Rien à faire.',
'',
'## 4. La page de netteté — `C`',
'',
'    http://localhost:' + PORT + '/C-nettete-dans-safari.html',
'',
'**1. Préparer**, puis **2. Tout mesurer**, puis **3. Télécharger**. Deux questions : le panneau',
'affiche-t-il un **« REFUS DE SÉCURITÉ »** (WebKit piloté n\'en produit aucun) ? Les gradients',
'valent-ils **92,5** pour (a) et (b) ? Les candidats (c) et (d) sont là pour mémoire : ils rendent',
'le contenu à une autre échelle, leurs chiffres ne sont pas comparables.',
'',
'## 5. Le micro — page `D`, environ 8 minutes',
'',
'    http://localhost:' + PORT + '/D-micro-dans-safari.html',
'',
'Dans l\'ordre, et en notant ce que la page affiche à chaque étape :',
'',
'1. **Demander le micro**, puis noter : nombre de canaux, fréquence, et les trois traitements.',
'2. **Une prise de 5 minutes** en lisant un texte à voix haute, avec **3 s de silence au début**.',
'3. Pendant la prise, **5 repères au clavier**, puis **5 autres avec une télécommande de',
'   présentation** si tu en as une. Sinon, note qu\'il n\'y en a pas eu : c\'est une réponse.',
'4. Toujours pendant la prise, ouvrir le **Centre de contrôle** et noter si **« Mode micro »**',
'   (Voix isolée) apparaît. S\'il apparaît, noter son réglage.',
'5. Passer l\'onglet **en arrière-plan 60 s**, revenir, et noter si la durée en échantillons a',
'   suivi l\'horloge.',
'6. **Fermer l\'onglet sans arrêter la prise.** Rouvrir la page, cliquer **Récupérer la dernière',
'   prise**, télécharger `voix.wav` et l\'ouvrir dans QuickTime Player.',
'7. **Télécharger `mesures.json`**, et lire les quatre tableaux que la page remplit toute seule :',
'',
'   - **Canaux livrés** : le niveau RMS de chaque canal et leur corrélation. Si la page dit',
'     « identiques au bit près », le micro duplique un seul canal — une corrélation de 1 ne',
'     prouve alors rien d\'autre. Si elle dit « un seul canal livré », la question est sans objet.',
'   - **Fenêtre de silence** : le niveau par demi-seconde sur les 3 premières secondes. Une',
'     tranche nettement plus forte que les autres veut dire que quelqu\'un a parlé pendant le',
'     silence, et que le bruit de fond est à reprendre. La page signale un écart au-delà de 12 dB.',
'   - **Appuis de touche reçus** : chaque appui y figure, même ceux qui ne posent pas de repère.',
'     C\'est ce qui distingue **« aucun appui »** — la télécommande n\'envoie rien à la page — de',
'     **« appui non capté »** — la touche arrive mais le repère ne se pose pas. Si la télécommande',
'     n\'apparaît pas du tout, note-le : c\'est une réponse, pas un échec du test.',
'   - **Durée de la prise et repères posés**, en tête du tableau de mesures et dans',
'     `mesures.json`.',
'',
'## 6. Les exports MP4 — page `E`, environ 5 minutes',
'',
'    http://localhost:' + PORT + '/E-mp4-dans-safari.html',
'',
'1. **Interroger les encodeurs**, puis **Produire l\'export court** (20 s) : noter la **durée',
'   d\'export** et la **taille du fichier** affichées.',
'2. **Produire l\'export long** (10 minutes) : noter la **durée d\'export** et la **taille**, et',
'   surtout relever la **mémoire de Safari dans le Moniteur d\'activité** pendant l\'encodage.',
'   C\'est la seule mesure qu\'aucune page ne peut prendre d\'elle-même.',
'3. Ouvrir les deux fichiers dans QuickTime Player et noter s\'ils se lisent jusqu\'au bout.',
'',
'---',
'',
'## 7. Les cinq variantes — pourquoi Chrome perd les flashs',
'',
'Mesuré par script, et le résultat est net : **la structure de notre export est en cause, pas',
'Chrome**. Le témoin V5, fabriqué par ffmpeg, ne perd aucun flash ; notre écriture en images',
'tenues (V1) en perd 5 sur 9 dans Chrome et 12 images de fondu sur 12.',
'',
'| Variante | Chrome : flashs | Chrome : images de fondu | WebKit : flashs | Poids |',
'|---|---|---|---|---|',
'| V1 images tenues (export actuel) | **4/9** | **0/12** | 9/9 | 491 Ko |',
'| V2 cadence constante 30 i/s | **9/9** | **12/12** | 9/9 | 1074 Ko |',
'| V3 tenues + 1 image/seconde | 6/9 | 1/12 | 9/9 | 865 Ko |',
'| V4 V2 réétiquetée plage limitée | 9/9 | 12/12 | 9/9 | 1095 Ko |',
'| V5 témoin ffmpeg libx264 | 9/9 | 12/12 | 9/9 | 511 Ko |',
'',
'**À vérifier par toi, à l\'œil, dans les trois lecteurs** (QuickTime Player, Safari, Chrome) —',
'double-clic pour QuickTime, ou la page ci-dessous pour le `<video>` :',
'',
'    http://localhost:' + PORT + '/G-images-presentees.html',
'',
'Choisis un fichier, clique **Lire et mesurer**, laisse les 40 s se dérouler, puis **Télécharger le',
'relevé**. Ce qu\'il faut noter pour chaque variante et chaque lecteur : **combien de flashs tu vois',
'sur 9**, et si le **fondu te paraît fluide ou saccadé**. La page compte les images réellement',
'présentées ; ton œil juge le reste.',
'',
'Un point que la mesure a tranché et qui peut surprendre : en **recherche** manuelle à 13,5 s,',
'Chrome affiche très bien l\'image de fondu de V1, et même un peu plus nette que V5. Le défaut',
'n\'est donc pas une image abîmée — c\'est que Chrome **ne présente jamais** ces images pendant la',
'lecture.',
'',
'---',
'',
'## La frontière',
'',
'**Vérifié avec un décodeur** — trois d\'entre eux, et ils ne s\'accordent pas. Sans liste',
'd\'édition : AVFoundation et `afconvert` placent le bip à +4,2 ms, ffmpeg à +48,2 ms (48 kHz) et',
'+52,1 ms (44,1 kHz), car lui seul conserve l\'amorce. Avec la liste d\'édition à 2112 : ffmpeg',
'revient à +4,2 ms, `afconvert` ne bouge pas, mais **AVFoundation passe à −39,8 ms** — elle',
'applique la liste d\'édition en plus de retirer l\'amorce. Le gradient de netteté de SnapDOM vaut',
'92,5 contre 162,5 pour le moteur, sur six chemins de capture.',
'',
'**À vérifier par Christophe**, parce qu\'aucun script ne le peut : le comportement de **QuickTime',
'Player, de Safari et de Chrome** sur les cinq MP4 ; l\'existence et l\'effet du **« Mode micro »** ;',
'la tenue d\'une prise de 5 minutes et sa **récupération** après fermeture d\'onglet ; la **mémoire**',
'de Safari pendant l\'export de 10 minutes ; et un éventuel **refus de sécurité** de Safari.',
'',
'Un décodeur en ligne de commande n\'est pas un lecteur : rien de ce qui est mesuré ne dit comment',
'QuickTime, Safari ou Chrome se comportent.',
'',
''].join('\n');
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
