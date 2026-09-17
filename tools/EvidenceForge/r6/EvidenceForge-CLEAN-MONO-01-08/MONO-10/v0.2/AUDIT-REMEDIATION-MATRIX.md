# MONO-10 v0.2 — Matrice de remédiation

Deux audits indépendants (Claude, Codex) ont déclaré v0.1 `NON_GELABLE`.
Chaque finding est reproduit hors ligne **avant** correction, puis fermé et
protégé par des tests discriminants.

| # | Finding | Reproduit | Fermeture | Tests | Mutation |
|---|---|---|---|---|---|
| **F-01** | `p0_2Allowed` / `resolveP0_2Authorization` / `"verdict JMJS"` dans le noyau | oui | `core/downstream-authorization.js` expose `downstreamUseAuthorized` et `resolveDownstreamUseAuthorization`. Le noyau est physiquement séparé (`core/`) des adaptateurs (`adapters/`). L'adaptateur exige que le nom de phase soit **fourni par l'appelant** | F01-01→06 | M01, M02 |
| **F-02a** | identité trop dépendante d'un registre académique ; `STRONG` inatteignable sans lui | oui | `core/identity-evidence.js` — modèle générique `IdentityEvidence`. `STRONG` dérive de l'**indépendance des sources**, jamais d'un type privilégié | F02-01→05 | M03, M04 |
| **F-02b** | égalité littérale de libellés : `"civil engineering"` ≠ `"engineering"` → hors champ | oui | `core/relevance.js` — recouvrement structurel + oracle sémantique **injecté**. Sans oracle : `UNKNOWN`, jamais `OUT_OF_SCOPE` | F02-06→10 | M05 |
| **F-03** | binding de porte validé syntaxiquement, jamais comparé | oui | `assertRefMatches` recalcule et compare ; `missionBindingHash` et `candidateBindingHash` par candidat | P01→P07 | M06, M07 |
| **F-04** | une fixture pouvait contribuer à `QUALIFIED` | oui | `qualifyProcess` **appelle** les validateurs de production (panel, capacité, readiness, lignée). `executionEvidenceClass` obligatoire | F04-01→03 | M08, M09 |
| **F-05** | preuve LLM trop faible | oui | `AVAILABLE` exige provider, modèle, liaison, `requestId`, horodatage, attestation d'identifiants, sonde exécutée, schéma validé, `!credentialProbeSkipped` | L01→L12 | M10 |
| **F-05b** | parseur laxiste (texte autour, champs en trop) | oui | schéma **fermé** : ni texte avant/après, ni champ supplémentaire, ni champ manquant, types exacts | L08, L09, L09b | M11 |
| **F-06** | unknowns perdus, lignée vide acceptée | oui | `core/unknowns.js` lineage-first, `propagate` + `assertNoSilentLoss` ; `assertLineageNonEmpty` ; un unknown `BLOCKING` interdit `QUALIFIED` | U01→U08, LN-01, LN-02 | M12, M13 |
| **F-07** | deux mutations survivantes | oui | 8 tests `U*` dédiés aux unknowns ; 3 tests `VD-*` sur des verdicts **génériques** (`OUTCOME_A`, `OUTCOME_B`) | U01→U08, VD-* | M12, M15 |
| **F-08** | schémas `DRAFT`, `ProfessionalCandidateAssessment` absent, contradiction sur le verdict | oui | `MONO-10-SCHEMAS-v0.2.json` approuvé, `implementationStarted: true`, l'évaluation décrite, contradiction levée | SCHEMA_CODE_DOCS | — |
| **F-09** | non-régression non certifiée | — | table de preuve par lot, distinguant `MONO10_CAUSED_REGRESSION` de `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | NR-01, NR-02 | — |

## Une correction de méthode d'audit

Trois mutations (M07, M08, M11) semblaient non détectées. Vérification faite :
elles étaient **absorbées par une seconde couche indépendante** — `assertRefMatches`
pour M07, le contrôle de classe d'exécution pour M08, `JSON.parse` pour M11.
Les deux couches désactivées ensemble, les tests détectent. C'est de la défense en
profondeur, vérifiée par double mutation plutôt qu'affirmée.
