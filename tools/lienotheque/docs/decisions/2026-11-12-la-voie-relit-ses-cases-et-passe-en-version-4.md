# La voie relit les cases qu'elle n'a pas su lire, et passe en version 4 — étape 1, couche 3

**Plan validé par Christophe le 12 novembre 2026** : « test rouge d'abord, les deux types,
`tablesRelues` et `relectureDesCases` réécrits à la main contre le code actuel, `VERSION_DE_LA_VOIE`
3 → 4 inscrite, les quatre lignes de commentaire d'`associateur.ts`. Avant toute écriture réelle :
Bass Aerobics à blanc avec la version 4, 48 liens identiques un par un. Appels Vision tracés, coût
rapporté. »

## Le défaut que cette couche répare

Relevé le 6 novembre 2026 : `relireLesZones` et `relecteurSurPlace` étaient construits, éprouvés,
mesurés par un programme autonome — et **appelés par rien**. Le port existait, personne ne le
branchait. Un port construit mais débranché est pire qu'un port absent : il donne l'apparence
d'une capacité, et la mesure qui l'emploie rend « rien rattrapé », ce qui ressemble exactement à
« rien à rattraper ». **C'est le trou qui ressemble au succès.**

## Le contrôle rouge, et il l'était vraiment

`test/la-chaine-relit-les-cases.test.ts` est entré **avant** le code, et il a refusé le code
d'alors, au typage :

```
test/la-chaine-relit-les-cases.test.ts(120,18): error TS2339: Property 'relectureDesCases' does not exist on type 'RejeuParOracle'.
test/la-chaine-relit-les-cases.test.ts(125,18): error TS2339: Property 'relectureDesCases' does not exist on type 'RejeuParOracle'.
```

Puis, le code écrit : **5 contrôles sur 5**, en 2,6 s. Ils tiennent quatre choses distinctes — que
la voie demande la relecture de la case en défaut **et d'elle seule** (un appel, page 1), qu'elle
n'en demande **aucune** sur une table complète, que la valeur relue **sert à publier**, et qu'une
**panne** se compte au lieu de se taire.

## Ce qui a bougé dans le code, et en un seul endroit

`tablesRelues()` remplace les deux `lireLaTable` dispersés de `voie-oracle.ts`. Les deux voies qui
corroborent par la table en faisaient chacune un ; relire d'un côté seulement aurait fait publier
deux chemins différemment sur le même document. Un seul endroit, donc rien à tenir d'accord.

`sansLien` devient asynchrone, parce qu'elle relit. Ses **quatre** appelants rendent déjà sa valeur
depuis une fonction asynchrone (`return sansLien(…)` dans `rejouerParOracle`) : aucun n'a changé.

**Les pannes se comptent à part des abstentions**, et c'est la raison d'être du relevé : un étage
injoignable rendrait « rien rattrapé ». Le relecteur reçu est enveloppé — une coupure est comptée
et ne se propage pas, pour qu'un document de cent pages ne s'arrête pas sur une case.

**Sans relecteur, les cases en défaut sont nommées plutôt qu'ignorées.** `relireLesZones` ne laisse
alors aucune trace — il rend le compte et ne fait rien d'autre —, donc les nommer depuis les traces
les aurait toutes perdues précisément dans le cas où il n'y a personne au bout : celui qu'il faut
le plus dire. Elles passent par `zonesEnDefaut`, avec `pourquoi: "aucun relecteur branché sur
cette voie"`.

## La version monte à 4, et c'est ce qui périme les acquis

La règle écrite dans le fichier dit quand la version monte : dès que change **ce qui propose les
endroits, ce qui les juge, ou ce qui les lit**. Ici c'est **ce qui lit**. Un document déjà vu peut
désormais publier des liens que sa première lecture laissait à vérifier ; garder l'acquis de
l'ancienne voie reviendrait à lui refuser cette relecture pour la seule raison qu'on l'a déjà lu
sans elle.

Un double de `lot-resilient.test.ts` écrivait `version: 3` à la main. Il lit maintenant
`VERSION_DE_LA_VOIE` : c'est l'idiome du dépôt — la liste se lit dans le code plutôt qu'elle ne
s'écrit à côté, sans quoi elle vieillit en silence.

## La mesure demandée : un document réel rejoué à blanc, contre sa version publiée

`outils/ingestion/mesures/a2-un-document-a-blanc-contre-sa-version.ts`. **Rien n'a été écrit dans
la bibliothèque** : ni images, ni cache, ni médias, ni version — le seul fichier produit est hors
d'elle. La version publiée comparée est `07451d43-2aeb-4734-b819-1ccf8a983b4b`.

Relancée telle quelle, depuis `outils/ingestion` :

```
tsx mesures/a2-un-document-a-blanc-contre-sa-version.ts \
  "<le document>" "<son dossier de médias>" \
  "/Volumes/Macbook Pro/Bibliotheque Musique/base/bibliotheque.json" \
  "/Volumes/Macbook Pro/Bibliotheque Musique/base/versions/07451d43-2aeb-4734-b819-1ccf8a983b4b.json" \
  "<le préfixe des noms de la version publiée>" "<la sortie, hors de la bibliothèque>"
```

Le nom du document passe par la ligne de commande, jamais écrit dans le fichier : c'est la
convention du dossier, et ce qui tient ce banc du bon côté de CLA-01.

**Le document lu est bien celui de la version publiée, prouvé par le contenu et non par le
chemin** : les **52** empreintes des enregistrements du disque et les **52** de la version se
recouvrent exactement, aucune d'un côté seulement. Le document porte **116** pages, comme elle.

**Le prélude reproduit celui de la chaîne, et ce n'est pas une affirmation.** Le banc refait ce que
`lot.ts` fait — même `lireLeTexte`, mêmes options passées à la voie — puis compare sa lecture à
celle que la version publiée porte :

| | pages par la couche | par l'OCR | sans texte |
|---|---|---|---|
| version publiée | 0 | 113 | 3 |
| ce rejeu | **0** | **113** | **3** |

**Le relecteur branché ne lit rien et ne coûte rien** : il enregistre la demande et rend
`undefined`. C'est exactement ce que fait son absence pour ce qui est publié — aucune valeur n'est
injectée — mais cela laisse la **trace** de chaque case qu'un vrai étage aurait reçue. Un
dénombrement sans dépense.

### Les 48 liens, un par un : zéro écart

| comparé | champs | écarts |
|---|---|---|
| les 48 liens | `numero`, `pageImprimee`, `piste`, `disque`, `sourcePiste`, `confiance` | **0** |
| les 48 appariements | le lien + `media.piste`, `media.nom`, `media.empreinte`, `segment`, `statut` | **0** |
| les 116 pages | `feuille`, `rang`, `pageImprimee`, `statut`, `elements` | **0** |
| les orphelins | la liste entière | **0** — `[12, 17, 20, 22]` des deux côtés |
| les manquants | la liste entière | **0** |

Le nom d'un enregistrement est une **entrée** : le banc reproduit celui que la version publiée
porte, sinon comparer les noms ne comparerait que deux arborescences de disque.

Durées : **686,6 s** de lecture du texte, **373,7 s** de parcours de la voie. Secteur, batterie
100 %, `sleep` à 0 — la machine ne s'est pas endormie en route, et c'est une précaution qui a déjà
servi.

### Les appels que la relecture demanderait, et ce qu'ils coûteraient

**71 demandes tracées**, 0 rendue (le traceur ne lit rien), **0 panne**.

| page du document | demandes |
|---|---|
| 4 | 5 |
| **5** | **20** |
| 68 | 18 |
| 95 | 20 |
| 101 | 8 |

| cause nommée par la table | demandes |
|---|---|
| cellule non lue | 54 |
| cellule suspecte : rompt la montée de la colonne | 7 |
| cellule suspecte : très loin du reste de la colonne | 10 |

**La page 5 est celle qui publie.** Le journal du rejeu le dit — « table globale page 5 : 48
proposition(s) nommée(s) recoupée(s) exactement et publiable(s) » — et les sources des liens le
confirment : **44** par `corroboration_table`, **4** par `corroboration_recurrente`. C'est donc sur
**ses 20 cases** que se joue le passage de 48 à 52, et non sur les 71.

**Coût, borne haute.** Le seul tarif mesuré de ce projet est celui du 5 novembre 2026
(`docs/journal-appels-en-ligne.jsonl`, `claude-haiku-4-5`, 1 $ le million en entrée, 5 $ en
sortie) : un appel d'une feuille a coûté **0,003085 $** pour 2 575 jetons d'entrée et 102 de
sortie, en 2 193 ms.

| si l'on relisait | appels | coût, borne haute | durée, appels en série |
|---|---|---|---|
| les 71 cases | 71 | **≈ 0,22 $** | ≈ 2 min 36 |
| la seule page qui publie | 20 | **≈ 0,06 $** | ≈ 44 s |

**C'est une borne haute, et le mot compte** : l'appel mesuré portait une **feuille entière**, là où
une case fait de l'ordre de 90 × 30 dans les unités des mots. Le coût réel sera une fraction de
ces chiffres, mais la fraction n'est pas mesurée et n'est donc pas écrite ici.

## Ce qui n'est PAS fait, et aucune case de l'étape 1 n'est cochée

**La Porte ne passe toujours rien.** `instantaneDeLot` construit ses options pour la voie sans
`relectureDesCases` : un document traité par la chaîne réelle fait donc **zéro** appel au regard
distant, et son relevé **n'atteint pas Vérifier**. Le port est atteignable depuis
`rejouerParOracle` — le banc l'a employé — et de là seulement.

C'est pour cette raison que les deux premières cases de l'étape 1 restent **vides** au cahier :
« la chaîne appelle réellement la relecture des cases » n'est vrai qu'à moitié, et « visibles dans
Vérifier » ne l'est pas du tout. L'écran sait nommer l'état `relecture_non_faite` depuis la
couche 2 ; rien ne lui apporte encore les cases.

Reste aussi hors de cette couche : **Vision au bout du port des repères** (port 2, à la place du
bouchon), que la même case du cahier nomme.

## Une mesure sur le banc lui-même : `mesures/` n'est pas typé

Le premier typage de ce banc a été vert, et il ne prouvait rien. **Prouvé par mutation** : une
faute de type volontaire (`const erreurVolontaire: number = "pas un nombre"`) n'a produit **aucune
erreur**. La cause est uniforme dans le dépôt : **aucun** des dix-sept `tsconfig.json` des paquets ne
nomme `mesures` dans son `include`.

Le banc a donc été typé **explicitement**, en ajoutant son chemin à l'`include` le temps du
contrôle, et la mutation refaite y a bien été refusée :

```
mesures/a2-un-document-a-blanc-contre-sa-version.ts(221,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

Puis le `tsconfig.json` a été rendu à son état d'origine, octet pour octet. C'est un écart de
couverture ancien et général, inscrit à la file sous le lot **0p** ; il n'est pas réparé ici.
