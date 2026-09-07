# OBSERVABILITY-COMPLETENESS-01 — rapport de clôture canonique

**Verdict** : `OBSERVABILITY_COMPLETENESS_01 = GELÉ` · `RELEASE_GATE = AUTHORIZED`
**Commit déployé** : `800bcb2a7e554699a43bfbbd550046242ae7fd32`
**Version Worker déployée** : `7ae49ac1-bb61-4fb2-b35f-93655322803d`
**Corrélation durable** : `TERMINAL_MATCH_COUNT = 1` · `DURABLE_LOG_CORRELATION = PASS`

---

## A. Le défaut B-01B d'origine

Un tour sur vingt-six s'est terminé en **HTTP 502 sans aucun état sémantique**. La règle violée —
`recommended_treatment="question"` exige `impact="material"` — est partagée par les trois rôles via
`normalizeRoleIssues`. Le **rejet** était bien commun ; sa **classification** ne l'était pas.

Mesuré avant correctif, même issue, même règle :

| Rôle | Classe d'échec | Résultat client |
| --- | --- | --- |
| Analyste | `structured_output_invalid` | 200 `degraded_state` |
| Arbitre | `structured_output_invalid` | 200 `degraded_state` |
| Critique | `programming_error` | **502, aucun état** |

`parseRoleOutput` enveloppait l'Analyste et l'Arbitre et étiquetait tout échec de validation. Le
pipeline Critic n'étiquetait que ce qui portait un marqueur ; sans marqueur, la règle par défaut
s'appliquait — *une erreur non étiquetée est un défaut de NOTRE code* — et le client recevait un 502.

## B. Clôture de B-01B

La taxonomie tranchait d'elle-même : `STRUCTURED_OUTPUT_INVALID` couvre mot pour mot « la sortie
refusée par la validation structurelle ». Six lignes dans le validateur **partagé** :
`assertRoleIssueContract` pose le marqueur `output_contract_violation`, convention déjà en place
depuis CSR-01, lue sans jamais inspecter un message d'erreur.

`B01B_RULE_CHANGED = NO`. Aucun prompt, aucun schéma, aucun routage, aucun plafond.
**`B01B_STATUS = CLOSED`** — non rouvert par ce lot, 8/8 tests inchangés.

## C. Classification du 502 historique

`HISTORICAL_502_STATUS = PERMANENTLY_UNATTRIBUTABLE_DUE_TO_EVIDENCE_LOSS_AT_CAPTURE`

Latence 54 094 ms — **plus rapide que la totalité des 31 tours réussis** (minimum 70 678 ms) : un
avortement précoce, jamais un plafond d'horloge. Le journal `operational_request_error` de cette
invocation n'a pas été capté, et la charge utile n'avait volontairement pas été conservée. Aucun
rejeu ne peut attribuer rétroactivement cet événement. **Ne pas rouvrir.**

## D. La lacune d'observabilité — deux points, dont aucun n'est la durabilité plateforme

`observability.enabled=true` / `head_sampling_rate=1` était posé sur les trois Workers depuis le
2026-08-27 : les journaux durables existaient pendant toute la campagne. La preuve a été prise sur
`wrangler tail`, un flux vivant, qui n'a livré que 11 invocations sur 20 — et un second incident du
même type est déjà documenté (« la session wrangler tail a expiré pendant le banc »).

La lacune profonde : **aucun identifiant de corrélation n'existait**. Une réponse observée par le
client n'était joignable à aucun enregistrement serveur, même à 100 % de capture. Second point : le
`catch-all` n'écrivait que `{event, message}` — ni phase, ni rôle, ni fournisseur, ni classe d'échec.

## E. Conception de l'identifiant d'invocation

Minté **une seule fois** à l'entrée du gestionnaire : `cf-ray` s'il existe, sinon
`crypto.randomUUID()`. Estampillé dans chaque événement, rendu au client en en-tête
`X-Invocation-Id` sur **toutes** les réponses (avec `Access-Control-Expose-Headers`), et ajouté au
corps des **erreurs uniquement** — les formes de réponse en succès et en `degraded_state` sont
inchangées. Confirmé en production : l'identifiant **est** le ray id Cloudflare
(`a37486edac7cd0bf`, ray de réponse `a37486edac7cd0bf-CDG`).

## F. Contrat de l'enregistrement terminal

**Exactement un** enregistrement par invocation, sur les trois chemins terminaux (succès,
`degraded_state`, 5xx). Champs : `invocation_id`, `terminal_event`, `phase`, `role`, `provider`,
`model`, `provider_attempt_index`, `http_status`, `semantic_state`, `error_class`,
`untagged_exception`, `fallback_path`, `phases[]` (début et durée par phase), `total_duration_ms`,
`safe_error_fingerprint`, `journal_complete`.

Vocabulaire de phases fermé : `validate`, `analyst`, `critic`, `arbiter`, `state_check`.

Une **trace mutable** survit à toute levée — étiquetée ou non. C'est précisément le cas qui avait
mis l'enquête en échec : on ne peut pas se reposer sur l'étiquetage pour observer ce qui n'est pas
étiqueté.

## G. Correction de `journal_complete`

La première version testait `record[key] !== undefined` : une vérification de **présence**, pas de
**validité**. Écarts mesurés, avant correctif :

| Dégradation | `journal_complete` avant | après |
| --- | --- | --- |
| `invocation_id = null` ou `""` | true | **false** |
| `phase = null` | true | **false** |
| `http_status = null` ou non entier | true | **false** |
| `terminal_event` absent (forcé à true avant contrôle) | true | **false** |

Reconstruit en trois couches explicites, jamais une utilitaire opaque :

1. **Identité et situation**, toujours exigées : `invocation_id` non vide, `terminal_event === true`
   (l'égalité, pas la présence), `phase` non vide **et** dans le vocabulaire fermé, `http_status`
   entier dans la plage 100–599, `untagged_exception` booléen, `fallback_path` et `phases[]`
   réellement des tableaux.
2. **Contexte fournisseur**, conditionnel à un fait : `provider` / `model` /
   `provider_attempt_index` exigés **uniquement** si `providerAttemptOccurred()` est vrai — l'index
   n'étant posé que par l'absorption d'un événement `provider_ha_*` réellement émis. Une validation
   qui échoue avant tout appel n'est donc jamais déclarée incomplète faute de fournisseur.
3. **Preuves d'échec**, uniquement sur statut ≥ 400 : `error_class` non vide, empreinte dont la
   forme est vérifiée, et `untagged_exception === true` impose `error_class === "untagged"`. Un 200
   — succès comme `degraded_state` — n'a rien à prouver ici.

## H. Corrélation des tentatives fournisseur

Obtenue en faisant descendre le **même `log` estampillé** jusqu'à `runProviderChain`.
**`provider-ha.js` n'a pas été instrumenté** : il reste byte-identique, tout comme
`workers-ai/src/index.js`, qui ne sert pas `/operational-request`. Deux fichiers autorisés sont
restés inchangés parce qu'ils n'étaient pas nécessaires.

Vérifié de bout en bout : `provider=anthropic`, `model=claude-sonnet-4-6`, `attempt_index=1`,
`fallback_path=[{groq → anthropic, technical_failover}]`.

## I. Hygiène du message d'erreur

`error.message` **brut** n'est plus émis : un message de validation peut citer une valeur d'entrée.
À la place, `error.name` + SHA-256 du message + **nombre** de cadres de pile (jamais le texte de la
pile, qui porte des chemins de source). C'est une **réduction nette** de l'exposition, pas seulement
un ajout. Aucun prompt, aucun `original_request`, aucun texte de demande, aucun matériau secret.

## J. Tests

| Suite | Résultat |
| --- | --- |
| `OBS01` (observabilité + intégrité) | **34/34 PASS** |
| `B-01B` (`critic-b01b-failure-classification-cb01`) | **8/8 PASS**, inchangé |
| Suite globale | **2939/2939 PASS** |
| Scan de secrets | **CLEAN** |

Toutes les preuves sont `LOCAL_CONTROLLED` : **0 appel réseau, 0 appel fournisseur, 0 secret**.

Une garde a été **recadrée, pas affaiblie** (`T-HTMLFINAL02-08`) : l'outil de build conserve les
quatre motifs de non-déterminisme ; le bundle compilé interdit toujours `new Date()`,
`Math.random()` et `process.hrtime` ; seul `Date.now()` y est admis, parce que lire l'horloge à
l'**exécution** n'est pas une non-reproductibilité de **fabrication**. La reproductibilité réelle
reste prouvée empiriquement.

La preuve historique du lot B-01B **n'a pas été réécrite** : elle enregistre un état daté.

## K. Provenance du déploiement

Déployé depuis un **worktree détaché isolé** positionné exactement sur `800bcb2`, afin d'exclure les
trois commits sans rapport alors présents sur `main`. `main` n'a été ni réinitialisé, ni rebasé, ni
cherry-pické, ni amendé, ni poussé.

Un écart de taille de bundle (254,50 vs 254,32 KiB) a été instruit plutôt qu'ignoré : il provient
**entièrement de commentaires de chemin esbuild**, le worktree détaché n'ayant pas de `node_modules`
local. Commentaires retirés, les deux bundles ont la même empreinte :
`7321bd498dcebb520b5903cc44df5053a2045d34d399adc9bca5adc8c1cbdf23`.

Déviation assumée : wrangler **4.75.0 épinglé** du dépôt, au lieu de `npx` qui, depuis un worktree
hors racine, aurait téléchargé une 4.129.0 non validée.

| | |
| --- | --- |
| Worker | `atelier-decision-groq` |
| Version | `7ae49ac1-bb61-4fb2-b35f-93655322803d` |
| Déploiement | 2026-09-07T09:00:49.656Z UTC |
| Bindings | 4 variables d'environnement préservées ; `GROQ_API_KEY` référencée par NOM seulement |
| Suppression/remplacement de binding | aucun |

## L. Preuve durable Workers Logs

Sonde unique, **zéro fournisseur** : `POST /operational-request` avec `{"original_request":42}` et
l'Origin autorisée → **HTTP 400**, `X-Invocation-Id: a37486edac7cd0bf`, 0 appel fournisseur,
0 dépense.

Requête durable indépendante — `wrangler tail` n'a **jamais** servi de preuve, et aucun identifiant
n'a été créé, extrait ni réutilisé :

```text
invocation_id      = a37486edac7cd0bf
terminal records   = 1
event              = operational_request_terminal
terminal_event     = true
phase              = validate
http_status        = 400
journal_complete   = true
tentative fournisseur = aucune
```

Le statut et l'identifiant observés par le client correspondent exactement à l'enregistrement
durable.

## M. Verdict de gouvernance

```text
TERMINAL_MATCH_COUNT              = 1
DURABLE_LOG_CORRELATION           = PASS
OBSERVABILITY_COMPLETENESS_01     = GELÉ
RELEASE_GATE                      = AUTHORIZED
B01B_STATUS                       = CLOSED
HISTORICAL_502_STATUS             = PERMANENTLY_UNATTRIBUTABLE_DUE_TO_EVIDENCE_LOSS_AT_CAPTURE
DEPLOYED_COMMIT                   = 800bcb2a7e554699a43bfbbd550046242ae7fd32
DEPLOYED_VERSION                  = 7ae49ac1-bb61-4fb2-b35f-93655322803d
OBS01                             = 34/34
B01B                              = 8/8
GLOBAL                            = 2939/2939
SECRET_SCAN                       = CLEAN
```

### Note d'inventaire

Ce document est ajouté **après** le gel. Il n'est donc pas inscrit dans
`docs/RELEASE-MANIFEST.md`, dont l'inventaire décrit l'état gelé `800bcb2`. Régénérer le manifeste
ici aurait fait de ce commit autre chose qu'un commit de documentation, et aurait modifié un
artefact généré du lot gelé. Le manifeste sera réaligné lors de l'intégration, jamais ici.
