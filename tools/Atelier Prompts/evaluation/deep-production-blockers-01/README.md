# DEEP-PRODUCTION-BLOCKERS-01 — preuves

Deux blockers nommés, fermés sur mesure. Un troisième défaut observé au passage, remonté et non
corrigé.

| Fichier | Contenu |
| --- | --- |
| `output-ceiling.json` | preuve du défaut 2048, campagne de calibration, campagne de contrôle, justification de la marge |
| `control-runs.jsonl` | les 26 tours réels du contrôle, sans épinglage |
| `paired-latency.json` | décomposition par étage et jetons de sortie, par cas |
| `comparability.json` | Capacity Gate contre routage final, axe par axe |
| `latency-delta.json` | classification du delta, preuve principale, causes écartées |
| `observed-defect.json` | le 502 : chaîne observée, analyse, preuve d'indépendance du plafond |

Aucune instrumentation ajoutée : tout vient des événements que le Worker émettait déjà. Matériau
synthétique uniquement. Aucune valeur de secret — seuls des noms de binding.

La campagne de calibration a relevé temporairement le plafond à 8192 pour **mesurer** la sortie
réelle de l'Arbitre, puis l'a ramené à la valeur retenue. Ce plafond temporaire n'existe plus.
