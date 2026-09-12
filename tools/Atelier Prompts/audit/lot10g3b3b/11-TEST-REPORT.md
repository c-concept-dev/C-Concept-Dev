# Rapport de tests

## Freeze initial

- Branche `main`, HEAD `96373bd18e56ac9c33ab802e37d2c7e8008c4cfa`.
- Dépôt propre.
- Tests historiques : 25/25 PASS.
- Garde : PASS.
- `git diff --check` : PASS.

## Suites dédiées

| Fichier | Couverture |
|---|---|
| `execution-contract-schema.test.mjs` | version, fermeture, cinq propriétés, verrous, technique 9 |
| `execution-contract-invariants.test.mjs` | traçabilité, statuts, clarification, éthique, quantité, verrou |
| `execution-contract-mapping.test.mjs` | 50 cas, projections Rapide/Architecte, quantités |
| `execution-contract-no-hardcoding.test.mjs` | scan et mutations structurelles |
| `execution-contract-roundtrip.test.mjs` | sérialisation, parsing, canonicalisation, SHA-256 |
| `execution-contract-adn-27.test.mjs` | preuve explicite 5 + 9 + 13, vue ADN dérivée, vue d'audit expurgée |

Résultat ciblé avant validation finale : **19/19 PASS**.

## Validation finale

- `npm test` : **44/44 PASS** (25 historiques + 19 dédiés).
- `npm run guard` : **PASS**.
- `git diff --check` : **PASS**.
- Hashes Rapide, Architecte, Atelier, FORMATS, VERROUS, ARCH_SYSTEM et ARCH_SCHEMA : **inchangés**.
- Aucun fichier produit historique modifié.
- Aucun appel réseau et aucun déploiement.

Les validations finales ont été exécutées dans l'arbre de travail issu du freeze ci-dessus. Les changements restent confinés à l'évaluation, l'audit et les tests du lot.
