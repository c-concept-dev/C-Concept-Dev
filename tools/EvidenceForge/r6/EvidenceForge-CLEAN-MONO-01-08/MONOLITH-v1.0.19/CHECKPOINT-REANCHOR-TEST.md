# CHECKPOINT-REANCHOR-TEST — checkpoint PROFESSIONALS sous MONO-11 v0.3-r1 (v1.0.4)

Aucun appel réseau (sonde MONO-10 servie par le fournisseur simulé, charge fermée attendue).

## R5 (inchangé, rejoué sous v0.3-r1) — checkpoint synthétique valide → ré-ancrage → aval gelé
1. Évaluation MONO-10 **réelle** (locale, sans LLM) sur une découverte synthétique ; liaison des artefacts amont (registre typé MONO-10).
2. Un `ProfessionalsCheckpointRef` sous la relation `assessment` reste refusé par MONO-10 (`REGISTRY_TYPE_RELATION_MISMATCH`) — comportement à préserver, préservé.
3. `checkpoint-professionals.json` synthétique (`complete: true`, sceau = `SEAL.runtimeSealSha256` du lot **v0.3-r1**, `panelHash`, `assessment`, `dimensionSet`, `selection`, `outputHashes`) sauvegardé par `run-store.saveCheckpoint` (écriture atomique, `contentHash` vérifié au chargement).
4. `runDownstreamFromCheckpoint` (non mocké) : nouveau run MONO-10 `…-a2`, référence de checkpoint inscrite dans le ledger MONO-11 (`mono11:professionals-checkpoint-ref`), événement `checkpoint_reanchored` avec `panelHash` et `sourceMono10RunId`, puis **entrée effective dans l'aval gelé MONO-11 v0.3-r1** (`runDownstream`) qui s'arrête sur `FAIL_CLOSED_NO_ADMITTED_PROFESSIONAL` (0 admis : preuve d'entrée, jamais d'acceptation artificielle).
Résultat : PASS. Structure du checkpoint, `contentHash`, `panelHash`, sélection cap-150 (`selectionHash`), provenance, `ProfessionalsCheckpointRef`, inscription ledger, frontière MONO-10 : inchangés (fichiers `run-store.js`, `professional-selection.js` byte-identiques ; `stage-professionals.js` ne change que la version attendue par la garde et un libellé).

## V5 (nouveau) — checkpoint produit sous un autre sceau
Checkpoint synthétique portant `seal.runtimeSealSha256 = 57e243b7…9df3` (sceau MONO-11 v0.2, celui des runs P0.1 seal B et H1) → `runDownstreamFromCheckpoint` sous v0.3-r1 → **`CHECKPOINT_SEAL_MISMATCH`**, aucun `checkpoint-downstream.json` écrit. Conséquence documentée : le run H1 `efm-20260915-2584bf6c` n'est **pas** reprenable sous v1.0.4 (fail-closed voulu ; aucune reprise tentée).

## Cap 150 (C1–C6, inchangés)
Sélection déterministe persistée avant tout appel, garde dure `EVALUATION_CAP_INVARIANT_VIOLATION`, reprise à l'identique : PASS sous v1.0.4.

```
PROFESSIONAL_CHECKPOINT_REANCHOR = PASS
```
