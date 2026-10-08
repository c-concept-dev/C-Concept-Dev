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
    de: "    lignes.push('Titre de la présentation : ' + (doc.title || 'sans titre'));",
    vers: "    lignes.push('Titre de la présentation : ' + (doc.title || 'sans titre'));\n    lignes.push(JSON.stringify(doc));",
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
    de: "      if (n < cible - marge) violations.push(id + ' : trop court (' + n + ' mots pour ' + cible + ' ± ' + marge + ')');",
    vers: "      if (false) violations.push(id);",
    attendu: 'deux mots là où il en fallait cent vingt' },

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
    de: "      messages = messages.concat([\n        { role: 'assistant', content: brut },",
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
