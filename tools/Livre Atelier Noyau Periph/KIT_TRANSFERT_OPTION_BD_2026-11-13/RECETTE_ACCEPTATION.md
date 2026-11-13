# Recette d’acceptation

## A. Tests automatiques déterministes

### A01 — Compatibilité source

Un projet `.ldv.json` valide peut créer un projet BD sans modifier la session source.

### A02 — Aller-retour

`saveProject(restoreProject(saveProject(project)))` conserve strictement les données métier.

### A03 — Source obligatoire

Une case sans référence narrative est refusée.

### A04 — Reconstruction non résolue

Une case `UNRESOLVED` ne peut pas passer à `APPROVED`.

### A05 — Consentement

Une photographie identifiable sans autorisation enregistrée ne peut pas devenir une référence d’image.

### A06 — Texte séparé

Toute requête d’image finale contient l’instruction d’absence de texte, de bulle, de logo et de filigrane.

### A07 — Obsolescence

Modifier la description validée d’un personnage marque les images dépendantes `STALE`.

### A08 — Remplacement local

Remplacer l’image d’une case ne modifie ni les autres cases ni leurs versions.

### A09 — Adaptateur simulé

Le même identifiant de fixture retourne le même résultat de test.

### A10 — Aucun secret

Aucune clé ni jeton n’apparaît dans le shell, le projet sauvegardé ou le PDF.

### A11 — Texte débordant

Une bulle trop petite déclenche un état bloquant avant export.

### A12 — Empreintes

Chaque image exportée possède une empreinte SHA-256 et une provenance.

## B. Recette navigateur

1. Charger un `.ldv.json` fictif.
2. Choisir un chapitre.
3. Créer l’adaptation.
4. Corriger une scène.
5. Créer deux personnages et un lieu.
6. Valider la bible.
7. Générer un storyboard de 8 pages minimum.
8. Déplacer une case.
9. Modifier un dialogue sans invalider l’image.
10. Utiliser le mode manuel ChatGPT.
11. Importer une image.
12. Rejeter puis remplacer cette image.
13. Ajouter les bulles.
14. Sauvegarder, fermer, rouvrir et restaurer.
15. Exporter le PDF.

## C. Contrôle visuel humain

Grille par personnage :

- visage reconnaissable d’une case à l’autre ;
- âge cohérent avec la période ;
- morphologie cohérente ;
- coiffure et accessoires maîtrisés ;
- vêtements plausibles ;
- aucune fusion entre deux personnages ;
- expressions adaptées à la scène ;
- aucune caractéristique sensible inventée.

Grille par page :

- ordre de lecture évident ;
- variation des plans ;
- lisibilité des bulles ;
- rythme ;
- absence de répétition mécanique ;
- pas de texte coupé ;
- pas d’image déformée ;
- aucun artefact visible à 100 % ;
- continuité gauche/droite et positions ;
- fidélité au passage source.

## D. Critères du pilote

- 100 % des tests A01 à A12 verts.
- Parcours navigateur complet.
- 8 à 12 pages.
- 0 case sans source.
- 0 texte rasterisé dans les images finales.
- 0 référence identifiable sans consentement.
- 0 secret dans les livrables.
- Validation humaine signée de la bible, du storyboard et du PDF.

## E. Ce que la recette ne prouve pas

- qualité artistique universelle ;
- ressemblance parfaite ;
- absence de biais ;
- valeur commerciale ;
- satisfaction du sujet ;
- conformité juridique dans tous les pays.

Ces points nécessitent une évaluation humaine et, pour la publication, une revue juridique adaptée.

