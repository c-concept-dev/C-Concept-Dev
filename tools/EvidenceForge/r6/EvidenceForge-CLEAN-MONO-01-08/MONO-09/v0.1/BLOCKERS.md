# MONO-09 v0.1 — Blocage structurel non levable additivement

## `SCIENTIFIC_VALIDITY_HARD_CODED_FALSE`

`testMode: true`, `scientificValidity: false` et `humanProfessionalValidation: false`
sont des **littéraux codés en dur** dans les modules gelés, jamais calculés :

| Module gelé | Ligne |
|---|---|
| `ef-02d1d2-orchestrator-v1.js` | 70 |
| `ef-02d3-coverage-panel-v1.js` | 297, 299 |
| `ef-02e-twin-builder-v1.js` | 236 |
| `ef-03a-review-schema-v1.js` | 120 |
| `ef-03b-review-runner-v1.js` | 187, 234 |
| `ef-03c-aggregation-v1.js` | 221 |
| `ef-03d-stability-contradiction-v1.js` | 265 |
| `ef-04a-unified-report-v1.js` | 159 |

Deux verrous supplémentaires :

- `ef-orch-ef01-output-contracts-v0.1.js` l.143 —
  `if (qs.scientificValidity === true) return false;` : le contrat **rejette
  activement** toute sortie prétendant `scientificValidity: true`.
- `MONO-01/test/test_t01_17_no_epistemic_additions.js` — test gelé qui **interdit**
  d'introduire une affectation `scientificValidity = true` dans la nouvelle couche.

### Conséquence

Même un run professionnel parfaitement peuplé — panel réel, jumeaux construits,
revues produites — resterait classé `TECHNICAL_SUCCESS_SCIENTIFICALLY_PARTIAL`.
`CAN_REAL_PIPELINE_EMIT_SCIENTIFIC_VALIDITY_TRUE_TODAY = NO`.

### Ce que ce lot ne fait pas

Il ne force aucun booléen. Passer ces drapeaux à `true` sans satisfaire un
mécanisme réel serait exactement la falsification que le test gelé `t01_17`
existe pour empêcher.

## `HUMAN_PROFESSIONAL_VALIDATION_UNDEFINED`

`humanProfessionalValidation` n'est adossé à **aucun mécanisme** : pas de
validateur, pas d'artefact, pas de gate, aucun consommateur. C'est un marqueur
d'honnêteté figé à `false`, pas une porte franchissable.

Le contrat ne définit ni **qui** doit valider, ni **quoi** (identités ? panel ?
jumeaux ? corpus ?), ni **quand**, ni sous quelle forme d'artefact. Ces quatre
questions restent ouvertes et relèvent d'une décision du propriétaire produit,
pas d'une implémentation.

Aucun acte humain n'est fabriqué ici.

## Décision requise

Lever le premier blocage suppose de modifier MONO-01 — c'est-à-dire de sortir
un lot gelé de son gel. Cette décision n'appartient pas à un lot additif.
