# Catalogue UI Liénothèque v1.1

Référence : jetons v3.0.1.



## Boutons et actions

Repos, survol, focus, chargement, désactivé. Un seul bouton principal par écran produit.

Sélecteur de démonstration : `#buttons`.



## Champs et formulaires

Libellé permanent, aide reliée au champ et erreur explicite.

Sélecteur de démonstration : `#fields`.



## Sélection et réglages

Contrôles natifs et interrupteur accessible au clavier.

Sélecteur de démonstration : `#choices`.



## Navigation et menus

Onglets à flèches clavier, menu de commandes, accordéon natif.

Sélecteur de démonstration : `#navigation`.



## Cartes de bibliothèque et reprise

Inter pour les noms et compteurs. Cours vidéo utilise le noyer.

Sélecteur de démonstration : `#cards`.



## Badges, états et alertes

La couleur ne porte jamais seule l’information.

Sélecteur de démonstration : `#status`.



## Progression et dépôt

Trait de 3 px, pourcentage textuel et sélection alternative au glisser-déposer.

Sélecteur de démonstration : `#progress`.



## Tableaux, tri et pagination

Tableau sémantique ; pagination réelle sur des données de démonstration.

Sélecteur de démonstration : `#table`.



## Fenêtres et notifications

Dialogues natifs : focus contenu, Échap, retour au déclencheur.

Sélecteur de démonstration : `#overlays`.



## États vides et chargement

Indiquer la prochaine action et conserver le contexte.

Sélecteur de démonstration : `#empty`.



## Lecteurs et relations

Commandes de démonstration uniquement ; brancher les sources autorisées à l’intégration.

Sélecteur de démonstration : `#media`.



## Contrat d’intégration

Les classes CSS sont préfixées par leur contexte de kit ; isoler les styles dans le produit pour éviter les collisions. Les démonstrations ne déclenchent aucun traitement réel. Brancher les ports métier du CDC, les validations, autorisations et sources médias dans le produit.

Les jetons proviennent de la jetons v3.0.1 ; le thème hybride conserve les cartes claires et les panneaux de titre graphite opaques.

Logo SVG : deux formes pleines reconstruites d’après la planche, comparaison documentée dans la section Logo et VERIFICATION.md. Les quatre exports clair/sombre, emblème/horizontal, sont fournis ; le mot est converti en tracés. Icônes SVG originales au trait, de style cohérent ; aucune dépendance Lucide.

Catalogue : bouton principal unique. Exemples secondaires pour les autres actions. La notification est une région live ; les dialogues utilisent les mécanismes natifs du navigateur.

## Accessibilité et limites

Focus visible, contrôles natifs, labels, erreurs associées, tabs à flèches/Home/End, fermeture des dialogues par Échap, pagination et tri sémantiques, option fichiers alternative au dépôt, mouvement réduit.

Une revue humaine avec lecteur d’écran et sur les navigateurs cibles reste nécessaire. Le kit ne constitue pas une certification WCAG.

## Utilisation

Décompresser le ZIP, puis ouvrir catalogue.html. Aucun serveur ni compte requis. Copier tokens.css, components.css, components.js et assets dans le produit ; extraire les composants utilisés.

Les noms et données sont des exemples génériques. Le catalogue doit conserver des libellés de démonstration pour éviter de confondre ses actions avec celles du produit.

## Fichiers

catalogue.html, components.css, components.js, tokens.css, tokens.json, assets/icons.svg, assets/logo.svg, assets/background.png, assets/logo-reference.png, assets/fonts/.

Les polices sont accompagnées de leurs licences SIL OFL incluses ; les polices de repli restent Arial et Georgia.

Section Logo supplémentaire : comparaison de référence ; les 11 familles de composants initiales restent conservées. Fontes WOFF2 locales prioritaires, TTF de repli, licences OFL jointes.
