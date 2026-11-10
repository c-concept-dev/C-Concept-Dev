# Les ressources de pdf.js suivent toute lecture, pas seulement le rendu — lot 0h, dette D24

**Inscrite au cahier de pilotage le 10 novembre 2026** (§ des dettes, D24), et prise dans l'ordre
donné par Christophe : « Puis D24, D23. »

> D24 — `couche-texte.ts` appelle `getDocument` sans les ressources pdf.js (lignes 35 et 107), là
> où `rendu-page.ts` les passe : avertissement `standardFontDataUrl` à chaque lecture de couche
> texte.

## Le symptôme, reproduit avant toute correction

Un PDF d'une page, un mot, `/Helvetica` — fabriqué par le contrôle, donc aucune œuvre. Lu par
`lireCoucheTexte`, il donne bien son mot **et** cet avertissement :

```
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
```

La cause est dans pdf.js et elle est logique. `useSystemFonts: false` est posé aux trois
`getDocument` du projet, et à dessein : on veut les polices du document, pas celles du poste.
pdf.js va donc **chercher** les quatorze polices standard que le document ne porte pas — et sans
`standardFontDataUrl` il ne sait pas où. Il n'échoue pas pour autant : `fetchStandardFontData`
intercepte l'échec, **avertit**, et rend `null`.

## Ce que la correction change — et ce qu'elle ne change pas

**C'est la moitié qui compte, et elle corrige ce que j'allais écrire.** Mon premier commentaire de
contrôle affirmait que les positions des mots en dépendaient. Mesuré, c'est faux : pdf.js porte en
dur les largeurs des polices standard, et les rend justes même quand le fichier de police lui
manque.

Sur **232 documents** de la bibliothèque réelle, lus en mémoire — rien n'a été écrit ni copié, les
œuvres n'ont pas quitté le volume —, **2** réclament une police standard :

| document | avertissements, 2 premières pages |
|---|---|
| `Cours de basse/aebersold-FRENCH.pdf` (empreinte `588ef349…`) | 4 |
| `Realbooks/The World's Greatest Jazz Fake Book.pdf` (empreinte `554acaa7…`) | 2 |

Sur ces deux documents, douze pages comparées avec et sans les adresses :

| | suites de caractères | avertissements |
|---|---|---|
| le premier, sans / avec | **957 / 957**, identiques à la décimale | 5 → **0** |
| le second, sans / avec | **443 / 443**, identiques à la décimale | 2 → **0** |

**Rien de ce qui est lu ne change.** La dette ne coûtait pas de la justesse : elle coûtait un
journal qui crie au feu là où rien ne brûle. Et un avertissement qu'on apprend à ignorer ne
protège plus rien le jour où il dit vrai — c'est à ce titre, et pas à un autre, que ce lot valait
d'être fait.

## Un piège que j'ai failli rapporter comme une mesure

La première passe sur la bibliothèque n'imprimait que le **nom** des fichiers qui avertissent, et
elle a nommé `aebersold-FRENCH.pdf` — c'est-à-dire, en apparence, la **fixture F1** du projet.
Deux mesures se contredisaient alors : F1 lue directement n'avertissait pas, F1 lue par la passe
avertissait quatre fois.

Les empreintes ont tranché : **deux fichiers différents du même nom**, `d1092737…` pour la fixture
et `588ef349…` pour celui du dossier de cours. Ce n'était pas une mesure instable, c'était un
affichage qui cachait le chemin. Ce qu'il faut en retenir : une contradiction entre deux mesures
est une information, et elle se règle en regardant ce qui a réellement été lu.

## Ce qui a bougé dans le code

`ressourcesPdfJs()` quitte `rendu-page.ts` pour un module à elle, `src/ressources-pdfjs.ts`.
Pourquoi plutôt qu'un import direct : `rendu-page.ts` charge `@napi-rs/canvas` dès son évaluation,
et une lecture de couche texte n'a pas à payer un module natif de rendu. Le lot 16b a mesuré ce que
coûte un module chargé pour rien — 656 Mo contre 1 661 Mo de pointe mémoire sur un livre de
vingt-neuf pages, pour un module qui n'était pas même exécuté.

Deux usages réels, donc, et pas une abstraction de confort : `rendu-page.ts` et `couche-texte.ts`.

## Le second `getDocument`, et pourquoi son contrôle ne prouve rien

La ligne 107 lit les **métadonnées**. Elle ne touche aucune police, et son contrôle était donc
**vert avant** la correction. Elle porte quand même les adresses — pour qu'aucune lecture de pdf.js
dans ce module ne puisse en manquer — et le contrôle qui l'accompagne **garde** cet état plutôt
qu'il ne le démontre. C'est écrit dans le fichier de contrôle, à côté de l'assertion : un contrôle
vert avant la correction n'est pas une preuve, et le laisser passer pour telle serait pire que de
ne pas l'écrire.

## Éprouvé

| faute posée | contrôle qui refuse |
|---|---|
| le `getDocument` de la couche texte sans ses ressources — **l'état d'avant** | « lit la couche texte d'un PDF en police standard sans un seul avertissement » |

La fixture étant fabriquée par le contrôle lui-même, il tourne partout : la vérité F1 n'est pas
requise, et l'intégration continue l'exécute sur les trois systèmes.

## Et dans le produit, pas seulement dans les sources

Le paquet a été refabriqué dans l'ordre imposé par le README — `pnpm build`, `preparer-moteurs.py`,
`preparer-moteur-node.py`, `tauri build`, finalisation macOS — puis **installé**, l'ancien gardé de
côté sous `/Applications/Lienotheque-avant-lot-0h-2026-11-10.app`. Signature vérifiée, moteur JIT
vivant, 178,16 Mio.

Les **deux** `getDocument` du moteur empaqueté portent `...ressourcesPdfJs()`, vérifié dans
`moteurs/chaine/moteur.js` — et il n'y en a que deux : l'appel des métadonnées n'entre pas dans le
graphe empaqueté. Les **16 fichiers** de polices standard sont bien dans l'application installée.

**La preuve qui compte** : le même document, la même charge, le même protocole, lus par les deux
paquets installés, chacun lancé comme l'hôte le lance (`LIENOTHEQUE_PDFJS`, `LIENOTHEQUE_CODECS`,
`TESSDATA_PREFIX`, `PATH`, plafond mémoire du contrat).

| paquet installé | lecture | avertissements de police |
|---|---|---|
| celui du 9 novembre, gardé de côté | `parLaCouche: 1` | **1** |
| celui du 10 novembre, lot 0h | `parLaCouche: 1` | **0** |

C'est le seul niveau où la correction compte : la file lance `moteur.js`, pas les sources.

### Une mesure que je ne peux plus rejouer ce soir, et il faut le dire

Le volume `/Volumes/Macbook`, où vit la bibliothèque réelle, a été **démonté** entre la mesure des
232 documents et cette vérification du produit ; `Carte Ext` est passée en lecture seule. La
mesure des 232 reste valable — elle a été faite volume monté, et les deux documents sont nommés
par leur empreinte, non par leur seul nom. Mais la lire *par le produit* attendra que le volume
soit revenu. C'est pourquoi la preuve ci-dessus porte sur le document fabriqué, qui a l'avantage
de n'avoir besoin d'aucun volume.
