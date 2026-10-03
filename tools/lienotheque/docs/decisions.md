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
| à décider | Socle de l'application locale (Tauri 2 ou autre) : prototype mesuré le 3 octobre 2026, **décision en attente** | Lot 0, voir ci-dessous |


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
(25,9 Mo décimaux).

| Partie | Taille |
|---|---|
| Moteurs embarqués (15 bibliothèques + modèles `fra` et `eng`) | 13,54 Mio |
| Binaire de l'application | 10,08 Mio |
| Icône `.icns` | 0,64 Mio |
| `travail-long` (binaire de test — Tauri empaquette tous les binaires du projet, à exclure d'une vraie livraison) | 0,39 Mio |
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

### Ce qui n'est pas mesuré

- **Windows.** Le CDC demande un prototype Mac **et** Windows. Seul le Mac était disponible.
  Rien n'a été vérifié sur Windows : ni la taille, ni l'embarquement des moteurs (qui y passe par
  des DLL et non par `install_name_tool`), ni la reprise.
- **Linux**, hors périmètre du CDC mais utile à savoir.
- La signature et la notarisation, qui changent la taille et la procédure de distribution.
- Les autres moteurs du lot C : ONNX (OUT-06), Whisper (OUT-09).
