// ═══════════════════════════════════════════════════════════════════
// BRAIN-MEMORY.js — 4 couches de mémoire
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Couche 1 — TRANSCRIPT (historique brut)
// Couche 2 — MÉMOIRE DE TRAVAIL (ce qui est actif maintenant)
// Couche 3 — MÉMOIRE STRUCTURÉE (faits établis par l'analyste)
// Couche 4 — TRACES D'APPRENTISSAGE (ce qui marche/échoue)
//
// Le code STOCKE et TRANSMET. Le LLM RAISONNE.
// Pas de if/score/seuil — le LLM reçoit les traces et s'adapte.
// ═══════════════════════════════════════════════════════════════════

const BrainMemory = {

  // ── Couche 1 — TRANSCRIPT ──
  history: [],

  // ── Couche 2 — MÉMOIRE DE TRAVAIL ──
  working: {
    lastUserText: '',
    lastDriverText: '',
    turnCount: 0,
    wordCounts: [],       // {turn, wc}
    activeTopics: [],     // sujets en cours d'exploration
    pendingThreads: [],   // fils déposés, non explorés
    skippedTopics: [],    // sujets esquivés
  },

  // ── Couche 3 — MÉMOIRE STRUCTURÉE ──
  structured: {
    people: [],           // Person objects
    scenes: [],           // Scene objects
    facts: [],            // Fact objects
    carte: [],            // CarteEntry objects (PHOTO, pas cumul)
    themes: [],           // thèmes identifiés par l'analyste
    gaps: [],             // zones vides identifiées par l'analyste
  },

  // ── Couche 4 — TRACES D'APPRENTISSAGE ──
  learning: {
    relances: [],         // LearningTrace objects
    opens: [],            // types de questions qui ouvrent
    closes: [],           // types de questions qui ferment
    patterns: [],         // patterns détectés par l'analyste
  },

  // ── Rolling Summary ──
  summary: { text: null, version: 0, coveredUpTo: 0 },

  // ── Couche 5 — LEARNING INTER-SESSION ──
  // Persistant entre les sessions. Condensé par un LLM en fin de session.
  // Injecté dans le prompt au début de la session suivante.
  // Le LLM reçoit "ce qui marche" et RAISONNE — pas de if/then.
  learningProfile: null,  // null = première session

  // ── Dernier résultat analyste (pour le prompt) ──
  lastAnalystNote: null,
  lastDriverImage: null,

  // ════════════════════════════════════════
  // API PUBLIQUE
  // ════════════════════════════════════════

  reset() {
    this.history = [];
    this.working = { lastUserText: '', lastDriverText: '', turnCount: 0, wordCounts: [], activeTopics: [], pendingThreads: [], skippedTopics: [] };
    this.structured = { people: [], scenes: [], facts: [], carte: [], themes: [], gaps: [] };
    this.learning = { relances: [], opens: [], closes: [], patterns: [] };
    this.summary = { text: null, version: 0, coveredUpTo: 0 };
    this.lastAnalystNote = null;
    this.lastDriverImage = null;
    // learningProfile n'est PAS reset — il persiste entre sessions
  },

  /**
   * Stocke un message dans l'historique + met à jour la mémoire de travail
   */
  store(text, role) {
    this.history.push({ role, content: text, ts: Date.now() });
    if (role === 'user') {
      this.working.lastUserText = text;
      this.working.turnCount++;
      // Comptage mots (le code COMPTE)
      const wc = text.split(/\s+/).length;
      this.working.wordCounts.push({ turn: this.working.turnCount, wc });
    } else if (role === 'assistant') {
      this.working.lastDriverText = text;
    }
  },

  /**
   * Intègre le retour structuré de l'analyste dans la mémoire
   * Le LLM PROPOSE, le code INTÈGRE.
   */
  integrate(analystResult) {
    if (!analystResult) return;

    // ── Carte (PHOTO complète — remplace) ──
    if (analystResult.carte?.length) {
      this.structured.carte = analystResult.carte;
    }

    // ── People (déduplication par name, insensible casse) ──
    if (analystResult.people?.length) {
      analystResult.people.forEach(p => {
        const name = typeof p === 'string' ? p : p.name;
        if (!name) return;
        const existing = this.structured.people.find(
          ep => ep.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          // Enrichissement
          existing.last_mentioned = this.working.turnCount;
          if (typeof p === 'object') {
            if (p.role && !existing.role) existing.role = p.role;
            if (p.relation) existing.relation = p.relation;
          }
        } else {
          this.structured.people.push({
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: typeof p === 'string' ? p : p.name,
            role: typeof p === 'object' ? p.role || null : null,
            relation: typeof p === 'object' ? p.relation || null : null,
            first_mentioned: this.working.turnCount,
            last_mentioned: this.working.turnCount,
            confidence: typeof p === 'object' ? p.confidence || 0.7 : 0.7
          });
        }
      });
    }

    // ── Merge hints (l'analyste signale que deux personnes sont la même) ──
    if (analystResult.merge_hints?.length) {
      analystResult.merge_hints.forEach(hint => {
        // hint = "la vieille = mère" ou {source: "la vieille", target: "mère"}
        let source, target;
        if (typeof hint === 'string') {
          const parts = hint.split(/\s*=\s*/);
          if (parts.length === 2) { source = parts[0].trim(); target = parts[1].trim(); }
        } else {
          source = hint.source; target = hint.target;
        }
        if (!source || !target) return;
        const sp = this.structured.people.find(p => p.name.toLowerCase() === source.toLowerCase());
        const tp = this.structured.people.find(p => p.name.toLowerCase() === target.toLowerCase());
        if (sp && tp) {
          // Fusionner vers target
          tp.first_mentioned = Math.min(tp.first_mentioned, sp.first_mentioned);
          tp.last_mentioned = Math.max(tp.last_mentioned, sp.last_mentioned);
          if (!tp.role && sp.role) tp.role = sp.role;
          this.structured.people = this.structured.people.filter(p => p !== sp);
        }
      });
    }

    // ── Scenes nouvelles (déduplication par epoch+place+description) ──
    if (analystResult.scenes_nouvelles?.length) {
      analystResult.scenes_nouvelles.forEach(ns => {
        const newDesc = (ns.description || ns.label || '').toLowerCase().trim();
        const newEpoch = (ns.epoque || ns.epoch || '').toLowerCase().trim();
        const newPlace = (ns.lieu || ns.place || '').toLowerCase().trim();

        const existing = this.structured.scenes.find(es => {
          const esEpoch = (es.epoch || '').toLowerCase().trim();
          const esPlace = (es.place || '').toLowerCase().trim();
          const esLabel = (es.label || '').toLowerCase().trim();
          // Même époque ET même lieu ET description similaire
          if (esEpoch === newEpoch && esPlace === newPlace) {
            if (!newDesc || !esLabel) return true; // pas de description, on considère doublon
            // Vérifier si les descriptions se chevauchent
            if (esLabel.includes(newDesc) || newDesc.includes(esLabel)) return true;
          }
          return false;
        });
        if (existing) {
          // Enrichissement : monter le type, mettre à jour la charge
          const typeRank = { mention: 0, micro_scene: 1, scene: 2 };
          const newType = ns.type || 'scene';
          if ((typeRank[newType] || 0) > (typeRank[existing.type] || 0)) existing.type = newType;
          if (ns.charge) existing.charge = ns.charge;
          if (!existing.source_turns) existing.source_turns = [existing.source_turn];
          existing.source_turns.push(this.working.turnCount);
        } else {
          this.structured.scenes.push({
            id: 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            label: ns.description || ns.label || '',
            epoch: ns.epoque || ns.epoch || null,
            place: ns.lieu || ns.place || null,
            people: ns.people || [],
            source_turn: this.working.turnCount,
            charge: ns.charge || 'moderee',
            type: ns.type || 'scene',
            confidence: ns.confidence || 0.7
          });
        }
      });
    }

    // ── Facts (déduplication par contenu similaire) ──
    if (analystResult.facts?.length) {
      analystResult.facts.forEach(f => {
        const content = f.content || (typeof f === 'string' ? f : '');
        if (!content) return;

        if (f.replaces_id) {
          const idx = this.structured.facts.findIndex(ef => ef.id === f.replaces_id);
          if (idx >= 0) this.structured.facts.splice(idx, 1);
        }

        // Dédup : vérifier si un fait très similaire existe déjà
        const contentLower = content.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç0-9\s]/g, '').trim();
        const isDuplicate = this.structured.facts.some(ef => {
          const existing = (ef.content || '').toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç0-9\s]/g, '').trim();
          // Même contenu exact
          if (existing === contentLower) return true;
          // Un contient l'autre (inclusion)
          if (contentLower.length > 15 && existing.length > 15) {
            if (existing.includes(contentLower) || contentLower.includes(existing)) return true;
          }
          return false;
        });

        if (!isDuplicate) {
          this.structured.facts.push({
            id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            content: content,
            epoch: f.epoch || null,
            source_turn: this.working.turnCount,
            confidence: f.confidence || 0.7
          });
        }
      });
    }

    // ── Themes et Gaps (remplacés, comme la carte) ──
    if (analystResult.themes?.length) this.structured.themes = analystResult.themes;
    if (analystResult.gaps?.length) this.structured.gaps = analystResult.gaps;

    // ── Learning trace (CUMULATIVE — jamais de suppression) ──
    if (analystResult.learning) {
      const trace = {
        turn: this.working.turnCount,
        question_type: analystResult.learning.question_type || analystResult.learning.last_effect || '',
        effect: analystResult.learning.last_effect || 'neutre',
        lesson: analystResult.learning.lesson || '',
        pattern: analystResult.learning.pattern || '',
        timestamp: Date.now()
      };
      this.learning.relances.push(trace);
      // Classifier opens/closes pour transmission rapide
      if (trace.effect === 'ouvert' && trace.question_type) {
        if (!this.learning.opens.includes(trace.question_type)) this.learning.opens.push(trace.question_type);
      }
      if (trace.effect === 'ferme' && trace.question_type) {
        if (!this.learning.closes.includes(trace.question_type)) this.learning.closes.push(trace.question_type);
      }
      if (analystResult.learning.pattern) {
        this.learning.patterns.push(analystResult.learning.pattern);
      }
    }

    // ── Observation libre ──
    if (analystResult.observation) {
      this.working.activeTopics.push(analystResult.observation);
      // Garder seulement les 5 dernières
      if (this.working.activeTopics.length > 5) this.working.activeTopics.shift();
    }

    // ── Pending Threads (fils déposés, non explorés) ──
    // Source 1 : l'analyste les signale explicitement
    if (analystResult.pending_threads?.length) {
      analystResult.pending_threads.forEach(t => {
        const thread = typeof t === 'string' ? t : t.thread || '';
        if (!thread) return;
        const source = typeof t === 'object' ? t.source || 'analyste' : 'analyste';
        // Dédup par contenu similaire
        const threadLower = thread.toLowerCase().trim();
        const exists = this.working.pendingThreads.some(pt =>
          pt.thread.toLowerCase().trim() === threadLower
        );
        if (!exists) {
          this.working.pendingThreads.push({
            thread, source, turn: this.working.turnCount
          });
        }
      });
    }

    // Source 2 : personnes mentionnées 1 fois et jamais revenues (code COMPTE)
    // Recalcul à chaque intégration — pas de cumul, état frais
    this._refreshPendingFromData();

    // ── Note libre pour le Driver ──
    if (analystResult.note_driver) {
      this.lastAnalystNote = analystResult.note_driver;
    }

    // ── Recurring Elements (fils conducteurs) ──
    if (analystResult.recurring_elements?.length) {
      if (!this.structured.recurringElements) this.structured.recurringElements = [];
      analystResult.recurring_elements.forEach(el => {
        const element = typeof el === 'string' ? el : el.element || '';
        if (!element) return;
        const existingIdx = this.structured.recurringElements.findIndex(
          r => r.element.toLowerCase() === element.toLowerCase()
        );
        if (existingIdx >= 0) {
          // Enrichir les occurrences
          const existing = this.structured.recurringElements[existingIdx];
          const newOccs = el.occurrences || [];
          newOccs.forEach(o => {
            if (!existing.occurrences.includes(o)) existing.occurrences.push(o);
          });
        } else {
          this.structured.recurringElements.push({
            element,
            occurrences: el.occurrences || [],
            type: el.type || 'unknown'
          });
        }
      });
    }
  },

  /**
   * Retourne le contexte mémoire pour le system prompt du Driver
   */
  getContext() {
    let ctx = '';

    // LEARNING INTER-SESSION — ce qui marche avec cette personne
    // Injecté EN PREMIER — le Driver le voit avant tout le reste.
    // Ce sont des guides, pas des règles. Le LLM raisonne.
    if (this.learningProfile) {
      ctx += `═══ APPRENTISSAGE (sessions precedentes) ═══\n`;
      const lp = this.learningProfile;
      if (lp.opens?.length) {
        ctx += `CE QUI OUVRE: ${lp.opens.map(o => typeof o === 'string' ? o : o.pattern).join(' | ')}\n`;
      }
      if (lp.closes?.length) {
        ctx += `CE QUI FERME: ${lp.closes.map(c => typeof c === 'string' ? c : c.pattern).join(' | ')}\n`;
      }
      if (lp.preferred_rhythm) {
        ctx += `RYTHME: ${lp.preferred_rhythm}\n`;
      }
      if (lp.preferred_entry_points?.length) {
        ctx += `ENTREES: ${lp.preferred_entry_points.join(', ')}\n`;
      }
      if (lp.avoid_with_this_person?.length) {
        ctx += `EVITER: ${lp.avoid_with_this_person.join(', ')}\n`;
      }
      if (lp.key_lesson) {
        ctx += `LECON: ${lp.key_lesson}\n`;
      }
      if (lp.book_state) {
        ctx += `ETAT DU LIVRE: ${lp.book_state}\n`;
      }
      ctx += `Ces patterns sont appris de vos interactions precedentes. Adapte-toi si le contexte change.\n`;
      ctx += `═══════════════════════════════════════════\n\n`;
    }

    // IMAGE précédente du Driver — sa dernière pensée, pour continuer
    if (this.lastDriverImage) {
      const imageAge = this._lastImageTurn ? this.working.turnCount - this._lastImageTurn : 0;
      if (imageAge > 1) {
        ctx += `TA DERNIERE PENSEE (il y a ${imageAge} tours — PERIMEE, raisonne a neuf):\n${this.lastDriverImage}\n\n`;
      } else {
        ctx += `TA DERNIERE PENSEE:\n${this.lastDriverImage}\n\n`;
      }
    }

    // Note de l'analyste — sa pensée brute, l'outil le plus précieux
    if (this.lastAnalystNote) {
      ctx += `═══ ANALYSTE ═══\n${this.lastAnalystNote}\n═══════════════\n\n`;
    }

    // Gaps — zones vides identifiées par l'analyste
    if (this.structured.gaps.length) {
      ctx += `ZONES VIDES: ${this.structured.gaps.join(', ')}\n`;
    }

    // Thèmes émergents
    if (this.structured.themes.length) {
      ctx += `THEMES: ${this.structured.themes.join(', ')}\n`;
    }

    // Faits établis — ce que la personne a concrètement dit
    if (this.structured.facts.length) {
      const recentFacts = this.structured.facts.slice(-8);
      ctx += `FAITS ETABLIS: ${recentFacts.map(f => f.content).join(' | ')}\n`;
    }

    // Dernière relance — ce que la dernière question a produit
    if (this.learning.relances.length) {
      const last = this.learning.relances[this.learning.relances.length - 1];
      ctx += `DERNIERE RELANCE: ${last.effect} — ${(last.lesson || '').substring(0, 80)}\n`;
    }

    // Fils déposés, non explorés — avec ancienneté
    if (this.working.pendingThreads.length) {
      const threads = this.working.pendingThreads.slice(0, 5).map(pt => {
        const age = this.working.turnCount - pt.turn;
        return pt.thread + (age > 3 ? ' [depuis ' + age + ' tours]' : '');
      });
      ctx += `FILS A TIRER: ${threads.join(' | ')}\n`;
    }

    // Fils conducteurs détectés (objets/gestes/mots qui traversent)
    if (this.structured.recurringElements?.length) {
      const fils = this.structured.recurringElements.map(r =>
        r.element + ' (' + r.occurrences.join(', ') + ')'
      );
      ctx += `FILS CONDUCTEURS: ${fils.join(' | ')}\n`;
    }

    return ctx;
  },

  /**
   * Retourne les traces d'apprentissage pour l'analyste
   */
  getLearningContext() {
    const traces = this.learning.relances.slice(-8);
    if (!traces.length) return 'Pas encore de traces d\'apprentissage.';
    return traces.map(t => 
      `T${t.turn}: ${t.question_type || '?'} → ${t.effect}${t.lesson ? ' (' + t.lesson + ')' : ''}`
    ).join('\n');
  },

  /**
   * Retourne la tendance d'ouverture/fermeture (le code COMPTE)
   */
  getWordCountTrend() {
    const wc = this.working.wordCounts;
    if (wc.length < 3) return 'trop_tot';
    const recent = wc.slice(-3).reduce((a, b) => a + b.wc, 0) / 3;
    const early = wc.slice(0, 3).reduce((a, b) => a + b.wc, 0) / 3;
    if (recent > early * 1.5) return 'ouverture';
    if (recent < early * 0.5) return 'fermeture';
    return 'stable';
  },

  // ════════════════════════════════════════
  // CONSOLIDATION MNÉSIQUE
  // Comme le cerveau pendant le sommeil :
  // renforce les scènes fortes, archive le contexte,
  // signale les fils ouverts et les absences.
  // ════════════════════════════════════════

  async summarizeIfNeeded(apiCallFn) {
    const totalMsgs = this.history.filter(m => m.role === 'user' || m.role === 'assistant').length;
    const needsFirst = totalMsgs >= 16 && !this.summary.text;
    const needsRefresh = this.summary.text && (totalMsgs - this.summary.coveredUpTo) >= 10;
    if (!needsFirst && !needsRefresh) return;

    BrainMemory._log('Generating summary v' + (this.summary.version + 1));
    try {
      const startIdx = this.summary.coveredUpTo > 0 ? this.summary.coveredUpTo : 0;
      const newMsgs = this.history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(startIdx, -6);
      if (newMsgs.length < 4) return;

      const newText = newMsgs.map(m =>
        `[${m.role === 'user' ? 'SUJET' : 'DRIVER'}] ${m.content.substring(0, 200)}`
      ).join('\n');

      const prompt = this.summary.text
        ? `Voici la consolidation precedente de l'entretien :\n${this.summary.text}\n\nVoici les NOUVEAUX echanges depuis :\n${newText}\n\nConsolide la memoire en HIERARCHISANT :\n1. SCENES FORTES : les moments vivants, concrets, charges — ceux qui font le livre. Renforce-les, ne les perds jamais.\n2. FILS OUVERTS : ce qui a ete touche mais pas approfondi, les personnes mentionnees sans etre explorees, les periodes survolees.\n3. ABSENCES : ce qui n'a jamais ete aborde et qui manque pour comprendre cette vie.\n4. CONTEXTE : le decor, les faits secondaires — en une ligne.\n\n15-20 lignes max. Les scenes fortes en premier.`
        : `Consolide cet entretien en HIERARCHISANT :\n1. SCENES FORTES : les moments vivants, concrets, charges — ceux qui font le livre.\n2. FILS OUVERTS : ce qui a ete touche mais pas approfondi.\n3. ABSENCES : ce qui n'a jamais ete aborde.\n4. CONTEXTE : le decor, les faits secondaires.\n\n15-20 lignes max. Les scenes fortes en premier.\n\n${newText}`;

      const resp = await apiCallFn(prompt, [{ role: 'user', content: 'Consolide.' }], 600);
      this.summary.text = resp;
      this.summary.coveredUpTo = totalMsgs - 6;
      this.summary.version++;
      BrainMemory._log('Summary v' + this.summary.version + ' done');
    } catch (e) {
      BrainMemory._log('Summary error: ' + e.message);
    }
  },

  // ════════════════════════════════════════
  // LEARNING INTER-SESSION — Synthèse LLM
  // Appelé en fin de session. Le LLM condense
  // les traces en un profil d'apprentissage.
  // Le LLM RAISONNE. Le code STOCKE.
  // ════════════════════════════════════════

  /**
   * Génère le learning inter-session par appel LLM.
   * Condense les traces intra-session (relances, opens, closes, patterns)
   * en un profil structuré réutilisable à la session suivante.
   *
   * Si un learningProfile existait (sessions précédentes),
   * le LLM fait le MERGE — pas le code.
   *
   * @param {function} apiCallFn - fonction d'appel API
   * @returns {object|null} le learning profile généré
   */
  async generateLearningSynthesis(apiCallFn) {
    BrainMemory._log('Generating learning synthesis...');

    // Préparer les traces intra-session
    const traces = this.learning.relances.map(t =>
      `T${t.turn}: ${t.question_type || '?'} → ${t.effect}${t.lesson ? ' (' + t.lesson + ')' : ''}`
    ).join('\n');

    const opensStr = this.learning.opens.length
      ? 'Types qui ouvrent: ' + this.learning.opens.join(', ')
      : 'Aucun type clairement identifié comme ouvrant.';

    const closesStr = this.learning.closes.length
      ? 'Types qui ferment: ' + this.learning.closes.join(', ')
      : 'Aucun type clairement identifié comme fermant.';

    const patternsStr = this.learning.patterns.length
      ? 'Patterns: ' + this.learning.patterns.slice(-10).join(', ')
      : '';

    // Préparer l'état du livre (carte + scènes fortes)
    const carteStr = this.structured.carte.length
      ? this.structured.carte.map(c =>
          c.periode + ' (' + (c.statut || '?') + ', ' + (c.scenes || 0) + ' scenes)'
        ).join(' | ')
      : 'Pas de carte.';

    const scenesFortes = this.structured.scenes
      .filter(s => s.charge === 'forte')
      .slice(-8)
      .map(s => s.label)
      .join(' | ') || 'Aucune scene forte identifiee.';

    // Préparer le transcript condensé (derniers messages significatifs)
    const transcript = this.history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-30)
      .map(m => `[${m.role === 'user' ? 'SUJET' : 'DRIVER'}] ${m.content.substring(0, 150)}`)
      .join('\n');

    const existingLearning = this.learningProfile
      ? JSON.stringify(this.learningProfile, null, 2)
      : 'Premiere session — pas de learning existant.';

    const prompt = `Tu es un analyste d'interaction. Tu viens d'observer un entretien biographique complet.

HISTORIQUE DES RELANCES ET LEURS EFFETS :
${traces || 'Pas de traces.'}

${opensStr}
${closesStr}
${patternsStr}

ETAT DU LIVRE :
Carte: ${carteStr}
Scenes fortes: ${scenesFortes}
Tours: ${this.working.turnCount}

DERNIERS ECHANGES (condensés) :
${transcript}

LEARNING EXISTANT (sessions precedentes) :
${existingLearning}

Synthetise les patterns d'interaction de cette personne pour le biographe. Produis UN JSON avec :

1. "opens" : ce qui OUVRE cette personne (types de relances, approches, sujets). Format : [{"pattern":"...", "confidence":"high|medium|low", "observed_count":N}]. Max 5.

2. "closes" : ce qui FERME (ce qui raccourcit, provoque l'esquive). Meme format. Max 4.

3. "preferred_rhythm" : 1 phrase — le rythme qui fonctionne avec cette personne.

4. "preferred_entry_points" : sujets ou personnes qui declenchent l'ouverture. Liste de strings. Max 5.

5. "avoid_with_this_person" : sujets ou approches qui ne marchent PAS. Liste de strings. Max 3.

6. "key_lesson" : 1 phrase — la lecon principale de cette session (ou de l'ensemble si merge).

7. "book_state" : 1-2 phrases — ou en est le livre (periodes couvertes, fils ouverts, ce qui manque).

8. "sessions_analyzed" : nombre total de sessions analysees.

${this.learningProfile ? 'MERGE : Confirme les patterns qui se verifient (augmente confidence et observed_count). Contredis ceux qui ne marchent plus. Ajoute les nouveaux. Raisonne.' : ''}

JSON VALIDE UNIQUEMENT. Pas de texte avant ou apres.`;

    try {
      const resp = await apiCallFn(prompt, [{ role: 'user', content: 'Synthese learning.' }], 1000);
      const result = BrainSafety.parseAnalystJSON(resp);

      if (result) {
        this.learningProfile = result;
        BrainMemory._log(`Learning synthesis OK | opens:${result.opens?.length || 0} | closes:${result.closes?.length || 0} | sessions:${result.sessions_analyzed || 1}`);
        return result;
      } else {
        BrainMemory._log('Learning synthesis: JSON parse failed');
        return null;
      }
    } catch (e) {
      BrainMemory._log('Learning synthesis error: ' + e.message);
      return null;
    }
  },

  // ════════════════════════════════════════
  // SAVE / RESTORE
  // ════════════════════════════════════════

  getState() {
    return {
      history: this.history,
      working: { ...this.working },
      structured: {
        people: [...this.structured.people],
        scenes: [...this.structured.scenes],
        facts: [...this.structured.facts],
        carte: [...this.structured.carte],
        themes: [...this.structured.themes],
        gaps: [...this.structured.gaps],
      },
      learning: {
        relances: [...this.learning.relances],
        opens: [...this.learning.opens],
        closes: [...this.learning.closes],
        patterns: [...this.learning.patterns],
      },
      learningProfile: this.learningProfile ? { ...this.learningProfile } : null,
      summary: { ...this.summary },
      lastAnalystNote: this.lastAnalystNote,
      lastDriverImage: this.lastDriverImage,
    };
  },

  restore(saved) {
    if (!saved) return;
    this.history = saved.history || [];
    this.working = saved.working || this.working;
    this.structured = saved.structured || this.structured;
    this.learning = saved.learning || this.learning;
    this.learningProfile = saved.learningProfile || this.learningProfile || null;
    this.summary = saved.summary || this.summary;
    this.lastAnalystNote = saved.lastAnalystNote || null;
    this.lastDriverImage = saved.lastDriverImage || null;
  },

  // ════════════════════════════════════════
  // PENDING THREADS — Recalcul automatique
  // Le code COMPTE. Le LLM RAISONNE dessus.
  // ════════════════════════════════════════

  /**
   * Recalcule les fils pendants à partir des données structurées.
   * Ajoute automatiquement :
   * - Personnes mentionnées 1 fois, pas revues depuis 5+ tours
   * - Périodes "mentionne" dans la carte (citées mais non explorées)
   * Ne supprime PAS les fils ajoutés par l'analyste — ceux-là
   * restent jusqu'à ce qu'ils soient explorés ou dépassés.
   * Limite : 8 fils max (les plus anciens en premier).
   */
  _refreshPendingFromData() {
    const turn = this.working.turnCount;

    // Personnes mentionnées 1 fois, pas revues depuis 5+ tours
    if (this.structured.people.length && turn > 5) {
      this.structured.people.forEach(p => {
        if (p.first_mentioned === p.last_mentioned && (turn - p.first_mentioned) >= 5) {
          const threadText = p.name + (p.role ? ' (' + p.role + ')' : '') + ' — mentionne(e) T' + p.first_mentioned;
          const exists = this.working.pendingThreads.some(pt =>
            pt.thread.toLowerCase().includes(p.name.toLowerCase())
          );
          if (!exists) {
            this.working.pendingThreads.push({
              thread: threadText, source: 'personne', turn: p.first_mentioned
            });
          }
        }
      });
    }

    // Périodes "mentionne" dans la carte (citées mais non explorées)
    if (this.structured.carte.length) {
      this.structured.carte.forEach(c => {
        if (!c.periode) return; // guard — carte entry incomplète
        if (c.statut === 'mentionne') {
          const threadText = c.periode + ' (~' + (c.annees || '?') + ' ans) — mentionnee, non exploree';
          const exists = this.working.pendingThreads.some(pt =>
            pt.thread.toLowerCase().includes(c.periode.toLowerCase())
          );
          if (!exists) {
            this.working.pendingThreads.push({
              thread: threadText, source: 'periode', turn: turn
            });
          }
        }
      });
    }

    // Nettoyer les fils résolus — si la personne est maintenant récurrente
    // ou si la période est maintenant explorée
    this.working.pendingThreads = this.working.pendingThreads.filter(pt => {
      if (pt.source === 'personne') {
        const person = this.structured.people.find(p =>
          pt.thread.toLowerCase().includes(p.name.toLowerCase())
        );
        // Garder si la personne n'a toujours pas été revue
        return person && person.first_mentioned === person.last_mentioned;
      }
      if (pt.source === 'periode') {
        const periode = this.structured.carte.find(c =>
          c.periode && pt.thread.toLowerCase().includes(c.periode.toLowerCase())
        );
        // Garder si la période n'est toujours pas explorée
        return periode && periode.statut !== 'explore';
      }
      // Fils de l'analyste — garder 15 tours max
      return (turn - pt.turn) < 15;
    });

    // Limite à 8, les plus anciens en premier (ancienneté = priorité)
    this.working.pendingThreads.sort((a, b) => a.turn - b.turn);
    if (this.working.pendingThreads.length > 8) {
      this.working.pendingThreads = this.working.pendingThreads.slice(0, 8);
    }
  },

  // ── Logging ──
  _log(msg) {
    console.log('[BrainMemory]', msg);
    if (window._brainLog) window._brainLog('[Memory] ' + msg);
  }
};

window.BrainMemory = BrainMemory;
