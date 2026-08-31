# MONO-08 v0.6 — Delegated LLM Authentication — Cahier des charges

**Statut du document : CDC uniquement. Pas de code. Pas de modification de MONO-08 v0.5.
Pas de Worker créé. Pas de preflight relancé. Pas de Real Smoke.**

Rédigé sous gouvernance stricte, en tant qu'ingénieur principal d'implémentation
EvidenceForge, à partir de l'audit contractuel déjà validé sur MONO-08 v0.5.

## 0. Rappel de contexte (gelé, non modifié par ce document)

```text
MONO-00 → MONO-07  = GELÉS / INCHANGÉS
MONO-08 v0.5        = CHECKPOINT TECHNIQUE FIGÉ / NON GELÉ / LIMITE CONTRACTUELLE
                       CONFIRMÉE SUR L'AUTH LLM
REAL SMOKE           = NOT_RUN
MONO-09 / JMMJS       = INTERDIT
```

Baseline canonique à retenir pour tout contrôle d'intégrité (cf.
`BASELINE-CANONIQUE.md`) :

```text
MONO-07      = 967735259b3e512340b6086e547ee16b61444694afe6ef2c5121982b239cdf4b
MONO-08 v0.5 = 42b10a0b984aba3828e74ec86565ef2d1ffab0f457b90ba57d310d927af31d49
```

La paire `501442...`/`17a9cc...` reste une lignée de packaging antérieure, non
canonique. Ce sujet n'est pas rouvert par ce document.

---

## 1. Problème contractuel

### 1.1 Constat

Le preflight officiel de MONO-08 v0.5 (`lib/preflight.js`, `lib/real-provider-configs.js`,
tous deux non modifiés) traite le provider `llm-worker` avec un seul contrat
d'authentification, quelle que soit la cible réellement configurée via
`LLM_WORKER_BASE_URL` :

- `credentialRequired: true`
- `credentialEnvVar: "ANTHROPIC_API_KEY"`
- la fonction `probe()` lit toujours `env.ANTHROPIC_API_KEY` **localement**, construit
  elle-même le header `x-api-key`, et l'envoie à `llmBase + "/v1/messages"` — que
  `llmBase` soit `https://api.anthropic.com` (défaut) ou un Worker Cloudflare tiers ;
- dans `checkProvider()`, si `ANTHROPIC_API_KEY` est absent localement,
  `credentialProbeSkipped=true` est positionné **avant même l'examen du code HTTP réel
  renvoyé par la cible**, et le statut est mécaniquement classifié
  `AUTHENTICATION_BLOCKED` / `NO_CREDENTIAL`.
- `lib/real-provider-configs.js` (chemin du vrai run, `buildRealProviderConfigs`)
  reproduit le même contrat pour le Gateway MONO-04 : `requiredSecret: "ANTHROPIC_API_KEY"`,
  header `x-api-key` construit côté client, quelle que soit la cible.

### 1.2 Pourquoi v0.5 ne suffit pas

Le contrat actuel suppose implicitement un seul mode d'authentification :

> le processus qui exécute EvidenceForge (preflight ou vrai run) doit lui-même détenir
> `ANTHROPIC_API_KEY` et l'envoyer directement au serveur cible.

Cette hypothèse est correcte pour un appel direct à `api.anthropic.com`, mais devient
un **faux négatif structurel** dès que la cible réelle est un Worker Cloudflare qui
détient et injecte lui-même `ANTHROPIC_API_KEY` côté serveur (architecture « delegated »).
Dans ce cas :

- le runtime EvidenceForge n'a **jamais** besoin de connaître `ANTHROPIC_API_KEY` — et
  ne devrait structurellement pas le pouvoir, pour raison de sécurité (moindre
  privilège) ;
- pourtant le preflight v0.5 le classe systématiquement `AUTHENTICATION_BLOCKED` par
  absence de `ANTHROPIC_API_KEY` local, **avant même d'inspecter la réponse réelle du
  Worker**.

### 1.3 Preuve expérimentale à l'appui (déjà obtenue, aucun run supplémentaire requis pour ce CDC)

Mesuré sur Mac natif (réseau réellement fonctionnel vers OpenAlex via Worker Cloudflare,
Crossref direct, PubMed direct — tous `HTTP 200` réels) :

```text
Worker Anthropic :
  hostReachable=true
  probe.reached=true
  HTTP 400
  denyReason=null

Preflight officiel MONO-08 v0.5 :
  rawClassification = NO_CREDENTIAL
  status            = AUTHENTICATION_BLOCKED
  reason            = ANTHROPIC_API_KEY absente localement
  official_preflight_exit_code = 2
  PREFLIGHT_READY   = NO
```

Le Worker a été **réellement atteint** (le réseau fonctionne, contrairement aux tours
précédents dans l'environnement Claude Code distant) et a **réellement répondu**
(`HTTP 400`, pas un timeout ni un blocage réseau). Le statut `AUTHENTICATION_BLOCKED`
n'a donc pas pour cause un problème réseau ni un Worker défaillant : il est
**mécaniquement forcé par le code v0.5 lui-même**, qui n'inspecte jamais la réponse
réelle du Worker dès lors que `ANTHROPIC_API_KEY` est absent en local — conforme à la
lecture de code déjà consignée dans
`real-smoke-preflight-2026-08-31-worker-config/evidence/code-reading-provider-config.md`.

Aucun Real Smoke n'a été lancé pour produire cette preuve : c'est un résultat de
preflight (`bin/run-preflight.js` inchangé) exécuté dans un environnement où le réseau
réel fonctionne.

### 1.4 Classification retenue

**LIMITE CONTRACTUELLE.** Le défaut n'est ni un bug d'exécution, ni une régression, ni
une faute de MONO-00→07 : le code v0.5 se comporte exactement comme écrit. Le contrat
lui-même ne distingue pas deux modes d'authentification légitimes et mutuellement
exclusifs :

1. **mode direct** — client → Anthropic, credential local = `ANTHROPIC_API_KEY` ;
2. **mode delegated** — client → Worker Cloudflare → Anthropic, credential côté
   provider = `ANTHROPIC_API_KEY` **uniquement côté Cloudflare**, jamais côté client.

---

## 2. Périmètre

### 2.1 Fichiers MONO-08 potentiellement concernés

| Fichier | Nature du changement envisagé |
|---|---|
| `lib/preflight.js` | **Contrat + implémentation.** Ajout de la notion de mode d'authentification (`LLM_AUTH_MODE`) dans `buildProviders()`, nouvelle branche de probe/classification pour `delegated` dans `checkProvider()`/`probe()` du provider `llm-worker`. |
| `lib/real-provider-configs.js` | **Contrat + implémentation.** `buildRealProviderConfigs()` doit produire une configuration `llm-worker` différente selon `LLM_AUTH_MODE`, avec un `requiredSecret` qui varie (`ANTHROPIC_API_KEY` en direct, `EVIDENCEFORGE_WORKER_API_KEY` en delegated). Le garde-fou `assertNotLocalOrSynthetic()` doit continuer de s'appliquer à l'URL du Worker dans les deux modes. |
| `.env.example` | **Configuration.** Documenter `LLM_AUTH_MODE`, `EVIDENCEFORGE_WORKER_API_KEY`, `LLM_WORKER_BASE_URL` selon le mode. |
| `MISSION.md` / `README-REAL-SMOKE.md` | **Documentation.** Décrire les deux modes, leurs prérequis, et la procédure de configuration côté opérateur. |
| `CDC-TRACE.md` | **Documentation.** Traçabilité de l'évolution v0.5 → v0.6. |
| `reports/mono-08-preflight-v1.json` (schéma) | **Contrat de sortie.** Le schéma de rapport doit pouvoir représenter le mode utilisé (`authMode: "direct" | "delegated"`) sans casser la lecture existante en mode direct. |
| `test/test_t08_preflight.js` | **Tests.** Nouveaux cas pour les deux modes (voir §10) ; les cas existants ne doivent pas changer de résultat. |
| `test/test_t08_eforch.js`, `test/test_t08_matrix.js`, `test/test_t08_runner_orchestration.js` | **Tests.** Vérification que le chemin real-provider-configs reste correctement câblé pour les deux modes sans toucher EF-ORCH ni MONO-04 eux-mêmes. |

### 2.2 Distinction explicite par nature

- **Contrat** (comportement attendu, observable) : §4, §5, §6, §7 de ce document.
- **Configuration** (variables d'environnement, valeurs par défaut) : `LLM_AUTH_MODE`,
  `EVIDENCEFORGE_WORKER_API_KEY`, `LLM_WORKER_BASE_URL`.
- **Preflight** (`lib/preflight.js`) : logique de sonde/classification par mode.
- **Real provider config** (`lib/real-provider-configs.js`) : configuration fournie au
  Gateway MONO-04 pour le vrai run, par mode.
- **Documentation** : `.env.example`, `MISSION.md`, `README-REAL-SMOKE.md`,
  `CDC-TRACE.md`.
- **Tests** : `test/test_t08_preflight.js` et suite associée, cas A→K (§10).

---

## 3. Non-périmètre

Explicitement exclus de MONO-08 v0.6 :

- **MONO-00 → MONO-07** : aucun lot gelé n'est modifié, ni directement ni par
  dépendance de code. `lib/` de MONO-07 reste exposé en lecture seule comme en v0.5.
- **EF-ORCH-SUBSYSTEM** (interne, gelé) : aucune modification de EF-01A/B/C1/C2/D/E/F,
  EF-PR-GEN-01, EF-02*, EF-03*, EF-04*. v0.6 ne touche que la façon dont MONO-08
  *configure* l'accès au provider LLM ; le pipeline EF-ORCH lui-même est hors périmètre.
- **MONO-04** (Gateway) : son code n'est pas modifié. Seule la **configuration**
  produite par `real-provider-configs.js` pour alimenter le Gateway change ; le Gateway
  continue de recevoir un objet de configuration `{ endpoint, headers, requiredSecret,
  timeoutMs, retryPolicy }` de la même forme qu'en v0.5.
- **MONO-09 / JMMJS** : reste interdit, aucune référence de code ou d'architecture
  n'est introduite vers ce lot.
- **Refonte générale des providers** : OpenAlex, Crossref, PubMed ne sont pas concernés
  par v0.6 ; leur contrat de preflight reste strictement identique à v0.5.
- **Autres Workers existants** (`clone-proxy`, `ocr-universel-proxy`,
  `openalex-proxy`, `openai-proxy`, `groq-proxy`, `google-tts-proxy`,
  `jmmjs-map-services`, `worker-mcp`) : aucun n'est réutilisé comme solution finale.
  Ils peuvent servir de référence technique de lecture (ex. structure générale d'un
  Worker proxy), mais MONO-08 v0.6 spécifie un Worker **dédié et découplé**
  (`evidenceforge-llm-proxy`, §7), propre à EvidenceForge, sans dépendance
  opérationnelle à ces autres Workers.

---

## 4. Nouveau contrat — `LLM_AUTH_MODE`

### 4.1 Variable de configuration

```text
LLM_AUTH_MODE ∈ { absent, "direct", "delegated" }
```

Règle contractuelle exacte, sans ambiguïté possible :

```text
LLM_AUTH_MODE absent               → direct
LLM_AUTH_MODE="direct"             → direct
LLM_AUTH_MODE="delegated"          → delegated
toute autre valeur explicite       → PRODUCT_CONFIG_ERROR
                                      exit code 3
                                      aucun appel provider
                                      aucune requête réseau
```

Seule l'**absence** de la variable retombe sur `direct`, par défaut, pour garantir la
rétrocompatibilité stricte avec v0.5 (§9). **Une valeur explicitement fournie et non
reconnue n'est jamais silencieusement réinterprétée comme `direct`** : elle doit
produire `PRODUCT_CONFIG_ERROR` (exit code 3, cohérent avec la convention déjà en place
dans `bin/run-preflight.js`), et ce avant toute tentative d'appel provider — aucune
requête réseau, vers quelque provider que ce soit (`openalex`, `crossref`, `pubmed`,
`llm-worker`), ne doit être émise si `LLM_AUTH_MODE` porte une valeur explicite
invalide. Ni `READY`, ni `BLOCKED`, ni un repli silencieux vers `direct` ne sont des
comportements acceptables dans ce cas. Voir le cas de test J (§10) et
`MONO-08-v0.6-ACCEPTANCE-MATRIX.md`.

### 4.2 Comportement `direct`

- Strictement inchangé par rapport à v0.5.
- Cible : `LLM_WORKER_BASE_URL` (défaut `https://api.anthropic.com`).
- Credential requis : `ANTHROPIC_API_KEY`, lu et envoyé localement (header `x-api-key`,
  `anthropic-version`), exactement comme aujourd'hui.
- Aucune référence à `EVIDENCEFORGE_WORKER_API_KEY` dans ce mode.

### 4.3 Comportement `delegated`

- Cible : `LLM_WORKER_BASE_URL` doit pointer vers un Worker Cloudflare
  (`assertNotLocalOrSynthetic()` continue de s'appliquer : ni localhost, ni 127.0.0.1,
  ni un domaine explicitement marqué synthetic/mock/fixture).
- Credential requis côté client : **`EVIDENCEFORGE_WORKER_API_KEY`** uniquement.
- Un vrai appel upstream Anthropic doit avoir eu lieu côté Worker pour que la réponse
  soit considérée valide (§5, §7) — un simple `HTTP 200` du Worker ne suffit jamais
  (§5.4, et §5.3 pour la distinction NIVEAU 1/NIVEAU 2).

#### 4.3.1 `ANTHROPIC_API_KEY` en mode delegated — contrat logiciel (A) vs test REAL (B)

Ces deux affirmations sont de nature différente et ne doivent jamais être fusionnées
ni présentées comme contradictoires :

**A. Contrat logiciel (ce que le code doit garantir, dans tous les cas) :**

```text
MONO-08 ne doit jamais lire ANTHROPIC_API_KEY en mode delegated.
MONO-08 ne doit jamais transmettre ANTHROPIC_API_KEY en mode delegated.
MONO-08 ne doit jamais demander ANTHROPIC_API_KEY à un SecretProvider en mode delegated.
MONO-08 ne doit jamais construire un header à partir de ANTHROPIC_API_KEY en mode delegated.
```

Le chemin de code `delegated` est **structurellement indépendant** de
`ANTHROPIC_API_KEY` : cette variable n'apparaît dans aucune branche de code exécutée en
mode `delegated`, ni dans `lib/preflight.js` ni dans `lib/real-provider-configs.js`. La
présence éventuelle de `ANTHROPIC_API_KEY` dans un processus ou un environnement parent,
pour une tout autre raison, ne doit avoir **aucun effet** sur le résultat du preflight
ni du vrai run en mode `delegated` — précisément parce que le code ne la lit jamais,
pas parce qu'elle serait lue puis ignorée.

**B. Condition du test REAL de validation (ce qui doit être vérifié pour prouver A) :**

Le test REAL servant à proposer `GELABLE` (cas G, §10-11) doit être exécuté dans un
processus où `ANTHROPIC_API_KEY` est **effectivement absente** côté client
EvidenceForge — pas seulement « présente mais non lue en théorie ». Cette absence
effective est la condition expérimentale qui permet de démontrer A de façon probante :
un test REAL mené avec la clé présente ne prouverait rien de plus que la lecture de
code, alors qu'un test REAL mené avec la clé absente et un résultat `READY` prouve que
le chemin `delegated` fonctionne réellement sans elle.

Formulation à retenir dans tout le reste de ce document et dans la matrice
d'acceptation :

```text
CONTRAT      : ANTHROPIC_API_KEY non consommée / non lue / non transmise en mode delegated.
TEST REAL     : ANTHROPIC_API_KEY effectivement absente du processus client au moment du test G.
```

#### 4.3.2 Header du credential Worker

La distinction entre mode `direct` et mode `delegated` porte sur **le secret utilisé**,
jamais sur la casse ou le nom du header HTTP. `X-API-Key` et `x-api-key` désignent le
même header HTTP (les noms de header HTTP sont insensibles à la casse) : aucune
mécanique de header n'est introduite dans le seul but de différencier visuellement les
deux modes.

```text
direct     : x-api-key = ANTHROPIC_API_KEY
delegated  : x-api-key = EVIDENCEFORGE_WORKER_API_KEY
```

Un nom de header différent de `x-api-key` peut être utilisé en mode `delegated` si cela
s'avère réellement nécessaire à l'implémentation, à condition cumulativement que :

- MONO-04 ne soit pas modifié (§3, §6) ;
- le type de secret transporté reste sans ambiguïté distinct entre les deux modes
  (jamais une valeur Anthropic sous un nom Worker, ni l'inverse) ;
- aucune ambiguïté d'audit ne soit possible sur la lecture d'un rapport ou d'une trace
  (le nom du provider/credential utilisé, pas seulement le nom du header, doit être
  explicite dans le rapport — §5.5).

---

## 5. Contrat preflight

Le preflight (`bin/run-preflight.js` / `lib/preflight.js`) doit produire, pour le
provider `llm-worker`, un résultat qui dépend du mode configuré. Le champ `authMode`
doit apparaître explicitement dans le rapport JSON produit.

### 5.1 Mode `direct` — états attendus (inchangés vs v0.5)

| Étape | Condition READY |
|---|---|
| `hostReachable` | connexion TCP/TLS + réponse HTTP reçue de `api.anthropic.com` (ou `LLM_WORKER_BASE_URL` si surchargé en mode direct) |
| `authValid` | `ANTHROPIC_API_KEY` présente localement ET acceptée par Anthropic (pas de 401/403) |
| `operationValid` | l'opération réelle du contrat est utilisée (`POST /v1/messages`, jamais un GET) |
| `responseValid` | corps JSON conforme (`content` est un tableau), `HTTP 200` |

### 5.2 Mode `delegated` — nouveaux états attendus

| Étape | Condition READY |
|---|---|
| Worker host reachable | connexion TCP/TLS + réponse HTTP reçue du Worker configuré dans `LLM_WORKER_BASE_URL` |
| Worker credential disponible | `EVIDENCEFORGE_WORKER_API_KEY` présente localement (sinon `AUTHENTICATION_BLOCKED`, sans même tenter l'appel authentifié, symétrique à la règle « no-op sans credential » déjà appliquée en v0.5) |
| Worker auth valide | le Worker accepte le credential Worker envoyé (rejet HTTP attendu et classifié explicitement si le Worker renvoie 401/403 sur le credential Worker — voir §7 pour le contrat exact du Worker) |
| Opération réelle transmise | le Worker a réellement transmis un appel `POST https://api.anthropic.com/v1/messages` en amont — **NIVEAU 2 requis pour le dossier REAL**, voir §5.3 |
| Réponse Anthropic valide | le corps relayé par le Worker est structurellement conforme à la réponse réelle d'Anthropic (`content` tableau, `HTTP 200` en bout de chaîne) — **NIVEAU 1**, voir §5.3 |

### 5.3 Deux niveaux de preuve distincts — validité de réponse ≠ preuve de réalité provider

Un corps JSON structurellement conforme au contrat Messages API **ne suffit jamais, à
lui seul**, à prouver qu'Anthropic a réellement été appelé. Une réponse structurellement
valide peut être produite par un Worker mal implémenté, un rejeu, ou un test local
délibérément simulé (cas F, LOCAL_CONTROLLED). Ces deux niveaux sont donc distincts et
tous deux exigés, mais pour des usages différents :

**NIVEAU 1 — validité de réponse (nécessaire, jamais suffisant seul)**

```text
HTTP 200
+ structure Anthropic Messages API valide
+ content = tableau
+ champs attendus présents et valides
```

Ce niveau seul suffit à valider la logique de classification du preflight (parsing,
branche `delegated`, absence de faux `INVALID_RESPONSE`) — c'est tout ce que prouve le
cas F, LOCAL_CONTROLLED (§10). Il ne prouve à lui seul ni un Worker réel, ni un appel
Anthropic réel.

**NIVEAU 2 — preuve de réalité provider (exigé uniquement pour le dossier REAL, cas G)**

Pour que `READY` en mode `delegated` constitue une preuve REAL recevable (jamais pour
le cas F, toujours LOCAL_CONTROLLED), le dossier de preuve doit fournir une
corrélation vérifiable entre :

- le Worker réellement déployé (identité + version/déploiement identifiés) ;
- la requête EvidenceForge effectivement émise ;
- un identifiant de corrélation non secret (request-id) présent à la fois côté client
  et côté trace Worker ;
- une trace/log Cloudflare minimal correspondant à cette requête ;
- l'appel upstream Anthropic réel effectué par le Worker pour cette même requête ;
- la réponse Anthropic réelle relayée jusqu'au client.

Le CDC autorise l'usage de headers de corrélation non sensibles pour cette preuve,
par exemple :

```text
X-EvidenceForge-Proxy: evidenceforge-llm-proxy
X-EvidenceForge-Upstream: anthropic
X-EvidenceForge-Upstream-Status: <status>
X-EvidenceForge-Request-Id: <id non secret>
```

**Ces headers seuls ne constituent PAS une preuve suffisante.** Un Worker pourrait les
renvoyer sans avoir réellement appelé Anthropic. La preuve REAL recevable est la
combinaison cumulative de :

```text
code Worker audité (§11.8)
+ déploiement identifié
+ request-id corrélé
+ trace/log Worker corrélé à ce request-id
+ réponse Anthropic structurellement valide (NIVEAU 1)
```

Le Worker ne doit jamais logger les prompts complets ni aucun secret pour produire
cette preuve (§7.9, §7.10) — la corrélation se fait sur métadonnées non sensibles
(request-id, statut, timestamp, latence), jamais sur le contenu métier.

### 5.4 Règle absolue anti-faux-READY

**Le mode `delegated` ne doit jamais produire `READY` sur simple `HTTP 200` du
Worker.** Un `HTTP 200` renvoyé par le Worker n'est une preuve de NIVEAU 1 valide que
si le corps de réponse respecte le contrat structurel d'une réponse Anthropic réelle
(mêmes règles de `validateResponse()` qu'en mode direct : `content` est un tableau,
présence des champs attendus du contrat Messages API). Un Worker qui renverrait
`HTTP 200` avec un corps arbitraire, vide, ou ne respectant pas ce contrat doit être
classifié `INVALID_RESPONSE`, jamais `READY`. Et — au-delà du NIVEAU 1 — un `READY`
proposé comme preuve `GELABLE` (dossier REAL, cas G) sans le NIVEAU 2 de §5.3 n'est pas
recevable : c'est la même discipline anti-permissivité que celle déjà appliquée en v0.5
pour OpenAlex/Crossref/PubMed (vérification du corps, pas seulement du code HTTP),
étendue ici à une exigence de corrélation provider pour la preuve REAL.

### 5.5 Classifications de sortie

Les classifications existantes (`NETWORK_BLOCKED`, `AUTHENTICATION_BLOCKED`,
`RATE_LIMITED`, `INVALID_RESPONSE`, `PROVIDER_UNAVAILABLE`, `READY`) sont réutilisées
telles quelles pour le mode `delegated`, avec des `reason` textuelles qui nomment
explicitement le credential concerné (`EVIDENCEFORGE_WORKER_API_KEY` plutôt que
`ANTHROPIC_API_KEY`) pour éviter toute confusion d'audit entre les deux modes.

---

## 6. Contrat du vrai run (`lib/real-provider-configs.js`)

- `buildRealProviderConfigs(env)` doit lire `env.LLM_AUTH_MODE` et produire, pour la
  clé `llm-worker`, une configuration dont la forme reste celle déjà consommée par le
  Gateway MONO-04 (`{ endpoint, timeoutMs, method, requiredSecret, retryPolicy,
  headers }`) — **aucun changement de MONO-04 lui-même, ni de la forme d'interface
  qu'il attend.**
- En mode `direct` : configuration strictement identique à v0.5 (`requiredSecret:
  "ANTHROPIC_API_KEY"`, header `x-api-key`).
- En mode `delegated` : `requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY"`, header
  dédié au credential Worker (voir §4.3), `endpoint` = `LLM_WORKER_BASE_URL +
  "/v1/messages"`.
- `assertNotLocalOrSynthetic()` reste appliqué à l'URL du Worker dans les deux modes,
  sans exception.
- Ce fichier ne fait que **sélectionner et paramétrer** la configuration fournie au
  Gateway ; il ne modifie ni la responsabilité ni le comportement de MONO-04.

---

## 7. Worker contract — `evidenceforge-llm-proxy` (spécification, pas d'implémentation)

Ce Worker n'est **pas créé** par ce CDC. Sa spécification est fixée ici pour qu'une
implémentation future puisse être auditée contre un contrat écrit, avant tout code.

### 7.1 Identité

- Nom : `evidenceforge-llm-proxy`.
- Portée : dédié à EvidenceForge, découplé de tout autre Worker existant
  (`clone-proxy`, `ocr-universel-proxy`, etc. restent hors périmètre — cf. §3).
- Secrets Cloudflare requis : `WORKER_API_KEY` (credential d'entrée, connu du Worker et
  du runtime EvidenceForge) et `ANTHROPIC_API_KEY` (secret upstream, connu du Worker
  seul).

### 7.2 Route

```text
POST /v1/messages
```

Aucune autre route n'est dans le périmètre de ce CDC (pas de `GET`, pas d'endpoint de
santé, pas d'endpoint d'administration — à spécifier séparément si un jour nécessaire,
hors v0.6).

### 7.3 Entrée attendue

- Header `X-API-Key` (ou équivalent explicitement nommé dans la config MONO-08,
  cohérent avec §4.3) : credential Worker, comparé au secret `WORKER_API_KEY`.
- Corps : JSON conforme au contrat Anthropic Messages API (`model`, `max_tokens`,
  `messages`, etc.) — le Worker ne réinvente pas ce contrat, il le relaie.
- `Content-Type: application/json` requis.

### 7.4 Validation

1. Vérifier la présence et l'exactitude de `X-API-Key` avant tout traitement. Absence
   ou valeur incorrecte → rejet immédiat, **aucun appel upstream Anthropic tenté**.
2. Valider strictement la structure du payload entrant (JSON bien formé, champs
   requis du contrat Messages API présents) avant relais. Payload invalide → rejet,
   **aucun appel upstream tenté**.
3. Injecter `ANTHROPIC_API_KEY` (secret Cloudflare) dans l'appel sortant — jamais lu
   depuis l'entrée, jamais accepté depuis le client.
4. Appeler réellement `https://api.anthropic.com/v1/messages` avec le payload validé.
5. Relayer le code HTTP et le corps de réponse d'Anthropic au client, sans les
   altérer au-delà d'un éventuel enveloppement minimal documenté.

### 7.5 Codes HTTP attendus (contrat minimal)

| Cas | Code HTTP attendu du Worker |
|---|---|
| `X-API-Key` absent ou invalide | `401` |
| Payload invalide (JSON malformé ou champs requis absents) | `400` |
| Rate limit Worker dépassé (§7.11) | `429`, **appel upstream Anthropic non tenté** |
| Appel upstream Anthropic réussi | code Anthropic relayé tel quel (`200` attendu en cas de succès) |
| Erreur upstream Anthropic (429, 5xx, etc.) | code Anthropic relayé tel quel, pas absorbé ni transformé en faux succès |
| Timeout upstream | `504`, jamais un `200` de repli |

Le `429` de rate limit Worker (§7.11) et un éventuel `429` relayé depuis Anthropic sont
deux causes distinctes qui doivent rester distinguables dans la trace/log Worker (§7.9,
§5.3 NIVEAU 2) — l'une signifie que l'upstream n'a jamais été appelé, l'autre qu'il l'a
été et a lui-même limité.

### 7.6 Propagation des erreurs

Le Worker ne doit jamais transformer une erreur upstream Anthropic en succès apparent.
Le corps d'erreur relayé doit permettre au preflight MONO-08 (§5.4) de distinguer un
échec d'authentification Worker (§7.5, `401`) d'un échec upstream Anthropic (code et
corps Anthropic relayés).

### 7.7 Timeouts

- Timeout d'appel upstream configurable, cohérent avec `EVIDENCEFORGE_HTTP_TIMEOUT_MS`
  déjà utilisé côté MONO-08 (valeur par défaut à documenter au moment de
  l'implémentation, hors périmètre de ce CDC).

### 7.8 CORS

- Aucune exposition CORS large par défaut. Le Worker n'est pas destiné à être appelé
  depuis un navigateur tiers arbitraire ; toute règle CORS doit rester restrictive et
  explicitement documentée au moment de l'implémentation.

### 7.9 Logs

- Ne jamais logger `ANTHROPIC_API_KEY` ni `WORKER_API_KEY`, sous aucune forme (ni en
  clair, ni tronqué de façon reconstructible).
- Ne jamais logger le corps complet des prompts (`messages`) par défaut. Un log
  minimal (timestamp, statut, latence, taille de payload) est acceptable ; le contenu
  métier ne l'est pas par défaut.

### 7.10 Secret handling

- `ANTHROPIC_API_KEY` : jamais transmis au client, jamais renvoyé dans une réponse
  d'erreur, jamais dans un header de réponse.
- `WORKER_API_KEY` : jamais renvoyé dans le corps ou les headers de réponse (il n'a de
  sens qu'en entrée).

### 7.11 Rate limiting

Exigence explicite, non optionnelle, pour toute implémentation future du Worker.
Objectif : réduire l'impact d'une éventuelle compromission de
`EVIDENCEFORGE_WORKER_API_KEY` et empêcher qu'un Worker authentifié devienne un relais
Anthropic illimité.

- Rate limiting appliqué côté Cloudflare (pas seulement documenté, réellement mis en
  œuvre au moment de l'implémentation).
- Limite configurable (pas de valeur codée en dur non ajustable).
- Dépassement → rejet explicite `HTTP 429` (§7.5), **avant** tout appel upstream
  Anthropic — un dépassement de rate limit ne doit jamais consommer de quota Anthropic.
- Aucune conversion d'un `429` de rate limit en succès apparent, à aucun niveau
  (ni côté Worker, ni côté preflight MONO-08 qui le reçoit — classification
  `RATE_LIMITED`, jamais `READY`, §5.5).
- Une preuve d'un test négatif de rate limit (déclenchement effectif du `429`) est
  exigée avant `GELABLE` (§10 cas K, §11).

---

## 8. Sécurité

Exigences minimales, non négociables pour toute implémentation future de v0.6 :

- Aucune `ANTHROPIC_API_KEY` côté client en mode `delegated` — ni dans
  l'environnement lu par MONO-08, ni dans une variable de configuration MONO-08, ni
  dans un header envoyé par MONO-08.
- Aucun secret (`ANTHROPIC_API_KEY`, `EVIDENCEFORGE_WORKER_API_KEY`) dans
  stdout/stderr/logs/reports produits par MONO-08, dans les deux modes. Présence
  binaire (oui/non) uniquement, jamais la valeur — même règle qu'en v0.5.
- Aucun prompt complet persisté par défaut, ni côté MONO-08 ni côté Worker (§7.9).
- Refus systématique sans `WORKER_API_KEY` valide côté Worker (§7.4.1) et sans
  `EVIDENCEFORGE_WORKER_API_KEY` côté preflight MONO-08 (§5.2) — refus fail-closed dans
  les deux cas, jamais un passage silencieux en mode dégradé.
- Refus systématique de payload invalide côté Worker (§7.4.2), avant tout appel
  upstream — pas de tentative « au cas où ».
- Pas de wildcard de sécurité implicite : ni `X-API-Key: *`, ni CORS `*` par défaut, ni
  contournement de `assertNotLocalOrSynthetic()` pour l'URL du Worker en mode
  `delegated`.
- Rate limiting appliqué côté Worker (§7.11), avec rejet `429` explicite avant tout
  appel upstream en cas de dépassement — jamais converti en succès.

### 8.1 Secret scan — formulation corrigée (distinction obligatoire)

`EVIDENCEFORGE_WORKER_API_KEY` et `ANTHROPIC_API_KEY` ne sont pas dans la même
situation vis-à-vis d'un scan de secret côté MONO-08, et le secret scan ne doit pas
prétendre les traiter de façon identique :

**H1 — `EVIDENCEFORGE_WORKER_API_KEY`** : valeur **connue du runtime EvidenceForge**
en mode `delegated` (c'est le credential qu'il envoie lui-même). Un scan de valeur
brute est donc possible et **obligatoire** : `0` occurrence brute exigée dans tous les
artefacts produits par MONO-08 (mêmes catégories qu'en v0.5 : RunState, NodeState,
ArtifactRecord, traces, reports, logs, stdout/stderr, OperatorApi, DOM, localStorage,
sessionStorage).

**H2 — `ANTHROPIC_API_KEY`** : valeur **volontairement inconnue du runtime
EvidenceForge** en mode `delegated` (§4.3.1.A). Un scan de valeur brute est donc
**structurellement impossible** — on ne peut pas chercher dans des artefacts la valeur
d'un secret que le processus qui les a produits n'a jamais lu. Le CDC ne doit pas
prétendre effectuer ce scan de valeur brute pour `ANTHROPIC_API_KEY` en mode
`delegated` : ce serait afficher ou redemander la clé au client dans le seul but de
pouvoir la scanner, ce qui contredirait directement le contrat A de §4.3.1. La preuve
attendue pour H2 est **structurelle**, pas un scan de valeur :

- `ANTHROPIC_API_KEY` absente du processus client au moment du test REAL (§4.3.1.B) ;
- MONO-08 ne la lit jamais (revue du chemin de code `delegated`) ;
- MONO-08 ne la demande jamais à un SecretProvider en mode `delegated` ;
- aucune configuration provider client ne la référence en mode `delegated`
  (`lib/real-provider-configs.js`, §6) ;
- aucun header client ne la contient en mode `delegated` (§4.3.2) ;
- aucun log ni rapport ne contient, en mode `delegated`, un nom de variable
  (`ANTHROPIC_API_KEY`) associé à une valeur récupérée par MONO-08 — puisqu'aucune
  valeur n'est jamais récupérée ;
- le chemin de code `delegated` est vérifiablement indépendant de `ANTHROPIC_API_KEY`
  (aucune référence à cette variable dans les branches `delegated` de
  `lib/preflight.js` et `lib/real-provider-configs.js`).

Voir §10 cas H (scindé en H1/H2) et §11.

---

## 9. Compatibilité

- Le mode `direct` doit rester **strictement rétrocompatible** avec v0.5 : mêmes
  variables d'environnement, même comportement observable, mêmes codes de sortie de
  `bin/run-preflight.js`, pour tout opérateur qui ne définit pas `LLM_AUTH_MODE` (donc
  par défaut `direct`).
- Aucun test existant de la suite v0.5 (`test/test_t08_*.js`) ne doit changer de
  résultat suite à l'introduction de v0.6. L'absence de régression sur les tests
  historiques est un critère de recevabilité de toute implémentation future (voir §10,
  cas I).
- Les rapports déjà produits par v0.5 (`reports/mono-08-preflight-v1.json` et
  consorts) restent lisibles par tout consommateur existant : l'ajout du champ
  `authMode` doit être additif, jamais un renommage ou une suppression de champ
  existant.

---

## 10. Tests d'acceptation

Environnements : `LOCAL_CONTROLLED` = environnement de test avec provider(s) simulés
de façon contrôlée et déclarée comme telle (pas une preuve REAL) ; `REAL` = environnement
avec accès réseau réel et Worker Cloudflare réellement déployé. Le détail exécutable de
ces cas (A→K) est repris dans `MONO-08-v0.6-ACCEPTANCE-MATRIX.md`.

| # | Environnement | Mode | Précondition | Résultat attendu |
|---|---|---|---|---|
| A | LOCAL_CONTROLLED | direct | `ANTHROPIC_API_KEY` absente | `AUTHENTICATION_BLOCKED` |
| B | LOCAL_CONTROLLED | direct | `ANTHROPIC_API_KEY` présente | comportement v0.5 inchangé |
| C | LOCAL_CONTROLLED | delegated | `EVIDENCEFORGE_WORKER_API_KEY` absente | `AUTHENTICATION_BLOCKED` |
| D | LOCAL_CONTROLLED | delegated | Worker auth invalide (mauvais `WORKER_API_KEY`) | `AUTHENTICATION_BLOCKED` |
| E | LOCAL_CONTROLLED | delegated | Worker répond faux `200` / corps invalide | `INVALID_RESPONSE` |
| F | LOCAL_CONTROLLED | delegated | Worker répond une réponse Anthropic structurellement valide (NIVEAU 1 seul, jamais présenté comme REAL — §5.3) | `READY` |
| G | REAL | delegated | Worker Cloudflare dédié réellement déployé, `EVIDENCEFORGE_WORKER_API_KEY` réelle acceptée, `ANTHROPIC_API_KEY` effectivement absente du process client (§4.3.1.B), vrai appel upstream Anthropic, preuve NIVEAU 2 corrélée (§5.3) | `READY`, aucun accès client à `ANTHROPIC_API_KEY` à aucun moment |
| H1 | — | — | Après tout run utilisant `EVIDENCEFORGE_WORKER_API_KEY` réelle (mode delegated) | secret scan brut = `0` occurrence de `EVIDENCEFORGE_WORKER_API_KEY` |
| H2 | — | — | Test REAL delegated (cas G) | preuve structurelle de non-consommation de `ANTHROPIC_API_KEY` côté client (§8.1 H2) ; variable absente du process au moment du test |
| I | — | — | Suite `test/test_t08_*.js` historique (v0.5) | inchangée, aucune régression |
| J | LOCAL_CONTROLLED | — | `LLM_AUTH_MODE="anything-else"` (valeur explicite invalide) | `PRODUCT_CONFIG_ERROR`, exit code `3`, aucun provider appelé, aucune requête réseau |
| K | LOCAL_CONTROLLED ou Worker de test contrôlé | delegated | Credential Worker valide, seuil de rate limit Worker atteint | `HTTP 429` côté Worker, classification `RATE_LIMITED`, jamais `READY`, upstream Anthropic non appelé |

### Règle sur le cas F

F reste **strictement LOCAL_CONTROLLED**. Un Worker simulé qui renvoie une réponse
Anthropic structurellement valide permet de tester le parsing, la classification, la
branche `delegated`, et l'absence de faux `INVALID_RESPONSE` — mais F **ne prouve
jamais** un provider REAL, un appel Anthropic REAL, un Worker REAL, ni un upstream REAL.
F doit rester explicitement étiqueté `LOCAL_CONTROLLED` dans tout rapport ou dossier de
preuve, et ne peut jamais se substituer à G pour la validation `GELABLE`.

### Règle sur le cas G

G — REAL delegated — doit prouver cumulativement, avec preuve archivée pour chaque
point : Worker Cloudflare dédié réellement déployé ; endpoint réel ; credential Worker
réel accepté ; `ANTHROPIC_API_KEY` effectivement absente du process client ; aucun
accès client à `ANTHROPIC_API_KEY` ; appel Anthropic upstream réel ; réponse Anthropic
réelle ; request-id corrélé (§5.3 NIVEAU 2) ; trace/log Worker corrélé à ce request-id ;
provider reality log (provider, opération, REAL, timestamp, latency, attempts, HTTP
status, classification) ; classification `READY` ; aucun faux `READY` ; secret handling
conforme (§7.10, §8.1).

---

## 11. Critères de GELABLE

MONO-08 v0.6 pourra être proposée `GELABLE` uniquement si, cumulativement :

1. Tous les cas d'acceptation A→K (§10) sont exécutés réellement (pas simulés pour les
   cas marqués REAL) et passent tous.
2. Le mode `direct` est démontré strictement rétrocompatible (cas B, I).
3. Le mode `delegated` atteint `READY`, comme preuve REAL recevable, **uniquement** via
   un vrai Worker Cloudflare dédié (`evidenceforge-llm-proxy` ou équivalent conforme au
   contrat §7) relayant un vrai appel upstream Anthropic, avec preuve NIVEAU 2 corrélée
   (§5.3) — jamais via un mock, un stub, ou une réponse simulée présentée comme REAL
   (cas G ; le cas F seul, LOCAL_CONTROLLED, ne peut jamais satisfaire ce critère).
4. `ANTHROPIC_API_KEY` est effectivement absente du processus EvidenceForge pendant le
   test REAL delegated (cas G, §4.3.1.B).
5. MONO-08 en mode `delegated` ne lit, ne demande à un SecretProvider, ni ne transmet
   jamais `ANTHROPIC_API_KEY`, par construction du code (§4.3.1.A) — vérifié par revue
   du chemin de code `delegated` dans `lib/preflight.js` et
   `lib/real-provider-configs.js`.
6. Le secret scan brut de `EVIDENCEFORGE_WORKER_API_KEY` (cas H1) est à `0` occurrence
   sur l'ensemble des artefacts produits (RunState, NodeState, ArtifactRecord, traces,
   reports, logs, stdout/stderr, OperatorApi, DOM, localStorage, sessionStorage — même
   périmètre que v0.5).
7. La preuve provider REAL corrélée (NIVEAU 2, §5.3, cas G) est disponible et
   archivée : request-id, trace/log Worker, déploiement Worker identifié.
8. Le Worker `evidenceforge-llm-proxy` est audité indépendamment sur le contrat §7
   (validation credential, validation payload, non-exposition du secret upstream,
   absence de faux succès, rate limiting §7.11) avant d'être considéré comme preuve
   REAL valable.
9. Le rate limiting Worker est testé et démontré (cas K) : `HTTP 429` explicite,
   classification `RATE_LIMITED`, aucun appel upstream Anthropic consommé au moment du
   dépassement.
10. Aucun lot MONO-00→07 n'a été modifié.
11. MONO-04 reste inchangé dans son code (seule sa configuration d'appel change, §6).
12. EF-ORCH reste inchangé.
13. MONO-09 / JMMJS reste non entamé.

Tant que ces 13 conditions ne sont pas toutes vérifiées avec preuves, MONO-08 v0.6 reste
`NON GELABLE` au sens des verdicts déjà en usage sur ce lot.

---

## 12. Risques

| Risque | Description | Mitigation prévue par ce CDC |
|---|---|---|
| Faux READY | Le mode `delegated` marque `READY` sur un simple `HTTP 200` du Worker sans validation structurelle du corps, ou sur un NIVEAU 1 seul sans NIVEAU 2 pour le dossier REAL | §5.3, §5.4 : validation du corps obligatoire (NIVEAU 1) + preuve de corrélation provider obligatoire pour REAL (NIVEAU 2), réutilisation de la discipline `validateResponse()` déjà appliquée aux autres providers |
| Auth déléguée mal interprétée | Confusion entre credential Worker et credential Anthropic dans le code ou les logs, menant à une classification erronée ou à une fuite | §4.3.1, §4.3.2, §7.10 : deux credentials nommés distinctement, jamais interchangés, `reason` textuelle explicite par mode (§5.5) |
| Worker public / mal sécurisé | Un `evidenceforge-llm-proxy` déployé sans validation stricte de `WORKER_API_KEY`, ou sans rate limiting, deviendrait un relais Anthropic ouvert ou surexploitable, exposant indirectement le secret upstream à un usage non autorisé | §7.4.1 : rejet fail-closed avant tout appel upstream ; §7.11 : rate limiting obligatoire ; §11.8, §11.9 : audit indépendant du contrat Worker et preuve de rate limiting avant validation GELABLE |
| Fuite de secret (`EVIDENCEFORGE_WORKER_API_KEY`) | Log accidentel, exposition dans un rapport, un header de réponse, ou un message d'erreur | §7.9, §7.10, §8.1 H1 : interdictions explicites, scan de valeur brute obligatoire ; §10 cas H1, §11.6 : `0` occurrence brute exigée avant GELABLE |
| Fausse preuve de non-consommation de `ANTHROPIC_API_KEY` | Un audit qui accepterait une simple déclaration d'absence sans vérification structurelle du chemin de code, ou qui demanderait la clé au client pour la scanner | §8.1 H2 : preuve structurelle exigée (revue de code + absence effective au moment du test REAL) plutôt qu'un scan de valeur, jamais de demande de la clé au client ; §11.4, §11.5 |
| Régression du mode direct | L'introduction de `LLM_AUTH_MODE` casse le comportement v0.5 existant pour les opérateurs qui n'en ont pas besoin | §9, §10 cas B et I : rétrocompatibilité et non-régression comme critères de recevabilité explicites |
| Dérive de responsabilité vers MONO-04 | La tentation de modifier le Gateway MONO-04 lui-même pour « simplifier » l'intégration delegated | §3, §6 : MONO-04 explicitement hors périmètre, seule la configuration qui lui est fournie change de forme de valeurs, jamais son code ni son interface |
| Couplage à un Worker tiers existant | Réutilisation opportuniste de `clone-proxy` ou `ocr-universel-proxy` pour aller plus vite, créant une dépendance croisée non désirée entre EvidenceForge et d'autres applications | §3, §7.1 : Worker dédié et découplé explicitement requis ; les Workers existants ne sont autorisés qu'en référence de lecture, jamais en dépendance opérationnelle |

---

## Verdict

**CDC READY FOR RE-AUDIT**

Cette révision intègre les 8 corrections issues du premier audit indépendant
(ambiguïté `LLM_AUTH_MODE`, distinction contrat/test REAL pour `ANTHROPIC_API_KEY`,
séparation validité de réponse / preuve de réalité provider, secret scan H1/H2, header
Worker, rate limiting, matrice A→K, critères GELABLE 1→13). Elle continue de couvrir les
12 sections demandées, s'appuie sur la preuve expérimentale déjà obtenue et consignée
(aucun nouveau run nécessaire pour produire cette révision), ne modifie aucun artefact
existant, ne crée aucun Worker, ne relance aucun preflight ni Real Smoke, et ne propose
aucun code. Elle est soumise à ré-audit indépendant avant toute implémentation.

**STOP.**
