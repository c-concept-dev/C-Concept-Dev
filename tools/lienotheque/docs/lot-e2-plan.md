# Lot E2 — plan du réimport des 234 ouvrages

**Rien de ce plan ne démarre sans un accord explicite et séparé** (BAS-02). Ce document est là
pour être relu avant cet accord, et pour que vous puissiez dire non à une étape sans dire non à
l'ensemble.

Une phrase à garder présente tout du long : **l'ancienne bibliothèque n'est pas touchée**, et le
dossier des ouvrages sur votre Mac n'est **lu**, jamais modifié, jamais déplacé, jamais renommé.

---

## 1. Ce qui sera lu, et ce qui sera écrit

### Lu, et seulement lu

Le dossier des ouvrages, `Documents/Livres Base de connaissance` : 267 PDF, 11,90 Go, plus
quelques EPUB. Chaque fichier est ouvert en lecture, son empreinte calculée, ses pages
inspectées. **Aucune écriture, aucun renommage, aucun déplacement.** Un fichier d'origine n'est
jamais réécrit : c'est une règle du dépôt, pas une intention de ce lot.

### Écrit, dans un seul endroit, nouveau

Un dossier de bibliothèque, à créer sur le **volume externe** (436 Go libres, et la règle du
projet veut que les gros corpus n'aillent jamais dans le dépôt principal) :

```
<volume>/lienotheque-therapie/
  base/        la base SQLite de la bibliothèque
  sources/     rien — les originaux restent où ils sont (voir ci-dessous)
  derives/     les images de page optimisées, ~1,9 Go attendus
```

**Les originaux ne sont pas recopiés.** La bibliothèque les référence par leur empreinte et leur
chemin ; les dupliquer coûterait 7,4 Go pour rien, et vous avez déjà décidé que les œuvres
restent sur votre Mac.

### Jamais touché

- `therapeute-library` et son index : rien, à aucun moment. Le contrôle habituel (22 022
  passages, 168 738 816 octets) est repassé au début et à la fin de chaque séance.
- Cloudflare, **pour la publication** : aucun envoi. Ni base, ni fichier, ni dérivé ne part chez
  l'hébergeur pendant E2 — publier est un geste séparé, qui vient après.

  La formulation mérite d'être exacte, parce qu'il y a **une exception et une seule** : si la
  vision ciblée est engagée, elle envoie au Worker de **petits recadrages d'images** — les zones
  qui résistent, pas les pages entières, pas les documents. Ces recadrages ne sont ni stockés ni
  publiés : ils traversent le Worker, qui les relaie au modèle et rend une lecture. Rien n'en
  reste. Et cela n'arrive **qu'après que je vous aie montré le nombre de zones et le coût**, comme
  prévu plus bas.
- Le dépôt git : rien du corpus n'y entre.

---

## 2. L'étape zéro, avant tout traitement massif : la couche texte

C'est la première chose faite, et rien d'autre ne démarre tant qu'elle n'a pas rendu son verdict.

**Ce qu'on sait déjà :** sur les cinq documents mesurés à l'étape 0, **toutes les pages portent à
la fois une image et du texte**. Ces ouvrages sont passés par un lecteur optique avant d'arriver.
Si cette couche est bonne, le réimport n'a presque rien à océriser, et sa durée change d'ordre.

**Ce qu'on ne sait pas :** sa qualité. Le CDC relève, sur la fixture F2, 305 titres sur 437 dans
une couche OCR existante — une couche peut exister et être médiocre.

### Comment la mesure se fait

**Trente pages, sur dix ouvrages**, tirées pour couvrir ce qui diffère : scans noir et blanc,
scans couleur, un PDF natif, un gros volume, et deux ouvrages pris au hasard pour ne pas ne
mesurer que les cas qu'on a choisis. Trois pages par ouvrage : une au début, une au milieu, une
à la fin — une couche OCR se dégrade souvent en fin de volume, là où personne ne regarde.

Pour chaque page, trois choses :

1. **Le texte de la couche existante**, lu tel quel.
2. **Le texte que notre propre OCR produit** sur la même page.
3. **Ce que vous lisez à l'écran**, sur un échantillon réduit — dix pages, pas trente.

On compare, et on regarde ce qui compte vraiment plutôt qu'un pourcentage global :

| Ce qu'on regarde | Pourquoi |
|---|---|
| Accord mot à mot entre les deux textes | un désaccord massif dit que l'une des deux se trompe |
| Les accents et les ligatures | une couche qui perd les accents rend la recherche française inutilisable |
| L'ordre de lecture sur les pages à deux colonnes | une couche qui entrelace les colonnes produit des phrases qui n'existent pas |
| Le numéro de page imprimé | c'est la raison d'être de Liénothèque ; s'il n'est pas lisible, le reste ne sert à rien |

### La règle de décision, écrite avant la mesure

- **La couche existante est retenue** si elle s'accorde avec notre OCR sur au moins **95 % des
  mots** sur au moins **27 des 30 pages**, sans défaut systématique parmi les quatre ci-dessus.
- **Elle est écartée, et on océrise**, si un défaut systématique apparaît — même sur peu de
  pages. Un défaut systématique ne se dilue pas : il touchera tout le corpus.
- **Entre les deux**, on ne tranche pas seul : le relevé vous est présenté, avec les pages
  litigieuses, et vous décidez.

Le résultat est un rapport daté, comme les autres. **Il conditionne la durée et le coût
annoncés ci-dessous**, et c'est pourquoi il vient en premier.

---

## 3. Les étapes du réimport

Chaque étape rend un relevé, et chacune peut s'arrêter sans abîmer la précédente.

| | Étape | Ce qu'elle fait | Durée attendue |
|---:|---|---|---|
| 0 | **Protection du volume** | Le témoin de présence, la suspension sans échec, la reprise d'elle-même, et leurs contrôles | 2 à 3 h |
| 1 | **Inventaire** | Ouvre les 267 fichiers, calcule les empreintes, compte les pages, repère les doublons exacts | 20 à 40 min |
| 2 | **Couche texte** | L'épreuve ci-dessus, sur 30 pages | 30 min, plus votre relecture |
| 3 | **Correspondance avec l'ancienne base** | Associe chaque fichier à son `book_id` d'origine, par le titre, et **vous soumet tout ce qui n'est pas certain** | 1 h, dont une relecture |
| 4 | **Manière de lire** | Une recette par famille de mise en page, découverte à l'éditeur visuel, pas écrite à l'avance | 2 à 4 h |
| 5 | **Traitement** | La file tourne, un travail par document | voir ci-dessous |
| 6 | **Vérification** | Les cas douteux présentés à l'écran Vérifier | selon ce que 5 rapporte |
| 7 | **Relevé final** | Comptes, poids, écarts, prêt pour la comparaison d'E3 | 15 min |

### L'étape 3 mérite un mot

L'ancienne base porte **234 identifiants d'ouvrage** ; le dossier porte **267 fichiers**, dont des
doublons exacts. Les deux ensembles ne se recouvrent pas tout seuls, et la fixture F8 du CDC
demande que dix ouvrages se retrouvent **avec leurs alias conservés**. Sans cette correspondance,
la comparaison d'E3 comparerait deux bibliothèques qui ne parlent pas des mêmes livres.

Je n'associerai rien automatiquement au-delà d'un titre identique au caractère près. Tout le reste
— titres approchants, fichiers sans correspondant, identifiants sans fichier — vous est présenté
en liste, et c'est vous qui tranchez. **Une correspondance devinée est pire qu'une
correspondance manquante** : elle ne se voit pas.

---

## 4. Durée et coût réels

### Durée

Le corpus distinct représente environ **7,38 Go**, soit, au rythme de pages mesuré sur
l'échantillon, de l'ordre de **7 000 à 15 000 pages**. L'étape 1 remplacera cette fourchette par
un compte exact — elle ne coûte que de la lecture.

Tout dépend du verdict de l'étape 2 :

| Scénario | Rythme | 10 000 pages |
|---|---|---|
| **La couche texte est retenue** | ~0,5 à 1 s par page | **1 h 30 à 3 h** |
| **Il faut océriser** | ~8 s par page, mesuré sur F3 | **20 à 24 h** |

Dans le second cas, le traitement se fait en plusieurs séances : la file est durable, elle
reprend où elle s'est arrêtée, et rien n'oblige à laisser le Mac allumé une nuit entière.

### Coût

| Poste | Montant |
|---|---|
| Océrisation | **0 $** — le moteur est sur votre Mac, il ne facture rien |
| Stockage des dérivés | **0 $** — 1,9 Go, la tranche gratuite va jusqu'à 10 Go |
| Écritures en base | **0 $** — ~50 000 lignes, très en deçà du compris |
| Vision ciblée, si des zones résistent | **sous le plafond de 10 $/mois**, et je demande avant d'en engager |
| Embeddings, si l'on refait la recherche de sens | quelques dollars, **une fois** |

**Le réimport ne coûte presque rien.** Ce qui coûterait, c'est la vision ciblée si on l'appelait
largement — et elle ne s'appelle que sur les zones qui résistent, sous un plafond que vous avez
fixé. Je vous présenterai le nombre de zones concernées **avant** d'en traiter une seule.

---

## 5. Arrêter à tout moment, sans rien perdre

C'est la propriété la plus importante de ce plan, et elle ne repose pas sur ma prudence : elle
est déjà dans le code, éprouvée au lot D2.

### Les garde-fous de ressources, à l'échelle des 234 ouvrages

Ils ne sont pas réglés par document : ils sont réglés par la **file**, et c'est ce qui les rend
valables à n'importe quelle échelle. Les valeurs vivent dans `packages/contrats/limites.json`,
lues une fois et jamais recopiées — l'hôte Rust et le moteur lisent le même fichier, et un
contrôle refuse toute constante qui porterait un de ces nombres en dur.

| Garde-fou | Valeur | Comment il tient à 234 documents |
|---|---|---|
| Travaux lourds simultanés | **2** | La file compte les travaux **en cours sur l'ensemble**, pas par document, et n'en lance un de plus que s'il reste une place. Deux cents travaux en attente n'en font pas partir trois |
| Mémoire par processus | **2 048 Mo** | Chaque traitement part dans son propre processus, lancé avec ce plafond. Deux processus au plus, donc **4 Go au pire**, quel que soit le nombre de documents en attente |
| Bail et battement | 15 s, renouvelé toutes les 5 s | Un processus mort libère sa place au bout de quinze secondes. Sans cela, un plantage bloquerait une place pour toujours |
| Tentatives | 3, espacées de 30 s | Au-delà, l'échec est dit franchement plutôt que caché |

Le relevé du lot D2 situe le besoin réel : le parcours complet sur un document de 29 pages a
culminé à **643 Mo** pour le plus lourd des processus — un tiers du plafond. La marge est là
pour les gros volumes, pas pour l'ordinaire.

**Ce que ces garde-fous ne promettent pas :** que deux processus à 2 Go et le reste du système
tiennent sur une machine chargée. Si la mémoire manque, c'est le plafond qui agit, et le travail
échoue proprement plutôt que de faire ramer la machine. Le relevé de chaque séance donnera la
pointe réelle atteinte.

**Un travail par document.** Les 234 ouvrages ne forment pas une opération, mais 234 opérations
indépendantes. S'arrêter au cent-douzième laisse cent onze ouvrages complets et cent
vingt-trois intacts — jamais un ouvrage à moitié.

**La file est durable.** Son état vit dans la base, pas dans la mémoire du programme. Fermer la
fenêtre, éteindre le Mac, débrancher le volume : à la réouverture, la file reprend où elle en
était. C'est le critère JOB du CDC, vérifié par « arrêt/redémarrage sans perte ».

**Une version s'active en une seule opération.** Un document a son ancienne version jusqu'à ce
que la nouvelle soit entièrement écrite et validée ; l'activation est le dernier geste. Une
coupure au milieu laisse la version précédente en place, pas un mélange des deux.

**Comment vous arrêtez :** fermez la fenêtre, ou le bouton « Suspendre » de l'écran de
traitement. Rien d'autre à faire.

**Comment vous annulez tout :** supprimez le dossier de bibliothèque sur le volume externe. Il ne
contient que des dérivés et une base, tous reconstructibles. Vos originaux n'ont pas bougé,
l'ancienne bibliothèque n'a pas bougé, et Cloudflare n'a rien reçu.

**Ce qui ne peut pas arriver :** un état incohérent qu'il faudrait réparer à la main. Il n'y a pas
de migration en place, pas d'écriture dans l'ancienne base, pas de fichier d'origine modifié. Le
pire incident possible est un dossier à refaire.

### Le volume externe qui disparaît — ce qui manque, et ce que je construis d'abord

C'est arrivé au lot D2, et vous avez raison de ne pas vous contenter de ma parole. J'ai vérifié
le code plutôt que de répondre de mémoire, et la réponse honnête est : **cette protection n'existe
pas, et le comportement actuel est faux pour ce cas.**

Une erreur du moteur est classée « récupérable ». Avec trois tentatives espacées de trente
secondes, un disque absent épuise les tentatives d'un travail en **quatre-vingt-dix secondes**, et
le travail passe en échec **définitif**. Un volume qui revient au bout de deux minutes arrive trop
tard. Pire : la file elle-même vit sur ce volume — si le disque part, elle ne peut même plus
écrire qu'elle a échoué.

La cause tient en une confusion que le code ne fait pas encore : **« le travail a échoué » et
« nous n'avons pas pu travailler » ne sont pas la même chose.** Le premier consomme une tentative,
le second non.

**Ce qui sera construit avant tout traitement massif**, comme première tâche d'E2 :

| | |
|---|---|
| **Un témoin de présence** | Avant de prendre un travail, l'hôte vérifie que le dossier de la bibliothèque existe et accepte une écriture. Un fichier témoin, écrit et relu — l'existence d'un dossier ne prouve pas qu'on peut y écrire, et un volume démonté laisse parfois un point de montage vide qui ressemble à un dossier |
| **Une suspension, pas un échec** | Volume absent : la file **se met en pause** et ne consomme aucune tentative. Aucun travail ne passe en échec parce que le disque n'était pas là |
| **Une reprise d'elle-même** | La file reteste le témoin à intervalle régulier et repart dès qu'il répond, sans qu'on ait à relancer quoi que ce soit |
| **Un arrêt net du travail en cours** | Le processus en vol est arrêté proprement plutôt que laissé à écrire dans le vide, et son travail revient « en file », pas « en échec » |
| **L'écran le dit** | « Volume absent — le traitement reprendra quand il reviendra », et non un sablier ou une erreur rouge |

Ce que la conception rend déjà sûr, et qui ne change pas : une version s'active en un seul geste,
après écriture complète. Un disque qui part au milieu d'une écriture laisse donc la **version
précédente** intacte, et le document à refaire — jamais un document à moitié converti. Les
fichiers partiels portent un nom temporaire et ne sont renommés qu'une fois complets.

Cette protection sera livrée avec ses contrôles — dont un qui simule la disparition du volume en
cours de traitement — **et rien de massif ne démarre avant qu'ils soient verts.**

---

## 6. Ce que je vous demanderai en cours de route

Même avec votre accord sur E2, trois moments appellent une réponse de votre part, et je
m'arrêterai à chacun :

1. **Après l'étape 2**, si le verdict sur la couche texte tombe entre les deux seuils.
2. **Après l'étape 3**, pour valider les correspondances incertaines entre fichiers et ouvrages.
3. **Avant toute vision ciblée**, avec le nombre de zones et le coût estimé.

Et rien, à aucun moment d'E2, ne publie quoi que ce soit : la bascule (BAS-04) et la suppression
de l'ancienne (BAS-05) restent des accords séparés, bien plus tard.
