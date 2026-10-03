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
| Reprend un travail après arrêt forcé (JOB-02) | Oui | `kill -9` au pas 30/200 ; le verrou survit, expire, puis reprise **au pas 31**, aucun pas rejoué, tentative 2 |
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
- **Le verrou se comporte comme prévu.** Après un arrêt forcé, le travail reste bloqué jusqu'à
  l'expiration du verrou. Les 30 secondes par défaut sont un choix à régler : c'est le délai pendant
  lequel un travail interrompu paraît figé à l'utilisateur.

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

- **Linux**, hors périmètre du CDC mais utile à savoir.
- L'installateur Windows (NSIS ou MSI) et l'emplacement des DLL dans le paquet installé.
- La signature et la notarisation, qui changent la taille et la procédure de distribution.
- Les autres moteurs du lot C : ONNX (OUT-06), Whisper (OUT-09).
