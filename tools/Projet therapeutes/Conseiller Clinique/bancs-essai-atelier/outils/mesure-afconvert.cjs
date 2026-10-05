// COMPLÉMENT 2, POINT 1 — LES LECTEURS APPLE COMPENSENT-ILS L'AMORCE ?
//
// La question ne peut pas être tranchée par Mediabunny, qui a produit les fichiers et les relit
// avec ses propres décodeurs. afconvert est le décodeur de CoreAudio, celui que QuickTime Player
// et l'ensemble de la pile Apple emploient. Si le PCM qu'il rend place l'attaque du bip à
// ~1,000 s, l'amorce est compensée et le critère de 40 ms est tenu CHEZ LES LECTEURS APPLE,
// quelle que soit la lecture qu'en fait une bibliothèque tierce.
//
// La mesure porte sur l'ATTAQUE, jamais sur le pic : mon enveloppe sin(π·p) place son maximum au
// milieu de la rafale, ce qui ajoutait 20 ms d'artefact à mes premiers chiffres.
const fs = require('node:fs'), path = require('node:path');
const { lireWavQuelconque } = require('./lire-wav.cjs');
const RACINE = path.join(__dirname, '..');
const INSTANTS = [1, 5, 9];
const DUREE_AUTORISEE = 12;   // durée du tampon écrit à la production

// Attaque = premier échantillon dépassant un seuil, cherché dans une fenêtre autour de l'instant.
// Le seuil est relatif au pic local : un seuil absolu dépendrait du niveau d'encodage.
function attaque(pcm, se, instant, fenetre) {
  const d0 = Math.max(0, Math.round((instant - fenetre) * se));
  const d1 = Math.min(pcm.length, Math.round((instant + fenetre) * se));
  let pic = 0;
  for (let i = d0; i < d1; i++) { const a = Math.abs(pcm[i]); if (a > pic) pic = a; }
  const seuil = pic * 0.25;
  for (let i = d0; i < d1; i++) {
    if (Math.abs(pcm[i]) > seuil) return { t: +(i / se).toFixed(5), pic_local: +(pic / 32768).toFixed(3) };
  }
  return { t: null, pic_local: +(pic / 32768).toFixed(3) };
}

function lirePcm(fichier) {
  const e = lireWavQuelconque(fs.readFileSync(fichier));
  return { entete: e, pcm: e.pcm };
}

const resultats = [];
console.log('DÉCODAGE PAR afconvert (CoreAudio) — L\'AMORCE EST-ELLE COMPENSÉE ?');
console.log('');
for (const se of [48000, 44100]) {
  const f = path.join(RACINE, 'mesures', 'decode-' + se + '.wav');
  if (!fs.existsSync(f)) { console.log('  ' + se + ' Hz : WAV absent'); continue; }
  const { entete, pcm } = lirePcm(f);
  const amorce_ms = +(2112 / se * 1000).toFixed(2);
  const ecartDuree = +((entete.echantillons - DUREE_AUTORISEE * se)).toFixed(0);
  console.log('  ' + se + ' Hz — ' + entete.echantillons + ' échantillons rendus pour '
    + (DUREE_AUTORISEE * se) + ' écrits  (écart ' + (ecartDuree >= 0 ? '+' : '') + ecartDuree + ')');
  const mesures = [];
  for (const inst of INSTANTS) {
    const a = attaque(pcm, se, inst, 0.3);
    const ecart_ms = a.t === null ? null : +((a.t - inst) * 1000).toFixed(1);
    mesures.push({ instant: inst, attaque_s: a.t, ecart_ms, pic_local: a.pic_local });
    console.log('    bip prévu à ' + inst + ',000 s → attaque à ' + a.t
      + ' s   écart ' + (ecart_ms >= 0 ? '+' : '') + ecart_ms + ' ms'
      + '   (amorce non compensée donnerait +' + amorce_ms + ' ms)');
  }
  const moy = +(mesures.reduce((s, m) => s + m.ecart_ms, 0) / mesures.length).toFixed(1);
  const compense = Math.abs(moy) < amorce_ms / 2;
  console.log('    écart moyen : ' + (moy >= 0 ? '+' : '') + moy + ' ms  → amorce '
    + (compense ? 'COMPENSÉE par CoreAudio' : 'NON compensée'));
  console.log('');
  resultats.push({ echantillonnage: se, echantillons_rendus: entete.echantillons,
                   echantillons_ecrits: DUREE_AUTORISEE * se, ecart_duree_echantillons: ecartDuree,
                   amorce_si_non_compensee_ms: amorce_ms, mesures, ecart_moyen_ms: moy, amorce_compensee: compense });
}
fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-afconvert.json'),
  JSON.stringify({ decodeur: 'afconvert (CoreAudio, outil système macOS)',
                   methode: 'attaque au seuil de 25 % du pic local, jamais le pic',
                   resultats }, null, 2), 'utf8');
