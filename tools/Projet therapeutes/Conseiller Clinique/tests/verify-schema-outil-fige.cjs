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

// Empreinte mise à jour VOLONTAIREMENT le 29/09/2026 après l'ajout d'imageQuery et imageAlt à une
// entrée deepDives (illustration d'une page d'approfondissement) — VALIDÉ PAR APPEL RÉEL avant ce
// changement : smoke-schema-outil-reel.cjs rend HTTP 200 sur PRESENTATION à 6544 octets. La marge
// tient donc à +2 chaînes scalaires (23 → 25).
//
// Les descriptions de ces deux champs sont volontairement COURTES. Écrites en entier, elles
// portaient le schéma à 6916 octets — AU-DESSUS des 6841 d'un schéma dont la marge était mesurée
// nulle. Rien ne dit que les descriptions comptent dans la grammaire compilée, mais brûler de la
// marge pour du texte explicatif serait absurde : le détail vit dans buildPromptSuffix, hors
// grammaire et donc sans coût.
//
// Valeurs précédentes :
//   918126ddfddc2276, 6289 o — après le retrait du bloc quiz (28/09), qui rendait 523 octets ;
//   f1284c2f7eb7ded1, 6841 o — schéma dont les appels réels montraient une marge NULLE.
// Mise à jour à nouveau le 29/09/2026 : la description de `paragraphs` disait encore « jamais de
// liste, callout, citation ni image dans cette version », devenue FAUSSE avec les puces par préfixe
// — et surtout elle contredisait, au plus près du champ, la consigne de génération qui les demande.
// Remplacée par une phrase PLUS COURTE : le schéma RÉTRÉCIT (6544 → 6516) et ne gagne aucune
// chaîne. Revalidé malgré tout par appel réel, parce que la règle ne souffre pas d'exception même
// quand le raisonnement paraît sûr : HTTP 200 sur PRESENTATION à 6516 octets.
const EMPREINTE = '4fa4c56605d03b65';
const TAILLE = 6516;

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
