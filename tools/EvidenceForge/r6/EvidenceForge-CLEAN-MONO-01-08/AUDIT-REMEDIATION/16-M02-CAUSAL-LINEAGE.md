# 16 — M-02 : dérivation causale SearchProtocol ← plannerOutput (R3)

## Ancien comportement (r1/r2)

En mode `REAL`, `buildSearchProtocolForMission()` exigeait `provenance.
plannerRun` — mais `plannerRun` ne porte QUE la provenance de l'appel
LLM (`provider`/`model`/`promptVersion`/`date`/`inputHash`/
`rawResponseHash`), jamais son contenu. Le contenu substantiel du
`SearchProtocol` (`sourcesActivees`, `requetesExactes`,
`retrievalPolicies`, `criteresInclusion`, `criteresExclusion`,
`regleDedoublonnage`, `methodeQualification`) restait construit par un
gabarit MONO-08 codé en dur, **identique quel que soit le contenu réel
de la sortie du planificateur**.

## Problème causal

`plannerRun` était attaché au `SearchProtocol` comme une métadonnée
adjacente, jamais comme la source du contenu. Preuve directe (r2,
`test_t08_r2_closure.js::M02-01`, préservée telle quelle et
réinterprétée — voir ce fichier) : deux `plannerRun` réellement
distincts produisaient un `SearchProtocol` substantiellement
byte-identique. Le champ `evidenceProvenance="OPERATOR_ATTESTED_LLM_
CALL"` était donc trompeur pour le contenu (bien qu'honnête pour la
provenance elle-même) : il suggérait un lien qui n'existait pas.

## Nouveau schéma d'entrée : `provenance.plannerOutput`

Champ ADDITIF (jamais un champ d'un contrat gelé MONO-01), distinct de
`plannerRun` :

```
plannerOutput: {
  sources: [{ connectorId, label?, access?, constraint?, justification }],
  queries: [{ discipline, connectorId, requete, justification }],   // une par discipline retenue de la mission
  retrieval: [{ connectorId, sortMode, pageSize, maxPages, maxResults,
                stopCondition, retryPolicy, rateLimitPolicy, budgetMax }], // une par source active
  criteresInclusion: [string, ...],   // non vide
  criteresExclusion: [string, ...],   // non vide
  regleDedoublonnage: string,
  methodeQualification: string,
  fenetreTemporelle?: { debut, fin },
  langues?: [string, ...],
  typesDocumentsAdmis?: [string, ...],
}
```

## Validation : `validateRealPlannerOutputFields(output, disciplineIds)`

Fonction unique (`lib/eforch-artifacts.js`), réutilisée IDENTIQUEMENT
par :
- `buildSearchProtocolForMission()` (fail-closed à la construction) ;
- `validateRealEForchProvenance()` (mission-gate, fail-closed AVANT
  tout builder/appel provider — même principe que B-03).

Vérifie : au moins une source (`connectorId`+`justification`) ; une
requête réelle par discipline retenue de la mission (jamais devinée,
jamais un sous-ensemble) ; une politique de récupération réelle par
source active (tous les champs textuels + `pageSize`/`maxPages`/
`maxResults` numériques) ; `criteresInclusion`/`criteresExclusion` non
vides ; `regleDedoublonnage`/`methodeQualification` non vides. Absence
ou incomplétude ⇒ `OPERATOR_INPUT_REQUIRED` explicite, message contenant
littéralement **"planner causal output missing"**.

## Transformation : `buildSearchProtocolFromPlannerOutput(output, disciplineIds)`

Fonction PURE et DÉTERMINISTE (`lib/eforch-artifacts.js`) : copie ou
réindexe chaque champ substantiel DEPUIS `output` (déjà validé) — ne
construit JAMAIS `criteresInclusion`/`criteresExclusion`/
`regleDedoublonnage`/`methodeQualification`/`sourcesActivees`/
`requetesExactes`/`retrievalPolicies` par défaut. Seuls des défauts NON
SUBSTANTIFS, jamais vérifiés par le contrat gelé
`assertSearchProtocolFrozenAndValid` (label de présentation, `access`/
`constraint` vides, `fenetreTemporelle`/`langues`/`typesDocumentsAdmis`
vides), sont complétés silencieusement quand absents.

## Exemples concrets (test_t08_r3_closure.js)

**Planner A** : source `openalex`, `maxResults=5`, 1 critère d'inclusion
(`"Critere d'inclusion PLANNER-A."`), `regleDedoublonnage="DOI (Planner
A)."`, `methodeQualification="Qualitative (Planner A)."`.

**Planner B** : source `openalex`, `maxResults=10`, 2 critères
d'inclusion, `regleDedoublonnage="titre+annee (Planner B)."`,
`methodeQualification="Quantitative (Planner B)."`.

**SearchProtocol A** produit : `retrievalPolicies[0].maxResults === 5`,
`criteresInclusion.length === 1`, `criteresInclusion[0] === "Critere
d'inclusion PLANNER-A."` (M02-02).

**SearchProtocol B** produit : `retrievalPolicies[0].maxResults === 10`,
`criteresInclusion.length === 2`, `methodeQualification === "Quantitative
(Planner B)."` (M02-03).

Les différences A/B correspondent EXACTEMENT aux différences fournies en
entrée (M02-04) ; les champs NON variés (connecteur actif, disciplines
retenues) restent identiques — preuve que seule l'entrée pilote la
sortie, jamais un bruit non lié.

## Hashes et lineage

`causalLineage` (champ additif, dans le contenu hashé par
`protocolHash`) :

```
causalLineage: {
  plannerRunRef: "planner-<idSuffix>",
  plannerInputHash: <plannerRun.inputHash>,
  plannerRawResponseHash: <plannerRun.rawResponseHash>,
  plannerOutputHash: sha256CanonicalJson(plannerOutput),
  derivationMethod: "buildSearchProtocolFromPlannerOutput (MONO-08, deterministe, jamais un gabarit fige)",
}
```

`protocolHash` (champ gelé, calculé par l'algorithme historique
`sha256LikeRealSearchProtocol` — jamais modifié) joue le rôle du
« SearchProtocolHash » du mandat : puisque `causalLineage.
plannerOutputHash` fait partie du contenu hashé, reproduire
`protocolHash` exige la valeur EXACTE de `plannerOutputHash` — lien
mécaniquement vérifiable, jamais seulement déclaratif (preuve directe :
`M02-08`, `protocolHash` recalculé diverge dès que `plannerOutputHash`
est altéré). Aucun second champ `searchProtocolHash` dupliqué sous un
autre nom.

`M02-06` : modifier `plannerOutput` (ex. `maxResults` 5→10) change
réellement `causalLineage.plannerOutputHash`. `M02-07` : modifier le
contenu du protocole (A vs B) change réellement `protocolHash`.

## Classification de provenance

Nouveau champ additif `provenanceClassification`, distinct de
`evidenceProvenance` (qui reste `OPERATOR_ATTESTED_LLM_CALL`/
`SYNTHETIC_FIXTURE`, inchangé) :

| Mode | `provenanceClassification` |
|---|---|
| REAL, plannerOutput fourni et transformé | `OPERATOR_ATTESTED_LLM_DERIVED` |
| LOCAL_CONTROLLED | `SYNTHETIC_FIXTURE` |

**Jamais** `VERIFIED_LLM_DERIVED` : MONO-08 ne vérifie toujours pas
causalement que l'appel LLM sous-jacent a réellement eu lieu — il
transporte fidèlement et transforme réellement ce que l'opérateur
atteste avoir produit. `ATTESTED` reste distinct de `VERIFIED` (M-01,
inchangé, cohérent).

## Human validation

Comportement PRÉSERVÉ tel quel depuis r2 (mandat R3, section 12) :
`humanValidation` réelle (`{validatedAt, commentaire}`) reste exigée
explicitement en mode REAL, jamais `"Revu (MONO-08)."` fabriqué —
vérifié même avec `plannerOutput` complet et valide (`M02-10`), pour
isoler précisément ce point de M-02.

## Tests

`test/test_t08_r3_closure.js` — 18 assertions depuis le paquet assemblé
(`M02-01`..`M02-10` + `M02-08b` + `M02-GATE` + section B-04, 16 depuis
le dépôt de développement où la sous-preuve dynamique B-04 est
honnêtement `SKIPPED`) : fail-closed sur absence de
`plannerOutput` ; deux `plannerOutput` concrets et INDÉPENDANTS (jamais
un round-trip via la fonction testée elle-même) produisant des
`SearchProtocol` vérifiablement différents ; absence de toute constante
substantive de repli (revue statique du code de
`buildSearchProtocolFromPlannerOutput`) ; hash de lineage mécaniquement
vérifiable ; classification correcte ; aucun acteur humain automatique ;
mission-gate fail-closed identique au builder.

`test/test_t08_r2_closure.js` (section M-02 historique, préservée et
réinterprétée, jamais supprimée) : re-vérifiée avec le MÊME
`plannerOutput` fourni aux deux appels et SEULE la provenance
(`plannerRun`) variant — le contenu reste identique, ce qui est
désormais un comportement **correct et attendu** (la provenance de
l'appel ne doit jamais, à elle seule, changer le contenu — c'est le
contenu du `plannerOutput` qui doit le faire, prouvé séparément par
`test_t08_r3_closure.js`).

`test/test_t08_epistemic_integrity.js`, `test/test_t08_runner_
orchestration.js` : fixtures REAL mises à jour avec `plannerOutput` —
non-régression confirmée (11/11 et 10/10 PASS).

## Limitations restantes (honnêtement disclosed)

- MONO-08 continue de **transporter** la provenance de l'appel LLM
  (`plannerRun`) sans jamais la **vérifier** causalement (pas d'appel
  réseau, pas de recomputation indépendante du hash déclaré contre un
  appel réellement rejoué) — c'est exactement pourquoi la classification
  reste `OPERATOR_ATTESTED_LLM_DERIVED`, jamais `VERIFIED_LLM_DERIVED`.
  Ceci est cohérent avec le périmètre contractuel de MONO-08 (accepteur
  d'attestation, jamais un vérificateur cryptographique indépendant d'un
  appel LLM tiers) et n'est pas un défaut résiduel de M-02 — M-02 ne
  portait que sur la dérivation du CONTENU depuis la provenance fournie,
  pas sur la vérification de cette provenance elle-même.
- `ScreeningArtifact` (sources : `titre`/`auteurOuOrganisme`/`date`/
  `reference` génériques, cf. audit indépendant M-02 condensé) n'a PAS
  été retouché dans ce round : le mandat R3 (sections 5-14) porte
  explicitement sur `SearchProtocol`, jamais sur `ScreeningArtifact` —
  documenté ici pour mémoire, hors périmètre de fermeture de M-02 tel
  que mandaté.

## Statut

**M-02 = CLOSED.** Voir `15-R3-CLOSURE.md` pour le récapitulatif complet
et `11-FINAL-TECHNICAL-VERDICT.md` pour l'impact sur `REAL_SMOKE_NEXT`.
