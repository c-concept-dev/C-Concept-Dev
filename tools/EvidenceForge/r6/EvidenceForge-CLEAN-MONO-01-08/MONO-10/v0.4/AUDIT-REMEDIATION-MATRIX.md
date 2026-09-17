# MONO-10 v0.4 — Matrice de remédiation

Les lots v0.1, v0.2 et v0.3 sont **HISTORIQUES et immuables**. v0.3 reste
`NON_GELABLE` : ce statut n'est ni réhabilité ni réinterprété. v0.3 sert ici de
variante « défense désactivée » pour les mutations différentielles, en lecture
seule.

## Bloqueurs de l'audit A sur v0.3

| # | Constat v0.3 | Fermeture v0.4 | Preuve |
|---|---|---|---|
| **B-1** | **critique** — la racine de confiance avait été déplacée, pas établie : chaîne 100 % synthétique → `AUTHORIZED` | autorité runtime **externe**, attestation signée Ed25519, ancrages configurés par l'exploitant et indexés par mode ; le manifeste **reprend** son mode au lieu de le déclarer | T01–T07, M01–M07, I-02 |
| **B-2** | **critique** — `revalidationRequired: false` autorisait une qualification fabriquée, et l'artefact affirmait un recalcul non effectué | revalidation **non négociable** ; 5 contrôles inaltérables ; motifs **dérivés** de l'exécution ; garde-fou `FALSE_REVALIDATION_CLAIM` | T08, T09, M08, M09 |
| **B-3** | **majeur** — `sourceAuthorityId` était une nouvelle vérité auto-déclarée ; le **même identifiant** comptait deux fois | registre d'autorités **extérieur** ; identifiant, autorité canonique, famille et enregistrement source comparés | T11, T12, M11, M12 |
| **B-4** | **majeur** — muter `decision.evidenceRefs` n'invalidait pas l'approbation humaine | `evidenceRefsHash` recalculé **des deux côtés** ; run et attestation dans la liaison | T13, T13b, M13 |
| **B-5** | **majeur** — un inconnu bloquant se fermait avec `["preuve-qui-n-existe-pas"]` | les `evidenceRefs` doivent **résoudre** contre le registre (7 contrôles) | T16, M16 |
| **B-6** | **modéré** — injecter des objets `dimensions` fabriqués faisait passer une PRE pour une FULL | chaque dimension porte `derivedFromRefs` ; une dimension sans source résolvable ne promeut rien | T19, M19 |
| **B-7** | **modéré** — lignée inter-run acceptée, aucune arête typée, contrôle de run sauté si un `runId` manquait | 7 contrôles par référence + graphe `EXPECTED_PARENTS` ; l'absence de `runId` n'exonère plus | T14, T15, T21b, M14, M15 |
| **B-8** | dettes — docs surdéclarant §17, CHARTE absente du ZIP | docs alignées sur l'exécutable (`CONTRACT-MAPPING.md` §2) ; CHARTE incluse dans `governance/` | T09, §29 |

## Sections §1–§26 du mandat v0.4

| § | Exigence | Livré dans | Preuve |
|---|---|---|---|
| §0 | distinguer cohérence interne et exécution authentifiée | `scientific-qualification.js` | I-07, T06 |
| §1 | autorité runtime de confiance, signature, aucun secret livré | `trusted-runtime-authority.js` | T01–T05, HYG-03 |
| §2 | TEST et PRODUCTION distincts | idem | T02, M02 |
| §3 | manifeste non auto-certifiant | `run-evidence-manifest.js` | T01, I-02 |
| §4 | chaîne synthétique | — | T06, T07 |
| §5 | revalidation non désactivable | `downstream-authorization.js` | T08, M08 |
| §6 | aucune fausse affirmation de revalidation | idem | T09, M09 |
| §7 | trois notions d'éligibilité ; `DEFER` hors corpus | `effective-eligibility.js` | T10, T10b, T10c |
| §8 | authenticité des sources d'identité | `identity-evidence.js` | T11, T12 |
| §9 | indépendance d'identité | idem | T11, T12, T12b, T12c |
| §10 | liaison complète de la décision humaine | `panel-gate.js` | T13, T13b |
| §11 | authenticité de l'acte humain / fail-closed | `human-act.js` | HA-01, HA-02, HA-03 |
| §12 | lignée liée au run | `lineage.js` | T14, T14b |
| §13 | arêtes de lignée typées | idem | T15, T15b, I-13 |
| §14 | preuves d'inconnu résolues | `unknowns.js` | T16, T16b |
| §15 | fraîcheur des événements | idem | T17, T17b, T18b |
| §16 | fusion par historique validé | idem | T18 |
| §17 | dimensions authentifiées | `scientific-readiness.js` | T19, T19b |
| §18 | préparation recalculée | idem + `scientific-qualification.js` | I-06 |
| §19 | capacité LLM liée au run | `llm-capability.js` | T20, T20b, T20c |
| §20 | qualification | `scientific-qualification.js` | T06, I-07 |
| §21 | liaison du rapport | `scientific-unified-report.js` | T21, T21b |
| §22 | acceptation finale | `final-report-acceptance.js` | T22 |
| §23 | autorisation aval | `downstream-authorization.js` | T23 |
| §24 | limites de la politique | idem | T24, M24 |
| §25 | docs = exécutable | `CONTRACT-MAPPING.md` | — |
| §26 | modèle de menace sans surdéclaration | `THREAT-MODEL.md` | — |

## Ce que v0.4 ne prétend pas

- **Aucun run réel** : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`.
- v0.4 ne protège **pas** contre la compromission de la clé privée de
  production, d'un hôte entièrement corrompu, ou d'un jeu d'ancrages falsifié.
  Voir `THREAT-MODEL.md` §2 — ces limites sont nommées, pas contournées.
- La racine de confiance est **déplacée**, d'un artefact que n'importe qui peut
  écrire vers une clé que seul l'exploitant détient. C'est vérifiable, ce n'est
  pas absolu.
- La qualité du processus n'est pas le contenu du verdict.
