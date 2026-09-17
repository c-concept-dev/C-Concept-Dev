# RAPPORT — PANEL SUFFICIENCY POLICY v2 (MONOLITH-v1.0.5, 2026-09-17, à partir du commit 9ea66c4)

Audit complet avant tout code : `AUDIT-PANEL-SUFFICIENCY-POLICY.md` (autopsie de la règle v1, verdict sur le « 3 », signaux
d'indépendance disponibles, mesures sur le run réel `cf6101c7`). Aucun lot gelé, aucun kit, aucune porte humaine, aucun run
historique touchés. **Aucun run réel payant lancé pour ce chantier (0 USD).**

## 1. Autopsie (résumé — détail dans l'audit)
| Question | Constat sur v1 (9ea66c4) |
|---|---|
| Où la policy est injectée | config `professionals.earlyStop` → `runPanel` → `createSufficiencyTracker` ; aucune surcharge par variable d'environnement |
| Valeurs utilisées | `targetAdmissiblePerDimension 3`, plateau (fenêtre max(10, 2×angles), grâce 2×angles), `closeOnPlateau false` |
| Dimension « satisfaite » | `admissible ≥ 3`, **admissible = SUPPORTED avant le gate**, compté sur la **dimension primaire** du candidat (pas les dimensions soutenues : ≠ définition G-6 du gate gelé) |
| Vivier épuisé | `remaining === 0`, décrémenté par les évaluations **et** les non-évaluations ; les parcours à vide après verrou de transport comptaient comme des évaluations |
| CONFIRMED | `every(admissible ≥ 3 ∥ remaining === 0)` ⇒ **un angle à 0 admissible + vivier épuisé contribuait à PANEL_SUFFICIENT** (PRO-EARLY-02 entérinait ce comportement) |
| Reprise / budget | déterministe (rejeu à coût 0) ; budget prioritaire (verrou avant `shouldEvaluate`) — conservés |

## 2. Verdict sur `targetAdmissiblePerDimension = 3`
- **Justifié et dérivable : le plancher 2.** Lu dans le lot gelé MONO-01 EF-03C (`ef-03c-aggregation-v1.js`, invariant
  anti-mono-jumeau : `twinRefs.length < 2` ⇒ convergence rejetée). Un angle représenté par un seul professionnel ne peut produire
  aucun constat établi. C'est un **CONTRACTUAL_FLOOR**, exposé dans chaque décision, **impossible à abaisser par configuration** (SUFF-12).
- **Arbitraire : la marge (3 au lieu de 2)**, le comptage par dimension primaire, le comptage avant le gate, l'absence d'indépendance.
  Aucune dérivation « fraction du vivier » n'est défendable (options B/C rejetées : taux d'admission 3,5 %–10 % sans relation avec
  la taille du vivier ; toute formule serait inventée).
- **Ce qui reste une policy produit : la marge.** Elle est conservée à 3 (« un admis peut ne pas donner de jumeau », 13/15 sur cf6101c7)
  mais **nommée et tracée** comme telle : `minimumAdmissibleRepresentativesPerDimension`, `provenance: PRODUCT_POLICY`, jamais
  présentée comme seuil scientifique. Le 3 n'est ni remplacé par 2 ni par 4.

## 3. Politique retenue — `PANEL-SUFFICIENCY-v2`, stratégie `MIN_INDEPENDENT_REPRESENTATION` (option D + E)
```json
"earlyStop": { "enabled": true, "policy": { "id": "PANEL-SUFFICIENCY-v2", "strategy": "MIN_INDEPENDENT_REPRESENTATION", "provenance": "PRODUCT_POLICY",
  "minimumAdmissibleRepresentativesPerDimension": 3, "minimumIndependentRepresentativesPerDimension": 2,
  "independence": ["SUPPORTING_WORKS", "SEED_SOURCES"], "closeDimensionWhenSufficient": true,
  "plateau": { "minEvaluatedPerDimension": 3, "windowFactor": 2, "windowMin": 10, "graceFactor": 2, "closeOnPlateau": false } } }
```
- **Représentation d'un angle** = candidats **approuvés par le gate gelé** (`MEG.gateCandidate`, fonction pure, appelée candidat par
  candidat avec exactement les entrées de `gatePanel` ; jamais « SUPPORTED » seul) dont la pertinence soutient l'angle (définition G-6).
- **Indépendance** (le critère prioritaire du chantier) : deux représentants sont indépendants s'ils ne partagent **aucune œuvre citée
  pour l'angle** (identité `workRef` OpenAlex > DOI > titre canonique) **et aucune source-graine** (`seedReferences[].providerWorkId`).
  Nombre d'indépendants = plus grand ensemble deux à deux indépendants construit gloutonnement dans l'ordre d'évaluation (déterministe).
  **3 approuvés adossés à la même œuvre = 3 représentants, 1 indépendant ⇒ non suffisant** (SUFF-02). Un représentant sans œuvre
  identifiable n'est jamais compté indépendant (SUFF-13). La normalisation typographique ne change pas la cardinalité (SUFF-14).
- **Angle SUFFISANT** ⇔ représentants ≥ 3 (policy) **et** indépendants ≥ 2 (plancher). Fermeture d'angle uniquement sur SUFFISANT.
- **Aucun appel LLM ajouté** (SUFF-09 : `lib/panel-sufficiency.js` sans `require`, sans réseau). Budget prioritaire inchangé (SUFF-07).

## 4. États
| Angle | Sens |
|---|---|
| `DIMENSION_CONTINUE` | vivier restant, pas encore suffisant |
| `DIMENSION_SUFFICIENT` | ≥ 3 approuvés dont ≥ 2 indépendants — **seul état qui ferme un angle** |
| `DIMENSION_EXHAUSTED_PARTIAL` | vivier épuisé, ≥ 1 représentant, insuffisant — **jamais « satisfait »** |
| `DIMENSION_EXHAUSTED_EMPTY` | vivier épuisé, 0 représentant — **jamais « satisfait »** |
| `DIMENSION_NO_POOL` | aucun candidat sélectionné pour cet angle — manque explicite |

| Panel | Sens | Early-stop |
|---|---|---|
| `PANEL_SUFFICIENT` | tous les angles SUFFICIENT | `EARLY_STOP_CONFIRMED` (seul chemin) |
| `PANEL_EXHAUSTED_WITH_GAPS` | plus rien à évaluer, ≥ 1 angle non suffisant — « on ne peut plus trouver » | `EARLY_STOP_CONTINUE` + réserve aval `PROFESSIONAL_POOL_EXHAUSTED_WITH_GAPS` |
| `PANEL_CONTINUE` | sinon | `EARLY_STOP_CONTINUE` / `EARLY_STOP_CANDIDATE` (plateau = signal) |

Artefact de décision (`checkpoint.sufficiency`, `professionals-sufficiency.json`, `professionals-economics.json`) : id/stratégie/provenance,
paramètres effectifs, plancher contractuel avec sa source, par angle : état, motif, représentants, indépendants (réfs), œuvres et graines
distinctes, vivier initial/évalué/non évalué/restant, fermeture (raison, rang). Observations après verrou de transport ignorées.

## 5. Audit indépendant de `lib/workref-normalization.js` (règle MONOLITH-WORKREF-NORMALIZATION-v1)
Tests adversariaux WORKREF-ADV-01…08 : apostrophes/guillemets droits vs typographiques, casse, espaces multiples, accents (NFD/NFC), DOI en
casse différente ⇒ remplacés **uniquement** vers l'unique titre/DOI réel ; **deux titres du corpus identiques après canonisation ⇒ ambigu,
aucun remplacement** ; référence inventée intacte ; aucune référence ajoutée ni supprimée, ordre conservé ; `rationale`, statuts,
`limitations`, clés racine byte-identiques hors références ; hashes original/normalisé journalisés, journal sans rationale ; entrées non
EF-02D2 (autre schéma, JSON invalide, prose) inchangées ; idempotence ; clôture Markdown ; corpus lu dans le prompt gelé (jamais supposé) ;
**le validateur gelé EF-02D2 garde le dernier mot** (il refuse l'entrée brute et l'ambigu, accepte la sortie normalisée). Verdict : classe
FORMAT_NORMALIZATION_ONLY confirmée, aucune preuve créée.

## 6. Fichiers
Modifiés : `lib/panel-sufficiency.js` (v2), `lib/stage-professionals.js` (`runPanel` : gate gelé par candidat, graines, verrou ignoré, `panel` journalisé),
`lib/pipeline.js` (messages, réserve `PROFESSIONAL_POOL_EXHAUSTED_WITH_GAPS`), `lib/professionals-economics.js` (policy reportée), `config/monolith.config.json`
(`earlyStop.policy`), `test/test-panel.js` (v2), `test/test-v105.js` (PROF-ECON-04), `test/test-monolith.js` (hook), `tools/browser-tests-v105.js` et
`../../../test/test-launch.js` (attente active du port CDP : Chrome mis à jour ce jour démarre en > 1,5 s — outillage de test seulement), `README.md`,
`NON-REGRESSION.md`. Nouveaux : `AUDIT-PANEL-SUFFICIENCY-POLICY.md`, `test/test-sufficiency.js`, ce rapport.

## 7. Tests et non-régression
- `test/test-monolith.js` : **154/154** (+21 : SUFF-01…14, WORKREF-ADV-01…08 ; PRO-EARLY-01…12 réécrits pour v2, dont PRO-EARLY-02/07 qui
  entérinaient l'ancien comportement « épuisé = satisfait »). Lanceur **14/14**, navigateur **25/25** (portefeuille inclus), secrets **0 hit**,
  anti-hardcoding **0 hit** (jetons des runs réels), lots gelés **byte-identiques** (MONO-01 106, MONO-09 9, MONO-10 79, MONO-11 52 fichiers, 0 divergence),
  runs historiques intacts (WORKREF-04), `.env.local` non versionné.
- Coût de validation réelle : **0 USD** (aucun run lancé ; le comportement PANEL_SUFFICIENT réel reste à observer sur un vivier riche).

## 8. Verdict
**NON GELABLE en l'état → GELABLE (candidat) après un run réel** montrant `EARLY_STOP_CONFIRMED` ou `PANEL_EXHAUSTED_WITH_GAPS` avec l'artefact
de décision v2 attaché. La logique est démontrée déterministe et tracée sur les tests ; ce qui manque est une preuve d'exploitation réelle, pas un
correctif. Jamais déclaré GELÉ.
