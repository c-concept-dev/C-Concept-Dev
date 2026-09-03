import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = path.join(root, 'core', 'adn');
/* ADN-ARCH-02-B1 — le moteur OPRIE (rôles, séquence, validateurs) vit sous
 * workers/shared. Il est EMBARQUÉ TEL QUEL, jamais recopié : c'est ce qui permet
 * au round-trip manuel d'utiliser le MÊME OPRIE que le serveur. */
const moduleDir = (mod) => (mod.dir ? path.join(root, ...mod.dir.split('/')) : CORE_DIR);
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
    file: 'oprie-canonical-mapping.js',
    name: 'CANON',
    exports: ['CANONICAL_CONTRACT_VERSION','CANONICAL_EVALUATION_MARKERS','CANONICAL_BASE_FIELDS','isCanonicalBaseContract','canonicalBaseToEnvelopeInput','OPRIE_STATES','OPRIE_EXECUTABLE_STATE','OPRIE_TRANSIENT_FIELDS','CANONICAL_SOURCES','SEMANTIC_SIGNAL_SOURCES','SEMANTIC_SIGNAL_PRIORITIES','mapOprieToCanonicalContract','validateCanonicalContract','createCanonicalMappingAuditView','validateCanonicalEnvelopeConvergence','CANONICAL_SEMANTIC_FIELDS','ACCEPTED_PRESENTATION_LOSSES','assertCanonicalReadinessInvariant','activeReadinessSourceCount','CANONICAL_READINESS_MATRIX']
  },
  {
    file: 'arch-canonical-enrichment.js',
    name: 'ARCHENRICH',
    exports: ['ARCH_ENRICHMENT_VERSION','ARCH_ENRICHABLE_PATHS','ARCH_SIGNALS','DECLARATION_STATUS_MAP','PROVENANCE_STATUS_MAP','FONDEMENT_NATURES','COMPONENT_TYPES','changedPaths','enrichCanonicalContractFromArchAnalysis','validateArchCanonicalEnrichment','validateArchSignals','createArchEnrichmentAuditView','ARCH_SIGNAL_POLICY','mergePostOprieSignals','ARCH_COMPILER_SEMANTIC_SOURCE','canonicalToArchProjectionInput','activeArchSemanticSourceCount'],
    deps: ['CANON']
  },
  /* ADN-ARCH-02-B1 — MOTEUR OPRIE EMBARQUÉ TEL QUEL.
   * Ces six modules ne sont pas recopiés : ce sont les fichiers de production du
   * serveur, embarqués sans transformation sémantique. Le round-trip manuel
   * d'Architecte Pro exécute donc EXACTEMENT le même OPRIE — mêmes rôles, même
   * séquence, mêmes prompts, mêmes schémas, mêmes validateurs. Seul le mécanisme
   * d'exécution d'un rôle change (collage humain, ou fournisseur navigateur). */
  {
    file: 'operational-request-state.js',
    name: 'ORSTATE',
    exports: ['OPERATIONAL_REQUEST_STATE_VERSION','OPERATIONAL_REQUEST_STATES','CANDIDATE_FIELDS','CANDIDATE_SCALAR_FIELDS','CANDIDATE_LIST_FIELDS','ISSUE_TYPES','CONFLICT_KINDS','PROVENANCE_VALUES','createEmptyCandidate','normalizeCandidate','normalizeIssues','normalizeProvenanceRecords','validateOriginalRequestRecord','isLegalTransition']
  },
  {
    dir: 'workers/shared',
    file: 'decision-core.js',
    name: 'DECISIONCORE',
    exports: ['DecisionHttpError','TRANSPORT_LIMITS','corsHeaders','jsonResponse','readJsonBody']
  },
  {
    dir: 'workers/shared',
    file: 'provider-ha.js',
    name: 'PROVIDERHA',
    exports: ['FAILURE_CLASSES']
  },
  {
    dir: 'workers/shared',
    file: 'operational-request-core.js',
    name: 'ORCORE',
    exports: ['OPRIE_ROLES','ARBITER_STATES','ROLE_DEFINITIONS','ANALYST_SYSTEM_PROMPT','CRITIC_SYSTEM_PROMPT','ARBITER_SYSTEM_PROMPT','ANALYST_JSON_SCHEMA','CRITIC_JSON_SCHEMA','ARBITER_JSON_SCHEMA','makeAnalystUserMessage','makeCriticUserMessage','makeArbiterUserMessage','parseAnalystOutput','parseCriticOutput','parseArbiterOutput','validateAnalystOutput','validateCriticOutput','validateArbiterOutput','validateDegradedRoleResult','createDegradedRoleResult','buildCriticJsonSchema','buildQuestionReviewTargets','validateAnalystInput'],
    deps: ['ORSTATE','DECISIONCORE']
  },
  {
    dir: 'workers/shared',
    file: 'role-degradation.js',
    name: 'ROLEDEG',
    exports: ['degradedResultFromProviderChainError'],
    deps: ['ORCORE','PROVIDERHA']
  },
  {
    dir: 'workers/shared',
    file: 'operational-request-orchestrator.js',
    name: 'ORORCH',
    exports: ['OPERATIONAL_REQUEST_ROLE_SEQUENCE','OPERATIONAL_REQUEST_TURN_ORIGIN_STATE','runOperationalRequestTurn','assertOrchestratedRolesCoverOprie'],
    deps: ['ORSTATE','ORCORE','DECISIONCORE','ROLEDEG']
  },
  {
    file: 'rapide-canonical-enrichment.js',
    name: 'RAPIDEENRICH',
    exports: ['RAPIDE_ENRICHMENT_VERSION','RAPIDE_ENRICHABLE_PATHS','RAPIDE_SIGNALS','RAPIDE_SIGNAL_IDS','normalizeRequestText','deriveQuantityFromRequest','deriveFormatFromRequest','enrichRapidCanonicalContract','validateRapidCanonicalEnrichment','createRapidEnrichmentAuditView'],
    deps: ['ARCHENRICH']
  },
  /* ADN-QG-02B — LE MOTEUR DE CONFORMITÉ DE SORTIE EST EMBARQUÉ.
   * Il est indépendant du gate contractuel : les deux frontières restent
   * distinctes, avant et après l'exécution. */
  {
    file: 'output-compliance-gate.js',
    name: 'OUTPUTQG',
    exports: ['OUTPUT_COMPLIANCE_GATE_VERSION','OUTPUT_COMPLIANCE_GATE_PRODUCTION_ACTIVE','OUTPUT_GATE_STATUSES','OUTPUT_VIOLATION_CODES','VERIFIABILITY_LEVELS','CHECK_STATUSES','MEASURABLE_UNITS','OUTPUT_TRACE_FORBIDDEN_FIELDS','normalizeOutput','countStructuralItems','detectStructuralFormat','measureOutput','executeOutputChecks','validateOutputAgainstCanonicalContract','auditOutputTrace']
  },
  /* ADN-QG-02D — le prototype de conformité de sortie a été SUPPRIMÉ de la
   * source ; il n'y a plus rien à exclure ici. La liste d'exports du gate de
   * prompt ne porte plus que la frontière pré-exécution, et aucun nom ne peut
   * donc plus en masquer un autre dans l'agrégat.
   *
   * ADN-QG-01 — LE GATE CONTRACTUEL EST EMBARQUÉ.
   * Une seule implémentation existe et elle est partagée : Rapide et Architecte
   * appellent la même fonction. Embarquer le module est ce qui rend ce partage
   * possible sans en recopier la moindre règle dans le navigateur. */
  {
    file: 'prompt-contract-gate.js',
    name: 'QG',
    exports: ['PROMPT_CONTRACT_GATE_VERSION','PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE','GATE_STATUSES','GATE_MODES','REQUIREMENT_STATUSES','VIOLATION_CODES','TRACE_FORBIDDEN_FIELDS','collectCanonicalRequirements','buildProjectionTrace','auditProjectionTrace','validatePromptAgainstCanonicalContract','guardPromptContract','PROMPT_CONTRACT_PUBLIC_MESSAGES','selectTraceEntriesForContract']
  },
  {
    file: 'oprie-manual-roundtrip.js',
    name: 'MANUAL',
    exports: ['MANUAL_ROUNDTRIP_VERSION','MANUAL_SESSION_STATES','ARCHITECTE_TURN_OUTCOMES','buildPortableRolePrompt','createManualRoleExecutor','createProviderRoleExecutor','runOprieTurnWithExecutor','startManualOprieTurn','buildArchitecteContractFromTurn'],
    deps: ['ORCORE','ORORCH','CANON','ARCHENRICH']
  },
  /* PERF-04 — LE PLAN RAPIDE EST EMBARQUÉ TEL QUEL.
   * Le frontend ne réimplémente rien : il appelle EXACTEMENT les fonctions de
   * PERF-03A. C'est ce qui garantit qu'il n'existe qu'une seule définition de
   * ce qu'est une interaction candidate valide, et qu'un navigateur ne peut pas
   * en accepter une que le serveur refuserait. */
  {
    file: 'fast-interactive-plane.js',
    dir: 'workers/shared',
    name: 'FASTPLANE',
    exports: ['FAST_INTERACTION_TYPES','ONE_NEXT_INTERACTION_MAX','FAST_FORBIDDEN_AUTHORITY_FIELDS','FAST_INTERACTION_JSON_SCHEMA','createTurnSnapshot','validateFastInteraction','CONVERSATIONAL_MODES','projectInteractionForMode','createTurnCoordinator','RECONCILIATION_OUTCOMES','reconcileFastWithDeep','runInteractiveTurn']
  },
  {
    file: 'engine-adapters.js',
    name: 'ADAPTERS',
    exports: ['ENGINE_ADAPTERS_VERSION','buildExecutionEnvelope','projectToRapide','projectToArchitecte','projectToAtelier','validateLegacyLockMapping','createAdapterAuditView'],
    deps: ['ADN','LOCKS','ROUTING','READINESS','CANON']
  }
];

function transform(source) {
  return source
    .replace(/^import[^;]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/g, '')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '');
}

const raw = modules.map((m) => fs.readFileSync(path.join(moduleDir(m), m.file), 'utf8')).join('\n');
const sourceHash = crypto.createHash('sha256').update(raw).digest('hex');
let body = `/* GENERATED — LOT 10G.3B.3F.2\n * source-sha256: ${sourceHash}\n * Ne pas modifier manuellement. Régénérer avec tools/build-adn-browser-runtime.mjs\n */\n(function(global){\n'use strict';\n`;

const emittedSegments = new Map();
for (const mod of modules) {
  const segmentStart = body.length;
  const src = transform(fs.readFileSync(path.join(moduleDir(mod), mod.file), 'utf8'));
  if (mod.deps) {
    /* La liste destructurée est DÉRIVÉE des imports réels du module : aucune liste
       maintenue à la main ne peut plus diverger de la source. */
    const imported = [...fs.readFileSync(path.join(moduleDir(mod), mod.file), 'utf8')
      .matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)]
      .flatMap((m) => m[1].split(',').map((n) => n.trim()).filter(Boolean));
    const unique = [...new Set(imported)];
    body += `const ${mod.name}=((deps)=>{\nconst {${unique.join(',')}}=deps;\n${src}\nreturn {${mod.exports.join(',')}};\n})({${mod.deps.map((d) => `...${d}`).join(',')}});\n`;
  } else {
    body += `const ${mod.name}=(()=>{\n${src}\nreturn {${mod.exports.join(',')}};\n})();\n`;
  }
  emittedSegments.set(mod.file, body.slice(segmentStart));
}
/* ADN-QG-01 — L'AGRÉGAT EST DÉRIVÉ, PLUS JAMAIS RECOPIÉ.
 * Cette ligne était maintenue à la main : un module pouvait être compilé dans
 * le bundle sans jamais être exposé au navigateur, silencieusement. C'est
 * exactement ce qui vient de se produire avec le gate. La liste vient désormais
 * de `modules`, si bien qu'ajouter un module suffit à l'exposer. */
body += `global.__ATELIER_ADN_RUNTIME__=Object.freeze({${modules.map((m) => `...${m.name}`).join(',')},source_sha256:'${sourceHash}'});\n})(window);\n`;

/* CORRECTION-ADN-CANON-02-01 — DURCISSEMENT DU BUILD.
 * Un patch précédent avait échoué silencieusement sur une ancre, produisant un
 * bundle où une dépendance déclarée n'était pas injectée, sans qu'aucun test ne
 * le voie. Le build vérifie désormais que CHAQUE export et CHAQUE dépendance
 * déclarés sont réellement présents, et s'interrompt en code non nul sinon. */
const missing = [];
for (const mod of modules) {
  if (!body.includes(`...${mod.name},`) && !body.includes(`...${mod.name},source_sha256`)) {
    missing.push(`${mod.file} -> module compilé mais non exposé sur __ATELIER_ADN_RUNTIME__`);
  }
}
for (const mod of modules) {
  /* On vérifie la SOURCE du module, pas le corps émis : le corps contient déjà
     la liste des exports dans son `return`, ce qui rendrait le contrôle vacu. */
  const moduleSource = fs.readFileSync(path.join(moduleDir(mod), mod.file), 'utf8');
  for (const name of mod.exports) {
    const declared = new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function|class)\\s+${name}\\b`).test(moduleSource);
    if (!declared) missing.push(`${mod.file} -> export déclaré mais introuvable : ${name}`);
  }
  /* La dépendance est contrôlée dans le SEGMENT du module : `...CANON` figure
     aussi dans l'agrégat final, ce qui rendrait un contrôle global vacu. */
  const segment = emittedSegments.get(mod.file) || '';
  for (const dep of mod.deps || []) {
    if (!segment.includes(`...${dep}`)) missing.push(`${mod.file} -> dépendance ${dep} non injectée`);
  }
  /* Chaque symbole importé depuis un autre module doit être DESTRUCTURÉ dans
     l'IIFE, sinon il reste indéfini à l'exécution navigateur alors que les
     tests en module ES passent. C'est exactement ce défaut qui s'est produit. */
  if (mod.deps) {
    const destructured = (segment.match(/^const \{([^}]*)\}=deps;$/m) || [, ''])[1].split(',').map((n) => n.trim().replace(/'/g, ''));
    for (const match of moduleSource.matchAll(/import \{([^}]*)\} from '\.\/[^']+\.js'/g)) {
      for (const name of match[1].split(',').map((n) => n.trim())) {
        if (name && !destructured.includes(name)) {
          missing.push(`${mod.file} -> symbole importé non destructuré dans le bundle : ${name}`);
        }
      }
    }
  }
}
if (missing.length) {
  console.error('Build ADN interrompu : insertions obligatoires manquantes.\n  ' + missing.join('\n  '));
  process.exit(1);
}

const out = path.join(CORE_DIR, 'browser-runtime.generated.js');
fs.writeFileSync(out, body);
const htmlPath = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const generatedBlock = /\/\* GENERATED — LOT 10G\.3B\.3F\.[12][\s\S]*?\}\)\(window\);\n/;
if (!generatedBlock.test(html)) throw new Error('Bloc runtime ADN embarqué introuvable dans le HTML.');
/* ADN-RAPIDE-ENRICH-00 — REMPLACEMENT LITTÉRAL OBLIGATOIRE.
 * `String.replace` avec une chaîne interprète `$&`, `$\`` et `$'`. Un module
 * embarqué contenant `'\\$&'` — un échappement de regex parfaitement banal —
 * faisait donc réinsérer l'ancien bloc à chaque build, et le HTML gagnait une
 * copie complète du runtime à chaque fois. Une fonction de remplacement
 * désactive toute substitution : le corps est inséré tel quel, toujours. */
fs.writeFileSync(htmlPath, html.replace(generatedBlock, () => body));

/* Garde : après écriture, il doit rester EXACTEMENT un bloc généré. */
const written = fs.readFileSync(htmlPath, 'utf8');
const blocks = (written.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length;
if (blocks !== 1) {
  console.error(`Build ADN interrompu : ${blocks} blocs runtime dans le HTML, attendu 1.`);
  process.exit(1);
}
console.log(JSON.stringify({status:'OK',source_sha256:sourceHash,output:out,html:htmlPath,bytes:Buffer.byteLength(body)}, null, 2));
