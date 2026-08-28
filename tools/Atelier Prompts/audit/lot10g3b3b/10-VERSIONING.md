# Versioning ExecutionContract

## Version actuelle

`EXECUTION_CONTRACT_VERSION = "1.0"`.

## Politique

- `1.x` : ajout compatible, uniquement si les lecteurs 1.0 peuvent ignorer ou traiter explicitement le changement. Le schéma 1.0 étant fermé, une nouvelle propriété exige un nouveau schéma mineur et un lecteur déclaré compatible.
- `2.0` : suppression, renommage, changement de sens, nouvel invariant incompatible ou changement de type.

## Lecture

Le validateur 1.0 refuse toute autre version et tout champ inattendu. Cette discipline évite une acceptation silencieuse. Une migration future devra être explicite, pure, testée en round-trip et préserver `original_request`, IDs et provenance.

## Comparabilité

La représentation canonique trie récursivement les clés avant SHA-256. L'ordre des clés JSON ne change donc pas le hash ; une modification de valeur le change.

