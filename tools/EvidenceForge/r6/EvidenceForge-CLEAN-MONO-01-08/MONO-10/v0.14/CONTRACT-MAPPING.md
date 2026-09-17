# MONO-10 v0.11 — correspondance contrats ↔ modules

## Source canonique

| Fichier | Rôle |
|---|---|
| `contracts/canonical-contracts.json` | **source unique** des énumérations critiques ; le code l'importe, la documentation est validée contre elle |

## Noyau générique (`core/`)

| Module | Contrat | v0.7 |
|---|---|---|
| `canonical.js` | empreinte canonique, `fail()`, `artifactHash` | |
| `canonical-contracts.js` | charge la source canonique, valide les documents | **nouveau** |
| `caller-assertion-guard.js` | liste blanche, refus des assertions d'autorité | **nouveau** |
| `artifact-capabilities.js` | capacités typées, émission, exigences de sink | **nouveau** |
| `operator-provenance-authority.js` | résolution authentifiée des racines | **nouveau** |
| `operator-historical-input-authority.js` | autorisation d'entrée inter-run | **nouveau** |
| `operator-trust-boundary.js` | provisionnement des frontières et autorités | étendu |
| `operator-trust-verifier.js` | vérification d'attestation, exposition des capacités | étendu |
| `operator-acceptance-boundary.js` | validation d'acceptation comme capacité | |
| `operator-human-auth-boundary.js` | mécanismes d'acte humain | |
| `operator-llm-capability-boundary.js` | charge son transport, liste blanche | |
| `runtime-attestation.js` | attestation Ed25519 signée du run | |
| `run-evidence-manifest.js` | manifeste, liaison, `assertManifestAuthentic` | |
| `authenticated-artifact-registry.js` | registre append-only, `grantCapability` | **réécrit** |
| `replay-protection.js` | namespace dérivé, marqueur, registre de processus | **réécrit** |
| `key-lifecycle.js` | statuts importés ; absence = invalide | modifié |
| `lineage.js` | arêtes typées, autorité d'entrée historique | modifié |
| `evidence-source-provenance.js` | racines résolues par l'autorité | **réécrit** |
| `identity-evidence.js` | indépendance depuis racines authentifiées | modifié |
| `relevance.js` | pertinence, `UNKNOWN` conservé | |
| `candidate-assessment.js` | preuve non authentifiée ⇒ non présentable | modifié |
| `panel-gate.js` | exige `AUTHENTICATED_PROVENANCE` sur les preuves | modifié |
| `human-act.js` / `human-act-proof.js` | déclaration et preuve d'acte | |
| `effective-eligibility.js` | politique liste blanche, narrow-only | **réécrit** |
| `panel-gated-adapter.js` | politique assainie, exige `HUMAN_AUTHENTICATED` | modifié |
| `unknowns.js` | chaîne d'événements, rejeu sémantique refusé | |
| `scientific-readiness.js` | liaisons dimension/preuve, phase dérivée | **réécrit** |
| `llm-capability.js` | exige `PRODUCTION_LLM_CAPABILITY` au sink | modifié |
| `scientific-qualification.js` | qualification, classe de preuve | |
| `scientific-unified-report.js` | liaison mission/qualification/racine | |
| `final-report-acceptance.js` | gabarit, `acceptanceDecisionHash` | |
| `downstream-authorization.js` | politique liste blanche, monotonicité | **réécrit** |

Module **supprimé** : `artifact-trust-levels.js` — échelle ordinale décorative,
remplacée par `artifact-capabilities.js` (§26 option B puis §31).

## Adaptateurs (`adapters/`)

| Module | Contrat |
|---|---|
| `case-phase-adapter.js` | nommage des phases par un cas d'application |
| `upstream-evidence-binder.js` | **traducteur** amont : aucune force inventée, ambiguïté explicite |

## Outils d'exploitation (`tools/`)

| Module | Contrat |
|---|---|
| `operator-provisioning.js` | frappe d'autorité, configuration, registres d'acteurs / racines / entrées historiques, émission de `HumanActProof` |
| `reference-llm-transport.js` | transport de référence **hors ligne** |
| `aggregate-hash.js` | empreinte agrégée indépendante du chemin |

## Fermetures v0.10 — quel module porte quoi

| Module | Fermeture v0.10 |
|---|---|
| `operator-trust-boundary.js` | coffre privé `ISSUERS` (WeakMap non exportée) ; `verifierFor(boundary)` ; `issuerInventory` |
| `operator-trust-verifier.js` | opérations à la place des getters ; `assertContextMatches` (B2) ; `__build(boundary, issuers)` — seule remise interne, bornée |
| `operator-provenance-authority.js` | registre de décisions `PROVENANCE_ROOT_RESOLUTION` ; `verifyDecision` |
| `operator-human-auth-boundary.js` | `certifyArtifact` — chaque acte vérifié ; `HUMAN_ACT_CERTIFICATION` |
| `operator-llm-capability-boundary.js` | `recordProbe` (sujet sondé) puis `certifyProbedArtifact` (sujet exact, unicité, liste blanche) ; `verifyProbedSubject` ; `LLM_PROBE_EXECUTION` |
| `operator-historical-input-authority.js` | `HISTORICAL_INPUT_AUTHORIZATION` ; `authorization.derivationRef` |
| `artifact-capabilities.js` | vérification de la dérivation à l'émission ; `capabilityVerifiedBy` |
| `evidence-source-provenance.js` | l'opération est demandée au vérificateur ; contexte attendu = registre authentifié |
| `identity-evidence.js` | planchers de seuils, resserrement seulement |
| `candidate-assessment.js` | `verifier` requis ; dérivation vérifiée avant admission au corpus |
| `llm-capability.js` | frontière injectée par la frontière ; `probeRef` ; contexte authentifié **obligatoire** ; sujet de sonde vérifié dans tous les espaces |
| `scientific-readiness.js` | identité composite ; mode d'exécution authentifié ; registre de TEST refusé en PRODUCTION ; **vérificateur obligatoire** (`READINESS_VERIFIER_REQUIRED`) |
| `lineage.js` | autorité en argument ignorée et signalée |
| `replay-protection.js` | décision §15 documentée : nouvelle génération de confiance |
| `adapters/upstream-evidence-binder.js` | `verifier` à la place de `provenanceAuthority` |

## Ce qui n'est PAS dans le noyau

Aucun métier, aucune discipline, aucun expert, aucun panel, aucun cas d'usage,
aucune taxonomie, aucun fournisseur. Vérifié par scan sur `core/`, `adapters/`
et `validators/` avec témoin positif ; universalité éprouvée sur six domaines.
