# EvidenceForge MONOLITH v1.0.16 — Activation record

> `OWNER ACTIVATION GATE — MONOLITH v1.0.16`, validatedBy = Christophe Bonnet, **decision = `ACTIVATE_WITH_RESERVATIONS`**. Date : 2026-09-24.

| | |
|---|---|
| **`ACTIVE_VERSION` avant** | `MONOLITH-v1.0.10` |
| **`ACTIVE_VERSION` après** | **`MONOLITH-v1.0.16`** |
| Mécanisme | `tools/EvidenceForge/ACTIVE_VERSION`, le pointeur unique lu par `bin/launcher.js` |
| Seul changement du dépôt | ce pointeur (1 ligne) ; aucun fichier runtime gelé modifié |
| Statut | **ACTIVE**, `FROZEN_WITH_RESERVATIONS` |
| **Rollback** | **`MONOLITH-v1.0.10`**, présente et intacte |

## Chaîne de gouvernance

| Étape | Référence |
|---|---|
| Code v1.0.16 | commit `766db22a` (« studio »), sur `origin/main` |
| Audit d'implémentation | `…PB-B7-SECONDARY-REUSE-FIX-AUDIT.md/.json` (`6b86a662…` / `7e692e81…`) |
| Audit indépendant | **`V1_0_16_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`**, 0 blocker (`92a8667a…` / `93f52c42…`) |
| Gel | **commit `e4050d4f`** — freeze record, puis gouvernance 8/8 |
| Micro-smoke réel | **`PB_B7_MICRO_SMOKE_PASS`** — run `pbb7ms-202609232121-a44872`, 3 appels, 0,559 USD (rapport hors dépôt, empreintes dans le JSON) |

## Statuts

**`PB_B7` = CLOSED.** Les preuves se cumulent :

1. défaut reproduit sur v1.0.15 ;
2. correctif audité indépendamment ;
3. T3b fermé hors ligne ;
4. S3 confirmé en réel ;
5. aucune réponse de A sous B ;
6. réutilisation nominale fonctionnelle.

Ne pas rouvrir PB-B7 sans nouvelle preuve factuelle.

**`R3` = CLOSED.** Motif : micro-smoke réel sur les modules gelés de production.
- S1 : revue réelle créée sous (target-01, A).
- S2 : réutilisation nominale, 0 appel.
- S3 : A refusée par le registre **et** par le magasin (`EF03B_REUSE_AUTHORITY_MISMATCH`), revue recalculée, seule la réponse recalculée inscrite sous B.
- S4 : chemin naturel B validé.

## Réserves restantes

| Id | Gravité | Disposition à l'activation |
|---|---|---|
| **R1** | MEDIUM | `ACCEPTED_RESERVATION` : passes non-base (informed-retry, completion, literalization) sans couverture réelle ; code vérifié hors ligne ; ne bloque pas. |
| R2 | MEDIUM | `DOCUMENTED` : code publié par `766db22a` ; historique non réécrit. |
| R4 | LOW | `ACCEPT_RESERVATION` : RUN-SAFETY-12 `TEST_WEAKENED` (19 autres tests tuent la régression). |
| **R5** | LOW | `ACCEPTED_RESERVATION` — **`IF_NEW_RUNTIME_CALLER_CAN_SUPPLY_EF03B_IDENTITY → R5 MUST BE REOPENED BEFORE THAT CALLER IS AUTHORIZED`**. |
| R6 | LOW | `ACCEPT_RESERVATION` : défense en profondeur contrat / sceau. |
| **R7** | LOW | **`ACCEPTED_OPERATIONAL_RESERVATION`** : constatée au micro-smoke (seule l'entrée la plus récente est proposée) ; surcoût possible uniquement. |
| R8 | INFO | `ACCEPT_RESERVATION` : préexistant, théorique. |
| R9 | INFO | `ACCEPT_RESERVATION` : couvert par V12-12 et PB7-05. |
| R10 | INFO | `ACCEPT_RESERVATION` : `EXPECTED_FAIL_CLOSED_RECOMPUTATION`. |

## Contrôles post-activation

| Contrôle | Résultat |
|---|---|
| `ACTIVE_VERSION` | `MONOLITH-v1.0.16` ; le launcher résout `r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.16` |
| Manifeste v1.0.16 | **180/180 OK** |
| `contentHash` | **`54266d0d…` inchangé** |
| Gouvernance | 8/8 OK |
| MONO-11 v0.4 | 55/55 OK ; doctor : MONO-10 (79), MONO-11 (55), MONO-09 (9), MONO-01 (106) vérifiés |
| Runtime v1.0.16 | aucun fichier modifié (401 fichiers de v1.0.10, v1.0.16 et MONO-11 byte-identiques avant et après) |
| Rapports historiques | 106 fichiers de gouvernance, audit et gel du bundle byte-identiques avant et après |
| v1.0.10 | présente et intacte : **149/149**, `contentHash` `9b129453…` |
| `doctor.sh` | tout en ordre : worker joignable (sonde gratuite), `claude-sonnet-4-6` tarifé, port 8768 libre |

## Rollback

**Déclencheurs.** STOP et **retour à `MONOLITH-v1.0.10` avant toute analyse** si le premier run humain révèle :
- corruption de lignée ;
- réutilisation croisée entre cibles ;
- autorité divergente acceptée ;
- comportement scientifique divergent ;
- nouvelle erreur de contrat.

**Procédure.** Écrire `MONOLITH-v1.0.10` (une seule ligne) dans `tools/EvidenceForge/ACTIVE_VERSION`, puis relancer `./tools/EvidenceForge/doctor.sh`. Aucune ancienne version n'est supprimée.

## Premier usage humain

**Autorisé, non lancé.** Il s'agit d'une mission réelle non critique, sans Phase A ni B. Surveiller : coût, lignée, identité d'autorité, réutilisation, erreurs runtime.

**Avant ce premier run :**

- **ACT-N1 (MEDIUM).** `EVIDENCEFORGE_RUNS_ROOT` (`.env.local`) pointe vers `~/evidenceforge-work/reports/h1-v105-runs`. C'est un dossier d'**artefacts historiques**, lu en lecture seule par RUN-SAFETY-21, qui a son propre magasin partagé. Un premier run y écrirait. **Recommandé : une racine neuve et dédiée** (décision propriétaire ; `.env.local` non modifié).
- **ACT-N2 (INFO).** Une autre instance tourne sur le port 8767 (MONOLITH-v1.0.4). Arrêt possible : `./tools/EvidenceForge/stop.sh 8767`.
- **ACT-N3 (INFO).** Les entrées EF-03B déjà présentes dans le magasin partagé ne sont pas réutilisables sous v1.0.16 : elles seront recalculées si leur contexte revient.
