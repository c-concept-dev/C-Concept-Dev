// LE SCHÉMA DE LA PAGE NEUVE (D2) COMPILE, ET IL EST SÉPARÉ.
//
// Deux choses qu'aucun appel réel n'est nécessaire pour établir, et qu'il vaut mieux savoir
// avant de dépenser un appel :
//   1. emit_new_slide est un schéma JSON valide, qui compile ;
//   2. il n'autorise ni image ni vidéo, refuse tout champ inventé, et NE TOUCHE PAS au schéma
//      gelé emit_presentation_document (b1b0155cb8eba26c), qui reste identique octet pour octet.
//
// Le test de fumée réel (tests/LANCER-SMOKE.sh) reste nécessaire : lui seul dit si Anthropic
// accepte ce schéma. Il demande la clé de Christophe et n'a pas été lancé ici.
//
//   node tests/verify-schema-nouvelle-page.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Le schéma n'est pas exposé au runtime Node : on le lit dans la source, comme le fait déjà
// verify-schema-outil-fige.
const source = fs.readFileSync(path.join(RACINE, 'studio-clinique-core.js'), 'utf8');
// Le test de fumée réel n'extrait les schémas qu'avec `const ` : le septième avait été déclaré
// `var`, et le test aurait échoué sur « schéma introuvable » en ayant l'air d'un refus de l'API.
// Cette ancre est donc écrite comme la sienne, pour que le défaut ne puisse pas revenir d'un côté
// sans faire tomber l'autre.
const debut = source.indexOf('  const ADOC_NEW_SLIDE_TOOL = {');
assert.ok(debut > 0, 'ADOC_NEW_SLIDE_TOOL doit exister dans le cœur');
const fin = source.indexOf('\n  };', debut) + '\n  };'.length;
// Ramené dans CE contexte : `vm.runInNewContext` rend des objets d'un autre contexte V8, dont
// les tableaux n'ont pas le même prototype — `assert.deepEqual` strict les refuse alors même que
// leur contenu est identique, et le message d'erreur montre deux tableaux qui se ressemblent mot
// pour mot. Une heure perdue la première fois ; plus jamais.
const PREFIXE = '  const ADOC_NEW_SLIDE_TOOL = ';
const outil = JSON.parse(JSON.stringify(
  vm.runInNewContext('(' + source.slice(debut + PREFIXE.length, fin).replace(/;\s*$/, '') + ')')));

assert.equal(outil.name, 'emit_new_slide', 'le nom de l\'outil : ' + outil.name);
pass('l\'outil s\'appelle emit_new_slide, et c\'est un schéma à part entière.');

// Le paquet ajv du dépôt est un paquet de NAVIGATEUR : il se pose sur `window`. On lui donne
// donc un `window`, plutôt que d'en installer un second depuis le réseau.
const bac = { window: {}, console: console };
bac.globalThis = bac;
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'vendor', 'ajv2020.min.js'), 'utf8'), bac);
// `strict` était DEMANDÉ pour D2, et je l'avais oublié : les six autres schémas le portent, pas
// le mien. Il est vérifié ici, et une mutation le fait tomber s'il repart.
assert.equal(outil.strict, true, 'l\'outil doit être déclaré strict (D2) : ' + outil.strict);
// Ce que la documentation d'Anthropic autorise en mode strict, et que ce contrôle fait respecter :
// `minItems` SEULEMENT aux valeurs 0 et 1 ; `minLength`, `maxLength`, `maxItems` et les bornes
// numériques pas du tout. (J'avais d'abord retiré minItems en croyant qu'il était interdit : il ne
// l'est pas, et il porte ici une vraie garantie.)
const brut = JSON.stringify(outil.input_schema);
for (const mot of ['minLength', 'maxLength', 'maxItems', 'minimum', 'maximum', 'multipleOf', 'oneOf']) {
  assert.ok(!brut.includes('"' + mot + '"'),
    'mot-clé non pris en charge en mode strict : ' + mot);
}
(function bornes(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(bornes);
  if ('minItems' in o) assert.ok(o.minItems === 0 || o.minItems === 1,
    'minItems n\'est accepté qu\'aux valeurs 0 et 1 ; vu : ' + o.minItems);
  Object.values(o).forEach(bornes);
})(outil.input_schema);
pass('strict, sans mot-clé non pris en charge, et minItems seulement aux valeurs permises.');

// ── VARIANTE B : UNE BRANCHE FERMÉE PAR TYPE ────────────────────────────────────────────
// C'est ce qui empêche le défaut du 19 octobre À LA SOURCE : un bloc de liste ne peut plus
// porter des champs de table, ni omettre ses propres champs.
const branches = outil.input_schema.properties.blocks.items.anyOf;
assert.ok(Array.isArray(branches), 'blocks.items doit être un anyOf de branches par type');
assert.deepEqual(branches.map((b) => b.properties.type.const).sort(),
  ['callout', 'heading', 'list', 'paragraph', 'quote', 'table'],
  'six branches, une par type déjà existant');
for (const b of branches) {
  const nom = b.properties.type.const;
  assert.equal(b.additionalProperties, false, nom + ' : la branche doit être fermée');
  assert.deepEqual(Object.keys(b.properties).sort(), (b.required || []).slice().sort(),
    nom + ' : TOUS les champs de la branche doivent être requis — aucun facultatif');
}
const champs = (t) => Object.keys(branches.find((b) => b.properties.type.const === t).properties).sort();
assert.deepEqual(champs('list'), ['items', 'ordered', 'type'],
  'une liste ne porte QUE ses champs : ' + champs('list').join(', '));
assert.deepEqual(champs('table'), ['headers', 'rows', 'type'],
  'un tableau ne porte QUE ses champs : ' + champs('table').join(', '));
assert.deepEqual(champs('paragraph'), ['text', 'type'], 'un paragraphe ne porte que text');
pass('six branches fermées, tous les champs requis : un bloc de liste ne peut plus porter '
  + 'des champs de tableau — le défaut du 19 octobre est impossible à la source.');

// Un seul paramètre de type union, par la méthode documentée (un anyOf compte pour un).
let unions = 0;
(function compter(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(compter);
  if (o.anyOf || Array.isArray(o.type)) unions++;
  Object.values(o).forEach(compter);
})(outil.input_schema);
assert.equal(unions, 1, 'un seul paramètre de type union (limite documentée : 16) ; compté : ' + unions);
pass('un seul paramètre de type union sur les seize permis.');

const Ajv2020 = bac.window.Ajv2020.default || bac.window.Ajv2020;
const ajv = new Ajv2020({ strict: false });
const valide = ajv.compile(outil.input_schema);
pass('le schéma compile.');

// Rien d'autre que les types déjà existants, et ni image ni vidéo.
const types = branches.map((b) => b.properties.type.const);
assert.deepEqual([...types].sort(), ['callout', 'heading', 'list', 'paragraph', 'quote', 'table'],
  'types autorisés : ' + JSON.stringify(types));
assert.ok(!types.includes('image') && !types.includes('video'), 'ni image ni vidéo');
pass('six types de blocs, tous déjà existants ; ni image ni vidéo : ' + types.join(', '));

// Un champ inventé est REFUSÉ, à la racine comme dans un bloc.
assert.equal(outil.input_schema.additionalProperties, false, 'racine stricte');
branches.forEach((b) => assert.equal(b.additionalProperties, false, 'blocs stricts'));
assert.equal(valide({ title: 'T', blocks: [{ type: 'paragraph', text: 'a' }] }), true,
  'une page normale est acceptée : ' + JSON.stringify(valide.errors));
assert.equal(valide({ title: 'T', blocks: [{ type: 'paragraph', text: 'a' }], sources: ['x'] }), false,
  'un champ inventé à la racine doit être refusé');
assert.equal(valide({ title: 'T', blocks: [{ type: 'paragraph', text: 'a', citation: 'Bowlby 1969' }] }), false,
  'un champ inventé dans un bloc doit être refusé');
assert.equal(valide({ title: 'T', blocks: [{ type: 'image', text: 'a' }] }), false,
  'un bloc image doit être refusé');
pass('un champ inventé est refusé à la racine comme dans un bloc ; un bloc image aussi.');

// La consigne « aucune référence bibliographique » est DANS la description de l'outil, donc
// toujours transmise, même si le prompt système changeait.
assert.ok(/AUCUNE référence bibliographique/i.test(outil.description),
  'la description de l\'outil doit interdire les références bibliographiques');
pass('la consigne « aucune référence bibliographique » est portée par l\'outil lui-même.');

// ── LA RÉPONSE RÉELLE DU 19 OCTOBRE, JUGÉE PAR LES DEUX FORMES ────────────────────────────
// L'ancienne forme plate l'ACCEPTAIT — c'est exactement le défaut. La forme B la refuse, donc
// le modèle ne peut plus la produire : le défaut est empêché à la source.
const { REPONSE_REELLE_19_OCTOBRE } = require('./fixtures-page-generee.cjs');
const ANCIENNE_FORME = {
  type: 'object', additionalProperties: false, required: ['title', 'blocks'],
  properties: {
    title: { type: 'string' },
    blocks: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['type'],
      properties: {
        type: { type: 'string', enum: ['heading', 'paragraph', 'list', 'callout', 'quote', 'table'] },
        text: { type: 'string' }, level: { type: 'integer', enum: [2, 3] },
        items: { type: 'array', items: { type: 'string' } }, ordered: { type: 'boolean' },
        visualRole: { type: 'string', enum: ['info', 'warning', 'success'] },
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      } } },
  },
};
assert.equal(ajv.compile(ANCIENNE_FORME)(REPONSE_REELLE_19_OCTOBRE), true,
  'l\'ancienne forme plate ACCEPTAIT la réponse du 19 octobre — c\'est le défaut');
assert.equal(valide(REPONSE_REELLE_19_OCTOBRE), false,
  'la forme B doit la REFUSER : ' + JSON.stringify(valide.errors && valide.errors.slice(0, 1)));
const faute = (valide.errors || []).map((e) => e.instancePath + ' ' + e.message).join(' | ');
assert.ok(/blocks\/1/.test(faute), 'la faute doit porter sur le premier bloc de liste : ' + faute);
pass('la réponse RÉELLE du 19 octobre : acceptée par l\'ancienne forme, REFUSÉE par la forme B.');

// Et la forme qu'une liste doit avoir est, elle, acceptée.
assert.equal(valide({ title: 'T', blocks: [
  { type: 'list', ordered: false, items: ['un', 'deux', 'trois'] }] }), true,
  'une liste complète doit être acceptée : ' + JSON.stringify(valide.errors));
assert.equal(valide({ title: 'T', blocks: [{ type: 'list', ordered: false, items: [] }] }), false,
  'une liste vide doit être refusée (minItems 1)');
pass('une liste rédigée passe ; une liste vide ne passe pas.');

// ET SURTOUT : le schéma gelé n'a pas bougé.
const { execFileSync } = require('node:child_process');
execFileSync(process.execPath, [path.join(__dirname, 'verify-schema-outil-fige.cjs')], { stdio: 'pipe' });
pass('le schéma gelé emit_presentation_document (b1b0155cb8eba26c) est intact.');

console.log('\nPASS verify-schema-nouvelle-page — ' + n + ' contrôles.');
