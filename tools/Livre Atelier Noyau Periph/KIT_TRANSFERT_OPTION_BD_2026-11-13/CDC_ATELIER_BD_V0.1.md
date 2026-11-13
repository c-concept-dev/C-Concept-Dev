# Cahier des charges — Atelier Livre de Vie, option BD

Version : 0.1 — proposition de travail  
Date : 13 novembre 2026  
Statut : à valider avant implémentation complète

## 1. Finalité

L’option BD transforme une matière autobiographique romancée en bande dessinée ou roman graphique, tout en conservant :

- la vérité intime du sujet ;
- la mécanique psychologique attestée ;
- la distinction entre faits, reconstruction plausible et invention interdite ;
- la Boussole souveraine du noyau Auteur ;
- les contrôles du noyau Éditeur ;
- la décision humaine à chaque étape irréversible.

L’option BD est un périphérique du noyau existant. Elle ne remplace ni le noyau Auteur ni le noyau Éditeur.

## 2. Utilisateurs

- Auteur ou biographe préparant l’adaptation.
- Sujet autobiographique validant son image et les scènes sensibles.
- Éditeur contrôlant le rythme, la lisibilité et la fidélité.
- Illustrateur humain pouvant remplacer ou retoucher les images générées.

## 3. Périmètre du pilote

Le premier lot porte sur un chapitre déjà produit et validé :

- 8 à 12 pages ;
- 2 à 6 cases par page ;
- 1 à 3 personnages principaux ;
- 1 style visuel unique ;
- export PDF ;
- mode manuel ChatGPT et mode image simulé ;
- aucun traitement en masse d’un livre entier.

## 4. Hors périmètre du pilote

- génération automatique d’un livre entier sans validation ;
- animation ou vidéo ;
- doublage audio ;
- publication commerciale automatisée ;
- impression à la demande ;
- clonage exact d’un style d’artiste vivant ;
- reconnaissance faciale ;
- entraînement d’un modèle personnalisé ;
- création automatique de scènes constitutives absentes de la matière.

## 5. Principes non négociables

### 5.1 Fidélité autobiographique

Chaque case doit être reliée à une source : passage du chapitre, extrait du transcript, reconstruction validée ou élément purement décoratif.

Une image ne peut pas introduire silencieusement :

- une personne inexistante ;
- un événement nouveau ;
- un lieu contradictoire ;
- une relation non attestée ;
- une émotion explicitement refusée par le sujet ;
- un symbole qui change le sens de la scène.

### 5.2 Validation humaine

Trois validations sont obligatoires :

1. bible visuelle ;
2. storyboard ;
3. planche finale.

Aucune génération en série n’est lancée avant validation de l’étape précédente.

### 5.3 Texte séparé de l’image

Les images sont générées sans bulles, sans récitatifs, sans titre et sans onomatopée. Les textes sont composés ensuite dans une couche HTML/SVG éditable.

### 5.4 Secrets

Aucune clé API dans un fichier HTML, JavaScript distribué, sauvegarde de projet ou export. L’appel automatisé passe par un serveur ou worker contrôlé. Le mode manuel ne nécessite aucune clé.

### 5.5 Réversibilité

Chaque image conserve :

- son prompt ;
- ses références ;
- sa version ;
- son statut ;
- son historique de remplacement ;
- la raison d’un rejet.

### 5.6 Abstention

Si la matière ne permet pas de représenter une scène sans inventer son sens, le système doit demander une décision humaine ou proposer une case non figurative clairement identifiée.

## 6. Chaîne fonctionnelle

### Phase A — Import du projet

- Charger un `.ldv.json` compatible ou la session courante.
- Choisir un chapitre validé.
- Figé : le texte source, son empreinte et sa version.

### Phase B — Adaptation scénaristique

Produire :

- intention du chapitre ;
- scènes visuelles ;
- personnages présents ;
- lieux ;
- objets significatifs ;
- dialogues et récitatifs candidats ;
- éléments non représentables ou sensibles.

### Phase C — Bible visuelle

Pour chaque personnage :

- identifiant stable ;
- tranche d’âge par période ;
- morphologie et proportions ;
- visage et coiffure ;
- vêtements ;
- gestes récurrents ;
- éléments à préserver ;
- éléments à ne jamais ajouter ;
- références autorisées ;
- planche de référence validée.

La bible comprend aussi les lieux, objets récurrents, palette, ligne, texture, éclairage et cadrage.

### Phase D — Storyboard

Le découpage contient :

- pages ;
- cases ;
- taille relative de chaque case ;
- type de plan ;
- angle ;
- action visible ;
- personnage et expression ;
- décor ;
- texte hors image ;
- source narrative ;
- niveau de sensibilité ;
- statut de validation.

### Phase E — Génération d’images

Deux modes sont obligatoires :

#### Mode manuel ChatGPT

- afficher le prompt prêt à copier ;
- afficher les images de référence à fournir ;
- permettre d’importer le résultat ;
- enregistrer le prompt, le fichier et la validation.

#### Mode automatisé OpenAI

- appeler un adaptateur `imageCall` injecté par le shell ;
- utiliser un serveur/worker pour protéger la clé ;
- accepter plusieurs images de référence ;
- permettre génération et édition ;
- conserver les identifiants et métadonnées nécessaires aux itérations.

Le noyau BD ne connaît ni le fournisseur ni le transport réseau.

### Phase F — Contrôle éditorial

Contrôles automatiques :

- présence des personnages requis ;
- références de personnage associées ;
- absence de texte demandé dans l’image ;
- formats et dimensions ;
- statut de consentement ;
- couverture des sources ;
- cohérence des identifiants et versions.

Contrôles humains :

- ressemblance acceptable ;
- cohérence d’âge ;
- vêtements et époque ;
- continuité spatiale ;
- respect du ton ;
- absence d’élément factuellement trompeur ;
- lisibilité de la page.

### Phase G — Lettrage et mise en page

- bulles vectorielles ;
- récitatifs vectoriels ;
- ordre de lecture explicite ;
- zones de sécurité ;
- édition du texte sans régénération ;
- adaptation automatique limitée, avec alerte si le texte ne tient pas ;
- aperçu page, double page et impression.

### Phase H — Export

Pilote :

- PDF A4 ou format album paramétrable ;
- archive projet complète ;
- dossier d’images et manifeste.

Étapes ultérieures :

- EPUB 3 à mise en page fixe ;
- CBZ ;
- fichier imprimeur avec fonds perdus et profil colorimétrique documenté.

## 7. Interface attendue

Navigation principale :

1. Source
2. Scénario
3. Bible visuelle
4. Storyboard
5. Images
6. Lettrage
7. Contrôle
8. Export

Chaque écran indique :

- ce qui est validé ;
- ce qui est incomplet ;
- ce qui sera envoyé à un service externe ;
- le coût estimatif si disponible ;
- l’action suivante ;
- la possibilité de revenir en arrière.

## 8. Persistance

Format cible : `.ldvbd.json` pour le pilote, puis archive `.ldvbd` lorsque les images seront embarquées.

Le projet doit être versionné et migrable. Les images peuvent être :

- embarquées pour une archive autonome ;
- référencées localement pendant le travail ;
- exportées avec un manifeste final.

Une sauvegarde ne doit jamais perdre le lien entre une case, son image, son prompt et sa source narrative.

## 9. Accessibilité

- texte alternatif pour chaque image ;
- ordre de lecture enregistré ;
- contraste suffisant ;
- taille de police paramétrable ;
- export textuel parallèle du scénario ;
- aucune information essentielle portée uniquement par la couleur.

## 10. Performance et coûts

- génération case par case ;
- prévisualisations avant qualité finale ;
- cache par empreinte du prompt et des références ;
- régénération locale d’une case ;
- aucune régénération automatique de toutes les pages après une petite correction ;
- budget de génération visible et confirmable.

## 11. Terminé quand — pilote

Le pilote est terminé lorsque :

- les tests déterministes sont verts ;
- le projet se sauvegarde et se restaure sans perte ;
- un chapitre produit 8 à 12 pages ;
- chaque case possède une source narrative ;
- la bible visuelle est validée ;
- le storyboard est validé ;
- les images ne contiennent aucun texte généré ;
- les bulles sont modifiables ;
- une image peut être remplacée sans perdre la page ;
- le PDF final est visuellement contrôlé ;
- les données envoyées au service d’image sont affichées avant envoi ;
- aucun secret n’est présent dans les fichiers distribués ;
- une recette humaine conclut sur la continuité des personnages et la fidélité autobiographique.

