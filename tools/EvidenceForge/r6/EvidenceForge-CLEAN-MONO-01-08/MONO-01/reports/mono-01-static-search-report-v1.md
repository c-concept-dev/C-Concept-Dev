# MONO-01 — Rapport de recherche statique

Recherche exhaustive (CDC section 14) sur l'ensemble de MONO-01
(`lib/`, `ports/`, `index.js`, `contracts/`, `registry/mono-01-port-registry-v1.json`,
`test/`, `package.json`) — hors `dependencies/` (copies bytewise du code gelé,
hors périmètre de cette recherche : leur contenu est celui déjà audité par
MONO-00) et hors `registry/mono-00-frozen-baseline-registry-v1.json` (document
de traçabilité MONO-00, cite légitimement l'historique gelé, y compris JMJS).

Chaque terme est classé selon sa nature, jamais simplement compté (CDC : «
Chaque occurrence doit être classée »).

| Terme | Occurrences hors `test/` | Classification |
|---|---|---|
| JMJS | 0 | absent |
| S01 | 0 | absent |
| S02 | 0 | absent |
| DIMS | 0 | absent |
| d4 | 0 | absent |
| d5 | 0 | absent |
| truth | 1 (`ports/aggregation-port.js:8`) | `comment_prohibition` — « N'ajoute jamais vote/majorité/prestige/truth score » |
| prestige | 2 (`aggregation-port.js:8`, `eligibility-panel-port.js:114`) | `comment_prohibition` |
| majority | 0 | absent |
| vote | 2 (mêmes lignes que prestige) | `comment_prohibition` |
| consensus | 1 (`contracts/integration-result-v1.json:17`) | `comment_prohibition` — invariant documenté : aucun champ `scientifically_valid`/`expert_validated`/`trusted`/`true`/`false_consensus` |
| fuzzy | 0 | absent |
| similarity | 0 | absent |
| repair | 0 | absent |
| scientificValidity | 0 (comme affectation `=true`) | absent — le terme n'apparaît que dans `test/test_t01_17_*.js`, qui le recherche |
| professional opinion | 0 | absent |
| experts validate | 0 | absent |

Toutes les occurrences trouvées hors `test/` sont des **commentaires
d'interdiction explicite** (`comment_prohibition`), jamais du code
fonctionnel : elles documentent l'invariant plutôt que de le violer. Les
occurrences dans `test/` sont les recherches elles-mêmes (T01-16, T01-17) et
leurs messages d'assertion — attendues et nécessaires pour vérifier
mécaniquement cette même absence.

**Aucune occurrence n'est classée `functional_violation` ou `functional_code`.**

## Recherche complémentaire — mentions de "clone" comme concept produit

Par cohérence avec l'invariant #9 de MONO-00 (« le mot “clone” est interdit
comme concept produit »), une recherche complémentaire a été menée :

```
grep -rniE "\bclone\b" lib ports index.js contracts registry/mono-01-port-registry-v1.json
```

Aucune occurrence trouvée. Le slug technique historique `clone-proxy` (Worker
Cloudflare, dette technique tolérée) n'apparaît nulle part dans MONO-01 — ce
lot ne touche pas à l'infrastructure réseau.

## Exécution

Ce rapport a été produit à partir de :
- `test/test_t01_16_no_pilot_hardcoding.js` (2/2 PASS)
- `test/test_t01_17_no_epistemic_additions.js` (3/3 PASS)
- une recherche `grep` manuelle complémentaire (JMJS et « clone ») couvrant
  les fichiers hors du périmètre automatisé des deux tests (contracts/,
  registry/mono-01-port-registry-v1.json, package.json)
