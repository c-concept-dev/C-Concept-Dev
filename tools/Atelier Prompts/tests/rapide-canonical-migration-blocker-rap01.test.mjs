/* ADN-RAPIDE-01 — PRÉREQUIS MANQUANT, MESURÉ ET FIGÉ
 * ============================================================================
 *
 * ADN-RAPIDE-01 demande que le contrat canonique devienne la SOURCE SÉMANTIQUE
 * UNIQUE de Rapide, que l'ADN devienne le SEUL sélecteur de verrous, et que les
 * treize verrous restent projetables — le tout avec ZÉRO régression de prompt.
 *
 * Ces quatre exigences sont mutuellement inaccessibles en l'état, pour une
 * raison structurelle et non pour une difficulté d'implémentation :
 *
 *   Le Canonical Base Contract produit par OPRIE est VOLONTAIREMENT vide sur
 *   `output`, `quantities`, `checks`, `obligations` et `intent.recipient`.
 *   Le mapper le dit lui-même : « OPRIE ne produit ni obligation, ni quantité,
 *   ni sortie, ni contrôle. » Architecte comble ces familles par
 *   `enrichCanonicalContractFromArchAnalysis()`. RAPIDE N'A PAS D'ÉQUIVALENT.
 *
 *   Sans ces familles, le sélecteur ADN ne peut justifier que 5 verrous sur 13,
 *   et bascule les 5 autres — dont `donnees`, qui est le verrou de sécurité
 *   contre l'injection par le matériau — hors du prompt.
 *
 * MISE À JOUR — ADN-RAPIDE-ENRICH-00 : LE BLOCAGE EST LEVÉ.
 *
 * L'enrichisseur canonique Rapide existe désormais
 * (`core/adn/rapide-canonical-enrichment.js`). Ces tests conservent la MESURE
 * qui justifiait le blocage — un contrat NON enrichi ne justifie que 5 verrous
 * sur 13 — et lui adjoignent la CONTRE-ÉPREUVE : le même contrat, enrichi, les
 * justifie tous les treize. Le fichier prouve donc maintenant la LEVÉE, sans
 * rien perdre de ce qui l'avait motivée.
 *
 * La bascule de production, elle, reste à faire : c'est ADN-RAPIDE-01.
 *
 * AUCUNE MODIFICATION DE PRODUCTION : le HTML est lu, jamais réécrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';
import { runRapidePipeline } from './rapide-assembler-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const CORE_DIR = path.join(root, 'core/adn');

/** Base canonique la plus RICHE qu'OPRIE puisse produire : tous les champs du
 *  candidat Arbiter renseignés. C'est le plafond, pas un cas dégradé. */
function baseLaPlusRiche(original_request) {
  return canonicalFrom(oprieReadyTurn({
    operational_request_candidate: {
      objective: 'Objectif validé.', expected_deliverable: 'Livrable nommé.',
      secondary_objectives: ['Objectif secondaire.'], confirmed_constraints: ['Contrainte confirmée.'],
      confirmed_priorities: ['Priorité.'], confirmed_preferences: ['Préférence.'],
      delegated_decisions: ['Décision déléguée.'], external_facts_to_research: ['Fait externe.'],
      assumptions_allowed: ['Hypothèse autorisée.'], remaining_unknowns: ['Inconnue.']
    }
  }), { request_id: 'rap01', original_request });
}

const decision = { source: 'none', decision: { etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: 'test', question: null } };

const CAS = [
  ['simple', 'Explique la différence entre deux approches.', ''],
  ['liste', 'Donne 7 idées pour améliorer un processus.', ''],
  ['tableau', 'Compare trois options dans un tableau.', ''],
  ['email', 'Rédige un email de relance.', ''],
  ['code', 'Écris une fonction qui trie une liste.', ''],
  ['materiau', 'Résume ce texte.', 'Un texte à résumer.']
];

/* ==========================================================================
 * T-RAP01-BLOCK-01 — CE QUE LA BASE CANONIQUE NE PORTE PAS
 * ======================================================================= */

test('T-RAP01-BLOCK-01 la base canonique OPRIE est vide sur les familles dont Rapide a besoin', () => {
  const base = baseLaPlusRiche('Donne 7 idées pour améliorer un processus.');

  /* Les familles que Rapide doit projeter pour tenir sa promesse. */
  assert.equal(base.output.format, null, 'aucun format');
  assert.equal(base.output.tone, null, 'aucun ton');
  assert.equal(base.output.length_policy, null, 'aucune politique de longueur');
  assert.deepEqual(base.output.structure, [], 'aucun plan');
  assert.deepEqual(base.quantities, [], 'aucune quantité — pas même les « 7 » de la demande');
  assert.deepEqual(base.checks, [], 'aucun contrôle');
  assert.deepEqual(base.obligations, [], 'aucune obligation');
  assert.equal(base.intent.recipient, null, 'aucun destinataire');

  /* Ce n'est pas un oubli : le mapper le déclare. */
  const mapper = fs.readFileSync(path.join(CORE_DIR, 'oprie-canonical-mapping.js'), 'utf8');
  assert.match(mapper, /OPRIE ne produit ni obligation, ni quantité, ni sortie, ni contrôle/);

  /* Et les deux seuls signaux de verrou disponibles. */
  assert.deepEqual(base.semantic_lock_signals.signals.map((s) => s.id).sort(), ['assumptions', 'provenance']);
});

/* ==========================================================================
 * T-RAP01-BLOCK-02 — L'ADN SEUL NE PEUT PAS PORTER LES 13 VERROUS
 * ======================================================================= */

test('T-RAP01-BLOCK-02 faire de l’ADN le seul sélecteur retirerait six verrous, dont celui de sécurité', () => {
  const perdusParCas = {};
  for (const [nom, demande, materiau] of CAS) {
    const pipeline = runRapidePipeline({ demande, materiau });
    const runtime = pipeline.harness.adnRuntime();
    const env = runtime.buildExecutionEnvelope({ canonical_base: baseLaPlusRiche(demande), material: materiau, provider_result: decision });
    const adnSeul = runtime.projectToRapide(env, { material: materiau, format: pipeline.r.ctx.format, level: pipeline.r.niveau }).legacy_lock_ids;
    perdusParCas[nom] = pipeline.mergedLocks.filter((id) => !adnSeul.includes(id));
    assert.ok(perdusParCas[nom].length > 0, `${nom} : l’ADN seul ne couvre pas la sélection actuelle`);
  }

  /* L'ADN ne peut justifier que cinq verrous, TOUJOURS les mêmes, quelle que
     soit la demande : ils ne dépendent que des deux signaux disponibles. */
  const adnSeulParCas = Object.values(perdusParCas);
  assert.ok(adnSeulParCas.every((p) => p.includes('format')), 'le contrat de format tombe sur tous les cas');
  assert.ok(adnSeulParCas.every((p) => p.includes('longueur')), 'le protocole de troncature tombe sur tous les cas');

  /* `donnees` délimite le matériau : sans lui, une phrase du matériau peut être
     lue comme une instruction. Il tombe dès qu'aucun matériau n'est fourni mais
     que le profil l'exigeait — donc sur la majorité des cas. */
  assert.ok(perdusParCas.simple.includes('donnees') && perdusParCas.code.includes('donnees'),
    'le verrou de délimitation des données sources tomberait');
  /* `format` et `volume` portent la promesse produit elle-même : « 7 idées ». */
  assert.ok(perdusParCas.liste.includes('format') && perdusParCas.liste.includes('volume'),
    'le format et la quantité demandée tomberaient');

  const tous = [...new Set(Object.values(perdusParCas).flat())].sort();
  assert.deepEqual(tous, ['amorce', 'destinataire', 'donnees', 'format', 'longueur', 'volume'],
    'six verrous exactement ne sont justifiables par aucune donnée canonique NON ENRICHIE');
});

test('T-RAP01-LIFT-02 [LEVÉE] enrichi, le même contrat justifie les treize verrous', async () => {
  const { enrichRapidCanonicalContract } = await import('../core/adn/rapide-canonical-enrichment.js');
  const { ADAPTIVE_LOCK_IDS } = await import('../core/adn/adaptive-lock-selector.js');
  const { buildExecutionEnvelope, projectToRapide } = await import('../core/adn/engine-adapters.js');

  const pipeline = runRapidePipeline({ demande: 'Donne exactement 7 idées sous forme de tableau.', materiau: 'Un matériau.' });
  const FORMATS = pipeline.harness.FORMATS;
  const vocabulaire = Object.keys(FORMATS).map((id) => ({
    id, name: FORMATS[id].nom, markers: FORMATS[id].indices || [], verifiable: FORMATS[id].strict === true
  }));

  const base = canonicalFrom(oprieReadyTurn({
    operational_request_candidate: {
      objective: 'Objectif validé.', expected_deliverable: 'Un livrable nommé.',
      secondary_objectives: [], confirmed_constraints: ['Contrainte confirmée.'], confirmed_priorities: [],
      confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: ['Fait externe.'],
      assumptions_allowed: ['Hypothèse autorisée.'], remaining_unknowns: []
    }
  }), { request_id: 'lift', original_request: 'Donne exactement 7 idées sous forme de tableau.' });

  const options = { material: 'Un matériau.', format_vocabulary: vocabulaire, counting_units: 'items?|elements?|idees?|points?' };
  const premier = enrichRapidCanonicalContract(base, options);
  /* Ce qu'un enrichissement amont (OPRIE, ou un futur producteur) peut fournir. */
  const amont = JSON.parse(JSON.stringify(premier.contract));
  amont.intent.recipient = 'un lectorat défini';
  amont.output.structure = ['A', 'B'];
  amont.output.length_policy = 'courte';
  amont.output.opening = 'Commencer directement.';
  amont.assumptions.forbidden = [{ text: 'Hypothèse interdite.' }];
  const { contract } = enrichRapidCanonicalContract(amont, options);

  const env = buildExecutionEnvelope({
    canonical_base: contract, material: 'Un matériau.',
    provider_result: { source: 'none', decision: { etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: 'test', question: null } }
  });
  const projection = projectToRapide(env, { material: 'Un matériau.', format: 'tableau', level: 'standard' });
  assert.deepEqual(projection.lock_ids, [...ADAPTIVE_LOCK_IDS], 'LOCKS_PROJECTABLE = 13 / 13 — blocage levé');
});

/* ==========================================================================
 * T-RAP01-BLOCK-03 — LA BASCULE SÉMANTIQUE CHANGE LE PROMPT
 * ======================================================================= */

test('T-RAP01-BLOCK-03 sans enrichissement, canonical_semantics = true modifie le prompt sur les six cas', () => {
  const modifies = [];
  for (const [nom, demande, materiau] of CAS) {
    const pipeline = runRapidePipeline({ demande, materiau });
    const runtime = pipeline.harness.adnRuntime();
    const env = runtime.buildExecutionEnvelope({ canonical_base: baseLaPlusRiche(demande), canonical_semantics: true, material: materiau, provider_result: decision });
    const projection = runtime.projectToRapide(env, { material: materiau, format: pipeline.r.ctx.format, level: pipeline.r.niveau });
    const fusion = pipeline.harness.adnMergeLegacyLocks(pipeline.r.actifs, projection);
    if (pipeline.harness.assembler(pipeline.r.ctx, fusion) !== pipeline.promptFinal) modifies.push(nom);
  }
  assert.deepEqual(modifies, CAS.map(([nom]) => nom),
    'la bascule sémantique n’est neutre sur AUCUN cas : elle retire des verrous que la base ne justifie pas');
});

/* ==========================================================================
 * T-RAP01-BLOCK-04 — LE PRÉREQUIS MANQUANT, NOMMÉ
 * ======================================================================= */

test('T-RAP01-LIFT-04 [LEVÉE] chaque chemin possède désormais son enrichisseur canonique', () => {
  const fichiers = fs.readdirSync(CORE_DIR).filter((f) => f.endsWith('.js') && !f.includes('generated'));
  const producteurs = fichiers.filter((f) => /export function enrich\w*Canonical/.test(fs.readFileSync(path.join(CORE_DIR, f), 'utf8'))).sort();

  assert.deepEqual(producteurs, ['arch-canonical-enrichment.js', 'rapide-canonical-enrichment.js'],
    'Architecte et Rapide ont chacun le leur — et il n’en existe pas de troisième');

  /* C'est lui qui remplit, côté Architecte, exactement les familles qui
     manquent à Rapide — la démonstration que le prérequis est bien celui-là. */
  const arch = fs.readFileSync(path.join(CORE_DIR, 'arch-canonical-enrichment.js'), 'utf8');
  const rapide = fs.readFileSync(path.join(CORE_DIR, 'rapide-canonical-enrichment.js'), 'utf8');
  for (const famille of ['output.format', 'quantities', 'checks', 'obligations']) {
    assert.ok(arch.includes(`'${famille}'`), `ARCH-01 enrichit ${famille}`);
    assert.ok(rapide.includes(`'${famille}'`), `RAPIDE-ENRICH-00 enrichit ${famille}`);
  }
  /* Chacun garde son périmètre : Rapide ne touche à aucun champ `intent`. */
  assert.equal(/'intent\.[\w.]+'/.test(rapide.slice(rapide.indexOf('RAPIDE_ENRICHABLE_PATHS'), rapide.indexOf('RAPIDE_SIGNALS'))), false,
    'l’enrichisseur Rapide ne peut écrire dans aucun champ intent — ADN-RECIPIENT-00 reste ouvert');
});

/* ==========================================================================
 * T-RAP01-BLOCK-05 — LES ACQUIS DE FEED-00 SONT INTACTS
 * ======================================================================= */

test('T-RAP01-BLOCK-05 les invariants acquis par ADN-RAPIDE-FEED-00 restent vrais', () => {
  const base = baseLaPlusRiche('Donne 7 idées pour améliorer un processus.');
  const orientation = {
    source: 'oprie', route: 'rapide', oprie: { state: 'operational_request_ready' },
    canonical: base, envelope: null, semantic: null, providerResult: null, action: null, decision: { state: 'ready' }
  };
  const avec = runRapidePipeline({ demande: 'Donne 7 idées pour améliorer un processus.', orientation });
  const sans = runRapidePipeline({ demande: 'Donne 7 idées pour améliorer un processus.' });

  assert.ok(avec.envelope.canonical_base, 'la base atteint toujours l’enveloppe Rapide');
  /* MISE À JOUR ADN-RAPIDE-01 : l'enveloppe porte le contrat ENRICHI. La
     non-perte se vérifie donc famille par famille sur ce qui appartient à OPRIE. */
  for (const chemin of ['original_request', 'intent', 'executability', 'assumptions.allowed', 'selected_locks']) {
    const lire = (o) => chemin.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    assert.deepEqual(JSON.parse(JSON.stringify(lire(avec.envelope.canonical_base))), JSON.parse(JSON.stringify(lire(base))),
      `CANONICAL_BASE_SEMANTIC_LOSS = 0 · ${chemin}`);
  }
  /* MISE À JOUR ADN-RAPIDE-01 : la projection A changé, volontairement. Ce qui
     reste vrai de FEED-00, c'est que la base atteint l'enveloppe sans perte. */
  assert.ok(avec.promptFinal.length > 0 && sans.promptFinal.length > 0, 'les deux chemins restent fonctionnels');
  assert.equal(avec.envelope.state.executability.state, 'exploitable');
  assert.equal(avec.envelope.routing.route, 'rapide');
});

/* ==========================================================================
 * T-RAP01-BLOCK-06 — LE MOTEUR RAPIDE N'A PAS ÉTÉ TOUCHÉ
 * ======================================================================= */

test('T-RAP01-LIFT-06 [MISE À JOUR ADN-RAPIDE-01] le moteur Rapide porte le successeur audité', () => {
  const extrait = [['function assemblerRapideAdaptatif(){', 'async function copierRapideAdaptatif'],
    ['function assemblerRapide(){', 'async function copierRapide()']]
    .map(([debut, fin]) => {
      const a = HTML.indexOf(debut); const b = HTML.indexOf(fin, a + debut.length);
      return HTML.slice(a, b);
    }).join('\n<LOT10G-RANGE>\n');

  /* Le gel a été consommé UNE fois, par la bascule canonique, et le diff a été
     audité : une seule fonction modifiée, `assemblerRapide()` intacte. */
  assert.equal(crypto.createHash('sha256').update(extrait).digest('hex'),
    '3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664',
    'le moteur Rapide correspond au successeur audité');

  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8')).hashes;
  assert.equal(baseline['moteur Rapide'], '3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664');
  assert.equal(baseline['moteur Architecte'], 'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e',
    'ARCH_FROZEN_HASH_CHANGED = NO');
});
