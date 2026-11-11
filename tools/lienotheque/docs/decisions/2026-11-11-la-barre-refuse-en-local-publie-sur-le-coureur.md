# La barre de ×3 refuse en local, et publie sur le coureur

**Tranché par Christophe le 11 novembre 2026**, après trois hypothèses mesurées et réfutées. Ses
mots :

> « - la barre ×3 s'applique au **contrôle complet LOCAL** (machine stable), avant chaque commit ;
> allume-la (contrôle complet avant ce commit) ;
> - sur le **coureur GitHub**, les marges sont **publiées sans refus** (sa variabilité, ×1,6 d'une
> course à l'autre, ferait d'un refus un tirage au sort) ; un contrôle qui passe sous ×2 **de façon
> répétée** devient un lot pour raccourcir son corps, **jamais pour allonger son délai**. »

## Ce qui a rendu cette décision nécessaire

La barre attendait une condition : plus aucun contrôle sous ×3 **sur le coureur**. Trois lots l'ont
approchée, et trois hypothèses ont tenté de finir le travail. Les trois ont été **réfutées par la
mesure** :

| hypothèse | ce que la mesure a dit |
|---|---|
| la première lecture de binaires fraîchement décompressés | froide 548 ms, chaude 575 ms : **aucune différence** |
| Gatekeeper / XProtect sur un binaire du paquet | le contrôle **n'exécute** aucun binaire du paquet, il les lit avec `otool` |
| le premier chargement du modèle de langue de Tesseract | trois reconnaissances d'affilée : **101, 115, 102 ms** |

Une seule a tenu — le **premier lancement d'`otool`**, 1 531 ms —, et son correctif a ramené
`paquet-hermetique` de 2 480 à 711 ms. Il n'a pas suffi.

## Pourquoi un refus sur le coureur serait un tirage au sort

Mesuré le 11 novembre sur deux courses **du même code** :

| contrôle | une course | la suivante |
|---|---|---|
| `voie-oracle · publie l'accord noms-table` | 1 717 ms (×2.91) | **2 695 ms (×1.86)** |
| `aucune-page-lue · compte des pages` | 1 827 ms (×2.74) | 1 788 ms (×2.80) |
| `crochet-des-gestes · refuse git add -A` | *absent du tableau* | **1 823 ms (×2.74)** |

Un rapport de **×1,6** sur le même contrôle, et un contrôle qui **ne lit ni n'océrise rien** entré
dans le tableau sans qu'une ligne ait bougé. Tous ont la même forme : un délai de 5 000 ms et un
corps de 1,7 à 2,7 s.

**Chasser une cause par contrôle, c'est chasser du bruit** — et c'est l'erreur que les trois
hypothèses d'aujourd'hui ont failli faire commettre trois fois de suite.

## Ce que la décision fait, et ce qu'elle ne fait pas

**Elle ne suspend pas la mesure, seulement le refus.** Sur le coureur, les marges serrées sont
toujours **relevées, comptées et dites** — le journal y écrit « barre de ×3 : marges **publiées
sans refus** sur cette machine […] ; c'est le contrôle complet local qui tranche ». Un contrôle
qui passe **sous ×2 de façon répétée** devient un lot pour raccourcir son corps.

**Le défaut est strict.** `jugerLesMarges` refuse par défaut : un appelant qui ne dit pas où il
tourne obtient le comportement strict. Un oubli doit coûter un refus de trop, jamais un refus de
moins — un contrôle le tient, et la mutation inverse le fait tomber.

## Ce qui a permis de poser la barre, et aucun raccourci n'y figure

| lot | ce qu'il a fait |
|---|---|
| **16b** | séparé un contrôle qui payait deux lectures contre un seul délai |
| **14 bis** | plusieurs images en **un seul appel** de reconnaissance — 90 % du coût étant le démarrage du processus ; `voie-oracle.test.ts` de **898,6 s à 403,6 s** |
| **14 quater** | le premier lancement d'`otool`, 1 531 ms, sorti du contrôle |

**Aucun délai allongé. Aucun contrôle raboté.** La plus courte marge du dépôt est passée de ×2,95
à **×5,49** sur la machine de Christophe, et c'est elle que la barre juge.

## Première course sous la barre allumée

Contrôle complet du 11 novembre, 16 h 30 → 16 h 39 : **code 0, 3 176 contrôles, 1 rouge épinglé,
8 sautés**, et la plus courte marge à **×5.49**. C'est la première fois que la barre pouvait
refuser ; elle n'avait rien à refuser.
