# MONO-10 — migration v0.11 → v0.12

MONO-10 v0.11 est **HISTORIQUE / IMMUTABLE**. Elle n'est pas modifiée. v0.12 est
un successeur **strictement documentaire**.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée.**
>
> Un appelant de v0.11 n'a **rien** à modifier pour passer à v0.12.

## 1. Pourquoi ce lot existe

Deux audits indépendants ont conclu que v0.11 ne comportait aucun blocage de
sécurité. Ils ont aussi établi que v0.11 portait, **comme vérité**, des
affirmations connues comme fausses :

| Affirmation de v0.11 | Réalité mesurée |
|---|---|
| « l'appelant peut dégrader une préparation, il ne peut pas l'améliorer » | faux au niveau de `assertReadinessPhase`, qui accepte trois variantes de `llmCapability = SATISFIED` sur une capacité inutilisable |
| `SEALED_REFERENCE_DIVERGENCES = 0` | **9** divergences dans le paquet (`MONO-07` ×1, `MONO-08/v0.6` ×8), toutes antérieures à v0.11 |
| `UNVERIFIABLE_HISTORICAL_LOTS = 9` | **0** — ces neuf lots sont scellés ; leur sceau s'appelle `SHA256SUMS`, sans extension, dans `manifest/` |
| 14 lots scellés, 514 références | **24** lots, **1 577** références |
| `LLM_SUBJECT_OUT_OF_ALLOWLIST` présenté comme le code qui s'active | branche inatteignable ; c'est `LLM_SUBJECT_MISMATCH` qui sort |
| « le fait qu'il ait essayé est inscrit dans l'artefact » (`callerTransportIgnored`) | contrôle auto-défaisant : l'effacer fait passer, l'honnêteté fait échouer |

Le principe qui commande ce lot :

> **Un artefact candidat au gel ne doit pas porter comme vérité une mesure, une
> promesse ou un invariant déjà connus comme faux.**

## 2. Ce qui a changé, fichier par fichier

| Fichier | Changement |
|---|---|
| `OPEN-FINDINGS-v0.12.md` | **nouveau** — les cinq réserves R1–R5, aucune présentée comme résolue |
| `MIGRATION-v0.11-v0.12.md` | **nouveau** — ce document |
| `NON-REGRESSION.md` | mesures de sceaux corrigées ; méthode récursive décrite ; preuve d'identité octet à octet du runtime |
| `README.md` | tableau de mesures corrigé ; section « ce que ce lot ne garantit pas » |
| `READINESS.md` | la promesse d'asymétrie est désormais formulée **par couche** |
| `LLM-CAPABILITY-BOUNDARY.md` | champs non attestés énumérés ; résultat déclaré ≠ enregistré ; garantie de liste blanche reformulée au niveau comportemental |
| `THREAT-MODEL.md` | quatre surestimations retirées ou reformulées |
| `TRUST-MODEL.md` | renvoi aux réserves ouvertes ; ce qui n'est pas attesté |
| `ARTIFACT-REGISTRY-TRUST.md` | ce qu'une concession atteste, et ce qu'elle n'atteste pas |
| `AUDIT-REMEDIATION-MATRIX.md` | constats des deux audits indépendants consignés |
| `MANIFEST.json` | mesures corrigées ; `knownOpenFindings` ; `runtimeByteIdenticalTo: "MONO-10-v0.11"` |
| `tools/seal-inventory.js` | **nouveau** — outil de mesure récursif, **lecture seule** |
| `test/test-mono10-v0.12-documentary.js` | **nouveau** — contrôles qui échouent si une fausseté documentaire réapparaît |

## 3. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, `governance/` et
les trois fichiers de test de v0.11 sont **identiques octet pour octet**.

Les fichiers de test conservent volontairement leurs noms de v0.11 —
`test/test-mono10-v0.11.js`, `test/test-mono10-v0.11-integration.js` — **et
c'est la preuve** : les renommer aurait rompu l'identité du jeu de fichiers.
Un lot v0.12 dont la suite s'appelle v0.11 dit exactement ce qu'il est.

```
cd MONO-10
diff -r  v0.11/core       v0.12/core
diff -r  v0.11/adapters   v0.12/adapters
diff -r  v0.11/validators v0.12/validators
diff -r  v0.11/schemas    v0.12/schemas
diff -r  v0.11/contracts  v0.12/contracts
diff -r  v0.11/governance v0.12/governance
diff    v0.11/test/fixture-chain.js                    v0.12/test/fixture-chain.js
diff    v0.11/test/test-mono10-v0.11.js                v0.12/test/test-mono10-v0.11.js
diff    v0.11/test/test-mono10-v0.11-integration.js    v0.12/test/test-mono10-v0.11-integration.js
diff    v0.11/tools/aggregate-hash.js                  v0.12/tools/aggregate-hash.js
diff    v0.11/tools/operator-provisioning.js           v0.12/tools/operator-provisioning.js
diff    v0.11/tools/reference-llm-transport.js         v0.12/tools/reference-llm-transport.js
```

Les douze comparaisons doivent être **vides**. `tools/` reçoit un fichier
**nouveau** (`seal-inventory.js`) ; les trois fichiers existants sont inchangés.

## 4. Effet de bord attendu

Aucun sur l'exécution. Un lecteur de la documentation de v0.11 constatera en
revanche que **plusieurs garanties ont été affaiblies dans leur formulation**.
Ce n'est pas une régression du produit : c'est la correction d'une prose qui
promettait plus que le code.

## 5. Ce que v0.12 ne fait pas

- il ne ferme aucune des réserves R1 à R5 ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité ;
- il ne déclare pas v0.12 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
