// ═══════════════════════════════════════════════════════════════════
// BRAIN-API.js — Le transporteur
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Responsabilité unique : appels API vers le Worker proxy.
// Pas de logique métier. Pas de prompt. Pas de parsing sémantique.
// ═══════════════════════════════════════════════════════════════════

const BrainAPI = {

  workerUrl: '',
  defaultModel: 'claude-sonnet-4-6',
  defaultTemperature: 0.8,
  defaultMaxTokens: 280,

  init(config) {
    this.workerUrl = config.workerUrl;
    if (config.model) this.defaultModel = config.model;
    if (config.temperature != null) this.defaultTemperature = config.temperature;
    if (config.maxTokens != null) this.defaultMaxTokens = config.maxTokens;
  },

  /**
   * Appel API générique vers le Worker proxy
   * @param {string} system - System prompt
   * @param {Array} messages - Messages [{role, content}]
   * @param {number} [maxTokens] - Override max_tokens
   * @param {string} [model] - Override model
   * @param {string} [provider] - Override provider (default: 'anthropic')
   * @returns {string} Texte de la réponse
   */
  async call(system, messages, maxTokens, model, provider) {
    const r = await fetch(this.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          provider: provider || 'anthropic',
          model: model || this.defaultModel,
          max_tokens: maxTokens || this.defaultMaxTokens,
          temperature: this.defaultTemperature,
          system: system,
          messages: messages
        }
      })
    });
    if (!r.ok) throw new Error('API ' + r.status);
    const d = await r.json();
    if (Array.isArray(d?.content)) {
      return d.content
        .filter(c => c.type === 'text')
        .map(c => c.text || '')
        .join('\n')
        .trim();
    }
    return (d?.content || d?.text || '').trim();
  },

  /**
   * Appel avec chaîne de fallback.
   * Essaie chaque modèle dans l'ordre. Si échec (erreur réseau,
   * status non-ok, ou validateur qui rejette la réponse) → suivant.
   *
   * @param {string} system
   * @param {Array} messages
   * @param {number} maxTokens
   * @param {Array<{provider:string, model:string, label:string}>} chain
   * @param {function} [validator] - optionnel, reçoit la réponse, retourne true si OK
   * @returns {string}
   */
  async callWithFallback(system, messages, maxTokens, chain, validator) {
    for (let i = 0; i < chain.length; i++) {
      const { provider, model, label } = chain[i];
      try {
        const resp = await this.call(system, messages, maxTokens, model, provider);
        if (validator && !validator(resp)) {
          console.log(`[BrainAPI] ${label} — validator rejected, trying next`);
          continue;
        }
        if (i > 0) console.log(`[BrainAPI] Fallback → ${label} succeeded`);
        return resp;
      } catch (e) {
        console.log(`[BrainAPI] ${label} failed: ${e.message}${i < chain.length - 1 ? ' — trying next' : ' — no fallback left'}`);
      }
    }
    throw new Error('All models in chain failed');
  }
};

window.BrainAPI = BrainAPI;
