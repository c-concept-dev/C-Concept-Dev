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
| 2026-10-06 | **La chaîne tourne dans un Node embarqué en binaire annexe**, lancé par l'hôte Rust, un processus par travail. La chaîne n'est pas modifiée. Paquet attendu ~128 Mo | Lot D2, étape 0, mesures ci-dessous |
| 2026-10-06 | **L'hôte est le seul écrivain du dépôt** : le processus reçoit un travail et rend un résultat, l'hôte le valide et l'active en une opération (JOB-06) | Lot D2, étape 0 |
| 2026-10-06 | Portage Rust intégral de la chaîne **écarté** : il faudrait réécrire pdf.js et les codecs, et refaire la preuve des 84/92 et 95/95 | Lot D2, étape 0 |
| 2026-10-06 | Allègement du moteur (Node sans ICU, binaire compilé) **reporté après la bêta**, et sans toucher la chaîne | Lot D2, étape 0 |
| 2026-10-08 | **La recherche n'a pas d'index à elle** : elle lit la vue, et tout se passe sur la machine. Le surlignage porte sur le texte d'origine, pas sur sa forme repliée | Lot D2, étape 4, section ci-dessous |
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
médias orphelins, en 195 s. F1 exact. F4 n'a pas été relancé : sa mesure appelle le service de
relecture payant, et rien dans ce lot n'autorisait cette dépense — c'est pourquoi la règle de la
bande a été écrite pour ne rien changer aux recettes décrites par une marge ou un bord, ce qui est
le cas de F4.

### Ce que les captures ont montré

La page occupait toute la hauteur et repoussait la palette hors de l'écran ; l'étiquette d'une
zone proche du bord droit se faisait couper. Les deux sont corrigés. La page montrée par
l'éditeur est dessinée et prend ses couleurs des jetons : elle suit le thème, et le garde-fou des
couleurs en dur n'a pas eu à être desserré pour elle.


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
