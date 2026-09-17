# MONO-10 v0.19 — DOC-19 BEFORE-TOKEN COVERAGE & MEASUREMENT CONSISTENCY

**Statut : PROPOSÉ À L'AUDIT FINAL DE GEL. NON GELÉ.**
Le statut `GELABLE` / `NON_GELABLE` n'appartient pas à ce lot (CHARTE §19).

## Ce que ce lot est

Un successeur **strictement documentaire** de v0.18 — qui l'était de v0.17, de
v0.16, de v0.15, de v0.14, de v0.13, de v0.12 et de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée.** Un appelant de v0.11 n'a rien à modifier.

`RUNTIME_BYTE_IDENTICAL_TO_V011 = YES`, `RUNTIME_BYTE_IDENTICAL_TO_V012 = YES`,
`RUNTIME_BYTE_IDENTICAL_TO_V013 = YES`, `RUNTIME_BYTE_IDENTICAL_TO_V014 = YES`,
`RUNTIME_BYTE_IDENTICAL_TO_V015 = YES`, `RUNTIME_BYTE_IDENTICAL_TO_V016 = YES`,
`RUNTIME_BYTE_IDENTICAL_TO_V017 = YES` **et** `RUNTIME_BYTE_IDENTICAL_TO_V018 = YES`,
vérifiables en quatre-vingt-seize `diff` (douze chemins × huit lots,
`NON-REGRESSION.md` §1). La **Charte** reste byte-identique.

## Pourquoi il existe

Neuf audits indépendants se sont succédé. Les deux premiers ont conclu que
v0.11 ne comportait **aucun blocage de sécurité**, tout en établissant qu'elle
portait comme vérité des affirmations fausses — ce que v0.12 a corrigé. Le
troisième, audit final de v0.12, a rendu `NON_GELABLE` pour deux affirmations
fausses résiduelles — ce que v0.13 a corrigé. Le quatrième, audit final de
v0.13, a rendu `NON_GELABLE` une fois encore : **toujours aucun bloqueur
runtime**, mais **huit affirmations documentaires connues fausses** (KF-1 à
KF-8) et **quatre détecteurs incomplets ou contournables** (F1 à F4) — ce que
v0.14 a corrigé. Le cinquième, audit final de v0.14, a rendu `NON_GELABLE`
pour **deux résidus documentaires** (B1, B2) et des **lacunes de détecteurs** —
ce que v0.15 a corrigé. Le sixième, audit final de v0.15, a rendu
`NON_GELABLE` pour **deux bloqueurs documentaires** — un détecteur (`DOC-03`)
dont le témoin passait pour une mauvaise raison, et un heading périmé dans la
matrice — ce que v0.16 a corrigé. Le septième, audit final de v0.16, a rendu
`NON_GELABLE` pour **deux titres d'origine faux** (deux documents titrés v0.7
dont le contenu date de v0.10) et **un statut périmé** — ce que v0.17 a
corrigé. Le huitième, audit final de v0.17, a rendu `NON_GELABLE` pour **un
détecteur non causal** : `DOC-19` ne mordait pas sur la faute réelle de v0.16
réinjectée verbatim, parce qu'un marqueur générique « à l'époque » était
évalué avant le couplage de version et la détection de « depuis » — et quatre
documents affirmaient le contraire — ce que v0.18 a corrigé. Le neuvième, audit
final de v0.18, a rendu `NON_GELABLE` pour **une couverture incomplète** de la
continuité placée **avant** un ancien token (26/32 : `\b` ne précède jamais
« à », et « depuis » manquait), la **claim** correspondante, et **trois nombres
saisis ou périmés** dans le `MANIFEST` et le `README`. Toujours **sans aucun
bloqueur runtime**.

Le principe qui commande ce lot est le même, appliqué une fois de plus :

> `unknown remains unknown` — et son corollaire, qui manquait :
> **`known false must not remain stated as true`.**

| Affirmation de v0.11 | Réalité mesurée | Corrigé dans |
|---|---|---|
| « l'appelant peut dégrader une préparation, il ne peut pas l'améliorer » | faux à la couche `assertReadinessPhase` ; vrai de bout en bout | `READINESS.md` |
| la certification garantirait la véracité de l'artefact | elle garantit le **sujet** et l'**empreinte**, pas le reste | `ARTIFACT-REGISTRY-TRUST.md` |
| `callerTransportIgnored` présenté comme une garantie | contrôle **auto-défaisant** : l'effacer fait passer, l'honnêteté fait échouer | `LLM-CAPABILITY-BOUNDARY.md` |
| `LLM_SUBJECT_OUT_OF_ALLOWLIST` présenté comme le code observé | branche inatteignable ; garantie **comportementale** | `THREAT-MODEL.md` |
| `SEALED_REFERENCE_DIVERGENCES = 0` | **9** divergences, toutes antérieures à v0.11 | `NON-REGRESSION.md` |
| `UNVERIFIABLE_HISTORICAL_LOTS = 9` | **0** — ces lots sont scellés dans `manifest/`, souvent sans extension | `NON-REGRESSION.md` |
| 14 lots scellés, 514 références | **24** lots, **1 577** références (cadre v0.11) | `tools/seal-inventory.js` |

### Ce que v0.13 corrigeait en plus, et que v0.12 avait manqué

| # | Où | Affirmation de v0.12 | Réalité |
|---|---|---|---|
| **B1** | `governance/README.md` | « `UNVERIFIABLE_HISTORICAL_LOTS = 9` maintenu, non dissimulé », donné comme **valeur courante** | valeur courante **0** ; ce qui reste non dissimulé, ce sont les **9 divergences** de 2 lots |
| **B2** | `LLM-CAPABILITY-BOUNDARY.md` §3 | « le fait qu'il ait essayé est inscrit dans l'artefact », sans qualification | qualifié **sur place** : traçabilité déclarative, pas autorité critique |

`governance/README.md` avait échappé à v0.12 parce que ses détecteurs ne
balayaient que la **racine**. Le balayage est désormais récursif — c'est la
correction la plus importante de ce lot, parce qu'elle porte sur la méthode et
non sur une phrase.

Cinq glissements mineurs étaient corrigés par la même occasion : nombre de réserves
(« quatre » au lieu de cinq), nombre d'hypothèses divergent entre README et
`MANIFEST`, cadre non nommé d'une mesure de fenêtre, collision d'étiquettes
`V011-R1`…`V011-R5` (résidus fermés) contre `R1`…`R5` (réserves ouvertes), et une section insérée
au milieu d'une liste. Détail : `MIGRATION-v0.12-v0.13.md` §3.

### Ce que v0.14 corrigeait, et que v0.13 avait manqué ou mal fait

| # | Où | Affirmation de v0.13 | Réalité |
|---|---|---|---|
| **KF-1** | `governance/README.md` | « cinq hypothèses déclarées » | **six**, dans README comme dans `MANIFEST` ; désormais comptées (`DOC-11`) |
| **KF-2** | quatre documents / `MANIFEST` | « treize » champs non attestés d'un côté, « douze » de l'autre | **douze** champs nommés, dérivés d'une énumération canonique (`DOC-02`, `DOC-12`) |
| **KF-3** | `NON-REGRESSION.md` §2 | « 35 sceaux / 3 127 références » donnés comme total courant | total de l'arbre de v0.12 ; le total courant est **mesuré après scellement**, cadre nommé (`DOC-05`, `DOC-13`) |
| **KF-4** | `NON-REGRESSION.md` §2 | commande `seal-inventory.js <racine> MONO-10/v0.11` annoncée à 24 / 1 577, alors qu'elle rend 26 / 1 720 dans l'arbre de v0.13 | la commande imprimée exclut désormais **tous** les lots MONO-10 postérieurs, et elle est **rejouée** par `DOC-13` |
| **KF-5** | `THREAT-MODEL.md` | « la section de correction devient §7 » — mais six puces de §6 restaient sous §7 | puces réellement déplacées ; structure vérifiée (`DOC-14`) |
| **KF-6** | `MANIFEST.json` | `governance/` dans `runtimeIdentityProof.paths` alors que `governance/README.md` est hors périmètre et diffère de v0.11 | le `MANIFEST` reflète la décision réelle : la Charte seule (`DOC-16`) |
| **KF-7** | `MANIFEST.json` | référence à `test/test-mono10-v0.12-documentary.js`, absent | tout chemin référencé existe (`DOC-15`) |
| **KF-8** | `MANIFEST.json` | `knownFalseStatementsRemaining = 0` pré-rempli | dérivé **après** tous les contrôles (`DOC-17`) |

Et quatre détecteurs durcis ou ajoutés — F1 : `DOC-04` mordait sur la section,
pas sur la phrase ; F2 : `DOC-08` se satisfaisait d'un mot-clé ; F3 : aucun
`.json` n'était balayé ; F4 : `DOC-03` était contournable — plus les quatre
détecteurs obligatoires D-A à D-D. Détail : `MIGRATION-v0.13-v0.14.md`.

### Ce que v0.15 corrigeait, et que v0.14 avait laissé

| # | Où | Résidu de v0.14 | Ce que v0.15 a fait |
|---|---|---|---|
| **B1** | `OPEN-FINDINGS.md` R4 | « 24 lots historiques scellés / 1 577 références » au présent, sans cadre — dans l'arbre livré, le cadre v0.14 mesurait 27 / 1 787 | R4 nommait le **cadre historique v0.11** (24 / 1 577) et le cadre courant d'alors, **cadre v0.15** (28 / 1 860, mesuré après scellement de v0.15) ; `DOC-05` refuse désormais tout chiffre de cadre cité sans son cadre, en phrase, tableau, puce, parenthèse, gras ou JSON |
| **B2** | `MANIFEST.json` | `v014BuildWindowOpened` saisi à la main, ne correspondant à aucune mesure | méthode canonique documentée (`NON-REGRESSION.md` §7 : mtime minimal des fichiers du lot, hors zip, arrondi à la seconde paire), valeur **dérivée** des mtimes portés par `MANIFEST.files`, commande publiée et rejouée (`DOC-13`), détecteur causal `DOC-20` |
| — | `AUDIT-REMEDIATION-MATRIX.md` §4 | chiffres de v0.9 sous un heading « Mesures » non versionné | heading « Mesures historiques v0.9 » ; `DOC-21` exige une version sur toute section « Mesures » d'un registre multi-versions |
| — | détecteurs | `DOC-03` « se trouvent? » (bug de regex), `DOC-04` sans flexions, `DOC-09` sans « au nombre de N », `DOC-14` aveugle aux déplacements séparés par des lignes vides | fermés, chacun avec ses témoins ; `DOC-14` compare désormais à une **structure déclarée** (`MANIFEST.documentStructure`). Détail : `MIGRATION-v0.14-v0.15.md` |

### Ce que v0.16 corrigeait, et que v0.15 avait laissé

| # | Où | Bloqueur ou lacune de v0.15 | Ce que v0.16 fait |
|---|---|---|---|
| **B1** | `DOC-03` | le quantificateur **post-verbal** (« les champs sont tous attestés ») n'était pas détecté : l'alternative ajoutée en v0.15 n'était atteignable qu'après un quantificateur pré-verbal, où l'ancien patron mordait déjà — le témoin passait pour une mauvaise raison | patron `(sont\|figurent\|se trouvent\|restent\|demeurent) tou(s\|tes) (attest\|prouv\|garanti\|certifi)…` ; les **cinq phrases manquées** par l'audit sont des témoins exacts, plus « Les données sont toutes prouvées. » — 21 variantes au total |
| **B2** | `AUDIT-REMEDIATION-MATRIX.md` | des lignes corrigées en v0.15 étaient placées sous le heading « v0.13 et v0.14 » et la colonne « Statut en v0.14 » | nouveau §11 « v0.15 et v0.16 », colonne « Statut en v0.16 » ; `DOC-22` refuse toute ligne postérieure à son heading ou à sa colonne |
| — | `DOC-11` / `DOC-12` | chiffres en gras (« **cinq** hypothèses ») invisibles | reconnus, témoins ajoutés |
| — | `DOC-15` | nom de fichier racine pointé invisible | reconnu ; un fichier racine réel à nom pointé (`AUDIT-VERDICTS.v0.12-v0.16.md`) est balayé (`SCAN-04`) et sert de témoin |
| — | `COH-01` | simple comptage « ≥ 5 » | `DOC-23` : chaque ligne R1..R5 vérifiée individuellement ; R5 passée à `CLOSED` → `FAIL` |
| — | `DOC-05` | chiffre **faux mais cadré** invisible | comparé aux valeurs de chaque cadre du `MANIFEST` (elles-mêmes mesurées) ; « cadre v0.12 : 26 lots » → `FAIL` |
| — | titres | `LLM-CAPABILITY-BOUNDARY.md` titré v0.14 ; `READINESS`, `CAPABILITY-AUTHORITIES`, `REPLAY-PROTECTION` titrés v0.11/v0.12 alors que corrigés depuis | `DOC-24` : tout document modifié depuis v0.11 porte la version courante et sa version d'origine ; les documents byte-identiques à v0.11 sont déclarés (`MANIFEST.originTitledDocuments`) et vérifiés (`RT-08`) |
| — | « six champs » / « sept dimensions » | deux objets différents, non expliqués | `DOC-25` dérive du code `SUBJECT_FIELDS` (6, +2 à la certification = 8) et `REQUIRED` (7, + `executionMode`) et exige que `OPEN-FINDINGS.md` R1 et `LLM-CAPABILITY-BOUNDARY.md` les énumèrent et les distinguent |

Détail : `MIGRATION-v0.15-v0.16.md`.

### Ce que v0.17 corrigeait, et que v0.16 avait laissé

| # | Où | Bloqueur ou lacune de v0.16 | Ce que v0.17 fait |
|---|---|---|---|
| **B1 / B3** | `HISTORICAL-INPUT-AUTHORITY.md`, `LINEAGE.md`, `MANIFEST.originTitledDocuments` | titrés « MONO-10 v0.7 » et déclarés d'origine v0.7 ; leur contenu courant apparaît pour la première fois en **v0.10** (byte-identique de v0.10 à v0.17) — `RT-08` ne comparait qu'à v0.11 et `DOC-24` croyait le H1 | **mesuré** sur les seize lots scellés : chaque entrée déclare l'origine **conceptuelle** (le H1, v0.7) et l'origine **de contenu** (v0.10), le chemin, les deux empreintes et le verdict byte-identique ; `DOC-24` compare au **lot nommé** et re-mesure le premier lot identique ; les deux fichiers ne sont pas réécrits (leur contenu reste celui de v0.10) |
| **B2** | `MIGRATION-v0.13-v0.14.md` | le token `NOT_FIXED_IN_V015` suivi du mot « depuis » — ancien token présenté comme courant | « à l'époque de v0.NN : `NOT_FIXED_IN_V0NN` ; statut courant dans `OPEN-FINDINGS.md` », dans les trois migrations. *v0.17 prétendait aussi que `DOC-19` refusait « depuis » et exigeait le même NN : l'audit final de v0.17 a montré que c'était faux — voir ci-dessous* |
| — | H1 « (contenu de vX, corrigé en vY) » | parenthèses écrites à la main, fausses pour `TRUST-MODEL.md` et `ARTIFACT-REGISTRY-TRUST.md` (modifiés aussi en v0.13, et en fait à chaque lot) | parenthèses retirées ; l'historique de **chaque** document est mesuré sur les lots (`MANIFEST.documentHistory`) et re-mesuré par `DOC-27` ; `NON-REGRESSION.md` §8 le rend lisible |
| — | `DOC-22` | un heading faux était masqué par une colonne juste | bornes de heading et de colonne vérifiées séparément |
| — | `DOC-25`, `DOC-06` | satisfaits par un mot-clé | énumérations comparées comme **ensembles** au code (`artifactHash` retiré → `FAIL`, « plus `executionMode` » retiré → `FAIL`) ; non-imputabilité lue comme une **négation** (« sont imputables à v0.11 » → `FAIL`) |

Détail : `MIGRATION-v0.16-v0.17.md`.

### Ce que v0.18 corrigeait, et que v0.17 avait laissé

| # | Où | Bloqueur ou lacune de v0.17 | Ce que v0.18 fait |
|---|---|---|---|
| **B1** | `DOC-19` | **non causal** : la faute réelle de v0.16 (`MIGRATION-v0.13-v0.14.md:102`, le token `NOT_FIXED_IN_V015` suivi du mot « depuis » après « à l'époque de v0.14 ») réinjectée verbatim donnait **0 hit**. Cause : `isCitedBefore` contenait « à l'époque » et était évalué **avant** le couplage de version et la détection de « depuis » — une faute était blanchie comme « citation historique ». Les claims de `README.md`, `AUDIT-REMEDIATION-MATRIX.md`, `MANIFEST` et `MIGRATION-v0.16-v0.17.md` §3 (« même NN », « depuis refusé ») étaient donc fausses | **ordre impératif** : (1) toute formulation de continuité **adjacente** au token → `FAIL` — *v0.18 le promettait pour les huit mots avant comme après le token, mais son motif avant-token en manquait deux (« à ce jour », « depuis ») : mesuré 26/32 par l'audit final de v0.18, corrigé en v0.19* ; (2) version du cadre (« à l'époque de v0.MM », « dans le cadre v0.MM ») ≠ version du token → `FAIL` ; cadre couplé sans continuité → `PASS` ; (3) seulement ensuite une citation adjacente (« … », annonçait, `was`) — « à l'époque » seul n'exempte plus rien. Témoin **obligatoire** : la faute B2 de v0.16 verbatim, dans `MIGRATION-v0.13-v0.14.md` ; sept variantes adversariales ; trois contrôles `PASS` |
| — | `DOC-25` | retirer « plus `executionMode` » de R1, ou ajouter une dimension fantôme après lui, passait | « plus `executionMode` » exigé dans R1 comme dans `LLM-CAPABILITY-BOUNDARY.md` ; rien d'autre que `requestId` ne peut suivre ; la permutation d'ordre passe (ensembles) |
| — | gloss `LINEAGE.md` | « conçu en v0.7 » alors que le fichier existe depuis v0.1 | trois notions distinguées et **mesurées** : première apparition (`firstAppearedIn`, v0.1 pour `LINEAGE.md`), version du H1 (origine conceptuelle, v0.7), origine de contenu (v0.10) |
| — | `MANIFEST.correctedStatements` B2 | un seul `where` mêlant la faute exacte et les recadrages préventifs | `historicalFaultLocation`, `preventiveReframings`, `textFixLocation`, `detectorFixLocation` distingués (v0.18 écrivait ici une clé inexistante, `fixLocation` — corrigé en v0.19, contrôle `DOC-29`) |

Détail : `MIGRATION-v0.17-v0.18.md`.

### Ce que v0.19 corrige, et que v0.18 avait laissé

| # | Où | Bloqueur ou lacune de v0.18 | Ce que v0.19 fait |
|---|---|---|---|
| **B1** | `DOC-19` | continuité **avant** le token : 26/32 — le motif utilisait `\b`, qui ne précède jamais un caractère non ASCII (« à ce jour »), et omettait « depuis » | frontières Unicode `(?<![\p{L}])` / `(?![\p{L}])` avec le drapeau `u`, les huit mots dans les deux motifs ; **32 témoins** : huit mots × {cadre couplé, citation explicite} × {avant, après}, tous `FAIL` ; **4 contrôles** `PASS` (dont « Dans le cadre v0.14 : `NOT_FIXED_IN_V014` ») |
| **B2** | `README.md`, `MIGRATION-v0.17-v0.18.md` | promettaient le refus avant-token pour les huit mots | claims réécrites pour dire ce qui est testé ; la claim de v0.18 est annotée comme invalidée |
| **B3** | `README.md` | clé `fixLocation` inexistante | `textFixLocation` / `detectorFixLocation` ; `DOC-29` : tout identifiant cité comme clé du `MANIFEST` doit y exister |
| **B4** | `MANIFEST.measurements.documentaryChecks` | « 94 témoins » saisi (113 mesurés) | `documentaryMeasurements` **dérivé du run** par le constructeur (détecteurs, témoins, contrôles, témoins `needsLots`, `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT`, `PASS_AFTER_REVERT`) ; `DOC-28` re-dérive les grandeurs statiques de la structure des détecteurs, `MEAS-01` compare les dynamiques au run ; témoins : `witnessCount` −1, `passControlCount` +1, `detectorCount` faux, prose du README → `FAIL` |
| **B5** | `MANIFEST.documentHistoryNote` | « v0.1..v0.16 » périmé | plage **mesurée** (`documentHistoryMeasuredRange`) et nommée dans la note ; `DOC-27` la compare aux lots joignables |
| — | `DOC-06` | localisation au mot-clé | le tableau de R4 est comparé lot par lot et fichier par fichier à `MANIFEST.sealInventory.divergences` (mesuré) ; limite restante documentée `NON_BLOCKING` |

Détail : `MIGRATION-v0.18-v0.19.md`. Registre des verdicts : `AUDIT-VERDICTS.v0.12-v0.19.md`.

## Mesures

| Mesure | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V012` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V013` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V014` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V015` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V016` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V017` | **YES** (12 chemins) |
| `RUNTIME_BYTE_IDENTICAL_TO_V018` | **YES** (12 chemins) — 96 comparaisons vides au total |
| `CHARTE_BYTE_IDENTICAL` | **YES** — condition de la décision de périmètre, pas conséquence |
| Fichiers ajoutés au périmètre exécutable | 2, aucun participant : un outil de mesure en lecture seule, une suite documentaire |
| `SEALED_HISTORICAL_LOTS_COUNT` | **24** cadre v0.11 · **25** cadre v0.12 · **26** cadre v0.13 · **27** cadre v0.14 · **28** cadre v0.15 · **29** cadre v0.16 · **30** cadre v0.17 · **31** cadre v0.18 · **32** cadre v0.19 |
| `SEALED_REFERENCES_COUNT` | **1 577** cadre v0.11 · **1 644** cadre v0.12 · **1 715** cadre v0.13 · **1 787** cadre v0.14 · **1 860** cadre v0.15 · **1 934** cadre v0.16 · **2 010** cadre v0.17 · **2 087** cadre v0.18 · **2 165** cadre v0.19 |
| `ALL_SEALS_FILE_COUNT` / `ALL_SEALS_REFERENCE_COUNT` | **43** / **3 727**, arbre complet au scellement de v0.19, mesuré après scellement (`NON-REGRESSION.md` §2) |
| `BUILD_WINDOW_OPENED` (v0.19) | dérivé, jamais saisi : `NON-REGRESSION.md` §7, `MANIFEST.sealInventory.v019BuildWindowOpened`, contrôle `DOC-20` |
| Provenance documentaire | mesurée sur les dix-huit lots scellés (plage mesurée dans `MANIFEST.documentHistoryMeasuredRange`) : `MANIFEST.originTitledDocuments` (9 documents à titre d'origine, dont 2 à origine de contenu v0.10) et `MANIFEST.documentHistory` (tous les `.md`), contrôles `DOC-24`, `DOC-27`, `RT-08` |
| `SEALED_DIVERGENCES` | **9** — `MONO-07` ×1, `MONO-08/v0.6` ×8, **antérieures** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | **0** |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | **NO**, et ce restera NO tant que ces 9 divergences subsisteront |
| `MONO10_V11_CAUSED_REGRESSION` | **NO**, désormais soutenu sur le bon périmètre |
| Contrôles documentaires | **28 / 28** (DOC-01 à DOC-25, DOC-27 à DOC-29), chacun avec `PASS_CLEAN` / `FAIL_SINGLE_TARGET_FAULT` / `PASS_AFTER_REVERT` sur le document réel ; nombres de témoins et de contrôles **dérivés du run** (`MANIFEST.measurements.documentaryMeasurements`, `DOC-28`, `MEAS-01`) |
| Variantes de sur-promesse d'attestation attrapées | **21 / 21** (`ATTESTATION_OVERCLAIM_VARIANTS_CAUGHT = ALL`), dont les cinq phrases post-verbales manquées par l'audit de v0.15 |
| Réserves ouvertes consignées | **5** (R1–R5), toutes `OPEN` / `NON_BLOCKING` / `NOT_FIXED_IN_V019` |
| `NETWORK_CALLS`, `REAL_LLM_CALLS`, `REAL_EF02_RUNS`, `REAL_PROFESSIONAL_RUNS`, `REAL_HUMAN_ACTS` | 0 |

## Ce que ce lot NE garantit PAS

Cette section est la raison d'être du lot. Elle est écrite pour être lue **avant**
les garanties.

1. **Une préparation artificiellement améliorée est acceptée par
   `assertReadinessPhase`** dans trois variantes. Elle n'atteint ni `QUALIFIED`
   ni `AUTHORIZED` — mais l'API publique est plus permissive que son
   consommateur critique, ce qui contredit une règle que le lot s'impose. (`OPEN-FINDINGS.md` R2)
2. **Une capacité peut être certifiée avec un `probeStatus` mensonger.** Le
   mensonge ne franchit aucune couche critique, et aucun sujet jamais sondé ne
   devient utilisable. (`OPEN-FINDINGS.md` R1)
3. **Douze champs de l'artefact de capacité LLM ne sont pas attestés**, et le
   schéma n'est pas fermé. Aucun consommateur critique ne les lit. (`OPEN-FINDINGS.md` R3)
4. **Neuf divergences de sceau subsistent** dans `MONO-07` et `MONO-08/v0.6`.
   v0.19 ne les corrige pas. (`OPEN-FINDINGS.md` R4)
5. **`LLM_SUBJECT_OUT_OF_ALLOWLIST` est inatteignable.** La garantie est
   comportementale : un sujet hors liste blanche n'est pas utilisable. (`OPEN-FINDINGS.md` R5)

Détail intégral, avec la couche qui compense chacune : `OPEN-FINDINGS.md`.

## Ce que v0.11 garantissait, et qui reste vrai

Rien n'a été retiré au produit. Les fermetures de v0.8 à v0.11 tiennent, et les
deux audits indépendants les ont éprouvées : aucun émetteur accessible à
l'appelant ; aucune dérivation inventée acceptée ; aucun ré-étiquetage de
fournisseur, modèle, worker ou artefact ; une sonde ne certifie qu'un artefact ;
un vérificateur de TEST n'authentifie rien d'un run de PRODUCTION ; aucune
validation ne se désactive par omission de son contexte ; le chemin positif hors
ligne aboutit à `QUALIFIED` / `AUTHORIZED` en traversant le vrai consumer
MONO-09 v0.2.

## Hypothèses déclarées

1. Qui peut écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou les fichiers qu'il
   désigne obtient une frontière de PRODUCTION (`TRUST-MODEL.md` §7).
2. Deux fichiers de configuration réellement distincts sont deux racines ; deux
   alias du même fichier sont la même racine. Un **renommage** ouvre une
   nouvelle génération : l'anti-rejeu ne la traverse pas
   (`REPLAY-PROTECTION.md`).
3. Le plafond de statut de préparation est une **borne supérieure** —
   **et l'asymétrie « dégrader seulement » n'est vraie que de bout en bout**,
   pas à la couche d'assertion (`READINESS.md`).
4. La garde de contrats couvre des **énumérations**, pas la prose
   (`CONTRACT-GUARD.md` §6). C'est précisément pourquoi les faussetés corrigées
   ici ont survécu plusieurs versions : aucun contrôle automatique ne les voyait.
   `test/test-mono10-v0.19-documentary.js` en couvre désormais vingt-huit,
   récursivement, sur les `.md` et les `.json`.
5. Le lot ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
6. Une capacité certifiée n'est pas un artefact intégralement prouvé : la
   décision atteste le **sujet** et l'**empreinte**, pas les champs informatifs.

## Lecture

`OPEN-FINDINGS.md` **d'abord** → `MIGRATION-v0.18-v0.19.md` → `MIGRATION-v0.17-v0.18.md` →
`MIGRATION-v0.16-v0.17.md` → `MIGRATION-v0.15-v0.16.md` → `MIGRATION-v0.14-v0.15.md` →
`MIGRATION-v0.13-v0.14.md` → `MIGRATION-v0.12-v0.13.md` → `MIGRATION-v0.11-v0.12.md` →
`AUDIT-VERDICTS.v0.12-v0.19.md` →
`NON-REGRESSION.md` → `ARCHITECTURE.md` → `TRUST-MODEL.md` →
`CAPABILITY-AUTHORITIES.md` → `LLM-CAPABILITY-BOUNDARY.md` → `READINESS.md` →
`ARTIFACT-REGISTRY-TRUST.md` → `UPSTREAM-EVIDENCE-BINDING.md` →
`HISTORICAL-INPUT-AUTHORITY.md` → `REPLAY-PROTECTION.md` → `CONTRACT-GUARD.md` →
`LINEAGE.md` → `RUN-ORDER.md` → `THREAT-MODEL.md` → `KEY-MANAGEMENT.md` →
`HUMAN-ACT-AUTHENTICATION.md` → `AUDIT-REMEDIATION-MATRIX.md` →
`CONTRACT-MAPPING.md`.
