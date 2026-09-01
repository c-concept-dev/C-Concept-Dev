import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "atelier-prompts-v11.5-lot10g-decision-provider.html"), "utf8");
const bundle = fs.readFileSync(path.join(root, "core/adn/browser-runtime.generated.js"), "utf8");

test("le runtime navigateur expose l'Execution Readiness Gate", () => {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(bundle, context, { timeout: 1000 });
  const runtime = context.window.__ATELIER_ADN_RUNTIME__;
  assert.equal(typeof runtime.assessAnalysisReadiness, "function");
  assert.equal(typeof runtime.contractForContractualization, "function");
  assert.equal(typeof runtime.buildExecutionReadinessInstruction, "function");
  assert.equal(typeof runtime.buildFinalExecutionDirective, "function");
});

test("le contrat envoyé à Architecte est en contractualisation, pas en exécution", () => {
  const section = html.slice(
    html.indexOf("function adnCompactContractForArchitecte"),
    html.indexOf("function adpEndpointValide")
  );
  assert.match(section, /contractForContractualization/);
  assert.match(section, /can_execute:false/);
});

test("la requête Architecte reçoit la règle readiness prioritaire sans modifier ARCH_SYSTEM", () => {
  const section = html.slice(
    html.indexOf("function makeEnvelope"),
    html.indexOf("function blobDownload")
  );
  assert.match(section, /adnReadinessInstruction/);
  assert.match(section, /readinessBlock/);
});

test("les deux chemins Architecte refusent de compiler avant execution_ready", () => {
  const api = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  const imported = html.slice(
    html.indexOf("function useAnalysis"),
    html.indexOf("function showQuestion")
  );
  assert.match(api, /action\.state!=='execution_ready'/);
  assert.match(imported, /action\.state!=='execution_ready'/);
  assert.match(api, /adnNextConversationAction/);
  assert.match(imported, /adnNextConversationAction/);
});

test("le dialogue adaptatif n'a plus de plafond numérique de clarifications", () => {
  // FC-01b : l'absence de plafond reste vérifiée, et le compteur d'audit est conservé — il vit
  // désormais là où la clarification est réellement affichée, pas dans la reprise.
  const section = html.slice(
    html.indexOf("async function adpResumeAfterClarification"),
    html.indexOf("async function v11StartRapide")
  );
  assert.doesNotMatch(section, /clarifications\s*<\s*\d+/);
  const pilot = html.slice(html.indexOf("const OPRIE_STATES="), html.indexOf("function adpShowThinking"));
  assert.doesNotMatch(pilot, /clarifications\s*<\s*\d+/, "aucun plafond numérique de clarifications.");
  assert.match(pilot, /adpState\.clarifications\+=1/, "le compteur d'audit est conservé.");
});

test("le parcours normal API utilise un wrapper readiness sans modifier le moteur Architecte gelé", () => {
  const section = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  assert.match(section, /window\.appelFournisseur/);
  assert.match(section, /readinessInstruction/);
  assert.match(section, /adnAssessArchitecteReadiness/);
});

test("la technique 9 est réinjectée dans le prompt final seulement après execution_ready", () => {
  const api = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  const imported = html.slice(
    html.indexOf("function useAnalysis"),
    html.indexOf("function showQuestion")
  );
  assert.match(api, /adnAppendFinalExecutionDirective/);
  assert.match(imported, /adnAppendFinalExecutionDirective/);
});

test("aucun questionnaire de voyage ou autre domaine n'est codé dans la nouvelle couche", () => {
  const source = fs.readFileSync(path.join(root, "core/adn/execution-readiness.js"), "utf8").toLowerCase();
  for (const forbidden of ["rome", "florence", "voyage ->", "cv ->", "médical ->", "ordinateur ->"]) {
    assert.equal(source.includes(forbidden), false);
  }
});
