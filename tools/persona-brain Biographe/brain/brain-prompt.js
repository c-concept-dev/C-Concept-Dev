// ═══════════════════════════════════════════════════════════════════
// BRAIN-PROMPT.js — L'assembleur de prompts
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Assemble le system prompt complet pour le Driver :
//   1. domain.identity    → qui tu es
//   2. intelligence universelle → comment tu penses (tout domaine)
//   3. domain.cognition   → comment tu penses dans CE domaine
//   4. contexte mémoire   → ce que tu sais
//   5. brain context      → carte de navigation
//
// Le prompt ORCHESTRE. Le LLM RAISONNE.
// ═══════════════════════════════════════════════════════════════════

const BrainPrompt = {

  /**
   * Assemble le system prompt complet pour le Driver.
   */
  buildSystemPrompt(config) {
    const {
      prenom, age, genre, identity, cognition,
      memoryContext, brainContext, attentionContext,
      skippedTopics, turnNum
    } = config;

    const genreLabel = genre === 'femme' ? 'femme' : genre === 'homme' ? 'homme' : 'genre non precise';
    const sk = skippedTopics ? `SUJETS ESQUIVES : ${skippedTopics}` : '';

    return `═══ CARTE 1 — QUI TU ES ═══
${identity}

═══ CARTE 2 — QUI EST LA PERSONNE ═══
SUJET : ${prenom}, ${age || '?'} ans, ${genreLabel}.
${age ? `Cette personne a ${age} ans aujourd'hui. Tu sais a quelle epoque correspond chaque periode de sa vie.` : ''}
${brainContext || ''}
${sk}

═══ CARTE 3 — CE QUE TU SAIS ═══
${memoryContext || '(premiere question)'}

═══ CARTE 4 — CE QUE TU VOIS ═══
${attentionContext || '(pas encore de donnees)'}

═══ CARTE 5 — COMMENT TU PENSES ═══
${cognition}

${this.getUniversalIntelligence()}

═══ CARTE 6 — TA QUESTION ═══
Tour : ${turnNum}
Tu raisonnes dans ta tete. La personne n'entend que ta question.
La carte n'est pas le territoire. Ce que tu sais n'est pas ce qui existe. Ta question explore le territoire.`;
  },

  /**
   * Intelligence universelle — valable pour TOUS les domain packs.
   * Contextualisation + collège d'experts + biais + interdits.
   */
  getUniversalIntelligence() {
    return `Tu portes en toi des grilles de lecture — personnalite, attachement, defenses, valeurs, identite narrative. Tu les actives quand c'est pertinent. Chaque vie humaine a une structure qui lui est propre — sa culture, sa religion, son epoque, son milieu, sa geographie. Tu ne projettes pas ta grille — tu decouvres celle de la personne en l'ecoutant. Tu decodes le registre linguistique de chaque personne — sociolecte, regiolecte, idiolecte — avant de reagir aux mots.

Le comportement dans cet entretien N'EST PAS la personnalite. Tu distingues le trait stable de la reaction a la situation.

INTERDITS : pas de "Interessant/Fascinant/Bravo". Pas de "Parlez-moi de...". Pas d'echo miroir. Pas de reformulation sans apport. UNE question.`;
  },

  /**
   * Construit le contexte brain.json pour le prompt
   */
  buildBrainContext(brain, prenom, age) {
    if (!brain) return '';
    let s = 'BRAIN (carte de navigation — NE PAS CITER) :\n';
    const id = brain.identity || {};
    s += `Sujet: ${id.display_name || prenom}, ${id.age || age || '?'} ans. ${id.context || ''}\n`;
    const bf = brain.personality?.big_five || {};
    const bfe = Object.entries(bf).filter(([, v]) => v?.score != null);
    if (bfe.length) s += `Big Five: ${bfe.map(([k, v]) => k + ':' + v.score).join(' ')}\n`;
    const vals = brain.personality?.values?.hierarchy || [];
    if (vals.length) s += `Valeurs: ${vals.slice(0, 5).map(v => v.value).join(', ')}\n`;
    const comm = brain.communication || {};
    if (comm.tone?.primary) s += `Ton: ${comm.tone.primary}\n`;
    if (comm.vocabulary?.characteristic_expressions?.length) {
      s += `Expressions: ${comm.vocabulary.characteristic_expressions.slice(0, 4).join(', ')}\n`;
    }
    const em = brain.emotional || {};
    if (em.relational_style?.primary) s += `Attachement: ${em.relational_style.primary}\n`;
    if (em.defense_dynamics?.sequences?.length) {
      s += 'Defenses: ';
      em.defense_dynamics.sequences.forEach(seq => {
        s += `[${(seq.trigger_topics || []).join(',')}] `;
      });
      s += '\n';
    }
    const bio = brain.biography || {};
    if (bio.people_mentioned?.length) {
      s += `Personnes: ${bio.people_mentioned.map(p => p.name + '(' + p.role + ')').join(', ')}\n`;
    }
    const da = brain.deep_analysis || {};
    if (da.blind_spots?.themes_absents?.length) {
      s += `THEMES ABSENTS: ${da.blind_spots.themes_absents.join(', ')}\n`;
    }
    if (da.blind_spots?.absences_significatives?.length) {
      s += `ANGLES MORTS: ${da.blind_spots.absences_significatives.map(a => a.domain).join(', ')}\n`;
    }
    return s;
  },

  /**
   * Construit les messages pour l'API du Driver
   */
  buildMessages(history, summary) {
    const msgs = [];
    if (summary?.text) {
      msgs.push({
        role: 'user',
        content: '[MEMOIRE CONSOLIDEE — v' + summary.version + ']\n' + summary.text + '\n[FIN MEMOIRE]'
      });
      msgs.push({ role: 'assistant', content: 'Je continue.' });
    }
    const recent = history.slice(summary?.text ? -12 : -18).map(m => ({
      role: m.role, content: m.content
    }));
    msgs.push(...recent);

    // Fix alternance user/assistant
    const fixed = [];
    for (const m of msgs) {
      if (fixed.length && fixed[fixed.length - 1].role === m.role) {
        fixed[fixed.length - 1].content += '\n' + m.content;
      } else {
        fixed.push({ ...m });
      }
    }
    if (fixed[0]?.role === 'assistant') {
      fixed.unshift({ role: 'user', content: 'Bonjour.' });
    }
    if (fixed[fixed.length - 1]?.role !== 'user') {
      fixed.push({ role: 'user', content: '[En attente]' });
    }
    return fixed;
  }
};

window.BrainPrompt = BrainPrompt;
