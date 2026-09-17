# MONO-10 v0.7 — liaison des preuves amont

## 1. Pourquoi ce pont existe

Les lots amont expriment leurs preuves par des **chaînes d'identifiants**
(identifiant de travail, identifiant d'auteur). MONO-10 exige que toute preuve
présentée à un humain **résolve** contre le registre d'artefacts authentifié du
run. Les deux contrats ne se rejoignent pas d'eux-mêmes : une chaîne n'est pas
une référence de lignée.

## 2. Ce que le pont faisait de trop en v0.6

L'audit indépendant a montré deux dépassements :

- **il affirmait** `subjectBinding: "CONFIRMED"` et
  `verificationStatus: "VERIFIED"` sur un identifiant que l'amont n'avait jamais
  vérifié, avec une contribution inventée de `0.6`. Or `CONFIRMED` + `VERIFIED`
  suffit à atteindre `MODERATE`, c'est-à-dire exactement le seuil qui décide si
  un humain voit le candidat. **Le pont fabriquait la propriété qui déclenche la
  revue humaine.**
- **il résolvait une ambiguïté en silence** : deux sources de contenu différent
  portant le même identifiant amont, et seule la dernière survivait, sans
  aucune mention dans `unidentified`.

## 3. Le principe v0.7 : traducteur, pas autorité (§18)

```
OUTPUT_TRUST_LEVEL  <=  INPUT_TRUST_LEVEL
```

Le pont peut résoudre un identifiant, retrouver un artefact, produire une
référence structurée et **conserver** les propriétés amont. Il ne peut pas
augmenter la force épistémique.

<!-- contract:upstreamAssertionStates -->

| État d'assertion amont | Quand |
|---|---|
| `CONFIRMED` | le lot amont a produit une vérification explicite |
| `ASSERTED` | le lot amont a constaté sans vérifier |
| `AMBIGUOUS` | le lot amont signale une ambiguïté d'identité |
| `UNKNOWN` | aucune preuve amont correspondante — état par défaut |

<!-- /contract -->

La correspondance avec les valeurs du lot amont (`verificationStatus` de la
ProfessionalVerification) est faite dans le code, jamais dupliquée ici : ce
tableau décrit le contrat de MONO-10, et un test le compare à la source
canonique.

Sans preuve amont correspondante, l'assertion vaut `UNKNOWN` et la contribution
vaut **0** : l'identifiant ne franchit aucun seuil à lui seul (§19, §20, §21).

## 4. L'ambiguïté échoue fermée (§22 à §25)

`refByProviderWorkId` n'est plus une carte du dernier arrivé. Le pont conserve
**toutes** les occurrences (`candidatesByIdentifier`, §23) puis décide :

| Cas | Résultat |
|---|---|
| même identifiant, **même** empreinte de contenu | déduplication licite, consignée dans `deduplicated[]` — l'égalité canonique est prouvée |
| même identifiant, **contenus distincts** | `ambiguous[]` ; **aucune référence n'est produite** |
| pas d'identifiant fort | `unidentified[]` ; jamais comblé |

Un candidat dont une référence est ambiguë reçoit
`identityAmbiguity: "UPSTREAM_IDENTIFIER_AMBIGUOUS"` : l'ambiguïté **se
propage** vers l'évaluation, où `AMBIGUOUS` reste `AMBIGUOUS`.

## 5. Les racines ne sont plus des paramètres (§32)

`collectionAuthorityId`, `collectionFamilyId`, `resolverAuthorityId` et
`resolverFamilyId` ont disparu de l'interface. Le pont enregistre la preuve
observée avec sa seule `sourceRootId` — qui est une **demande** — puis sollicite
`EvidenceProvenanceAuthority`. Si l'autorité authentifie, le pont demande
l'émission de `AUTHENTICATED_PROVENANCE` ; sinon l'artefact reste `RUN_BOUND` et
ne sera pas présentable à un humain.

## 6. Ce que le pont ne prétend pas

Il ne prétend pas que l'identifiant amont désigne la bonne personne. Il ne
prétend pas que la source est authentique. Il constate ce que l'amont a dit, le
rend résolvable, et laisse l'autorité de provenance et l'humain décider.
