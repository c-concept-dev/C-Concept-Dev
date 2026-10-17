# Passage humain II — la bande rythmo, les repères, le compte à rebours

Quatre épreuves, une heure environ. **Sans casque et sans micro externe.** Votre Mac reste à
48 000 Hz : rien à régler.

> **NE TOUCHEZ PAS AU « MODE MICRO » PENDANT UNE PRISE.** Vos essais du 17 octobre l'ont établi :
> y toucher provoque une **perte momentanée du micro** — le journal porte « piste muette » puis
> « piste non muette ». La pause automatique et la reprise ont bien fonctionné, et c'est tant
> mieux, mais ce n'est pas ce qu'on cherche à éprouver ici. Si vous voulez couper l'entrée, c'est
> **Réglages Système → Son → Entrée → volume d'entrée à zéro**, et le « Mode micro » ne la coupe
> pas de toute façon.

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

## Ce que je vous demande de me renvoyer

1. **Le rapport JSON** de chaque épreuve. Il porte maintenant : les **empreintes des quatre
   modules**, la **bande** (vitesse, passages, calage), les **repères** avec leur instant en
   échantillons, le **compte à rebours** (secondes, bips joués, garde), les **trois contrôles de
   T6**, et le **graphe de capture** avec ce que votre piste déclare réellement.
2. **La taille de texte** et la **vitesse** que vous retenez.
3. Pour l'épreuve 3 : **le mot sous le curseur avant et après la pause**.
4. Le **texte exact** de tout avis que je n'ai pas annoncé.
5. Si le compte à rebours s'entend bien dans les haut-parleurs, et si la garde de 0,5 s suffit
   pour que son dernier bip ne soit pas dans la voix. **C'est à votre oreille de le dire** :
   aucun test automatique ne peut l'entendre, parce qu'au banc la source remplace le micro et que
   rien de ce que jouent les haut-parleurs ne peut y entrer.

---

## Ce qui n'est PAS fait, et que vous ne trouverez pas

**La reprise d'un passage en mode doublage, et la zone d'amorce, ne sont pas livrées.** C'est le
point 4 du jalon II, et c'est la seule partie que je n'ai pas atteinte. Ne la cherchez pas dans
l'écran : il n'y a ni bouton « refaire ce passage », ni amorce jouée aux haut-parleurs, ni zone
marquée dans la prise.

Ce qui existe déjà et qui la prépare : la logique de la zone d'amorce est écrite et éprouvable
(début et fin en échantillons, prise source, position dans la source, troncature si la source est
plus courte que l'amorce demandée, et le cas « amorce puis silence » avec sa garde), mais rien ne
la relie encore à une lecture réelle de l'ancienne prise. Ce qui manque est précisément ce qui
doit être mesuré avant d'être montré : que **la lecture s'arrête exactement à la fin de l'amorce**,
et que la prise neuve soit **liée au bon passage**. Je ne vous le donne pas à essayer avant de
l'avoir mesuré.

Également absent, et attendu ailleurs : le tracé des repères sur une **forme d'onde** (il n'y en a
pas encore), le déplacement d'un repère à la souris (T4, en mémoire), et le blocage de l'export
par les trois contrôles de T6 (lot 4 — ici ils informent).

**Mesuré automatiquement avant de vous le donner** : 73 contrôles, 111 mutations falsifiées sur
111, 0 trou. La bande se fige en pause (3 s d'horloge du mur, 0 mot) · dérive nulle sur 15 minutes
à 48 et 44,1 kHz · un repère daté à l'échantillon, encadré par deux relevés · 8 répétitions de
touche ignorées et 0 repère posé · deux repères à 55 ms signalés · rebours de 2 s + garde de 0,5 s,
2 bips, 0 échantillon écrit avant · les quatre empreintes de modules conformes aux fichiers du
dépôt.
