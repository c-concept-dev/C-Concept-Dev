# Changelog - Liénothèque UI Kit v1.1

Périmètre : corrections demandées uniquement. Les 11 familles et comportements de démonstration sont conservés.

## Fichier par fichier

- `assets/logo.svg` : remplacement des cadres creux par deux formes pleines, sommet arrière incliné, réserve en L ; deux chemins sans contour, viewBox carré.
- `assets/emblem-light.svg`, `assets/emblem-dark.svg` : exports identiques en cuivre sombre #875638 et cuivre clair #B88B62.
- `assets/logo-horizontal-light.svg`, `assets/logo-horizontal-dark.svg` : emblème et mot Liénothèque, Source Serif 4 convertie en contours ; graphite/ivoire.
- `assets/logo-reference-emblem.png` : recadrage de la planche pour comparer les mêmes proportions ; la planche d’origine reste inchangée.
- `catalogue.html` : nouveau logo inline en tête ; section Logo avec planche et SVG 512/64/32/16 px ; variables inline préfixées et bandeaux reliés aux jetons de collections. Les autres sections et libellés de démonstration sont conservés.
- `tokens.json` : version 3.0.1 ; dark.progress_track #3C4046 ; light.disabled_text #5A5E63 ; ajouts des jetons de shell hybride, titres, voile, ombre et impression.
- `tokens.css` : préfixe --ln- intégral ; valeurs générées depuis tokens.json ; mêmes corrections ; variables d’impression et de l’hybride centralisées.
- `components.css` : références --ln- ; suppression de toutes les valeurs hexadécimales ; voile fondé sur les jetons via color-mix ; couleurs de shell/impression/ombre/bandeaux par variables ; WOFF2 prioritaires avec TTF de repli ; styles limités à la nouvelle section Logo. Progression 3 px et outline 1 px conservés, pourcentage existant vérifié.
- `assets/fonts/Inter-latin-ext.woff2`, `assets/fonts/SourceSerif4-latin-ext.woff2` : nouvelles fontes variables en WOFF2, sous-ensemble latin étendu, ponctuation et espaces français. TTF et licences OFL conservés sans modification.
- `Catalogue-UI.pdf` : nouvelle génération depuis le catalogue v1.1, avec section Logo. Le catalogue HTML est la référence interactive et pour les tailles CSS exactes.
- `README.md`, `CATALOGUE.md` : version et description des exports du logo mises à jour, sans changement de contrat métier.
- `VERIFICATION.md` : contrôles statiques, contrastes trois thèmes, comparaison du logo, contrôles des polices, non-régression et limites.
- `components.js`, `assets/icons.svg`, `assets/background.png`, `assets/logo-reference.png` : inchangés.

Aucune certification d’accessibilité globale n’est revendiquée. Voir VERIFICATION.md.
