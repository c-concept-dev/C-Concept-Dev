# MONO-10 — migration v0.15 → v0.16

MONO-10 v0.15 est **HISTORIQUE / IMMUTABLE**. v0.16 est un successeur
**strictement documentaire**, comme chacun des lots depuis v0.12.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 à v0.15 n'a rien
> à modifier.

## 0. Pourquoi ce lot existe

L'audit final indépendant de v0.15 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : runtime byte-identique à v0.11–v0.14, delta strictement
documentaire, sceaux et fenêtre de construction reproduits, 21 détecteurs sur
21 causaux, 12 flexions sur 12, 7 déplacements structurels sur 7. Restaient
**deux bloqueurs documentaires** :

- **B1** — `DOC-03` ne détectait pas le quantificateur **post-verbal**
  (« les champs sont tous attestés ») ; l'alternative « sont tous » ajoutée en
  v0.15 n'était atteignable qu'après un quantificateur pré-verbal, cas où
  l'ancien patron mordait déjà. Le témoin de v0.15 passait donc **pour une
  mauvaise raison** — et la fermeture était déclarée ;
- **B2** — `AUDIT-REMEDIATION-MATRIX.md` plaçait trois lignes corrigées en
  v0.15 sous le heading « v0.13 et v0.14 » et la colonne « Statut en v0.14 » :
  la classe même de faute que v0.15 corrigeait ailleurs.

Ce lot ferme ces deux bloqueurs et les lacunes non bloquantes signalées.

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 1. B1 — `DOC-03` : le quantificateur post-verbal

| | |
|---|---|
| **Patron ajouté** | `(sont\|figurent\|se trouve\|se trouvent\|restent\|demeurent\|seraient\|étaient) tou(s\|tes) (attest\|prouv\|garanti\|certifi)…`, évalué **avant** les patrons à quantificateur pré-verbal, indépendamment d'eux |
| **Témoins exacts** | les cinq phrases manquées par l'audit, mot pour mot : « Les champs de l'artefact sont tous attestés par la décision. » ; « Les propriétés de l'artefact sont toutes attestées par la décision. » ; « Les champs de l'artefact figurent tous attestés dans la décision. » ; « Les champs de l'artefact se trouvent tous attestés par la décision. » ; « Les attributs sont tous garantis par la concession. » — plus « Les données sont toutes prouvées. » |
| **Protocole** | pour chacune : paquet propre → `PASS` ; cette seule phrase injectée dans `ARTIFACT-REGISTRY-TRUST.md` → `FAIL` ; revert → `PASS`. Aucune autre faute nécessaire |
| **Total** | 21 variantes-témoins (`ATTESTATION_OVERCLAIM_VARIANTS_CAUGHT = ALL`) |

## 2. B2 — matrice de remédiation : registre borné par ses headings

| | |
|---|---|
| **Correction** | `AUDIT-REMEDIATION-MATRIX.md` §10 garde les constats des audits de v0.12 et v0.13, colonne « Statut atteint en v0.14 (inchangé depuis) » ; un **§11** « v0.15 et v0.16 » reçoit les constats des audits de v0.14 et de v0.15, colonne « Statut en v0.16 » |
| **Détecteur** | `DOC-22` : dans tout document dont le H1 couvre plusieurs versions, chaque section est bornée par la version maximale de son heading ou de sa colonne « Statut en v0.NN » ; une ligne décrivant une correction d'une version postérieure, ou un constat « établi par l'audit final de v0.NN » (donc corrigé au plus tôt en v0.NN+1) au-delà de la borne, est une fausseté |
| **Témoins** | la colonne « Statut en v0.16 » ramenée à « Statut en v0.15 » → `FAIL` ; la ligne « B1 (v0.15) » recollée sous le §10 (la faute B2 exacte) → `FAIL` |

## 3. Lacunes non bloquantes fermées

| Point | Fermeture | Témoins |
|---|---|---|
| chiffres en gras (`DOC-11`, `DOC-12`) | l'emphase markdown entre le nombre et le nom est tolérée : « **cinq** hypothèses », « Les **treize** champs » | « six hypothèses » → « **cinq** hypothèses » dans `governance/README.md` ; « Les **douze** champs » → « **treize** » dans `OPEN-FINDINGS.md` |
| nom de fichier racine pointé (`DOC-15`, scan) | le motif de chemin accepte les points internes ; un fichier racine réel à nom pointé est livré et balayé : `AUDIT-VERDICTS.v0.12-v0.16.md` (`SCAN-04`) | `MANIFEST` référençant `audit.notes.md`, absent → `FAIL` ; chiffre de cadre sans cadre injecté dans le fichier pointé → `DOC-05` `FAIL` |
| statut exact de chaque réserve (`DOC-23`, `COH-01`) | chaque ligne R1..R5 du tableau de statut est vérifiée individuellement : `OPEN`, `NON_BLOCKING`, `NOT_FIXED_IN_V016`, et sa section `## Rn` existe | R5 passée à `CLOSED` / `FIXED_IN_V016`, les quatre autres inchangées → `FAIL` |
| chiffre **cadré mais faux** (`DOC-05`) | dans toute phrase ou ligne de tableau nommant un cadre, chaque chiffre de lots / références doit appartenir à ce cadre, selon `MANIFEST.sealInventory.frameV0NN` — lui-même comparé à la mesure (`SEAL-01` à `SEAL-08`) | « cadre v0.12 … 25 » → « 26 » ; « cadre historique v0.11 … 24 lots » → « 25 lots » → `FAIL` |
| titres de version périmés (`DOC-24`) | un document modifié depuis v0.11 porte la version courante dans son H1 (et sa version d'origine entre parenthèses) : `LLM-CAPABILITY-BOUNDARY.md`, `READINESS.md`, `CAPABILITY-AUTHORITIES.md`, `REPLAY-PROTECTION.md` retitrés ; les documents byte-identiques à v0.11 gardent leur titre d'origine, sont **déclarés** (`MANIFEST.originTitledDocuments`) et vérifiés octet pour octet (`RT-08`) | H1 de `README.md` ramené à v0.15 → `FAIL` |

## 4. « Six champs » et « sept dimensions » : deux objets, mesurés

L'audit de v0.15 relevait que `OPEN-FINDINGS.md` R1 parle de « six champs » et
`LLM-CAPABILITY-BOUNDARY.md` de « sept dimensions ». Ce ne sont pas deux
comptes du même objet, et v0.16 ne les harmonise pas : il les **mesure** dans
`core/operator-llm-capability-boundary.js` et les explique.

| Objet | Source dans le code | Contenu | Nombre |
|---|---|---|---|
| champs inscrits par la sonde dans le sujet | `SUBJECT_FIELDS` | `providerId`, `modelId`, `workerBindingId`, `requestId`, `runId`, `missionHash` | **six** |
| sujet **enregistré** par la décision | `subject` = `SUBJECT_FIELDS` + `artifactId` + `artifactHash` | les six, plus les deux identifiants d'artefact ; `executionMode` est porté par la décision et entre dans `decisionSubjectHash` | **huit** |
| dimensions **exigées** par `verifyDecision` | `REQUIRED` | `providerId`, `modelId`, `workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash`, plus `executionMode` obligatoire ; `requestId` n'est comparé que s'il est présenté | **sept** (+ `executionMode`) |

`DOC-25` lit ces deux tableaux dans le code, exige que `OPEN-FINDINGS.md` R1
énumère `SUBJECT_FIELDS` et annonce « six », « huit » et « sept », et que
`LLM-CAPABILITY-BOUNDARY.md` énumère `REQUIRED`, annonce « sept » et dise que
`requestId` n'est comparé que s'il est présenté. Témoins : « sept dimensions »
→ « six » ; « six champs » → « sept ».

## 5. Règle des témoins causaux

Inchangée : `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT` (une faute, un document,
un seul fichier changé), `PASS_AFTER_REVERT`, sur le document réel, en mémoire,
sans écriture. Vingt-cinq détecteurs, `DOCUMENTARY_CHECKS_CAUGHT =
DOCUMENTARY_CHECKS_TOTAL`.

## 6. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11, v0.12, v0.13, v0.14 **et** v0.15.
`tools/seal-inventory.js` est identique à v0.12 et à tous les lots depuis. La
commande et son résultat attendu sont dans `NON-REGRESSION.md` §1, rejoués par
`DOC-13`.

Delta v0.15 → v0.16, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `OPEN-FINDINGS.md`, `THREAT-MODEL.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`, `AUDIT-REMEDIATION-MATRIX.md`, `LLM-CAPABILITY-BOUNDARY.md`, `READINESS.md` (titre), `CAPABILITY-AUTHORITIES.md` (titre), `REPLAY-PROTECTION.md` (titre), `MIGRATION-v0.14-v0.15.md` (un statut daté), `MIGRATION-v0.15-v0.16.md` (nouveau), `AUDIT-VERDICTS.v0.12-v0.16.md` (nouveau) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.16-documentary.js` (remplace `test/test-mono10-v0.15-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

## 7. Ce que v0.16 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (`NOT_FIXED_IN_V016`) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne réécrit aucun lot historique, v0.15 compris ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.16 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
