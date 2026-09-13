# Runtime ADN navigateur autonome

Atelier doit rester utilisable depuis un HTML autonome, notamment en `file://`.

Les modules ESM `core/adn/*.js` ne sont donc pas chargés comme dépendances externes par le HTML.

`tools/build-adn-browser-runtime.mjs` génère :

`core/adn/browser-runtime.generated.js`

Le bundle est ensuite embarqué inline dans le HTML produit.

Le fichier généré porte un SHA-256 des sources afin de permettre de vérifier qu'il correspond aux modules de référence.

Règle : ne jamais modifier `browser-runtime.generated.js` à la main ; régénérer depuis les modules.
