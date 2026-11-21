# Le garde-fou des effacements juge le produit, avec sept exceptions nommées

**Décidé par Christophe le 21 novembre 2026**, sur un inventaire mesuré. Cette décision
**remplace** celle du 20 novembre 2026,
`2026-11-20-le-produit-efface-ce-que-l-utilisateur-demande.md`, qui n'est pas modifiée : une
correction s'écrit dans un document neuf.

## Ce que disait l'ancienne, et pourquoi elle ne tient plus

Ses mots, cités :

> « le produit efface ce que l'utilisateur lui demande à l'écran ; ce garde-fou ne le juge pas »

Elle excluait **tout** le code du produit du périmètre, et s'appuyait sur un chiffre :

> « Le vrai chiffre, mesuré le 20 novembre 2026 en ouvrant le périmètre dans un clone jetable :
> **deux accusations** »

**Ce chiffre était exact pour ce qu'il mesurait, et faux pour ce qu'on en concluait.** Mesuré le
21 novembre 2026 dans un clone jetable : le garde-fou tel qu'il était au commit `89f74544`, sur le
code tel qu'il était à ce commit, avec l'ouverture minimale que son texte décrit — seul le prédicat
`estDansLePerimetre` remplacé, `plagesJugees` intact — accuse **deux** sites, et ce sont exactement
`outils/cache/src/index.ts:144` et `outils/ingestion/src/texte.ts:481`. Le chiffre et les deux noms
coïncident avec ce qu'annonçait la décision du 20 novembre, ce qui rend la reproduction crédible ;
son texte ne dit pas comment l'ouverture avait été faite, donc cette identité de méthode reste une
inférence et non un fait.

Ce que la même mesure établit sans réserve : **28 fichiers Rust étaient dans le périmètre ouvert,
et aucun n'a été accusé**, parce que `plagesJugees` ne retenait d'un `src/*.rs` que ses blocs
`#[cfg(test)]`. Les quatre sites Rust du produit étaient hors de vue, et la conclusion « deux
exceptions suffisent » reposait là-dessus.

S'y ajoutaient deux défauts du garde-fou, trouvés le 21 novembre en voulant ouvrir le périmètre
pour de bon :

- **défaut B**, lot `0z quinquies` : le masque de code lisait la durée de vie anonyme `<'_>` comme
  un littéral de caractère. Dans `roulement.rs`, 21 octets blanchis emportaient la déclaration
  `#[cfg(test)] mod tests {`, donc le garde-fou **n'y jugeait rien** — 15 `remove_dir_all` jamais
  lus, et il disait vert ;
- **défaut A**, lot `0z sexies` : `liaisons` lisait le fichier entier, donc les liaisons des modules
  de contrôles acquittaient le code du produit du même fichier. `depot.rs` lie `racine` à
  `std::env::temp_dir()` dans ses tests, et cela suffisait à faire passer pour borné **le retrait
  d'une version d'une vraie bibliothèque**.

Le vrai chiffre, mesuré le 21 novembre avec le garde-fou réparé : **huit sites**, et non deux.

## Ce que cette décision établit

Le périmètre comprend désormais **le code du produit**. Une `Zone` distingue, dans un même fichier
de l'hôte, les contrôles du produit ; les effacements **et** les liaisons viennent toujours de la
même zone. La distinction `#[cfg(test)]` n'est donc plus une exception à une exclusion, elle est
une notion de plein droit — ce que le lot `0z quater` demandait de reprendre.

**Sept sites exceptés, six entrées** — `reconstruction.rs` en porte deux, de même cible —, chacune
reconnue par son **contenu**, fonction et appel, jamais par un numéro de ligne, et portant sa
raison écrite :

| site | raison, en un mot |
|---|---|
| `cache`, `vider` | l'utilisateur vide son cache à l'écran |
| `ingestion`, `lireLeTexte` | le lecteur retire son propre dossier de travail |
| `application_embarquee`, `installer_application` | la sauvegarde de l'ancienne application, après installation de la neuve |
| `application_embarquee`, `nettoyer_ancienne_disposition` | deux dossiers d'une disposition abandonnée |
| `reconstruction`, `preparer_destination` (deux sites) | retour en arrière sur sa propre création |
| `depot`, `retirer_entree` | la corbeille, sur le repli entre volumes — sous condition vérifiée |

La septième, `retirer_entree`, a été accordée après vérification d'une condition posée par
Christophe : `copier_entree` remonte **toutes** ses erreurs — sept appels faillibles, sept `?`,
aucun `let _ =` ni `.ok()` — donc l'original n'est retiré qu'après une copie réellement complète,
et un nœud qu'elle ne sait pas copier donne un `Err(Unsupported)` explicite.

## Ce qui est refusé, et c'est le cœur de cette décision

`depot.rs:461`, `remove_dir_all(self.racine.join(DERIVES).join(version))` : **pas d'exception.
C'est un défaut du produit**, renvoyé au lot `0z septies`, et son rouge est épinglé sous
`depot-rs-nom-de-version-non-valide` avec pour raison « défaut du produit, nom de version non
validé, lot 0z septies ».

`version` vient de deux données relues sur le disque — `pointeur.version` d'`actives.json`
(ligne 438) et `lu["version_cible"]` de chaque fichier de travail (ligne 452) — et **rien ne la
valide** : ni chaîne vide, ni chemin absolu, ni `..`, ni nombre de composants. Mesuré avec
`rustc 1.100.0` sur cette machine :

| `version` | ce que `remove_dir_all` reçoit |
|---|---|
| `"v1"` | `/Bibliotheque/derives/v1` |
| `""` | `/Bibliotheque/derives/` — **tout DERIVES** |
| `"/"` | `/` — **la racine du disque** |
| `"/etc"` | `/etc` |
| `".."` | `/Bibliotheque/derives/..` |

Un composant absolu **remplace** le chemin entier. Et l'appel est précédé d'un `let _ =`, qui avale
jusqu'à l'erreur.

## Ce que cette décision ne dit pas

Elle ne renie pas la raison de l'ancienne : un effacement que l'utilisateur demande à l'écran reste
légitime, et l'écran reste son juge. Elle dit que le garde-fou peut **nommer ces gestes un par un**
au lieu de s'interdire de les lire — et que le jour où l'un d'eux n'est pas ce qu'il prétend être,
comme `depot.rs:461`, c'est précisément en les lisant qu'on le découvre.

Elle ne dit pas que les sept exceptions sont acquises pour toujours : chacune porte sa raison, une
raison qui cesse d'être vraie fait tomber son exception, et un garde-fou vérifie qu'aucune
exception n'est morte.

Elle ne touche pas à la seconde limite du lot `0z bis` — les effacements d'**un seul fichier** ne
sont pas jugés —, qui n'est pas en cause ici.
