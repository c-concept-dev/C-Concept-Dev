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
  const pilot = html.slice(html.indexOf("function oprieApplyTurn"), html.indexOf("async function oprieRunTurn"));
  assert.match(pilot, /clarification_required/);
  assert.match(pilot, /operational_request_ready/);
});

// FC-01b : invariant INCHANGÉ — chaque réponse relance le pilote avec le mode courant, sans plafond.
// Ce qui change est la matière transmise : plus compositeDemand() (qui concaténait destructivement
// les réponses dans la demande) mais original_request immuable + clarification_history.
test("chaque réponse relance le pilote OPRIE avec le mode courant, sans plafond", () => {
  const resume = html.slice(html.indexOf("async function adpResumeAfterClarification"), html.indexOf("async function v11StartRapide"));
  assert.match(resume, /oprieRunTurn\(adpState\.requestedMode/);
  assert.doesNotMatch(resume, /clarifications\s*<\s*\d+/);
  assert.doesNotMatch(resume, /compositeDemand\(\)/, "original_request ne doit jamais être la demande concaténée.");
  const adapter = html.slice(html.indexOf("async function oprieRequestTurn"), html.indexOf("function oprieSetBusy"));
  assert.match(adapter, /original_request:oprieOriginalRequest\(\)/);
  assert.match(adapter, /clarification_history:oprieClarificationHistory\(\)/);
});

test("l'orchestrateur est l'unique traducteur des décisions en actions UI", () => {
  const section = html.slice(html.indexOf("function adnNextConversationAction"), html.indexOf("function adnReadinessInstruction"));
  assert.match(section, /runtime\.nextConversationAction/);
  assert.match(section, /runtime\.createConversationAuditEvent/);
  assert.match(section, /state\.answers\.map\(x=>x\.question\)/);
  assert.doesNotMatch(section, /voyage|italie|rome|florence|\bcv\b|médical/i);
});

test("la trace exposée est une copie et ne contient pas les réponses", () => {
  const exposure = html.slice(html.indexOf("window.__ADAPTIVE_DECISION_PIPELINE_10G__"), html.indexOf("window.__V11_ROUTER__"));
  assert.match(exposure, /getAudit\(\)\{return JSON\.parse\(JSON\.stringify\(adpState\.audit\)\)\}/);
  assert.doesNotMatch(exposure, /state\.answers|original_request|demande/);
});
