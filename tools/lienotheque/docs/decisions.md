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

## F4 : état du critère et écarts relevés

Le critère d'A5 — au moins 83 premiers éléments sur 92 et 89 pages sur 92 — **n'est pas tenu**. Il
a été approché par deux itérations guidées par l'oracle, selon la méthode convenue : faire tourner
`docs/prototypes/westwood_*.py` sur les mêmes clichés, relever ce qu'ils détectent élément par
élément, et comparer.

### Ce que l'oracle a appris, et qui contredisait mes hypothèses

**Chaque élément d'une piste porte son repère, pas seulement le premier.** La piste 1 couvre les
éléments 123 et 124, et tous deux portent « CD1 Piste 1 ». Il y a donc environ deux fois plus de
repères que de pistes, et c'est le pas de 0 — deux éléments sur la même piste — qui les réunit.
J'attribuais implicitement un repère à un début de piste.

**La fenêtre de recherche s'aligne sur le bord droit du numéro**, et s'étend vers la gauche sur
2,6 fois sa hauteur. Les numéros sont composés fer à droite dans leur marge, et le repère suit
leur alignement. Ma fenêtre, centrée sur le bord gauche et deux fois plus large, ramassait le
voisinage.

**La recette décrit le cliché entier, pas la demi-page.** `marges_exterieures: 0,2` vaut pour la
double page ; sur une page coupée, la même marge occupe deux fois la part de largeur. Mon filtre
de marge était deux fois trop étroit et écartait des numéros d'élément parfaitement lisibles.

### Où cela mène

Mesuré sur treize clichés, pages imprimées 66 à 92, où l'oracle relève 27 repères :

| Itération | Repères retrouvés | Faux positifs |
|---|---:|---:|
| Avant | 17 / 27 (63 %) | 3 |
| 1 — fenêtre alignée sur l'oracle | 20 / 27 (74 %) | 3 |
| 2 — marge de la demi-page corrigée | **21 / 27 (78 %)** | 8 |

Et un fait qui change la nature du problème : **les repères manquants ne sont pas des repères
ratés, ce sont des numéros d'élément que je ne lis pas du tout**. Sur les éléments que je lis, la
détection de repère est complète. Ce qui manque est le rendement de lecture des numéros dans la
marge, là où l'oracle emploie une passe dédiée à pleine résolution.

Sur le livre entier, la mesure complète d'alors donnait 16 premiers éléments justes sur 92 et
21 pages sur 92. Les deux itérations convenues étaient faites ; la suite demandait de porter les
trois passes successives du prototype, ce qui sortait du cadre fixé.

**Cette conclusion était fausse, et c'est la mesure du 4 octobre qui l'a montré.** Les numéros
n'étaient pas durs à lire : une partie des clichés était simplement mal orientée. Voir
« L'orientation d'un lot se vote » plus bas.

### Ce qui marche, et qu'il faut garder en tête

La chaîne elle-même est juste : elle rend **95 sur 95 sur F3**, sans une seule branche propre à un
document, et sur F4 elle place correctement la piste 14 sur l'élément 189 — contre le nom du
fichier, qui dit 191. C'est le critère de REC-05, et il est tenu.

### Un numéro réparé n'est pas un numéro lu

Les numéros rétablis par interpolation ou par leur fin portent une confiance réduite de trois
dixièmes. Ils restent reliés, mais passent sous le seuil de la recette et vont à « Vérifier » —
c'est précisément ce que cet écran est là pour recevoir. Le prototype, lui, les comptait
automatiques.

## Les mots du schéma n'ont pas de genre

Le schéma d'une bibliothèque fournit les mots — « élément », « clause », « diapositive » — au
singulier et au pluriel, mais pas leur genre. Toute tournure qui en demande un est donc fautive
dès qu'on change de domaine : « cet élément » devient « cet clause ».

Règle retenue pour tous les écrans : **aucune construction qui demande le genre**. On écrit
« Note — clause 401 » et non « Note sur cette clause », « Aucun enregistrement relié » et non
« Cet élément n'a pas d'enregistrement ». Un contrôle du Lecteur monte une bibliothèque dont les
mots sont féminins (« clause », « plage ») précisément pour que ces fautes apparaissent.

C'est la contrepartie de la règle 1 : si le vocabulaire vient des données, la grammaire qui
l'entoure doit s'en passer.

## Les écrans : ce que les trois moteurs ont trouvé

Les tests de rendu ne doublent pas les tests de composants : ils mesurent ce que jsdom ignore —
contrastes réels, fonds calculés, mise en page sous contrainte. Quatre défauts qu'eux seuls
pouvaient voir.

**Un contrôle qui ne vérifiait rien.** Le test « un seul élément cuivre plein par écran »
interrogeait `--ln-accent`, une variable qui n'existe pas : il rendait donc toujours un verdict
favorable. Il lit maintenant `--ln-action-background`, **exige que la couleur existe**, et compte
exactement un porteur. Un contrôle qui ne trouve pas sa référence doit échouer, jamais passer.

**Du texte posé sur la photo.** En hybride, le titre de la liste et le panneau des filtres
reposaient directement sur l'image de fond. Corrigé — et la règle de mesure affinée : on ne
regarde que le texte réellement dessiné par un nœud, car un `li` qui n'enveloppe qu'un bouton
opaque ne pose rien sur la photo.

**Deux classes qui se marchent dessus.** `ln-panneau` pose une carte crème, `ln-panneau-titre`
pose les couleurs de texte du graphite. Les combiner donnait un texte clair sur une carte crème :
contraste insuffisant. Le fond graphite est désormais réaffirmé là où les deux se rencontrent.

**Un numéro au pluriel.** Le panneau d'écoute affichait « pistes 43 ». C'est un numéro, pas un
compte.

### Mesurer une mise en page demande une machine calme

Trois moteurs en parallèle saturaient la machine, et les mesures vacillaient — un test différent
échouait à chaque exécution, et tout passait en série. Le parallélisme est donc limité à deux, et
chaque mesure attend que les polices soient posées avant de lire une largeur. Une minute de plus
vaut mieux qu'un contrôle qui vacille : un test instable finit toujours par être ignoré.

## Les bancs de mesure sortent de la vérification courante

Deux bancs encodent ou décodent des fichiers entiers : l'échantillon F7 et la justesse du
découpage. Chacun dure des minutes, et le rapporteur de vitest abandonne quand un seul test occupe
un ouvrier aussi longtemps — « Timeout calling onTaskUpdate » —, rendant la vérification rouge
alors que tous les contrôles passent.

Ce ne sont pas des contrôles de non-régression mais des **mesures**. Elles se relancent en les
demandant (`pnpm --filter @lienotheque/optimiseur run mesures`), le workflow Tauri les relance à
chaque passage, et leurs résultats sont consignés ici.

Le banc des recettes, lui, reste dans la vérification courante : le cache de lecture l'a ramené de
quatre minutes à onze secondes. C'est la bonne réponse quand elle est possible — un test de quatre
minutes finit par être désactivé, et un test désactivé ne protège plus rien.

## Un instantané ne passe pas par `public/`

`public/` est recopié tel quel dans la construction et publié avec elle. L'instantané y était
écrit, dans un sous-dossier ignoré par Git : le dépôt était protégé, la construction ne l'était
pas — un `pnpm build` l'emportait dans `dist/`, et avec lui des numéros de page et des empreintes
tirés d'un document sous droits.

**Retenu : l'instantané et les images de page vivent au cache de travail, et un greffon de Vite les
sert.** Le même greffon en développement et sur la version construite, à la même adresse ; l'absence
d'instantané rend un 404, que l'application lit comme un dépôt vide — c'est l'état de quiconque n'a
rien importé. Un contrôle refuse tout fichier de données dans `public/`, parce que la règle est
facile à défaire par distraction.

Le jeu de démonstration suit le même chemin : il reste réservé au développement, mais il ne passe
plus par `public/` non plus.

## Lire un lot en flux, pas en tableau

La préparation d'un lot chargeait toutes les pages décodées avant d'en lire une seule. Mesuré sur
F3 : 15 Mo d'images pour 4 pages, 68 Mo pour 29 — deux mégaoctets et demi la page, soit plus d'un
gigaoctet pour le scan de cinq cents pages qui dort dans les fixtures.

**Retenu : un flux.** `pagesEnGris` et `preparerLot` rendent une page à la fois ; ce qui
s'accumule tient en numéros et en positions, jamais en pixels. Une seule page est vivante à la
fois — 9 Mo — quel que soit le document. L'export des images de page suit la même règle : décoder,
réduire, encoder, écrire, et passer à la suivante.

Vérifié en relisant F3 sans cache et en comparant au relevé que la version en tableau avait écrit :
identique, octet pour octet. Un changement de forme qui change un résultat n'est pas un changement
de forme.

Le contrôle qui garde cette propriété garde la **forme** — c'est un flux, il se consomme page par
page, il s'abandonne en cours de route — et non le chiffre : une mesure de mémoire vive dépend du
ramasse-miettes et de la machine, et un contrôle qui vacille finit ignoré.

## Deux numérotations pour un même document finissent par diverger

Pour donner à chaque page son image, il fallait relier le rang d'une page dans le document à son
numéro imprimé. Le décalage majoritaire semblait suffire : il valait +2 sur tout F3.

Il ne suffit pas. Une page dont le numéro est mal lu — l'index 4 lisait « 5 » au lieu de « 6 » — et
un scan qui saute deux pages — après la 29 vient la 32 — font deux cas où un décalage constant
donne l'image d'une autre page. L'interprète sait déjà traiter les deux, avec son vote par fenêtre.

**Retenu : ne pas renumeroter.** Le lien se fait par les éléments — une page porte des numéros
d'élément, et l'interprète dit sur quelle page imprimée chacun tombe. Une page sans élément reconnu
n'a pas d'image : mieux vaut pas d'image qu'une image attribuée à la mauvaise page.

## Ce que F3 réel a montré des écrans

**Un écran peut n'avoir aucune action principale.** Les 95 liens de F3 passent tous le seuil de la
recette : la file de Vérifier est vide, et l'écran n'a donc pas de bouton cuivre plein. Le contrôle
exigeait « exactement un » par écran et échouait. La règle est « un seul » (UX-09) : deux actions
principales, c'est une hésitation ; zéro, c'est un écran qui n'a rien à faire faire. Le contrôle
interdit maintenant la deuxième, et exige la première là où elle existe toujours.

**Un cadre vide se lit comme une panne.** La planche de Vérifier se dessinait quand même, bordure
comprise, autour de rien. Elle ne se dessine plus.

**Le seuil de confiance vient de la recette.** Il était redéclaré dans la description de la
bibliothèque — deux seuils pour un même lot, et celui qu'on oublie de changer.

### Deux réserves, qui demandent le contrat

**Les filtres du schéma ne filtrent rien.** `PageAffichee` ne porte aucune valeur d'axe : l'écran
affiche les cases, et n'a rien sur quoi comparer. Leurs comptes viennent d'ailleurs en dur à zéro.
Seul l'axe de l'état du lien filtre, parce que l'application sait ce que « validé » veut dire.

**Les zones d'élément n'arrivent pas jusqu'aux écrans.** La lecture connaît la position de chaque
repère, `LigneInterpretee` ne la transporte pas. Le Lecteur montre donc la vraie page sans ses
zones cliquables. Les deux demandent d'étendre le contrat, l'instantané et l'ingestion : ce sont
des fonctionnalités, pas des corrections.

## L'orientation d'un lot se vote, elle ne se croit pas sur parole

En préparant la relecture ciblée des numéros illisibles de F4, les recadrages ont montré autre
chose que ce qu'on cherchait : les pages dont la lecture ne rendait rien n'étaient pas illisibles.
Elles étaient **couchées ou retournées**. « 227 — CD 1 Piste 20 » s'y lit parfaitement, de travers.

### Tesseract répond toujours, et c'est le piège

`detecterRotation` demandait son avis à Tesseract en mode orientation (`--psm 0`), et le suivait
dès qu'il se prononçait. Il se prononce toujours. Sur les quatorze clichés de référence de F4 il
s'est trompé quatre fois : deux pages rendues à l'envers, deux laissées couchées. Comme il
répondait, on ne regardait pas plus loin — et une page mal tournée ne donne plus rien à lire,
zéro élément là où elle en portait six.

### Noter les quatre sens ne suffit pas

Premier geste : essayer les quatre orientations et garder celle qui donne le plus à lire — somme
des confiances des mots d'au moins deux caractères, sur une image réduite de moitié.

Mesuré, cela tranche nettement là où la page porte du texte : 255 contre 107, 294 contre 113.
Mais une page de musique n'en porte presque pas, et trois points séparent alors les quatre sens.
Laisser décider ce bruit se trompait une fois sur trois — et retournait même un cliché qui était
juste.

### Un livre est photographié dans un sens

L'orientation est une propriété du lot, pas du cliché. C'est le même raisonnement que pour le
décalage des numéros de page, voté d'abord sur l'ensemble : les clichés bavards décident pour les
muets, pondérés par l'écart entre leurs deux meilleurs sens. Sur F4, 270° l'emporte par 460 contre
13 et 2.

Seize clichés échantillonnés suffisent : la réponse est acquise bien avant d'avoir tout sondé.

### Ce que cela a donné

| | avant | après | critère |
|---|---:|---:|---:|
| F4 — premiers éléments justes | 16 / 92 | **52 / 92** | 83 |
| F4 — pages justes | 21 / 92 | **67 / 92** | 89 |
| F3 | 95 / 95 | **95 / 95** | 95 |

Sur les treize clichés de référence : 122 éléments lus contre 93, et 26 pages comparables à
l'oracle contre 18. F3 ne bouge pas, rejeu identique compris.

**Le critère de F4 n'est pas tenu.** Il a gagné 36 premiers éléments et 46 pages par une
correction qui ne coûte rien et ne connaît aucun document.

### Un cache qui ignore ce qui change finit par servir le passé

`VERSION_LECTURE` passe à 3. L'orientation ne change pas la forme d'une lecture, elle change ce
qu'elle lit. Sans cette version, la mesure aurait resservi les lectures d'avant et n'aurait rien
montré — c'est exactement ce qui était arrivé aux zones d'élément quelques jours plus tôt.

## Le reliquat de F4 ne relève pas d'un manque de lecture

Quarante écarts restent après la correction d'orientation. Leur analyse contredit l'hypothèse qui
avait conduit à proposer la vision ciblée.

| Cas | Nombre |
|---|---:|
| Piste sans rien attribué | 2 |
| Premier élément faux, mais appartenant bien à la piste | 8 |
| Premier élément appartenant à une **autre** piste | 30 |

Parmi ces 30, **27 ont une dérive d'exactement −1 piste** : l'élément attribué à la piste N
appartient à la piste N−1. Nous donnons 187 à la piste 14 alors que 187 est le second élément de
la piste 13 ; nous donnons 181 à la piste 13, qui commence à 183. Les frontières de piste avancent
d'un cran trop tôt.

C'est cohérent avec ce qui est consigné plus haut : chaque élément d'une piste porte son repère, et
c'est le pas de 0 — deux éléments sur la même piste — qui les réunit. Un pas de 0 manqué sépare
deux éléments qui n'en font qu'un, et tout glisse ensuite.

**Conséquence pour la vision ciblée (OUT-08) :** elle traiterait les dix premiers cas, pas les
trente autres. Elle lit un numéro ; elle ne répare pas une frontière de piste. Les contrats
(`DemandeVision`, `ReponseVision`, preuve `vision`, budget en recette) et la sélection des
candidats sont faits et mesurés — 59 recadrages sur 28 pages, 497 × 135 px, environ 85 jetons
l'image, de l'ordre de 0,16 USD pour le lot entier — mais rien n'est appelé : **l'outil reste en
réserve**, sans Worker, sans clé, et sans plafond écrit dans une recette tant qu'il n'est pas
mesuré par `count_tokens`.

## La fenêtre de pastille ne déborde pas : l'hypothèse est écartée

Le reliquat de F4 — vingt-sept erreurs d'attribution sur quarante, toutes à −1 piste — avait une
explication plausible : la fenêtre où l'on cherche le repère, posée **sous** le numéro d'élément,
pouvait déborder sur l'élément suivant et lui emprunter le sien. Mesuré sur les treize clichés de
référence, c'est faux.

| Mesure | Résultat |
|---|---:|
| Éléments lus | 122 |
| Fenêtres recouvrant le numéro de l'élément suivant | **0** |
| Fenêtres recouvrant la fenêtre de l'élément suivant | **0** |
| Lectures de piste à +1 de l'oracle | **0** |

Les images de diagnostic le montrent aussi bien que les chiffres : la fenêtre encadre exactement
la pastille de son élément, et s'arrête bien avant le suivant.

### Ce que les images montrent à la place

**Les repères ne sont pas sur tous les éléments.** Sur ces treize clichés, 87 éléments lus sur 122
ne portent aucune pastille lisible. Un même cliché montre cinq éléments dont trois seulement en
ont une. La formule consignée plus haut — « chaque élément d'une piste porte son repère » — vaut
pour les éléments d'une piste déjà ouverte, pas pour tous.

**Et quand une pastille est mal lue, elle l'est franchement.** Sur les 32 éléments dont l'oracle
connaît la piste, 21 sont lus juste et 11 sont faux — mais d'aucun pas régulier : 41 pour 1, 19
pour 9, 1 pour 11, 43 pour 12, 4 pour 19. Jamais à un près.

### D'où vient alors la dérive

Une lecture farfelue ne soutient aucune piste : `appui` lui donne zéro. Là où elles s'accumulent,
l'attribution n'a plus de quoi trancher, et son réglage par défaut prend le dessus — un pas de 1
est gratuit, un pas de 0 coûte 0,3, donc la suite avance. Reproduit sur des lots construits :

| Bruit | Justes sur 184 | Dérive |
|---|---:|---|
| une lecture farfelue sur quatre | 183 | — |
| **une lecture farfelue sur trois** | **154** | **+1 sur 30 éléments** |

Le taux mesuré sur les clichés de référence est de 11 sur 32, soit une sur trois. La signature
concorde exactement.

### Ce qu'il faut en retenir

Le levier n'est ni la géométrie de la fenêtre, ni la règle d'attribution — les deux ont été
éprouvées et tiennent. **C'est le rendement de lecture des pastilles.** Une pastille est un
chiffre clair sur un bloc sombre, de quelques dizaines de pixels : c'est précisément le genre de
zone difficile que la vision ciblée (OUT-08) sait traiter, et dont les contrats et la sélection
des candidats sont déjà faits.

La partie corrective a donc été arrêtée sans toucher à la fenêtre : corriger ce qui n'est pas
cassé aurait coûté une régression pour rien.

## Les pastilles à deux chiffres, et ce que le prototype avait de plus

Le reliquat de F4 tenait au rendement de lecture des pastilles. Restait à savoir où exactement.

### Ce n'est pas la couverture

Sur les treize clichés de référence, 87 éléments lus sur 122 ne portent aucune pastille lue par
nous. Comparé à l'oracle élément par élément : **82 n'en portent aucune** — il ne la trouve pas
davantage. Sur les cinq qui en ont une, il n'en a réellement lu que trois, les deux autres étant
déduites par la séquence.

Nous en manquons donc trois, pas quatre-vingt-sept. La formulation « 87 éléments sans pastille
lisible », employée dans un rapport précédent, confondait l'absence de repère avec un échec de
lecture.

### Le prototype n'est pas meilleur, il est complémentaire

Comparé à voix égales — tous ses votes consolidés contre les nôtres — sur 39 éléments :

| | justes |
|---|---:|
| Notre lecteur | 21 / 39 |
| Prototype, trois passes | 22 / 39 |
| **Au moins l'un des deux** | **32 / 39** |

Il redresse onze de nos dix-huit échecs, et échoue sur dix que nous lisons. Le porter en
remplacement aurait été un échange nul ; c'est l'union qui vaut.

Deux différences expliquent la complémentarité, et toutes deux ont été portées **en voix
supplémentaires** : il tire ses seuils du percentile du petit morceau qu'il s'apprête à lire, là
où nous les tirions du ton clair de la zone entière ; et il coupe l'étiquette plus court — deux
cinquièmes du bloc — là où nous nous arrêtions aux trois cinquièmes.

### Le défaut réel : deux chiffres, un seul lu

| | justes |
|---|---:|
| Pistes à **un** chiffre | **13 / 13** |
| Pistes à **deux** chiffres | **9 / 19** |

Les dix erreurs restantes sont toutes des pistes à deux chiffres dont un seul est lu — 11 lu 1,
12 lu 2, 19 lu 1 — et la même valeur réussit ailleurs : ce n'est pas le nombre, c'est l'image.

### Ce que cela a donné

| | avant | après | critère |
|---|---:|---:|---:|
| F4 — premiers éléments justes | 52 / 92 | **61 / 92** | 83 |
| F4 — pages justes | 67 / 92 | **77 / 92** | 89 |
| F3 | 95 / 95 | **95 / 95** | 95 |

Lecture du lot : 3308 s contre 2931, soit treize pour cent de plus — la relecture ne concerne que
les éléments portant une pastille.

Le gain ne vient pas du nombre de lectures justes, qui ne monte que d'une sur trente-deux. Il
vient de leur **nature** : les inventions de chiffre ont disparu. Une lecture « 41 » là où la
piste est 1 donne un faux soutien à la piste 41 ; une troncature « 1 » pour 11 n'en donne qu'un
partiel, que l'attribution pondère. Changer la nature des erreurs valait plus que d'en changer le
nombre.

Reliquat : 32 écarts, dont **16 dérives de −1** (contre 27), 10 à la bonne piste mais au mauvais
premier élément, 1 à +1, 5 inconnus de l'oracle.

### Une idée essayée et retirée

Le vote préfère la forme complète quand l'autre en est la fin, à égalité de voix. L'étendre
au-delà de l'égalité — la forme complète l'emportant dès un tiers des voix — paraissait fondé :
les recadrages étroits ne montrent qu'une partie du bloc et lisent tous la forme tronquée.

Mesuré : **aucun effet**. Les lectures fausses ne contiennent jamais la forme complète dans leurs
voix. Le chiffre manquant n'est pas mal élu, il n'est pas lu. La règle est revenue telle quelle,
et le raisonnement reste en commentaire pour qu'on ne le retente pas.

### Ce que la vision ciblée doit viser

Le plan initial visait les numéros d'élément dans la marge. La mesure dit autre chose : ces
numéros se lisent, et les pastilles à un chiffre aussi. **La seule zone difficile qui reste est le
bloc d'une pastille à deux chiffres** — un pavé sombre de quelques dizaines de pixels, chiffres
clairs, parfois flanqué d'une étiquette. Il y en a environ dix-neuf pour quatorze clichés, soit de
l'ordre de deux cents pour le lot : moins que les neuf cents zones du plan initial, et bien mieux
ciblées.

## Compter les chiffres d'un repère, et ce que les modèles du document ne savent pas faire

Dernière tentative locale avant la vision ciblée, d'une autre nature que les réglages d'OCR : ne
plus chercher à mieux lire, mais à savoir **quand on a mal lu**.

### Le comptage : retenu

Un moteur d'OCR rend un texte ou rien. Quand il rend « 4 » là où le repère porte 14, il ne signale
aucune difficulté — sa réponse est complète de son point de vue. L'image dit le contraire : deux
formes de la taille d'un chiffre, une seule lue.

`chiffresDuMorceau` compte ces formes dans le pavé que le lecteur isole déjà, en prenant pour
mesure la plus haute d'entre elles. Rien d'absolu : un repère de vingt pixels et un de deux cents
se comptent pareil.

| Sur les 37 repères des clichés de référence que l'oracle connaît | |
|---|---:|
| Comptage juste (formes comptées = chiffres de l'oracle) | **33 / 37** |
| Lectures à un chiffre perdu, toutes signalées | **10 / 10** |
| Lectures justes que le comptage croirait incomplètes | **2 / 22** |

Ce qui a fait la différence vient de la mesure, pas d'une intuition : un **filtre d'étroitesse**.
Les éclats du seuillage font un à trois pixels de large pour trente à quarante de haut ; le plus
étroit des chiffres de cette fonte, un « 1 », en fait sept pour trente-cinq. Sans ce filtre, un
éclat devenait la forme la plus haute du repère et faisait taire les vrais chiffres : le comptage
tombait à 19 sur 37 et douze lectures justes sur vingt-deux passaient pour incomplètes.

### Ce qu'on en a tiré pour l'attribution : rien, et c'est mesuré

Compter ne sert à rien si personne n'écoute, et la suite logique était claire : une lecture connue
incomplète ne peut pas être la piste entière, donc son appui devrait aller au nombre qui
**contient** la lecture plutôt qu'à celui qui lui est égal — `appui` à l'envers.

Sur des suites construites, cela se démontrait bien. « 19 » suivi d'un « 2 » tiré d'un repère
portant 20 donnait `[1, 2]` — la suite abandonnait le 19 plutôt que de contredire le 2 — et rendait
`[19, 20]` avec le drapeau. De même `[9, 1, 1]` passait de `[1, 1, 1]` à `[9, 10, 11]`. C'est
exactement la signature des seize dérives de −1 du lot.

Sur le lot, cela ne donne rien. Et comme la lecture était en cache, le balayage a pu être complet :
seize couples de poids, de 0,45 à 1 pour la contenance et de 0,45 à 1 pour l'égalité.

| Contenance | Premiers éléments | Pages |
|---|---:|---:|
| **0,45 — le témoin, c'est-à-dire la valeur qu'`appui` donne déjà** | **61 / 92** | **77 / 92** |
| 0,6 | 60 / 92 | 76 / 92 |
| 0,8 | 59 ou 60 / 92 | 76 / 92 |
| 1,0 | 60 / 92 | 76 / 92 |

Le poids de l'égalité, lui, ne change rien du tout. **Aucun couple ne fait mieux que le témoin**,
et le témoin est l'état antérieur : le drapeau ne peut que dégrader.

Pourquoi, alors que le raisonnement se tenait et que le comptage est juste 33 fois sur 37 ? Deux
choses se conjuguent. D'abord l'appui partiel d'`appui` — ce 0,45 accordé à « 4 » pour la piste 14
— faisait déjà le travail : là où les voisines encadrent la piste, la programmation dynamique
retrouve 13 entre 12 et 14 sans qu'on lui dise rien. Ensuite, le signal se paie : deux lectures
justes sur vingt-deux sont tenues pour incomplètes à tort, soit près d'une sur dix, et sur deux
cent quatre-vingt-quatre repères cela fait plus de faux signaux que de vrais cas à redresser.

Le drapeau est donc retiré, VERSION_LECTURE revenue à 5, et le 0,45 d'`appui` porte désormais le
commentaire qui dit qu'il est un plafond éprouvé et non un réglage prudent.

### Les modèles tirés du document : réfuté

L'idée se tenait. Les repères à un seul chiffre se lisent 13 fois sur 13 ; chacun fournit donc un
exemple sûr de son chiffre dans la fonte de ce document. Il n'y aurait qu'à découper le chiffre
perdu et le rapprocher de ces exemples — rien d'écrit en dur, chaque document constituant ses
propres modèles.

Mesuré, cela ne marche pas. Les modèles viennent du document entier **moins** les treize clichés
éprouvés, pour qu'il n'y ait aucune fuite : cent exemples sûrs. Quatre grilles de normalisation,
trois distances, cinq seuils d'écart et trois seuils d'avance ont été balayés.

| | gain | coût |
|---|---:|---:|
| Seuils serrés (écart ≤ 0,06, avance ≥ 0,04) | 0 | 0 |
| Seuils moyens (écart ≤ 0,10, avance ≥ 0) | 3 | 5 |
| Seuils lâches (écart ≤ 0,15, avance ≥ 0) | 3 | 11 |

**Aucun couple de seuils ne rend plus de repères qu'il n'en abîme.** Et le détail compte : passer
de dix-neuf exemples, tirés des seuls clichés éprouvés, à cent exemples tirés du document entier a
*empiré* le résultat. Plus de modèles, c'est aussi plus de chances qu'une forme douteuse trouve un
voisin proche : l'écart cesse alors de trier.

La raison de fond est dans la composition du document, et elle condamne l'approche plutôt qu'un
réglage. Les exemples sûrs viennent presque tous de pastilles à un chiffre et du chiffre des unités
des autres : vingt-neuf « 2 », vingt-trois « 3 », vingt « 4 » — mais sept « 1 » et cinq « 0 », qui
sont justement les chiffres des dizaines, ceux que l'OCR perd. Le document est riche là où on n'a
besoin de rien et pauvre là où tout se joue.

La reconnaissance est donc retirée de la bibliothèque et vit dans la mesure qui l'a réfutée,
`outils/recettes/mesures/comptage-chiffres-f4.ts`, pour qu'on puisse refaire le calcul sans la
porter à nouveau.

### Ce qui reste de cette tentative

Le comptage lui-même, `chiffresDuMorceau`, et le crochet qui dépose les repères découpés. Ni l'un
ni l'autre ne décide de quoi que ce soit : ils ne tournent que si une mesure les demande, et une
lecture de lot ne les paie pas. Ils sont là parce qu'ils rendent la réfutation rejouable — on peut
éprouver une autre règle de comptage ou un autre comparateur sans relire trois cents clichés.

Et le constat qui compte pour la suite : **les réglages locaux sont épuisés, cette fois pour de
bon.** Nous savons maintenant dire quand une lecture est tronquée, nous ne savons pas dire ce qui
lui manque, et le savoir ne suffit pas à l'attribution. F4 reste à 61 premiers éléments sur 92 et
77 pages sur 92, pour un critère de 83 et 89.

## La relecture ciblée : ce que la mesure a imposé contre le plan

Le plan `docs/plan-vision-ciblee-f4.md` a été écrit avant d'avoir une seule image sous les yeux.
Trois de ses affirmations étaient fausses, et elles l'étaient de façons instructives.

### La taille des pavés : quatre fois plus petits que prévu

Le plan annonçait des recadrages de 200 × 150 pixels. Mesurés sur les clichés de référence, les
repères font **31 à 49 pixels de large sur 42 à 49 de haut**, et leur recadrage — marge claire
comprise — **65 à 89 pixels de côté**, pour 2,3 Kio chacun. L'estimation du plan venait d'un
raisonnement sur la hauteur d'un numéro d'élément, pas d'une mesure.

### Agrandir : le plan l'interdisait, la mesure l'impose

Le plan disait de ne jamais agrandir, au motif qu'agrandir n'ajoute aucune information. C'est vrai
et c'est hors sujet. Un modèle découpe une image en tuiles de quelques dizaines de pixels : un
repère de 80 pixels en occupe deux sur deux, et à cette taille il perd des chiffres.

| Échelle | Justesse sur 18 pavés | Coût |
|---|---:|---:|
| ×1 | 15 / 18 — 1 illisible, 2 faux | 0,0052 € |
| **×2** | **18 / 18** | **0,0055 €** |
| ×4 | 18 / 18 | 0,0071 € |

On retient ×2 : justesse parfaite, et à égalité la moins chère. L'agrandissement est une donnée de
la recette et non une constante du code — un document photographié de plus près n'en aurait pas
besoin.

### Le coût : ce n'est pas la taille des images qui compte

| Échelle | Jetons par pavé | Lot de 184 | Coût du lot |
|---|---:|---:|---:|
| ×1 | 93,4 | 17 200 | 0,045 $ |
| ×2 | 118,3 | 21 800 | 0,049 $ |
| ×4 | 212,6 | 39 100 | 0,067 $ |

Le chiffre qui explique les autres : **1058 jetons de coût fixe par appel**, pour la consigne et le
schéma de l'outil. Un pavé ne coûte qu'une trentaine de jetons de plus à l'échelle d'origine, une
soixantaine au double. **Grouper vingt zones par appel compte donc davantage que la taille des
images** — et c'est pourquoi doubler l'échelle ne coûte que 10 % de plus.

### La sélection : angle mort nul, et 20 % de gaspillage assumé

Sur les treize clichés, 122 éléments lus donnent **18 pavés retenus** — 13 pour lecture incomplète,
5 sans lecture. L'oracle en juge 14 vraiment à relire et 4 déjà justes. **Aucune lecture fausse
dont le repère est localisé n'échappe à la sélection.** Les quatre pavés inutiles sont le prix de
cette couverture, et c'est le bon côté du marché. Extrapolé : environ 184 pavés pour le lot, pour
un plafond déclaré de 300.

### Deux défauts trouvés en chemin, qui valaient d'être trouvés

**Les éclats pris pour des repères.** Deux pavés sur vingt mesuraient 3 × 18 pixels : des éclats du
seuillage, dont le recadrage ne contient rien de lisible. Le lecteur les accepte parce que son test
de présence juge le remplissage et la hauteur, pas la largeur. La sélection s'en protège — les
vrais pavés vont de 0,71 à 1,07 en largeur sur hauteur, les éclats 0,10 et 0,17 — mais **le lecteur
reste à resserrer**, ce qui changera les lectures donc les mesures, et se fera à part.

**Une projection qui majorait à l'envers.** J'avais écrit la projection de sortie à 40 jetons par
zone « majorée à dessein ». Mesurée, elle vaut 42,6 à 43,8. Une projection qui sous-estime laisse
passer l'appel qu'on voulait refuser, c'est-à-dire exactement ce qu'on lui demande de ne pas faire.
Corrigée à 50, avec une mesure derrière.

### Ce que le budget garantit, et ce qu'il ne garantit pas

L'arrêt se fait **avant** l'appel qui ferait dépasser : un plafond qu'on constate après coup n'en
est pas un. D'où deux chiffres distincts — la projection décide, la dépense comptée sur les jetons
rendus fait foi. Et l'arrêt est net, non poreux : dès qu'un appel est refusé, tout ce qui suit l'est
aussi, sans quoi un appel plus petit passerait là où un plus grand a été refusé.

Une entrée gardée ne consomme aucun plafond, sans quoi un rejeu coûterait plus cher que la première
lecture. Et l'empreinte d'un recadrage dépend de l'agrandissement : en changer invalide le cache,
ce qui est juste — une autre image n'est pas la même.

### Le faux changement de disque, et un chiffre de F4 qu'il faut corriger

La première mesure complète de F4 avec relecture a donné 67 premiers éléments et 74 pages, contre
61 et 77 sans elle : un gain sur l'un, une perte sur l'autre. Le diagnostic a montré autre chose
que ce que ces chiffres disaient.

**Ce que le modèle lit.** Sur les 59 pavés dont l'oracle connaît la piste, **56 justes et 3 faux** —
95 %. Il déclare 45 pavés illisibles, dont 41 portent sur des éléments que l'oracle ignore, c'est-
à-dire le second disque. Décliner là est juste.

**Ce qui abîmait.** Vingt et un éléments passaient de leur piste juste — 82 à 92 — à la piste 2 du
disque 2. La cause est un faux changement de support, et le mécanisme mérite d'être écrit : la
relecture établissait la numérotation à 81-82, puis les lectures locales qui suivaient étaient des
chiffres perdus — « 2 » pour 82, « 3 » pour 83, « 4 » pour 84 — et trois petites lectures sûres de
suite ressemblent exactement à un retour au début. Le premier support était coupé en deux.

La correction est à l'endroit juste : **une lecture dont le repère montrait plus de chiffres qu'elle
n'en rend ne fonde pas un changement de support.** C'est le seul endroit où compter les chiffres
décide de quelque chose — l'essai sur l'attribution avait échoué, celui-ci était la bonne cible.
Elle fait passer les dégâts de vingt et un éléments à deux.

**Et le chiffre à corriger.** La notation du critère de F4 ignorait le disque : une piste 50 du
deuxième support était comptée comme la piste 50 de l'oracle, qui ne couvre que CD1. Les chiffres
de F4 dépendaient donc de l'endroit où la coupure tombait, sans que rien ne le dise. Le filtre
manquait dans les deux bancs, il y est maintenant, et les mesures antérieures de F4 — dont le
« 61 / 92 et 77 / 92 » rapporté plusieurs fois — confondaient les deux disques.

Avec la notation ramenée au premier support :

| | Premiers éléments | Pages | Éléments abîmés |
|---|---:|---:|---:|
| Sans la garde, sans relecture | 29 / 92 | 32 / 92 | — |
| Sans la garde, avec relecture | 67 / 92 | 74 / 92 | 21 |
| **Avec la garde, sans relecture** | 55 / 92 | 67 / 92 | — |
| **Avec la garde, avec relecture** | **67 / 92** | **74 / 92** | **2** |

La garde ne change rien au résultat avec relecture : elle redresse le témoin, et c'est bien le
témoin qui était faux. Le critère — 83 et 89 — n'est pas tenu.

**Le point de départ et le résultat, pour mémoire.** Avec la notation juste, F4 part de **55
premiers éléments sur 92 et 67 pages sur 92**, et la relecture ciblée le porte à **67 et 74**, soit
**+12 éléments et +7 pages**. Le critère reste à 83 et 89 : il manque 16 éléments et 15 pages. Ce
sont ces quatre nombres qui font foi ; tout chiffre de F4 antérieur à cette correction confondait
les deux disques et ne leur est pas comparable.

### Ce que la relecture coûte, en vrai

139 pavés pour le lot, 7 appels, 17 429 jetons d'entrée et 5 752 de sortie, **0,0428 €** pour un
plafond de 0,20. Un rejeu complet ne dépense **rien** : les 139 réponses viennent du cache, et la
mesure entière retombe à soixante secondes de rendu.

## L'inventaire des médias présents comme indice (REC-05)

Après la relecture ciblée, il restait 25 pistes de F4 hors du compte. Le diagnostic les a séparées :

| Cause | Pistes |
|---|---:|
| L'élément attendu est mis sur le **second support** | **10** |
| Piste juste, mais un autre élément la précède | 8 |
| L'élément attendu n'est pas lu du tout | 4 |
| Piste fausse sur le bon support | 3 |

Et l'inventaire des médias tranche la première cause : **le support 1 compte 92 pistes, et aucun
second support n'est présent.** Pourtant 327 lignes sur 982 étaient placées hors du support 1 — la
chaîne inventait un support qui n'a aucun enregistrement.

L'inventaire se tire des médias eux-mêmes : leur nombre, et le motif de nom que la recette déclare
en « indice », disent quels supports sont là et jusqu'où ils vont. C'est un fait sur les médias et
non sur leur nom (REC-05) ; le nom ne sert qu'à les ranger.

### Deux règles, et seulement la seconde a payé

**Un support absent ne reçoit rien.** Les éléments d'un support que l'inventaire ne connaît pas
restent sans piste, et n'héritent pas non plus de la précédente : relier au hasard est pire que ne
pas relier. C'est juste, et c'est ce que Vérifier doit montrer — mais mesuré seul, **cela ne change
aucun chiffre** : les éléments concernés étaient déjà hors du support 1, et le critère ne compte que
celui-là. La règle corrige ce que la chaîne affirme, pas ce qu'elle trouve.

**Un support ne se termine pas avant sa dernière piste connue.** Celle-ci paie. L'inventaire dit 92
pistes ; tant que les lectures n'y sont pas parvenues, un retour au début est plus probablement une
suite de chiffres mal lus qu'un disque suivant. La coupure tombait après la piste 82, et les dix
pistes restantes étaient perdues pour un support qui n'existe pas.

| | Premiers éléments | Pages |
|---|---:|---:|
| Avant, sans relecture | 55 / 92 | 67 / 92 |
| Avant, avec relecture | 67 / 92 | 74 / 92 |
| **Avec l'inventaire, sans relecture** | 60 / 92 | 76 / 92 |
| **Avec l'inventaire, avec relecture** | **73 / 92** | **83 / 92** |
| Critère | 83 | 89 |

Il manque 10 premiers éléments et 6 pages. F3 reste à 95 / 95 — sa recette ne déclare aucun
changement de support, et l'inventaire ne lui change donc rien.

### Ce que l'inventaire ne décide jamais

Un repère lu le contredit toujours. Si une pastille donne une piste au-delà de ce que l'inventaire
connaît, c'est l'inventaire qui est incomplet, pas la page : la piste lue est attribuée. Un test le
retient, parce que c'est la différence entre un indice et une vérité.
