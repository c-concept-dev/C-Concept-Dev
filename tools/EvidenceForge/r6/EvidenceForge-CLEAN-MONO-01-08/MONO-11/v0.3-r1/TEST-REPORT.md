# TEST-REPORT — MONO-11 v0.3

`EVIDENCEFORGE_BUNDLE_ROOT=<bundle> node --test test/test-mono11-v0.3.js` — **59 tests, 59 PASS, 0 FAIL** (aucun appel réseau ; LLM simulés/scriptés ; frontière MONO-10 réelle locale via le harnais v0.2).

## Suite v0.2 conservée (44 tests) — PASS
T01–T42 de v0.2, inchangés (dont T30 reprise informée, T39/T40 règle 100 % et ses mutants, T42 fail-closed fournisseur).

## Tests unitaires v0.3 (12) — PASS
| Test | Vérifie |
|---|---|
| T1 | citation valide passe 1 : aucune reprise, stratégie BASE, prompt gelé + préambule inchangé, sortie identique v0.2 |
| T2 | citation non littérale simple : passe 2 ciblée (schéma `{repairs}`, champ/dimension/citation rejetée indiqués, règles contiguë/caractère pour caractère/pas de paraphrase/fusion/reconstruction, repli `[]`, document présent, pas de réinjection intégrale) ; correction acceptée ; EF-03B gelé accepte |
| T3 | collage de 2 fragments : `literalFragments` détecte 2 fragments non contigus ; transmis au feedback ; **jamais substitués** (sans réponse valide, la revue reste refusée) |
| T4 | aucune citation valide : `[]` accepté conformément au contrat |
| T5 | réponse byte-identique : `EXACT_RETRY_REPEAT`, hashes précédent/courant journalisés |
| T6 | passe 3 = changement de stratégie explicite (prompt différent ; rejet, répétition de la citation fautive, interdiction de réutilisation, nouvelle extraction, repli `[]`) |
| T7 | 3e répétition interdite : après répétition exacte en changement de stratégie, aucune passe identique même si `maxPasses` le permettrait (fail-closed) ; autres codes : répétition exacte ⇒ pas de 3e passe identique |
| T8 | fail-closed final : aucune correction valide ⇒ `error`, 0 finding, jamais SUCCESS |
| T9 | validateur inchangé : `validateReviewCandidate` byte-identique v0.2/v0.3 ; corpus de citations invalides refusé à l'identique ; valide accepté à l'identique |
| T10 | réponse partiellement valide : seul le champ fautif réparé ; autres champs/dimensions préservés ; réparation hors schéma refusée (schéma fermé) |
| T11 | lignée complète par passe |
| T12 | autres codes : comportement v0.2 (`informedRepairPrompt` byte-identique) ; cas mixte ⇒ v0.2 |

## Régression sur cas réels (3) — PASS (`benchmark/replay.js`, 11 fixtures anonymisées, byte-exactes)
| Test | Vérifie |
|---|---|
| R1 | cas A (3 passes identiques) : collage détecté (2 fragments, couverture 100 %), feedback ciblé construit (fragments, `[]`, document, pas de réinjection), passes 2/3 = répétitions exactes détectées ; moteur v0.3 rejoué avec les réponses historiques : prompts 2 ≠ 3, répétition détectée, **aucun 4e appel** (fail-closed) |
| R2 | cas B (corrigé au retry) : la correction historique, rejouée en réparation ciblée recomposée sur la passe 1, est acceptée (validateur + EF-03B gelé) |
| R3 | 12 occurrences : 12 collages, 0 inventions, 5 répétitions exactes, 5 séquences éligibles, 0 fausse acceptation, 0 régression, 2 corrections historiques acceptées ; matrice v0.2/v0.3 : mêmes verdicts sur toutes les passes |

## Scans
- `tools/anti-hardcoding-scan.js` : FIXED_PROFESSION_LIST NO, FIXED_DISCIPLINE_LIST NO, FIXED_EXPERT_LIST NO, FIXED_PANEL_SIZE NO, CASE_SPECIFIC_LEAK_FOUND NO, DOMAIN_HARDCODING_FOUND NO — avec jetons de cas réels : 0 hit. *Erratum v0.3-r1 (P2-01) : le MANIFEST v0.3 scellé avait été construit SANS `EVIDENCEFORGE_CASE_ARTIFACTS` (`caseTokens: 0` par construction) ; le chiffre « 1 892 » provenait d'une exécution séparée non consignée. La mesure scellée de v0.3-r1 est construite avec les artefacts déclarés, listés (nom + sha256) dans `MANIFEST.json → measurements.antiHardcodingScan.caseArtifacts` ; voir `TEST-REPORT-v0.3-r1.md`.* `benchmark/` (hors `SCAN_DIRS`) vérifié à part : 0 jeton de cas (identités anonymisées, run IDs hachés).
- Lots gelés : MONO-10 79/0, MONO-09 9/0, MONO-01 106/0 (bridge) ; MONO-11 v0.2 : SHA256SUMS et zip canonique inchangés (voir rapport final).
