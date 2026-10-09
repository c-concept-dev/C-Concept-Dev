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

## 0. LES CORRECTIONS APRÈS LE PREMIER ESSAI RÉEL (9 octobre)

Premier appel réel : câblage correct, 19 étapes reçues, un tour de correction. **Christophe garde
14 étapes sur 19 telles quelles (74 %)** et en refuse cinq. Les cinq défauts sont reproduits sur
des fixtures **neutres** — aucun contenu réel n'entre dans un test.

### Le prompt système — cinq ajouts

| | |
|---|---|
| **tiret** | « aucun tiret d'incise » devient « Évitez les longues incises entre tirets ; un tiret ponctuel est acceptable. » |
| **listes et questionnaires** | une section entière : ne pas parcourir élément par élément, choisir UN élément, ne jamais lire les questions, n'en ajouter aucune |
| **citations** | mots exacts entre « », et **jamais d'attribution à un groupe que le document ne nomme pas** |
| **adresse** | « Un seul pronom d'adresse dans tout le texte. Avant de répondre, relisez. » |
| **deux exemples** | sur un sujet neutre (un jardin), avec la consigne de ne jamais les reprendre |

Le prompt passe de 83 à **108 lignes, 6 539 caractères**. Rendu complet au §0bis.

### La politique de violation

**Bloquantes** (un tour de correction, puis échec) : réponse illisible, étape manquante, inconnue
ou en double, texte vide, Markdown, guillemet droit non apparié.

**La longueur ne bloque plus.** Elle est signalée par étape, et ne déclenche un second tour que si
un écart dépasse la moitié de la cible, ou si plus du quart des étapes sont hors tolérance. Le
9 octobre, −7 % était parfaitement utilisable : le refuser aurait coûté un appel pour rien. Le
plancher de tolérance des titres passe à **8 mots** (un titre se commente en une phrase, dont la
longueur varie).

### Les cinq avertissements, non bloquants, sous chaque étape

| avertissement | seuil | mesuré sur fixtures neutres |
|---|---|---|
| « reprend N mots de suite de l'écran » | ≥ 8 mots de suite **ou** ≥ 20 % de trigrammes communs | 11 mots / 61 % sur la liste parcourue |
| « parcourt la liste élément par élément » | ≥ 3 éléments dont ≥ 40 % des mots sont repris | 3 éléments sur 3 |
| « passe au tu » / « passe au vous » | pronom de l'autre adresse, **hors citations** | détecté |
| « citation non identique à l'écran » | tout passage entre « » doit se retrouver tel quel | détecté sur la citation tronquée |
| « phrase de N mots » | > 30 mots | détecté |

**Un défaut trouvé par mon propre témoin** : une citation **exacte** — que le prompt EXIGE —
déclenchait l'alerte de reprise, puisqu'une citation est par construction une longue suite
commune. La mesure de reprise ignore désormais les passages entre guillemets. Sans ce témoin,
l'avertissement aurait crié sur exactement ce qu'on demande.

### Le total affiché est la mesure, jamais la cible

La ligne d'état annonçait « 1 197 mots répartis » quand 1 109 avaient été reçus : 1 197 était la
**cible**. Elle affiche désormais, mesuré sur une fixture neutre :

```
458 mots reçus, cible 720, −36 %, environ 3.1 min pour 4.8.
```

### En cas d'échec, et « Réécrire cette étape »

L'erreur cite **chaque tour**, pas seulement le dernier, et un bouton **« Voir la réponse du
modèle »** montre le brut (passé par `sansCle`). Chaque étape de l'aperçu porte un bouton
**« Réécrire cette étape »** avec un champ de consigne libre : l'appel ne transporte **qu'un seul
`stepId`**, plus l'en-tête du document, les commentaires voisins pour la continuité, la cible et
la consigne. Il remplace le texte **dans l'aperçu seulement**.

**Proposition pour l'éditeur** (non implémentée) : le même bouton sous le champ Narration du lot
1a, agissant sur l'étape sélectionnée, avec le texte actuel comme point de départ et un
« Annuler ce geste » qui restaure le texte d'avant. Il faudrait décider s'il écrit directement
dans le document (avec confirmation) ou s'il ouvre le même aperçu à une seule étape.

### Contradictions avec le CDC, signalées et non corrigées

- Le chemin `~/Documents/Studio-Clinique-CDC/CDC-v2-atelier-de-montage.md` **n'existe pas**. La
  copie la plus récente est `Chantiers/CDC-v2-atelier-de-montage.md` (6 octobre, 39,9 Ko).
- **N7, V8, V9, V10 et Ef4 n'existent dans aucune copie du CDC** que je peux atteindre : les plus
  hautes y sont **N6, V7 et Ef3**. J'ai travaillé sur les définitions données par le brief.
  Le CDC n'est pas modifié.

---

## 0bis. Le prompt système, tel qu'il part (108 lignes)

```
Vous êtes auteur de scripts de doublage. Vous écrivez le commentaire que dira, à voix
haute, un acteur de doublage, pour une vidéo de psychoéducation.
Le sujet est celui de la présentation fournie, intitulée « Ranger un atelier ». Tenez-vous-y :
ne traitez pas d'un sujet voisin parce qu'il vous vient plus facilement.

CE TEXTE SERA DIT, PAS LU.
- Des phrases courtes. Une idée par phrase.
- Des mots simples, ceux de la conversation.
- Du rythme : alternez les phrases brèves et les phrases un peu plus longues.
- Aucune parenthèse, aucune énumération à puces, aucune tournure qui ne se dit pas
  (« cf. », « c.-à-d. », « etc. », « voir ci-dessous »).
- Évitez les longues incises entre tirets ; un tiret ponctuel est acceptable.
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

SI L'ÉCRAN MONTRE UNE LISTE OU UN QUESTIONNAIRE.
Ne les parcourez pas, élément par élément, dans l'ordre : le spectateur les lit lui-même.
Choisissez UN élément et illustrez-le par un exemple, ou dites ce qui relie tous les
éléments, ou posez une seule question qui les résume. Pour un questionnaire, ne lisez
jamais les questions : invitez le spectateur à y répondre pour lui-même, en une ou deux
phrases. N'ajoutez aucune question qui ne figure pas à l'écran.

SI VOUS CITEZ LE DOCUMENT.
Reprenez ses mots exacts, entre guillemets français, sans en retirer ni en ajouter.
N'attribuez jamais une phrase ou une idée à un groupe (« les chercheurs », « les
spécialistes », « ceux qui travaillent avec des couples ») que le document ne nomme pas.
Si le document ne dit pas qui parle, ne dites pas qui parle.

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
Un seul pronom d'adresse dans tout le texte. Avant de répondre, relisez : aucun « toi »,
« tu », « ton », « ta », « tes » dans un texte en « vous » (et réciproquement).

À QUI VOUS PARLEZ.
Un public large (« Grand public — personnes qui bricolent chez elles »), sans formation. Partez de l'expérience ordinaire avant toute notion. Aucun terme technique sans une phrase qui l'explique.

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

DEUX EXEMPLES, POUR LA DIFFÉRENCE.
Écran : « Un bon jardin se prépare en hiver. »
✗ Un commentaire qui répète : « Pour avoir un beau jardin, il faut le préparer pendant
  l'hiver. »
✓ Un commentaire qui ajoute : « Ceux qui jardinent le savent : le travail qu'on ne voit
  pas est celui qui compte. [pause] Pendant que la terre dort, vous décidez déjà de ce
  qui poussera. »
Ces deux exemples illustrent la différence ; ne les reprenez jamais, ni leurs images.

VOTRE RÉPONSE.
Uniquement un tableau JSON, rien avant, rien après, sans bloc de code :
[{"stepId": "...", "text": "..."}]
Exactement un élément par étape demandée, dans le même ordre, avec les identifiants
exacts. Aucun identifiant inventé, aucun oublié. Le champ "text" est du texte brut,
en français.
```

---

## 0ter. LE DÉFAUT DU 9 OCTOBRE — un faux transport ne prouve rien sur le câblage réel

Christophe a cliqué « Rédiger » sur son site, connecté, et a reçu :

> Rédaction impossible : adresse du Worker non configurée.

**Aucun appel n'est parti.** Mes 18 contrôles passaient tous.

### La cause, confirmée dans le cœur publié

`adocGetWorkerUrl` (ligne 359) et `adocGetApiKey` (ligne 399) sont déclarées **dans l'IIFE qui
commence ligne 31**, sans aucune affectation sur `window`. Le module ne pouvait pas les voir.
Mesuré dans la page, pas seulement lu : `typeof window.adocGetWorkerUrl` → `undefined`.

### Pourquoi mes contrôles ne l'ont pas vu

**Ils employaient tous un transport simulé.** Le transport injecté sautait précisément les deux
lignes qui cherchaient ces fonctions. J'avais éprouvé la répartition des mots, le contrat de
réponse, l'aperçu, la confirmation, l'annulation — tout sauf **le seul chemin qui mène au
serveur**. C'est la même famille que le 7 octobre : un contrôle qui interroge ce que le code
déclare, au lieu de ce que la page fait.

### Deux défauts de plus, trouvés en vérifiant les sept autres noms

Christophe demandait de vérifier **tout** ce que le module prend sur `window`. Le balayage en a
trouvé deux autres, silencieux :

| nom | état avant | conséquence |
|---|---|---|
| `ADOC_NARRATION_MOTS_PAR_SECONDE` | jamais exposé | le module retombait sur sa copie en dur — **deux vérités**, alors que mon commentaire affirmait le contraire |
| `ADOC_NARRATION_PAUSE_MOTIF` | exposé **avant** sa ligne d'affectation | une `var` est hissée mais **vide** : `window.X = undefined`, sans la moindre erreur. Le module retombait sur sa copie |

Le second est instructif : une `const` exposée trop tôt **plante bruyamment** (c'est ce qui m'est
arrivé le 8 octobre) ; une `var` **ment tranquillement**. Les deux constantes sont désormais
exposées juste après leur déclaration.

### La correction : injection, sans jamais poser la clé sur `window`

Le cœur passe deux fonctions au module quand il le branche :

```js
window.NarrationIA.brancher(narrBoite, {
  urlWorker: function () { return adocGetWorkerUrl(); },
  cleApi:    function () { return adocGetApiKey(); },
});
```

Le module les garde **dans sa portée**, jamais sur `window`, et ne conserve pas la clé : il
appelle `cleApi()` au moment de l'envoi. Un `sansCle()` retire la clé de tout message d'erreur
avant qu'il soit levé — un message d'erreur est une chose qui se copie-colle.

### Le contrôle qui manquait

Le **vrai** `transportReel`, dans la **vraie** page, déclenché par le **vrai** bouton, avec
`fetch` seul simulé. Et le témoin de l'URL ne vient pas du module : c'est l'hôte que
l'application appelle **d'elle-même** au démarrage, relevé sur son trafic.

```
POST <l'adresse du Worker, la même que celle des appels de l'application>
  payload.model claude-sonnet-4-6, max_tokens 1700, X-API-Key présent
  401 → « le serveur a refusé l'appel (401 — Unauthorized) » — sans la clé
```

Un second contrôle **balaye la source du module** à la recherche de `window.<nom>` et vérifie
chacun dans la page. Il n'est pas écrit à la main : un nom ajouté demain sera vérifié sans que
personne y pense. **9 noms, tous atteignables.**

### Le budget de délai : plancher porté de 45 à 90 s

Les 45 s venaient du délai de **transport** de l'appel 2, qui se réarme à chaque octet reçu :
c'est un seuil de **silence**, pas une durée totale. Ce transport-ci n'écoute pas un flux, il
attend une réponse entière — environ 3 000 jetons pour 1 200 mots, qui dépassent couramment
45 s. Le précédent qui convient est l'autre minuterie du même appel, la **sémantique**, portée à
120 s après mesure. 90 s se place entre les deux et coïncide avec la règle maison à 8 000 jetons.

### La leçon, pour la gouvernance

**Un faux transport ne prouve rien sur le câblage réel.** Un test qui injecte sa propre porte de
sortie mesure tout sauf la porte. Trois règles :

1. **Tout point d'injection doit avoir un contrôle qui ne l'emprunte pas.** Si une dépendance est
   injectable pour les tests, il faut au moins un contrôle qui exécute la vraie, en ne simulant
   que la couche la plus basse — ici `fetch`, pas le transport.
2. **Un module séparé ne voit que ce qui est sur `window`.** Ce que le cœur déclare dans son IIFE
   lui est invisible. La liste de ce qu'il y prend se **balaye**, elle ne s'écrit pas à la main.
3. **Une `var` exposée avant sa ligne d'affectation pose `undefined` sans erreur.** Exposer une
   valeur se fait après sa déclaration, et se vérifie en lisant la valeur, pas en comptant les
   lignes d'affectation dans la source.

---

## 0ter. Les trois vérifications du 9 octobre

### 1. Quel registre pour quelle audience — mesuré, pas supposé

Le registre est choisi par reconnaissance de motifs. Il fallait donc montrer ce que le code
choisit **réellement** pour la phrase exacte du document, pas ce qu'on espère.

| audience | registre choisi |
|---|---|
| **la phrase exacte du document de Christophe** (« Grand public — … sans prérequis clinique ou financier. ») | **public large** |
| « clinicien » | professionnels |
| « personnes accompagnées » | personnes accompagnées |
| « patients » | personnes accompagnées |
| *(chaîne vide)* | repli |
| « thérapeutes de couple » | professionnels |
| « couples en difficulté » | personnes accompagnées |

Sa phrase contient « sans prérequis **clinique** », qui passe à un cheveu du motif
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

Rendu depuis le navigateur sur la **présentation d'essai** du lot — 83 lignes, titre, public et
objectif pris dans le document. (Le prompt rendu pour la présentation réelle de Christophe a été
vérifié de la même façon ; il n'est pas reproduit ici, parce que ce dépôt est public et que son
document ne lui appartient pas — règle 11 de la gouvernance.)

```
Vous êtes auteur de scripts de doublage. Vous écrivez le commentaire que dira, à voix
haute, un acteur de doublage, pour une vidéo de psychoéducation.
Le sujet est celui de la présentation fournie, intitulée « Quand le silence s’installe ». Tenez-vous-y :
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
Un public large (« Grand public — adultes, sans prérequis clinique »), sans formation. Partez de l'expérience ordinaire avant toute notion. Aucun terme technique sans une phrase qui l'explique.

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

**Le message utilisateur**, pour la même présentation. Il porte le titre, le public,
**l'objectif**, la durée visée, puis par étape l'identifiant, la cible en mots, ce qui est déjà à
l'écran et le contenu de l'étape :

```
Titre de la présentation : Quand le silence s’installe
Public : Grand public — adultes, sans prérequis clinique
Objectif : Donner au spectateur de quoi nommer un silence installé dans son couple, et une phrase pour l ouvrir.
Durée visée pour l'ensemble : 4 minutes, soit environ 600 mots.

Les étapes, dans l'ordre. Écrivez un commentaire pour CHACUNE :

── Diapositive : Ce qui ne se dit pas
  stepId: heading-01
  cible: 33 mots
  contenu de cette étape : Le silence n’est pas toujours une absence

  stepId: paragraph-01
  cible: 120 mots
  déjà à l'écran : Le silence n’est pas toujours une absence
  contenu de cette étape : Dans beaucoup de couples, il existe un sujet dont on ne parle pas. Ce n’est pas qu’on l’a oublié : on le contourne, chacun de son côté, et ce contournement finit par organiser toute la relation.

  stepId: callout-01
  cible: 81 mots
  déjà à l'écran : Le silence n’est pas toujours une absence | Dans beaucoup de couples, il existe un sujet dont on ne parle pas. Ce n’est pas qu’on l’a oublié : on le contourne, chacun de son côté, et ce contournement finit par organiser toute la relation.
  contenu de cette étape : Le silence protège quelque chose. Tant qu’on ignore quoi, il est difficile de le lever.

── Diapositive : Trois formes de silence
  stepId: heading-02
  cible: 27 mots
  contenu de cette étape : Elles ne se ressemblent pas

  stepId: list-01
  cible: 120 mots
  déjà à l'écran : Elles ne se ressemblent pas
  contenu de cette étape : Le silence de protection : parler ferait mal, alors on se tait. — Le silence d’habitude : on a cessé d’essayer, sans décision consciente. — Le silence de représailles : se taire est devenu une manière de répondre.

  stepId: paragraph-02
  cible: 102 mots
  déjà à l'écran : Elles ne se ressemblent pas | Le silence de protection : parler ferait mal, alors on se tait. — Le silence d’habitude : on a cessé d’essayer, sans décision consciente. — Le silence de représailles : se taire est devenu une manière de répondre.
  contenu de cette étape : Les reconnaître change la conversation : on ne s’adresse pas de la même façon à quelqu’un qui se protège et à quelqu’un qui riposte.

── Diapositive : Par où commencer
  stepId: heading-03
  cible: 24 mots
  contenu de cette étape : Une seule phrase suffit

  stepId: quote-01
  cible: 93 mots
  déjà à l'écran : Une seule phrase suffit
  contenu de cette étape : Il y a quelque chose dont on ne parle jamais. Je ne sais pas par où commencer, mais j’aimerais essayer.
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

## 2bis. La répartition des mots

Le calcul est entièrement local : **aucun appel au modèle**
(`tests/mesure-repartition-reelle.cjs`). Sur la présentation d'essai, 8 étapes, 4 minutes :

```
  étape        type          mots du bloc   poids   CIBLE   durée
    étape 1/3   heading                7      1.59      33 mots   13 s
    étape 2/3   paragraph             36         6     120 mots   48 s
    étape 3/3   callout               15      3.87      81 mots   32 s
    étape 1/3   heading                5      1.34      27 mots   11 s
    étape 2/3   list                  38       7.4     120 mots   48 s
    étape 3/3   paragraph             24       4.9     102 mots   41 s
    étape 1/2   heading                4       1.2      24 mots   10 s
    étape 2/2   quote                 20      4.47      93 mots   37 s

  total réparti : 600 mots pour 600 visés — atteignable : OUI
```

**Mesuré aussi sur la présentation réelle de Christophe** — 19 étapes, 8 minutes. Les chiffres,
sans son contenu : **1 197 mots répartis pour 1 200 visés, atteignable**, titres de **16 à 29
mots** (6 à 12 s), paragraphes de **64 à 70**, listes de **88 à 107**, questionnaire à **120**
(plafond). Le détail étape par étape lui a été montré dans la conversation ; il n'entre pas dans
ce dépôt public.

**Le cas atteignable et le cas qui ne l'est pas**, tous deux mesurés :

| document | étapes | durée visée | réparti | verdict |
|---|---|---|---|---|
| présentation réelle | 19 | 8 min | 1 197 mots pour 1 200 | **atteignable** |
| présentation d'essai | 8 | 8 min | 960 mots, 6,4 min | **NON** — plafond, 8 étapes bornées |
| présentation d'essai | 8 | 4 min | 600 mots pour 600 | **atteignable** |

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
| `verify-narration-ia` | **24/24** — moteur et interface, transport simulé, aucun appel réel |
| `verify-worker-garde-narration` | **6/6** — garde du Worker exécutée hors ligne |
| `falsifier-narration-ia` | **44/44** mutations détectées |
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

**Ce que tu testes ensuite sur ton site**, avec une **copie** de ta présentation réelle
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
