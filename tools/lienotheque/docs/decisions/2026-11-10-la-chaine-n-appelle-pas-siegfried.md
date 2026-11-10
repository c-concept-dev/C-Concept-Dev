# La chaîne n'appelle pas Siegfried — prouvé par l'exécution

**Demandé par Christophe le 10 novembre 2026** : « Siegfried : prouve PAR L'EXÉCUTION si la chaîne
l'appelle (faire identifier un vrai fichier par l'application installée et observer si `sf` est
lancé). Rapporte, sans corriger. »

Rapport, sans correction. La dette **D21** du cahier demandait exactement cela : la prouver par
l'exécution, « et non par une recherche de texte ».

## Comment la question a été posée aux octets

Le **programme livré** a travaillé : le `node` du paquet installé exécutant
`/Applications/Liénothèque.app/Contents/Resources/moteurs/chaine/moteur.js`, sur un vrai PDF de
500 pages, trois pages demandées.

Entre la chaîne et Siegfried, un **faux `sf`** a été placé en tête du `PATH`. Il journalise son
appel avec ses arguments, puis **délègue au vrai** : le résultat du traitement n'en est donc pas
changé, et son interposition a été vérifiée d'abord (`sf -sig … -version` répond
`siegfried 1.11.9`, et le journal porte la ligne).

Un essai de ce genre ne vaut que si la chaîne a **vraiment** travaillé : un document mort à la
porte n'appellerait rien, et l'absence d'appel ne prouverait rien. Les traces de la chaîne sont
donc écrites au fil de l'eau, et elles le montrent.

## Ce que la chaîne a fait

| Message | |
|---|---|
| `salutation` | `node 24.11.1` |
| `journal` | 13 messages |
| `progression` | 1 — c'est-à-dire **cent pour cent** |
| `resultat` | une vue assemblée, 3 pages comptées |

Ses propres mots, dans l'ordre : « Lecture du document », « lecture du texte », « texte lu :
3 passage(s) », « 3 pages dans le document », « repères lus : 0 page(s), 0 élément(s) », « vue
assemblée », « 3 passage(s), tirés de 3 page(s) : **3 par la couche texte**, 0 par reconnaissance,
0 sans texte ».

Le document a donc été lu de bout en bout, par sa couche texte.

## Le résultat

**Aucun appel à `sf`. Zéro ligne au journal.**

Ce n'est plus une recherche de texte dans un fichier : c'est le programme qui tourne, qui lit un
vrai document jusqu'au bout, et qui n'invoque jamais Siegfried. Cela confirme ce que la recherche
de texte disait du programme livré — aucune occurrence de `"sf"`, `"-sig"` ni `"-json"` dans
`moteur.js` — mais par la voie que D21 exigeait.

**Ce que cela ne dit pas** : que le code source ne saurait pas l'appeler. `outils/formats` porte
`parSiegfried`, `siegfriedDisponible` et `moteursEmbarques`, et ils fonctionnent — ils sont éprouvés
par leurs propres contrôles. Ce qui est mesuré ici, c'est que le **graphe empaqueté** depuis
`outils/ingestion/src/moteur.ts` ne les atteint pas. Embarquer `sf` met donc le paquet en accord
avec la règle 3.6 et rend l'outil disponible ; brancher la chaîne dessus est un autre lot, et il
devra prouver l'appel, pas la présence.

## Et un défaut du paquet livré, trouvé en chemin

> **Corrigé le 10 novembre 2026, le jour même : cette section accusait le produit à tort.**
>
> Les deux symptômes décrits ci-dessous venaient de **mon montage d'essai**, et non du paquet :
>
> 1. « rendu complet impossible » — mon prouveur ne posait pas `LIENOTHEQUE_PDFJS`. L'hôte le
>    pose (`apps/app/src-tauri/src/moteur.rs:165`, à côté de `LIENOTHEQUE_CODECS`), et un contrôle
>    Rust le vérifie : `le_moteur_recoit_les_ressources_pdfjs_embarquees`, dont l'assertion dit
>    « les images JPX ne doivent pas dépendre de `node_modules` ». `ressourcesPdfJs()` a deux
>    voies : celle du paquet lit cette variable, et celle qui résout `pdfjs-dist` sur le disque
>    n'est qu'un repli pour le développement sous pnpm. Le symptôme a disparu dès que la variable
>    a été posée.
> 2. « images de pages : 0 écrite(s) » — les images ne sont produites que si la charge en demande
>    (`lot.images !== undefined`, `outils/ingestion/src/lot.ts:316`). Ma charge omettait le champ
>    `images`. L'hôte en demande toujours.
>
> **Mesuré ensuite, dans l'environnement exact de l'hôte et avec le champ `images` :** la chaîne
> du paquet installé écrit **500 images de pages et 500 vignettes, 7,8 Mo**. Le repli de rendu
> fonctionne dans le produit.
>
> Ce qui subsiste de cette section est **un seul point, petit** : l'avertissement
> `standardFontDataUrl`, présent dans les trois essais et indépendant du montage — `couche-texte.ts`
> appelle `getDocument` sans `ressourcesPdfJs()` aux lignes 35 et 107, là où `rendu-page.ts` les
> passe. C'est la dette **D24**.
>
> **Ce que la preuve Siegfried garde intact** : zéro appel à `sf`, dans les **trois** essais, sur
> un document lu de bout en bout par sa couche texte. Elle ne dépendait d'aucune de ces variables.
>
> **La leçon, et elle est à moi** : j'avais noté qu'« une mesure qui accuse mérite la même défiance
> qu'une qui rassure ». Je l'ai appliquée aux mesures qui rassurent, et oubliée sur celle-ci. Un
> essai qui ne reproduit pas l'environnement de l'hôte n'éprouve pas l'hôte — il éprouve l'essai.
> Le cahier de pilotage 25.7 a rouvert l'étape 0 sur cette erreur ; la 25.8 l'a refermée.

### Ce que l'essai disait, et que la correction ci-dessus annule en partie


L'essai a fait parler la chaîne, et elle a dit ceci **trois fois, une par page** :

> `Page 1 : rendu complet impossible (Cannot find module 'pdfjs-dist/legacy/build/pdf.mjs' Require
> stack: - /Applications/Liénothèque.app/Contents/Resources/moteurs/chaine/moteur.js)`

Vérifié sur le paquet : `chaine/` porte `pdf.worker.mjs`, `pdfjs/standard_fonts`, `pdfjs/wasm`,
`codecs/` et `node_modules/@napi-rs` — mais **aucun `pdfjs-dist` résoluble**. `embarquer_pdfjs` ne
copie que les *ressources chargées dynamiquement* par pdf.js (JPX et polices standard), pas le
module lui-même ; et l'empaquetage par esbuild n'externalise que `node:*` et `@napi-rs/canvas`, donc
ce `require` est resté dynamique et n'a pas été inclus.

Or le commentaire de `preparer-moteur-node.py` dit exactement l'inverse de ce qui se passe : « Le
repli de rendu complet est précisément destiné aux PDF que les codecs WebAssembly ne savent pas
décoder. Il doit donc voyager dans le paquet réel, **sans dépendre du `node_modules`**. » La mesure
dit qu'il en dépend, et qu'il n'y est pas.

Conséquences observées, pas supposées : « **images de pages : 0 écrite(s)** » sur les trois pages.
Un second avertissement de la même famille accompagne le premier :
`UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided` — les polices
**sont** dans le paquet, mais la chaîne ne passe pas le paramètre qui les désigne.

**À la décharge de la conception** : cela n'échoue pas en silence. La chaîne le dit, page par page,
dans son journal — c'est ce que la règle 3.1 exige. Mais le repli de rendu, celui qui doit servir
aux PDF que les codecs ne savent pas décoder, **ne sert pas dans le produit installé**, et le mode
manuel de l'étape 4 aura besoin des images de pages.

Entré dans la file des lots. **Non corrigé** : Christophe a demandé un rapport.
