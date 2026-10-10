// LE WORKER ACCEPTE-T-IL LE CHAMP RACINE `narration` DU LOT 1a ?
//
// La question se tranche en EXÉCUTANT le validateur du Worker, pas en le lisant. Ce test
// découpe les trois fonctions concernées dans Worker/index.js, les évalue dans un bac à sable
// Node, et leur soumet des documents. Il n'appelle AUCUN Worker déployé, ne touche à rien dans
// Worker/, n'écrit rien, et n'a besoin d'aucun secret.
//
// Ce qu'il établit : le Worker valide par une liste de contrôles POSITIFS (présence et type de
// ce qu'il exige), jamais par une liste blanche de champs ni par un schéma fermé. Un champ
// racine inconnu n'est donc pas examiné, et le document est stocké tel quel
// (JSON.stringify(document) dans content_json) puis relu tel quel (JSON.parse).
//
//   node tests/verify-worker-accepte-narration.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX = path.join(__dirname, '..', '..', '..', '..', 'Worker', 'index.js');

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

function decouper(source, signature) {
  const debut = source.indexOf(signature);
  assert.notEqual(debut, -1, 'introuvable dans Worker/index.js : ' + signature);
  // Appariement d'accolades depuis la première qui suit la signature.
  let i = source.indexOf('{', debut), profondeur = 0;
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') { profondeur--; if (profondeur === 0) return source.slice(debut, j + 1); }
  }
  throw new Error('fonction non refermée : ' + signature);
}

(async () => {
  assert.ok(fs.existsSync(INDEX), 'Worker/index.js introuvable : ' + INDEX);
  const src = fs.readFileSync(INDEX, 'utf8');

  // Les deux constantes, lues telles quelles dans le fichier — jamais recopiées à la main.
  const kinds = src.match(/var CLINICAL_DOCUMENT_KINDS = (\[[^\]]*\]);/);
  const types = src.match(/var CLINICAL_DOCUMENT_BLOCK_TYPES = (\[[^\]]*\]);/);
  assert.ok(kinds && types, 'constantes du Worker introuvables');

  const bac = { __name: function () {} };
  vm.createContext(bac);
  vm.runInContext(
    'var CLINICAL_DOCUMENT_KINDS = ' + kinds[1] + ';\n'
    + 'var CLINICAL_DOCUMENT_BLOCK_TYPES = ' + types[1] + ';\n'
    + decouper(src, 'function adocValidateStructuredClinicalDocument(') + '\n'
    + decouper(src, 'function adocValidateClinicalDocumentPayload(') + '\n', bac);
  pass('validateur du Worker extrait et évalué hors ligne (aucun appel, aucun secret).');

  const valider = (document, engine, kind) =>
    vm.runInContext('adocValidateClinicalDocumentPayload(' + JSON.stringify(document) + ', '
      + JSON.stringify(engine || 'structured') + ', ' + JSON.stringify(kind || 'presentation') + ')', bac);

  const docBase = {
    schemaVersion: 1,
    clinicalDocument: {
      title: 'Essai', documentKind: 'presentation',
      blocks: [{ id: 'slide-01', type: 'card', content: { title: 'A', blocks: [] } }],
    },
    sourceSnapshot: { sourceSnapshotId: 's-1', entries: [] },
  };

  // ── 1. Le témoin : sans narration, le document passe ──────────────────────────────────────
  assert.equal(valider(docBase), null, 'le document de référence doit passer');
  pass('témoin : un document sans narration est accepté.');

  // ── 2. AVEC le champ racine `narration` du lot 1a ─────────────────────────────────────────
  const docNarration = JSON.parse(JSON.stringify(docBase));
  docNarration.clinicalDocument.narration = [
    { stepId: 'slide-01', text: 'Ce que je dirais pendant cette étape.' },
  ];
  assert.equal(valider(docNarration), null,
    'le champ racine narration ne doit PAS être refusé');
  pass('le champ racine `narration` passe le validateur du Worker — rien à changer, aucun déploiement.');

  // ── 3. Et ce n'est pas une indulgence générale mal comprise : le validateur REFUSE bien ───
  // ce qu'il doit refuser. Sans cette vérification, « narration passe » ne voudrait rien dire :
  // un validateur qui accepte tout accepterait narration aussi.
  const refus = [
    ['blocs vides', (d) => { d.clinicalDocument.blocks = []; }, /blocks/],
    ['type de bloc inconnu', (d) => { d.clinicalDocument.blocks[0].type = 'narration'; }, /type invalide/],
    ['titre absent', (d) => { delete d.clinicalDocument.title; }, /title/],
    ['documentKind inconnu', (d) => { d.clinicalDocument.documentKind = 'narration'; }, /documentKind/],
    ['snapshot absent', (d) => { delete d.sourceSnapshot; }, /sourceSnapshot/],
    ['entries non tableau', (d) => { d.sourceSnapshot.entries = {}; }, /entries/],
  ];
  refus.forEach(([nom, casser, motif]) => {
    const d = JSON.parse(JSON.stringify(docNarration));
    casser(d);
    const err = valider(d);
    assert.ok(err && motif.test(err), 'doit être refusé (' + nom + ') : ' + err);
  });
  pass('le validateur refuse bien les ' + refus.length + ' formes invalides éprouvées — son indulgence envers `narration` est délibérée, pas générale.');

  // ── 4. Aucune liste blanche de champs racine, aucun schéma fermé ──────────────────────────
  const validateur = decouper(src, 'function adocValidateStructuredClinicalDocument(');
  assert.equal(/additionalProperties/.test(validateur), false, 'pas de additionalProperties');
  assert.equal(/Object\.keys\(doc\)/.test(validateur), false, 'pas d\'énumération des champs du document');
  assert.equal(/ajv|Ajv|validateSchema|compile\(/.test(validateur), false, 'pas de validation par schéma');
  pass('aucune liste blanche de champs, aucun schéma fermé : un champ racine inconnu n\'est pas examiné.');

  // ── 5. Le stockage est verbatim, et la relecture aussi ────────────────────────────────────
  assert.ok(src.indexOf('JSON.stringify(document), now, change_summary || null, engine') !== -1,
    'la version créée doit stocker le document VERBATIM dans content_json');
  const relecture = decouper(src, 'function adocParseClinicalDocumentContent(');
  assert.match(relecture, /JSON\.parse\(row\.content_json\)/,
    'la relecture doit être un JSON.parse simple, sans filtrage : ' + relecture);
  pass('stockage verbatim (JSON.stringify) et relecture verbatim (JSON.parse) : la narration fait l\'aller-retour intacte.');

  console.log('\nPASS verify-worker-accepte-narration — ' + n + '/' + n + '.');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
