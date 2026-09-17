# MONO-10 v0.9 — CLOSE RESIDUAL TRUST VALIDATION GAPS

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **Une preuve portée dans un artefact n'a d'effet que si son consommateur la
> vérifie.**
>
> Et aucune API publique de validation critique ne doit être plus permissive
> que son consumer aval.

v0.8 avait fermé la construction d'autorités parallèles. L'audit A clean-room a
montré que cinq résidus subsistaient, tous de la même famille : une **preuve
portée mais non comparée**, ou une **validation publique plus laxiste que son
consommateur**. v0.9 ne redessine rien — elle ferme ces cinq points.

## Ce que v0.9 ferme

| Résidu | Fermeture |
|---|---|
| **R1** `operatorTrustBoundaryId` seul faisait identité ; `configBindingHash` porté mais jamais comparé | identité **composite** (identifiant + liaison de configuration + espace d'exécution), comparée par chaque consommateur et engagée par le manifeste |
| **R2** ancre anti-rejeu dérivée d'une chaîne de chemin (`path.resolve`) | identité **physique** du fichier (`realpath` + inode), pour l'ancre **et** l'emplacement de la réserve |
| **R3** `opts.verifier` et `policy.identity` acceptés comme autorités | seul un vérificateur marqué désigne l'autorité de provenance ; les seuils d'identité ne peuvent que restreindre |
| **R4** `assertCapabilityUsable` validait hors registre / sur artefact absent | registre authentifié + artefact enregistré + concession tracée + identité composite |
| **R5** `assertReadinessPhase` acceptait un registre de forme compatible | `isAuthenticatedRegistry` + run + mission + frontière |
| **R6/R7** surface publique inutile | `createAcceptanceBoundary` et le helper de réinitialisation retirés ; `opts.envVar` refusé |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 88 PASS / 0 FAIL |
| Mutations | 35 attrapées / 35 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 36 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Émetteurs de sécurité de production accessibles à l'appelant | **0** |
| Helpers internes exposés sur la surface publique | **0** |
| Lots historiques inchangés | 21 / 21 |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Hypothèses déclarées, non masquées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7). v0.8 ne
   résout pas cette hypothèse : il supprime la possibilité de **contourner**
   l'exploitant sans toucher à ses fichiers.
2. Deux fichiers de configuration de confiance **réellement distincts** sont
   deux racines de confiance ; deux **alias du même fichier** sont la même
   racine, parce que l'identité retenue est physique (`REPLAY-PROTECTION.md`).
3. Le plafond de statut de préparation est une **borne supérieure** tirée des
   artefacts enregistrés, pas une réévaluation complète (`READINESS.md` §4).
4. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6).

## Effet voulu, à connaître avant lecture des tests

Une preuve dont les racines ne sont pas enregistrées par l'exploitant n'atteint
plus `PRESENT_FOR_HUMAN_REVIEW`. Dans l'intégration livrée, **2 candidats sur 3**
sont présentés au panel. Ce n'est pas une régression : on ne demande pas à un
humain de statuer sur une provenance que personne n'a authentifiée.

## Lecture

`ARCHITECTURE.md` → `TRUST-MODEL.md` → `CAPABILITY-AUTHORITIES.md` →
`READINESS.md` → `ARTIFACT-REGISTRY-TRUST.md` →
`UPSTREAM-EVIDENCE-BINDING.md` → `HISTORICAL-INPUT-AUTHORITY.md` →
`REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` → `LINEAGE.md` → `RUN-ORDER.md` →
`THREAT-MODEL.md` → `KEY-MANAGEMENT.md` → `HUMAN-ACT-AUTHENTICATION.md` →
`LLM-CAPABILITY-BOUNDARY.md` → `MIGRATION-v0.8-v0.9.md` →
`AUDIT-REMEDIATION-MATRIX.md` → `NON-REGRESSION.md` → `CONTRACT-MAPPING.md`.
