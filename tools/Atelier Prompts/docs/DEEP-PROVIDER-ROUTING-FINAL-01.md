# DEEP-PROVIDER-ROUTING-FINAL-01 — La décision était prise. Le runtime ne l'appliquait pas.

« FAST = GROQ ONLY, DEEP = ANTHROPIC ONLY » était acté depuis plusieurs lots, écrit dans les
rapports, invoqué dans les décisions. Le code, lui, envoyait toujours le plan profond sur Groq en
premier. ANTHROPIC-DEEP-CAPACITY-01 l'a mesuré sans détour : **six tours sans épinglage,
ANTHROPIC_NATIVE = 0/6**.

Ce lot ne décide rien. Il applique.

---

## A. Ce qui a changé — une ligne

| | Avant | Après |
| --- | --- | --- |
| `ROLE_PROVIDER_ORDER` | `["groq", "anthropic", "openai"]` | `["anthropic"]` |
| `FAST_PROVIDER_ORDER` | `["groq"]` | `["groq"]` — inchangé |
| `DECISION_PROVIDER_ORDER` | `["groq", "anthropic", "openai"]` | inchangé — **autre plan, hors périmètre** |

Aucun prompt, aucun schéma, aucun validateur, aucune règle sémantique n'a été touché.
`workers/shared/operational-request-core.js` n'a pas changé d'un octet — l'empreinte de l'artefact
HTML canonique le prouve : elle est identique avant et après.

---

## B. Le périmètre, et ce qui en a été tenu à l'écart

| Question | Réponse |
| --- | --- |
| Prompts modifiés | **non** |
| Latence Deep optimisée | **non** — hors périmètre, explicitement (voir § I) |
| Plafond `ROLE_MAX_OUTPUT_UNITS = 2048` corrigé | **non** — documenté, non corrigé |
| Comparaison de fournisseurs | **non** — elle a eu lieu dans les lots précédents |
| Nouveau sous-système | **non** |
| Règle sémantique dépendant d'un fournisseur | **aucune** — vérifié par test |
| Frontend | **non déployé**, aucun changement d'UX |

---

## C. Pourquoi la chaîne n'a pas seulement été réordonnée

Un repli aurait suffi à garder de la disponibilité. Il a été écarté pour une raison précise : le plan
profond a été **qualifié** sur un modèle. Basculer en cours de route reviendrait à changer de juge au
milieu du procès — la sortie servie ne serait plus celle dont la sémantique a été mesurée.

La conséquence est assumée et fermée : **si Anthropic échoue, la chaîne se ferme.**
`runProviderChain` épuise sa liste, remonte une `ProviderChainError`, et l'orchestrateur la traduit
en `degraded_state`. Jamais un READY fabriqué, jamais un verdict inventé. Le § G le mesure.

---

## D. L'épinglage de mesure ne peut plus détourner la production

`resolveRoleProviderOrder` dérive ses valeurs permises de `ROLE_PROVIDER_ORDER`, au lieu de les
écrire en dur. Depuis que la liste ne contient plus qu'Anthropic :

| `DEEP_BENCH_PROVIDER` | Résultat |
| --- | --- |
| absent | `["anthropic"]` |
| `"ha"` (valeur déclarée du Worker) | `["anthropic"]` |
| `"anthropic"` | `["anthropic"]` |
| `"groq"` | **refusé** — `contract_error` |
| `"openai"` | **refusé** — `contract_error` |

Un épinglage résiduel oublié dans une configuration ne peut donc plus renvoyer silencieusement la
production sur le fournisseur qu'on vient d'écarter : il casse bruyamment. C'est le comportement
voulu — une mesure qui traîne doit se voir.

**`RESIDUAL_BENCH_PIN` = 0.** `workers/groq/wrangler.jsonc` déclare `DEEP_BENCH_PROVIDER: "ha"`, et
le déploiement l'a confirmé dans ses bindings.

---

## E. Le routage statique

Relevé dans `evaluation/deep-provider-routing-final-01/routing-static.json`, recalculé depuis le
module lui-même, jamais recopié à la main.

| Plan | Constante | Ordre | Résolveur |
| --- | --- | --- | --- |
| Rapide | `FAST_PROVIDER_ORDER` | `["groq"]` | `resolveFastProviderOrder` |
| Profond | `ROLE_PROVIDER_ORDER` | `["anthropic"]` | `resolveRoleProviderOrder` |
| `/decision` | `DECISION_PROVIDER_ORDER` | `["groq","anthropic","openai"]` | hors périmètre |

`DEEP_GROQ_IN_ORDER = NO`. `DEEP_OPENAI_IN_ORDER = NO`. Modèle : `claude-sonnet-4-6`.

---

## F. Le chemin réel, sans aucun épinglage

Dix tours Deep complets sur `/operational-request`, **aucun épinglage de mesure**, cinq avec
matériau et cinq sans. Attribution relevée dans `wrangler tail --format=json`, sur les événements
`provider_ha_attempt` / `provider_ha_success` que le Worker émettait déjà — aucune instrumentation
ajoutée. Onze tours tombent dans la fenêtre : les dix du protocole, plus la sonde manuelle qui a
servi à vérifier que l'endpoint répondait.

| Rôle | Tentatives | Anthropic | Groq | OpenAI |
| --- | --- | --- | --- | --- |
| Analyste | 11 | **11** | 0 | 0 |
| Critique | 11 | **11** | 0 | 0 |
| Arbitre | 11 | **11** | 0 | 0 |

`provider_order` observé à **chacune** des 33 tentatives : `["anthropic"]`. Pas une seule fois autre
chose.

**`DEEP_GROQ_CALLS = 0`** · **`DEEP_OPENAI_CALLS = 0`**

Latence des dix tours : min 87,4 s · p50 93,0 s · max 132,0 s.

### Ce que ces dix tours ont aussi montré, et qui n'est pas corrigé ici

| État final | n |
| --- | --- |
| `clarification_required` | 5 |
| `degraded_state` | **4** |
| `operational_request_ready` | 1 |

Les quatre dégradations ont **toutes** la même cause, et elle est déjà connue : l'Arbitre a rendu une
sortie que le validateur canonique rejette — `structured_output_invalid`, quatre fois sur onze.
ANTHROPIC-DEEP-CAPACITY-01 en avait établi la cause : le plafond `ROLE_MAX_OUTPUT_UNITS = 2048`
tronque les sorties longues de l'Arbitre.

Ce lot n'a pas le droit d'y toucher, et n'y a pas touché. Mais il faut dire précisément ce qu'il a
changé pour ce défaut : **rien, sauf sa visibilité.** Sous l'ancien routage, un Arbitre Anthropic
défaillant basculait vers un autre fournisseur et le tour aboutissait quand même — le plafond était
masqué par le repli. Sans second fournisseur, l'échec ne bascule plus : il dégrade, proprement, et se
voit. C'est le comportement voulu (§ C), et c'est aussi la preuve que le fail-closed du § G n'est pas
seulement vrai en harnais : il s'est produit quatre fois sur le chemin réel, sans jamais fabriquer un
READY ni un verdict.

**Le taux de dégradation observé n'est pas un résultat de ce lot à accepter tel quel.** Il appelle
une décision du propriétaire sur le plafond 2048 — `OWNER_DECISION_PENDING`, pas un micro-lot
automatique.

---

## G. Contrôle de panne — la chaîne se ferme, elle ne bascule pas

Harnais **contrôlé** : `fetch` remplacé localement, aucun incident réel provoqué chez le
fournisseur. Trois formes de panne, le tour complet à chaque fois.

| Scénario | Hôtes contactés | Groq | OpenAI | État rendu | READY fabriqué |
| --- | --- | --- | --- | --- | --- |
| Transport injoignable | `api.anthropic.com` | 0 | 0 | `degraded_state` | non |
| HTTP 500 | `api.anthropic.com` | 0 | 0 | `degraded_state` | non |
| HTTP 429 | `api.anthropic.com` | 0 | 0 | `degraded_state` | non |

Dans les trois cas, la réponse ne porte que `{state, role, reason}` — la forme canonique d'un
`DegradedRoleResult`. Aucun état sémantique, aucune question, aucun candidat.

`FAILOVER_TO_GROQ = NO` · `FAILOVER_TO_OPENAI = NO` · `FABRICATED_READY = NO` · `FAIL_CLOSED = OUI`

---

## H. Ce qui reste de l'ancienne haute disponibilité — inventaire, sans campagne de nettoyage

Le mécanisme de chaîne **n'est pas mort** : `/decision` l'exerce toujours sur trois fournisseurs.
Ce qui est devenu inatteignable, c'est le chemin Groq/OpenAI **du plan profond**. Rien n'a été
supprimé — supprimer une garde parce que son chemin est momentanément fermé, c'est la perdre le jour
où on le rouvre.

| Élément | Statut après ce lot | Décision |
| --- | --- | --- |
| `GENERIC_ROLE_ADAPTERS.groq` → `runRoleWithGroq` | inatteignable depuis le plan profond | conservé, testé |
| `GENERIC_ROLE_ADAPTERS.openai` → `runRoleWithOpenAI` | inatteignable depuis le plan profond | conservé, testé |
| `CRITIC_PIPELINES.groq` → `runCriticWithGroq` | inatteignable depuis le plan profond | conservé, testé |
| `CRITIC_PIPELINES.openai` → `runCriticWithOpenAI` | inatteignable depuis le plan profond | conservé, testé |
| `ROLE_GROQ_RETRY_POLICIES` (3 rôles) + borne d'attente HA-03 | inatteignables depuis le plan profond | conservées, testées |
| `runCriticWithGroqFanOut` | déjà inactif **avant** ce lot (HA02-C8) | inchangé |
| `DEEP_BENCH_PROVIDER` = `"groq"` / `"openai"` | refusés | changement voulu (§ D) |

Aucun de ces éléments n'est du code mort au sens strict : ils restent atteignables par un appelant
qui passe un ordre explicite, et c'est exactement ce que font les tests de mécanique.

**`DEAD_CODE_CLEANUP_PERFORMED = NO`** — l'inventaire est le livrable, pas la suppression.

---

## I. Deux conséquences mesurées, non corrigées ici

**1. La latence Deep augmente.** Sous l'ancien routage, Groq servait les trois rôles et un tour
tenait autour de 21 s. Servi par Anthropic, le même tour tient autour de **93 s au p50** (§ F). Ce
n'est pas une régression introduite par ce lot : c'est le coût, jusqu'ici masqué par le repli, du
fournisseur qui avait été choisi. **`DEEP_LATENCY_OPTIMISED = NO`** — hors périmètre, explicitement.

**2. `ROLE_MAX_OUTPUT_UNITS = 2048` reste tel quel.** ANTHROPIC-DEEP-CAPACITY-01 a prouvé que ce
plafond provoque des `structured_output_invalid` sur les sorties longues. Le § F le montre à l'œuvre :
**4 tours sur 10 dégradés, tous sur l'Arbitre, tous pour cette raison**. Il n'est **pas** corrigé
ici : documenté, non touché.

Les deux appellent une décision du propriétaire, pas un micro-lot automatique.

---

## J. Les tests

Un fichier nouveau, `tests/deep-provider-routing-final-dprf01.test.mjs`, sept tests :

| Test | Ce qu'il garde |
| --- | --- |
| T-DPRF01-01 | Fast = Groq seul, Deep = Anthropic seul, `/decision` intact |
| T-DPRF01-02 | ni Groq ni OpenAI dans l'ordre profond, source comprise |
| T-DPRF01-03 | sans aucune variable d'environnement, la résolution rend Anthropic |
| T-DPRF01-04 | un épinglage vers Groq ou OpenAI est **refusé**, pas appliqué |
| T-DPRF01-05 | Analyste, Critique et Arbitre ne contactent qu'`api.anthropic.com` |
| T-DPRF01-06 | panne Anthropic → `degraded_state`, aucune bascule, aucun READY fabriqué |
| T-DPRF01-07 | aucune règle sémantique ne branche sur un nom de fournisseur |

**Douze fichiers existants ont été réalignés**, jamais affaiblis. Trois traitements distincts,
choisis selon ce que le test gardait :

- Les tests qui **affirmaient l'ordre de production** ont été mis à la valeur courante, avec un
  commentaire disant ce qui a changé et quand. Ce que ces lots affirmaient — qu'*eux* n'avaient rien
  touché — reste vrai et reste prouvé.
- Les tests qui vérifiaient la **mécanique de chaîne** (HA-02, HA-03, CSR-01) passent désormais
  l'ordre explicitement. Ils gardent exactement ce qu'ils gardaient : même prompt et même schéma chez
  chaque fournisseur, aucun model shopping, aucun mélange dans un même `CriticOutput`, fail-closed.
- Les tests qui empruntent le **vrai routage HTTP** (ORCH-01, X2-BATCH-R1, endpoints de rôle) ont été
  portés sur la forme Anthropic. Les épingler sur Groq les aurait gardés verts en leur retirant ce
  qui les rendait utiles.

Un seul test a changé de niveau : **ORCH01-14b**, qui prouvait qu'un rôle basculé n'impose pas son
fournisseur aux suivants. Avec un fournisseur unique, cet invariant n'est plus observable sur la
route HTTP. Il est vérifié là où la mécanique subsiste, plutôt que affaibli pour rester vert.

---

## K. Vérifications

| Contrôle | Résultat |
| --- | --- |
| Suite globale ×3 séquentielles | **2889 / 2889** |
| Plages gelées (7 empreintes) | **inchangées** |
| Runtime navigateur reconstruit | idempotent, HTML canonique **inchangé** |
| Balayage de secrets | aucune valeur, seulement des noms de binding |
| `DOMAIN_HARDCODING_COUNT` | 0 |
| `SCENARIO_HARDCODING_COUNT` | 0 |
| `CASE_ID_RUNTIME_LOGIC_COUNT` | 0 |
| `PROVIDER_SPECIFIC_SEMANTIC_RULE_COUNT` | 0 |
| `RAW_MATERIAL_LOGGING_COUNT` | 0 |

---

## L. Preuves

`evaluation/deep-provider-routing-final-01/`

| Fichier | Contenu |
| --- | --- |
| `routing-static.json` | ordres résolus, épinglages refusés, empreintes |
| `runtime-runs.jsonl` | les tours réels, sans épinglage |
| `runtime-providers.json` | attribution par rôle, extraite de `wrangler tail` |
| `failure-control.json` | les trois scénarios de panne contrôlée |
| `summary.json` | synthèse des compteurs du lot |
| `README.md` | quoi est quoi |
