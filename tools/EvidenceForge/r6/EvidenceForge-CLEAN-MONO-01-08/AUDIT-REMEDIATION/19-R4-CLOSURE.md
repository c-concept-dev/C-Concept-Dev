# 19 — R4 Closure (F-01, F-02, F-03)

Round 4 (R4) est le dernier round de préparation au Real Smoke : il
ferme les trois écarts relevés par l'audit indépendant après R3 —
cohérence de la mission canonique avec son propre mission-gate (F-01),
cohérence des attestations opérateur (F-02), lineage EF-01C2→EF-01D
(F-03). B-01→B-04/M-01→M-03 sont hérités CLOSED de r2/r3, sans
modification fonctionnelle ce round (revérifiés non-régressés).

## R4-F01 — mission canonique cohérente avec son propre mission-gate

- **Défaut** : `fixtures/mission-real-smoke-v1.json` portait
  `readyForExecution: true` alors que `eForchProvenance` était absente
  — le mission-gate (r2/r3) la refuse correctement, mais la fixture
  elle-même mentait sur son propre état.
- **Fichier modifié** : `fixtures/mission-real-smoke-v1.json`
  (`readyForExecution` → `false`, `blockedReason` explicite,
  `operatorInputRequired` listant les 5 entrées manquantes — Option A
  du mandat, section 6). Aucun contenu réel déjà validé
  (professionnels, documents cibles) n'a été modifié.
- **Nouveau** : `fixtures/real-provenance-operator-input.example.json`
  (`mode: "SYNTHETIC_EXAMPLE"`, jamais chargé automatiquement — vérifié
  statiquement).
- **Test** : `test/test_t08_r4_closure.js`, R4-F01-01..05 (5 assertions).
- **Commande exécutée** :
  `EVIDENCEFORGE_KIT_ROOT=<kitroot> EVIDENCEFORGE_MONO07_LIB_PATH=<mono07/lib> node test/test_t08_r4_closure.js <kitroot>`
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (25)`.
- **Limitation restante** : aucune — la fixture reflète désormais
  honnêtement son propre état. `MISSION_READINESS = NOT_READY` en
  découle directement (voir `22-MISSION-READINESS.md`), ce qui est le
  comportement attendu, pas un défaut.

## R4-F02 — cohérence des attestations opérateur

- **Défaut relevé** : les attestations (`resolverRuns`, `plannerRun`,
  `humanValidation`, `auditDecisions`) étaient correctement classées
  `OPERATOR_ATTESTED_*`, mais aucune vérification de cohérence
  positionnelle (discipline attestée vs discipline réellement retenue
  par le RunContract) n'existait — une attestation aurait pu être
  silencieusement mal attribuée par simple confiance positionnelle.
- **Fichier modifié** : `lib/eforch-artifacts.js`
  (`buildResolverTraceForMission()` et `validateRealEForchProvenance()`
  — même règle de cohérence, jamais deux logiques divergentes ; champ
  `discipline` optionnel sur `resolverRuns[i]`, jamais requis, donc
  jamais de régression sur les fixtures r1/r2/r3 existantes qui ne le
  fournissent pas).
- **Test** : `test/test_t08_r4_closure.js`, R4-F02-01..06 (8 assertions
  au total avec sous-cas) :
  - F02-01 : aucune provenance → fail-closed.
  - F02-02 : discipline attestée incohérente (builder + mission-gate) ;
    `plannerRuns[].missionId` tamperé → rejeté par le contrat gelé
    MONO-01 lui-même (`assertSearchProtocolFrozenAndValid`), preuve que
    MONO-08 construit toujours cette cohérence par construction.
  - F02-03 : `plannerOutputHash` incohérent (tamperé post-construction)
    → détecté mécaniquement (`protocolHash` recalculé diverge).
  - F02-04 : discipline attestée absente du RunContract → fail-closed
    (builder et mission-gate).
  - F02-05 : `humanValidation.commentaire` blanc/vide → fail-closed
    (jamais une auto-génération de remplacement).
  - F02-06 : template `SYNTHETIC_EXAMPLE` utilisé tel quel en mode REAL
    → échec réel (pas seulement documenté).
- **Commande exécutée** : identique à R4-F01.
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (25)`.
- **Limitation restante** : la cohérence `discipline` reste optionnelle
  en entrée (jamais requise) — un opérateur qui omet ce champ reste
  protégé par le SEUL alignement positionnel existant depuis r1 (non
  renforcé par ce round au-delà de la détection d'incohérence quand le
  champ est fourni). Documenté honnêtement, pas présenté comme une
  garantie plus forte qu'elle ne l'est.

## R4-F03 — lineage EF-01C2 → EF-01D

- **Défaut relevé** : `ScreeningArtifact` était construit AVANT toute
  récupération EF-01C2 réelle, avec un placeholder documentaire
  (`"Source " + id`, champs vides) — jamais un résultat réellement
  retrouvé, bien que le contrat gelé EF-01D ne le vérifie jamais
  (donc jamais détecté structurellement).
- **Fichiers modifiés** : `lib/eforch-artifacts.js` (nouvelles
  fonctions `executeActiveConnectorsRetrieval`,
  `buildScreeningArtifactForMission` réécrite pour consommer les
  enregistrements réels, `buildOpenAlexConnectorRunner` mémoïsé + ids
  uniques), `lib/real-e2e-driver.js` (`buildEForchArtifacts` exécute
  désormais réellement la récupération avant de construire
  `ScreeningArtifact`, réutilise la même instance mémoïsée pour le
  nœud EF-01C2 du graphe).
- **Test** : `test/test_t08_r4_closure.js`, R4-F03-01..10 (10
  assertions) — voir `21-SCREENING-LINEAGE.md` pour le détail complet.
- **Commande exécutée** : identique à R4-F01.
- **Résultat réel** : inclus dans `TOUS LES TESTS PASSENT (25)`.
- **Limitation restante** : voir `21-SCREENING-LINEAGE.md` (titre
  `"(sans titre)"` hérité d'un fallback MONO-01 gelé ;
  `auditDecisions` structurellement impossible à préparer avant une
  récupération réelle — documenté dans `20-REAL-SMOKE-OPERATOR-
  CHECKLIST.md`, jamais silencieusement contourné).

## Non-régression (R1→R3 → R4)

| Suite | Résultat |
|---|---|
| `test_t08_cross_process.js` | PASS (CROSS_PROCESS, 2 PID distincts) |
| `test_t08_eforch.js` | 26/26 PASS (T08-EFORCH-04 confirme : le nœud EF-01C2 du graphe appelle bien le connecteur mémoïsé, sans échec) |
| `test_t08_epistemic_integrity.js` | 11/11 PASS |
| `test_t08_observability.js` | 10/10 PASS |
| `test_t08_preflight.js` | 10/10 PASS |
| `test_t08_release_governance.js` | 4/4 PASS |
| `test_t08_runner_orchestration.js` | 10/10 PASS |
| `test_t08_v06_delegated_auth.js` | 24/24 PASS |
| `test_t08_v06_real_adapter_model.js` | 9/9 PASS |
| `test_t08_r2_closure.js` | 62/62 PASS (un faux-positif de sa propre suite, causé par un commentaire R4 contenant accidentellement la sous-chaîne interdite `"buildResolverTraceForMission("`, corrigé — jamais un vrai défaut fonctionnel) |
| `test_t08_r3_closure.js` | 16/16 PASS |
| `test_t08_r4_closure.js` | 25/25 PASS (nouvelle suite) |
| `worker/evidenceforge-llm-proxy/test/worker.test.js` | 38/38 PASS (non affecté) |

**Aucune régression fonctionnelle introduite par R4.** Le seul incident
rencontré pendant ce round (le faux-positif de `test_t08_r2_closure.js`
ci-dessus) était un défaut de la SUITE DE TEST elle-même (une regex
statique trop large sur un commentaire de code), jamais du comportement
runtime — corrigé en modifiant uniquement le libellé du commentaire.

## Vérification finale (packaging)

Après reconstruction complète du paquet `EvidenceForge-MONO-01-08-
REMEDIATED-r4.zip`, celui-ci a été extrait dans un répertoire NEUF
(jamais réutilisé du répertoire de travail de cette mission), un
`KIT_ROOT` temporaire reconstruit depuis SON PROPRE contenu extrait
(`lib/kit-root-adapter.js`), puis quatre suites rejouées depuis cette
extraction fraîche, contre ce `KIT_ROOT` temporaire :

- `test/test_t08_eforch.js` → **26/26 PASS**.
- `test/test_t08_r4_closure.js` → **25/25 PASS**.
- `test/test_t08_r2_closure.js` (suite complète,
  `EVIDENCEFORGE_CLEAN_BUNDLE_ROOT` pointant vers l'extraction) →
  **64/64 PASS**.
- `test/test_t08_r3_closure.js` (idem) → **18/18 PASS**.

**Total : 133/133 PASS**, zéro référence à un ancien artefact
EvidenceForge externe au ZIP.

## Non-modification de MONO-01→07

Confirmée : `git diff` sur le dépôt de développement montre
exclusivement des fichiers sous `EvidenceForge/MONO-08/v0.6/` (commit
`f13f9fd`, 5 fichiers). Aucun fichier sous `MONO-01/`→`MONO-07/` n'a été
touché.
