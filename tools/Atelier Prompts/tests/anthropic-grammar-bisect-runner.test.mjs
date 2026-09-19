/* SCHEMA-ANTHROPIC — PRUNED_DEFINITIONS_REACHABILITY
 * ============================================================================
 *
 * AVANT. sousEnsemble(), dans le runner de diagnostic tools/anthropic-grammar-bisect.mjs,
 * gardait la table `definitions` COMPLÈTE du canonique dans chaque sous-ensemble, quels
 * que soient les blocs retenus. Un sous-ensemble sans le moindre $ref (evaluation seul,
 * strategie seul) embarquait quand même les 6 définitions canoniques et les 2 $ref qu'elles
 * portent entre elles (declaration → preuve, composant_retenu → fondement) — mesuré en
 * réel : ~4 072 / 4 164 octets au lieu des ~1 257 / 1 349 octets attendus pour des blocs
 * sans référence. Le verdict « evaluation + strategie → grammar too large » qui en
 * découlait était invérifiable : rien ne distinguait la combinaison des deux blocs de six
 * définitions orphelines embarquées par accident.
 *
 * APRÈS. sousEnsemble() ne garde que les `definitions` réellement atteignables par $ref
 * depuis les blocs retenus, fermeture transitive comprise (une définition peut en
 * référencer une autre). Ce fichier vérifie cette propriété de façon générique sur une
 * grille de sous-ensembles, PUIS épingle les trois cas qui ont produit l'incohérence :
 * evaluation seul, strategie seul, evaluation + strategie — tous trois à 0 ref / 0 definition,
 * puisqu'aucun des deux blocs ne porte de $ref dans le canonique.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chargerProduit, sousEnsemble, definitionsAtteignables, refsDirectes, nomDefinition,
  metriques, TOUS_LES_BLOCS
} from '../tools/anthropic-grammar-bisect.mjs';

const { schema } = chargerProduit();
const TOUTES_LES_DEFINITIONS = schema.definitions;

/** Fermeture transitive recalculée INDÉPENDAMMENT de definitionsAtteignables() — un
   parcours à part, écrit ici, pour que le test ne se contente pas de rejouer l'implémentation
   qu'il vérifie. Part des $ref trouvées dans le sous-ensemble UNE FOIS `definitions` retiré,
   puis suit chaque définition atteinte à son tour. */
function fermetureIndependante(sousSchemaSansDefinitions) {
  const attendues = new Set();
  const aVisiter = [...refsDirectes(sousSchemaSansDefinitions)].map(nomDefinition).filter(Boolean);
  const file = [...aVisiter];
  while (file.length) {
    const nom = file.shift();
    if (attendues.has(nom)) continue;
    attendues.add(nom);
    const def = TOUTES_LES_DEFINITIONS[nom];
    if (!def) continue;
    for (const suivante of refsDirectes(def)) {
      const n = nomDefinition(suivante);
      if (n && !attendues.has(n)) file.push(n);
    }
  }
  return attendues;
}

/* ==========================================================================
 * T1 — PRUNED_DEFINITIONS_REACHABILITY : générique, sur une grille de sous-ensembles.
 * ======================================================================= */
const GRILLE = [
  ...TOUS_LES_BLOCS.map((b) => [b]),
  ['evaluation', 'strategie'], ['comprehension', 'apprentissage'], ['compilation', 'verification'],
  ['comprehension', 'evaluation', 'strategie'], TOUS_LES_BLOCS
];

test('T1 · PRUNED_DEFINITIONS_REACHABILITY : schema.definitions == fermeture transitive des $ref, pour chaque sous-ensemble', () => {
  for (const blocs of GRILLE) {
    const sous = sousEnsemble(schema, blocs);
    const sansDefs = { ...sous }; delete sansDefs.definitions;
    const attendues = fermetureIndependante(sansDefs);
    const obtenues = new Set(Object.keys(sous.definitions || {}));

    assert.deepEqual(obtenues, attendues,
      `blocs=${blocs.join('+')} : definitions présentes (${[...obtenues]}) ≠ fermeture transitive attendue (${[...attendues]})`);

    /* Aucune définition non atteignable : chaque définition présente doit être retrouvée
       en suivant les $ref depuis les blocs retenus (pas de survivance « au cas où »). */
    for (const nom of obtenues) assert.ok(attendues.has(nom), `${blocs.join('+')} : « ${nom} » présente mais non atteignable`);
    /* Et rien de manquant : toute définition atteignable est bien là. */
    for (const nom of attendues) assert.ok(obtenues.has(nom), `${blocs.join('+')} : « ${nom} » atteignable mais absente`);
  }
});

test('T2 · NO_FOREIGN_PROPERTIES : le sous-ensemble ne conserve ni properties ni required d’un bloc exclu', () => {
  for (const blocs of GRILLE) {
    const sous = sousEnsemble(schema, blocs);
    const exclus = TOUS_LES_BLOCS.filter((b) => !blocs.includes(b));
    for (const bloc of exclus) {
      assert.equal(bloc in sous.properties, false, `${blocs.join('+')} : properties.${bloc} absent`);
      assert.equal(sous.required.includes(bloc), false, `${blocs.join('+')} : required n’inclut pas ${bloc}`);
    }
    for (const bloc of blocs) {
      assert.ok(bloc in sous.properties, `${blocs.join('+')} : properties.${bloc} présent`);
      assert.ok(sous.required.includes(bloc), `${blocs.join('+')} : required inclut ${bloc}`);
    }
    assert.ok('version' in sous.properties && sous.required.includes('version'), `${blocs.join('+')} : version toujours présent`);
    assert.deepEqual(Object.keys(sous.properties).sort(), ['version', ...blocs].sort());
  }
});

/* ==========================================================================
 * T3 — LES TROIS PINS DE L’INCOHÉRENCE OBSERVÉE.
 * ======================================================================= */
function metriquesProjetees(blocs) {
  const { schema: s, projeter } = chargerProduit();
  return metriques(projeter(sousEnsemble(s, blocs)));
}

test('T3a · PIN evaluation seul : ref=0, definitions=0 (aucun $ref dans ce bloc du canonique)', () => {
  const m = metriquesProjetees(['evaluation']);
  assert.equal(m.ref, 0); assert.equal(m.definitions, 0);
  assert.ok(m.octets < 2000, `${m.octets} octets — plus proche des ~1 257 attendus que des ~4 072 mesurés avec la fuite`);
});

test('T3b · PIN strategie seul : ref=0, definitions=0 (aucun $ref dans ce bloc du canonique)', () => {
  const m = metriquesProjetees(['strategie']);
  assert.equal(m.ref, 0); assert.equal(m.definitions, 0);
  assert.ok(m.octets < 2000, `${m.octets} octets — plus proche des ~1 349 attendus que des ~4 164 mesurés avec la fuite`);
});

test('T3c · PIN evaluation + strategie : ref=0, definitions=0 (ni l’un ni l’autre ne référence de definition)', () => {
  const m = metriquesProjetees(['evaluation', 'strategie']);
  assert.equal(m.ref, 0); assert.equal(m.definitions, 0);
  assert.ok(m.octets < 3200, `${m.octets} octets — cohérent avec la somme des deux blocs isolés, pas ~5 347 octets à six definitions parasites`);
});

/* ==========================================================================
 * T4 — CONTRE-EXEMPLE POSITIF : un bloc qui référence RÉELLEMENT des definitions
 * doit continuer à les recevoir (la correction n'élague pas tout, seulement l'orphelin).
 * ======================================================================= */
test('T4 · comprehension seul : les definitions qu’il référence vraiment restent présentes', () => {
  const sous = sousEnsemble(schema, ['comprehension']);
  assert.deepEqual(new Set(Object.keys(sous.definitions || {})), new Set(['declaration', 'preuve']),
    'comprehension.declarations et .contraintes référencent declaration, qui référence preuve');
  const m = metriquesProjetees(['comprehension']);
  assert.ok(m.ref > 0 && m.definitions > 0);
});

test('T5 · apprentissage seul : preference_proposable reste présente, aucune autre definition', () => {
  const sous = sousEnsemble(schema, ['apprentissage']);
  assert.deepEqual(new Set(Object.keys(sous.definitions || {})), new Set(['preference_proposable']));
});

test('T6 · compilation seul : composant_retenu, composant_ecarte et fondement (référencé par composant_retenu) restent présents', () => {
  const sous = sousEnsemble(schema, ['compilation']);
  assert.deepEqual(new Set(Object.keys(sous.definitions || {})), new Set(['composant_retenu', 'composant_ecarte', 'fondement']));
});

test('T7 · ensemble complet : la fermeture couvre les 6 definitions canoniques, sans en inventer une septième', () => {
  const sous = sousEnsemble(schema, TOUS_LES_BLOCS);
  assert.deepEqual(new Set(Object.keys(sous.definitions || {})), new Set(Object.keys(TOUTES_LES_DEFINITIONS)));
  assert.equal(Object.keys(sous.definitions).length, 6);
});
