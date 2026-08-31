# EvidenceForge MONO-08 — Real Smoke Kit v0.5 — Preflight officiel (nouvel environnement)

Date d'exécution : 2026-08-31 (horodatage machine : voir `evidence/mono-08-preflight-v1.json` → `checkedAt`).
Opérateur : Claude Code, exécution locale dans l'environnement d'exécution distant Claude Code (session cloud), sous gouvernance stricte du kit `EvidenceForge-Claude-Code-Real-Smoke-Kit`.

## 1. Statut d'entrée (rappel, non modifié)

```text
MONO-00 → MONO-07              = GELÉS / INCHANGÉS
MONO-08 Real Smoke Kit v0.5    = CHECKPOINT TECHNIQUE FIGÉ / IMPLEMENTATION READY / INCHANGÉ
MISSION REAL SMOKE             = VALIDÉE, 11/11
PREFLIGHT PRÉCÉDENT            = BLOCKED (autre environnement)
REAL SMOKE                     = NOT_RUN_ENVIRONMENT_BLOCKED
MONO-08                        = ENVIRONMENT_BLOCKED / NON GELÉ
MONO-09 / JMMJS                = INTERDIT
```

Ce tour n'a **pas** rouvert le sujet packaging historique (mismatch SHA externe = recompression manuelle du propriétaire, classé clos).

## 2. Ce qui a été exécuté dans ce tour

Séquence strictement conforme à `00-START-HERE/CLAUDE-CODE-PROMPT.md` et `README-FIRST.md` du kit fourni :

1. `scripts/00-check-local-host.sh` → PASS (node v22.22.2, npm, unzip, curl, shasum présents). Voir `evidence/host-check.log`.
2. `scripts/01-prepare-workspace.sh` → workspace jetable préparé :
   - vérification `SHA256SUMS` du kit d'aide local : **OK** (tous fichiers).
   - extraction du handoff `EvidenceForge-HANDOFF-pre-REAL-SMOKE-2026-08-31.zip`, vérification `07-VERIFICATION/SHA256SUMS` du handoff canonique : **OK** (toutes entrées, y compris les 9 ZIP canoniques MONO-00→MONO-08 v0.5).
   - comparaison byte-identical entre le v0.5 fourni séparément et le v0.5 embarqué dans le handoff : **PASS**, SHA-256 = `17a9cc14c606e6c775b92db64bcd71085e04990d5b621b8804818752c1e29aec`.
   - extraction de MONO-08 v0.5 dans une extraction jetable, vérification de son `manifest/SHA256SUMS` interne : **OK**.
   - extraction de MONO-07 uniquement pour exposer son `lib/` gelé (aucune modification).
   - staging de la mission d'exécution déjà validée (`inputs/mission-real-smoke-execution-v1.json`, SHA-256 `a5728e435e07d7ea6b538e27e7daea56323073ff5effb2cf69c2219b6a6152bd`) dans `fixtures/mission-real-smoke-v1.json` de l'extraction v0.5 jetable, conformément à `MISSION.md`. Vérifié : `readyForExecution: true` dans le JSON staged.
   - aucun ZIP canonique modifié (voir §5, intégrité gelée).
3. Vérification du credential : `ANTHROPIC_API_KEY` **ABSENT** du shell d'exécution (`test -n` → absent). Valeur jamais demandée, jamais affichée, jamais écrite dans un fichier du kit. Voir `evidence/credential-presence-check.txt`.
4. `scripts/02-network-check.sh` (diagnostic informatif, non contractuel) → voir `evidence/network-check.log`.
5. Snapshot d'intégrité gelée **avant** preflight : `scripts/04-snapshot-frozen-zips.sh` → `evidence/frozen-before.sha256` (9 ZIP canoniques MONO-00→MONO-08 v0.5).
6. **Preflight officiel** (étape décisive) : `scripts/03-official-preflight-only.sh`, qui exécute exactement `node bin/run-preflight.js` depuis `$EVIDENCEFORGE_MONO08_WORK_ROOT`, sans modification. Sortie complète : `evidence/preflight-official-run-stdout.log` et `evidence/mono-08-preflight-v1.json` (rapport produit par le kit lui-même dans `reports/mono-08-preflight-v1.json`).
7. Snapshot d'intégrité gelée **après** preflight : `evidence/frozen-after.sha256`.
8. Comparaison `cmp frozen-before.sha256 frozen-after.sha256` → **bit-identical : OUI**. Aucun ZIP canonique n'a été altéré par la préparation ni par le preflight.

Aucun patch n'a été appliqué à `bin/run-preflight.js`, `bin/run-real-smoke.js`, EF-ORCH, aux adapters, ni à aucun lot MONO-00→07. Aucun mock, aucun provider synthétique, aucun serveur local de substitution n'a été créé.

## 3. Résultat du preflight officiel (fait décisif)

```json
"overallStatus": "BLOCKED",
"allRequiredReady": false
```

`bin/run-preflight.js` retourne l'exit code **2** (= `ENVIRONMENT_BLOCKED` selon la convention documentée dans le fichier lui-même : `0 = READY, 2 = ENVIRONMENT_BLOCKED, 3 = PRODUCT_CONFIG_ERROR`).

Détail par dépendance (source : `evidence/mono-08-preflight-v1.json`) :

| providerId | requis pour Real Smoke | status | cause |
|---|---|---|---|
| `openalex` (`api.openalex.org`) | oui | `NETWORK_BLOCKED` | Hôte atteint (77 ms) mais **403** au niveau du proxy d'egress de l'environnement, `denyReason: host_not_allowed`, classification `EGRESS_PROXY_BLOCK`. |
| `crossref` (`api.crossref.org`) | oui | `NETWORK_BLOCKED` | Idem, **403**, `host_not_allowed`. |
| `pubmed` (`eutils.ncbi.nlm.nih.gov`) | non (`realSmokeRequired: false`) | `NETWORK_BLOCKED` | Idem, **403**, `host_not_allowed`. |
| `llm-worker` (`api.anthropic.com`) | oui | `AUTHENTICATION_BLOCKED` | Hôte réellement atteint (91 ms, réponse **401**), mais `credentialPresent: false` — `ANTHROPIC_API_KEY` absent du shell. Aucun appel authentifié coûteux n'a été tenté (conforme à la règle « no-op sans credential »). |

Ce blocage réseau est corroboré indépendamment par le proxy d'egress de la plateforme d'exécution (`http://127.0.0.1:46617/__agentproxy/status`, doc `/root/.ccr/README.md`) : les CONNECT vers `api.openalex.org`, `api.crossref.org` et `eutils.ncbi.nlm.nih.gov` reçoivent un `403` explicite du proxy (politique d'egress de l'organisation pour cette session), tandis que `api.anthropic.com` figure dans la liste `noProxy` de la même politique et est donc atteint en direct (d'où le `401` propre — hôte joignable, juste sans credential).

Conformément à la doc du proxy elle-même : *"403/407 from the proxy... Do not retry or route around it — report the blocked host."* Aucune tentative de contournement (pas de proxy local, pas de DNS alternatif, pas de VPN, pas de mock) n'a été faite, conformément aux règles absolues du kit.

## 4. Application stricte de la condition d'arrêt

```text
overallStatus ("BLOCKED") != "READY"  →  STOP REAL SMOKE
```

**`bin/run-real-smoke.js` n'a pas été exécuté.** EF-ORCH n'a pas été invoqué. Aucun pipeline (EF-ORCH-SUBSYSTEM → … → EF-04A) n'a été démarré. Rien n'a été simulé pour produire un faux 14/14.

## 5. Intégrité gelée

- Handoff canonique : `07-VERIFICATION/SHA256SUMS` → **OK** intégralement (voir §2.2).
- MONO-08 v0.5 fourni séparément vs MONO-08 v0.5 embarqué dans le handoff : **byte-identical**, SHA-256 `17a9cc14c606e6c775b92db64bcd71085e04990d5b621b8804818752c1e29aec`.
- Manifest interne de l'extraction jetable v0.5 (`manifest/SHA256SUMS`) : **OK** avant staging de la mission. (Après staging, le fichier `fixtures/mission-real-smoke-v1.json` de l'extraction diffère intentionnellement de l'original du manifeste interne — comportement documenté et attendu par `MISSION.md` ; ceci ne concerne que l'extraction opérateur jetable, pas les ZIP canoniques.)
- Snapshot avant/après du preflight sur les 9 ZIP canoniques (MONO-00 → MONO-07 + MONO-08 v0.5) : **bit-identical** (`evidence/frozen-before.sha256` == `evidence/frozen-after.sha256`).
- Aucun ZIP canonique n'a été modifié, recompressé, ou remplacé.

## 6. Secret scan

Aucun run réel n'a été effectué (arrêt avant Real Smoke) et aucun credential n'a jamais été fourni au shell. Il n'y a donc aucune valeur de credential à rechercher dans des artefacts produits par ce tour. Le scan de secret documenté (§14 du prompt maître) s'applique après un run réel utilisant le credential ; il est **sans objet (N/A)** ici et sera exécuté lors d'un tour futur où le preflight sera `READY`.

## 7. Cause racine du blocage (classification)

Classification exacte demandée par le protocole : **`ENVIRONMENT_BLOCKED`**, à double cause indépendante et cumulative :

1. **Politique d'egress réseau de cet environnement d'exécution** interdit explicitement les hôtes `api.openalex.org`, `api.crossref.org` et `eutils.ncbi.nlm.nih.gov` (403 au niveau du proxy, `host_not_allowed`). Ce n'est pas un défaut du produit EvidenceForge ni du kit MONO-08 : le code de preflight détecte et rapporte correctement ce blocage (`EGRESS_PROXY_BLOCK` / `NETWORK_BLOCKED`), sans faux positif ni faux négatif.
2. **Absence de `ANTHROPIC_API_KEY`** dans le shell d'exécution de cet environnement. `api.anthropic.com` est lui-même joignable (401 propre, pas de blocage réseau), donc cette cause est strictement une absence de credential opérateur, indépendante de la précédente.

Aucune des deux causes ne relève d'un bug produit, d'un défaut de test, d'une fixture invalide ou d'une limite contractuelle du kit MONO-08 v0.5 : le preflight fonctionne exactement comme spécifié et détecte correctement un environnement réellement bloqué. Aucun rapport « BUG MODULE / BUG TEST / BUG FIXTURE / BUG SCRIPT / LIMITE CONTRACTUELLE » n'est donc à produire pour ce tour.

## 8. Verdict de ce tour

```text
overallStatus == "BLOCKED" (≠ READY), exit code 2
→ MONO-08 — ENVIRONMENT_BLOCKED
```

`bin/run-real-smoke.js` **n'a pas été lancé**. Aucun résultat forcé, aucun mock, aucun contournement.

**MONO-09 / JMMJS reste interdit et n'a pas été entamé.**

## 9. Pour débloquer un futur tour (constat, pas une action de ce tour)

Pour qu'un futur preflight atteigne `READY`, l'environnement d'exécution utilisé devra permettre, **sans contournement ni mock** :
- l'egress HTTPS réel vers `api.openalex.org`, `api.crossref.org` (requis) et idéalement `eutils.ncbi.nlm.nih.gov` ;
- la présence de `ANTHROPIC_API_KEY` fournie exclusivement via le shell local / SecretProvider, jamais collée dans la conversation ni écrite dans un fichier.

Ceci est un constat d'environnement, pas une modification du produit, du kit, ou de la mission.

## 10. Contenu du dossier de preuve

```text
AUDIT-REPORT.md                              — ce rapport
evidence/host-check.log                      — sortie de scripts/00-check-local-host.sh
evidence/network-check.log                   — sortie de scripts/02-network-check.sh (diagnostic non contractuel)
evidence/credential-presence-check.txt       — preuve de présence/absence du credential (jamais la valeur)
evidence/preflight-official-run-stdout.log   — sortie complète de scripts/03-official-preflight-only.sh (= node bin/run-preflight.js)
evidence/mono-08-preflight-v1.json           — rapport JSON officiel produit par le kit (reports/mono-08-preflight-v1.json)
evidence/frozen-before.sha256                — SHA-256 des 9 ZIP canoniques avant preflight
evidence/frozen-after.sha256                 — SHA-256 des 9 ZIP canoniques après preflight (bit-identical à before)
evidence/workspace-metadata.txt              — chemins locaux jetables (aucun secret)
evidence/runtime-env.sh                      — variables d'environnement non secrètes générées par le kit
evidence/kit-helper-SHA256SUMS.txt           — SHA256SUMS du kit d'aide local tel que fourni (vérifié OK)
SHA256SUMS                                   — empreintes de tous les fichiers de ce dossier de preuve
```

Ce dossier est autonome et permet un audit indépendant : chaque affirmation ci-dessus renvoie à un fichier de preuve vérifiable, et `SHA256SUMS` permet de confirmer qu'aucun de ces fichiers de preuve n'a été altéré après production.
