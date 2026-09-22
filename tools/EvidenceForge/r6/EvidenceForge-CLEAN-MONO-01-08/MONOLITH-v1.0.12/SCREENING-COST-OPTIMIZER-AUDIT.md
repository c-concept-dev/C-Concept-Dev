# AUDIT — SCREENING COST OPTIMIZER (MONOLITH-v1.0.5, 2026-09-17, baseline `74ad0eb2`, run `efm-20260917-5ad77c88`, 0 USD)

## 1. Autopsie du code réel du screening (lecture intégrale, aucun lot gelé impliqué)
| Élément | Où | Constat |
|---|---|---|
| Construction des lots | `lib/screening-evidence.js` `buildScreeningEvidence` : doublons déterministes retirés (`detectDuplicates` : DOI / providerId / titre normalisé), puis lots de `config.screening.batchSize` (8) dans l'ordre des sources | 180 sources → 3 doublons → 177 jugées → 23 lots (22 × 8 + 1 × 1) |
| Prompt | `batchPrompt` : en-tête (rôle, mission, 8 angles avec définition, règles, schéma) + une ligne JSON par source `{sourceId, titre, annee, lieu, resume (≤ 900 car.), requete}` | en-tête ≈ 1 200 tokens répété 23 fois ; ≈ 215 tokens d'entrée par source ; sortie demandée : decision, justification (« une phrase concrète »), evidence (fragments EXACTS du titre ou du résumé, tableau non borné), confiance |
| Validateur | `validateBatch` : JSON (clôture ``` tolérée), clés fermées, sourceId du lot, unicité, decision ∈ {inclus, exclu}, justification non vide, **evidence : `hay.indexOf(ev) !== -1` sur `titre + "\n" + resume`** (sous-chaîne littérale, sensible à la casse, aux accents, aux apostrophes/guillemets typographiques), confiance ∈ {haute, moyenne, basse}, chaque source présente | toute différence de forme = refus de l'item = refus du lot |
| Reprise informée | boucle `p = 1..maxPasses (3)` : passe 2 = « REPRISE — réponse précédente refusée : <≤ 12 erreurs> + prompt complet + RÉPONSE PRÉCÉDENTE (≤ 12 000 car.) » ; `purpose: screening informed-retry` | **le lot entier repart** (8 sources) pour 1–3 items ; entrée ≈ 4 000 tokens, sortie ≈ 1 100 tokens ; aucune fusion passe 1 / passe 2 : la dernière réponse valide remplace tout |
| Fusion passe 1 / passe 2 | aucune | 108 décisions re-jugées pour 2 changements réels sur le run |
| Revue de portefeuille | `lib/corpus-portfolio-review.js` : partie déterministe (redondance TF-IDF, couverture, diversité) + partie LLM sur les sources **proposées exclues avec résumé** (`judgeable`), lots de `llmBatchSize` (12), même validateur littéral, même reprise de lot entier | 92 exclues → 80 avec résumé → 7 lots → 51 « candidats méthode hors domaine » (64 % des jugées : signal peu sélectif) ; **0 renversement** à la ratification |
| Coût | `lib/llm.js` → `cost-ledger` (REAL_CALL par appel, purpose/pass) ; aucun cache de prompt (une seule `messages[user]` chaîne, `lib/llm-transport.js`) ; réutilisation MONO-11 par hash du prompt entier (0 sur ce run : mission nouvelle) | 42 appels, 160 816 entrée / 56 700 sortie, **1,333 USD** (sortie 64 %) |
| Points de reprise | screening et revue s'exécutent dans RETRIEVAL avant la Porte 2 ; un arrêt pendant le screening rejoue tout le screening à la reprise (les prompts identiques sont réutilisés à coût 0) | — |
| Consommateurs de la sortie | Porte 2 (`index.html` : proposition, justification, **2 premières evidence** seulement, confiance) ; `buildAuditDecisions` (décision + justification → décisions humaines MONO-08) ; revue de portefeuille (proposed, justification) ; ratification hachée (`evidenceSha256`) | les fragments au-delà de 2 ne sont jamais montrés ; `lieu` est affiché à l'utilisateur et fourni au modèle |

## 2. Matrice ERREUR → CAUSE → REPRISE ACTUELLE → CORRECTIF DÉTERMINISTE → RISQUE → ÉCONOMIE (24 items refusés, 12 reprises, 0,461 USD)
| # | Erreur (items) | Cause | Reprise actuelle | Correctif déterministe | Risque | Économie estimée |
|---|---|---|---|---|---|---|
| 1 | evidence absente (15) | forme : casse, accents (NFD/NFC), apostrophes/guillemets typographiques, ponctuation, espaces ; le fragment EST dans le texte réel sous forme canonique | lot entier re-jugé | **SCREENING-EVIDENCE-NORMALIZATION-v1** : correspondance de séquence après canonisation de forme, puis **récupération du fragment littéral réel** (projection des positions canoniques vers l'original) ; trace {original, canonique, littéral, champ, hashes} | nul sur le fond : l'evidence rendue est un fragment réel du champ ; aucune paraphrase, aucun synonyme, aucun LLM | 5 reprises sur 12 entièrement évitées (0,183 USD) ; 15/24 items |
| 2 | evidence = nom de revue (6) | le prompt fournit `lieu` comme donnée et l'en-tête du module déclare le lieu de publication parmi les métadonnées de décision, mais le validateur ne vérifie que titre + résumé | lot entier re-jugé | **`lieu` accepté comme champ de preuve vérifiable** (fragment littéral ou canonique du champ `lieu`, champ enregistré) — décision documentée §3 | nul : donnée réelle OpenAlex (`primary_location`), vérifiée littéralement, tracée | avec #1 : 10 reprises sur 12 évitées (≈ 0,40 USD) ; 21/24 items |
| 3 | paraphrase réelle (2) | le modèle reformule ou tronque | lot entier | **aucun** (refus maintenu, principe de gouvernance) ; reprise **ciblée** sur l'item seul | — | reprise résiduelle à ≈ 25 % du coût d'une reprise de lot |
| 4 | énumération hors contrat (1 : `moyenne`) | valeur inventée | lot entier | refus maintenu ; reprise **ciblée** | — | idem |
| 5 | (non observé) JSON invalide / source manquante / clé inconnue | forme de réponse | lot entier | JSON invalide ⇒ lot entier (inévitable) ; source manquante ⇒ ciblée sur les manquantes ; clé racine ou clé d'item inconnue ⇒ **ignorée si le reste est valide ?** non : conservé comme refus d'item (schéma fermé), ciblé | — | — |
| 6 | sortie longue (64 % du coût) | justification ≈ 235 car., evidence 2–8 fragments (2 affichés) | — | bornes dans le prompt (justification ≤ 160 car., ≤ 2 fragments ≤ 80 car.) ; **jamais un motif de refus** (sinon reprises) | style plus sec ; à mesurer en réel | −28 % (screening) / −33 % (portefeuille) de sortie **estimés** sur les réponses réelles (proxy caractères) ≈ 0,26 USD |
| 7 | en-tête répété (43 % de l'entrée screening) | lots de 8 | — | cache de prompt (changement de forme de requête + contrat worker + reuse gelé par hash de prompt) ou lots plus grands (non testable sans appel réel) | validité JSON des grands lots inconnue ; contrat worker | ≈ 0,05–0,07 USD ; **non implémenté** |
| 8 | revue de portefeuille : 80 sources jugées, 51 candidats, 0 renversement | périmètre = toutes les exclues avec résumé | — | pré-filtres déterministes (doublons DOI/providerId/titre parmi les exclues : 0 sur ce run) + **périmètre configurable** (défaut inchangé), décision produit | réduction de signal si périmètre restreint | 0 (déterministe) ; jusqu'à 0,4 USD selon périmètre choisi (produit) |

## 3. Décision `lieu` (Phase B)
Contrats gelés consultés : MONO-08 (POST_RETRIEVAL_GATE, décisions humaines : acteur, identité, justification, exhaustivité — **aucune notion
d'evidence ni de champ**) ; MONO-05/07 (artefacts, `driveRun`) : rien sur le screening machine. Le contrat du module monolithe
(`screening-evidence.js`, en-tête) déclare que la proposition est « fondée sur les métadonnées réelles de chaque source (titre, résumé si
présent, année, **lieu de publication**, lignée de requête) ». La règle du prompt (« fragments EXACTS copiés du titre ou du résumé ») et le
validateur (titre + résumé) sont donc **plus étroits que le contrat déclaré**, et le modèle cite ce qu'on lui montre. **Option A retenue** :
`lieu` devient un champ de preuve vérifiable (littéral ou canonique), le champ d'origine est enregistré pour chaque evidence, et le prompt
le dit explicitement. Le titre, le résumé et le lieu sont des données réelles de provenance journalisée (OpenAlex) ; `annee` et `requete`
restent informatifs (non citables comme preuve : une année n'est pas une preuve documentaire de pertinence).

## 4. Architecture retenue (phases A–F, chacune testée et mesurée par rejeu)
- **A** `lib/screening-normalization.js` (nouveau, pur) : `canonicalize`, `findLiteral(field, evidence)` → `{ literal, start, end, normalized }`,
  `verifyEvidence(source, evidence, fields)` → `{ ok, field, literal, normalized, original, canonical, originalSha256, literalSha256 }`,
  règle `SCREENING-EVIDENCE-NORMALIZATION-v1`. Utilisé par les deux validateurs ; les propositions rendues portent l'**evidence littérale
  réelle** et `evidenceNormalization[]` (trace), la réponse brute reste dans `llm-cache`.
- **B** champs de preuve `["titre", "resume", "lieu"]` (config `screening.evidenceFields`, défaut), prompt aligné.
- **C** `RETRY_ONLY_INVALID_ITEMS` : le validateur rend `perItem` ; passe 2+ = prompt ciblé (en-tête + items invalides + erreurs exactes +
  entrées précédentes de ces items) ; les items valides de la passe 1 sont **immuables** (hash) ; recomposition dans l'ordre du lot ; lignée
  `batches[].items[] { sourceId, pass, originalBatchId, previousDecisionHash, newDecisionHash, validationErrors }`. Erreurs de niveau lot
  (JSON invalide, `decisions[]` absent) ⇒ reprise du lot entier comme avant.
- **D** bornes de sortie dans le prompt (config `screening.outputBounds`, jamais un motif de refus).
- **E** non implémenté (cache de prompt : contrat worker + reuse gelé ; batchSize : validité JSON non simulable) ; `batchSize` inchangé.
- **F** pré-filtre déterministe des exclues (doublons) + `portfolio.llmScope` configurable, défaut `ALL_EXCLUDED_WITH_ABSTRACT` (inchangé).
