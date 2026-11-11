# L'ordre : 14 quater, puis la barre ×3, puis l'étape 1

**Tranché par Christophe le 11 novembre 2026**, le tableau des marges du coureur sous les yeux.
Ses mots :

> « Ordre décidé : **14 quater** (`paquet-hermetique` sur le coureur macOS : comprendre et réduire
> son coût, sans toucher à son délai), puis **la barre ×3** si plus aucun contrôle n'est sous ×3
> sur le coureur, puis **l'étape 1**. »

| rang | ce qui passe | pourquoi là |
|---|---|---|
| 1 | **14 quater** — le coût de `paquet-hermetique` | c'est le **dernier** contrôle sous ×3 sur le coureur |
| 2 | **la barre ×3** | sa condition est « plus aucun contrôle sous ×3 **sur le coureur** » |
| 3 | **l'étape 1** — le branchement Vision | ne commence pas avant que la barre soit posée |

## Ce que la course 43014496414 a montré, et qui fixe cet ordre

Le lot 14 bis a écarté tous les obstacles **sauf un**. Sur le coureur macOS, les contrôles de
`voie-oracle` qui tenaient les quatre plus courtes marges — ×2.06, ×2.33, ×2.40, ×2.58 la veille —
sont à **×3.72** et au-delà. Il ne reste que :

| marge | corps / délai | contrôle |
|---|---|---|
| **×2.05** | **2 441 / 5 000** | **`paquet-hermetique`** |
| ×3.22 | 1 552 / 5 000 | `aucune-page-lue` |
| ×3.72 | 48 400 / 180 000 | `voie-oracle` |

« Absent du tableau » ne disait pas lequel des deux, et Christophe a eu raison de le demander.
**Vérifié dans le journal des trois courses** :

| | contrôles du fichier | sautés | le fichier entier | le contrôle en cause |
|---|---|---|---|---|
| machine de Christophe | 9 | **0** | **403 ms** | il tourne, et vite |
| coureur **macOS** | 9 | **0** | **2 480 ms** | **2 441 ms → ×2.05** |
| coureur **Ubuntu** | 9 | **2** | **5 ms** | **sauté** |

Donc : sur Ubuntu il n'est **pas rapide, il ne tourne pas**. Il est l'un des deux contrôles que ce
fichier saute là-bas, et pour une raison écrite dans son en-tête — « le paquet est ignoré par Git,
donc absent de l'intégration continue » ; il demande le paquet **réellement embarqué sur la
machine**, et les outils Mach-O pour l'inspecter.

Le fait à expliquer est donc étroit et net : **le même contrôle, avec un paquet présent des deux
côtés, met 403 ms chez Christophe et 2 441 ms sur le coureur macOS — six fois plus.** C'est cela,
et rien d'autre, que 14 quater doit comprendre.

## Ce que ce contrôle fait, exactement — et ce qu'il ne fait pas

Christophe a demandé la précision, parce qu'une décision du 10 novembre décrit l'hermétisme du
paquet avec « `otool -L` sur les 21 Mach-O, **et `vmmap` sur un processus vivant** ». Les deux
phrases ne parlent pas de la même chose, et la confusion était la mienne :

- le `vmmap` était une **vérification à la main**, ce soir-là, sur l'application installée ;
- le **contrôle automatique**, `paquet-hermetique.test.ts:74`, est **purement statique** :
  `referencesDuPaquet` liste les Mach-O du paquet, puis `chargees` lance **`otool -l`** sur chacun
  et lit leurs `LC_LOAD_DYLIB`. Le seul processus fils du module est `otool` ; il n'y a ni `vmmap`,
  ni `DYLD_*`, et **aucun binaire du paquet n'est exécuté**.

**La piste Gatekeeper / XProtect est donc fermée pour ce contrôle** : macOS vérifie un programme
qu'on **lance**, pas un fichier qu'on inspecte. Elle resterait ouverte pour la vérification à la
main, qui lance bel et bien un processus — mais celle-là n'est pas dans la course.

*(À noter sans en faire un lot : le nom du contrôle promet plus que ce qu'il vérifie. Lire les
`LC_LOAD_DYLIB` dit ce que le chargeur ira chercher au démarrage, non ce qu'un `dlopen` tardif
pourrait ajouter. C'est le `vmmap` à la main qui couvrait ce reste.)*

## Ce que la mesure locale dit déjà, et ce qui reste à mesurer sur le coureur

| | |
|---|---|
| Mach-O du paquet | **22 fichiers, 277 Mo** |
| `otool -l` sur les 22 | **336 ms**, soit 15 ms par fichier |
| `otool -l` sur un binaire minuscule du système | **17 ms** |

**La taille ne coûte rien** : 108 Mo s'inspectent aussi vite que vingt kilo-octets. Ce n'est donc
pas la première lecture des binaires, et la piste (a) s'affaiblit d'autant. C'est le **démarrage
du processus**, vingt-deux fois — la forme exacte du lot 14 bis.

Et une troisième cause se mesure déjà, ici :

| | 22 appels | par appel |
|---|---|---|
| `/usr/bin/otool` | **319 ms** | 14,5 ms |
| le même, résolu par `xcrun -f otool` | **110 ms** | **5,0 ms** |

`/usr/bin/otool` est un **relais** qui résout le dossier de développement actif à **chaque** appel
avant de déléguer à `/Library/Developer/CommandLineTools/usr/bin/otool`. Sur un coureur portant un
Xcode complet, cette résolution est plus lourde qu'ici.

**Restent donc à mesurer sur le coureur** : les 22 appels par le relais, les 22 par le chemin
résolu, et une seconde passe de chacun. Si c'est le relais, le correctif est **dans le contrôle** —
résoudre `otool` une fois — et non une étape de préparation ; si seule la seconde passe est rapide,
c'est l'environnement, et l'étape de préparation est la bonne réponse. Dans les deux cas, **ni
délai allongé, ni test raboté**.

## La condition de Christophe, démentie puis confirmée

Elle avait été posée le 10 novembre :

> « `paquet-hermetique` y était à ×1,92 : si la prochaine course le confirme, inscris un petit lot
> pour comprendre et réduire son coût (sans toucher à son délai), **avant d'allumer la barre**. »

La course du 10 novembre l'a **démentie** — ×3.25 — et aucun lot n'a été inscrit ; c'était la
règle, et un lot inscrit sur un chiffre non confirmé aurait été un lot inventé. Celle du
11 novembre la **confirme** — ×2.05 —, et le lot est inscrit le jour même.

Deux mesures contradictoires du même contrôle sur le même coureur, à un jour d'écart : c'est
peut-être la variabilité du coureur, peut-être une cause réelle. **14 quater commencera par
trancher cela**, parce qu'un correctif posé sur du bruit ne corrige rien.

## Et la barre ne s'allume pas d'elle-même

« Plus aucun contrôle sous ×3 sur le coureur » n'est pas rempli : il en reste un. La barre reste
donc `null`, et ce n'est pas une prudence ajoutée — c'est la règle que Christophe a écrite,
appliquée à la lettre.
