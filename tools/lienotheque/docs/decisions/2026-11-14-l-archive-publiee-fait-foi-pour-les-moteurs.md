# L'archive publiée fait foi, et on ne fabrique des moteurs que volontairement

**Décision de Christophe le 14 novembre 2026**, mot pour mot :

> « Lot 0u, décision de Christophe : l'archive publiée fait foi. Le workflow
> `lienotheque-tauri.yml` construit et éprouve le paquet avec les moteurs de l'archive épinglée
> (même programme que l'application), et non avec une fabrication du jour. On ne fabrique de
> nouveaux moteurs que volontairement, avec une nouvelle archive publiée et épinglée. »

## Ce qui l'a provoquée

La course **43489507798**, la première verte de ce workflow, a publié ses mesures du CDC après
treize jours de silence. L'une d'elles est fausse au sens du § 4.8 :

| critère publié | ce qu'il dit | ce que l'application embarque |
|---|---|---|
| Sidecar Tesseract embarqué | **tesseract 5.5.4** (fra) | **5.5.1** / leptonica 1.86.0 |

La cause est dans l'enchaînement des étapes : le workflow lance `brew install tesseract`, puis
`preparer-moteurs.py`, qui — c'est écrit dans son propre en-tête — reprend **Tesseract de
l'installation du système**. Sur le coureur, Homebrew livre 5.5.4. La mesure décrit donc la CI, et
non le produit livré.

C'est **exactement la dette D1**, que `lienotheque-ci.yml` a déjà payée. Son en-tête le dit :

> « Un contrôle de lecture vert sur un autre programme ne dit rien du produit. »

Sa **voie 3** déploie l'archive épinglée par son empreinte dans `fixtures/moteurs-de-lecture.json`,
la vérifie, et met `moteurs/bin` **devant** le PATH. Le remède existe donc, éprouvé, dans le même
dépôt — il n'avait simplement pas été porté sur le second workflow.

## Ce que la décision tranche, et ce qu'elle ferme

**L'archive est la référence, pas la machine qui construit.** Un coureur dont Homebrew avance d'une
version ne doit pas changer ce que la CI éprouve. Une nouvelle version de Tesseract entre dans ce
projet par un geste : on fabrique les moteurs, on les éprouve, on publie une archive, on épingle
son empreinte, et **on l'inscrit**. Jamais parce qu'un dépôt amont a bougé pendant la nuit.

C'est la même forme que la décision du 13 novembre sur `rust-toolchain.toml`, à un jour
d'intervalle et sur un autre outil : **ce avec quoi on éprouve ne change que volontairement**.
Deux fois en deux jours, un verdict de CI a dépendu d'une version que personne n'avait choisie.

## Le piège à ne pas tomber en l'appliquant — il recouvrirait le code sous essai

**L'archive contient un dossier `chaine`.** C'est écrit dans son propre descriptif : « bin
(tesseract, node, sf et leurs binaires annexes), lib, tessdata, siegfried, licences, **chaine** ».
Or cette archive est celle du **9 novembre**, et les sources de la chaîne ont changé depuis — la
dernière fois le **12 novembre**, commit `5652daee`, qui relâche le contrat `ZoneLue`.

Déployer l'archive **sans rien d'autre** remplacerait donc `moteurs/chaine/moteur.js` par celui
d'il y a cinq jours, et l'épreuve « le moteur embarqué lit vraiment un document » prouverait du
**code d'avant** tout en affichant une course verte. C'est la forme la plus dangereuse de ce dépôt :
un vert qui ne porte pas sur ce qu'on croit.

**L'ordre des étapes n'est donc pas indifférent** :

1. déployer l'archive épinglée, et vérifier son empreinte — elle apporte les **programmes qui
   lisent** (tesseract, leptonica, node, sf) ;
2. **puis** `preparer-moteur-node.py`, qui reconstruit la **chaîne** depuis les sources du commit
   sous essai, et recouvre le `chaine` de l'archive.

Autrement dit : **l'archive fait foi pour les programmes, le commit fait foi pour la chaîne.**

Ce point décidait ce que l'épreuve du paquet prouve, et il a donc été soumis plutôt que supposé.
**Christophe l'a tranché le 14 novembre 2026**, dans les mêmes termes :

> « Lecture confirmée : l'archive fait foi pour les programmes qui lisent (tesseract, siegfried,
> bibliothèques, tessdata) ; le commit fait foi pour la chaîne (`preparer-moteur-node.py` depuis
> les sources du commit sous essai). Ordre : archive d'abord, chaîne ensuite. »

Sa liste recouvre **exactement** le `contenu` déclaré de l'archive épinglée — `bin`, `lib`,
`tessdata`, `siegfried` — **moins `chaine`**, le seul dossier que l'archive porte et qui ne fait
pas foi. Ce n'est donc plus une lecture : c'est la règle, et elle est vérifiable sur le manifeste.

## Ce que l'application de cette décision devra encore trancher

`preparer-moteurs.py` ne disparaît pas du workflow : son `--autotest`, qui éprouve le lecteur de
table d'imports PE **sans Windows**, ne fabrique rien et reste utile. C'est l'appel **sans
argument**, celui qui fabrique, qui cède la place au déploiement de l'archive. Et il faudra
s'assurer qu'il ne reste **pas deux Tesseract joignables** sans qu'on sache lequel répond :
`brew install tesseract` n'a plus de raison d'être sur ce workflow dès que l'archive est déployée.

Le travail de ce lot est donc ce choix et cette vérification, pas le câblage, qui est de la
recopie depuis `lienotheque-ci.yml`.
