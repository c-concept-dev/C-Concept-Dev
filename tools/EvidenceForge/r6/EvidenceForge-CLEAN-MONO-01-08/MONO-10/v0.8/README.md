# MONO-10 v0.8 — BIND CAPABILITY ISSUERS TO THE OPERATOR BOUNDARY

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **Une capacité de sécurité n'est fiable que si son émetteur descend de
> l'`OperatorTrustBoundary` déjà provisionnée.**
>
> Un constructeur public n'est pas une frontière opérateur.
> Un chemin de fichier fourni par l'appelant n'est pas une preuve d'origine.

v0.7 avait supprimé les drapeaux, les booléens d'authentification, les hashes de
justification et les échelles décoratives. L'audit A clean-room a montré que la
décision critique n'avait pas quitté la main de l'appelant : elle était passée
du **champ** à l'**objet**, et l'objet avait un constructeur exporté.

## Ce que v0.8 ferme

| Constat de l'audit v0.7 | Fermeture |
|---|---|
| **B01** constructeur de provenance public ⇒ `AUTHENTICATED_PROVENANCE`, identité `STRONG` depuis des racines inventées, candidat présentable | l'export n'existe plus ; `createFromBoundary` exige la poignée d'émission |
| **B02** constructeur d'entrée historique public ⇒ franchissement de run | idem, et `resolveLineage` exige la frontière du run de destination |
| **B03** constructeur d'acte humain public ⇒ `HUMAN_AUTHENTICATED` | idem |
| **B04** constructeur LLM public ⇒ `PRODUCTION_LLM_CAPABILITY` | idem |
| **B05** `provisionedFrom: "ENVIRONMENT"` déduit de la présence d'un chemin | dérivé du contexte réel de provisionnement |
| **M-04** préparation fabriquée acceptée par l'API de validation | registre et liaisons obligatoires ; statut plafonné par la preuve |
| **M-05** `ANTI_REPLAY_SHARED_AT_AUTHORITY_KEY_SCOPE` surévalué | la réserve est ancrée au fichier de configuration : une seule par autorité/clé et par racine de confiance |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 120 PASS / 0 FAIL |
| Mutations | 50 attrapées / 50 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 31 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Émetteurs de sécurité de production accessibles à l'appelant | **0** |
| Lots historiques inchangés | 20 / 20 |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Hypothèses déclarées, non masquées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7). v0.8 ne
   résout pas cette hypothèse : il supprime la possibilité de **contourner**
   l'exploitant sans toucher à ses fichiers.
2. Deux fichiers de configuration de confiance sont **deux racines de
   confiance**, pas deux réserves d'une même racine (`REPLAY-PROTECTION.md` §8).
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
`LLM-CAPABILITY-BOUNDARY.md` → `MIGRATION-v0.7-v0.8.md` →
`AUDIT-REMEDIATION-MATRIX.md` → `NON-REGRESSION.md` → `CONTRACT-MAPPING.md`.
