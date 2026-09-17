# MONO-10 — migration v0.10 → v0.11

> **Document HISTORIQUE.** Il décrit ce que v0.11 introduisait, tel que cela
> était compris alors. Deux de ses affirmations ont été **corrigées depuis** et
> ne doivent pas être lues comme l'état courant :
> la ré-application de la liste blanche à la certification existe bien, mais le
> code `LLM_SUBJECT_OUT_OF_ALLOWLIST` est **inatteignable** dans
> l'ordonnancement réel (`OPEN-FINDINGS.md` R5) ; et la certification n'établit
> que le sujet et l'empreinte, pas les champs informatifs (`OPEN-FINDINGS.md` R1 et R3).

MONO-10 v0.10 est **HISTORIQUE / NON_GELABLE**. Elle n'est pas modifiée. v0.11
est un successeur **additif ciblé**. L'architecture d'autorité de v0.8–v0.10
n'est pas redessinée : quatre constats de l'audit A sont fermés, et rien d'autre.

> **Principe directeur de v0.11**
>
> **Une décision réelle ne suffit pas si elle ne lie pas le sujet exact qui est
> certifié.** Une capacité ne peut certifier que le sujet réellement décidé par
> son émetteur.
>
> Et : **omettre un vérificateur ou un contexte ne doit jamais désactiver un
> contrôle de sécurité.** L'absence d'un composant de sécurité requis est
> elle-même une erreur.

## 1. Ce que v0.10 laissait ouvert

**B10-01 — une décision authentique réutilisée pour un autre sujet.** La
décision de sonde était inscrite **avant** que l'artefact de capacité n'existe :
son sujet ne portait aucun `artifactHash`, et `verifyDecision` ne comparait que
`requestId` et le run. Une sonde légitime sur le seul triplet autorisé
certifiait donc un artefact déclarant un fournisseur, un modèle et un worker
**hors liste blanche** — `usable = true`. Une seule sonde certifiait quatre
artefacts distincts.

**B10-02** — `assertCapabilityUsable(artefact fabriqué, config, {})` rendait
`usable = true` : contexte vide, ni vérificateur ni registre.

**B10-03** — `assertReadinessPhase` ne comparait l'identité composite que **si**
`opts.verifier` était fourni. Omettre ce champ supprimait le contrôle. Le
consommateur interne `qualifyProcess` empruntait lui-même ce chemin faible.

**B10-04** — les tests de dérivation s'arrêtaient à `CAPABILITY_ISSUER_INVALID` :
aucun n'atteignait `CAPABILITY_DERIVATION_UNVERIFIABLE`.

## 2. Aucun module nouveau

v0.11 ne crée aucun module.

## 3. Changements de rupture

| v0.10 | v0.11 |
|---|---|
| l'artefact de capacité porte `probeDerivationRef` | il porte **`probeRef`** — une référence de **sonde**, qui ne certifie rien à elle seule. La `derivationRef` certifiante naît à la certification |
| `recordProbe` inscrit directement une décision certifiante | inscription en **deux temps** : `recordProbe` conserve le sujet réellement sondé ; `certifyProbedArtifact` confronte, puis décide |
| sujet de décision : `requestId`, provider/model/worker, run, mission | + **`artifactId`**, **`artifactHash`**, **`decisionSubjectHash`** |
| `verifyDecision` compare `requestId`, `runId`, `missionHash`, `executionMode` | compare **sept dimensions obligatoires** : `providerId`, `modelId`, `workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash`, plus `executionMode`. **Une attente absente est un refus**, jamais une dispense |
| une sonde pouvait certifier plusieurs artefacts | **`LLM_PROBE_ALREADY_CONSUMED`** : une sonde ne vaut que pour un artefact. La re-certification du même artefact, à contenu identique, reste idempotente |
| la liste blanche s'appliquait à la sonde seule | elle est **ré-appliquée à la certification** — code `LLM_SUBJECT_OUT_OF_ALLOWLIST`, **inatteignable** en pratique. *Corrigé depuis : ce code est **inatteignable** dans l'ordonnancement réel ; la garantie est comportementale (`OPEN-FINDINGS.md` R5).* |
| `assertCapabilityUsable` lisait ce que la capacité prétend | exige **toujours** : vérificateur marqué, registre authentifié, mode d'exécution dérivable, identité de frontière complète, artefact enregistré, sujet de sonde vérifié |
| `assertReadinessPhase({registry})` acceptait sans vérificateur | **`READINESS_VERIFIER_REQUIRED`** |
| readiness comparait identifiant + liaison + mode | + **`verifier.namespace`** |
| `qualifyProcess` appelait `assertReadinessPhase` sans vérificateur | il passe désormais `verifier` et `manifest` |
| la concession ne nommait pas le sujet certifié | elle porte **`certifiedSubject`** et **`decisionSubjectHash`** |

Nouveaux codes de refus : `LLM_SUBJECT_MISMATCH`,
`LLM_SUBJECT_OUT_OF_ALLOWLIST` (**inatteignable**, voir `OPEN-FINDINGS.md` R5),
`LLM_PROBE_ALREADY_CONSUMED`,
`READINESS_VERIFIER_REQUIRED`.

## 4. Ce qu'un appelant doit faire en plus

1. lire `capability.probeRef` et non plus `capability.probeDerivationRef` ;
2. ne jamais réécrire `providerId`, `modelId`, `workerBindingId`, `requestId`,
   `runId` ni `missionHash` sur un artefact de capacité — ces six champs sont
   confrontés au sujet réellement sondé ;
3. une sonde par artefact de capacité ;
4. passer le contexte complet du run à `assertCapabilityUsable` ;
5. passer `verifier` à `assertReadinessPhase`.

## 5. Effet de bord attendu

Un appelant qui omettait le vérificateur en préparation voit
`READINESS_VERIFIER_REQUIRED` au lieu d'une acceptation. Un appelant qui
réutilisait une sonde pour plusieurs artefacts voit
`LLM_PROBE_ALREADY_CONSUMED`. Ce sont les correctifs.

## 6. Ce qui n'a pas changé

Le coffre privé des émetteurs, l'absence de getter d'émetteur, la comparaison
contre le contexte attendu, les planchers de seuils d'identité, la liaison
`artifactHash` de la provenance et de l'acte humain, l'autorité historique
ignorée en argument, et la décision `NEW_TRUST_GENERATION` de l'ancrage
anti-rejeu.
