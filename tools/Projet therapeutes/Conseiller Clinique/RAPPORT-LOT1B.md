# RAPPORT — LOT 1b, « Rédiger la narration » (Phase A)

Branche `lot1b-narration-ia`. **Rien n'est fusionné dans `main`, rien n'est déployé.**
Empreinte du schéma d'outil : **`b1b0155cb8eba26c`, 6679 o** — identique avant et après.

---

## 0. La relecture du 8 octobre — les sept corrections

Christophe et Claude ont relu le prompt. Les sept corrections sont appliquées, chacune dans son
propre commit, chacune avec sa vérification et sa mutation.

| # | correction | ce qui a changé |
|---|---|---|
| 1 | **règle des nombres** | « un couple sur trois » ressemblait à une statistique et invitait à en produire. Remplacé par « douze semaines », « trois mois », et la règle manquante est écrite : jamais un chiffre absent du document, ni proportion, ni pourcentage, ni durée, ni effectif |
| 2 | **sujet** | « sur le couple » était en dur, alors que le dossier porte aussi l'attachement et la panique : le prompt se serait trompé de sujet cinq fois sur six. Le titre du document est transmis et nommé |
| 3 | **public** | le message transportait « Public : … » sans qu'aucune consigne n'y soit attachée. Trois registres distincts — professionnels, personnes accompagnées, public large — et un repli qui ne suppose rien |
| 4 | **continuité** | rien ne disait que les étapes forment UN texte : la continuité est écrite, aucun exemple réutilisé, la première ouvre sans annoncer le plan, la dernière referme sans récapituler |
| 5 | **inclusivité** | aucun rôle attribué d'office à l'homme ou à la femme ; « l'un » et « l'autre », ou « l'un des deux » |
| 6 | **typographie** | guillemets français ; l'apostrophe droite est **normalisée** toujours, les guillemets droits **appariés** en « … » quand leur nombre est pair, et **refusés** quand il est impair — le seul cas ambigu. Rien n'est silencieux |
| 7 | **répartition** | le poids d'une étape a deux facteurs : le type du bloc et la racine de sa longueur. Mesuré sur la vraie présentation, §2bis |

**Un mot sur le choix du §6.** Le guillemet droit est le vrai danger — c'est le délimiteur du
JSON. L'apostrophe droite n'est qu'une faute de typographie française. Les traiter pareil aurait
gâché un tour de correction sur un détail inaudible ; les traiter tous les deux par
normalisation aurait obligé à deviner si un guillemet seul ouvre ou ferme. D'où la coupure :
normaliser quand c'est sans ambiguïté, refuser quand ça ne l'est pas.

---

## 0ter. Les trois vérifications du 9 octobre

### 1. Quel registre pour quelle audience — mesuré, pas supposé

Le registre est choisi par reconnaissance de motifs. Il fallait donc montrer ce que le code
choisit **réellement** pour la phrase exacte du document, pas ce qu'on espère.

| audience | registre choisi |
|---|---|
| **« Grand public — adultes en couple ou ayant vécu en couple, sans prérequis clinique ou financier. »** | **public large** |
| « clinicien » | professionnels |
| « personnes accompagnées » | personnes accompagnées |
| « patients » | personnes accompagnées |
| *(chaîne vide)* | repli |
| « thérapeutes de couple » | professionnels |
| « couples en difficulté » | personnes accompagnées |

La phrase de Christophe contient « sans prérequis **clinique** », qui passe à un cheveu du motif
des professionnels (« clinicien ») — c'est précisément le genre de coïncidence qui se vérifie au
lieu de se supposer. Elle tombe bien sur **public large**.

**Un trou trouvé en faisant cette vérification** : le motif `couple en` ne reconnaissait pas
« coupl**es** en difficulté ». Corrigé — le motif est devenu explicite sur ce qu'il vise
(`couples? en (difficulté|crise|souffrance|thérapie)`) plutôt que large et approximatif.

Les quatre textes, en entier :

```
[professionnels]
Des professionnels. Vous pouvez nommer un mécanisme par son nom, à condition de l'expliquer
en une phrase. Pas de vulgarisation appuyée, pas de ton pédagogique envers quelqu'un qui
connaît le sujet mieux que la vidéo.

[personnes accompagnées]
Des personnes accompagnées, qui se reconnaîtront peut-être dans ce qui est dit. Redoublez de
précaution : aucune description qui ressemble à un jugement, aucune phrase qui laisse entendre
qu'elles auraient dû savoir. Nommez ce qui se passe sans le qualifier.

[public large]
Un public large (« … »), sans formation. Partez de l'expérience ordinaire avant toute notion.
Aucun terme technique sans une phrase qui l'explique.

[repli, public absent]
Le public n'est pas précisé : écrivez pour quelqu'un sans formation, qui écoute par curiosité
ou parce que le sujet le touche.
```

### 2. L'objectif de la présentation

Le message transporte désormais `Objectif : …`, et le prompt dit quoi en faire : **la première
étape doit faire naître le besoin auquel l'objectif répond, la dernière doit laisser le
spectateur en mesure de faire ce que l'objectif annonce** — sans jamais le réciter. Un document
sans `purpose` ne porte aucune ligne vide. Deux mutations l'éprouvent.

### 3. La fouille avant fusion

Résultats au §8.

---

## 0bis. Trois choses à dire avant le reste

### a) Ce lot ne touche PAS au Worker — mesuré, pas supposé

Le brief demandait une route nouvelle. **Elle n'est pas nécessaire, et l'ajouter aurait un coût
réel** : tout fichier de `Worker/**` arrivant sur `main` déclenche `Deploy Worker`.

Ce qui existe déjà, lu dans `Worker/index.js` : la génération structurée (« appel 2 ») poste au
**proxy racine** du Worker (`handleAnthropicProxy`), et cette route est protégée par la garde
générique :

| protection | valeur mesurée |
|---|---|
| origine autorisée | `https://c-concept-dev.github.io`, unique et figée, jamais `*` |
| clé d'accès | `X-API-Key` obligatoire, **fail-closed** (401 si la clé serveur manque) |
| débit | 60 requêtes / 60 s / IP, fenêtre glissante sur KV |
| route publique ? | **non** — la racine n'est pas dans `ADOC_PUBLIC_ROUTES` |
| journaux | identifiant de requête et statut seulement : ni clé, ni prompt, ni message |

Une route dédiée n'ajouterait rien de tout cela. Le principe **0E** de la gouvernance (« usage
réel avant nouvelle construction ») tranche. `verify-worker-garde-narration` 6/6 l'établit en
exécutant la garde hors ligne, et son dernier contrôle vérifie par `git diff` qu'**aucun fichier
de `Worker/` n'est modifié par ce lot**.

**Conséquence : la Phase B n'a pas de déploiement de Worker.** Si tu veux quand même une route
dédiée (pour un débit propre à la rédaction, ou pour garder le prompt côté serveur), c'est un
chantier distinct — décrit au §7.

### b) Deux décisions du CDC que je n'ai pas pu lire

Le brief renvoie aux décisions « Forme du commentaire à enregistrer » et « Origine du texte
d'écran ». **Aucune des deux n'existe dans les CDC que je peux atteindre** : le fichier
`CDC-v2-atelier-de-montage-3.md` n'est plus sur le disque, et ni `-2.md` (5 octobre, 20 h 31) ni
`Chantiers/CDC-v2-atelier-de-montage.md` ne portent ces intitulés.

J'ai appliqué les deux lignes les plus proches du tableau des décisions ouvertes de `-2.md` :
« **Un commentaire égale une étape** » (retenue : oui) et « **Texte à lire dans la bande rythmo :
texte de la narration IA ou texte importé** ». Si les décisions manquantes disent autre chose,
dis-le-moi ou renvoie-moi le `-3.md` : ce qui en dépend ici est la forme stockée
(`{stepId, text}`, texte brut avec marques de pause) et rien d'autre.

### c) Un défaut du lot 1a corrigé au passage

`adocNarrationCount` comptait `[pause]` comme un mot — alors que **R8** dit qu'une marque de pause
« n'est pas lue ». La durée annoncée sous le champ était donc fausse dès qu'une pause était
écrite. Corrigé à la source, et le module de rédaction **appelle** ce compteur au lieu d'en avoir
un second — vérifié par espionnage, pas par égalité des résultats : deux implémentations qui
coïncident aujourd'hui divergent demain (régression #8).

---

## 1. Le prompt système, tel qu'il part

Rendu depuis le navigateur **pour la présentation réelle de Christophe** — titre, public et
objectif pris dans le document, adresse « vous ». **83 lignes, 5 136 caractères** (56 avant la
relecture du 8 octobre, 79 après ses sept corrections, 83 avec l'objectif du 9 octobre).

```
Vous êtes auteur de scripts de doublage. Vous écrivez le commentaire que dira, à voix
haute, un acteur de doublage, pour une vidéo de psychoéducation.
Le sujet est celui de la présentation fournie, intitulée « L'argent dans le couple : bien plus qu'une question de budget ». Tenez-vous-y :
ne traitez pas d'un sujet voisin parce qu'il vous vient plus facilement.

CE TEXTE SERA DIT, PAS LU.
- Des phrases courtes. Une idée par phrase.
- Des mots simples, ceux de la conversation.
- Du rythme : alternez les phrases brèves et les phrases un peu plus longues.
- Aucune parenthèse, aucun tiret d'incise, aucune énumération à puces, aucune tournure
  qui ne se dit pas (« cf. », « c.-à-d. », « etc. », « voir ci-dessous »).
- Aucun Markdown : ni astérisque, ni dièse, ni tiret de liste, ni guillemet de code.
- Si vous citez, employez les guillemets français : « comme ceci ». N'employez JAMAIS le
  guillemet droit " : il casserait le fichier. L'apostrophe s'écrit ’, jamais '.
- Écrivez les nombres en toutes lettres quand ils se disent ainsi : « douze semaines »,
  « trois mois ». Jamais un chiffre qui ne figure pas dans le document fourni, même pour
  illustrer : ni proportion, ni pourcentage, ni durée, ni effectif inventés.

CE QUE LE COMMENTAIRE FAIT.
Il AJOUTE à la diapositive, il l'ILLUSTRE et il la COMMENTE. Il ne la lit pas et ne la
répète pas. Le spectateur voit le texte à l'écran : le redire est une perte de temps.
Apportez donc : un exemple concret, une image, une nuance, une objection fréquente, ou
une question posée au spectateur. Reliez l'étape à la précédente quand cela aide.

UN SEUL DISCOURS, DU DÉBUT À LA FIN.
Vous n'écrivez pas des commentaires séparés : vous écrivez UN texte continu, découpé en
étapes. Chaque étape reprend là où la précédente s'est arrêtée.
- Ne réutilisez jamais un exemple, une image ou une comparaison déjà employés. Si vous avez
  parlé d'une porte fermée à l'étape deux, n'y revenez pas à l'étape sept.
- La PREMIÈRE étape ouvre la vidéo : elle pose la question à laquelle tout le reste répond.
  Ne commencez pas par « Dans cette présentation, nous allons voir… ».
- La DERNIÈRE étape referme. Elle ne récapitule pas mécaniquement ce qui a été dit : elle
  laisse le spectateur avec une chose à emporter, ou une question à se poser.
- Le message vous donne l'OBJECTIF de la présentation. C'est lui qui décide de ces deux
  étapes : la première doit faire naître le besoin auquel l'objectif répond, la dernière
  doit laisser le spectateur en mesure de faire ce que l'objectif annonce. Ne récitez
  jamais l'objectif : il se voit dans ce que vous écrivez, il ne se dit pas.

CE QUI EST INTERDIT.
- Aucune statistique, aucun pourcentage, aucune étude, aucune source, aucun nom d'auteur
  qui ne figure pas déjà dans le document fourni. Si le document n'en donne pas, n'en
  inventez aucun : parlez sans chiffre.
- Toute affirmation factuelle doit venir du document fourni.
- Les exemples sont annoncés comme des exemples : « Imaginez un couple où… »,
  « Prenons le cas de… ». Jamais un cas présenté comme réel.
- Aucun diagnostic, aucun conseil adressé à une personne en particulier, aucune promesse
  de résultat thérapeutique.
- Aucun jargon. Si un terme technique est indispensable, expliquez-le en une phrase.
- N'attribuez jamais d'office un rôle à l'homme ou à la femme : ni celui qui se tait, ni
  celle qui demande, ni l'inverse. Dites « l'un » et « l'autre », ou « l'un des deux ».
  Un couple n'est pas forcément un homme et une femme, et le rôle décrit n'appartient à
  aucun des deux par nature.

LE TON.
Chaleureux, posé, jamais culpabilisant. Vous ne jugez personne. Vous ne vous adressez pas
à « ceux qui ont un problème », mais à quelqu'un qui écoute et se reconnaîtra peut-être.
Adressez-vous au spectateur en disant « vous ». Jamais « tu ».

À QUI VOUS PARLEZ.
Un public large (« Grand public — adultes en couple ou ayant vécu en couple, sans prérequis clinique ou financier. »), sans formation. Partez de l'expérience ordinaire avant toute notion. Aucun terme technique sans une phrase qui l'explique.

CE QUE CE DOCUMENT EST.
Une présentation clinique dont la relecture humaine est requise. Votre commentaire est un
BROUILLON que le thérapeute relira et corrigera. Ce n'est jamais une validation clinique,
et vous n'avez pas à faire comme si c'en était une.

LES PAUSES.
Vous pouvez marquer un silence avec [pause] pour une respiration courte, ou [pause 2 s]
pour une durée précise. Ces marques ne sont pas prononcées et ne comptent pas dans les
mots. Servez-vous-en pour laisser une question respirer, jamais plus d'une fois ou deux
par étape.

LA LONGUEUR.
Chaque étape porte une cible en mots. Respectez-la à 20 % près
(au minimum 5 mots d'écart tolérés). C'est une contrainte de montage :
le commentaire doit tenir dans le temps où l'image est à l'écran.

VOTRE RÉPONSE.
Uniquement un tableau JSON, rien avant, rien après, sans bloc de code :
[{"stepId": "...", "text": "..."}]
Exactement un élément par étape demandée, dans le même ordre, avec les identifiants
exacts. Aucun identifiant inventé, aucun oublié. Le champ "text" est du texte brut,
en français.
```

**Le message utilisateur**, pour la même présentation : 102 lignes, 8 521 caractères. Il porte le
titre, le public, **l'objectif**, la durée visée, puis par étape l'identifiant, la cible en mots,
ce qui est déjà à l'écran et le contenu de l'étape. Son en-tête :

```
Titre de la présentation : L'argent dans le couple : bien plus qu'une question de budget
Public : Grand public — adultes en couple ou ayant vécu en couple, sans prérequis clinique ou financier.
Objectif : Sensibiliser le grand public aux enjeux relationnels, émotionnels et de pouvoir que l'argent introduit dans la vie de couple — et ouvrir des pistes concrètes pour en parler autrement.
Durée visée pour l'ensemble : 8 minutes, soit environ 1197 mots.

Les étapes, dans l'ordre. Écrivez un commentaire pour CHACUNE :
```

Vérifié : le message ne porte ni `sourceSnapshotId`, ni `citationLinks`, ni `renderManifestId`,
ni `contentChecksum`, ni `documentId`, ni `versionId`, ni `requestId`.

---

## 2. Les nombres, et d'où ils viennent

| réglage | valeur | d'où elle vient |
|---|---|---|
| mots par seconde | 2,5 | N3 du CDC, déjà dans le lot 1a — relue, jamais redéclarée |
| durée proposée | 8 min | proposition de départ, modifiable de 1 à 60 |
| **minimum par étape** | **15 mots** | ≈ 6 s. En dessous, l'image change avant que l'oreille ait suivi |
| **maximum par étape** | **120 mots** | ≈ 48 s. Au-delà, le spectateur regarde une image fixe trop longtemps |
| **tolérance** | **± 20 %, plancher ± 5 mots** | 20 % de 60 mots = 12 mots ≈ 5 s, inaudible. Le plancher évite de refuser une cible de 15 mots pour 3 mots d'écart |
| budget de délai | **90 s pour 8 000 jetons, proportionnel** | la règle maison. Plancher 45 s = le délai de transport de l'appel 2 existant ; plafond 300 s |
| jetons | `mots × 1,6 × 1,25 + 500`, plafond 16 000 | 1,6 jeton par mot en français, +25 % pour l'enveloppe JSON |
| modèle | `claude-sonnet-4-6` | celui de la génération existante, jamais un autre choisi ici |
| borne d'entrée | 60 000 caractères | refus AVANT l'appel, plutôt qu'un message obscur du fournisseur |
| marques de pause | `[pause]` et `[pause 2 s]` | R8. Crochets : rien d'un texte français courant n'y ressemble |

**Une honnêteté que le code porte** : la durée visée n'est pas toujours atteignable. Huit étapes
plafonnées à 120 mots ne peuvent pas porter dix minutes — 960 mots, soit 6,4 min. Le moteur le
**dit** (`atteignable: false`, `limite: 'plafond'`) et l'aperçu l'affiche, au lieu de livrer
6,4 min en silence.

---

## 2bis. La répartition, mesurée sur « L'argent dans le couple »

19 étapes, 8 minutes, **aucun appel au modèle** — le calcul est entièrement local
(`tests/mesure-repartition-reelle.cjs`).

```
════════════════════════════════════════════════════════════════════════════════════════════════════
« L'argent dans le couple : bien plus qu'une question de budget »
5 diapositives, 19 étapes  —  durée visée 8 min, soit 1200 mots

  diapositive / étape          type           mots du bloc   poids   CIBLE   durée   contenu
  ── L'argent : le grand tabou du couple
    étape 1/4   heading                7      1.59      21 mots    8 s   On parle de tout… sauf de ça.
    étape 2/4   paragraph             23       4.8      64 mots   26 s   Les couples discutent de leur futur, de leur
    étape 3/4   callout               26       5.1      68 mots   27 s   L'argent dans le couple est « une zone souve
    étape 4/4   paragraph             25         5      67 mots   27 s   Pourquoi ce silence ? Parce que l'argent ne 
  ── Ce que l'argent dit vraiment de nous
    étape 1/4   heading                6      1.47      20 mots    8 s   Chaque euro dépensé raconte une histoire.
    étape 2/4   paragraph             24       4.9      65 mots   26 s   Nos comportements financiers viennent de loi
    étape 3/4   list                  44      7.96     107 mots   43 s   L'un épargne par peur du manque — l'autre dé
    étape 4/4   callout               19      4.36      58 mots   23 s   Ce n'est pas l'argent qui crée le conflit. C
  ── Argent, pouvoir et équilibre dans le couple
    étape 1/4   heading                6      1.47      20 mots    8 s   Qui paie décide — vraiment ?
    étape 2/4   paragraph             25         5      67 mots   27 s   Les inégalités de revenus au sein du couple 
    étape 3/4   paragraph             28      5.29      70 mots   28 s   La recherche ethnographique révèle que les p
    étape 4/4   callout               22      4.69      63 mots   25 s   L'idéal d'égalité affiché par les couples ca
  ── Parler d'argent autrement — et le faire vraiment
    étape 1/4   heading               13      2.16      29 mots   12 s   Ce n'est pas une question de budget. C'est u
    étape 2/4   paragraph             28      5.29      70 mots   28 s   Parler d'argent peut devenir une source de c
    étape 3/4   list                  30      6.57      88 mots   35 s   Nommer ses valeurs financières avant de négo
    étape 4/4   questionnaire         72     11.03     120 mots   48 s   Quand vous pensez à l'argent dans votre coup
  ── Ce qu'on retient — 4 idées pour transformer votre regard
    étape 1/3   heading                4       1.2      16 mots    6 s   L'argent, révélateur du couple.
    étape 2/3   list                  73     10.25     120 mots   48 s   L'argent est une zone émotionnelle autant qu
    étape 3/3   quote                 23       4.8      64 mots   26 s   Ce ne sont pas vos revenus qui déterminent l

  total réparti : 1197 mots pour 1200 visés  —  8 min
  atteignable : OUI
  bornes : 15 à 120 mots par étape
```

**Le cas atteignable et le cas qui ne l'est pas**, tous deux mesurés :

| document | étapes | durée visée | réparti | verdict |
|---|---|---|---|---|
| L'argent dans le couple | 19 | 8 min | 1 197 mots pour 1 200 | **atteignable** |
| Essai du passage humain | 8 | 8 min | 960 mots, 6,4 min | **NON** — plafond, 8 étapes bornées |
| Essai du passage humain | 8 | 4 min | 600 mots pour 600 | **atteignable** |

**Les poids, et pourquoi.** Le poids d'une étape a deux facteurs :

1. **Le type du bloc.** `heading` **0,6** — un titre annonce, le commentaire l'ouvre sans le
   développer. `list` **1,2** — plusieurs éléments à illustrer. `questionnaire` et `quiz`
   **1,3** — à expliquer, d'autant que le spectateur d'une vidéo ne peut pas y répondre.
   `table` **1,1** — un tableau se lit mal à l'oral. `image`, `video`, `card` **0,8** — pas de
   texte à commenter, mais une image à faire parler. `paragraph`, `callout`, `quote` **1,0**.
2. **La longueur, par sa RACINE.** Le commentaire ajoute une couche, il ne relit pas : cent mots
   demandent plus que neuf, mais pas onze fois plus. La racine donne un rapport de **3,3** au
   lieu de 11 — le rapport linéaire affamait les titres.

Le résultat se lit dans le tableau : titres **16 à 29 mots** (6 à 12 s), paragraphes **64 à 70**,
listes **88 à 107**, questionnaire **120** (plafond). C'est exactement l'ordre attendu, et c'est
vérifié sur le document, pas sur la table des poids.

---

## 3. Le contrat de réponse

`[{"stepId": "...", "text": "..."}]`, exactement un élément par étape demandée, identifiants
exacts, texte brut, français. Vérifié : identifiant inconnu, étape manquante, doublon, texte vide,
Markdown, trop long, trop court. **Un seul tour de correction**, qui renvoie au modèle sa propre
réponse fautive ET la liste nommée des violations ; puis une erreur qui dit ce qui n'allait pas.
**Jamais de résultat partiel.** Un bloc de code est toléré à la lecture (le modèle en met parfois
un malgré la consigne) — la consigne, elle, l'interdit.

---

## 4. Ce qui est vérifié

| | |
|---|---|
| `verify-narration-ia` | **18/18** — moteur et interface, transport simulé, aucun appel réel |
| `verify-worker-garde-narration` | **6/6** — garde du Worker exécutée hors ligne |
| `falsifier-narration-ia` | **27/27** mutations détectées |
| régression ciblée | **15 tests verts**, dont les 4 du lot 1a |
| empreinte du schéma d'outil | `b1b0155cb8eba26c`, 6679 o, **inchangée** |

Les neuf fixtures de réponse — valide, en bloc de code, étape manquante, identifiant inconnu,
Markdown, trop long, trop court, JSON invalide, réponse vide — produisent chacune le comportement
prévu.

L'interface est vérifiée **sur ce que la page affiche** : le bouton est atteint par le pointeur
(`elementFromPoint`, pas seulement présent dans le DOM), les réglages par défaut sont lus à
l'écran, l'aperçu montre mots, cible et durée pendant que le document reste intact, l'application
écrit et le champ du lot 1a l'affiche, le refus de confirmation ne change rien, l'acceptation
annonce le nombre exact, l'annulation restaure l'état d'avant.

**Une mutation écartée comme équivalente**, consignée plutôt que tue : porter la borne de boucle
de 2 à 4 ne change rien, parce que `if (tour === 1) break;` arrête déjà la boucle. La limite d'un
tour est gardée deux fois. Le contrôle compte désormais les appels (`=== 2`), ce qui attraperait
une vraie levée de la limite.

---

## 5. Mesuré / à juger par Christophe

**Mesuré :** tout le tableau ci-dessus ; que le module ne cause aucune sortie réseau (l'application
en fait 7 au démarrage, qui ne sont pas de ce lot) ; que le Worker n'est pas touché.

**À juger par toi, et que je ne peux pas mesurer :**

1. **La qualité réelle des commentaires.** Elle exige un appel réel, donc ta clé. Je n'ai éprouvé
   que la mécanique : le contrat, les longueurs, le refus. Un texte parfaitement conforme peut
   être plat.
2. **Les bornes 15–120 mots** et la tolérance ± 20 %, à confronter à ta voix réelle.
3. **La durée par défaut de 8 minutes.**
4. **La syntaxe des pauses** `[pause]` / `[pause 2 s]`.
5. **Le ton du prompt** — c'est lui qui décide de tout le reste.

---

## 6. Phase B — l'ordre exact, quand tu écriras « déploie »

**Il n'y a rien à déployer.** Aucun fichier de `Worker/**` n'est touché ; `Deploy Worker` ne se
déclenchera pas. La mise en ligne est celle d'un lot d'application, comme le lot 1a :

1. Je vérifie que `origin/main` n'a pas bougé ; sinon je refais la fusion à l'essai.
2. Je fouille les fichiers de la fusion (chemins absolus, nom d'utilisateur, clés, identifiants
   d'infrastructure), comme pour le lot 1a.
3. Fusion `lot1b-narration-ia` → `main`, sans les commits du lot 2.
4. `🔄 Generate Index` puis `🚀 Pages` publient. **`🚀 Deploy Worker` reste au repos** — je le
   vérifie dans la liste des workflows et je te le montre.
5. Vérification après publication, par requête publique sans connexion : `narration-ia.js` est
   servi, et son empreinte est celle de la fusion.
6. Retour en arrière : `git revert -m 1 <SHA de la fusion>` puis `git push origin main`.

**Ce que tu testes ensuite sur ton site**, avec une **copie** de « L'argent dans le couple »
(« Enregistrer sous », jamais l'original) :

1. Ouvre la copie, clique un bloc, descends jusqu'à **Narration**.
2. **« Rédiger la narration »** → durée 8 min, « vous », « n'écrire que les étapes vides » coché.
3. **« Rédiger »**. Relis l'aperçu : rien n'est encore écrit.
4. **« Appliquer »**, puis **« Annuler ce geste »** pour vérifier que tout revient en arrière.
5. Recommence, applique, et **« Enregistrer »**.
6. Recharge la page, rouvre la copie : les narrations doivent être là.
7. **Exporter → présentation interactive**, puis
   `grep -c "un mot de ta narration" ~/Downloads/*-interactive.html` → doit répondre **0**.

Si le premier appel échoue, le message dira lequel des trois cas : clé refusée (401), débit
dépassé (429), ou pas de réponse dans le budget de délai.

---

## 7. Si tu veux quand même une route dédiée (hors de ce lot)

Elle n'apporterait que deux choses : un **débit propre à la rédaction** — la limite générique est
partagée avec tous les autres appels — et le **prompt gardé côté serveur**, alors qu'il est
aujourd'hui dans le JavaScript public, comme le schéma d'outil l'est déjà. Elle coûterait un
déploiement de Worker et une route de plus à maintenir. Je ne la recommande pas aujourd'hui ;
dis-moi si tu la veux et je la prépare comme un lot séparé, avec son diff et sa Phase B.
