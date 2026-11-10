# Toute nouvelle session part de la branche de travail, jamais de `main`

**Décidé par Christophe le 10 novembre 2026.** Ses mots :

> « Règle à inscrire : toute nouvelle session part de la branche de travail, jamais de `main` ; à
> défaut, le travail se fait dans la session principale. »

Et, dans le même message :

> « Arrête la session D7 ouverte sur `main` (base fausse) ; abandonne son travail sans le reporter.
> Tu feras D7 toi-même, ici, sur `wip/lienotheque-2026-10-29` […] Les sessions arrêtées
> (`CLAUDE.md`, D23) : ferme-les sans reprendre leur travail. »

## Ce qui s'est passé

Trois chantiers avaient été proposés en session séparée : le garde-fou des marges (D7), la
correction de `CLAUDE.md` sur Windows, et le score sur peu d'apparitions (D23). L'application les a
ouverts dans trois copies neuves, **toutes les trois sur `main`** (`79228947`) — alors que la
consigne de chacune nommait explicitement la branche de travail et le worktree où elle vit.

`main` ne porte **rien** du travail du 9 novembre : ni `.claude/` versionné, ni les garde-fous nés
cette nuit-là, ni le cahier de pilotage à jour, ni l'épinglage de l'archive, ni la voie 3, ni les
huit bancs de mesure. Une session D7 partie de là aurait écrit son garde-fou contre un arbre où
rien de ce qu'elle doit corriger n'existe, et ses retouches à la file des lots et au journal des
autorisations seraient entrées en conflit frontal avec la branche de travail.

Les trois tournaient **en même temps**, ce que le § 4.4 interdit pour le contrôle complet : un
seul à la fois.

## La règle

1. Une session nouvelle part de la **branche de travail**, jamais de `main`.
2. Si on ne peut pas le garantir — et l'application choisit la base elle-même —, le travail se fait
   **dans la session principale**, celle qui tient la branche.
3. Deux sessions ne lancent jamais un contrôle complet en même temps. Vérifier qu'aucun `vitest` ne
   tourne avant d'en lancer un.

## Ce qui a été fait, et ce qui a été perdu

Les trois sessions sont **arrêtées et archivées**, leur travail non repris. Vérifié avant de
fermer : les trois copies étaient **vides** — zéro fichier modifié, zéro non suivi, zéro commit
au-dessus de `main`. Elles en étaient encore à lire. Rien n'a donc été abandonné qu'un peu de
temps, et c'est seulement parce que la vérification a été faite qu'on peut l'affirmer : la veille,
une copie décrite comme « sans travail unique » portait huit bancs de mesure que rien d'autre ne
portait.

Leurs copies de travail, 243 Mo chacune, ont été retirées par `git worktree remove` ; elles étaient
propres, donc sans `--force`. L'archivage d'une session, lui, ne les enlève pas.

## Un effet de bord, fermé le même jour

Ces copies vivaient sous `tools/lienotheque/.claude/worktrees/` — c'est-à-dire **à l'intérieur d'un
dossier que Git suit** depuis que `.claude/` a été versionné pour lever D19. Mesuré : trois copies,
728 Mo, 24 033 fichiers, à portée d'un `git add .claude`, que le crochet ne refuse pas. Une ligne
de `.gitignore` le ferme (`a025c325`), éprouvée dans les deux sens.
