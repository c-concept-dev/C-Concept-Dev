# 22 — Mission Readiness (R4, deux axes distincts)

**Document historique R4, préservé tel quel (règle constante : jamais
falsifier l'historique).** L'audit indépendant round 4 a relevé
(R4-A03) que le couple `(MISSION_READINESS, REAL_SMOKE_NEXT)` décrit
ci-dessous ne représente plus honnêtement un système désormais composé
de deux phases temporellement distinctes (PREPARE puis RESUME,
introduites par R5). **`26-READINESS-SEMANTICS.md` est désormais la
source de vérité opérationnelle** sur la sémantique de readiness — ce
document reste préservé comme trace du raisonnement R4, jamais comme
référence à jour.

À partir de R4, `REAL_SMOKE_NEXT` se décompose littéralement en deux
questions indépendantes (mandat R4, sections 26-28), jamais confondues :

```
REAL_SMOKE_CODE_READINESS    = capacité TECHNIQUE du runtime
REAL_SMOKE_MISSION_READINESS = toutes les entrées/preuves REQUISES POUR
                                 CETTE mission precise sont disponibles

REAL_SMOKE_NEXT = READY  ⟺  CODE_READINESS = READY  ET  MISSION_READINESS = READY
```

## CODE_READINESS

| Précondition | Statut |
|---|---|
| B-01 (persistence-restart CROSS_PROCESS réel) | CLOSED |
| B-02 (secret scan mode-aware, surfaces étendues) | CLOSED |
| B-03 (mission-gate cohérent avec eForchProvenance) | CLOSED |
| B-04 (autonomie des artefacts du bundle) | CLOSED |
| M-01 (terminologie ATTESTED/VERIFIED honnête) | CLOSED |
| M-02 (dérivation causale SearchProtocol ← plannerOutput) | CLOSED |
| M-03 (gestion d'erreur disque ENOENT/corruption) | CLOSED |
| Observabilité (`lastError`/`errorCode` préservés) | PASS |
| Secret scan (package + delegated) | PASS |
| Cross-process (preuve locale + chemin nominal) | PASS |
| Bundle autonomy (artefacts, jamais la toolchain) | PASS |
| Non-régression (R1→R4, toutes suites) | PASS |
| Lineage EF-01C2→EF-01D (R4-F03) | PASS |

**`CODE_READINESS = READY`** — les 13 préconditions ci-dessus sont
toutes satisfaites, avec preuve reproductible pour chacune (voir
`15-R3-CLOSURE.md`, `19-R4-CLOSURE.md`).

## MISSION_READINESS

Évaluée sur `fixtures/mission-real-smoke-v1.json`, la mission canonique
livrée par ce paquet, telle qu'elle existe RÉELLEMENT (jamais un
scénario hypothétique) :

| Précondition | Statut | Détail |
|---|---|---|
| `readyForExecution=true` | **MISSING** | La fixture porte honnêtement `readyForExecution=false` (corrigé R4-F01 — était incohérent avant R4) |
| `eForchProvenance` complète | **MISSING** | Absente de la fixture — voir `operatorInputRequired` dans le fichier lui-même |
| `plannerOutput` (contenu causal réel) disponible | **MISSING** | Aucun appel LLM planificateur réel n'a été effectué pour cette mission dans le cadre de cette remédiation |
| `resolverRuns` (provenance resolver) disponible | **MISSING** | Idem |
| `humanValidation` réellement fournie | **MISSING** | Idem |
| `auditDecisions` réellement fournies | **MISSING** | Structurellement impossible à fournir avant une récupération réelle (voir `21-SCREENING-LINEAGE.md`) |
| Mission-gate PASS | **INVALID** (NOT_READY) | Confirmé par `describeMissionGateStatus()` — `MISSION_NOT_READY`, motif `readyForExecution=false` |
| Aucun `OPERATOR_INPUT_REQUIRED` restant | **INVALID** | Cinq entrées explicitement listées comme manquantes |

**`MISSION_READINESS = NOT_READY`** — sans exception. Aucune valeur n'a
été inventée pour faire basculer cette évaluation en `READY` (mandat
section 25/38, appliqué littéralement).

## Pourquoi les deux peuvent diverger — et pourquoi c'est honnête

`CODE_READINESS = READY` répond à : « le RUNTIME est-il structurellement
sain, testé, sans BLOCKER, avec un lineage epistémique complet et
vérifiable ? » — oui.

`MISSION_READINESS = NOT_READY` répond à une question complètement
différente : « CETTE mission précise dispose-t-elle aujourd'hui de
toutes les preuves/attestations réelles requises pour un Real Smoke
honnête ? » — non, parce qu'aucun appel LLM réel, aucune validation
humaine réelle, aucune décision de screening réelle n'a été produite
pour `mono08-mission-wcag-smoke` dans le cadre de cette remédiation
(et ne devait PAS l'être — mandat R4, interdiction absolue de fabriquer
`plannerRun`/`resolverRuns`/`humanValidation`/`auditDecisions`/`screening`
même à des fins de démonstration).

Un code prêt n'implique jamais une mission prête. Une mission prête
suppose toujours un code prêt (le mission-gate le vérifie mécaniquement
avant tout appel provider). Ces deux axes ne se substituent jamais l'un
à l'autre.

## Verdict combiné

```
REAL_SMOKE_CODE_READINESS    = READY
REAL_SMOKE_MISSION_READINESS = NOT_READY

REAL_SMOKE_NEXT = READY_FOR_INDEPENDENT_REAL_RUN
```

**Note de lecture importante** : `REAL_SMOKE_NEXT = READY_FOR_
INDEPENDENT_REAL_RUN` signifie que le CODE est prêt à supporter un run
réel *dès que* l'opérateur aura fourni une mission réellement complète
(voir `20-REAL-SMOKE-OPERATOR-CHECKLIST.md`) — jamais que ce paquet
recommande de lancer un Real Smoke sur la mission canonique telle
qu'elle est livrée aujourd'hui (`MISSION_READINESS = NOT_READY` pour
CETTE mission précise). Le prochain Real Smoke réel nécessite (a) la
gouvernance/l'audit indépendant pour l'autoriser, ET (b) un opérateur
ayant réellement complété `eForchProvenance` pour la mission qu'il
souhaite exécuter — les deux conditions, jamais l'une sans l'autre.

`MONO-09 / JMMJS = BLOQUÉ` reste inchangé, gouverné séparément (voir
`11-FINAL-TECHNICAL-VERDICT.md`).
