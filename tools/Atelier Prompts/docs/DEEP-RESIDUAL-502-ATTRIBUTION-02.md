# DEEP-RESIDUAL-502-ATTRIBUTION-02 — Auditer la mutation, puis conclure

Le lot précédent s'est arrêté sur une mutation externe. Celle-ci résolvait le problème qu'il
essayait de résoudre — mieux qu'il ne le faisait. Ce lot commence donc par la vérifier, sans la
croire sur parole.

---

## A. Phase A — a8f0131 est-il vraiment de l'observabilité seule ?

Comparaison byte-à-byte du sous-arbre `bbf8b52 → HEAD`. Vingt-cinq fichiers, dont **deux seulement
de runtime** :

| Catégorie | Fichiers | Impact sémantique |
| --- | --- | --- |
| Runtime | `operational-request-orchestrator.js` (+186 −7), `workers/groq/src/index.js` (+28 −1) | **aucun** |
| Généré | HTML canonique (+188 −9), `browser-runtime.generated.js` (+188 −9) | reflet du noyau embarqué |
| Tests | 17 fichiers, dont 1 nouveau (357 lignes) | — |
| Preuves / docs / manifeste | 4 | — |

**Ce qui n'a pas été touché du tout** — et c'est le cœur de la réponse :
`workers/shared/operational-request-core.js`, `core/adn/operational-request-state.js`,
`core/adn/index.js`, `workers/shared/provider-ha.js`, **byte-identiques**.

Les empreintes de la surface sémantique, calculées **aux deux révisions** :

| | bbf8b52 | HEAD |
| --- | --- | --- |
| `ANALYST_SYSTEM_PROMPT` | `d815ea1b13c31843` | `d815ea1b13c31843` |
| `CRITIC_GLOBAL_SYSTEM_PROMPT` | `8915d9bad81965ce` | `8915d9bad81965ce` |
| `ARBITER_SYSTEM_PROMPT` | `3120f05368961356` | `3120f05368961356` |
| Les trois schémas JSON | identiques | identiques |
| `ROLE_DEFINITIONS`, `PROVENANCE_VALUES`, `CANDIDATE_FIELDS` | identiques | identiques |
| `ROLE_PROVIDER_ORDER` / `FAST` / `DECISION` / modèle | `["anthropic"]` / `["groq"]` / inchangé / `claude-sonnet-4-6` | idem |

Ce que le code ajoute : un identifiant, une trace mutable, un enregistrement terminal, un résolveur
de modèle qui **relit** les constantes existantes sans en introduire aucune. Le flux de contrôle est
inchangé : mêmes conditions de 200/4xx/502, même séquence de rôles, même dégradation.

**Une nuance, dite plutôt que tue.** Les corps de réponse d'**erreur** gagnent un champ additif
`invocation_id`, et toutes les réponses de la route gagnent l'en-tête `X-Invocation-Id`. Le corps de
succès, lui, est identique à l'octet près. C'est délibéré : sans cela le client ne pourrait pas citer
la clé qui le concerne.

**Le HTML canonique** a bougé de +178 lignes — exactement le delta du runtime généré, ligne pour
ligne. Aucun markup, aucun style, aucun comportement d'interface.

---

## B. Les gardes — 15 auditées, 0 vidée, 1 restreinte

Treize gardes ne changent qu'une empreinte d'artefact. Deux méritent d'être regardées :

**`T-P04-EP10` — renforcée.** Une assertion sur le littéral `executeRole` est devenue deux : l'ordre
vient toujours de `resolveRoleProviderOrder(env)`, et le résolveur de modèle est vérifié en plus.

**`T-HTMLFINAL02` — restreinte, avec justification et compensation.** Avant, `Date.now()` était
interdit dans l'outil de build **et** dans le bundle compilé. Désormais il reste interdit dans
l'outil, et seul lui est admis dans le bundle — parce que mesurer la durée d'une phase à l'exécution
n'est pas un non-déterminisme de *fabrication*. Vérifié : les quatre occurrences dans le bundle sont
toutes dans `createExecutionTrace`/`buildTerminalRecord`. Deux compensations : aucune date de
fabrication dans l'en-tête du bundle, et `T-HTMLFINAL02-05` prouve **empiriquement** que le runtime
embarqué est le build courant, octet pour octet — une preuve plus forte que le motif retiré.

C'est le seul endroit où un motif auparavant interdit devient permis. Il est signalé comme tel.

---

## C. La clé de jointure

`invocation_id` = le `cf-ray` de Cloudflare quand il existe, sinon un UUID. Rendu au client en
en-tête `X-Invocation-Id` (toutes réponses) et dans le corps des réponses d'erreur. Estampillé sur
chaque événement passé au log de l'orchestrateur, **y compris les `provider_ha_*`**, sans toucher
`provider-ha.js`. Il ne dépend ni du contenu utilisateur, ni du matériau, ni de la sortie du modèle.

**Phase B — jointure 1:1 prouvée sur 3/3 tours contrôlés** : identifiant client → événements de rôle
(analyste, critique, arbitre) → enregistrement terminal, avec `http_status` et `semantic_state`
concordants et `journal_complete = true`.

**Limite de couverture, déclarée.** Trois événements ne portent pas la clé —
`isolate_observation`, `anthropic_usage_observation`, `anthropic_transport_error` — parce qu'ils sont
émis par la couche transport via `console.log` direct, hors du log estampillé. Cela ne gêne pas
l'attribution exigée ici (réponse client, requête serveur, événements de rôle, classification finale
sont tous joints), mais la couverture n'est pas totale et il vaut mieux le dire.

---

## D. Le magasin durable

`observability.enabled = true`, `head_sampling_rate = 1` sur `workers/groq/wrangler.jsonc`, **depuis
le commit de création du fichier**. Le magasin durable existait donc pendant toutes les campagnes
précédentes — ce que le lot précédent n'avait pas vérifié avant de bâtir un contournement.

**Mais il n'est pas interrogeable depuis cet environnement** : l'API
`/workers/observability/telemetry/query` répond `Authentication error` (code 10000) avec le jeton
OAuth de wrangler, dont les portées n'incluent pas la lecture d'observabilité ; et wrangler 4.75
n'expose aucune sous-commande de requête durable, seulement `tail`, qui est un flux vivant.

La capture est donc restée sur `tail` — mais la conclusion ne repose plus sur sa complétude : chaque
tour est joint par sa clé, et un tour manquant serait *identifiable* au lieu d'être silencieux.
C'était précisément le défaut qui avait rendu le 502 inattribuable.

---

## E. Phase C — la campagne

Vingt tours, population inchangée (14 × le cas du 502 résiduel, 6 × le cas matériau), Anthropic,
`claude-sonnet-4-6`, aucun épinglage, séquentiel.

| Compteur | Valeur |
| --- | --- |
| `RUN_COUNT_COMPLETED` | 20 |
| **`FULLY_CORRELATED_RUNS`** | **20 / 20** |
| `CORRELATION_COMPLETENESS_RATE` | **1,00** |
| **`HTTP_502_COUNT`** | **0** |
| `PROGRAMMING_ERROR_COUNT` | 0 |
| `UNHANDLED_EXCEPTION_COUNT` | 0 |
| `STRUCTURED_OUTPUT_INVALID_COUNT` | 0 |
| `PROVIDER_TRANSPORT_ERROR_COUNT` | 2 |
| `B01B_VIOLATION_COUNT` | **0** |
| `DEGRADED_STATE_COUNT` | 2 |
| `FALSE_READY_COUNT` | 0 |
| `DEEP_GROQ_CALL_COUNT` / `DEEP_OPENAI_CALL_COUNT` | **0 / 0** |

`provider_order` observé à chaque tentative : `["anthropic"]`. Modèle observé : `claude-sonnet-4-6`.

**Les deux dégradations sont attribuées, pas constatées.** Tours 13 et 20, toutes deux sur le
Critique : `anthropic_transport_error` → `technical_failover` → chaîne épuisée (un seul fournisseur)
→ `degraded_state` en HTTP 200. Aucun repli, aucun READY fabriqué, `journal_complete = true`. C'est
le contrat fail-closed qui s'exécute, sur le chemin réel, avec la preuve jointe.

---

## F. Verdict

`OUTCOME = NO_502_REPRODUCED`, avec **20/20 tours pleinement corrélés**.

Le 502 d'origine reste non attribué **en tant qu'événement** : il ne s'est jamais reproduit, et sa
trace n'a jamais existé. Ce qui a changé n'est pas qu'on l'ait expliqué, c'est qu'il ne pourrait plus
échapper à l'explication. Sur 52 tours réels depuis la fermeture de B-01B, il reste une occurrence
unique et non reproduite.

Ce qui est prouvé, et qui répond à la vraie question : quand un incident survient, Atelier le classe
et le ferme correctement — les deux pannes de transport de cette campagne en sont la démonstration
directe, attribuées par la clé, du client jusqu'à l'enregistrement terminal.

---

# REPRISE SUR 800bcb2 — LE 502 S'EST REPRODUIT, ET IL A UN NOM

Le lot reprend sur `800bcb2` (HEAD `a19210b`, sous-arbre Atelier byte-identique). Cette fois le
résidu s'est reproduit — et la clé de jointure a fait exactement ce pour quoi elle avait été posée.

## G. Delta court `f220099 → 800bcb2` — observability-only, confirmé

Vingt fichiers, **un seul de runtime** : `operational-request-orchestrator.js` (+99 −4). Inchangés :
`operational-request-core.js`, `operational-request-state.js`, `core/adn/index.js`, `provider-ha.js`,
`workers/groq/src/index.js`, `wrangler.jsonc`.

Le changement est exactement un : `record.journal_complete = TERMINAL_RECORD_REQUIRED_FIELDS.every(k => record[k] !== undefined)`
devient `computeJournalComplete(record)`, plus cinq prédicats exportés. Une vérification de
**présence** devient une vérification de **validité**.

`journal_complete` n'est lu par **aucun** flux : une seule écriture, dans `buildTerminalRecord`,
aucune lecture conditionnelle. Le champ ne peut pas modifier une réponse.

Le HTML canonique bouge de +90 lignes — **exactement** le diff du runtime généré, comparé ligne à
ligne. Aucun markup.

## H. Le signal peut désormais échouer — 15/15

Appel direct de `computeJournalComplete` sur quinze enregistrements construits, hors suite de tests :

| Entrée | Attendu | Obtenu |
| --- | --- | --- |
| référence valide | `true` | `true` |
| `invocation_id` = `null` / `""` / `"   "` | `false` | `false` |
| `phase` = `null` / hors vocabulaire | `false` | `false` |
| `http_status` = `null` / `999` | `false` | `false` |
| `terminal_event` absent | `false` | `false` |
| `phases` vide · `semantic_state` absent | `false` | `false` |
| 502 sans `error_class` · empreinte invalide · `untagged` mal nommé | `false` | `false` |
| 502 valide | `true` | `true` |

Les cinq états que le commit dit avoir mesurés faux avant correctif rendent bien `false`.

## I. Campagne finale — 20 tours sur `800bcb2`

| Compteur | Valeur |
| --- | --- |
| `FULLY_CORRELATED_RUNS` | **20 / 20** |
| `ATTRIBUTION_EVALUABLE_RUNS` | **20 / 20** (jointure **et** `journal_complete` valide) |
| `HTTP_502_COUNT` | **1** |
| **`HTTP_502_ATTRIBUTED_COUNT`** | **1** |
| `HTTP_502_UNATTRIBUTED_COUNT` | **0** |
| `DEGRADED_STATE_COUNT` | 1 (`technical_failover`) |
| `FALSE_READY_COUNT` · `DEEP_GROQ_CALL_COUNT` · `DEEP_OPENAI_CALL_COUNT` | 0 · 0 · 0 |

**Une correction de ma propre mesure.** Le critère initial exigeait qu'aucun identifiant étranger
n'apparaisse dans la fenêtre de capture, et donnait 19/20. C'était une propriété de
l'*environnement* — l'absence de trafic concurrent sur un Worker de production — pas de la jointure.
Le tour 8 avait simplement capté, au passage, **une invocation tierce** (un événement, un
enregistrement terminal, identifiant inconnu). C'est précisément ce que la clé sert à rendre
inoffensif : elle se filtre. Critère corrigé → **20/20**, et 20 identifiants clients distincts.

## J. Le 502, attribué

Tour 11. Ce que le journal dit, sans que rien ne soit deviné :

```
phase=critic role=critic provider=anthropic model=claude-sonnet-4-6
  appels Critique : 262, 950, 1151 jetons — finish_reason=tool_use, AUCUNE troncature
provider_ha_failure    failure_class=programming_error
provider_ha_fail_closed remaining_providers=[]
terminal: http_status=502 semantic_state=null error_class=untagged untagged_exception=true
          safe_error_fingerprint={ error_name:"TypeError", frame_count:10, message_sha256:… }
          journal_complete=true
```

**Établi.** Les trois appels fournisseur du Critique ont réussi : la levée est dans le *traitement*
de la sortie, pas dans son obtention. `TypeError` — et dans le noyau, `assert()` lève exactement
`new TypeError(message)`. L'exception atteint le catch-all **sans étiquette**, d'où
`programming_error`, d'où fail-closed, d'où 502 sans état. Aucun repli, aucun READY fabriqué.

**Non établi, et je ne vais pas le combler par déduction.** *Quel* validateur a levé. L'empreinte
est un SHA-256 du message ; j'ai testé 65 messages littéraux d'`assert` du noyau, 97 variantes
d'identifiant du message B-01B et 38 gabarits interpolés — **aucune correspondance**. Donc : ce n'est
pas B-01B pour les identifiants testés, et ce n'est aucun des messages fixes connus. Au-delà, la
classe seule est établie.

**Et donc : notre bug, ou sortie de modèle non conforme ?** Indéterminé. C'est exactement
l'ambiguïté que le lot B-01B avait tranchée pour *une* règle et laissée ouverte pour les autres
rejets de `validateCriticOutput` — en écrivant que l'hypothèse « seconde classe de rejet encore mal
étiquetée » avait « un nom précis et une adresse ». Cette campagne la confirme sans la nommer.

**Une limite de mesure à dire clairement** : `B01B_VIOLATION_COUNT = 0` est désormais mesuré à
l'aveugle. L'enregistrement terminal ne porte plus le message brut, seulement son empreinte. Ce 0
signifie « aucune correspondance parmi 97 identifiants testés », pas « aucune violation possible ».
La preuve de fermeture de B-01B reste celle de son lot dédié.

## K. Verdict

`FINAL_OUTCOME = 502_REPRODUCED_ATELIER_DEFECT`.

Le cahier des charges dit qu'un incident attribué et contractuellement fail-closed n'est pas
automatiquement bloquant — et celui-ci **est** attribué et **est** fail-closed. Mais il liste aussi,
comme bloquants, le « défaut Atelier reproductible » et la « mauvaise classification ». Ce 502 est
une `TypeError` levée par **notre propre code** en traitant une réponse fournisseur réussie, non
étiquetée, qui revient à environ **4 % des tours** sur trois campagnes indépendantes (1/20 ici,
1/26 et 1/32 avant). Un utilisateur sur vingt-cinq reçoit un 502 sans aucun état.

Je ne le déclare pas acceptable. Ce qui a changé, et c'est considérable, c'est qu'il n'est plus
invisible : phase, rôle, fournisseur, modèle, classe d'exception, empreinte et durées par phase sont
désormais joints à la réponse du client par une seule clé. Le prochain lot n'aura pas à le chercher.
