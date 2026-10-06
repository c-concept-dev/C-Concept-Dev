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

## 7. Ce que ce lot ne livre pas

- **L'interface du chutier dans l'application** (V2 côté produit) : le brief demandait le moteur
  sans interface de banc, et c'est ce qui est livré. Les vignettes existent dans la page d'essai.
- **Le défilement d'une diapositive qui déborde** (V3, seconde moitié) : le lot 7 selon le CDC.
- **Aucun déploiement, aucune écriture D1, aucun secret.** Rien n'a été poussé sur `main`.
