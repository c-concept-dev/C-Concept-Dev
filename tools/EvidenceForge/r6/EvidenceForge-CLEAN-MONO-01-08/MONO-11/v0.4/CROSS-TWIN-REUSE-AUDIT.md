# CROSS-TWIN-REUSE-AUDIT — MONO-11 v0.3 → v0.3-r1

Objet : risque, signalé par l'audit indépendant v0.3 (P2-07), qu'une réparation ciblée VALID produite pour un jumeau A soit **réutilisée** pour un jumeau B par la politique de reuse (clé = octets du prompt), alors que le constat de B est différent. Hors ligne ; aucun appel réseau ; v0.3 et v0.2 non modifiés.

## 1. Faits vérifiés dans le code

| Élément | Fichier | Constat |
|---|---|---|
| Clé de reuse | `core/llm-response-reuse.js` `decide(prompt)` (v0.2, inchangé) | `promptSha256 = sha256(prompt)` ; aucune autre composante ; `meta` n'est pas reçu |
| Filtre exploitant | `MONOLITH-v1.0.3(-r1)/lib/llm.js` `reuseContextCheck` | fournisseur, modèle, sceau MONO-11, contrat de validation, statut VALID, corps en cache — **pas** de jumeau/cible/constat |
| Prompt de base (passe 1) | `F.M01.RR.buildReviewPrompt(twin, doc, schema)` (gelé) | porte l'identité du jumeau et ses œuvres ⇒ distinct par jumeau |
| Reprise informée v0.2 | `informedRepairPrompt(text, errors, twin, doc, …)` | porte la réponse précédente et le jumeau ⇒ distinct |
| **Prompt ciblé v0.3** | `targetedRepairPrompt({targetDoc, faultyDimensions, rejectedRefs, fragments, pass, …})` | fonction de (document, dimensions fautives, citations rejetées, fragments, passe, drapeaux) : **ni jumeau, ni constat** |

Conséquence : deux jumeaux qui rencontrent `TARGET_REF_NOT_LITERAL` sur le même document, la même dimension et la même citation fautive produisent un prompt ciblé **byte-identique** ⇒ même clé de reuse.

## 2. Reproduction adversariale AVANT patch (v0.3 canonique, lecture seule)

Script : `reports/cross-twin-repro.js` (hors lot), exécuté contre `MONO-11/v0.3` avec la **vraie** politique `createReusePolicy` + `createMemoryStore` et un transport qui l'applique comme `lib/llm.js` (`decide` → `REUSE_VALID` ⇒ corps antérieur ; `onValidation` → `markValidation`). Témoin : `reports/CROSS-TWIN-REPRO-v0.3-witness.json`.

Montage : même document synthétique (2 phrases), même dimension, même citation fautive (jonction non contiguë), deux jumeaux distincts du même run synthétique (`twin-…/A-ok`, `twin-…/A-second`), deux constats différents (A : « première phrase » ; B : « seconde phrase »). Réparation de A = citation littérale de la **première** phrase, VALID.

Résultat :
```
distinctTwins = true ; distinctFindingsPass1 = true
targetedPromptSha A = 075ffbc1… ; targetedPromptSha B = 075ffbc1…  (samePromptBytes = true)
reuses = [{ twin: B, pass: 2, strategy: TARGETED_REPAIR, decision: REUSE_VALID, sourceCallId: c2 (appel de A) }]
realCalls = [A p1, A p2, B p1]  (aucun appel réel pour B passe 2)
reviewB = complete, acceptedPassB = 2
refsB_dim0 = ["Premiere phrase du document cible synthetique, avec un passage exact a citer"]   ← citation de A
findingB_dim0 = "CONSTAT-B (different, porte sur la seconde phrase) …"
CROSS_TWIN_REUSE_REPRODUCIBLE = YES
```
La revue de B est acceptée (littéralité garantie par le validateur inchangé) avec une citation choisie pour le constat de A. Lignée conservée (`sourceCallId`), mais la correspondance sémantique citation ↔ constat n'est pas garantie.

Historique réel : sur les 5 séquences éligibles des fixtures (R1–R4, R6), 0 collision effective (R1 et R4 ont la **même** citation fautive sur le **même** document, mais des libellés de dimension différents car issus de deux runs) — quasi-collision qui confirme le réalisme du scénario.

## 3. Correctif minimal (v0.3-r1)

Voie structurée impossible sans toucher un lot gelé : `decide(prompt)` ne reçoit que le prompt ; `lib/llm.js` (monolithe) est hors périmètre et l'intégration n'est pas autorisée. L'identité est donc **portée par le prompt** — la seule composante de la clé que MONO-11 contrôle.

`repairContext({ twin, targetDoc, parsed, faultyDimensions })` → objet canonique :
```
{ schema: "EvidenceForge.RepairContext", version: "MONO-11-v0.3-r1",
  twinId, professionalRef, targetId, documentSha256 = sha256(document),
  dimensions: [{ dimensionId, findingSha256 = sha256(JSON canonique du constat SANS targetEvidenceRefs) }],
  fingerprint = sha256(JSON canonique de l'objet) }
```
Ensemble retenu (le plus petit garantissant l'absence de collision sémantique pertinente) : **jumeau** (deux jumeaux ≠), **constat** (même jumeau, autre lecture ≠ ; le champ réparé est exclu pour que la même réparation resoumise garde son contexte), **cible + document** (autre document ≠), **dimension fautive**. `professionalRef` est inclus par redondance canonique (déjà déterminé par le jumeau). Exclus : `runId`, horodatage, nonce, index de passe (déjà dans le prompt), citations rejetées (déjà dans le prompt).

Le prompt ciblé reçoit une ligne `CONTEXTE DE REPARATION (identification deterministe du constat repare ; sans effet sur la tache) : jumeau=… ; professionnel=… ; cible=… ; document sha256=… ; constat(s) : dim=sha ; empreinte=…`. `targetedRepairPrompt` refuse (`REPAIR_CONTEXT_REQUIRED`) tout appel sans contexte. L'empreinte est exposée dans `meta.repairContextFingerprint` (transports à clé structurée, futurs) et journalisée par passe (`rec.repairContext`). Rien d'autre ne change : validateur, EF-03B, `maxPasses`, stratégies, fragments, recomposition, reuse.

## 4. Vérification APRÈS patch

- r1-T2 : mêmes jumeaux/constats que la reproduction, vraie politique de reuse : prompts distincts, `reuses = 0`, B reçoit **sa** citation (seconde phrase) ; témoin inclus : hors ligne de contexte, les deux prompts sont byte-identiques (collision v0.3), avec la ligne ils diffèrent.
- r1-T1 / r1-T4 : même jumeau + même contexte (y compris nouveau transport après STOP, magasin persisté) ⇒ même empreinte, même prompt, `REUSE_VALID` (sourceCallId `c2`), 0 appel réel supplémentaire pour la réparation ; constat différent à la reprise ⇒ aucun reuse.
- r1-T3 / r1-T5 : déterminisme (deux exécutions ⇒ objets et prompts identiques ; JSON canonique stable à l'ordre des clés ; aucun champ non canonique).
- r1-T6 : rejeu historique — 5 prompts ciblés, 0 collision, 5 contextes distincts, empreinte présente dans chaque prompt.

```
CROSS_TWIN_REUSE_REPRODUCIBLE = YES
CROSS_TWIN_REUSE_FIXED = YES
SAME_CONTEXT_REUSE_PRESERVED = YES
```
