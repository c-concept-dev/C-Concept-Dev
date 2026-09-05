# OPRIE-MATERIAL-PROVENANCE-CONFORMANCE-01 — preuves

Mesure de répétabilité à contrat et code constants. Aucun correctif pendant la campagne.

| Fichier | Contenu |
| --- | --- |
| `runs.jsonl` | 30 tours, un objet JSON par ligne, joints aux observations du journal Worker |
| `summary.json` | configuration figée, populations, taux, taux conditionnels, taxonomie |
| `controls.jsonl` | contrôles `explicit_user_statement` et « sans contenu » |

**Matériau synthétique uniquement** — `NUMERO_DOSSIER = ZX-4821`. Aucune donnée sensible, aucun
contenu brut journalisé : l'instrumentation n'émet que des étiquettes de provenance et des noms de
champs.

Le cas est **identique à chaque tour** : même demande, même historique vide, même contexte, même
contenu, même fournisseur, même modèle, `temperature: 0`, même code, mêmes prompts.
