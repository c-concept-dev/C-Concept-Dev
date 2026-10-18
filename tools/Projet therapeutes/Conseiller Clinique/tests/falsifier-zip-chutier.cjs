// FALSIFICATION DES CONTRÔLES DU ZIP DU CHUTIER (lot 2B, X7).
//
// Un test qui passe ne prouve rien tant qu'on n'a pas montré qu'il ÉCHOUE quand il le doit.
// Chaque mutation retire exactement UN contrôle du produit, rejoue le ou les tests qui le visent,
// et exige qu'ils échouent.
//
//   NODE_PATH=<playwright> node tests/falsifier-zip-chutier.cjs
//   NODE_PATH=<playwright> node tests/falsifier-zip-chutier.cjs --essai 3
//   NODE_PATH=<playwright> node tests/falsifier-zip-chutier.cjs --de 1 --a 5
//   NODE_PATH=<playwright> node tests/falsifier-zip-chutier.cjs --reprendre
//
// LE JOURNAL DE REPRISE. Un gestionnaire de signal ne s'exécute pas pendant un `execFileSync`,
// et jamais sur SIGKILL : la restauration ne peut donc pas dépendre de la survie de ce processus.
// Avant la PREMIÈRE mutation, ce script écrit sur le disque les sources d'origine et leurs
// empreintes ; `--reprendre` les remet en état.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = {
  zip: path.join(RACINE, 'zip-stocke.js'),
  // La page du banc n'est pas versionnée : c'est sa FORGE qui porte son code, et c'est donc
  // elle qu'on mute. La page est reforgée à chaque essai.
  forge: path.join(__dirname, 'forger-banc-chutier.cjs'),
};
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-zip.json');

function sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

const original = {}, empreinteAvant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = sha(original[k]);
});

if (process.argv.includes('--reprendre')) {
  if (!fs.existsSync(JOURNAL)) {
    console.error('Aucun journal de reprise : rien à restaurer (ou déjà restauré).');
    process.exit(2);
  }
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  Object.keys(j.sources).forEach((k) => {
    fs.writeFileSync(FICHIERS[k], j.sources[k]);
    const e = sha(j.sources[k]);
    console.log((e === j.empreintes[k] ? 'restauré  ' : 'DIVERGENT ') + path.basename(FICHIERS[k])
      + '  ' + e.slice(0, 16));
  });
  fs.unlinkSync(JOURNAL);
  process.exit(0);
}

// ── LES MUTATIONS ───────────────────────────────────────────────────────────────────────────
// `sections` nomme les tests à rejouer : « stocke » pour le test direct de l'écrivain,
// « chutier » pour le test de la page. Les deux sont lancés quand les deux sont nommés.
const MUTATIONS = [
  {
    nom: 'le CRC-32 est toujours zéro',
    fichier: 'zip', sections: 'stocke,chutier',
    de: '    return (c ^ LIMITE_32) >>> 0;',
    vers: '    return 0;',
    attendu: 'tout lecteur de zip refuse une archive dont les CRC sont faux',
  },
  {
    nom: 'la table du CRC emploie le mauvais polynôme',
    fichier: 'zip', sections: 'stocke',
    de: '      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);',
    vers: '      for (var k = 0; k < 8; k++) c = (c & 1) ? (0x04C11DB7 ^ (c >>> 1)) : (c >>> 1);',
    attendu: 'le CRC-32 du zip est celui du polynôme 0xEDB88320, et pas un autre',
  },
  {
    nom: 'l\'en-tête annonce la méthode dégonflée alors que les octets sont stockés',
    fichier: 'zip', sections: 'stocke,chutier',
    de: '        h.u32(0x04034B50).u16(20).u16(0x0800).u16(0).u16(heureDos(quand)).u16(dateDos(quand));',
    vers: '        h.u32(0x04034B50).u16(20).u16(0x0800).u16(8).u16(heureDos(quand)).u16(dateDos(quand));',
    attendu: 'une archive qui annonce deflate et livre du stocké est illisible',
  },
  {
    nom: 'le drapeau UTF-8 des noms est retiré',
    fichier: 'zip', sections: 'stocke',
    de: '        c.u32(0x02014B50).u16(20).u16(20).u16(0x0800).u16(0);',
    vers: '        c.u32(0x02014B50).u16(20).u16(20).u16(0).u16(0);',
    attendu: 'sans le bit 11, un nom non ASCII est lu dans la page de code 437',
  },
  {
    nom: 'la taille annoncée dans l\'en-tête local est nulle',
    fichier: 'zip', sections: 'stocke,chutier',
    de: '        h.u32(m.crc).u32(m.octets).u32(m.octets).u16(nom.length).u16(0).brut(nom);',
    vers: '        h.u32(m.crc).u32(0).u32(0).u16(nom.length).u16(0).brut(nom);',
    attendu: 'un lecteur qui suit les en-têtes locaux ne retrouverait aucune entrée',
  },
  {
    nom: 'le décalage inscrit au répertoire central est toujours zéro',
    fichier: 'zip', sections: 'stocke,chutier',
    de: '        c.u16(e.nom.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(e.offset).brut(e.nom);',
    vers: '        c.u16(e.nom.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(0).brut(e.nom);',
    attendu: 'le répertoire central pointerait toutes les entrées sur la première',
  },
  {
    nom: 'la fin d\'archive annonce un nombre d\'entrées faux',
    fichier: 'zip', sections: 'stocke,chutier',
    de: '      f.u32(0x06054B50).u16(0).u16(0).u16(central.length).u16(central.length);',
    vers: '      f.u32(0x06054B50).u16(0).u16(0).u16(1).u16(1);',
    attendu: 'un lecteur ne verrait qu\'une entrée sur vingt',
  },
  {
    nom: 'la date MS-DOS n\'est pas écrite',
    fichier: 'zip', sections: 'stocke',
    de: '    return ((an << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;',
    vers: '    return 0;',
    attendu: 'une date nulle n\'est pas une date : les lecteurs la rendent en 1980',
  },
  {
    nom: 'chaque image est lue d\'un seul coup au lieu d\'être découpée',
    fichier: 'zip', sections: 'chutier',
    de: '      var fin = Math.min(blob.size, debut + MORCEAU);',
    vers: '      var fin = blob.size;',
    attendu: 'l\'écrivain tiendrait une image entière à la fois : c\'est le défaut que la mesure du plus gros bloc a déjà trouvé une fois',
  },
  {
    nom: 'le numéro de diapositive n\'est plus sur deux chiffres',
    fichier: 'forge', sections: 'chutier',
    de: '  function deuxChiffres(n) { var s = String(n); return s.length < 2 ? \'0\' + s : s; }',
    vers: '  function deuxChiffres(n) { return String(n); }',
    attendu: 'X5 : des noms triés dans l\'ordre, ce que « 1-1, 10-1, 2-1 » ne donne pas',
  },
  {
    nom: 'l\'extension ne suit plus le format choisi',
    fichier: 'forge', sections: 'chutier',
    de: '    return deuxChiffres(im.cardIndex + 1) + \'-\' + im.rang + (type === \'image/png\' ? \'.png\' : \'.jpg\');',
    vers: '    return deuxChiffres(im.cardIndex + 1) + \'-\' + im.rang + \'.jpg\';',
    attendu: 'un PNG nommé .jpg trompe tout ce qui lit l\'extension, iMovie compris',
  },
  {
    nom: 'le séparateur du CSV devient la virgule',
    fichier: 'forge', sections: 'chutier',
    de: '        lignes.push(ligne.map(champCsv).join(\';\'));',
    vers: '        lignes.push(ligne.map(champCsv).join(\',\'));',
    attendu: 'l\'index est spécifié à point-virgule, et le travelling contient des virgules',
  },
  {
    nom: 'narration.txt est écrit même sans narration',
    fichier: 'forge', sections: 'chutier',
    de: '      if (blocsNarration.length) {',
    vers: '      if (true) {',
    attendu: 'jamais un fichier vide présenté comme complet',
  },
  {
    nom: 'les colonnes de narration sont là même sans narration',
    fichier: 'forge', sections: 'chutier',
    de: '      if (avecNarration) { enTete.push(\'mots\'); enTete.push(\'duree_estimee_s\'); }',
    vers: '      { enTete.push(\'mots\'); enTete.push(\'duree_estimee_s\'); }',
    attendu: 'une colonne vide laisse croire qu\'il n\'y a rien à dire, non qu\'il n\'y a rien de chargé',
  },
  {
    nom: 'la distance de défilement d\'une image haute n\'est plus dite',
    fichier: 'forge', sections: 'chutier',
    de: '    if (hauteurDuCadre && im.hauteur > hauteurDuCadre) {',
    vers: '    if (false) {',
    attendu: 'X7 : « avec la distance de défilement dans l\'index »',
  },
  {
    nom: 'un export interrompu télécharge quand même',
    fichier: 'forge', sections: 'chutier',
    de: '        if (!im.blob) {',
    vers: '        if (false) {',
    attendu: 'X4 : un export interrompu ne laisse jamais un fichier présenté comme complet',
  },
  {
    nom: 'deux exports de suite portent le même nom',
    fichier: 'forge', sections: 'chutier',
    de: '      if (window.__zipsEcrits[nomZip] > 1) {',
    vers: '      if (false) {',
    attendu: 'X5 : deux exports de suite ne s\'écrasent jamais',
  },
  {
    nom: 'le bouton du zip reste actif pendant un rendu',
    fichier: 'forge', sections: 'chutier',
    de: '    $(\'bc-zip\').disabled = true;\n    dernier = null;',
    vers: '    void 0;',
    attendu: 'un clic exporterait l\'ancien rendu, avec l\'ancien format : défaut trouvé par le contrôle du PNG',
  },
  {
    nom: 'la durée estimée ne suit plus la vitesse du CDC',
    fichier: 'forge', sections: 'chutier',
    de: '          ligne.push(mots === 0 ? \'\' : (mots / VITESSE_DEFAUT).toFixed(1));',
    vers: '          ligne.push(mots === 0 ? \'\' : (mots / 2).toFixed(1));',
    attendu: 'R6 fixe la vitesse par défaut à 2,5 mots par seconde',
  },
  {
    nom: 'les mots sont comptés en comptant les blancs',
    fichier: 'forge', sections: 'chutier',
    de: '      if (!blanc && !dedans) { mots++; dedans = true; }',
    vers: '      if (blanc) { mots++; }',
    attendu: 'le nombre de mots doit être le nombre de mots',
  },
];

function appliquer(cle, de, vers) {
  const chemin = FICHIERS[cle];
  const t = fs.readFileSync(chemin, 'utf8');
  const n = t.split(de).length - 1;
  if (n !== 1) {
    throw new Error('ancre trouvée ' + n + ' fois dans ' + path.basename(chemin)
      + ' (il en faut exactement une) : ' + de.slice(0, 70));
  }
  fs.writeFileSync(chemin, t.replace(de, vers));
}

function restaurer() {
  Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));
}

function jouer(sections) {
  // La page est REFORGÉE avant chaque essai : c'est la forge qu'on mute, et c'est la page qui
  // est éprouvée. Oublier cette étape ferait passer toutes les mutations de la forge.
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  const tests = [];
  if (sections.indexOf('stocke') >= 0) tests.push('verify-zip-stocke.cjs');
  if (sections.indexOf('chutier') >= 0) tests.push('verify-zip-chutier.cjs');
  for (const t of tests) {
    try {
      execFileSync(process.execPath, [path.join(__dirname, t)], { stdio: 'pipe', timeout: 900000 });
    } catch (e) {
      return { echoue: true, par: t };
    }
  }
  return { echoue: false };
}

(async () => {
  // ── LES ANCRES D'ABORD : une ancre absente est un inventaire périmé, pas une mutation ───
  const tranche = { de: 1, a: MUTATIONS.length };
  const iDe = process.argv.indexOf('--de');
  const iA = process.argv.indexOf('--a');
  const iUn = process.argv.indexOf('--essai');
  if (iDe > 0) tranche.de = Number(process.argv[iDe + 1]);
  if (iA > 0) tranche.a = Number(process.argv[iA + 1]);
  if (iUn > 0) { tranche.de = Number(process.argv[iUn + 1]); tranche.a = tranche.de; }

  let trousDAncre = 0;
  MUTATIONS.forEach((m, i) => {
    const t = original[m.fichier];
    const n = t.split(m.de).length - 1;
    if (n !== 1) {
      console.log('  · #' + (i + 1) + ' « ' + m.nom + ' » : ' + n + ' occurrence(s)');
      trousDAncre++;
    }
  });
  if (trousDAncre) {
    console.error('\n' + trousDAncre + ' ancre(s) absente(s) ou multiple(s) : inventaire périmé, '
      + 'rien n\'a été muté.');
    process.exit(2);
  }
  console.log(MUTATIONS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.writeFileSync(JOURNAL, JSON.stringify({ sources: original, empreintes: empreinteAvant }));
  console.log('Journal de reprise écrit :\n  ' + JOURNAL
    + '\n  (tué en route ? node tests/falsifier-zip-chutier.cjs --reprendre)\n');

  let conformes = 0, trous = 0, joues = 0;
  const liste = [];
  try {
    for (let i = tranche.de - 1; i < tranche.a && i < MUTATIONS.length; i++) {
      const m = MUTATIONS[i];
      console.log('#' + String(i + 1).padStart(2) + ' ' + m.nom);
      appliquer(m.fichier, m.de, m.vers);
      const r = jouer(m.sections);
      restaurer();
      joues++;
      if (r.echoue) {
        console.log('     les contrôles ÉCHOUENT, comme ils le doivent (' + r.par + ')');
        conformes++;
      } else {
        console.log('     TROU : les contrôles PASSENT malgré la mutation.');
        trous++;
        liste.push('#' + (i + 1) + ' ' + m.nom);
      }
    }
  } finally {
    restaurer();
    execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
    const apres = {};
    Object.keys(FICHIERS).forEach((k) => { apres[k] = sha(fs.readFileSync(FICHIERS[k], 'utf8')); });
    console.log('\n' + '─'.repeat(78));
    Object.keys(FICHIERS).forEach((k) => {
      console.log('  ' + apres[k].slice(0, 16) + '  ' + path.basename(FICHIERS[k])
        + (apres[k] === empreinteAvant[k] ? '  restauré' : '  DIVERGENT'));
    });
    if (fs.existsSync(JOURNAL)) fs.unlinkSync(JOURNAL);
    console.log('  Journal de reprise retiré : les sources sont dans leur état d\'origine.');
  }

  console.log('\n' + joues + ' mutations jouées · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  liste.forEach((l) => console.log('  TROU ' + l));
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-zip-chutier — chaque contrôle échoue quand il le doit.');
})();
