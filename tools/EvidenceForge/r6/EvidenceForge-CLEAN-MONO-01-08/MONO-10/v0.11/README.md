# MONO-10 v0.11 — BIND LLM CAPABILITY TO PROBED SUBJECT

**Statut : PROPOSÉ À L'AUDIT. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Principe directeur

> **Une décision réelle ne suffit pas si elle ne lie pas le sujet exact qui est
> certifié.**
>
> Et : **omettre un vérificateur ou un contexte ne doit jamais désactiver un
> contrôle de sécurité.** L'absence d'un composant de sécurité requis est
> elle-même une erreur.

v0.10 avait fermé l'accès aux émetteurs et rendu chaque dérivation vérifiable.
L'audit A a montré que la vérifiabilité ne suffisait pas : la dérivation était
authentique, mais elle **ne couvrait pas l'affirmation portée**.

**B10-01.** La décision de sonde était inscrite **avant** que l'artefact de
capacité n'existe : son sujet ne portait aucun `artifactHash`, et
`verifyDecision` ne comparait que `requestId` et le run. Mesuré sur v0.10, avec
un exploitant n'autorisant qu'un seul triplet :

```
sonde sur un fournisseur INTERDIT        -> UNAVAILABLE   (la frontière refuse)
sonde sur le combo AUTORISÉ              -> AVAILABLE
artefact ré-étiqueté "INTERDIT", mêmes requestId et référence de sonde
  certifyLlmCapability                   -> certified = true
  assertCapabilityUsable                 -> usable = true
```

Une seule sonde certifiait **quatre** artefacts distincts. La liste blanche de
l'exploitant — la seule raison d'être de la frontière de capacité LLM — était
contournée.

**B10-02 / B10-03.** Deux API publiques de validation acceptaient encore quand
on leur retirait le champ qui déclenche le contrôle : `assertCapabilityUsable`
avec un contexte vide, `assertReadinessPhase` sans vérificateur. Le
consommateur critique `qualifyProcess` empruntait lui-même ce second chemin.

**B10-04.** Aucun test livré n'atteignait `CAPABILITY_DERIVATION_UNVERIFIABLE` :
tous s'arrêtaient à la garde d'émetteur.

## Ce que v0.11 ferme

| Constat | Fermeture |
|---|---|
| **B10-01** décision authentique réutilisée pour un autre sujet | inscription en **deux temps** : `recordProbe` conserve le sujet réellement sondé ; `certifyProbedArtifact` confronte le sujet **reconstruit depuis l'artefact**, ré-applique la liste blanche, puis décide — la décision porte `artifactId`, `artifactHash` et `decisionSubjectHash` |
| **B10-01** une sonde pour plusieurs artefacts | `LLM_PROBE_ALREADY_CONSUMED` : une sonde ne vaut que pour un artefact ; la re-certification du même artefact reste idempotente |
| **B10-01** vérification partielle du sujet | `verifyDecision` exige **sept dimensions** ; une attente absente est un refus, jamais une dispense |
| **B10-02** validation hors contexte | `assertCapabilityUsable` exige toujours vérificateur marqué, registre authentifié, mode d'exécution dérivable, identité de frontière complète, artefact enregistré et sujet de sonde vérifié |
| **B10-03** sécurité par argument optionnel | `READINESS_VERIFIER_REQUIRED` ; `verifier.namespace` comparé ; `qualifyProcess` transmet le vérificateur |
| **B10-04** tests non discriminants | T30–T37 atteignent le code exact ; la garde de dérivation est mise en cause réelle |

## Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux (T01–T37, N1, NR-P/H/I, hygiène, non-régression) | 97 PASS / 0 FAIL / 0 SKIP |
| Mutations causales | **40 attrapées / 40** |
| Intégration hors ligne (vrai consumer MONO-09 v0.2, N1–N4, P-01/02/03) | 43 PASS / 0 FAIL / 0 SKIP |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Ré-étiquetage fournisseur / modèle / worker / artefact accepté | **0 / 4** |
| Capacité hors liste blanche utilisable | **NON** |
| `ACCESSIBLE_ISSUER_COUNT` | **0** (inchangé depuis v0.10) |
| Helpers internes exposés | **1**, nommé : `operator-trust-verifier.js::__build` |
| Lots historiques inchangés | 23 / 23 |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Hypothèses déclarées, non masquées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7).
2. Deux fichiers de configuration **réellement distincts** sont deux racines de
   confiance ; deux **alias du même fichier** sont la même racine. Un
   **renommage** ouvre une **nouvelle génération** : l'anti-rejeu ne la traverse
   pas (`REPLAY-PROTECTION.md`, décision §15).
3. Le plafond de statut de préparation est une **borne supérieure** ; l'appelant
   peut dégrader une préparation, jamais l'améliorer (`READINESS.md` §4).
4. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6).
5. Le lot ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
   Il prouve que la capacité certifiée ne nomme que le sujet réellement sondé.

## Effet voulu, à connaître avant lecture des tests

- `capability.probeDerivationRef` n'existe plus ; l'artefact porte `probeRef`,
  qui ne certifie rien à elle seule ;
- une sonde par artefact de capacité ;
- `assertReadinessPhase` **exige** le vérificateur : un appelant qui l'omettait
  obtient `READINESS_VERIFIER_REQUIRED` au lieu d'une acceptation.

## Lecture

`ARCHITECTURE.md` → `TRUST-MODEL.md` → `CAPABILITY-AUTHORITIES.md` →
`LLM-CAPABILITY-BOUNDARY.md` → `READINESS.md` → `ARTIFACT-REGISTRY-TRUST.md` →
`UPSTREAM-EVIDENCE-BINDING.md` → `HISTORICAL-INPUT-AUTHORITY.md` →
`REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` → `LINEAGE.md` → `RUN-ORDER.md` →
`THREAT-MODEL.md` → `KEY-MANAGEMENT.md` → `HUMAN-ACT-AUTHENTICATION.md` →
`MIGRATION-v0.10-v0.11.md` → `AUDIT-REMEDIATION-MATRIX.md` →
`NON-REGRESSION.md` → `CONTRACT-MAPPING.md`.
