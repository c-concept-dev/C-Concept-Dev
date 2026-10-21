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
