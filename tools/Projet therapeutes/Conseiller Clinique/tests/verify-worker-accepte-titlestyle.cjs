// Q1 — LE WORKER ACCEPTE-T-IL `titleStyle` ? MESURÉ, PAS SUPPOSÉ.
//
// Avant d'ajouter un champ au document, il faut savoir si le serveur le refusera. Ce contrôle
// EXTRAIT de Worker/index.js, par ses bornes, le validateur réellement en service, et le fait
// tourner hors ligne sur des charges utiles fabriquées.
//
// LECTURE SEULE DE Worker/index.js : rien n'est déployé, rien n'est modifié, aucun appel réseau.
// Si un jour ce validateur devenait une liste blanche, CE CONTRÔLE ÉCHOUERAIT — et c'est
// exactement son rôle : nous l'apprendre avant la mise en production, pas après. Modifier le
// Worker serait alors une décision de Christophe, jamais la nôtre.
//
//   node tests/verify-worker-accepte-titlestyle.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Le Worker vit à la racine du dépôt, cinq niveaux au-dessus de tests/.
const WORKER = path.join(__dirname, '..', '..', '..', '..', 'Worker', 'index.js');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

if (!fs.existsSync(WORKER)) {
  console.error('\nÉCHEC  Worker/index.js introuvable : ' + WORKER);
  console.error('Sans lui, on ne sait PAS si le serveur acceptera titleStyle.');
  process.exit(1);
}
const src = fs.readFileSync(WORKER, 'utf8');

// Extraction par bornes — c'est bien SON code qu'on juge, jamais une copie.
const prendre = (debut, fin) => {
  const d = src.indexOf(debut);
  assert.ok(d > 0, 'introuvable dans Worker/index.js : ' + debut);
  const f = src.indexOf(fin, d);
  assert.ok(f > d, 'fin introuvable pour : ' + debut);
  return src.slice(d, f + fin.length);
};
const consts = ['CLINICAL_DOCUMENT_KINDS', 'CLINICAL_DOCUMENT_BLOCK_TYPES'].map((nom) => {
  const m = src.match(new RegExp('(?:var|const|let)\\s+' + nom + '\\s*=\\s*\\[[^\\]]*\\];'));
  assert.ok(m, 'constante introuvable dans le Worker : ' + nom);
  return m[0];
}).join('\n');

const bac = { console, Array, Object, String, Number, JSON };
bac.globalThis = bac;
vm.runInNewContext(consts + '\n'
  + prendre('function adocValidateStructuredClinicalDocument(document, documentKind) {', '\n}') + '\n'
  + prendre('function adocValidateClinicalDocumentPayload(document, generationEngine, documentKind) {', '\n}') + '\n'
  + 'globalThis.__valide = adocValidateClinicalDocumentPayload;', bac);
const valide = bac.__valide;
pass('le validateur du Worker est extrait et exécutable hors ligne (aucun déploiement, aucun appel).');

// Un style de titre de la MÊME forme que celui d'un bloc — c'est la décision de Christophe.
const STYLE = { fontFamily: 'Lora', fontSizePt: 20, color: '#2f4f4f', fontWeight: '700',
  fontStyle: 'italic', textAlign: 'center' };
const charge = (contenuCarte, racineEnPlus) => ({
  schemaVersion: 1,
  clinicalDocument: Object.assign({
    title: 'Un document d’essai', documentKind: 'presentation',
    blocks: [{ id: 'c1', type: 'card', content: contenuCarte, citationIds: [], validation: {} }],
  }, racineEnPlus || {}),
  sourceSnapshot: { sourceSnapshotId: 's1', entries: [] },
});
const CARTE = { title: 'Première page', imageRef: null, imageAlt: null, blocks: [] };

// ── 1. Référence : sans le champ, la charge passe ───────────────────────────────────────────
assert.equal(valide(charge(CARTE), 'structured', 'presentation'), null,
  'une charge utile SANS titleStyle doit passer — sinon le repère ne vaut rien');
pass('repère : une charge utile sans titleStyle est acceptée.');

// ── 2. titleStyle sur une CARTE ─────────────────────────────────────────────────────────────
const r2 = valide(charge(Object.assign({}, CARTE, { titleStyle: STYLE })), 'structured', 'presentation');
assert.equal(r2, null, 'titleStyle dans content d’une carte doit être ACCEPTÉ ; refus : ' + JSON.stringify(r2));
pass('titleStyle sur une carte : accepté par le Worker.');

// ── 3. titleStyle à la RACINE ───────────────────────────────────────────────────────────────
const r3 = valide(charge(CARTE, { titleStyle: STYLE }), 'structured', 'presentation');
assert.equal(r3, null, 'titleStyle à la racine doit être ACCEPTÉ ; refus : ' + JSON.stringify(r3));
pass('titleStyle à la racine du document : accepté par le Worker.');

// ── 4. Les deux à la fois, sur les trois types de document concernés ────────────────────────
for (const kind of ['presentation', 'carrousel', 'fiche']) {
  const doc = charge(Object.assign({}, CARTE, { titleStyle: STYLE }), { titleStyle: STYLE });
  doc.clinicalDocument.documentKind = kind;
  if (kind === 'fiche') {
    doc.clinicalDocument.blocks = [{ id: 'b1', type: 'paragraph',
      content: { text: 'Un paragraphe.' }, citationIds: [], validation: {} }];
  }
  const r = valide(doc, 'structured', kind);
  assert.equal(r, null, kind + ' avec titleStyle doit passer ; refus : ' + JSON.stringify(r));
}
pass('présentation, carrousel et fiche portant titleStyle : tous acceptés.');

// ── 5. Et le validateur n'est PAS inerte ────────────────────────────────────────────────────
// Sans ce pas, les quatre précédents ne prouveraient rien : un validateur qui dit toujours « oui »
// accepterait titleStyle sans que cela ait le moindre sens.
assert.notEqual(valide({ schemaVersion: 1,
  clinicalDocument: { title: 'x', documentKind: 'presentation', blocks: [] },
  sourceSnapshot: { sourceSnapshotId: 's', entries: [] } }, 'structured', 'presentation'), null,
  'il doit REFUSER un blocs vide');
assert.notEqual(valide({ schemaVersion: 1,
  clinicalDocument: { title: 'x', documentKind: 'presentation',
    blocks: [{ id: 'b', type: 'type-inexistant', content: {} }] },
  sourceSnapshot: { sourceSnapshotId: 's', entries: [] } }, 'structured', 'presentation'), null,
  'il doit REFUSER un type de bloc inconnu');
assert.notEqual(valide(charge(CARTE), 'structured', 'fiche'), null,
  'il doit REFUSER un documentKind incohérent');
pass('le validateur n’est pas inerte : il refuse bien un blocs vide, un type inconnu, un kind incohérent.');

console.log('\n  CE QUE CELA DIT : le validateur du Worker vérifie des PRÉSENCES et des TYPES.');
console.log('  Il ne porte aucune liste blanche, aucun additionalProperties, aucun schéma JSON.');
console.log('  Un champ inconnu traverse et est stocké tel quel (JSON.stringify → content_json).');
console.log('  AUCUNE modification de Worker/** n’est nécessaire pour Q1.');
console.log('\nPASS verify-worker-accepte-titlestyle — ' + n + ' contrôles.');
