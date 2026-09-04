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
