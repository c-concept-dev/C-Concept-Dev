# MONO-10 v0.8 — matrice de remédiation

## 1. Reproduction avant correction (§2)

Chaque constat de l'audit A clean-room de v0.7 a été **reproduit sur le lot
historique v0.7, chargé en lecture seule**, dans un run légitime et sans
modifier un seul fichier de l'exploitant.

| Constat | Reproduction sur v0.7 | Fermeture v0.8 |
|---|---|---|
| **B01** autorité de provenance depuis un chemin d'appelant | REPRODUIT — `isProvisioned = true`, `resolveRoots(MA-RACINE-1) = AUTHENTICATED` | export supprimé ; `createFromBoundary` exige la poignée |
| **B02** autorité d'entrée historique depuis un chemin d'appelant | REPRODUIT — 1 autorisation, `isProvisioned = true` | idem + contrôle d'origine dans `resolveLineage` |
| **B03** mécanisme d'acte humain depuis un chemin d'appelant | REPRODUIT — `isProvisionedHumanAuth = true`, namespace PRODUCTION | idem |
| **B04** frontière LLM depuis un chemin d'appelant | REPRODUIT — `isProvisionedLlmBoundary = true`, namespace PRODUCTION | idem |
| **B05** `provisionedFrom = "ENVIRONMENT"` déduit d'un chemin | REPRODUIT | dérivé du contexte de provisionnement |
| **effet** capacité, indépendance, présentation au panel | REPRODUIT — `["RUN_BOUND","AUTHENTICATED_PROVENANCE"]`, `STRONG`, `PRESENT_FOR_HUMAN_REVIEW`, alors que l'autorité **officielle** répondait `UNRESOLVED` | chaîne rompue : `CAPABILITY_ISSUER_INVALID` |
| **M-04** préparation fabriquée acceptée par l'API publique | REPRODUIT | registre + liaisons obligatoires ; statut plafonné |
| **M-05** `ANTI_REPLAY_SHARED_AT_AUTHORITY_KEY_SCOPE` surévalué | REPRODUIT — deux `replayRoot` acceptaient le même nonce | réserve ancrée au fichier de configuration ; `replayRoot` refusé |

**5 constats sur 5 reproduits, 5 fermés, plus les deux majeurs M-04 et M-05.**

## 2. Une faille supplémentaire trouvée pendant la construction

`T21` a échoué au premier passage : `resolveLineage` acceptait **n'importe
quelle** autorité historique marquée, y compris une fabrique de TEST construite
par l'appelant. Le correctif de B02 portait sur le constructeur, pas sur le
consommateur. `resolveLineage` exige désormais que l'autorité ait été émise par
la frontière qui a ouvert le run de destination, et refuse s'il n'y a aucune
identité de frontière à comparer.

C'est le test qui l'a trouvée, avant l'audit.

## 3. Erreurs de test diagnostiquées comme telles

| Symptôme | Diagnostic |
|---|---|
| `T21`/`M21` opposaient une autorité d'un exploitant à un run d'un autre | le scénario a été refait sous une **seule** frontière, source et destination comprises |
| `CAPABILITY_BOUNDARY_UNNAMED` dans l'intégration | le pont amont n'avait pas encore été adapté pour nommer la frontière |

## 4. Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 120 PASS / 0 FAIL |
| Mutations | 50 / 50 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 31 PASS / 0 FAIL |
| Émetteurs de sécurité de production accessibles à l'appelant | 0 |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Lots historiques modifiés | 0 |
