# MONO-10 v0.5 — Lignée

## 1. Principe

> **Chaque conclusion doit conserver un lineage résolu.** (Charte §16)

v0.3 résolvait des **nœuds**. v0.4 a introduit le **graphe typé**. v0.5 ajoute
les deux pièces qui manquaient : le registre lui-même doit être **rattaché au
run authentifié** (§29), et l'absence d'une métadonnée nécessaire vaut
**INVALIDE**, jamais « non vérifiable donc accepté » (§33).

## 2. Le graphe canonique (§13)

```
mission
  ├──→ documentary-evidence
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

## 3. Le registre doit être authentifié (§29)

Un registre fourni librement par l'appelant permettrait de présenter tout un
univers artificiel comme « la réalité ». `createAuthenticatedArtifactRegistry`
part d'un **manifeste de run** et **vérifie** que chaque entrée y est liée. Un
objet de même forme fabriqué par l'appelant est refusé (`ARTIFACT_REGISTRY_FORGED`),
et un registre d'un autre run l'est aussi (`ARTIFACT_REGISTRY_RUN_MISMATCH`).

## 4. Sept contrôles par référence (§30)

1. **existence** dans le registre ;
2. **empreinte** identique à l'artefact enregistré ;
3. **type** de schéma attendu ;
4. **relation** effectivement occupée ;
5. **mission** identique à la mission attendue ;
6. **runId** identique — l'inter-run est **interdit par défaut** ;
7. **attestation** identique à celle du run.

Plus : si un run ou une mission est attendu et que l'artefact n'en porte pas,
la référence **échoue** (§33) — l'impossibilité de vérifier n'est jamais une
autorisation.

Plus, au niveau de l'ensemble : **couverture des arêtes parentes attendues**.

### Entrées historiques immuables

`crossRunAllowedRelations` autorise explicitement certaines relations comme
entrées historiques d'un autre run. C'est un **contrat explicite**, jamais un
défaut (`T14b`).

## 5. Liaison au run

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

## 6. Les preuves vues par l'humain sont de la lignée (§19)

C'est la fermeture du bloqueur B04 de v0.4. `missionEvidenceRefs` et
`decision.evidenceRefs` ne sont plus des chaînes opaques : ce sont des
références de lignée vers des artefacts `documentary-evidence`, résolues avec
les sept contrôles ci-dessus. Une référence inventée est rejetée ; une preuve
d'un autre run ou d'une autre mission aussi.

## 7. Les inconnus ont aussi une lignée

Un `Unknown` porte sa chaîne d'événements : `genesisHash`, séquence monotone,
`previousEventHash`, `transitionId` = empreinte de l'événement complet, `runId`.
Et surtout (§14) : **les `evidenceRefs` d'une transition doivent résoudre**
contre le registre, avec les mêmes sept contrôles. Une chaîne inviolable autour
d'une preuve inexistante n'était pas une preuve.

`assertNoSilentLoss` est appelé à chaque propagation : aucun inconnu ouvert ne
disparaît.
