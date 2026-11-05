# Liénothèque — l'Expert d'apprentissage
## Cahier des charges de conception, 3 novembre 2026

Ce document ne décrit pas une fonctionnalité de plus à ajouter au moteur oracle. Il décrit un
second système, de nature différente, qui vient compléter — jamais remplacer — ce que les
nuits précédentes ont construit. Avant d'écrire la moindre ligne, ce document doit être lu en
entier et discuté, parce qu'il touche à quelque chose que le reste du projet évite
soigneusement : un composant qui n'est pas entièrement déterministe.

---

## 0. Ce que ce document n'est pas

Ce n'est pas la spécification d'un "mode assoupli" du moteur oracle. La bascule vers la
publication en meilleure estimation (décidée le 3/11, voir CDC principal §-1 septies) est un
changement de **seuil de publication** — toujours un système déterministe, toujours sans API
externe, toujours auditable ligne par ligne.

L'Expert est différent. C'est un **second système**, qui s'appuie sur un modèle de langage via
le Worker `lienotheque-api`, et dont le raisonnement n'est pas entièrement prévisible à l'avance.
Les deux coexistent et se complètent, mais il faut les penser comme deux métiers distincts avant
de les faire travailler ensemble — sinon on finit par exiger de l'un ce qui n'appartient qu'à
l'autre, et par faire confiance à l'un pour ce que seul l'autre peut garantir.

---

## 1. Pourquoi un Expert, et pourquoi maintenant

Le moteur oracle sait aujourd'hui : détecter des structures répétitives (pastilles, tables),
confronter des noms de fichiers au texte des pages, borner ses hypothèses au vivier réel, et
s'abstenir ou publier selon des règles de corroboration fixes. Tout cela fonctionne, et tout cela
reste nécessaire — c'est la partie du système qui ne doit jamais mentir.

Mais il a une limite structurelle, pas un bug à corriger : **il ne comprend rien**. Il mesure des
régularités géométriques et textuelles, il ne lit jamais vraiment une page comme un humain la
lirait. Quand Christophe a montré la capture de Paul Westwood avec son folio, son numéro
d'exercice et sa pastille de piste CD — trois numérotations différentes sur la même page — le
moteur oracle a dû les démêler par des propriétés mathématiques (injectivité, ordre, couverture).
Un humain, lui, les démêle en une seconde parce qu'il **comprend** ce qu'est un folio, ce qu'est
un numéro d'exercice, ce qu'est une piste de CD, et pourquoi un auteur de méthode imprime les
trois.

L'Expert est la tentative de donner au système cette seconde capacité — pas pour remplacer la
première, mais pour l'endroit précis où la première échoue : les cas ambigus, les documents
atypiques, les situations où un humain regarderait la page et dirait "ah, évidemment" en une
seconde, là où le moteur oracle s'abstient faute de preuve mathématique.

---

## 2. Ce que "vivant" veut dire ici, concrètement

Christophe a employé ce mot : "il sera vivant". Il mérite d'être pris au sérieux et précisé,
parce que c'est le mot qui distingue cette conception d'un simple appel API de classification.

Être vivant, pour l'Expert, veut dire quatre choses précises :

**Il raisonne, il ne classe pas.** Face à une page ambiguë, il ne rend pas une étiquette
("pastille: oui/non") — il construit un raisonnement explicite qu'on peut lire : "cette page
porte deux numéros, l'un en haut à gauche qui ressemble à une pagination de livre (il monte de 1
à chaque page), l'autre dans un encadré qui ne monte pas régulièrement (ce qui suggère un numéro
d'exercice, pas une page) — je pense donc que c'est le second qui correspond au vivier de 22
fichiers."

**Il pose des questions quand il n'est pas sûr**, plutôt que de deviner en silence ou de
s'abstenir sans explication. C'est la différence la plus importante avec le moteur oracle, qui
ne sait faire que l'un ou l'autre. L'Expert a une troisième voie : "Je vois deux pastilles sur
cette page, l'une en haut (ronde, chiffre 4) et l'une en bas (carrée, chiffre 12). Le document
a 12 pistes. Est-ce que celle du bas est la bonne, ou est-ce que la ronde en haut pourrait être
un numéro de système différent (une page de préface, par exemple) ?"

**Il apprend de la conversation elle-même**, pas seulement du résultat final. Quand Christophe
répond à sa question, ce n'est pas juste "la bonne réponse" qui compte — c'est le raisonnement
que Christophe donne pour y arriver. "La ronde en haut, c'est la pagination du livre entier,
pas de la méthode — regarde, elle continue au-delà de la dernière piste" est une information bien
plus riche qu'un simple "c'est la carrée". L'Expert doit pouvoir extraire cette distinction et
s'en souvenir pour le prochain document du même genre.

**Il s'adapte au fil du temps**, dans le sens précis où son comportement de demain dépend de ce
qu'il a appris aujourd'hui — pas parce que son code a changé, mais parce que sa mémoire de
travail (voir §5) s'est enrichie. Deux Expert interrogés à un mois d'intervalle sur le même type
de document ne devraient pas se comporter exactement pareil si l'un a eu l'occasion d'apprendre
entre-temps et l'autre non.

Ce que "vivant" ne veut **pas** dire : autonome au point de publier des liens sans que personne
ne vérifie, capable d'halluciner une réponse plausible-sonnante sans le dire, ou incohérent d'une
fois sur l'autre sur un même cas déjà tranché.

---

## 3. Architecture : deux systèmes, une frontière nette

```
                     ┌─────────────────────────┐
                     │   MOTEUR ORACLE          │
                     │   (déterministe)          │
                     │                           │
                     │  détecteurs génériques    │
                     │  règles de corroboration  │
                     │  publication / abstention │
                     └───────────┬───────────────┘
                                 │
                    cas tranchés │  cas ambigus,
                    normalement  │  ou abstention
                                 │  persistante
                                 ▼
                     ┌─────────────────────────┐
                     │   EXPERT                 │
                     │   (raisonnant, via API)   │
                     │                           │
                     │  Worker lienotheque-api   │
                     │  raisonnement explicite   │
                     │  questions à l'humain     │
                     │  propose, ne publie jamais │
                     │  seul                     │
                     └───────────┬───────────────┘
                                 │
                                 ▼
                     ┌─────────────────────────┐
                     │   ÉCRAN D'ASSOCIATION     │
                     │   MANUELLE (humain)       │
                     │                           │
                     │  tranche en dernier        │
                     │  ressort, toujours         │
                     └───────────┬───────────────┘
                                 │
                                 ▼
                     ┌─────────────────────────┐
                     │   MÉMOIRE D'APPRENTISSAGE │
                     │   (les trois niveaux déjà  │
                     │   posés : association,     │
                     │   exemple, généralisation) │
                     └─────────────────────────┘
```

**La règle de frontière, non négociable** : l'Expert ne publie jamais de lien lui-même. Il
produit toujours une proposition accompagnée de son raisonnement, jamais un fait établi. La
différence avec le moteur oracle en mode "meilleure estimation" (§-1 septies du CDC principal)
est la suivante : le moteur oracle en mode estimation publie quand même, marqué comme non
confirmé ; l'Expert, lui, ne publie **jamais**, il propose toujours pour validation — parce que
son raisonnement, aussi bon soit-il, n'est pas auditable de la même façon qu'un calcul
déterministe, et qu'une erreur de raisonnement plausible-sonnante est le risque spécifique des
systèmes de ce genre.

**Pourquoi l'Expert vient après le moteur oracle, jamais avant** : il coûte de l'argent (appel
API) et du temps (latence réseau), il ne doit donc traiter que ce que le déterministe n'a pas pu
trancher — jamais être le premier passage sur un document, toujours le second recours.

---

## 4. Ce que l'Expert reçoit, et ce qu'il ne doit jamais halluciner

### Ce qu'on lui donne

Un cas que le moteur oracle a laissé en abstention ou en ambiguïté, avec :
- l'image (ou le texte océrisé) de la page en question, et des pages voisines pour le contexte ;
- le vivier des médias du document (noms de fichiers, métadonnées internes) ;
- ce que le moteur oracle a déjà tenté et pourquoi il a échoué ou douté (quels détecteurs ont
  trouvé quoi, et pourquoi la corroboration a manqué) ;
- les exemples déjà vérifiés pour ce document ou cette famille, s'il y en a (niveau 2 de la
  mémoire d'apprentissage).

### Ce qu'on exige de sa réponse, à chaque fois

- Un raisonnement explicite, pas juste une conclusion.
- Un niveau de confiance explicite, jamais implicite dans le ton de la réponse.
- Soit une proposition claire, soit une question claire — jamais un entre-deux vague.
- Aucune affirmation sur ce qu'il ne peut pas voir : s'il n'a pas le texte d'une page, il le dit,
  il ne le devine pas comme s'il l'avait lu.

### Le vrai risque à garder en tête

Un modèle de langage peut produire une réponse qui *sonne* raisonnée sans l'être vraiment — un
raisonnement de façade, plausible mais faux. C'est le risque spécifique de ce composant, que le
moteur oracle n'a jamais couru. La parade n'est pas de faire confiance au ton de la réponse,
c'est de ne **jamais** laisser l'Expert publier seul, et de systématiquement confronter sa
proposition aux mêmes contraintes structurelles que le moteur oracle respecte déjà (le lien
proposé doit être injectif, dans le vivier réel, cohérent avec l'ordre des pages) avant même de
la montrer à l'humain. L'Expert propose ; la structure vérifie ce qui est vérifiable
mécaniquement ; l'humain tranche le reste.

---

## 5. Les questions : comment, quand, à qui

**Quand pose-t-il une question plutôt qu'une proposition ?** Quand il a identifié au moins deux
hypothèses plausibles et qu'aucune information disponible (texte de la page, exemples déjà
appris, raisonnement structurel) ne permet de trancher entre elles. Il ne pose jamais de question
dont la réponse était déjà déductible des données qu'on lui a données — ce serait de la paresse
déguisée en humilité.

**À qui ?** À Christophe, directement, dans l'écran d'association manuelle ou dans un espace de
questions dédié — jamais en silence, jamais en se contentant d'une hypothèse par défaut sans le
signaler.

**Comment formule-t-il une question ?** Toujours avec le contexte visuel ou textuel qui a généré
le doute, jamais une question abstraite ("quel est le bon lien ?") mais une question précise
("je vois A et B, lequel est C ?").

**Que fait-on de la réponse ?** Elle devient, comme toute décision humaine, un exemple vérifié
dans la mémoire d'apprentissage (niveau 2). Mais pour l'Expert spécifiquement, on garde aussi la
**question posée** et **le raisonnement qui a motivé la réponse** — pas seulement le résultat.
C'est cette paire question/raisonnement qui permet à l'Expert de ne plus reposer la même
question sur un cas similaire la prochaine fois, parce qu'il a compris le principe derrière la
réponse, pas juste mémorisé un cas isolé.

---

## 6. Coût et gouvernance — à décider, pas à improviser

Un appel à un modèle de langage coûte de l'argent et du temps, contrairement à tout ce que le
moteur oracle fait aujourd'hui. Avant de câbler quoi que ce soit, il faut répondre à ces
questions, pas les découvrir en production :

- **Combien de cas par document, au maximum ?** Un document avec de nombreuses pages ambiguës
  pourrait générer beaucoup d'appels — faut-il un budget, comme le plafond déjà posé sur le
  nombre d'essais du moteur oracle ?
- **Quel modèle, via quelle route du Worker `lienotheque-api` ?** À préciser une fois le Worker
  inspecté directement dans le dépôt — ce document ne tranche pas ce point technique.
- **Que se passe-t-il si l'appel échoue ou que l'API est indisponible ?** Jamais une erreur
  silencieuse : le document doit revenir à l'état d'abstention normal du moteur oracle, pas
  rester bloqué en attente d'un Expert qui ne répond pas.
- **Qui peut désactiver l'Expert ?** Un interrupteur global doit exister — une bibliothèque doit
  pouvoir fonctionner uniquement avec le moteur oracle déterministe si on le souhaite,
  sans dépendance à une API externe.

---

## 7. Ce que ce chantier ne doit jamais devenir

Reprise et précision des garde-fous déjà posés pour l'apprentissage (CDC principal), appliqués
spécifiquement à l'Expert :

- Il ne devient jamais une autorité qui publie sans vérification structurelle et sans accord
  humain, quelle que soit sa confiance affichée.
- Son raisonnement doit toujours être lisible par un humain après coup — jamais une boîte noire
  dont on ne peut auditer que le résultat.
- Une réponse de l'Expert sur un document ne se généralise jamais automatiquement à un autre
  sans passer par les mêmes trois niveaux déjà posés (association, exemple, généralisation
  prouvée et réversible).
- Il ne doit jamais halluciner une certitude sur ce qu'il n'a pas réellement vu dans les données
  qu'on lui a fournies.
- Il reste un second recours, jamais le premier passage sur un document — le moteur oracle
  déterministe reste la base, pas une relique qu'on contourne dès que possible.

---

## 8. Ordre de construction proposé

Ce document précise et prolonge la décision déjà prise sur l'ordre général (CDC principal
§-1 septies). Dans ce cadre, l'Expert vient en dernier, pas en premier :

1. L'écran d'association manuelle à deux colonnes (déjà décidé) — le filet de sécurité humain,
   sans lequel rien de ce qui suit n'a de sens.
2. La bascule du moteur oracle vers la publication en meilleure estimation, avec marquage de
   confiance — toujours déterministe, toujours sans API.
3. La mémoire d'apprentissage à trois niveaux, alimentée par les décisions humaines prises sur
   l'écran — toujours explicable, toujours réversible.
4. **Seulement ensuite**, l'Expert : branché sur la mémoire déjà existante (il doit pouvoir la
   lire dès sa première conversation, pas repartir de zéro), capable de proposer et de
   questionner sur les cas que le moteur oracle en mode estimation laisse encore incertains, et
   dont les réponses alimentent à leur tour cette même mémoire.

Cet ordre n'est pas arbitraire : chaque étape dépend structurellement de la précédente. L'Expert
sans mémoire d'apprentissage existante reposerait les mêmes questions indéfiniment. La mémoire
sans écran de correction n'aurait rien à apprendre. Construire dans le désordre reviendrait à
bâtir la pièce la plus coûteuse et la moins prévisible du système sur une fondation qui n'existe
pas encore.

---

## 9. Ce que ce document attend, avant tout code

Que Christophe le lise et confirme ou corrige chaque section — en particulier §3 (la frontière
stricte "jamais de publication seule") et §8 (l'ordre de construction), qui sont les deux
décisions structurantes dont tout le reste découle. Une fois confirmé, ce document rejoint le CDC
principal comme référence pour l'étape 4 de la feuille de route de l'apprentissage, et guide la
conception détaillée (contrat de l'appel API, format exact des questions, structure de la mémoire
partagée) qui restera à écrire avant la première ligne de code de l'Expert lui-même.
