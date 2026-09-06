# DEEP-PRODUCTION-BLOCKERS-01 — Deux chiffres à fermer avant le gate

Le routage final a livré deux chiffres qu'on ne pouvait pas emporter tels quels au Release Gate :
**4 tours sur 10 dégradés**, et **93 s au p50** là où le Capacity Gate avait mesuré 21 s.

Le premier était un défaut. Le second n'en était pas un. Ce lot le prouve pour les deux.

---

## A. État de départ

| | |
| --- | --- |
| Base | `9faa7c5` — sous-arbre `tools/Atelier Prompts` **byte-identique** à `fa9dbdf` (même arbre `2e317d0f`) |
| Mutation externe de l'Atelier | **non** — les commits externes ne touchent que `Worker/` et `studio-clinique.html` |
| FAST | Groq seul |
| DEEP | Anthropic seul, `claude-sonnet-4-6` |
| Repli Deep | aucun — fail-closed prouvé |

---

## B. Blocker A — la preuve du plafond

`ROLE_MAX_OUTPUT_UNITS = 2048`. Sur les onze tours du runtime final :

| | |
| --- | --- |
| Tours dégradés | **4** |
| Rôle | **Arbitre**, les quatre fois |
| Classe | `structured_output_invalid`, les quatre fois |
| `stop_reason` | `max_tokens`, les quatre fois |
| Jetons de sortie | **exactement 2048**, les quatre fois |

Distribution complète de l'Arbitre sous plafond 2048 :
`1720 · 1750 · 1775 · 1834 · 1936 · 1985 · 1989 · 2048 · 2048 · 2048 · 2048`

Sept tours passent de justesse, quatre butent. L'Arbitre ne débordait pas : **il vivait au plafond.**

D'où venait 2048 ? De `GROQ_CRITIC_CAPABILITY.global_max_completion_units`, où le commentaire dit
lui-même « valeur de production conservée par prudence (aucune mesure réseau réelle) ». Elle n'a
jamais été calibrée pour l'Analyste ni pour l'Arbitre : ils l'ont héritée en partageant l'adaptateur
générique. Exactement le défaut que CSR-01 avait déjà rencontré sur le plafond des batches — « le
défaut n'a jamais été un défaut de modèle, ni de parsing, ni de contrat : c'était NOTRE plafond ».

---

## C. Le plafond retenu

| | |
| --- | --- |
| Avant | **2048** |
| Après | **4096** |
| Portée | la même constante unique `ROLE_MAX_OUTPUT_UNITS` — aucun nouveau mécanisme |
| Plafond du Critique | **inchangé à 2048** |
| Prompts | **aucun modifié** |

---

## D. Pourquoi 4096, et pourquoi une seule valeur

**La valeur vient d'une mesure.** Plafond relevé temporairement à 8192, huit tours réels rejoués sur
les cas mêmes qui tronquaient. Zéro troncature, et la vraie distribution enfin observable :

| Rôle | n | min | p50 | max | plafond atteint |
| --- | --- | --- | --- | --- | --- |
| Analyste | 8 | 1288 | 1385 | **1852** | non |
| Critique | 26 | 252 | 1117 | **1401** | non |
| Arbitre | 8 | 1632 | 1901 | **2332** | non |

Le maximum réel de l'Arbitre est **2332** — 284 jetons au-dessus du mur. Le défaut se jouait à ça.

**La marge est choisie, pas subie.** 3072 couvrirait ce maximum de 32 %. Mais l'étendue de la
distribution elle-même vaut 43 % (1632 → 2332). Sur dix-neuf tours et trois cas, se caler à moins
d'une étendue au-dessus du maximum observé, c'est calibrer sur l'échantillon et non sur la
population des demandes réelles. 4096 le couvre de **76 %** — plus d'une étendue — en **un seul
doublement**. C'est le plus petit pas qui tienne cet argument.

**Pourquoi pas un plafond par rôle.** L'Analyste plafonne à 1852 : le laisser à 2048 lui laisserait
196 jetons de marge, soit la même faute que celle qu'on vient de payer, en attente sur l'autre rôle.
Un plafond par rôle fermerait une instance ; une seule valeur mesurée ferme la classe. Et le
Critique, mesuré à 1401 contre 2048, n'approche pas le sien : rien à corriger, donc rien de corrigé.

---

## E. Avant / après

Vingt-six tours réels, cent six appels fournisseur, aucun épinglage, runtime final.

| | Avant (plafond 2048) | Après (plafond 4096) |
| --- | --- | --- |
| Tours | 11 | **26** |
| Appels fournisseur | 56 | **106** |
| `stop_reason = max_tokens` | 4 | **0** |
| `structured_output_invalid` au plafond | 4 | **0** |
| `degraded_state` dû au plafond | 4 | **0** |
| READY fabriqué | 0 | **0** |

`STRUCTURED_OUTPUT_INVALID_AT_LIMIT = 0` · `DEGRADED_DUE_OUTPUT_LIMIT = 0`

Et le contrôle a produit une sortie d'Arbitre à **2805 jetons** — au-dessus du maximum connu au
moment du choix. 3072 n'aurait laissé que 9,5 % de marge ; 4096 en laisse 46 %. La règle de marge
n'était pas de la prudence décorative : elle a servi dès la campagne suivante.

---

## F. Protocole apparié

Deux cas, sur le runtime FINAL, sans aucun pin, séquentiels à concurrence 1 — comme le Capacity Gate.

| Cas | Contenu | Provenance |
| --- | --- | --- |
| **A** | « Extrais le numéro de dossier du matériau disponible. » + `NUMERO_DOSSIER = ZX-4821` | le cas synthétique stable **du Capacity Gate** (30 de ses 50 tours) |
| **B** | « Rédige une note de synthèse de deux pages… comité de pilotage » | le cas **sans matériau du routage final**, celui dont la lenteur a été observée |
| **T** | « Extrais le numéro de dossier… et rédige l'accusé de réception » | le cas **matériau du routage final**, celui qui tronquait l'Arbitre |

---

## G. Capacity contre Routing — ce qui diffère vraiment

Douze axes identiques, deux différents. L'inventaire complet est dans `comparability.json`.

| Axe | Capacity Gate | Routage final | Identique |
| --- | --- | --- | --- |
| Endpoint, rôles, modèle, plafond, timeouts, reprises, chemin Critic, concurrence | | | **oui** |
| Fournisseur servant | Anthropic | Anthropic | **oui** |
| Épinglage | `DEEP_BENCH_PROVIDER=anthropic` | aucun (Anthropic est seul) | mécanisme différent, **fournisseur identique** |
| Début/fin | horodatages du journal | temps mur client | surcoût d'orchestration mesuré à **0** aux trois quantiles |
| **Population de test** | 30/50 tours = cas A | **aucun cas A** | **NON** |

Le cas qui portait la mesure du Capacity Gate **n'apparaît pas du tout** dans la campagne du routage
final. Les deux chiffres ne décrivaient pas la même chose.

---

## H. La cause du delta

**`LATENCY_DELTA_CLASSIFICATION = TEST_POPULATION_DIFFERENCE`**, dont le mécanisme est
`ROLE_OUTPUT_EXPANSION`.

Le cas A du Capacity Gate, rejoué à l'identique sur le runtime final :

| | Capacity Gate | Runtime final | Écart |
| --- | --- | --- | --- |
| Total p50 | 21 338 ms | **20 809 ms** | **−2,5 %** |
| Analyste p50 | 8 001 ms | 7 882 ms | −1,5 % |
| Critique p50 | 4 737 ms | 4 612 ms | −2,6 % |
| Arbitre p50 | 8 461 ms | 8 954 ms | +5,8 % |
| Jetons sortie Analyste p50 | 448 | 422 | |
| Jetons sortie Critique p50 | 227 | 233 | |
| Jetons sortie Arbitre p50 | 521 | 480 | |

Étage par étage, volume par volume, le runtime final **reproduit** le Capacity Gate. Il n'y avait
rien à corriger : les deux chiffres ne décrivaient pas la même chose.

Ce qui commande la latence, c'est le nombre de jetons produits :

| | Cas A | Cas B | Rapport |
| --- | --- | --- | --- |
| Latence p50 | 20 809 ms | 91 694 ms | **×4,41** |
| Jetons de sortie p50 (3 rôles) | 1 135 | 4 180 | **×3,68** |

Les deux rapports sont du même ordre. Une demande ouverte fait produire quatre fois plus de texte,
et coûte quatre fois plus de temps.

**Causes écartées, chacune sur preuve :** méthode de mesure (le cas A rend la même valeur en temps
mur client qu'en horodatages de journal, et le surcoût d'orchestration avait été mesuré à 0) ;
configuration (douze axes identiques) ; variance fournisseur ou reprises (aucune politique de
reprise Anthropic n'existe, et les deux campagnes ont été servies par Anthropic) ; **régression du
runtime** (écartée par la preuve principale ci-dessus).

---

## I. Latence nominale

Le cas nominal est celui sur lequel la capacité a été qualifiée — le cas A.

| | |
| --- | --- |
| n | 10 |
| p50 | **20 809 ms** |
| p95 | 28 025 ms |
| min / max | 19 100 / 29 979 ms |
| États | **10/10 `operational_request_ready`** |

**`NOMINAL_DEEP_LATENCY_BLOCKER = NO`.** La latence nominale du plan profond n'est pas de 93 s. Elle
est de 21 s, exactement là où le Capacity Gate l'avait laissée.

---

## J. Latence sans matériau

| | Cas B (sans matériau) | Cas T (matériau, celui qui tronquait) |
| --- | --- | --- |
| n | 10 | 6 |
| p50 | 91 694 ms | 101 718 ms |
| p95 | 110 446 ms | 134 815 ms |
| Étage le plus coûteux (p50) | Critique 32 073 ms | Critique 47 672 ms |
| Jetons sortie Arbitre p50 | 1 774 | 2 182 (max **2805**) |

Ces demandes ouvertes coûtent quatre à cinq fois le cas nominal. C'est **une limitation connue et
documentée**, pas une régression : le mécanisme en est établi au § H, et ce lot n'avait pas le droit
de l'optimiser — ni ne le recommande sans décision explicite.

---

## K. Ce qui reste ouvert

### Un défaut observé pendant le contrôle, sans rapport avec le plafond

Un tour sur vingt-six s'est terminé en **502** — pas en `degraded_state`. Ce que le journal montre :

```
provider_ha_failure       role=critic  provider=anthropic  failure_class=programming_error
provider_ha_fail_closed   role=critic  remaining_providers=[]
operational_request_error recommended_treatment="question" exige impact="material" (B-01B) :
                          l'issue "M-01" est non matérielle et ne peut jamais être traitée par question.
```

Le Critique a produit, dans `missed_material_issues`, une issue combinant
`recommended_treatment="question"` et `impact != "material"` — une combinaison que le contrat
interdit et que `normalizeRoleIssues` refuse, aux trois rôles à la fois.

**Ce défaut n'est pas un effet du relèvement.** Le plafond du Critique n'a pas été touché ; il reste
à 2048 ; le Critique a été mesuré à 1410 jetons au maximum sur cette campagne, et n'a jamais tronqué.
Le relèvement ne peut pas l'avoir provoqué.

**Le comportement du système face à ce défaut est correct** : il échoue fermé, ne bascule sur aucun
autre fournisseur, ne fabrique aucun état. Mais le client reçoit un 502 sans état sémantique, ce qui
est plus dur qu'une dégradation.

Un point mérite d'être rejugé, et ce lot n'a pas qualité pour le faire : une sortie de modèle qui
viole le contrat est-elle `programming_error` — donc notre bug, fail-closed immédiat — ou
`structured_output_invalid`, donc un défaut de ce modèle sur cet appel ? Le classement actuel produit
un 502 là où une dégradation serait plus fidèle. **Décision du propriétaire.**

### Rappel non corrigé

La latence des demandes ouvertes (§ J) reste une limitation connue.

---

## L. Recommandation

**`RELEASE_GATE_AUTHORIZED = NO`.**

Les deux blockers nommés par ce lot sont fermés, et fermés sur preuve :

- **Blocker A — plafond de sortie : FERMÉ.** 0 troncature sur 106 appels, 0 dégradation de plafond
  sur 26 tours, sans toucher un seul prompt ni une seule règle sémantique.
- **Blocker B — delta de latence : EXPLIQUÉ.** Différence de population, mécanisme d'expansion des
  sorties, preuve par rejeu apparié à −2,5 % du Capacity Gate. La latence nominale réelle est
  connue : 20,8 s.

Le gate n'est pas autorisé pour une seule raison, et elle est étrangère à ces deux blockers : la
campagne de contrôle a fait apparaître **un tour sur vingt-six terminé en 502**, sur une violation du
contrat B-01B par le Critique. Un échec dur de cette nature, sur le chemin réel, doit être jugé avant
un Release Gate — pas franchi par-dessus.

**`BLOCKING_DEFECT` (un seul) :** violation B-01B dans `missed_material_issues` du Critique,
classée `programming_error`, rendue au client en 502 sans état sémantique. 1/26 tours.

**`NEXT_SAFE_ACTION` :** un lot dédié à ce défaut — d'abord trancher le classement
(`programming_error` contre `structured_output_invalid`), ensuite seulement décider s'il faut agir
sur la production de l'issue elle-même. Puis `ATELIER-RELEASE-GATE-01`.
