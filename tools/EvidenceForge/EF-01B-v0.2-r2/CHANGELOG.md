# EF-01B — Changelog

## v0.2-r2.0 (correctif ciblé F-P2-03 — plafond de tokens de sortie du resolver)

Lot **successeur** de `EF-01B-v0.2-r1`, qui reste **immuable** et n'a été
modifié à aucun moment.

- **F-P2-03 (BLOCKER) — REAL RESOLVER OUTPUT TOKEN CEILING** : découvert
  lors de la première acquisition réelle de provenance (transport
  `delegated`, Worker R7, HTTP 200, `content[0].text` correctement
  fourni). `lib/real-llm-call.js` figeait `max_tokens: 1024` en dur ; la
  réponse JSON à 10 propositions dépassait ce plafond et était tronquée
  en cours de chaîne, faisant échouer `JSON.parse()` dans
  `lib/parser.js` (`LLM_RESPONSE_INVALID` — « Unterminated string in JSON
  at position 2573 »). Aucune evidence n'était persistée (l'écriture a
  lieu après le parsing), aucune discipline n'était produite. Défaut
  indépendant du modèle : le bloc `thinking` de `claude-sonnet-5` le
  masquait jusqu'ici.
- **Correction** : `lib/real-llm-call.js` — `max_tokens: 1024` devient
  `max_tokens: 4096`. **Une seule valeur littérale change dans tout le
  lot.**
- **Inchangé, et prouvé byte-identique à r1 par les tests** :
  `prompts/` (prompt et `PROMPT_VERSION` jamais amendés), `lib/parser.js`
  (schéma), `lib/hash.js` (primitives), `lib/executor.js`,
  `lib/evidence-writer.js`, `lib/errors.js`, `PROMPT-REGISTRY.md`,
  `CONTRACT.md`, `README.md`.
- **Limite technique de propositions** : inchangée, reste pilotée par
  l'appelant (`technicalProposalLimit`) — la mission réelle auditée reste
  à **10**.
- **Provenance** : aucun champ ajouté, retiré ni redéfini (15 champs
  identiques). `max_tokens` n'entre ni dans `canonicalInputObject` (9
  champs, inchangés) ni dans aucun hash — il ne peut structurellement pas
  atteindre la provenance. Les *valeurs* de `rawResponseHash` /
  `resolverOutputHash` diffèreront nécessairement, une réponse complète
  n'étant pas une réponse tronquée ; leur *sémantique* est inchangée.
- **Contrat externe** : aucun changement. `max_tokens` était déjà un
  champ requis du contrat Anthropic Messages API et était déjà émis ;
  seule sa valeur change. La validation du Worker R7
  (`typeof === "number" && > 0`) l'accepte sans redéploiement.
- **Invariants scientifiques** : inchangés (F-01 aucune proposition de
  professionnel, F-02 aucune dépendance à un RunContract confirmé, F-07
  `resolverOutputHash`).
- **Hors périmètre, volontairement** : aucun diagnostic `stop_reason`
  ajouté ; `EF-01C1-v0.2-r1/lib/real-llm-call.js:125` porte le même
  plafond 1024 sur le chemin planner et reste inchangé (défaut jumeau
  latent, non bloquant tant que le planner n'est pas exécuté) ; R6, le
  Worker R7, le kit opérateur et `mission.json` ne sont pas touchés.
- **Tests** : `test/test-ef01b-v0.2-r2.js` — 40/40 PASS
  (`LOCAL_CONTROLLED`, 0 appel réseau réel, 0 secret réel). Les 29
  assertions de r1 sont intégralement conservées ; 11 assertions
  `T-R2-01`→`T-R2-11` sont ajoutées. Le `fakeGateway` capture désormais
  la requête émise — en r1 il ignorait son argument, ce qui rendait le
  plafond `max_tokens` structurellement inobservable par les tests.


## v0.2-r1.0 (correctif ciblé F-01/F-02/F-03/F-04/F-05/F-06)

En réponse à `EvidenceForge-AUDIT-INDEPENDANT-EF-01B-C1-v0.2.md` :

- **F-01 (BLOCKER)** : le resolver propose désormais des **disciplines**
  (jamais des professionnels) — nouveau prompt/schéma de sortie
  (`proposals[]`), rejet explicite de toute réponse au format
  professionnels.
- **F-02 (BLOCKER)** : suppression complète de la dépendance à
  `runContractHash` — le resolver s'exécute avant toute confirmation de
  RunContract, conformément au contrat gelé v0.1.
- **F-03 (BLOCKER)** : `provenance.model` est désormais le modèle
  RÉELLEMENT utilisé/observé (`resolveRealLlmModel()` + observation de
  l'enveloppe provider), jamais une valeur déclarative — nouveau
  `lib/real-llm-call.js`.
- **F-04 (MAJOR)** : `provenance.transport` est dérivé de la configuration
  réellement enregistrée sur `mono04` (`providerRegistry.getProviderConfig`),
  jamais d'une variable d'environnement relue indépendamment.
- **F-05 (MAJOR)** : `provenance.rawResponseHashScope = "assistant_text"`
  déclare explicitement la sémantique de `rawResponseHash`.
- **F-06 (MAJOR)** : séparation explicite `localInvocationId` (généré
  localement) / `providerRequestId` (observé, ou `null`).
- Passage d'un appel LLM **par discipline déjà connue** à un appel unique
  **au niveau mission**, produisant plusieurs propositions de disciplines
  en une fois — `resolverRuns[]` reste v0.1-compatible par expansion
  positionnelle (une entrée par discipline retenue, provenance d'appel
  partagée).
- Nouveau : `resolverOutputHash`, transmis au planner pour fermer F-07
  côté EF-01C1-v0.2-r1.
- Compatibilité v0.1 désormais scindée en `STRUCTURAL_COMPATIBILITY_V01`
  (forme, `assertResolverTraceConsistent()`) et `SEMANTIC_COMPATIBILITY_V01`
  (contenu réellement une discipline) — jamais un seul PASS global.

## v0.2.0 (première implémentation réelle — SUPERSEDED par v0.2-r1)

Voir `EF-01B-v0.2/CHANGELOG.md` (lot précédent) : implémentait à tort un
resolver de professionnels — corrigé par v0.2-r1 (F-01).
