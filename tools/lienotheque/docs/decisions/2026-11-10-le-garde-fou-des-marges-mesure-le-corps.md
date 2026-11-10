# Le garde-fou des marges mesure le corps, et lit le délai — dette D7

**Cadre posé par Christophe le 10 novembre 2026.** Ses mots :

> « Mesurer la durée du CORPS du contrôle (celle que borne le délai), pas celle qu'affiche le
> rapporteur ; le prouver sur les trois contrôles de `outils/ingestion` qui « dépassent » leur
> délai en passant. Lire le délai RÉEL de chaque contrôle (configuration du paquet et délai propre
> au contrôle), jamais une valeur supposée. Aucun seuil inventé : propose-moi la barre de marge,
> avec sa raison ; c'est moi qui la fixe. Le garde-fou signale, il ne rallonge jamais un délai de
> lui-même. Éprouvé par mutation. »

Puis, après la course verte du matin et sa marge de ×1,03 :

> « D7 AVANT D24 : oui. Commence par le test « compte des pages… feuille double » à ×1,03 : corps
> ou crochets ? »

## La réponse à sa question : **corps**, et à deux millisecondes près

Le contrôle `ce qu'on compte quand une page n'a rien rendu (OUT-05, OUT-15) > compte des pages, et
n'en double pas le nombre sur une feuille double` ne pose **aucun crochet** par contrôle. Mesuré
sur sa propre machine, sans toucher au fichier :

| | |
|---|---|
| corps chronométré | **2 713 ms** |
| durée affichée par le rapporteur | **2 715 ms** |
| délai, lu de vitest | **5 000 ms** |

Les deux durées sont la même à deux millisecondes. Le ×1,03 du coureur macOS est donc un vrai
×1,03 : **4 842 ms de corps pour un délai de 5 000**, et la marge la plus courte du dépôt.

## Ce que la mesure a démenti, et qui était de moi

**Les trois contrôles « au-dessus de leur délai » n'existent pas.** Les entrées 24, 25 et 26 du
registre portent un caveat : « ce rapport compare la durée du rapporteur au délai du minuteur, et
trois contrôles de `outils/ingestion` dépassent leur délai en passant ». Le délai de ces
contrôles n'est pas 5 000 : il est **300 000**, écrit dans leur fichier sur une ligne à lui
(`test/la-porte-transmet.test.ts:176` et quatre autres, `test/de-la-porte-a-la-recherche.test.ts:148`
et `:164`). Ma recherche d'un `}, 120_000);` sur une seule ligne ne pouvait pas les voir ; la sonde,
elle, lit `task.timeout` déjà résolu et les donne sans effort.

Aucun contrôle de ce dépôt ne dépasse son délai. Le caveat était faux dans son diagnostic — mais
juste dans sa défiance : les marges publiées divisaient par un **délai supposé**, et c'est
exactement le défaut que le lot 16 nomme depuis le 9 novembre.

## Ce que la mesure a confirmé, et qui donne raison au cadre

La durée du rapporteur **n'est pas** celle que le délai borne, en général :

| sonde jetable | délai | corps réel | durée affichée | verdict |
|---|---|---|---|---|
| crochet 2 000 + corps 4 000 | 5 000 | 4 000 | **6 009 ms** | **passe** |
| crochet 400 + corps 100 | 5 000 | 103 | 2 110 ms (×5) | passe |
| corps synchrone de 6 000 | 5 000 | 6 002 | 6 003 | échoue, « Test timed out in 5000ms » |

Le délai d'un contrôle ne borne que son **corps** ; les crochets ont le leur, `hookTimeout`, dix
secondes par défaut (`@vitest/runner`, `beforeEach` posé avec `withTimeout(…, hookTimeout)`). Une
marge tirée de la durée affichée aurait donc crié au feu sur le deuxième cas — ×2,37 annoncés pour
un vrai ×48 — et c'est bien le cas de trente fichiers de contrôles sur cent quatre-vingt-quatorze,
ceux qui posent un `beforeEach`.

Et un corps qui bloque la boucle d'événements **n'échappe pas** au délai : l'hypothèse était
tentante, la mesure la refuse.

## L'instrument : un coureur, et non un rapporteur

Un rapporteur vitest tourne dans le processus principal, où les événements de crochets arrivent
par paquets. Chronométré de là, le crochet de 2 000 ms est rapporté à **3 902 ms**, et le corps
devient **négatif**. Mesuré, puis abandonné.

`packages/banc/src/coureur-des-marges.ts` est donc un **coureur** : il tourne là où le corps
tourne. Il remplace `runTask`, la branche que vitest emploie sans lui — `getFn(test)` puis
`await fn()` —, et l'entoure d'un chronomètre. Le délai est posé **dans** cette fonction au moment
de la collecte, donc l'entourer ne le retire pas : éprouvé, et c'est le contrôle le plus important
du lot. Il écrit une ligne par contrôle dans `.rapport-marges.jsonl`, au fil de l'eau — un ouvrier
abandonné n'écrit jamais sa fin de passage, et c'est quand les corps sont longs que cela arrive.

Chaque paquet le charge par son `vitest.config.ts`, qui ne porte rien d'autre que
`packages/banc/configuration-commune.ts`. **Dix-sept fichiers de deux lignes**, et c'est voulu :
ni `--runner` ni `--setupFiles` ni `--include` n'existent en ligne de commande — mesuré, vitest
refuse l'option —, et un paquet qui ne reprend pas la configuration commune **fait refuser le
passage** en se nommant. Sans cela, un paquet neuf resterait non mesuré en silence, et le garde-fou
dirait « marges saines » sur ce qu'il n'a pas regardé. Les délais, eux, restent chez chaque paquet :
`outils/recettes` et `outils/optimiseur` en posent de 3 600 000 pour de bonnes raisons, écrites
chez eux.

## Ce que l'instrument a cassé en se posant, et le garde-fou que cela donne

Le premier contrôle complet avec l'instrument a été **refusé : 314 contrôles rouges**, tous
d'`apps/app`, tous sur `ReferenceError: document is not defined`.

La cause est entière dans mon geste. `apps/app` n'avait pas de `vitest.config.ts` — il porte sa
configuration de contrôles dans son **`vite.config.ts`**, avec jsdom, son greffon React, ses
greffons de données et son fichier de préparation. Vitest ne lit pas les deux : le
`vitest.config.ts` que j'y ai ajouté a **masqué** l'autre, et l'application a tout perdu d'un coup.

Corrigé en fusionnant la configuration commune **dans** `apps/app/vite.config.ts` : un paquet n'a
qu'une configuration, là où elle vit déjà.

Et un garde-fou neuf, dans `packages/banc/test/architecture.test.ts` : **aucun paquet ne porte deux
configurations de contrôles**. Il nomme le paquet fautif en une seconde, là où le contrôle complet
a mis quatorze minutes pour dire la même chose par trois cent quatorze rouges. Éprouvé par
mutation : le second fichier remis, le garde-fou nomme `apps/app` ; retiré, il repasse.

Ce qui est rassurant, et qu'il faut dire : **rien n'est passé**. Le garde-fou des épingles a refusé
le passage, comme il doit.

## La barre : proposée à ×3, **non fixée**

`fixtures/references/marges-de-delai.json` porte `"barre": null`. Tant qu'elle y est, le garde-fou
**publie et ne refuse rien** : le chiffre appartient à Christophe, et un seuil inventé ici serait
la faute même que ce lot combat. Poser un nombre à la place de `null` suffit à allumer le refus,
sans toucher au code.

La proposition est **×3**, et un seul facteur suffit à la justifier — mesuré sur **le même corps
de contrôle**, celui du ×1,03 :

| | corps mesuré | variation |
|---|---|---|
| coureur macOS, deux courses du 10 novembre | 3 620 puis **4 842 ms** | ×1,34 |
| machine de Christophe, deux passages du jour | 2 517 puis **2 486 ms** | ×1,01 |

Le pire rapport est **4 842 / 2 486 = ×1,95**, et il comprend **déjà** la variation du coureur. On
arrondit à 3 — la moitié de marge au-dessus du pire rapport observé — plutôt qu'à 2,5 : une fausse
alerte coûte une ligne à lire, un manque coûte un rouge que personne n'a vu venir.

> **Correction du même jour.** La première version de cette décision proposait ×3 en multipliant
> ×1,76 par ×1,34. Le ×1,76 venait lui-même d'une comparaison coureur contre machine locale : il
> comptait **déjà** la variation, et le produit la comptait deux fois. Le chiffre proposé ne change
> pas ; sa raison, si. Un seuil juste pour une mauvaise raison reste un seuil qu'on ne peut pas
> défendre.

## Ce que la barre coûterait, et pourquoi le garde-fou publie avant de refuser

| | ce qu'une barre de ×3 refuserait | ce qu'une barre de ×2 refuserait |
|---|---|---|
| machine de Christophe | **1** contrôle, le ×2,01 | aucun |
| coureur macOS | une poignée : le ×1,03, et la famille de `voie-oracle.test.ts` qui tourne autour de ×2 | le ×1,03 |

Autrement dit : une barre de ×3 **arrêterait la course** jusqu'à ce que le lot 14 — la lenteur de
la voie oracle, l'autre moitié de D7 — ait abouti. C'est précisément ce qu'il faut savoir **avant**
de poser le chiffre, et c'est pourquoi le garde-fou publie d'abord. Un garde-fou qu'on allume sans
savoir ce qu'il arrête est un garde-fou qu'on désarme la semaine suivante.

## Ce qu'il ne fera jamais

**Allonger un délai.** Une marge trop courte se corrige en rendant le corps plus court — ou en
reconnaissant que ce contrôle lit vraiment beaucoup, et en le disant. Allonger le délai cacherait
la lenteur au lieu de la nommer, ce que le § 8 du cahier interdit. La phrase que le garde-fou écrit
le dit à sa place : « Rendez le corps plus court ; n'allongez pas le délai. »

## Éprouvé par mutation

Sept fautes posées une à une dans le code, chacune devant faire tomber un contrôle nommé — et
toutes les sept l'ont fait :

| faute posée | contrôle qui refuse |
|---|---|
| joindre les niveaux par « > » au lieu d'une espace | « par une espace et non « > » » |
| supposer 5 000 quand le délai n'est pas résolu | « on ne lui en suppose pas un » |
| ne pas arrondir le corps | « arrondit le corps » |
| remonter au-delà du fichier en cherchant les suites | « s'arrête au fichier » |
| diviser le corps par le délai au lieu de l'inverse | « le délai divisé par le corps » |
| refuser alors que la barre n'est pas fixée | « tant que la barre n'est pas fixée » |
| juger contre 0 au lieu de la barre proposée | « contre la barre proposée » |

Et l'instrument lui-même est éprouvé **par l'exécution** : un vrai passage vitest sur cinq
contrôles dont le découpage est décidé d'avance, dans un dossier temporaire qui ne mêle pas son
relevé à celui du passage en cours.

## Une chose de plus, trouvée en chemin

Mon propre test « un autre contrôle tourne-t-il ? » comptait **mes interpréteurs** : il cherchait
le mot `vitest` dans une ligne de commande, et mes propres coquilles de shell le portaient. Il a
annoncé deux passages en cours quand il n'y en avait aucun. Le critère juste est un processus
**`node`** dont la ligne de commande porte `vitest` — et c'est lui qui est employé depuis.
