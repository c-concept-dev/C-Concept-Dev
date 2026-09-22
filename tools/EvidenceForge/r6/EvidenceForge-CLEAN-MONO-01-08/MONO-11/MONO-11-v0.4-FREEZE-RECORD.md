# MONO-11 v0.4 — FREEZE RECORD

**Statut : FROZEN_WITH_RESERVATIONS** · gelé par OWNER (D1 = FREEZE_WITH_RESERVATIONS, 2026-09-22) · enregistré 2026-09-22T12:00:36+00:00

**Ce que le gel signifie** : le chemin de réparation ciblée garantit désormais `LINEAGE_MONOTONICITY_DURING_REPAIR` (contrat MONO-11-v3). Il ne signifie pas que la lignée globale est garantie dans le produit : l'intégration (MONOLITH-v1.0.12) est conditionnée par R5 et R6.

## Identité

- lot : MONO-11 **v0.4** — TARGETED REPAIR LINEAGE PRESERVATION · contractVersion **MONO-11-v3** (`lineageMonotonicityDuringRepair`, P1..P6)
- runtimeSealSha256 : `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d`
- runCodeHash : `27610c84502104b3dc9643a9cc0289aef4ae40ae65ee34e4fe82f31a73e381ad`
- zip canonique : `79c16d08a0a52bc1b9ae3c6884cc22f6161145bed18158d6c9b6a44df1a7c474` · MANIFEST : `9acc820d698f7da05a9cd65795fc2cded93c1f0fe4820735bed25c4c3a29514b` · SHA256SUMS : `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d`
- `core/review-enforcer.js` : `cd620ab30ca1fbe863987dee6711b358930721d57c1b7d086c7bab87d985636a` · `contracts/mono11-contracts.json` : `b3e5ac7dc3a7a70deef015b1f26b93d173cf79e83c9644c4d37f65059d2c75d2`
- prédécesseur v0.3-r1 (gelé, intact) : zip `3c44b397dda0997d…`, sceau `9fbef4126d437e0b…`, runCodeHash `e156590d1605a887…`
- schemaVersion des traces : **MONO-11-v2** (D4 — SCHEMA_V2_ADDITIVE_COMPATIBLE ; à ne pas confondre avec contractVersion)

## Audits

- chantier : `MONO-11-v0.4-TARGETED-REPAIR-LINEAGE-AUDIT.md` `58f64aae191ceff1…` — GELABLE proposé
- indépendant : `v0.4/MONO-11-v0.4-INDEPENDENT-FREEZE-AUDIT.md` `caab936f66d5beb0…` (json `f7cabd0e976e417a…`) — **MONO11_V0_4_FREEZE_AUDIT_PASS_WITH_RESERVATIONS**, recommandation GELER, 0 bloqueur, CAS_B_FAIL_CLOSED_CORRECT, SCHEMA_V2_ADDITIVE_COMPATIBLE
- mesures : 83/83 (test/test-mono11-v0.4.js) · replay 12 occurrences / 12 collages / 5 repetitions / 5 eligibles / 0 fausse acceptation / 0 regression / 2 corrections / 0 collision · anti-hardcoding 0 hit (30 fichiers ; + balayage adversarial 322 jetons du cas reel : 0 hit) · lots gelés MONO-10 79 / MONO-09 9 / MONO-01 106, 0 divergence
- preuve indépendante : fixture reelle : v0.3-r1 perd 2 citations litterales, v0.4 les conserve ; fuzz 20 000 tirages P1..P6 : 0 violation

## Sceau et rapports (D2)
les rapports d'audit restent au racine du lot, HORS sceau runtime (artefacts de gouvernance, pas du code execute) ; assertSealedRuntime passe (le sceau verifie les fichiers scelles + l'absence de code non scelle sous core/ et contracts/) ; runCodeHash ne couvre que core/ + contracts + index.js et ne changerait pas

Intégrité de gouvernance : `MONO-11-v0.4-GOVERNANCE.SHA256SUMS.txt`.

## Réserves transportées

| id | sévérité | résumé |
|---|---|---|
| R1 | low | Le contrat ecrit NO_REFS_EXPECTED : RAW=[] => FINAL=[] ; le code (mergeRepairLineage l.199-201) rend FINAL = VALID_REPAIR, non vide si la reparation est litterale. |
| R2 | low | buildEnforcedReviewSet l.403 : producedBy annonce toujours 'MONO-11 v0.3-r1 review-enforcer' ; le DocumentaryReviewSet produit par v0.4 se declare produit par v0.3-r1. |
| R3 | medium | En CAS B, le prompt de passe 3 porte 'elle REPRODUISAIT A L'IDENTIQUE la citation fautive' alors que le modele a pu rendre [] : la re-presentation est causee par v0.4 (applied = raw). Accusation fausse, pression possible vers l'invention. |
| R4 | medium | Si parseRepair echoue, rec.repairUnresolvedDimensions vaut silencieusement [] et repair.lineage est absent ; le statut non resolu n'est porte que par repair.parsed=false + REPAIR_JSON_INVALID. |
| R5 | high_at_integration | Le miroir de l'adaptateur MONOLITH RE.recompose(st.parsed, rp.repairs) diverge octet pour octet du candidat du lot sous v0.4 ; en CAS B le miroir est VALIDE la ou le candidat du lot est INVALIDE ; le registre EF-03B inscrirait un candidat ampute de ses references conservees. |
| R6 | high_at_integration | validationContract / CONTRACT epingles a MONO-11-v2 alors que contractVersion passe a MONO-11-v3 ; tools/ef03b-registry-import.js code le contrat en dur et reconstruit les candidats avec l'ancien recompose. |
| R7 | low | forbiddenRefs est passe a targetedRepairPrompt mais jamais rendu dans le prompt (deja en v0.3-r1). La garantie 'aucune valide interdite' repose sur la regle d'accumulation, pas sur le texte : risque latent si une version future affichait la liste. |
| R8 | low | test/fixtures/tr8-targeted-repair-case.json reprend mot pour mot les trois citations historiques (A10 restorationTable[15]) : anonymisation = desidentification, pas decontextualisation. Le MANIFEST consigne 'aucun artefact de cas declare' alors qu'un artefact derive d'un cas existe desormais. |
| R9 | low | Croissance de la trace : +28 % sur une passe ciblee minimale (1237 -> 1578 octets) ; repair.lineage duplique les chaines de citations par dimension. Consommateurs tolerants, mais checkpoint-downstream.json fait 5,4 Mo sur le run historique. |
| R10 | very_low | mergeRepairLineage n'a pas la garde typeof content === 'string' de partitionRefsOf ; avec un targetDoc.content non-chaine et non-nul, le validateur utiliserait '' et isLiteralRef String(content). Inatteignable en pratique. |
| R11 | info | Le chemin INFORMED_REPAIR_V02 (regeneration complete) n'offre aucune garantie de lignee : mesure, la reference valide VA disparait. Ce n'est PAS une perte de lignee de reparation mais une nouvelle reponse complete legitime, validee par le validateur gele, explicitement hors du scope du contrat v3 ; sur cette passe preservedRefs=null et repairUnresolvedDimensions=[] : la trace ne pretend rien. |
| R12 | info | Changement de comportement voulu (Q6) : une revue que v0.3-r1 acceptait (CAS B avec reparation [] => [] silencieux accepte) echoue desormais en fail-closed. Un run reel peut produire davantage de reviewStatus error. |
| R13 | low | Le zip canonique est produit par une commande zip -X ad hoc : aucun script de construction dans le lot, horodatages des entrees non neutralises => reconstruction deterministe octet pour octet NON garantie. L'integrite repose sur le hash publie, ce que le lot ne pretend pas depasser. |

## Observation (D3)
buildEnforcedReviewSet l.403 annonce encore « MONO-11 v0.3-r1 review-enforcer » : OBSERVATION_NON_BLOCKING du lot gele ; ne pas modifier v0.4 apres gel pour ce libelle ; correctif eventuel a l'integration v1.0.12 si le champ est consomme ou expose

## Conditions d'intégration v1.0.12 (BLOQUANTES)

- **R5 miroir adaptateur (MONOLITH lib/ef03b-resilience.js l.191) a aligner sur MONO-11-v3**
- **R6 epinglages de contrat (lib/llm.js, lib/ef03b-resilience.js, tools/ef03b-registry-import.js) a aligner sur v3, fail-closed**

Autres réserves transportées : R3 libelle passe 3 ; R4 tracabilite d'un parseRepair illisible ; R12 plus d'echecs reels (CAS B fail-closed) — a mesurer en smoke reel ; R13 zip non garanti reproductible bit-a-bit ; R2 producedBy si consomme ; R11 regeneration INFORMED hors perimetre du contrat v3 — ne pas elargir silencieusement

## ACTIVE_VERSION et run historique

- ACTIVE_VERSION = **MONOLITH-v1.0.10**, inchangé ; v1.0.12 devra passer tests + audit independant + decision proprietaire avant activation
- run `efm-20260918-a64167c0` : lié à MONOLITH-v1.0.10 / MONO-11 v0.3-r1 (sceau 9fbef412…) ; reportHash `a962d5eefeb033ac…` ; AUCUNE ; CHECKPOINT_SEAL_MISMATCH attendu sous v0.4 ; aucune reutilisation inter-sceau
