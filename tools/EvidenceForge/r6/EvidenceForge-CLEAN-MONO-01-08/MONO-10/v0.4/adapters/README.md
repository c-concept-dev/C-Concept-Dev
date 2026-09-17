# Adaptateurs de cas — HORS NOYAU GÉNÉRIQUE

Le noyau `core/` ne connaît **aucun** cas d'application, registre d'identité,
discipline, fournisseur ou nom de phase métier.

| Fichier | Rôle | Ce que le noyau refuse de faire seul |
|---|---|---|
| `case-phase-adapter.js` | Traduit `downstreamUseAuthorized` vers le vocabulaire d'un cas | Nommer une phase métier |
| `declared-authority-identity-adapter.js` | Déclare l'autorité émettrice et la provenance d'un identifiant | Deviner l'émetteur — un préfixe d'URL ne démontre aucune indépendance |

Le composant qui **ferme la porte du panel** n'est pas ici : il est livré dans
`core/panel-gated-adapter.js`, parce qu'il fait partie de l'exécution et doit
être consommable hors tests.

Un libellé d'autorité déclaré ici ne vaut rien tant qu'il n'est pas **résolu**
dans le registre d'autorités extérieur. Une table absente produit
`INDEPENDENCE_UNKNOWN`, jamais `INDEPENDENT`.
