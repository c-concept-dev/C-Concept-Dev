#!/usr/bin/env node
// COMPLÉMENT 5, POINT 3 — MESURE DU MP4 DE CALIBRATION
//
// Le fichier de calibration porte une liste d'édition exagérée : media_time 8448 à 48 kHz, soit
// quatre fois l'amorce AAC, soit 176,00 ms. Il est fait pour qu'un LECTEUR se trahisse à l'oreille.
// Ici on ne mesure que des DÉCODEURS, et on confronte chaque mesure à ce qui était prédit.
//
// LES PRÉDICTIONS SONT ÉCRITES AVANT, ET AFFICHÉES COMME TELLES. Une prédiction n'est pas un
// résultat : la colonne « prédit » vient du raisonnement, la colonne « mesuré » de l'outil, et
// l'écart entre les deux est imprimé. C'est le seul moyen de voir si le raisonnement était juste.
//
// MA PREMIÈRE PRÉDICTION ÉTAIT FAUSSE D'EXACTEMENT UNE AMORCE, et le brief portait la même
// erreur : -176,00 + 4,2 = -171,8 ms. Mesuré : -127,8 ms. L'écart vaut +44,00 ms, soit 2112
// échantillons à 48 kHz. La cause est un acquis du complément 3 que j'avais omis d'appliquer :
// ffmpeg ne RETIRE PAS l'amorce. Son point de départ n'est donc pas 0 mais +44,00 ms, et la liste
// d'édition retranche 176,00 ms à cela.
//
//   ffmpeg    : +44,00 (amorce conservée) + 4,2 (montée au seuil) - 176,00 (liste d'édition)
//               = -127,80 ms
//   afconvert : ignore la liste d'édition de la piste audio (établi au complément 3 en falsifiant
//               le media_time dans les octets : il ne bougeait pas d'un dixième) et retire
//               l'amorce, donc +4,2 ms.
//
// CONTRÔLE DE COHÉRENCE : le même modèle, 44,00 + 4,2 - media_time/48, redonne les quatre points
// de la falsification du complément 3 — media_time 0 -> +48,2 ; 1056 -> +26,2 ; 2112 -> +4,2 ;
// 4224 -> -39,8 ; tous mesurés, tous retrouvés. Une formule qui explique cinq points dont elle
// n'a pas été tirée vaut mieux qu'une prédiction corrigée après coup.

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { lireWavQuelconque } = require('./lire-wav.cjs');
const { attaque } = require('./attaque.cjs');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const FF = path.join(RACINE, 'ffmpeg-externe', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const INSTANTS = [1, 5, 9];
const SE = 48000;
const AMORCE_ECH = 2112;
const FACTEUR = 4;
const MONTEE_MS = 4.2;     // montée jusqu'au seuil de détection, établie au complément 2
const AMORCE_MS = 44.0;    // 2112 échantillons à 48 kHz, que ffmpeg CONSERVE (complément 3)

const FICHIER = path.join(PAQUET, 'F-CALIBRATION-liste-edition-exageree-' + SE + 'Hz.mp4');

function decoder(outil, mp4, sortie) {
  if (outil === 'ffmpeg') {
    execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error',
      '-i', mp4, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', sortie], { stdio: 'pipe' });
  } else {
    execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', mp4, sortie], { stdio: 'pipe' });
  }
  return sortie;
}

if (!fs.existsSync(FICHIER)) {
  console.error('Fichier de calibration absent — lancer outils/paquet-controle-humain.cjs');
  console.error('  attendu : ' + FICHIER);
  process.exit(1);
}
fs.mkdirSync(MESURES, { recursive: true });

const octets = fs.readFileSync(FICHIER);
const iElst = octets.indexOf('elst');
const mediaTime = (iElst >= 0) ? octets.readInt32BE(iElst + 16) : null;
const attendu = AMORCE_ECH * FACTEUR;
const decalage_ms = +(1000 * attendu / SE).toFixed(2);

console.log('MP4 DE CALIBRATION — LISTE D\'ÉDITION EXAGÉRÉE');
console.log('  fichier       : ' + path.basename(FICHIER));
console.log('  media_time lu : ' + mediaTime + ' échantillons  (attendu ' + attendu + ', soit '
  + FACTEUR + ' fois l\'amorce)');
if (mediaTime !== attendu) {
  console.error('  ROUGE : le fichier ne porte pas la valeur annoncée — mesure sans objet');
  process.exit(1);
}
console.log('  soit un saut de ' + decalage_ms.toFixed(2).replace('.', ',') + ' ms de contenu');
console.log('');

// Les prédictions, posées AVANT de lire quoi que ce soit.
const PREDIT = {
  ffmpeg: +(AMORCE_MS + MONTEE_MS - decalage_ms).toFixed(1),
  afconvert: MONTEE_MS,
};
// La prédiction d'abord posée, fausse, est conservée : une prédiction corrigée en silence ne
// s'éprouve plus. Elle vient du brief comme de moi.
const PREDIT_INITIAL = { ffmpeg: +(-decalage_ms + MONTEE_MS).toFixed(1), afconvert: MONTEE_MS };
console.log('  PRÉDICTIONS (raisonnement, pas encore des résultats) :');
console.log('    ffmpeg    : ' + PREDIT.ffmpeg + ' ms   (+' + AMORCE_MS + ' d\'amorce CONSERVÉE, +'
  + MONTEE_MS + ' de montée au seuil, -' + decalage_ms + ' de liste d\'édition)');
console.log('    afconvert : +' + PREDIT.afconvert + ' ms   (liste d\'édition ignorée, amorce retirée)');
console.log('    pour mémoire, la prédiction d\'abord posée, fausse d\'une amorce : ffmpeg '
  + PREDIT_INITIAL.ffmpeg + ' ms — elle oubliait que ffmpeg conserve l\'amorce.');
console.log('');

const resultats = {};
let rouges = 0;
console.log('  MESURES :');
for (const outil of ['ffmpeg', 'afconvert']) {
  let r;
  try {
    const wav = decoder(outil, FICHIER, path.join(MESURES, 'calib-' + outil + '.wav'));
    const e = lireWavQuelconque(fs.readFileSync(wav));
    if (e.echantillonnage !== SE) throw new Error('rééchantillonné à ' + e.echantillonnage);
    // Fenêtre élargie à 0,45 s : l'attaque attendue peut être à -176 ms de l'instant visé.
    const par = INSTANTS.map((inst) => {
      const a = attaque(e.pcm, SE, inst, 0.45);
      return { instant: inst, attaque_s: a.t,
               ecart_ms: a.t === null ? null : +((a.t - inst) * 1000).toFixed(1) };
    });
    const v = par.filter((x) => x.ecart_ms !== null).map((x) => x.ecart_ms);
    r = { echantillons: e.echantillons, par,
          moyen: v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null };
  } catch (err) { r = { erreur: String(err.message).slice(0, 120) }; }
  resultats[outil] = r;
  if (r.erreur) { console.log('    ' + outil.padEnd(10) + 'ERREUR ' + r.erreur); rouges++; continue; }
  const ecartPredit = +(r.moyen - PREDIT[outil]).toFixed(1);
  const conforme = Math.abs(ecartPredit) <= 1.0;
  if (!conforme) rouges++;
  console.log('    ' + outil.padEnd(10) + 'mesuré ' + (r.moyen >= 0 ? '+' : '') + r.moyen + ' ms'
    + '   par instant [' + r.par.map((x) => x.ecart_ms).join(', ') + ']'
    + '   prédit ' + (PREDIT[outil] >= 0 ? '+' : '') + PREDIT[outil]
    + '   écart au prédit ' + (ecartPredit >= 0 ? '+' : '') + ecartPredit
    + '   ' + (conforme ? 'conforme' : 'ROUGE'));
  r.predit_ms = PREDIT[outil];
  r.ecart_au_predit_ms = ecartPredit;
}

console.log('');
console.log('  CE QUE CELA NE DIT PAS : aucun lecteur n\'a été éprouvé ici. Un décodeur en ligne');
console.log('  de commande n\'est pas QuickTime Player, ni le <video> de Safari ou de Chrome.');
console.log('  Le fichier est fait pour que CHRISTOPHE tranche à l\'oreille, et lui seul.');

fs.writeFileSync(path.join(MESURES, 'essai3-calibration.json'),
  JSON.stringify({ fichier: path.basename(FICHIER), media_time: mediaTime,
                   facteur_amorce: FACTEUR, saut_ms: decalage_ms,
                   montee_au_seuil_ms: MONTEE_MS,
                   predictions_posees_avant: PREDIT,
                   prediction_initiale_fausse: PREDIT_INITIAL,
                   modele: 'ecart_ms = amorce 44,00 + montee 4,2 - media_time/48',
                   resultats,
                   portee: 'décodeurs seulement ; aucun lecteur éprouvé' }, null, 2), 'utf8');

console.log('');
console.log('  ' + (rouges ? rouges + ' ROUGE(S)' : 'verts : 2   rouges : 0'));
process.exit(rouges ? 1 : 0);
