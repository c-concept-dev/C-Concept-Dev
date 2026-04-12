// ═══════════════════════════════════════════════════════════════════
// BRAIN-ANALYST.js — Le cerveau pensant (2 PASSES)
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Passe A — PERCEPTION : extraction structurée
//   Le LLM VOIT et NOMME. Carte, people, scenes, facts.
//   Pas de jugement. "Qu'est-ce qui est là ?"
//
// Passe B — CRITIQUE : raisonnement libre
//   Le LLM PENSE. Observation + note_driver.
//   Tout le budget attentionnel pour la note.
//   "Qu'est-ce que ça veut dire ?"
//
// Produit DEUX sorties (comme avant) :
//   A) JSON structuré → alimente brain-memory.js
//   B) Note libre (note_driver) → injectée dans le prompt du Driver
//
// Règle : note_driver ne doit jamais contenir de formulation
// directe de question. Des tensions, pas des procédures.
//
// Le code ORCHESTRE. Le LLM PENSE mieux quand il fait UNE chose.
// ═══════════════════════════════════════════════════════════════════

const BrainAnalyst = {

  lastResult: null,
  lastNote: null,

  /**
   * Analyse un tour complet en 2 passes séquentielles.
   * Interface identique à la version 1-passe — brain-core.js ne change pas.
   */
  async analyze(context) {
    const {
      turnNum, recentExchanges, memory, learningTraces,
      domainInject, brainContext, age, apiCall, apiCallFast
    } = context;

    const memCtx = this._buildMemoryContext(memory);

    try {
      // ── PASSE A — PERCEPTION ──
      // Le LLM voit et nomme. Extraction structurée.
      // Utilise apiCallFast (Haiku) si disponible, sinon apiCall (Sonnet).
      const perception = await this._passA(
        turnNum, recentExchanges, memCtx, brainContext, age, apiCallFast || apiCall
      );

      if (!perception) {
        this._log(`T${turnNum} — Passe A failed, no perception`);
        return;
      }

      this._log(`T${turnNum} — Passe A OK | carte:${perception.carte?.length || 0} | people:${perception.people?.length || 0} | scenes:${perception.scenes_nouvelles?.length || 0}`);

      // ── PASSE B — CRITIQUE ──
      // Le LLM pense. Il reçoit la perception et raisonne.
      const critique = await this._passB(
        turnNum, recentExchanges, perception, memCtx,
        learningTraces, domainInject, brainContext, age, apiCall
      );

      // ── FUSION — Assembler le résultat final ──
      const result = {
        // De la Passe A (perception)
        carte: perception.carte || [],
        people: perception.people || [],
        scenes_nouvelles: perception.scenes_nouvelles || [],
        facts: perception.facts || [],
        gaps: perception.gaps || [],
        themes: perception.themes || [],
        learning: perception.learning || null,
        merge_hints: perception.merge_hints || [],
        pending_threads: perception.pending_threads || [],
        recurring_elements: perception.recurring_elements || [],
        // De la Passe B (critique)
        observation: critique ? critique.observation || null : null,
        note_driver: critique ? critique.note_driver || null : null,
      };

      this.lastResult = result;
      this.lastNote = result.note_driver || null;

      const effectLog = result.learning?.last_effect || '?';
      this._log(`T${turnNum} — COMPLET | carte:${result.carte.length} | people:${result.people.length} | scenes:${result.scenes_nouvelles.length} | effect:${effectLog} | note:${result.note_driver ? 'oui' : 'NON'}`);

    } catch (e) {
      this._log(`T${turnNum} — Error: ${e.message}`);
    }
  },

  // ════════════════════════════════════════
  // PASSE A — PERCEPTION
  // "Qu'est-ce qui est là ?"
  // ════════════════════════════════════════

  async _passA(turnNum, recentExchanges, memCtx, brainContext, age, apiCall) {
    const prompt = `Tu es l'analyste perceptif d'un entretien. Tu VOIS et tu NOMMES. Tu ne juges pas, tu n'interpretes pas — tu cartographies ce qui est la.

ECHANGES RECENTS :
${recentExchanges}

${brainContext ? 'BRAIN (carte de navigation) :\n' + brainContext + '\n' : ''}
${memCtx ? 'MEMOIRE STRUCTUREE :\n' + memCtx + '\n' : ''}
TOUR : ${turnNum} | AGE SUJET : ${age || '?'} ans

EXTRACTION — Produis UN JSON avec :

1. "carte" : pour chaque grande periode de vie — nom, annees estimees, scenes concretes obtenues, statut (explore/mentionne/inconnu), et "active" (true pour la periode en cours — une seule). Tu REMPLACES la carte entiere — c'est ta vision a l'instant T.

2. "people" : personnes detectees dans ce tour. Format : [{"name":"...", "role":"...", "relation":"..."}]. PAS de noms communs.

3. "scenes_nouvelles" : nouvelles scenes. Format : [{"description":"...", "epoque":"...", "lieu":"...", "charge":"faible|moderee|forte", "type":"scene|micro_scene|mention"}]

4. "facts" : faits nouveaux. Format : [{"content":"...", "epoch":"..."}]

5. "gaps" : zones vides, dimensions absentes. Liste de strings.

6. "themes" : themes emergents. Liste de strings.

7. "learning" : ta trace d'apprentissage.
   - "last_effect" : la derniere question du Driver a "ouvert" ou "ferme" ou "neutre" ?
   - "question_type" : type libre (ex: "sensorielle_lieu", "frontale_emotion", "laterale_objet")
   - "lesson" : 1 phrase — ce qu'il faut retenir
   - "pattern" : pattern detecte (ou null)

8. "merge_hints" : si deux personnes connues sont la meme → ["la vieille = mere"]

9. "pending_threads" : fils deposes mais non explores. Des choses que la personne a DITES ou EFFLEUREES et que le Driver n'a pas tirees. Format : [{"thread":"...", "source":"phrase/personne/periode/esquive"}]. Exemples : une personne citee en passant ("mon frere"), une periode mentionnee sans vecu ("apres l'armee"), une phrase inachevee, un sujet esquive. Tu ne les inventes pas — tu les VOIS dans les echanges.

10. "recurring_elements" : objets, gestes, mots ou images qui REVIENNENT a travers les periodes. Un couteau qui traverse trois generations. Des volets qui reviennent enfance et present. Un "c'est comme ca" qui change de sens. Format : [{"element":"...", "occurrences":["T3 enfance","T12 present"], "type":"objet|geste|mot|image"}]. IMPORTANT : ne signale QUE ce qui est apparu au moins 2 fois dans des periodes DIFFERENTES.

JSON VALIDE UNIQUEMENT. Pas de texte avant ou apres.`;

    try {
      const resp = await apiCall(prompt, [{ role: 'user', content: 'Extraction.' }], 1200);
      return BrainSafety.parseAnalystJSON(resp);
    } catch (e) {
      this._log(`T${turnNum} — Passe A error: ${e.message}`);
      return null;
    }
  },

  // ════════════════════════════════════════
  // PASSE B — CRITIQUE
  // "Qu'est-ce que ça veut dire ?"
  // ════════════════════════════════════════

  async _passB(turnNum, recentExchanges, perception, memCtx, learningTraces, domainInject, brainContext, age, apiCall) {
    // Construire un résumé compact de la perception pour la Passe B
    const perceptionSummary = this._summarizePerception(perception);

    const prompt = `Tu es l'analyste critique d'un entretien. La perception vient d'etre faite — tu sais ce qui est la. Maintenant tu PENSES. Tu raisonnes sur ce que ca veut dire pour le Driver.

ECHANGES RECENTS :
${recentExchanges}

${brainContext ? 'BRAIN :\n' + brainContext + '\n' : ''}
${memCtx ? 'MEMOIRE :\n' + memCtx + '\n' : ''}
PERCEPTION CE TOUR :
${perceptionSummary}

TRACES D'APPRENTISSAGE :
${learningTraces}

${this.lastNote ? 'TA NOTE PRECEDENTE (ne te repete PAS — dis quelque chose de NOUVEAU) :\n' + this.lastNote + '\n' : ''}
TOUR : ${turnNum} | AGE SUJET : ${age || '?'} ans

${domainInject ? '═══ DOMAIN ═══\n' + domainInject + '\n═══════════════\n' : ''}

CRITIQUE — Raisonne. Produis UN JSON avec DEUX champs :

1. "observation" : observation hors grille, intuition libre. 1-2 phrases.

2. "note_driver" : LE PLUS IMPORTANT. 3-5 phrases de pensee brute pour le Driver.
   CONTENU : des observations, des tensions, des opportunites, des lecons.
   - Qu'est-ce que la personne vient de donner ? Vivant ou mort ?
   - Disproportions entre duree vecue et matiere racontee ?
   - Ce qui fonctionne / ce qui ferme ?
   - Le Driver tourne-t-il en rond ?
   - Ce fil est-il sature ? Les reponses se repetent, se raccourcissent, ou tournent autour du meme noyau ? Signale-le clairement.
   - Le Driver a-t-il pose une question de vecu ou une question factuelle ? Si son IMAGE contenait un vecu, une tension, une faille — et que sa question n'y menait pas — signale-le.
   INTERDIT dans note_driver :
   - Formuler une question directe ("demande-lui si...")
   - Donner une suite d'instructions procedurales
   - Un script de conversation
   La note ECLAIRE, elle ne PILOTE pas.

JSON VALIDE UNIQUEMENT. Pas de texte avant ou apres.`;

    try {
      const resp = await apiCall(prompt, [{ role: 'user', content: 'Critique.' }], 600);
      const result = BrainSafety.parseAnalystJSON(resp);
      if (result) {
        this._log(`T${turnNum} — Passe B OK | note:${result.note_driver ? result.note_driver.substring(0, 80) + '...' : 'ABSENTE'}`);
      }
      return result;
    } catch (e) {
      this._log(`T${turnNum} — Passe B error: ${e.message}`);
      return null;
    }
  },

  // ════════════════════════════════════════
  // API PUBLIQUE (inchangée)
  // ════════════════════════════════════════

  getNote() { return this.lastNote; },
  getStructuredResult() { return this.lastResult; },

  // ════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════

  /**
   * Résumé compact de la perception pour la Passe B.
   * Le LLM critique voit ce que le LLM perceptif a trouvé,
   * sans devoir le re-extraire.
   */
  _summarizePerception(p) {
    const parts = [];

    if (p.carte?.length) {
      parts.push('Carte: ' + p.carte.map(c =>
        c.periode + '(' + (c.statut || '?') + ',' + (c.scenes || 0) + 'sc)'
      ).join(' | '));
    }

    if (p.people?.length) {
      parts.push('Personnes: ' + p.people.map(pp =>
        (typeof pp === 'string' ? pp : pp.name) + (pp.role ? '(' + pp.role + ')' : '')
      ).join(', '));
    }

    if (p.scenes_nouvelles?.length) {
      parts.push('Scenes: ' + p.scenes_nouvelles.map(s =>
        (s.description || '').substring(0, 60) + ' [' + (s.charge || '?') + ']'
      ).join(' | '));
    }

    if (p.facts?.length) {
      parts.push('Faits: ' + p.facts.map(f =>
        (f.content || '').substring(0, 60)
      ).join(' | '));
    }

    if (p.gaps?.length) {
      parts.push('Gaps: ' + p.gaps.join(', '));
    }

    if (p.pending_threads?.length) {
      parts.push('Fils pendants: ' + p.pending_threads.map(t =>
        (typeof t === 'string' ? t : t.thread || '') + (t.source ? ' (' + t.source + ')' : '')
      ).join(' | '));
    }

    if (p.learning) {
      parts.push('Effet: ' + (p.learning.last_effect || '?') +
        (p.learning.lesson ? ' — ' + p.learning.lesson : ''));
    }

    return parts.join('\n') || 'Perception vide.';
  },

  _buildMemoryContext(memory) {
    if (!memory) return '';
    let ctx = '';
    if (memory.carte?.length) {
      ctx += `Carte: ${memory.carte.map(p => p.periode + '(' + p.statut + ',' + p.scenes + 'sc/' + p.annees + 'a)').join(' | ')}\n`;
    }
    if (memory.people?.length) {
      ctx += `Personnes: ${memory.people.map(p => p.name + (p.role ? '(' + p.role + ')' : '')).join(', ')}\n`;
    }
    if (memory.scenes?.length) {
      ctx += `Scenes: ${memory.scenes.slice(-5).map(s => s.label).join(', ')}\n`;
    }
    if (memory.gaps?.length) {
      ctx += `Gaps: ${memory.gaps.join(', ')}\n`;
    }
    if (memory.themes?.length) {
      ctx += `Themes: ${memory.themes.join(', ')}\n`;
    }
    return ctx;
  },

  _log(msg) {
    console.log('[BrainAnalyst]', msg);
    if (window._brainLog) window._brainLog('[Analyst] ' + msg);
  }
};

window.BrainAnalyst = BrainAnalyst;
