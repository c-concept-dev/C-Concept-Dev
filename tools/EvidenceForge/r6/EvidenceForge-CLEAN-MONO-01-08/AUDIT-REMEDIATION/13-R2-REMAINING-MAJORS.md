# 13 — R2 Remaining Majors (M-01, M-02, M-03)

> **Mise à jour round 3 (R3)** : M-02 (ci-dessous, section 2), documenté
> ouvert à r2, est désormais **CLOSED** — dérivation causale réelle de
> `SearchProtocol` depuis `provenance.plannerOutput`, preuve non-
> tautologique reproductible (`test/test_t08_r3_closure.js`, M02-01..
> M02-10). Voir `16-M02-CAUSAL-LINEAGE.md` pour le détail complet et
> `15-R3-CLOSURE.md`/`11-FINAL-TECHNICAL-VERDICT.md` (section « Verdict
> R3 ») pour l'impact sur `REAL_SMOKE_NEXT`. Le contenu ci-dessous reste
> le compte-rendu intact du round 2, jamais réécrit.

## M-01 — provenance attestée vs vérifiée (terminologie)

**Statut : CLOSED.**

- **Constat** : `evidenceProvenance: "REAL_LLM_CALL"` /
  `"REAL_HUMAN_ACTION"` (r1) pouvaient laisser croire à une VÉRIFICATION
  causale (« MONO-08 a vérifié que cet appel LLM a réellement eu lieu »)
  alors que MONO-08 ne fait qu'accepter la structure fournie par
  l'appelant (une ATTESTATION, jamais une preuve cryptographique/causale
  indépendante).
- **Correction** : renommé dans `lib/eforch-artifacts.js` en
  `"OPERATOR_ATTESTED_LLM_CALL"` / `"OPERATOR_ATTESTED_HUMAN_ACTION"` —
  partout où ces valeurs étaient émises (ResolverTrace, SearchProtocol,
  ScreeningArtifact, SearchProtocol.humanValidation). Aucun contrat gelé
  affecté : `evidenceProvenance` est un champ ADDITIF introduit par
  MONO-08 lui-même en r1, jamais un champ des schémas gelés MONO-01.
- **Test** : `test/test_t08_r2_closure.js`, M01-01/M01-02 (revue
  statique du code source, absence des anciennes valeurs, présence des
  nouvelles).
- **Impact sur `REAL_SMOKE_NEXT`** : aucun — correction terminologique
  pure, sans changement de comportement fonctionnel.

## M-02 — dérivation causale de SearchProtocol/artefacts REAL

**Statut : PARTIELLEMENT CORRIGÉ, PARTIELLEMENT DOCUMENTÉ COMME OUVERT.**

### Ce qui a été audité et corrigé

1. **`SearchProtocol.humanValidation.commentaire` fabriqué
   inconditionnellement** — même en mode REAL, `lib/eforch-artifacts.js`
   émettait `commentaire: "Revu (MONO-08)."` sans jamais l'avoir
   conditionné au mode, un défaut du MÊME type que F-02/F-03 mais
   jamais couvert par leur correctif (portée limitée à
   `ScreeningArtifact`/`ResolverTrace`/`plannerRuns`). **Corrigé** :
   mode REAL exige désormais `provenance.humanValidation`
   {validatedAt, commentaire} réellement fourni, sinon
   `OPERATOR_INPUT_REQUIRED` — même discipline que `ScreeningArtifact`.
   Classification : était `MONO08_CONSTRUCTED` présenté comme
   `OPERATOR_ATTESTED_HUMAN_ACTION` sans jamais l'être ; devient
   réellement `OPERATOR_SUPPLIED` en mode REAL, `SYNTHETIC` (étiqueté)
   en LOCAL_CONTROLLED.
2. **`ResolverTrace.resolverRuns[].{proposalCountRaw,
   proposalCountStored, technicalProposalLimit, targetContextReport}`
   se repliaient silencieusement sur 1/1/20/[] même en mode REAL** si
   l'appelant ne les fournissait pas — une affirmation implicite sur ce
   que l'appel LLM réel a produit, sans preuve. **Corrigé** : ces
   champs sont désormais exigés explicitement en mode REAL (fail-closed
   `OPERATOR_INPUT_REQUIRED`), jamais devinés.

### Ce qui reste OUVERT (preuve directe, test M02-01)

Le contenu SUBSTANTIEL de `SearchProtocol` — `sourcesActivees`,
`requetesExactes`, `criteresInclusion`, `criteresExclusion`,
`retrievalPolicies`, `disciplinesRetenues` — est construit par
`buildSearchProtocolForMission()` à partir de TEMPLATES codés en dur
dans MONO-08 (`connectorId: "openalex"` fixe, `criteresInclusion:
["Pertinence a la mission."]` fixe, etc.), **JAMAIS dérivé du contenu
réel de la sortie du planner LLM** — que ce contenu soit fourni ou non
via `provenance.plannerRun`. Seul le sous-objet `plannerRuns[0]`
(provider/model/promptVersion/date/hash — la PROVENANCE de l'appel)
reflète des données réellement fournies par l'appelant ; le CONTENU
DÉCISIONNEL que ce même appel LLM est censé avoir produit ne l'est
jamais.

**Preuve directe, reproductible** : `test/test_t08_r2_closure.js`,
M02-01 — deux appels `buildSearchProtocolForMission(mode:"REAL", ...)`
avec des `plannerRun` RÉELLEMENT DIFFÉRENTS (provider/model/hash
distincts, simulant deux appels LLM réels distincts) produisent un
`SearchProtocol` dont `sourcesActivees`/`requetesExactes`/
`criteresInclusion`/`criteresExclusion`/`retrievalPolicies` sont
BYTE-IDENTIQUES. Si ce contenu était réellement dérivé de la sortie du
planner, deux appels réels distincts produiraient nécessairement un
résultat substantiellement différent.

**Classification (mandat R2, section 18)** :

| Champ | Classification |
|---|---|
| `plannerRuns[0].{provider,model,promptVersion,date,inputHash,rawResponseHash}` | **OPERATOR_SUPPLIED** (mode REAL) / **SYNTHETIC** (LOCAL_CONTROLLED) |
| `humanValidation.{validatedAt,commentaire}` | **OPERATOR_SUPPLIED** (mode REAL, corrigé) / **SYNTHETIC** (LOCAL_CONTROLLED) |
| `sourcesActivees`, `requetesExactes`, `criteresInclusion`, `criteresExclusion`, `retrievalPolicies` | **MONO08_CONSTRUCTED** (templates fixes, dans les DEUX modes — jamais `LLM_DERIVED`) |
| `disciplinesRetenues` | **OPERATOR_SUPPLIED** (dérivé de `mission.dimensions`, fourni par l'opérateur en amont — jamais du planner lui-même) |
| `ResolverTrace.resolverRuns[].{provider,model,...}` | **OPERATOR_SUPPLIED** (mode REAL, corrigé) / **SYNTHETIC** (LOCAL_CONTROLLED) |
| `ScreeningArtifact.auditDecisions[].{acteur,justification,date,decision}` | **OPERATOR_SUPPLIED** (mode REAL) / **SYNTHETIC** (LOCAL_CONTROLLED) |

Aucun champ de ce paquet n'est classé `LLM_DERIVED` : MONO-08 ne
reconstruit jamais le contenu réel d'une sortie LLM à partir de ce que
l'opérateur lui fournit comme preuve de provenance — il se contente de
transporter cette preuve à côté d'un contenu qui reste construit par
MONO-08 lui-même. `UNKNOWN` : aucun.

### Pourquoi non corrigé dans ce round

Corriger complètement ce point exigerait de faire accepter à
`buildSearchProtocolForMission()` le CONTENU RÉEL recommandé par le
planner (quelles requêtes, quels connecteurs, quels critères
d'inclusion/exclusion) plutôt que de le construire lui-même par gabarit
— un changement de conception qui touche potentiellement la forme même
de `provenance.plannerRun` attendue par MONO-08, non trivial, et
explicitement HORS PÉRIMÈTRE OBLIGATOIRE de ce round (mandat section
18 : « M-02 n'est pas obligatoirement corrigé architecturalement dans
ce round »).

### Impact sur `REAL_SMOKE_NEXT`

**Règle de gouvernance appliquée (mandat section 28)** : « SI M-02 reste
ouvert ET qu'un artefact revendiqué REAL ne possède toujours pas de
dérivation causale démontrée depuis la provenance réelle qu'il
revendique : `REAL_SMOKE_NEXT = NOT_READY` — cette règle prévaut sur
tout autre résultat vert. »

M-02 reste OUVERT pour le contenu substantiel de `SearchProtocol`
(preuve directe M02-01 ci-dessus). Cette règle s'applique donc
**littéralement et sans exception** :

```
REAL_SMOKE_NEXT = NOT_READY
```

Ceci malgré B-01→B-04 tous `CLOSED` et M-01/M-03 tous `CLOSED` — voir
`11-FINAL-TECHNICAL-VERDICT.md` (mis à jour) pour le verdict complet.
Aucune tentative n'a été faite pour forcer un verdict `READY` (mandat
section 31 : « Ne cherche pas à obtenir READY artificiellement »).

## M-03 — corruption disque silencieuse (`file-durable-backend.js::keys()`)

**Statut : CLOSED.**

- **Constat** : `keys()` absorbait de façon identique et silencieuse
  TOUTE erreur (fichier disparu entre `readdir()`/`readFile()`,
  permission refusée, erreur IO réelle, JSON corrompu) — une corruption
  disque réelle n'était jamais distinguable d'une simple course
  bénigne de suppression concurrente.
- **Correction** : `lib/file-durable-backend.js::keys()` distingue
  désormais explicitement :
  - `ENOENT` sur `readFile()` (fichier disparu entre le `readdir()` et
    ce `readFile()`, ex. `delete()` concurrent) → silencieusement
    ignoré (une clé qui n'existe plus n'est jamais une erreur).
  - toute autre erreur `readFile()` (permission/IO réelle) → **relancée
    explicitement**, jamais absorbée.
  - `JSON.parse` invalide (fichier présent, lu avec succès, contenu
    corrompu) → **relancée explicitement**, jamais traitée comme une
    absence de clé.
- **Correction locale, minimale, dans MONO-08 uniquement** (fichier
  déjà propre à MONO-08 depuis r1, aucun lot gelé concerné).
- **Test** : `test/test_t08_r2_closure.js`, M03-01→M03-05 — cas sain
  (comportement inchangé), suppression concurrente (silencieuse,
  comme avant), corruption JSON réelle injectée (désormais levée
  explicitement, jamais absorbée), messages distincts entre les deux
  causes, revue statique du code.
- **Impact sur `REAL_SMOKE_NEXT`** : aucun — M-03 est `CLOSED`, ne
  contribue pas au `NOT_READY` ci-dessus (qui provient exclusivement de
  M-02).
