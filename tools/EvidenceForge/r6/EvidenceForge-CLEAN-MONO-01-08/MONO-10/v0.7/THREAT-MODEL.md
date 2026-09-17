# MONO-10 v0.7 — modèle de menace

## 1. Adversaire considéré

Un appelant qui contrôle entièrement le code appelant : artefacts, arguments,
callbacks, `runContext`, **politiques**, **valeurs déclaratives**, et qui peut
rejouer ou dupliquer des objets. Il ne contrôle pas l'environnement du processus
ni le système de fichiers de l'exploitant.

## 2. Hors périmètre, déclaré

- **Écriture des fichiers provisionnés par l'exploitant** : configuration de
  confiance, registre d'acteurs, registre de racines de provenance, registre
  d'entrées historiques, racine de réserve anti-rejeu. Qui peut les écrire
  obtient une frontière de PRODUCTION. Voir `TRUST-MODEL.md` §7.
- **Seconde `replayRoot`** : un exploitant qui en déclare deux crée deux
  réserves physiques. Voir `REPLAY-PROTECTION.md` §7.
- Compromission du secret d'attestation d'acte, du système d'exploitation, du
  binaire Node ou de `require`.
- Vérité du contenu du verdict : EvidenceForge qualifie un **processus**.

## 3. La classe fermée en v0.7

v0.6 avait fermé les substitutions d'objets. Il restait :

> « je fournis une valeur qui dit qu'une condition est vraie, et le système la
> croit. »

| Attaque déclarative | Issue en v0.7 |
|---|---|
| `eligibilityPolicy.legacyVerificationGrantsEligibility: true` | clé hors liste blanche, retirée et consignée ; l'état lui-même supprimé |
| politique d'appelant qui élargit l'éligibilité | impossible : toute clé de la liste blanche est `narrowOnly` |
| candidat jamais présenté au panel admis au corpus | `NOT_ELIGIBLE` — décision absente ⇒ jamais éligible |
| `historicalInputContract.operatorAuthenticated: true` | ignoré et signalé ; `CALLER_AUTHORITY_ASSERTION_REFUSED` si présenté à l'autorité |
| `trusted`, `verified`, `confirmed`, `authorized` en entrée | refusés, motif `ASSERTION_D_AUTORITE` |
| `registry.elevate(hash arbitraire)` | méthode supprimée ; `grantCapability` exige une concession émise |
| concession de capacité imitée | `CAPABILITY_GRANT_FORGED` (marque d'origine `WeakSet`) |
| capacité sans dérivation nommée | `CAPABILITY_DERIVATION_MISSING` |
| capacité de production émise depuis un espace TEST | `CAPABILITY_ISSUER_NAMESPACE` |
| capacité sur un type d'artefact inapproprié | `CAPABILITY_SCHEMA_INELIGIBLE` |
| racine de source, d'autorité ou de famille écrite dans l'artefact | résolue par l'autorité ; la déclaration est consignée et sans effet |
| deux étiquettes d'autorité inventées pour créer l'indépendance | provenance non authentifiée ⇒ jamais indépendante |
| PRE relabellé FULL avec références empruntées | `READINESS_DIMENSION_EVIDENCE_UNBOUND` ; phase dérivée |
| `dimensionsHash` recalculé par l'appelant | insuffisant : la phase vient des liaisons |
| pont amont affirmant `CONFIRMED`/`VERIFIED` | assertion `UNKNOWN`, contribution `0` |
| identifiant amont ambigu | `ambiguous[]`, aucune référence produite |
| seconde frontière, réserve distincte | rejeu refusé (dérivation + marqueur + registre) |
| statut de clé absent, nul ou inconnu | `KEY_STATUS_INVALID` |
| dérive entre documentation et code | détectée par la garde de contrats |

## 4. Attaques v0.6 toujours fermées

Artefact fabriqué, manifeste cohérent non authentique, ancre injectée,
`acceptanceValidator` d'appelant, `REJECT` humain converti, acceptation vide,
éligibilité écrite sur l'objet remis au consumer, `recomputed: true` fabriqué,
artefact inséré après attestation, mutation d'artefact enregistré (y compris
imbriquée), suppression/réordonnancement/réécriture d'événement, nom d'acteur
présenté comme preuve d'acte, `HumanActProof` forgée ou rejouée,
`consumeNonce: false`, même clé TEST/PRODUCTION, clé révoquée, contenu identique
réétiqueté, dimensions `NOT_ASSESSED` sans provenance, référence de lignée
réétiquetée, rejeu sémantique d'inconnu, statut d'inconnu forcé, transport LLM
d'appelant, fournisseur hors liste blanche, rapport désapparié, qualification
`NOT_QUALIFIED`/`UNKNOWN`, inconnu bloquant, contrefaçon de marque d'origine.

## 5. Ce que le lot ne prétend pas

- Il ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
- Il ne prouve pas qu'un humain a décidé : il prouve qu'une preuve d'acte liée à
  cet acte précis a été émise par le mécanisme de l'exploitant.
- Il ne prouve pas qu'une étape aval a réussi : `AUTHORIZED` est une permission.
- La garde de contrats couvre des **énumérations**, pas la prose. Une phrase de
  documentation qui surestime une propriété n'est détectable que par relecture
  ou par un audit indépendant.
- Succès technique ≠ succès scientifique.
