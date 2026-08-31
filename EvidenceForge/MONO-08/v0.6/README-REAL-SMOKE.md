# EvidenceForge — MONO-08 — Real Smoke — Kit d'execution

## MONO-08 v0.6 — Delegated LLM Authentication

Cette version (v0.6) ajoute `LLM_AUTH_MODE` à la configuration existante,
sans rien changer au reste de ce README pour le mode `direct` (strictement
rétrocompatible). Référence normative :
`EvidenceForge/MONO-08/MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md` et
`MONO-08-v0.6-ACCEPTANCE-MATRIX.md`.

```text
LLM_AUTH_MODE absent          -> direct  (comportement v0.5 inchangé)
LLM_AUTH_MODE=direct          -> direct
LLM_AUTH_MODE=delegated       -> delegated (Worker evidenceforge-llm-proxy)
toute autre valeur explicite  -> PRODUCT_CONFIG_ERROR (exit code 3),
                                  aucun provider appelé, aucune requête réseau
```

**Mode `direct`** (défaut) : identique à v0.5. `ANTHROPIC_API_KEY` requise
localement, envoyée à `LLM_WORKER_BASE_URL` (défaut
`https://api.anthropic.com`).

**Mode `delegated`** : EvidenceForge n'a besoin — et ne doit jamais avoir
besoin — de connaître `ANTHROPIC_API_KEY`. Seule
`EVIDENCEFORGE_WORKER_API_KEY` est requise localement, envoyée à
`LLM_WORKER_BASE_URL` pointé vers un déploiement réel du Worker dédié
`evidenceforge-llm-proxy` (voir `worker/evidenceforge-llm-proxy/README.md`
pour son contrat complet et son statut de déploiement — **non déployé par
ce lot**).

**Statut de ce lot d'implémentation : `IMPLEMENTATION READY FOR
INDEPENDENT AUDIT`.** Tous les tests `LOCAL_CONTROLLED` prévus par
l'`ACCEPTANCE-MATRIX` (cas A, B, C, D, E, F, J, K, H2) ont été exécutés et
passent (`test/test_t08_v06_delegated_auth.js`,
`worker/evidenceforge-llm-proxy/test/worker.test.js`). Le cas G (REAL,
Worker Cloudflare réellement déployé) n'a **pas** été exécuté — il reste
soumis à un audit indépendant et une autorisation distincte, conformément
au CDC section 5.3/11.3.

---

**Statut actuel (héritage v0.5) : ENVIRONMENT_BLOCKED.** Ce kit a ete construit dans un
environnement dont l'egress reseau est restreint par liste blanche
(OpenAlex/Crossref/PubMed refuses par le proxy) et sans identifiant LLM
exploitable. Aucun Real Smoke n'a donc ete execute — voir
reports/mono-08-preflight-v1.json pour la preuve exacte.

**implementation path : COMPLETE, verifie en LOCAL_CONTROLLED (26/26).** Le
chemin READY enchaine reellement `baseline gate -> preflight -> mission
gate -> construction EF-ORCH complete (RunContract, SearchProtocol,
ScreeningArtifact, etc.) -> EF-ORCH-SUBSYSTEM SUCCESS -> CorpusSnapshot
valide -> 14/14 SUCCESS -> reprise apres redemarrage -> UI smoke reel ->
injection/consommation reelle de secret (voie SecretProvider geleee,
consommation prouvee) -> 0 fuite -> integrite ZIP mesuree avant tout run
et apres l'UI smoke inclus -> detection adversariale d'une mutation
volontaire sur une copie jetable` (voir test/test_t08_eforch.js, 26/26
PASS, confirme stable sur executions repetees). **real evidence not
executed in this environment** (reseau bloque) — mais l'implementation
elle-meme est desormais `READY` pour toutes les etapes du pipeline (voir
la matrice de preuves, `implementationStatus: READY`), a l'exception de
Crossref/PubMed (non cables, la mission actuelle n'utilisant qu'OpenAlex)
et du scenario "external failure fail-closed" en contexte de mission
complete (restes
`PARTIAL`).

## Prerequis

- Node.js (meme version que MONO-05/06/07).
- Un kit contenant la baseline gelee R3 (MONO-00 a MONO-06-R3),
  identique a celui utilise pour MONO-07.
- Le repertoire lib/ de MONO-07 (pour reutiliser mono06-gate.js tel
  quel — jamais une reimplementation).
- Acces reseau sortant vers api.openalex.org, api.crossref.org, et au
  moins un fournisseur LLM reel.
- Un identifiant LLM exploitable (ex: ANTHROPIC_API_KEY).

## Variables d'environnement

Copier .env.example vers .env et renseigner reellement (jamais de
valeur reelle committee) :

```
cp .env.example .env
# editer .env avec les vraies valeurs
```

Variables supplementaires necessaires a l'execution :

```
export EVIDENCEFORGE_KIT_ROOT=/chemin/vers/le/kit/R3
export EVIDENCEFORGE_MONO07_LIB_PATH=/chemin/vers/MONO-07/lib
export EVIDENCEFORGE_PERSISTENCE_DIR=/chemin/vers/un/repertoire/durable
```

## Procedure

```
# 1. Extraire ce kit
unzip EvidenceForge-MONO-08-REAL-SMOKE-KIT-v0.5.zip
cd MONO-08

# 2. Aucune dependance npm propre a ce kit a ce stade (modules Node natifs uniquement)

# 3. Renseigner les variables (voir ci-dessus)

# 4. Verifier le reseau et les identifiants — NE PROCEDER QUE SI READY
node bin/run-preflight.js
echo "exit code: $?"
# 0 = READY, 2 = ENVIRONMENT_BLOCKED, 3 = PRODUCT_CONFIG_ERROR

# 5. Uniquement si READY : lancer le Real Smoke
node bin/run-real-smoke.js "$EVIDENCEFORGE_KIT_ROOT"

# 6. Recuperer les rapports
ls reports/
```

## Sorties attendues

- reports/mono-08-preflight-v1.json — statut reel de chaque fournisseur.
- reports/mono-08-real-smoke-trace-v1.json — trace complete du run.
- reports/mono-08-evidence-matrix-v1.json — matrice de preuves.
- reports/mono-08-test-report-v1.json — matrice de tests (PASS/FAIL/
  BLOCKED/NOT_RUN — jamais un total global trompeur).

## Nettoyage

```
rm -rf "$EVIDENCEFORGE_PERSISTENCE_DIR"/mono08-*
```

Ne jamais committer .env ni aucun identifiant reel.

## Mission

Voir MISSION.md et fixtures/mission-real-smoke-v1.json. Mission
PARTIELLEMENT prete : 1 professionnel verifie (Maarten Marx, ORCID reel)
+ 1 document cible verifie (climateassessment.ca.gov) sont deja
identifies. Configuration ET confirmation des references reelles
restantes sont requises avant execution : un second professionnel
(piste identifiee, ORCID non confirme) et un second document cible (a
identifier) doivent etre confirmes/completes par l'operateur dans
fixtures/mission-real-smoke-v1.json (readyForExecution doit passer a
true) avant que bin/run-real-smoke.js n'accepte de lancer le pipeline
complet — fail-closed automatique tant que des entrees restent
OPERATOR_INPUT_REQUIRED.

## Tests

```
node test/test_t08_matrix.js "$EVIDENCEFORGE_KIT_ROOT"          # matrice reelle (baseline/integrite/statique + REAL SMOKE NOT_RUN)
node test/test_t08_preflight.js                                  # PRE-FLIGHT SELF TESTS v0.5 (LOCAL_CONTROLLED, serveurs simules) — inchange, non-regression verifiee
node test/test_t08_runner_orchestration.js                       # RUNNER ORCHESTRATION SELF TESTS (LOCAL_CONTROLLED, fail-closed)
EVIDENCEFORGE_MONO07_LIB_PATH=/chemin/vers/MONO-07/lib node test/test_t08_eforch.js "$EVIDENCEFORGE_KIT_ROOT"   # EF-ORCH + full 14-node + secret injection/no-leak + integrity before/after + adversarial (26/26)
node test/test_t08_v06_delegated_auth.js                         # MONO-08 v0.6 — cas A,B,C,D,E,F,J,K + revue structurelle H2 (LOCAL_CONTROLLED, aucun reseau reel)
node worker/evidenceforge-llm-proxy/test/worker.test.js          # Worker evidenceforge-llm-proxy (LOCAL_CONTROLLED, aucun deploiement Cloudflare)
```

Ces six fichiers valident le RUNNER et le CODE, jamais le Real Smoke
lui-meme — leurs resultats ne sont jamais ecrits comme T08-03/04/... PASS
dans la matrice officielle. `test_t08_v06_delegated_auth.js` et
`worker.test.js` ne constituent jamais une preuve REAL du cas G (CDC
section 5.3/5.4) — voir `MONO-08-v0.6-ACCEPTANCE-MATRIX.md`.

## Ce que ce kit N'EST PAS (section 2 du CDC)

Ce kit ne remplace jamais un fournisseur reel indisponible par un mock,
une fixture, ou le serveur synthetique de MONO-07. Si le pre-vol echoue,
bin/run-real-smoke.js s'arrete — il ne bascule jamais silencieusement
vers des donnees synthetiques presentees comme reelles.
