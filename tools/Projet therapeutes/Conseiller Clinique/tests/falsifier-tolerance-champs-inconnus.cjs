// FALSIFICATION DU SOCLE DE TOLÉRANCE — cinq mutations.
//
// Une tolérance mal faite est plus dangereuse qu'un refus : elle laisse passer de vraies erreurs,
// ou perd en silence le champ qu'elle prétend conserver. Chaque mutation vise une de ces façons
// de se tromper, et le contrôle doit ÉCHOUER à chaque fois.
//
//   NODE_PATH=<playwright> node tests/falsifier-tolerance-champs-inconnus.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const COEUR = path.join(RACINE, 'studio-clinique-core.js');
const CONTROLE = 'verify-tolerance-champs-inconnus.cjs';

const MUTATIONS = [
  { nom: 'la tolérance avale TOUTE erreur (plus de revalidation)',
    de: "    const souples = adocInitSchemaValidatorsSouples();\n    if (souples && souples[kind] && souples[kind](obj)) {",
    vers: "    const souples = adocInitSchemaValidatorsSouples();\n    if (true) {",
    attendu: 'un type invalide, un champ obligatoire manquant passeraient : le pire des cas' },

  { nom: '`required` tombe aussi du schéma assoupli',
    de: "        if (cle === 'additionalProperties' && valeur[cle] === false) return;",
    vers: "        if (cle === 'additionalProperties' && valeur[cle] === false) return;\n        if (cle === 'required') return;",
    attendu: 'un document amputé d’un champ obligatoire serait toléré — l’assouplissement doit '
      + 'être chirurgical, jamais large' },

  { nom: 'D8 devient tolérant (la sortie du modèle n’est plus jugée strictement)',
    de: "    const bilan = adocValidateSchema('clinicalDocument', adocPageNeuveCandidat(doc, index, page).candidat);",
    vers: "    const bilan = adocValidateSchemaTolerant('clinicalDocument', adocPageNeuveCandidat(doc, index, page).candidat);",
    attendu: 'un champ inventé par le modèle dans `content` entrerait dans le document' },

  { nom: 'le champ inconnu est perdu à la sauvegarde',
    de: "      clinicalDocument: art._adocStructuredDoc,",
    vers: "      clinicalDocument: JSON.parse(JSON.stringify(art._adocStructuredDoc, function (k, v) {\n"
      + "        return k === '__champDEssaiInconnu' ? undefined : v; })),",
    attendu: 'une tolérance qui perd le champ est PIRE qu’un refus : l’utilisatrice croit son '
      + 'réglage gardé et le retrouve absent' },

  { nom: 'l’avertissement est supprimé',
    de: "      console.warn('[compatibilité ascendante] ' + kind + ' : '",
    vers: "      ((function(){})) ('[compatibilité ascendante] ' + kind + ' : '",
    attendu: 'le document s’ouvrirait sans style et sans un mot : personne ne saurait pourquoi' },
];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = () => { try { execFileSync(process.execPath, [path.join('tests', CONTROLE)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const original = fs.readFileSync(COEUR, 'utf8');
  const empreinte = sha(original);
  for (const m of MUTATIONS) {
    const nb = original.split(m.de).length - 1;
    assert.equal(nb, 1, m.nom + ' : ancre absente ou multiple (' + nb + ')');
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
  console.log('\nPASS falsifier-tolerance-champs-inconnus');
})();
