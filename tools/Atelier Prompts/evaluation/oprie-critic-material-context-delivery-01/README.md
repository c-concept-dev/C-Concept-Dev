# OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01 — preuves

Livraison de `material_context` au chemin Critique réellement emprunté par la production.

| Fichier | Contenu |
| --- | --- |
| `runs.jsonl` | 30 tours identiques, joints aux traces Worker (provenance déclarée, contexte livré au Critique) |
| `controls.jsonl` | contrôle `deep_content_available = false` |
| `summary.json` | correctif, preuve de livraison, avant/après, classement des vetos |

Matériau synthétique uniquement (`NUMERO_DOSSIER = ZX-4821`). Aucun contenu brut n'atteint le
Critique ni l'Arbitre, et aucun n'est journalisé : la trace ne porte que deux booléens.
