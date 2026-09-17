# MONO-10 v0.10 — préparation scientifique

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

## 2bis. v0.9 — le registre doit être AUTHENTIFIÉ (R5)

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

L'asymétrie prudente est conservée telle quelle : **l'appelant peut dégrader une
préparation, il ne peut pas l'améliorer**, et aucun *unknown* amont absent du
registre n'est reconstitué.
