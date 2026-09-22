# TEST REPORT — MONO-11 v0.4 (TARGETED REPAIR LINEAGE PRESERVATION)

Date : 2026-09-22 · exécution : `EVIDENCEFORGE_BUNDLE_ROOT=<kit> node --test test/test-mono11-v0.4.js` · 0 appel fournisseur, 0 réseau (LLM factice scripté, lots gelés MONO-10 v0.19 / MONO-09 v0.2 / MONO-01 composés intacts).

| suite | résultat |
|---|---|
| `test/test-mono11-v0.4.js` | **83 / 83** (69 tests v0.3-r1 conservés — T2, T4, r1-T10 adaptés au contrat v3 — + TR-1..TR-14) |
| `benchmark/replay.js` (R1..R6, S1..S5) | 12 occurrences TARGET_REF_NOT_LITERAL, 12 collages, 5 répétitions exactes, 5 séquences éligibles, 0 fausse acceptation, 0 régression, 2 corrections historiques acceptées par recomposition (fusionnée), 0 collision de prompt — identiques à v0.3-r1 |
| `tools/anti-hardcoding-scan.js` | 0 hit (30 fichiers) |
| lots gelés (`frozen-bridge`) | MONO-10 79 / MONO-09 9 / MONO-01 106 fichiers, 0 divergence |
| `tools/build-manifest.js` | mesures consignées ; verdict technique `GELABLE_TECHNIQUEMENT` |

## TR-1..TR-14 (mandat propriétaire 2026-09-22)
TR-1 préservation + réparation · TR-2 toutes valides (0 réparation) · TR-3 omission par le modèle → préservée par le code, listée CONSERVÉE · TR-4 doublons (dédup stable) · TR-5 réparation non littérale écartée sans perte · TR-6 multi-dimension (seule la ciblée change) · TR-7 non-régression sémantique (7 champs byte-identiques, empreinte de contexte inchangée) · TR-8 fixture réelle anonymisée (4 comportements du modèle → même résultat) · TR-9 sondes P4/P5 · TR-10 rejeu R/S (décomptes identiques, 0 dimension non résolue, 0 originale perdue) · TR-11 `[]` légitime (CAS A) · TR-12 invalides non résolues (CAS B : jamais un succès silencieux, passe 3, fail-closed) · TR-13 conservées + réparation échouée · TR-14 omission délibérée + passe 3 (jamais une valide rejetée/interdite).

Non exécuté ici : tests du MONOLITH (intégration = v1.0.12, après gel), run réel (interdit avant décision propriétaire).
