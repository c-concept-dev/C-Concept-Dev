# ATELIER-DEEP-OUTPUT-MINIMIZATION-AUDIT-01

**Sous-lot :** `ATELIER_DEEP_OUTPUT_MINIMIZATION_01D_I`
**Nature :** audit / mesure / contrat des outputs. Aucune implémentation.
**Question :** quelle quantité de sortie est réellement nécessaire à l'Analyste, au Critique et à
l'Arbitre pour préserver exactement leurs décisions, leurs invariants et l'autorité OPRIE ?

**Réponse en une phrase.** Les trois rôles sont sur-provisionnés, la redondance est massive et déjà
documentée, mais **l'Analyste seul consomme à lui seul presque tout le budget des 10 secondes** :
la minimisation des outputs ne peut donc pas suffire, et la preuve est arithmétique.

---

## A. Référence et état Git

```
git status --short  → ?? docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md   (rapport 1D-H, non commité)
git branch          → main
git rev-parse HEAD  → 11906d2415b788f8b5ab44346e1d155484b0c795
git log -5          → 11906d2 Merge branch 'main' … / dda04a3 Update studio-clinique.html
                       3adfead 🔄 Auto-update index.html / a1974cb Merge … / 6dfe38d Update studio-clinique.html
```

HEAD contient des commits postérieurs au point de référence `1d5eed5`. **Écart qualifié et non
bloquant** :

| | |
|---|---|
| tree `tools/Atelier Prompts` @ `1d5eed5` | `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b` |
| tree `tools/Atelier Prompts` @ `HEAD` | `0d8b49f55dc627f84a2fee31d2498ffe17fa7c8b` |
| `git diff 1d5eed5..HEAD -- 'tools/Atelier Prompts'` | **0 ligne** |

Le subtree Atelier est identique au point de référence. Divergence purement non sémantique
(`index.html`, `tools/Conseiller Clinique/`). Aucun worktree isolé n'est nécessaire ; audit mené en
lecture seule sur le dépôt de travail.

**Réutilisation d'un audit antérieur.** `evaluation/deep-output-minimality-01-audit/` contient déjà un
registre de 117 champs feuille, une carte producteur/consommateur, une analyse de schéma, une liste
de faits dupliqués et cinq candidats classés, produits par `DEEP-OUTPUT-MINIMALITY-01`. Je ne l'ai pas
refait : je l'ai **relu et vérifié contre le code actuel**, et je signale ci-dessous les deux
endroits où il n'est plus à jour. Les mesures de jetons viennent de
`evaluation/deep-cout-jetons-01/results.json` et de `docs/DEEP-COUT-JETONS-01.md` — compteurs
d'usage du fournisseur, aucune estimation, aucune conversion caractères → jetons. **Aucun appel API
n'a été émis par ce sous-lot.**

## B. Rappel du blocker

`BLOCKER_CONFIRMED = YES` (1D-H). `const turn = outputs.arbiter` : rien ne quitte le Worker avant la
fin de l'Arbitre. Smoke acquis : **56 489 ms** pour une clarification nécessaire. Invariants CDC :
`< 5 s` conforme, `> 5 s` non conforme, `> 10 s` échec interactif.

1D-H a établi que l'exposition anticipée après Critique plafonne à ≈ 32 500 ms. La décision
propriétaire est donc d'auditer d'abord la quantité de sortie.

## C. Architecture des outputs Deep

```
runOperationalRequestTurn  (orchestrator.js:352)   boucle inconditionnelle sur 3 rôles
│
├─ analyst   1 appel            → validateAnalystOutput      5 champs racine, 29 feuilles
│     buildRoleInput → { base, material_context, material_content? }
│
├─ critic    1 global + N lots  → validateCriticOutput       9 champs racine, 17 feuilles (global)
│     buildRoleInput → { base, analyst_output ENTIER, previous_vetoes:[], material_context }
│     N = nb d'issues où impact="material" ET recommended_treatment="question"
│         (buildQuestionReviewTargets, déterministe)
│     chaque lot → 6 familles × 6 feuilles = 36 feuilles par issue
│     deriveCriticConsequences  ← DÉTERMINISTE : question_is_last_resort,
│                                 illegitimate_question_found, agreement
│     applySubstitutionGate / evaluateSubstitutionGate ← DÉTERMINISTE
│
├─ arbiter   1 appel            → validateArbiterOutput      8 champs racine, 29 feuilles
│     buildRoleInput → { base, analyst_output ENTIER, critic_output ENTIER, material_context }
│
└─ state_check  isLegalTransition("understanding", turn.state)   ← DÉTERMINISTE
        ↓
   mapOprieToCanonicalContract (core/adn/oprie-canonical-mapping.js)
        ↓  seul consommateur algorithmique de la sortie du tour
   contrat canonique + adn_summary
```

**Correction du registre antérieur.** Il compte « 6 familles × 7 feuilles = 42 feuilles par issue ».
`SUBSTITUTION_CANDIDATE_FIELDS` en compte aujourd'hui **6** (`applicable`,
`preserves_objective`, `requires_user_reserved_choice`, `contradicts_known_facts`,
`produces_complete_deliverable`, `justification`) : `candidate_action` a été retiré par
`DEEP-OUTPUT-MINIMALITY-01 Experiment A`, et `grep -c candidate_action` rend **0**. Le lot vérifié est
donc :

| | registre antérieur | **état réel aujourd'hui** |
|---|---|---|
| feuilles par issue de lot | 42 | **36** |
| feuilles totales inventoriées | 117 | **111** |
| `DEAD_OR_REDUNDANT` | 6 | **0** — les six étaient `candidate_action`, déjà supprimés |

Le candidat de rang 1 de l'audit antérieur est donc **déjà implémenté**. Les rangs 2 à 5 restent
ouverts.

## D. Matrice Analyste — 5 champs racine, 29 feuilles

| FIELD | TYPE | REQ. SCHÉMA | VALIDÉ | CONSOMMÉ EN AVAL | CONSOMMATEUR | DÉCISION | UI | LOG SEUL | JAMAIS CONSOMMÉ | CLASSE |
|---|---|---|---|---|---|---|---|---|---|---|
| `operational_request_candidate` | objet | oui | `normalizeCandidate` | oui | prompt Critique global, prompt de **chaque** lot, prompt Arbitre | indirect (via candidat Arbitre) | non | non | non | **DECISION_SUPPORTING** |
| `provenance_records[]` | tableau | oui | `normalizeProvenanceRecords` | oui | prompts Critique + Arbitre ; `analyst_provenance_observation` (**étiquettes seules**, orchestrator.js:426) ; `arbiter_material_context_observation` (orchestrator.js:389) | indirect | non | partiel | non | **DECISION_SUPPORTING** |
| `issues[]` | tableau | oui | `normalizeRoleIssues` | oui | **`buildQuestionReviewTargets` (DÉTERMINISTE — fixe N, donc le nombre d'appels de lot)** + prompts | **DECISION_CRITICAL** | non | non | non | **DECISION_CRITICAL** |
| `question_candidates[]` | tableau | oui | `validateQuestionCandidate` + contrôle croisé `targets_issue_id ∈ issues[].id` | oui | prompt Arbitre ; **aucun code de décision ne le lit** | supporting | non | non | non | **DECISION_SUPPORTING** |
| `confirmation_signals` | objet 5 bool | oui | `validateConfirmationSignals` | prompts seulement | prompts Critique + Arbitre | — | non | non | non | **DECISION_SUPPORTING** |

Détail des feuilles d'issue — `{id, type, description, impact, substitutable, recommended_treatment, kind}` :

| feuille | lecteur déterministe | classe |
|---|---|---|
| `id` | `buildQuestionReviewTargets`, `buildSemanticLockSignals` | DECISION_CRITICAL |
| `impact` | `buildQuestionReviewTargets`, `routeIssues` | DECISION_CRITICAL |
| `recommended_treatment` | `buildQuestionReviewTargets`, `TREATMENT_SIGNALS` | DECISION_CRITICAL |
| `substitutable` | `routeIssues` | DECISION_CRITICAL |
| `type` | `buildQuestionReviewTargets`, validateur de `kind` | DECISION_SUPPORTING |
| `kind` | `operational-request-state.js:303-305,319` | DECISION_SUPPORTING |
| `description` | `buildQuestionReviewTargets` ; `ACCEPTED_PRESENTATION_LOSSES` (« l'état ADN ne retient que la description ») | DECISION_SUPPORTING / UI |

## E. Matrice Critique — 9 champs racine, 17 feuilles (global) + 36 par issue (lots)

| FIELD | CONSOMMÉ PAR | DÉCISION | CLASSE |
|---|---|---|---|
| `agreement` | **`validateCriticOutput:543-552` — contrôle de cohérence déterministe** (agree ⇒ vetoes/drift/missed/illegitimate vides ; disagree ⇒ au moins un fondement) + prompt Arbitre. **Aucun branchement de décision produit ne le lit.** | garde fail-closed | **DERIVED** (`deriveCriticConsequences` le calcule) |
| `operational_request_candidate_review.{unsupported_additions_found, unsupported_removals_found, missed_material_issues}` | `missed_material_issues` → `agreement` (dérivé) ; les deux autres → prompt Arbitre seul | supporting | DECISION_SUPPORTING / EXPLANATORY |
| `vetoes[]` | `applySubstitutionGate` (→ `REJECTED_USER_RESERVED_CHOICE`), `agreement` | **DECISION_CRITICAL** | MUST_KEEP |
| `semantic_drift_detected` | `evaluateSubstitutionGate` (→ `REJECTED_OBJECTIVE_CHANGED`), `agreement` | **DECISION_CRITICAL** | MUST_KEEP |
| `semantic_drift_notes` | prompt Arbitre seul ; tableau vide **obligatoire** quand `detected=false` | — | **EXPLANATORY_ONLY** |
| `significant_stakes` | `isConfirmationRecommended` — **fonction sans aucun appelant de production** (vérifié) ; prompt Arbitre | — | DECISION_SUPPORTING |
| `significant_stakes_reason` | prompt Arbitre seul ; chaîne vide **obligatoire** quand `false` | — | **EXPLANATORY_ONLY** |
| `question_substitution_review[]` | **`deriveCriticConsequences` → `question_is_last_resort` ; `applySubstitutionGate`** | **DECISION_CRITICAL** | MUST_KEEP (structure) |
| `illegitimate_question_found[]` | `agreement` ; prompt Arbitre | supporting | **DERIVED** |

**Le point le plus précis de tout l'audit.** Dans `question_substitution_review[].alternatives_reviewed`,
chaque famille porte un booléen et une prose. Voici exactement ce que le code lit de la prose, dans
`evaluateSubstitutionGate` :

```js
const chosenReason = text(chosen?.reason);
if (!chosen || chosen.reasonably_available !== true || !chosenReason) → REJECTED_INSUFFICIENT_JUSTIFICATION
const contradicted = Object.entries(alternatives_reviewed).some(([alt, entry]) =>
  alt !== available_alternative && entry?.reasonably_available === false
  && text(entry?.reason) === chosenReason);                          → REJECTED_CONTRADICTS_FACTS
```

Donc : **la non-vacuité** de la prose retenue, et **une égalité de chaînes exacte** avec les proses
rejetées. Aucun code ne lit le *sens* d'aucune de ces justifications. `deriveCriticConsequences` ne
lit, lui, que `reasonably_available`. La prose des cinq familles non retenues n'est consommée
algorithmiquement que par un `===`. Son seul autre lecteur est le LLM Arbitre, via la sérialisation
intégrale de `critic_output`.

## F. Matrice Arbitre — 8 champs racine, 29 feuilles

| FIELD | CONSOMMATEUR ALGORITHMIQUE | DÉCISION | CLASSE |
|---|---|---|---|
| `state` | `isLegalTransition` (orchestrator.js:440) ; `oprieApplyTurn` ; 10 lectures `turn.state` côté client ; mapping canonique | **DECISION_CRITICAL** | MUST_KEEP |
| `operational_request_candidate` | `oprie-canonical-mapping.js:202, 434` — **c'est CE candidat qui devient le contrat canonique**, jamais celui de l'Analyste | **DECISION_CRITICAL** | MUST_KEEP |
| `issues[]` | `routeIssues` (:209) → critical/substitutable ; `buildSemanticLockSignals` (:220) → signaux de verrous ; `:451` | **DECISION_CRITICAL** | MUST_KEEP |
| `next_question` | `CANONICAL_*` (:52) ; `turn.next_question` côté client | **DECISION_CRITICAL** si `clarification_required` | MUST_KEEP |
| `confirmation_reason` | `CANONICAL_*` (:53) ; `turn.confirmation_reason` | **DECISION_CRITICAL** si `confirmation_required` | MUST_KEEP |
| `blocked_reason` | `CANONICAL_*` (:54) ; `turn.blocked_reason` | **DECISION_CRITICAL** si `blocked` | MUST_KEEP |
| `intent_preservation` | `:205, 456` ; `operational_request_ready` exige les trois booléens vrais et `concerns` vide | **DECISION_CRITICAL** | MUST_KEEP |
| `reason` | **`:312` uniquement** → `adn_summary.readiness_rationale`. `adn_summary` n'a que deux clés (`readiness_rationale`, `source`) et le test qui le couvre s'intitule lui-même « reason → adn_summary.readiness_rationale, **sans autorité** ». Aucun autre lecteur dans le noyau ADN. | aucune | **EXPLANATORY_ONLY** |

## G. Champs réellement consommés

Consommateurs, strictement distingués :

| classe de consommation | champs |
|---|---|
| **code de décision déterministe** | `analyst.issues[].{id,impact,recommended_treatment,substitutable}` · `critic.{vetoes, semantic_drift_detected, question_substitution_review[].alternatives_reviewed[*].reasonably_available}` · `arbiter.{state, operational_request_candidate, issues, next_question, confirmation_reason, blocked_reason, intent_preservation}` |
| **validateur / garde fail-closed** | `critic.agreement` (cohérence) · `analyst.question_candidates[].targets_issue_id` (contrôle croisé) · `issue.kind` (`operational-request-state.js`) · `reason` non vide de l'alternative retenue |
| **prompt d'un rôle suivant, uniquement** | `analyst.operational_request_candidate` · `analyst.provenance_records` · `analyst.confirmation_signals` · `analyst.question_candidates[].{text,expected_progress}` · `critic.operational_request_candidate_review.{unsupported_additions_found,unsupported_removals_found}` · `critic.semantic_drift_notes` · `critic.significant_stakes_reason` · prose des 5 familles non retenues |
| **rapport / trace humaine** | `arbiter.reason` → `adn_summary.readiness_rationale` · `analyst_provenance_observation` (étiquettes seules) |
| **tests seulement** | `isConfirmationRecommended` — définie, mirroir navigateur présent, **zéro appelant de production**, 5 assertions de test |

## H. Champs jamais consommés

**Aucun champ n'est totalement sans consommateur.** C'est le résultat honnête : tout champ a au moins
un lecteur, ne serait-ce que le prompt du rôle suivant. Les six seuls champs réellement morts
qu'avait identifiés l'audit antérieur — `critic_batch.*.candidate_action` — **ont déjà été
supprimés**.

Trois cas s'en approchent sans y être :

1. **`isConfirmationRecommended`** — fonction sans appelant de production. Ses entrées
   (`confirmation_signals`, `significant_stakes`) restent lues par les prompts, donc les *champs*
   vivent ; c'est la *fonction* qui est morte.
2. **`semantic_drift_notes = []` et `significant_stakes_reason = ""`** obligatoires quand le booléen
   correspondant est faux — branches vides exigées par `required === properties`, sans aucun sens
   pour un consommateur. Classées `DEAD_OR_REDUNDANT_INSTANCE` par l'audit antérieur ; je confirme.
3. **`arbiter.operational_request_candidate.available_inputs`** — validé et rendu en HTTP, mais
   `mapOprieToCanonicalContract` ne le mappe pas et le frontend ne l'affiche pas. Classé
   `NEEDS_EVIDENCE` faute d'inventaire des clients externes ; je maintiens **UNKNOWN**.

## I. Redondances sémantiques

| INFORMATION | REPRÉSENTATION 1 | REPRÉSENTATION 2 | REPRÉSENTATION 3 | REPRÉSENTATION CANONIQUE | AUTRES REQUISES ? |
|---|---|---|---|---|---|
| candidat opérationnel | `analyst.operational_request_candidate` | `arbiter.operational_request_candidate` | contrat canonique | **celle de l'Arbitre** | **NON** pour le code — mais l'Arbitre « reconstruit, jamais patché » par invariant anti-dérive délibéré |
| issues | `analyst.issues` | cibles de revue / vetos / missed du Critique | `arbiter.issues` | **celles de l'Arbitre** | **NON** pour le code, même réserve |
| valeur d'un élément du candidat | `candidate[champ][i]` | `provenance_records[].value` | revue de provenance du Critique | `candidate[champ][i]` | **NON** — dérivable par référence champ+index |
| question | `issues[].description` + `recommended_treatment` | `question_candidates[].{text,expected_progress}` | `arbiter.next_question` | **`arbiter.next_question`** | **NON** pour le code (1D-H : `question_candidates[]` a déjà la forme exacte de `next_question`) |
| verdict de substitution | 5 booléens + `justification` par famille | `reasonably_available` + `available_alternative` | `question_is_last_resort` + `illegitimate_question_found` | **les booléens** | **NON** — les deux dernières sont déjà dérivées par du code |
| motif de readiness | candidat + issues + constats Critique | `intent_preservation` | `arbiter.reason` | **`intent_preservation` + `state`** | **NON** — `reason` ne décide rien |
| disponibilité du matériau | `material_context` | `candidate.available_inputs` + provenance | `available_inputs` réécrit par l'Arbitre | `material_context` | UNKNOWN (clients externes non inventoriés) |
| dérive sémantique | `semantic_drift_detected` | `semantic_drift_notes` | `arbiter.concerns` / `reason` | **le booléen** | **NON** pour le code |
| enjeux / confirmation | 5 signaux Analyste | `significant_stakes` | `significant_stakes_reason` | les booléens | **NON** pour le code |

`SEMANTIC_REDUNDANCY_EXISTS = YES`, sur 63 des 111 feuilles marquées `duplication` par le registre
antérieur, dont 5 explicitement `derivable` et **4 déjà dérivées par du code déterministe**.

## J. Mesure de taille des outputs

Source : `evaluation/deep-cout-jetons-01/results.json` — compteurs d'usage fournisseur, metadata
seule, **aucune estimation, aucune conversion caractères → jetons**. Corpus de 12 tours, Groq
`openai/gpt-oss-20b`, avec bascule partielle vers Anthropic.

| Rôle | Appels/tour (min–p50–max) | Entrée p50 | **Sortie p50** | Total p50 | Total p95 |
|---|---|---|---|---|---|
| Analyste | 1 – 1 – 1 | 2 738 | **685** | 3 641 | 5 022 |
| Critique | **1 – 2 – 13** | 6 047 | **939** | 6 986 | **85 331** |
| Arbitre | 1 – 1 – 2 | 4 380 | **915** | 5 781 | 14 766 |
| **Tour** | 3 – 4 – 15 | **13 408** | **2 829** | **16 015** | **103 894** |

`n = 12`. Latence worker mesurée : p50 **32,6 s**, max **218,5 s**.
La somme des sorties p50 par rôle (2 539) diffère de la sortie p50 du tour (2 829) : un p50 de
sommes n'est pas une somme de p50. J'utilise 2 829 comme chiffre de tour.

| Métrique | Analyste | Critique | Arbitre |
|---|---|---|---|
| `OUTPUT_TOKENS` p50 | 685 | 939 | 915 |
| `STRUCTURED_FIELDS` (feuilles) | 29 | 17 + 36/issue | 29 |
| `OUTPUT_CHARACTERS` / `OUTPUT_WORDS` | UNKNOWN | UNKNOWN | UNKNOWN |
| `FREE_TEXT_SHARE` | UNKNOWN | UNKNOWN | UNKNOWN |
| `DECISION_CRITICAL_SHARE` | UNKNOWN | UNKNOWN | UNKNOWN |
| `EXPLANATORY_SHARE` | UNKNOWN | UNKNOWN | UNKNOWN |
| `REDUNDANT_SHARE` | UNKNOWN | UNKNOWN | UNKNOWN |

**Ces six `UNKNOWN` sont assumés.** Les parts par nature de champ exigeraient de parser des sorties de
rôle réelles, qui ne sont conservées nulle part dans le dépôt : `results.json` ne garde que des
compteurs agrégés, jamais un corps de réponse. Les obtenir demanderait une campagne provider, que ce
sous-lot interdit. Je ne les estime pas.

**Un chiffre divergent, signalé plutôt que choisi.** Le brief cite « l'Analyste écrit ≈ 1 340 tokens »,
valeur issue de `DEEP-INTERACTION-LATENCY-01` (population ouverte, projections dérivées de la loi de
latence). `DEEP-COUT-JETONS-01` mesure 685 en p50 sur 12 tours Groq. Les deux sont dans le dépôt, les
populations et les providers diffèrent, et **aucune des deux n'annule l'autre**. Je conserve les deux
et je vérifie ma conclusion sur les deux.

## K. Contrat minimal Analyste

```
ANALYST_MINIMUM =
  issues[]  { id, impact, recommended_treatment, substitutable, type, kind }
  question_candidates[]  { text, targets_issue_id }
  operational_request_candidate   (forme actuelle)
  provenance_records[]  { field, provenance, + référence champ+index AU LIEU de value }
  confirmation_signals  (5 booléens)
```

| élément | WHY_REQUIRED | CONSUMER | FAILURE_IF_REMOVED |
|---|---|---|---|
| `issues[].{id,impact,recommended_treatment}` | fixent N, donc le nombre d'appels de lot | `buildQuestionReviewTargets` | le pipeline Critique ne peut plus être construit |
| `issues[].substitutable` | routage critical/substitutable | `routeIssues` | contrat canonique faux |
| `issues[].kind` | validé strictement | `operational-request-state.js:303` | assertion en échec |
| `issues[].description` | seule représentation retenue par l'état ADN | `ACCEPTED_PRESENTATION_LOSSES` | perte de présentation acceptée aujourd'hui ⇒ deviendrait une perte réelle |
| `question_candidates[].text` | matière de `next_question` (1D-H : forme identique) | prompt Arbitre | l'Arbitre doit tout réécrire |
| `question_candidates[].expected_progress` | non lu par le code | prompt Arbitre | **COULD_COMPRESS** |
| `operational_request_candidate` | base du candidat final | prompts Critique et Arbitre | l'Arbitre perd son point de départ |
| `provenance_records[].value` | dupliqué mot pour mot depuis le candidat | prompt Critique | **COULD_COMPRESS** — référence champ+index, statut `safe_with_new_explicit_index_contract` |
| `confirmation_signals` | aucun appelant de production (`isConfirmationRecommended`) | prompts | **UNKNOWN** — effet d'élicitation non mesuré |

`MUST_KEEP` : issues (6 feuilles), candidat, `question_candidates[].text`.
`COULD_COMPRESS` : `provenance_records[].value`, `expected_progress`.
`COULD_REMOVE` : aucun démontré.
`UNKNOWN` : `confirmation_signals`.

## L. Contrat minimal Critique

```
CRITIC_MINIMUM =
  vetoes[]                                            (issue_id + qualification)
  semantic_drift_detected                             (booléen)
  question_substitution_review[]  { issue_id,
      alternatives_reviewed[6] { reasonably_available, reason_ref } }
  operational_request_candidate_review.missed_material_issues[]
```

| élément | WHY_REQUIRED | CONSUMER | FAILURE_IF_REMOVED |
|---|---|---|---|
| `vetoes[]` | `REJECTED_USER_RESERVED_CHOICE` | `applySubstitutionGate` | une question réservée à l'utilisateur pourrait être substituée |
| `semantic_drift_detected` | `REJECTED_OBJECTIVE_CHANGED` | `evaluateSubstitutionGate` | une dérive d'objectif passerait la porte |
| `alternatives_reviewed[*].reasonably_available` | `question_is_last_resort` | `deriveCriticConsequences` | la légitimité d'une question n'est plus calculable |
| `alternatives_reviewed[chosen].reason` non vide | `REJECTED_INSUFFICIENT_JUSTIFICATION` | `evaluateSubstitutionGate` | une alternative non justifiée serait acceptée |
| prose des 5 familles non retenues | lue par un `===` et par le prompt Arbitre | `evaluateSubstitutionGate` | **COULD_COMPRESS** — un identifiant stable préserverait le `===` à l'octet près |
| `missed_material_issues[]` | `agreement` | `deriveCriticConsequences` | cohérence agree/disagree cassée |
| `agreement` | **déjà dérivé** | `deriveCriticConsequences` | aucun — la valeur du LLM est écrasée par le calcul |
| `illegitimate_question_found` | **déjà dérivé** | idem | aucun |
| `semantic_drift_notes`, `significant_stakes_reason` | prompt Arbitre seul ; vides obligatoires quand faux | — | **COULD_REMOVE** conditionnellement |

`MUST_KEEP` : vetoes, `semantic_drift_detected`, booléens de substitution, `missed_material_issues`,
prose de l'alternative retenue.
`COULD_COMPRESS` : prose des 5 familles non retenues.
`COULD_REMOVE` : `agreement` et `illegitimate_question_found` (déjà dérivés) ; branches vides
obligatoires.
`UNKNOWN` : effet d'élicitation de la prose sur la qualité du verdict.

## M. Contrat minimal Arbitre

```
ARBITER_MINIMUM =
  state
  operational_request_candidate   (ou adoption + delta explicite)
  issues[]                        (ou adoption + delta explicite)
  next_question | confirmation_reason | blocked_reason   (selon l'état)
  intent_preservation  { objective_preserved, priorities_preserved,
                         semantic_equivalence, concerns[] }
```

| élément | WHY_REQUIRED | CONSUMER | FAILURE_IF_REMOVED |
|---|---|---|---|
| `state` | autorité unique de readiness | `isLegalTransition`, client, mapping | le tour n'a plus d'issue |
| `operational_request_candidate` | devient le contrat canonique | mapping `:202,:434` | aucun contrat exécutable |
| `issues[]` | routage + signaux de verrous | `routeIssues`, `buildSemanticLockSignals` | verrous adaptatifs faux |
| `next_question` | question posée | `CANONICAL_*`, client | `clarification_required` sans question |
| `confirmation_reason` / `blocked_reason` | motif de l'état | `CANONICAL_*`, client | états sans motif |
| `intent_preservation` | `ready` exige les trois vrais et `concerns` vide | mapping `:205,:456` | readiness non gardée |
| `reason` | `adn_summary.readiness_rationale`, **« sans autorité »** | mapping `:312` | **COULD_COMPRESS** — perte de rapport humain, aucune perte décisionnelle |
| réécriture intégrale candidat+issues | invariant « reconstruit, jamais patché » | prompt | **COULD_COMPRESS** via adoption+delta, mais attaque un invariant anti-dérive délibéré |

`MUST_KEEP` : `state`, candidat, issues, le motif de l'état courant, `intent_preservation`.
`COULD_COMPRESS` : `reason`, et la réécriture intégrale (sous réserve de preuve de parité).
`COULD_REMOVE` : aucun démontré.
`UNKNOWN` : `available_inputs` (clients externes).

## N. Impact potentiel tokens

Les pourcentages ci-dessous sont ceux de `candidates.json` de l'audit antérieur, qui les qualifie
d'`estimated`. Je les reprends **comme estimations**, appliqués aux sorties mesurées.

| rang | candidat | rôle | part estimée | état |
|---|---|---|---|---|
| 1 | retirer `candidate_action` | lots | 10–20 % de la sortie de lot | **DÉJÀ FAIT** |
| 2 | verdict de substitution compact, prose conditionnelle | lots | 35–55 % de la sortie de lot | ouvert |
| 3 | provenance par référence champ+index | Analyste | 10–25 % de l'Analyste | ouvert |
| 4 | Arbitre : adoption + delta | Arbitre | 25–50 % de l'Arbitre | ouvert |
| 5 | explications codées conditionnelles | Critique global + Arbitre | 15–35 % des rôles visés | ouvert |

Je ne compose pas ces fourchettes en un chiffre unique : elles se recouvrent (2 et 5 touchent le
Critique, 4 et 5 l'Arbitre) et leur composition fabriquerait une précision que personne n'a mesurée.
Bracket honnête sur la sortie de tour mesurée à **2 829 jetons p50** :

```
bord conservateur   ≈ −10 à −15 %   →  ≈ 2 400 – 2 550 jetons
bord optimiste      ≈ −40 à −45 %   →  ≈ 1 560 – 1 700 jetons
THEORETICAL_OUTPUT_REDUCTION = −10 % à −45 %   (estimation, non mesurée)
```

## O. Impact potentiel latence

Loi établie dans `DEEP-INTERACTION-LATENCY-01` : latence ≈ jetons de **sortie** × ~13 ms, **en série**
à travers les rôles. Contrôle de cohérence : 2 829 × 13 ms = 36,8 s, contre une latence worker p50
mesurée de 32,6 s et un smoke de 56,5 s. L'ordre de grandeur tient.

| | valeur | statut |
|---|---|---|
| sortie de tour actuelle | 2 829 jetons p50 | **PROVEN** (compteurs fournisseur) |
| latence de tour actuelle | 32,6 s p50 / 56,5 s smoke | **PROVEN** |
| réduction de sortie atteignable | −10 % à −45 % | **PLAUSIBLE** (estimations d'audit) |
| latence après réduction | ≈ 20 s à 33 s | **PLAUSIBLE** |
| `EXPECTED_LATENCY_DIRECTION` | à la baisse, proportionnelle mais non linéaire | **PLAUSIBLE** |

Non linéaire, et je ne prétends pas l'inverse : le temps au premier jeton, le réseau et la
sérialisation entre rôles ne dépendent pas du nombre de jetons écrits.

## P. Compatibilité seuil 10 s / 5 s

L'arithmétique est simple et elle tranche.

À ~13 ms par jeton de sortie, en série :

```
budget 10 s  →  ≤  770 jetons de sortie pour TOUT le tour
budget  5 s  →  ≤  385 jetons de sortie pour TOUT le tour
```

Or **l'Analyste seul écrit 685 jetons en p50** (mesuré, Groq) — et ≈ 1 340 selon la projection de la
population ouverte citée par le brief.

- Contre 770 : l'Analyste seul consomme **89 %** du budget des 10 secondes sur le chiffre mesuré, et
  le **dépasse de 74 %** sur le chiffre projeté. Il resterait 85 jetons pour le Critique *et*
  l'Arbitre réunis — moins qu'un seul verdict de substitution.
- Contre 385 : l'Analyste seul dépasse déjà le budget des 5 secondes de **78 %**, avant que le
  Critique ou l'Arbitre n'aient écrit un seul jeton.

Même en appliquant le bord optimiste de −45 % à la totalité du tour, on atteint ≈ 1 560 jetons, soit
**≈ 20 s** : le double du seuil d'échec interactif.

Cette conclusion converge avec celle que le dépôt avait déjà établie par une voie indépendante
(`DEEP-INTERACTION-LATENCY-01`, l. 142-147) : supprimer intégralement l'Arbitre *et* tous les lots
laisserait encore 21 secondes, « parce que l'Analyste seul écrit 1 340 jetons », et « l'objectif
"quelques secondes" est hors d'atteinte de toute modification d'orchestration ». Deux dérivations
distinctes, même verdict.

```
OUTPUT_MINIMIZATION_ALONE_CAN_REACH_10S = NOT_PLAUSIBLE
OUTPUT_MINIMIZATION_ALONE_CAN_REACH_5S  = NOT_PLAUSIBLE
```

**Je ne cache pas ce résultat : il signifie qu'il faudra examiner autre chose que la longueur des
sorties.** Les trois leviers que l'arithmétique laisse ouverts, et qu'aucun sous-lot n'a encore
instruits, sont le **nombre de rôles sur le chemin d'affichage**, le **nombre d'appels de lot**, et
la **sérialisation** elle-même. Aucun n'appartient au périmètre de 1D-I.

## Q. Risques

1. **Effet d'élicitation non mesuré.** Demander une prose par famille force peut-être le modèle à
   instruire réellement chaque alternative. La supprimer pourrait dégrader le *verdict*, pas
   seulement sa longueur. Aucune donnée ne tranche : c'est le risque principal du rang 2, et il exige
   une expérience de parité avant toute décision.
2. **Attaque d'un invariant délibéré.** Le rang 4 remplace « reconstruit, jamais patché » par
   adoption + delta. Cet invariant existe contre la dérive silencieuse. Le gain est réel, le risque
   aussi, et il ne se juge pas sur un compte de jetons.
3. **Fausse précision.** Composer les fourchettes d'estimation produirait un chiffre crédible et
   faux. Évité ici, à préserver ensuite.
4. **Perte de rapport humain.** `arbiter.reason` et `semantic_drift_notes` ne décident rien mais
   constituent la lisibilité d'un tour pour un auditeur humain. Les comprimer est un arbitrage
   produit, pas une optimisation neutre.
5. **`available_inputs` et clients externes.** Classé UNKNOWN depuis l'audit antérieur, toujours non
   inventorié. Le supprimer sans cet inventaire serait un pari.
6. **Illusion d'avancement.** Le risque de gouvernance : livrer −45 % de jetons et croire le blocker
   traité. Il ne le serait pas.

## R. Tests différentiels requis

Avant toute réduction réelle, sur **fixtures existantes**, en comparant les **décisions** et non la
seule validité JSON.

**Parité décisionnelle `FULL_OUTPUT` vs `MINIMAL_OUTPUT`** — pour chaque fixture du corpus existant :

1. même `state` final ;
2. même décision de clarification (`question_is_last_resort` identique issue par issue) ;
3. même issue sélectionnée et même `targets_issue_id` ;
4. même `next_question` par le sens (jamais par les mots) ;
5. même contrat canonique après `mapOprieToCanonicalContract` — égalité profonde ;
6. mêmes `reason_code` de `evaluateSubstitutionGate`, un par un ;
7. mêmes signaux de verrous issus de `buildSemanticLockSignals` ;
8. mêmes `critical` / `substitutable` issus de `routeIssues`.

**Invariants structurels**

9. schéma toujours valide ; `required === properties` préservé ;
10. tous les consommateurs aval satisfaits (le registre de 111 feuilles comme liste de contrôle) ;
11. comportement de tour périmé inchangé (`turn_id`, `seq`, `concludedTurn`) ;
12. réconciliation inchangée (trois verdicts) ;
13. fail-closed inchangé (`degraded_state` sur épuisement de chaîne) ;
14. 7 empreintes gelées conformes ;
15. aucun codage en dur de domaine — deux corpus lexicalement opposés, mêmes verdicts ;
16. aucun déplacement d'autorité : `FAST_AUTHORITY = candidate`, `state` produit par le seul Arbitre.

**Mesure**

17. jetons de sortie avant/après par rôle, compteurs fournisseur, jamais une estimation ;
18. latence avant/après sur le même tour, un tour, pas une campagne.

## S. Fichiers potentiellement concernés

| fichier | nature du contact |
|---|---|
| `workers/shared/operational-request-core.js` | prompts, schémas, validateurs, `evaluateSubstitutionGate`, `deriveCriticConsequences` |
| `workers/shared/operational-request-orchestrator.js` | `buildRoleInput`, traces d'observation |
| `core/adn/oprie-canonical-mapping.js` | **seul consommateur algorithmique** de la sortie de tour |
| `core/adn/operational-request-state.js` | **machine d'état gelée — à ne pas toucher** |
| `atelier-prompts-v11.5-lot10g-decision-provider.html` + `core/adn/browser-runtime.generated.js` | miroir, régénéré par l'outil canonique |
| `tests/*` + littéral d'empreinte HTML (15 fichiers) + `docs/RELEASE-MANIFEST.md` | rituel d'empreinte |
| `evaluation/deep-output-minimality-01-audit/*` | registre à mettre à jour : 117 → 111 feuilles, lot 42 → 36 |

Aucun de ces fichiers n'a été modifié par ce sous-lot.

## T. Verdict

Les trois rôles sont sur-provisionnés, et la démonstration ne repose pas sur une impression de
longueur : 63 des 111 feuilles portent une duplication, 5 sont dérivables, **4 sont déjà recalculées
par du code déterministe** qui écrase ce que le modèle a écrit, et la prose des cinq familles de
substitution non retenues n'est lue par le code que par une égalité de chaînes.

Mais la réduction accessible ne franchit pas le seuil. À 13 ms par jeton de sortie en série, le
budget des 10 secondes vaut 770 jetons pour le tour entier, et **l'Analyste seul en écrit 685 en
médiane mesurée** — 1 340 selon la projection de la population ouverte. Le budget des 5 secondes est
dépassé par l'Analyste seul avant que les deux autres rôles n'existent.

La minimisation des outputs reste donc une économie légitime — de coût, de variance, de dette de
contrat — et elle n'est pas une réponse au blocker interactif. Ce qu'il faudra examiner ensuite n'est
plus la longueur de ce que les rôles écrivent, mais **combien de rôles se trouvent sur le chemin de
l'affichage**.
