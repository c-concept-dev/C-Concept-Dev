# MONO-10 v0.6 — TRUSTED EVIDENCE & AUTHORIZATION SINKS

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **NE JAMAIS CROIRE UNE AFFIRMATION AU POINT D'EFFET.**
> Toute donnée qui produit un effet critique est soit **recalculée** depuis des
> preuves authentifiées, soit **validée par une capacité provisionnée** par
> `OperatorTrustBoundary`.

Le principe de v0.5 reste entier :

> EvidenceForge peut choisir **ce qu'il vérifie**.
> EvidenceForge ne peut pas choisir **qui il croit**.

## Ce que v0.6 change

v0.5 avait déplacé la racine de confiance hors du processus appelant. L'audit A
de v0.5 a montré que la racine était bien externe **à l'ouverture du run**, mais
que les **consommateurs** lisaient encore des champs portés par l'objet reçu :
`acceptanceValidator` fourni par l'appelant, `effectiveCorpusEligibility` déjà
calculé, `actorIdentity` seul comme preuve d'acte, `humanAcceptanceRequired`
dans la politique. v0.6 ferme les **points d'effet**.

| Fermeture | Point d'effet | Mécanisme v0.6 |
|---|---|---|
| B01, B14 | autorisation aval | validation d'acceptation = capacité de `OperatorTrustBoundary` ; `REJECT` bloquant en dur |
| B02, B03 | entrée au corpus | éligibilité **recalculée au sink** ; décision marquée par `WeakSet` module-privé |
| B04 | registre d'artefacts | registre append-only authentifié, contenu gelé et réempreinté à la lecture |
| B05 | acte humain | `HumanActProof` (HMAC sur l'acte précis) ; un nom d'acteur ne prouve rien |
| B06, B07 | anti-rejeu | `consumeNonce=false` ignoré en production ; périmètre d'autorité obligatoire |
| B08 | cycle de vie des clés | une clé physique ne peut pas occuper TEST et PRODUCTION |
| B09, B10 | provenance, préparation | même contenu ⇒ jamais indépendant ; `NOT_ASSESSED` exige une provenance |
| B11, B12 | lignée, inconnus | table d'arêtes typées autoritaire ; `crossRunAllowedRelations` de l'appelant ignoré |
| B13 | capacité LLM | frontière de capacité qui **charge elle-même** son transport |
| §72 | politique d'appelant | toute clé appartenant à la frontière ou de forme de contournement est retirée **et consignée** |
| C01 | raccord amont | pont de liaison de preuve amont **livré** (`adapters/upstream-evidence-binder.js`) |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 170 PASS / 0 FAIL |
| Mutations | 72 attrapées / 72 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 39 PASS / 0 FAIL |
| Lots historiques inchangés | 18 / 18 |
| `NETWORK_CALLS` | 0 |
| `REAL_LLM_CALLS` | 0 |
| `REAL_EF02_RUNS` | 0 |
| `REAL_PROFESSIONAL_RUNS` | 0 |
| `REAL_HUMAN_ACTS` | 0 |

## Hypothèse déclarée, non masquée

Un processus capable d'écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` **obtient**
une frontière de PRODUCTION. C'est la limite de ce modèle ; elle est énoncée en
`TRUST-MODEL.md` §7 et `THREAT-MODEL.md` §2, et n'est pas présentée comme
résolue.

## Lecture

`ARCHITECTURE.md` → `TRUST-MODEL.md` → `ARTIFACT-REGISTRY-TRUST.md` →
`HUMAN-ACT-AUTHENTICATION.md` → `LLM-CAPABILITY-BOUNDARY.md` →
`LINEAGE.md` → `RUN-ORDER.md` → `THREAT-MODEL.md` →
`KEY-MANAGEMENT.md` → `REPLAY-PROTECTION.md` →
`MIGRATION-v0.5-v0.6.md` → `AUDIT-REMEDIATION-MATRIX.md` → `NON-REGRESSION.md`.
