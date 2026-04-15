// ═══════════════════════════════════════════════════════════════════
// BRAIN-ATTENTION.js — Le système attentionnel
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// Module CODE PUR (coût zéro). Pas d'appel LLM.
// COMPTE à chaque tour et produit un bloc ATTENTION
// injecté dans le prompt du Driver.
//
// Le code COMPTE. Le LLM RAISONNE sur ce qu'il voit.
// Pas de seuils. Pas de décisions codées. Des données brutes.
// ═══════════════════════════════════════════════════════════════════

const BrainAttention = {

  /**
   * Produit le bloc ATTENTION à partir de l'état mémoire.
   * Données BRUTES — le LLM raisonne dessus.
   *
   * @param {object} memory - BrainMemory (structured + working + learning)
   * @param {number} age - âge du sujet
   * @returns {string} bloc texte à injecter dans le prompt
   */
  compute(memory, age) {
    const sections = [];
    const turnCount = memory.working.turnCount;

    // ── COMPTEUR ──
    sections.push(`TOUR ${turnCount} | VIE: ${age || '?'} ans a couvrir`);

    // ── MINIMUM TOURS PAR ÂGE ──
    if (age) {
      let minTurns;
      if (age <= 25) minTurns = 12;
      else if (age <= 40) minTurns = 18;
      else if (age <= 60) minTurns = 25;
      else minTurns = 30;
      if (turnCount < minTurns) {
        sections.push(`MINIMUM TOURS: ${turnCount}/${minTurns} — NE PAS TERMINER avant ${minTurns} tours`);
      }
    }

    // ── VOUVOIEMENT ──
    sections.push('VOUVOIEMENT OBLIGATOIRE — meme si la personne tutoie');

    // ── CARTE ──
    const carteData = this._computeCarte(memory.structured.carte);
    if (carteData) sections.push(carteData);

    // ── COUVERTURE ──
    const coverage = this._computeCoverage(memory.structured.carte, age);
    if (coverage) sections.push(coverage);

    // ── FOCUS ──
    const focus = this._computeFocus(memory.structured.carte, turnCount);
    if (focus) sections.push(focus);

    // ── PERSONNES ──
    const peopleData = this._computePeople(memory.structured.people, turnCount);
    if (peopleData) sections.push(peopleData);

    // ── PERSONNES PAR PÉRIODE — croisement carte × people ──
    const peopleGaps = this._computePeopleGaps(memory.structured.carte, memory.structured.scenes);
    if (peopleGaps) sections.push(peopleGaps);

    // ── DYNAMIQUE ──
    const dynamics = this._computeDynamics(memory.working.wordCounts);
    if (dynamics) sections.push(dynamics);

    // ── APPRENTISSAGE ──
    const learningData = this._computeLearning(memory.learning);
    if (learningData) sections.push(learningData);

    // ── LIVRE — complétude globale (scènes vs mentions) ──
    const bookState = this._computeBookState(memory.structured.scenes, memory.structured.carte);
    if (bookState) sections.push(bookState);

    return `═══ ATTENTION ═══\n${sections.join('\n')}\n═════════════════`;
  },

  // ════════════════════════════════════════
  // COMPTAGES INTERNES
  // ════════════════════════════════════════

  /**
   * Focus : combien de tours consécutifs sur la même période.
   * Le Driver VOIT ce chiffre et RAISONNE — trop longtemps au même endroit ?
   */
  _computeFocus(carte, turnCount) {
    if (!carte || !carte.length) return null;

    // Trouver la période "explore" avec le plus de scènes (= là où on est)
    const explored = carte.filter(p => p.statut === 'explore');
    if (!explored.length) return null;

    // Période active = celle marquée 'active' par l'analyste, sinon celle avec le plus de scènes
    let current = carte.find(p => p.active === true);
    if (!current) {
      current = explored.reduce((a, b) => (b.scenes || 0) > (a.scenes || 0) ? b : a);
    }

    // Tracking de tours consécutifs sur la même période
    if (!this._lastPeriode || this._lastPeriode !== current.periode) {
      this._lastPeriode = current.periode;
      this._consecutiveTurns = 1;
    } else {
      this._consecutiveTurns++;
    }

    // Compter les périodes non explorées
    const unexplored = carte.filter(p => p.statut === 'inconnu' || p.statut === 'mentionne');
    const totalPeriodes = carte.length;
    const periodesCouvertes = explored.length;

    let s = `FOCUS: ${periodesCouvertes} periode(s) exploree(s) sur ${totalPeriodes} identifiee(s) en ${turnCount} tours`;
    const currentAnnees = typeof current.annees === 'number' ? current.annees : null;
    s += ` | PERIODE ACTUELLE: "${current.periode || '?'}"${currentAnnees ? ' (~' + currentAnnees + ' ans)' : ''} depuis ${this._consecutiveTurns} tour(s), ${current.scenes || 0} scene(s)`;

    if (unexplored.length) {
      s += ` | NON EXPLOREES: ${unexplored.filter(p => p.periode).map(p => p.periode + '(~' + (p.annees || '?') + ' ans)').join(', ')}`;
    }

    return s;
  },

  _lastPeriode: null,
  _consecutiveTurns: 0,

  /**
   * Carte : pour chaque période, nombre de scènes et statut
   */
  _computeCarte(carte) {
    if (!carte || !carte.length) return null;

    const lines = carte.filter(p => p.periode).map(p => {
      const scenes = typeof p.scenes === 'number' ? p.scenes : 0;
      const annees = typeof p.annees === 'number' ? p.annees : '?';
      const statut = p.statut || '?';
      return `  ${p.periode}: ${scenes} scene(s), ~${annees} ans, ${statut}`;
    });

    return `CARTE:\n${lines.join('\n')}`;
  },

  /**
   * Couverture : ratio années couvertes / années vécues
   */
  _computeCoverage(carte, age) {
    if (!carte || !carte.length || !age) return null;

    let anneesExplorees = 0;
    let anneesInconnues = 0;
    let periodesInconnues = [];

    carte.forEach(p => {
      if (!p.periode) return; // guard
      const annees = typeof p.annees === 'number' ? p.annees : 0;
      if (p.statut === 'inconnu' || p.statut === 'mentionne') {
        anneesInconnues += annees;
        periodesInconnues.push(p.periode);
      } else {
        anneesExplorees += annees;
      }
    });

    let s = `COUVERTURE: ~${anneesExplorees} ans explores sur ~${age} ans de vie`;
    if (periodesInconnues.length) {
      s += ` | Zones non explorees: ${periodesInconnues.join(', ')}`;
    }

    // PROPORTION — détecte les périodes survolées (beaucoup d'années, peu de scènes)
    const proportions = carte
      .filter(p => p.periode && p.statut === 'explore' && typeof p.annees === 'number' && p.annees >= 5)
      .map(p => ({
        periode: p.periode,
        annees: p.annees,
        scenes: typeof p.scenes === 'number' ? p.scenes : 0,
        ratio: (typeof p.scenes === 'number' ? p.scenes : 0) / p.annees
      }))
      .filter(p => p.ratio < 0.3 && p.scenes < 4); // moins de 1 scène pour 3 ans = survolé

    if (proportions.length) {
      s += ` | SURVOLEE(S): ${proportions.map(p => p.periode + '(' + p.scenes + ' scenes/' + p.annees + ' ans)').join(', ')}`;
    }

    return s;
  },

  /**
   * Personnes : mentionnées, rôle, fréquence
   */
  _computePeople(people, turnCount) {
    if (!people || !people.length) return null;

    // Personnes mentionnées une seule fois vs récurrentes
    const once = people.filter(p => p.first_mentioned === p.last_mentioned);
    const recurring = people.filter(p => p.first_mentioned !== p.last_mentioned);

    let s = `PERSONNES: ${people.length} identifiee(s)`;
    if (recurring.length) {
      s += ` | Recurrentes: ${recurring.map(p => p.name).join(', ')}`;
    }
    if (once.length) {
      s += ` | Mentionnees 1 fois: ${once.map(p => p.name).join(', ')}`;
    }

    // Personnes non explorées (mentionnées mais sans scène associée)
    const noScene = people.filter(p => !p.role || p.role === 'inconnu');
    if (noScene.length) {
      s += ` | Sans role clarifie: ${noScene.map(p => p.name).join(', ')}`;
    }

    return s;
  },

  /**
   * Croisement carte × scènes : périodes explorées sans personnes.
   * Le code COMPTE. Le LLM raisonne.
   * Si une période a 3+ scènes mais aucune personne dans ces scènes,
   * c'est un signal : "cette période est peuplée de lieux mais vide de gens."
   */
  _computePeopleGaps(carte, scenes) {
    if (!carte || !carte.length || !scenes || !scenes.length) return null;

    const gaps = [];

    carte.forEach(c => {
      if (!c.periode || c.statut !== 'explore') return;
      const periodeScenes = scenes.filter(s => {
        const epoch = (s.epoch || '').toLowerCase();
        const periode = c.periode.toLowerCase();
        return epoch.includes(periode) || periode.includes(epoch);
      });

      if (periodeScenes.length < 3) return; // pas assez de scènes pour juger

      const hasPeople = periodeScenes.some(s => s.people && s.people.length > 0);
      if (!hasPeople) {
        gaps.push(c.periode + ' (' + periodeScenes.length + ' scenes, 0 personne)');
      }
    });

    if (!gaps.length) return null;
    return `PERIODES SANS PERSONNES: ${gaps.join(', ')}`;
  },

  /**
   * Dynamique : tendance d'ouverture/fermeture par comptage de mots
   */
  _computeDynamics(wordCounts) {
    if (!wordCounts || wordCounts.length < 2) return null;

    const last3 = wordCounts.slice(-3);
    const avgRecent = last3.reduce((a, b) => a + b.wc, 0) / last3.length;
    const avgGlobal = wordCounts.reduce((a, b) => a + b.wc, 0) / wordCounts.length;
    const lastWc = wordCounts[wordCounts.length - 1];

    return `DYNAMIQUE: dernier tour ${lastWc.wc} mots, recents ~${Math.round(avgRecent)}, moyenne ~${Math.round(avgGlobal)}`;
  },

  /**
   * Apprentissage : types qui ouvrent vs ferment
   */
  _computeLearning(learning) {
    if (!learning) return null;

    const parts = [];
    if (learning.opens && learning.opens.length) {
      parts.push(`Ouvre: ${learning.opens.join(', ')}`);
    }
    if (learning.closes && learning.closes.length) {
      parts.push(`Ferme: ${learning.closes.join(', ')}`);
    }
    if (learning.patterns && learning.patterns.length) {
      // Derniers 3 patterns
      const recent = learning.patterns.slice(-3);
      parts.push(`Patterns: ${recent.join(', ')}`);
    }

    if (!parts.length) return null;
    return `APPRENTISSAGE: ${parts.join(' | ')}`;
  },

  /**
   * État du livre — complétude globale.
   * Le code COMPTE le ratio scènes concrètes / mentions.
   * Le LLM raisonne sur la densité du livre.
   * Mentionner n'est pas explorer. Nommer n'est pas incarner.
   */
  _computeBookState(scenes, carte) {
    if (!scenes || !scenes.length) return null;

    const fortes = scenes.filter(s => s.charge === 'forte');
    const moderees = scenes.filter(s => s.charge === 'moderee');
    const mentions = scenes.filter(s => s.type === 'mention');
    const vraiesScenes = scenes.filter(s => s.type === 'scene' || s.type === 'micro_scene');

    let s = `LIVRE: ${vraiesScenes.length} scene(s) incarnee(s), ${mentions.length} mention(s)`;
    s += ` | ${fortes.length} forte(s), ${moderees.length} moderee(s)`;

    // Périodes avec scènes vs périodes juste mentionnées
    if (carte && carte.length) {
      const periodesAvecScenes = carte.filter(c =>
        c.periode && c.statut === 'explore' && typeof c.scenes === 'number' && c.scenes >= 2
      );
      const periodesCreuses = carte.filter(c =>
        c.periode && c.statut === 'explore' && (typeof c.scenes !== 'number' || c.scenes < 2)
      );
      if (periodesCreuses.length) {
        s += ` | CHAPITRES CREUX: ${periodesCreuses.map(c => c.periode).join(', ')}`;
      }
    }

    return s;
  },

};

window.BrainAttention = BrainAttention;
