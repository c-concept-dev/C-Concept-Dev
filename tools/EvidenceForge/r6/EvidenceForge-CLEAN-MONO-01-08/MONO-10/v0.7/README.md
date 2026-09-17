# MONO-10 v0.7 — CLOSE REMAINING CALLER-DRIVEN SINKS

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **CALLER DECLARATION ≠ AUTHORITY**
>
> Une décision critique doit être **dérivée de preuves vérifiées**, jamais
> d'assertions fournies par l'appelant.

v0.6 avait fermé la substitution d'objets. L'audit A indépendant a montré que le
défaut avait changé de forme : il ne s'agissait plus de *remplacer l'objet
vérifié*, mais de *fournir une valeur qui dit qu'une condition est vraie*. Un
drapeau de politique, un booléen d'authentification, une racine en chaîne de
caractères, un hash de justification.

## Ce que v0.7 ferme

| Constat de l'audit v0.6 | Fermeture |
|---|---|
| **B1** un drapeau d'appelant admettait au corpus un candidat jamais vu par le panel | option supprimée, état supprimé, politique **liste blanche** restrictive uniquement |
| **B2** `operatorAuthenticated: true` écrit par l'appelant ouvrait le franchissement de run | `OperatorHistoricalInputAuthority` provisionnée, neuf champs engagés |
| **B3** une seconde frontière à réserve distincte rejouait l'attestation | `replayNamespaceId` **dérivé**, répertoire refusé, marqueur, registre de processus |
| **B4** un FULL synthétique était accepté avec des références empruntées | liaison **sémantique** dimension/preuve, phase **dérivée** |
| **B5** le pont amont affirmait `CONFIRMED`/`VERIFIED` de sa propre autorité | traducteur : `UNKNOWN`, contribution `0`, `OUTPUT <= INPUT` |
| **B6** une ambiguïté d'identifiant était résolue en silence | multimap, `ambiguous[]`, aucune référence produite |
| **M7** un hash arbitraire élevait un artefact au niveau le plus haut | échelle ordinale **supprimée**, capacités **typées** exigées par trois sinks |
| **M8** aucun test ne liait la documentation au code | source canonique machine-lisible, documents validés, mutation testée |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 126 PASS / 0 FAIL |
| Mutations | 54 attrapées / 54 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 28 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Clés d'affaiblissement refusées | 31 / 31 |
| Lots historiques inchangés | 19 / 19 |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Hypothèses déclarées, non masquées

1. Tout processus capable d'écrire les fichiers provisionnés par l'exploitant —
   configuration, registre d'acteurs, registre de racines, registre d'entrées
   historiques, racine de réserve — obtient une frontière de PRODUCTION
   (`TRUST-MODEL.md` §7).
2. Un exploitant qui déclare deux `replayRoot` crée deux réserves physiques
   (`REPLAY-PROTECTION.md` §7).
3. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6).

## Effet voulu, à connaître avant lecture des tests

Une preuve dont les racines ne sont pas enregistrées par l'exploitant n'atteint
plus `PRESENT_FOR_HUMAN_REVIEW`. Dans l'intégration livrée, **2 candidats sur 3**
sont présentés au panel. Ce n'est pas une régression : on ne demande pas à un
humain de statuer sur une provenance que personne n'a authentifiée.

## Lecture

`ARCHITECTURE.md` → `TRUST-MODEL.md` → `ARTIFACT-REGISTRY-TRUST.md` →
`UPSTREAM-EVIDENCE-BINDING.md` → `HISTORICAL-INPUT-AUTHORITY.md` →
`REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` → `LINEAGE.md` → `RUN-ORDER.md` →
`THREAT-MODEL.md` → `KEY-MANAGEMENT.md` → `HUMAN-ACT-AUTHENTICATION.md` →
`LLM-CAPABILITY-BOUNDARY.md` → `MIGRATION-v0.6-v0.7.md` →
`AUDIT-REMEDIATION-MATRIX.md` → `NON-REGRESSION.md` → `CONTRACT-MAPPING.md`.
