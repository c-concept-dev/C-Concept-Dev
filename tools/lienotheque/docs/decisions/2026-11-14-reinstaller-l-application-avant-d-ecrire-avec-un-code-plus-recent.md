# On réinstalle l'application avant d'écrire avec un code plus récent qu'elle

**Décision de Christophe le 14 novembre 2026**, mot pour mot :

> « Règle à inscrire : avant toute écriture réelle avec un code plus récent que l'application
> installée, on réinstalle d'abord l'application. »

## Ce qui l'a provoquée : une bibliothèque qui s'affiche vide, et un en-tête qui dit « 51 liens »

Le 12 novembre, la chaîne a écrit la **version 4** de la bibliothèque musicale depuis la copie de
travail — code du jour, lancé par le banc, jamais par l'application. Le 14 novembre, Christophe
ouvre l'application installée et rapporte :

> « La Bibliothèque musicale s'ouvre et affiche « 51 liens » (la version 4 est active). Mais quand
> je sélectionne « Jon Liebman - Bass Aerobics.pdf », le panneau Pages affiche « Aucun résultat
> dans cette bibliothèque » : je ne peux pas voir ses pages ni ses liens. »

Mesuré, sans rien corriger :

| | |
|---|---|
| paquet installé, fabriqué le | **10 novembre 2026, 17:12** |
| version 4 de Bass Aerobics, écrite le | **12 novembre 2026** |
| `EtatDoute` a reçu `relecture_non_faite` le | **12 novembre 2026, 10:33**, commit `645ec63b` |

La version 4 porte deux cas douteux, dont un `etat: "relecture_non_faite"`. Ce mot n'existait pas
quand le paquet a été fabriqué. L'énumération du contrat d'écran est `.strict()` : la **vue
entière** est refusée pour un mot inconnu. La même vue, composée par l'hôte, contre les deux
contrats :

| contrat | verdict |
|---|---|
| celui d'aujourd'hui | **accepte** (116 pages) |
| celui du paquet installé | **refuse** — `douteux[1].etat`, « Invalid option » |

La suite est mécanique et silencieuse : la lecture échoue, l'application retombe sur une **vue
vide**, l'écran n'a plus ni pages, ni liens, ni filtres — tandis que l'en-tête continue d'afficher
« 51 liens », parce qu'il compte depuis la projection des documents et non depuis la vue.

## Ce que la règle tranche

**Écrire pour de vrai avec un code plus récent que l'application installée n'est pas permis.** On
réinstalle d'abord. L'écriture n'est pas un geste de la copie de travail : ce qu'elle produit est
relu par le paquet, et un paquet plus ancien que les données qu'on lui donne n'est pas un lecteur,
c'est un refus.

C'est la **porte de l'écriture réelle** du 5 novembre à laquelle s'ajoute une condition
vérifiable : avant de la franchir, comparer la date de fabrication du paquet installé
(`/Applications/Liénothèque.app/Contents/MacOS/lienotheque-bureau`) à celle du code qui va écrire.
Le paquet plus ancien ? On réinstalle, puis on écrit.

## Ce qu'elle ne répare pas, et qui vaut un lot

La règle protège l'usage, pas le produit. Une application plus ancienne qui rencontre une donnée
plus récente reste **aveugle en silence** : elle jette la vue entière et n'en dit rien. C'est le
**lot 0x**, déclaré prioritaire par Christophe le même jour, avant l'étape 2 :

> « Une application plus ancienne ne devient jamais aveugle en silence devant des données plus
> récentes. Elle le dit clairement, ou montre l'état inconnu comme non reconnu, sans jeter la vue
> entière. Test rouge : la vue du 12/11 contre le contrat du 10/11. »

La règle d'ici est donc la consigne qui tient **jusqu'à** ce lot, et elle reste utile après : un
produit qui le dit clairement vaut mieux qu'un écran vide, mais il ne remplace pas un paquet à jour.

## Pourquoi « 51 liens » rendait le défaut difficile à voir

Deux sources comptent pour le même écran. L'en-tête lit la projection des documents ; le corps lit
la vue composée. Un refus de la vue laisse donc l'en-tête juste **au-dessus** d'un écran vide, ce
qui ressemble à une bibliothèque ouverte dont un document n'aurait rien — et non à une lecture qui
a échoué. Un seul chiffre a trahi la cause : les deux filtres d'état affichaient **0** alors que
l'un des deux aurait dû afficher 116. Deux filtres à zéro ne peuvent pas coexister avec des pages.
