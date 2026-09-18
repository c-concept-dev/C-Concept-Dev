# MONOLITH-v1.0.6 — AUTO-CHUNK UPLOAD — RAPPORT DE LOT

**Date :** 2026-09-18 · **Type :** correctif d'ingestion / upload · **Base :** MONOLITH-v1.0.5 = GELÉE (commit `bc99864e`, zip `c6eae8af…`, non modifiée)
**Définition :** `v1.0.6 = v1.0.5 + AUTO-CHUNK UPLOAD` — et rien d'autre. Aucun changement scientifique, aucun changement des lots gelés, aucun changement de la logique de panel / jumeaux / agrégation / budget / run safety / screening / portefeuille.
**Coût :** 0 USD — aucun appel fournisseur pendant le développement ni pendant les tests.

## 1. Problème corrigé

Le cadrage IA (`lib/stage-mission.js`) lisait chaque document jusqu'à `DOC_EXCERPT_CHARS = 6000` caractères et annonçait « TRONQUE a 6000 caracteres » au-delà ; le contrôle pré-run (`lib/preflight-assistant.js`) faisait de même à 4 000. Un document long n'était donc jamais cadré intégralement, et l'utilisateur devait le découper à la main en fichiers `PART-XX-OF-YY` — que le pipeline comptait ensuite comme autant de documents (27 « documents » pour 7 sources réelles dans le run `f8a95282`).

## 2. Fichiers modifiés / ajoutés (diff v1.0.5 → v1.0.6)

| Fichier | Nature | Lignes |
|---|---|---|
| `lib/document-chunker.js` | **AJOUTÉ** — fonction pure de découpage, vérification, rendu | 121 |
| `lib/stage-mission.js` | intake avec découpage (`chunked`, `chunking`, `DOCUMENT_EMPTY`), `chunkOptions`, `chunkedView`, prompt de cadrage sans troncature (tous les segments `PART-k-OF-n`) ; `validateReformulation` et `reformulate` **byte-identiques** à v1.0.4/v1.0.5 | 46 |
| `lib/preflight-assistant.js` | prompt de contrôle pré-run : segments intégraux au lieu d'un extrait tronqué à 4 000 | 4 |
| `lib/pipeline.js` | `startRun` persiste `documents-chunks.json` ; `loadDocuments` re-découpe et vérifie (codes d'erreur) ; `_loadDocuments` exposé pour test | 21 |
| `server.js` | `POST /api/documents/preview` (local, synchrone, sans LLM, sans run) | 6 |
| `index.html` | base64 par blocs (plus de débordement de pile sur un long fichier), aperçu du découpage, compte de documents, garde de ré-entrance | 17 |
| `config/monolith.config.json` | `product.version = MONOLITH-v1.0.6` ; `documents.chunking { maxChunkChars: 4500, strategy }` | 11 |
| `test/test-chunking.js` | **AJOUTÉ** — T-CHUNK-01..16 + T-CHUNK-REAL-01..05 | 21 tests |
| `tools/browser-tests-v106.js` | **AJOUTÉ** — tests navigateur de l'upload (Chrome headless, CDP) ; correctif d'audit : compteur DOM `#docCount`, RegExp dynamiques, 3e document à N ≠ 1, 2, 8 segments, résultats persistés sans diagnostics | 12 tests |
| `fixtures/real-documents/` | **AJOUTÉ** — 4 documents de gouvernance réels complets (fixture locale, données) | 4 fichiers |
| `test/test-v105.js` | NONREG-03 : `stage-mission.js` n'est plus exigé byte-identique à v1.0.4 (modifié par ce lot) ; le contrat de reformulation l'est toujours | 5 |
| `tools/browser-tests-v105.js` | version lue dans la config (plus de littéral v1.0.5) | 2 |
| `tools/build-manifest.js`, `tools/package.sh` | prédécesseur v1.0.5 (gelée), provenance v1.0.6, nom du zip | 12 |
| `README.md` (ce dossier), `tools/EvidenceForge/README.md`, `tools/EvidenceForge/ACTIVE_VERSION`, `tools/EvidenceForge/test/test-launch.js` | documentation ; version active = v1.0.6 ; test du lanceur lit la version active au lieu d'un littéral | — |

Non touchés : `lib/panel-sufficiency.js`, `lib/professional-selection.js`, `lib/stage-professionals.js`, `lib/stage-retrieval.js`, `lib/screening-*.js`, `lib/corpus-portfolio-review.js`, `lib/portfolio-balancing.js`, `lib/budget-guard.js`, `lib/cost-*.js`, `lib/run-stop.js`, `lib/run-store.js`, `lib/stage-ef01.js`, `lib/stage-report.js`, `lib/llm*.js`, `lib/paths.js`, `vendor/`, `config/llm-pricing.json`, tous les lots gelés (MONO-01/09/10/11 : 0 divergence).

## 3. Fonction ajoutée — `lib/document-chunker.js`

```
chunkDocumentText(text, { maxChunkChars = 4500, minChunkChars = 2250 })
  -> { sourceCharacterLength, sourceTextSha256, totalChunks, maxChunkChars, strategy, status, chunks[] }
buildChunkedDocument({ documentId, name, sha256, bytes, content }, options)   -> représentation logique d'UN document source
verifyChunkedDocument(doc, expectedText?)                                      -> { ok, status, errors[] }
reconstructText(chunks) · chunkMetadata(doc) · partLabel(seq, total) · renderForPrompt(docs)
```

Stratégie `PARAGRAPH>LINE>SENTENCE>SPACE>HARD` : dans la fenêtre `[pos, pos + 4500]`, dernière occurrence de `\n\n`, sinon `\n`, sinon fin de phrase (`[.!?…]` + fermante(s) + blanc), sinon espace, sinon coupe brute à 4500 ; un point de coupe n'est accepté que s'il laisse ≥ 2 250 caractères au segment (sinon niveau suivant) ; le séparateur reste dans le segment précédent. Déterministe (aucune horloge, aucun aléa, aucun LLM), locale, synchrone : 300 000 caractères en < 1 s (T-CHUNK-14).

**Unité de mesure (choix documenté) :** la limite porte sur la **longueur de chaîne JS** (`String.length`, unités de code UTF-16) après extraction UTF-8, jamais sur la taille en octets du fichier. Exemple réel : `D103-CDC-v4.1.md` = 33 490 octets = **33 448 caractères** → 8 segments. Un emoji compte 2 ; une coupe brute ne sépare jamais une paire de substitution (le point de coupe recule d'une unité) : chaque segment reste une chaîne bien formée et la concaténation reste byte-identique (T-CHUNK-06).

**Normalisation :** aucune. Le texte découpé est exactement `bytes.toString("utf8")` — la représentation déjà utilisée par v1.0.5 pour les documents ; retours à la ligne (`\n`, `\r\n`), lignes vides, espaces, tabulations conservés (T-CHUNK-07). Aucune seconde normalisation cachée ; la normalisation typographique MONO-11 des cibles de revue, en aval, est inchangée.

## 4. Contrats

**Document source** (`state.mission.documents[i].chunking` + `documents-chunks.json`) :
```
sourceDocumentId · originalFilename · sourceSha256 (octets) · sourceByteLength · sourceCharacterLength · sourceTextSha256
totalChunks · maxChunkChars · strategy · ingestionStatus (COMPLETE | DOCUMENT_EMPTY) · complete
```
**Chunk** :
```
chunkId (= <sourceDocumentId>-part-<k>-of-<n>) · sourceDocumentId · sequence (1..n) · totalChunks · startChar · endChar (exclusif) · text · chunkSha256 · splitLevel
```
Persistance : `documents-chunks.json` porte les métadonnées **sans le texte** (il se redérive du fichier source, déterministe) ; le fichier source `documents/<id>.txt` reste l'unique copie du contenu — aucune duplication.

## 5. Invariants (mandat §6) et où ils sont garantis

| Inv. | Énoncé | Garantie | Test |
|---|---|---|---|
| A, B, C, D | concat ordonnée = source ; rien perdu ; rien dupliqué ; ordre strict | construction par bornes contiguës ; `verifyChunkedDocument` compare la reconstitution au texte attendu | T-07, T-08, T-REAL-01 |
| E, F, G, H | sequence 1..n, sans trou ni doublon | `verifyChunkedDocument` (INCOMPLETE) | T-09, T-12 |
| I | chaque chunk ≤ 4500 | construction ; vérification | T-03, T-14, T-REAL-01 |
| J | sourceSha256 inchangé | jamais recalculé à partir des chunks ; contrôlé au chargement (`DOCUMENT_HASH_MISMATCH` existant) | T-10 |
| K | jamais des documents indépendants | `state.mission.documents` = 1 entrée par fichier ; `documents-chunks.json.documentCount` ; prompt « N document(s) source » ; UI « N documents » | T-15, T-16, T-REAL-03, UI |
| L | chunk manquant → `DOCUMENT_INCOMPLETE` | trou / doublon / bornes non contiguës | T-12 |
| M | chunk tronqué → `INPUT_DOCUMENT_TRUNCATED` | hash de segment ou reconstitution différente | T-12, T-16 |
| N | nombre annoncé ≠ présent → `INPUT_DOCUMENT_CHUNK_MISSING` | `totalChunks` vs chunks présents ; vs re-découpage au chargement | T-12, T-16 |

Au chargement d'un run (`loadDocuments`), toute violation **lève** l'erreur (run arrêté, message utilisateur explicite) — jamais un avertissement.

## 6. Cadrage IA (mandat §8)

Le prompt de reformulation annonce « `N document(s) source, presentes INTEGRALEMENT en M segment(s)` », explique qu'un segment `[nom — PART-k-OF-n]` est la k-ième partie du **même** document, distingue `COMPLET (DOCUMENT_CHUNKED_COMPLETE)` de `INCOMPLET (<code>)`, et demande `documentsRole` **par document source** (`N au total, jamais par segment`). Plus aucune borne de lecture ni mention « tronqué ». Le contrôle pré-run (« Vérifier ma demande avec l'IA ») reçoit la même présentation. `validateReformulation` / `reformulate` (contrat de sortie, reprise informée) : inchangés byte à byte.

Note : la longueur du prompt est désormais celle des documents complets ; aucun plafond n'est introduit (le mandat interdit toute troncature). La limite effective est celle du contexte du modèle — voir §11.

## 7. Comportement UI (mandat §9, §19)

Sur sélection de fichiers : conversion base64 par blocs de 32 Ko (l'ancienne `String.fromCharCode(...)` débordait la pile sur un fichier long), puis `POST /api/documents/preview` (aucun appel IA, aucun run, aucun contenu renvoyé) et affichage :

```
D103-CDC-v4.1.md · 33 448 caractères → 8 segments générés automatiquement → document complet
court.txt · 43 caractères → 1 segment → document complet
vide.txt · document vide — non exploitable
2 documents · 9 segments au total (segments ≤ 4 500 caractères, lus intégralement)
```
État `COMPLET` / `INCOMPLET` par document ; jamais une liste de sous-fichiers ; un fichier vide reste listé mais non compté. Garde de ré-entrance : deux sélections rapprochées ne mélangent jamais deux listes. Vérifié en navigateur réel (12/12 : compteur DOM de documents, jamais le nombre de segments — cas 8, 4 et 1 + 8 segments).

## 8. Tests

| Suite | Résultat | Réseau / fournisseur |
|---|---|---|
| `test/test-monolith.js` (fonctionnels, adversariaux, UI, privacy, anti-hardcoding, intégrité ; charge test-v105/panel/sufficiency/screening-cost/run-safety/portfolio) | **198 / 198** | aucun |
| `test/test-chunking.js` — T-CHUNK-01..16 + T-CHUNK-REAL-01..05 | **21 / 21** | aucun |
| `tools/browser-tests-v106.js` (Chrome headless) | **12 / 12** | aucun (serveur sans identifiants) |
| `tools/browser-tests-v105.js` (non-régression UI v1.0.5 sur v1.0.6) | **33 / 33** | aucun |
| `tools/EvidenceForge/test/test-launch.js` (lanceur, ACTIVE_VERSION = v1.0.6) | **14 / 14** | worker factice local |
| `tools/anti-hardcoding-scan.js` | 0 hit | — |
| `tools/secret-scan.js` | 0 hit | — |
| `verifyFrozenLots` (MONO-01/09/10/11 + zips canoniques) | 0 divergence | — |

Cas obligatoires du mandat §17 → T-CHUNK-01…16, tous verts (voir `test/results-chunking.json`).

## 9. Fixture réelle (mandat §18)

`fixtures/real-documents/` (dans le paquet, **données** hors périmètre du scanner anti-hardcoding qui couvre `lib/ server.js index.html config tools test`) : `D103-CDC-v4.1.md` (33 448 car., 8 segments, max 4 481), `D103-anti-derive-v1.3.md` (26 152, 6, max 4 499), `D103P0.1-grille-revue-professionnelle-structure-v0.2.md` (28 354, 7, max 4 497), `EF-JMJS-CDC-gouvernance-v1.0.md` (15 545, 4, max 4 367) — reconstitués byte à byte à partir des fragments manuels `PART-XX-OF-YY` du run `f8a95282` (hashes vérifiés). L'analyse descriptive des cas (P0.0-B, 19 991 car., 5 segments, max 4 496) est lue depuis un dossier **local hors dépôt** (`~/evidenceforge-work/reports/real-documents-external/`) quand il existe — présent lors de ces tests ; elle n'est pas versionnée (contenu dérivé de cas personnels). **Les fiches S01/S02 ne sont ni versionnées ni utilisées** (T-CHUNK-REAL-05).

Résultat (T-CHUNK-REAL-01..04) : 5 sources complètes, 30 segments, **max observé 4 499 ≤ 4 500**, ordre exact, reconstitution byte-identique, coupes 100 % sur paragraphes ; le cadrage voit **5 documents source** (pas 30), tous les `PART-k-OF-n` présents, statut COMPLET partout, **aucune alerte « tronqué »** ; run créé avec la fixture, `documents-chunks.json` cohérent, rechargement vérifié.

## 10. Compatibilité (mandat §16)

- Fichier court (≤ 4 500 caractères) : `totalChunks = 1`, même contenu transmis au cadrage qu'avant (sans le libellé « integral » remplacé par l'en-tête de document) ; M1 et les tests existants inchangés passent.
- Anciens runs : `loadDocuments` ne vérifie les segments que si `documents-chunks.json` existe ; les runs créés avant v1.0.6 restent lisibles tels quels. Aucune migration.
- Changement de comportement assumé : un fichier **non vide mais sans texte exploitable** (espaces / BOM seuls) était accepté par v1.0.5 ; il est désormais refusé `DOCUMENT_EMPTY` (listé, jamais présenté comme exploitable, confirmation explicite comme tout document refusé).
- `POST /api/runs` renvoie désormais `documents[i].chunking` en plus ; aucun champ retiré.

## 11. Limites

- Le prompt de cadrage contient désormais l'intégralité des documents : au-delà de la fenêtre de contexte du modèle, l'appel échouera côté fournisseur (`REFORMULATION_INVALID` / erreur transport) au lieu de tronquer silencieusement. Aucun plafond n'a été ajouté (le mandat interdit la troncature) ; un garde explicite (`DOCUMENT_SET_TOO_LARGE_FOR_FRAMING`) reste une décision à prendre séparément.
- La coupe « fin de phrase » repose sur une heuristique de ponctuation ; elle n'est utilisée qu'en l'absence de saut de ligne dans la fenêtre.
- `minChunkChars = 2250` évite des segments minuscules mais peut, sur un texte sans séparateur dans la seconde moitié de la fenêtre, conduire à une coupe brute plutôt qu'à un séparateur précoce (choix déterministe, documenté).
- La détection de vide utilise `content.trim()` (espaces, tabulations, sauts de ligne, BOM `﻿`).

## 12. Non-régressions

`NONREG-01..` de test-v105 verts ; `stage-retrieval.js` et `paths.js` byte-identiques à v1.0.4 ; fonctions de checkpoint de `run-store.js` byte-identiques ; `panel-sufficiency.js`, `professional-selection.js`, `stage-professionals.js` inchangés depuis v1.0.5 (diff vide) ; `SCREENING-EVIDENCE-NORMALIZATION-v1`, `RETRY_ONLY_INVALID_ITEMS`, `PANEL-SUFFICIENCY-v2`, budget guard, run stop : inchangés (diff vide, tests dédiés verts).

## 13. Intégrité des lots gelés et de la base

- MONO-01 / MONO-09 / MONO-10 / MONO-11 : sceaux vérifiés, **0 divergence**, zips canoniques identiques (I1, RUN-SAFETY-19).
- MONOLITH-v1.0.5 : dossier non modifié (`git status` vide sur le chemin), zip canonique `c6eae8afb03c66963194427bb30bb49b2697b9ca236dcdd8b83bf7f1bb39b7a1` inchangé, `.sha256` inchangé.
- Aucun secret dans le paquet (secret-scan 0) ; `.env.local` non touché ; aucun contenu de document journalisé (le serveur ne journalise que nom, octets, nombre de segments).

## 14. Verdict technique

**MONOLITH-v1.0.6 — GELABLE** (candidat). Le gel appartient au propriétaire / à l'audit indépendant.
