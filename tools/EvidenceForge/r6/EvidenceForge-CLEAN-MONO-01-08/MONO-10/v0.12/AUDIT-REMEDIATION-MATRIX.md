# MONO-10 v0.12 — matrice de remédiation

## 0. v0.12 — ce que DEUX audits indépendants ont établi sur v0.11

v0.11 a été audité par deux sessions qui ne l'avaient pas écrite, et qui ne se
connaissaient pas l'une l'autre. **Aucune des deux n'a trouvé de blocage de
sécurité.** Les deux ont trouvé des faussetés documentaires, et la seconde a
trouvé des mesures fausses que ni l'implémenteur ni la première n'avaient vues.

| Constat | Établi par | Statut en v0.12 |
|---|---|---|
| asymétrie de préparation fausse à la couche d'assertion | Audit A, confirmé et étendu par Audit B (3 variantes) | **documenté par couche**, non corrigé dans le code — R2 |
| résultat de sonde déclaré non confronté | Audit A (R1), mesuré à froid par Audit B | **documenté**, non corrigé — R1 |
| champs informatifs non attestés | Audit A (5 champs), étendu à **13** par Audit B | **énumérés**, non corrigés — R3 |
| `callerTransportIgnored` auto-défaisant | Audit B | **documenté comme traçabilité**, non corrigé — R3 |
| `LLM_SUBJECT_OUT_OF_ALLOWLIST` inatteignable | Audit B | **garantie reformulée**, branche non corrigée — R5 |
| mesures de sceaux fausses (4 chiffres) | Audit B, après une correction partielle d'Audit A | **corrigées et rejouables** — R4 |

### Ce que la séquence des audits enseigne, et qu'il faut inscrire

Trois cycles d'auto-audit menés par l'implémenteur n'ont pas trouvé ce que deux
sessions indépendantes ont trouvé en une passe chacune. Sur la non-régression,
l'implémenteur s'est trompé **trois fois de suite** en croyant mesurer : il n'a
jamais cherché les sceaux ailleurs qu'à la racine des lots, sous le seul nom
`SHA256SUMS.txt`. L'Audit A a corrigé partiellement — il a trouvé le sceau de
`MONO-00`, avec extension, pas les autres. L'Audit B, en cherchant
récursivement les deux noms, a trouvé les 24.

La leçon n'est pas qu'il faut mieux mesurer. Elle est qu'**un implémenteur ne
peut pas auditer son propre périmètre de mesure** : il reproduit son angle mort
à chaque passage. C'est un argument de méthode, et il appartient au dossier de
gel autant que les chiffres.

## 0 bis. Rappel — v0.11 : les quatre constats reproduits sur v0.10 (§2 du lot précédent)

Reproduits sur le lot **historique v0.10, chargé en lecture seule**, dans un run
légitime, avec un exploitant n'autorisant qu'un seul triplet.

```
B10-01  sonde legitime               -> AVAILABLE  requestId=ref-0437c0a2
        B10-01-A-provider            -> certified=true  usable=true
        B10-01-B-model               -> certified=true  usable=true
        B10-01-C-worker              -> certified=true  usable=true
        B10-01-D-artefact            -> certified=true  usable=true
B10-02  artefact FABRIQUE + ctx vide -> usable=true
B10-03  registre authentifie, opts.verifier ABSENT -> ACCEPTE
B10-04  code REELLEMENT atteint      -> CAPABILITY_ISSUER_INVALID
        CAPABILITY_DERIVATION_UNVERIFIABLE atteint ? false
```

| Constat | Reproduction sur v0.10 | Fermeture v0.11 |
|---|---|---|
| **B10-01-A/B/C** ré-étiquetage fournisseur / modèle / worker | REPRODUIT — `certified = true`, `usable = true`, hors liste blanche | sujet reconstruit depuis l'artefact et confronté au sujet réellement sondé ; liste blanche ré-appliquée — `LLM_SUBJECT_MISMATCH`, `LLM_SUBJECT_OUT_OF_ALLOWLIST` |
| **B10-01-D** une sonde pour plusieurs artefacts | REPRODUIT — une sonde certifie 4 artefacts | `LLM_PROBE_ALREADY_CONSUMED` ; décision portant `artifactId`, `artifactHash`, `decisionSubjectHash` |
| **B10-02** validation hors contexte | REPRODUIT — `usable = true` avec `{}` | contexte complet exigé dans tous les espaces |
| **B10-03** sécurité par argument optionnel | REPRODUIT — acceptation sans vérificateur | `READINESS_VERIFIER_REQUIRED` ; `qualifyProcess` corrigé |
| **B10-04** test non discriminant | REPRODUIT — la garde de dérivation n'était jamais atteinte | T30–T37 l'atteignent par une autorité de TEST émettant dans son propre espace |

### Précision honnête sur la reproduction de B10-01-D

Dans mon script de reproduction, le vecteur D « réussissait » aussi sur v0.11
tant que les vecteurs A/B/C échouaient avant lui : la sonde n'ayant alors jamais
été consommée, D en était la **première** certification, donc légitime. Le
vecteur n'était pas pertinent tel que je l'avais écrit. Le test correct —
certifier un artefact, **puis** en présenter un second — donne :

```
v0.10  cap-1 certifie=true | cap-2 (MEME sonde, AUTRE artefact) certifie=true  usable=true
v0.11  cap-1 certifie=true | cap-2 certifie=false | LLM_PROBE_ALREADY_CONSUMED
```

## 0 bis. Rappel — v0.10 : les deux brèches reproduites sur v0.9 (§2 du lot précédent)

Les deux brèches ont été **reproduites sur le lot historique v0.9, chargé en
lecture seule**, dans un run légitime, avant toute correction.

```
B1A_issuer   verifier.provenanceAuthority() accessible : true
             l'autorite OFFICIELLE sur ma racine : UNRESOLVED
B1A_grant    capacites de doc-1 = ["RUN_BOUND","AUTHENTICATED_PROVENANCE"]
             derivationRef acceptee = "je-decrete-que-cest-authentifie"
B1A_ident    confiance = MODERATE
B1A_panel    evaluation = PRESENT_FOR_HUMAN_REVIEW | refs ecartees = 0
B1C          verifier.llmCapabilityBoundary() accessible : true
             octroi = ACCEPTE | usable = false
B2_verif     verificateur TEST reel : namespace=TEST | marque = true
B2_prov      provenance sur registre PRODUCTION via verificateur TEST :
             AUTHENTICATED (authorityRootId=MOI-1)
B2_ident     confiance = STRONG
```

| Brèche | Reproduction sur v0.9 | Fermeture v0.10 |
|---|---|---|
| **B1-A** frappe libre + émetteur atteignable | REPRODUIT — `AUTHENTICATED_PROVENANCE` concédée avec `derivationRef: "je-decrete-que-cest-authentifie"`, puis `PRESENT_FOR_HUMAN_REVIEW` avec **0 référence écartée** | émetteurs retirés de la surface (`ACCESSIBLE_ISSUER_COUNT = 0`, balayage réel) ; registre de décisions par émetteur ; `CAPABILITY_DERIVATION_UNVERIFIABLE` |
| **B1-B** chaîne complète jusqu'à `AUTHORIZED` | **NON reproduit par mon harnais** — voir §0 bis ci-dessous |
| **B1-C** capacité LLM concédée sans sonde | REPRODUIT **à la frappe** (`ACCEPTE` avec `derivationRef: "probe:jamais-execute"`), mais `usable = false` en aval : la brèche portait sur l'émission, pas sur l'usage | `probeDerivationRef` inscrite par la sonde réelle ; `certifyLlmCapability` ; `assertCapabilityUsable` vérifie la décision |
| **B2** vérificateur de TEST réel sur run de PRODUCTION | REPRODUIT — `AUTHENTICATED` puis `STRONG` avec les racines de l'appelant | comparaison contre le **contexte attendu**, pas contre le vérificateur ; `PROVENANCE_VERIFIER_CONTEXT_MISMATCH` ; contexte incomplet = refus |

### §0 bis — ce que je n'ai pas réussi à reproduire, dit tel quel

Le mandat demandait de prouver la chaîne complète **si possible**. B1-B — aller
jusqu'à `AUTHORIZED` — ne s'est **pas** reproduit avec mon harnais : la fixture
exécute `assessCandidates` à l'intérieur de `buildChain`, avant toute concession
tardive côté appelant, si bien que les concessions forgées arrivaient trop tard
(`INSUFFICIENT_DOCUMENTARY_BASIS`, corpus 0, `NOT_QUALIFIED`).

Je le consigne comme **non reproduit**, pas comme fermé : l'ordre d'exécution de
ma fixture n'est pas une propriété de sécurité du lot. B1-A est reproduit
jusqu'à `PRESENT_FOR_HUMAN_REVIEW` inclus, avec 0 référence écartée, et c'est
déjà un effet critique : un humain se voit présenter une preuve que l'autorité
de l'exploitant ne reconnaît pas.

## 1. Rappel — reproduction v0.8 → v0.9 (§2 du lot précédent)

Chaque résidu confirmé par l'audit A clean-room de v0.8 a été **reproduit sur le
lot historique v0.8, chargé en lecture seule**, dans un run légitime.

| Résidu | Reproduction sur v0.8 | Fermeture v0.9 |
|---|---|---|
| **R1** identité de frontière déclarative | REPRODUIT — deux configurations déclarant `operatorTrustBoundaryId = "MEME-ID"`, `configBindingHash` différents ; l'autorité de A acceptée sous l'identité de B, capacité émise sur le run de B pour une racine que B ignore (`UNRESOLVED`) | identité **composite** comparée par chaque consommateur ; `configBindingHash` obligatoire à l'émission ; engagé par le manifeste |
| **R2** ancre `path.resolve` | REPRODUIT — ancre du chemin réel ≠ ancre du symlink | `realpathSync` + identité d'inode, pour l'ancre **et** l'emplacement de la réserve |
| **R3** vérificateur fourni par l'appelant | REPRODUIT — `{operatorTrustBoundaryId, provenanceAuthority()}` → `AUTHENTICATED`, `STRONG`, `PRESENT_FOR_HUMAN_REVIEW` avec les étiquettes de l'appelant | seul un vérificateur marqué désigne l'autorité ; `policy.identity.*` refusée ; seuils narrow-only |
| **R4** `assertCapabilityUsable` hors registre | REPRODUIT en variante (c) — registre présent, artefact **non enregistré** → `usable = true` | registre authentifié + artefact enregistré + concession tracée + identité composite |
| **R5** registre de forme | REPRODUIT — `{get, has, entries}` fabriqué → `FULL` acceptée | `isAuthenticatedRegistry` + run + mission + frontière |
| **R6/R7** surface | REPRODUIT — `createAcceptanceBoundary`, `__resetProcessNamespaceRegistry` exportés, `opts.envVar` accepté | exports retirés ; `TRUST_ENV_VAR_REFUSED` |

**R4, précision honnête** : la formulation du mandat (« usable=true sur artifact
non enregistré / non lié ») ne se reproduisait pas dans la variante « sans
registre » — v0.8 y répondait déjà `usable = false`. Elle se reproduisait dans
la variante « registre présent, artefact absent », parce que le contrôle était
conditionné à la présence de sa cible. Un contrôle conditionné à l'existence de
ce qu'il doit vérifier n'est pas un contrôle.

## 2. Deux défauts trouvés dans ma propre correction

| Symptôme | Diagnostic |
|---|---|
| `T08`/`T10` échouaient après la correction R2 | `trustConfigAnchorOf` résolvait le chemin canonique, mais `reserveDirectoryFor` utilisait encore `path.resolve` : même ancre, deux **répertoires**. Corrigé des deux côtés. |
| `T04`/`M05` attendaient `AUTHORITY_CONFIG_BINDING_MISMATCH` au registre | un écart de run levait d'abord `CAPABILITY_GRANT_MISBOUND` et masquait le diagnostic. La comparaison de frontière a été placée **en premier** : une concession venue d'une autre configuration doit être nommée comme telle. |

## 3. Qualité des tests corrigée (§25)

| Test | Correction |
|---|---|
| `NR-02` dépendance externe | devient `T33`, auto-suffisant ; **SKIP motivé** si les lots amont ne sont pas joignables — aucun `PASS` n'est émis à la place |
| `I-27` libellé trompeur | devient `T34` : assertion sur la présence effective de `unauthenticatedEvidenceRefs` dans chaque évaluation |
| `I-28` assertion vacuous | devient `T35` : la clé exposée par la frontière est inspectée en profondeur — au moins un champ public présent, aucun champ privé |

Aucun de ces correctifs n'a modifié le produit.

## 4. Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 88 PASS / 0 FAIL |
| Mutations | 35 / 35 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 36 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Helpers internes exposés | 0 |
| Lots historiques modifiés | 0 |


## 5. v0.10 — défauts trouvés dans ma propre correction

| Symptôme | Diagnostic |
|---|---|
| `OTV.isOperatorTrustVerifier is not a function` | `operator-trust-verifier` requérait `authenticated-artifact-registry` au sommet, qui dépend de lui par `run-evidence-manifest` : cycle de chargement, prédicat de confiance indéfini pendant le cycle. Les deux requires sont devenus **tardifs**. Un contrôle de confiance qui devient indéfini en silence est pire qu'absent. |
| `T13` échouait alors que la dérivation était réelle | ma suite construisait **deux** frontières depuis la même configuration : deux jeux d'émetteurs, donc deux registres de décisions. La suite partage désormais une seule frontière. Le produit n'a pas été modifié. |
| `T26`/`T27` : `policyNarrowedOnly` inversé | ma condition testait `demandé <= plancher` au lieu de `demandé >= plancher`. Corrigé dans le produit. |
| `T39` : capacité utilisable sans vérificateur | **défaut réel, pas défaut de test.** `RM.isProductionContext(ctx)` exige un vérificateur marqué : retirer `ctx.verifier` faisait sauter les neuf contrôles de production d'un coup. L'appelant désactivait le contrôle en retirant ce qui sert à le faire. Ce que la capacité **prétend** est désormais lu sur l'artefact et le registre. |
| `N3` levait au lieu de rendre un verdict | `certify*` propageait l'exception de la frappe. Les trois certifications rendent maintenant un **verdict**. |
| `T45` faisait tomber la suite | provisionner la configuration renommée dans le même processus lève `REPLAY_NAMESPACE_CONFLICT` — comportement **correct**. Le test affirme désormais que le changement de génération est **détecté**, ce qui est une propriété plus forte que ce que j'avais écrit d'abord. |

## 6. v0.10 — ce qui n'est pas une vulnérabilité, et pourquoi je le dis

| Constat | Pourquoi ce n'en est pas une |
|---|---|
| `operator-trust-verifier.js` exporte `__build` | seule remise interne du lot, nommée dans HYG-09. Appelée avec des émetteurs d'appelant : `VERIFIER_ISSUER_FOREIGN`. Appelée sans émetteur : vérificateur **stérile**. T06/T07 le prouvent. |
| `verifier.provenanceAuthorityId()` rend une chaîne | un identifiant n'est pas un émetteur ; T04 le vérifie en passant cette chaîne au prédicat d'origine, qui rend `false`. |
| le renommage de la configuration ouvre une nouvelle génération anti-rejeu | décision explicite, documentée dans REPLAY-PROTECTION.md, dans la TCB déjà déclarée, et **détectée** — pas absorbée en silence. |
| `PRODUCTION_LLM_CAPABILITY` n'est pas émise en espace TEST | un transport de test ne prouve aucune capacité de production. `certifyLlmCapability` rend un refus motivé. |


## 7. v0.11 — défauts trouvés dans ma propre correction

| Symptôme | Diagnostic |
|---|---|
| `qualifyProcess` échouait après l'ajout de `READINESS_VERIFIER_REQUIRED` | **défaut réel, pas défaut de test.** Le consommateur critique appelait lui-même `assertReadinessPhase` **sans vérificateur** : il empruntait le chemin faible que l'audit A a exploité. Il transmet désormais `verifier` et `manifest`. |
| `T06` (requestId emprunté) et `T14` (deux sondes isolées) échouaient | le transport de référence dérive `requestId` de l'intention : deux sondes de même intention dans le même run sont **la même** sonde, et mes deux essais n'étaient donc pas distincts. Tests réécrits avec un `requestId` venu d'un autre run et deux triplets réellement différents. Le produit n'a pas été modifié. |
| le vecteur B10-01-D semblait subsister | ordre de mon script : voir §0 ci-dessus. Le produit refuse bien la seconde certification. |

## 8. v0.11 — ce qui n'est pas une vulnérabilité, et pourquoi je le dis

| Constat | Pourquoi ce n'en est pas une |
|---|---|
| re-certifier **le même** artefact rend `certified = true` une seconde fois | idempotence voulue : même `artifactId`, même `artifactHash`, donc même sujet. Un artefact différent est refusé (T04, T05). |
| deux sondes de même intention dans un même run partagent une `probeRef` | elles décrivent le même sujet au même instant : ce sont la même sonde. Deux sujets distincts donnent deux `probeRef` et deux `decisionSubjectHash` (T14). |
| `createTest*Authority` reste public et rend un émetteur marqué | un émetteur de TEST n'émet que dans son propre espace pseudo-frontière ; il est refusé par `__build`, par `certifyProvenance` et par tout consommateur de PRODUCTION (v0.10, toujours vrai). C'est ce qui rend T30–T37 possibles sans affaiblir la production. |


## 9. v0.12 — aucune correction de code, par construction

Ce lot ne corrige **aucun** défaut de comportement. Il corrige des affirmations.

| Ce qui aurait pu être « corrigé » | Pourquoi v0.12 ne le fait pas |
|---|---|
| adosser `DIMENSION_STATUS_CEILING.llmCapability` à `assertCapabilityUsable` | changerait le comportement d'une API publique — hors mandat d'un lot documentaire |
| confronter `probeStatus` déclaré au résultat enregistré | ajouterait une sécurité — explicitement interdit ici |
| fermer le schéma de l'artefact de capacité | changerait le comportement de l'enregistrement |
| rendre `LLM_SUBJECT_OUT_OF_ALLOWLIST` atteignable, ou le retirer | modifierait `core/` |
| corriger `NR-01` pour qu'il cherche récursivement | modifierait un fichier de test, donc romprait la preuve d'identité octet à octet |

Les cinq relèvent d'un successeur **additif** ultérieur. Les inscrire ici comme
résolus serait exactement la faute que ce lot corrige.

`NR-01` mérite un mot : sa liste de 14 chemins est **exacte dans son
périmètre** — ces 14 lots vérifient bien 0 divergence — et sous-déclarée hors de
lui. Ne pas y toucher est un choix assumé : la mesure juste vit dans
`tools/seal-inventory.js`, et l'identité du runtime vaut plus qu'un chiffre
rendu exact dans un fichier de test.
