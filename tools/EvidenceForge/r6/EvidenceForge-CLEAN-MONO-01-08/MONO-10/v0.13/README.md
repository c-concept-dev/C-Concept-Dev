# MONO-10 v0.13 — FINAL DOCUMENTARY CORRECTION

**Statut : PROPOSÉ À L'AUDIT FINAL DE GEL. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Ce que ce lot est

Un successeur **strictement documentaire** de v0.12 — qui l'était déjà de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée.** Un appelant de v0.11 n'a rien à modifier.

`RUNTIME_BYTE_IDENTICAL_TO_V011 = YES` **et**
`RUNTIME_BYTE_IDENTICAL_TO_V012 = YES`, vérifiables en vingt-quatre `diff`
(`NON-REGRESSION.md` §1). La **Charte** reste byte-identique.

## Pourquoi il existe

Trois audits indépendants se sont succédé. Les deux premiers ont conclu que
v0.11 ne comportait **aucun blocage de sécurité**, tout en établissant qu'elle
portait comme vérité des affirmations fausses — ce que v0.12 a corrigé. Le
troisième, audit final de v0.12, a rendu `NON_GELABLE` : **toujours aucun
bloqueur runtime**, mais **deux affirmations connues fausses subsistaient**, à des
endroits que v0.12 n'avait pas regardés, plus cinq glissements mineurs.

Le principe qui commande ce lot est le même, appliqué une fois de plus :

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
| 14 lots scellés, 514 références | **24** lots, **1 577** références (cadre v0.11) | `tools/seal-inventory.js` |

### Ce que v0.13 corrige en plus, et que v0.12 avait manqué

| # | Où | Affirmation de v0.12 | Réalité |
|---|---|---|---|
| **B1** | `governance/README.md` | « `UNVERIFIABLE_HISTORICAL_LOTS = 9` maintenu, non dissimulé », donné comme **valeur courante** | valeur courante **0** ; ce qui reste non dissimulé, ce sont les **9 divergences** de 2 lots |
| **B2** | `LLM-CAPABILITY-BOUNDARY.md` §3 | « le fait qu'il ait essayé est inscrit dans l'artefact », sans qualification | qualifié **sur place** : traçabilité déclarative, pas autorité critique |

`governance/README.md` avait échappé à v0.12 parce que ses détecteurs ne
balayaient que la **racine**. Le balayage est désormais récursif — c'est la
correction la plus importante de ce lot, parce qu'elle porte sur la méthode et
non sur une phrase.

Cinq glissements mineurs sont corrigés par la même occasion : nombre de réserves
(« quatre » au lieu de cinq), nombre d'hypothèses divergent entre README et
`MANIFEST`, cadre non nommé d'une mesure de fenêtre, collision d'étiquettes
`V011-R1`…`V011-R5` (résidus fermés) contre `R1`…`R5` (réserves ouvertes), et une section insérée
au milieu d'une liste. Détail : `MIGRATION-v0.12-v0.13.md` §3.

## Mesures

| Mesure | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** (24 comparaisons vides) |
| `RUNTIME_BYTE_IDENTICAL_TO_V012` | **YES** |
| `CHARTE_BYTE_IDENTICAL` | **YES** — condition de la décision de périmètre, pas conséquence |
| Fichiers ajoutés au périmètre exécutable | 2, aucun participant : un outil de mesure en lecture seule, une suite documentaire |
| `SEALED_HISTORICAL_LOTS_COUNT` | **24** cadre v0.11 · **25** cadre v0.12 · **26** cadre v0.13 |
| `SEALED_REFERENCES_COUNT` | **1 577** cadre v0.11 · **1 644** cadre v0.12 · **1 715** cadre v0.13 |
| `SEALED_DIVERGENCES` | **9** — `MONO-07` ×1, `MONO-08/v0.6` ×8, **antérieures** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | **0** |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO**, et ce restera NO tant que ces 9 divergences subsisteront |
| `MONO10_V11_CAUSED_REGRESSION` | **NO**, désormais soutenu sur le bon périmètre |
| Contrôles documentaires | **10 / 10**, chacun avec une **mutation causale du paquet livré** |
| Réserves ouvertes consignées | **5** (R1–R5), toutes `OPEN` / `NON_BLOCKING` / `NOT_FIXED_IN_V013` |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Ce que ce lot NE garantit PAS

Cette section est la raison d'être du lot. Elle est écrite pour être lue **avant**
les garanties.

1. **Une préparation artificiellement améliorée est acceptée par
   `assertReadinessPhase`** dans trois variantes. Elle n'atteint ni `QUALIFIED`
   ni `AUTHORIZED` — mais l'API publique est plus permissive que son
   consommateur critique, ce qui contredit une règle que le lot s'impose. (`OPEN-FINDINGS.md` R2)
2. **Une capacité peut être certifiée avec un `probeStatus` mensonger.** Le
   mensonge ne franchit aucune couche critique, et aucun sujet jamais sondé ne
   devient utilisable. (`OPEN-FINDINGS.md` R1)
3. **Treize champs de l'artefact de capacité LLM ne sont pas attestés**, et le
   schéma n'est pas fermé. Aucun consommateur critique ne les lit. (`OPEN-FINDINGS.md` R3)
4. **Neuf divergences de sceau subsistent** dans `MONO-07` et `MONO-08/v0.6`.
   v0.12 ne les corrige pas. (`OPEN-FINDINGS.md` R4)
5. **`LLM_SUBJECT_OUT_OF_ALLOWLIST` est inatteignable.** La garantie est
   comportementale : un sujet hors liste blanche n'est pas utilisable. (`OPEN-FINDINGS.md` R5)

Détail intégral, avec la couche qui compense chacune : `OPEN-FINDINGS.md`.

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
   ici ont survécu plusieurs versions : aucun contrôle automatique ne les voyait.
   `test/test-mono10-v0.13-documentary.js` en couvre désormais dix, récursivement.
5. Le lot ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
6. Une capacité certifiée n'est pas un artefact intégralement prouvé : la
   décision atteste le **sujet** et l'**empreinte**, pas les champs informatifs.

## Lecture

`OPEN-FINDINGS.md` **d'abord** → `MIGRATION-v0.12-v0.13.md` →
`MIGRATION-v0.11-v0.12.md` →
`NON-REGRESSION.md` → `ARCHITECTURE.md` → `TRUST-MODEL.md` →
`CAPABILITY-AUTHORITIES.md` → `LLM-CAPABILITY-BOUNDARY.md` → `READINESS.md` →
`ARTIFACT-REGISTRY-TRUST.md` → `UPSTREAM-EVIDENCE-BINDING.md` →
`HISTORICAL-INPUT-AUTHORITY.md` → `REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` →
`LINEAGE.md` → `RUN-ORDER.md` → `THREAT-MODEL.md` → `KEY-MANAGEMENT.md` →
`HUMAN-ACT-AUTHENTICATION.md` → `AUDIT-REMEDIATION-MATRIX.md` →
`CONTRACT-MAPPING.md`.
