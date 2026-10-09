// FALSIFICATION DES CONTRÔLES DU LOT 1b.
//
// Un test qui passe ne prouve rien tant qu'on n'a pas montré qu'il échoue quand il le doit.
// Chaque mutation retire exactement UN contrôle, relance le test, et exige qu'il ÉCHOUE. Les
// fichiers sont restaurés après chaque essai et leurs empreintes vérifiées à la fin.
//
//   NODE_PATH=<playwright> node tests/falsifier-narration-ia.cjs
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const FICHIERS = {
  module: path.join(RACINE, 'narration-ia.js'),
  coeur: path.join(RACINE, 'studio-clinique-core.js'),
};
const original = {}, empreinteAvant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = crypto.createHash('sha256').update(original[k]).digest('hex');
});

const ESSAIS = [
  // ── Le compte des mots ────────────────────────────────────────────────────────────────────
  { nom: 'les marques de pause redeviennent des mots',
    fichier: 'coeur',
    de: '    const mots = adocNarrationSansPauses(text).trim().split(/\\s+/).filter(Boolean).length;',
    vers: '    const mots = String(text || \'\').trim().split(/\\s+/).filter(Boolean).length;',
    attendu: 'la durée annoncée compte un silence comme un mot (CDC R8)' },

  { nom: 'le module se remet à compter les mots lui-même',
    fichier: 'module',
    de: "    if (typeof window.adocNarrationCount === 'function') return window.adocNarrationCount(texte).mots;",
    vers: "    if (false) return window.adocNarrationCount(texte).mots;",
    attendu: 'deux compteurs pour le même texte : l\'aperçu et le champ divergent' },

  // ── La répartition ────────────────────────────────────────────────────────────────────────
  { nom: 'le plafond par étape ne s\'applique plus',
    fichier: 'module',
    de: '        else if (cibles[i] > max) { dette += cibles[i] - max; cibles[i] = max; fige[i] = true; }',
    vers: '        else if (false) { }',
    attendu: 'une étape peut recevoir dix minutes de texte à elle seule' },

  { nom: 'une durée inatteignable est annoncée atteignable',
    fichier: 'module',
    de: '      atteignable: Math.abs(ecart) <= etapes.length,     // l\'arrondi par étape, rien de plus',
    vers: '      atteignable: true,',
    attendu: '6,4 minutes livrées pour 10 demandées, sans un mot' },

  // ── Le budget de délai ────────────────────────────────────────────────────────────────────
  { nom: 'le budget de délai n\'est plus proportionnel',
    fichier: 'module',
    de: '    var brut = Math.ceil(BUDGET_MS_POUR_8000_JETONS * maxTokens / 8000);',
    vers: '    var brut = BUDGET_MS_POUR_8000_JETONS;',
    attendu: 'un nombre choisi au lieu d\'une règle appliquée' },

  // ── Le prompt système ─────────────────────────────────────────────────────────────────────
  // ── La relecture du 9 octobre : politique de violation, avertissements, total honnête ─────
  { nom: 'la longueur redevient bloquante',
    fichier: 'module',
    de: "      if (horsTolerance) {\n        longueurs.push(",
    vers: "      if (horsTolerance) {\n        violations.push(id + ' : longueur');\n        longueurs.push(",
    attendu: 'un second appel facturé pour un écart de sept pour cent' },

  { nom: 'le plancher de tolérance des titres repasse à 5 mots',
    fichier: 'module',
    de: "      var plancherEtape = (etape && etape.type === 'heading') ? TOLERANCE_PLANCHER_TITRE : plancher;",
    vers: "      var plancherEtape = plancher;",
    attendu: 'un titre refusé pour un mot d\'écart' },

  { nom: 'la ligne d\'état réaffiche la CIBLE comme total',
    fichier: 'module',
    de: "          + '\\n' + res.mots_recus + ' mots reçus, cible ' + r.total_reparti + ', '",
    vers: "          + '\\n' + r.total_reparti + ' mots reçus, cible ' + r.total_reparti + ', '",
    attendu: 'le défaut du 9 octobre : 1197 annoncés pour 1109 reçus' },

  { nom: 'l\'avertissement de reprise disparaît',
    fichier: 'module',
    de: "    if (suite >= SEUIL_SUITE_MOTS || part >= SEUIL_TRIGRAMMES) {",
    vers: "    if (false) {",
    attendu: 'un commentaire qui redit l\'écran passe sans un mot' },

  { nom: 'l\'avertissement de parcours de liste disparaît',
    fichier: 'module',
    de: "      if (repris >= SEUIL_ELEMENTS_PARCOURUS) {",
    vers: "      if (false) {",
    attendu: 'la liste lue élément par élément passe sans un mot' },

  { nom: 'l\'avertissement d\'adresse disparaît',
    fichier: 'module',
    de: "    if (PRONOMS[adresse].test(horsCitations)) {",
    vers: "    if (false) {",
    attendu: 'un « toi » dans un texte en « vous » passe sans un mot' },

  { nom: 'la détection de citation non identique disparaît',
    fichier: 'module',
    de: "      if (!contient(texteDocument, normaliserMots(c))) {",
    vers: "      if (false) {",
    attendu: 'une citation tronquée et réattribuée passe sans un mot' },

  { nom: 'l\'avertissement de phrase longue disparaît',
    fichier: 'module',
    de: "      .filter(function (n) { return n > SEUIL_PHRASE_LONGUE; });",
    vers: "      .filter(function () { return false; });",
    attendu: 'une phrase de cent mots passe sans un mot' },

  { nom: 'la reprise recompte les citations',
    fichier: 'module',
    de: "    var suite = plusLongueSuite(comHorsCitations, ecran);\n    var part = partTrigrammesCommuns(comHorsCitations, ecran);",
    vers: "    var suite = plusLongueSuite(com, ecran);\n    var part = partTrigrammesCommuns(com, ecran);",
    attendu: 'une citation exacte, pourtant exigée, déclenche l\'alerte de reprise' },

  { nom: 'la réécriture envoie tout le document',
    fichier: 'module',
    de: "    lignes.push('  contenu de cette étape : ' + (etape.texte || '(pas de texte, image ou titre seul)'));",
    vers: "    toutes.forEach(function (x) { lignes.push('  stepId: ' + x.stepId + ' contenu : ' + x.texte); });",
    attendu: 'des jetons dépensés pour dix-huit étapes que personne ne réécrit' },

  { nom: 'la réécriture écrit directement dans le document',
    fichier: 'module',
    de: "      res.entrees[i] = Object.assign({}, r.entree,",
    vers: "      window.adocNarrationWrite(doc, stepId, r.entree.text);\n      res.entrees[i] = Object.assign({}, r.entree,",
    attendu: 'le document modifié sans « Appliquer » ni confirmation' },

  // ── Le câblage réel, trouvé cassé par Christophe le 9 octobre ─────────────────────────────
  { nom: 'le transport reprend les fonctions sur window (le défaut du 9 octobre)',
    fichier: 'module',
    de: "    var workerUrl = s.urlWorker();",
    vers: "    var workerUrl = window.adocGetWorkerUrl && window.adocGetWorkerUrl();",
    attendu: '« adresse du Worker non configurée » au premier clic réel' },

  { nom: 'le cœur ne passe plus ses services au module',
    fichier: 'coeur',
    de: "            urlWorker: function () { return adocGetWorkerUrl(); },",
    vers: "            urlWorker: undefined,",
    attendu: 'le module n\'a jamais l\'adresse, quoi qu\'il fasse' },

  { nom: 'la clé repart dans le message d\'erreur',
    fichier: 'module',
    de: "        throw new Error(sansCle('le serveur a refusé l\u2019appel (' + r.status",
    vers: "        throw new Error(('le serveur a refusé l\u2019appel (' + (s.cleApi()) + ' ' + r.status",
    attendu: 'la clé copiée-collée dans une conversation avec un message d\'erreur' },

  { nom: 'les constantes sont exposées AVANT leur affectation (var hissée)',
    fichier: 'coeur',
    de: "  window.ADOC_NARRATION_MOTS_PAR_SECONDE = ADOC_NARRATION_MOTS_PAR_SECONDE;\n  window.ADOC_NARRATION_PAUSE_MOTIF = ADOC_NARRATION_PAUSE_MOTIF;",
    vers: "  window.ADOC_NARRATION_MOTS_PAR_SECONDE = undefined;\n  window.ADOC_NARRATION_PAUSE_MOTIF = undefined;",
    attendu: 'le module retombe en silence sur ses propres copies : deux vérités' },

  { nom: 'l\'objectif ne part plus avec le message',
    fichier: 'module',
    de: "    if (doc.purpose) lignes.push('Objectif : ' + doc.purpose);\n    lignes.push('Durée visée pour l\\'ensemble : '",
    vers: "    if (false) lignes.push('Objectif : ' + doc.purpose);",
    attendu: 'la première et la dernière étape devinent au lieu de savoir' },

  { nom: 'l\'objectif ne sert plus à ouvrir ni à refermer',
    fichier: 'module',
    de: "      '- Le message vous donne l\\'OBJECTIF de la présentation. C\\'est lui qui décide de ces deux',",
    vers: "      '- Soignez la première et la dernière étape.',",
    attendu: 'un objectif transporté que rien n\'invite à employer' },

  { nom: 'le type du bloc ne pèse plus rien',
    fichier: 'module',
    de: "    var type = POIDS_TYPE[e.type] != null ? POIDS_TYPE[e.type] : 1.0;",
    vers: "    var type = 1.0;",
    attendu: 'un titre reçoit autant de commentaire qu\'un paragraphe' },

  { nom: 'la longueur pèse proportionnellement, sans amortissement',
    fichier: 'module',
    de: "    return type * Math.max(1, Math.sqrt(compterMots(e.texte)));",
    vers: "    return type * Math.max(1, compterMots(e.texte));",
    attendu: 'un long paragraphe affame toutes les autres étapes' },

  { nom: 'un guillemet droit non apparié passe quand même',
    fichier: 'module',
    de: "      if (droits % 2 !== 0) {",
    vers: "      if (false) {",
    attendu: 'un guillemet deviné au hasard dans une citation' },

  { nom: 'la normalisation typographique est silencieuse',
    fichier: 'module',
    de: "      if (typo.notes.length) normalisations.push(id + ' : ' + typo.notes.join(', '));",
    vers: "      if (false) normalisations.push(id);",
    attendu: 'un texte modifié sans que personne le sache' },

  { nom: 'les rôles sont de nouveau attribués d\'office',
    fichier: 'module',
    de: "      '- N\\'attribuez jamais d\\'office un rôle à l\\'homme ou à la femme : ni celui qui se tait, ni',",
    vers: "      '- Soyez concret sur qui fait quoi.',",
    attendu: 'celui qui se tait est un homme, celle qui demande est une femme' },

  { nom: 'le discours cesse d\'être continu',
    fichier: 'module',
    de: "      'UN SEUL DISCOURS, DU DÉBUT À LA FIN.',",
    vers: "      'CHAQUE ÉTAPE EST INDÉPENDANTE.',",
    attendu: 'dix-neuf petits textes sans lien, et le même exemple trois fois' },

  { nom: 'le registre ne suit plus le public',
    fichier: 'module',
    de: "    if (/profession|clinicien|thérapeute|therapeute|praticien|soignant/.test(pub)) {",
    vers: "    if (false) {",
    attendu: 'un ton de vulgarisation servi à des cliniciens' },

  { nom: 'le sujet redevient « le couple » en dur',
    fichier: 'module',
    de: "      'haute, un acteur de doublage, pour une vidéo de psychoéducation.',",
    vers: "      'haute, un acteur de doublage, pour une vidéo de psychoéducation sur le couple.',",
    attendu: 'un commentaire sur le couple pour une présentation sur la panique' },

  { nom: 'le prompt n\'interdit plus le diagnostic',
    fichier: 'module',
    de: "      '- Aucun diagnostic, aucun conseil adressé à une personne en particulier, aucune promesse',",
    vers: "      '- Soyez précis.',",
    attendu: 'un commentaire peut poser un diagnostic' },

  { nom: 'le prompt reprend un chiffre venu d\'ailleurs',
    fichier: 'module',
    de: "      '  illustrer : ni proportion, ni pourcentage, ni durée, ni effectif inventés.',",
    vers: "      '  illustrer, sauf si cela aide la démonstration.',",
    attendu: 'un chiffre inventé glissé dans un commentaire clinique' },

  { nom: 'le prompt laisse inventer des chiffres',
    fichier: 'module',
    de: "      '- Aucune statistique, aucun pourcentage, aucune étude, aucune source, aucun nom d\\'auteur',",
    vers: "      '- Appuyez-vous sur des données.',",
    attendu: 'des statistiques inventées dans un document clinique' },

  { nom: 'l\'adresse « vous » et « tu » cessent d\'être exclusives',
    fichier: 'module',
    de: "    var adresse = vouvoie\n      ? 'Adressez-vous au spectateur en disant « vous ». Jamais « tu ».'\n      : 'Adressez-vous au spectateur en disant « tu ». Jamais « vous ».';",
    vers: "    var adresse = 'Adressez-vous au spectateur en disant « vous ». Jamais « tu ». '\n      + 'Adressez-vous au spectateur en disant « tu ». Jamais « vous ».';",
    attendu: 'une consigne qui se contredit elle-même' },

  // ── Le message ────────────────────────────────────────────────────────────────────────────
  { nom: 'le document brut entier part au modèle',
    fichier: 'module',
    // L'ancre vise la ligne de DURÉE, qui n'existe que dans construireMessage. La version
    // précédente — titre, public, objectif — était unique mais tombait dans reecrireEtape,
    // parce qu'un commentaire avait séparé ces trois lignes ici. Une ancre unique ne prouve
    // pas qu'elle désigne le bon endroit : il faut une ligne propre à la fonction visée.
    de: "    lignes.push('Durée visée pour l\\'ensemble : ' + o.minutes + ' minutes, soit environ '",
    vers: "    lignes.push(JSON.stringify(doc));\n    lignes.push('Durée visée pour l\\'ensemble : ' + o.minutes + ' minutes, soit environ '",
    attendu: 'citations, snapshot et identifiants techniques envoyés sans raison' },

  // ── Le contrat de réponse ─────────────────────────────────────────────────────────────────
  { nom: 'un identifiant inconnu est accepté',
    fichier: 'module',
    de: "      if (attendus.indexOf(id) === -1) { violations.push(id + ' : identifiant inconnu'); return; }",
    vers: "      if (false) { return; }",
    attendu: 'une narration écrite sur une étape qui n\'existe pas' },

  { nom: 'une étape manquante passe inaperçue',
    fichier: 'module',
    de: "    attendus.forEach(function (id) {\n      if (vus.indexOf(id) === -1) violations.push(id + ' : étape manquante');\n    });",
    vers: "    attendus.forEach(function (id) { if (false) violations.push(id); });",
    attendu: 'un résultat partiel livré en silence' },

  { nom: 'le Markdown n\'est plus refusé',
    fichier: 'module',
    de: "      if (MARKDOWN_RE.test(texte)) violations.push(id + ' : le texte contient du Markdown');",
    vers: "      if (false) violations.push(id);",
    attendu: 'des astérisques prononcés à voix haute' },

  { nom: 'la longueur n\'est plus vérifiée',
    fichier: 'module',
    de: "      if (horsTolerance) {",
    vers: "      if (false) {",
    attendu: 'un écart de longueur qui ne se voit nulle part' },

  // ── La boucle de correction ───────────────────────────────────────────────────────────────
  // MUTATION D'ABORD ESSAYÉE, PUIS ÉCARTÉE parce qu'elle est ÉQUIVALENTE : porter la borne de
  // boucle de 2 à 4 ne change RIEN, parce que `if (tour === 1) break;` arrête déjà la boucle au
  // deuxième tour. La limite d'un seul tour de correction est gardée DEUX FOIS, et retirer l'une
  // des deux gardes laisse l'autre faire le travail. C'est une bonne propriété du code, et c'est
  // aussi ce qui rendait la mutation aveugle : elle est écrite ici plutôt que tue, et le nombre
  // d'appels est désormais compté par le contrôle 9 (`appelsQuandToutEchoue === 2`), ce qui
  // attraperait une vraie levée de la limite.
  // La mutation retenue porte sur ce qui est réellement falsifiable : le CONTENU du tour de
  // correction. Un second appel qui ne dit pas ce qui n'allait pas est un appel pour rien.
  { nom: 'le tour de correction ne dit pas ce qui n\'allait pas',
    fichier: 'module',
    de: "      var aCorriger = v.violations.concat(\n        v.longueurGrave ? v.longueurs.map(function (l) { return l.texte; }) : []);\n      messages = messages.concat([\n        { role: 'assistant', content: brut },",
    vers: "      messages = messages.concat([\n        { role: 'assistant', content: '' },",
    attendu: 'le modèle corrige à l\'aveugle, sans voir sa propre réponse fautive' },

  // ── Les options ───────────────────────────────────────────────────────────────────────────
  { nom: '« n\'écrire que les étapes vides » ne filtre plus',
    fichier: 'module',
    de: '    var etapes = o.seulementVides ? toutes.filter(function (e) { return !dejaNarrees[e.stepId]; }) : toutes;',
    vers: '    var etapes = toutes;',
    attendu: 'les narrations écrites à la main sont réécrites sans qu\'on l\'ait demandé' },

  // ── N4 : jamais d'écrasement sans confirmation ────────────────────────────────────────────
  { nom: 'l\'écrasement se fait sans confirmation (N4)',
    fichier: 'module',
    de: "      if (existantes.length) {\n        var ok = window.confirm(existantes.length + ' étape(s) portent déjà une narration. '",
    vers: "      if (false) {\n        var ok = window.confirm(existantes.length + ' étape(s) portent déjà une narration. '",
    attendu: 'le travail de Christophe écrasé sans un mot' },

  // ── L'annulation ──────────────────────────────────────────────────────────────────────────
  { nom: 'l\'annulation ne restaure plus l\'état d\'avant',
    fichier: 'module',
    de: '      dernierGeste.doc.narration = JSON.parse(JSON.stringify(dernierGeste.avant));',
    vers: '      dernierGeste.doc.narration = dernierGeste.doc.narration || [];',
    attendu: 'un geste qu\'on ne peut pas défaire' },

  // ── L'aperçu ──────────────────────────────────────────────────────────────────────────────
  { nom: 'la rédaction écrit sans passer par l\'aperçu',
    fichier: 'module',
    de: '        dernierResultat = res;\n        rendreApercu(panneau, res, doc);',
    vers: '        dernierResultat = res;\n        res.entrees.forEach(function (en) { window.adocNarrationWrite(doc, en.stepId, en.text); });\n        rendreApercu(panneau, res, doc);',
    attendu: 'le document modifié avant que Christophe ait rien vu' },
];

function lancer(test) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, test || 'verify-narration-ia.cjs')],
      { stdio: 'pipe', encoding: 'utf8', env: process.env });
    return { echoue: false, sortie: '' };
  } catch (e) {
    const tout = String((e.stdout || '') + (e.stderr || ''));
    return { echoue: true, sortie: (tout.split('\n').filter((l) => l.startsWith('FAIL'))[0] || '').slice(0, 150) };
  }
}

let tenus = 0, applicables = 0;
try {
  const testsEmployes = Array.from(new Set(ESSAIS.map((e) => e.test || 'verify-narration-ia.cjs')));
  for (const t of testsEmployes) {
    const temoin = lancer(t);
    if (temoin.echoue) { console.error('ARRÊT — ' + t + ' échoue AVANT toute mutation : ' + temoin.sortie); process.exit(1); }
  }
  console.log('témoin : ' + testsEmployes.length + ' test(s) passent sur les sources intactes.\n');

  for (const essai of ESSAIS) {
    const chemin = FICHIERS[essai.fichier];
    const avant = fs.readFileSync(chemin, 'utf8');
    const occurrences = avant.split(essai.de).length - 1;
    if (occurrences !== 1) {
      console.error('ARRÊT — ancre trouvée ' + occurrences + ' fois : ' + essai.nom);
      process.exit(1);
    }
    applicables++;
    fs.writeFileSync(chemin, avant.replace(essai.de, essai.vers));
    const r = lancer(essai.test);
    fs.writeFileSync(chemin, avant);
    if (r.echoue) { tenus++; console.log('TENU   ' + essai.nom + '\n       → ' + r.sortie); }
    else { console.log('TROU   ' + essai.nom + '\n       → le test PASSE alors que ' + essai.attendu); }
  }
} finally {
  Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));
}

const identiques = Object.keys(FICHIERS).every((k) =>
  crypto.createHash('sha256').update(fs.readFileSync(FICHIERS[k], 'utf8')).digest('hex') === empreinteAvant[k]);
console.log('\nsources restaurées : ' + (identiques ? 'empreintes identiques' : 'EMPREINTES DIFFÉRENTES'));
if (!identiques) process.exit(1);
if (tenus === applicables) console.log('PASS falsifier-narration-ia — ' + tenus + '/' + applicables + ' mutations détectées.');
else { console.error('FAIL ' + (applicables - tenus) + ' mutation(s) non détectée(s).'); process.exit(1); }
