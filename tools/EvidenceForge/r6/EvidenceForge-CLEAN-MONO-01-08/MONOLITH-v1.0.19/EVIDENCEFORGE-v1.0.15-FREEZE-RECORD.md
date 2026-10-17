# EVIDENCEFORGE MONOLITH v1.0.15 — FREEZE RECORD

> **MONOLITH-v1.0.15 = GELÉ — `status = FROZEN_WITH_RESERVATIONS`.**
> Décision propriétaire **D1 = FREEZE_WITH_RESERVATIONS** (Christophe, 2026-09-22), sur la base de l'audit indépendant
> **`V1_0_15_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`**, **0 blocker**, 11 réserves.
>
> `READY_FOR_ACTIVATION = false` · `SMOKE_AUTHORIZED = true` (avec conditions, D7) · `smokeExecuted = false` · `activeVersionChanged = false`.
> **`ACTIVE_VERSION` reste `MONOLITH-v1.0.10`** (D5 = KEEP_CURRENT). **Le gel n'autorise pas l'activation.**

## Ce que ce gel signifie — et ne signifie pas

- **Signifie** : TARGET_DOCUMENT_AUTHORITY_IDENTITY = AUDITED_AND_ACCEPTED (R1, R2, R4 fermes ; mutants M1..M8 du proprietaire tous tues ; multi-cible reellement exercee ; fallback DOSSIER_TOO_LARGE reellement exerce hors ligne)
- **Ne signifie pas** : PROVEN_IN_PRODUCTION — aucun run reel, aucun smoke, aucun zip canonique ; les garanties sont de CODE et de TEST
- **Ne signifie pas non plus** : PIPELINE_WIRING_BEHAVIOURALLY_COVERED (reserve A1) · IDENTITY_GUARD_ACTIVE_FOR_NON_RUNTIME_CALLERS (reserve A2) · REGISTRY_BACKWARD_COMPATIBLE_WITH_RUNS_<=_v1.0.14 (reserve A4)

## Identité

| | |
|---|---|
| Version | `MONOLITH-v1.0.15` — AUTHORITY IDENTITY HARDENING |
| Parent | `MONOLITH-v1.0.14` (gelée, `FROZEN_WITH_RESERVATIONS`, commit `c12da200`) |
| Frère rejeté | `MONOLITH-v1.0.13` — `REJECTED_CANDIDATE_AFTER_INDEPENDENT_AUDIT`, conservé comme artefact historique |
| Lot gelé | MONO-11 **v0.4**, contrat `MONO-11-v3`, sceau `110db4de…` **inchangé**, 55/55 SHA, 83/83, **non rouvert** |
| Manifeste runtime | **169 fichiers**, `contentHash` `1e2196504aa217fbb5bb654e4e8529bee6f732a74a7b15daec732d509f356ea4`, `--verify` `{"ok":true,"files":169,"bad":[]}` |
| `MANIFEST.json` | `6e0a009a9d8effe6a2acb575f1114789b31497e117e7ce6d781847a9413ca2a1` |
| `SHA256SUMS.txt` | `48c8b1210fe2de1e98af8cf6ec6e986890f9a8725c8e89588caa0bbcf8cf6f1e` |
| Rapport d'auteur | `cfb815408fde36a2c3dc2452ff008e054ef561103a65df403a1095b5d8d27954` / `.json` `6e5097d94cc845ffa4fc1f69d6edb741faa8b390d31e1dabd5d947802e3e88da` (verdict proposé : GELABLE) |
| Audit indépendant | `f533f42fba37e0517f1d5efae3f7d8040168662e3c383d88b49c87a88a0f08ba` / `.json` `38c8a4025b9305e9a973fd4fb64123c907b07a06ed13fd5b588d2d616ff90b05` |
| Commit de contenu | `6bccae02` — 173 fichiers, uniquement `MONOLITH-v1.0.15/`, poussé **pendant** l'audit par le propriétaire ; contenu **byte-identique** au contenu audité |

Les rapports d'audit et le présent FREEZE RECORD sont **hors du manifeste runtime** (D3) et scellés par `EVIDENCEFORGE-v1.0.15-GOVERNANCE.SHA256SUMS.txt`.

## Statuts confirmés par l'audit indépendant

| Point | Statut |
|---|---|
| R1 — identité cible ↔ document | `TARGET_DOCUMENT_IDENTITY_PASS` — **fermé** |
| R2 — gardes d'identité d'autorité | `DOCUMENT_AUTHORITY_IDENTITY_GUARDS_PASS` — **fermé** |
| R4 — couverture comportementale de l'import | `REGISTRY_IMPORT_BEHAVIOURAL_COVERAGE_PASS` — **fermé** |
| R-A1 | `TRACE_PARITY_PASS` |
| R5 | `STILL_CLOSED` |
| R6 | `STILL_CLOSED` (mais réserve héritée R6 de v1.0.14 **vérifiée toujours ouverte**, cf. A8) |
| R1-06 — fallback `DOSSIER_TOO_LARGE` | **`FALLBACK_AUTHORITY_IDENTITY_PASS`** (réellement exercé hors ligne, 3 cibles) |
| GLOBAL_LINEAGE | `GLOBAL_LINEAGE_PRESERVATION_GUARANTEED_FOR_KNOWN_REPAIR_REUSE_AUTHORITY_AND_TARGET_IDENTITY_PATHS` |

**Portée de la garantie de lignée** : limite aux chemins CONNUS et AUDITES (A litteralisation, B reparation ciblee, C import de registre, D reuse de registre, E replay/reuse, F normalisation d'autorite documentaire, G identite cible/document, H mapping multi-cible) — garanties de CODE et de TEST uniquement : aucun run reel, aucun smoke. **R11 informed regeneration reste hors garantie monotone.**

## Mesures au gel

- Harnais : **332/332** · chunking **21/21** · secret scan **0** · anti-hardcoding **0** · manifeste **{"ok": true, "files": 169, "bad": []}** · lots gelés **MONO-10=0 MONO-11=0 MONO-09=0 MONO-01=0, total 0**
- Identifiants de tests : **313 → 332** (+19, 0 supprimé)
- Matrice de mutation du propriétaire (M1..M8), appliquée sur **copie hors dépôt**, ligne de base vérifiée : `M1` tué · `M2` tué · `M3` tué · `M4` tué · `M5` tué · `M6` tué · `M7` tué · `M8` tué · `XPIPE` SURVIVANT
- Mutant **hors matrice** : `XPIPE` **survivant** 332/332 — arrêté *fail closed* au runtime (réserve **A1**)
- Shadow A10 : 18 revues / 7 concernées / 180 constats / 70 vérifiés / **12 citations restaurées (12/12)** / **3 constats vidés restaurés (3/3)**, aucune dérive substantielle
- Agrégation : **13 / 9 / 7 / 0 / 67 / 10** — `QUALIFIED_WITH_RESERVATIONS` — `SCIENTIFICALLY_USABLE = NO`, aucune dérive scientifique

## Les 11 réserves transportées (D2)

| Id | Sévérité | Titre | Disposition propriétaire |
|---|---|---|---|
| `A1` | MEDIUM | Le cablage de production de lib/pipeline.js n'a aucune couverture comportementale | **`ACCEPTED_FOR_FREEZE_AND_SMOKE`** |
| `A2` | MEDIUM | Mode « autorite fournie sans carte canonique » : garde d'identite inactive | **`ACCEPTED_NON_RUNTIME_PATH`** |
| `A3` | LOW | Couverture mince du mutant M7 | **`TEST_COVERAGE_RESERVATION`** |
| `A4` | LOW | Rupture de compatibilite du registre avec les runs <= v1.0.14 (consequence economique reelle) | **`EXPECTED_FAIL_CLOSED_BREAKING_COMPATIBILITY`** |
| `A5` | LOW | lib/stage-report.js est un 4e fichier runtime modifie, hors de la liste du mandat | **`AUDITED_SEMANTICALLY_INERT`** |
| `A6` | LOW | Divergence latente d'attribution d'identifiant de cible | **`TRANSPORTED_AS_IS`** |
| `A7` | LOW | Etiquetage des cibles dans le rapport — defaut PREEXISTANT, non introduit par v1.0.15 | **`TRANSPORTED_AS_IS`** |
| `A8` | LOW | Reserves heritees, transportees et non traitees | **`TRANSPORTED_AS_IS`** |
| `A9` | EXPECTED | Limites reconnues | **`TRANSPORTED_AS_IS`** |
| `A10` | GOVERNANCE | La candidate a ete commitee et poussee PENDANT l'audit | **`ACKNOWLEDGED_IN_D4`** |
| `A11` | COSMETIC | Ecarts factuels mineurs | **`TRANSPORTED_AS_IS`** |

Points que le dossier de gel doit garder lisibles :

- **A1** — le câblage de `lib/pipeline.js` n'a **aucune couverture comportementale** ; `R1-06` est une assertion de texte source et ne prouve rien. Accepté pour le gel et le smoke **parce que** le défaut simulé est arrêté *fail closed* par `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` et qu'aucune permutation silencieuse n'est démontrée. **À vérifier manuellement dans les traces du smoke** (couples `targetId` / `documentAuthoritySha256`).
- **A2** — hors du chemin runtime, un appelant qui passerait `documentAuthority` **sans** `targetDocuments` verrait la garde d'identité **inactive** (une autorité surlongue serait acceptée). Conclusion **non élargie** aux futurs appelants.
- **A4** — **rupture de compatibilité assumée** : une reprise ou un replay d'un run créé sous ≤ v1.0.14 peut exiger de **nouveaux appels fournisseur facturés**. Ce n'est **pas** une migration transparente.
- **A5** — `lib/stage-report.js` est bien un **4ᵉ** fichier runtime modifié, absent de la liste du mandat ; mesuré **sémantiquement inerte** (rapport utilisateur byte-identique v1.0.14 / v1.0.15 sur les intrants réels du run A10).

## Interdits en vigueur

Ne pas activer · ne pas fumer sans plan approuvé · ne pas réécrire l'historique (pas d'amend, pas de reset sur `6bccae02`) · ne jamais stager `Worker/index.js` · ne pas modifier les lots gelés, D103, ni le run historique `efm-20260918-a64167c0` · **pas de v1.0.16 avant le smoke** sauf blocker factuel (D6).

## Suite

**D7 — `SMOKE_AUTHORIZED_WITH_CONDITIONS`.** Un plan de smoke borné (`EVIDENCEFORGE-v1.0.15-REAL-SMOKE-PLAN.md` / `.json`) est produit **avant** toute dépense ; aucune exécution sans validation propriétaire du plan. La décision finale d'`ACTIVE_VERSION` reste propriétaire.
