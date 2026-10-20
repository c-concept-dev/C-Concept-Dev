// FALSIFICATION DU CONTRÔLE DE LA SAUVEGARDE (Q7).
//
// Trois façons de rompre la promesse faite à Christophe — « je retrouve MON document » — et
// trois mutations pour vérifier que le contrôle les voit. Deux visent le cœur, une vise le faux
// Worker : un serveur qui rendrait une version périmée tromperait l'utilisatrice tout autant
// qu'un cœur fautif, et le contrôle doit l'attraper aussi.
//
//   NODE_PATH=<playwright> node tests/falsifier-sauvegarder.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const COEUR = path.join(RACINE, 'studio-clinique-core.js');
const FAUX = path.join(__dirname, 'faux-worker-documents.cjs');
const CONTROLE = 'verify-sauvegarder-mes-creations.cjs';

const MUTATIONS = [
  { nom: 'chaque sauvegarde crée une NOUVELLE entrée dans « Mes créations »',
    fichier: COEUR,
    de: '      if (!art._adocClinicalDocumentId) {\n        // Première sauvegarde de ce document précis — crée le document ET sa version initiale.',
    vers: '      if (true) {\n        // Première sauvegarde de ce document précis — crée le document ET sa version initiale.',
    attendu: 'la liste compterait deux entrées, puis trois : Christophe ne saurait plus laquelle est la sienne' },
  { nom: 'la relecture rend la PREMIÈRE version, pas la dernière',
    fichier: FAUX,
    de: '            const v = d.versions[d.versions.length - 1];',
    vers: '            const v = d.versions[0];',
    attendu: 'un autre ordinateur rendrait un état ancien : le travail serait perdu sans un mot' },
  // On vise le `finally` d'adocWsSave, et non adocUpdateSaveStatusUI : une première version de
  // cette mutation grisait le bouton DANS l'affichage de l'état, mais le `finally`, qui court
  // APRÈS, le redégrisait — la mutation ne mutait donc rien, et le « trou » était le sien, pas
  // celui du contrôle.
  { nom: '« Sauvegarder » reste grisé quand rien n’a changé',
    fichier: COEUR,
    de: "    } finally {\n      if (btn) btn.disabled = false;\n    }\n  };\n\n  // Sujet 2",
    vers: "    } finally {\n      if (btn) btn.disabled = !(art && art._ccEditorDirty);\n    }\n  };\n\n  // Sujet 2",
    attendu: 'le bouton devient inerte juste après une sauvegarde réussie' },
];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = () => { try { execFileSync(process.execPath, [path.join('tests', CONTROLE)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const originaux = new Map([[COEUR, fs.readFileSync(COEUR, 'utf8')],
                             [FAUX, fs.readFileSync(FAUX, 'utf8')]]);
  const empreintes = new Map([...originaux].map(([f, c]) => [f, sha(c)]));

  for (const m of MUTATIONS) {
    const nb = originaux.get(m.fichier).split(m.de).length - 1;
    assert.equal(nb, 1, 'ancre absente ou multiple (' + nb + ') : ' + m.nom);
  }
  console.log(MUTATIONS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');
  assert.ok(lance(), 'avant toute mutation, ' + CONTROLE + ' doit être VERT');
  console.log('Avant mutation : le contrôle est vert.\n');

  let trous = 0, conformes = 0;
  try {
    MUTATIONS.forEach((m, i) => {
      fs.writeFileSync(m.fichier, originaux.get(m.fichier).replace(m.de, m.vers));
      console.log('#' + (i + 1) + ' ' + m.nom);
      console.log('     ' + m.attendu);
      if (lance()) { console.log('     TROU : le contrôle PASSE malgré la mutation'); trous++; }
      else { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
      fs.writeFileSync(m.fichier, originaux.get(m.fichier));
    });
  } finally {
    for (const [f, c] of originaux) {
      fs.writeFileSync(f, c);
      assert.equal(sha(fs.readFileSync(f)), empreintes.get(f), path.basename(f) + ' doit être restauré');
      console.log('  ' + empreintes.get(f).slice(0, 16) + '  ' + path.basename(f) + '  restauré');
    }
  }

  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-sauvegarder');
})();
