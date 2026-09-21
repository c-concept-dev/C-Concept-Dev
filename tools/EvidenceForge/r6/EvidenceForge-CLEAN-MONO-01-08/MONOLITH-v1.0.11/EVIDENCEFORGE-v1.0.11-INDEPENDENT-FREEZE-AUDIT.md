# EVIDENCEFORGE v1.0.11 — AUDIT INDÉPENDANT DE GEL (lecture seule, adversarial)

**Sujet :** `MONOLITH-v1.0.11` (candidat, non commité) = « v1.0.10 + EF-03B LITERALIZATION LINEAGE PRESERVATION ». **Auditeur :** agent indépendant, adversarial, lecture seule, sans contexte antérieur (seul ce qui est lu sur disque fait foi). **Date :** 2026-09-21.
**Coût :** 0 appel fournisseur, 0 réseau, 0 tentative 11, 0 replay, 0 patch. Tests exécutés UNIQUEMENT dans une copie `rsync` sous scratch ; run historique, D103, `ACTIVE_VERSION`, `MONOLITH-v1.0.10`, lots gelés, dépôt git : intacts (preuves § 10).

---

## 0. VERDICT : **V1_0_11_FREEZE_AUDIT_PASS_WITH_RESERVATIONS**

**Recommandation : GELER** (v1.0.11 est gelable ; le gel ne bascule pas `ACTIVE_VERSION`, décision propriétaire distincte). Le correctif du chemin de littéralisation (bloc G) est correct, pur, prouvé (raisonnement + sondes + fuzz 20 000 cas + shadow historique reproduit indépendamment), et n'introduit aucun autre changement de comportement métier. Il ne couvre PAS le chemin de réparation ciblée du lot gelé MONO-11 (passe ≥ 2), où la même perte reste possible et dépend du modèle — ce qui n'est pas un défaut de v1.0.11 mais une lacune du lot gelé, à traiter par un lot séparé (§ 9).

### Bloqueurs
Aucun.

### Réserves (une ligne chacune)
- **R1 — Chemin de réparation ciblée gelée (passe ≥ 2) non protégé** : `rejectedRefsOf` présente TOUTES les refs de la dimension fautive (valides comprises) comme « citation(s) rejetee(s) », la passe 3 les INTERDIT textuellement, `recompose` remplace le tableau entier, aucun validateur ne détecte la perte (sondes P1–P5, § 4). Au run A10, A5081732198 n'a rien perdu parce que le modèle a re-vérifié lui-même les 3 citations. Classification : LINEAGE_PRESERVATION_GAP (lot gelé), MODEL_DEPENDENT, non bloquant.
- **R2 — Comportement `[]` (réparation non littérale écartée)** : contractuel (validateur : « présente ⇒ littérale », jamais « ≥ 1 » ; prompts gelés : « sinon [] », « rendez [] … c'est un resultat valide »), mais il supprime localement une passe 2 gelée qui offrait au modèle le document entier, et l'écart n'est pas compté dans la trace (pas de `droppedRepairedRefs`). Classification : BEHAVIOR_CHANGE_WITH_RESERVATION.
- **R3 — Le registre propage la lignée perdue de l'ère v1.0.10** : `find()` ne filtre pas `schemaVersion` ; une tentative future réutilisant `reviews-valid.jsonl` (ou un import) servirait les 3 revues littéralisées telles quelles, citations perdues incluses. Pas un défaut de v1.0.11 ; note d'exploitation.
- **R4 — T-EF03B-35 chaîne toutes les réparations tracées**, y compris la passe 2 de A5031631835 que v1.0.11 n'aurait PAS déclenchée (candidat déjà VALID après fusion). Ma simulation fidèle au runtime donne le même résultat byte-identique (§ 6), la conclusion tient ; le test « ne rejoue pas la décision de déclencher la passe 2 » (l'auteur le dit, § 7 de son rapport).
- **R5 — Les deux livrables de cet audit ne sont pas dans `MANIFEST.json` / `SHA256SUMS.txt`** (152 fichiers, `contentHash 04afaac9…`) : le gel devra régénérer le manifeste (contentHash changera) ou les exclure explicitement.
- **R6 — Aucun run réel de validation** (déclaré par l'auteur) ; le compteur de trace `lineagePreservedRefs` compte les doublons du brut (informatif seulement).

### Classifications demandées
| section | classification |
|---|---|
| § 3 comportement `[]` | **BEHAVIOR_CHANGE_WITH_RESERVATION** |
| § 4 chemin de réparation ciblée gelée | **LINEAGE_PRESERVATION_GAP** (MODEL_DEPENDENT_BUT_NON_BLOCKING) |
| § 5 v1.0.11 garantit-elle le correctif ? | **YES_TARGETED_REPAIR_PATH** — *literalization path fixed; targeted repair path still unprotected* |

---

## 1. DIFF RÉEL v1.0.10 → v1.0.11 (recalculé : `diff -rq`, `diff -u`, sha256)

`diff -rq MONOLITH-v1.0.10 MONOLITH-v1.0.11 -x node_modules -x .DS_Store` : 13 fichiers modifiés, 3 ajoutés, 2 présents seulement dans v1.0.10 (zip + .sha256 du paquet v1.0.10). Aucun autre écart.

| fichier | sha256 v1.0.10 | sha256 v1.0.11 | nature (vérifiée par `diff -u`) |
|---|---|---|---|
| `lib/ef03b-resilience.js` | `23946c7a5317f99e…` | `18739b7aac108f91…` | **SEUL changement de comportement runtime** : en-tête ; + `isLiteralRef` (l.125), `mergeLiteralRefs` (l.133–139), `preserveLineageRepairs` (l.145–149) ; bloc G l.211–212 `kept = preserveLineageRepairs(v.parsed, rp.repairs, st.ctx.content)` puis `RE.recompose(v.parsed, kept)` (remplace `RE.recompose(v.parsed, rp.repairs)`) ; l.213 champ de trace `lineagePreservedRefs` ; l.156 `schemaVersion` du registre `MONOLITH-v1.0.11` (chaîne, non lue par `find()`) ; exports |
| `lib/pipeline.js` | `ea2dadeb88e05a09…` | `7e2d718bf11efc2e…` | 1 ligne : `schemaVersion: "MONOLITH-v1.0.11"` de `ef03b-resilience.json` |
| `config/monolith.config.json` | `3339894a9db18691…` | `2451b2a5f2994ea1…` | 2 lignes : `$comment`, `product.version` ; **toutes les autres valeurs identiques** |
| `tools/build-manifest.js` | `b187d62965a73a9a…` | `8c9a6469626e9c67…` | 4 lignes : `predecessor` (v1.0.10, zip `9f19e639…`), `ef03b.lineagePreservation`, `provenance`, `status` (chaînes de provenance) |
| `tools/ef03b-autopsy.js` | `ccab1b6ea8813b51…` | `00e244afeb9b3eda…` | 1 ligne : `schemaVersion` du replay hors ligne |
| `tools/package.sh` | `e2b36bc3edce9779…` | `5bb461bb70099577…` | nom du zip v1.0.11 |
| `README.md` | `7423fef528c6d870…` | `9d866155d42e114e…` | +2 lignes : en-tête v1.0.11 |
| `test/test-ef03b.js` | `0ccb5236c301cd10…` | `62e2c335d2a70726…` | en-tête ; `await require("./test-ef03b-lineage.js")(h)` |
| `test/test-stream.js` | `9c208e31ec56af51…` | `aa37e0118fd0921d…` | T-STREAM-20 : version attendue `MONOLITH-v1.0.11` |
| `test/results.json` | `d2c1a658b64288dc…` | `e4c3496ad38a8ff8…` | régénéré (274/274) |
| `test/results-chunking.json` | `da26d7ead7091b4f…` | `35a8d50902d1720e…` | régénéré (21/21) |
| `MANIFEST.json` | `6e73fd9f475c4372…` | `331e2d4ca67503a4…` | régénéré (152 fichiers, `contentHash 04afaac9…`) |
| `SHA256SUMS.txt` | `7e4473a0f3b684e7…` | `e1708a3cef298984…` | régénéré |
| `test/test-ef03b-lineage.js` | — | `7c4922017101569…` | AJOUT : T-EF03B-27…35 |
| `test/fixtures/ef03b-lineage-a10-cases.json` | — | `557b118885ef1d0b…` | AJOUT : fixture anonymisée (§ 7) |
| `EVIDENCEFORGE-v1.0.11-LITERALIZATION-LINEAGE-FIX-AUDIT.md` | — | `2c57ee5f74c114db…` | AJOUT : rapport de lot de l'auteur |

Lots gelés (recalculés par moi, arbre livré) : `shasum -a 256 -c` sur les sceaux propres des lots → MONO-11/v0.3-r1 **52/52 OK** (sceau `9fbef412…`, `core/review-enforcer.js` = `42de4c51daa1e33d…`), MONO-10/v0.19 **79/79 OK** (`e050af05…`, zip canonique `f5a41654…`), MONO-09/v0.2 **9/9 OK** (`f1f1e94b…`), MONO-01 **106/106 OK** (`4ba8903c…`) ; hachage d'arbre livré == copie pour les 4 lots ; `P.verifyFrozenLots()` exécuté depuis le v1.0.11 livré ET depuis la copie : 0 divergence, zips MONO-10 `f5a41654…` / MONO-11 `3c44b397…` conformes à `config.frozenLots`.

`node tools/build-manifest.js --verify` (lecture seule, vérifié dans le code : `verify()` ne fait que lire) dans le v1.0.11 livré : `{"ok":true,"files":152,"bad":[]}` ; contentHash recalculé depuis `SHA256SUMS.txt` = `04afaac9a3ae88442fc93d1a633ac5a00bc51197d0d00dd17cc5a9db11603fab` = annoncé. v1.0.10 livré : `{"ok":true,"files":149,"bad":[]}`.

## 2. INVARIANT DE LITTÉRALISATION

**Code lu** (`lib/ef03b-resilience.js`) : `isStr` l.33 (`typeof v === "string" && v.trim().length > 0`, identique à `review-enforcer.js` l.45) ; `isLiteralRef` l.125 ; `mergeLiteralRefs` l.133–139 ; `preserveLineageRepairs` l.145–149 ; **unique point d'appel** l.211 (bloc G, `preserveLineageRepairs(v.parsed, rp.repairs || {}, st.ctx.content)`) suivi l.212 de `RE.recompose(v.parsed, kept)` — vérifié par grep (1 occurrence) et par T-EF03B-34. Le miroir de la réparation ciblée l.191 reste `RE.recompose(st.parsed, rp.repairs)` (gelé).

**Raisonnement.** `validOriginal = raw.filter(isLiteralRef)` conserve l'ordre brut ; `validRepaired = rep.filter(isLiteralRef)` conserve l'ordre modèle ; `refs` = parcours `validOriginal.concat(validRepaired)` avec `indexOf === -1` ⇒ déduplication stable, première occurrence gagnante. Donc : FINAL ⊇ VALID_ORIGINAL (chaque élément de `validOriginal` est poussé ou déjà présent) ; FINAL ⊆ RAW ∪ REPAIR (rien d'autre n'est lu) ; chaque élément passe `isLiteralRef` ; ordre brut puis modèle ; aucune transformation de chaîne. `preserveLineageRepairs` ne lit que `f.dimensionId` et `f.targetEvidenceRefs`, ne produit que `targetEvidenceRefs`, ne mute pas `parsed`. `RE.recompose` (gelé, l.234–237) fait `Object.assign({}, f, { targetEvidenceRefs })` pour les dimensions réparées et **rend le même objet** pour les autres.

**Sondes node (copie, `probe-merge.js`)** :
- `isLiteralRef` vs contrôle gelé (`!isStr(ref) || content.indexOf(ref) === -1` nié, `content` = chaîne ou `""`) : 17 refs × 5 contenus = **85 sondes, 0 divergence** (`""`, `" "`, `"   "`, `"\n"`, `null`, `undefined`, nombre, objet, tableau, document entier, contenu `""`/`null`/`undefined`). Seule différence théorique : contenu non-chaîne (le gelé prend `""`, l'adaptateur `String(content)`) — inatteignable au point d'appel (`st.ctx.content` est toujours une chaîne extraite du prompt gelé, qui embarque `targetDoc.content` tel quel — `ef-03b-review-runner-v1.js` l.52–53).
- Cas limites : brut répété `[abc,abc,zzz]+[def]` → `[abc,def]` ; sous-chaînes `[abc def, abc]+[abc]` → `[abc def, abc]` ; `["", null, abc]+["", " ", ghi]` → `[abc, ghi]` ; brut `undefined`/réparation `undefined`/réparation non-tableau → jamais d'exception ; contenu `""` ou `null` → `[]` ; ordre `[ghi,abc,zzz]+[def,abc]` → `[ghi,abc,def]` ; réparation littérale hors du brut → ajoutée ; hors document → écartée ; document entier comme ref → conservé.
- **Fuzz 20 000 cas** (tableaux aléatoires sur un pool de 12 jetons dont `""`, `" "`, `null`) : 6 propriétés (⊇ valides, ⊆ union, tout littéral, sans doublon, préfixe = originales valides dédupliquées dans l'ordre, suffixe = réparées valides nouvelles dans l'ordre) : **0 violation**.
- `preserveLineageRepairs` + `RE.recompose` : autres champs copiés (`finding`, `rationale`, `limitations`, clé inconnue `extra`), dimension non réparée = même objet, `parsed` non muté ; dimension inconnue passée en réparation ignorée par `recompose` (et impossible au point d'appel : `parseRepair` restreint aux dimensions fautives).

**Effet collatéral positif (raisonnement, l.211–214)** : sous v1.0.11, `lit` non nul ⇒ `rp.repairs` non vide ⇒ les dimensions réparées n'ont plus d'erreur ⇒ `vl.errors.length < v.errors.length` strictement ⇒ le candidat est toujours remplacé ; la divergence latente v1.0.10 (`mirrorParsed` mettant à jour `st.parsed` sans que `cand` change quand une réparation non littérale laissait le compte d'erreurs égal) ne peut plus se produire.

## 3. COMPORTEMENT « RÉPARATION NON LITTÉRALE ÉCARTÉE » (traité comme un VRAI changement)

**Avant (v1.0.10)** : réparation `""` ou paraphrase → `recompose` inscrit la chaîne → `TARGET_REF_NOT_LITERAL` (`review-enforcer.js` l.90 : `!isStr(ref)`) → candidat invalide → le lot gelé lance la passe 2 `TARGETED_REPAIR` (l.260–271), document entier fourni (l.209–210). **Après (v1.0.11)** : la chaîne est écartée (`droppedRepaired`) ; si la dimension n'a aucune originale valide, elle devient `[]` → valide → acceptée passe 1, pas de passe 2 pour ce motif.

**Contrat et validateurs lus :**
- `validateReviewCandidate` l.89–90 : `TARGET_REFS_NOT_ARRAY` si non-tableau ; sinon pour CHAQUE ref présente `!isStr(ref) || content.indexOf(ref) === -1` → erreur. **Aucune règle de cardinalité minimale.** `DOCUMENTED_WITHOUT_TWIN_REF` (l.94) porte sur `twinBasisWorkRefs` uniquement (sonde P7).
- `enforcementPreamble` l.107 : « targetEvidenceRefs : copie EXACTE … d'un passage du document cible ; **sinon []** ». `targetedRepairPrompt` l.207 : « Si aucune citation litterale adequate n'existe pour une dimension, **rendez [] pour cette dimension (c'est un resultat valide)** ». `buildLiteralizationPrompt` (adaptateur) l.116 : « **ou repondez []** si aucune citation adequate n'existe ».
- Parseur EF-03B gelé (`ef-03b-review-runner-v1.js` l.95, l.100–101) : exige un tableau ; vérifie `contentContainsRef` pour chaque ref ; `[]` accepté (sonde P6 : validateur local ok, parseur gelé OK).
- Agrégation `ef-03c-aggregation-v1.js` l.69, l.159 : union `new Set(flatMap)` — aucune règle de compte. `ef-03d-stability-contradiction-v1.js` l.117–126 `evidenceDependencyReport` (`targetEvidenceRefCount`, `singleTargetEvidenceDependency`, « descriptif, jamais un score de vérité ») ; l.224 `no_target_evidence` dans `notDeterminableReasons` de l'agrégat (union inter-jumeaux) — descriptif, jamais une erreur. `lib/stage-report.js` l.51, l.67 : copie `targetEvidence` ; MONO-11 `composed-qualification.js` / `machine-evidence-gate.js` : aucune règle sur les citations. `OUTPUT_BUDGET.refsMax` (« 1 a 3 citations », l.81–86) n'est utilisé que dans le préambule de FORME (« forme seule ; toutes les exigences ci-dessus restent entieres ») ; **jamais vérifié** (grep : aucune autre occurrence).

**Réponses A–E :**
- **A. Contractuel ?** Oui : `[]` est explicitement prévu par les trois prompts (gelés et adaptateur) et accepté par les deux validateurs gelés ; le préambule « 1 à 3 » est une consigne de forme non vérifiée.
- **B. Invariant « ≥ 1 citation » ?** N'existe nulle part ; seul « toute ref présente ⇒ littérale » existe (l.90 ; parseur l.100–101 ; EF-04 `assertTargetDocumentLineage` l.146–160 idem).
- **C. `[]` peut-il masquer un échec qui déclenchait une réparation ?** Partiellement : une réparation NON littérale et NON vide (paraphrase / fabrication à la littéralisation) est désormais écartée localement au lieu d'être rejetée puis retentée par la passe 2 gelée (document entier). Le résultat accepté reste entièrement validé et `[]` est un état contractuel ; EF-03D l'expose (`targetEvidenceRefCount = 0`, `no_target_evidence` au niveau agrégé). Mais l'écart lui-même n'est pas compté dans `ef03b-trace.jsonl` (seul `lineagePreservedRefs` est ajouté) : il n'est reconstructible que depuis `llm-cache`.
- **D. Qualité de lignée des runs futurs sans erreur ?** Oui, dans les deux sens : moins d'appels (pas de passe 2 pour ce seul motif) mais aussi moins d'occasions pour le modèle de trouver une citation littérale sur le document entier ; inversement la passe 2 gelée était elle-même lossy (R1). Instance historique : A5031631835 — sous v1.0.11, pas de passe 2 ; la passe 2 réelle avait rendu exactement les mêmes chaînes littérales (DISC-03/04) et `[]` (DISC-07) ⇒ résultat final identique, 1 appel de moins (§ 6).
- **E. Intentionnel acceptable ou régression silencieuse ?** Intentionnel et documenté (rapport de l'auteur § 7, mandat « REPAIRED_REFS = réparées qui passent le contrôle »), contractuel, sans perte de ref valide ; mais avec une réserve de qualité et d'observabilité.

**Classification : BEHAVIOR_CHANGE_WITH_RESERVATION** (ni régression — aucun contrat violé, aucune ref valide perdue —, ni purement « attendu » — une occasion de réparation est retirée localement sans compteur de trace).

## 4. CHEMIN DE RÉPARATION CIBLÉE GELÉ (MONO-11 v0.3-r1, passe ≥ 2) — audit seul

**Fonctions (`MONO-11/v0.3-r1/core/review-enforcer.js`, sha `42de4c51…`, inchangé) :** `literalFragments` l.134–147 ; `onlyTargetRefErrors` l.149 ; `faultyDimensions` l.150 ; **`rejectedRefsOf` l.151–156** : `out[d] = arr(byDim[d].targetEvidenceRefs).filter(isStr)` — **toutes** les refs de la dimension fautive, valides comprises (le nom est trompeur) ; `repairContext` l.172–182 ; **`targetedRepairPrompt` l.188–214** : l.191 « Les autres champs et les autres dimensions sont deja valides et CONSERVES tels quels » (**ne dit rien des refs valides de la dimension fautive**), l.198 « citation(s) rejetee(s) : » + `rejected[d]` (donc les valides listées comme rejetées ; leurs `fragments` ont `literal: true` → aucune ligne d'analyse, l.200), l.194 (passe 3, `strategyChange`) « Il est INTERDIT de reutiliser textuellement une citation deja rejetee » — **s'applique aux valides**, et `forbiddenRefs` (`runEnforcedReview` l.267–268) les accumule aussi ; l.207 repli `[]` ; **`parseRepair` l.217–231** : `repairs[d] = r.targetEvidenceRefs` tel quel ; **`recompose` l.234–237** : **remplace le tableau entier** ; `runEnforcedReview` l.289–292 : `recompose(parsed, rp.repairs)` → `validateReviewCandidate` (l.291) → l.313 parseur gelé. Le modèle **peut** omettre les valides ; rien ne les réinjecte ; aucun validateur ne compare avant/après.

**Sondes (copie, `probe-frozen-targeted.js`, lot gelé chargé par `loadSealedMono11`, LLM factice, 0 réseau)** — brut `[VALID_A, VALID_C, INVALID]` :
- P1 : `rejectedRefsOf` = les 3 refs ; **2/3 valides présentées comme « rejetee(s) »**.
- P2 : prompt passe 2 : ligne `citation(s) rejetee(s) : [VALID_A, VALID_C, INVALID]` ; « conserves tels quels » ne vise que les autres champs/dimensions.
- P3 : prompt passe 3 : « INTERDIT de reutiliser textuellement une citation deja rejetee » ; `recompose(parsed, {D1:[VALID_C]})` → `[VALID_C]`, **VALID_A perdue**.
- P4 : `runEnforcedReview` complet, modèle factice rendant `[VALID_C]` en passe 2 → `reviewStatus = complete`, `acceptedPass = 2`, refs finales `[VALID_C]` : **perte d'une ref littérale acceptée par les DEUX validateurs gelés** (aucune détection).
- P5 : modèle rendant `[]` en passe 2 → accepté avec `[]` (2 valides perdues).

**Tests existants :** MONO-11 `test-mono11-v0.3-r1.js` (R2, r1-T6, r1-T7, l.645–781) vérifient l'acceptation/le rejet de recompositions, **jamais la conservation des refs valides** ; v1.0.11 T-EF03B-34 vérifie seulement que le miroir reste `RE.recompose(st.parsed, rp.repairs)`. **Aucun test ne garantit l'invariant sur ce chemin.**

**Run A10, A5081732198 (passe 2, reconstruit depuis `llm-cache`)** : candidat passe 1 DISC-01 = 3 refs, dont 2 valides (« La fiche demande à partir de quand une activité choisie devient difficile. », « réaction pendant l'activité ; ») et 1 non littérale (« terminée comme prevu ou non ; ») ; prompt gelé (`llm-cache/<promptSha>.request.json`) : `citation(s) rejetee(s) : [les 3]` ; réponse (`3b358f65…`) : le modèle écrit « pour les trois citations rejetées », re-vérifie chacune (« → présent tel quel »), exclut la 3e et rend `[les 2 valides]`. **Conservation obtenue par la re-vérification du modèle, pas par le code** : chance/qualité du modèle. A5031631835 (passe 2, DISC-03/04/07) : les refs valides avaient déjà été perdues par le bloc G v1.0.10 (`rejectedRefsOf` = `[]` pour DISC-07) — la passe 2 n'a rien pu conserver.

**Miroir de l'adaptateur (l.191)** : `RE.recompose(st.parsed, rp.repairs)` volontairement identique au gelé, afin que `st.candidates[r.callId]` (inscrit au registre sur `onValidation` valide, l.221) soit **byte-identique** au `candidateText` que le lot gelé valide et remet au parseur EF-03B ; une fusion ici produirait un registre divergent de `reviews.json`. Choix correct sous la contrainte « lot gelé inchangé » (T-EF03B-34 le verrouille).

**Classification : LINEAGE_PRESERVATION_GAP** sur le chemin gelé — MODEL_DEPENDENT_BUT_NON_BLOCKING (aucune corruption démontrée au run A10 ; perte démontrée possible et indétectable par sonde).

## 5. v1.0.11 GARANTIT-ELLE RÉELLEMENT LE CORRECTIF ?

Définition de « perte » retenue : une étape de recomposition **locale** (code) qui retire une ref littérale (au sens du contrôle gelé) présente dans le candidat recomposé. Une régénération complète par le modèle (INFORMED) n'est pas une perte : le candidat précédent n'a jamais été accepté et aucune recomposition locale n'a lieu.

| chemin écrivant `targetEvidenceRefs` | localisation | perte possible après v1.0.11 ? |
|---|---|---|
| Littéralisation (bloc G) | `ef03b-resilience.js` l.207–214 | **NON** (invariant prouvé § 2) — corrigé |
| Réparation ciblée gelée (passe ≥ 2) | `review-enforcer.js` l.289–292, `recompose` l.234 ; miroir adaptateur l.191 | **OUI** (dépend du modèle ; § 4) — non protégé |
| Reprise INFORMÉE gelée (passe ≥ 2, autres codes) | `review-enforcer.js` l.275, `informedRepairPrompt` l.112–122 | non (régénération complète par le modèle, pas de recomposition locale ; la réponse repasse ensuite par A/D/G de l'adaptateur, G désormais préservant) |
| Troncature : sauvetage + complétion + `mergeFindings` | l.198–205, `mergeFindings` l.101–105 | non (findings complets repris byte-identiques ; produits seulement pour les dimensions manquantes, qui n'avaient aucun finding parsable) |
| Réutilisation registre | l.185–189 | non (candidat servi byte-identique à un candidat validé) — mais **propage** une perte antérieure (R3) |

**Réponse : YES_TARGETED_REPAIR_PATH** — *literalization path fixed; targeted repair path still unprotected.*

## 6. SHADOW HISTORIQUE (copie, lecture seule)

- **Suite** : T-EF03B-35 exécuté (non SKIPPED) : « shadow A10 : 70 constats, 7 revues reelles (4 reparees) byte-identiques a reviews-restored.json ».
- **Script indépendant** (`shadow-independent.js`, modules de la COPIE : `review-enforcer.js` gelé + `ef03b-resilience.js` v1.0.11 ; intrants du run lus seulement : `llm-calls.jsonl`, `cost-ledger.jsonl` (attemptId 10), `llm-cache/*.response.json`, `twins.json`, `target-document-set.json` (`target-01`, 1 document), `review-schema.json`, `reviews.json`) : périmètre dérivé du run = 7 revues t.10 (12 appels EF-03B). Deux reconstructions : **(A)** chaîne `preserveLineageRepairs` + `RE.recompose` sur toutes les réparations tracées (= le test) ; **(B)** sémantique runtime v1.0.11 (littéralisation → fusion ; ciblée → `recompose` gelé ; arrêt dès candidat VALID). Résultat : **A = B = `reviews-restored.json` pour 7/7 revues, 70/70 constats** ; **12 citations restaurées = 4 (A5031631835) + 5 (A5084194176) + 3 (A5072236225) + 0 (A5081732198)** ; 3 constats vidés restaurés : `A5031631835/DISC-07`, `A5084194176/DISC-03`, `A5072236225/DISC-06` ; **0 autre champ modifié** (comparaison clé par clé hors `targetEvidenceRefs` avec `reviews.json`). En (B), A5031631835 est VALID dès la fusion de la littéralisation (`[✓,""]`→`[✓]`, `[✓,""]`→`[✓]`, `[""]`→`[originale valide]`) : la passe 2 tracée « n'aurait pas eu lieu » et son contenu (mêmes chaînes, `[]`) n'aurait rien changé.
- Les 7 revues restaurées passent `validateReviewCandidate` (gelé) et `parseReviewResponse` (EF-03B gelé) : 7/7 OK.
- `shasum -a 256 -c SHA256SUMS.txt` de `a10-lineage-restoration/` : 5/5 OK (`reviews-restored.json` = `e5e5daeeb4b0549d…`).
- **Aucune écriture dans le run** : 1 493 fichiers hachés avant/après toute la campagne de tests → `diff` vide ; mtimes/tailles (`stat`) identiques ; aucun nouveau fichier.

## 7. TESTS (copie) vs annoncé

| commande | annoncé | obtenu (copie) | écart |
|---|---|---|---|
| `node test/test-monolith.js` | 274/274 | **274/274** (liste des 274 ids identique à `test/results.json` livré) | aucun |
| `node test/test-chunking.js` | 21/21 | **21/21** | aucun |
| `node tools/secret-scan.js` | 0 | **ok, 154 fichiers, 0 hit** | aucun |
| `node tools/anti-hardcoding-scan.js` | 0 | **ok, 74 fichiers, 0 caseToken, 0 hit** | aucun |
| `node tools/build-manifest.js --verify` (livré) | 152 / `04afaac9…` | **ok, 152 fichiers, contentHash recalculé `04afaac9a3ae…`** | aucun |

T-EF03B-27 … 35 : **9/9 ok** individuellement (T1 preserve valid originals ; T2 all valid ; T3 invalid→valid + `""` écartée + `[]` ; T4 dedup ; T5 multi-dimension ; T6 fixture historique 12 conservées / 3 restaurées ; non-régression sémantique ; pureté/frontière ; shadow exécuté). Aucune écriture hors `EVIDENCEFORGE_RUNS_ROOT` temporaire (les tests utilisent un LLM factice scripté ; le seul « réseau » est un Worker factice sur `127.0.0.1` et `global.fetch` stubbé ; `.env.local` retiré de la copie ; aucune variable d'environnement de clé exportée).

**Fixture `test/fixtures/ef03b-lineage-a10-cases.json`** vs `EVIDENCEFORGE-A10-LINEAGE-RESTORATION-v1.json.restorationTable` (`probe-fixture.js`) : 4 cas ↔ 4 revues dans l'ordre (6/6/3/1 dimensions = 16), `dimensionId` identiques, tailles de `raw` / `repairs[i]` / `expectedFinal` / `persistedA10` / `lostByV110` identiques ; **substitution unique et injective** `S01→CAS-A`, `S02→CAS-B` (4 formes) ; **relations de littéralité préservées** ref par ref (valide historique ⇔ littérale dans le document synthétique, pour le brut et chaque réparation) ; `contentSha256` 4/4 ; jetons réels `S01`/`S02` absents ; propriété « refs non littérales absentes du contenu synthétique » vérifiée.

## 8. VERDICT DE GELABILITÉ

Conditions du mandat : régression → non ; comportement `[]` contraire au contrat → non (contractuel, § 3) ; shadow non reproductible → non (reproduit deux fois, § 6) ; suppression encore possible dans le chemin corrigé → non (§ 2) ; autre changement substantiel → non (§ 1 : chaînes de version, tests, outillage). PASS strict impossible : un autre chemin connu (réparation ciblée gelée) permet la même perte (§ 4–5). **⇒ V1_0_11_FREEZE_AUDIT_PASS_WITH_RESERVATIONS. Recommandation : GELER**, en consignant R1–R6 au gel et en ouvrant le lot § 9.

## 9. LOT PROPOSÉ (non implémenté) — `MONO-11 v0.3-r2` « TARGETED REPAIR LINEAGE PRESERVATION »

- **Frontière** : `MONO-11/v0.3-r1/core/review-enforcer.js` uniquement (nouvelle version scellée v0.3-r2, zip canonique, `config.frozenLots["MONO-11"]` mis à jour dans une v1.0.12) ; prompts EF-03B (MONO-01), validateurs, parseur, contrat `MONO-11-v2` : inchangés.
- **Invariant** : pour toute dimension fautive d'une passe `TARGETED_REPAIR` / `TARGETED_REPAIR_STRATEGY_CHANGE`, `FINAL(d) = dedup(VALID_ORIGINAL(d) ++ VALID_REPAIRED(d))` (même fonction que v1.0.11 ; `VALID` = contrôle l.90) ; corollaire : `forbiddenRefs` et « citation(s) rejetee(s) » ne contiennent que des refs NON littérales ; les refs valides sont listées séparément comme « conservees telles quelles ».
- **Changements** : (1) `rejectedRefsOf` → ne rend que les refs `!isStr || indexOf === -1` (ou expose deux listes `rejected` / `kept`) ; (2) `targetedRepairPrompt` : nouvelle ligne « citations deja litterales, CONSERVEES : […] » ; l.194 ne vise que les rejetées ; (3) `recompose(parsed, repairs, content)` ou un `mergeRepairs` amont : fusion avant remplacement ; (4) `exactRepeat` / `repeatedFaultyRef` calculés sur les seules refs non littérales.
- **Tests** : miroir de T1–T5 sur `runEnforcedReview` avec LLM factice omettant les valides en passe 2 et en passe 3 (`[]`, sous-ensemble, doublons) ; reprise des fixtures R1..R6/S1..S5 (rejeu identique) ; sonde P4/P5 de cet audit comme cas de non-régression ; fixture A5081732198 (prompt/réponse en cache) : résultat identique.
- **Dépendances / impact** : MONO-11 est gelé par décision de gouvernance 2026-09-16 → audit + gel séparés (Charte v2) ; v1.0.12 = v1.0.11 + bascule `frozenLots.MONO-11` + `loadSealedMono11` (`MANIFEST.version` attendu par `run-seal-guard`) ; le miroir l.191 de l'adaptateur devra suivre la même fonction pour rester byte-identique ; registre : `sourceSealHash` change ⇒ aucune réutilisation inter-sceau (comportement existant). **Alternative sans toucher au lot** : garde de lignée dans l'adaptateur (branche `isTargeted`, l.191) réécrivant le JSON `{repairs}` remis au lot gelé avec `preserveLineageRepairs(st.parsed, …)` — garantit l'invariant mais ne corrige ni l'étiquette « rejetee(s) » ni l'INTERDIT de la passe 3 (qualité/coût) ; à réserver si v0.3-r2 est refusé.
- **Impact sur le gel v1.0.11** : aucun — v1.0.11 est gelable telle quelle ; R1 reste une réserve consignée jusqu'au lot.

## 10. CONTRAINTES RESPECTÉES ET VÉRIFICATION FINALE

- Copie `rsync -a` (hors `runs-test`, `*.zip`, `.DS_Store`, `node_modules`) sous `…/scratchpad/audit-v1011/EvidenceForge/` ; `.env.local` supprimé de la copie ; zips canoniques MONO-10 v0.19 / MONO-11 v0.3-r1 / v1.0.10 copiés dans la copie (exigés par `run-seal-guard`) ; tous les tests et sondes exécutés dans la copie.
- Livré `MONOLITH-v1.0.11` : 154 fichiers hachés avant l'audit ; après écriture des deux livrables, seuls ces deux fichiers sont nouveaux ; `lib/ef03b-resilience.js` = `18739b7aac108f915edef04d53001d33e072c48b8a0f74497e4fca6bc4b76487` avant et après ; `--verify` ok 152/152 (les livrables ne sont pas listés — R5).
- `MONOLITH-v1.0.10` : 153 fichiers hachés avant/après identiques ; `--verify` ok 149/149 ; `ACTIVE_VERSION` = `MONOLITH-v1.0.10` (sha `81333261…`) ; git : seul `?? …/MONOLITH-v1.0.11/` ; run `efm-20260918-a64167c0` (1 493 fichiers) et D103 `jmmjs-p01-closure` (151 fichiers) : hachages identiques avant/après.
- Livrables : ce fichier et `EVIDENCEFORGE-v1.0.11-INDEPENDENT-FREEZE-AUDIT.json` (même dossier). Scratch : `shadow-independent.js`, `shadow-independent-result.json`, `probe-frozen-targeted.js`, `probe-merge.js`, `probe-fixture.js`, journaux de tests.
