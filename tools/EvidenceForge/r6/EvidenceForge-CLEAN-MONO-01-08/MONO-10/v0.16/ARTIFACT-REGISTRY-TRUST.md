# MONO-10 v0.16 (contenu de v0.12, corrigé en v0.14) — confiance du registre d'artefacts

## 1. Ce que v0.6 avait livré, et ce que l'audit a montré

v0.6 livrait une **échelle ordinale** :

```
REGISTERED < BOUND_TO_RUN < AUTHENTICATED_PROVENANCE
          < HUMAN_AUTHENTICATED < PRODUCTION_CAPABILITY_PROVED
```

L'audit indépendant a relevé deux défauts, et ils étaient liés :

1. `elevate(artifactId, niveau, justificationHash)` acceptait **n'importe quelle
   chaîne** comme justification. Un artefact documentaire synthétique atteignait
   le niveau le plus élevé avec `sha256({motif: "je le décrète"})`.
2. **Aucun consommateur critique ne lisait le niveau.** `assertAtLeast`
   n'apparaissait que dans son propre module et dans la surface de validation.
   L'échelle était décorative, et la documentation la présentait comme un
   contrôle.

## 2. Décision v0.7 : capacités typées (§31)

Ces propriétés sont **orthogonales**, pas ordonnées. Une preuve documentaire
authentifiée n'est pas « inférieure » à un acte humain : ce sont deux choses
différentes. L'échelle est donc supprimée — `core/artifact-trust-levels.js`
n'existe plus — et remplacée par des capacités typées.

<!-- contract:artifactCapabilities -->

| Capacité | Ce qu'elle établit | Émise par |
|---|---|---|
| `RUN_BOUND` | l'artefact est lié à ce run par empreinte croisée | l'enregistrement lui-même |
| `AUTHENTICATED_PROVENANCE` | les racines de provenance sont authentifiées | `EvidenceProvenanceAuthority` |
| `HUMAN_AUTHENTICATED` | les actes humains portés sont authentifiés | mécanisme d'acte de l'exploitant |
| `PRODUCTION_LLM_CAPABILITY` | une capacité LLM de production est prouvée | frontière de capacité LLM |

<!-- /contract -->

## 3. Une capacité ne s'octroie pas, elle s'émet (§27)

```js
registry.grantCapability(artifactId, grant)
```

`grant` doit être produit par `mintCapabilityGrant`, qui exige :

- un **émetteur réellement provisionné** — la fonction `isProvisioned*` du
  module compétent, marque d'origine `WeakSet` : un objet de forme compatible,
  un hash ou une chaîne sont refusés (`CAPABILITY_ISSUER_INVALID`) ;
- un **schéma d'artefact éligible** (§29) : un enregistrement documentaire ne
  peut jamais porter `PRODUCTION_LLM_CAPABILITY` ;
- une **dérivation nommée** : référence de preuve résolue, empreinte d'acte,
  identifiant de sonde. `CAPABILITY_DERIVATION_MISSING` sans elle. Une
  justification libre n'est pas une dérivation ;
- une liaison exacte : `artifactId`, `artifactHash`, `artifactSchema`, `runId`,
  `missionHash` (`CAPABILITY_GRANT_MISBOUND`) ;
- pour `PRODUCTION_LLM_CAPABILITY`, un émetteur de namespace `PRODUCTION`.

Chaque octroi est un **événement du journal append-only** : il est daté,
chaîné, et porte l'empreinte de la concession.

## 4. Les sinks qui exigent réellement une capacité (§30)

Une capacité qu'aucun sink n'exige n'a pas de raison d'exister. La table
`SINK_REQUIREMENTS` **est** le contrat :

| Sink critique | Capacité exigée |
|---|---|
| `panel-gate:evidence-presented-to-human` | `AUTHENTICATED_PROVENANCE` |
| `panel-gated-adapter:corpus-sink` | `HUMAN_AUTHENTICATED` |
| `llm-capability:production-use` | `PRODUCTION_LLM_CAPABILITY` |

Conséquence directe : une preuve documentaire dont les racines n'ont pas été
authentifiées **n'est pas présentable à un humain**, et une décision de panel
non enregistrée ou sans capacité humaine **ne produit aucun corpus**.

## 5. Le registre lui-même

Ouverture conditionnée à l'authenticité du manifeste (`assertManifestAuthentic`),
journal append-only (`sequence`, `previousEventHash`, `eventHash`), contenu gelé
en profondeur, réempreinte à la lecture (`ARTIFACT_CONTENT_MUTATED`), refus de
réinscription (`REGISTRY_DUPLICATE`), racine « telle qu'à l'enregistrement »
(`rootBeforeSequence`). Ces propriétés, déjà acquises en v0.6, ont résisté à
l'audit sur les huit formes d'altération de chaîne testées et ne sont pas
modifiées.


## Fermetures v0.10 (§4, §5, §10)

### Une concession nomme la décision dont elle découle

Toute concession porte désormais, en plus de l'identité composite de la
frontière et du descripteur de son émetteur :

| Champ | Sens |
|---|---|
| `derivationRef` | la clé de la décision au registre de l'émetteur |
| `decisionKind` | le genre d'opération causale qui l'a produite |
| `decisionHash` | l'empreinte de la décision inscrite |

`mintCapabilityGrant` ne se contente pas de recevoir `derivationRef` : il
interroge l'émetteur (`verifyDecision`) et compare le **sujet** de la décision à
l'artefact, au run, à la mission et au mode présentés. Une dérivation inventée,
ou une dérivation réelle détournée vers un autre artefact, est refusée par
`CAPABILITY_DERIVATION_UNVERIFIABLE`.

### `hasCapability` constate, il ne vérifie pas

`AC.hasCapability(entry, cap)` reste une lecture de présence. Les consommateurs
critiques utilisent `AC.capabilityVerifiedBy(entry, cap, verifier, attentes)`,
qui **refuse par défaut** :

- capacité absente, ou listée sans concession tracée ⇒ `false` ;
- pas de vérificateur ⇒ `false`, avec le motif ;
- dérivation non vérifiable auprès de l'émetteur ⇒ `false`.

Conformément à la règle de v0.7 — *une API publique de validation ne doit jamais
être plus permissive que ses consommateurs critiques* — le test T33 présente la
même entrée aux deux et exige le même verdict.

### Conséquence sur le corpus présenté à l'humain

`assessCandidates` n'admet une référence documentaire que si sa capacité
`AUTHENTICATED_PROVENANCE` est **vérifiée** par le vérificateur du run. Sans
vérificateur, ou avec un vérificateur d'un autre contexte, **zéro** référence
est admise et toutes sont consignées dans `unauthenticatedEvidenceRefs` avec
leur motif. Un registre absent ne vaut plus laissez-passer.


## Fermeture v0.11 — la concession nomme le sujet qu'elle certifie

Une concession `PRODUCTION_LLM_CAPABILITY` porte désormais, en plus de
`derivationRef`, `decisionKind` et `decisionHash` :

| Champ | Sens |
|---|---|
| `certifiedSubject` | le triplet `providerId` / `modelId` / `workerBindingId` **réellement sondé** |
| `decisionSubjectHash` | l'empreinte canonique du sujet décidé, artefact et empreinte inclus |

**Une décision réelle ne suffit pas si elle ne lie pas le sujet exact qui est
certifié.** `mintCapabilityGrant` transmet le triplet aux attentes de
`verifyDecision`, qui exige les sept dimensions autoritaires ; une attente
absente est un refus, jamais une dispense.


## Ce qu'une concession atteste, et ce qu'elle n'atteste pas (v0.12)

Cette distinction manquait, et son absence a produit une surestimation.

| | |
|---|---|
| **Attesté** | le **sujet** décidé par l'émetteur (`certifiedSubject`, `decisionSubjectHash`) ; l'**artefact exact** et son empreinte (`artifactId`, `artifactHash`) ; le run, la mission, le mode d'exécution, l'identité composite de frontière |
| **Non attesté** | le **reste du contenu de l'artefact**. Douze champs informatifs sont déclarés par l'appelant et jamais recoupés (liste canonique : `LLM-CAPABILITY-BOUNDARY.md`), et le schéma n'est pas fermé à l'enregistrement |

Autrement dit : une concession dit « *j'ai certifié ces octets, pour ce
sujet* ». Elle ne dit **pas** « *tout ce que ces octets affirment est vrai* ».
Un artefact certifié n'est pas un artefact intégralement prouvé.

En particulier, le champ déclaratif `probeStatus` **ne fait pas partie du
sujet** : une capacité peut être certifiée avec un `probeStatus` incohérent avec
le résultat enregistré. Le mensonge ne franchit ni `assertCapabilityUsable`, ni
`qualifyProcess`, ni l'autorisation aval. Détail et bornes :
`OPEN-FINDINGS.md` (R1 et R3).

L'identité de l'émetteur qui **fait foi** est celle de la concession —
`issuerAuthorityId`, `issuerDescriptorHash` — jamais le champ `llmBoundaryId`
que porte l'artefact.
