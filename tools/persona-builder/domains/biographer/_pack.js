// ═══════════════════════════════════════════════════════════════════
// DOMAIN PACK — BIOGRAPHER / _pack.js
// Auto-assemblage et auto-enregistrement
//
// Ce fichier est chargé EN DERNIER dans le domain pack.
// Il assemble identity.js + cognition.js + output.js
// et s'enregistre automatiquement dans le DomainRegistry.
//
// Pour ajouter un nouveau domaine : copier ce pattern.
// ═══════════════════════════════════════════════════════════════════

(function() {
  const pack = {
    name: 'biographer',
    label: 'Biographe d\'Élite',
    description: 'Entretien d\'histoire de vie — capturer le vécu, les scènes, les tournants.',
    getIdentity: () => BiographerIdentity.getIdentity(),
    getCognition: () => BiographerCognition.getCognition(),
    getAnalystInject: () => BiographerCognition.getAnalystInject(),
    getOpeningInstruction: (prenom, genre) => BiographerIdentity.getOpeningInstruction(prenom, genre),
    getOutputPrompt: (ctx) => BiographerOutput.getOutputPrompt(ctx),
    getOutputSchema: () => BiographerOutput.getOutputSchema(),
    getBiographyPrompt: (ctx) => BiographerOutput.getBiographyPrompt(ctx),
    getMidOutputPrompt: (ctx) => BiographerOutput.getMidOutputPrompt(ctx),
  };

  if (window.DomainRegistry) {
    DomainRegistry.register('biographer', pack);
  } else {
    console.error('[BiographerPack] DomainRegistry not found — load domain-registry.js first');
  }
})();
