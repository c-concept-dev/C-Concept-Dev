# EF-01C1-v0.2-r2 — Rapport de non-régression

timestamp_utc = 2026-09-07T19:25:15Z
node = v24.11.1

## Lots gelés — inchangés

| Lot | Vérification |
| --- | --- |
| `EF-01C1-v0.2-r1` | MANIFEST 12/12 OK — **immuable, jamais touché** |
| `EF-01B-v0.2-r1` | MANIFEST 12/12 OK |
| `EF-01B-v0.2-r2` | MANIFEST 12/12 OK |
| R6 `ef-orch-runcontract-v0.1.js` | SHA-256 inchangé |
| MONO-01→08 | aucun fichier modifié |
| kit opérateur r1.3 | SHA256SUMS 45/45 OK |

## Artefacts de la mission réelle — inchangés

| Artefact | Vérification |
| --- | --- |
| `runcontract-confirmed.json` | SHA-256 inchangé |
| `resolver-output.json` | SHA-256 inchangé |
| evidence resolver | SHA256SUMS 6/6 OK |

**Aucun artefact de mission n'a été remplacé. Aucune tentative planner réelle
pendant ce lot.**

## Périmètre réel du diff r1 → r2

**Modifiés (5 fichiers `lib/` + CHANGELOG)** : `lib/parser.js`,
`lib/real-llm-call.js`, `lib/executor.js`, `lib/evidence-writer.js`,
`lib/errors.js`, `CHANGELOG.md`.

**Byte-identiques à r1** : `prompts/ef01c1-planner-prompt-v0.2-r1.js`,
`lib/hash.js`, `CONTRACT.md`, `PROMPT-REGISTRY.md`, `README.md`, et la
suite de tests r1 (renommée `test/test-ef01c1-v0.2-r2-compat.js`, contenu
**inchangé**, pour être rejouée telle quelle contre r2).

**Ajoutés** : `test/test-ef01c1-v0.2-r2.js`,
`IMPLEMENTATION-REPORT-EF-01C1-v0.2-r2.md`,
`FINDINGS-CLOSURE-EF-01C1-v0.2-r2.md`, `DIFF-r1-to-r2.patch`,
`NON-REGRESSION-EF-01C1-v0.2-r2.md`, `MANIFEST.json`, `SHA256SUMS.txt`.

## Tests

| Suite | Résultat |
| --- | --- |
| Banc ciblé r2 (F-C1-R2-01→04) | **50/50 PASS** |
| Suite r1 rejouée contre r2 (F-01→F-07) | **22/22 PASS** |

Aucun ancien échec n'a été transformé en skip : la suite r1 est exécutée
**telle quelle**, contenu byte-identique.

## Réseau / provider / secrets

REAL_NETWORK_CALLS = 0
REAL_PROVIDER_CALLS = 0
REAL_LLM_CALLS = 0

Les deux bancs sont LOCAL_CONTROLLED : le Gateway est un double de test qui
compte ses appels, aucune URL réelle n'est jointe. Aucun `.env`, aucune clé,
aucune valeur de secret dans le lot. Les deux réponses provider perdues avant ce
lot **n'ont pas été reconstituées ni inventées**.
