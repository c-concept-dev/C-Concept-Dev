# CDC-TRACE — MONO-06 — Frozen Regression Harness

## Contexte de reprise

Repris depuis `EvidenceForge-HANDOFF-post-MONO05-2.zip`, point de coupure
post-MONO-05 (MONO-00→05 gelés, 6/6 ; 7 lots historiques gelés).
`08-VERIFICATION/SHA256SUMS` vérifié 45/45 OK avant toute action.

**Anomalie détectée et écartée avant de commencer** : un répertoire
`/home/claude/work/MONO-06/` pré-existant, non tracé, a été trouvé dans
l'environnement de construction — exactement l'anomalie décrite en
section G de `HANDOFF-MAITRE.md`. Mis en quarantaine
(`/home/claude/UNTRACED-DO-NOT-USE/`), jamais utilisé comme point de
départ. MONO-06 a été reconstruit entièrement depuis zéro, conformément
à la consigne du kit.

## STOP soulevé pendant la reprise : isolation baseline / execution

Avant d'écrire le harnais, un STOP a été posé (format
`01-GOUVERNANCE/STOP-CONDITIONS.md`) concernant les 3 captures d'écran
Playwright de MONO-05 (`reports/screenshot-*.png`), régénérées par la
suite de tests réelle à chaque exécution, ce qui casserait une
vérification manifeste naïve après exécution même sans aucune mutation
réelle du lot gelé.

**Décision de gouvernance rendue (retenue : option 3)** : aucune nouvelle
catégorie de fichier ("mutable", "non canonique") n'est introduite dans
les contrats MONO-00→05. Le problème est resitué comme un défaut de
protocole de preuve de MONO-06 : un artefact gelé ne doit jamais servir
simultanément de spécimen d'intégrité et de workspace d'exécution
mutable. D'où l'architecture BASELINE PRISTINE / EXECUTION WORKSPACE
(voir `README.md` et `lib/workspace.js`) : la baseline pristine
(jamais exécutée) porte toute la preuve d'intégrité (manifest, hash
bytewise, nested, contrats, recherche statique) ; l'execution workspace
(jetable) porte uniquement la preuve d'exécution réelle (comptes de
tests, exit code). Aucun cas particulier "screenshot" n'a été codé dans
le harnais — les captures sont vérifiées normalement dans la baseline
pristine, jamais comparées après coup à l'état de l'execution workspace.

## Bugs réels trouvés pendant la construction (dans MONO-06 lui-même, jamais dans un lot gelé)

### Bug 1 — résolution de chemin incorrecte dans le vérificateur de manifeste
**Reproduit** : premier run complet du harnais, `MONO-01` (et en cascade
`MONO-02→05` via leurs manifestes imbriqués) rapportait `FAIL` avec
`missingFiles` sur la quasi-totalité des entrées, alors qu'une
vérification manuelle `sha256sum -c` directe passait à 106/106.
**Cause** : `verifyManifestFile` résolvait chaque chemin relatif au
dossier contenant physiquement le fichier manifeste (`manifest/`) au
lieu de la racine du sous-arbre que ce manifeste décrit.
**Correction** : chaque déclaration de manifeste dans
`artifact-registry.js` porte désormais un `baseRel` explicite (la racine
du sous-arbre décrit), jamais déduit par convention de nommage — les
7 lots historiques et les 6 lots MONO ne rangent pas leur fichier
manifeste de la même façon (`manifest/SHA256SUMS` vs
`EF-04-MANIFEST-SHA256.txt` à la racine).
**Retest** : les 6 manifestes MONO + le manifeste EF-ORCH passent à
100% après correction, sur une extraction fraîche.

### Bug 2 — comptage de tests manqué (MONO-00 : 25/27 au lieu de 27/27)
**Reproduit** : `test_mono00_classification_logic.py` produit 2 tests
`PASS` mais la ligne se termine par `PASS` sans commencer par `PASS`
(`"T00-13 (...) PASS"`), alors que le fallback de comptage cherchait
`^PASS`.
**Correction** : fallback changé pour chercher `PASS` en fin de ligne
(`\bPASS\s*$`).
**Retest** : MONO-00 = 27/27 exactement après correction.

### Bug 3 — recherche statique trop naïve (le plus important)
**Reproduit** : premier run complet, des centaines de faux positifs sur
`JMJS/S01/S02/DIMS/d4/d5` et sur le vocabulaire épistémique interdit,
remontés depuis : la documentation légitime des 7 lots historiques
(fixtures explicitement nommées pour le pilote JMJS, `MIGRATION-
HISTORIQUE.md`, `INTEGRATION-JMMJS.md`), les propres rapports de
recherche statique de chaque lot (qui *rapportent* "0 occurrence
trouvée"), les tests qui *vérifient l'absence* de dérive
(`test_t0X_no_epistemic_additions.js`), le script `scripts/static-
search.sh` de MONO-00 qui contient légitimement la liste des motifs
qu'il recherche, et `registry/mono-00-frozen-baseline-registry-v1.json`
qui catalogue en langage naturel des décisions historiques sur des
prototypes pré-généralisation.
**Cause** : absence de distinction entre "occurrence fonctionnelle" (code
qui s'exécute) et mention documentaire/méta légitime.
**Correction** : périmètre explicite et justifié (voir en-tête de
`static-search-runner.js`) —
- hardcoding pilote : limité aux 6 lots MONO (périmètre écrit de
  `REGLES-ANTI-DERIVE.md`), hors `dependencies/`, `.md`,
  `test/tests/fixtures/scripts`.
- dérive épistémique et secrets : appliqués aux 13 artefacts, hors `.md`
  et `test/tests/fixtures/scripts`.
**Retest** : après correction, 0 occurrence sur le kit propre ; les 3
scénarios adversariaux (JMJS injecté, secret injecté) restent détectés
correctement (voir tests adversariaux ci-dessous) — la correction n'a
donc pas simplement supprimé le signal, elle l'a rendu précis.

### Bug 4 — le check de contrats ne détectait pas une disparition
**Reproduit** : test adversarial "retirer un contrat JSON" (exigé par
`CRITERES-AUDIT-MONO-06.md`) — `checkContracts` rapportait `PASS` avec
un compte de fichiers simplement réduit, sans jamais comparer ce compte
à une attente.
**Correction** : ajout de `expectedJsonContractCount` par artefact dans
le registre (établi à partir du premier run propre confirmé), `FAIL`
explicite si le compte observé diminue.
**Retest** : le retrait de `contracts/run-state-v1.json` dans MONO-03
est maintenant détecté avec `countMismatch: true`, indépendamment du
manifeste.

## Non-régression globale

Rejoué réellement, extraction fraîche à chaque artefact, execution
workspace isolé :

```
MONO-00   : 27/27
MONO-01.x : 172/172
MONO-02   : 324/324
MONO-03   : 64/64
MONO-04   : 69/69
MONO-05   : 65/65 (npm install + Chromium reel)
Total MONO : 721/721

EF-ORCH v0.1  : 842/842
EF-PR-GEN-01  : 105/105
EF-02A/B/C    : 30/30
EF-02D        : 49/49
EF-02E        : 60/60
EF-03         : 100/100
EF-04         : 37/37
Total historique : 1223/1223
```

Aucun compte recopié depuis `ETAT-EN-UNE-PAGE.md` — chacun obtenu par
exécution réelle pendant la construction de MONO-06 (deux runs
indépendants, résultats identiques, voir T06-18 dans `test/run-all.js`).

## Recherche statique (résultat final, kit propre)

- Hardcoding pilote (MONO-00→05, hors `dependencies/`/`.md`/`test/`/`scripts/`) : 0 occurrence.
- Dérive épistémique (13 artefacts, même périmètre) : 0 occurrence.
- Secrets réels (13 artefacts, même périmètre) : 0 occurrence — les
  valeurs synthétiques documentées (`sk-TEST-NEVER-REAL-123`,
  `sk-VRAIMENT-SECRET-JAMAIS-DANS-LES-LOGS`) restent exclues car situées
  dans `test/`, `fixtures/`, ou de la documentation `.md`.

## Tests adversariaux exigés par CRITERES-AUDIT-MONO-06.md

Tous reproduits et confirmés détectés (voir `test/run-all.js`,
T06-HARNESS-02 à 06) :

1. Octet modifié dans `dependencies/.../ef-orch-hash-v0.1.js` (profondeur
   4, imbriqué dans MONO-05) → détecté à tous les niveaux de la chaîne
   (manifest + nested), MONO-00→04 restent `PASS`.
2. `contracts/run-state-v1.json` retiré de MONO-03 → détecté par T06-12
   (`countMismatch`), indépendamment du manifeste.
3. Chaîne `JMJS` injectée dans `MONO-02/lib/node-runners.js` → détectée
   par T06-13, et par le manifeste (défense en profondeur).
4. Secret `sk-abcdef1234567890` injecté dans
   `MONO-04/lib/external-execution-gateway.js` → détecté par T06-15.
5. Les ZIP canoniques du kit original restent bit-à-bit identiques avant
   et après un run complet du harnais.

## Limites connues et assumées de MONO-06

- `expectedJsonContractCount` est figé au moment de la construction ;
  un futur lot gelé ajoutant légitimement un contrat devra faire évoluer
  ce compte explicitement dans `artifact-registry.js` (jamais
  silencieusement).
- Le vérificateur de manifeste ne détecte pas un fichier **ajouté** qui
  ne serait listé dans aucun manifeste (comportement identique à
  `sha256sum -c` standard, qui ne vérifie que les entrées déclarées).
  Ce trou est partiellement couvert par la recherche statique et par
  `nested-dependency-verifier.js` (qui, lui, détecte bien les fichiers en
  trop dans une comparaison bytewise complète de sous-arbre — voir
  `onlyInNested`/`onlyInStandalone`), mais pas par le manifeste seul.

## Contrat / architecture impactée

Aucune. MONO-06 n'a modifié aucun lot gelé, aucun contrat, aucune state
machine, aucun ResumePolicy, aucune classification épistémique. La seule
décision de gouvernance sollicitée (isolation baseline/execution) est
une clarification du protocole de preuve de MONO-06 lui-même, pas une
modification d'un lot gelé.

## Corrections post-audit indépendant (30 août 2026, second cycle)

Verdict initial : `NON GELABLE`. Architecture générale confirmée bonne,
4 corrections ciblées exigées.

### 1. Bug T06-15 — faux vert secret (le plus critique)
**Reproduit par l'audit** : `sk-REALSECRET1234567890` placé dans
`README.md` ou `test/fixture.js` → `searchRealSecrets()` retournait
`PASS`, uniquement parce que le chemin correspondait à une exclusion
automatique (`.md`/`test/`/`fixtures/`/`scripts/`).
**Cause** : le chemin d'un fichier ne prouve jamais qu'une valeur est
synthétique — c'était une déduction implicite incorrecte.
**Correction** : T06-15 est désormais **fail-closed** — recherche sur
tous les fichiers texte du paquet, sans aucune exclusion par
dossier/extension. Seule une correspondance exacte (`artifactId` +
chemin de fichier exact + hash SHA-256 exact de la valeur trouvée) avec
une allowlist explicite (`KNOWN_SYNTHETIC_SECRETS` dans
`static-search-runner.js`) exempte une occurrence — jamais par dossier
entier. Chaque entrée de cette allowlist a été vérifiée individuellement
(valeur, fichier, justification documentée par le lot gelé lui-même).
**Retest** : 4 nouveaux scénarios adversariaux (`lib/`, `README.md`,
`test/`, `fixtures/`) confirment tous une détection `FAIL` ; un
cinquième scénario confirme qu'une valeur `sk-` non allowlistée dans un
fichier *partiellement* allowlisté reste détectée (l'allowlist agit par
hash exact, jamais par fichier entier).

### 2. Bug sécurité — recopie de la valeur complète du secret
**Reproduit** : `samples: matches.slice(0,3).map(m=>m[0])` plaçait la
valeur complète détectée dans le rapport JSON — une recherche de secret
créait une seconde fuite. **Découvert une seconde fois pendant la
correction elle-même** : les textes de justification de l'allowlist que
j'avais rédigés recopiaient eux-mêmes la valeur complète du marqueur
synthétique en clair — même défaut, dans le code correctif.
**Correction** : `redactSecret()` ne renvoie jamais qu'une forme tronquée
(`sk-V…LOGS [REDACTED]`) + un hash SHA-256 ; les textes de justification
de l'allowlist ont été réécrits pour ne plus jamais citer la valeur
littérale.
**Retest** : un test adversarial injecte `sk-REALSECRET1234567890` et
vérifie explicitement que la chaîne complète est absente de
`JSON.stringify(report)` — confirmé pour les 4 scénarios.

### 3. T06-10 — protocole `npm ci` pour MONO-05
**Cause** : le runner utilisait `npm install` pour tous les artefacts,
alors que le CDC exige explicitement `npm ci` pour MONO-05 (son propre
README documente cette méthode ; un `package-lock.json` gelé est
d'ailleurs déjà présent dans le paquet).
**Correction** : `npmInstallMode: "ci"` déclaré explicitement pour
MONO-05 dans le registre, jamais pour les autres lots (aucun ne fournit
de `package-lock.json` garantissant `npm ci`).
**Retest** : `execution.npmInstallMode === "ci"` confirmé sur un run réel
(65/65 tests), et un test dédié (`T06-HARNESS-07`) vérifie la déclaration
dans le registre.

### 4. Installations historiques non déterministes (`jsdom`)
**Cause** : `npm install --no-save jsdom` sans version fixée pour
EF-PR-GEN-01 et EF-02ABC — une future publication npm dans la plage
`^24.0.0` (déclarée, gelée, dans le `package.json` de chacun de ces deux
lots) pourrait un jour casser silencieusement la reproductibilité.
**Investigation** : version réellement résolue le 30 août 2026 pour les
deux lots = `24.1.3`, confirmée compatible par l'exécution réelle
(105/105 et 30/30).
**Correction** : `npmInstallPackageVersion: "24.1.3"` figé explicitement
dans le registre pour les deux lots, avec provenance documentée en
commentaire (jamais `latest`).

### 5. Timeouts explicites obligatoires
**Cause** : tous les `execFileSync()` du runner (installations, build
EF-ORCH, tests) pouvaient bloquer indéfiniment sans diagnostic.
**Correction** : nouveau module `lib/exec-with-timeout.js`, utilisé
partout (plus aucun `execFileSync` nu) avec 4 politiques nommées
(`DEPENDENCY_INSTALL_TIMEOUT`, `BROWSER_INSTALL_TIMEOUT`,
`TEST_TIMEOUT`, `BUILD_TIMEOUT`), jamais optionnelles. Un dépassement
produit un statut `FAIL` avec `phase` explicite (ex.
`install_timeout`), jamais un blocage ni un faux `PASS`, et n'empêche
jamais le harnais de continuer sur les autres artefacts (chaque appel
est déjà capturé individuellement).
**Retest** : test adversarial avec un processus `sleep 5` et un timeout
de 500 ms — confirmé `timedOut: true` en ~500 ms, jamais d'attente
jusqu'à la fin naturelle du processus.

## Non-régression après les 5 corrections

Rejoué réellement deux fois, résultat strictement identique :
```
MONO-00→05 : 721/721 (inchangé)
7 lots historiques : 1223/1223 (inchangé)
```
ZIP canoniques du kit original vérifiés bit-à-bit identiques avant/après.
Suite de tests de MONO-06 lui-même : 22/22 PASS (9 scénarios initiaux +
13 nouveaux/étendus pour les 5 corrections).

## Verdict proposé (second cycle)

**MONO-06 — GELABLE**

## Mise à jour R1 (rebaseline corrective, régression MONO02-CORPUS-BY-REF-MAP)

**Contexte** : un run E2E réel construit dans le cadre de MONO-07 a
démontré une régression réelle dans `MONO-02/lib/node-runners.js`
(`corpusByRefOf()` retournait un `Object` là où le module gelé
`ef-02d3-coverage-panel-v1.js` exige une `Map`). Classification officielle
de la gouvernance : `RÉGRESSION LOT GELÉ` / `BUG MODULE MONO-02`. Une
rebaseline corrective R1 a été autorisée exceptionnellement.

**Ce qui a changé dans MONO-06** :
- `lib/artifact-registry.js` : `zipPath` de MONO-02/03/04/05 pointent
  désormais vers `EvidenceForge-MONO-0X-R1.zip` (au lieu de `-v1.zip`).
  `expectedTests` de MONO-02 passe de 324 à 334 (10 tests de régression
  réels ajoutés, aucun retiré). MONO-03/04/05 gardent leur propre total
  inchangé (rebase de dépendance uniquement, aucun changement de code
  dans ces trois lots). `EXPECTED_MONO_TOTAL` passe de 721 à 731.
- `test/run-all.js` : les scénarios adversariaux résolvent désormais le
  chemin de chaque ZIP depuis `artifact-registry.js` (`zipRelFor()`),
  jamais un nom de fichier figé en dur — un test avait encore
  `"EvidenceForge-MONO-02-v1.zip"` codé en dur et échouait silencieusement
  à trouver le ZIP après le renommage en R1 ; corrigé pour que toute
  future rebaseline (R2, R3...) ne casse plus ces scénarios.

**Ce qui n'a PAS changé** : `MONO-00`/`MONO-01`/les 7 lots historiques
restent référencés tels quels (non concernés par la régression).
L'architecture du harnais (isolation baseline/execution, vérificateurs,
allowlist de secrets, timeouts) est restée intacte — aucune réécriture,
uniquement une mise à jour de baseline.

**Revérification complète effectuée contre le kit R1** :
```
MONO-00→05 : 731/731 (MONO-02 : 334, tous les autres inchangés)
7 lots historiques : 1223/1223 (inchangé)
```
Double run indépendant : rapport strictement identique. Suite de tests de
MONO-06 lui-même (22/22) rejouée avec succès contre le kit R1, y compris
les 4 scénarios adversariaux sur les secrets et l'injection JMJS.

### Verdict proposé (mise à jour R1)

**CORRECTIVE REBASELINE R1 — GELABLE** (pour la part concernant MONO-06
lui-même — voir le rapport de rebaseline dédié pour le verdict global de
l'opération R1).

## Mise à jour R2 (rebaseline corrective, deux régressions MONO-05 : lineage + réhydratation multi-nœuds)

**Contexte** : un run E2E réel (MONO-07) contre la baseline R1 a révélé
deux régressions indépendantes dans MONO-05-R1 (`MONO05-R2-REG-01` —
synchronisation lineage jamais câblée, `MONO05-R2-REG-02` — réhydratation
multi-nœuds cassée pour toute chaîne de plus d'un nœud). Les deux corrigées
dans une seule version MONO-05-R2 (décision de gouvernance : MONO-05 était
déjà rouvert et non gelé, pas de cycle R3 séparé).

**Ce qui a changé dans MONO-06** :
- `lib/artifact-registry.js` : `zipPath` de MONO-05 pointe désormais vers
  `EvidenceForge-MONO-05-R2.zip`. `expectedTests` de MONO-05 passe de 65 à
  106 (41 tests de régression réels ajoutés — 21 REG-01 + 13 REG-02 + 7
  croisé — aucun retiré). `EXPECTED_MONO_TOTAL` passe de 731 à 772.
- Aucun autre changement de code dans MONO-06 (architecture, vérificateurs,
  allowlist, timeouts : tous inchangés).

**Ce qui n'a PAS changé** : `MONO-00`/`MONO-01`/`MONO-02-R1`/`MONO-03-R1`/
`MONO-04-R1`/les 7 lots historiques restent référencés tels quels (non
concernés par ces deux régressions).

**Revérification complète effectuée contre le kit R2** :
```
MONO-00→05 : 772/772 (MONO-05-R2 : 106, tous les autres inchangés)
7 lots historiques : 1223/1223 (inchangé)
```
Double run indépendant : rapport strictement identique. Suite de tests de
MONO-06 lui-même (22/22) rejouée avec succès contre le kit R2, y compris
tous les scénarios adversariaux.

### Verdict proposé (mise à jour R2)

**CORRECTIVE REBASELINE R2 — GELABLE** (pour la part concernant MONO-06
lui-même — voir le rapport de rebaseline dédié pour le verdict global de
l'opération R2).

## Mise à jour R3 (rebaseline corrective, régression UI MONO-05 : MONO05-R3-REG-01)

**Contexte** : un vrai scénario browser E2E construit dans le cadre de
MONO-07 a révélé que `MONO-05-R2/app/client/app.js::renderReport()`
lisait `assuranceLevel` à la racine du rapport, jamais peuplé par le vrai
module `ef-04a-unified-report-v1.js` (qui l'imbrique sous
`report.lineage.lineageAssurance`). Corrigé dans MONO-05-R3.

**Ce qui a changé dans MONO-06** :
- `lib/artifact-registry.js` : `zipPath` de MONO-05 pointe vers
  `EvidenceForge-MONO-05-R3.zip`. `expectedTests` passe de 106 à 119 (13
  tests de régression réels ajoutés — 8 API + 5 navigateur Playwright).
  `EXPECTED_MONO_TOTAL` passe de 772 à 785.
- Aucun autre changement de code dans MONO-06.

**Ce qui n'a PAS changé** : `MONO-00`/`MONO-01`/`MONO-02-R1`/`MONO-03-R1`/
`MONO-04-R1`/les 7 lots historiques restent référencés tels quels.

**Revérification complète contre le kit R3** :
```
MONO-00→05 : 785/785 (MONO-05-R3 : 119, tous les autres inchangés)
7 lots historiques : 1223/1223 (inchangé)
```
Double run indépendant : rapport strictement identique. Suite de tests de
MONO-06 lui-même (22/22) rejouée avec succès. Une exécution transitoire a
initialement montré un résultat instable (114/119, chromium indisponible
dans l'espace d'exécution isolé de ce run précis) — reproduit comme un
aléa d'environnement, non reproductible sur deux exécutions
indépendantes suivantes (785/785 les deux fois, rapport identique) — donc
non retenu comme un défaut.

### Verdict proposé (mise à jour R3)

**CORRECTIVE REBASELINE R3 — GELABLE** (pour la part concernant MONO-06
lui-même — voir le rapport de rebaseline dédié pour le verdict global de
l'opération R3).

(Rappel : ce verdict n'engage que Claude. Le gel définitif appartient à
l'audit indépendant, conformément à `01-GOUVERNANCE/REGLES-DE-GEL.md`.)
