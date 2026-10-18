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
const debut = source.indexOf('var ADOC_NEW_SLIDE_TOOL = {');
assert.ok(debut > 0, 'ADOC_NEW_SLIDE_TOOL doit exister dans le cœur');
const fin = source.indexOf('\n  };', debut) + '\n  };'.length;
const outil = vm.runInNewContext('(' + source.slice(debut + 'var ADOC_NEW_SLIDE_TOOL = '.length, fin).replace(/;\s*$/, '') + ')');

assert.equal(outil.name, 'emit_new_slide', 'le nom de l\'outil : ' + outil.name);
pass('l\'outil s\'appelle emit_new_slide, et c\'est un schéma à part entière.');

// Le paquet ajv du dépôt est un paquet de NAVIGATEUR : il se pose sur `window`. On lui donne
// donc un `window`, plutôt que d'en installer un second depuis le réseau.
const bac = { window: {}, console: console };
bac.globalThis = bac;
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'vendor', 'ajv2020.min.js'), 'utf8'), bac);
const Ajv2020 = bac.window.Ajv2020.default || bac.window.Ajv2020;
const ajv = new Ajv2020({ strict: false });
const valide = ajv.compile(outil.input_schema);
pass('le schéma compile.');

// Rien d'autre que les types déjà existants, et ni image ni vidéo.
const types = outil.input_schema.properties.blocks.items.properties.type.enum;
assert.deepEqual([...types].sort(), ['callout', 'heading', 'list', 'paragraph', 'quote', 'table'],
  'types autorisés : ' + JSON.stringify(types));
assert.ok(!types.includes('image') && !types.includes('video'), 'ni image ni vidéo');
pass('six types de blocs, tous déjà existants ; ni image ni vidéo : ' + types.join(', '));

// Un champ inventé est REFUSÉ, à la racine comme dans un bloc.
assert.equal(outil.input_schema.additionalProperties, false, 'racine stricte');
assert.equal(outil.input_schema.properties.blocks.items.additionalProperties, false, 'blocs stricts');
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

// ET SURTOUT : le schéma gelé n'a pas bougé.
const { execFileSync } = require('node:child_process');
execFileSync(process.execPath, [path.join(__dirname, 'verify-schema-outil-fige.cjs')], { stdio: 'pipe' });
pass('le schéma gelé emit_presentation_document (b1b0155cb8eba26c) est intact.');

console.log('\nPASS verify-schema-nouvelle-page — ' + n + ' contrôles.');
