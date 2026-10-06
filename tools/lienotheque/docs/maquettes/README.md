# Maquettes — version administrateur

Cinq écrans de la version administrateur, en 1600 × 1000, thème clair. Ce sont des **maquettes
illustratives** : comme toutes les maquettes du projet, elles ne font pas foi contre le CDC
(`CLAUDE.md`, « Sources qui font foi »). Ce qu'elles fixent, c'est la composition et le ton ;
les mesures restent celles de la charte et du kit.

| Fichier | Écran |
|---|---|
| `png/1-creer-une-bibliotheque.png` | Assistant de création, étape 2 sur 4 — le contenu |
| `png/2-organisation.png` | Classement proposé d'après les fichiers, et ce qu'il donnera |
| `png/3-depot-et-traitement.png` | Dépôt et file de traitement, avec pause et alerte |
| `png/4-maniere-de-lire.png` | Éditeur visuel de la manière de lire, et sa palette de zones |
| `png/5-recherche.png` | Recherche (⌘K), résultats groupés et aperçu |

## Elles ne redessinent rien

C'est le point de la méthode : les maquettes emploient les matériaux du dépôt, elles ne les
imitent pas. Changer un jeton change la maquette au prochain tirage.

- **Couleurs** : les variables `--ln-*` produites par `@lienotheque/jetons` (v3.0.1). Aucune
  valeur en dur dans `maquettes.css`, même règle que pour un composant (règle 3).
- **Polices** : les WOFF2 de `../ui-kit/assets/fonts/`. Inter partout ; Source Serif 4 pour le
  seul « Bonjour » de l'écran 5.
- **Logo** : `../ui-kit/assets/logo-horizontal-light.svg`, posé tel quel.
- **Icônes** : les tracés de `apps/app/src/composants/Icone.tsx` — ceux du kit v1.1 et le
  complément de l'application. Quatre de plus (étiquette, dossier, réglages, cadre) sont dessinés
  dans la même grille, 24 sur 24, trait de 1,6, bouts arrondis, et groupés à part dans le HTML.

Conséquence utile : les écrans se portent en composants React presque directement, les classes
reprenant celles de `apps/app/src/styles/base.css` et des composants.

## Refaire le tirage

```
pnpm build
pnpm --filter @lienotheque/app exec node ../../docs/maquettes/tirer.mjs
```

`pnpm build` est nécessaire parce que la feuille des jetons est produite, donc absente du dépôt
(`dist/` est ignoré). Le script refuse de tirer si un écran ne fait pas exactement 1600 × 1000.

## Choix à connaître

- **Les pastilles de fenêtre sont neutres**, en pierre, et non rouge-jaune-vert : la charte
  n'admet aucun vert, et il n'avait pas à entrer par la porte du système.
- **Un seul bouton cuivre plein par écran** (UX-09) : Continuer, Valider l'organisation,
  Parcourir mes fichiers, Essayer sur 10 pages. La recherche n'en a aucun — son action
  principale est la touche Entrée.
- **Casse normale partout** : la hiérarchie se fait par la graisse et la couleur, jamais par des
  capitales.
- **Un seul mot par notion, celui du schéma** : « élément », « page », « piste ». Jamais
  « piste » et « enregistrement » pour la même chose. « Audio » reste employé, mais pour une
  autre notion : un *type de contenu*, comme « Vidéos » ou « Images ».
- **Les types de zones de l'écran 4 viennent du schéma de la bibliothèque**, pas du code : c'est
  ce que dit la palette, et c'est la règle CLA-01 rendue visible à l'écran.

## Ce dossier n'est pas publié

`generate-index.js` saute `tools/lienotheque/` en entier : rien de ce projet n'entre dans l'index
du site, et ce dossier pas davantage. Le déclencheur de `generate-index.yml` l'ignore en plus, pour
qu'un changement de maquette ne lance pas d'exécution inutile. `maquettes.html` est une source de
travail, pas une page du site.
