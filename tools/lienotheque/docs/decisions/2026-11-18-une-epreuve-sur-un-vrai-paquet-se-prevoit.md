# Une épreuve sur un vrai paquet se prévoit et s'annonce avant

**Décidé par** Christophe, dans la fenêtre de la session du 18 novembre 2026.
**Date** : 18 novembre 2026.

## La règle

> « Une règle : une épreuve sur un vrai paquet (hors dossiers temporaires) se prévoit et s'annonce
> avant ; le marquage du paquet du 14 novembre sous `target/` est inscrit comme incident. »

Tout ce qui sort des dossiers temporaires se dit **avant** d'être touché : un paquet construit,
l'application installée, une vraie bibliothèque. Un dépôt jetable dans un dossier temporaire reste
libre — c'est déjà la règle du § 4.7.

## L'incident, dit comme tel

Le 18 novembre 2026, lot `0u quater`. Après avoir éprouvé le refus sur des faux paquets fabriqués
dans un dossier temporaire, j'ai lancé la **vraie** commande, `pnpm … tauri:finaliser:macos --
--essai`, pour mesurer si le séparateur de pnpm passait bien les arguments. Il ne les passait pas
comme je le croyais — c'était le défaut cherché, et la mesure a servi.

Mais la commande n'a pas échoué à la première ligne comme je l'attendais : le chemin par défaut
désignait un **vrai paquet**, construit le 14 novembre et endormi sous `target/`. Elle l'a donc
jugé, **marqué** d'un `PAQUET-D-ESSAI.txt`, re-signé entièrement, vérifié en profondeur et a
démarré son moteur. Deux fois, puisque j'ai relancé la commande après correction.

Rien n'est perdu et rien n'est cassé : `target/` est ignoré par git, la signature du paquet est
valide, et `/Applications/Liénothèque.app` n'a pas été touchée — vérifié, aucune marque, date du
14 novembre inchangée. L'épreuve a même donné ce qu'aucun faux paquet ne pouvait donner : la
preuve que la passe signe, vérifie et démarre pour de bon sur un objet réel.

**Ce qui est fautif n'est pas le résultat, c'est la portée.** Je n'avais pas prévu de toucher un
vrai paquet, je ne l'ai pas annoncé, et je l'ai dit après. C'est la même faute que celle du
17 novembre sur les autorisations, dans un autre domaine : décider seul d'élargir ce qu'une action
atteint, puis le rapporter quand c'est fait.

## Ce qu'elle demande, concrètement

Avant une épreuve qui sort des dossiers temporaires : dire **quel objet**, **ce qu'elle va lui
faire**, et **ce qui serait perdu** si elle se passait mal. Puis attendre. Si l'objet peut être
copié d'abord, le copier et éprouver la copie.

## Portée

Toute épreuve de ce projet. Elle s'ajoute au § 4.7 et ne remplace rien.
