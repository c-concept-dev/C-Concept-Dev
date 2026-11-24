# Une fonction d'effacement arrive avec son appelant, son exception et sa décision

**Décidé par Christophe le 24 novembre 2026**, sur un inventaire mesuré. Cette décision **corrige
une raison** portée par deux décisions antérieures, qui **ne sont pas modifiées** — une correction
s'écrit dans un document neuf :

- `2026-11-20-le-produit-efface-ce-que-l-utilisateur-demande.md` ;
- `2026-11-21-le-garde-fou-des-effacements-juge-le-produit.md`.

Elle ne touche à rien d'autre chez elles. La frontière posée le 21 novembre tient, et les six
autres exceptions aussi.

## La raison qui était écrite

Elle paraissait à trois endroits, dans ces mots.

Le 20 novembre, dans le corps de la décision, parmi les gestes du produit tenus pour légitimes :

> « l'éviction du plus ancien dans `outils/cache` »

et, dans son tableau des deux accusations :

> « `vider()` retire les fichiers du cache, qui est là pour être vidé »

Le 21 novembre, dans le tableau des sept exceptions :

> « `cache`, `vider` — l'utilisateur vide son cache à l'écran »

Et dans le code, en toutes lettres, à `packages/banc/src/effacements-bornes.ts` :

> « C'est l'utilisateur qui vide son cache, à l'écran, et le cache est fait pour être vidé.
> L'écran confirme ; ce garde-fou n'en est pas le juge. »

## La mesure, le 24 novembre 2026

Sur **tous** les fichiers suivis par git, et sur le moteur livré.

| ce qui était affirmé | ce qui est mesuré |
|---|---|
| l'utilisateur vide son cache **à l'écran** | `vider()` n'a **aucun appelant**. Son seul appel était son propre contrôle. Aucun écran : `apps/app/src/` ne nomme le cache que dans quatre commentaires sans rapport. Aucune commande de l'hôte, et le mot n'existe dans aucune source Rust |
| `vider()` retire **les fichiers** du cache | elle retire **le dossier lui-même** — `rmSync(chemin, { recursive: true, force: true })` — puis le recrée. Et elle ne vérifie rien : ni que le chemin est sous le cache, ni qu'il n'est pas une racine |
| le geste est **demandé par quelqu'un** | le moteur livré `apps/app/src-tauri/moteurs/chaine/moteur.js` ne l'**embarque même pas** : rien ne l'appelant, le constructeur ne l'emporte pas. Ses seize occurrences de « vider » sont la file d'attente de `outils/vision/src/relecture.ts` et des identifiants `divider` |

L'exposition était donc **nulle** — et c'est bien pour cela que le défaut est une raison écrite, non
un danger. Mais une exception qui s'appuie sur un geste d'utilisateur inexistant couvre ce que
personne n'a mesuré, et le jour où quelqu'un branche la fonction, l'exception est déjà là pour
l'accueillir sans que rien ne soit décidé.

## La règle

> **Aucun effacement récursif sans appelant dans le produit ne reçoit d'exception ; une fonction
> d'effacement arrive avec son appelant, son exception et sa décision.**

C'est l'application directe de ce que la décision du 21 novembre annonçait déjà : « une raison qui
cesse d'être vraie fait tomber son exception ». Ici la raison n'avait jamais été vraie.

## Ce qui est fait

- **`vider()` est supprimée** de `outils/cache/src/index.ts`, et son contrôle avec elle. Une
  fonction sans appelant ne se garde pas en attendant un appelant : elle se réécrira le jour où un
  écran la demandera, avec son exception et sa décision.
- **Son exception est retirée** du garde-fou. Le produit ne porte plus que **sept sites exceptés,
  six entrées** — `reconstruction.rs` en porte deux, de même cible.
- **Le commentaire du garde-fou est remis d'accord avec la mesure** : il dit maintenant ce qui a
  été retiré, quand, et pourquoi.
- **L'en-tête du module du cache est remis d'accord avec la mesure** lui aussi. Il annonçait un
  plafond et des images intermédiaires « à jeter tout de suite » ; il dit désormais que `nettoyer`
  n'a pas d'appelant, que le plafond n'est donc appliqué par personne, et que plus rien ne vide un
  coin. Une intention, pas un comportement — et le lot `0z undecies`, dette **D33**, tranchera.
- **Un contrôle neuf** garde le compte : `le produit ne porte plus que six exceptions nommées, et
  aucune ne couvre le cache (lot 0z octies)`. Il nomme les six, par fichier et par fonction. Il
  n'est pas le doublon de son voisin : le voisin rougit quand un effacement du produit **n'a pas**
  d'exception, celui-ci rougit quand une exception **paraît** sans avoir été décidée. Aucune
  mutation de l'un ne tue l'autre.
- **Une mutation l'éprouve** : remettre `vider()` sans son exception. Le garde-fou l'accuse, et
  nomme le site — `"outils/cache/src/index.ts:149 rmSync(chemin)"`. Restauration par copie,
  empreinte sha256 vérifiée identique, rejeu vert, dans un bac jetable posé par `TMPDIR` et retiré
  dans la même commande.

## Ce que cette décision ne dit pas

**`nettoyer()` et `peser()` restent**, sur le mot de Christophe : elles n'effacent pas
récursivement — `nettoyer` retire des fichiers un par un, `peser` ne retire rien — et elles
serviront au lot du cache, qui doit décider qui applique le plafond et quand. Leur absence
d'appelant est inscrite comme telle, dette **D33**.

Elle ne renie pas la raison des deux décisions qu'elle corrige : un effacement que l'utilisateur
demande à l'écran reste légitime, et l'écran reste son juge. Elle dit qu'une exception doit
**nommer** cet écran, et qu'une exception qui n'en a pas à nommer n'en est pas une.

Elle ne touche pas à la seconde limite du lot `0z bis` — les effacements d'**un seul fichier** ne
sont pas jugés.
