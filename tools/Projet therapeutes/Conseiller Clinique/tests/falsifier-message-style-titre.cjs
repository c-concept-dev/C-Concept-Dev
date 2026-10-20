// FALSIFICATION DU MESSAGE HONNÊTE SUR LE STYLE D'UN TITRE.
//
// Le message a menti pendant toute la vie du lot 2C. Le remplacer ne vaut que si l'on prouve
// qu'en remettant l'ancien, le contrôle échoue. Trois mutations : l'ancien message pour tout le
// monde ; le NOUVEAU message pour tout le monde (un avertissement qui s'affiche partout
// n'avertit de rien, et il ferait mentir le cas du bloc) ; et un discriminant inversé.
//
//   NODE_PATH=<playwright> node tests/falsifier-message-style-titre.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const COEUR = path.join(RACINE, 'studio-clinique-core.js');
const CONTROLE = 'verify-message-style-titre.cjs';

const CHOIX = "    adocEditorMessage(titreRacine\n      ? 'Appliqué à l’écran seulement : le style d’un titre n’est pas encore sauvegardé.'\n      : 'Modification appliquée.');";

const MUTATIONS = [
  { nom: 'l’ANCIEN message revient pour tout le monde',
    de: CHOIX, vers: "    adocEditorMessage('Modification appliquée.');",
    attendu: 'le titre promettrait de nouveau une sauvegarde qui n’a pas lieu — le défaut d’origine' },
  { nom: 'le NOUVEAU message s’affiche pour tout le monde, blocs compris',
    de: CHOIX,
    vers: "    adocEditorMessage('Appliqué à l’écran seulement : le style d’un titre n’est pas encore sauvegardé.');",
    attendu: 'un avertissement affiché partout n’avertit de rien, et il mentirait sur un bloc' },
  { nom: 'le discriminant est inversé',
    de: "    adocEditorMessage(titreRacine\n      ?",
    vers: "    adocEditorMessage(!titreRacine\n      ?",
    attendu: 'les deux messages seraient échangés : le pire des deux mondes' },
];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = () => { try { execFileSync(process.execPath, [path.join('tests', CONTROLE)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const original = fs.readFileSync(COEUR, 'utf8');
  const empreinte = sha(original);
  for (const m of MUTATIONS) {
    const nb = original.split(m.de).length - 1;
    assert.equal(nb, 1, 'ancre absente ou multiple (' + nb + ') : ' + m.nom);
  }
  console.log(MUTATIONS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');
  assert.ok(lance(), 'avant toute mutation, ' + CONTROLE + ' doit être VERT');
  console.log('Avant mutation : le contrôle est vert.\n');

  let trous = 0, conformes = 0;
  try {
    MUTATIONS.forEach((m, i) => {
      fs.writeFileSync(COEUR, original.replace(m.de, m.vers));
      console.log('#' + (i + 1) + ' ' + m.nom);
      console.log('     ' + m.attendu);
      if (lance()) { console.log('     TROU : le contrôle PASSE malgré la mutation'); trous++; }
      else { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
      fs.writeFileSync(COEUR, original);
    });
  } finally {
    fs.writeFileSync(COEUR, original);
    assert.equal(sha(fs.readFileSync(COEUR)), empreinte, 'le cœur doit être restauré');
    console.log('  ' + empreinte.slice(0, 16) + '  studio-clinique-core.js  restauré');
  }
  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-message-style-titre');
})();
