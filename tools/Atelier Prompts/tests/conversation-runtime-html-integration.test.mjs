import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../atelier-prompts-v11.5-lot10g-decision-provider.html", import.meta.url), "utf8");

// FC-01b : l'invariant est INCHANGÉ — Rapide et Architecte partent d'un pilote UNIQUE, jamais de
// deux chemins de readiness divergents. Seul le pilote change : ce n'est plus adpDecideRapide (les
// Decision Providers navigateur) mais oprieRunTurn, qui interroge le backend canonique OPRIE.
test("Rapide et Architecte démarrent par le même pilote sémantique (OPRIE)", () => {
  const rapide = html.slice(html.indexOf("async function v11StartRapide"), html.indexOf("async function v11StartArchitecte"));
  const architecte = html.slice(html.indexOf("async function v11StartArchitecte"), html.indexOf("function v11StartAtelier"));
  assert.match(rapide, /oprieRunTurn\('rapide'\)/);
  assert.match(architecte, /oprieRunTurn\('architecte'\)/);
  assert.doesNotMatch(rapide, /adpDecideRapide/, "aucun fournisseur navigateur ne détermine plus la readiness.");
  assert.doesNotMatch(architecte, /adpDecideRapide/);
  // IA-02A : le branchement par état OPRIE ne vit plus dans le pilote — il vit dans LA politique
  // d'orchestration, embarquée dans ce même HTML. L'invariant vérifié est inchangé (un seul pilote
  // traite les deux états) ; il est désormais vérifié là où la table existe réellement.
  const pilot = html.slice(html.indexOf("function oprieApplyTurn"), html.indexOf("async function oprieRunTurn"));
  assert.match(pilot, /oprieDecideOrchestration\(oprieTurnContext\(turn,requestedMode,fast\)\)/,
    "le pilote demande l'action à la politique unique…");
  assert.match(pilot, /oprieDriveOrchestration\(decision,turn,requestedMode\)/, "…puis se borne à l'appliquer.");
  assert.match(html, /deep\.state === "operational_request_ready"/, "la politique embarquée lit l'état exploitable.");
  assert.match(html, /SOLICITING_OPRIE_STATES\.includes\(deep\.state\)/, "et les états qui sollicitent la personne.");
});

// FC-01b : invariant INCHANGÉ — chaque réponse relance le pilote avec le mode courant, sans plafond.
// Ce qui change est la matière transmise : plus compositeDemand() (qui concaténait destructivement
// les réponses dans la demande) mais original_request immuable + clarification_history.
test("chaque réponse relance le pilote OPRIE avec le mode courant, sans plafond", () => {
  /* CLEAN-01 : adpResumeAfterClarification portait cet invariant SANS APPELANT — la reprise
     réelle vit dans answerQuestion. Le vestige est retiré ; l'invariant est désormais mesuré
     là où il s'applique vraiment, ce qui le rend opposable au lieu de décoratif. */
  const resume = html.slice(html.indexOf("function answerQuestion(answer){"), html.indexOf("function resetAll()"));
  assert.match(resume, /oprieRunTurn\(adpState\.requestedMode/);
  assert.doesNotMatch(resume, /clarifications\s*<\s*\d+/);
  assert.doesNotMatch(resume, /compositeDemand\(\)/, "original_request ne doit jamais être la demande concaténée.");
  const adapter = html.slice(html.indexOf("async function oprieRequestTurn"), html.indexOf("function oprieSetBusy"));
  assert.match(adapter, /original_request:oprieOriginalRequest\(\)/);
  assert.match(adapter, /clarification_history:oprieClarificationHistory\(\)/);
});

test("l'orchestrateur est l'unique traducteur des décisions en actions UI", () => {
  /* CLEAN-01 : ce test mesurait le TRADUCTEUR HÉRITÉ (adnNextConversationAction), sans appelant.
     Le traducteur réel — et unique — est la table d'application du pilote de tour. C'est elle
     qui est mesurée maintenant : une action connue, un composant existant, rien d'inventé. */
  const table = html.slice(html.indexOf("const ORCHESTRATION_DRIVER="), html.indexOf("IA-04 — LE CYCLE"));
  assert.equal((html.match(/const ORCHESTRATION_DRIVER=/g) || []).length, 1, "un seul traducteur.");
  for (const action of ['WAIT_FOR_USER', 'KEEP_CURRENT_INTERACTION', 'SHOW_BLOCKED', 'SHOW_DEGRADED',
                        'ENTER_READINESS', 'IGNORE_STALE', 'STOP_FAIL_CLOSED']) {
    assert.ok(table.includes(action + ':'), `${action} a son application.`);
  }
  assert.doesNotMatch(table, /voyage|italie|rome|florence|\bcv\b|médical/i);
});

test("la façade de compatibilité n’expose ni trace, ni réponses, ni ancien décideur", () => {
  /* CLEAN-01 : la trace exposée (getAudit) n'était alimentée que par l'ancien décideur.
     Celui-ci retiré, elle n'aurait plus jamais rendu qu'un tableau vide — annoncer une trace
     toujours vide est pire que ne rien annoncer. La façade est réduite à ce qui a un
     consommateur réel, et ce test vérifie qu'elle ne réapparaît pas. */
  const exposure = html.slice(html.indexOf("window.__ADAPTIVE_DECISION_PIPELINE_10G__"), html.indexOf("window.__V11_ROUTER__"));
  assert.doesNotMatch(exposure, /getAudit|adpState\.audit|decide:|lastDecision/);
  assert.doesNotMatch(exposure, /state\.answers|original_request|demande/);
  assert.match(exposure, /askDecisionProvider/, "le transport, lui, a un consommateur réel.");
});
