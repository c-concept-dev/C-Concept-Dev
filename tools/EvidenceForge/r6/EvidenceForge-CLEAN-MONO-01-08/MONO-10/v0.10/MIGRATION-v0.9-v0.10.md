# MONO-10 — migration v0.9 → v0.10

MONO-10 v0.9 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.10 est
un successeur **additif ciblé** : l'architecture d'autorité de v0.8/v0.9 n'est
pas redessinée. Deux brèches confirmées sont fermées, et les conséquences de
cette fermeture sont propagées à tous les consommateurs.

> **Principe directeur de v0.10** — une capacité de sécurité n'est digne de
> confiance que si **sa dérivation est vérifiable auprès de son émetteur**.
> L'appelant peut **demander** une opération. Il ne doit pas **recevoir**
> l'émetteur.

## 1. Ce que v0.9 laissait ouvert

**B1 — la frappe de capacité était libre.** `mintCapabilityGrant` acceptait
n'importe quelle `derivationRef` : une chaîne suffisait. Et les émetteurs réels
étaient **atteignables** — `verifier.provenanceAuthority()`,
`verifier.llmCapabilityBoundary()`, `verifier.historicalInputAuthority()`,
`boundary.humanAuthMechanism`. L'appelant récupérait donc le vrai émetteur et se
concédait `AUTHENTICATED_PROVENANCE` avec
`derivationRef: "je-decrete-que-cest-authentifie"`.

**B2 — un vérificateur ne valait que pour lui-même.** Chaque émetteur comparait
son identité à celle que l'appelant lui passait. Un vérificateur de **TEST
réel** — donc authentiquement marqué — présenté sur un registre de
**PRODUCTION** se comparait à lui-même, et la comparaison passait.

## 2. Aucun module nouveau

v0.10 ne crée aucun module. Elle déplace des émetteurs hors de portée et ajoute
un registre de décisions à ceux qui existent déjà.

## 3. Changements de rupture

| v0.9 | v0.10 |
|---|---|
| `boundary.provenanceAuthority` / `.humanAuthMechanism` / `.llmCapabilityBoundary` / `.historicalInputAuthority` | **supprimés de l'objet frontière**. Les émetteurs sont détenus dans une carte faible privée de `operator-trust-boundary.js`. `boundary.issuerInventory` déclare leur présence sans les remettre |
| `OTV.createOperatorTrustVerifier(boundary)` | **retiré**. `OTB.verifierFor(boundary)` est la seule fabrique ; elle refuse une frontière non marquée (`TRUST_BOUNDARY_FORGED`) |
| `verifier.provenanceAuthority()` | `verifier.resolveProvenanceRoots(descriptor, contexteAttendu)` et `verifier.certifyProvenance({registry, artifactId})` — des **résultats**, pas l'émetteur |
| `verifier.llmCapabilityBoundary()` | `verifier.runLlmProbe(config, ctx)` et `verifier.certifyLlmCapability({registry, artifactId})` |
| `boundary.humanAuthMechanism.verifyHumanAct(...)` | `verifier.verifyHumanAct(act, expected)` et `verifier.certifyHumanAuthenticated({registry, artifactId, acts})` |
| `verifier.historicalInputAuthority()` | `verifier.authorizeHistoricalInput(request, contexteAttendu)` |
| `mintCapabilityGrant({derivationRef: "…"})` | la dérivation est **vérifiée auprès du registre de décisions de l'émetteur** : `CAPABILITY_DERIVATION_UNVERIFIABLE`, `CAPABILITY_ISSUER_HAS_NO_LEDGER`. La concession porte désormais `decisionKind` et `decisionHash` |
| identité comparée **à celle du vérificateur** | comparée au **contexte attendu** (registre authentifié, manifeste) : `PROVENANCE_VERIFIER_CONTEXT_MISMATCH`. Un contexte attendu incomplet **refuse** |
| `LC.runActiveProbe(config, {verifier})` | la frontière de capacité est injectée par `verifier.runLlmProbe`. Un appel direct rend `UNAVAILABLE`, `probeDerivationRef: null` |
| `assertCapabilityUsable` : bloc de production conditionné à `RM.isProductionContext(ctx)` | ce que la capacité **prétend** est lu sur l'artefact et le registre ; un contexte insuffisant est un **refus**, pas une dispense |
| `PRODUCTION_LLM_CAPABILITY` sur `derivationRef` libre | exige `probeDerivationRef` inscrite par une sonde **réellement exécutée** |
| `resolveLineage({historicalInputAuthority})` | l'autorité passée en argument est **ignorée et signalée** ; l'autorisation se demande au vérificateur, contexte attendu dérivé du manifeste ou du registre |
| `deriveIdentityConfidence({minIndependentForStrong, strongThreshold})` lus tels quels | **planchers du lot** : `2` et `1.0`. Un appelant peut durcir, jamais abaisser. Le résultat porte `policyNarrowedOnly` |
| `assessCandidates` : `AC.hasCapability` seul | `AC.capabilityVerifiedBy(entry, cap, verifier, attentes)` — la dérivation est vérifiée. Sans vérificateur : **zéro** référence admise, toutes consignées |
| `assertReadinessPhase({verifier})` : comparaison d'un seul champ, et seulement si présent | identité **composite** ; un vérificateur présent mais non marqué **fait échouer** le contrôle (`READINESS_VERIFIER_FORGED`) ; registre de TEST refusé pour un run de PRODUCTION (`READINESS_REGISTRY_MODE_INSUFFICIENT`) ; `readiness.executionMode` divergent refusé (`READINESS_EXECUTION_MODE_MISDECLARED`) |
| plafond de statut calculé avec `readiness.executionMode` | calculé avec le mode **authentifié** du registre |
| `UEB.createUpstreamEvidenceBinder({provenanceAuthority})` | `{verifier}` ; l'autorité passée en argument est consignée comme ignorée |

## 4. Ce qu'un appelant doit faire en plus

1. obtenir son vérificateur par `OTB.verifierFor(boundary)` ;
2. remplacer chaque récupération d'émetteur par la **demande d'opération**
   correspondante (`certifyProvenance`, `certifyLlmCapability`,
   `certifyHumanAuthenticated`, `authorizeHistoricalInput`) ;
3. passer le **contexte attendu** — celui du registre authentifié ou du
   manifeste — et non l'identité du vérificateur lui-même ;
4. passer `verifier` à `assessCandidates` : sans lui, aucune provenance n'est
   vérifiable et **aucune** référence n'entre au corpus ;
5. exécuter la sonde LLM par `verifier.runLlmProbe`, jamais par
   `LC.runActiveProbe` directement.

## 5. Effet de bord attendu

Un appelant qui mintait lui-même ses concessions voit
`CAPABILITY_DERIVATION_UNVERIFIABLE`. Un appelant qui omettait le vérificateur
voit un corpus vide au lieu d'un corpus admis par défaut. Ce sont les
correctifs : la frappe libre et le contrôle conditionné à sa propre entrée
étaient les deux brèches.

## 6. Ce qui n'a pas changé

La racine unique d'autorité, les capacités typées, le pont traducteur, la liste
blanche de politique, la garde documentation/code, l'asymétrie prudente de la
préparation (*l'appelant peut la dégrader, jamais l'améliorer*), la décision
`NEW_TRUST_GENERATION` de l'ancrage anti-rejeu.
