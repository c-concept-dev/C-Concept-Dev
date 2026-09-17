# 15 — R3 Closure (M-02, B-04)

Round 3 (R3) porte UNIQUEMENT sur les deux points restés ouverts après
r2 : M-02 (dérivation causale) et B-04 (clarification de l'autonomie du
bundle). B-01, B-02, B-03, M-01, M-03 sont hérités CLOSED de r2, sans
modification fonctionnelle ce round (revérifiés non-régressés
ci-dessous).

## M-02 — dérivation causale SearchProtocol ← plannerOutput

- **Défaut** : `lib/eforch-artifacts.js::buildSearchProtocolForMission()`
  — contenu substantiel jamais dérivé du `plannerRun` fourni, même en
  mode REAL (preuve avant : `test_t08_r2_closure.js::M02-01`, r2).
- **Fichiers modifiés** : `lib/eforch-artifacts.js` (nouvelles fonctions
  `validateRealPlannerOutputFields`, `buildSearchProtocolFromPlannerOutput`,
  `buildSearchProtocolForMission()` réécrite pour dériver réellement du
  `plannerOutput` en mode REAL, `validateRealEForchProvenance()` étendue),
  `lib/real-e2e-driver.js` (transport de `provenanceOpts.plannerOutput`/
  `realProvenance.plannerOutput`).
- **Fix** : `provenance.plannerOutput` (contenu causal réel) désormais
  obligatoire en mode REAL, transformé DÉTERMINISTIQUEMENT (jamais un
  gabarit) ; fail-closed explicite (`"planner causal output missing"`)
  si absent ; lineage cryptographique (`causalLineage.plannerOutputHash`
  intégré au contenu hashé par `protocolHash`) ; classification
  `provenanceClassification=OPERATOR_ATTESTED_LLM_DERIVED`.
- **Test** : `test/test_t08_r3_closure.js` (18 assertions selon contexte d'execution — 16 en depot de developpement ou B-04 dynamique est SKIPPED, 18 depuis le paquet assemble ou B-04 s'execute integralement ; M02-01..M02-10
  + M02-08b + M02-GATE + section B-04) — non-tautologique (deux
  `plannerOutput` concrets et indépendants, jamais un round-trip via la
  fonction testée).
- **Commande exécutée** :
  `EVIDENCEFORGE_KIT_ROOT=<kitroot> EVIDENCEFORGE_MONO07_LIB_PATH=<mono07/lib> node test/test_t08_r3_closure.js <kitroot>`
- **Résultat réel** : `TOUS LES TESTS PASSENT (18)` depuis le paquet
  assemblé (`16` depuis le dépôt de développement, où la sous-preuve
  dynamique B-04 est honnêtement `SKIPPED` — jamais un faux PASS), exit
  code 0 dans les deux cas.
- **Limitation restante** : voir `16-M02-CAUSAL-LINEAGE.md`, section
  « Limitations restantes » — MONO-08 transporte et transforme
  réellement la provenance/le contenu fournis, mais ne vérifie toujours
  pas indépendamment (cryptographiquement/réseau) que l'appel LLM
  sous-jacent a réellement eu lieu — d'où `OPERATOR_ATTESTED_LLM_DERIVED`,
  jamais `VERIFIED_LLM_DERIVED`. Ceci est le périmètre contractuel
  attendu de MONO-08 (accepteur d'attestation), pas un défaut résiduel
  de M-02.

## B-04 — autonomie du bundle : artefacts vs toolchain

- **Défaut** : le rapport r2 (`12-R2-CLOSURE.md`) affirmait « zéro
  ressource externe à l'extraction utilisée », une formulation
  surqualifiée qui ne distinguait pas les artefacts EvidenceForge de la
  toolchain système (Node/npm/Playwright/zip).
- **Fichiers modifiés** : aucun changement de comportement de
  `lib/kit-root-adapter.js` (déjà correct depuis r2 — revue confirmant
  l'absence de référence à un ancien layout HANDOFF) ; documentation
  nouvelle/corrigée uniquement.
- **Fix** : définition explicite adoptée (`BUNDLE_ARTIFACT_AUTONOMY` ≠
  `RUNTIME_TOOLCHAIN_AUTONOMY`, mandat section 16), prérequis système
  documentés exhaustivement (`18-RUNTIME-PREREQUISITES.md`), correction
  de la formulation r2 (`17-B04-ARTIFACT-AUTONOMY.md`) SANS réécrire le
  document r2 original (préservé tel quel).
- **Test** : `test/test_t08_r3_closure.js` (section B-04, B04-R3-01..07)
  — existence/contenu de `18-RUNTIME-PREREQUISITES.md`, absence de
  référence à un ancien layout HANDOFF nommé dans `kit-root-adapter.js`,
  provenance du `MONO-05` reconstruit strictement sous le répertoire
  jetable de l'adaptateur, revue statique des outils système
  effectivement invoqués (`execFileSync`) — seul `zip` détecté, cohérent
  avec `18-RUNTIME-PREREQUISITES.md`.
  Complète, sans dupliquer, `test/test_t08_r2_closure.js::B04-01..05`
  (dynamique complète : extraction fraîche + reconstruction KIT_ROOT +
  extraction MONO-05 + `test_t08_eforch.js` 26/26 depuis le paquet
  réellement zippé — réexécutée sans régression, voir rapport terminal).
- **Commande exécutée** : identique à M-02 ci-dessus (même fichier de
  test, même invocation).
- **Résultat réel** : inclus dans les 18/18 PASS (paquet assemble) / 16/16 PASS (depot de developpement, B-04 dynamique SKIPPED) de
  `test_t08_r3_closure.js` ci-dessus.
- **Limitation restante** : `BUNDLE_ARTIFACT_AUTONOMY = PASS` reste
  scopé aux suites qui dépendent de `harness-env.js`/
  `extractFrozenMono05()` — le gate MONO-06 COMPLET (13 artefacts
  canoniques incluant les fixtures HISTORIQUES externes à MONO-00→08)
  reste hors périmètre, comme documenté depuis r2 (`17-B04-ARTIFACT-
  AUTONOMY.md`, section « Limite honnêtement disclosed »).

## Non-régression (r1/r2 → r3)

Réexécution de la liste complète du mandat R3 (section 21), même
`KIT_ROOT`/`EVIDENCEFORGE_MONO07_LIB_PATH` :

| Suite | Résultat |
|---|---|
| `test_t08_cross_process.js` | PASS (CROSS_PROCESS=PASS, 2 PID distincts) |
| `test_t08_epistemic_integrity.js` | 11/11 PASS (fixture mise à jour avec `plannerOutput`) |
| `test_t08_observability.js` | 10/10 PASS |
| `test_t08_eforch.js` | 26/26 PASS |
| `test_t08_runner_orchestration.js` | 10/10 PASS (fixture mise à jour avec `plannerOutput`) |
| `test_t08_release_governance.js` | 4/4 PASS |
| `test_t08_preflight.js` | 10/10 PASS |
| `test_t08_v06_delegated_auth.js` | 24/24 PASS |
| `test_t08_v06_real_adapter_model.js` | 9/9 PASS |
| `test_t08_r2_closure.js` | 64/64 PASS (section M-02 réinterprétée, jamais supprimée — voir `16-M02-CAUSAL-LINEAGE.md`) |
| `test_t08_r3_closure.js` | 18/18 PASS depuis le paquet assemble (nouvelle suite r3 ; 16/16 depuis le depot de developpement, B-04 dynamique honnetement SKIPPED — voir 17-B04-ARTIFACT-AUTONOMY.md) |
| `worker/evidenceforge-llm-proxy/test/worker.test.js` | 38/38 PASS (non affecté, code worker inchangé) |
| `test_t08_matrix.js` | Inchangé depuis r2 : 5 PASS / 19 NOT_RUN_ENVIRONMENT_BLOCKED (honnête) avec le `KIT_ROOT` de production complet (13 artefacts canoniques, incluant `HISTORIQUES/`) utilisé pour générer ce rapport. **Note de méthode** : durant le développement de r3, un `KIT_ROOT` ad hoc reconstruit uniquement depuis `MONO-00..07/` en clair (sans `HISTORIQUES/`) a été utilisé pour itérer rapidement sur les autres suites — `T08-01` (baseline-gate MONO-06 complet) y échoue, car ce gate exige les 13 artefacts. Cet échec a été vérifié IDENTIQUE avant et après le commit r3 (`git stash`/comparaison directe), confirmant qu'il s'agit d'une limite déjà connue du `KIT_ROOT` ad hoc (jamais du code r3) — voir `17-B04-ARTIFACT-AUTONOMY.md`. Le résultat officiel ci-dessus (5 PASS/19 NOT_RUN) utilise le `KIT_ROOT` de production complet, comme en r1/r2. |

**Aucune régression introduite par r3.** Les totaux `test_t08_r2_
closure.js` passent de 62 à 64 (2 nouvelles assertions B-03/
`plannerOutput` ajoutées intentionnellement, jamais une perte de
couverture). `test_t08_r3_closure.js` (nouvelle suite) totalise 18
assertions depuis le paquet assemblé.

## Vérification finale (packaging)

Après reconstruction complète du paquet `EvidenceForge-MONO-01-08-
REMEDIATED-r3.zip`, celui-ci a été extrait dans un répertoire NEUF
(jamais réutilisé du répertoire de travail de cette mission), un
`KIT_ROOT` temporaire reconstruit depuis SON PROPRE contenu extrait
(`lib/kit-root-adapter.js`), puis trois suites rejouées depuis cette
extraction fraîche, contre ce `KIT_ROOT` temporaire :

- `test/test_t08_eforch.js` → **26/26 PASS**.
- `test/test_t08_r3_closure.js` (`EVIDENCEFORGE_CLEAN_BUNDLE_ROOT`
  pointant vers l'extraction elle-même) → **18/18 PASS** (section B-04
  dynamique intégralement exécutée, jamais SKIPPED, depuis le ZIP réel).
- `test/test_t08_r2_closure.js` (suite complète) → **64/64 PASS**.

**Total : 108/108 PASS**, zéro référence à un ancien artefact
EvidenceForge externe au ZIP (`BUNDLE_ARTIFACT_AUTONOMY` confirmée sur
le paquet réellement shippé, pas seulement en développement).

## Non-modification de MONO-01→07

Confirmée : `git status`/`git diff` sur le dépôt de développement
montrent exclusivement des fichiers sous `EvidenceForge/MONO-08/v0.6/`
(commits `5d4174d` puis `f2daa82`, 7 fichiers changés au total — le
second commit corrige une regex de test fragile détectée par sa propre
exécution contre le document réel). Aucun fichier sous
`MONO-01/`→`MONO-07/` n'a été touché — vérifié une seconde fois par la
reconstruction du `KIT_ROOT` depuis le contenu canonique (identique à
celui utilisé en r2, jamais régénéré).
