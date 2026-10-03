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
