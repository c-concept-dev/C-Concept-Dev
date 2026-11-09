# Liénothèque — CDC d'audit v24

*Écrit le 4 novembre 2026. **CDC complet** : il contient le v23 intégral, précédé des sections
nouvelles. Aucune ligne du v23 n'a été retirée ; les passages contredits sont **annotés**, et
l'annotation le dit. Le v23 reste à part, intact.*

> **Comment lire ce document.** Les sections 1 à 7 sont neuves. À partir de la section 8 vient
> le **v23 intégral**, inchangé sauf trois annotations encadrées. Si une phrase du v23 vous
> paraît contredite par les sections neuves, ce sont les sections neuves qui font foi : elles
> s'appuient sur des mesures du 4 novembre.

---


Ce document rassemble ce qui a été établi depuis le v23, la feuille de route décidée par
Christophe, et tout ce qui est reporté. Il corrige aussi une affirmation fausse des v22 et v23.

> **Le registre des décisions** (`tools/lienotheque/docs/decisions.md`) se relit **en tête de
> chaque prompt** et se met à jour **le jour même** de toute décision. Le 4 novembre, il
> comptait 61 décisions arrêtées au 20 octobre : quinze jours de décisions manquaient, dont
> le repli Vision. Il en compte 84 aujourd'hui.

---

## 0. EXIGENCE PERMANENTE — le repli Vision

> **Toute difficulté ou tout échec de Tesseract bascule sur un repli Vision.**

C'est une **généralité du produit**, au même rang que « rien en dur pour le domaine » ou
« contrats d'abord ». Elle ne dépend d'aucun chantier, d'aucun corpus, d'aucune bibliothèque.
Elle n'a pas à être redemandée : elle est acquise depuis le **30 octobre 2026**, réaffirmée le
**4 novembre**.

### Trois étages, et chaque étage douteux passe la main au SUIVANT

**couche du PDF → Tesseract → Vision.** Jamais deux à la fois, jamais de saut.

| Étage | Ce qui le rend douteux | Passe la main à |
|---|---|---|
| **1. Couche texte du PDF** | illisible, **accents perdus**, trop peu de mots — *le cas `couche-fautive`* | **Tesseract** |
| **2. Tesseract** | **échoue** (code non nul, sortie illisible) ; **se bloque** (ne rend jamais la main) ; **lit trop peu** ; **confiance faible** ; texte **incohérent** | **Vision** |
| **3. Vision** | échoue à son tour | **rien** — la page reste **« non lue »** |

> **Ne pas envoyer à Vision ce que Tesseract aurait lu.** Une couche douteuse n'appelle pas
> Vision : elle appelle Tesseract. Vision n'intervient qu'après un Tesseract douteux. Sauter un
> étage coûte des appels et masque la vraie défaillance.

### Deux seuils, tous deux DONNÉES de bibliothèque

**« Lit trop peu »** et **« confiance faible »** se règlent **par type de document**, dans le
schéma de la bibliothèque — **jamais en dur dans le code générique**.

*Pourquoi :* une page de partition lit peu de texte **légitimement**, et sa confiance est
**basse légitimement**. Le seuil qui convient à un livre de psychologie condamnerait toutes les
partitions, ou laisserait passer tous les livres mal lus. Aujourd'hui, `passages.ts:54` porte
`MOTS_MINIMUM = 20` **en dur** : une hypothèse de domaine figée dans du code qui se veut
universel — manquement à l'esprit de CLA-01 que le garde-fou de vocabulaire ne peut pas
attraper, puisqu'il cherche des mots et non des nombres.

### Portée : TOUTE lecture par Tesseract

L'exigence ne vise pas seulement le texte des pages. Elle couvre **toute** lecture faite par
Tesseract, **y compris les repères musicaux** — pastilles, numéros de piste, folios en marge.
Partout où Tesseract lit, son échec ou sa difficulté bascule sur Vision.

### Ce qui est dit à l'utilisateur

- Une page relue par Vision est **signalée « lue par Vision »**.
- Si **Vision échoue aussi**, la page reste **« non lue »** — **jamais inventée**, jamais
  silencieuse, et **relue automatiquement plus tard**.

Principe repris de **Sourcelis**, où il est acté et vérifié.

### Ce qui n'est pas négociable

- **Jamais de silence, jamais de faux texte.** Sans réseau ni jeton : la page est marquée
  « non lue, Vision indisponible » et **relue automatiquement plus tard**.
- La lecture Vision est **mise en cache** (déterminisme) et **signalée** sur la page
  (« lue par Vision »).
- Les appels passent par le **Worker de la Liénothèque** (`lienotheque-api`) et **jamais** par
  `clone-proxy`, D1 ou Vectorize.

### Où cela en est

**Non réalisé pour le texte.** `coordonnerLectureDifficile` est branché
(`voie-oracle.ts:786`) et énonce déjà le bon principe — « local d'abord, Vision sur la seule
page en difficulté, puis corroboration » — mais il s'applique aux **marques**, pas à la lecture
du texte. Le seuil est en dur (`passages.ts:54`, `MOTS_MINIMUM = 20`), et **aucun des cinq
`execFileSync` ne porte de délai**.

**Réalisation planifiée avec A2** — parce que le délai effectif en est la condition technique.
**A2 est le moment, pas la portée.** Une fois réalisée, l'exigence s'applique partout.

> **Si vous ne lisez qu'une section de ce document, que ce soit celle-ci** : une page que
> Tesseract lit mal et que personne ne relit est un texte faux entré dans la bibliothèque — et
> rien, ensuite, ne dit qu'il est faux.

---

## 1. Point de vigilance — ce qui a été raté, et le garde-fou de chacun

| Ce qui a été raté | Comment on l'a su | Le garde-fou |
|---|---|---|
| **F3 n'était plus vérifié** du 20/10 au 4/11 : son lien symbolique pointait vers un dossier absent, et l'épreuve s'écartait **en silence** | Le lien a été ouvert, la cible était partie | Une fixture **déclarée mais illisible** doit faire **échouer** le contrôle, pas écarter ses épreuves. Le produit donne déjà le bon exemple : côté Rust, une fixture absente fait échouer le test |
| **Un commit non constructible** (`c2fb2c04`) a rendu un bisect bancal | `git bisect` a dû le sauter | **Chaque commit construit et passe ses tests seul.** Vérifié pour `0dbc5f6e` et `6dae5612` |
| **La mort silencieuse d'un traitement** : 30 minutes d'attente pour un travail mort à 99 % | Table des processus : un zombie | Lot « hôte » : `Drop` qui récolte, garde qui rend la place **et** écrit l'échec, pannes vers la trace |
| **Une décision générale jamais inscrite** (repli Vision, 30/10) | Christophe l'a redemandée le 4/11 | Registre relu en tête de prompt, mis à jour le jour même |
| **Un contrôle de référence lancé sous charge** que j'avais créée : 2 échecs faux, durée ×4 | Relance au repos : 1 échec, durée normale | **Un contrôle de référence tourne seul.** Une mesure faite sous une charge qu'on a créée ne vaut ni pour accuser ni pour rassurer |
| **Un script qui mentait** : « build : code 0 » pendant l'échec | Le build échouait visiblement | **Le code de sortie se lit sur la commande, jamais au bout d'un tuyau** |
| **Une épreuve qui ne prouvait rien** : test de ramassage sur un processus **vivant** | Il passait contre un code sans `Drop` | Une épreuve qui simule la pièce défaillante ne prouve rien de la pièce |
| **Une conclusion écrite avant la sortie qu'elle commente** (`--force` sur un worktree au statut non vide) | La sortie montrait un fichier | Lire d'abord, conclure ensuite ; jamais `--force` sur un statut non vide |
| **Une commande masquée par le shell** : `log` rendait « 0 ligne » sans jamais tourner | Test minimal | Utiliser `/usr/bin/log` |
| **Un journal réécrit avant d'être lu** | La copie est arrivée trop tard | Copier un journal **avant** la passe suivante |

---

## 2. Correction au v22 et au v23 : les « 95 liens vérifiés à l'oreille »

**L'affirmation est FAUSSE.** Elle apparaît trois fois dans chacun des deux documents
(v22 L756, L769, L1251 ; v23 L813, L826, L1314), notamment :

> « 95 liens vérifiés à l'oreille, 95 retrouvés par le socle »

**Ce que dit la transcription du 29 octobre** : à 12:10 puis 12:13, c'est **l'agent** qui a
demandé à Christophe : *« Écoutez **trois ou quatre pistes** contre leurs pages »*, puis
*« F3. Trois ou quatre pistes contre leurs pages »*. Le classement
(`base/classements.json`, 29/10 12:17, `origine: manuel`) a ensuite enregistré
`etat-audio = automatique-prouve` **au niveau du document**, pas des liens.

**La vérité des 95 liens vient du fichier de référence**
`docs/prototypes/70s_Funk_Disco_appariement_mp3.json` — un seul commit, `9c2e2e062` du
**03/10 19:58**, « prototypes de reference du 2 octobre ». Ses appariements portent
`statut: "auto"`, `source_piste: "numero_exercice"` : **sortie d'un prototype automatique**,
vérifiée **par sondage**, sans date ni validateur.

**Conséquence** : **aucun import de « validations à l'oreille » n'est possible.** F3 ne
publiera qu'après une **confirmation lien par lien**.

---

## 3. Feuille de route — dépendances nommées

### A. Socle de liaison PDF ↔ MP3

*Seul chantier tant qu'il n'est pas tenu.*

**A1 — Correspondance feuille ↔ folio unique, et détection des pages absentes.**
Une seule pièce pour les deux : la marge, les plages, le seuil de 5 lectures, la variante
« nombre seul sur sa ligne ». **L'oracle ne détecte pas les pages absentes** (`[]` au lieu de
`[30,31]`) parce qu'il ne compare jamais la **suite** des folios lus à la suite attendue ;
distinguer une page absente d'une lecture manquée exige le rapport entre **feuilles physiques**
et **folios imprimés** — exactement la correspondance qu'A1 doit établir.

**A2 — Délai effectif sur Tesseract, et repli Vision obligatoire.**

> **Le repli Vision est une RÈGLE GÉNÉRALE, pas une pièce du socle musical.** Elle vaut
> **toutes situations, tous corpus, toutes bibliothèques** — Studio Clinique comprise.
> A2 n'est que le **moment de sa réalisation**, choisi parce que le délai effectif sur
> Tesseract en est la condition technique. Une fois réalisée, elle s'applique partout,
> sans avoir à être redemandée chantier par chantier.
Les deux partagent la même pièce manquante : **aucun des cinq `execFileSync` ne porte de
délai**. Sans lui, « Tesseract se bloque » n'est pas détectable et le repli ne peut pas se
déclencher. Le délai doit être porté par le **processus fils** (option `timeout`), appliqué par
le système : celui de vitest ne l'est pas, puisque le fil est bloqué.

**A3 — Confirmation lien par lien conservée à travers les relances.**
**Trois pièces neuves sont nécessaires :**
1. une confirmation qui vise **un lien précis** — élément, feuille, média — et non un `cas.id` ;
2. sa **transmission à la chaîne** : `charge_de` ne passe pas `decisions.json` aujourd'hui ;
3. une **règle de caducité** : toute lecture nouvelle qui diverge rend la confirmation caduque.

*Base existante, à réindexer* : `decisions.json` de l'écran Vérifier
(`lib.rs:674`, `depot.rs:117`), écrit **hors des versions** — il **survit donc aux relances**.
Mécanisme complet, **jamais exercé** : aucune bibliothèque n'en possède.

**Dépendance** : **A3 ne dépend PAS d'A1** *si* la confirmation vise la **feuille physique** et
non le folio. **À confirmer par la mesure M1.** Si oui, **A1 et A3 avancent en parallèle**.

**A4 — Critère F3 réécrit, gardien.** Voie **oracle** (décision du 29/10 : l'oracle remplace
les recettes) **+ confirmations**. **A4 dépend d'A3**, et d'A1 pour les pages absentes.

> **ANNOTATION DU 5 NOVEMBRE 2026 — OUBLI RÉPARÉ. Cette feuille de route ne nommait pas les
> quatre travaux ESSENTIELS du kit du 3 novembre.** Rien n'est supprimé ci-dessous ; il y manquait
> ceci, et dans cet ordre, après le jalon « ça marche » (Bass Aerobics à l'écran), après A1b et
> après A2 :
>
> **1. Le mode manuel** — écran d'association à deux colonnes, glisser-déposer : confirmation lien
> par lien (élément, **feuille**, média ; caduque si la lecture change), puis association libre
> quand le moteur ne propose rien. Base à reprendre : `docs/plan-ecran-relier.md`, l'écran
> `Verifier.tsx`, le `decisions.json` de l'hôte, le contrat `Preuve` qui porte déjà `"manuel"`.
> **Clé : la feuille physique** (A1a). Décisions dans une **couche séparée que le moteur n'écrit
> jamais** — test rouge central : une relance ne perd ni ne modifie une décision humaine.
> **2. Le mode estimation marquée** — c'est la section B ci-dessous. Intenable avant le mode
> manuel : des estimations sans moyen de les corriger font un champ d'erreurs silencieuses.
> **3. La mémoire d'apprentissage à trois niveaux** — association, exemple vérifié, généralisation
> prouvée et réversible — nourrie par les décisions du mode manuel ; elle n'a rien à apprendre
> avant lui.
> **4. L'Expert** — référence versionnée au dépôt le 5 novembre :
> **`tools/lienotheque/docs/cdc-expert-apprentissage.md`** (écrit le 3 novembre, tel quel,
> empreinte du corps `8c48a855…`, annoté le 5 novembre sans que le corps change). **Statut : § 3
> et § 8 VALIDÉS par Christophe le 5 novembre 2026, révisables après usage réel ; conception
> détaillée — format des questions, contrat de l'appel API, budget — à écrire avant tout code.** Il raisonne, il questionne, et **il ne publie jamais seul** (§ 3,
> règle de frontière non négociable). Premier composant **non déterministe** du projet, et le seul
> qui coûte de l'argent et du temps à chaque appel : son § 6 demande un plafond, un comportement
> défini quand l'API ne répond pas, et un **interrupteur global**.
>
> Objectif rappelé (30 octobre) : **des bibliothèques exploitables dans Prof de Basse et Studio
> Clinique.** Et un défaut à corriger avec le mode manuel : **le Lecteur affiche des propositions
> non vérifiées comme des liens sûrs** (mesuré le 5 novembre ; « 0 liens » au catalogue contre
> cinquante-deux liens apparents à l'écran). Détail au registre, entrée du 5 novembre.

### B. Mode « meilleure estimation » marquée
Seuil d'erreur **à fixer par Christophe**.

### C. Familles, une par une
Bass Aerobics, Funk Fusion, Westwood, Aebersold.

### D. Reconstruction propre de la bibliothèque musicale (lot 10), autonome

### E. Plus tard
Parité Sourcelis, Expert, audit en ligne, petits défauts.

---

## 4. État mesuré du chantier

| Fait | Mesure |
|---|---|
| **Aucun lien publié** dans la vraie bibliothèque musicale | 0 |
| Le chantier porte sur les **~115 documents avec audio** | les 135 autres sont des recueils **sans audio** : leur vivier vide est **juste** |
| **248 documents sur 250** jamais traités par la voie oracle | `acquis` vide sur les 250 |
| F3 **a** été retraité sous la règle | version active du **02/11 22:36** |
| sa lecture est **parfaite** | 95 lignes, `pagesAbsentes [30,31]` |
| il **s'abstient** | `corroboration_insuffisante` : « une seule façon de lire… personne n'a encore vérifié ce document » |
| **la bascule seule ne produit rien** sans retraitement | — |

**Toute métrique de liens rapportée sur 250 est requalifiée.**

---

## 5. Consignations

### 5.1 La régression F3, en trois temps
- `c2fb2c04` (29/10 23:37) rend `borne` et `corroboration` **non facultatifs** et abstient
  **avant tout calcul**. Le critère ne passant aucune provenance : `vivier_non_borne`,
  `orphelins = []`. **Personne ne réclame les pistes 93 à 98 : le calcul n'a pas lieu.**
- Avec la provenance portée **par chaque média** (et non par le lot), le premier garde tombe et
  le second prend le relais : `corroboration_insuffisante` sur 95 éléments.
- Dans la vraie chaîne (voie oracle), l'abstention a un autre motif : « aucun folio n'est
  établi à l'échelle du document ».

**Le critère F3 mesure une voie que la vraie chaîne n'emprunte pas** : une bibliothèque neuve
n'a aucune manière de lire enregistrée, donc c'est l'oracle qui travaille — et il ne détecte
pas les pages absentes.

### 5.2 Le verrou contractuel du 30 octobre
`executant.ts:107` : `.transform(({ verifieParUnHumain: _jete, ...reste }) => reste)`.
L'hôte calcule la vérification humaine et l'envoie ; **le contrat la jette**. Raison mesurée :
*« le 30 octobre, le transmettre a publié quarante liens sur le document témoin au lieu de
s'abstenir »*. Commit `f9f29d01`. **Cette décision restreint celle du 29/10** : la voie
« un signal + vérification humaine » exige désormais une vérification **lien par lien**, qui
n'existe pas. **Aucun chemin ne permet aujourd'hui de publier sur un signal unique.**

### 5.3 La mort silencieuse, et sa cause
`roulement.rs:285` découpait un texte UTF-8 **par octets**. Le 4 novembre, sur « … se retrouve
imprimé, … », l'octet 59 = `0xc3`, l'octet 60 = `0xa9` : le « é ». **Indépendant du document** ;
les journaux sont en français. Chaîne complète : panique → `Session` sans `Drop` → `Child` sans
`wait()` → **zombie** ; `menes.remove()` après `mener()` → travail « en cours » **pour
toujours** ; `stderr` perdu pour une application du Finder → **aucune trace**.

**Fragilité voisine** : le message de résultat pèse **206 697 octets sur une seule ligne**.

### 5.4 Lot « hôte » — correctifs (non poussés)
| Commit | Objet | Build seul | Tests seul |
|---|---|---|---|
| `0dbc5f6e` | `Session` récolte son moteur | vert | vert, 156 |
| `6dae5612` | découpage par caractères ; garde avec échec visible et plafond ; pannes vers la trace | vert | vert, 162 |

Défaut introduit **et corrigé** dans le même lot : le premier garde rendait la place sans
écrire l'échec — `file::prendre` ne comptant une tentative que depuis
« en_echec_recuperable », le travail aurait été **repris sans fin**. Un blocage échangé contre
une boucle, trouvé par le test.

**Contrôle complet au repos après le lot** : 2 814 passées, **1 échouée** (critère F3 connu),
4 écartées, 24 min. **Aucune régression.** Paquet refabriqué, vérifié par les octets, installé.

### 5.5 Délais inopérants — tests **et** production
Les deux épreuves expirées portaient `{ timeout: 360_000 }` (6 min) et ont tenu **54,6** et
**19,1 minutes**. Vitest arme son délai sur la boucle d'événements ; `execFileSync` **bloque le
fil**. **Le même appel bloque le moteur en production** : une page sur laquelle Tesseract se
bloquerait **suspendrait l'import indéfiniment**, sans progression ni erreur, « en cours » à
l'écran — indiscernable, pour l'utilisateur, de la panique corrigée. Avant de choisir une
valeur : mesurer la **distribution** des temps d'OCR, pas une moyenne, pour ne pas condamner
une page lente mais saine.

### 5.6 Repli Vision obligatoire (règle du 30/10, réaffirmée le 4/11)
Chaque fois que Tesseract **échoue, se bloque ou lit trop peu**, la page est relue par Claude
Vision. Toutes situations, tous corpus. Principe repris de **Sourcelis**.
**État** : aucun repli Vision **pour le texte**. `coordonnerLectureDifficile` est branché
(`voie-oracle.ts:786`) et énonce déjà le bon principe — « local d'abord, Vision sur la seule
page en difficulté, puis corroboration » — mais il s'applique aux **marques**.
**Le seuil « trop peu lu » est en dur** : `passages.ts:54`, `MOTS_MINIMUM = 20`. Vingt mots
conviennent à un livre, pas à une page de partition. **À déplacer vers le schéma de
bibliothèque.** Conditions : délai effectif ; seuil par type de document comme **donnée** ;
appels par le **Worker de la Liénothèque** uniquement ; sans réseau ni jeton, page marquée
« non lue, Vision indisponible », relue plus tard, **jamais de silence ni de faux texte** ;
lecture **mise en cache** et **signalée**. ~~**Test : exigera une exception explicite de
Christophe** à « aucun appel en ligne ».~~

> **ANNOTATION DU 5 NOVEMBRE 2026 — L'EXCEPTION EST ACCORDÉE, ET ELLE N'EST PLUS UNE EXCEPTION.**
> Les appels en ligne sont **autorisés** pour éprouver le système (décision de Christophe —
> « le réel reste le réel », règle du 29 octobre). Aucune demande au cas par cas n'est donc plus
> nécessaire. Restent interdits, sans changement : `therapeute-library`, `clone-proxy`, Vectorize,
> `bibliotheque-admin.html`. Conditions : par le Worker `lienotheque-api`, jeton du trousseau,
> **chaque appel tracé** dans un journal versionnable ; **pas de plafond** — Christophe ajuste les
> fonds, chaque rapport donne le coût cumulé depuis le 5 novembre et celui de l'étape ; **un refus
> de l'API faute de crédit arrête tout et se rapporte**, jamais de repli silencieux. La règle de
> cette section le disait déjà et devient inconditionnelle : une page que Vision n'a pas lue reste
> « non lue, Vision indisponible », **jamais « sans texte »**. Et la suspension du 4 novembre —
> « aucun agent ne lance de traitement depuis l'application » — est **levée**.

### 5.7 Le jeton, et la relecture armée
Trousseau `login.keychain-db`, service `lienotheque-jeton`, créé le **5 octobre 13:44:30 UTC**
(valeur jamais demandée). L'hôte passe `relecture: https://lienotheque-api…` dans **chaque**
charge. **DÉFAUT : aucun réglage pour désactiver la relecture, aucune indication à
l'utilisateur.** Aucun appel attesté sur l'import du 4/11.
**Règle** : le jeton reste au trousseau ; **aucun agent ne lance de traitement depuis
l'application** tant qu'il y est.

### 5.8 Défaut C, requalifié
Les 135 documents sans provenance sont des **recueils sans audio** : leur vivier vide est
**juste**. Le défaut est de **présentation** : `medias_accompagnants` vaut `true` par défaut
(`travail.rs:54-60`), si bien qu'un vivier légitimement vide se présente comme « aucun média
interprété ». Le correctif doit permettre de déclarer un document **« sans média »**, et
l'interface l'afficher comme un **état normal**. Déclaration **par le correctif, jamais à la
main** ; écriture dans la vraie bibliothèque **sur le mot de Christophe**.

### 5.9 Interface
Feuille et folio **distingués partout**. « 4 bibliothèques » pour cinq cartes : **résorbé**
(4 cartes, 4 bibliothèques). Bouton **Renommer réparé** (`7016840f`). L'assistant ne propose
**aucun modèle « méthode d'instrument »**. L'application **recrée `.volume-present`** dans une
bibliothèque supprimée.

### 5.10 Bibliothèques et sauvegardes
« Bibliothèque Studio Clinique » (ex « Base de connaissance ») restaurée, sauvegardée,
renommée ; ses **6 échecs** : 3 crashs `exit(1)` et 3 illisibles.
**Les `exit(1)` ont une cause DISTINCTE** de la panique de l'hôte : **18 occurrences**,
**3 documents** (861, 8 et 6 pages), **6 tentatives chacun**, **journalisés** au niveau
`erreur`. Piste : limite mémoire d'un module WebAssembly.
**RISQUE** : `/Volumes/Macbook Pro` porte les **originaux sans seconde copie** (≈ 11 Go),
la Bibliothèque musicale, Studio Clinique **et** sa sauvegarde. Deux objets irremplaçables :
`Jon Liebman - Funk Fusion Bass.zip` (corpus **F5 / REC-07**, son PDF n'existe nulle part
ailleurs) et 12 MP3 d'Aebersold 099. **Une sauvegarde sur un autre support est recommandée.**

### 5.12 A1 — la feuille physique perdue (mesures du 4 novembre)

**DÉCISION (4/11)** : *une page se désigne TOUJOURS par sa feuille physique*. Une feuille vide
garde sa place avec un statut. Le champ est **renommé `index` → `feuille`**, jamais redéfini,
pour que **le compilateur désigne chaque consommateur**. La feuille physique devient **la clé
d'A3**.

**Le fait mesuré.** Sur Bass Aerobics : **116 feuilles** (PDF), **116 images**
`page-0000`…`page-0115`, mais **115 entrées** dans `resultat.pages`, index **0 à 114
contigus**. Donc `page-0013.webp` est ouverte pour le folio 13, alors que ce folio est sur la
**feuille 15**. *« 14 là où la marge lit 13 »* : confirmé.

**Les quatre comptes, tous justes, chacun comptant autre chose :**
**116** feuilles physiques · **115** feuilles portant quelque chose · **114** feuilles
numérotées (la couverture ne l'est pas) · **113** feuilles dont l'OCR a tiré du texte
(feuilles 13 et 115 : une image, aucun passage — **le cas d'école de l'exigence 0**).

**Ce que `resultat.pages` contient réellement** : une entrée par feuille **émise** par
`pagesEnGris` — c'est-à-dire **toute feuille PORTANT UNE IMAGE**. Une feuille **sans image**
est **sautée** (`banc.ts:464`) et **ne laisse aucune place** : l'index, incrémenté seulement
pour les feuilles émises (`banc.ts:419`), devient un **rang** et cesse de désigner une feuille.

> **CORRECTION DE FORMULATION (5/11).** J'avais écrit « pages sans repère ». C'est **faux** :
> le critère n'est pas le repère, c'est **l'image**. F1 est un PDF à **couche texte** :
> **33 de ses 55 feuilles ne portent aucune image**, donc 22 émises. Une feuille peut très
> bien porter une image sans aucun repère — elle est alors émise et comptée.

> **CORRECTION DE MA PROPRE HYPOTHÈSE.** J'avais classé les grands écarts comme des
> « traitements interrompus ». **Faux pour 17 des 18 documents** : tous sont `termine`,
> « Version écrite et activée ». **Un seul** est `en_pause`, `c4e96eec` (834 d'écart).
> Le phénomène est **systémique**, pas accidentel. *Toute page sans repère décale les
> suivantes — pas seulement une page blanche.*

**Producteurs** : la **voie oracle** garde le trou (`voie-oracle.ts:1027`, une entrée par
feuille rendue depuis `rendu.nombreDePages`) ; la **voie recette** reprend l'index amont
(`interprete.ts:104`) ; les **images** suivent les feuilles (`pages-images.ts:236`).
**Consommateur fautif connu** : `instantane.ts:345`, `entree.imageDePage?.(page.index)`.

**18 documents touchés** : 7 dans la Bibliothèque musicale (dont **F1** 22/55 et
**Bass Aerobics** 115/116), 11 dans Studio Clinique (dont `c4e96eec` 27/861).

**NON ÉTABLI** : le point exact (fichier:ligne) où l'index devient contigu dans la voie
recette. Chemin connu : `lot.ts:241 rejouer(...)` → `interprete.ts:470 interpreter(pages:
PageLue[])` → `interprete.ts:104 index: page.index`. **Aucune migration ne doit être écrite
avant cette localisation.** Mesure suivante : instrumenter `rejouer` sur Bass Aerobics et
comparer les index en entrée et en sortie d'`interpreter`.

### 5.11 Divers
`outils/cache/src/index.ts:18` porte en dur `CACHE_PAR_DEFAUT = "/Volumes/Macbook Pro/
lienotheque-cache"` : la chaîne dépend d'un volume débranchable.
**Asymétrie des fixtures absentes** : côté Rust le test **échoue**, côté JavaScript l'épreuve
**s'écarte en silence**. Le comportement Rust est le bon.
**C2** : moteur déterministe ; **aucune version d'outil enregistrée** dans les versions.
**Tableau des signaux et définition d'indépendance** : *un signal n'est indépendant que s'il
n'a servi ni à produire le lien, ni à choisir ce qu'on vérifie.* Bass Aerobics : TRCK 48/48
indépendant ; marge 33/48, 0 contredit ; **vue.pages 48/48 dépendant** ; papier 4/4.

---

## 6. À traiter plus tard

**Audit reporté (points b à f)**
- **b)** Funk Fusion : où sont les rapports 98/98 du 28/10 (`lienotheque-cache/rapports-c9-3/`) ;
  pourquoi la méthode n'est dans aucune bibliothèque.
- **c)** Les trois `exit(1)` de Studio Clinique : quel était le correctif C2 du 25/10 ;
  pourquoi ces documents échouent encore (jamais retraités, ou régression).
- **d)** Rotation manuelle par page (livrée le 28/10) : encore dans le paquet installé ?
- **e)** Liste épinglée des échecs et écarts connus du contrôle complet : proposer le fichier.
- **f)** 404 `/donnees/bibliotheque.json` et lot 9 : état, par les commits et les notes.

**Mesures du plan Relier (M1 à M5)** — M1 conditionne le parallélisme A1 / A3.

**E2** : retraitement d'essai réduit (~20 documents, deux familles rapportées séparément).

**Sparsebundle** `lienotheque-portabilite-complete-2026-10-28` (13 Go) : contenu inconnu.

**Groupe B** : suppressions à valider nom par nom.

**`couche-fautive.pdf`** : fixture manquante, générateur versionné ; références des fixtures.

**Seuil du mode estimation** : à fixer par Christophe.

**Siegfried** : non tranché depuis le **22/10**.

**Les 24 titres présents dans Sourcelis et absents de la Liénothèque** (relevé du 25/10).

**Intégration réelle de Studio Clinique par les jetons C3** : prêts, **jamais branchés**.

**Nettoyage du registre public** : en retirer chemins absolus, noms de volumes et nom du corpus
personnel — les décisions elles-mêmes n'ont rien de confidentiel, le dépôt est public.

**Méthode des bancs rapides par `extracteur-pages.html`** : vérifier **d'abord** sa fidélité
selon les quatre axes du §-1 quinquies (octets des images, flux de page, couche texte, résultat
de lecture identique à l'original). L'outil vit sur `main` et **ne se modifie pas**.

---

## 7. Questions ouvertes pour Christophe

1. ~~**Push** de `0dbc5f6e` et `6dae5612` ?~~ **ACCORDÉ le 4/11** — poussés, origin à
   `6dae5612`, rev-list 0 0.
2. **Seuil d'erreur** du mode estimation.
3. **Critères de bascule** de Studio Clinique : parité livre par livre, qualité de lecture,
   mêmes réponses sur des questions réelles.
4. **Index local ou en ligne** pour Studio Clinique.
5. **Seconde copie** du volume externe — le risque le plus concret aujourd'hui.
6. **Exception** pour le Worker de diagnostic : **ouverte**. Pour le Worker de la Liénothèque :
   **ACCORDÉE le 4/11**, au moment d'**A2**, **limitée au repli Vision**.
7. **Suppressions du groupe B**, nom par nom.
8. ~~**Place du repli Vision**~~ **TRANCHÉE le 4/11 : réalisé avec A2** — étant entendu
   que **la règle est générale** et s'applique ensuite à tous les corpus et toutes les
   bibliothèques, et non au seul chantier musical.
9. **Q2 — mode strict ou estimation par défaut** pour la vraie bibliothèque musicale ?
10. **Sens de « ouvert à tous »** pour la version en ligne.


---

# 8. CDC v23 — intégral

*Ce qui suit est le v23 tel qu'il était, aux trois annotations près.*

# Liénothèque — CDC audit et reconstruction, 29 octobre 2026

Document de référence unique pour l'audit demandé par Christophe et la reconstruction de la
bibliothèque musicale. Objectif explicite : **un système dont chaque affirmation peut être
vérifiée, qui refuse de son propre chef de présenter un résultat non prouvé** — pas seulement
« ça marche », mais « ça marche et on sait pourquoi on peut y croire ».

## -1 octies. État réel au 3 novembre 2026, 20 h — ce qui est vrai ce soir

Écrit à la fin d'une session de travail, à partir de Git et de la transcription, jamais de
mémoire. Cette section dit l'état ; elle ne décide rien.

### Git

`origin/wip/lienotheque-2026-10-29` est à **`6dd069fd`** après deux pushes explicitement
autorisés (`ab3686ba..2c138c72`, puis `2c138c72..6dd069fd` ; `rev-list --left-right --count`
→ `0 0` les deux fois). Un commit local, **`a3b3fbe7`** (correction d'attribution d'un banc),
n'est pas poussé.

Les commits de la session, du plus ancien au plus récent :

| commit | ce qu'il corrige |
|---|---|
| `ab753149` | tolérance OCR proportionnelle : une contradiction isolée ne défait plus vingt accords exacts |
| `61d516bc` | le Lecteur ouvre à la vitesse originale (100 %), non à 75 % |
| `bac38c66` | une bibliothèque ne porte plus qu'un `Liénothèque.app` ; un ménage incomplet ne fait plus passer une installation réussie pour un échec |
| `ab3686ba` | l'ordre de fabrication du paquet, écrit après avoir signé par erreur un paquet de la veille |
| `2c138c72` | relire le dossier au moment de choisir une bibliothèque |
| `6dd069fd` | verser au dépôt les vingt-neuf bancs de mesure et leur index |
| `a3b3fbe7` | corriger l'attribution d'un banc, et écrire qu'un banc dérive sans prévenir |

Au moment d'écrire : 31 fichiers non suivis sous `tools/lienotheque` avant le commit des bancs, 2
après (`AVIS-COLLISION-2026-11-01.md`, laissé intact à la demande de Christophe, et
`docs/plan-ecran-relier.md`, non validé). Trois remises (`git stash`) existent dans le dépôt, sur
`main` et `evidenceforge-freeze-monolith-v1.0.20` : elles appartiennent à d'autres sessions,
elles ont été laissées intactes.

### Contrôle complet

`pnpm check` sur l'arbre entier : **2 784 épreuves passées, 67 écartées, zéro échec**, 17 suites
de paquet, 22 minutes. Journal conservé hors dépôt.

> **Correction d'un chiffre annoncé en séance.** Ce total avait d'abord été rapporté comme
> « 1 202 tests sur dix paquets ». C'était faux : la somme avait été faite sur les dix derniers
> récapitulatifs visibles d'un affichage tronqué. Le compte exact, refait sur le journal entier,
> est 2 784.

### Compaction de la vraie bibliothèque musicale

`/Volumes/Macbook Pro/Bibliotheque Musique/applications` ne contient plus que `Liénothèque.app`
(`macOS/`, `version.json` et `.DS_Store` retirés). Signature vérifiée après copie ; empreinte de
l'exécutable `08973347…`, identique à celle de `/Applications`. L'empreinte des données —
`sources/`, `base/`, `derives/` — vaut **`c2f7dd9e…`** avant et après, et encore à la
revérification de fin de session. Deux autres bibliothèques avaient reçu le même geste plus tôt
(`a6917e04…` et `36ca969b…`, inchangées elles aussi).

### Les vingt-neuf bancs de mesure

Restés non suivis depuis le 1er novembre, ils ont tous été écrits par la session du 29 octobre au
3 novembre — **prouvé par la transcription**, pas déduit : 27 y figurent comme créés par un outil
d'écriture ou une redirection shell, les 2 derniers comme écrits dans le plan de travail
temporaire puis copiés. Ils sont désormais indexés dans
`outils/ingestion/mesures/README.md` : ce que chaque script mesure, sa première sortie retrouvée,
un statut honnête (a produit / jamais abouti / sortie non retrouvée) et sa section de ce document
quand elle le nomme. **14 ont produit, 5 n'ont jamais abouti, 10 n'ont pas de sortie
retrouvable.**

### Les 31 épreuves écartées — et ce qu'un contrôle vert ne prouve pas

Compté par le rapporteur JSON de vitest, jamais par recherche de texte dans un journal :
**2 784 passées, 0 échouée, 31 écartées**, 881 suites. Deux causes, aucune autre — il n'existe
aucun `it.skip` inconditionnel dans le dépôt :

- **œuvre absente du dépôt** (règle 5) : `F1/aebersold-FRENCH.pdf`, `F2/Realbook Bass F.pdf`,
  `F3/'70s Funk & Disco Bass.pdf`, `couche-fautive.pdf` ;
- **corpus non désigné** : `LIENOTHEQUE_AEBERSOLD_002` non posée, corpus Funk Fusion absent.

Tesseract, Pillow et les fixtures `F4`, `500-pages*.pdf`, `double-page-scan.pdf` sont présents :
rien n'est écarté pour un outil manquant.

| paquet | écartées | |
|---|---|---|
| ingestion | 11 | `criteres` 4, `vignettes` 3, `couche-fautive` 3, `aebersold-002-corpus` 1 |
| formats | 7 | `fixtures-reelles` |
| recettes | 5 | `flux` 3, `banc` 2 |
| inspecteur | 3 | `inspecteur` |
| lecteur-texte | 3 | `lecteur` |
| optimiseur | 1 | `fixtures-bilevel` |
| vision | 1 | `funk-fusion-corpus` |

**Les 31 portent toutes sur le vrai corpus.** Parmi elles, nommément :
`critère F3 — méthode numérisée, 95 sur 95 (OUT-15, REC-06)`, ses trois épreuves, et les trois
de `vignettes` sur F3, et les deux de `banc` sur F3, et les trois de `flux` sur F3.

> **Conséquence à ne pas adoucir : un `pnpm check` vert ne prouve PAS la non-régression sur le
> document de référence.** Onze épreuves touchant F3 sont écartées faute de l'œuvre, et c'est
> exactement le document qui sert de témoin à tout le reste. Le vert dit que rien n'a cassé
> *dans ce qui s'exécute*.
>
> **Note de conception à ouvrir — à ne pas implémenter sans décision** : un contrôle local
> complet qui pointerait ces épreuves vers les vraies œuvres par variable d'environnement, sans
> rien commiter, et qu'on lancerait avant les étapes qui touchent au moteur. Reste à concevoir :
> où nommer les chemins, comment échouer clairement quand l'œuvre manque au lieu de s'écarter en
> silence, et comment empêcher qu'un tel contrôle serve d'excuse à ne plus jamais lancer celui
> qui tourne partout.

### Périmètre de CLA-01, écrit noir sur blanc

Le garde-fou de vocabulaire couvre **le code de production** et lui seul :
`packages/contrats/src`, `packages/jetons/src`, `packages/noyau/src`, `outils/*/src`,
`apps/worker/src`, `apps/app/src` (sauf `apps/app/src/donnees`), `apps/app/src-tauri/src`. Mesuré
en exécutant sa propre logique d'expansion : **220 fichiers contrôlés, zéro sous
`outils/ingestion/mesures/`.**

Bancs, épreuves, fixtures et prototypes nomment des documents **par construction** : c'est le
périmètre voulu, pas une fuite. Des fichiers suivis le font déjà dans `docs/prototypes/`,
`fixtures/recettes/`, `outils/vision/mesures/`, `outils/ingestion/test/` et six bancs `f4-*`.
Aucune action corrective n'est demandée. La convention qui tient les bancs du bon côté est écrite
dans leur README : **un nom de document passe par la ligne de commande, jamais écrit dans le
fichier** — vérifié sur les vingt-neuf, zéro mot de la liste.

> **Question ouverte, à ne pas trancher ici.** Le dépôt est public. Il expose des titres de
> corpus et des listes de pistes — jamais de contenu : vérifié sur les 760 fichiers suivis,
> aucun PDF commercial, aucun média n'est suivi. À traiter avec le §-2.

### Le défaut de double page : OUVERT

`lot.ts` passe à la voie générique le texte de `lireLeTexte`, qui coupe les feuilles à deux pages
et renumérote lorsque la manière de lire ne déclare rien — ce qui est toujours le cas sur la voie
générique, par définition. Les index compareraient alors des demi-pages contre des feuilles
rendues, et `corroboration_media` est l'une des deux lectures qui autorisent une publication.

**État : sans effet mesuré sur les 17 extraits d'essai** (dix-sept alignés, zéro glissement),
**non garanti sur une œuvre entière, et aucune garde explicite n'a été posée depuis.** La garde
proposée — refuser `texteDesPages` quand son compte ne correspond pas au nombre de feuilles — n'a
pas été écrite.

### `associateur.ts` : ce qui existe déjà pour l'étape 2

Le type `Appariement` porte **`statut: "auto" | "a_verifier"`**, et `LECTURES` énumère
`pastille`, `corroboration_media`, `corroboration_table`, `vision`. La forme existe.

> **Note de conception pour l'étape 2, à ne pas traiter comme un simple ajout de valeur.** La
> bascule vers la meilleure estimation crée un état qui n'existe pas aujourd'hui : **« publié
> mais estimé »**, distinct de « à vérifier » (qui n'est pas publié). Trois états au moins
> cohabiteront alors — publié et corroboré, publié et estimé, non publié et à vérifier — et le
> Lecteur, le Catalogue et les compteurs de l'accueil les liront tous les trois. Comment les
> distinguer sans mentir, et ce qu'un compteur « liens » doit alors compter, est une **question
> ouverte de conception**, pas une valeur d'énumération à ajouter.

### L'écran « Relier »

Un plan avant code existe, `docs/plan-ecran-relier.md`, **non commité tant qu'il n'est pas
validé**. Il tient le filet de sécurité que la décision §-1 septies rend indispensable : six
lots, un test rouge central — une décision humaine survit à une relance du moteur —, et une
couche `base/decisions/` que le moteur n'écrit jamais.

---

## -1 septies. DÉCISION STRATÉGIQUE MAJEURE du 3/11 — bascule vers « meilleure estimation »

**Christophe a décidé d'inverser la règle absolue tenue depuis le début du projet (§0 : zéro
lien automatique sans deux signaux indépendants ou vérification humaine).** Raison invoquée :
après plusieurs nuits de travail, le moteur d'association fonctionne (prouvé : F3 83%, Bass
Aerobics 48/52 confirmés par deux signaux indépendants, règle de noms généralisée à 117
enregistrements sur six documents), mais la barre de corroboration stricte ralentit la mise en
usage réelle de la bibliothèque — la plupart des documents restent en abstention malgré un
signal souvent correct.

**Nouveau principe adopté** : le moteur publie désormais sa meilleure estimation même sur un
seul signal, au lieu de s'abstenir par défaut. Chaque lien ainsi publié doit rester **clairement
marqué « estimation non confirmée »** — jamais présenté avec la même confiance qu'un lien
corroboré par deux signaux. L'écran d'association manuelle (conçu, voir section apprentissage
plus bas) devient le vrai mécanisme de correction, pas un confort secondaire.

**Ordre de construction décidé** : 1) l'écran d'association manuelle à deux colonnes doit exister
AVANT la bascule en mode estimation à grande échelle (filet de sécurité d'abord) ; 2) le
changement de philosophie de publication, avec marquage clair de confiance sur chaque lien ;
3) le système d'apprentissage à partir des corrections humaines (trois niveaux déjà posés :
association humaine prioritaire, exemple vérifié, généralisation seulement après preuve répétée
et réversible — ce principe de prudence sur l'apprentissage n'est PAS remis en cause par cette
décision).

**Ce qui ne change pas** : zéro hardcoding de vocabulaire métier ; les deux modes (corroboration
stricte / meilleure estimation) doivent coexister, le mode strict restant la référence de vérité
pour juger la qualité des estimations et disponible comme option pour une bibliothèque où
l'erreur n'est jamais acceptable ; toute la discipline de preuve habituelle (test rouge, pnpm
check, commits séparés, jamais main).

## -1 sexies. Avancée majeure du 2/11 — le principe de l'« axe qui tient »

Répondant à la demande explicite de Christophe (« pas de hardcoding, juste ce qu'un humain fait
naturellement : chercher la corrélation entre le nom du MP3 et ce qui est affiché sur la page »),
le moteur ne cherche plus un type de repère (pastille, nom distinctif) mais **un axe qui tient** :
une correspondance entre deux lectures indépendantes — ce que les noms du vivier disent, ce que
les pages portent (texte imprimé, marque récurrente, montée géométrique dans le corps de page) —
testée sur **quatre propriétés mesurables, aucune propre à un document** :

- **injectivité** : un enregistrement par page, écarte un mot qui tombe partout ;
- **ordre** : les pages suivent le rang des enregistrements, écarte une coïncidence ;
- **couverture** : une vraie part du vivier est placée, écarte un hasard isolé ;
- **non-contradiction** : deux axes qui se contredisent font reculer, écarte la fausse confiance.

Un nom désigne par ses **suites de mots**, pas ses mots isolés : « workout » tombe sur les 52
pistes d'un document (ne désigne personne), « workout 9 » n'en désigne qu'une. Deux fichiers
partageant une même désignation (ex. « Demo » et « Play-Along » pour « brick house ») ne sont
plus traités comme un conflit mais comme deux candidats légitimes pour la même page.

**Preuve mesurée sur 6 vrais dossiers, documents entiers (texte lu une fois, gardé)** : la règle
actuelle situait 11 enregistrements au total ; la règle renforcée en situe **117**. Détail :
Bass Aerobics 0→52/52 (ordre croissant parfait, titre « Workout N »), Bach 4→7/9, Aebersold 005
6→6 (ordre non vérifié — voir ci-dessous), Bass Play Along 1→16/17, Paul Westwood 0→36/92 (par
catégorie large seulement), Keith Rosier 0→0 (encore non résolu).

**Démonstration que le garde-fou générique fonctionne sans aucune règle de domaine** : sur un
document Aebersold qui imprime deux fois « Track 1 » (côté A et côté B), l'axe par ce numéro
échoue automatiquement aux tests d'injectivité et d'ordre — rejeté par la mesure, zéro règle
écrite pour cette famille. Résout aussi, génériquement, la triple numérotation de Paul Westwood
(folio, piste, exercice) : chacune reconnue par **le type de lecture qui l'établit** (une valeur
par page / un endroit qui revient / plusieurs par page en ordre croissant), jamais par sa
signification.

**Trois limites honnêtes, non masquées** : l'échec d'ordre sur Aebersold 005 est le garde-fou qui
fonctionne correctement (un mot trompeur isolé, à juste titre rejeté) ; l'échec d'ordre sur Bass
Play Along vient d'une erreur du propre banc de mesure de l'auteur (une désignation large comme
« play » concurrençant à tort une désignation étroite — à corriger avant tout code) ; Keith
Rosier (pastille losange seule) et l'essentiel de Paul Westwood restent non couverts par les noms
seuls — ils ont besoin de la « seconde moitié » de l'axe (confronter les noms à la marque
récurrente ou à la montée géométrique déjà présentes dans le moteur), pas encore câblée en
confrontation avec les noms.

**Suite du 2/11, trois défauts génériques distincts trouvés et traités séparément — tous mesurés
avant tout code, aucun écrit sans preuve préalable** :

1. **Le plancher de détection confondait repère de page et repère d'enregistrement** — une
   marque qui désigne un enregistrement (une fois par morceau) ne peut jamais franchir un
   plancher pensé pour un repère de page (présent partout). Sur 4 documents entiers testés
   (Bass Aerobics, Keith Rosier, Bass Play Along, Paul Westwood), 0 lien publié, abstention à
   47-49 % d'un seuil à 50 % — jamais loin, jamais au-dessus, signe d'une cause systémique.
   **Corrigé et commité** (`3414b4fd`) : le plancher se borne désormais à la taille du vivier à
   désigner, jamais à la somme des pages. Vérifié sans régression sur F3 (calcul structurellement
   identique à l'ancien plancher sur ce document) ; débloque 6 nouveaux candidats sur Rosier
   (18→24 endroits), qui reste néanmoins à zéro lien pour une autre raison (point 2).
   Une seconde piste (montée stricte comme critère de robustesse) a été **testée puis rejetée** :
   elle aurait accepté à tort un cas déjà connu du dépôt (une ligne plate de bord de page,
   normalement rejetée) et ne bat pas un tirage aléatoire pur sur le cas Rosier — non écrite,
   correctement rendue comme non démontrée plutôt que forcée.

2. **Résolu le 2/11 après-midi** (commit `f5016861`) — diagnostic d'hier soir corrigé : la
   pastille de Rosier n'était pas « coupée en deux fragments » mais **diluée** — ses 22 vraies
   apparitions existaient, mais la règle de regroupement n'en retenait que 16, noyées dans un
   groupe de 63 formes (47 étrangères). Cause : rayon de regroupement trop large et mal centré
   sur la forme de départ plutôt que cherché. Six approches testées et rejetées (fermeture
   transitive, boîte stricte qui cassait F3, raffinement du représentant, fusion de groupes) ;
   la septième tient — trois fenêtres indépendantes glissant chacune sur ce que les deux autres
   retiennent, plusieurs points de départ essayés, le plus fourni retenu. Résultat : F3 intact
   (95/95, aucune régression), Rosier 16→21 formes sur 22. **Prix assumé** : groupes plus serrés
   demandent plus d'endroits à examiner (F3 6→11, Rosier 24→39). Rosier reste en abstention après
   ce correctif (toujours plafonné à 47%) — le regroupement n'était pas le seul verrou, le
   problème de lecture (point 3 ci-dessous) reste entier, mais Rosier devient maintenant le
   meilleur témoin pour ce chantier : il porte exactement le motif attendu (losange sombre,
   chiffre clair) et échoue quand même, isolant le problème sans la confusion de polarité qui
   compliquait Bach.

3. **Troisième défaut trouvé le même soir, puis corrigé le 2/11 — la fenêtre de lecture ne
   cherche pas autour du repère, seulement dedans.** Sur **J.S. Bach for Electric Bass**,
   l'hypothèse initiale (polarité inversée du motif) a été testée et **infirmée** : les quatre
   combinaisons possibles (2 motifs × 2 polarités) ne rendent aucune suite 1-9 lisible. En
   examinant l'image brute de la fenêtre de lecture, la vraie cause apparaît : elle ne contient
   que le pictogramme du disque et le haut des lettres **« CD TRACK »** — le chiffre est
   physiquement situé en dessous, hors du cadre.

   Principe générique formulé : « la forme qui revient désigne un endroit, pas forcément le
   nombre » — miroir exact d'un défaut déjà corrigé sur F3 où marque et libellé étaient au
   contraire fondus en une bande trop large.

   *(Ce document n'est pas du code : CLA-01 ne s'y applique pas, et nommer les recueils rend les
   mesures revérifiables. L'anonymisation de la v22 était un excès de zèle.)*

   **Le renforcement d'abord proposé a été mesuré, puis écarté.** L'idée était d'essayer
   plusieurs fenêtres ancrées sur la forme détectée (la boîte, puis étendue vers le bas, puis
   vers la droite) et de laisser le vote existant trancher. Vingt combinaisons de fenêtres, de
   motifs et de polarités ont été essayées sur les huit apparitions du recueil : **aucune ne rend
   la suite attendue.** Les trois suppositions sont enchevêtrées — une fenêtre juste lue à
   l'envers ne rend rien, une polarité juste sur une fenêtre qui ne contient pas le nombre non
   plus — et les corriger une à une ne pouvait pas marcher.

   **Corrigé et commité le 2 novembre à 17 h 05 (`5a4cc71a`)**, par une troisième manière de lire
   qui lève les trois suppositions d'un geste : elle cesse de chercher une forme, lit l'encre
   telle qu'elle est imprimée avec tout l'alphabet, et ne garde que les nombres isolés. Mesuré :

   | recueil | meilleure des deux autres manières | celle-ci |
   |---|---|---|
   | **J.S. Bach for Electric Bass** — nombre sombre sous un pictogramme | 2 justes sur 8 | **8 lues, 7 justes** |
   | *non identifié* — chiffres clairs sur pavé sombre | 12 sur 12, suite exacte | 9 lues, 8 justes |
   | *non identifié* — chiffre clair sur pavé sombre | 9 sur 12 | 2 lues |

   > **Deux des trois recueils ne sont pas identifiables.** Leur vivier de douze ne correspond à
   > aucun document nommé ailleurs dans ce document — F3 en porte 95 à 99, Keith Rosier 22,
   > Bach 9. Le message de `5a4cc71a` ne les nomme pas non plus. Plutôt qu'une attribution
   > vraisemblable, « non identifié ».

   **Elle ne remplace rien** : deux recueils sur trois restent mieux lus par les manières
   existantes, et le troisième n'existe que par celle-ci. L'oracle les essaie toutes et garde
   celle dont la suite vaut le mieux, jamais le nom de la manière. Non-régression vérifiée par la
   chaîne entière sur trois documents : le document de référence retient le même endroit qu'avant
   — 4,3 × 3,2 % de la page, **95 apparitions, numérotation 83 %**.

**Les points 2 et 3 sont l'un et l'autre corrigés et commités** (`f5016861` le 2/11 à 15 h 08,
`5a4cc71a` le 2/11 à 17 h 05).

> **Incohérence corrigée dans cette version.** La v21 portait, au même endroit, un titre disant
> « trouvé et corrigé » et un corps disant « mesure en cours avant tout code », puis concluait
> « aucun code du moteur n'est encore touché sur les points 2 et 3 » — alors que son propre point
> 2 annonçait déjà `f5016861`. Les trois énoncés ne pouvaient pas être vrais ensemble. Les faits
> ci-dessus viennent des messages de commit, vérifiés dans Git.

## -1 quinquies. Priorité du 1/11 soir — corpus d'essai non fidèle, nouvel outil demandé

**Découverte critique du 1/11** : les extraits produits par `extracteur-pages.html` (pdf-lib,
`copyPages`) ne sont pas lisibles par `pagesPdf()`, le lecteur de structure du projet — 0 page,
0 image sur les 17 extraits de la bibliothèque d'essai, alors que les 24 documents originaux sont
tous lus correctement (dont 12 déclenchant le garde-fou `jpegFatal`, qui s'avère porter **la
moitié du vrai corpus**, pas un cas marginal comme signalé par erreur plus tôt). Conséquence :
**six modules de production** (inspecteur, export d'images, chaîne de texte, rendu, validation
structurelle, banc) **n'ont jamais été réellement exercés** par tous les tests de la soirée sur la
bibliothèque d'essai — ils retombaient silencieusement sur pdf.js. Un avertissement a été posé
(se déclenche sur les 17 extraits, jamais sur les 12 originaux testés en négatif) pour que ce
défaut de validité de mesure ne reste plus invisible.

**Décision de Christophe le 1/11 soir, priorité absolue** : construire un nouvel outil
d'extraction qui produit des extraits **structurellement fidèles** aux documents originaux
(mêmes décomptes par `pagesPdf()`, même chemin de décodage d'image), prouvé par la mesure avant
d'être considéré fini — pas une approximation visuelle. Une fois prouvé, reconstruire la
bibliothèque d'essai de 17 familles avec ce nouvel outil.

**Fait, et trois vrais bugs du lecteur PDF du projet trouvés en chemin — bien plus importants que
l'outil lui-même** (commits `4e67ccd9`, `45336b56`, `e9404eb1`) :

1. **Faux positifs du garde-fou `jpegFatal` sur la moitié du vrai corpus** : le lecteur
   confondait une référence indirecte de longueur de flux (`/Length 229 0 R`) avec sa valeur
   littérale (229), tronquant des images JPEG saines de centaines de milliers d'octets à
   quelques centaines, jugées à tort « incomplètes ». Corrigé par résolution en deux passes.
   **Vérifié sur les 250 vrais documents après correction** : plus aucun déclenchement par ce
   critère — la vraie protection (2 documents à 4 composantes colorimétriques, critère non
   affecté par la troncature) tient toujours, confirmant que le correctif rend le garde-fou
   juste plutôt que de le désarmer. Réserve honnête posée : la documentation mentionne 3 PDF
   ayant fait planter le processus historiquement, seuls 2 retrouvés dans cette bibliothèque — le
   troisième n'est pas confirmé couvert.
2. **Ressources héritées jamais suivies** : une page sans son propre `/Resources` (hérité d'un
   nœud ancêtre selon la norme PDF) était lue sans aucune image. Rare (1 document sur 250, 33
   pages sur 11 035) mais réel — trouvé par un signe inversé remarquable (un extrait rendait
   *plus* d'images que son original, signe que c'est l'original qui était mal lu, pas l'extrait
   qui inventait).
3. **Cause initiale du problème d'extraction** : `pdf-lib` écrit par défaut une xref compressée
   et des flux d'objets (`/ObjStm`) que le lecteur du projet (qui scanne `N G obj` en clair dans
   les octets bruts) ne voit jamais. Corrigé par une seule option, `useObjectStreams: false`.

**Preuve finale sur 40 documents réels** : 40 extraits corrects, 0 raté, 0 refus silencieux (2
documents chiffrés refusés explicitement plutôt que produits de façon trompeuse). Deux erreurs de
mesure de l'auteur lui-même corrigées en chemin avant de conclure (comparaison d'images sur le
mauvais périmètre de pages, interprétation erronée d'un non-déclenchement du garde-fou).

**En attente de décision** : la page publique `extracteur-pages.html` (sur `main`, pas sur la
branche de travail) porte le même défaut et nécessite le même correctif d'une ligne à quatre
endroits — pas encore fait, nécessite un geste contrôlé pour ne récupérer que ce fichier sans
fusionner tout `main`.

> **⚠ ANNOTATION DU v24 (4 novembre 2026) — ce passage est PÉRIMÉ.** Le correctif **a été
> appliqué** le **1er novembre à 21:27**, commit `63bca598f` « Extracteur de pages : écrire les
> extraits sans flux d'objets ». Vérifié dans les octets du fichier sur `main` :
> **quatre appels à `.save()`, tous les quatre avec `useObjectStreams: false`**. Aucune
> modification locale en attente. Le v23 puis le v24 ont recopié cette phrase sans la vérifier —
> **leçon : une phrase « pas encore fait » se revérifie à chaque version, sinon elle survit à sa
> propre correction.** Le passage est conservé ; seule sa lecture change.

> **Section réintégrée depuis la v20.** Elle avait disparu de la v21 sans annonce. Rien n'y est modifié.

## -1 ter. Soirée du 31/10 — le coût de l'exploration, et la mémoire de ce qui a été appris

### Une correction d'abord : le document « qui ne finit jamais » finit

Le tableau du 30/10 soir annonçait l'Aebersold 103 à « 54 zones, jamais terminé ». **C'était faux,
et c'était mon erreur de mesure, pas un défaut du moteur.** Le journal contenait trois exécutions
empilées, dont deux que j'avais moi-même interrompues. Séparées :

| exécution | endroits | essais | exploration | issue |
|---|---:|---:|---:|---|
| 1 (interrompue) | 56 | 48 | 303 s | inachevée |
| 2 (interrompue) | 56 | 6 | 46 s | inachevée |
| **3 (propre)** | **56** | **112** | **701 s** | **abstention motivée** |

Les 56 endroits proposés sont tous éprouvés, et le moteur conclut honnêtement. Relecture des
**vingt journaux réels** : l'exploration est **naturellement bornée par le contenu** — de 4 à 182
essais « endroit × façon de lire », **tous menés à leur terme**, aucun en cours à la fin. Il n'y a
pas de fuite. Il y a un coût : jusqu'à 947 s pour un document de douze pages, repayé à chaque
passage. C'est la facture qui était le problème, pas une boucle sans fin. La décision de politique
du 30/10 soir avait été prise sur ce chiffre faux ; elle reste juste, pour une autre raison.

### 1. Un filet de renoncement — conservé bien que sa justification soit tombée

Décision de Christophe, prise en connaissance de la correction : garder le filet comme protection
peu coûteuse contre l'inconnu — vingt documents ne sont pas deux cent cinquante.

**256 essais et 2 700 secondes**, dérivés des mesures : 1,4 fois le maximum observé (182), et ces
256 essais au rythme le plus lent observé (10,2 s l'essai ; l'ordinaire va de 4,3 à 7,7 s). Aucun
des vingt n'y tombe — vérifié après coup sur le plus coûteux : 112 essais sur 112, même issue,
même phrase. Une épreuve interdit d'abaisser l'une des deux bornes sous la réalité mesurée.

Deux points de conception approuvés : un endroit qui a **prouvé** sa numérotation est gardé même si
le filet s'est refermé avant la fin — ses marques sont toutes relues ensuite, et la publication
exige toujours deux signaux indépendants ; et l'abstention par renoncement est **une phrase
distincte** de « tout essayé, rien ne numérote ». Commit `dde0aa84`.

> **Règle stricte, révisée par §-1 septies.** Ce passage pose la corroboration à deux signaux comme absolue : c'est désormais la règle du **mode strict**, qui demeure et reste le défaut là où l'erreur n'est jamais acceptable. En **mode estimation**, une publication sur un signal unique est permise à condition d'être marquée « estimation non confirmée ». Rien n'est retiré ici.


### 2. L'élagage — 43 % de reconnaissances en moins, à résultat identique garanti

Les deux cribles d'abord commandés (juger sur 4 apparitions avant de confirmer sur 12 ; second
motif réservé aux survivants) ont été **écartés par la mesure, non par prudence** :

- Un gagnant réel du corpus se lit `[—,—,—,—,9,10,38,39,41,42,43,77]` : ses quatre premières
  apparitions sont muettes. Sur un échantillon de 4 il note **exactement 50 %, à égalité avec un
  recalé** — et près de zéro si le tirage avait pris trois de ses quatre trous. `avance` se
  comptant sur `couples + 1`, **aucun seuil non nul sur un échantillon réduit n'est sûr** : c'est
  le tirage qui trompe, pas le seuil.
- Réserver le second motif aux survivants du premier perdrait les endroits qui ne se lisent que du
  second : les deux motifs sont deux façons de lire le **même** endroit.

À la place, **un élagage sans aucun seuil à régler** : lire les apparitions une à une et abandonner
un essai dès qu'il est *prouvé* qu'il ne peut plus dépasser ni le seuil ni le meilleur endroit déjà
trouvé. La borne majore les trois facteurs séparément, et une apparition déjà lue et muette est un
fait acquis, non une inconnue.

| | lectures | gain |
|---|---:|---:|
| cinq documents réels, avant | 4 326 | — |
| cinq documents réels, après | **2 460** | **−43 %** |
| dont le plus gros (91 endroits, gagnant au 123ᵉ essai) | 1 164 au lieu de 2 106 | −45 % |

Les quatre endroits retenus sont identiques au centième, et les comptes prédits par simulation hors
ligne coïncident **à l'unité** avec ceux mesurés dans le produit. L'abstention cite désormais la
plus haute borne atteinte — « le plus prometteur ne pouvait pas dépasser 49 % » — un plafond
démontré et non une mesure, puisque plus aucune note ne va à son terme. Commit `6a3628c1`.

### 3. La mémoire de l'oracle — la dépense devient réellement unique

**État constaté avant correction**, et reproduit dans l'hôte réel : le même document retraité sans
rien changer refait la même exploration, à la lecture près (6 endroits, 12 essais, 64 lectures,
103 s puis 104 s). `manieres.json` reste `{}` avant comme après ; une version ne garde que la
géométrie des marques publiées, lue des seuls écrans ; rien n'est conservé pour un document qui
s'abstient — **seize documents sur vingt**, et les plus coûteux.

**Deux empreintes, pas une.** L'endroit et la façon de lire ne dépendent que du document ; les
liens dépendent du vivier, mais ils vivent dans la version. Faire tomber l'acquis parce qu'un
enregistrement a été ajouté rachèterait 839 s d'exploration pour refaire quelques secondes
d'attribution.

Contrat `AcquisDeLecture`, dans le vocabulaire de l'oracle existant. Ce n'est pas un cache : il
garde un **raisonnement** — chaque lecture porte son rang et sa hauteur, donc se rouvre. Quatre
interdits, chacun avec son épreuve : un endroit retenu sans une seule lecture ; un témoin pris dans
l'échantillon ; conclure « aucun endroit » sans un seul essai — le garde-fou contre le filet ; une
empreinte de vivier glissée dedans. Et `voie: {id, version}`, **le garde-fou contre sa propre
amélioration** : sans lui, les documents déjà vus garderaient à jamais les conclusions de
l'ancienne lecture.

**Mesuré de bout en bout, par l'hôte et le moteur réels, dans de vraies bibliothèques :**

| document | premier passage | passage suivant |
|---|---:|---:|
| Aebersold 103 — abstention, 56 endroits, 112 essais | **515 s** | **18 s** |
| 70 Funk & Disco Bass — endroit trouvé, 40 marques | **101 s** | **65 s** |

Le second journal de l'abstention compte 14 lignes contre 129 : pas une page rendue, pas un endroit
proposé, pas une reconnaissance. Sa phrase dit ce qu'elle fait — « Conclusion retrouvée, non
refaite » — pour que personne ne croie qu'on vient de le vérifier.

Le gain n'est que **partiel** là où un endroit a été trouvé, et c'est un choix : la recherche de
l'endroit est sautée, la relecture de ses quarante marques par le coordinateur ne l'est pas. Garder
les quarante lectures aurait doublé le gain et fondé les chiffres publiés sur une lecture remémorée
plutôt que sur les octets.

La voie **recalcule elle-même l'empreinte du document** et la compare à celle de l'acquis : laissée
à l'appelant, une erreur de clé appliquerait l'endroit d'un document à un autre. L'hôte n'écrit
rien de plus — la version porte déjà ce que la chaîne rend, et il l'écrit d'un seul geste. `null`
est accepté à la porte, comme pour `recette` : c'est le piège qui a tué 248 travaux le 30/10.
Commits `70bdcc39` (contrat) et `ed74019a` (implémentation).

### Un défaut d'épreuve trouvé au passage

`pnpm check` vert mais **une épreuve Rust en échec** : quatre épreuves du moteur partageaient un
décor temporaire nommé du seul numéro du processus, et l'une d'elles **retire exprès le dossier des
modèles de langue** — c'est son objet. Elle défaisait le décor de celle qui exige qu'il soit là.
Chacune seule passait ; ensemble, une sur deux environ. Un rejeu vert avant toute correction a
d'ailleurs interdit de conclure sur un seul passage. Quatre décors distincts, cinq rejeux verts.
**Le produit n'avait rien : seule l'épreuve mentait, et elle mentait en accusant.** Commit
`d971dd53`.

### État de clôture du 31/10

`pnpm check` : **2 722 épreuves passées, 0 en échec, code de sortie 0**. Épreuves Rust :
**154/154**, cinq fois de suite. Quatorze commits sur `wip/lienotheque-2026-10-29`, rien sur
`main`, rien poussé.

Paquet macOS reconstruit **une seule fois** avec les trois chantiers, signé et vérifié dans ses
octets : paquet et `node` embarqué en `flags=0x10002(adhoc,runtime)`, `allow-jit` présent,
`codesign --verify --deep --strict` vérifié, 165,85 Mio. Les trois chantiers sont présents dans le
`moteur.js` livré, cherchés sur des fragments ASCII contigus — les accents y sont échappés, et
c'est l'erreur de mesure du 30/10 matin.

Le contraste a enfin été mesuré **sur le paquet signé lui-même**, en lui adressant deux fois la
même demande par le protocole de l'hôte : **507 s sans acquis, 16 s avec**. Dans les deux cas le
moteur rend le même résultat et le même acquis.

Au premier essai cette mesure a échoué — « Cannot find module pdfjs-dist » — parce que mon
invocation à la main ne posait pas `LIENOTHEQUE_PDFJS`, que l'hôte pose. Le paquet n'avait rien ;
c'est l'environnement reproduit qui était incomplet, et le dire évite de rouvrir demain un défaut
qui n'existe pas.

> **Section réintégrée depuis la v20.** Elle avait disparu de la v21 sans annonce. Son garde-fou « une table bien formée n'est pas une table juste » reste à vérifier au regard de `001c8a61` (corroboration par la table globale, 3/11) — rattachement non établi.

## -1 quater. 1er novembre 2026 — les deux chemins mesurés, un piège de pdf.js, et un garde-fou à poser

### Le garde-fou le plus important de la journée : une table bien formée n'est pas une table juste

**Jamais de table publiée sans vérifier que ses valeurs sont plausibles pour ce qu'on cherche.**
`estUneTable` et le décompte de « rangées utilisables » ne suffisent pas, et c'est mesuré :

- **Famille 04, page 12** : treize rangées « complètes et nettes », donc dignes de confiance selon
  le détecteur. C'est une **discographie** — `6309 849 « Point of View w/Spyro Gyra; MCA »`,
  `3407618179 « Romantic Warrior w/Return to Forever »`. Des numéros de catalogue, pas des liens.
- **Familles 03 et 05** : des pages de **tablature**, dont les numéros de case deviennent des
  colonnes. Valeurs relevées : 2 000 000 000, 989 580, 161 140, 781 276.

N'importe quelle liste chiffrée — discographie, index, bibliographie — franchit le garde-fou
actuel. La plausibilité est une connaissance de l'**appelant**, pas de la table : c'est au point
d'appel qu'il faut exiger qu'un rang soit une page de ce document et une valeur une pièce de ce
vivier. Sans cela, le chemin par la géométrie publierait des liens tirés d'une discographie.

### Les deux chemins candidats, mesurés sur les 17 familles

| chemin | couverture prouvée | verdict |
|---|---|---|
| **noms ↔ contenu** | **5 Aebersold sur 6**, 5 à 10 liens chacun, **tous dans l'ordre croissant des pages** *(ancien corpus ; corpus fidèle : 5 sur 6, de 0 à 9 liens — voir -1 quinquies)* | **le levier d'universalité** |
| table par géométrie | **1 famille sur 16** (Bass Aerobics, 43 enregistrements sur 52) *(confirmé au chiffre près sur le corpus fidèle — mais page 5, pas page 3)* | utile, borné, à câbler avec la garde ci-dessus |
| renvoi imprimé par motif de texte | 1 famille propre, **des faux indiscernables ailleurs** *(motif à reformuler sur le corpus fidèle — voir -1 quinquies)* | **écarté par la mesure** |

**Prémisse du brief corrigée dans les deux sens.** Sur J.S. Bach, la voie par les noms ne rend
qu'**un** lien sur neuf : trois des neuf noms partagent tous leurs jetons, et un seul accord est
trouvé sur douze pages entièrement océrisées. J'en avais conclu trop vite que le chemin par les
noms était faible — **c'était une généralisation depuis un mauvais témoin**. Bach porte des noms
de mouvements qui se répètent ; les Aebersold portent des titres d'œuvres que les pages
impriment. Mesuré : 008 → 7 accords, 012 → 7, 103 → 11, 109 → 9, 120 → 10, et **021 → 0** (28 de
ses 33 noms sans jeton distinctif, abstention correcte).

**Le renvoi imprimé « piste N » est écarté par la mesure, non par prudence.** Propre et croissant
sur Bass Aerobics (6/6) ; partiel sur Bach (3 vrais, 1 faux venu d'une colonne de sommaire) ;
**faux** sur les deux Paul Westwood (483, 539, 557, 621 pour 73 pistes — des mesures ou des folios,
zéro dans le vivier) ; **absent** des Aebersold 008, 012 et 103. Un motif sur du texte aplati
fabrique des faux indiscernables des vrais ; la lecture doit passer par la géométrie.

### Dette connue : lire la couche texte casse un rendu déjà ouvert

Isolé en trois cas, reproductible :

```
rendu seul (3 pages)                     1,0 s
couche seule                             0,8 s
rendu ouvert → couche → rendu page 1     NE FINIT JAMAIS
rendu page 1 → couche → rendu page 2     1,3 s
couche → rendu → 3 pages                 1,3 s
```

Ce n'est pas une erreur ni une lenteur : `page.render()` rend une promesse qui ne se résout pas, et
le processus s'éteint en annonçant une attente pendante. **Neuf documents réels sur dix-sept en
meurent**, dont les cinq Aebersold — 106 documents de la vraie bibliothèque.

**La production y échappait par accident d'ordonnancement** (la voie ferme son rendu avant de lire
la couche). **Contournement** : lire la couche **avant** d'ouvrir le rendu, ce qui évite le piège
par construction plutôt que par convention.

**Deux correctifs tentés, mesurés sans effet, retirés** : un processus de travail dédié par document
(`new pdfjs.PDFWorker` — l'option est ignorée) et les ressources de décodage passées explicitement
à la lecture de couche. Aucun des deux n'a rien changé. Ne pas y retourner sans mesurer.

**Aucune épreuve ne peut couvrir ce piège** : un PDF fabriqué ne le reproduit pas, et il faudrait
donc une œuvre sous droits dans le dépôt.

**Signalement corrigé le soir du 1er novembre — il était faux.** J'avais écrit que `jpegFatal`
serait « inopérant », en mesurant sur les extraits et non sur les originaux. Vérifié sur les
**250 documents de la vraie bibliothèque** : la lecture de structure les rend **250 sur 250**, et
le garde-fou se déclenche sur **2** — deux JPEG à quatre composantes colorimétriques, dont l'un
est chiffré. Le garde-fou est opérant en production. Ce qui était vrai, et grave, c'est que
`pagesPdf()` rendait 0 page **sur les extraits d'essai** : voir -1 quinquies.

### Le détecteur de table, corrigé deux fois et mesuré

**`82cbba9c` — une faute lue trop haut n'était nommée par aucun des deux signes.** Le détecteur
refusait sa confiance sur deux signes : une valeur loin de la médiane, et un **creux**. Sur la
vraie table « CD Track Listing », la colonne lit 31, **82**, 33, 34 — un 3 pris pour un 8 — et la
rangée était rendue **utilisable**, donc digne de confiance. Le premier signe ne la voyait pas non
plus : la colonne allant de 31 à 52, sa dispersion médiane laisse passer un écart de 41 sous une
limite de 48. C'est exactement le « quatre fausses indiscernables des trente-cinq justes » que ce
module existe pour empêcher. Critère retenu : les fautes d'une colonne qui monte sont les valeurs
**hors de sa plus longue montée** — un critère qui ne se mord pas la queue, là où comparer aux
voisines immédiates faisait passer les voisines d'un creux pour des bosses.

**`3067d5cd` — une rangée porte un enregistrement, même quand la page en imprime deux.** La table
réelle est imprimée en **deux panneaux côte à côte** ; les rangées, groupées par leur hauteur,
portaient donc deux enregistrements chacune. Le découpage exige **deux lectures indépendantes qui
s'accordent** : la périodicité des écarts entre colonnes (398, 112 puis 393, 114 — et la frontière
entre panneaux n'est **pas** le plus grand écart, 315 contre près de 400, couper au plus grand trou
aurait été faux), et **l'en-tête que le document écrit lui-même** (« Description Track Page
Description Track Page »). Une périodicité peut arriver par hasard ; couper alors inventerait des
enregistrements.

| Bass Aerobics page 3 | avant | après |
|---|---:|---:|
| panneaux vus | 1 | **2** |
| colonnes par rangée | 6 | **3** |
| rangées utilisables | **14** | **43** |

### Deux faits de corpus

- **Les familles 10 et 13 portent le même PDF** (même empreinte SHA-256) : l'éventail compte
  **seize documents distincts**, pas dix-sept. La famille 10 (« Methode a verifier ») est un
  doublon d'Aebersold 021 sans ses médias. *Corrigé le soir du 1er novembre* : la famille 13
  portait en réalité **deux** PDF — Aebersold 021 et son supplément — et la famille 04 n'était pas
  un doublon de la 03 mais un troisième document du même auteur. Le corpus reconstruit compte
  **18 fichiers pour 17 originaux distincts**.
- La couche texte et le rendu comptent **les mêmes pages sur les dix-sept** (index 1..n, zéro
  écart), et `lireLeTexte` **n'a coupé aucune** double page sur ces extraits — la détection
  automatique ne s'y déclenche pas. Le risque de glissement de numérotation reste donc
  **structurel et non actif** sur ce corpus.

### Travail en parallèle : deux agents sur le même espace

Un second agent écrivait simultanément dans `voie-oracle.ts` et `lot.ts`, implémentant la
réutilisation du texte de la chaîne. Territoire laissé à lui ; avis déposé en fichier neuf
(`AVIS-COLLISION-2026-11-01.md`) avec le défaut mesuré, le piège de pdf.js, et la liste des
reliquats à retirer — **il les a retirés**, garde-fou CLA-01 revenu au vert.

**À faire quand son câblage sera posé** : vérifier à deux que la voie par les noms fonctionne de
bout en bout sur les cinq Aebersold mesurés, avec les liens candidats visibles pour vérification
humaine et **jamais publiés sur un seul signal**.

> **Règle stricte, révisée par §-1 septies.** Ce passage pose la corroboration à deux signaux comme absolue : c'est désormais la règle du **mode strict**, qui demeure et reste le défaut là où l'erreur n'est jamais acceptable. En **mode estimation**, une publication sur un signal unique est permise à condition d'être marquée « estimation non confirmée ». Rien n'est retiré ici.


> **Section réintégrée depuis la v20.** Elle porte les **résultats** du 1er novembre au soir, quand le « -1 quinquies » de la v21 ci-dessus n'en porte que la **demande**. Les deux sont gardés : même numéro dans les deux documents sources, contenus complémentaires. La v22 annonçait ici que certains de ses chiffres étaient « révisés par le §-1 sexies (mesure 11 → 117) ». **Cette mention est retirée : la mesure 11 → 117 n'a pas pu être reproduite le 3 novembre** (voir l'annexe). Rien d'autre n'est retiré.

## -1 quinquies. 1er novembre 2026 soir — le corpus d'essai était faux, et trois mesures sur quatre bougent

### Le défaut : les extraits d'essai ne se comportaient pas comme des documents

Les dix-sept extraits qui servaient à **tous** les essais depuis le 29 octobre rendaient **zéro
page et zéro image** à la lecture de structure du projet, là où leurs originaux les rendent
toutes. Six modules de production s'appuient sur cette lecture — l'inspecteur, l'export d'images,
la chaîne de texte, le rendu, la validation structurelle, le banc. Sur ce corpus, tous voyaient un
document vide et retombaient sur pdf.js. Rien ne cassait : le chemin éprouvé n'était simplement
pas celui de la vraie bibliothèque.

**Cause** : pdf-lib écrit par défaut une table de références croisées compressée et range les
dictionnaires de page dans un flux d'objets (`/ObjStm`, PDF 1.5+). La lecture de structure cherche
`N G obj` dans les octets bruts : elle n'en voit alors aucun. `useObjectStreams: false` suffit, et
une option vaut mieux qu'un écrivain de PDF fait main — les attributs hérités (`/MediaBox`,
`/Resources`, `/Rotate`) vivent sur les nœuds intermédiaires de l'arbre des pages, et les
reconstruire est une occasion de les perdre ; `copyPages` les porte.

**Trois défauts de notre propre lecteur, trouvés et corrigés en chemin** :

| commit | défaut | effet |
|---|---|---|
| `4e67ccd9` | `/Length N 0 R` indirect non résolu | les flux d'images coupés au mauvais endroit |
| `45336b56` | `/Resources` hérité du `/Pages` parent non suivi | des pages déclarées sans image alors qu'elles en portent |
| `dd9e0749`, publié sur `main` en `63bca598` | les quatre `save()` nus de `extracteur-pages.html` | tout extrait produit par l'outil public était illisible par la structure |

Les deux premiers sont couverts par des épreuves sur PDF fabriqués (`longueur-indirecte.test.ts`),
sans aucune œuvre sous droits. Le troisième est publié sur `main` (`63bca598`) et vérifié dans la
page servie.

### La fidélité, prouvée sur quatre axes

Les dix-huit fichiers reconstruits depuis leurs originaux, puis comparés à eux :

| | ancien corpus | corpus fidèle |
|---|---:|---:|
| pages vues par la lecture de structure | 0 sur 18 | **18 sur 18** |
| avertissement « structure muette » émis par la production | 18 fois | **0 fois** |
| images, contre l'original sur le même intervalle de pages | 0 | **identiques, 18 sur 18** |
| verdict du garde-fou de décodage, contre l'original | muet | **identique, 18 sur 18** |
| octets de pixels des pages 1 et 6 rendues | — | **identiques, 18 sur 18** |

La dernière ligne est la seule qui ne puisse pas se tromper en silence : elle compare des pixels,
pas un décompte. Le garde-fou a été éprouvé en plus sur un document où il se déclenche vraiment
— un JPEG à quatre composantes, le cas qui rend le moteur à `exit(1)` : « 1× JPEG à 4 composantes
colorimétriques » de part et d'autre.

**Deux documents chiffrés sont refusés explicitement** par l'outil, plutôt qu'extraits de travers :
un extrait fidèle demanderait de les déchiffrer. Comportement retenu.

### Pourquoi aucun chiffre de l'ancien corpus ne pouvait être repris

**Les anciens extraits ne commençaient pas page 1.** Mesuré sur deux familles : leur page 1 rendue
ne porte ni la géométrie ni les pixels de la page 1 de l'original (600×839 contre 600×776 ;
600×774 contre 600×773). Leur structure étant illisible, d'où ils partaient est irretrouvable.
Toutes les mesures d'avant portent donc sur des pages inconnues.

### Les trois mesures refaites depuis zéro

**1. Renvoi imprimé, 17 familles.** Le verdict « écarté » tient, mais **son motif est à
reformuler**.

| famille | ancien corpus | corpus fidèle | |
|---|---|---|---|
| 05 Bass Aerobics | propre et croissant, 6 sur 6 | **3** renvois, 3 dans le vivier, croissant | nuancé |
| 06 J.S. Bach | 3 vrais + 1 faux de sommaire | **4** renvois, 4 dans le vivier, **non croissant** | confirmé |
| 08 et 09 Paul Westwood | **faux** : 483, 539, 557, 621 pour 73 pistes | **0 renvoi** sur les deux | **infirmé** |
| 10 et 13 | 3 renvois non croissants (4, 29, 1) | **0 renvoi** sur les deux | **infirmé** |
| 11, 12, 15 (Aeb. 008, 012, 103) | absent | 0 renvoi | confirmé |
| 02 Bass Play Along | non rapporté | **2** renvois, 0 dans le vivier | nouveau |
| 16 Aebersold 109 | non rapporté | **1** renvoi dans le vivier (p2→12) | nouveau |
| 17 Aebersold 120 | non rapporté | **1** renvoi dans le vivier (p5→3) | nouveau |

Les trois témoins à charge du CDC — Westwood et ses 483/539/557/621, les familles 10 et 13 et leur
suite 4/29/1 — **vivaient sur des pages absentes du corpus fidèle**. La charge ne repose plus que
sur Bach. Mais deux témoins neufs la remplacent, et ils sont pires : les familles 16 et 17 rendent
**un renvoi isolé chacune, dans le vivier**, donc impossible à écarter par le garde-fou. Le motif
retenu n'est donc plus « il fabrique des faux grossiers » mais **« il fabrique des renvois isolés
qu'aucune corroboration ne peut trancher »**. Couverture : 4 familles sur 17, 9 renvois en tout,
une seule suite croissante.

**2. Table par géométrie, Bass Aerobics.** **43 rangées utilisables : confirmé au chiffre près**,
mais **page 5** du corpus fidèle et non page 3 — le numéro de page du CDC était faux alors que le
résultat était juste. Les deux panneaux sont vus, les rangées portent 3 colonnes et non 6, et le
détecteur de fautes retrouve son cas d'origine : `rangée 42 colonne 1 = 82 : rompt la montée de la
colonne, entre 31 et 33` — le 3 lu 8 qui avait motivé `82cbba9c`.

**Deux faux témoins neufs sur ce même document**, qui renforcent le garde-fou de plausibilité :

- **page 4** : TABLE, 4 rangées utilisables, libellé « CHAPTER », valeurs 2→26, 3→46, 4→66, 5→86.
  C'est le **sommaire** — chapitre et page. Publié tel quel, il donnerait quatre liens faux sur un
  document qui porte 43 vrais deux pages plus loin.
- **page 9** : TABLE, 2 rangées utilisables, libellés « 4- » et « 3 = i. » — du bruit d'OCR.

La nécessité d'exiger la plausibilité **au point d'appel** est donc maintenant mesurée sur le
document même qui porte la seule vraie table du corpus, et plus seulement sur des familles tierces.

**3. Voie par les noms, 6 Aebersold.**

| famille | ancien corpus | corpus fidèle |
|---|---:|---:|
| 008 Sonny Rollins | 7 | **5** |
| 012 Duke Ellington | 5 | **0** |
| 103 David Sanborn | 8 | **4** |
| 109 Fusion | 7 | **2** |
| 120 Feelin' Good | 10 | **9** |
| 021 Gettin It Together | 0, abstention | **1** |
| **total** | **37** | **20** |

**Ce n'est pas la voie qui a faibli, c'est l'échantillon qui a changé** : les anciens extraits
portaient des pages riches en morceaux, les fidèles portent les pages 1 à 12 — couverture,
préface, pages de gammes. L'écart démontre ce qu'aucune des deux mesures ne disait : **aucune
mesure sur extrait ne peut établir la couverture générale de cette voie.** Le chiffre de
production se prend sur le document entier, et il reste à prendre.

Ce qui tient : **5 Aebersold sur 6 rendent des candidats, dans l'ordre croissant des pages**. La
direction est confirmée, les chiffres ne le sont pas. Deux réserves : l'abstention de 021, donnée
comme correcte à 0, rend maintenant **un candidat isolé** — à ne jamais publier sur un seul
signal ; et la ligne « l'ordre suit-il les enregistrements ? OUI » affichée pour 012 avec zéro lien
ne veut rien dire, la question étant vide quand il n'y a rien à ordonner.

### Une leçon de méthode, payée trois fois le même soir

Trois de mes mesures de ce soir ont rendu des résultats plausibles et faux parce que j'avais passé
la mauvaise chose à une fonction qui l'a acceptée sans rien dire : un `Buffer` à `pagesPdf()` qui
attend une `Map` d'objets, un objet image à `causeJpegFatalAvantDecodage()` qui attend des octets,
et un champ `octets` qui est une **taille** pris pour des octets. La première m'a fait croire que
mes extraits étaient ratés ; la deuxième m'a fait annoncer « 17 sur 17 » sur une comparaison vide ;
la troisième a produit des « JPEG à 125 composantes colorimétriques », qui n'existent pas.

La production appelle correctement aux trois endroits — `rendu-page.ts` filtre même sur
`extension === "jpg"`. Rien à corriger dans le code. **Garde-fou de méthode à retenir : un chiffre
physiquement impossible est un bogue de la mesure, pas une découverte ; et une mesure qui rassure
mérite la même défiance qu'une mesure qui accuse.**

### Un geste à ne pas refaire

La racine de la bibliothèque d'essai n'est pas un dossier d'extraits : les dossiers de famille
portent aussi les 1 378 fichiers audio, et la racine porte `base/`, `sources/` (1,6 Go) et
`applications/`. Remplacer « le corpus » en déplaçant la racine détruit la bibliothèque d'essai.
L'échange ne doit porter que sur les PDF, famille par famille.

## -2. Clarification du dépôt, décidée le 29/10 soir — à exécuter une fois le moteur oracle fini

Le vrai `main` de Christophe est `/Users/christophebonnet/Documents/GitHub/C-Concept-Dev`, pas
`C-Concept-Dev-main-fusion-wt` (qui portait `main` par erreur d'organisation historique, jamais
la vraie branche principale voulue). Une clarification de dépôt a été lancée le 29/10 soir
(audit, rapatriement, nettoyage des branches obsolètes) mais **suspendue** après avoir découvert
que `main-fusion-wt` est le worktree où tourne activement la construction du moteur oracle, avec
du travail non commité (`packages/contrats`, `packages/noyau`). Le worktree a été renommé
`wip/lienotheque-2026-10-29` pendant la clarification — fichiers intacts, vérifiés identiques à
une archive de sécurité, mais la branche n'est plus `main` sur ce chemin.

**Décision de Christophe** : une fois le moteur oracle terminé et validé (garde-fou F3 95/95
confirmé), tout le travail doit être commité et poussé sur le vrai `main`, à
`/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/tools/lienotheque` — jamais sur
`main-fusion-wt`. Le reste du nettoyage de dépôt (171 fichiers mélangés entre projets, 29
branches locales restantes, clarification avec le dépôt GitHub en ligne) reste en pause jusqu'à
ce moment, pour éviter une seconde collision avec le chantier actif.

## -1 bis. Éventail de 17 familles, 29/10 nuit — deux défauts graves trouvés et corrigés

Premier vrai test du socle branché en production (seconde voie, sans recette) sur 17 familles
inconnues. Résultat final : **zéro publication**, mais chaque abstention est motivée, pas
silencieuse — 4 familles s'abstiennent légitimement faute de second signal (noms ne portant
qu'un rang). Cinq mécanismes fabriquant de faux liens ont été retirés dans la même passe.

**Le fait le plus important de la nuit** : le témoin (famille 01, F3, dont les 95 vrais liens
sont connus et vérifiés à l'oreille) a d'abord semblé publier **40 liens, tous faux**. **Correction
du 30/10 matin : ce « 0/40 » était lui-même une erreur de mesure**, pas un défaut du moteur — un
décalage d'une page entre le PDF et le folio imprimé, non tenu compte dans la comparaison. Avec le
bon alignement : 35 justes sur 40. **La théorie des « deux numérotations concurrentes » n'existait
pas non plus**, vérifiée fausse directement sur les pixels (« Pattern 13 » porte bien une pastille
13 — une seule numérotation, pas deux à départager). Les deux affirmations ont été retirées du
CDC et de la mémoire du projet.

> **⚠ ANNOTATION DU v24 (4 novembre 2026)** — la formule « vérifiés à l'oreille » est **inexacte** : la transcription du 29/10 (12:10 et 12:13) montre que l'agent a demandé d'écouter **trois ou quatre pistes**, et que la validation a été enregistrée **au niveau du document** (`classements.json`, `origine: manuel`). La vérité des 95 liens vient du fichier de référence du 2 octobre (`statut: "auto"`), vérifié **par sondage**. Voir § 2 du v24. **Le passage est conservé tel quel ; seule sa lecture change.**

**Le vrai défaut, trouvé ensuite et corrigé** : une seule marque mal lue ne corrompt pas qu'elle-
même — elle réécrit jusqu'à huit marques voisines correctement lues, parce que l'écart de suite
autorisé se calculait entre deux lectures brutes (y compris une fausse). Corrigé en dérivant le
pas attendu de la tendance de la suite amont, pas de la dernière valeur brute — réduit l'erreur de
5 à 1 sur l'extrait, aucune régression sur les 272 épreuves existantes. **Vérifié sur le document
entier : 95 liens vérifiés à l'oreille, 95 retrouvés par le socle, sans l'ancienne recette — le
garde-fou non négociable du CDC est tenu.**

> **⚠ ANNOTATION DU v24 (4 novembre 2026)** — la formule « vérifiés à l'oreille » est **inexacte** : la transcription du 29/10 (12:10 et 12:13) montre que l'agent a demandé d'écouter **trois ou quatre pistes**, et que la validation a été enregistrée **au niveau du document** (`classements.json`, `origine: manuel`). La vérité des 95 liens vient du fichier de référence du 2 octobre (`statut: "auto"`), vérifié **par sondage**. Voir § 2 du v24. **Le passage est conservé tel quel ; seule sa lecture change.**

**Un défaut distinct, réel et grave, reste acquis** : une vérification humaine enregistrée pour un
document avait été prêtée à une lecture que cet humain n'avait jamais vue — violation directe de
la règle « zéro faux lien ». **Corrigé par un verrou structurel** (l'option retirée du système de
types, impossible à repasser par erreur), vérifié par une épreuve dédiée. Ce défaut-là, lui,
n'est pas remis en cause par la correction du matin — il est indépendant du calcul erroné.

**Leçon de méthode retenue et mise en mémoire du projet** : une mesure qui accuse mérite exactement
la même défiance qu'une mesure qui rassure. Et les commentaires de code ne survivent pas à la
compilation dans tous les paquets (`@lienotheque/recettes` les perd, `@lienotheque/noyau` les
garde) — vérifier le comportement réel du code dans le binaire livré, jamais une phrase de
commentaire.

Un second trou a ensuite été trouvé dans le **vrai chemin de production** (pas seulement le banc
de test) : le drapeau de vérification humaine était encore transmis à la seconde voie par
`instantaneDeLot`, invisible au typage à cause d'un angle mort du contrôle des propriétés en
trop sur les objets étalés. **Portée réelle mesurée et corrigée après une première
surestimation** : seuls 2 documents de la vraie bibliothèque sont marqués prouvés, et les deux
ont déjà une recette écrite (donc empruntent l'ancien chemin, pas la seconde voie) — aucun
document n'était donc exploitable aujourd'hui, mais le trou se serait ouvert dès qu'un document
sans recette serait marqué prouvé, ce qui est le cours normal de la croissance de la
bibliothèque. Fixé : le drapeau ne descend plus à la seconde voie.

**Deux défauts restent ouverts** (le premier des trois initiaux — l'élection entre deux
numérotations — n'existait pas, retiré après vérification sur pixels) :
1. Le folio et la double page, que le socle sait déjà faire mais que la voie ne lui demande pas
   (familles 08, 09).
2. Une voie qui ne part pas d'une marque visuelle, pour les documents sans pastille mais à noms
   distinctifs (famille 03 et 248 documents sur 250 de la vraie bibliothèque, dont tous les
   Aebersold).

**Note sur la piste du « second signal » proposée par Christophe** : juste dans son principe,
déjà prouvée efficace cette nuit pour écarter deux fausses marques sur d'autres familles (noms
distinctifs confrontés à la lecture visuelle) — mais inapplicable au témoin F3, dont les fichiers
s'appellent `Track 01.mp3` à `Track 99.mp3` (aucun nom distinctif, rien à confronter). Gardée en
réserve pour un futur cas réel d'élection ambiguë, pas appliquée ici puisque le défaut qu'elle
visait n'existait pas.

**Prémisse renversée le 30/10, sur J.S. Bach, puis corrigée une seconde fois le même soir** :
la « voie par les noms de fichiers » semblait d'abord faible (un seul lien sur neuf sur Bach),
au profit d'un signal de renvoi imprimé (table Page→Titre→Piste) jugé plus général. **Mesure
complète sur les 16 documents distincts de l'éventail (un doublon trouvé : familles 10 et 13
sont le même PDF)** : le renvoi imprimé ne couvre proprement **qu'une seule famille** — Bass
Aerobics (6/6, croissant, dans le vivier) ; faux sur les 2 Paul Westwood (numéros de mesure/
folios confondus avec des pistes, 0 dans le vivier réel) ; douteux sur 3 Aebersold (ordre non
croissant) ; absent sur le reste. **Généralisation depuis Bach reconnue fausse par son propre
auteur** : Bach n'est pas représentatif des Aebersold (noms de mouvements répétitifs vs titres
d'œuvres distincts). **Remesurée spécifiquement sur les 6 familles Aebersold** : 5 sur 6 rendent
5 à 10 liens candidats chacun, tous dans l'ordre croissant des pages, par le chemin noms↔contenu
— soit environ **106 documents de la vraie bibliothèque**, contre 1 seule famille pour le renvoi
imprimé. **Priorité inversée en conséquence** : voie par les noms construite en premier (et
rendue quasi gratuite en réordonnant `instantaneDeLot` pour réutiliser le texte déjà produit par
`lireLeTexte` au lieu de réocériser), la table/géométrie reste nécessaire mais passe en second.
Sur les Aebersold, aucun second signal indépendant n'existe aujourd'hui (pas de pastille, pas de
renvoi imprimé, pas de Vision) : la règle de corroboration garantit qu'**aucun lien ne sera
publié automatiquement**, seulement des candidats nommés avec preuve et page, prêts à être
vérifiés un par un — abstention honnête conforme au principe d'universalité du §0.

**Mesure complète du chemin « table par géométrie » sur les 17 familles, confirmant la
priorité** : une seule famille sur 16 porte une vraie table page→piste utilisable (Bass Aerobics,
43 enregistrements sur 52 workouts, en 2 panneaux, corrigé le 1/11 — voir ci-dessous). **Garde-fou
critique découvert à cette occasion** : le détecteur de table, seul, confond des discographies
(numéros de catalogue d'albums) et des numéros de case de tablature musicale avec de vraies tables
de correspondance — treize lignes « parfaitement nettes » identifiées sur une famille se sont
révélées être une liste d'albums de Spyro Gyra. `estUneTable` + « rangées utilisables » ne
suffit pas : il faut en plus que les valeurs soient **plausibles pour ce qu'on cherche** (un rang
de page dans ce document, une piste dans ce vivier) — connaissance qui appartient à l'appelant,
pas au détecteur, et qui doit se poser au point de câblage, pas dans `table.ts` lui-même.
**Conclusion confirmée** : la voie par les noms reste le vrai levier d'universalité (5 Aebersold
sur 6), la table sert une seule famille (Bass Aerobics) et doit être câblée avec cette garde de
plausibilité.

**Câblage terminé et commité le 1/11 soir** (`b6be47ad`, Codex) : `lireLeTexte` passe avant
l'oracle, son résultat réutilisé à l'étape 5 sans second OCR. Garde explicite posée : si le nombre
ou l'index des pages diverge du rendu, le texte est écarté, aucun lien ne peut être publié par
repli. Les propositions fondées sur les noms restent visibles, écoutables, marquées « à
vérifier » — zéro lien actif publié sur un seul signal, conforme à la règle de corroboration.

> **Règle stricte, révisée par §-1 septies.** Ce passage pose la corroboration à deux signaux comme absolue : c'est désormais la règle du **mode strict**, qui demeure et reste le défaut là où l'erreur n'est jamais acceptable. En **mode estimation**, une publication sur un signal unique est permise à condition d'être marquée « estimation non confirmée ». Rien n'est retiré ici.

**Mesure réelle sur les 6 Aebersold, dans l'application, pas en script** : 008→7 propositions,
012→5, 103→8, 109→7, 120→10, 021→aucune (abstention honnête, pas un échec), 026→aucun média dans
ce corpus de test. `pnpm check` : 2744 tests, exit 0. Première fois que la voie par les noms
tourne de bout en bout en production sur les Aebersold — 106 documents de la vraie bibliothèque
qui n'avaient auparavant aucun chemin.

**Prochaine étape posée** : vérification à deux (Claude Desktop + Codex) sur les cinq familles
Aebersold une fois le câblage de `voie-oracle.ts` terminé, avec deux conditions non négociables
tenues en tête : les liens candidats doivent rester **visibles pour vérification humaine**,
jamais publiés automatiquement sur un seul signal — sur ces documents, aucun second signal
indépendant n'existe aujourd'hui (zéro renvoi imprimé, pas de pastille, pas de Vision), donc

> **Règle stricte, révisée par §-1 septies.** Ce passage pose la corroboration à deux signaux comme absolue : c'est désormais la règle du **mode strict**, qui demeure et reste le défaut là où l'erreur n'est jamais acceptable. En **mode estimation**, une publication sur un signal unique est permise à condition d'être marquée « estimation non confirmée ». Rien n'est retiré ici.

l'abstention honnête avec ses candidats nommés est le résultat correct et attendu, pas un échec.

**Deux correctifs de `table.ts` faits le 1/11, avant le câblage** (commits `82cbba9c`,
`3067d5cd`) : le détecteur de cellules suspectes était asymétrique — repérait un chiffre lu trop
bas (un creux) mais pas trop haut (une bosse), laissant passer un « 82 » (faute de lecture pour
« 32 ») comme rangée digne de confiance sur la vraie table Bass Aerobics. Corrigé par un critère
symétrique non circulaire (les fautes sont les valeurs hors de la plus longue montée de la
colonne). Puis découverte que la table Bass Aerobics est imprimée en **deux panneaux côte à
côte**, fusionnés à tort par le détecteur en une seule table à 6 colonnes (chaque rangée mélangeant
deux enregistrements différents) — corrigé en exigeant deux lectures indépendantes qui s'accordent
avant de découper (la géométrie des écarts répétés, ET l'en-tête qui nomme littéralement les
panneaux), avec un témoin négatif vérifié (une géométrie périodique sans en-tête répété n'est
jamais découpée). Résultat : 14 → 43 enregistrements utilisables sur la vraie table.

**Piège technique trouvé et documenté, non corrigé (dette connue)** : lire la couche texte d'un
PDF entre l'ouverture d'un rendu et sa première page fait que cette page **ne rend jamais la
main** (pas une erreur, une promesse qui ne se résout jamais). Touche 9 familles sur 17 mesurées,
dont les 5 Aebersold restants (106 documents de la vraie bibliothèque). Deux correctifs tentés
(processus de travail dédié, ressources de décodage explicites) — mesurés, aucun des deux
n'a fonctionné, retirés proprement plutôt que gardés avec une fausse justification. Contournement
identifié : lire la couche texte **avant** d'ouvrir le rendu (ordre que la production suit déjà,
par accident de structure du code) — ne bloque donc pas l'objectif ce soir, mais aucune épreuve
ne peut le couvrir sans un PDF réel sous droits (un PDF fabriqué ne reproduit pas le défaut).
**Signalement non confirmé, à vérifier séparément** : la fonction de comptage de pages utilisée
par le garde-fou `jpegFatal` (censé protéger contre des PDF qui font planter le processus) rend 0
sur les 17 extraits de test — ce garde-fou pourrait être inopérant dans ce contexte, à vérifier
sur les documents originaux, pas les extraits.

**Audit en réel du 30/10 matin, sur le paquet embarqué exact** (captures d'écran, pas de
supposition depuis le code) : trois défauts trouvés et corrigés côté production (porte de la
chaîne qui refusait toute charge sans recette, bouton d'ouverture de bibliothèque hors-liste
ajouté et vérifié fonctionnel à l'écran, dépôt en ligne de commande qui ne retient pas la
bibliothèque). **Clarifié le 30/10 matin — incident opérationnel, pas un défaut du moteur** : la bibliothèque
d'essai a été vidée par des commandes de diagnostic lancées directement sur le dossier actif
pendant l'investigation (suppression de `base/actives.json` et des versions à 11:58, sans
sauvegarde préalable) — 717 fichiers sources intacts, couche de publication perdue. Six
frontières de sécurité manquaient simultanément, nommées : corpus d'entrée et bibliothèque
générée dans le même dossier, script de diagnostic opérant directement sur la bibliothèque
active, « repartir proprement » traduit en suppression sans photographie, aucun invariant
protégeant `actives.json` pendant un diagnostic. **Règle retenue** : corpus d'essai et
bibliothèque active doivent être deux dossiers distincts, jamais nettoyés en place.

**« 40 liens » clarifié** : le verrou fonctionnel tient — aucun lien n'est publié sans
corroboration suffisante, vérifié par test. Le vrai défaut est un **compteur d'affichage
trompeur** (compte des appariements internes non publiés comme s'ils étaient des liens actifs),
corrigé séparément du verrou lui-même.

**Nouveau défaut sérieux trouvé, même famille que les succès affichés sans preuve réelle
(troisième occurrence de ce type en 24h)** : l'exporteur de pages acceptait un résultat vide sans
déclarer d'échec — un traitement pouvait annoncer « 12/12 pages » sans avoir produit une seule
image. Cause réelle des pages blanches, distincte du signal 5 (SIGTERM) du dernier remontage, qui
est un second défaut postérieur et n'explique pas à lui seul les anciennes pages blanches.

Corrections apportées, non commitées au moment du rapport : `Depot::ouvrir` strictement en
lecture seule (ne crée plus rien), `Depot::creer` séparé pour la création explicite, mise à jour
du nom de bibliothèque dans la recherche même sans document. `pnpm check` : exit 0 complet cette
fois (le test OCR long, ~12min48s pour 7 chaînes complètes, n'était pas bloqué — juste
légitimement long ; à optimiser plus tard).

**Deux défauts graves trouvés en testant le parcours réel le 30/10 soir, tous deux corrigés** :
1. **Course sur l'inventaire des médias** (`a1a492bf`) : un document traité pendant le déballage
   du ZIP recevait un vivier de médias tronqué, publié et activé sans jamais être corrigé une
   fois l'inventaire complet disponible — défaut d'intégrité silencieux. Reste ouvert : ne
   couvre qu'un seul geste de dépôt, des médias ajoutés après coup retomberaient dans la même
   course.
2. **« Signal 5 » identifié** (`9d3b671e`) : pas un problème de droits d'exécution (hypothèse de
   la veille, fausse) — une vraie famine de mémoire au démarrage de V8, plusieurs moteurs de 2 Go
   lancés simultanément sans vérification de la mémoire disponible. Dix-sept documents sains
   étaient condamnés définitivement pour la faute d'un autre traitement. Corrigé : un moteur
   mort sans avoir rien dit passe en pause (reprenable) plutôt qu'en échec définitif. **Décision
   de Christophe** : limiter le nombre de traitements lourds simultanés selon la mémoire
   disponible, seuil à mesurer, pas encore fait.
3. **« N liens retenus »** (`0afd7c56`) : le compteur affiché et la ligne de détail comptaient
   deux choses différentes (appariements vide vs `abstention.combien`), affichant 0 et 40 au même
   instant pour le même document — et le texte stocké disait littéralement l'inverse de la
   vérité (« aucune lecture ne l'appuie » quand une lecture, insuffisamment corroborée,
   l'appuyait bien). Le correctif précédent de Codex avait verrouillé cette contre-vérité par un
   test dont les données de test rendaient le défaut invisible par construction.
4. **Barre de progression figée à 100 %** (`dec587c7`) : le moteur ne progresse que pendant la
   lecture des pages puis reste muet jusqu'à la fin — 88 % du temps de traitement sans aucun
   signal. Le correctif de Codex (barre « indéterminée ») était juste en principe mais créait à
   l'écran une barre entièrement pleine (aucune largeur CSS définie), pire que le défaut
   d'origine. Corrigé en un segment court et animé, cohérent avec la préférence « mouvement
   réduit » du reste de l'interface.
5. **Navigation « Catalogue » cassée** (`eb3b8b6f`) : une bibliothèque sans document ouvrable
   (comme l'ancienne bibliothèque vidée) retombait sur l'accueil malgré l'adresse `#catalogue`
   affichée. Premier correctif de Codex entièrement validé par reproduction. **Lacune connue,
   non corrigée** : en ligne, le même défaut persiste car le mécanisme de repli dépend d'une
   donnée de session qui n'existe que côté bureau — demande une décision de produit sur ce que
   le service en ligne doit exposer, pas une simple réparation.

**Points 5 et 6 vérifiés en application réelle le 30/10 soir, en environnement isolé** : zéro
« signal 5 » sur deux documents traités (l'application qui ne pouvait traiter aucun document le
matin même en traite désormais). Le point 6 n'était pas un bug — deux bibliothèques distinctes
partageaient simplement le même nom affiché par défaut (« Bibliothèque d'essai », hérité du
modèle), d'où la confusion de parcours observée plus tôt. Les MP3 non reliés sur un document sans
pastille visuelle (J.S. Bach) s'abstiennent honnêtement, comme attendu — c'est le second défaut
déjà connu (voie par noms distinctifs manquante), pas un bug nouveau.

**Nouvelle découverte, distincte du défaut 3 déjà corrigé** : la phase « muette » de traitement
peut tester jusqu'à 48 zones candidates de marque, **chacune coûtant une passe OCR complète sur
tout le document** — une boucle non bornée. Le défaut 3 a corrigé l'affichage trompeur (la
barre), pas ce coût réel caché : sur un document de 96 pages avec un nombre de zones similaire,
le traitement pourrait dépasser largement les 18 minutes déjà observées. **Correction du 30/10
nuit, après mesure propre sans interruption** : il n'y a pas de boucle infinie — l'exploration
est naturellement bornée par le contenu (la production de zones s'arrête d'elle-même), les 20
documents mesurés ont tous conclu, le pire cas à ~950s (16 min) pour une abstention. Le rapport
initial (« 54 zones, 23 minutes, toujours en cours ») était un artefact des propres
interruptions de l'observateur, pas un vrai défaut du moteur — corrigé par l'auteur lui-même
avant d'être pris comme base de décision définitive. **Un seuil de renoncement (256 paires,
1,4× le maximum observé) est conservé quand même, comme filet contre l'inconnu plutôt que
correctif d'un défaut observé** — peu coûteux, protège contre ce qui n'a pas encore été mesuré
sur les 250 documents à venir. **Décision prise par Christophe le 30/10 soir** : pas de plafond
arbitraire nécessaire sur le nombre de zones explorées au-delà de ce filet de sécurité. Pour les
bibliothèques d'essai/tests, l'extracteur de pages (en ligne) borne déjà le coût en limitant
l'échantillon (10-15 pages). Pour les vraies bibliothèques (sans restriction d'échantillon), le
coût est accepté **à condition stricte que ce soit une dépense unique par méthode** — le moteur
ne doit jamais refaire cette exploration une fois la bonne zone apprise pour un document donné.
**À vérifier** : que cette garantie de mémorisation est bien effective aujourd'hui pour
l'exploration de zones (pas seulement pour les appels Vision déjà couverts en sous-étape 6) ;
si elle ne l'est pas, c'est la vraie priorité de correction, pas un plafond du nombre de zones.

Paquet macOS reconstruit, resigné, redéposé et vérifié deux fois (le premier dépôt portait
encore le moteur d'avant le verrou — trouvé et corrigé avant que Christophe ne teste dessus).
Sept commits sur `wip/lienotheque-2026-10-29`, rien sur `main`, rien poussé. `pnpm check` :
2675 épreuves, exit 0.

## -1. Virage décidé le 29/10 soir — le moteur oracle devient le socle, avant tout le reste

Décision de Christophe, qui prime sur l'organisation en lots ci-dessous tant qu'elle n'a pas été
exécutée : **repartir de zéro sur un moteur universel de liaison fichier-document / fichier-média
(« moteur oracle »)**, qui remplace les recettes actuelles plutôt que de les compléter famille par
famille. Portée explicitement élargie au-delà de PDF+MP3 : tout document (PDF, docs, txt, jpeg…)
associé à tout média (MP3 ou autre), pour que Liénothèque puisse un jour héberger d'autres types
de contenus sans redéfinir ses fondations.

**« Universel » garde le sens fixé plus tôt dans la journée** : adaptatif à toute situation
*rencontrée*, jamais une promesse de couvrir d'avance toute situation possible — un document sans
oracle reconnu s'abstient, il n'est jamais deviné.

**Séquence** : ce chantier passe avant les lots 2 à 9. Une fois conçu et construit à un premier
niveau fonctionnel, Paul Westwood, Funk Fusion et Aebersold servent de bancs de calibration à
petite échelle (quelques pages d'abord) pour viabiliser le moteur et en chercher les failles —
ce ne sont plus des recettes écrites à la main, ce sont les premiers vrais tests du socle.

**F3** : ses 95 liens restent acquis comme vérification humaine déjà faite — non à refaire à
l'oreille — mais le nouveau moteur doit être capable de les retrouver par lui-même pour être
calibré, sans s'appuyer sur l'ancienne recette `f3-70s-funk`.

**Conséquence sur ce document** : les lots 1 ter, 2 à 7 ci-dessous sont suspendus en l'état ;
ils seront repris comme bancs de test du moteur oracle une fois celui-ci conçu, pas exécutés tels
qu'écrits aujourd'hui. Le lot 1 bis (A, B, C) reste acquis : ses correctifs de lecture (confiance,
conduites de points, page en double) sont des briques utiles au nouveau moteur, pas à jeter — B
en particulier est déjà le premier détecteur du socle (détection des tables via les conduites de
points).

**Précision du 29/10 tard le soir, sur la nature de la « bibliothèque d'essai »** : ce n'est pas
une démo ni un prototype jetable. C'est la vraie approche (socle du moteur oracle, construit
aujourd'hui) testée à petite échelle (échantillons de pages, pour ne pas perdre de temps dans la
conversion complète de chaque méthode) — si elle fonctionne, c'est la version qui avance vers la
bibliothèque finale ; si elle révèle des défauts, on corrige et on itère vers cette même version
finale. L'application Liénothèque elle-même est considérée complète et finalisée ; c'est la
couche de contenu/bibliothèque qui est en phase de test réel, pas de démonstration. Toute
présentation de résultat doit donc dire honnêtement ce qui marche vraiment et ce qui reste à
corriger — jamais « voici un aperçu », toujours « voici l'état réel ».

**Correction du 30/10, trouvée par mesure directe des appelants en production — important** :
l'affirmation précédente de ce document (« le détecteur de table, les détecteurs de noms/dossiers
sont câblés en production réelle ») était **fausse**. Seul le coordinateur
(`coordonnerLectureDifficile`) est réellement appelé en production. `lireLaTable`,
`cellulesSuspectes`, `observationsDeLaTable`, `construireOracle`, `eprouverSurTemoins`,
`choisirEchantillonEtTemoins`, `observationsDesNoms`, `structureDesNoms`,
`structureDeLArborescence` existent et sont testés, mais n'ont **aucun appelant hors de leurs
propres épreuves**. À brancher avant de les considérer acquis.

**Conception validée le 29/10 soir.** Architecture en trois couches : détecteurs génériques qui
observent sans conclure (noms/dossiers, structure de page, confrontation de signaux) ; l'oracle,
qui remplace la recette, porte ses preuves, son échantillon, ses témoins et s'invalide par
empreinte si le document change ; le coordinateur (`coordonnerLectureDifficile`, déjà écrit et
déjà testé, câblé pour la première fois le 29/10 soir — sous-étape 5) qui impose l'ordre
sûr jusqu'à publication ou abstention motivée. Vocabulaire généralisé : page→repère,
piste→pièce, folio→adresse portée par le contenu.

**Estimation chiffrée** : conception des contrats 3,5 j ; construction des détecteurs et câblage
6,5 j ; calibration sur F3 sans l'ancienne recette 2 j → **socle complet 12 j**. Puis les bancs
(Westwood 0,5 j, Funk Fusion 0,5 j, Bass Aerobics 0,5 j, Aebersold 1,5 j) + 2 j de provision →
**total 17 jours**, soit 3-4 semaines. Remplace les lots 1 ter + 3-7 (8-11 j) : surcoût net 6-9 j.

**Garde-fou non négociable, posé par Codex et accepté par Christophe** : le socle doit retrouver
les 95 liens de F3 exactement (95/95, aucun autre résultat accepté) avant toute extension à
d'autres familles. Chaque banc de test doit rendre soit des liens, soit une abstention motivée —
jamais « le moteur n'est pas encore prêt ».

**Risques assumés, pas cachés** : le détecteur de table (B3) est la pièce la plus neuve et la
plus fragile, son estimation peut doubler ; Aebersold restera probablement en abstention malgré
le virage (106 documents, appariement par intitulé, mécanisme encore inexistant) ; un oracle
appris est plus dangereux qu'une recette écrite si l'épreuve sur témoins n'est pas strictement
respectée ; pendant 3-4 semaines, les défauts déjà identifiés et jugés inoffensifs (115 causes
périmées, 454 passages indexés, le numéro en double) restent en l'état — décision assumée par
Christophe le 29/10 soir, ces défauts ne produisant aucun faux lien.

## 0 bis. Principe de corroboration, posé le 29/10 soir

Un moteur de liaison PDF/MP3 « intelligent et adaptatif » (demande explicite de Christophe,
utilisant Claude Vision si nécessaire) ne se fie jamais à un seul signal. Chaque famille porte en
général plusieurs sources indépendantes d'information — noms de fichiers structurés, tables
imprimées explicites, pastilles visuelles détectées par Vision, structure de dossiers — et un
lien ne doit être publié que lorsqu'au moins deux signaux indépendants s'accordent. Cas vérifié
le jour même : sur Bass Aerobics, le nom de fichier MP3 (« Workout N ») et la table imprimée du
livre donnent, séparément, la même information — exactement le type de corroboration attendu.
Ce principe généralise ce qui existait déjà au cas par cas (oracle Funk Fusion/Paul Westwood) en
règle du moteur lui-même, portée par le lot 1 ter.

## 0 ter. Principe de preuve contre régularité, posé le 29/10 soir sur le cas F3

Un document réel n'est jamais parfait : pages manquantes, numérotations irrégulières (un
catalogue externe réutilisé sans renumérotation), sauts volontaires de l'auteur. Un moteur
« adaptatif, intelligent et rigoureux » ne doit jamais supposer la régularité d'un document —
il doit savoir distinguer, sans règle écrite à la main par famille, deux situations qu'une règle
générique de pas/suite confondrait sinon :

- **Une vraie rupture** (page ou pièce réellement manquante) : une suite rompue est alors un
  signal d'alerte légitime, à respecter.
- **Une irrégularité propre au document** (numérotation non continue par construction) : une
  suite rompue y est normale, et la forcer à être continue écrase une lecture correcte.

**La règle générique, valable pour toute famille présente et future** : une lecture confirmée
plusieurs fois, par des méthodes indépendantes et concordantes, doit l'emporter sur une pénalité
de rupture de suite — quelle que soit l'ampleur du saut. Ce n'est pas « autoriser les sauts sur
tel document », c'est « faire confiance à une preuve répétée plutôt qu'à une attente de
régularité qui n'a jamais été garantie ». Réciproquement, en l'absence de toute lecture
confirmée corroborant la rupture, la suspicion de manque doit continuer à s'appliquer — le
principe ne doit jamais devenir un passe-droit général pour ignorer les ruptures.

Cas qui a motivé ce principe, vérifié directement sur les pixels (pas sur un JSON produit par
l'ancienne chaîne) : F3 ('70s Funk & Disco Bass) numérote ses motifs « Pattern 92 » puis
« Pattern 99 » sur deux pages strictement consécutives du PDF (les feuillets du fichier se
suivent sans trou). **Correction apportée après vérification plus fine** : le folio imprimé en
bas de page, lui, saute aussi par endroits (ex. 29 puis 32) — et il est impossible de trancher
avec certitude si cela vient de feuillets absents du scan d'origine ou d'une numérotation du
livre lui-même non continue. **C'est précisément pourquoi la reformulation générique ci-dessus
est la bonne** : la règle n'a pas besoin de résoudre cette ambiguïté. Elle doit céder devant une
double lecture concordante (« 99 » lu deux fois, par deux étages de lecture différents), sans
pour autant cesser de signaler un vrai manque ailleurs, quelle que soit la cause réelle du saut.

## 0. Principe directeur, valable pour tout le document

Un score, une association, un statut « prêt » n'est vrai que si :
1. Il est vérifié dans la **vraie base** utilisée par l'application, jamais seulement dans un
   rapport de test séparé.
2. Son vivier de données source est **borné** à ce qui appartient réellement au document.
3. Une « page lue » est une page **réellement lue**, jamais une page déduite ou supposée.
4. Zéro faux lien automatique, sans exception, sans compromis de délai.

> **Contredit par la décision §-1 septies du 3/11, et gardé.** Le point 4 reste la règle du
> **mode strict**, qui demeure disponible et reste le défaut là où l'erreur n'est jamais
> acceptable. En **mode estimation**, il est remplacé par : *aucun faux lien non signalé comme
> tel*. Les points 1, 2 et 3 ne sont pas touchés.


**Règle de méthode ajoutée le 3 novembre 2026.** Après un compactage de contexte, toute
affirmation sur ce qui s'est passé s'appuie sur la transcription de la session ou sur Git, jamais
sur ce qu'on voit. Le cas qui l'a motivée : « je n'ai créé aucun de ces fichiers » a été énoncé
comme un fait sur le passé alors qu'il ne décrivait que le contexte encore présent — la
transcription a montré l'inverse en quelques minutes.

Tout le reste du document applique ce principe sans l'y répéter à chaque ligne.

---

## 1. Audit demandé — périmètre

Deux objets distincts, à auditer séparément et en profondeur :

**A. L'application de bureau** (Tauri/React/TypeScript/Rust,
`C-Concept-Dev-main-fusion-wt/tools/lienotheque`) — bibliothèque musicale et moteur
d'ingestion/diagnostic.

**B. La version en ligne** (`lienotheque-api.11drumboy11.workers.dev`, Worker Cloudflare) —
« Base de connaissance », son pont de lecture, son build, ses routes.

Pour chaque objet : lister les failles trouvées, les classer par gravité, et proposer des lots de
correction chiffrés en effort — pas une liste vague, un vrai plan actionnable.

---

## 2. Failles déjà connues, confirmées par audit direct aujourd'hui

### A. Application de bureau — bibliothèque musicale

| Faille | Gravité | Preuve | État |
|---|---|---|---|
| Vivier de médias non borné à l'archive du document avant publication d'un score | **Critique** | 52 faux liens réels posés sur Bass Aerobics (audio de F3), jamais détectés avant aujourd'hui | **Précisé le 29/10 après-midi** : le filtre d'entrée (`roulement.rs:483-494`) est en réalité déjà strict et sans repli — provenances vides ⇒ vivier vide, jamais global. Le vrai trou est côté **publication** : rien ne refuse encore d'afficher un score "prêt"/"automatique" tant que le vivier n'est pas prouvé borné au moment du calcul. Garde-fou de publication à construire (lot 1, redéfini) |
| « Page lue » confondue avec « page déduite » dans l'oracle de mesure | Critique | Bass Aerobics : 0/115 folios réellement lus, score pourtant publié comme 52/52 | Garde-fou partiel posé (`fondDesPages`), généralisation à vérifier |
| Application utilisée pour la reconstruction antérieure au correctif de provenance | Critique | Binaire du 26 octobre, correctif du 29 — 3 jours d'écart | À rebâtir avant toute reconstruction (lot 0) |
| Paquet macOS signé ad hoc, non notarié | Majeure | Confirmé par inspection du bundle | Ouvrable seulement sur cette machine ; décision compte développeur Apple en attente |
| 246 documents actifs (surtout Aebersold) avec vivier encore global | Majeure, non réalisée | 0 lien posé sur ces documents — risque latent, pas de faux lien produit | Remise à niveau à chiffrer séparément, hors familles audio actives. **Attendu, pas encore vérifié** : rejoués avec l'app reconstruite (filtre sans repli), ils devraient tomber à vivier **vide**, pas global — à confirmer sur un vrai exemple avant de le tenir pour acquis |
| Orientation : 175 pages mal orientées sur 11 035, dont 143 à elles seules sur Paul Westwood | Majeure | Audit exhaustif du 28 octobre | Bouton de rotation manuelle livré ; correctif automatique encore expérimental |
| Choix de bibliothèque au démarrage pouvant désigner la mauvaise bibliothèque | Corrigée | Trouvée et corrigée le 29 octobre | Commit `3e5a3a3e`, à revérifier après reconstruction de l'app |
| Parcours d'accueil ZIP bloqué après sélection | Corrigée | Trouvée et corrigée le 29 octobre | Même commit, à revérifier |
| `Les modes.txt` : format TXT non pris en charge | Mineure | Un seul document concerné | Support à ajouter ou laisser en limite connue |

### B. Version en ligne

| Faille | Gravité | Preuve | État |
|---|---|---|---|
| Écran bureau affiché à tort en ligne (variable de build manquante) | Corrigée | Diagnostic complet du 28 octobre, validé par Christophe lui-même | Déployée, confirmée |
| 404 résiduel sur `/donnees/bibliotheque.json` | Mineure, non bloquante | Confirmée présente après correctif | Jamais nettoyée, dette connue |
| Absence d'en-têtes de sécurité sur la page servie, qui porte pourtant le témoin de session et mène les cérémonies d'authentification | **Majeure** | Audit du 29/10 soir | **Fait et vérifié en production** (version `7ba63a44`, 21:09) : six en-têtes servis, politique réellement appliquée (témoin inverse testé), `/theme.js` exécuté |
| L9 — `/fichier/:laissez` et `/amorce` rendaient la raison du refus, contre leur propre règle | Mineure | Audit du 29/10 soir | **Fait et vérifié** : refus muets en production |
| L10 — aucune voie de retour si l'unique clé est perdue | Majeure | Audit du 29/10 soir | **Fait** : enrôlement d'une seconde clé rendu atteignable (bug de câblage trouvé et corrigé le soir même, `identifie` jamais transmis à l'écran), clé enrôlée par Christophe |
| L8 — commentaire de sécurité périmé dans `enrolement.ts` | Mineure | Audit du 29/10 soir | Fait |
| `laFacadePeutServir` devenue inerte depuis `SESSIONS_EXIGEES = true` | Mineure, à rouvrir avant le lot 10 | Audit du 29/10 soir | En attente, comme prévu |
| L7 — `lisible DEFAULT 1` sur prémisse fausse | Majeure | Audit du 29/10 soir | En attente du partage de `passage.ts` par le fil oracle |
| Plafond de cadence sur l'écriture non authentifiée (L6) | — | Audit du 29/10 soir | En attente, demande une liaison et l'accord de Christophe sur la configuration |
| Lot 9 (purge) | — | — | En attente |
| Écran « Réglages → mes clés d'accès » (liste, révocation) | Mineure, dette d'interface | Trouvé en construisant L10 | En attente — `revoquerLaCle` existe déjà côté service, aucun écran |
| Deux dettes mineures trouvées en clôturant L10 | Mineure | 29/10 soir | Ligne « MacBook Pro » morte en base (inoffensive, à révoquer avec l'écran futur) ; le bouton d'enrôlement propose la passkey par défaut sans exiger explicitement une clé matérielle |
| Surface en ligne auditée complètement le 1/11 — deux nouveaux défauts majeurs | — | Audit lecture seule, confirmé en production au 1/11 | Voir détail ci-dessous |
| Migration des jetons d'application non appliquée en production | **Majeure** | Code déployé, tables `jeton_application`/`jeton_application_action` absentes en base distante — toute route les atteignant échouerait | Lot A, 0,5 j |
| Enrôlement non atomique (clé écrite et défi consommé en deux écritures séparées) | **Majeure, intégrité** | Pas immédiatement exploitable sans défi valide, mais une clé pourrait être conservée malgré un refus affiché | Lot B, 1-1,5 j |
| L7 confirmé matériellement en production | Majeure, déjà connue en principe | **22 025 passages, tous `lisible=1`, tous `confiance=NULL`** — mesuré, pas supposé | Lot F, 1-2 j (requalification des données existantes) |
| Purge, plafond de cadence L6, garde de façade `laFacadePeutServir` | — | États inchangés depuis le 29/10, mesurés : 24 défis (24 périmés), 10 sessions, croissance faible mais non bornée par conception | Lots C, D, E |
| CI Liénothèque (`lienotheque-ci.yml`) rouge sur `main` depuis le 26/10, 12 passages d'affilée en échec | Mineure, non bloquante | Diagnostiquée le 29/10 soir : job Vérification échoue sur CLA-01 (mot « exercice » dans un commentaire de `interprete.ts`, introduit le 28/10 par un autre chantier) — déjà corrigé dans le travail en cours du moteur oracle, se résoudra à son prochain commit sans intervention | Aucune action requise, se résout seul |
| Job « Rendu » (Playwright, Chromium/Firefox/WebKit) | Mineure | N'a jamais abouti depuis sa création, vérifié sur 4 passages du 26 au 29/10 — pas une régression | En dette, à traiter un autre jour |

---

## 2 bis. Ménage du dépôt et clarifications disque, 29 octobre après-midi

**Ménage Git** : 85 branches locales → 28 (57 supprimées, chacune prouvée intégralement fusionnée
dans `main` via `git branch -d`, jamais `-D` — git refuse lui-même toute suppression portant un
commit non fusionné). 10 copies de travail → 4, gardées :
`C-Concept-Dev` (autre chantier EvidenceForge), `C-Concept-Dev-main-fusion-wt` (celle-ci),
`C-Concept-Dev-lienotheque-e`, `C-Concept-Dev-schema-wt` (12 fichiers non enregistrés et 10
commits d'un autre projet — jamais touchée).

**Clarification de chemin importante** : `/Volumes/Macbook Pro/Lienotheque` n'est **pas** la
bibliothèque musicale — c'est la bibliothèque clinique (247 documents, FTCP, ICV, schémas,
praticum), un domaine complètement différent. Ne jamais confondre les deux dans les futures
instructions.

**Intégrité de la bibliothèque musicale, vérifiée et non supposée** : 250 documents actifs, 1 868
médias, tous avec leur fichier source, toutes les versions actives présentes, 2 118 fichiers
rehachés, **0 empreinte fausse**.

**Disque** : les copies apparemment dupliquées (13 Go chacune selon `du`) étaient en réalité des
clones APFS en copie-sur-écriture, partageant les mêmes blocs — la dilution en place disque
était largement illusoire. 1 Go réellement récupéré, pas 14, en supprimant les copies prouvées
redondantes à l'octet près. Le volume à 96 % n'est pas causé par Liénothèque (48 Go au total) :
l'émulateur Switch (409 Go) et SteamLibrary (374 Go) en sont responsables — hors périmètre de ce
chantier.

---

## 2 ter. Diagnostic complet du 29/10 soir — sans correction, sur la vraie bibliothèque

Relu intégralement : 250 documents, 10 499 passages, 1 868 enregistrements, 2 120 fichiers.
Aucune modification faite pendant ce diagnostic.

**Critique, découverte la plus urgente** : **l'application installée (`/Applications` et le
volume) date du 28/10 17:28:36 et ne porte AUCUN des quatre correctifs du jour** (vivier borné,
lots A, B, C) — le paquet reconstruit le 29/10 à 14:45:41 n'a jamais été installé. Conséquence :
tout ce qui a été testé dans l'application réelle aujourd'hui l'a été sur la version d'hier.
**À corriger en premier, avant toute autre chose.**

Autres constats critiques, chiffres exacts (certains déjà connus en substance, précisés ici) :
- 246 documents sur 250 publient encore le vivier global (pas « quelques-uns »).
- 248 documents sur 250 n'ont strictement aucun lien audio (seuls F3 et Bass Aerobics en ont).

**Majeur, deux vraies nouveautés d'ampleur** :
- **115 travaux terminés sur 253** portent encore une cause périmée (« pas de manière de lire »)
  avec `reprise_possible: true` — le même défaut trouvé une fois sur F3 ce matin existe en
  réalité 115 fois.
- **454 passages de charabia restent indexés et cherchables** en plein texte, malgré un
  marquage honnête à l'écran — la recherche les ramène quand même.
- Orientation vérifiée sur seulement 2 documents sur 250 — ampleur réelle ailleurs inconnue.
- 86 % des documents (211/244) n'ont aucun folio réellement lu, seulement déduit.
- Garde-fou de confiance du lot A : actif sur **0 document** de la base actuelle (ne s'applique
  qu'au retraitement, chiffre maintenant confirmé nul, pas partiel).

**Mineur** : 1 numéro de page en double (connu, lot C) ; un document fantôme (`.txt` non actif
mais classé, 251 classements pour 250 documents) ; un `.DS_Store` orphelin dans `sources/` ;
91 Mo gaspillés par la recopie du même vivier global dans 246 fichiers de version.

**Confirmé sain** : intégrité du dépôt parfaite (2118/2118 fichiers) ; le classement « état
audio » ne ment jamais (0 contradiction sur 251) ; l'abstention de Funk Fusion reste la seule
cause enregistrée qui dit encore la vérité ; aucune accumulation de versions dormantes.

**Hors de portée de ce diagnostic, à faire ailleurs** : le parcours de dépôt dans l'interface
(nécessite de cliquer dans l'app, pas testable en lecture seule) ; la version en ligne au-delà
des sources déjà lues (nécessite l'adresse déployée, confiée à l'autre fil d'audit) ; la justesse
à l'oreille des 95 liens F3 et 52 liens Bass Aerobics (seule une vérification humaine peut en
juger).

> **⚠ ANNOTATION DU v24 (4 novembre 2026)** — la formule « vérifiés à l'oreille » est **inexacte** : la transcription du 29/10 (12:10 et 12:13) montre que l'agent a demandé d'écouter **trois ou quatre pistes**, et que la validation a été enregistrée **au niveau du document** (`classements.json`, `origine: manuel`). La vérité des 95 liens vient du fichier de référence du 2 octobre (`statut: "auto"`), vérifié **par sondage**. Voir § 2 du v24. **Le passage est conservé tel quel ; seule sa lecture change.**

---

## 3. Garde-fous génériques — inventaire honnête

**Déjà posés et actifs sur toute nouvelle famille sans intervention supplémentaire :**
- Empreinte SHA-256 comme identité de document (ID-01).
- Le sidecar n'écrit rien sans validation (JOB-06).
- « Pages déduites ⇒ non prouvé » (3 épreuves OUT-15, posé le 29 octobre).
- Comparateur jugeant la page ET le numéro, pas seulement le numéro.

**Déjà sain, confirmé le 29/10 après-midi (pas un garde-fou manquant) :**
- Le filtre de dépôt lui-même : sans repli, provenances vides ⇒ vivier vide, jamais global.
  Un document sans provenance connue tombe en abstention à l'entrée, pas en invention.

**Manquant, le plus coûteux, à construire en priorité absolue (lot 1, redéfini) :**
- Garde-fou **côté publication**, pas côté dépôt : interdire l'affichage d'un score comme
  « prêt » ou « automatique » tant que le vivier du document n'est pas prouvé borné à ses
  propres provenances au moment du calcul. C'est ce garde-fou, pas celui du dépôt, qui aurait
  empêché les 52 faux liens Bass Aerobics d'être présentés comme fiables.

**Encore spécifiques à un cas, pas génériques :**
- Correction d'orientation (traitée au cas par cas sur Paul Westwood, jamais généralisée à
  l'ensemble de la bibliothèque).

---

## 4. Lots de travail, dans l'ordre

| Lot | Contenu | Effort estimé |
|---|---|---:|
| **0** | Rebâtir l'application avec le correctif de provenance confirmé actif ; prouver sur un dépôt réel | **Fait** — paquet 165,74 Mio, hôte Rust et chaîne reconstruits avec le correctif, exit 0. Épreuve de preuve (F3 + Bass Aerobics, une seule bibliothèque neuve) en cours, verdict attendu |
| **1** | Garde-fou de **publication** (redéfini) : interdire l'affichage d'un score « prêt »/« automatique » tant que le vivier n'est pas prouvé borné au moment du calcul — le dépôt lui-même est déjà sain | **Code écrit et vert** (2 465 épreuves, exit 0 ; 139 épreuves Rust). Reste à rebâtir l'app avec ce code et le prouver sur un dépôt réel |
| **1 bis — fait, 29/10** | Fiabilité de la lecture de texte, trois correctifs mécaniques génériques trouvés en creusant un cas Bass Aerobics : **A** rendre honnête le verdict de lisibilité déjà câblé mais rendu muet (confiance Tesseract déjà calculée, jamais consommée) ; **B** garde-fou des conduites de points typographiques (`. . . . .`) qui font dérailler l'OCR sur des pages pourtant nettes ; **C** une incertitude de repère connue ne doit plus jamais être effacée par le décret de la recette avant affichage. **Chiffre corrigé par l'audit du 29/10 soir : l'exposition au défaut des points de conduite touche 602 pages sur 203 des 250 documents (81 %, plancher pas plafond)** — pas 454 comme estimé d'abord (454 est le compte des passages illisibles, mesure différente). Vérifié aussi : aucun des 10 499 passages ne porte encore de confiance — le lot A ne protège que ce qui sera relu | Fait, 2 465 épreuves + 165 nouvelles, exit 0. Non commité sur `main` (920 insertions en attente) |
| **1 ter — redéfini par l'audit du 29/10 soir, n'est plus une refonte** | Diagnostic de structure de texte généralisé. **L'audit a trouvé que les deux pièces existent déjà séparément** (diagnostic structurel, et le coordinateur qui impose l'ordre sûr) **mais ne sont jamais reliées** — `coordonnerLectureDifficile` (nom correct — « coordinateur » était une coquille du premier audit, corrigée le 29/10 soir) était déjà testée (8 appels dans ses propres épreuves) mais jamais appelée depuis du code de production. Le travail réel est de les câbler, pas de construire une refonte. Recommandé par l'audit **avant** les lots 3-7 : la plupart des 454 passages illisibles sont de la musique notée, qu'aucun correctif OCR ne rendra lisible — seul un diagnostic peut savoir qu'il faut s'abstenir plutôt que d'essayer, et le faire une fois évite de refaire la même détection de structure à la main dans chacun des lots 3-7 | **2-3 jours en trois petits pas**, révisé à la baisse (était 3-4 j de refonte supposée) |
| **2** | **Voie alternative trouvée par l'audit du 29/10 soir, moins chère que la purge/redépôt** : seuls 2 groupes de provenance existent dans toute la base (les 99 de F3, les 52 de Bass Aerobics) ; les 1 717 autres médias portent tous un préfixe de dossier dans leur nom (111 dossiers), qui reproduit exactement le groupe ZIP sur les 2 cas vérifiables, sans fuite. **Cette voie couvre aussi les 136 documents sans archive**, que la purge/redépôt ne pourra jamais toucher. Réserve à prouver avant de généraliser : le rattachement préfixe→bon document, pas seulement l'existence du préfixe | À chiffrer une fois la preuve de rattachement faite ; probablement moins cher que les 1 j initialement prévus pour la seule voie purge/redépôt |
| **3** | Paul Westwood 1-2 : diagnostic, calibration, oracle vérifié depuis les noms de pistes (165/165 identifiants fiables), preuve, playbook | 1 j |
| **4** | Paul Westwood 2-5 | 0,5 j |
| **5** | Bass Aerobics : son propre oracle vient d'être trouvé — la page « CD Track Listing » imprime explicitement les 52 triplets Workout/Piste/Page ; rendue lisible par le lot 1 bis-B. Construire la recette directement depuis cette table, sans rien inventer | 1 j (révisé à la baisse grâce à l'oracle trouvé) |
| **6** | Funk Fusion : identifiant composite chapitre.exercice | 1 j |
| **7** | Aebersold : appariement par intitulé d'œuvre (mécanisme neuf), 106 documents | 3 – 5 j |
| **8** | Bilan garde-fous génériques/spécifiques, playbook consolidé (`docs/methode-diagnostic-page-piste.md`) | 0,5 j |
| **9** | Audit approfondi du code de la version en ligne (Worker, pont de lecture, routes) — failles, lots de correction chiffrés | à chiffrer après audit |
| **10 — redéfini le 29/10 soir, exigence non négociable** | **Précision du 29/10 tard le soir** : l'exigence d'autonomie (tous les fichiers nécessaires
ensemble, portable sur n'importe quel ordinateur) s'applique déjà aux bibliothèques d'essai
construites pendant le développement, pas seulement à la bibliothèque finale — c'est une bonne
pratique à prendre tout de suite. En revanche, le doublage macOS + Windows reste réservé à la
VRAIE bibliothèque musicale, au moment du lot 10 : les bibliothèques d'essai n'ont besoin que de
l'application macOS pour l'instant.

> **ANNOTATION DU 5 NOVEMBRE 2026 — HORS PÉRIMÈTRE POUR L'INSTANT, SUSPENDU ET NON ABANDONNÉ.** Windows sort du périmètre de la Liénothèque (décision de Christophe, qui remplace celle du 28 octobre « macOS puis Windows » et celle du 17 octobre qui en faisait un contrôle informatif). Le texte ci-dessus est conservé tel qu'il était : il n'est pas supprimé, il n'est plus à faire. `windows-latest` a quitté les deux matrices d'intégration continue le 5 novembre (`84cc6396`). Le code et les tests propres à Windows subsistent et sont listés au registre, sans être retirés — précisément parce que la question se reposera.
**Reconstruction finale propre de la bibliothèque musicale**, une fois les lots 0-9 clos : repartir sur une base saine, sans dette ni rafistolage hérité des diagnostics du jour. Dans le même geste, implémenter en dur, comme principe d'architecture et non comme option : **toute création de bibliothèque locale doit embarquer dès sa construction tout ce qu'il faut pour être autonome et portable** — données complètes et exécutables macOS et Windows — utilisable sur n'importe quel ordinateur disposant de l'application, copiable sur clé USB ou disque externe sans perte de fonctionnalité. Ce n'est plus une fonctionnalité ajoutée après coup (ancien chantier 3), c'est une exigence de conception dès la reconstruction | à chiffrer une fois les lots 0-9 clos ; composante Windows **SUSPENDUE depuis le 5 novembre 2026, non abandonnée** (annotation, voir registre) |

**Séquence impérative** : les lots 0 à 9 règlent les problèmes existants. Le lot 10 ne commence
qu'une fois ces problèmes résolus — c'est une reconstruction propre, pas une étape de plus ajoutée
sur un système encore bancal. Total lots 0-9 sans Aebersold ni audit en ligne : environ 8 jours.
Avec Aebersold : 12-14 jours. Le lot 9 (audit en ligne) s'ajoute en parallèle, sans bloquer les
lots 0-8 qui concernent une surface différente (bureau).

---

## 5. Critère de clôture global

Le système est considéré fonctionnel, sans régression ni faille connue non documentée, quand :
- Chaque famille est soit prouvée (vivier borné, pages réellement lues, texte lisible
  honnêtement jugé, oracle vérifié), soit en abstention honnête avec sa cause écrite. **Révisé
  par la décision §-1 septies** : « zéro faux lien » reste le critère du **mode strict**. En mode
  estimation, le critère devient **zéro faux lien non signalé comme tel** — tout lien publié sur
  un signal unique porte sa marque d'estimation, et l'écran d'association manuelle existe.
- **Second critère du mode estimation, nécessaire parce que le premier ne suffit pas.** « Aucun
  faux lien non signalé » serait satisfait par une bibliothèque dont la moitié des estimations
  sont fausses, pourvu qu'elles soient toutes marquées. Marquer n'est pas être utile. Il faut
  donc aussi un **taux d'erreur des estimations**, mesuré de deux façons indépendantes et jamais
  confondues :
  1. **contre le mode strict**, sur les corpus déjà qualifiés : parmi les liens que le mode
     strict publie, quelle part l'estimation retrouve, et surtout quelle part elle contredit ;
  2. **contre les validations humaines**, au fil des corrections faites dans l'écran
     d'association : parmi les estimations soumises à un œil, quelle part est corrigée.

  Les deux se mesurent par famille, pas globalement : une moyenne acceptable peut cacher une
  famille entièrement fausse.

  **Seuil : _____________ — À FIXER PAR CHRISTOPHE.** Il est laissé vide délibérément. Tant
  qu'il n'est pas posé, ce critère est écrit mais **non vérifiable**, et le dire vaut mieux que
  de choisir un nombre à sa place.
- Le garde-fou du vivier borné protège automatiquement toute famille future, sans intervention.
- Le verdict de lisibilité du texte est honnête (lot 1 bis) : plus aucune page affichée comme
  fiable alors qu'elle est illisible ou que son repère était incertain.
- F3 reste intact, vérifié par comparaison d'empreinte avant/après toute la reconstruction.
- L'audit en ligne a produit sa propre liste de failles et lots, même si leur correction est
  reportée à plus tard par décision explicite de Christophe.
- Playbook à jour, consultable, qui permettrait à quiconque de traiter une 5e famille inconnue
  sans redécouvrir les pièges déjà rencontrés.
- **La reconstruction finale (lot 10) a eu lieu sur une base saine**, sans aucune dette reportée
  depuis les diagnostics du jour, et **toute bibliothèque locale créée depuis ce lot embarque par
  construction** ses données complètes et les exécutables macOS/Windows nécessaires pour être
  ouverte, utilisée et comprise sur n'importe quel ordinateur disposant de l'application, y
  compris depuis une clé USB ou un disque externe — sans étape de configuration supplémentaire.

> **ANNOTATION DU 5 NOVEMBRE 2026 — HORS PÉRIMÈTRE POUR L'INSTANT, SUSPENDU ET NON ABANDONNÉ.** Windows sort du périmètre de la Liénothèque (décision de Christophe, qui remplace celle du 28 octobre « macOS puis Windows » et celle du 17 octobre qui en faisait un contrôle informatif). Le texte ci-dessus est conservé tel qu'il était : il n'est pas supprimé, il n'est plus à faire. `windows-latest` a quitté les deux matrices d'intégration continue le 5 novembre (`84cc6396`). Le code et les tests propres à Windows subsistent et sont listés au registre, sans être retirés — précisément parce que la question se reposera.
---

## Annexe. Provenance des chiffres

Établie le 3 novembre 2026 en remontant chaque chiffre clé de ce document à **ce qui l'a produit** :
un message de commit, une base réelle, un journal, une sortie retrouvée dans la transcription de
la session. « Non retrouvée » est une réponse ; une attribution vraisemblable n'en est pas une.

| chiffre | ce qui l'a produit | sortie retrouvable ? |
|---|---|---|
| F3 : **95 apparitions, numérotation 83 %** | message de `5a4cc71a` (2/11 17 h 05) : « le document de référence retient le même endroit qu'avant, 4,3 × 3,2 % de la page, 95 apparitions, numérotation 83 % » | **oui**, dans Git |
| F3 : **95 sur 95**, aucune régression au regroupement | tableau du message de `f5016861` (2/11 15 h 08) : « celui de référence \| 95 sur 95 \| 95 sur 95 » | **oui**, dans Git |
| F3 : **94 sur 95**, inchangé au plancher | message de `3414b4fd` (2/11 10 h 33). Ce n'est **pas** le même chiffre que ci-dessus : autre étape, autre mesure | **oui**, dans Git |
| Marque diluée : **16 → 21 sur 22** | tableau de `f5016861` : « 16 sur 22, dans un groupe de 63 \| 21 sur 22, dans un groupe de 51 » | **oui**, dans Git |
| Endroits à examiner : **6 → 11** et **24 → 39** | message de `f5016861` : « de 6 à 11 sur l'un, de 24 à 39 sur l'autre » | **oui**, dans Git |
| Plancher : **18 → 24 endroits** | message de `3414b4fd` : « 18 endroits proposés deviennent 24 » | **oui**, dans Git |
| Planchers mesurés : **22/55, 52/116, 9/41, 17/61** contre **28, 58, 21, 31** exigés | message de `3414b4fd` | **oui**, dans Git |
| Troisième manière de lire : **2/8 → 8 lues 7 justes**, et les deux autres recueils | tableau de `5a4cc71a` | **oui**, dans Git |
| Bass Aerobics : **44 liens** | base réelle, `base/versions/4f92acd3….json` de la bibliothèque de validation : 44 appariements, relus le 3/11 | **oui**, dans la base |
| Bass Aerobics : **52** | taille du vivier : `base/medias.json` de la même bibliothèque, 52 entrées | **oui**, dans la base |
| Bass Aerobics : **48 liens** après la tolérance OCR | rejeu du 3/11 par le moteur **empaqueté**, sortie conservée hors dépôt (`bass-apres.json`, 299 ko) ; gains {1, 7, 21, 28}, aucun perdu | **oui**, hors dépôt |
| Les quatre liens d'abord dits « contredits » (éléments 2, 14, 19, 23) | vérification **visuelle** dans l'application installée, 3/11 | **l'accusation était fausse, et elle venait de ma mesure.** Capture `p08-cadre.png` : le feuillet 8 du PDF porte TRACK 1 / Workout 1 — c'est lui que ma traduction prenait pour « page imprimée 8 ». Capture `s4-cadre.png` : la **page imprimée 32**, telle que l'application la résout, porte **Workout 14 / TRACK 14**, le lien est juste. L'élément 2 avait été vu de même (page imprimée 8 → Workout 2 / TRACK 2 / Piste 2). **Les éléments 19 et 23 n'ont pas été regardés** |
| Bass Aerobics, les **44 liens de la base** confrontés à deux signaux hors table | mesuré le 3/11 sur la base réelle | **côté média : 44/44** par l'étiquette interne `TRCK`. **Côté page : 31 confirmés** — la page porte le numéro annoncé, règle générique (un libellé d'au moins trois lettres suivi d'un nombre). Les **13 autres ne sont pas contredits mais invérifiables par ce chemin** : leur page imprimée a été **déduite** et non lue, et la table `resultat.pages` y pose à tort feuillet = numéro imprimé |
| `pnpm check` : **2 784 passées, 0 échouée, 31 écartées**, 881 suites | rapporteur JSON de vitest, 17 fichiers dans `outils/ingestion/mesures/sorties/rapports/` | **oui** — le « 67 » d'abord annoncé comptait aussi les mentions de fichiers écartés dans le journal |
| CLA-01 : **220 fichiers contrôlés, 0 sous `mesures/`** | exécution de la logique d'expansion du banc, 3/11 | **oui**, reproductible |
| Empreinte des données de la vraie bibliothèque : **`c2f7dd9e…`** | relevée avant et après la compaction du 3/11, puis revérifiée | **oui**, reproductible |
| **11 → 117 enregistrements** (§-1 sexies, chiffre d'en-tête) | banc `noms-par-ensembles.ts` (et non `ou-passent-les-propositions.ts`, attribution fausse corrigée dans `a3b3fbe7`). **Relancé le 3/11** sur le document entier, sortie `outils/ingestion/mesures/sorties/noms-par-ensembles-bass-aerobics-3nov.txt` | **côté renforcé reproduit : 52/52.** Côté « ancienne règle » **non reproduit : valeur obtenue 52 au lieu de 0** — `c204d8b7` (2/11 20 h 01) a fait entrer la règle renforcée dans la bibliothèque trois heures après l'écriture du banc, qui compare donc aujourd'hui la même règle à elle-même |
| Bach : **4 → 7 sur 9** | aucun commit, aucune sortie de banc retrouvés qui le portent | **NON RETROUVÉE** |
| **1 717** enregistrements retrouvés par empreinte sur 116 archives, zéro doublon ambigu | banc `inventaire-des-archives.py`, **relancé le 3/11**, sortie `outils/ingestion/mesures/sorties/inventaire-des-archives-3nov.txt` | **partiellement reproduit.** Le manque est comblé depuis le rattachement du 2/11 : la mesure rend aujourd'hui `1868 enregistrement(s), dont 0 sans provenance`. Ce qui reste vérifié ce soir : `1979 entrée(s) audio pour 1979 contenu(s) distinct(s)`, `contenus présents dans PLUSIEURS archives : 0` — le **zéro doublon ambigu** tient. Le `1717` lui-même se lit dans l'artefact du 2/11 à 19 h 46, hors dépôt |
| **2 465** épreuves (lot 1, §4) | aucun journal retrouvé | **NON RETROUVÉE** |
| **602 pages sur 203 des 250 documents (81 %)** (lot 1 bis, §4) | aucune sortie retrouvée | **NON RETROUVÉE** |

**Après les relances du 3 novembre**, il reste **trois** chiffres sans sortie retrouvable :
Bach 4 → 7 sur 9, les 2 465 épreuves du lot 1, et les 602 pages / 203 documents / 81 % du lot
1 bis. Aucun n'est déclaré faux ; tous trois sont déclarés **non vérifiables en l'état**.

Deux enseignements de ces relances, qui valent plus que les chiffres eux-mêmes :

1. **Une attribution vraisemblable n'est pas une attribution.** Le 11 → 117 était rattaché au
   mauvais banc dans l'index des mesures, par ressemblance de sujet. Le bon banc l'a montré en
   une exécution.
2. **Un banc qui s'exécute ne prouve pas qu'il mesure encore ce qu'il mesurait.** La ligne de
   base du 11 → 117 est entrée dans la bibliothèque trois heures après l'écriture du banc. Il
   tourne, il rend un chiffre, et ce chiffre n'a plus le même sens. Rien n'avertit.
