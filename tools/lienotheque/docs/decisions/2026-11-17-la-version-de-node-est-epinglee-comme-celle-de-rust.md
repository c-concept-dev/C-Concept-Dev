# La version de Node est épinglée, comme celle de Rust

**Décision de Christophe le 17 novembre 2026**, mot pour mot :

> « Voie 1 maintenant : `node-version` épinglé à 24.11.1 dans les deux workflows, avec contrôle et
> mutation (un « 24 » sans patch rougit). »

Elle applique à Node, sans rien y changer, celle du 13 novembre sur Rust — « on en change
volontairement, jamais par surprise » ([`2026-11-13-la-version-de-rust-est-fixee-et-ne-change-jamais-par-surprise.md`](2026-11-13-la-version-de-rust-est-fixee-et-ne-change-jamais-par-surprise.md)).

## Ce qui l'a provoquée, et qui l'a dit

La course **44077859840** du prototype a refusé d'embarquer la chaîne, à l'étape 17 :

```
la collecte des licences a échoué :
les versions ne concordent pas (licences de l'archive) :
  node : le paquet ANNONCE 24.22.2, l'épingle dit 24.11.1
```

Le refus vient du juge des versions né **la veille**, au lot 0u ter. Le défaut, lui, était là
depuis le premier jour : le paquet redistribuait un `bin/node` 24.22.2 accompagné du **texte de
licence de 24.11.1**. Un fichier redistribué dont la licence embarquée décrit une autre version,
c'est-à-dire exactement ce que la règle 3.6 du cahier de pilotage demande d'éviter.

## La cause, mesurée aux deux bouts

| | node |
|---|---|
| `preparer-moteur-node.py` embarque | `shutil.which("node")`, **celui du coureur** |
| les deux courses demandaient | `node-version: 24`, **le dernier 24.x du jour** |
| le coureur livrait donc, le 17 novembre | **24.22.2** |
| le texte de licence embarqué (`fixtures/licences-des-moteurs.json`, `AMONT`) | **24.11.1** |

Le script **doit** prendre le node du coureur : le PATH des moteurs passe devant le sien, et lire
le node du paquet lui ferait trouver sa propre cible — faute déjà payée le 16 novembre. Ce qui
flottait n'était pas le script, c'était la version installée.

**Et ici, rien ne le voyait, pour la plus mauvaise des raisons** : cette machine porte justement
`v24.11.1`. La collecte était verte **par coïncidence de versions**, pas par épingle — le même
accident que le tesseract 5.5.1 de ce Homebrew, relevé la veille.

## Ce qui a été fait

1. Les **trois** `node-version` des deux courses — `lienotheque-ci.yml` deux fois,
   `lienotheque-tauri.yml` une fois — demandent `24.11.1`, le numéro que la donnée porte.
2. Le nom des étapes ne promet plus une famille : « Installer Node, à la version épinglée ».
   Un nom qui annonce « 24 » quand l'épingle dit autre chose finirait par se périmer seul.
3. Un garde-fou le tient, et il lit l'épingle **dans la donnée** : jamais le nombre `24.11.1` dans
   un contrôle. Il vérifie en plus que l'`AMONT` du collecteur porte le même numéro — sans quoi
   les courses installeraient la version de la donnée et la collecte refuserait au nom d'une autre.
4. **Cinq mutations, cinq mortes** : une famille nue (`24`), un correctif manquant (`24.11`), un
   autre correctif (`24.12.0`), plus aucune version demandée, et la donnée désaccordée du
   collecteur.

## Ce que cette décision ne fait pas

Elle **ne change pas** d'où vient le node du paquet : il reste celui du coureur, thinné et
re-signé. Faire venir Node de l'archive publiée, comme Tesseract depuis le 14 novembre, est une
autre décision — elle change le binaire livré, et elle est inscrite à la file sous **0u quinquies**,
à placer par Christophe, avec sa mesure en premier geste.

## La troisième fois que cette forme coûte un rouge

Un outil installé « à la dernière version » : Rust le 13 novembre (lot 0s), le tesseract de
Homebrew le 14 (dette D1, lot 0u), Node aujourd'hui. Les trois rouges venaient de la plateforme et
non du commit, et les trois ont été cherchés d'abord dans le travail du jour.
