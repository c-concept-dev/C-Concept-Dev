# MONO-10 v0.10 — CLOSE CAPABILITY MINTING

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **Une capacité de sécurité n'est digne de confiance que si sa dérivation est
> vérifiable auprès de son émetteur.**
>
> L'appelant peut **demander** une opération. Il ne doit pas **recevoir**
> l'émetteur.

v0.9 avait fermé l'identité déclarative de frontière et l'ancrage physique de la
réserve anti-rejeu. L'audit A a montré que deux brèches subsistaient, et
qu'elles se combinaient :

**B1 — la frappe était libre, et l'émetteur était atteignable.**
`mintCapabilityGrant` acceptait n'importe quelle `derivationRef` ; et
`verifier.provenanceAuthority()`, `verifier.llmCapabilityBoundary()`,
`verifier.historicalInputAuthority()`, `boundary.humanAuthMechanism`
remettaient l'émetteur **réel** à l'appelant. Résultat mesuré sur v0.9 :
`AUTHENTICATED_PROVENANCE` concédée avec
`derivationRef: "je-decrete-que-cest-authentifie"`, puis
`PRESENT_FOR_HUMAN_REVIEW` avec **0 référence écartée**.

**B2 — un vérificateur ne valait que pour lui-même.** Chaque émetteur comparait
son identité à celle que l'appelant lui passait. Un vérificateur de **TEST
réel** — authentiquement marqué — présenté sur un registre de **PRODUCTION** se
comparait à lui-même. Résultat mesuré sur v0.9 : `AUTHENTICATED`, puis `STRONG`,
avec les racines de l'appelant.

v0.10 ne redessine pas l'architecture d'autorité de v0.8/v0.9. Elle ferme ces
deux brèches et propage la fermeture à tous les consommateurs.

## Ce que v0.10 ferme

| Brèche | Fermeture |
|---|---|
| **B1 — surface** : les émetteurs étaient des champs de la frontière et des getters du vérificateur | les quatre émetteurs sont détenus dans une `WeakMap` non exportée ; `verifierFor(boundary)` est la seule fabrique ; le vérificateur n'expose que des **opérations** qui rendent des résultats dérivés |
| **B1 — frappe** : `derivationRef` était une chaîne libre | chaque émetteur tient un **registre de décisions** alimenté par l'opération causale réelle ; l'émission interroge ce registre et compare le **sujet** de la décision — `CAPABILITY_DERIVATION_UNVERIFIABLE` |
| **B2 — liaison** : la comparaison se faisait contre l'identité du vérificateur | elle se fait contre le **contexte attendu** (registre authentifié, manifeste) ; un contexte incomplet est un **refus** — `PROVENANCE_VERIFIER_CONTEXT_MISMATCH` |
| §9 — seuils d'identité lus tels quels | **planchers du lot** (`2`, `1.0`) ; resserrement seulement ; `policyNarrowedOnly` consigné |
| §10 — corpus constitué sur `hasCapability` seul | `capabilityVerifiedBy` : dérivation vérifiée ; sans vérificateur, **zéro** référence admise, toutes consignées |
| §11/§12 — capacité LLM sans preuve de sonde, et bloc de production contournable | `probeDerivationRef` inscrite par la sonde réelle ; ce que la capacité **prétend** est lu sur l'artefact et le registre ; un contrôle non menable est un refus |
| §13/§14 — préparation : un seul champ comparé, et seulement s'il était présent | identité **composite** ; vérificateur non marqué ⇒ échec ; registre de TEST refusé en PRODUCTION ; mode d'exécution **authentifié**, jamais celui de l'artefact |
| §15 — génération anti-rejeu non décidée | décision explicite `NEW_TRUST_GENERATION`, documentée, et **détectée** |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux (T01–T45 + hygiène + non-régression) | 106 PASS / 0 FAIL / 0 SKIP |
| Mutations causales | **45 attrapées / 45** |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) incl. N1–N4 | 42 PASS / 0 FAIL / 0 SKIP |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| `ACCESSIBLE_ISSUER_COUNT` — émetteurs de sécurité atteignables par l'appelant | **0**, mesuré par balayage réel de la surface (T03), pas par une liste de noms |
| Helpers internes exposés | **1**, nommé : `operator-trust-verifier.js::__build` — remise interne bornée par `VERIFIER_ISSUER_FOREIGN` et par le vérificateur stérile (T06/T07) |
| Lots historiques inchangés | 22 / 22 |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Ce que je n'ai pas réussi à reproduire

Le mandat demandait de prouver la chaîne complète **si possible**. **B1-B** —
aller jusqu'à `AUTHORIZED` — ne s'est **pas** reproduit avec mon harnais :
la fixture exécute `assessCandidates` à l'intérieur de `buildChain`, avant toute
concession tardive côté appelant. B1-A est reproduit jusqu'à
`PRESENT_FOR_HUMAN_REVIEW` inclus, avec 0 référence écartée — ce qui est déjà un
effet critique. Détail en `AUDIT-REMEDIATION-MATRIX.md` §0 bis.

## Hypothèses déclarées, non masquées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7). v0.10 ne
   résout pas cette hypothèse : elle supprime la possibilité de **contourner**
   l'exploitant sans toucher à ses fichiers.
2. Deux fichiers de configuration **réellement distincts** sont deux racines de
   confiance ; deux **alias du même fichier** sont la même racine. Un
   **renommage** ouvre une **nouvelle génération** : l'anti-rejeu ne traverse
   pas un changement de génération, et le lot ne prétend pas le contraire
   (`REPLAY-PROTECTION.md`, décision §15).
3. Le plafond de statut de préparation est une **borne supérieure** tirée des
   artefacts enregistrés, pas une réévaluation complète (`READINESS.md` §4).
   L'appelant peut dégrader une préparation, jamais l'améliorer.
4. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6).

## Effet voulu, à connaître avant lecture des tests

Deux conséquences visibles, toutes deux intentionnelles :

- une preuve dont les racines ne sont pas enregistrées par l'exploitant
  n'atteint pas `PRESENT_FOR_HUMAN_REVIEW`. Dans l'intégration livrée,
  **2 candidats sur 3** sont présentés au panel ;
- `assessCandidates` **exige** désormais le vérificateur du run. Un appelant qui
  l'omettait obtenait un corpus admis par défaut ; il obtient maintenant un
  corpus **vide**, avec chaque référence consignée et motivée.

## Lecture

`ARCHITECTURE.md` → `TRUST-MODEL.md` → `CAPABILITY-AUTHORITIES.md` →
`READINESS.md` → `ARTIFACT-REGISTRY-TRUST.md` →
`UPSTREAM-EVIDENCE-BINDING.md` → `HISTORICAL-INPUT-AUTHORITY.md` →
`REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` → `LINEAGE.md` → `RUN-ORDER.md` →
`THREAT-MODEL.md` → `KEY-MANAGEMENT.md` → `HUMAN-ACT-AUTHENTICATION.md` →
`LLM-CAPABILITY-BOUNDARY.md` → `MIGRATION-v0.9-v0.10.md` →
`AUDIT-REMEDIATION-MATRIX.md` → `NON-REGRESSION.md` → `CONTRACT-MAPPING.md`.
