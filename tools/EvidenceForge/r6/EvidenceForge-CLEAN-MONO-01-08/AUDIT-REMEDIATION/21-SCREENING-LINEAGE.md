# 21 — Screening Lineage (R4, F-03)

## Ancien comportement

`buildScreeningArtifactForMission()` recevait un tableau `sourceIds`
(dans les faits, toujours `[sourceId]` — un seul id synthétique dérivé de
`runContractHash`, construit AVANT que la recherche EF-01C2 n'ait
réellement eu lieu). Chaque source de `sourcesScreening[]` était donc
construite avec :

```
titre: "Source " + id
auteurOuOrganisme: ""
date: ""
reference: ""
discipline: "MONO-08"
theme: ""
provenance: { connectorId:"openalex", connectorType:"api", retrievalMethod:"automatic", originalReference:null }
```

— un placeholder documentaire, jamais un résultat réellement retrouvé.
Le contrat gelé EF-01D (`assertScreeningArtifactComplete`) ne vérifie
JAMAIS le contenu de ces champs (vérifié par inspection directe du
contrat — voir `16-M02-CAUSAL-LINEAGE.md` et `04-CONTRACT-IMPACTS.md`),
donc ce placeholder n'était jamais rejeté structurellement : il restait
silencieusement présent dans tout artefact REAL sans jamais être
distingué d'un résultat réel.

## Nouveau comportement

`buildEForchArtifacts()` exécute désormais RÉELLEMENT la récupération
EF-01C2 (`executeActiveConnectorsRetrieval()`, même logique d'agrégation
que l'exécuteur EF-01C2 gelé) **avant** de construire `ScreeningArtifact`
— jamais après, jamais en parallèle sans lien. `buildScreeningArtifactForMission()`
reçoit désormais le tableau RÉEL `sourcesTrouvees` (forme produite par
`ef-orch-ef01c2-runner-openalex-v0.1.js`, gelé, jamais réimplémenté) et
copie chaque champ documentaire tel quel.

### Nouveaux champs

Chaque entrée de `sourcesScreening[]` porte désormais :

- `fieldProvenance: {titre, auteurOuOrganisme, date, reference, discipline, theme}`
  — classification EXPLICITE par champ : `RETRIEVAL_DERIVED` si une
  valeur réelle a été retrouvée, `NOT_AVAILABLE` sinon (jamais un
  troisième état ambigu).
- `lineage: {retrievalResultHash, sourceRecordHash}` — voir ci-dessous.

### Provenance de chaque champ

| Champ | Provenance |
|---|---|
| `id` | `RETRIEVAL_DERIVED` (généré par le connecteur réel, unique par source — voir Note genId ci-dessous) |
| `titre` | `RETRIEVAL_DERIVED` si `w.display_name`/`w.title` fourni par la source ; **limite héritée** : le runner gelé (`makeSource()`, MONO-01) retombe lui-même sur le littéral `"(sans titre)"` si absent — un comportement du LOT GELÉ, jamais introduit ni corrigé par MONO-08 (impossible sans modifier MONO-01) ; documenté honnêtement ici plutôt que masqué. |
| `auteurOuOrganisme`, `date`, `reference` | `RETRIEVAL_DERIVED` si fourni par l'API réelle, sinon `null` + `NOT_AVAILABLE` (jamais une chaîne vide fabriquée pour satisfaire un schéma) |
| `discipline`, `theme` | `RETRIEVAL_DERIVED` (dérivé de la requête/du connecteur réellement exécuté), jamais `"MONO-08"` fixe |
| `provenance.connectorId/connectorType/retrievalMethod/originalReference` | `RETRIEVAL_DERIVED`, copiés tels quels depuis le résultat réel du connecteur |
| `statutScreening`, `motifExclusion`, `screeningDecisionRef` | `OPERATOR_ATTESTED` (décision humaine réelle, inchangé depuis F-02/F-03 r1) |

### Note genId — unicité des ids

Avant R4, `buildOpenAlexConnectorRunner()` injectait `genId: () =>
sourceId` — un id CONSTANT quel que soit le nombre de résultats
réellement retrouvés (si l'API en avait retourné plusieurs, ils
auraient tous partagé le même id, silencieusement). Corrigé : `genId`
génère désormais un id unique par résultat (`sourceId + "-" + n`),
jamais un id répété.

### Mémoïsation — zéro appel réseau supplémentaire

`buildOpenAlexConnectorRunner()` retourne désormais une fonction
MÉMOÏSÉE : le premier appel exécute réellement la récupération et met
en cache la Promise résultante ; tout appel suivant (notamment celui du
nœud EF-01C2 du graphe MONO-02, exécuté plus tard dans le MÊME
processus) réutilise EXACTEMENT ce résultat déjà obtenu — jamais un
second appel réseau réel, jamais un second jeu de résultats (et donc
d'ids) incohérent avec celui déjà utilisé pour construire
`ScreeningArtifact`. Preuve directe : `test_t08_eforch.js::T08-EFORCH-04`
(le nœud EF-01C2 du graphe appelle bien le connecteur) reste vert sans
aucune modification, et `test_t08_r4_closure.js::R4-F03-10` vérifie que
`buildEForchArtifacts()` retourne l'instance déjà invoquée (jamais une
fabrique qui en reconstruirait une nouvelle).

Sur une reprise après redémarrage (nouveau processus),
`rehydrateRealMissionRun()` reconstruit un connecteur FRAIS (jamais
celui-ci, jamais persisté — comportement inchangé depuis r1) : sans
impact, car un nœud EF-01C2 déjà terminé (checkpoint MONO-03 persisté)
ne rappelle jamais son runner (idempotence du checkpoint EF-01C2,
MONO-01, gelé — vérifié par inspection directe de
`ef-orch-ef01c2-executor-v0.1.js`).

## Mapping EF-01C2 → EF-01D

```
executeActiveConnectorsRetrieval(connectorRunners, searchProtocol)
  -> { sourcesTrouvees: [...], executionLog: [...] }
       |
       v
buildScreeningArtifactForMission(deps, sourcesTrouvees, protocolHash, provenance)
  -> pour chaque record de sourcesTrouvees :
       sourcesScreening[i] = { ...champs copiés du record, fieldProvenance, lineage }
```

Aucune inférence : chaque `sourcesScreening[i]` correspond exactement,
positionnellement et par id, à un élément de `sourcesTrouvees`.

## Hashes et lineage complet (R → S → Q)

```
retrievalResultHash = sha256CanonicalJson({sourcesTrouvees, executionLog})
  (partagé par TOUTES les sources d'un même run — un seul lot retrieval)

sourceRecordHash[i] = sha256CanonicalJson(sourcesTrouvees[i])
  (unique par source — change si et seulement si le contenu de CE record change)

screeningArtifactHash = sha256CanonicalJson(screeningArtifact)
qualificationArtifactHash = sha256CanonicalJson(qualificationTestArtifact)
```

`efOrchExecutionDependenciesSerializable.retrievalLineage` porte les
trois hashes de haut niveau (`retrievalResultHash`,
`screeningArtifactHash`, `qualificationArtifactHash`) — chaîne complète
R→S→Q vérifiable sans inférence : « de quel résultat retrieval précis
provient cette source de screening ? » se répond en comparant
`sourcesScreening[i].lineage.sourceRecordHash` au hash recalculé de
n'importe quel enregistrement candidat.

## Tests

`test/test_t08_r4_closure.js`, section R4-F03 (10 assertions,
R4-F03-01..10) :

- deux enregistrements de récupération LOCAL_CONTROLLED réalistes et
  DISTINCTS (Record A / Record B, titre/auteur/référence propres) ;
- `ScreeningArtifact[0]`/`[1]` reprennent réellement A/B respectivement
  (comparaison de valeurs EXACTES, jamais une simple présence) ;
- ids réellement distincts entre les deux sources ;
- `fieldProvenance` correctement `RETRIEVAL_DERIVED` quand la valeur est
  réellement présente ;
- un enregistrement minimal (aucun champ optionnel) produit
  `auteurOuOrganisme`/`date`/`reference` = `null` + `NOT_AVAILABLE`,
  jamais une valeur fabriquée ;
- `lineage.sourceRecordHash` distinct entre A et B, `lineage.
  retrievalResultHash` partagé au sein d'un même run mais distinct
  entre deux runs différents ;
- `retrievalLineage` porte la chaîne complète R→S→Q ;
- `connectorRunners` retourné est l'instance déjà invoquée (mémoïsée),
  jamais une fabrique.

## Limitation restante, honnêtement disclosed

**`auditDecisions` doit être keyé par des ids connus uniquement APRÈS
une récupération réelle.** Puisque `buildEForchArtifacts()` exécute
maintenant la récupération EF-01C2 ET construit `ScreeningArtifact` dans
le MÊME appel synchrone, un opérateur ne peut structurellement PAS
connaître à l'avance les ids exacts des sources qui seront retrouvées
pour préparer ses décisions de screening à l'avance dans une soumission
unique. Ce round (R4) ne construit pas de nouvelle API en deux phases
pour ce workflow (hors périmètre mandaté — voir mandat section 5, R4
porte sur la cohérence/lineage, pas sur une refonte d'API opérateur).
Pratique recommandée documentée dans
`20-REAL-SMOKE-OPERATOR-CHECKLIST.md` : soit une politique de décision
générale (une même décision humaine réelle appliquée à toute source
retrouvée, explicitement attestée comme telle), soit un run de
reconnaissance préalable dédié à la découverte des ids avant soumission
finale des décisions. Ceci n'affaiblit aucun contrat gelé et ne
fabrique aucune décision : l'opérateur reste seul décisionnaire, jamais
le système.

`titre="(sans titre)"` (frozen fallback MONO-01) reste imparfaitement
distingué d'un titre réel très court par coïncidence — limite mineure,
héritée d'un lot gelé, documentée ci-dessus, non corrigeable sans
modifier MONO-01.
