# MONO-10 v0.12 — constats ouverts

Ce document existe pour une raison simple : **un lot candidat au gel ne doit pas
porter comme vérité une mesure, une promesse ou un invariant déjà connus comme
faux.** Les quatre réserves ci-dessous sont réelles, mesurées, et **non
résolues par v0.12**. v0.12 est un successeur strictement documentaire : il ne
change aucun comportement, il cesse de mentir sur celui qu'il a.

> `unknown remains unknown` — et son corollaire, qui manquait :
> **`known false must not remain stated as true`.**

Aucune de ces réserves n'est présentée comme fermée. Aucune n'a produit
d'effet critique dans les mesures dont je dispose. Aucune n'est un blocage de
sécurité. Toutes restent ouvertes pour un successeur ultérieur.

---

## R1 — le résultat de sonde déclaré n'est pas confronté à la certification

**Fait.** Le sujet vérifié par `verifyDecision` compte six champs :
`providerId`, `modelId`, `workerBindingId`, `requestId`, `runId`,
`missionHash` — plus `artifactId`, `artifactHash` et `executionMode`. Le champ
déclaratif `probeStatus` de l'artefact **n'en fait pas partie**.

Conséquence mesurée : un artefact déclarant `TIMEOUT`, `DEGRADED` ou
`UNAVAILABLE` par-dessus une sonde réellement `AVAILABLE` **obtient** la
concession `PRODUCTION_LLM_CAPABILITY`.

**Ce qui borne la réserve.** Le mensonge va dans le sens de la dégradation, et
il est rattrapé en aval : `assertCapabilityUsable` refuse
(`status=... (AVAILABLE requis)`), la préparation retombe, `qualifyProcess`
refuse, l'autorisation aval refuse.

**Dans le sens de l'escalade, la fermeture est réelle et ne dépend pas de ce
constat** : `recordProbe` n'est appelé que sur le chemin `AVAILABLE`. Aucune
`probeRef` ne peut donc exister pour un sujet qui n'a jamais répondu. Sonde en
HTTP 500, sonde expirée, réponse hors schéma, sonde sans attestation
d'identifiants, `probeRef` fabriquée : tous refusés.

**Statut** : OUVERT. Défense en profondeur manquante, pas brèche.
**N'atteint pas** `QUALIFIED`. **N'atteint pas** `AUTHORIZED`.

---

## R2 — l'assertion de préparation est plus permissive que son consommateur critique

**Fait.** `DIMENSION_STATUS_CEILING.llmCapability`
(`core/scientific-readiness.js`) ne teste que `status === "AVAILABLE"` et la
présence d'une concession tracée. Il **n'appelle pas**
`assertCapabilityUsable`.

Conséquence mesurée : une préparation forgée — statut remonté à `SATISFIED`,
`dimensionsHash` **et** `dimensionBindingsHash` recalculés — est **acceptée par
`assertReadinessPhase`** dans au moins trois variantes où la capacité LLM est
inutilisable : `probeAttestationHash` faux, `transportOrigin: "CALLER"`,
`probeExecutionMode: "TEST"`.

**Ce que cela réfute.** La phrase « *l'appelant peut dégrader une préparation,
il ne peut pas l'améliorer* » est **fausse si on la lit comme décrivant
`assertReadinessPhase` isolément**. Elle n'était pas assortie de la couche à
laquelle elle s'applique. `READINESS.md` la formule désormais par couche.

**Ce qui borne la réserve.** `qualifyProcess` recalcule la préparation depuis
les sources : `llm_capability_validated`, `readiness_pre`, `readiness_full` et
`readiness_recomputed_matches_presented` tombent tous. L'autorisation aval
recalcule à son tour.

**Statut** : OUVERT. C'est l'anti-motif que le lot s'interdit lui-même — *une
API publique de validation ne doit pas être plus permissive que son consommateur
aval*. Il subsiste ici, à une couche qui n'autorise rien.
**N'atteint pas** `QUALIFIED`. **N'atteint pas** `AUTHORIZED`.

---

## R3 — champs informatifs non attestés

**Fait.** L'artefact `EvidenceForge.LlmCapability` est construit par
l'appelant. Seules les dimensions du sujet sont confrontées à la sonde réelle.
Les champs suivants sont **déclarés par l'appelant et non recoupés** :

| Champ | Nature | Consommateur critique |
|---|---|---|
| `costUsd` | diagnostic économique | aucun |
| `configurationPresent` | diagnostic | aucun |
| `llmBoundaryId` | trace d'origine | aucun — l'identité de l'émetteur qui fait foi est dans la **concession** (`issuerAuthorityId`, `issuerDescriptorHash`) |
| `callerVerifierIgnored` | trace | aucun |
| `schemaVersion` | trace | aucun — n'est comparé nulle part dans le lot |
| `probeTimestamp` | horodatage | vérifié « date analysable » seulement, **jamais comparé** à l'horodatage enregistré par l'émetteur |
| `capabilities[]` | diagnostic | aucun |
| `authMode` | diagnostic | aucun |
| `probeContract` | diagnostic | aucun — y compris `usesCaseData` et `maxTokens` |
| `failureReason` | diagnostic | aucun |
| `credentialPresenceProblem` | diagnostic | aucun |
| champs additionnels arbitraires | — | le schéma **n'est pas fermé** à l'enregistrement |

**Ce qu'il faut en retenir, et ne pas confondre.** La décision atteste *quels
octets* ont été certifiés (`artifactHash`) et *pour quel sujet*. Elle
n'atteste **pas** que les champs hors sujet soient véridiques. Un artefact
certifié n'est donc pas un artefact dont tout le contenu est prouvé.

**Aucun consommateur critique ne doit s'appuyer sur ces champs comme preuve.**

### Cas particulier — `callerTransportIgnored`

Ce champ mérite d'être isolé, parce que son comportement est **contre-intuitif
et auto-défaisant** :

- un artefact qui déclare honnêtement `callerTransportIgnored: true` — « un
  transport d'appelant a été présenté, et ignoré » — est **refusé** par
  `assertCapabilityUsable` ;
- l'effacer, ou le mettre à `false`, fait **passer** l'artefact.

C'est donc un **enregistrement de traçabilité**, pas un contrôle de capacité :
un appelant qui a présenté un transport et veut le dissimuler n'a qu'à ne pas
l'écrire. Ce qui bloque réellement l'attaque du transport d'appelant n'est pas
ce champ, c'est l'impossibilité d'obtenir une `probeRef` hors de la vraie
frontière de capacité.

**La documentation antérieure présentait ce champ comme une garantie. Ce
n'en est pas une.**

**Statut** : OUVERT. Documenté, sans consommateur critique.

---

## R4 — neuf divergences de sceau historiques, préexistantes

**Fait.** Une recherche **récursive** des sceaux — `SHA256SUMS` et
`SHA256SUMS.txt`, y compris dans les sous-répertoires `manifest/` — trouve
**24 lots historiques scellés**, **1 577 références**, et **9 divergences** :

| Lot | Divergences | Fichiers |
|---|---|---|
| `MONO-07` | 1 | `package.json` |
| `MONO-08/v0.6` | 8 | `CDC-TRACE.md`, `bin/run-real-smoke.js`, `fixtures/mission-real-smoke-v1.json`, `lib/eforch-artifacts.js`, `lib/real-e2e-driver.js`, `lib/real-provider-configs.js`, `reports/mono-08-test-report-v1.json`, `test/test_t08_runner_orchestration.js` |

**Elles ne sont pas imputables à v0.11 ni à v0.12.** Leurs dates de
modification vont du 31/08/2026 au 03/09/2026, soit **neuf à douze jours avant**
l'ouverture de la fenêtre de construction de v0.11 (12/09/2026 19:17:16) :

```
MONO-07/package.json                                2026-08-31T23:17
MONO-08/v0.6/CDC-TRACE.md                           2026-08-31T23:02
MONO-08/v0.6/lib/real-provider-configs.js           2026-09-01T06:35
MONO-08/v0.6/test/test_t08_runner_orchestration.js  2026-09-01T10:24
MONO-08/v0.6/fixtures/mission-real-smoke-v1.json    2026-09-01T13:39
MONO-08/v0.6/reports/mono-08-test-report-v1.json    2026-09-01T13:59
MONO-08/v0.6/lib/eforch-artifacts.js                2026-09-01T23:04
MONO-08/v0.6/lib/real-e2e-driver.js                 2026-09-01T23:10
MONO-08/v0.6/bin/run-real-smoke.js                  2026-09-03T14:29
```

**Statut** : OUVERT, et hors périmètre de ce lot. Leur cause relève d'une
décision du propriétaire sur `MONO-07` et `MONO-08/v0.6`, à instruire
séparément. v0.12 ne les corrige pas et ne prétend pas le faire.

---

## R5 — un code de refus documenté est inatteignable

**Fait.** `LLM_SUBJECT_OUT_OF_ALLOWLIST` existe dans le code comme défense en
profondeur : la liste blanche de l'exploitant est ré-appliquée au moment de la
certification. Mais l'ordonnancement actuel rend cette branche **inatteignable
en pratique** : la comparaison du sujet (`LLM_SUBJECT_MISMATCH`) sort avant, et
`probe()` refuse une intention hors liste blanche avant tout enregistrement.

La garantie **comportementale** tient : *un sujet hors liste blanche ne peut pas
devenir une capacité utilisable.* Ce qui ne tient pas, c'est la promesse qu'un
**code de refus précis** sera observé.

**Statut** : OUVERT. Défense en profondeur morte, à retirer ou à rendre
réellement atteignable dans un successeur.

---

## Ce que v0.12 fait, et ne fait pas

| | |
|---|---|
| **Fait** | corrige la vérité documentaire : mesures de non-régression, promesse de préparation formulée par couche, champs non attestés énumérés, garantie de liste blanche reformulée au niveau comportemental |
| **Ne fait pas** | ne change aucun comportement d'exécution ; ne ferme aucune des cinq réserves ; ne corrige pas les divergences de `MONO-07` et `MONO-08/v0.6` |

`RUNTIME_BYTE_IDENTICAL_TO_V011 = YES` est la propriété centrale de ce lot, et
elle est vérifiable : voir `NON-REGRESSION.md` §1.
