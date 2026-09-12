/* MODE-01 — CONTRATS DES MODES
 * ============================================================================
 *
 * Un mode dit COMMENT on accompagne quelqu'un. Il ne dit jamais CE QUI EST VRAI
 * de sa demande.
 *
 * Cette table est donc délibérément pauvre en sémantique, et le restera : elle
 * ne contient aucune politique de readiness, aucun seuil, aucune règle de
 * clarification. Un même état OPRIE produit la même action dans tous les modes —
 * c'est vérifié ailleurs, et rien ici ne peut le contredire, parce qu'il n'y a
 * ici aucun champ capable de l'exprimer.
 *
 * Ce que la table décrit, et rien d'autre :
 *
 *   À QUELLE FAMILLE un mode appartient — exécution gouvernée, ou composition
 *   manuelle. Cette frontière n'est pas décorative : elle dit si le pipeline
 *   commun s'applique.
 *
 *   VERS QUEL MOTEUR une exécution gouvernée est destinée. Cette destination
 *   vivait à deux endroits — la dérivation de route, puis l'aiguillage vers le
 *   moteur. Deux endroits, c'est déjà un de trop : le jour où l'un change sans
 *   l'autre, un mode exécute chez son voisin.
 *
 *   CE QU'UN MODE PEUT FAIRE, en termes de comportement observable seulement.
 *
 * ATELIER N'EST PAS UN MODE GOUVERNÉ, et cette table ne fait pas semblant du
 * contraire. Lui prêter une readiness, un gate ou une exécution pour rendre les
 * trois lignes symétriques serait une fausse gouvernance — plus dangereuse que
 * l'asymétrie qu'elle masquerait.
 *
 * PURETÉ : aucune entrée/sortie, aucun réseau, aucun fournisseur, aucun DOM.
 * ========================================================================= */

export const MODE_CONTRACTS_VERSION = "1.0";

/** Les deux familles de modes. Une famille dit si le pipeline commun s'applique. */
export const MODE_CLASSES = Object.freeze(["governed_execution", "manual_composition"]);

/** Les destinations d'exécution existantes. `null` = ce mode n'exécute pas. */
export const EXECUTION_TARGETS = Object.freeze(["rapide", "architecte"]);

/**
 * LES CONTRATS.
 *
 * Chaque champ est TECHNIQUE ou COMPORTEMENTAL. Aucun n'est sémantique : il
 * n'existe volontairement pas de champ où écrire « ce mode décide la readiness
 * ainsi », parce qu'aucun mode ne la décide.
 */
export const MODE_CONTRACTS = Object.freeze({
  rapide: Object.freeze({
    modeClass: "governed_execution",
    usesGovernedPipeline: true,
    usesOrchestrationPolicy: true,
    usesFastPlane: true,
    usesDeepPlane: true,
    allowsExecution: true,
    executionTarget: "rapide",
    /* MESURÉ EN MODE-02, et corrigé : le parcours Rapide entre bien dans la chaîne gouvernée
       (Readiness puis gate de prompt) mais il produit un PROMPT, qu'il rend sur place. Il n'appelle
       aucun fournisseur et ne fabrique aucun livrable — celui-ci naît ailleurs, chez la personne ou
       via l'envoi direct. Écrire `true` ici affirmait une chose que le code ne fait pas. */
    producesFinalDeliverable: false,
    manualComposition: false,
    supportsModeSwitch: true,
    presentationProfile: "direct"
  }),
  architecte: Object.freeze({
    modeClass: "governed_execution",
    usesGovernedPipeline: true,
    usesOrchestrationPolicy: true,
    usesFastPlane: true,
    usesDeepPlane: true,
    allowsExecution: true,
    executionTarget: "architecte",
    producesFinalDeliverable: true,
    manualComposition: false,
    supportsModeSwitch: true,
    presentationProfile: "structured"
  }),
  atelier: Object.freeze({
    /* Mesuré, pas supposé : Atelier n'appelle ni OPRIE, ni la politique, ni
       Readiness, ni aucun gate, ni aucun fournisseur. Il assemble un prompt que
       la personne emporte. Il ne produit aucun livrable gouverné. */
    modeClass: "manual_composition",
    usesGovernedPipeline: false,
    usesOrchestrationPolicy: false,
    usesFastPlane: false,
    usesDeepPlane: false,
    allowsExecution: false,
    executionTarget: null,
    producesFinalDeliverable: false,
    manualComposition: true,
    supportsModeSwitch: true,
    presentationProfile: "workshop"
  })
});

export const MODE_IDS = Object.freeze(Object.keys(MODE_CONTRACTS));

/**
 * CHAMPS INTERDITS — la garde qui empêche cette table de devenir une autorité.
 *
 * Si un lot futur tente d'ajouter ici une règle de readiness, un seuil ou une
 * politique de clarification, la table cesse d'être valide. Le refus est
 * structurel : il ne dépend pas de la vigilance du relecteur.
 */
export const FORBIDDEN_CONTRACT_FIELDS = Object.freeze([
  "readyPolicy", "clarificationPolicy", "confirmationPolicy", "readinessPolicy",
  "semanticThreshold", "confidence", "score", "threshold",
  "oprieState", "canonicalContract", "qgPolicy", "providerOrder", "provider",
  /* Ces deux-là ont existé dans un brouillon de cette table, et en ont été RETIRÉS.
     `readinessDialogue` aurait été l'endroit exact où un lot futur exprimerait qu'un mode
     supprime le dialogue de readiness d'OPRIE — c'est-à-dire la réinterprétation qu'une
     décision explicite a bannie. `engineDialogueLoop` dupliquait l'invariant R1, possédé et
     testé ailleurs : deux endroits pour un même fait finissent par se contredire. */
  "readinessDialogue", "engineDialogueLoop"
]);

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Le contrat d'un mode, ou `null` pour un mode inconnu — jamais un défaut. */
export function contractFor(mode) {
  return Object.prototype.hasOwnProperty.call(MODE_CONTRACTS, mode) ? MODE_CONTRACTS[mode] : null;
}

/**
 * La destination d'exécution d'un mode.
 *
 * Rend `null` pour un mode inconnu ET pour un mode qui n'exécute pas — deux
 * situations différentes, une même conséquence : l'appelant ne doit rien
 * exécuter. Deviner une destination serait exécuter chez quelqu'un d'autre.
 */
export function executionTargetFor(mode) {
  const contrat = contractFor(mode);
  if (!contrat || !contrat.allowsExecution) return null;
  return contrat.executionTarget;
}

/** Ce mode passe-t-il par le pipeline gouverné ? */
export function usesGovernedPipeline(mode) {
  const contrat = contractFor(mode);
  return !!contrat && contrat.usesGovernedPipeline === true;
}

/** Les modes d'une famille donnée. */
export function modesOfClass(modeClass) {
  return Object.freeze(MODE_IDS.filter((id) => MODE_CONTRACTS[id].modeClass === modeClass));
}

/**
 * Valide la table elle-même. Appelée par les tests, et destinée à échouer le
 * jour où quelqu'un y glisserait une autorité.
 */
export function validateModeContracts(contracts = MODE_CONTRACTS) {
  const problems = [];
  if (!isObject(contracts)) return ["CONTRACTS_NOT_AN_OBJECT"];
  for (const [id, contrat] of Object.entries(contracts)) {
    if (!isObject(contrat)) { problems.push(`${id}: NOT_AN_OBJECT`); continue; }
    if (!MODE_CLASSES.includes(contrat.modeClass)) problems.push(`${id}: MODE_CLASS_INVALID`);
    for (const interdit of FORBIDDEN_CONTRACT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(contrat, interdit)) problems.push(`${id}: FORBIDDEN_FIELD_${interdit}`);
    }
    /* Une destination d'exécution n'existe que pour un mode qui exécute, et
       doit désigner un moteur réel. */
    if (contrat.allowsExecution === true) {
      if (!EXECUTION_TARGETS.includes(contrat.executionTarget)) problems.push(`${id}: EXECUTION_TARGET_INVALID`);
      if (contrat.usesGovernedPipeline !== true) problems.push(`${id}: EXECUTION_WITHOUT_GOVERNED_PIPELINE`);
    } else if (contrat.executionTarget !== null) {
      problems.push(`${id}: EXECUTION_TARGET_WITHOUT_EXECUTION`);
    }
    /* Un mode de composition manuelle ne peut porter aucune marque de gouvernance. */
    if (contrat.modeClass === "manual_composition") {
      for (const champ of ["usesGovernedPipeline", "usesOrchestrationPolicy", "usesFastPlane", "usesDeepPlane", "allowsExecution", "producesFinalDeliverable"]) {
        if (contrat[champ] !== false) problems.push(`${id}: MANUAL_MODE_CLAIMS_${champ}`);
      }
    }
  }
  return problems;
}

/** Vue d'audit : le contrat d'un mode, sans rien y ajouter. */
export function createModeContractAuditView(mode) {
  const contrat = contractFor(mode);
  return contrat ? Object.freeze({ version: MODE_CONTRACTS_VERSION, mode, ...contrat }) : null;
}
