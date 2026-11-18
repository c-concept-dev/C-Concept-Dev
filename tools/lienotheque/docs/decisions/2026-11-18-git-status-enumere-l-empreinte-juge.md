# `git status` énumère, la taille, la date et l'empreinte jugent

**Décidé par** Christophe, dans la fenêtre de la session du 18 novembre 2026.
**Date** : 18 novembre 2026.
**Complète** son exigence du 17 novembre 2026, lot `0c quater`.

## La décision

> « Ma décision "tout le dépôt via `git status`" complétée : `git status` énumère, taille, date et
> empreinte de chaque chemin jugent ; avec la raison (les deux aveuglements mesurés). »

Le 17 novembre, son exigence disait : « tout le dépôt via `git status`, dans le script du contrôle
complet ». Les trois termes tiennent — tout le dépôt, `git status`, dans le script — et la décision
d'aujourd'hui ajoute **le partage des rôles** : `git status` est l'**énumérateur**, et ce sont la
taille, la date de dernière écriture et l'empreinte de chaque chemin nommé qui **jugent**.

## La raison : deux aveuglements, tous deux mesurés

**Premier aveuglement — `git status` rend des états, pas des contenus.** Sur une copie de travail
déjà sale, qui est l'état ordinaire quand on contrôle avant de commiter, une seconde écriture dans
un fichier déjà modifié ne change **rien** à sa sortie. Mesuré le 17 novembre 2026 : deux écritures
successives dans le même fichier suivi, deux relevés `git status` **identiques au caractère**. Et
c'est exactement le cas du 5 novembre 2026, celui qui a rendu un verdict faux. D'où les trois
valeurs : l'empreinte voit réécrire, la taille le dit en clair, et la **date** attrape le cas
qu'aucune empreinte ne verrait — un fichier modifié puis rendu **identique** pendant la course.

**Second aveuglement — `--porcelain` nu replie un dossier non suivi.** Il rend une seule ligne,
« `?? un-dossier/` », et ne nomme aucun des fichiers qu'il contient : une écriture dans un dossier
déjà non suivi serait passée inaperçue. Trouvé par un contrôle **rouge**, pas par relecture. D'où
`--untracked-files=all`, dont le prix a été mesuré avant d'être imposé : **52 ms contre 52 ms** sur
8 291 chemins suivis. L'option qui voit tout est gratuite ici.

## Ce que la décision ne couvre pas, et c'est dit

Les fichiers **ignorés** — `target/`, les moteurs, les œuvres — n'entrent dans aucun relevé, parce
que `git status` ne les nomme pas. Les contrôles y écrivent en permanence : un relevé qui les
suivrait refuserait toute course. Une écriture là-dedans reste donc invisible au garde-fou.

## Portée

Le script du contrôle complet, qui relève avant et après chaque course, et refuse en nommant le
chemin qui a bougé. Le relevé vit dans `packages/banc/src/releve-du-depot.ts`, éprouvé par
mutation (lot `0c quater`, fait le 17 novembre 2026). Elle remplace la parade **manuelle** tenue
pendant douze jours — un relevé `sha256` tapé à la main avant et après, hors du dépôt.
