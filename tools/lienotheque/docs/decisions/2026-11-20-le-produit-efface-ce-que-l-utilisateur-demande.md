# Le produit efface ce que l'utilisateur lui demande, et le garde-fou ne le juge pas

**Décidé par Christophe le 20 novembre 2026**, ses mots :

> « le produit efface ce que l'utilisateur lui demande à l'écran ; ce garde-fou ne le juge pas »

## Ce que cela borne

Le garde-fou du lot `0z bis` — `packages/banc/src/effacements-bornes.ts` — exige que tout
effacement récursif vise un chemin du dossier temporaire. Son périmètre est **les contrôles, les
exemples et les scripts**. Le code du produit en est dehors : `supprimerBibliotheque`, le retrait
d'une version dans `depot.rs`, l'éviction du plus ancien dans `outils/cache`, la reconstruction
d'une photographie. Ces gestes sont demandés par quelqu'un, et c'est l'écran qui les confirme.

**Une exception à cette exclusion, et elle compte** : les contrôles de Rust vivent **dans** les
fichiers du produit, en `#[cfg(test)]`. Ce sont des contrôles, donc ils sont jugés — mais seulement
eux, pas le code qui les entoure. Sans cette distinction, les 119 `remove_dir_all` de l'hôte
seraient tous jugés ou tous ignorés : deux façons de ne rien mesurer.

## Pourquoi cette frontière plutôt qu'une autre

**Parce que Christophe l'a décidé, et non parce que le chiffre l'imposerait.** Ce point mérite d'être
écrit sans l'arranger : j'avais avancé, pour justifier cette frontière, qu'ouvrir le périmètre au
produit porterait le relevé « de 0 à 86 accusations ». **C'était faux.** Ce 86 venait d'un relevé
antérieur où le périmètre *et* les chemins des exceptions étaient tous deux défaillants — deux
défauts additionnés, pris pour une mesure.

Le vrai chiffre, mesuré le 20 novembre 2026 en ouvrant le périmètre dans un clone jetable :
**deux accusations**, et les voici.

| | |
|---|---|
| `outils/cache/src/index.ts:144` | `vider()` retire les fichiers du cache, qui est là pour être vidé |
| `outils/ingestion/src/texte.ts:481` | le lecteur retire son dossier de travail quand il a fini |

Deux, pas quatre-vingt-six. L'argument « il deviendrait un accusateur de masse » **ne tient donc pas
sur l'état d'aujourd'hui**, et il ne faut pas s'en servir. Ce qui tient est la raison de Christophe :
ces gestes sont demandés, l'écran les confirme, et ce garde-fou n'en est pas le juge. Le reste — que
le compte grandirait avec le produit — est une prévision, pas une mesure.

La mutation `M2` de la campagne du lot éprouve cette frontière dans les deux sens : ouvrir le
périmètre tue le relevé **et** le contrôle qui dit que le produit en est dehors.

## Ce que cette décision ne dit pas

Elle ne dit pas que le produit a raison d'effacer ce qu'il efface. Elle dit que **ce garde-fou-là**
n'est pas le juge de cette question. Le juge, pour le produit, est l'écran qui demande confirmation
et les contrôles qui éprouvent chaque commande de l'hôte — `retirer.rs`, `retrait.rs`,
`reconstruction.rs` en portent.

## La seconde limite, inscrite avec celle-ci

Les effacements d'**un seul fichier** ne sont pas jugés non plus : `rmSync(join(dossier,
"un.json"))` retire un fichier, `rmSync(dossier, { recursive: true })` emporte un arbre. Les
confondre ajouterait une centaine de sites anodins. Ce que cela laisse dehors est nommé dans
l'en-tête du module plutôt que tu : `controle-epingles.ts` retire ses deux rapports,
`engendrer-migrations-d1.ts` retire une migration suivie par git — visible au diff avant le commit.

Et un partage, qui n'est pas une limite : **les scripts de coquille restent au crochet**
`refuser-gestes-destructeurs.sh`, qui lit les commandes. Ce module lit le code. Ensemble, ils
couvrent les deux façons d'effacer — et c'est précisément la faille du 18 novembre 2026, où
l'effacement n'est pas passé *malgré* le crochet mais **à côté** : ce n'était pas une commande,
c'était un test.
