# Rapport de tests

## Freeze initial

- Branche `main`, HEAD `e53ad6a92bbb30a7ced742f6a75a3c1a463284a6`.
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

Résultat ciblé avant validation finale : **15/15 PASS**.

## Validation finale

- `npm test` : **40/40 PASS** (25 historiques + 15 dédiés).
- `npm run guard` : **PASS**.
- `git diff --check` : **PASS**.
- Hashes Rapide, Architecte, Atelier, FORMATS, VERROUS, ARCH_SYSTEM et ARCH_SCHEMA : **inchangés**.
- Aucun fichier produit historique modifié.
- Aucun appel réseau et aucun déploiement.

Le HEAD final observé est `e0aa735` (`origin/main`) : les deux commits intermédiaires contiennent exclusivement le schéma v1 puis le builder shadow isolé. Les validations finales ont été exécutées sur ce HEAD.
