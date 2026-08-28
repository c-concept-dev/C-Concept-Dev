import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'core', 'adn');
const modules = [
  {
    file: 'adn-state.js',
    name: 'ADN',
    exports: ['ADN_STATE_VERSION','ADN_PROPERTY_IDS','ADN_TECHNIQUE_IDS','ADN_ETHIC_IDS','buildAdnState','validateAdnState','adnStateToExecutionContractSnapshot','createAdnAuditView']
  },
  {
    file: 'adaptive-lock-selector.js',
    name: 'LOCKS',
    exports: ['ADAPTIVE_LOCK_SELECTOR_VERSION','ADAPTIVE_LOCK_IDS','selectAdaptiveLocks','validateAdaptiveLockSelection','applyAdaptiveLocksToExecutionSnapshot','createAdaptiveLockAuditView']
  },
  {
    file: 'routing-engine.js',
    name: 'ROUTING',
    exports: ['ROUTING_ENGINE_VERSION','ROUTING_ENGINES','PREPARATION_SIGNAL_IDS','routeExecution','validateRoutingDecision','createRoutingAuditView']
  },
  {
    file: 'execution-readiness.js',
    name: 'READINESS',
    exports: ['EXECUTION_READINESS_VERSION','EXECUTION_READINESS_STATES','contractForContractualization','assessAnalysisReadiness','buildExecutionReadinessInstruction','buildFinalExecutionDirective','createReadinessAuditView']
  },
  {
    file: 'conversation-orchestrator.js',
    name: 'CONVERSATION',
    exports: ['CONVERSATION_ORCHESTRATOR_VERSION','CONVERSATION_STATES','conversationQuestionsSimilar','nextConversationAction','createConversationAuditEvent','validateConversationAuditEvent']
  },
  {
    file: 'engine-adapters.js',
    name: 'ADAPTERS',
    exports: ['ENGINE_ADAPTERS_VERSION','buildExecutionEnvelope','projectToRapide','projectToArchitecte','projectToAtelier','validateLegacyLockMapping','createAdapterAuditView'],
    deps: ['ADN','LOCKS','ROUTING','READINESS']
  }
];

function transform(source) {
  return source
    .replace(/^import[^;]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, '')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '');
}

const raw = modules.map((m) => fs.readFileSync(path.join(dir, m.file), 'utf8')).join('\n');
const sourceHash = crypto.createHash('sha256').update(raw).digest('hex');
let body = `/* GENERATED — LOT 10G.3B.3F.2\n * source-sha256: ${sourceHash}\n * Ne pas modifier manuellement. Régénérer avec tools/build-adn-browser-runtime.mjs\n */\n(function(global){\n'use strict';\n`;

for (const mod of modules) {
  const src = transform(fs.readFileSync(path.join(dir, mod.file), 'utf8'));
  if (mod.deps) {
    body += `const ${mod.name}=((deps)=>{\nconst {${[
      'buildAdnState','adnStateToExecutionContractSnapshot','selectAdaptiveLocks','validateAdaptiveLockSelection','routeExecution','validateRoutingDecision','contractForContractualization'
    ].join(',')}}=deps;\n${src}\nreturn {${mod.exports.join(',')}};\n})({...ADN,...LOCKS,...ROUTING,...READINESS});\n`;
  } else {
    body += `const ${mod.name}=(()=>{\n${src}\nreturn {${mod.exports.join(',')}};\n})();\n`;
  }
}
body += `global.__ATELIER_ADN_RUNTIME__=Object.freeze({...ADN,...LOCKS,...ROUTING,...READINESS,...CONVERSATION,...ADAPTERS,source_sha256:'${sourceHash}'});\n})(window);\n`;

const out = path.join(dir, 'browser-runtime.generated.js');
fs.writeFileSync(out, body);
const htmlPath = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const generatedBlock = /\/\* GENERATED — LOT 10G\.3B\.3F\.[12][\s\S]*?\}\)\(window\);\n/;
if (!generatedBlock.test(html)) throw new Error('Bloc runtime ADN embarqué introuvable dans le HTML.');
fs.writeFileSync(htmlPath, html.replace(generatedBlock, body));
console.log(JSON.stringify({status:'OK',source_sha256:sourceHash,output:out,html:htmlPath,bytes:Buffer.byteLength(body)}, null, 2));
