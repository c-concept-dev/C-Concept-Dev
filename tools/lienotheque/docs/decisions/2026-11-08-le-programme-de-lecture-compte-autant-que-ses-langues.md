# Le programme de lecture compte autant que ses fichiers de langue

**Signalé par Christophe le 8 novembre 2026**, dans la fenêtre de la session.

Un contrôle qui compare les **fichiers de langue** de la reconnaissance ne suffit pas : le
**programme** lit aussi. Une autre version de Tesseract, ou une autre leptonica sous elle, rend
d'autres lectures **avec les mêmes fichiers**, et rien ne le signalerait.

Ce qui en découle, et qui est désormais une donnée versionnée : `fixtures/moteurs-de-lecture.json`
porte le bloc `programme`, avec la version de Tesseract et celle de leptonica **relevées sur
l'exécutable que l'application embarque** — constatées, non choisies. Si l'écart apparaît, le
contrôle doit **rougir**, jamais s'adapter : on relève la nouvelle version, on n'ajuste pas
l'attendu.

## La raison

C'est de cette remarque qu'est née la dette D1. Mesuré le 9 novembre : le coureur macOS de
l'intégration continue installe par Homebrew **Tesseract 5.5.4 / leptonica 1.87.0**, quand
l'application embarque **5.5.1 / 1.86.0**. Les deux lisent, et ne liraient pas forcément pareil.
Le binaire embarqué est ignoré par Git : l'intégration continue ne peut pas s'y comparer, et c'est
précisément ce qui rend la voie 3 nécessaire.

## Réserve sur la citation

Les mots exacts de Christophe ne sont pas conservés dans mon relevé de ce jour — seule leur
substance, inscrite le même jour dans le champ `pourquoi` de `fixtures/moteurs-de-lecture.json`,
que ce fichier-ci reprend. La citation ci-dessus est donc une **reformulation fidèle, pas un
verbatim**, et elle est marquée comme telle plutôt que présentée pour ce qu'elle n'est pas.
