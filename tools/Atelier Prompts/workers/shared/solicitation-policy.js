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
  'ALLOW', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'ALREADY_ANSWERED', 'MATERIAL_PRESENT',
  'META_OUTPUT_QUESTION', 'EMPTY'
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

/* V2.1 — LE BUDGET D'UNE SEULE SOLLICITATION PAR CONVERSATION A ÉTÉ RETIRÉ, ET VOICI POURQUOI.
 *
 * Il avait été introduit au lot BETA-04 contre un sur-questionnement réel : à l'époque, une question
 * du plan rapide N'ARRÊTAIT PAS le plan profond, si bien qu'une seconde question pouvait s'afficher
 * pendant que le prompt se construisait déjà. La borne traitait ce symptôme.
 *
 * Depuis, la doctrine a changé deux fois : le court-circuit IA-04 fait qu'une question du plan rapide
 * arrête le tour, et V2 a fait du plan rapide LA boucle de clarification. La borne s'est alors
 * retournée contre le produit : mesuré sur le dialogue réel du propriétaire, elle faisait taire le
 * plan rapide dès la première réponse obtenue, et TOUTES les questions suivantes étaient produites
 * par le plan profond — environ vingt-cinq secondes chacune, pour demander une date ou un budget.
 *
 * Ce qui borne le questionnement n'est donc plus un quota, ce sont quatre choses qui, elles, restent
 * vraies : UNE question par tour (le schéma ne peut en porter qu'une), aucune répétition, aucune
 * question quand le matériau est là, et le critère de nécessité lui-même. Un quota ne savait pas
 * distinguer une question utile d'une question de confort ; il refusait les deux. */

/* ==========================================================================
 * LA QUESTION MÉTA — CE QUI DEMANDE À LA PERSONNE DE CONCEVOIR NOTRE SORTIE
 *
 * Mesuré en bêta réelle : après « Pour quel nombre de jours prévoyez-vous votre séjour ? », la
 * question suivante a été « Quel résultat principal souhaitez-vous obtenir ? ». Elle est atomique,
 * concrète en apparence, et pourtant fausse : elle demande à la personne de définir ce que nous
 * sommes chargés de concevoir. Le défaut n'est donc pas une phrase, c'est une CLASSE.
 *
 * CE QUI EST MESURÉ ICI, ET COMMENT. Pas une liste de mots interdits — une liste de mots serait
 * contournée par la première paraphrase et n'expliquerait rien. Deux signaux INDÉPENDANTS sont
 * croisés, et c'est leur conjonction qui décide :
 *
 *   A — la question INTERROGE SUR NOTRE SORTIE. Son objet grammatical est la production elle-même
 *       ou sa forme, ou son verbe est un verbe d'obtention sans objet du monde de la personne.
 *   B — la question DEMANDE UNE VARIABLE DU PROBLÈME. Une quantité, une durée, une date, un
 *       destinataire, un lieu, une échéance, une finalité, un moyen — quelque chose que la personne
 *       possède déjà et n'a qu'à dire.
 *
 * Une question est méta quand A est vrai ET B est faux. Si B est vrai, la question porte sur le
 * problème même lorsqu'elle emploie un mot de production : « Combien de pages doit faire le
 * document ? » demande une quantité, et passe. Si A est faux, il n'y a rien à refuser.
 *
 * L'EXCEPTION, ET ELLE COMPTE. Quand la demande elle-même porte sur la forme — elle nomme une
 * production, un format, une structure — alors interroger cette forme n'est plus méta : c'est le
 * sujet. Le même vocabulaire sert les deux directions, ce qui évite deux listes qui divergeraient.
 *
 * AUCUN DOMAINE. Les familles employées sont des mots de discours — production, obtention, quantité,
 * temps, personne, lieu, finalité. Elles traitent un voyage, un contrat ou un programme sans les
 * connaître, et aucune ne nomme un métier.
 * ======================================================================== */

/* A — le vocabulaire de NOTRE sortie. Générique : ce sont les mots par lesquels n'importe quel
 * domaine désigne « la chose produite », jamais un domaine particulier. */

/* A — les verbes par lesquels on demande à quelqu'un de décrire ce qu'il veut RECEVOIR. */

/* A — les tournures interrogatives qui portent sur la nature de la chose produite. */

/* B — ce qui fait qu'une question porte sur le problème de la personne. Uniquement des marqueurs
 * INTERROGATIFS de catégorie — quantité, temps, personne, lieu — et les chiffres. Aucune liste de
 * noms de situation : une première version en portait une, et ces mots-là, tout génériques qu'ils
 * soient, restent du vocabulaire de situation — le garde d'atomicité l'a refusée, à juste titre.
 * B n'en a pas besoin : il ne sert qu'à RATTRAPER une question qui nomme une production tout en
 * demandant une variable, et un interrogatif de catégorie suffit à le voir. */
/* La borne de gauche est une anti-lettre, pas `\b` : en JavaScript, `\b` est ASCII, et il ne se
 * déclenche donc pas devant « à » ou « où ». La forme ci-dessous traite les accents comme des
 * lettres, ce qu'ils sont.
 *
 * V2.2.1-D2B — « OU » N'EST PAS « OÙ », ET LE CONFONDRE ÉTEIGNAIT LE GARDE.
 *
 * Les formes non accentuées sont tolérées partout ailleurs ici — « a qui », « a quelle date » —
 * parce qu'un second mot lève l'ambiguïté. Pour ce jeton-ci, il n'y a pas de second mot, et la
 * forme non accentuée est une AUTRE unité de la langue : la conjonction. Mesuré : `« ceci ou
 * cela »` déclenchait ce signal, donc toute énumération finissant par « … ou autre chose ? »
 * rattrapait la question et annulait le verdict méta. Sur huit sorties profondes réelles, le garde
 * ne marquait plus rien. La tolérance est donc retirée POUR CE JETON, et pour lui seul. */

/**
 * A — LA QUESTION INTERROGE-T-ELLE NOTRE PROPRE SORTIE ?
 *
 * Ce prédicat cherchait la réponse dans les MOTS de la question : trois motifs de vocabulaire
 * croisés. Ils marchaient — D2B a mesuré qu'ils attrapaient trois défauts que rien d'autre
 * n'attrape — mais ils DEVINAIENT un sens que personne ne disait. Depuis V2.2.1-D2F1, l'auteur de
 * la question le déclare, et ce garde se contente de le lire.
 *
 * Il ne reçoit même plus le texte : il ne peut donc plus en juger, ni régresser vers un lexique.
 */
export function questionTargetsOwnOutput(questionFocus = null) {
  return questionFocus === 'output_specification';
}

/**
 * B — LA QUESTION PORTE-T-ELLE SUR LA SITUATION DE LA PERSONNE ?
 *
 * Même histoire, même remède. Ce prédicat servait à RATTRAPER une question qui nomme une production
 * tout en demandant une donnée réelle — « Combien de documents devez-vous fournir ? ». Le fait
 * déclaré rend ce rattrapage explicite au lieu de l'approcher par des marqueurs interrogatifs.
 */
export function questionAsksConcreteVariable(questionFocus = null) {
  return questionFocus === 'problem_or_user_context';
}

/**
 * LA DEMANDE PORTE-T-ELLE ELLE-MÊME SUR LA FORME DE CE QUI SERA PRODUIT ?
 *
 * Dernier prédicat de ce module à avoir deviné un sens. Il cherchait des tournures interrogatives
 * dans le texte de la demande — « quel type de… », « sous quelle forme… ». V2.2.1-D2D lui avait
 * déjà retiré la moitié du travail en lui donnant la nature de l'objectif ; V2.2.1-D2F2 lui donne
 * l'autre moitié, et le texte cesse de l'atteindre.
 *
 * Deux faits, deux raisons distinctes, mesurées distinctes : quand l'objectif EST de reprendre un
 * contenu pour le disposer autrement, la forme est le sujet ; quand la personne demande elle-même
 * comment présenter le résultat, elle l'est aussi. Sur trois demandes qui interrogent littéralement
 * la production, `objective_nature` vaut « other » les trois fois — c'est pourquoi il en fallait
 * deux, et non un.
 *
 * Sans fait, aucune exemption : on échoue fermé.
 */
export function requestIsAboutItsOwnForm({ objectiveNature = null, requestFocus = null } = {}) {
  return objectiveNature === 'transformation' || requestFocus === 'output_form_or_specification';
}

/**
 * Une question est-elle méta — c'est-à-dire demande-t-elle à la personne de concevoir notre sortie
 * alors qu'une variable de son problème pouvait être demandée à la place ?
 *
 * `demande` sert l'exception : quand la demande porte sur la forme, la question sur la forme est le
 * sujet, pas une dérobade.
 */
export function isMetaOutputQuestion(texte, faits = {}) {
  const t = String(texte || '').trim();
  if (!t) return false;
  const { questionFocus = null } = faits;
  /* Sans fait déclaré, on échoue FERMÉ : rien n'est accusé. Un garde qui accuserait sur un fait
     absent redeviendrait un juge du sens, ce que ce lot lui retire. */
  if (!questionTargetsOwnOutput(questionFocus)) return false;
  /* A et B sont désormais deux valeurs du MÊME champ : ce contrôle ne peut plus être vrai ici. Il
     est conservé parce qu'il dit l'invariant — une question qui porte sur la situation de la
     personne n'est jamais méta — et parce qu'un vocabulaire qui s'élargirait un jour devra le
     respecter encore. */
  if (questionAsksConcreteVariable(questionFocus)) return false;
  if (requestIsAboutItsOwnForm(faits)) return false;
  return true;
}

/** Interaction rendue quand la candidate est refusée : le silence, jamais une question réécrite. */
export const SILENT_INTERACTION = Object.freeze({
  type: 'WAIT_FOR_DEEP_VALIDATION',
  text: 'Validation approfondie nécessaire.'
});

/* Normalisation pour la comparaison d'identité seulement : casse et ponctuation, JAMAIS les
 * accents — « où » et « ou » ne doivent pas se confondre dans l'analyse grammaticale. */
const identite = (valeur) => String(valeur || '')
  .normalize('NFKC').toLocaleLowerCase('fr')
  .replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();

const minuscule = (valeur) => String(valeur || '').normalize('NFKC').toLocaleLowerCase('fr');

/** Une question déjà posée ET répondue ne se repose pas. Comparaison d'identité, sans fournisseur. */
export function isRepeatedSolicitation(question, history = [], missingDeterminantId = null) {
  const tours = (Array.isArray(history) ? history : []).filter((e) => String((e && e.answer) || '').trim());
  /* TRACER-REMEDIATION-02 · F5 — L'IDENTITÉ DU MANQUE D'ABORD, LE TEXTE ENSUITE.
   *
   * Mesuré en campagne produit : « Dans quelle juridiction votre application opère-t-elle
   * principalement ? » puis, au tour suivant, la même question augmentée de deux exemples entre
   * tirets. Deux textes différents, un seul manque. La comparaison d'identité textuelle — voulue, et
   * qui reste juste : deux formulations différentes SONT différentes — ne pouvait pas le voir.
   *
   * Ce qui le voit est un fait, pas une ressemblance : l'autorité nomme CE QUI manque, et réemploie
   * le même identifiant tant que la même chose manque. Aucun appariement flou n'est réintroduit —
   * la comparaison reste une ÉGALITÉ, elle porte simplement sur le bon objet. */
  const id = typeof missingDeterminantId === 'string' ? missingDeterminantId.trim() : '';
  if (id && tours.some((e) => typeof e.missing_determinant_id === 'string' && e.missing_determinant_id.trim() === id)) {
    return true;
  }
  /* Le contrôle historique subsiste, et il sert encore : un historique écrit avant ce lot ne porte
     aucune identité, et une question reposée mot pour mot doit toujours être reconnue. */
  const cle = identite(question);
  if (!cle) return false;
  return tours.some((entree) => identite(entree && entree.question) === cle);
}

/* Interrogatifs français. Grammaire, pas domaine. `où` garde son accent : sans lui, il deviendrait
 * la conjonction `ou` et tout choix binaire serait compté comme une seconde question.
 *
 * `que`, `qui` et `quoi` sont ABSENTS, et c'est mesuré : « Quel texte souhaitez-vous QUE je
 * corrige ? » était refusée comme portant deux interrogations. Ces trois mots sont aussi des
 * conjonctions et des relatifs, omniprésents dans une phrase parfaitement atomique. Les compter
 * refusait de bonnes questions — exactement le défaut inverse de celui qu'on corrige ici. */
const INTERROGATIFS = /\b(?:quel|quelle|quels|quelles|combien|comment|où|quand|pourquoi|lequel|laquelle|lesquels|lesquelles)\b/gu;

/* Ce qui ouvre une SECONDE proposition : coordination ou ponctuation. Une interrogation séparée de
 * la précédente par l'un de ces marqueurs est une question de plus ; à l'intérieur de la même
 * proposition, c'est de la grammaire ordinaire. On lit l'intervalle entre deux interrogations, et
 * non le seul mot qui précède : « Quel format, ET POUR quel public ? » coordonne deux besoins même
 * si la coordination n'est pas collée au second interrogatif. */
const COORDINATION = /[,;:]|\bet\b|\bou\b|\bpuis\b|\bainsi que\b/u;

/* Verbe inversé : ce qui ouvre une interrogation sans mot interrogatif — « avez-vous », « faut-il »,
 * « souhaitez-vous ». Les pronoms sont clos ; aucun mot de domaine n'entre ici. */
const VERBE_INVERSE = /\b[a-zà-ÿ]+-(?:vous|tu|il|elle|on|ils|elles|je|nous)\b/gu;

/* Ce qui AJOUTE un besoin plutôt que d'offrir une branche du même : « ou » en est exclu. */
const AJOUTE_UN_BESOIN = /(?:[,;]|\bet\b|\bpuis\b|\bainsi que\b)(?:(?!\bou\b)[^,;])*$/u;

/* Déterminants français en tête de segment : ce qui signale un groupe nominal, donc un livrable
 * nommé plutôt qu'une valeur d'une même dimension. Une préposition peut introduire le groupe sans
 * en changer la nature — « par les jeux, par le sport, ou par les arts » énumère trois groupes
 * nominaux exactement comme la même liste sans préposition. */
const PREPOSITION = '(?:par|pour|sur|sous|avec|sans|dans|vers|chez|en|à|au|aux|de|d[\'’])\\s+';
/* Une tête interrogative nomme la dimension avant le deux-points. AUCUN vocabulaire n'est ajouté
   ici : c'est la liste d'interrogatifs qui existe déjà. On la relit sans son drapeau global —
   `test()` sur une expression globale est à état, et rendrait ce contrôle dépendant de l'appel
   précédent — en la reconstruisant à partir de son motif, sans le recopier. */
const INTERROGATIFS_TETE = new RegExp(String(INTERROGATIFS).replace(/^\/|\/[a-z]*$/g, ''), 'u');

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
   * « Quel est le délai prévu ET AVEZ-VOUS déjà identifié un logement ? » porte deux besoins, et le
   * comptage ci-dessus n'en voyait qu'un : la seconde proposition est à verbe inversé. Mesuré sur le
   * runtime déployé, cette question est passée.
*
   * « ou » est traité à part, et volontairement : il offre le plus souvent les deux branches d'UNE
   * décision — « Disposez-vous déjà du contenu, OU faut-il le structurer ? » est un seul besoin.
   * « et », une virgule ou un point-virgule, eux, ajoutent un besoin. */
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
export function assessSolicitation(candidate, history = [], materialPresent = false, faits = {}) {
  const texte = String((candidate && candidate.text) || '').trim();
  if (!texte) return 'EMPTY';
  if (materialPresent === true) return 'MATERIAL_PRESENT';
  if (isMetaOutputQuestion(texte, { ...faits, questionFocus: candidate && candidate.question_focus })) return 'META_OUTPUT_QUESTION';
  /* F5 — la candidate porte l'identité du manque qu'elle vise ; c'est elle qu'on compare. */
  if (isRepeatedSolicitation(texte, history, candidate && candidate.missing_determinant_id)) return 'ALREADY_ANSWERED';
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
  /* V2.2.1-D2F2 — le plan rapide ne porte ni la nature de l'objectif ni ce sur quoi porte la
     demande : aucun fait, donc aucune exemption. Au pire un silence, donc une escalade. */
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
 *   NOT_DISPLAYABLE plus rien n'est récupérable — la frontière le CONSTATE, et n'écrit rien.
 *
 * Ce garde ne touche ni l'état, ni la readiness, ni le contrat canonique : OPRIE reste seule
 * autorité sur ce qu'il faut demander. Il contraint la FORME de ce qui est affiché, et rien d'autre.
 * ======================================================================== */

/** Ce que la frontière peut conclure. Fermé. */
/* FINAL-TARGETED-FIX — « REDUCED » a disparu, et c'est le sujet de ce lot.
   Une question pouvait être COUPÉE après sa génération pour la rendre acceptable : le texte
   affiché perdait une partie de ce que l'autorité avait écrit, tandis que les métadonnées — ce que
   la question interroge, le manque qu'elle vise, la progression promise — restaient celles de la
   question ENTIÈRE. On montrait donc une moitié de question sous l'identité de l'autre.
   Une question est désormais acceptée, remplacée par une AUTRE question complète de l'autorité, ou
   refusée. Jamais raccourcie. */
export const DISPLAY_VERDICTS = Object.freeze(['ALLOW', 'REPLACED', 'NOT_DISPLAYABLE']);

/*
 * IL N'Y A PLUS DE QUESTION DE REPLI, ET C'EST LE POINT D'ARRIVÉE DE TOUT CE TRAVAIL.
 *
 * Une constante vivait ici : « Qu'est-ce qui est le plus important pour vous ici ? ». Quand plus
 * rien n'était récupérable, la frontière l'affichait. Un garde de FORME devenait alors l'auteur de
 * ce qui était DEMANDÉ à la personne — exactement ce que la Directive Maître interdit.
 *
 * V2.2.1-D2 avait déjà tenté de la retirer et avait dû reculer : sur le plan profond, l'état
 * `clarification_required` exige un texte de question, et le supprimer laissait passer à l'écran la
 * mauvaise question que l'on venait de refuser. Le lot n'a pu aboutir qu'une fois D2B et D2D passés,
 * et parce que le chemin de sortie existait DÉJÀ, sans qu'il faille l'inventer : le client teste
 * `if(!question)` et bascule sur son repli technique, dont le type d'erreur est littéralement
 * `transport_or_contract`. Une question non affichable EST une défaillance de contrat, et elle est
 * rejouable.
 *
 * Mesuré avant de livrer : sur six tours profonds réels, cet échelon tombe UNE fois. Le prix est
 * donc réel et il est nommé — sur ce tour-là, la personne verra un échec rejouable au lieu d'une
 * question fabriquée. C'est le choix du propriétaire produit, et il est le bon : une absence de
 * question vaut mieux qu'une question dont personne n'est l'auteur.
 */

/**
 * COMBIEN DE MANQUES DISTINCTS CETTE QUESTION VISE-T-ELLE ?
 *
 * TARGETED-FIX-POST-CODEX-01 — CE QUI EST COMPTÉ A CHANGÉ DE NATURE.
 *
 * On comptait des SEGMENTS — virgules, « et », « ou » — et l'on refusait à partir de trois. Le
 * contre-audit a produit deux contre-exemples qui renversent ce compte dans les deux sens :
 *
 *   « Quel jour préférez-vous : lundi, mardi ou mercredi ? »   UNE dimension — refusée à tort
 *   « Quel est votre budget et la durée du séjour ? »          DEUX dimensions — acceptée à tort
 *
 * Le nombre de virgules ne dit rien du nombre de manques. Ce qui le dit tient en deux distinctions
 * grammaticales, et aucune n'est un lexique :
 *
 *   — « ou » OFFRE un choix À L'INTÉRIEUR d'une dimension ; « et » AJOUTE une dimension ;
 *   — un groupe DÉTERMINÉ est une dimension ; un groupe nu est une apposition ou une valeur.
 *
 * La seconde distinction n'est pas inventée ici : `countNamedAlternatives` s'en sert déjà pour
 * séparer un catalogue de livrables hétérogènes d'un simple choix. On l'applique à la conjonction.
 *
 * La borne devient 2, et elle cesse d'être un réglage de confort : deux manques, ce sont deux
 * questions — c'est une définition, pas un seuil.
 */
export function countTargetedDimensions(texte) {
  const t = minuscule(texte);
  /* (a) CONJONCTION. Un segment ne compte que s'il porte un DÉTERMINANT : c'est ce qui sépare une
     dimension d'une apposition : un groupe introduit par une préposition sans article précise le
     groupe de tête, il n'en ajoute pas un second ; deux groupes ARTICULÉS coordonnés, si. */
  const conjoints = /\s+(?:et|ainsi que)\s+/u.test(t)
    ? t.split(/\s+et\s+|\s+ainsi que\s+|,/u)
        .map((segment) => segment.replace(/[?!.;:]/gu, '').trim())
        .filter((segment) => DETERMINANT.test(segment))
    : [];
  /* `DETERMINANT` est ANCRÉ : il ne reconnaît un groupe que s'il COMMENCE par un article. Le groupe
     de tête ne commence jamais ainsi — il commence par l'interrogatif, « quel est… », « quels
     sont… » — et il porte pourtant la première dimension. Il est donc compté avec les autres, et
     seulement quand une conjonction en a effectivement ajouté : sans second groupe déterminé, il
     n'y a qu'un manque, et « et » ne coordonnait pas deux dimensions. */
  const parConjonction = conjoints.length ? conjoints.length + 1 : 0;

  /* (b) ÉNUMÉRATION INTRODUITE par un deux-points ou un tiret long. Elle ne compte que si elle
     n'est PAS disjonctive : une liste reliée par « ou » propose plusieurs valeurs d'UNE dimension.
     Sans « ou », la liste ajoute des besoins. */
  const tiret = t.search(/\s[—–]\s/u);
  const introduit = t.includes(':') ? t.slice(t.indexOf(':') + 1) : (tiret >= 0 ? t.slice(tiret + 1) : '');
  const segments = introduit && !/\bou\b/u.test(introduit)
    ? introduit.split(/,|\s+et\s+/u).map((x) => x.replace(/[?!.;]/gu, '').trim()).filter(Boolean)
    : [];
  /* Deux segments NUS qui suivent un tiret précisent la dimension de tête au lieu d'en ajouter une.
     À partir de trois, ce n'est plus une précision, c'est une liste de besoins. La conjonction
     ARTICULÉE, elle, se juge dès deux : c'est le déterminant qui donne cette précision-là. */
  const parEnumeration = segments.length >= 3 ? segments.length : 0;

  /* (c) LISTE DISJONCTIVE SANS TÊTE. Une question qui EST la liste, au lieu de la proposer comme
     valeurs d'une dimension qu'elle a nommée, est le catalogue mesuré en bêta. La différence est
     une position : quand un deux-points sépare une TÊTE INTERROGATIVE de la liste, la tête nomme la
     dimension et la liste en donne les valeurs — une seule question. Sans cette tête, la liste ne
     précise rien : elle énumère des choses à produire, et la borne historique de trois s'applique. */
  const teteInterrogative = t.includes(':') && INTERROGATIFS_TETE.test(t.slice(0, t.indexOf(':')));
  const disjoints = !teteInterrogative && /\bou\b/u.test(t)
    ? t.split(/,|\s+ou\s+/u).map((x) => x.replace(/[?!.;:]/gu, '').trim()).filter(Boolean)
    : [];
  const parCatalogue = disjoints.length >= 3 ? disjoints.length : 0;

  return Math.max(parConjonction, parEnumeration, parCatalogue);
}

/* Une parenthèse qui énumère offre plusieurs dimensions dans la même question, même quand la tête
 * interrogative est parfaite. Mesuré sur le runtime déployé : « Quel type de X souhaitez-vous
 * produire (format, contenu, objectif…) ? ». Une parenthèse sans virgule, elle, précise ; elle
 * n'énumère pas. */
const PARENTHESE_ENUMERANTE = /\([^)]*,[^)]*\)/u;

/** Une question est-elle d'une forme affichable ? Quatre mesures, toutes grammaticales. */
export function isAtomicQuestion(texte) {
  const t = String(texte || '').trim();
  if (!t) return false;
  return countInterrogations(t) < 2
      && countNamedAlternatives(t) < 3
      && countTargetedDimensions(t) < 2
      && !PARENTHESE_ENUMERANTE.test(t);
}

/* -------------------------------------------------------------------------
 * LA RÉDUCTION DÉTERMINISTE A ÉTÉ RETIRÉE — FINAL-TARGETED-FIX
 *
 * `reduceQuestionDeterministically` vivait ici. Elle coupait une question refusée pour en garder la
 * tête interrogative : devant un deux-points, devant une coordination, devant une parenthèse qui
 * énumère, ou à la fin de la première phrase interrogative. Chaque mot du résultat venait bien de
 * la question d'origine — c'est ce qui la faisait paraître inoffensive.
 *
 * Elle ne l'était pas. Ce qu'elle produisait était une question que PERSONNE n'avait écrite, et
 * elle repartait avec les métadonnées de la question entière : l'identité du manque, l'inconnue
 * visée, la progression annoncée décrivaient alors autre chose que ce que la personne lisait. Sur
 * le plan rapide, elle faisait pire — le texte coupé repartait sans aucune métadonnée du tout.
 *
 * Une question est désormais acceptée telle quelle, remplacée par une autre question COMPLÈTE de
 * l'autorité, ou refusée. Rien ne la réécrit après sa génération. Le prix est assumé : quand aucune
 * candidate ne vaut, le tour est déclaré inexploitable au lieu d'afficher une moitié de question.
 * ---------------------------------------------------------------------- */


/**
 * LA PORTE UNIQUE. Toute question affichée passe ici, quelle qu'en soit la source — plan rapide,
 * Analyste, Critique, Arbitre, repli, mode dégradé, reprise.
 *
 * `candidates` sont les autres questions que le MÊME tour a produites. Les employer n'invente rien :
 * ce sont des questions que le système jugeait déjà pertinentes.
 */
/* ==========================================================================
 * V2.1.5 — LE PLAN RAPIDE RÉDUIT CE QU'IL SAIT RÉDUIRE, AU LIEU DE SE TAIRE.
 *
 * CE QUE LA MESURE A ÉTABLI, ET ELLE RENVERSE UNE HYPOTHÈSE. Sur les trois demandes du propriétaire,
 * le relevé `fast_decision` ne montre JAMAIS `MODEL_RETURNED_WAIT` : le modèle propose une question à
 * chaque fois. C'est le verdict `MULTIPLE_QUESTIONS` qui la fait taire, et le tour part alors vers le
 * plan profond — vingt à soixante secondes pour obtenir une question que le plan rapide avait déjà
 * formulée, à un besoin près.
 *
 * L'ASYMÉTRIE QUI EN ÉTAIT LA CAUSE. La frontière d'affichage sait depuis BETA-04 COUPER une question
 * qui porte deux besoins — elle garde la tête interrogative et abandonne le reste, sans rien inventer,
 * chaque mot venant du texte d'origine. Le plan rapide, lui, ne savait que refuser. Deux mesures de
 * l'atomicité coexistaient donc, et la plus pauvre décidait la plus coûteuse.
 *
 * CE QUI EST COMPOSÉ ICI, ET DANS QUEL ORDRE. D'abord les verdicts SÉMANTIQUES — un matériau déjà
 * fourni, une question déjà répondue, une question qui demande à la personne de concevoir notre
 * sortie : ceux-là ne se réparent pas, ils se taisent. Ensuite, et seulement pour les défauts de
 * FORME, la réduction. Le repli générique de la frontière n'est JAMAIS employé ici : fabriquer une
 * question sur le chemin rapide serait inventer un besoin.
 *
 * `guardFastSolicitation` n'est pas modifiée : elle reste la fonction de verdict, et les tests qui la
 * protègent restent vrais. Ce qui change est la COMPOSITION, au niveau du plan.
 * ======================================================================== */

/** Ce qui ne se répare pas : un besoin déjà satisfait, ou une question qui n'est pas la nôtre à poser. */
const VERDICTS_SANS_REMEDE = Object.freeze([
  'EMPTY', 'MATERIAL_PRESENT', 'ALREADY_ANSWERED', 'META_OUTPUT_QUESTION'
]);

export function guardFastInteraction(candidate, snapshot = {}) {
  if (!candidate) return candidate;
  if (!SOLICITING_TYPES.includes(candidate.type)) return guardFastSolicitation(candidate, snapshot);
  const verdict = assessSolicitation(candidate, snapshot.clarification_history,
    snapshot.material_present, snapshot.original_request);
  if (VERDICTS_SANS_REMEDE.includes(verdict)) return SILENT_INTERACTION;
  /* TOUTE question rapide passe ensuite par la frontière d'affichage — y compris celle que les
   * verdicts ont laissée passer. Deux raisons, et la seconde a été trouvée en validant : cette
   * question EST affichée, donc elle relève de la frontière ; et la frontière mesure des défauts que
   * les verdicts ne mesurent pas — une énumération sans déterminants, une parenthèse qui énumère.
   * Sans ce passage, un catalogue traversait le plan rapide alors que le plan profond le refusait.
   * Une seule définition de l'atomicité, appliquée partout. */
  const garde = guardDisplayedQuestion(String(candidate.text || ''), { questionFocus: candidate.question_focus });
  if (garde.verdict === 'ALLOW') return candidate;
  /* FINAL-TARGETED-FIX — LA BRANCHE RÉDUITE EST RETIRÉE, ET ELLE COÛTAIT PLUS QUE LE SENS.
   *
   * Elle rendait `{ type, text }` : le texte coupé repartait SANS `question_focus` ni
   * `missing_determinant_id`. Les deux faits que le plan rapide venait d'apprendre à produire —
   * ce que la question interroge, et le manque qu'elle vise — étaient perdus par ce seul chemin,
   * et avec eux le garde méta et la protection contre la répétition. Un défaut refermé en amont
   * rouvert en aval, sans que rien ne le voie.
   *
   * Le silence reste l'issue, et il est déjà traitée : le plan profond tranche. */
  return SILENT_INTERACTION;
}

export function guardDisplayedQuestion(texte, { candidates = [], objectiveNature = null, requestFocus = null, questionFocus = null, history = [], missingDeterminantId = null } = {}) {
  /* TRACER-REMEDIATION-02 · F5 — UN MANQUE DÉJÀ SOLLICITÉ N'EST PLUS AFFICHABLE.
   *
   * L'identité du manque était produite par l'autorité, conservée dans l'historique, et consultée
   * par `assessSolicitation` — donc sur le plan rapide seulement. La frontière profonde, elle, ne
   * jugeait que la FORME : atomique, non méta. Mesuré au replay : « Quels sont les noms et prénoms
   * des trois finalistes ? » reposée trois tours de suite, avec le MÊME identifiant
   * `identite_finalistes` à chaque fois. Le fait était là, personne ne le lisait.
   *
   * Il est lu ici, par la fonction qui existait déjà, et la comparaison reste une égalité stricte. */
  /* TARGETED-FIX-POST-CODEX-01 — LE SECOURS TEXTUEL ÉTAIT DÉBRANCHÉ.
   *
   * Ce raccord passait une chaîne VIDE comme texte de question : `isRepeatedSolicitation('', …)`
   * sort aussitôt sur `if (!cle) return false`. Le repli d'égalité textuelle — celui qui protège un
   * historique sans identité, et qui reconnaît une question reposée mot pour mot — ne s'exécutait
   * donc JAMAIS depuis la frontière profonde. Seule l'identité agissait, et une question sans
   * identité passait même à l'identique.
   *
   * Le texte est transmis. Ce repli reste ce qu'il a toujours été : une ÉGALITÉ exacte, jamais une
   * ressemblance — aucun seuil, aucune distance, aucun synonyme. */
  const affichable = (q, focus, id) => isAtomicQuestion(q)
    && !isMetaOutputQuestion(q, { objectiveNature, requestFocus, questionFocus: focus })
    && !isRepeatedSolicitation(q, history, id);
  const t = String(texte || '').trim();
  if (affichable(t, questionFocus, missingDeterminantId)) return { verdict: 'ALLOW', text: t };
  /* Chaque candidate porte SON propre fait : on ne lui applique jamais celui d'une autre question. */
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const autre = String((candidate && candidate.text) || candidate || '').trim();
    const focusAutre = candidate && typeof candidate === 'object' ? candidate.question_focus : null;
    const idAutre = candidate && typeof candidate === 'object' ? candidate.missing_determinant_id : null;
    /* TARGETED-FIX-POST-CODEX-01 — ON REMPLACE UNE QUESTION, PAS UN TEXTE.
       Le garde ne rendait que `text`, et l'appelant recollait ce texte sur l'objet d'origine : la
       question affichée interrogeait un manque pendant que son identité en désignait un autre. Le
       verdict porte donc la CANDIDATE ENTIÈRE, et l'appelant la substitue telle quelle. */
    if (autre && autre !== t && affichable(autre, focusAutre, idAutre)) {
      return { verdict: 'REPLACED', text: autre,
        candidate: candidate && typeof candidate === 'object' ? candidate : null };
    }
  }
  /* FINAL-TARGETED-FIX — PLUS AUCUNE RÉDUCTION ICI.
   *
   * Une troisième issue existait : couper la question pour la rendre affichable. Reproduit —
   * « Quel est le premier paramètre et le second ? » devenait « Quel est le premier paramètre ? »,
   * et repartait avec l'identité, l'inconnue visée et la progression de la question entière. Le
   * texte montré et l'identité montrée ne décrivaient plus le même manque, ce que le lot précédent
   * venait précisément d'interdire pour le remplacement.
   *
   * Couper n'est pas choisir : le résultat est une question que personne n'a écrite. Les seules
   * issues sont donc celles qui viennent de l'autorité — sa question, ou l'une de ses candidates. */
  /* Rien d'affichable, et rien d'inventé : `text` vaut null, et chaque appelant a déjà son
     issue — le silence sur le plan rapide, le repli de contrat sur le plan profond. */
  return { verdict: 'NOT_DISPLAYABLE', text: null };
}
