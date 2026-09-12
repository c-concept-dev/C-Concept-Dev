# DEEP-RESIDUAL-502-ATTRIBUTION-01 — preuves

| Fichier | Contenu |
| --- | --- |
| `attribution.json` | les 20 tours, un par un : complétude du journal, rôles, fournisseur, classes d'échec, classification des 502 |
| `runs.jsonl` | les tours côté client |

**Aucun code de production modifié.** Aucune instrumentation ajoutée au produit : le journal est
celui que le Worker émettait déjà. Ce qui a changé est la façon de le CAPTURER — une session
`wrangler tail` courte par tour au lieu d'une seule session longue.

C'était le point : le lot précédent avait perdu 9 invocations sur 20 et n'avait donc pas pu attribuer
son 502. Ici la complétude est vérifiée tour par tour, et vaut **20/20**.

Métadonnées seulement. Aucun matériau brut. Aucune valeur de secret.
