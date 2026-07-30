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
      document: { getElementById: () => ({ textContent: '' }) },
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
