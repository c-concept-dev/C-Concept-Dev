/* JMMJS_FREE_TEXT_INTERPRETATION_CORE_START */
(() => {
  "use strict";

  // D102A — socle de données pour l'interprétation contrôlée du champ texte
  // libre "Où et quand survient la gêne ?" (#painDetail). Ce module ne
  // contient aucune analyse de texte (D102B), aucune UX de confirmation
  // (D102C) et n'est raccordé nulle part au modèle de requête existant
  // (D102D). Il fixe uniquement les contrats, pour que les lots suivants
  // s'appuient sur une forme de données stable plutôt que d'improviser.

  const STATUSES = Object.freeze([
    "idle",
    "pending",
    "candidate",
    "confirmed",
    "rejected",
    "ambiguous",
    "conflict",
    "error",
  ]);

  // Champs structurés existants que D102 est autorisé à confronter au texte
  // libre (plan D102 v1.1, §4). Liste fermée et explicite : un champ n'entre
  // dans la confrontation qu'en étant ajouté ici — jamais implicitement.
  // "painIntensity" correspond au curseur #pain (0–10, effet métier réel).
  // Les autres entrées sont des ancrages pour D102D/D102E ; aucune logique
  // de confrontation réelle n'existe encore en D102A.
  const COHERENCE_FIELDS = Object.freeze([
    "painIntensity",
    "limits",
    "terrain",
    "pauseNeeds",
    "standing",
  ]);

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function emptyCandidateInterpretation() {
    return {
      bodyAreas: [],
      side: null,
      triggers: [],
      temporal: {},
      needs: [],
      negations: [],
      uncertain: [],
      confidence: {},
      coherenceIssues: [],
    };
  }

  function normalizeCandidateInterpretation(value = {}) {
    const arr = (x) => (Array.isArray(x) ? x.slice() : []);
    const obj = (x) =>
      x && typeof x === "object" && !Array.isArray(x) ? { ...x } : {};
    return {
      bodyAreas: arr(value.bodyAreas),
      side: typeof value.side === "string" ? value.side : null,
      triggers: arr(value.triggers),
      temporal: obj(value.temporal),
      needs: arr(value.needs),
      negations: arr(value.negations),
      uncertain: arr(value.uncertain),
      confidence: obj(value.confidence),
      coherenceIssues: arr(value.coherenceIssues),
    };
  }

  function createInterpretationState(rawText = "") {
    const text = typeof rawText === "string" ? rawText : "";
    return {
      rawText: text,
      status: text.trim() ? "pending" : "idle",
      candidateInterpretation: emptyCandidateInterpretation(),
      confirmedInterpretation: null,
      coherenceIssues: [],
    };
  }

  // ---------------------------------------------------------------------
  // D102B — Normalisation locale du texte (Couche 1, déterministe).
  //
  // Règle du plan D102 v1.1 §3.1 : reconnu avec certitude → candidat ;
  // doute → `uncertain` ; non reconnu → ignoré. Aucune de ces fonctions
  // n'invente une donnée : si un motif n'est pas trouvé, rien n'est ajouté
  // plutôt qu'une valeur par défaut.
  // ---------------------------------------------------------------------

  // Découpe en clauses sur la ponctuation forte et les conjonctions de
  // contraste ("mais", "par contre"...), pour que la négation d'une
  // clause ne s'applique jamais à la suivante — cas réel du plan :
  // "Sur le plat aucun souci, par contre quand ça descend..." ne doit pas
  // faire hériter "descend" de la négation de "aucun souci".
  const CLAUSE_BOUNDARY_RE =
    /[.;!?]+|,?\s*\b(?:mais|par contre|cependant|toutefois|en revanche)\b/gi;

  function splitClauses(text) {
    return text
      .split(CLAUSE_BOUNDARY_RE)
      .map((clause) => clause.trim())
      .filter(Boolean);
  }

  function normalizeFunctionalText(text) {
    const raw = typeof text === "string" ? text : "";
    const clean = raw.replace(/\s+/g, " ").trim();
    return { raw, clean, clauses: splitClauses(clean) };
  }

  const NEGATION_RE = /\b(pas|aucun|aucune|jamais|sans|ni)\b/i;

  function clauseIsNegated(clause) {
    return NEGATION_RE.test(clause);
  }

  const SIDE_PATTERNS = Object.freeze([
    { side: "Bilatéral", re: /\b(des deux côtés|les deux côtés|bilatéral(e)?)\b/i },
    { side: "Gauche", re: /\bgauche\b/i },
    { side: "Droit", re: /\bdroit(e)?\b/i },
  ]);

  function extractLaterality(text) {
    const matches = SIDE_PATTERNS.filter((entry) => entry.re.test(text));
    if (!matches.length) return { side: null, uncertain: [] };
    if (matches.length > 1 && !matches.some((m) => m.side === "Bilatéral")) {
      return {
        side: null,
        uncertain: [`côté ambigu : plusieurs côtés mentionnés dans le texte`],
      };
    }
    return { side: matches[0].side, uncertain: [] };
  }

  const BODY_AREA_PATTERNS = Object.freeze([
    { area: "Genoux", re: /\bgenoux?\b/i },
    { area: "Hanches", re: /\bhanches?\b/i },
    { area: "Chevilles", re: /\bchevilles?\b/i },
    { area: "Pieds", re: /\bpieds?\b/i },
    { area: "Dos", re: /\bdos\b/i },
  ]);

  function extractBodyAreas(text) {
    const areas = [];
    for (const entry of BODY_AREA_PATTERNS) {
      if (entry.re.test(text) && !areas.includes(entry.area)) areas.push(entry.area);
    }
    return areas;
  }

  const TERRAIN_TRIGGER_PATTERNS = Object.freeze([
    { trigger: "Descente", re: /\b(descend(?:s|re|ent)?|descente)\b/i },
    { trigger: "Montée", re: /\b(mont(?:e|ée|er|es|ent))\b/i },
    {
      trigger: "Terrain irrégulier",
      re: /\b(terrain irr[ée]gulier|pav[ée]s?|caillouteux|instable)\b/i,
    },
    { trigger: "Station debout", re: /\b(station debout|rest(?:er|e) debout)\b/i },
  ]);

  // Renvoie les déclencheurs terrain positifs ET les négations détectées,
  // clause par clause — jamais les deux pour la même mention. Si une
  // clause négative contient PLUSIEURS déclencheurs distincts (ex. "j'ai
  // mal en montée et je n'ai aucun souci en descente"), la portée de la
  // négation devient ambiguë avec une simple analyse par clause : plutôt
  // que de décider arbitrairement laquelle est niée, on marque les deux
  // comme incertaines — jamais de décision silencieuse.
  function extractTerrainTriggers(text) {
    const clauses = splitClauses(text);
    const triggers = [];
    const negations = [];
    const ambiguousNegationScope = [];
    for (const clause of clauses) {
      const negated = clauseIsNegated(clause);
      const matchedInClause = TERRAIN_TRIGGER_PATTERNS.filter((entry) =>
        entry.re.test(clause),
      );
      if (!matchedInClause.length) continue;
      if (negated && matchedInClause.length > 1) {
        ambiguousNegationScope.push({
          triggers: matchedInClause.map((e) => e.trigger),
          raw: clause,
        });
        continue;
      }
      for (const entry of matchedInClause) {
        if (negated) {
          if (!negations.some((n) => n.trigger === entry.trigger))
            negations.push({ trigger: entry.trigger, raw: clause });
        } else if (!triggers.some((t) => t.trigger === entry.trigger)) {
          triggers.push({ trigger: entry.trigger, raw: clause });
        }
      }
    }
    // Une même cible ne doit jamais rester à la fois positive et négative :
    // en cas de mentions contradictoires dans des clauses différentes,
    // aucune décision silencieuse — on retire des deux listes et on
    // signale l'ambiguïté à l'appelant plutôt que de trancher.
    const conflicting = triggers
      .map((t) => t.trigger)
      .filter((trigger) => negations.some((n) => n.trigger === trigger));
    const cleanTriggers = triggers.filter((t) => !conflicting.includes(t.trigger));
    const cleanNegations = negations.filter((n) => !conflicting.includes(n.trigger));
    return {
      triggers: cleanTriggers,
      negations: cleanNegations,
      conflicting,
      ambiguousNegationScope,
    };
  }

  function extractNegations(text) {
    return extractTerrainTriggers(text).negations;
  }

  const NUMBER_WORDS = Object.freeze({
    zéro: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
    sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
    quatorze: 14, quinze: 15, seize: 16, "dix-sept": 17, "dix-huit": 18,
    "dix-neuf": 19, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
    soixante: 60,
  });

  function wordOrDigitToNumber(fragment) {
    const trimmed = fragment.trim().toLowerCase();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    if (trimmed in NUMBER_WORDS) return NUMBER_WORDS[trimmed];
    return null;
  }

  // Reconnaît uniquement les formulations de durée explicites et sûres.
  // "longtemps", "un moment", "un peu" restent volontairement hors de
  // cette fonction : elles vont dans les marqueurs d'incertitude, jamais
  // converties en nombre.
  function extractDurations(text) {
    const results = [];
    const uncertain = [];
    const minuteRe =
      /(?:au bout d[e']|après)?\s*(\d+|[a-zéûî-]+)\s*(minutes?|min\b)\s*(environ)?/gi;
    let match;
    while ((match = minuteRe.exec(text))) {
      const value = wordOrDigitToNumber(match[1]);
      if (value === null) continue;
      results.push({
        approxMinutes: value,
        precision: match[3] ? "approximate" : "explicit",
        raw: match[0].trim(),
      });
    }
    if (/demi[- ]heure/i.test(text)) {
      results.push({ approxMinutes: 30, precision: "approximate", raw: "demi-heure" });
    }
    const hourRe = /(\d+|[a-zéûî-]+)\s*heures?\b(?!\s*et\s*demi)/gi;
    while ((match = hourRe.exec(text))) {
      const value = wordOrDigitToNumber(match[1]);
      if (value === null) continue;
      results.push({
        approxMinutes: value * 60,
        precision: "explicit",
        raw: match[0].trim(),
      });
    }
    if (/\blongtemps\b/i.test(text))
      uncertain.push("durée non précisée : « longtemps »");
    if (/ça dépend\b|\bcela dépend\b/i.test(text))
      uncertain.push("condition non précisée : « ça dépend »");
    return { durations: results, uncertain };
  }

  const PAUSE_NEED_RE =
    /\b(m['’]asseoir|s['’]asseoir|besoin de m['’]asseoir|pause(?:s)? assise?s?|besoin de pauses?)\b/i;
  const FREQUENCY_RE = /\b(de temps en temps|parfois|régulièrement|souvent)\b/i;

  function extractPauseNeeds(text) {
    if (!PAUSE_NEED_RE.test(text)) return [];
    const frequencyMatch = text.match(FREQUENCY_RE);
    return [
      {
        type: "pause-assise",
        frequency: frequencyMatch ? frequencyMatch[1].toLowerCase() : null,
        raw: text.match(PAUSE_NEED_RE)[0],
      },
    ];
  }

  const PAIN_QUALIFIER_PATTERNS = Object.freeze([
    // Note : pas de \b en tête devant "ça"/"ç" — le \b de JavaScript ne
    // traite pas les lettres accentuées comme des caractères de mot, donc
    // \bça échoue silencieusement en début de chaîne ou après un espace.
    // Les expressions restent assez spécifiques (plusieurs mots) pour ne
    // pas produire de faux positifs sans l'ancrage.
    {
      polarity: "present",
      re: /\b(très mal|vraiment mal)\b|ça fait mal|ça tire|\b(j['’]ai mal|douleur)\b|\bavoir mal\b/i,
    },
    {
      polarity: "reduced",
      re: /\b(presque pas mal|peu de douleur|un peu mal|léger(?:ère)? gêne)\b/i,
    },
    {
      polarity: "absent",
      re: /\b(aucune douleur|pas mal|aucun souci)\b|ça va\b/i,
    },
  ]);

  // Reconnaît un signal qualitatif de douleur dans le texte, pour
  // confrontation ultérieure avec le curseur `pain` (D102E). Ne produit
  // jamais de valeur numérique : seulement une polarité + le texte source.
  // Ordre de priorité par clause : absent > reduced > present — évite
  // qu'« aucune douleur » ne déclenche à la fois "absent" (la phrase
  // complète) et "present" (le mot "douleur" seul, hors contexte).
  function extractPainQualifiers(text) {
    const clauses = splitClauses(text);
    const results = [];
    for (const clause of clauses) {
      const absent = clause.match(PAIN_QUALIFIER_PATTERNS[2].re);
      if (absent) {
        results.push({ polarity: "absent", raw: absent[0] });
        continue;
      }
      const reduced = clause.match(PAIN_QUALIFIER_PATTERNS[1].re);
      if (reduced) {
        results.push({ polarity: "reduced", raw: reduced[0] });
        continue;
      }
      const present = clause.match(PAIN_QUALIFIER_PATTERNS[0].re);
      if (present) results.push({ polarity: "present", raw: present[0] });
    }
    return results;
  }

  // Orchestrateur : combine les extracteurs ci-dessus en une
  // candidateInterpretation conforme au contrat D102A. N'écrit jamais
  // dans une requête ni dans painIntensity — produit uniquement un objet
  // candidat, à faire confirmer (D102C) avant tout raccordement (D102D).
  function interpretFreeText(text) {
    const normalized = normalizeFunctionalText(text);
    if (!normalized.clean) return emptyCandidateInterpretation();

    const laterality = extractLaterality(normalized.clean);
    const bodyAreas = extractBodyAreas(normalized.clean);
    const terrain = extractTerrainTriggers(normalized.clean);
    const durationInfo = extractDurations(normalized.clean);
    const pauseNeeds = extractPauseNeeds(normalized.clean);
    const painQualifiers = extractPainQualifiers(normalized.clean);

    const uncertain = [...laterality.uncertain, ...durationInfo.uncertain];
    if (terrain.conflicting.length)
      uncertain.push(
        `mentions contradictoires pour : ${terrain.conflicting.join(", ")}`,
      );
    for (const item of terrain.ambiguousNegationScope)
      uncertain.push(
        `portée de la négation ambiguë entre : ${item.triggers.join(", ")}`,
      );

    const triggers = [
      ...terrain.triggers,
      ...painQualifiers.map((p) => ({ trigger: "pain-qualifier", ...p })),
    ];

    return normalizeCandidateInterpretation({
      bodyAreas,
      side: laterality.side,
      triggers,
      temporal: durationInfo.durations.length
        ? { durations: durationInfo.durations }
        : {},
      needs: pauseNeeds,
      negations: terrain.negations,
      uncertain,
      confidence: {},
      coherenceIssues: [],
    });
  }

  function isConfirmed(state = {}) {
    return state.status === "confirmed" && state.confirmedInterpretation !== null;
  }

  // Squelette de détection de cohérence. La forme du retour est fixée dès
  // D102A pour que D102C (affichage) et D102E (règles réelles) s'accordent
  // sur un même contrat, mais aucune règle n'est implémentée ici : ce
  // module ne doit jamais inventer un problème de cohérence à partir de
  // rien. Tant qu'aucune règle n'existe, le retour est toujours vide.
  function detectCoherenceIssues(candidateInterpretation = {}, structuredFields = {}) {
    void candidateInterpretation;
    void structuredFields;
    return [];
  }

  // Vocabulaire partagé avec le formulaire manuel (limitations-core.js /
  // template) : ce module ne doit jamais inventer un libellé qui n'existe
  // pas déjà dans #limitationTrigger / #limitationSide, pour que la
  // contrainte confirmée par texte et la même contrainte saisie à la main
  // rejoignent strictement le même modèle (plan D102 v1.1, §D102D).
  const RACCORDABLE_TRIGGERS = Object.freeze([
    "Descente",
    "Montée",
    "Terrain irrégulier",
    "Station debout",
  ]);
  const RACCORDABLE_SIDES = Object.freeze(["Gauche", "Droit", "Bilatéral"]);

  function firstRaccordableTrigger(candidate = {}) {
    const triggers = Array.isArray(candidate.triggers) ? candidate.triggers : [];
    const match = triggers.find((t) => RACCORDABLE_TRIGGERS.includes(t.trigger));
    return match ? match.trigger : null;
  }

  // Durée max sans pause : uniquement quand le texte confirme À LA FOIS une
  // durée ET un besoin de pause — jamais une durée seule (ce serait
  // confondre "apparition de la gêne après X minutes" avec "je peux tenir
  // X minutes sans pause", deux informations différentes). Cf. discussion
  // D102D : prudence plutôt qu'ascription automatique.
  function raccordableMaxWithoutPause(candidate = {}) {
    const durations =
      candidate.temporal && Array.isArray(candidate.temporal.durations)
        ? candidate.temporal.durations
        : [];
    const hasPauseNeed = (candidate.needs || []).some((n) => n.type === "pause-assise");
    if (!hasPauseNeed || !durations.length) return null;
    return durations[0].approxMinutes ?? null;
  }

  // Point de raccordement unique vers le modèle de requête existant. Reste
  // un no-op tant que l'état n'est pas explicitement "confirmed" — aucune
  // déduction silencieuse. Une fois confirmé, ne remplit QUE les champs du
  // même formulaire structuré que la saisie manuelle (côté, déclencheur,
  // durée sans pause si les deux signaux sont présents) : jamais
  // `consequence`, jamais `confirmed`, jamais `painIntensity`. La
  // contrainte ne devient active que si l'utilisateur choisit ensuite une
  // conséquence et coche explicitement "Je confirme cette limite"
  // (mécanisme D-024 existant) — ce module ne le fait jamais à sa place.
  function mergeConfirmedInterpretationIntoRequest(request = {}, state = {}) {
    const next = clone(request);
    if (!isConfirmed(state)) return next;
    const candidate = state.confirmedInterpretation || {};
    const existing =
      next.functionalLimitation && typeof next.functionalLimitation === "object"
        ? next.functionalLimitation
        : {};
    const trigger = firstRaccordableTrigger(candidate);
    const side = RACCORDABLE_SIDES.includes(candidate.side) ? candidate.side : null;
    const maxWithoutPauseMinutes = raccordableMaxWithoutPause(candidate);
    if (!trigger && !side && maxWithoutPauseMinutes === null) return next;
    next.functionalLimitation = {
      ...existing,
      trigger: existing.trigger || trigger,
      side: existing.side || side,
      maxWithoutPauseMinutes:
        existing.maxWithoutPauseMinutes ?? maxWithoutPauseMinutes ?? existing.maxWithoutPauseMinutes,
    };
    return next;
  }

  globalThis.JMMJSFreeTextInterpretationCore = Object.freeze({
    STATUSES,
    COHERENCE_FIELDS,
    emptyCandidateInterpretation,
    normalizeCandidateInterpretation,
    createInterpretationState,
    isConfirmed,
    detectCoherenceIssues,
    mergeConfirmedInterpretationIntoRequest,
    // D102B
    normalizeFunctionalText,
    splitClauses,
    extractLaterality,
    extractBodyAreas,
    extractTerrainTriggers,
    extractNegations,
    extractDurations,
    extractPauseNeeds,
    extractPainQualifiers,
    interpretFreeText,
  });
})();
/* JMMJS_FREE_TEXT_INTERPRETATION_CORE_END */
