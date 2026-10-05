#!/usr/bin/env node
// COMPLÉMENT 5, POINT 4 — lanceur du banc AVFoundation.
//
// Le banc lui-même est en Swift (outils/mesure-avfoundation.swift), AVFoundation n'étant pas
// accessible depuis Node. Ce lanceur ne fait que lui passer les cinq MP4 du paquet, garder la
// sortie et en tirer un tableau. Rien n'est installé au système : `swift` est livré avec les
// outils en ligne de commande d'Xcode, déjà présents sur la machine (vérifié : Swift 6.3.3,
// SDK MacOSX dans /Library/Developer/CommandLineTools).

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const SWIFT = path.join(__dirname, 'mesure-avfoundation.swift');
const FICHIERS = [
  'A-SANS-liste-edition-48000Hz.mp4',
  'A-AVEC-liste-edition-48000Hz.mp4',
  'A-SANS-liste-edition-44100Hz.mp4',
  'A-AVEC-liste-edition-44100Hz.mp4',
  'F-CALIBRATION-liste-edition-exageree-48000Hz.mp4',
];

const absents = FICHIERS.filter((f) => !fs.existsSync(path.join(PAQUET, f)));
if (absents.length) {
  console.error('MP4 absents — lancer outils/paquet-controle-humain.cjs :');
  for (const a of absents) console.error('  ' + a);
  process.exit(1);
}
try { execFileSync('/usr/bin/swift', ['--version'], { stdio: 'pipe' }); }
catch (e) {
  console.error('`swift` indisponible. Alternative sans rien installer : le banc AVFoundation ne');
  console.error('peut pas tourner, mais afconvert (outils/mesure-calibration.cjs) reste disponible');
  console.error('et donne le comportement du décodeur CoreAudio.');
  process.exit(1);
}
fs.mkdirSync(MESURES, { recursive: true });

let sortie;
try {
  sortie = execFileSync('/usr/bin/swift', [SWIFT].concat(FICHIERS.map((f) => path.join(PAQUET, f))),
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} catch (e) {
  sortie = String(e.stdout || '') + String(e.stderr || '');
  process.stdout.write(sortie);
  console.error('  le banc Swift a échoué');
  fs.writeFileSync(path.join(MESURES, 'essai3-avfoundation.txt'), sortie, 'utf8');
  process.exit(1);
}
process.stdout.write(sortie);
fs.writeFileSync(path.join(MESURES, 'essai3-avfoundation.txt'), sortie, 'utf8');

// Récapitulatif : écart moyen par fichier, mis en regard des deux autres décodeurs déjà mesurés.
const AUTRES = {
  'A-SANS-liste-edition-48000Hz.mp4': { afconvert: 4.2, ffmpeg: 48.2 },
  'A-AVEC-liste-edition-48000Hz.mp4': { afconvert: 4.2, ffmpeg: 4.2 },
  'A-SANS-liste-edition-44100Hz.mp4': { afconvert: 4.2, ffmpeg: 52.1 },
  'A-AVEC-liste-edition-44100Hz.mp4': { afconvert: 4.2, ffmpeg: 4.2 },
  'F-CALIBRATION-liste-edition-exageree-48000Hz.mp4': { afconvert: 4.2, ffmpeg: -127.8 },
};
const lignes = [];
let courant = null;
for (const l of sortie.split('\n')) {
  const m = /^ {2}(\S+\.mp4)\s*$/.exec(l);
  if (m) { courant = m[1]; continue; }
  const e = /écart moyen ([+-]?[\d.]+) ms/.exec(l);
  if (e && courant) { lignes.push({ fichier: courant, avfoundation: parseFloat(e[1]) }); courant = null; }
}
console.log('  RÉCAPITULATIF — trois décodeurs sur les mêmes fichiers (ms)');
console.log('    fichier                                            AVFoundation  afconvert  ffmpeg');
for (const l of lignes) {
  const a = AUTRES[l.fichier] || {};
  const n = (x) => (x === undefined ? '    —' : (x >= 0 ? '+' : '') + x.toFixed(1)).padStart(8);
  console.log('    ' + l.fichier.padEnd(50) + n(l.avfoundation) + '  ' + n(a.afconvert) + ' ' + n(a.ffmpeg));
}
fs.writeFileSync(path.join(MESURES, 'essai3-avfoundation.json'),
  JSON.stringify({ outil: 'AVFoundation via AVAssetReader (Swift)',
                   portee: 'décodeur de la pile Apple ; ne démontre ni QuickTime Player, ni le <video> de Safari ou Chrome',
                   resultats: lignes, pour_comparaison: AUTRES }, null, 2), 'utf8');
