// FALSIFICATION DES CONTRÔLES DU .docx (lot 2D-a, Q2).
//
// Quatre mutations, dont trois visent précisément ce qui fait refuser un fichier à Word :
// l'ORDRE des éléments, un type de contenu manquant, une relation cassée.
//
//   NODE_PATH=<playwright> node tests/falsifier-texte-word.cjs [--reprendre]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const FICHIERS = { page: path.join(RACINE, 'studio-clinique.html'),
                   coeur: path.join(RACINE, 'studio-clinique-core.js') };
const JOURNAL = path.join(RACINE, 'banc-chutier', 'journal-de-reprise-word.json');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

const original = {}, avant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  avant[k] = sha(original[k]);
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
  process.exit(0);
}

const MUTATIONS = [
  {
    // L'ORDRE dans w:pPr est imposé par le schema : pStyle AVANT numPr. Permute, et Word
    // propose de reparer. Aucun validateur n'etant ici, c'est la comparaison a la reference
    // qui doit le voir — et elle seule.
    nom: 'l’ordre dans w:pPr est permute : numPr avant pStyle',
    controle: 'verify-docx-reference.cjs',
    fichier: 'coeur',
    de: "    if (style) pPr += '<w:pStyle w:val=\"' + style + '\"/>';\n    if (numId) pPr += '<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"' + numId + '\"/></w:numPr>';",
    vers: "    if (numId) pPr += '<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"' + numId + '\"/></w:numPr>';\n    if (style) pPr += '<w:pStyle w:val=\"' + style + '\"/>';",
    attendu: 'la comparaison a la reference doit tomber : meme contenu, mais pas le meme ordre',
  },
  {
    nom: 'l’ordre dans w:numPr est permute : numId avant ilvl',
    controle: 'verify-docx-reference.cjs',
    fichier: 'coeur',
    de: "'<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"' + numId + '\"/></w:numPr>'",
    vers: "'<w:numPr><w:numId w:val=\"' + numId + '\"/><w:ilvl w:val=\"0\"/></w:numPr>'",
    attendu: 'meme cause, un cran plus profond',
  },
  {
    nom: 'un type de contenu disparait de [Content_Types].xml',
    fichier: 'coeur',
    de: "      + '<Override PartName=\"/word/numbering.xml\" ContentType=\"' + W + '.numbering+xml\"/>'",
    vers: "      + ''",
    attendu: 'une partie non declaree : Word refuse le fichier',
  },
  {
    nom: 'une relation pointe vers une partie qui n’existe pas',
    fichier: 'coeur',
    // La constante R a été scindée en R_CONTENEUR et R_TYPE le 20 octobre (défaut de l'espace
    // de noms des relations) : l'ancre suit ce nom. Sans cette mise à jour le falsificateur
    // refusait de conclure — ce qu'il a fait, et c'est ainsi qu'on l'a su.
    de: "      + '<Relationship Id=\"rId2\" Type=\"' + R_TYPE + '/numbering\" Target=\"numbering.xml\"/>'",
    vers: "      + '<Relationship Id=\"rId2\" Type=\"' + R_TYPE + '/numbering\" Target=\"numerotation.xml\"/>'",
    attendu: 'la relation casse : le controle des relations doit le dire',
  },
];

function appliquer(m) {
  const chemin = FICHIERS[m.fichier];
  const t = fs.readFileSync(chemin, 'utf8');
  const n = t.split(m.de).length - 1;
  if (n !== 1) throw new Error('ancre trouvée ' + n + ' fois : ' + m.de.slice(0, 60));
  fs.writeFileSync(chemin, t.replace(m.de, m.vers));
}
const restaurer = () => Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));

(async () => {
  let trous = 0, conformes = 0;
  MUTATIONS.forEach((m) => {
    const t = original[m.fichier];
    const n = t.split(m.de).length - 1;
    if (n !== 1) { console.log('  · ancre absente ou multiple (' + n + ') : ' + m.nom); trous++; }
  });
  if (trous) { console.error('\nInventaire périmé, rien n\'a été muté.'); process.exit(2); }
  console.log(MUTATIONS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.writeFileSync(JOURNAL, JSON.stringify({ sources: original, empreintes: avant }));
  console.log('Journal de reprise écrit :\n  ' + JOURNAL + '\n');

  try {
    for (let i = 0; i < MUTATIONS.length; i++) {
      const m = MUTATIONS[i];
      console.log('#' + (i + 1) + ' ' + m.nom);
      appliquer(m);
      let echoue = false;
      try {
        execFileSync(process.execPath, [path.join(__dirname, m.controle || 'verify-texte-word.cjs')],
          { stdio: 'pipe', timeout: 900000 });
      } catch (e) { echoue = true; }
      restaurer();
      if (echoue) { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
      else { console.log('     TROU : le contrôle PASSE malgré la mutation'); trous++; }
    }
  } finally {
    restaurer();
    Object.keys(FICHIERS).forEach((k) => {
      const e = sha(fs.readFileSync(FICHIERS[k], 'utf8'));
      console.log('  ' + e.slice(0, 16) + '  ' + path.basename(FICHIERS[k])
        + (e === avant[k] ? '  restauré' : '  DIVERGENT'));
    });
    if (fs.existsSync(JOURNAL)) fs.unlinkSync(JOURNAL);
  }
  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-texte-word');
})();
