# Sécurité, droits et vie privée

## 1. Matière autobiographique

Un transcript peut contenir des données personnelles, familiales, médicales, judiciaires ou intimes. Avant tout transfert externe, l’interface doit afficher précisément :

- le texte envoyé ;
- les images envoyées ;
- le fournisseur destinataire ;
- la finalité ;
- la possibilité d’annuler.

## 2. Photographies de référence

Pour chaque photographie identifiable, enregistrer :

- propriétaire du fichier ;
- personne représentée ;
- autorisation d’utilisation ;
- périmètre de l’autorisation ;
- date ;
- éventuelles restrictions ;
- décision sur le transfert à un service externe.

Sans autorisation explicite, la photo ne doit pas être envoyée. Une description textuelle validée peut être utilisée à la place.

## 3. Mineurs et personnes vulnérables

Le pilote doit s’abstenir par défaut. Toute utilisation exige une décision humaine et une base juridique documentée.

## 4. Styles artistiques

Demander un langage visuel original ou des caractéristiques générales. Ne pas demander la copie exacte du style d’un artiste vivant.

## 5. Images générées

Les images doivent être contrôlées pour :

- ressemblance non autorisée ;
- stéréotype ;
- caractéristique sensible inventée ;
- anachronisme ;
- texte parasite ;
- logo ou marque ;
- contenu violent ou intime non demandé ;
- ambiguïté sur le statut documentaire.

## 6. Secrets et architecture

- jamais de clé dans le navigateur ;
- jamais de clé dans `.ldvbd.json` ;
- jamais de clé dans les logs ;
- worker séparé et restreint ;
- limitation de taille et de type des fichiers ;
- validation côté serveur ;
- journal sans contenu sensible par défaut.

## 7. Publication

Avant publication :

- validation finale du sujet ;
- autorisations des personnes identifiables ;
- contrôle des marques et œuvres visibles ;
- mentions sur les images générées si le contexte l’exige ;
- relecture juridique pour l’exploitation commerciale.

## 8. Données de test

Le développement initial utilise exclusivement un chapitre fictif. La matière réelle ne doit être utilisée qu’après validation du pipeline, consentement et explicitation du transfert externe.

