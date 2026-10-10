// LA PRÉSENTATION D'ESSAI DU PASSAGE HUMAIN — sans aucune citation.
//
// Pourquoi elle existe : le contrôle qualité vérifie chaque citation contre le SourceSnapshot,
// c'est-à-dire contre les passages exacts de la bibliothèque. Un export HTML autonome ne porte
// PAS ces passages (mesuré : ni `exactText`, ni `contentChecksum`, ni snapshot). En mode local,
// le document rouvert depuis un export arrive donc avec un snapshot vide, et toute citation y
// est à juste titre « passage introuvable ». Le contrôle a raison ; c'est la présentation
// d'essai qui doit être sans citation.
//
// RIEN N'EST AFFAIBLI ICI : ce script ne touche à aucun contrôle. Il fabrique un document qui
// les passe tous, et il VÉRIFIE qu'ils ont bien tourné (qc.ran, aucune ligne bloquante).
//
//   NODE_PATH=<playwright> node tests/forger-presentation-essai.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const { REQUETE_PHOTO, PHOTO_DATA_URI } = require('./chutier-fixtures.cjs');

const CIBLE = path.join(RACINE, 'banc-chutier', 'entrees', 'presentation-essai-sans-citation.html');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

// Aucun `citationIds`, aucun `validation.citationLinks`, `citations: []`. C'est la seule
// différence qui compte avec la présentation de Christophe.
const bloc = (id, type, content) => ({ id, type, content, citationIds: [], validation: {} });
const DOC = {
  schemaVersion: 1,
  documentId: 'essai-passage-humain',
  versionId: 'essai-passage-humain-v1',
  previousVersionId: null,
  requestId: 'essai-passage-humain-r',
  sourceSnapshotId: 'essai-passage-humain-s',
  createdAt: '2026-10-08T09:00:00Z',
  language: 'fr',
  status: 'draft',
  title: 'Essai du passage humain — trois temps d’un entretien',
  purpose: 'Présentation d’essai sans citation, pour éprouver l’écriture des narrations',
  audience: 'clinicien',
  documentKind: 'presentation',
  renderManifestId: 'manifest-default-001',
  derivedFrom: null,
  citations: [],
  blocks: [
    { id: 'slide-01', type: 'card', citationIds: [], validation: {},
      content: {
        title: 'Ouvrir l’entretien',
        imageRef: REQUETE_PHOTO,
        imageAlt: 'Un lac calme à l’aube, la brume au ras de l’eau',
        blocks: [
          bloc('heading-01', 'heading', { text: 'Trois temps, et rien de plus', level: 2 }),
          bloc('paragraph-01', 'paragraph', { text: 'Un entretien qui commence bien tient souvent à peu de chose : laisser le silence s’installer une seconde de plus que ce qui est confortable, et ne pas remplir ce silence à la place de la personne.' }),
          bloc('callout-01', 'callout', { text: 'Le premier temps ne sert pas à comprendre. Il sert à ce que la personne entende qu’elle a la place de parler.', visualRole: 'info' }),
        ],
      } },
    { id: 'slide-02', type: 'card', citationIds: [], validation: {},
      content: {
        title: 'Nommer sans interpréter',
        imageRef: null,
        imageAlt: null,
        blocks: [
          bloc('heading-02', 'heading', { text: 'Ce qui se dit, avant ce qu’on en pense', level: 2 }),
          bloc('list-01', 'list', { ordered: true, items: [
            'Reprendre les mots employés, sans les traduire dans les siens.',
            'Distinguer la sensation décrite de l’explication qui l’accompagne.',
            'Laisser l’explication de côté un moment, sans la contredire.',
          ] }),
          bloc('paragraph-02', 'paragraph', { text: 'Reformuler trop tôt revient à proposer une interprétation au moment où la personne cherche encore ses mots. L’interprétation viendra ; elle tiendra mieux une fois le récit posé.' }),
        ],
      } },
    { id: 'slide-03', type: 'card', citationIds: [], validation: {},
      content: {
        title: 'Refermer sans conclure',
        imageRef: null,
        imageAlt: null,
        blocks: [
          bloc('heading-03', 'heading', { text: 'Une fin ouverte, pas une fin molle', level: 2 }),
          bloc('quote-01', 'quote', { text: 'Ce qui n’a pas été dit aujourd’hui n’est pas perdu : il sera là la prochaine fois.' }),
        ],
      } },
  ],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    page.on('dialog', (d) => d.accept());
    // EN MODE LOCAL, comme Christophe : c'est là que le contrôle doit passer.
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocExportClinicalDocumentHTML === 'function'
      && typeof window.adocBuildStandalonePresentationHTML === 'function'
      && typeof window.adocValidateSchema === 'function');
    await page.evaluate(([cle, uri]) => { window.ADOC_EXPORT_IMAGES = { [cle]: uri }; },
      [REQUETE_PHOTO, PHOTO_DATA_URI]);

    // ── 1. Le document est valide pour le VRAI schéma ────────────────────────────────────────
    const schema = await page.evaluate((d) => {
      const r = window.adocValidateSchema('clinicalDocument', d);
      return { valid: !!r.valid, skipped: !!r.skipped, erreurs: (r.errors || []).slice(0, 4).map(String) };
    }, DOC);
    assert.equal(schema.skipped, false, 'AJV doit être actif');
    assert.equal(schema.valid, true, 'document invalide : ' + schema.erreurs.join(' | '));
    console.log('  ✓ valide pour le schéma réel (AJV actif)');

    // ── 2. LE CONTRÔLE QUALITÉ TOURNE, ET IL PASSE ───────────────────────────────────────────
    // Le snapshot est VIDE, exactement comme en mode local depuis un export. C'est ce qui
    // bloquait la présentation de Christophe ; sans citation, il n'y a rien à vérifier.
    const qc = await page.evaluate(async (d) => {
      const snapshot = { sourceSnapshotId: d.sourceSnapshotId, entries: [] };
      const r = await window.adocExportClinicalDocumentHTML(d, snapshot, null);
      return { bloque: !!r.blocked, autorise: !!(r.qc && r.qc.exportAllowed),
               bloquant: (r.qc && r.qc.blocking) || [], nonBloquant: (r.qc && r.qc.nonBlocking) || [],
               htmlOctets: r.html ? r.html.length : 0 };
    }, DOC);
    assert.equal(qc.bloque, false, 'export bloqué : ' + qc.bloquant.join(' | '));
    assert.equal(qc.autorise, true, 'le contrôle doit AUTORISER l\'export');
    assert.deepEqual(qc.bloquant, [], 'aucune ligne bloquante attendue');
    assert.ok(qc.htmlOctets > 1000, 'l\'export contrôlé doit produire du HTML');
    console.log('  ✓ contrôle qualité passé, snapshot VIDE : 0 ligne bloquante, '
      + qc.nonBloquant.length + ' non bloquante(s)'
      + (qc.nonBloquant.length ? ' — ' + qc.nonBloquant.join(' | ') : ''));

    // ── 3. L'export autonome interactif ──────────────────────────────────────────────────────
    // L'embarquement des images passe normalement par le Worker (adocExportFetchPhoto). En mode
    // local il n'y a pas de Worker, et la photo resterait absente de l'export. La fonction
    // expose pour cela une porte d'injection documentée (`opts.fetchPhoto`), prévue pour les
    // tests : on la lui donne ici, dans ce script de forge SEULEMENT. Rien n'est modifié dans
    // l'application, et aucun contrôle n'est touché — l'embarquement n'est pas un contrôle.
    const html = await page.evaluate(async ([d, uri]) => window.adocBuildStandalonePresentationHTML(d, {
      delaiMs: 0,
      fetchPhoto: async function () { return { url: uri, photographer: 'Essai local', source: 'fichier local' }; },
    }), [DOC, PHOTO_DATA_URI]);
    assert.ok(html.indexOf('window.ADOC_EXPORT_DOC') !== -1, 'l\'export doit embarquer son document');
    assert.ok(html.indexOf('data:image/jpeg;base64') !== -1, 'l\'export doit embarquer sa photo');
    fs.mkdirSync(path.dirname(CIBLE), { recursive: true });
    fs.writeFileSync(CIBLE, html);
    console.log('  ✓ export autonome écrit : ' + Math.round(html.length / 1024) + ' Ko');
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nPRÉSENTATION D\'ESSAI PRÊTE\n  ' + CIBLE);
    console.log('  3 diapositives, ' + DOC.blocks.reduce((a, c) => a + c.content.blocks.length, 0)
      + ' blocs, 1 photo, 0 citation');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC : ' + e.message); process.exit(1); });
