// FALSIFICATION DES CONTRÔLES DES TROIS FAUX AVERTISSEMENTS (lot 1b, 10 octobre).
//
//   NODE_PATH=<playwright> node tests/falsifier-narration-avertissements.cjs
//   NODE_PATH=<playwright> node tests/falsifier-narration-avertissements.cjs --essai 4
//   NODE_PATH=<playwright> node tests/falsifier-narration-avertissements.cjs --reprendre
//
// Chaque mutation retire exactement UN contrôle du produit et exige que
// `verify-narration-avertissements.cjs` ÉCHOUE. Une mutation marquée `equivalente` porte sa
// RAISON : elle est appliquée quand même, et on attend l'INVERSE — que les contrôles PASSENT.
//
// JOURNAL DE REPRISE (régression #11(i)) : écrit AVANT la première mutation. Un gestionnaire de
// signal ne s'exécute pas pendant un `execFileSync`, et jamais sur SIGKILL — la restauration ne
// peut pas dépendre de la survie de ce processus. Tué en route : `--reprendre`.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { module: path.join(RACINE, 'narration-ia.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-falsifieur-avertissements.json');

function sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

const original = {}, empreinteAvant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = sha(original[k]);
});

if (process.argv.includes('--reprendre')) {
  if (!fs.existsSync(JOURNAL)) { console.error('Aucun journal : rien à restaurer.'); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  Object.keys(j.sources).forEach((k) => {
    fs.writeFileSync(FICHIERS[k], j.sources[k]);
    console.log((sha(j.sources[k]) === j.empreintes[k] ? 'restauré  ' : 'DIVERGENT ')
      + path.basename(FICHIERS[k]));
  });
  fs.unlinkSync(JOURNAL);
  console.log('\nSources remises dans l\'état du ' + j.ecritLe + '.');
  process.exit(0);
}

const ESSAIS = [
  // ── LA BORNE DE MOT ───────────────────────────────────────────────────────────────────────
  {
    nom: 'la borne redevient `\\b`, en ASCII — la bogue d\'origine',
    de: "  var PRONOMS = {\n    vous: borneMot('toi|tu|ton|ta|tes'),\n    tu: borneMot('vous|votre|vos'),\n  };",
    vers: "  var PRONOMS = {\n    vous: /\\b(toi|tu|ton|ta|tes)\\b/i,\n    tu: /\\b(vous|votre|vos)\\b/i,\n  };",
    sections: '§1',
    attendu: '« êtes », « béton », « piéton » ne doivent pas être pris pour du tutoiement',
  },
  {
    nom: 'le drapeau `u` est retiré : \\p{L} cesse d\'être une classe Unicode',
    de: "    return new RegExp(BORNE_AVANT + '(' + alternatives + ')' + BORNE_APRES, 'iu');",
    vers: "    return new RegExp(BORNE_AVANT + '(' + alternatives + ')' + BORNE_APRES, 'i');",
    sections: '§0,§1',
    attendu: 'sans `u`, \\p{L} ne vaut plus « une lettre » et la borne ne protège plus rien',
  },
  {
    nom: 'la borne de GAUCHE est retirée, seule celle de droite reste',
    de: "  var BORNE_AVANT = '(?<![\\\\p{L}\\\\p{N}_])';",
    vers: "  var BORNE_AVANT = '';",
    sections: '§1',
    attendu: '« vertu », « battu », « piéton » finissent par un pronom et seraient pris pour lui',
  },
  {
    nom: 'la borne de DROITE est retirée, seule celle de gauche reste',
    de: "  var BORNE_APRES = '(?![\\\\p{L}\\\\p{N}_])';",
    vers: "  var BORNE_APRES = '';",
    sections: '§1',
    attendu: '« tonalité », « table », « tant » commencent par un pronom et seraient pris pour lui',
  },

  // ── LA CITATION PROCHE CONTRE LE PROPOS IMAGINÉ ───────────────────────────────────────────
  {
    nom: 'le seuil de proximité tombe à 0 : tout passage cité redevient un défaut',
    de: '  var SEUIL_CITATION_PROCHE = 0.60;',
    vers: '  var SEUIL_CITATION_PROCHE = 0;',
    sections: '§2',
    attendu: 'un dialogue imaginé ne partage rien avec l\'écran : il ne doit pas être un défaut',
  },
  {
    nom: 'le seuil monte à 1 : une citation abîmée cesse d\'être un défaut',
    de: '  var SEUIL_CITATION_PROCHE = 0.60;',
    vers: '  var SEUIL_CITATION_PROCHE = 1.01;',
    sections: '§2',
    attendu: 'une citation à 92 % des mots d\'une phrase affichée EST une citation abîmée',
  },
  {
    nom: 'le propos imaginé perd son drapeau `information`',
    de: "        out.push({ type: 'propos-imagine', part: part, information: true,",
    vers: "        out.push({ type: 'propos-imagine', part: part,",
    sections: '§2,§2b',
    attendu: 'sans ce drapeau, un propos légitime entre dans le compte des défauts',
  },
  {
    nom: 'les phrases du document se découpent sur le TABLEAU de mots, pas sur la chaîne',
    de: "    var phrasesDoc = phrasesDe(brutDocument).map(normaliserMots)",
    vers: "    var phrasesDoc = phrasesDe(motsDocument).map(normaliserMots)",
    sections: '§2c',
    attendu: 'le document deviendrait UNE phrase géante, et la part se calculerait contre lui '
           + 'entier au lieu d\'une phrase — c\'est la faute que j\'avais écrite et que le '
           + 'contrôle a attrapée',
  },
  {
    nom: 'la citation identique n\'est plus reconnue : `contient` reçoit la chaîne brute',
    de: '      if (contient(motsDocument, motsC)) return;',
    vers: '      if (contient(brutDocument, motsC)) return;',
    sections: '§2',
    attendu: '`contient` compare mot à mot ; lui donner une chaîne compare des CARACTÈRES à des '
           + 'mots, et aucune citation exacte n\'est plus reconnue',
  },

  // ── LE DÉCOUPAGE EN PHRASES ───────────────────────────────────────────────────────────────
  {
    nom: 'le remplacement de « … » par une espace est retiré',
    de: "    if (!couperSurSuspension) brut = brut.replace(/\\u2026/g, ' ');",
    vers: "    brut = brut;",
    sections: '§2,§2c,§4',
    equivalente:
      'MESURÉ, pas raisonné : je l\'avais inscrite comme un trou, et c\'en est une équivalence. '
      + 'Le séparateur de la variante « sans coupure » ne liste PAS « … » — il ne connaît que '
      + '. ! ? et le retour à la ligne. Retirer ce remplacement laisse donc « … » À L\'INTÉRIEUR '
      + 'de la phrase sans en changer le découpage, et `normaliserMots` l\'efface ensuite avec '
      + 'tous les caractères non alphanumériques (`[^\\p{L}\\p{N}]+`). Même nombre de phrases, '
      + 'mêmes listes de mots : vérifié côte à côte. Ce remplacement RESTE parce qu\'il rend la '
      + 'phrase lisible dans un message d\'avertissement, pas parce qu\'un verdict en dépend. Le '
      + 'jour où un contrôle échoue sur cette mutation, c\'est que le séparateur a changé.',
    attendu: 'les contrôles doivent PASSER : la mutation est équivalente',
  },
  {
    nom: 'le découpage de `phrasesLongues` ne coupe plus sur « … »',
    de: "    return phrasesDe(String(texte || '').replace(pauseRe(), ' '), { couperSurSuspension: true })",
    vers: "    return phrasesDe(String(texte || '').replace(pauseRe(), ' '))",
    sections: '§4,§4c',
    attendu: 'pour celui qui DIT le texte, « … » est une respiration : une fin de phrase',
  },

  // ── LES DEUX RÈGLES DU PROMPT ─────────────────────────────────────────────────────────────
  {
    nom: 'la règle de compte des listes disparaît du prompt',
    de: "      'LA RÈGLE EST UN COMPTE, pas une impression : SI VOUS EN NOMMEZ PLUS D\\'UNE, VOUS PARCOUREZ',",
    vers: "      '',",
    sections: '§3',
    attendu: 'sans elle, « retenez une idée » puis trois idées reste possible',
  },
  {
    nom: 'la règle du dialogue imaginé disparaît du prompt',
    de: "      'Un DIALOGUE IMAGINÉ peut s\\'écrire entre guillemets français, à condition d\\'être introduit',",
    vers: "      '',",
    sections: '§3',
    attendu: 'le modèle doit savoir qu\'un dialogue imaginé s\'annonce comme imaginé',
  },

  // ── RÉFÉRENCE AU SUPPORT (4e tirage) ──────────────────────────────────────────────────────
  {
    nom: 'le déterminant indéfini est accepté : « un document de travail » devient un défaut',
    de: "    BORNE_AVANT + '(?:l[ea]|ce|cet|cette|ces|les|du|de\\\\s+la|des)\\\\s+'",
    vers: "    BORNE_AVANT + '(?:l[ea]|ce|cet|cette|ces|les|du|de\\\\s+la|des|un|une)\\\\s+'",
    sections: '§6',
    attendu: 'un indéfini introduit un objet du propos, pas le support qu\'on a sous les yeux',
  },
  {
    nom: '« l\'écran » entre dans la liste des noms de support',
    de: "    + '(?:documents?|pr[ée]sentations?|diapositives?)' + BORNE_APRES, 'giu');",
    vers: "    + '(?:documents?|pr[ée]sentations?|diapositives?|[ée]crans?)' + BORNE_APRES, 'giu');",
    sections: '§6',
    attendu: '« l\'écran » est la formulation que le prompt RECOMMANDE : la signaler serait absurde',
  },
  {
    nom: 'les citations ne sont plus retirées avant de chercher le support',
    de: "    var horsCitationsPourSupport = String(texteCommentaire || '')\n      .replace(/\\u00ab[^\\u00bb]*\\u00bb/g, ' ');",
    vers: "    var horsCitationsPourSupport = String(texteCommentaire || '');",
    sections: '§6c',
    attendu: 'si l\'écran écrit « le document », une citation exacte a le droit de le reprendre',
  },
  {
    nom: 'l\'avertissement de support ne compte plus ses occurrences',
    de: "      out.push({ type: 'reference-support', occurrences: refs.length, expressions: vues,",
    vers: "      out.push({ type: 'reference-support', occurrences: 1, expressions: vues,",
    sections: '§6b',
    attendu: 'trois références doivent se compter trois : le relevé porte sa grandeur',
  },

  // ── L'ANGLE MORT DE « PARCOURT LA LISTE » (4e tirage) ─────────────────────────────────────
  {
    nom: 'l\'heuristique d\'énumération est retirée',
    de: "      var enu = enumeration(texteCommentaire);",
    vers: "      var enu = null;",
    sections: '§7',
    attendu: 'trois propositions reformulées parcourent la liste sans lui emprunter un mot',
  },
  {
    nom: 'le seuil de répétitions passe de trois à quatre',
    de: '  var ENUM_MIN_REPETITIONS = 3;   // « trois propositions ou plus », comme demandé',
    vers: '  var ENUM_MIN_REPETITIONS = 4;',
    sections: '§7',
    attendu: 'Christophe a demandé « trois propositions ou plus »',
  },
  {
    nom: 'les propositions ne se coupent plus sur la virgule',
    de: "    return String(texte || '').split(/[.!?;:,\\u2026]+/)",
    vers: "    return String(texte || '').split(/[.!?]+/)",
    sections: '§7',
    attendu: 'une énumération tient souvent dans UNE phrase, séparée par des virgules',
  },
  {
    nom: 'l\'énumération s\'applique AUSSI hors des listes',
    de: "    if (elements.length) {\n      var enu = enumeration(texteCommentaire);",
    vers: "    if (true) {\n      var enu = enumeration(texteCommentaire);",
    sections: '§7b',
    attendu: 'dans de la prose, trois phrases qui commencent pareil sont une anaphore',
  },
  {
    nom: 'les marqueurs d\'ordre ne sont plus reconnus',
    de: "    if (distincts.length >= ENUM_MIN_REPETITIONS) {",
    vers: "    if (false) {",
    sections: '§7',
    attendu: '« la première… la deuxième… la troisième » énumère, sans ouverture répétée',
  },

  // ── LES RÈGLES DU PROMPT (4e tirage) ──────────────────────────────────────────────────────
  {
    nom: 'la limite chiffrée de 25 mots disparaît du prompt',
    de: "      '- Des phrases courtes. Une idée par phrase. AUCUNE PHRASE DE PLUS DE 25 MOTS : au-delà,',",
    vers: "      '- Des phrases courtes. Une idée par phrase.',",
    sections: '§3',
    attendu: 'trois phrases de 45 et 46 mots au quatrième tirage : la limite doit être chiffrée',
  },
  {
    nom: 'l\'interdiction de nommer le support disparaît du prompt',
    de: "      'NE DITES JAMAIS « le document », « cette présentation » ni « cette diapositive » :',",
    vers: "      '',",
    sections: '§3',
    attendu: 'le texte disait trois fois « le document » : la règle doit être écrite',
  },
  {
    nom: '« ni lui ni elle » disparaît de la règle du couple',
    de: "      '  et N\\'EMPLOYEZ NI « lui » NI « elle » pour désigner un partenaire : vous ne savez pas qui',",
    vers: "      '  pour désigner un partenaire : vous ne savez pas qui',",
    sections: '§3',
    attendu: 'la règle existait sans cette clause ; c\'est elle que Christophe a demandée',
  },

  // ── UNE MUTATION ÉQUIVALENTE, AVEC SA RAISON (régression #11(h)) ──────────────────────────
  {
    nom: 'le filtre des phrases vides est retiré',
    de: "    var phrasesDoc = phrasesDe(brutDocument).map(normaliserMots)\n      .filter(function (m) { return m.length; });",
    vers: "    var phrasesDoc = phrasesDe(brutDocument).map(normaliserMots);",
    sections: '§2',
    equivalente:
      'Une phrase vide donne un ensemble de mots vide : aucun mot de la citation n\'y est '
      + 'trouvé, donc sa part vaut 0. Or on ne garde que le MAXIMUM des parts. Une valeur de 0 '
      + 'ne peut jamais relever un maximum : le filtre ne change aucun verdict, il évite '
      + 'seulement des tours de boucle inutiles. Il RESTE dans le produit à ce titre. Le jour où '
      + 'cette mutation fait échouer un contrôle, c\'est que le verdict ne se lit plus sur le '
      + 'maximum, et c\'est cet inventaire qui est faux.',
    attendu: 'les contrôles doivent PASSER : la mutation est équivalente',
  },
];

function appliquer(de, vers) {
  const chemin = FICHIERS.module;
  const t = fs.readFileSync(chemin, 'utf8');
  const n = t.split(de).length - 1;
  if (n !== 1) throw new Error('ancre trouvée ' + n + ' fois : ' + de.slice(0, 60));
  fs.writeFileSync(chemin, t.replace(de, vers));
}

function restaurer() {
  Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));
}

function lancer(sections) {
  try {
    execFileSync(process.execPath,
      [path.join(__dirname, 'verify-narration-avertissements.cjs'), '--seulement', sections],
      { cwd: RACINE, stdio: 'pipe', encoding: 'utf8', timeout: 240000 });
    return true;
  } catch (e) { return false; }
}

(function main() {
  const i = process.argv.indexOf('--essai');
  const seul = i >= 0 ? Number(process.argv[i + 1]) : null;

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.writeFileSync(JOURNAL, JSON.stringify({
    ecritLe: new Date().toISOString(), pid: process.pid,
    aQuoiCaSert: 'Tué en pleine mutation ? node tests/falsifier-narration-avertissements.cjs --reprendre',
    empreintes: empreinteAvant, sources: original,
  }, null, 1));
  console.log('Journal de reprise écrit AVANT la première mutation :\n  ' + JOURNAL + '\n');

  // Chaque ancre existe-t-elle une fois et une seule, AVANT toute mutation ? Une ancre
  // introuvable dit à la fois « ancre périmée » et « mutation restée en place ».
  const cassees = [];
  ESSAIS.forEach((e, k) => {
    const n = original.module.split(e.de).length - 1;
    if (n !== 1) cassees.push('#' + (k + 1) + ' « ' + e.nom + ' » : ' + n + ' occurrence(s)');
  });
  if (cassees.length) {
    console.error('ANCRES INVALIDES, aucune mutation appliquée :');
    cassees.forEach((a) => console.error('  · ' + a));
    fs.unlinkSync(JOURNAL);
    process.exit(2);
  }
  console.log(ESSAIS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');

  const res = [];
  ESSAIS.forEach((e, k) => {
    if (seul !== null && seul !== k + 1) return;
    console.log('#' + String(k + 1).padStart(2, ' ') + (e.equivalente ? ' [ÉQUIVALENTE]' : '') + ' ' + e.nom);
    let passe;
    try { appliquer(e.de, e.vers); passe = lancer(e.sections); } finally { restaurer(); }
    const conforme = passe === !!e.equivalente;
    res.push({ num: k + 1, nom: e.nom, conforme, equivalente: !!e.equivalente });
    if (conforme) {
      console.log('     ' + (e.equivalente
        ? 'les contrôles PASSENT, comme attendu d\'une mutation équivalente'
        : 'les contrôles ÉCHOUENT, comme ils le doivent (' + e.sections + ')'));
    } else if (e.equivalente) {
      console.log('     PROBLÈME : la mutation dite équivalente FAIT ÉCHOUER ' + e.sections + '.');
      console.log('     Raison consignée : ' + e.equivalente);
    } else {
      console.log('     TROU : les contrôles PASSENT malgré la mutation.');
      console.log('     Ce qui devait être attrapé : ' + e.attendu);
    }
    console.log('');
  });

  const divergent = sha(fs.readFileSync(FICHIERS.module, 'utf8')) !== empreinteAvant.module;
  const ancresApres = ESSAIS.filter((e) =>
    fs.readFileSync(FICHIERS.module, 'utf8').split(e.de).length - 1 !== 1).length;

  console.log('─'.repeat(74));
  console.log('  ' + empreinteAvant.module.slice(0, 16) + '  narration-ia.js  '
    + (divergent ? 'DIVERGENT' : 'restauré'));
  if (divergent || ancresApres) {
    console.error('\nRESTAURATION INCOMPLÈTE — journal CONSERVÉ. '
      + (ancresApres ? ancresApres + ' ancre(s) introuvable(s). ' : '')
      + 'node tests/falsifier-narration-avertissements.cjs --reprendre');
    process.exit(1);
  }
  fs.unlinkSync(JOURNAL);
  console.log('  ' + ESSAIS.length + ' ancres de nouveau présentes une fois et une seule.');
  console.log('  Journal retiré : les sources sont dans leur état d\'origine.\n');

  const trous = res.filter((r) => !r.conforme && !r.equivalente);
  const faussesEquiv = res.filter((r) => !r.conforme && r.equivalente);
  const equiv = res.filter((r) => r.conforme && r.equivalente);
  console.log(res.length + ' mutations · ' + (res.length - trous.length - faussesEquiv.length)
    + ' conformes · ' + equiv.length + ' équivalente(s) consignée(s) · ' + trous.length
    + ' trou(s) · ' + faussesEquiv.length + ' fausse(s) équivalence(s)');
  trous.forEach((r) => console.log('  TROU #' + r.num + ' ' + r.nom));
  faussesEquiv.forEach((r) => console.log('  FAUSSE ÉQUIVALENCE #' + r.num + ' ' + r.nom));
  if (trous.length || faussesEquiv.length) process.exit(1);
  console.log('\nPASS falsifier-narration-avertissements — chaque contrôle échoue quand il le doit.');
})();
