/* ADN-ARCH-03 — RECLASSER N'EST PAS INVENTER.
 * ============================================================================
 *
 * CE QUE LA PRODUCTION A MONTRÉ, SUR DEUX CAS REPRODUCTIBLES. La demande « Rédige un email
 * professionnel de 8 à 10 lignes pour informer une équipe de 6 personnes qu'une réunion est
 * reportée » revenait de l'Architecte avec `livrable_complet_possible: true`,
 * `action_recommandee: continuer`, zéro question, zéro ambiguïté, zéro information manquante — et
 * l'Atelier affichait « La préparation approfondie ne correspond plus à la demande validée ».
 *
 * LA CAUSE, MESURÉE SUR LES FICHIERS D'ÉCHANGE RÉELS. Le contrat OPRIE rangeait trois faits —
 * objet de la réunion, motif du report, identité des destinataires — en
 * `intent.delegated_decisions`, en les déclarant traitables ; `executability.remaining_unknowns`
 * restait donc VIDE. L'analyse Architecte, que le schéma 3.4 OBLIGE à produire
 * `pilotage_incertitude`, rangeait les MÊMES faits en `inconnues_non_devineables`.
 *
 * La garde comparait alors les cardinalités — 3 contre 0 — et concluait « une inconnue absente du
 * contrat validé ». Sur JCBRHF, une seconde comparaison tirait de même : 3 hypothèses autorisées
 * contre 2, la troisième portant sur l'identité des destinataires, déjà déléguée.
 *
 * POURQUOI CE DÉFAUT FRAPPAIT LES MEILLEURES DEMANDES. Plus OPRIE délègue proprement, plus
 * `remaining_unknowns` reste vide ; plus la référence vaut zéro, plus l'arrêt est certain. Une
 * demande parfaitement spécifiée était la plus sûre d'échouer.
 *
 * CE QUE CE FICHIER ÉPROUVE. Que les deux comparaisons n'arrêtent plus rien, qu'elles restent
 * OBSERVABLES, que la vraie barrière — l'Architecte n'écrit pas dans un champ OPRIE — est intacte,
 * et que les trois autres comparaisons de cardinalité gardent l'autorité que ce lot ne leur a pas
 * retirée.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPostOprieValidator, oprieReadyTurn, coherentAnalysis, canonicalFrom } from './post-oprie-validation-harness.helper.mjs';
import {
  enrichCanonicalContractFromArchAnalysis, validateArchCanonicalEnrichment,
  createArchEnrichmentAuditView, mergePostOprieSignals, ARCH_REGISTER_DIVERGENCE,
  ARCH_ENRICHABLE_PATHS, ARCH_SIGNALS
} from '../core/adn/arch-canonical-enrichment.js';

const module_ = fs.readFileSync(new URL('../core/adn/arch-canonical-enrichment.js', import.meta.url), 'utf8');
const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/** Le tour OPRIE des cas réels : trois faits DÉLÉGUÉS, aucune inconnue conservée. */
const tourDelegue = () => oprieReadyTurn({
  operational_request_candidate: {
    delegated_decisions: ['DEL_1', 'DEL_2', 'DEL_3'],
    assumptions_allowed: ['ASSUM_1', 'ASSUM_2'],
    remaining_unknowns: []
  }
});
/** L'analyse qui reclasse ces mêmes faits dans SES registres. */
const analyseReclassante = ({ inconnues = 3, hypotheses = 2 } = {}) => coherentAnalysis({
  strategie: {
    capacites_necessaires: [], hypotheses_interdites: [],
    hypotheses_autorisees: Array.from({ length: hypotheses }, (_, i) => `HYP_${i + 1}`),
    role_adaptatif: { intitule: 'Rôle', mission: 'Mission de contrôle.', competences: ['c'], limites: ['l'] },
    niveau_architecture: 'minimal', justification_niveau: 'Demande simple et spécifiée.',
    pilotage_incertitude: {
      decisions_autonomes: [], estimations_a_etiqueter: [],
      inconnues_non_devineables: Array.from({ length: inconnues }, (_, i) => `INC_${i + 1}`)
    }
  }
});

/* ==========================================================================
 * A ET B — LES DEUX COMPARAISONS PROUVÉES INVALIDES N'ARRÊTENT PLUS RIEN
 * ======================================================================= */

test('T-AA03-01 · A : une inconnue Architecte déjà déléguée côté OPRIE ne bloque plus', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const base = canonicalFrom(tourDelegue());
  const analyse = analyseReclassante({ inconnues: 3, hypotheses: 2 });

  /* La situation exacte des deux cas réels : 3 inconnues nommées, 0 conservée côté OPRIE. */
  assert.equal(base.executability.remaining_unknowns.length, 0, 'OPRIE n’a conservé aucune inconnue');
  assert.equal(analyse.strategie.pilotage_incertitude.inconnues_non_devineables.length, 3);

  const { signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  assert.deepEqual(signals.filter((s) => s.canonical_field === 'executability.remaining_unknowns'), [],
    'aucun signal bloquant sur ce registre');
  assert.equal(validateFromTurn(analyse, tourDelegue()).ok, true, 'et le validateur de l’artefact laisse passer');
});

test('T-AA03-02 · B : une hypothèse Architecte portant sur un fait délégué ne bloque plus', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const base = canonicalFrom(tourDelegue());
  /* JCBRHF à l’identique : 3 hypothèses nommées contre 2 autorisées. */
  const analyse = analyseReclassante({ inconnues: 0, hypotheses: 3 });
  assert.equal(base.assumptions.allowed.length, 2);

  const { signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  assert.deepEqual(signals.filter((s) => s.canonical_field === 'assumptions.allowed'), [],
    'aucun signal bloquant sur ce registre');
  const verdict = validateFromTurn(analyse, tourDelegue());
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.signals, [], 'l’artefact ne produit plus rien de bloquant ici');
});

test('T-AA03-03 · les deux cas réels réunis : zéro arrêt après fusion de production', () => {
  const { validate } = loadPostOprieValidator();
  const base = canonicalFrom(tourDelegue());
  const analyse = analyseReclassante({ inconnues: 3, hypotheses: 3 });
  const validation = validate(analyse, base);
  const enrichissement = enrichCanonicalContractFromArchAnalysis(base, analyse);
  /* La fusion EXACTE de la production : signals + signals, jamais les observations. */
  const stop = mergePostOprieSignals(validation.signals, enrichissement.signals);
  assert.deepEqual(stop, [], 'rien n’arrête la préparation');
});

/* ==========================================================================
 * L'OBSERVABILITÉ SURVIT, SANS AUTORITÉ ET SANS TEXTE
 * ======================================================================= */

test('T-AA03-04 : la divergence reste observable, dénombrée, et jamais bloquante', () => {
  const base = canonicalFrom(tourDelegue());
  const analyse = analyseReclassante({ inconnues: 3, hypotheses: 3 });
  const { observations } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  assert.equal(observations.length, 2, 'les deux divergences sont relevées');
  for (const o of observations) {
    assert.equal(o.kind, ARCH_REGISTER_DIVERGENCE);
    assert.equal(o.blocking, false, 'une observation ne bloque pas');
    assert.ok(Number.isInteger(o.canonical_count) && Number.isInteger(o.arch_count));
    assert.ok(o.arch_count > o.canonical_count, 'elle dit bien ce qui a été constaté');
  }
  const champs = observations.map((o) => o.canonical_field).sort();
  assert.deepEqual(champs, ['assumptions.allowed', 'executability.remaining_unknowns']);
  /* ADN-ARCH-03b — le troisième registre désarmé s'observe de la même façon, par le MÊME canal. */
  const avecSec = coherentAnalysis();
  avecSec.comprehension.intentions_secondaires = ['S1', 'S2'];
  const troisieme = enrichCanonicalContractFromArchAnalysis(canonicalFrom(oprieReadyTurn()), avecSec);
  assert.deepEqual(troisieme.signals, []);
  assert.equal(troisieme.observations.length, 1);
  assert.equal(troisieme.observations[0].kind, ARCH_REGISTER_DIVERGENCE);
  assert.equal(troisieme.observations[0].canonical_field, 'intent.secondary_objectives');
});

test('T-AA03-05 : une observation NE PEUT PAS devenir un arrêt — la séparation est structurelle', () => {
  /* LE POINT DE CONCEPTION. `mergePostOprieSignals` est FAIL CLOSED : un type inconnu devient un
     TECHNICAL_STOP. Un « signal non bloquant » était donc impossible dans ce vocabulaire. Les
     observations vivent hors de la liste de signaux : l’appelant ne peut pas les fusionner par
     inadvertance, parce qu’elles ne sont pas là où il puise. */
  assert.equal(ARCH_SIGNALS.includes(ARCH_REGISTER_DIVERGENCE), false,
    'la divergence n’est pas un cinquième signal');
  const base = canonicalFrom(tourDelegue());
  const resultat = enrichCanonicalContractFromArchAnalysis(base, analyseReclassante({ inconnues: 3, hypotheses: 3 }));
  assert.deepEqual(resultat.signals, [], 'la liste de signaux est vide');
  assert.equal(resultat.observations.length, 2, 'et les constats sont ailleurs');
  /* Et si quelqu’un les fusionnait quand même, la garde fail-closed le dirait au lieu de les taire. */
  const force = mergePostOprieSignals(resultat.observations);
  assert.equal(force.every((s) => s.signal === 'TECHNICAL_STOP'), true,
    'un détournement se voit : il ne passe pas pour un CONTRACT_INCONSISTENT');

  /* Côté artefact, la production ne passe QUE les signaux à la fusion. */
  assert.match(artefact, /adnMergePostOprieSignals\(validation\.signals,enrichment&&enrichment\.signals\)/);
  assert.equal(/adnMergePostOprieSignals\([^)]*divergences/.test(artefact), false,
    'aucune divergence n’atteint la fusion');
});

test('T-AA03-06 : la vue d’audit porte les divergences, et aucun mot de la personne', () => {
  const base = canonicalFrom(tourDelegue());
  const { contract, signals, observations } = enrichCanonicalContractFromArchAnalysis(base, analyseReclassante({ inconnues: 3, hypotheses: 3 }));
  const vue = createArchEnrichmentAuditView(base, contract, signals, observations);
  assert.equal(vue.register_divergences.length, 2);
  assert.equal(vue.readiness_unchanged, true);
  assert.deepEqual(vue.mutated_oprie_fields, []);
  /* Des noms de champ et des comptes : rien d’autre ne doit pouvoir entrer. */
  for (const d of vue.register_divergences) {
    assert.deepEqual(Object.keys(d).sort(), ['arch_count', 'arch_source_field', 'canonical_count', 'canonical_field']);
  }
  const serialise = JSON.stringify(vue);
  for (const fuite of ['INC_1', 'HYP_1', 'DEL_1', 'ASSUM_1']) {
    assert.equal(serialise.includes(fuite), false, `${fuite} n’a rien à faire dans une vue d’audit`);
  }
});

/* ==========================================================================
 * LA VRAIE BARRIÈRE EST INTACTE
 * ======================================================================= */

test('T-AA03-07 · C : une mutation réelle d’un champ OPRIE protégé bloque TOUJOURS', () => {
  /* C’est cela que la garde devait protéger, et elle le protège toujours — par comparaison de
     CHEMINS, qui ne dénombre rien et ne peut pas confondre une lecture avec une écriture. */
  const base = canonicalFrom(tourDelegue());
  const { contract } = enrichCanonicalContractFromArchAnalysis(base, coherentAnalysis());

  for (const [chemin, muter] of [
    ['intent.objective', (c) => { c.intent.objective = 'Objectif réécrit par l’Architecte.'; }],
    ['intent.secondary_objectives', (c) => { c.intent.secondary_objectives = [{ text: 'ajouté' }]; }],
    ['assumptions.allowed', (c) => { c.assumptions.allowed = [{ text: 'a' }, { text: 'b' }, { text: 'c' }]; }],
    ['executability.remaining_unknowns', (c) => { c.executability.remaining_unknowns = [{ text: 'x' }]; }],
    ['original_request', (c) => { c.original_request = 'Autre demande.'; }]
  ]) {
    const falsifie = JSON.parse(JSON.stringify(contract));
    muter(falsifie);
    const verdict = validateArchCanonicalEnrichment(base, falsifie, coherentAnalysis());
    assert.equal(verdict.ok, false, `${chemin} muté doit être refusé`);
    assert.ok(verdict.problems.length > 0, `${chemin} : un problème est nommé`);
  }
  /* Et les deux champs que ce lot cesse de compter restent HORS de la liste blanche : l’Architecte
     peut les NOMMER dans son analyse, jamais les ÉCRIRE dans le contrat. */
  for (const protege of ['assumptions.allowed', 'executability.remaining_unknowns', 'intent.secondary_objectives']) {
    assert.equal(ARCH_ENRICHABLE_PATHS.includes(protege), false, `${protege} n’est pas enrichissable`);
  }
});

test('T-AA03-08 · D : l’analyse cohérente historique ne régresse pas', () => {
  const { validateFromTurn } = loadPostOprieValidator();
  const tour = oprieReadyTurn();
  const analyse = coherentAnalysis();
  assert.equal(validateFromTurn(analyse, tour).ok, true);
  const base = canonicalFrom(tour);
  const { signals, observations, contract } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  assert.deepEqual(signals, [], 'aucun signal sur une analyse cohérente');
  assert.deepEqual(observations, [], 'et aucune divergence à observer');
  assert.deepEqual(validateArchCanonicalEnrichment(base, contract, analyse).mutated_oprie_fields, []);
});

test('T-AA03-09 : les DEUX autres comparaisons de cardinalité gardent leur autorité', () => {
  /* PÉRIMÈTRE, MIS À JOUR PAR ADN-ARCH-03b. Trois comparaisons ont désormais perdu leur autorité,
     chacune sur preuve d’un cas réel : `assumptions.allowed` et `executability.remaining_unknowns`
     (JCBRHF, VELA5Q), puis `intent.secondary_objectives` (GASPPN). Les DEUX dernières la conservent,
     et le resteront tant qu’aucun cas réel ne les invalide : les toucher par analogie serait décider
     à la place du propriétaire. Ce test le constate, pour qu’un lot futur voie ce qui a été laissé. */
  const { validate } = loadPostOprieValidator();
  const base = canonicalFrom(oprieReadyTurn());
  const cas = [
    ['intent.delegated_decisions', (a) => { a.strategie.pilotage_incertitude = { decisions_autonomes: ['D1'], estimations_a_etiqueter: [], inconnues_non_devineables: [] }; }],
    ['executability.substitutable_missing', (a) => { a.comprehension.ambiguites = ['A1']; }]
  ];
  for (const [champ, muter] of cas) {
    const analyse = coherentAnalysis();
    muter(analyse);
    const { signals } = enrichCanonicalContractFromArchAnalysis(base, analyse);
    assert.ok(signals.some((s) => s.canonical_field === champ), `${champ} bloque encore`);
  }
  /* Et le validateur de l’artefact conserve les siens, sauf ceux qui ont été retirés. */
  const analyseAmb = coherentAnalysis();
  analyseAmb.comprehension.ambiguites = ['A1'];
  assert.equal(validate(analyseAmb, base).ok, false, 'l’artefact bloque encore sur les ambiguïtés');
  /* Le troisième registre désarmé ne bloque plus, ni au module ni à l’artefact. */
  const analyseSec = coherentAnalysis();
  analyseSec.comprehension.intentions_secondaires = ['S1'];
  const verdictSec = validate(analyseSec, base);
  assert.equal(verdictSec.ok, true, 'les objectifs secondaires ne bloquent plus');
  assert.equal(verdictSec.divergences[0].canonical_field, 'intent.secondary_objectives');
});

/* ==========================================================================
 * LES FICHIERS RÉELS, QUAND ILS SONT LÀ
 * ======================================================================= */

test('T-AA03-10 : rejeu des échanges réels JCBRHF, VELA5Q et GASPPN', (t) => {
  /* Ces fichiers portent la demande d’une personne : ils ne sont PAS versionnés. Le test les
     rejoue quand ils sont présents sur la machine du propriétaire, et se déclare ignoré sinon —
     la propriété est déjà couverte par les fixtures neutres ci-dessus, aux mêmes cardinalités. */
  const dossier = `${process.env.HOME}/Downloads`;
  const presents = ['JCBRHF', 'VELA5Q', 'GASPPN'].filter((id) =>
    fs.existsSync(`${dossier}/demande-pour-ia-${id}.json`) && fs.existsSync(`${dossier}/reponse-de-ia-${id}.json`));
  if (presents.length < 3) return t.skip('échanges réels absents de cette machine');

  const { validate } = loadPostOprieValidator();
  for (const id of presents) {
    const demande = JSON.parse(fs.readFileSync(`${dossier}/demande-pour-ia-${id}.json`, 'utf8'));
    const texte = demande.requete_complete;
    const bloc = texte.slice(texte.indexOf('## CONTRAT D’EXÉCUTION ADN'), texte.indexOf('## EXECUTION READINESS GATE'));
    const brut = bloc.slice(bloc.indexOf('{'));
    const compact = JSON.parse(brut.slice(0, brut.lastIndexOf('}') + 1));
    const reponse = JSON.parse(fs.readFileSync(`${dossier}/reponse-de-ia-${id}.json`, 'utf8'));
    delete reponse.id_echange;

    const base = canonicalFrom(oprieReadyTurn({ operational_request_candidate: {
      secondary_objectives: compact.secondary_objectives || [],
      confirmed_priorities: compact.priorities || [],
      delegated_decisions: compact.delegated_decisions || [],
      assumptions_allowed: compact.assumptions || [],
      remaining_unknowns: compact.remaining_unknowns || []
    } }), { request_id: compact.request_id });

    const validation = validate(reponse, base);
    const enrichissement = enrichCanonicalContractFromArchAnalysis(base, reponse);
    const stop = mergePostOprieSignals(validation.signals, enrichissement.signals);
    assert.deepEqual(stop, [], `${id} : aucun arrêt bloquant`);
    const verdict = validateArchCanonicalEnrichment(base, enrichissement.contract, reponse);
    assert.equal(verdict.ok, true, `${id} : enrichissement accepté`);
    assert.deepEqual(verdict.mutated_oprie_fields, [], `${id} : mutated_oprie_fields = []`);
  }
});

test('T-AA03-12 · GASPPN : un registre ABSENT du contrat vaut zéro, et n’arrête plus rien', () => {
  /* LE CAS GASPPN, EN FIXTURE NEUTRE. Ce que l'échange réel portait de décisif n'est pas son texte,
     c'est sa FORME : le contrat compact exporté n'avait AUCUN registre `secondary_objectives` — la
     projection ne l'inclut que s'il est non vide — donc la référence valait zéro, tandis que le
     schéma 3.4 rend `intentions_secondaires` OBLIGATOIRE côté Architecte. Toute analyse conforme
     dépassait donc la référence.

     C'est la forme partagée par les trois désarmements de ce chantier, et c'est elle qu'il faut
     garder sous test : un registre qu'OPRIE laisse vide ne doit pas rendre l'obligation du schéma
     auto-incriminante. */
  const { validateFromTurn } = loadPostOprieValidator();
  /* Aucun objectif secondaire côté OPRIE — exactement l'export GASPPN. */
  const tour = oprieReadyTurn({ operational_request_candidate: {
    secondary_objectives: [], assumptions_allowed: ['A1', 'A2', 'A3'], delegated_decisions: ['D1', 'D2', 'D3']
  } });
  const base = canonicalFrom(tour);
  assert.equal(base.intent.secondary_objectives.length, 0, 'le registre est vide, comme à l’export');

  const analyse = coherentAnalysis();
  analyse.comprehension.intentions_secondaires = [
    'Maintenir une communication sereine.', 'Formuler le changement sans ambiguïté.'
  ];

  const verdict = validateFromTurn(analyse, tour);
  assert.equal(verdict.ok, true, 'le tour n’est plus arrêté');
  assert.deepEqual(verdict.signals, [], 'zéro signal bloquant');
  assert.equal(verdict.divergences.length, 1);
  assert.equal(verdict.divergences[0].canonical_field, 'intent.secondary_objectives');
  assert.equal(verdict.divergences[0].canonical_count, 0);
  assert.equal(verdict.divergences[0].arch_count, 2);

  /* Et rien n'a été écrit : c'est la seule garantie qui compte. */
  const { contract, signals, observations } = enrichCanonicalContractFromArchAnalysis(base, analyse);
  assert.deepEqual(signals, [], 'le module non plus n’arrête rien');
  assert.ok(observations.some((o) => o.canonical_field === 'intent.secondary_objectives'));
  assert.deepEqual(contract.intent.secondary_objectives, base.intent.secondary_objectives);
  assert.deepEqual(validateArchCanonicalEnrichment(base, contract, analyse).mutated_oprie_fields, []);
  assert.equal(JSON.stringify(contract).includes('communication sereine'), false,
    'l’intention nommée n’entre pas dans le contrat');
});

test('T-AA03-11 : aucun appariement lexical n’a été introduit', () => {
  /* L’INTERDIT DU LOT, VÉRIFIÉ SUR LES OCTETS. La garde retirée n’est remplacée par AUCUNE
     comparaison de contenu : ni égalité de chaînes entre registres, ni similarité, ni seuil, ni
     classifieur, ni appel de modèle. Ce qui reste compare des CHEMINS et dénombre. */
  const zone = module_.slice(module_.indexOf('function diagnoseAgainstOprie'), module_.indexOf('/* Seul fait de danger'));
  for (const interdit of ['toLowerCase', 'match(', 'RegExp', 'similar', 'distance', 'threshold', 'seuil', 'embedding', 'fetch(']) {
    assert.equal(zone.includes(interdit), false, `« ${interdit} » n’a pas sa place dans ce diagnostic`);
  }
  /* Et aucun registre canonique nouveau n’a été créé. */
  assert.equal(ARCH_ENRICHABLE_PATHS.length, 19, 'la liste blanche est inchangée');
});
