# MONO-10 v0.11 — modèle de menace

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
- Compromission du secret d'attestation d'acte, du système d'exploitation, du
  binaire Node ou de `require`.
- Vérité du contenu du verdict : EvidenceForge qualifie un **processus**.

## 2bis. L'attaque nommée : `CALLER_USES_REAL_AUTHORITY_CONSTRUCTOR` (§31)

Trois choses différentes, à ne jamais confondre :

| Situation | Statut |
|---|---|
| **objet fabriqué** — forme compatible, `Object.create`, `Proxy`, JSON, copie | refusé depuis v0.6 (marque d'origine) |
| **vrai constructeur** — l'appelant importe le module réel, l'appelle avec un fichier qu'il possède, et reçoit un objet authentiquement marqué | **c'était ouvert en v0.7** ; fermé en v0.8 |
| **autorité provisionnée par l'exploitant** — descend de la poignée d'émission de la frontière | seule acceptée |

La deuxième ligne est la leçon du lot : une marque d'origine authentifie le
**module**, pas la **frontière**. Le correctif n'est pas une marque de plus,
c'est une racine unique d'émission.

## 2ter. La classe fermée en v0.9 : la preuve portée mais non vérifiée

> Une preuve portée dans un artefact n'a d'effet que si son **consommateur** la
> vérifie. Et aucune API publique de validation critique ne doit être plus
> permissive que son consumer aval.

| Attaque | Issue |
|---|---|
| deux configurations distinctes déclarant le même `operatorTrustBoundaryId` | `AUTHORITY_CONFIG_BINDING_MISMATCH` (R1) |
| identité de frontière attendue réduite à un identifiant | `AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE` |
| émission de capacité sans nommer la liaison de configuration | `CAPABILITY_CONFIG_BINDING_UNNAMED` |
| manifeste ouvert sous une autre configuration au même identifiant | `OPERATOR_TRUST_CONFIG_BINDING_MISMATCH` |
| rejeu via un symlink ou un alias relatif du fichier de configuration | même ancre, même réserve : nonce refusé (R2) |
| ancre de configuration non résolvable | `TRUST_CONFIG_ANCHOR_UNRESOLVABLE` — fail closed |
| `opts.verifier` fabriqué portant `provenanceAuthority()` | ignoré et consigné ; provenance `UNRESOLVED` (R3). En v0.10 ce getter n'existe plus sur le vrai vérificateur |
| récupérer l'émetteur réel par un getter de la frontière ou du vérificateur | **plus aucun getter d'émetteur** ; `ACCESSIBLE_ISSUER_COUNT = 0`, mesuré par balayage réel de la surface (T03) (B1) |
| minter une capacité avec une `derivationRef` inventée | `CAPABILITY_DERIVATION_UNVERIFIABLE` : la décision est cherchée dans le registre de l'émetteur (B1) |
| réutiliser une dérivation réelle pour un autre artefact, run ou mission | refusée par comparaison du sujet de la décision (B1) |
| construire son propre émetteur de TEST et minter | `CAPABILITY_ISSUER_INVALID` : l'émetteur doit être émis par la frontière du run (v0.8, toujours vrai) |
| présenter un vérificateur de **TEST réel** sur un run de PRODUCTION | `PROVENANCE_VERIFIER_CONTEXT_MISMATCH` ; aucune capacité concédée (B2) |
| amputer le contexte attendu de sa liaison de configuration | refus, jamais saut du contrôle (B2) |
| exécuter `LC.runActiveProbe` soi-même pour fabriquer une capacité LLM | `UNAVAILABLE`, `probeDerivationRef: null` : la frontière de capacité n'est injectée que par `verifier.runLlmProbe` |
| enregistrer un artefact de capacité LLM avec une référence de sonde inventée | ni certifié, ni utilisable (N3) |
| sonder un triplet **autorisé**, puis ré-étiqueter le fournisseur | `LLM_SUBJECT_MISMATCH` ; ni certifié, ni utilisable (T01) |
| idem pour le modèle | `LLM_SUBJECT_MISMATCH` (T02) |
| idem pour le worker | `LLM_SUBJECT_MISMATCH` (T03) |
| ré-étiqueter vers un triplet **hors liste blanche** | `LLM_SUBJECT_OUT_OF_ALLOWLIST` ; la liste blanche est ré-appliquée à la certification (T10) |
| faire certifier **deux** artefacts avec une seule sonde | `LLM_PROBE_ALREADY_CONSUMED` (T04, T05) |
| emprunter le `requestId` d'une autre sonde | refusé par comparaison du sujet (T06) |
| présenter une décision de sonde d'un autre run ou d'une autre mission | non vérifiable (T07, T08) |
| omettre `artifactHash` des attentes pour éviter la comparaison | une attente absente est un **refus** (T34) |
| appeler `assertCapabilityUsable` sans contexte, sans vérificateur ou sans registre | inutilisable dans les quatre cas (T15–T19) |
| omettre `opts.verifier` pour faire sauter le contrôle de préparation | `READINESS_VERIFIER_REQUIRED` (T23) |
| retirer `ctx.verifier` pour faire sauter les contrôles de production | refus explicite : un contrôle non menable est un refus (§12) |
| abaisser `minIndependentForStrong` / `strongThreshold` à zéro | planchers du lot conservés ; `policyNarrowedOnly: false` consigné |
| appeler `assessCandidates` sans vérificateur pour garder le bénéfice de `hasCapability` | **zéro** référence admise, toutes consignées avec leur motif |
| présenter un vérificateur de forme compatible à la validation de préparation | `READINESS_VERIFIER_FORGED` — le contrôle échoue au lieu d'être sauté |
| re-étiqueter en PRODUCTION une préparation de TEST | `READINESS_EXECUTION_MODE_MISDECLARED` / `READINESS_REGISTRY_MODE_INSUFFICIENT` |
| renommer la configuration de confiance pour retrouver une réserve anti-rejeu neuve | nouvelle génération **détectée** : `REPLAY_NAMESPACE_CONFLICT` dans le processus, et `boundaryDescriptorHash` change |
| `policy.identity.verifier` injecté dans l'évaluation | clé refusée, consignée dans `policyKeysRefused` |
| `minMissionEvidenceRefs` / `minIdentityConfidence` abaissés | refusés : la politique peut restreindre, jamais élargir |
| `assertCapabilityUsable` sur un artefact non enregistré | `usable = false` (R4) |
| `assertCapabilityUsable` hors registre authentifié | `usable = false` |
| champs de surface `namespace`, `provisionedFrom`, `transportOrigin` mensongers | sans effet : le descripteur authentifié prime |
| `assertReadinessPhase` avec un registre de forme compatible | `READINESS_REGISTRY_INVALID` (R5) |
| registre d'un autre run / d'une autre mission / d'une autre frontière | refusé |
| `createAcceptanceBoundary` appelé directement | export retiré ; émission par la frontière seulement |
| helper de réinitialisation anti-rejeu | plus exporté |
| nom de la variable de confiance choisi par l'appelant | `TRUST_ENV_VAR_REFUSED` |

## 3. La classe fermée en v0.8

| Attaque | Issue |
|---|---|
| `createOperator*Authority({registryPath})` appelé par l'appelant | **ces exports n'existent plus** |
| `createFromBoundary` avec une poignée fabriquée | `AUTHORITY_ISSUER_NOT_BOUNDARY` |
| chemin de registre fourni par l'appelant | ignoré : les chemins viennent de la configuration chargée |
| `provisionedFrom: "ENVIRONMENT"` revendiqué | dérivé du contexte ; une fabrique TEST rend `IN_PROCESS_TEST` |
| autorité de TEST présentée pour une capacité de production | `CAPABILITY_ISSUER_INVALID` / `CAPABILITY_ISSUER_NAMESPACE` |
| autorité ou capacité d'une autre frontière | `AUTHORITY_CROSS_BOUNDARY`, `CAPABILITY_GRANT_CROSS_BOUNDARY`, `ARTIFACT_CAPABILITY_CROSS_BOUNDARY` |
| copie alternative du module d'autorité | *fail closed* : sa marque ne reconnaît rien |
| autorité historique construite ailleurs | `resolveLineage` exige la frontière du run de destination |
| seconde réserve anti-rejeu pour la même autorité/clé | `REPLAY_LOCATION_REFUSED` : l'emplacement n'est plus configurable |
| préparation validée sans registre ou sans liaisons | `READINESS_REGISTRY_REQUIRED`, `READINESS_BINDINGS_REQUIRED` |
| statuts de préparation retournés à la main | `READINESS_STATUS_OVERSTATED` |

## 4. La classe fermée en v0.7

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

## 5. Attaques v0.6 toujours fermées

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

## 6. Ce que le lot ne prétend pas

- Il ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
- Il prouve en revanche que la capacité certifiée **ne nomme que le sujet
  réellement sondé** : fournisseur, modèle, worker, artefact, empreinte, run,
  mission.
- Il ne prouve pas qu'un humain a décidé : il prouve qu'une preuve d'acte liée à
  cet acte précis a été émise par le mécanisme de l'exploitant.
- Il ne prouve pas qu'une étape aval a réussi : `AUTHORIZED` est une permission.
- La garde de contrats couvre des **énumérations**, pas la prose. Une phrase de
  documentation qui surestime une propriété n'est détectable que par relecture
  ou par un audit indépendant (`CONTRACT-GUARD.md` §6).
- Le plafond de statut de préparation est une **borne supérieure** tirée des
  artefacts enregistrés, pas une réévaluation complète (`READINESS.md` §4).
- Deux fichiers de configuration de confiance distincts sont **deux racines de
  confiance** distinctes, pas deux réserves d'une même racine
  (`REPLAY-PROTECTION.md` §7).
- Succès technique ≠ succès scientifique.
