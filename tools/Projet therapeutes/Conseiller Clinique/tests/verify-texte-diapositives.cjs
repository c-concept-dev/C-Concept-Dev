// D7 — LE TEXTE DES DIAPOSITIVES, POUR LA NARRATION DE CHRISTINE.
//
// Ce qu'on exige : déterministe et SANS APPEL au modèle ; le numéro et le titre de chaque
// diapositive ; la marque de chaque étape ; les listes gardent leurs puces ; les tableaux sont
// rendus ligne par ligne ; les renvois de citation ne sont pas repris ; et le bouton
// télécharge un fichier texte identique à ce qu'il copie.
//
//   NODE_PATH=<playwright> node tests/verify-texte-diapositives.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  let appels = 0;
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') {
      // Le corps est DRAINÉ avant de répondre : sans cela la connexion peut être coupée côté
      // client, et la page n'achève pas son chargement — une heure perdue à chercher ailleurs.
      let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => { if (q.url === '/') appels++;
        r.writeHead(200, { 'content-type': 'application/json' }); r.end('{}'); });
      return;
    }
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
  // Pas de permission de presse-papiers demandée : en headless elle est refusée de toute façon,
  // et le code la traite déjà comme facultative — c'est le FICHIER qui fait foi.
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   erreur de page : ' + String(e.message).slice(0, 180)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);
  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    // Un document qui porte TOUT ce que D7 doit savoir rendre : liste, tableau, citations.
    await page.evaluate(async (d) => {
      const doc = JSON.parse(JSON.stringify(d));
      doc.blocks[0].content.blocks.push({ id: 'list-01', type: 'list',
        content: { items: ['premier element', 'deuxieme element', 'troisieme element'], ordered: false },
        citationIds: [], validation: {} });
      // PAS de bloc « table » ici : une diapositive n'en admet pas
      // (block.schema.json#/$defs/nestedBlock). Le rendu des tableaux est éprouvé plus bas,
      // sur la fonction elle-même, avec un document qui a le droit d'en porter.
      // Des citations CONFORMES au schéma (citationId, sourceSnapshotEntryId, displayLabel).
      // J'en avais d'abord inventé la forme : le document devenait invalide, l'application
      // refusait de l'afficher, et la barre ne révélait plus aucun bouton — le contrôle
      // échouait loin de sa cause.
      doc.citations = [
        { citationId: 'cit-01', sourceSnapshotEntryId: 'snap-01', displayLabel: 'Bowlby 1969' },
        { citationId: 'cit-02', sourceSnapshotEntryId: 'snap-02', displayLabel: 'Gottman 1999' }];
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.e = { name: doc.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: doc, _adocStructuredSnapshot: null,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      await window.adocOpenWorkspace('e');
    }, PRESENTATION);

    // ── 1. LE BOUTON EST OFFERT, ET IL TÉLÉCHARGE ────────────────────────────────────────
    // La barre se rafraîchit juste APRÈS l'ouverture : on attend la condition, on ne la suppose pas.
    await page.waitForFunction(() => {
      const b = document.getElementById('cc-ws-texte-diapositives-btn');
      return !!b && !b.hidden;
    }, { timeout: 20000 }).catch(async () => {
      console.log('   ce que l_application dit : '
        + (await page.evaluate(() => (document.body.innerText || '').slice(0, 300))).replace(/\s+/g, ' '));
      throw new Error('le bouton n_est pas apparu');
    });
    const [tel] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('#cc-ws-texte-diapositives-btn').click(),
    ]);
    const texte = fs.readFileSync(await tel.path(), 'utf8');
    assert.ok(/\.txt$/.test(tel.suggestedFilename()), 'le fichier doit être un .txt : ' + tel.suggestedFilename());
    pass('le bouton télécharge « ' + tel.suggestedFilename() + ' » (' + texte.length + ' caractères).');

    // ── 2. LE FORMAT ──────────────────────────────────────────────────────────────────────
    const lignes = texte.split('\n');
    for (let i = 1; i <= 5; i++) {
      assert.ok(lignes.some((l) => l.startsWith('Diapositive ' + i + ' / 5 — ')),
        'la diapositive ' + i + ' doit porter son numéro, le total et son titre');
    }
    assert.ok(/\[étape \d+/.test(texte), 'la marque des étapes doit être là');
    assert.ok(lignes.some((l) => l.trim() === '— premier element'), 'les listes gardent leurs puces');
    const etapes = texte.match(/\[étape \d+[^\]]*\]/g) || [];
    pass('format : 5 diapositives numérotées et titrées, ' + etapes.length
      + ' marques d\'étape, puces gardées.');

    // ── 2 bis. LES TABLEAUX, LIGNE PAR LIGNE ──────────────────────────────────────────────
    // Une diapositive n'admet pas de tableau ; on éprouve donc le rendu sur un document qui a
    // le droit d'en porter, par la même fonction.
    const tableau = await page.evaluate(() => window.adocTexteDesDiapositives({
      title: 'Avec un tableau', blocks: [{ id: 'card-t', type: 'card', content: {
        title: 'Une comparaison', imageRef: null, imageAlt: null, blocks: [
          { id: 'tb', type: 'table', content: { headers: ['Avant', 'Apres'],
            rows: [['a', 'b'], ['c', 'd']] }, citationIds: [], validation: {} }] },
        citationIds: [], validation: {} }] }));
    const lt = tableau.split('\n').map((l) => l.trim());
    assert.ok(lt.includes('Avant | Apres'), 'les en-têtes du tableau, sur une ligne : ' + JSON.stringify(lt));
    assert.ok(lt.includes('a | b') && lt.includes('c | d'), 'le tableau est rendu LIGNE PAR LIGNE');
    pass('tableau : en-têtes puis une ligne par ligne, colonnes séparées par « | ».');

    // ── 3. LES RENVOIS DE CITATION NE SONT PAS REPRIS ────────────────────────────────────
    assert.ok(!/cit-01|cit-02|Bowlby|Gottman|Sources/.test(texte),
      'aucun renvoi de citation ne doit figurer dans le texte de narration');
    pass('aucun renvoi de citation : ni identifiant, ni référence, ni section « Sources ».');

    // ── 4. DÉTERMINISTE, ET SANS AUCUN APPEL AU MODÈLE ───────────────────────────────────
    const avant = appels;
    const deux = await page.evaluate(() => window.adocTexteDesDiapositives(
      window._adocArtifacts.e._adocStructuredDoc));
    const trois = await page.evaluate(() => window.adocTexteDesDiapositives(
      window._adocArtifacts.e._adocStructuredDoc));
    assert.equal(deux, trois, 'deux extractions doivent donner exactement le même texte');
    assert.equal(deux, texte, 'le texte copié et le texte téléchargé doivent être identiques');
    assert.equal(appels, avant, 'aucun appel au modèle : ' + (appels - avant));
    pass('déterministe (deux extractions identiques), identique au fichier, et zéro appel au modèle.');
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-texte-diapositives — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message));
  console.error((e && e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(1); });
