// ═══════════════════════════════════════════════════════════════════
// HARNESS — charge les modules navigateur (window.X = X) dans Node
// Persona Builder n'a pas de bundler ni de module system : chaque
// fichier fait `const X = {...}; window.X = X;` en s'appuyant sur les
// globals déjà chargés par les <script> précédents dans shell.html.
// Ce harnais simule ce même ordre de chargement en environnement Node.
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBrainModules() {
  // localStorage minimal en mémoire (Node n'en a pas nativement)
  function makeLocalStorage() {
    const store = {};
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        // Simule le quota réel du navigateur (~5MB) pour tester la saturation
        if (typeof v === 'string' && v.length > 5 * 1024 * 1024) {
          const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
        }
        store[k] = String(v);
      },
      removeItem: (k) => { delete store[k]; },
      _dump: () => ({ ...store }),
    };
  }

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    TextEncoder,
    TextDecoder,
    localStorage: makeLocalStorage(),
    window: {},
  };
  sandbox.window = sandbox; // window.X et X global pointent au même endroit
  vm.createContext(sandbox);

  const root = path.join(__dirname, '..');
  const files = [
    'brain/brain-api.js',
    'brain/brain-safety.js',
    'brain/brain-memory.js',
    'brain/brain-analyst.js',
    'brain/brain-attention.js',
    'brain/brain-prompt.js',
    'brain/brain-core.js',
    'brain/domain-registry.js',
    'domains/biographer/identity.js',
    'domains/biographer/cognition.js',
    'domains/biographer/output.js',
    'domains/biographer/_pack.js',
  ];
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf-8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadBrainModules };
