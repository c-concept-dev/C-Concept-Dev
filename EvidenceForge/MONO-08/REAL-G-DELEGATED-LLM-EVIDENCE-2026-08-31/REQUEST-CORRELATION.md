# Corrélation du request-id rapporté

```text
request-id (EvidenceForge, rapporté par l'opérateur) = preflight-2786c9915e24759a
```

Valeur non sensible (identifiant de corrélation, jamais un secret — CDC §5.3), peut
être citée sans restriction.

## Recherche de corrélation locale

```text
$ grep -rl "preflight-2786c9915e24759a" .    (racine du depot)
(0 resultat)
```

Aucun fichier de ce dépôt, aucun artefact de cette session, ne contient de trace
correspondant à ce request-id. Il n'existe donc, dans cette session, **aucun moyen de
corréler** ce request-id à :

- une entrée de log Worker (`wrangler tail` / Cloudflare dashboard) ;
- une capture brute de la réponse HTTP 200 elle-même ;
- un `RunState`/`NodeState`/`ArtifactRecord` produit par ce run.

Ce n'est pas une preuve d'absence de réalité — c'est une preuve d'**absence
d'artefact accessible depuis cette session** pour la vérifier. Voir
`LLM-REALITY-LEVEL2.md` pour la procédure permettant de fournir cet artefact.

## Ce que Claude peut affirmer sans réserve

Le format du request-id (`preflight-` + hex aléatoire) correspond exactement à celui
généré par `buildLlmWorkerProviderDelegated()` dans `lib/preflight.js` :

```js
const requestId = "preflight-" + crypto.randomBytes(8).toString("hex");
```

— cohérent avec une génération réelle par ce code, mais cette cohérence de format ne
constitue pas à elle seule une preuve de corrélation Worker-side (n'importe quelle
exécution de ce code, y compris une exécution honnête mais non vérifiée par Claude,
produirait un format identique).
