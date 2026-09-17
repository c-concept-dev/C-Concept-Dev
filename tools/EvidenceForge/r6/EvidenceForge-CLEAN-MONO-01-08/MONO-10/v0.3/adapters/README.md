# Adaptateurs de cas — HORS NOYAU GÉNÉRIQUE

Le noyau `core/` ne connaît **aucun cas d'application**, **aucun registre
d'identité**, **aucune discipline**, **aucun nom de phase métier**.

| Fichier | Rôle | Ce que le noyau refuse de faire seul |
|---|---|---|
| `case-phase-adapter.js` | Traduit `downstreamUseAuthorized` vers le vocabulaire d'un cas | Nommer une phase métier |
| `declared-authority-identity-adapter.js` | Déclare l'autorité émettrice et la famille d'un identifiant | Déduire l'émetteur d'un identifiant — un préfixe d'URL ne démontre aucune indépendance |

Le composant qui **ferme la porte du panel** n'est pas ici : il est livré dans
`core/panel-gated-adapter.js`, parce qu'il fait partie de l'exécution et doit
être consommable hors tests (fermeture A-01).

Une mission qui n'est pas ce cas ne doit jamais rencontrer ce vocabulaire.
Une table d'autorités absente produit `INDEPENDENCE_UNKNOWN`, jamais
`INDEPENDENT`.
