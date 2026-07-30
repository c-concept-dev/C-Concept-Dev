// ═══════════════════════════════════════════════════════════════════
// BRAIN-CORE.js — Le chef d'orchestre
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Cycle cognitif en 7 étapes :
//   1. PERCEPTION   → brain-memory.js stocke, code compte
//   2. ANALYSE      → brain-analyst.js appelle le LLM
//   3. MÉMOIRE      → brain-memory.js intègre le retour
//   4. CONTEXTE     → brain-prompt.js assemble le system prompt
//   5. DRIVER       → appel LLM principal → formule la question
//   6. OUTPUT       → callback vers le shell
//   7. APPRENTISSAGE → brain-memory.js stocke la trace
//
// Le code COMPTE. Le LLM RAISONNE. Le prompt ORCHESTRE.
// Le LLM APPREND. Le code TRACE.
// ═══════════════════════════════════════════════════════════════════

const BrainCore = {

  // ── Configuration ──
  config: {
    prenom: '', age: null, genre: '', workerUrl: '',
    brain: null, domain: null,
  },

  // ── Chaînes de modèles par rôle ──
  // Le Worker proxy doit supporter les providers listés.
  // Modifier ici pour changer la stratégie sans toucher au reste du code.
  modelChains: {
    summary: [
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (fallback)' },
    ],
    perception: [
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (fallback)' },
    ],
    // Driver → Sonnet (non négociable, appel direct BrainAPI.call)
    // Analyste Passe A (perception) → Haiku (extraction structurée, pas de raisonnement profond)
    // Analyste Passe B (critique) → Sonnet (non négociable, note_driver critique)
    // Output final (biographie, persona, etc.) → défini par le domain pack
  },

  // ── État de session ──
  isGenerating: false,
  ended: false,
  _timerStart: null,
  // V7.4.3 (correctif Codex) — identifiant unique généré à chaque init().
  // Permet à _runBackgroundAnalysis() de détecter si une analyse en cours
  // appartient encore à LA SESSION ACTUELLE avant de l'intégrer : sans ça,
  // une analyse lente d'Alice peut s'intégrer dans BrainMemory de Bob si
  // celui-ci a démarré avant que la promesse d'Alice ne se résolve.
  sessionId: null,
  pendingBrain: null,

  // ════════════════════════════════════════
  // INITIALISATION
  // ════════════════════════════════════════

  /**
   * @param {object} cfg
   * @param {string} cfg.prenom
   * @param {number} cfg.age
   * @param {string} cfg.genre
   * @param {string} cfg.workerUrl
   * @param {object} cfg.brain - brain.json (optionnel)
   * @param {object} cfg.domain - DomainPack
   */
  init(cfg) {
    if (!cfg.domain) throw new Error('[BrainCore] Domain pack missing — cannot start');

    // V7.4.3 (correctif) — ISOLATION DE SESSION COMPLÈTE, sans exception de
    // prénom. Le prénom N'EST PAS un identifiant fiable : deux personnes
    // différentes peuvent le partager, et une VRAIE reprise passe déjà par
    // restore() (qui restaure explicitement learningProfile depuis la
    // sauvegarde). init() signifie toujours "nouvel entretien" — le profil
    // d'apprentissage d'une personne précédente ne doit JAMAIS survivre ici.
    this.config = { ...cfg };
    this.isGenerating = false;
    this.ended = false;
    this._timerStart = Date.now();
    // V7.4.3 (correctif Codex) — nouveau sessionId à CHAQUE init(), même
    // reprise. Toute analyse en vol issue d'une session précédente devient
    // instantanément détectable comme périmée (voir _runBackgroundAnalysis).
    this.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    // Sans ce reset, le garde-fou anti-course intra-session rejetterait à
    // tort le T1 de la personne suivante (ex: Alice T19 puis Bob T1 — 1<=19
    // serait rejeté).
    this._lastIntegratedTurn = 0;

    // Garde-fou de couverture — propre à CETTE personne, jamais transporté
    this._endOverride = false;
    this._coverageReminder = null;
    this._coverageRemindCount = 0;

    // Sorties de la session précédente — un ancien persona/biographie ne
    // doit pas rester téléchargeable ni bloquer l'aperçu intermédiaire
    // de la nouvelle session (ces champs vivent sur BC, ajoutés par le
    // shell, hors de portée de BrainMemory.reset()).
    this._personaJSON = null;
    this._biographyText = null;
    this._midOutputShown = false;

    // Initialiser les modules
    BrainAPI.init({
      workerUrl: cfg.workerUrl,
      model: window.BRAIN_VARIANT?.model || 'claude-sonnet-4-6',
      temperature: window.BRAIN_VARIANT?.temperature || 0.8,
      maxTokens: window.BRAIN_VARIANT?.maxTokens || 500,
    });
    BrainMemory.reset();
    BrainMemory.learningProfile = null;   // toujours vidé — pas d'exception par prénom
    BrainMemory._lastImageTurn = null;    // pas couvert par reset() historiquement

    // État de l'analyste — la note/résultat de la personne précédente
    // ne doit jamais fuiter vers le premier tour de la suivante.
    if (typeof BrainAnalyst !== 'undefined') { BrainAnalyst.lastResult = null; BrainAnalyst.lastNote = null; }

    // Focus attentionnel — remis à zéro, propre à cette personne.
    if (typeof BrainAttention !== 'undefined') { BrainAttention._lastPeriode = null; BrainAttention._consecutiveTurns = 0; }

    // Dernière image mentale du Driver — ne doit pas être attribuée
    // par erreur au premier tour d'une nouvelle personne.
    if (typeof BrainSafety !== 'undefined') BrainSafety._lastImage = null;

    this._log(`Session: ${cfg.prenom}, ${cfg.age || '?'} (${cfg.genre}) | Brain: ${cfg.brain ? 'oui' : 'non'} | Domain: ${cfg.domain.name || 'unknown'} | état complet vidé (analyste, focus, image, learning, outputs)`);
  },

  // ════════════════════════════════════════
  // CYCLE COGNITIF PRINCIPAL
  // ════════════════════════════════════════

  async processInput(text) {
    if (this.isGenerating || this.ended) return;
    this.isGenerating = true;

    const turnNum = BrainMemory.working.turnCount + 1;
    this._log(`[T${turnNum} USER] ${text.substring(0, 120)}`);

    // Callbacks UI
    if (window._onTurnUpdate) window._onTurnUpdate(turnNum);
    if (window._onStateChange) window._onStateChange('thinking');

    // ── 1. PERCEPTION — le code STOCKE ──
    BrainMemory.store(text, 'user');

    try {
      // ══ BOOT SEQUENCE (T1-T5) : analyste BLOQUANT ══
      // Les premiers tours sont critiques. Le Driver a besoin de sa note,
      // de la carte, des données attention DÈS LE DÉBUT.
      // Après T5 : mode parallèle (l'analyste tourne après le Driver).
      const isBootPhase = turnNum <= 3;

      if (isBootPhase) {
        this._log(`[Boot T${turnNum}] Analyst BLOCKING — Driver waits`);
        await this._runBlockingAnalysis(turnNum);
      }

      // ── 2. CONTEXTE — le prompt ORCHESTRE ──
      const systemPrompt = this._buildDriverPrompt();

      // ── 3. DRIVER — le LLM FORMULE ──
      const msgs = BrainPrompt.buildMessages(BrainMemory.history, BrainMemory.summary);
      const resp = await BrainAPI.call(systemPrompt, msgs);

      // ── 4. OUTPUT — vers le shell ──
      let display = BrainSafety.stripReasoning(resp);

      // Log l'image mentale si le Driver en a produit une
      const mentalImage = BrainSafety.getLastImage();
      if (mentalImage) {
        this._log(`[T${turnNum} IMAGE] ${mentalImage.substring(0, 300)}`);
        // STOCKER l'IMAGE pour le tour suivant — continuité de pensée
        BrainMemory.lastDriverImage = mentalImage;
        BrainMemory._lastImageTurn = turnNum;
      } else {
        this._log(`[T${turnNum} WARNING] Pas de bloc IMAGE — chain-of-thought absent`);
      }

      if (BrainSafety.hasLeakedLabels(display)) {
        this._log(`[Safety] Labels leaked T${turnNum}, re-stripping`);
        display = BrainSafety.stripReasoning(display);
      }

      BrainMemory.store(display, 'assistant');
      this._log(`[T${turnNum} DRIVER] ${display.substring(0, 120)}`);

      // Détection fin / pause
      let isEnd = display.includes('Merci. Vraiment') || display.includes('Merci, vraiment');
      const isPause = display.includes('reprendre une autre fois') || display.includes('reprendre plus tard');

      // ── GARDE-FOU COUVERTURE ──
      // Le code VÉRIFIE que la ligne du temps est couverte.
      // Le LLM a voulu terminer — le code vérifie que ses propres données
      // confirment la complétude. Si non, il rappelle le Driver à l'ordre.
      // Ce n'est pas du hardcoding de sens — c'est du comptage de couverture.
      // Le superviseur dit "il manque des sections" — pas "écris ceci".
      if (isEnd && !this._endOverride) {
        const coverage = this._checkCoverageForEnd();
        if (!coverage.valid) {
          this._log(`[COVERAGE] Fin refusée — ${coverage.reason}`);
          // Ne pas valider la fin — relancer le Driver
          isEnd = false;
          // Stocker le rappel pour le prochain tour
          this._coverageReminder = coverage.reason;
          this._coverageRemindCount = (this._coverageRemindCount || 0) + 1;
          // Après 3 rappels, accepter la fin (la personne a peut-être tout donné)
          if (this._coverageRemindCount >= 3) {
            this._log(`[COVERAGE] 3 rappels ignorés — fin acceptée par défaut`);
            this._endOverride = true;
          }
        } else {
          this._log(`[COVERAGE] Fin validée — couverture OK (${coverage.detail})`);
        }
      }

      // Callback UI
      if (window._onDriverResponse) await window._onDriverResponse(display, isEnd, isPause);

      if (isPause) {
        this._log('Session en PAUSE');
        this.ended = true;
        this.isGenerating = false;
        return 'pause';
      }
      if (isEnd) {
        this.ended = true;
        this.isGenerating = false;
        return 'end';
      }

      // ── 5. ANALYSE — systématique, chaque tour ──
      // Le LLM RAISONNE à chaque tour. Le code ne décide pas
      // quand le LLM doit penser — c'est du hardcoding de sens.
      // L'économie vient du max_tokens réduit, pas de la suppression.
      if (!isBootPhase) {
        this._runBackgroundAnalysis(turnNum);
      }

      // ── 6. Rolling summary en arrière-plan — Haiku avec fallback Sonnet ──
      const summaryCallFn = (system, messages, maxTokens) => {
        return BrainAPI.callWithFallback(system, messages, maxTokens, this.modelChains.summary);
      };
      BrainMemory.summarizeIfNeeded(summaryCallFn);

    } catch (e) {
      this._log('ERROR: ' + e.message);
      if (window._onError) window._onError(e.message);
    }

    this.isGenerating = false;
    return 'continue';
  },

  // ════════════════════════════════════════
  // OPENING / RESUME / SKIP
  // ════════════════════════════════════════

  async generateOpening() {
    const systemPrompt = this._buildDriverPrompt();
    const openingInstruction = this.config.domain.getOpeningInstruction
      ? this.config.domain.getOpeningInstruction(this.config.prenom, this.config.genre)
      : `[DEBUT DE SESSION — genere ton cadrage d'ouverture et ta premiere invitation. ${this.config.prenom} est ${this.config.genre}. VOUVOIEMENT OBLIGATOIRE. Commence par expliquer brievement le fonctionnement. Puis invite a commencer. 3 phrases max.]`;

    try {
      const resp = await BrainAPI.call(systemPrompt, [{
        role: 'user', content: openingInstruction
      }]);
      const display = BrainSafety.stripReasoning(resp);
      BrainMemory.store(display, 'assistant');
      return display;
    } catch (e) {
      this._log('Opening error: ' + e.message);
      const fb = BrainSafety.getFallbackText('opening', this.config.prenom);
      BrainMemory.store(fb, 'assistant');
      return fb;
    }
  },

  async generateResume() {
    const systemPrompt = this._buildDriverPrompt();
    try {
      const msgs = [
        ...BrainMemory.history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: '[REPRISE DE SESSION — accueil chaleureux au vouvoiement, rappel bref, relance naturelle. 2-3 phrases max.]' }
      ];
      const resp = await BrainAPI.call(systemPrompt, msgs);
      const display = BrainSafety.stripReasoning(resp);
      BrainMemory.store(display, 'assistant');
      return display;
    } catch (e) {
      this._log('Resume error: ' + e.message);
      const fb = BrainSafety.getFallbackText('resume', this.config.prenom);
      BrainMemory.store(fb, 'assistant');
      return fb;
    }
  },

  skip() {
    BrainMemory.working.skippedTopics.push('tour_' + (BrainMemory.working.turnCount + 1));
    this._log('SKIP tour ' + (BrainMemory.working.turnCount + 1));
    return this.processInput('On passe.');
  },

  // ════════════════════════════════════════
  // EXPORT
  // ════════════════════════════════════════

  async generateOutput() {
    if (!this.config.domain.getOutputPrompt) {
      this._log('Domain pack has no getOutputPrompt');
      return null;
    }
    const transcript = this.getTranscript();
    const brainCtx = BrainPrompt.buildBrainContext(
      this.config.brain, this.config.prenom, this.config.age
    );
    const outputPrompt = this.config.domain.getOutputPrompt({
      prenom: this.config.prenom,
      age: this.config.age,
      genre: this.config.genre,
      brain: this.config.brain,
      brainContext: brainCtx,
      transcript: transcript,
      memory: BrainMemory.structured,
      skippedTopics: BrainMemory.working.skippedTopics,
    });

    try {
      const resp = await BrainAPI.call(
        outputPrompt.system,
        [{ role: 'user', content: outputPrompt.user || 'Genere.' }],
        12000
      );
      const result = BrainSafety.parseAnalystJSON(resp);
      if (!result) {
        this._log('Output JSON parse failed, retrying...');
        // Retry une fois avec un prompt plus strict
        const resp2 = await BrainAPI.call(
          outputPrompt.system + '\n\nATTENTION: ta reponse precedente n\'etait pas du JSON valide. Produis UNIQUEMENT du JSON valide, sans texte avant ou apres.',
          [{ role: 'user', content: 'JSON valide uniquement.' }],
          12000
        );
        const result2 = BrainSafety.parseAnalystJSON(resp2);
        if (!result2) {
          this._log('Output retry failed');
          return { _meta: { error: 'generation_failed', quality: 'low' } };
        }
        return result2;
      }
      return result;
    } catch (e) {
      this._log('Output error: ' + e.message);
      return { _meta: { error: e.message, quality: 'low' } };
    }
  },

  /**
   * Output intermediaire — produit un apercu en cours de session.
   * Non bloquant. Le Driver continue pendant que l'output se génère.
   * Le contenu est défini par le domain pack (getMidOutputPrompt).
   * @returns {string|null} Texte intermediaire ou null si échec
   */
  async generateMidOutput() {
    if (!this.config.domain.getMidOutputPrompt) {
      this._log('Domain pack has no getMidOutputPrompt');
      return null;
    }

    const transcript = this.getTranscript();
    const brainCtx = BrainPrompt.buildBrainContext(
      this.config.brain, this.config.prenom, this.config.age
    );

    const ctx = {
      prenom: this.config.prenom,
      age: this.config.age,
      genre: this.config.genre,
      transcript,
      brainContext: brainCtx,
      brain: this.config.brain,
    };

    const { system, user, model } = this.config.domain.getMidOutputPrompt(ctx);

    try {
      const resp = await BrainAPI.call(system, [{ role: 'user', content: user }], 3000, model || undefined);
      if (!resp || resp.length < 100) {
        this._log('MidOutput: response too short');
        return null;
      }
      this._log(`MidOutput: ${resp.length} chars generated`);
      return resp;
    } catch (e) {
      this._log('MidOutput error: ' + e.message);
      return null;
    }
  },

  getTranscript() {
    return `PERSONA BRAIN V3 — ${this.config.prenom}\nDate: ${new Date().toISOString()}\nTours: ${BrainMemory.working.turnCount}\nBrain: ${this.config.brain ? 'oui' : 'non'}\nDomain: ${this.config.domain?.name || 'unknown'}\n\n` +
      BrainMemory.history.map(m =>
        `[${m.role === 'user' ? this.config.prenom.toUpperCase() : 'DRIVER'}]\n${m.content}`
      ).join('\n\n---\n\n');
  },

  // ════════════════════════════════════════
  // LEARNING INTER-SESSION
  // ════════════════════════════════════════

  /**
   * Génère le learning inter-session en fin de session.
   * Appeler AVANT ou APRÈS generateOutput() — indépendant.
   * Le learning est stocké dans BrainMemory.learningProfile
   * et sauvegardé avec save().
   *
   * @returns {object|null} le learning profile
   */
  async generateLearningSynthesis() {
    this._log('Generating learning synthesis...');
    const apiCallFn = (system, messages, maxTokens) => {
      return BrainAPI.callWithFallback(system, messages, maxTokens, this.modelChains.summary);
    };
    const result = await BrainMemory.generateLearningSynthesis(apiCallFn);
    if (result) {
      this._log(`Learning synthesis done — ${result.opens?.length || 0} opens, ${result.closes?.length || 0} closes`);
      this.save(); // Persister immédiatement
    }
    return result;
  },

  /**
   * Retourne le learning profile courant (pour export/affichage).
   */
  getLearningProfile() {
    return BrainMemory.learningProfile;
  },

  // ════════════════════════════════════════
  // SAVE / RESTORE
  // ════════════════════════════════════════

  save() {
    const data = {
      config: {
        prenom: this.config.prenom,
        age: this.config.age,
        genre: this.config.genre,
        workerUrl: this.config.workerUrl,
        brain: this.config.brain,
        domainName: this.config.domain?.name || '',
      },
      memory: BrainMemory.getState(),
      analyst: {
        lastResult: BrainAnalyst.lastResult,
        lastNote: BrainAnalyst.lastNote,
      },
      savedAt: Date.now(),
      elapsedMs: Date.now() - (this._timerStart || Date.now()),
    };
    try {
      localStorage.setItem('brain_v3_session', JSON.stringify(data));
      this._log(`Session saved (${BrainMemory.history.length} msgs, ${BrainMemory.working.turnCount} tours)`);
    } catch (e) {
      this._log('Save failed: ' + e.message);
    }
  },

  restore(saved) {
    if (!saved) return;
    // Config
    this.config.prenom = saved.config.prenom;
    this.config.age = saved.config.age;
    this.config.genre = saved.config.genre;
    this.config.workerUrl = saved.config.workerUrl;
    this.config.brain = saved.config.brain;
    this.ended = false;
    this.isGenerating = false;
    // V7.4.3 (correctif Codex) — nouveau sessionId aussi à la reprise : toute
    // analyse en vol d'avant la reprise devient périmée.
    this.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    this._lastIntegratedTurn = 0;

    // Re-init API
    BrainAPI.init({
      workerUrl: saved.config.workerUrl,
      model: window.BRAIN_VARIANT?.model || 'claude-sonnet-4-6',
      temperature: window.BRAIN_VARIANT?.temperature || 0.8,
      maxTokens: window.BRAIN_VARIANT?.maxTokens || 500,
    });

    // Restore memory
    BrainMemory.restore(saved.memory);

    // Restore analyst
    if (saved.analyst) {
      BrainAnalyst.lastResult = saved.analyst.lastResult;
      BrainAnalyst.lastNote = saved.analyst.lastNote;
    }
  },

  hasSaved() {
    try { return !!localStorage.getItem('brain_v3_session'); } catch (e) { return false; }
  },

  getSaved() {
    try {
      const s = localStorage.getItem('brain_v3_session');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },

  clearSaved() {
    try { localStorage.removeItem('brain_v3_session'); } catch (e) {}
  },

  autoSave() {
    // V7.4.3 (correctif Codex) — sauvegarde à CHAQUE tour, pas un sur deux.
    // Avant : `turnCount % 2 === 0` pouvait laisser le DERNIER échange hors
    // sauvegarde si endSession() échouait juste après un tour impair — la
    // protection transactionnelle de endSession() ne sert à rien si la
    // sauvegarde elle-même est en retard d'un tour. Le coût d'écriture
    // localStorage à chaque tour est négligeable face au risque de perte.
    if (BrainMemory.working.turnCount > 0) {
      this.save();
    }
  },

  // ════════════════════════════════════════
  // BRAIN LOADER
  // ════════════════════════════════════════

  loadBrain(jsonObj) {
    // V7.4.3 (correctif Codex) — stocké en `pendingBrain` (état du FORMULAIRE,
    // avant toute session), PAS dans `this.config.brain` (état de LA session
    // en cours). Avant : un brain chargé par Alice restait dans config.brain
    // et startSession() le réinjectait explicitement dans init() pour Bob.
    let b = null;
    if (jsonObj.generated_brain_v210) b = jsonObj.generated_brain_v210;
    else if (jsonObj._meta?.schema === 'CLONE-PERSONALITY-1.0') b = jsonObj;
    else if (jsonObj.personality?.big_five) b = jsonObj;
    if (b) { this.pendingBrain = b; return b; }
    return null;
  },

  // ════════════════════════════════════════
  // INTERNE
  // ════════════════════════════════════════

  _buildDriverPrompt() {
    const domain = this.config.domain;
    const brainCtx = BrainPrompt.buildBrainContext(
      this.config.brain, this.config.prenom, this.config.age
    );
    const memCtx = BrainMemory.getContext();
    const sk = BrainMemory.working.skippedTopics.length
      ? BrainMemory.working.skippedTopics.join(', ') : '';

    // Le code COMPTE — brain-attention produit les données brutes
    const attCtx = BrainAttention.compute({
      structured: BrainMemory.structured,
      working: BrainMemory.working,
      learning: BrainMemory.learning,
    }, this.config.age);

    // Rappel de couverture si la fin a été refusée
    let coverageCtx = '';
    if (this._coverageReminder) {
      coverageCtx = `\n═══ RAPPEL COUVERTURE ═══\nTu as voulu terminer mais la ligne du temps n'est PAS complete.\n${this._coverageReminder}\nTu dois couvrir ces periodes avant de pouvoir terminer. Retourne vers ce qui manque.\n═══════════════════════\n`;
      this._coverageReminder = null; // Consommé
    }

    return BrainPrompt.buildSystemPrompt({
      prenom: this.config.prenom,
      age: this.config.age,
      genre: this.config.genre,
      identity: domain.getIdentity(),
      cognition: domain.getCognition(),
      memoryContext: memCtx + coverageCtx,
      brainContext: brainCtx,
      attentionContext: attCtx,
      skippedTopics: sk,
      turnNum: BrainMemory.working.turnCount + 1,
    });
  },

  /**
   * Analyse BLOQUANTE — boot sequence (T1-T5).
   * Le Driver ATTEND que l'analyste ait fini.
   * La carte, la note, les données attention sont prêtes AVANT que le Driver parle.
   */
  async _runBlockingAnalysis(turnNum) {
    const recentExchanges = BrainMemory.history.slice(-8).map(m =>
      `[${m.role === 'user' ? this.config.prenom.toUpperCase() : 'DRIVER'}] ${m.content}`
    ).join('\n\n');

    // Transmettre la dernière pensée du Driver à l'analyste
    const driverImage = BrainMemory.lastDriverImage
      ? `\nDERNIERE PENSEE DU DRIVER:\n${BrainMemory.lastDriverImage}\n`
      : '';

    const domainInject = this.config.domain.getAnalystInject
      ? this.config.domain.getAnalystInject() : '';

    const brainCtx = BrainPrompt.buildBrainContext(
      this.config.brain, this.config.prenom, this.config.age
    );

    try {
      await BrainAnalyst.analyze({
        turnNum,
        recentExchanges: recentExchanges + driverImage,
        memory: BrainMemory.structured,
        learningTraces: BrainMemory.getLearningContext(),
        domainInject,
        brainContext: brainCtx,
        age: this.config.age,
        apiCall: BrainAPI.call.bind(BrainAPI),
        apiCallFast: (system, messages, maxTokens) => {
          return BrainAPI.callWithFallback(system, messages, maxTokens, this.modelChains.perception);
        },
      });

      const result = BrainAnalyst.getStructuredResult();
      if (result) {
        BrainMemory.integrate(result);
      }
      this._log(`[Boot T${turnNum}] Analyst DONE — note + carte ready for Driver`);
    } catch (e) {
      this._log(`[Boot T${turnNum}] Analyst error: ${e.message} — Driver proceeds without`);
    }
  },

  /**
   * Analyse en arrière-plan — non-bloquante.
   * Le Driver a déjà parlé. L'analyste enrichit la mémoire pour le tour SUIVANT.
   * Comme un vrai cerveau : tu parles pendant que ton inconscient analyse.
   */
  // V7.4.3 (correctif Codex) — dernier tour dont l'analyse a été intégrée.
  // Empêche qu'une analyse plus ANCIENNE (T5, lente) écrase le résultat
  // d'une analyse plus RÉCENTE (T6, rapide) résolue avant elle — course
  // intra-session, indépendante du changement de personne.
  _lastIntegratedTurn: 0,

  _runBackgroundAnalysis(turnNum) {
    // V7.4.3 (correctif Codex) — capturer le sessionId ET le turnNum ACTUELS
    // au moment du LANCEMENT de l'analyse (pas à sa résolution). Si init()
    // ou restore() est rappelé avant que la promesse ne se résolve (nouvelle
    // personne, ou reprise), le sessionId capturé ne correspondra plus au
    // sessionId courant — l'intégration sera refusée, silencieusement.
    const capturedSessionId = this.sessionId;

    const recentExchanges = BrainMemory.history.slice(-8).map(m =>
      `[${m.role === 'user' ? this.config.prenom.toUpperCase() : 'DRIVER'}] ${m.content}`
    ).join('\n\n');

    // Transmettre la dernière pensée du Driver à l'analyste
    const driverImage = BrainMemory.lastDriverImage
      ? `\nDERNIERE PENSEE DU DRIVER:\n${BrainMemory.lastDriverImage}\n`
      : '';

    const domainInject = this.config.domain.getAnalystInject
      ? this.config.domain.getAnalystInject() : '';

    const brainCtx = BrainPrompt.buildBrainContext(
      this.config.brain, this.config.prenom, this.config.age
    );

    BrainAnalyst.analyze({
      turnNum,
      recentExchanges: recentExchanges + driverImage,
      memory: BrainMemory.structured,
      learningTraces: BrainMemory.getLearningContext(),
      domainInject,
      brainContext: brainCtx,
      age: this.config.age,
      apiCall: BrainAPI.call.bind(BrainAPI),
      apiCallFast: (system, messages, maxTokens) => {
        return BrainAPI.callWithFallback(system, messages, maxTokens, this.modelChains.perception);
      },
    }).then(() => {
      // Garde-fou 1 — anti-contamination entre personnes : cette analyse
      // appartient-elle encore à LA SESSION ACTUELLE ?
      if (capturedSessionId !== this.sessionId) {
        this._log(`[Analyst] Résultat PÉRIMÉ T${turnNum} ignoré (session changée depuis le lancement)`);
        return;
      }
      // Garde-fou 2 — anti-course intra-session : un tour plus ANCIEN ne doit
      // jamais écraser un résultat de tour plus RÉCENT déjà intégré.
      if (turnNum <= this._lastIntegratedTurn) {
        this._log(`[Analyst] Résultat T${turnNum} ignoré (T${this._lastIntegratedTurn} déjà intégré, plus récent)`);
        return;
      }
      const result = BrainAnalyst.getStructuredResult();
      if (result) {
        BrainMemory.integrate(result);
        this._lastIntegratedTurn = turnNum;
      }
      this._log(`[Analyst] Background done T${turnNum} — note ready for T${turnNum + 1}`);
    }).catch(e => {
      this._log(`[Analyst] Background error T${turnNum}: ${e.message}`);
    });
  },

  _log(msg) {
    console.log('[BrainCore]', msg);
    if (window._brainLog) window._brainLog(msg);
  },

  // ════════════════════════════════════════
  // GARDE-FOU COUVERTURE
  // Le code COMPTE. Le LLM RAISONNE.
  // Le superviseur vérifie la complétude
  // de la ligne du temps avant de valider la fin.
  // ════════════════════════════════════════

  _endOverride: false,
  _coverageReminder: null,
  _coverageRemindCount: 0,

  /**
   * Vérifie que la ligne du temps est couverte avant de valider la fin.
   * Le code ne juge pas le CONTENU — il vérifie la COUVERTURE.
   *
   * @returns {object} { valid: boolean, reason: string, detail: string }
   */
  _checkCoverageForEnd() {
    const carte = BrainMemory.structured.carte;
    const scenes = BrainMemory.structured.scenes;

    if (!carte || !carte.length) {
      return { valid: false, reason: 'Aucune carte — impossible de valider la couverture.', detail: '' };
    }

    // Périodes non explorées (statut mentionne ou inconnu)
    const nonExplorees = carte.filter(c => c.periode && (c.statut === 'mentionne' || c.statut === 'inconnu'));
    // Périodes explorées mais creuses (< 2 scènes)
    const creuses = carte.filter(c => c.periode && c.statut === 'explore' && (typeof c.scenes !== 'number' || c.scenes < 2));

    const problems = [];

    // MINIMUM DE TOURS PAR ÂGE — le code COMPTE
    // Un profil de 81 ans ne peut pas finir en 15 tours comme un profil de 16 ans.
    const age = this.config.age;
    const turnCount = BrainMemory.working.turnCount;
    if (age) {
      let minTurns;
      if (age <= 25) minTurns = 12;
      else if (age <= 40) minTurns = 18;
      else if (age <= 60) minTurns = 25;
      else minTurns = 30;
      if (turnCount < minTurns) {
        problems.push(`TOURS INSUFFISANTS: ${turnCount} tours pour ${age} ans de vie — minimum ${minTurns}`);
      }
    }

    if (nonExplorees.length) {
      problems.push(`PERIODES NON EXPLOREES: ${nonExplorees.map(c => c.periode + ' (~' + (c.annees || '?') + ' ans)').join(', ')}`);
    }
    if (creuses.length) {
      problems.push(`CHAPITRES CREUX: ${creuses.map(c => c.periode + ' (' + (c.scenes || 0) + ' scene(s))').join(', ')}`);
    }

    // Vérification temporelle — le présent est-il couvert ?
    if (age) {
      const hasPresent = carte.some(c =>
        c.periode && c.statut === 'explore' &&
        (c.periode.toLowerCase().includes('present') ||
         c.periode.toLowerCase().includes('actuel') ||
         c.periode.toLowerCase().includes('aujourd'))
      );
      if (!hasPresent) {
        // Vérifier si la dernière période couvre l'âge actuel
        const lastExplored = carte
          .filter(c => c.statut === 'explore' && typeof c.annees === 'number')
          .reduce((acc, c) => {
            const endYear = (c.annees || 0);
            return endYear > acc ? endYear : acc;
          }, 0);
        const totalCovered = carte
          .filter(c => c.statut === 'explore' && typeof c.annees === 'number')
          .reduce((sum, c) => sum + c.annees, 0);
        if (totalCovered < age * 0.75) {
          problems.push(`COUVERTURE TEMPORELLE: ~${totalCovered} ans couverts sur ${age} — moins de 75% de la vie`);
        }
      }
    }

    if (problems.length) {
      return {
        valid: false,
        reason: problems.join(' | '),
        detail: `carte:${carte.length} | explorees:${carte.filter(c => c.statut === 'explore').length} | mentionnees:${nonExplorees.length} | creuses:${creuses.length}`
      };
    }

    return {
      valid: true,
      reason: '',
      detail: `carte:${carte.length} | toutes explorees avec scenes`
    };
  }
};

window.BrainCore = BrainCore;
