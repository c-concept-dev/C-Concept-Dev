# MONO-00 — Artefacts manquants

## 1. Fichiers de résultat du smoke réel EF-02A/B/C

**Manquant** : `ef02a-export.json`, `ef02b-export.json`, `ef02c-export.json`, logs réseau bruts.

**Preuve disponible** : uniquement le kit de smoke (fixtures d'entrée, `EF-02ABC-SMOKE-REAL-KIT.zip`) et une déclaration chat de l'opérateur rapportant : 235 candidats trouvés, 50 vérifiés, 50 corpus construits, 0 erreur corpus, 2267 travaux récupérés, 2222 DOI.

**Impact sur MONO-01** : NE BLOQUE PAS. Le code d'EF-02A/B/C est lui-même vérifié (tests rejoués, hashes de dépendance confirmés) — seule l'exécution réelle en navigateur reste non physiquement vérifiable ici. Documenté comme `HISTORICAL_FREEZE_CONFIRMED`, jamais présenté comme équivalent à une vérification physique.

## 2. Manifeste interne pour EF-PR-GEN-01, EF-02A, EF-02B, EF-02C

**Manquant** : `EF-PR-GEN-01-MANIFEST-SHA256.txt` (ou équivalent) n'a jamais existé pour ces quatre lots.

**Preuve disponible** : hashes de référence explicitement cités dans le CDC (2 valeurs, confirmées), tests rejoués avec succès pour les quatre lots.

**Impact sur MONO-01** : NE BLOQUE PAS. Ces lots restent `VERIFIED_FROM_CANONICAL_ARTIFACTS` — un niveau de preuve inférieur à `VERIFIED_FROM_CANONICAL_PACKAGE` mais suffisant pour une intégration additive, puisque le code lui-même est vérifié fonctionnellement. Un manifeste pourrait être ajouté rétroactivement en amendement (décision hors périmètre de MONO-00).

## 3. Documentation et node_modules absents du manifeste EF-ORCH

**Manquant du manifeste** (pas du paquet lui-même, qui les contient bien) : 8 fichiers `.md` et l'arborescence `node_modules/fake-indexeddb`.

**Impact sur MONO-01** : NE BLOQUE PAS. Tous les fichiers de code effectivement couverts par le manifeste concordent à 100%. `node_modules/fake-indexeddb` est une dépendance tierce reconstructible, jamais un artefact canonique du projet.

## Verdict sur les manquants

Aucun des trois manques ci-dessus ne touche une dépendance structurante nécessaire pour que le futur MONO-01 puisse commencer sans modifier un lot gelé. Tous sont documentés explicitement, jamais silencieusement contournés.
