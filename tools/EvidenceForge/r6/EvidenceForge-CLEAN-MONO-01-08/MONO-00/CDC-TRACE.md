# MONO-00 — Traçabilité par rapport au CDC

Correspondance entre chaque section du CDC MONO-00 et ce qui a été livré.

| Section CDC | Exigence | Livré | Emplacement |
|---|---|---|---|
| §3 | Baseline historique confirmée | Oui — 1223/1223 rejoués | reports/mono-00-verification-report-v1.md |
| §3 | 3 hashes de référence vérifiés (pas recopiés) | Oui — recalculés depuis paquets extraits à froid | reports/mono-00-verification-report-v1.md |
| §4 | Hiérarchie de preuve à 5 niveaux appliquée | Oui, + champs granulaires packageVerification/realSmokeVerification pour EF-02A/B/C | registry/mono-00-frozen-baseline-registry-v1.json |
| §5 | Fiche par module (format minimal complet) | Oui — 10 fiches (EF-ORCH, EF-PR-GEN-01, EF-02A, EF-02B, EF-02C, EF-02ABC-SMOKE-REAL, EF-02D, EF-02E, EF-03, EF-04) | registry/mono-00-frozen-baseline-registry-v1.json |
| §6.1-6.9 | Chaque module du CDC inventorié | Oui | idem |
| §7 | mono-00-frozen-baseline-registry-v1.json | Oui | registry/ |
| §8 | mono-00-file-inventory-v1.json | Oui — 295 fichiers | registry/ |
| §9 | Matrice de contrats .md + .json | Oui — 14 lignes. **CORRIGÉE après audit indépendant** : EF-02A montre désormais explicitement CorpusSnapshot, EF-03B montre désormais explicitement MissionDocumentMapping. T00-09 repassé et vérifié PROGRAMMATIQUEMENT (pas seulement affirmé) — script de vérification inline, aucun élément de la chaîne minimale absent. | registry/ + reports/ |
| §10 | Recherche statique exhaustive + classement | Oui — aucun REAL_HARDCODING trouvé | reports/mono-00-static-search-report-v1.md |
| §11 | Versions concurrentes classées | Oui | reports/mono-00-competing-versions-v1.md |
| §12 T00-01 | Complétude manifeste | Oui (écart EF-ORCH documenté, pas masqué) | reports/mono-00-test-report-v1.md |
| §12 T00-02 | Validation SHA manifeste | Oui — 100% concordant partout | idem |
| §12 T00-03 | Aucun fichier non inventorié | Oui, même réserve EF-ORCH | idem |
| §12 T00-04 | Hashes de dépendance gelée | Oui — 3/3 confirmés | idem |
| §12 T00-05 | Découverte du mécanisme de test | Oui | idem |
| §12 T00-06 | Extraction à froid | Oui — /tmp/mono00-verify/, 7 paquets | idem |
| §12 T00-07 | npm ci (jamais npm install) | Oui | idem |
| §12 T00-08 | Test à froid | Oui — 1223/1223 | idem |
| §12 T00-09 | Inventaire des contrats | Oui | registry/mono-00-contract-matrix-v1.json |
| §12 T00-10 | Détection de doublons canoniques | Oui — testé, aucun doublon réel | reports/mono-00-competing-versions-v1.md |
| §12 T00-11 | Mutation détectée | Oui — testé positivement | reports/mono-00-test-report-v1.md |
| §12 T00-12 | Suppression détectée | Oui — testé positivement | idem |
| §12 T00-13 | UNVERIFIED jamais deviné | Oui — logique testée | idem |
| §12 T00-14 | CONFLICT détecté | Oui — logique testée | idem |
| §13 | Non-régression, jamais de faux PASS | Oui — 1223/1223 réels, rien fabriqué | reports/mono-00-verification-report-v1.md |
| §14 | Arborescence de livrables | Oui, voir package/EvidenceForge-MONO-00-v1.zip | — |
| §15 | Rapport final aux 13 rubriques exactes | Oui | Message de livraison |
| §19 | Aucune interdiction violée | Confirmé — aucun code d'orchestrateur, aucune modification de lot gelé, aucun score/vote/majorité introduit | — |

## Corrections appliquées suite à l'audit indépendant ChatGPT (correction 3)

**Défaut de baseline/matrice corrigé** : `EF-ORCH` était déclaré `llm=false`/`llmDependency=false`, inexact. Vérifié par grep direct dans le code gelé : aucun appel LLM direct nulle part (0 résultat), mais EF-01B et EF-01C1 ont une dépendance LLM **indirecte/en amont** documentée explicitement dans le code lui-même, et EF-01C2 a une dépendance réseau **directe et réelle** (OpenAlex/Crossref/PubMed, trois runners dédiés). Représentation corrigée : `llmDependency="INDIRECT_UPSTREAM"` + `externalDependencies` détaillé, plutôt qu'un simple `true` qui aurait surstatué ce que l'exécuteur fait réellement. **Nouveau test T00-15** (External dependency inventory, 13/13) ajouté pour empêcher toute régression future de ce type. Fichiers mis à jour : `mono-00-contract-matrix-v1.json`/`.md`, `mono-00-frozen-baseline-registry-v1.json`, `build-contract-matrix.py`, `mono-00-verification-report-v1.md`, `mono-00-test-report-v1.md`.

## Corrections appliquées suite à l'audit indépendant ChatGPT (verdict NON GELÉ)

1. **Défaut contractuel corrigé** : `EF-03B` montrait `MissionDocumentMapping` absent de ses `consumes`, alors que le transfert post-EF-04 le fixe comme entrée obligatoire de la résolution reviewTarget→document réel. `EF-02A` omettait le raccord `CorpusSnapshot`→EF-02A pourtant explicite dans la chaîne minimale auditée. Les deux corrigés dans `mono-00-contract-matrix-v1.json`/`.md`, avec une note de précision honnête : la dépendance à `MissionDocumentMapping` est **architecturale** (intervient à la construction du `TargetDocumentSet`, en amont), jamais un paramètre direct de la fonction gelée `buildDocumentaryReviewSet()` elle-même — aucun lot gelé n'a été modifié. T00-09 repassé et vérifié programmatiquement.
2. **Défaut de portabilité corrigé** : `build-registry.py` codait en dur `/tmp/mono00-verify` et une destination `/home/claude/MONO-00/...`. Réécrit avec `--baseline-root`/`--output` explicites (repli relatif à l'emplacement du script, jamais un chemin de session). `static-search.sh` idem, avec message d'erreur clair si la racine est introuvable. Un bug réel introduit par cette correction elle-même (`set -e` faisant échouer le script sur un `grep` sans résultat, comportement normal de grep) a été trouvé et corrigé avant livraison.
3. **Nouveau test de portabilité réel** ajouté (`tests/test_mono00_script_portability.py`, 10/10 PASS) : construit une fixture de baseline à un emplacement arbitraire (jamais `/tmp/mono00-verify` ni `/home/claude`), exécute les deux scripts dessus, vérifie que le JSON produit est valide et ne contient aucune référence à un chemin de session.
4. **README/CDC-TRACE corrigés** : « chaîne bout en bout complète » n'est plus affirmée sans preuve — la vérification programmatique T00-09 est citée explicitement à la place.

## Corrections appliquées suite à la revue intermédiaire précédente

1. Les deux ZIP EF-PR-GEN-01 reclassés comme variantes de packaging d'un contenu identique (jamais un conflit), avec choix motivé de la forme canonique.
2. EF-ORCH : `manifestScope` explicite ajouté (scope, nombre d'entrées, fichiers non couverts, dépendances tierces non couvertes) — jamais présenté comme un manifeste complet.
3. EF-PR-GEN-01 : aucun manifeste ajouté ; statut maintenu à `VERIFIED_FROM_CANONICAL_ARTIFACTS`.
4. EF-02A/B/C : statuts séparés `packageVerification` (code) et `realSmokeVerification` (exécution réelle) — jamais fusionnés.
5. Structure du registre confirmée capable de statuts granulaires par sous-preuve.
6. Aucun fichier interne d'un lot gelé créé, modifié ou complété — seuls les fichiers du registre MONO-00 lui-même portent les hashes calculés dans ce lot.
