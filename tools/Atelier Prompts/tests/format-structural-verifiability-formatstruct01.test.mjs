/* FORMAT-STRUCT-01 — CE QUE LE REGISTRE GELÉ PERMET RÉELLEMENT DE VÉRIFIER.
 * ============================================================================
 *
 * Le registre FORMATS décrit trente-deux livrables. Chacun porte une phrase de
 * validité. La question de ce lot n'a jamais été « comment vérifier plus », mais
 * « lesquelles de ces phrases sont ENTIÈREMENT décidables sans lire le sens ».
 *
 * LA RÉPONSE MESURÉE, ET ELLE EST INCONFORTABLE : une seule est structurellement
 * vérifiable aujourd'hui — json, « valide au sens JSON.parse() ». Deux autres
 * sont entièrement décidables sur le papier :
 *
 *   tableau_comparatif  « En-tête et séparateur présents, même nombre de
 *                         colonnes sur chaque ligne. »
 *   list                « Un élément par ligne, aucune ligne d'introduction. »
 *
 * ET ELLES NE SONT PAS IMPLÉMENTÉES, POUR UNE RAISON QUI SE MESURE. Le point où
 * un format reçoit sa forme structurelle est `archVocabulaireStructurel`, et
 * cette fonction se trouve À L'INTÉRIEUR de la plage gelée du moteur Architecte.
 * Ce lot l'a vérifié de la seule manière honnête : en tentant la modification,
 * en voyant le hash gelé changer, et en revenant à l'octet près. Le chemin qui
 * porte le seul livrable final du produit — Architecte Pro — est donc lié à un
 * vocabulaire json-seul, et ce lien est gelé.
 *
 * Étendre la couverture du seul côté Rapide était possible. Ç'aurait été pire :
 * deux vocabulaires divergents pour un même registre, c'est-à-dire deux réponses
 * différentes à la même question. Et ajouter au moteur des formes que rien ne
 * peut atteindre aurait recréé le code orphelin que cinq lots de nettoyage
 * viennent de retirer.
 *
 * CE QUE FERME CE LOT, ALORS : la classification. Trente-deux formats, chacun
 * rangé, chacun adossé à sa phrase gelée, et la preuve qu'aucune règle non
 * vérifiable ne peut produire un succès. Ce que le lot NE ferme pas est nommé,
 * localisé et mesuré, pour que le lot qui dégèlera Architecte sache exactement
 * quoi faire.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUTPUT_GATE_STATUSES, VERIFIABILITY_LEVELS, CHECK_STATUSES, MEASURABLE_UNITS,
  normalizeOutput, detectStructuralFormat, measureOutput,
  validateOutputAgainstCanonicalContract
} from '../core/adn/output-compliance-gate.js';
import { html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = fs.readFileSync(path.join(root, 'core/adn/output-compliance-gate.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FRONT_CODE = sansProse((() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })());

/* ------------------------------------------------------------------------ *
 * LE REGISTRE GELÉ, LU SANS ÊTRE TOUCHÉ.
 * ------------------------------------------------------------------------ */
const REGISTRE = (() => {
  const a = html.indexOf('const FORMATS = {');
  const b = html.indexOf('const SCHEMA_JSON =', a);
  const src = html.slice(a, b);
  const bornes = [...src.matchAll(/\n {2}([a-z_0-9]+): \{/g)].map((m) => [m.index, m[1]]);
  const out = {};
  bornes.forEach(([p, id], k) => { out[id] = src.slice(p, k + 1 < bornes.length ? bornes[k + 1][0] : src.length); });
  return out;
})();
const champ = (id, nom) => { const m = REGISTRE[id].match(new RegExp(`${nom}:'((?:[^'\\\\]|\\\\.)*)'`)); return m ? m[1] : null; };
const IDS = Object.keys(REGISTRE);

/** LA CLASSIFICATION. Trois ensembles, fermés, exhaustifs, disjoints. */
const VERIFIABLE_STRUCTURELLEMENT = Object.freeze(['json']);
const DECIDABLE_MAIS_BLOQUE_PAR_LE_GEL = Object.freeze(['tableau_comparatif', 'list']);
const NON_VERIFIABLE = Object.freeze(IDS.filter(
  (id) => !VERIFIABLE_STRUCTURELLEMENT.includes(id) && !DECIDABLE_MAIS_BLOQUE_PAR_LE_GEL.includes(id)
));

/** Contrat canonique minimal, sans vocabulaire métier. */
const contrat = (over = {}) => ({
  version: '1.0', request_id: 'fs-01', original_request: 'Demande de contrôle.',
  obligations: [], quantities: [], assumptions: [], locks: [],
  output: { format: null, structure: [], opening: null, closing: null, length_policy: null },
  execution_policy: {}, ethics: {}, checks: [], ...over
});
const evaluer = (over, sortie, vocabulaire = []) => validateOutputAgainstCanonicalContract({
  canonical_contract: contrat(over), output: sortie, checks: [],
  execution_context: { format_vocabulary: vocabulaire }
});

// =================================================================================================
// §51 — L'INVENTAIRE ET LA CLASSIFICATION
// =================================================================================================

test('T-FORMATSTRUCT-01 : les trente-deux formats sont inventoriés, et chacun est classé une fois', () => {
  assert.equal(IDS.length, 32, 'FORMAT_COUNT = 32');
  const classes = [...VERIFIABLE_STRUCTURELLEMENT, ...DECIDABLE_MAIS_BLOQUE_PAR_LE_GEL, ...NON_VERIFIABLE];
  assert.equal(classes.length, IDS.length, 'chaque format est classé…');
  assert.equal(new Set(classes).size, IDS.length, '…exactement une fois.');
  assert.deepEqual([...classes].sort(), [...IDS].sort(), 'et la classification couvre le registre entier.');
  assert.equal(VERIFIABLE_STRUCTURELLEMENT.length, 1);
  assert.equal(DECIDABLE_MAIS_BLOQUE_PAR_LE_GEL.length, 2);
  assert.equal(NON_VERIFIABLE.length, 29);
});

test('T-FORMATSTRUCT-02 : chaque format porte les quatre champs de contrat que la classification utilise', () => {
  for (const id of IDS) {
    for (const nom of ['livrable', 'debut', 'fin', 'validite']) {
      assert.ok(champ(id, nom), `${id}.${nom} est déclaré dans le registre gelé.`);
    }
  }
});

test('T-FORMATSTRUCT-03 : la seule règle automatisée est adossée mot pour mot au registre', () => {
  /* json est le seul format dont la phrase de validité EST le contrôle. */
  assert.match(champ('json', 'validite'), /valide au sens JSON\.parse\(\)/);
  assert.equal(champ('json', 'marqueur'), 'json');
  /* Et le vocabulaire du produit ne déclare de forme que pour lui. */
  assert.match(FRONT_CODE, /structural_kind:FORMATS\[id\]\.marqueur==='json'\?'json':null/,
    'la forme vient du champ gelé, pas d’une liste écrite à la main.');
  assert.equal([...FRONT_CODE.matchAll(/structural_kind:/g)].length, 2,
    'deux constructions de vocabulaire, la même règle — aucune troisième source.');
});

test('T-FORMATSTRUCT-04 : aucune phrase sémantique n’est reclassée en règle structurelle', () => {
  /* Les vingt-neuf non vérifiables le sont parce que leur phrase EXIGE de lire
     le sens. On le montre sur les cas les plus tentants, ceux qui « ressemblent »
     à du structurel — et qui ne le sont pas. */
  const semantiques = {
    report: /Hiérarchie de titres cohérente, aucune section vide/,
    recipe: /Étapes numérotées, quantités chiffrées/,
    code: /Le code doit s\\u2019exécuter sans modification/,
    chord_chart: /Mesures délimitées par \|/,
    planning: /Chaque créneau porte un horaire ou un jour identifiable/,
    recommandations: /Chaque recommandation est justifiée en une phrase/
  };
  for (const [id, motif] of Object.entries(semantiques)) {
    assert.match(champ(id, 'validite'), motif, `${id} : la phrase gelée est bien celle-ci…`);
    assert.ok(NON_VERIFIABLE.includes(id), `…et ${id} reste NON VÉRIFIABLE.`);
  }
  /* « chord_chart » est le piège le plus net : il parle de « | », comme un
     tableau. Le détecteur de tableau exige EN PLUS une ligne de séparation
     qu'une grille d'accords n'a pas — l'y associer ferait échouer des sorties
     conformes. Un faux échec est aussi une erreur qu'un faux succès. */
  assert.equal(detectStructuralFormat(normalizeOutput('| Am | F |\n| C | G |')).includes('table'), false);
});

// =================================================================================================
// §52 — JSON, LE CAS RÉELLEMENT VÉRIFIABLE
// =================================================================================================

test('T-FORMATSTRUCT-05 : un JSON valide satisfait le contrôle structurel', () => {
  const vocab = [{ id: 'json', structural_kind: 'json' }];
  const v = evaluer({ output: { format: 'json' } }, '{"a":1,"b":[2,3]}', vocab);
  const format = v.verifications.find((x) => x.id === 'output-format');
  assert.equal(format.status, 'PASS');
  assert.equal(format.verifiability, 'DETERMINISTIC');
  assert.equal(v.status, 'PASS');
});

test('T-FORMATSTRUCT-06 : un JSON invalide fait échouer, et l’échec est bloquant', () => {
  const vocab = [{ id: 'json', structural_kind: 'json' }];
  const v = evaluer({ output: { format: 'json' } }, '{"a":1,}', vocab);
  const format = v.verifications.find((x) => x.id === 'output-format');
  assert.equal(format.status, 'FAIL');
  assert.equal(v.status, 'FAIL');
  assert.ok(v.violations.some((x) => x.code === 'OUTPUT_FORMAT_MISMATCH' && x.blocking));
});

test('T-FORMATSTRUCT-07 : aucune structure JSON n’est exigée au-delà de ce que le contrat dit', () => {
  /* Le registre gelé exige « valide au sens JSON.parse() » — pas un type racine,
     pas un champ. Un tableau JSON racine passe donc, et c'est correct. */
  const vocab = [{ id: 'json', structural_kind: 'json' }];
  assert.equal(evaluer({ output: { format: 'json' } }, '[1,2,3]', vocab).status, 'PASS');
  assert.equal(GATE.includes('required_fields'), false, 'le moteur n’invente aucun schéma.');
  assert.equal(GATE.includes('JSON_SCHEMA'), false);
});

// =================================================================================================
// §53/§54 — CE QUI N'EST PAS VÉRIFIABLE NE DEVIENT JAMAIS UN SUCCÈS
// =================================================================================================

test('T-FORMATSTRUCT-08 : une règle requise non vérifiable interdit structurellement le PASS', () => {
  /* La discipline est posée au POINT DE CONSTRUCTION : le moteur lève plutôt que
     de produire un succès non fondé. Aucun chemin d'écriture future ne l'évite. */
  assert.match(GATE, /if \(status === 'PASS' && !VERIFIABLE_HERE\.includes\(verifiability\)\) \{\s*throw new TypeError/);
  assert.deepEqual([...VERIFIABILITY_LEVELS], ['DETERMINISTIC', 'STRUCTURAL', 'SEMANTIC', 'HEURISTIC', 'NOT_VERIFIABLE']);
  /* Et en pratique : un format sans forme déclarée ne peut pas finir en PASS. */
  const v = evaluer({ output: { format: 'report' } }, '# Titre\n\nDu contenu.', []);
  const format = v.verifications.find((x) => x.id === 'output-format');
  assert.equal(format.status, 'NOT_VERIFIABLE');
  assert.equal(format.required, true);
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION');
});

test('T-FORMATSTRUCT-09 : INCOMPLETE_VERIFICATION dit exactement ce qu’il dit', () => {
  const v = evaluer({ output: { format: 'article' } }, 'Un texte quelconque.', []);
  assert.equal(v.status, 'INCOMPLETE_VERIFICATION', 'aucune violation prouvée, mais une requise non vérifiable.');
  assert.equal(v.violations.length, 0, 'et rien n’est reproché à la sortie.');
  assert.equal(v.coverage.required_unverifiable, 1);
  assert.ok(v.unverifiable.some((x) => x.id === 'output-format' && x.required));
});

test('T-FORMATSTRUCT-10 : les vingt-neuf formats sans forme déclarée finissent tous en INCOMPLETE', () => {
  /* Pas un échantillon : les vingt-neuf, un par un. */
  for (const id of NON_VERIFIABLE) {
    const v = evaluer({ output: { format: id } }, 'Une sortie quelconque.', []);
    assert.equal(v.status, 'INCOMPLETE_VERIFICATION', `${id} : ni PASS, ni FAIL inventé.`);
  }
  /* Et les deux décidables-mais-bloqués font exactement la même chose aujourd'hui. */
  for (const id of DECIDABLE_MAIS_BLOQUE_PAR_LE_GEL) {
    assert.equal(evaluer({ output: { format: id } }, '| a | b |\n|---|---|\n| 1 | 2 |', []).status,
      'INCOMPLETE_VERIFICATION', `${id} : décidable en principe, non déclaré en pratique.`);
  }
});

test('T-FORMATSTRUCT-11 : FAIL domine INCOMPLETE, toujours', () => {
  const vocab = [{ id: 'json', structural_kind: 'json' }];
  /* Un format vérifiable qui échoue + une quantité non mesurable : FAIL, pas INCOMPLETE. */
  const v = evaluer({
    output: { format: 'json' },
    quantities: [{ target: 'éléments', unit: 'chapitres', exact: 3 }]
  }, 'pas du json', vocab);
  assert.equal(v.status, 'FAIL');
  assert.ok(v.coverage.required_unverifiable >= 0);
  assert.match(GATE, /if \(bloquantes\.length\) status = 'FAIL';\s*else if \(requisNonVerifiables\.length\) status = 'INCOMPLETE_VERIFICATION';/);
});

test('T-FORMATSTRUCT-12 : une erreur technique ne devient jamais un succès', () => {
  for (const entree of [{ canonical_contract: null }, { canonical_contract: {}, output: 42 },
                        { canonical_contract: {}, output: 'x', checks: 'pas un tableau' }]) {
    const v = validateOutputAgainstCanonicalContract({ output: 'x', checks: [], ...entree });
    assert.equal(v.status, 'FAIL', 'fermeture technique = FAIL, jamais PASS.');
    assert.equal(v.technical_failure, true);
    assert.equal(v.trace.fail_closed, true);
  }
  /* Et une exception du moteur de contrôles se referme aussi en FAIL. */
  assert.match(GATE, /catch \(error\) \{\s*return failClosed\(\[String\(\(error && error\.message\) \|\| error\)\]\);/);
});

// =================================================================================================
// §55 — AUCUNE HEURISTIQUE, NULLE PART
// =================================================================================================

test('T-FORMATSTRUCT-13/14/15/16 : ni juge LLM, ni flou, ni similarité, ni seuil, ni domaine', () => {
  /* La mesure porte sur le CODE : la doctrine du moteur NOMME ces interdits en
     prose, pour dire qu'il ne les emploie pas. Les compter là serait se tromper
     de preuve — et compter le contraire de ce qu'on veut établir. */
  const code = sansProse(GATE);
  for (const interdit of [/fetch\s*\(/, /appelFournisseur/, /openai|anthropic|groq/i,
                          /fuzzy/i, /levenshtein/i, /cosine/i, /embedding/i, /similarit/i,
                          /0\.\d+/, /threshold/i, /\bseuil\b/i,
                          /voyage|recette|medical|juridique|anniversaire/i]) {
    assert.doesNotMatch(code, interdit, `le moteur ne contient pas ${interdit}.`);
  }
  /* Et la prose, elle, les nomme bien — c'est la doctrine, pas une implémentation. */
  assert.match(GATE, /aucun fuzzy, aucun embedding, aucune similarité sémantique/);
  /* Les unités mesurables sont une énumération fermée, sans invention possible. */
  assert.deepEqual([...MEASURABLE_UNITS], ['characters', 'words', 'lines', 'paragraphs', 'items']);
  assert.equal(measureOutput(normalizeOutput('a b c'), 'chapitres'), null, 'une unité hors table ne se mesure pas.');
  /* Le détecteur de formes est une énumération fermée de quatre formes. */
  const formes = new Set([...code.matchAll(/formes\.push\('([a-z_]+)'\)/g)].map((m) => m[1]));
  assert.deepEqual([...formes].sort(), ['json', 'list', 'numbered_list', 'table']);
});

// =================================================================================================
// §56 — L'AUTORITÉ RESTE UNIQUE
// =================================================================================================

test('T-FORMATSTRUCT-17/18/19 : une seule autorité de conformité, aucun contournement', () => {
  const modules = fs.readdirSync(path.join(root, 'core/adn'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function validateOutputAgainstCanonicalContract/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(modules, ['output-compliance-gate.js'], 'OUTPUT_COMPLIANCE_AUTHORITY_SOURCE_COUNT = 1');
  /* Les deux appelants du produit DÉLÈGUENT : ils ne recalculent aucun statut. */
  for (const appelant of ['rapideControleSortie', 'archControleSortie']) {
    const a = FRONT_CODE.indexOf(`function ${appelant}(`);
    const bloc = FRONT_CODE.slice(a, a + 1500);
    assert.match(bloc, /runtime\.validateOutputAgainstCanonicalContract/, `${appelant} délègue.`);
    assert.doesNotMatch(bloc, /status\s*=\s*'PASS'/, `${appelant} n’écrit jamais un succès.`);
    assert.match(bloc, /status:'FAIL',technical_failure:true/, `${appelant} se ferme sur panne.`);
  }
  /* Aucun troisième chemin ne produit un statut de conformité de sortie. */
  assert.equal([...FRONT_CODE.matchAll(/validateOutputAgainstCanonicalContract/g)].length, 4,
    'deux gardes de disponibilité et deux appels — rien d’autre.');
  assert.deepEqual([...OUTPUT_GATE_STATUSES], ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL']);
  assert.ok(CHECK_STATUSES.includes('NOT_VERIFIABLE'));
});

// =================================================================================================
// §57 — LES FRONTIÈRES DE MODE NE BOUGENT PAS
// =================================================================================================

test('T-FORMATSTRUCT-20/21/22/23 : la conformité de sortie ne s’applique qu’au livrable réel', () => {
  /* Rapide principal rend un PROMPT : aucun contrôle de sortie sur son parcours. */
  const rapide = sansProse(html.slice(html.indexOf('function adpRunRapide('), html.indexOf('async function v11StartRapide')));
  assert.doesNotMatch(rapide, /validateOutputAgainstCanonicalContract|archControleSortie/);
  /* Architecte principal rend un PROMPT lui aussi. */
  const api = sansProse(html.slice(html.indexOf('async function beginApiAnalysis()'), html.indexOf('function compositeDemand')));
  assert.doesNotMatch(api, /validateOutputAgainstCanonicalContract|archControleSortie/);
  /* Architecte Pro — le seul livrable final — passe bien par le contrôle. */
  const pro = sansProse(html.slice(html.indexOf('async function archConstruireExecuter()'), html.indexOf('const ARCH_SAUVEGARDE_VERSION=')));
  assert.match(pro, /archControleSortie\(/);
  /* Atelier reste une composition manuelle : aucune conformité gouvernée. */
  const atelier = sansProse(html.slice(html.indexOf('function v11StartAtelier()'), html.indexOf('window.askDecisionProvider')));
  assert.doesNotMatch(atelier, /validateOutputAgainstCanonicalContract|archControleSortie/);
});

// =================================================================================================
// §58 — LE GEL, ET CE QU'IL BLOQUE
// =================================================================================================

test('T-FORMATSTRUCT-24 : les sept plages gelées sont intactes', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8'));
  assert.equal(baseline.hashes.FORMATS, 'f4c9f1da5a14ecbe28d3cd0853871aa621909360ab6475bebeb76bc2191e141b');
  assert.equal(baseline.hashes['moteur Architecte'], 'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e');
  assert.equal(Object.keys(baseline.hashes).length, 7);
});

test('T-FORMATSTRUCT-25 : le point d’injection du vocabulaire du livrable est DANS la plage gelée', () => {
  /* LE FAIT QUI EXPLIQUE POURQUOI CE LOT N'IMPLÉMENTE PAS PLUS. Il n'est pas
     supposé : il est localisé, au caractère près, et il est vérifiable ici. */
  const debut = html.indexOf('function archContexte(){');
  const fin = html.indexOf('const ARCH_SAUVEGARDE_VERSION=', debut);
  const cible = html.indexOf('function archVocabulaireStructurel()');
  assert.ok(debut > 0 && fin > debut, 'la plage gelée Architecte est localisable.');
  assert.ok(cible > debut && cible < fin,
    'archVocabulaireStructurel est à l’intérieur de la plage gelée : l’étendre changerait le hash.');
  /* Et cette fonction est bien celle qui décide ce qu'Architecte Pro peut vérifier. */
  const pro = html.slice(html.indexOf('async function archConstruireExecuter()'), fin);
  assert.match(pro, /archControleSortie\(/);
  const controle = html.slice(html.indexOf('function archControleSortie('), fin);
  assert.match(controle, /format_vocabulary:archVocabulaireStructurel\(\)/,
    'le contrôle de sortie du livrable lit son vocabulaire ICI, et nulle part ailleurs.');
  /* Les deux phrases décidables restent donc en attente, et elles sont nommées. */
  assert.match(champ('tableau_comparatif', 'validite'), /En-tête et séparateur présents, même nombre de colonnes sur chaque ligne/);
  assert.match(champ('list', 'validite'), /Un élément par ligne, aucune ligne d\\u2019introduction\./);
});

// =================================================================================================
// §82 — LES DETTES NE DÉPENDENT PLUS DE L'HISTORIQUE
// =================================================================================================

test('T-FORMATSTRUCT-REGISTRE : le registre de dettes est persistant, exact et non autoritatif', () => {
  /* CLEAN-05 avait constaté que deux dettes sur trois ne vivaient que dans
     l'historique des lots. Elles vivent désormais dans un fichier, et ce test
     empêche qu'une dette s'ajoute ou disparaisse en silence. */
  const registre = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  const ids = [...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['PERF-REAL-01', 'EXEC-PHASE-INSTRUMENT-01'], 'deux dettes ouvertes, nommées.');
  assert.match(registre, /FORMAT-STRUCT-01 \| FORMAT-STRUCT-01/, 'et FORMAT-STRUCT-01 est déclarée fermée.');
  assert.match(registre, /ORCH-LEGACY-CLEAN-01 \| CLEAN-01/);
  /* Il n'est lu par aucun code : ce n'est pas une autorité. */
  const produit = html + fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
  assert.equal(produit.includes('OPEN-DEBTS'), false, 'aucun code du produit ne le lit.');
  assert.match(registre, /Ce registre \*\*n'est pas une autorité\*\*/);
});
