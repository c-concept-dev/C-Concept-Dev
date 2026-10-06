# Lot 2 — Chutier visuel : le moteur

Le moteur seul, sans interface de chutier dans l'application, comme demandé. La page qui l'exerce
vit dans `banc-chutier/`, ignoré par git.

---

## 1. Ce qui est construit

**`atelier-images.js`**, fichier **séparé** de `studio-clinique-core.js` — le CDC l'exige, et le
cœur dépasse 23 000 lignes. Il expose `window.AtelierImages`.

Pour une Présentation : il énumère les étapes avec la fonction du lot 1a, **pilote le vrai
lecteur** dans une scène hors écran à **1422×800**, attend la fin des animations, capture avec
SnapDOM 3.3.0 épinglé, et compose un canvas de **1920×1080 exactement**.

**Il ne réimplémente aucune règle du lecteur.** La révélation vient d'`adocPresentApplyReveal` et
d'`adocPresentRevealNext`, appelées telles quelles sur la scène hors écran. C'est pour cela que
`adocPresentRevealNext` a reçu un paramètre `innerEl` **optionnel** plutôt qu'une seconde règle
écrite dans l'atelier.

**Trois ajouts au cœur, aucun qui change le comportement existant** : le mode capture (une ligne,
lue sur `window` et non dans une constante de module, parce que cette fonction part dans chaque
export autonome), le paramètre de scène, et une surface étroite de trois fonctions plus la
référence fixe.

---

## 2. Les exigences V1 à V7, une par une

| | Exigence | État | Mesure |
|---|---|---|---|
| **V1** | Une image 1920×1080 par étape, en pilotant le vrai lecteur | **tenue** | 11 images sur trois présentations, 40 sur une quatrième ; toutes à 1920 de large |
| **V2** | Vignettes dans l'ordre, avec diapositive, étape et titre | **tenue dans le banc, pas dans l'application** | la page du banc les affiche ; l'interface du chutier côté produit n'était pas demandée à ce lot |
| **V3** | Une diapositive qui déborde est capturée sur toute sa hauteur | **tenue** | questionnaire : scène **1108 px**, image **1920×1496**, hauteur portée dans les métadonnées |
| **V4** | Les images périmées sont signalées, jamais remplacées en silence | **tenue** | trois états distincts : périmée, disparue, nouvelle |
| **V5** | Images compressées en mémoire, décodées une à la fois ; JPEG haute qualité et PNG | **tenue** | 40 images = **3,33 Mo compressés** ; **jamais plus d'une décodée** ; 40 décodées pèseraient 316 Mo |
| **V6** | Attendre la fin des animations, ou passer en mode capture | **tenue, par les deux voies** | mode capture : 268 ms par image. Attente de 800 ms : **794 ms de plus par image** |
| **V7** | Capture sur la mise en page réelle (1422×800), agrandie sur 1920×1080 exactement | **tenue** | la scène est vérifiée à 1422×800 avant chaque capture, et la capture refusée sinon |

---

## 3. Vérifié par script

| | Résultat |
|---|---|
| `verify-atelier-images` | **13/13** |
| `verify-banc-chutier` | **6/6** — page forgée, servie, boutons cliqués, fichiers relus |
| `falsifier-atelier-images` | **7/7 mutations détectées**, sources restaurées à empreintes identiques |
| Régression ciblée | **21 tests, 0 échec**, dont les six de l'export autonome |
| Empreinte du schéma d'outil | `b1b0155cb8eba26c`, 6679 o — **avant et après**, inchangée |

**Les chiffres mesurés.**

| Présentation | Étapes | Images | Poids compressé | Durée | Par image |
|---|---|---|---|---|---|
| Couverture avec photo | 3 | 3 | 0,51 Mo | 834–883 ms | 288 ms |
| Texte dense | 4 | 4 | 0,36 Mo | 1 032–1 094 ms | 263 ms |
| Questionnaire et chiffres | 4 | 4 | 0,38 Mo | 846–903 ms | 216 ms |
| **Quarante étapes** (10 diapositives × 4 blocs) | **40** | **40** | **3,33 Mo** | **10 715 ms** | **268 ms** |

Le coût par image est stable entre 11 et 40 images (216 à 294 ms). **Il n'est pas extrapolé
au-delà** : rien ici ne dit ce que donnent 120 étapes.

**Le coût par image n'est pas celui de SnapDOM seul.** Le lot 0 mesurait 52 à 61 ms pour la
capture. Les 268 ms couvrent tout le pas : rendre la diapositive, résoudre son image, attendre la
stabilité, mesurer le débordement, capturer, composer le canvas, encoder le PNG et calculer la
signature.

**Le défaut que V6 nomme, reproduit puis empêché.** En retirant la ligne du mode capture, la
falsification capture **« 13 % »** là où le document porte **« 37 % »** — exactement le défaut du
lot 0, qui montrait 16 % au lieu de 37 %. Avec la ligne, les 20 blocs capturés portent le texte
exact du document, dont 4 commençant par un chiffre.

**Ce que la falsification a trouvé de creux dans mes propres contrôles**, et qui est corrigé :

1. **Le compteur d'images décodées comptait celle que j'avais notée**, pas les bitmaps vivants. En
   retirant la libération, l'ancien fuyait et le compteur annonçait toujours 1. Un compteur qui ne
   peut pas voir la fuite qu'il interdit ne sert à rien. Corrigé dans le moteur.
2. **Le débordement n'était qu'imprimé**, jamais exigé : un moteur qui n'en détectait aucun passait
   le test. Le questionnaire doit déborder, et c'est maintenant affirmé.
3. **Signer les seuls blocs visibles passait le test**, masqué par le nombre total d'étapes. Un cas
   a été ajouté : modifier le texte d'un bloc **plus tardif** doit périmer l'étape 1, parce que ce
   bloc occupe déjà sa place.
4. Une quatrième mutation s'est révélée **équivalente** — forcer les dimensions au dessin ne change
   rien, l'échelle 1920/1422 tombant déjà juste. Ce n'était pas un trou : c'est noté dans le
   falsificateur, et remplacé par une mutation observable.

---

## 4. Deux erreurs que j'ai faites, et ce qu'elles ont coûté

**La hauteur dépliée, mesurée faux.** Je libérais la hauteur de la scène pour lire la hauteur
nécessaire. Une carte de deux paragraphes rendait **157 px au lieu de 800** : la carte se
dimensionne en pourcentage de sa scène, donc libérer la scène la fait s'effondrer au lieu de la
déplier. Le chiffre était plausible, et complètement trompeur. Mesuré désormais par `scrollHeight`,
sur la scène en place.

**La référence exposée trop tôt.** J'avais posé `window.adocPresentReference` auprès des autres
exposées, à la ligne ~8230. `ADOC_PRESENT_REF_W` est un `const` déclaré à la ligne ~17870 : la
lecture levait « Cannot access before initialization », ce qui **interrompait tout le cœur** — plus
aucune fonction n'existait et la page ne chargeait plus. Trouvé en ouvrant la page, pas en relisant.

---

## 5. Deux précisions qui ne sont pas des défauts, mais qui se disent

**Le rapport d'image.** La scène fait 1422×800, soit 1,7775 ; la sortie fait 1920×1080, soit
1,7778. La composition étire donc le contenu de **0,17 px** sur la hauteur. C'est sous le seuil du
visible, mais ce n'est pas zéro.

**`performance.memory` n'est pas une mesure.** Chrome en quantifie la valeur et ne la rafraîchit
que rarement : l'écart ressort à 0,00 Mo quoi qu'il se passe, constaté ici. La page l'affiche avec
cette limite écrite à côté. La vraie grandeur est le **poids compressé**, et la mémoire du
processus se relève dans le Moniteur d'activité, qu'aucune page ne peut interroger.

---

## 6. À vérifier par Christophe

1. **La netteté, sur son écran et sur son projecteur.** C'est la question que le lot 0 a laissée
   ouverte et qu'aucun script ne tranchera : le texte agrandi est l'équivalent du rendu natif
   flouté d'environ 1 px. Les images JPEG téléchargées depuis le banc sont faites pour cela.
2. **Les captures dans SON Safari.** Tout ce rapport est mesuré dans Chromium. Le CDC nomme le
   risque : « capture de la page ratée dans Safari, polices, image vide à la première capture ».
   Rien ici ne l'écarte.
3. **Le questionnaire qui déborde.** Il est capturé sur 1920×1496. Reste à juger si le défilement
   pendant le commentaire (lot 7) est la bonne réponse, ou s'il vaut mieux le découper en étapes.
4. **Les trois présentations d'essai** sont fabriquées pour le banc. Une présentation réelle de
   Christophe dirait des choses que celles-ci ne peuvent pas dire.

**Pour ouvrir le banc — une seule commande, chemins absolus.** Un module ES ne s'importe pas depuis
`file://` : il faut un serveur, sans quoi SnapDOM ne se charge pas et rien ne se capture.

```
python3 -m http.server 8765 --directory "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" & sleep 1 && open "http://127.0.0.1:8765/banc-chutier/chutier.html"
```

Pour l'arrêter : `kill %1`. Pour reforger la page :
`node "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique/tests/forger-banc-chutier.cjs"`

---

## 7. Suite du 6 octobre — ce que la capture retire, et quatre réglages de typographie

### 7.1 Ce que la capture retire (approuvé par Christophe)

Une couche de style qui ne s'applique qu'à la scène hors écran, par l'attribut
`[data-atelier-capture]` que seule cette scène porte. **Mesuré sur chaque étape des trois
présentations :**

| | Avant | Après |
|---|---|---|
| Bordure de la carte | 1 px | **0 px** |
| Rayon de la carte | 12 px | **0 px** |
| Ombre | — | **aucune** |
| Loupe d'agrandissement visible | 1 | **0** |
| Éléments habillés en bouton | 17 | **0** |
| Hauteur du questionnaire | 1 496 px | **1 125 px** (scène 833 au lieu de 1 108) |

Les questions et les libellés de réponses restent — c'est vérifié positivement, pas seulement
l'absence du reste. Seize éléments demeurent cliquables **dans le DOM** ; aucun ne ressemble plus
à un bouton **à l'image**, et seule cette seconde propriété se voit sur une vidéo. Le contrôle
exige aussi qu'au moins une étape porte une loupe dans son DOM : sans cela, « aucune visible »
serait vrai faute de loupe, et ne prouverait rien.

**Deux lectures que j'ai tranchées, et qui se renversent en une ligne.**

1. **La grille des profils** du questionnaire (`.adoc-sc-questionnaire-scale`) est masquée. Vous
   avez écrit « sans barèmes interactifs » ; cette grille est un barème. L'export PDF, lui, la
   montre, pour permettre un calcul manuel — ce qu'une vidéo ne permet pas. Si vous la vouliez
   visible, c'est une règle à retirer de `CSS_CAPTURE`.
2. **Le quiz garde sa réponse cachée.** Vous n'avez parlé que du questionnaire. Le PDF dévoile la
   réponse d'un quiz ; la dévoiler à l'image, au moment même où la question s'affiche, irait contre
   l'intention d'un quiz. Seul l'habillage de bouton de ses options est retiré.

**Rien ne fuit hors capture**, et c'est le point sur lequel vous avez été explicite. Le même
document rendu dans l'espace de travail **avant** et **après** une capture à 960×540 avec échelle
×1,6 donne exactement les mêmes valeurs : bordure 4 px, rayon 12 px, texte 15 px. Aucune marque de
capture ne survit dans la page. Et **les dix règles de la couche sont toutes portées par
`[data-atelier-capture]`** — vérifié en lisant les sélecteurs de la feuille, un par un.

### 7.2 Quatre réglages, mesurés

| Réglage | Texte (médiane) | Étendue | Déborde | Remplissage | Temps |
|---|---|---|---|---|---|
| **(a)** 1422×800, échelle 1 | 20,3 px — **1,88 %** | 20,3 à 30,4 px | 1 / 11 | 16,2 % | 260 ms |
| **(b)** 960×540, échelle 1 | 30,0 px — **2,78 %** | 30 à 45 px | 1 / 11 | 24,9 % | 223 ms |
| **(c)** 1422×800, typo ×1,6 | 32,4 px — **3,00 %** | 32,4 à 48,6 px | 1 / 11 | 26,1 % | 226 ms |
| **(d)** 960×540, typo ×1,4 | 42,0 px — **3,89 %** | 42 à 63 px | **5 / 11** | 37,2 % | 230 ms |

Pourcentages rapportés aux 1 080 px du cadre. Onze étapes, trois présentations d'essai.

**Ce que les chiffres disent déjà.**

- **(d) fait déborder cinq étapes sur onze** au lieu d'une. L'échelle typographique grossit le
  texte dans des boîtes qui ne grandissent pas : au-delà d'un certain point, tout déborde.
- **Le temps ne départage rien** : 223 à 260 ms par image, l'écart est dans le bruit.
- **(b) est exactement en 16:9.** 960/540 vaut 1,7778, là où 1422/800 vaut 1,7775 : l'étirement de
  0,17 px signalé plus haut disparaît.

**Ce que les chiffres ne disent pas, et que je n'ai pas mesuré.** Les réglages (b) et (d)
agrandissent la scène d'un facteur **2,0** au lieu de 1,35. Le lot 0 a mesuré la douceur du texte
à 1,35 seulement — l'équivalent d'un flou d'environ 1 px. À 2,0, elle sera plus marquée, et **de
combien n'est pas mesuré**. Je n'ai volontairement pas produit un indicateur de netteté comparant
les quatre réglages : le lot 0 a établi qu'un gradient sur contours n'est pas comparable entre deux
images dont le contenu n'est pas à la même échelle — c'est ainsi que le zoom CSS et le SVG avaient
donné deux faux gains. **C'est donc la planche, à l'œil, qui tranche ce compromis.**

### 7.3 La planche comparative

`banc-chutier/planche-typo.html` — onze étapes, quatre réglages, côte à côte. Rien n'est centré
verticalement : les quatre variantes d'une étape commencent à la même ligne. Les vignettes font
440 px ; **pour juger la lisibilité réelle, ouvrez une image dans un onglet**, elle s'affichera à
sa taille.

```
python3 -m http.server 8765 --directory "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-typo.html"
```

Et le banc lui-même, qui porte maintenant les deux réglages :

```
python3 -m http.server 8765 --directory "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/chutier.html"
```

Pour arrêter le serveur : `kill %1`.

### 7.4 Une de vos vraies présentations, sans qu'elle sorte de votre Mac

Il n'existe aujourd'hui **aucun bouton pour exporter le JSON d'un document** — je l'ai cherché
avant de proposer autre chose. Trois voies, de la plus simple à la moins :

1. **La page du banc EST l'application.** Réduisez le panneau (bouton « Réduire le panneau »),
   ouvrez votre présentation comme d'habitude, rouvrez le panneau, cliquez **« Utiliser la
   présentation ouverte »**. Le document est lu **en mémoire**, dans l'objet que l'éditeur
   manipule déjà. Rien n'est exporté, rien n'est écrit sur le disque, rien n'entre au dépôt.
2. **Un fichier JSON que vous avez déjà** : le bouton « Charger un JSON » l'accepte, sous sa forme
   nue ou sous l'enveloppe `{ clinicalDocument: … }`. Le fichier n'est pas copié.
3. **Pour la mesure automatique des quatre réglages** : déposez le JSON dans
   `banc-chutier/entrees/`. Ce dossier est ignoré par git — `git check-ignore` le confirme — et
   l'outil le lit sans jamais le déplacer. La planche inclut alors vos étapes réelles.

**La mesure du remplissage reste à refaire sur une présentation réelle.** Les 16 % à 37 % du
tableau viennent de mes trois présentations d'essai, qui sont courtes. Je ne sais pas ce que
donnent les vôtres, et je ne le devinerai pas.

---

## 8. Suite du 6 octobre — le mode vidéo est le défaut

**Décision appliquée** : le réglage (d) — scène 960×540, échelle typographique ×1,4 — est le
**défaut** de `rendreImages`. Le rendu fidèle au lecteur reste accessible par `mode: 'fidele'` ; il
sert à la mesure de netteté, qui a besoin d'une référence.

### 8.1 Politique de débordement

**Ce que je n'ai PAS pu mesurer, et qu'il faut lire en premier.** Vous demandiez la mesure sur
votre vraie présentation. **Elle n'a pas eu lieu** : rien n'a été déposé dans
`banc-chutier/entrees/`, et je n'ai aucun accès au document ouvert dans votre navigateur. Les
chiffres ci-dessous viennent des trois présentations d'essai, **qui sont courtes** : elles ne
disent rien des vôtres. Trois façons de lancer la vraie mesure sont au point 8.4.

**Un piège trouvé à la mesure.** En mode vidéo, cinq étapes sur onze dépassaient le cadre. Mais
quatre d'entre elles le dépassaient de **six pixels de scène** — douze à l'image — soit un rapport
de 1,01. C'est du bruit de mise en page, pas un débordement. Sans garde, l'atelier aurait fait
défiler une diapositive de douze pixels.

**La politique a donc trois étages**, et un seul vient d'une observation :

| | Valeur | D'où elle vient |
|---|---|---|
| **Zone morte** | 1,02 (soit 2 %) | **Mesurée** : le bruit observé est à 1,01, le vrai débordement à 2,00. Rien entre les deux. |
| **Seuil de scission** | 1,8 | **Calculée, pas observée.** À ce rapport, une étape commentée 15 s fait défiler 864 px de cadre, soit 58 px/s — environ 1,4 ligne par seconde à 42 px. C'est la vitesse de lecture. |
| **Vitesse maximale** | 60 px/s de sortie | Employée **quand la durée est connue**, et elle l'emporte alors sur le rapport. |

**La durée vient du lot 1a.** Une étape narrée porte sa durée estimée (mots ÷ 2,5). Quand elle est
disponible, le verdict ne se prend plus sur un rapport mais sur la **vitesse de défilement réelle** :
la même hauteur donne « défilement » sur une étape de 60 s (8,7 px/s) et « scission » sur une étape
de 4 s (130 px/s). C'est mesuré, et c'est le lien concret entre les deux lots.

**L'indicateur par étape**, sans aucune interface — une donnée que l'atelier lira :
`debordement_px`, `debordement_px_sortie`, `debordement_rapport`, `debordement_verdict`
(`aucun` / `defilement` / `scission`), `debordement_regle` (`tolerance` / `rapport` / `vitesse`),
`debordement_sous_tolerance`, `debordement_vitesse_px_par_s`. Le relevé global compte les trois
verdicts.

**Une conséquence que la mesure a imposée** : sous la tolérance, la capture revient **au cadre**.
Sinon une image de 1 092 px se serait déclarée « sans débordement », ce qui est incohérent — et
toutes les images d'une vidéo doivent faire la même taille sauf quand une diapositive déborde
vraiment.

**Résultat sur les trois présentations d'essai, en mode vidéo** : **1 étape déborde sur 11** — le
questionnaire, rapport 2,00, verdict **scission**, image de 1920×2164. En mode fidèle : 1 sur 11
également, rapport 1,04, verdict défilement.

### 8.2 Netteté : SnapDOM ne coûte rien, et c'est mesuré

**Deux comparaisons, chacune à mise en page ET taille identiques.** Elles ne se comparent pas entre
elles.

| | Natif (navigateur) | SnapDOM | Corrélation | Pixels différents |
|---|---|---|---|---|
| **A.** Scène 1920×1080, échelle 1 | 85,9 | **85,9** | 1,000 | **0 sur 2 073 600** |
| **B.** Scène 960×540 ×1,4, sortie 1920×1080 | 96,8 | **96,8** | 1,000 | **0 sur 2 096 640** |

Gradient moyen sur contours, métrique du lot 0 (seuil 40, moitié médiane des lignes), sur quatre
étapes chacune. Pour B, la référence native est la même scène sous `transform: scale(2)` — le
navigateur y **redessine** le texte à la taille doublée, il ne grossit pas des pixels.

**La mesure n'est pas aveugle**, et c'est vérifié : un témoin comparant deux étapes voisines trouve
**24 151 pixels différents** (1,16 %). Un second témoin n'a pas pu s'exécuter (tailles différentes),
et c'est dit.

**Ce résultat est en tension avec le lot 0, et il faut le dire.** Le lot 0 annonçait 92,5 contre
162,5, soit l'équivalent d'un flou d'environ 1 px — mais avec une corrélation des profils d'encre
de **0,868**, c'est-à-dire deux images qui ne montraient pas exactement la même chose : une mise en
page de 1422 agrandie, contre une mise en page native de 1920. Ici, les deux mises en page étant
rendues strictement identiques, l'écart est **nul, au pixel près**. Le mécanisme est cohérent :
SnapDOM sérialise le DOM en SVG et le fait rastériser par le navigateur **à la taille demandée** —
son `scale` est une échelle de rendu, pas un agrandissement de bitmap.

**Ce que cela change pour la décision** : l'objection principale au réglage (d) — « la scène deux
fois plus petite rendra le texte plus doux » — **n'est pas confirmée**. Mesurée, elle vaut zéro.

**Limite, et elle est entière** : tout ceci est mesuré dans **Chromium**. Le chemin
`foreignObject` de SnapDOM peut se comporter autrement dans Safari, et le CDC nomme déjà ce risque.
Rien ici ne l'écarte.

### 8.3 Mémoire et temps

**Mesuré** — en mode vidéo, sur les présentations d'essai : 240 à 275 ms par image. Sur quarante
étapes : **10 991 ms** (275 ms par image), **5,61 Mo compressés** (144 Ko par image). À comparer aux
3,34 Mo du mode fidèle : le texte étant plus grand, l'image compresse moins bien. Toujours **jamais
plus d'une image décodée** ; quarante le seraient à 316 Mo.

**Non mesuré** : la mémoire et le temps sur une présentation réelle. C'est l'objet du point suivant.

### 8.4 Lancer la vraie mesure

1. **Sans aucun fichier** — `banc-chutier/chutier.html`, bouton « Réduire le panneau », vous ouvrez
   votre présentation, vous rouvrez le panneau, « Utiliser la présentation ouverte ». Le panneau
   affiche le compte d'images, la durée, le poids et les débordements.
2. **Depuis un JSON que vous avez** — bouton « Charger un JSON ».
3. **Pour la mesure automatique en ligne de commande** — déposez le JSON dans
   `banc-chutier/entrees/` (ignoré par git, un `LISEZ-MOI.txt` l'explique sur place), puis :

```
node "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique/tests/mesure-debordement.cjs"
```

**Les deux planches, dans Safari :**

```
python3 -m http.server 8765 --directory "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-nettete.html"
```

Remplacez `planche-nettete.html` par `planche-typo.html` pour la comparaison des quatre réglages,
ou par `chutier.html` pour le banc. Pour arrêter : `kill %1`.

### 8.5 À juger par Christophe

1. **La netteté dans VOTRE Safari.** Zéro pixel d'écart dans Chromium ne dit rien de Safari.
2. **Le défilement d'une diapositive à 2,00.** Le questionnaire est à scission selon le seuil
   proposé. Est-ce le bon arbitrage, ou préférez-vous le voir défiler ?
3. **Le seuil de 1,8 lui-même**, qui n'est pas mesuré mais calculé. Un pan réel, regardé, le
   confirmera ou non.
4. **Le remplissage et les débordements réels** de vos présentations, que les miennes ne peuvent
   pas annoncer.

---

## 9. SnapDOM dans Safari réel et dans WebKit — la mesure refaite

**L'objection était juste.** La planche du point 8.2 affichait, dans Safari, des PNG produits par
Chromium : elle ne disait rien de SnapDOM dans Safari. Et le lot 0 avait mesuré dans WebKit un
texte plus doux. Tout a été refait **dans chaque navigateur**, capture native par son propre
pilote contre capture SnapDOM exécutée dans ce même navigateur, sur la même scène, au même instant.

### 9.1 Les chiffres

| Navigateur | Comparaison | Pixels différents | Écart maximal | Écart moyen | Témoin |
|---|---|---|---|---|---|
| **WebKit** (Playwright 26.5) | A — 1920×1080, échelle 1 | **0** / 2 073 600 | **1 à 2** / 255 | 1,0 | 23 427 ✓ |
| **WebKit** | B — mode vidéo, sortie 1920×1080 | **0** / 2 073 600 | **2** / 255 | 1,0 | 23 427 ✓ |
| **Safari 26.3 réel** | A — 1920×1080, échelle 1 | **0** / 2 073 600 | **15** / 255 | 1,1 à 1,3 | 23 276 ✓ |
| **Safari 26.3 réel** | B — mode vidéo, sortie 1920×1080 | **0** / 2 073 600 | **15** / 255 | 1,1 à 1,3 | 23 276 ✓ |

« Pixels différents » est le compte au seuil perceptuel de pixelmatch ; « écart maximal » est la
plus grande différence sur un canal, en niveaux sur 255 ; « écart moyen » ne porte que sur les
pixels qui ne sont pas strictement identiques. Le témoin compare deux étapes voisines rendues
nativement : il doit différer, et il diffère.

**SnapDOM n'est pas plus doux dans Safari.** Aucun pixel ne dépasse le seuil perceptuel, dans
aucun des deux navigateurs, ni à l'échelle 1 ni sous l'agrandissement ×2 du mode vidéo. Safari est
un peu moins exact que WebKit — quelques pixels isolés à 15 niveaux d'écart contre 2 — mais
l'écart moyen reste à 1,1–1,3 niveau sur 255, c'est-à-dire du bruit d'arrondi d'anticrénelage.

**Aucune voie de remède n'est donc proposée : il n'y a rien à corriger.** Le réglage (d) tient dans
les deux moteurs.

**Le chiffre du lot 0 reste expliqué par la même cause** : il comparait deux mises en page qui
n'étaient pas la même (corrélation des profils d'encre à 0,868), pas deux rastérisations du même
contenu.

### 9.2 Trois défauts de ma propre mesure, trouvés par le garde-fou

Le premier jet, sans contrôle de géométrie, annonçait **24 449 à 114 478 pixels différents** en
mode vidéo sous WebKit. **Ce chiffre était entièrement faux**, et il aurait conclu à une douceur
qui n'existe pas. Trois causes, trouvées l'une après l'autre parce que la scène posée est
désormais MESURÉE avant chaque capture, et la capture refusée si elle ne correspond pas :

1. **Safari ignore `transform: scale(2)` dans sa capture d'élément** : il rend la boîte non
   transformée, 960×540 là où l'écran montre 1920×1080. Chromium et WebKit l'honorent. Les deux
   pilotes photographient donc la fenêtre, et la découpe se fait côté Node, à l'identique.
2. **En réécrivant le style de la scène, j'effaçais le `transition:none`** que le moteur y pose.
   La classe du lecteur déclare une transition de 260 ms sur `transform` : poser `scale(2)` lançait
   une animation, et deux images d'attente mesuraient au milieu du chemin — `matrix(1.147569)`.
   J'ai d'abord cherché une règle d'échelle là où il n'y avait qu'une transition en cours.
3. **L'enveloppe centre son contenu** (flex, centré). Avec une origine de transformation en haut à
   gauche, la scène se posait en (480, 270) : taille juste, cadrage faux. Une découpe en (0,0)
   comparait alors deux cadrages différents.

Chacun de ces trois défauts, seul, aurait produit un faux « SnapDOM est plus doux dans Safari ».

### 9.3 Un correctif au moteur, au passage

La scène hors écran héritait de `--adoc-present-echelle`, la variable par laquelle le lecteur
ajuste la diapositive à la taille de la fenêtre. Elle est désormais fixée à 1 sur l'hôte de la
scène. Le moteur ne s'en trouvait probablement pas affecté — SnapDOM reconstruit le sous-arbre
plutôt que de photographier l'écran — mais une scène dont la transformation dépend de la taille de
la fenêtre n'est pas une scène déterministe, et elle devait cesser de l'être.

### 9.4 Limites de cette mesure, et ce qui reste à juger

**Mesuré** : quatre étapes de la présentation « texte dense », dans les deux navigateurs, avec la
géométrie vérifiée à chaque capture et un témoin qui prouve que la comparaison n'est pas aveugle.

**Non mesuré** : l'écran de Christophe rapporte un **rapport de pixels de 1** (affichage de
2560 px de large). Sur un écran Retina, ce rapport vaut 2, et la comparaison demanderait d'en
tenir compte — ces chiffres ne s'y transposent pas tels quels.

**À juger par Christophe** : la planche, à l'œil, et surtout en vidéoprojection. Toutes ses images
viennent maintenant du navigateur qui les titre.

```
python3 -m http.server 8765 --directory "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-lot2-images-wt/tools/Projet therapeutes/Conseiller Clinique" & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-nettete-navigateurs.html"
```

---

## 7. Ce que ce lot ne livre pas

- **L'interface du chutier dans l'application** (V2 côté produit) : le brief demandait le moteur
  sans interface de banc, et c'est ce qui est livré. Les vignettes existent dans la page d'essai.
- **Le défilement d'une diapositive qui déborde** (V3, seconde moitié) : le lot 7 selon le CDC.
- **Aucun déploiement, aucune écriture D1, aucun secret.** Rien n'a été poussé sur `main`.
