# 00 — Executive Summary

> **Mise à jour round 4 (R4), dernier round de préparation au Real
> Smoke** : les trois derniers écarts relevés après R3 sont désormais
> fermés — R4-F01 (la mission canonique livrée reflète honnêtement son
> propre état, `readyForExecution=false` avec les informations
> manquantes explicitement listées), R4-F02 (cohérence des attestations
> opérateur — discipline, missionId, hash de provenance — fail-closed
> sur incohérence) et R4-F03 (`ScreeningArtifact` réellement dérivé du
> résultat de récupération EF-01C2, jamais un placeholder documentaire).
> `CODE_READINESS = READY` mais `MISSION_READINESS = NOT_READY` (aucune
> provenance LLM/humaine n'a été fabriquée pour la mission canonique —
> voir `22-MISSION-READINESS.md`). Voir `19-R4-CLOSURE.md`,
> `20-REAL-SMOKE-OPERATOR-CHECKLIST.md`, `21-SCREENING-LINEAGE.md` et
> `11-FINAL-TECHNICAL-VERDICT.md` (section « Verdict R4 »).

> **Mise à jour round 3 (R3)** : un second audit indépendant PLUS un
> contre-audit Claude LLM ont confirmé, après le round 2, que M-02
> (dérivation causale de `SearchProtocol`) restait le seul point
> réellement bloquant pour `REAL_SMOKE_NEXT`, avec B-04 à clarifier
> (autonomie des artefacts vs de la toolchain système). Les deux sont
> désormais **CLOSED** : `SearchProtocol` est réellement dérivé d'un
> `provenance.plannerOutput` fourni (preuve non-tautologique
> reproductible), et l'autonomie du bundle est précisément définie et
> documentée (`BUNDLE_ARTIFACT_AUTONOMY=PASS`,
> `RUNTIME_TOOLCHAIN_AUTONOMY=NOT_CLAIMED`). Voir `15-R3-CLOSURE.md`,
> `16-M02-CAUSAL-LINEAGE.md`, `17-B04-ARTIFACT-AUTONOMY.md`,
> `18-RUNTIME-PREREQUISITES.md` et `11-FINAL-TECHNICAL-VERDICT.md`
> (section « Verdict R3 ») pour le détail complet et le verdict de
> readiness actuel. Le contenu ci-dessous reste le compte-rendu intact
> du round 1, jamais réécrit (le compte-rendu round 2 est préservé de
> façon identique dans son propre bloc de mise à jour, ci-dessous).

> **Mise à jour round 2 (R2)** : un second audit indépendant a confirmé
> 4 BLOCKERS et 3 MAJORS résiduels sur MONO-08 après le round 1
> ci-dessous. Tous les BLOCKERS (B-01→B-04) et 2/3 des MAJORS (M-01,
> M-03) sont désormais fermés ; M-02 (dérivation causale du contenu de
> `SearchProtocol`) reste documenté ouvert, avec pour conséquence
> `REAL_SMOKE_NEXT = NOT_READY` (règle de gouvernance appliquée
> littéralement, jamais contournée). Voir `12-R2-CLOSURE.md`,
> `13-R2-REMAINING-MAJORS.md` et `11-FINAL-TECHNICAL-VERDICT.md`
> (section « Verdict R2 ») pour le détail complet. Le contenu ci-dessous
> reste le compte-rendu intact du round 1, jamais réécrit.

## Mandat

Produire UNE release canonique, cohérente, MONO-01→MONO-08, via
PRESERVER + CONSOLIDER + CORRIGER + PROUVER — jamais une réécriture.
Stratégie : composition + adaptateurs + orchestration + corrections
locales. Règle cardinale : ne jamais modifier un lot gelé simplement
parce qu'il appartient au paquet final ; si aucun changement fonctionnel
n'est nécessaire, `NO CHANGE REQUIRED`.

Sources d'entrée : `d7f8a9a1-EvidenceForgeAUDITPROFONDMONO0008.md`
(audit condensé, findings F-01→F-18), `bae13a73-...zip`
(`EVIDENCEFORGE-INDEPENDENT-AUDIT-MONO-00-08`, 21 documents, findings
F-01→F-09 pour MONO-08 spécifiquement), `e8a0e1fd-Mono.zip` (bundle de
révisions dupliquées MONO-00→08).

## Révision canonique choisie par lot

| Lot | Source retenue | Tests | Régression |
|---|---|---|---|
| MONO-00 | HANDOFF kit `EvidenceForge-MONO-00-v1.zip` | 27/27 | Aucune |
| MONO-01 | copie imbriquée la plus profonde (MONO-05→04→03→02→01) | 172/172 | Aucune |
| MONO-02 | HANDOFF kit `EvidenceForge-MONO-02-R1.zip` | 334/334 | Aucune |
| MONO-03 | HANDOFF kit `EvidenceForge-MONO-03-R1.zip` | 64/64 | Aucune |
| MONO-04 | HANDOFF kit `EvidenceForge-MONO-04-R1.zip` | 69/69 | Aucune |
| MONO-05 | HANDOFF kit `EvidenceForge-MONO-05-R3.zip` (déjà corrigé, mission précédente) | 119/119 | Aucune |
| MONO-06 | HANDOFF kit `EvidenceForge-MONO-06-R3.zip` | 22/22 (auto-tests du harnais) | Aucune |
| MONO-07 | extraction de secours déjà validée (le ZIP du HANDOFF kit était corrompu — voir `01-CANONICAL-SOURCE-SELECTION.md`) | 127/127 | Aucune |
| MONO-08 | copie de travail git `EvidenceForge/MONO-08/v0.6/` (déjà la plus mûre : rate-limiter fail-closed, preflight bounded, modèle configurable) + remédiation de cette mission | voir ci-dessous | Aucune |

Preuve indépendante : rejeu réel du gate MONO-06 (`runMono06Gate()`,
jamais réimplémenté) sur ce jeu canonique →
`overallStatus: PASS`, `monoObserved: 785/785`, `historiqueObserved:
1223/1223` (voir `TEST-REPORTS/MONO-00-07/mono-06-gate-replay-report.json`).

## Ce qui a été corrigé dans MONO-08 (findings BLOCKER/MAJOR)

| Finding | Sévérité | Statut |
|---|---|---|
| F-01 — perte de `lastError`/`errorCode` dans le reporting Real Smoke | MAJOR | **PATCHED** |
| F-02 — `acteur:"human"` fabriqué sans distinction de mode | **BLOCKER** | **PATCHED** |
| F-03 — `ResolverTrace`/`plannerRuns` avec hashes impossibles | MAJOR | **PATCHED** |
| F-04 — le CDC ne statue jamais sur les exigences d'un Real Smoke GELABLE | MAJOR | **PATCHED** (décision de gouvernance appliquée en code, pas seulement documentée) |
| F-05 (numérotation indépendante) — aucune preuve de persistance CROSS_PROCESS | MAJOR | **PATCHED** (nouvelle preuve réelle) |
| F-06 — fixture de mission modifiée v0.5→v0.6 sans déclaration honnête | MAJOR | **PATCHED** |
| F-07 (numérotation indépendante) — existence non prouvée du Real Smoke nominal | INFO | **DOCUMENTED_LIMITATION** (jamais fabriqué — voir `10-REAL-SMOKE-READINESS.md`) |
| F-09 (numérotation indépendante) — `createOperatorBackends()` sans injection | MAJOR | **MITIGATED_BY_COMPOSITION** (contournement Option A, MONO-05 jamais modifié) |

Détail complet, y compris les findings F-08→F-18 de l'audit condensé et
leur correspondance : `02-FINDINGS-DISPOSITION.md`.

## Lots non modifiés fonctionnellement

MONO-01→MONO-04, MONO-06 : **NO CHANGE REQUIRED**. Aucune modification
de code, uniquement une sélection de révision canonique et une
vérification indépendante par ré-exécution réelle des suites de tests.
MONO-05 : **NO CHANGE REQUIRED** également dans cette mission (déjà
corrigé lors d'une mission précédente — Playwright sync fix + exclusion
manifeste des captures d'écran régénérées ; aucun changement
supplémentaire ici). MONO-07 : **NO CHANGE REQUIRED** au test historique
de reprise (préservé tel quel, reclassifié en documentation seulement —
voir `05-PERSISTENCE-REMEDIATION.md`).

## Nouvelle preuve produite

`CROSS_PROCESS = PASS` — deux processus Node réellement distincts
(`child_process.spawn`), backend durable fichier
(`lib/file-durable-backend.js`, `bindingType: FILE_DURABLE`), aucun objet
JS partagé entre les deux processus. Voir `05-PERSISTENCE-REMEDIATION.md`
et `TEST-REPORTS/MONO-08/test_t08_cross_process.out`.

## Ce qui reste ouvert

- `REAL_SMOKE_HISTORIQUE = FAIL` (jamais transformé en `NOT_RUN` — voir
  `10-REAL-SMOKE-READINESS.md`).
- Aucun appel réseau réel n'a été relancé pendant cette mission (interdit
  par le mandat, section 14).
- `mission.eForchProvenance` (provenance LLM/humaine réelle requise par le
  mode `REAL`) n'existe pas encore dans `fixtures/mission-real-smoke-v1.json`
  — un run réel échouera donc honnêtement en `OPERATOR_INPUT_REQUIRED`
  tant que l'opérateur ne l'aura pas fourni. C'est le comportement
  attendu, pas un défaut.

## Verdict

```
MONO-08 = GELABLE TECHNIQUEMENT
```

Voir `11-FINAL-TECHNICAL-VERDICT.md` pour le bloc de verdict complet
(format section 22 du mandat). Ce verdict est **technique uniquement** —
le gel définitif reste réservé à l'audit indépendant.
