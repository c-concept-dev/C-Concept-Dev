# 18 — Runtime Prerequisites (R3, B-04)

Ce document répond littéralement au mandat R3 (sections 16, 19, 26) :
distinguer explicitement l'autonomie des **artefacts EvidenceForge**
(`BUNDLE_ARTIFACT_AUTONOMY`) de l'autonomie de la **toolchain système**
(`RUNTIME_TOOLCHAIN_AUTONOMY`). Ce paquet garantit la première ; il ne
revendique JAMAIS la seconde. La liste ci-dessous est la définition
opérationnelle de ce que « exécuter ce paquet » exige au-delà de son
propre contenu.

## Définition adoptée

- **`BUNDLE_SELF_CONTAINED_ARTIFACTS`** : tous les artefacts EvidenceForge
  MONO nécessaires au runtime sont présents dans ce paquet (`MONO-00/`
  → `MONO-08/`, en clair) et aucun ancien kit EvidenceForge externe
  (ancien `KIT_ROOT` HANDOFF, ancienne archive `EvidenceForge-MONO-05-
  v*.zip`/`-R*.zip`, etc.) n'est nécessaire pour reconstruire le
  `KIT_ROOT` que `MONO-07/lib/harness-env.js` (gelé) attend — voir
  `17-B04-ARTIFACT-AUTONOMY.md`.
- Cela **n'implique PAS** `SELF_CONTAINED_RUNTIME_TOOLCHAIN` : les
  outils système ci-dessous restent des prérequis externes au ZIP,
  jamais embarqués (`node_modules/`, binaire Node, Chromium/Playwright
  ne sont ni inclus ni promis offline par ce paquet).

## Prérequis système

| Outil | Version minimale connue | Pourquoi nécessaire | Tests concernés | Besoin réseau | Cache/offline possible |
|---|---|---|---|---|---|
| Node.js | 18+ (testé avec Node 22 dans cet environnement) | Exécute tout le code MONO-08 (`lib/`, `bin/`, `test/`) — aucun runtime alternatif prévu. | Toutes les suites `test/test_t08_*.js`, `worker/evidenceforge-llm-proxy/test/worker.test.js` | Non (une fois Node installé) | Oui — Node lui-même n'a besoin du réseau qu'à l'installation initiale, jamais à l'exécution des tests. |
| npm | Fournie avec Node.js | Résout `node_modules/` (Playwright, dépendances du worker Cloudflare) via `package-lock.json` — jamais un `npm install` sans lock. | Suites nécessitant Playwright (`test_t08_eforch.js::T08-RUNNER-READY-03`, tests UI), `worker/evidenceforge-llm-proxy` (dépendances de test) | **Oui**, sauf cache npm local déjà peuplé ou registre miroir/proxy interne — voir note ci-dessous. | Partiel — un `npm ci` avec cache local déjà chaud (ou registre miroir) fonctionne hors ligne ; un cache froid nécessite le réseau. **Ce paquet ne prétend jamais qu'un `npm ci` est offline par défaut** (mandat section 19) — c'est une propriété de l'environnement d'exécution (cache/miroir déjà configuré), jamais du ZIP lui-même. |
| `zip`/`unzip` (CLI système) | Toute version POSIX standard | `lib/kit-root-adapter.js` invoque `zip` (`execFileSync("zip", ...)`) pour reconstruire le layout `KIT_ROOT/04-ARTEFACTS-CANONIQUES/MONO/*.zip` attendu par `MONO-07/lib/harness-env.js` (gelé) ; `unzip` sert à extraire le paquet remédié lui-même. | `test_t08_r2_closure.js::B04-*`, `test_t08_r3_closure.js::B04-R3-*`, extraction initiale du ZIP livré | Non | Oui — outil local, aucune dépendance réseau. |
| Chromium (via Playwright) | Version pinée par `package-lock.json` du worker/tests UI | `test_t08_eforch.js::T08-RUNNER-READY-03` (UI smoke réel, Playwright) lance un vrai navigateur contre un vrai serveur MONO-05 local. | `test_t08_eforch.js` (sous-ensemble UI uniquement) | **Oui**, sauf navigateur déjà téléchargé localement (`PLAYWRIGHT_BROWSERS_PATH` déjà peuplé) | Partiel — comme `npm ci`, dépend du cache local. Un environnement sans Chromium pré-installé et sans accès réseau doit annoncer `SKIP_ENVIRONMENT` pour ce sous-ensemble précis, jamais un faux PASS (mandat section 23). |

## Ce que ce paquet garantit, explicitement

- Aucun artefact EvidenceForge **externe au ZIP** n'est requis pour
  reconstruire le `KIT_ROOT` attendu par les lots gelés MONO-06/MONO-07
  (`BUNDLE_ARTIFACT_AUTONOMY = PASS` — voir `17-B04-ARTIFACT-AUTONOMY.md`).
- Les suites qui ne dépendent QUE de Node.js + `zip` (la grande majorité :
  `test_t08_r2_closure.js`, `test_t08_r3_closure.js`,
  `test_t08_epistemic_integrity.js`, `test_t08_runner_orchestration.js`,
  `test_t08_observability.js`, `test_t08_preflight.js`,
  `test_t08_release_governance.js`, `test_t08_v06_delegated_auth.js`,
  `test_t08_v06_real_adapter_model.js`, `test_t08_cross_process.js`)
  s'exécutent sans aucun accès réseau, une fois Node.js/`zip` déjà
  présents sur la machine.
- Les suites qui touchent Playwright/`npm ci` à froid (sans cache local
  préexistant) nécessitent un accès réseau **au niveau de la toolchain
  système**, jamais au niveau du contenu applicatif MONO-08 lui-même
  (aucun appel Anthropic/Worker/OpenAlex/Crossref/PubMed n'est jamais
  requis par un test LOCAL_CONTROLLED).

## Ce que ce paquet ne garantit PAS

- Un environnement totalement air-gapped (sans Node.js/npm/Chromium déjà
  installés ET sans cache local) ne peut PAS exécuter la suite complète
  sans accès réseau au moins une fois, pour la toolchain elle-même. Ce
  n'est pas une régression de ce round : c'était déjà vrai avant r3 et
  ne l'a jamais été autrement — corrigé ici uniquement dans la manière
  dont ce fait est **documenté** (r2 affirmait à tort « zéro référence à
  une ressource externe à l'extraction », formulation surqualifiée
  corrigée dans `17-B04-ARTIFACT-AUTONOMY.md`).
