/* 02B — UN SEUL PROMPT FINAL PAR TOUR, ET C'EST CELUI QUI EST CONTRÔLÉ.
 * ============================================================================
 *
 * Ce que cette suite éprouve : sur le chemin gouverné — un tour OPRIE qui a produit un contrat
 * canonique valide — il n'existe QU'UN prompt, le Prompt Contract Gate le contrôle, et c'est
 * exactement celui-là qui est livré. Identité d'octets, pas équivalence sémantique.
 *
 * POURQUOI CETTE SUITE EXISTE. L'audit 02A avait mesuré 0/8 sur l'identité entre prompt contrôlé et
 * prompt livré, et en avait conclu que le gate contrôlait un artefact jamais livré. Cette mesure
 * avait été prise SANS contrat canonique — la seule branche où `assemblerRapideAdaptatif` ne lance
 * pas le gate du tout. Avec un contrat, la mesure est 8/8, et l'invariant tient déjà. Ces tests le
 * figent pour qu'il ne puisse plus se perdre sans qu'on le sache.
 *
 * CE QUI RESTE OUVERT, et que T-02B-07 caractérise sans le corriger : quand le contrat canonique est
 * REFUSÉ en amont, le tour continue quand même, sans gate. C'est un défaut distinct, à son propre
 * lot. Il est décrit ici pour qu'il soit mesuré, jamais pour qu'il soit toléré en silence.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';
import { runRapidePipeline } from './rapide-assembler-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const CORPUS = JSON.parse(fs.readFileSync(path.join(root, 'evaluation/corpus-lot10g2a.json'), 'utf8')).cases;

/* Les huit cas transversaux de 02A, réutilisés tels quels. */
const CAS_02A = ['R05', 'R01', 'R07', 'R11', 'R03', 'R13', 'R14', 'R06'];
const MATERIAU = 'col_a;col_b;col_c\n1;2;3\n4;;6\n1;2;3\n';
const demandeDe = (id) => CORPUS.find((c) => c.id === id).demande;
const materiauDe = (id) => (CORPUS.find((c) => c.id === id).materiau_present ? MATERIAU : '');

/** Orientation telle que `oprieEnterExecution()` la construit pour Rapide, avec contrat canonique. */
function tourGouverne(id) {
  const demande = demandeDe(id);
  const base = canonicalFrom(oprieReadyTurn({ state: 'operational_request_ready' }),
    { request_id: `02b-${id}`, original_request: demande });
  return runRapidePipeline({
    demande,
    materiau: materiauDe(id),
    orientation: {
      source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
      canonical: base, envelope: null, semantic: null, providerResult: null, action: null,
      decision: { state: 'ready' }
    }
  });
}

test('T-02B-01 : un seul prompt autoritaire par tour — la fusion de verrous ne produit aucun second artefact', () => {
  for (const id of CAS_02A) {
    const r = tourGouverne(id);
    assert.ok(r.r, `${id} : le tour produit un prompt`);
    assert.ok(r.r.canonical, `${id} : la voie canonique est bien celle empruntée`);
    assert.deepEqual(r.mergedLocks, r.legacyLocks,
      `${id} : la fusion rend le MÊME jeu de verrous — aucun second assemblage n'est déclenché`);
  }
});

test('T-02B-02 : le prompt contrôlé EST le prompt livré, à l’octet', () => {
  for (const id of CAS_02A) {
    const r = tourGouverne(id);
    assert.equal(r.r.qg, 'PASS', `${id} : le Prompt Contract Gate a réellement tourné`);
    assert.strictEqual(r.promptFinal, r.promptLegacy,
      `${id} : identité d'octets entre l'artefact gaté et l'artefact livré`);
  }
});

test('T-02B-03 : aucune mutation du prompt après le gate — la réassemblage est conditionnée au changement de verrous', () => {
  const i = HTML.indexOf('function adpRunRapide(');
  assert.notEqual(i, -1, 'le chemin gouverné existe');
  const bloc = HTML.slice(i, HTML.indexOf('function v11StartAtelier', i));
  /* La seule réassemblage du chemin gouverné est gardée par une comparaison de verrous : si le jeu
     ne change pas — ce qui est le cas dès qu'un contrat canonique existe (T-02B-01) — le prompt
     gaté n'est jamais remplacé. */
  assert.match(bloc, /JSON\.stringify\(actifs\)!==JSON\.stringify\(r\.actifs\)/,
    'la réassemblage reste conditionnée, jamais systématique');
  const marqueur = 'r.prompt=assembler(r.ctx,actifs)';
  const apres = bloc.slice(bloc.indexOf(marqueur) + marqueur.length);
  assert.doesNotMatch(apres, /assembler\(r\.ctx/,
    'et aucun autre assemblage ne suit : il n’existe pas de troisième artefact');
  assert.equal(bloc.split('assembler(r.ctx').length - 1, 1,
    'le chemin gouverné ne contient QU’UNE réassemblage possible, jamais deux');
});

test('T-02B-04 : un échec du gate empêche toute livraison', () => {
  /* Chaîne fail-closed, lue dans la production : le gate refuse, l'assembleur rend null, le chemin
     gouverné s'arrête avant toute livraison. */
  const i = HTML.indexOf('function assemblerRapideAdaptatif(){');
  const assembleur = HTML.slice(i, HTML.indexOf('async function copierRapideAdaptatif', i));
  assert.match(assembleur, /verdict\.status==='FAIL'/, 'le verdict FAIL est lu');
  assert.match(assembleur, /if\(verdict\.status==='FAIL'\)\{signaler\([^)]*\);return null\}/,
    'et il rend null : aucun prompt n’est exposé');

  const j = HTML.indexOf('function adpRunRapide(');
  const gouverne = HTML.slice(j, HTML.indexOf('function v11StartAtelier', j));
  assert.match(gouverne, /const r=assemblerRapideAdaptatif\(\);if\(!r\)return false/,
    'le chemin gouverné s’arrête sur un assembleur qui a refusé');

  /* Et la voie historique de copie s'arrête de la même façon. */
  const k = HTML.indexOf('async function copierRapideAdaptatif');
  const copie = HTML.slice(k, k + 400);
  assert.match(copie, /const r=assemblerRapideAdaptatif\(\);if\(!r\)return/,
    'la copie directe aussi : rien n’est affiché ni copié');
});

test('T-02B-05 : la demande canonique atteint le prompt final, mot pour mot', () => {
  for (const id of CAS_02A) {
    const r = tourGouverne(id);
    assert.ok(r.promptFinal.includes(demandeDe(id)),
      `${id} : la demande originale est portée telle quelle dans le prompt livré`);
  }
});

test('T-02B-06 : identité gate/livraison sur les huit cas du corpus 02A', () => {
  const identiques = CAS_02A.filter((id) => {
    const r = tourGouverne(id);
    return !!r.r && r.promptFinal === r.promptLegacy;
  });
  assert.equal(identiques.length, CAS_02A.length,
    `identité sur ${identiques.length}/${CAS_02A.length} — attendu 8/8`);
});

test('T-02B-07 [CARACTÉRISATION — DÉFAUT OUVERT, NON CORRIGÉ ICI] un contrat canonique refusé n’arrête pas le tour', () => {
  /* oprieBuildCanonicalContract rend null quand validateCanonicalContract refuse, ou sur exception —
     avec un simple console.warn. Le tour continue alors sur la voie historique : pas de contrat, donc
     PAS DE GATE, et la réassemblage de verrous s'applique. C'est ce que 02A avait mesuré sans le
     savoir. Ce test FIGE le défaut pour qu'il soit visible, il ne le tolère pas. */
  const i = HTML.indexOf('function oprieBuildCanonicalContract');
  const constructeur = HTML.slice(i, HTML.indexOf('function oprieClarificationHistory', i));
  assert.match(constructeur, /console\.warn\('Contrat canonique refusé\.'/,
    'un contrat refusé ne produit qu’une trace console');
  assert.match(constructeur, /verdict\.ok!==true\)\{console\.warn[^}]*;return null\}/,
    'et rend null : le tour continue sans contrat');
  /* Asymétrie mesurée : le constructeur de contrat ARCHITECTE, lui, refuse techniquement. */
  assert.match(HTML, /return refuse\('technical', `Contrat canonique refusé :/,
    'buildArchitecteContractFromTurn refuse, là où oprieBuildCanonicalContract rend null');

  /* Et la garde censée fermer cette voie teste la valeur qui vient précisément d'être mise à null. */
  const j = HTML.indexOf('function assemblerRapideAdaptatif(){');
  const assembleur = HTML.slice(j, HTML.indexOf('async function copierRapideAdaptatif', j));
  assert.match(assembleur, /if\(!p&&rapideContratCanonique&&rapideContratCanonique\.executability/,
    'la garde fail-closed conditionne sur rapideContratCanonique — nul quand le contrat est refusé');

  /* Conséquence mesurée : sans contrat, le gate ne tourne pas et les verrous changent. */
  const sans = runRapidePipeline({ demande: demandeDe('R03') });
  assert.equal(sans.r.qg, null, 'sans contrat canonique, aucun gate ne tourne');
  assert.notDeepEqual(sans.mergedLocks, sans.legacyLocks,
    'et la fusion change le jeu de verrous, donc le prompt est réassemblé après coup');
});
