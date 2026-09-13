/* BETA-04 — UNE SOLLICITATION, UN BESOIN ATOMIQUE. GARDE DÉTERMINISTE.
 * ===========================================================================
 *
 * Ce garde décide si une sollicitation candidate du plan rapide peut être AFFICHÉE. Il ne décide
 * jamais qu'une demande est prête, ne porte aucun état OPRIE, et ne réécrit jamais une question.
 *
 * DÉCISION PROPRIÉTAIRE : aucun appel fournisseur supplémentaire. La première version de ce module
 * faisait relire chaque candidate par un modèle — un appel de plus sur le chemin de la première
 * interaction, donc du temps ajouté là même où il faut en retirer, et un coût jetons sur un budget
 * déjà dépassé. Le contrôle est donc structurel, local, et synchrone : il coûte zéro appel et
 * quelques microsecondes.
 *
 * Ce qu'il mesure n'est pas « la qualité » d'une question — un garde ne sait pas juger cela. Il
 * mesure trois propriétés de FORME qui suffisent à reconnaître les échecs réellement observés :
 *
 *   1. plusieurs interrogations dans une même enveloppe ;
 *   2. un catalogue de livrables hétérogènes présenté comme un choix unique ;
 *   3. une question déjà répondue, reposée à l'identique.
 *
 * Aucun mot de domaine, aucun seuil de longueur, aucune liste métier. Les marqueurs employés sont
 * grammaticaux — interrogatifs et déterminants français — et le même garde traite un voyage, un
 * budget ou une présentation sans les connaître.
 *
 * Quand il refuse, il n'essaie pas de réparer : réécrire une question serait inventer un besoin.
 * Il rend le silence, et le plan profond tranche. Un doute se résout donc toujours du côté de
 * l'abstention, jamais de l'affichage.
 * ======================================================================== */

/** Types de sollicitation soumis à ce garde. Les autres passent inchangés. */
export const SOLICITING_TYPES = Object.freeze(['ASK_CLARIFICATION', 'ASK_CONFIRMATION']);

/** Ce que le garde peut conclure. Fermé, et sans aucun état OPRIE. */
export const SOLICITATION_VERDICTS = Object.freeze([
  'ALLOW', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'ALREADY_ANSWERED', 'ALREADY_SOLICITED',
  'MATERIAL_PRESENT', 'EMPTY'
]);

/**
 * QUAND UN MATÉRIAU EST LÀ, LE PLAN RAPIDE NE SOLLICITE PAS.
 *
 * Ce n'est pas une préférence, c'est une conséquence de ce que ce plan VOIT. Le plan rapide reçoit
 * la demande et la présence du matériau — jamais le matériau lui-même, par décision de coût et de
 * confidentialité. Il est donc structurellement incapable de juger si une précision est
 * déterminante : ce qui trancherait est précisément ce qu'il ne lit pas. Le plan profond, lui,
 * reçoit le matériau, et conserve l'autorité de demander.
 *
 * Mesuré sur le runtime réellement déployé : demande « Corrige ce texte en conservant le sens »
 * avec un matériau fourni, le modèle rapide a répondu « Quel texte souhaitez-vous que je
 * corrige ? » — il redemandait ce que la personne venait de coller. La consigne le lui interdisait
 * déjà en clair ; elle ne suffit pas. La borne est donc portée par le garde, qui ne dépend pas de
 * l'obéissance d'un modèle.
 */

/**
 * UNE sollicitation rapide par conversation, et pas deux.
 *
 * Le plan rapide existe pour acheter la PREMIÈRE interaction à bas prix. Une fois qu'une réponse a
 * été obtenue, juger si la demande est devenue exploitable n'est plus de son ressort : c'est
 * exactement l'autorité d'OPRIE. Mesuré sur un modèle de la classe réellement déployée, sans cette
 * borne, il reposait une question sur un tour où le plan profond construisait déjà le prompt.
 *
 * Ce n'est donc pas un quota de confort : c'est la frontière d'autorité rendue exécutoire. Si un
 * manque déterminant subsiste après la première réponse, le plan profond le verra et le demandera —
 * avec l'autorité pour le faire.
 */
export const FAST_MAX_SOLICITATIONS_PER_CONVERSATION = 1;

/** Combien de sollicitations rapides ont déjà été posées ET répondues dans cette conversation. */
export function countAnsweredSolicitations(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((entree) => String((entree && entree.question) || '').trim()
                     && String((entree && entree.answer) || '').trim()).length;
}

/** Interaction rendue quand la candidate est refusée : le silence, jamais une question réécrite. */
export const SILENT_INTERACTION = Object.freeze({
  type: 'WAIT_FOR_DEEP_VALIDATION',
  text: 'Validation approfondie nécessaire.'
});

/* Normalisation pour la comparaison d'identité seulement : casse et ponctuation, JAMAIS les
   accents — « où » et « ou » ne doivent pas se confondre dans l'analyse grammaticale. */
const identite = (valeur) => String(valeur || '')
  .normalize('NFKC').toLocaleLowerCase('fr')
  .replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();

const minuscule = (valeur) => String(valeur || '').normalize('NFKC').toLocaleLowerCase('fr');

/** Une question déjà posée ET répondue ne se repose pas. Comparaison d'identité, sans fournisseur. */
export function isRepeatedSolicitation(question, history = []) {
  const cle = identite(question);
  if (!cle) return false;
  return (Array.isArray(history) ? history : []).some(
    (entree) => identite(entree && entree.question) === cle && String((entree && entree.answer) || '').trim()
  );
}

/* Interrogatifs français. Grammaire, pas domaine. `où` garde son accent : sans lui, il deviendrait
   la conjonction `ou` et tout choix binaire serait compté comme une seconde question.
 *
 * `que`, `qui` et `quoi` sont ABSENTS, et c'est mesuré : « Quel texte souhaitez-vous QUE je
 * corrige ? » était refusée comme portant deux interrogations. Ces trois mots sont aussi des
 * conjonctions et des relatifs, omniprésents dans une phrase parfaitement atomique. Les compter
 * refusait de bonnes questions — exactement le défaut inverse de celui qu'on corrige ici. */
const INTERROGATIFS = /\b(?:quel|quelle|quels|quelles|combien|comment|où|quand|pourquoi|lequel|laquelle|lesquels|lesquelles)\b/gu;

/* Ce qui ouvre une SECONDE proposition : coordination ou ponctuation. Une interrogation séparée de
   la précédente par l'un de ces marqueurs est une question de plus ; à l'intérieur de la même
   proposition, c'est de la grammaire ordinaire. On lit l'intervalle entre deux interrogations, et
   non le seul mot qui précède : « Quel format, ET POUR quel public ? » coordonne deux besoins même
   si la coordination n'est pas collée au second interrogatif. */
const COORDINATION = /[,;:]|\bet\b|\bou\b|\bpuis\b|\bainsi que\b/u;

/* Déterminants français en tête de segment : ce qui signale un groupe nominal, donc un livrable
   nommé plutôt qu'une valeur d'une même dimension. Une préposition peut introduire le groupe sans
   en changer la nature — « par les jeux, par le sport, ou par les arts » énumère trois groupes
   nominaux exactement comme la même liste sans préposition. */
const PREPOSITION = '(?:par|pour|sur|sous|avec|sans|dans|vers|chez|en|à|au|aux|de|d[\'’])\\s+';
const DETERMINANT = new RegExp(
  `^(?:${PREPOSITION})?(?:un|une|des|du|de la|de l['’]|le|la|les|l['’])\\s+\\S`, 'u');

/**
 * Combien d'interrogations distinctes l'enveloppe porte-t-elle ?
 *
 * La première compte toujours. Les suivantes ne comptent que si elles OUVRENT une proposition —
 * après une coordination ou une ponctuation. C'est ce qui distingue « Quel est votre budget ET
 * COMBIEN de jours partez-vous ? », qui pose deux besoins, de « Quel texte souhaitez-vous que je
 * corrige ? », qui n'en pose qu'un.
 */
export function countInterrogations(texte) {
  const t = minuscule(texte);
  let compte = 0;
  let finPrecedente = 0;
  for (const m of t.matchAll(INTERROGATIFS)) {
    if (compte === 0) { compte = 1; finPrecedente = m.index + m[0].length; continue; }
    if (COORDINATION.test(t.slice(finPrecedente, m.index))) compte += 1;
    finPrecedente = m.index + m[0].length;
  }
  return Math.max(compte, (t.match(/\?/g) || []).length);
}

/** Combien d'alternatives nommées par un déterminant l'enveloppe énumère-t-elle ? */
export function countNamedAlternatives(texte) {
  const t = minuscule(texte);
  /* L'énumération vit après un deux-points quand il y en a un ; sinon on lit toute la phrase. */
  const corps = t.includes(':') ? t.slice(t.indexOf(':') + 1) : t;
  return corps
    .split(/,| ou /u)
    .map((segment) => segment.replace(/[?!.;]/gu, '').trim())
    .filter((segment) => DETERMINANT.test(segment))
    .length;
}

/**
 * Verdict structurel sur une sollicitation candidate. Aucun appel réseau, aucune réécriture.
 *
 * Les deux seuils employés ne sont pas des réglages de confort : ils séparent le singulier du
 * pluriel. Deux interrogations, c'est deux besoins. Trois alternatives nommées, c'est un catalogue —
 * deux restent un choix sur une même dimension, ce qu'une question atomique peut légitimement
 * proposer.
 */
export function assessSolicitation(candidate, history = [], materialPresent = false) {
  const texte = String((candidate && candidate.text) || '').trim();
  if (!texte) return 'EMPTY';
  if (materialPresent === true) return 'MATERIAL_PRESENT';
  if (isRepeatedSolicitation(texte, history)) return 'ALREADY_ANSWERED';
  if (countAnsweredSolicitations(history) >= FAST_MAX_SOLICITATIONS_PER_CONVERSATION) return 'ALREADY_SOLICITED';
  if (countInterrogations(texte) >= 2) return 'MULTIPLE_QUESTIONS';
  if (countNamedAlternatives(texte) >= 3) return 'CATALOGUE';
  return 'ALLOW';
}

/**
 * Garde du plan rapide. Synchrone, sans fournisseur : une candidate non sollicitante passe
 * inchangée ; une sollicitation non atomique devient le silence.
 */
export function guardFastSolicitation(candidate, snapshot = {}) {
  if (!candidate) return candidate;
  if (!SOLICITING_TYPES.includes(candidate.type)) {
    /* UNE INTERACTION SANS TEXTE N'EST PAS UNE INTERACTION.
     *
     * Mesuré sur le runtime déployé : cinq demandes sur huit recevaient un HTTP 502
     * (FAST_SCHEMA_ERROR, « texte d'interaction vide »). Le modèle rapide concluait correctement
     * qu'il n'y avait rien à demander, puis rendait ce type avec un texte vide — le schéma exige
     * les deux champs, la réponse était donc refusée et la conclusion perdue.
     *
     * Ici, rien n'est inventé : pour un type qui ne sollicite pas, le texte ne porte aucune
     * information de la personne ni du modèle — c'est une formule d'attente. Une sollicitation
     * vide, elle, reste refusée par `assessSolicitation` (verdict EMPTY) : on ne fabrique jamais
     * une question. */
    if (!String(candidate.text || '').trim()) return SILENT_INTERACTION;
    return candidate;
  }
  const verdict = assessSolicitation(candidate, snapshot.clarification_history, snapshot.material_present);
  return verdict === 'ALLOW' ? candidate : SILENT_INTERACTION;
}
