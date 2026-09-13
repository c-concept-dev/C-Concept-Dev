/* ADN-QG-02A — OUTPUT COMPLIANCE GATE : MOTEUR PUR
 * ============================================================================
 * Ce module répond à UNE question, après l'exécution :
 *
 *     la sortie produite respecte-t-elle les obligations
 *     OBJECTIVEMENT VÉRIFIABLES du contrat canonique ?
 *
 * Il ne répond pas à « la réponse est-elle bonne, pertinente, vraie, rigoureuse,
 * bien écrite ». Ces dimensions n'ont pas d'oracle ici, et prétendre les
 * vérifier reviendrait à produire une preuve qui n'existe pas.
 *
 * LA RÈGLE CENTRALE DU LOT — la discipline épistémique :
 *
 *     ce qui n'est pas vérifiable ici ne devient JAMAIS un succès.
 *
 * Un contrôle sémantique est DIFFÉRÉ ; un contrôle qualitatif est NON
 * VÉRIFIABLE ; un contrôle dont le type est inconnu est NON VÉRIFIABLE ; un
 * contrôle qui se dit déterministe sans porter de grandeur mesurable est NON
 * VÉRIFIABLE. Aucun des quatre ne peut compter comme tenu, et la présence de
 * l'un d'eux sur une obligation REQUISE fait tomber le verdict global en
 * INCOMPLETE_VERIFICATION — jamais en PASS.
 *
 * Cette règle n'est pas seulement écrite : elle est posée au point de
 * construction d'une vérification (`verification()`), si bien qu'aucun chemin
 * du moteur ne peut produire un faux succès, même par erreur d'écriture future.
 *
 * FRONTIÈRES — quatre responsabilités, jamais confondues :
 *   1. OPRIE readiness      → la demande est-elle exploitable ?      (serveur)
 *   2. Prompt contract      → le prompt porte-t-il le contrat ?      (QG-00/01)
 *   3. Execution readiness  → l'exécution peut-elle démarrer ?       (ailleurs)
 *   4. Output compliance    → la sortie respecte-t-elle le contrat ? (ICI)
 *
 * PÉRIMÈTRE DE CE SOUS-LOT : le moteur, et rien d'autre. Il n'est branché sur
 * aucun chemin de production ; ni Rapide, ni Architecte ne l'appellent encore.
 *
 * INTERDITS STRUCTURELS :
 *   - aucun réseau, aucun fournisseur, aucun juge LLM, aucun DOM ;
 *   - aucun fuzzy, aucun embedding, aucune similarité sémantique ;
 *   - aucun vocabulaire métier, aucune liste noire improvisée ;
 *   - aucune mutation du contrat, de la sortie, des contrôles, du contexte ;
 *   - aucune réécriture, aucune correction, aucune relance.
 * ========================================================================= */

export const OUTPUT_COMPLIANCE_GATE_VERSION = '1.0';

/* ADN-QG-02A — MOTEUR SEUL. L'intégration appartient à QG-02B (Rapide) et
 * QG-02C (Architecte) ; ce marqueur ne passera à true qu'à ce moment-là. */
export const OUTPUT_COMPLIANCE_GATE_PRODUCTION_ACTIVE = false;

export const OUTPUT_GATE_STATUSES = Object.freeze([
  'PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL'
]);

/* Taxonomie DISTINCTE de celle du Prompt Contract Gate : un défaut de
 * projection et un défaut de sortie ne sont pas la même chose et ne se
 * corrigent pas au même endroit. Les deux familles ne partagent que l'échec
 * technique, qui n'appartient à aucune des deux. */
export const OUTPUT_VIOLATION_CODES = Object.freeze([
  'MISSING_REQUIRED_OUTPUT',
  'OUTPUT_FORMAT_MISMATCH',
  'OUTPUT_QUANTITY_MISMATCH',
  'CHECK_FAILED',
  'PROVENANCE_REQUIREMENT_FAILED',
  'SCOPE_VIOLATION',
  'FORBIDDEN_CONTENT_PRESENT',
  'UNSUPPORTED_CLAIM',
  'TECHNICAL_VALIDATION_FAILURE'
]);

/* Ce qu'on peut savoir, et par quel moyen on peut le savoir. */
export const VERIFIABILITY_LEVELS = Object.freeze([
  'DETERMINISTIC', 'STRUCTURAL', 'SEMANTIC', 'HEURISTIC', 'NOT_VERIFIABLE'
]);

export const CHECK_STATUSES = Object.freeze([
  'PASS', 'FAIL', 'WARNING', 'NOT_VERIFIABLE', 'DEFERRED', 'NOT_APPLICABLE'
]);

/* Les SEULS niveaux qui peuvent produire un PASS. Cette liste EST la garantie
 * anti-fake-pass du moteur ; elle est consultée par le constructeur de
 * vérification et ne peut pas être contournée par une branche. */
const VERIFIABLE_HERE = Object.freeze(['DETERMINISTIC', 'STRUCTURAL']);

/* Grandeurs mesurables sur une sortie : énumération fermée, purement formelle.
 * Aucune ne lit le SENS du texte ; toutes comptent une structure. */
export const MEASURABLE_UNITS = Object.freeze(['characters', 'words', 'lines', 'paragraphs', 'items']);

/* Une trace témoigne de vérifications. Elle ne peut donc porter ni readiness,
 * ni route, ni verdict de qualité inventé. */
export const OUTPUT_TRACE_FORBIDDEN_FIELDS = Object.freeze([
  'readiness', 'execution_ready', 'oprie_state',
  'route', 'routing', 'engine_choice',
  'inferred_verdict', 'inferred_quality', 'semantic_score', 'relevance_score'
]);

/* ------------------------------------------------------------------------ *
 * Utilitaires purs — aucune interprétation, aucune normalisation de sens.
 * ------------------------------------------------------------------------ */
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

/** Construit une vérification, et REFUSE structurellement le faux succès. */
function verification({ id, category, required, blocking, verifiability, status, expected = null, observed = null, reason = '', evidence = null }) {
  if (!VERIFIABILITY_LEVELS.includes(verifiability)) throw new TypeError(`ADN-QG-02 : niveau de vérifiabilité inconnu (${verifiability}).`);
  if (!CHECK_STATUSES.includes(status)) throw new TypeError(`ADN-QG-02 : statut de contrôle inconnu (${status}).`);
  if (status === 'PASS' && !VERIFIABLE_HERE.includes(verifiability)) {
    throw new TypeError(`ADN-QG-02 : ${verifiability} ne peut jamais valoir PASS (${id}).`);
  }
  return {
    id: id || null, category, required: required === true, blocking: blocking === true,
    verifiability, status, expected, observed, reason, evidence
  };
}

function violation(code, check_id, detail, blocking = true) {
  if (!OUTPUT_VIOLATION_CODES.includes(code)) throw new TypeError(`ADN-QG-02 : code de violation inconnu (${code}).`);
  return { code, check_id: check_id || null, detail, blocking };
}

/* ------------------------------------------------------------------------ *
 * NORMALISATION DE TRANSPORT UNIQUEMENT.
 *
 * On accepte une chaîne brute ou une sortie déjà structurée. Rien n'est
 * interprété : ce qui n'est pas fourni reste absent, et l'absence n'est jamais
 * comblée. C'est ce qui permet plus loin de dire « non vérifiable » plutôt que
 * de deviner.
 * ------------------------------------------------------------------------ */
export function normalizeOutput(output) {
  if (typeof output === 'string') {
    return { text: output, items: null, provenance: null, structured: false };
  }
  if (!isObject(output)) return null;
  const hasText = typeof output.text === 'string';
  const hasItems = Array.isArray(output.items);
  if (!hasText && !hasItems) return null;
  return {
    text: hasText ? output.text : '',
    items: hasItems ? output.items : null,
    provenance: Array.isArray(output.provenance) ? output.provenance : null,
    structured: true
  };
}

/* ------------------------------------------------------------------------ *
 * COMPTAGE STRUCTUREL D'ÉLÉMENTS.
 *
 * Uniquement des marqueurs de liste — puces et numérotation. Aucun mot n'est
 * lu. Si la sortie porte une collection, cette collection fait foi ; sinon, et
 * à défaut de tout marqueur, le compte est INCONNU et non pas zéro.
 * ------------------------------------------------------------------------ */
const LIST_MARKER = /^[ \t]*(?:[-*•]|\d+[.)])[ \t]+\S/;

export function countStructuralItems(normalized) {
  if (normalized.items) return { count: normalized.items.length, source: 'structured_collection' };
  const lignes = normalized.text.split('\n').filter((l) => LIST_MARKER.test(l));
  if (!lignes.length) return { count: null, source: 'no_structural_marker' };
  return { count: lignes.length, source: 'list_markers' };
}

/** Formes structurelles reconnaissables sans lire le sens. Énumération fermée. */
export function detectStructuralFormat(normalized) {
  const t = normalized.text.trim();
  const formes = [];
  if (t) {
    try { JSON.parse(t); formes.push('json'); } catch { /* pas du JSON : un fait, pas un défaut */ }
  }
  const lignes = t.split('\n');
  if (lignes.some((l) => /^\s*\|.*\|\s*$/.test(l)) && lignes.some((l) => /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(l))) formes.push('table');
  if (lignes.some((l) => LIST_MARKER.test(l))) formes.push('list');
  if (lignes.some((l) => /^[ \t]*\d+[.)][ \t]+\S/.test(l))) formes.push('numbered_list');
  return formes;
}

/** Mesure une grandeur formelle. Rend `null` pour toute unité hors énumération. */
export function measureOutput(normalized, unit) {
  const t = normalized.text;
  switch (unit) {
    case 'characters': return t.length;
    case 'words': return t.split(/\s+/).filter(Boolean).length;
    case 'lines': return t.split('\n').length;
    case 'paragraphs': return t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
    case 'items': return countStructuralItems(normalized).count;
    default: return null;
  }
}

/* Le vocabulaire de formats est INJECTÉ par l'appelant : le noyau n'écrit aucun
 * identifiant de format applicatif et ne peut donc pas en inventer. Un format
 * sans forme structurelle déclarée n'est pas « supposé tenu » : il est déclaré
 * non vérifiable. */
function structuralKindOf(formatId, vocabulary) {
  const entry = list(vocabulary).find((f) => text(plain(f).id) === formatId);
  return entry ? text(plain(entry).structural_kind) || null : null;
}

function withinBounds(value, bounds) {
  return (isInt(bounds.exact) ? value === bounds.exact : true)
    && (isInt(bounds.min) ? value >= bounds.min : true)
    && (isInt(bounds.max) ? value <= bounds.max : true);
}

function boundsLabel(bounds) {
  if (isInt(bounds.exact)) return `exactement ${bounds.exact}`;
  const parts = [isInt(bounds.min) ? `au moins ${bounds.min}` : '', isInt(bounds.max) ? `au plus ${bounds.max}` : ''].filter(Boolean);
  return parts.join(' et ') || 'aucune borne';
}

/* ------------------------------------------------------------------------ *
 * LE MOTEUR DE CONTRÔLES.
 *
 * Chaque type est dispatché EXPLICITEMENT. Aucun type ne tombe dans une branche
 * permissive : l'inconnu devient non vérifiable, jamais tenu.
 * ------------------------------------------------------------------------ */
export function executeOutputChecks({ canonical_contract, normalized, checks, format_vocabulary }) {
  const c = plain(canonical_contract);
  const out = plain(c.output);
  const verifications = [];

  /* ---- 1. NON-VACUITÉ ---------------------------------------------------
     Un livrable est attendu : une sortie vide, ou faite d'espaces, est un
     échec mesurable — c'est l'un des rares constats pleinement objectifs. */
  const nonVide = !!text(normalized.text) || (normalized.items ? normalized.items.length > 0 : false);
  verifications.push(verification({
    id: 'output-non-empty', category: 'output', required: true, blocking: true,
    verifiability: 'DETERMINISTIC', status: nonVide ? 'PASS' : 'FAIL',
    expected: 'sortie non vide',
    observed: normalized.items ? `${normalized.items.length} élément(s)` : `${normalized.text.trim().length} caractère(s) utiles`,
    reason: nonVide ? '' : 'Le contrat attend un livrable ; aucune sortie exploitable n’a été produite.'
  }));

  /* ---- 2. QUANTITÉ — comptage structurel, jamais sémantique ------------- */
  const quantites = list(c.quantities);
  if (quantites.length) {
    const q = plain(quantites[0]);
    const bornes = { exact: isInt(q.exact) ? q.exact : null, min: isInt(q.min) ? q.min : null, max: isInt(q.max) ? q.max : null };
    const compte = countStructuralItems(normalized);
    if (compte.count === null) {
      verifications.push(verification({
        id: 'output-quantity', category: 'quantity', required: true, blocking: true,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: boundsLabel(bornes), observed: 'aucun marqueur structurel dénombrable',
        reason: 'Compter les éléments de cette sortie exigerait d’en interpréter le sens.'
      }));
    } else {
      const ok = withinBounds(compte.count, bornes);
      verifications.push(verification({
        id: 'output-quantity', category: 'quantity', required: true, blocking: true,
        verifiability: 'DETERMINISTIC', status: ok ? 'PASS' : 'FAIL',
        expected: boundsLabel(bornes), observed: `${compte.count}`, evidence: compte.source,
        reason: ok ? '' : 'Le nombre d’éléments produits ne correspond pas au contrat.'
      }));
    }
  }

  /* ---- 3. FORMAT — structurel, sur une énumération fermée ---------------- */
  const formatAttendu = text(out.format);
  if (formatAttendu) {
    const kind = structuralKindOf(formatAttendu, format_vocabulary);
    if (!kind) {
      verifications.push(verification({
        id: 'output-format', category: 'format', required: true, blocking: true,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: formatAttendu, observed: 'aucune forme structurelle opposable',
        reason: 'Ce format ne déclare aucune structure mesurable : sa conformité ne peut pas être établie ici.'
      }));
    } else {
      const observes = detectStructuralFormat(normalized);
      const ok = observes.includes(kind);
      verifications.push(verification({
        id: 'output-format', category: 'format', required: true, blocking: true,
        verifiability: 'DETERMINISTIC', status: ok ? 'PASS' : 'FAIL',
        expected: kind, observed: observes.join(', ') || 'aucune structure reconnue',
        reason: ok ? '' : 'La sortie ne présente pas la structure exigée par le contrat.'
      }));
    }
  }

  /* ---- 4. LONGUEUR — seulement si une mesure est opposable --------------- */
  const politique = text(out.length_policy);
  if (politique) {
    const bornes = plain(out.length_bounds);
    const unite = text(bornes.unit);
    if (!MEASURABLE_UNITS.includes(unite)) {
      verifications.push(verification({
        id: 'output-length', category: 'length', required: false, blocking: false,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_APPLICABLE',
        expected: politique, observed: 'aucune borne mesurable attachée à la politique',
        reason: 'La politique de longueur est qualitative : elle n’ouvre aucune obligation mesurable.'
      }));
    } else {
      const mesuree = measureOutput(normalized, unite);
      const ok = mesuree !== null && withinBounds(mesuree, bornes);
      verifications.push(verification({
        id: 'output-length', category: 'length', required: true, blocking: true,
        verifiability: 'DETERMINISTIC', status: ok ? 'PASS' : 'FAIL',
        expected: `${boundsLabel(bornes)} ${unite}`, observed: mesuree === null ? 'non mesurable' : `${mesuree} ${unite}`,
        reason: ok ? '' : 'La longueur produite sort des bornes du contrat.'
      }));
    }
  }

  /* ---- 5. PROVENANCE — présence STRUCTURELLE, jamais véracité ------------
     La distinction porte tout le paragraphe : la présence d'une source est
     observable ; le fait qu'elle prouve l'affirmation ne l'est pas ici. */
  const provenanceAttendue = list(plain(c.evidence).provenance);
  if (provenanceAttendue.length) {
    if (!normalized.provenance) {
      verifications.push(verification({
        id: 'output-provenance-present', category: 'provenance', required: true, blocking: true,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: `${provenanceAttendue.length} affirmation(s) tracée(s)`, observed: 'sortie non structurée',
        reason: 'Sans sortie structurée, la présence d’une provenance ne pourrait être établie qu’en interprétant le texte.'
      }));
    } else {
      const parId = new Map(normalized.provenance.map((p) => [text(plain(p).statement_id), plain(p)]));
      const manquantes = provenanceAttendue.filter((p) => !parId.has(text(plain(p).statement_id)));
      verifications.push(verification({
        id: 'output-provenance-present', category: 'provenance', required: true, blocking: true,
        verifiability: 'STRUCTURAL', status: manquantes.length ? 'FAIL' : 'PASS',
        expected: `${provenanceAttendue.length} affirmation(s) tracée(s)`,
        observed: `${normalized.provenance.length} présente(s)`,
        reason: manquantes.length ? 'Des affirmations du contrat ne sont pas tracées dans la sortie.' : ''
      }));

      /* Un statut non vérifié ne peut JAMAIS être présenté comme vérifié. */
      const promues = provenanceAttendue.filter((p) => {
        const attendu = text(plain(p).verification_status);
        const rendue = parId.get(text(plain(p).statement_id));
        return rendue && attendu && attendu !== 'verified' && text(rendue.verification_status) === 'verified';
      });
      verifications.push(verification({
        id: 'output-provenance-status', category: 'provenance', required: true, blocking: true,
        verifiability: 'STRUCTURAL', status: promues.length ? 'FAIL' : 'PASS',
        expected: 'statut de vérification conservé',
        observed: promues.length ? `${promues.length} statut(s) promu(s) en « verified »` : 'aucune promotion',
        reason: promues.length ? 'Une affirmation non vérifiée a été présentée comme vérifiée.' : ''
      }));

      /* Et la VÉRACITÉ reste hors de portée. Le dire explicitement est le seul
         moyen de ne pas la laisser passer pour établie par omission. */
      verifications.push(verification({
        id: 'output-provenance-truth', category: 'provenance', required: false, blocking: false,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: 'source réellement probante pour l’affirmation',
        observed: 'hors de portée d’un contrôle local',
        reason: 'La présence d’une source est vérifiable ; le fait qu’elle prouve l’affirmation ne l’est pas ici.'
      }));
    }
  }

  /* ---- 6. CONTRÔLES DU CONTRAT — dispatch EXPLICITE par type ------------- */
  for (const raw of list(checks)) {
    if (!isObject(raw)) {
      /* Un contrôle malformé corrompt le contrat : il ne peut être ni exécuté
         ni ignoré. L'appelant l'a déjà su par la garde technique amont ; ici
         on le rend visible plutôt que de le sauter en silence. */
      verifications.push(verification({
        id: null, category: 'contract_check', required: true, blocking: true,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: 'contrôle exploitable', observed: 'entrée de contrôle malformée',
        reason: 'Un contrôle malformé ne peut pas être réputé tenu.'
      }));
      continue;
    }
    const check = plain(raw);
    const id = text(check.id) || null;
    const type = text(check.type);
    const blocking = check.blocking === true;

    /* Un contrôle qui ne fait que redire une vérification déjà intégrée est
       déclaré sans objet : le compter deux fois gonflerait la couverture, et
       l'ignorer en silence la masquerait. */
    const redit = text(check.verifies);
    if (redit) {
      verifications.push(verification({
        id, category: 'contract_check', required: false, blocking: false,
        verifiability: 'DETERMINISTIC', status: 'NOT_APPLICABLE',
        expected: text(check.rule), observed: `couvert par la vérification intégrée de ${redit}`,
        reason: 'Ce contrôle porte sur une grandeur déjà vérifiée : il n’est pas recompté.'
      }));
      continue;
    }

    if (type === 'deterministic') {
      /* Un contrôle déterministe n'est exécutable que s'il porte une MESURE
         opposable. Sans elle, il n'est pas présumé tenu : le libellé d'une
         règle ne prouve rien, et un mot présent dans une phrase n'est pas un
         contrôle exécuté. */
      const mesure = plain(check.measure);
      const unite = text(mesure.unit);
      if (!unite) {
        verifications.push(verification({
          id, category: 'contract_check', required: true, blocking,
          verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
          expected: text(check.rule), observed: 'aucune mesure opposable attachée au contrôle',
          reason: 'Le contrôle se déclare déterministe mais ne porte aucune grandeur mesurable.'
        }));
        continue;
      }
      if (!MEASURABLE_UNITS.includes(unite)) {
        verifications.push(verification({
          id, category: 'contract_check', required: true, blocking,
          verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
          expected: text(check.rule), observed: `unité de mesure inconnue : ${unite}`,
          reason: 'Aucune grandeur de ce nom n’est mesurable sur une sortie.'
        }));
        continue;
      }
      const mesuree = measureOutput(normalized, unite);
      if (mesuree === null) {
        verifications.push(verification({
          id, category: 'contract_check', required: true, blocking,
          verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
          expected: text(check.rule), observed: 'grandeur non mesurable sur cette sortie',
          reason: 'La sortie ne porte pas la structure nécessaire à cette mesure.'
        }));
        continue;
      }
      const ok = withinBounds(mesuree, mesure);
      verifications.push(verification({
        id, category: 'contract_check', required: true, blocking,
        verifiability: 'DETERMINISTIC', status: ok ? 'PASS' : 'FAIL',
        expected: text(check.rule), observed: `${mesuree} ${unite}`,
        reason: ok ? '' : 'La mesure produite sort des bornes du contrat.'
      }));
      continue;
    }

    if (type === 'forbidden_content') {
      /* Uniquement des chaînes EXPLICITEMENT fournies par le contrat. Le noyau
         ne connaît aucune liste noire et ne peut donc en improviser aucune. */
      const interdits = list(check.forbidden_strings).map((x) => text(x)).filter(Boolean);
      if (!interdits.length) {
        verifications.push(verification({
          id, category: 'contract_check', required: true, blocking,
          verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
          expected: text(check.rule), observed: 'aucune chaîne interdite explicitement définie',
          reason: 'Sans énumération explicite, l’interdiction n’est pas opposable mécaniquement.'
        }));
        continue;
      }
      const presents = interdits.filter((s) => normalized.text.includes(s));
      verifications.push(verification({
        id, category: 'contract_check', required: true, blocking,
        verifiability: 'DETERMINISTIC', status: presents.length ? 'FAIL' : 'PASS',
        expected: text(check.rule),
        observed: presents.length ? `${presents.length} occurrence(s) interdite(s)` : 'aucune occurrence',
        reason: presents.length ? 'La sortie contient un élément explicitement interdit par le contrat.' : ''
      }));
      continue;
    }

    if (type === 'structural_field') {
      /* Présence d'un champ obligatoire dans une sortie STRUCTURÉE. */
      const champ = text(check.field);
      if (!champ || !normalized.structured) {
        verifications.push(verification({
          id, category: 'contract_check', required: true, blocking,
          verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
          expected: text(check.rule), observed: champ ? 'sortie non structurée' : 'aucun champ nommé',
          reason: 'La présence d’un champ ne s’observe que sur une sortie structurée qui le nomme.'
        }));
        continue;
      }
      const present = list(normalized.items).every((item) => isObject(item) && item[champ] !== undefined);
      verifications.push(verification({
        id, category: 'contract_check', required: true, blocking,
        verifiability: 'STRUCTURAL', status: present ? 'PASS' : 'FAIL',
        expected: text(check.rule), observed: present ? `champ « ${champ} » présent partout` : `champ « ${champ} » manquant`,
        reason: present ? '' : 'Un champ exigé par le contrat manque dans la sortie.'
      }));
      continue;
    }

    if (type === 'semantic') {
      verifications.push(verification({
        id, category: 'contract_check', required: true, blocking,
        verifiability: 'SEMANTIC', status: 'DEFERRED',
        expected: text(check.rule), observed: 'non évalué ici',
        reason: 'Ce contrôle exige un jugement de sens : il est différé, jamais présumé tenu.'
      }));
      continue;
    }

    if (type === 'heuristic') {
      /* Un contrôle indicatif peut alerter ; il ne peut jamais certifier, et il
         ne rend donc jamais une obligation requise. */
      verifications.push(verification({
        id, category: 'contract_check', required: false, blocking: false,
        verifiability: 'HEURISTIC', status: 'WARNING',
        expected: text(check.rule), observed: 'appréciation non opposable',
        reason: 'Contrôle indicatif : il peut signaler, jamais établir.'
      }));
      continue;
    }

    if (type === 'not_verifiable') {
      /* Le contrat déclare lui-même cet élément hors de portée. S'il le déclare
         AUSSI bloquant, c'est une obligation qu'il admet ne pas savoir vérifier :
         le verdict doit tomber en INCOMPLETE, jamais en conforme. Forcer ici
         `required: false` reviendrait à faire disparaître l'obligation. */
      verifications.push(verification({
        id, category: 'contract_check', required: blocking, blocking,
        verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
        expected: text(check.rule), observed: 'hors de portée',
        reason: 'Le contrat lui-même déclare cet élément non vérifiable.'
      }));
      continue;
    }

    /* Type inconnu : jamais permissif. Requis ⇒ le verdict global tombera en
       INCOMPLETE_VERIFICATION ; optionnel ⇒ simple constat. */
    verifications.push(verification({
      id, category: 'contract_check', required: blocking, blocking,
      verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
      expected: text(check.rule), observed: `type de contrôle inconnu : ${type || 'vide'}`,
      reason: 'Un contrôle dont le type est inconnu ne peut pas être réputé tenu.'
    }));
  }

  /* ---- 7. OBLIGATIONS SANS CONTRÔLE EXÉCUTABLE -------------------------- */
  for (const raw of list(c.obligations)) {
    const obligation = plain(raw);
    const id = text(obligation.id);
    if (!id || obligation.mandatory !== true) continue;
    if (list(obligation.check_ids).length) continue;   // portée par ses propres contrôles
    verifications.push(verification({
      id: `obligation:${id}`, category: 'obligation', required: true, blocking: true,
      verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
      expected: text(obligation.text), observed: 'aucun contrôle opposable rattaché',
      reason: 'Cette obligation n’a pas de contrôle exécutable : son respect ne peut pas être établi ici.'
    }));
  }

  /* ---- 8. PÉRIMÈTRE — déclaré non vérifiable, plutôt que faussement tenu -- */
  const scope = list(plain(c.semantic_lock_signals).signals)
    .find((s) => plain(s).id === 'scope' && plain(s).needed === true);
  if (scope) {
    verifications.push(verification({
      id: 'output-scope', category: 'scope', required: true, blocking: true,
      verifiability: 'NOT_VERIFIABLE', status: 'NOT_VERIFIABLE',
      expected: 'périmètre du livrable respecté', observed: 'aucun oracle de périmètre',
      reason: 'Constater qu’une sortie est restée dans son périmètre exige un jugement de sens.'
    }));
  }

  return verifications;
}

/* ------------------------------------------------------------------------ *
 * LE GATE
 * ------------------------------------------------------------------------ */
export function validateOutputAgainstCanonicalContract({
  canonical_contract, output, checks, execution_context
} = {}) {
  /* ---- FAIL CLOSED TECHNIQUE : aucune entrée invalide ne produit un succès.
     Fermer ne dit pas « la réponse est fausse » : cela dit « elle ne peut pas
     être certifiée conforme ». La distinction est portée par `technical_failure`. */
  const techniques = [];
  if (!isObject(canonical_contract)) techniques.push('contrat canonique absent ou non structuré');
  const normalized = normalizeOutput(output);
  if (!normalized) techniques.push('sortie absente ou de forme inattendue');
  if (checks !== undefined && checks !== null && !Array.isArray(checks)) techniques.push('la liste de contrôles est malformée');
  if (execution_context !== undefined && execution_context !== null && !isObject(execution_context)) {
    techniques.push('contexte d’exécution malformé');
  }
  if (techniques.length) return failClosed(techniques);

  const contexte = plain(execution_context);
  const c = plain(canonical_contract);
  const source = Array.isArray(checks) ? checks : list(c.checks);

  let verifications;
  try {
    verifications = executeOutputChecks({
      canonical_contract: c, normalized, checks: source,
      format_vocabulary: list(contexte.format_vocabulary)
    });
  } catch (error) {
    return failClosed([String((error && error.message) || error)]);
  }

  /* ---- VIOLATIONS : dérivées des vérifications, jamais inventées --------- */
  const violations = [];
  const warnings = [];
  for (const v of verifications) {
    if (v.status === 'WARNING') { warnings.push(violation('CHECK_FAILED', v.id, v.reason || v.expected, false)); continue; }
    if (v.status !== 'FAIL') continue;
    (v.blocking ? violations : warnings).push(violation(codeFor(v), v.id, v.reason || v.expected, v.blocking));
  }

  /* ---- AGRÉGATION : FAIL > INCOMPLETE > PASS_WITH_WARNINGS > PASS -------
     Aucun score, aucun ratio, aucun seuil. Une seule question par niveau. */
  const bloquantes = violations.filter((v) => v.blocking);
  const requisNonVerifiables = verifications.filter(
    (v) => v.required && (v.status === 'NOT_VERIFIABLE' || v.status === 'DEFERRED')
  );
  let status;
  if (bloquantes.length) status = 'FAIL';
  else if (requisNonVerifiables.length) status = 'INCOMPLETE_VERIFICATION';
  else if (violations.length || warnings.length) status = 'PASS_WITH_WARNINGS';
  else status = 'PASS';

  const verifiees = verifications.filter((v) => VERIFIABLE_HERE.includes(v.verifiability) && v.status !== 'NOT_APPLICABLE');

  return {
    version: OUTPUT_COMPLIANCE_GATE_VERSION,
    status,
    technical_failure: false,
    violations,
    warnings,
    verifications,
    unverifiable: verifications
      .filter((v) => v.status === 'NOT_VERIFIABLE' || v.status === 'DEFERRED')
      .map((v) => ({ id: v.id, verifiability: v.verifiability, status: v.status, required: v.required, reason: v.reason })),
    coverage: {
      total: verifications.length,
      verifiable_here: verifiees.length,
      passed: verifiees.filter((v) => v.status === 'PASS').length,
      failed: verifications.filter((v) => v.status === 'FAIL').length,
      deferred: verifications.filter((v) => v.status === 'DEFERRED').length,
      not_verifiable: verifications.filter((v) => v.status === 'NOT_VERIFIABLE').length,
      not_applicable: verifications.filter((v) => v.status === 'NOT_APPLICABLE').length,
      required_unverifiable: requisNonVerifiables.length
    },
    trace: {
      gate: 'output_compliance',
      output_structured: normalized.structured,
      blocking_violations: bloquantes.length,
      fail_closed: false,
      entries: verifications.map((v) => ({
        id: v.id, category: v.category, verifiability: v.verifiability, status: v.status,
        required: v.required, blocking: v.blocking,
        expected: v.expected, observed: v.observed, reason: v.reason
      }))
    }
  };
}

/** Chaque famille porte SON code : une perte reste lisible sans déduction. */
function codeFor(v) {
  switch (v.category) {
    case 'quantity': return 'OUTPUT_QUANTITY_MISMATCH';
    case 'format': return 'OUTPUT_FORMAT_MISMATCH';
    case 'length': return 'CHECK_FAILED';
    case 'provenance': return 'PROVENANCE_REQUIREMENT_FAILED';
    case 'scope': return 'SCOPE_VIOLATION';
    case 'output': return 'MISSING_REQUIRED_OUTPUT';
    case 'obligation': return 'UNSUPPORTED_CLAIM';
    default:
      return v.id && String(v.id).includes('forbidden') ? 'FORBIDDEN_CONTENT_PRESENT' : 'CHECK_FAILED';
  }
}

function failClosed(details) {
  return {
    version: OUTPUT_COMPLIANCE_GATE_VERSION,
    status: 'FAIL',
    /* Fermer n'est pas dire que la réponse est fausse : c'est dire qu'elle ne
       peut pas être certifiée conforme. L'appelant doit pouvoir distinguer. */
    technical_failure: true,
    violations: details.map((d) => violation('TECHNICAL_VALIDATION_FAILURE', null, d, true)),
    warnings: [],
    verifications: [],
    unverifiable: [],
    coverage: {
      total: 0, verifiable_here: 0, passed: 0, failed: 0,
      deferred: 0, not_verifiable: 0, not_applicable: 0, required_unverifiable: 0
    },
    trace: { gate: 'output_compliance', output_structured: false, blocking_violations: details.length, fail_closed: true, entries: [] }
  };
}

/** Garde statique de trace : compte les familles interdites réellement portées. */
export function auditOutputTrace(trace) {
  const t = plain(trace);
  const entries = list(t.entries);
  const compte = (familles) => entries.reduce((n, raw) => {
    const e = plain(raw);
    return n + familles.filter((f) => Object.prototype.hasOwnProperty.call(e, f)).length;
  }, 0) + familles.filter((f) => Object.prototype.hasOwnProperty.call(t, f)).length;
  return {
    entry_count: entries.length,
    readiness_fields: compte(['readiness', 'execution_ready', 'oprie_state']),
    route_fields: compte(['route', 'routing', 'engine_choice']),
    inferred_semantic_fields: compte(['inferred_verdict', 'inferred_quality', 'semantic_score', 'relevance_score'])
  };
}
