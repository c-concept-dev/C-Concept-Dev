# MONO-10 v0.7 — authentification des actes humains

## 1. Le défaut fermé (B05)

En v0.5, le mécanisme d'acte humain de production vérifiait que
`actorIdentity` figurait dans le registre d'acteurs provisionné par
l'exploitant. **Le nom suffisait.** Quiconque connaissait le nom d'un auditeur
pouvait signer n'importe quelle décision à sa place.

Une propriété déclarée n'est jamais à elle seule une preuve.

## 2. `HumanActProof`

```
HumanActProof {
  actorId, actionType, decisionHash,
  runId, missionHash, issuedAt,
  mechanismRef, proofValue
}
```

`proofValue` est un HMAC-SHA256 sur l'empreinte canonique de la charge utile,
calculé avec un secret **détenu par l'exploitant** et inscrit dans son registre
d'acteurs. Le lot ne stocke aucun secret : il est émis par
`tools/operator-provisioning.js`, qui est un outil d'exploitation, pas un module
du noyau.

## 3. L'acte précis, pas l'acteur

`computeDecisionHash` lie la preuve à l'**acte**, pas à la personne :

```js
computeDecisionHash({ actionType, runId, missionHash,
                      subjectId, decision,
                      boundArtifactHash, evidenceRefsHash })
```

Conséquence : une preuve valide pour la décision `APPROVE` sur le candidat `c-1`
du run R ne vaut ni pour `DEFER`, ni pour `c-2`, ni pour un autre run, ni pour
une autre mission. `assertProofBoundTo` vérifie simultanément `actorId`,
`actionType`, `decisionHash`, `runId` et `missionHash`.

## 4. Deux types d'acte, jamais interchangeables

```
ACTION_TYPE = { PANEL_DECISION, REPORT_ACCEPTANCE }
```

Une preuve de décision de panel ne peut pas autoriser l'acceptation d'un
rapport.

## 5. TEST et PRODUCTION

| Mécanisme | Namespace | `requiresActProof` |
|---|---|---|
| `OPERATOR_ACT_PROOF` | PRODUCTION | oui |
| `TEST_FIXTURE` | TEST | non |

Un acte portant `authenticationMode: TEST_FIXTURE` présenté à un mécanisme de
production est refusé explicitement : « acte de fixture présenté à un mécanisme
de production ». Il n'y a pas de chemin par lequel une fixture devient un acte.

## 6. Ce que le mécanisme refuse, vérifié par tests

| Attaque | Motif du refus |
|---|---|
| nom d'acteur existant, sans preuve | preuve d'acte absente |
| appartenance au registre, `humanActProof: null` | preuve d'acte requise |
| `proofValue` aléatoire | le mécanisme de l'exploitant ne la reconnaît pas |
| preuve liée à un autre `decisionHash` | liaison rompue |
| preuve d'un autre run | liaison rompue |
| preuve d'une autre mission | liaison rompue |
| preuve émise par un autre mécanisme | `mechanismRef` divergent |
| acteur révoqué dans le registre | statut ≠ `ACTIVE` |
| aucun matériau d'attestation provisionné | *fail closed* |

## 7. Aucune décision humaine n'est simulée

Le lot ne produit aucun acte humain. `REAL_HUMAN_ACTS = 0`. Les preuves d'acte
utilisées dans les tests sont émises par l'outil d'exploitation de la fixture,
avec un secret de fixture, dans un répertoire temporaire — et la fixture de
TEST n'en produit aucune.
