// TEST AUTOMATIQUE DE L'ESSAI 3. ffprobe et ffmpeg sont ABSENTS de cette machine (vérifié) : le
// MP4 produit est donc relu par outils/lire-mp4.cjs, qui lit les boîtes normalisées
// (ftyp/moov/mvhd/trak/mdia/mdhd/stsd/stts) — durées PAR PISTE, codecs, dimensions, cadence.
//
// LES DEUX MOTEURS SONT SONDÉS : l'encodage H.264 + AAC par WebCodecs n'est pas acquis partout, et
// le but du banc est précisément de le mesurer plutôt que de le supposer. Ce que le Safari réel
// fera reste à vérifier par Christophe : les capacités d'un WebKit de test ne sont pas celles de
// Safari.app (codecs système, accélération matérielle).
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');
const { lireMp4 } = require('./outils/lire-mp4.cjs');
const { servir } = require('./outils/serveur.cjs');

const RACINE = __dirname;
const IPS = 30;

async function surUnMoteur(nom, port) {
  const nav = await pw[nom].launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
  await page.waitForFunction(() => typeof window.__essai3Api === 'object', null, { timeout: 15000 });
  const cap = await page.evaluate(() => window.__essai3Api.capacites());
  const pret = cap.mediabunny.avc === true && cap.mediabunny.aac === true;
  const res = { moteur: nom, userAgent: await page.evaluate(() => navigator.userAgent),
                capacites: cap, pret, court: null, erreurs };
  if (pret) {
    await page.click('#btnCourt');
    await page.waitForFunction(() => !!(window.__essai3 && (window.__essai3.court)), null, { timeout: 180000 });
    const m = await page.evaluate(() => window.__essai3.court);
    res.court = m;
    if (!m.erreur) {
      const octets = await page.evaluate(async () => {
        const b = window.__essai3Api.court.blob;
        return Array.from(new Uint8Array(await b.arrayBuffer()));
      });
      const buf = Buffer.from(octets);
      const f = path.join(RACINE, 'mesures', 'essai3-court-' + nom + '.mp4');
      fs.writeFileSync(f, buf);
      res.entete = lireMp4(buf);
      res.fichier = path.basename(f);
    }
  }
  await nav.close();
  return res;
}

(async () => {
  fs.mkdirSync(path.join(RACINE, 'mesures'), { recursive: true });
  const { serveur, port } = await servir(RACINE, 0);
  const moteurs = [];
  for (const m of ['chromium', 'webkit']) {
    try { const b = await pw[m].launch(); await b.close(); moteurs.push(m); } catch (_) {}
  }
  const tout = [];
  console.log('ESSAI 3 — ENCODAGE MP4, sur ' + moteurs.join(' et '));
  console.log('');
  for (const m of moteurs) {
    const r = await surUnMoteur(m, port);
    tout.push(r);
    console.log('  ' + m.toUpperCase());
    const v = r.capacites.video.filter((x) => x.supporte).map((x) => x.codec);
    const a = r.capacites.audio.filter((x) => x.supporte).map((x) => x.canaux === 1 ? 'mono' : 'stéréo');
    console.log('    H.264 par WebCodecs   : ' + (v.length ? v.join(', ') : 'AUCUN profil accepté'));
    console.log('    AAC-LC 48 kHz         : ' + (a.length ? a.join(' et ') : 'REFUSÉ'));
    console.log('    avis de Mediabunny    : avc=' + r.capacites.mediabunny.avc + '  aac=' + r.capacites.mediabunny.aac);
    if (!r.pret) { console.log('    → encodage impossible sur ce moteur, export non tenté'); console.log(''); continue; }
    if (r.court && r.court.erreur) { console.log('    → export en ÉCHEC : ' + r.court.erreur); console.log(''); continue; }
    const e = r.entete, s = r.court.synchro;
    console.log('    fichier produit       : ' + (r.court.octets / 1024).toFixed(0) + ' Ko en '
      + r.court.duree_encodage_ms + ' ms, ' + r.court.images_ecrites + ' images écrites');
    console.log('    marque / boîtes       : ' + e.marque + ' — ' + e.boites_racine.join(' '));
    console.log('    piste vidéo           : ' + (e.video ? e.video.codec + ' ' + e.video.largeur + 'x' + e.video.hauteur
      + ', ' + e.video.duree_s + ' s, ' + e.video.echantillons + ' échantillons ('
      + e.images_par_seconde + ' i/s)' : 'ABSENTE'));
    console.log('    piste audio           : ' + (e.audio ? e.audio.codec + ', ' + e.audio.canaux + ' canal/canaux, '
      + e.audio.duree_s + ' s' : 'ABSENTE'));
    const uneImage = 1 / IPS;
    const ecart = e.ecart_video_audio_s;
    console.log('    écart vidéo − audio   : ' + ecart + ' s  (une image = ' + uneImage.toFixed(4) + ' s) → '
      + (Math.abs(ecart) <= uneImage ? 'DANS le critère' : 'HORS critère'));
    if (s) {
      s.ecarts_ms.forEach((x, i) => console.log('    flash − bip à ' + [1, 5, 9][i] + ' s        : '
        + (x === null ? 'non mesurable' : x + ' ms') + (x !== null ? (Math.abs(x) <= 40 ? '  (≤ 40 ms)' : '  HORS critère') : '')));
    }
    if (r.erreurs.length) console.log('    erreurs JS            : ' + r.erreurs.slice(0, 2).join(' | '));
    console.log('');
  }
  serveur.close();
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-encodage.json'),
    JSON.stringify({ ffprobe: 'absent de la machine — vérification par outils/lire-mp4.cjs',
                     images_par_seconde: IPS, resultats: tout }, null, 2), 'utf8');
  console.log('  relevé dans mesures/essai3-encodage.json');
})();
