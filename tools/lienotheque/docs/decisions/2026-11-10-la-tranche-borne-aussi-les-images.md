# L'option de tranche borne aussi l'export des images — lot 0i

**Tranché par Christophe le 10 novembre 2026.** Ses mots :

> « Lot 0i : l'option « pages » borne AUSSI l'export des images (et des vignettes) ; pour un
> document traité en entier, rien ne change. Test rouge d'abord. »

## Ce qui était mesuré

Le 10 novembre, en éprouvant la chaîne du paquet installé, une charge qui demandait **trois** pages
d'un document de cinq cents en faisait exporter **cinq cents images et cinq cents vignettes,
7,8 Mo** — et c'est ce qui faisait dépasser le délai de tous mes essais. La lecture du texte, elle,
s'arrêtait bien à trois.

## Pourquoi, et pourquoi c'était petit

`exporterPages` sait se borner **depuis l'origine** : il porte `pages` et `depuis`, et il en fait
une tranche numérotée dans le repère du document entier — « une page exportée seule doit porter le
même numéro que si tout le document l'avait été, sans quoi deux tranches se recouvrent »
(`outils/ingestion/src/pages-images.ts:200`).

C'est **l'appel** qui ne les lui passait pas. `instantaneDeLot` transmettait `lot.pages` à la
lecture du texte (`lot.ts:235`) et à l'oracle (`:253`, `:275`), et l'oubliait au seul endroit où
l'oubli coûte des mégaoctets. Deux lignes.

## Ce qui ne change pas, et c'est la moitié qui compte

**Sans `pages`, rien n'est borné.** Un document traité en entier — le cas des 250 documents de la
bibliothèque musicale et des 245 de Studio Clinique — sort exactement comme avant. Une borne par
défaut les amputerait du jour au lendemain, et personne ne le verrait avant la recherche. Un
contrôle le tient : « ne borne rien quand rien n'est demandé : un document traité en entier l'est
toujours ».

## Les deux moitiés de la chaîne, et pourquoi les deux

| moitié | ce qu'elle tient | où |
|---|---|---|
| haute | la charge transmet la borne à l'export | `test/lot-resilient.test.ts` |
| basse | l'export ne rend que la tranche demandée, numérotée dans le document | `test/pages-images-vide.test.ts` |

La moitié basse avait des contrôles, mais **sur le corpus réel** — donc **sautés** partout où les
œuvres ne sont pas, l'intégration continue comprise. Trois contrôles la tiennent maintenant sans
aucune œuvre : le document est fabriqué sur place et le second lecteur est doublé.

## Éprouvé par mutation

| faute posée | contrôle qui refuse |
|---|---|
| retirer les deux lignes | « trois pages demandées » |
| ne garder que `pages`, sans `depuis` | « le rang de la première » |
| borner par défaut à dix pages | « ne borne rien quand rien n'est demandé » |
| retirer la borne de `exporterPages` lui-même | « trois pages sur dix » |
