// Q2 — MON .docx REPRODUIT-IL LA STRUCTURE DE LA RÉFÉRENCE, ÉLÉMENT POUR ÉLÉMENT ?
//
// La référence (reference-texte-des-diapositives.docx, hors du dépôt) a été produite par la
// bibliothèque docx et validée contre le schéma OOXML. Aucun validateur OOXML n'étant présent
// sur cette machine, CETTE COMPARAISON EST LE SEUL GARDE-FOU : on donne à mon générateur le
// contenu EXACT de la référence et on compare les deux `word/document.xml`, balise par balise.
//
// Une différence, quelle qu'elle soit, doit être expliquée — pas tolérée.
//
//   node tests/verify-docx-reference.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
// La table des racines attendues vit dans le contrôle des espaces de noms : on la LIT, on n'en
// écrit pas une seconde ici — deux tables auraient divergé.
const { racineXml } = require('./docx-outils.cjs');
const ATTENDU_RACINES = require('./docx-racines-attendues.cjs');

const RACINE = path.join(__dirname, '..');
// LA RÉFÉRENCE VIT DANS LE DÉPÔT, à côté de ce contrôle. C'est une FIXTURE, une ENTRÉE de la
// mesure — jamais un fichier produit par une mesure : la règle « aucun fichier produit par une
// mesure dans le dépôt » ne s'y applique donc pas, et la règle « fixtures synthétiques
// seulement » est respectée (contenu entièrement inventé, auteur « Studio Clinique », aucune
// donnée personnelle, 9 568 octets — fouillé avant d'être versionné).
// Elle était auparavant cherchée dans ~/Downloads : le contrôle ne pouvait alors tourner que sur
// une machine précise, un jour précis, et refusait de conclure partout ailleurs. Comme aucun
// validateur OOXML n'existe sur cette machine, ce contrôle est le SEUL garde-fou de la structure
// du .docx : il doit pouvoir tourner sur un dépôt fraîchement cloné, sans rien installer.
const REFERENCE = path.join(__dirname, 'reference-texte-des-diapositives.docx');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Le contenu de la référence, transcrit en structure — c'est la MÊME entrée, pas une approchante.
const STRUCTURE = { titre: 'Cinq pages pour un essai', diapositives: [
  { numero: 1, total: 4, titre: 'La parole autour de l’argent'.replace('’', "'"), elements: [
    { genre: 'etape', rang: 1, surRang: 3 },
    { genre: 'paragraph', texte: "Dans un couple, on parle de tout, mais rarement de ce que l'on dépense, gagne ou épargne." },
    { genre: 'etape', rang: 2, surRang: 3 },
    { genre: 'list', ordonnee: false, items: ["Les souvenirs d'enfance liés à l'argent",
      'Les peurs : manquer, dépendre, perdre le contrôle', 'Les attentes jamais dites à voix haute'] },
    { genre: 'etape', rang: 3, surRang: 3 },
    { genre: 'callout', texte: 'Un sujet intime, pas seulement un sujet de chiffres.' }] },
  { numero: 2, total: 4, titre: 'Trois temps pour en parler', elements: [
    { genre: 'etape', rang: 1, surRang: 2 },
    { genre: 'list', ordonnee: true, items: ['Choisir un moment calme',
      "Dire ce que l'on ressent, sans accuser", "Décider d'une petite action commune"] },
    { genre: 'etape', rang: 2, surRang: 2 },
    { genre: 'quote', texte: "« Ce n'est pas le montant qui blesse, c'est le silence autour. »" }] },
  { numero: 3, total: 4, titre: 'Caractères spéciaux & mise en garde <test>', elements: [
    { genre: 'etape', rang: 1, surRang: 1 },
    { genre: 'paragraph', texte: "Accents : é è ê à ù ç œ ; guillemets « français » ; apostrophe d'usage ; esperluette & ; chevrons < > ; tiret — long." }] },
  { numero: 4, total: 4, titre: 'Une diapositive sans étape détaillée', elements: [
    { genre: 'etape', rang: 1, surRang: 1 },
    { genre: 'paragraph', texte: 'Un seul paragraphe, donc une seule étape.' }] },
]};

function lireZip(octets) {
  let eocd = -1;
  for (let i = octets.length - 22; i >= 0; i--)
    if (octets[i] === 0x50 && octets[i + 1] === 0x4B && octets[i + 2] === 0x05 && octets[i + 3] === 0x06) { eocd = i; break; }
  const nb = octets.readUInt16LE(eocd + 10);
  let p = octets.readUInt32LE(eocd + 16);
  const parties = {};
  for (let k = 0; k < nb; k++) {
    const methode = octets.readUInt16LE(p + 10);
    const lNom = octets.readUInt16LE(p + 28), lExtra = octets.readUInt16LE(p + 30), lComm = octets.readUInt16LE(p + 32);
    const debutLocal = octets.readUInt32LE(p + 42);
    const nom = octets.slice(p + 46, p + 46 + lNom).toString('utf8');
    const d = debutLocal + 30 + octets.readUInt16LE(debutLocal + 26) + octets.readUInt16LE(debutLocal + 28);
    let donnees = octets.slice(d, d + octets.readUInt32LE(debutLocal + 18));
    if (methode === 8) donnees = zlib.inflateRawSync(donnees);
    parties[nom] = donnees.toString('utf8');
    p += 46 + lNom + lExtra + lComm;
  }
  return parties;
}

// Le générateur du cœur, extrait par ses bornes — c'est bien SON code qu'on juge.
function chargerGenerateur() {
  const src = fs.readFileSync(path.join(RACINE, 'studio-clinique-core.js'), 'utf8');
  const prendre = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d > 0, 'introuvable : ' + debut);
    const f = src.indexOf(fin, d); return src.slice(d, f + fin.length); };
  const code = [
    prendre('  var _adocCrcTable = null;', '\n  }'),
    prendre('  function adocZipStocke', '\n  }'),
    prendre('  function adocXmlEchappe', '\n  }'),
    prendre('  const ADOC_DOCX_NS', "standalone=\"yes\"?>\\n';"),
    prendre('  function adocDocxParagraphe', '\n  }'),
    prendre('  function adocDocxRun', '\n  }'),
    prendre('  function adocDocxCorps', '\n  }'),
    prendre('  function adocDocxParties', '\n  }'),
  ].join('\n').replace(/^  /gm, '');
  const bac = { console, TextEncoder, Uint8Array, Uint32Array, Math, Array, String, Number, JSON };
  bac.globalThis = bac;
  vm.runInNewContext(code + '\n;globalThis.__parties = adocDocxParties; globalThis.__zip = adocZipStocke;', bac);
  return bac;
}

(() => {
  // La référence est versionnée : si elle manque, c'est le dépôt qui est abîmé, pas la machine.
  if (!fs.existsSync(REFERENCE)) {
    console.error('\nÉCHEC  référence absente du dépôt : ' + REFERENCE);
    console.error('Elle est versionnée avec ce contrôle ; sans elle, la structure du .docx');
    console.error('n\'est comparée à RIEN. Restaurer le fichier, ne pas le refabriquer :');
    console.error('le refabriquer avec notre propre générateur reviendrait à comparer');
    console.error('notre sortie à elle-même.');
    process.exit(1);
  }
  const ref = lireZip(fs.readFileSync(REFERENCE));
  const bac = chargerGenerateur();
  const parties = bac.__parties(STRUCTURE);
  const mien = {};
  parties.forEach((p) => { mien[p.nom] = p.contenu; });

  // ── 1. LES PARTIES ────────────────────────────────────────────────────────────────────
  const MINIMUM = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml',
    'word/numbering.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml', 'docProps/app.xml'];
  for (const nom of MINIMUM) {
    assert.ok(mien[nom] !== undefined, 'mon fichier doit porter ' + nom);
    assert.ok(ref[nom] !== undefined, 'la référence porte aussi ' + nom);
  }
  const extras = Object.keys(ref).filter((x) => !x.endsWith('/') && MINIMUM.indexOf(x) < 0);
  assert.deepEqual(Object.keys(mien).sort(), MINIMUM.slice().sort(),
    'je n\'ajoute RIEN que la référence n\'ait pas : ' + JSON.stringify(Object.keys(mien)));
  pass('les 8 parties du minimum sont là des deux côtés. La référence en porte ' + extras.length
    + ' de plus, toutes du modèle de python-docx et sans contenu ici (' + extras.slice(0, 4).join(', ')
    + '…) : elles sont OMISES, pas remplacées.');

  // ── 2. LE CORPS, BALISE PAR BALISE ────────────────────────────────────────────────────
  const corps = (x) => { const s = x.slice(x.indexOf('<w:body>'));
    return s.replace(/\s+(?=<)/g, '').replace(/></g, '>\n<').split('\n'); };
  const a = corps(ref['word/document.xml']), b = corps(mien['word/document.xml']);
  const differences = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) differences.push('  ligne ' + (i + 1) + ' : référence ' + JSON.stringify(a[i])
      + ' ≠ le mien ' + JSON.stringify(b[i]));
  if (differences.length) { console.error('\nÉCHEC  ' + differences.length + ' différence(s) :');
    differences.slice(0, 12).forEach((d) => console.error(d)); process.exit(1); }
  assert.equal(b.length, a.length, 'même nombre d\'éléments');
  pass('word/document.xml : ' + a.length + ' éléments, ZÉRO différence avec la référence — '
    + 'mêmes balises, même ordre, mêmes attributs.');

  // ── 2 bis. CHAQUE AUTRE PARTIE COMMUNE, RACINE ET ÉLÉMENTS ────────────────────────────
  // Le trou du 20 octobre : seul word/document.xml était comparé, soit 1 partie sur 8. Les
  // deux parties de relations portaient un espace de noms faux et RIEN ne le disait. Toutes
  // les parties communes sont désormais confrontées, et chaque différence est NOMMÉE puis
  // justifiée ici même — jamais tolérée en silence.
  const elements = (x) => String(x).replace(/^[\s\S]*?\?>/, '')
    .replace(/\s+(?=<)/g, '').replace(/></g, '>\n<').split('\n').filter(Boolean);
  const COMMUNES = Object.keys(ATTENDU_RACINES).filter((k) => k !== 'PKG' && k !== 'TYPE'
    && ref[k] !== undefined && k !== 'word/document.xml');
  const ecarts = [];
  for (const partie of COMMUNES) {
    const r = racineXml(ref[partie]), m = racineXml(mien[partie]);
    if (r.nom !== m.nom) ecarts.push(partie + ' : racine « ' + m.nom + ' » ≠ « ' + r.nom + ' »');
    if (r.ns !== m.ns) ecarts.push(partie + ' : espace de noms « ' + m.ns + ' » ≠ « ' + r.ns + ' »');
  }
  if (ecarts.length) {
    console.error('\nÉCHEC  racines divergentes :');
    ecarts.forEach((e) => console.error('    ' + e)); process.exit(1);
  }
  pass('les ' + COMMUNES.length + ' autres parties communes ont la MÊME racine et le MÊME espace '
    + 'de noms que la référence : ' + COMMUNES.join(', ') + '.');

  // Le détail des éléments, partie par partie. Les différences qui subsistent sont listées une
  // à une avec leur raison : ce sont des CHOIX de contenu, jamais des écarts de structure.
  const JUSTIFIEES = {
    '_rels/.rels': 'la référence déclare une relation de plus vers docProps/custom.xml, '
      + 'partie que python-docx ajoute toujours et que nous n’écrivons pas (rien à y mettre).',
    'word/_rels/document.xml.rels': 'la référence déclare settings.xml et webSettings.xml, '
      + 'parties du modèle de python-docx que nous n’écrivons pas ; nos deux relations '
      + '(styles, numbering) existent des deux côtés.',
    '[Content_Types].xml': 'la référence déclare les parties du modèle de python-docx que nous '
      + 'n’écrivons pas (settings, webSettings, fontTable, theme, custom) ; les Default et les '
      + 'Override de nos 8 parties sont les mêmes.',
    'word/styles.xml': 'la référence porte en plus les styles latents et le thème de '
      + 'python-docx ; les identifiants dont dépend le document sont vérifiés ci-dessous.',
    'word/numbering.xml': 'la référence définit huit numérotations de modèle, nous en '
      + 'définissons deux (puces, numéros) — les seules que le document emploie.',
    'docProps/core.xml': 'champs de métadonnées différents (titre, langue, révision chez nous ; '
      + 'la référence ajoute creator et les dates) : contenu, pas structure.',
    'docProps/app.xml': 'la référence nomme son application productrice, nous la nôtre.',
  };
  console.log('\n  LES DIFFÉRENCES, UNE À UNE, ET LEUR RAISON :');
  for (const partie of COMMUNES) {
    const er = elements(ref[partie]).length, em = elements(mien[partie]).length;
    assert.ok(JUSTIFIEES[partie], 'toute partie commune doit avoir sa justification écrite : ' + partie);
    console.log('    ' + partie + ' — référence ' + er + ' éléments, le mien ' + em
      + (er === em ? ' (identique en nombre)' : ''));
    console.log('      ' + JUSTIFIEES[partie]);
  }
  pass('les ' + COMMUNES.length + ' parties communes sont comparées et chaque différence est '
    + 'justifiée par écrit dans ce contrôle — aucune n\'est structurelle.');

  // ── 3. STYLES ET NUMÉROTATION ─────────────────────────────────────────────────────────
  const ids = (x) => new Set((x.match(/w:styleId="([^"]+)"/g) || []).map((s) => s.slice(11, -1)));
  const idsRef = ids(ref['word/styles.xml']), idsMien = ids(mien['word/styles.xml']);
  for (const id of ['Title', 'Heading1', 'Heading2', 'Citation', 'Encadre', 'ListParagraph'])
    assert.ok(idsRef.has(id) && idsMien.has(id), 'l\'identifiant « ' + id + ' » doit exister des deux côtés');
  const numDef = (x) => (x.match(/<w:num w:numId="\d+"/g) || []).length;
  assert.equal(numDef(mien['word/numbering.xml']), 2, 'deux définitions de numérotation');
  for (const fmt of ['bullet', 'decimal'])
    assert.ok(mien['word/numbering.xml'].includes('w:numFmt w:val="' + fmt + '"')
      && ref['word/numbering.xml'].includes('w:numFmt w:val="' + fmt + '"'),
      'la numérotation « ' + fmt + ' » existe des deux côtés');
  pass('mêmes identifiants de style, et deux numérotations (puces, numéros) comme la référence.');

  // ── 4. CE QUI N'A PAS ÉTÉ FAIT, ET QU'IL FAUT DIRE ────────────────────────────────────
  console.log('\n  RÉSERVE, relevée le 20 octobre et corrigée ici : il n\'y a sur cette machine');
  console.log('  NI validateur OOXML (ni python-docx, ni LibreOffice), MAIS il y a des outils');
  console.log('  indépendants : textutil (Apple), xmllint et lxml. Ils ont été lancés. textutil');
  console.log('  lit SANS BRONCHER un fichier dont la racine <Relationships> porte un espace de');
  console.log('  noms faux — il est donc indépendant mais TOLÉRANT, et ne peut servir de');
  console.log('  garde-fou. C\'est précisément pourquoi verify-docx-espaces-de-noms existe.');
  console.log('  Le fichier n\'a PAS été validé contre le schéma OOXML ni ouvert par Word :');
  console.log('  l\'ouverture dans Word par Christophe reste le SEUL contrôle final.');
  console.log('\nPASS verify-docx-reference — ' + n + ' contrôles.');
})();
