# A1 — rendre à chaque page sa feuille (OUT-15)

Plan arrêté le 5 novembre 2026. **Aucun code de production n'est écrit avant accord.**

## Le défaut, en une phrase

`pagesEnGris` saute toute feuille qui ne porte aucune image, et `preparerLot` n'incrémente son
`index` que pour les feuilles qu'il a émises : l'`index` d'une page est son rang **dans la suite
des feuilles retenues**, pas le rang de la feuille dans le document. Les deux coïncident tant
qu'aucune feuille n'est sautée, et divergent dès la première.

```
outils/recettes/src/banc.ts   pagesEnGris   if (page.images.length === 0) continue;
outils/recettes/src/banc.ts   preparerLot   index += 1;   // jamais atteint pour une feuille sautée
```

En aval, tout le monde lit cet `index` comme un rang de feuille :

| Consommateur | Où | Ce qu'il en fait |
|---|---|---|
| image de page | `outils/ingestion/src/instantane.ts` | sert `page-{index}.webp`, nommée **par feuille** |
| libellé affiché | `outils/ingestion/src/instantane.ts` | « page {index} du document » |
| numéro imprimé, début d'élément | `outils/ingestion/src/lot.ts` | pose au rang `index + PREMIER_RANG` |
| rang d'export | `outils/ingestion/src/executant.ts` | `rang: page.index` |
| décalage du folio | `outils/recettes/src/interprete.ts` | `pageLue - (page.rang ?? page.index)` |
| banc | `outils/recettes/src/banc.ts` | `index + 1` comme numéro de feuille |

Une seule source échappe au compactage : le texte des pages (`lot.ts`, sur `lu.pages`), qui suit
les feuilles. C'est pourquoi les deux numérotations d'un même document se contredisent.

## Le correctif retenu : la feuille voyage avec la page

`pagesEnGris` **connaît déjà** la feuille — `pagesPdf` la lui donne, et elle sert au rendu
(`renduComplet.page(page.index + 1, …)`). Elle est perdue au moment du `yield`, qui ne rend que
l'image. On la fait voyager, et `preparerLot` cesse de compter.

1. **`pagesEnGris` rend la feuille avec l'image.** Son `yield` passe de `ImageGrise` à
   `{ image, feuille }`, où `feuille` est le rang 0-based de la feuille dans le document. Rien
   n'est ajouté à `ImageGrise` : une image n'a pas à savoir d'où elle vient.
   Appelants à suivre : `preparerLot` et `voterOrientation` (même fichier), `flux.test.ts`,
   `outils/redresseur/mesures/orientation-f4.ts`.
2. **`preparerLot` prend `index = feuille`** et supprime son compteur. L'`index` devient le rang
   de la feuille, qui est ce que son propre commentaire annonce déjà (« Le rang dans le document,
   et non dans la tranche »). Effet de bord gagné : `options.depuis` n'a plus besoin d'amorcer le
   compteur, puisque `pagesPdf` rend des rangs absolus — le cas « essayer une manière de lire sur
   dix pages du milieu » devient juste par construction, et non par compensation.
3. **La suite des `index` peut être trouée.** C'est le cœur du changement, et il faut le dire dans
   le contrat : `PageLue.index` et `PageReperee.index` (`packages/contrats/src/repere.ts`)
   documentent « rang de la feuille dans le document, 0-based ; la suite peut comporter des
   trous ». Un test de contrat garde le trou.
4. **`lireEtInterpreter`** (`banc.ts`) numérote aujourd'hui par position de tableau. C'est un
   raccourci de banc, correct seulement pour un jeu sans trou : il prend les feuilles de son
   appelant, ou le dit en commentaire.

Ce qu'il n'y a **pas** à changer : `lot.ts` pose déjà les images et les rangs de la vue par
feuille physique (`exporterPages`, `page.index + PREMIER_RANG`), et `numerosImprimes` indexe par
`index` dans une `Map` — une clé trouée ne la gêne pas.

### Ce que les deux extraits éprouvent

| Extrait | Feuilles à image | Attendu | Aujourd'hui |
|---|---|---|---|
| `a1-decalage-constant.pdf` (Bass Aerobics 1-5, feuille 2 sans image) | 1 4 5 → index 0 2 3 4 | `0 2 3 4` | `0 1 2 3` |
| `a1-decalages-multiples.pdf` (Rosenberg 1 2 3 12 13 25) | 1 4 6 → index 0 3 5 | `0 3 5` | `0 1 2` |

Le même correctif les fait passer tous les deux : c'est la même ligne qui les casse.

### Ce que le correctif change AUSSI, et qu'il faut vérifier

`interprete.ts` calcule le décalage du folio comme `pageLue - rang`. Aujourd'hui, sur un document
à feuille sautée, le rang est trop petit de 1 **et** le décalage trop grand de 1 : les deux
erreurs s'annulent et la **valeur** du folio sort juste, seulement posée au mauvais rang. Après le
correctif, le rang est juste et le décalage devient juste : la valeur ne change pas, la place
change. Mais sur un document à **beaucoup** de feuilles sautées, les rangs deviennent très espacés
et la déduction de folio (`decalageDominant`, `ECART_TOLERE = 4`, `absentes`) ne rend plus les
mêmes nombres. **Conséquence : les documents touchés se retraitent, ils ne se migrent pas.**
Un recalcul d'index figerait des `pageImprimee` et des `absentes` déduits d'un rang faux.

Rassurance mesurée : F3 (29 feuilles) et F4 (143 clichés) n'ont **aucune** feuille sans image. Le
critère F3 « 95 sur 95 » et les critères F4 ne peuvent pas bouger. Ils seront rejoués quand même.

### Le renommage `index` → `feuille` : fait, avec le correctif

**Décision de Christophe du 5 novembre, maintenue contre ma proposition de la reporter.** Le
renommage *est* ce qui fait désigner chaque consommateur par le compilateur, et c'est ce qui a
permis d'en trouver un que ma liste manquait et d'en disculper deux qu'elle accusait à tort.

Renommés, parce qu'ils désignent une **feuille**, à partir de zéro, en suite possiblement trouée :
`PageReperee.feuille` et `PageLueBrute.feuille` (contrats), `PageLue.feuille` (interprète),
`PageAlire.feuille` (banc), `PageAsonder.feuille` et `PageAmarges.feuille` (vision).

**Non renommés, et pourquoi.** `PageAffichee.index` et l'entrée d'`instantane.ts` comptent le rang
de la page **affichée**, à partir de un : c'est la convention de la vue, celle qu'on cite à une
personne, et c'est ce que `PREMIER_RANG` convertit une fois pour toutes dans `lot.ts`. Leur donner
le nom `feuille` créerait un second piège — deux champs du même nom, l'un à partir de zéro, l'autre
de un. Ils sont documentés à la place. Leur **valeur** devient juste par le correctif, puisque
`lot.ts` les construit maintenant depuis `page.feuille`.

**Deux consommateurs que ma liste accusait à tort** : `executant.ts` (`rang: page.index`,
`rang: refus.index`) lit la sortie d'`exporterPages`, qui numérote par **feuille physique** et n'a
jamais été compactée. Le compilateur ne les a pas désignés, et la lecture du code le confirme. Ma
table du 5 novembre les comptait pour faux : c'était une erreur.

**Les données déjà écrites restent lisibles.** `PageReperee` et `PageLueBrute` acceptent un `index`
ancien et le lisent comme `feuille`, sans réécrire aucun fichier. Les deux noms ensemble sont
refusés : il n'y a jamais de doute sur celui qui fait foi. Deux contrôles de contrat le gardent.

### Le cache de lecture devait être invalidé, et il l'est

Trappe trouvée en écrivant le plan de retraitement : `clefDeLecture` ne change pas avec le
correctif, et les entrées de cache portent l'**ancien** compte. Une lecture gardée ramènerait les
rangs compactés et **le correctif serait inopérant sur tout document déjà lu** — dont Bass
Aerobics. `VERSION_LECTURE` passe donc de 10 à 11, ce qui était déjà le mécanisme prévu pour cela.
Conséquence à assumer : un retraitement relit le document, il ne peut pas s'appuyer sur le cache.

## Les documents à retraiter

Critère : `0 < resultat.pages < nombre de pages de la vue`, sur les documents actifs des deux
bibliothèques (mesure du 5 novembre, lecture seule).

| Bibliothèque | Documents compactés | Dont la vue porte un folio ou un élément |
|---|---|---|
| musicale | 10 | **1** — `ca36cf98` Bass Aerobics, 53 folios et 53 éléments, tous une page trop tôt |
| Studio Clinique | 10 | **0** |

**`ca36cf98` est le seul dont un écran est faux.** Les dix-neuf autres portent une donnée fausse
que rien n'affiche : leur retraitement est souhaitable, pas urgent.

À part, et pour une autre raison : **`c4e96eec`** (Studio Clinique) est `en_pause` depuis un arrêt
demandé ; son `resultat.pages` ne porte que ce qui avait été lu avant l'arrêt. Lui n'a rien à
migrer — il a un traitement à finir.

## Le retraitement — par quelle voie, avec quel filet, et comment revenir

**Rien n'est exécuté avant le mot de Christophe.** Le retraitement se fait en deux temps, et le
premier n'écrit rien du tout.

### (a) La voie : un banc, jamais l'application

La règle de Christophe tient : aucun traitement lancé depuis l'application tant que le jeton est au
trousseau ; des bancs seulement, sans relecture, `LIENOTHEQUE_JETON` retiré de l'environnement.

`instantaneDeLot` (`outils/ingestion/src/lot.ts`) **ne touche à rien** : elle prend un PDF et un
inventaire de médias, et rend la vue, le résultat et les passages. Elle n'écrit dans la
bibliothèque que si on lui donne `images` — on ne le fait pas. Et la relecture est un port qu'on
ne branche pas : sans `relecture` ni `validationStructurelle`, aucun appel en ligne n'est possible,
donc aucune clé n'est nécessaire.

**Étape R1, lecture seule.** Un banc, lancé par `env -u LIENOTHEQUE_JETON`, depuis le plan de
travail et non depuis l'application :

- entrée : `sources/ca/ca36cf98….pdf` de la bibliothèque musicale, lu ;
- médias : l'inventaire reconstruit depuis la version active (`{ nom, empreinte }` des 52 médias
  qu'elle porte déjà) — aucun dossier à retrouver, aucun fichier à copier ;
- pas d'`images`, pas de `cache`, pas de `relecture` ;
- sortie : le nouveau résultat écrit **hors de la bibliothèque**, sous `sorties/`.

On compare alors, feuille par feuille, l'ancienne version et la nouvelle : les cinquante-deux
propositions doivent se déplacer d'un rang, et seulement d'un rang. **C'est la preuve sur le vrai
document, obtenue sans écrire un octet dans la bibliothèque.** Durée à prévoir : une relecture
complète de 116 feuilles, cache invalidé (voir plus haut).

**Étape R2, la seule qui écrit.** Après le mot de Christophe, et après R1 : écrire la nouvelle
version sous `base/versions/<nouvel-uuid>.json`, puis faire pointer `base/actives.json` sur elle.
L'ancienne version **reste** — la chaîne n'en supprime aucune.

### (b) La sauvegarde, et sa vérification par empreinte de contenu

Avant R2, copie entière de la bibliothèque musicale : **13 Go** (`base` 114 Mo, `derives` 2,0 Go,
`sources` 11 Go, `cache` 572 Ko), pour **42,1 Go** libres sur le volume externe — mesuré au
`Container Free Space` de `diskutil`, le seul chiffre juste sous APFS. Il reste 29 Go après.

La vérification est une **empreinte de contenu** : chemin relatif + SHA-256 de chaque fichier, des
deux côtés, et comparaison des deux listes. Jamais chemin + taille + date — une copie peut être
juste de taille et fausse d'octets. Les sources portent leur empreinte **comme nom** : pour elles,
comparer les noms compare déjà les contenus, et un recalcul sur un échantillon suffit à vérifier
que le nom ne mentait pas.

### (c) Comment revenir en arrière

Trois niveaux, du plus simple au plus lourd :

1. **Rendre la version active précédente** : remettre `base/actives.json` sur
   `d183554c-7f8f-4500-a71e-d9faaf82e3f4`. L'ancienne version n'a pas été touchée ; c'est un seul
   fichier de quelques octets, et le Lecteur retrouve exactement ce qu'il montrait.
2. **Retirer la version ajoutée** : supprimer le `base/versions/<nouvel-uuid>.json` écrit en R2.
3. **Restaurer la copie** du point (b), si quelque chose d'autre a bougé.

Le point 1 suffit à tout cas prévisible, et c'est pour cela que R2 n'écrit que deux fichiers.

### Ordre des opérations

1. Correctif, renommage, invalidation du cache, les deux tests rouges et les deux contrôles de
   contrat : **un** commit, qui construit seul et passe `pnpm check`. Le renommage n'est pas
   séparable sans laisser un commit intermédiaire où un champ nommé `index` porte un rang de
   feuille — l'ambiguïté même qu'on corrige.
2. Plan, registre et notes : deuxième commit.
3. Rejeu des critères F3 et F4 (gardien de la tâche A4), **avant** tout retraitement.
4. **R1** sur `ca36cf98`, lecture seule, et comparaison des deux versions.
5. **STOP** — mot de Christophe.
6. Sauvegarde (b), puis **R2**, puis vérification au Lecteur : « Workout 3 » et le folio 10 doivent
   passer de la page 11 à la page 12, et la page 12 cesser d'être muette.
7. Les dix-neuf autres documents, par lots, après le point 6.
8. `c4e96eec` : reprise du traitement interrompu, indépendamment de tout ceci.
