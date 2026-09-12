# OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01 — preuves

| Fichier | Contenu |
| --- | --- |
| `classification.json` | le défaut, l'asymétrie mesurée avant/après, la taxonomie citée, le correctif, les empreintes |
| `replay-runs.jsonl` | 20 tours Deep réels sans épinglage, sur la population du défaut |
| `targeted-runs.jsonl` | 12 tours ciblés, journal complet, chasse au 502 résiduel |
| `replay-measurement.json` | compteurs des deux campagnes et statut du résidu non attribué |

Aucune instrumentation ajoutée. Matériau synthétique uniquement. Aucune valeur de secret.

`wrangler tail` n'a livré que 11 des 20 invocations de la première campagne : c'est dit là où ça
compte, et c'est la raison pour laquelle un 502 reste non attribué plutôt qu'expliqué.
