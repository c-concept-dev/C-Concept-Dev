/*
 * ═════════════════════════════════════════════════════════════════════
 *  ATELIER LIVRE DE VIE — NOYAU ÉDITEUR
 *  atelier-editeur-core.js — V7.4.0-alpha
 *  C Concept&Dev — Christophe BONNET — 24 avril 2026
 * ═════════════════════════════════════════════════════════════════════
 *
 *  RESPONSABILITÉ
 *  ──────────────
 *  Prendre un texte de chapitre (ou un livre complet) + une partition,
 *  produire un rapport de relecture structuré avec passages suspects
 *  localisés, catégorisés, et optionnellement accompagnés de suggestions
 *  de correction.
 *
 *  CANON RESPECTÉ
 *  ──────────────
 *  - Aucun appel LLM — 100% déterministe
 *  - Aucun mot codé en dur — les motifs sont dérivés dynamiquement de la
 *    partition fournie par l'appelant
 *  - Aucune liste fallback statique — si la partition ne fournit pas les
 *    motifs, les tests qui en dépendent retournent 0 détection, pas une
 *    détection par défaut
 *  - Le noyau ne connaît pas le shell qui l'appelle
 *  - Le noyau ne dialogue jamais avec le noyau Auteur directement
 *  - API publique stable, internals modifiables
 *
 *  API PUBLIQUE
 *  ────────────
 *  EditeurNoyau.derivePatternsFromPartition(partition)
 *  EditeurNoyau.testNegationsOrales(text, options)
 *  EditeurNoyau.testNarrationNegative(text, options)
 *  EditeurNoyau.testMetaNomination(text, partition)
 *  EditeurNoyau.testProlepse(text)
 *  EditeurNoyau.testFormulesRouges(text)
 *  EditeurNoyau.testPOVAltitude(text, regime)
 *  EditeurNoyau.testPhrasesGlossantes(text, partition)
 *  EditeurNoyau.testMotifStagnant(text, chapterMemory, chIdx)
 *  EditeurNoyau.reviewChapter(text, partition, options)
 *  EditeurNoyau.reviewBook(chapters, partition, options)
 *  EditeurNoyau.renderReportHTML(report)
 *  EditeurNoyau.renderTextWithHighlights(text, report)
 *  EditeurNoyau.VERSION
 *
 *  FORMAT DE RETOUR STANDARD DES TESTS
 *  ────────────────────────────────────
 *  {
 *    count: number,      // nombre d'occurrences détectées
 *    hits: [              // détails (max 6 par test pour rester lisible)
 *      {
 *        match: string,   // texte exact détecté (max 120 chars)
 *        start: number,   // position de début dans le texte source
 *        end: number,     // position de fin dans le texte source
 *        motif?: string,  // motif de partition concerné si applicable
 *        kind?: string,   // sous-catégorie du défaut
 *        suggestion?: string  // suggestion de correction courte
 *      }
 *    ],
 *    severity: 'haute'|'moyenne'|'faible'
 *  }
 * ═════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  const VERSION = '7.4.1-alpha';

  // ─────────────────────────────────────────────────────────────────
  // HELPERS INTERNES
  // ─────────────────────────────────────────────────────────────────

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Retire les passages entre guillemets français. Les dialogues ne
   * comptent jamais comme défauts narratoriaux — c'est le personnage
   * qui parle, pas le narrateur.
   */
  function stripDialogues(text) {
    return text.replace(/«[^»]*»/g, function (match) {
      // Remplace par des espaces de même longueur pour préserver les offsets
      return new Array(match.length + 1).join(' ');
    });
  }

  /**
   * Localise la position des matches d'une regex globale dans un texte.
   * Retourne un tableau de { match, start, end }.
   */
  function findMatches(text, re) {
    re.lastIndex = 0;
    const results = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      results.push({
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
      if (m.index === re.lastIndex) re.lastIndex++; // anti-boucle infinie
    }
    return results;
  }

  /**
   * Déduplique des hits sur la base du texte match + position.
   * Conserve les 6 premiers pour rester lisible.
   */
  function limitHits(hits, max = 6) {
    const seen = new Set();
    const out = [];
    for (const h of hits) {
      const key = h.start + ':' + h.match;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
      if (out.length >= max) break;
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. DÉRIVATION DE PATTERNS DEPUIS LA PARTITION
  // ─────────────────────────────────────────────────────────────────
  //
  // Lit bp.procedes_de_transe :
  //   - mots_pivots_isomorphes[].mot  → motifs candidats
  //   - motif_saupoudrage_principal   → motif candidat
  //
  // Aucun fallback statique. Si la partition ne fournit rien, retourne
  // un tableau vide.
  // ─────────────────────────────────────────────────────────────────

  function derivePatternsFromPartition(partition) {
    const patterns = [];
    if (!partition || !partition.procedes_de_transe) return patterns;

    const trs = partition.procedes_de_transe;
    const motifs = new Set();

    if (Array.isArray(trs.mots_pivots_isomorphes)) {
      for (const p of trs.mots_pivots_isomorphes) {
        const mot = (typeof p === 'string') ? p : (p && p.mot);
        if (mot && typeof mot === 'string' && mot.trim().length >= 3) {
          motifs.add(mot.trim().toLowerCase());
        }
      }
    }

    if (typeof trs.motif_saupoudrage_principal === 'string' &&
        trs.motif_saupoudrage_principal.trim().length >= 3) {
      motifs.add(trs.motif_saupoudrage_principal.trim().toLowerCase());
    }

    if (motifs.size === 0) return patterns;

    for (const motifRaw of motifs) {
      const motifEsc = escapeRegex(motifRaw);

      patterns.push({
        motif: motifRaw,
        kind: 'designation_isolee',
        re: new RegExp(
          `(?<![a-zéèàâêîôûç])(?:le|la|les|mon|ma|mes|ce|cette|ces)\\s+${motifEsc}\\b(?:[^a-zéèàâêîôûç\\n.!?—]{0,20}[.!?—])`,
          'gi'
        ),
      });

      patterns.push({
        motif: motifRaw,
        kind: 'c_est_le',
        re: new RegExp(
          `(?<![a-zéèàâêîôûç])c['']?(?:est|était)\\s+(?:le|la|les|ce|cette|ces|mon|ma|mes|ça,\\s*le|ça,\\s*la)\\s+${motifEsc}\\b`,
          'gi'
        ),
      });

      patterns.push({
        motif: motifRaw,
        kind: 'retour_nominatif',
        re: new RegExp(
          `(?<![a-zéèàâêîôûç])${motifEsc}\\s*\\.\\s*(?:[Mm]on|[Mm]a|[Cc]['']?est|[Cc]e|[Cc]ette)\\s+${motifEsc}\\b`,
          'gi'
        ),
      });

      patterns.push({
        motif: motifRaw,
        kind: 'appropriation_meta',
        re: new RegExp(
          `(?<![a-zéèàâêîôûç])(?:maintenant\\s+)?(?:j['']?ai|nous\\s+avons)\\s+(?:le|la|les|mon|ma|mes|ce|cette|ces|un|une)\\s+${motifEsc}\\b`,
          'gi'
        ),
      });

      patterns.push({
        motif: motifRaw,
        kind: 'phrase_nue',
        re: new RegExp(
          `(?:^|[.!?—]\\s+)${motifEsc}\\s*[.!?—]`,
          'gi'
        ),
      });
    }

    return { meta_patterns: patterns, motifs: Array.from(motifs) };
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. TESTS DÉTERMINISTES
  // ─────────────────────────────────────────────────────────────────

  /**
   * TEST 1 — Négations françaises incomplètes en narration.
   * Hérité V7.3.4. Détecte "je sais pas" hors guillemets.
   */
  function testNegationsOrales(text /*, options */) {
    const horsGuillemets = stripDialogues(text);
    const phrases = horsGuillemets.split(/(?<=[.!?])\s+/);
    let count = 0;
    const hits = [];

    const negPatterns = [
      /\b(?:[Jj]e|[Tt]u|[Ii]l|[Ee]lle|[Oo]n|[Nn]ous|[Vv]ous|[Ii]ls|[Ee]lles|[Cc]['']|[Çç]a)\s+(?!(?:ne|n[']))([a-zéèàâêîôûç']{1,12})\s+(pas|rien|jamais|aucun|personne)\b/g,
      /\b(?:[Jj][']|[Ii]l|[Ee]lle|[Oo]n)\s+(?:y|en)\s+(?!(?:ne|n[']))([a-zéèàâêîôûç']{1,12})\s+(pas|rien|jamais|aucun|personne)\b/g,
      /\b(?:[Jj]e|[Tt]u|[Ii]l|[Ee]lle|[Oo]n|[Nn]ous|[Vv]ous|[Cc]['']|[Çç]a)\s+(?!(?:ne|n[']))([a-zéèàâêîôûç']{2,12})\s+plus\s*[.,;!?—]/g,
    ];

    let offset = 0;
    for (const p of phrases) {
      const phraseStart = text.indexOf(p, offset);
      if (phraseStart !== -1) offset = phraseStart + p.length;

      if (p.indexOf('[DIA]') >= 0) continue; // sécurité legacy
      if (!/[a-z]/.test(p)) continue;

      for (const re of negPatterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(p)) !== null) {
          count++;
          if (hits.length < 6) {
            hits.push({
              match: p.trim().substring(0, 140),
              start: phraseStart >= 0 ? phraseStart : 0,
              end: phraseStart >= 0 ? phraseStart + p.length : p.length,
              kind: 'negation_orale',
              suggestion: 'Ajouter "ne" ou "n\'" avant le verbe (grammaire française standard hors dialogue).',
            });
          }
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }
    }

    const severity = count >= 5 ? 'haute' : count >= 2 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 2 — Narration négative pédagogique (NOUVEAU V7.4).
   * Défaut principal identifié sur Raymond V7.3.7.
   * Patterns : "Ce n'était pas X", "Pas par Y", "Ce n'est pas de la Z",
   * "Il ne s'agissait pas de W" en position de commentaire narratorial.
   *
   * Ces phrases NIENT un attribut pour en suggérer un autre — elles
   * glossent ce que la scène venait de montrer.
   */
  function testNarrationNegative(text /*, options */) {
    const horsGuillemets = stripDialogues(text);
    const hits = [];
    let count = 0;

    const patterns = [
      // "Ce n'était pas X" / "Ce n'est pas X" en position de commentaire
      {
        re: /\b[Cc]e\s+n['']?(?:était|est|était\s+pas|est\s+pas)\s+(?:pas\s+)?(?:de\s+la\s+|du\s+|un[e]?\s+|des\s+)?[a-zéèàâêîôûç]{3,20}\b/gi,
        kind: 'ce_n_est_pas',
        suggestion: 'Supprimer — la scène a déjà montré ce que ce n\'était pas. Le lecteur a reçu.',
      },
      // "Pas par X" / "Pas de X" en début de phrase
      {
        re: /(?:^|[.!?—]\s+|\n\s*)[Pp]as\s+(?:par|de\s+la|du|par\s+méchanceté|par\s+froideur|par\s+malveillance|par\s+cruauté)\s*[.!?—,]/gi,
        kind: 'pas_par',
        suggestion: 'Supprimer — précision qui pédagogise. Le geste suffisait.',
      },
      // "Il/Elle ne X pas par Y" — négation psychologisante
      {
        re: /\b(?:[Ii]l|[Ee]lle)\s+ne\s+(?:l['']?|les\s+)?[a-zéèàâêîôûç]{3,15}(?:ai[st]?|a|ait|aient)?\s+pas\s+(?:par\s+|de\s+la\s+|du\s+)[a-zéèàâêîôûç]{3,20}\b/gi,
        kind: 'il_elle_ne_par',
        suggestion: 'Supprimer ou reformuler — le narrateur explique le motif psychologique du personnage.',
      },
      // "Je ne savais pas encore X" / "Il n'avait pas encore Y" — prolepse-gloss
      //   Couvre : "pas encore le", "pas encore compris", "pas encore à", etc.
      {
        re: /\b(?:[Jj]e|[Ii]l|[Ee]lle)\s+n['']?(?:avai[ts]?|étai[ts]?|sai[st]|saurai[ts]?|comprenai[ts]?)\s+pas\s+encore\b[^.!?]{0,100}/gi,
        kind: 'pas_encore_proleptique',
        suggestion: 'Supprimer — prolepse rétrospective masquée en narration. Le présent de la scène doit tenir seul.',
      },
      // "Je le sais maintenant" / "Je le savais depuis longtemps" — confirmation rétrospective
      {
        re: /\b(?:[Jj]e\s+le\s+sais\s+maintenant|[Jj]e\s+le\s+savais\s+déjà|[Jj]e\s+le\s+savais\s+depuis\s+longtemps|[Jj]e\s+le\s+sais\s+depuis\s+longtemps)\b[.,;!?—]?/gi,
        kind: 'confirmation_retrospective',
        suggestion: 'Supprimer — commentaire rétrospectif qui stabilise ce que la scène venait de faire sentir.',
      },
    ];

    for (const p of patterns) {
      const matches = findMatches(horsGuillemets, p.re);
      for (const m of matches) {
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.trim().substring(0, 140),
            start: m.start,
            end: m.end,
            kind: p.kind,
            suggestion: p.suggestion,
          });
        }
      }
    }

    const severity = count >= 4 ? 'haute' : count >= 2 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 3 — Méta-nomination (V7.3.7).
   * Patterns dérivés dynamiquement depuis la partition.
   * Défaut principal identifié sur Nadia V7.3.6.
   */
  function testMetaNomination(text, partition) {
    const derived = derivePatternsFromPartition(partition);
    if (!derived || !derived.meta_patterns || derived.meta_patterns.length === 0) {
      return { count: 0, hits: [], severity: 'faible' };
    }

    const horsGuillemets = stripDialogues(text);
    const hits = [];
    let count = 0;

    for (const p of derived.meta_patterns) {
      const matches = findMatches(horsGuillemets, p.re);
      if (matches.length === 0) continue;

      // Dédupliquer les textes de match identiques
      const seen = new Set();
      for (const m of matches) {
        const key = m.match.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.substring(0, 120),
            start: m.start,
            end: m.end,
            motif: p.motif,
            kind: p.kind,
            suggestion: 'Supprimer — le narrateur nomme ici un motif de la partition. Le lecteur doit le sentir, pas le recevoir nommé.',
          });
        }
      }
    }

    const severity = count >= 4 ? 'haute' : count >= 2 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 4 — Prolepses (V7.3.2).
   * Formulations qui anticipent ce que le lecteur découvrira plus tard.
   */
  function testProlepse(text) {
    const patterns = [
      /\b(?:il|elle)\s+ne\s+savait\s+pas\s+encore\b[^.]{0,80}/gi,
      /\b(?:j['']|il\s+|elle\s+)avai(?:s|t)\s+pas\s+encore\s+[a-zéèàâêîôûç]+[^.]{0,80}/gi,
      /\b(?:il|elle)\s+comprendrai(?:t|ent)\s+plus\s+tard\b[^.]{0,80}/gi,
      /\bdes\s+années\s+plus\s+tard\b[^.]{0,80}/gi,
      /\bce\s+qu['']?(?:il|elle)\s+ignorai(?:t|ent)\s+encore\b[^.]{0,80}/gi,
      /\b(?:il|elle|je)\s+sai(?:s|t)\s+pas\s+encore\s+(?:le|la|ce|que|pourquoi|comment)\b[^.]{0,80}/gi,
      /\bvingt\s+ans\s+plus\s+tard\b[^.]{0,80}/gi,
      /\bbien\s+plus\s+tard\b[^.]{0,80}/gi,
    ];

    const hits = [];
    let count = 0;

    for (const re of patterns) {
      const matches = findMatches(text, re);
      for (const m of matches) {
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.trim().substring(0, 140),
            start: m.start,
            end: m.end,
            kind: 'prolepse',
            suggestion: 'Supprimer ou déplacer — le narrateur sort du présent de la scène pour annoncer l\'avenir.',
          });
        }
      }
    }

    const severity = count >= 3 ? 'haute' : count >= 1 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 5 — Formules rouges (V7.3).
   * Expressions qui glossent au lieu de montrer.
   */
  function testFormulesRouges(text) {
    const rouges = [
      'elle comprit', 'il comprit', 'elle sut', 'il sut', 'à cet instant',
      'il réalisa', 'elle réalisa', 'ce qui signifiait', "c'était comme si",
      'quelque chose en lui', 'quelque chose en elle', 'une partie de lui',
      'malgré lui', 'malgré elle', 'il ne savait pas encore',
      'il comprendrait plus tard', "ce qu'il ignorait",
      // V7.4 ajouts (identifiés sur Kevin/Nadia/Raymond)
      'en une fraction de seconde', 'sans savoir pourquoi',
      'comme frappé par', 'soudain il sut',
    ];

    const hits = [];
    let count = 0;
    const lowerText = text.toLowerCase();

    for (const r of rouges) {
      const re = new RegExp(escapeRegex(r), 'gi');
      const matches = findMatches(text, re);
      for (const m of matches) {
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.trim().substring(0, 120),
            start: m.start,
            end: m.end,
            kind: 'formule_rouge',
            suggestion: 'Remplacer par un geste concret, un silence, un regard, un objet regardé.',
          });
        }
      }
    }

    const severity = count >= 4 ? 'haute' : count >= 2 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 6 — POV Altitude (NOUVEAU V7.4).
   * Plus fin que POV-TRANSITIONS. Détecte les phrases qui sortent du
   * régime du livre pour monter en altitude narratoriale :
   * commentaires auctoriaux, généralités, formulations-essai.
   */
  function testPOVAltitude(text /*, regime */) {
    const horsGuillemets = stripDialogues(text);
    const hits = [];
    let count = 0;

    const patterns = [
      // "Ce que X ne dit pas c'est que Y" — formule auctoriale
      //   Couvre les subordonnées entre "ne dit" et "c'est"
      //   Ex: "Ce que personne ne dit quand on sort de l'armée, c'est qu'il..."
      {
        re: /\b[Cc]e\s+que\s+(?:personne|les\s+gens|on)\s+ne\s+(?:dit|sait|comprend)\b[^.]{0,80}\bc['']?(?:est|était)\s+qu[e'']?\b[^.]{0,150}/gi,
        kind: 'formule_auctoriale',
        suggestion: 'Reformuler en scène — cette phrase commente au lieu de montrer.',
      },
      // "Il y a des gens qui / des hommes comme X" — généralisation
      {
        re: /\b[Ii]l\s+y\s+a\s+(?:des\s+gens|des\s+hommes|des\s+femmes|des\s+enfants|des\s+pères|des\s+mères)\s+(?:qui|comme)\b[^.]{0,150}/gi,
        kind: 'generalisation',
        suggestion: 'Reformuler — sortie du régime narratif vers une généralité auctoriale.',
      },
      // "Les X comme Y ne font pas Z" — proverbe/aphorisme
      {
        re: /\b[Ll]es\s+(?:hommes|femmes|enfants|pères|mères|gens)\s+comme\s+[a-zéèàâêîôûç]{3,15}\s+ne\s+[a-zéèàâêîôûç]+\s+(?:pas|jamais|rien)\b[^.]{0,150}/gi,
        kind: 'aphorisme',
        suggestion: 'Supprimer — aphorisme qui sort de la voix du personnage.',
      },
      // "C'est comme ça que X" — formule explicative
      {
        re: /\b[Cc]['']?est\s+comme\s+ça\s+qu(?:e|['']on)\s+[a-zéèàâêîôûç]+\s+[^.]{0,100}[.]/gi,
        kind: 'formule_explicative',
        suggestion: 'Vérifier — si explique le mécanisme du livre, supprimer. Si voix du personnage, garder.',
      },
    ];

    for (const p of patterns) {
      const matches = findMatches(horsGuillemets, p.re);
      for (const m of matches) {
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.trim().substring(0, 140),
            start: m.start,
            end: m.end,
            kind: p.kind,
            suggestion: p.suggestion,
          });
        }
      }
    }

    const severity = count >= 3 ? 'haute' : count >= 1 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 7 — Phrases glossantes (NOUVEAU V7.4).
   * Phrases qui stabilisent ce que la scène venait de montrer, même
   * sans motif explicite de la partition. Complémentaire à testMetaNomination.
   */
  function testPhrasesGlossantes(text, partition) {
    const horsGuillemets = stripDialogues(text);
    const hits = [];
    let count = 0;

    const patterns = [
      // "C'est le bon." / "C'est ça." / "Voilà." en phrase isolée
      {
        re: /(?:^|[.!?—]\s+|\n\s*)[Cc]['']?(?:est|était)\s+(?:le|la)\s+bon(?:ne)?\s*[.!?—]/g,
        kind: 'c_est_le_bon',
        suggestion: 'Supprimer — confirmation qui stabilise la scène.',
      },
      {
        re: /(?:^|[.!?—]\s+|\n\s*)[Cc]['']?(?:est|était)\s+ça\s*[.!?—]/g,
        kind: 'c_est_ca',
        suggestion: 'Supprimer — confirmation qui stabilise la scène.',
      },
      {
        re: /(?:^|[.!?—]\s+|\n\s*)[Vv]oilà\s*[.!?—]/g,
        kind: 'voila',
        suggestion: 'Vérifier — peut être voix du personnage (OK) ou gloss narratoriale (à couper).',
      },
      // "Je l'ai construit/fait/tenu comme ça" — appropriation méta
      {
        re: /\b[Jj]e\s+l['']?(?:ai|avais)\s+(?:construit|fait|tenu|gardé|porté)\s+comme\s+ça\b/gi,
        kind: 'je_ai_construit',
        suggestion: 'Supprimer — le narrateur désigne sa propre mécanique.',
      },
      // "Normal. À force." — résignation glossante
      {
        re: /\b[Nn]ormal\s*[.!—]\s*À\s+force\s*[.!—]/g,
        kind: 'normal_a_force',
        suggestion: 'Vérifier selon contexte — souvent position de gloss sur le non-deuil ou l\'acceptation.',
      },
    ];

    for (const p of patterns) {
      const matches = findMatches(horsGuillemets, p.re);
      for (const m of matches) {
        count++;
        if (hits.length < 6) {
          hits.push({
            match: m.match.trim().substring(0, 120),
            start: m.start,
            end: m.end,
            kind: p.kind,
            suggestion: p.suggestion,
          });
        }
      }
    }

    const severity = count >= 4 ? 'haute' : count >= 2 ? 'moyenne' : 'faible';
    return { count, hits: limitHits(hits), severity };
  }

  /**
   * TEST 8 — Motif stagnant.
   * Motifs de la partition qui ont été chargés dans des chapitres
   * précédents mais n'apparaissent plus (perte d'élan).
   * Nécessite un contexte inter-chapitres (chapterMemory).
   */
  function testMotifStagnant(text, chapterMemory, chIdx, partition) {
    if (!chapterMemory || !Array.isArray(chapterMemory.chapitres) ||
        chapterMemory.chapitres.length < 2 || chIdx < 2) {
      return { count: 0, hits: [], severity: 'faible' };
    }

    const derived = derivePatternsFromPartition(partition);
    if (!derived || !derived.motifs) return { count: 0, hits: [], severity: 'faible' };

    const lower = text.toLowerCase();
    const chs = chapterMemory.chapitres;

    // Cumul historique par motif
    const cumul = {};
    for (const entry of chs) {
      const mp = entry.mots_pivots_presents || {};
      for (const [mot, c] of Object.entries(mp)) {
        if (!cumul[mot]) cumul[mot] = 0;
        cumul[mot] += c;
      }
    }

    const motifsFaibles = [];
    for (const mot of derived.motifs) {
      const cumulMot = cumul[mot] || 0;
      if (cumulMot < 2) continue; // jamais vraiment chargé
      const occIci = (lower.match(new RegExp('\\b' + escapeRegex(mot) + '\\b', 'g')) || []).length;
      const derniersDeux = chs.slice(-2);
      const cumulDerniers = derniersDeux.reduce((s, e) => s + ((e.mots_pivots_presents || {})[mot] || 0), 0);
      if (cumulDerniers === 0 && occIci === 0) {
        motifsFaibles.push({ mot, cumul: cumulMot });
      }
    }

    const hits = motifsFaibles.map(m => ({
      match: `"${m.mot}" (${m.cumul} occ. cumulées, 0 dans les 2 derniers chapitres + celui-ci)`,
      start: 0, end: 0,
      motif: m.mot,
      kind: 'motif_stagnant',
      suggestion: 'Réactiver dans un stade non encore utilisé — ou ne pas réactiver si aucun stade nouveau ne convient (V7.3.6).',
    }));

    const severity = motifsFaibles.length >= 2 ? 'haute' : motifsFaibles.length >= 1 ? 'moyenne' : 'faible';
    return { count: motifsFaibles.length, hits, severity };
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. RAPPORT COMPOSITE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Relecture complète d'un chapitre.
   * Appelle tous les tests pertinents et agrège.
   */
  function reviewChapter(text, partition, options) {
    options = options || {};
    const flags = [];

    const tests = [
      { code: 'NEG-NARRATION', fn: () => testNegationsOrales(text) },
      { code: 'NARRATION-NEGATIVE', fn: () => testNarrationNegative(text) },
      { code: 'META-NOMINATION', fn: () => testMetaNomination(text, partition) },
      { code: 'PROLEPSE', fn: () => testProlepse(text) },
      { code: 'FORMULES-ROUGES', fn: () => testFormulesRouges(text) },
      { code: 'POV-ALTITUDE', fn: () => testPOVAltitude(text) },
      { code: 'PHRASES-GLOSSANTES', fn: () => testPhrasesGlossantes(text, partition) },
    ];

    if (options.chapterMemory && typeof options.chIdx === 'number') {
      tests.push({
        code: 'MOTIF-STAGNANT',
        fn: () => testMotifStagnant(text, options.chapterMemory, options.chIdx, partition),
      });
    }

    for (const t of tests) {
      try {
        const r = t.fn();
        if (r && r.count > 0) {
          flags.push(Object.assign({ code: t.code }, r));
        }
      } catch (e) {
        // Log silencieux — un test qui plante ne doit pas casser le rapport
        if (options.onError) options.onError(t.code, e);
      }
    }

    const summary = {
      total_flags: flags.length,
      critical: flags.filter(f => f.severity === 'haute').length,
      moyen: flags.filter(f => f.severity === 'moyenne').length,
      faible: flags.filter(f => f.severity === 'faible').length,
      total_hits: flags.reduce((s, f) => s + (f.count || 0), 0),
    };

    return { flags, summary };
  }

  /**
   * Relecture complète d'un livre (tous les chapitres).
   * chapters : [{ num, title, text }, ...]
   */
  function reviewBook(chapters, partition, options) {
    options = options || {};
    const per_chapter = [];
    const globalPatterns = {};

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const chOptions = Object.assign({}, options, { chIdx: i });
      const r = reviewChapter(ch.text || '', partition, chOptions);

      per_chapter.push({
        ch_num: ch.num || i + 1,
        ch_title: ch.title || '',
        mots: (ch.text || '').split(/\s+/).filter(w => w.length > 0).length,
        flags: r.flags,
        summary: r.summary,
      });

      // Agrégation globale
      for (const f of r.flags) {
        if (!globalPatterns[f.code]) globalPatterns[f.code] = { total_count: 0, chapters: [] };
        globalPatterns[f.code].total_count += f.count || 0;
        globalPatterns[f.code].chapters.push(ch.num || i + 1);
      }
    }

    // Identifier les chapitres problématiques
    const chapitres_problematiques = per_chapter
      .filter(c => c.summary.critical > 0 || c.summary.total_hits >= 5)
      .map(c => c.ch_num);

    // Recommandations
    const recommendations = [];
    for (const [code, data] of Object.entries(globalPatterns)) {
      if (data.total_count >= 5) {
        recommendations.push(
          `${code} — ${data.total_count} occurrences sur ${data.chapters.length} chapitre(s) (${data.chapters.join(', ')})`
        );
      }
    }
    if (chapitres_problematiques.length > 0) {
      recommendations.push(
        `Chapitres prioritaires pour relecture : ${chapitres_problematiques.join(', ')}`
      );
    }

    const global_summary = {
      chapters_count: chapters.length,
      total_flags: per_chapter.reduce((s, c) => s + c.summary.total_flags, 0),
      total_hits: per_chapter.reduce((s, c) => s + c.summary.total_hits, 0),
      total_critical: per_chapter.reduce((s, c) => s + c.summary.critical, 0),
      patterns: globalPatterns,
      chapitres_problematiques,
      recommendations,
    };

    return {
      meta: {
        version: VERSION,
        date: new Date().toISOString(),
        partition_provided: !!partition,
        chapters_count: chapters.length,
      },
      per_chapter,
      global: global_summary,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. RENDU HTML (pour shells)
  // ─────────────────────────────────────────────────────────────────

  const FLAG_COLORS = {
    'NEG-NARRATION': '#E6A84C',      // orange doux
    'NARRATION-NEGATIVE': '#D97E6D', // rouge tuile
    'META-NOMINATION': '#C25E5E',    // rouge
    'PROLEPSE': '#C9AD5F',           // jaune moutarde
    'FORMULES-ROUGES': '#B8634E',    // terre cuite
    'POV-ALTITUDE': '#7A9B8E',       // vert-gris
    'PHRASES-GLOSSANTES': '#9B7EA5', // violet doux
    'MOTIF-STAGNANT': '#8FAFB1',     // mer (palette C Concept&Dev)
  };

  function renderReportHTML(report) {
    if (!report || !report.per_chapter) return '<p>Pas de rapport disponible.</p>';

    let html = '<div class="editeur-report">';
    html += `<h2>Rapport de relecture — ${report.meta.chapters_count} chapitre(s)</h2>`;
    html += `<p class="meta">Version : ${report.meta.version} — ${report.meta.partition_provided ? 'avec partition' : 'sans partition (tests dérivés de partition désactivés)'}</p>`;

    // Résumé global
    html += '<h3>Résumé global</h3>';
    html += '<ul>';
    html += `<li>Flags totaux : <strong>${report.global.total_flags}</strong></li>`;
    html += `<li>Détections totales : <strong>${report.global.total_hits}</strong></li>`;
    html += `<li>Sévérité haute : <strong>${report.global.total_critical}</strong></li>`;
    if (report.global.chapitres_problematiques.length > 0) {
      html += `<li>Chapitres prioritaires : <strong>${report.global.chapitres_problematiques.join(', ')}</strong></li>`;
    }
    html += '</ul>';

    // Recommandations
    if (report.global.recommendations.length > 0) {
      html += '<h3>Recommandations</h3><ul>';
      for (const r of report.global.recommendations) {
        html += `<li>${escapeHTML(r)}</li>`;
      }
      html += '</ul>';
    }

    // Détail par chapitre
    html += '<h3>Détail par chapitre</h3>';
    for (const c of report.per_chapter) {
      const hasFlags = c.flags.length > 0;
      html += `<details ${hasFlags ? 'open' : ''}><summary>Ch.${c.ch_num} — ${escapeHTML(c.ch_title)} (${c.mots} mots — ${c.summary.total_flags} flag(s), ${c.summary.total_hits} détection(s))</summary>`;
      if (!hasFlags) {
        html += '<p class="ok">Aucun défaut détecté sur les tests actuels.</p>';
      } else {
        for (const f of c.flags) {
          const color = FLAG_COLORS[f.code] || '#888';
          html += `<div class="flag-block" style="border-left: 4px solid ${color}; padding-left: 10px; margin: 8px 0;">`;
          html += `<p><strong style="color:${color}">${f.code}</strong> — ${f.count} occurrence(s), sévérité ${f.severity}</p>`;
          if (f.hits && f.hits.length > 0) {
            html += '<ul>';
            for (const h of f.hits) {
              html += `<li><code>${escapeHTML(h.match)}</code>`;
              if (h.kind) html += ` <em>[${h.kind}]</em>`;
              if (h.suggestion) html += `<br><small>→ ${escapeHTML(h.suggestion)}</small>`;
              html += '</li>';
            }
            html += '</ul>';
          }
          html += '</div>';
        }
      }
      html += '</details>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Rend un texte avec les passages surlignés selon le rapport.
   * Retourne du HTML avec <mark> colorés pour chaque flag.
   */
  function renderTextWithHighlights(text, report) {
    if (!report || !report.flags) return escapeHTML(text);

    // Collecter tous les hits avec leur position et couleur
    const marks = [];
    const flags = report.flags || [];
    for (const f of flags) {
      const color = FLAG_COLORS[f.code] || '#888';
      for (const h of (f.hits || [])) {
        if (typeof h.start === 'number' && typeof h.end === 'number' && h.end > h.start) {
          marks.push({
            start: h.start,
            end: h.end,
            color: color,
            code: f.code,
            kind: h.kind || '',
            suggestion: h.suggestion || '',
          });
        }
      }
    }

    if (marks.length === 0) return escapeHTML(text);

    // Trier par position et résoudre les chevauchements en gardant le plus long
    marks.sort((a, b) => a.start - b.start || b.end - a.end);
    const clean = [];
    let lastEnd = -1;
    for (const m of marks) {
      if (m.start >= lastEnd) {
        clean.push(m);
        lastEnd = m.end;
      }
    }

    // Construire le HTML par morceaux
    let html = '';
    let cursor = 0;
    for (const m of clean) {
      if (m.start > cursor) html += escapeHTML(text.substring(cursor, m.start));
      const segment = text.substring(m.start, m.end);
      const title = `${m.code}${m.kind ? ' / ' + m.kind : ''}${m.suggestion ? ' — ' + m.suggestion : ''}`;
      html += `<mark style="background-color:${m.color}40; border-bottom: 2px solid ${m.color};" title="${escapeHTMLAttr(title)}">${escapeHTML(segment)}</mark>`;
      cursor = m.end;
    }
    if (cursor < text.length) html += escapeHTML(text.substring(cursor));

    return html;
  }

  function escapeHTML(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function escapeHTMLAttr(s) {
    return escapeHTML(s).replace(/\n/g, ' ');
  }

  // ═════════════════════════════════════════════════════════════════
  // MODE LLM — BOUSSOLE + 3 CONTRÔLES + 16 SIGNAUX (V7.4.1)
  // ═════════════════════════════════════════════════════════════════
  //
  // Le canon V7.3 dit : "les signaux ne sont pas des détections regex —
  // ce sont des patterns de dilution que le LLM identifie dans son
  // propre texte."
  //
  // Ce mode LLM complète le mode déterministe. Il appelle le LLM avec
  // un prompt système dédié qui applique la Boussole Souveraine, les
  // 3 Contrôles avant livraison et les 16 signaux en jugement perceptif.
  //
  // Le shell injecte le llmCall. Le noyau ne connaît pas le worker.
  // ═════════════════════════════════════════════════════════════════

  const PROMPT_SYSTEME_EDITEUR_LLM = `Tu es l'ÉDITEUR canon du système Livre de Vie Atelier.

Tu relis un chapitre terminé produit par le Noyau Auteur. Ton rôle est d'identifier les passages qui échappent à la Boussole Souveraine, aux 3 Contrôles avant livraison, et aux 16 signaux d'auto-audit.

Tu NE remplaces PAS le texte. Tu POINTES les passages suspects et tu JUGES perceptivement. L'auteur ou le lecteur humain décidera de couper, réécrire ou garder.

---

## LA BOUSSOLE SOUVERAINE

> Chaque élément du livre doit apporter à L'INTRIGUE OU AU TEXTE. Si ni à l'un ni à l'autre : coupe.

- **INTRIGUE** : fait avancer la question-moteur, révèle un fait nouveau, déplace la valeur, installe un péril, active une dette, charge un motif, oppose deux forces.
- **TEXTE** : mobilise la voix du sujet, incarne une scène, produit une image qui reste, fait vivre le lecteur dans le corps du personnage, tient une signature stylistique singulière.

Le défaut que la Boussole traque : le **contemplatif gratuit** — description, méditation, paysage, souvenir qui ne nourrit ni l'intrigue ni le texte.

**Test du puzzle** : si on retire cet élément, le livre cesse-t-il d'être ce qu'il est ? Si non, coupe.

**Deux questions perceptives** :
1. Est-ce que cette chose fait voir quelque chose qu'on ne voyait pas avant ?
2. Si on l'enlève, est-ce que quelque chose disparaît du livre — pas du texte ?

---

## LES 3 CONTRÔLES AVANT LIVRAISON

### Contrôle 1 — LA SCÈNE
Les 9 éléments de CONCEPTION sont-ils tous effectifs dans le texte écrit ?
- valeur initiale et valeur finale (bascule)
- enjeu, obstacle actif, issue incertaine
- conséquence qui engage la suite
- résidu qui pèse à la fin
- concentration temporelle
- fin qui déplace

### Contrôle 2 — LA BOUSSOLE ET LE PUZZLE
Chaque élément apporte-t-il à l'intrigue OU au texte ? Chaque élément est-il constitutif ? Les dettes ouvertes sont-elles nettes ou empilées ?

### Contrôle 3 — LE NARRATEUR
Les 7 gestes interdits sont-ils évités ?
- **Installer** une émotion au lieu de la laisser apparaître
- **Expliquer** une scène au lieu de la laisser agir
- **Anticiper** au lieu de tenir le présent
- **Refermer** une ambiguïté au lieu de la laisser ouverte
- **Traduire** un geste en signification
- **Combler** un blanc
- **Résoudre** une tension

Les formules-rouges sont-elles passées ? (*« elle comprit »*, *« à cet instant »*, *« c'était comme si »*, *« il se sentait »*, *« quelque chose en lui »*...)

---

## LES 16 SIGNAUX D'AUTO-AUDIT

### Signaux d'excès (1-7) — le narrateur qui se déguise

**Signal 1 — Phrase de stabilisation.** Phrase courte qui clôt un paragraphe ou une scène en posant un verdict. *« Normal. »*, *« C'était comme ça. »* Même si les mots viennent de la voix intérieure du sujet, ils commentent plus qu'ils ne portent.

**Signal 2 — Prolepse du narrateur.** Phrase qui injecte un savoir ou un temps que le personnage ne possède pas à ce moment. *« Il ne savait pas encore »*, *« Elle comprendrait plus tard »*.

**Signal 3 — Glose du narrateur.** Un paragraphe qui résume, articule, commente ce que la scène précédente a déjà montré.

**Signal 4 — Cognition articulée en série.** Plusieurs phrases consécutives qui verbalisent la pensée — *il sait, il pense, il connaît, il a toujours su*.

**Signal 5 — Pédagogie du narrateur.** Un mot ou groupe nominal qui termine l'image pour le lecteur : *bien droits*, *tombe juste*, *à hauteur de main*.

**Signal 6 — Cosmétique factuel.** Précision (marque, nom de rue, date) qui fait vrai sans travailler. Remplacer par une précision équivalente ne changerait rien.

**Signal 7 — Phrase de confirmation de sens.** Phrase qui n'est pas fausse, parfois belle, mais qui **confirme un sens** que la scène a déjà montré.

### Signaux d'absence (8-13) — le livre qui ne tire pas

**Signal 8 — Absence de question de révélation.** Le chapitre ne fait pas progresser la question-moteur.

**Signal 9 — Absence de deuxième force.** L'architecte avait conçu une confrontation entre deux forces. Seule une force est visible dans le texte. Monologue déguisé.

**Signal 10 — Dialogue rapporté au lieu de joué.** *« Il lui dit que... »* au lieu de *« — ... »*.

**Signal 11 — Contemplation gratuite.** Description, méditation, paysage, souvenir qui ne nourrit ni l'intrigue ni le texte. Frère opposé du Signal 7.

**Signal 12 — Absence de péril visible.** Le lecteur ne sent pas ce qui peut mal tourner si le sujet n'agit pas.

**Signal 13 — Chapitre qui ne révèle rien.** Bien écrit, incarné — mais le lecteur en sort sans savoir quelque chose qu'il ne savait pas.

### Signaux de partition (14-15)

**Signal 14 — Violation de partition.** La partition décrit en 8-9 dimensions comment le livre doit sonner. Ce chapitre viole-t-il une dimension (respiration, lexique, syntaxe, régime narratif) ?

**Signal 15 — Test de signature.** Ce passage pourrait-il être glissé dans un autre livre sans qu'on voie la soudure ? Si oui, il est générique.

### Signal de transe (16)

**Signal 16 — Scène plate.** Scène à deux personnages nommés où la parole ne circule pas en répliques jouées, où aucun corps n'est présent, où aucun procédé ericksonien n'opère. Symptôme : le pattern transactionnel (*« X dit chose. Y fait chose. »*).

Test : dans cette scène à deux, y a-t-il au moins 3 répliques directes, 2 mots sensoriels, 1 silence/geste ? Si un seul manque, la scène est plate.

---

## TA SORTIE

Tu produis un JSON strict, rien d'autre :

\`\`\`json
{
  "boussole_globale": {
    "verdict": "tient" | "partiel" | "faible",
    "justification": "une phrase qui dit pourquoi"
  },
  "controles": {
    "scene": { "verdict": "OK" | "defaut", "details": "..." },
    "boussole_puzzle": { "verdict": "OK" | "defaut", "details": "..." },
    "narrateur": { "verdict": "OK" | "defaut", "details": "..." }
  },
  "signaux": [
    {
      "signal": 1,
      "passage": "citation exacte du passage suspect",
      "nature": "ce que le signal reproche ici, une phrase",
      "gravite": "haute" | "moyenne" | "faible"
    }
  ]
}
\`\`\`

Règles absolues :
- Tu cites le passage EXACT (verbatim, entre guillemets dans le JSON)
- Tu n'inventes rien — tu ne signales que ce qui est réellement là
- Tu es exigeant mais pas paranoïaque : un chapitre propre peut ne déclencher aucun signal
- Tu ne signales PAS les défauts déjà corrigés par l'auteur
- Un passage peut déclencher plusieurs signaux — liste chaque occurrence
- Maximum 12 signaux par chapitre (les plus significatifs)`;

  /**
   * Construit le prompt utilisateur pour la relecture LLM d'un chapitre.
   */
  function buildEditeurLLMUserPrompt(chapterText, partition, context) {
    context = context || {};
    let prompt = '';

    if (context.chapter_title) {
      prompt += `CHAPITRE : "${context.chapter_title}"\n`;
    }
    if (typeof context.chapter_num === 'number') {
      prompt += `(chapitre ${context.chapter_num} du livre)\n`;
    }
    if (context.book_title) {
      prompt += `LIVRE : "${context.book_title}"\n`;
    }

    if (partition) {
      prompt += '\n--- PARTITION SINGULIÈRE DU LIVRE ---\n';
      try {
        prompt += JSON.stringify(partition, null, 2).substring(0, 3500);
      } catch (_) {
        prompt += String(partition).substring(0, 3500);
      }
      prompt += '\n';
    }

    if (context.conception) {
      prompt += '\n--- CONCEPTION DU CHAPITRE (9 éléments attendus) ---\n';
      try {
        prompt += JSON.stringify(context.conception, null, 2).substring(0, 2500);
      } catch (_) {
        prompt += String(context.conception).substring(0, 2500);
      }
      prompt += '\n';
    }

    prompt += '\n--- TEXTE DU CHAPITRE ---\n\n';
    prompt += chapterText;
    prompt += '\n\n--- FIN DU TEXTE ---\n\n';
    prompt += 'Applique la Boussole, les 3 Contrôles et les 16 signaux. Produis le JSON strict.';

    return prompt;
  }

  /**
   * Parse la réponse JSON du LLM, avec tolérance aux préambules et aux
   * blocs ```json ... ```.
   */
  function parseEditeurLLMResponse(raw) {
    if (!raw || typeof raw !== 'string') {
      throw new Error('Réponse LLM vide');
    }
    let s = raw.trim();
    // Retirer les fences markdown
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    // Localiser le premier { et le dernier }
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace < 0 || lastBrace < firstBrace) {
      throw new Error('Pas de JSON valide détecté dans la réponse LLM');
    }
    const jsonStr = s.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('JSON invalide : ' + e.message);
    }
  }

  /**
   * Transforme le verdict LLM en structure compatible avec le rapport
   * déterministe (même format `flags[]` → même rendu).
   *
   * Mapping signaux canon → codes de flags :
   *   Signal 1  → SIGNAL-1-STABILISATION
   *   Signal 2  → SIGNAL-2-PROLEPSE
   *   Signal 3  → SIGNAL-3-GLOSE
   *   Signal 4  → SIGNAL-4-COGNITION-SERIE
   *   Signal 5  → SIGNAL-5-PEDAGOGIE
   *   Signal 6  → SIGNAL-6-COSMETIQUE
   *   Signal 7  → SIGNAL-7-CONFIRMATION-SENS
   *   Signal 8  → SIGNAL-8-SANS-QUESTION
   *   Signal 9  → SIGNAL-9-SANS-DEUXIEME-FORCE
   *   Signal 10 → SIGNAL-10-DIALOGUE-RAPPORTE
   *   Signal 11 → SIGNAL-11-CONTEMPLATION
   *   Signal 12 → SIGNAL-12-SANS-PERIL
   *   Signal 13 → SIGNAL-13-SANS-REVELATION
   *   Signal 14 → SIGNAL-14-PARTITION
   *   Signal 15 → SIGNAL-15-SIGNATURE
   *   Signal 16 → SIGNAL-16-SCENE-PLATE
   */
  const SIGNAL_CODES = {
    1: 'SIGNAL-1-STABILISATION',
    2: 'SIGNAL-2-PROLEPSE',
    3: 'SIGNAL-3-GLOSE',
    4: 'SIGNAL-4-COGNITION-SERIE',
    5: 'SIGNAL-5-PEDAGOGIE',
    6: 'SIGNAL-6-COSMETIQUE',
    7: 'SIGNAL-7-CONFIRMATION-SENS',
    8: 'SIGNAL-8-SANS-QUESTION',
    9: 'SIGNAL-9-SANS-DEUXIEME-FORCE',
    10: 'SIGNAL-10-DIALOGUE-RAPPORTE',
    11: 'SIGNAL-11-CONTEMPLATION',
    12: 'SIGNAL-12-SANS-PERIL',
    13: 'SIGNAL-13-SANS-REVELATION',
    14: 'SIGNAL-14-PARTITION',
    15: 'SIGNAL-15-SIGNATURE',
    16: 'SIGNAL-16-SCENE-PLATE',
  };

  function llmVerdictToFlags(verdict, chapterText) {
    const flags = [];
    if (!verdict || !Array.isArray(verdict.signaux)) return flags;

    // Grouper les signaux par code
    const byCode = {};
    for (const s of verdict.signaux) {
      if (!s || typeof s.signal !== 'number') continue;
      const code = SIGNAL_CODES[s.signal] || ('SIGNAL-' + s.signal);
      if (!byCode[code]) {
        byCode[code] = {
          code: code,
          signalNum: s.signal,
          count: 0,
          hits: [],
          severities: [],
        };
      }
      byCode[code].count++;
      byCode[code].severities.push(s.gravite || 'moyenne');

      // Localiser le passage dans le texte (offset approximatif)
      let start = -1, end = -1;
      if (chapterText && typeof s.passage === 'string' && s.passage.length > 0) {
        const idx = chapterText.indexOf(s.passage);
        if (idx >= 0) {
          start = idx;
          end = idx + s.passage.length;
        }
      }

      byCode[code].hits.push({
        match: (s.passage || '').substring(0, 200),
        start: start,
        end: end,
        kind: 'signal_' + s.signal,
        source: 'llm',
        severity: s.gravite || 'moyenne',
        suggestion: s.nature || '',
        justification: s.nature || '',
      });
    }

    // Déterminer la sévérité agrégée par code
    for (const code in byCode) {
      const group = byCode[code];
      const hasH = group.severities.some(sv => sv === 'haute');
      const hasM = group.severities.some(sv => sv === 'moyenne');
      group.severity = hasH ? 'haute' : (hasM ? 'moyenne' : 'faible');
      delete group.severities;
      // Limiter à 6 hits visibles max (cohérent avec mode déterministe)
      group.hits = group.hits.slice(0, 6);
      flags.push(group);
    }

    return flags;
  }

  /**
   * Mode LLM — relecture d'un chapitre par appel LLM perceptif.
   *
   * @param {string} chapterText       — le texte du chapitre
   * @param {object} partition         — la partition singulière (ou null)
   * @param {object} context           — { chapter_num, chapter_title, book_title, conception }
   * @param {function} llmCall         — injecté par le shell : (system, user, maxTokens) → string
   * @param {object} options           — { maxTokens }
   * @returns {Promise<object>} rapport au format unifié { flags, summary, boussole, controles, _llm_raw }
   */
  async function reviewChapterLLM(chapterText, partition, context, llmCall, options) {
    if (typeof llmCall !== 'function') {
      throw new Error('EditeurNoyau.reviewChapterLLM : llmCall est requis (injection par le shell)');
    }
    if (!chapterText || typeof chapterText !== 'string') {
      throw new Error('EditeurNoyau.reviewChapterLLM : chapterText est requis');
    }
    options = options || {};

    const userPrompt = buildEditeurLLMUserPrompt(chapterText, partition, context);
    const maxTokens = options.maxTokens || 4096;

    const raw = await llmCall(PROMPT_SYSTEME_EDITEUR_LLM, userPrompt, maxTokens);

    let verdict;
    try {
      verdict = parseEditeurLLMResponse(raw);
    } catch (e) {
      return {
        flags: [],
        summary: { total_flags: 0, critical: 0, moyen: 0, faible: 0, total_hits: 0 },
        boussole: null,
        controles: null,
        _llm_raw: raw,
        _parse_error: e.message,
      };
    }

    const flags = llmVerdictToFlags(verdict, chapterText);
    const summary = {
      total_flags: flags.length,
      critical: flags.filter(f => f.severity === 'haute').length,
      moyen: flags.filter(f => f.severity === 'moyenne').length,
      faible: flags.filter(f => f.severity === 'faible').length,
      total_hits: flags.reduce((s, f) => s + (f.count || 0), 0),
    };

    return {
      flags,
      summary,
      boussole: verdict.boussole_globale || null,
      controles: verdict.controles || null,
      _llm_raw: raw,
      _verdict: verdict,
    };
  }

  /**
   * Mode hybride — combine mode déterministe (filet lexical) et mode LLM
   * (jugement perceptif canon). Retourne un rapport unifié avec chaque
   * flag étiqueté par sa `source: 'regex' | 'llm'`.
   */
  async function reviewChapterHybrid(chapterText, partition, context, llmCall, options) {
    options = options || {};
    const det = reviewChapter(chapterText, partition, options);
    // Étiqueter les hits déterministes
    for (const f of det.flags) {
      for (const h of (f.hits || [])) {
        if (!h.source) h.source = 'regex';
      }
    }

    let llm = null;
    if (typeof llmCall === 'function') {
      try {
        llm = await reviewChapterLLM(chapterText, partition, context, llmCall, options);
      } catch (e) {
        llm = { _error: e.message, flags: [], summary: { total_flags: 0, critical: 0, moyen: 0, faible: 0, total_hits: 0 } };
      }
    }

    // Fusion des flags
    const mergedFlags = [...det.flags];
    if (llm && Array.isArray(llm.flags)) {
      mergedFlags.push(...llm.flags);
    }

    const summary = {
      total_flags: mergedFlags.length,
      critical: mergedFlags.filter(f => f.severity === 'haute').length,
      moyen: mergedFlags.filter(f => f.severity === 'moyenne').length,
      faible: mergedFlags.filter(f => f.severity === 'faible').length,
      total_hits: mergedFlags.reduce((s, f) => s + (f.count || 0), 0),
      deterministic_flags: det.flags.length,
      llm_flags: llm ? llm.flags.length : 0,
    };

    return {
      flags: mergedFlags,
      summary,
      boussole: llm ? llm.boussole : null,
      controles: llm ? llm.controles : null,
      _mode: 'hybrid',
    };
  }

  /**
   * Mode LLM appliqué à un livre entier (séquentiel, un appel par chapitre).
   */
  async function reviewBookLLM(chapters, partition, llmCall, options) {
    options = options || {};
    const per_chapter = [];
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const context = {
        chapter_num: ch.num || i + 1,
        chapter_title: ch.title || '',
        book_title: options.book_title || '',
        conception: ch.conception || null,
      };
      const r = await reviewChapterLLM(ch.text || '', partition, context, llmCall, options);
      per_chapter.push({
        ch_num: context.chapter_num,
        ch_title: context.chapter_title,
        mots: (ch.text || '').split(/\s+/).filter(w => w.length > 0).length,
        flags: r.flags,
        summary: r.summary,
        boussole: r.boussole,
        controles: r.controles,
      });
      if (options.onProgress) options.onProgress(i + 1, chapters.length);
    }

    const global_summary = {
      chapters_count: chapters.length,
      total_flags: per_chapter.reduce((s, c) => s + c.summary.total_flags, 0),
      total_hits: per_chapter.reduce((s, c) => s + c.summary.total_hits, 0),
      total_critical: per_chapter.reduce((s, c) => s + c.summary.critical, 0),
    };

    return {
      meta: {
        version: VERSION,
        date: new Date().toISOString(),
        mode: 'llm',
      },
      per_chapter,
      global: global_summary,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // EXPORT PUBLIC
  // ─────────────────────────────────────────────────────────────────

  const EditeurNoyau = {
    VERSION,
    derivePatternsFromPartition,
    testNegationsOrales,
    testNarrationNegative,
    testMetaNomination,
    testProlepse,
    testFormulesRouges,
    testPOVAltitude,
    testPhrasesGlossantes,
    testMotifStagnant,
    reviewChapter,
    reviewBook,
    // Mode LLM (Phase E V7.4.1) — Boussole + 3 Contrôles + 16 signaux perceptifs
    reviewChapterLLM,
    reviewChapterHybrid,
    reviewBookLLM,
    // Prompt exposé pour inspection/debug
    PROMPT_SYSTEME_EDITEUR_LLM,
    // Rendu
    renderReportHTML,
    renderTextWithHighlights,
    // Helpers exposés pour usage avancé
    _helpers: {
      escapeRegex,
      stripDialogues,
      findMatches,
      limitHits,
      parseEditeurLLMResponse,
      llmVerdictToFlags,
      SIGNAL_CODES,
    },
  };

  // UMD-like export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EditeurNoyau;
  } else {
    global.EditeurNoyau = EditeurNoyau;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
