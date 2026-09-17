# MONO-10 v0.4 — Lignée

## 1. Principe

> **Chaque conclusion doit conserver un lineage résolu.** (Charte §16)

v0.3 résolvait des **nœuds** — existence, empreinte, type. Trois trous relevés à
l'audit : un artefact d'un autre run résolvait, aucune arête n'était typée, et
la mission n'était pas confrontée. v0.4 résout un **graphe**.

## 2. Le graphe canonique (§13)

```
mission
  ├──→ discovery ──→ verification
  │         └────┬────────┘
  │              ↓
  │          assessment ──→ panel-decision ──→ effective-eligibility ──→ corpus
  │              │                │                                        │
  │              └────┬───────────┘                                        ↓
  │                   ↓                                                  twins
  │            readiness-pre                                               ↓
  │                   │                                                 reviews
  └──→ capability     │                                                    ↓
                      │                                              aggregation
                      │                                                    │
                      │        ┌───────────────────────────────────────────┘
                      │        ↓
                      │   readiness-full
                      └────┬───┘
                           ↓
                     qualification ──→ report ──→ acceptance
                           └──────────────┬──────────┘
                                          ↓
                              downstream-authorization
```

`EXPECTED_PARENTS` déclare, pour chaque relation, ses parents **obligatoires**.
Une référence vers un artefact réel occupant une **autre** relation ne satisfait
pas la lignée (`T15`).

## 3. Sept contrôles par référence (§12)

1. **existence** dans le registre ;
2. **empreinte** identique à l'artefact enregistré ;
3. **type** de schéma attendu ;
4. **relation** effectivement occupée ;
5. **mission** identique à la mission attendue ;
6. **runId** identique — l'inter-run est **interdit par défaut** ;
7. **attestation** identique à celle du run.

Plus, au niveau de l'ensemble : **couverture des arêtes parentes attendues**.

### Entrées historiques immuables

`crossRunAllowedRelations` autorise explicitement certaines relations comme
entrées historiques d'un autre run. C'est un **contrat explicite**, jamais un
défaut (`T14b`).

## 4. Liaison au run

```
runBinding {
  runId, executionMode, authorityId,
  attestationId, attestationHash, missionHash, manifestBindingHash,
  artifactId, artifactHash, crossHash
}
crossHash = sha256(manifestBindingHash, runId, attestationHash, artifactId, artifactHash)
```

L'empreinte d'artefact exclut toujours l'enveloppe de liaison : sans cela, lier
un artefact casserait toutes les références déjà émises.

## 5. Les inconnus ont aussi une lignée

Un `Unknown` porte sa chaîne d'événements : `genesisHash`, séquence monotone,
`previousEventHash`, `transitionId` = empreinte de l'événement complet, `runId`.
Et surtout (§14) : **les `evidenceRefs` d'une transition doivent résoudre**
contre le registre, avec les mêmes sept contrôles. Une chaîne inviolable autour
d'une preuve inexistante n'était pas une preuve.

`assertNoSilentLoss` est appelé à chaque propagation : aucun inconnu ouvert ne
disparaît.
