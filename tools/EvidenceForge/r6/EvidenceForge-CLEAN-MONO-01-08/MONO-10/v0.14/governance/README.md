# Gouvernance

`EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md` est le **document directeur**
du projet. Il prime sur toute commodité locale et sur toute dérive liée au cas
d'usage courant.

SHA-256 de la copie incluse :
`b4c160d008c33dd338979afd247945fee8dab862c96e0d1f2841c9ad87596a85`

Copie **conforme et non modifiée** de l'original fourni par le propriétaire.

## Portée temporelle de ce document

Ce tableau décrit **l'état courant du lot MONO-10 v0.14**, sauf mention
explicite du contraire. Lorsqu'une ligne rapporte une affirmation **historique**
d'une version antérieure, elle est marquée `[v0.11 — corrigé depuis]` et la
valeur courante est donnée à côté. Aucune ligne ne doit être lue comme une
mesure actuelle sans ce marquage.

| Article | Exigence | Où elle s'exerce — état courant v0.14 |
|---|---|---|
| §9 | l'humain valide identité et admissibilité, jamais la vérité | `core/panel-gate.js` |
| §10 | *unknown remains unknown* | `core/unknowns.js` |
| §12 | qualité du processus ≠ contenu du verdict | `core/scientific-qualification.js` |
| §13 | qualification additive, jamais réécrite | `core/scientific-unified-report.js` |
| §14 | capacité LLM réelle, jamais déclarative | `core/llm-capability.js` |
| §15 | interdiction absolue de fabrication | `core/human-act.js`, `core/evidence-source-provenance.js` |
| §16 | lineage obligatoire | `core/lineage.js` |
| §17 | fail-closed | `core/operator-trust-boundary.js` et tout le noyau |
| §19 | le statut de gel ne relève pas de l'implémenteur | `AUDIT-REMEDIATION-MATRIX.md` |
| §22 | non-régression mesurable | `NON-REGRESSION.md` |
| §24 | aucune dette bloquante silencieuse | `THREAT-MODEL.md` §4 |
| §27 | indépendance au fournisseur | `adapters/` |
| §29 | une propriété déclarée n'est pas une preuve | `core/operator-trust-verifier.js`, `core/human-act-proof.js` |
| §15 | aucun identifiant fabriqué | `adapters/upstream-evidence-binder.js` — une source sans identifiant fort ne reçoit aucune référence |
| §16 | arêtes de lignée typées | `core/lineage.js` — `ARTIFACT_TYPE_OF_RELATION` |
| §17 | rien n'est cru au point d'effet | `core/panel-gated-adapter.js`, `core/operator-acceptance-boundary.js` |
| §22 | la non-régression est exécutée, pas racontée | `test/test-mono10-v0.11.js` — `NR-01`, `T33` |
| §9 | l'humain valide l'admissibilité, et rien ne le remplace | `core/effective-eligibility.js` — décision absente ⇒ `NOT_ELIGIBLE` |
| §10 | *AMBIGUOUS reste AMBIGUOUS* | `adapters/upstream-evidence-binder.js` — un identifiant ambigu n'est jamais résolu |
| §15 | aucune preuve, aucune force de preuve fabriquée | le pont amont rend `UNKNOWN` et une contribution nulle |
| §29 | un booléen, un hash, une chaîne ne sont pas des autorités | `core/caller-assertion-guard.js`, `core/artifact-capabilities.js` |
| §29 | **un objet marqué par un constructeur exporté n'est pas une autorité** | `core/operator-trust-boundary.js` — poignée d'émission non exportée |
| §17 | fail closed, jusque dans les API publiques de validation | `core/scientific-readiness.js` — registre **authentifié** obligatoire |
| §29 | **une preuve portée n'a d'effet que si son consommateur la vérifie** | `core/authority-descriptor.js` — `configBindingHash` comparé |
| §29 | un identifiant déclaré dans la configuration n'est pas une identité | identité composite de frontière (v0.9) |
| §24 | aucune dette bloquante silencieuse | `README.md` — six hypothèses déclarées, comptées par le contrôle `DOC-11` et comparées au `MANIFEST` ; le lot ne prétend pas prouver qu'un LLM réel a répondu |
| §29 | **une décision réelle ne suffit pas si elle ne lie pas le sujet exact certifié** | `core/operator-llm-capability-boundary.js` — inscription en deux temps, `decisionSubjectHash` |
| §17 | **omettre un composant de sécurité est une erreur, pas une dispense** | `core/scientific-readiness.js` — `READINESS_VERIFIER_REQUIRED` ; `core/llm-capability.js` — contexte authentifié obligatoire |
| §15 | aucune capacité fabriquée : un fournisseur jamais sondé n'est jamais certifié | garantie **comportementale** : *un sujet hors liste blanche ne devient pas une capacité utilisable*. Codes réellement observés : `LLM_SUBJECT_MISMATCH`, `LLM_PROBE_ALREADY_CONSUMED`. `LLM_SUBJECT_OUT_OF_ALLOWLIST` existe dans le code mais **l'ordonnancement actuel rend cette branche inatteignable** : ne pas la présenter comme une garde observée (`OPEN-FINDINGS.md` R5) |
| §29 | **caller-visible issuer ≠ trusted issuer** | `core/operator-trust-boundary.js` — coffre privé `ISSUERS` ; `ACCESSIBLE_ISSUER_COUNT = 0` mesuré par balayage réel (T03) |
| §29 | **une concession n'est fiable que si sa dérivation est vérifiable auprès de son émetteur** | `core/artifact-capabilities.js` — registre de décisions interrogé à l'émission |
| §17 | **une autorité de TEST n'authentifie jamais un run de PRODUCTION** | `core/operator-trust-verifier.js` — comparaison contre le contexte attendu (`PROVENANCE_VERIFIER_CONTEXT_MISMATCH`) |
| §17 | un contrôle qu'on ne peut pas mener est un refus, pas une dispense | `core/llm-capability.js` — bloc de production déduit de ce que la capacité prétend |
| §10 | *unknown remains unknown* jusque dans la mesure de non-régression | `NON-REGRESSION.md` §2 — **valeur courante : `UNVERIFIABLE_HISTORICAL_LOTS = 0`**. `[v0.11 — corrigé depuis]` v0.11 déclarait 9 lots non vérifiables : **cette mesure était fausse**, sa méthode ne cherchait pas les sceaux dans `manifest/` ni sous le nom `SHA256SUMS` sans extension. Les sceaux existent bien ; mais **2 lots portent 9 divergences historiques préexistantes** (`MONO-07` ×1, `MONO-08/v0.6` ×8), et c'est cela qui reste non dissimulé |


## Ce que ce document ne fait pas

Il n'énumère pas les réserves ouvertes du lot : elles vivent dans
`OPEN-FINDINGS.md`, au nombre de **cinq** (R1 à R5), toutes **OUVERTES** et
**non corrigées par v0.14**. Ce document ne doit jamais être lu comme une
attestation que les exigences de la Charte sont satisfaites sans réserve.
