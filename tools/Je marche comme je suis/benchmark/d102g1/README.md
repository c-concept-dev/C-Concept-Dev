# D102G1 — Benchmark déterministe avant modèle embarqué

Ce dossier contient l'infrastructure du benchmark D102G1.

## Règle de provenance

Le corpus de décision GO/NO-GO ne doit pas être fabriqué par un LLM.
Les entrées éligibles au gate sont :

- `beta-user` — formulation réellement saisie par un bêta-testeur ;
- `realistic-human` — formulation humaine réellement entendue/observée puis anonymisée ;
- `manual-rewrite` — reformulation manuelle humaine d'un cas réel.

Les entrées `project-spec` et `synthetic` peuvent servir aux tests techniques mais sont exclues du gate GO/NO-GO.

## Fichiers

- `corpus-real.jsonl` : corpus humain à enrichir progressivement ;
- `corpus-spec.jsonl` : petits cas de calibration issus du cahier des charges et des tests existants ;
- `entry.example.json` : exemple documenté d'une entrée ;
- `scripts/d102g1-benchmark.mjs` : runner et calcul des métriques par dimension.

## Exécution

```bash
node scripts/d102g1-benchmark.mjs
```

Le script mesure séparément :

- latéralité ;
- zone corporelle ;
- déclencheurs terrain positifs ;
- négations terrain ;
- durée explicite ;
- besoin de pause assise ;
- contradiction avec `pain` ;
- contradiction avec les limitations existantes ;
- détection d'incertitude ;
- faux positifs / absence d'invention.

## Gate

Le script ne prononce jamais un GO/NO-GO avec un corpus insuffisant.
Par défaut, il exige au moins 100 entrées humaines éligibles avant de considérer le gate exploitable.
Un score global n'est jamais utilisé pour masquer une faiblesse d'une dimension.
