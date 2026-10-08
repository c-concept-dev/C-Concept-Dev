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

## 10. Pourquoi la connexion échoue depuis le banc, et la voie sans secret

**Aucun mot de passe n'a été demandé, saisi, ni utilisé pour établir ce qui suit.** Tout vient de
la lecture du code de l'écran de connexion et de celui du Worker.

### 10.1 Quel message pour quelle cause

| Message affiché | Cause exacte |
|---|---|
| « Entrez votre mot de passe. » | champ vide — **aucune requête n'est envoyée** |
| *l'écran disparaît* | HTTP **200** : la clé reçue est rangée dans `localStorage` |
| « Trop de tentatives — réessayez dans quelques minutes. » | HTTP **429**, limiteur du Worker |
| « Mot de passe incorrect. » | **tout autre statut HTTP** : 401 (mot de passe réellement faux), mais aussi 403, 404, 500… |
| « Connexion impossible, réessayez. » | **l'appel `fetch` lui-même a échoué** : réseau, DNS, ou **refus CORS** |

Christophe voit le **dernier**. Son mot de passe n'a donc **jamais été jugé** : la requête n'a pas
abouti. Le message est trompeur — il invite à réessayer là où aucun essai ne peut réussir.

### 10.2 Les origines autorisées

Le Worker ne porte pas une liste : **une seule origine, écrite en dur**.

```
var ADOC_ALLOWED_ORIGIN = "https://c-concept-dev.github.io";
```

Toutes les réponses, y compris celle du préflight `OPTIONS`, ne portent que celle-là.
**`http://127.0.0.1:8765` n'en fait pas partie**, et il n'existe aucun mécanisme pour l'y ajouter
sans modifier le code du Worker et le redéployer.

Conséquence précise : la requête de connexion porte `Content-Type: application/json`, donc le
navigateur envoie d'abord un préflight `OPTIONS`. La réponse annonce une origine qui n'est pas
celle de la page, le navigateur bloque, et **le POST n'est jamais envoyé**.

### 10.3 Le compteur d'échecs, et le risque de verrouillage

**Aucun risque de verrouillage dans son cas, et c'est démontrable par le code.**

Le limiteur vit **à l'intérieur** de la branche `POST /login` : il n'est atteint que si la requête
parvient au Worker. Or elle n'y parvient pas — seul le préflight `OPTIONS` arrive, et il retourne
avant toute logique de route. **Ses tentatives n'ont donc rien incrémenté.**

Pour mémoire, si elle y parvenait : clé `ratelimit:login:<IP>:<tranche>` dans KV, **10 tentatives
par tranche de 15 minutes et par adresse IP**, durée de vie 30 minutes. **La remise à zéro est
automatique** : la tranche est calculée à partir de l'horloge, elle change toute seule au bout de
quinze minutes. Aucune action n'est requise, et rien n'est à débloquer.

### 10.4 La voie sans secret — construite et éprouvée

Trois entrées sur la page du banc, qui ne demandent ni mot de passe ni Worker :

1. **« Charger un export HTML »** — lit `window.ADOC_EXPORT_DOC` dans un export autonome, par
   appariement d'accolades respectant les chaînes, et reprend son dictionnaire d'images embarquées.
2. **« Ouvrir dans l'espace de travail »** — installe le document comme artefact courant et ouvre
   l'éditeur dessus. **Le champ Narration du lot 1a y apparaît.**
3. **« Télécharger le document de travail »** — écrit un JSON sur le disque, **narration comprise**.
   Rechargeable par « Charger un JSON ».

**Mesuré de bout en bout** par `verify-banc-sans-connexion` (6/6) : un export réel est produit,
rechargé, ouvert, une narration est écrite, téléchargée, rechargée, et **elle revient dans
l'éditeur**. Sur tout le parcours, **aucun appel au Worker n'aboutit**, **`/login` n'est jamais
appelé**, et aucune image n'est redemandée après la relecture de l'export.

**UN POINT QUI DEMANDE UNE DÉCISION.** Votre demande disait : « la narration doit apparaître dans
l'éditeur si le document en porte ». Or **un export autonome n'en porte jamais** — c'est la règle
du lot 1a, et elle est vérifiée par trois tests. Les deux exigences sont inconciliables telles
quelles. Ce qui est livré respecte la règle du lot 1a et contourne l'obstacle autrement : la
narration voyage par le **fichier de travail**, pas par l'export. Le CDC prévoit d'ailleurs déjà
cette séparation — la narration figure dans le **kit** (X2), jamais dans la vidéo ni dans l'export
destiné à être regardé.

**Ce qu'il faut savoir pour le passage du lot 1a dans cette configuration :**

- **Écrire une narration** : possible, le champ est là.
- **Enregistrer** : le bouton de l'application passe par le Worker et échouera. C'est
  « Télécharger le document de travail » qui en tient lieu, et le fichier obtenu se recharge.
- **Exporter** : l'export autonome fonctionne, mais **ses images seront des aplats de repli** si
  l'export est fabriqué sans connexion — mesuré : la fabrication appelle `/fetch-image`, qui
  échoue, et l'export embarque un aplat. Un export fait pendant une session connectée porte ses
  vraies images et se relit ensuite hors ligne sans rien redemander.

### 10.5 Ajouter `127.0.0.1:8765` aux origines : décrit, non fait

**Je ne l'ai pas fait et je ne le ferai pas sans votre autorisation explicite** — cela suppose de
modifier `Worker/` et de déployer, deux choses que vos consignes m'interdisent sans votre accord.

**Le changement** : `ADOC_ALLOWED_ORIGIN` est une constante unique utilisée par un objet `CORS`
partagé par toutes les réponses. Autoriser une seconde origine demande de transformer cette
constante en liste et de choisir l'en-tête de réponse selon l'origine de la requête — l'en-tête
`Access-Control-Allow-Origin` n'accepte qu'une seule valeur, jamais deux.

**Ce que cela permettrait à un autre programme local.** Un port local n'est pas une identité :
**n'importe quel programme de votre Mac** capable d'écouter sur 8765 — un dépôt téléchargé, un
outil de développement, une page ouverte par mégarde — se présenterait au Worker avec la même
origine autorisée. Il ne pourrait toujours rien faire sans le mot de passe ou la clé, mais il
gagnerait le droit de **tenter** la connexion depuis votre navigateur, et de recevoir les réponses.
La protection reposerait alors entièrement sur le limiteur de 10 tentatives par quart d'heure.

**La variante la plus étroite**, si vous la vouliez quand même : ne pas toucher à la production.
Une seconde origine lue depuis une **variable d'environnement** vide par défaut, renseignée
uniquement sur un déploiement de prévisualisation séparé, jamais sur le Worker de production. Le
code de production se comporterait exactement comme aujourd'hui.

**Mon avis** : rien ne le justifie. La voie sans secret ci-dessus couvre vos deux passages, elle
est mesurée, et elle ne touche ni au Worker ni à un déploiement.

---

## 11. Les relevés de Christophe sur sa présentation — réponses

**Sa présentation n'est pas déposée dans `banc-chutier/entrees/` et je n'ai aucun accès à son
navigateur : je n'ai donc rien pu mesurer sur SON document.** Les chiffres ci-dessous viennent des
présentations d'essai, sauf là où une déduction est explicitement marquée comme telle.

### 11.1 Pourquoi ses images étaient en mode fidèle — un défaut de ma part

**La page employait le réglage (a), et c'est moi qui le lui faisais employer.** Le moteur avait
bien (d) pour défaut. Mais la page du banc envoyait, à chaque rendu :

```
scene: null,          // « la scène du lecteur », explicitement
echelleTypo: 1,       // « pas d'échelle », explicitement
```

Ces deux valeurs venaient des listes « scène » et « typo », dont les options de départ étaient
restées celles d'avant la décision du 6 octobre. **Une option explicite écrase un défaut** : la
page annonçait le mode vidéo et rendait le mode fidèle. Son corps de texte à 20 px est exactement
ce que donne (a) : 15 px de scène × 1,35.

**Je ne l'avais pas vu parce que je n'avais jamais vérifié ce que la PAGE obtient** — seulement ce
que le moteur fait. Les deux tests qui couvraient le défaut interrogeaient le moteur directement.

**Corrigé** : un seul sélecteur visible, quatre réglages (a) (b) (c) (d), **(d) choisi au départ**.
Et surtout, **(d) n'envoie aucune option** : il laisse le moteur appliquer son propre défaut, donc
la page ne peut plus en diverger. Un nouveau test, `verify-banc-reglage-defaut` (4/4), rend des
images par le bouton réel et lit la scène et l'échelle employées — il échoue si la page retombe
sur (a).

### 11.2 La puce « Approfondir »

**Masquée pendant la capture**, comme la loupe et l'habillage des boutons de questionnaire. Même
raison : elle annonce un geste qu'une vidéo ne permet pas. Vérifié sur une présentation d'essai qui
en porte une — sans quoi le contrôle vérifierait une absence sans présence.

### 11.3 Citations et lignes « Sources » — en attente de votre décision

**Rien n'est masqué par défaut** : l'image montre ce que montre le lecteur, tant que vous n'avez
pas tranché. Une case à cocher « masquer citations et sources » existe sur la page, **décochée**,
pour que vous puissiez voir les deux versions avant de choisir.

**L'extraction des sources est prête** : `sourcesParEtape(doc)` rend, pour le kit (X2) comme pour
une dernière image, la liste des citations **réellement appelées**, leur libellé, et les étapes qui
les appellent — avec, à part, celles qui sont déclarées mais jamais appelées. Une liste de sources
doit correspondre à ce qu'on a montré.

### 11.4 PNG contre JPEG 0,92 — mesuré

| Présentation | PNG | JPEG 0,92 | Gain | Temps PNG → JPEG |
|---|---|---|---|---|
| **couverture** (photo raster) | 186 Ko/image | **66 Ko** | **−65 %** | 270 → 192 ms |
| **dense** (texte seul) | 167 Ko/image | **159 Ko** | **−5 %** | 287 → 266 ms |
| **questionnaire** (texte dense) | 140 Ko/image | **108 Ko** | **−23 %** | 228 → 220 ms |

**Le JPEG paie sur les photos, presque pas sur le texte.** C'est cohérent avec vos 1 035 Ko
moyens et vos pointes à 1,9 Mo : ce sont les images à photo qui pèsent, et ce sont elles que le
JPEG allège d'un facteur presque trois.

**Ce que la compression change, mesuré pixel à pixel** : le JPEG 0,92 modifie presque tous les
pixels, mais faiblement — **écart maximal de 22 à 35 niveaux sur 255**, écart moyen de **1,1 à 1,6**
globalement et de **1,5 à 2,7 sur les seules lignes qui portent du texte**. L'écart est donc plus
marqué sur le texte que sur le reste, d'un facteur deux environ, et il reste petit.

**À juger par vous** : ces chiffres disent l'ampleur, pas la gêne. Le sélecteur de format est sur
la page ; rendez les mêmes étapes dans les deux formats et regardez le texte à sa taille réelle.

### 11.5 Le questionnaire à 1,95 fois le cadre

**Verdict : scission**, et sans ambiguïté — le seuil est à 1,8. La table complète, évaluée sur
l'indicateur lui-même :

| Rapport | 1,04 | 1,5 | 1,8 | **1,95** | 2,0 | 2,5 |
|---|---|---|---|---|---|---|
| Verdict | défilement | défilement | défilement | **scission** | scission | scission |

**En mode fidèle** : 1,95 → scission. **En mode vidéo** : le rapport ne peut qu'augmenter — la
scène est deux fois moins haute et le texte 1,4 fois plus grand. Sur ma présentation d'essai, le
même questionnaire passe de **1,04 en fidèle à 2,00 en vidéo**. Le vôtre, déjà à 1,95 en fidèle,
sera **largement au-delà du seuil en (d)** : scission dans les deux modes. **C'est une déduction,
pas une mesure** — seule sa mesure sur votre document donnera le rapport exact.

---

## 12. La troncature du dernier bloc — cause, correction, et la leçon pour la gouvernance

Christophe a trouvé, sur sa présentation réelle en mode (d), que le dernier bloc de chaque
diapositive illustrée était coupé en bas de l'image : phrase tranchée en son milieu à la
diapositive 1 étape 4, encadré final coupé aux diapositives 2 et 3, encadré final absent à la
diapositive 5 étape 3 — dont l'image était identique à celle de l'étape 2, pixel pour pixel. Le
relevé annonçait pourtant un débordement de 306, 460, 374 et 598 px. Aucun avertissement.

### La cause, mesurée et non devinée

Trois CSS se combinent, et aucune des trois n'est fautive isolément :

| règle | fichier | effet |
|---|---|---|
| `.cc-ws-present-slide-inner .adoc-sc-card{height:100%;overflow:auto}` | lecteur | la carte prend la hauteur de la scène, et fait défiler ce qui dépasse |
| `.adoc-sc-card-img{max-height:45%}` | lecteur | la photo de couverture occupe 45 % de la **hauteur de la carte** |
| agrandissement de la scène pour contenir le débordement | moteur du chutier | enlever la hauteur fixe pour mesurer le contenu déplié |

La conséquence est un cercle : agrandir la scène de 540 à 766 px agrandit la photo de 243 à
345 px, qui repousse le texte de 102 px, qui augmente la hauteur du contenu — laquelle avait déjà
été mesurée. La hauteur retenue était donc toujours celle d'**avant** l'agrandissement.

Mesuré sur la présentation illustrée, en (d) : contenu **766 px** mesuré avant agrandissement,
**952 px** réellement occupés après. Le bas du dernier bloc tombait à 830 px dans un cadre de
766 px : **64 px de texte coupés** sur cette fixture, **186 px** d'écart total de hauteur. Sans
photo, le même contenu mesure 540 px avant comme après : **rien ne bouge, ce qui établit la
cause**. Et en (a), la scène de 1422×800 n'a jamais eu à être agrandie — donc jamais de
troncature. La réponse aux trois questions du brief : la hauteur était mesurée **une fois par
étape**, après la révélation du dernier bloc (ce point était correct) mais **avant** le
redimensionnement de la scène, lequel a lieu dans `capturer()` juste avant la capture.

### La correction

1. `hauteurContenu(sc)` mesure le maximum de `inner.scrollHeight`, `carte.scrollHeight` et du bas
   du bloc visible le plus bas — ce dernier terme parce que `.adoc-sc-reveal` masque par
   `opacity` et `visibility`, qui **conservent** la mise en page.
2. `stabiliserHauteur(sc, attendue)` résout le point fixe. Le contenu est affine en la hauteur
   posée : `contenu(H) = fixe + k·H`, donc `H* = fixe / (1 − k)`. Deux sondes donnent `k`, la
   troisième vérifie. **3 redimensionnements** au lieu des 9 de l'itération naïve ; repli sur
   l'itération bornée si `k` sort de `(0 ; 0,98)`.
3. `refuserSiTropCourte(contenu, hauteurCapture, tolérance, stepId)` **lève une erreur** : une
   image plus courte que son contenu n'est jamais livrée. Même zone morte qu'ailleurs (×1,02),
   parce que quelques pixels de bruit de mise en page ne sont pas une troncature.

### Les quatre réglages, mesurés

`tests/mesure-troncature.cjs`, sur les trois présentations d'essai, une présentation illustrée et
le même document sans photo. « Aurait grandi » = étapes où l'ancien code coupait. « Encre au
bord » = pixels d'encre collés au bord inférieur de l'image, lus **dans l'image**.

| réglage | étapes concernées | px perdus au maximum | encre au bord après correction |
|---|---|---|---|
| (a) fidèle 1422×800 | **aucune** sur 19 | 0 | 0 |
| (b) fidèle 960×540 | 4 sur 19 | 17 px | 0 |
| (c) fidèle, typo ×1,6 | 4 sur 19 | 29 px | 0 |
| (d) vidéo 960×540 ×1,4 | 4 sur 19 | **186 px** | 0 |

**Le mode fidèle (a) n'était pas concerné** : sa scène de 1422×800 contenait les fixtures sans
agrandissement, et une scène qu'on n'agrandit pas n'agrandit pas la photo. Les réglages (b) et (c)
l'étaient, mais faiblement (17 et 29 px) ; (d) l'était massivement, parce qu'il cumule la petite
scène et l'agrandissement typographique. C'est ce qui explique que le défaut soit apparu
exactement quand Christophe est passé en (d) sur sa présentation réelle.

### Le relevé de la page

Il affiche désormais, par étape : la hauteur du **contenu**, la hauteur de l'**image** (en scène
et en sortie), et l'écart. Trois endroits : le tableau détaillé, la légende de chaque vignette, et
le relevé copiable. Exemple réel sur la présentation dense en (d) :

```
hauteurs : aucune image plus courte que son contenu (4 étapes)
  dont 4 étape(s) qui dépassent de quelques pixels (jusqu'à 6 px) sans rien couper :
  c'est la zone morte de la mise en page
```

Deux nombres et non un, et c'est un choix : le **dépassement brut** vaut 6 px sur presque toutes
les cartes (546 px mesurés pour 540 px de cadre), sans aucune encre au bord. Appeler cela
« coupé » ferait crier le relevé sur des images saines — et un relevé qui crie à tort s'apprend à
être ignoré, ce qui rouvrirait le défaut silencieux par l'autre bout. `coupe_px` ne compte donc
que ce qui dépasse la zone morte, c'est-à-dire exactement ce que le refus rejette.

### Falsification

| mutation | ce qu'elle remet en place | détectée par |
|---|---|---|
| `la hauteur est mesurée une seule fois, avant l'agrandissement` | le défaut du 7 octobre, à l'identique | contrôle 15 — **par les pixels** : « illustree/d étape 4 : 2001 pixels d'encre collés au bord inférieur » |
| `le refus d'une image trop courte ne refuse plus rien` | le garde-fou retiré | contrôle 16 : « 60 px de trop doivent être refusés : accepté » |
| `le débordement n'est plus mesuré` (ancre remise à jour) | aucune connaissance du débordement | contrôle sur le questionnaire capturé à toute sa hauteur |

**Falsifieur : 24/24 mutations détectées**, sur trois fichiers source, empreintes restaurées.

### La leçon pour la gouvernance : un défaut silencieux et crédible

C'est le point important, et il vaut au-delà de ce lot.

Mes contrôles 15 et 16, tels que je les avais d'abord écrits, lisaient les hauteurs **que le
moteur déclare lui-même** dans ses métadonnées. Or sous la mutation qui remet le défaut en place,
le moteur reste parfaitement cohérent avec lui-même : il annonce « contenu 766 px, capture 766 px »
et son propre refus l'accepte sans broncher. Le contrôle passait. Il ne restait du défaut que
l'image, où 2001 pixels de texte étaient tranchés net contre le bord.

J'ai donc ajouté au contrôle 15 une mesure qui ne passe pas par le moteur : l'encre dans la
dernière bande de 10 px de l'image livrée. Une capture complète y montre la marge intérieure de la
carte ; une capture coupée y montre du texte. C'est cette assertion-là, et non la comptabilité
interne, qui attrape la mutation.

Trois règles que j'en tire, et que je propose d'inscrire dans la gouvernance :

1. **Un contrôle ne doit pas demander à la chose contrôlée si elle a bien travaillé.** Vérifier un
   artefact livré se fait sur l'artefact — ici les pixels de l'image — et non sur les nombres que
   le producteur a inscrits à son propre sujet. Les deux coïncident tant que le producteur est
   juste, et c'est précisément quand il cesse de l'être qu'ils divergent.
2. **Une anomalie annoncée doit être annoncée dans l'unité de la livraison.** Le relevé disait
   « déborde de 306 px » — vrai et inutile, parce qu'il parlait du contenu sans jamais dire ce que
   l'image mesurait. Il manquait le second nombre, donc la comparaison, donc l'alerte.
3. **La crédibilité d'une sortie est une propriété dangereuse.** Ces images étaient belles,
   nettes, de la bonne taille, livrées sans erreur, avec un relevé qui parlait de débordement :
   tout concourait à les croire. Le seul moyen de les contredire était de les **regarder**, ce que
   Christophe a fait et que mes scripts ne faisaient pas. Un contrôle qui ne regarde pas le produit
   fini ne protège de rien, quel que soit son nombre d'assertions.

Cette passe a aussi corrigé un travers de méthode de mon côté : mes scripts de correctif
écrivaient le fichier à la fin, si bien qu'une assertion tardive annulait en silence des
remplacements déjà réussis tout en affichant « ok ». J'écris et je revérifie maintenant **après
chaque remplacement** — c'est ce qui a fait apparaître, cette fois, qu'une ancre de mutation était
devenue caduque plutôt que de la croire appliquée.

### Mesuré par script / à juger par Christophe

**Mesuré :** la cause (766 → 952 px, 64 px coupés sur la fixture, rien sans photo) ; les quatre
réglages (tableau ci-dessus) ; 0 pixel d'encre au bord sur les 20 images × 4 réglages après
correction ; 3 redimensionnements de stabilisation ; 20/20 contrôles, 24/24 mutations, 17 tests de
régression verts ; empreinte du schéma d'outil `b1b0155cb8eba26c`, 6679 o, avant **et** après.

**À juger par Christophe :** relancer le rendu de sa présentation réelle en (d) et vérifier que
les quatre encadrés finaux sont entiers. Le relevé lui donnera, étape par étape, la hauteur du
contenu et celle de l'image — et refusera de produire une image trop courte plutôt que de la lui
livrer en silence.

## 13. Le bandeau photo et l'empilement des blocs — mesures du 8 octobre

Christophe a vérifié le correctif de troncature sur sa vraie présentation en (d) : dernier bloc
entier, plus de doublons, relevé juste. Il a relevé que les hauteurs réelles vont de 1,52 à 4,39
fois le cadre — donc que **(d) ne convient pas à ce contenu** — et nommé la cause restante : « la
photo plafonnée à 45 % de la hauteur de la carte grandit avec le contenu ».

Son export est dans `banc-chutier/entrees/` (dossier ignoré par git ; rien de ce document n'entre
dans le dépôt). Tout ce qui suit est mesuré sur ses 5 diapositives et 19 étapes, sans connexion ni
appel réseau : `tests/mesure-photo-et-blocs.cjs`.

### Un préalable qu'il a fallu corriger avant de mesurer quoi que ce soit

Le moteur n'attendait pas le décodage des photos. Un `<img>` non décodé occupe **0 px de haut** :
la hauteur du contenu se mesure trop courte, le bandeau photo se mesure à zéro, et la capture
montre un trou là où la photo devait être. Avec des data-URI cela passait presque toujours ; avec
une photo servie par le réseau, non. C'est le même genre de défaut que la troncature — un nombre
crédible et faux — et il aurait faussé précisément la mesure demandée ici. Corrigé
(`attendreImages`, borné à 3 s pour qu'une photo cassée ne suspende pas un rendu de dix-neuf
étapes), éprouvé sur une image que le serveur de test retarde de 300 ms, et falsifié.

### Passe A — les quatre réglages tels quels, par diapositive

Hauteurs en pixels de **sortie** (cadre de référence 1920×1080), comme les relevés de Christophe.
Le rapport est la hauteur divisée par 1080. Le texte est le corps de texte en % de la hauteur du
cadre. La photo est mesurée **au moment de la capture**, scène déjà agrandie — mesurée avant, elle
serait donnée plus petite qu'à l'image.

| réglage | diapo | image | rapport | verdict | photo | % cadre | % image | texte |
|---|---|---|---|---|---|---|---|---|
| **(a) fidèle 1422×800** | 1 | 1920×1080 | 1,00 | aucun | 344 px | 43 % | 43 % | 1,88 % |
| | 2 | 1920×1080 | 1,00 | aucun | 344 px | 43 % | 43 % | 1,88 % |
| | 3 | 1920×1080 | 1,00 | aucun | 344 px | 43 % | 43 % | 1,88 % |
| | **4** | 1920×3008 | **2,79** | scission | **924 px** | **116 %** | 42 % | 1,88 % |
| | 5 | 1920×1080 | 1,00 | aucun | 344 px | 43 % | 43 % | 1,88 % |
| **(b) fidèle 960×540** | 1 | 1920×1080 | 1,00 | aucun | 227 px | 42 % | 42 % | 2,78 % |
| | 2 | 1920×1364 | 1,26 | défilement | 291 px | 54 % | 43 % | 2,78 % |
| | 3 | 1920×1244 | 1,15 | défilement | 264 px | 49 % | 42 % | 2,78 % |
| | **4** | 1920×3766 | **3,49** | scission | 616 px | **114 %** | 33 % | 2,78 % |
| | 5 | 1920×1154 | 1,07 | défilement | 243 px | 45 % | 42 % | 2,78 % |
| **(c) fidèle, typo ×1,6** | 1 | 1920×1161 | 1,07 | défilement | 371 px | 46 % | 43 % | 3,00 % |
| | 2 | 1920×1387 | 1,28 | défilement | 446 px | 56 % | 43 % | 3,00 % |
| | 3 | 1920×1258 | 1,17 | défilement | 403 px | 50 % | 43 % | 3,00 % |
| | **4** | 1920×3837 | **3,55** | scission | **924 px** | **116 %** | 33 % | 3,00 % |
| | 5 | 1920×1202 | 1,11 | défilement | 384 px | 48 % | 43 % | 3,00 % |
| **(d) vidéo 960×540 ×1,4** | 1 | 1920×1654 | 1,53 | défilement | 356 px | 66 % | 43 % | 3,89 % |
| | 2 | 1920×1940 | 1,80 | défilement | 420 px | 78 % | 43 % | 3,89 % |
| | 3 | 1920×1780 | 1,65 | défilement | 384 px | 71 % | 43 % | 3,89 % |
| | **4** | 1920×4792 | **4,44** | scission | 616 px | **114 %** | 26 % | 3,89 % |
| | 5 | 1920×2196 | 2,03 | scission | 478 px | 89 % | 44 % | 3,89 % |

Temps et poids : (a) 364 ms/image, 22,9 Mo ; (b) 377 ms, 25,4 Mo ; (c) 391 ms, 26,9 Mo ;
(d) 401 ms, 35,7 Mo.

**Trois choses que ce tableau établit.**

1. La photo occupe **43 % du cadre quand rien ne déborde**, et jusqu'à **116 % quand la scène est
   agrandie** : une photo plus haute que le cadre qu'elle illustre. C'est exactement le mécanisme
   nommé par Christophe, mesuré. La colonne « % image » reste à 42-44 % partout : la photo garde
   sa part de la *carte*, ce qui est précisément le problème — c'est la carte qui grandit.
2. La diapositive 4 (le questionnaire) déborde dans **les quatre réglages**, de 2,79 à 4,44 fois le
   cadre. Aucun réglage de scène ou de typographie ne la fera tenir : son contenu est trop long,
   point.
3. (a) est le seul réglage où quatre diapositives sur cinq tiennent exactement dans le cadre — au
   prix d'un corps de texte à **1,88 %** de la hauteur, contre 3,89 % en (d), soit un peu plus du
   double. C'est l'arbitrage que (d) avait tranché en octobre, et il tient toujours : (d) est
   lisible, mais il déborde.

**Écart avec tes propres relevés.** Tu avais noté 1636, 1762, 1916, 4746, 2170 ; je mesure 1654,
1940, 1780, 4792, 2196. Trois des cinq tombent à 1-2 % près ; les diapositives 2 et 3 s'écartent de
+10 % et −7 %. **Je n'ai pas établi la cause de cet écart** — il joue dans les deux sens, ce qu'une
simple différence de décodage de photo n'expliquerait pas. Il ne change aucune conclusion (les
cinq rapports restent entre 1,5 et 4,4), mais je ne le mets pas sur le compte du hasard : si tu
veux, je le cherche avant la suite.

### Passe B — option 1 : un plafond ABSOLU du bandeau photo, à 25 % du cadre

La différence avec `max-height:45%` n'est pas la valeur, c'est l'unité. Un plafond en pourcentage
suit la carte ; un plafond en **pixels**, calculé une fois sur la hauteur du cadre, ne la suit pas.
**Option mesurée, pas appliquée : désactivée par défaut.**

| réglage | plafond | photo avant → après | diapositive la plus haute | étapes qui débordent | rapport maximal |
|---|---|---|---|---|---|
| (a) fidèle | 200 px | 344-924 → 200 | 3008 → **1947** px (−1061) | 4 → 4 /19 | 2,79 → **1,80** |
| (b) 960×540 | 135 px | 227-616 → 135 | 3766 → **2802** px (−964) | **15 → 4** /19 | 3,49 → **2,59** |
| (c) typo ×1,6 | 200 px | 371-924 → 200 | 3837 → **2858** px (−979) | **19 → 4** /19 | 3,55 → **2,65** |
| (d) vidéo | 135 px | 356-616 → 135 | 4792 → **3830** px (−962) | 19 → 19 /19 | 4,44 → **3,55** |

Les diapositives 1 à 3 et 5 regagnent le plus : en (b) et (c), elles retombent **exactement dans
le cadre** (1080 px), ce qui fait passer les étapes débordantes de 15 et 19 à 4 — les quatre du
questionnaire. En (d), elles raccourcissent de 444 à 686 px mais restent au-dessus de 1080 : le
plafond photo seul ne suffit pas à faire tenir (d).

### Passe C — option 2 : « bloc courant seul » en mode vidéo (avec le plafond photo)

Chaque étape n'affiche que son bloc, plus le titre de la diapositive et le bandeau photo plafonné.
Les blocs précédents sont retirés de la **mise en page** (`display:none`, et non la classe du
lecteur, qui masque en conservant la place). **Option mesurée, pas appliquée : désactivée par
défaut.**

| | (d) empilé | (d) + plafond + bloc seul |
|---|---|---|
| étapes qui débordent | **19 / 19** | **2 / 19** |
| rapport maximal | 4,44 | **2,84** |
| hauteurs par diapositive | 1654, 1940, 1780, 4792, 2196 | 1080, 1080, 1080, 1080-3066, 1080-1162 |
| poids total | 35,7 Mo | **12,5 Mo** |
| temps par image | 400 ms | **162 ms** |

Les deux étapes qui débordent encore : la diapositive 4 étape 4 — **le questionnaire seul fait
2,84 fois le cadre** — et la diapositive 5 étape 3 (1,08, dans le bruit). Tout le reste tient
exactement dans 1920×1080. Le corps de texte reste à 3,89 % : l'option ne touche pas à la
typographie.

### Passe D — ce que cela change pour le fondu entre étapes (CDC Ef1)

Ef1 suppose un empilement cumulatif. Mesure : part des pixels qui changent d'une étape à la
suivante, dans la même diapositive.

| | empilé | bloc courant seul |
|---|---|---|
| moyenne sur 14 paires | **3,0 %** | **7,1 %** |
| étendue | 0,4 % → 10,5 % | 1,8 % → 16,4 % |
| paires de hauteurs différentes | 0 sur 14 | **3 sur 14** |

Deux constats, et une limite.

- Le bloc seul change **un peu plus du double** de pixels, pas dix fois plus : le bandeau photo
  plafonné et le titre de la diapositive restent en place et occupent l'essentiel du cadre. Un
  fondu croisé n'y devient donc pas un changement de diapositive ; il reste un remplacement de la
  zone de texte. **Ef1 est affaibli, pas cassé.**
- Mais **3 paires sur 14 ont des hauteurs différentes** en bloc seul, et un fondu croisé entre
  deux images de hauteurs différentes n'est pas défini. C'est un point à trancher avant d'adopter
  l'option : soit on normalise la hauteur par diapositive, soit le fondu doit savoir quoi faire.
- Limite : « 7 % de pixels changés » ne dit pas comment cela se voit. C'est la planche qui le dit,
  et c'est toi qui juges.

### Mesuré par script / à juger par Christophe

**Mesuré :** tout ce qui précède, sur ta présentation réelle ; 23/23 contrôles, dont trois
nouveaux (le plafond absolu mord et il est absent par défaut ; « bloc courant seul » ne montre
qu'un bloc, garde le titre, et raccourcit réellement la carte ; le décodage des photos est attendu,
et une image cassée ne bloque pas). Empreinte du schéma d'outil inchangée.

**À juger par toi, sur la planche :**

1. Le bandeau photo à 25 % du cadre : est-ce encore une illustration, ou une vignette ? Si 25 %
   est trop bas, la valeur est un réglage — je peux mesurer 30 ou 35 %.
2. « Bloc courant seul » : un bloc à la fois, est-ce la bonne lecture pour une vidéo, ou perd-on
   le fil du raisonnement en ne voyant plus ce qui précède ?
3. La diapositive 4 : aucune option ne la fait tenir (2,84 fois le cadre même en bloc seul, parce
   que le questionnaire est un seul bloc). Elle relève de la scission, donc du lot 7 — ou d'une
   coupe dans le contenu, qui est ta décision, pas la mienne.
4. Si tu retiens « bloc courant seul », il faut décider ce que fait le fondu entre deux étapes de
   hauteurs différentes (3 paires sur 14).

## 14. Pourquoi mon test 6/6 ne prouvait rien, et la porte locale

Christophe ne pouvait pas faire le passage humain du lot 1a : après « Ouvrir dans l'espace de
travail » puis « Réduire le panneau », il tombait sur l'écran de connexion, qui recouvrait tout.
Mon test `verify-banc-sans-connexion` passait pourtant 6/6.

### 1. Comment mon test atteignait l'éditeur — et pourquoi c'était creux

Il ne l'atteignait pas. Il lisait le DOM **sous** l'écran de connexion. Trois choses précises :

| ce que le test faisait | ce que cela prouve | ce que cela ne prouve pas |
|---|---|---|
| `assert.equal(boite.hidden, false)` | l'attribut HTML `hidden` du champ Narration n'est pas posé | rien sur ce qu'un œil voit : un élément peut être recouvert sans être `hidden` |
| `el.click()` par script sur l'étape | le gestionnaire de clic s'exécute | rien sur l'atteignabilité : un clic par script traverse tous les recouvrements |
| `zone.value = t` puis `dispatchEvent('input')` | la saisie entre dans le document | rien sur la frappe réelle au clavier |

Et surtout : **le test ne cliquait jamais « Réduire le panneau ».** La séquence exacte de
Christophe n'était pas éprouvée du tout — `grep -n "Réduire" tests/*.cjs` ne rendait rien.

La cause est dans le balisage : l'écran de connexion est `position:fixed; inset:0; z-index:99999`,
premier enfant de `<body>`, et il n'est masqué que si `localStorage.workerApiKey` existe. **Toute
l'application existe dessous.** Un test qui interroge le DOM voit donc un éditeur complet et
fonctionnel, pendant qu'un humain voit un champ de mot de passe. La page du banc est une copie de
`studio-clinique.html` : elle porte le même écran. Tant que le panneau du chutier est ouvert, il le
recouvre ; le réduire le découvre.

### 2. Mesuré, dans un navigateur, sur le chemin exact de Christophe

Chargement de son export par le vrai gestionnaire du champ de fichier, puis « Ouvrir dans l'espace
de travail », puis « Réduire le panneau ». À chaque étape, la question posée au navigateur n'est
pas « l'élément est-il dans le DOM ? » mais **« qui recevrait le clic ici ? »**
(`document.elementFromPoint`).

| | avant (sans paramètre) | après (`?atelier-local=1`) |
|---|---|---|
| écran de connexion | `display:flex`, 1600×1050, z-index 99999 | `display:none` |
| élément au centre de la fenêtre | **`input#cc-login-password`** | `textarea.adoc-textarea` |
| champ Narration, attribut `hidden` | `false` — *ce que mon test vérifiait* | `false` |
| champ Narration, rectangle | 1032×100 en (330, **1401**) — hors écran | 1032×100 en (330, **509**) |
| champ Narration, atteint par le pointeur | **non** | **oui** |
| texte à l'écran | « Studio Clinique / Cet ordinateur n'est pas encore connu. / Mot de passe / Se connecter » | l'éditeur, « Narration », « Diapositive « L'argent : le grand tabou du couple », étape 1 sur 4. » |

Captures (dossier ignoré par git) : `banc-chutier/captures/AVANT-panneau-reduit-ecran-de-connexion.jpg`
et `banc-chutier/captures/APRES-panneau-reduit-editeur-et-narration.jpg`.

**Une précision de méthode.** Christophe demandait Safari réel piloté par `safaridriver`. J'ai
écrit le script (`tests/mesure-passage-humain-safari.cjs`) et il bute sur l'attente asynchrone de
WebDriver : la session reste pendante après l'envoi du fichier, sans erreur. La mesure ci-dessus a
donc été faite dans un navigateur que je pilote de bout en bout, **pas dans Safari**. Le mécanisme
mesuré est du CSS — `position:fixed; inset:0; z-index:99999` — qui ne dépend d'aucun moteur, et le
texte relevé est mot pour mot celui que Christophe décrit. Le script Safari reste dans le dépôt,
inachevé et signalé comme tel ; je peux le terminer si cette vérification-là compte en soi.

### 3. La porte locale

Dans le script en ligne de `studio-clinique.html`, celui qui décidait déjà de masquer l'écran :

```js
local = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  && new URLSearchParams(location.search).has('atelier-local');
```

**Deux conditions, toutes deux nécessaires**, et rien d'autre. Ce que la porte fait : elle **cesse
de masquer** l'espace de travail. Elle ne pose aucune clé, n'en lit aucune, n'en invente aucune —
tout appel au Worker échoue ensuite exactement comme avant, avec le même refus. Le Worker n'est pas
touché, aucun secret n'est manipulé, rien n'est contourné côté serveur.

Il n'y a d'ailleurs rien à contourner : **l'écran de connexion est un rideau, pas une serrure.**
Les deux lectures sont séparées dans le code — si `localStorage` lève (navigation privée, données
de site bloquées), la porte locale doit continuer de fonctionner, sans quoi le seul moyen de
travailler hors ligne dépendrait de ce qui vient d'échouer.

Un bandeau en `pointer-events:none` dit à l'écran ce que ce mode ne permet pas, pour que le premier
« Enregistrer » qui échoue ne passe pas pour une panne.

### 4. Les contrôles — `verify-porte-locale`, 7/7

Les hôtes sont éprouvés pour de vrai : les requêtes sont interceptées et servies depuis le disque
sous n'importe quel nom d'hôte, y compris celui du site publié. Aucun réseau.

| # | situation | attendu | mesuré |
|---|---|---|---|
| 1 | `c-concept-dev.github.io` **avec** le paramètre | écran affiché | affiché, 1400×950, clic sur `input#cc-login-password` |
| 2 | `exemple-quelconque.test` **avec** le paramètre | écran affiché | affiché |
| 3 | `127.0.0.1` **sans** paramètre | écran affiché | affiché |
| 4 | `127.0.0.1` avec `?atelier=local` (voisin) | écran affiché | affiché |
| 5 | `127.0.0.1` et `localhost` **avec** le paramètre | écran masqué, **aucune clé posée** | masqué, bandeau posé, `workerApiKey` absent |
| 6 | panneau réduit, chemin humain complet | champ Narration **atteint par le pointeur**, frappe au clavier | atteint ; « Essai du passage humain. » entré par `keyboard.type` |
| 7 | la page du banc est une copie à jour | même porte dans les deux fichiers | identique |

Le contrôle 7 existe parce que la page du banc est **engendrée** depuis l'application : sans lui,
les contrôles 1 à 5 porteraient sur une porte et le contrôle 6 sur une autre, chacun passerait, et
l'ensemble ne prouverait rien. C'est l'erreur du 7 octobre, déplacée d'un cran.

**Falsification — trois mutations, toutes détectées :**

| mutation | contrôle qui tombe |
|---|---|
| la porte s'ouvre sur **n'importe quel hôte** | 1 — le site publié s'ouvrirait sans mot de passe |
| la porte s'ouvre **sans paramètre** | 3 |
| la porte **pose une clé** au lieu de masquer l'écran | 5 — prouve que « aucune clé en stock » n'est pas décoratif |

### 5. Ce que ce réglage ne permet pas

**Enregistrer**, **Enregistrer sous**, **Mes créations**, **générer / réécrire / développer /
vérifier les sources**, et les **images Pexels** non déjà embarquées : tout cela passe par le
Worker et **ne fonctionne pas**. Ce qui fonctionne : monter et éditer les blocs, écrire des
narrations, **télécharger le document de travail** (le seul fichier qui porte les narrations),
exporter, et le chutier visuel.

Mode d'emploi complet : `MODE-EMPLOI-PASSAGE-LOT1A.md`.

### 6. Mesuré / à juger par Christophe

**Mesuré :** ce que montre chaque étape du chemin, par `elementFromPoint` et par capture d'écran,
avant et après ; `verify-porte-locale` 7/7 ; les trois mutations de la porte ; empreinte du schéma
d'outil inchangée.

**À juger par toi :** si le bandeau de mode local est assez visible, ou s'il gêne ; si le nom du
paramètre te convient ; et surtout, le passage lui-même — écrire, recharger, retrouver, exporter.

## 15. Ce que ce lot ne livre pas

- **L'interface du chutier dans l'application** (V2 côté produit) : le brief demandait le moteur
  sans interface de banc, et c'est ce qui est livré. Les vignettes existent dans la page d'essai.
- **Le défilement d'une diapositive qui déborde** (V3, seconde moitié) : le lot 7 selon le CDC.
- **Aucun déploiement, aucune écriture D1, aucun secret.** Rien n'a été poussé sur `main`.
