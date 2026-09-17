# tools/EvidenceForge — bundle canonique EvidenceForge (lots gelés + monolithes + kits)

Miroir **byte-identique** du bundle de travail local `evidenceforge-work/` (import du 2026-09-17, décision du propriétaire :
le dépôt GitHub `c-concept-dev/C-Concept-Dev`, branche `main`, devient la source de travail principale). La disposition
relative est conservée à l'identique pour que **toutes les configurations gelées restent valides sans modification**
(`bundleRoot: ".."`, `operatorKit: "../../../EF-01B-v0.2-r2"`).

```
tools/EvidenceForge/
  r6/EvidenceForge-CLEAN-MONO-01-08/      bundle R6 : MONO-00 … MONO-11 (lots gelés + zips canoniques), AUDIT-REMEDIATION, TEST-REPORTS,
                                            MONOLITH-v1.0 … v1.0.4 (GELÉE, zip 97b999ad…), MONOLITH-v1.0.5 (CANDIDAT, chantier coût / screening)
  EF-01B-v0.2-r2/                          kit d'exploitation : résolveur de disciplines (gelé)
  EF-01C1-v0.2-r2/                         kit d'exploitation : planificateur de recherche (gelé)
```

Règles (gouvernance EvidenceForge, inchangées par l'import) :
- **aucun lot déclaré GELÉ n'est modifié** ; chaque monolithe vérifie les sceaux et les zips canoniques au démarrage (fail-closed) ;
- toute évolution est **additive**, versionnée comme nouveau candidat à côté du précédent ; les contrats scientifiques, les portes
  humaines, la lignée, les checkpoints, les hashes et les mécanismes fail-closed restent protégés ;
- **aucun secret** : les identifiants du fournisseur viennent uniquement de l'environnement (`LLM_AUTH_MODE`, `LLM_WORKER_BASE_URL`,
  `EVIDENCEFORGE_WORKER_API_KEY`) ; `tools/secret-scan.js` de chaque monolithe le vérifie ;
- les `runs/` (état mutable, artefacts de runs réels) ne sont **pas** dans le dépôt : ils vivent dans `EVIDENCEFORGE_RUNS_ROOT`
  (les runs réels sont des preuves, jamais réécrites).

`.gitignore` du dépôt : exception `!tools/EvidenceForge/**` (les règles génériques `lib/`, `*.log`, … ne s'appliquent pas ici).
`tools/EvidenceForge-Audit/` est l'ancienne copie partielle de v1.0.4 (sans `lib/`), conservée telle quelle comme historique.

Démarrage du candidat v1.0.5 (aucun appel tant qu'aucun run n'est créé) :

```
cd tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.5
LLM_AUTH_MODE=delegated LLM_WORKER_BASE_URL=<worker> EVIDENCEFORGE_WORKER_API_KEY=<secret> \
EVIDENCEFORGE_LLM_MODEL=claude-sonnet-4-6 EVIDENCEFORGE_RUNS_ROOT=<dossier de runs> EVIDENCEFORGE_PORT=8768 node server.js
node test/test-monolith.js            # 116 tests (fakes, aucun réseau)
node tools/browser-tests-v105.js      # 20 tests navigateur (Chrome headless, serveur sans identifiants)
```
