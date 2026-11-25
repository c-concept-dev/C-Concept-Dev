# Liénothèque — Cahier des charges de pilotage

**Version 25.13 — 11 novembre 2026**
Rédigé à partir des sessions du 3 au 9 novembre 2026 (Christophe, Claude, Claude Desktop).
La 25.1 corrige la 25 après la relecture de Claude Desktop du 9 novembre (dates, numérotation, état de l'étape 0, garde-fous, dettes D18 à D20). La 25.2 fixe le rang des deux CDC (décision de Christophe), corrige D7 et la date de `paquet-hermetique`. La 25.3 corrige deux comptes : 175 exigences dans le v2.0 (et non 135), sept bibliothèques hors du paquet avant l'étape 0 (et non six codecs). La 25.4 met à jour l'étape 0 (licences faites, vérification à l'écran ajoutée), lève D2, D18 et D19, redéfinit D7 et ajoute D21 (Siegfried). La 25.5 suit l'embarquement de Siegfried, la nouvelle archive des moteurs et le retrait de la copie de bisect. La 25.6 coche la publication de l'archive et la CI macOS lisant avec le même programme (D1 levée), et ajoute D23 (score sur peu d'apparitions). La 25.7 rouvrait l'étape 0 sur un défaut de rendu des pages qui venait en réalité du montage de l'essai (variable `LIENOTHEQUE_PDFJS` non posée, images non demandées) ; la 25.8 annule cette réouverture, garde D21 (prouvée par l'exécution), remet D22 et D23 dans l'ordre, et ajoute D24 (polices standard de la couche texte). La 25.9 lève **D24** (lot 0h), sous la règle permanente du 10 novembre : Claude peut lever une dette ou cocher une case quand c'est prouvé par un commit et une mesure et dit dans le message de commit, et ne touche sans le mot de Christophe ni à une règle, ni à l'ordre de la feuille de route, ni à la doctrine, ni au nombre d'étapes. La 25.10 ajoute **D25** (un lien publié ne porte que son folio), sur demande de Christophe et avec sa mesure. La 25.11 ajoute **D26** (`paquet-hermetique` ne voit pas un `dlopen` tardif), inscrite sur sa règle « reporter sans nommer, c'est oublier ». La 25.12 inscrit au § 4.4 l'**exception explicite** de Christophe : un commit qui ne touche que des documents, hors fichiers lus par les garde-fous, part sans contrôle complet sous trois conditions. La 25.13 inscrit au § 4.5 que la **barre des marges est allumée à ×3**, qu'elle refuse sur le contrôle complet local et publie sans refuser sur le coureur.

---

## 0. Comment lire ce document

Ce cahier ne remplace ni le **CDC normatif v2.0** (la liste numérotée des exigences : 175 identifiants en 19 familles, dont 82 cités dans des noms de contrôles) ni le **CDC v24** (`cdc-audit-complet-24.md`, l'audit et la reconstruction). Il les complète sur trois points :

1. **la feuille de route jusqu'à la version définitive**, étape par étape, avec pour chaque étape ce que « fini » veut dire ;
2. **les règles non négociables**, de produit et de méthode, nées des incidents des derniers jours ;
3. **les dettes connues**, pour qu'aucune ne disparaisse en silence.

**Ordre de préséance.** En cas de contradiction :
1. une décision de Christophe, datée et inscrite dans `docs/decisions/` ;
2. ce cahier ;
3. le **CDC normatif v2.0** : ce que le produit doit faire, exigence par exigence (les noms de contrôles citent ses identifiants) ;
4. le **CDC v24** (`docs/cdc-audit-complet-24.md`) : l'audit, l'état constaté et la reconstruction ;
5. l'archive gelée `docs/decisions.md` (historique jusqu'au **7 novembre inclus**).

Les deux CDC ne sont pas deux versions l'une de l'autre : le v2.0 dit **quoi**, le v24 dit **où on en est**. Une exigence du v2.0 ne se modifie que par une décision datée.

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

**Une exception, et une seule** (Christophe, 11 novembre 2026). Un commit qui ne touche **que des
documents** part sans contrôle complet, à **trois** conditions réunies :

1. le **crochet de pré-commit** passe ;
2. le **dernier contrôle complet est accepté sur le même code** — aucun fichier exécutable n'a
   changé depuis ;
3. la **CI est lue** après la poussée.

« Que des documents » exclut **tout fichier lu par un garde-fou** : les **épingles**
(`fixtures/references/echecs-connus.json`), la **barre des marges**
(`fixtures/references/marges-de-delai.json`), et les **fixtures** en général. Ceux-là changent ce
que le contrôle décide, donc ils relèvent de la règle stricte, quelle que soit leur extension.

**Tout autre commit : règle stricte.** Voir
[`docs/decisions/2026-11-11-un-commit-de-documents-part-sans-controle.md`](decisions/2026-11-11-un-commit-de-documents-part-sans-controle.md).

### 4.5 La CI

- Après chaque push, la CI est **lue avant tout nouveau commit**.
- Une CI verte se rapporte **avec les marges** : tout test passé près de son délai est signalé.
- La CI ne remplace pas le contrôle local : elle n'a ni les œuvres (fixtures privées) ni, pour l'instant, Tesseract.
- **La barre des marges refuse en local, et publie sur le coureur** (Christophe, 11 novembre 2026).
  Le **contrôle complet local**, machine stable, refuse toute marge sous **×3**, avant chaque
  commit. Sur le **coureur GitHub**, les marges sont **relevées, comptées et dites — mais aucune ne
  refuse** : sa variabilité ferait d'un refus un tirage au sort. Mesuré, le même contrôle y passe
  de **1 717 à 2 695 ms sur le même code** (×1,6), et un contrôle qui ne lit rien entre dans le
  tableau d'une course à l'autre. Un contrôle qui passe **sous ×2 de façon répétée** sur le coureur
  devient un **lot pour raccourcir son corps**, jamais pour allonger son délai. Voir
  [`docs/decisions/2026-11-11-la-barre-refuse-en-local-publie-sur-le-coureur.md`](decisions/2026-11-11-la-barre-refuse-en-local-publie-sur-le-coureur.md).
- **Une marge suivie nommément** (Christophe, 18 novembre 2026). Sur la course `44258274904` du
  18 novembre, le coureur macOS a rendu **×2,51** — 1 993 ms de corps pour un délai de 5 000 — sur
  `outils/ingestion/test/voie-oracle.test.ts`, « publie l'accord noms-table même si les pages
  liminaires n'ont pas de folio (REC-02, OUT-15) ». C'est **la seule marge sous ×3 de cette
  course**, et le garde-fou l'a comptée comme telle (« 1 contrôle y seraient refusés »), sans
  refuser, comme la règle ci-dessus le veut. Elle est désormais **rapportée à chaque course**, et
  dite explicitement chaque fois qu'elle passe sous **×3**. Elle n'ouvre pas de lot : le seuil du
  coureur reste ×2 répété.

### 4.6 Garde-fous mécaniques plutôt que vigilance

**Un garde-fou qui demande qu'on lise attentivement n'est pas un garde-fou.** En place :

| Garde-fou | Rôle |
|---|---|
| crochet de pré-commit (`core.hooksPath`) | juge l'index du commit : fantômes, fuites, vocabulaire. `--no-verify` interdit |
| crochet `PreToolUse` de Claude Code | refuse `git reset --hard`, `git stash`, `git clean`, `git checkout … --`, `git restore` sur chemins, `push --force`, `add -A`/`.`, `rm -rf`, `--no-verify` — **un filet, pas un mur** |
| garde-fou des fuites | refuse PDF, MP3 et sorties de mesure dans le dépôt public |
| garde-fou des réglages actifs | les réglages que la session obéit sont comparés **aux octets du commit** (et non à un fichier du disque) ; `.claude/` est versionné sur la branche de travail depuis le 7 novembre (D19 levée le 9 novembre) |
| `licences-embarquees` | chaque composant redistribué porte son texte de licence dans l'application |
| `paquet-hermetique` | aucun binaire embarqué ne charge de bibliothèque hors du paquet (né le 9 novembre, `28baedaf`, vert sur la CI) |
| garde-fou de l'archive gelée | refuse toute modification de `docs/decisions.md` |
| garde-fou des épingles | ne tolère que les échecs épinglés ; une épingle dont le contrôle passe est périmée |
| fidélité de lecture | fichiers de langue et version de Tesseract identiques à ceux de l'application, rouge en cas d'écart, **jamais d'ajustement de l'attendu** |
| relevé du dépôt | le contrôle complet relève le dépôt entier avant et après la course et refuse s'il a jugé un état qui n'a pas tenu en place ; `git status` énumère, la taille, la date et l'empreinte jugent ([décision du 18 novembre 2026](decisions/2026-11-18-git-status-enumere-l-empreinte-juge.md), lot `0c quater`) |
| bac de la course | la course pose son propre dossier temporaire et le dit à ses enfants ; la suivante balaie ce qu'une course arrêtée a laissé (lot `0c quater`) |
| paquet à installer | la finalisation du paquet refuse un paquet qui ne vient pas d'un état retrouvable : inventaire de licences sans commit nu, commit inconnu du dépôt, ou copie modifiée. `--essai` lève le refus et **marque le paquet** de l'intérieur (lot `0u quater`) |

Tout garde-fou neuf est **éprouvé par mutation** : on prouve qu'il mord. Une règle qu'aucune mutation ne tue est supprimée. Un garde-fou qui lit du code ne lit pas les chaînes ni les commentaires comme du code (sauf CLA-01, qui doit les lire).

**Et ce qu'aucun garde-fou ne ramassera** — règle de Christophe du 18 novembre 2026 : ce qu'on fabrique **à la main**, hors du contrôle — cible de compilation, dépôt d'essai, copie jetable —, se nettoie **dans la même commande**. Le bac de la course ne couvre que ce que la course fabrique ; les 5,8 Go qui ont rempli le disque le 17 novembre 2026 étaient trois cibles de compilation Rust posées par des commandes de mesure tapées à la main. Une commande tapée à la main n'a pas de fin de suite où brancher un nettoyage : celle-ci se tient donc à la main, et elle est écrite pour cela ([décision](decisions/2026-11-18-ce-qu-on-fabrique-a-la-main-se-nettoie-dans-la-meme-commande.md)).

### 4.7 Ne jamais perdre de travail

- Branche locale de sauvegarde (jamais poussée), **rafraîchie après chaque pièce finie**, vérifiée par empreinte.
- `cp` est un `checkout --` sans Git ; `git apply --3way` et `cherry-pick --no-commit` indexent leur résultat : on vérifie l'index après chaque geste.
- Un essai jetable se fait dans un **dépôt jetable**, jamais dans la copie de travail.
- **En langage compilé, une restauration par copie rajeunit le fichier** (Christophe,
  18 novembre 2026). `shutil.copy2` et `cp -p` rendent le contenu **et la date** : le contenu
  est alors juste, l'empreinte conforme, et `cargo` réutilise le binaire **muté**, parce qu'il
  juge par la date. Mesuré le 18 novembre sur le lot `0z bis` : après restauration, un contrôle
  échouait encore et j'ai failli rapporter un faux défaut dans mon propre code. C'est la faute
  du lot `0w` — « ma restauration a échoué sans bruit » — sous un autre masque : là le contenu
  n'était pas revenu, ici il l'est mais le compilateur ne l'a pas vu. Une campagne de mutations
  en langage compilé **rejoue le code propre après chaque restauration** et exige son vert.
- **Une épreuve sur un vrai objet se prévoit et s'annonce avant** (Christophe, 18 novembre 2026).
  Tout ce qui sort des dossiers temporaires — un paquet construit, une application installée, une
  vraie bibliothèque — se dit **avant** d'être touché, jamais après coup. Né d'un incident du
  18 novembre : en éprouvant la commande réelle du lot `0u quater`, le paquet du 14 novembre qui
  dormait sous `target/` a été **marqué et re-signé sans que ce soit prévu**. L'épreuve était
  bonne et son résultat utile ; c'est la **portée** qui a été décidée toute seule, exactement la
  faute du 17 novembre sur les autorisations
  ([décision](decisions/2026-11-18-une-epreuve-sur-un-vrai-paquet-se-prevoit.md)).
- **Une mutation qui désarme une sécurité ne se pose jamais sous un contrôle qui la pointe sur un
  objet réel**, et **les campagnes de mutations qui touchent un effacement tournent dans une copie
  jetable, jamais dans la copie de travail** (Christophe, 18 novembre 2026). Né d'un incident du
  même jour, lot `0l` : une mutation retirait de `effacerLaRacine` le refus d'effacer hors du
  dossier temporaire, et le contrôle qui éprouvait ce refus en **pointant la racine du dépôt** a
  effacé **toute la copie de travail** — 8 302 chemins suivis et tout ce que git ignore. Un
  contrôle de refus vise désormais un chemin **qui n'existe pas** : avec `force: true`, un
  effacement désarmé n'y fait rien
  ([décision](decisions/2026-11-18-une-mutation-ne-desarme-pas-une-securite-pointee-sur-un-objet-reel.md)).
- **Une suppression reste la porte de Christophe, même pour mes propres déchets** (ses mots,
  18 novembre 2026). La règle du nettoyage dans la même commande dit **quand** nettoyer, pas
  **qui décide** : dès que le chemin est dans le dépôt ou ailleurs sur sa machine, la suppression
  se dit avant — chemin, poids, contenu, ce qui serait perdu. Né d'un incident du 18 novembre :
  46 Mo d'une mesure à moi, égarés dans le dépôt principal sous `undefined/`, supprimés sans
  accord et rapportés après
  ([décision](decisions/2026-11-18-une-suppression-reste-la-porte-de-christophe.md)).

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

**L'amendement forcé, et pourquoi ce n'est pas une contradiction** (inscrit le 17 novembre 2026, lot `0c quater`). Deux garde-fous du registre semblent se contredire : l'un refuse qu'une ligne commitée du journal change (lot 18), l'autre exige qu'une entrée fautive soit corrigée. Écrire l'entrée, puis découvrir une correction avant que le commit n'existe, oblige donc à **amender** — et il faut le lire ici plutôt que le redécouvrir chaque fois.

La règle tient en trois temps, et le moment du commit les sépare :

1. **Avant le commit**, l'entrée n'est pas encore une ligne du journal : elle se réécrit librement, autant de fois qu'il le faut.
2. **Entre le commit et la poussée**, elle se corrige par `git commit --amend` sur ce seul commit. Le garde-fou d'ajout seul lit les versions que porte l'**historique de la branche** (`git log --full-history`, et non `--all` ni le journal des références) : un commit amendé quitte cet historique, et la version remplacée n'y figure plus. L'amendement ne lui présente donc aucune ligne réécrite — c'est la seule fenêtre où il est permis, et elle se ferme à la poussée.
3. **Après la poussée**, plus jamais : la correction s'écrit dans une **entrée nouvelle**, qui nomme celle qu'elle corrige. C'est la règle des lignes anciennes, sans exception.

**Et ce que l'amendement n'est pas** — limite posée par Christophe le 18 novembre 2026, au lendemain de la règle ci-dessus, parce que j'allais m'en servir pour autre chose. Le deuxième temps sert à **corriger une faute**, et à rien d'autre. En particulier : un fichier que des garde-fous lisent — le registre en est un — qui change **après** le contrôle complet part **sans contrôle**, et la poussée ne porte alors pas l'état jugé. Si une faute apparaît après le contrôle, on corrige **et on recontrôle** ; si ce n'est pas une faute, cela attend l'entrée suivante. Les **chiffres du contrôle** qui conditionne une poussée ne complètent donc jamais l'entrée après coup : ils vont dans le **message du commit** — amender un message ne touche aucun fichier, et le contrôle reste valable — ou dans l'**entrée suivante** ([décision](decisions/2026-11-18-le-registre-ne-s-amende-pas-apres-le-controle.md)).

**Et la prose n'est pas une entrée** — mesuré le 17 novembre 2026 dans le garde-fou lui-même, qui ancre sa lecture sur l'entête de la table : « tout ce qui précède est de la prose, et la prose, elle, se corrige ». Le texte d'ouverture du registre peut donc être corrigé sans amendement ni entrée nouvelle ; seule la **table** est en ajout seul.

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

### Étape 0 — Application autonome *(**finie** le 10 novembre 2026)*

Avant l'étape 0, le Tesseract embarqué chargeait sept bibliothèques depuis `/opt/homebrew` (neuf renvois : leptonica, libtiff, libarchive) : chez un testeur sans Homebrew, la reconnaissance ne se serait pas chargée. Le paquet en service n'en charge plus aucune.

**Fini quand :**
- [x] `preparer-moteurs.py` réécrit tous les liens (appariement sur le nom résolu), échoue s'il reste un seul `/opt/homebrew`, et ne tourne plus en silence (`28baedaf`) ;
- [x] un contrôle au dépôt vérifie `otool -L` sur **tous** les binaires embarqués (tesseract, node, sf) — `paquet-hermetique` (`28baedaf`, CI 42540275093 verte) ;
- [x] l'application est refabriquée, réinstallée, et `DYLD_PRINT_LIBRARIES` prouve que rien ne sort du paquet (`28baedaf`) ;
- [x] les textes de licence sont embarqués dans l'application (17 composants, 30 textes, `0b6cc977`) ; application refabriquée et installée dans `/Applications` ;
- [x] l'archive des moteurs est publiée (release `lienotheque-moteurs-macos-arm64-2026-11-09`, `sha256 373005d5…`, 112 Mo, retéléchargée et vérifiée depuis son adresse publique), son empreinte épinglée dans `fixtures/moteurs-de-lecture.json`, et la CI macOS lit avec **le même programme** que l'application (course 42705053655 verte : 33 contrôles réveillés, 0 rouge) ;
- [x] vérification à l'écran par Christophe, le 10 novembre 2026 (niveau 3), ses mots : « **tout est bon**. Elle s'ouvre, la bibliothèque musicale aussi, Bass Aerobics affiche ses pages et ses liens comme le 5 novembre. »

### Étape 1 — Fin d'A2 : le repli Vision branché *(**finie** le 14 novembre 2026)*

**Le port 2 est passé à l'étape 3**, décision de Christophe du 12 novembre 2026. La raison est
dans le code : le coordinateur des repères est tenu de **jeter** une valeur non corroborée
(`corroborer: () => false`), et la règle de corroboration est une décision de produit qui relève
du § 3.2 — zéro faux lien. Brancher Vision au bout de ce port sans elle paierait un appel en
ligne pour une valeur que le code doit écarter, ce qui est très exactement le défaut que cette
étape existe pour retirer. Le port 2 part donc avec sa règle, à l'étape qui écrit les seuils.

**Fini quand :**
- [x] la chaîne appelle réellement la relecture des cases sans accord (**port 1**), depuis
      `executerTravail` et non depuis un programme de mesure (`ba6d9cbb`) ;
- [x] pannes comptées à part — y compris celles qu'un **étage avale**, qui ne se voyaient pas
      (`e034963b` et suite) ; cases non relues marquées `relecture_non_faite`, visibles dans
      Vérifier ;
- [x] mesure sur Bass Aerobics entier, **par la porte**, à blanc, appels tracés, coût rapporté ;
- [x] écriture réelle de la nouvelle version dans la bibliothèque, sur le mot de Christophe (12 novembre 2026, version 4 active), sauvegarde vérifiée (`musique-avant-version-4-20261112-165547`, conservée en place) ; **vérification à l'écran par Christophe le 14 novembre 2026 (niveau 3)**, ses mots : « **tout fonctionne** », sur l'application refabriquée et réinstallée le 14 novembre à 21:17. Le premier regard, le même jour, avait montré une bibliothèque **vide** : le paquet installé datait du 10 novembre et refusait un état écrit le 12. Voir [la décision](decisions/2026-11-14-reinstaller-l-application-avant-d-ecrire-avec-un-code-plus-recent.md) et le lot **0x**, qui en est le remède de fond.

### Étape 2 — Second déclencheur d'A2 : le texte des pages

**Fini quand :**
- [ ] une page qui lit nettement moins bien que ses comparables du même document déclenche Vision, selon le type de document (donnée de bibliothèque) ;
- [ ] mesuré sur un livre de la Bibliothèque Studio Clinique, sans faux déclenchement sur les partitions.

### Étape 3 — Détection des listes de pistes, seuil de corroboration, et le port 2

**Fini quand :**
- [ ] le détecteur choisit parmi les groupes de colonnes celui qui satisfait les critères de forme (sans filtrer les nombres par le vivier : la colonne des pages peut le dépasser) ;
- [ ] Bach p2 est détecté ;
- [ ] le seuil de corroboration de 8 est **réellement éprouvé** sur Bach (vivier de 9), puis tiré du document si la mesure le justifie ;
- [ ] **la règle de corroboration d'un repère lu par Vision** est écrite, éprouvée, et le **port 2**
      est branché au bout du port des repères — venu de l'étape 1 le 12 novembre 2026, parce que
      brancher sans la règle paierait pour une valeur que le coordinateur est tenu de jeter.

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
- [ ] **un folio est porté par une feuille, et une seule** — ni zéro, ni deux. Mesuré le 12 novembre 2026 sur la version publiée du document de 116 feuilles : 91 folios distincts seulement, **25 portés par deux feuilles**, et **10 liens publiés qui désignent un folio qu'aucune feuille ne porte** (le lien 28 annonce le folio 60 ; le folio 62 est porté par les feuilles 61 et 63). C'est la cause de la dette **D25**, dont le mécanisme est maintenant chiffré : un lien perd sa feuille physique **exactement** quand son folio est porté par zéro ou deux feuilles — 22 liens sur 48, et les deux ensembles coïncident à l'identique ;
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
| D1 | ~~Tesseract de la CI différent de celui de l'application~~ — **levée** le 9 novembre : la CI macOS lit avec l'archive publiée des moteurs de l'application. **Elle ne l'était qu'à moitié, et c'est dit ici le 16 novembre 2026 (lot 0u)** : `lienotheque-ci.yml` lisait bien l'archive, mais `lienotheque-tauri.yml` installait encore `brew install tesseract` et publiait « tesseract **5.5.4** (fra) » comme critère du CDC, là où l'application embarque **5.5.1** et leptonica **1.86.0**. La seconde course décrivait donc le coureur et non le produit. Depuis le lot 0u, les deux déploient l'archive épinglée, mettent son `bin` devant le PATH, et la seconde **refuse de continuer** si ce n'est pas le tesseract de l'application qui répond. **Leçon, et elle vaut au-delà de D1** : une dette inscrite levée sur un seul de ses deux lieux reste une dette, et l'inscription la rend invisible **LEVÉE POUR DE BON le 17 novembre 2026, et cette fois la preuve est une course entière** : la course **44125534966** du prototype est allée au bout, ce qui n'était jamais arrivé depuis que D1 a été rouverte. L'étape « Dire quel Tesseract répond » annonce **`tesseract 5.5.1` / `leptonica-1.86.0`** — l'exécutable que l'application embarque, et non les 5.5.4 de Homebrew qui avaient rouvert la dette ; l'étape refuse de continuer si ce n'est pas lui qui répond. Les **quatre critères du CDC** sont mesurés avec ce programme-là : sidecar `tesseract 5.5.1 (fra)` en 149 ms, PDF de 500 pages ouvert en 6 ms, livre numérisé de 500 pages en 1 132 ms, reprise après arrêt forcé au pas 146/2000. **182 contrôles Rust réussis, 0 en échec**, et l'épreuve de bout en bout lit **500 passages sur 500** avec le moteur embarqué (`parLaCouche: 500, parOcr: 0, sansTexte: 0`). Les deux courses déploient l'archive épinglée par son empreinte et mettent son `bin` devant le PATH. **Une réserve, et elle ne rouvre pas la dette** : la ligne qui *listait* les tesseract joignables employait `command -v -a`, une forme que bash refuse, si bien que la liste annoncée ne s'imprimait pas — un défaut de **journal**, non de mesure, le refus lui-même ayant toujours fonctionné. Relevé le même jour sur cette course et corrigé au lot **0u sexies**, qui éprouve désormais la forme en la lançant. | — |
| D2 | ~~Textes de licence absents de l'application~~ — **levée** le 9 novembre (`0b6cc977`) | — |
| D3 | ~~Préséance des causes d'abstention non uniforme~~ — **levée** le 15 novembre 2026 (`3d2f566c`) : les sept causes passent en donnée, la préséance devient une liste ordonnée où `vivier_non_borne` tient son rang, et les deux branches de `rejouerParOracle` s'accordent. Deux garde-fous la tiennent fermée : aucune cause déclarée ne peut manquer à la préséance, aucune ne peut se décider à côté d'elle. Échéance posée le 14 novembre 2026, l'ancienne (« avant l'étape 1 ») — échéance posée par Christophe le 14 novembre 2026, l'ancienne (« avant l'étape 1 ») étant dépassée. Même sujet que 0x : dire la vraie cause plutôt qu'une cause plausible | — |
| D4 | 82 seuils de jugement écrits en dur (34 géométriques, 12 de lecture, 34 de structure, 2 d'alphabet), dont `LIGNES_POUR_UNE_COLONNE = 4` (priorité haute) et les huit poids de l'associateur | au fil des étapes 3 à 7 |
| D5 | Six seuils suspects d'être inversés par rapport à leur nom (`PENALITE_SAUT_CORROBORE`, `ACCORD_SUR`, `PRIME_DERNIERE`, `SEUIL_LISIBILITE`, `FEUILLES_A_DEUX_FOLIOS`, `PAGE_MAX`/`PAGE_MAXIMUM`) | à vérifier, étape 3 |
| D6 | « Rangées fantômes » de `rangeesDeTable` | avec l'étape 3 |
| D7 | **Le garde-fou existe** depuis le 10 novembre 2026 (lot 16) : il chronomètre le **corps** de chaque contrôle, là où le corps tourne, et lit le **délai résolu** par vitest ; aucun des deux n'est plus supposé. Deux erreurs antérieures de ce tableau sont corrigées par la mesure : les « trois contrôles de `outils/ingestion` qui dépassent leur délai » portent en réalité un délai de **300 000**, et le ×1,25 cité ici venait d'une durée affichée, qui compte les crochets que le délai ne borne pas. **La dette n'est pas levée pour autant**, et il reste trois choses, dans cet ordre fixé par Christophe le 10 novembre : le **lot 16b** (le corps du contrôle le plus serré du dépôt, 2 493 ms pour lire deux fois un PDF de cinq pages vides — comprendre et réduire, **sans toucher au délai**) ; puis la **barre à ×2** ; puis l'objectif **×3** après le lot 14 bis (lenteur des tests de lecture). D'ici là la barre vaut `null` : le garde-fou publie les marges et ne refuse rien | lots 16b, 14 bis, puis la barre |
| D8 | Clé du cache de lecture fondée sur chemin + taille + date, et non sur le contenu | plus tard |
| D9 | Épingle F3 (`critere-f3-orphelins-93-98`) : levée par la voie oracle + confirmation lien par lien | Étape 4 |
| D10 | Épingle « Tesseract absent » : levée par le repli correct quand Tesseract manque | **Étape 2** — reportée par Christophe le 14 novembre 2026 : c'est le repli quand Tesseract manque qui la relève, et il relève de l'étape 2 |
| D11 | `CLAUDE.md` promet encore Windows en trois endroits (tableau des intégrations continues, phrase sur « les trois systèmes », tableau du lot 0) | prochain lot de documentation |
| D12 | ~~Garde-fou du journal des autorisations (numéros consécutifs, lignes anciennes jamais modifiées) — **et, depuis le 11 novembre 2026, que chaque empreinte de commit citée existe dans l'historique Git**. Né d'une faute : l'entrée 37 annonce « `0ee45c0e` ou son équivalent », une empreinte **pariée avant le commit**, là où le vrai est `29d4ed06`. Un registre qui renvoie à rien ne prouve rien, et le journal étant en ajout seul, la correction ne peut venir que d'une entrée suivante.~~ — **LEVÉE le 16 novembre 2026**, en deux lots. **Moitié payée le 15 novembre (`f83d7320`, lot 0m)** : toute citation d'empreinte dans le registre, le journal des décisions, les décisions et la file est refusée si l'historique ne la porte pas, sauf si l'épingle la nomme pour ce qu'elle est. **Soldée le 16 novembre (lot 18)** : les numéros du registre sont consécutifs et croissants à partir de 19, aucune entrée n'a jamais été réécrite — vérifié sur les **35** versions passées du fichier, **36 entrées**, **zéro** réécriture — et aucune entrée ne peut disparaître, un trou que seule la mutation a montré. **L'historique Git tient lieu de relevé d'empreintes** : il prouve le passé entier au lieu de figer le présent, et ne laisse aucune donnée à tenir à jour ; une commande et non une par ligne, 108 ms pour les 35 versions. Reste **assumé** : le contrôle des réécritures se saute, en le disant, là où l'historique est tronqué — l'intégration continue ne récupère qu'un commit | — |
| D13 | Garde-fou « les phrases du CLAUDE.md sont-elles encore vraies ? » | en dernier |
| D14 | Fichiers non suivis d'anciens lots jamais commités : inventaire à faire | prochainement |
| D15 | « Assez de mots » du redressement rapporté à la page médiane : peut refuser une page couchée peu dense dans un document mixte | quand un tel cas sera au banc |
| D16 | Numérisations partielles de certains Aebersold (sections Bb, Eb, clé de fa absentes) : fait de contenu, pas de code | aucune action logicielle |
| D17 | Le crochet de pré-commit n'existe que sur la branche de travail ; la copie principale (sur `main`) n'est pas protégée. **Depuis le 16 novembre 2026, le crochet de pré-poussée (`crochets/pre-push`, lot 0c ter) partage exactement cette limite** : `core.hooksPath` est un réglage par copie, les crochets sont versionnés, et un crochet n'existe que là où la branche le porte. La dette n'est donc ni levée ni aggravée — elle couvre deux crochets au lieu d'un, et c'est dit plutôt que découvert à la fusion | à la fusion dans `main` |
| D18 | ~~Rang des deux CDC~~ — **levée** : v2.0 au rang 3 (`docs/cdc-normatif-v2.0.md`, `d8aac369` ; trois schémas devenus texte entre crochets à l'export), v24 au rang 4 | — |
| D19 | ~~Réglages et crochet non versionnés~~ — **levée** le 9 novembre (`212bfe07`) : `.claude/` est versionné depuis le 7 novembre sur la branche de travail ; le garde-fou compare désormais aux octets du commit ; le crochet ne s'accuse plus des chemins commençant par un point. Son absence sur `main` relève de D17 | — |
| D20 | ~~Décisions du 8 et du 9 novembre non écrites~~ — **levée** (`f49912a2`) ; celle du 8 novembre est une reformulation, pas un verbatim, et le dit | — |
| D21 | Siegfried (`sf`) est **embarqué** (hermétique, licence, avis de modification), mais **prouvé non appelé par l'exécution** le 10 novembre (faux `sf` journalisant en tête du `PATH`, document lu de bout en bout, zéro appel) : le graphe empaqueté depuis `outils/ingestion/src/moteur.ts` n'atteint pas `parSiegfried`. Brancher la chaîne sur Siegfried, avec preuve de l'appel (lot 0g) | après les étapes 1 à 3 |
| D22 | ~~Copie de bisect~~ — **retirée** le 9 novembre, après avoir sauvé huit bancs de mesure uniques (versés dans `outils/ingestion/mesures/`) ; l'inventaire des fichiers non suivis reste à faire sur les six autres copies du dépôt (D14) | — |
| D23 | **OUVERTE, et reformulée par la mesure du 11 novembre 2026.** Un endroit candidat peut battre la marque qui désigne vraiment les enregistrements, et ce n'est pas une affaire d'échantillon : sur un recueil de 41 pages à plancher abaissé, l'endroit retenu lit **le folio imprimé** — `17, 19, 23, —, 25, 27, 33, 35`, à deux erreurs près —, donc sept valeurs distinctes et croissantes, **75 % à l'échantillon comme à la relecture complète**, contre 66 % à la vraie marque, qui se lit moins bien. Sa note est méritée. **La note dit « cet endroit porte une numérotation », jamais « cette numérotation désigne les enregistrements ».** Deux correctifs ont été mesurés et n'y changent rien : l'**escompte** par le nombre d'apparitions (58 % contre 52 %, même vainqueur ; gardée sur `sauvegarde/escompte-d23`, non adoptée) et le **rejugement de la relecture complète** (75 % puis 75 % ; commité comme filet, voir ci-contre). La parenthèse « relecture complète 1,1,2,2,2,2,3,3 » de la version précédente désignait les **numéros de piste déduits**, non les valeurs lues : corrigé. **Piste à mesurer, sans rien appliquer** : un endroit dont les valeurs coïncident avec le folio lu de leur feuille **est** le folio, pas une marque d'élément | **étape 3** ; le plancher (lot 3c) **ne peut pas être adopté** tant que D23 n'est pas résolue |
| D24 | ~~`couche-texte.ts` appelle `getDocument` sans les ressources pdf.js~~ — **levée** le 10 novembre (lot 0h) : les deux appels les portent, `ressourcesPdfJs()` est passée dans son module pour qu'une lecture de couche texte ne charge pas `@napi-rs/canvas`. Mesuré : **3 documents sur 249** de la bibliothèque réelle réclament une police standard, et la lecture y est **identique à la décimale** — la dette coûtait un avertissement, pas de la justesse | — |
| D25 | **Un lien publié ne porte que son folio, jamais sa feuille physique** — `LigneInterpretee` garde `pageImprimee` et laisse tomber le `cliche: page.feuille` que `interprete.ts:244` avait pourtant calculé. Or **le § 3.3 l'interdit** : « une page se désigne par sa feuille physique, jamais par le folio imprimé (deux feuilles peuvent revendiquer le même) ». Mesuré le 11 novembre 2026 sur la version publiée du document de 116 pages : 25 folios y sont portés par deux feuilles (une `deduite`, une `lue`), et **12 de ses 48 liens** tombent sur l'un d'eux. **Mais dans la vue, aucun** : `lot.ts:310` construit sa table de folios par `numerosImprimes`, qui n'en attribue qu'aux feuilles **portant un élément** et par vote de ceux-ci — 48 feuilles, 48 folios distincts, zéro doublon. Les folios doublés sont ceux de l'interprète, dont 55 sur 116 sont `deduite`, et ils n'atteignent jamais l'écran. **Second trou, lui bien réel** : le Lecteur ne rend **jamais** `aVerifier` — ni `Lecteur.tsx` ni aucun de ses composants —, la marque n'existant qu'au Catalogue (vignette colorée) et en compte sur l'Accueil. Le garde-fou de `construireVue` (deux copies marquées, portée qui ne propage pas) est donc **invisible là où on lit** : si un folio était doublé dans la vue, les deux feuilles le montreraient sans un mot. La combinaison est **latente**, non constatée. **COMPLÉTÉE le 12 novembre 2026, et le mécanisme est trouvé.** La dette ne portait que les folios **doublés** ; il en manquait la moitié. Sur la même version publiée de 116 feuilles : **91 folios distincts seulement sont portés**, donc **25 sont portés par deux feuilles**, et surtout **10 liens publiés désignent un folio qu'AUCUNE feuille ne porte** — éléments 6, 8, 13, 18, **28**, 30, 35, 45, 47, 49, pour les folios 16, 20, 30, 40, **60**, 64, 74, 94, 98, 102. Vu en préparant l'écriture réelle : le lien 28 annonce le folio 60, qu'aucune feuille ne revendique, pendant que le folio 62 est porté par **deux** feuilles (61 et 63), sur quatre feuilles consécutives dont trois `deduite`. **Le mécanisme, qui n'était écrit nulle part** : 10 + 12 = **22**, et ces 22 éléments sont **exactement** les 22 liens publiés qui n'ont aucune feuille physique — l'ensemble coïncide à l'identique, pas approximativement. Autrement dit, **un lien publié perd sa feuille physique précisément quand son folio est porté par zéro ou deux feuilles**, et c'est la forme exacte de ce que le § 3.3 interdit. Le reste tient : ces folios sont ceux de l'interprète, 55 sur 116 étant `deduite`, et la vue n'en montre aucun doublon. **Vérification faite pour l'écriture de la version 4** : les folios 28, 38 et 44 — ceux des exercices 12, 17 et 20 rattrapés par la relecture — sont portés par **exactement une** feuille chacun, donc les trois nouveaux liens auront bien une feuille physique, contrairement à 22 des 48 anciens | **étape 4** (mode manuel) pour le trou du Lecteur ; **étape 5** pour la cause, qui est la source du folio ; mesurer d'abord, ne pas corriger |
| D26 | **`paquet-hermetique` ne voit que le chargement au démarrage.** Le contrôle « le paquet embarqué ne charge rien hors du paquet » est **purement statique** : `chargees` lance `otool -l` sur chaque Mach-O et lit ses `LC_LOAD_DYLIB` / `LC_LOAD_WEAK_DYLIB`. Cela dit ce que le chargeur ira chercher **au démarrage**, et **pas** ce qu'un `dlopen` tardif ajouterait en cours d'exécution. Ce reste n'était couvert que par la **vérification à la main** du 9 novembre — `vmmap` sur un processus vivant —, qui n'est pas un contrôle et ne se rejoue pas. Le nom du contrôle promet donc plus que ce qu'il vérifie | **étape 0**, technique — « reporter sans nommer, c'est oublier » (règle de Christophe, 11 novembre 2026) |
| D27 | **Le masque de code a lu une durée de vie Rust comme un littéral, et un garde-fou est devenu muet sans le dire.** `masqueDeCode` traite l'apostrophe de `<'_>` comme l'ouverture d'un littéral de caractère et blanchit ce qui suit. Mesuré le 21 novembre 2026 : dans `apps/app/src-tauri/src/roulement.rs`, 21 octets blanchis aux lignes 734 à 738 emportent la déclaration `#[cfg(test)] mod tests {`, donc `plagesJugees` n'y trouve aucune plage et le garde-fou des effacements du lot `0z bis` **n'y juge rien** : ses 15 `remove_dir_all` ne sont pas acquittés, ils ne sont pas lus. Portée : 59 fichiers Rust suivis, 4 portent une durée de vie anonyme, 1 perd du code ; des quatre garde-fous qui emploient `masqueDeCode`, seul celui des effacements lit du Rust, les trois autres ne lisent que du TypeScript où l'apostrophe est bien un délimiteur. La leçon est celle de la famille : un garde-fou aveugle ne dit pas « vert », il ne dit rien — et celui-ci disait vert. | ~~**lot `0z quinquies`**~~ — **levée le 21 novembre 2026** : le lexique de Rust est écrit dans `masqueDeCode`, `roulement.rs` est lu, et une mutation prouve qu'il redevient muet sans le correctif |
| D28 | **Un nom de version non validé peut faire effacer tout `DERIVES`, ou la racine du disque.** `retirer_document` (`apps/app/src-tauri/src/depot.rs:461`) fait `let _ = fs::remove_dir_all(self.racine.join(DERIVES).join(version))`, où `version` vient de deux données relues sur le disque — `pointeur.version` d'`actives.json` (ligne 438) et `lu["version_cible"]` de chaque fichier de travail (ligne 452) — sans aucune validation : ni chaîne vide, ni chemin absolu, ni `..`, ni nombre de composants. Mesuré le 21 novembre 2026 avec `rustc 1.100.0` : un composant vide vise tout `DERIVES`, un composant absolu **remplace** le chemin entier, donc `"/"` vise la racine du disque. Le `let _ =` avale jusqu'à l'erreur. Trouvé en ouvrant le périmètre du garde-fou des effacements au produit, et c'est précisément ce que l'ouverture devait permettre : la décision du 20 novembre, qui excluait le produit, l'aurait laissé invisible. | ~~**lot `0z septies`**~~ — **levée le 24 novembre 2026** : `nom_de_version` n'accepte qu'un seul `Component::Normal` égal au nom entier, appliquée aux **huit** sites où une version construit un chemin ; `retirer_document` rassemble et valide **avant** la première écriture, et un nom invalide refuse l'opération entière en nommant le fichier fautif et la valeur lue. Quatre contrôles, **huit mutations, huit ensembles de morts non vides**, l'épingle `depot-rs-nom-de-version-non-valide` levée. Les `let _ =` restent, par décision de Christophe : c'est la dette **D32** |
| D29 | **Une bibliothèque qui contient un lien symbolique ne peut pas aller à la corbeille d'un autre volume.** Sur le repli `CrossesDevices` de `deplacer_avec_repli`, `copier_entree` (`apps/app/src-tauri/src/depot.rs:101`) rend un `Err(ErrorKind::Unsupported)` explicite pour tout nœud qui n'est ni dossier ni fichier — lien symbolique compris, puisque `fs::symlink_metadata` ne suit pas les liens. **Le comportement est SÛR** : la copie échoue, l'original survit, et l'erreur est remontée. Mais la corbeille devient inatteignable pour cette bibliothèque dès que la corbeille est sur un autre volume, et l'utilisateur n'a pour l'instant que le message. Relevé le 21 novembre 2026 en vérifiant la condition que Christophe posait à l'exception de `retirer_entree` ; nommé sans être traité, sur sa demande. | **sans lot**, technique — à placer ; ne bloque rien, puisque rien n'est perdu |
| D30 | **L'exception accordée au vidage du cache repose sur une prémisse fausse, et le code qu'elle couvre est injoignable.** L'exception du produit inscrite dans `packages/banc/src/effacements-bornes.ts` justifie `vider()` (`outils/cache/src/index.ts:143`) par « c'est l'utilisateur qui vide son cache, à l'écran ». Mesuré le 24 novembre 2026 sur tous les fichiers suivis par git : cette fonction n'a **qu'un appelant, son propre contrôle**, et le moteur livré `apps/app/src-tauri/moteurs/chaine/moteur.js` ne l'embarque même pas — ses seize occurrences de « vider » sont la file d'attente de `outils/vision/src/relecture.ts` et des identifiants `divider`. Il n'y a donc ni écran, ni geste d'utilisateur, ni exposition. Ce qu'elle ferait si on la branchait reste sévère : elle efface **le dossier lui-même** et ne vérifie ni qu'il est sous le cache, ni qu'il n'est pas une racine. **Même constat pour `nettoyer()`** (ligne 109), sans appelant lui aussi, de sorte que le plafond de 50 Gio annoncé en tête du module n'est appliqué par rien. La leçon est celle de la famille, et elle vise une raison écrite plutôt qu'un chiffre : une exception de garde-fou qui s'appuie sur un geste d'utilisateur doit nommer l'écran qui le porte, sinon elle couvre ce que personne n'a mesuré. | ~~**lot `0z octies`**~~ — **levée le 24 novembre 2026** : `vider()` est **supprimée**, faute d'appelant, et son exception retirée du garde-fou ; le produit ne porte plus que sept sites exceptés, six entrées ; un contrôle neuf garde ce compte dans les deux sens et une mutation l'éprouve. La règle est posée par la [décision du 24 novembre 2026](decisions/2026-11-24-une-fonction-d-effacement-arrive-avec-son-appelant.md), qui cite celles du 20 et du 21 novembre sans les modifier. **Ce qui ne relevait pas de l'exception passe à la dette D33** : `nettoyer()` reste, sans appelant, et le plafond avec elle. Correction d'un fait de cette rangée, mesuré le 24 novembre : la racine du cache ne vient pas que d'`app_cache_dir()` — les **sept** exemples de `apps/app/src-tauri/examples/` passent tous `racine.join("cache")`, donc un dossier **dans la bibliothèque**, et c'est celui qui a réellement grossi. L'interface n'y touche toujours pas. Technique — l'exposition est nulle, ce qui peut valoir un déclassement ; la racine du cache, elle, est **sûre** par construction : l'hôte l'écrit depuis `app_cache_dir()` et la passe par un tuyau, l'interface n'y touche pas |
| D31 | **Une empreinte venue de l'interface fait paniquer l'hôte, et un nom d'image venu du moteur n'est pas validé.** `empreinte` arrive de l'interface dans une quinzaine de commandes de `apps/app/src-tauri/src/lib.rs` et **rien ne la valide** — ni `is_ascii_hexdigit`, ni `chars().all`, nulle part dans `apps/app/src-tauri/src/`. La seule garde, `empreinte.len() < 2` (`depot.rs:422`), compte des **octets**, et `&empreinte[..2]` (`:235`, `:249`, `:476`) tranche par octets. Mesuré le 24 novembre 2026 avec `rustc 1.100.0` sur « €a9f » : `len()` rend 4, la garde passe, le découpage **panique** — « end byte index 2 is not a char boundary; it is inside '€' (bytes 0..3 of string) ». Le modèle de validation existe déjà, et c'est un contrat : `empreinte: z.string().regex(/^[a-f0-9]{64}$/)`. Second défaut, même famille : `apercu_de_pages` (`lib.rs:281`) lit `page["fichier"]` dans la réponse du moteur et fait `std::fs::read(images.join(fichier))` **sans validation**, quand `image_de_page` (`:864`) et `relire_texte_page` (`:896`) passent le même genre de nom par `nom_image_page`. Un valideur, trois portes, deux branchées. **Correction du 25 novembre 2026, mesurée.** Cette description se trompait d'un chiffre en illustrant la confusion qu'elle dénonce : sur `"€a9f"`, `len()` rend **6**, pas 4 — six octets pour quatre caractères, un `€` en pesant trois. Quatre est le compte des **caractères**, et le message de panique cité ici même — « it is inside '€' (bytes 0..3 of string) » — le disait déjà. La conclusion ne change pas : la garde laisse passer, le découpage panique. **Et un troisième site, que cette dette ne nommait pas** : `titre_ou_empreinte` (`lib.rs`) coupait par `&empreinte[..empreinte.len().min(8)]`, où `min(8)` borne des **octets** — `"€€€"` fait neuf octets, l'indice 8 tombe dans le troisième `€`, et l'hôte paniquait là aussi. Les numéros de ligne cités plus haut ont bougé avec le réordonnancement de `0z septies` : les sites se retrouvent par leur contenu. | ~~**lot `0z nonies`**~~ — **levée le 25 novembre 2026**. Technique, **sécurité** ; sortie de l'inventaire du lot `0z septies`, qui ne traitait que le nom de version. `empreinte_de_document` (`depot.rs`) n'accepte que **64 chiffres hexadécimaux minuscules**, la règle du contrat `Empreinte` reprise mot pour mot, et elle garde l'entrée des **douze** commandes ; `deposer_source` et `retirer_document` valident à leur tour, et `source`, qui rend un chemin et ne peut donc rien refuser, coupe par **caractères** — plus un seul découpage par octets ne subsiste. `titre_ou_empreinte` coupe par caractères lui aussi. Les **trois** portes d'image passent par `nom_image_page` et **refusent** au lieu de réécrire ; le préfixe `pages/` a déménagé dans le port en ligne, dont la clé d'objet en a besoin, et un contrôle tient la requête du service **identique au bit près**. Huit contrôles neufs, **trois mutations, trois ensembles de morts non vides**, en clone jetable |
| D32 | **Le retrait d'un document peut laisser un état incohérent, et son compte rendu dit l'intention, non le résultat.** Dans `retirer_document` (`apps/app/src-tauri/src/depot.rs:421`), les deux effacements d'une version — les dérivés (`:461`) et le fichier de version (`:462`) — sont indépendants et tous deux avalés par un `let _ =` : on peut donc garder les dérivés sur le disque et perdre le fichier de version, donc des données que plus aucun écran ne montre, ou l'inverse. Le `remove_file` d'un fichier de travail (`:455`) est avalé alors que `travaux_retires` vient d'être incrémenté, de sorte que ce compte et `versions.len()` disent ce que l'hôte a voulu faire. Et le pointeur d'`actives.json` étant écrit **en premier**, un `?` plus loin rend une erreur quand le document est déjà invisible et ses versions déjà effacées, sans dire où il s'est arrêté. Relevé le 24 novembre 2026 en lisant `retirer_document` de bout en bout, à la demande de Christophe. La source, elle, part en dernier et à la corbeille : rien ne se perd. | **lot `0z decies`**, technique — ne bloque rien ; `0z septies` laisse ces trois points tels quels, sur le mot de Christophe |
| D33 | **Le cache n'a ni borne appliquée, ni propriétaire unique, et son chemin par défaut pend à un volume débranchable.** Mesuré le 24 novembre 2026. **Il y a quatre caches, pas un** : celui du module `@lienotheque/cache` (`LIENOTHEQUE_CACHE`, sinon `CACHE_PAR_DEFAUT`, **89 Mo**, 12 coins) ; son **repli** `join(process.cwd(), ".cache")`, qui écrit **dans la copie de travail** (**564 Ko**, cinq dossiers des deux copies) ; celui de l'application, `app_cache_dir()/lectures`, qui **n'existe pas** sur cette machine ; et le dossier `cache` **de chaque bibliothèque**, que les sept exemples de `src-tauri/examples/` passent par `racine.join("cache")` (**840 Ko** dans la Bibliothèque musicale, quatre coins), **sous aucun plafond**. Le produit n'emploie jamais `ouvrirCache` : le chemin lui vient de l'hôte par un tuyau, et `executant.ts` n'en prend que `sousDossier`, pour y creuser `lectures`, `vision-cases`, `vision-reponses` et `vision-structurelle`. Les plafonds de 50 Gio et 2 Gio vivent donc dans un module que l'application ne traverse pas, et **`nettoyer()` n'a aucun appelant** : rien ne les applique, rien ne pèse jamais. **Le plafond ne peut pas s'appliquer à la racine** : `emplacement-instantane.ts:24` place dans le coin `instantane` `bibliotheque.json` et les images de page **que lisent les écrans**, et une éviction du plus ancien les mangerait avant les lectures d'OCR ; en intégration continue, où il n'y a pas de disque externe, c'est le repli qui porte ce que les tests de rendu viennent d'écrire. S'y ajoutent : `CACHE_PAR_DEFAUT` **en dur** vers `/Volumes/Macbook Pro/lienotheque-cache`, nommé par l'audit v24 § 5.11 et jamais mis en file, **cause de tous les replis** — et donc des 877 s perdues au contrôle du 24 novembre ; `app_cache_dir()/lectures` plus `sousDossier(charge.cache, "lectures")`, qui ferait `lectures/lectures` par le chemin de l'application ; le commentaire orphelin d'`outils/cache/src/index.ts:72` ; et le renvoi « décision 6 » du contrôle du cache, qui ne désigne aucun fichier de `docs/decisions/` ni de l'archive gelée. Les disques, le 24 novembre : `/` 102 Gio libres, le volume USB 214 Gio libres sur 931, occupé à 77 %. Rien n'est près de déborder ; ce qui manque est une borne. | **lot `0z undecies`**, technique — ne bloque rien aujourd'hui, l'exposition étant une croissance sans borne et non un effacement. **Premier geste du lot : une proposition écrite de la liste des coins jetables et non jetables, avec la raison de chacun, que Christophe valide avant toute ligne de code.** `nettoyer()` et `peser()` sont gardées pour lui ([décision du 24 novembre 2026](decisions/2026-11-24-une-fonction-d-effacement-arrive-avec-son-appelant.md)) : elles n'effacent pas récursivement |

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
