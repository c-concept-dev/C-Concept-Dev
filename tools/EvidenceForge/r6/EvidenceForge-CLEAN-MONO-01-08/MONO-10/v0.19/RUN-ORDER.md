# MONO-10 v0.7 — ordre d'exécution

## 0. Geste d'exploitation, hors du processus appelant

L'exploitant écrit sa configuration de confiance et désigne son chemin :

```
EVIDENCEFORGE_OPERATOR_TRUST_CONFIG=/chemin/trust.json
```

Le lot ne fait pas ce geste, ne le simule pas, et ne l'accepte pas en argument.

## 1. Ouverture du run

```js
const boundary = provisionProductionTrustBoundary();      // lit l'environnement
const verifier = createOperatorTrustVerifier(boundary);
const attestation = /* produite par l'autorité de l'exploitant */;
const manifest  = openRunEvidenceManifest({ verifier, attestation, runIntent, missionBinding, missionHash });
const registry  = openAuthenticatedArtifactRegistry(manifest, { manifest, verifier, attestation });
```

Le nonce de l'attestation est consommé **ici**. Rouvrir un run avec la même
attestation échoue.

## 2. Preuves documentaires, puis AUTHENTIFICATION des racines

Chaque preuve est enregistrée comme `DocumentaryEvidenceRecord` avant d'être
référencée. Une source sans identifiant fort ne reçoit aucune référence ; un
identifiant ambigu n'est jamais résolu.

Puis l'`EvidenceProvenanceAuthority` de l'exploitant est **sollicitée** : si
elle reconnaît la racine, elle émet `AUTHENTICATED_PROVENANCE`. Sinon
l'artefact reste `RUN_BOUND` et **ne sera pas présentable à un humain**.

## 3. Chaîne professionnelle

```
discoverProfessionals        [lot amont]
  → bindScreenedSources / bindResolvedIdentities / bindUpstreamDiscovery
verifyProfessionals          [lot amont]
assessCandidates             [MONO-10]
buildPanelValidationTemplate → décision humaine + HumanActProof
verifyProfessionals          [adaptateur à porte]
buildProfessionalCorpus      [adaptateur à porte → RECALCUL AU SINK → lot amont]
```

Seuls les candidats dont l'évaluation est `PRESENT` sont présentables au panel.
`DEFER` et `REJECT` ne franchissent jamais la porte.

## 4. Préparation, en deux phases

`ScientificReadiness` phase `PRE`, puis phase `FULL`. La lignée de la
préparation ne peut pas contenir de nœud de préparation : les entrées de phase
sont distinctes (`readinessLineageRefs`, `readinessArtifactRegistry`).

## 5. Capacité LLM

Sonde active via `llmCapabilityBoundary`. Sans frontière : `UNAVAILABLE`.

## 6. Qualification

`qualifyProcess` exige, pour `QUALIFIED` en PRODUCTION,
`INTERNAL_CHAIN_CONSISTENCY` **et** `AUTHENTICATED_PRODUCTION_EXECUTION`.
`QUALIFIED_WITH_RESERVATIONS` est un résultat légitime, pas un échec : sans
oracle sémantique, la pertinence reste `UNKNOWN`, et l'inconnu est conservé.

## 7. Rapport

Le rapport lie la mission, la qualification et la racine du registre **telle
qu'à son propre enregistrement**.

## 7bis. Capacités

Avant chaque sink critique, la capacité exigée est vérifiée :
`AUTHENTICATED_PROVENANCE` sur les preuves présentées à l'humain,
`HUMAN_AUTHENTICATED` sur la décision de panel consommée par le sink du corpus,
`PRODUCTION_LLM_CAPABILITY` sur la capacité LLM en production.

## 8. Acceptation

Le gabarit est construit par le lot ; la décision est humaine et accompagnée
d'une `HumanActProof` de type `REPORT_ACCEPTANCE`. La validation est faite par
`acceptanceBoundary()`, jamais par un callback de l'appelant.

## 9. Autorisation aval

`resolveDownstreamUseAuthorization` revalide **toujours** la qualification
depuis ses artefacts sources. La politique d'appelant passe par une **liste
blanche** de trois clés métier ; toute autre clé est retirée et consignée avec
son motif. Une politique peut durcir, jamais relâcher (`secureBaseline`).

## 10. Ce qui n'est pas exécuté

Aucune étape aval professionnelle n'est déclenchée. `AUTHORIZED` signifie
« une étape aval peut être envisagée », jamais « elle a eu lieu ».
