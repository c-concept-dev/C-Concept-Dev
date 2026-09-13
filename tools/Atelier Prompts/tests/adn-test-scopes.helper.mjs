/* CORRECTION-ADN-ARCH-01-01 — MANIFESTE DES PÉRIMÈTRES DE TEST ADN
 * ============================================================================
 *
 * Les rapports de lot ont longtemps écrit « ADN = N/N » pour DEUX sélections de
 * fichiers différentes, construites à la volée par deux `grep` distincts. Aucun
 * test n'avait disparu : deux périmètres portaient le même nom.
 *
 * Ce manifeste nomme les périmètres et les fige. Ce n'est pas une suite de tests :
 * c'est la source de vérité que `adn-test-scope-audit-arch0101.test.mjs` vérifie.
 *
 * ADN_CORE     — noyau du contrat d'exécution : état, verrous, adaptateurs,
 *                contrat canonique, readiness.
 * ADN_RELEVANT — surface ADN complète : le noyau, plus les moteurs qui consomment
 *                le contrat (routage, préservation d'intention, orchestration
 *                conversationnelle). Sur-ensemble strict du noyau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export const ADN_CORE_FILES = Object.freeze([
  'adaptive-lock-selector.test.mjs',
  'adn-state-engine.test.mjs',
  'engine-adapters-html-integration.test.mjs',
  'engine-adapters.test.mjs',
  'execution-contract-adn-27.test.mjs',
  'execution-contract-invariants.test.mjs',
  'execution-contract-mapping.test.mjs',
  'execution-contract-no-hardcoding.test.mjs',
  'execution-contract-roundtrip.test.mjs',
  'execution-contract-schema.test.mjs',
  'execution-readiness-html-integration.test.mjs',
  'execution-readiness.test.mjs'
]);

/** Ce que ADN_RELEVANT ajoute au noyau : exactement les fichiers que l'ancienne
 *  sélection « 104 » incluait et que le noyau n'inclut pas. */
export const ADN_RELEVANT_EXTRA_FILES = Object.freeze([
  'intent-preservation.test.mjs',
  'routing-engine.test.mjs'
]);

export const ADN_RELEVANT_FILES = Object.freeze([...ADN_CORE_FILES, ...ADN_RELEVANT_EXTRA_FILES].sort());

/** Les deux sélections historiques, conservées pour PROUVER l'écart 104 / 74.
 *  Elles ne servent plus à rapporter : elles servent à expliquer. */
/* CLEAN-01 : cette sélection historique était DÉRIVÉE de la liste vivante. Un fichier retiré
 * aujourd'hui aurait donc réécrit le passé. Une mesure historique se fige : la voici littérale,
 * telle qu'elle était au moment où l'écart 104 / 74 a été constaté — conversation-orchestrator
 * inclus, parce qu'il en faisait alors partie. */
export const HISTORICAL_SCOPE_104 = Object.freeze([
  'adaptive-lock-selector.test.mjs',
  'adn-state-engine.test.mjs',
  'conversation-orchestrator.test.mjs',
  'engine-adapters-html-integration.test.mjs',
  'engine-adapters.test.mjs',
  'execution-contract-adn-27.test.mjs',
  'execution-contract-invariants.test.mjs',
  'execution-contract-mapping.test.mjs',
  'execution-contract-no-hardcoding.test.mjs',
  'execution-contract-roundtrip.test.mjs',
  'execution-contract-schema.test.mjs',
  'execution-readiness.test.mjs',
  'intent-preservation.test.mjs',
  'routing-engine.test.mjs'
]);
export const HISTORICAL_SCOPE_74 = ADN_CORE_FILES;

/** Tous les fichiers réellement découverts par la suite globale (`tests/*.test.mjs`). */
export function discoveredTestFiles() {
  return fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.mjs')).sort();
}

/** Compte les tests déclarés dans un fichier, sans l'exécuter. */
export function declaredTestCount(file) {
  const source = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
  return (source.match(/^\s*test\(/gm) || []).length;
}
