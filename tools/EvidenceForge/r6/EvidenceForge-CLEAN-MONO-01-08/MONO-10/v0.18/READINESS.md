# MONO-10 v0.18 — préparation scientifique

## 1. Ce que v0.7 acceptait encore

L'audit A a montré que `assertReadinessPhase` — API publique de validation —
acceptait une préparation fabriquée :

- `dimensionBindingsHash` **retiré** ⇒ la comparaison des liaisons était sautée ;
- `opts.registry` **absent** ⇒ tous les contrôles de liaison étaient sautés ;
- tous les statuts retournés à `SATISFIED`, `dimensionsHash` recalculé ⇒ accepté,
  parce que la dérivation de phase ne regardait que le **type** des preuves.

Le défaut n'était pas exploité en aval — `qualifyProcess` recalcule la
préparation depuis les sources — mais une API de validation qui accepte un
artefact fabriqué n'est pas une validation.

## 2. Trois fermetures

**§26 — le registre est obligatoire.** `READINESS_REGISTRY_REQUIRED`. Une
fonction qui prétend valider une provenance ne valide pas sans registre, et ne
saute pas le contrôle : elle échoue.

**§27 — les liaisons sont obligatoires.** `READINESS_BINDINGS_REQUIRED`.
`dimensionBindingsHash` doit être présent et correspondre au recalcul.

**§28 / §29 — le statut est plafonné par la preuve.** Chaque dimension a un
**plafond** dérivé du contenu de l'artefact lié :

| Dimension | Plafond dérivé de |
|---|---|
| `candidateAssessment` | ≥ 1 évaluation `PRESENT` |
| `professionalPanelGate` | ≥ 1 `APPROVE` **et** capacité `HUMAN_AUTHENTICATED` sur l'artefact de décision |
| `blockingAmbiguities` | aucune approbation d'identité `AMBIGUOUS` |
| `llmCapability` | sonde `AVAILABLE` **et**, en production, capacité `PRODUCTION_LLM_CAPABILITY` |
| `lineage` | résolvabilité — déjà prouvée par les liaisons |
| `unknowns` | aucun inconnu bloquant ouvert dans l'artefact d'évaluation |
| `professionalCorpus` / `documentaryTwins` / `reviewCoverage` / `aggregation` | contenu non vide de l'artefact du type attendu |

Le statut déclaré peut être **plus prudent** que le plafond — une dégradation
légitime (inconnus amont, réserves) reste possible — mais jamais meilleur :
`READINESS_STATUS_OVERSTATED`.

## 2bis. v0.9 — le registre doit être AUTHENTIFIÉ (V011-R5, résidu fermé)

v0.8 exigeait « un registre », c'est-à-dire un objet possédant `get()`.
L'audit A a fabriqué `{ get, has, entries }` et fait valider une `FULL`. Une API
publique de validation ne doit pas être plus permissive que son consumer aval.

v0.9 exige :

| Contrôle | Échec |
|---|---|
| marque d'origine du module de registre | `READINESS_REGISTRY_INVALID` |
| run attendu | `READINESS_REGISTRY_RUN_MISMATCH` |
| mission attendue | `READINESS_REGISTRY_MISSION_MISMATCH` |
| frontière attendue | `READINESS_REGISTRY_BOUNDARY_MISMATCH` |

## 3. La phase est dérivée

`deriveReadinessPhase` établit une dimension **seulement** si une liaison valide
existe, où la relation de l'artefact est **lue sur le registre**. Une référence
empruntée à une autre dimension porte donc la mauvaise relation et n'établit
rien : `READINESS_DIMENSION_EVIDENCE_UNBOUND`. Une étiquette `FULL` sans liaison
`FULL` ne rend jamais `FULL`.

## 4. Portée exacte du plafond — limite déclarée

Le plafond est ce que **les artefacts enregistrés** permettent de justifier. Il
ne reconstitue pas toute l'évaluation : `evaluateReadiness` consomme aussi des
entrées qui ne sont pas dans le registre (inconnus amont et ajoutés, fournis par
l'appelant). C'est pourquoi le contrôle est une **borne supérieure** et non une
égalité.

Conséquence honnête : un appelant peut déclarer une dimension **pire** qu'elle
n'est. C'est sans effet de sécurité — cela ne peut que refuser davantage — et
c'est dit ici plutôt que sous-entendu.

## 5. Témoins positifs

Une `PRE` authentique et une `FULL` authentique passent (`T49`, `T50`), et la
chaîne nominale qualifie. La sécurité ne bloque pas tout.


## Fermetures v0.10 (§13, §14)

v0.9 comparait la frontière du registre à celle du vérificateur sur **un seul
champ**, et seulement si `opts.verifier` en portait un de type chaîne. Un
vérificateur absent, ou de forme compatible, **sautait** le contrôle.
`scientific-readiness.js` était de ce fait la seule exception de l'inventaire
des consommateurs de `configBindingHash`.

| Ce qui change | Code de refus |
|---|---|
| un vérificateur présent doit être **marqué** ; sinon le contrôle échoue | `READINESS_VERIFIER_FORGED` |
| l'identité comparée est **composite** : identifiant + liaison de configuration + mode d'exécution | `READINESS_REGISTRY_BOUNDARY_MISMATCH` |
| un registre de TEST ne vaut pas pour un run de PRODUCTION | `READINESS_REGISTRY_MODE_INSUFFICIENT` |
| `readiness.executionMode` divergent du mode **authentifié** du registre | `READINESS_EXECUTION_MODE_MISDECLARED` |
| le plafond de statut est calculé avec le mode **authentifié**, jamais avec celui que porte l'artefact | (plus de levier) |

L'asymétrie prudente est conservée — mais **v0.12 la formule par couche**,
parce qu'elle n'est pas vraie à toutes. Voir §« Asymétrie : à quelle couche ? »
plus bas.


## Fermeture v0.11 (§10, §11, §12) — le vérificateur n'est plus facultatif

v0.10 ne comparait l'identité composite que **si** `opts.verifier` était fourni.
Omettre ce champ suffisait à faire valider une préparation sans aucune
comparaison de frontière. Pire : le consommateur critique lui-même —
`qualifyProcess` — appelait `assertReadinessPhase` sans vérificateur, et
empruntait donc le chemin faible.

| Ce qui change | Code de refus |
|---|---|
| `opts.verifier` **obligatoire** | `READINESS_VERIFIER_REQUIRED` |
| `verifier.namespace` comparé au mode du registre | `READINESS_REGISTRY_BOUNDARY_MISMATCH` |
| `qualifyProcess` transmet `verifier` et `manifest` | — |
| les blocs `if (opts.registry)` deviennent inconditionnels : le registre est déjà exigé plus haut | — |

**Aucune vérification critique ne suit le motif `if (opts.verifier) { contrôle }`
lorsque l'absence permet l'acceptation.** L'absence d'un composant de sécurité
requis est elle-même une erreur.

## Asymétrie : à quelle couche ? (correction v0.12)

Jusqu'à v0.11 ce document écrivait, sans nommer de couche :

> « l'appelant peut dégrader une préparation, il ne peut pas l'améliorer »

**Cette phrase est fausse si on la lit comme décrivant `assertReadinessPhase`
isolément**, et un audit indépendant l'a démontré. Elle est remplacée par une
formulation par couche, parce que l'invariant n'est pas assuré partout où la
prose le suggérait.

| Couche | L'appelant peut-il AMÉLIORER une préparation ? | Ce qui l'en empêche, ou non |
|---|---|---|
| **1. assertion locale** — `assertReadinessPhase` | **OUI, partiellement** | `DIMENSION_STATUS_CEILING.llmCapability` ne teste que `status === "AVAILABLE"` et la présence d'une concession tracée. Il **n'appelle pas** `assertCapabilityUsable`. Une préparation forgée avec `dimensionsHash` **et** `dimensionBindingsHash` recalculés est acceptée dans au moins trois variantes où la capacité LLM est inutilisable : `probeAttestationHash` faux, `transportOrigin: "CALLER"`, `probeExecutionMode: "TEST"`. |
| **2. qualification effective** — `qualifyProcess` | **NON** | la préparation est **recalculée depuis les sources** ; `llm_capability_validated`, `readiness_pre`, `readiness_full` et `readiness_recomputed_matches_presented` tombent tous. |
| **3. autorisation aval** — `downstream-authorization` | **NON** | recalcul intégral, et `NOT_QUALIFIED` est bloquant. |

**Ce que le lot garantit donc réellement** : une préparation artificiellement
améliorée **n'atteint ni `QUALIFIED` ni `AUTHORIZED`**. C'est une garantie de
bout en bout, pas une garantie de couche.

**Ce que le lot ne garantit pas** : que `assertReadinessPhase`, prise seule,
refuse une préparation améliorée. C'est un manquement réel à sa propre règle —
*une API publique de validation ne doit pas être plus permissive que son
consommateur critique* — et il est consigné en `OPEN-FINDINGS.md` (R2, ouverte),
non comme résolu.

Les autres dimensions ne sont pas concernées par ce constat : leurs plafonds
dérivent du contenu de l'artefact lié, et les variantes testées
(capacité jamais certifiée, jamais enregistrée, mauvais sujet de sonde,
mauvaise frontière, vérificateur ou registre de forme compatible) sont
**refusées** — `READINESS_STATUS_OVERSTATED`,
`READINESS_REGISTRY_BOUNDARY_MISMATCH`, `READINESS_VERIFIER_FORGED`,
`READINESS_REGISTRY_INVALID`.

Aucun *unknown* amont absent du registre n'est reconstitué : cela reste vrai.
