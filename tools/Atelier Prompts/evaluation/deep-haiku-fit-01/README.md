# DEEP-HAIKU-FIT-01 — preuves

| Fichier | Contenu |
| --- | --- |
| `summary.json` | configuration figée, verdict, comptes sémantiques, protections, vérifications |
| `cases.json` | les 8 cas, leur baseline Sonnet déjà payée, ce que Haiku a rendu, la classe de divergence |
| `divergences.json` | les 8 divergences, classées NON_MATERIAL / MATERIAL / CRITICAL, avec la preuve et le contrat violé |
| `latency.json` | latence totale et par étage, populations gouvernée et interrompue séparées |
| `cout-jetons.json` | jetons par rôle, tarifs relus le jour de la mesure, coût réel du banc et coût par tour |
| `runs.jsonl` | les 14 tours effectués — métadonnées seules : état, rôle en défaut, plafond, jetons, stop_reason, clés racine réellement produites |

**Une seule variable a changé** : le champ `model` de la requête sortante, remplacé dans un
intercepteur de `fetch` propre au banc. Prompts, schémas, plafonds (`ROLE_MAX_OUTPUT_UNITS` = 4096,
Critique global 2048, batch 1600), timeouts, validateurs, orchestrateur, OPRIE et routage :
inchangés. **Aucun fichier de production modifié. Aucun cache ajouté. Aucun prompt adapté à Haiku.**

**Aucun tour Sonnet n'a été rejoué** (§23) : les baselines viennent de
`deep-anthropic-acceptance-01`, `oprie-arbiter-material-context-delivery-01` et
`deep-production-blockers-01`, toutes mesurées sur `claude-sonnet-4-6`.

Matériau synthétique uniquement (ZX-4821, déjà présent dans le dépôt). Aucun contenu de rôle
intégral n'est journalisé : `runs.jsonl` ne porte que des étiquettes et des compteurs. Aucune valeur
de secret.

`ALL_HAIKU_VERDICT = ALL_HAIKU_FAIL_MULTIPLE_ROLES` · `FAILING_ROLE = critic, arbiter, analyst`
