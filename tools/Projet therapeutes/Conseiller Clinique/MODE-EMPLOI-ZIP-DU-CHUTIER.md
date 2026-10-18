# Le zip des images, une par étape — pour monter dans iMovie

Une page. Tout se passe sur votre Mac : **aucun fichier ne part nulle part**, et l'export du zip
n'ouvre aucune connexion — c'est mesuré, pas promis.

> **UNE PRÉCISION SUR « SANS CONNEXION ».** L'**écriture du zip** n'appelle rien : mesuré, zéro
> requête pendant l'export. Mais la **page**, elle, est une copie de l'application, et au
> chargement elle appelle encore son Worker (deux requêtes) et les polices de Google. Le **rendu**
> redemande ces polices. Conséquence pratique : **le banc a besoin du réseau pour s'ouvrir et pour
> rendre**, pas pour fabriquer le zip. Hors ligne, les images sortiraient avec d'autres polices —
> et ce n'est pas ce que le lot 2 a mesuré.

> **L'enregistreur de voix n'est pas concerné.** Il vit dans un autre dossier, sur le **port
> 8765**, et ce travail ne l'a pas touché. Le chutier, lui, est sur le **port 8766**. Vous pouvez
> faire tourner les deux en même temps.

---

## 1 · Lancer le banc

### Le plus simple : double-cliquez

**`~/Documents/Studio-Clinique-Outils/Ouvrir le chutier.command`**

Une fenêtre de Terminal s'ouvre, démarre le serveur et ouvre la page. Laissez-la ouverte pendant
que vous travaillez ; pour arrêter, pressez **ctrl + C** dedans ou fermez-la. Si un serveur
tourne déjà sur le port 8766, le lanceur ouvre simplement la page.

> **Pourquoi pas un fichier unique à double-clic, sans serveur ?** Je l'ai mesuré avant de
> renoncer. En `file://`, le navigateur **refuse** d'importer le module de SnapDOM — l'origine
> d'un fichier local est « null », et il refuse même de le lire pour le contourner : **le rendu
> des images est impossible**. Et hors ligne, **aucune des 30 polices du Studio ne charge** :
> mesuré, **0 image sur 19 reste identique** (les hauteurs ne bougent pas, le poids change de
> 3,8 %). Les images ne seraient plus celles dont le lot 2 a mesuré la fidélité. Le lanceur garde
> le rendu exact et retire seulement le Terminal de votre chemin.

### À la main, si vous préférez

Une seule commande, à coller dans le Terminal :

```bash
cd ~/Documents/GitHub/C-Concept-Dev-lot2-images-wt/"tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8766 --bind 127.0.0.1
```

Puis, dans Safari ou Chrome :

```
http://127.0.0.1:8766/banc-chutier/chutier.html?atelier-local=1
```

Pour arrêter le serveur ensuite : revenez au Terminal et pressez **ctrl + C**.

---

## 2 · La chaîne complète, du Studio au zip

| Étape | Ce que vous faites | Ce que vous devez voir |
|---|---|---|
| 1 | Dans le Studio **en ligne**, ouvrez votre présentation et exportez-la : le fichier qui finit par **`-interactive.html`** | C'est bien le `.html`, **pas** le `.json`. Le `.json` sert à la narration (étape 4). |
| 2 | Dans le banc, **« Charger un export HTML »**, choisissez ce fichier | L'état annonce la présentation, son nombre de diapositives et son **nombre d'étapes**. |
| 3 | Choisissez le **format** (JPEG haute qualité, ou PNG), puis **« Rendre les images »** | Les vignettes défilent, une par étape. Le relevé donne le temps, le poids, et dit si une diapositive **déborde**. |
| 4 | *(facultatif)* **« Charger un JSON »** avec le document de travail qui porte votre **narration rédigée** | Le zip contiendra alors `narration.txt` et deux colonnes de plus dans l'index. |
| 5 | **« Télécharger le zip des images »** | L'état compte les entrées écrites et le temps écoulé, puis annonce `zip écrit : …`. |

Le fichier arrive dans **Téléchargements**, nommé
`images-presentation-par-etape-AAAA-MM-JJ-HHMM.zip`. Deux exports de suite ne s'écrasent jamais :
le second prend un `-2`, le troisième un `-3`.

### Ce qu'il y a dedans

Un seul dossier, `images-presentation-par-etape/`, qui contient :

- **une image par étape**, nommée `01-1.jpg`, `01-2.jpg`, `02-1.jpg`… : le numéro de
  **diapositive** sur deux chiffres, un tiret, le numéro d'**étape**. Deux chiffres pour que le
  tri alphabétique soit le bon ordre, même au-delà de la dixième diapositive ;
- **`index.csv`** (point-virgule, UTF-8) : `fichier ; diapositive ; etape ;
  etapes_de_la_diapositive ; largeur_px ; hauteur_px ; octets ; coupe_px ; travelling`, et, si
  vous avez chargé la narration, `mots ; duree_estimee_s` (les mots divisés par 2,5 mots par
  seconde, la vitesse par défaut du cahier des charges) ;
- **`narration.txt`** seulement si une narration est chargée : un bloc par étape, introduit par
  le nom de l'image sans extension (`01-1`), puis votre texte **tel quel**. Sans narration
  chargée, ce fichier n'existe pas du tout — je préfère un fichier absent à un fichier vide qui
  se présenterait comme complet.

**Si quelque chose manque**, rien n'est téléchargé et l'état le dit, en nommant l'étape fautive.
Un zip incomplet qui aurait l'air complet serait pire que pas de zip.

---

## 3 · Monter dans iMovie

| Étape | Ce que vous faites |
|---|---|
| 1 | Double-cliquez le zip dans Téléchargements : le Finder crée le dossier `images-presentation-par-etape`. |
| 2 | Dans iMovie, créez un projet **Film**, puis faites glisser le **dossier** (ou sélectionnez toutes les images) dans la chronologie. |
| 3 | **Vérifiez l'ordre** : il doit suivre `01-1`, `01-2`, … `05-3`. Si iMovie trie autrement, triez par **nom** dans la fenêtre d'importation. |
| 4 | Réglez la **durée par image** : iMovie a un réglage de durée des photos dans ses préférences de projet, et chaque plan se rallonge aussi en tirant son bord dans la chronologie. |

**Deux points que je ne peux pas vous affirmer, parce que je ne les ai pas vus** — iMovie n'est
pas automatisable ici, et je ne décrirai pas un écran que je n'ai pas sous les yeux :

- **l'effet de mouvement sur les photos.** iMovie applique par défaut un lent zoom (connu sous le
  nom de « Ken Burns ») aux photos importées. Pour une diapositive de texte, ce mouvement est à
  peu près certainement indésirable : il fait bouger le texte et le coupe sur les bords. Cherchez
  le réglage de **recadrage** du plan sélectionné et choisissez l'option qui **n'ajoute aucun
  mouvement** (selon les versions : « Ajuster », « Recadrer pour remplir », ou le bouton de
  recadrage dans la barre au-dessus de l'aperçu). **À vérifier par vous**, et dites-moi quel
  libellé votre version emploie : je l'écrirai ici.
- **l'image haute du questionnaire.** Elle est livrée **à sa hauteur entière**, jamais recadrée :
  sur la fixture d'essai, 1920 × 1455 px pour un cadre de 1080, soit **375 px à faire défiler**,
  et l'index le dit dans sa colonne `travelling`. Ce que iMovie en fera — l'ajuster en laissant
  des bandes, ou la remplir en coupant — **est à vérifier par vous**. Si elle est coupée, deux
  voies : faire défiler l'image à la main dans iMovie, ou revenir au banc et **scinder** cette
  diapositive en plusieurs étapes.

---

## 4 · Ce que je vous demande de noter

1. **Le nombre d'images** du zip contre le nombre d'étapes annoncé par le banc : ils doivent être
   égaux.
2. **L'ordre** dans la chronologie d'iMovie, après importation.
3. Pour l'image haute : **ce que iMovie en fait**, et le libellé exact du réglage de recadrage de
   votre version.
4. **Le poids du zip** et le temps qu'a pris l'export, pour votre présentation réelle (sur une
   fixture de 19 étapes : 1,8 Mo en JPEG, 4,1 Mo en PNG, quelques dizaines de millisecondes pour
   l'enveloppe une fois les images rendues).
5. Si **JPEG haute qualité** vous suffit, ou s'il faut passer au **PNG** : c'est une question
   d'œil, et elle n'appartient qu'à vous.

---

## 5 · Ce que ce zip n'est pas

Ce n'est **pas** le lot 4. Le lot 4 fera le film dans le Studio, avec la bande rythmo et vos
repères comme points de synchronisation (R10). Ce zip est le pont jusque-là : il vous permet de
monter dans iMovie dès maintenant, avec vos images découpées par étape et votre narration à côté.

L'outil provisoire `planche-vers-zip.py` **n'est plus nécessaire** : le banc livre le zip
lui-même. Vous pouvez le garder par prudence, mais il part de la « planche à l'œil », dont les
images sont **réencodées en JPEG 0,82** : celles du zip du banc sont celles du rendu, à la
qualité que vous avez choisie.
