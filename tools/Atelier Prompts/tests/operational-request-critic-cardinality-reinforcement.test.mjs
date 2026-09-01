import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, buildQuestionReviewTargets, makeCriticUserMessage } from "../workers/shared/operational-request-core.js";

// 3F.3.3-H3C : régression comportementale observée après H3B — le smoke réel Critic-only sur la
// sentinelle sentinel-b01b-substitution est resté valid_json=true (aucun défaut JSON, schema ou
// validator) mais a produit agreement=agree, question_substitution_review=[] et
// illegitimate_question_found=[] malgré 4 question_review_targets réels : score.pass=false
// (question_substitution_review_covers_all_targetable_issues=false, issues manquantes issue1-4).
// Diagnostic : la règle de cardinalité S3 (question_substitution_review.length ===
// question_review_targets.length) restait textuellement présente à trois endroits du prompt (FORME
// DE question_substitution_review, FORME DE question_review_targets, MISSION point 5) mais toujours
// ÉLOIGNÉE du squelette JSON de sortie lui-même — les deux formulations qui énoncent explicitement
// le lien numérique avec question_review_targets vivent à 30+ et 40+ lignes du squelette. La
// compaction H3/H3B, en raccourcissant chaque formulation individuellement, a réduit la saillance
// de cette règle sans jamais en changer le sens. H3C n'ajoute donc AUCUNE nouvelle règle et ne
// touche à aucun bloc S4/G3/G4 : une seule phrase courte et impérative est insérée immédiatement
// après le squelette JSON de question_substitution_review (avant même la description
// d'alternatives_reviewed), au plus près du point où le Critic génère effectivement ce tableau.
// Coût mesuré : +257 caractères (cible <=300, max <=500), budget H3B (<=18500) largement préservé.

// 3F.3.3-X2-A : la cardinalité N targets -> N reviews, narrative dans H3C (une instruction textuelle
// demandant au LLM de compter), est désormais imposée STRUCTURELLEMENT par le schéma JSON dynamique
// keyed-by-issue_id (buildQuestionSubstitutionReviewSchema) — le mode strict du provider interdit
// mécaniquement toute omission/ajout de clé, sans dépendre de la lecture de cette règle par le LLM.
// H3C-1/H3C-2 sont mis à jour pour vérifier la nouvelle formulation (mécanisme structurel, jamais un
// comptage narratif de type "N targets -> N entrées" ni une forme "[]"), positionnée au même endroit
// (immédiatement après le squelette, cf. H3C-3, inchangé).

test("H3C-1 : le prompt affirme, immédiatement après le squelette de sortie, que la cardinalité est imposée structurellement par le schéma (X2-A, plus seulement narrative)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /CARDINALITÉ OBLIGATOIRE/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le schéma impose déjà mécaniquement une clé exactement par élément de question_review_targets/);
  assert.match(CRITIC_SYSTEM_PROMPT, /vous ne pouvez pas produire de réponse valide qui s'en écarte/);
});

test("H3C-2 : le prompt affirme explicitement que question_substitution_review est absent de la réponse quand question_review_targets est vide (X2-A : plus une forme [], une absence structurelle)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /Si question_review_targets est vide, cette propriété est absente de votre réponse/);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /question_substitution_review=\[\] n'est valide que si question_review_targets=\[\]/, "l'ancienne forme narrative [] ne doit plus apparaître : X2-A fait de l'absence de la clé, jamais d'un tableau vide, la sortie du court-circuit N=0.");
});

test("H3C-3 : le renforcement est positionné immédiatement après le squelette JSON de question_substitution_review, avant la description d'alternatives_reviewed", () => {
  const skeletonEnd = CRITIC_SYSTEM_PROMPT.indexOf('"why_available": null\n}');
  const cardinalityIndex = CRITIC_SYSTEM_PROMPT.indexOf("CARDINALITÉ OBLIGATOIRE");
  const alternativesReviewedDescIndex = CRITIC_SYSTEM_PROMPT.indexOf("alternatives_reviewed est un OBJET à exactement ces six clés fixes");
  assert.ok(skeletonEnd !== -1, "le squelette JSON de question_substitution_review doit exister.");
  assert.ok(cardinalityIndex !== -1, "la section CARDINALITÉ OBLIGATOIRE doit exister.");
  assert.ok(alternativesReviewedDescIndex !== -1, "la description d'alternatives_reviewed doit exister.");
  assert.ok(skeletonEnd < cardinalityIndex, "CARDINALITÉ OBLIGATOIRE doit venir après le squelette JSON, pour rester au plus près du point de génération.");
  assert.ok(cardinalityIndex < alternativesReviewedDescIndex, "CARDINALITÉ OBLIGATOIRE doit précéder la description d'alternatives_reviewed (positionnement immédiat, pas une note tardive).");
  const distance = cardinalityIndex - skeletonEnd;
  assert.ok(distance < 50, `le renforcement doit être immédiatement adjacent au squelette (distance obtenue : ${distance} caractères).`);
});

test("H3C-4 : sentinelle structurelle locale — un message Critic avec 4 question_review_targets porte explicitement l'attente de 4 reviews (aucun réseau, aucune simulation LLM)", () => {
  const analystOutput = {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: [
      { id: "issue1", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
      { id: "issue2", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
      { id: "issue3", type: "missing_information", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null },
      { id: "issue4", type: "ambiguity", description: "x", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }
    ],
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.equal(targets.length, 4, "précondition du test : 4 targets réels.");
  const message = JSON.parse(makeCriticUserMessage({ original_request: "x", analyst_output: analystOutput, previous_vetoes: [] }));
  assert.equal(message.question_review_targets.length, 4, "le message Critic doit transporter exactement les 4 targets.");
  // La règle de cardinalité elle-même (désormais imposée par le schéma, cf. X2-A) est une constante
  // du prompt système, pas une donnée par appel : ce test ne simule jamais de sortie LLM, il vérifie
  // uniquement que (1) le prompt système porte la règle explicite et (2) le message utilisateur
  // transporte bien la vraie cardinalité (4) que le schéma dynamique imposera à ce même appel.
  assert.match(CRITIC_SYSTEM_PROMPT, /le schéma impose déjà mécaniquement une clé exactement par élément de question_review_targets/);
});

// 3F.3.3-X2-A : H3C-5 mesurait spécifiquement la taille du patch H3C par rapport à l'état de fin
// H3B — cette mesure n'a plus de sens une fois que X2-A restructure la même section pour un motif
// différent (remplacement du mécanisme narratif par un mécanisme structurel). H3C-6 (budget absolu,
// inchangé ci-dessous) reste la garde-fou pertinente contre toute dérive de taille.
test("H3C-5 : budget prompt — le remplacement du mécanisme narratif par le mécanisme structurel (X2-A) reste sous le budget absolu H3B/H3C/H3D (aucune dérive de taille incontrôlée)", () => {
  const chars = CRITIC_SYSTEM_PROMPT.length;
  // eslint-disable-next-line no-console
  console.log(`Longueur CRITIC_SYSTEM_PROMPT après X2-A : ${chars} caractères.`);
  assert.ok(chars <= 18500, `le budget absolu (18500 caractères) doit rester respecté même après le remplacement du mécanisme de cardinalité (obtenu : ${chars}).`);
});

test("H3C-6 : le budget statique H3B (<=18500 caractères) reste respecté sans avoir été artificiellement relevé", () => {
  const H3B_BUDGET_MAX_CHARS = 18500;
  assert.ok(CRITIC_SYSTEM_PROMPT.length <= H3B_BUDGET_MAX_CHARS, `CRITIC_SYSTEM_PROMPT doit rester sous la borne H3B existante de ${H3B_BUDGET_MAX_CHARS} caractères (obtenu : ${CRITIC_SYSTEM_PROMPT.length}).`);
});

test("H3C-7 : aucun mot métier de production n'a été introduit", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
