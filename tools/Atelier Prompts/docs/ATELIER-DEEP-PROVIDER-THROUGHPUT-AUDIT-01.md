# ATELIER-DEEP-PROVIDER-THROUGHPUT-AUDIT-01

**Sous-lot :** `ATELIER_DEEP_PROVIDER_THROUGHPUT_AUDIT_01D_K`
**Nature :** mesure / comparaison / rapport. Aucune implémentation, aucun appel API émis.
**Question :** un fournisseur existant permet-il au chemin minimal sûr de tenir sous 10 s ?

**Réponse en une phrase.** Il n'existe **qu'une seule** combinaison de fournisseurs routable pour les
rôles Deep, et sur 58 tours réels mesurés le chemin minimal sûr n'est **jamais** descendu sous 10 s —
le meilleur cas jamais observé est 11 738 ms. Le débit n'est pas le coupable : il est remarquablement
stable à 48–62 jetons/s. **Le coupable est le volume de sortie, et le débit est le diviseur fixe qui
le transforme en secondes.**

---

## A. État Git

```
git status --short  → ?? docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md
                       ?? docs/ATELIER-DEEP-OUTPUT-MINIMIZATION-AUDIT-01.md
                       ?? docs/ATELIER-DEEP-CRITICAL-PATH-ROLE-AUDIT-01.md
git branch          → main
git rev-parse HEAD  → 11906d2415b788f8b5ab44346e1d155484b0c795
```

tree `tools/Atelier Prompts` @ `1d5eed5` = @ `HEAD` = `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b`.
Sémantiquement identique au point de référence de 1D-H/I/J. Écart documenté, audit poursuivi en
place, aucune copie isolée.

## B. Rappel 1D-H / I / J

1D-H : chemin de clarification anticipée prouvé ; exposition anticipée seule insuffisante.
1D-I : sur-provisionnement des sorties prouvé ; minimisation seule n'atteint ni 10 s ni 5 s.
1D-J : premier étage sûr = fin de phase `critic` (Analyste + Critique global + lot de l'issue
retenue), 3 appels LLM minimum, Arbitre non requis avant affichage mais requis pour le tour final.

Le paramètre restant, jamais isolé : la vitesse réelle des fournisseurs Deep. C'est l'objet de ce
sous-lot.

## C. Providers et modèles existants

| PROVIDER | MODEL | ROLES_SUPPORTED | ROUTED_IN_PRODUCTION | FALLBACK_ONLY | TEST_ONLY | REAL_API_AVAILABLE | TOKEN_USAGE | TIMING |
|---|---|---|---|---|---|---|---|---|
| **anthropic** | **`claude-sonnet-4-6`** | analyst, critic, arbiter | **OUI — seul** | non (aucun repli) | non | oui (secret Worker) | oui | oui |
| groq | `openai/gpt-oss-20b` | **aucun rôle** | **NON** | **NON** | non | — | historique | historique |
| openai | `gpt-5.6-sol` | **aucun rôle** | **NON** | **NON** | non | — | non | non |
| anthropic | `claude-haiku-4-5-20251001` | testé sur les 3 | **NON** | non | **oui** (`DEEP-HAIKU-FIT-01`) | oui | oui | oui |

**Il n'y a pas de « combinaisons » à comparer, et ce n'est pas un manque de données : c'est le
contrat.**

```js
export const ROLE_PROVIDER_ORDER = Object.freeze(["anthropic"]);          // index.js:1865

export function resolveRoleProviderOrder(env) {
  const choisi = (env && env[DEEP_BENCH_PROVIDER_BINDING]) || FAST_BENCH_CHAIN;
  if (choisi === FAST_BENCH_CHAIN) return ROLE_PROVIDER_ORDER;
  if (ROLE_PROVIDER_ORDER.includes(choisi)) return Object.freeze([choisi]);
  throw tagFailure(new Error(`… invalide …`), FAILURE_CLASSES.CONTRACT_ERROR);
}
```

`ROLE_PROVIDER_ORDER` ne contient qu'`anthropic` : le binding de banc `DEEP_BENCH_PROVIDER`
n'accepte donc que `"ha"` ou `"anthropic"`. **Demander `groq` ou `openai` pour un rôle lève une
`CONTRACT_ERROR`** — ni en production, ni au banc, ni en repli.

La raison est documentée à `index.js:1843-1862` (`DEEP-PROVIDER-ROUTING-FINAL-01`) et elle n'est pas
technique :

> « Un repli de plan profond n'est pas une redondance technique : les trois rôles portent la
> sémantique, et changer de fournisseur en cours de chaîne revient à **changer de juge au milieu du
> procès**. La qualification sémantique (porte 2) et la qualification de capacité (porte 3) portent
> sur Anthropic — sur lui seul. Un succès obtenu chez un autre fournisseur ne prouverait rien de ce
> qui a été mesuré. »

Et : « SI ANTHROPIC ÉCHOUE, LA CHAÎNE SE FERME » → `degraded_state`, jamais un `READY` fabriqué,
jamais une bascule silencieuse.

`PROVIDERS_AUDITED = [anthropic/claude-sonnet-4-6]` — non par choix de ma part, mais parce que c'est
le seul routable. Groq et OpenAI ne sont pas des candidats : ils ne sont pas routables aujourd'hui,
critère explicite du §1 de la mission.

## D. Données existantes

Trouvées dans le dépôt, aucune campagne relancée :

| source | contenu | n | fournisseur |
|---|---|---|---|
| **`evaluation/anthropic-deep-capacity-01/stage-latency.jsonl`** | **latence ET usage jetons PAR RÔLE** | **62** | **anthropic, 100 %** |
| `evaluation/deep-cout-jetons-01/results.json` | jetons par rôle | 12 | Groq + bascule partielle |
| `evaluation/deep-haiku-fit-01/latency.json` + `summary.json` | latence et verdict Haiku | 8 | anthropic (Haiku) |
| `evaluation/deep-interaction-early-stop-01/paired-results.json` | 8 tours appariés, sortie + ms + USD | 8 | **anthropic Sonnet** |
| `docs/DEEP-INTERACTION-LATENCY-01.md` | loi de latence, parts d'étage | 10 | Sonnet (projections) |
| `docs/PERF-NOMINAL-PROVIDER-01.md` | débit des 3 fournisseurs — **plan Fast uniquement** | 48×3 | les 3 |

Le fichier `stage-latency.jsonl` (mal nommé : c'est un tableau JSON, pas du JSONL) est le jeu de
données décisif. Il porte, par tour et par rôle, la latence en ms **et** l'usage jetons
(entrée/sortie/appels), avec `fournisseurs` explicite — `anthropic` sur les 62 enregistrements, tous
en `outcome: "ok"`.

`DEEP_THROUGHPUT_DATA_ALREADY_AVAILABLE = YES.` `REAL_API_CALLS_REQUIRED = NO.`

## E. Méthodologie

Débit calculé **par enregistrement**, jamais en divisant des médianes :
`tok/s = usage[rôle].sortie / (latence[rôle] / 1000)`.

Le chemin minimal sûr est sommé **par enregistrement** (`analyst + critic`) puis distribué — additionner
des percentiles produirait un chiffre qui n'existe dans aucun tour réel.

Les jetons viennent des compteurs d'usage du fournisseur ; aucune conversion caractères → jetons,
aucune estimation. La population Anthropic (n=62) et la population Groq (n=12) **ne sont jamais
mélangées**.

## F. Analyste

| | N | p50 | p95 | min | max |
|---|---|---|---|---|---|
| latence (ms) | 61 | **8 017** | 24 002 | **7 524** | 27 916 |
| jetons de sortie | 61 | 452 | — | — | — |
| appels | 61 | 1,0 | — | — | — |
| **débit (tok/s)** | 61 | **57,9** | — | **52,5 (p5)** | — |

Un seul appel, toujours. Latence plancher 7 524 ms — **l'Analyste seul consomme déjà 75 % du budget
des 10 secondes dans son meilleur cas observé.**

## G. Critique global

Sur 53 des 62 tours, le Critique ne fait **qu'un seul appel** : c'est le Critique global seul, sans
lot, et il coûte **4 706 ms médians pour 223 jetons**, soit 48,6 tok/s. C'est le rôle le moins cher
du tour quand aucune issue matérielle ne demande de question.

## H. Critic batch

| appels Critique | N | ms médian | sortie médiane | débit |
|---|---|---|---|---|
| 1 (global seul) | **53** | **4 706** | 223 jetons | 48,6 tok/s |
| 2 (global + 1 lot) | 3 | **34 418** | 1 721 jetons | 51,7 tok/s |
| 3 | 1 | 39 251 | 2 430 jetons | 61,9 tok/s |
| 5 | 1 | 60 544 | 5 940 jetons | 98,1 tok/s¹ |

¹ Au-delà de deux appels, `max_inflight = 2` fait travailler deux appels en parallèle : le débit
horloge dépasse alors le débit d'un flux unique. Ce n'est pas un modèle plus rapide, c'est du
parallélisme.

**Le premier lot coûte ~30 secondes.** Passer de 1 à 2 appels multiplie la sortie par 7,7 (223 →
1 721 jetons) et la latence par 7,3 (4,7 s → 34,4 s). Le rapport est presque exactement constant :
**c'est du volume, pas du débit.**

## I. Arbitre

| | N | p50 | p95 | min | max |
|---|---|---|---|---|---|
| latence (ms) | 57 | **8 461** | 26 322 | 7 351 | 37 160 |
| jetons de sortie | 57 | 524 | — | — | — |
| **débit (tok/s)** | 57 | **62,0** | — | 53,1 (p5) | — |

Part de l'Arbitre dans la somme des trois étages, **calculée par enregistrement** : p50 = **39,7 %**,
p95 = 46,1 %. Cohérent avec les 42,4 % projetés en 1D-H par une voie indépendante.

## J. TTFT

```
TIME_TO_FIRST_TOKEN = UNKNOWN
```

Le jeu de données ne porte qu'une latence totale par étage. Aucun champ de premier jeton, aucun
mode flux. Je ne le déduis pas.

Ce que la donnée établit en revanche, et qui le borne : **`wallTime − Σ(étages)` vaut 1 ms en médiane
et 2 ms au maximum** sur 57 enregistrements. Il n'y a donc **aucune latence fixe de tour** — ni
réseau, ni file d'attente, ni surcoût d'orchestration mesurable. Tout TTFT existant est *à
l'intérieur* du chiffre par étage, et la somme de tous les TTFT est nécessairement inférieure aux
21,3 s du tour. La séparation exacte reste `UNKNOWN`.

## K. Tokens/s

| | p50 | p5 | max |
|---|---|---|---|
| Analyste | 57,9 | 52,5 | — |
| Critique | 48,7 | 43,3 | — |
| Arbitre | 62,0 | 53,1 | — |
| **tour agrégé** | **57,7** | **52,9** | 65,2 |

**Le débit est la grandeur la plus stable de tout le dossier.** Entre le p5 et le p50 du tour, il
varie de 52,9 à 57,7 tok/s — 9 %. Entre un Critique à 1 appel et un Critique à 3 appels, de 48,6 à
61,9. Sur la même période, la latence du Critique varie de 4,7 s à 60,5 s, soit **1 288 %**.

Conclusion directe : **la latence Deep n'est pas un problème de débit fournisseur. Elle est le volume
de sortie divisé par un débit quasi constant.**

## L. Latence totale

| | N | p50 | p75 | p95 | min | max |
|---|---|---|---|---|---|---|
| somme des trois étages | 57 | 21 225 | 27 120 | 76 188 | 19 587 | 80 893 |
| `wallTime` du tour | 62 | **21 324** | 32 386 | **80 791** | 19 588 | 120 009 |

## M. Variance

La médiane ne dit presque rien de ce dossier. Sur le tour complet : p50 21,3 s, **p95 80,8 s, max
120,0 s** — un facteur 5,6 entre médiane et queue.

Et la cause de la queue est identifiée sans ambiguïté : **le nombre de lots Critique**. 53 tours à un
appel tiennent 4,7 s ; les 9 autres montent jusqu'à 60,5 s. Le débit, lui, ne bouge pas. La variance
est donc du volume, exactement comme la médiane.

Le §11 de la mission l'énonce mieux que moi : une solution qui tient en médiane et pas au p95 ne
ferme pas le problème.

## N. Chemin minimal sûr

Chemin établi par 1D-J : Analyste → Critique global → lot de l'issue retenue → ASK sûr.
Sommé **par enregistrement**, n = 58 :

| | valeur |
|---|---|
| `SAFE_ASK_PATH_MEDIAN_LATENCY` | **12 676 ms** |
| p75 | 16 580 ms |
| `SAFE_ASK_PATH_P95_LATENCY` | **53 295 ms** |
| **minimum jamais observé** | **11 738 ms** |
| maximum | 84 287 ms |
| `SAFE_ASK_PATH_OUTPUT_TOKENS` (p50) | 680 jetons (452 + 228) |
| `SAFE_ASK_PATH_PROVIDER_CALLS` (p50) | **2** (1 analyste + 1 critique) |
| **enregistrements ≤ 10 s** | **0 / 58** |
| **enregistrements ≤ 5 s** | **0 / 58** |

Meilleur tour jamais observé : 11 738 ms — Analyste 7 615 ms (448 jetons) + Critique 4 123 ms
(214 jetons), soit 662 jetons à 56,4 tok/s.

Une seule combinaison de fournisseurs existe, donc
`FASTEST_SAFE_EXISTING_PROVIDER_COMBINATION = anthropic/claude-sonnet-4-6 pour les trois rôles` —
c'est-à-dire le routage actuel.

## O. Budget 10 s

À 56,4–57,7 tok/s mesurés, le budget de 10 secondes vaut **564 à 577 jetons de sortie** sur tout le
chemin d'affichage.

| | jetons | verdict |
|---|---|---|
| chemin sûr, p50 mesuré | 680 | **+18 % au-dessus du budget** |
| chemin sûr, meilleur cas mesuré | 662 | **+15 % au-dessus** |
| chemin sûr, p95 mesuré | — (53 295 ms) | **+433 % au-dessus** |

```
CAN_EXISTING_PROVIDER_COMBINATION_REACH_10S = PROVEN_NO
```

**Prouvé, pas projeté** : 0 enregistrement sur 58, et le meilleur cas jamais observé dépasse déjà le
seuil de 17 %. Aucun autre fournisseur n'est routable pour les rôles, donc aucun changement de
fournisseur ne peut y changer quoi que ce soit.

### Une correction à mon propre rapport 1D-J

1D-J estimait le chemin sûr à **≈ 21 s**, soit 211 % du budget, en appliquant une loi de 13 ms/jeton
aux comptes de jetons de `DEEP-COUT-JETONS-01` (Analyste 685 + Critique 939 = 1 624 jetons). Ces
comptes sont réels, mais ils viennent d'une population **Groq à 12 tours**. La mesure
**Anthropic-native à 62 tours** donne un chemin sûr à **12 676 ms pour 680 jetons de sortie**.

L'écart vient du Critique : 939 jetons dans le corpus Groq contre 228 ici, parce que ce corpus porte
beaucoup moins d'issues matérielles traitées par question. **L'estimation de 1D-J était pessimiste
d'environ 40 % sur la médiane.** La conclusion de 1D-J — 10 s non atteint — survit intacte ; la
*distance* au seuil, non : elle passe de +111 % à **+18 %**.

Cela change ce que vise le prochain lot. Une réduction de sortie de 15 à 18 % au p50 est **à
l'intérieur** de la fourchette −10 % à −45 % estimée par 1D-I. Le p95 de 53,3 s, lui, ne se ferme
par aucune fourchette de 1D-I : même −45 % le laisserait à ≈ 29 s.

Je le dis donc sans le maquiller : **au p50, le seuil de 10 s n'est plus hors de portée par
combinaison de leviers ; au p95, il l'est toujours.** Et le p95 est le seul qui décide d'un contrat
interactif.

## P. Budget 5 s

Le budget de 5 secondes vaut **282 à 289 jetons de sortie** sur tout le chemin.

L'Analyste seul en écrit **452 en médiane** et **448 dans le meilleur tour jamais observé** — soit
55 % au-dessus du budget, avant que le Critique n'ait écrit un jeton. Or l'Analyste est
irremplaçable : il est le seul producteur de `issues[]` et `question_candidates[]`.

```
CAN_EXISTING_PROVIDER_COMBINATION_REACH_5S = PROVEN_NO
```

## Q. Parité qualité

Le seul modèle plus rapide jamais qualifié sur ces rôles est `claude-haiku-4-5-20251001`
(`DEEP-HAIKU-FIT-01`). Deux résultats, et ils se renforcent :

**Il échoue la qualité.** `ALL_HAIKU_VERDICT = ALL_HAIKU_FAIL_MULTIPLE_ROLES` — 4 tours gouvernés sur
8, 2 `degraded_state`, et **2 tours terminés en HTTP 502 sans aucun état OPRIE**, sur des cas où
Sonnet est gouverné 60 fois sur 60.

**Et il n'était pas assez rapide.** Latence médiane **23 117 ms**, minimum 10 262 ms — au-dessus du
seuil de 10 s même dans son meilleur cas, sur des tours dont certains se sont *abrégés par défaut de
rôle* et sont donc artificiellement courts.

```
QUALITY_PARITY_OF_FASTEST_COMBINATION = NOT_APPLICABLE
```

Non applicable parce qu'il n'existe aucune combinaison plus rapide à qualifier : la plus rapide qui
soit sûre est celle en production. Le §9 est respecté par constat, pas par prudence — aucune adoption
n'est recommandée sur la seule vitesse, car aucune n'est disponible.

## R. Coût

`evaluation/deep-interaction-early-stop-01/paired-results.json` — 8 tours réels, anthropic
`claude-sonnet-4-6`, 39 appels fournisseur, **1,1483 USD** au total, soit **≈ 0,144 USD par tour**.

Le coût est secondaire dans ce sous-lot, et il ne discrimine rien : il n'y a qu'un fournisseur.

## S. Diagnostic principal

```
PRIMARY   = OUTPUT_VOLUME
SECONDARY = PROVIDER_THROUGHPUT (diviseur fixe, sans alternative routable)
            + nombre de lots Critique, pour la variance
```

La démonstration tient en trois observations de la même donnée :

1. **La latence fixe est nulle.** `wallTime − Σ(étages)` = 1 ms médian, 2 ms max. Toute la latence
   du tour est de la génération.
2. **Le débit est constant.** 48,6 à 62,0 tok/s selon le rôle ; 52,9 à 57,7 au p5/p50 du tour. Il ne
   varie pas de plus de 9 % là où la latence varie de 1 288 %.
3. **Le volume explique tout.** Le Critique passant de 1 à 2 appels multiplie sa sortie par 7,7 et sa
   latence par 7,3.

Donc `latence = volume de sortie ÷ débit`, avec un débit fixé par le seul fournisseur autorisé. Ce
n'est ni le nombre de rôles (1D-J l'a réduit au minimum sûr : 2 appels au p50), ni la dépendance
sérielle (elle n'ajoute aucun surcoût mesurable), ni la file d'attente. **C'est ce que les rôles
écrivent, divisé par une vitesse qu'on ne peut pas changer.**

## T. Verdict

Il n'existe pas de comparaison de fournisseurs à faire, et c'est le premier résultat : les rôles
OPRIE n'ont **qu'un** fournisseur routable, et le contrat qui l'impose est sémantique, pas technique
— « changer de fournisseur en cours de chaîne revient à changer de juge au milieu du procès ». Le seul
autre modèle jamais qualifié, Haiku, échoue la qualité *et* le seuil.

Sur ce fournisseur unique, la mesure est sans ambiguïté : **58 tours réels, aucun sous 10 s, meilleur
cas 11 738 ms.** Et la cause n'est pas le débit, qui est la grandeur la plus stable du dossier — c'est
le volume de sortie divisé par ce débit.

Les quatre leviers sont donc désormais tous instruits : l'exposition anticipée (1D-H), le volume de
sortie (1D-I), le nombre de rôles (1D-J) et le débit fournisseur (ce lot). Aucun ne ferme le seuil
seul, et le seul fournisseur possible est déjà en place.

Mais la mesure Anthropic-native corrige la distance, et cela doit être dit : le chemin sûr est à
**12,7 s au p50, pas 21 s** — 18 % au-dessus du budget, non 111 %. Au p50, le seuil de 10 s est
désormais à portée d'une réduction de sortie que 1D-I estime atteignable. **Au p95, à 53,3 s, il ne
l'est pas**, et le p95 est ce qui définit un contrat interactif.

La conclusion du §13 s'applique donc, mais avec une nuance que je ne masque pas : **aucun fournisseur
existant ne permet le seuil**, et le seuil interactif de 10 s reste incompatible avec le contrat
sémantique complet dans l'architecture présente — non par lenteur du fournisseur, mais parce que la
variance du volume de sortie du Critique va de 223 à 5 940 jetons selon le nombre d'issues
matérielles que la demande contient. Ce n'est pas une constante qu'on optimise : c'est une propriété
de la demande de l'utilisateur.
