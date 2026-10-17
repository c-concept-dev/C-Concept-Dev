# Lot E2 — le chemin du texte : plan soumis avant tout code

> **État : soumis, pas approuvé.** Rien de ce document n'est engagé. Les mesures qui y figurent
> sont faites ; les durées annoncées sont des estimations tirées de ces mesures, et marquées
> comme telles.

## 1. Ce que l'essai des sept documents a établi

Sept documents déposés et traités en 776 s. Sept fois « terminé ». Et ceci :

| Document | Pages lues | Numéro imprimé lu | Passages |
|---|---|---|---|
| Le corps n'oublie rien | 614 | — | **0** |
| L'intelligence érotique | 316 | 16 / 316 | **0** |
| Reconsolidation thérapeutique | 298 | — | **0** |
| Thèse schémas | 108 | — | **0** |
| PPT N2 LM 2 diapos | 80 | — | **0** |
| DSM‑5 (natif) | **0** | — | **0** |
| Corvée de sexe (EPUB) | **0** | — | **0** |

Une page lue porte `index`, `rang`, `cote`, `statut`, `elements`. **Elle ne porte aucun texte.**

La chaîne bâtie aux lots 0 à D est une chaîne d'**ancres et de pistes** : elle repère un numéro
imprimé et des pastilles aux emplacements qu'une recette désigne, puis apparie les éléments aux
enregistrements (REC, ANC). C'est ce que les corpus F3 à F5 demandaient, et elle le fait bien.

Elle n'extrait pas de texte, et le vocabulaire des recettes ne sait pas le lui demander. Le
garde-fou du projet le dit sans ambiguïté : `manqueALaManiere` refuse toute manière de lire sans
zone d'élément — « Tracez d'abord la zone où se trouve le numéro d'élément. » Les quatre recettes
que j'avais écrites pour ce corpus ne déclaraient que `page_imprimee` ; `pnpm check` les a
rejetées, à raison. Je les ai retirées : elles décrivaient une chose que la chaîne ne sait pas
faire.

### L'hypothèse fausse que j'ai portée tout le lot E

J'ai tenu pour acquis que les **22 022 « passages »** de la bibliothèque actuelle correspondaient
aux **« lignes »** de cette chaîne. Les premières sont des morceaux de texte cherchables ; les
secondes sont des ancres repérées sur une image. Tout le plan de réimport reposait là‑dessus, et
je ne l'avais pas vérifié avant de l'écrire. La table `passage` et son index plein texte, bâtis
en E1, n'ont aujourd'hui aucun écrivain possible : ils doivent être « produits à partir de la
vue », et la vue ne contient pas de texte.

### Ce que l'essai a donc coûté et rapporté

Coûté : une journée. Rapporté : la découverte avant les huit à neuf heures de traitement
complet, et avant la bascule. C'était exactement l'objet de l'essai (CLA‑12).

## 2. Ce qu'il faut bâtir, et ce que le CDC en exige

| Exigence | Ce qu'elle impose au chemin du texte |
|---|---|
| RCH‑07 | Retrouver un **extrait exact**, donc stocker le texte tel quel, et non un résumé |
| RCH‑09, MCP‑04 | Toute citation **vérifiable contre la source** : l'extrait doit porter sa page |
| ANC | L'ancre d'un passage est la **vraie page**, jamais un rang approché |
| RCH‑11 | Latence p95 au plus 1,5 fois l'ancienne : l'index plein texte doit faire le travail, pas un parcours |
| CLA‑01 | Rien du domaine en dur : qu'une bibliothèque ait ou non des éléments numérotés est une propriété de **son schéma** |
| OPT‑04 | Le coût de lecture mesuré, pas supposé |

## 3. L'unité de passage : une page, une raison chiffrée

L'ancienne bibliothèque compte **22 022 passages** pour **234 ouvrages**. Le corpus compte
**21 515 pages**. Le rapport est de **1,02 passage par page**.

Je propose donc **un passage par page**, texte = le texte de cette page, ancre = cette page.
Ce n'est pas un choix d'ergonomie : c'est la granularité que la bibliothèque existante a déjà,
et c'est la seule qui rende littéralement vraie la promesse « toujours sur la vraie page ».

Une page de double feuille compte pour **deux** passages : la préparation de la recette
(`double_page`) coupe déjà la feuille en deux pages, et chaque moitié porte son texte.

## 4. D'où vient le texte, famille par famille

Le fait qui décide du coût est unique : **combien de pages portent déjà une couche texte**. Une
page qui en porte une se lit en millisecondes ; une page qui n'en porte pas demande l'OCR, qui
coûte trois ordres de grandeur de plus.

### Mesure faite : seize documents, quatre par famille, 3 336 pages

| Famille | Doc | Pages | Servies | Part | s / page |
|---|---|---|---|---|---|
| natif | 4 | 756 | 756 | **100,0 %** | 0,0026 |
| livre photographié, deux pages | 4 | 411 | 407 | **99,0 %** | 0,0115 |
| feuillet photographié | 4 | 1 051 | 820 | 78,0 % | 0,0051 |
| livre photographié, une page | 4 | 1 118 | 787 | 70,4 % | 0,0052 |
| **ensemble** | **16** | **3 336** | **2 770** | **83,0 %** | **0,0054** |

**La moyenne de 83 % trompe, et il faut le dire :** la répartition est franchement bimodale, comme
l'était celle de la gouttière. Dix documents sur seize sont servis à **exactement 100 %**, treize
à 90 % ou plus. Trois seulement sont en creux — 90 %, 33 %, et un à **0 %** — et ils portent à
eux seuls **520 des 566 pages non servies, soit 92 % du déficit**.

Autrement dit : la plupart des documents n'auront **aucune** page à océriser ; une minorité devra
l'être presque entièrement. Le défaut est bien **par page** au moment de décider — c'est ce que
la mesure de l'étape 2 avait établi, et un même ouvrage peut rendre 3 % sur une page et 38 % sur
une autre — mais sa **cause** est souvent le document entier, scanné sans passe d'OCR.

### Ce que cela change

Le texte est, pour l'essentiel, **déjà là**. La lecture de la couche existante coûte
**0,0054 s par page**, soit **cent fois moins** que les 0,55 s/page de la chaîne d'images
actuelle. Sur les 21 515 pages du corpus : **moins de deux minutes**.

L'OCR ne sert que pour les pages sans couche. En extrapolant la part mesurée — **et c'est une
extrapolation depuis seize documents, non une mesure du corpus** — cela fait de l'ordre de
3 650 pages, soit **1 à 2 h d'OCR**, concentrées sur peu de documents. L'étape 3 le mesurera sur
l'ensemble réel plutôt que de l'estimer.

| Famille | Documents | Pages | D'où vient le texte |
|---|---|---|---|
| natif | 104 (41,6 %) | 9 268 (43,1 %) | couche texte, directement |
| livre photographié, une page | 71 (28,4 %) | 7 728 (35,9 %) | couche texte si elle tient, OCR sinon |
| livre photographié, deux pages | 28 (11,2 %) | 2 739 (12,7 %) | idem, après coupe de la feuille |
| feuillet photographié | 24 (9,6 %) | 1 780 (8,3 %) | idem |
| sans pages fixes (EPUB, DOCX) | 19 (7,6 %) | — | par chapitre, ancre ≠ page |
| illisible | 4 (1,6 %) | — | à Vérifier, jamais devinées |

## 5. Les étapes, dans l'ordre où elles se vérifient

| # | Ce qui est fait | Comment on sait que c'est fait |
|---|---|---|
| 1 | Contrat du passage : texte, page, rang, provenance (`couche_texte` ou `ocr`), confiance | Contrat et ses tests écrits **avant** le code (règle 2) |
| 2 | Lecture du texte d'un PDF natif, page par page, avec le numéro imprimé tiré de la couche | Sur `500-pages.pdf` : 500 pages, 500 passages, numéros justes |
| 3 | Lecture du texte d'une page photographiée : couche si elle tient, OCR sinon, **décidé par page** | Sur un document connu, la part OCR mesurée égale la part de pages sans couche |
| 4 | Coupe en passages — un par page — et ancrage à la vraie page | Un passage tiré au hasard se retrouve sur sa page dans le PDF d'origine |
| 5 | Écriture dans `passage` et l'index plein texte à l'activation d'une version | Une requête FTS5 retrouve un extrait exact (RCH‑07) |
| 6 | Garde-fou : une manière de lire sans zone d'élément devient légitime (voir § 5 bis) | Le banc d'universalité passe sur un modèle sans éléments numérotés |
| 7 | Formats sans pages fixes : lecture par chapitre, ancre déclarée comme telle | L'EPUB rend des passages et **aucune** page inventée |
| 8 | Reprise de la bibliothèque d'essai, et les quatre épreuves demandées | Recherche par thème, par idée, par courant, par phrase exacte |

Les étapes 1 à 5 suffisent pour mener les quatre épreuves sur les documents natifs et
photographiés, soit **227 des 250 documents**. L'étape 7 peut attendre.

## 5 bis. Le garde-fou de l'étape 6, et pourquoi il n'est pas un contournement

`manqueALaManiere` exige aujourd'hui **une zone d'élément, toujours** : « Tracez d'abord la zone
où se trouve le numéro d'élément. » C'est cette règle qui a rejeté mes quatre recettes, et elle a
eu raison de les rejeter — mais la règle elle-même porte une hypothèse de domaine en dur : que
tout ce qu'on classe soit numéroté à un endroit fixe de la page. C'est vrai d'une méthode à
exercices ; c'est faux d'un livre de prose, et CLA‑01 interdit cette supposition.

J'ai d'abord pensé à faire dire à la description de la bibliothèque si ses contenus portent des
éléments numérotés. Vérifié : elle ne sait pas l'exprimer — `contenus` ne distingue que
`documents`, `audio`, `videos`, `images`. Il faudrait donc changer un contrat.

**Ce n'est pas nécessaire, et la règle juste est plus simple.** Ce qu'une manière de lire doit
déclarer, c'est **ce qu'elle lit** — ses `lectures`. La règle devient :

- au moins **une** zone, quel que soit son rôle : une manière qui ne cherche rien ne cherche nulle part ;
- **au plus une** zone d'élément, et seulement si la manière déclare lire des éléments ;
- **au plus une** zone de numéro de page — inchangé.

Rien n'est retiré : les quatre recettes de méthode existantes continuent de passer à l'identique,
puisqu'elles déclarent les trois lectures. Ce qui change, c'est qu'une manière qui ne lit pas
d'éléments cesse d'être refusée pour ne pas en lire. Aucun contrat à modifier, et une hypothèse
de domaine en moins dans le code générique.

## 6. Ce que cela coûte

| Mesure | Valeur | Statut |
|---|---|---|
| Chaîne d'images actuelle, sans texte | 0,55 s / page | **mesuré** (1 416 pages en 771 s) |
| Lecture de la couche texte | 0,0054 s / page | **mesuré** (3 336 pages, 16 documents) |
| Part des pages déjà servies par la couche | 83 % en moyenne, 100 % pour dix documents sur seize | **mesuré** |
| OCR d'une page | — | **à mesurer à l'étape 3** |

**Coût en argent : nul.** Tout se passe sur le poste. Rien ne part sur Cloudflare à cette étape,
aucune ressource n'est créée, aucun appel payant n'est fait. Le plafond de 10 $/mois n'est pas
touché.

**Coût en temps de traitement, sur les 21 515 pages :**

| Travail | Durée |
|---|---|
| Lecture de la couche texte, tout le corpus | **moins de 2 min** (mesuré) |
| OCR des pages sans couche | **1 à 2 h** — extrapolé depuis 16 documents, à confirmer |
| *Pour mémoire : chaîne d'images actuelle* | *3,3 h, et sans produire de texte* |

L'estimation d'OCR est la seule à ne pas reposer sur une mesure du corpus entier, et je la donne
comme telle. C'est précisément une estimation présentée comme un fait qui a produit l'erreur que
ce document corrige.

## 7. Ce que je ne fais pas sans un accord séparé

Inchangé, et rappelé ici parce que ce plan ne les lève pas :

- aucun réimport réel des 234 ouvrages (E2) ;
- aucune bascule (E4) ;
- aucune suppression de l'ancienne bibliothèque (E6) ;
- aucun changement de configuration ni de secret Cloudflare ;
- `therapeute-library` n'est pas touchée, et reste vérifiée à 22 022 passages et
  168 738 816 octets à chaque étape.

## 8. Les corrections déjà faites en chemin

Trois défauts trouvés pendant l'essai, tous corrigés avec le test qui les éprouve, et tous
vérifiés **rouges sans la correction** :

1. **La préparation vidait ses propres fichiers.** `fs::copy` appelé avec la destination comme
   source ouvre la destination en écriture avant de lire : la description et les affectations
   sont parties à zéro octet. Les sept travaux ont ensuite échoué 78 minutes sur « Unexpected
   end of JSON input », sans que rien ne nomme la cause. Corrigé : la copie ne s'exécute plus si
   la source est la destination, et la préparation relit ce qu'elle vient de poser.

2. **Le plafond de tentatives ne se déclenchait sur aucun chemin réel (JOB‑05).** La table
   `travaux-cas.json` dit « c'est la reprise qui consomme une tentative » — vrai pour l'écran,
   faux pour la file, qui prenait le bail sans passer par `appliquer`. Les sept travaux ont été
   relancés près de mille fois chacun. Toutes les transitions étaient justes séparément ; aucun
   cas n'éprouvait le **cycle**. Corrigé par une porte commune (`file::prendre`) et trois tests,
   dont celui qui exige un arrêt.

3. **Un résultat vide était annoncé comme un succès.** C'est la plus coûteuse des trois, parce
   qu'elle passe les contrôles et ne se découvre qu'à la recherche. La chaîne connaît les deux
   nombres — pages du document, pages lues — et n'en rapportait aucun. Corrigé : le nombre de
   pages est dit avant la première lecture, et un document qui en porte sans qu'aucune ne soit
   lue échoue en le nommant, sans reprise possible. Une lecture vide n'est plus mise en cache
   non plus : la garder rendait le défaut permanent.

## 9. Ce qui reste à régler avant le traitement complet des 250 documents

Deux réserves ouvertes, mesurées et non corrigées. Aucune ne bloque ce lot ; toutes deux
bloquent le passage à l'échelle. Elles sont consignées ici pour qu'on ne les redécouvre pas
au milieu de 250 documents.

### 9.1 F4 : un gros document numérisé n'aboutit pas en quarante minutes

`Paul westwood.pdf`, 143 pages, 165 Mo. Le traitement est arrêté par le garde-fou de l'essai
sans avoir conclu, et il l'était déjà **avant** le chemin du texte — éprouvé dans les deux
sens sur le commit `7e24ebfd` :

| | avant le chemin du texte | après |
|---|---|---|
| issue | arrêté à 40 min | arrêté à 40 min |
| pointe mémoire | 1 041 Mo | 985 Mo |
| moyenne | 280 Mo | 257 Mo |
| sortie produite | 236 Mo | 236 Mo |

Le chemin du texte consomme donc **moins**, pas plus : la lenteur lui est antérieure et ne
lui est pas imputable. Ce qu'on ne sait pas encore : où elle se loge. Le journal s'arrête
après « 143 pages dans le document », c'est-à-dire pendant la première phase — repères et
images de pages — et non pendant la lecture du texte.

À faire avant le traitement complet : instrumenter cette première phase page par page, et
décider si un document de cette taille se traite autrement (flux, découpe, ou refus motivé).
Tant que ce n'est pas tranché, aucune estimation de durée sur le corpus entier n'est fiable.

### 9.2 Le moteur embarqué n'a ni canevas ni polices de référence

L'épreuve du paquet le dit à chaque exécution, et le traitement de F5 le répétait :

```
Warning: Cannot load "@napi-rs/canvas" package
Warning: Cannot polyfill `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
```

C'est **exactement la famille du défaut corrigé** par la sortie du module de travail hors du
paquet : un module que la chaîne cherche à l'exécution et que le paquet ne porte pas, parce
qu'il n'a pas de `node_modules`. Trois manquants restent, là où un seul a été traité.

Conséquence mesurable : pdfjs ne peut pas rasteriser. Sur F5, une seule image de page écrite
sur quatre-vingt-seize. Les documents servis par leur couche texte n'en souffrent pas —
l'épreuve du paquet lit 500 pages sur 500 par la couche — mais les **104 documents
« page-native » à texte vectoriel** du corpus en dépendent : c'est par le rendu qu'on les
atteint.

À faire avant de traiter ces 104 documents : embarquer le canevas et les polices de référence
à côté de la chaîne, comme on l'a fait pour les WebAssembly des codecs et pour le module de
travail. Et refaire l'épreuve du paquet dans les deux sens, pour qu'elle échoue sans eux.

### 9.3 La recherche parcourt les versions, là où il faudrait un index

La recherche de l'écran lit les passages de la version active de chaque document (étape 4 du
plan de classement). Sur la mini-bibliothèque c'est tenable ; à l'échelle du corpus, non.

| Mesure | Valeur |
|---|---|
| Part des passages dans un fichier de version | **93 %** |
| Poids moyen d'un passage | ~1,5 Ko |
| Huit documents parcourus par requête | quelques mégaoctets |
| Deux cent cinquante documents | des dizaines de mégaoctets **à chaque frappe** |

L'index plein texte existe déjà dans le projet et n'attend que d'être branché :
`packages/depot-sqlite` porte le schéma des passages, son index FTS5, son classement bm25 et
ses migrations 5 et 6. Il sert aujourd'hui le chemin D1 du worker, et `enregistrerPassages`
n'est appelé par aucun code de production — seulement par ses propres tests.

À faire avant le traitement complet : écrire les passages dans cet index au moment du
traitement, et faire lire la recherche depuis lui plutôt que depuis les fichiers de version.
La forme de `chercher` ne change pas — elle reçoit déjà les passages en entrée séparée, d'où
qu'ils viennent.
