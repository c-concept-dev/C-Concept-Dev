# EvidenceForge MONOLITH v1.0.14 — AUDIT INDÉPENDANT DE GEL

**Auditeur** : agent indépendant, adverse, LECTURE SEULE — aucun contexte préalable, aucune confiance accordée au rapport de l'auteur.
**Date** : 2026-09-22
**Sujet** : `MONOLITH-v1.0.14` (candidate, construite, NON gelée, NON commitée), auditée AVANT gel, commit, smoke réel et activation.
**Contraintes respectées** : 0 appel fournisseur, 0 réseau, 0 smoke réel, 0 commit, `ACTIVE_VERSION` inchangée (`MONOLITH-v1.0.10`), D103 et le run historique non modifiés, aucune retouche d'un artefact livré. Toutes les exécutions (suites, mutations, sondes) ont eu lieu dans une copie intégrale de `tools/EvidenceForge/` (bundle + kits opérateurs, même disposition relative).

---

## 1. VERDICT

# `V1_0_14_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`

**Recommandation de gel : GELER.**
**Recommandation de smoke : SMOKE** (smoke réel R12 autorisé après le gel, sous la condition opératoire R-SMOKE ci-dessous).

### Statuts

| Élément | Statut |
|---|---|
| **B1** (autorité = document NORMALISÉ examiné par MONO-11) | **FERMÉ** |
| **B2** (littéralité jugée sur ce même contenu, jamais le brut ni le prompt) | **FERMÉ** |
| **B3** (le câblage réel est protégé par des tests) | **PARTIELLEMENT FERMÉ** — réserve R1 |
| **B4** (import de registre lié à l'autorité normalisée) | **FERMÉ** — réserves R4, R5 |
| **R-A1** (parité de trace) | `RA1_TRACE_PARITY_PASS` |
| **R5** (miroir de l'adaptateur aligné sur le lot) | **TOUJOURS FERMÉ** (24 combinaisons, 0 divergence) |
| **R6** (provenance du contrat + registre fail-closed) | **TOUJOURS FERMÉ** |
| **Parité d'autorité normalisée** | `NORMALIZED_AUTHORITY_PARITY_PASS` (12/12 cas, octet pour octet, par le chemin de production) |
| **Lignée globale** | `GLOBAL_LINEAGE_PRESERVATION_GUARANTEED_FOR_KNOWN_REPAIR_REUSE_AND_AUTHORITY_PATHS` |

---

## 2. BLOQUANTS

**AUCUN.** Zéro bloquant identifié. Le défaut exact qui a fait rejeter la candidate v1.0.13 (autorité BRUTE) est réellement corrigé, et je l'ai prouvé indépendamment par le chemin de production, pas par lecture de code.

---

## 3. RÉSERVES

| # | Réserve | Gravité |
|---|---|---|
| **R1** | **Une mutation du câblage de production survit à 100 % des tests.** `lib/pipeline.js` : `documentAuthority: (targetId) => authorityByTarget["target-01"]` (l'autorité de la cible 1 servie pour TOUTES les cibles) donne **313/313 vert**. Les tests RA2-E2E extraient par expression régulière la **ligne de construction de la table** et fournissent leur **propre** lambda `documentAuthority` ; la lambda de production n'est exercée par aucun test, et aucun test ne fait passer l'adaptateur de production par une vraie revue (`runDownstreamFromCheckpoint` est systématiquement remplacé par un double dans toutes les suites). L'affirmation de l'auteur « le câblage ne peut plus être muté sans test rouge » est donc **surévaluée**. Portée réelle : inerte en `MISSION_DOSSIER` (1 seule cible, mode par défaut, 400 000 caractères) ; **active** dès le repli `DOSSIER_TOO_LARGE` ou en `PER_DOCUMENT`. Le code livré est CORRECT (parité 3/3 cibles prouvée) : c'est un trou de **couverture**, pas un défaut d'exécution. | Moyenne |
| **R2** | **Faux négatif structurel de la garde de point fixe.** `DOCUMENT_AUTHORITY_NOT_NORMALIZED` ne prouve que « ce contenu est un point fixe des règles gelées », jamais « c'est LE bon document ». Une autorité **tronquée mais déjà normalisée EST un point fixe** : elle est **ACCEPTÉE** (sonde G3). Une autorité **totalement différente mais normalisée** est également acceptée (sonde G7). Conséquence prouvée : sous une autorité tronquée, `mergeLiteralRefs` **écarte silencieusement une référence littérale valide** (sonde : 2 refs → 1 ref). Atténuations en place : compteur `contextContentMismatch` + liaison du registre à `documentAuthoritySha256`. Mais le compteur **n'est pas discriminant** (il vaut ≥ 1 aussi avec une autorité CORRECTE, cf. RA2-E2E-05) et **n'est pas levé du tout** quand le contexte du prompt est illisible (`withAuthority` retourne `null` avant la comparaison). Risque résiduel : une future régression du câblage produisant un point fixe erroné ne serait pas détectée par la garde. | Moyenne |
| **R3** | **Libellé de test trompeur.** RA2-E2E-08 s'intitule « une autorite tronquee **ou brute** est REFUSEE (fail closed) » alors que son corps prouve le contraire pour la troncature : seule l'autorité brute est refusée ; la tronquée est **acceptée**, seulement comptée et tracée. Le commentaire interne du test est, lui, exact. À corriger avant publication. | Faible |
| **R4** | **RI-01..RI-03 n'assertent pas un comportement mais un TEXTE SOURCE** (expressions régulières sur `tools/ef03b-registry-import.js`). Preuve : mon mutant **M4c** neutralise la garde (`if (false && TN.normalizeText(c).normalized !== c) throw …`) tout en conservant intégralement le texte source attendu → **313/313 vert**. J'ai donc exercé l'outil **comportementalement** (cas A..H ci-dessous) : le comportement livré est conforme. | Moyenne |
| **R5** | **`REGISTRY_IMPORT_AUTHORITY_MISSING` est pratiquement inatteignable.** Cible sans document → `continue` silencieux (aucun refus enregistré) ; document à contenu vide → refusé en amont par `RE.validateReviewCandidate` (`refused`, jamais importé). Effet global fail-closed (rien n'est écrit, aucune entrée inservable), mais le code d'erreur annoncé ne se déclenche jamais. | Faible |
| **R6** | **La garde d'autorité n'est exigée qu'aux passes BASE et TARGETED.** Une passe ni base ni ciblée arrivant sans passe BASE préalable (`st.ctx === null`) tombe dans la branche « transport seul » **sans** appeler `requireAuthority`. Inatteignable dans le pipeline de production (la passe 1 est toujours BASE) ; non gardé formellement. | Faible |
| **R7** | **Comptage des identifiants de tests.** « RI-01..07 » est annoncé (7 identifiants) alors que 2 entrées existent (`RI-01..RI-03`, `RI-04..RI-07`) ; le total 313 reste honnête (292 + 21 entrées). Doublon d'identifiant `V1` (deux tests distincts) — **préexistant en v1.0.12**, pas une régression. | Cosmétique |
| **R8** | Limites reconnues par l'auteur et confirmées : aucun run réel, aucun zip canonique, R-A3 / R-A5 / R-A6 non traitées. | Attendue |
| **R-SMOKE** | Condition opératoire du smoke réel : exécuter le smoke en `MISSION_DOSSIER` (défaut, 1 cible) **et**, si un dossier multi-cibles est un cas d'usage visé, vérifier manuellement `target-document-set.json` vs `ef03b-trace.jsonl`/`reviews-valid.jsonl` (`documentAuthoritySha256` par cible) — c'est exactement la zone non couverte par R1. | — |

---

## 4. SECTION 1 — DIFF RÉEL v1.0.12 → v1.0.14

`diff -rq` (hors `.DS_Store`) : **16 fichiers diffèrent, 2 ajoutés, 6 retirés** (les 6 « retirés » sont les artefacts de gouvernance propres à v1.0.12 : c'est attendu, v1.0.14 repart de v1.0.12 gelée).

### 4.1 Changements de RUNTIME (annoncés)

| fichier | sha256 v1.0.14 | nature |
|---|---|---|
| `lib/ef03b-resilience.js` | `ea86f11528beb1b779b98d02ae241b9658b752b165a91b1321b56c573b1c3d99` | R-A2 (autorité normalisée obligatoire + garde de point fixe + `withAuthority` + registre clé par `documentAuthoritySha256`) ; R-A1 (réparation illisible non recomposée) |
| `lib/pipeline.js` | `de4049c453940dc32fc573c45971e57c64947c214504e65a96b71f9bad0e5a9f` | construction de `authorityByTarget` (module GELÉ `core/target-normalizer.js`) + passage de `documentAuthority` à l'adaptateur ; `schemaVersion` |
| `tools/ef03b-registry-import.js` | `70502a66a14134c41f2c0f2aae63b85f47f469b8fa32a267a2de14ab69d7b1c5` | B4 : `documentAuthoritySha256: authoritySha(doc)` + fail closed MISSING / NOT_NORMALIZED |

### 4.2 Changements SANS logique (chaînes de version / provenance)

| fichier | nature vérifiée ligne à ligne |
|---|---|
| `config/monolith.config.json` | `$comment` + `product.version` `MONOLITH-v1.0.12` → `MONOLITH-v1.0.14`. **Rien d'autre.** |
| `tools/build-manifest.js` | uniquement les chaînes `predecessor` / `ef03b` / `provenance` / `status`. La logique de mesure (sceaux, lots, contrat lu dans `lib/llm.js`) est **inchangée**. |
| `tools/ef03b-autopsy.js` | `schemaVersion: "MONOLITH-v1.0.12"` → `"…v1.0.14"`. 1 ligne. |
| `tools/package.sh` | nom du zip. 3 lignes. |

### 4.3 Tests

| fichier | nature |
|---|---|
| `test/test-stream.js` | **1 seule différence** : `cfg.product.version === "MONOLITH-v1.0.14"` |
| `test/test-v1012-lineage-parity.js` | + `AUTHORITY` (normalisée) passée à l'adaptateur ; V12-18 : version produit attendue |
| `test/test-ef03b-lineage.js` | + `AUTHORITY` (normalisée) passée à l'adaptateur |
| `test/test-v1014-normalized-authority.js` | **nouveau** (RA2-01..08, RA1-01..03) |
| `test/test-v1014-e2e-wiring.js` | **nouveau** (RA2-E2E-01..08, RI-01..RI-07) |

Aucun fichier modifié n'est resté **non annoncé** : les 4 fichiers de 4.2 relèvent de la catégorie « version/manifeste/doc » du mandat, et j'ai vérifié qu'ils ne contiennent **aucune** modification de logique.

### 4.4 Identité octet à octet prouvée (inchangés)

- `diff -rq lib/` v1.0.12 vs v1.0.14 → **seuls** `ef03b-resilience.js` et `pipeline.js`. Donc `lib/llm.js` (`34816352ef0e…`), `lib/stage-professionals.js` (`46f2b48f63ee…`), `lib/stage-report.js` (`0e67295b6558…`) et **tous** les autres modules de `lib/` sont **byte-identiques**.
- `server.js`, `index.html`, `worker/`, `vendor/`, `fixtures/`, `governance/`, `bin/` : **0 différence**.
- **Aucune logique scientifique ni d'agrégation n'a changé** (agrégation, qualification, rapport, prompts, validateurs : tous dans des fichiers byte-identiques ou dans les lots gelés).

### 4.5 MONO-11 v0.4

| contrôle | résultat |
|---|---|
| `shasum -a 256 -c SHA256SUMS.txt` (55 fichiers) | **55/55 OK, 0 échec** |
| sceau runtime | `110db4de24709926d4a5fb6d0e951530f0afc2c1c807a09127852a92aa182c3d` ✔ |
| `runCodeHash` | `27610c84502104b3dc9643a9cc0289aef4ae40ae65ee34e4fe82f31a73e381ad` ✔ |
| zip canonique | `79c16d08a0a52bc1b9ae3c6884cc22f6161145bed18158d6c9b6a44df1a7c474` ✔ (`canonicalZipMatches: true`) |
| `P.verifyFrozenLots()` | MONO-10 = 0, **MONO-11 = 0**, MONO-09 = 0, MONO-01 = 0 divergence |
| `core/target-normalizer.js` | `9e419de7bdf506181e6f2e4246f28b19067df6e7e09c691452d9e0955bf390c8` (non modifié) |
| suite propre du lot | **83/83** |

---

## 5. SECTION 2 — B1/B2 : AUTORITÉ NORMALISÉE RÉELLE (contrôle principal)

Je n'ai **pas** comparé des fonctions. J'ai construit la chaîne complète par le **chemin de production** : sonde `parity-probe.js` qui (1) instrumente `EF3.createReviewAdapter` pour **capturer la lambda `documentAuthority` réellement fournie par `lib/pipeline.js`**, (2) pilote `PL.advance()` sur un run semé jusqu'à `PROFESSIONALS`, (3) récupère les `targetDocuments` **de production** passés à l'aval, (4) leur applique la chaîne propre de MONO-11 telle que `core/autonomous-run.js` l'applique (`TN.normalizeTargetDocument(t)` ligne 158, puis `F.M01.TDS.buildTargetDocumentSet` ligne 162), (5) compare `Buffer.compare()` **octet pour octet** et par sha256.

### Chaîne prouvée

```
targetDocs (lib/pipeline.js)                  ──┬─→ authorityByTarget["target-NN"] = TN.normalizeTargetDocument({targetId, label:d.title, content:d.content}).document.content
                                                │        └─→ adapter.documentAuthority(targetId)  →  st.ctx.content  →  isLiteralRef / mergeLiteralRefs / mergeRepairLineage
                                                └─→ SP.runDownstreamFromCheckpoint:329  targets[i] = {targetId:"target-NN", label:d.title, content:d.content, …}
                                                         └─→ MONO-11 autonomous-run:158  TN.normalizeTargetDocument(t)
                                                                 └─→ :162 buildTargetDocumentSet  (content = String(d.content), AUCUNE transformation)
                                                                         └─→ review-enforcer : contentContainsRef(document, ref)
```

`normalizeTargetDocument` ne lit **que** `input.content` pour produire `document.content` ; `buildTargetDocumentSet` recopie `content` sans `trim`. L'indexation `target-NN` est la **même position** dans le **même tableau** des deux côtés (`lib/pipeline.js` et `lib/stage-professionals.js:329`).

### Résultats (12/12 — 0 divergence)

| cas | description | octets identiques | sha256 (autorité = document du lot) | brut ≠ normalisé | autorité ≠ brut | point fixe |
|---|---|---|---|---|---|---|
| P-01 | document ordinaire | ✔ | `7fa1f79d1278` | non | ✔ | ✔ |
| P-02 | apostrophes typographiques (U+2019/2018/2032/02BC) | ✔ | `4a357d05da97` | oui | ✔ | ✔ |
| P-03 | guillemets typographiques (U+201C/201D/201E/2033) | ✔ | `9f5d0ab1a529` | oui | ✔ | ✔ |
| P-04 | NBSP U+00A0 + U+202F + U+2007 | ✔ | `ce9d0ebf0101` | oui | ✔ | ✔ |
| P-05 | CRLF + CR isolé | ✔ | `16d192fd96bb` | oui | ✔ | ✔ |
| P-06 | non-NFC (é, ç, à décomposés) | ✔ | `a3841e9eb16d` | oui | ✔ | ✔ |
| P-07 | combinaison (CRLF + NFD + guillemets + NBSP + apostrophe) | ✔ | `8dd295a74742` | oui | ✔ | ✔ |
| P-08 | document contenant `BASE DOCUMENTAIRE DU PROFESSIONNEL` | ✔ | `14de0066e948` | non | ✔ | ✔ |
| P-09 | marqueur + ligne JSON ressemblante | ✔ | `74d14ed56b9c` | oui | ✔ | ✔ |
| P-10 | marqueurs multiples (×3) | ✔ | `b85e732c4e03` | non | ✔ | ✔ |
| **P-11** | **3 documents distincts, PER_DOCUMENT** | ✔ ✔ ✔ | `d06ba5104636` / `924695002d15` / `04d37c77aca6` | oui | ✔ | ✔ |
| P-12 | 2 documents fusionnés (MISSION_DOSSIER) | ✔ | `b242d9e967aa` | oui | ✔ | ✔ |

`adapterAuthorityContent === mono11TargetDocument.content` : **vrai dans les 12 cas, pour les 14 cibles**, octet pour octet et par sha256.

### Classification

# `NORMALIZED_AUTHORITY_PARITY_PASS`

---

## 6. SECTION 3 — GARDE DE POINT FIXE (`DOCUMENT_AUTHORITY_NOT_NORMALIZED`)

Garde (lib/ef03b-resilience.js, `requireAuthority`) : `TN.normalizeText(c).normalized !== c` → jet fatal. Sonde `guard-probe.js`.

| sonde | autorité | point fixe ? | comportement observé |
|---|---|---|---|
| G1 | BRUTE (apostrophes typographiques) | non | **REFUSÉE** `DOCUMENT_AUTHORITY_NOT_NORMALIZED` (fatal) |
| G2 | PARTIELLEMENT normalisée (CRLF corrigé, apostrophes non) | non | **REFUSÉE** `DOCUMENT_AUTHORITY_NOT_NORMALIZED` |
| G3 | **TRONQUÉE mais déjà normalisée** (51/110 car.) | **oui** | **ACCEPTÉE** — `mismatch = 1` |
| G4 | correcte (document normalisé complet) | oui | **ACCEPTÉE** — `mismatch = 0` |
| G5 | vide | — | **REFUSÉE** `DOCUMENT_AUTHORITY_EMPTY` |
| G6 | non-chaîne (`42`) | — | **REFUSÉE** `DOCUMENT_AUTHORITY_REQUIRED` |
| G7 | **autre document, mais normalisé** | oui | **ACCEPTÉE** — `mismatch = 1` |

### Faux positif — NON TROUVÉ

Fuzz aléatoire de **20 000 documents** construits sur le pool exact des caractères couverts par les règles gelées (`e´`, `é`, `’`, `'`, `“`, NBSP, NNBSP, FIGSP, CRLF, CR, U+0301, U+02BC, U+2032, U+2033, U+201E) : **0 sortie de `normalizeTargetDocument` n'est un non-point-fixe**. Par construction, le module gelé refuse lui-même toute non-idempotence (`NORMALIZATION_NOT_IDEMPOTENT`). **Aucun document normalisé légitime ne peut être refusé.** Aucune boucle (la garde est un appel unique non récursif). **Aucune double normalisation destructrice** : le mutant X2 (normalisation appliquée deux fois dans `lib/pipeline.js`) est un no-op, 313/313.

### Faux négatif — CONFIRMÉ, c'est la faiblesse clé

> **Une autorité TRONQUÉE mais déjà normalisée EST un point fixe : la garde ne la voit pas.**

Conséquence, prouvée et non théorique :

```
autorité TRONQUÉE :  mergeLiteralRefs([CITE1, CITE2], [], TRUNC)
   → refs conservées : ["PREMIERE citation litterale du document."]
   → ÉCARTÉE comme non littérale : ["DEUXIEME citation litterale, plus loin, avec l'apostrophe."]
autorité CORRECTE :  mergeLiteralRefs([CITE1, CITE2], [], NORM)
   → refs conservées : les DEUX
⇒ une référence littérale VALIDE est silencieusement perdue.
```

C'est exactement le mode de défaillance du run v1.0.10 (12 citations perdues, 3 constats vidés).

**Risque résiduel** : la garde prouve « normalisé », **jamais** « le bon document ». Les deux atténuations existantes sont partielles :
1. `contextContentMismatch` **n'est pas discriminant** — il vaut ≥ 1 aussi avec l'autorité CORRECTE (RA2-E2E-05 l'asserte explicitement : `assert(o.stats.contextContentMismatch >= 1)` avec une autorité correcte), et il n'est **pas levé du tout** si le contexte du prompt est illisible (`withAuthority` retourne `null` avant la comparaison) ;
2. la liaison du registre à `documentAuthoritySha256` empêche la **réutilisation** d'un candidat jugé sur un contenu partiel (vérifié), mais **n'empêche pas la perte dans le run courant**.

Dans le paquet LIVRÉ ce risque n'est pas réalisé (parité 12/12 prouvée). Il devient réel uniquement sous une régression du câblage — et la réserve **R1** montre qu'une telle régression n'est pas intégralement couverte par les tests. **C'est la raison principale des RÉSERVES du verdict.**

---

## 7. SECTION 4 — CÂBLAGE RÉEL DU PIPELINE

### Ce que font réellement les tests livrés

`test/test-v1014-e2e-wiring.js` extrait de `lib/pipeline.js` la ligne :

```js
const WIRE_RE = /const authorityByTarget = \{\};[\s\S]*?\n/;
… eval(wireMatch[0].replace(/^\s*const authorityByTarget = \{\};\s*/, ""));
```

puis construit l'adaptateur avec **sa propre** lambda : `documentAuthority: (tid) => authorities[tid]`.

### Jugement : proxy FIDÈLE POUR LA TABLE, INFIDÈLE POUR LA LAMBDA

| aspect | couvert ? | preuve |
|---|---|---|
| construction de `authorityByTarget` (normalisation, indexation, source du contenu) | **OUI** | M1, M2, M3, X3 tués |
| renommage / déplacement de la ligne | **OUI** | `assert(wireMatch, …)` devient rouge |
| `require` du normaliseur gelé | **NON** — le test substitue `TN` | non muté (risque théorique) |
| **la lambda `documentAuthority: (targetId) => authorityByTarget[targetId]`** | **NON** | **mutant X1 survit 313/313** |
| indexation multi-documents target-02 / target-03 | **OUI dans la table** (RA2-E2E-07), **NON dans la lambda** | X1 |
| adaptateur de production traversé par une vraie revue | **NON** | `SP.runDownstreamFromCheckpoint` est remplacé par un double dans **toutes** les suites (X4, T-EF03B-26, RUN-SAFETY-08/12, COST-07/08, T-ECO-15, T-STREAM-21) |

### Ce que j'ai fait moi-même (chemin de production réel)

J'ai piloté **`PL.advance()`** (le vrai pipeline) avec fournisseur factice et **capturé la lambda de production** remise à `createReviewAdapter`. Les 12 cas de la §5 sont évalués **sur cette lambda**, pas sur une réimplémentation. Résultat : 0 divergence, y compris sur les 3 cibles distinctes (P-11).

**Conclusion** : le câblage LIVRÉ est correct et je l'ai prouvé ; il n'est pas intégralement **protégé**. → réserve **R1**, B3 `PARTIELLEMENT FERMÉ`.

---

## 8. SECTION 5 — MATRICE DE MUTATION

Méthode : copie intégrale de `tools/EvidenceForge/` par mutant, une mutation `perl -0777` vérifiée appliquée, `node test/test-monolith.js`. **Base de référence du harnais : 313/313.**

| # | mutation | fichier | tué par | score |
|---|---|---|---|---|
| **M1** | autorité = contenu **BRUT** (défaut exact de v1.0.13) | `lib/pipeline.js` | **RA2-E2E-01, -02, -03, -04, -08** | 308/313 ✔ TUÉ |
| **M2** | index cible décalé (`target-NN` → `target-NN+1`) | `lib/pipeline.js` | **RA2-E2E-01..08** + **T-STREAM-21** | 304/313 ✔ TUÉ |
| **M3** | autorité tronquée (`slice(0,20)`) | `lib/pipeline.js` | **RA2-E2E-01..08** | 305/313 ✔ TUÉ |
| **M4** | `documentAuthoritySha256` absent à l'import | `tools/ef03b-registry-import.js` | **RI-01..RI-03** (assertion SOURCE) | 312/313 ✔ TUÉ |
| **M4b** | garde de normalisation retirée de l'import | `tools/ef03b-registry-import.js` | **RI-01..RI-03** (assertion SOURCE) | 312/313 ✔ TUÉ |
| **M5** | correctif **R-A1** retiré (réparation illisible recomposée) | `lib/ef03b-resilience.js` | **RA1-01, RA1-02, RA1-03** | 310/313 ✔ TUÉ |
| **M6** | garde de normalisation retirée de l'adaptateur | `lib/ef03b-resilience.js` | **RA2-04, RA2-E2E-08** | 311/313 ✔ TUÉ |

Les 7 scores reproduisent **exactement** ceux annoncés par l'auteur (308/304/305/312/312/310/311) : sa matrice est honnête.

### Mutants supplémentaires — NON testés par l'auteur

| # | mutation | fichier | tué par | score |
|---|---|---|---|---|
| **X1** | **`documentAuthority: (targetId) => authorityByTarget["target-01"]`** (autorité de la cible 1 rendue pour TOUTES les cibles) | `lib/pipeline.js` | **AUCUN** | **313/313 — MUTANT SURVIVANT** ✗ |
| **X2** | normalisation appliquée **deux fois** | `lib/pipeline.js` | aucun (**correct** : idempotence prouvée, no-op) | 313/313 — survivant attendu |
| **X3** | autorité tirée de **`d.title`** au lieu de `d.content` | `lib/pipeline.js` | **RA2-E2E-01..08** | 305/313 ✔ TUÉ |
| **X4** | **ligne de câblage `documentAuthority:` entièrement supprimée** | `lib/pipeline.js` | **X4, COST-07/08, RUN-SAFETY-08, RUN-SAFETY-12, T-ECO-15, T-STREAM-21, T-EF03B-26** | 306/313 ✔ TUÉ |
| **M4c** | **garde d'import neutralisée en conservant le TEXTE SOURCE** (`if (false && TN.normalizeText(c).normalized !== c) throw …`) | `tools/ef03b-registry-import.js` | **AUCUN** | **313/313 — MUTANT SURVIVANT** ✗ |

**Lecture** : X4 prouve que la **présence** du câblage est couverte (7 tests rouges) ; X1 prouve que sa **correction** ne l'est pas. M4c prouve que RI-01..03 n'ont **aucune** valeur comportementale.

### B3 de v1.0.13

**Partiellement fermé.** Trois mutations du câblage réel (M1, M2, M3) et deux des miennes (X3, X4) font bien rougir des tests nommés — c'est un progrès net et réel par rapport à v1.0.13 (303/303 vert sous mutation). Mais **X1 survit**, donc l'énoncé « une mutation du câblage réel fait rougir au moins un E2E » est **faux en général**.

---

## 9. SECTION 6 — B4 : IMPORT DE REGISTRE (comportement, pas texte source)

`tools/ef03b-registry-import.js` a été exercé **comportementalement** : répertoires de run factices minimaux (`state.json`, `enforcement-traces.json`, `reviews.json`, `twins.json`, `target-document-set.json`, `review-schema.json`) et appel de `importRun(runDir, {dryRun})` **et** en écriture réelle.

| cas | attendu | observé | verdict |
|---|---|---|---|
| **A** autorité normalisée disponible | import accepté, entrée servable | `imported=1, refused=0` ; `find(...)` **retourne l'entrée** | ✔ |
| **B** brut ≠ normalisé | empreinte sur le **normalisé seul** | `documentAuthoritySha256 = 9d3957c7d208…` = `sha(NORM)` ; **≠** `sha(RAW) = 804e294adddd…` | ✔ |
| **C** autorité absente (aucun document pour la cible) | `REGISTRY_IMPORT_AUTHORITY_MISSING` | **aucun jet** : `continue` silencieux → `imported=0, refused=0` (rien écrit) | ⚠ réserve R5 (fail-closed en effet, code jamais levé) |
| **C2** document présent, contenu vide | fail closed | refusé en amont par `RE.validateReviewCandidate` → `imported=0` | ✔ (autre code) |
| **D** autorité non normalisée | `REGISTRY_IMPORT_AUTHORITY_NOT_NORMALIZED` | **jet exact**, import entièrement avorté | ✔ |
| **E** empreinte différente au `find()` | refusé | `find(..., sha("autre")) === null` | ✔ |
| **F** ancienne entrée **sans** empreinte | jamais servie | `find(...) === null` | ✔ |
| **G** ancien `contractVersion` | refusé | `REGISTRY_IMPORT_CONTRACT_MISMATCH` | ✔ |
| **H** ancien sceau | refusé | `REGISTRY_IMPORT_SEAL_MISMATCH` | ✔ |
| **I** entrée écrite mais **inservable** ? | impossible | entrée écrite = ✔ **et** servable sous l'autorité normalisée réelle du run = ✔ | ✔ |

**Conclusion B4 : FERMÉ.** L'outil ne peut plus créer d'entrée écrite-mais-inservable. Réserves R4 (tests source-texte, mutant M4c survivant) et R5 (code MISSING inatteignable).

---

## 10. SECTION 7 — R-A1 : PARITÉ DE TRACE

Revalidation indépendante (aucune recomposition attendue en cas de réparation illisible) :

| contrôle | observé |
|---|---|
| réparation illisible → **aucune recomposition miroir** | ✔ (`if (!rp.ok) { … return r; }`, `lib/ef03b-resilience.js`) |
| trace `REPAIR_UNPARSABLE` | ✔ |
| **dimensions fautives = celles du lot** | ✔ `RE.faultyDimensions(st.lastErrors)` (le lot gelé) — `st.lastErrors` alimenté par `mirrorParsed` |
| codes d'erreur | ✔ `repairErrors: rp.errors.map(e => e.code)` |
| **aucune écriture au registre** | ✔ sonde P13-c : `registry = 0` |
| acceptation identique à MONO-11 | ✔ sonde P13-c : revue finale `error` (identique au lot seul) |
| mutation retirant R-A1 (**M5**) | ✔ **RA1-01, RA1-02, RA1-03 rougissent réellement** (310/313) |

### `RA1_TRACE_PARITY_PASS`

---

## 11. SECTION 8 — R5 / R6 / MONO-11 v0.4

### R5 — matrice de parité adaptateur/lot (24 combinaisons)

4 formes de références d'origine × 3 formes de réparation × littéralisation on/off. Contrôle : **le candidat inscrit au registre doit être octet-identique à la projection de la revue que le LOT a acceptée**.

| résultat | nombre |
|---|---|
| `PARITY_OK` (registre **octet-identique** au lot) | **20** |
| `LOT_REJECTED` (refus légitime du lot : refs d'origine toutes non littérales et jamais réparées) — **0 entrée de registre écrite** | 4 |
| `PARITY_DIVERGENCE` | **0** |
| `LINEAGE_LOSS` (une ref d'origine littérale perdue) | **0 sur 24** |

### R6 — provenance du contrat + registre fail-closed

| contrôle | observé |
|---|---|
| `lib/llm.js` | `VALIDATION_CONTRACT = (P.CONFIG.frozenLots["MONO-11"] \|\| {}).contractVersion \|\| "MONO-11-v3"` ✔ |
| `lib/ef03b-resilience.js` | `CONTRACT = P.CONFIG.frozenLots["MONO-11"].contractVersion` ✔ ; aucune occurrence de `MONO-11-v2` ✔ |
| `tools/ef03b-registry-import.js` | contrat lu dans la configuration du lot ✔ |
| registre fail-closed inter-contrat / inter-sceau / inter-autorité | ✔ (cas E, F, G, H + RI-04..07) |

### MONO-11 v0.4 (vérifications propres, `RE.mergeRepairLineage`)

| propriété | observé |
|---|---|
| **CASE A** (certaines refs d'origine littérales + réparation littérale) | `RESOLVED`, `preservedRefs=[ALPHA]`, `finalRefs=[ALPHA, GAMMA]` ✔ |
| **CASE B** (aucune ref d'origine littérale + réparation littérale) | `RESOLVED`, `preservedRefs=[]`, `finalRefs=[GAMMA]` ✔ |
| non résolu (réparation non littérale) | `REFS_PRESENT_BUT_UNRESOLVED`, `unresolvedDimensions=["D2"]` ✔ |
| **déduplication stable** | `[A,A,B]` + `[B,A,C,C]` → `[ALPHA, BETA, GAMMA]` ✔ |
| **rejected = refs invalides uniquement** | ✔ |
| `contractVersion` | **MONO-11-v3**, `dir = MONO-11/v0.4` ✔ |
| divergences | **0** sur les 4 lots |
| monotonie de lignée | ✔ 24/24 dans la matrice R5 |

**R5 : TOUJOURS FERMÉ. R6 : TOUJOURS FERMÉ. MONO-11 v0.4 : non rouvert, 0 divergence.**

---

## 12. SECTION 9 — LIGNÉE GLOBALE (chemins connus)

| chemin | peut-il encore écarter silencieusement une ref littérale valide ? | preuve |
|---|---|---|
| **A — littéralisation** | **NON** | `preserveLineageRepairs`/`mergeLiteralRefs` sur `st.ctx.content` = **autorité normalisée prouvée identique au document du lot** (§5) ; `FINAL ⊇ VALID_ORIGINAL` vérifié 24/24 |
| **B — réparation ciblée** | **NON** | miroir = `RE.mergeRepairLineage` du lot gelé v0.4 avant `RE.recompose` ; candidat de registre **octet-identique** au lot (20/20 acceptations) ; CASE A/B vérifiés |
| **C — import de registre** | **NON** | empreinte sur le document **normalisé** du run ; autorité absente/non normalisée → rien d'écrit (§9) ; aucune entrée inservable |
| **D — réutilisation de registre** | **NON** | `find()` exige `documentAuthoritySha256` **identique** ; entrée sans empreinte (ère ≤ v1.0.13) **jamais servie** (F, P13-e) ; entrée d'une autre autorité refusée et tracée |
| **E — rejeu / reuse** | **NON** | le rejeu repart du checkpoint professionnel et reconstruit l'autorité par le même câblage ; cache/registre fail-closed inter-sceau et inter-contrat |
| **F — correspondance document ↔ autorité** | **NON** (dans le paquet livré) | parité 12/12 octet pour octet, 14 cibles, y compris 3 cibles distinctes ; `targetId` inconnu → `DOCUMENT_AUTHORITY_REQUIRED` fatal (P13-a) |
| **R11 — régénération informée** | hors garantie monotone — **et jamais étiquetée « préservant la lignée »** | la branche passe complète ne porte ni champ `lineage` ni `lineagePreservedRefs` ; ces champs n'existent que dans les branches réparation ciblée et littéralisation. Le contrat du lot (`LINEAGE_MONOTONICITY_DURING_REPAIR`) est explicitement borné à la réparation. ✔ |

### Réponse finale

# `GLOBAL_LINEAGE_PRESERVATION_GUARANTEED_FOR_KNOWN_REPAIR_REUSE_AND_AUTHORITY_PATHS`

*Qualification honnête* : cette garantie porte sur **l'artefact livré**, dont j'ai prouvé la parité d'autorité. Elle **n'est pas auto-protégée** : la garde de point fixe ne détecterait pas une autorité erronée mais normalisée (R2), et les tests ne couvrent pas entièrement la lambda de câblage (R1). Toute évolution future de `lib/pipeline.js` doit être re-prouvée par une mesure de parité, pas par la suite de tests seule.

---

## 13. SECTION 10 — SHADOW A10 (rejoué intégralement)

Rejeu indépendant de `reviews-restored.json` contre `reviews.json` du run historique `efm-20260918-a64167c0`, avec le vocabulaire exact du mandat :

| grandeur | attendu | **mesuré par moi** | ✓ |
|---|---|---|---|
| revues dans le jeu | 18 | **18** | ✔ |
| revues concernées par les appels/réparations A10 | 7 | **7** (7 × `BASE_WITH_OUTPUT_BUDGET` à la tentative 10 ; les 11 autres servies par le registre) | ✔ |
| constats au total | 180 | **180** (18 × 10 dimensions) | ✔ |
| constats vérifiés dans le sous-ensemble ciblé | 70 | **70** (7 × 10) | ✔ |
| **citations restaurées** | 12 | **12/12** (réparties sur 3 revues, 12 constats) | ✔ |
| **constats historiquement vidés restaurés** | 3 | **3/3** (`DISC-07`, `DISC-03`, `DISC-06` : 0 → 1 ref) | ✔ |
| **autre champ substantiel modifié** | 0 | **0** sur `dimensionId, disposition, epistemicStatus, finding, rationale, twinBasisWorkRefs, confidenceQualitative, limitations` | ✔ |
| référence **retirée** | 0 | **0** | ✔ |
| écriture d'exécution | 0 | **0** (`testMode: true`, artefact hors run) | ✔ |
| réseau | 0 | **0** | ✔ |
| `historicalReviewsSha256` du shadow | — | **recalculé** `2d87507bc890fed7047ec694f01a47a81b21c1ff71df54ea7fbc00eb2497874f` = valeur déclarée | ✔ |

**Le comptage corrigé de l'auteur est exact — je le confirme sans correction.** La distinction est bien : **7** revues *concernées par les appels A10* (dont 3 ont subi une littéralisation et 4 un `repairScope`), **3** revues effectivement *modifiées* par la restauration, **12** citations restaurées, **3** constats vidés restaurés.

Le shadow reste un **artefact parallèle** : `restoration.note` = « NOT a run output ; offline controlled reconstruction ; never replaces … ». Il ne remplace ni `reviews.json` ni `report.json` du run.

---

## 14. SECTION 11 — AGRÉGATION / RAPPORT

| grandeur | attendu | mesuré | ✓ |
|---|---|---|---|
| `etabli` | 13 | **13** | ✔ |
| `convergent` | 9 | **9** | ✔ |
| `divergent` | 7 | **7** | ✔ |
| `provisoire` | 0 | **0** | ✔ |
| `nonEtabli` | 67 | **67** | ✔ |
| `reservations` | 10 | **10** | ✔ |
| `PROCESS_QUALIFICATION` | `QUALIFIED_WITH_RESERVATIONS` | **`QUALIFIED_WITH_RESERVATIONS`** | ✔ |
| `SCIENTIFICALLY_USABLE` | `NO` | **`NO`** (règle : toute réserve ⇒ NO ; 8 réserves, validation humaine = false) | ✔ |
| **`reportHash` historique** | `a962d5ee…` | **recalculé** `a962d5eefeb033ac4dd9f76627989a72d423737f3ca13cd2e4e65730de7a441c`, `verifyReportHash().valid = true` | ✔ INCHANGÉ |

**Aucune dérive sémantique possible** : `lib/stage-report.js`, `lib/stage-aggregation*`, les validateurs, les prompts et tous les modules d'agrégation sont **byte-identiques** à v1.0.12 (§4.4). Seuls 3 fichiers de runtime ont changé, aucun ne touche l'agrégation ni le rapport.

---

## 15. SECTION 12 — TESTS COMPLETS (dans la copie)

| suite | annoncé | **mesuré** | ✓ |
|---|---|---|---|
| `node test/test-monolith.js` | 313/313 | **313/313** | ✔ |
| `node test/test-chunking.js` | 21/21 | **21/21** | ✔ |
| `node tools/secret-scan.js` | 0 | **0 hit** (164 fichiers, exit 0) | ✔ |
| `node tools/anti-hardcoding-scan.js` | 0 | **0 hit** (77 fichiers, 0 jeton de cas, exit 0) | ✔ |
| `node tools/build-manifest.js --verify` | ok 160 | **`{"ok":true,"files":160,"bad":[]}`** *(sur l'arbre LIVRÉ, avant toute exécution)* | ✔ |
| `P.verifyFrozenLots()` | 0 divergence | **MONO-10=0, MONO-11=0, MONO-09=0, MONO-01=0** | ✔ |
| MONO-11 v0.4, suite propre | 83/83 | **83/83, 0 échec** | ✔ |

### Comparaison des identifiants de tests v1.0.12 → v1.0.14

- **Total** : 292 → **313** (+21)
- **AJOUTÉS (21)** : `RA2-01`…`RA2-08`, `RA1-01`…`RA1-03`, `RA2-E2E-01`…`RA2-E2E-08`, `RI-01..RI-03`, `RI-04..RI-07`
- **RETIRÉS : 0** — aucun test de v1.0.12 n'a été supprimé
- **RENOMMÉS / redéfinis : 1** — `V12-18` (version produit attendue `MONOLITH-v1.0.12` → `MONOLITH-v1.0.14`) : **aucun affaiblissement**, l'assertion sur `frozenLots["MONO-11"].dir === "MONO-11/v0.4"` est conservée
- **Aucun test affaibli** : les 3 tests modifiés (`test-stream.js`, `test-ef03b-lineage.js`, `test-v1012-lineage-parity.js`) ne font qu'**ajouter** l'autorité normalisée exigée par le nouveau contrat de l'adaptateur ; aucune assertion n'a été retirée ni assouplie.
- Anomalie cosmétique **préexistante** : l'identifiant `V1` est porté par deux tests distincts (déjà le cas en v1.0.12).

---

## 16. SECTION 13 — SONDES ADVERSARIALES INDÉPENDANTES (copie uniquement)

| sonde | résultat |
|---|---|
| apostrophe courbe (U+2019, U+2018, U+2032, U+02BC) | parité octet ✔ (P-02) |
| guillemets typographiques (U+201C/201D/201E/2033) | parité octet ✔ (P-03) |
| NBSP (U+00A0, U+202F, U+2007) | parité octet ✔ (P-04) |
| CRLF (+ CR isolé) | parité octet ✔ (P-05) |
| NFC / NFD | parité octet ✔ (P-06) |
| marqueur embarqué `BASE DOCUMENTAIRE DU PROFESSIONNEL` | parité octet ✔, **aucune troncature au marqueur** (P-08, P-10) |
| marqueur + ligne JSON | parité octet ✔ (P-09) |
| **mauvais `targetId`** (`target-99`) | `DOCUMENT_AUTHORITY_REQUIRED` **fatal** ✔ (P13-a) |
| document normalisé correct mais **prompt tronqué** | revue `complete`, 3 refs conservées, `mismatch = 0` ✔ (P13-b) |
| **entrée de registre ancien format** (sans empreinte) | **jamais servie** ✔ (P13-e) |
| **réparation malformée** | revue `error`, **0 écriture au registre**, aucune recomposition ✔ (P13-c) |
| **modèle omettant une ref valide** dans la réparation | 2 refs finales : l'originale littérale **préservée** + la réparée ajoutée ✔ (P13-d) |
| autorité brute / partielle / vide / non-chaîne | refusées fail-closed ✔ (G1, G2, G5, G6) |
| autorité tronquée / autre document mais normalisée | **acceptées** — faiblesse documentée (R2) ⚠ (G3, G7) |

---

## 17. SECTION 14 — R-A3 / R-A5 / R-A6 (observations)

Conformément au mandat, observations seulement — **rien de contraire trouvé** :
- ces trois réserves sont explicitement déclarées **non traitées** par l'auteur (`knownLimits`), et rien dans le diff v1.0.12 → v1.0.14 ne prétend les traiter ;
- aucun test livré ne revendique leur fermeture ;
- aucune régression les concernant n'est observable dans le paquet (les fichiers concernés sont byte-identiques à v1.0.12).

Observation additionnelle, non bloquante : la limite reconnue par l'auteur (« si le lot changeait ses règles de normalisation sans changer de sceau, la garde de point fixe ne le verrait pas ») est **correctement bornée** — le sceau MONO-11 couvre `core/`, et `core/target-normalizer.js` est bien dans `SHA256SUMS.txt` du lot (vérifié : `9e419de7bdf5…`).

---

## 18. ÉTAT DU MANIFESTE ET DES CONTRAINTES

### Manifeste AVANT l'écriture des deux livrables (enregistré en lecture seule, avant toute exécution)

| grandeur | valeur |
|---|---|
| `fileCount` | **160** |
| `contentHash` | `77c05052d052e1ca1c4e1c81097254702bd57fe6c60f81c533178d24b6c53111` |
| `sha256(MANIFEST.json)` | `4ae8962b3d25fb732f85fec04fa312d8f6177fc1ee2bba8365af27e86501a68a` |
| `sha256(SHA256SUMS.txt)` | `32841170147738a679c7c12b5485d41f7a4f1ae142c4745fdf2a918c107502a1` |
| `sha256(test/results.json)` | `8385109288af0b00ee5764b136f5ddc17994ae64a40bfa631f32392ead6a8cef` |
| `node tools/build-manifest.js --verify` | `{"ok":true,"files":160,"bad":[]}` |

> **Déclaration explicite** : les deux livrables de cet audit (`EVIDENCEFORGE-v1.0.14-INDEPENDENT-FREEZE-AUDIT.md` / `.json`) sont écrits dans `MONOLITH-v1.0.14/` **APRÈS** cette mesure et se trouvent donc **HORS du MANIFEST de 160 fichiers**. `build-manifest.js --verify` ne vérifie que les fichiers listés : il **passe toujours** en leur présence (confirmé après écriture). Le propriétaire doit régénérer le MANIFEST (fileCount passera à 162, avec un nouveau `contentHash`) **au moment du gel**, ou décider de les laisser hors manifeste comme artefacts de gouvernance.

### Contraintes

| contrainte | état |
|---|---|
| lecture seule sur l'arbre livré | ✔ **4311 fichiers hachés avant/après, 0 différence** |
| 0 appel fournisseur / 0 réseau | ✔ (fournisseur factice, `127.0.0.1:1`, `global.fetch` remplacé) |
| aucun `doctor.sh` / `start.sh` / `setup.sh` / serveur exécuté | ✔ (`build-manifest.js --verify` lu avant exécution : purement lecture) |
| `ACTIVE_VERSION` | ✔ inchangée : `MONOLITH-v1.0.10` |
| D103 (`jmmjs-p01-closure/`) | ✔ non modifié |
| run historique `efm-20260918-a64167c0` | ✔ non modifié (`report.json` `44b0242bbd25…`, `reviews.json` `2d87507bc890…`) |
| mutations et sondes | ✔ exclusivement dans la copie scratch |
| commit | ✔ aucun |

---

## 19. SYNTHÈSE DE LA DÉCISION

Le correctif est **réel, mesuré et correct**. Le défaut qui a coulé v1.0.13 (autorité BRUTE) est fermé, et je l'ai prouvé par le chemin de production, octet pour octet, sur 14 cibles et 12 configurations typographiques — pas par lecture de code ni par comparaison de fonctions. R5, R6, MONO-11 v0.4 et l'agrégation ne sont pas rouverts ; aucune logique scientifique n'a bougé ; les lots gelés sont intacts ; le shadow A10 est conforme au caractère près.

Ce qui empêche un `PASS` sec est d'ordre **prophylactique** : un mutant du câblage de production survit à la totalité de la suite (X1), la garde de point fixe ne peut pas distinguer « normalisé » de « le bon document » (R2), et trois assertions d'import ne testent que du texte source (M4c survivant). Rien de cela n'invalide le paquet livré ; tout cela affaiblit la protection contre la **prochaine** régression — exactement la classe de défaut qui a déjà frappé deux fois.

**GELER** la v1.0.14 telle quelle, en inscrivant R1, R2, R3, R4, R5 au registre de gel, puis **SMOKE** réel sous la condition R-SMOKE.

---

*Audit produit en lecture seule, sans aucun appel fournisseur ni accès réseau, par un agent indépendant sans contexte préalable. Toutes les valeurs de ce rapport sont MESURÉES, jamais recopiées du rapport de l'auteur.*
