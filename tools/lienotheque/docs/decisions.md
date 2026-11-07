# Journal des décisions

| Date | Décision | Référence |
|---|---|---|
| 2026-11-04 | **Une page se désigne TOUJOURS par sa feuille physique.** Une feuille vide **garde sa place**, avec un statut (« vide »). Le champ est **RENOMMÉ** (`index` → `feuille`) plutôt que redéfini, pour que **le compilateur désigne chaque consommateur** : aucun ne peut être oublié. Un rang compacté, s'il sert encore, porte **un autre nom**. **La feuille physique devient la clé d'A3** (confirmation lien par lien) | Décision de Christophe du 04/11, après la mesure du décalage d'une unité sur Bass Aerobics (index compacté 0–114 contre 116 images `page-NNNN`) |
| 2026-11-04 | **Repli Vision — trois étages** : couche du PDF → Tesseract → Vision. **Chaque étage douteux passe la main au SUIVANT**, jamais de saut : une couche douteuse appelle **Tesseract**, pas Vision. **Portée : toute lecture par Tesseract**, y compris les repères musicaux (pastilles, numéros de piste), pas seulement le texte. **« Trop peu lu » et « confiance faible » sont des seuils PAR TYPE DE DOCUMENT, données de bibliothèque.** Page relue par Vision : **signalée** ; Vision échoue aussi : page **« non lue »**, jamais inventée | Précisions de Christophe du 04/11 |
| 2026-11-04 | **Push accordé** pour `0dbc5f6e` (Session récolte son moteur) et `6dae5612` (découpage par caractères, garde de la file, pannes vers la trace). Poussés sur `wip/lienotheque-2026-10-29`, origin à `6dae5612`, rev-list 0 0 | Décision de Christophe du 04/11 |
| 2026-11-04 | **Repli Vision : RÉALISÉ avec A2** (délai effectif sur Tesseract) — les deux partagent la même pièce manquante, sans délai « Tesseract se bloque » n'est pas détectable. **Mais la RÈGLE est GÉNÉRALE** : le repli après difficulté ou échec de Tesseract vaut **toutes situations, tous corpus, toutes bibliothèques**, Studio Clinique comprise. A2 est le moment de sa réalisation, non sa portée | Décision de Christophe du 04/11, précisée le même jour |
| 2026-11-04 | **Exception à « aucun appel en ligne » accordée pour le Worker de la Liénothèque** (`lienotheque-api`), **au moment d'A2** et **limitée au repli Vision**. Ni `clone-proxy`, ni D1, ni Vectorize | Décision de Christophe du 04/11 |
| 2026-11-04 | **Repli Vision obligatoire** : chaque fois que Tesseract échoue, se bloque ou lit trop peu, la page est relue par Claude Vision. Toutes situations, tous corpus. Principe repris de Sourcelis (texte du PDF → Tesseract → Vision en dernier recours, jamais les deux à la fois). **Décidée le 30/10**, réaffirmée le 04/11 ; jamais inscrite ici jusqu'à ce jour | Conversation « Lienotheque » 30/10 ; prompt Christophe 04/11 |
| 2026-11-04 | **D1 de Studio Clinique (`therapeute-library`) : on n'y touche pas.** Aucune lecture, écriture, requête ou suppression, par aucun agent, à aucun moment du chantier ; Vectorize et `clone-proxy` inclus. **La base propre de la Liénothèque en ligne n'est PAS visée** par cette interdiction — mais la règle « aucun appel en ligne par les agents » s'y applique, et l'éprouver demandera un accord explicite de Christophe | Prompt Christophe 04/11, précisé le même jour |
| 2026-11-04 | **Rien d'autre que la Liénothèque n'est effacé** : aucun fichier d'un autre projet, aucun cache système ou partagé. Toute suppression exige une parole explicite portant sur l'objet précis, avec preuve de chemin dans le périmètre | Prompt Christophe 04/11 |
| 2026-11-04 | **Suppressions validées nom par nom** par Christophe, jamais par lot ni par catégorie | Prompt Christophe 04/11 |
| 2026-11-04 | **Aucun appel en ligne par les agents** : ni D1, ni Vectorize, ni clone-proxy, ni aucun service, même en lecture. Les mesures passent par des bancs, sans « relecture », avec `LIENOTHEQUE_JETON` retiré de l'environnement | Prompt Christophe 04/11 |
| 2026-11-04 | **Le jeton reste au trousseau**, et aucun agent ne lance de traitement depuis l'application tant qu'il y est | Prompt Christophe 04/11 |
| 2026-11-04 | **Chaque commit construit et passe ses tests seul.** Deux commits valent mieux que quatre si le découpage artificiel produit un commit qui ne construit pas | Prompt Christophe 04/11 ; leçon de `c2fb2c04` |
| 2026-11-04 | **Studio Clinique** : à moyen ou long terme, après **plusieurs mois calendaires d'usage réel en parallèle**, Studio Clinique pourra lire la Liénothèque au lieu de D1. D1 reste intact pendant toute cette durée **et après**. Tout retrait de livres de D1 serait une décision ultérieure, hors du chantier. Critères restant à fixer : parité livre par livre, qualité de lecture, mêmes réponses sur des questions réelles | Prompt Christophe 04/11 |
| 2026-11-03 | **Mode « meilleure estimation »** : le moteur publie sa meilleure estimation même sur un seul signal, à côté du mode strict. Seuil d'erreur **à fixer par Christophe** | Prompt Christophe 03/11 ; CDC v21 |
| 2026-11-03 | **Ordre du chantier musical** : correctif des folios → écran Relier → mode « meilleure estimation » | Prompt Christophe 03/11, réaffirmé 04/11 |
| 2026-10-29 | **Le moteur oracle devient le socle et REMPLACE les recettes** ; sa portée s'étend au-delà de PDF + MP3. Cette décision **remplace** le périmètre du 27/10 | CDC §-1 ; conversation claude.ai « Lienotheque » |
| 2026-10-27 | **Zéro régression, zéro défaut, 100 % fonctionnel** ; abstention **seulement** si un cas est structurellement impossible, et alors documenté | Conversation claude.ai « Lienotheque », vers le 27/10 — lancement du chantier de fiabilisation des méthodes. *Ni dans le dépôt, ni dans le CDC v22/v23 : source conversationnelle* |
| 2026-10-27 | **Périmètre : PDF + MP3** ; méthodes PDF + vidéo mises de côté. ~~En vigueur~~ — **élargi le 29/10** (voir ci-dessus) | Conversation claude.ai « Lienotheque », vers le 27/10. *Source conversationnelle* |
| 2026-10-25 | **Feuille de route C1-C10** : déclarée faite, commitée et poussée. **Quatre décisions restées ouvertes** : Siegfried ; Windows ; intégration réelle de Studio Clinique (jetons C3 prêts, **rien branché**) ; remplacement de « Base de connaissance » — *ce dernier fait le 04/11, renommée « Bibliothèque Studio Clinique »* | Conversation claude.ai « Lienotheque » 25/10. *Source conversationnelle* |
| 2026-10-28 | **Écran bureau affiché à tort en ligne** (variable de build manquante) : corrigé | CDC v23 L1228, diagnostic du 28/10 validé par Christophe |
| 2026-11-03 | **Corroboration par la table globale** : un repère lu sur la page peut être confirmé par la table du document ; c'est le second signal qui autorise la publication | `001c8a61`, `96077d57` |
| 2026-10-30 | **`verifieParUnHumain` est retiré AU CONTRAT** : l'hôte le calcule depuis `classements.json` (`etat-audio = automatique-prouve`) et l'envoie, mais `ChargeTraitement` le jette — rien en aval ne peut le recevoir. **Raison mesurée** : la vérification humaine enregistrée porte sur un classement global, pas sur des liens vus un par un ; le 30/10, le transmettre a **publié quarante liens à tort** sur le document témoin au lieu de s'abstenir. La voie « un signal + vérification humaine » n'est donc **pas branchée en production** ; elle le sera quand `appariements[].statut` portera la confirmation **lien par lien**. **Cette décision RESTREINT celle du 29/10** : la voie « un signal + vérification humaine » exige désormais une vérification **lien par lien**, qui **n'est pas encore réalisée** — aucun chemin ne permet donc aujourd'hui de publier sur un signal unique | `f9f29d01` (30/10 21:29) ; `outils/ingestion/src/executant.ts:85-107` |
| 2026-10-30 | **Reconstruction sûre** : une reconstruction ne répare jamais une bibliothèque en place ; elle construit une candidate neuve, mesurable et révocable, dans un dossier distinct et non imbriqué du corpus d'entrée | `5866f232`, `docs/reconstruction-sure.md` |
| 2026-10-29 | **Principe de corroboration (REC-02)** : rien ne se publie sur un seul signal. `qualifierAssociation` reçoit `borne` et `corroboration` **non facultatifs** et s'abstient avant tout calcul — `vivier_non_borne`, puis `corroboration_insuffisante` | `c2fb2c04` (29/10 23:37) |
| 2026-10-29 | **Voie « un seul signal + vérification humaine enregistrée »** : un document dont le classement porte `etat-audio = automatique-prouve` peut publier sur un signal unique. L'hôte lit ce classement et transmet `verifieParUnHumain` | `roulement.rs:617` ; `c2fb2c04` |
| 2026-10-29 | **Une lecture corroborée l'emporte sur l'attente de régularité** : la régularité d'une suite ne prime pas sur ce qui a été lu et confirmé | `d3a07b26` |
| 2026-10-28 | **Bibliothèques autonomes** : une bibliothèque emporte son application ; préparateur autonome de méthodes versionné. Exécutable macOS d'abord, Windows ensuite | `10bb4fb5` |
| 2026-10-23 | **Les médias sont servis et les décisions gardées** : la bibliothèque sert ses médias, et les décisions de l'utilisateur survivent au retraitement | `dd42655d` |
| 2026-10-02 | Stockage cloisonné par bibliothèque, recherche fédérée | CDC v2.0 |
| 2026-10-02 | Pas de réparation de l'ancienne base : réimport complet des livres au lot E | CDC v2.0 |
| 2026-10-02 | Réponses rédigées par Claude Haiku via le Worker existant ; AI Gateway optionnel | RCH-10 |
| 2026-10-02 | Sécurité sans saisie répétée pour les utilisateurs quotidiens (session longue durée) | SEC-02 |
| 2026-10-03 | Nom Liénothèque ; charte graphite et cuivre v3 validée ; logo géométrique (deux documents, L en réserve) | Charte v3 |
| 2026-10-03 | Jetons v3.0.1 : piste de progression sombre #3C4046, texte désactivé clair #5A5E63, liseré et pourcentage obligatoires sur la progression claire | Réserves CDC |
| 2026-10-03 | Kit UI v1.1 adopté comme référence ; logo vectoriel validé (IoU 0,977 avec la planche) ; jetons du kit fusionnés dans tokens.json | docs/ui-kit |
| 2026-10-20 | ~~**La découpe** est le remède à la lenteur de F4 (décidée le 17 octobre, `lot-e2-texte-plan.md` §9.1 ter)~~ — **invalidée** : une tranche de moins de neuf feuilles ne vote pas la même orientation, lit donc des pages couchées, rend un tiers des éléments et **aucun numéro imprimé**, sans rien signaler. Elle est rapide parce qu'elle échoue | Section ci-dessous, « la lecture lente fait le travail » |
| 2026-10-20 | **Les quinze secondes par page de F4 sont le coût d'une lecture juste**, et acceptées comme telles. L'optimisation de `reperer` reste une piste, **hors périmètre de BAS-02** | Section ci-dessous |
| 2026-10-19 | **Quatrième porte : l'invitation.** `/amorce` accepte le défi seul, parce qu'un navigateur ne peut pas porter le jeton de service | Section ci-dessous |
| 2026-10-19 | **Le Worker sert aussi la page**, à la même origine que l'API : un témoin `SameSite=Lax` sans CORS ne peut pas fonctionner autrement | `docs/lot-e5-page-servie.md` |
| 2026-10-19 | **Plus de repli TTF** : jamais téléchargé par les moteurs visés, toujours embarqué — deux mégaoctets sur quatre et demi | `apps/app/src/styles/polices.css` |
| 2026-10-19 | **Le module d'entrée du Worker n'exporte que son gestionnaire** : avec des ressources déclarées, un export nommé qui n'est pas un gestionnaire empêche le moteur de démarrer | `apps/worker/src/index.ts` |
| 2026-10-19 | **Scénario B pour les écrans en ligne** : Catalogue et Lecteur en lecture seule, trois objets, publication incrémentale | `docs/lot-e5-plan.md` §9 et §10 |
| 2026-10-19 | **Classer ne se fait pas en ligne**, et ce n'est pas un manque : le classement vivrait à deux endroits | `docs/lot-e5-plan.md` §10 |
| 2026-10-18 | **La vue en ligne est l'instantané servi depuis R2, jamais rebâtie en SQL** : une seconde mise en œuvre serait une seconde vérité | `docs/lot-e5-plan.md` §8 |
| 2026-10-18 | **Troisième famille d'objets, `vues`** : une vue n'appartient à aucune version, et l'y ranger imposerait d'inventer une version | `packages/noyau/src/objets.ts` |
| 2026-10-18 | **La vue se pousse à l'activation d'une version**, par le jeton de service — appel de machine à machine, pas sur un intervalle | `docs/lot-e5-plan.md` §8 |
| 2026-10-18 | **Le premier accès s'amorce par le jeton de service, et seulement tant qu'aucune clé n'est enrôlée** : enrôler exige une session, obtenir une session exige une clé | `docs/lot-e5-etape4-plan.md` §13 |
| 2026-10-18 | **Tous les refus de la porte rendent 401** : un 403 apprendrait qu'on a été reconnu | `docs/lot-e5-etape4-plan.md` §13 |
| 2026-10-18 | **`ORIGINE_CEREMONIE` et `DOMAINE_CEREMONIE` sont posés à la main**, jamais lus dans la requête — l'en-tête `Origin` est ce qu'un attaquant contrôle | `docs/lot-e5-etape4-plan.md` §13 |
| 2026-10-18 | **Un défi vit dans la base, pas dans un jeton signé** : un jeton sait dire qu'il est authentique, jamais qu'il a déjà servi | `docs/lot-e5-etape4-plan.md` §11 |
| 2026-10-18 | **Aucune route d'enrôlement avant que les droits la gardent** (étape 4.6) : une route qu'on n'a pas gardée est la porte qu'on vient de fermer | `docs/lot-e5-etape4-plan.md` §11 |
| 2026-10-18 | **Voie C confirmée par la mesure** : la clé publique arrive en SPKI, zéro dépendance — mais la signature arrive en ASN.1 DER et demande vingt lignes de conversion | `docs/lot-e5-etape4-plan.md` §9 |
| 2026-10-18 | **Trois portes, et aucune route n'en accepte deux** : session pour la façade, jeton de service pour la vision, laissez-passer signé pour les fichiers | Section ci-dessous |
| 2026-10-18 | **La façade ne sert qu'une bibliothèque d'essai tant qu'aucune personne n'est identifiée.** Règle codée, non confiée à la vigilance | Section ci-dessous |
| 2026-10-18 | **La version en ligne lit par la façade Worker sur D1**, et non par SQLite en WebAssembly. Remplace la décision du 3 octobre | Section ci-dessous |
| 2026-10-18 | **« Lot E2 » cesse de désigner le travail de capacité.** BAS-02 reste réservé au réimport réel, toujours différé | Section ci-dessous |
| 2026-10-03 | **Tauri 2 retenu le 3 octobre 2026 sur mesures Mac** (paquet 24,75 Mio dont 13,54 Mio de moteurs ; 4 critères tenus). Réserve : validation Windows obligatoire avant toute version livrée sous Windows | Lot 0, mesures ci-dessous |
| 2026-10-03 | Réserve Windows **levée sur les quatre critères** : ils passent tous sur `windows-latest` (exécution 37120499122). Reste ouvert : l'agencement d'un paquet Windows **installé**, non mesuré | Lot 0, mesures Windows ci-dessous |
| 2026-10-04 | Le **décalage des pages s'appuie sur tout le lot**, le vote local ne s'en écartant que de quatre | Section ci-dessous |
| 2026-10-04 | **La forme du repère commande le recadrage** : losange recadré en son cœur, bloc pris entier. C'est la recette qui la déclare | Section ci-dessous |
| 2026-10-03 | Recette F3 : la pastille est **à droite** du libellé, pas à gauche — relevé sur la page, corrigé en **v2** (REC-03) | Section ci-dessous |
| 2026-10-03 | `saut_max` compte désormais **les pages traversées** : un trou connu dans le lot ne fait plus écarter ce qui le suit | Section ci-dessous |
| 2026-10-03 | **Échantillon F7 mesuré** : le critère ×5 d'OPT-01 tient sur un scan non optimisé (F4, ×8,7), pas sur des sources déjà comprimées (F2 ×2,6, F3 ×1,9) | Section ci-dessous |
| 2026-10-03 | Noir et blanc 1 bit : **CCITT groupe 4**, encodeur écrit ici, libtiff comme oracle. JBIG2 en mode symboles refusé | Section ci-dessous |
| 2026-10-03 | **Playwright** retenu pour les tests de rendu : trois moteurs (Chromium, Firefox, WebKit), hors de `pnpm check`, dans un job d'intégration continue à part | Section ci-dessous |
| 2026-10-03 | ~~Le port de dépôt aura **trois implémentations** : `node:sqlite` (tests et outillage), hôte Rust (application Tauri), SQLite en WebAssembly (version en ligne)~~ — **remplacée le 18 octobre 2026** : la version en ligne passe par la façade Worker, pas par WebAssembly. Les deux premières implémentations tiennent, et aucun code hors de l'adaptateur ne dépend de `node:sqlite` | Section ci-dessous, « La version en ligne lit par la façade » |
| 2026-10-03 | Siegfried **téléchargé depuis la version publiée par son auteur**, version et empreintes figées dans le script des moteurs ; aucun tap Homebrew | Section ci-dessous |
| 2026-10-03 | Dépôt local sur **`node:sqlite`**, intégré à Node, plutôt qu'un module natif : `better-sqlite3` ne se construit pas sur le runner Windows (pas de Visual Studio). Node passe à **24** partout | Section ci-dessous |
| 2026-10-03 | **Stratégie de plateformes** : multiplateforme par conception, bêta macOS d'abord, transposition Windows ensuite, Linux hors périmètre | Section ci-dessous |
| 2026-10-03 | Moteurs Windows à 55,8 Mo **acceptés en l'état** ; leur optimisation attend la phase 2 | Mesures Windows |
| 2026-10-03 | Version minimale de macOS **alignée sur 26.0 pendant la bêta**, pour que l'application refuse proprement un Mac où Tesseract ne pourrait pas se charger. Avant toute sortie publique : Tesseract et ses dépendances compilés avec `MACOSX_DEPLOYMENT_TARGET=13.0` dans le workflow Tauri, puis retour du minimum à 13.0 | Section ci-dessous |
| 2026-10-03 | `tools/lienotheque/.gitignore` passe de 6 à 9 lignes : `target/`, `**/src-tauri/moteurs/`, `**/src-tauri/gen/`. Sans elles, la cible Rust et les binaires Tesseract entraient dans un dépôt public | Écart accepté |
| 2026-10-03 | Les tests Rust du prototype restent hors de `pnpm check` et tournent dans `lienotheque-tauri.yml` (Mac et Windows) : l'intégration continue ordinaire n'a ni Rust ni Tesseract | Écart accepté |
| 2026-10-06 | **La chaîne tourne dans un Node embarqué en binaire annexe**, lancé par l'hôte Rust, un processus par travail. La chaîne n'est pas modifiée. Paquet attendu ~128 Mo | Lot D2, étape 0, mesures ci-dessous |
| 2026-10-06 | **L'hôte est le seul écrivain du dépôt** : le processus reçoit un travail et rend un résultat, l'hôte le valide et l'active en une opération (JOB-06) | Lot D2, étape 0 |
| 2026-10-06 | Portage Rust intégral de la chaîne **écarté** : il faudrait réécrire pdf.js et les codecs, et refaire la preuve des 84/92 et 95/95 | Lot D2, étape 0 |
| 2026-10-06 | Allègement du moteur (Node sans ICU, binaire compilé) **reporté après la bêta**, et sans toucher la chaîne | Lot D2, étape 0 |
| 2026-10-08 | **La recherche n'a pas d'index à elle** : elle lit la vue, et tout se passe sur la machine. Le surlignage porte sur le texte d'origine, pas sur sa forme repliée | Lot D2, étape 4, section ci-dessous |
| 2026-10-09 | **Lot E1, étape 1 faite** : registre `lienotheque-registre` créé en Europe de l'Ouest, schéma appliqué. Les migrations D1 sont **engendrées** depuis `packages/depot-sqlite/src/migrations.ts`, et un test échoue si le disque dérive du tableau | Lot E1, section ci-dessous |
| 2026-10-09 | **Lot D2 clos.** Quatre questions restées ouvertes sont tranchées : agencement d'un paquet Windows **reporté à la phase Windows** ; critère F4 à 84 / 92 **non revérifié**, le témoin gratuit en tient lieu et on ne remesurera que si cette zone du code est retouchée ; **pages invisibles de F5 laissées en l'état**, sujet d'un lot futur ; **allègement du moteur confirmé après la bêta** | Lot D2, clôture, section ci-dessous |
| 2026-10-09 | **Les écrans lisent la version active du dépôt**, relue après chaque traitement, et les images de page arrivent une par une dans la réponse de l'hôte | Lot D2, étape 6, section ci-dessous |
| 2026-10-09 | **Le parcours entier passe sans ligne de commande** : créer, organiser, déposer, apprendre à lire, traiter, lire — 234 s sur F3, 95/95 | Lot D2, étape 7, section ci-dessous |
| 2026-10-09 | **La forme d'un numéro d'élément se donne par l'exemple**, jamais par une syntaxe : « ici, un numéro ressemble à 2.46 ». Quatre hypothèses du lecteur deviennent des données | Lot D2, étape 5, section ci-dessous |
| 2026-10-09 | **REC-07 sur F5 : 13 min 25 s en trois passes, sous le critère — et F5 se lit.** Ce n'était pas l'OCR : le redressement automatique tournait la page sous le tracé. On trace désormais sur la page telle qu'elle est montrée | Lot D2, étape 5 |
| 2026-10-08 | **Un travail par document, non par fichier** : le moteur lit un document et ses médias ensemble, et un travail qui ne porterait qu'une piste n'aurait rien à lire | Lot D2, étape 3, section ci-dessous |
| 2026-10-08 | **Pas de temps restant à l'écran de traitement** : on ne sait pas à quelle vitesse la suite ira, et un chiffre inventé est pire qu'un chiffre absent. On écrit « 194 / 286 » | Lot D2, étape 3 |
| 2026-10-08 | **Fusionner et retirer une valeur sont deux gestes**, pas un : le contrat a refusé qu'une clé vive à deux endroits, et il avait raison — ils ne montrent pas la même chose | Lot D2, étape 2, section ci-dessous |
| 2026-10-08 | **Les écrans se photographient dans l'application de bureau**, en clair et en hybride : le thème hybride est ce qui montre les défauts de charte, qu'aucun test ne voit | Lot D2, étape 2 |
| 2026-10-06 | **Les critères des corpus remontent à la porte de l'application** : F1, F3 et F4 se mesurent sur `executerTravail`, dans `outils/ingestion`, et nulle part ailleurs. Un seul test de critère par corpus | Lot D2, étape 1, section ci-dessous |
| 2026-11-06 | **Titres et auteurs : deux régimes, selon le lieu.** **Code du produit** (y compris ses commentaires et ses données de démonstration) : **aucun titre, aucun auteur, jamais** — c'est la doctrine anti-codage en dur de CLA-01, indépendante du caractère public du dépôt. **Registre, documentation, tests et programmes de mesure** : les titres d'ouvrages du commerce **sont acceptés**, ils donnent leur sens aux décisions. Restent interdits partout : les **fichiers** (PDF, MP3, extraits) et l'**inventaire nominatif complet** de la collection | Décision de Christophe du 06/11, après le relevé des titres en dur dans les programmes de mesure |
| 2026-11-06 | **CLA-01 cherche des mots, pas des suites de lettres.** La frontière d'un mot, dans du code, est l'espace **ou le passage de casse** (`lirePartition`, `partitionDuTexte`) ; une terminaison d'une **liste fermée** (`s`, `es`) décline le mot sans en faire un autre — **ce n'est pas une longueur** : `e`, plus court que `es`, est interdit parce qu'il transforme le mot (« desserte », « bache »). Chaque entrée porte son cas réel dans la liste des termes. Les **homonymes** (`rosier`, `rareté`) restent pris, et c'est sans danger : le jour où leur domaine entre au banc, ils sont interdits pour la bonne raison | Question de Christophe du 06/11, quatre faux positifs mesurés dont un antérieur ; trois règles, chacune tuée par sa mutation |
| 2026-11-06 | **Le jeton d'accès ne vient que du TROUSSEAU.** Le chemin par la variable `LIENOTHEQUE_JETON` est **retiré** : aucun des quinze appelants ne s'en gardait, aucune intégration continue ne la pose, et il était **silencieux** — un jeton qui traîne l'emportait sur le trousseau sans rien dire. La variable garde **un seul** rôle, le signal qui fait refuser de démarrer les douze programmes de mesure hors ligne : un signal de refus ne doit pas pouvoir servir d'accès | Voie 1 choisie par Christophe le 06/11, sur relevé des appelants ; deux contrôles tués par la mutation qui le réinstalle |
| 2026-11-06 | **Renouvellement du jeton d'accès autorisé**, selon `docs/renouveler-le-jeton.md`, dans la fenêtre où aucune mesure en ligne ne tourne (avant 48 → 52) ; vérification par `verifier-route.ts`. Motif : le fragment de 37 caractères sur 64 passé par le **contexte du modèle**, non exploitable mais ayant voyagé. **Les deux gestes qui installent le secret sont faits par Christophe** — Claude n'entre pas un secret dans un champ, même autorisé | Autorisation de Christophe dans la fenêtre de la session, 06/11/2026 |



## Lot D2, étape 0 — où tourne la chaîne

Le CDC avait déjà tranché la coquille : application locale en **Tauri 2 + hôte Rust + binaires
annexes**, base locale en **SQLite et FTS5 *via l'hôte***, et trois implémentations pour le port de
dépôt. Restait une question, et une seule : **où s'exécutent les 9 173 lignes de TypeScript de la
chaîne**, aujourd'hui lancées en ligne de commande.

### Ce que les mesures ont montré

| Fait | Mesure | Statut |
|---|---|---|
| Paquet `.app` actuel | 24,38 Mio (moteurs 13,54 · binaire 10,08 · icône 0,64 · sidecar 0,09) | vérifié, lot 0 |
| Application au lancement | 83 Mo résidents, stable | vérifié, lot 0 |
| Binaire Node arm64 dépouillé | **104 Mo** (universel : 227 Mo) | vérifié le 6 octobre 2026 |
| Démarrage Node et chargement de la chaîne | 94 à 139 ms pour les modules, 0,4 à 0,8 s au total via `tsx` ; 93 à 106 Mo résidents | vérifié le 6 octobre 2026 |
| Plafond mémoire d'un moteur web | 2 Go alloués **et touchés** sans rupture, WebKit comme Chromium | vérifié le 6 octobre 2026, avec réserve |
| Jeu de travail réel de la chaîne | une page vivante, ~9 Mo, quel que soit le document | vérifié, lot C |
| Dépendances d'exécution | `pdfjs-dist`, `@jsquash/*` (WebAssembly), `zod` — **aucun module natif** | vérifié le 6 octobre 2026 |
| Appels système | `node:fs` dans 15 fichiers ; `child_process` dans 4, tous « lancer un moteur » | vérifié le 6 octobre 2026 |

Deux de ces chiffres ont déplacé la discussion. D'abord, **le pic de 1,1 Go relevé sur F3 n'est pas
un besoin** : c'est la marque haute du ramasse-miettes, la chaîne lisant en flux, une page à la
fois. Ensuite, **la chaîne n'a aucun module natif** — ce qui la fait tourner, pdf.js et les codecs
`@jsquash`, sont des bibliothèques conçues pour le navigateur. Une option « tout dans le moteur
web » était donc techniquement ouverte, et pas seulement sur le papier.

Réserve sur le plafond mémoire : la mesure porte sur le WebKit de Playwright, qui n'est pas le
WKWebView d'une application Tauri — modèle de processus et jetsam différents. C'est un indice, pas
une preuve, et il n'a pas eu à devenir une preuve.

### Les deux options

| | A — Node en binaire annexe | B — la chaîne dans le moteur web |
|---|---|---|
| Poids | +104 Mo, paquet ~128 Mo | **+0 Mo** |
| Démarrage | ~150 à 250 ms par travail | celui de l'application |
| Mémoire | ~95 Mo de socle, **hors de l'interface** | 9 Mo de jeu de travail, dans l'interface |
| Chaîne à modifier | **aucune ligne** | `node:fs` dans 15 fichiers, et les quatre appels de moteur |
| Risques | poids ; validation Apple d'un moteur JS embarqué | deux jeux d'adaptateurs ; annulation coopérative |

### Pourquoi A

**Le banc et l'application exécutent le même code sur le même moteur.** C'est la règle « une seule
chaîne de traitement », et c'est celle dont la violation a déjà coûté deux fois dans ce projet :
`instantaneDeLot` réimplémentait la chaîne et avait divergé en silence, puis les pages absentes se
calculaient une seconde fois — justes sur F3 par coïncidence, fausses vingt-trois fois sur F4.
L'option B rétablissait exactement cette forme de risque, un cran plus bas : des adaptateurs
d'entrée-sortie différents de chaque côté.

**L'isolation de processus donne JOB-08 et JOB-09 sans rien écrire.** Mettre en pause ou annuler,
c'est tuer un processus, non espérer qu'une boucle consulte un drapeau. Et la marque haute du
ramasse-miettes reste hors du processus d'interface.

**La chaîne tient le critère normatif du lot D.** A n'y touche pas une ligne ; B rouvrait quinze
fichiers d'une chaîne qu'on venait de prouver.

Le défaut de A est son poids, et c'est le moins contraignant pour une bêta personnelle. L'allègement
— Node sans ICU, ou un binaire compilé — viendra plus tard, sans toucher la chaîne. Ni Bun ni Deno
n'étant installés sur la machine de référence, **aucun chiffre n'est avancé pour eux** : ils seront
mesurés le jour où l'allègement sera à l'ordre du jour.

### Ce que la décision entraîne, et qui s'applique dès l'étape 1

- **L'hôte est le seul écrivain du dépôt.** Deux écrivains sur un même fichier SQLite est un piège.
  Le processus reçoit un travail, rend un résultat, et l'hôte le valide en une opération — ce qui
  sert aussi JOB-06, « écrire dans la version cible, activer en une opération ».
- **L'échange hôte ↔ processus passe par des messages validés par contrat et versionnés.** Un
  désaccord de version est refusé explicitement, jamais toléré en silence.
- **Un plantage du processus reprend au dernier point de reprise** (JOB-02, JOB-03) : jamais de
  perte.
- **Limites** : deux travaux lourds au plus en parallèle, mémoire plafonnée par processus, arrêt
  propre à la fermeture.
- **Même version de Node en développement et dans le paquet**, et le banc appelle le même point
  d'entrée que l'application.
- **La validation Apple d'un binaire Node annexe se mesure tôt**, sur un paquet d'essai : c'est le
  seul risque de cette décision qui ne se chiffre pas sans l'essayer, et il conditionne l'étape 6.


## Lot D2, étape 1 — une seule porte, et les critères devant

La chaîne avait trois entrées : le banc de mesure appelait `rejouer`, l'application appelait
`instantaneDeLot`, la mesure F4 orchestrait elle-même. Trois portes pour un seul traitement, et
donc trois choses mesurables là où il n'y en a qu'une à prouver.

Il n'y en a plus qu'une : **`executerTravail`**, dans `outils/ingestion`. Une demande entre, un
message en sort — un résultat, ou un échec qui dit sa cause. L'enveloppe est validée par le
contrat d'échange, la charge par le contrat de cet outil, et un désaccord de version est refusé
avant tout travail.

### Pourquoi les critères ont dû déménager

`ingestion` dépend de `recettes` et de `vision`. Le critère F3 vivait dans `outils/recettes`, la
mesure F4 dans `outils/vision` : ni l'un ni l'autre ne pouvait appeler une porte située au-dessus
de lui. Les laisser là, c'était les laisser mesurer une marche plus bas que celle que
l'application franchit — donc prouver un script, et non le produit.

Ils sont donc remontés dans `outils/ingestion/test/criteres.test.ts` et
`outils/ingestion/mesures/f4-vision.ts`. **Un seul test de critère par corpus**, et aucune seconde
mesure du même critère ailleurs : les contrôles d'outil restent où ils sont — le déterminisme
(REC-02), les 99 médias, le cache de lecture — parce qu'ils éprouvent un outil, pas un corpus.

**F1 fait exception, et la garde.** Son critère porte sur la couche texte d'un PDF natif, que la
chaîne consomme mais ne note pas. Le faire passer par la porte aurait changé ce qu'il prouve, et
la condition d'identité l'interdisait. Il a déménagé avec les autres, pour qu'ils soient au même
endroit, sans que son assertion bouge d'un caractère.

### La preuve d'identité

Relevé avant le déplacement, puis après, sur la même machine et le même cache :

| Critère | Avant | Après |
|---|---|---|
| **F1** — couche texte, page par page | exact | **exact** |
| **F3** — éléments reliés à la bonne piste | 95 / 95 | **95 / 95** |
| F3 — pages absentes ; médias orphelins | 30 et 31 ; 93 à 98 | **inchangé** |
| **F4** — premiers éléments justes | 84 / 92 | **84 / 92** |
| F4 — pages justes | 89 / 92 | **89 / 92** |
| F4 — témoin, sans relecture | 66 / 92 et 77 / 92 | **inchangé** |
| F4 — effet de la relecture | 146 appliquée, 19 non corroborée, 4 sans majorité | **inchangé** |
| F4 — causes restantes | dispute 19 → 2, piste fausse 4 → 3, non lu 3 → 3 | **inchangé** |
| F4 — coût d'un rejeu | 0,0000 € | **0,0000 €** |

Les trois se sautent proprement sans les fichiers sous droits, comme avant. Les contrôles de la
porte elle-même — refus d'un désaccord de version, refus d'une charge incomplète, avancement qui
finit à cent pour cent — ne demandent aucun fichier et tournent partout.

### Ce que la porte sait dire, et qu'on ne savait pas dire avant

Le nombre de pages d'un document ne sortait pas de la lecture : pour annoncer un pourcentage, il
aurait fallu reparser le document. Il est désormais dit une fois, au moment où la lecture le
connaît déjà, et voyage avec chaque page préparée. La porte émet donc un avancement après chaque
cliché lu — **après la lecture, pas après le décodage** : annoncer cent pour cent pendant que les
dernières pages passent encore à l'OCR serait un mensonge poli.

Le coût d'une passe de relecture part au journal, et de là à l'écran de traitement : une dépense
qu'on ne voit pas est une dépense qu'on ne surveille pas.

## Lot D2, étape 2 — créer une bibliothèque, et l'organiser sans rien perdre

Les deux premiers écrans de l'administrateur, portés des maquettes 1 et 2 : l'assistant en quatre
temps et l'organisation. Ce qui a été tranché en chemin.

### Une bibliothèque se décrit par contrat

Sa description traverse trois frontières — l'assistant qui la crée, l'hôte qui l'écrit, la chaîne
qui la lit — et était lue par un analyseur écrit à la main qui acceptait un identifiant absent en
le transformant en « undefined ». Elle a maintenant son contrat, `DescriptionBibliotheque`, et
c'est lui qui la lit partout. Le nom de son fichier est écrit à un seul endroit, et un test
interdit au Rust de le redire de son côté.

### La règle de l'organisation : une clé ne change jamais

Quatre gestes, et un invariant au-dessus d'eux.

| Geste | Ce qui change | Ce qu'on voit après |
|---|---|---|
| Renommer | le nom, et lui seul | la valeur, sous son nouveau nom |
| Ajouter | une valeur de plus, clé tirée du nom | la valeur, au bout de la liste |
| **Fusionner** | la valeur de départ quitte la liste, sa clé passe en alias de celle d'arrivée | un seul nom, celui d'arrivée |
| **Retirer** | la valeur reste, marquée retirée, et redirige | les deux noms, le premier barré |

`resoudre` démontre les quatre : une clé d'hier mène toujours à une valeur vivante.

Un premier jet faisait de la fusion et du retrait un seul geste — la valeur de départ restait,
retirée et redirigée, *et* sa clé passait en alias sur la cible. **Le contrat l'a refusé** : la
clé vivait alors à deux endroits, et `Axe` interdit les doublons, alias compris. Il avait raison,
et pour une raison qui n'est pas technique : ce sont deux gestes, parce qu'ils ne montrent pas la
même chose. Fusionner dit « ces deux noms désignaient la même chose » et efface le doublon.
Retirer dit « celle-ci a existé pour elle-même, et mène désormais à celle-là » et en garde la
trace. Les tester ensemble aurait caché la différence ; le contrat l'a mise au jour avant l'écran.

Chaque geste rend un schéma d'une version plus haute, validé par son contrat (REC-03) ; le schéma
reçu n'est jamais retouché. **Retirer une façon de ranger est le seul geste qui perd quelque
chose** : il se refuse tant que des éléments y sont rangés, et dit combien.

### Les modèles restent des données

Les façons de ranger proposées par l'assistant sont les modèles de `fixtures/modeles`, lus par un
module virtuel au moment de la construction — le même procédé que la feuille de jetons. Un domaine
s'ajoute en y déposant un fichier, et aucun nom de domaine n'entre dans `apps/app/src`. Les tests
parcourent tous les modèles du dépôt sans une branche par domaine (CLA-12).

`packages/noyau/src` entre à cette occasion dans les zones du garde-fou CLA-01 : il n'y était pas,
et c'est désormais du code que l'assistant traverse.

Qui ne reconnaît aucun modèle nomme sa propre façon de ranger et part d'étiquettes libres ; la
première valeur qu'on y nomme la referme d'un cran, en liste qu'on peut encore étendre. Les mots
de la bibliothèque — ce qu'on repère, ce qu'on écoute, ce qu'on lit — se saisissent au singulier
et au pluriel dans le même temps, et l'aperçu les emploie aussitôt : c'est le seul endroit où le
vocabulaire se décide.

### Ce que les captures ont montré et que les tests taisaient

Les écrans ont été photographiés **dans l'application de bureau elle-même**, à 1320 × 900 points,
en clair et en hybride (`docs/captures/`). La première série a montré trois défauts qu'aucun test
ne pouvait voir :

1. **En hybride, le titre, le fil d'Ariane, les quatre temps et les pieds tombaient directement
   sur la photographie**, illisibles. La charte l'interdit, et rien ne le vérifiait. Tout bloc de
   texte porte désormais son panneau graphite.
2. Une rangée de trois boutons rouges nommés du seul nom de l'axe ne disait pas ce qu'elle
   retirait. Le retrait vit maintenant au pied de la carte qu'il vise, discret.
3. L'intitulé de la carte d'ajout se brisait mot à mot.

Le thème hybride n'est pas une variante décorative : c'est lui qui montre les défauts de charte.
La prise d'image appartient au script et non à l'application, parce que macOS accorde
l'autorisation d'enregistrement d'écran au programme qu'on lance soi-même.

### Ce qui reste ouvert

- **Rouvrir une bibliothèque fermée.** L'application retient les bibliothèques créées pendant la
  session, pas au-delà. Il faudra que l'hôte se souvienne du dossier ouvert, et que l'accueil
  propose d'en ouvrir un. Nécessaire pour la bêta, pas pour l'étape 2.
- **Les exemples sous l'organisation** ne s'affichent que si la bibliothèque a de quoi les nourrir.
  Tant qu'elle n'a rien, l'écran ne montre rien plutôt que d'inventer.


## Lot D2, étape 3 — déposer, et regarder la file tourner

L'écran de dépôt et de traitement, branché sur la file durable et le moteur embarqué. Ce qui a
été tranché en chemin.

### Un travail par document, et non par fichier

Le moteur lit un document **et les médias qui l'accompagnent**, ensemble : c'est ainsi qu'un
élément de la page 127 se relie au bon moment de sa piste. Un travail qui ne porterait qu'un
fichier audio n'aurait donc rien à lire, et ne partirait jamais. Les médias sont copiés dans la
bibliothèque et attendent le document qui les nommera ; l'écran les montre à part, en disant
pourquoi.

Le premier jet en faisait des travaux. Il avait tort, et c'est en branchant le moteur que cela
s'est vu — pas en écrivant la file.

### Déposer, c'est trois choses dans cet ordre

Copier l'original — jamais le déplacer, jamais le modifier —, prendre son empreinte, écrire le
travail avant que rien ne commence (JOB-01). L'ordre compte : un travail écrit avant la copie
désignerait un fichier absent, et une copie sans travail laisserait un fichier que personne ne
viendra lire. Redéposer le même contenu retrouve son travail (JOB-04) : c'est le contenu qui
décide, pas le nom.

### La preuve croisée de la file

L'hôte tient sa file dans sa propre forme — des secondes, des chaînes courtes, ce qui se relit
vite au démarrage — et la page lit un contrat. Sans preuve, les deux dérivent en silence et
l'écran cesse d'afficher quoi que ce soit sans qu'un test s'en plaigne.

`fixtures/travaux-vus.json` est écrit par un test Rust et validé par le contrat TypeScript. Il a
trouvé deux défauts avant même d'exister vraiment :

1. Un travail en file, dont on ne connaît pas encore le total, s'affichait **à cent pour cent** —
   le total inconnu valait zéro, et zéro sur zéro valait un.
2. L'hôte nommait son appareil en clair là où le contrat veut un UUID. Deux installations qui
   s'appelleraient « cet ordinateur » ne se distingueraient plus le jour où elles partagent une
   bibliothèque.

### Ce que l'écran ne montre pas

**Pas de temps restant.** La maquette en portait un ; on ne sait pas à quelle vitesse la suite
ira, et un chiffre qu'on invente est pire qu'un chiffre absent. L'écran écrit ce qu'il sait :
tant de pages sur tant, et le pourcentage qui va avec. Tant que le total est inconnu, il le dit.

**Pas de pourcentage seul non plus.** « 68 % » ne se vérifie pas ; « 194 / 286 » se vérifie.

La phrase d'état suit l'unité que le moteur compte vraiment — « Lecture des pages » ou « Lecture
des pistes » — et les mots viennent de la bibliothèque (CLA-01).

### La fenêtre peut se fermer

Le roulement ne tient à aucune fenêtre : il vit tant que l'application vit. Quitter l'application
arrête les moteurs proprement, lâche les baux, et ce qui a été lu se reprend au prochain
lancement. Une pause, elle, est une décision et non une panne : elle s'écrit dans le fichier du
travail, le fil qui le mène la voit au message suivant, et aucun délai ne la lève (JOB-08).

### La preuve : F3 traité par la file, et non par un appel direct

Les contrôles éprouvent les règles — ce qui part, ce qui attend, ce qu'une pause fait. Ils ne
prouvent pas que la file mène un vrai document de bout en bout. D'où un exemple lancé à la main,
`apps/app/src-tauri/examples/file-sur-corpus.rs`, qui dépose un corpus et regarde la file comme
l'écran la regarde : en la relisant.

Relevé du 8 octobre 2026, sur le volume externe — le disque système n'avait plus que 14 Gio :

| | |
|---|---:|
| Dépôt (1 document, 99 médias copiés) | 2,8 s |
| Durée du traitement, à froid | **197 s** |
| Progression | 29 / 29 pages, par points de reprise successifs |
| Version | écrite puis activée, 179 276 octets |
| **Éléments reliés** | **95 / 95** |
| Appariements / manquants / orphelins | 95 / 0 / 6 |
| À vérifier | 2 |

C'est le critère de F3, obtenu par le chemin complet : dépôt, file durable, moteur embarqué,
version activée. L'étape 1 l'avait prouvé par un appel direct ; il l'est maintenant par la file.

**Deux défauts trouvés en le faisant, et aucun dans le dépôt.** La première passe affichait
« total 0 » d'un bout à l'autre : la chaîne embarquée de ce poste datait de l'étape 1 et n'émettait
pas encore le total. `moteurs/` est ignoré par git et l'intégration continue la reconstruit à
chaque exécution, donc rien n'était faux dans le dépôt — seulement sur ce poste. Mais
`preparer-moteur-node.py` **ne se rejouait pas** sur un poste déjà préparé : écrire par-dessus un
binaire Node déjà signé laisse macOS avec une signature en cache qui ne correspond plus, et `lipo`
échoue sans dire pourquoi. Le script efface désormais avant de copier.

### Ce qui reste ouvert

- **Le glisser-déposer sur le bureau.** Un fichier lâché dans la page n'a pas de chemin, et l'hôte
  ne peut rien copier d'un fichier dont il ne sait pas où il est. Le bouton « Parcourir » ouvre le
  sélecteur du système et donne de vrais chemins ; le glisser-déposer natif de Tauri reste à
  brancher.
- **La manière de lire.** Une bibliothèque sans recette le dit tout de suite — « Apprenez-en une,
  puis reprenez ce travail » — au lieu d'échouer trois minutes plus tard. C'est l'étape 5 qui la
  donnera.
- **Le compteur de l'en-tête de l'application** affiche encore une valeur de démonstration, qui ne
  s'accorde pas avec la file en dessous.


## Lot D2, étape 4 — chercher sur la machine

La recherche ⌘K. Ce qui a été tranché.

### L'index, c'est la vue

Il n'y a pas de second magasin à tenir à jour, donc pas de second magasin à voir diverger — la
même raison qui avait fait appeler `rejouer` à l'instantané. Et tout se passe sur la machine : ce
qu'on cherche dans sa propre bibliothèque ne regarde personne d'autre.

### Deux choses font la qualité d'une recherche, et aucune n'est l'algorithme

**Trouver malgré les accents et la casse** : « detachee » doit trouver « détachée ».

**Montrer où ça correspond dans le texte original** : surligner « détachée », pas « detachee ».
On replie donc le texte **caractère par caractère**, en gardant pour chaque caractère replié la
position du caractère d'origine, puis on revient. Replier d'un coup ne marcherait pas :
`"été".normalize("NFD")` ne fait pas la même longueur que `"été"`, et des positions prises sur la
forme dépliée ne désignent plus rien dans l'originale.

La marque porte un fond **et** un soulignement : le fond seul ne suffirait ni à l'impression ni à
qui ne distingue pas les teintes.

### Ce que le clavier fait, et pourquoi le pied le dit

Les flèches parcourent la liste entière d'un groupe à l'autre et font le tour ; la tabulation
saute au **groupe** suivant, pas à la ligne suivante ; entrée ouvre ; commande-entrée écoute la
piste reliée quand il y en a une ; échap ferme. Une palette qu'on ne pourrait conduire qu'à la
souris n'aurait aucune raison d'exister, et une palette dont on ignore les touches revient au
même.

La suite que les flèches parcourent est calculée par le noyau, pas par l'écran : la recalculer
dans l'écran la ferait diverger de l'ordre affiché.

### Ce qui vient d'où

Les groupes portent les mots de la bibliothèque — « Repères », « Feuillets », « Plages » — et
jamais les nôtres (CLA-01). La piste reliée se trouve aussi par ce qu'on cherche : c'est le même
lien, vu de l'autre bout (ANC-02). Les **actions** viennent de l'écran, qui seul sait où elles
mènent ; le noyau les filtre sur leurs mots, il ne les invente pas.

### Ce que la charte a repris

L'extrait portait le serif de marque, comme la maquette le suggérait. Le garde-fou typographique
l'a refusé : il ne sert qu'au logo et au « Bonjour ». Les maquettes sont illustratives, jamais
typographiques — et c'est un test qui l'a rappelé, pas une relecture.


## Lot D2, étape 5 — montrer où regarder, et l'épreuve REC-07 sur F5

L'éditeur visuel de manière de lire, puis l'épreuve : apprendre à lire un document que
l'application n'a jamais vu, en direct, sans recette écrite à l'avance.

### Les deux temps mesurés

| | |
|---|---:|
| **Découverte brute** — du premier coup d'œil à la cause identifiée | **7 min 05 s** |
| **Découverte complète** — reprise après correction, jusqu'à la conclusion | **2 min 35 s** |
| Total sur le document | **9 min 40 s**, sous les quinze minutes du critère |

Le temps n'a jamais été le problème. Le vocabulaire des recettes l'était, et l'OCR l'est encore.

### Ce que F5 a appris au produit

F5 numérote ses exercices « chapitre.exercice » — 2.1, 2.46 — dans un **cadre en haut à gauche**,
et ne porte aucune pastille de piste. Quatre hypothèses, écrites dans le lecteur, l'ont arrêté :

1. **La bande du haut était interdite aux éléments**, sans appel. Les numéros de F5 y sont.
2. **Un numéro devait répondre à un à trois chiffres.** « 2.46 » n'y répond pas.
3. **La liste de caractères était écrite en dur**, et le champ `alphabet` de la recette n'était
   jamais lu.
4. **Le numéro de page ne se lisait que dans les coins** : une zone tracée pour lui était
   ignorée, et l'éditeur laissait donc dessiner quelque chose qui ne servait à rien.

Les quatre deviennent des données. La forme d'un numéro se donne **par l'exemple** — « ici, un
numéro ressemble à 2.46 » — et non par une syntaxe : l'administrateur n'a pas à écrire une
expression régulière, et nous n'avons pas à lui en montrer une. Deux règles la lisent : chaque
groupe de chiffres vaut un à trois chiffres, tout le reste est repris tel quel. L'ordre suit,
groupe par groupe, chacun comptant pour mille.

La bande du haut reste interdite **sauf si la recette y a tracé sa zone d'éléments**. Une
première version la libérait dès que les numéros de page se lisaient ailleurs ; F3 le supportait,
mais F4 ne peut pas être éprouvé sans solliciter le service de relecture payant, et une règle
qu'on ne peut pas vérifier ne doit pas changer le comportement des recettes existantes.

### Le résultat final : F5 se lit, et ce n'était pas l'OCR

**Une conclusion de cette section était fausse, et il faut le dire avant tout le reste.** Elle
affirmait que l'OCR perdait le point de « 2.1 ». Cela avait été constaté sur un **recadrage
serré**, en segmentation « mot isolé ». En lecture éparse sur la page entière — le mode que le
lecteur emploie déjà, et qui figure parmi ses trois passes — Tesseract rend « 2.1 » avec une
confiance de 96. **Le point ne se perd pas.**

Ce qui bloquait était le **redressement automatique**. Il tourne la page sous le tracé, et la
zone ne désigne alors plus rien : on cherche au bon endroit d'une page qui a bougé. Une manière
de lire neuve ne redresse donc plus — on trace sur la page **telle qu'elle est montrée**. Une
recette qui redresse se rouvre telle quelle : on ne la corrige pas dans le dos de qui l'a écrite.

Avec cela, F5 se lit : **page imprimée 15 reconnue, élément « 2.1 » lu et affiché tel qu'il est
imprimé.**

### La lecture par groupes, qui reste utile

Elle a été implémentée avant que la vraie cause soit trouvée, et elle est gardée : un séparateur
imprimé petit ne survit pas toujours, et l'espace qu'il laisse, lui, survit. Quand la recette
annonce plusieurs groupes **et** que la lecture ordinaire a échoué, on découpe les formes de la
taille d'un chiffre — le découpage que les pastilles emploient —, on coupe aux écarts les plus
larges, et on lit chaque groupe à part.

Deux garde-fous : rien ne s'enclenche sans déclaration, donc F3 et F4 ne rencontrent jamais ce
chemin ; et une coupure franche ou rien, parce qu'un numéro inventé vaut moins qu'un numéro
absent.

### Les trois temps

| | |
|---|---:|
| Découverte brute — du premier coup d'œil à une cause (fausse) identifiée | 7 min 05 s |
| Découverte complète — après les trois ajouts au contrat | 2 min 35 s |
| Troisième passe — lecture par groupes, puis la vraie cause | 3 min 45 s |
| **Total sur le document** | **13 min 25 s**, sous les quinze minutes du critère |

### Ce que le document garde pour lui

Le moteur ne voit que **15 des quelque 96 pages de F5** : les suivantes n'ont pas d'image JPEG
dans le PDF, et l'exportateur comme le lecteur les sautent. L'essai « sur dix pages » n'en montre
donc qu'une d'exercices. Ce n'est pas la manière de lire qui échoue — c'est un encodage que la
chaîne ne couvre pas encore, et qui reste à traiter.

### Ce qui a été vérifié intact

`VERSION_LECTURE` passe à 9 — une lecture porte désormais le numéro tel qu'il est imprimé — ce
qui invalide les caches. **F3 relu entièrement à froid : 95 / 95**, deux pages absentes, six
médias orphelins, en 195 s. F1 exact.

**F4 a été vérifié par son témoin**, qui n'appelle rien et ne dépense rien : `mesures/f4-temoin.ts`
rend **66 / 92 premiers éléments et 77 / 92 pages**, exactement le relevé de référence consigné
plus haut. Sa lecture n'a pas bougé. Le critère lui-même — 84 / 92 — demande la relecture ciblée,
donc le service payant, et rien dans ce lot n'autorisait cette dépense : c'est pourquoi la règle
de la bande a été écrite pour ne rien changer aux recettes décrites par une marge ou un bord, ce
qui est le cas de F4. Un raisonnement de code aurait suffi à s'en convaincre ; une mesure vaut
mieux, et celle-ci ne coûte rien.

### Ce que les captures ont montré

La page occupait toute la hauteur et repoussait la palette hors de l'écran ; l'étiquette d'une
zone proche du bord droit se faisait couper. Les deux sont corrigés. La page montrée par
l'éditeur est dessinée et prend ses couleurs des jetons : elle suit le thème, et le garde-fou des
couleurs en dur n'a pas eu à être desserré pour elle.


## Lot D2, étape 6 — les écrans lisent la bibliothèque, et non un instantané

Cette étape devait être un allègement et des finitions. Elle a surtout servi à trouver trois trous
qu'aucun test ne montrait, **parce que chaque écran, pris seul, fonctionnait**. C'est le parcours
complet qui les aurait rencontrés, et c'est pour cela qu'il a été fait ensuite.

**Les écrans ne savaient lire qu'un instantané servi par le serveur de développement.** Sur le
bureau il n'y en a pas : après un traitement, Vérifier et le Lecteur n'avaient rien à montrer
alors que le dépôt avait tout. Ils lisent maintenant la version active de la bibliothèque
ouverte, relue après chaque traitement — c'est lui qui en pose une nouvelle (JOB-06).

**Les images de page n'étaient nulle part.** Elles arrivent à la demande, une par une : un
document de trois cents pages pèse des centaines de mégaoctets et le Lecteur n'en montre qu'une.
Elles reviennent dans la réponse de l'hôte, jamais par un chemin que la page irait lire elle-même.

**Une bibliothèque créée n'apparaissait pas à l'accueil** : on retombait sur l'écran du premier
lancement alors qu'on venait de la créer. Elle s'y montre désormais, traitée ou non — « rien de
traité pour l'instant » vaut mieux que l'absence.

Quant à l'allègement lui-même, il reste où la décision du 6 octobre l'a mis : **après la bêta**,
et sans toucher la chaîne. Rien dans cette étape n'a donné de raison de l'avancer.

## Lot D2, étape 7 — le parcours entier, sans ligne de commande

De la création à la lecture, sur F3, chaque pas étant exactement ce qu'une commande de l'hôte
fait quand un écran l'appelle. Aucun chemin propre à l'essai :
`apps/app/src-tauri/examples/parcours-complet.rs`.

| Pas | Durée | Ce qu'il a donné |
|---|---:|---|
| Créer la bibliothèque | 0,0 s | elle existe, sa description est écrite |
| Écrire son organisation | 0,0 s | le schéma est enregistré |
| Déposer | 3,1 s | 1 travail, 99 médias, 0 refusé |
| Montrer une page à l'éditeur | 2,7 s | 3 pages exportées |
| Enregistrer la manière de lire | 0,0 s | — |
| Traiter | 228,3 s | version écrite **puis** activée (JOB-06) |
| Relire la bibliothèque | 0,0 s | 28 pages, **95 / 95 éléments reliés**, 2 à vérifier |
| Montrer une page au Lecteur | 0,0 s | image disponible |
| **Total** | **234 s** | du premier geste à la lecture |

Le parcours a été rejoué sous `/usr/bin/time -l` pour en connaître le coût en mémoire : **224 s**,
mêmes 95 / 95, et **643 Mio de pointe** pour le plus lourd des processus de la chaîne, hôte et
moteur confondus. C'est le tiers du plafond de 2 Go qu'un moteur doit pouvoir toucher sans rompre,
et c'est le chiffre qui compte ici : le traitement tourne dans un processus annexe, un par travail,
et c'est lui qui porte la charge. Les deux temps, 234 s et 224 s, mesurent la même chose sur la
même machine à dix secondes près — un parcours de cet ordre ne se mesure pas plus finement.

**Ce que cet essai ne fait pas : cliquer.** Les douze captures de `docs/captures/` montrent les
écrans ; cet essai montre que ce qu'ils demandent répond, dans l'ordre, sur un vrai corpus. Les
deux ensemble couvrent le parcours ; ni l'un ni l'autre ne le couvre seul, et il faut le dire
plutôt que de laisser croire qu'une main a tenu la souris.


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

**L'état de F4, pour mémoire : 73 premiers éléments sur 92 et 83 pages sur 92**, pour un critère de
83 et 89. Il manque 10 éléments et 6 pages. Depuis le vrai point de départ — 55 et 67 — le gain
cumulé de la relecture ciblée et de l'inventaire est de **+18 éléments et +16 pages**. F3 reste à
95 / 95 : sa recette ne déclare aucun changement de support, et l'inventaire ne lui change rien.

### Ce que l'inventaire ne décide jamais

Un repère lu le contredit toujours. Si une pastille donne une piste au-delà de ce que l'inventaire
connaît, c'est l'inventaire qui est incomplet, pas la page : la piste lue est attribuée. Un test le
retient, parce que c'est la différence entre un indice et une vérité.

## Les dix pistes qui commencent trop tôt : l'ordre est hors de cause

Il restait, après l'inventaire, dix pistes justes dont le **premier** élément était faux. L'hypothèse
à éprouver d'abord était un problème d'ordre de lecture — double page, bas de page gauche suivi du
haut de page droite, colonnes.

**Elle est réfutée.** Dans les dix cas, l'élément que la chaîne retient vient *avant* celui de
l'oracle dans l'ordre de lecture normal : même page et hauteur plus faible, ou page antérieure.
L'ordre est juste ; c'est la piste qui commence trop tôt. Les pages arrivent bien cliché par cliché,
gauche puis droite, et les numéros d'élément sont tous dans la même colonne — il n'y a pas de
deuxième colonne à mal ordonner.

### La vraie cause

Les éléments retenus à tort portent des lectures **partielles** que la suite résout correctement :
él.335 lit « 3 », qui est bien un 38 tronqué, et l'attribution l'y place parce que ses voisines le
permettent. Mais un élément plus loin — él.337 — porte la lecture franche « 38 », et c'est lui qui
ouvre la piste.

| Piste | La chaîne retient | L'oracle veut |
|---|---|---|
| 38 | él.335, lit « 3 » | él.337, lit « 38 » |
| 44 | él.407, lit « 4 » | él.409, lit « 44 » |
| 60 | él.527, lit « 1 » | él.533, lit « 60 » |
| 70 | él.587, lit « 46 » | él.589, lit « 70 » |

### La correction qui s'en déduisait, et pourquoi elle est écartée

Un repère marque un début : un élément placé avant le repère de la piste N appartient à N−1. La
règle est générique, et la recette dit déjà que plusieurs éléments peuvent partager une piste.

Mesurée : **5 pistes redressées, 12 abîmées.** Les premiers éléments tombent de 73 à 66.

Dans chaque cas abîmé, le bon premier élément portait une lecture partielle et un élément plus loin
lisait la piste franchement — exactement la configuration qu'on voulait corriger, mais à l'envers.
Le signal est donc faux aussi souvent qu'il est juste, parce que plusieurs éléments partagent une
piste et que rien, dans la lecture seule, ne distingue un vrai repère d'une forme qui lui ressemble :
la présence vaut 0,26 à 0,51 des deux côtés, et l'accord 1,00 des deux côtés aussi.

Ce qui manquerait pour trancher est de savoir **lequel des deux porte vraiment le repère**. La
relecture ciblée ne le dit pas non plus : elle lit un nombre dans un pavé, elle ne juge pas si ce
pavé est un repère. Le raisonnement reste en commentaire dans `interprete.ts` pour qu'on ne le
refasse pas sous cette forme.

### L'état de F4

**73 premiers éléments sur 92 et 83 pages sur 92**, pour un critère de 83 et 89. Il manque 10
éléments et 6 pages, et aucune des causes restantes n'est un défaut de lecture de repère.

## Où en est-on vraiment : le lot C est clos, F4 relève du lot D

Une précision de statut, prise à la source. La feuille de route du CDC normatif v2.0 donne, lot par
lot, un critère de passage :

| Lot | Critère de passage |
|---|---|
| **C — Première bibliothèque** | fichier renommé reconnu ; arrêt et redémarrage sans perte ; correction conservée après recalcul ; **F3 ≥ 95/95 ; F1 exact** |
| **D — Deuxième corpus** | **F4 ≥ 83/92 automatique** ; généralisation sans code spécifique ; nouvelle recette dérivée en moins d'un quart d'heure |

Le critère du lot C est donc tenu, et **le lot C est clos**. F4 relève du lot D, commencé en avance
— le CDC note d'ailleurs que la relecture ciblée (OUT-08), qui appartient au lot D, a été avancée
au lot C pour F4.

**Une nuance qui compte pour la suite.** Le critère normatif est le nombre de **premiers éléments**,
83 sur 92. Les 89 pages sur 92 que nous suivons depuis le début sont une mesure que nous nous
sommes donnée, utile mais non normative : c'est le premier chiffre qui décide du passage du lot.

### État à l'ouverture du lot D

| | |
|---|---|
| F4 | **73 / 92** premiers éléments (critère 83) et 83 / 92 pages |
| F3 | **95 / 95**, vérifié à froid |
| Relecture ciblée | en place, agrandissement ×2, 95 % de justesse sur les pavés jugeables |
| Dépensé à ce jour | **0,061 €**, et un rejeu ne dépense rien |

Il manque **10 premiers éléments**. Aucune des causes restantes n'est un défaut de lecture de
repère : elles butent sur la distinction entre un vrai repère et une forme qui lui ressemble, et sur
des éléments que la lecture ne voit pas du tout.

## La dette du test de présence : une correction, et une erreur de ma part

Le lecteur acceptait encore des éclats du seuillage — trois pixels de large pour dix-huit de haut —
parce que son test de présence jugeait le remplissage et la hauteur, jamais la largeur. La sélection
des pavés s'en protégeait de son côté, ce qui soignait le symptôme.

### La règle, et où elle appartient

Elle est la même que celle du comptage des chiffres et de la sélection : une forme qui porte un
chiffre est à peu près aussi large que haute. Mesurée sur les clichés de référence, les vrais pavés
vont de 0,71 à 1,07, les éclats 0,10 et 0,17 ; le seuil se tient à **0,35**. Elle est maintenant
définie une seule fois, dans le lecteur, et la sélection l'importe — trois copies d'un nombre mesuré
finissent par diverger.

**Mais la poser dans la présence seule ne suffisait pas, et dégradait.** Un éclat est plus plein
qu'un pavé, dont les chiffres clairs font des trous : 1,0 contre 0,7. Il était donc proposé comme
« la plus pleine des formes », et la présence ne jugeant que cette première forme, l'écarter faisait
abandonner **tout le repère** alors que le pavé était là, à côté. Cinq premiers éléments perdus.

La correction appartient au **choix de forme** : un éclat n'y est plus proposé, et le pavé redevient
la première forme. Un test porte le cas réaliste — éclat plein à 1, pavé troué à 0,7 — parce qu'un
premier essai avec deux formes également pleines ne reproduisait rien, la plus grande gagnant déjà.

### Une erreur de cache, à consigner

La première mesure de la correction a porté sur les **anciennes** lectures : changer le choix de
forme modifie ce qu'une lecture rend, et je n'avais pas remonté `VERSION_LECTURE`. Le cache de la
version 7 — celle qui avait le défaut — a donc été servi, et le chiffre lu était faux.

C'est exactement ce que cette version existe pour éviter, et le dépôt le documentait déjà depuis le
lot C. La version 8 porte la règle entière ; la 7 n'a jamais été mesurée pour elle-même.

### L'effet, mesuré séparément

| | Premiers éléments | Pages |
|---|---:|---:|
| Témoin, avant | 60 / 92 | 76 / 92 |
| Témoin, après | **61 / 92** | **77 / 92** |
| Avec relecture, avant | 73 / 92 | 83 / 92 |
| Avec relecture, après | **74 / 92** | **84 / 92** |

Sur les treize clichés de référence : **19 pavés retenus** au lieu de 18, dont 15 que l'oracle juge
à relire, et l'angle mort reste **nul**. Les deux pavés supplémentaires ont coûté 0,0016 €.

Un élément et une page. La dette était réelle — deux faux repères sur 141 — mais ce n'est pas elle
qui tiendra le critère : il manque encore 9 premiers éléments.

## La relecture dit aussi si un repère est là (lot D, étape 3)

Le reste de F4 ne venait plus d'un défaut de lecture mais d'un défaut de **jugement** : une lecture
seule ne dit pas si ce qu'elle a lu **est** un repère, et la détection locale tirait trois fois trop
souvent — 288 repères localisés pour 92 pistes. La relecture rend donc, pour chaque pavé, un verdict
de présence en plus du nombre.

### Ce que cela donne

| | Témoin | Avec verdicts | Critère |
|---|---:|---:|---:|
| Premiers éléments | 61 / 92 | **76 / 92** | **83** |
| Pages | 77 / 92 | **86 / 92** | *(89, non normatif)* |

| Cause d'écart | Avant | Après |
|---|---:|---:|
| Dispute d'ouverture | 19 | **7** |
| Piste fausse | 8 | **5** |
| Élément non lu | 4 | 4 |

Verdicts sur 243 pavés : **200 présent, 31 absent, 12 incertain**. Les 31 « absent » sont le levier —
autant de faux repères qui ne peuvent plus ouvrir une piste.

Le gain est réel et plus petit qu'il n'y paraît : les disputes passent de 19 à 7, mais le total ne
gagne que deux éléments sur l'étape 1. La relecture redresse 22 éléments et en abîme 7 — trancher
une ouverture en déplace d'autres.

### Les marges : troisième mesure, troisième fois rien

On a sondé les marges là où la numérotation montre un trou, pour les éléments dont aucun numéro n'a
été lu. Résultat : **zéro élément et zéro page gagnés**, 193 recadrages demandés dont 83 refusés par
le contrat — une bande de marge dépasse 1024 px à l'agrandissement ×2 —, et 18 numéros faux sur 151
jugeables, le modèle y lisant des numéros de page.

La voie est éteinte, pas fermée : `--marges` la rallume pour qui la reprendra avec un recadrage plus
étroit, et ces chiffres disent ce qu'il faudra battre.

### Quatre défauts de ma conception, trouvés par la mesure

**Le cache servait le passé.** 141 des 243 pavés revenaient sans verdict : la lecture du cache ne
savait pas quelle question était posée, donc une entrée d'avant l'extension passait pour valide. Elle
reçoit maintenant la question, et une entrée qui n'y répond plus est redemandée **une fois** — un
test vérifie « une fois, pas à chaque passage ».

**Le modèle recopiait mal l'empreinte.** Demandé « …ff786… », rendu « …ff746… » : un caractère sur
trente-deux, et toute la réponse refusée pour une zone inconnue. Faire recopier trente-deux
caractères hexadécimaux était une mauvaise idée ; le modèle rend un **rang** — « Image 1 » — et
l'empreinte reste notre clef, de notre côté. Un rang hors de la demande est refusé.

**Mon contrat refusait une réponse cohérente.** « Rien de lu ne se dit pas avec une confiance » était
juste tant qu'une réponse ne portait qu'un nombre. Le verdict l'a rendue fausse : « le repère est là,
ses chiffres sont illisibles, et j'en suis sûr » est cohérent, et la confiance y porte sur le
verdict. La règle est relâchée **sur preuve** et ne s'applique plus qu'en l'absence de verdict.

**Une panne ne se diagnostiquait pas.** Un 502 ne disait pas s'il venait du modèle, du contrat ou du
recoupement. Le transport relaie désormais le message de **notre** route, et le refus de contrat
nomme le chemin du champ fautif — jamais les valeurs reçues, qui viennent du modèle. C'est ce
changement qui a permis de nommer les deux causes précédentes en une commande.

### Le coût, versé au compte

| Mesure | Jetons entrée | Jetons sortie | Coût |
|---|---:|---:|---:|
| Étape 1, deux pavés nouveaux | 1 179 | 117 | 0,0016 € |
| Étape 3, première passe (invalide, cache sans verdict) | 56 413 | 9 750 | 0,0974 € |
| Étape 3, passe valide | 8 363 | 1 881 | 0,0165 € |
| **Cumul du lot D** | **65 955** | **11 748** | **0,1155 €** |

La passe invalide est comptée : elle a été dépensée. Un rejeu complet coûte désormais **0 €** — les
353 réponses sont en cache.

## L'oracle de F4 était faux sur sept pistes, et la page l'a tranché

Le CSV `Westwood_Vol1_CD1_pistes.csv` porte trois colonnes qu'il ne faut pas confondre :
`premier_exercice_detecte` est une **détection du prototype**, `exercice_selon_nom_mp3` est ce que
le **nom du fichier** annonce, et `accord` dit si les deux coïncident. Ce que nous appelions
« l'oracle » depuis le début était donc une détection, pas une vérité — et elle était en désaccord
avec le nom du MP3 sur neuf pistes sur quatre-vingt-douze.

### Le seul témoin qui fait foi est la page

Les trois témoins ont été confrontés à l'œil, sur les clichés, pour onze pistes.

| Piste | Notre chaîne | Détection | Nom MP3 | Ce que la page montre | Qui a raison |
|---|---|---|---|---|---|
| 4 | 132 | **135** | 133 | 132 porte « Piste 3 », 135 porte « Piste 4 » | la détection |
| 14 | **189** | **189** | 187 | 187 porte « Piste 13 », 189 porte « Piste 14 » | la chaîne et la détection |
| 35 | 305 | **314** | 314 | 305 porte « Piste 34 » | la détection |
| 41 | **400** | 348 | **400** | 348 porte « Piste 40 », 400 porte « Piste 41 » | la chaîne et le nom |
| 43 | **405** | 407 | **405** | 405 porte « Piste 43 » | la chaîne et le nom |
| 57 | **512** | *rien* | **512** | 512 porte « Piste 57 » | la chaîne et le nom |
| 74 | **598** | 599 | **598** | **598 et 599 portent tous deux « Piste 74 »** | la chaîne |
| 75 | **600** | 601 | **600** | 600 porte « Piste 75 » | la chaîne et le nom |
| 87 | 700 | **701** | **701** | 700 porte « Piste 86 » | la détection et le nom |
| 89 | 704 | 704 | **706** | 704 porte « Piste 88 », 706 porte « Piste 89 » | le nom seul |
| 91 | **713** | 712 | **713** | 712 porte « Piste 90 », 713 porte « Piste 91 » | la chaîne et le nom |

Le nom du MP3 se trompe (piste 14), la détection se trompe (sept fois), notre chaîne se trompe
(pistes 4, 35, 87, 89). **La page, elle, n'a jamais menti.** C'est ce que la recette disait déjà du
nom de fichier — un indice, pas une vérité (REC-05) — et il faut le dire aussi de la détection.

### Un fait de structure que nous ignorions

**Les éléments 598 et 599 portent tous deux « CD1 Piste 74 ».** Le livre imprime donc la pastille
sur **chaque** élément d'une piste, pas seulement sur le premier. La détection de repère ne tirait
pas trois fois trop souvent : elle voyait de vrais repères. Mon diagnostic de l'étape 2 — « la
détection tire trois fois trop souvent » — était une mauvaise lecture d'un fait qui n'en est pas un
défaut, et la règle « le premier élément à porter le repère ouvre la piste » est juste.

### Les sept corrections, chacune avec sa preuve

| Piste | Avant | Après | Preuve lue sur le cliché |
|---|---|---|---|
| 41 | 348 | **400** | 348 porte « CD1 Piste 40 » ; 400 porte « Piste 41 » |
| 43 | 407 | **405** | 405 porte « CD1 Piste 43 » |
| 57 | *rien* | **512** | 512 porte « CD1 Piste 57 » |
| 74 | 599 | **598** | 598 et 599 portent « Piste 74 » ; 598 vient en premier |
| 75 | 601 | **600** | 600 porte « CD1 Piste 75 » |
| 89 | 704 | **706** | 704 porte « Piste 88 » ; 706 porte « Piste 89 » |
| 91 | 712 | **713** | 712 porte « Piste 90 » ; 713 porte « Piste 91 » |

Seule la colonne `premier_exercice_detecte` est corrigée, et la colonne `accord` recalculée : la
liste des éléments détectés n'a pas été vérifiée élément par élément, et reste donc telle quelle.

### Ce que cela change

| | Avant correction | Après correction |
|---|---:|---:|
| Témoin | 61 / 92 | **66 / 92** |
| Avec verdicts | 76 / 92 | **81 / 92** |
| Pages | 86 / 92 | 86 / 92 |

Il manque **2 premiers éléments** sur le critère normatif de 83. Les écarts restants : 5 disputes,
3 pistes fausses, 3 éléments jamais lus.

### L'audio n'est pas un témoin fiable, avec les moyens d'ici

Compter les segments d'une piste par ses silences ne retrouve pas le nombre d'éléments : la piste 4
(un élément) montre deux creux internes, la 91 (trois éléments) en montre deux, la 74 (deux
éléments) en montre un à trois selon le seuil. Le compte dépend du seuil et pas du contenu.

Ce n'est pas la fin de l'idée : un détecteur de **décompte** — les quatre temps qui ouvrent chaque
exercice — serait une autre méthode, et probablement meilleure. Mais elle demande davantage qu'un
seuillage d'énergie, et la machine n'a ni ffmpeg ni ffprobe. En l'état, l'audio ne peut pas servir
d'indice à l'attribution.

## Le troisième témoin tient le critère : F4 à 84/92, partie 1 du lot D close

Deux témoins qui se contredisent ne se départagent pas. La lecture locale et une première relecture
en font deux ; il en faut un troisième, et il doit **regarder autrement** — redemander la même image
rendrait la même réponse, et la troisième voix n'en serait pas une.

### La règle

Quand la lecture locale et la relecture se contredisent — au sens strict : aucun des deux nombres ne
contient l'autre, ce que dit déjà `appui` —, on redemande sur une **autre image du même repère**,
au double de l'agrandissement de la recette : même pavé découpé, rééchantillonné autrement, donc
d'autres pixels et une autre empreinte. Deux voix sur trois l'emportent. Sans majorité, rien n'est retenu et
l'élément part se faire vérifier, plutôt que d'être appliqué au hasard.

À égalité, on s'abstient. Préférer « la première » ou « la plus confiante » serait une préférence
déguisée en règle, et la mesure a montré que la confiance ne sépare rien.

### L'effet, isolé

| | Avant | Après |
|---|---:|---:|
| Premiers éléments | 81 / 92 | **84 / 92** |
| Pages | 86 / 92 | **89 / 92** |
| Disputes d'ouverture | 5 | **2** |

39 contradictions relevées ; **29 tranchées par deux voix sur trois**, 10 sans majorité portées à
Vérifier. Coût du second passage : **0,0140 €**.

### Ce qui avait échoué juste avant, et pourquoi c'était instructif

On avait d'abord essayé de **préférer la lecture locale** quand la relecture la contredit, parce que
trois pistes se perdaient ainsi. La règle coûte quatre éléments de plus qu'elle n'en rend — 81 à 77.
Confrontées à l'oracle : quand l'un des nombres contient l'autre, la relecture a raison 56 fois
contre 0 ; quand ils se contredisent, 11 fois contre 3. **La relecture l'emporte dans les deux cas**,
et il ne fallait donc pas la démettre, mais lui opposer un témoin de plus.

### Le critère du lot D, partie 1

| | Mesure | Critère |
|---|---:|---:|
| **F4, premiers éléments** | **84 / 92** | **83** ✓ |
| F4, pages | 89 / 92 | *(89, non normatif)* ✓ |
| **F3** | **95 / 95** | 95 ✓ |

Le critère normatif du lot D — « F4 ≥ 83/92 automatique » — est **tenu**. F3 est vérifié à froid,
lecture réelle de 190 s, rejeu identique (REC-02).

Un rejeu complet de F4 ne dépense **rien** : les deux passes de relecture sortent du cache et le
résultat est identique, ce qui est la condition même du banc d'essai (OUT-15).

### Le reliquat

Huit écarts : 2 disputes d'ouverture, 3 pistes fausses, 3 éléments jamais lus. Aucun n'empêche le
critère. Les trois éléments jamais lus restent hors de portée de la relecture — la sélection ne peut
envoyer que ce que le lecteur a localisé.

### Ce qui reste à faire passer en production

L'enchaînement des deux passes vit aujourd'hui dans le banc de mesure ; la règle de majorité et la
détection de contradiction, elles, sont dans la bibliothèque et testées. Porter l'enchaînement dans
la chaîne de lecture est un travail d'intégration, pas de recherche.

## La dette d'intégration levée : un seul chemin de code, du lot aux écrans

L'enchaînement de la relecture ciblée vivait dans le banc de mesure. Le critère du lot D était donc
tenu par un script, pas par le produit. Trois choses ont été portées, et une quatrième est apparue
en chemin.

### Un port, pas un appel

`rejouer` accepte désormais une **relecture** — une fonction qu'on lui branche, qui reçoit les pages
lues et rend ce qu'elle a relu. La relecture vit dans `outils/vision`, qui dépend des recettes ;
c'est donc l'appelant qui la branche, jamais la chaîne qui va la chercher. Une chaîne sans relecture
est exactement la même chaîne, elle ne relit simplement rien : l'application, le banc et le script
de traitement passent par la même fonction, avec ou sans.

`relectureCiblee` enchaîne ce que les mesures avaient établi : première passe au grossissement de la
recette, verdict de présence compris ; seconde passe au double, sur une autre image du même pavé,
pour les seules contradictions ; majorité de deux voix sur trois ; sans majorité, rien n'est appliqué et
l'élément part à Vérifier. Budget, cache par empreinte et arrêt net sont dans `relire` : ils valent
donc pour ce chemin comme pour le banc, puisque c'est le même.

### L'instantané ne refait plus le travail de la chaîne

`instantaneDeLot` réimplémentait lecture, interprétation et association. Ce second chemin avait déjà
divergé en silence : l'inventaire des supports présents, ajouté à la chaîne pour départager les
disques, n'arrivait jamais aux écrans. Il appelle maintenant `rejouer`, et rien d'autre.

C'est la règle de fond, et elle a resservi deux fois dans ce lot : **ce qu'on montre doit sortir du
traitement qu'on mesure.** Deux calculs pour un même fait finissent toujours par en donner deux.

### Le banc appelle la chaîne, et plus l'inverse

`mesures/f4-vision.ts` orchestrait 500 lignes de lecture, de sélection et d'appels. Il en fait 150 :
deux `rejouer`, l'un sans relecture pour le témoin, l'autre avec, et la comparaison à l'oracle. Ce
qu'il mesure est, par construction, ce que l'application fera.

### Ce que l'écran a trouvé, et que personne n'avait vu

La capture de Vérifier sur F4 montrait **vingt-trois cartes « manque au document »** pour des pages
qui y sont — des pages de texte, sans aucun élément numéroté. L'instantané déduisait les pages
absentes des numéros portés par les éléments : une page sans élément devenait une page manquante.
Sur F3, où les deux seules pages sans élément étaient justement les deux pages sautées, la déduction
tombait juste et personne ne pouvait voir qu'elle était fausse.

L'interprète, lui, le sait vraiment : il suit le décalage entre le rang d'une page et son numéro
imprimé, et quand ce décalage augmente durablement, il dit quelles pages le scan a sautées. Ce
verdict traverse maintenant jusqu'à la vue, et l'aide `trous` qui servait à le redeviner a disparu
avec son unique usage.

| | Avant | Après |
|---|---:|---:|
| F4, pages dites manquantes | 23 | **0** *(aucune ne manque)* |
| F3, pages dites manquantes | 2 | **2** *(30 et 31, inchangé)* |

Troisième fois dans ce lot qu'un second calcul du même fait donne une fausse vérité. C'est la capture
d'écran qui l'a révélé, pas un test : aucun des deux lots n'était assez différent de l'autre pour
que la suite le voie.

### La mesure, par la chaîne réelle

Même oracle, même fixture, mais plus rien d'un script : les deux colonnes sortent de `rejouer`.

| | Témoin | Chaîne | Critère |
|---|---:|---:|---:|
| **F4, premiers éléments** | 66 / 92 | **84 / 92** | **83** ✓ |
| F4, pages | 77 / 92 | **89 / 92** | *(89, non normatif)* ✓ |
| **F3** | — | **95 / 95** | 95 ✓ |

Le témoin est plus bas qu'au relevé précédent (66 contre 81) parce qu'il est maintenant *vraiment*
sans relecture : l'ancien banc lui laissait le bénéfice de la première passe. La colonne de droite
est la seule qui compte, et elle est inchangée.

Effet par cause : disputes d'ouverture 19 → 2, pistes fausses 4 → 3, éléments jamais lus 3 → 3.
La relecture a été appliquée 146 fois, laissée sans corroboration 19 fois, restée sans majorité 4
fois. **Rejeu à coût nul** : 243 zones à la première passe et 39 à la seconde, toutes servies par le
cache, 0,0000 € et résultat identique (REC-02).

F3 est vérifié à froid par la chaîne unifiée : 95 / 95, deux pages absentes, six médias orphelins,
rejeu identique, pointe de mémoire 1,1 Go.

### Ce que Vérifier montre sur F4

65 cas : 60 liens sous le seuil, **4 relectures sans majorité**, 1 média qu'aucun élément ne réclame.
Les quatre relectures sans majorité portent leur motif en clair — « repère relu deux fois sur des
images différentes, sans que deux lectures s'accordent » — et la preuve « vision » (ANC-02). Aucune page
manquante, parce qu'il n'en manque aucune.

Le contrôle complet passe dans les conditions de l'intégration continue : fixtures privées écartées,
`pnpm install --frozen-lockfile`, aucun cache de travail.

## Lot D2 — clôture

Quatre questions attendaient une décision à la fin du lot. Aucune n'appelle de code ; toutes
appellent d'être écrites, faute de quoi elles se reposeront.

**L'agencement d'un paquet Windows installé** reste à trancher, et ce sera à la phase Windows. La
réserve ouverte au lot 0 ne bloque pas la bêta macOS : l'intégration continue construit le paquet
Windows et en publie la taille, c'est tout ce qu'on lui demande d'ici là.

**Le critère F4, 84 / 92, ne sera pas revérifié.** Il demande la relecture ciblée, donc le service
payant, et le témoin gratuit répond à la seule question qui se pose en pratique : la lecture
a-t-elle bougé ? Elle n'a pas bougé — 66 / 92 et 77 / 92, identiques au relevé de référence. On
repassera la mesure complète **si cette zone du code est retouchée**, pas avant. La règle est
écrite en tête de `outils/ingestion/mesures/f4-temoin.ts`, là où elle sera lue.

**Les 81 pages de F5 que le moteur ne voit pas** restent en l'état : leurs images ne sont pas des
JPEG que le lecteur de format sait extraire. F5 reste donc une fixture partielle, utile telle
quelle — elle a servi à l'épreuve REC-07 et elle se lit —, et l'extraction manquante est le sujet
d'un lot futur, pas une dette de celui-ci.

**L'allègement du moteur** reste après la bêta, sans toucher la chaîne : la décision du 6 octobre
est confirmée telle quelle.

## Lot E1 — journal de construction

Le plan approuvé est `docs/lot-e-proposition.md`. Ce journal dit ce qui existe réellement, étape
par étape. Chaque étape vérifie, et consigne, que **rien de réel n'a bougé** : l'ancienne base de
Studio Clinique doit porter 22 022 passages et peser 168 738 816 octets, comme au 9 octobre 2026.

### Étape 1 — le registre (faite le 9 octobre 2026)

| | |
|---|---|
| Base | `lienotheque-registre`, D1, **région WEUR** choisie explicitement (HEB-05) |
| Schéma | `bibliotheque_publiee` et `journal_audit` — aucune colonne binaire (HEB-02) |
| Migrations | engendrées depuis `MIGRATIONS_REGISTRE_EN_LIGNE`, appliquées à distance |
| Contrôle | `therapeute-library` : 22 022 passages, 168 738 816 octets, **0 écriture** |

**Les migrations D1 ne s'écrivent pas à la main.** Elles sont engendrées depuis les tableaux de
`packages/depot-sqlite/src/migrations.ts` par `pnpm build`, et un test compare les fichiers du
disque à ce que le générateur rendrait. Sans lui, le schéma local et le schéma en ligne divergent
le jour où quelqu'un corrige un seul des deux — et la divergence ne se voit qu'au moment où elle
coûte cher. Chaque fichier engendré porte en tête d'où il vient, parce qu'un fichier engendré qu'on
prend pour une source se fait corriger à la main une fois, et une seule.

**Une place nommée plutôt qu'un identifiant.** Le registre ne retient pas l'identifiant de la base
d'une bibliothèque mais la **place** qu'elle occupe dans une réserve de liaisons déclarées
(`BIB_1`…`BIB_4`). C'est ce qui permet au Worker de n'avoir aucun jeton de compte : il ne crée ni
ne supprime de base, il lit celle qu'on lui a reliée. SEC-08 est tenue par construction, pas par
discipline. Le prix est assumé : publier une bibliothèque de plus est un déploiement, pas un clic.

Le registre porte aussi le **journal d'audit** (SEC-07) dès cette étape, plutôt qu'après coup : une
opération sensible qui n'est pas journalisée au moment où on l'écrit ne le sera jamais.

### Étape 2 — le schéma d'une bibliothèque, et la réserve (faite le 10 octobre 2026)

| | |
|---|---|
| Base | `lienotheque-essai`, D1, région WEUR — **nommée pour qu'on ne la confonde jamais avec une vraie** |
| Schéma | les deux migrations de `MIGRATIONS`, appliquées à distance : 15 tables |
| Réserve | `BIB_1` déclarée et reliée ; les suivantes s'ajouteront quand une bibliothèque en aura besoin |
| Contrôle | `therapeute-library` : 22 022 passages, 168 738 816 octets, **0 écriture** |

**La réserve se lit, elle ne se redéclare pas.** `placesDeclarees` parcourt les liaisons que
l'hébergeur fournit vraiment et ne retient que celles qui sont des bases. Une liste écrite à deux
endroits finit par diverger, et le jour où elle diverge, le Worker propose une place qui ne mène à
aucune base. Une place proposée est une promesse d'hébergement.

**Aucune place vide n'a été créée d'avance.** Déclarer `BIB_2` à `BIB_4` imposerait de créer trois
bases que personne n'utilise. La mécanique est éprouvée par les tests sur une réserve de quatre ;
la quatrième base existera le jour où une quatrième bibliothèque la réclamera.

**Le garde-fou qui compte** se vérifie sur le fichier de configuration lui-même : aucune liaison
vers `therapeute-library` ni vers `clone-proxy`. Le test lit les **déclarations** et non les
commentaires — le fichier parle de clone-proxy, c'est tout le propos de son avertissement en tête,
et un test qui confondrait les deux interdirait d'expliquer un danger là où il se présente.

Deux noms ont été corrigés en chemin par le typage : `placesLibres` existait déjà pour les places
de la file de travaux. Les liaisons libres s'appellent donc `liaisonsLibres`. Deux choses
différentes ne doivent pas porter le même nom, et c'est le compilateur qui l'a dit en premier.

### Étape 3 — la sauvegarde, et ce qu'elle a révélé (10 octobre 2026)

**Une découverte avant la mesure : le texte des passages ne vit pas dans la base.** `Ancre` porte
une position — une zone, un temps, une page —, jamais un texte. Le texte lisible d'une
bibliothèque vit dans la **vue**, un fichier JSON posé à côté de la base, que la recherche locale
parcourt en entier.

C'est tenable pour une bibliothèque ouverte sur un ordinateur. Ça ne l'est pas pour une
bibliothèque servie : chaque requête devrait rapatrier la vue entière avant de chercher dedans. Et
la façade de compatibilité le réclame en clair — elle doit rendre un champ `content`. **Un texte
qui n'existe que dans un fichier JSON ne se cherche pas en SQL.**

D'où une table `passage` (migration 3), ajoutée maintenant et non à l'étape 9, pour deux raisons.
La première est que le chronomètre de SEC-10 doit porter sur le schéma qui tiendra vraiment les
données : restaurer une base de métadonnées puis annoncer un temps serait mesurer autre chose. La
seconde est qu'une table qu'on découvre nécessaire à l'étape 9 est une migration de plus sur une
base déjà en service.

Ce n'est pas un second magasin à tenir à la main : la table est **produite** depuis la vue au
moment où une version est activée, et refaite si la version change. La vue reste ce qui fait foi.

**L'épreuve, chronométrée (SEC-10).** Sur une base d'essai semée de 22 022 passages de texte
inventé — le compte de la bibliothèque à reprendre, avec sa longueur moyenne de passage, parce
qu'un chronomètre pris sur des lignes courtes ne dirait rien :

| | |
|---|---:|
| Semence | 85 Mo poussés en **84,6 s** |
| Sauvegarde, vers le volume externe | 85,4 Mo en **74,5 s** |
| **Restauration**, dans `lienotheque-restauration-essai` | **17,9 s** |
| Comparaison | 16 tables, **aucun écart** |

La restauration est quatre fois plus rapide que la sauvegarde. C'est rassurant dans le bon sens :
le geste qu'on fait sous la contrainte est le moins long des deux.

**Ce que l'épreuve ne couvre pas, et pourquoi elle n'a pas à le couvrir.** Les objets du
compartiment ne sont pas sauvegardés : ils sont adressés par leur empreinte, jamais réécrits, et
l'ordinateur en garde l'original. **R2 est la copie, le Mac est l'original.** La sauvegarde des
fichiers, c'est le dossier de la bibliothèque, qui existe déjà.

**Trois erreurs à mon compte, toutes dans le banc, aucune dans la sauvegarde.** La comparaison a
d'abord buté sur une limite de D1 (« too many terms in compound SELECT ») : une requête par table
plutôt qu'un grand SELECT composé. Puis le vidage de la cible a échoué deux fois sur l'ordre des
suppressions — retirer `document` relance une cascade vers `ancre`, que l'ordre alphabétique avait
déjà retiré, et les contraintes différées n'y changent rien : le problème n'est pas le moment de
la vérification, c'est la table absente. L'ordre se calcule donc depuis le schéma, **les filles
avant leurs parents**, et six contrôles le vérifient en six millisecondes — là où chaque erreur
coûtait quatre-vingts secondes d'envoi avant de se montrer.

**Un garde-fou dans le banc lui-même** : il refuse toute cible dont le nom ne finit pas par
`-essai`. Une épreuve capable d'effacer une vraie base est une épreuve que personne ne devrait
lancer, et la règle vit dans le code plutôt que dans la prudence de qui tape la commande.

### Étapes 4 et 5 — les fichiers, et ce qui les ouvre (10 octobre 2026)

| | |
|---|---|
| Compartiment | `lienotheque-medias`, R2, région WEUR, vide au départ |
| Clés | `<clé>/sources/<2 premiers>/<empreinte>` et `<clé>/derives/<version>/…` |
| Laissez-passer | signature HMAC, trois minutes, vérifiée avant toute lecture |
| Contrôle | `therapeute-library` : 22 022 passages, 168 738 816 octets, **0 écriture** |

**Un seul endroit compose une clé**, et un test refuse qu'un second s'y mette. Pour les bases,
l'isolation est structurelle — une base par bibliothèque, aucune requête ne peut en atteindre
deux. Pour les fichiers elle ne l'est pas, et il faut le dire : un compartiment unique, des
préfixes, et du code qui tient la frontière. Le concentrer en une fonction est la seule façon de
rendre cette frontière relisable.

Le piège qu'un `startsWith` ne voit pas a son test : **`essai-bis/` commence par `essai`**. La
comparaison porte donc sur la clé recomposée, jamais sur un préfixe de texte.

**Ce n'est pas la clé de l'objet qui autorise, c'est la signature.** Un laissez-passer dit quel
fichier, de quelle bibliothèque, jusqu'à quand. Trois minutes : assez pour qu'un navigateur
charge une page, trop peu pour qu'une adresse recopiée dans un message serve encore demain. Et
même signée, une clé qui n'appartient pas à la bibliothèque annoncée ne s'ouvre pas — une
signature atteste qu'on a écrit le laissez-passer, pas qu'on avait raison de l'écrire.

Le Worker **retransmet** au lieu de signer une adresse chez l'hébergeur de fichiers : un secret de
moins (SEC-06), et la sortie ne coûte rien. Le jour où une mesure montrera que retransmettre pèse
trop, on changera — pas avant.

Trois détails que les tests imposent et qu'on aurait pu manquer : le compartiment n'est **jamais**
touché avant que le laissez-passer soit vérifié ; la réponse porte `private, no-store`, sans quoi
un cache partagé resservirait le fichier après l'expiration ; et un fichier absent se distingue
d'un accès refusé **par le code** — 404 dit « pas là », 403 dit « pas vous » — jamais par un
message qui apprendrait ce qui existe.

**Le garde-fou CLA-01 m'a repris en chemin** : j'avais écrit un mot de domaine comme nom de
bibliothèque d'exemple dans des tests génériques. Il avait raison, et c'est exactement à cela
qu'il sert.

### Étapes 6 et 7 — qui entre, et ce qu'il a le droit de faire (10 octobre 2026)

Le registre gagne quatre tables : `utilisateur`, `cle_acces`, `session`, `droit`.

**La session tient SEC-02 par trois propriétés, et un test les mesure ensemble** : on simule
365 jours d'usage quotidien, et la session ne périme pas une fois. Quatre-vingt-dix jours
**repoussés à chaque usage** — une session à date fixe demanderait une ressaisie le
quatre-vingt-onzième jour quoi qu'on fasse ; une session glissante n'expire que si l'on cesse de
s'en servir, ce qui est précisément le moment où elle doit expirer.

Le registre garde une **empreinte** du jeton, jamais le jeton : une base lue ne doit pas livrer de
quoi se faire passer pour quelqu'un. Et la révocation vit dans le registre, pas dans le jeton —
un jeton ne peut pas se retirer lui-même, et c'est la seule raison pour laquelle on consulte le
registre à chaque usage au lieu de se fier à la signature.

L'écriture ne se fait qu'**une fois par jour**, pas à chaque requête : une page qui en fait trente
réécrirait trente fois la même échéance.

**Les droits sont une échelle, pas une liste de cases.** Qui peut administrer peut contribuer, qui
peut contribuer peut lire. Une liste de cases se désaccorde — on ajoute une action quelque part et
on oublie de la cocher ailleurs. Une action absente de la table est **refusée à tout le monde** :
un geste qu'on a oublié de classer doit être refusé, jamais autorisé par défaut.

Un refus pour « bibliothèque qui n'est pas la vôtre » et un refus pour « droits insuffisants »
rendent **exactement la même phrase**. Distinguer les deux apprendrait l'existence d'une
bibliothèque à qui n'a pas le droit de la voir.

**Ce que je ne fais pas dans ce lot, et pourquoi.** La cérémonie WebAuthn elle-même — l'échange
avec l'appareil qui déverrouille la clé — n'est pas écrite. Deux raisons. Il n'existe pas encore
de page web pour l'exécuter : la version en ligne est au lot E5 (PLT-03), et le bureau ne passe
pas par là. Et la bibliothèque de référence apporte dix dépendances transitives, pour l'essentiel
de la vérification de certificats d'attestation dont deux utilisateurs connus n'ont pas l'usage.
Écrire moi-même l'analyse CBOR et COSE dans un chemin d'authentification serait pire ; ajouter dix
dépendances pour du code que rien n'appelle ne vaut pas mieux. Les tables l'attendent, la clé
publique a sa colonne, et la cérémonie se branchera avec le client qui en a besoin.

SEC-02 dit « **idéalement** déverrouillée par Touch ID ou clé d'accès » : l'exigence dure est la
session de 90 jours sans ressaisie, révocable à distance, et elle est tenue.

### Étapes 8 à 10 — publier, servir, comparer (10 octobre 2026)

**Publier, c'est inscrire sur une place déjà reliée** — jamais créer une base. Le Worker n'en a
pas le pouvoir et c'est voulu (SEC-08). Une bibliothèque entre toujours comme **locale**, même
quand on va la publier dans la seconde : « publiée » dit que quelque chose est servi, et tant que
rien ne l'est, l'état ment.

**Dépublier ne détruit rien.** La ligne reste, la base garde ses lignes, le compartiment ses
objets, et la place se libère. Un test le vérifie en publiant, dépubliant, republiant. Aucune
suppression ne se cache dans un changement d'état : supprimer est une décision à part.

Le journal d'audit s'écrit **dans le même geste** que l'opération, et un test compte les lignes
pour s'en assurer. Si c'était un second appel qu'on peut oublier, une publication sans trace
serait possible — et la trace qui manque est toujours celle qu'on cherche.

**La façade est pilotée par une correspondance rangée dans la bibliothèque.** Le code ne connaît
ni auteur, ni approche, ni langue : il connaît « un champ de sortie, et où le prendre ». La
correspondance choisit **où lire dans un résultat**, jamais **ce qu'on demande à la base** — la
requête est écrite une fois, en clair, et il n'y a donc rien à prouver sur l'injection. Les
colonnes atteignables sont une liste close ; une correspondance qui désignerait autre chose est
refusée par son contrat.

Une correspondance illisible rend **503**, pas des champs vides : rendre des champs vides sans le
dire ferait croire à l'application que la bibliothèque ne contient rien. C'est la leçon des
quatre pannes de l'ancien outil, appliquée avant d'en avoir une.

**L'index plein texte entre maintenant** (migration 4), pour la même raison que la table qu'il
indexe : une mécanique découverte nécessaire plus tard devient une migration sur une base en
service. Et la bibliothèque qu'on doit égaler en a un — comparer deux recherches dont l'une
procède par balayage ne dirait rien sur la pertinence. La phrase de l'utilisateur n'est jamais
passée telle quelle à l'index : chaque mot est cité, faute de quoi un guillemet ferait répondre
une erreur là où l'on attend zéro résultat.

**HEB-02, une règle que j'ai dû préciser.** L'index range son arbre dans des colonnes binaires.
La règle interdit les octets en base pour que D1 ne devienne pas un magasin de fichiers ; un
index n'en est pas un, et l'on ne peut rien y écrire d'autre que ce qu'il tire du texte indexé.
L'exemption est donc nommée — les tables d'un index **que nous avons déclaré** — et le contrôle
vaut en entier partout ailleurs. Je le signale parce que relâcher un contrôle pour faire passer
son propre code est exactement ce qu'il ne faut pas faire sans le dire.

**Le banc de comparaison existe avant d'en avoir besoin, et ses seuils sont écrits avant la
première mesure** : un seuil choisi après coup mesure la patience de celui qui l'a choisi. Aucun
ouvrage perdu et aucune citation non vérifiée sont bloquants ; le recouvrement est rapporté et ne
bloque pas, parce qu'un passage mieux découpé n'est pas une régression. La latence au 95ᵉ centile
s'interpole : avec trente questions, un centile pris par simple index vaudrait la plus lente et
ferait croire à une mesure plus sévère qu'elle n'est.

Ce que le banc **ne** juge pas : l'exactitude des pages. Elle se relit à la main sur un
échantillon, parce que c'est le seul endroit où une divergence entre les deux systèmes est une
amélioration — et aucune mesure automatique ne sait faire cette différence.

**Quatre collisions de noms, toutes signalées par le typage** avant toute revue : `placesLibres`,
`Action`, `Verdict`, `Resultat`. Le ré-export à plat du noyau rend visible la paresse de nommage,
et c'est un service qu'il rend.

**Un garde-fou d'architecture m'a repris** : mes tests importaient `node:sqlite` hors de
l'adaptateur. Plutôt que d'assouplir la règle, l'aide « base en mémoire » a été déplacée dans
l'adaptateur — ce qui a supprimé au passage une duplication que j'avais laissée dans trois
fichiers de test.

### Lot E1 — clôture, et ce qui attend une décision

**Les dix étapes sont construites et éprouvées.** Ce qui a été créé chez l'hébergeur, et rien
d'autre :

| Ressource | Région | Rôle |
|---|---|---|
| D1 `lienotheque-registre` | WEUR | le registre, 6 tables |
| D1 `lienotheque-essai` | WEUR | la bibliothèque d'**essai**, 4 migrations |
| D1 `lienotheque-restauration-essai` | WEUR | cible de l'épreuve de restauration |
| R2 `lienotheque-medias` | WEUR | les fichiers, vide |

Coût : **zéro au-dessus de l'abonnement**.

**Ce qui n'est pas fait, et pourquoi il faut votre mot.** Le Worker **n'est pas déployé**. Sa
configuration a changé — deux liaisons D1, une liaison R2 — et il lui faut deux réglages qui
n'existent pas encore : `SECRET_LAISSEZ`, qui signe les laissez-passer, et `BIBLIOTHEQUE_FACADE`,
qui dit quelle bibliothèque la façade sert. La règle 7 de CLAUDE.md soumet tout changement de
configuration ou de secret avant de l'appliquer, et c'est exactement le cas.

Tant que ce déploiement n'a pas eu lieu, la façade est éprouvée **dans le processus** — routes,
corps, formes de réponse, refus — mais pas encore par-dessus le réseau. C'est la dernière marche
du critère de passage de BAS-01, et elle se franchit en une commande une fois les deux réglages
posés.

**Le banc de comparaison attend une seconde adresse.** Il tourne sur ses mesures, qui sont
testées ; la comparaison réelle demande l'adresse et le jeton de l'ancienne API, et elle a sa
place au lot E3, pas ici.

**Ce qui reste à faire avant E2**, et qui ne dépend que de vous : le déploiement ci-dessus, puis
le jeu de questions réelles — trente à cinquante, tirées des recherches qui comptent pour celle
qui s'en sert, et non de ce qu'on imagine qu'elle cherche.

### Le déploiement d'E1 — ce qu'il demande, et pourquoi il attend

La configuration du Worker a changé : trois liaisons là où il n'y en avait aucune — `REGISTRE`,
`BIB_1`, `MEDIAS`. Un essai à blanc les montre toutes les trois et ne signale rien
(910 Kio, 155 Kio compressés).

**Deux réglages à poser à la main**, tous deux en secrets, hors du dépôt :

| Réglage | Ce qu'il vaut | Pourquoi |
|---|---|---|
| `SECRET_LAISSEZ` | une longue valeur aléatoire | signe les laissez-passer des fichiers (SEC-05) |
| `BIBLIOTHEQUE_FACADE` | `essai` | dit quelle bibliothèque la façade sert |

**Une erreur de jugement, et le test qui l'a corrigée.** `BIBLIOTHEQUE_FACADE` n'est pas un
secret, et j'ai voulu le déclarer en `[vars]` dans la configuration : visible, versionné, relu
sans commande — ce qui me semblait meilleur pour une valeur dont dépend ce que la façade sert.
Un test l'a refusé, et son intitulé dit pourquoi : « n'écrit aucun secret, **et n'ouvre même pas
de section pour en mettre** ». Dans un dépôt public, un mur sans porte est plus sûr qu'un mur
avec une porte, et le bénéfice que je cherchais — pouvoir relire la valeur — s'obtient
exactement ici, dans ce tableau, sans rien ouvrir. Le garde-fou avait raison contre moi.

**Après le déploiement, une dernière écriture** pour que la façade ait quelque chose à servir :
`scripts/preparer-essai.ts` inscrit la bibliothèque d'essai au registre, la publie sur `BIB_1` et
dépose la correspondance que la façade lit. Sans elle, les quatre routes répondent
« indisponible » — ce qui est le bon comportement, mais ne prouve rien. Le script refuse toute
base dont le nom ne finit pas par `-essai`.

### BAS-01 franchi — les quatre routes répondent par-dessus le réseau (10 octobre 2026)

| Route | Réponse | Latence |
|---|---|---:|
| `/search-library` | `results` : passage, titre, page imprimée, axes | 168 ms |
| `/d1-query` | `results`, depuis une intention à termes | 162 ms |
| `/rag-search` | `chunks` — le même contenu sous le nom que l'appelant attend | 167 ms |
| `/library-facets` | `facets` : comptes par axe | 163 ms |

**Deux secrets vides, et pourquoi on ne s'en apercevait pas.** Les quatre routes refusaient avec
« la façade n'est pas configurée » alors que `wrangler secret list` montrait les quatre secrets.
Le motif a nommé le coupable : le secret posé de longue date arrivait, les deux posés le matin
même non. `wrangler secret put` lit l'entrée standard et enregistre une entrée vide sans
protester ; le code traite une chaîne vide comme « non configuré », ce qui est juste — mais
l'écart entre « le secret existe » et « le secret vaut quelque chose » ne se voit nulle part.

**Un défaut d'ordre, invisible aux tests et visible au premier appel réel.** La façade vérifiait
sa configuration **avant** le jeton. Un appelant anonyme apprenait donc si elle est configurée, et
sur quelle bibliothèque elle bute — exactement ce qui est refusé ailleurs, où « pas votre
bibliothèque » et « droits insuffisants » rendent la même phrase. Les tests passaient tous : ils
regardaient chacun une question à la fois, aucun ne regardait leur **ordre**. Corrigé, et deux
contrôles l'exigent désormais, dont un qui vérifie qu'un jeton de service manquant se dit
« jeton refusé » et non « service non configuré ».

**Un script qui se croyait rejouable.** `preparer-essai.ts` employait `INSERT OR REPLACE` avec des
identifiants tirés au hasard à chaque passage : il créait donc un document de plus à chaque
exécution au lieu de remplacer le précédent. Le défaut s'est trahi par une contradiction — les
facettes comptaient trois valeurs d'axe quand la recherche rendait des axes vides, parce que les
deux regardaient des documents différents. Les identifiants sont désormais dérivés de la clé de
la bibliothèque. C'est la faute relevée dans l'ancien outil d'administration, où le rang d'un
passage était recalculé par lot : **une identité qui n'est pas stable n'est pas une identité.**

### Lot E2, étape 0 — le volume, éprouvé pour de vrai (10 octobre 2026)

| L'épreuve | Ce qu'on a vu |
|---|---|
| Volume démonté en cours | « le dossier n'existe pas — volume démonté ou débranché ? », à 12 s |
| Le travail pendant l'absence | **en file**, tentative 1 — pas d'échec, pas de tentative consommée |
| Volume remonté | reprise annoncée à 32 s, sans rien relancer |
| Travail **en vol** au moment de l'absence | revient en file, tentative inchangée (contrôle Rust) |

**Le message disait faux, et seul l'essai réel l'a montré.** Démonter une carte sous `/Volumes`
rend « Permission denied » : c'est `/Volumes` qui refuse qu'on y crée un dossier, pas le volume,
qui n'est plus là. Le message envoyait chercher un problème de droits là où il fallait rebrancher
un disque. On regarde désormais ce qui existe avant de nommer la cause.

**L'essai ne prouvait qu'une moitié.** Le travail *attendait* ; le chemin que j'avais écrit pour
rendre un travail *en vol* n'était pas éprouvé — et c'est pourtant le seul endroit où la
confusion coûtait cher, puisque c'est lui qui transformait une absence d'une minute et demie en
document perdu. Un contrôle le couvre maintenant, et sa première version échouait sur sa propre
prémisse : le dossier que je croyais injoignable était simplement créable.

**Le support de données a changé, et pas par préférence.** La carte de 1 To porte une corruption
de catalogue — « Invalid node structure » — et **refuse de remonter après chaque démontage** :
trois fois, dont une après une vérification qui n'écrit rien, et `fsck_hfs -fy` ne sait pas
reconstruire un catalogue. Un support qui ne survit pas à un démontage ne peut porter ni une
base, ni une sauvegarde.

La clé « Macbook » a passé ce que la carte échoue : 20 Mo écrits puis relus à l'identique, et
**quatre cycles démontage-remontage sans incident**. Elle reçoit les sauvegardes, et rien d'autre
— ExFAT n'a pas de journal, une coupure peut y laisser un fichier incomplet.

**D'où le découpage, maintenant écrit au plan** : base, file et dérivés sur le disque interne,
originaux inchangés, sauvegardes sur la clé. **Aucun support amovible n'est nécessaire au
fonctionnement** ; si la clé s'absente, la sauvegarde attend et n'arrête rien.

**Deux absences, deux réponses**, et les confondre serait refaire la faute corrigée ici : les
dérivés injoignables suspendent, la base injoignable ne se suspend pas — la file vit dessus, on
ne peut ni lire ce qui restait à faire ni écrire qu'on attend.

## Architecture — Windows cesse d'être un contrôle bloquant

**Décidé le 17 octobre 2026.** Windows n'est pas, et ne sera pas, un système que nous utilisons.
L'architecture multiplateforme reste en place : elle est gratuite avec Tauri, et rien de propre à
un seul système n'entre dans le code sans son équivalent prévu. Mais Windows **n'est plus une
priorité, ni un contrôle qui empêche une fusion**.

Si la complexité des tests ou du paquet Windows s'alourdit un jour, la question de transposer la
base Mac vers Windows sera reprise **à ce moment-là**, pas maintenant.

### Ce que cela change concrètement

| Contrôle | Avant | Maintenant |
|---|---|---|
| `Vérification` (ubuntu, macOS, Windows) | bloquant | bloquant, inchangé |
| `Rendu` (Chromium, Firefox, WebKit) | bloquant | bloquant, inchangé |
| `Mesures (macos-latest)` | bloquant | bloquant, inchangé |
| `Mesures (windows-latest)` | bloquant | **informatif** |

`Mesures (windows-latest)` reste exécuté et reste lu : il est informatif, non supprimé. On veut
continuer à voir ce qu'il dit, sans qu'il arrête le travail.

### L'échec en cours, et ce qu'on en sait

À la fusion de la PR #41, `Mesures (windows-latest)` échoue à son étape 18, « Éprouver les quatre
critères » : **89 tests passent, 2 échouent**, et il en va ainsi depuis au moins le 10 octobre —
vérifié identique aux commits `7e24ebfd` et `03cd98fd`, la même étape, les mêmes deux tests.

```
volume::tests::un_dossier_en_lecture_seule_repond_absent
volume::tests::un_volume_demonte_est_annonce_comme_tel_et_non_comme_un_refus_de_droits
```

**La cause est connue, et ce n'est pas le produit.** `pourquoi_on_ne_peut_pas` ne code aucun
système en dur : elle regarde ce qui existe réellement avant de nommer la cause. Sur Windows,
elle a raison dans les deux cas. Ce sont les deux **tests** qui posent des hypothèses POSIX :

1. Le premier pose l'attribut « lecture seule » sur un dossier. Sous Windows, cet attribut est
   hérité de MS-DOS, où il ne marquait que les dossiers personnalisés : le système l'accepte sans
   interdire d'y créer un fichier. La sonde écrit donc son témoin, le relit, et répond « présent »
   — à juste titre. Le garde-fou du test ne regardait que l'erreur de `set_permissions`, qui ne
   vient jamais : il laissait passer un cas qu'il croyait écarter.

2. Le second code en dur `/Volumes/un-volume-qui-n-existe-pas-ici/…`, qui n'a de sens que sous
   macOS. Sous Windows, ce chemin est simplement créé sur le disque courant, et la sonde répond
   « présent » — à juste titre encore. L'équivalent Windows serait une lettre de lecteur libre.

**Non corrigé, et volontairement.** Les deux corrections sont conçues — le garde-fou doit
vérifier que l'attribut mord au lieu de regarder si le poser échoue, et le chemin du volume
absent doit se choisir selon le système — mais **aucune ligne n'en est écrite**. Les poser
aujourd'hui relancerait les sept contrôles pour rétablir une couverture dont nous venons de
décider qu'elle n'est pas prioritaire. Elles attendent le jour où la question Windows sera
reprise.

**Ce qu'il faut en retenir pour ne pas se tromper** : ce rouge ne dit rien du produit sous
Windows. Il dit que deux de nos tests ne savent pas y poser le cas qu'ils veulent éprouver. La
couverture Windows des critères est donc, à ce jour, de 89 tests sur 91 — et non nulle.

## La version en ligne lit par la façade (18 octobre 2026)

**Décision : la façade Worker sur D1. La décision du 3 octobre — SQLite en WebAssembly pour la
version en ligne — est remplacée.** Les deux autres implémentations du port de dépôt tiennent :
`node:sqlite` pour les tests, l'hôte Rust pour le bureau.

Trois raisons, dans cet ordre.

**Elle est déjà construite, et déjà mesurée.** E1 a franchi BAS-01 le 10 octobre : les quatre
routes répondent par-dessus le réseau entre 162 et 168 ms. La voie WebAssembly demanderait de
rebâtir cela dans le navigateur.

**Elle résout la troisième réserve au lieu de la déplacer.** La recherche du bureau parcourt les
fichiers de version — les passages y font 93 % du poids, environ 1,5 Ko chacun. Tenable à huit
documents, intenable à deux cent cinquante. D1 porte l'index plein texte, et la façade le sert
déjà ; SQLite en WebAssembly porterait le même problème dans le navigateur, avec moins de
mémoire et un téléchargement à chaque visite.

**Le hors-connexion a déjà son répondant : le bureau.** La version en ligne sert à lire depuis
ailleurs, non à remplacer l'application installée.

**Le coût est accepté et écrit : aucune lecture hors connexion.** Chaque geste paiera un
aller-retour, mesuré à 165 ms. Ce n'est pas un détail d'implémentation — c'est ce que la version
en ligne sera, et ce qu'elle ne sera pas.

## « Lot E2 » : une étiquette pour deux choses (18 octobre 2026)

Le mot a servi à deux choses sans rapport, et la confusion a failli faire écrire le plan du
mauvais lot.

| ce qu'on appelait « lot E2 » | ce que c'est réellement |
|---|---|
| le chemin du texte, le classement, le contrat des pages | **du travail de capacité**, fusionné les 17 et 18 octobre. Un raccourci de conversation, jamais une étiquette du CDC |
| **E2 = BAS-02** dans l'ordre de construction | **le réimport réel des 234 ouvrages**, toujours différé |

**BAS-02 reste réservé au réimport réel**, et celui-ci attend que Liénothèque soit terminée — ce
n'est pas une étape du prochain lot, c'est une décision prise le 17 octobre 2026.

Les documents `lot-e2-texte-plan.md` et `lot-e2-classement-plan.md` gardent leurs noms de
fichiers : les renommer casserait les liens qui les citent, pour un gain nul. Ce sont des plans
de capacité, et cette ligne-ci le dit. **Aucun nouveau document n'emploiera « lot E2 »** pour
autre chose que BAS-02.

## Quatre portes, et aucune route n'en accepte deux (18 octobre, élargi le 19)

| route | porte |
|---|---|
| les quatre de la façade — `/search-library`, `/rag-search`, `/d1-query`, `/library-facets` | **session personnelle** |
| `/vision`, `/vision/jetons` | **jeton de service** — appels de machine à machine vers un modèle payant |
| `/fichier/:laissez` | **laissez-passer signé** (SEC-05) |
| `/amorce` | **l'invitation** — le défi lui-même, émis par le jeton (19 octobre) |
| `/sante` | aucune : elle ne dit que le nom et la version du service |

Deux portes pour deux usages est légitime. **Une route qui accepterait l'une ou l'autre ne
l'est pas** : on aurait deux serrures et une seule vérifiée, et le jour où l'une cède, rien ne
dirait laquelle a servi.

### La quatrième porte : l'invitation (19 octobre 2026)

Elle est née d'un défaut, et il faut le dire ainsi. Les deux routes d'amorçage exigeaient le
jeton de service — et le test « c'est un appel de machine à machine » était vert. Mais personne
n'avait demandé **qui, concrètement, ferait l'appel** : un navigateur, qui n'a pas le droit de
porter ce jeton (règle 6, LIV-04). J'avais donc conçu une porte qu'aucune page ne pouvait
franchir sans enfreindre une règle non négociable.

**Le jeton invite, l'invitation entre.**

| route | porte |
|---|---|
| `POST /amorce/defi` | le **jeton de service** : émettre une invitation est un geste de machine |
| `POST /amorce` | l'**invitation** seule, c'est-à-dire le défi |

Pourquoi un défi peut porter un accès, alors qu'il n'est pas un secret du compte :

- il fait trente-deux octets de hasard, et ne se devine pas ;
- il ne sert **qu'une fois**, et la base le marque ;
- il périme en **cinq minutes** ;
- nul ne peut en obtenir un sans le jeton de service.

**Une invitation est engendrée par le secret ; elle n'est jamais le secret lui-même.** C'est la
différence entre confier sa clé et ouvrir la porte à quelqu'un : la seconde ne se transmet pas,
ne se recopie pas utilement, et s'éteint d'elle-même.

Le défi n'est pas vérifié par la porte mais par `enroler`, qui le fait déjà — et **en premier**,
avant de regarder la clé publique. Un appelant sans invitation s'arrête donc là, et n'apprend
rien de ce qui suit.

Reste une chose que cette porte dit à un inconnu : « L'amorçage est clos », quand une clé existe
déjà. Cela n'apprend que ceci — la bibliothèque a été mise en service. Qui voit la page le sait
déjà.

Cette doctrine est écrite dans `apps/worker/src/portes.ts`, au contact du code qui l'applique.

### Ce qui est vrai aujourd'hui, et qu'il ne faut pas se raconter autrement

**Le Worker n'a aucune personne.** Vérifié le 18 octobre 2026 :

| pièce | état |
|---|---|
| tables `utilisateur`, `cle_acces`, `session`, `droit` | créées par la migration 2 du registre, **lues et écrites par rien** |
| logique des droits (`packages/noyau/src/droits.ts`) | écrite, testée, **appelée nulle part dans le Worker** |
| porte effective de la façade | **un jeton de service unique**, pour tout le monde |

La note d'E1 écrit que l'exigence dure de SEC-02 — session de quatre-vingt-dix jours sans
ressaisie, révocable à distance — « est tenue ». Elle décrit la **conception** : la session est
spécifiée, elle n'est pas vivante. Les tables portent la forme ; aucun code ne la remplit.

Ce n'est pas un manquement d'E1, dont la note dit clairement « les tables l'attendent ». Mais la
phrase laisse croire qu'une session existe, et il faut la lire autrement.

### La garde qui tient l'intervalle

Entre aujourd'hui et la cérémonie, il existe une fenêtre où la façade est ouverte par un jeton
partagé. Tant qu'elle ne sert que `lienotheque-essai` — dont le contenu est un document
intitulé « Document d'essai » — cela ne garde rien de sensible.

Le danger naîtrait le jour où un réglage ferait pointer la façade sur une vraie bibliothèque.
**La règle vit donc dans le code et non dans la vigilance** : `laFacadePeutServir` refuse toute
bibliothèque dont la clé n'est pas `essai` ou ne finit pas par `-essai`, tant que
`SESSIONS_EXIGEES` est faux.

C'est le motif que `preparer-essai.ts` emploie déjà, et pour la même raison : une règle qu'on
doit se rappeler finit par être oubliée le jour où elle compte.

Le refus rend le même mot que toute autre indisponibilité — « Bibliothèque indisponible », 503 —
et vient **après** la vérification du jeton. Un appelant anonyme n'apprend ni qu'une
bibliothèque existe, ni pourquoi elle lui est refusée. C'est le défaut d'ordre qu'E1 avait
corrigé le 10 octobre, et qu'aucun test ne voyait alors ; celui-ci le vérifie.


## 20 octobre 2026 — la fenêtre est refermée : `SESSIONS_EXIGEES` passe à vrai

La garde ci-dessus tenait un intervalle. L'intervalle est terminé, et il l'est sur une mesure et
non sur une intention.

| ce qui a été mesuré en production | quand |
|---|---|
| une clé enrôlée, sous `user.id` stable | 07:56:35 |
| une session ouverte par signature vérifiée | 07:56:43 |
| une seconde, le lendemain matin du même jour de travail | 08:13:06 |

Le compteur de la clé est resté à **zéro** aux deux entrées. C'est le comportement connu des
clés d'accès iCloud, que `avancerLeCompteur` tolérait déjà — « zéro après zéro » — sans l'avoir
jamais rencontré. Nous savons maintenant que la tolérance servait à quelque chose de réel.

Le jeton de service n'ouvre plus la façade. Vérifié après déploiement : `/vue/apercu` lui répond
« Accès refusé. » exactement comme au vide, et avec le même mot — un porteur de jeton n'apprend
donc pas qu'il a été reconnu comme tel.

### Ce que la bascule a coûté à la garde, et ce qu'on a fait

`laFacadePeutServir` lisait la constante. À vrai, sa branche de refus devenait inatteignable :
le code restait écrit, plus jamais exécuté, et aucun test ne pouvait plus dire ce qu'il ferait le
jour d'un retour en arrière — une cérémonie en panne, une restauration.

Elle reçoit donc la bascule **en paramètre**, pour la même raison qui en a fait une option de
`creerApp` : on ne saurait d'une bascule que ce qu'on en suppose si l'on ne pouvait plus
l'éprouver que dans une position. Un test la tient maintenant dans les deux.

De même, `facade-routes.test.ts` dit par quelle porte il entre au lieu de l'hériter d'une
constante. Un défaut de serrure et un défaut de réponse ne doivent pas échouer au même endroit :
on ne saurait pas lequel des deux on vient de casser.

## 20 octobre 2026 — la version en ligne montrait un écran de bureau

Trouvé par l'usage, et par rien d'autre : ouvrir `#catalogue` en ligne montrait « Créer ma
première bibliothèque » et « Choisir un dossier ». Le premier geste lève — l'hôte seul écrit sur
le disque —, le second n'est même pas offert faute de disque à parcourir.

Le pont en ligne était écrit, déployé et correct ; la session était ouverte ; l'adresse était la
bonne. La cause était un cran plus haut : `App.tsx` ne cherchait de bibliothèque que dans
`creees`, la liste de celles que **la session a créées**. Créer est un geste de bureau, donc
cette liste reste vide en ligne, donc `courante` restait indéfinie — et le service n'était
**jamais appelé**. Tout retombait sur le premier lancement, seul écran que la retombée
connaissait.

Trois décisions en sortent.

**La bibliothèque servie existe, et se nomme.** Une constante de module sans dossier : le pont
en ligne reçoit `racine` et ne s'en sert pas, puisqu'il n'y a qu'une bibliothèque derrière la
façade. `derniere` redevient alors ce que son nom disait — la bibliothèque créée ici, la seule
qui porte une description à organiser.

**La retombée dépend de qui répond.** En ligne, deux écrans honnêtes remplacent le premier
lancement : la cérémonie quand le service nous refuse, l'attente quand il nous reçoit et n'a rien
à montrer. Une bibliothèque dont aucune version ne s'est encore activée n'a pas d'instantané à
servir, et c'est l'état normal du premier jour — ce n'est ni une panne ni un manque de droits.

**Un 401 porte un nom.** Le témoin de session est `HttpOnly` par conception (LIV-04) : aucun
script ne le lit, pas même le nôtre, et la page ne peut donc pas savoir seule qu'elle n'est pas
entrée. Elle l'apprend du refus. Confondre ce refus avec une panne ou avec une bibliothèque vide
menait exactement au défaut du jour.

### Et un écran qui affirmait ce qu'il ignorait

L'écran d'attente a d'abord dit « Vous êtes bien entré ». Mesuré dans un vrai navigateur, il
s'affichait le temps que le refus du service revienne — donc il le disait précisément à qui ne
l'était pas. La phrase est partie : un écran ne certifie pas ce qu'il attend encore d'apprendre.

### Ce qui reste vrai après la correction

La bibliothèque servie est **vide**. Deux documents dans sa base, aucun instantané rangé,
puisque aucune version ne s'est activée en ligne — le geste de publication n'a encore jamais
tourné contre le seau déployé. L'écran le dit maintenant, au lieu de proposer de créer une
bibliothèque.


## 20 octobre 2026 — la couche texte des documents photographiés ne fait pas foi

Le premier des trois bloquants de BAS-02, mesuré. **Verdict : pour un document photographié, la
reconnaissance refaite l'emporte sur la couche existante, et la chaîne doit cesser de préférer
la seconde.**

### Le protocole, et ce qu'il mesure vraiment

Cinquante pages relues à l'œil, en aveugle : deux lectures « A » et « B » tirées au sort page par
page, trente pages où les deux divergent le plus et vingt où elles s'accordent, mélangées sans
dire lesquelles sont lesquelles.

L'aveugle n'est pas une coquetterie. Le gros du corpus vient d'un dossier nommé d'après un
logiciel de reconnaissance de texte : **sa couche est elle-même un OCR**, et deux reconnaissances
sur la même image abîmée se trompent souvent ensemble. Un accord élevé ne prouve donc rien tout
seul, et c'est pour cela que le second lot existe.

| lot | pages | la couche a raison | la reconnaissance a raison | les deux ont tort |
|---|---:|---:|---:|---:|
| divergence (accord < 79 %) | 30 | **23 %** | **70 %** | 3 |
| accord (≥ 95 %) | 20 | 80 % | 95 % | **0** |

### Ce que chaque ligne dit, et ce qu'elle ne dit pas

**La première tranche.** Là où les deux lectures divergent, la couche a tort trois fois sur
quatre. Le défaut dominant est nommé : des couches entières **ont perdu tous leurs accents** —
« criti quais », « mechamment », « therapeute », « du faire » — là où la reconnaissance rend
« méchamment », « thérapeute », « dû ». Pour une recherche en français, c'est un mot sur trois
qu'on ne retrouve plus.

**La seconde tranche n'est pas ce que je croyais mesurer, et c'est une leçon sur l'instrument.**
Le « 80 % contre 95 % » n'est pas un écart d'exactitude : vérifié sur une fiche, les deux textes
y étaient tous deux justes, et la préférence est allée au plus propre — une couche ouvrant sur
« rr » et collant deux titres courants, contre une reconnaissance qui en omet un. Demander
« laquelle correspond » sur deux textes quasi identiques fait répondre « laquelle est la plus
soignée ». Ce lot ne vaut donc que par sa dernière colonne, et elle est nette : **jamais les deux
ensemble.** Là où les deux lectures s'accordent, elles ont raison.

### Une bande entière n'a pas été jugée, et c'était un défaut du tirage

Les trente « divergences » s'arrêtent à 79 % d'accord, les vingt « accords » commencent à 95 %.
**Quatre-vingt-quinze pages sur cent quatre-vingts — plus de la moitié — tombent entre les deux
et n'ont aucun verdict.** Le tirage a pris les extrêmes en oubliant le ventre.

La décision tient quand même, parce que l'encadrement suffit. En donnant à la bande inconnue le
meilleur sort possible, la couche est juste sur 70 % des pages ; le pire la met à 41 %. **Les
deux bornes passent sous le seuil de 85 % fixé avant la mesure**, et la règle de décision tranche
donc sans qu'il faille connaître le ventre.

### Un garde-fou gratuit, trouvé en chemin

La part de lettres accentuées se lit **sans rien océriser**, en cinq millisecondes par page. Sur
les dix-huit documents comparés, trois couches françaises rendent **0,00 %** d'accents là où la
reconnaissance en rend 3 % — et ce sont celles que l'œil condamne (0/6, 1/5, 3/6). Les quatorze
autres tournent entre 2,7 et 3,5 % des deux côtés.

Une couche française sans accent se reconnaît donc pour rien, et le quatrième cas à 0,00 % est un
ouvrage anglais, que la reconnaissance confirme à 0,03 % : le signal ne se trompe pas de langue
pour peu qu'on lui donne celle du document.

### Ce que cela change pour le réimport

La chaîne préfère aujourd'hui la couche dès que `coucheSuffisante` passe, et n'essaie la
reconnaissance que si la couche cède. **Cet ordre s'inverse pour les documents photographiés.**

| | pages | |
|---|---:|---|
| livre photographié, une page par feuille | ~6 180 | à océriser |
| livre photographié, deux pages par feuille | ~1 565 | à océriser |
| feuillet photographié | ~237 | à océriser |
| **ensemble** | **~7 985** | **≈ 4,4 h à 2 s la page** |

Les comptes tiennent compte d'une autre découverte du tirage : beaucoup de documents classés
« photographiés » ne le sont pas. Un diaporama, une thèse, un support de cours portent une image
par page — un fond, un décor — et leur texte est d'origine. Mesuré : **13 % seulement** des
« feuillets photographiés » le sont vraiment, 57 % des « deux pages par feuille », 80 % des « une
page par feuille ». Leur couche, elle, n'a rien à se faire pardonner.

L'estimation précédente annonçait 3 650 pages d'OCR en une à deux heures ; elle comptait les
pages **sans** couche. Celle-ci compte les pages dont la couche ne mérite pas qu'on s'y fie. Le
coût du réimport double, et il reste une dépense unique.

### Fait le 20 octobre 2026, sur l'encadrement et sans les vingt pages de plus

L'inversion est écrite : `laLectureRetenue` remplace `mieuxServi`, l'OCR se tente **dès qu'il y a
une image à lire**, et la reconnaissance l'emporte dès qu'elle a vraiment lu. Onze épreuves
unitaires figent la règle, dont les trois qui empêchent de reperdre ce qui marchait : une couche
illisible perd toujours, une couche vide ne gagne jamais, une page courte sans image n'est pas
perdue.

Ce que la vérification a montré sur les fixtures, et qui n'était pas évident :

| | |
|---|---|
| **F1** | son critère passe par `releverCoucheTexte`, jamais par l'arbitrage : immunisé par construction, et vérifié exact |
| **F3** | passe bien par le nouvel arbitrage — mais **sa couche est vide sur toutes ses pages**, l'OCR la servait déjà : 95 sur 95, inchangé par construction |
| **F4** | n'a aucune couche texte (143 images, pas une police) ; ses épreuves locales de lecture, de segments et d'orientation passent. Son critère complet demande le relais payant, non lancé |
| **F5** | `fixtures/fichiers/F5` est vide : c'est le jeu de requêtes du lot C, aucun fichier à lire |
| natif | vingt pages servies par la couche, **zéro océrisée** : une page sans image ne coûte toujours rien |

**Le trou de couverture, et sa fermeture le même jour.** Aucune fixture du dépôt ne portait **à
la fois** une couche texte et une image de page : `500-pages.pdf` n'a pas d'image, le scan et F3
n'ont pas de couche, F4 non plus. L'inversion n'était donc éprouvée qu'unitairement, et son
branchement — une ligne — seulement dans le sens « pas d'image, rien ne change ».

`couche-fautive.pdf` pose enfin le cas, et `generer-locales.py` la fabrique : huit pages portant
l'image du texte **avec** ses accents, et par-dessus, en rendu invisible comme le font les vrais
outils de reconnaissance, la même phrase **sans** aucun accent.

Elle discrimine, et c'est mesuré plutôt qu'espéré : la couche rend **63 mots** contre **62** à la
reconnaissance, toutes deux lisibles à 45 % de mots outils. L'ancienne règle gardait donc la
couche — la plus fournie — et la nouvelle prend la reconnaissance. Un seul mot d'écart : la
fixture ne peut rien prouver d'autre que le renversement lui-même. Les deux mutations qui
remettent l'ancien comportement — la règle, puis le branchement — la font échouer toutes les
deux.

**Ce qu'elle n'éprouve pas, et pourquoi.** Son folio n'est **jamais lu** par la reconnaissance :
aucun mot purement numérique sur la page, à 244 pixels du bloc de texte comme à 70. Tesseract en
segmentation « page entière » abandonne un chiffre isolé que rien n'entoure. Le chemin du numéro
imprimé après OCR reste couvert par `500-pages-scan.pdf`, dont les pages sont couvertes de texte
jusqu'au folio ; en poser une seconde épreuve ici n'aurait prouvé qu'une chose, qu'on sait écrire
un test rouge.


## 20 octobre 2026 — la dégradation de F4 : la cause est le vote d'orientation

Réserve 9.1, ouverte depuis le 17 octobre, et deuxième bloquant de BAS-02. **La cause est
trouvée, et ce n'était aucune des quatre hypothèses envisagées.**

### Ce qui n'est pas en cause, cette fois mesuré avec les bons compteurs

La note du 17 octobre écartait la mémoire parce que celle du processus **baisse** quand le
traitement ralentit. Le raisonnement était fragile — une mémoire qui baisse pendant qu'on
ralentit est aussi la signature d'un ramasse-miettes majeur ou du compresseur de macOS — et le
banc `f4-ou-passe-le-temps.ts` a été écrit pour rouvrir la question. Verdict : **l'exclusion
tient, pour de meilleures raisons.**

| compteur | relevé pendant les pages lentes |
|---|---|
| ramasse-miettes | **zéro** milliseconde, zéro passage |
| tas de V8 | **15 Mo**, plat du début à la fin |
| hors tas | **~400 Mo**, plat |
| compressions, swapins, swapouts du système | **zéro** en dix secondes |
| débit de lecture du fichier | **4,9 Go/s** — il est entièrement en cache |
| appels à Tesseract | **zéro**, vérifié par un relais posé en tête de `PATH` |

### Un piège d'instrument, et il a failli emporter la conclusion

`process.cpuUsage()` annonçait **2 à 6 %** du temps d'horloge : j'ai cru dix minutes durant que
le processus attendait. `/usr/bin/time` sur le même travail dit **26,21 s « user » pour 27,04 s
réelles**. Le processus calcule à plein ; c'est le compteur interne qui sous-compte sur macOS.

À retenir pour toute mesure future de ce genre : **le temps processeur se lit du dehors.**

### La cause, et le palier qui la désigne

La durée par page ne se dégrade pas progressivement. Elle fait **un palier**, et il tombe à un
endroit qui ne doit rien au hasard :

| feuilles demandées | s par page |
|---|---|
| 4 | 1,94 |
| 8 | 1,96 |
| 12 | **14,92** |
| 16 | **15,36** |

Le seuil est entre 8 et 12, et `PAS_ECHANTILLON` vaut **8**. Le vote d'orientation du lot
(`voterOrientation`) échantillonne un cliché sur huit : en deçà de neuf feuilles il n'en voit
**qu'un**, au-delà il en voit **deux**. Mesuré sur F4 :

| cliché | notes des quatre sens | ce que le vote en fait |
|---|---|---|
| 0 | 0 = 171,3 · 270 = 154,4 · 90 = 83,2 · 180 = 68,9 | partagé — l'écart est de 11 % |
| 8 | 270 = 116,3 · 0 = 63,3 · 90 = 43,6 · 180 = 17,3 | net — l'écart est de 84 % |

Un seul échantillon rend **rotation 0**, et toutes les pages coûtent deux secondes. Deux
échantillons rendent **rotation 270**, parce que le second vote est le plus **confiant** et non
le plus fort — et c'est le bon critère. Le lot bascule alors, et chaque page coûte quinze
secondes.

### Correction du même jour : ce n'est pas la rotation qui coûte

J'ai d'abord écrit que les treize secondes étaient le prix de la rotation. **C'est faux, et la
mesure le dit sans appel.** Chronométré sur deux clichés réels de F4, 4,3 mégapixels :

| étape | durée |
|---|---|
| `tourner` 0°, 90°, 180°, 270° | **0,00 à 0,04 s** |
| `gouttiere` | 0,01 s |
| `couperDoublePage` | 0,00 s |
| `effacerVerso` | 0,02 s |
| `binariserAdaptatif` | 0,04 s |
| **tout `redresser`, rotation comprise** | **~0,15 s** |

Tourner une image est un remaniement de pixels : c'est gratuit. Le redressement entier pèse un
sixième de seconde, et il pèse **la même chose** à 0° et à 270°.

Les treize secondes sont donc **en aval**, dans `reperer` — la lecture des repères —, qui vit
aussi dans l'intervalle chronométré (`lireLot` appelle `reperer([page])` avant d'annoncer la
page). Ce que la bascule du vote change pour lui, ce n'est pas le coût de tourner : c'est **la
forme de la page qu'il reçoit**, et donc ce qu'il a à y chercher.

### Et ce que cela ouvre, qui n'est pas une finition

Si 270° est la **bonne** orientation — et tout indique que oui, c'est pour cela que le vote
existe —, alors la lecture lente est celle qui fait le travail, et la rapide était rapide parce
qu'elle cherchait des repères sur des pages couchées, où il n'y a rien à trouver.

**Dans ce cas il n'y a aucune économie à faire : les treize secondes sont le travail.** Et la
question de la réserve 9.1 change de nature — elle cesse d'être « d'où vient cette lenteur » pour
devenir « ce travail peut-il coûter moins ». Les deux ne se traitent pas pareil, et je ne l'ai
pas encore tranché : il faudrait comparer ce que les deux lectures **trouvent**, et non ce
qu'elles coûtent.

La lenteur n'appartient donc ni au document, ni à la mémoire, ni à la rotation. Elle appartient à
la lecture des repères sur des pages enfin droites — sous réserve de la vérification ci-dessus.

### Ce que cela corrige dans la note du 17 octobre

« La lenteur appartient à la lecture longue, pas au document » : la formule visait juste sans le
savoir. Ce n'est pas la lecture longue en elle-même, c'est le fait qu'une lecture longue voit
assez de clichés pour que le vote bascule. Et « les mêmes feuilles lues seules mettent 2,08 s »
s'explique enfin : lues seules, elles étaient moins de neuf, donc jamais tournées.

### Ce qui reste, et qui est une décision, pas une mesure

La rotation est **nécessaire** : la décider page par page avait rendu deux pages à l'envers et
deux couchées sur F4, et le commentaire de `preparerLot` le dit depuis le 4 octobre. Le défaut
n'est donc pas qu'on tourne, c'est que tourner coûte treize secondes par page.

Trois pistes, aucune mesurée, aucune engagée :

1. ~~**La rotation elle-même**~~ — **écartée le jour même** : elle coûte 0,04 s, mesurée. La
   piste à sa place est `reperer`, et seulement si la comparaison des **résultats** montre que la
   lecture lente ne trouve pas plus que la rapide.
2. **Tourner plus tard, ou moins** — les repères se cherchent dans des zones que la recette
   désigne ; tourner la zone plutôt que la page serait une autre conception.
3. **La découpe**, décidée en 9.1 ter, reste le contournement en place. Elle a désormais un
   effet de bord connu : **une tranche de moins de neuf feuilles ne tourne pas du tout**, donc ne
   lit pas la même chose qu'une tranche plus longue. C'est un défaut sérieux du contournement, et
   il n'était pas visible avant aujourd'hui.

### La mesure qui tranche : la lecture lente fait le travail

Les **mêmes huit pages**, lues deux fois — une fois dans un lot de quatre feuilles, une fois dans
un lot de douze — et l'on compte ce qui est **trouvé**, non ce qui est dépensé
(`mesures/f4-gras-ou-travail.ts`) :

| lecture | feuilles | rotation du lot | durée | éléments trouvés | numéros de page lus |
|---|---:|---:|---:|---:|---:|
| courte | 4 | 0° | 19 s | **12** | **0 sur 8** |
| longue | 12 | 270° | 361 s | **35** | **8 sur 8** |

**Il n'y a pas de gras.** La lecture rapide trouve un tiers des éléments et **ne lit aucun numéro
de page** : elle cherchait des repères sur des pages couchées, en attrapait quelques-uns par
chance, et n'a jamais su sur quelle page elle était. Une page dont le numéro imprimé n'est pas lu
ne se cite pas (RCH-09) — c'est la promesse même du produit, « toujours sur la vraie page ». Une
lecture qui n'en lit aucun ne vaut rien, quelle que soit sa vitesse.

Les quinze secondes par page sont donc **le prix d'une lecture juste**, et non un défaut à
corriger. La réserve 9.1 cesse d'être « d'où vient cette lenteur » : la question devient « ce
travail peut-il coûter moins », ce qui est un tout autre chantier.

### Et la découpe n'est pas un contournement : c'est un piège

C'est la conséquence sérieuse, et elle renverse la décision de 9.1 ter. Une tranche de moins de
neuf feuilles **ne tourne pas**, donc lit des pages couchées, donc rend un tiers des éléments et
aucun numéro de page — **sans rien signaler**. Elle est rapide parce qu'elle échoue.

Découper reste possible, mais plus comme on l'avait décidé : il faudrait que l'orientation du lot
soit **votée sur le document entier et transmise à chaque tranche**, jamais revotée par tranche.
Tant que ce n'est pas fait, une découpe fine produit silencieusement des lectures fausses, et
c'est pire que la lenteur qu'elle évite.


## 20 octobre 2026 — le premier document réel traité en entier

Troisième bloquant de BAS-02. *Théorie ACT* — 66 feuilles, 37,5 Mo, choisi pour être le **pire
cas** du chemin du texte : sa couche n'a pas un seul accent.

| relevé | valeur |
|---|---:|
| pages lues | 132 (66 feuilles coupées en deux) |
| durée | **113 s**, soit 0,86 s par page |
| pointe mémoire | 1 477 Mo |
| servies par la couche | **1** feuille sur 66 |
| servies par la reconnaissance | **65** |
| passages produits | 130, dont **2** illisibles |
| **numéros de page lus** | **99 sur 132 — 75 %** |

**L'inversion du 20 octobre fait exactement ce qu'elle annonçait**, et à l'échelle d'un vrai
document : 65 feuilles sur 66 passent par la reconnaissance, parce que la couche est lisible et
fausse. Deux passages illisibles sur 130 — le reste entre dans l'index en pouvant être vérifié.

### La surprise, et elle n'est pas où je la cherchais

Le premier relevé annonçait **20 % de numéros lus**, et j'ai cru tenir un défaut grave. La sonde
a montré l'inverse : les folios **sont lus**, mais par deux — « 12 13 », « 18 19 », « 28 29 ».
C'est un livre numérisé **deux pages par feuille**, et `numeroImprime` refuse alors de trancher,
comme il le doit : « s'ils se contredisent, on ne tranche pas ».

Je lisais une double page comme une seule. Les 20 % mesuraient mon erreur. Coupé en deux, le
même document rend **75 %**, et la quasi-totalité une fois les pages liminaires passées — elles
ne portent pas de folio imprimé, et c'est normal.

**Mais l'erreur est instructive, parce que ce n'est pas seulement la mienne.** Le classement en
familles (`familles.json`, 18 octobre) range ce document dans « livre photographié, **une** page
par feuille ». Il est manifestement à deux. Un réimport conduit par ce classement lirait donc
deux pages comme une, mêlerait leurs textes dans un même passage, et perdrait les trois quarts
des numéros imprimés — **sans rien signaler**, exactement comme mon banc.

C'est la première surprise d'échelle réelle, et elle est en amont du traitement : **le classement
en familles n'est pas fiable au document près.** Avant BAS-02, il faut soit le vérifier document
par document, soit détecter la double page à la lecture — deux folios sur une feuille en sont
précisément le signe, et la chaîne les a sous les yeux.

### Ce qui reste ouvert, et n'est pas mesuré

La mémoire **monte avec les pages** : 1 034 Mo à la dixième feuille, 1 806 à la soixante-sixième
en lecture simple, 1 477 en double. Sur un document de 480 pages et 410 Mo — le corpus en a un —
rien ne dit où elle s'arrête. Le plafond du projet est à 8 Go. À mesurer avant de traiter les
gros, et à ne pas supposer.


## 20 octobre 2026 — étape 6 faite, et l'ampleur de la double page mesurée

### Étape 6 : une manière de lire sans zone d'élément est légitime

La règle exigeait une zone d'élément, **toujours**. Elle refusait donc un document ordinaire
parce que rien n'y est numéroté pièce par pièce — et ces documents-là sont la quasi-totalité
d'une bibliothèque. C'était une hypothèse de domaine dans du code générique (CLA-01).

La règle juste, celle que le plan avait prévue : au moins **une** zone quel que soit son rôle, au
plus **une** zone d'élément, au plus **une** zone de numéro de page. Aucun contrat n'a bougé, et
les quatre recettes de méthode passent à l'identique.

**Une quatrième règle est née avec les autres, et elle n'était pas au plan** : un repère de piste
exige une zone d'élément. Une pastille se cherche à côté d'un élément — `relatif_a: "element"` au
contrat — et en ouvrant la porte aux manières sans élément on ouvrait aussi celle d'une piste
sans ancrage : chaque pièce valide séparément, la recette incohérente une fois assemblée.

Deux contrôles ne jugent plus que ce qui les concerne : la hauteur des éléments et l'exemple de
numéro décrivent un élément, et sans zone d'élément ils ne décrivent rien.

### Et l'ampleur de la double page : trente-quatre documents mal rangés

Trois feuilles lues par document, **couche texte seule, aucune reconnaissance** — un folio est
fait de chiffres, et les chiffres n'ont pas d'accents à perdre. Le signe cherché est celui que
`numeroImprime` a sous les yeux au moment où il renonce : **deux folios consécutifs dans les
bandes de marge** (`mesures/combien-de-doubles-pages.ts`).

| famille déclarée | deux pages mesurées | une page | couche muette |
|---|---:|---:|---:|
| livre photographié, deux pages par feuille | 17 | 7 | 0 |
| **livre photographié, une page par feuille** | **34** | 15 | 4 |
| feuillet photographié | 0 | 12 | 5 |

**Trente-quatre documents sur les cinquante-trois examinés de la famille « une page par
feuille » en portent deux — soit 64 %.** Le classement se trompe plus souvent qu'il n'a raison
pour cette famille. Ce n'est pas une anomalie, c'est un chantier, et il passe devant le reste :
lu selon son classement, chacun de ces documents mêlera les textes de deux pages dans un même
passage et perdra les trois quarts de ses numéros imprimés, **sans rien signaler**.

Ordre de grandeur des pages concernées : cette famille compte 7 728 pages pour 71 documents, soit
une centaine chacun ; trente-quatre documents en représentent donc de l'ordre de **3 700 feuilles,
7 400 pages**. C'est une extrapolation depuis une moyenne, et elle vaut ce que valent les
extrapolations de ce journal — l'ordre de grandeur, pas le chiffre.

**Ce que le relevé ne prouve pas**, et il faut le dire : le signe est une heuristique. Un cas est
clairement faux — `Applications cliniques en ICV.pdf` rend « 2003+2004 », qui est une plage
d'années et non deux folios. Les paires franches — 90+91, 132+133, 64+65 — ne laissent aucun
doute, mais le compte exact demanderait un œil. L'ordre de grandeur, lui, est solide : des
dizaines, pas deux.

Les sept documents de la famille « deux pages » qui ne rendent qu'un folio pourraient être mal
rangés dans l'autre sens. Le relevé ne le dit pas : il cherche une **preuve de double page**, pas
une preuve de page simple, parce que c'est la double page non détectée qui abîme les citations.
L'asymétrie est volontaire.


## 20 octobre 2026 — la double page se détecte seule, et le premier livre ordinaire passe

### La détection, et sa vérification

`deuxPagesParFeuille` vit dans `passages.ts`, à côté de `numeroImprime` dont elle lit les restes :
**deux folios consécutifs dans les bandes de marge**, ce que `numeroImprime` jette en refusant de
trancher. La couche suffit, elle est déjà lue, et un folio est fait de chiffres — cela ne coûte
rien.

Deux garde-fous tirés de la mesure : **deux feuilles au moins** doivent montrer le signe (un
document rendait « 2003+2004 », une plage d'années), et l'on regarde le **milieu** du document,
jamais ses pages liminaires. L'appelant garde le dernier mot : `doublePage` donné explicitement
l'emporte, ce qui laisse les deux positions éprouvables.

**Vérifié sur le document qui avait révélé le défaut, sans rien lui dire** : *Théorie ACT* rend
132 pages et **99 numéros imprimés sur 132**, exactement ce qu'il fallait lui imposer à la main.

### Le premier livre ordinaire, et l'étape 6 à l'épreuve

*Biologie du couple*, 173 pages, document natif sans la moindre pièce numérotée — le cas que la
chaîne refusait jusqu'à ce matin.

| relevé | valeur |
|---|---:|
| pages lues | 173 |
| durée | **1 seconde** |
| servies par la couche | **173** — aucune reconnaissance |
| passages illisibles | **0** |
| pointe mémoire | 581 Mo |
| numéros de page lus | 106 sur 173 — 61 % |

**Un livre natif ne coûte rien** : 0,01 s la page, contre 1,72 s pour un numérisé. Les deux
extrêmes du corpus tiennent maintenant dans le même banc, et l'écart entre eux est d'un facteur
cent soixante-dix.

### Et une troisième trouvaille, que seul un livre ordinaire pouvait donner

Les 39 % de folios manquants ne manquent pas : **les 173 pages portent toutes un nombre dans leur
bande de marge**, et 67 d'entre elles en portent **plusieurs**. `numeroImprime` refuse alors de
trancher — « s'ils se contredisent, on ne tranche pas ».

Ce n'est **pas** une double page : la détection ne s'est pas déclenchée, et à raison — les valeurs
ne se suivent pas. C'est un titre courant numéroté, ou un appel de note, qui partage la marge avec
le folio. La règle « exactement un candidat » est juste pour un livre numérisé et trop stricte
pour un livre composé.

Deux remèdes se présentent, aucun mesuré : préférer le nombre le plus **proche du bord** de la
page, ou celui dont la valeur **progresse** avec le rang de la feuille. Le second est le plus sûr
— un folio avance d'un en un, un appel de note non — et le plus coûteux, puisqu'il demande de
voir le document avant de trancher. À éprouver, pas à supposer.


## 20 octobre 2026 — le folio se tranche sur le document, plus sur la page seule

Quatrième chantier de la journée. `numeroImprime` refuse de trancher entre deux nombres de la
marge, et c'est juste pour une page seule : elle n'a aucun moyen de savoir lequel est son folio.
Mesuré sur un livre ordinaire, cela coûtait **39 % des numéros** — les 173 pages portaient toutes
un nombre, 67 en portaient plusieurs.

**Un folio progresse**, et c'est ce qui le distingue de ses voisins : il avance d'un en un avec le
rang, là où un titre courant numéroté, un appel de note ou une année ne le font pas. On vote donc
le **décalage** sur tout le document, et l'on retient page par page le candidat qui s'y tient.

Le vote n'a pas été réécrit : `decalageDominant` existe depuis le 4 octobre pour le chemin des
images, et c'est la même question. Deux votes pour une même question finissent par ne plus dire
la même chose.

### Le résultat, sur les deux documents déjà mesurés

| document | avant | après |
|---|---:|---:|
| *Biologie du couple* — natif, 173 pages | 61 % | **100 %** |
| *Théorie ACT* — numérisé, 132 pages | 75 % | **80 %** |

Les deux montent, aucun ne baisse. Sur le livre natif, **la totalité des pages porte désormais son
numéro imprimé** : une citation y est vérifiable de bout en bout.

### Deux garde-fous, et le second a été trouvé par une fixture

Le vote ne parle que si le document a **au moins quatre pages** — en deçà, « le plus fréquent »
serait un tirage au sort déguisé.

Et il lui faut un **appui** : au moins trois pages, et un cinquième du document. Ce second
garde-fou n'était pas prévu ; une fixture l'a imposé. Une feuille qui ne porte **qu'un** folio,
coupée en deux, donne un folio toutes les deux pages : le décalage change alors à chaque fois —
1−1, 2−3, 3−5 — et aucun ne revient. `decalageDominant` rend toujours une réponse, c'est son
contrat ; sans appui, cette réponse aurait emporté tout le document et **effacé les numéros justes
que chaque page avait trouvés seule**.

### Et le vote peut effacer, délibérément

Quand il parle, il l'emporte y compris pour **retirer** un numéro : une page dont le seul nombre de
marge ne tient pas le décalage portait un numéro de partie ou un appel de note, et `numeroImprime`
l'avait pris pour un folio. Mieux vaut pas de numéro qu'un faux — une citation renvoyée à la
mauvaise page est pire qu'une citation renvoyée à un rang assumé comme tel (RCH-09).


## 20 octobre 2026 — la chaîne océrise en anglais, et personne ne lui dit la langue

Trouvé en faisant le bilan des trois bloquants, et c'est une zone d'ombre que les mesures de la
journée **masquaient** : `lireParOcr` emploie `options.langue ?? "eng"`, et **rien dans `lot.ts`
ne passe de langue**. La chaîne réelle lit donc un corpus français avec le modèle anglais.

Tous les bons chiffres de la journée venaient d'un `langue: "fra"` que mes bancs ajoutaient. Ils
mesuraient donc une chaîne que la chaîne n'est pas.

### Ce que cela coûte, mesuré plutôt que redouté

Six feuilles de *Théorie ACT*, lues deux fois :

| langue | mots | accents | mots outils | folios |
|---|---:|---:|---:|---:|
| défaut de la chaîne (`eng`) | 1 946 | **284** | 35,4 % | 6/12 |
| `fra` | 1 944 | **337** | 34,9 % | 6/12 |

**Un accent sur six est perdu**, et rien d'autre ne bouge : même nombre de mots, même part de mots
outils, mêmes folios. J'avais écrit « c'est grave » avant de mesurer ; c'est un défaut réel et
borné, pas un effondrement — le modèle anglais reconnaît la plupart des glyphes accentués.

Mais c'est **exactement ce que l'inversion de la couche était censée gagner** : des accents, dont
une recherche en français dépend. En perdre un sur six après en avoir récupéré la totalité est une
régression silencieuse.

### Ce qui reste à décider, et qui n'est pas fait

D'où la langue devrait venir : la description de la bibliothèque la connaît-elle ? La recette ?
Faut-il la deviner du texte lu ? Aucune de ces réponses n'est évidente, et aucune n'est tranchée.
Ce qui est sûr, c'est qu'un défaut à `eng` dans un outil générique est une hypothèse de domaine
déguisée (CLA-01) — au même titre que les zones d'élément obligatoires l'étaient ce matin.


## 20 octobre 2026 — le plus gros document du corpus : la mémoire plafonne à 3,2 Go

480 pages, 391 Mo — le plus lourd des 250. Lancé pour sonder la seule ombre qui pouvait arrêter
le réimport net.

| relevé | valeur |
|---|---:|
| pages lues | 480 |
| durée | **1 129 s**, soit 19 minutes |
| cadence | 2,35 s par page |
| **pointe mémoire** | **3 212 Mo, atteinte tôt et stable** |
| servies par la couche | **0** — ce document n'a aucune couche texte |
| servies par la reconnaissance | 480 |
| passages illisibles | **0** sur 480 |
| numéros de page lus | 166 sur 480 — 35 % |

**La question de la mémoire est réglée.** Elle monte, puis elle plafonne : 3 212 Mo atteints avant
la trois centième page et plus un octet ensuite. Le plafond du projet est à 8 Go, et c'est le plus
gros document du corpus. **Aucun document ne le dépassera.**

Ce qui montait sur les documents précédents n'était donc pas une fuite : c'est le régime de
croisière d'une lecture d'images, atteint d'autant plus vite que le document est lourd.

La cadence confirme l'estimation du chemin du texte : 2,35 s par page océrisée contre les 2 s
mesurées le matin. Sur les ~8 000 pages à océriser du corpus, cela fait de l'ordre de **cinq
heures**, dépense unique.

### Les 35 % de folios, non expliqués, mais pas inexpliquables

Trois documents, trois résultats : 100 % sur un natif, 80 % sur un numérisé avec couche, **35 %
ici**. Ce qui distingue celui-ci est connu et déjà mesuré : il n'a **aucune couche texte**, donc
chacun de ses folios doit venir de la reconnaissance — et Tesseract, en segmentation « page
entière », **abandonne un chiffre isolé que rien n'entoure**. C'est ce qui a été constaté sur la
fixture `couche-fautive.pdf`, dont le folio n'est jamais lu quelle que soit sa distance au bloc de
texte.

L'hypothèse n'est pas vérifiée sur ce document-ci, et le chiffre reste tel quel. Mais elle a une
conséquence utile : **le vote du décalage ne peut pas récupérer ce que la reconnaissance n'a pas
lu**. Si cette piste se confirme, le remède n'est pas dans le vote mais dans la façon dont on
demande la lecture des marges — une segmentation serrée sur la bande, comme la lecture d'un repère
le fait déjà.


## 20 octobre 2026 — le chaînon manquant : du dépôt à la recherche

### Ce qui n'existait pas, et que personne n'avait vu

Relevé sur `origin/main` en préparant le plan : `executerTravail` lisait un document, construisait
une vue et des passages, **rapportait** — et n'écrivait rien. `ingerer` savait écrire le lot et
**n'était appelée que par ses propres épreuves**. `enregistrerPassages` n'avait **aucun appelant**,
nulle part. `activerVersion` non plus, hors épreuves.

L'étape 5 du chemin du texte — « écriture dans `passage` et l'index plein texte à l'activation
d'une version » — n'était donc pas faite. **Toutes les pièces existaient, bien faites et
éprouvées ; leur assemblage manquait**, et c'est lui seul qui séparait la chaîne d'une
bibliothèque cherchable.

### `enregistrerLeTraitement`, et l'ordre de ses trois gestes

Le lot, puis les passages, puis l'activation — **l'activation en dernier**. Une version n'est
active que lorsque tout ce qu'elle promet est écrit : si les passages sont refusés — un trou dans
les rangs est ce qu'un transport perd —, la version précédente reste celle qu'on lit. Activer
d'abord laisserait une version vivante et vide, ce qui est pire que pas de version du tout.

Cinq épreuves, dont celle qui garde cet ordre : un lot aux rangs troués est refusé, et la version
d'avant reste active avec son texte encore trouvable.

### Le critère, vérifié sur un vrai livre

*Biologie du couple*, 173 pages, par `mesures/du-depot-a-la-recherche.ts` :

| | |
|---|---|
| lu | 173 pages, 173 passages, **1 s** |
| déposé | 173 passages, version active |
| recherche « provoquent en s'interpellant sans en » | 1 résultat |
| **la recherche dit** | **page 87, numéro imprimé 87** |
| **le PDF la porte** | **page 87** |

**La citation pointe sur la page où le texte est réellement imprimé.** La vérification ne tourne
pas en rond : la phrase est cherchée une seconde fois dans le PDF d'origine par un chemin qui ne
partage rien avec celui qui l'a indexée — `lireCoucheTexte` seul, sans coupe de feuille, sans
arbitrage, sans vote de décalage.

**Ce que cela ne prouve pas**, et il faut le dire : les deux chemins lisent la même couche texte.
Sur un document **numérisé**, dont le texte vient de la reconnaissance, cette vérification ne
s'applique pas — il faudrait un œil sur l'image. Elle vaut pour un document natif, où la couche
**est** le texte imprimé.

### Et un défaut du banc, attrapé par le banc

Son premier jet cherchait « les quatre premiers mots longs de la page », qui ne se suivent pas
dans le texte : la phrase n'existait nulle part et la recherche ne la trouvait pas. Pendant un
instant cela ressemblait à un défaut d'indexation. C'était le banc qui avait tort, et il cherche
désormais des mots **contigus**.


## 20 octobre 2026 — un document numérisé jusqu'à la recherche, et l'EPUB qui n'existe pas

### 1. Le numérisé : trois citations prêtes à vérifier à l'œil

*Théorie ACT* traverse la chaîne entière — lecture, dépôt, activation, recherche — et rend trois
citations retrouvées (`mesures/citations-a-verifier.ts`) :

| citation | la recherche dit | sur la feuille |
|---|---|---|
| « appellation sont interchangeables). C'est l'impli- cation » | page 34, folio **33** | 17, moitié droite |
| « permettrait de poursuivre le trajet, de » | page 67, folio **66** | 34, moitié gauche |
| « présent \| Acceptation \| Défusion _ » | page 99, folio **98** | 50, moitié gauche |

Le décalage est constant — folio = rang − 1 — ce qui est le signe que le vote du décalage a trouvé
la bonne série.

**La vérification ne peut pas être faite par le programme, et c'est le point.** Sur un document
natif, `du-depot-a-la-recherche.ts` recherche la phrase une seconde fois dans le PDF : la couche
**est** le texte imprimé. Ici le texte vient de la reconnaissance, et la couche est précisément ce
qu'on valide — la confronter à elle-même reviendrait à demander à l'accusé de témoigner pour
lui-même. **Seule l'image de la feuille fait foi**, et seul un œil peut la lire. Le banc prépare
la comparaison et s'arrête là.

### 2. L'EPUB : la chaîne ne sait pas le lire, et c'est bloquant

La composition réelle attendue des bibliothèques est **50 % PDF / 50 % EPUB**, et non les 7,6 %
du corpus d'essai (19 fichiers sur 250). L'étape 7 du chemin du texte — « formats sans pages
fixes : lecture par chapitre, ancre déclarée comme telle » — avait été différée sur l'hypothèse
inverse. **Cette hypothèse est caduque.**

Mesuré, sans ambiguïté : `lireLeTexte` sur un EPUB du corpus rend
`InvalidPDFException: Invalid PDF structure.` La chaîne traite **tout** comme un PDF. L'EPUB est
seulement **identifié** — `signatures.ts` reconnaît `application/epub+zip` — et rien ne le lit.

Conséquence sur la demande de vérifier la propagation de la langue jusqu'à l'EPUB : **la question
ne peut pas se poser**, il n'y a aucun chemin EPUB dans lequel une langue pourrait se propager.

Et le refus n'est même pas poli : rien ne vérifie le type du document avant de le lire, et l'on
obtient une levée de pdf.js plutôt qu'un message qui dise ce qui ne va pas. Un format que l'on ne
sait pas lire doit se dire, pas planter.

### Ce que cela change pour le troisième bloquant

Il **n'est pas clos**. Le chaînon fonctionne, et il est prouvé sur deux documents PDF — un natif
de bout en bout, un numérisé jusqu'à la citation. Mais la moitié de ce que les bibliothèques
porteront ne franchit pas la première étape.


## 20 octobre 2026 — la chaîne lit les EPUB : des feuillets, pas des pages

L'étape 7 du chemin du texte, avancée parce que la composition réelle attendue est **50 % PDF /
50 % EPUB** et non les 7,6 % du corpus d'essai.

### Ce que la mesure a décidé à notre place

Quatre EPUB du corpus sondés : **aucun** ne porte de pagination d'édition imprimée — ni
`page-list`, ni repère `pagebreak`. « Toujours sur la vraie page » n'a donc pas de sens littéral
ici, et fabriquer des numéros promettrait une vérification impossible.

Et le découpage de l'auteur ne fait pas mesure : **3 fichiers de contenu** pour un livre,
**69** pour un autre ; 1 Kio médian contre 16. « Chapitre 1 sur 3 » ne situe rien.

### Ce qui a été retenu

| | |
|---|---|
| le **rang** | un découpage régulier en **feuillets de 300 mots**, figé avec la version |
| la **vérifiabilité** | le texte exact du feuillet, qui est son propre repère |
| le **contexte** | le chapitre d'où il vient |

Un feuillet **n'est pas une page** et ne s'appelle pas ainsi : `pageImprimee` reste **absent**, et
`citerPage` dit alors « passage 47 du document » plutôt qu'un numéro que le livre ne porte pas. Le
contrat prévoyait déjà ce cas — **rien n'a eu à changer**.

Trois cents mots parce que c'est l'ordre de grandeur d'une page de livre. La valeur est figée avec
la version : la changer renumérote toutes les citations d'un livre déjà lu, et cela demande de le
relire, comme changer une recette le demande.

### La langue vient du livre, pas de la bibliothèque

Chaque EPUB sondé déclare la sienne, et **l'un des quatre est en anglais dans une bibliothèque
française**. Une bibliothèque dit la langue de sa collection ; un livre dit la sienne, et c'est
celle-là qui compte pour le lire. `lireEpub` la rend.

### Un lecteur de ZIP écrit plutôt qu'emprunté

Un EPUB n'emploie que deux façons de ranger un fichier, telle quelle ou dégonflée, et `node:zlib`
sait dégonfler. Le reste est un format de table qui tient en quelques dizaines de lignes — la même
décision que l'encodeur CCITT et la table d'objets PDF du dépôt, et pour la même raison.

**La table centrale fait foi, jamais les en-têtes locaux** : c'est elle qui fait autorité, et un
fichier dont les deux se contredisent est précisément celui qu'on ne veut pas lire au hasard. Une
méthode de compression inconnue se dit plutôt que de rendre des octets qui ressembleraient à du
texte.

### Vérifié de bout en bout

*L'Intelligence du cœur*, EPUB de 69 chapitres :

| | |
|---|---|
| lu | **322 feuillets**, moins d'une seconde |
| déposé | 322 passages, version active |
| recherche « possibilité de s'affirmer, d'être entendu, » | 1 résultat |
| la recherche dit | **feuillet 162, sans numéro imprimé** |
| le livre le porte | **feuillet 162** |

La vérification relit les chapitres **depuis l'archive**, sans passer par le dépôt : ce qu'elle
établit est que la citation est un extrait réel du livre, et que le feuillet cité est celui qui la
porte. C'est ce qu'un EPUB permet de vérifier — il n'a pas de page imprimée à confronter.

### Ce qui reste, et qui n'est pas fait

**Le chapitre n'est pas conservé.** `Feuillet` le porte, `lireUnEpub` le laisse tomber : `Passage`
est `.strict()` et n'a pas de champ pour lui. Le montrer à l'écran demande donc un champ au
contrat, une colonne au dépôt et une migration. C'est le tiers de la décision du 20 octobre qui
n'est pas livré, et il est dit ici plutôt que tu.


## 20 octobre 2026 — un passage dit d'où il vient (contrat, colonne, migration 7)

Le tiers manquant de la décision sur les EPUB. `Passage` gagne **`emplacement`**, une chaîne
facultative : le chapitre pour un EPUB, rien pour une page de PDF.

### Pourquoi un format sans pages en a besoin

« Feuillet 162 » ne situe rien pour un lecteur. Le chapitre le situe. Mais il **ne sert jamais à
citer** : deux livres ne découpent pas leurs chapitres de la même façon — trois fichiers de
contenu pour l'un, soixante-neuf pour l'autre, mesuré — et un rang tiré de là ne se comparerait
pas. Citer reste l'affaire de `page` et, quand le document le porte, de `pageImprimee`.

Et il reste **absent** plutôt que de porter du remplissage : une page de PDF n'a rien à déclarer
au-delà de son numéro, et un champ qui dirait « je sais » sans rien savoir vaudrait moins que son
absence. Le contrat refuse d'ailleurs une chaîne vide.

### La migration ne casse rien, et c'est éprouvé

`ALTER TABLE passage ADD COLUMN emplacement TEXT` — nulle par défaut, donc rien à réécrire ni à
recalculer. L'épreuve qui compte est celle qui reproduit ce qui arrive à la bibliothèque de
quelqu'un : **un dépôt arrêté à la migration 6, rempli, puis migré**. Ses passages se relisent, son
index plein texte les retrouve toujours, et leur emplacement est `undefined` — une colonne neuve
qui aurait inventé une valeur se serait vue là.

Les migrations D1 ont été réengendrées : le garde-fou compare les fichiers du disque à ce qu'il
engendrerait, et il a refusé tant que la septième manquait.

### Vérifié de bout en bout

*L'Intelligence du cœur* : la recherche rend « page 162, sans numéro imprimé, **dans
text/part0033.html** ». Le chapitre traverse la lecture, le découpage, le dépôt et la recherche.

### Ce qui reste, et qui n'est pas fait

**Aucun écran ne le montre encore.** `citerPage` ne connaît pas `emplacement` : il dit « page 162
du document » là où il pourrait dire où. La donnée est là, sa mise à l'écran ne l'est pas.


## 20 octobre 2026 — la porte franchie pour de vrai, et une correction de mon diagnostic

### Ce que j'avais conclu, et qui était faux

J'ai relevé que `enregistrerLeTraitement` n'est appelée par rien dans le produit. **Le constat est
juste.** La conclusion que j'en ai tirée — « le dernier chaînon manque, le texte déposé n'arrive
pas à la recherche » — **était fausse**, et la consigne de brancher la porte sur cette fonction en
découlait.

Le produit a un chemin complet, et il ne passe pas par le dépôt SQLite :

| | |
|---|---|
| 1 | `executerTravail` rend un instantané, passages compris — et **n'écrit rien** (JOB-06) |
| 2 | l'hôte Rust écrit cet instantané tel quel, puis pose le pointeur d'activation |
| 3 | il le relit et sert ses passages (`passages_de_document`) |
| 4 | l'écran cherche dedans avec `chercher`, en mémoire |

Je n'avais regardé que le dépôt SQLite, et pas l'hôte. Ce que j'aurais dû faire d'abord, et ce que
j'ai fait cette fois : suivre le chemin depuis l'écran, pas depuis la fonction que je venais
d'écrire.

### Pourquoi la porte n'a pas été branchée comme demandé

Trois raisons, et chacune suffirait :

- **JOB-06** dit que l'hôte est le seul écrivain du dépôt — décision du 6 octobre 2026, inscrite
  dans `processus.ts` et dans `traitement.rs`. Faire écrire le processus annexe la contredit.
- Le texte serait écrit **deux fois à deux endroits**, l'instantané et SQLite, et l'un des deux
  finirait par mentir.
- `@lienotheque/depot-sqlite` est une dépendance de **développement** d'ingestion ; l'y faire
  entrer en production pour nourrir un magasin que rien ne lit n'a pas d'usage.

**Réserve nommée, tranchée le 21 octobre 2026 :** le dépôt SQLite, ses sept migrations et son index
plein texte FTS5 sont **lus par rien dans l'application**. Ils ont été bâtis pour l'hébergement du
lot E, où D1 reprendra le même schéma. **Décision : aucune action maintenant** — c'est pour E3 et
D1, pas pour le bureau local. On le laisse en réserve nommée plutôt qu'en chantier ouvert.

### Le défaut que le passage par la vraie porte a trouvé

*Biologie du couple*, 173 pages, traité par `executerTravail`, relu comme l'hôte le relit, cherché
avec la fonction même de l'écran. La phrase cherchée est imprimée **page 87**. La recherche
répondait **page 1** — la page de copyright.

La fenêtre d'extrait se prenait autour de la **première correspondance venue**. Les morceaux
cherchés sont composés `[phrase, ...mots]`, mais les correspondances sont rendues dans l'ordre du
texte : sur une page de deux mille signes, la fenêtre tombait sur un mot isolé du début et ne
contenait jamais la suite cherchée.

Ce n'était pas qu'un extrait mal choisi. La sûreté d'un résultat se juge **sur son extrait**
(`porteLaSuite`) : une page qui portait la suite passait donc pour du bruit, et la citation tombait
ailleurs. Le correctif centre la fenêtre sur la suite entière quand la ligne la porte, et ne garde
la première correspondance que par défaut. Les surlignages, eux, ne changent pas.

Après correction : « page 87 », l'extrait porte la phrase, et un second chemin de lecture
(`lireCoucheTexte` seul, sans coupe de feuille ni arbitrage) confirme que la page 87 du PDF la
porte. **Le critère de BAS-02 est tenu sur ce document.**

### Ce que les épreuves d'avant ne pouvaient pas voir

Les épreuves de `chercher` tenaient en une ligne de texte, où la suite est toujours à portée de la
fenêtre. C'est le genre de défaut qu'aucune épreuve unitaire bien écrite ne trouve, et qu'un vrai
document trouve en une minute. D'où la nouvelle épreuve `de-la-porte-a-la-recherche.test.ts`, qui
emprunte le chemin entier — porte, aller-retour JSON de l'hôte, contrats de relecture, `chercher` —
sur une fixture qui dit elle-même quelle page porte quoi.


## 21 octobre 2026 — les trois bloquants de BAS-02 sont clos, avec leurs réserves

Décision de Christophe. Le réimport des deux cent cinquante peut être envisagé : les trois
conditions qu'on s'était données sont tenues.

| Bloquant | Ce qui le clôt |
|---|---|
| 1. Qualité de la couche texte | 50 couples adjugés à l'œil sur le vrai corpus, borne 41–70 %, OCR préféré à la couche, fixture qui le prouve, F1/F3/F4/F5 inchangés |
| 2. Dégradation de F4 | Cause trouvée — le vote d'orientation qui bascule à la 9ᵉ feuille ; 15 s/page actées comme le coût d'une lecture juste ; la découpe du 17 octobre invalidée |
| 3. Le vrai corpus de bout en bout | Trois formats traversent la chaîne (PDF natif, PDF numérisé, EPUB), et un document réel traverse la **porte réelle** jusqu'à la recherche, cité sur la page où le texte est imprimé |

### Les réserves, consignées plutôt que tues

**L'épreuve Rust est séparée du reste.** L'épreuve de bout en bout reproduit l'aller-retour JSON de
l'hôte, elle ne lance pas l'hôte. `ecrire_version`, `activer` et `charge_active` sont couverts par
les épreuves Rust, qui ne sont pas dans `pnpm check` (voir la décision sur les deux intégrations
continues). `passages_de_document`, une extraction d'une ligne, n'a pas d'épreuve.

**Le dépôt SQLite reste lu par rien.** Réserve nommée, tranchée ci-dessus : rien à faire avant E3
et D1.

### Les trois citations du document numérisé, vérifiées à l'œil

*Theorie ACT Que sais-je.pdf*, document numérisé en double page, texte venu de la reconnaissance —
donc la couche ne peut pas servir de preuve, c'est elle qu'on valide. Trois citations confrontées à
l'image de la feuille :

| Feuille | Moitié | Folio annoncé | Vu sur l'image |
|---|---|---|---|
| 17 | droite | 33 | le texte y est, folio 33 à droite, 32 à gauche |
| 34 | gauche | 66 | le texte y est, folio 66 ; la moitié droite finit le chapitre, sans folio |
| 50 | gauche | 98 | l'emplacement est juste, folio 98 |

**Ce que la troisième apprend, et qu'aucune des deux autres ne disait :** « présent | Acceptation |
Défusion » n'est pas une phrase imprimée. Ce sont les **étiquettes d'une figure** que la
reconnaissance a lues en ligne. La page est la bonne et le repère est le bon — une citation peut
donc tomber juste et rester illisible comme phrase. Rien n'est fait de ce constat pour l'instant :
retirer le texte de figure changerait l'extrait exact que RCH-07 promet, et une légende de figure
est parfois exactement ce qu'on cherche.


## 21 octobre 2026 — un livre composé en texte n'avait rien à montrer, et ne le disait pas

Relevé en passant un document du corpus par la porte réelle : sa vue sort avec **zéro page**. Ce
n'est pas un accident de banc, c'est structurel, et cela vaut pour la moitié du corpus.

### Pourquoi un livre natif n'a aucune page dans sa vue

Les pages de la vue viennent **uniquement** de la chaîne d'images. `instantaneDeLot` le dit en
toutes lettres : « une page existe parce qu'elle a été lue », et `pages` est tiré de
`resultat.pages`, ce que la manière de lire a su lire **sur l'image de la feuille**. Or
`exporterPages` extrait le JPEG que porte chaque feuille d'un document **numérisé** : un livre
composé en texte n'en porte aucun, donc aucune image, donc aucun repère, donc aucune page.

L'hôte demande pourtant toujours les images (`charge_de`) : ce n'est pas un oubli de configuration,
il n'y a simplement rien à extraire. Aucun moteur de rendu n'existe dans la chaîne, et en ajouter un
serait un chantier, pas un correctif.

Le chemin du texte, lui, fonctionne parfaitement sur ces documents : 173 passages lus, citations
justes, vérifiées contre le PDF.

### Ce que l'écran montrait

Rendu du Lecteur avec une telle vue, texte visible relevé :

    Accueil · Un livre ordinaire · feuillet
    Clause 0 sur 0
    Note — Clause
    Position dans le document : — sur 0
    Réduire · 100 % · Agrandir · Ajuster à la fenêtre

Colonne de vignettes vide, centre vide, aucune phrase. **Le défaut n'est pas l'absence de pages,
qui est un fait ; c'est le silence.** Quelqu'un qui vient de déposer un livre et dont le traitement
a réussi tombe sur une carcasse, sans savoir si son document est perdu — alors que son texte est là
et se cherche.

### Ce qui a été fait

Le Lecteur dit maintenant ce qu'il en est, et retire les outils de page au lieu de les laisser
inertes — un zoom sur rien et un compteur à zéro se lisent comme une panne. Les mots viennent du
schéma (CLA-01).

Il ne peut pas deviner seul si le texte a été lu : la vue porte les repères, les passages portent le
texte, et les deux lui arrivent séparément. D'où `texteLu`, sans quoi l'écran promettrait une
recherche qui ne rendrait rien sur un document que la chaîne n'a pas su lire.

### Ce qui reste, et qui n'est pas fait

- **Le Lecteur ne montre toujours pas le texte d'un livre natif.** Il sait dire où le chercher,
  pas l'afficher. Montrer le texte d'un document sans image est un écran à concevoir, pas un
  correctif de silence. **Ouvert comme chantier à part entière le 21 octobre 2026**, pour qu'il ne
  devienne pas une dette tue : `docs/chantier-lire-un-livre-natif.md` — le fait, son ampleur, trois
  routes et ce qu'il faudra décider avant d'écrire. Il sera nécessaire avant que le Lecteur soit
  complet sur la moitié du corpus.
- **Le banc divergeait de l'application** : il n'envoyait pas d'images de pages, là où l'hôte en
  demande toujours. Corrigé — sans quoi il n'éprouvait pas ce qu'il prétendait éprouver. La
  correction n'a rien changé au résultat (zéro image extraite d'un natif), mais c'est par chance.
- **Le mode démonstration ne permet pas d'atteindre le Lecteur.** La vue chargée au démarrage est
  effacée dès que la bibliothèque de démonstration arrive (`setVue(undefined)` au changement de
  racine, qui est juste pour une vraie bibliothèque). Le Lecteur n'y est donc visible que dans la
  fenêtre de course qui précède ce chargement. Constaté, non corrigé : cela ne touche que la
  démonstration.


## 21 octobre 2026 — l'état du corpus, mesuré plutôt que supposé

Trois inconnues de l'état des lieux ont été mesurées avant d'en faire une recommandation. Deux se
dissolvent, une se réduit à un document.

### L'inventaire : 250 documents, 21 515 pages au moins

| | |
|---|---:|
| Fichiers lus | 293, 12,87 Go |
| Doublons exacts | 43 fichiers, 4,57 Go |
| **Documents distincts** | **250**, 8,30 Go |
| Pages comptées | 21 515 |
| Portant une couche texte | 220 sur 250 |
| Formats | 231 PDF, 18 EPUB, 1 .docx |

**21 515 est un plancher, pas un total** : l'inventaire ne sait pas compter les pages de 23
documents (les 18 EPUB, le .docx, et quatre PDF).

### Les « quatre documents illisibles » n'existent pas

Ils étaient illisibles **par le compteur de pages de l'inventaire**, pas par la chaîne. Les quatre
passés par la porte réelle, en entier :

| Document | Ce qui en sort |
|---|---|
| *Relier les états du moi* | 6 feuillets lus par la couche, citation juste |
| *Livre mais tu ne m'avais jamais dit ça* | 171 passages, rang 86 → numéro imprimé 91, citation juste |
| *Manuel N1 ICV2020* | rang 29 → numéro imprimé 29, citation juste |
| *Métaphores et suggestions hypnotiques* | 562 passages, aucun numéro imprimé — cité par son rang, et il le dit |

Au passage, une confirmation de la décision du 17 octobre sur la découpe : le même document lu sur
**quatre pages** donnait « page 2000 » — une année de bibliographie prise pour un folio, le vote
n'ayant pas assez d'appuis pour la rejeter. Lu en entier, il donne 91. **Une tranche ne vaut pas un
document**, et la faute qu'elle produit a l'air d'un résultat.

### Les dix-huit EPUB : dix-sept sur dix-huit, vérifiés

Un seul EPUB avait été traversé de bout en bout, pour une moitié annoncée du corpus. Les dix-huit
sont passés par `mesures/tous-les-epub.ts` : chacun lu, puis une phrase prise au milieu cherchée
une seconde fois dans les chapitres relus depuis l'archive.

**17 lus, 17 citations vérifiées, en un dixième de seconde chacun.** Tous les feuillets portent leur
chapitre. Les langues déclarées par les archives sont variées — `fr`, `fr-FR`, `en`, `en-US`,
`EN-US` — et c'est bien celle de l'archive qui est retenue.

**Le dix-huitième est un vrai EPUB que la chaîne refuse.** *Hypnose Conversationnelle*
(Allan Trevor) porte son `mimetype` à `application/epub+zip`, son `META-INF/container.xml` et ses
27 fichiers XHTML — tout ce qu'il faut. Mais l'entrée `mimetype` y est rangée **dix-huitième** au
lieu d'être la première, et la reconnaissance par signature, qui lit les premiers octets, ne voit
qu'une archive ZIP. Le message le dit correctement — « la chaîne ne sait pas encore lire ce format
(Archive ZIP) » — il n'accuse rien à tort. Le correctif est une condition : devant une archive ZIP,
chercher `mimetype` ou `META-INF/container.xml` dans le catalogue central avant de renoncer.


## 21 octobre 2026 — ce que coûte un réimport, et le document que la chaîne refuse

### Le chiffre : une nuit, pas un après-midi

Dix documents pris en travers des familles, chronométrés par la **porte réelle**, cache neuf.

| Document | Pages | Temps | Couche | Reconnaissance |
|---|---:|---:|---:|---:|
| DSM-5 | 1275 | 6,7 s | 1275 | 0 |
| Thérapeutique manuelle (390 Mo) | 480 | **1846,8 s** | 0 | 480 |
| Biologie du couple | 173 | 0,7 s | 173 | 0 |
| Trois EPUB | 1023 | 0,3 s | 1023 | 0 |
| Protocole tabac | 6 | — | **refusé** | **refusé** |
| Schémas 2021 — Introduction | 28 | 0,2 s | 26 | 0 |
| La thérapie d'acceptation et d'engagement | 66 | 143,1 s | 0 | 66 |
| Théorie ACT Que sais-je | 66 | 174,6 s | 1 | 65 |

**Deux cadences :** la couche sert **0,003 s/page**, la reconnaissance **3,54 s/page**. Un facteur
mille deux cents. Rapporté au corpus — de l'ordre de dix mille pages lourdes sur 21 515 — le
réimport demande **environ dix heures**, stable entre 9,1 h et 10,0 h selon où l'on place la
frontière. À lancer le soir.

**Les quinze secondes par page de F4 ne s'appliquaient pas.** C'était le coût du chemin des images
avec son vote d'orientation ; le chemin du texte coûte quatre fois moins. L'estimation d'hier était
pessimiste d'un facteur quatre.

**On ne sait pas d'avance de quelle famille un document relève.** *Thérapeutique manuelle* porte des
polices et part à 100 % en reconnaissance — l'inversion a jugé sa couche mauvaise. *Schémas 2021*
n'en déclare aucune et se lit à 26/28 par sa couche, ses polices étant héritées du nœud parent. Le
détecteur se trompe dans les deux sens : d'où une fourchette, et non un nombre.

### Le document refusé : une famille de trois, pas un dixième du corpus

Dans l'échantillon, un document sur dix était refusé en entier. La proportion a inquiété — à ce
taux, vingt-cinq documents à reprendre à la main. **Elle était fausse** : l'échantillon contenait
par hasard un des trois.

Recensement de la composition des pages sur tout le corpus (`mesures/images-du-corpus.ts`) : une
page se lit si elle déclare une **police**, ou si elle porte une **image exploitable** — un
`DCTDecode` qu'`octetsImage` rend en JPEG, ou des bandes à 1 bit que `rasterBilevel` empile.

| | |
|---|---:|
| PDF sondés | 253 |
| Pages vues | 23 090 |
| Pages sans police ni image exploitable | **97**, soit 0,42 % |
| Documents dont une page au moins est muette | 20 |
| **Documents refusés en entier, vérifiés un par un** | **3** |

Les trois : *Protocole tabac* (6 pages), *auto-hypnose tabac* (2 pages), *Mémo 4 — Analyse
fonctionnelle* (1 page). **Neuf pages sur 21 515.**

**La cause est une seule, et elle est nette.** Leurs pages ne portent qu'un raster `FlateDecode` à
8 bits et aucune police. `octetsImage` le rend sous l'étiquette `raw` ; `exporterPages` ne prend que
`jpg`, et `rasterBilevel` ne prend que des bandes à 1 bit. Ni l'un ni l'autre ne sait en faire une
image, et la reconnaissance n'a donc rien à lire.

Les documents écartés du recensement ne sont pas un angle mort : les plus lourds portent tous un
`DCTDecode` par page — 255 pour 255 pages, 307 pour 307 —, donc une image JPEG chacune. Et les
quatre que ce lecteur ne sait pas ouvrir ont été passés par la porte réelle le matin même, et se
lisent.

### Ce qui est décidé, et ce qui ne l'est pas

**Cela ne bloque pas le réimport.** Trois documents sur deux cent cinquante, neuf pages sur
vingt et un mille, et un refus **explicite qui nomme sa cause** : rien ne se perd en silence, et
ces trois-là se reprennent après coup.

**Petite dette technique, à traiter après le réimport — décidé le 21 octobre 2026.** 97 pages sur
23 090, trois documents refusés en entier sur deux cent cinquante, et un refus qui nomme sa cause :
aucune urgence, et rien qui se perde en silence. On la note pour ne pas l'oublier, on ne la traite
pas avant.

**Ce qu'elle demande :** savoir prendre un raster `FlateDecode` comme image
de page. C'est le cas le plus simple qui soit — une trame non compressée dont la largeur, la hauteur
et l'espace de couleur sont dans le dictionnaire — et `@lienotheque/images` sait déjà réduire et
encoder. Les pages en `JPXDecode` (JPEG 2000) tombent sous la même limite : 23 pages d'un document
de 594, qui se lit par ailleurs.


## 21 octobre 2026 — la détection de la double page ne sert à rien : la porte ne la consulte pas

Relevé en abordant le point 2. Le problème n'est pas celui qu'on croyait, et il est plus grave.

### Le troisième mécanisme juste que la porte ne franchit pas

`lireLeTexte` décide ainsi :

    const doublePage = options.doublePage ?? (couche.length > 0 && deuxPagesParFeuille(couche));

Et la chaîne appelle ainsi (`lot.ts`) :

    const lu = await lireLeTexte(lot.pdf, { doublePage: recette.preparation.double_page, … });

`preparation.double_page` est un **booléen obligatoire** au contrat. Il est donc toujours défini,
le `??` ne tombe jamais, et **la détection automatique ne s'exécute jamais par le chemin du
produit**. Elle ne tourne que là où `lireLeTexte` est appelée sans l'option : les bancs et les
épreuves.

C'est la troisième fois en deux jours qu'un mécanisme juste se révèle inatteignable depuis la porte
réelle — après `enregistrerLeTraitement`, après le texte des documents natifs. **Le même défaut,
un cran plus loin à chaque fois.**

**Et il a faussé une vérification.** Les trois citations de *Théorie ACT* vérifiées à l'œil le
20 octobre — « feuille 17, moitié droite, folio 33 » — sont sorties de `citations-a-verifier.ts`,
qui appelle `lireLeTexte` **sans déclaration** : la coupe a donc eu lieu. Par la porte, le même
document rend **66 passages pour 66 feuilles** : aucune coupe. Les citations étaient justes ; le
chemin qui les a produites n'est pas celui du produit.

### Ce que le corpus dit, et qui renverse la question de départ

Relevé sur 257 PDF (`mesures/doubles-pages-du-corpus.ts`), deux signes par document : les **folios**
— deux nombres consécutifs dans la bande de marge, ce que la chaîne regarde — et la **forme**, le
rapport largeur sur hauteur de la feuille.

| | |
|---|---:|
| Documents que les folios disent doubles | **82** |
| Feuilles en paysage qu'aucun folio ne dénonce | 32 |
| …dont la couche est trop maigre pour voir quoi que ce soit | **1** |

**L'angle mort qu'on redoutait n'existe presque pas** : un seul document numérisé est muet au point
que la détection n'ait rien à regarder. En revanche :

- Les 32 feuilles en paysage non dénoncées sont des **diaporamas** — 1,78 (seize neuvièmes) et
  1,33 (quatre tiers), « 1 diapo par page » jusque dans leurs noms. Les couper en deux serait une
  faute, et le détecteur a raison de se taire. **La forme seule n'est donc pas un signe sûr.**
- Mais parmi les 82 que les folios disent doubles, certains ont une forme de **0,71** — une feuille
  **portrait**, plus haute que large. Une telle feuille ne peut pas porter deux pages portrait
  côte à côte : ce sont des faux positifs, et ils sont faciles à nommer.

### Ce qui est à trancher, et qui ne l'est pas ici

Le détecteur gagnerait un garde-fou d'une ligne — une feuille qui n'est pas en paysage ne porte pas
deux pages — mais cela ne changerait rien tant que la porte ne le consulte pas. Le fond est un choix
de contrat : `preparation.double_page` est-il une **décision de l'administrateur** (et alors son
absence doit être permise, pour laisser voir le document) ou un **réglage toujours présent** (et
alors la détection n'a pas lieu d'être) ? Soumis avant d'écrire.


## 21 octobre 2026 — la double page se déclare ou se laisse voir, et un garde-fou pour la porte

Décision de Christophe : **option A**, la déclaration devient facultative, **avec le garde-fou de
forme**. Implémentée, épreuves avant code.

### Ce qui change

| | |
|---|---|
| `Recette.preparation.double_page` | **facultatif**. Absent : personne n'a tranché, la chaîne regarde la feuille. Présent : c'est une décision, et elle l'emporte — y compris un `false` |
| `Brouillon.pageDouble` | facultatif lui aussi, et `BROUILLON_NEUF` **se tait** : aucun écran ne demande ce réglage, un défaut écrit serait pris pour une décision |
| `enRecette` / `depuisRecette` | le silence traverse l'aller-retour sans devenir un `false` |
| `lot.ts` | ne transmet `doublePage` que si la manière de lire l'a déclaré |
| `deuxPagesParFeuille` | **refuse de conclure sur une feuille qui n'est pas en paysage** |

Le garde-fou de forme n'est pas un détail : le relevé du corpus montrait des documents **portrait**
déclarés doubles par leurs folios — deux nombres consécutifs dans une bande de marge, ce qu'un pied
de page numéroté et un appel de note produisent très bien. Les couper mêlerait deux moitiés de page
dans chaque passage et ferait pointer toutes leurs citations à côté.

Au passage, trois épreuves anciennes de la détection décrivaient leurs feuilles **en portrait** —
une forme qu'aucune feuille à deux pages ne peut avoir. L'oubli ne se voyait pas tant que la forme
n'entrait pas dans la décision ; les fixtures ont été redressées, sans quoi les épreuves négatives
auraient réussi pour la mauvaise raison.

### La vérification qui compte, refaite par la bonne porte

Les trois citations de *Théorie ACT* validées à l'œil le 20 octobre venaient d'un banc qui appelait
`lireLeTexte` directement. `citations-a-verifier.ts` franchit désormais `executerTravail`, fait subir
au résultat l'aller-retour JSON de l'hôte, et cherche avec `chercher` — la fonction même de l'écran.

Par ce chemin, avec une manière de lire qui ne déclare rien : **66 feuilles, 130 passages** — la
coupe a lieu, parce que le document a été consulté. Et les trois citations sont **identiques**,
phrase pour phrase :

| | La recherche dit | Phrase |
|---|---|---|
| 1 | page 34, folio 33, feuille 17, moitié droite | « appellation sont interchangeables). C'est l'impli- cation » |
| 2 | page 67, folio 66, feuille 34, moitié gauche | « permettrait de poursuivre le trajet, de » |
| 3 | page 99, folio 98, feuille 50, moitié gauche | « présent \| Acceptation \| Défusion _ » |

La vérification à l'œil de Christophe porte donc maintenant sur ce que l'application produit
réellement, et non plus sur ce qu'un banc produisait.

### Le garde-fou structurel : une épreuve par la porte, ou rien

Trois fois en deux jours, un mécanisme juste s'est révélé inatteignable depuis `executerTravail` :
le dépôt des passages, le texte des documents sans image, la détection de la double page. **Le point
commun : des épreuves vertes au-dessus du défaut, et rien qui passe par là où l'application passe.**

Règle, dans `packages/banc` : **toute option que `lot.ts` transmet à `lireLeTexte` doit être nommée
dans au moins une épreuve qui appelle `executerTravail`** — et dans un fichier qui n'appelle **pas**
`lireLeTexte` lui-même.

Cette seconde condition a été ajoutée après coup, et elle est le cœur du garde-fou. Sans elle, il
passait au vert : `aucune-page-lue.test.ts` nomme `doublePage` et franchit la porte **ailleurs dans
le même fichier**. Un garde-fou satisfait par un voisinage ne garde rien — vérifié par mutation, il
échoue maintenant quand on retire le réglage de l'épreuve qui le couvre.

Ce n'est pas une preuve de justesse : une épreuve peut nommer un réglage sans rien en dire de
sérieux. C'est une preuve de **passage**. Les trois défauts de ces deux jours seraient tous tombés
dessus.

### Ce qui reste, et qui n'est pas fait

- **Aucun écran ne propose la double page.** Le brouillon la tait, et c'est voulu tant que l'éditeur
  ne la montre pas ; le jour où il la montrera, il faudra trois états et non deux — déclarée vraie,
  déclarée fausse, non déclarée.
- **Le garde-fou ne couvre que la lecture du texte.** Le chemin des images a ses propres réglages,
  et rien n'exige encore qu'ils passent par la porte.


## 21 octobre 2026 — les deux conditions réglées avant l'essai de la file

### 1. L'EPUB mal rangé se lit

La reconnaissance par signature lit les premiers octets, et la convention veut qu'un EPUB y range
`mimetype` **en premier**, non compressé. Un livre du corpus le range **en dix-huitième position** :
l'en-tête ne montrait qu'une archive ZIP, et la chaîne refusait — correctement, d'après ce qu'elle
voyait.

`estUnEpub` consulte désormais la **table centrale**, qui dit toujours ce qu'une archive contient,
où que ses entrées soient rangées. Deux signes, et l'un suffit : la **déclaration** `mimetype` quand
elle est là, le **conteneur** `META-INF/container.xml` sinon. Aucun des deux n'appartient à un autre
format de la famille — un document bureautique déclare son propre type et range son inventaire
ailleurs. Elle répond, elle ne lève pas : appelée sur ce qui n'est pas une archive, elle dit non.

Vérifié sur le corpus entier : **18 EPUB sur 18 lus, 18 citations sur 18 vérifiées** contre les
chapitres relus depuis l'archive. Le dix-huitième rend 122 feuillets, tous porteurs de leur chapitre.

### 2. Le document que le détecteur coupait à tort

*Sexualité positive.pdf* — forme **1,76**, soit un seize neuvièmes, une mise en page de diaporama —
était dit double par ses folios. Vérifié par la porte : **75 passages pour 38 feuilles**, la coupe a
bien lieu, et le passage qui porte la citation est rangé **au rang 38 alors que le texte est sur la
feuille 19**.

Ce qui emporte la décision n'est pas la forme seule, mais un désaccord interne : les passages
déposés **ne portent aucun numéro imprimé**. Les deux nombres consécutifs que le détecteur a vus
dans les marges n'ont donc pas survécu au vote de folio à l'échelle du document. Il a coupé sur des
nombres que la chaîne elle-même refuse de tenir pour des folios.

**La déclaration à appliquer**, le jour où la bibliothèque du réimport sera créée — rien ne peut
être installé avant, puisqu'il n'y a pas encore de bibliothèque :

| | |
|---|---|
| empreinte | `4045b033dbb3257d75cf9993060a3eb7a82a2ba435b23300e3bf47b3d0f8fad1` |
| `base/manieres.json` | `{ "4045b033…fad1": "sans-double-page" }` |
| `base/recettes/sans-double-page.json` | la manière de lire de la bibliothèque, avec `"double_page": false` dans sa `preparation` |

Un `false` déclaré fait autorité contre le détecteur : c'est exactement ce que l'option A du matin
rend possible.

**Une piste générale, relevée et non suivie :** un verdict « double page » tiré de nombres en marge
que le vote de folio rejette ensuite est un verdict douteux. Croiser les deux rendrait l'exception
inutile. Ce n'est pas fait, et cela demanderait de voir le résultat du vote avant de décider de la
coupe — soit l'inverse de l'ordre actuel.


## 21 octobre 2026 — l'essai de la file : elle tient, et elle fait gagner du temps

Dix documents, les **mêmes** que la mesure de coût, par le **vrai `Roulement`** — son fil, ses
baux, ses reprises — avec le moteur rassemblé comme le paquet le rassemble.

### Ce que la file a fait

| Arrivée | État | Document |
|---:|---|---|
| 8,0 s | terminé | DSM-5 |
| 296,7 s | terminé | Biologie du couple |
| 296,7 s | terminé | L'Intelligence du cœur (EPUB) |
| 298,7 s | terminé | Je jouis comme je suis (EPUB) |
| 298,7 s | terminé | L'hypnose en situation d'urgence (EPUB) |
| 300,7 s | terminé | Schémas 2021 — Introduction |
| 451,1 s | terminé | La thérapie d'acceptation et d'engagement |
| 633,6 s | terminé | Théorie ACT Que sais-je |
| 1811,5 s | terminé | Thérapeutique manuelle |
| — | **en_echec_definitif** | Protocole tabac, « aucune des 6 pages n'a pu être lue » |

**Neuf terminés, un échec définitif attendu, aucun blocage, une seule tentative chacun.** L'échec
porte sa cause dans le travail, comme JOB-05 l'exige.

Les heures sont des **arrivées**, pas des durées : deux travaux lourds tournent de front
(`travauxLourdsSimultanes = 2`), et *Biologie du couple* — sept dixièmes de seconde de lecture —
affiche 296,7 s parce qu'elle a attendu son tour.

### Le facteur : un gain, pas un surcoût

| | |
|---|---:|
| La chaîne seule, en série | 2 172,3 s |
| La file, du premier travail au dernier | **1 811,5 s** |
| Rapport | **0,83 — un gain de 20 %** |

La file ne coûte donc rien : les processus lancés, les instantanés écrits et les pointeurs posés
sont payés, et au-delà, par le fait que deux travaux avancent ensemble.

**Ce que ce chiffre ne dit pas.** Le gain est ici **borné par le plus long travail** : 1 811 s,
c'est *Thérapeutique manuelle* toute seule, et la seconde place a traité tout le reste en 325 s
avant d'attendre. Sur deux cent cinquante documents, les deux places auront de quoi travailler en
permanence et le gain devrait être plus franc — mais la reconnaissance est liée au processeur, et
deux lectures de front se disputent les mêmes cœurs. **Je ne sais pas extrapoler ce facteur**, et
je ne le ferai pas : ce que l'essai prouve est que la file ne perd rien, pas qu'elle divise par deux.

### Le défaut était dans l'épreuve, pas dans la file

L'essai a tourné une demi-heure de plus que nécessaire en croyant attendre un travail que la file
avait conclu en une seconde : il cherchait un état nommé « echoue », qui n'existe pas. `appliquer`
écrit `en_echec_definitif` et `en_echec_recuperable`. J'avais **deviné** le nom d'un état au lieu de
le lire chez celui qui l'écrit — le même geste qui a produit trois défauts cette semaine, à l'envers.

Corrigé, et l'essai garde désormais son bac quand quelque chose a cloché : un essai qui efface ses
preuves fait payer trente minutes deux fois.

### Le moteur empaqueté lit comme la chaîne, vérifié sur les deux chemins

Le journal de la file portait un avertissement qui n'apparaît jamais depuis les sources :

    Cannot load "@napi-rs/canvas" package
    Cannot polyfill `ImageData`, rendering may be broken.

`mesures/moteur-empaquete.ts` fait parler le vrai `moteur.js` comme l'hôte lui parle — une demande
par l'entrée standard, les messages par la sortie standard — et compare **passage par passage**,
texte, page et numéro imprimé compris.

| Document | Chemin éprouvé | Résultat |
|---|---|---|
| *Biologie du couple* | couche texte, 173 passages | identique |
| *Théorie ACT Que sais-je* | reconnaissance, double page, 130 passages | identique |

**Décision : ne rien embarquer, et le documenter.** La chaîne ne rastérise jamais avec pdf.js — elle
extrait les images que le PDF porte déjà. `ImageData` et `Path2D` servent à dessiner une page, ce que
personne ne lui demande. Embarquer `@napi-rs/canvas` ajouterait un module natif par architecture
pour faire taire une phrase **exacte** : le rendu *serait* cassé si on le demandait. On préfère un
avertissement vrai à un paquet plus lourd, et la mesure ci-dessus dit pourquoi il est sans
conséquence.


## 21 octobre 2026 — BAS-02 : le réimport des 250 a eu lieu

Accord de Christophe, lancé à 13 h 58, terminé à 19 h 19. Bibliothèque d'essai sur volume externe —
le disque interne n'avait que 13 Gio libres pour 12 à 15 attendus.

| | |
|---|---:|
| Documents en file | **249** (292 fichiers lisibles, 43 doublons confondus par leur empreinte) |
| Réussis | **243** |
| Échecs | **6** |
| Temps réel | **18 907 s — 5 h 15** |
| Estimation en série | 10,04 h |
| Passages déposés | **32 052** |
| …avec un numéro imprimé | 17 071, soit 53,3 % |
| …avec un chapitre (EPUB) | 4 697 |
| Versions sans aucun texte | **0** |
| Poids de la bibliothèque | 9,3 Go — 7,7 de sources, 1,4 de dérivés |

**La file a tenu cinq heures sans surveillance.** Le facteur mesuré sur dix documents — un gain de
20 % — valait pour un échantillon où un seul travail dominait ; sur 249, les deux places n'ont pas
désempli et le gain est de **1,9**, c'est-à-dire la parallélisation complète.

### La bibliothèque répond

Vingt documents tirés au long de la table des actives, lus **par où l'écran les lit** — la table,
l'instantané, puis `chercher` : **19 répondent, 19 citent juste**. Le vingtième n'a pas assez de
mots pour qu'on lui pose une question, ce qui n'est pas un échec de la recherche.

### Les six échecs, en deux familles

**Trois refus francs**, déjà connus et consignés comme dette : *Protocole tabac*, *auto-hypnose
tabac*, *Mémo 4*. Leurs pages ne portent qu'un raster `FlateDecode` à 8 bits et aucune police. La
cause est écrite dans le travail, en toutes lettres.

**Trois échecs qui ne disent rien** : *Manuel Clinique des Psychothérapies de Couple*, *Mémo 3*,
*SAGA.pdf*. Leur cause enregistrée est `[object Object]`.

La ligne du journal qui précède le premier dit ce que la cause aurait dû porter :
`Unsupported color conversion request` — le décodeur JPEG refuse un espace de couleur, très
probablement du CMJN. Il lève **un objet qui n'est pas une `Error`**, et `executant.ts` en fait
`String(cause)` : tout le message se perd. **C'est une erreur avalée, ce que JOB-05 interdit.**
Correction à écrire : inspecter ce qui n'est pas une `Error` au lieu de le convertir en chaîne.

### Le défaut que seul un vrai corpus pouvait montrer

**Quatre documents traités avec succès sont invisibles dans la bibliothèque.**

243 versions écrites, **239 pointeurs d'activation**. Les quatre manquants — *Gérer nos propres
Schémas et Stratégies*, *Practicum — protocoles des voix critiques*, *Reparentage*, *memo 2 V2* —
ont un travail `termine`, un instantané complet sur le disque, et aucune entrée dans
`base/actives.json`. Rien ne les désigne, donc aucun écran ne les montrera jamais.

**La cause est une course à l'écriture.** `Depot::activer` lit la table entière, y insère son
pointeur, puis la réécrit :

    let mut table = self.actives()?;
    table.insert(empreinte, Pointeur { … });
    self.ecrire_actives(&table)

L'écriture est atomique — `ecrire_atomique` s'en assure, et le commentaire du dépôt le dit — mais
**la lecture-modification-écriture ne l'est pas**, et deux travaux lourds tournent de front. Deux
qui finissent ensemble lisent la même table, chacun y ajoute son pointeur, et le second efface
celui du premier. *Practicum* et *Reparentage* se sont conclus **dans la même seconde** du journal.

**Écriture atomique n'est pas mise à jour atomique.** C'est la distinction que le code a manquée, et
aucune épreuve ne pouvait la voir : il faut deux travaux qui finissent ensemble, donc un corpus.

Correction à écrire : un verrou autour d'`activer` — le `Roulement` est un seul processus, un
`Mutex` suffit —, et une épreuve qui lance deux activations concurrentes et vérifie que les deux
pointeurs survivent. Les quatre documents se rattrapent en relançant le réimport : il se reprend,
et une version déjà écrite se réactive sans rien retraiter.

### Ce que cette bibliothèque est, et n'est pas

Une **bibliothèque d'essai**, et Christophe la jettera si elle ne lui convient pas. Son classement
est un leurre — un axe nommé « Un axe », une valeur nommée « Une valeur » — parce que le classement
vient de l'administrateur et que personne ne l'a encore posé. Sa manière de lire n'a été regardée
sur aucune page.

**L'écran de dépôt n'a toujours pas été franchi sur une création complète.** C'est la dernière
porte, et c'est celle que Christophe poussera lui-même.


## 21 octobre 2026 — les deux défauts du réimport, corrigés

### La course à l'activation, et une seconde course dessous

`VERROU_ACTIVES`, un verrou de processus, rend **indivisible la mise à jour** de la table des
actives et non plus seulement son écriture. `activer` et `migrer_les_actives` le prennent.

L'épreuve qui le garde lance **vingt activations de front** et vérifie que les vingt pointeurs
survivent. Elle échouait avant le verrou — mais pas comme attendu : elle tombait sur un
`No such file or directory`, et c'est **une seconde course, plus grave**, qu'elle a mise au jour.

`ecrire_atomique` nommait son fichier temporaire d'après sa cible : `actives.json` → `actives.tmp`,
**le même nom pour tout le monde**. Deux fils qui écrivent le même fichier écrivaient dans le même
temporaire ; le second `rename` ne trouvait plus rien — ou pire, renommait un fichier écrit à
moitié par l'un et à moitié par l'autre. Or une table d'actives abîmée **se lit comme une table
vide**, par un choix assumé ailleurs dans ce fichier : toute la bibliothèque aurait disparu d'un
coup, sans un mot. Le temporaire porte maintenant le numéro du processus et un compteur.

Le réimport n'a perdu que des pointeurs, jamais la table entière. C'est une chance, pas une
garantie.

**Ce que le verrou ne couvre pas, et qui est dit :** deux *processus* qui activeraient dans la même
bibliothèque se marcheraient encore dessus. Cela ne se produit pas aujourd'hui ; le jour où cela se
produirait, il faudrait un verrou sur le disque.

### La cause qui ne disait rien

`causeLisible` rend quelque chose d'utile de tout ce qu'un `throw` peut porter : le message d'une
`Error`, celui d'un objet qui en porte un, le contenu d'un objet qui n'en porte pas, et un mot sur
ce qui ne porte rien. Elle ne lève jamais — une fonction qui sert à dire une panne et qui tombe
dedans emporte la seule trace qui restait — et elle borne ce qu'elle rend : une cause traverse un
tuyau entre deux processus et finit écrite dans un travail.

Employée là où une cause atteint quelqu'un : les deux sorties d'`executerTravail`, et `publier`.

**Ce qu'elle a révélé.** Les trois échecs qui disaient `[object Object]` disent maintenant
**« Program terminated with exit(1) »**. C'est le message d'arrêt d'Emscripten : le décodeur JPEG
en WebAssembly ne lève pas une erreur, **il arrête le processus**. L'objet levé était son
`ExitStatus`, dont le message existait et se perdait au premier `String`.

La cause est donc désormais reconnaissable, sans être encore la bonne : la vraie raison —
« Unsupported color conversion request » — ne part que sur la sortie d'erreur du moteur. La
rattacher au travail demanderait que l'hôte garde les dernières lignes du journal d'un moteur qui
meurt, et c'est un autre chantier.

### La réparation, et ce qu'elle a appris

L'outil de réimport répare au démarrage — `migrer_les_actives` relit les travaux terminés et
inscrit les pointeurs manquants, sans rien retraiter — et reprend les échecs définitifs sur demande
(`--reprendre`), **en remettant leur compteur de tentatives à un**. Sans cela, un travail qui les a
toutes consommées revient en file et n'en sort jamais : la file le juge hors d'atteinte et l'ignore,
silencieusement. Deux des six échecs étaient dans ce cas.

Au passage, une leçon de méthode : la première reprise n'a rien changé parce que **le moteur
empaqueté n'avait pas été reconstruit**. Corriger le TypeScript ne corrige pas ce que la file
lance ; il faut rejouer `preparer-moteur-node.py`. La chaîne et le paquet sont deux objets.

### L'état de la bibliothèque d'essai

| | |
|---|---:|
| Versions écrites | 243 |
| Pointeurs actifs | **243** |
| Versions sans pointeur | **0** |
| Échecs | 6, tous avec une cause lisible |
| Trente documents tirés au long de la table | **29 répondent, 29 citent juste** |

Les quatre documents invisibles sont revenus. Le trentième n'a pas assez de mots pour qu'on lui
pose une question, ce qui n'est pas un échec de la recherche.


## 21 octobre 2026 — dette : la vraie cause d'un moteur qui meurt

Décision de Christophe : **dette séparée, pas urgente.** Notée pour ne pas l'oublier, pas traitée.

### Ce qu'on sait

Trois documents du corpus arrêtent le moteur net : *Manuel Clinique des Psychothérapies de Couple*,
*Mémo 3*, *SAGA.pdf*. Depuis `causeLisible`, leur travail porte **« Program terminated with
exit(1) »** — le message d'arrêt d'Emscripten. Le décodeur JPEG en WebAssembly ne lève pas une
erreur : il **arrête le processus**. Ce qu'il lève est un `ExitStatus`, et son message dit la
manière de mourir, pas la raison.

La raison, elle, part sur la **sortie d'erreur** du moteur, une ligne plus tôt :

    Unsupported color conversion request

Un espace de couleur que le décodeur refuse, très probablement du CMJN — courant dans les scans
d'imprimerie.

### Ce qu'il faudrait pour aller plus loin

Deux choses, et elles ne sont pas du même ordre.

**Rattacher les dernières lignes du journal au travail qui meurt.** L'hôte laisse la sortie
d'erreur du moteur filer vers la sienne ; quand un moteur s'arrête sans rendre de résultat, la
cause enregistrée ne peut pas dire ce que ces lignes disaient. Garder un petit tampon des dernières
lignes et le joindre à l'échec vaudrait pour **toutes** les morts de moteur, pas seulement
celle-ci. C'est le geste utile.

**Décoder l'espace de couleur en cause.** C'est une affaire de codec, bien plus lourde, et elle ne
concerne que trois documents sur deux cent quarante-neuf.

### Pourquoi cela attend

Trois documents, une cause reconnaissable, aucun silence : on sait les nommer et on sait qu'ils
échouent. Cette dette rejoint celle du raster `FlateDecode` — même famille, même urgence, c'est-à-
dire aucune.


## 21 octobre 2026 — une porte peinte sur le mur, et le traceur qui l'a montrée

### Le défaut

Le bouton **« Nouvelle bibliothèque »** de l'accueil n'avait **aucun gestionnaire de clic**.
L'écran n'acceptait même pas de prop pour cela. Il s'affichait, il se cliquait, et rien derrière.

**Il est invisible tant qu'on n'a pas de bibliothèque.** Sans bibliothèque, l'application montre
le premier lancement, dont le bouton est câblé — et c'est cet écran-là que toutes les épreuves
regardaient, et celui que j'atteignais dans un navigateur en répétant « chez moi cela
fonctionne ». Il a fallu une vraie bibliothèque, sur une vraie machine, pour tomber dessus.

Huitième défaut de la même famille en deux jours, et le plus simple de tous : non pas un mécanisme
juste derrière une porte que personne n'a franchie, mais **une porte peinte sur le mur**.

### Ce qui l'a trouvé, après une heure perdue

J'ai cherché dans le mauvais écran. L'application affichait « 1 bibliothèque » — c'était écrit sur
la première capture — et j'ai quand même supposé l'écran de premier lancement, puis mis en cause
tour à tour la politique de sécurité du paquet, le moteur de rendu, la construction de production.
Trois hypothèses, trois mesures, trois réfutations, et le défaut était ailleurs.

Ce qui a tranché en une minute : **un traceur dans la page**, qui porte au journal de l'hôte chaque
clic — en phase de capture, donc avant que quoi que ce soit puisse l'arrêter —, chaque changement
d'adresse et chaque erreur. Le journal a montré douze `clic sur button « Nouvelle bibliothèque »`
sans un seul changement d'adresse derrière. Il n'y avait plus rien à supposer.

**Un paquet n'a pas de console.** Ce qu'on ne peut pas observer, on le suppose — et supposer coûte
plus cher que tracer. Le traceur reste : `apps/app/src/traceur.ts`, silencieux hors du bureau, et
muet dans un paquet livré (`journal_page` n'écrit que sous `debug_assertions`).

### Ce qui reste en place, et pourquoi

| | |
|---|---|
| `traceur.ts` | clics, adresses, erreurs, promesses rompues — la seule fenêtre sur un paquet qui n'en a pas |
| `journal_page` | la commande d'hôte qui l'écrit, silencieuse en production |
| `?bureau` en développement | fait prendre aux écrans la branche de l'hôte **sans hôte derrière**, pour atteindre dans un navigateur un chemin que le navigateur ne prend jamais |

Un essai d'inspecteur ouvert au démarrage a été retiré : il ne montrait rien, et du code qui ne
fait pas ce qu'il annonce vaut moins que pas de code du tout.

### Ce que le garde-fou de ce matin ne voit pas

Il exige qu'une option transmise à la lecture soit éprouvée par la porte. **Il ne regarde pas si un
bouton mène quelque part.** Les deux seules sorties de l'accueil — le bouton et la carte d'une
bibliothèque — n'étaient éprouvées ni l'une ni l'autre ; elles le sont maintenant, mais rien
n'empêche le prochain bouton muet. C'est un garde-fou à écrire.

---

## 22 octobre 2026 — la version en ligne : trois décisions, et un ordre

Demande : employer Cloudflare — Stream pour les vidéos, D1, R2 et du RAG — sur le modèle de
`tools/Projet therapeutes/bibliotheque-admin.html` et du Worker `clone-proxy`, pour des
bibliothèques consultables en ligne et non plus seulement sur l'ordinateur.

**Relevé préalable.** Le Worker `lienotheque-api` répond déjà : `/sante` rend 200, la façade
(`/search-library`, `/rag-search`, `/library-facets`) rend 401 — elle existe et elle est gardée —
et `/entree/defi` rend 200. D1 `lienotheque-registre`, D1 `lienotheque-essai` (place `BIB_1`) et
R2 `lienotheque-medias` existent, en WEUR. Le schéma d'une bibliothèque publiée porte déjà
`passage`, `passage_texte` en FTS5, et `journal_indexation` (JOB-07). L'adresse « ne donne rien »
parce que rien n'y a été publié et qu'aucune clé n'est enrôlée, non parce que rien n'est déployé.

### 1. La vidéo passe par R2, pas par Stream

Stream n'est **pas** compris dans l'abonnement Workers Paid : abonnement à part, 5 $ par
1 000 minutes stockées et 1 $ par 1 000 minutes livrées, **aucun palier gratuit**, arrondi au
millier supérieur, et une vidéo chargée sans être regardée est facturée en livraison.

R2 a l'**égress gratuit**, et les laissez-passer signés (`/laissez`, `/fichier/:laissez`) servent
déjà ses objets : une vidéo n'y ajoute aucune plomberie. Ce que Stream achète — transcodage en
plusieurs débits, lecture adaptative, lecteur, vignettes, sous-titres — compte pour des vidéos
longues sur une connexion médiocre, pas pour une bibliothèque où la vidéo est occasionnelle.

`Segment` est en secondes et ne sait pas qui sert les octets : basculer plus tard est une colonne
de plus, pas une reprise.

### 2. Le RAG tient dans les passages, pas dans AutoRAG

AutoRAG découpe lui-même les fichiers de R2 et rend des morceaux opaques. Or les 32 052 passages
portent déjà leur document, leur version, leur ancre, leur rang et leur page imprimée : c'est
précisément ce que le réimport a coûté 5 h 15 à produire, et ce que la promesse « toujours sur la
vraie page » exige. **Les passages sont les morceaux.** On les plonge (`@cf/baai/bge-m3`), on
range les vecteurs dans Vectorize sous l'identifiant du passage, et `/rag-search` fusionne le FTS5
déjà bâti avec le vectoriel — le schéma hybride du fichier d'inspiration. `journal_indexation`
fait la réconciliation, et c'est ce pour quoi il a été écrit.

Coût mesuré sur le corpus réel : plongement initial ≈ 0,10 $ une fois (8 M jetons à 0,012 $/M),
stockage Vectorize ≈ 0,01 $/mois (32,8 M dimensions, 10 M incluses), requêtes incluses
(50 M dimensions ≈ 48 000 recherches/mois), D1 dans les paliers inclus, R2 ≈ 0,15 $/mois pour
10 Go. **Le tout tient dans les 5 $.**

### 3. L'ordre : le bureau d'abord

« Une fois Liénothèque fonctionnelle, je mets ma première bibliothèque sur mon Mac ; si ça
fonctionne, je la migre sur R2. » Le lot en ligne est donc **en réserve, prêt**, et la séquence de
mise en marche (`lot-e5-etape4-plan.md` §13) n'est pas engagée. Rien n'est déployé, aucun réglage
ni secret n'est posé.

### Ce qui reste ouvert

**L'accès.** « Ouvert à tous en lecture » a été retenu. Deux lectures en découlent, et elles ne
donnent pas le même travail : *lire sans avoir à entrer depuis n'importe quel appareil* (routes
publiques en lecture, mise en cache, limitation de débit) ou *diffuser publiquement*. La seconde
porte sur des ouvrages sous droits et n'est pas la même décision que la première. À trancher avant
d'écrire la première route publique — pas avant, puisque le lot attend.

---

## 22 octobre 2026 — « sans avoir à entrer » : ce que le plan disait déjà, et les deux manques

Précision apportée : « sans avoir à entrer, depuis n'importe quel appareil ; Liénothèque sera
utilisée par des applications ou systèmes type Studio Clinique ou prof de basse, et d'autres à
venir — coaching de remise en forme, autre. » Et, aussitôt après : **c'est sa fonction première,
déjà discutée.**

C'est exact, et `lot-e-proposition.md` §3 à §5 le porte. Cette entrée ne redécouvre donc rien :
elle ferme une question d'accès laissée ouverte le même jour, en se rangeant au plan, et nomme
**deux manques** que le plan ne couvre pas.

### La question d'accès est tranchée par le plan, pas par une nouveauté

J'avais proposé la veille une **lecture publique** de la façade. Elle est retirée : le plan a une
réponse meilleure, et c'est elle qui vaut.

§3 : la façade accepte **deux portes** — le témoin de session pour les écrans de Liénothèque, et
un **jeton limité à une bibliothèque et à des actions** pour une application (INT-01, SEC-03),
envoyé sous le même nom d'en-tête `X-API-Key` pour que le code de l'application n'ait pas à
changer. Ce jeton n'est pas la clé maîtresse : il est borné, révocable seul, et sa révocation
n'atteint aucun autre accès.

**Et cela suffit à « sans avoir à entrer ».** Celui qui n'entre pas, c'est la personne : elle
utilise Studio Clinique, pas Liénothèque. L'application porte le jeton, sur n'importe quel
appareil. Ouvrir la lecture à tous n'ajouterait rien à cette promesse et retirerait la
révocation.

Que le jeton soit lisible dans une page statique n'y change rien — c'est précisément pourquoi il
est **borné et révocable** plutôt que maître. Studio Clinique a payé trois correctifs successifs
pour l'apprendre, sa clé ayant dû être tenue pour compromise ; le lot E est, dans les mots du
plan, « le moment où ce risque se solde ».

La lecture ouverte n'est donc pas retenue, et `lecture: "publique"` n'a pas lieu d'être.

### Manque 1 — CORS n'est écrit nulle part, et la bascule bute dessus au premier appel

Le plan dit que la bascule est **une seule valeur** : `WORKER_URL` pointe sur l'ancien Worker ou
sur le nouveau. C'est vrai du code de l'application, et faux du navigateur.

Le Worker de Liénothèque n'envoie **aucun en-tête CORS**, délibérément : il sert sa propre page,
le témoin de session est `SameSite=Lax`, une seule origine — c'est écrit dans son `wrangler.toml`.
Or une application consommatrice est servie depuis une autre origine. `clone-proxy` le règle avec
un `ADOC_ALLOWED_ORIGIN` unique ; ici il en faut une **liste, déclarée par client**, puisqu'il y
en aura plusieurs.

Sans cela, le jour de la bascule, le navigateur refuse l'appel avant que la porte n'ait rien à
dire. Le mot « CORS » n'apparaît dans aucun document de plan.

### Manque 2 — la façade est clouée à une bibliothèque par un secret de déploiement

`BIBLIOTHEQUE_FACADE` est un secret : une bibliothèque, fixée au déploiement. Trois applications
en veulent trois, servies par le même Worker.

Le plan donne la sortie sans la nommer : le jeton est « limité **à une bibliothèque** et à des
actions ». La bibliothèque doit donc venir **du jeton**, pas du secret. Le secret disparaît, le
plafond avec lui, et l'isolation reste structurelle — chaque jeton ne désigne qu'une place de la
réserve.

### Ce qui ne bouge pas

Les fichiers ne sortent que par un **laissez-passer signé et périssable**, jamais par une route
ouverte. L'écriture — publier, classer, retirer — reste au jeton et aux droits du registre.
L'administration reste à la cérémonie WebAuthn : une personne, jamais une machine.

Et la réserve de liaisons reste le modèle retenu, avec son prix assumé : publier une bibliothèque
de plus est un déploiement. Cloudflare admet environ 5 000 liaisons D1 par script — le plafond
n'est pas le nombre, c'est la main humaine sur chaque création. Tenable tant que c'est vous qui
les ajoutez.

### Rien n'est engagé

L'ordre reste celui fixé le même jour : le bureau d'abord. Les deux manques sont nommés, non
écrits.

---

## 22 octobre 2026 — la trace s'écrit dans un fichier, et dans le paquet livré aussi

Le paquet signé n'a ni console, ni inspecteur, ni « Inspecter l'élément » au clic droit. Le
traceur du 21 octobre existait pour cette situation exactement, et il n'y parlait à personne.

### Deux raisons, et chacune suffisait

`journal_page` écrivait avec `eprintln!`, donc sur la **sortie d'erreur**, et seulement sous
`#[cfg(debug_assertions)]`.

| | conséquence |
|---|---|
| le paquet signé est une construction **livrée** | la ligne était jetée sans être écrite nulle part |
| une application lancée depuis le Finder n'a **pas de terminal** | même en mise au point, la sortie d'erreur n'allait à aucun endroit lisible |

Un traceur muet là où il est seul à pouvoir parler n'est pas un traceur.

### Ce qui a été fait

**`trace.rs`** : un fichier, ouvert au démarrage dans le dossier de journaux de l'application —
`~/Library/Logs/fr.c-concept.lienotheque.prototype/trace.log` sur macOS, donné par l'hôte et non
inventé par nous. Remis à zéro à chaque lancement, plafonné à deux mégaoctets, vidé à chaque
ligne pour qu'une application figée ne garde pas pour elle la ligne qui l'explique. Un échec
d'ouverture ne fait jamais tomber le démarrage : on ne trace plus, c'est tout.

**L'appel de l'hôte est tracé des deux côtés.** C'était la pièce qui manquait au traceur du
21 octobre : il voyait le clic, et plus rien ensuite. On ne pouvait donc pas distinguer « le
gestionnaire n'a jamais été appelé » de « il a été appelé et l'hôte a refusé » — deux causes, deux
remèdes opposés, et aucune ligne pour les séparer. Tout `invoke` passe maintenant par une
enveloppe qui écrit la demande puis ce qu'elle devient.

**Les arguments ne sont jamais écrits**, seulement leurs noms : ils portent des chemins de
l'ordinateur et le contenu des bibliothèques, et une trace qu'on envoie pour se faire aider ne
doit rien emporter de tout cela.

**Le sélecteur de dossier est tracé à part**, parce qu'il ne passe pas par une commande de l'hôte
mais par le greffon de dialogue, dont les droits se déclarent dans la configuration du paquet. Un
greffon sans droit échoue d'une manière qui, vue de l'écran, ressemble à un bouton qui ne fait
rien. Trois lignes séparent désormais les trois cas : jamais appelé, refusé, ou renoncé.

### Ce que la trace a servi à établir le jour même

Le paquet signé que Christophe essayait datait du **21 octobre à 20 h 58**. Le correctif qui
relie le bouton « Créer ma première bibliothèque » — commit `93aa40f5`, « Une porte peinte sur le
mur » — est de **22 h 23**, une heure et demie plus tard, suivi de trois autres jusqu'à 23 h 17.

**Le bouton était donc bel et bien mort dans ce paquet**, non par un défaut d'empaquetage mais
parce que la construction précédait sa correction. Rien n'était à chercher du côté de la
signature, du runtime renforcé ni des droits du greffon — trois pistes qu'on aurait suivies, et
qu'une date a écartées.

**La leçon n'est pas « il fallait reconstruire ».** Elle est qu'aucune des trois pistes ne pouvait
être écartée sans une trace, et qu'il a fallu une journée pour s'en apercevoir. Un paquet porte
désormais la sienne.

---

## 22 octobre 2026 — le paquet n'avait jamais exécuté la même chaîne que les bancs

Trouvé en faisant exactement ce que `LIV-07` demande : Christophe ouvre le paquet signé lui-même,
s'en sert, et rapporte ce qu'il voit. Message à l'écran : `spawnSync tesseract ENOENT`, sur
l'essai d'une manière de lire, dans l'application installée sous `/Applications`.

### Le fait

Tesseract **est** dans le paquet — `Contents/MacOS/tesseract`, 88 Ko, posé là par `externalBin`.
Mais la chaîne le lance **par son nom** (`execFileSync("tesseract", …)`, `outils/lecteur-texte/src/ocr.ts`)
et compte donc sur le `PATH`. Une application ouverte depuis le Finder hérite d'un `PATH`
minimal — `/usr/bin:/bin:/usr/sbin:/sbin` — qui ne contient pas le dossier de ses propres
binaires.

`TESSDATA_PREFIX` n'était pas transmis davantage. L'hôte Rust sait pourtant désigner les modèles
de langue : `ocr.rs` le pose pour **son** chemin OCR. Mais la chaîne tourne dans un Node séparé,
qui n'en savait rien. Même Tesseract trouvé, aucune langue n'aurait été reconnue.

### Ce que cela révèle, et qui dépasse Tesseract

**Toutes les mesures du projet ont été faites depuis un terminal**, où un Tesseract installé par
ailleurs est sur le `PATH` : le réimport des 249 ouvrages, les bancs, les épreuves de corpus. Tous
ont trouvé *un* Tesseract — jamais celui du paquet.

Le paquet n'avait donc **jamais exécuté la même chaîne que les bancs**, et rien ne pouvait le
dire : les deux trouvaient quelque chose. C'est la même famille que les neuf portes peintes du
21 octobre — un mécanisme juste qu'aucun chemin réel n'empruntait — mais d'un cran au-dessus : ce
n'était pas une porte de l'interface, c'était l'empaquetage lui-même.

**`LIV-07` a payé le jour de son écriture.** L'exigence dit qu'un geste fait par Claude Code dans
un banc ou une ligne de commande n'est pas une preuve. Ce défaut en est la démonstration : aucune
des 2 260 épreuves ne pouvait le voir, et il a suffi d'un double-clic.

### Le correctif

`moteur.rs` donne au moteur l'environnement dont il a besoin : le dossier de ses binaires **en
tête** du `PATH` — celui qu'on emporte a été éprouvé avec la chaîne, celui du système ne l'a pas
été — et `TESSDATA_PREFIX` lorsque le dossier des modèles existe réellement.

**L'environnement plutôt qu'un chemin passé de couche en couche.** La chaîne sait déjà résoudre un
outil par son nom et honorer `TESSDATA_PREFIX` : c'est la convention de Tesseract lui-même. Lui
donner son environnement la laisse fonctionner comme elle est écrite, et vaudra pour tout outil
annexe que le paquet emportera ensuite. Faire descendre un chemin absolu à travers quatre couches
demanderait quatre modifications pour dire la même chose, et une de plus au prochain outil.

Trois épreuves : le dossier des binaires est en tête du chemin, les modèles sont désignés, et **un
dossier de modèles absent ne se promet pas** — un réglage qui désigne un dossier vide vaut moins
que son absence, puisque Tesseract chercherait là sans qu'on sache pourquoi il ne trouve rien.

### Une réserve nommée, laissée ouverte

**Siegfried n'est pas dans le paquet du tout.** `externalBin` ne déclare que `tesseract` et
`node`. Or `parSiegfried` rend `undefined` sans erreur quand le binaire manque — « ce n'est pas
une erreur », dit son commentaire, et c'est vrai d'un poste ordinaire. Dans le paquet,
l'identification des formats retombe donc **silencieusement** sur la signature par contenu,
méthode plus faible que celle employée par toutes les mesures.

L'ajouter change le contenu du paquet et demande d'embarquer aussi son fichier de signatures
PRONOM. **Soumis le 22 octobre, laissé de côté sans être tranché**, à la demande de Christophe.
La réserve reste ouverte, et elle est de la même nature que celle qu'on vient de fermer : un
écart entre ce que mesurent les bancs et ce qu'exécute le paquet.

---

## 23 octobre 2026 — le nom du média voyage avec son empreinte, son adresse non

### Mesuré avant

Un média était bien copié sous `sources/<préfixe>/<empreinte>.mp3`, mais le dépôt ne gardait pas
son nom d'origine. La recette cherchait alors un numéro dans le nom du fichier rangé et lisait
les chiffres de l'empreinte. La version active ne portait par ailleurs aucune adresse que le
Lecteur puisse ouvrir : le guide disait exactement « Média non disponible ici ».

### Décision

Le dépôt porte désormais `base/medias.json` : une table portable `empreinte, nom, contenu,
extension`. Le moteur reçoit cet inventaire et interprète le **nom d'origine**. La version active
reste indépendante de la machine : aucune adresse ni aucun port n'y est écrit. À la lecture,
l'hôte résout les empreintes présentes dans la vue, ouvre un serveur sur la boucle locale avec
un jeton imprévisible, puis greffe des adresses éphémères aux seuls médias réellement présents.

### Mesuré après

Sur le document réel de référence F3 et ses 99 MP3 : **99 noms distincts et 99 empreintes
distinctes** ont été conservés ; le moteur a retrouvé les pistes 1 à 99, sans prendre un chiffre
dans un nom de stockage. Le serveur répond en plages, et le paquet construit depuis cette branche
a lu `Track 01.mp3` de **0:00 à 0:19** dans le vrai Lecteur. L'association page-piste de cette
mesure a été posée mécaniquement dans une bibliothèque temporaire, hors dépôt : elle prouve le
service du son, pas la qualité de l'association automatique.

---

## 23 octobre 2026 — une décision de vérification appartient à la bibliothèque

### Mesuré avant

`App.tsx` gardait les décisions dans un état React. Quitter le document ou l'application
réinitialisait ce tableau ; vingt décisions prises valaient donc zéro au lancement suivant.

### Décision

Les décisions sont écrites atomiquement dans `base/decisions.json`, par empreinte de document et
identifiant stable du cas. L'écran ne retire un cas qu'après confirmation de l'hôte. À la
réouverture, il relit la table et masque les cas déjà tranchés. « Annuler la dernière décision »
retire cette seule entrée du même fichier.

### Mesuré après

Une épreuve ferme puis rouvre réellement un dépôt : deux décisions y survivent, puis l'annulation
n'en retire qu'une. Dans le paquet construit depuis la branche, le cas réel « Pistes 1 à 99 » a
été marqué vu : l'écran est passé de 1 à 0, `base/decisions.json` a porté son identifiant et la
valeur `vu`, puis une fermeture et une relance ont laissé l'écran à 0. Ce parcours a révélé que
l'annulation disparaissait avec le dernier cas ; elle reste désormais accessible même quand la
file vient d'être vidée. Cette preuve technique ne remplace pas l'usage demandé à Christophe par
`LIV-07`.

---

## 23 octobre 2026 — le corpus démonté borne la correction du texte

Le volume qui porte les 243 documents et les 32 052 passages n'est pas monté. La population des
50 documents presque sans texte ne peut donc ni être relue ni être remesurée honnêtement.

Le document F3 disponible a tout de même traversé le moteur embarqué : 29 pages, 29 images,
**0 passage**, 0 page servie par la couche, 0 par reconnaissance, 29 sans texte. Ses pages sont
principalement graphiques ; Tesseract n'a rien rendu sur les pages sondées séparément. Cette
mesure ne remplace pas les 50 documents et ne justifie aucune correction générale.

L'audit visuel du même paquet confirme la structure du Lecteur et le son servi. Il révèle un
défaut distinct : la grande page est visible, mais les vignettes latérales montrent une image
cassée. Organisation et Dépôt ont été ouverts sur cette bibliothèque temporaire ; ils n'ont pas
été vérifiés sur le volume des 243 documents, puisqu'il reste absent.

---

## 26 octobre 2026 — dette prioritaire séparée : progression fausse pour les doubles pages

Le dépôt réel de Paul Westwood contient **143 feuilles**, que la recette découpe en **286 pages
logiques**. Le travail annonce pourtant un total de 143 puis atteint le point de reprise 286 :
l'interface affiche donc 100 % à mi-parcours. Cette dette concerne uniquement le décompte de
progression ; elle est distincte de C9.3 et ne doit pas être corrigée pendant la mesure de
l'association page-piste. Le défaut a été observé sur trois des cinq méthodes de cette campagne
(il ne s'est pas reproduit sur Bass Play-Along Vol. 5) : ce n'est plus une curiosité isolée. Sa
correction devient prioritaire après la décision sur C9.3, sans être mêlée aux règles
d'association page-piste.

**Jour 2 — correction éprouvée.** Le total venait directement du nombre de feuilles du PDF,
alors que le point de reprise avançait après chaque page logique produite par la recette. La
préparation convertit désormais ce total dans la même unité : une page par feuille pour une
recette ordinaire, deux pages par feuille pour une recette de doubles pages. Le test rouge sur
trois feuilles réelles de Paul Westwood observait `3` pour six pages produites ; il parcourt
maintenant `1/6` à `6/6`. Le document complet porte toujours 143 feuilles et sa recette déclare
la double page : le total annoncé est donc 286. Le garde-fou inverse sur F3 confirme que les
recettes à une page par feuille conservent leur total, et le critère F3 reste à 95/95.

## Dette — « Réglages → mes clés d'accès » (29 octobre 2026)

**Ce qui a été fait ce soir, et ce qui ne l'a pas été.** Les boutons d'enrôlement existaient,
étaient éprouvés, construits et déployés — et aucun écran ne les rendait jamais : `Entrer` ne les
propose que si on lui passe `identifie`, et `App.tsx` ne le passait à aucun de ses deux rendus.
Du code mort à l'écran, dans un paquet servi en production. Ce n'était pas une régression :
l'ancien bouton « Enrôler cet appareil » vivait sous la même condition depuis le début.

La correction posée est **minimale et assumée comme telle** : la route `#entrer` passe désormais
`identifie={recuEnLigne === "oui"}`, donc quelqu'un d'entré qui ouvre cette adresse voit les deux
boutons. Elle débloque l'enrôlement d'une seconde clé le soir même, ce qui était l'urgence — il
n'existait qu'un seul exemplaire de ce qui ouvre la porte, et l'amorçage est clos pour toujours.

**Ce qu'elle ne fait pas, et qui reste à faire.** Aucun menu ne conduit à `#entrer` : il faut
taper l'adresse, ce qui est une façon indigne d'atteindre une fonction de sécurité. La bonne
maison est l'écran Réglages, sous « mes clés d'accès », avec :

- la **liste** des clés enrôlées, leur appareil et leur date ;
- la **révocation** — `revoquerLaCle` et le droit `revoquer_cle` existent déjà côté service, et
  aucun écran ne les appelle ;
- les deux enrôlements, nommés pour ce qu'ils font : *remplacer la clé de cet appareil* n'ajoute
  rien (un authentificateur intégré ne garde qu'une clé par personne et par domaine), *enrôler
  une clé de sécurité* est le seul qui donne un second exemplaire.

Il y faudra aussi une route de lecture des clés, que le service n'expose pas encore.

**La leçon de méthode, qui dépasse ce cas.** `entrer.test.tsx` rendait `<Entrer identifie … />`
en posant la propriété à la main : elle prouvait que le composant sait afficher le bouton, et ne
pouvait rien dire de l'application qui ne le lui demandait jamais. **Une épreuve de composant ne
voit pas le chemin qui y mène.** L'épreuve ajoutée part donc de `<App />` avec un service qui
répond, et une seconde refuse les boutons à qui n'est pas entré — sans quoi poser `identifie` en
dur ferait passer la première. Les deux ont été vérifiées rouges avant d'être vertes.

## Dette — le job « Rendu » de l'intégration continue n'a jamais abouti (29 octobre 2026)

**Constat, mesuré et non supposé.** Le job « Rendu (Chromium, Firefox, WebKit) » de
`lienotheque-ci.yml` échoue à l'étape « Mesurer le rendu ». Quatre passages examinés — 26, 28 et
29 octobre — et **aucun n'a jamais abouti, pas une seule fois depuis la création du job**. Ce
n'est donc pas une régression à bissecter : il n'a jamais fonctionné.

**Ce que dit le journal.** L'étape `playwright install-deps chromium firefox webkit` s'exécute,
puis chaque lancement de navigateur rend :

    Error: browserType.launch: Target page, context or browser has been closed
    - [pid=NNNN] exception while trying to kill process: Error: kill ESRCH

Le navigateur n'est donc pas *absent* — un exécutable manquant dirait « Executable doesn't
exist ». Il démarre et meurt. Piste à éprouver le jour venu, et non à tenir pour acquise :
`install-deps` pose les bibliothèques du système mais **pas les navigateurs eux-mêmes**, qui
viennent de `playwright install` ; selon l'ordre des étapes et la façon dont le cache est
restauré, les deux peuvent se désaccorder. La mémoire de l'exécutant est l'autre suspect
ordinaire d'un navigateur qui meurt au lancement.

**Pourquoi ce n'est pas urgent.** Ce job ne garde rien qui soit éprouvé ailleurs : les trois
jobs « Vérification » couvrent le typage et les tests sur les trois systèmes. Tant que « Rendu »
est rouge, il ne masque donc aucune régression — il ne dit simplement rien.

**Pourquoi il faut quand même y revenir.** Un job rouge en permanence éteint la valeur du rouge :
le jour où « Vérification » tombera pour une vraie raison, personne ne le verra au milieu d'une
intégration continue déjà rouge. C'est le coût réel de cette dette, et il grandit.

**À ne pas confondre avec les deux autres échecs du même workflow**, tous deux élucidés le
29 octobre au soir :

- **CLA-01**, du 28 octobre 20:27 à aujourd'hui : le mot « exercice » dans un commentaire de
  `outils/recettes/src/interprete.ts`, introduit par `59968260`. Le garde-fou a raison — la règle
  interdit les mots de domaine jusque dans les commentaires. **Se résout tout seul** : le mot a
  déjà disparu du travail en cours sur ce fichier, CLA-01 repassera au vert à son commit.
- **Tesseract**, du 26 au 27 octobre : `test/aucune-page-lue.test.ts` rendait
  `spawnSync tesseract ENOENT` sur un exécutant qui n'a délibérément pas Tesseract. **Cause
  disparue** : zéro occurrence dans le passage du 29 octobre.

## 5 novembre 2026 — A1 : l'ampleur du compactage, révisée à la baisse

**Décision : le correctif reste prioritaire, mais sur un seul document visible.** Plan complet :
`docs/plan-a1-feuille.md`.

J'avais annoncé un décalage « jusqu'à 174 feuilles » dans Studio Clinique. Il est réel **dans la
donnée** et **ne touche aucun écran** de cette bibliothèque. La mesure qui tranche n'est pas le
décalage lui-même mais ce que la vue porte : un folio ou un élément. Mesure des deux
bibliothèques, documents actifs, lecture seule
(`outils/ingestion/mesures/sorties/a1-visible-5nov/`) :

| | musicale | Studio Clinique |
|---|---|---|
| documents actifs | 250 | 245 |
| `0 < resultat.pages < pages de la vue` | 10 | 10 |
| … dont la vue porte un folio ou un élément | **1** | **0** |

Les soixante-huit documents de Studio Clinique dont `resultat.pages` est plus court que la vue
sont pour l'essentiel des documents à `resultat.pages` **vide** : aucune manière de lire
appliquée, donc aucun compactage — seulement l'absence de repères. Le compter comme « touché »
était une erreur de critère de ma part.

**`f5bca72c` = « Les mots sont des fenêtres (ou bien des murs) », Rosenberg** : 218 feuilles,
14 dans `resultat.pages`, et une vue de **218 pages parfaitement alignées** sur ses images, sans
un seul folio ni élément. Rien à y voir.

**Le seul document dont un écran est faux : `ca36cf98`, Bass Aerobics** (bibliothèque musicale).
Sa feuille 2 ne porte aucune image ; ses **53 folios et 53 éléments sont tous posés une page trop
tôt**, de la page 2 à la page 109. Établi par le texte des passages, qui suit les feuilles : la
feuille 12 porte « Workout 3 », « TRACK 3 » et le folio imprimé **10**, et la vue les affiche
page 11, sur l'image de la feuille 11 — la fin du Workout 2.

**Niveau de preuve 1** (octets des JSON de la vraie bibliothèque, texte des passages, code). Le
Lecteur n'a pas été ouvert ; le niveau 2 appartient à Christophe, sur les pages 9, 11 et 13 de ce
document.

**L'image n'est jamais fausse** : la vue sert toujours l'image du rang qu'elle affiche. Ce qui est
faux est ce qu'on pose dessus.

### Deux tests rouges, et pourquoi ils ne sont pas commités

`outils/recettes/test/a1-feuille-contre-index.test.ts` éprouve deux extraits fabriqués par la
logique d'`extracteur-pages.html` (`outils/recettes/mesures/extraire-a1.ts`, hors ligne) :
décalage constant de 1 (Bass Aerobics 1-5) et décalages multiples 0, 2, 3 (Rosenberg 1 2 3 12 13
25). Les deux échouent aujourd'hui, le même correctif doit les faire passer. Les œuvres ne sont
pas versionnées : extraits sous `fixtures/fichiers/A1/` (ignoré), empreintes et vérités attendues
sous `fixtures/references/a1-feuille-contre-index.json`. Le test vérifie l'empreinte avant de
juger.

Ils restent **hors du dépôt** tant que le correctif n'est pas écrit : les commiter rendrait
`pnpm check` rouge, ce que la règle 4 du CLAUDE.md interdit avant commit. Ils entreront dans le
même commit que le correctif.

### Ce que le correctif changera aussi

`interprete.ts` déduit le folio depuis `pageLue - rang`. Aujourd'hui le rang est trop petit de 1
et le décalage trop grand de 1 : les deux erreurs s'annulent, la **valeur** du folio sort juste et
seule sa **place** est fausse. Sur un document à beaucoup de feuilles sautées, en revanche, les
rangs deviennent très espacés et la déduction ne rendra plus les mêmes nombres. **Les vingt
documents touchés se retraitent donc, ils ne se migrent pas** : un recalcul d'index figerait des
`pageImprimee` et des `absentes` déduits d'un rang faux.

F3 et F4 n'ont aucune feuille sans image : leurs critères ne peuvent pas bouger. Ils seront
rejoués avant tout retraitement (gardien de la tâche A4).

## 5 novembre 2026 — A1, le correctif : la feuille voyage avec la page

**Décision de Christophe, maintenue contre ma proposition de la reporter : le renommage
`index` → `feuille` fait partie du correctif.** J'avais proposé de le remettre à plus tard sans
signaler que le registre portait déjà la décision contraire — faute de méthode, signalée par
Christophe. **Règle ajoutée : toute divergence avec le registre se signale en tête du rapport.**

Et il avait raison sur le fond : c'est le renommage qui fait désigner chaque consommateur par le
compilateur, et c'est lui qui a corrigé ma propre liste dans les deux sens.

### Le correctif

`pagesEnGris` connaissait déjà la feuille — elle sert au rendu — et la perdait au `yield`. Elle
voyage maintenant avec l'image (`FeuilleEnGris`), et `preparerLot` ne compte plus : son rang vient
du document. Effet de bord gagné : `options.depuis` n'a plus à amorcer un compteur, donc la
lecture d'une tranche du milieu devient juste par construction et non par compensation.

Renommés, parce qu'ils désignent une feuille à partir de zéro, en suite possiblement trouée :
`PageReperee.feuille`, `PageLueBrute.feuille`, `PageLue.feuille`, `PageAlire.feuille`,
`PageAsonder.feuille`, `PageAmarges.feuille`.

**Non renommés, et documentés à la place** : `PageAffichee.index` et l'entrée d'`instantane.ts`
comptent le rang de la page **affichée**, à partir de un — la convention de la vue, celle qu'on
cite à une personne, convertie une seule fois par `PREMIER_RANG` dans `lot.ts`. Leur donner le nom
`feuille` créerait deux champs du même nom comptant depuis des origines différentes : un second
piège à la place du premier. Leur valeur devient juste par le correctif, `lot.ts` les construisant
désormais depuis `page.feuille`.

**Deux consommateurs que ma table du 5 novembre accusait à tort** : `executant.ts` lit la sortie
d'`exporterPages`, numérotée par feuille physique, jamais compactée. Le compilateur ne les a pas
désignés, et le code le confirme. L'erreur était dans ma table.

### La trappe du cache, trouvée en écrivant le plan de retraitement

`clefDeLecture` ne change pas avec le correctif, et les entrées de cache portent l'**ancien**
compte : une lecture gardée aurait ramené les rangs compactés, et **le correctif aurait été
inopérant sur tout document déjà lu**, Bass Aerobics compris. `VERSION_LECTURE` passe de 10 à 11 —
le mécanisme existait déjà pour exactement cela. Conséquence assumée : un retraitement relit le
document, il ne peut pas s'appuyer sur le cache.

### Les deux tests rouges sont passés au vert

```
✓ a1-decalage-constant.pdf   — la feuille 2 ne porte aucune image : décalage de 1
✓ a1-decalages-multiples.pdf — trois feuilles portent une image : décalages 0, 2 puis 3
```

Plus deux contrôles de contrat : une suite de feuilles trouée est une donnée valide, et un `index`
écrit avant le renommage se relit comme `feuille` — les deux noms ensemble sont refusés.

### Le registre n'a rien perdu

J'avais annoncé « 89 décisions » hier et compté 83 aujourd'hui. **Rien n'a disparu** : au commit
`6e5094af` le fichier portait 4 903 lignes et **82** titres de niveau deux ; il en porte 83 après
l'entrée du jour, et `git diff` montre **65 ajouts, 0 retrait**. Les 4 903 premières lignes sont
identiques octet pour octet à la version commitée. Le 89 d'hier était un mauvais comptage de ma
part, pas une perte.

## 5 novembre 2026 — A1 : la mise en page du document, confirmée par Christophe (niveau 3 sur le document)

**Christophe, 5 novembre 10:38.** Vérification dans un lecteur PDF qui compte les feuilles
(« 12 de 116 »), hors Liénothèque :

| Feuille du PDF | Ce qu'elle porte | Folio imprimé |
|---|---|---|
| **11** | fin du Workout 2, double barre de reprise | **9** |
| **12** | « Workout 3 · TRACK 3 » | 10 |

**La correspondance feuille ↔ folio et la lecture du contenu sont confirmées.** Le décalage est
bien d'exactement une feuille, et la vérification humaine le prouve deux fois :

- la vue affiche le folio **10** sur sa page 11, alors que la feuille 11 porte le folio **9** ;
- elle y propose Workout #3, alors que « Workout 3 · TRACK 3 » est sur la feuille **12**.

**Rectification des niveaux de preuve** (Christophe, 5 novembre) : j'avais écrit « les trois
niveaux sont réunis ». C'est faux, et la faute porte sur la définition même des niveaux.

- Comparer les passages à la vue est une comparaison de **données** : c'est du **niveau 1**, comme
  les octets et le code. Le niveau 2 est un **regard sur l'écran**, avec une capture citée.
- La vérification de Christophe est un **niveau 3 sur le document** — feuille 11 : folio 9, fin du
  Workout 2 ; feuille 12 : Workout 3 — et non sur l'affichage de la Liénothèque.

Formulation juste : **le défaut d'affichage est établi au niveau 1** ; **la mise en page du
document est confirmée au niveau 3** par Christophe ; **aucun niveau 2 ni 3 sur l'écran de la
Liénothèque à ce jour**. Le premier sera l'« après » R2.

Ce que la vérification de Christophe apporte malgré tout, et qui ne vient pas de nos données :
elle établit sur le document que la feuille 11 porte le folio **9**. La vue affiche **10** sur sa
page 11 — le folio d'une autre feuille. Le décalage est donc attesté par le numéro imprimé **et**
par le contenu, deux fois indépendamment.

**Ce que cela fixe comme critère de recette.** Après R2, dans la Liénothèque : **Workout 3 doit
être lié à la feuille 12**, et la page 12 cesser d'être muette. C'est la vérification humaine de
l'« après », et c'est Christophe qui la fait.

## 5 novembre 2026 — `pnpm check` est rouge, et il l'était déjà

**`pnpm check` sur l'arbre du correctif A1 : `CHECK=1`.** Code lu sur la commande, pas au bout
d'un tuyau. 16 paquets verts, 2 711 tests passés, **un** échec — et c'est le critère F3.

```
FAIL outils/ingestion test/criteres.test.ts
     critère F3 — méthode numérisée, 95 sur 95 (OUT-15, REC-06)
AssertionError: expected [] to deeply equal [ 93, 94, 95, 96, 97, 98 ]
```

**Vérifié, pas supposé.** Le même test lancé dans le worktree de bisect, à `6dae5612` — dont
`git diff 6dae5612 6e5094af` ne montre qu'un seul fichier, `docs/decisions.md`, donc **code
identique à HEAD** — rend la **même assertion, le même échec** :

```
F3_AVANT_MON_CHANGEMENT=1
× critère F3 … relie les 95 éléments à la bonne piste …
AssertionError: expected [] to deeply equal [ 93, 94, 95, 96, 97, 98 ]
```

C'est la régression bisectée le 4 novembre : `c2fb2c04` (29/10 23:37) rend `borne` non facultatif
dans `qualifierAssociation` et s'abstient **avant tout calcul** ; le critère F3 ne déclare aucune
provenance, donc abstention `vivier_non_borne` et `orphelins = []`. Personne ne réclame les pistes
93 à 98 : le calcul n'a pas lieu. Les 95 lignes et `pagesAbsentes = [30, 31]` restent justes. Le
correctif n'est pas « réparer l'associateur » mais **décider qui déclare la provenance d'un lot de
fixture** — une décision, pas un correctif, et elle n'est pas prise.

**Conséquence sur la règle 4 du CLAUDE.md** (« `pnpm check` doit passer avant tout commit ») :
elle n'est satisfiable par **aucun** commit tant que cette décision n'est pas prise. Ce n'est pas
une conséquence du correctif A1. Rien n'est commité sans le mot de Christophe.

**Un effet mesuré du correctif, à consigner** : le même test a pris **230 s** dans la passe
complète contre **29 s** dans le worktree de bisect. Ce n'est pas une régression de vitesse, c'est
`VERSION_LECTURE` 10 → 11 : la passe complète a relu les 29 feuilles de F3, le worktree de bisect
a lu son cache d'avant. Les deux jeux d'entrées coexistent sans se gêner, et la prochaine passe
retrouvera sa vitesse.

## 5 novembre 2026 — la règle des échecs épinglés

**Décision de Christophe.** Un contrôle rouge pour une cause connue, antérieure, et dont la levée
est une étape identifiée, s'**épingle** dans une liste versionnée :
`fixtures/references/echecs-connus.json`. Cette liste est une **donnée**, pas du code — comme
`fixtures/termes-de-domaine.json`.

**La règle : `pnpm check` passe HORS échecs épinglés ; tout autre rouge est une régression et
bloque le commit.**

Une épingle porte son assertion exacte, sa cause, la **preuve qu'elle est antérieure**, et
l'étape qui la lèvera. **Quand un épinglé passe, son épingle se retire** : une épingle qui survit
à sa cause éteint la valeur du rouge, exactement comme le job « Rendu » rouge en permanence
(entrée du 29 octobre).

Première et seule épingle à ce jour : `critere-f3-orphelins-93-98`, dont l'antériorité est prouvée
par rejeu sur `6dae5612`.

### Proposition pour la règle 4 du CLAUDE.md — **à valider par Christophe, non appliquée**

Texte actuel :

> 4. **Tests obligatoires.** Chaque exigence implémentée cite son identifiant CDC dans le nom du test.
>    `pnpm check` doit passer avant tout commit.

Texte proposé :

> 4. **Tests obligatoires.** Chaque exigence implémentée cite son identifiant CDC dans le nom du
>    test. `pnpm check` doit passer avant tout commit, **hors les échecs épinglés dans
>    `fixtures/references/echecs-connus.json`** — ceux dont la cause est connue, antérieure et
>    prouvée telle, et dont la levée est une étape identifiée. **Tout autre rouge est une
>    régression et bloque le commit.** Une épingle se retire dès que son contrôle passe : une
>    épingle qui survit à sa cause éteint la valeur du rouge.

Je ne touche pas au CLAUDE.md avant son accord.

## 5 novembre 2026 — règle 4 du CLAUDE.md : appliquée

**Décision de Christophe : la formulation proposée est acceptée.** Elle est inscrite au
CLAUDE.md, règle 4. La proposition consignée plus haut dans ce registre devient donc le texte en
vigueur, et non plus une proposition.

**Et l'épingle F3 a été corrigée le même jour** : elle annonçait « deux attentes — strict :
abstention ; estimation : 95 liens estimés », proposition du 4 novembre que le v24 a dépassée. La
levée, telle que le v24 et ce registre la portent : critère F3 réécrit sur la **voie oracle**
(décision du 29 octobre, l'oracle remplace les recettes) plus les confirmations ; **A4 dépend
d'A3** — confirmation lien par lien visant un lien précis, élément, feuille, média, et non un
`cas.id` — **et d'A1** pour les pages absentes, que l'oracle détecte ; **provenance déclarée par
média**, non par le lot, ce qui lève `vivier_non_borne` sans toucher à la garde. Le mode
estimation est l'étape **B**, distincte, dont le seuil d'erreur reste à fixer par Christophe.

L'épingle porte maintenant aussi un champ `ce_qui_ne_le_levera_pas` : une épingle doit fermer les
fausses sorties autant qu'ouvrir la bonne.

## 5 novembre 2026 — le job « Rendu » : la cause, en une ligne de journal

**Lecture seule. Aucun correctif appliqué.** L'hypothèse du 29 octobre était fausse sur les deux
suspects qu'elle nommait, et la vraie cause est dans le journal du dernier passage
(`gh run view --job 123696833388 --log`, exécution 40944685964 du 29 octobre 19:57) :

```
/home/runner/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser:
error while loading shared libraries: libicudata.so.74: cannot open shared object file
```

Et, dix lignes plus haut, dans la même exécution :

```
libicu78 is already the newest version (78.2-2ubuntu1).
```

**Ce n'est ni un navigateur manquant, ni la mémoire de l'exécutant.** Les trois moteurs sont là —
le cache a fait mouche, donc l'étape `playwright install` a été sautée et seul `install-deps` a
tourné. Le WebKit en cache (`webkit-2359`) a été construit contre **ICU 74** ; l'image
`ubuntu-latest` est passée à **ICU 78**. `install-deps` installe l'ICU du jour, pas la 74.

**Et seul WebKit tombe** : 195 tests, 2 exécutants, **59 contextes d'erreur, tous `-webkit`**.
Zéro pour Chromium, zéro pour Firefox. Le `kill ESRCH` et le « Target page, context or browser has
been closed » cités le 29 octobre sont les **conséquences** du moteur qui meurt au lancement, pas
la cause.

**La cause racine est la clef de cache** :

```yaml
key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
```

Elle ne porte pas la version de l'**image** de l'exécutant. Quand GitHub met l'image à jour, les
moteurs en cache restent ceux d'avant, le cache fait mouche, `playwright install` ne retourne
jamais chercher un WebKit construit pour la nouvelle image, et le job est rouge pour toujours.
C'est exactement ce qui s'est passé : rouge **sans interruption** depuis que l'image a bougé.

**Correctif proposé, non appliqué** : ajouter l'image à la clef, par exemple
`playwright-${{ runner.os }}-${{ env.ImageOS }}-${{ steps.playwright.outputs.version }}` (ou
`ImageVersion`, plus fin). Une mise à jour d'image invalide alors les moteurs, et
`playwright install` les reprend. Une ligne, et la dette tombe. À valider par Christophe.

**Autre constat du même relevé, à ne pas confondre** : la dernière exécution de
`lienotheque-ci.yml` date du **29 octobre**. Le workflow se déclenche sur `main` et sur les
demandes de fusion touchant `tools/lienotheque/**` ; nos commits vont sur
`wip/lienotheque-2026-10-29`, qui n'est ni l'un ni l'autre. **L'intégration continue n'a donc rien
vu du travail des 30 octobre au 5 novembre**, correctif A1 compris. Ce n'est pas une panne, c'est
le déclencheur — mais il faut le savoir avant de se croire couvert.

## 5 novembre 2026 — Bass Aerobics par la voie oracle : 48 liens, et pourquoi pas 52

**Mesure, aucune écriture.** Référence : `sorties/mesures-3nov/bass-apres.json` (même voie,
`voie-sans-maniere-de-lire` v3, 3 novembre). Nouveau :
`sorties/a1-r1-5nov/ca36cf98-oracle-avec-provenance.json`.

**48 liens de part et d'autre, 0 désaccord** — même piste, même folio, même feuille pour les 48.
Folio lu en marge, partiellement indépendant : **33 égaux, 0 différent, 15 muets**.

> **Correction du 6 novembre 2026.** Ce paragraphe disait : « `TRCK` de l'étiquette ID3, seul
> signal entièrement indépendant : 48 / 48 ». Deux choses y étaient fausses, et elles importent.
>
> **`TRCK` est une mesure extérieure.** Le produit ne lit **aucune** étiquette ID3 — preuve par
> le code au 6 novembre : d'un fichier audio, la chaîne ne lit que ses octets, et uniquement pour
> l'empreinte. Le 48/48 a été établi par un programme de contre-épreuve
> (`oracle-contre-reference.py`), hors de la chaîne. **La publication de Bass Aerobics repose sur
> le nom du fichier et sur la table du document, et sur rien d'autre.**
>
> **Et `TRCK` n'est pas un signal indépendant** : voir l'entrée du 6 novembre ci-dessous. Provenance déclarée : 44
`corroboration_table`, 4 `corroboration_recurrente`. Placement juste, **Workout 3 sur la
feuille 12**.

### Les quatre manquants : des lignes de sommaire abîmées par l'OCR

Les éléments **12, 17, 20 et 22** n'ont aucune ligne et sont les **mêmes quatre** que les quatre
orphelins — un seul fait, pas deux. La table de la feuille 5 porte **huit lignes abîmées**, et
ce sont exactement les quatre perdus plus les quatre rattrapés par la récurrence :

| Élément | Ligne lue par l'OCR | Issue |
|---|---|---|
| 1 | `Workout 1 4l 6` — piste « 4l » | rattrapé |
| 7 | `Workout 7 L 18` — piste « L » | rattrapé |
| 12 | `Workout 12. LL -` — piste **et** page illisibles | **perdu** |
| 17 | `Workout 17 16 38` — piste lue 16, déjà prise | **perdu** |
| 20 | `Workout 20 At` — piste illisible, page absente | **perdu** |
| 21 | `Workout 21 22 46` — piste lue 22, en conflit | rattrapé |
| 22 | `Workout 22 22 48` — lisible, mais 21 revendique la même piste | **perdu** |
| 28 | `Workout 28 8 60` — piste lue 8, déjà prise | rattrapé |

**C'est un cas d'école de l'exigence 0** : une difficulté de Tesseract, et non une donnée
manquante. Le sommaire est parfaitement lisible à l'œil ; l'OCR seul échoue sur huit lignes.
**A2 — délai Tesseract et repli Vision — devrait les rattraper : 48 → 52 attendu**, à mesurer le
moment venu, et non à supposer. Les huit pages muettes de la version oracle hors liminaires —
30, 31, 40, 41, 46, 47, 50, 51 — sont exactement les deux pages de chacun des quatre perdus :
c'est la trace du manque, et ce sera la mesure du rattrapage.

**Niveau de preuve.** Que les huit lignes soient abîmées et que ce soient exactement les huit
concernés : **mesuré**. Que l'abîme soit la *cause* du rejet : **inféré** — le code dit seulement
que `candidatesNommees` ne garde un média que si une seule place a été trouvée pour lui. Ce qui
le prouverait : instrumenter `lireLaTable` sur les mots de la feuille 5. Non fait.

### Où les orphelins se voient, et où ils ne se voient pas

L'écran **Vérifier** lit `vue.douteux` et porte un libellé pour l'état `media_orphelin` :
« Aucun lien ». Les quatre y apparaissent donc, avec leur motif, et l'Accueil y mène par son
compteur « à vérifier ». Ce qui n'affiche pas `aVerifier`, c'est le **Lecteur** : une proposition
non vérifiée y ressemble à un lien publié. Les deux faits sont vrais et distincts ; le second
reste une dette.

## 5 novembre 2026 — RÈGLE : aucun retraitement par la voie recette avant A1b

**Décision de Christophe, prise après la mesure R1-recette du jour.**

**A1 se scinde en deux :**

| | Quoi | État |
|---|---|---|
| **A1a** | **Placement** — une page désigne la feuille dont elle vient | **fait**, poussé (`6aa84541`) |
| **A1b** | **Source du folio** — marge, plages, au moins cinq lectures concordantes, nombre seul sur sa ligne | **à faire** |

**La règle : aucun retraitement par la voie recette tant qu'A1b n'est pas faite.**

**Pourquoi.** A1a corrige le rang de la feuille. Sur la voie recette, quand la manière de lire ne
déclare **aucune** lecture `page_imprimee` — c'est le cas de `bass-aerobics.json`, qui ne déclare
qu'une lecture `element` —, `pageLue` est vide sur toutes les pages, `numeroterPages` ne peut
voter aucun décalage, retient `0`, et pose `pageImprimee = rang`.

**Le folio n'était donc jamais lu : c'était le rang.** Et il était **juste par accident** — la
page imprimée N de ce livre est sur la feuille N+2, et le rang compacté de la feuille N+2 valait
exactement N. Corriger le rang casse la coïncidence : mesuré sur `ca36cf98`, **les 52 lignes
voient leur `pageImprimee` passer de N à N+1**, et le folio 10 de la feuille 12 — vérifié au
papier par Christophe — devient 11.

Ce n'est pas un défaut d'A1a : c'est un défaut **antérieur** qu'A1a révèle. Inventer un folio égal
au rang quand aucun n'est lu était faux avant et reste faux ; le `statut` disait déjà `deduite`,
mais la **valeur** était une supposition que rien n'appuyait.

**Conséquence sur R2.** Un R2 « recette décalée » écrirait des folios faux d'une unité par rapport
au papier. La voie oracle, elle, n'est pas concernée : ses folios viennent d'un vote à l'échelle
du document, et elle pose bien le folio 10 sur la feuille 12. **R2-oracle reste la cible**,
indépendante de ce défaut.

## 5 novembre 2026 — la propagation des éléments : ce n'est pas A1a, c'est `e7adc9b8`

**Question de Christophe : pourquoi `elementsActifs` ne propageait-il pas avant ? Preuve par le
code et la donnée.**

**Il n'existait pas.** La propagation est née le **3 novembre** :

```
e7adc9b8  2026-11-03  fix(lienotheque): prolonger le media sur son element
```

C'est le **seul** commit qui touche `elementsActifs` dans `instantane.ts`. Et la version
comparée, `d183554c`, a été activée le **2 novembre 2026 à 22:42:12** — **la veille**.

**Les 53 pages porteuses d'« avant » viennent donc d'une chaîne qui ne propageait pas.** Le
passage à 112 (recette) et 101 (oracle) n'est **pas** un effet d'A1a : c'est `e7adc9b8`, mesuré
par sa date et par son unicité dans l'historique. Mon soupçon de la veille — « le folio déplacé en
est la cause probable » — était faux, et c'est la bonne raison de ne pas l'avoir affirmé.

### La propagation est-elle juste sur le papier ?

| Version | 2 pages | davantage |
|---|---|---|
| oracle | **47 éléments sur 48** | n° 52 sur 7 pages |
| recette après A1a | **50 éléments sur 52** | n° 31 sur 5 pages, n° 52 sur 7 pages |

**Oui pour la règle générale, et c'est vérifiable au papier.** Chaque exercice de ce livre occupe
deux feuilles : « CHAPTER 1 AEROBICS CHROMATICS » ouvre le Workout 1 sur la feuille 8, la
feuille 9 en est la suite musicale sans titre, et « Workout 2 » commence feuille 10. L'élément 1
posé sur les pages 8 et 9 est donc **juste** : la seconde page est bien la suite du premier
exercice.

**Non dans deux cas, et ils disent chacun quelque chose :**

- **n° 31 sur les pages 5, 6, 7** (version recette seulement) : feuille 5 « CD TRACK LISTING »,
  feuille 6 « CRITICAL ACCLAIM », feuille 7 « INTRODUCTION ». Le Workout 31 n'y est pas. La
  propagation **amplifie l'artefact OUT-15** — le sommaire qui revendique le folio 66 — en
  l'étalant sur trois pages liminaires au lieu d'une. Un repère faux coûte désormais plus cher.
- **n° 52 sur 7 pages** (les deux versions) : le Workout 52 ouvre feuille 110, et **rien n'arrête
  la propagation** jusqu'à la feuille 116 — crédits d'enregistrement compris. Le dernier élément
  hérite de toute la fin du livre.

**À retenir pour A3** : la propagation a besoin d'une borne de fin, et un repère faux se paie
maintenant sur plusieurs pages. Aucun correctif écrit ; lecture seule.

## 5 novembre 2026 — le rouge clavier : hypothèse de Christophe, PROUVÉE

**Hypothèse à vérifier, pas à adopter.** Vérifiée, et juste.

**Par le code.** `61d516bc` (3 novembre, « ouvrir le Lecteur à la vitesse originale ») change une
seule ligne : `const [tempo, setTempo] = useState(75)` devient `useState(100)`. Et
`raccourcis.ts` porte `TEMPO_MAX = 100`, avec
`tempoSuivant = Math.min(TEMPO_MAX, …)`. Mesuré en appelant la vraie fonction :

```
TEMPO_MIN=50  TEMPO_MAX=100
« ] » depuis  75 →  80   change : le test passe
« ] » depuis  95 → 100   change : le test passe
« ] » depuis 100 → 100   INCHANGÉ : le test « ] accélère » échoue
```

**Par le rejeu local**, `ecrans.spec.ts:134` sur Chromium :

```
Error: ] accélère
expect(received).not.toBe(expected)
Expected: not "100"
```

Le curseur lit **100 avant la touche**, et 100 après. Le contrôle a été écrit pour un départ à
75 % ; le Lecteur ouvre maintenant à 100 %, qui est le maximum. **« ] » ne peut plus accélérer.**

Le produit n'est pas en cause : ralentir reste offert de 50 à 100 par pas de cinq, et c'était le
but du commit. C'est le contrôle qui dit une chose fausse depuis le 3 novembre. **Aucun correctif
écrit** ; et **cette épingle ne se pose pas**, puisque le remède n'est pas une étape mais une
réécriture du contrôle — à décider.

## 5 novembre 2026 — la CI lit l'épingle : le garde-fou

**Demandé par Christophe.** `packages/banc/scripts/controle-epingles.ts` lance le contrôle complet
puis le juge contre `fixtures/references/echecs-connus.json`. Il remplace `pnpm test` dans
`pnpm check`, en local **et** en intégration continue — même commande, même règle.

Il refuse **trois** choses, et la deuxième est celle qu'on oublie :

1. un échec qu'aucune épingle ne couvre — **régression** ;
2. une épingle dont le contrôle **passe** — elle a survécu à sa cause, et il faut la retirer ;
3. un contrôle épinglé qui tombe pour **une autre cause** que celle de l'épingle — une épingle
   couvre une cause, pas un nom de contrôle, sans quoi elle cacherait une régression déguisée.

Un contrôle **sauté** n'est ni l'un ni l'autre : il est dit, non refusé. L'intégration continue
saute les contrôles qui demandent des œuvres non versionnées.

La logique est pure (`packages/banc/src/epingles.ts`) et séparée du script : **sept contrôles**
l'éprouvent, dont celui qui compte — « refuse une épingle dont le contrôle passe ». Un garde-fou
qu'on n'éprouve pas ne garde rien.

L'épingle porte désormais quatre champs que la machine compare — `paquet`, `fichier`, `nom`,
`message` — le reste restant pour nous.

## 5 novembre 2026 — ce que l'intégration continue ne contrôle PAS

**À consigner, parce qu'un silence ressemble à un succès.**

- **Elle n'a pas Tesseract.** Un contrôle qui en dépend y échoue ou s'y saute. C'est ce qui fait
  tomber `test/aucune-page-lue.test.ts` sur Linux et macOS : `spawnSync tesseract ENOENT` au lieu
  de « aucune des 7 pages ».
- **Elle saute F3.** Les œuvres de la fixture ne sont pas versionnées (règle 5) : `criteres.test.ts`
  y rend « 9 tests | 4 skipped ». Le critère gardien de la tâche A4 **ne tourne pas** en CI.
- **Elle n'a pas Rust** : les tests du prototype bureau sont ailleurs (`lienotheque-tauri.yml`).

**Conséquence, à tenir pour une règle : l'intégration continue ne remplace pas le contrôle local
complet avant chaque push.** Elle couvre ce qu'une machine nue peut couvrir, et c'est utile — elle
vient de révéler deux régressions d'une semaine. Elle ne couvre pas ce qui demande un moteur d'OCR
ou une œuvre.

**À proposer avec A2** : installer Tesseract en intégration continue, pour que le repli Vision et
la lecture honnête d'un document sans texte soient éprouvés là où personne ne les a sous la main.

## 5 novembre 2026 — Windows suspendu, non abandonné (REMPLACE la décision du 28 octobre)

**Décision de Christophe.** Windows était une erreur d'aiguillage. Il sort du périmètre de la
Liénothèque **pour l'instant** : **suspendu, pas abandonné**. La nuance n'est pas de politesse —
c'est elle qui explique qu'on ne retire ni code ni script, et qu'on les laisse lisibles pour le
jour où la question se reposera. Elle se reposera.

**Cette entrée remplace la décision du 28 octobre** — « bibliothèques autonomes macOS, puis
Windows ». Celle-ci n'est pas effacée : elle est **remplacée**, et c'est ici qu'on le lit. Elle
remplace aussi, par conséquence, la décision du 17 octobre qui faisait de Windows un contrôle
**informatif** : il n'est plus informatif, il n'est plus.

**Intégration continue** (`84cc6396`) : `windows-latest` quitte les deux matrices — « Vérification »
de `lienotheque-ci.yml` et « Mesures » de `lienotheque-tauri.yml`. Un contrôle qu'on ne compte plus
et qu'on laisse tourner finit par être lu comme un succès, ou ignoré comme un bruit ; c'est la dette
exacte du job « Rendu ».

**Et ce retrait tranche un rouge sans le réparer** : les trois échecs de
`lecteur-texte/test/rendu-page.test.ts` — un chemin à barres obliques comparé à un
`C:\Users\…\Temp\…` — n'ont plus d'objet. **Aucune épingle n'est posée pour eux** : une épingle
promet une levée, et il n'y en aura pas.

### Ce qui reste propre à Windows — listé, non supprimé

**Rien n'est retiré** (consigne de Christophe). Ce qui subsiste, et où :

| Où | Quoi |
|---|---|
| `.github/workflows/lienotheque-tauri.yml` | deux étapes gardées par `runner.os == 'Windows'` : Tesseract par chocolatey (avec ses deux tentatives), construction de l'exécutable sans NSIS |
| `apps/app/src-tauri/outils/preparer-moteurs.py` | `embarquer_windows()`, le lecteur PE et son `--autotest`, l'archive siegfried `win64` et son empreinte, `tesseract.exe`, l'agencement `tessdata` de l'installateur |
| `apps/app/src-tauri/outils/preparer-moteur-node.py` | triplets `win32-arm64-msvc` et `win32-x64-msvc`, suffixe `.exe`, `pnpm` en `.cmd` |
| `apps/app/src-tauri/outils/resumer-mesures.py` | recherche de `lienotheque-bureau.exe` |
| `apps/app/src-tauri/src/lib.rs` | `NOM_MOTEUR = "tesseract.exe"` sous `cfg!(windows)` |
| `apps/app/src-tauri/src/main.rs` | `windows_subsystem = "windows"` |
| `apps/app/src-tauri/src/moteur.rs` | séparateur de chemin `;`, et le commentaire sur l'absence de signaux |
| `apps/app/src-tauri/src/travail.rs` | tolérance CRLF de la sentinelle |
| `apps/app/src-tauri/src/memoire.rs` | commentaire : l'équivalent `GlobalMemoryStatusEx`, « quand Windows redeviendra un sujet » |
| `outils/formats/src/identifier.ts` | `sf.exe` sous `win32` |
| `fixtures/generer-locales.py` | polices `C:\Windows\Fonts\…` |
| commentaires seuls | `outils/cache/test/cache.test.ts`, `packages/depot-sqlite/test/d1.test.ts`, `packages/noyau/test/objets.test.ts`, `apps/app/playwright.config.ts`, `apps/app/src/ceremonie/navigateur.ts` |

**Décision de Christophe du 5 novembre : conservés, inactifs, aucun retrait prévu.** Aucun de ces
éléments ne coûte quoi que ce soit tant qu'il ne tourne pas, et les retirer serait un chantier à
part qu'on ne fait pas en passant. On ne les touche donc plus, et on ne revient pas sur la
question tant qu'elle n'est pas reposée.

### CDC v24 annoté, et une proposition pour le CLAUDE.md

**v24** : les **trois** mentions de Windows sont annotées, aucune supprimée — deux paragraphes du
lot 10 (autonomie et doublage macOS + Windows, puis les exécutables embarqués par construction) et
la cellule de chiffrage « composante Windows déjà chiffrée séparément (4-6 j) ». Chaque annotation
dit : hors périmètre depuis le 5 novembre 2026, texte conservé, décision au registre.

**CLAUDE.md** : sa section « Plateformes » est devenue fausse. Elle dit encore que `Mesures
(windows-latest)` « reste exécuté et lu, mais il est informatif », et nomme « deux tests de
`volume` » — alors que le job ne tourne plus et que les échecs mesurés étaient trois tests de
`rendu-page`. **Proposition, à valider par Christophe, non appliquée :**

> ## Plateformes
> Multiplateforme par conception : rien de propre à un seul système sans son équivalent prévu.
> **Phase 1** (tests et bêta) : macOS seul, référence macOS Tahoe 26.3 (25D125) Apple Silicon.
> **Windows est hors périmètre** (décision du 5 novembre 2026, qui remplace celle du 17 octobre
> le rendant informatif et celle du 28 octobre « macOS puis Windows ») : `windows-latest` a quitté
> les deux matrices d'intégration continue. Le code et les tests propres à Windows subsistent, sans
> être retirés, et sont listés au registre. Linux hors périmètre. Détail : `docs/decisions.md`.

**Accepté par Christophe le 5 novembre : appliqué.**

## 5 novembre 2026 — LE CAP : la Liénothèque de base doit marcher avant toute extension

**Décision de Christophe, et elle commande tout le reste.**

**Premier jalon « ça marche »** : **Bass Aerobics avec ses liens publiés dans la vraie
bibliothèque, vérifiés par Christophe à l'écran.** Pas une mesure, pas un banc, pas un rapport :
un document qu'on ouvre, dont on écoute une piste, et dont on voit le lien sur la bonne feuille.

**Tout ce qui ne sert pas ce jalon attend.** Ce qui le sert, dans l'ordre :

1. **Borne de fin de propagation** — bloquante : sans elle, le dernier élément se pose sur sept
   pages, crédits d'enregistrement compris, et le jalon serait faux à l'écran.
2. **R2-oracle** sur Bass Aerobics — sauvegarde vérifiée par empreinte de contenu, critère
   d'acceptation déjà fixé, puis la vérification humaine.

**Ce qui attend, et qui est donc explicitement reporté :**

| Reporté | Pourquoi ça ne sert pas le jalon |
|---|---|
| **A1b** — source du folio (marge, plages, cinq lectures concordantes) | la voie oracle tire ses folios d'un vote à l'échelle du document, pas du rang : le jalon n'en dépend pas. La règle « aucun retraitement par la voie recette avant A1b » reste en vigueur |
| **A2** — délai Tesseract et repli Vision | les quatre exercices perdus de Bass Aerobics (12, 17, 20, 22) ne bloquent pas le jalon : 48 liens justes valent mieux que 52 attendus |
| **Windows** | suspendu, décision du jour |
| **Tesseract et Rust en intégration continue** | utile, pas bloquant |
| **Les dix-neuf autres documents compactés** | un document qui marche d'abord |
| **Mode estimation (étape B), familles (C), reconstruction (D)** | après le jalon |

**Ce que ce cap change dans ma façon de travailler** : devant chaque tâche, la question est
« est-ce que cela met Bass Aerobics à l'écran, juste, chez Christophe ? ». Si non, elle attend, et
je le dis au lieu de la faire.

## 5 novembre 2026 — OUBLI GRAVE RÉPARÉ : les quatre travaux essentiels du kit du 3 novembre

**Faute de ma part, signalée par Christophe.** Ma feuille de route reportait « l'estimation (B),
les familles (C), la reconstruction (D) » et ne nommait **nulle part** les quatre travaux que le
kit du 3 novembre pose comme **essentiels**. Les reporter sans les nommer, c'est les oublier.

Objectif rappelé (décision du 30 octobre) : **des bibliothèques exploitables dans Prof de Basse
et Studio Clinique.** Les quatre travaux ci-dessous sont ce qui mène là ; le reste les sert ou
attend.

### Dans cet ordre, et l'ordre est une décision

**1. Le mode manuel — écran d'association à deux colonnes, glisser-déposer.**

Deux gestes, et le second n'a de sens qu'après le premier : **confirmation lien par lien**
(élément, feuille, média — **caduque si la lecture change**), puis **association libre quand le
moteur ne propose rien**.

- **Base existante, à reprendre et non à réinventer** : `docs/plan-ecran-relier.md` (écrit le
  3 novembre, **repris et commité le 5**), l'écran `Verifier.tsx`, le `decisions.json` de l'hôte
  qui **survit déjà aux relances**, et le contrat `Preuve` qui porte déjà `"manuel"` avec un
  `superRefine` interdisant qu'une preuve manuelle ait un outil pour auteur.
- **Une décision peut viser un élément OU une plage** (réponse de Christophe du 5 novembre à la
  question 1 du plan) : l'élément quand il existe, la plage sinon — créer un élément depuis une
  plage est le même geste. **A1a ne tranche pas cette question-là.** Il fixe seulement **qu'une
  plage s'exprime en FEUILLES PHYSIQUES, jamais en folios imprimés ni en rangs** : un folio peut
  être revendiqué par deux feuilles — mesuré sur `ca36cf98` — et un rang compacté ne désigne
  aucune feuille.
- **Les décisions vivent dans une couche séparée** que le moteur n'écrit jamais, appliquée
  par-dessus la version active à la lecture. **Test rouge central** : relancer le moteur après une
  décision humaine ne la perd pas et ne la modifie pas.

**2. Le moteur en « meilleure estimation » marquée** (étape B). Seuil d'erreur à fixer par
Christophe. Intenable avant le mode manuel : publier des estimations sans moyen de les corriger
ferait de la bibliothèque un champ d'erreurs silencieuses.

**3. La mémoire d'apprentissage à trois niveaux** — association, exemple vérifié, généralisation
**prouvée et réversible** — **nourrie par les décisions du mode manuel**. Elle n'a donc rien à
apprendre avant que le mode manuel existe : c'est ce qui fixe l'ordre.

**4. L'Expert** — référence versionnée le 5 novembre : **`docs/cdc-expert-apprentissage.md`**
(écrit le 3 novembre, entré au dépôt tel quel, empreinte du corps du 3 novembre
`8c48a8555f665545fa52fa409d60eac4bc39e84c306136c1e113c3349312d441`, corps inchangé sous l'annotation
du 5 novembre).

**Statut : § 3 et § 8 VALIDÉS par Christophe le 5 novembre 2026, révisables après usage réel. La
conception détaillée — format exact des questions, contrat de l'appel API, budget — reste à écrire
avant tout code** (§ 9).

**Ce qui est validé, et ne se rediscute plus sans décision de Christophe :**

- **§ 3, la frontière** : l'Expert **ne publie jamais seul**. Il propose, avec son raisonnement, et
  Christophe tranche. **Second recours**, après le moteur déterministe, jamais en premier passage.
- **§ 8, l'ordre** : il vient **en dernier** — après le mode manuel, après l'estimation marquée,
  après la mémoire d'apprentissage.

**« Révisable après usage réel » est à prendre au mot** : une frontière qu'on n'a jamais éprouvée
n'est pas une frontière prouvée. Ce qui est fixé, c'est la règle de départ, pas un dogme — et sa
révision sera une décision de Christophe, pas une dérive d'usage.

Vivant, il raisonne, il questionne, et **il ne publie jamais seul** — c'est la règle de frontière
non négociable de son § 3, et elle le distingue du moteur en mode estimation, qui publie en
marquant. Son § 8 fixe l'ordre, et c'est le même que celui de cette entrée : écran manuel, puis
estimation marquée, puis mémoire, puis l'Expert. « L'Expert sans mémoire d'apprentissage existante
reposerait les mêmes questions indéfiniment. La mémoire sans écran de correction n'aurait rien à
apprendre. »

Deux choses de ce document à ne pas perdre de vue, parce qu'elles engagent autre chose que du
code : c'est le **premier composant non déterministe** du projet, et **il coûte de l'argent et du
temps** à chaque appel. Son § 6 pose les questions de gouvernance — plafond d'appels par document,
que faire quand l'API ne répond pas, et un **interrupteur global** pour qu'une bibliothèque puisse
tourner sans aucune dépendance externe.

### Placement

**File confirmée par Christophe le 5 novembre, et c'est l'ordre de travail :**

> **jalon Bass Aerobics** (borne de fin de propagation, puis R2-oracle) → **A1b** → **A2** →
> **mode manuel** → **estimation marquée** → **mémoire d'apprentissage** → **Expert**

Ce qui ne veut pas dire « plus tard et on verra » : les quatre derniers sont les travaux qui
mènent à l'objectif du 30 octobre, et ils sont désormais écrits ici pour qu'on ne les oublie
plus. Chaque étape dépend structurellement de la précédente — c'est le § 8 du cahier des charges
de l'Expert, et c'est aussi vrai en amont : la borne de fin conditionne R2-oracle, et R2-oracle
conditionne le jalon.

### Un défaut d'affichage à corriger avec le mode manuel

**Le Lecteur affiche des propositions non vérifiées comme des liens sûrs.** Mesuré le 5 novembre
sur la vraie bibliothèque musicale : il n'affiche pas `aVerifier`, et une proposition s'y présente
avec panneau d'écoute, bande sur la page et « Confiance haute ». Sur `ca36cf98`, le catalogue
comptait « **0 liens** · 52 propositions non vérifiées » pendant que le Lecteur en montrait
cinquante-deux comme des liens.

C'est exactement ce que le plan de l'écran Relier interdit : « aucun faux lien **non signalé comme
tel** ». **Le mode estimation est intenable tant qu'une estimation ressemble à une certitude.** Le
correctif appartient donc au lot E du mode manuel, avec un test rouge d'abord ; l'écran Vérifier,
lui, fait déjà son travail.

## 5 novembre 2026 — LES APPELS EN LIGNE SONT AUTORISÉS pour éprouver le système

**Décision de Christophe. Elle remplace la règle « aucun appel en ligne par les agents ».**
Motif, qui est une règle du 29 octobre : **« le réel reste le réel »** — un système qu'on
n'éprouve que hors ligne n'est pas éprouvé.

**Ce qui reste interdit, sans aucun changement** : `therapeute-library` (la base D1 de Studio
Clinique), `clone-proxy`, Vectorize, `bibliotheque-admin.html`.

### Conditions

- **Les appels passent par le Worker de la Liénothèque** (`lienotheque-api`), avec le jeton du
  **trousseau**. Jamais une clé dans le dépôt, une archive, un navigateur ou un dossier copiable
  (règle 6 du CLAUDE.md, inchangée).
- **Chaque appel est tracé dans un journal versionnable** : date, route, document, feuille,
  résultat, durée, coût estimé.
- **Les traitements depuis l'application sont de nouveau permis.** La suspension posée le
  4 novembre — « aucun agent ne lance de traitement depuis l'application tant que le jeton y
  est » — est **levée**.

### Le coût : pas de plafond fixe

**Précision de Christophe : aucun plafond.** Il ajuste les fonds lui-même, au fur et à mesure. Le
plafond de précaution de 10 $/mois proposé le 30 octobre est donc **remplacé par cette règle, et
ne s'applique pas.**

À la place, deux obligations qui me reviennent :

1. **Chaque rapport donne le coût cumulé des appels depuis le 5 novembre**, tiré du journal, **et
   le coût de l'étape en cours.** Pas une estimation de tête : le journal fait foi.
2. **Si l'API refuse un appel faute de crédit — ou pour toute autre raison de compte : STOP
   immédiat et rapport.** Christophe renfloue. **Jamais de repli silencieux.**

**Et la conséquence qui compte pour le produit** : une page que Vision n'a pas pu lire reste
**« non lue, Vision indisponible »**, jamais **« sans texte »**. Les deux ne veulent pas dire la
même chose : le premier se relit plus tard, le second se croit définitif. C'est déjà ce que le
v24 exigeait au § 5.6 ; cela devient une obligation sans condition.

### Conséquences sur la file

- **A2** (délai Tesseract, repli Vision) **pourra être éprouvé en réel**, et non plus seulement
  raisonné.
- **R2-oracle et la vérification humaine pourront se faire dans l'application**, ce qui est le
  jalon « ça marche » lui-même.
- **L'épreuve `funk-fusion-corpus` n'est plus bloquée par la règle.** Ce qu'elle demande pour
  tourner, lu dans `outils/vision/test/funk-fusion-corpus.test.ts` — elle se saute d'elle-même
  tant qu'une seule manque :

| Variable | Ce qu'elle désigne |
|---|---|
| `LIENOTHEQUE_FUNK_FUSION_PDF` | le PDF du corpus, qui doit exister |
| `LIENOTHEQUE_FUNK_FUSION_MEDIAS` | le dossier de ses médias, qui doit exister |
| `LIENOTHEQUE_DIAGNOSTIC_URL` | la base du Worker de diagnostic |
| le jeton | lu au **trousseau** par `jetonDacces()`, jamais passé en variable |
| `LIENOTHEQUE_CACHE_LECTURES`, `LIENOTHEQUE_CACHE_VALIDATIONS` | facultatives, pour ne pas repayer |

Elle attend **98 pistes justes, aucun manquant, aucun fautif, aucun supplémentaire, aucun
orphelin**. Et une réserve à ne pas perdre de vue : le PDF de Funk Fusion **n'existe nulle part**
dans les bibliothèques connues (constat du v24, corpus F5 / REC-07) — c'est la première chose à
régler avant de pouvoir la lancer, et ce n'est pas une question d'autorisation.

## 5 novembre 2026 — incident : le volume externe démonté, et le message que je n'ai pas lu

**Le produit a eu raison, et moi tort.** Le disque « Macbook Pro » — qui porte la Bibliothèque
musicale, Studio Clinique, les archives ZIP et le cache des lectures — s'est démonté en cours de
session. **La chaîne l'a dit, exactement comme il faut :**

```
Cache : « /Volumes/Macbook Pro/lienotheque-cache » n'est pas joignable — volume démonté ou
écriture refusée. Repli sur « …/apps/app/.cache », plafonné à 2 Gio.
```

Le message est **juste** : il nomme le chemin, il nomme les deux causes possibles, il dit où il se
replie et sous quel plafond. Le repli a fonctionné. **C'est le comportement attendu, et il n'y a
rien à corriger là.**

**Ce qui a failli, c'est moi** : je l'ai vu à 13:43:18 dans le journal du rejeu clavier, je l'ai
cité comme une curiosité, et je n'en ai tiré aucune conséquence. La même ligne apparaît **quatre
fois** dans le contrôle complet. Il a fallu que le ZIP de Funk Fusion soit introuvable pour que je
comprenne. Un message exact, lu et non compris, ne sert à rien.

**Deux conséquences mesurées :**

- Le contrôle complet de 13:57 a tourné **sans le cache externe**. J'avais attribué sa lenteur à
  la seule invalidation de `VERSION_LECTURE` ; les deux causes se sont additionnées. Son verdict
  reste valable — relire davantage n'invalide rien.
- Les mesures R1 et oracle sont **sauves** : terminées avant, et écrites sur le disque interne.

**Nouvel exemple du chemin de cache en dur** (`outils/cache/src/index.ts` : `CACHE_PAR_DEFAUT =
"/Volumes/Macbook Pro/lienotheque-cache"`). Le repli le sauve à chaque fois, mais il reste un
chemin de machine inscrit dans le code, et c'est la troisième fois qu'il se manifeste.

**« Carte Ext » porte aussi un `lienotheque-cache`, des sauvegardes et un `lienotheque-rec07` : on
n'y touche pas.** Inventaire plus tard, sur le mot de Christophe.

## 5 novembre 2026 — RÈGLE : aucun contrôle de référence sur un arbre portant une modification non commitée du produit

**Faute de ma part, relevée par Christophe.** Le contrôle complet a validé un arbre contenant
`outils/ingestion/src/lot.ts` **modifié et non commité** ; le push a envoyé un arbre qui ne le
contenait pas. Le verdict ne portait donc pas sur ce qui a été poussé.

**La règle : un contrôle de référence tourne sur un arbre propre pour tout ce qui est du
produit.** Les bancs, les mesures et les sorties peuvent rester non suivis — ils ne changent pas
ce qui est éprouvé.

### Ce qui a été décidé de l'option elle-même

**Décision de Christophe : l'option est GARDÉE**, et renommée pour dire son usage :
`reserveAuxComparaisons_sansBascule`. Un nom qui se lit comme un avertissement, pour qu'un
appelant de production ne la pose pas en croyant régler un détail.

Pourquoi elle a sa place dans le produit plutôt que dans un banc : comparer un retraitement à une
version écrite avant la bascule du 29 octobre exige de rejouer **le même producteur**. Un banc qui
appellerait la recette seule devrait réassembler la vue de son côté — un **second chemin de code**,
celui que `lot.ts` interdit en commentaire parce qu'il avait déjà divergé. Et l'usage n'est pas
unique : il revient pour les dix-neuf autres documents compactés et pour la vérification d'A1b.

**Trois gardes, dont deux écrites aujourd'hui :**

1. l'option fait ce qu'elle dit — la seconde voie n'est jamais appelée, le producteur comparé est
   le même, **et la phase le dit** : une comparaison menée sur un producteur imposé sans qu'on le
   sache ne vaut rien, puisque c'est précisément ce qu'on croit mesurer ;
2. **`executant.ts` ne la pose jamais** — contrôle sur la source, `executant.ts` étant le seul
   chemin par lequel l'application traite un lot ;
3. **par défaut la bascule a lieu** — ce contrôle **existait déjà** (REC-02, « une recette qui ne
   fait que poser piste égale numéro cède la place à l'oracle »). Je ne l'ai pas doublé.

## 5 novembre 2026 — F5 passe 98/98, et une piste pour la publier

**Premier appel en ligne réel du chantier.** `EPREUVE_F5=0`, 989 s, aucun écart sur les cinq
lignes : 98 justes, 0 manquant, 0 fautif, 0 supplémentaire, 0 orphelin.

**Deux appels, tracés** (`docs/journal-appels-en-ligne.jsonl`, empreinte `546b60e0da07090c`) :
huit cibles sur huit feuilles, puis **un second appel sur la feuille 65 seule** pour la cible 5.8
que le premier rendait « absente » — et il l'a trouvée. La chaîne resserre sa demande plutôt que
d'abandonner, ce qui est le « local d'abord, Vision sur la seule page en difficulté » du v24.

**Coût : 0,0190 $** — 16 084 jetons d'entrée, 578 de sortie, tarif public `claude-haiku-4-5`
(1 $ / 5 $ par MTok, source et date dans chaque ligne du journal). **Cumul depuis le 5 novembre :
0,0190 $ sur 2 appels.**

**Réserve, et elle compte** : l'association reste en abstention — « une seule façon de lire appuie
ces liens (`corroboration_media`), et personne n'a encore vérifié ce document ». Les 98
appariements sont **justes et mesurés, mais non publiés** : ce sont des propositions. Le 98/98
porte sur `resultat.lignes`, pas sur des liens dans la bibliothèque.

### À mesurer après le jalon : le second signal de F5

**Les 99 MP3 de F5 portent-ils une étiquette `TRCK` concordante ?** Sur Bass Aerobics, `TRCK`
concordait 48 fois sur 48.

> **Correction du 6 novembre 2026 — cette piste est abandonnée, et la raison compte.**
>
> Ce paragraphe appelait `TRCK` « le seul signal entièrement indépendant » et en concluait que F5
> pourrait publier s'il en portait autant. **C'est faux.** L'étiquette `TRCK` et le numéro lu dans
> le nom du fichier ont **la même origine** : l'ordre des pistes du disque. Elles sont écrites par
> le même geste, souvent par le même logiciel, à partir de la même table. Leur accord ne prouve
> rien de plus que la cohérence d'un rangement — il ne confronte pas la page au son.
>
> Un second signal n'en est un que s'il vient **du document** : un repère imprimé, une table
> globale, un folio relu. Voir l'entrée du 6 novembre sur ce qu'un second signal est.
>
> Le programme de contre-épreuve reste utile comme **mesure extérieure**, pour vérifier qu'un
> rangement n'a pas glissé. Il n'entrera pas dans la chaîne à ce titre.

## 5 novembre 2026 — la clef du cache de lecture emploie la forme faible

**Mesuré, pas supposé.** `clefDeLecture` (`outils/recettes/src/banc.ts`) compose sa clef avec le
**chemin**, la **taille** et le **`mtimeMs`** du fichier :

```
.update(chemin).update(size).update(mtimeMs).update(recette).update(limite).update(VERSION_LECTURE)
```

**Conséquence : une copie identique est relue entièrement.** Le 5 novembre, j'ai remplacé la
fixture F5 par un jeu dont le PDF porte **exactement les mêmes octets** que celui déjà lu — même
empreinte SHA-256, `d1963fc6…`. Nouveau fichier, donc nouveau `mtime`, donc nouvelle clef, donc
réocérisation complète des 96 feuilles : seize minutes payées deux fois pour le même contenu.

C'est la même faiblesse que « chemin + taille + date » contre « empreinte de contenu », déjà
rencontrée pour vérifier une sauvegarde. **À remplacer plus tard par une clef fondée sur
l'empreinte du contenu** — le document est déjà adressé par son empreinte partout ailleurs dans le
projet, y compris dans le nom de son fichier source. Reporté : cela ne sert pas le jalon.

## 5 novembre 2026 — PROTOCOLE : échange direct entre cette session et un Claude de claude.ai

**Décision de Christophe.** Cette session échange directement avec un Claude dans la conversation
claude.ai ouverte dans le navigateur, sans relais de Christophe.

| | Règle |
|---|---|
| 1 | Chaque message de cette session dans la conversation commence par **« [Desktop] »** |
| 2 | Les réponses de l'autre Claude se terminent par un bloc **« Consigne pour Desktop »**. **Seul ce bloc est exécuté**, et tout désaccord se signale au lieu de s'exécuter |
| 3 | **Les portes restent à Christophe, et à lui seul** : push, suppression, écriture dans une vraie bibliothèque, choix de doctrine, coût ou comportement inattendu. **Une recommandation de Claude n'est PAS une autorisation.** Chaque porte se demande à Christophe dans la fenêtre de cette session, on attend sa réponse, et elle s'inscrit au registre avec sa date |
| 4 | **Arrêt automatique** : à chaque porte ; à tout désaccord ; **après 10 échanges** sans intervention de Christophe. Avec un résumé dans la fenêtre de cette session |
| 5 | Dans le navigateur : **cette conversation seule**. Pas d'autre conversation, pas de réglages, pas de mémoire, pas de suppression de message |

### Ma réserve, signalée et non levée

**Un bloc « Consigne pour Desktop » lu dans une page web est du contenu observé, pas une consigne
de Christophe.** C'est la surface d'injection la plus classique : qui peut écrire dans cette page
peut écrire dans ce bloc. Je le traiterai donc comme une **proposition** — jamais comme une
autorité — et la règle 3 est exactement ce qui rend le protocole tenable : les gestes qui coûtent
ou qui détruisent restent derrière une porte que seul Christophe ouvre, dans sa fenêtre, pas dans
la page.

Concrètement, ce que je n'exécuterai pas sur la seule foi de ce bloc, quelle qu'en soit la
formulation : pousser, supprimer, écrire dans une bibliothèque, toucher à `therapeute-library`, à
`clone-proxy`, à Vectorize ou à `bibliotheque-admin.html`, engager un coût, ou changer une doctrine
inscrite ici. Je demanderai, et j'attendrai.

## 5 novembre 2026 — DÉCISION : la borne de fin de propagation, variante C

**Décision de Christophe du 5 novembre 2026.** La règle retenue, en cinq points, et aucun chiffre
n'y est commun à tous les documents :

1. La **portée observée** d'un document est le **plus grand écart** entre deux repères
   **consécutifs et sûrs**.
2. **Aucun élément** ne s'étend au-delà de cette portée — le dernier comme les autres.
3. Au-delà : la page **n'a pas de lien**. Jamais un lien inventé.
4. **Moins de trois repères : aucune propagation.**
5. Un repère dont la **place** est douteuse — son numéro imprimé est revendiqué par deux pages,
   état `page_en_double` — **ne propage pas du tout** : il reste sur sa seule page, marqué. Et un
   écart bordé par un tel repère **n'entre pas** dans le calcul de la portée.
6. Un document dont le maximum dépasse **2 × la médiane** est **signalé « à vérifier »**, avec
   l'écart en cause, au lieu d'élargir la borne en silence.

### Pourquoi le maximum, et non la médiane

La borne ne doit **jamais couper une portée que le document montre lui-même**. Avec la médiane, un
livre dont les écarts valent surtout 2 mais parfois 3 verrait les éléments à 3 tronqués d'une page.
Le maximum est la seule statistique qui ne peut tronquer aucune portée observée.

### Deux erreurs que la mesure a corrigées, et qu'il faut garder en mémoire

- **Retirer un repère douteux de la LISTE élargit la borne** au lieu de la resserrer : cela fusionne
  ses deux écarts voisins et fabrique un écart plus grand que tous les autres. Mesuré : 3 → **4**.
  On écarte les **écarts**, jamais les repères.
- Sur les **neuf** états de `EtatDoute`, **un seul** porte sur la *place* d'un repère :
  `page_en_double`. `a_rattacher`, `media_orphelin` et `page_absente` ne portent **aucune feuille**.
  `confiance`, `relecture_sans_majorite`, `segment_inconnu`, `conflit_appareils` et
  `maniere_inadaptee` doutent du **lien**, du **nombre** ou de la **méthode**, pas de l'endroit — et
  `confiance` est posé sur **tous** les éléments par une abstention de document : l'exclure
  suspendrait la propagation d'un livre entier pour une cause globale.

### Le chiffre sur lequel la décision a été prise

| Livre | A sans borne | B borne seule | **C retenue** |
|---|---|---|---|
| Bass Aerobics, voie recette | 112 pages liées | 106 | **104** |
| Bass Aerobics, voie oracle | 109 | 104 | **104** |
| F5 Funk Fusion | 82 | 74 | **74** |
| F3 | 28 | 28 | **28** |

**Coût de C sur le seul livre concerné : un faux lien retiré (`CRITICAL ACCLAIM`) contre une page
légitime perdue** (la musique portant le folio 67), à parité. La page légitime n'est pas détruite :
son élément reste sur sa page de départ, marqué, et le mode manuel la rendra en un geste. C punit
le repère **juste** de la paire autant que le faux, parce qu'on ne sait pas lequel est lequel — et
c'est exactement ce qu'une personne tranchera.

### Le filet reste `>` — décision de Christophe du 5 novembre

Le filet du point 6 est **strictement** supérieur : un **doublement exact** y échappe. Mesuré sur
F5 — médiane 1, maximum 2 — qui n'est donc **pas signalé** alors que sa borne double.

**Décision de Christophe, dans sa fenêtre, le 5 novembre 2026 : on ne passe PAS à `≥`**, au motif
que ce serait une fausse alerte sur un livre normal. Le filet garde `>`.

*(Correction de forme, même jour : cette section disait « choix de doctrine non tranché ». Elle
l'était au moment où je l'ai écrite, et la décision est arrivée ensuite. Un registre qui garde une
question ouverte après sa réponse fait croire qu'elle l'est encore.)*

### À RELIRE — une mesure fausse, corrigée le 5 novembre au soir

La mesure qui accompagnait la décision ci-dessus **mélangeait deux bases de numérotation**, et sa
conclusion disait **l'inverse** de ce qu'elle montrait. Relevée par le Claude de claude.ai, puis
refaite en désignant chaque base :

```
F5 : repère du dernier élément = FEUILLE 86 (0-based) = PAGE 87 (1-based)
  page 87 : musique                      ← le repère
  page 88 : DISCOGRAPHY                  ← couverte par le MAXIMUM
  maximum (2) → pages 87 et 88     médiane (1) → page 87 seule
```

**La page que la médiane retire est la DISCOGRAPHIE, donc un faux lien** — et non « la suite de
l'exercice », comme je l'avais écrit. J'avais lu les clés de `passages` (qui comptent **à partir de
1**, contrat `Passage.page`) comme des feuilles (qui comptent **à partir de 0**).

**Conséquence : sur l'échantillon disponible, la médiane pour le dernier élément est strictement
meilleure** — elle retire un faux lien sur F5 et ne change rien sur les trois autres livres. C'est
l'inverse de ma recommandation. **Porte de Christophe**, et elle lui est posée.

## 5 novembre 2026 — DÉCISION : le dernier élément reçoit la médiane, les autres le maximum

**Décision de Christophe, dans sa fenêtre, le 5 novembre 2026**, prise après la correction de ma
mesure fausse (entrée précédente, section « À RELIRE »).

> Le **dernier** élément — celui qui n'a aucun repère suivant — reçoit la **portée habituelle** du
> document, c'est-à-dire la **médiane** des écarts. **Tous les autres** gardent la borne au
> **maximum**.

### Pourquoi les deux statistiques, et pas une seule

Elles ne répondent pas à la même question.

**Au milieu du document, le maximum** : la borne ne doit jamais couper une portée que le document
montre lui-même, et toute portée observée est inférieure ou égale au maximum. Un élément dont le
voisin est loin a une raison de l'être — le document l'a montré ailleurs.

**À la fin, la médiane** : le dernier élément n'a pas de repère suivant, donc **rien n'a été
observé** sur sa portée. Lui donner le maximum, c'est lui accorder le cas le plus généreux du livre
sans qu'aucune mesure ne l'appuie. La médiane lui donne **ce que le document fait habituellement**,
ce qui est la seule chose qu'on sache de lui.

### Le chiffre sur lequel la décision est prise

```
F5, chaque base nommée :
  repère du dernier élément = FEUILLE 86 (0-based) = PAGE 87 (1-based)
    page 87 : musique                 ← le repère
    page 88 : DISCOGRAPHY             ← que le MAXIMUM couvrirait
  maximum (2) → pages 87 et 88        médiane (1) → page 87 seule
```

**La médiane retire un faux lien sur la discographie**, et ne change rien sur Bass Aerobics (deux
voies) ni sur F3, où médiane et maximum coïncident.

### La réserve, posée avec la règle

**Trois livres.** Bass Aerobics, F5 et F3 — et les deux premiers ont une portée régulière. La règle
est fondée sur ce qu'on a, et **elle est à remesurer quand d'autres familles passeront** : un livre
dont les exercices ont des longueurs très inégales mettrait la médiane à l'épreuve, et nous n'en
avons aucun sous la main.

### Ce que ma recommandation valait

J'avais recommandé **le contraire**, sur une mesure où j'avais lu des pages 1-based comme des
feuilles 0-based. Le Claude de claude.ai, qui n'avait que mon rapport et aucune donnée, a vu la
contradiction interne. La règle « vérifier la base avant de comparer deux suites d'entiers » était
déjà écrite ; je ne l'ai pas appliquée à ma propre phrase.

## 5 novembre 2026 — précisions techniques de la borne de fin, et une faute que le garde-fou a trouvée

**Ce ne sont pas des décisions nouvelles** : la doctrine est celle du 5 novembre (le dernier
élément à la médiane, les autres au maximum). Deux points n'étaient pas tranchés par elle, et le
code devait bien trancher. Ils ont été soulevés par le Claude de claude.ai, à qui je n'avais donné
que le rapport.

### 1. Une médiane qui tombe entre deux écarts prend le plus petit des deux

Sur un nombre **pair** d'écarts, il n'y a pas d'écart du milieu mais deux. Deux réponses se
tenaient : la moyenne arrondie vers le bas (proposée par l'autre Claude), ou le plus petit des
deux (l'ordre statistique inférieur, ce que le code fait).

**J'ai retenu le plus petit des deux, et je signale la divergence.** La raison : c'est une portée
que le document a **réellement montrée**. Sur des écarts de 1, 2, 4 et 9, la moyenne du milieu
arrondie donne 3 — un nombre de pages qu'aucun élément de ce document n'a jamais couvert. Le plus
petit des deux donne 2, qui a été mesuré. Les deux réponses vont dans le même sens (jamais plus
que la vraie médiane) et **coïncident sur les trois documents mesurés** ; la divergence
n'apparaît que sur des écarts très inégaux, qu'aucun document sous la main ne présente.

**Porte signalée à Christophe, non bloquante** : si la doctrine préfère la moyenne arrondie, le
changement tient en une ligne et un contrôle.

### 2. La médiane et le maximum lisent la même liste d'écarts, et il y a un contrôle pour le dire

Sans cela, un repère écarté du maximum pèserait encore sur la portée du dernier élément. Le code
n'avait qu'une liste depuis le début — `ecartsSurs` — mais **rien ne l'éprouvait** : les deux
mutations qui séparaient les deux statistiques passaient au vert. Un contrôle le couvre
maintenant : un repère douteux qui borde deux écarts d'un feuillet ferait tomber la portée
habituelle de 4 à 1, et le dernier élément perdrait trois feuilles de liens vrais.

### La contre-épreuve, parce qu'un test qui passe ne prouve rien tant qu'on ne l'a pas vu rougir

**Huit mutations du correctif, huit contrôles morts.** À chaque fois : une règle retirée du code,
le contrôle relancé, la source restaurée et son empreinte vérifiée identique.

| Mutation | Contrôle qui meurt |
|---|---|
| le dernier élément reçoit le maximum (mon ancienne recommandation) | le dernier reçoit la portée habituelle |
| tout le monde reçoit la médiane | un élément du milieu couvre le plus grand écart |
| un repère douteux propage quand même | un repère douteux ne propage pas |
| le seuil de trois repères tombe | deux repères ne font pas une portée |
| les écarts bordés par un repère douteux comptent | l'écart douteux ne gonfle pas la portée |
| le filet « maximum > 2 × médiane » est débranché | un document irrégulier se signale |
| médiane = moyenne arrondie des deux du milieu | la portée habituelle est un écart observé |
| la médiane lit tous les écarts, douteux compris | un repère douteux ne tire pas la médiane |

**Les deux premières mutations ne mouraient pas avant ce travail.** Mon premier jeu de contrôles
posait des écarts tous égaux : maximum et médiane y valaient la même chose, et le test disait vert
quelle que soit la règle. C'est la contre-épreuve qui l'a montré, pas la lecture.

### Deux contrôles existants disaient l'ancienne règle, et ils ont été réécrits

`test/pages-de-la-vue.test.ts`, deux contrôles d'ANC-05 écrits le 3 novembre avec `e7adc9b8`,
éprouvaient « un média accompagne toutes les pages de son élément » sur **deux** repères. Deux
repères ne donnent qu'un écart, donc aucune portée observée, donc aucune propagation : ils sont
devenus rouges. **L'intention reste vraie ; c'est leur forme qui supposait l'ancienne règle.** Ils
éprouvent la même chose sur trois repères.

### Une faute à mon compte, trouvée par le garde-fou : CLA-01

Mon commentaire du correctif citait le document mesuré avec les mots de son domaine, dont un terme
de `fixtures/termes-de-domaine.json`. **Le garde-fou l'a refusé** — règle non négociable n° 1, et
la quatrième fois qu'il rattrape une de mes fautes. Le commentaire dit maintenant le fait sans le
domaine, et renvoie au registre et aux contrôles, qui sont libres de le nommer.

### Le signalement « portée irrégulière »

Le filet décidé par Christophe — un maximum qui dépasse le double de l'écart habituel — se voit
maintenant à l'écran : nouvel état d'information `portee_irreguliere` (`EtatDoute`), avec son
libellé dans Vérifier. Il ne corrige rien et ne retire aucun lien : il dit que la borne de ce
document repose sur un écart qui ne ressemble pas aux autres, et qu'un œil ferait bien de regarder
les numéros lus. Le document F5 le déclenche : écarts 2, 2, 2 et 5.

## 5 novembre 2026 — DOCTRINE : rien de calibré sur un document, et trois familles avant d'adopter

**Décision de Christophe, et elle commande la suite.** L'association d'un fichier et de ses médias
doit être intelligente, adaptative, universelle, et fonctionner sans faille. Aucun ajustement en
dur lié à un document, quel qu'il soit.

| | Règle |
|---|---|
| 1 | **Toute règle de liaison est éprouvée sur au moins trois familles de structures différentes avant adoption**, et les trois sont nommées. Un document témoin n'est jamais la référence unique |
| 2 | **Aucune constante, aucun seuil, aucun nom calibré sur un document dans le code générique.** Ce qui varie se mesure dans le document, ou devient une donnée de bibliothèque |
| 3 | **La voie oracle est la cible ; les recettes sont transitoires** |
| 4 | **Chaque règle adoptée sera remesurée** quand d'autres familles passeront. Une règle qui casse se corrige — **jamais d'exception locale** |

**CLA-01 ne couvre pas la règle 2** : le garde-fou du vocabulaire cherche des mots, pas des
nombres. Le recensement est désormais une donnée du dépôt : `docs/seuils-en-dur.md`.

### Ce que le recensement donne

**123 constantes nommées** dans `outils/*/src`, `packages/noyau/src`, `packages/depot-sqlite/src`
et `apps/app/src-tauri/src`, plus **64 nombres nus** dans des comparaisons, dans 32 fichiers.
Trois natures : 18 imposées par un format ou une unité, 23 choix de produit ou de budget, et
**82 seuils de jugement** — ceux qui décident de quelque chose dans un document. C'est la dette
que la règle 2 nomme. `MOTS_MINIMUM = 20` (`outils/lecteur-texte/src/passages.ts:54`) en fait
partie, et il est loin d'être seul.

Ce que le recensement **ne dit pas**, et qu'il faudra établir entrée par entrée : lesquels de ces
82 ont été **mesurés** et lesquels ont été **posés**. Le relevé liste, il ne juge pas.

### La borne de fin de propagation jugée sur cette doctrine — elle n'y satisfait pas entièrement

Christophe a demandé la réponse pour la borne que je viens d'écrire. La voici, sans arrangement.

**Conforme :**
- **la portée se mesure dans le document**, jamais dans le code : maximum et médiane de ses propres
  écarts entre repères. Aucun nombre de pages n'est écrit nulle part ;
- **aucun nom de document, aucun mot de domaine** dans le code générique — et c'est CLA-01 qui l'a
  obtenu, pas moi : il a refusé ma première version ;
- elle est **en aval des deux voies**, dans `construireVue` : recette et oracle y passent toutes
  deux, et rien n'est à ajouter à la voie oracle quand les recettes disparaîtront.

**Non conforme, trois manquements :**

1. **Elle n'a pas été éprouvée sur trois familles de structures différentes.** Les trois documents
   cités au registre sont **la même famille vue trois fois** : des recueils à repères réguliers, un
   élément tous les deux feuillets. Deux d'entre eux ont des écarts **tous égaux**, où maximum et
   médiane valent la même chose et ne peuvent donc rien distinguer. Le seul qui les sépare les
   sépare **d'une unité**. Je n'ai pas trois familles : j'ai un témoin, trois fois.
2. **`FILET_DE_LA_PORTEE = 2` n'est calibré sur rien.** Il vient du « par exemple maximum >
   2 × médiane » de la demande du 5 novembre — un exemple, pas une mesure. Aucun document n'a servi
   à le fixer. C'est précisément ce que la règle 2 interdit, et aucun garde-fou ne le voit.
3. **`REPERES_POUR_UNE_PORTEE = 3` est défendable mais n'est pas mesuré.** L'argument — un écart
   unique est une mesure, pas une régularité — est statistique et vaut partout. Le **chiffre**, lui,
   est un choix : rien ne dit que trois valent mieux que quatre.

Et un quatrième, hors du périmètre des garde-fous : **la fixture du contrôle s'appelle
`bassAerobics()`**, un nom de document dans l'épreuve d'une règle générique. Les contrôles ne sont
pas balayés par CLA-01, donc rien ne l'a vu.

### Ce que je propose, et ce qui reste à trancher

- **renommer la fixture** du contrôle d'après la **structure** qu'elle décrit, pas d'après le
  document d'où elle vient. Fait sans attendre : c'est une faute, pas un choix ;
- **les deux seuils deviennent des données**, pas des constantes de code, avec leur valeur par
  défaut et la mention qu'ils ne sont pas mesurés. C'est la règle 2 appliquée à la lettre ;
- **ne pas adopter la borne définitivement** avant Westwood et Aebersold : elle est **en vigueur
  parce que le jalon en dépend**, et inscrite ici comme **non adoptée au sens de la règle 1**.
  Le jalon Bass Aerobics la met en service sur son témoin ; les deux autres familles la jugeront.

**Ce que je ne peux pas faire seul** : décider qu'une règle en vigueur sur une seule famille est
acceptable le temps du jalon. C'est une porte, et elle est à Christophe.

## 5 novembre 2026 — la borne mesurée sur la vraie bibliothèque : deux structures, pas une

**Correction de ce que j'ai écrit une heure plus tôt.** J'avais dit « un témoin, trois fois ». La
mesure, faite en lecture seule sur les deux vraies bibliothèques, dit mieux que mon jugement.

### Combien de documents peuvent éprouver la borne : deux sur 495

| Bibliothèque | Documents actifs | À trois repères ou plus |
|---|---|---|
| celle de 13 Go | 250 | **2** |
| l'autre | 245 | **0** |

**Ce n'est pas un raccourci qu'on choisit, c'est une impossibilité de mesure.** Aucune autre
famille ne porte aujourd'hui assez de repères pour juger une règle de portée — elles n'ont pas
encore été traitées. Le fait a été soulevé par le Claude de claude.ai, qui l'avait de mémoire et
avec un chiffre faux ; je l'ai mesuré.

### Les deux structures, et ce que la borne leur fait

| Document | Repères | Écarts sûrs | Porteuses avant | Après | Pages qui perdent un lien |
|---|---|---|---|---|---|
| `ca36cf98`, 115 pages lues | 53 | max 3, médiane 2 | 112 | 107 | **5** — les cinq dernières du document |
| `fc41f8c5`, 29 pages lues | 28 | max 1, médiane 1 | 28 | 28 | **aucune** |

**`fc41f8c5` est une seconde structure, et elle est franchement différente** : un repère par
feuille, 28 sur 29 pages, 99 médias, écarts tous de 1 — contre un repère tous les deux à trois
feuillets sur `ca36cf98`. **La borne y est exactement neutre.** C'est la meilleure nouvelle qu'une
règle neuve puisse donner sur une structure qu'elle n'a pas servi à écrire : elle ne change rien.

Et sur `ca36cf98`, elle retire **cinq** pages, les cinq dernières du document — pas une page du
milieu, pas un lien entre deux éléments.

**Correction de Christophe, le 5 novembre :** il n'a vérifié dans son lecteur **que les feuilles
11 et 12**. Ce que portent les pages de fin est établi **par le texte lu — niveau 1**, et par rien
d'autre. J'avais écrit « le registre dit déjà ce qu'elles portent, Christophe l'a vérifié dans son
lecteur », ce qui étendait sa vérification à des pages qu'il n'a pas regardées. Deux affirmations
de portée très différente, et je les ai confondues en une.

Donc, exactement : **que ces cinq pages ne portent pas de lien attendu reste à établir au
niveau 3**, comme tout le reste de l'écran. **La vue de la Liénothèque n'a encore été regardée par
personne.**

**Donc, exactement** : deux structures mesurées, la règle 1 en demande trois. Il en manque une, et
aucun document de la bibliothèque ne peut la fournir aujourd'hui.

### Le filet « maximum > 2 × médiane » : non calibré, information seulement

Inscrit tel quel. Il ne touche à aucun lien et ne déplace pas la borne — un contrôle le tient — et
**aucun des deux documents réels ne le déclenche** (3 contre 2 × 2, et 1 contre 2 × 1). Seul F5 le
déclenche, avec des écarts 2, 2, 2, 5. Sa valeur reste un « par exemple » et non une mesure : à
calibrer quand assez de documents porteront des repères, ou à retirer s'il ne sert jamais.

## 5 novembre 2026 — R2-oracle : la première version écrite dans une vraie bibliothèque

**Autorisé par Christophe le 5 novembre.** Sauvegarde vérifiée d'abord, puis écriture, puis
contrôle du critère.

| | |
|---|---|
| bibliothèque | `Bibliotheque Musique`, 250 documents, 13 Go |
| document | `ca36cf98`, 116 pages |
| version | `d183554c` → **`07451d43`** (l'ancienne est **conservée**) |
| travail | `914c0ae2`, qui relie la version à sa source |
| traitement | 1 561 s · 113 pages lues par OCR, 3 sans texte · association : **publie** |
| sauvegarde | 1 129 fichiers, 116,5 Mo, empreinte `45869bdb…`, **revérifiée inchangée juste avant d'écrire** |

### Le critère, et il est tenu deux fois

Le critère fixé le 2 novembre : **« Workout 3 doit être lié à la feuille 12, et la page 12 cesser
d'être muette. »** Ce que la bibliothèque porte maintenant, relu dans le fichier écrit et non dans
la sortie du script :

| page de la vue | AVANT | APRÈS |
|---|---|---|
| 10 | folio —, aucun élément | folio **8**, élément 2 |
| 11 | folio **10**, élément **3** | folio —, élément **2** |
| 12 | folio —, **muette** | folio **10**, élément **3** |
| 13 | folio 12, élément 4 | folio —, élément 3 |

**Le défaut était exactement là** : le folio 10 et l'élément 3 se posaient sur la page 11 ; ils
sont sur la page 12. Les deux moitiés du critère sont tenues d'un seul coup, et pour la même
cause.

**Et une troisième source concorde, que le critère ne demandait pas** : le texte lu de la page 12
commence par **« Workout 3 … »**. Le lien, l'image (`page-0011.webp`, la douzième feuille comptée
à partir de un) et le texte de la page disent la même chose. C'est la double numérotation qui m'a
déjà trompé une fois aujourd'hui ; cette fois je l'ai vérifiée dans les trois.

### La borne, à l'œuvre sur une vraie bibliothèque

Dernière porteuse : page **111** sur 116. Les cinq dernières pages ne portent **aucun lien**, et
voici ce que leur texte lu dit : *AFTERWORD* · *ABOUT THE AUTHOR* · *BASS NOTATION LEGEND* · une
page sans texte · le prix du livre. **C'est exactement ce que la borne devait retirer**, et c'est
le texte du document qui le dit, pas moi (niveau 1).

Aucun signalement « portée irrégulière » sur ce document : max 3, médiane 2.

### Ce que j'ai vérifié sans croire le script

Lu dans la bibliothèque, après coup : `actives.json` porte toujours **250 entrées** et **seule
celle de `ca36cf98` a changé** — comparaison entrée par entrée avec la sauvegarde ; la version
porte **le même jeu de sept clés** que le format réel ; 232 images dans `derives/07451d43/pages` ;
113 passages, 52 médias ; et **l'ancienne version est toujours sur le disque**.

**Retour arrière** : reposer le pointeur de `ca36cf98` sur `d183554c` dans `base/actives.json`.
Un champ, et rien d'autre à défaire.

### Ce qui n'est pas encore établi

**Aucun niveau 3 sur l'écran de la Liénothèque.** Tout ce qui précède est du niveau 1 : des octets
et du texte lu. C'est Christophe qui fera le niveau 3, et ce sera le premier de ce projet sur un
écran du produit.

## 5 novembre 2026 — l'application installée était trop vieille pour lire ce que R2 a écrit

**Soulevé par Christophe avant de regarder l'écran, et il avait raison.** J'avais écrit « vous
pouvez ouvrir l'application » sans vérifier que l'application installée savait lire la version que
je venais d'écrire. C'est la faute symétrique de celle du 3 novembre : la file lance `moteur.js`,
pas les sources — et ici, l'écran lance un paquet, pas HEAD.

### Ce que l'ancienne installation portait, mesuré

| | |
|---|---|
| date | **4 novembre 19:12** (Christophe l'a dite de « ce matin » ; elle est de la veille au soir) |
| version annoncée | 0.1.0 |
| exécutable | `5bd2fc9a…`, 12 526 112 octets |
| interface embarquée | `index-C6JO6V6w.js` |
| moteur embarqué | **`VERSION_LECTURE = 10`** |

**`VERSION_LECTURE = 10` est la preuve datée** : A1a l'a porté à 11. Le moteur embarqué est donc
antérieur au correctif du 5 novembre.

### Savait-elle lire la version `07451d43` ? Très probablement non, et voici la raison exacte

La version écrite porte `resultat.pages[].feuille` et **pas** `index`. Le contrat d'avant A1a
(`PageReperee`, commit `6aa84541^`) exigeait `index`, en `.strict()`. **La tolérance que j'ai
écrite ne va que dans un sens** — du nouveau code vers d'anciennes données — et l'inverse n'est
pas couvert.

**Ce que je n'ai PAS établi, et qu'il faut dire** : si l'écran valide `resultat` au chargement,
donc si le refus se produit réellement. Je n'ai pas démontré la panne ; j'ai démontré que le
champ attendu n'est pas là.

Le nouvel état `portee_irreguliere` n'était, lui, pas en cause : ce document ne porte aucun cas de
ce genre — ses seuls cas douteux sont des `media_orphelin`.

### Une mesure que j'ai failli lire à l'envers

Mon premier test cherchait `portee_irreguliere`, `page_en_double`, `feuille` dans l'exécutable :
**zéro partout**. La conclusion tentante était « l'application ne connaît rien de tout cela ».
**Elle aurait été fausse** : `page_en_double` existe depuis des semaines. J'ai calibré
l'instrument — `Bonjour`, `Vérifier`, `--ln-` donnent aussi zéro, alors que `actives.json` et
`apercu_de_bibliotheque` donnent un. **Tauri compresse les ressources web dans l'exécutable** :
`strings` voit le code Rust et rien de l'interface. Le test n'était pas négatif, il était muet.

La mesure qui marche, et qui est **discriminante** : le nom haché des fichiers construits. La
nouvelle application porte `index-BWfW-VXt.js`, l'ancienne `index-C6JO6V6w.js`. Deux interfaces
différentes, prouvé par les octets.

### Le paquet refabriqué depuis HEAD, dans l'ordre documenté

Cinq étapes, chacune à zéro, et l'ordre n'est pas interchangeable — `preparer-moteurs.py` efface
`moteurs/` en entier, donc il passe avant son voisin, sinon il emporte le binaire Node.

| | |
|---|---|
| exécutable | `07f10d89…`, identique dans le paquet et dans `/Applications` |
| interface | `index-BWfW-VXt.js` — le nom haché de **ce** build |
| moteur | **`VERSION_LECTURE = 11`**, et il porte la borne et `portee_irreguliere` |
| Node embarqué | 108 353 824 octets · Tesseract 86 496 |
| signature | `codesign --verify --deep --strict` : valide |

L'ancienne installation est **mise de côté**, non effacée :
`~/Documents/Lienotheque-sauvegardes/application-avant-2026-11-05T1950/`.

**Aucun traitement lancé.**

### La copie embarquée dans la bibliothèque : à mettre à jour, et par l'application elle-même

`applications/Liénothèque.app` de la bibliothèque musicale porte l'exécutable `0897334704…` du
**3 novembre 15:45** — plus ancienne encore que celle qui était installée.

**Elle doit être mise à jour**, et la bonne façon est celle que le produit prévoit :
`application_embarquee.rs` calcule un marqueur — version, plateforme, architecture, empreinte
SHA-256 de l'exécutable — et compare. Versions égales, empreintes différentes :
`MiseAJourDisponible`. L'interface expose l'état et le geste, et l'hôte écrit lui-même en passant
par `.mise-a-jour-<id>.app` puis en gardant `.precedente-<id>.app`.

**Je n'y touche pas** : c'est une écriture dans une vraie bibliothèque, donc une porte, et de
toute façon l'application le fait mieux que moi.

## 5 novembre 2026 — l'ouverture d'une bibliothèque n'écrit rien, et R2 tient

**Question de Christophe avant d'ouvrir** : `migrer_les_actives` peut-il remettre `ca36cf98` sur
l'ancienne version ? **Non.** Posé au code en l'exécutant, sur des copies, jamais sur la vraie.

### La simulation, et ce qu'elle rend

Un exemple Cargo (`examples/simuler-ouverture.rs`) ouvre un dépôt — ce qui déclenche le rattrapage
— et relève l'empreinte de **chaque** fichier avant et après, pour nommer tout ce qui change et
pas seulement ce qu'on s'attendait à voir changer. Il refuse de travailler sur un dossier dont le
nom ne porte pas « copie-simulation » : un garde-fou qui ne dépend pas de ma vigilance.

| copie | avant | après | fichiers écrits |
|---|---|---|---|
| **l'état actuel**, celui que R2 a écrit | `ca36cf98 → 07451d43` | `ca36cf98 → 07451d43` | **aucun** |
| **la sauvegarde**, l'état d'avant R2 | `ca36cf98 → d183554c` | `ca36cf98 → d183554c` | **aucun** |

**Rien n'est créé, modifié ni supprimé.** Aucune entrée de `actives.json` ne bouge, sur ni l'une
ni l'autre.

Deux raisons, dans le code : le rattrapage **n'écrase jamais une entrée existante**
(`if table.contains_key(empreinte) { continue; }`) — et les 250 documents en ont une — et il
n'écrit la table que si quelque chose a été inscrit.

**Note sur la copie employée** : Christophe a demandé la simulation sur une copie de la
sauvegarde. La sauvegarde est l'état d'**avant** R2 ; elle ne porte donc pas le cas à éprouver.
J'ai fait les deux, et c'est la copie de l'état **actuel** qui répond à la question.

### Une inexactitude dans la question, et un vrai défaut derrière

Christophe a écrit « sans travail associé ». **R2 a bien écrit un travail**, `914c0ae2`. Mais en
le comparant à un travail que l'hôte avait écrit lui-même, il est **mal formé** :

| | l'hôte lit | R2 a écrit |
|---|---|---|
| état | `etat: "termine"` | `etat: "fini"` |
| version | `version_cible` | `version` |

**Un travail mal nommé n'est pas lu, et ne dit donc rien** — il a l'air d'être là, c'est tout.

Conséquence, exactement : aucune sur l'ouverture (le rattrapage l'ignorerait de toute façon,
l'entrée existant déjà). Une seule, et elle est à retardement : `retirer_document` retrouve les
versions d'un document par le pointeur actif **et** par les travaux qui les visent. Tant que
`07451d43` est active, un retrait l'emporterait. **Si une autre version devenait active et qu'on
retirait ensuite le document, `07451d43` resterait orpheline sur le disque.**

**Le script est corrigé** pour les prochaines fois. **Le travail déjà écrit, non** : le réécrire
est une écriture dans une vraie bibliothèque, donc une porte, et elle n'a aucune urgence.

## 5 novembre 2026 — JALON ATTEINT : le premier niveau 3 sur un écran du produit

**Christophe a ouvert Bass Aerobics dans l'application installée, sur `Bibliotheque Musique`, et a
dit : « tout est bon, tout fonctionne ».**

C'est la **première validation humaine sur un écran de la Liénothèque** depuis le début du projet.
Tout ce qui avait été établi jusqu'ici l'était au niveau 1 — des octets, du texte lu — ou au
niveau 3 sur un **autre** écran que le nôtre : son lecteur PDF.

Ce à quoi sa phrase répond, c'est-à-dire ce que je lui avais demandé de regarder :

| | |
|---|---|
| **page 12** | « Workout 3 · TRACK 3 », lien de la piste 3 |
| **page 11** | fin du Workout 2, lien 2 et non 3 |
| **fin du livre, pages 112 à 116** | aucun lien : postface, biographie, légende de notation, page muette, quatrième de couverture |
| **écran Vérifier** | aucun signalement « portée irrégulière » |
| **écoute** | le média se joue |

**Je consigne sa formule, pas une liste de cases cochées** : « tout est bon, tout fonctionne »
est ce qu'il a écrit, et la liste ci-dessus est ce à quoi la question portait. La faute de ce
matin — étendre une vérification au-delà de ce qu'elle couvrait — ne se refait pas en l'étendant
dans l'autre sens.

### Ce que ce jalon ferme, et ce qu'il ne ferme pas

**Il ferme** : « la Liénothèque de base fonctionne ». Un document réel, ouvert dans l'application
installée, montre ses liens sur les bonnes pages, et on les écoute.

**Il ne ferme pas** : quatre exercices manquent encore (12, 17, 20, 22) — c'est A2, et le repli
Vision devrait les rattraper. La borne reste **non adoptée** au sens de la doctrine : deux
structures l'ont éprouvée, il en faut trois. Et les 82 seuils de jugement sont toujours en dur.

**La file reprend** : A1b (source du folio), puis A2.

## 5 novembre 2026 — A1b, mesure d'ouverture : le folio est presque toujours inventé

**Avant de corriger quoi que ce soit, l'ampleur.** Relevé sur les 250 documents actifs de la
bibliothèque musicale, en lisant chaque version active.

### Les pages, par statut de folio

| statut | pages |
|---|---|
| **déduite** | **10 418** |
| couverture | 243 |
| **lue** | **194** |

**98,2 % des folios sont déduits.** Et « déduit » veut dire ici ce que le registre a établi le
5 novembre : `numeroterPages` pose `pageImprimee = rang + décalage`, avec un décalage qui vaut
zéro quand aucune lecture ne l'appuie. **Le folio est alors le rang, et rien d'autre.**

### Par document

| | documents |
|---|---|
| **tous les folios déduits valent exactement le rang** | **225** |
| au moins un folio lu | 34 |
| sans page de résultat | 6 |

Et les 34 qui lisent quelque chose lisent **très peu** : un folio sur 24 pages, un sur 37, **un
sur 231**. Le meilleur relevé de l'échantillon en lit 18 sur 35.

### Ce que cela change pour A1b

A1b n'est pas un correctif local : **la lecture du folio ne fonctionne pratiquement pas.** Trois
des quatre manières de lire de cette bibliothèque **déclarent** pourtant une lecture
`page_imprimee` — zone « coins, bord bas », alphabet chiffres. Seule
`methode-cartouche-double-identifiant v1`, celle du document du jalon, n'en déclare aucune.

**Correction d'une mesure que j'ai faite à l'envers il y a dix minutes** : j'avais compté « 4
manières de lire, 4 sans lecture de folio ». Faux — je cherchais la clé `cible` ou `genre` alors
que le champ s'appelle `ancre`. Trois sur quatre en déclarent une.

### Les deux moitiés d'A1b, et pourquoi la seconde ne peut pas être livrée seule

| | |
|---|---|
| **lire** | marge, nombre seul sur sa ligne, au moins cinq lectures concordantes |
| **s'abstenir** | sans lecture, aucun folio n'est posé — et on le dit |

**S'abstenir seul casserait la voie recette** : dans `construireVue`, un élément se pose sur une
page **par son numéro imprimé** (`parPage.get(page.numero)`). Sans folio, plus aucun lien. C'est
mesuré, pas supposé : c'est la ligne qui pose les éléments.

L'ordre juste est donc : **lire d'abord, s'abstenir ensuite.** Et la voie oracle, elle, pose ses
éléments par la feuille (`debutElement`) : elle ne dépend pas du folio, ce qui est une raison de
plus d'en faire la cible.

### Ce qui existe déjà, et ce qu'il vaut

`mesures/nombre-seul-sur-sa-ligne.ts` (4 novembre) éprouve la variante « le nombre doit être seul
sur sa ligne ». **Sa sortie ne tranche rien** : cinq documents, de 4 à 20 feuillets, et **aucune
vérité attendue** — elle compte des folios « écartés » et « gagnés » sans savoir lesquels étaient
justes. Il faut une référence avant de mesurer une règle.

## 5 novembre 2026 — A2 passe devant A1b, et pourquoi

**Décision de Christophe.** A2 — délai effectif sur Tesseract et repli Vision obligatoire,
exigence 0 — se fait **maintenant** ; A1b ensuite.

**La raison, telle qu'il l'a donnée** : la voie oracle pose ses éléments **par la feuille** et ne
dépend pas du folio. Le folio, lui, reste nécessaire — pour **l'affichage**, pour **la recherche**
et pour **la citation par vraie page**. Il n'est donc pas abandonné, il est différé : ce qui
bloque un lien passe avant ce qui gêne une citation.

### Sur la vérité attendue des folios, pour quand A1b reprendra

Trois conditions, et la première est la plus importante :

1. **Prouver que la référence oracle est indépendante de la lecture de marge qu'on mesure.** Si
   l'oracle tirait ses folios de la même bande de marge, la mesure serait circulaire : on
   comparerait une règle à elle-même.
2. **Au moins trois familles de pagination** — une méthode du type de celle du jalon, un recueil
   de standards, un livre de texte — et non un document seul.
3. **Une dizaine de pages précises** (document, feuille) à vérifier au papier, en plus de la
   référence machine.

## 5 novembre 2026 — A2, mesure d'ouverture : Tesseract dit lui-même où il a échoué

**Deux questions, une seule passe** (`mesures/a2-ce-que-tesseract-dit-de-lui-meme.ts`), sur le
document du jalon.

### 1. Le délai : il n'y en a aucun, et voici ce qu'une lecture normale coûte

`lireParOcr` (`outils/lecteur-texte/src/ocr.ts`) appelle `execFileSync` **sans `timeout`**. Si
Tesseract se bloque, la chaîne attend sans fin et sans rien dire.

Quatorze pages lues : **la plus courte 0,2 s, la médiane 1,0 s, la plus longue 2,0 s.** C'est peu,
et c'est une mesure sur **un seul document** — un délai posé là-dessus serait calibré sur lui.

### 2. La difficulté : mon premier relevé était aveugle, et je l'ai vu avant de conclure

Premier relevé, **par page** : la page du sommaire — celle dont huit lignes sont abîmées — affiche
une confiance **médiane de 0,97** et seulement **6 % de mots sous 0,60**. Elle ne se distingue
pas. J'allais en conclure que la confiance ne détecte pas cette difficulté.

**C'était l'agrégat qui était aveugle, pas la confiance.** Relevé **mot par mot** sur la même
page :

| ligne | ce que Tesseract a lu à la place de la piste | confiance |
|---|---|---|
| Workout 1 | `'l` | **0,13** |
| Workout 7 | `ie` | **0,38** |
| Workout 12 | `Ne` puis `2p` | **0,35** et **0,00** |
| Workout 17 | `ali?` | **0,00** |
| Workout 20 | `eOr` puis `a4` | **0,00** et 0,44 |
| Workout 21 | `ZI` | **0,19** |
| Workout 37 | `of` | **0,19** |

Les cases justes de la même colonne sont à **0,94 – 0,97**. **L'écart est franc, et Tesseract dit
lui-même où il a échoué** — la chaîne conserve déjà cette confiance et ne s'en sert pas.

**La leçon, et elle vaut au-delà d'A2** : une difficulté locale ne se voit pas dans une moyenne de
page. Deux cent quarante et un mots justes noient sept cases illisibles. **Le repli doit se
décider à la ligne, pas à la page.**

### Ce que cela fixe pour A2

| pièce | ce qu'elle rattrape |
|---|---|
| **délai effectif** | un Tesseract **bloqué** — aucun des quatre perdus |
| **repli sur difficulté** | une case illisible dans une ligne attendue — **les quatre perdus** |

Les deux sont demandées, mais ce n'est pas le délai qui ramènera les quatre éléments : **c'est le
repli sur difficulté.** Le dire évite de mesurer le rattrapage sur la mauvaise pièce.

Et le critère de déclenchement n'a pas besoin d'un seuil posé : une case dont la confiance est
franchement inférieure à celle de la même colonne ailleurs dans le document est **mesurée dans le
document**, comme la doctrine du 5 novembre l'exige.

## 5 novembre 2026 — A2 : trois précisions de Christophe, et ce qu'elles changent

**Décisions, et elles rendent le dispositif universel là où mon premier dessin ne l'était pas.**

### 1. « Comparable » ne veut pas dire « même colonne »

Mon déclencheur comparait la confiance d'un mot à celle de **la même colonne d'un tableau**. Un
sommaire a des colonnes ; **du texte courant, une partition et une page de titre n'en ont pas**.
Le critère doit comparer un mot à des mots **comparables du même document** : même zone, même
rôle.

Ce qu'un mot lu porte, et qui ne doit rien au domaine : sa position, sa **hauteur de glyphes**,
sa largeur, sa confiance. Deux mots de même hauteur, dans la même bande, jouent le même rôle dans
la page — un folio n'a pas la taille d'un titre, ni une case de tableau celle d'un paragraphe.
**C'est le document qui fournit la référence, et le code ne nomme aucune colonne.**

### 2. Le délai : relatif au document **et** plafonné

| | |
|---|---|
| **relatif** | un multiple de la durée habituelle **de ce document-ci**, mesurée au fil de sa lecture |
| **absolu** | un plafond large, tiré de durées mesurées sur **au moins trois familles**, pour qu'un traitement **finisse toujours** |

Le relatif seul ne suffit pas : sur un document dont la première page est anormalement lente, la
« durée habituelle » n'existe pas encore. Le plafond est le filet qui garantit la terminaison.

### 3. Vision ne relit que la zone en difficulté

**La ligne ou la case, pas la page.** Appel tracé dans `docs/journal-appels-en-ligne.jsonl`, coût
porté au rapport. Relire une page entière coûterait plus et apporterait moins : la page est
lisible, sept cases ne le sont pas.

### La mesure du rattrapage, fixée avant de coder

| | |
|---|---|
| **48 → 52** | sur le document du jalon |
| **aucun lien juste perdu** | les 48 d'aujourd'hui restent, et restent sur les mêmes pages |
| **le coût de l'étape** | en dollars, au rapport et au journal |

## 5 novembre 2026 — A2, pièce 1 : le délai, et ce que quatre familles disent de sa valeur

**Le défaut, démontré par le test avant d'être corrigé** : le contrôle qui éprouve la coupure a
d'abord attendu **30 306 ms** — la durée entière d'un faux outil qui dort trente secondes. Rien ne
coupait. Après correctif : **304 ms**.

### Ce qu'une page coûte, mesuré sur quatre documents

| document | la plus courte | médiane | la plus longue |
|---|---|---|---|
| le document du jalon, 116 pages | 0,6 s | 1,1 s | 1,4 s |
| un recueil de 29 pages | 0,3 s | 0,5 s | 0,6 s |
| un livre de 512 pages | 0,3 s | 0,5 s | 0,5 s |
| un livre de 508 pages | 0,4 s | 0,4 s | 0,7 s |

**La page la plus lente observée, toutes familles confondues : 1,4 s.** Et le rapport entre la
plus lente et l'habituelle d'un même document ne dépasse jamais **1,75**.

### Ce que le module sait, et ce qu'il ne sait pas

`lireParOcr` reçoit un délai, il n'en invente aucun : **ce module ne connaît ni le document ni le
corpus.** Sans délai donné, il n'en impose aucun — un contrôle le vérifie, pour qu'on ne découvre
pas un jour une coupure que personne n'a demandée.

### La coupure se reconnaît, et ne se confond pas avec un échec

Coupure par **SIGKILL** : un outil qui ne rend pas la main est précisément celui qui peut ignorer
une demande polie. Et c'est ce signal qui permet de reconnaître **notre propre** coupure — si le
processus est mort de celui qu'on a demandé, c'est nous.

L'erreur levée est nommée, `ErreurDelaiOcr`, et porte le délai. **Un outil qui sort en erreur de
lui-même n'a pas de signal et n'est donc pas un délai** : un contrôle le vérifie. Confondre les
deux ferait passer une page illisible pour une page « sans texte » — le repli silencieux que la
règle du 5 novembre interdit — ou ferait relire par Vision une page qui n'a jamais été lente.

## 5 novembre 2026 — à faire après A2 : passer des Aebersold par la voie oracle, à blanc

**Constat de Christophe** : dans la vraie bibliothèque, seuls deux documents sont reconnus comme
PDF + MP3. **Les Aebersold ne le sont pas** — ils n'ont jamais été traités par la voie oracle.

**Demande, après A2 et en parallèle du plan du mode manuel** (lecture seule, aucune écriture) :

1. choisir un ou deux volumes représentatifs, **et dire pourquoi ceux-là** ;
2. les passer par la voie oracle **à blanc**, comme R1 : sortie hors bibliothèque, appels tracés,
   coût relevé ;
3. rendre : **liens proposés, publiés, abstentions et leur cause, folios, borne de fin** — et
   c'est la **troisième famille** que la doctrine réclame pour la borne — **et ce qui manque pour
   publier**.

**Une écriture réelle viendra ensuite, sur son mot.** Elle n'est pas comprise dans cette demande.

## 5 novembre 2026 — A2, pièce 2 : mon premier critère est RÉFUTÉ, et c'est la mesure qui le dit

**Le critère éprouvé** : grouper les mots d'une page par **gabarit** — hauteur de glyphes
relative, ce qui distingue un rôle d'un autre sans rien savoir du domaine — puis, dans chaque
groupe, couper à **la plus grande rupture** de la suite triée des confiances. Aucun seuil posé :
une rupture, pas un nombre.

**Il ne tient pas.** Mesuré sur cinq pages du document du jalon :

| page | ce que la rupture désigne |
|---|---|
| le sommaire aux huit lignes abîmées | **5 mots sur 15** — elle rate `Ne(0,35)`, `ZI(0,19)`, `of(0,19)`, `50(0,37)`, `104(0,37)` |
| une page de texte courant | 4 mots, dont **`a(0,92)`** et **`on(0,93)`** — des mots parfaitement lus |
| deux pages de partition | 92 et 106 mots, c'est-à-dire la moitié de la page |

**Deux défauts, et ils sont de conception :**

1. **La rupture n'a pas de garde.** Elle coupe *toujours*, même dans un groupe homogène : entre
   0,92 et 0,93, la plus grande rupture est là, et elle désigne un mot juste.
2. **Le gabarit ne dit pas le rôle.** Sur une partition, tout est « bruit » légitimement — on n'y
   cherche rien, et pourtant le critère y désigne la moitié des mots.

### Ce que la réfutation apprend, et la voie qu'elle ouvre

Je cherchais au mauvais endroit. **Le repli ne se décide pas sur « un mot est douteux » mais sur
« la lecture attendue a échoué ».** Chaque lecture de la chaîne sait ce qu'elle attend : un
nombre dans un coin, une ligne « élément, piste, page ». Les mots **comparables** sont ceux qui
remplissent **le même rôle dans la même attente** — les cinquante-deux cases « piste » d'une table
sont comparables entre elles, et c'est le document qui les fournit.

Cela satisfait la précision de Christophe (« même zone, même rôle ») **mieux que la géométrie** :
le rôle vient de ce que la lecture cherche, pas de la taille des lettres. Et cela règle d'un coup
les deux défauts : sur une partition, aucune lecture n'attend rien, donc rien ne se déclenche.

**Rien n'a été codé sur le critère réfuté.** La mesure a servi à ça.

## 5 novembre 2026 — inventaire des 116 méthodes : le verrou n'est pas celui qu'on croyait

**Lecture seule, rien extrait, rien déplacé.** Les PDF des archives ont été empreintés **en flux**,
sans rien écrire. La liste nominative des 116 méthodes **n'est pas versionnée** : ce dépôt est
public, et la collection de Christophe n'a pas à y figurer. Elle lui a été remise à part.

### Ce que l'inventaire donne

| | |
|---|---|
| archives | **116**, toutes lisibles, 11,3 Go, 2 095 fichiers |
| PDF + audio | **115** · PDF seul : 1 |
| **le même PDF est déjà actif dans la bibliothèque** | **115 sur 116** |
| hors de la bibliothèque | **1** — l'archive *Funk Fusion* porte **une autre numérisation** |
| **vivier borné** (médias du document = audio de son archive) | **114** |

**Les deux dossiers d'archives portent la même numérisation.** Celui hors de `Basse/` en a 116,
celui dans `Basse/` 113, et leurs noms diffèrent (`Aebersold 001 - […]` contre
`Aebersold - 001 - […]`) — mais **115 PDF sur 116 ont la même empreinte des deux côtés**. Le choix
de la copie est donc **indifférent pour le PDF**, et seule *Funk Fusion* fait exception.

### Familles, d'après la forme des noms de pistes

| forme | méthodes |
|---|---|
| le nom commence par un numéro | 109 |
| « Track N » | 2 |
| **le numéro de page imprimée est dans le nom** (`Pg.194`) | **2** — les deux Westwood |
| autre | 2 |
| sans audio | 1 |

Les deux Westwood portent **la page imprimée dans le nom du média**. Rien ne l'exploite
aujourd'hui, et c'est une source de folio que A1b devra regarder.

### Le verrou, et il n'est pas celui que je croyais

**114 méthodes sur 115 ont un vivier borné et s'abstiennent toutes pour la même raison :
`corroboration_insuffisante`. Et 113 ne posent AUCUN élément.**

Ce n'est donc pas « les Aebersold n'ont jamais été traités » : ils l'ont été, leur vivier est
borné, et **l'association s'abstient faute de corroboration**. Le verrou est unique, et il est
exactement ce qu'A2 vise : la corroboration vient de la lecture, et la lecture échoue.

| document | éléments posés | état |
|---|---|---|
| le document du jalon | 96 | **publiés** |
| *'70s Funk & Disco Bass* | 95 | **proposés**, l'association s'abstient |
| les 113 autres | **0** | `corroboration_insuffisante` |

## 5 novembre 2026 — correction de Christophe : le verrou n'est pas la corroboration

**J'ai écrit « le verrou est `corroboration_insuffisante` ». C'est le symptôme, pas la cause.**

Sa correction : **ces 113 méthodes ne proposent AUCUN élément.** Il n'y a donc rien à corroborer —
la lecture des repères ne trouve rien du tout. Dire « l'association s'abstient faute de
corroboration » laisse croire qu'elle a des candidats qu'elle refuse ; elle n'en a aucun.

**Conséquence sur ce qu'il faut mesurer** : sur le banc d'extraits, la voie oracle et A2 se
mesurent **séparément**. L'une cherche les repères sans manière de lire ; l'autre relit ce que
Tesseract a abîmé. Les confondre ferait porter à l'une le résultat de l'autre.

### Le nombre caché dans un nom de fichier : générique, jamais un motif en dur

Deux méthodes portent le folio dans le nom de leur média (`… - 706 Pg.194.mp3`). **La règle ne
doit pas chercher « Pg. »** — ce serait un motif de domaine dans le code générique, et il ne
survivrait pas au premier corpus qui écrit « page », « p. » ou rien du tout.

**Ce qui est générique** : un nom de fichier porte plusieurs nombres ; on cherche **lequel d'entre
eux est corrélé aux folios** du document. C'est le document qui répond, et la règle ne nomme
aucun mot. Même esprit que la borne de fin : la régularité se mesure, elle ne se déclare pas.

## 5 novembre 2026 — le banc d'extraits, rodé sur six méthodes

**Six méthodes, une par famille, extraites hors de toute bibliothèque.** 136 Mo, 57 fichiers,
sept jeux avec celui du rodage. Les archives n'ont pas été touchées.

| méthode | pages du document | pages retenues | médias retenus + en trop |
|---|---|---|---|
| une méthode à vivier serré | 23 | 8 | 2 + 3 sur 11 |
| une méthode à vivier large | 74 | 8 | 2 + 3 sur 20 |
| le document du jalon | 116 | 8 | 6 + 3 sur 52 |
| le recueil à un repère par feuille | 29 | 8 | 3 + 3 sur 99 |
| deux volumes à folio dans le nom | 57 et 86 | 8 et 8 | 6 + 3 sur 92 et 73 |
| le cas sans audio | 35 | 8 | 0 |

### La seule vérité que je connaisse, le critère la trouve

Le document du jalon porte sa liste de pistes **sur la feuille 5** — établi plus tôt dans la
journée par le texte lu (« CD TRACK LISTING … »). **Le banc a retenu la feuille 5**, désignée par
« la plus forte densité de nombres par rapport aux mots ». Aucun mot de domaine n'a servi : ni
« sommaire », ni « track », ni un titre.

Pour les six autres, **je ne connais pas la vérité** et je ne la suppose pas. C'est ce que la
vérification au papier devra établir.

### Une réserve, dite avant d'étendre aux 115

**Peu de médias sont retenus** : 2 à 6 selon les jeux. Ils viennent des nombres lus sur la page
désignée comme liste des pistes ; quand cette page n'en est pas une — ou quand ses nombres sont
mal lus, ce qui est précisément le défaut qu'A2 traite — le compte tombe. Le banc le dit au lieu
de le cacher, et **il faut le corriger avant d'étendre aux 115** : un extrait à deux médias
n'éprouve pas grand-chose.

## 5 novembre 2026 — le banc d'extraits, construit sur 115 méthodes

**115 jeux sur 116**, chacun huit pages choisies par mesure et onze médias — huit retenus, trois
en trop. **7,6 Go**, dont la quasi-totalité est de l'audio : un PDF extrait pèse 5,5 Mo, ses onze
médias 107 Mo. « Un petit bout » vaut pour les pages, pas pour l'audio, et c'est un point à
reprendre si le banc doit voyager.

### Les deux défauts rencontrés, et ce qu'ils apprennent

**Le glob.** Le premier lancement a échoué sur **les 116** : le shell n'a pas développé
`"$D"/*.zip`, et l'outil a reçu le chemin littéral avec l'étoile. Zéro jeu, quatre erreurs. La
liste des archives est maintenant produite par `find` dans un fichier, et la boucle lit ce
fichier — **plus de glob du tout**. Le script saute les jeux déjà faits, donc une interruption ne
coûte rien.

**L'encodage des noms dans une archive.** Une archive sur 116 échoue encore : ses noms internes
ne sont pas en UTF-8, et l'outil les rend avec des points d'interrogation
(`M??thode ?? v??rifier/…`). Ce n'est pas un défaut de l'archive : c'est le format ZIP qui
autorise un encodage ancien, et l'outil en ligne de commande qui ne le devine pas. **À reprendre
par une lecture qui gère l'encodage**, et non par un contournement sur ce nom-là.

### Ce que le banc permet maintenant, et qui n'existait pas ce matin

Mesurer la chaîne sur **tout le corpus de méthodes**, et non sur les deux documents qui
fonctionnent. La voie oracle d'abord — seule, comme Christophe l'a demandé —, puis A2, pour que le
gain d'A2 se lise et ne se suppose pas.

## 5 novembre 2026 — A2, pièce 2 : le déclencheur existe déjà dans le code, et personne ne s'en sert

**Après avoir réfuté mon critère par gabarit, j'ai cherché où « la lecture attendue a échoué » se
décide. C'était déjà écrit.**

`lireLaTable` (`packages/noyau/src/table.ts`) rend, pour toute table lue :

| | |
|---|---|
| `utilisables` | les rangées dont **toutes** les cellules ont été lues et dont aucune n'est suspecte |
| **`incompletes`** | **les rangées à trou, « nommées plutôt que comblées »** |
| **`suspectes`** | les cellules aberrantes, avec leur rangée, leur colonne, leur valeur et **pourquoi** |

Et `cellulesSuspectes` compare chaque valeur **aux autres de sa colonne** — précisément les
« comparables » que Christophe demande, et que mon critère par gabarit cherchait à inventer.

**La voie oracle appelle `lireLaTable` à deux endroits, et n'emploie ni `incompletes` ni
`suspectes`.** C'est le même défaut que la confiance de Tesseract : **le signal est calculé, il
n'est pas employé.** Deux fois dans la même journée, et au même endroit du raisonnement — la
chaîne sait où elle a échoué, et elle ne se le demande pas.

### Ce que cela fixe pour A2

Le repli Vision se déclenche sur **les rangées `incompletes` et les cellules `suspectes`**, et
relit **leur zone** — la boîte de la rangée ou de la cellule, que les mots lus donnent déjà. Rien
à inventer, rien à calibrer, et aucune page entière relue : exactement ce que Christophe a
demandé au point 3 de ses précisions.

**Les quatre éléments perdus du document du jalon sont des rangées incomplètes** : `Workout 12`
avec sa piste illisible, `Workout 17`, `Workout 20`. Le quatrième, `Workout 22`, est un conflit
de pistes — une cellule **suspecte**, pas absente. Les deux catégories sont donc nécessaires, et
elles suffisent.

## 6 novembre 2026 — A2, pièce 2 : la zone sort des mots, pas d'un réglage

`lireLaTable` disait **qu'une** case était en défaut, jamais **où**. Relire voulait donc dire
relire la page entière : le prix d'une page pour rattraper une case. `TableLue` rend maintenant
`aRelire`, une entrée par case en défaut — les cellules non lues des rangées à trou, et les
cellules suspectes — avec sa boîte.

**Tout vient des mots déjà lus.** La bande verticale, des boîtes de la rangée elle-même ; la bande
horizontale, du centre et de l'étendue de la colonne visée, élargis de **ce qu'un nombre occupe
dans ce panneau** — la médiane des largeurs des nombres qui y ont été lus. Aucune constante
géométrique n'entre là : un nombre ne s'écarte pas de sa colonne de plus que sa propre largeur,
et c'est une propriété de la composition, pas un réglage à ajuster document par document.

Une table en deux panneaux garde ses zones dans **son** panneau : les colonnes d'un panneau ne
sont pas celles de l'autre, et une rangée se souvient de la ligne et du panneau dont elle vient.

### Trois règles écrites puis retirées, parce qu'aucun contrôle ne mourait de leur retrait

Douze contrôles, douze mutations. Dix sont mortes du premier coup. **Deux ont survécu**, et une
troisième après coup — et la doctrine du 5 novembre vaut aussi contre moi :

| Ce que j'avais écrit | Pourquoi c'est parti |
|---|---|
| Un dédoublonnage des cases | Une case non lue n'a pas de valeur, donc ne peut pas être suspecte ; et `cellulesSuspectes` ne nomme jamais deux fois la même case. La garde ne protégeait de rien |
| Un tri des zones par position | Personne ne lit cette liste dans cet ordre. L'ordre était déjà déterminé sans elle |
| — | La garde « ce n'est pas une table » **est restée** : un vrai cas la fait mourir (cinq rangées, deux colonnes, une à trou et deux suspectes : deux rangées nettes ne font pas une table, et il n'y a rien à rattraper là) |

Le contrôle du dédoublonnage ne vérifiait rien : il comparait deux cases **différentes**. Il dit
maintenant ce qui est vrai — les deux causes désignent nécessairement deux cases distinctes.

## 6 novembre 2026 — Ce que la voie oracle coûte vraiment : cinq reconnaissances par seconde

Le premier passage du banc sur six familles a donné **1 599 s et 1 101 s pour huit pages** — deux
cents secondes par page, là où les durées mesurées le 5 novembre sur quatre familles donnaient
des médianes de 0,4 à 1,1 s. L'écart n'est pas une lenteur : c'est une autre unité de travail.

Relevé en comptant les processus distincts pendant vingt secondes : **105 appels à Tesseract**,
chacun très court, soit environ **cinq par seconde**. La voie oracle ne lit pas huit pages : elle
éprouve des dizaines de zones candidates × plusieurs façons de lire × un échantillon
d'apparitions, et chaque essai est une reconnaissance sur une fenêtre de quelques dizaines de
pixels. Le compteur `reconnaissances` existe déjà dans le code ; c'est bien le travail prévu.

**Ce que cela change pour la décision des 115 :** environ 22 min par jeu de huit pages, soit
**quarante heures** pour 115 jeux, et non les quinze annoncées hier. L'estimation d'hier venait
d'un jeu dont la voie avait abandonné tôt.

**Ce que cela change pour A2 :** le plafond absolu d'un délai ne peut pas se poser « par page ».
L'unité de la voie oracle est la **fenêtre**, et il y en a des milliers par document. Un délai par
appel, oui ; un plafond par page n'a pas de sens ici.

## 6 novembre 2026 — Mon banc mesurait son propre défaut : une empreinte fabriquée depuis un nom

Quatre des six jeux ont échoué sur un refus de contrat : `pages[n] … /^[0-9a-f]{64}$/`. La cause
était dans **ma mesure**, pas dans le produit — `banc-voie-oracle.ts` fabriquait l'empreinte d'un
média en complétant son **nom** à soixante-quatre caractères. Un nom de fichier n'est pas de
l'hexadécimal. L'empreinte vient maintenant des **octets**.

Deux leçons, et la seconde est la plus coûteuse :

1. **Le refus tombait tard.** Il arrive à la construction de l'écran, donc *après* la
   reconnaissance : vingt minutes de travail par jeu avant d'apprendre que l'entrée était
   invalide. Une donnée inventée doit être refusée là où elle est inventée.
2. **J'avais tronqué le message d'erreur à 160 caractères** dans le rapport, et à 80 à l'écran. Le
   chemin de l'erreur — ce qui nomme la cause — était coupé juste avant le nom du champ. J'ai
   cherché la cause dans le produit pendant un long moment, à cause d'une troncature que j'avais
   écrite moi-même. **Un rapport d'échec ne tronque pas la cause.**

Et les deux jeux qui ont abouti ont dit quelque chose de vrai : Aebersold 001 et 041 rendent
**zéro élément**, avec `medias_non_interpretes` et un doute `maniere_inadaptee`. L'archive
d'Aebersold 041 n'a d'ailleurs **aucun audio** — c'est le « 1 PDF seul » de l'inventaire des 116,
vérifié dans l'archive. Il ne peut pas servir à mesurer une association.

## 6 novembre 2026 — A2, pièce 3 : la relecture d'une zone, et la règle que j'avais écrite à l'envers

`outils/ingestion/src/relire-les-zones.ts` fait le pont qui manquait entre « la table se dit en
défaut » et « quelque chose relit ». Le relecteur est un **port** : ce module n'appelle rien par
lui-même, ne connaît ni réseau ni clé, et sans relecteur il rend les zones qu'il aurait relues et
le compte de ce que l'étape aurait coûté. Les quinze contrôles passent un faux relecteur : aucun
appel en ligne.

Trois règles, et la troisième était fausse à ma première écriture :

1. **On ne relit que la zone**, jamais la page.
2. **Tout appel est tracé** — celui qui n'a rien rendu comme celui qui a rendu, et ce qu'il a
   rendu quand ce n'était pas un nombre. Le coût de l'étape est le compte des appels.
3. **Une valeur relue ne remplace que ce que la table a elle-même déclaré suspect.**

J'avais écrit la troisième « ne remplace jamais une valeur lue ». Elle ne tient pas : une cellule
suspecte est **déjà remplie**, et ajouter la valeur relue à côté ne faisait rien du tout — la
table garde la première valeur qu'elle range dans une cellule, donc la mauvaise. Le contrôle de la
cellule suspecte a attrapé cela : elle restait suspecte après sa relecture. La règle juste est
plus étroite et plus utile : le démenti est autorisé **par le constat de la table**, et jamais
ailleurs. Les deux lectures restent au rapport (`lu`, `retenu`, `remplace`).

### Deux règles retirées, une garde gagnée

| Ce que j'avais écrit | Verdict |
|---|---|
| `centreColonne` sur chaque zone, « pour que la valeur relue retombe au bon endroit » | **Retiré.** Il vaut toujours `zone.x` plus une demi-largeur de nombre, et cet écart ne peut jamais faire changer de colonne : la tolérance est la moitié de l'écart entre colonnes, qui n'est jamais plus petit qu'une largeur de nombre. Aucune mutation ne mourait |
| Une condition de remontage en deux moitiés | **Simplifiée.** Un démenti ne survient jamais sans l'ajout qui le remplace, sur la même page : la seconde moitié ne pouvait pas servir |
| La garde « le mot d'origine est introuvable » | **Gardée, et désormais éprouvée.** Le cas existe : `colonnesDeNombres` coupe un groupe à une largeur et demie, `rangeesDeTable` range jusqu'à la moitié de l'écart entre colonnes. Entre les deux il y a de la place — avec des colonnes très écartées, un nombre égaré forme son propre groupe, trop petit pour être une colonne, et se retrouve pourtant rangé dans la colonne voisine. L'étendue de la colonne l'ignore, donc la zone ne le contient pas. On ne remplace alors rien, et on le dit |

**Sur les trois commits d'A2, cinq règles écrites par moi sont parties et deux ont été gardées
parce qu'un vrai cas les tue.** La doctrine du 5 novembre ne vaut pas seulement contre les
constantes du produit.

## 6 novembre 2026 — A2 : mesurer avant de dépenser une clé, et ce que la page a dit

Avant d'appeler Vision, j'ai demandé à **Tesseract lui-même** de relire les cases que la table dit
en défaut : la même reconnaissance, mais sur **la zone seule et en segmentation serrée** au lieu
de la page entière en blocs. Quatre manières — ligne (7), mot (8), mot ×3, bloc (6) ×3 —, chacune
mesurée à part. L'agrandissement est une duplication de pixels : aucun pixel n'est inventé.

**Coût : 61 à 67 ms par case.** Sans commune mesure avec un appel en ligne. Mais le résultat
n'est pas celui que j'espérais, et c'est la page rendue en PNG qui l'a tranché.

### Une seule lecture rend des nombres parfaitement formés et parfaitement faux

Sur la table réelle « CD TRACK LISTING » (22 cases en défaut), les lectures isolées donnent :

| Case | Vérité imprimée | Ce qu'une manière a lu |
|---|---|---|
| rangée 15, colonne 2 | 13 | **« 171 »** par la ligne, « a1 » par le bloc |
| rangée 43, colonne 2 (lue 82) | 32 | **« 327 »** par la ligne, « 3) » par le bloc |
| page 4, rangée 11 (lue 110) | 110 | **« 710 »** par le bloc |

Rien dans le texte ne distingue « 171 » d'une bonne lecture. Une règle qui retient le premier
nombre venu aurait publié trois valeurs fausses pour en rattraper trois justes.

### L'accord entre manières sépare les deux, et il le fait sans réglage

Deux manières qui lisent le même nombre ne se trompent pas de la même façon. C'est le principe du
vote déjà employé sur les marques, appliqué ici :

**3 valeurs retenues, 0 contradiction, 19 sans accord** sur 22 cases.

Et les deux valeurs retenues sur de vraies lignes de la table sont **exactement justes**,
vérifiées sur la page rendue : Workout 20 → piste **20**, page **44**. Les trois lectures
dangereuses ci-dessus sont toutes **écartées faute d'accord**.

### Deux défauts que cette mesure a mis au jour

**La page 8 n'est pas une table.** Le détecteur y voit « 2 colonnes, 50 rangées » : c'est le
**chapitre 1, Workout 1**, et les colonnes sont les chiffres de la tablature. Dix cases y ont été
relues pour rien. Vérifié en rendant la page en PNG — deux minutes, comme le veut la règle.

**Les rangées fantômes.** `rangeesDeTable` construit une rangée par **ligne de la page** pour
**chaque panneau**. Sur une page dont les panneaux n'ont pas la même longueur — ici trente
enregistrements à gauche, vingt-deux à droite —, le panneau court reçoit des rangées sur des
lignes où il ne porte rien. Si un nombre voisin s'y égare, la rangée devient « à trou » ou
« suspecte » et engendre un appel sur du vide. La troisième valeur retenue est de celles-là.

**Compté : 5 des 22 cases en défaut de cette page** tombent sur une rangée sans intitulé et à
cellule unique — presque un quart des appels dépensés sur du vide, et sur la seule page du
document qui porte une vraie table. Ce n'est pas corrigé : c'est mesuré, et la correction touche
`rangeesDeTable`, qui porte déjà la lecture de toutes les tables du produit.

### Ce que cela décide pour A2

La relecture locale **rattrape**, et presque gratuitement, mais seulement là où la page n'avait pas
complètement échoué. Sur les cases vraiment abîmées — celles de Christophe — les quatre manières
rendent du bruit sans jamais s'accorder. **C'est l'argument pour Vision, et il est maintenant
mesuré au lieu d'être supposé** : la relecture locale d'abord, gratuite ; Vision ensuite, sur ce
qui reste sans accord, et seulement là.

## 6 novembre 2026 — La voie oracle sur six familles du banc : le tableau, et ce qu'il ne mesure pas

Voie oracle **seule**, sans A2, sans relecture ciblée, sans aucun appel en ligne — la référence
d'avant A2 que Christophe a demandée le 5 novembre.

| Jeu | pages | méd | élém | folios | porteuses | lecture | min | abstention |
|---|---|---|---|---|---|---|---|---|
| '70s Funk & Disco Bass | 8 | 11 | **28** | 8 | 8 | ocr 7 | 2 | corroboration insuffisante |
| Aebersold 001 | 8 | 11 | 0 | 0 | 0 | ocr 8 | **28** | aucun repère |
| Aebersold 002 | 8 | 11 | **6** | 3 | 6 | ocr 8 | 26 | corroboration insuffisante |
| Aebersold 041 | 8 | **0** | 0 | 0 | 0 | ocr 8 | 19 | aucun repère |
| Bass Aerobics (le jalon) | 8 | 11 | 1 | 1 | 1 | ocr 7 | 9 | corroboration insuffisante |
| Paul Westwood 1 | 16 | 11 | 1 | 1 | 1 | ocr 7 | 2 | corroboration insuffisante |

### Ce que le tableau ne mesure pas, et qu'il serait faux de lui faire dire

Le document du jalon publie **48 liens** dans la vraie bibliothèque, et rend **1 élément** ici. Ce
n'est pas une régression : c'est **arithmétiquement impossible autrement**. Son extrait porte 8
pages sur 116 et 11 médias sur 52 ; le seuil de corroboration pour un vivier de onze est de
**huit lignes à recouper**, et les repères ne peuvent venir que des huit pages retenues. La table
des pistes y liste bien ses cinquante-deux enregistrements — aucun n'a de repère à confronter.

**Le banc mesure si la chaîne s'engage avec la structure d'un document** — table trouvée, folios
lus, éléments proposés. **Il ne mesure pas ce qu'elle publierait.** Lire « 28 pour Funk contre 1
pour Bass Aerobics » comme un classement serait l'erreur exacte : dans la vraie bibliothèque c'est
l'inverse. Pour les liens publiés, il faut les documents entiers.

### Trois choses que le tableau apprend, elles

**Aucune page de ces six documents n'a de couche texte lisible.** `couche 0` partout, 45 pages
reconnues sur 45. La mesure du 30 octobre sur dix-sept documents se confirme sur six familles
différentes.

**Le coût est inversement lié au succès.** Funk trouve 28 éléments en 2 minutes ; Aebersold 001
n'en trouve aucun en 28. Quand un endroit l'emporte tôt, l'exploration s'arrête ; quand rien ne
l'emporte, elle essaie tout. Le code le disait déjà — « jusqu'à 182 essais et 839 s pour conclure
qu'il n'y a rien » — et la mesure le confirme sur d'autres documents.

**Moyenne réelle : 14 min par jeu, soit 27 heures pour 115 — et non les quarante que j'ai
annoncées il y a deux heures.** Mon extrapolation partait des jeux lents. Les six donnent 86
minutes en tout.

### Deux défauts

**Dix-neuf minutes dépensées sur un document sans vivier.** Aebersold 041 n'a aucun média — son
archive est un PDF seul. Rien n'aurait pu être publié, et la voie oracle a tout de même exploré
ses huit pages. Le vivier n'est regardé qu'à la fin, par `corroborerParTable` ; il devrait l'être
avant la première reconnaissance.

**L'abstention nomme la mauvaise cause.** `medias_non_interpretes` s'affiche quand la voie oracle
n'a trouvé **aucun repère sur les pages** — rien à voir avec les médias. Un lecteur qui lit
« médias non interprétés » sur l'écran Vérifier ira regarder ses noms de fichiers, alors que le
document ne porte simplement pas de numérotation lisible. C'est le cas d'Aebersold 001 **et** 041,
dont l'un a onze médias et l'autre aucun : la même phrase pour deux situations opposées.

## 6 novembre 2026 — Ce que la relecture locale rattrape vraiment : +1, et non +4

Mesuré au niveau où le gain se décide, **sans toucher à la chaîne** : une rangée de table devient
utilisable quand toutes ses cellules sont lues et qu'aucune n'est suspecte. On compte les rangées
utilisables avant et après la relecture, et on n'attribue ainsi à A2 aucun effet venu d'ailleurs.

Sur la table réelle du document du jalon :

| | |
|---|---|
| Rangées utilisables | **43 → 44 (+1)** |
| Valeurs retenues | 4 sur 22 cases en défaut |
| Coût | 4 appels par case, **61 ms par appel** |

**Christophe attendait 48 → 52. La relecture locale seule donne +1.** Voici pourquoi, case par
case :

| Case | Ce qui s'est passé |
|---|---|
| rangée 24, colonnes 2 et 3 | **les deux cellules comblées** (piste 20, page 44) → la rangée devient utilisable |
| rangée 16, colonne 3 | page **28** comblée — mais sa colonne 2 reste un trou, donc la rangée ne sert toujours pas |
| rangée 52, colonne 1 | une rangée fantôme : rien n'y était |

La rangée 16 est **le Workout 12** de Christophe. Sa page a été rattrapée ; **sa piste, non** — les
quatre manières n'ont jamais lu deux fois le même nombre à cet endroit. C'est exactement la case
que Vision doit relire, et on sait maintenant la désigner.

**Ce que la mesure établit** : la relecture locale est presque gratuite et elle comble les cases
qui n'étaient qu'abîmées. Elle ne suffit pas pour les cases détruites, et une rangée ne sert que
si **toutes** ses cellules sont lues — combler une cellule sur deux ne rapporte rien. Vision a
donc un rôle précis, borné, et chiffrable : les cases restées sans accord, et elles seules.

## 6 novembre 2026 — Le nombre dans le nom : trois propriétés écrites, deux fausses, et un signal rare

Christophe a demandé d'exploiter « de façon générique » le nombre que certains noms de MP3
portent — un numéro de page imprimée —, « jamais par un motif *Pg.* en dur ». J'ai donc relevé,
pour chaque **place** où un nombre apparaît dans les noms d'un même vivier, la suite de ses
valeurs, et demandé à cette suite si elle se comporte comme une pagination. Trois propriétés.
**Deux sont fausses, et c'est un vivier réel qui les a tuées.**

| Propriété | Verdict |
|---|---|
| **elle monte** avec l'ordre des enregistrements | **Tient.** C'est la seule |
| ses valeurs **sont distinctes** | **Fausse.** Deux pistes consécutives portent le même numéro imprimé — elles sont sur la même page. Cette propriété décrit un **rang de piste**, pas une page |
| elle **tient dans le document** | **Fausse.** Elle compare un numéro **imprimé** à un compte de **feuilles**, et rejette donc exactement les documents où le signal sert : un recueil annonçant « page 67 » à « page 196 » sur cinquante-sept feuilles numérisées est le cas même qu'on cherche |

Un défaut de plus, de méthode : **je comptais les places depuis le début du nom**. Un vivier dont
les titres portent eux-mêmes des nombres n'a pas le même nombre de nombres d'un nom à l'autre —
« 12_8 Blues » en ajoute deux — et la page, toujours dernière, change alors de rang. Compter
**aussi depuis la fin** ne suppose rien de plus qu'un nom qui finit par ce qu'il désigne. Avec ce
comptage, le signal apparaît : `avant-dernière 0 → [67 76 94 106 …]`.

### Mais il est rare, et c'est ce qui décide de la priorité

| Places de nombre dans les noms | Viviers |
|---|---|
| **une seule** — le rang de piste, et rien d'autre | **88** sur 115 |
| deux | 24 |
| quatre | 1 |
| huit | 1 |

**Quatre-vingt-huit viviers sur cent quinze ne portent qu'un seul nombre dans leurs noms.** Ils ne
peuvent pas porter de page. Le signal que Christophe a repéré est réel, et il concerne une
poignée de documents — deux, richement numérotés, plus quelques-uns à deux places dont la seconde
appartient au titre.

**Ce que cela décide** : la corrélation nom ↔ folios reste à faire, mais elle ne devient jamais un
mécanisme général. Elle vaut comme **second signal pour les quelques documents qui le portent**, et
construire pour elle ce qu'on construirait pour cent quinze serait se tromper d'effort.

**Et aucune propriété des noms seuls ne désigne la page.** Avec « elle monte » pour seul critère,
114 viviers sur 115 ont une place candidate — y compris le numéro de disque, constant. Ce qui
distingue la page du rang de piste, ce sont **les folios lus**, et rien d'autre : la confrontation
que Christophe a nommée n'est pas un raffinement du mécanisme, elle **est** le mécanisme.

## 6 novembre 2026 — A2 sur un livre entier : 99,5 % du coût part dans des pages qui ne sont pas des tables

Le document du jalon, 116 pages, relecture locale sur **toutes** ses cases en défaut :

| | |
|---|---|
| Tables détectées à cases en défaut | **57** |
| Rangées utilisables | 87 → **96 (+9)** |
| Appels de reconnaissance | **23 284** |
| Durée | **1 414 s, soit 23 minutes** |

Et voici où cela part :

| | cases en défaut | gain |
|---|---|---|
| Pages 1 à 5 — dont **la seule vraie table**, la liste des pistes | **27** | **+1 rangée** |
| Pages 6 à 116 — le corps du livre, en tablature | **5 794** | +8 rangées |

**99,5 % des cases, 23 176 appels sur 23 284, et 1 414 secondes sur 1 420, vont à des pages qui
ne portent aucune table.** Ce sont les chiffres de la tablature, alignés en colonnes sur
cinquante rangées : exactement ce que `colonnesDeNombres` cherche. Vérifié à l'œil sur la page 8,
rendue en PNG — c'est le chapitre 1.

Les « +8 rangées » gagnées là ne valent rien non plus : une rangée utilisable de tablature n'est
pas un enregistrement.

### Ce que cela décide, et c'est un renversement de priorité

**Le repli Vision ne doit pas être branché avant que le détecteur de table cesse de voir des
tables dans la musique.** Branché aujourd'hui, il dépenserait son budget à mille contre un sur des
pages de partition — et la facture serait réelle, elle.

Le détecteur a besoin d'une question qu'il ne pose pas : **ces colonnes de nombres forment-elles
des enregistrements ?** Une liste de pistes a des intitulés répétés, des valeurs bornées par le
vivier, une colonne qui suit les folios. Une tablature n'a rien de cela — ses nombres sont des
cases de manche, entre 0 et une vingtaine, sans intitulé et sans ordre croissant d'une rangée à
l'autre. Rien de tout cela n'est propre à un domaine : ce sont des propriétés de la **forme**.

Le chiffrage est fait, et il vaut pour la décision : **23 minutes et vingt-trois mille
reconnaissances pour un livre, afin de gagner une rangée dans la seule table qui compte.**

## 6 novembre 2026 — Deux défauts d'abstention, corrigés sur décision de Christophe

Les deux défauts avaient été **mesurés** sur le banc des 115 méthodes le 5 novembre, rapportés
sans être corrigés, et Christophe a tranché : les corriger, test rouge d'abord.

### Le vivier était regardé à la fin

`rejouerParOracle` connaît le compte des enregistrements à sa deuxième ligne. Il ne s'en servait
qu'à la fin, quand `corroborerParTable` examine le vivier. Entre les deux : le rendu de chaque
page, les formes sombres, l'élection des endroits, les reconnaissances. **Aebersold 041 — zéro
enregistrement — a été exploré dix-neuf minutes** pour conclure ce que son vivier disait avant la
première page.

Le contrôle rouge l'a dit sans qu'on ait à le croire : il a **expiré à 5 s et la série a duré
82 s**. Avec la porte, **0,5 s**. Le contrôle ne vérifie pas un temps — il vérifie qu'aucune
feuille n'est regardée (`avancement` n'est jamais appelé) et qu'aucune forme n'est cherchée.

### La cause nommée était fausse

`medias_non_interpretes` était rendue pour un document portant onze enregistrements **et** pour un
document n'en portant aucun. L'écran écrivait dans les deux cas « aucun des médias présents n'a pu
être interprété » : faux dans le premier cas — les enregistrements n'y sont pour rien, la lecture
n'a trouvé aucun repère — et sans objet dans le second. Qui lit ne pouvait pas savoir s'il devait
déposer des enregistrements ou changer de manière de lire.

Trois causes là où il y en avait une :

| Cause | Ce qui s'est passé | Ce que l'écran propose |
|---|---|---|
| `aucun_media` | le vivier est vide | déposer ce document avec ses enregistrements |
| `aucun_repere_lu` | la lecture n'a trouvé aucun repère | choisir une autre manière de lire |
| `medias_non_interpretes` | des enregistrements lus, dont cette manière ne fait rien | choisir une autre manière de lire |

La cascade de conditions de `instantane.ts` est devenue **une table, une entrée par cause**.
Confondre deux causes égare qui lit, et c'est arrivé deux fois : une cause de plus s'écrit
maintenant en une ligne, sans toucher au reste.

### Contre-épreuve par mutation

| Mutation | Ce qui meurt |
|---|---|
| la porte du vivier retirée | le contrôle expire à 30 s — toute sa valeur est le coût |
| la cause redevient `medias_non_interpretes` | `expected 'medias_non_interpretes' to be 'aucun_media'` |
| les trois lignes de la table fondues en une | les trois libellés d'écran |

Restauré octet pour octet après chaque mutation.

## 6 novembre 2026 — Ce qui distingue une table d'une page qui n'en est pas une

Priorité posée par Christophe : **le détecteur doit cesser de voir des tables dans la musique
avant qu'on branche Vision**. Critères de forme seulement, éprouvés sur au moins trois familles.

### L'instrument avant la conclusion

La reconnaissance d'un livre de 116 pages coûte vingt minutes. Éprouver une idée ne doit pas les
coûter à nouveau : les mots de **250 pages** — le livre du jalon entier plus seize familles de la
bibliothèque d'essai — ont été lus une fois et gardés. Tout ce qui suit se rejoue en une seconde.

Le volume externe a décroché en cours de première passe et a emporté cinquante-sept pages déjà
reconnues. Le programme écrit désormais après **chaque** document.

### La vérité de terrain, et d'où elle vient

Le texte trie, **l'image tranche**. Chaque page porte la source de sa vérité, et **le rappel ne se
mesure que sur des pages confirmées à l'image**.

| catégorie | familles confirmées à l'image |
|---|---|
| liste de pistes | Bass Aerobics p5 (52 enregistrements, 2 panneaux), Vol 5 FUNK p2, Bach p2 |
| partition | 70s Funk & Disco p9, Keith Rosier p10, Bass Aerobics p8, Westwood 2 p9 |
| sommaire | Bass Aerobics p4, Funk Fusion p3, Jon Liebman Funk Fusion p2 |
| catalogue | Aebersold 008 p5 — une vraie table dont aucune valeur ne peut désigner un enregistrement |

### Deux taux, et jamais un seul

Rejeter une fausse table économise des reconnaissances ; manquer une vraie liste **perd des
liens**. Les confondre dans un seul chiffre les rend tous les deux invisibles.

| règle | pages gardées | cases à relire | listes gardées | partitions gardées |
|---|---|---|---|---|
| l'actuelle — 2 colonnes, 4 rangées | 87 | **6 578** | 4/4 | 4/5 |
| **la retenue** | **12** | **176** | **4/4** | **0/5** |

**−97,3 % du coût, sans perdre une liste et sans garder une partition confirmée.**

### La règle retenue, et ce que chaque critère gagne

Une table d'enregistrements, dit en forme et sans une constante choisie :

1. **une suite de rangées à pas constant** — la tolérance est la hauteur d'une rangée, que la page
   imprime elle-même ; c'est elle qui dit *quelles rangées sont la table* ;
2. **au moins un enregistrement complet** parmi elles — une rangée qui remplit toutes ses
   colonnes ; ce n'est pas un seuil, c'est un « il en existe » ;
3. **au moins une colonne dont toutes les valeurs tiennent dans le vivier** — un nombre qui
   désigne un enregistrement ne peut pas dépasser leur compte.

Contre-épreuve, une mutation à la fois :

| privée de… | pages | cases | listes | partitions |
|---|---|---|---|---|
| rien | 12 | 176 | 4/4 | 0/5 |
| la suite à pas constant | 20 | 338 | **3/4** | 0/5 |
| l'enregistrement complet | 29 | **2 991** | 4/4 | 0/5 |
| la colonne dans le vivier | 15 | 218 | 4/4 | **1/5** |

**La suite gagne sa place pour une raison que je n'avais pas prévue.** Je la croyais là pour
trancher ; elle est là pour dire *sur quoi les deux autres se calculent*. Sans elle, les nombres
du pied de page de Bach — l'adresse de l'éditeur, 7777 et 53213 — entrent dans le test du vivier
et **font perdre une vraie liste**.

L'enregistrement complet vaut dix-sept fois le prix. Le vivier rattrape la partition la plus dure :
Westwood 2 p9, dont les numéros d'exercice en marge sont parfaitement réguliers et parfaitement
hors du vivier.

### Trois règles écrites et réfutées par la mesure

- **« la moitié des rangées sont pleines »** : perd Bach p2, dont deux rangées sur dix-sept
  seulement sont complètes. Une vraie liste mal reconnue reste une vraie liste.
- **« ne relire que les rangées de la suite »** : la liste du jalon a 52 enregistrements et sa plus
  longue suite n'en fait que 13 — les intertitres de chapitre cassent le pas. Ses cases en défaut
  tomberaient de 22 à 3, en abandonnant 39 rangées de vraie table.
- **« ne relire que les rangées posées sur la grille »** : même défaut, 24 rangées sur 52.

Les cases à relire restent donc celles de **toute la page** ; c'est la page entière qui est
retenue ou écartée.

### Et le troisième critère de Christophe

« Une colonne qui suit les folios » **ne gagne pas sa place** : le vivier suffit, et aucune
mutation ne la réclame. Elle n'est pas écrite. Son idée reste vraie — c'est elle qui distingue la
page du rang de piste — mais elle appartient à la corrélation nom ↔ folios, pas au détecteur.

Rappel d'une règle déjà réfutée le 5 novembre, et qu'il ne faut pas ressusciter : **« les valeurs
tiennent dans le nombre de feuilles » est faux**. Vol 5 FUNK renvoie à la page 57 dans un extrait
de douze feuilles. Le folio n'est pas la feuille.

### Contre-épreuve de dégradation : ce que le critère coûterait si la lecture se dégradait

Demandée par Christophe le 6 novembre 2026. « Au moins un enregistrement complet » tient tant
qu'une rangée survit entière. Si la reconnaissance abîme **chaque** rangée, il n'en reste aucune.

L'épreuve retire une case par rangée dans les mots réellement lus, en tournant de colonne en
colonne — retirer toujours la même ne dégraderait pas la table, cela supprimerait une colonne.

| page | colonnes intactes → dégradées | la règle garde ? | l'adoucissement garde ? |
|---|---|---|---|
| Bass Aerobics p5 (52 enregistrements) | 3 → **3** | **oui** | oui |
| Bach p2 | 3 → **2** | **oui** | oui |
| Vol 5 FUNK p2 (8 rangées) | 3 → **1** | non | **non** |

**Le critère n'est pas le coupable.** Vol 5 FUNK p2 tombe à une seule colonne : elle n'est plus
une table pour personne — ni pour la règle retenue, ni pour l'ancienne qui exigeait déjà deux
colonnes, ni pour l'adoucissement à l'étude.

**L'adoucissement est donc écarté**, mesuré et non supposé : sur la vérité de terrain il ne sauve
aucune liste et ne rejette aucune partition de plus, et il coûte **2 991 cases au lieu de 176**,
dix-sept fois.

### Ce que la contre-épreuve a trouvé par la bande

`LIGNES_POUR_UNE_COLONNE = 4` est **un nombre choisi**, et c'est lui qui fait perdre Vol 5 FUNK p2
sous dégradation : une table de huit rangées qui perd un tiers de ses cases passe sous ce plancher
et ses colonnes cessent d'exister. C'est une infraction à la doctrine du 5 novembre, antérieure à
ce travail, et elle porte **toute** la lecture de table du produit. Signalée, pas touchée ici.

### Les appelants, et ce que le paramètre vaut pour chacun

| appelant | ce qu'il passe |
|---|---|
| `voie-oracle.ts` — tables confrontées aux marques lues | le compte des enregistrements du document |
| `voie-oracle.ts` — même chose, voie sans manière de lire | le même |
| `relire-les-zones.ts` — les cases en défaut d'A2 | celui que son appelant lui donne |

Selon ce que la page est :

- **liste de pistes** — exactement le bon critère ;
- **sommaire** — ses colonnes sont des folios, pas des enregistrements. Le critère les garde quand
  un folio tient sous le compte (la page 4 du jalon : 5 ≤ 52, cinq cases). Inoffensif, mais c'est
  un hasard, pas une justesse ;
- **bibliothèque sans enregistrement** — aucune colonne ne peut tenir dans un vivier vide, donc
  plus aucune page n'est une table. La voie oracle s'arrête avant (la porte posée le même jour),
  mais `relireLesZones` est appelable ailleurs. Le cas est nommé dans le contrat lui-même.

Le paramètre porte désormais son sens : `CeQueLaTablePeutDesigner`, champ `enregistrements`, et
l'appel se lit `lireLaTable(mots, { enregistrements: medias.length })`.

### Deux notes pour la suite, nées de cette mesure

**`LIGNES_POUR_UNE_COLONNE = 4` passe en priorité haute du recensement des seuils**
(`docs/seuils-en-dur.md`), avec son effet mesuré. Sur les 116 archives de la collection, **une
seule porte quatre enregistrements ou moins — et elle en porte zéro** : le trou de rappel qu'il
ouvre pour les petits viviers est vide aujourd'hui. Ce qu'il borne n'est pas le vivier, c'est **la
hauteur de la table**. À reprendre dans le lot des rangées fantômes : les deux touchent
`colonnesDeNombres` et `rangeesDeTable`, donc toute la lecture de table du produit.

**Pour A1b, à consigner avant d'y revenir** : un sommaire lu pour ses folios se juge avec
`enregistrements = nombre de feuilles`. C'est la même fonction, le même critère, et un sens
différent — ce que la table désigne alors n'est pas un enregistrement mais une page. Le contrat
le permet déjà sans une ligne de plus : il demande *ce que la table peut désigner*, et non *le
vivier*. C'est pour cela qu'il porte ce nom.

### Les viviers de la collection, les 116

Relevé du 5 novembre, recompté le 6. **1 979 enregistrements**, médiane **13**.

| vivier | archives | cumul |
|---|---|---|
| 0 | 1 | 1 |
| 7 | 1 | 2 |
| 8 | 2 | 4 |
| 9 | 20 | 24 |
| 10 | 11 | 35 |
| 11 | 11 | 46 |
| 12 | 10 | 56 |
| 13 | 20 | 76 |
| 14 | 9 | 85 |
| 15 | 5 | 90 |
| 16 | 2 | 92 |
| 17 | 3 | 95 |
| 18 | 2 | 97 |
| 20 | 3 | 100 |
| 12 | `42f5f229`, un délai égal au coût est un tirage au sort | « Push autorisé (inscris-le) » | message de Christophe dans la fenêtre de la session, 7 novembre 2026. Contrôle accepté avant (3005 lus, 1 rouge épinglé, charge 6,27, index à deux fichiers) ; **premier lot dont la copie de travail aussi était ramenée à l'état du commit**, le travail du lot Vision mis à l'abri sur la branche locale `sauvegarde/lot-vision-07nov` |
| 11 | `24417e48`, le masque situe un motif sans le lire | « Push autorisé dès le contrôle accepté » | message de Christophe dans la fenêtre de la session, 7 novembre 2026. Premier lot vérifié avec **l'index préparé avant le contrôle** : 3005 lus, 1 rouge épinglé, charge 4,58, index à cinq fichiers — donc le contrôle a jugé exactement ce qui part |
| 10 | `3905891b`, aucun fichier suivi n'importe un fichier non suivi | « Push de 3905891b autorisé : inscris-le dans le même geste, puis rapporte la CI » | message de Christophe dans la fenêtre de la session, 7 novembre 2026. Contrôle accepté avant (3003 lus, 1 rouge épinglé, charge 5,67) ; contenu vérifié par `git show --name-only` — trois fichiers, `aides/pdf.ts` exclu |
| 9 | `786a60d4` (le module que `index.ts` exportait sans qu'il existe) et `6d235943` (le garde-fou ne lit plus les chaînes comme du code) | « Push autorisé dès le contrôle accepté » — les deux réparations d'une même branche cassée, vérifiées par **un seul** contrôle sur l'arbre les portant toutes deux, puis commitées séparément | message de Christophe dans la fenêtre de la session, 7 novembre 2026, contrôle accepté avant (2992 lus, 1 rouge épinglé, lancé à charge 6,62) |
| 8 | `1f5f3379`, aucune promesse dans une condition | « Push de 1f5f3379 autorisé : inscris-le dans le même geste, puis rapporte la CI sur ce commit précis » | message de Christophe dans la fenêtre de la session, 6 novembre 2026. Contrôle local accepté avant (2989 lus, 1 rouge épinglé), **mais il a vu l'arbre entier** : la garantie de l'état commité seul vient de la CI sur ce commit |
| 21 | 1 | 101 |
| 22 | 2 | 103 |
| 23 | 1 | 104 |
| 25 | 2 | 106 |
| 30 | 1 | 107 |
| 33 | 2 | 109 |
| 37 | 1 | 110 |
| 52 | 1 | 111 |
| 73 | 1 | 112 |
| 92 | 1 | 113 |
| 99 | 3 | 116 |

| tranche | archives |
|---|---|
| aucun enregistrement | 1 |
| **1 à 4** | **0** |
| 5 à 8 | 3 |
| 9 à 12 | **52** |
| 13 à 20 | 44 |
| 21 à 50 | 10 |
| 51 et plus | 6 |

**La moitié de la collection tient entre neuf et douze enregistrements.** Six documents en portent
plus de cinquante : les trois à 99, Westwood 1 à 92, Westwood 2 à 73, et le jalon à 52. Ce sont
exactement les six qui coûteront le plus cher à Vision, et les seuls dont une table puisse porter
assez de rangées pour corroborer seule.

Et le seuil de corroboration — `Math.min(vivier, Math.max(8, vivier / 2))` — vaut **8** pour les
cinquante-deux documents de la tranche 9 à 12, c'est-à-dire pour la moitié de la collection.

## 6 novembre 2026 — PORTE : Vision active par défaut, sans plafond en euros

**Question posée à Christophe dans la fenêtre de la session, réponse reçue le 6 novembre 2026.**

D'où venait le plafond sur la voie oracle ? De nulle part :

```ts
const plafond = recette.vision?.zones_max_par_lot ?? 0;
```

Sans recette, il vaut **zéro** et `relire` refuse toutes les zones avec la raison `budget`.
**Vision n'était pas sans budget sur la voie oracle : elle était éteinte**, et c'est pourquoi rien
n'avait jamais cassé — le repli n'a jamais tourné une seule fois.

| | Décidé |
|---|---|
| **Par défaut** | Vision **active**, **aucun plafond en euros** — conforme à l'exigence 0 (30 octobre, rappelée le 4 novembre) et à « pas de plafond fixe » (5 novembre) |
| **Nombre de zones** | borné par ce que le document donne : `enregistrements × colonnes`. Relire plus de cases qu'il n'y a d'enregistrements à désigner ne peut produire aucune rangée de plus. Ce n'est pas un nombre choisi |
| **Désactivation** | une bibliothèque peut éteindre Vision ou poser un plafond par une **donnée explicite** de sa description |
| **Plafond atteint** | les cases concernées portent `relecture_non_faite` avec leur raison, **visibles dans le rapport et sur Vérifier, jamais silencieuses**. Classé « doute sur la lecture », **sans effet sur la borne de fin** |

### Le silence existait déjà, en amont de Vision

`relire` produit correctement ses `nonRelus`, chacun avec sa raison — `budget`, `cout`,
`recadrage`. **Personne ne les lit.** Cherché dans tout le dépôt : ils n'apparaissent que dans
leurs propres contrôles. Les cases refusées par un plafond sont nommées, puis jetées.

`EtatDoute` n'a aucun état pour ce cas : `relecture_non_faite` est à écrire, contrôle rouge
d'abord.

## 6 novembre 2026 — Le contrôle attrape ce que 250 pages de mesure ne pouvaient pas voir

Le contrôle complet a **refusé** le lot du détecteur. Deux régressions, toutes deux de ma main.

### Un mot de domaine dans un commentaire

`packages/noyau/src/table.ts` employait « exercice » et « partition ». La règle 1 de `CLAUDE.md`
le dit mot pour mot — « ni dans le code, ni dans les commentaires, ni dans les exemples » — et
j'y suis tombé en décrivant honnêtement ce que la mesure avait montré. Le garde-fou CLA-01 l'a vu.

### Présents et interprétés : deux comptes, et je lisais le mauvais

La porte du vivier posée le matin même lisait `medias.length`. Ce n'est **pas** le nombre
d'enregistrements présents : `mediasDuDossier` et `mediasDeLInventaire` écartent tout fichier
dont le nom ne livre pas de numéro de piste. Un fichier `a.mp3` est bien là et disparaît du
compte — et la voie répondait alors « ce document ne porte aucun enregistrement ».

**C'est la confusion même que les trois causes d'abstention existaient pour défaire, revenue par
la porte posée pour la corriger.** Quatre contrôles de `voie-oracle.test.ts` l'ont dit : ils
éprouvaient le budget d'exploration avec un vivier qu'ils croyaient plein.

Ma mesure sur 250 pages ne pouvait pas l'attraper : **les vrais noms de fichiers portent tous un
numéro.** Seul le contrôle, avec ses décors volontairement pauvres, pouvait le voir.

| cas | cause rendue |
|---|---|
| le document ne porte aucun enregistrement | `aucun_media` |
| il en porte, aucun nom ne se laisse lire | `medias_non_interpretes` |
| il en porte, on les lit, aucun repère sur ses pages | `aucun_repere_lu` |

Et le journal dit désormais les deux comptes quand ils diffèrent : « 3 enregistrement(s) dans le
vivier de ce document, dont 0 interprété(s) ».

### Le seuil de corroboration de 8 : ce qu'on sait, et ce qu'on ne sait pas

Christophe demande combien de méthodes du banc échouent sous ce seuil **tout en lisant des
rangées justes**. **La donnée n'existe pas, et il faut le dire avant de la chercher.**

**Le banc des 115 est nul.** Son fichier de résultats porte 115 entrées, et **les 115 sont des
erreurs** — l'épreuve du 5 novembre où ma propre fabrication d'empreintes invalidait les jeux.
Le défaut a été corrigé, la course n'a jamais été refaite sur les 115.

**Et le banc des 6, qui a tourné, ne peut pas répondre.** Quatre de ses six jeux s'abstiennent
pour corroboration insuffisante — mais leurs extraits portent **huit pages sur cent seize**. Le
seuil demande huit rangées de table à recouper ; la page qui porte la table n'est pas dans
l'extrait, par construction. Ces quatre abstentions ne disent rien du seuil : elles disent que le
banc mesure l'engagement avec la structure, pas la publication.

**Ce qu'il faudrait** : la voie oracle sur des documents **entiers**. Ils sont là — 115 PDF
complets dans le bac de la session. Le coût mesuré est de **quatorze minutes par document**, soit
**vingt-sept heures** pour les 115. Sur les six documents de plus de cinquante enregistrements —
les seuls dont une table puisse porter assez de rangées pour corroborer seule — c'est **une heure
et demie**.

**Proposition, corrigée par Christophe le jour même.** J'avais écrit que les cent neuf autres
« ne peuvent, au mieux, qu'ajouter des abstentions déjà expliquées ». **C'est faux, et c'est un
raisonnement là où il fallait une mesure** : un vivier de neuf publie avec huit rangées justes.
Le seuil y vaut 8, la marge est d'une rangée, et c'est exactement le cas le plus tendu — pas un
cas exclu. La moitié de la collection est dans ce groupe.

La mesure porte donc sur **cinq ou six documents entiers de la tranche 9 à 12, de familles
différentes**, plus un ou deux de plus de cinquante. Pour chacun : combien de rangées justes sont
lues, quel seuil est requis, et **publierait-il avec un seuil tiré du document plutôt qu'avec 8**.
Lecture seule, sortie hors de toute bibliothèque, coût tracé si Vision tourne.

Le `8` et le `4` entrent au recensement des seuils, en priorité haute — et pour une raison
différente de `LIGNES_POUR_UNE_COLONNE` : celui-là, **on ne sait pas ce qu'il coûte**, ce qui est
pire que de le savoir.

### Ce que la chaîne lit d'un fichier audio — preuve par le code

Question de Christophe avant la mesure : si la chaîne lit quelque chose **à l'intérieur** d'un
fichier audio, une mesure qui n'en a que l'empreinte ne mesure pas la chaîne.

| ce qu'elle lit | où | pour quoi |
|---|---|---|
| **le nom** | `lireNomMedia(basename(...))`, `banc.ts` | le numéro de piste, et selon le motif : disque, élément, page |
| **le dossier parent** | `disqueDuChemin(...)`, `banc.ts:578` | un numéro de disque, s'il s'appelle `CD n` |
| **les octets** | `createHash("sha256").update(await readFile(chemin))` | **l'empreinte, et rien d'autre** |

Aucune occurrence d'ID3, de `TRCK` ou d'en-tête audio dans le dépôt entier. `Media.dureeS` existe
au contrat mais **n'est jamais renseigné par la chaîne** : les seules écritures sont dans le
lecteur du navigateur, à l'écoute (`useEcoute.ts`). `dureeReliee` ne sert qu'à afficher un total,
et rend `undefined` dès qu'une durée manque — c'est-à-dire toujours, sur ce chemin.

**Conséquence pour la mesure** : aucune extraction audio n'est nécessaire. Les empreintes ont été
calculées **en flux** sur les octets des archives, sans rien écrire — elles sont donc les vraies.
Seuls les PDF sont sortis : 259 Mo au lieu de 824. Le disque système était à 99 %.

Un détail corrigé pour la bonne raison : l'inventaire portait d'abord le nom de base, alors que
`disqueDuChemin` lit le **chemin**. Les chemins d'archive ont été rétablis. Aucune de ces huit
archives n'a de dossier `CD n`, donc le résultat est identique — mais il l'est maintenant parce
que la question a été posée, et non par chance.

## 6 novembre 2026 — Les étiquettes ID3 ne sont pas un second signal

**Consigné sans rien coder.** Deux passages du registre, datés du 5 novembre, disaient de `TRCK`
qu'il était « le seul signal entièrement indépendant » et en tiraient qu'un document qui en
porterait pourrait publier. Les deux sont corrigés sur place, à leur date.

### Ce qui est vrai

Le produit **ne lit aucune étiquette ID3**. D'un fichier audio, la chaîne ne lit que ses octets,
et uniquement pour l'empreinte. Le « 48/48 » de Bass Aerobics vient d'un programme de
contre-épreuve exécuté **hors de la chaîne**. **La publication de Bass Aerobics repose sur le nom
du fichier et sur la table du document.**

### Pourquoi `TRCK` n'est pas un second signal

L'étiquette `TRCK` et le numéro lu dans le nom du fichier ont **la même origine** : l'ordre des
pistes du disque. Elles sont écrites par le même geste, souvent par le même logiciel, depuis la
même table. Leur accord ne prouve que la cohérence d'un rangement.

**Un second signal n'en est un que s'il vient du document** — un repère imprimé, une table
globale, un folio relu. C'est la différence entre deux témoins et un témoin qui se répète.

Confondre les deux aurait un coût précis : un document dont les noms et les étiquettes
s'accordent, mais dont le rangement est décalé d'une piste, publierait **quarante-huit liens faux
et parfaitement réguliers**. C'est exactement ce que tout le reste de ce système empêche.

### Ce qui reste possible, et quand

En **secours**, et à ce titre seulement : quand un nom de fichier a perdu son numéro, l'étiquette
peut le rendre. Ce n'est pas un second signal, c'est une seconde lecture du **même** signal — et
il faudrait alors le dire sur l'écran, comme tel.

**À mesurer si un cas le demande**, pas avant. Sur la collection, le besoin n'est pas établi :
les cent seize archives portent des noms numérotés. Le seul cas connu de nom illisible est
`Méthode à vérifier.zip`, dont ce sont les **noms internes de l'archive** qui ne se décodent pas
— une étiquette ID3 n'y changerait rien.

### Et le CDC, lui, ne dit rien de faux

Vérifié le 6 novembre : **zéro occurrence de `TRCK`, zéro de `ID3`** dans le CDC normatif v2.0.
La seule mention voisine est une ligne de capacités par format — « Audio · MP3, M4A, WAV, FLAC,
OGG · **Durée, tags, forme d'onde ; transcription** » —, c'est-à-dire la colonne de ce qu'on peut
tirer d'un format, au même titre qu'« OCR, empreinte visuelle, EXIF » pour les images. Elle
n'affirme pas que la chaîne les lit.

**Le CDC n'a donc pas été modifié.** Il n'est pas en faute, et retoucher un document normatif sur
une seule lecture n'est pas un geste à prendre seul.

**Ce qui reste à décider** : faut-il y inscrire la règle du 6 novembre — « les étiquettes d'un
fichier ne sont pas un second signal » — le jour où la capacité « tags » sera construite ? Porte
ouverte, non tranchée.

## 6 novembre 2026 — Une règle qu'on doit se rappeler n'est pas une règle

En préparant un commit, un `git add` désignant un **dossier** — `mesures/` — au lieu de fichiers a
happé tout un arbre de sorties non suivi : des centaines de fichiers, **dont deux PDF**, vers ce
dépôt **public**. Rattrapé avant le commit, à la relecture de `git status`. C'est-à-dire par
l'attention, qui n'est pas un mécanisme.

Ce n'était pas la première fois. Le `.gitignore` porte déjà la trace d'une copie de **582 Mo**
d'œuvres sous droits, née d'un mauvais chemin relatif, « à un `git add -A` près d'un dépôt
public ». La règle « chemins explicites » de `CLAUDE.md` existait, et elle n'a pas suffi : **un
dossier est déjà un chemin trop large.**

### Deux barrières, décidées par Christophe

| | |
|---|---|
| `.gitignore` | `**/mesures/sorties/` — la première barrière, celle qui empêche d'ajouter |
| `packages/banc` — contrôle « rien de lourd » | la seconde, celle qui refuse de passer au vert |

Le contrôle lit **l'index**, non les commits : un fichier ajouté et pas encore commité est déjà
refusé, ce qui est le seul moment où le refus sert encore à quelque chose. Il refuse les œuvres —
`.pdf`, `.mp3`, `.m4a`, `.wav`, `.flac`, `.ogg`, `.aac` — et tout ce qui vient d'un
`mesures/sorties/`.

La règle est une **fonction pure**, éprouvée sur une liste fabriquée avant d'être lancée sur
l'index : un garde-fou qui ne s'éprouve que sur l'état réel du dépôt passerait au vert le jour où
il cesserait de voir quoi que ce soit. Et il a été éprouvé pour de bon — une œuvre réellement
mise à l'index le fait rougir, en la nommant avec sa raison.

**Une seule tolérance**, et elle porte sa justification écrite dans le code : `docs/ui-kit/
Catalogue-UI.pdf`, le catalogue du kit d'interface, écrit pour ce projet et par lui. Un contrôle
exige que chaque tolérance soit motivée — allonger cette liste est une décision, pas une
commodité.

## 6 novembre 2026 — Les numérisations partielles : un fait de contenu, pas un défaut

Aebersold 017 annonce ses sections aux pages imprimées 1, 10, 19, 28, 37 et 38 ; le PDF de
l'archive porte **quatorze feuilles** — la couverture, le sommaire, l'introduction, la seule
section en clé de do, une page scannée à l'envers, et la page 38. Les trois sections transposées
manquent.

### Ce que la mesure a pu dire, et ce qu'elle n'a pas pu dire

Relevé sur les **106 archives Aebersold** (la collection en porte 106, dont 51 dans la tranche de
neuf à douze enregistrements). La méthode lit la première page dont les fins de ligne sont des
nombres qui montent, et compare le plus grand folio annoncé au nombre de feuilles.

**Le premier chiffre était faux, et il accusait.** Règle brute : 90 partiels sur 92. Les « folios »
étaient des adresses — `1244` est une boîte postale, `47150` le code postal de New Albany,
`84001` et `84250` des références de disques. **C'est l'adresse de l'éditeur, la même qui avait
failli faire perdre une vraie liste au détecteur de tables.**

Deux garde-fous tirés du document, sans nombre choisi : le sommaire **commence par une petite
page**, et un folio **ne saute jamais de plus que toute l'étendue déjà parcourue**.

| | |
|---|---|
| documents | 106 |
| jugeables | **12** |
| **partiels** | **7** |
| complets | 5 |
| indéterminés | 94 — la colonne de folios ne se lit pas assez bien |

Là où la règle parle, elle **concorde avec l'image** : Aebersold 017 (14 feuilles, 38 annoncé) et
Aebersold 002 (23 feuilles, 40 annoncé), tous deux vérifiés à l'œil.

### Ce que Christophe en décide

**Aucune action.** Ses originaux sont en double sur une clé USB ; les numérisations partielles
sont un **fait de contenu**, pas un défaut de la chaîne. Le produit doit les lire telles qu'elles
sont, et ne rien promettre des pages qui n'y sont pas.

La leçon de méthode reste, et elle vaut plus que le chiffre : **le premier instrument accusait
90 documents sur 92, et il avait tort.** Un chiffre qui accuse mérite la même défiance qu'un
chiffre qui rassure.

## 6 novembre 2026 — Les autorisations de push, et un écart au protocole

Le registre dit : « Chaque porte se demande à Christophe dans la fenêtre de cette session, on
attend sa réponse, et **elle s'inscrit au registre avec sa date** » (5 novembre 2026, règle 3).

**Les cinq push de ce jour ont tous été autorisés, et aucun n'avait été inscrit.** Christophe l'a
relevé. L'écart est consigné ici, et les autorisations avec lui.

| # | commits poussés | autorisation | origine |
|---|---|---|---|
| 1 | treize commits, `1612fb25..fc77b6df` | « Push des treize commits autorisé » | message de Christophe dans la fenêtre de la session, 6 novembre 2026 |
| 2 | `ae6e072f`, `8f839726`, `9c0dd797` | « Push des trois commits autorisé (ae6e072f, 8f839726, 9c0dd797) » — nommés un par un | même fenêtre, même jour |
| 3 | `75a46e71`, le garde-fou des fuites | « Pousser maintenant » | **porte posée par Claude dans la fenêtre, réponse de Christophe**, même jour |
| 4 | `b4980976`, le redressement des pages mal tournées | « Pousser b4980976 » — le commit nommé | **porte posée par Claude dans la fenêtre, réponse de Christophe**, 6 novembre 2026, contrôle complet accepté à 2 960 contrôles |
| 5 | `7904eb66` (titres hors du code du produit) et `38001a1f` (la règle au registre) | « Push autorisé : 7904eb66 puis 38001a1f. Inscris l'autorisation dans le même geste » — les deux commits nommés, dans l'ordre | message de Christophe dans la fenêtre de la session, 6 novembre 2026, contrôle complet accepté avant |
| 6 | `07f0e2f4`, CLA-01 cherche des mots entiers | « Push de 07f0e2f4 autorisé (inscris-le dans le même geste) » — le commit nommé | message de Christophe dans la fenêtre de la session, 6 novembre 2026, contrôle complet accepté avant (2973 lus, 1 rouge épinglé) |
| 7 | `114bf9a4` (le jeton vient du trousseau), `27d43b37` et `a3e126d7` (registre : A2 à deux déclencheurs, discipline de tenue) | « Push autorisé : 114bf9a4, 27d43b37, a3e126d7 (inscris-le dans le même geste) » — les trois commits nommés | message de Christophe dans la fenêtre de la session, 6 novembre 2026, contrôle complet accepté avant (2974 lus, 1 rouge épinglé) |

Sept poussées, douze autorisations si l'on compte les commits nommés séparément — et c'est bien
ainsi qu'il faut les compter : **une autorisation porte sur des commits nommés, jamais sur « la
suite »**.

La quatrième est la première inscrite **dans le même geste que le push**, comme la règle de tenue
ci-dessous l'exige ; la cinquième l'est aussi, et Christophe l'a cette fois demandé dans la phrase
même de l'autorisation.

### Ce que l'écart enseigne

Une porte demandée et obtenue, mais non inscrite, **ne laisse aucune trace** : à la session
suivante, rien ne distingue un push autorisé d'un push pris. L'inscription n'est pas une
formalité, c'est **ce qui rend l'autorisation vérifiable après coup** — par Christophe, et par
le Claude qui reprendra.

Règle de tenue, à partir d'ici : **l'inscription au registre se fait dans le même geste que le
push**, et non « plus tard ».

## 6 novembre 2026 — RÈGLE : une référence tirée du document se prend à la médiane

**Trois fois dans la même journée, le minimum s'est fait tirer vers le bas par une page
aberrante.** Christophe en fait une règle.

| où | ce que le minimum donnait | ce qu'il coûtait |
|---|---|---|
| la coupure des pages qui lisent mal | le groupe du dessus se réduisait à une page, d'étendue nulle | **cinq pages sur six** désignées dans un document qui lit également mal partout |
| la norme de fiabilité d'un mot | la page normale la plus faible | une seule page médiocre rendait presque tout « fiable », y compris le bruit d'une page couchée |
| le plancher de « assez de mots » | la couverture, qui rend **deux** mots | une version tournée qui n'en rendait que **trois** passait le plancher |

**Une référence tirée du document se prend à la médiane, jamais au minimum.** Le minimum suit
l'aberration ; la médiane suit le document.

Et une raison de plus, de forme : deux normes qui emploient la même logique se relisent
ensemble. Deux normes qui emploient chacune la sienne finissent par diverger sans qu'on sache
laquelle avait raison.

### La réserve, consignée sans correctif

« Assez de mots », rapporté à la page médiane, **peut refuser une page couchée peu dense dans un
document mixte** — un recueil où la prose et les partitions se succèdent, et dont la page médiane
est bavarde. Une page de partition couchée y rendrait moins de mots que la médiane, et ne serait
pas redressée.

**Aucun correctif aujourd'hui** : le cas n'est pas rencontré, et une règle écrite pour un cas
supposé est une règle qu'aucune mesure ne tient. **À ajouter au banc dès qu'on en croise un**, et
c'est alors la mesure qui dira ce qu'il faut.

## 6 novembre 2026 — Le redressement des pages mal tournées, et ce qu'il a fallu quatre réécritures pour voir

Décision de Christophe : activer le redressement, qui était **construit et éteint** — une seule
occurrence de l'option dans tout le dépôt, dans un contrôle sauté. Un gain de lecture net peut
décider seul quand l'avis d'orientation se tait, sous trois garde-fous ; le motif tient en une
phrase : **une page mal tournée se relit, elle ne publie rien de faux.**

### La règle, en quatre conditions et sans un nombre choisi

| condition | sa référence | le défaut qu'elle empêche |
|---|---|---|
| assez de mots | la page normale **médiane** du document | une proportion calculée sur trois mots |
| lignes horizontales | une majorité, au sens du mot | une rotation qui lit bien **en laissant la page couchée** |
| pas de perte de mots fiables | la confiance **médiane** des pages normales | une page tournée parce qu'elle rendait **un** mot noté 0,892 |
| gain > variation | ce que les pages normales varient entre elles | tourner pour trois points de mieux |

Et trois cas, parce qu'il n'y a pas toujours de voisine : une page dans un document (on la compare
à ses voisines), un document entièrement mal tourné (ses pages doivent s'accorder), un document
d'une seule page (ses quatre sens).

### Quatre fois réécrite, et chaque fois par une mesure

| ce que j'avais écrit | ce qui l'a réfuté |
|---|---|
| qualité = part des suites de trois lettres | la page couchée notait **45 %**, ses voisines de partition 44 à 46 % : indistinguables. Du texte retourné produit quantité de fausses syllabes |
| détachement = le saut dépasse tous les autres écarts réunis | le saut valait **0,328** et la somme **0,397** : la règle se taisait sur le seul cas qu'elle visait |
| la meilleure confiance gagne | **180° l'emportait sur 90° par deux millièmes**, en laissant la page couchée |
| « ne pas perdre de texte » | 1 391 « mots » dont **244 fiables** : du bruit comparé à du signal |

**Et une conclusion que j'ai soutenue deux fois et qui était fausse.** J'ai écrit que cette page
était à l'envers, et deux mesures le confirmaient : tournée de 180°, elle se lit, et bien. C'est
faux — l'outil déchiffre aussi un texte vertical renversé. **La page est couchée**, c'est une
double page scannée de travers, et seule la **géométrie des boîtes** le dit : 87 % de mots plus
larges que hauts à 90°, 12 % à 180°. Vérifié à l'image ensuite. C'est Christophe qui l'a vue.

### Le contrôle qui a trouvé ce qu'aucun autre ne voyait

Trente-sept contrôles tenaient la règle. Christophe en a demandé un de plus : **découper l'image
exportée à la boîte d'un mot lu, et relire le découpage.** Il doit rendre ce mot.

Il a échoué, et il a trouvé **trois manques réels** :

1. **J'avais supposé le repère à 1 800 px.** Une page tournée d'un quart de tour a pour largeur la
   **hauteur** du rendu — 2 358 ici. Tout découpage calculé sur l'ancienne convention tombait
   ailleurs sur la page.
2. **`PageDeTexte` ne portait pas les dimensions de son repère.** La convention « le rendu à
   1 800, non tourné » était tacite, et elle se brise en silence dès qu'une page tourne. Rien ne
   cassait : les mots étaient justes, l'image était juste, et **seul leur rapprochement était
   faux** — le genre de défaut qui n'apparaît qu'au moment où quelqu'un clique sur un mot.
3. **Le dépôt encodait sans savoir décoder.** Un dérivé qu'on ne sait pas relire est un dérivé
   qu'on ne peut pas éprouver : on en vérifiait les dimensions, jamais ce qu'il montre.

Une fois les trois corrigés : `LE DÉCOUPAGE REND : « INTRODUCTION TO SCALE SYLLABUS »`.

### Une seule décision, portée de la lecture à l'affichage

`exporterPages` portait sa **propre** qualification d'orientation, indépendante de celle de la
lecture. Deux décisions prises séparément finissent par diverger, et le défaut ne se verrait que
sur la page où elles se contredisent. Désormais **la lecture décide, l'export applique**, et un
contrôle vérifie que la page dont la lecture a décidé ne repasse pas par la qualification de
l'export — sans quoi elle partirait de travers deux fois.

### Ce que le redressement coûte

| | |
|---|---|
| sur 116 pages de tablature | **0 page déclenchée**, 0 rotation retenue |
| le recours document entier | **neuf reconnaissances, quelle que soit la taille du document** — 13,7 s sur ce livre |
| sur le document au cas réel | 2 pages déclenchées, **1 seule retenue** : déclencher n'est pas retenir |

### Compatibilité du repère : rien à changer, et le dire vaut mieux que de le supposer

Christophe a demandé lequel des deux il fallait faire — une relecture tolérante, ou passer
`VERSION_LECTURE` à 12. **Ni l'un ni l'autre**, et pour des raisons vérifiées, non supposées.

| | pourquoi |
|---|---|
| pas de relecture tolérante | `PageDeTexte` n'est **jamais écrite nulle part**. Elle est dérivée de `PageLue` à chaque lecture. Il n'existe aucune page ancienne « sans repère » à relire |
| pas de `VERSION_LECTURE` 12 | le cache garde des `PageLue`, qui portent `largeur` et `hauteur` **obligatoirement depuis toujours** (contrat `lecture.ts`). Monter la version invaliderait tous les caches du corpus pour un champ qui n'y est pas |

**Et les versions déjà écrites s'affichent à l'identique** — non par chance, mais par une décision
prise avant ce travail et écrite dans le contrat `ZoneRelative` :

> *Relative, et pas en pixels : l'image lue, l'image affichée et l'image agrandie n'ont pas les
> mêmes dimensions, et seule la part est comparable entre les trois.*

Rien de persisté n'est en pixels. Une zone est une **part**, calculée depuis les dimensions que
la page a toujours portées ; `PageAffichee.largeur` et `hauteur` sont celles de l'**image
exportée**, et suivent donc la rotation du même geste. Le champ neuf ne fait que rendre le repère
visible plus loin dans la chaîne — il n'en change aucun.

Trois contrôles le tiennent, dont celui qui le prouve : **une part ne dépend que de la page, et le
champ neuf ne la change pas.**

### Et CLA-01 m'a repris une seconde fois, sur un commentaire

« les pages de partition voisines ». Le mot venait de la mesure que je décrivais — et c'est le
piège exact : **on nomme ce qu'on a mesuré, et ce qu'on a mesuré appartient à un domaine.**
Corrigé en « pages gravées », qui dit la même chose sans le nommer.

## 6 novembre 2026 — Le seuil de corroboration n'a pas été éprouvé : la détection échoue avant lui

Christophe demandait depuis le matin si le `8` — le nombre de rangées qu'une table doit recouper
pour valoir seconde lecture — retenait des documents qui lisent pourtant juste. **La mesure ne
peut pas répondre, et c'est cela qu'elle établit.**

Huit documents **entiers**, extraits des archives en lecture seule. Un extrait de huit pages sur
cent seize ne peut structurellement pas porter huit rangées de table : le banc d'extraits ne
mesurait donc pas le seuil, il mesurait sa propre découpe.

| document | enregistrements | seuil requis | meilleure table | issue |
|---|---|---|---|---|
| **Jon Liebman - Bass Aerobics** | 52 | **26** | **44 recoupées sur 45** | **publie** |
| J.S. Bach for Electric Bass | 9 | 8 | 0 recoupée sur 21 | corroboration insuffisante |
| 70 Funk & Disco Bass | 99 | 50 | 0 recoupée | — |
| Aebersold 002, 017, 042, 062, 097 | 9 à 12 | 0 ou 8 | 0 recoupée | — |

### Ce que cela établit, et ce que cela n'établit pas

**Aucun document ne s'arrête près du seuil** — mais aucun ne l'atteint non plus. Le seul qui
publie le fait avec 44 rangées pour 26 requises ; les sept autres ne recoupent **rien du tout**.

Il serait faux d'en conclure que le seuil a tenu, ou qu'il n'a jamais été le verrou : **il n'a pas
été éprouvé.** La détection échoue avant lui, et la question de savoir ce qu'il coûterait à un
document qui s'arrêterait à six rangées reste entière.

### Bach, vivier de neuf, est le seul juge possible — et la détection le lui interdit

**Bach porte une liste** — « Page · Titre · CD Track », vérifiée à l'image — et un vivier de neuf,
donc un seuil de 8. C'est le seul document du lot qui pourrait réellement éprouver ce seuil.

Le détecteur ne retient pas sa liste. Les colonnes qu'il trouve sur cette page sont celles du
**pied de page** : l'adresse de l'éditeur, 7777 et 53213. **Défaut de rappel de la détection**,
et non du seuil — la distinction que Christophe a exigé de tenir depuis le début.

Tant qu'il n'est pas corrigé, **le seuil reste non éprouvé**.

Les six autres n'ont pas de liste du tout : pour eux, zéro recoupé est la vérité, et le second
signal doit venir d'ailleurs — ou du mode manuel.

### Ce que le `8` et le `4` deviennent au recensement

Ils restent des **nombres nus** sans nom, en priorité haute, et pour la même raison qu'avant :
**on ne sait toujours pas ce qu'ils coûtent.** La mesure n'a pas pu les éprouver — elle a montré
pourquoi. Le jour où la détection retiendra la liste de Bach, ce document les éprouvera : vivier
de neuf, seuil de 8, et une liste réelle à recouper.

---

## 6 novembre 2026 — titres et auteurs : la règle du dépôt public

Christophe a posé la question dans le bon ordre : d'abord **quoi**, en lecture seule, avant
toute règle. Le relevé a donné une réponse que je n'attendais pas.

**Les sept programmes de mesure poussés dans `b4980976` sont propres.** Un seul titre, dans un
commentaire : `numerisations-partielles.ts:3`. Les six autres prennent leurs documents en
argument et n'écrivent aucun nom. Ce n'était donc pas là qu'il y avait un problème.

**Il était dans le code du produit.** Trois lignes, dans des zones que CLA-01 inspecte
pourtant :

| Fichier | Ce qu'il portait |
|---|---|
| `outils/ingestion/src/voie-oracle.ts:1457` | le titre du jalon dans un commentaire d'explication |
| `apps/app/src-tauri/src/lib.rs:1296` | le même, dans un commentaire de test |
| `apps/app/src/App.tsx:216` | `document: "Funk Fusion Bass.pdf"` — **une donnée**, pas un commentaire |

Elles passaient parce que `fixtures/termes-de-domaine.json` listait `aebersold` et `westwood`
mais **aucun des autres titres ni aucun nom d'auteur**. Le garde-fou fonctionnait ; **sa liste
était trop courte**. Défaut de la donnée, pas du code — exactement ce que la règle 1 du CDC
prévoit : « on l'allonge à chaque nouveau domaine, sans toucher au code ».

La troisième est la plus instructive. `apps/app/src/donnees/demonstration.ts` porte en tête
« **elle est inventée de bout en bout : aucune œuvre, aucune donnée réelle** », et ses noms le
tiennent (`Méthode d'instrument — volume 1.pdf`). Mais `App.tsx` **ne lisait pas cette donnée
pour le nom du document** : il l'écrivait en dur, et il y avait écrit un vrai titre. Un champ
oublié dans le passage de la donnée à l'écran, et le vrai nom s'est installé à la place de
l'inventé. La correction n'est donc pas de remplacer le titre par un autre titre, c'est de
**faire venir le nom d'où viennent déjà les quinze autres champs** : `DOCUMENT_A_TRACER` dans
la donnée de démonstration, porté par `chargerBibliothequeDemonstration`.

### La règle, telle que Christophe l'a tranchée

1. **Code du produit** — commentaires et données de démonstration compris : **aucun titre,
   aucun auteur, jamais.** Ce n'est pas une règle de confidentialité, c'est la doctrine
   anti-codage en dur : un titre dans le code générique annonce une branche spécifique qui
   cassera au domaine suivant. **Elle vaudrait dans un dépôt privé.**
2. **Registre, documentation, tests et programmes de mesure** : les titres d'ouvrages du
   commerce **sont acceptés**. Ils donnent leur sens aux décisions — « 0 recoupée sur 21 »
   ne s'interprète pas sans savoir que c'est un recueil de transcriptions.
3. **Interdits partout, et inchangés** : les **fichiers** (PDF, MP3, extraits) et
   l'**inventaire nominatif complet** de la collection. Le garde-fou `rien-de-lourd` tient le
   premier point ; le second reste un interdit de jugement, sans mécanique.

**Ce que la règle 2 dispense de faire** : les 66 lignes de ce registre, les 14 de
`c9-3-cinq-methodes.ts`, les 11 de `eprouver-le-detecteur.ts` et de
`degrader-une-vraie-liste.ts`, les dix programmes de `outils/vision/mesures/` dont quatre
portent un titre jusque dans leur **nom de fichier**, les deux descriptions `F4.json` et
`F5.json` — tout cela reste. C'est une décision, pas un oubli.

Un point qui tenait déjà : `fixtures/bibliotheques/banc-extraits.json`, la description qui sert
au banc d'universalité, est **entièrement neutre** (`Axe 1`, `Valeur 2.1`). Les noms de
documents que mes relevés affichent viennent des **dossiers sur disque**, hors dépôt.

### Portée du garde-fou, après

`fixtures/termes-de-domaine.json` porte treize termes de plus : cinq noms d'auteurs et huit
titres. Le test a **rougi avant la correction** (`voie-oracle.ts emploie un vocabulaire de
domaine`) et passe après. Il ne couvre toujours ni `mesures/`, ni `test/`, ni `docs/` — et par
la règle 2, **c'est maintenant voulu, et non plus une lacune**.

---

## 6 novembre 2026 — le garde-fou cherchait des suites de lettres, pas des mots

Christophe a posé la question juste après le push : « vérifie que CLA-01 cherche des **mots
entiers** ; *rosier* est un mot français courant, *bach* peut figurer dans d'autres mots ».

Il avait raison, et la mesure l'a montré en six lignes :

| Phrase parfaitement légitime | Ce que le garde-fou accusait |
|---|---|
| `const bache = couvrirLaZone();` | `bach` |
| `une desserte de service` | `dessert` |
| `un bachelor en informatique` | `bach` |
| `la fête bachique` | `bach` |

**Le deuxième est antérieur à mon commit** : `dessert` était dans la liste depuis le domaine de
la cuisine, et `desserte` aurait été accusée depuis le début. Le défaut ne venait donc pas des
treize termes ajoutés ; ils l'ont seulement rendu probable.

### Pourquoi c'est grave et pas cosmétique

Un garde-fou qui accuse à tort **finit par être désarmé**. Celui qui le voit rouge sur un mot
innocent ajoute une exception, puis une autre, et le jour où il rougit à raison personne ne le
croit. Et le code déjà propre ne peut pas révéler ce défaut : il faut **lui soumettre des mots
légitimes**. C'est le rôle du nouveau contrôle.

### La frontière d'un mot, dans du code

Elle n'est pas l'espace. Trois règles, chacune tuée par sa mutation :

| Règle | Ce qu'elle permet | La mutation qui la tue |
|---|---|---|
| majuscule après minuscule = début de mot | `lirePartition` est pris | « attrape le terme collé dans un identifiant composé » |
| majuscule = fin de mot | `partitionDuTexte` est pris | le même |
| terminaison dans une liste fermée : `s` | « décrets », « exercices », « desserts » | « attrape le terme décliné » |
| la même liste : `es` | « oblitérées », féminin pluriel d'un participe | la même |
| aucune frontière (l'ancien comportement) | — | « n'accuse pas un mot français qui contient par hasard un terme » |

**Correction, le même jour.** J'avais écrit ici « une flexion de deux lettres au plus », et
Christophe a vu la contradiction immédiatement : « desserte » est « dessert » **plus une seule
lettre**, donc une règle de longueur l'accuserait. Elle ne l'accuse pas, et ma phrase décrivait
mal le code.

La règle réelle est une **liste fermée de terminaisons**, `FLEXIONS`, et le test est
`FLEXIONS.has(suite[0])` — une appartenance, jamais un compte de lettres :

| Mot | Terminaison après le terme | Dans la liste ? | Verdict |
|---|---|---|---|
| dessert**s** | `s` | oui | accusé, à raison |
| oblitér**ées** | `es` | oui | accusé, à raison |
| dessert**e** | `e` | **non** | libéré |
| bach**e** | `e` | **non** | libéré |
| bach**elor** | `elor` | non | libéré |

C'est donc l'**absence de `e`** qui libère « desserte » et « bache », et une lettre de plus ou de
moins n'y est pour rien. Deux contrôles séparés le disent maintenant : « attrape le terme décliné,
quand la déclinaison est prouvée » et « refuse une lettre ajoutée qui fait un autre mot ».

**Et la liste a maigri.** La contre-épreuve par mutation, passée entrée par entrée, a montré que
`s` était prouvé, mais que **`es` et `x` ne l'étaient par aucun test**. Deux suites différentes :

- `es` a un cas réel dans la liste des termes — « oblitéré » → « oblitérées », féminin pluriel
  d'un participe. Le test manquait ; il est écrit, et `es` est désormais prouvé.
- `x` n'a **aucun cas** parmi les quarante-deux termes : aucun ne fait son pluriel en `-x`. Il est
  **retiré**. C'est la doctrine appliquée à la lettre — une règle qu'aucune mutation ne tue est
  supprimée.

**Mais il faut dire dans quel sens ce retrait peut coûter.** J'avais écrit que le pluriel d'un
futur terme en `-al` ou `-ou` « rougirait à tort » : c'est l'inverse. Un terme dont le pluriel
sort de `FLEXIONS` est **laissé passer en silence**. « bijoux » ne rencontre pas « bijou », le
garde-fou ne dit rien, et personne ne sait qu'il n'a rien vu. C'est un **trou**, pas une fausse
alarme — et le trou est la panne la plus dangereuse d'un garde-fou, parce qu'elle ressemble
exactement au succès.

La même remarque vaut pour les terminaisons déjà absentes : un terme au pluriel irrégulier
(`-aux`, `-eaux`, `-oux`) passe aujourd'hui inaperçu. L'avertissement est donc inscrit **là où on
ajoute un terme**, dans la description de `fixtures/termes-de-domaine.json` : qui dépose un terme
au pluriel irrégulier doit ajouter sa terminaison à `FLEXIONS`, avec son contrôle. C'est le seul
endroit qui sera lu au bon moment.

La logique quitte le fichier de test pour `packages/banc/src/vocabulaire.ts`, pour la même raison
que `rien-de-lourd.ts` avant elle : **une fonction pure s'éprouve seule**. L'extraction a d'abord
été faite sans changer le comportement (cinq contrôles verts), puis le test rouge ajouté, puis la
correction.

### Ce que la correction ne règle pas, et pourquoi c'est sans danger

`rosier` et `rareté` restent pris **en tant que mots** :

```
  ACCUSÉ  le rosier du jardin        ["rosier"]
  ACCUSÉ  la rareté de ce timbre     ["rareté"]
          une bache                  []
          une desserte               []
```

Ce ne sont pas des sous-chaînes mais des **homonymes**, et aucune règle de frontière ne les
distinguera : le mot est le même. La correction ne pouvait pas les atteindre, et **elle n'a pas
à le faire** : le jour où un domaine de jardinage ou de philatélie entre au banc, « rosier » et
« rareté » sont des mots de ce domaine, donc interdits dans le code générique **pour la bonne
raison**. `rareté` y est d'ailleurs déjà, depuis le domaine des cartes à jouer. La collision est
inoffensive par construction — mais il fallait le vérifier plutôt que le supposer.

---

## 6 novembre 2026 — A2 a DEUX déclencheurs, pas un

Rappel de Christophe, au moment d'attaquer la fin d'A2. Je n'en avais retenu qu'un, et la
différence porte loin.

| # | Déclencheur | Ce qu'on relit | Où il se mesure |
|---|---|---|---|
| 1 | **une case de repère** restée sans accord après la relecture locale | la case seule, agrandie | le jalon, mesure 48 → 52 |
| 2 | **le texte d'une page** qui lit nettement moins bien que les pages comparables du même document | la page entière | un livre de la **Bibliothèque Studio Clinique** |

Les deux partagent l'étage payant et la règle d'économie, mais **rien d'autre** : l'un relit une
boîte de quelques dizaines de pixels, l'autre une page ; l'un se juge sur des liens justes,
l'autre sur du texte lisible.

**« Comparables » est une donnée de bibliothèque, pas une constante.** Ce qui fait qu'une page se
compare à une autre dépend du type de document — et ce type vient du schéma de la bibliothèque,
jamais du code. C'est la règle 1 du CDC appliquée à la comparaison elle-même : une méthode
illustrée et un recueil de texte n'ont pas la même page normale, et le code n'a pas à le savoir.

Le second déclencheur se mesure **hors de la bibliothèque musicale**, sur Studio Clinique. Ce
n'est pas un détail de commodité : un seuil de lisibilité trouvé sur un seul corpus serait
exactement le genre de constante calibrée que la doctrine du 5 novembre interdit. Deux familles
de documents, deux natures de page.

Ordre arrêté : **48 → 52 d'abord**, le second déclencheur ensuite.

---

## 6 novembre 2026 — le jeton ne vient plus que du trousseau

Christophe a demandé un relevé avant de décider : quels appelants de `jetonDacces()` existent,
lesquels portent la garde contre un jeton d'environnement, et pourquoi l'environnement passait
devant. Le relevé a donné une réponse nette, et la décision a suivi : **voie 1, le chemin par
l'environnement est retiré.**

### Le relevé

**Quinze appelants de `jetonDacces()`, aucun gardé.** Deux dans le produit (`traiter.ts:97`,
`executant.ts:171`), neuf dans les mesures Vision, deux ailleurs, un dans un contrôle.

**Douze programmes portent la garde** (`LIENOTHEQUE_JETON` présent → arrêt), et **aucun d'eux
n'appelle `jetonDacces()`** : ce sont les mesures hors ligne, où un jeton n'a rien à faire.

**Les deux ensembles sont disjoints.** La garde n'a donc jamais protégé un appel — elle empêche
une mesure hors ligne de tourner dans un environnement qui porte un jeton, ce qui est son rôle
propre et reste inchangé.

**Et ce n'était pas pour l'intégration continue.** Le commentaire du code invoquait « une mise au
point locale ». Vérifié : aucun des deux ateliers ne pose `LIENOTHEQUE_JETON`, et le seul
contrôle en ligne se saute sur l'absence de `LIENOTHEQUE_DIAGNOSTIC_URL`. Retirer le chemin ne
casse **aucune** intégration continue.

### Ce qui a décidé

Le défaut n'était pas que le chemin existe, c'est qu'il était **silencieux** : un jeton qui
traîne dans l'environnement l'emportait sur le trousseau sans que rien ne le dise. Un jeton
silencieux est un jeton qu'on ne sait pas avoir utilisé.

Et une variable y cumulait **deux rôles contraires** : « jeton d'accès » et « signal qu'une
mesure hors ligne doit refuser de démarrer ». Un signal de refus ne doit pas pouvoir servir
d'accès. La voie 1 les sépare en retirant le premier ; `LIENOTHEQUE_JETON` ne garde que le
second.

### Un fait découvert en écrivant le contrôle rouge

Le troisième contrôle a affiché **un fragment du vrai jeton du trousseau** dans son message
d'écart — parce que `jetonDacces()` n'acceptait aucun lecteur injectable et interrogeait donc le
vrai trousseau de la machine. Un contrôle qui échoue ne doit pas pouvoir citer un secret.

`jetonDacces(lire = lireParSecurity)` prend désormais son lecteur en argument, comme
`jetonDuTrousseau` le faisait déjà. La fonction s'éprouve sans toucher au trousseau réel. Ce
n'était pas demandé ; c'est le contrôle rouge qui l'a imposé.

### Où ce fragment est allé — correction de Christophe

J'avais écrit que le fragment était resté dans « un fichier local qui ne quitte pas la machine ».
**C'est faux, et Christophe l'a corrigé.** Le message d'écart est entré dans le **contexte du
modèle**, donc il est passé par les serveurs d'Anthropic avant d'être écrit dans la transcription
locale. Un message de contrôle n'est pas un fichier : il est lu par le modèle, et ce qu'il lit a
voyagé.

C'est la différence entre « un secret dans un fichier » et « un secret dans une conversation », et
je l'avais effacée en décrivant la recherche par ses seuls résultats sur disque. La recherche était
juste ; sa conclusion sur la portée ne l'était pas.

**La conclusion de risque, elle, ne change pas** : trente-sept caractères hexadécimaux sur
soixante-quatre, c'est cent huit bits manquants. Le fragment n'est pas exploitable, où qu'il soit
passé. Mais la portée d'une fuite se mesure à l'endroit où le secret est allé, pas à l'endroit où
on le retrouve.

### Le relevé, pour mémoire

Cherché par un motif lu **depuis le trousseau par le script lui-même**, pour qu'il n'apparaisse
dans aucune commande ni aucune réponse :

| Endroit | Trouvé |
|---|---|
| fichiers suivis et **index Git**, les deux copies du dépôt | non |
| bac de session, sorties de tâches, `mesures/sorties/`, fichiers non suivis | non |
| `/tmp`, `/private/tmp`, `~/.claude` hors transcriptions | non |
| transcription de la session | **oui, 2 occurrences** |

Longueur présente : **37 caractères**. Les préfixes de 40, 48, 56 et 64 donnent zéro. Le jeton
entier n'est nulle part sur le disque.

### La contre-épreuve

Mutation : le chemin par l'environnement revient devant le trousseau. **Deux contrôles meurent** —
« ne prend pas un jeton posé dans l'environnement » et « prend celui du trousseau, même quand
l'environnement en porte un autre ». Restauré octet pour octet.

`jetonDeLEnvironnement` est **supprimée**, et non conservée au cas où : elle n'avait plus aucun
appelant hors de son propre contrôle. Les douze programmes hors ligne lisent `process.env`
directement et ne passaient pas par elle.

---

## 6 novembre 2026 — renouvellement du jeton d'accès : autorisé

**Autorisation de Christophe**, dans la fenêtre de la session, le 6 novembre 2026 :

> « Renouvellement du jeton AUTORISÉ, selon `docs/renouveler-le-jeton.md`, au moment où aucune
> mesure en ligne ne tourne (avant la mesure 48 → 52). Vérification par `verifier-route.ts`. »

Motif : le fragment de trente-sept caractères passé par le contexte du modèle. Non exploitable —
cent huit bits manquants — mais un secret dont on sait qu'il a voyagé se renouvelle, et il se
renouvelle quand c'est bon marché. Il l'est aujourd'hui : aucune mesure en ligne ne tourne encore.

**Fenêtre choisie : avant la mesure 48 → 52.** `laisserEntrer` ne compare qu'à une seule valeur
attendue : pendant la bascule, l'ancien jeton rend 401 et la machine ne passe plus. Renouveler
pendant une mesure de cent seize pages la ferait échouer en plein vol, et l'échec ressemblerait à
une panne de Vision.

### Ce que Claude n'exécute pas, et pourquoi

Les deux gestes qui **installent** le secret — le poser sur le Worker, le poser au trousseau —
sont faits par Christophe. Ce n'est pas la règle 6 du CDC qui l'impose ici, c'est une règle de
l'assistant : **il n'entre pas un secret dans un champ**, même autorisé, même sur l'infrastructure
de son utilisateur, même avec la procédure écrite devant lui.

Cette frontière tombe d'ailleurs bien : les deux commandes de la procédure demandent leur valeur
sur **l'entrée standard**, précisément pour qu'elle n'entre pas dans l'historique du shell. Elles
sont faites pour une main humaine.

Ce que Claude fait : la procédure (écrite), le choix de la fenêtre, l'inscription ici, et la
**vérification** par `verifier-route.ts` une fois les deux côtés posés — celle-là n'installe rien
et ne dépense rien, elle touche la route avec le jeton que le trousseau porte déjà.

### État

| Geste | Qui | Fait |
|---|---|---|
| fabriquer le jeton, dans une variable du Terminal, jamais affiché | Christophe | **fait** |
| poser `JETON_ACCES` sur `lienotheque-api` | Christophe | **fait** |
| poser le jeton au trousseau `lienotheque-jeton` | Christophe | **fait** |
| vérifier par `verifier-route.ts` | Claude | **fait, 7 / 7** |
| consigner que l'ancien est mort | Claude | **fait, ci-dessous** |

### La vérification, le 6 novembre 2026

```
✓ santé : conforme à son contrat                 attendu 200 + contrat   obtenu 200 + contrat
✓ sans jeton : refusé                            attendu 401            obtenu 401
✓ mauvais jeton, même longueur : refusé          attendu 401            obtenu 401
✓ mauvais jeton, autre longueur : refusé         attendu 401            obtenu 401
✓ demande hors contrat : refusée                 attendu 400            obtenu 400
✓ bon jeton : réponse conforme au contrat        attendu 200 + contrat   obtenu 200 + contrat
✓ route inconnue : refusée                       attendu 404            obtenu 404
7 / 7 contrôles passés, et rien à cacher dans les réponses.
```

1076 jetons d'entrée comptés par le comptage, **rien dépensé** : la route et le contrat sont
éprouvés, pas la lecture.

### L'ancien jeton est mort — ce qui le prouve, et ce qui ne le prouve pas

**Ce que je n'ai pas fait** : présenter l'ancien jeton et constater son 401. Je ne l'ai jamais
tenu en entier — trente-sept caractères sur soixante-quatre sont passés dans un message d'écart,
jamais les soixante-quatre. Je ne peux donc pas produire cette mesure, et je ne vais pas la
raconter comme si je l'avais faite.

**Ce qui le prouve quand même**, par trois faits qui se tiennent ensemble :

1. `laisserEntrer` compare le jeton présenté à **une seule** valeur attendue, `JETON_ACCES`
   (`apps/worker/src/app.ts`). Il n'existe aucune liste, aucune fenêtre à deux valeurs.
2. Le nouveau jeton **passe** : le Worker attend donc le nouveau, et lui seul.
3. Un mauvais jeton **de la même longueur** est refusé par un 401, mesuré ci-dessus. La porte ne
   se contente pas d'un format plausible.

De 1, 2 et 3 : toute valeur autre que le jeton courant reçoit un 401. L'ancien en est une.
**Il est mort**, et cette conclusion est une déduction explicite, pas une observation déguisée.

### Textes devenus faux, corrigés dans le même lot

Cinq programmes annonçaient « aucun jeton : ni dans l'environnement, ni dans le trousseau », et
un en-tête décrivait encore « environnement d'abord, trousseau ensuite ». C'étaient des phrases
vraies le matin et fausses l'après-midi. Un message d'erreur qui nomme une source que le code ne
lit plus envoie chercher au mauvais endroit — et c'est précisément quand on cherche un jeton
manquant qu'on n'a pas de temps à perdre.

---

## 6 novembre 2026 — discipline de tenue : un lot à la fois, et la charge avant un contrôle

Deux règles posées par Christophe après trois incidents de la même journée. Elles sont ici parce
qu'elles ont chacune un coût mesuré.

### Un lot à la fois

**Chaque lot est commité AVEC sa propre entrée de registre avant qu'un autre ne commence.**

Pourquoi : `docs/decisions.md` est partagé par tous les lots, et **trois fois ce jour** un
`git add docs/decisions.md` a emporté les écritures de lots qui n'étaient pas prêts. La troisième
fois, le commit annonçait dans son message que les autres entrées « partiraient avec leur lot »
alors qu'il venait de les prendre — **165 insertions au lieu de 3**, rattrapées par le
`git show --stat` placé dans la même commande.

La leçon n'est pas « faire attention » : c'est que **un fichier partagé par trois lots est un
chemin trop large**, exactement comme un dossier. La règle « jamais `git add -A` ni `git add .` »
ne suffisait pas, parce qu'elle parle de la forme du chemin et non de ce qu'il contient.

Reconstruire une version partielle pour l'index fonctionne — c'est ce qui a sauvé les trois cas —
mais c'est un rattrapage, pas une méthode. La méthode est de ne pas accumuler.

### La charge avant un contrôle complet

**Relever `uptime` avant de lancer `pnpm check` ; si la charge est anormale, attendre ou le
signaler. Un seul contrôle à la fois.**

Pourquoi : un contrôle a été **refusé sur un dépassement de délai**, pas sur une assertion. Le
même test prenait 71 s dans la course précédente et a dépassé 360 s dans celle-là ; la suite
`outils/ingestion` est passée de 1419 s à 3294 s tandis que tous les autres paquets gardaient
leur durée à la seconde près. Rejoué seul, le test rend **73,8 s et vert**.

Un indice de plus, trouvé sans le chercher : le code de sortie portait aussi
`[vitest-worker]: Timeout calling "onTaskUpdate"` — **la liaison interne du banc entre son
ouvrier et son fil principal** en dépassement. Quand l'infrastructure d'un banc n'arrive plus à
se répondre à elle-même, ce n'est pas le code qu'il faut relire.

Et j'avais moi-même lancé **trois `pnpm check` en concurrence** plus tôt dans la journée, deux
portant sur un état déjà périmé. D'où la seconde moitié de la règle.

**Ce qu'il ne faut pas faire dans ce cas**, et qui n'a pas été fait : épingler le rouge (une
épingle sert à un échec compris, pas à un échec inexpliqué) ou allonger le délai de 360 s (ce
serait supprimer le seul signal qui a dit que la machine était saturée).
---

## 6 novembre 2026 — une promesse est toujours vraie, et n'a rien à faire dans une condition

Christophe l'a demandé après une remarque exacte : j'avais annoncé que `sansLien` était devenue
asynchrone « sans changer ses quatre appels », et il a relevé le risque — *une promesse utilisée
sans attente dans une condition est toujours vraie, et le compilateur ne le voit pas toujours.*

### Les quatre appels, montrés un par un

| Ligne | Forme | Fonction englobante |
|---|---|---|
| 752 | `return sansLien(` | `export async function rejouerParOracle` |
| 773 | `return sansLien(` | la même |
| 833 | `return sansLien(` | la même |
| 1012 | `return sansLien(` | la même |

Les quatre sont des `return` dans une fonction `async` typée `Promise<RejeuParOracle>` : la
promesse est **rendue à l'appelant**, jamais lue comme valeur, jamais rangée, jamais dans une
condition. Et c'est le **type de retour** qui le garantit, pas ma bonne volonté.

### Le dépôt n'a aucun outil de vérification

`pnpm check` est un typage et des contrôles — ni ESLint, ni Biome. Avant de proposer d'en ajouter
un, la mesure : **zéro** appel asynchrone dans une condition, sur **301** fonctions et ports
asynchrones repérés dans le dépôt. Le défaut n'existe pas encore.

Le garde-fou est donc posé **vert**, et c'est le bon moment : il attrape le premier, pas le
centième. Il est écrit dans l'idiome des autres — une fonction pure, sa mesure, et la liste des
fonctions asynchrones **lue dans le code** plutôt qu'écrite à la main. Une liste écrite à la main
vieillit en silence.

**Ce qu'il ne prétend pas faire**, et qui est écrit dans le fichier : il ne remplace pas une
analyse de types, ne voit ni les promesses rangées dans une variable puis mal employées plus
loin, ni les méthodes d'objets. Il tient **une** forme, celle qui ment sans bruit. Mieux vaut un
garde-fou étroit qui ne se trompe pas qu'un large qu'on désarme — la leçon du matin sur
« desserte ».

### Deux défauts trouvés en l'éprouvant

**Un numéro de ligne faux pour `while`.** Le calcul recomposait la longueur de l'en-tête en
supposant `if (`. Prouvé par un contrôle : ligne 2 au lieu de 3. La condition porte désormais le
décalage de son propre texte.

**Deux règles sur quatre n'étaient prouvées par rien.** La contre-épreuve entrée par entrée :

| Mutation | avant | après |
|---|---|---|
| l'appel attendu n'est plus toléré | 2 morts | 2 morts |
| une méthode de même nom est accusée | 2 morts | 2 morts |
| **les ports asynchrones ne comptent plus** | **0 mort** | 1 mort |
| **la parenthèse imbriquée n'est plus comptée** | **0 mort** | 1 mort |

Les deux règles non prouvées méritaient un contrôle plutôt que la suppression : un **port** est
exactement ce qu'on branche, donc ce qu'on risque d'appeler sans attendre, et son nom n'apparaît
nulle part comme `async function`. Sans cette forme, le garde-fou serait aveugle à la moitié du
risque.

### Un incident de méthode, qui vaut d'être écrit

Mes trois premières mutations **n'ont pas été appliquées** — un échappement du shell — et le banc
affichait tranquillement « 7 passed ». Lu sans méfiance, cela voulait dire « ces trois règles ne
servent à rien », et j'aurais pu en supprimer quatre.

Une mutation qui ne s'applique pas est **indiscernable d'une mutation qui ne tue rien**. Les deux
affichent du vert. Le script de mutation vérifie maintenant que le motif existe **avant** de
jouer, et le dit quand il est absent. C'est encore la même famille : le silence qui ressemble au
succès.
---

## 7 novembre 2026 — la CI était rouge depuis quatre commits, pour un fichier jamais commité

**Première application de la règle « après chaque push, lire la CI »**, posée par Christophe le
6 novembre. Elle a trouvé quelque chose dès son premier usage.

### Ce que la CI disait

| Commit | Lot | CI |
|---|---|---|
| `bc380f93` | titres hors du code du produit | **échec** |
| `ace92eb7` | CLA-01 cherche des mots entiers | **échec** |
| `c5643bc5` | jeton du trousseau + registres | annulée, remplacée |
| `8473bdab` | garde-fou des promesses | **échec** |

Cause unique, identique sur les deux systèmes, aux quatre courses :

```
outils/ingestion typecheck:
  src/index.ts(264,15): error TS2307: Cannot find module './relire-sur-place.js'
```

**`outils/ingestion/src/index.ts` était commité et exportait `./relire-sur-place.js` ; le module
ne l'était pas.** Mon arbre de travail le portait, un clone non.

### Ce que cela coûtait vraiment

Pas quatre voyants rouges. Un typage qui s'arrête à `outils/ingestion` **n'exécute pas les tests de
ce paquet** : ce que la CI avait vérifié, ce sont les paquets qui passent avant. **Les contrôles du
paquet le plus lourd du projet n'ont tourné que sur un seul disque, pendant quatre lots.**

La réparation ne corrige donc pas un voyant ; elle rend ces quatre lots vérifiables pour la
première fois.

### Pourquoi le contrôle local ne pouvait pas le voir

Il part du disque, pas d'un clone. Il disait « ce disque passe », et je l'ai lu huit fois comme
« ce commit passe ». La différence est un fichier qu'on oublie d'ajouter — **et c'est un oubli que
les chemins explicites rendent possible**, puisque c'est l'auteur qui nomme les chemins.

Les deux disciplines se complètent donc, et il m'en manquait une moitié : les chemins explicites
empêchent d'emporter ce qui ne doit pas partir ; la CI attrape ce qu'on a oublié d'emporter.

### Toutes les occurrences, cherchées d'un coup

Première mesure : **694** — absurde, le script comparait des chemins de deux origines. Corrigée :
**7**, dont 5 faux positifs (`node_modules`, et des `.json` qu'un remplacement `.js` → `.ts`
abîmait en `.tson`).

**Deux vrais, tous deux de moi :**

| Fichier non suivi | Importé par | Cassant ? |
|---|---|---|
| `outils/ingestion/src/relire-sur-place.ts` | `src/index.ts`, **commité** | **oui, tout de suite** |
| `outils/ingestion/test/aides/pdf.ts` | `test/voie-oracle.test.ts`, pas encore commité | pas encore |

Le second part avec le lot Vision. Le premier est réparé ici.

### Ce qui en découle

Un garde-fou « **aucun fichier suivi n'importe un fichier non suivi** » entre dans la file, avant
le lot Vision : il ajoute trois fichiers neufs, dont un déjà importé par un fichier suivi. Un
garde-fou local qui tient cette règle aurait rougi au premier commit, sur le disque, avant le push.
---

## 7 novembre 2026 — le garde-fou des promesses lisait ses propres exemples comme du code

Posé la veille, vert au moment du commit, **rouge une seconde après** : son fichier de contrôle
n'était pas encore suivi par Git, donc il ne se voyait pas lui-même. Le commit `1f5f3379` l'a rendu
visible, et il a immédiatement accusé ses propres fixtures — elles portent `if (…)` **dans des
chaînes de caractères**.

C'est exactement le défaut dont ce registre disait le matin même, à propos de « desserte », qu'il
désarme un garde-fou. Reproduit dans le garde-fou suivant, le jour même.

### La cause, pas le symptôme

L'exemption du fichier aurait marché et aurait été fausse : **tout fichier qui cite du code** — un
contrôle, une documentation, un message d'erreur — a la même forme. Exempter l'aurait désarmé là
où il devait apprendre à lire.

**Un garde-fou qui lit du code ne doit pas lire les chaînes comme du code.** `sansLitteraux`
blanchit le contenu des chaînes caractère par caractère, **sauts de ligne gardés**, pour que les
numéros de ligne restent ceux du fichier réel : un relevé juste qui désigne la mauvaise ligne ne
vaut pas beaucoup mieux qu'un relevé faux.

### Et une règle de plus que rien ne tenait

| Mutation | avant | après |
|---|---|---|
| les chaînes sont relues comme du code | — | **3 morts** |
| les sauts de ligne sont effacés | 1 mort | 1 mort |
| **l'échappement n'est plus respecté** | **0 mort** | **1 mort** |

L'échappement protège un cas réel : `const dit = "il a dit \"if (lireQuelqueChose())\" hier";`.
Sans lui, le lecteur croit la chaîne fermée au guillemet échappé, lit la suite comme du code, et
accuse une citation. Son contrôle est écrit.

**Troisième fois ce jour** qu'une contre-épreuve entrée par entrée révèle une règle que rien ne
tenait — après `es`/`x` dans les flexions, et les ports asynchrones. La contre-épreuve globale
(« une mutation, un test mort ») ne suffit pas : c'est **entrée par entrée** qu'elle parle.
---

## 7 novembre 2026 — aucun fichier suivi n'importe un fichier non suivi

Né de l'incident du matin : la CI rouge quatre lots durant, pour un `index.ts` commité qui
exportait un module que personne n'avait commité. Ce garde-fou rougit **avant** le push, sur le
disque, là où la correction coûte un `git add` au lieu d'une branche cassée.

C'est le pendant exact de la règle « jamais `git add -A` » : **les chemins explicites empêchent
d'emporter ce qui ne doit pas partir, ce garde-fou attrape ce qu'on a oublié d'emporter.** Il
manquait la seconde moitié.

### Il a mordu avant d'être commité

Premier passage sur le dépôt réel :

```
{ chemin: "outils/ingestion/test/voie-oracle.test.ts", importe: "./aides/pdf.js" }
```

`aides/pdf.ts` n'était pas suivi, et `voie-oracle.test.ts` l'importe depuis l'extraction de la
veille. **Au prochain push, la branche recassait exactement de la même façon.**

### Il juge l'index, pas le disque — correction de Christophe

Première version : il lisait les fichiers sur le disque. Ma première réaction a été d'indexer le
fichier manquant pour faire passer le contrôle — **j'ai ajusté l'index au garde-fou au lieu
d'ajuster le garde-fou à la question.** Christophe l'a corrigé à la racine.

Lire le disque était faux **dans les deux sens** :

- **faux positif** — un import ajouté sur le disque, qui ne partira pas dans ce commit, annoncé
  comme fantôme ;
- **faux négatif** — un module présent sur le disque mais non indexé faisant passer pour résolu un
  import qui aurait cassé le clone.

La question n'est pas « qu'y a-t-il sur cette machine ? » mais **« que contiendra le prochain
commit ? »**. Seul l'index y répond.

### Le contrôle anti-aveuglement : trois formes, deux écartées

Une mutation a révélé la pire panne possible : en cassant l'avance par taille annoncée, le lecteur
ne chargeait plus que **la première entrée** et rendait du vide pour toutes les autres. Aucun
import trouvé nulle part, et le garde-fou **vert**. Aveugle et silencieux, indiscernable du succès.

Trois formes de contrôle, dans l'ordre où elles ont été écrites puis écartées :

| Forme | Ce qu'elle supposait |
|---|---|
| « plus de cent sources lues » | une **constante calibrée** — vieillit sans rien dire, et laisse passer un chargement d'une entrée sur deux |
| « aucun fichier suivi n'est vide » | une **hypothèse sur le dépôt**, pas sur le lecteur — un `.gitkeep` légitime la casserait, et un garde-fou qui accuse à tort finit par être désarmé |
| **« chaque contenu a la taille que Git annonce »** | **rien** |

`git cat-file --batch-check` ne lit aucun contenu : il rend l'en-tête des objets. C'est **la seule
mesure extérieure au lecteur**, donc la seule qui puisse le contredire. Un fichier vide a une
taille de zéro des deux côtés.

**Et cette forme a imposé une correction du lecteur, pas seulement du test** : il ne peut plus
décoder en UTF-8 au chargement, parce que décoder un PNG ou une police est irréversible et que la
taille du texte décodé ne vaut plus celle que Git annonce. Le chargeur garde des **octets**, et le
décodage se fait à la demande. Sans cela, le contrôle aurait été inapplicable sur toute image du
dépôt.

### Deux défauts de performance et de justesse, attrapés en route

**Un dépassement de délai** : un `git show` par fichier, cinq secondes dépassées sur quelques
centaines de sources. Remplacé par `git ls-files -s` puis `git cat-file --batch` — **deux appels
pour tout l'index**, 688 ms.

**Un test dont le nom mentait** : « accepte qu'un dossier réponde par son index » ne vérifiait rien
de tel — son import nomme l'index explicitement, et c'est le premier candidat qui répond. Découvert
parce qu'une mutation de la règle du dossier ne tuait aucun test. La règle a été **supprimée** et
le test renommé.

### Contre-épreuve

| Mutation | Tests morts |
|---|---|
| le `.tsx` ne répond plus pour un `.js` | 2 |
| la tolérance `node_modules` est retirée | 1 |
| les imports de paquets sont examinés | 2 |
| le `.json` n'est plus pris tel quel | 2 |
| remonter d'un dossier est ignoré | 1 |
| le disque est lu au lieu de l'index | 2 |
| HEAD est lu au lieu de l'index | 3 |
| la taille annoncée n'est plus suivie | 1 |
| une entrée sur deux est chargée | 1 |
| **le contenu est tronqué d'un seul octet** | **1** |
| les contenus reviennent vides | 2 |
| le décodage UTF-8 sert de mesure | 3 |
| ~~le dossier répond par son index~~ | **0 — supprimée** |

La dixième montre le gain de la forme retenue : **un seul octet manquant** est détecté. Ni le seuil
de cent, ni « aucun fichier vide » ne l'auraient vu.

### Une note de méthode, la seconde en deux jours

Plusieurs mutations ont d'abord affiché `Tests no tests` ou « 7 passed » **sans avoir été
appliquées** — un échappement de shell, puis un motif disparu après une réécriture. Lues sans
méfiance, elles disaient « cette règle ne sert à rien ».

Une mutation qui ne s'applique pas est **indiscernable d'une mutation qui ne tue rien**. Les scripts
vérifient maintenant que le motif existe **avant** de jouer, et le disent quand il est absent.
---

## 7 novembre 2026 — l'index est préparé AVANT le contrôle, pas après

**Règle de tenue posée par Christophe**, et elle vise la cause de deux rouges du jour :

> Avant le contrôle complet, les fichiers du lot — **et eux seuls** — sont ajoutés à l'index, pour
> que l'index soit exactement le commit. Le contrôle juge alors ce qui partira, et voit ce que la
> CI verra.

### Pourquoi, mesuré deux fois

Les garde-fous qui parcourent le dépôt lisent **l'index**. Un contrôle lancé avant d'indexer les
fichiers du lot les juge donc sur un index qui ne les contient pas : il ne voit pas ce que la CI
verra, et il passe au vert sur un état qui n'existera jamais.

Deux rouges de CI en sont venus, et tous deux portaient sur le fichier de contrôle d'un garde-fou,
non indexé pendant la course locale :

| Garde-fou | Local, avant indexation | CI, le fichier commité |
|---|---|---|
| les promesses (6 novembre) | **vert** | **rouge** — il accusait ses propres fixtures |
| les fichiers non suivis (7 novembre) | **vert** | **rouge** — six fantômes, tous des chaînes de son contrôle |

Le piège est **à retardement** : le garde-fou est vert tant que son propre fichier n'est pas suivi,
et rouge à la course suivante. Aucune relecture ne l'attrape ; seul l'ordre des gestes l'évite.

### Ce que la règle coûte, et ce qu'elle rend

Elle coûte un `git add` de plus, avant le contrôle au lieu d'après. Elle rend la propriété qui
manquait : **le contrôle local et la CI jugent le même état**. Les vingt-cinq minutes d'un contrôle
complet ne valent que si ce qu'il juge est ce qui part.

Elle complète les deux autres règles de la journée, et les trois ne forment qu'une discipline :

1. **chemins explicites** — n'emporter que ce qu'on nomme ;
2. **aucun fichier suivi n'importe un fichier non suivi** — ne pas oublier d'emporter ;
3. **l'index préparé avant le contrôle** — juger ce qu'on emporte, et non ce qu'on a sous la main.
---

## 7 novembre 2026 — le garde-fou des fantômes s'est lu lui-même, et le remède était faux

Le garde-fou posé le matin a annoncé **six fantômes** sur la CI, tous des fixtures de son propre
fichier de contrôle, écrites entre guillemets. Même défaut que le garde-fou des promesses la
veille, **un lot plus tard**, alors que la leçon était écrite au registre.

### Deux erreurs de remède, l'une après l'autre

**Première** : appliquer le remède des promesses — blanchir les chaînes. Or **un chemin d'import
EST une chaîne**. Blanchir détruisait exactement ce que ce garde-fou cherche, et le contrôle
« attrape un module importé mais non suivi » est tombé aussitôt.

**Seconde** : interroger le masque sur le motif **entier** (`from "./absent.js"`), dont le chemin
est blanchi — donc plus aucun import véritable ne passait.

La forme juste : chercher le motif dans le **texte brut**, et demander au masque si son **mot-clé
seul** est du code. **Le masque sert à situer un motif, pas à le lire.**

### Une pièce partagée, et une faille latente corrigée en passant

`packages/banc/src/lire-du-code.ts` porte désormais `sansLitteraux` — deux usages réels — et en
plus `sansCommentaires` : **un `// if (f())` n'est pas plus du code qu'un `"if (f())"`**. C'était
une faille du garde-fou des promesses que personne n'avait vue.

Son en-tête raconte le défaut deux fois et en tire la règle : **tout garde-fou qui parcourt les
sources du dépôt blanchit les chaînes et les commentaires avant de lire.**

### Contre-épreuve

| Mutation | Tests morts |
|---|---|
| le masque n'est plus interrogé | 2 |
| le motif entier est interrogé au lieu du mot-clé | 1 |
| les commentaires ne sont plus blanchis | 2 |

Le blanchiment des commentaires n'était d'abord tenu **que par un commentaire du dépôt réel** —
creux dès que quelqu'un le réécrirait. Il a désormais son propre cas.
---

## 7 novembre 2026 — un délai égal au coût est un tirage au sort

La CI de `44726ce2` : **Ubuntu accepté, macOS refusé**, sur une régression qui ne venait pas du lot
poussé.

```
× apprend un repère numérique récurrent des accords prouvés et récupère un départ
  absent de la table                                                     5935 ms
  → Test timed out in 5000ms
```

**Pas une assertion : un dépassement.** Le contrôle tournait dans le délai par défaut de cinq
secondes.

### Le coût réel

| Machine | Durée |
|---|---|
| le disque de développement | **2,08 s** |
| agent Ubuntu de la CI | passe, sous 5 s |
| **agent macOS de la CI** | **5 935 ms — dépasse** |

L'agent macOS est environ **trois fois plus lent** que la machine de développement sur ce travail.
Le contrôle ne fait rien d'anormal : il explore avec un budget de 256 paires, et ce coût est réel.

### Pourquoi ce n'est PAS le cas du matin

Le même jour, un délai de 360 s avait été dépassé parce que la machine était à **90 de charge**.
Là, le délai disait quelque chose de vrai, et l'allonger aurait effacé le seul signal de la
saturation. C'était écrit : « ne pas allonger le délai, ce serait supprimer le signal ».

Ici, le coût est **régulier** et le délai était posé à **cent pour cent** de ce coût. Un délai égal
au coût est un tirage au sort : il est passé sur la course `45294a61`, il a échoué sur
`44726ce2`, **sans qu'une ligne de ce paquet ait changé entre les deux**.

La distinction tient donc en une question : *le dépassement m'apprend-il quelque chose sur la
machine, ou seulement que la marge était nulle ?* Dans le premier cas on garde le délai ; dans le
second, c'était un oubli.

### La correction, et ce qu'elle n'introduit pas

Décision de Christophe : **le délai de ses huit voisins, `180_000`**. Les huit contrôles qui lisent
avec Tesseract dans ce fichier en portent un explicite ; celui-ci n'en avait aucun, et c'est
l'oubli.

**Aucun nombre nouveau n'entre dans le dépôt.** Un délai de « dix fois le pire relevé » aurait été
défendable mais aurait fait entrer un facteur dix choisi sur deux machines — exactement la
constante calibrée que la doctrine du 5 novembre interdit. Reprendre le délai des voisins ne
calibre rien : il aligne un contrôle oublié sur la règle que son voisinage applique déjà.

### Ce qui reste ouvert, et qui est inscrit

**Pourquoi ce contrôle coûte deux secondes sans rien lire** n'est pas résolu, et ne doit pas l'être
par un délai. La question entre à la file, avec la lenteur des dix-neuf contrôles de lecture du
même fichier (20 à 25 minutes). Un délai rend un contrôle fiable ; il n'explique pas son coût.
