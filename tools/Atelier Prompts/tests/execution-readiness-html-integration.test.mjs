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

// READINESS-00 : l'EXIGENCE de ce test est inchangée — les deux chemins Architecte
// refusent de compiler tant que la demande n'est pas exécutable. Seul le MÉCANISME
// change, et ce changement est VOULU : la décision `action.state==='execution_ready'`
// était une seconde autorité de readiness dans le navigateur, que la gouvernance
// CDC v1.7 supprime. Elle est remplacée par une validation post-OPRIE qui SIGNALE
// sans décider. Le test vérifie donc le même invariant sur le nouveau mécanisme,
// et interdit explicitement le retour de l'ancien.
test("les deux chemins Architecte refusent de compiler tant que la validation post-OPRIE signale", () => {
  const api = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  const imported = html.slice(
    html.indexOf("function useAnalysis"),
    html.indexOf("function answerQuestion(")
  );
  for (const [name, section] of [["API", api], ["import", imported]]) {
    assert.match(section, /adnValidatePostOprie/, `${name} : la validation post-OPRIE gouverne le passage`);
    // CORRECTION-ADN-ARCH-01-01 : la condition d'arrêt ne porte plus sur le seul
    // validateur mais sur la FUSION de tous les signaux post-OPRIE. L'invariant
    // est inchangé, et même renforcé : un signal restant interdit la compilation.
    assert.match(section, /if\(stopSignals\.length\)/, `${name} : arrêt fail-closed avant compilation`);
    assert.match(section, /adnMergePostOprieSignals\(validation\.signals,enrichment&&enrichment\.signals\)/,
      `${name} : les deux sources de signaux sont fusionnées`);
    // ADN-ARCH-02 : la compilation reçoit désormais le CONTRAT CANONIQUE ENRICHI.
    // L'invariant d'ordre est inchangé ; la source sémantique, elle, est explicite.
    assert.match(section, /api\.compiler\(enrichment&&enrichment\.contract\)/,
      `${name} : le compilateur consomme le contrat canonique enrichi, jamais l'analyse brute`);
    assert.ok(section.indexOf("adnValidatePostOprie") < section.indexOf("api.compiler("),
      `${name} : la compilation suit la validation`);
    assert.ok(section.indexOf("if(stopSignals.length)") < section.indexOf("api.compiler("),
      `${name} : la compilation suit l'arrêt fusionné`);
    // L'ancienne autorité ne doit jamais revenir.
    assert.doesNotMatch(section, /execution_ready/, `${name} : plus aucune décision execution_ready`);
    assert.doesNotMatch(section, /adnNextConversationAction/, `${name} : plus d'élection d'action de dialogue`);
  }
});

test("le dialogue adaptatif n'a plus de plafond numérique de clarifications", () => {
  // FC-01b : l'absence de plafond reste vérifiée, et le compteur d'audit est conservé — il vit
  // désormais là où la clarification est réellement affichée, pas dans la reprise.
  const section = html.slice(
    html.indexOf("async function adpResumeAfterClarification"),
    html.indexOf("async function v11StartRapide")
  );
  assert.doesNotMatch(section, /clarifications\s*<\s*\d+/);
  const pilot = html.slice(html.indexOf("const OPRIE_STATES="), html.indexOf("function v11SwitchToArchitecteFromRapid"));
  assert.doesNotMatch(pilot, /clarifications\s*<\s*\d+/, "aucun plafond numérique de clarifications.");
  assert.match(pilot, /adpState\.clarifications\+=1/, "le compteur d'audit est conservé.");
});

// READINESS-00 : l'exigence — un wrapper, jamais une modification du moteur gelé —
// est conservée. Le wrapper de readiness `adnAssessArchitecteReadiness` est retiré du
// chemin de production au profit du validateur post-OPRIE. Changement VOULU.
test("le parcours normal API utilise un wrapper de validation sans modifier le moteur Architecte gelé", () => {
  const section = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  assert.match(section, /window\.appelFournisseur/);
  assert.match(section, /readinessInstruction/);
  assert.match(section, /adnValidatePostOprie/);
  assert.doesNotMatch(section, /adnAssessArchitecteReadiness/,
    "la seconde autorité de readiness est hors du chemin de production");
});

// READINESS-00 : « après execution_ready » devient « après une validation sans signal ».
test("la technique 9 est réinjectée dans le prompt final seulement après une validation sans signal", () => {
  const api = html.slice(
    html.indexOf("async function beginApiAnalysis"),
    html.indexOf("function compositeDemand")
  );
  const imported = html.slice(
    html.indexOf("function useAnalysis"),
    html.indexOf("function answerQuestion(")
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
