/* Temporary, opt-in browser investigation. Never loaded by the product.
 * No request/response bodies, keys, headers or document contents are recorded. */
(() => {
  if (window.__launchDiagnostic) return;
  const started = performance.now(), events = [];
  const emit = (event, details = {}) => {
    const row = { ms: Math.round(performance.now() - started), event, ...details };
    events.push(row);
    console.log('LAUNCH_AUDIT', JSON.stringify(row));
  };
  const state = () => ({
    mode: document.querySelector('#ui-mode-select')?.value,
    gate: document.querySelector('#ui-rapid-gate')?.dataset.state,
    gateVisible: document.querySelector('#ui-rapid-gate')?.hidden === false,
    answerDisabled: document.querySelector('#v11-answer-continue')?.disabled,
    panels: ['v11-api-progress', 'v11-exchange', 'v11-dialogue', 'v11-ready', 'ui-rapid-result']
      .filter(id => document.getElementById(id)?.hidden === false),
    promptChars: document.querySelector('#v11-final')?.value?.length || 0,
    demandChars: document.querySelector('#v11-demande')?.value?.length || 0
  });
  const originalFetch = window.fetch;
  let sequence = 0;
  window.fetch = async function(input, init) {
    const id = ++sequence;
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.origin + url.pathname;
    const at = performance.now();
    emit('request', { id, path, bytes: typeof init?.body === 'string' ? new TextEncoder().encode(init.body).length : null });
    const onAbort = () => emit('abort', { id });
    init?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await originalFetch.apply(this, arguments);
      emit('headers', { id, status: response.status, duration: Math.round(performance.now() - at) });
      for (const method of ['json', 'text']) {
        const original = response[method];
        response[method] = async function() {
          try {
            const value = await original.apply(this, arguments);
            emit('body', { id, method, duration: Math.round(performance.now() - at),
              state: method === 'json' && typeof value?.state === 'string' ? value.state : null });
            return value;
          } catch (error) { emit('body_error', { id, name: error?.name }); throw error; }
        };
      }
      return response;
    } catch (error) { emit('fetch_error', { id, name: error?.name, duration: Math.round(performance.now() - at) }); throw error; }
  };
  const error = e => emit('javascript_error', { name: e.error?.name, line: e.lineno, column: e.colno });
  const rejection = e => emit('unhandled_rejection', { name: e.reason?.name,
    frames: String(e.reason?.stack || '').split('\n').filter(l => /\.html:\d+:\d+|\.js:\d+:\d+/.test(l)).slice(0, 4) });
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  const click = e => { if (e.target.closest('#ui-main-action,#v11-answer-continue')) emit('launch_click', state()); };
  document.addEventListener('click', click, true);
  let previous = '';
  const sample = () => { const s = state(), encoded = JSON.stringify(s); if (encoded !== previous) { previous = encoded; emit('ui_state', s); } };
  const observer = new MutationObserver(sample);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__launchDiagnostic = { events, sample, stop() {
    observer.disconnect(); window.fetch = originalFetch;
    window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection);
    document.removeEventListener('click', click, true);
    delete window.__launchDiagnostic;
  } };
  sample(); emit('installed');
})();
