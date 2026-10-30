# Relier une page à un enregistrement — méthode, pièges, et ce qui protège tout seul

Ce document n'est pas un compte rendu. C'est ce qu'il faut savoir **avant** de faire confiance à
un résultat, pour qu'une famille de documents jamais vue ne redécouvre pas des pièges déjà payés.

Il se lit dans cet ordre : d'abord le registre des garde-fous — ce qui vous protège sans que vous
y pensiez, et ce qui ne vous protège pas —, ensuite la marche à suivre, ensuite les familles
traitées une à une.

---

## 1. Registre des garde-fous

La distinction qui compte : un garde-fou **générique** s'applique à toute famille sans
intervention ; un garde-fou **spécifique** suppose que quelqu'un y pense. Le second ne protège
donc pas, il rappelle seulement qu'on aurait pu être protégé.

### Génériques — actifs sans rien demander

| garde-fou | où il vit | ce qu'il empêche |
|---|---|---|
| Identité par empreinte SHA-256 | ID-01, tout le dépôt | Deux fichiers de même nom confondus, un même contenu déposé deux fois |
| Le sidecar n'écrit rien | JOB-06 | Qu'un essai laisse une trace prise ensuite pour un fait |
| **Vivier borné au document** | `borneDuVivier`, `qualifierAssociation` | Qu'un score soit publié alors que les enregistrements présentés ne sont pas prouvés appartenir au document |
| **Pages déduites ⇒ non prouvé** | `fondDesPages` | Qu'une numérotation que rien n'ancre passe pour une lecture |
| Le comparateur juge la page | `comparer` | Qu'un lien juste sur le numéro et faux sur la page compte comme juste |
| Filtre de dépôt sans repli | `roulement.rs` | Qu'un document sans provenance connue reçoive tout au lieu de rien |

Deux remarques sur le vivier borné, parce que c'est le plus coûteux des six.

D'abord, `borne` **n'est pas facultatif** dans la signature de `qualifierAssociation`. Un
appelant qui ne sait pas sur quoi son vivier est borné ne compile pas. C'est ce qui le rend
générique : on ne peut pas oublier de s'en servir.

Éprouvé le 29 octobre sur un dépôt réel, le même document rejoué deux fois par la vraie chaîne :
groupes intacts → vivier 99, **95 liens publiés**, aucune abstention ; groupes vidés → vivier 0,
**0 lien**, abstention `vivier_non_borne`. Les deux moitiés comptent. Un garde-fou qui fait taire
un résultat légitime est inutilisable, et c'est le premier risque qu'il faut écarter avant de se
réjouir qu'il attrape les fautes.

Ensuite, `bornee` est une **preuve, pas une présomption**. Ne rien savoir n'est pas une preuve :
un document dont on ignore le groupe de dépôt n'est jamais borné, et un enregistrement qui ne dit
pas d'où il vient n'est rattachable à personne. Un banc de mesure qui travaille sur un dossier
peut l'affirmer lui-même, mais seulement par une option au nom volontairement long et visible —
`vivierAffirmeParLAppelant` — qu'on repère d'un coup d'œil et qui n'existe sur aucune voie qui
publie.

### Spécifiques — ne protègent que si l'on y pense

| point | état |
|---|---|
| Correction d'orientation | Un bouton manuel existe ; la décision automatique est encore un prototype. Traitée au cas par cas. |
| Lecture réelle des folios | Dépend de ce que la recette déclare : sans lecture `page_imprimee`, les pages sont déduites. Le garde-fou le **signale** mais ne le corrige pas. |

### Épreuves auxquelles il ne faut pas se fier

Une épreuve instable est pire qu'une épreuve absente : elle donne une confiance qu'elle ne
mérite pas. Celle-ci en est une.

`moteur::tests` fabrique son dossier d'essai depuis le numéro de processus
(`paquet_en_miniature`), donc tous les tests du module partagent le même chemin. L'un supprime
l'arborescence pendant qu'un autre la crée, et l'échec tombe sur un test au hasard. Il passe seul,
il tombe en parallèle. À corriger en donnant à chaque test son propre dossier.

---

## 1 bis. Les types de signaux, et ce qui autorise à publier

Un signal est **ce qui a été vu quelque part**. Une déduction est une règle qui conclut en
l'absence de lecture. La distinction décide de tout : un recueil de la bibliothèque a publié
52 liens à confiance pleine parce que sa manière de lire posait en règle que la piste valait le
numéro — rien, absolument rien, n'avait été lu sur ses pages pour l'appuyer.

### La règle, en trois voies

Publier demande **deux lectures indépendantes qui s'accordent**, ou **une lecture et une
vérification humaine consignée**. Sinon, abstention — automatiquement, pour tout document dans ce
cas, et non parce que quelqu'un a décidé de l'activer.

**L'œil ne vaut jamais seul.** Le marqueur de vérification est posé à la main et survit à ce
qu'il décrivait : le 29 octobre 2026, deux documents le portaient — l'un dont les liens avaient
vraiment été écoutés, l'autre dont le marqueur datait d'une époque où ses liens pointaient sur
l'audio d'un troisième recueil. Seul le second n'avait aucune lecture derrière lui, et c'est
cela, et rien d'autre, qui les sépare. Un œil **confirme** une lecture ; il ne la remplace pas.

### Le registre des types, avec leur état de preuve

Un type n'est **actif** que lorsqu'il a produit un résultat juste sur un document réel. Écrit et
compilé ne veut pas dire prouvé.

| type de signal | nature | état au 30 octobre 2026 | ce qui l'établit |
|---|---|---|---|
| Pastille lue sur la page | lecture | **prouvé** | 89 liens publiés sur un recueil, vérifiés à l'oreille |
| Folio imprimé lu | lecture | **prouvé, fragile** | 26 folios sur 29 pour un recueil ; la même lecture déclarée sur un autre rend 0 sur 96 |
| Identifiant dans le nom du fichier | lecture | **écrit, câblé, jamais prouvé** | déclaré par 1 recette sur 4, et aucun document actif n'emploie cette recette |
| Support tiré du dossier (CD1, CD2) | lecture | **écrit, partiellement applicable** | reconnaît 4 dossiers réels (285 enregistrements), aveugle sur `CD 1 [192k]` et sur `[Disc 1]` (190 enregistrements) |
| Relecture ciblée d'une image | lecture | **écrit, jamais déclaré** | aucune recette ne porte de budget de relecture |
| Table imprimée explicite | lecture | **écrit, mesuré, non publié** | 35 rangées justes sur 52 d'une vraie table ; 17 rangées abandonnées plutôt que 4 fausses de plus |
| Zone de marque trouvée sans manière de lire | lecture | **prouvé** | sur un recueil : marque de 4,3 × 3,2 % de la page retrouvée seule sur 8 pages sur 8, puis 21 lectures sur 21 conformes aux liens vérifiés à l'oreille |
| Intitulé du nom du fichier retrouvé imprimé sur la page | lecture | **écrit, éprouvé sur fixture, pas encore sur le corpus** | `accord-nom-contenu.ts` : ce qu'un nom a de distinctif dans son vivier, confronté à la couche texte. Couvre 11 familles de l'éventail d'essai sur 17 ; la famille 03 par un nombre composé (« 6.21 »), les autres par un intitulé |
| Mention de la piste en clair dans le texte de la page | lecture | **observé, rien de câblé** | relevé le 29 octobre sur deux familles : « TRACK 12 » sur une cinquantaine de pages d'un recueil, sur cinq pages d'un autre |
| Folio imprimé porté par le nom du fichier | lecture | **observé, rien de câblé** | 165 enregistrements nommés « … - 123 Pg.67.mp3 » ; le folio du document correspondant n'a jamais été lu, donc rien n'a pu être confronté |
| Champ du nom qui **joint** au lieu d'ordonner | lecture | **manquant** | sur 165 enregistrements, un champ porte 165 valeurs distinctes de 123 à 1005 : une clef de jointure parfaite, qu'aucun détecteur ne sait employer — celui des noms ne cherche qu'un **ordre** et s'abstient |
| Suite croissante des éléments | déduction | actif, et faillible | a retenu une détection à 0,20 contre une à 1,00 sur un recueil |
| Héritage de la piste précédente | déduction | actif | — |
| Égalité posée entre piste et numéro | déduction | actif, et le plus dangereux | 52 liens publiés sans aucune lecture |

### Ce que chaque signal **ne dit pas**

C'est la colonne qui manquait partout, et celle qui décide si la règle est applicable.

- **Le nom de fichier ne dit pas toujours l'élément.** Les 99 enregistrements d'un recueil
  s'appellent `Track NN` : ils portent le rang, rien d'autre. Il n'y a donc rien à corroborer, et
  ce recueil relève de la deuxième voie, pas de la première. Ne jamais supposer qu'un nom
  structuré suffit : mesurer ce qu'il contient.
- **Une lecture déclarée n'est pas une lecture obtenue.** Une recette peut déclarer lire un folio
  et n'en lire aucun. Ce qui compte est le résultat, jamais l'intention — la corroboration se
  calcule donc sur les lignes produites, pas sur ce que la recette annonçait.
- **Un dossier nommé « [Disc 1] » n'est pas reconnu** par le lecteur de support, qui n'attend que
  `CD1`, `CD 2`, `Disque3`. Le support se lit alors dans le nom du fichier, ou pas du tout.
- **Le nombre de lectures ne dit pas qu'on a lu la bonne chose.** Mesuré le 29 octobre : lâché sur
  quatre zones proposées par le détecteur de marques, un moteur de reconnaissance à qui l'on ne
  montre que des chiffres rend 84 lectures sur les lettres d'un libellé — et **zéro** conforme. Ce
  qui sépare la marque du libellé est la **part** des apparitions qui se lisent : 100 % pour la
  marque, 57 %, 64 % et 86 % pour les trois autres zones. Retenir « la zone qui rend le plus de
  lectures » aurait publié 84 faux liens avec l'assurance d'un signal abondant.
- **Une marque trouvée n'est pas une marque lue.** Le détecteur de marques rend des endroits où
  regarder ; c'est la reconnaissance qui dit s'il y a un chiffre, et la confrontation qui dit s'il
  faut y croire. Une zone proposée n'est jamais, à elle seule, un lien.
- **Un nom riche ne donne pas forcément un ordre.** Mesuré à l'aveugle le 29 octobre sur la
  matière d'essai : 165 enregistrements portent huit champs numériques, et le détecteur de noms
  **s'abstient** — deux volumes y recommencent leur numérotation, donc aucun champ ne forme une
  suite complète. L'abstention est juste pour un ordre, et pourtant un de ces champs est une clef
  de jointure parfaite. Un détecteur qui ne cherche qu'un ordre laisse passer ce qui joint.
- **Trente-trois fichiers dont le champ va de 1 à 32** suffisent à faire abstenir, et c'est bien :
  un nom au moins ne porte pas son rang, et deviner lequel reviendrait à inventer un lien.

#### Une limite de la règle de corroboration, vue aujourd'hui et non corrigée

L'indépendance se juge aujourd'hui sur la **provenance** du signal : nom, arborescence, contenu,
croisement. Or deux signaux peuvent venir tous deux du contenu et être pourtant indépendants en
substance — sur un recueil, la mention « TRACK 12 » imprimée au fil du texte d'une page et la
table des pistes imprimée vingt pages plus tôt ne peuvent pas se tromper ensemble. La règle les
compte pour un seul signal et exige donc une vérification humaine, là où la première voie
suffirait. C'est une prudence excessive, pas un trou : elle fait abstenir, jamais publier à faux.
Rien n'a été changé — le jour où une famille en dépendra, il faudra affiner la provenance plutôt
que relâcher la règle.

#### Pourquoi le rang écrit dans un nom ne corrobore rien

Noté ici parce que c'est le piège le plus tentant de toute cette page. Un nom qui commence par
« 07 » ne confirme **pas** une marque lue « 7 ». Dans un vivier de N enregistrements, tout nombre
de 1 à N trouve un fichier : l'accord est une tautologie, et le compter pour un second signal
revient à publier sur une seule lecture en croyant en avoir deux. Quatre familles de l'éventail
d'essai — celles dont les noms sont « Track 51 » ou « Workout #37 » — n'ont donc **aucun** second
signal disponible, et ne peuvent honnêtement publier qu'avec une vérification humaine enregistrée.

De même, une page de sommaire porte tous les intitulés du vivier : elle n'en désigne aucun. Un
accord n'est rendu que lorsqu'**un seul** nom se retrouve sur la page.

### Comment on ajoute un type

Dans cet ordre, et pas autrement : le mesurer sur un document réel, écrire ici ce qu'il donne et
ce qu'il ne donne pas, puis seulement le compter comme lecture. Un type ajouté sur la promesse
qu'il marchera est un type qui publiera un faux lien le jour où il ne marchera pas.

---

## 2. Marche à suivre pour une famille inconnue

L'ordre n'est pas négociable : chaque étape suppose la précédente.

**1. Borner avant de mesurer.** Déposer le document depuis sa propre archive, et vérifier que son
vivier ne contient que ses enregistrements. Un score mesuré dans un vivier qui déborde ne vaut
rien, aussi régulier soit-il — c'est le piège qui coûte le plus cher, parce qu'il ne produit pas
des résultats douteux mais des résultats **faux et confiants**.

**2. Regarder où sont les repères, sur les images, à l'œil.** Pas dans le code, pas dans un
rapport : sur les pages. Où est le numéro de page imprimé, où est le repère d'enregistrement,
quelle forme il a, et quelle est la relation spatiale entre les deux.

**3. Chercher si les noms de fichiers portent déjà la réponse.** C'est le raccourci le plus
rentable, et le plus souvent négligé. Un nom qui porte l'identifiant permet de **corroborer** au
lieu de décréter ; un nom qui porte en plus la page imprimée fournit l'oracle lui-même.

**4. Établir un oracle, et dire de quoi il est fait.** Des repères vraiment lus, ou vraiment
vérifiés à l'œil. Jamais une formule arithmétique — et si une formule sert d'intérim, l'écrire
noir sur blanc dans l'oracle, avec ce qui doit la remplacer.

**5. Vérifier que les pages sont lues, pas déduites.** `fondDesPages` le dit. Une numérotation non
ancrée interdit toute affirmation sur les pages, quel que soit le score sur les numéros.

**6. Confronter à la vraie base, pas à un rapport.** Un score qui n'existe que dans une sortie de
mesure n'est pas appliqué. Lire la version active sur le disque.

**7. S'abstenir, et écrire pourquoi.** Une famille non prouvée reste en abstention explicite avec
sa cause. C'est un résultat, pas un échec.

---

## 3. Les familles, une à une

*(Cette section se remplit famille par famille, au fur et à mesure. Chaque entrée porte la
structure observée, les pièges rencontrés, et pourquoi le moteur générique a dû être calibré
ainsi pour ce cas.)*

### Ce que les noms d'enregistrements portent, mesuré sur 116 archives

C'est le relevé à consulter en premier devant une famille nouvelle, parce qu'il décide de la
difficulté bien plus que la mise en page des documents.

| famille | documents | enregistrements | identifiant dans le nom |
|---|---:|---:|---|
| premier recueil d'entraînement | 1 | 52 | 100 % — `01 - … #1.mp3` |
| recueil à numérotation composée | 2 | 198 | 99 % — l'identifiant est de la forme `chapitre.rang` |
| recueil en deux volumes | 2 | 165 | **165/165** — disque, rang, section, identifiant **et page imprimée** |
| grande collection | 105 | 1 405 | 1 % — des intitulés d'œuvres, pas des numéros |

La leçon générale : **la famille dont les documents paraissent les plus difficiles n'est pas
celle dont le travail est le plus difficile.** Le recueil en deux volumes semblait le cas dur —
pages couchées, repères mal ciblés. Mais ses noms de fichiers contiennent la table complète, page
imprimée incluse : il porte son propre oracle, et il est devenu le cas le plus simple. À
l'inverse, la grande collection n'a aucun numéro dans ses noms : elle demande un appariement par
intitulé, mécanisme qui n'existe pas encore.

Devant une famille nouvelle, lire les noms de fichiers **avant** d'ouvrir les documents.

---

## 4. Ce qui est arrivé, et qu'on ne veut pas revivre

Trois pannes réelles, gardées ici parce qu'aucune n'était visible dans un score.

**Le vivier global.** Des enregistrements de toute la bibliothèque étaient présentés à chaque
document. Conséquence : le recueil dont les noms passaient en tête de l'ordre alphabétique
remportait chaque rang demandé. Un recueil a donc reçu les enregistrements d'un autre — 52 liens,
tous faux, tous cohérents, aucun signalé. Et le recueil qui arrivait premier a reçu les siens :
sa justesse n'était pas une propriété, c'était l'ordre alphabétique. Un résultat juste par
accident ressemble en tout point à un résultat juste.

**L'écran où l'on juge.** L'essai d'une manière de lire, celui qu'on regarde pour décider si une
recette fonctionne, présentait lui aussi toute la bibliothèque — alors que la file, elle, était
déjà bornée. Corriger la voie automatique sans corriger l'écran de décision laisse la panne là où
elle fait le plus de dégâts : dans le jugement humain.

**La page supposée.** Une recette sans lecture `page_imprimee` déduit les pages depuis le rang du
cliché. Sur un document comportant deux feuillets de garde, tout est décalé d'un rang — et le
score sur les numéros reste parfait, parce qu'il ne regarde pas la page. D'où le comparateur qui
juge la page, et le garde-fou qui refuse de parler de pages non ancrées.

### Élire un endroit parce qu'il « se lit » — 30 octobre 2026

Le détecteur de marques récurrentes rend une poignée d'endroits où une même forme revient ; il
fallait choisir lequel porte la marque. La règle posée était **la part de l'échantillon qui se
lit**. Elle a élu la bonne zone sur le document témoin, et une **forme de notation** sur huit
familles de l'éventail d'essai sur dix-huit : 699 marques proposées là où le vivier n'a que 99
enregistrements, 113 là où il en a 9, 169 là où il en a 37.

La cause n'est pas un seuil mal réglé. La règle ne pesait pas **ce qui est lu**, seulement **que
ça se lit** — et la reconnaissance, avec une liste blanche de chiffres, rend un chiffre de presque
n'importe quelle forme sombre.

Deux fausses pistes écartées par la mesure avant de trouver la vraie :

- **Le remplissage de la forme.** La vraie marque remplit sa boîte à 0,39–0,47 ; les formes de
  notation à 0,41–0,63. Le seuil en place est 0,45 : il écarte la marque avant les imposteurs.
- **L'avance de la suite lue.** Une forme que la reconnaissance lit « 7 » partout ne recule
  jamais : elle vaut 1,00. La vraie marque vaut 0,91, parce que sa première apparition est sur une
  page de garde.

Ce qui sépare est la conjonction de trois mesures, et aucune ne suffit seule :

```
vraie marque   →  5 3 15 23 29 43 52 58 64 72 78 85     12 lues, 12 distinctes, avance 91 %  → 91 %
forme lue 7    →  7 7 7 7 · 7 · 7 7 7 7 ·                9 lues,  2 distinctes, avance 100 % → 17 %
forme bruyante →  4 1 7 1 · 7 7 7 7 1 4 7               11 lues,  3 distinctes, avance  70 % → 17 %
lit à peine    →  · 7 · · · · 6 4 · · · ·                3 lues,  3 distinctes               → < 20 %
```

**Une marque qui désigne un enregistrement est une numérotation : elle se lit, elle nomme une
chose différente à chaque fois, et elle avance. Une forme est une forme.** Sur les douze mesures
du document témoin, les onze imposteurs plafonnent à 25 % et la marque atteint 91 % : le seuil de
50 % tombe au milieu d'un vide.

## L'éventail entier, et les trois défauts qu'il a montrés — 30 octobre 2026

Dix-sept familles passées par la seconde voie, dix-huit documents, 1 606 endroits mesurés. Aucune
publication, et trois défauts génériques dont deux fabriquaient des liens.

### Le second signal ne lisait qu'une couche texte, et le corpus n'en a aucune

Mesuré : **zéro caractère de couche sur les dix-sept familles.** Elles sont toutes numérisées. Un
signal qui ne consulte que la couche était donc du code mort en production, et le journal le disait
dix-sept fois sans que rien ne s'en alarme.

Le socle savait déjà faire : `ocrDUnePageGrise` existait dans le chemin du texte, conduites de
points effacées comprises (FMT-04), et n'était pas partagée. La voie garde déjà ses pages en gris
pour y chercher des formes ; elle les lui passe désormais, et **seulement pour les pages qui
portent une marque** — ailleurs un nom retrouvé ne confirme ni ne contredit rien.

### Un nombre composé est un rang quand il est en tête du nom

La règle gardait les nombres composés au motif qu'ils « ne se confondent pas avec un rang ».
Relevé sur deux lots de 92 et 73 enregistrements : ils se nomment « 1-01 », « 1-02 », « 2-01 » —
un support et une place. **165 noms passaient pour distinctifs en ne portant que leur propre
position**, et il suffisait qu'une page imprime « 1.01 » pour fabriquer une confirmation.

Ce qui sépare n'est pas la forme mais la place : une numérotation est en tête, le contenu suit. On
ne lit donc un nom qu'à partir de sa première lettre. « 1-01 12_8 … Pg.67 » ne rend plus rien, et
c'est juste — son signal est ailleurs. « 02-… #5.1 » garde « 5.1 », qui est bien ce que ce nom
désigne.

| | avant | après |
|---|---|---|
| noms tenus pour distinctifs, deux lots | 165 / 165 | 0 |
| noms distinctifs ailleurs | inchangés | inchangés |

### Une régularité montrée sur deux lectures est gratuite

`avance` était un taux sur ses couples : avec deux lectures, un seul couple, « ne recule pas »
vaut 1,00 sans rien prouver. Le plancher de 50 % devenait alors atteignable par pure arithmétique
— deux lectures sur quatre, deux valeurs distinctes, un couple croissant font exactement 0,50.
C'est ainsi qu'une **ligne plate du bord droit de la page**, 6,6 × 0,8 % et lue 3 fois sur 6, a été
élue sur une famille et a rempli six attributions par déduction.

Le code portait déjà la bonne phrase : « une seule lecture n'avance ni ne recule : elle ne prouve
rien, et vaut donc zéro ». Il suffisait de la porter jusqu'au bout — `sansRecul / (couples + 1)`
plutôt que `sansRecul / couples`. Le cas particulier d'une lecture unique **disparaît** : il
devient une conséquence (0 / 1 = 0) au lieu d'une exception, et c'est le signe que la forme est la
bonne et non un réglage.

Sur les 1 606 endroits mesurés, les neuf qui atteignaient le plancher se réduisent à quatre :

```
01  marque prouvée   12/12   91 % → 83 %   gardée
09                   10/10   71 % → 64 %   gardée
04                    8/12   67 % → 58 %   gardée
08                   12/12   55 % → 50,0 % sur le fil, et il faut le dire
14                     5/7   54 % → 43 %   écartée
17                     6/8   50 % → 42 %   écartée
11                     3/6   50 % → 33 %   écartée
14                     2/4   50 % → 25 %   écartée
```

### Ce que l'éventail dit du matériau, et qui n'est pas un défaut

| Ce que les noms portent | Familles | Second signal |
|---|---|---|
| le rang seul | 01, 04, 05, 07 | **aucun** — « Track 01 », « Workout #1 » |
| un titre | 02, 06, 10, 11 à 17 | oui |
| un numéro composé après la première lettre | 03 | oui, 99 / 99 |
| un titre et la page imprimée | 08, 09 | **pas encore lu** — « Pg.67 » |

Quatre familles ne peuvent pas publier sans oreille humaine, et c'est juste : leurs noms ne
portent que le rang, donc un seul type de lecture existe dans la matière. Deux familles portent
leur page imprimée dans leur nom — un lien page-vers-enregistrement plus direct qu'une
corroboration — et aucun mécanisme ne la lit encore. C'est la pièce suivante, nommée, pas un
échec.

Reste le constat le plus lourd : **la famille 03 porte 99 noms distinctifs sur 99 et aucune
marque** — sa numérotation est imprimée en texte, pas en pastille. Le signal le plus fort de tout
l'éventail est inaccessible parce que toute la voie commence par trouver une marque. Un document
entièrement déterminé par ses noms ne peut pas être lu par un chemin qui exige une pastille.
