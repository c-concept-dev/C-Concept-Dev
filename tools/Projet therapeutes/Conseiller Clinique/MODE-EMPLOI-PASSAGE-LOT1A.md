# Passage humain du lot 1a — écrire une narration, sans connexion

Dix minutes, sans mot de passe, sans réseau. Tout reste sur votre disque.

---

## Avant de commencer

Vous avez besoin d'un export autonome de votre Présentation (le fichier
`…-interactive.html` que produit « Exporter → présentation interactive »). Le vôtre est déjà en
place :

```
/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique/banc-chutier/entrees/
```

Vous pouvez en déposer d'autres dans ce dossier — il est ignoré par git, donc rien de ce qui s'y
trouve n'entre jamais dans le dépôt.

---

## Étape 1 — démarrer le serveur local

Ouvrez le Terminal et collez cette ligne **entière** :

```
cd "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8765 --bind 127.0.0.1
```

**Ce que vous devez voir :** `Serving HTTP on 127.0.0.1 port 8765 …`
Laissez cette fenêtre ouverte : c'est le serveur. Pour l'arrêter à la fin, `Ctrl-C`.

> Un serveur est nécessaire — un module JavaScript ne se charge pas depuis `file://`. Ce serveur
> n'écoute que sur votre machine (`--bind 127.0.0.1`) et ne sort pas sur le réseau.

---

## Étape 2 — ouvrir la page, AVEC le paramètre

Dans Safari, cette adresse **exacte**, paramètre compris :

```
http://127.0.0.1:8765/banc-chutier/chutier.html?atelier-local=1
```

Le `?atelier-local=1` n'est pas décoratif : **sans lui, vous retomberez sur l'écran de
connexion.** C'est voulu — voir « Ce que ce réglage ne permet pas », plus bas.

**Ce que vous devez voir :**
- le panneau du chutier, à droite ou en haut selon la fenêtre ;
- en bas à gauche, un bandeau sombre : « Mode local sans connexion — montage et export de
  fichiers seulement. Enregistrer, Mes créations et la génération ne fonctionnent pas. » ;
- **pas** d'écran de connexion.

Si une petite fenêtre dit « Clé d'accès non configurée », cliquez OK : c'est normal et sans
conséquence ici. Aucune clé n'est nécessaire pour ce qui suit.

---

## Étape 3 — charger votre export

Dans le panneau, cliquez **« Charger un export HTML »** et choisissez votre fichier
`…-interactive.html` dans `banc-chutier/entrees/`.

**Ce que vous devez voir**, dans la zone de texte du panneau :

```
Export lu : …-interactive.html
  5 diapositives, 19 étapes
  5 images embarquées, reprises telles quelles — aucun appel au Worker
  narration : AUCUNE — un export n'en porte jamais, par construction (lot 1a).
```

C'est normal qu'il n'y ait aucune narration : **un export n'en porte jamais.** C'est la règle du
lot 1a, et c'est ce que vous allez créer maintenant.

---

## Étape 4 — ouvrir dans l'espace de travail, puis réduire le panneau

1. Cliquez **« Ouvrir dans l'espace de travail »**.
   **Vous devez voir :** « Ouvert dans l'espace de travail : « *titre de votre présentation* ». »
2. Cliquez **« Réduire le panneau »**.
   **Vous devez voir :** l'éditeur de Studio Clinique, vos diapositives, et en bas à droite un
   bouton **« Rouvrir le chutier »**.

> C'est exactement ici que vous tombiez sur l'écran de connexion. Avec `?atelier-local=1`, il ne
> s'affiche pas. Si vous le voyez quand même : vous avez ouvert l'adresse sans le paramètre —
> revenez à l'étape 2.

---

## Étape 5 — écrire une narration

1. **Cliquez sur un bloc** d'une diapositive (un titre, un paragraphe, un encadré).
2. Le panneau d'édition s'ouvre. Faites-le défiler jusqu'à **« Narration »**.

**Vous devez voir :**
- le libellé de l'étape, par exemple *Diapositive « L'argent : le grand tabou du couple »,
  étape 1 sur 4.* ;
- une zone de texte avec l'invite *Ce que vous diriez pendant cette étape.* ;
- sous la zone, *Aucun mot pour l'instant.*

3. Écrivez votre texte. Le compte de mots et la durée estimée se mettent à jour en direct.
4. Recommencez sur d'autres étapes.

---

## Étape 6 — enregistrer votre travail sur le disque

**Le bouton « Enregistrer » de l'application ne fonctionne pas ici** (il passe par le Worker).
Utilisez celui du chutier :

1. Cliquez **« Rouvrir le chutier »** (en bas à droite).
2. Cliquez **« Télécharger le document de travail »**.

**Vous devez voir :** `Téléchargé : document-de-travail-….json` suivi du nombre d'étapes narrées.
Le fichier part dans vos Téléchargements. **C'est le seul fichier qui porte vos narrations** —
gardez-le.

---

## Étape 7 — vérifier que ça tient (le passage du lot 1a)

1. Rechargez la page (l'adresse **avec** le paramètre).
2. Cliquez **« Charger un JSON »** et choisissez le `document-de-travail-….json` que vous venez
   de télécharger.
3. « Ouvrir dans l'espace de travail », « Réduire le panneau », cliquez le même bloc.

**Vous devez voir** votre narration, telle que vous l'aviez écrite. C'est la preuve que le lot 1a
tient de bout en bout : écrire → enregistrer → recharger → retrouver.

4. Dernier point : **exportez** (« Exporter → présentation interactive ») et vérifiez que la
   narration n'y est **pas**. C'est voulu : un export est pour le public, la narration est pour
   vous.

---

## Ce que ce réglage ne permet pas

Le paramètre `?atelier-local=1` **cesse de masquer** l'espace de travail. Il ne déverrouille
rien : aucune clé n'est posée, aucun appel au serveur n'est modifié. Donc **tout ce qui passe par
le Worker échoue exactement comme avant** :

| | |
|---|---|
| **Enregistrer** / **Enregistrer sous** | ✗ ne fonctionne pas — utilisez « Télécharger le document de travail » |
| **Mes créations** (la bibliothèque) | ✗ vide, et le restera |
| **Générer** un document, réécrire, développer, vérifier les sources | ✗ ne fonctionne pas |
| **Images Pexels** non déjà embarquées | ✗ ne se chargent pas |
| Monter, réordonner, éditer les blocs | ✓ |
| Écrire des narrations | ✓ |
| Télécharger le document de travail (JSON) | ✓ |
| Exporter (HTML autonome, PDF) | ✓ |
| Le chutier visuel (images par étape) | ✓ |

Les images de votre présentation s'affichent parce qu'un export autonome **porte ses images en
clair** : elles viennent du fichier, pas du réseau.

---

## Pourquoi c'est sans risque

L'écran de connexion est **un rideau, pas une serrure**. N'importe qui l'enlèverait en trois
secondes avec les outils de développement du navigateur ; il sert à ce qu'on ne tombe pas par
hasard dans l'application sur un ordinateur partagé. La vraie serrure, c'est la clé d'API du
Worker et son contrôle d'origine — **ni l'une ni l'autre n'est touchée**, et le Worker n'a pas
été modifié.

La porte locale exige **deux** conditions à la fois : l'adresse doit être `127.0.0.1` ou
`localhost` **et** porter `atelier-local`. Sur `c-concept-dev.github.io`, le paramètre ne fait
rien du tout — c'est vérifié par un test, lui-même vérifié par trois mutations qui le font
échouer quand on retire l'une des conditions.
