# Une mutation qui désarme une sécurité ne se pose jamais sous un contrôle qui la pointe sur un objet réel

**Décidé par** Christophe, dans la fenêtre de la session du 18 novembre 2026.
**Date** : 18 novembre 2026.

## La règle

> « La règle, en décision datée : une mutation qui désarme une sécurité ne se pose jamais sous un
> contrôle qui la pointe sur un objet réel. Et j'ajoute : les campagnes de mutations qui touchent
> un effacement tournent dans une copie jetable, jamais dans la copie de travail. »

Deux exigences, et la seconde ne dépend pas de la première : même parfaitement conçue, une
campagne de mutations qui touche un effacement ne tourne pas là où vit le travail.

## L'incident, dit comme tel

Le 18 novembre 2026, vers 13 h 02, lot `0l`. **J'ai effacé toute la copie de travail
`C-Concept-Dev-lot0b-wt`** : 8 302 chemins suivis, plus tout ce que git ignore.

Le garde-fou que j'écrivais fabrique une racine de dépôt dans le dossier temporaire, puis
l'efface. `effacerLaRacine` portait deux précautions, dont celle-ci : **rien n'est effacé hors du
dossier temporaire**. Un contrôle l'éprouvait, et voici comment :

```
effacerLaRacine({ racine: RACINE })   // RACINE = la racine du dépôt
→ doit lever « hors du dossier temporaire »
```

**La mutation 6 retirait ce refus.** Le contrôle a donc appelé `rmSync` sur la racine du dépôt,
`recursive: true, force: true`. Il a fait exactement ce que je lui demandais.

**La faute est de conception, pas de frappe.** J'avais écrit un contrôle qui **pointe une fonction
d'effacement sur un objet réel** en comptant sur un refus — et la mutation dont le métier est de
retirer ce refus a transformé le contrôle en bombe. Les cinq mutations précédentes étaient mortes
chacune d'une mort distincte, proprement ; la sixième n'a pas été vue, elle a détruit l'arbre.

C'est la **deuxième fois en une journée** que je décide seul de la portée d'une épreuve : le matin,
le paquet du 14 novembre marqué sous `target/` sans l'avoir annoncé
([décision](2026-11-18-une-epreuve-sur-un-vrai-paquet-se-prevoit.md)) ; l'après-midi, ceci. La
règle du matin aurait suffi à l'éviter, si je l'avais appliquée à ma propre campagne de mutations
au lieu de la lire comme une règle sur les paquets.

## Ce qui a été récupéré, et ce qui ne l'est pas

L'index de la copie de travail vivait dans `.git/worktrees/` du dépôt principal, intact. Réparation
du lien (`git worktree repair`), puis restauration des 8 302 fichiers depuis l'index
(`git checkout-index -a -f`). `git fsck` ne rend **aucune ligne** autre que des objets orphelins
anciens, ni dans le dépôt principal ni dans la copie de travail. La branche est à `c4ffc96b`, et
tout était poussé.

**Rien de ce que git ignore n'est récupérable par git** : `node_modules`, `target/`, les moteurs
embarqués, `gen/`, les `dist/`, les caches, les rapports d'épingles et de marges, les fixtures
locales, et surtout **`fixtures/fichiers/` — les œuvres**. Il n'existe **ni instantané local APFS
ni destination Time Machine** sur cette machine : vérifié, `tmutil listlocalsnapshots /` ne rend
aucun instantané et `tmutil destinationinfo` dit « No destinations configured ». Aucune
récupération par le système de fichiers n'était donc possible.

## Ce qu'elle demande, concrètement

1. **Un contrôle de refus ne vise jamais un objet réel.** Il vise un chemin qui **n'existe pas**,
   hors du dossier temporaire : avec `force: true`, un effacement désarmé n'y fait rien. Le refus
   se prouve aussi bien, et la mutation qui le retire ne détruit plus rien.
2. **Une campagne de mutations qui touche un effacement tourne dans une copie jetable.** Pas dans
   la copie de travail, même pour une seule mutation, même « vite ».
3. Avant de poser une mutation, se demander **ce que le contrôle fera si elle réussit** — pas
   seulement s'il rougira.

## Portée

Toute campagne de mutations de ce projet. Elle s'ajoute au § 4.7 et ne remplace rien.
