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

/* Verbe inversé : ce qui ouvre une interrogation sans mot interrogatif — « avez-vous », « faut-il »,
   « souhaitez-vous ». Les pronoms sont clos ; aucun mot de domaine n'entre ici. */
const VERBE_INVERSE = /\b[a-zà-ÿ]+-(?:vous|tu|il|elle|on|ils|elles|je|nous)\b/gu;

/* Ce qui AJOUTE un besoin plutôt que d'offrir une branche du même : « ou » en est exclu. */
const AJOUTE_UN_BESOIN = /(?:[,;]|\bet\b|\bpuis\b|\bainsi que\b)(?:(?!\bou\b)[^,;])*$/u;

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
  /* UNE PROPOSITION INTERROGATIVE N'A PAS BESOIN D'UN MOT INTERROGATIF.
     « Quel est le délai prévu ET AVEZ-VOUS déjà identifié un logement ? » porte deux besoins, et le
     comptage ci-dessus n'en voyait qu'un : la seconde proposition est à verbe inversé. Mesuré sur le
     runtime déployé, cette question est passée.

     « ou » est traité à part, et volontairement : il offre le plus souvent les deux branches d'UNE
     décision — « Disposez-vous déjà du contenu, OU faut-il le structurer ? » est un seul besoin.
     « et », une virgule ou un point-virgule, eux, ajoutent un besoin. */
  if (compte < 2) {
    for (const m of t.matchAll(VERBE_INVERSE)) {
      if (m.index === 0) continue;
      if (AJOUTE_UN_BESOIN.test(t.slice(0, m.index))) { compte = Math.max(compte, 2); break; }
    }
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

/* ==========================================================================
 * LA FRONTIÈRE D'AFFICHAGE — AUCUNE QUESTION N'Y ÉCHAPPE
 *
 * Ce qui précède ne gardait que le plan rapide. Le propriétaire a mesuré le défaut deux fois en bêta
 * réelle : après plus de soixante-dix secondes d'attente, la question affichée énumérait plusieurs
 * productions possibles et demandait de choisir. Les deux textes exacts sont conservés dans
 * `tests/beta04-stabilization.test.mjs` (T04-22) : c'est là qu'est la preuve, pas ici.
 *
 * ORIGINE ÉTABLIE PAR MESURE, non supposée : cette question est écrite par l'ANALYSTE, dans
 * `question_candidates`, puis recopiée par l'ARBITRE dans `next_question`. Le garde du plan rapide
 * la reconnaissait déjà — il ne tournait simplement jamais sur cette sortie. L'atomicité était
 * gardée à une porte, et la personne entrait par l'autre.
 *
 * FAIT DÉCISIF : le même tour portait AUSSI une candidate atomique. Le système fabriquait donc la
 * bonne question ; il affichait la mauvaise. La réduction n'a rien à inventer : elle choisit, parmi
 * ce que le système a déjà produit.
 *
 * Quatre issues, dans cet ordre, et aucune n'appelle un modèle :
 *
 *   ALLOW        la question est atomique — elle passe, à l'octet près ;
 *   REPLACED     une autre candidate du même tour est atomique — on l'affiche ;
 *   REDUCED      la question porte sa propre forme atomique en tête — on coupe le catalogue ;
 *   FALLBACK_SAFE plus rien n'est récupérable — on pose la question la plus générale qui soit.
 *
 * Ce garde ne touche ni l'état, ni la readiness, ni le contrat canonique : OPRIE reste seule
 * autorité sur ce qu'il faut demander. Il contraint la FORME de ce qui est affiché, et rien d'autre.
 * ======================================================================== */

/** Ce que la frontière peut conclure. Fermé. */
export const DISPLAY_VERDICTS = Object.freeze(['ALLOW', 'REPLACED', 'REDUCED', 'FALLBACK_SAFE']);

/**
 * La question la plus générale qui reste une question : elle demande ce qu'il faut produire, sans
 * proposer aucune production. Employée seulement quand rien d'atomique n'est récupérable — mieux
 * qu'un catalogue, et mieux qu'un silence là où OPRIE a établi qu'une clarification est nécessaire.
 */
export const SAFE_FALLBACK_QUESTION = 'Quel résultat principal souhaitez-vous obtenir ?';

/**
 * Une énumération de choix n'a pas besoin de déterminants pour être un catalogue.
 *
 * Une énumération peut ne porter que des noms nus, et rester exactement le défaut visé. Ce qui le
 * signe est la conjonction de deux choses : un marqueur de choix offert — un deux-points, ou un
 * « ou » — ET trois segments au moins. Une virgule d'apposition sans marqueur de choix, elle, ne
 * compte pas : « Quel est le délai, en semaines, pour ce projet ? » est une seule question.
 */
export function countEnumeratedSegments(texte) {
  const t = minuscule(texte);
  if (!t.includes(':') && !/\bou\b/u.test(t)) return 0;
  const corps = t.includes(':') ? t.slice(t.indexOf(':') + 1) : t;
  return corps
    .split(/,| ou /u)
    .map((segment) => segment.replace(/[?!.;]/gu, '').trim())
    .filter((segment) => segment.length > 0)
    .length;
}

/* Une parenthèse qui énumère offre plusieurs dimensions dans la même question, même quand la tête
   interrogative est parfaite. Mesuré sur le runtime déployé : « Quel type de X souhaitez-vous
   produire (format, contenu, objectif…) ? ». Une parenthèse sans virgule, elle, précise ; elle
   n'énumère pas. */
const PARENTHESE_ENUMERANTE = /\([^)]*,[^)]*\)/u;

/** Une question est-elle d'une forme affichable ? Quatre mesures, toutes grammaticales. */
export function isAtomicQuestion(texte) {
  const t = String(texte || '').trim();
  if (!t) return false;
  return countInterrogations(t) < 2
      && countNamedAlternatives(t) < 3
      && countEnumeratedSegments(t) < 3
      && !PARENTHESE_ENUMERANTE.test(t);
}

/**
 * Réduction DÉTERMINISTE : garder la tête interrogative, abandonner ce qui l'encombre.
 *
 * Deux coupes, et rien de plus. Devant un deux-points, l'énumération vit après : on garde ce qui est
 * devant. Devant deux propositions coordonnées, on garde la première. Le résultat n'est accepté que
 * s'il est lui-même atomique et s'il reste une question — sinon la réduction échoue, et c'est le
 * repli qui parle. On ne recolle jamais des morceaux : on coupe, ou on renonce.
 */
export function reduceQuestionDeterministically(texte) {
  const t = String(texte || '').trim();
  if (!t) return null;
  const essais = [];
  /* Première coupe, la moins destructrice : retirer la parenthèse qui énumère. La question garde
     tous ses mots utiles, et perd seulement les dimensions qu'elle proposait. */
  if (PARENTHESE_ENUMERANTE.test(t)) {
    essais.push(t.replace(/\s*\([^)]*,[^)]*\)/gu, '').replace(/\s{2,}/gu, ' '));
  }
  const deuxPoints = t.indexOf(':');
  if (deuxPoints > 0) essais.push(t.slice(0, deuxPoints));
  const coupe = t.search(/(?:,\s*(?:et|ou)\b|\s+et\b|\s+—\s+par exemple)/u);
  if (coupe > 0) essais.push(t.slice(0, coupe));
  for (const essai of essais) {
    const tete = `${essai.replace(/[\s,;:—?-]+$/u, '')} ?`;
    /* Une tête trop courte n'est plus une question, c'est un fragment. */
    if (tete.split(/\s+/u).length < 4) continue;
    /* Un deux-points survivant annonce encore une énumération : la coupe a manqué son objet. */
    if (tete.includes(':')) continue;
    /* Et couper le « ou » final d'une énumération n'en retire que le marqueur, jamais l'énumération
       elle-même. Deux virgules suffisent à la reconnaître, sans rien connaître du sujet. */
    if ((tete.match(/,/gu) || []).length >= 2) continue;
    if (isAtomicQuestion(tete)) return tete;
  }
  return null;
}

/**
 * LA PORTE UNIQUE. Toute question affichée passe ici, quelle qu'en soit la source — plan rapide,
 * Analyste, Critique, Arbitre, repli, mode dégradé, reprise.
 *
 * `candidates` sont les autres questions que le MÊME tour a produites. Les employer n'invente rien :
 * ce sont des questions que le système jugeait déjà pertinentes.
 */
export function guardDisplayedQuestion(texte, { candidates = [] } = {}) {
  const t = String(texte || '').trim();
  if (isAtomicQuestion(t)) return { verdict: 'ALLOW', text: t };
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const autre = String((candidate && candidate.text) || candidate || '').trim();
    if (autre && autre !== t && isAtomicQuestion(autre)) return { verdict: 'REPLACED', text: autre };
  }
  const reduite = reduceQuestionDeterministically(t);
  if (reduite) return { verdict: 'REDUCED', text: reduite };
  return { verdict: 'FALLBACK_SAFE', text: SAFE_FALLBACK_QUESTION };
}
