# Liénothèque — Cahier des charges de pilotage

**Version 25.1 — 9 novembre 2026**
Rédigé à partir des sessions du 3 au 9 novembre 2026 (Christophe, Claude, Claude Desktop).
La 25.1 corrige la 25 après la relecture de Claude Desktop du 9 novembre (dates, numérotation, état de l'étape 0, garde-fous, dettes D18 à D20).

---

## 0. Comment lire ce document

Ce cahier ne remplace pas le CDC v24 (`cdc-audit-complet-24.md`), qui reste la référence **fonctionnelle**. Il le complète sur trois points :

1. **la feuille de route jusqu'à la version définitive**, étape par étape, avec pour chaque étape ce que « fini » veut dire ;
2. **les règles non négociables**, de produit et de méthode, nées des incidents des derniers jours ;
3. **les dettes connues**, pour qu'aucune ne disparaisse en silence.

**Ordre de préséance.** En cas de contradiction :
1. une décision de Christophe, datée et inscrite dans `docs/decisions/` ;
2. ce cahier ;
3. le CDC v24 (`cdc-audit-complet-24.md`) — **à verser dans le dépôt** (`docs/`), il n'y est pas encore (dette D18) ;
4. l'archive gelée `docs/decisions.md` (historique jusqu'au **7 novembre inclus**).

Le « CDC normatif v2.0 » cité par `CLAUDE.md` emploie les mêmes identifiants d'exigences (CLA-01, REC-07, OUT-15…). Son rang par rapport au v24 reste à établir (dette D18) ; d'ici là, une divergence entre les deux se signale.

Une contradiction se **signale** à Christophe ; elle ne se tranche jamais en silence.

**Règle d'usage.** Ce cahier est relu au début de chaque session et consulté avant chaque décision. Toute étape commencée, finie ou reportée y est mise à jour le jour même. **Reporter sans nommer, c'est oublier** : une étape n'existe que si elle porte son nom ici.

---

## 1. Objectif

Une Liénothèque **fiable, complète et sans faille**, capable de :

- lire n'importe quel document de la bibliothèque (scan, PDF natif, page couchée, page abîmée) ;
- relier chaque page à ses médias (PDF ↔ MP3) **sans jamais publier un faux lien** ;
- laisser Christophe confirmer, corriger et compléter les liens (mode manuel) ;
- apprendre de ses décisions (mémoire d'apprentissage), puis raisonner sur les cas difficiles (Expert) ;
- servir de bibliothèque à **Prof de Basse** et à **Studio Clinique** (citation à la vraie page).

**Cap fixé par Christophe (5 novembre)** : terminer d'abord la Liénothèque (moteur fiable et complet, sans hardcoding), puis intégrer à la fin toutes les méthodes PDF + MP3. Pendant le développement, on éprouve sur de petits extraits de chaque méthode.

**Premier jalon atteint (5 novembre)** : Bass Aerobics publié dans la vraie bibliothèque musicale, vérifié par Christophe à l'écran (« tout est bon, tout fonctionne »).

---

## 2. Périmètre

| | Statut |
|---|---|
| **macOS (Apple Silicon, Tahoe 26.3)** | seule plateforme d'usage |
| Windows | **suspendu, pas abandonné** (décision du 5 novembre). On n'installe, ne mesure et ne promet rien sur Windows. Le code existant est conservé, inactif |
| Ubuntu (CI GitHub) | **machine de vérification seulement**, jamais plateforme d'usage |
| Bibliothèque musicale | `/Volumes/Macbook Pro/Bibliotheque Musique` (250 documents) |
| Bibliothèque Studio Clinique | `/Volumes/Macbook Pro/Lienotheque` (245 documents) |
| Archives originales | `/Volumes/Macbook Pro/Lienotheque-ZIP-a-valider` (116 méthodes) — **originaux uniques, lecture seule**, doublés sur clé USB |

**Intouchables, sans exception** : la base D1 `therapeute-library`, le Worker `clone-proxy`, Vectorize, `bibliotheque-admin.html`.

---

## 3. Règles de produit non négociables

### 3.1 Exigence 0 — la lecture ne doit jamais échouer en silence

Cascade obligatoire, valable **dans toutes les situations** (repères comme texte des pages) :

1. couche texte du PDF, si elle est bonne ;
2. Tesseract sinon, avec : délai effectif, redressement des pages couchées ou retournées, relecture locale des cases abîmées (accord de deux manières au moins) ;
3. **Vision** pour tout ce que Tesseract n'a pas su lire ;
4. si Vision échoue : la page ou la case est **« non lue »**, jamais inventée, et l'écran le dit.

- Vision est **active par défaut**, sans plafond en euros (décision du 5 novembre). Une bibliothèque peut la désactiver ou la plafonner par une donnée explicite ; les cases concernées portent alors `relecture_non_faite` avec leur raison.
- Chaque appel en ligne est **tracé** (date, route, document, feuille, jetons, coût). Un refus de l'API pour une raison de compte arrête le travail et se rapporte.
- Une panne de Vision se **compte à part** : elle ne doit jamais se lire comme « Vision n'apporte rien ».

### 3.2 Zéro faux lien

- Une page sans lien vaut mieux qu'un faux lien.
- **Mode strict** : publier exige **deux sortes de lecture distinctes**. Une propriété tirée des mêmes correspondances (ordre, couverture) est une vérification de cohérence, **pas** un second signal.
- Les étiquettes ID3 (TRCK) ne sont **pas** un second signal : même origine que le numéro du nom de fichier.
- Un vivier non borné (on ne sait pas quels médias appartiennent au document) interdit toute publication, et ce refus **prime** sur toute raison liée à la lecture.

### 3.3 Une page se désigne par sa feuille physique

- Jamais par le folio imprimé (deux feuilles peuvent revendiquer le même), jamais par un rang compacté.
- Le mode manuel reconnaît une page à **son image et son numéro de feuille**, jamais au folio affiché tant qu'A1b n'est pas fait.

### 3.4 Doctrine anti-hardcoding (5 novembre)

- Aucun nom de livre, d'auteur, de collection ni de mot de domaine dans le code générique, **commentaires compris** (garde-fou CLA-01).
- Aucun seuil calibré sur un document : ce qui varie se **mesure dans le document** ou devient une **donnée de bibliothèque**.
- Une référence tirée du document se prend à la **médiane**, jamais au minimum (une page aberrante tire le minimum).
- Toute règle de liaison est éprouvée sur **au moins trois familles** de structures différentes avant d'être adoptée ; sinon elle est « en vigueur, non adoptée » et remesurée dès qu'une autre famille le permet.
- La voie oracle est la cible ; les recettes par famille sont transitoires.

### 3.5 L'abstention dit toujours sa vraie cause

Les causes doivent rester distinctes et visibles dans l'écran Vérifier : `aucun_media`, `medias_non_interpretes`, `aucun_repere_lu`, `exploration_interrompue` (budget épuisé), `vivier_non_borne`, `corroboration_insuffisante`, `relecture_non_faite`, etc. « Je n'ai pas fini de regarder » ne doit jamais s'afficher comme « rien ne numérote ».

### 3.6 L'application est autonome

Le paquet de l'application ne charge **rien** hors de lui-même (aucun `/opt/homebrew`), et embarque les **textes de licence** de tout ce qu'il redistribue (Tesseract, tessdata, leptonica, codecs, node, sf).

---

## 4. Règles de méthode non négociables

### 4.1 Les portes de Christophe

Exigent son mot explicite, donné dans **sa** fenêtre et inscrit au journal des autorisations **dans le même geste** :
push · suppression · écriture dans une vraie bibliothèque · Cloudflare et secrets · choix de doctrine · publication (release) · tout coût ou comportement inattendu.

Une recommandation de Claude **n'est jamais** une autorisation. Une autorisation donnée d'avance ne vaut que pour les lots qu'elle nomme.

### 4.2 Un lot à la fois

- Un lot est terminé, contrôlé et commité **avant** d'en commencer un autre. Une découverte faite en route entre dans la file ; elle ne démarre pas en parallèle.
- Si plusieurs lots coexistent malgré tout dans la copie de travail : avant le contrôle d'un lot qui touche du code, les autres sont **mis de côté** sur la branche de sauvegarde (vérifiés par empreinte avant retrait) et remis ensuite par `git cherry-pick --no-commit`, **suivi d'une désindexation vérifiée**.

### 4.3 Juger ce qui part, pas ce qu'on a sous la main

1. **Chemins explicites** : on n'emporte que ce qu'on nomme. Jamais `git add -A`, jamais un dossier.
2. **Aucun fichier suivi n'importe un fichier non suivi** (garde-fou des fantômes).
3. **L'index est préparé avant le contrôle complet** : index = copie de travail = commit.

### 4.4 Le contrôle complet

- `pnpm check` passe avant tout commit, hors échecs **épinglés** (cause connue, antérieure, prouvée, levée identifiée).
- On lit le **code de sortie**, jamais l'apparence du journal, et jamais au bout d'un `| tail`.
- La charge est relevée au début et à la fin. Machine saturée, sur batterie ou en veille : on n'interprète pas un rouge, on relance au calme. Exiger une **accalmie tenue**, pas un instantané.
- Un seul contrôle complet à la fois.

### 4.5 La CI

- Après chaque push, la CI est **lue avant tout nouveau commit**.
- Une CI verte se rapporte **avec les marges** : tout test passé près de son délai est signalé.
- La CI ne remplace pas le contrôle local : elle n'a ni les œuvres (fixtures privées) ni, pour l'instant, Tesseract.

### 4.6 Garde-fous mécaniques plutôt que vigilance

**Un garde-fou qui demande qu'on lise attentivement n'est pas un garde-fou.** En place :

| Garde-fou | Rôle |
|---|---|
| crochet de pré-commit (`core.hooksPath`) | juge l'index du commit : fantômes, fuites, vocabulaire. `--no-verify` interdit |
| crochet `PreToolUse` de Claude Code | refuse `git reset --hard`, `git stash`, `git clean`, `git checkout … --`, `git restore` sur chemins, `push --force`, `add -A`/`.`, `rm -rf`, `--no-verify` — **un filet, pas un mur** |
| garde-fou des fuites | refuse PDF, MP3 et sorties de mesure dans le dépôt public |
| garde-fou des réglages actifs | la copie où la session lit ses réglages = la version de référence. **Attention** : les fichiers de `.claude/` ne sont aujourd'hui suivis par Git nulle part ; le crochet `PreToolUse` n'existe que sur cette machine (dette D19) |
| `paquet-hermetique` | aucun binaire embarqué ne charge de bibliothèque hors du paquet (né le 8 novembre, vert sur la CI) |
| garde-fou de l'archive gelée | refuse toute modification de `docs/decisions.md` |
| garde-fou des épingles | ne tolère que les échecs épinglés ; une épingle dont le contrôle passe est périmée |
| fidélité de lecture | fichiers de langue et version de Tesseract identiques à ceux de l'application, rouge en cas d'écart, **jamais d'ajustement de l'attendu** |

Tout garde-fou neuf est **éprouvé par mutation** : on prouve qu'il mord. Une règle qu'aucune mutation ne tue est supprimée. Un garde-fou qui lit du code ne lit pas les chaînes ni les commentaires comme du code (sauf CLA-01, qui doit les lire).

### 4.7 Ne jamais perdre de travail

- Branche locale de sauvegarde (jamais poussée), **rafraîchie après chaque pièce finie**, vérifiée par empreinte.
- `cp` est un `checkout --` sans Git ; `git apply --3way` et `cherry-pick --no-commit` indexent leur résultat : on vérifie l'index après chaque geste.
- Un essai jetable se fait dans un **dépôt jetable**, jamais dans la copie de travail.

### 4.8 Niveaux de preuve

1. **niveau 1** : octets, code, données, comparaisons ;
2. **niveau 2** : un regard sur l'écran, capture citée ;
3. **niveau 3** : la vérification de Christophe (sur le document ou à l'écran du produit).

Comparer des données reste du niveau 1, quelle que soit la force de la comparaison. Chaque affirmation dit son niveau.

### 4.9 Le registre

| Fichier | Rôle |
|---|---|
| `docs/decisions.md` | **archive gelée** (jusqu'au 7 novembre inclus), plus aucune écriture |
| `docs/decisions/AAAA-MM-JJ-sujet.md` | une décision par fichier, plus le sommaire `README.md` |
| `docs/autorisations-de-push.md` | journal en ajout seul, une ligne par push, numérotation continue |
| `docs/file-des-lots.md` | la file des **lots** ; chaque lot nomme l'**étape** du § 5 qu'il sert (voir § 5.0) |

Une mesure périmée se corrige **à sa date**, avec la trace de la correction. Une phrase de consigne devenue fausse est une dette, au même titre qu'un bug.

### 4.10 Le Mac

Pendant les longs travaux : **sur secteur, éveillé**. Spotlight exclu des dossiers lourds de la Liénothèque. Pas de gros calcul d'un autre projet en même temps qu'un contrôle complet. Surveiller l'espace libre du disque interne (au moins 20 à 30 Go).

---

## 5. Feuille de route jusqu'à la version définitive

Chaque étape porte sa **définition de « fini »**. Une étape n'est finie que lorsque tous ses critères sont tenus et inscrits.

### 5.0 Étapes et lots : une seule numérotation de référence

Les **étapes** (0 à 10) sont la feuille de route ; les **lots** de `docs/file-des-lots.md` sont les unités de travail. Un lot nomme toujours l'étape qu'il sert ; on désigne le travail par l'étape, le lot n'étant qu'un sous-numéro.

| Étape | Lot(s) de la file |
|---|---|
| 0 — application autonome | `paquet-hermetique` (fait), licences, archive des moteurs ; **le lot 0b** (Tesseract sur la CI) est absorbé par la dernière case de l'étape 0 (voie 3) |
| 1 — fin d'A2 : Vision branché | lot Vision, mesure 48 → 52 |
| 2 — second déclencheur | lot du texte des pages |
| 3 — listes de pistes et seuil | lot Bach / seuil de 8, rangées fantômes |
| 4 — mode manuel | lot 7 |
| 5 — A1b | lot 8 |
| 6 — estimation marquée | lot 9 |
| 7 — mémoire d'apprentissage | lot 10 |
| 8 — Expert | lot 11 |

**Attention** : « étape 0 » (application autonome) et « lot 0b » (Tesseract sur les coureurs) ne désignent pas la même chose. Le lot **0a** (garde-fou des fichiers fantômes) est **fait** et doit être marqué comme tel dans la file.

### Étape 0 — Application autonome *(en cours, prioritaire — trois cases sur cinq)*

Le Tesseract embarqué charge six codecs depuis `/opt/homebrew` : chez un testeur sans Homebrew, la reconnaissance ne se charge pas.

**Fini quand :**
- [x] `preparer-moteurs.py` réécrit tous les liens (appariement sur le nom résolu), échoue s'il reste un seul `/opt/homebrew`, et ne tourne plus en silence (`28baedaf`) ;
- [x] un contrôle au dépôt vérifie `otool -L` sur **tous** les binaires embarqués (tesseract, node, sf) — `paquet-hermetique` (`28baedaf`, CI 42540275093 verte) ;
- [x] l'application est refabriquée, réinstallée, et `DYLD_PRINT_LIBRARIES` prouve que rien ne sort du paquet (`28baedaf`) ;
- [ ] les textes de licence sont embarqués dans l'application ;
- [ ] (ensuite, sur le mot de Christophe) l'archive des moteurs est publiée en release, avec son empreinte dans `fixtures/moteurs-de-lecture.json`, et la CI macOS lit avec **le même programme** que l'application.

### Étape 1 — Fin d'A2 : le repli Vision branché

**Fini quand :**
- [ ] la chaîne appelle réellement la relecture des cases sans accord (port 1) et Vision au bout du port des repères (port 2, à la place du bouchon) ;
- [ ] pannes comptées à part ; cases non relues marquées `relecture_non_faite`, visibles dans Vérifier ;
- [ ] mesure **48 → 52** sur Bass Aerobics entier, par la chaîne, à blanc, appels tracés, coût rapporté ;
- [ ] (écriture réelle de la nouvelle version dans la bibliothèque : porte de Christophe, sauvegarde vérifiée, vérification à l'écran.)

### Étape 2 — Second déclencheur d'A2 : le texte des pages

**Fini quand :**
- [ ] une page qui lit nettement moins bien que ses comparables du même document déclenche Vision, selon le type de document (donnée de bibliothèque) ;
- [ ] mesuré sur un livre de la Bibliothèque Studio Clinique, sans faux déclenchement sur les partitions.

### Étape 3 — Détection des listes de pistes et seuil de corroboration

**Fini quand :**
- [ ] le détecteur choisit parmi les groupes de colonnes celui qui satisfait les critères de forme (sans filtrer les nombres par le vivier : la colonne des pages peut le dépasser) ;
- [ ] Bach p2 est détecté ;
- [ ] le seuil de corroboration de 8 est **réellement éprouvé** sur Bach (vivier de 9), puis tiré du document si la mesure le justifie.

### Étape 4 — Le mode manuel *(priorité de Christophe)*

**Fini quand :**
- [ ] confirmation lien par lien (élément, feuille, média), caduque si la lecture change ;
- [ ] association libre sur l'écran à deux colonnes quand le moteur ne propose rien ;
- [ ] décisions dans une couche séparée qui **survit aux relances** (test rouge central) ;
- [ ] le Lecteur affiche enfin `aVerifier` : une proposition ne ressemble plus jamais à un lien publié ;
- [ ] les Aebersold servent de cas d'école (signal fort, unique).

### Étape 5 — A1b : la vraie source du folio

**Fini quand :**
- [ ] lecture du folio en marge, nombre seul sur sa ligne, au moins cinq lectures concordantes, par plages ;
- [ ] vérité attendue construite sur trois familles de pagination, confirmée en partie au papier par Christophe ;
- [ ] aucun folio inventé : sans lecture, le folio est dit absent ;
- [ ] (tant qu'A1b n'est pas fait : **aucun retraitement par la voie recette**.)

### Étape 6 — Estimation marquée

**Fini quand :**
- [ ] les liens à signal unique peuvent être publiés **marqués non confirmés**, selon un seuil d'erreur **fixé par Christophe** ;
- [ ] le marquage est visible partout (Lecteur, Vérifier, exports).

### Étape 7 — Mémoire d'apprentissage (Learning)

Trois niveaux : association, exemple vérifié, généralisation prouvée et réversible. Nourrie par les décisions du mode manuel.

**Fini quand :**
- [ ] une correction de Christophe n'est plus jamais à refaire sur le même cas ;
- [ ] une généralisation est prouvée sur plusieurs documents et réversible ;
- [ ] rien ne se généralise d'un document à un autre sans passer par les trois niveaux.

### Étape 8 — L'Expert

Document de référence : `docs/cdc-expert-apprentissage.md` (§3 et §8 validés le 5 novembre, révisables après usage réel).

**Fini quand :**
- [ ] conception détaillée écrite avant tout code (format des questions, contrat de l'appel API, budget) ;
- [ ] l'Expert raisonne, questionne, **ne publie jamais seul**, en second recours après le moteur ;
- [ ] interrupteur global ; si l'API échoue, retour à l'abstention normale.

### Étape 9 — Intégration de toutes les méthodes

**Fini quand :**
- [ ] le banc d'extraits (115 méthodes) passe sans faux lien, sans lien sur une page de fin, avec toute abstention expliquée ;
- [ ] les méthodes sont intégrées **famille par famille** : oracle à blanc sur des représentatifs, écriture réelle sur le mot de Christophe (sauvegarde vérifiée), sondage à l'écran par Christophe ;
- [ ] chaque règle adoptée est remesurée sur chaque nouvelle famille.

### Étape 10 — Prof de Basse et Studio Clinique

**Fini quand :**
- [ ] intégration réelle par les jetons C3 ;
- [ ] Studio Clinique cite la **vraie page** d'un livre ;
- [ ] usage réel en parallèle pendant plusieurs mois avant la bascule de Studio Clinique (critères de bascule à fixer par Christophe).

---

## 6. Dettes connues

Chaque dette porte sa raison et l'étape où elle doit être levée. Aucune ne disparaît sans trace.

| # | Dette | Levée prévue |
|---|---|---|
| D1 | Tesseract de la CI (Homebrew 5.5.4) ≠ celui de l'application (5.5.1) ; CI sans Tesseract en attendant | Étape 0 |
| D2 | Textes de licence absents de l'application | Étape 0 |
| D3 | Préséance des causes d'abstention non uniforme : `voie-oracle.ts` rend `aucun_repere_lu` sans demander si le vivier est borné (entrée 17) | avant l'étape 1 |
| D4 | 82 seuils de jugement écrits en dur (34 géométriques, 12 de lecture, 34 de structure, 2 d'alphabet), dont `LIGNES_POUR_UNE_COLONNE = 4` (priorité haute) et les huit poids de l'associateur | au fil des étapes 3 à 7 |
| D5 | Six seuils suspects d'être inversés par rapport à leur nom (`PENALITE_SAUT_CORROBORE`, `ACCORD_SUR`, `PRIME_DERNIERE`, `SEUIL_LISIBILITE`, `FEUILLES_A_DEUX_FOLIOS`, `PAGE_MAX`/`PAGE_MAXIMUM`) | à vérifier, étape 3 |
| D6 | « Rangées fantômes » de `rangeesDeTable` | avec l'étape 3 |
| D7 | Tests proches de leur délai (« vignette et aperçu (OUT-04, OPT-05) > tient le plafond dans les deux sens » ~×1,6 sur la CI) ; garde-fou des marges à écrire (entrée 16) | prochainement |
| D8 | Clé du cache de lecture fondée sur chemin + taille + date, et non sur le contenu | plus tard |
| D9 | Épingle F3 (`critere-f3-orphelins-93-98`) : levée par la voie oracle + confirmation lien par lien | Étape 4 |
| D10 | Épingle « Tesseract absent » : levée par le repli correct quand Tesseract manque | Étape 1 |
| D11 | `CLAUDE.md` promet encore Windows en trois endroits (tableau des intégrations continues, phrase sur « les trois systèmes », tableau du lot 0) | prochain lot de documentation |
| D12 | Garde-fou du journal des autorisations (numéros consécutifs, lignes anciennes jamais modifiées) | entrée 18 |
| D13 | Garde-fou « les phrases du CLAUDE.md sont-elles encore vraies ? » | en dernier |
| D14 | Fichiers non suivis d'anciens lots jamais commités : inventaire à faire | prochainement |
| D15 | « Assez de mots » du redressement rapporté à la page médiane : peut refuser une page couchée peu dense dans un document mixte | quand un tel cas sera au banc |
| D16 | Numérisations partielles de certains Aebersold (sections Bb, Eb, clé de fa absentes) : fait de contenu, pas de code | aucune action logicielle |
| D17 | Le crochet de pré-commit n'existe que sur la branche de travail ; la copie principale (sur `main`) n'est pas protégée | à la fusion dans `main` |
| D18 | Le CDC v24 (rang 3 de la préséance) n'est pas dans le dépôt ; le « CDC normatif v2.0 » de `CLAUDE.md` coexiste sans rang établi | verser le v24 dans `docs/`, puis Christophe tranche le rang du v2.0 |
| D19 | Les fichiers de `.claude/` (réglages, crochet `PreToolUse`) ne sont suivis par Git nulle part ; le garde-fou des réglages actifs compare une copie non suivie ; un clone neuf n'a pas le crochet | versionner `.claude/` dans le dépôt et faire comparer le garde-fou à la version commitée |
| D20 | Les décisions du 8 et du 9 novembre (voie 1 puis voie 3 pour Tesseract, étape 0 autorisée, ce cahier) n'ont pas encore leur fichier dans `docs/decisions/` | immédiatement |

---

## 7. Critères d'acceptation communs à toute étape

Une étape n'est acceptée que si :

1. un **test rouge** a été écrit d'abord, puis rendu vert ;
2. chaque règle nouvelle est **tuée par sa mutation** ;
3. le **contrôle complet** est accepté sur un arbre où index = copie de travail = commit, machine calme ;
4. le commit ne porte **que** les fichiers du lot (vérifié par `git show --name-only`) ;
5. le push est **autorisé et inscrit** dans le même geste ;
6. la **CI est verte**, marges rapportées ;
7. la **décision** est écrite dans `docs/decisions/`, la file et ce cahier sont mis à jour ;
8. si l'étape touche une vraie bibliothèque : sauvegarde vérifiée par empreinte, écriture sur le mot de Christophe, **vérification à l'écran par Christophe** (niveau 3).

---

## 8. Ce qu'on ne fait jamais

- Publier un lien sur un seul signal en mode strict, ou sur un vivier non borné.
- Inventer une lecture, un folio ou un nombre.
- Ajuster un attendu pour faire passer un contrôle ou la CI.
- Allonger un délai pour cacher une lenteur, ou épingler un rouge qu'on n'a pas expliqué.
- Écrire un nom d'œuvre ou un mot de domaine dans le code générique.
- Mettre une œuvre (PDF, MP3, extrait) ou l'inventaire nominatif de la collection dans le dépôt public.
- Toucher à `therapeute-library`, `clone-proxy`, Vectorize ou `bibliotheque-admin.html`.
- Afficher un secret, ou le passer en argument de commande.
- Franchir une porte de Christophe sans son mot.

---

## 9. Glossaire minimal

| Terme | Sens |
|---|---|
| **feuille physique** | une page du fichier PDF, comptée à partir de son début |
| **folio** | le numéro imprimé sur la page |
| **vivier** | l'ensemble des médias qui peuvent appartenir à un document |
| **voie oracle** | le moteur générique de liaison, qui remplace les recettes par famille |
| **épingle** | un échec connu, expliqué et antérieur, toléré jusqu'à sa levée identifiée |
| **mutation** | une modification volontaire du code pour prouver qu'un test détecte bien le défaut |
| **porte** | une décision réservée à Christophe |
| **accalmie tenue** | une période de charge basse qui dure, et pas seulement un instant |
