# RELEASE-MANIFEST — EvidenceForge MONO-01→08 (remédié)

Date : 2026-09-03 (round 6 — rounds 1 à 5 également datés du
2026-08-31/2026-09-01, préservés dans l'historique git, jamais
réécrits). Statut : `MONO-08 = GELABLE TECHNIQUEMENT`,
`REAL_SMOKE_CODE_READINESS = READY`,
`REAL_SMOKE_PREPARATION_READINESS_CANONICAL_MISSION = NOT_READY`,
`REAL_SMOKE_RESUME_READINESS = NOT_READY`,
`REAL_SMOKE_PREPARE_NEXT = NOT_READY`,
`REAL_SMOKE_RESUME_NEXT = NOT_READY`, `MONO-09/JMMJS = BLOQUÉ`
(le MÉCANISME deux-phases est désormais accessible par un chemin CLI
nominal réel — `--phase prepare`/`--phase resume`,
`PREPARE_ENTRYPOINT`/`RESUME_ENTRYPOINT`/`NO_REFETCH_ON_NOMINAL_RESUME`
tous `PASS`, prouvé avec une fixture LOCAL_CONTROLLED complète où
`PREPARE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN` ; mais la mission
canonique livrée par ce paquet n'a délibérément reçu aucune provenance
LLM/humaine fabriquée ni aucun `RetrievalSnapshot` réel, donc
`PREPARATION_READINESS_CANONICAL_MISSION`/`PREPARE_NEXT = NOT_READY`
pour CETTE mission précise ; déblocage de MONO-09/JMMJS réservé à une
validation de gouvernance/audit indépendant réelle, jamais au verdict
technique de Claude Code lui-même — voir `AUDIT-REMEDIATION/
11-FINAL-TECHNICAL-VERDICT.md`, section « Verdict R6 », et
`26-READINESS-SEMANTICS.md` pour le détail complet et pourquoi ces
axes ne se contredisent pas).

**Round 6** (micro-intégration finale) a fermé les deux écarts relevés
par l'audit indépendant round 5 : R6-F01
(`NOMINAL_REAL_SMOKE_TWO_PHASE_INTEGRATION` — les primitives R5
(`prepareRealScreening()`/`resumeRealScreening()`) sont désormais
branchées derrière deux points d'entrée CLI réels,
`bin/run-real-smoke.js --phase prepare`/`--phase resume`, sans aucune
duplication ni nouvelle architecture) et R6-F02 (readiness surqualifiée
— `computeReadinessReport()` calcule et rapporte désormais
explicitement, en code testé, `CODE_READINESS`/
`PREPARATION_READINESS`/`RESUME_READINESS`/`PREPARE_NEXT`/
`RESUME_NEXT` pour toute mission donnée). Voir `AUDIT-REMEDIATION/
27-R6-CLOSURE.md` pour le récapitulatif fichier-par-fichier,
test-par-test, et `28-NOMINAL-PREPARE-RESUME-CLI.md` pour
l'architecture CLI complète.

**Round 5** (round FINAL de préparation au Real Smoke, historique) a fermé les
trois écarts relevés par l'audit indépendant round 4 : R4-A01
(dépendance cyclique temporelle mission-gate ↔ auditDecisions ↔
retrieval, BLOQUANT — le `PRE_RETRIEVAL_GATE` n'exige plus jamais
`auditDecisions`, déplacées vers un `POST_RETRIEVAL_GATE` dédié,
exécuté seulement après qu'un `RetrievalSnapshot` réel existe), R4-A02
(workflow de reconnaissance gouverné — nouveau
`lib/real-screening-workflow.js` implémentant `PREPARE_REAL_SCREENING`
puis `RESUME_REAL_SCREENING`, séparés par une pause opérateur
explicite autour d'un `RetrievalSnapshot` durable, hashé, immuable) et
R4-A03 (contradiction du verdict final — readiness désormais qualifiée
par phase, `REAL_SMOKE_PREPARE_NEXT`/`REAL_SMOKE_RESUME_NEXT` distincts,
plus jamais un champ `REAL_SMOKE_NEXT` ambigu unique). Voir
`AUDIT-REMEDIATION/23-R5-CLOSURE.md` pour le récapitulatif
fichier-par-fichier, test-par-test, `24-REAL-SCREENING-TWO-PHASE-
WORKFLOW.md` pour l'architecture complète, `25-RETRIEVAL-SNAPSHOT-
CONTRACT.md` pour le schéma de l'artefact intermédiaire, et
`20-REAL-SMOKE-OPERATOR-CHECKLIST.md` (mis à jour) pour la marche à
suivre opérateur réelle en six étapes (A→F).

**Round 4** (historique, préservé) avait fermé les trois écarts
relevés par l'audit indépendant après R3 : R4-F01 (la mission
canonique livrée reflète désormais honnêtement son propre état de
readiness — `readyForExecution=false` avec `operatorInputRequired`
explicite, au lieu d'un `true` incohérent avec l'absence de
`eForchProvenance`), R4-F02 (cohérence des attestations opérateur —
discipline attestée vs RunContract, `missionId`, `plannerOutputHash`,
tous fail-closed sur incohérence) et R4-F03 (`ScreeningArtifact` est
désormais réellement dérivé du résultat retrieval EF-01C2 exécuté en
amont, jamais un placeholder documentaire — voir `AUDIT-REMEDIATION/
21-SCREENING-LINEAGE.md`). Voir `AUDIT-REMEDIATION/19-R4-CLOSURE.md`
pour le récapitulatif fichier-par-fichier, test-par-test.

**Round 3** (historique, préservé) avait fermé M-02 (`SearchProtocol`
réellement dérivé de `provenance.plannerOutput`) et B-04 (distinction
`BUNDLE_ARTIFACT_AUTONOMY`/`RUNTIME_TOOLCHAIN_AUTONOMY`) — voir
`AUDIT-REMEDIATION/15-R3-CLOSURE.md`.

**Round 2** (historique, préservé) avait fermé les 4 BLOCKERS confirmés
par l'audit indépendant (B-01 persistence-restart réellement
CROSS_PROCESS, B-02 secret scan sensible au mode direct/delegated, B-03
mission-gate validant `eForchProvenance`, B-04 paquet autonome comme
`KIT_ROOT`) et fermé 2 des 3 MAJORS (M-01 terminologie, M-03 gestion
d'erreur disque) ; M-02 restait alors DOCUMENTÉ OUVERT — voir
`AUDIT-REMEDIATION/12-R2-CLOSURE.md` et `13-R2-REMAINING-MAJORS.md`.
MONO-01→MONO-07 : **inchangés dans ce round également (r1, r2, r3, r4, r5 et r6)**.

Cette release existe précisément pour éliminer le problème de
`VERSIONING_GOVERNANCE` identifié par l'audit (F-08 transversal,
F-11 condensé) : plusieurs archives concurrentes du même lot, sous le
même identifiant, sans nomenclature univoque. **Ce paquet ne contient
qu'UNE seule révision par lot**, sélectionnée par contenu réel et non
par nom/date/SHA.

| Lot | Révision source | État | Modifications appliquées | Dépendances | Compatibilité aval | Tests | Statut technique |
|---|---|---|---|---|---|---|---|
| MONO-00 | `EvidenceForge-MONO-00-v1.zip` (kit HANDOFF) | Canonique | Aucune | Aucune (lot racine) | Registre consommé tel quel par MONO-01 | 27/27 | GELÉ, inchangé |
| MONO-01 | Copie imbriquée la plus profonde (sous MONO-05 complet) | Canonique | Aucune | MONO-00 (registre) | Consommé par MONO-02→08 | 172/172 | GELÉ, inchangé |
| MONO-02 | `EvidenceForge-MONO-02-R1.zip` (kit HANDOFF) | Canonique (R1, corpus-by-ref-map rebaseliné) | Aucune | MONO-01 | Consommé par MONO-03→08 | 334/334 | GELÉ, inchangé |
| MONO-03 | `EvidenceForge-MONO-03-R1.zip` (kit HANDOFF) | Canonique | Aucune | MONO-01, MONO-02 | Consommé par MONO-04→08 | 64/64 | GELÉ, inchangé |
| MONO-04 | `EvidenceForge-MONO-04-R1.zip` (kit HANDOFF) | Canonique | Aucune | MONO-01→03 | Consommé par MONO-05→08 | 69/69 | GELÉ, inchangé |
| MONO-05 | `EvidenceForge-MONO-05-R3.zip` (kit HANDOFF = produit corrigé d'une mission précédente : fix Playwright + exclusion manifeste des captures régénérées) | Canonique (R3) | Aucune (cette mission) | MONO-01→04 | Consommé par MONO-08 (chemins `cfg.MONO01_PATH` etc.) | 119/119 | GELÉ, inchangé cette mission |
| MONO-06 | `EvidenceForge-MONO-06-R3.zip` (kit HANDOFF) | Canonique (R3, registre à jour 785/1223) | Aucune | Vérifie MONO-00→05 | Source de vérité des totaux attendus | 22/22 (auto-tests) | GELÉ, inchangé |
| MONO-07 | Extraction de secours connue-bonne (le ZIP du kit HANDOFF était corrompu) | Canonique | Aucune (le test historique de reprise CROSS_INSTANCE est préservé tel quel) | MONO-01→06 (via MONO-05) | `lib/harness-env.js`/`lib/e2e-driver.js`/`lib/mono06-gate.js` consommés tels quels par MONO-08 | 127/127 | GELÉ, inchangé |
| MONO-08 | Copie de travail git `v0.6/` (commit `f13f9fd`) + remédiation r1 + r2 + r3 + r4 + r5 + r6 de cette mission | **Remédié** (r1 : F-01/F-02/F-03/F-04/F-06/F-14, preuve CROSS_PROCESS LOCAL_CONTROLLED ; r2 : B-01/B-02/B-03/B-04 fermés, M-01/M-03 fermés ; r3 : M-02 fermé — dérivation causale réelle — B-04 clarifié artefacts/toolchain ; r4 : R4-F01 mission canonique honnête, R4-F02 cohérence des attestations, R4-F03 lineage EF-01C2→EF-01D réel ; r5 : R4-A01 gate temporel scindé PRE/POST_RETRIEVAL, R4-A02 workflow PREPARE/RESUME_REAL_SCREENING avec RetrievalSnapshot durable, R4-A03 readiness qualifiée par phase ; r6 : R6-F01 chemin CLI nominal `--phase prepare/resume` branché sur les primitives R5, R6-F02 readiness calculée en code testé) | r1 : `03-FILES-CHANGED.md` (15 fichiers). r2 : `12-R2-CLOSURE.md` (15 fichiers). r3 : `15-R3-CLOSURE.md` (7 fichiers). r4 : `19-R4-CLOSURE.md` (5 fichiers). r5 : `23-R5-CLOSURE.md` (8 fichiers). r6 : `27-R6-CLOSURE.md` (4 fichiers) | MONO-01→07 (via MONO-05) | Point d'entrée Real Smoke ; aucun consommateur aval (MONO-09/JMMJS BLOQUÉ par gouvernance, voir 11-FINAL-TECHNICAL-VERDICT.md) | 331/331 (+19 NOT_RUN_ENVIRONMENT_BLOCKED honnête) | `GELABLE TECHNIQUEMENT`, `REAL_SMOKE_CODE_READINESS=READY`, `PREPARE_ENTRYPOINT=PASS`, `RESUME_ENTRYPOINT=PASS`, `REAL_SMOKE_PREPARATION_READINESS_CANONICAL_MISSION=NOT_READY`, `REAL_SMOKE_PREPARE_NEXT=NOT_READY` (mission canonique) |

## Interdiction de multiplicité

Ce paquet ne contient, pour chaque lot, qu'une seule copie sous
`MONO-XX/`. Aucun ZIP concurrent, aucune révision alternative, aucun
suffixe de round (`-r1`, `-r2`, `-r3`, `-fix`, etc.) n'est inclus. Un
consommateur de ce paquet qui trouve un `MONO-XX` en dehors de cette
structure sait immédiatement qu'il ne fait PAS partie de cette release.

## Historique round-par-round

L'historique complet des rounds correctifs (r1→r4 pour MONO-08, TESTFIX/
EXEC/MANIFESTFIX pour MONO-05) reste disponible dans l'historique `git`
du dépôt source de développement — jamais supprimé, seulement non
dupliqué dans ce paquet de release. Voir
`AUDIT-REMEDIATION/03-FILES-CHANGED.md`, section « Fichiers explicitement
exclus », pour la liste précise des archives et dossiers de preuve par
round exclus et leur justification.

## Structure de ce paquet

```
EvidenceForge-CLEAN-MONO-01-08/
├── MONO-00/ … MONO-07/          (canoniques, gelés, inchangés)
├── MONO-08/                     (remédié cette mission)
│   ├── v0.6/                    (code + tests, y compris la remédiation)
│   ├── v0.6-implementation-evidence-2026-08-31/ (dossier de preuve, corrigé F-06)
│   ├── MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md
│   ├── MONO-08-v0.6-ACCEPTANCE-MATRIX.md
│   └── BASELINE-CANONIQUE.md
├── AUDIT-REMEDIATION/            (28 documents, voir liste ci-dessous)
├── TEST-REPORTS/                 (sorties console réelles de toutes les suites)
├── MIGRATION-NOTES/              (notes de canonicalisation, décisions de composition)
└── RELEASE-MANIFEST.md           (ce fichier)
```

## AUDIT-REMEDIATION/ (28 documents — 12 r1 + 2 r2 + 4 r3 + 4 r4 + 4 r5 + 2 r6)

00-EXECUTIVE-SUMMARY (mis à jour r3, r1/r2 préservés),
01-CANONICAL-SOURCE-SELECTION, 02-FINDINGS-DISPOSITION,
03-FILES-CHANGED, 04-CONTRACT-IMPACTS, 05-PERSISTENCE-REMEDIATION,
06-EPISTEMIC-REMEDIATION, 07-OBSERVABILITY-REMEDIATION, 08-TEST-RESULTS,
09-REMAINING-RISKS, 10-REAL-SMOKE-READINESS, 11-FINAL-TECHNICAL-VERDICT
(mis à jour r6, r1/r2/r3/r4/r5 préservés), 12-R2-CLOSURE (r2),
13-R2-REMAINING-MAJORS (r2, mis à jour avec pointeur r3, contenu
original préservé), 15-R3-CLOSURE (r3), 16-M02-CAUSAL-LINEAGE (r3),
17-B04-ARTIFACT-AUTONOMY (r3), 18-RUNTIME-PREREQUISITES (r3 —
numérotation 14 volontairement sautée, alignée sur un numéro de section
mandat interne avant renumérotation finale ; aucun document 14 distinct
n'existe, ce n'est pas une omission), 19-R4-CLOSURE (r4),
20-REAL-SMOKE-OPERATOR-CHECKLIST (r4, mis à jour r5 — workflow en six
étapes A→F), 21-SCREENING-LINEAGE (r4), 22-MISSION-READINESS (r4,
annoté historique r5 — voir 26-READINESS-SEMANTICS), 23-R5-CLOSURE
(r5), 24-REAL-SCREENING-TWO-PHASE-WORKFLOW (r5), 25-RETRIEVAL-
SNAPSHOT-CONTRACT (r5), 26-READINESS-SEMANTICS (r5, mis à jour r6 —
sémantique désormais implémentée en code testé), **27-R6-CLOSURE**
(nouveau r6), **28-NOMINAL-PREPARE-RESUME-CLI** (nouveau r6).

## Exclusions appliquées (mandat section 18)

`node_modules/`, `.git/`, `.env`/`*.env`, fichiers contenant `secret`
dans leur nom, `__MACOSX/`, `.DS_Store`, `._*` (AppleDouble), `tmp/`,
`cache/`, révisions concurrentes, ZIP de rounds intermédiaires. Vérifié
par recherche explicite sur l'arborescence finale avant packaging (voir
`MIGRATION-NOTES/`).
