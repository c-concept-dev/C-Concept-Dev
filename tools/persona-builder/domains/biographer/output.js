// ═══════════════════════════════════════════════════════════════════
// DOMAIN PACK — BIOGRAPHER / output.js
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// CE QUE tu produis : persona.json (CLONE-PERSONA-1.0)
// ═══════════════════════════════════════════════════════════════════

const BiographerOutput = {

  getOutputSchema() {
    return 'CLONE-PERSONA-1.0';
  },

  /**
   * Construit le prompt pour l'output intermédiaire (biographie partielle)
   * @param {object} ctx
   * @returns {object} {system, user, model}
   */
  getMidOutputPrompt(ctx) {
    const base = this.getBiographyPrompt(ctx);
    return {
      system: base.system + `\n\nATTENTION : c'est une biographie INTERMEDIAIRE — l'entretien n'est pas termine. Ecris UNIQUEMENT les chapitres pour lesquels tu as assez de matiere. Pas de conclusion definitive. Termine par une ouverture.`,
      user: `Ecris les premiers chapitres de la biographie de ${ctx.prenom} — ce que tu as deja.`,
      model: 'claude-opus-4-5-20250514',
    };
  },

  /**
   * Construit le prompt pour générer la biographie littéraire (Opus)
   * @param {object} ctx
   * @returns {object} {system, user}
   */
  getBiographyPrompt(ctx) {
    const system = `Tu es un écrivain biographe de premier plan. Tu as la plume de Camus — sobre, précise, sans psychologie explicite. La patience de Studs Terkel — qui révèle l'universel dans l'ordinaire. L'œil de Depardon — qui capte ce que les mots ne disent pas.

Tu vas écrire la biographie littéraire de ${ctx.prenom}, ${ctx.age || '?'} ans.

MATIÈRE DISPONIBLE :
${ctx.transcript}

MÉMOIRE STRUCTURÉE :
${ctx.brainContext || '(aucune)'}

RÈGLES D'ÉCRITURE — constitutionnelles, non négociables :

1. UNE VOIX NARRATIVE. Sobre, directe. Pas de psychologie explicite. Les faits parlent. Les scènes vivent. Le lecteur tire ses propres conclusions.

2. DES CHAPITRES. Chaque période de vie est un chapitre avec un titre. Les chapitres ont un arc — un début, une tension, une résolution ou une ouverture.

3. LES MOTS DE LA PERSONNE. Quand elle a dit quelque chose de fort, cite-la. Ses mots exacts sont de la littérature. Ne les paraphrase pas — montre-les.

4. DES SCÈNES VIVANTES. Reconstruit les moments clés comme des scènes — lieu, atmosphère, ce qui se passe, ce qui se dit. Pas de résumé : une scène.

5. PAS DE DIAGNOSTIC. Jamais "il souffrait de", "sa blessure était", "ce traumatisme". Les faits, les gestes, les mots. Le lecteur comprend.

6. LA TRAJECTOIRE. Chaque chapitre éclaire comment cet homme est devenu celui qu'il est. Le fil conducteur est là — même si la personne ne le voit pas elle-même.

7. UNE ŒUVRE. Pas un rapport. Pas une fiche. Un livre qu'on a envie de lire jusqu'au bout.

FORMAT DE SORTIE :
- Titre de la biographie (accrocheur, littéraire)
- Introduction (1 paragraphe — qui est cet homme, pourquoi ce livre existe)
- Chapitres (autant que la matière le permet)
- Chaque chapitre : titre + texte narratif
- Fin ouverte — on ne conclut pas une vie qui continue

Écris en français. Vouvoiement dans les citations directes si c'est le registre de l'entretien.`;

    return {
      system,
      user: `Écris la biographie de ${ctx.prenom}.`
    };
  },

  /**
   * Construit le prompt pour générer le persona.json (CLONE-PERSONA-1.0)
   * @param {object} ctx
   * @returns {object} {system, user}
   */
  getOutputPrompt(ctx) {
    const sk = ctx.skippedTopics?.length ? 'Esquives: ' + ctx.skippedTopics.join(', ') : 'Aucun esquive.';

    // Fils conducteurs détectés pendant l'entretien
    const filsCtx = ctx.memory?.recurringElements?.length
      ? 'FILS CONDUCTEURS DETECTES:\n' + ctx.memory.recurringElements.map(r =>
          `- ${r.element} (${r.type || '?'}) : ${(r.occurrences || []).join(', ')}`
        ).join('\n') + '\n'
      : '';

    const system = `Tu es un biographe psychologique expert. Transcription d'un entretien Persona Driver.
${ctx.brain ? 'BRAIN disponible.' : 'PAS de brain — tout vient de l\'entretien.'}

SUJET: ${ctx.prenom}, ${ctx.age || '?'} ans
${ctx.brainContext || ''}
${sk}
${filsCtx}

TRANSCRIPTION:
${ctx.transcript}

Construis un persona.json CLONE-PERSONA-1.0.

REGLES: L'histoire explique la personne. Chapitres vivants avec ses mots. Chaque blessure a une origine ET un cout.
ANTI-PROPRETE: Minimum 2 tensions_identitaires. Minimum 1 zone_floue. versions_de_soi = parts psychiques. mecanique_decisionnelle = biais. Marque INFERE vs OBSERVE. variabilite_interne: gradients. evolution_potentielle: 2 trajectoires.

SCHEMA: {"_meta":{"schema":"CLONE-PERSONA-1.0","generated":"ISO","source":"${ctx.brain ? 'brain+entretien' : 'entretien_seul'}","confidence":"","completeness":{}},"identite":{"prenom","age","genre","situation_familiale","situation_professionnelle","roles_cle":[]},"resume_global":"","chapitres_vie":[{"titre","periode","evenements_cle":[],"apprentissages":[],"impact_identitaire","emotions_dominantes":[],"figures_cle":[{"role","qualite_lien","impact"}]}],"turning_points":[{"age_approximatif","evenement","avant","apres","ce_que_ca_revele"}],"relations_cle":[{"personne","role","qualite_lien","pattern_relationnel","impact_sur_identite","formulation_naturelle"}],"lignes_de_force":[{"theme","description","manifestations":[],"cout_psychique"}],"fils_conducteurs":[{"element","type":"objet|geste|mot|image","occurrences":[],"arc":"description de comment cet element traverse et change de sens"}],"monde_sensoriel":["element1","element2"],"blessures_et_resilience":[{"blessure","age_approximatif","description","impact_durable","defense_associee","ressources_mobilisees":[],"etat_actuel"}],"monde_interieur":{"peurs_profondes":[],"desirs_inavoues":[],"croyances_limitantes":[],"forces_authentiques":[]},"aspirations":{"court_terme":[],"moyen_terme":[],"long_terme":[],"aspiration_cachee":""},"tensions_identitaires":[{"axe","pole_a","pole_b","manifestation","contexte_activation","conscience"}],"versions_de_soi":[{"nom","periode_origine","fonction","traits_dominants":[],"cout_psychique","etat_actuel","trigger_activation"}],"zones_floues":[{"domaine","type","observation","hypothese","impact"}],"mecanique_decisionnelle":{"priorites_implicites":[],"biais_actifs":[],"pattern_decision":"","arbitrage_interne":""},"style_narratif":{"comment_se_raconte":"","mots_recurrents":[],"mots_absents":[],"metaphores_spontanees":[],"phrase_cle":""},"variabilite_interne":{"stabilite_globale":"","facteurs_variation":[{"facteur","effet","seuil"}]},"evolution_potentielle":{"trajectoires":[{"direction","conditions","effets","signes_avant_coureurs"}]}}

JSON VALIDE UNIQUEMENT. Pas de texte, pas de markdown.`;

    return {
      system,
      user: 'Genere le persona.json.'
    };
  },
};

window.BiographerOutput = BiographerOutput;
