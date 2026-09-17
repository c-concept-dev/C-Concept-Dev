# MONO-00 — Rapport de vérification

Méthode : chaque paquet canonique retrouvé a été extrait dans un répertoire temporaire **neuf** (`/tmp/mono00-verify/<module>/`), sans dépendance à l'espace de travail où le code a été développé. Pour chaque paquet muni d'un manifeste, `sha256sum -c` a été exécuté et l'exhaustivité vérifiée par `diff` entre la liste réelle de fichiers et la liste du manifeste. Pour chaque paquet muni d'un `package.json`, `npm ci && npm test` a été exécuté ; pour EF-ORCH (sans `package.json`), chacun des 35 fichiers `test_*.js` a été exécuté individuellement via `node`.

## Résultats par module

| Module | Paquet | Manifeste | Exhaustif | Hashes | Tests attendus | Tests observés | Niveau de preuve |
|---|---|---|---|---|---|---|---|
| EF-ORCH | EF-ORCH-RELEASE-v0.1.zip | SHA256SUMS.txt | Non (docs + node_modules absents) | 100% concordants | 842 | 842 | VERIFIED_FROM_CANONICAL_PACKAGE |
| EF-PR-GEN-01 | EF-PR-GEN-01-FINAL.zip | absent | N/A | 2/2 réf. concordants | 105 | 105 | VERIFIED_FROM_CANONICAL_ARTIFACTS |
| EF-02A | EF-02ABC-v1.zip | absent | N/A | 1/1 réf. concordant | 12 | 12 | VERIFIED_FROM_CANONICAL_ARTIFACTS |
| EF-02B | EF-02ABC-v1.zip | absent | N/A | — | 9 | 9 | VERIFIED_FROM_CANONICAL_ARTIFACTS |
| EF-02C | EF-02ABC-v1.zip | absent | N/A | apiKeyExposedToBrowser=false confirmé | 9 | 9 | VERIFIED_FROM_CANONICAL_ARTIFACTS |
| EF-02D | EF-02D-v1.zip | EF-02D-MANIFEST-SHA256.txt | **Oui** | 100% concordants | 49 | 49 | VERIFIED_FROM_CANONICAL_PACKAGE |
| EF-02E | EF-02E-v1.zip | EF-02E-MANIFEST-SHA256.txt | **Oui** | 100% concordants | 60 | 60 | VERIFIED_FROM_CANONICAL_PACKAGE |
| EF-03 | EF-03-v1.zip | EF-03-MANIFEST-SHA256.txt | **Oui** | 100% concordants | 100 | 100 | VERIFIED_FROM_CANONICAL_PACKAGE |
| EF-04 | EF-04-v1.zip | EF-04-MANIFEST-SHA256.txt | **Oui** | 100% concordants | 37 | 37 | VERIFIED_FROM_CANONICAL_PACKAGE |
| EF-02ABC-SMOKE-REAL | — | — | — | — | — | — | HISTORICAL_FREEZE_CONFIRMED |

**Total : 1223/1223 tests rejoués et passants**, exactement le total historique documenté.

## Hashes de référence du CDC — tous confirmés

```
EF-ORCH monolithe :                       9d78c26a0c6063ff86a3d223c1f2e4a252c8c8cd1274c6998e15b5df42f00b2a  ✓
ef-orch-hash-v0.1.js :                    8722ec43529d848d3f1a0bebfe75d12682ba2ac7963e94edf4c18c006d8032e4  ✓
ef-pr-gen-mission-dimension-set-v1.js :   750cb892d674e402d6cf16980a41ca1174bd5bc3b66d22715d98d76dc79040de  ✓
```

Ces trois valeurs ont été **recalculées indépendamment** depuis les paquets extraits à froid — jamais simplement recopiées depuis le CDC.

## Correction 3 (post-audit) — Dépendances externes EF-ORCH inexactes

EF-ORCH était déclaré `llm=false`/`networkDependency=false` dans la version précédente du registre. **Vérifié inexact par grep direct dans le code gelé.**

**Investigation** : aucun appel LLM direct n'existe nulle part dans l'exécuteur gelé (recherche `fetch`/`api.anthropic`/`workerCallFn`/`clone-proxy.workers` : 0 résultat hors fichiers de test). En revanche, les commentaires d'EF-01B et EF-01C1 documentent explicitement une dépendance LLM **indirecte/en amont** : « N'appelle JAMAIS le Worker/Anthropic pendant l'exécution — la résolution LLM appartient à la pré-analyse antérieure à la confirmation du RunContract (décision architecturale actée). » EF-01C2 a une dépendance réseau **directe et réelle** confirmée : trois fichiers runners dédiés (`ef-orch-ef01c2-runner-openalex-v0.1.js`, `-crossref-`, `-pubmed-`).

**Représentation corrigée** : `llmDependency = "INDIRECT_UPSTREAM"` (jamais un simple `true`, qui surstatuerait ce que le code exécuteur fait réellement au runtime) ; `externalDependencies` liste précisément LLM (indirect/amont), OpenAlex/Crossref/PubMed (directs, EF-01C2). Voir `mono-00-contract-matrix-v1.json`/`.md` et la fiche EF-ORCH du registre principal.

**Nouveau test T00-15** (External dependency inventory) ajouté pour empêcher toute régression de ce type — 13/13 PASS.

## Écart trouvé — manifeste EF-ORCH non exhaustif au sens strict

`SHA256SUMS.txt` (72 entrées) couvre uniquement `code/*.js`. Il ne couvre pas :
- les 8 fichiers `.md` de documentation à la racine (README.md, RELEASE-NOTES.md, HASH-CONVENTIONS.md, etc.) ;
- l'arborescence vendorisée `code/node_modules/fake-indexeddb/` (dépendance tierce npm).

Tous les hashes **déclarés** dans le manifeste concordent à 100%. Cet écart ne remet pas en cause l'intégrité du code canonique lui-même — il signale seulement que le périmètre du manifeste est plus étroit que « tout le contenu du paquet ». Documenté ici plutôt que silencieusement ignoré ou présenté comme bloquant à tort.

## Absence de manifeste — EF-PR-GEN-01, EF-02A, EF-02B, EF-02C

Ces quatre lots précèdent la convention de manifeste établie à partir d'EF-02D. Aucun `EF-XX-MANIFEST-SHA256.txt` n'existe pour eux. La vérification s'est donc limitée aux hashes de référence explicitement cités dans le CDC (2 valeurs) plus le rejeu intégral des tests — d'où leur classement `VERIFIED_FROM_CANONICAL_ARTIFACTS`, jamais `VERIFIED_FROM_CANONICAL_PACKAGE`, conformément à la hiérarchie de preuve du CDC.
