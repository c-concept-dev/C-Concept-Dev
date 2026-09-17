# MONO-10 v0.8 — préparation scientifique

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
