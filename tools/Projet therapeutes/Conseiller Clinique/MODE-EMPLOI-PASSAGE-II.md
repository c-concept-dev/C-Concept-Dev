# Passage humain II — la bande rythmo, les repères, la reprise d'un passage

Six épreuves, une heure et demie environ. **Sans casque et sans micro externe.** Votre Mac reste à
48 000 Hz : rien à régler.

> **UNE CORRECTION, ET UNE DEMANDE.** Je vous avais écrit ici de ne pas toucher au « Mode micro »
> pendant une prise, en vous attribuant ce geste. **C'était faux et je le retire** : vous ne l'avez
> pas touché. La perte momentanée du micro de la prise du 17 octobre à 14:01 (« piste muette » à
> l'échantillon 1 022 208, puis « piste non muette ») est survenue **sans cause connue**, une fois
> sur un vrai Safari ; la pause automatique et la reprise ont fonctionné, et c'est la seule chose
> que cet essai a établie.
>
> Comme je ne sais pas d'où elle vient, le journal consigne maintenant **le contexte de l'instant**
> à chaque événement de piste : onglet visible ou caché, fenêtre au premier plan ou non, secondes
> écoulées depuis votre dernier geste, changements de périphérique des cinq dernières secondes,
> état du contexte audio et de la piste. **Si cela se reproduit, ne faites rien de particulier** :
> envoyez-moi le rapport, et dites-moi seulement ce que vous faisiez à cette seconde-là (une autre
> application, un casque branché, l'écran qui s'éteint, rien du tout). C'est ce rapprochement-là
> qui trouvera la cause.

```bash
cd ~/Documents/GitHub/C-Concept-Dev-lot3-wt/"tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8765 --bind 127.0.0.1
```

```
http://127.0.0.1:8765/banc-enregistreur.html
```

**Avant de commencer**, regardez la **barre du bas, à droite** : elle porte maintenant
« Version : bande-rythmo xxxxxxxx · voix-stockage xxxxxxxx · … ». Ce sont les empreintes des
quatre modules servis. Si un rapport que vous m'envoyez ne les porte pas, il ne prouve rien —
c'est ce que E13 demande, et c'est à cela que je saurai quelle version a produit quelle prise.

---

## Épreuve 1 · La bande, et sa lisibilité à distance de bras

| Geste | Ce qui doit se passer |
|---|---|
| Collez votre texte dans **« Texte de la narration »** — une ligne par passage | La bande apparaît : le passage courant en grand, le suivant en dessous en plus petit et atténué. Une barre verticale à gauche est le **curseur fixe** : c'est le texte qui défilera sous elle, pas elle qui avancera. |
| Écrivez `[pause]` ou `[pause 2 s]` quelque part dans une ligne | La marque **disparaît du texte affiché** — elle n'est pas lue — mais son silence est compté dans la durée du passage. Si vous écrivez une forme que je ne reconnais pas (par exemple `[pause 2]`, sans le « s »), un avis orange vous le dit : elle serait **lue à voix haute**. |
| Réglez **« Taille du texte de la bande »** | Reculez-vous à distance de bras et montez jusqu'à ce que ce soit confortable. **Dites-moi la valeur que vous retenez** : c'est elle qui deviendra le défaut. |
| Réglez **« Vitesse de défilement »** | 2,5 mots par seconde au départ. La valeur s'affiche à droite de la bande. |

**Ce que je vous demande** : la taille retenue, la vitesse qui vous convient, et si le passage
suivant en dessous vous aide ou vous distrait.

---

## Épreuve 2 · Une prise de 5 minutes avec 5 repères à la télécommande

| Geste | Ce qui doit se passer |
|---|---|
| **« Choisir la touche de repère »**, puis pressez la touche de votre télécommande | Le champ affiche son nom. **Page suivante** fonctionne de toute façon, sans rien régler : c'est ce que E4 prévoit pour une télécommande de présentation, précisément pour éviter le claquement du clavier près du micro. |
| « Autoriser le micro », laissez tourner deux secondes, **« Commencer la prise »** | Un **compte à rebours de 3 secondes** se joue aux haut-parleurs, avec ses bips, puis une **garde** de 0,5 s, et la prise commence seulement après. Rien du rebours n'entre dans la voix. |
| Lisez votre texte 5 minutes, et posez **un repère à chaque changement de passage** | Chaque repère apparaît dans la rangée, avec son instant et son numéro de passage. La bande avance d'un passage. |
| Essayez de **maintenir** la touche enfoncée une seconde | **Un seul repère**, pas dix. Les répétitions automatiques sont comptées et ignorées (E9 — au lot 0 vous aviez eu quatre repères en 0,3 s). |
| Posez volontairement **deux repères très vite** (moins d'un quart de seconde) | Le second apparaît **en rouge, marqué DOUTEUX**, avec un avis. Il est **posé, pas jeté** : à vous de le garder ou non. C'est ce que E9 demande — « signalés avant validation ». |
| **Flèche gauche** ou **Page précédente** | La bande **revient** au passage précédent **sans effacer** aucun repère. L'horloge audio, elle, ne recule pas : on ne défait pas des échantillons déjà écrits, et le rapport porte ce décalage. |
| « Arrêter la prise » | Le rapport porte les repères, et les **trois contrôles de T6** : le nombre de repères attendu, leur ordre croissant, aucun repère hors de la durée de la voix. Ils **informent** : le blocage de l'export est du lot 4. |

**Ce que je vous demande** : le nombre de repères posés contre le nombre de passages, si la touche
de la télécommande est pratique en lisant, et le texte de tout avis que je n'ai pas annoncé.

---

## Épreuve 3 · La bande se fige quand la voix s'arrête

C'est le point le plus important de ce jalon, et il tient en une phrase du cahier des charges :
« **Le défilement suit l'horloge audio, jamais celle de l'interface.** »

| Geste | Ce qui doit se passer |
|---|---|
| Pendant une prise, pressez **Espace** (pause) | La bande **se fige net**. Pas d'un mot de plus. Le vu-mètre continue de bouger si vous parlez — le micro reste ouvert — mais rien n'est enregistré et rien ne défile. |
| Attendez 20 secondes, puis Espace de nouveau | La bande repart **exactement où elle s'était arrêtée**. Les 20 secondes ne sont ni dans la voix ni dans la bande. |

**Ce que je vous demande** : regardez le mot sous le curseur avant la pause et après la reprise.
**Ce doit être le même.** S'il a bougé, dites-le-moi : cela voudrait dire que la bande suit
l'horloge de l'écran, et votre texte se décalerait de toute la durée des pauses.

Mesuré ici avant de vous le donner : sur trois secondes de pause, la bande n'a pas bougé d'un mot,
là où l'horloge de l'écran l'aurait fait avancer de 7,5 mots. Et sur **quinze minutes**, la dérive
entre l'horloge audio et la bande est **exactement nulle** — parce que la position est recalculée
à partir de l'indice d'échantillon, jamais accumulée.

---

## Épreuve 4 · Une prise de 15 minutes

Lisez quinze minutes d'un seul tenant, en posant vos repères normalement.

| Ce qu'il faut regarder | Ce qui est attendu |
|---|---|
| La durée finale | Celle de l'horloge, à la seconde près. |
| La bande à la fin | Encore en face du bon passage : aucun décalage accumulé. |
| Les morceaux | 180 morceaux de 5 s, environ 86 Mo, rien qui ralentit. |
| Le bruit de pièce | Si vous n'avez fait **aucune pause d'une seconde**, le rapport dira « **NON MESURABLE** » et **aucun état** — ni calme, ni correct, ni bruyant. C'est voulu : une estimation prise dans la voix serait une fausse alerte. Faites une pause d'une ou deux secondes quelque part si vous voulez une mesure. |

---

## Épreuve 5 · Refaire un passage, en doublage, sur les haut-parleurs du Mac

C'est le point 4 du jalon II, et c'est la partie que je n'avais pas livrée la dernière fois. Elle
est là maintenant. **Faites d'abord l'épreuve 2**, pour avoir une prise avec des repères : c'est
elle qui servira de source.

Le panneau **« Refaire un passage »** est sous les réglages de repère. Il porte cinq choses : la
**prise source**, le **passage à refaire**, le **mode**, la durée de l'**amorce** (5 s par défaut)
et le **silence de garde** (1 s, utile dans le second mode seulement).

### 5a · Mode « doublage » — le mode par défaut, et celui qui compte

| Geste | Ce qui doit se passer |
|---|---|
| Choisissez votre prise de l'épreuve 2 comme **prise source**, le **passage 3** (par exemple), mode **« Doublage »**, amorce **5 s** | Rien encore : le réglage n'enregistre pas. |
| « Refaire ce passage » | Un **compte à rebours de 3 secondes** (E2 : « y compris les reprises »), puis **en même temps** : les **5 dernières secondes de votre voix avant ce passage** sortent des **haut-parleurs du Mac**, et la prise neuve commence à enregistrer. L'encadré **« Amorce (doublage) »** affiche la durée jouée. |
| Pendant que l'amorce joue | **La bande est déjà calée sur le passage choisi**, et elle arrive au premier mot du passage **exactement quand l'amorce se termine**. C'est tout l'intérêt du mode : vous enchaînez dans le rythme, sans compter dans votre tête. |
| Enchaînez à la fin de l'amorce, lisez le passage, « Arrêter » | **Deux prises** dans la liste : l'ancienne est **intacte** (R7, T10 : rien n'est écrasé), la neuve porte « reprise du passage 3 ». |

**Ce que vous devez entendre, et c'est le point à vérifier** : l'amorce s'arrête **net** à la fin
des 5 secondes. Elle ne doit **pas** continuer sur la suite de l'ancienne prise par-dessus votre
voix. Si vous entendez l'ancienne prise continuer, dites-le-moi immédiatement : c'est le défaut
que ce mode ne doit pas avoir.

**Ce que vous devez voir dans le rapport** (`zoneDAmorce`) :

| Champ | Ce qu'il dit |
|---|---|
| `priseSource`, `positionDuPassageDansLaSource` | de quelle prise, et à quel échantillon le passage commence |
| `debutDansLaSource` → `finDansLaSource` | la plage relue dans l'ancienne prise, en échantillons |
| `debutDansLaPriseNeuve` → `finDansLaPriseNeuve` | **où la fuite des haut-parleurs se trouve dans la nouvelle prise** : c'est cette zone que le montage coupera (E10). Le début est **mesuré** sur l'horloge audio, non annoncé. |
| `lecture.latenceDeSortie_s` | la latence de sortie **lue par l'API** quand le moteur la déclare (Safari ne la déclare pas : le champ dit alors qu'elle est inconnue, au lieu d'écrire un zéro) |
| `tronquee`, `raisonDeLaTroncature` | si votre passage commence moins de 5 s après le début de la prise source, l'amorce est **raccourcie** et le dit |

**La fuite des haut-parleurs EST dans la prise, et c'est voulu.** E10 l'assume : c'est le prix de
l'enchaînement. La zone est marquée pour qu'elle se coupe au montage. Dites-moi si elle vous gêne
à l'écoute : si oui, c'est le second mode qu'il faudra préférer.

### 5b · Mode « amorce puis silence »

| Geste | Ce qui doit se passer |
|---|---|
| Même passage, mode **« Amorce, puis silence, puis enregistrement »**, garde **1 s** | Le rebours, puis l'amorce **seule** aux haut-parleurs, puis **une seconde de silence**, et **alors seulement** l'enregistrement commence. |
| Regardez le rapport | La zone d'amorce de la prise neuve est **vide** (`0 → 0`) : rien de l'ancienne prise n'est dans la nouvelle. En échange, vous avez perdu l'enchaînement. |

**Ce que je vous demande** : lequel des deux modes vous convient pour de vrai, et si une seconde
de garde est la bonne durée.

### 5c · Les trois cas tordus

| Geste | Ce qui doit se passer |
|---|---|
| Refaire le **premier** passage (rien ne le précède) | Un avis dans l'encadré : **reprise SANS amorce**, avec sa raison. La prise est enregistrée quand même. |
| Prise source **« — aucune — »** | Même chose : sans amorce, et le rapport le dit. |
| Refaire **deux fois** le même passage | **Trois prises** au total, les deux reprises liées au **même** passage, chacune avec sa zone. Aucune n'écrase l'autre : c'est au lot 4 de choisir laquelle il monte. |

---

## Épreuve 6 · La vitesse de chaque passage, et les marqueurs théoriques

### 6a · La vitesse par passage (R5)

Après une prise avec des repères, sous la rangée des repères, chaque passage affiche sa **vitesse
en mots par seconde**, sa durée, son écart à la vitesse choisie, et son état.

| Ce que vous verrez | Pourquoi |
|---|---|
| « Passage 2 · 3,10 mots/s · 6,45 s · +24,0 % · trop rapide » **en rouge** | l'écart dépasse le seuil |
| Un avis orange qui récapitule les passages en alerte | pour ne pas avoir à les chercher |
| « durée trop courte pour juger » sur un passage très bref | en dessous de **2,5 secondes**, l'incertitude de vos deux repères (un quart de seconde chacun, le délai de l'antirebond) atteint à elle seule le seuil de 20 % : la vitesse s'affiche, l'alerte non |

**Le seuil par défaut est 20 %, et il est réglable** (« Alerte de vitesse au-delà de »). Voici
d'où il vient, parce que ce n'est pas un chiffre de goût. En bas, il est borné par la **mesure** :
vos deux repères sont posés à la main, chacun incertain d'environ 250 ms, soit 500 ms sur la durée
d'un passage — déjà 5 % sur un passage de 10 secondes. Un seuil à 5 % alerterait donc sur votre
doigt, pas sur votre lecture. En haut, il est borné par l'**oreille** : à 2,5 mots par seconde,
20 % font un demi-mot par seconde, et un passage lu à 3 mots/s au lieu de 2,5 s'entend comme
pressé. Si vous changez le seuil, la durée minimale suit automatiquement — c'est la même
grandeur, pas un second réglage à tenir.

**Un passage qui porte `[pause 2 s]` n'est pas compté comme lent** : la pause écrite est retirée
avant de diviser. Sans cela, un silence voulu déclencherait une alerte.

**Ce que je vous demande** : si les alertes tombent sur les passages que **vous** trouvez trop
rapides. Si elles sont trop bavardes, montez le seuil et dites-moi la valeur qui vous va ; si
elles manquent des passages que vous sentez pressés, baissez-le.

### 6b · Les marqueurs théoriques (R6)

| Geste | Ce qui doit se passer |
|---|---|
| Au chargement, regardez la case **« Poser des marqueurs théoriques »** | Elle est **décochée**. C'est ce que R6 demande : l'option est désactivée par défaut. |
| Cochez-la, puis commencez une prise | Les repères sont **déjà là**, aux durées que la bande prévoit pour chaque passage. |
| Ajustez-les | Chaque repère porte **−**, **+** et **×** : reculer de 100 ms, avancer de 100 ms, retirer. Ce sont des repères **comme les autres** — ils comptent dans les contrôles de T6, dans les vitesses, et dans le rapport. |
| Posez un repère à la main par-dessus | Il **n'est pas** marqué douteux. L'antirebond garde votre geste, pas la bande. |

**Ce que je vous demande** : si poser les marqueurs d'avance et les ajuster vous fait gagner du
temps par rapport à les poser en lisant, ou si cela vous encombre.

---

## Ce que je vous demande de me renvoyer

1. **Le rapport JSON** de chaque épreuve. Il porte maintenant : les **empreintes des quatre
   modules**, la **bande** (vitesse, passages, calage), les **repères** avec leur instant en
   échantillons, le **compte à rebours** (secondes, bips joués, garde), les **trois contrôles de
   T6**, et le **graphe de capture** avec ce que votre piste déclare réellement.
2. **La taille de texte** et la **vitesse** que vous retenez.
3. Pour l'épreuve 3 : **le mot sous le curseur avant et après la pause**.
3 bis. Pour l'épreuve 5 : **est-ce que l'amorce s'arrête net**, et est-ce que la bande arrive au
   premier mot du passage **au moment où elle se tait** ? Ces deux choses sont à votre oreille :
   les contrôles prouvent que la lecture s'arrête au bon échantillon, ils ne peuvent pas prouver
   qu'on enchaîne confortablement. Dites-moi aussi lequel des deux modes vous garderiez, et si la
   fuite des haut-parleurs vous gêne à l'écoute.
3 ter. Pour l'épreuve 6 : le **seuil d'alerte** que vous retenez, et si les marqueurs théoriques
   vous font gagner du temps.
4. Le **texte exact** de tout avis que je n'ai pas annoncé.
5. Si le compte à rebours s'entend bien dans les haut-parleurs, et si la garde de 0,5 s suffit
   pour que son dernier bip ne soit pas dans la voix. **C'est à votre oreille de le dire** :
   aucun test automatique ne peut l'entendre, parce qu'au banc la source remplace le micro et que
   rien de ce que jouent les haut-parleurs ne peut y entrer.

---

## Ce qui n'est PAS fait, et que vous ne trouverez pas

Le **point 4 est livré** : la reprise d'un passage avec amorce réelle, dans les deux modes, est
l'épreuve 5. Ce qui reste absent, et attendu ailleurs :

- le tracé des repères sur une **forme d'onde** — il n'y en a pas encore ;
- le **déplacement d'un repère à la souris** (T4) : vous les ajustez au bouton, par pas de 100 ms,
  et c'est tout ce que ce jalon donne. T4 reste en mémoire, comme convenu ;
- le **blocage de l'export** par les trois contrôles de T6 : ils informent ici, le lot 4 bloque ;
- le **calibrage micro / haut-parleur** (lot 3B) : la latence de sortie est lue et écrite dans le
  rapport, mais elle n'est **pas** compensée. Si vous trouvez que la zone d'amorce est décalée à
  l'oreille de quelques dizaines de millisecondes par rapport à ce que le rapport annonce, c'est
  là que cela se réglera, et votre mesure est exactement ce qu'il me faudra.

**Mesuré automatiquement avant de vous le donner** : 81 contrôles, 135 mutations falsifiées sur
135, 0 trou. La bande se fige en pause (3 s d'horloge du mur, 0 mot) · dérive nulle sur 15 minutes
à 48 et 44,1 kHz · un repère daté à l'échantillon, encadré par deux relevés · 8 répétitions de
touche ignorées et 0 repère posé · deux repères à 55 ms signalés · rebours de 2 s + garde de 0,5 s,
2 bips, 0 échantillon écrit avant · les quatre empreintes de modules conformes aux fichiers du
dépôt. **Nouveau** : l'amorce s'arrête au dernier échantillon de sa zone (88 199 sur 88 200 à
44,1 kHz), 0 échantillon joué au-delà, 0 venu d'ailleurs que de la zone, aux deux fréquences ·
une reprise crée une prise de plus et jamais une continuation · une amorce coupée par l'arrêt se
tait, mesuré sur l'horloge audio par l'événement du nœud · les vitesses de cinq passages de
vitesses connues, pause écrite retirée · l'option des marqueurs théoriques décochée au chargement
· le contexte de l'instant présent et cohérent sur les quatre événements de piste (onglet forcé
caché, geste daté à 0,7 s, un changement de périphérique dans les cinq secondes).
