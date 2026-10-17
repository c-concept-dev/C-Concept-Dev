# EVIDENCEFORGE MONOLITH v1.0.15 — AUDIT INDÉPENDANT AVANT GEL

- **Sujet** : candidate `MONOLITH-v1.0.15` (non active, non fumée), dans
  `/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.15/`
- **Auditeur** : agent indépendant, lecture seule sur le dépôt, n'ayant participé à aucun développement de ce produit.
- **Date** : 2026-09-22
- **Méthode** : arbre `tools/EvidenceForge/` intégralement recopié dans un répertoire temporaire hors dépôt ; toutes les
  mutations appliquées à la COPIE, jamais à l'arbre canonique ; harnais complet réexécuté après chaque mutation puis code restauré.
- **0 appel fournisseur** : aucune clé dans l'environnement ; harnais complet réexécuté sous un blocage actif de toute
  connexion sortante non locale — **332/332 et 0 tentative de connexion comptée**.

---

## VERDICT

> ## `V1_0_15_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`
>
> **Aucun blocker.** 11 réserves, dont **2 de sévérité MEDIUM**, toutes **transportables** (aucune n'empêche le gel,
> deux conditionnent le smoke et l'activation).
>
> - **Recommandation de gel : GELER**, avec les 11 réserves inscrites au dossier de gel.
> - **Recommandation de smoke : `SMOKE_AUTHORIZED_WITH_CONDITIONS`** (périmètre au § 12 ; le smoke n'a **pas** été lancé).
> - `ACTIVE_VERSION` reste `MONOLITH-v1.0.10` — **non modifiée** (vérifié).

**Pourquoi PASS et non PASS tout court** : les huit critères de PASS énoncés par le propriétaire sont tous satisfaits et
mesurés (§ 2 à § 8). Mais l'audit a trouvé, en le mesurant, un **mutant survivant** que le chantier n'avait pas prévu
(`XPIPE`, § 6) : le câblage de production de `lib/pipeline.js` n'a **aucune** couverture comportementale. Sa conséquence
au runtime est un refus fatal — donc **pas** d'appariement silencieux — mais la forme du trou de R1 subsiste côté tests.
C'est la réserve **A1**, et c'est la raison de la mention « avec réserves ».

**Pourquoi pas FAIL** : aucune permutation cible/document n'est possible silencieusement. Les trois réserves bloquantes
pour activation de l'audit v1.0.14 (**R1**, **R2**, **R4**) sont **fermées**, chacune par une mesure comportementale
indépendante, et les deux mutants qui survivaient en v1.0.14 (`X1` et `M4c`) sont **tués**.

---

## 1. DIFF RÉEL v1.0.14 → v1.0.15 (mesuré)

Commande : `diff -rq MONOLITH-v1.0.14 MONOLITH-v1.0.15` puis `shasum -a 256` fichier par fichier.

### 1.1 Fichiers RUNTIME

| Fichier | Rôle | sha256 v1.0.14 | sha256 v1.0.15 |
|---|---|---|---|
| `lib/target-identity.js` | **NOUVEAU** — source unique de l'identifiant `target-NN` et de la carte canonique des documents normalisés | *(absent)* | `02f6d2e9…6cf16ad` |
| `lib/ef03b-resilience.js` | adaptateur EF-03B : dérive l'autorité, 3 gardes d'identité, registre lié à la cible | `ea86f115…1c3d99` | `f3fd0fa1…d57d504f` |
| `lib/pipeline.js` | câblage : remet `targetDocuments: targetDocs` à l'adaptateur (plus de lambda ni de table d'autorité) | `de4049c4…ad0e5a9f` | `b7a5d5e6…d0b89bad` |
| `lib/stage-report.js` | **4ᵉ fichier runtime modifié** — une seule ligne : la clé de `targetLabels` passe de l'expression positionnelle littérale à `TI.targetIdOf(d, i)` | `0e67295b…c88664beb` | `ae1dec38…04021b9d` |

`lib/stage-report.js` n'était **pas** dans la liste annoncée par le mandat (il figure bien dans le tableau de l'auteur).
Il est audité séparément au § 10 : **parité de rapport prouvée, aucune dérive scientifique**.

### 1.2 Fichiers critiques **byte-identiques** (contrôle demandé)

| Fichier | État | sha256 (identique des deux côtés) |
|---|---|---|
| `lib/stage-professionals.js` | **BYTE-IDENTIQUE** ✔ | `46f2b48f…e481b085` |
| `tools/ef03b-registry-import.js` | **BYTE-IDENTIQUE** ✔ | `70502a66…4ab69d7b1c5` |
| `lib/llm.js` | BYTE-IDENTIQUE | `34816352…828f8fac2` |
| `lib/run-store.js` | BYTE-IDENTIQUE | `ab41ebc3…63a5be7d` |
| `lib/document-chunker.js` | BYTE-IDENTIQUE | `6a795396…c6295d164e9935` |
| `lib/economic-panel.js` | BYTE-IDENTIQUE | `cbf4307c…67cf54ebb` |
| `lib/panel-sufficiency.js` | BYTE-IDENTIQUE | `fd05e26b…89bf7a3e` |
| `server.js` | BYTE-IDENTIQUE | `8f567af1…f19f073b` |
| `test/test-v1014-normalized-authority.js` | BYTE-IDENTIQUE | `3b0938fe…83eafe7da` |

### 1.3 Autres fichiers modifiés (non runtime, ou dérivés)

`test/test-v1015-authority-identity.js` (**nouveau**), `test/test-v1014-e2e-wiring.js`, `test/test-ef03b.js`,
`test/test-ef03b-lineage.js`, `test/test-v1012-lineage-parity.js`, `test/test-stream.js`, `test/results*.json` (sorties),
`config/monolith.config.json` (chaîne de version + `$comment`), `tools/build-manifest.js` (chaîne de provenance),
`tools/package.sh` (nom du zip), `tools/ef03b-autopsy.js` (chaîne `schemaVersion`), `README.md`, `MANIFEST.json`,
`SHA256SUMS.txt`. **Aucune logique scientifique, aucune agrégation, aucun reporting scientifique n'est touché** (§ 10).

### 1.4 Lots gelés et périmètre du dépôt

- `verifyFrozenLots()` : **MONO-01 106 fichiers, MONO-09 9, MONO-10 79 (zip canonique conforme), MONO-11 55 — 0 divergence au total.**
- Depuis le commit de gel de v1.0.14 (`c12da200`) jusqu'à `HEAD` : `git diff --stat` = **173 fichiers, uniquement des AJOUTS**
  (le dossier `MONOLITH-v1.0.15/`), **0 fichier modifié, 0 supprimé**. `MONO-01`, `MONO-09`, `MONO-10`, `MONO-11`,
  `ACTIVE_VERSION`, `MONOLITH-v1.0.10`, `-v1.0.12`, `-v1.0.13`, `-v1.0.14` : **aucune modification**.
- `cat ACTIVE_VERSION` → `MONOLITH-v1.0.10` ✔

**Conclusion § 1** : la portée annoncée est confirmée, **à un fichier runtime près** (`lib/stage-report.js`), que l'auteur
déclare et que j'ai mesuré comme sémantiquement inerte.

---

## 2. R1 — IDENTITÉ CIBLE ↔ DOCUMENT : `TARGET_DOCUMENT_IDENTITY_PASS`

Sonde indépendante (`probe.js`), **chemin de production** : `EF3.createReviewAdapter({ targetDocuments })` →
`RE.runEnforcedReview` du **lot gelé MONO-11 v0.4** → registre. LLM factice scripté, 0 réseau.

Fixtures : **3 documents distincts**, hashes distincts, longueurs distinctes (90 / 106 / 86 caractères) et
**transformations de normalisation distinctes** (`APOSTROPHE+LINE_ENDINGS` / `NBSP` / `DOUBLE_QUOTE`).

| Cible | `requestedTargetId` == `canonicalTargetId` | `sha256(authority)` | `sha256(document normalisé canonique)` | `sha256(document examiné par le lot)` | `registry.targetId` | citation du bon document conservée |
|---|---|---|---|---|---|---|
| target-01 | oui | `349be9901ccb…` | `349be9901ccb…` | `349be9901ccb…` | `target-01` | oui |
| target-02 | oui | `6a67d275d6c4…` | `6a67d275d6c4…` | `6a67d275d6c4…` | `target-02` | oui |
| target-03 | oui | `ccc9661a6a17…` | `ccc9661a6a17…` | `ccc9661a6a17…` | `target-03` | oui |

Pour chaque cible : l'autorité **ne contient aucune** des citations propres aux deux autres documents, et n'est **jamais**
le contenu brut. Revues acceptées à la passe 1, entrée de registre unique et liée.

### Multi-cible réelle, cas A à F

| Cas | Résultat mesuré |
|---|---|
| A. target-01 reçoit target-01 | **PASS** (tableau ci-dessus) |
| B. target-02 reçoit target-02 | **PASS** |
| C. target-03 reçoit target-03 | **PASS** |
| D. mutant « autorité de target-01 pour toutes les cibles » | **REFUS FATAL** `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` sur target-02 **et** target-03 |
| E. permutation target-01 ↔ target-02 | **REFUS FATAL** `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` des deux côtés |
| F. cible inexistante (`target-42`) | **REFUS FATAL** `DOCUMENT_AUTHORITY_UNKNOWN_TARGET`, `fatal === true` |

**Aucune permutation silencieuse n'a pu être produite.** R1 est **FERMÉE**.

---

## 3. R1-06 — DOSSIER_TOO_LARGE / FALLBACK : `FALLBACK_AUTHORITY_IDENTITY_PASS`

Ce chemin **est** exerçable hors réseau : `EP.buildReviewTargets` est une fonction pure. Je l'ai exercé réellement.

| Mesure | Valeur |
|---|---|
| Mode réel déclenché | `PER_DOCUMENT` (repli explicite) |
| Raison journalisée | `DOSSIER_TOO_LARGE: 282 caracteres > dossierMaxChars 50 — repli PER_DOCUMENT (explicite, journalise)` |
| Cibles produites | **3** (une par document source, dans l'ordre d'entrée) |
| Attribution des `targetId` | positionnelle : `target-01, target-02, target-03` |
| Autorité reçue par chaque cible | le document **normalisé de cette cible** (vérifié pour les 3) |
| Traversée complète pipeline→adaptateur→lot gelé sur target-02 | autorité == `sha256(normalisé du 2ᵉ document)`, revue `complete` |

Contrôle complémentaire, mode **non** replié (`MISSION_DOSSIER`, 1 cible concaténée) : 1 cible, autorité ==
dossier normalisé. **La garantie targetId ↔ document est préservée dans les deux modes.** Ce n'est pas `UNPROVEN` :
c'est mesuré.

---

## 4. R2 — GARDE D'IDENTITÉ : matrice complète des gardes

Mesure : pour chaque autorité injectée, on note **exactement** quelle garde se déclenche (chemin de production, carte
canonique présente).

| Cas | Garde déclenchée |
|---|---|
| document correct | *aucune* — accepté |
| document **tronqué mais normalisé** | `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` |
| **autre** document normalisé | `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` |
| **même longueur, contenu différent** | `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` |
| autorité portant un **mauvais `targetId`** | `DOCUMENT_AUTHORITY_TARGET_MISMATCH` |
| contenu **brut** (non normalisé) | `DOCUMENT_AUTHORITY_NOT_NORMALIZED` (garde secondaire, avant l'identité) |
| document correct **+ suffixe** (plus long) | `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH` |
| prompt gelé portant `target-02`, passe déclarant `target-01` | `DOCUMENT_AUTHORITY_TARGET_MISMATCH` (`promptTargetId = target-02`) |
| cible hors du jeu du run | `DOCUMENT_AUTHORITY_UNKNOWN_TARGET` |

Les trois gardes sont **indépendantes et non redondantes** — démonstration mesurée : en **désactivant la carte
canonique** (mode « autorité fournie » seule), la garde d'identité disparaît mais la garde de **préfixe**, qui ne dépend
que du prompt construit par le lot gelé, prend le relais :

| Cas, **sans** carte canonique | Garde déclenchée |
|---|---|
| tronqué | `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` |
| autre document | `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` |
| même longueur, contenu différent | `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` |
| correct | *aucune* — accepté |
| **correct + suffixe (plus long)** | ***aucune* — ACCEPTÉ** ← réserve **A2** |

### Absence de dépendance au point fixe (§ 6 du mandat)

Mesuré : `normalizeText(tronqué).normalized === tronqué` → **vrai** ; `normalizeText(autre document).normalized ===
autre document` → **vrai**. Les deux **sont** des points fixes et les deux sont désormais **refusés par identité**.
`normalize(authority) === authority` n'est donc **jamais** la seule preuve d'identité sur le chemin de production.
**R2 est FERMÉE**, sous la réserve de portée **A2**.

---

## 5. `lib/target-identity.js` — nouvelle autorité technique

| Contrôle | Mesure |
|---|---|
| Construction `target-NN` déterministe | `targetIdAt(0) = target-01`, `targetIdAt(11) = target-12` |
| Même ordre / même normalisation que MONO-11 | **4 jeux de documents, 13 cibles comparées, 0 divergence** avec une construction indépendante reproduisant `lib/stage-professionals.js:329` puis `MONO-11/v0.4/core/autonomous-run.js:158` (`TN.normalizeTargetDocument`) |
| Aucune logique parallèle divergente | la normalisation vient **exclusivement** du module gelé `core/target-normalizer.js` |
| Pas de hardcoding d'un nombre de cibles | 13 documents → `target-13` produit correctement |
| Pas d'hypothèse spécifique au run historique | aucune constante de run ; `anti-hardcoding-scan` : 0 hit, 0 jeton de cas |
| Fail closed | `TARGET_DOCUMENT_SET_EMPTY`, `TARGET_ID_DUPLICATE`, `TARGET_DOCUMENT_CONTENT_MISSING`, `TARGET_ID_MALFORMED` — les 4 vérifiés |

**Divergence latente trouvée (réserve A6)** : `TI.targetIdOf(doc, i)` **honore** un `targetId` déjà porté par le
document, tandis que l'expression de `lib/stage-professionals.js` (gelée par contrat) **l'ignore** et attribue toujours
la position. Mesuré : un document portant `targetId: "target-05"` donne `target-05` côté `TI` et `target-01` côté étage
professionnel. **Non atteignable en production** : mesuré sur le run réel `efm-20260918-a64167c0`, les 9
`executionMission.targetDocuments` ne portent **aucun** `targetId`, et `EP.buildReviewTargets` n'en produit jamais.

---

## 6. MATRICE DE MUTATION INDÉPENDANTE (numérotation du PROPRIÉTAIRE)

Chaque mutant est appliqué à la **copie** de l'arbre complet, le harnais **complet** est réexécuté, puis le fichier est
restauré à l'octet près. Ligne de base de la copie vérifiée **avant** toute mutation : **332/332**.

| Mutant (propriétaire) | Mutation appliquée | Fichier | Correspondance auteur | Score | Résultat | Tests rouges |
|---|---|---|---|---|---|---|
| **M1** | autorité de la **première** cible rendue pour **toutes** les cibles (= mutant `X1` survivant de l'audit v1.0.14) | `lib/ef03b-resilience.js` | = `M7` de l'auteur | 329/332 | **TUÉ** | `RA2-E2E-07`, `R1-01`, `R1-04` |
| **M2** | index de cible décalé (`target-NN` → `target-NN+1`) dans la source unique | `lib/target-identity.js` | = `M2` de l'auteur | 317/332 | **TUÉ** | `P2`, `T-STREAM-21`, `RA2-E2E-01..08`, `R1-03`, `R1-04`, `R1-05`, `R1-06`, `R2-07` (15) |
| **M3** | autorité **tronquée mais normalisée** dans la carte canonique | `lib/target-identity.js` | = `M3` de l'auteur | 283/332 | **TUÉ** | 49 tests, dont `T-EF03B-01..33`, `V12-02..08`, `V12-16/17`, `RA2-E2E-01..08`, `R1-01/02/04/05`, `R2-02/07/08` |
| **M4** | **autre document normalisé** servi comme autorité (décalage circulaire dans la carte) | `lib/target-identity.js` | **nouveau** (l'auteur mutait le contenu **brut**) | 324/332 | **TUÉ** | `RA2-E2E-07`, `R1-01`, `R1-02`, `R1-04`, `R1-05`, `R2-02`, `R2-03`, `R2-08` |
| **M5** | comparaison d'identité **supprimée** (retour à la seule garde de point fixe de v1.0.14) | `lib/ef03b-resilience.js` | = `M6` de l'auteur | 326/332 | **TUÉ** | `RA2-E2E-08`, `R1-02`, `R2-01`, `R2-02`, `R2-03`, `R2-08` |
| **M6** | garde d'import de registre **neutralisée en conservant le texte source** (`if (false && …)`) = mutant `M4c` survivant de l'audit v1.0.14 | `tools/ef03b-registry-import.js` | = `M4c` de l'auteur | 330/332 | **TUÉ** | `R4-02`, `R4-03` |
| **M7** | `documentAuthoritySha256` calculé sur la **mauvaise cible** | `lib/ef03b-resilience.js` | **nouveau** | 331/332 | **TUÉ** | `R1-01` *(un seul test — réserve **A3**)* |
| **M8** | `targetId` correct mais document d'une **autre cible ajusté à la MÊME LONGUEUR** | `lib/target-identity.js` | **nouveau (demandé par le propriétaire)** | 324/332 | **TUÉ** | `RA2-E2E-07`, `R1-01`, `R1-02`, `R1-04`, `R1-05`, `R2-02`, `R2-03`, `R2-08` |
| **`XPIPE`** | **NOUVEAU, de l'auditeur** : après construction de l'adaptateur, le **lot gelé** reçoit un **ordre de cibles différent** — le **texte des deux lignes de câblage est inchangé** | `lib/pipeline.js` | — | **332/332** | **SURVIVANT** | *(aucun)* |

**M1..M8 sont tous tués.** Les deux mutants qui survivaient en v1.0.14 (`X1` = M1, `M4c` = M6) sont tués.

**M8 a aussi été tué au niveau des données**, hors mutation de code : une autorité de même longueur que le document
canonique mais de contenu différent (point fixe vérifié) est refusée par `DOCUMENT_AUTHORITY_IDENTITY_MISMATCH`
(85 caractères contre 85), de même que le document d'une autre cible rogné à la même longueur.

### `XPIPE` — le mutant survivant, et ce qu'il signifie exactement

`R1-06` est, de l'aveu de l'auteur, une **assertion de texte source** : elle vérifie par expression régulière que
`lib/pipeline.js` contient `targetDocuments: targetDocs })` pour l'adaptateur et `targetDocuments: targetDocs,` pour le
lot gelé. `XPIPE` laisse ces deux lignes **intactes** et introduit, **entre** les deux, un renversement de l'ordre du
tableau. Les deux expressions régulières passent donc toujours, et **aucun test du harnais ne tombe**.

J'ai mesuré la conséquence réelle de ce défaut, en reproduisant exactement la situation (adaptateur construit sur
l'ordre A,B,C ; lot gelé exécuté sur l'ordre C,B,A ; `target-01` demandé) :

```
lot target-01 contient la citation du document C : true
autorite adaptateur target-01 sha: 8e6f8a9ceba6…   lotDoc sha: 22e871196248…
RESULTAT : REFUS FATAL — DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE | fatal = true
```

**Lecture honnête** : la garde (c), fondée sur le prompt gelé et **indépendante de la carte**, arrête le défaut
*fail closed*. Il n'y a **pas** d'appariement silencieux, et c'est précisément ce que le mandat exige. Mais la
**couverture de test** du câblage de production reste nulle : c'est la même forme de trou que R1 en v1.0.14, avec une
conséquence désormais bénigne. → réserve **A1**, MEDIUM, non bloquante.

---

## 7. R4 — IMPORT DE REGISTRE, COUVERTURE COMPORTEMENTALE

`tools/ef03b-registry-import.js` est **byte-identique** à v1.0.14 (§ 1.2) : la question n'est pas le comportement mais
la **couverture**.

- `R4-01..R4-05` exécutent réellement `importRun` sur un run de fixture (lus et vérifiés : ce ne sont **pas** des
  assertions de texte source ; ils sont explicitement étiquetés `[COMPORTEMENTAL]`).
- `RI-01..RI-03` sont **conservés** mais désormais étiquetés `[SOURCE_TEXT_ASSERTION, sans valeur comportementale]` —
  étiquetage exact, je le confirme : ces assertions n'ont **aucune** valeur comportementale.
- **Mesure décisive** : le mutant **M6** neutralise la garde d'import **sans modifier son texte source**
  (`if (false && TN.normalizeText(c).normalized !== c) throw …`). Résultat : **330/332, TUÉ par `R4-02` et `R4-03`**.
  En v1.0.14 ce même mutant passait 313/313.

**R4 est FERMÉE.**

---

## 8. IDENTITÉ D'UNE ENTRÉE DE REGISTRE (mesuré)

`createReviewRegistry().find(basePromptSha256, sealHash, contract, documentAuthoritySha256, targetId)` :

| Scénario | Résultat |
|---|---|
| même empreinte d'autorité + **mauvaise cible** | **REFUSÉE** |
| même cible + **mauvaise empreinte d'autorité** | **REFUSÉE** |
| même cible + même empreinte + **ancien contrat** (`MONO-11-v2`) | **REFUSÉE** |
| même cible + même empreinte + **ancien sceau** | **REFUSÉE** |
| tout correct | **SERVIE** |
| entrée **sans `targetId`** (ère ≤ v1.0.14), cible exigée | **REFUSÉE** |
| entrée sans `targetId`, cible **non** exigée (`find` à 4 arguments) | SERVIE |

L'identité effective comprend donc bien : `targetId` + `documentAuthoritySha256` + `sourceSealHash` +
`validationContract` + `basePromptSha256` + `status === VALID`. Le refus par cible étrangère est **compté**
(`registryRefusedForeignTarget`) et **tracé** (`REGISTRY_REFUSED` / `FOREIGN_TARGET`) — vérifié en exécution réelle.

**Conséquence opérationnelle mesurée (réserve A4)** : toute entrée de registre écrite avant v1.0.15 est **sans
`targetId`** et ne sera **jamais** servie sous v1.0.15 quand la cible est exigée — ce qui est le cas sur le chemin de
production. Une reprise ou un *replay* d'un run existant sous v1.0.15 **régénérerait toutes les revues**, avec appels
fournisseur réels. C'est *fail closed* et correct, mais **économiquement significatif et non annoncé**.

---

## 9. R-A1 / R5 / R6 — aucun correctif antérieur réouvert

| Réserve | Statut mesuré | Preuve |
|---|---|---|
| **R-A1** (parité de trace) | `TRACE_PARITY_PASS` — **toujours fermée** | `RA1-01`, `RA1-02`, `RA1-03` verts dans les 332/332 |
| **R5** (parité miroir / lot gelé) | `STILL_CLOSED` | `V12-02..V12-08`, `V12-16` (24 combinaisons brut × réparation, `FINAL(miroir) == FINAL(lot)`), `V12-17` |
| **R6** (provenance du contrat + registre fail-closed) | `STILL_CLOSED` | `V12-09` (contrat lu dans la config du lot gelé), `V12-10`, `V12-11` (`REGISTRY_IMPORT_SEAL_MISMATCH`), `V12-12` |

Confirmation supplémentaire par mutation : `M5` (retrait de la garde d'identité) fait tomber `RA2-E2E-08` et les tests
R2, sans toucher aux tests RA1/V12 — les correctifs antérieurs sont indépendants et intacts.

---

## 10. AGRÉGATION, RAPPORT, SHADOW A10 — aucune dérive scientifique

### 10.1 Parité du rapport utilisateur v1.0.14 / v1.0.15 (mesure décisive pour `lib/stage-report.js`)

`buildUserReport` exécuté **deux fois** sur les **mêmes intrants réels** du run historique `efm-20260918-a64167c0`
(9 `executionMission.targetDocuments`, dont **0** portant un `targetId`), une fois avec le module de v1.0.14, une fois
avec celui de v1.0.15 :

```
counts v1.0.14 : {"etabli":13,"convergent":9,"divergent":7,"provisoire":0,"nonEtabli":67,"reservations":10}
counts v1.0.15 : {"etabli":13,"convergent":9,"divergent":7,"provisoire":0,"nonEtabli":67,"reservations":10}
PROCESS_QUALIFICATION  : QUALIFIED_WITH_RESERVATIONS   (des deux côtés)
SCIENTIFICALLY_USABLE  : NO                            (des deux côtés)
reportHash 14 = reportHash 15 = 54cacfa2d5ebfc1add44c3ab20d6ea06a05a09c98d17b7ec0d2ecc6ceca392a4
corps normalisé identique = true
```

**13 / 9 / 7 / 0 / 67 / 10 revalidés**, `QUALIFIED_WITH_RESERVATIONS`, `SCIENTIFICALLY_USABLE = NO`.
`lib/stage-report.js` est **sémantiquement inerte** en production.

*(Le `reportHash` ci-dessus est celui de ma reconstruction hors ligne ; il diffère du `reportHash` stocké dans le run
`a962d5ee…` parce que quelques intrants secondaires — coût, compteurs LLM, `lineageRefs` — ne sont pas reconstituables
hors run. Ce qui compte ici est l'**égalité stricte entre v1.0.14 et v1.0.15 sur les mêmes intrants**, et les `counts`
stockés dans le run, qui sont **identiques** : `13/9/7/0/67/10`.)*

### 10.2 Shadow A10 (lecture seule, artefact parallèle)

| Grandeur attendue | Mesure indépendante |
|---|---|
| 18 revues dans le jeu | **18** (`reviews.json` du run) |
| 180 constats au total | **180** |
| 7 revues concernées | **7** (`T-EF03B-35` : `SCOPE.length === 7`, dont 4 réparées) |
| 70 constats du sous-ensemble ciblé | **70** (`T-EF03B-35` : `checked === 70`) |
| 12 citations restaurées | **12** (diff indépendant `reviews.json` ↔ `reviews-restored.json`) |
| 3 constats historiquement vidés restaurés | **3** |
| dérive substantielle | **aucune** : 0 référence retirée, 3 revues touchées, tous les autres champs byte-identiques (`T-EF03B-33`) |

Tests `T-EF03B-35` et `V12-13` **exécutés, non SKIPPED** (les intrants A10 sont présents) ; aucune écriture dans le run
historique (assertion de mtimes dans le test, et `git status` du dépôt confirme 0 modification).

---

## 11. TESTS, INTÉGRITÉ, MONO-11 v0.4

| Contrôle | Attendu | **Mesuré** |
|---|---|---|
| `node test/test-monolith.js` (v1.0.15) | 332/332 | **332/332, exit 0** |
| `node test/test-monolith.js` (v1.0.14, pour comparaison) | 313/313 | **313/313** |
| Identifiants : ajoutés / supprimés | +19 / 0 | **+19 exactement** (`R1-01..06`, `R2-01..08`, `R4-01..05`), **0 suppression** |
| `node test/test-chunking.js` | 21/21 | **21/21** |
| `node tools/secret-scan.js` | 0 hit | **`{"ok":true,"filesScanned":173,"hits":[]}`** |
| `node tools/anti-hardcoding-scan.js` | 0 hit | **`{"ok":true,"filesScanned":79,"caseTokens":0,"hits":[]}`** |
| `node tools/build-manifest.js --verify` | 169 fichiers | **`{"ok":true,"files":169,"bad":[]}`**, `contentHash` `1e2196504aa217fb…`, version `MONOLITH-v1.0.15` |
| `verifyFrozenLots()` | 0 divergence | **MONO-10 79 / MONO-11 55 / MONO-09 9 / MONO-01 106 — total 0 divergence** |
| MONO-11 v0.4 : `shasum -a 256 -c SHA256SUMS.txt` | 55/55 | **55/55 OK, 0 échec** |
| MONO-11 v0.4 : suite propre | 83/83 | **`tests 83 / pass 83 / fail 0`** |
| MONO-11 v0.4 : sceau | inchangé | `110db4de24709926…`, **0 modification git depuis `c12da200`** |
| MONO-11 v0.4 : invariants (monotonie de lignée, CAS A, CAS B, dédup stable, refs valides préservées, seules les refs invalides rejetées) | conservés | couverts par les **83/83** du lot **et** par `V12-04..V12-08`, `V12-16` (24 combinaisons) dans le harnais |
| **0 appel fournisseur** | exigé | **332/332 sous blocage actif des connexions sortantes non locales ; 0 tentative comptée ; aucune clé dans l'environnement** |

*Écart mineur expliqué* : l'auteur annonce « secret scan : 171 fichiers », je mesure **173** — l'écart correspond
exactement aux deux fichiers de rapport de l'auteur (`…-AUTHORITY-IDENTITY-HARDENING-AUDIT.md` / `.json`), écrits après
son scan. Aucun *hit* dans les deux cas.

---

## 12. GLOBAL LINEAGE — chemins connus

| Chemin | Statut | Preuve |
|---|---|---|
| A. littéralisation | **PRÉSERVÉ** | `T-EF03B-27..35`, `V12-15` |
| B. réparation ciblée | **PRÉSERVÉ** | `V12-02..08`, `V12-16` (miroir == lot gelé, 24 combinaisons) |
| C. import de registre | **PRÉSERVÉ** | `R4-01..05` comportementaux ; mutant **M6 tué** |
| D. réutilisation de registre | **PRÉSERVÉ** | `R1-04`, `RI-04..07`, `V12-10` ; table du § 8 |
| E. replay / reuse | **PRÉSERVÉ, fail closed** | `replayReviews` archive et remet à `PENDING` ; le registre est reclé sur `targetId` (§ 8) — réserve **A4** |
| F. normalisation de l'autorité documentaire | **PRÉSERVÉ** | `RA2-01..08`, `RA2-E2E-01..08`, `R2-04` |
| G. identité cible / document | **PRÉSERVÉ** | § 2, § 4 ; mutants M1, M4, M5, M7, M8 tués |
| H. correspondance multi-cible | **PRÉSERVÉ** | § 2 cas A–F ; mutants M1, M2 tués ; **`XPIPE` arrêté au runtime** (réserve **A1**) |

> **`GLOBAL_LINEAGE_PRESERVATION_GUARANTEED_FOR_KNOWN_REPAIR_REUSE_AUTHORITY_AND_TARGET_IDENTITY_PATHS`**

Hors garantie, explicitement : **R11 régénération informée** (inchangé), et **tout ce qui n'est pas prouvé sans run
réel** — ces garanties sont des garanties **de code et de test**, pas de production.

---

## 13. RÉSERVES (aucun blocker)

| # | Sévérité | Titre | Détail |
|---|---|---|---|
| **A1** | **MEDIUM** | Le câblage de production de `lib/pipeline.js` n'a aucune couverture comportementale | Mutant `XPIPE` (ordre de cibles divergent entre l'adaptateur et le lot gelé, texte des deux lignes de câblage inchangé) : **332/332, SURVIVANT**. `R1-06` est une assertion de texte source et ne peut rien prouver (leçon de `M4c`). **Mitigation mesurée** : au runtime le défaut est arrêté *fail closed* par `DOCUMENT_AUTHORITY_CONTEXT_DIVERGENCE` (fatal) — **aucune permutation silencieuse**. Correctif possible, non fait ici : un test qui exécute réellement le chemin aval de `lib/pipeline.js` avec ≥ 2 cibles. |
| **A2** | **MEDIUM** | Mode « autorité fournie sans carte canonique » : garde d'identité inactive | Si `createReviewAdapter` reçoit `documentAuthority` **sans** `targetDocuments`, seules subsistent la garde de point fixe et la garde de préfixe. Mesuré : une autorité **surlongue** (document canonique + suffixe) est alors **ACCEPTÉE**, sans aucune garde. Non atteignable depuis `lib/pipeline.js` (unique site d'appel runtime, qui ne passe jamais `documentAuthority`) ; atteignable par tout appelant tiers, outil, ou `test/test-v1014-normalized-authority.js`. |
| **A3** | LOW | Couverture mince du mutant M7 | `documentAuthoritySha256` calculé sur la mauvaise cible : **331/332**, tué par **un seul** test (`R1-01`). L'invariant « empreinte de registre == autorité réellement utilisée » ne tient qu'à une assertion. |
| **A4** | LOW (opérationnel, coût réel) | Rupture de compatibilité du registre avec les runs ≤ v1.0.14 | Toute entrée sans `targetId` est refusée quand la cible est exigée (mesuré). Une reprise ou un *replay* d'un run existant sous v1.0.15 régénérerait **toutes** les revues, avec appels fournisseur facturés. Comportement *fail closed* correct, mais non annoncé par l'auteur. |
| **A5** | LOW | `lib/stage-report.js` est un 4ᵉ fichier runtime modifié, hors de la liste du mandat | Déclaré par l'auteur, absent de la liste attendue par le propriétaire. Mesuré **sémantiquement inerte** : rapport utilisateur byte-identique v1.0.14 / v1.0.15 sur les intrants réels du run A10 (§ 10.1). |
| **A6** | LOW | Divergence latente d'attribution d'identifiant | `TI.targetIdOf` honore un `targetId` porté par le document ; `lib/stage-professionals.js` (gelé par contrat) ne l'honore pas. Mesuré : `target-05` contre `target-01`. Non atteignable aujourd'hui (aucun document cible ne porte de `targetId` en production, vérifié sur le run réel). À rouvrir si un jour un document cible en portait un. |
| **A7** | LOW | Étiquetage des cibles dans le rapport, défaut **préexistant** non introduit par v1.0.15 | `stage-report` indexe `targetLabels` sur `executionMission.targetDocuments` (9 documents bruts au run A10), alors que les cibles de revue viennent de `buildReviewTargets` (1 cible « dossier »). En mode `MISSION_DOSSIER`, `target-01` porte donc le titre du **premier document brut** au lieu de « Dossier de mission (N documents) ». Cosmétique, identique en v1.0.14. |
| **A8** | LOW | Réserves héritées, transportées et non traitées | `R5` v1.0.14 (`REGISTRY_IMPORT_AUTHORITY_MISSING` pratiquement inatteignable) ; `R6` v1.0.14 — **vérifié toujours ouvert** : dans `reviewCall`, la branche `if (isTargeted || !st.ctx)` n'appelle `requireAuthority` que si `isTargeted && st.ctx` ; une passe ni base ni ciblée avec contexte illisible ne vérifie donc pas l'autorité (inatteignable depuis le pipeline de production) ; `R7` (comptage d'identifiants : `RI-01..RI-03` et `RI-04..RI-07` sont 2 lignes pour 7 identifiants annoncés — le total 332 reste honnête) ; `R-A3`, `R-A5`, `R-A6`. |
| **A9** | EXPECTED | Limites reconnues | Aucun run réel, aucun smoke, aucun zip canonique produit pour v1.0.15. Les garanties sont **de code et de test**. |
| **A10** | GOUVERNANCE (factuel) | La candidate a été **commitée et poussée pendant l'audit** | Commit `6bccae02` « audit », auteur `11drumboy11 <11drumboy11@gmail.com>`, `Tue Sep 22 22:10:40 2026 +0200`, **173 fichiers, uniquement le dossier `MONOLITH-v1.0.15/`**, et `origin/main` pointe dessus. La prémisse « non commitée » du mandat n'est donc plus vraie. **Ce commit n'est pas le fait de l'auditeur** ; le contenu commité est byte-identique à ce qui a été audité (arbre de travail propre sur `tools/EvidenceForge`). Par ailleurs, une modification **non commitée et sans rapport avec EvidenceForge** préexiste dans le dépôt : ` M Worker/index.js` (code Cloudflare Worker / RAG) — **non touchée** par l'audit. |
| **A11** | COSMETIC | Écarts factuels mineurs | (a) `MONO-11/v0.4` ne contient **pas** de `MONO-11-v0.4-FREEZE-RECORD.json` (seulement `MONO-11-v0.4-INDEPENDENT-FREEZE-AUDIT.json` / `.md`) — le `MANIFEST.json`, `SHA256SUMS.txt` et `core/run-seal-guard.js` (`assertSealedRuntime`) sont bien présents. (b) Écart 171 / 173 fichiers du secret scan, expliqué au § 11. |

---

## 14. RECOMMANDATIONS

### Gel

> **GELER**, avec les 11 réserves ci-dessus inscrites au dossier de gel, et **sans activation**.
> `ACTIVE_VERSION` doit rester `MONOLITH-v1.0.10` tant que le smoke n'a pas eu lieu.

### Smoke

> **`SMOKE_AUTHORIZED_WITH_CONDITIONS`** — *le smoke n'a pas été lancé.*

Périmètre proposé, et **rien d'autre** :

1. **Run NEUF uniquement.** Jamais une reprise ni un *replay* d'un run créé sous ≤ v1.0.14 (réserve **A4** : toutes les
   entrées de registre seraient refusées et toutes les revues refacturées).
2. **Mode `PER_DOCUMENT`, au moins 3 documents cibles distincts** — c'est le seul chemin qui exerce réellement le
   câblage non couvert par les tests (réserve **A1**).
3. **Budget plafonné bas** et arrêt budgétaire armé ; un seul jumeau si possible.
4. **Critères d'acceptation à relever dans `ef03b-resilience.json` et `ef03b-trace.jsonl`** :
   `authorityIdentityVerified > 0` ; `authorityContextDivergences == 0` ; `registryRefusedForeignTarget == 0` ;
   chaque entrée de `reviews-valid.jsonl` porte un `targetId` ; et, par cible,
   `sha256(autorité) == sha256(document normalisé remis au lot gelé)`.
5. **Aucune activation** de `ACTIVE_VERSION` avant lecture de ces critères par le propriétaire.

---

*Rien n'a été corrigé, committé, poussé, activé ni fumé par l'auditeur. Les seules écritures effectuées par l'auditeur
dans le dépôt sont ce fichier et son pendant `.json`.*
