# 06 — Epistemic Remediation (F-02, F-03, F-04, F-06)

## Principe (mandat section 10)

`REAL_EXECUTION != REAL_EVIDENCE`. `SCHEMA_VALID != EVIDENCE_VALID`.
`SYNTHETIC != REAL`. Un objet peut être structurellement valide
(passe tous les validateurs de schéma) tout en étant épistémiquement
faux (prétend représenter un événement — appel LLM, décision humaine —
qui n'a jamais eu lieu).

## Le défaut (avant remédiation)

`lib/eforch-artifacts.js` construisait, INCONDITIONNELLEMENT et de
façon identique en mode REAL (`bin/run-real-smoke.js`) et en test
LOCAL_CONTROLLED (`test/test_t08_eforch.js`) :

- `ResolverTrace.resolverRuns[]` : `provider:"anthropic"`,
  `model:"claude-sonnet-4-6"`, `inputHash:"1".repeat(64)`,
  `rawResponseHash:"2".repeat(64)` — un SHA-256 SYNTACTIQUEMENT valide,
  ÉPISTÉMIQUEMENT impossible (aucun hash réel ne vaut jamais un
  caractère répété 64 fois).
- `SearchProtocol.plannerRuns[0]` : même motif, `"3".repeat(64)`/
  `"4".repeat(64)`.
- `ScreeningArtifact.auditDecisions[].acteur: "human"`,
  `justification: "Pertinent (MONO-08)."` — une décision humaine
  entièrement inventée par le code, jamais prise par personne.

Ces trois artefacts sont ensuite injectés comme `efOrchExecutionDependencies`
et consommés par le sous-système EF-ORCH RÉEL (`EF-ORCH-SUBSYSTEM`,
premier nœud du graphe 14 nœuds) — un run marqué REAL pouvait donc
produire un résultat structurellement complet tout en ne contenant
AUCUNE provenance LLM ou humaine réelle, sans que rien ne le signale.

## La correction

### Mode explicite, jamais implicite

Chaque builder concerné (`buildResolverTraceForMission`,
`buildSearchProtocolForMission`, `buildScreeningArtifactForMission`)
accepte désormais `provenance: { mode, ... }`.

- **`mode` absent ou `"LOCAL_CONTROLLED"`** (défaut — jamais REAL par
  accident) : construit exactement les mêmes valeurs fixture qu'avant
  (RÈGLE CARDINALE : aucun changement fonctionnel des tests existants),
  mais ajoute un champ `evidenceProvenance: "SYNTHETIC_FIXTURE"` à
  l'objet retourné ET à chaque entrée (`resolverRuns[i]`,
  `plannerRuns[0]`, `auditDecisions[i]`) — un champ ADDITIF, jamais lu
  par les validateurs gelés MONO-01 (vérifié : aucun d'eux ne rejette de
  propriété supplémentaire), donc sans impact sur la validité
  structurelle.
- **`mode: "REAL"`** : exige que l'appelant fournisse les données
  RÉELLES correspondantes :
  - `provenance.resolverRuns[]` : un par discipline proposée, chacun
    avec `provider`/`model`/`promptVersion`/`date` (chaînes non vides)
    et `inputHash`/`rawResponseHash` (SHA-256 hexadécimal 64 caractères
    valide — forme vérifiée, jamais le contenu, qui reste hors de la
    portée de MONO-08).
  - `provenance.plannerRun` : mêmes champs, un seul (un planner par
    protocole).
  - `provenance.auditDecisions` : un objet/Proxy indexé par `sourceId`,
    chaque entrée avec `acteur === "human"` (contrainte du contrat
    GELÉ EF-01D, voir `04-CONTRACT-IMPACTS.md`), `justification`,
    `date`, `decision` ∈ {inclus, exclu, doublon}.
  - Toute donnée manquante ou invalide → `OPERATOR_INPUT_REQUIRED`
    (`err.code`), JAMAIS une valeur fabriquée en repli.

### Décision de gouvernance (F-04) appliquée, pas seulement documentée

`bin/run-real-smoke.js` (point d'entrée du VRAI Real Smoke) passe
désormais `mode: "REAL"` de façon inconditionnelle aux deux appels
`createRealMissionRun()`, et lit `mission.eForchProvenance` (nouveau
champ optionnel de fixture, documenté mais jamais inventé dans le
fixture lui-même — voir ci-dessous) comme source de la provenance
réelle. Le fixture actuel (`fixtures/mission-real-smoke-v1.json`) ne
porte PAS ce champ : un run réel exécuté aujourd'hui échouerait donc
honnêtement, dès la construction du run, avec
`OPERATOR_INPUT_REQUIRED: ResolverTrace (EF-01B) requiert un
resolverRuns[] REEL fourni par l'opérateur…` — c'est le comportement
FAIL-CLOSED voulu par la décision de gouvernance, pas un défaut restant
à corriger.

## F-06 — fixture de mission (déclaration, jamais le contenu)

`fixtures/mission-real-smoke-v1.json` a légitimement atteint
`readyForExecution: true` (professionnels et documents cibles passés
`OPERATOR_INPUT_REQUIRED` → `VERIFIED`) entre v0.5 et v0.6 —
**AUCUN contenu réel/professionnel/documentaire n'a été remplacé ou
inventé** dans cette mission de remédiation : le texte réel de la page
d'accessibilité du Governor's Office of Planning and Research
(target-01), récupéré par recherche web publique et documenté dans
`CDC-TRACE.md` comme non fabriqué, reste exactement ce qu'il était.

Le SEUL défaut était que `v0.6-implementation-evidence-2026-08-31/
files-modified-created.txt` déclarait ce fichier « copié tel quel
depuis v0.5 » — une déclaration FAUSSE, jamais vérifiée par une preuve
qui aurait réellement comparé deux états distincts du fichier (la
preuve de non-régression existante comparait deux exécutions lisant le
MÊME fichier déjà à l'état complet). Corrigé en place (voir
`03-FILES-CHANGED.md` et l'historique git — jamais supprimé en
silence).

## Preuve

`test/test_t08_epistemic_integrity.js` (11 assertions) : mode
LOCAL_CONTROLLED reste fonctionnel et étiqueté (T-NEW-09) ; mode REAL
sans provenance réelle échoue fermé sur `OPERATOR_INPUT_REQUIRED`
(T-NEW-05/06/07/08) ; mode REAL avec provenance réelle COMPLÈTE (simulée
par le test via une provenance explicitement fournie, jamais un vrai
appel réseau) construit réellement les artefacts, étiquetés
`REAL_LLM_CALL`/`REAL_HUMAN_ACTION`, transportant les valeurs réellement
fournies (jamais `"1".repeat(64)` ni `"claude-sonnet-4-6"` codé en dur).
`test/test_t08_release_governance.js` (4 assertions, T-NEW-10) garantit
que la correction F-06 ne peut pas silencieusement disparaître.
