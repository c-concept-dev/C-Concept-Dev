# Plan avant code — l'écran « Relier », filet de sécurité de la bascule

Écrit le 3 novembre 2026, avant toute ligne de code, en réponse à la décision stratégique
`cdc-audit-complet-21.md` §-1 septies. **Ce document doit être validé avant implémentation.**

**Repris le 5 novembre 2026**, sur décision de Christophe qui le remet au premier plan des
travaux essentiels : cet écran **est** le mode manuel — confirmation lien par lien, puis
association libre quand le moteur ne propose rien. Deux choses ont changé depuis le 3 novembre et
sont intégrées ci-dessous : la **clé est la feuille physique** (A1a, poussé le 5 novembre, a
renommé `index` en `feuille` et corrigé sa valeur), et un **défaut d'affichage du Lecteur** a été
mesuré, qu'il faudra corriger ici (§ 4 bis).

**Placement dans la feuille de route** : après le jalon « ça marche » (Bass Aerobics à l'écran),
après A1b et après A2. C'est le premier des quatre travaux essentiels du kit du 3 novembre —
mode manuel, puis estimation marquée (B), puis mémoire d'apprentissage à trois niveaux, puis
l'Expert.

## 1. Ce que la décision change, dit sans l'adoucir

Le moteur publiera sa meilleure estimation sur un seul signal, au lieu de s'abstenir. Cela
**contredit frontalement** le §0 point 4 du même document : « Zéro faux lien automatique, sans
exception, sans compromis de délai. » La contradiction est assumée et délimitée :

| | mode strict | mode estimation |
|---|---|---|
| publie sur un signal unique | non | oui |
| §0.4 s'applique | oui, intégralement | non — remplacé par « aucun faux lien **non signalé comme tel** » |
| rôle | référence de vérité, juge la qualité des estimations | mise en usage réelle |

Les points §0.1, §0.2 et §0.3 ne bougent pas : vérifié dans la vraie base, vivier borné, page
réellement lue. Le §0 bis (corroboration) et le §0 ter (preuve contre régularité) restent la
définition du mode strict, qui demeure disponible et reste le défaut pour une bibliothèque où
l'erreur n'est jamais acceptable.

**Conséquence directe sur l'ordre des travaux** : publier des estimations sans moyen de les
corriger transformerait la bibliothèque en champ d'erreurs silencieuses. L'écran de correction
existe donc **avant** la bascule. C'est l'objet de ce plan ; les étapes 2 (marquage et mode
estimation) et 3 (apprentissage) ne sont pas traitées ici.

## 2. Ce qui existe déjà — et qu'il ne faut pas réinventer

Mesuré dans le dépôt, pas supposé :

- **`packages/contrats/src/lien.ts` porte déjà la décision humaine.** `Preuve` contient
  `"manuel"`, `Auteur` distingue `outil` et `personne`, et un `superRefine` **interdit déjà**
  qu'une preuve manuelle ait un outil pour auteur. Le contrat de base est là ; il manque la
  cible et la réversibilité.
- **`apps/app/src/pages/Verifier.tsx` existe** (B2 — UX-03, SYN-04, SYN-05, SYN-07) : une planche
  de cas douteux, un cas à la fois, trois décisions (confirmer, corriger, ignorer), la dernière
  décision se défait, et l'écoute passe déjà par `useEcoute`.
- **Le trou est précis** : `enregistrerDecision(racine, regardé, casId, decision)` ne transporte
  **aucune cible**. « Corriger » sait dire « c'est faux », jamais « c'est cette plage-là ».
- **`apps/app/src/pages/Lecteur.tsx:278`** : « Corriger ce lien » est un simple `href="#verifier"`.
  Le point d'entrée existe, il ne mène nulle part d'utile.
- **Le vivier est déjà borné côté hôte** (`apps/app/src-tauri/src/roulement.rs:476`) : seuls les
  médias dont les provenances croisent celles du document sont servis. À réutiliser, pas à
  recalculer.
- **La structure d'association porte déjà un `statut`** (`"auto"` aujourd'hui, dans
  `base/versions/*.json`), et `confiance` et `sourcePiste` par ligne. Le marquage de l'étape 2
  s'y logera sans changer de forme.

## 3. Le nom et le vocabulaire

Écran **« Relier »**, route `#relier`, fichier `apps/app/src/pages/Relier.tsx`.

Aucun mot de domaine (CLA-01). Les trois mots affichés viennent du schéma de la bibliothèque
(`description.mots` : `element`, `piste`, `page`), lus par les aides existantes `accorder` et
`nommer`. Une bibliothèque qui appelle ses pages « feuillets » et ses médias « plages » verra
« feuillets » et « plages », sans une ligne de code en plus.

## 4. Ce que l'écran doit faire

Deux colonnes.

**À gauche, les pages du document**, dans l'ordre, chacune portant son état :
*rien*, *estimation* (un signal — réservé, affiché dès l'étape 2), *confirmé* (deux signaux
indépendants), *humain* (décidé ici). Quatre états, jamais confondus, chacun son libellé en
toutes lettres — pas seulement une couleur.

**À droite, le vivier borné** : les médias dont les provenances croisent celles du document,
rien d'autre. Avec leur rang, leur durée, et l'indication « déjà relié à … » quand c'est le cas.

**Les gestes** : relier un média à une plage de pages ; étendre, déplacer, retirer une liaison ;
écouter avant de valider ; défaire la dernière décision.

**Le clavier d'abord, le glisser-déposer par-dessus.** Chaque ligne de page porte une action
« Relier à… » qui ouvre la liste bornée, parcourable et choisissable au clavier. Le
glisser-déposer déclenche exactement la même action. Un écran dont la fonction principale
n'existe qu'à la souris serait inutilisable pour une partie des gens et contraire au kit.

**Conflits** : relier un média déjà relié ailleurs n'est pas interdit — le §-1 sexies a établi
que deux fichiers peuvent légitimement désigner la même page. L'écran le dit, il ne bloque pas.

## 4 bis. Un défaut d'affichage que cet écran doit corriger

**Mesuré le 5 novembre 2026, sur la vraie bibliothèque musicale.** Le Lecteur **n'affiche pas**
`aVerifier` : une proposition non vérifiée s'y présente comme un lien publié — panneau d'écoute,
bande sur la page, « Pourquoi ce lien · Confiance haute ». Rien à l'écran ne dit qu'elle n'est pas
vérifiée. Sur `ca36cf98`, les compteurs du catalogue disaient « **0 liens** · 52 propositions non
vérifiées » pendant que le Lecteur en montrait cinquante-deux comme des liens.

C'est exactement le danger que ce plan nomme au § 1 : « aucun faux lien **non signalé comme
tel** ». Le mode estimation serait intenable tant qu'une estimation ressemble à une certitude.

**Les quatre états du § 4 doivent donc être visibles dans le Lecteur aussi**, et pas seulement
dans `Relier` : *rien*, *estimation*, *confirmé*, *humain*, chacun en toutes lettres. L'écran
Vérifier, lui, fait déjà son travail — il porte le libellé « Aucun lien » pour un média orphelin.
C'est le Lecteur qui tait la différence.

## 5. La question de fond : où vit une décision humaine

C'est le point le plus important du plan, parce qu'il décide si le travail de l'utilisateur
survit à une relance du moteur.

**Proposition : une couche humaine séparée**, `base/decisions/<empreinte-document>.json`,
jamais écrite par le moteur, appliquée **par-dessus** la version active à la lecture.

Pourquoi pas dans la version active : le moteur produit une nouvelle version à chaque relance.
Écrire la décision humaine dedans, c'est la remettre en jeu à chaque passage — et la perdre le
jour où une relance échoue à mi-chemin. Une couche à part rend la règle triviale à prouver :
*le moteur n'écrit jamais dans `decisions/`.*

Forme d'une décision, à poser en contrat :

- la cible : empreinte du document, et soit un numéro d'élément existant, soit une plage de
  **feuilles physiques** (début, fin). **La clé est la feuille, jamais le folio imprimé ni un rang
  compacté** — décision du 4 novembre, et A1a l'a rendue vraie dans le code le 5 novembre en
  renommant `index` en `feuille`. Un folio imprimé peut être revendiqué par deux feuilles (mesuré
  sur `ca36cf98` : le sommaire et la vraie page 66), et un rang compacté ne désigne pas une
  feuille. Une décision humaine qui viserait l'un ou l'autre se poserait un jour ailleurs qu'où
  la personne l'a posée ;
- le média : son empreinte, jamais son chemin (ANC-05 : une bibliothèque se copie ailleurs) ;
- l'auteur : `{ type: "personne" }`, imposé par le contrat existant ;
- le moment, pour l'ordre et le défaire ;
- le geste : `relier`, `retirer`, ou `defaire` d'une décision antérieure citée par son
  identifiant. Jamais de suppression en place : l'historique est la réversibilité.

## 6. Mesures à faire **avant** d'écrire

Dans la discipline tenue jusqu'ici : mesurer d'abord.

| | mesure | pourquoi |
|---|---|---|
| M1 | ce que l'hôte fait aujourd'hui d'une décision « corriger » | ne pas construire à côté de ce qui existe |
| M2 | relancer le moteur sur un document et observer ce qui est réécrit dans `base/` | prouver où une décision humaine survivrait, au lieu de le supposer |
| M3 | taille réelle du vivier borné sur le cas le plus dur (92 médias) | décider si la colonne de droite a besoin d'une recherche |
| M4 | nombre de pages maximal rencontré (116 vu ce soir, 250+ en bibliothèque réelle) | décider si la colonne de gauche doit se virtualiser |

## 7. Lots, dans l'ordre, chacun avec son critère

| lot | contenu | critère d'acceptation |
|---|---|---|
| A | contrat `DecisionHumaine` dans `@lienotheque/contrats` | tests rouges d'abord ; une décision sans personne pour auteur est refusée ; une plage dont la fin précède le début est refusée |
| B | la couche humaine au noyau : lire, écrire, défaire | **test rouge central** : relancer le moteur après une décision humaine ne la perd pas, et ne la modifie pas |
| C | commandes d'hôte : servir le vivier borné, enregistrer, défaire | test Rust ; le vivier servi n'excède jamais les provenances du document |
| D | l'écran `Relier` : deux colonnes, clavier, glisser-déposer, écoute | tests de rendu ; la fonction entière s'atteint au clavier seul |
| E | les portes d'entrée : « Corriger ce lien » du Lecteur et « corriger » de Vérifier mènent à `Relier`, sur le bon cas ; **et le Lecteur cesse de montrer une proposition comme un lien sûr** (§ 4 bis) | test de navigation ; **test rouge d'abord** : une proposition `aVerifier` ne doit pas s'afficher comme un lien publié |
| F | **preuve réelle** : relier à la main dans le paquet installé, relancer le moteur, vérifier que la décision tient | capture d'écran et empreinte de la base avant/après ; LIV-07 |

Un commit par lot, sur `wip/lienotheque-2026-10-29`, `pnpm check` vert avant chacun.

## 8. Ce que ce plan ne fait pas

Le mode estimation et le marquage de confiance (étape 2), l'apprentissage à partir des
corrections (étape 3). L'écran est conçu pour les accueillir — ses quatre états en réservent
déjà la place — mais rien n'en est écrit ici.

## 9. Questions à trancher avant le lot A

1. **Une décision humaine vise-t-elle un élément ou une plage de pages ?** Proposition : les
   deux, l'élément quand il existe, la plage sinon — créer un élément depuis une plage étant le
   même geste. À confirmer.
2. **Le mode strict reste-t-il le défaut de la vraie bibliothèque musicale ?** Proposition : oui,
   et la bascule en mode estimation y devient un choix explicite, bibliothèque par bibliothèque.
3. **Une décision humaine reste-t-elle strictement dans sa bibliothèque ?** Proposition : oui,
   sans exception — l'étape 3 pourra généraliser *à l'intérieur* d'une bibliothèque, jamais entre
   deux.

La question 1 est **tranchée par A1a** pour ce qui est de l'unité : une plage se dit en feuilles
physiques. Reste à confirmer qu'une décision peut viser un élément quand il existe.
