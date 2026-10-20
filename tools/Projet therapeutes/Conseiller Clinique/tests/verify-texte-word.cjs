// Q2 — LE .docx, LU SUR LE FICHIER QUE LE VRAI BOUTON PRODUIT.
//
// L'outil de Christine est Microsoft Word, plus sévère que les autres : un ordre d'éléments non
// conforme lui fait proposer de « réparer » le fichier. Aucun validateur OOXML n'étant présent
// sur cette machine (ni python-docx, ni LibreOffice), LA COMPARAISON À LA RÉFÉRENCE EST LE SEUL
// GARDE-FOU, et ce fichier N'A PAS été ouvert par un vrai traitement de texte. C'est dit ici,
// et c'est dit dans le compte rendu.
//
//   NODE_PATH=<playwright> node tests/verify-texte-word.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const REFERENCE = path.join(os.homedir(), 'Downloads', 'reference-texte-des-diapositives.docx');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// ── LECTEUR ZIP INDÉPENDANT : il ne partage pas une ligne avec l'écrivain du cœur ───────────
// Il relit l'annuaire central, recalcule chaque CRC-32 et compare. Un écrivain qui se
// relirait lui-même ne prouverait rien.
function lireZip(octets) {
  const fin = octets.lastIndexOf(0x06, octets.length - 1);
  let eocd = -1;
  for (let i = octets.length - 22; i >= 0; i--) {
    if (octets[i] === 0x50 && octets[i + 1] === 0x4B && octets[i + 2] === 0x05 && octets[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('fin d\'annuaire central introuvable');
  const nb = octets.readUInt16LE(eocd + 10);
  let p = octets.readUInt32LE(eocd + 16);
  const parties = {};
  for (let k = 0; k < nb; k++) {
    if (octets.readUInt32LE(p) !== 0x02014b50) throw new Error('en-tête central invalide');
    const methode = octets.readUInt16LE(p + 10);
    const crc = octets.readUInt32LE(p + 16);
    const taille = octets.readUInt32LE(p + 24);
    const lNom = octets.readUInt16LE(p + 28);
    const lExtra = octets.readUInt16LE(p + 30);
    const lComm = octets.readUInt16LE(p + 32);
    const debutLocal = octets.readUInt32LE(p + 42);
    const nom = octets.slice(p + 46, p + 46 + lNom).toString('utf8');
    const lNomL = octets.readUInt16LE(debutLocal + 26);
    const lExtraL = octets.readUInt16LE(debutLocal + 28);
    const d = debutLocal + 30 + lNomL + lExtraL;
    let donnees = octets.slice(d, d + octets.readUInt32LE(debutLocal + 18));
    if (methode === 8) donnees = zlib.inflateRawSync(donnees);
    else if (methode !== 0) throw new Error('méthode de compression inattendue : ' + methode);
    const crcRecalcule = zlib.crc32 ? zlib.crc32(donnees) : crc32Manuel(donnees);
    if (crcRecalcule !== crc) throw new Error('CRC-32 faux pour ' + nom);
    if (donnees.length !== taille) throw new Error('taille fausse pour ' + nom);
    parties[nom] = donnees.toString('utf8');
    p += 46 + lNom + lExtra + lComm;
  }
  return parties;
}
function crc32Manuel(buf) {
  let t = crc32Manuel._t;
  if (!t) { t = crc32Manuel._t = new Int32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const texteDe = (xml) => xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();

(async () => {
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') { let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{}'); }); return; }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);

  const ouvrir = (doc, kind, moteur) => page.evaluate(async (a) => {
    const d = JSON.parse(JSON.stringify(a.d));
    if (a.kind) d.documentKind = a.kind;
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts.e = { name: d.title, _adocGenerationEngine: a.moteur || 'structured',
      _adocStructuredDoc: d, _adocStructuredSnapshot: null,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    return !!(await window.adocOpenWorkspace('e'));
  }, { d: doc, kind: kind, moteur: moteur });

  const exporter = async () => {
    await page.waitForFunction(() => {
      const b = document.getElementById('cc-ws-texte-word-btn'); return !!b && !b.hidden;
    }, { timeout: 20000 });
    const [tel] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('#cc-ws-texte-word-btn').click(),
    ]);
    return { nom: tel.suggestedFilename(), octets: fs.readFileSync(await tel.path()) };
  };

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });

    // Un document qui porte tout ce que Q2 doit savoir rendre.
    const doc = JSON.parse(JSON.stringify(PRESENTATION));
    doc.blocks[0].content.blocks.push({ id: 'list-01', type: 'list',
      content: { items: ['premier', 'deuxieme', 'troisieme'], ordered: false }, citationIds: [], validation: {} });
    doc.blocks[1].content.blocks.push({ id: 'list-02', type: 'list',
      content: { items: ['un', 'deux'], ordered: true }, citationIds: [], validation: {} });
    doc.blocks[2].content.blocks.push({ id: 'quote-01', type: 'quote',
      content: { text: '« Ce n’est pas le montant qui blesse. »' }, citationIds: [], validation: {} });
    doc.blocks[3].content.blocks.push({ id: 'callout-01', type: 'callout',
      content: { text: 'Un sujet intime & délicat <attention>', visualRole: 'info' }, citationIds: [], validation: {} });
    assert.ok(await ouvrir(doc), 'la présentation doit s\'ouvrir');

    // ── 1. L'ARCHIVE, RELUE PAR UN LECTEUR INDÉPENDANT ────────────────────────────────────
    const fichier = await exporter();
    const parties = lireZip(fichier.octets);
    const attendues = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml',
      'word/numbering.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml', 'docProps/app.xml'];
    assert.deepEqual(Object.keys(parties).sort(), attendues.slice().sort(),
      'les huit parties attendues, et rien d\'autre : ' + JSON.stringify(Object.keys(parties)));
    assert.ok(/^texte-des-diapositives-\d{4}-\d{2}-\d{2}\.docx$/.test(fichier.nom),
      'X5 — nom stable, sans espace ni accent : ' + fichier.nom);
    pass('archive valide, CRC-32 recalculés par un lecteur indépendant, 8 parties, « ' + fichier.nom + ' » ('
      + fichier.octets.length + ' octets).');

    // ── 2. CHAQUE PARTIE EST BIEN FORMÉE, ET DÉCLARÉE ─────────────────────────────────────
    const { DOMParser } = require(path.join(RACINE, 'tests', 'xmldom-leger.cjs'));
    for (const nom of attendues) {
      const err = DOMParser(parties[nom]);
      assert.equal(err, null, nom + ' doit être du XML bien formé : ' + err);
    }
    const ct = parties['[Content_Types].xml'];
    for (const nom of attendues.filter((x) => !/rels$|\.rels/.test(x) && x !== '[Content_Types].xml')) {
      assert.ok(ct.includes('PartName="/' + nom + '"'), nom + ' doit figurer dans [Content_Types].xml');
    }
    assert.ok(ct.includes('Extension="rels"') && ct.includes('Extension="xml"'),
      'les deux extensions par défaut doivent être déclarées');
    for (const [source, cible] of [['_rels/.rels', ''], ['word/_rels/document.xml.rels', 'word/']]) {
      for (const m of parties[source].matchAll(/Target="([^"]+)"/g)) {
        assert.ok(parties[cible + m[1]] !== undefined,
          'la relation vers « ' + m[1] +' » doit pointer vers une partie qui existe');
      }
    }
    pass('les 8 parties sont bien formées, toutes déclarées, et chaque relation pointe vers une partie réelle.');

    // ── 3. LE TEXTE EST CELUI DU .txt DE D7 ───────────────────────────────────────────────
    const txt = await page.evaluate(() => window.adocTexteDesDiapositives(
      window._adocArtifacts.e._adocStructuredDoc));
    const motsDocx = texteDe(parties['word/document.xml']).replace(/Diapositive (\d+) —/g, 'Diapositive $1 —');
    // Le .txt porte « N / total » et les puces ; le Word porte le numéro seul et de vraies
    // listes. On compare donc les MOTS, après avoir ôté ce qui est propre à chaque rendu.
    const normalise = (t) => t.replace(/Diapositive (\d+) \/ \d+ —/g, 'Diapositive $1 —')
      .replace(/\[étape (\d+)(?: sur \d+)?\]/g, (m, r) => 'ETAPE' + r)
      .replace(/Étape \d+-(\d+)/g, (m, r) => 'ETAPE' + r)
      .replace(/^[ \t]*[—•·]\s*/gm, '').replace(/^[ \t]*\d+\.\s*/gm, '')
      .replace(/Citation : |Encadré : /g, '')
      .replace(/\s+/g, ' ').trim();
    assert.equal(normalise(motsDocx), normalise(txt),
      'le texte du Word doit être celui du .txt de D7, aux marques de rendu près');
    pass('le texte du .docx est égal à celui du .txt de D7 (' + normalise(txt).length + ' caractères comparés).');

    // ── 4. TITRES, LISTES, CITATION, ENCADRÉ, CARACTÈRES SPÉCIAUX ─────────────────────────
    const d = parties['word/document.xml'];
    assert.ok((d.match(/w:pStyle w:val="Heading1"/g) || []).length === 5,
      'cinq titres de niveau 1, un par diapositive');
    assert.ok((d.match(/w:pStyle w:val="Heading2"/g) || []).length >= 8, 'des titres de niveau 2 pour les étapes');
    assert.ok(d.includes('<w:numId w:val="2"/>') && d.includes('<w:numId w:val="3"/>'),
      'les listes doivent utiliser la numérotation Word : puces (2) et numéros (3)');
    assert.ok(!/[—•]\s*premier/.test(texteDe(d)), 'jamais un tiret tapé en guise de puce');
    assert.ok(d.includes('w:pStyle w:val="Citation"') && d.includes('Citation : '), 'la citation est marquée et stylée');
    assert.ok(d.includes('w:pStyle w:val="Encadre"') && d.includes('Encadré : '), 'l\'encadré est marqué et stylé');
    assert.ok(d.includes('&amp;') && d.includes('&lt;attention&gt;'), 'les caractères spéciaux sont échappés');
    assert.ok(texteDe(d).includes('\u00AB Ce n\u2019est pas le montant qui blesse. \u00BB'),
      'les guillemets fran\u00e7ais et l\u2019apostrophe typographique passent tels quels');
    assert.ok(parties['word/styles.xml'].includes('w:lang w:val="fr-FR"'), 'la langue est le français');
    pass('5 titres de niveau 1, étapes en niveau 2, vraies listes à puces et numérotées, citation, encadré, '
      + 'caractères spéciaux, fr-FR.');

    // ── 5. LA COMPARAISON À LA RÉFÉRENCE ──────────────────────────────────────────────────
    if (fs.existsSync(REFERENCE)) {
      const ref = lireZip(fs.readFileSync(REFERENCE));
      // `w:styleId="` fait ONZE caractères, pas douze : la coupe était décalée d'un cran et
      // rendait « itle » au lieu de « Title ».
      const styleIds = (x) => (x.match(/w:styleId="([^"]+)"/g) || []).map((s) => s.slice(11, -1));
      const miens = new Set(styleIds(parties['word/styles.xml']));
      for (const id of ['Title', 'Heading1', 'Heading2', 'Citation', 'Encadre', 'ListParagraph']) {
        assert.ok(miens.has(id), 'l\'identifiant de style « ' + id + ' » doit exister, comme dans la référence');
        assert.ok(styleIds(ref['word/styles.xml']).includes(id), 'et la référence le porte aussi');
      }
      const num = (x) => (x.match(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="(\d+)"\/>/g) || []);
      assert.ok(num(parties['word/numbering.xml']).length === 2, 'deux définitions de numérotation');
      assert.ok(parties['word/numbering.xml'].includes('w:numFmt w:val="bullet"')
        && parties['word/numbering.xml'].includes('w:numFmt w:val="decimal"'),
        'une pour les puces, une pour les numéros, comme la référence');
      pass('mêmes identifiants de style que la référence, et deux définitions de numérotation (puces, numéros).');
    } else {
      pass('référence absente de ~/Downloads : la comparaison n\'a PAS été faite.');
    }

    // ── 6. LES CAS DIFFICILES ─────────────────────────────────────────────────────────────
    // DOCUMENT VIDE : le schéma des documents REFUSE une présentation sans diapositive, donc
    // l'application ne peut pas en ouvrir une. Le cas est éprouvé sur le générateur lui-même —
    // il ne doit ni échouer ni produire une archive cassée si on l'y mène un jour.
    const videOctets = await page.evaluate(() => {
      const o = window.adocDocxDesDiapositives({ title: 'Sans diapositive', blocks: [] });
      return Array.from(o);
    });
    const p2 = lireZip(Buffer.from(videOctets));
    assert.ok(p2['word/document.xml'].includes('<w:body>'), 'le document vide produit une archive valide');
    assert.ok(p2['word/document.xml'].includes('Sans diapositive'), 'et il porte son titre');
    const cent = JSON.parse(JSON.stringify(PRESENTATION));
    cent.blocks = [];
    for (let i = 0; i < 100; i++) cent.blocks.push({ id: 'card-' + (i + 1), type: 'card',
      content: { title: 'Diapositive numero ' + (i + 1), imageRef: null, imageAlt: null,
        blocks: [{ id: 'p-' + (i + 1), type: 'paragraph', content: { text: 'Un paragraphe.' },
          citationIds: [], validation: {} }] }, citationIds: [], validation: {} });
    assert.ok(await ouvrir(cent), 'cent diapositives doivent s\'ouvrir');
    const t0 = Date.now();
    const f3 = await exporter();
    const duree = Date.now() - t0;
    const p3 = lireZip(f3.octets);
    assert.equal((p3['word/document.xml'].match(/w:pStyle w:val="Heading1"/g) || []).length, 100,
      'cent titres de niveau 1');
    pass('document vide (générateur seul, le schéma interdit d\'en ouvrir un) : archive valide · 100 diapositives : ' + Math.round(f3.octets.length / 1024)
      + ' Ko, ' + duree + ' ms, 100 titres.');

    // ── 6 bis. DEUX EXPORTS DE SUITE NE S'ÉCRASENT PAS (X5) ───────────────────────────────
    assert.ok(await ouvrir(doc), 'on rouvre la présentation');
    const n1 = (await exporter()).nom;
    const n2 = (await exporter()).nom;
    assert.notEqual(n1, n2, 'deux exports de suite doivent porter des noms différents : ' + n1);
    assert.ok(/^texte-des-diapositives-\d{4}-\d{2}-\d{2}(-\d+)?\.docx$/.test(n2),
      'le second nom reste conforme à X5 : ' + n2);
    pass('deux exports de suite ne s\'écrasent pas : « ' + n1 + ' » puis « ' + n2 + ' ».');

    // ── 6 ter. LE .txt DE D7 N'A PAS CHANGÉ ───────────────────────────────────────────────
    // La séparation structure/rendu ne devait RIEN changer à la sortie de D7. Le texte attendu
    // est figé ici : s'il bouge un jour, pour quelque raison que ce soit, ce contrôle le dira.
    const txtFige = await page.evaluate(() => window.adocTexteDesDiapositives(
      window._adocArtifacts.e._adocStructuredDoc));
    const ATTENDU_DEBUT = 'Cinq pages pour un essai\n\nDiapositive 1 / 5 — Premiere page\n  [étape 1 sur 4]\n  Trois temps';
    assert.ok(txtFige.startsWith(ATTENDU_DEBUT),
      'le .txt de D7 doit commencer exactement comme avant : ' + JSON.stringify(txtFige.slice(0, 90)));
    assert.ok(txtFige.includes('\n  — premier\n  — deuxieme\n  — troisieme'),
      'les puces du .txt sont inchangées');
    assert.ok(txtFige.includes('\n  1. un\n  2. deux'), 'les numéros du .txt sont inchangés');
    assert.ok(txtFige.endsWith('\n'), 'le .txt se termine par un saut de ligne, comme avant');
    pass('le .txt de D7 est inchangé : même en-tête, mêmes puces, mêmes numéros, même fin.');

    // ── 7. ABSENT HORS PRÉSENTATION ───────────────────────────────────────────────────────
    for (const cas of [{ kind: 'carrousel', moteur: 'structured', quoi: 'un carrousel' },
                       { kind: 'presentation', moteur: 'legacy-html', quoi: 'un document ancien' }]) {
      assert.ok(await ouvrir(PRESENTATION, cas.kind, cas.moteur), cas.quoi + ' doit s\'ouvrir');
      await page.waitForTimeout(500);
      const cache = await page.evaluate(() => {
        const b = document.getElementById('cc-ws-texte-word-btn'); return !b || b.hidden; });
      assert.ok(cache, 'le bouton Word doit être absent pour ' + cas.quoi);
    }
    pass('le bouton Word est absent pour un carrousel et pour un document ancien, comme celui de D7.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-texte-word — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
