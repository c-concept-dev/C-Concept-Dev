# MONO-10 v0.1 — Qualification scientifique et portes humaines

Lot **entièrement additif**. MONO-01 → MONO-09 sont gelés et ne sont pas modifiés.

## Principe

MONO-10 ne corrige rien rétroactivement. Les artefacts legacy conservent
`testMode: true`, `scientificValidity: false`, `humanProfessionalValidation: false` —
ces valeurs restent vraies pour ce qu'elles décrivent. MONO-10 ajoute un niveau
distinct, avec son propre vocabulaire : `qualificationStatus` porte sur le
**processus**, jamais sur un artefact ancien devenu valide.

## Les trois amendements du propriétaire

### 1. `ProfessionalCandidateAssessment` avant la porte humaine

Sans cette étape, les 51 auteurs-graines issus des 22 sources incluses
deviendraient 51 formulaires humains obligatoires.

Quatre états, dont **aucun** ne vaut approbation :

| État | Signification |
|---|---|
| `PRESENT_FOR_HUMAN_REVIEW` | identité établie et œuvres retenues rattachées — une revue humaine peut porter sur des éléments vérifiables |
| `INSUFFICIENT_DOCUMENTARY_BASIS` | les éléments disponibles ne fondent pas une revue utile — **jamais un rejet de la personne** |
| `IDENTITY_AMBIGUOUS` | identité non résolue — une revue ne peut porter sur une identité incertaine |
| `OUT_OF_SCOPE_DOCUMENTARILY` | aucune discipline ne recoupe les dimensions de mission |

Un invariant dur refuse tout statut évoquant une admission (`APPROVE`, `ADMITTED`,
`PANEL_MEMBER`). Seuls les `PRESENT_FOR_HUMAN_REVIEW` atteignent la porte.

### 2. La sonde LLM valide une vraie réponse structurée

`max_tokens: 1` prouve qu'un jeton sort, pas qu'une réponse conforme à un schéma
peut être produite. La sonde demande un objet JSON minimal avec un budget de
**64 jetons** et **valide sa structure champ par champ** (`ok === true`,
`probe === "evidenceforge"`).

Elle n'utilise aucune donnée de mission ni de cas sentinelle — vérifié par test.

### 3. `NOT_QUALIFIED` n'efface jamais un verdict legacy

Le verdict legacy reste enregistré tel quel, attribué à son producteur.
`applyLegacyVerdictPolicy` retourne `legacyVerdict` inchangé, pose
`legacyVerdictPreserved: true`, et rend `scientificallyActionableVerdict = NONE`
avec `p0_2Allowed = false`. **Seul l'usage est bloqué, jamais l'enregistrement.**

## Fermeture de A-07

Un auteur d'une source incluse, porteur d'un ORCID, atteignait le corpus sans
aucun humain. `createPanelGatedAdapter` **compose** MONO-09 v0.2 — gelé, non
modifié — et rétrograde en `UNVERIFIED` tout candidat sans approbation humaine,
avec motif explicite, la vérification documentaire restant tracée.

Double verrou : `buildProfessionalCorpus` lève `UNAPPROVED_PROFESSIONAL_REACHED_EF02C`
si une vérification non filtrée lui est passée de force. Sans porte humaine du
tout, `EF-02B` échoue immédiatement (`PANEL_GATE_MISSING`) — jamais un ensemble
vide silencieux.

`ORCID` renseigne `identityConfidence`, jamais `decision`.

## Fermeture de A-08

`dependenciesAvailable.llm = true` est classé `DECLARED` et n'a aucune force
probante. `AVAILABLE` exige **toutes** ces conditions :

```
probeExecuted && probeStatus == SUCCESS && responseSchemaValidated
&& !credentialProbeSkipped && credentialPresenceAttested
&& providerId et modelId concordant avec la configuration
&& workerBindingId présent
```

`credentialProbeSkipped === true` plafonne à `DEGRADED` — leçon directe de
`MONO-08/v0.6/lib/preflight.js` l.171-177, qui dégrade en silence sans clé.

Aucun secret n'est stocké : `credentialPresenceAttested` est un booléen.

## Readiness en deux phases

`PRE` évalue ce qui existe avant la partie coûteuse : évaluation des candidats,
porte humaine, panel approuvé, ambiguïtés bloquantes, capacité LLM, lignée.
`FULL` ajoute corpus, jumeaux, couverture de revue, agrégation, inconnus.

**Aucun quota disciplinaire.** Une couverture étroite produit une réserve, jamais
un blocage : imposer un seuil fabriquerait une représentativité que le corpus ne
porte pas.

## Étanchéité des fixtures

Tout acte humain dont `actorIdentity` commence par `FIXTURE:` ou dont
`provenance.fixture` vaut `true` est **refusé en production**. Il en va de même
pour une sonde LLM de fixture. Le test d'intégration le vérifie sur les trois
maillons simultanément : la chaîne entière prouve la structure, jamais la science.
