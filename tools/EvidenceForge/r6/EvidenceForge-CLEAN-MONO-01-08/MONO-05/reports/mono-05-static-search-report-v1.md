# MONO-05 — Rapport de recherche statique

## Termes recherchés (CDC section 35)

JMJS, "Je marche comme je suis", S01, S02, DIMS, d4, d5, truthScore, vote,
majority, prestige, consensus, expertScore, fuzzy, repair,
scientificValidity=true, innerHTML, localStorage, sessionStorage,
Authorization, Bearer, sk-, apiKey, secret, password.

## Classification

- `innerHTML` : une seule occurrence, dans un COMMENTAIRE de `app/client/app.js`
  énonçant explicitement la règle à ne jamais violer — jamais une
  affectation réelle (vérifié par un test dédié qui ignore le texte après
  `//`, T05-28s).
- `Authorization`/`Bearer` : uniquement dans `contracts/operator-api-v1.json`,
  dans la liste `neverExposed` documentant ce qui n'est jamais exposé —
  jamais une valeur réelle.
- `secret` : uniquement en commentaires explicatifs et dans le nom de la
  fonction d'import `createStaticSecretProvider` (un identifiant de code,
  jamais une valeur de secret elle-même).
- `JMJS`, "Je marche comme je suis", `S01`, `S02`, `DIMS`, `d4`, `d5`,
  `truthScore`, `vote`, `majority`, `prestige`, `consensus`, `expertScore`,
  `fuzzy`, `repair`, `scientificValidity=true`, `localStorage`,
  `sessionStorage`, `sk-`, `apiKey`, `password` : **aucune occurrence**
  nulle part dans `app/`, `contracts/`, `reports/`, `README.md`,
  `CDC-TRACE.md`, `package.json`.

## Conclusion

Aucune occurrence fonctionnelle bloquante. Vérifié par recherche manuelle
exhaustive après tous les changements, et par les tests dédiés
`test_t05_static_search.js` (6/6 PASS).
