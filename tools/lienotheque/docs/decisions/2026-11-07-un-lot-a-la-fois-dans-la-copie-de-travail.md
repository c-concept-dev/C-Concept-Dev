# Un seul lot à la fois dans la copie de travail

**Décidé par Christophe le 7 novembre 2026**, dans la fenêtre de la session.

Pour **chaque lot qui touche du code**, les autres lots sont mis en sûreté sur la branche de
sauvegarde **et retirés de la copie de travail**, avant son contrôle complet — pour que
**copie de travail = index = commit**. Ils sont remis ensuite par `git cherry-pick --no-commit`.

Un lot qui ne touche que de la documentation se contrôle sur la copie de travail telle qu'elle est :
rien de ce qu'il porte ne peut changer le résultat d'un contrôle.

## La raison

Un contrôle complet lit la **copie de travail**, pas l'index. Quand la copie porte quatre lots, un
contrôle vert ne dit pas que le commit est vert : il dit que les quatre ensemble le sont. Le lot
part donc avec une garantie qu'il n'a pas, et c'est l'inverse de ce qu'un contrôle sert à établir.

## Ce que la procédure vérifie, et pourquoi chaque vérification existe

**L'empreinte, pas la présence.** La sauvegarde porte-t-elle exactement les octets qu'on s'apprête
à effacer ? La première version demandait « ce chemin est-il dans la sauvegarde ? » — vide de sens,
puisque la sauvegarde est rafraîchie juste avant : tout fichier présent s'y trouve par
construction, et le refus écrit n'était pas atteignable.

Le 8 novembre, la vérification par empreinte a gagné sa place. La sauvegarde **portait**
`.github/workflows/lienotheque-ci.yml` — mais dans sa version de `HEAD`, sans les vingt lignes du
lot 0b : le relevé qui la construit se fait depuis le dossier du projet, et ce fichier vit à la
racine du dépôt parce que GitHub Actions l'exige. Une mise de côté fondée sur la présence aurait
**détruit le lot 0b**. Les chemins hors du projet sont désormais **nommés** dans le script, un par
un — jamais un relevé sur tout le dépôt, qui happerait le travail des autres sessions.

**La liste est calculée, non recopiée.** Les lots à mettre de côté sont ce que git annonce, moins
le lot courant. Une liste recopiée à la main oublie un fichier, et l'oubli ressemble à un succès.

**Le retrait nomme chaque fichier.** `git show HEAD:<chemin> > <chemin>` pour un suivi modifié,
`rm <chemin>` pour un neuf. Jamais un motif, jamais un dossier. Ni `git checkout --`, ni
`git restore` : les deux écrasent sans conflit et sans avertissement, et le crochet des gestes
destructeurs les refuse.

**La remise désindexe.** `git cherry-pick --no-commit` **indexe son résultat**. Sans un
`git reset` vérifié derrière, le lot suivant emporterait les autres dans son commit — c'est
exactement ce qui a fait entrer 96 lignes du lot Vision dans un commit d'autorisation le
7 novembre, par `git apply --3way`.

## Ce que cela remplace

L'habitude de composer un commit en nommant ses chemins dans l'index, en laissant la copie de
travail porter tout le reste. Nommer les chemins reste nécessaire ; cela ne suffisait pas, parce
que le contrôle ne lit pas l'index.
