# Rapport MONO-06 — Frozen Regression Harness (baseline R3)

Généré : 2026-08-30T17:48:13.683Z

**STATUT GLOBAL : PASS**

## Totaux globaux

- MONO-00→05 : 785/785 — OK (MONO-05-R3 : 119, correctif MONO05-R3-REG-01)
- 7 lots historiques : 1223/1223 — OK (inchangé)

## Résultat par artefact

| Artefact | Statut | Manifest | Nested | Contrats | Tests | npm mode |
|---|---|---|---|---|---|---|
| MONO-00 | PASS | PASS | - | PASS | 27/27 | - |
| MONO-01 | PASS | PASS | - | PASS | 172/172 | none |
| MONO-02 | PASS | PASS | PASS | PASS | 334/334 | none |
| MONO-03 | PASS | PASS | PASS | PASS | 64/64 | none |
| MONO-04 | PASS | PASS | PASS | PASS | 69/69 | none |
| MONO-05 | PASS | PASS | PASS | PASS | 119/119 | ci |
| EF-ORCH | PASS | PASS | - | NO_JSON_CONTRACTS_FOUND | 842/842 | - |
| EF-PR-GEN-01 | PASS | SKIPPED_NO_MANIFEST | - | PASS | 105/105 | install |
| EF-02ABC | PASS | SKIPPED_NO_MANIFEST | - | PASS | 30/30 | install |
| EF-02D | PASS | PASS | - | PASS | 49/49 | none |
| EF-02E | PASS | PASS | - | PASS | 60/60 | none |
| EF-03 | PASS | PASS | - | PASS | 100/100 | none |
| EF-04 | PASS | PASS | - | PASS | 37/37 | none |

## Rebaseline R3 (résumé)

Régression UI corrigée dans MONO-05-R3 : `MONO05-R3-REG-01` (assuranceLevel jamais affiché, lu à la racine au lieu de report.lineage.lineageAssurance) — 13 tests ajoutés (8 API + 5 navigateur Playwright). MONO-02-R1/03-R1/04-R1 inchangés.