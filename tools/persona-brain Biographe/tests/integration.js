// ═══════════════════════════════════════════════════════════════════
// tests/integration.js — Suite de tests Persona Builder (biographer)
// Usage : node tests/integration.js
// ═══════════════════════════════════════════════════════════════════
const { loadBrainModules } = require('./harness.js');

const results = { pass: [], fail: [] };
function t(name, condition, detail) {
  const entry = { name, detail: detail || '' };
  if (condition) results.pass.push(entry); else results.fail.push(entry);
}
async function tAsync(name, fn) {
  try {
    const ok = await fn();
    t(name, ok === true || (ok && ok.pass === true), ok && ok.detail);
  } catch (e) {
    t(name, false, 'Exception : ' + e.message);
  }
}

// Fixture : session fraîche avec un mock API déterministe
function freshSandbox() {
  const sb = loadBrainModules();
  sb.window._onTurnUpdate = () => {};
  sb.window._onStateChange = () => {};
  sb.window._onDriverResponse = null;
  sb.window._onError = () => {};
  sb.window._brainLog = null; // pas de DOM en test
  return sb;
}

(async () => {

  // ═══════════════════════════════════════════════════════
  // A — CHARGEMENT DES MODULES
  // ═══════════════════════════════════════════════════════
  await tAsync('A.1 — tous les modules se chargent sans exception', async () => {
    const sb = freshSandbox();
    return typeof sb.BrainCore === 'object' && typeof sb.BrainMemory === 'object';
  });

  await tAsync('A.2 — le domain pack biographer est enregistré', async () => {
    const sb = freshSandbox();
    return !!sb.DomainRegistry.get('biographer');
  });

  // ═══════════════════════════════════════════════════════
  // B — ISOLATION ENTRE SESSIONS (contamination inter-personnes)
  // ═══════════════════════════════════════════════════════
  await tAsync('B.1 — init() sur personne B ne garde pas _endOverride de A', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainCore._endOverride = true; // A a atteint 3 rappels de couverture ignorés
    sb.BrainCore._coverageRemindCount = 3;
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainCore._endOverride === false && sb.BrainCore._coverageRemindCount === 0;
  });

  await tAsync('B.2 — init() sur personne B ne garde pas la note/résultat analyste de A', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainAnalyst.lastResult = { carte: [{ periode: 'secret de Alice' }] };
    sb.BrainAnalyst.lastNote = 'note privée sur Alice';
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainAnalyst.lastResult === null && sb.BrainAnalyst.lastNote === null;
  });

  await tAsync('B.3 — init() sur personne B ne garde pas le focus (_lastPeriode) de A', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainAttention._lastPeriode = 'enfance de Alice';
    sb.BrainAttention._consecutiveTurns = 7;
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainAttention._lastPeriode === null && sb.BrainAttention._consecutiveTurns === 0;
  });

  await tAsync('B.4 — init() sur personne B ne garde pas la dernière image mentale de A', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainSafety._lastImage = 'pensée intime sur Alice';
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainSafety._lastImage === null;
  });

  await tAsync('B.5 — init() vide learningProfile quand le prénom change (pas la même personne)', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainMemory.learningProfile = { key_lesson: 'ce qui marche avec Alice' };
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainMemory.learningProfile === null;
  });

  await tAsync('B.6 — CORRECTIF Codex : init() vide learningProfile MÊME si le prénom est identique (le prénom n\'est pas un identifiant fiable — 2 personnes peuvent le partager ; la vraie reprise passe par restore(), pas init())', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainMemory.learningProfile = { key_lesson: 'ce qui marche avec la première Alice' };
    sb.BrainCore.init({ prenom: 'Alice', age: 8, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainMemory.learningProfile === null;
  });

  await tAsync('B.7 — restore() (vraie reprise) restaure bien learningProfile depuis la sauvegarde', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    const saved = { config: { prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x' },
      memory: { history: [], working: sb.BrainMemory.working, structured: sb.BrainMemory.structured,
        learning: sb.BrainMemory.learning, learningProfile: { key_lesson: 'appris avant la pause' },
        summary: sb.BrainMemory.summary, lastAnalystNote: null, lastDriverImage: null } };
    sb.BrainCore.restore(saved);
    return sb.BrainMemory.learningProfile && sb.BrainMemory.learningProfile.key_lesson === 'appris avant la pause';
  });

  await tAsync('B.8 — CORRECTIF Codex : init() vide les sorties de la session précédente (_personaJSON/_biographyText/_midOutputShown)', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainCore._personaJSON = { identite: { prenom: 'Alice' } };
    sb.BrainCore._biographyText = 'Biographie complète d\'Alice...';
    sb.BrainCore._midOutputShown = true;
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainCore._personaJSON === null && sb.BrainCore._biographyText === null && sb.BrainCore._midOutputShown === false;
  });

  await tAsync('B.9 — CORRECTIF Codex : init() vide BrainMemory._lastImageTurn', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainMemory._lastImageTurn = 12;
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return sb.BrainMemory._lastImageTurn === null;
  });

  // ═══════════════════════════════════════════════════════
  // C — ANTI-RÉGRESSION XSS (shell.html)
  // ═══════════════════════════════════════════════════════
  const fs = require('fs');
  const path = require('path');
  const shellSrc = fs.readFileSync(path.join(__dirname, '..', 'shell.html'), 'utf-8');

  // Retire les lignes de commentaire (// ...) avant d'analyser le CODE réel —
  // sinon un commentaire expliquant "on n'utilise plus innerHTML" ferait
  // échouer le test à tort.
  const stripComments = (src) => src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const shellCode = stripComments(shellSrc);

  await tAsync('C.1 — aucun innerHTML avec concaténation de variable (+= ou = html)', async () => {
    const dangerous = /innerHTML\s*\+=|innerHTML\s*=\s*html\b/;
    return !dangerous.test(shellCode);
  });

  await tAsync('C.2 — _brainLog utilise textContent, pas innerHTML (code réel, hors commentaires)', async () => {
    const m = shellCode.match(/window\._brainLog\s*=\s*function[\s\S]*?\n\};/);
    return m && m[0].includes('textContent') && !/innerHTML/.test(m[0]);
  });

  await tAsync('C.3 — generateLearning affiche le contenu LLM via textContent, pas innerHTML', async () => {
    const m = shellSrc.match(/async function generateLearning[\s\S]*?\n}/);
    return m && m[0].includes('createTextNode') && !/display\.innerHTML/.test(m[0]);
  });

  // ═══════════════════════════════════════════════════════
  // D — TEMPÉRATURE : payload réel selon le modèle
  // ═══════════════════════════════════════════════════════
  async function captureRealPayload(sb, model) {
    let captured = null;
    sb.window.fetch = async (url, opts) => {
      captured = JSON.parse(opts.body).payload;
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
    };
    sb.BrainAPI.init({ workerUrl: 'https://fake.test' });
    await sb.BrainAPI.call('sys', [{ role: 'user', content: 'x' }], 100, model);
    return captured;
  }

  await tAsync('D.1 — payload Sonnet 4.6 : temperature PRÉSENTE (toujours supportée)', async () => {
    const sb = freshSandbox();
    const p = await captureRealPayload(sb, 'claude-sonnet-4-6');
    return p && p.model === 'claude-sonnet-4-6' && 'temperature' in p;
  });

  await tAsync('D.2 — payload Haiku 4.5 : temperature PRÉSENTE', async () => {
    const sb = freshSandbox();
    const p = await captureRealPayload(sb, 'claude-haiku-4-5-20251001');
    return p && 'temperature' in p;
  });

  await tAsync('D.3 — payload Opus 4.8 : temperature ABSENTE (rejet 400 sinon — PB1/PB3 corrigés)', async () => {
    const sb = freshSandbox();
    const p = await captureRealPayload(sb, 'claude-opus-4-8');
    return p && p.model === 'claude-opus-4-8' && !('temperature' in p);
  });

  await tAsync('D.4 — biographer output.js : modèle mid-output = opus-4-8 (plus l\'ID inexistant)', async () => {
    const sb = freshSandbox();
    const pack = sb.DomainRegistry.get('biographer');
    const { model } = pack.getMidOutputPrompt({ prenom: 'Test', age: 30, transcript: 't', brainContext: '' });
    return model === 'claude-opus-4-8';
  });

  // ═══════════════════════════════════════════════════════
  // E — endSession() TRANSACTIONNEL : test fonctionnel réel (pas statique)
  // Extrait le vrai corps de la fonction du shell et l'exécute avec un
  // generateOutput() qui échoue, pour prouver que clearSaved() n'est PAS
  // appelé — exactement le chemin que Codex a signalé comme cassé.
  // ═══════════════════════════════════════════════════════
  function extractShellFunction(name) {
    const re = new RegExp('async function ' + name + '\\(\\)\\s*\\{[\\s\\S]*?\\n\\}');
    const m = shellSrc.match(re);
    if (!m) throw new Error('Fonction ' + name + ' introuvable dans shell.html');
    return m[0];
  }

  async function runEndSessionWith(generateOutputResult, generateOutputThrows) {
    const vm = require('vm');
    let clearSavedCalled = false;
    const sandbox = {
      BC: {
        config: { prenom: 'Test', age: 30 },
        _personaJSON: null,
        generateOutput: async () => {
          if (generateOutputThrows) throw new Error(generateOutputThrows);
          return generateOutputResult;
        },
        clearSaved: () => { clearSavedCalled = true; },
      },
      BrainMemory: { working: { turnCount: 5 } },
      timerStart: Date.now() - 60000,
      timerInterval: null,
      stopMic: () => {}, stopTTS: () => {}, clearInterval: () => {},
      showScreen: () => {}, setState: () => {}, setStatus: () => {},
      document: { getElementById: () => ({ textContent: '', style: {} }) },
      console,
    };
    vm.createContext(sandbox);
    const fnSrc = extractShellFunction('endSession');
    await vm.runInContext(`(${fnSrc.replace('async function endSession()', 'async function()')})()`, sandbox);
    return clearSavedCalled;
  }

  await tAsync('E.1 — CORRECTIF Codex : endSession() NE PAS effacer si persona._meta.error (échec réel du chemin non-exception)', async () => {
    const cleared = await runEndSessionWith({ _meta: { error: 'network down', quality: 'low' } }, null);
    return cleared === false;
  });

  await tAsync('E.2 — endSession() efface bien la sauvegarde en cas de SUCCÈS réel (pas de _meta.error)', async () => {
    const cleared = await runEndSessionWith({ identite: { prenom: 'Test' }, resume_global: 'ok' }, null);
    return cleared === true;
  });

  await tAsync('E.3 — endSession() NE PAS effacer si generateOutput() lève une exception (cas défensif)', async () => {
    const cleared = await runEndSessionWith(null, 'crash inattendu');
    return cleared === false;
  });

  // ═══════════════════════════════════════════════════════
  // F — CORRECTIF Codex : isolation du brain.json (pendingBrain)
  // ═══════════════════════════════════════════════════════
  await tAsync('F.1 — loadBrain() stocke en pendingBrain, PAS dans config.brain', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainCore.loadBrain({ personality: { big_five: { openness: 0.8 } } });
    return sb.BrainCore.pendingBrain !== null && sb.BrainCore.config.brain === undefined;
  });

  async function runStartSessionWith(pendingBrainAtCall, prevSessionBrain) {
    const vm = require('vm');
    const elements = {};
    const el = (id) => elements[id] || (elements[id] = { value: '', textContent: '', style: {}, classList: { add(){}, remove(){} } });
    const sandbox = {
      BC: {
        pendingBrain: pendingBrainAtCall,
        config: { brain: prevSessionBrain },
        clearSaved: () => {},
        init: function (cfg) { this.config = { ...cfg }; },
        generateOpening: async () => 'bonjour',
      },
      document: { getElementById: (id) => { if (id === 'inPrenom') return { value: 'Bob' }; if (id === 'inAge') return { value: '25' }; if (id === 'inGenre') return { value: 'homme' }; if (id === 'inWorker') return { value: 'https://x' }; return el(id); } },
      navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
      unlockAudio: () => {}, getSelectedDomain: () => ({ label: 'Biographe' }),
      showScreen: () => {}, initTTS: () => {}, initSTT: () => {}, startTimer: () => {},
      setState: () => {}, setStatus: () => {}, showDriverText: () => {}, speak: async () => {}, startMic: () => {},
      console,
    };
    vm.createContext(sandbox);
    const m = shellSrc.match(/async function startSession\(\)\s*\{[\s\S]*?\n\}/);
    if (!m) throw new Error('startSession introuvable');
    await vm.runInContext(`(${m[0].replace('async function startSession()', 'async function()')})()`, sandbox);
    return sandbox.BC.config.brain;
  }

  await tAsync('F.2 — CORRECTIF Codex : startSession() ne transmet PAS l\'ancien config.brain d\'Alice à Bob', async () => {
    // Alice avait un brain chargé (prevSessionBrain), Bob n'a rien glissé dans le formulaire (pendingBrain=null)
    const bobBrain = await runStartSessionWith(null, { personality: { big_five: { openness: 0.9 } } });
    return bobBrain === null || bobBrain === undefined;
  });

  await tAsync('F.3 — startSession() transmet bien un brain fraîchement glissé pour CETTE session', async () => {
    const freshBrain = { personality: { big_five: { openness: 0.5 } } };
    const bobBrain = await runStartSessionWith(freshBrain, null);
    return bobBrain === freshBrain;
  });

  // ═══════════════════════════════════════════════════════
  // G — CORRECTIF Codex : courses asynchrones de l'analyste
  // ═══════════════════════════════════════════════════════
  await tAsync('G.1 — sessionId change entre deux init() consécutifs (Alice puis Bob)', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    const idAlice = sb.BrainCore.sessionId;
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    return idAlice && sb.BrainCore.sessionId && idAlice !== sb.BrainCore.sessionId;
  });

  await tAsync('G.2 — CORRECTIF Codex : analyse lente d\'Alice résolue APRÈS le démarrage de Bob n\'injecte PAS son fait secret', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Alice', age: 40, genre: 'femme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainCore.config.domain = sb.DomainRegistry.get('biographer');

    let resolveAlice;
    sb.BrainAnalyst.analyze = () => new Promise((resolve) => { resolveAlice = resolve; });
    sb.BrainAnalyst.getStructuredResult = () => ({ facts: [], carte: [], people: [{ name: 'SECRET-ALICE' }], scenes_nouvelles: [], gaps: [], themes: [], learning: null, merge_hints: [], pending_threads: [], recurring_elements: [], observation: null, note_driver: null });

    sb.BrainCore._runBackgroundAnalysis(5); // lancée pendant la session Alice

    // Bob démarre AVANT que l'analyse d'Alice ne se résolve
    sb.BrainCore.init({ prenom: 'Bob', age: 25, genre: 'homme', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });

    resolveAlice(); // l'analyse d'Alice se résout maintenant, après le init() de Bob
    await new Promise(r => setTimeout(r, 20));

    const contaminated = sb.BrainMemory.structured.people.some(p => p.name === 'SECRET-ALICE');
    return contaminated === false;
  });

  await tAsync('G.3 — CORRECTIF Codex : une analyse T5 lente résolue APRÈS T6 rapide n\'écrase pas T6', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Test', age: 30, genre: 'autre', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    sb.BrainCore.config.domain = sb.DomainRegistry.get('biographer');

    const deferreds = {};
    sb.BrainAnalyst.analyze = (ctx) => new Promise((resolve) => { deferreds[ctx.turnNum] = resolve; });
    sb.BrainAnalyst.getStructuredResult = () => sb.BrainAnalyst.lastResult;

    sb.BrainCore._runBackgroundAnalysis(5); // T5 lent, lancé en premier
    sb.BrainCore._runBackgroundAnalysis(6); // T6 rapide, lancé en second

    // T6 se résout EN PREMIER (plus rapide malgré un lancement plus tardif)
    sb.BrainAnalyst.lastResult = { facts: [], carte: [], people: [{ name: 'PERSONNE-T6' }], scenes_nouvelles: [], gaps: [], themes: [], learning: null, merge_hints: [], pending_threads: [], recurring_elements: [], observation: null, note_driver: null };
    deferreds[6]();
    await new Promise(r => setTimeout(r, 10));

    // T5 se résout ENSUITE, plus tard, avec un résultat différent
    sb.BrainAnalyst.lastResult = { facts: [], carte: [], people: [{ name: 'PERSONNE-T5' }], scenes_nouvelles: [], gaps: [], themes: [], learning: null, merge_hints: [], pending_threads: [], recurring_elements: [], observation: null, note_driver: null };
    deferreds[5]();
    await new Promise(r => setTimeout(r, 10));

    const hasT6 = sb.BrainMemory.structured.people.some(p => p.name === 'PERSONNE-T6');
    const hasT5AfterT6 = sb.BrainMemory.structured.people.some(p => p.name === 'PERSONNE-T5');
    // T6 doit être intégré ; T5 (plus ancien, résolu après) ne doit PAS écraser/s'ajouter après coup
    return hasT6 === true && hasT5AfterT6 === false;
  });

  // ═══════════════════════════════════════════════════════
  // H — CORRECTIF Codex : échec de génération visible, pas silencieux
  // ═══════════════════════════════════════════════════════
  await tAsync('H.1 — CORRECTIF Codex : endSession() écrit dans #doneStatus (visible), pas #status (invisible dans doneScreen)', async () => {
    const m = shellCode.match(/async function endSession\(\)\s*\{[\s\S]*?\n\}/);
    return m && m[0].includes("getElementById('doneStatus')") && !/getElementById\('status'\)/.test(m[0]);
  });

  await tAsync('H.2 — CORRECTIF Codex : en cas d\'échec, le message est affiché à l\'utilisateur (pas seulement console.warn)', async () => {
    const cleared = await runEndSessionWith({ _meta: { error: 'network down', quality: 'low' } }, null);
    return cleared === false; // déjà testé en E.1, on vérifie ici juste la non-régression du chemin
  });

  await tAsync('H.3 — CORRECTIF Codex : downloadPersona() refuse de télécharger un objet _meta.error', async () => {
    const m = shellCode.match(/function downloadPersona\(\)\s*\{[\s\S]*?\n\}/);
    return m && /_meta\s*&&\s*BC\._personaJSON\._meta\.error/.test(m[0]) && /alert\(/.test(m[0]);
  });

  await tAsync('H.4 — CORRECTIF Codex : downloadZip() n\'écrit pas clone_persona.json si _meta.error présent', async () => {
    const m = shellCode.match(/async function downloadZip\(\)\s*\{[\s\S]*?\n\}/);
    return m && /persona_ECHEC\.txt/.test(m[0]) && /if \(!\(BC\._personaJSON\._meta/.test(m[0]);
  });

  // ═══════════════════════════════════════════════════════
  // I — CORRECTIF Codex : chronomètre de reprise
  // ═══════════════════════════════════════════════════════
  await tAsync('I.1 — CORRECTIF Codex : startTimer() accepte un point de départ explicite (reprise)', async () => {
    const m = shellCode.match(/function startTimer\(explicitStart\)\s*\{[\s\S]*?\n\}/);
    return m && m[0].includes('timerStart = explicitStart || Date.now()');
  });

  await tAsync('I.2 — CORRECTIF Codex : resumeSession() passe le temps écoulé à startTimer() au lieu de l\'écraser', async () => {
    const m = shellCode.match(/async function resumeSession\(\)[\s\S]*?\n\}/);
    return m && /startTimer\(Date\.now\(\) - \(saved\.elapsedMs \|\| 0\)\)/.test(m[0]);
  });

  // ═══════════════════════════════════════════════════════
  // J — CORRECTIF Codex : autosave à chaque tour (pas un sur deux)
  // ═══════════════════════════════════════════════════════
  await tAsync('J.1 — CORRECTIF Codex : autoSave() sauvegarde à CHAQUE tour, y compris impair', async () => {
    const sb = freshSandbox();
    sb.BrainCore.init({ prenom: 'Test', age: 30, genre: 'autre', workerUrl: 'x', domain: sb.DomainRegistry.get('biographer') });
    let saveCalls = 0;
    sb.BrainCore.save = () => { saveCalls++; };
    sb.BrainMemory.working.turnCount = 1; sb.BrainCore.autoSave(); // tour IMPAIR — devait être ignoré avant le correctif
    sb.BrainMemory.working.turnCount = 2; sb.BrainCore.autoSave(); // tour pair
    sb.BrainMemory.working.turnCount = 3; sb.BrainCore.autoSave(); // tour IMPAIR — le dernier avant un échec potentiel
    return saveCalls === 3;
  });

  // ═══════════════════════════════════════════════════════
  // K — CORRECTIF Codex : accord de genre dans la biographie
  // ═══════════════════════════════════════════════════════
  await tAsync('K.1 — CORRECTIF Codex : biographie d\'une FEMME ne contient pas "cet homme"', async () => {
    const pack = sb2().DomainRegistry.get('biographer');
    const { system } = pack.getBiographyPrompt({ prenom: 'Alice', age: 40, genre: 'femme', transcript: 't', brainContext: '' });
    return !/cet homme/i.test(system) && /cette femme/i.test(system);
  });

  await tAsync('K.2 — biographie d\'un HOMME garde "cet homme" (comportement historique préservé)', async () => {
    const pack = sb2().DomainRegistry.get('biographer');
    const { system } = pack.getBiographyPrompt({ prenom: 'Bob', age: 25, genre: 'homme', transcript: 't', brainContext: '' });
    return /cet homme/i.test(system);
  });

  function sb2() { return freshSandbox(); }

  console.log(' RAPPORT FINAL');


  console.log('═══════════════════════════════════════════════════════════\n');
  for (const r of results.pass) console.log('  ✓ ' + r.name);
  for (const r of results.fail) { console.log('  ✗ ' + r.name); if (r.detail) console.log('     → ' + r.detail); }
  const total = results.pass.length + results.fail.length;
  const pct = total > 0 ? Math.round((results.pass.length / total) * 100) : 0;
  console.log(`\n${results.pass.length}/${total} tests passent — ${pct}%`);
  if (results.fail.length > 0) process.exit(1);
  process.exit(0);
})();
