# PERF-REAL-01 — mesure réelle du plan rapide

**Statut : OUVERTE. Aucune mesure de TTFI n'a pu être prise.**

Ce n'est pas un manque de temps ni de budget : la route ne produit aucune
interaction rapide, donc il n'existe aucun instant de première interaction à
mesurer. Ce rapport dit ce qui a été déployé, ce qui a été observé, et pourquoi
la dette reste ouverte.

## Ce qui a été fait

| Étape | Résultat |
| --- | --- |
| Worker ciblé | `atelier-decision-groq` (`workers/groq/`) |
| Version en production avant | `5fc0300a-622a-4574-8124-ed4c66fbe1dc` — ORCH-01, 1ᵉʳ septembre 2026 |
| État de `/fast-interaction` avant | **404** — la route de PERF-04 n'avait jamais été déployée |
| Déploiement | effectué, autorisé, cible unique |
| Version en production après | `6bdbe2ec-2910-427f-b013-59fa7152cf4a` |
| État de `/fast-interaction` après | la route existe, répond, et **échoue fermé** |
| Rollback | disponible, non exécuté |

## Le défaut

La route atteint le worker. Le worker n'atteint aucun fournisseur.

`runFastInteractionWithHaChain` construit ses entrées de chaîne ainsi :

```js
const providers = order.map((name) => ({ name, run: async () => { … } }));
return runProviderChain({ role: "fast_interaction", providers, … });
```

et `runProviderChain` les consomme ainsi :

```js
const { name, execute } = providers[index];
…
const result = await execute();
```

`run` d'un côté, `execute` de l'autre. À la première tentative, `execute` est
`undefined` ; l'appel lève `execute is not a function`, que la chaîne classe en
`programming_error`. Cette classe n'est pas éligible au repli — et c'est
correct : un défaut de contrat n'est pas une panne de fournisseur, et enchaîner
les trois providers transformerait un bug identifiable en cascade opaque. La
chaîne s'arrête donc immédiatement, et l'endpoint rend un 502 `fast_interaction_failure`.

Journal du worker, requête réelle :

```
{"event":"provider_ha_attempt","role":"fast_interaction","provider":"groq","attempt_index":0,"provider_order":["groq","anthropic","openai"]}
{"event":"provider_ha_failure","role":"fast_interaction","provider":"groq","attempt_index":0,"failure_class":"programming_error"}
{"event":"provider_ha_fail_closed","role":"fast_interaction","provider":"groq","failure_class":"programming_error","remaining_providers":["anthropic","openai"]}
{"event":"fast_interaction_error","message":"execute is not a function"}
```

## Pourquoi la suite locale ne l'a pas vu

Les preuves de PERF-03A et PERF-04 vérifient que le plan rapide **emploie** la
chaîne HA, en cherchant le texte `runProviderChain({ role: "fast_interaction"`
dans la source. Le texte est bien là. Ce qu'aucune preuve ne faisait, c'est
appeler `runFastInteractionWithHaChain` **à travers** `runProviderChain` : les
adaptateurs étaient exercés directement, la chaîne était exercée séparément, et
la jointure entre les deux n'était vérifiée que par sa présence, pas par son
fonctionnement. Un nom de clé ne se voit pas dans une recherche de sous-chaîne.

## Ce qui a été observé quand même

12 requêtes réelles sur la route déployée, six classes de demande, chacune en
froid puis en chaud.

| Mesure | Valeur |
| --- | --- |
| Échantillons | 12 |
| HTTP 200 | 0 |
| HTTP 502 `fast_interaction_failure` | 12 |
| Fournisseurs atteints | 0 |
| Latence de transport min / p50 / p95 / max | 15,6 / 18,0 / 148,7 / 148,7 ms |
| TTFI | **non mesurable** |

Ces millisecondes ne disent rien de la performance du produit : elles mesurent
le temps que met le worker à constater son propre défaut. Les rapporter comme
un TTFI serait un mensonge par cadrage.

## Ce qui fonctionne, et qui n'a pas régressé

| Vérification | Résultat |
| --- | --- |
| `/decision`, charge valide, fournisseur réel | **200 en 568 ms**, réponse Groq authentique |
| `/operational-request` | vivant, échoue fermé sur entrée invalide (400) |
| `/analyst` et les autres rôles | vivants, échouent fermé (400) |
| Entrée invalide sur `/fast-interaction` | 400 `invalid_turn_snapshot`, message précis, ni pile ni secret |
| Origine non autorisée | 403, sans en-tête CORS |
| Préflight CORS | 204, `access-control-allow-origin: https://c-concept-dev.github.io`, jamais `*` |
| Aucune interaction fabriquée | aucun candidat n'est jamais rendu faute de fournisseur |
| Aucun faux READY | le schéma à deux champs ne peut porter ni readiness, ni route, ni état |

Les 568 ms de `/decision` montrent qu'un appel structuré à un seul fournisseur,
depuis ce worker, tient largement dans le budget interactif. Ce n'est **pas** un
TTFI du plan rapide, et ce rapport ne s'en sert pas comme substitut : c'est une
borne adjacente, qui indique seulement que le budget n'est pas hors d'atteinte.

## Pourquoi le déploiement reste en place

L'état d'avant était un 404. L'état d'après est une route qui existe et échoue
fermé, pendant que toutes les autres routes continuent de fonctionner et
d'atteindre de vrais fournisseurs. La nouvelle version n'est objectivement pire
que la précédente sur aucun point ; un rollback restaurerait le 404 sans rien
améliorer. La cible de rollback reste enregistrée et disponible.

## Ce qu'il faudrait pour fermer la dette

Une décision, puis un lot distinct — pas celui-ci, qui devait **mesurer** un
produit déjà validé et non le réparer :

1. aligner la clé des entrées de chaîne du plan rapide sur celle que
   `runProviderChain` consomme ;
2. ajouter une preuve qui exécute réellement la jointure, plutôt que d'en
   constater la présence textuelle ;
3. redéployer, puis reprendre PERF-REAL-01 à partir de sa section « mesure ».

Tant que cela n'est pas fait :

- `PERF-REAL-01` = **OPEN**
- `REAL_PROVIDER_TTFI_PROVEN` = **NO**
- `RELEASE_READY` = **NO**

---

# PERF-REAL-01A — le bloquant est levé

**La dette n'est pas fermée pour autant. Six appels ne sont pas une mesure.**

```
BLOCKER               = RESOLVED
ROOT_CAUSE            = run / execute contract mismatch
REPAIR_DEPLOYMENT_ID  = 6ecc4c97-0d54-4c11-a32a-43e0ac802df9
REAL_FAST_PROVIDER_SMOKE = PASS
```

## La correction

Un mot. `runFastInteractionWithHaChain` construisait ses entrées de chaîne sous
la clé `run` ; elles sont désormais construites sous `execute`, le champ que
`runProviderChain` lit réellement. Les deux autres appelants de la chaîne — la
décision et les rôles OPRIE — l'employaient déjà : le contrat était canonique,
c'est l'appelant fautif qui s'y conforme.

Aucun alias de compatibilité n'a été ajouté. Deux noms pour une même chose
recréeraient exactement l'ambiguïté qui a coûté ce silence. `programming_error`
reste hors du repli, l'ordre `groq → anthropic → openai` est inchangé, et aucune
classe d'échec n'a été élargie pour faire passer quoi que ce soit.

## La preuve qui manquait

Ce qui avait fait défaut n'était pas un test de plus, c'était un test qui
**exécute**. Les preuves de PERF-03A et PERF-04 cherchaient le texte
`runProviderChain({ role: "fast_interaction"` dans la source ; il y était, et le
produit ne fonctionnait pas.

`T-PERFREAL01A-03` appelle maintenant la fonction du produit sans aucune clé
configurée et lit ce que la chaîne rapporte :

```
attempts = [
  { provider: "groq",      failure_class: "config_unavailable" },
  { provider: "anthropic", failure_class: "config_unavailable" },
  { provider: "openai",    failure_class: "config_unavailable" }
]
```

`config_unavailable` n'est produite qu'à l'intérieur d'un adaptateur, par le
`tagFailure` qui constate le secret absent. Voir les trois y figurer prouve que
le corps des trois adaptateurs a été atteint. Avec la clé fautive, `attempts` ne
contenait qu'une entrée, `programming_error`, produite par la chaîne elle-même.

## Le smoke réel

Six requêtes, une par classe de demande, sur la route déployée.

| Classe | HTTP | Durée | Type rendu |
| --- | --- | --- | --- |
| A_SIMPLE | 200 | 689,9 ms | ACKNOWLEDGE |
| B_VAGUE | 200 | 497,1 ms | ACKNOWLEDGE |
| C_RICHE | 200 | 212,9 ms | ACKNOWLEDGE |
| D_CONFIRMATION | 200 | 299,6 ms | ACKNOWLEDGE |
| E_ORIENTATION | 200 | 173,4 ms | ACKNOWLEDGE |
| F_DIFFICILE | 200 | 163,4 ms | ASK_CLARIFICATION |

Fournisseur atteint, journal du worker à l'appui :

```
{"event":"provider_ha_attempt","role":"fast_interaction","provider":"groq","attempt_index":0,"provider_order":["groq","anthropic","openai"]}
{"event":"provider_ha_success","role":"fast_interaction","provider":"groq","attempt_index":0,"previous_failures":[]}
```

Les six réponses portent exactement deux champs, `type` et `text`, avec un type
de la liste autorisée et un texte non vide. Aucune ne transporte de champ
d'autorité — le schéma ne peut pas en porter.

## Non-régression en production

| Vérification | Résultat |
| --- | --- |
| `/decision` après réparation | **200** en 1,19 s, réponse Groq authentique |
| `/fast-interaction` | **200**, schéma valide, fournisseur réel |
| CORS | inchangé, borné à l'origine du frontend |
| Artefact frontend | inchangé, `3efa45ff…a6dc` |

## Pourquoi la dette reste ouverte

Six appels établissent qu'un pipeline est **mesurable**. Ils n'établissent pas
ce qu'il vaut. Les durées ci-dessus vont de 163 à 690 ms et n'ont pas été prises
dans les conditions d'un échantillon : pas de plan de tirage, pas de séparation
froid/chaud, pas de répartition contrôlée, pas de trente points. Aucun p50 ni
p95 n'est donc prononcé, et le contrat interactif n'est ni déclaré tenu ni
déclaré manqué.

```
OFFICIAL_TTFI_BENCHMARK_PERFORMED = NO
PERF_REAL_01_BLOCKER_REMOVED      = YES
PERF_REAL_01_STATUS               = OPEN
```

Le lot suivant peut reprendre PERF-REAL-01 à sa section « mesure ».

---

# PERF-REAL-01B — la mesure réelle

**Verdict : DÉGRADÉ. `p95 = 3245 ms`, au-dessus des 3 000 ms du contrat. La dette
reste ouverte, et rien n'a été optimisé pour la refermer.**

## Le plan, arrêté avant de mesurer

| Paramètre | Valeur |
| --- | --- |
| Déploiement mesuré | `6ecc4c97-0d54-4c11-a32a-43e0ac802df9` |
| Classes | 6 — SIMPLE, VAGUE, RICHE, CONFIRMATION, ORIENTATION, INCONNU_VALIDE |
| Répétitions | 8 par classe |
| Échantillons officiels | 48 |
| Variantes de texte | 3 par classe, cyclées — jamais 48 fois la même phrase |
| Ordre | tour de rôle, jamais une classe en bloc |
| Chauffes | 3, exclues des officiels |
| Espacement | 700 ms, séquentiel |
| Horloge | `process.hrtime.bigint()`, monotone |
| Percentile | rang le plus proche : `index = ceil(p/100 × N)` sur la liste croissante |
| TTFI | envoi HTTP → candidate rapide valide reçue (réseau, worker, fournisseur, parsing, schéma) |

La méthode de percentile et les seuils ont été fixés **avant** le premier appel et
n'ont pas bougé après lecture.

## Les chiffres

| Mesure | Valeur |
| --- | --- |
| Échantillons | 48 |
| Succès | 47 |
| Échecs | 1 |
| Taux de succès | 97,9 % |
| TTFI min | 208,3 ms |
| **TTFI p50** | **472,9 ms** |
| **TTFI p95** | **3 245,3 ms** |
| TTFI max | 3 328 ms |
| TTFI moyen | 1 193,1 ms |

| Tranche | Échantillons |
| --- | --- |
| ≤ 1 s | 31 |
| 1 – 2 s | 5 |
| 2 – 3 s | 2 |
| 3 – 5 s | 9 |
| > 5 s | 0 |
| > 10 s | 0 |

La moyenne ne doit pas servir de consolation : 31 appels sur 47 rendent en moins
d'une seconde, et neuf dépassent trois secondes. C'est cette queue qui décide.

## Par classe

| Classe | n | succès | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- |
| SIMPLE | 8 | 8 | 387,0 ms | 3 293,0 ms | 3 293,0 ms |
| VAGUE | 8 | 8 | 419,8 ms | 3 195,2 ms | 3 195,2 ms |
| RICHE | 8 | 8 | 588,0 ms | 3 245,3 ms | 3 245,3 ms |
| CONFIRMATION | 8 | 8 | 413,7 ms | 3 239,8 ms | 3 239,8 ms |
| ORIENTATION | 8 | 7 | 527,5 ms | 3 328,0 ms | 3 328,0 ms |
| INCONNU_VALIDE | 8 | 8 | 472,9 ms | 3 177,9 ms | 3 177,9 ms |

Avec huit points par classe, un p95 vaut le maximum : ces colonnes sont
indicatives, pas robustes. Elles disent surtout une chose — **aucune classe n'est
lente en propre**.

## Ce que la queue dit vraiment

Onze des douze échantillons les plus lents portent les index de séquence 38 à 47,
c'est-à-dire la **fin du banc**. Les six classes y figurent, à parts comparables.
La lenteur est donc corrélée à la **position dans la série**, pas au type de
demande — et c'est le tour de rôle qui permet de le voir : une exécution par
blocs aurait fait passer cela pour un effet de classe.

Une explication compatible existe — la politique 429 / `Retry-After` de Groq,
documentée dans le worker, produirait exactement des paliers de l'ordre de trois
secondes sous charge accumulée. **Elle n'est pas établie** : l'attribution par
échantillon manque pour la démontrer, et ce rapport ne la présente pas comme
acquise.

## L'échec

Un échantillon sur 48 : `B005`, classe ORIENTATION, `error_class = NETWORK`,
254 517 ms avant abandon côté client. Ce n'est pas un TTFI lent, c'est un tour
qui n'a jamais abouti — il compte donc comme échec et sort des statistiques de
latence, sans sortir du taux de succès. Il n'a pas été retiré pour arranger le
p95 : le retirer ne changerait ni le p50 ni le p95, qui portent sur les succès.

## Fournisseur

| Élément | Valeur |
| --- | --- |
| Couverture d'attribution | **partielle** — 8 invocations sur 48 observées, plus 6 sondes dédiées |
| Cause | la session `wrangler tail` a expiré pendant le banc |
| Fournisseur observé | groq, sur les 14 invocations attribuées |
| Index de tentative | 0 sur les 14 |
| Bascules observées | aucune |

Les 40 échantillons non attribués ne sont pas comptés comme groq par défaut :
ils sont comptés comme non attribués. C'est une limite de l'instrumentation, pas
une donnée.

## Repli, épuisement, autorité, péremption

| Vérification | Résultat |
| --- | --- |
| Repli groq → anthropic | servi par anthropic |
| Repli groq + anthropic → openai | servi par openai |
| Ordre de repli | valide |
| Épuisement des trois | fermeture, `all_providers_failed`, aucun résultat fabriqué |
| Faux READY | 0 |
| Champs d'autorité refusés | 11 / 11 |
| `can_mark_ready` / `can_route` / `can_execute` | false / false / false |
| Candidate d'un tour révolu | périmée, 0 écriture visible |

## Navigateur

`BROWSER_MEASUREMENT_STATUS = NOT_AVAILABLE`, et c'est une conséquence des règles
de ce lot, pas un oubli. La politique CORS déployée n'admet qu'une origine,
`https://c-concept-dev.github.io` ; le frontend n'est pas déployé et ce lot
interdit de le déployer. Une sonde depuis `file://` est refusée au préflight :

```
Access to fetch at '…/fast-interaction' from origin 'file://' has been blocked
by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

Aucun patch du produit n'a été fait pour contourner cela — la consigne l'interdit,
et le contourner aurait mesuré autre chose que le produit.

## Verdict

```
PREFERRED_TARGET_MET              = YES   (p50 472,9 ms <= 2 000 ms)
INTERACTIVE_P95_CONTRACT_MET      = NO    (p95 3 245,3 ms > 3 000 ms)
DEGRADED_BAND                     = YES   (3 000 < p95 <= 5 000)
NON_CONFORMING                    = NO
CONTRACT_FAILURE_SAMPLE_COUNT     = 0     (aucun échantillon > 10 s)
REAL_PROVIDER_TTFI_PROVEN         = YES
PERF_REAL_01_STATUS               = OPEN / DEGRADED
```

La première interaction arrive vite la moitié du temps — moins de 500 ms — et le
contrat interactif porte sur le p95, pas sur la médiane. À 3 245 ms, il n'est pas
tenu. L'écart est de 245 ms, ce qui est peu ; le seuil n'a pas été déplacé pour
autant, et il ne le sera pas.

Rien n'a été optimisé ici. La suite est une décision produit, puis un lot
d'optimisation distinct — la queue positionnelle en est le premier suspect, et
elle mérite d'être attribuée avant d'être traitée.

---

# PERF-REAL-01C — la cause

**Prouvée. La queue de latence est portée en totalité par les 429 de Groq et
l'attente `Retry-After` que le worker honore. Rien n'a été optimisé.**

## Ce qui manquait pour le voir

`fetchGroqWithRetry` calculait déjà `retries` et `rate_limited_wait_ms`. Le
chemin de succès les **jetait** : seul le chemin d'épuisement les journalisait.
Une reprise réussie ne laissait donc aucune trace, et 01B n'avait aucun moyen
d'attribuer sa queue.

L'instrumentation ajoutée tient en une ligne de journal, `groq_call_observation`,
émise après l'appel, portant cinq nombres déjà calculés : statut HTTP, reprises,
attente de débit, attente du régulateur, latence fournisseur. Aucune décision ne
la lit, aucun délai n'est ajouté, aucun contenu utilisateur ni secret n'y figure.
Déploiement `81617950-d862-42fa-be5d-b04eb9ef5271`.

## Attribution complète

| Couverture | Valeur |
| --- | --- |
| Fournisseur | **48 / 48** |
| Index de tentative | **48 / 48** |
| Reprises | **48 / 48** |

La jointure est séquentielle et stricte entre le flux `wrangler tail` et les
appels émis — 52 invocations pour 52 appels (1 sonde froide, 3 chauffes, 48
officiels), **0 anomalie d'alignement** : la latence fournisseur observée reste
toujours inférieure ou égale au TTFI mesuré côté client.

## La cause, en un tableau

| | Sans reprise | Avec reprise |
| --- | --- | --- |
| Échantillons | 34 | 14 |
| p50 | 494,8 ms | 3 250,2 ms |
| **p95** | **1 535,3 ms** | **4 009,5 ms** |
| max | 2 009,6 ms | 4 009,5 ms |

Les 34 appels qui n'ont pas vu de 429 rendent un p95 de **1 535 ms**, soit la
moitié du budget contractuel. Les 14 qui en ont vu un rendent **4 009 ms**. Il
n'y a pas deux populations de demandes : il y a une population, et un péage.

Les douze échantillons les plus lents sont **exactement** les douze premiers
retriés. Aucune exception, aucun ex æquo à départager.

## Le mécanisme, bout à bout

1. Groq répond **429**.
2. Il annonce un `Retry-After` de **2 000 ms**.
3. Le worker y ajoute sa marge de sûreté, `safetyMarginMs = 750`, et attend donc
   **2 750 ms** — la même valeur sur les quatorze, sans variation.
4. La reprise réussit : **une seule** à chaque fois, jamais deux, `maxRetries`
   n'est jamais approché.
5. Le fournisseur suivant n'est jamais sollicité : un 429 repris n'est pas un
   échec, la chaîne HA ne bascule pas — et c'est le comportement correct.

Total d'attente imputable aux 429 sur la série : **38 500 ms**, soit 14 × 2 750.

## La progression

| Rang dans la série | p50 | p95 | 429 | reprises | attente 429 | latence fournisseur p50 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 – 12 | 506,1 ms | 2 009,6 ms | 0 | 0 | 0 ms | 442 ms |
| 13 – 24 | 518,1 ms | 1 136,2 ms | 0 | 0 | 0 ms | 442 ms |
| 25 – 36 | 918,6 ms | 3 421,0 ms | 5 | 5 | 13 750 ms | 779 ms |
| 37 – 48 | 3 046,2 ms | 4 009,5 ms | 9 | 9 | 24 750 ms | 2 958 ms |

Vingt-quatre appels sans un seul 429, puis cinq, puis neuf. La limite de débit
s'accumule au fil de la série — ce que 01B avait vu comme « la fin du banc » est
donc bien un effet de **débit cumulé**, et non de position, de classe, ni de
fatigue d'isolat.

## Les hypothèses, une par une

| Hypothèse | Verdict | Preuve |
| --- | --- | --- |
| H1 — limitation de débit fournisseur | **PROUVÉE** | 14 réponses 429 attribuées |
| H2 — 429 + `Retry-After` | **PROUVÉE** | 2 750 ms d'attente sur chacune des 14 |
| H3 — reprise / temporisation interne | **PROUVÉE** | exactement 1 reprise par échantillon lent |
| H4 — bascule de fournisseur | **REJETÉE** | 48 / 48 sur groq, `attempt_index` 0, aucune bascule |
| H5 — saturation / concurrence | **REJETÉE** | régulateur à 0 ms d'attente, banc strictement séquentiel |
| H6 — effet worker / isolat | **REJETÉE** | `wallTime` du worker ≈ latence fournisseur, à la milliseconde |
| H7 — réseau client | **REJETÉE** | TTFI ≈ `wallTime` : rien ne se perd entre le client et le worker |
| H8 — autre | — | aucune autre cause observée |

## L'échec réseau de 01B

Non reproduit : les 48 échantillons de ce banc ont abouti. Il reste **non
expliqué**, et n'est pas requalifié pour autant. Un incident unique sur 96 appels
cumulés ne se laisse pas diagnostiquer par absence.

## Ce que ce lot ne fait pas

Il ne corrige rien. La cause est connue, le levier est identifiable, et le choix
appartient au produit : réduire la pression sur Groq, revoir la marge de 750 ms,
basculer plus tôt, ou accepter la bande dégradée. Chacune de ces options change
un contrat — débit, repli ou seuil — et aucune ne se décide dans un lot de
diagnostic.

```
ROOT_CAUSE_RATE_LIMIT        = PROVEN
ROOT_CAUSE_RETRY_BACKOFF     = PROVEN
ROOT_CAUSE_FAILOVER          = REJECTED
ROOT_CAUSE_PROVIDER_LATENCY  = REJECTED
ROOT_CAUSE_NETWORK           = REJECTED
PERF_REAL_01_STATUS          = OPEN / DEGRADED
```

---

# PERF-REAL-01D — l'optimisation n'a pas eu lieu, et voici pourquoi

**Verdict : BLOQUÉ. Aucune optimisation conforme n'existe dans les contraintes du
lot, et la cause finale n'est pas un défaut de code : c'est une capacité
souscrite inférieure à la charge que le banc applique.**

## Ce que le lot supposait

Que le mécanisme de contrôle de débit M-03, déjà validé, puisse être raccordé au
chemin Fast pour prévenir les 429. L'audit montre que ce mécanisme n'a rien à
offrir à ce chemin — non par oubli de câblage, mais par décision d'architecture
documentée.

## L'audit

| Élément | Constat |
| --- | --- |
| Module | `workers/shared/provider-rate-control.js` (M-03) |
| Fonction d'attente | `createRateWindow().reserve()` |
| Fonction d'alimentation | `createRateWindow().recordWaitMs(waitMs)` |
| Consommateurs de `resolveProviderConcurrency` | 3 — tous des **lots** (pipelines Critic) |
| Consommateurs de `recordWaitMs` | **aucun, nulle part en production** |
| Fast avant | stimulateur **créé et attendu, mais inerte** |
| Fast après | inchangé |
| Type d'écart | **CONTRAT**, pas câblage |

Deux faits ferment la question.

**Le stimulateur n'est alimenté par personne.** `recordWaitMs` n'a aucun appelant
de production, sur aucun chemin. Ce n'est pas un oubli : c'est la correction
R2.1, qui a retiré la seule alimentation existante parce qu'elle repayait un
délai déjà écoulé. La fenêtre reste donc à zéro, et `pacer.before()` est un
no-op — les 48 échantillons le confirment, `rate_control_wait_total_ms = 0`.

**M-03 refuse d'inventer une fenêtre de débit**, et le dit dans son propre
en-tête : « Aucun quota commercial. […] Écrire ici un RPM, un RPS ou une rafale
reviendrait à inventer le contrat commercial d'une API qu'on n'a pas lu. » Pour
Groq, la protection qu'il déclare est `per_request_retry_after` — c'est-à-dire
exactement la reprise que 01C a mesurée. La seule autre capacité de M-03, la
concurrence bornée, s'applique à un **lot** d'appels ; le chemin Fast traite une
requête par invocation. Il n'y a rien à borner.

## Ce que le fournisseur déclare, et que personne n'avait lu

Le lot a relevé les en-têtes de débit de Groq — metadata seule, aucune décision
ne les lit.

| En-tête | Valeur |
| --- | --- |
| `x-ratelimit-limit-tokens` | **8 000 par minute** |
| `x-ratelimit-limit-requests` | 1 000 |
| `x-ratelimit-remaining-requests` | 985 au début, **934 à la fin** |
| `x-ratelimit-remaining-tokens` | 7 353 au début, **52 au plus bas** |
| `x-ratelimit-reset-tokens` | de 4,8 s à 15,5 s selon l'épuisement |

Trajectoire du budget de jetons, un échantillon sur quatre :

```
7353  6058  5038  3939  2976  2074  968  52  218  169  209  168  1300
```

**La contrainte qui mord est le budget de jetons par minute, pas le nombre de
requêtes.** Il restait 934 requêtes sur 1 000 quand le budget de jetons est tombé
à 52 sur 8 000.

## La cause finale

Le banc envoie 48 appels en une minute, à environ 300 jetons l'appel : il demande
de l'ordre de **14 000 jetons par minute à un compte qui en déclare 8 000**.

Les 429 ne sont donc pas un défaut à lisser. Ce sont la réponse correcte d'un
fournisseur à une demande supérieure à la capacité souscrite. **Aucun
stimulateur ne crée de jetons** : il ne peut que déplacer l'attente *avant*
l'appel au lieu de la subir *après* — ce que la section 30 du lot exclut
explicitement comme succès, puisque le verdict porte sur le TTFI total.

## Le rebenchmark, au protocole identique

48 échantillons, 6 classes × 8, tour de rôle, 3 chauffes, 700 ms, rang le plus
proche. Attribution **48/48** sur les quatre dimensions, 0 anomalie d'alignement.

| Mesure | 01C | 01D |
| --- | --- | --- |
| 429 | 14 | **21** |
| Reprises | 14 | 21 |
| Attente Retry-After totale | 38 500 ms | **49 750 ms** |
| Attente du contrôle de débit | 0 ms | **0 ms** |
| p95 | 3 406 ms | **3 394,9 ms** |

| | Sans reprise | Avec reprise |
| --- | --- | --- |
| Échantillons | 27 | 21 |
| p50 | 402,7 ms | 3 115,3 ms |
| **p95** | **529,3 ms** | **3 626,7 ms** |
| max | 533,7 ms | 3 641,8 ms |

Les deux populations sont **totalement disjointes** : le plus lent des non-repris
rend 534 ms, le plus rapide des repris 2 060 ms. Un appel qui ne heurte pas le
plafond répond en un demi-tiers de seconde ; un appel qui le heurte paie 2 750 ms
de péage. Il n'y a pas de continuum.

Davantage de 429 qu'en 01C — 21 contre 14 — parce que le budget était déjà
entamé au départ (7 353 jetons au lieu de 8 000). Le résultat est donc *pire*, à
protocole strictement identique, sans qu'une ligne de politique ait bougé.

Un détail que 01C n'avait pas pu voir : cette série porte **deux** attentes
distinctes, 1 750 ms (8 fois) et 2 750 ms (13 fois). Groq n'annonce donc pas
toujours la même chose — 1 000 ms ou 2 000 ms selon l'ampleur du dépassement. Ce
qui reste invariant est la marge : chaque attente vaut exactement l'annonce du
fournisseur plus les 750 ms du worker.

## Ce qui n'a pas été touché

`Retry-After`, la marge de 750 ms, `maxRetries`, l'ordre des fournisseurs, les
classes de repli, les délais d'expiration, les seuils du contrat, l'artefact
frontend. Rien. La seule modification du worker est le relevé metadata-only des
en-têtes, que `T-PERFREAL01D-14` vérifie comme non-autoritaire.

## Ce qui appartient maintenant au produit

Quatre voies, aucune décidable dans un lot d'optimisation technique :

1. **Augmenter la capacité souscrite** chez Groq. C'est la seule voie qui traite
   la cause sans rien changer au code.
2. **Réduire le coût en jetons d'un appel Fast** — le prompt système du plan
   rapide et son plafond de 512 jetons de complétion. Cela touche un contrat de
   contenu.
3. **Répartir la charge entre fournisseurs** au lieu de la concentrer sur Groq.
   Cela change l'ordre et la sémantique du repli, aujourd'hui purement technique.
4. **Accepter la bande dégradée** en constatant que 1,4 requête par seconde
   soutenue pendant une minute n'est pas le profil d'un utilisateur interactif —
   ce qui reviendrait à réviser le protocole de mesure, pas le produit.

Construire une fenêtre TPM à partir des en-têtes désormais relevés serait
techniquement possible et non inventé. Ce serait néanmoins un **changement
d'architecture** : M-03 a explicitement décidé de ne pas en avoir, et
l'autorisation de ce lot exclut « architecture change ». Cette option appartient
donc, elle aussi, à la décision produit.

```
FAST_RATE_CONTROL_BEFORE           = CONNECTED_BUT_INERT
FAST_RATE_CONTROL_AFTER            = CONNECTED_BUT_INERT
FAST_RATE_CONTROL_GAP_TYPE         = CONTRACT
RATE_LIMIT_OPTIMIZATION_EFFECTIVE  = NO
PERF_REAL_01D_PERFORMANCE_GATE     = FAIL
PERF_REAL_01_STATUS                = OPEN / DEGRADED
```
