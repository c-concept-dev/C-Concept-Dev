# DEEP-PROVIDER-ROUTING-FINAL-01 — preuves

Le lot applique au runtime une décision déjà prise : **FAST = GROQ ONLY, DEEP = ANTHROPIC ONLY**.
Il ne compare aucun fournisseur, ne modifie aucun prompt, n'optimise aucune latence.

| Fichier | Contenu |
| --- | --- |
| `routing-static.json` | ordres résolus par plan, épinglages refusés, empreintes des fichiers |
| `runtime-runs.jsonl` | 10 tours Deep réels, **sans aucun épinglage de mesure** |
| `runtime-providers.json` | attribution fournisseur par rôle, extraite de `wrangler tail --format=json` |
| `failure-control.json` | trois scénarios de panne Anthropic en harnais contrôlé |
| `summary.json` | compteurs du lot |

Aucune instrumentation n'a été ajoutée : l'attribution par rôle vient des événements
`provider_ha_attempt` / `provider_ha_success` que le Worker émettait déjà.

Aucun incident réel n'a été provoqué chez le fournisseur : le contrôle de panne remplace `fetch`
localement. Matériau synthétique uniquement. Aucune valeur de secret n'apparaît dans ces fichiers —
seulement des noms de binding.
