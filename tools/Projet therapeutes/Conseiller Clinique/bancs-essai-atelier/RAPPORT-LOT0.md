# Lot 0 — bancs d'essai de l'atelier de montage

**Bancs jetables et mesurés**, pas du code de production. Dossier neuf, aucun fichier existant
modifié, rien poussé sur `main`, aucun déploiement, aucun appel au Worker ni au modèle.

`GOUVERNANCE-STUDIO-CLINIQUE.md` a été lu avant tout (trouvé hors du dépôt :
`Chantiers/GOUVERNANCE-STUDIO-CLINIQUE.md`, et sa version maître
`Vigilance/MAITRE-GOUVERNANCE-STUDIO-CLINIQUE.md`). Trois de ses règles ont réellement pesé :

- **0E — usage réel avant nouvelle construction** : `VideoBoxStudioClinique/essais-safari` a été
  inspecté d'abord. Il contient bien des MP4 et une page de diagnostic, mais elle éprouve la
  **lecture** (HEVC/H.264), jamais l'encodage ni la capture audio. Rien à réutiliser ; les MP4
  déjà produits restent un antécédent utile sur ce que Safari lit.
- **Étape 0 — calibrer le test au risque** : ce lot ne modifie aucun fichier existant, donc
  **aucune régression complète des 98 suites n'a été lancée** — elle n'aurait rien pu casser. Les
  bancs ont leurs propres contrôles.
- **Régression #7 / Étape 0, dernier point** : une vérification automatisée ne remplace pas un
  passage humain. D'où la séparation stricte des deux colonnes ci-dessous.

---

## Cette branche ne contient AUCUN fichier produit

Le dépôt est public. `lot0-bancs-essai-propre` ne porte donc que des sources : outils, pages,
scripts, bibliothèques `dist` et ce rapport. **Ni PNG, ni WAV, ni MP4, ni JSON de mesure, ni
présentation dans `entrees/`.** `.gitignore` retient `images/`, `mesures/`, `entrees/`,
`node_modules/`, `cache-npm/` et `ffmpeg-externe/`, et `entrees/` l'est **préventivement** :
c'est là qu'atterrirait un export réel, qui peut contenir des extraits de la bibliothèque de livres
de Christophe.

Tout se reproduit depuis les sources, dans cet ordre :

```bash
cd "tools/Projet therapeutes/Conseiller Clinique/bancs-essai-atelier"
npm install --cache ./cache-npm                 # bibliothèques dist déjà présentes dans vendeur/
mkdir -p images mesures                         # dossiers de sortie, ignorés par git
node outils/produire-exports.cjs                # forge entrees/ (4 fixtures)
node outils/forger-page-nettete.cjs             # forge la page de netteté pour Safari
node test-essai1.cjs && node test-essai2-reference.cjs && node test-essai2-candidats.cjs && node test-essai3.cjs
```

**L'ordre compte pour les bancs qui relisent une sortie d'un autre banc**, et chacun le dit en
clair plutôt que d'échouer obscurément. Vérifié sur un arbre neuf : lancés seuls,
`falsifier-contours.cjs` répond « Lance d'abord outils/mesure-nettete-1920.cjs » et
`mesure-ffmpeg.cjs` répond « MP4 absent — relancer mesure-decalage-audio.cjs ». Les deux
prérequis d'abord, donc :

```bash
node outils/mesure-nettete-1920.cjs             # produit images/n2-c-moteur-1920.png
node outils/mesure-decalage-audio.cjs           # produit mesures/decalage-{48000,44100}.mp4
node outils/falsifier-contours.cjs              # éprouve la métrique de netteté
node outils/mesure-ffmpeg.cjs                   # décodage ffmpeg contre afconvert
node outils/mesure-liste-edition.cjs            # effet de la liste d'édition sur les deux
node outils/mesure-nettete-candidats.cjs        # les quatre chemins de capture
node outils/paquet-controle-humain.cjs          # bâtit controle-humain/
```

Les bancs qui emploient ffmpeg demandent en plus, dans un dossier jetable et ignoré :

```bash
mkdir -p ffmpeg-externe && cd ffmpeg-externe && npm init -y && npm install --cache ../cache-npm ffmpeg-static@5.2.0
```

**L'étape `npm install` n'est pas facultative, et c'est mesuré.** Sautée, `pixelmatch` est
résolu depuis le `NODE_PATH` externe en **7.2.0**, dont l'export par défaut est un objet et non
une fonction : `test-essai2-candidats.cjs` meurt sur « pixelmatch is not a function ». Le banc
demande **5.3.0** (export CommonJS direct), et l'installation locale le rétablit. La panne ne venait
pas d'un fichier manquant dans la branche propre, mais de ma propre recette non suivie — vérifié
dans les deux sens : 7.2.0 → `object` avec `.default` fonction, 5.3.0 → `function`.

**Playwright n'est PAS dans `package.json`**, et c'est une dépendance réelle des bancs pilotés
(tout ce qui mesure dans WebKit ou Chromium). Il a été pris sur cette machine par un `NODE_PATH`
externe plutôt qu'installé dans le dossier. Pour rejouer ces bancs ailleurs, il faut donc soit
`npm install playwright` et ses navigateurs, soit pointer `NODE_PATH` vers une installation
existante. Les bancs **non** pilotés (lecture de WAV et de MP4, métriques, recensement de boîtes,
`afconvert`, ffmpeg) n'en ont pas besoin. **Signalé, non corrigé** : ajouter la dépendance
reviendrait à décider à la place de Christophe du poids installé par ce dossier jetable.

La branche `lot0-bancs-essai`, qui porte l'historique complet avec les fichiers produits, est
**conservée intacte** : rien n'a été supprimé, et elle n'a jamais été poussée.

---

## Environnement

| | |
|---|---|
| macOS | **26.3**, build **25D125** |
| Safari | **26.3** |
| Machine | MacBook Pro 18,1 — **Apple M1 Pro**, 10 cœurs, 16 Go |
| WebKit de test | `Version/26.5 Safari/605.1.15` (Playwright 1.62.1, webkit-2336) |
| Chromium de test | `HeadlessChrome/151.0.7922.34` |
| node / npm / python | v24.11.1 / 11.6.2 / 3.13.1 |
| `ffprobe` / `ffmpeg` | **ABSENTS** — d'où un lecteur de boîtes MP4 écrit pour ce lot |
| `safaridriver` | présent (exige d'autoriser l'automatisation à distance) |

Bibliothèques, installées par npm puis **copiées dans `vendeur/`** (aucun CDN) :
`mediabunny` 1.61.1 (MPL-2.0), `@zumer/snapdom` 3.3.0 (MIT), `html-to-image` 1.11.13 (MIT),
`pixelmatch` 5.3.0 (ISC), `pngjs` 7.0.0 (MIT). `node_modules/` est ignoré par git ;
`package-lock.json` l'est aussi, **par le `.gitignore` du dépôt** (ligne 46) — d'où ces versions
consignées ici.

---

## Essai 1 — micro intégré, WAV, marqueurs

| Critère | Valeur mesurée | Verdict | Qui vérifie |
|---|---|---|---|
| WAV valide, mono, en-tête exact | RIFF/WAVE, PCM 1, 1 canal, 16 bits, tailles cohérentes — relu octet par octet | **tenu** | script (Chromium) |
| Lisible dans QuickTime Player | — | **non éprouvé** | **Christophe** |
| Écart échantillons / horloge ≤ 0,2 s sur 5 min | **−0,073 s à 6 s ; −0,063 s à 20 s ; −0,069 s à 40 s** | **tenu** | script (Chromium) |
| Aucun trou | aucune perte observée sur 40 s | **partiel** — 5 min non éprouvées | script + **Christophe** |
| Récupération après fermeture | 5 marqueurs retrouvés **à l'échantillon près** après rechargement | **tenu** | script (Chromium) |
| Marqueur reproductible à l'échantillon | tous les marqueurs tombent sur une frontière de **quantum de 128 échantillons** | **tenu** | script (Chromique) |

**L'écart est un décalage, pas une dérive** — et c'est ce qui sauve le critère. Mesuré à trois
durées plutôt que déduit d'une seule : la durée a été multipliée par **6,64** pendant que l'écart
l'était par **0,94** (étendue : 0,0101 s). C'est l'horloge murale qui démarre avant que le graphe
audio ne livre son premier bloc. Une prise de 5 minutes garderait donc le même écart d'environ
70 ms. Le champ `decalage_s` du JSON de marqueurs a ainsi un objet réel.

**Granularité d'un marqueur : 128 échantillons**, soit **2,902 ms** à 44 100 Hz (2,667 ms à
48 kHz). C'est le quantum de rendu Web Audio, **mesuré au premier `process()`** et non supposé.

**Chromium livre 2 canaux à 44 100 Hz** malgré `channelCount: 1` demandé — le mixage mono et la
corrélation gauche/droite sont donc réellement exercés. Les trois traitements demandés à `false`
sont bien livrés à `false`. **Ce que Safari livrera est inconnu** : c'est le premier point de la
liste de Christophe.

---

## Essai 2 — une image par étape

**Recommandation : SnapDOM.**

| Candidat | Écart médian contre la référence WebKit | Durée médiane | 1<sup>re</sup> prise vide |
|---|---|---|---|
| **SnapDOM** | **1,42 – 1,43 %** | **52 – 61 ms** | **0 / 20** |
| html-to-image | 1,46 – 2,92 % | 233 – **2 955 ms** | 0 / 20 |

Sur le questionnaire, html-to-image est **48 fois plus lent**. Pour un montage de 40 images :
environ **2 minutes** contre **2,5 secondes**. L'écart de pixels de SnapDOM est aussi plus faible
**et plus stable** d'un jeu à l'autre.

| Critère | Valeur mesurée | Verdict | Qui vérifie |
|---|---|---|---|
| 100 % d'images non vides | 20/20 étapes, **les deux** prises, les deux bibliothèques | **tenu** | script (WebKit) |
| Aucune image ni police manquante | écart ≤ 2,92 %, concentré sur l'anticrénelage du texte | **à juger à l'œil** | **Christophe** (feuille de comparaison) |
| Écart de pixels sous un seuil | **seuil proposé : 2 %** par étape, au seuil pixelmatch 0,12 | **tenu par SnapDOM**, dépassé par html-to-image sur le texte dense | script (WebKit) |
| Comportement du Safari réel | — | **non éprouvé** | **Christophe** (`essai2-candidats.html`) |

**UNE ERREUR DE MA PART, CORRIGÉE — et elle était grave.** J'avais écrit qu'il n'y avait aucune
animation à attendre. **C'est faux.** `adocPresentAnimateNumberIfEligible` anime **700 ms** en
`requestAnimationFrame` tout bloc de texte simple dont le texte commence par un chiffre
(`^(\d+(?:[.,]\d+)?)`), appliqué au **premier bloc à l'entrée** de la diapositive **et à chaque
bloc révélé**. J'avais regardé `adocPresentUpdateCounter` — qui n'est que le compteur « 3 / 10 » —
et conclu depuis un seul nom de fonction au lieu de chercher. Mes trois premières fixtures
n'avaient **aucun bloc numérique** : rien n'animait, donc rien ne m'a contredit.

**Ce que coûtait cette erreur, mesuré** sur une quatrième fixture (`nombres`, blocs « 37 % des
couples… », « 2,5 fois… », « 18 mois… ») :

| Délai après la révélation | Référence WebKit | SnapDOM |
|---|---|---|
| t+0 ms | « **1 %** des couples… » | « **2 %** des couples… » |
| t+300 ms | « **16 %** des couples… » | « **17 %** des couples… » |
| **t+800 ms** | « **37 %** des couples… » | « **37 %** des couples… » |

À mon repos de 320 ms, la capture portait donc **16 % au lieu de 37 %** : une image plausible avec
un **chiffre faux**, le pire défaut possible dans une présentation clinique. **Le délai est porté à
800 ms** (700 ms d'animation + une image de marge) dans les deux bancs, et les mesures ont été
reprises. Les écarts de pixels des trois premières fixtures restent valides : sans bloc numérique,
rien n'y animait.

**Et une supposition du brief confirmée fausse, elle :** le **bug WebKit de première capture ne
s'est pas produit** — 0 image vide sur la première prise, sur 20 étapes et les deux bibliothèques.
La double capture est conservée (elle coûte peu, et le Safari réel n'est pas le WebKit de
Playwright) mais elle n'a rien révélé ici.

**La géométrie a demandé une mesure avant toute comparaison.** `#cc-ws-present-slide-inner` a
**toujours 1422×800 de mise en page** ; sa boîte rendue varie avec la fenêtre, l'échelle étant
posée sur un ancêtre. À 1920×1080 il est rendu à **1746×982**, tandis que html-to-image renvoyait
**1422×800** : les deux premières comparaisons étaient donc littéralement *incomparables*. Mesuré à
cinq fenêtres, **1596×898** est la seule où la boîte rendue égale la mise en page. C'est là que les
captures sont comparables pixel à pixel, et les références ont été reprises à cette fenêtre.

### Le cadre 1920×1080, et la netteté du texte

**Correction : mon « 1919×1080, largeur impaire » était MON bug.** J'avais arrondi le facteur à
quatre décimales (1,3502 au lieu de 1920/1422 = 1,350210…), ce qui donnait 1919,98 → 1919. Avec le
facteur non arrondi, **les quatre options donnent exactement 1920×1080** : `scale: 1920/1422`,
`scale: 1.3503`, `width: 1920`, et `width`+`height`. Aucune contrainte de parité à transmettre.

**Mais la netteté, elle, ne suit pas.** Mesurée sur les **contours** (densité de gradients francs
et gradient moyen parmi eux — une moyenne sur toute l'image ne distingue rien, car un
agrandissement bicubique conserve l'énergie en l'étalant) :

| Chemin | Taille | Densité de contours | Gradient moyen | Pic | Poids |
|---|---|---|---|---|---|
| Référence moteur à l'échelle 1 | 1422×800 | 0,141 % | **185** | 185 | 45 Ko |
| (a) SnapDOM 1× puis agrandi sur canvas | 1920×1080 | 0,208 % | 92,5 | 113 | 74 Ko |
| (b) SnapDOM à l'échelle native | 1920×1080 | 0,208 % | 92,5 | 120 | 65 Ko |
| **(c) le MOTEUR rendant à 1920×1080** | 1920×1080 | 0,208 % | **162,5** | **232** | 69 Ko |
| (d) SnapDOM, DOM déjà rendu à 1920 | **1422×800** | 0,141 % | **185** | 185 | 37 Ko |

Trois enseignements, et le troisième change la recommandation :

1. **(a) et (b) sont indiscernables** — gradient moyen identique à la décimale, et 0,357 % de
   pixels différents seulement. Le `scale` de SnapDOM **agrandit une rastérisation faite à 1×** ;
   il ne rend pas à la taille cible.
2. **(d) le prouve** : même quand le DOM est rendu à 1920 (fenêtre 2094×1178, mesurée), SnapDOM
   renvoie **1422×800**. Il lit la **mise en page** de l'élément, invariante, jamais son rendu.
   C'est ce qui explique tout le reste — les tailles « incomparables » du premier jet comme
   l'égalité de (a) et (b).
3. **Seul le moteur sait rendre net à 1920** : (c) a un gradient de 162,5 et un pic de 232, soit
   **76 % plus franc par contour** que les deux chemins SnapDOM. La fenêtre qui fait occuper tout
   le cadre est **2094×1178** (mesurée : 1920×1080 en donne 1746×982 ; 2100×1182 en donne
   1927×1084).

**Conséquence pour le vrai module, et elle nuance ma recommandation.** Dans le Safari réel il n'y a
pas de `page.screenshot` : seule une bibliothèque qui sérialise le DOM est disponible. SnapDOM
reste donc le meilleur choix *disponible*, mais il ne livrera **pas** un texte net à 1920. Deux
voies restent ouvertes, et le choix n'est pas tranché ici :

- capturer à **1422×800, net** (37 Ko, 31 ms) et laisser **l'encodeur H.264** mettre à l'échelle
  vers 1920×1080 — un agrandissement de 1,35× fait par le scaler matériel plutôt que par un canvas.
  **Non éprouvé** : il faudrait comparer le rendu du scaler de l'encodeur à l'agrandissement
  bicubique, ce qui dépasse ce lot ;
- accepter un texte plus doux à 1920.

### L'enveloppe de mise en page 1920 — mesurée, à taille égale, et sans gain

Demande : capturer avec SnapDOM un conteneur dont la **mise en page** fait réellement 1920×1080 et
qui contient la diapositive agrandie par `transform: scale()`, puis comparer **à taille égale**.
Outil : `outils/mesure-nettete-1920.cjs`. Falsification : `outils/falsifier-contours.cjs`.

**Deux explications fausses, écartées par la mesure, avant la bonne.** Les premiers lancements
rendaient 1422×1080 — la hauteur de l'enveloppe, pas sa largeur. J'ai d'abord écrit que la fenêtre
rognait une enveloppe trop large : **faux**, le résultat est identique en 1596×898 et en 2094×1178.
J'ai ensuite supposé une règle `!important` : **faux**, aucune règle de feuille de style
n'atteint l'enveloppe. La cause réelle, mesurée : `#cc-ws-present-slide-outer` est un conteneur
**flex**, l'enveloppe en devenait un objet flexible, et `flex-shrink` écrasait sa largeur — une
enveloppe vide à qui l'on pose `width:1920px` **en ligne** calculait **816,95 px**. Correctif :
`flex:0 0 auto` plus `min-width`/`min-height`. L'outil **refuse désormais la capture** si
`offsetWidth/offsetHeight` ne valent pas la cible : une enveloppe comprimée ne peut plus se faire
passer pour une enveloppe de 1920. Vérifié en retirant le correctif — l'outil passe au rouge avec
« mise en page de l'enveloppe non conforme : 1422x1080 au lieu de 1920x1080 — capture refusée ».

**Comparaison à taille égale, 1920×1080 des deux côtés :**

| Chemin | Taille | Densité de contours | Gradient moyen | Pic | Poids |
|---|---|---|---|---|---|
| **(c) le MOTEUR rendant à 1920** | 1920×1080 | 0,208 % | **162,5** | **232** | 69 Ko |
| (e) SnapDOM, enveloppe de mise en page 1920 | 1920×1080 | 0,104 % | **92,5** | 120 | 64 Ko |
| (b) SnapDOM `scale` 1,35 (rappel) | 1920×1080 | 0,208 % | **92,5** | 120 | 65 Ko |

**Conclusion : aucun gain. (e) et (b) sont identiques** — gradient 92,5 et pic 120 à la décimale.
Faire porter l'agrandissement par un `transform: scale()` sur une enveloppe réellement en page à
1920 **ne change rien** : SnapDOM rastérise à 1× puis étire, que l'agrandissement vienne de son
propre `scale` ou d'une transformation CSS. Le moteur reste **43,1 % plus franc par contour**.

**Ce que vaut ce chiffre, en unité interprétable.** La métrique est falsifiée : un flou de boîte
appliqué à la capture du moteur doit faire chuter le gradient, et il le fait — rayon 1 px → 89
(−45,2 %), rayon 2 px → 65 (−60,0 %), rayon 3 px → 46 (−71,7 %). Les 92,5 de SnapDOM tombent donc
**entre le rayon 1 px et le rayon 2 px**, au plus près du 1 px : *la capture SnapDOM équivaut au
rendu du moteur flouté d'environ un pixel.* Sans cette falsification, « 43 % moins franc » n'aurait
été qu'un nombre sans échelle.

**Ce qui n'est PAS prouvé.** La densité de contours de (e) est la moitié de celle de (b) et de (c)
(0,104 % contre 0,208 %) alors que les gradients sont égaux : moins de pixels franchissent le seuil
de 40, pour une raideur moyenne identique. Je n'ai pas établi la cause de cet écart de densité, et
il ne change pas la conclusion, qui porte sur la raideur des contours. La recommandation du
paragraphe précédent — capturer à 1422×800 net et laisser le scaler H.264 agrandir — reste **non
éprouvée** : ce complément ferme une voie, il n'en ouvre aucune.

### Les deux derniers candidats de rastérisation — même résultat, la voie est fermée

Deux chemins restaient à éprouver, dans l'idée de faire rastériser le SVG **directement** à
1920 plutôt que d'étirer un bitmap 1× : (a) `snapdom().toSvg()`, qui rend une `<img>` portant
une URL de données SVG, puis `drawImage` sur un canvas 1920×1080 ; (b) `html-to-image` avec
`pixelRatio` = 1920/1422. Outil : `outils/mesure-nettete-candidats.cjs`, qui pilote WebKit sur
la **même page** que celle ouverte à la main dans Safari, pour que les chiffres soient comparables
sans retraitement.

| Chemin | Taille | Densité | Gradient | Pic | Durée |
|---|---|---|---|---|---|
| **(c) le MOTEUR rendant à 1920** | 1920×1080 | 0,208 % | **162,5** | 232 | — |
| (c) + flou de boîte 1 px | 1920×1080 | 0,208 % | **89** | 108 | — |
| (a) SnapDOM `toSvg` → `drawImage` 1920 | 1920×1080 | 0,208 % | **92,5** | 120 | **49 ms** |
| (b) `html-to-image`, `pixelRatio` 1,3502 | 1920×1080 | 0,208 % | **92,5** | 120 | 317 ms |

**Les deux candidats donnent exactement 92,5 et 120**, comme les quatre chemins déjà mesurés : soit
**5 % du trajet** entre le moteur flouté d'1 px et le moteur net. La voie « faire rastériser le SVG
à la taille cible » est donc **fermée** : le navigateur rastérise le contenu du `foreignObject` à
sa taille intrinsèque (1422×800, lue dans le SVG rendu) avant toute mise à l'échelle, que celle-ci
vienne du `scale` de SnapDOM, d'un `transform` CSS, d'un `drawImage` ou d'un `pixelRatio`.
Six chemins, un seul chiffre.

**Ce n'est pas un artefact de mesure, et c'est vérifié dans les deux sens.** Deux parités sont
exigées avant toute conclusion : la métrique embarquée dans la page redonne celle de Node au
dixième (92,5/120 contre 92,5/120), et le moteur redonne ses chiffres publiés (0,208 % / 162,5 /
232). Et surtout, les deux PNG candidats ne sont **pas** le même fichier : empreintes distinctes,
**9 496 pixels différents sur 2 073 600 (0,458 %)**, écart maximal 641. Deux bibliothèques
indépendantes produisent donc des images réellement différentes pour une raideur de contours
identique — c'est un résultat, pas une mesure qui se répète.

**Aucun refus de WebKit sur `foreignObject` vers canvas.** `drawImage` passe, et surtout
`getImageData` ne lève pas de `SecurityError` : le canvas n'est pas souillé. **Le Safari réel
de Christophe reste à éprouver** — c'est précisément ce que la page ci-dessous mesure, et le
panneau distingue un refus de sécurité de toute autre panne.

**La durée sépare les deux candidats, à netteté égale** : 49 ms pour SnapDOM contre 317 ms pour
html-to-image, soit **6,5 fois plus lent** pour le même résultat. Si l'un des deux devait servir,
ce serait SnapDOM.

### Les deux derniers leviers — un faux gain démasqué, puis la voie close

Le complément 3 concluait « voie fermée » sur quatre chemins. Deux leviers n'avaient pas été
éprouvés, et il fallait les mesurer avant de clore : **(c)** la propriété CSS `zoom`, qui agit sur
la **mise en page** là où `transform: scale` n'agit que sur le rendu, et **(d)** un SVG écrit par
l'outil, `width=1920 height=1080 viewBox="0 0 1422 800"` autour du `foreignObject` de 1422×800.

**Les deux ont d'abord paru gagner, et les deux perdent.**

| Chemin | Gradient | Pic | Corrélation d'encre au moteur | Échelle du contenu |
|---|---|---|---|---|
| **(c) le MOTEUR à 1920** | **162,5** | 232 | 1 | 1 |
| (c) + flou de boîte 1 px | 89 | 108 | — | — |
| (a) SnapDOM `toSvg` → `drawImage` | 92,5 | 120 | **0,868** | 1 |
| (b) `html-to-image`, `pixelRatio` | 92,5 | 120 | **0,869** | 0,994 |
| ✗ (c) CSS `zoom` puis SnapDOM | ~~153~~ | 153 | **−0,022** | **1,350** |
| ✗ (d) SVG `viewBox` écrit ici | ~~181,9~~ | 185 | **−0,020** | **0,740** |

**153 puis 181,9 : j'ai failli rapporter deux gains qui n'existent pas.** (d) dépassait même le
moteur. La métrique de contours ne sait pas si elle mesure la même image : un texte rendu plus gros
a des contours plus raides, et c'est tout. Ce qui a arrêté la fausse conclusion, c'est que le
**pic égalait la moyenne** pour (c) — signature d'une image dont tous les contours ont la même
raideur, donc d'autre chose que du texte antialiasé.

**Les causes, mesurées au pixel :**

- **(c) `zoom` grossit le contenu de 1,350 fois** — exactement le facteur appliqué. L'étendue de
  l'encre passe de 689×98 à 930×132, l'encre totale de 7 753 à 13 885 (+79 %), et le profil par
  ligne se décorrèle complètement (−0,022). `zoom` refait la mise en page : la diapositive n'est
  plus la même, elle est plus grande. Au passage, `offsetWidth` sous `zoom` renvoie **1053×593**
  et non 1920×1080, donc SnapDOM sérialise un SVG de 1053×593.
- **(d) WebKit IGNORE mon `viewBox`** et rend le `foreignObject` à sa taille d'unités traitée
  comme des pixels : le contenu occupe 1422/1920 du cadre, soit **0,740**. Vérification
  arithmétique : 689 × 1422/1920 = **510,3**, mesuré **510**. L'encre tombe à 4 269 et il n'y a
  plus rien sous la ligne 120.

**Garde-fou installé, et éprouvé dans les deux sens.** `mesure-nettete-candidats.cjs` calcule
désormais la corrélation du profil d'encre avec la référence et **écarte** tout chemin sous 0,5,
en imprimant l'échelle réelle du contenu. Le détecteur est validé : **1** contre lui-même,
**−0,0003** sur la même image décalée de 40 px, **0,007** contre du bruit. Sans lui, deux faux
gains entraient au rapport.

**Conclusion, les deux leviers demandés ayant été éprouvés : la voie est close.** Les quatre
chemins comparables donnent tous **92,5**, et les deux leviers qui semblaient monter rendent une
autre image. Le navigateur rastérise le contenu du `foreignObject` à sa taille intrinsèque, et
aucun levier côté page ne le déplace. **Je m'arrête là**, comme demandé. Reste la seule question
ouverte, de jugement et non de mesure : l'écart gêne-t-il en vidéoprojection ?

### Le questionnaire qui déborde — oui, la hauteur complète est capturable

La carte mesure **2507 px de contenu pour 798 px visibles** : **1709 px hors champ**. Quatre cibles
éprouvées sur SnapDOM :

| Cible | Taille obtenue | Hauteur captée | Durée | Poids |
|---|---|---|---|---|
| l'enveloppe de diapositive (ce que fait le banc) | 1422×800 | **32 %** | 95 ms | 36 Ko |
| la carte elle-même | 1422×800 | **32 %** | 36 ms | 34 Ko |
| la carte avec `height: 2507` | **4456×2507** | 100 % | 166 ms | 247 Ko |
| **la carte dépliée** (`overflow: visible` + hauteur explicite) | **1422×2507** | **100 %** | **86 ms** | **81 Ko** |

**La hauteur complète s'obtient**, mais seulement en dépliant le DOM avant la capture : mettre
`overflow: visible` et une hauteur explicite sur la carte, capturer, puis remettre les valeurs
d'origine. Coût : **86 ms au lieu de 36**, et **81 Ko au lieu de 34**.

**Attention à `height` seul : c'est un piège.** Passé à SnapDOM, il agit comme un facteur
d'échelle et triple la largeur (4456×2507 au lieu de 1422×2507), pour 247 Ko. Ce n'est pas la
hauteur complète qu'on veut, c'est la carte dépliée.

**Les entrées sont forgées, et c'est dit** : `entrees/` était **vide**, aucune présentation réelle
n'a été fournie. Les trois exports sont construits par le point d'entrée réel
(`adocBuildStandalonePresentationHTML`) depuis des documents forgés d'après `block.schema.json`,
réseau coupé pour que la comparaison soit reproductible. `entrees/PROVENANCE.json` le consigne.
Un document réellement généré peut contenir des structures qu'ils n'ont pas.

**Aucun recours à Cloudflare n'a été préparé** : les deux candidats fonctionnent, et le brief
réserve cette piste au cas où l'un échoue.

---

## Essai 3 — petit MP4 avec AAC

**L'encodage fonctionne sur les deux moteurs. Un seul critère sort — dans le conteneur, pas à la
lecture.** Mon premier jet en annonçait deux ; le décodage par CoreAudio en a corrigé un.

| | Chromium | WebKit |
|---|---|---|
| H.264 par WebCodecs | `avc1.4d0028`, `avc1.640028` | `avc1.42001f`, `avc1.4d0028`, `avc1.640028` |
| AAC-LC 48 kHz | mono **et** stéréo | mono **et** stéréo |
| Avis de Mediabunny | `avc=true`, `aac=true` | `avc=true`, `aac=true` |
| Export court (20 s) | 814 Ko en **560 ms** | 403 Ko en **296 ms** |
| Piste vidéo | `avc1` 1920×1080, 20 s, **33 échantillons** | idem |
| Piste audio | `mp4a`, 1 canal, 20,075 s | `mp4a`, 1 canal, 20,056 s |

| Critère | Valeur mesurée | Verdict | Qui vérifie |
|---|---|---|---|
| MP4 H.264 + AAC produit | `ftyp isom`, `moov`, `mdat` ; pistes `avc1` + `mp4a` | **tenu** | script (les deux moteurs) |
| Lisible dans QuickTime Player | — | **non éprouvé** | **Christophe** |
| Durée vidéo = durée audio à une image près | **−0,075 s** (Chromium) / **−0,056 s** (WebKit) ; cause établie = 2112 éch. d'amorce AAC non déclarée | **hors critère DANS LE CONTENEUR**, sans effet à la lecture (voir plus bas) | script + `afinfo` |
| Écart flash / bip ≤ 40 ms, **décodage** `afconvert` | **+4,2 ms**, aux deux fréquences et aux trois instants. Les −48,8 ms venaient du décodeur de Mediabunny, les −69 ms y ajoutaient 20 ms d'artefact de ma mesure | **TENU au décodage** | script + `afconvert` |
| Écart flash / bip ≤ 40 ms, **décodage** ffmpeg | **+48,2 ms** (48 kHz) et **+52,1 ms** (44,1 kHz) : l'amorce n'est PAS retirée | **HORS critère**, et **corrigé** par la ligne ci-dessous | script + ffmpeg |
| Écart flash / bip ≤ 40 ms, **décodage** AVFoundation | **+4,2 ms** sans liste d'édition | **TENU au décodage** | script + Swift/AVFoundation |
| Même critère, avec liste d'édition | **+4,2 ms** chez ffmpeg et `afconvert`, mais **−39,8 ms** (48 kHz) et **−43,7 ms** (44,1 kHz) chez AVFoundation | **HORS critère à 44,1 kHz sur la pile Apple** : la correction dégrade ce qui marchait | script + 3 décodeurs |
| Le bip tombe-t-il avec le flash **dans QuickTime Player, Safari, Chrome** ? | — | **NON MESURÉ** : aucun lecteur n'a été éprouvé, seulement trois décodeurs | **Christophe** (5 MP4 fournis) |
| Export de 10 min sans plantage | **8,2 s** d'encodage, **17,5 Mo**, 508 images, aucun plantage | **tenu** | script (Chromium) |

### D'où vient le décalage — décomposition, et trois corrections à mon premier jet

**Ordre de lecture.** Cette section retrace la mesure telle qu'elle s'est faite : d'abord ce que
voit le décodeur de Mediabunny, puis le renversement par CoreAudio. **La conclusion est à la fin
(« Décodé par CoreAudio »), et elle annule la correction que les paragraphes intermédiaires
proposaient.** Les chiffres intermédiaires sont conservés parce qu'ils expliquent l'erreur.

**Mon « 3 317 échantillons, l'ordre d'une amorce AAC » était une conclusion trop rapide.** Le
nombre ne correspondait à rien de canonique, et je l'avais tout de même avancé. `afinfo`, l'outil
livré avec macOS, tranche sans ambiguïté sur les deux MP4 produits :

```
audio 960448 valid frames + 2112 priming + 0 remainder = 962560
```

**2112 échantillons d'amorce** — le repère de Christophe était juste au sample près. Reste à
expliquer l'écart entre ces 44 ms et les 69 ms que je mesurais. Décomposition, mesure par mesure :

| Part | 48 kHz | 44,1 kHz | Établie par |
|---|---|---|---|
| Amorce AAC déclarée (2112 échantillons) | **44,00 ms** | **47,89 ms** | `afinfo` (système) |
| Pic − attaque de **mon** enveloppe de bip | +20,0 ms | +19,0 ms | relecture |
| Montée jusqu'au seuil de détection d'attaque | ~4,8 ms | ~5,2 ms | relecture |
| **Écart mesuré par le PIC** (mon premier chiffre) | −68,8 ms | −72,1 ms | relecture |
| **Écart mesuré par l'ATTAQUE** | **−48,8 ms** | **−53,1 ms** | relecture |
| Horodatage de la **première image vidéo** | **t = 0 s** | **t = 0 s** | relecture |

**Les deux tiers de mon « décalage » étaient mon propre artefact de mesure.** Mon bip porte une
enveloppe `sin(π·p)` sur 50 ms : son pic d'amplitude tombe au **milieu** de la rafale, 20 ms après
son attaque, et le seuil de détection n'est franchi qu'après ~5 ms de montée. Chercher le pic
plutôt que l'attaque ajoutait donc ~25 ms à un décalage qui n'en a pas.

**Le décalage réel est l'amorce, et il dépend de la fréquence** — ce qui est la signature d'une
amorce exprimée en **échantillons** : 2112 valent 44,00 ms à 48 kHz et 47,89 ms à 44,1 kHz, et
l'écart mesuré suit (−48,8 contre −53,1 ms, soit 4,3 ms de différence pour 3,9 ms prédits).
**Côté vidéo, rien** : la première image est à t = 0.
**Mais ce « décalage réel » n'en est pas un à la lecture** : le décodage par CoreAudio, plus bas,
montre que le décodeur CoreAudio le compense intégralement (ce qui ne dit rien de QuickTime). Ce qui suit dans cette section décrit ce
que voit le décodeur de Mediabunny, non ce qu'entend un auditeur.

Reste un résidu de **~5 ms** après l'amorce, et un **supplément d'environ 8 ms au seul instant
9 s** (−56,7 au lieu de −48,8), présent aux deux fréquences. Je ne l'explique pas ; il est de
l'ordre d'une trame AAC (1024 échantillons = 21 ms) et pourrait venir d'une quantisation de
frontière. **Non élucidé, et je ne le comble pas d'une hypothèse.**

#### Décodé par CoreAudio : `afconvert` compense l'amorce — et ma correction est RETIRÉE

**Portée de ce qui suit, à ne pas élargir.** `afconvert` est le décodeur en ligne de commande de
CoreAudio, **pas** QuickTime Player. Tout ce qui est établi ici porte sur des **décodeurs**. Le
comportement d'un lecteur Apple réel n'est **pas** mesuré par ce lot : il est à vérifier dans
QuickTime, et les fichiers sont fournis pour cela (voir « Contrôle humain »).

Le décalage mesuré plus haut l'était par les décodeurs de Mediabunny. Décodé avec **`afconvert`**
(CoreAudio, la pile de décodage audio d'Apple — un décodeur, pas un lecteur) en WAV PCM, puis relu par
`outils/mesure-afconvert.cjs`, le bip prévu à 1,000 s, 5 s et 9 s attaque à :

| Fréquence | t = 1 s | t = 5 s | t = 9 s | Écart |
|---|---|---|---|---|
| 48 kHz | 1,00421 s | 5,00421 s | 9,00421 s | **+4,2 ms** |
| 44,1 kHz | 1,00422 s | 5,00422 s | 9,00424 s | **+4,2 ms** |

**Conclusion, strictement bornée : `afconvert` compense l'amorce.** Les 44 à 53 ms
disparaissent entièrement au décodage ; il ne reste que **+4,2 ms**, soit exactement la montée
jusqu'au seuil de détection d'attaque déjà tabulée ci-dessus — autrement dit **zéro décalage** dans
le PCM rendu. Le critère de 40 ms est donc **tenu au décodage CoreAudio**, sans correction.
**Ce qui n'est PAS établi : que QuickTime Player se comporte comme son décodeur en ligne de
commande.** C'est plausible, ce n'est pas mesuré, et ce lot ne le dira pas. Le supplément de ~8 ms à l'instant 9 s
disparaît également : il appartenait au décodeur de Mediabunny, pas au fichier.

**Je retire donc la correction que j'avais proposée.** Avancer l'audio de 2112 échantillons
n'aurait pas corrigé un décalage : il en aurait **introduit un de 44 ms** au décodage CoreAudio.
C'est le cas précis où appliquer une correction « mesurée » sans avoir vérifié le comportement du
lecteur aurait cassé ce qui marchait.

Comptes d'échantillons rendus par CoreAudio : **576 448** contre 576 000 écrits à 48 kHz (+448 en
queue), **529 344** contre 529 200 à 44,1 kHz (+144) — la queue d'encodeur, sans effet sur
l'alignement du début.

#### Un décodeur non-Apple ne retire PAS l'amorce — et une liste d'édition corrige les deux

Le complément 2 laissait ouvert, en le disant, le comportement d'un décodeur non-Apple. ffmpeg 6.0,
obtenu par le paquet npm `ffmpeg-static` dans `ffmpeg-externe/` — dossier ignoré par git, rien
installé au système — tranche (`outils/mesure-ffmpeg.cjs`, qui relance **les deux** décodeurs sur
les mêmes fichiers avec la détection partagée de `outils/attaque.cjs`) :

| Décodeur | 48 kHz | 44,1 kHz | Échantillons rendus (48 kHz) |
|---|---|---|---|
| `afconvert` (CoreAudio) | **+4,2 ms** | **+4,2 ms** | 576 448 |
| ffmpeg 6.0 | **+48,2 ms** | **+52,1 ms** | 578 560 |
| différence | **+44,0 ms** | **+47,9 ms** | **+2 112** |

La différence entre décodeurs vaut **exactement l'amorce**, aux deux fréquences, et les comptes
d'échantillons le confirment au sample près : 578 560 = 576 448 + 2112. **ffmpeg conserve les
2112 échantillons d'amorce ; CoreAudio les retire.** Un **décodeur** non-Apple est donc **hors
du critère de 40 ms**. La parité de méthode est exigée avant toute comparaison : le banc refuse de
conclure si `afconvert` ne redonne pas les +4,2 ms publiés.

**La liste d'édition corrige ffmpeg sans casser afconvert.** Le levier est dans Mediabunny, sans
rustine : quand le premier horodatage d'une piste est négatif, son écrivain `edts` émet une
entrée de `media_time` **positif** (`mediaTime = intoTimescale(-offset, trackData.timescale)`,
lu dans le dist). Il suffit donc de `new AudioBufferSource(config, { startTimestamp: -2112/SE })`.
Mesuré par `outils/mesure-liste-edition.cjs`, qui produit les deux variantes et relit le
`media_time` dans les octets du MP4 plutôt que de supposer :

| | elst écrit | ffmpeg | `afconvert` |
|---|---|---|---|
| sans (48 kHz) | aucun | +48,2 ms | +4,2 ms |
| **avec (48 kHz)** | **v0, 1 entrée, media_time 2112** | **+4,2 ms** | **+4,2 ms** |
| sans (44,1 kHz) | aucun | +52,1 ms | +4,2 ms |
| **avec (44,1 kHz)** | **v0, 1 entrée, media_time 2112** | **+4,2 ms** | **+4,2 ms** |

**Pas de double compensation AU DÉCODAGE `afconvert`** — et seulement là : rien n'est affirmé
pour QuickTime Player. La raison est mesurée, non supposée. En falsifiant le
`media_time` directement dans les octets du MP4 produit, chaque valeur prédite est atteinte au
dixième de milliseconde **chez ffmpeg**, tandis qu'`afconvert` **ne bouge pas d'un dixième** :

| `media_time` falsifié | ffmpeg mesuré | ffmpeg prédit | `afconvert` |
|---|---|---|---|
| 2112 (la valeur juste) | +4,2 ms | +4,2 ms | +4,2 ms |
| 0 | +48,2 ms | +48,2 ms | +4,2 ms |
| 4224 (le double) | **−39,8 ms** | −39,8 ms | +4,2 ms |
| 1056 (la moitié) | +26,2 ms | +26,2 ms | +4,2 ms |

`afconvert` **ignore purement et simplement la liste d'édition de la piste audio** : il retire
l'amorce depuis le train AAC, quoi que dise le conteneur. C'est pourquoi ajouter l'`elst` est sans
effet sur **lui** — mécanisme établi, pas coïncidence favorable. **Mais un lecteur, lui, peut très
bien honorer l'`elst` ET trimer l'amorce**, ce qui donnerait les −39,8 ms visibles dans le tableau
ci-dessus. C'est exactement le risque que le contrôle dans QuickTime doit lever, et c'est pourquoi
les quatre MP4 sont fournis.

#### CETTE RECOMMANDATION EST RETIRÉE — AVFoundation double-compense (complément 5)

**Ce que je recommandais** : poser `startTimestamp: -2112/SE` sur la piste audio, puisque ffmpeg
et `afconvert` donnaient alors tous deux +4,2 ms. **C'était insuffisant, et faux pour la pile
Apple.** Mesuré au complément 5 avec AVFoundation — la pile sur laquelle QuickTime Player et le
`<video>` de Safari sont bâtis — par `outils/mesure-avfoundation.swift` :

| Décodeur | `A-SANS` 48 kHz | `A-AVEC` 48 kHz | `A-AVEC` 44,1 kHz | `F-CALIBRATION` (8448) |
|---|---|---|---|---|
| **AVFoundation** | **+4,2 ms** | **−39,8 ms** | **−43,7 ms** | **−171,8 ms** |
| `afconvert` | +4,2 ms | +4,2 ms | +4,2 ms | +4,2 ms |
| ffmpeg 6.0 | +48,2 ms | +4,2 ms | +4,2 ms | −127,8 ms |

**AVFoundation retire l'amorce ET applique la liste d'édition** : c'est exactement la double
compensation que le complément 3 avait écartée sur la seule foi d'`afconvert`. L'erreur de méthode
était là : `afconvert` ignore la liste d'édition, mais ce n'est pas lui qui joue les fichiers.

Preuve directe, lue dans `AVAssetTrack.segments` : **même sans liste d'édition**, AVFoundation
rapporte un `timeMapping` dont la source commence à **2112/48000 = 44,00 ms** (et 2112/44100 =
47,89 ms), la présentation commençant à 0. Elle connaît donc l'amorce par elle-même, depuis le
train AAC. Ajouter un `elst` de 2112 lui fait retrancher deux fois la même chose. La piste vidéo,
elle, a toujours un `timeMapping` à décalage nul.

**Trois modèles, chacun vérifié sur cinq fichiers :**

- ffmpeg : écart = 44,00 (amorce conservée) + 4,2 (montée au seuil) − `media_time`/48
- `afconvert` : écart = 4,2 (amorce retirée, liste d'édition ignorée)
- AVFoundation : écart = 4,2 − `media_time`/48 (amorce retirée, liste d'édition appliquée)

Le modèle ffmpeg redonne les quatre points de la falsification du complément 3 (`media_time` 0 →
+48,2 ; 1056 → +26,2 ; 2112 → +4,2 ; 4224 → −39,8) et le point de calibration (8448 → −127,8).

**Le compromis, et il n'a pas de bonne réponse par mesure seule :**

| | pile Apple | ffmpeg |
|---|---|---|
| **sans** liste d'édition (état actuel) | **+4,2 ms, juste** | +48,2 ms, hors critère |
| **avec** liste d'édition à 2112 | −39,8 ms (−43,7 à 44,1 kHz), **hors critère à 44,1 kHz** | +4,2 ms, juste |

Aucune des deux colonnes ne tient les 40 ms des deux côtés. **Recommandation révisée : ne rien
écrire, et garder l'état actuel** — la plate-forme visée est Safari, elle est déjà juste, et la
correction la dégraderait. Mais c'est un arbitrage, pas un résultat de mesure, et il revient à
Christophe : le paquet contient les quatre fichiers et un fichier de calibration exagéré pour qu'il
l'entende lui-même. **Rien n'est appliqué ici** : le module de montage n'existe pas encore, et ce lot ne
modifie aucun fichier existant.

**Ce qu'AVFoundation ne démontre PAS, et c'est important.** `AVAssetReader` est un décodeur de
composition, pas un lecteur. QuickTime Player, le `<video>` de Safari et celui de Chrome ont leur
propre chaîne de rendu et leur propre synchronisation audio-vidéo. Le résultat ci-dessus rend très
plausible un décalage audible sur la variante AVEC dans QuickTime — il ne le démontre pas. C'est
pour cela, et pour cela seulement, que le fichier de calibration existe.

**Ce qui n'est PAS prouvé.** La valeur 2112 est l'amorce AAC-LC d'Apple telle que `afinfo` la
déclare, vérifiée identique sur les MP4 des **deux** moteurs (Chromium : 2112, WebKit : 2112). Un
autre encodeur, une autre plate-forme ou une autre version pourraient en employer une autre : la
valeur doit être **relue sur le fichier produit**, jamais figée en constante. Et seuls deux
décodeurs ont été éprouvés ; aucun lecteur matériel ne l'a été.

**Les boîtes qui pourraient porter l'amorce sont toutes absentes.** Recensement direct par
`outils/boites-amorce.cjs` sur les cinq MP4 produits — refait en Node après qu'un premier
dépouillement en shell soit revenu à zéro littéral même pour `stts` et `mvhd`, ce qui était
impossible et signalait un script cassé, non un fichier vide :

| Boîte | Présente ? |
|---|---|
| `edts` / `elst` (liste d'édition) | **absente** |
| `sgpd` / `sbgp` / `roll` (groupes d'échantillons) | **absentes** |
| `iTunSMPB` (via `udta`/`meta`/`ilst`) | **absente** |
| `ctts` (décalages de composition) | absente |
| `esds`, `btrt` | présentes |

L'amorce n'est donc **déclarée nulle part dans le conteneur** : CoreAudio la compense parce qu'elle
est inscrite dans le train AAC lui-même, pas parce que le MP4 l'annonce. **Ce qui n'est pas prouvé :
qu'un décodeur non-Apple la compense aussi, ni qu'un LECTEUR, Apple ou non, se comporte comme le décodeur qu'il embarque.** Rien dans ce banc ne le dit, et le fichier ne lui donne
aucune indication pour le faire.

**Mediabunny SAIT écrire une liste d'édition — il ne le fait simplement pas ici.** Vérifié dans le
`dist` de la version 1.61.1 (`outils/mediabunny-boites.cjs`), méthode validée au préalable en
confirmant la présence des littéraux `stts`, `stsd`, `mvhd`, `mdhd`, `moov`, `ftyp` :
`edts` et `elst` apparaissent **3 fois chacun** — une occurrence d'**analyseur** (`case "elst":`)
et deux d'**écriture** (`box("edts", void 0, [ fullBox("elst", …`, avec `mediaTime`,
`mediaDuration`, `startOffset` et des replis 64 bits). `sgpd`, `sbgp` et `roll` : **aucun
littéral**. Si un jour un décodeur non-Apple devait être visé, la voie existe donc dans la
bibliothèque ; elle n'est **pas** nécessaire pour Safari.

**Le critère « durée vidéo = durée audio à une image près » tombe pour la même cause** : la durée
de la piste audio inclut les 2112 échantillons d'amorce, d'où les 44 à 75 ms d'écart. `afinfo`
annonce d'ailleurs une durée estimée de **20,009 s** là où Mediabunny en calcule **20,056 s** —
l'écart de 47 ms est exactement l'amorce.

**La limite « mesure non indépendante de Mediabunny » est levée côté AUDIO, elle subsiste côté
VIDÉO.** L'audio est désormais relu par un décodeur tiers — `afconvert`/CoreAudio — et c'est lui
qui a renversé la conclusion. L'alignement des **images**, en revanche, passe toujours par le
décodeur vidéo de Mediabunny, car `afconvert` n'extrait que l'audio. Le « t = 0 s de la première
image » du tableau ci-dessus reste donc une mesure non indépendante. **Non levé.**

**Une image tenue coûte une image, et cela se voit** : **33 échantillons vidéo pour 20 secondes**
là où peindre chaque image en produirait 600, soit **18 fois moins**. C'est ce qui explique un
export court à 300–560 ms.

**L'export de 10 minutes aboutit largement.** Mesuré sur Chromium : **8,2 s d'encodage** pour
600 s de vidéo — soit **73 fois plus rapide que le temps réel** — **17,5 Mo**, **508 images
écrites** au lieu des 18 000 qu'exigerait un rendu image par image (**35 fois moins**), et
**aucun plantage**. L'écart vidéo−audio y est de **−0,064 s**, du même ordre que sur l'export
court : c'est bien le même décalage constant, **et non un effet de la durée**. Cet écart est mesuré
par les décodeurs de Mediabunny : au vu du décodage CoreAudio ci-dessus, il s'agit donc du même
artefact de mesure, et non d'un défaut du fichier. **Non revérifié par `afconvert` sur l'export
de 10 minutes** — seul l'export court l'a été.
La **mémoire** de Safari pendant cet encodage reste la seule mesure que ce banc ne peut pas
prendre — aucune API ne la donne à une page.

---

## Problèmes rencontrés

1. **Le cache npm contient des fichiers appartenant à `root`** — `npm install` échoue en demandant
   `sudo chown -R 501:20 ~/.npm`, que je ne peux pas exécuter. Contourné par un cache local
   (`--cache ./cache-npm`). **À corriger un jour côté machine.**
2. **`ffprobe` et `ffmpeg` sont absents.** Plutôt que de laisser le critère « durée vidéo = durée
   audio » non vérifiable, j'ai écrit `outils/lire-mp4.cjs`, qui lit les boîtes normalisées.
3. **SnapDOM ne se charge pas sous `file://`** : c'est un module ES, et son import échoue sans
   serveur. Les bancs sont donc servis en `http://127.0.0.1` — ce que le brief demandait déjà.
4. **Deux premières comparaisons « incomparables »** faute de géométrie commune (voir essai 2).
   Résolu par la mesure, pas par une tolérance élargie.
5. **`safaridriver` existe mais exige une autorisation manuelle** dans Safari. La page
   `essai2-candidats.html` ne l'exige pas ; la marche à suivre y est écrite.
6. **Le micro en `http://localhost`** n'a pas pu être éprouvé dans Safari : seul Chromium a été
   piloté. La page le dit, et vérifie l'origine au chargement. Si Safari refusait malgré
   `localhost`, la solution serait un **HTTPS local** (certificat auto-signé approuvé dans le
   Trousseau, puis `python3 -m http.server` derrière un petit proxy TLS) — **non implémenté**,
   conformément au brief.
7. **Un dépouillement en shell est revenu à zéro littéral même pour `stts` et `mvhd`** —
   impossible, donc script cassé (zsh : « bad math expression ») et non fichier vide. Refait en
   Node. **C'est l'impossibilité du résultat qui a servi de garde-fou, pas un message d'erreur** ;
   sans ce réflexe, j'aurais conclu « aucune boîte » à partir d'un outil muet.
8. **Deux explications fausses successives du 1422×1080** (rognage par la fenêtre, puis règle
   `!important`), toutes deux écartées par la mesure avant de trouver la compression **flex**.
   J'avais écrit la première dans un commentaire de l'outil comme si elle était établie : elle y a
   été corrigée. Une **assertion** y refuse désormais toute capture dont la mise en page réelle
   n'est pas la mise en page visée.
9. **Les sorties de mesure sont suivies par git sur cette branche** — 124 PNG (7 Mo) dans
   `images/` et 13 fichiers dans `mesures/`, dont un WAV. Cela **contredit la consigne « ne
   jamais commiter un fichier produit par une mesure (dépôt public) »**. La branche n'étant pas
   poussée, rien n'est publié. J'ai étendu `.gitignore` à `images/` et `mesures/`, ce qui
   retient les **nouvelles** sorties mais ne désindexe pas les anciennes — git continue de suivre
   ce qui est déjà indexé. **Le sort des 137 fichiers déjà suivis est un arbitrage de Christophe,
   à trancher avant tout push** : les désindexer (`git rm --cached`) les retire de l'état suivi
   mais laisse leurs octets dans l'historique de la branche ; un effacement complet exigerait de
   réécrire cet historique, ce que je n'ai pas fait. **Tranché au complément 3** : la branche
   `lot0-bancs-essai-propre` repart de la base de fusion avec `origin/main` et ne porte que
   les sources. `lot0-bancs-essai` est conservée intacte, rien n'a été supprimé.
10. **Une apostrophe échappée dans un littéral gabarit a cassé la page forgée.** `d\'1 px` dans
    le gabarit produisait `d'1 px` dans le fichier écrit, soit une chaîne non terminée : le
    navigateur rendait « Unexpected EOF » et le panneau ne s'installait jamais. L'outil
    `forger-page-nettete.cjs` **soumet désormais le script injecté à l'analyseur de Node avant
    d'écrire**, et refuse de livrer s'il ne parse pas.
11. **L'ancre d'injection existait trois fois, dont deux dans du code.** `</body></html>` apparaît
    aussi à l'intérieur de chaînes JavaScript de l'export (`adocResolveImages` construit un
    document en mémoire). Un `replace` ordinaire frappait la première et coupait cette chaîne en
    deux. L'outil prend la **dernière** occurrence et **exige qu'elle termine le document**, sans
    quoi il s'arrête. Les deux fautes se sont manifestées par la même erreur de navigateur, ce qui
    rendait la seconde invisible tant que la première n'était pas corrigée.
12. **Troisième faute de la même famille : le gabarit a mangé mes `\d`.** Le harnais est écrit
    depuis un littéral gabarit, qui consomme les séquences d'échappement : `/width="(\d+)"/`
    arrivait dans la page en `/width="(d+)"/`. Le candidat (d) échouait donc sur « dimensions
    illisibles » alors que la balise les portait. **Le contrôle de syntaxe ne pouvait pas le voir** :
    le code restait valide, il était seulement devenu faux. `forger-page-nettete.cjs` **refuse
    maintenant tout antislash survivant** dans le harnais hormis `\n`, et les regex y sont
    écrites en `[0-9]`. Les trois fautes du lot viennent de la même cause : du code JavaScript
    produit depuis un gabarit JavaScript.
13. **J'ai failli rapporter deux gains de netteté inexistants** (153 et 181,9 contre 92,5). Voir
    ci-dessus : la métrique ne sait pas si elle mesure la même image. Un garde-fou de comparabilité
    a été ajouté et validé dans les deux sens. **C'est l'insistance du brief à éprouver les deux
    leviers avant de conclure qui a produit à la fois le faux gain et sa réfutation.**

---

## Contrôle humain — le paquet, et la frontière de ce qui est prouvé

```bash
node "outils/paquet-controle-humain.cjs"
```

L'arbre de travail durable de cette branche, créé pour que le paquet ait un chemin stable :

    /Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot0-propre-wt

Le paquet s'y trouve sous `tools/Projet therapeutes/Conseiller Clinique/bancs-essai-atelier/controle-humain`.
La commande unique, les chemins absolus et la marche à suivre dans Safari sont dans
`INSTRUCTIONS.md`. **Vérifié** : la commande fonctionne lancée depuis `/Users/christophebonnet`
(page, bibliothèques, MP4 et feuille tous en HTTP 200), aucun `cd` relatif n'est nécessaire ; et
après bascule de l'arbre sur `origin/main`, `outils/` disparaît tandis que le paquet reste intact
et que la page mesure encore les mêmes 92,5/120.

Bâtit `controle-humain/`, **ignoré par git** et **autonome** : une fois produit, il ne dépend
d'aucun fichier suivi, donc il s'ouvre encore après un changement de branche (vérifié). L'outil
imprime le **chemin absolu** du dossier et la **commande unique** à copier-coller ; les deux sont
aussi écrits dans `controle-humain/INSTRUCTIONS.md`, une page.

Contenu : quatre MP4 de 12 s (`A-SANS-` et `A-AVEC-liste-edition-` × 48 000 et 44 100 Hz), un
cinquième de **calibration** (`F-CALIBRATION-liste-edition-exageree-48000Hz.mp4`, `media_time`
8448 = quatre fois l'amorce, soit 176 ms — relu dans les octets avant livraison), la vidéo de
comparaison de 20 s (`B-…-moteur-haut-snapdom-bas.mp4`, conservée pour mémoire, la netteté étant
acceptée) et trois pages autonomes : netteté (`C`), micro (`D`, avec son worklet) et exports MP4
(`E`). Le fichier de calibration est exagéré **pour être audible sans appareil** : c'est le seul
moyen de savoir si un lecteur applique la liste d'édition. Les MP4 sortent du **même code** que ceux mesurés par ffmpeg et
`afconvert` (`outils/produire-mp4-essai.cjs`), parité revérifiée après la factorisation : sinon
l'écoute ne porterait pas sur ce qui a été mesuré. La présence ou l'absence de `elst` est
contrôlée dans chaque fichier avant livraison.

**La vidéo de comparaison est un partage HAUT/BAS, et c'est délibéré.** Deux moitiés côte à côte
feraient 960 px de large chacune, ce qui obligerait à réduire les images de moitié — exactement
l'opération qui détruit ce qu'il s'agit de juger. Le partage horizontal garde la largeur entière et
les **pixels d'origine** : chaque moitié est la bande des 540 premières lignes de sa source, sans
aucun rééchantillonnage, et un **seul** encodage libx264 crf 14 couvre les deux côtés. Limite
assumée : cet encodeur n'est pas celui du module réel (WebCodecs) ; le jugement porte donc sur les
**images**, le chemin WebCodecs étant couvert par l'essai 3.

### La page du micro interprète désormais la prise elle-même

Une prise de 5 minutes dans Safari ne vaut que si l'on sait la lire. Quatre diagnostics ont été
ajoutés à `essai1-micro.html`, éprouvés par `test-essai1-diagnostics.cjs` (4/4), le test
existant restant à 4/4 :

| Diagnostic | Ce qu'il tranche | Mesuré en Chromium (micro factice) |
|---|---|---|
| RMS par canal + corrélation | si les deux canaux sont **identiques** | 2 canaux, **−17,2 dBFS chacun**, corrélation **1**, écart maximal **0** → identiques au bit près |
| Niveau par demi-seconde sur le silence | si quelqu'un a parlé pendant les 3 s | 6 tranches, de −17,0 à −17,0 dBFS, amplitude **0 dB** → fenêtre homogène |
| Journal de tous les appuis | « aucun appui » contre « appui non capté » | 5 appuis reçus, 3 posant un repère, 2 non (`b`, `Escape`) → 3 repères |
| Durée et repères dans `mesures.json` | — | durée 5,7644 s, 3 repères, 5 appuis |

**Le cas des canaux identiques méritait d'être nommé** : le micro factice de Chromium livre deux
canaux rigoureusement identiques, et une corrélation de 1 n'y signifie qu'une duplication. La page
le dit maintenant en clair plutôt que d'afficher un 1 trompeur, et elle dit aussi « sans objet »
quand un seul canal est livré, au lieu de masquer la ligne.

**Le journal des appuis est le seul diagnostic qui permette de conclure sur la télécommande.** Sans
lui, une télécommande muette et une télécommande dont la touche n'est pas interprétée produisent la
même page vide. La falsification du test envoie exprès deux touches qui ne posent pas de repère et
exige que le journal les montre tout en laissant le compte de repères à 3.

**Ce qui n'est pas prouvé** : le micro factice de Chromium n'est pas le micro du Mac. Les valeurs
ci-dessus montrent que les diagnostics fonctionnent, pas ce que livrera le matériel réel.

### La frontière, explicitement

**Vérifié avec un décodeur** — et trois décodeurs ne s'accordent pas, ce qui est le résultat le
plus important du lot :

| Question | Statut |
|---|---|
| `afconvert` place-t-il le bip à l'heure ? | **vérifié avec afconvert** : +4,2 ms, avec et sans `elst` — il ignore la liste d'édition |
| ffmpeg place-t-il le bip à l'heure ? | **vérifié avec ffmpeg** : +48,2 / +52,1 ms sans `elst`, +4,2 ms avec — il conserve l'amorce et applique la liste |
| AVFoundation place-t-elle le bip à l'heure ? | **vérifié avec Swift/AVFoundation** : +4,2 ms sans `elst`, **−39,8 / −43,7 ms avec** — elle retire l'amorce ET applique la liste |
| AVFoundation connaît-elle l'amorce sans `elst` ? | **vérifié** : `AVAssetTrack.segments` donne un `timeMapping` de source 2112/48000 = 44,00 ms, présentation 0 |
| L'`elst` écrit porte-t-il la valeur annoncée ? | **vérifié** dans les octets : 2112 pour `A-AVEC`, 8448 pour `F-CALIBRATION` |
| Le gradient sur contours de SnapDOM vaut-il 92,5 ? | **vérifié par script**, sur six chemins, en WebKit piloté |

**À vérifier par Christophe**, parce qu'aucun script ne le peut :

| Question | Où |
|---|---|
| Le bip tombe-t-il avec le flash sur les cinq MP4 ? | **QuickTime Player, Safari, Chrome** — les trois, car rien ne dit qu'ils s'accordent |
| Un lecteur applique-t-il la liste d'édition ? | `F-CALIBRATION` : bip nettement en avance = appliquée ; aucun écart = ignorée |
| Safari réel refuse-t-il `foreignObject` vers canvas ? | page `C` — WebKit piloté n'oppose aucun refus |
| Le « Mode micro » (Voix isolée) apparaît-il ? | page `D`, Centre de contrôle pendant une prise de 5 min |
| Une prise survit-elle à l'arrière-plan et à la fermeture d'onglet ? | page `D`, étapes 5 et 6 |
| Quelle mémoire Safari consomme-t-il pendant l'export de 10 min ? | page `E` + Moniteur d'activité — aucune API ne la donne à une page |
| Les durées d'export et la taille des fichiers | page `E`, affichées par la page pour les deux exports |
| Le micro du Mac livre-t-il un ou deux canaux, et identiques ? | page `D`, tableau « Canaux livrés » — le micro factice en livre deux identiques, le matériel réel reste à voir |
| La fenêtre de silence est-elle vraiment silencieuse ? | page `D`, niveau par demi-seconde |
| La télécommande envoie-t-elle quelque chose à la page ? | page `D`, journal des appuis — « aucun appui » et « appui non capté » y sont distincts |
| L'écart de netteté gêne-t-il en vidéoprojection ? | **acquis : accepté par Christophe, SnapDOM est retenu** |

---

## Ce que Christophe doit tester lui-même — moins de 15 minutes

Servir d'abord le dossier, une seule fois :

```bash
cd "tools/Projet therapeutes/Conseiller Clinique/bancs-essai-atelier" && python3 -m http.server 8000
```

1. **(5 min) Micro** — ouvrir `http://localhost:8000/essai1-micro.html`, cliquer « Demander le
   micro », et **noter ce que la page affiche** : nombre de canaux, fréquence, et les trois
   traitements. Puis une prise de 5 minutes en lisant un texte, 3 s de silence au début, 5 marqueurs
   au clavier puis 5 à la télécommande. Pendant la prise, ouvrir le **Centre de contrôle** et noter
   si « Mode micro » (Voix isolée) s'affiche.
2. **(1 min) Arrière-plan** — pendant la même prise, passer l'onglet en arrière-plan 60 s, revenir,
   et noter si la durée en échantillons a suivi l'horloge.
3. **(1 min) Récupération** — fermer l'onglet sans arrêter, rouvrir la page, cliquer « Récupérer la
   dernière prise ». Télécharger `voix.wav` et **l'ouvrir dans QuickTime Player**.
4. **(2 min) Capture** — ouvrir `http://localhost:8000/essai2-candidats.html`, cliquer « Lancer la
   mesure », puis télécharger `mesures.json`. Noter si une **première prise** sort vide.
5. **(3 min) Comparaison à l'œil** — ouvrir `essai2-comparaison.html` et regarder les trois
   colonnes. **Trois questions, dans cet ordre** : les **chiffres** affichent-ils leur valeur
   finale (« 37 % » et non « 16 % ») sur les étapes du jeu `nombres` ? Les **polices** sont-elles
   identiques ? Les **photos** sont-elles présentes ? Un écart de 1,4 % peut être invisible comme
   il peut trahir une police de remplacement.
   *Et une question de jugement, pas de mesure* : comparer `images/geo-c-moteur-1920.png` (net,
   rendu par le moteur) à `images/geo-b-…` ou `geo-scale_1920_1422.png` (SnapDOM à 1920, plus
   doux) — ces PNG n'étant pas au dépôt, ils apparaissent après
   `node outils/mesure-geometrie.cjs`. **La différence est-elle acceptable pour une vidéoprojection ?** C'est elle qui décide si
   le module peut se contenter de SnapDOM. **Cette question est maintenant la seule qui reste
   ouverte sur la netteté** : les quatre chemins SnapDOM mesurés donnent tous le même résultat, y
   compris l'enveloppe en page à 1920 ajoutée par le complément 2. L'écart équivaut au rendu du
   moteur flouté d'environ un pixel — un ordre de grandeur, à juger à l'œil sur le projecteur.
6. **(4 min) Netteté dans TON Safari** — produire la page, puis l'ouvrir :
   `node outils/produire-exports.cjs && node outils/forger-page-nettete.cjs`, puis
   `http://localhost:8000/entrees/nombres-nettete.html`. Cliquer « Préparer », puis
   « Tout mesurer », puis « Télécharger ». **Trois questions** : Safari **refuse-t-il** la lecture
   du canvas (le panneau afficherait « REFUS DE SÉCURITÉ ») ? Les gradients valent-ils **92,5**
   comme en WebKit piloté, ou autre chose ? Et à l'œil, sur les deux PNG téléchargés : la douceur
   du texte **gêne-t-elle en vidéoprojection** ? C'est cette dernière question, de jugement et non
   de mesure, qui décide si le module peut se contenter de SnapDOM.
7. **(3 min) MP4** — ouvrir `http://localhost:8000/essai3-mp4.html`, cliquer « Interroger les
   encodeurs », puis « Produire l'export court ». Télécharger `court.mp4` et **l'ouvrir dans
   QuickTime Player** : le flash et le bip doivent tomber ensemble. **C'est la confirmation à
   l'oreille d'une prédiction mesurée** — le décodage par CoreAudio donne +4,2 ms, donc aucun
   décalage perceptible. Si un décalage s'entendait malgré tout, c'est la mesure `afconvert` qui
   serait à reprendre, pas le fichier à corriger. Puis « Produire l'export long »
   et **relever la mémoire de Safari dans le Moniteur d'activité** — c'est la seule mesure que la
   page ne peut pas prendre.
