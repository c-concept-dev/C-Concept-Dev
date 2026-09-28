// Le schéma d'outil de la Présentation est GELÉ — octet pour octet.
//
// Pourquoi ce test, qui n'éprouve aucun comportement : la grammaire compilée par Anthropic à
// partir de ce schéma est au bord de sa taille maximale (incident du 28/09/2026, HTTP 400
// « compiled grammar is too large » ; marge mesurée : un seul tableau de chaînes). Toute addition,
// même minime et même parfaitement valide, peut casser TOUTE la génération de présentations en
// production, sans qu'aucun contrôle local ne la voie.
//
// La règle qui en découle, et que ce test rend mécanique : les améliorations passent par le
// PROMPT (buildPromptSuffix, hors grammaire), jamais par un champ de plus dans le schéma. Un
// échec ici n'est pas forcément une faute — c'est un arrêt : mesurer d'abord par de vrais appels
// (tests/smoke-schema-outil-reel.cjs), et ne mettre à jour l'empreinte ci-dessous qu'ensuite, en
// connaissance de cause.
//
//     node tests/verify-schema-outil-fige.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Empreinte mise à jour VOLONTAIREMENT le 28/09/2026 après le retrait du bloc quiz de la
// génération (enum + trois champs). Valeur précédente : f1284c2f7eb7ded1, 6841 octets — schéma
// pour lequel la mesure par appels réels avait montré une marge NULLE aux trois niveaux
// d'insertion. Le retrait rend 523 octets et rouvre de la marge.
const EMPREINTE = '918126ddfddc2276';
const TAILLE = 6289;

function extraire(source, nom) {
  const debut = source.indexOf('  const ' + nom + ' = {');
  if (debut === -1) throw new Error('schéma introuvable : ' + nom);
  const ouvrante = source.indexOf('{', debut);
  let profondeur = 0, i = ouvrante, dansChaine = null;
  for (; i < source.length; i++) {
    const c = source[i], suivant = source[i + 1];
    if (dansChaine) {
      if (c === '\\') i++;
      else if (c === dansChaine) dansChaine = null;
      continue;
    }
    // Les commentaires comptent : ce fichier est commenté en français, et un « l'outil » dans un
    // // suffit à faire croire à un scanner naïf qu'une chaîne s'ouvre.
    if (c === '/' && suivant === '/') { i = source.indexOf('\n', i); if (i === -1) break; continue; }
    if (c === '/' && suivant === '*') { i = source.indexOf('*/', i + 2) + 1; if (i === 0) break; continue; }
    if (c === '"' || c === "'" || c === '`') { dansChaine = c; continue; }
    if (c === '{') profondeur++;
    else if (c === '}') { profondeur--; if (!profondeur) break; }
  }
  if (profondeur !== 0) throw new Error('accolades non refermées en extrayant ' + nom);
  // eslint-disable-next-line no-eval
  return eval('(' + source.slice(ouvrante, i + 1) + ')');
}

const source = fs.readFileSync(path.join(__dirname, '..', 'studio-clinique-core.js'), 'utf8');
const outil = extraire(source, 'ADOC_STRUCTURED_PRESENTATION_TOOL');
const serialise = JSON.stringify(outil);
const empreinte = crypto.createHash('sha256').update(serialise).digest('hex').slice(0, 16);
const taille = Buffer.byteLength(JSON.stringify(outil.input_schema));

console.log('  outil            : ' + outil.name);
console.log('  input_schema     : ' + taille + ' octets (référence ' + TAILLE + ')');
console.log('  empreinte        : ' + empreinte + ' (référence ' + EMPREINTE + ')');

try {
  assert.equal(empreinte, EMPREINTE);
  assert.equal(taille, TAILLE);
} catch (_) {
  console.error('\nÉCHEC — le schéma d\'outil de la Présentation a changé.');
  console.error('Ce schéma est au bord de la limite de grammaire compilée d\'Anthropic : une');
  console.error('addition valide peut casser toute la génération en production.');
  console.error('Avant de mettre à jour l\'empreinte ci-dessus :');
  console.error('  1. mesurer par de VRAIS appels — node tests/smoke-schema-outil-reel.cjs ;');
  console.error('  2. se demander si l\'instruction ne tient pas dans buildPromptSuffix, qui est');
  console.error('     hors grammaire et donc sans coût.');
  process.exit(1);
}
console.log('\nPASS verify-schema-outil-fige — le schéma est inchangé.');
