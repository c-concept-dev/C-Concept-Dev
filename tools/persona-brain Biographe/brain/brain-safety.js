// ═══════════════════════════════════════════════════════════════════
// BRAIN-SAFETY.js — Le filet de sécurité
// Persona Brain V3 — C Concept&Dev — Christophe BONNET
//
// 4 responsabilités :
//   1. Validation JSON analyste (parse + fallback regex)
//   2. Nettoyage output Driver (stripReasoning)
//   3. Blocage labels internes qui fuiteraient
//   4. Fallback texte quand tout échoue
//
// Pas de logique métier. Pas de décision. Filet uniquement.
// ═══════════════════════════════════════════════════════════════════

const BrainSafety = {

  // Détection de raisonnement interne qui fuite dans l'output
  // Pas de liste hardcodée de labels — on détecte les patterns structurels
  // (blocs en CAPS, listes a/b/c, marqueurs analytiques)

  // ── 1. Validation JSON analyste ──
  /**
   * Parse le retour brut de l'analyste en JSON.
   * Tente JSON.parse direct, puis regex extraction, puis fallback.
   * @param {string} raw - Réponse brute de l'API
   * @returns {object|null} JSON parsé ou null si échec total
   */
  parseAnalystJSON(raw) {
    const clean = raw.replace(/```json|```/g, '').trim();
    // Tentative directe
    try { return JSON.parse(clean); } catch (e) {}
    // Extraction regex
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e) {
        // Tentative réparation : tronquer la dernière paire clé/valeur incomplète
        const truncated = match[0].replace(/,\s*"[^"]*":\s*"[^"]*"\s*$/, '}') + '}';
        try { return JSON.parse(truncated); } catch (e2) {}
      }
    }
    return null;
  },

  /**
   * Vérifie que le JSON analyste contient les champs minimum requis.
   * Retourne la liste des champs manquants.
   * @param {object} result - JSON parsé
   * @returns {string[]} Champs manquants
   */
  validateAnalystResult(result) {
    const required = ['carte', 'note_driver'];
    return required.filter(f => !result[f]);
  },

  // ── 2. Nettoyage output Driver ──
  /**
   * Supprime le raisonnement interne qui fuite dans la réponse du Driver.
   * Le prompt dit au LLM de raisonner dans sa tête — s'il fuite,
   * on garde UNIQUEMENT la partie qui ressemble à de la parole naturelle.
   * @param {string} text - Réponse brute du Driver
   * @returns {string} Texte nettoyé
   */
  stripReasoning(text) {
    let t = text.trim();

    // ── 1. Extraire [IMAGE]...[/IMAGE] — cas nominal ──
    const imageMatch = t.match(/\[IMAGE\]([\s\S]*?)\[\/IMAGE\]/);
    if (imageMatch) {
      this._lastImage = imageMatch[1].trim();
      t = t.replace(/\[IMAGE\][\s\S]*?\[\/IMAGE\]/, '').trim();
      if (t.length > 5 && !this._looksStructured(t)) return t;
    }

    // ── 2. [IMAGE] sans [/IMAGE] — fallback ──
    if (t.includes('[IMAGE]')) {
      const parts = t.split('[IMAGE]');
      const before = parts[0].trim();
      const inside = parts[1] || '';
      this._lastImage = inside.trim();
      // Si du texte existe AVANT [IMAGE], c'est la question
      if (before.length > 5 && !this._looksStructured(before)) return before;
      // Sinon chercher la dernière ligne non structurée dans le contenu IMAGE
      const lines = inside.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!this._looksStructured(lines[i]) && !lines[i].startsWith('[')) {
          return lines[i];
        }
      }
      t = '';
    }

    // ── 3. Court et propre → retourner ──
    if (t.length > 5 && !this._looksStructured(t)) return t;

    // ── 4. Blocs par double saut de ligne ──
    const blocks = t.split(/\n\n+/);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i].trim();
      if (b.length > 5 && !this._looksStructured(b)) return b;
    }

    // ── 5. Fallback absolu ──
    return blocks[blocks.length - 1]?.trim() || t;
  },

  /**
   * Retourne la dernière image mentale du Driver (pour debug/logs).
   */
  getLastImage() {
    return this._lastImage || null;
  },

  _lastImage: null,

  // ── 3. Détection de fuite ──
  hasLeakedLabels(text) {
    if (text.includes('[IMAGE]') || text.includes('[/IMAGE]')) return true;
    return this._looksStructured(text);
  },

  // ── 4. Fallback texte ──
  /**
   * Génère un message de fallback quand l'API échoue.
   * @param {string} context - 'opening' | 'resume' | 'turn' | 'export'
   * @param {string} prenom - Prénom du sujet
   * @returns {string}
   */
  getFallbackText(context, prenom) {
    switch (context) {
      case 'opening':
        return `${prenom}, merci d'être là. Le fonctionnement est simple — vous parlez aussi longtemps que vous voulez, prenez votre temps, et quand vous avez fini vous appuyez sur Envoyer. On va remonter le fil de votre histoire ensemble. Pour commencer — racontez-moi dans quelle famille vous êtes arrivé au monde.`;
      case 'resume':
        return `Ravi de vous retrouver, ${prenom}. Nous en étions... vous me parliez de votre histoire. On continue ?`;
      case 'turn':
        return `Pardonnez-moi, ${prenom}, je n'ai pas bien entendu. Vous disiez ?`;
      case 'export':
        return '{"_meta":{"error":"generation_failed"}}';
      default:
        return `On continue, ${prenom}.`;
    }
  },

  // ── Interne ──
  // Détecte si un bloc RESSEMBLE à du raisonnement structuré
  // (pas de liste de mots-clés — on regarde la FORME)
  _looksStructured(block) {
    const s = block.trim();
    // Bloc qui commence par 3+ majuscules suivies d'un séparateur → label analytique
    if (/^[A-ZÀ-Ü]{3,}[\s]*[\d\-:\—→]/m.test(s)) return true;
    // LABEL : valeur — majuscules suivies de deux-points (SCENE :, VOIX :, MONDE :)
    if (/^[A-ZÀ-Ü]{3,}[\s]*:/m.test(s)) return true;
    // Lignes avec des marqueurs de liste analytique a), b), c)
    if (/^[a-e]\)\s/m.test(s)) return true;
    // Plusieurs lignes commençant par un tiret ou une étoile (raisonnement en liste)
    const bulletLines = (s.match(/^[\s]*[-*•]\s/gm) || []).length;
    if (bulletLines >= 3) return true;
    return false;
  }
};

window.BrainSafety = BrainSafety;
