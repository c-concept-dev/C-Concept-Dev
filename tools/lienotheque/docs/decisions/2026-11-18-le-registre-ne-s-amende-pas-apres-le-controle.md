# Le registre ne s'amende pas après le contrôle

**Décidé par** Christophe, dans la fenêtre de la session du 18 novembre 2026.
**Date** : 18 novembre 2026.
**Resserre** la règle de l'amendement forcé inscrite la veille au § 4.9 du cahier (lot
`0c quater`).

## La règle

> « Pas d'amendement du registre après le contrôle : un fichier lu par des garde-fous qui change
> après le contrôle part sans contrôle, et le § 4.9 sert à corriger une faute, pas à cela. Les
> chiffres du contrôle : dans le message du commit (amender le seul message ne touche aucun
> fichier, le contrôle reste valable), ou dans l'entrée 67 au prochain push. Le contenu de l'entrée
> 66 reste celui que le contrôle a vu. »

## Ce qui l'a fait écrire

Le 17 novembre, le lot `0c quater` inscrit l'amendement forcé au § 4.9 : entre le commit et la
poussée, une entrée du registre peut se corriger par `git commit --amend`, parce qu'un commit
amendé quitte l'historique que le garde-fou d'ajout seul lit.

Le 18 novembre, j'ai annoncé m'en servir pour **compléter** l'entrée 66 avec les chiffres du
contrôle qui conditionne la poussée — chiffres qui n'existent qu'une fois le contrôle fini, donc
après lui. Christophe l'a refusé **avant** que le geste n'ait lieu. La fenêtre de l'amendement
n'est pas une commodité d'écriture : elle existe pour réparer une faute, et s'en servir pour autre
chose vide le contrôle de son sens, puisque la poussée emporterait alors un fichier que le contrôle
n'a pas vu.

## Ce qu'elle interdit, et ce qu'elle laisse

**Interdit** : changer, après le contrôle complet, un fichier que des garde-fous lisent — le
registre, la file, le cahier. Si une faute apparaît là après le contrôle, on corrige **et on
recontrôle**. Ce qui n'est pas une faute attend l'entrée suivante.

**Laissé** : amender le **message** du commit. Un message n'est pas un fichier de l'arbre ; le
contrôle reste valable, et c'est là que les chiffres du contrôle doivent vivre. L'entrée suivante
du registre peut les reprendre.

## Ce qu'elle a coûté, et c'est dit

Le contrôle complet de cette poussée tournait depuis trois minutes quand la règle est arrivée :
l'entrée 66 annonçait l'amendement, et cette phrase devenait fausse. La course a été **arrêtée**,
la phrase corrigée, la règle inscrite, et le contrôle **relancé depuis le début** sur l'état que la
poussée emporte vraiment. Neuf minutes, et c'est le bon prix.

## Portée

Tout fichier de documents que des garde-fous lisent, dans ce projet. Elle s'ajoute à la règle de
l'amendement forcé du 17 novembre sans l'annuler : les trois temps tiennent, le deuxième se limite
désormais à la correction d'une faute.
