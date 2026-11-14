# L'étape 1 est close : Christophe a vu l'application

**Vérifié par Christophe le 14 novembre 2026, à l'écran** — niveau 3, le seul niveau que ni un
contrôle, ni une mesure, ni moi ne pouvons produire. Ses mots :

> « Regard sur l'application neuve (fabriquée le 14 novembre à 21:17) : **tout fonctionne**. Coche
> la dernière case de l'étape 1 (niveau 3, mes mots) et inscris-la : l'étape 1 est close. »

La case cochée est la quatrième et dernière de l'étape 1, celle qui portait trois choses à la
fois : l'écriture réelle dans la bibliothèque (porte de Christophe), la sauvegarde vérifiée, et
la vérification à l'écran. Les deux premières datent du 12 novembre ; la troisième manquait, et
c'est elle qui fermait l'étape.

## Ce que ce niveau 3 a coûté, et pourquoi il mérite d'être écrit

Le **premier** regard de Christophe, le même jour, a montré une bibliothèque **vide** : « le
panneau Pages affiche « Aucun résultat dans cette bibliothèque » : je ne peux pas voir ses pages
ni ses liens ». Un en-tête annonçait pourtant « 51 liens ».

Aucun contrôle du dépôt ne voyait ce défaut, et aucun ne pouvait : il ne naît ni dans le code, ni
dans les données, mais de leur **écart de date**. Le paquet installé avait été fabriqué le
10 novembre à 17:12 ; la version 4 de la bibliothèque avait été écrite le 12, avec un état
(`relecture_non_faite`) ajouté au contrat le 12 à 10:33. Le contrat du paquet est `.strict()` : il
refusait la vue entière pour un mot qu'il ne connaissait pas, et l'écran retombait sur une vue
vide sans rien en dire.

**Le § 4.8 range cette vérification au niveau 3 parce qu'elle voit ce qu'aucun autre niveau ne
voit.** Ici, elle a vu un produit sain déclaré inutilisable par un paquet périmé. Ni les 3 239
contrôles du dépôt, ni la CI verte sur trois systèmes, ni le banc qui rendait 116 pages n'ont
signalé quoi que ce soit — tous jugeaient le code, et le code était juste.

Deux choses en sont sorties, inscrites le même jour : la **règle de réinstallation** (on réinstalle
avant d'écrire avec un code plus récent que l'application installée) et le **lot 0x**, prioritaire
avant l'étape 2, qui interdit qu'une application plus ancienne redevienne aveugle en silence.

## Ce que l'étape 1 laisse derrière elle, et qui n'est pas réglé

Deux dettes portaient une échéance que la clôture de l'étape 1 fait passer :

| dette | ce qu'elle dit | échéance déclarée |
|---|---|---|
| **D3** | préséance des causes d'abstention non uniforme : `voie-oracle.ts` rend `aucun_repere_lu` sans demander si le vivier est borné | **avant l'étape 1** |
| **D10** | épingle « Tesseract absent » : levée par le repli correct quand Tesseract manque | **étape 1** |

Aucune des deux n'est levée, et ni l'une ni l'autre ne peut l'être par un constat : l'épingle
`tesseract-absent-aucune-page-lue` est toujours dans `fixtures/references/echecs-connus.json`, et
le repli qu'elle attend n'est pas écrit. Déplacer leur échéance serait **décider**, non constater —
donc hors de ce que je peux changer seul au cahier (règle du 10 novembre 2026). Elles restent
donc inscrites telles quelles, échéance dépassée et visible, et c'est à Christophe de dire où
elles vont.

La **sauvegarde** `musique-avant-version-4-20261112-165547` reste en place sur son mot du
14 novembre : « elle peut rester en place pour l'instant ; ne la retire pas sans mon mot. »
