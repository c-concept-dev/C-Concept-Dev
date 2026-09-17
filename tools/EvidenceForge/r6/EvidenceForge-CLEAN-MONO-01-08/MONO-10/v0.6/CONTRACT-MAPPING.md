# MONO-10 v0.6 — correspondance contrats ↔ modules

## Noyau générique (`core/`) — 29 modules

| Module | Contrat |
|---|---|
| `canonical.js` | empreinte canonique, `fail()`, `artifactHash` |
| `operator-trust-boundary.js` | provisionnement des frontières (`EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`) |
| `operator-trust-verifier.js` | vérification d'attestation, exposition des capacités |
| `operator-acceptance-boundary.js` | **v0.6** — validation d'acceptation comme capacité |
| `operator-human-auth-boundary.js` | mécanismes d'acte humain (`OPERATOR_ACT_PROOF`, `TEST_FIXTURE`) |
| `operator-llm-capability-boundary.js` | **v0.6** — charge son propre transport, liste blanche |
| `runtime-attestation.js` | attestation Ed25519 signée du run |
| `run-evidence-manifest.js` | manifeste, liaison d'artefacts, `assertManifestAuthentic` |
| `authenticated-artifact-registry.js` | **v0.6** — registre append-only authentifié |
| `artifact-trust-levels.js` | **v0.6** — niveaux ordonnés, `assertAtLeast` |
| `replay-protection.js` | **v0.6** — nonces avec périmètre d'autorité obligatoire |
| `key-lifecycle.js` | statuts de clé, séparation TEST/PRODUCTION |
| `lineage.js` | **v0.6** — table d'arêtes typées autoritaire |
| `evidence-source-provenance.js` | provenance résolue contre le registre authentifié |
| `identity-evidence.js` | confiance d'identité, indépendance démontrée |
| `relevance.js` | pertinence, `UNKNOWN` conservé |
| `candidate-assessment.js` | évaluation ; aucun statut n'évoque une admission |
| `panel-gate.js` | validation de décision humaine, `panelDecisionHash` |
| `human-act.js` | déclaration d'acte |
| `human-act-proof.js` | **v0.6** — `HumanActProof`, `computeDecisionHash` |
| `effective-eligibility.js` | **v0.6** — décision marquée par `WeakSet` module-privé |
| `panel-gated-adapter.js` | **v0.6** — recalcul de l'éligibilité au sink |
| `unknowns.js` | chaîne d'événements, rejeu sémantique refusé |
| `scientific-readiness.js` | phases PRE/FULL, dimensions sourcées |
| `llm-capability.js` | sonde active, transport d'appelant ignoré |
| `scientific-qualification.js` | qualification, classe de preuve |
| `scientific-unified-report.js` | rapport, liaison mission/qualification/racine de registre |
| `final-report-acceptance.js` | gabarit d'acceptation, `acceptanceDecisionHash` |
| `downstream-authorization.js` | autorisation aval, `sanitizePolicy` (**§72 durci en v0.6**) |

## Adaptateurs (`adapters/`)

| Module | Contrat |
|---|---|
| `case-phase-adapter.js` | nommage des phases par un cas d'application |
| `upstream-evidence-binder.js` | **v0.6** — pont entre identifiants amont et preuves authentifiées |

## Outils d'exploitation (`tools/`)

| Module | Contrat |
|---|---|
| `operator-provisioning.js` | frappe d'autorité, écriture de configuration, émission de `HumanActProof` |
| `reference-llm-transport.js` | transport de référence **hors ligne** |
| `aggregate-hash.js` | empreinte agrégée indépendante du chemin d'extraction |

## Surface de validation (`validators/index.js`)

Réexporte les contrats consommables : frontières, registre, niveaux de
confiance, preuve d'acte, lignée, éligibilité, qualification, acceptation,
autorisation.

## Ce qui n'est PAS dans le noyau

Aucun métier, aucune discipline, aucun expert, aucun panel, aucun cas d'usage,
aucune taxonomie, aucun nom de fournisseur. Vérifié par scan sur `core/`,
`adapters/` et `validators/`, avec témoin positif.
