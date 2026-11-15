const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const montage = fs.readFileSync(path.join(__dirname, '..', 'atelier-montage.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'atelier-diapos.html'), 'utf8');

assert.match(montage,
  /id="am-duck"><option value="1">Aucune<\/option><option value="0\.251">−12 dB<\/option><option value="0\.126">−18 dB<\/option>/,
  'un nouveau montage doit commencer sans baisse automatique de la musique ni des ambiances');
assert.doesNotMatch(montage, /id="am-uniform-voices" type="checkbox" checked/,
  'l’égalisation automatique des voix ne doit pas être cochée par défaut');
assert.match(montage, /project\.mix\?\.duck\?\?1/,
  'un ancien projet sans réglage de mixage doit également rester sans ducking');
assert.match(montage, /project\.mix\?\.uniformVoices===true/,
  'seul un projet qui a explicitement activé l’égalisation doit la restaurer');
assert.match(page, /atelier-montage\.js\?v=20261115-manual-audio-defaults/,
  'la page publiée doit forcer le chargement des nouveaux réglages audio');

console.log('PASS Trame démarre avec un mixage entièrement manuel.');
