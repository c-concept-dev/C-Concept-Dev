import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../atelier-prompts-v11.5-lot10g-decision-provider.html", import.meta.url), "utf8");

test("Rapide et Architecte démarrent par le même pilote sémantique", () => {
  const rapide = html.slice(html.indexOf("async function v11StartRapide"), html.indexOf("async function v11StartArchitecte"));
  const architecte = html.slice(html.indexOf("async function v11StartArchitecte"), html.indexOf("function v11StartAtelier"));
  assert.match(rapide, /adpDecideRapide\(d,mat,'rapide'\)/);
  assert.match(architecte, /adpDecideRapide\(compositeDemand\(\),mat,'architecte'\)/);
  assert.match(rapide, /clarification_required/);
  assert.match(architecte, /clarification_required/);
});

test("chaque réponse relance le pilote avec demande, historique et matériau", () => {
  const resume = html.slice(html.indexOf("async function adpResumeAfterClarification"), html.indexOf("async function v11StartRapide"));
  assert.match(resume, /const demande=compositeDemand\(\),materiau=materialText\(\)/);
  assert.match(resume, /adpState\.requestedMode/);
  assert.match(resume, /adpDecideRapide\(demande,materiau/);
  assert.doesNotMatch(resume, /clarifications\s*<\s*\d+/);
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
