# MONO-10 v0.12 — DOCUMENTARY TRUTH PATCH

**Statut : PROPOSÉ À L'AUDIT FINAL DE GEL. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Ce que ce lot est

Un successeur **strictement documentaire** de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée.** Un appelant de v0.11 n'a rien à modifier.

`RUNTIME_BYTE_IDENTICAL_TO_V011 = YES`, vérifiable en douze `diff`
(`NON-REGRESSION.md` §1).

## Pourquoi il existe

Deux audits indépendants ont conclu que v0.11 ne comportait **aucun blocage de
sécurité**. Ils ont aussi établi que v0.11 portait, **comme vérité**, des
affirmations connues comme fausses. Le principe qui commande ce lot :

> `unknown remains unknown` — et son corollaire, qui manquait :
> **`known false must not remain stated as true`.**

| Affirmation de v0.11 | Réalité mesurée | Corrigé dans |
|---|---|---|
| « l'appelant peut dégrader une préparation, il ne peut pas l'améliorer » | faux à la couche `assertReadinessPhase` ; vrai de bout en bout | `READINESS.md` |
| la certification garantirait la véracité de l'artefact | elle garantit le **sujet** et l'**empreinte**, pas le reste | `ARTIFACT-REGISTRY-TRUST.md` |
| `callerTransportIgnored` présenté comme une garantie | contrôle **auto-défaisant** : l'effacer fait passer, l'honnêteté fait échouer | `LLM-CAPABILITY-BOUNDARY.md` |
| `LLM_SUBJECT_OUT_OF_ALLOWLIST` présenté comme le code observé | branche inatteignable ; garantie **comportementale** | `THREAT-MODEL.md` |
| `SEALED_REFERENCE_DIVERGENCES = 0` | **9** divergences, toutes antérieures à v0.11 | `NON-REGRESSION.md` |
| `UNVERIFIABLE_HISTORICAL_LOTS = 9` | **0** — ces lots sont scellés dans `manifest/`, souvent sans extension | `NON-REGRESSION.md` |
| 14 lots scellés, 514 références | **24** lots, **1 577** références | `tools/seal-inventory.js` |

## Mesures

| Mesure | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** (12 comparaisons vides) |
| Fichiers ajoutés au périmètre exécutable | 2, aucun participant : un outil de mesure en lecture seule, une suite documentaire |
| `SEALED_HISTORICAL_LOTS_COUNT` | **24** (cadre v0.11) — 25 dans le cadre v0.12 |
| `SEALED_REFERENCES_COUNT` | **1 577** (cadre v0.11) — 1 644 dans le cadre v0.12 |
| `SEALED_DIVERGENCES` | **9** — `MONO-07` ×1, `MONO-08/v0.6` ×8, **antérieures** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | **0** |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO**, et ce restera NO tant que ces 9 divergences subsisteront |
| `MONO10_V11_CAUSED_REGRESSION` | **NO**, désormais soutenu sur le bon périmètre |
| Contrôles documentaires | 7 / 7, chacun avec témoin négatif |
| Réserves ouvertes consignées | **5** (R1–R5), aucune présentée comme résolue |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Ce que ce lot NE garantit PAS

Cette section est la raison d'être du lot. Elle est écrite pour être lue **avant**
les garanties.

1. **Une préparation artificiellement améliorée est acceptée par
   `assertReadinessPhase`** dans trois variantes. Elle n'atteint ni `QUALIFIED`
   ni `AUTHORIZED` — mais l'API publique est plus permissive que son
   consommateur critique, ce qui contredit une règle que le lot s'impose. (R2)
2. **Une capacité peut être certifiée avec un `probeStatus` mensonger.** Le
   mensonge ne franchit aucune couche critique, et aucun sujet jamais sondé ne
   devient utilisable. (R1)
3. **Treize champs de l'artefact de capacité LLM ne sont pas attestés**, et le
   schéma n'est pas fermé. Aucun consommateur critique ne les lit. (R3)
4. **Neuf divergences de sceau subsistent** dans `MONO-07` et `MONO-08/v0.6`.
   v0.12 ne les corrige pas. (R4)
5. **`LLM_SUBJECT_OUT_OF_ALLOWLIST` est inatteignable.** La garantie est
   comportementale : un sujet hors liste blanche n'est pas utilisable. (R5)

Détail intégral : `OPEN-FINDINGS-v0.12.md`.

## Ce que v0.11 garantissait, et qui reste vrai

Rien n'a été retiré au produit. Les fermetures de v0.8 à v0.11 tiennent, et les
deux audits indépendants les ont éprouvées : aucun émetteur accessible à
l'appelant ; aucune dérivation inventée acceptée ; aucun ré-étiquetage de
fournisseur, modèle, worker ou artefact ; une sonde ne certifie qu'un artefact ;
un vérificateur de TEST n'authentifie rien d'un run de PRODUCTION ; aucune
validation ne se désactive par omission de son contexte ; le chemin positif hors
ligne aboutit à `QUALIFIED` / `AUTHORIZED` en traversant le vrai consumer
MONO-09 v0.2.

## Hypothèses déclarées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7).
2. Deux fichiers de configuration réellement distincts sont deux racines ; deux
   alias du même fichier sont la même racine. Un **renommage** ouvre une
   nouvelle génération : l'anti-rejeu ne la traverse pas
   (`REPLAY-PROTECTION.md`).
3. Le plafond de statut de préparation est une **borne supérieure** —
   **et l'asymétrie « dégrader seulement » n'est vraie que de bout en bout**,
   pas à la couche d'assertion (`READINESS.md`).
4. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6). C'est précisément pourquoi les faussetés corrigées
   ici ont survécu trois versions : aucun contrôle automatique ne les voyait.
   `test/test-mono10-v0.12-documentary.js` en couvre désormais sept.
5. Le lot ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.

## Lecture

`OPEN-FINDINGS-v0.12.md` **d'abord** → `MIGRATION-v0.11-v0.12.md` →
`NON-REGRESSION.md` → `ARCHITECTURE.md` → `TRUST-MODEL.md` →
`CAPABILITY-AUTHORITIES.md` → `LLM-CAPABILITY-BOUNDARY.md` → `READINESS.md` →
`ARTIFACT-REGISTRY-TRUST.md` → `UPSTREAM-EVIDENCE-BINDING.md` →
`HISTORICAL-INPUT-AUTHORITY.md` → `REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` →
`LINEAGE.md` → `RUN-ORDER.md` → `THREAT-MODEL.md` → `KEY-MANAGEMENT.md` →
`HUMAN-ACT-AUTHENTICATION.md` → `AUDIT-REMEDIATION-MATRIX.md` →
`CONTRACT-MAPPING.md`.
