# Vérification - Kit UI Liénothèque v1.1

Référence : jetons v3.0.1. Contrôles réalisés le 3 octobre 2026.

## Contrôles statiques

Depuis le dossier du kit :

```sh
rg --pcre2 '#[0-9a-fA-F]{3,8}\b' components.css
rg --pcre2 -- '--(?!ln-)[a-zA-Z][a-zA-Z0-9-]*' tokens.css components.css catalogue.html
```

Résultat attendu et obtenu : aucune correspondance (code de sortie 1 pour rg). Un script Python a aussi vérifié les mêmes expressions, l’absence de double préfixe, les versions et les SVG. Toutes les couleurs de composants sont des variables : les valeurs sRGB appartiennent aux jetons.

## Contrastes calculés

Luminance relative sRGB et ratio (Lclair + 0,05)/(Lsombre + 0,05), sans arrondir avant calcul.

| Thème | Combinaison | Premier plan | Fond | Ratio |
| --- | --- | --- | --- | --- |
| light | Texte principal | #202327 | #FBF9F5 | 15.003:1 |
| light | Texte secondaire | #62666B | #FBF9F5 | 5.498:1 |
| light | Bouton principal | #FFFFFF | #875638 | 6.143:1 |
| light | Lien | #875638 | #FBF9F5 | 5.842:1 |
| light | Texte désactivé | #5A5E63 | #E6E0D7 | 4.978:1 |
| light | Progression | #B88B62 | #D8D0C5 | 1.990:1 |
| light | Liseré progression | #202327 | #D8D0C5 | 10.328:1 |
| dark | Texte principal | #F4F1EB | #202327 | 13.994:1 |
| dark | Texte secondaire | #B8B6B1 | #202327 | 7.786:1 |
| dark | Bouton principal | #202327 | #B88B62 | 5.189:1 |
| dark | Lien | #D2A77F | #202327 | 7.193:1 |
| dark | Texte désactivé | #B8B6B1 | #2B2F34 | 6.648:1 |
| dark | Progression | #B88B62 | #3C4046 | 3.430:1 |
| dark | Liseré progression | #B88B62 | #3C4046 | 3.430:1 |
| hybrid | Texte principal | #202327 | #FBF9F5 | 15.003:1 |
| hybrid | Texte secondaire | #62666B | #FBF9F5 | 5.498:1 |
| hybrid | Bouton principal | #FFFFFF | #875638 | 6.143:1 |
| hybrid | Lien | #875638 | #FBF9F5 | 5.842:1 |
| hybrid | Texte désactivé | #5A5E63 | #E6E0D7 | 4.978:1 |
| hybrid | Progression | #B88B62 | #D8D0C5 | 1.990:1 |
| hybrid | Liseré progression | #202327 | #D8D0C5 | 10.328:1 |
| hybrid | Titre sur panneau | #F4F1EB | #202327 | 13.994:1 |

Le cuivre clair sur pierre reste sous 3:1 en clair et hybride. Le catalogue affiche réellement « 60 % », plus un outline graphite de 1 px : lecture des styles calculés dans Chromium, hauteur 3 px et outline-width 1 px contrôlés sur les trois thèmes. La piste sombre #3C4046 dépasse 3:1 avec #B88B62. Les contrôles désactivés sont normalement exclus du seuil WCAG de contraste ; leur ratio est ici documenté sans prétendre certifier l’interface.

## Fidélité du logo

Deux chemins pleins et sans stroke : arrière à sommet incliné, avant arrondi, réserve en L. ViewBox carré 236 558 320 320. La planche n’est pas un master vectoriel ; les courbes ont été reconstruites à partir de ses coordonnées. Le catalogue montre la planche entière et son emblème recadré avec les SVG à 512, 64, 32 et 16 px. À 512 px, la ligne de comparaison défile horizontalement sur les écrans étroits.

Comparaison de silhouette : IoU 0.9773 (97.73 %), calculé à 320 × 320 sur le recadrage raster (236,558)-(556,878) et un rendu Chromium du SVG. Masque raster : R > 1,2G, G > 1,2B et R < 210 ; masque SVG : alpha > 127. Cette mesure dépend du seuil et ne prouve ni une identité exacte ni la reconnaissance à petite taille.

Les versions horizontales emploient Source Serif 4 (wght 600, opsz 32), composition HarfBuzz puis contours fontTools ; aucun texte SVG, image incorporée ou police externe nécessaire. L’emblème garde la même géométrie dans les cinq exports. Comparaison visuelle effectuée ; la réserve reste visible à 16 px dans Chromium, avec perte de finesse attendue.

## Polices

WOFF2 variables sous-ensembles : U+0020-024F, U+0300-036F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF et glyphes auxiliaires. Vérification des cmap pour accents français, œ/Œ, æ/Æ, « », U+202F, U+2009, U+00A0. TTF et licences OFL byte-identiques au ZIP initial. Chromium charge les polices locales ; aucune ressource distante.

## Non-régression

components.js byte-identique à v1 (SHA-256 ci-dessous). Les 11 familles et leurs identifiants sont conservés ; seule la section Logo est ajoutée. Tests Chromium : trois thèmes, dialogue création/notification, interrupteur, onglets via flèche, pagination, recherche, sélection de fichier, fermeture Échap, vue 390 px sans débordement horizontal de la page. Aucune erreur JavaScript observée. Les libellés de démonstration et attributs d’accessibilité existants sont conservés.

8d8809af6eed678f60286f9ac3c714af9c96dce9b63d6cebf4fa4ccdc576cf92

## Reste à contrôler

- Validation humaine finale de la fidélité du logo, notamment la composition du mot et les tailles 16/32 px sur écran Retina.
- Safari, Firefox, Windows et lecteur d’écran ; comportement color-mix, export PDF et glyphes sur ces plateformes.
- Accessibilité globale en contexte produit, états branchés aux services et contrastes sur recadrages photographiques réels.
- Le ratio des jetons n’est pas une certification WCAG ; les actions métier et lecteurs restent simulés.
