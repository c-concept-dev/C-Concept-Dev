// ═══════════════════════════════════════════════════════════════════
// DOMAIN-REGISTRY.js — Registre des Domain Packs
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Chaque domain pack s'enregistre via DomainRegistry.register().
// Le shell lit DomainRegistry.list() pour peupler le menu.
// Ajout d'un nouveau domaine = 0 modification du shell.
// ═══════════════════════════════════════════════════════════════════

window.DomainRegistry = {
  _domains: {},

  /**
   * Enregistre un domain pack.
   * @param {string} id - Identifiant unique (ex: 'biographer')
   * @param {object} pack - Le domain pack complet
   * @param {string} pack.name - Nom technique
   * @param {string} pack.label - Nom affiché dans le menu
   * @param {string} pack.description - Description courte
   * @param {function} pack.getIdentity
   * @param {function} pack.getCognition
   * @param {function} pack.getAnalystInject
   * @param {function} pack.getOutputPrompt
   * @param {function} pack.getOutputSchema
   * @param {function} [pack.getOpeningInstruction]
   */
  register(id, pack) {
    this._domains[id] = pack;
    console.log(`[DomainRegistry] Registered: ${id} — ${pack.label || id}`);
  },

  /** Retourne la liste des domaines enregistrés [{id, label, description}] */
  list() {
    return Object.entries(this._domains).map(([id, pack]) => ({
      id,
      label: pack.label || id,
      description: pack.description || '',
    }));
  },

  /** Retourne un domain pack par son id */
  get(id) {
    return this._domains[id] || null;
  },

  /** Nombre de domaines enregistrés */
  count() {
    return Object.keys(this._domains).length;
  }
};
