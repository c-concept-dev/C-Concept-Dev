// L'EXPORT DE 10 MINUTES — critère nommé : « se termine sans plantage ». On mesure la durée
// d'encodage, la taille, et on relit le fichier produit. La mémoire de Safari, elle, ne peut être
// relevée que par Christophe dans le Moniteur d'activité : aucune API ne la donne à la page.
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { lireMp4 } = require('./lire-mp4.cjs');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');

(async () => {
  const moteur = process.argv[2] || 'chromium';
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw[moteur].launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('crash', () => erreurs.push('LA PAGE A PLANTÉ'));
  await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
  await page.waitForFunction(() => typeof window.__essai3Api === 'object');
  await page.evaluate(() => window.__essai3Api.capacites());
  console.log('  export de 10 minutes sur ' + moteur + ' — en cours…');
  const t0 = Date.now();
  await page.click('#btnLong');
  await page.waitForFunction(() => !!(window.__essai3 && window.__essai3.long), null, { timeout: 1800000 });
  const mur = ((Date.now() - t0) / 1000).toFixed(1);
  const m = await page.evaluate(() => window.__essai3.long);
  let entete = null;
  if (!m.erreur) {
    const octets = await page.evaluate(async () => Array.from(new Uint8Array(await window.__essai3Api.long.blob.arrayBuffer())));
    const buf = Buffer.from(octets);
    fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-long-' + moteur + '.mp4'), buf);
    entete = lireMp4(buf);
  }
  await nav.close(); serveur.close();
  if (m.erreur) { console.log('  ÉCHEC : ' + m.erreur); }
  else {
    console.log('  durée d\'encodage   : ' + (m.duree_encodage_ms / 1000).toFixed(1) + ' s  (horloge totale ' + mur + ' s)');
    console.log('  taille             : ' + (m.octets / 1048576).toFixed(1) + ' Mo');
    console.log('  images écrites     : ' + m.images_ecrites + '  (18 000 si l\'on peignait chaque image)');
    if (entete) {
      console.log('  piste vidéo        : ' + entete.video.codec + ' ' + entete.video.largeur + 'x' + entete.video.hauteur
        + ', ' + entete.video.duree_s + ' s, ' + entete.video.echantillons + ' échantillons');
      console.log('  piste audio        : ' + entete.audio.codec + ', ' + entete.audio.duree_s + ' s');
      console.log('  écart vidéo−audio  : ' + entete.ecart_video_audio_s + ' s');
    }
    console.log('  erreurs / plantage : ' + (erreurs.length ? erreurs.join(' | ') : 'aucun'));
  }
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-long.json'),
    JSON.stringify({ moteur, horloge_s: +mur, mesures: { ...m, blob: undefined }, entete, erreurs }, null, 2), 'utf8');
})();
