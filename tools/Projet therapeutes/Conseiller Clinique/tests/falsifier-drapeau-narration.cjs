// FALSIFICATION DES DEUX LIGNES AJOUTÉES À narration-ia.js.
//
// Le défaut a vécu en production : deux appels manquants à adocEditorMarkDirty. Les ajouter ne
// vaut que si l'on prouve qu'en les RETIRANT, le contrôle échoue. Trois mutations : chaque
// ligne séparément, puis les deux — une seule aurait pu être rattrapée tandis que l'autre
// passait.
//
//   NODE_PATH=<playwright> node tests/falsifier-drapeau-narration.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const MODULE = path.join(RACINE, 'narration-ia.js');
const CONTROLE = 'verify-drapeau-narration-appliquee.cjs';

const APPLIQUER = "      window.adocEditorMarkDirty();\n      panneau.querySelector('.nia-annuler').disabled = false;";
const ANNULER = "      window.adocEditorMarkDirty();\n      dire(panneau, 'Geste annulé : la narration est revenue à son état d’avant.');";

const MUTATIONS = [
  { nom: '« Appliquer (N) » perd sa ligne : le drapeau ne se lève plus',
    lignes: [[APPLIQUER, "      panneau.querySelector('.nia-annuler').disabled = false;"]],
    attendu: 'le badge dirait « Sauvegardé » après N narrations écrites — le défaut de production' },
  { nom: '« Annuler ce geste » perd sa ligne',
    lignes: [[ANNULER, "      dire(panneau, 'Geste annulé : la narration est revenue à son état d’avant.');"]],
    attendu: 'annuler retirerait les narrations sans que l’écran le dise' },
  { nom: 'les DEUX lignes retirées',
    lignes: [[APPLIQUER, "      panneau.querySelector('.nia-annuler').disabled = false;"],
             [ANNULER, "      dire(panneau, 'Geste annulé : la narration est revenue à son état d’avant.');"]],
    attendu: 'l’état du panneau de narration serait muet de bout en bout' },
];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = () => { try { execFileSync(process.execPath, [path.join('tests', CONTROLE)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const original = fs.readFileSync(MODULE, 'utf8');
  const empreinte = sha(original);
  for (const a of [APPLIQUER, ANNULER]) {
    const nb = original.split(a).length - 1;
    assert.equal(nb, 1, 'ancre absente ou multiple (' + nb + ') : ' + a.slice(0, 60));
  }
  console.log('2 ancres vérifiées, chacune présente une fois et une seule.\n');
  assert.ok(lance(), 'avant toute mutation, ' + CONTROLE + ' doit être VERT');
  console.log('Avant mutation : le contrôle est vert.\n');

  let trous = 0, conformes = 0;
  try {
    MUTATIONS.forEach((m, i) => {
      let mute = original;
      m.lignes.forEach(([de, vers]) => { mute = mute.replace(de, vers); });
      assert.notEqual(mute, original, m.nom + ' : la mutation n’a rien changé');
      fs.writeFileSync(MODULE, mute);
      console.log('#' + (i + 1) + ' ' + m.nom);
      console.log('     ' + m.attendu);
      if (lance()) { console.log('     TROU : le contrôle PASSE malgré la mutation'); trous++; }
      else { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
      fs.writeFileSync(MODULE, original);
    });
  } finally {
    fs.writeFileSync(MODULE, original);
    assert.equal(sha(fs.readFileSync(MODULE)), empreinte, 'narration-ia.js doit être restauré');
    console.log('  ' + empreinte.slice(0, 16) + '  narration-ia.js  restauré');
  }
  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-drapeau-narration');
})();
