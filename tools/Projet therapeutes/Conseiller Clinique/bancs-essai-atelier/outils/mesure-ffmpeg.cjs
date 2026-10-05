#!/usr/bin/env node
// COMPLÉMENT 3, POINT 1 — UN DÉCODEUR NON-APPLE RETIRE-T-IL L'AMORCE ?
//
// Le complément 2 a établi qu'afconvert (CoreAudio) compense les 2112 échantillons d'amorce AAC :
// le bip attaque à +4,2 ms, donc sans décalage perceptible sur un lecteur Apple. Restait ouvert,
// et explicitement non prouvé : le comportement d'un décodeur non-Apple. Les boîtes qui pourraient
// porter l'amorce (edts/elst, sgpd/roll, iTunSMPB) sont TOUTES absentes des fichiers produits ;
// rien dans le conteneur ne signale donc l'amorce à un lecteur tiers.
//
// ffmpeg est obtenu par le paquet npm ffmpeg-static, dans ffmpeg-externe/, dossier IGNORÉ par git :
// rien n'est installé au système, rien n'est commité (45 Mo de binaire).
//
// MÉTHODE ÉGALE, et c'est le point délicat : ce banc relance LUI-MÊME les deux décodeurs sur les
// mêmes MP4, et emploie la détection d'attaque partagée de attaque.cjs. Avant toute comparaison,
// il exige de retrouver au millième de seconde les chiffres afconvert déjà publiés (+4,2 ms). Si
// la parité échoue, le banc s'arrête : un écart entre décodeurs ne doit jamais pouvoir être un
// écart de méthode ou de version d'outil.

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { lireWavQuelconque } = require('./lire-wav.cjs');
const { attaque } = require('./attaque.cjs');

const RACINE = path.join(__dirname, '..');
const MESURES = path.join(RACINE, 'mesures');
const INSTANTS = [1, 5, 9];
const AMORCE_ECH = 2112;
const DUREE_AUTORISEE = 12;
// Référence publiée par le complément 2, à retrouver pour valider la parité de méthode.
const REF_AFCONVERT_MS = { 48000: 4.2, 44100: 4.2 };

function ffmpeg() {
  const p = path.join(RACINE, 'ffmpeg-externe', 'node_modules', 'ffmpeg-static', 'ffmpeg');
  if (!fs.existsSync(p)) {
    console.error('ffmpeg absent. Installer dans le dossier jetable, non commité :');
    console.error('  cd "' + path.join(RACINE, 'ffmpeg-externe') + '" && npm install --cache ../cache-npm ffmpeg-static@5.2.0');
    process.exit(1);
  }
  return p;
}

// Décode sans jamais rééchantillonner : -ar absent, donc la fréquence native est conservée.
// Un rééchantillonnage déplacerait l'attaque et ruinerait la comparaison.
function decodeFfmpeg(mp4, sortie) {
  execFileSync(ffmpeg(), ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', mp4, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', sortie], { stdio: 'pipe' });
  return sortie;
}
function decodeAfconvert(mp4, sortie) {
  execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', mp4, sortie], { stdio: 'pipe' });
  return sortie;
}

function mesurer(wav, se) {
  const e = lireWavQuelconque(fs.readFileSync(wav));
  if (e.echantillonnage !== se) {
    return { erreur: 'fréquence rendue ' + e.echantillonnage + ' Hz au lieu de ' + se + ' : rééchantillonnage, mesure invalide' };
  }
  const mesures = INSTANTS.map((inst) => {
    const a = attaque(e.pcm, se, inst, 0.3);
    return { instant: inst, attaque_s: a.t,
             ecart_ms: a.t === null ? null : +((a.t - inst) * 1000).toFixed(1) };
  });
  const valides = mesures.filter((m) => m.ecart_ms !== null);
  return { echantillons: e.echantillons, mesures,
           ecart_moyen_ms: valides.length
             ? +(valides.reduce((s, m) => s + m.ecart_ms, 0) / valides.length).toFixed(1) : null };
}

const BIN = ffmpeg();
const version = execFileSync(BIN, ['-hide_banner', '-version'], { encoding: 'utf8' })
  .split('\n')[0].trim();

console.log('DÉCODAGE NON-APPLE — L\'AMORCE DE 2112 ÉCHANTILLONS EST-ELLE RETIRÉE ?');
console.log('  ' + version);
console.log('  afconvert : outil système macOS (CoreAudio)');
console.log('  Les deux décodeurs sont relancés ici sur les mêmes MP4, avec la même détection.');
console.log('');

let rouges = 0;
const resultats = [];

for (const se of [48000, 44100]) {
  const mp4 = path.join(MESURES, 'decalage-' + se + '.mp4');
  if (!fs.existsSync(mp4)) { console.log('  ' + se + ' Hz : MP4 absent — relancer mesure-decalage-audio.cjs'); rouges++; continue; }
  const amorce_ms = +(AMORCE_ECH / se * 1000).toFixed(2);

  const wFf = decodeFfmpeg(mp4, path.join(MESURES, 'ff-' + se + '.wav'));
  const wAf = decodeAfconvert(mp4, path.join(MESURES, 'af-' + se + '.wav'));
  const rFf = mesurer(wFf, se), rAf = mesurer(wAf, se);

  console.log('  ' + se + ' Hz   (amorce non retirée donnerait +' + amorce_ms + ' ms)');
  if (rFf.erreur || rAf.erreur) {
    console.log('    ROUGE : ' + (rFf.erreur || rAf.erreur)); rouges++; continue;
  }

  // PARITÉ DE MÉTHODE, exigée avant toute comparaison.
  const ecartRef = Math.abs(rAf.ecart_moyen_ms - REF_AFCONVERT_MS[se]);
  const parite = ecartRef <= 0.2;
  console.log('    parité de méthode : afconvert redonne ' + rAf.ecart_moyen_ms
    + ' ms contre ' + REF_AFCONVERT_MS[se] + ' ms publiés → ' + (parite ? 'OK' : 'ROUGE'));
  if (!parite) { rouges++; console.log('    comparaison abandonnée : la méthode a bougé.'); continue; }

  for (const m of rFf.mesures) {
    const a = rAf.mesures.find((x) => x.instant === m.instant);
    console.log('    bip à ' + m.instant + ',000 s   ffmpeg ' + m.attaque_s + ' s ('
      + (m.ecart_ms >= 0 ? '+' : '') + m.ecart_ms + ' ms)'
      + '   afconvert ' + a.attaque_s + ' s (' + (a.ecart_ms >= 0 ? '+' : '') + a.ecart_ms + ' ms)');
  }
  // L'amorce est jugée RETIRÉE si l'écart reste très en dessous d'une demi-amorce.
  const retiree = Math.abs(rFf.ecart_moyen_ms) < amorce_ms / 2;
  const ecartEntreDecodeurs = +(rFf.ecart_moyen_ms - rAf.ecart_moyen_ms).toFixed(1);
  console.log('    ffmpeg : écart moyen ' + (rFf.ecart_moyen_ms >= 0 ? '+' : '') + rFf.ecart_moyen_ms
    + ' ms → amorce ' + (retiree ? 'RETIRÉE' : 'NON retirée'));
  console.log('    différence entre les deux décodeurs : '
    + (ecartEntreDecodeurs >= 0 ? '+' : '') + ecartEntreDecodeurs + ' ms');
  console.log('    échantillons rendus : ffmpeg ' + rFf.echantillons + ', afconvert ' + rAf.echantillons
    + ', écrits ' + (DUREE_AUTORISEE * se));
  console.log('');

  resultats.push({ echantillonnage: se, amorce_si_non_retiree_ms: amorce_ms,
                   parite_methode: parite, ffmpeg: rFf, afconvert: rAf,
                   amorce_retiree_par_ffmpeg: retiree,
                   difference_entre_decodeurs_ms: ecartEntreDecodeurs });
}

fs.writeFileSync(path.join(MESURES, 'essai3-ffmpeg.json'),
  JSON.stringify({ decodeurs: [version, 'afconvert (CoreAudio)'],
                   methode: 'attaque.cjs partagé, seuil à 25 % du pic local, jamais le pic',
                   parite_exigee_contre: REF_AFCONVERT_MS, resultats }, null, 2), 'utf8');

console.log('  ' + (rouges ? rouges + ' ROUGE(S)' : 'verts : ' + resultats.length + '   rouges : 0'));
process.exit(rouges ? 1 : 0);
