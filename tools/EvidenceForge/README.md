# EvidenceForge

## DÉMARRER EVIDENCEFORGE

Depuis le dépôt (`cd ~/Documents/GitHub/C-Concept-Dev`) :

**Première fois** (configuration locale, une seule fois) :
```
./tools/EvidenceForge/setup.sh
./tools/EvidenceForge/start.sh
```

**Ensuite, à chaque fois** :
```
./tools/EvidenceForge/start.sh
```
EvidenceForge vérifie tout, démarre la version active et ouvre votre navigateur. Rien d'autre à taper.

**Diagnostic** (sans lancer de run) :
```
./tools/EvidenceForge/doctor.sh
```

**Arrêter** : `Ctrl+C` dans le terminal de `start.sh` (ou `./tools/EvidenceForge/stop.sh`).

**Mettre à jour** : `git pull --ff-only` puis `start.sh` (le lanceur vous indique si le dépôt est en retard ; il ne modifie jamais votre dépôt).

### Ce que fait `setup.sh`
Il vous demande l'adresse du worker, la clé (saisie masquée, jamais réaffichée), le modèle (proposé : `claude-sonnet-4-6`), le port (proposé :
8768) et le dossier des runs ; il teste la connexion avec une **sonde gratuite** (aucun appel payant) et écrit
`tools/EvidenceForge/.env.local` (permissions 600). Ce fichier est **ignoré par git**, jamais mis dans un zip ni dans un manifeste.
Si votre terminal contient déjà une configuration qui marche, `setup.sh` propose de la réutiliser sans l'afficher (`--from-env` pour ne pas demander).

### Ce que fait `start.sh`
1. lit la version active (`tools/EvidenceForge/ACTIVE_VERSION`, aujourd'hui `MONOLITH-v1.0.6` (candidat = v1.0.5 gelée + AUTO-CHUNK UPLOAD)) ;
2. charge `.env.local`, refuse toute valeur factice (`TON_URL_WORKER`, `TA_CLE`, `example`, `changeme`…) ;
3. vérifie le dossier des runs (créé si besoin, inscriptible, hors du dépôt), le worker (DNS, HTTP, clé — sonde gratuite), le modèle dans
   l'autorité de tarification, l'intégrité des lots gelés ;
4. gère le port : si EvidenceForge **de la même version** tourne déjà, il la réutilise (rien n'est arrêté) ; si c'est une **ancienne
   version** d'EvidenceForge, il l'arrête proprement puis lance la version active ; si c'est **une autre application**, il ne la touche
   jamais et prend un port de repli qu'il annonce ;
5. lance le serveur, vérifie que `/api/config` renvoie exactement la version active, ouvre `http://localhost:8768` et affiche :
```
EvidenceForge
Version : MONOLITH-v1.0.6
Git : <sha> · GitHub main : à jour
Worker : OK
Model : claude-sonnet-4-6
Pricing : OK
Frozen lots : OK
Runs : <dossier>
Server : http://localhost:8768
```
Aucun secret n'est affiché ni journalisé. En cas de problème, le message dit la cause (DNS / connexion / TLS / clé refusée / délai / valeur
factice / dossier non inscriptible / lots altérés) et l'action à faire.

### Dans l'interface
- Le bandeau du haut dit si le **service d'analyse est prêt** (identifiants présents, worker joignable, clé acceptée). « Analyser ma demande »
  reste désactivé tant qu'il ne l'est pas ; « Re-tester » relance le diagnostic.
- **Budget du run** : « Combien suis-je prêt à dépenser ? » (plafond + alerte) — la ligne « Sera enregistré : … » montre exactement ce qui
  sera écrit ; après création, le run affiche ce qui a été **réellement** enregistré. Au plafond, le run s'arrête proprement avant tout
  nouvel appel payant et reprend après augmentation.
- **Aide** (bouton en haut à droite) : étapes, Porte 1 / Porte 2, jumeaux, lecture du rapport, coût, cadrage, limites.

---

## Partie technique

```
tools/EvidenceForge/
  start.sh · doctor.sh · setup.sh · stop.sh     enveloppes ; toute la logique est dans bin/launcher.js (testée : test/test-launch.js)
  ACTIVE_VERSION                                 une seule référence à changer pour activer une autre version (ex. MONOLITH-v1.0.6)
  .env.example                                   modèle (placeholders) — .env.local = votre configuration, gitignorée
  r6/EvidenceForge-CLEAN-MONO-01-08/             bundle canonique : MONO-00 … MONO-11 (lots gelés + zips), AUDIT-REMEDIATION, TEST-REPORTS,
                                                 MONOLITH-v1.0 … v1.0.4 (GELÉE, zip 97b999ad…), MONOLITH-v1.0.5 (GELÉE, zip c6eae8af…), MONOLITH-v1.0.6 (CANDIDAT : + AUTO-CHUNK UPLOAD)
  EF-01B-v0.2-r2/ · EF-01C1-v0.2-r2/             kits d'exploitation gelés (résolveur, planificateur)
```
Miroir **byte-identique** du bundle local `evidenceforge-work/` (import du 2026-09-17) ; la disposition relative est conservée pour que
les configurations gelées restent valides sans modification (`bundleRoot: ".."`, `operatorKit: "../../../EF-01B-v0.2-r2"`).
`.gitignore` : exception `!tools/EvidenceForge/**` (les règles génériques `lib/`, `*.log`… ne s'appliquent pas), puis
`tools/EvidenceForge/.env.local` ignoré. `tools/EvidenceForge-Audit/` = ancienne copie partielle de v1.0.4 (historique).

Variables lues au lancement (depuis `.env.local`, jamais codées) : `LLM_AUTH_MODE=delegated`, `LLM_WORKER_BASE_URL`,
`EVIDENCEFORGE_WORKER_API_KEY`, `EVIDENCEFORGE_LLM_MODEL`, `EVIDENCEFORGE_PORT`, `EVIDENCEFORGE_RUNS_ROOT`, `EVIDENCEFORGE_HTTP_TIMEOUT_MS`.
Le lanceur transmet aussi `EVIDENCEFORGE_GIT_SHA` (affiché par `/api/config.runtime`).

Diagnostic fournisseur (`MONOLITH-v1.0.6/lib/provider-diagnostic.js`, inchangé depuis v1.0.5) : trois niveaux — `credentialsPresent` (présents, sans placeholder,
URL valide) → `reachable` (DNS/HTTP) → `ready` (clé acceptée). La sonde est gratuite : `POST /v1/messages` avec le corps `{}`, que le
worker refuse (`400 invalid_request`) **après** avoir vérifié la clé, sans appeler le fournisseur amont. Codes distingués :
`PROVIDER_DNS_ERROR`, `PROVIDER_CONNECTION_REFUSED`, `PROVIDER_TLS_ERROR`, `PROVIDER_URL_INVALID`, `PROVIDER_PLACEHOLDER`,
`PROVIDER_AUTH_ERROR`, `PROVIDER_ROUTE_NOT_FOUND`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_CAPACITY`,
`PROVIDER_CREDIT_EXHAUSTED`, `PROVIDER_BAD_RESPONSE`, `NETWORK_UNAVAILABLE`. `POST /api/runs` refuse (409 `PROVIDER_NOT_READY`) de créer
un run tant que le fournisseur n'est pas prêt : aucun run fantôme.

Tests :
```
node tools/EvidenceForge/test/test-launch.js                                   # 14 tests lanceur (worker factice, ports de test, Chrome headless)
cd tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.6
node test/test-monolith.js                                                     # 116 tests (aucun réseau)
node tools/browser-tests-v105.js                                               # 20 tests navigateur
```
Règles de gouvernance (inchangées) : aucun lot GELÉ modifié ; évolutions additives, versionnées ; contrats scientifiques, portes humaines,
lignée, checkpoints, hashes, fail-closed protégés ; aucun secret dans le dépôt ; les runs réels sont des preuves, jamais réécrites.
