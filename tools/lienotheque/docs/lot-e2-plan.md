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
- Cloudflare : **aucun envoi pendant E2**. Publier est un geste séparé, qui vient après.
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

---

## 6. Ce que je vous demanderai en cours de route

Même avec votre accord sur E2, trois moments appellent une réponse de votre part, et je
m'arrêterai à chacun :

1. **Après l'étape 2**, si le verdict sur la couche texte tombe entre les deux seuils.
2. **Après l'étape 3**, pour valider les correspondances incertaines entre fichiers et ouvrages.
3. **Avant toute vision ciblée**, avec le nombre de zones et le coût estimé.

Et rien, à aucun moment d'E2, ne publie quoi que ce soit : la bascule (BAS-04) et la suppression
de l'ancienne (BAS-05) restent des accords séparés, bien plus tard.
