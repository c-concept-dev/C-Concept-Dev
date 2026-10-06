# Lot 1a — narration par étape

Aucun appel au modèle dans ce lot. Tout ce qui suit est du code déterministe et des tests.

---

## 1. Ce que le code dit, avant toute décision

Le brief demandait de vérifier deux choses avant de choisir l'emplacement. Voici les réponses,
lues dans le code et non supposées.

### Les identifiants de blocs sont-ils uniques dans tout le document ?

**Oui, par construction, et c'est un invariant déjà écrit.** Trois générateurs, un seul espace de
noms :

| Générateur | Où | Garantie |
|---|---|---|
| `convertBlock` | conversion de la sortie du modèle | un compteur `blockSeq` unique pour tout le document, **jamais remis à zéro d'une carte à l'autre** |
| `idBloc` / `idCarte` | `adocAssembleCourse` | deux compteurs uniques pour tout l'assemblage |
| `adocNextBlockId` | insertion dans l'éditeur | **parcourt `doc.blocks` ET `content.blocks` récursivement**, collecte tous les identifiants, et n'émet qu'un identifiant absent de l'ensemble |

Le commentaire d'`adocNextBlockId` l'énonce déjà : numérotation globale, « jamais de collision
possible ». Les identifiants de cartes (`card-NN`, `slide-NN`) partagent cet espace et sont
collectés par le même parcours. **Un identifiant d'étape suffit donc seul** — jamais une paire
(carte, bloc).

### Comment sont implémentés déplacer, dupliquer, supprimer ?

**Deux des trois n'existent pas.**

- **Réordonner** existe : glisser-déposer, deux `splice` sur le **même** tableau. L'identifiant du
  bloc ne bouge pas. Le geste est explicitement restreint aux frères directs du même conteneur
  DOM — « jamais un bloc d'un autre conteneur », point 5 du CDC.
- **Déplacer un bloc d'une carte à une autre : n'existe pas.** C'est la même restriction.
- **Supprimer un bloc : n'existe pas.** Aucun bouton dans le panneau, aucun raccourci. Les seuls
  retraits sont celui d'une image, celui d'un lien vidéo, et le retour arrière d'une insertion
  ratée.
- **Dupliquer un bloc : n'existe pas.** Le seul clonage est la copie **entre deux documents**
  (`adocFusionCommitDrop`), qui attribue un identifiant **neuf** dans le document d'arrivée.

### Ce que cela change pour l'emplacement

Votre objection était juste : dans la variante « carte indexée », une narration **suit la carte et
non le bloc**. J'avais écrit que la narration « suivait » la suppression ; c'était faux, elle
devenait orpheline. Et un bloc déplacé vers une autre carte aurait laissé sa narration derrière
lui.

La condition que vous posiez est remplie, donc : **table à la racine, indexée par identifiant
d'étape**. Un seul point d'entrée dans le schéma, aucune fuite vers les cartes ni vers les blocs,
et une purge centrale des orphelines.

---

## 2. Ce qui est construit

**Le champ.** `doc.narration` : tableau d'objets `{ stepId, text }`, clos, à la racine du
ClinicalDocument, **optionnel** — sur le patron exact de `deepDives` et de `modules`. Un document
sans narration reste valide et se rend comme avant. Les deux copies du schéma (le fichier sur
disque et la copie embarquée dans `studio-clinique.html`, qui est celle qui valide en production)
sont modifiées et vérifiées identiques.

**La règle d'étape.** `adocPresentStepList` reprend strictement celle d'`adocPresentApplyReveal`,
qu'elle jouxte dans le fichier : 0 ou 1 bloc dans la carte donnent **une** étape, au-delà une par
bloc. L'identifiant d'étape est celui du bloc, ou celui de la carte quand la carte n'a aucun bloc.

Une différence de source existe et elle est dite : la révélation compte les blocs **rendus**,
l'énumération compte les blocs de **donnée**, seuls disponibles hors du mode plein écran. Le test
exige que les deux comptes concordent sur des cartes à 0, 1, 2 et 4 blocs.

**Les cartes à zéro bloc ne sont pas une hypothèse** : `adocAssembleCourse` construit la
diapositive de titre de chaque module avec une liste de blocs vide dès que le module n'a pas de
notions clés.

**Trois points d'intégration**, chacun né d'une lecture du code :

1. **L'assemblage de cours** réécrit *tous* les identifiants. Sans report, chaque narration d'un
   module serait devenue orpheline à l'assemblage, et la purge l'aurait effacée sans un mot.
2. **L'export autonome** embarque le document entier dans le fichier produit
   (`window.ADOC_EXPORT_DOC`). La narration en est retirée — en un seul endroit, parce qu'il n'y a
   qu'un seul embarquement.
3. **L'enregistrement** purge les orphelines et **nomme** ce qu'il retire, en console.

**Un cas limite trouvé en éprouvant les quatre tailles de carte.** Insérer un premier bloc dans une
diapositive de titre fait passer son étape unique de l'identifiant de la **carte** à celui du
**bloc** — et ce geste-là, lui, existe. Sans report, la narration d'une diapositive de titre
disparaissait au premier enregistrement suivant. C'est la **seule** transition qui perde un
identifiant, et c'est pourquoi c'est la seule traitée : de 1 à 2 blocs comme de 2 à 1, l'identifiant
du bloc concerné reste une étape.

**L'écrasement.** L'écriture en lot refuse de remplacer une narration déjà écrite sans
`remplacer: true`, et rend la liste des refus. « Jamais écrasée sans confirmation » est ainsi une
propriété de la fonction, et non une consigne d'usage.

**Le champ dans l'éditeur.** Visible uniquement dans une Présentation, et seulement quand la
sélection désigne une étape — par le mécanisme de révélation déjà en place, celui qui masque les
outils de liste hors d'une liste. Sélectionner le titre d'une diapositive désigne sa première
étape, sans quoi une diapositive de titre n'aurait aucun moyen d'être narrée. Compte de mots et
durée annoncée comme **indicative** (mots ÷ 2,5 par seconde), jamais comme une mesure. Aucune règle
CSS nouvelle, aucun pictogramme ajouté. Vouvoiement et absence d'emoji vérifiés par le test.

---

## 3. Vérifié par script

| | Résultat |
|---|---|
| `verify-narration-schema` | **7/7** — champ optionnel, objets clos, texte vide refusé, narration refusée sur une carte et sur un bloc, les deux copies concordent |
| `verify-narration-etapes` | **13/13** — règle d'étape sur 0/1/2/4 blocs, concordance donnée/rendu, réordonnancement, déplacement entre cartes, suppression, duplication, insertion dans une carte vide, écriture en lot, compte de mots, aller-retour d'enregistrement, absence des exports, point d'embarquement unique |
| `verify-narration-editeur` | **6/6** — champ visible au bon endroit, frappe qui atteint le document, deux étapes qui ne débordent pas l'une sur l'autre, étape sans narration valide, champ masqué hors Présentation |
| `falsifier-narration` | **5/5 mutations détectées**, source restaurée à empreinte identique |
| Régression ciblée | **22 tests, 0 échec** |
| Empreinte du schéma d'outil | `b1b0155cb8eba26c`, 6679 o — **avant et après**, inchangée |

**La falsification.** Un test qui passe ne prouve rien tant qu'on n'a pas montré qu'il échoue quand
il le doit. Cinq mutations retirent chacune une garantie ; les cinq sont détectées. Une sixième a
été essayée puis **écartée** : remplacer `<= 1` par `< 1` dans la règle d'étape ne casse rien parce
que les deux écritures sont **équivalentes** — à un bloc, les deux branches produisent la même
étape unique. Ce n'était pas un trou du test, et l'équivalence est notée dans le falsificateur
plutôt que passée sous silence.

**Les trois gestes qui n'existent pas** — déplacer entre cartes, supprimer, dupliquer — sont
éprouvés sur la **donnée**, par la mutation exacte que chacun produirait. Cela fixe l'invariant le
jour où ils arriveront ; cela ne prouve rien sur une interface qui n'est pas écrite.

**L'absence des exports, précisément.** Vérifiée directement sur l'aperçu, l'export HTML et l'export
autonome, avec une sentinelle. PDF, PPTX et JPEG partent du HTML rendu, déjà vérifié, et ne
sérialisent pas le document : ce n'est pas éprouvé directement mais **déduit**, et le test interdit
tout second point d'embarquement du document. Le DOCX du document clinique **n'existe pas** :
`adocExport('docx')` exporte la conversation, et la route DOCX de génération dérive du HTML produit.

---

## 4. À vérifier par Christophe

1. **Le champ à l'usage.** Ouvrir une Présentation, sélectionner une étape, écrire. Le libellé
   d'étape est-il celui que vous attendez (« Diapositive « … », étape 2 sur 4 ») ? La durée
   indicative vous parle-t-elle, ou préférez-vous une autre vitesse que 2,5 mots par seconde ?
2. **La duplication.** Décision à acter : aujourd'hui, dupliquer un bloc donnerait une étape
   **neuve, sans narration**, l'original gardant la sienne. L'autre choix — recopier la narration —
   mettrait les mêmes mots sur deux étapes sans qu'on l'ait demandé. J'ai retenu le premier ; le
   test le fixe, et il se change en une ligne si vous préférez l'autre.
3. **La diapositive de titre.** Sélectionner son titre désigne sa première étape. Est-ce le geste
   que vous attendez, ou faut-il un accès distinct à la narration d'une diapositive entière ?

---

## 5. Corrections à mes dires précédents

- J'avais annoncé **deux copies de `block.schema.json`**. Il n'y en a qu'une sur disque ; la
  seconde copie est l'ensemble des schémas embarqué dans `studio-clinique.html`. Les deux points de
  correctif annoncés existent bien, mais ce sont ceux-là.
- J'avais écrit que, dans la variante « carte indexée », la narration **suivait** la suppression
  d'un bloc. C'était faux : elle devenait orpheline. Vous l'avez relevé ; c'est corrigé, et c'est
  ce qui a décidé l'emplacement.

## 6. Signalé en passant, non corrigé

`adocFusionCanDropBlockType` ne nomme que le Carrousel là où la Présentation porte la même
contrainte de structure (`cardOnlyBlock`), et `adocFusionCommitDrop` ne défait pas son insertion si
le rendu échoue ensuite — contrairement à `adocInsertStructuredBlock`. **Aucun des deux n'est
atteignable aujourd'hui** : les points de dépôt sont posés sur des blocs rendus, qui dans une
Présentation sont tous imbriqués dans des cartes. Hors périmètre de ce lot, laissé tel quel.
