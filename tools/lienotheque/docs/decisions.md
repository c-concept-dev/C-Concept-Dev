# Journal des décisions

| Date | Décision | Référence |
|---|---|---|
| 2026-10-02 | Stockage cloisonné par bibliothèque, recherche fédérée | CDC v2.0 |
| 2026-10-02 | Pas de réparation de l'ancienne base : réimport complet des livres au lot E | CDC v2.0 |
| 2026-10-02 | Réponses rédigées par Claude Haiku via le Worker existant ; AI Gateway optionnel | RCH-10 |
| 2026-10-02 | Sécurité sans saisie répétée pour les utilisateurs quotidiens (session longue durée) | SEC-02 |
| 2026-10-03 | Nom Liénothèque ; charte graphite et cuivre v3 validée ; logo géométrique (deux documents, L en réserve) | Charte v3 |
| 2026-10-03 | Jetons v3.0.1 : piste de progression sombre #3C4046, texte désactivé clair #5A5E63, liseré et pourcentage obligatoires sur la progression claire | Réserves CDC |
| 2026-10-03 | Kit UI v1.1 adopté comme référence ; logo vectoriel validé (IoU 0,977 avec la planche) ; jetons du kit fusionnés dans tokens.json | docs/ui-kit |
| 2026-10-03 | **Tauri 2 retenu le 3 octobre 2026 sur mesures Mac** (paquet 24,75 Mio dont 13,54 Mio de moteurs ; 4 critères tenus). Réserve : validation Windows obligatoire avant toute version livrée sous Windows | Lot 0, mesures ci-dessous |
| 2026-10-03 | Réserve Windows **levée sur les quatre critères** : ils passent tous sur `windows-latest` (exécution 37120499122). Reste ouvert : l'agencement d'un paquet Windows **installé**, non mesuré | Lot 0, mesures Windows ci-dessous |
| 2026-10-04 | Le **décalage des pages s'appuie sur tout le lot**, le vote local ne s'en écartant que de quatre | Section ci-dessous |
| 2026-10-04 | **La forme du repère commande le recadrage** : losange recadré en son cœur, bloc pris entier. C'est la recette qui la déclare | Section ci-dessous |
| 2026-10-03 | Recette F3 : la pastille est **à droite** du libellé, pas à gauche — relevé sur la page, corrigé en **v2** (REC-03) | Section ci-dessous |
| 2026-10-03 | `saut_max` compte désormais **les pages traversées** : un trou connu dans le lot ne fait plus écarter ce qui le suit | Section ci-dessous |
| 2026-10-03 | **Échantillon F7 mesuré** : le critère ×5 d'OPT-01 tient sur un scan non optimisé (F4, ×8,7), pas sur des sources déjà comprimées (F2 ×2,6, F3 ×1,9) | Section ci-dessous |
| 2026-10-03 | Noir et blanc 1 bit : **CCITT groupe 4**, encodeur écrit ici, libtiff comme oracle. JBIG2 en mode symboles refusé | Section ci-dessous |
| 2026-10-03 | **Playwright** retenu pour les tests de rendu : trois moteurs (Chromium, Firefox, WebKit), hors de `pnpm check`, dans un job d'intégration continue à part | Section ci-dessous |
| 2026-10-03 | Le port de dépôt aura **trois implémentations** : `node:sqlite` (tests et outillage), hôte Rust (application Tauri), SQLite en WebAssembly (version en ligne). Aucun code hors de l'adaptateur ne dépend de `node:sqlite` | Section ci-dessous |
| 2026-10-03 | Siegfried **téléchargé depuis la version publiée par son auteur**, version et empreintes figées dans le script des moteurs ; aucun tap Homebrew | Section ci-dessous |
| 2026-10-03 | Dépôt local sur **`node:sqlite`**, intégré à Node, plutôt qu'un module natif : `better-sqlite3` ne se construit pas sur le runner Windows (pas de Visual Studio). Node passe à **24** partout | Section ci-dessous |
| 2026-10-03 | **Stratégie de plateformes** : multiplateforme par conception, bêta macOS d'abord, transposition Windows ensuite, Linux hors périmètre | Section ci-dessous |
| 2026-10-03 | Moteurs Windows à 55,8 Mo **acceptés en l'état** ; leur optimisation attend la phase 2 | Mesures Windows |
| 2026-10-03 | Version minimale de macOS **alignée sur 26.0 pendant la bêta**, pour que l'application refuse proprement un Mac où Tesseract ne pourrait pas se charger. Avant toute sortie publique : Tesseract et ses dépendances compilés avec `MACOSX_DEPLOYMENT_TARGET=13.0` dans le workflow Tauri, puis retour du minimum à 13.0 | Section ci-dessous |
| 2026-10-03 | `tools/lienotheque/.gitignore` passe de 6 à 9 lignes : `target/`, `**/src-tauri/moteurs/`, `**/src-tauri/gen/`. Sans elles, la cible Rust et les binaires Tesseract entraient dans un dépôt public | Écart accepté |
| 2026-10-03 | Les tests Rust du prototype restent hors de `pnpm check` et tournent dans `lienotheque-tauri.yml` (Mac et Windows) : l'intégration continue ordinaire n'a ni Rust ni Tesseract | Écart accepté |


## Prototype du socle local — mesures du 3 octobre 2026

Mesuré sur **macOS 26.3, Apple Silicon (arm64)**, Tauri 2.12, Rust 1.99, Tesseract 5.5.1.
Reproductible : `python3 fixtures/generer-locales.py`, puis
`python3 apps/app/src-tauri/outils/preparer-moteurs.py`, puis
`cargo test --release --manifest-path apps/app/src-tauri/Cargo.toml`.

**Aucune décision n'est prise ici.** Ces chiffres sont les entrées de la décision « Tauri 2 ou
autre » ; ils ne la remplacent pas.

### Les quatre capacités exigées

| Critère du CDC | Résultat | Mesure |
|---|---|---|
| Ouvre un PDF de 500 pages | Oui | PDF natif (0,17 Mo) : ouverture **2 ms**. Livre numérisé, une image par page (76,8 Mo) : ouverture **322 ms**, accès à la dernière page **< 1 ms** |
| Lance un sidecar (Tesseract) | Oui | Moteur **réellement embarqué**, lancé depuis le paquet. Page A4 à 150 ppp en français : **107 ms** |
| Reprend un travail après arrêt forcé (JOB-02) | Oui | `kill -9` en cours de route ; le bail survit, expire 15 s après le dernier battement, puis reprise **au pas suivant**, aucun pas rejoué, tentative 2 |
| Lit un MP3 par plages via un serveur local | Oui | `206 Partial Content` avec `Content-Range` ; 64 Kio servis en **1 ms** sur une piste de 2,88 Mo |

### Taille d'installation, moteurs embarqués compris

Paquet `Liénothèque.app` (macOS arm64, profil `release`, `strip` et LTO activés) : **24,73 Mio**
(25,9 Mo décimaux). Depuis, `travail-long` est devenu un exemple Cargo et ne part plus dans le
paquet : **24,38 Mio**.

| Partie | Taille |
|---|---|
| Moteurs embarqués (15 bibliothèques + modèles `fra` et `eng`) | 13,54 Mio |
| Binaire de l'application | 10,08 Mio |
| Icône `.icns` | 0,64 Mio |
| Sidecar `tesseract` | 0,09 Mio |

Au lancement, l'application empaquetée occupe **83 Mo de mémoire résidente** et reste stable.
Elle s'ouvre bien, mais ses boutons n'ont pas été actionnés à la main : la capture d'écran n'était
pas autorisée sur cette machine. Les quatre capacités ont donc été vérifiées par les tests
d'intégration Rust, pas par l'interface.

Le CDC tablait sur « Tauri : quelques Mo ». C'est vrai de la coquille (environ 11 Mio sans les
moteurs) ; ce sont **les moteurs qui pèsent**, et chaque langue supplémentaire de Tesseract ajoute
1 à 5 Mo. Un moteur de reconnaissance de zones (ONNX, OUT-06) et Whisper (OUT-09) ne sont pas
compris dans cette mesure.

### Ce que le prototype a appris, au-delà des chiffres

- **Les binaires annexes ne suffisent pas.** `externalBin` de Tauri copie un exécutable, pas ses
  bibliothèques dynamiques. Sur macOS, Homebrew les cite par chemin absolu : il faut copier la
  fermeture des dépendances, réécrire les chemins en `@rpath`, ajouter deux `LC_RPATH` (un pour le
  développement, un pour l'agencement du paquet) puis resigner — toute modification invalide la
  signature sur arm64. C'est le rôle de `apps/app/src-tauri/outils/preparer-moteurs.py`, et c'est
  **du travail par système d'exploitation**, à refaire pour Windows et Linux.
- **La lecture par plages demande un `Content-Length`.** `tiny_http` passe en transfert fractionné
  au-delà de 32 Kio, ce qui le supprime ; un lecteur média ne sait alors plus se déplacer dans la
  piste. Corrigé en forçant le seuil, mais c'est un piège à retenir pour tout serveur local.
- **La reprise tient à l'écriture atomique.** L'état est écrit dans un fichier temporaire puis
  renommé : un `kill -9` ne laisse jamais un état tronqué. Sans cela, JOB-02 ne tient pas.
- **Le verrou est devenu un bail renouvelé.** Un verrou à durée fixe oblige à choisir entre un
  délai long (un travail interrompu paraît figé longtemps) et un délai court (un travail bien
  vivant se fait voler son verrou). Le travail bat donc toutes les 5 secondes et son bail expire
  15 secondes après le dernier battement : un processus tué cesse de battre et libère le travail en
  15 secondes, tandis qu'un processus vivant garde le sien indéfiniment. Deux battements peuvent
  être manqués avant que le bail ne tombe.

## Stratégie de plateformes

**Liénothèque est multiplateforme par conception.** macOS et Windows sont tous deux visés : aucun
code ni outil propre à un seul système n'entre dans le projet sans que son équivalent soit prévu.
C'est déjà le cas de `preparer-moteurs.py`, qui couvre les deux voies (réécriture `@rpath` et
signature sur macOS, fermeture de la table d'imports PE sur Windows).

| Phase | Ce qui est livré | Ce qui est seulement vérifié |
|---|---|---|
| **1 — tests et bêta** | macOS uniquement. Système de référence : **macOS Tahoe 26.3 (25D125), Apple Silicon** ; la bêta est validée sur cette version | Windows, par `lienotheque-ci.yml` à chaque poussée et par `lienotheque-tauri.yml` à la demande, pour que la portabilité ne régresse jamais |
| **2 — après la bêta Mac** | Transposition Windows menée en parallèle : installateur NSIS ou MSI, emplacement des DLL dans le paquet installé, optimisation des moteurs Windows (55,8 Mo aujourd'hui) | — |

**Linux reste hors périmètre**, comme dans le CDC.

### Version minimale de macOS

Le besoin propre de l'interface est **macOS 13** : les styles du kit emploient `color-mix`, absent
des WebKit antérieurs. Mais les moteurs embarqués viennent de Homebrew, qui compile ses bouteilles
pour le macOS de la machine : `tesseract` et ses bibliothèques portent tous `minos 26.0`. Une
application déclarant 13.0 s'installerait sur un Mac où la reconnaissance de texte échouerait au
chargement du sidecar, sans rien annoncer.

**Pendant la bêta**, `bundle.macOS.minimumSystemVersion` vaut donc **26.0** : l'application refuse
proprement de s'installer là où elle ne pourrait pas tenir sa promesse. C'est une contrainte des
moteurs, pas de l'interface.

**Avant toute sortie publique**, Tesseract et ses dépendances seront compilés avec
`MACOSX_DEPLOYMENT_TARGET=13.0` dans le workflow Tauri, sur le runner macOS — c'est là que la
chaîne de compilation est déjà en place et reproductible. Le minimum redescendra alors à **13.0**,
le besoin réel de l'interface.

Un test tient les deux bouts : `aucun_moteur_n_exige_un_macos_plus_recent_que_l_application` lit
`minimumSystemVersion` dans `tauri.conf.json`, puis le `minos` de chaque moteur embarqué, et refuse
tout moteur plus exigeant que l'application. Abaisser le minimum sans avoir recompilé les moteurs
fait échouer la construction, pas la bêta d'un utilisateur.

**Le minimum des moteurs suit la machine qui construit.** Le test l'a montré dès sa première
exécution : sur ce Mac (macOS 26.3), les bouteilles Homebrew portent `minos 26.0` ; sur le runner
de l'intégration continue, elles portent `26.4`. Un paquet construit là-bas qui déclarerait 26.0
promettrait donc plus qu'il ne peut tenir. `outils/minimum-macos.py --ecrire` relève la déclaration
au niveau des moteurs réellement présents, et le workflow Tauri l'appelle avant de construire —
modification locale au runner, jamais commitée. Sur la machine de développement, les deux valeurs
coïncident et le fichier n'est pas touché.

C'est un pansement, et il disparaîtra avec la compilation à cible fixe : une fois Tesseract bâti
avec `MACOSX_DEPLOYMENT_TARGET=13.0`, son minimum ne dépendra plus de rien.

### Mesures Windows du 3 octobre 2026

Obtenues par `.github/workflows/lienotheque-tauri.yml` sur `windows-latest` (x86-64), face aux
mêmes mesures sur `macos-latest` (arm64), à la même exécution. **Les quatre critères passent des
deux côtés : 10 tests réussis, 0 en échec.**

| Critère du CDC | Windows | macOS |
|---|---|---|
| PDF natif de 500 pages | ouverture 6 ms | ouverture 5 ms |
| Livre numérisé de 500 pages (77 Mo) | ouverture 1 357 ms | ouverture 1 121 ms |
| Sidecar Tesseract embarqué | v5.5.3, OCR français 192 ms | 5.5.3, OCR français 141 ms |
| Reprise après arrêt forcé (JOB-02) | reprise au pas suivant, aucun pas rejoué | identique |
| Lecture d'un MP3 par plages | 64 Kio en 2 ms | 64 Kio en 1 ms |

| Taille | Windows | macOS |
|---|---|---|
| Moteurs embarqués | 55,81 Mo (37 fichiers) | 14,17 Mo (19 fichiers) |
| Binaire de l'application | 14,23 Mo | 10,57 Mo |
| Icônes | 0,92 Mo | 0,67 Mo |
| **Total** | **70,96 Mo** (exécutable + moteurs + icônes) | **25,90 Mo** (paquet `.app`) |

Deux écarts à retenir :

- **Les moteurs pèsent quatre fois plus sous Windows.** La première exécution en embarquait même
  99,5 Mo : le script copiait tout le dossier d'installation de Tesseract. Il suit désormais la
  table d'imports des fichiers PE et n'en retient que la fermeture réelle, ce qui ramène à 55,8 Mo.
  L'écart qui reste vient du paquet lui-même : la distribution Windows de Tesseract lie des
  bibliothèques plus grosses que celles de Homebrew. Le réduire encore relève du choix de la
  distribution de Tesseract, pas du socle.
- **Les deux totaux ne se comparent pas tout à fait.** macOS mesure un paquet `.app` complet ;
  Windows mesure l'exécutable et ses moteurs, sans installateur. Un paquet NSIS ou MSI reste à
  construire et à peser, et c'est là que se tranchera l'emplacement des DLL.

### Lever la réserve Windows

Aucune machine Windows n'était disponible le 3 octobre 2026. La vérification est passée par
`.github/workflows/lienotheque-tauri.yml`, déclenchable à la main, qui refait sur `windows-latest`
exactement ce qui a été fait ici : fixtures fabriquées à la volée, moteurs embarqués, quatre
critères éprouvés, paquet construit et pesé. Son résumé d'exécution porte les chiffres, repris
ci-dessus.

Sa première exécution a échoué des deux côtés, pour trois raisons qui valaient d'être trouvées :
sans police vectorielle, Pillow retombait sur sa police bitmap de repli et fabriquait des fixtures
fausses en silence (OCR illisible, livre numérisé trois fois trop léger) ; `pnpm --filter … tauri`
cherchait un script qui n'existait pas ; et le seuil de poids du scan était trop serré. Le
générateur de fixtures s'arrête désormais net s'il ne trouve aucune police.

L'embarquement des moteurs y suit l'autre voie : sous Windows le chargeur cherche les DLL dans le
dossier de l'exécutable, donc `preparer-moteurs.py` les y pose sans rien réécrire — ni `@rpath`,
ni signature. Reste ouvert : **où poser ces DLL dans un paquet Windows installé**, puisque Tauri
range le binaire annexe à côté de l'exécutable et les ressources ailleurs. Le workflow mesure
l'exécutable et ses moteurs, pas un installateur.

### Ce qui n'est pas mesuré

- **Linux**, hors périmètre.
- L'installateur Windows (NSIS ou MSI) et l'emplacement des DLL dans le paquet installé : phase 2.
- La signature et la notarisation, qui changent la taille et la procédure de distribution.
- Les autres moteurs du lot C : ONNX (OUT-06), Whisper (OUT-09).

## Centrage du premier lancement — mesures du 3 octobre 2026

Mesuré dans le navigateur, écart entre le centre du contenu et le centre de la fenêtre :

| Largeur de fenêtre | Panneau d'accroche | Zone de dépôt |
|---|---|---|
| 820 px | 0 px | 0 px |
| 1024 px | 0 px | 0 px |
| 1600 px | 0 px | 0 px |

Le décalage visible sur les captures livrées le 3 octobre venait de la capture, pas de la mise en
page : le volet avait repris sa largeur propre (1024 px) après une émulation à 1400 px, et l'image
figée de l'ancienne disposition s'y retrouvait réduite — 700 × 800 ÷ 1024 = 547, exactement le
centre observé. Les mesures DOM n'ont jamais montré d'écart.

Le centrage tient à trois règles : largeur bornée, `margin-inline: auto` et une colonne unique.
`test/mise-en-page.test.ts` les garde à toutes les largeurs, requêtes de média comprises — jsdom
ne calculant aucune mise en page, c'est la règle qui est tenue, pas le pixel. Un test au pixel
près demanderait un vrai navigateur (Playwright), non installé.

## Stockage local : `node:sqlite` plutôt qu'un module natif

Le dépôt local a d'abord été écrit sur `better-sqlite3`. Il se construit sans peine sur ce Mac,
mais l'intégration continue l'a refusé sur `windows-latest` : `node-gyp` n'y trouve aucune
installation de Visual Studio et le paquet se replie sur une compilation depuis les sources.

Plutôt que d'installer une chaîne de compilation C++ sur trois systèmes, le dépôt emploie
**`node:sqlite`**, livré avec Node : même moteur SQLite, aucune dépendance à installer, aucune
compilation. C'est la même logique que la stratégie de plateformes — rien de propre à un système
sans son équivalent prévu — appliquée aux outils de construction.

Deux conséquences assumées :

- **Node 24 partout.** `node:sqlite` n'est utilisable sans drapeau qu'à partir de Node 23.4 ;
  les deux workflows et `engines` passent donc de 22 à 24. Node 24 est la version d'appui courante.
- **Une interface marquée expérimentale.** Le module reste annoncé comme tel par Node : son
  interface peut bouger. Le dépôt ne l'emploie qu'à un endroit, derrière le port du noyau — en
  changer ne toucherait que `packages/depot-sqlite`.

`node:sqlite` n'offre pas d'aide aux transactions : le dépôt en a une, de six lignes, qui
enveloppe `BEGIN`, `COMMIT` et `ROLLBACK`.

### Trois implémentations pour un seul port

`node:sqlite` n'est pas le stockage de Liénothèque : c'est celui des tests et de l'outillage. Le
port de dépôt du noyau en aura trois, et c'est pour cela qu'il existe :

| Implémentation | Pour | Lot |
|---|---|---|
| `node:sqlite` | Tests, bancs d'essai, outils en ligne de commande | C |
| Hôte Rust | Application de bureau Tauri, qui porte déjà SQLite | C, D |
| SQLite en WebAssembly | Version en ligne, dans le navigateur | E |

**Aucun code hors de l'adaptateur ne dépend de `node:sqlite`.** Le garde-fou
`packages/banc/test/architecture.test.ts` le vérifie à chaque `pnpm check` : il refuse tout import
du module hors de `packages/depot-sqlite`, s'assure que l'adaptateur l'emploie bien — sinon il
ne garderait rien — et que le noyau n'importe aucun paquet de stockage.

### Siegfried : version publiée, empreinte figée

Pas de tap Homebrew. `outils/preparer-moteurs.py` télécharge la version publiée par l'auteur sur
GitHub (**1.11.9**), refuse tout ce dont l'empreinte SHA-256 ne correspond pas à celle inscrite
dans le script, et embarque le binaire avec le fichier de signatures PRONOM `default.sig`
(216 Ko, extrait de l'archive de données). Même procédé en local et en intégration continue —
macOS, Windows et Linux ont chacun leur archive et leur empreinte.

Changer de version, c'est relever les nouvelles empreintes et les inscrire : rien n'est jamais
téléchargé sans contrôle.

## Tests de rendu : Playwright et trois moteurs

jsdom n'a pas de moteur de mise en page : il sait qu'un élément existe, pas où il tombe à
l'écran. Toute exigence de placement — contenu centré, rien qui déborde — y est invérifiable.
Playwright mesure.

Trois moteurs, qui sont ceux des trois cibles : **WebKit** est celui de la vue intégrée de
macOS, **Chromium** celui de Windows, **Firefox** le témoin indépendant qui attrape ce que les
deux autres pardonnent (PLT-09). Les tests tournent sur la version construite servie par
`vite preview`, pas sur le serveur de développement : c'est ce qui est livré qu'on mesure.

Hors de `pnpm check`, qui doit rester rapide et tourner sur trois systèmes : job séparé
`navigateurs` dans `lienotheque-ci.yml`, un seul système, les moteurs en cache sur la version de
Playwright. En local, `pnpm --filter @lienotheque/app run test:navigateurs`.

**Premier résultat : Firefox a trouvé un défaut que Chromium cachait.** Le logo du premier
lancement y était large de 0 pixel, donc invisible. Le titre est un élément de grille sous
`justify-items: center`, donc de largeur indéfinie, et le `width: 100%` de l'image n'avait rien à
quoi se rapporter ; Chromium s'en tirait par la taille intrinsèque du SVG, Firefox non. Le titre
porte désormais une largeur explicite, et un test mesure la boîte du logo dans les trois moteurs.

Le centrage, lui, est mesuré à **un demi-pixel** près — les moteurs arrondissent, ils ne
décentrent pas — sur trois largeurs de fenêtre (820, 1024, 1600 px) et dans les deux thèmes qui
ont une mise en page propre, clair et hybride.

## Noir et blanc 1 bit : groupe 4, et pourquoi pas JBIG2

@jsquash couvre AVIF, WebP, JPEG et PNG — rien pour le bilevel compressé. Mesuré sur cinq pages
réelles de F2, reconstituées à partir des bandes du PDF d'origine (2465 × 3520, environ 9 %
d'encre ; la reconstitution a été vérifiée à l'œil, elle rend des pages exactes) :

| Encodage | Cinq pages | Rapport au groupe 4 |
|---|---:|---:|
| Flate, tel que le PDF d'origine le stocke | 459 213 o | 2,41 |
| PNG 1 bit | 341 097 o | 1,79 |
| WebP sans perte | 272 994 o | 1,43 |
| **CCITT groupe 4 (TIFF)** | **190 816 o** | **1,00** |

Le groupe 4 n'est pas marginalement meilleur : il tient en **1,79 fois moins** que le PNG 1 bit et
**2,41 fois moins** que l'original. Sur les 508 pages de F2, cela ferait environ 19 Mo contre 67 Mo
aujourd'hui. L'aller-retour est identique au bit près sur les cinq pages — le groupe 4 est sans
perte par construction, et c'est vérifié, pas supposé.

**Retenu : CCITT groupe 4 (ITU-T T.6), à l'intérieur du PDF.** C'est le filtre 1 bit natif du
format, ce qui règle l'affichage sans rien ajouter : pdf.js, déjà présent pour la couche texte,
décode `CCITTFaxDecode` quand il rend la page. Vignettes et aperçus continuent de sortir en
WebP ou AVIF par @jsquash, à partir du raster décodé.

Il ne manque donc que **l'encodeur**. Deux voies :

1. **L'écrire ici.** T.6 est figé depuis 1988 et l'encodeur est la moitié simple du codec : c'est
   nous qui choisissons les modes de codage. libtiff sert d'oracle — notre sortie doit se
   redécoder en pixels identiques et rester à quelques pour cent de la sienne en taille.
2. **libtiff en WebAssembly.** Un binaire de plus à produire, à livrer et à suivre sur trois
   plateformes, pour n'obtenir que l'encodeur.

**Je retiens la première**, et la version en ligne n'aura pas de WebAssembly à télécharger pour
cela.

**JBIG2 en mode symboles est refusé.** Il gagnerait deux à quatre fois sur le groupe 4, mais en
remplaçant chaque forme reconnue par un représentant : c'est ce qui a interverti des chiffres dans
des documents numérisés, sans que rien ne le signale à l'écran. Pour une bibliothèque dont le
métier est la fidélité à l'original, c'est inacceptable. Le mode générique sans perte, lui, est
défendable, mais il demanderait jbig2enc (C++, Leptonica) en WebAssembly **et** un décodeur dans
la visionneuse, pour un gain réel mais modeste sur le groupe 4 : à reconsidérer au lot E si le
poids des pages devient la contrainte qui commande.

## Échantillon F7 : ce que l'optimiseur gagne vraiment

Le CDC ne fournit pas F7. Il a été prélevé sur les fixtures, cinq pages par nature, et mesuré par
`outils/optimiseur/test/mesures-f7.test.ts` — qui échoue si le gain s'effondre, et dont la sortie
est recopiée ici.

| Fixture | Nature | Source | Après | Gain |
|---|---|---:|---:|---:|
| F2 | Scan noir et blanc, déjà en Flate | 459 213 o | 177 210 o | **×2,59** |
| F3 | Scan gris, déjà en JPEG, 1275 × 1754 | 1 851 000 o | 987 214 o | **×1,87** |
| F4 | Scan lourd, JPEG 1786 × 2410, 1,1 Mo la page | 5 377 831 o | 616 399 o | **×8,72** |
| F1 | PDF natif, couche texte | — | — | **×1** |

**Le critère d'OPT-01 — gain ≥ ×5 sur les scans de référence — tient sur F4 et pas sur F2 ni F3.**
Et la raison n'est pas l'encodeur : notre groupe 4 sort **7 % plus petit que celui de libtiff** sur
les mêmes pages, au pixel près. Elle est dans les sources. F4 est un scan lavé de toute
compression sérieuse, 1,1 Mo la page : il y a du gras à retirer, et on en retire ×8,7. F2 est déjà
du 1 bit comprimé, F3 déjà du JPEG : ils sont près de leur plancher, et aucun encodeur n'en tirera
×5 sans abîmer la page.

Autrement dit, le ×5 mesure la prodigalité de la source autant que le travail de l'outil. Il est
tenu là où il y a du mou. Là où il n'y en a pas, le forcer voudrait dire binariser un gris ou
descendre une résolution — ce que l'optimiseur ne fait pas : OPT-04 l'interdit, et la binarisation
appartient au Redresseur (OUT-03, lot D), sous l'œil d'OPT-03.

Les rapports estimés affichés avant envoi (OPT-06) vivent dans `packages/contrats/src/optimisation.ts`,
une seule table pour l'Inspecteur et l'Optimiseur, et volontairement prudents : annoncer un poids
trop lourd vaut mieux qu'une facture trop légère.

**F4 n'a pas de couche texte** : 143 images JPEG 8 bits et pas une police. C'est un scan, pas un
PDF natif — relevé en mesurant, contre l'attente.

## Port du prototype de lecture de repères : 95 sur 95

`docs/prototypes/ocr_methode.py` a servi d'oracle, étape par étape. Dès les quatre premières
pages de F3, le port rend exactement ce que lui rend : mêmes numéros, mêmes pastilles, mêmes
provenances, mêmes confiances. Sur les 29 pages :

| Critère | Référence | Port |
|---|---|---|
| Éléments reliés à la bonne piste | 95 | **95** |
| Éléments reliés à la mauvaise piste | 0 | **0** |
| Pages imprimées absentes du lot | 30 et 31 | **30 et 31** |
| Médias sans page | 93 à 98 | **93 à 98** |

REC-06 demande des scores au moins égaux aux prototypes : ils le sont.

### Deux choses ont changé en route, et pour de bonnes raisons

**La recette disait la pastille à gauche du libellé ; la page la montre à droite.** Vérifié sur
la page 5 de F3 : le libellé, puis le losange sombre à chiffres clairs, à sa droite. Le prototype
lisait bien à droite — c'est la recette qui se trompait. Comme REC-03 veut qu'une modification
crée une version, la v1 reste au dépôt telle qu'elle était et la **v2** porte la correction ;
l'historique est ainsi consultable, et un résultat produit par la v1 reste lisible comme tel.
L'interpréteur, lui, honore `position` à la lettre : la recette est une donnée, et une donnée
fausse doit donner un résultat faux, sans quoi elle ne servirait à rien.

**`saut_max` compte maintenant les pages traversées.** Le prototype autorisait un saut de 8
numéros, en dur. La recette dit 6, et avec 6 les trois derniers éléments de F3 étaient écartés :
le saut de 92 à 99 enjambe les pages 30 et 31, absentes du lot. Un écart en entraînait deux
autres, et les médias 99 passaient pour orphelins. La règle retenue est que `saut_max` vaut pour
un pas de page : entre deux éléments séparés de trois pages, le saut permis vaut trois fois
`saut_max`. L'interpréteur sait déjà quelles pages manquent — il n'y a aucune raison qu'il
s'étonne ensuite de ce que leur absence provoque. Sur une page consécutive, rien ne change : un
saut de 40 reste un saut de 40.

## Deuxième corpus : ce que Westwood a appris à l'interpréteur

F4 est une méthode photographiée en doubles pages, posée de travers, sans couche texte et sans
libellé devant ses numéros. La porter n'a demandé aucune branche de code : la recette v4 la
décrivait déjà. Elle a en revanche révélé trois choses que F3 cachait.

### Le décalage des pages se vote sur tout le lot

Mesuré sur les 143 clichés : le décalage entre le numéro imprimé et le rang attendu vaut **0 sur
112 pages**, et toutes les autres valeurs sont des accidents isolés — dont un à −200, qui donnait
une page négative et faisait refuser le résultat par son propre contrat.

Un livre n'a qu'un décalage, ou presque. Il est donc voté d'abord sur le lot entier, puis affiné
page par page sur une fenêtre, mais **seulement à quatre près du décalage général**. Une lecture
isolée et aberrante ne renumérote plus un chapitre. L'exception reste le décalage qui augmente
durablement : celui-là veut dire que des pages manquent au lot, et on dit lesquelles.

### Une pastille est une surface, pas une ligne

La première mesure de présence regardait la profondeur du sombre et son étalement en largeur.
Une ligne de portée traversant la zone passait donc pour un bloc. Elle compare maintenant
l'assombrissement **moyen** de la zone — une ligne n'y pèse presque rien, un bloc beaucoup — et
le plus petit des deux étalements, en largeur et en hauteur. Une barre verticale ne passe pas
davantage.

### La forme du repère commande le recadrage

C'est le défaut le plus instructif de ce lot. En généralisant le lecteur pour le bloc de
Westwood, j'avais perdu un geste propre au losange de F3 : **les coins d'un losange sont du
fond**, et les garder entoure les chiffres de pointes noires que l'OCR ne sait plus lire.

F3 est alors tombé de 78 pastilles lues à 6 — **sans que son résultat bouge d'un élément**, parce
que sa recette fait coïncider numéro de piste et numéro d'élément : le repli donnait la même
réponse. Le défaut était invisible sur le corpus qui l'a produit, et aurait été fatal sur celui
où les deux numéros divergent.

Le recadrage suit désormais le `motif` déclaré par la recette : `losange_sombre_chiffres_clairs`
est recadré en son cœur, `bloc_sombre_chiffres_clairs` est pris entier, et sa partie droite seule
quand une `etiquette_disque` occupe sa gauche.

### Ce que la lecture de F4 donne

Sur les 143 clichés, soit 286 pages après coupe :

| Mesure | Valeur |
|---|---:|
| Pages préparées (rotation, coupe, verso, binarisation) | 286 en 105 s |
| Pages dont le numéro imprimé est lu | 171 / 286 |
| Décalage dominant | **0**, sur 112 pages |
| Éléments lus puis numérotés | 661 |
| Éléments écartés, faute d'une place forcée | 65 |
| **Éléments sur la bonne page**, comparés au relevé du prototype | **447 / 460** |
| Pastilles vues / lues | 172 / 113 |
| Pages absentes du lot | 0 |

Le numéro de page n'est lu que sur six pages sur dix, et cela suffit : le décalage est voté sur
tout le lot, et il est unique. Les treize éléments mal placés se répartissent en deux groupes,
l'un à −21 pages et l'autre à −1, signe de deux lectures de numéro égarées plutôt que d'un défaut
de méthode.

### Attribution des pistes : la suite entière, pas une pastille à la fois

Un repère lu n'est pas une vérité : un chiffre clair sur fond sombre se lit mal, et deux éléments
voisins peuvent porter la même piste. On ne décide donc pas repère par repère, mais sur toute la
suite à la fois — la meilleure attribution est celle qui explique le mieux l'ensemble des
lectures, sous les pas que la recette autorise. Une lecture isolément fausse se trouve corrigée
par ses voisines.

Trois choses se sont révélées en route, chacune corrigeant une erreur de principe.

**Ce que la recette déclare doit peser dans la décision, pas seulement servir de repli.** F3
déclare que la piste porte le numéro de l'élément. Tant que ses repères n'étaient lus qu'à moitié,
cette règle s'appliquait en repli et donnait le bon résultat ; dès que tous les repères ont été
lus, le repli n'était plus jamais atteint et la connaissance était perdue. Le numéro d'élément
compte désormais comme une lecture supplémentaire, de poids moitié : une indication forte, mais
indirecte.

**Un écart entre deux numéros est un pas de piste légitime.** F3 n'autorise qu'un pas de 1, mais
les pages 30 et 31 manquent au lot, et avec elles six éléments et les six pistes qu'ils ouvraient.
La suite doit pouvoir les enjamber — sans quoi les trois derniers éléments du livre se retrouvent
six pistes trop bas, et six médias passent pour orphelins. La règle vaut quand la recette déclare
la coïncidence entre piste et numéro, et pas autrement.

**Un élément sans repère et sans piste précédente n'a pas de piste.** Lui donner la piste 1 par
défaut inventerait un lien : les quatre-vingts pages de F4 antérieures au premier repère se
retrouvaient attachées à la piste 1. `piste` est donc facultative dans une ligne interprétée, et
une ligne sans piste n'entre pas dans les appariements — elle n'est pas douteuse, il n'y a
simplement rien à apparier.

### Lire un repère : la forme la plus pleine, puis les autres

Sur F4, l'étiquette « CD1 Piste » est imprimée en sombre sur clair **à côté** du pavé qui porte le
chiffre, lui clair sur sombre. Prendre la plus grande forme sombre de la fenêtre les réunit et
noie le chiffre ; n'en prendre qu'une, si bien choisie soit-elle, fait manquer les pages où le
découpage tombe autrement.

On propose donc trois formes et on les lit toutes : la plus **pleine** à la taille du numéro — un
pavé occupe sa boîte, une lettre ou un trait de portée non —, la plus **grande** d'un seul tenant,
et la boîte de tout ce qui est sombre. C'est le vote qui tranche. Mieux vaut trois lectures dont
deux fausses qu'une seule qui manque.

**À égalité de voix, la lecture la plus longue l'emporte** quand l'autre en est la fin. Les votes
sur un repère de F4 donnaient exactement `[13, 13, 13, 3, 3, 3]`, et départager par la plus petite
valeur choisissait 3. Perdre le chiffre de tête, collé au bord du pavé, est l'échec courant d'un
moteur d'OCR ; en inventer un est rare. Et un chiffre de tête perdu reste utile : « 4 » lu pour
« 14 » appuie encore la piste 14, là où un repère illisible n'appuie rien.

### Un lot de trois cents pages ne doit rien laisser derrière lui

Le lecteur de repères créait un dossier temporaire et une image par appel d'OCR, sans jamais rien
effacer : **58 598 dossiers et 41 Gio**, et le disque de la machine rempli. Un seul dossier par
exécution désormais, et chaque image effacée dès qu'elle a été lue. Un contrôle l'exige : il lance
une lecture et vérifie que le dossier est rendu vide.

### Segments : un décompte annonce ce qui suit

Découper un média à ses silences permet de situer chaque élément dans sa piste, donc de commencer
la lecture au bon endroit. Tout se mesure sur l'énergie du signal par tranches de cinquante
millisecondes, et le seuil est **relatif au morceau** : un disque gravé fort et un disque gravé
bas n'ont pas le même silence.

Les médias de F4 ont montré un motif que je n'attendais pas. Chaque piste s'ouvre sur un fragment
sonore très bref — un décompte —, puis le premier élément, puis un second décompte, puis le second
élément. Rattacher les fragments trop courts à ce qui les précède donnait **trois segments sur
toutes les pistes**, quelle que soit la piste. Un décompte n'appartient pas à ce qu'il suit : il
**annonce ce qui vient**. Rattaché au segment suivant, le découpage tombe juste.

Mesuré sur un média sur six du disque 1 de F4, comparé au nombre d'éléments que le prototype
attribue à chaque piste :

| Mesure | Valeur |
|---|---:|
| Pistes découpées au bon nombre de segments | **12 / 16 (75 %)** |
| Pistes où un élément se scinde en deux | 3 |
| Pistes où cinq éléments n'en font que deux | 1 |

Le décodage audio n'appartient pas au produit : `decouper` ne prend que du PCM et ne sait rien des
formats. L'application de bureau le tirera de son hôte, comme le dépôt tire sa base du sien. Le
contrôle décode par l'outil du système, et se saute proprement là où celui-ci ne peut pas servir —
un bac à sable lui refuse volontiers les services audio.

**Et quoi qu'il arrive, aucune position de départ n'est inventée** (ANC-03). Le contrat ne connaît
que deux cas : le segment est connu, avec ses bornes, ou il est inconnu — et la lecture commence
alors au début de la piste, en le disant. Il n'y a pas de place pour une position approchée.

### Un numéro réparé n'est pas un numéro lu

Les numéros rétablis par interpolation ou par leur fin portent une confiance réduite de trois
dixièmes. Ils restent reliés, mais passent sous le seuil de la recette et vont à « Vérifier » —
c'est précisément ce que cet écran est là pour recevoir. Le prototype, lui, les comptait
automatiques.
