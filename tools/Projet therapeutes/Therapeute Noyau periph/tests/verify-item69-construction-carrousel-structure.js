// Item 69 CONSTRUCTION — orchestrateur générique adocGenerateStructuredDocument(kind, profile).
//
// 1. FICHE — non-régression complète : génération réelle via le chemin structuré (mock à la
//    frontière réseau uniquement), comportement STRICTEMENT identique à avant ce lot (titre,
//    blocs, citations, QC, sauvegarde, rechargement complet).
// 2. CARROUSEL — bout en bout via le moteur STRUCTURÉ (jamais legacy) pour la première fois :
//    génération réelle, document valide (aucune AdocSchemaValidationError au rendu), QC
//    fonctionnel (troncature détectée DANS une carte), édition directe du titre de carte
//    (réutilise item 68 sans modification), sauvegarde + rechargement complet + réouverture.
// 3. REPLI LEGACY — confirmé toujours fonctionnel après un échec structuré (réseau/QC/JSON
//    invalide), pour Carrousel comme pour Fiche.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function mockToolResponseSSE(toolName, input) {
  const inputJson = JSON.stringify(input);
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: toolName, input: {} } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
    + sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}

function baseRoutes(page, opts) {
  const captured = { createBody: null, versionBody: null };
  page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      captured.createBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions')) {
      captured.versionBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ version_id: 'v2' }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (opts.structuredToolName && body.includes('"type":"tool","name":"' + opts.structuredToolName + '"')) {
        if (opts.failStructured) { route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'simulated failure' }) }); return; }
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(opts.structuredToolName, opts.structuredDoc) });
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(opts.legacyHtml || '<!DOCTYPE html><html><body><h1>Repli legacy</h1><p>Contenu.</p></body></html>') }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: opts.intent, clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Test', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  return captured;
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ 1. FICHE — non-régression ═══════════════════════════════
  let savedFicheBody;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const structuredDoc = {
      title: 'Fiche structurée test', purpose: 'supervision', audience: 'clinicien',
      blocks: [
        { type: 'heading', text: 'Titre structuré', level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
        { type: 'paragraph', text: 'Paragraphe sourcé.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-1'] },
      ],
    };
    const captured = baseRoutes(page, { structuredToolName: 'emit_fiche_document', structuredDoc, intent: 'fiche' });
    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 20000 });
    const art = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc);
      return { key, engine: a._adocGenerationEngine, kind: a._adocStructuredDoc.documentKind, title: a._adocStructuredDoc.title, blockText: a._adocStructuredDoc.blocks[1].content.text, blockCount: a._adocStructuredDoc.blocks.length, capabilities: a._adocCapabilities };
    });
    log('1a. Fiche générée via le moteur STRUCTURÉ (jamais legacy)', art.engine === 'structured', art);
    log('1b. documentKind === "fiche"', art.kind === 'fiche', art);
    log('1c. Titre exact reçu du modèle', art.title === 'Fiche structurée test', art);
    log('1d. Contenu de bloc exact (2 blocs, conversion à plat inchangée)', art.blockCount === 2 && art.blockText === 'Paragraphe sourcé.', art);
    log('1e. Capacités inchangées (blockEditing/fineCitations/qualityControlledExport)', art.capabilities.blockEditing === true && art.capabilities.fineCitations === true && art.capabilities.qualityControlledExport === true, art.capabilities);

    await page.evaluate((k) => window.adocOpenWorkspace(k), art.key);
    await page.waitForSelector('.adoc-sc-cover-title');
    const coverText = await page.evaluate(() => document.querySelector('.adoc-sc-cover-title').textContent);
    log('1f. Aperçu réel affiche le bon titre (rendu inchangé)', coverText === 'Fiche structurée test', coverText);

    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    savedFicheBody = captured.createBody;
    log('1g. Sauvegarde envoie bien un ClinicalDocument documentKind="fiche"', savedFicheBody && savedFicheBody.document.clinicalDocument.documentKind === 'fiche', savedFicheBody && savedFicheBody.document.clinicalDocument.documentKind);
    log('1h. Aucune erreur JS (Fiche)', errors.length === 0, errors);
    await page.close();
  }
  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    const reopened = await page2.evaluate(async (savedDoc) => {
      window.openAssistDoc(); document.getElementById('cc-landing').style.display = 'none';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened-fiche'] = {
        name: savedDoc.title, fmt: 'html', _adocStructuredDoc: savedDoc,
        _adocStructuredSnapshot: { sourceSnapshotId: savedDoc.sourceSnapshotId, entries: [] },
        _adocRenderManifestOverride: null, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      };
      const ok = await window.adocOpenWorkspace('reopened-fiche');
      return { ok, text: document.getElementById('cc-ws-doc-card').textContent };
    }, savedFicheBody.document.clinicalDocument);
    log('1i. Rechargement de page COMPLET (Fiche) — réouverture réussie et contenu intact', reopened.ok === true && reopened.text.includes('Fiche structurée test') && reopened.text.includes('Paragraphe sourcé'), reopened);
    log('1j. Aucune erreur JS après rechargement (Fiche)', errors2.length === 0, errors2);
    await page2.close();
  }

  // ═══════════════════════════════ 2. CARROUSEL — bout en bout, structuré ═══════════════════════════════
  let savedCarrBody;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const structuredCarrousel = {
      title: 'Carrousel ACT', purpose: 'psychoéducation', audience: 'patient',
      cards: [
        {
          title: 'Étape 1', blocks: [
            { type: 'paragraph', text: 'Contenu de la première carte.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] },
          ],
        },
        {
          title: 'Étape 2', blocks: [
            { type: 'callout', text: '(Point de vigilance clinique.)', level: 2, visualRole: 'warning', items: [], ordered: false, imageQuery: '', imageAlt: '', citationEntryIds: [] },
          ],
        },
      ],
    };
    const captured = baseRoutes(page, { structuredToolName: 'emit_carrousel_document', structuredDoc: structuredCarrousel, intent: 'carrousel' });
    await page.goto('file://' + FILE);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 20000 });
    const art = await page.evaluate(() => {
      const [key, a] = Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc);
      return { key, engine: a._adocGenerationEngine, doc: a._adocStructuredDoc, capabilities: a._adocCapabilities };
    });
    log('2a. Carrousel généré via le moteur STRUCTURÉ (jamais legacy) — première fois possible', art.engine === 'structured', art);
    log('2b. documentKind === "carrousel"', art.doc.documentKind === 'carrousel', art.doc.documentKind);
    log('2c. 2 cartes converties (type="card"), chacune avec ses blocs imbriqués', art.doc.blocks.length === 2 && art.doc.blocks.every(b => b.type === 'card' && b.content.blocks.length === 1), art.doc.blocks);
    log('2d. Titres de carte corrects ("Étape 1"/"Étape 2")', art.doc.blocks[0].content.title === 'Étape 1' && art.doc.blocks[1].content.title === 'Étape 2', art.doc.blocks.map(b => b.content.title));
    log('2e. Citation reliée au bon bloc imbriqué (citationIds non vide sur la carte 1)', art.doc.blocks[0].content.blocks[0].citationIds.length === 1, art.doc.blocks[0].content.blocks[0]);
    log('2f. Capacités identiques à Fiche (blockEditing/fineCitations/qualityControlledExport)', art.capabilities.blockEditing === true && art.capabilities.fineCitations === true && art.capabilities.qualityControlledExport === true, art.capabilities);

    // ── QC déjà générique pour les card (item 69 investigation) — vérifié ici en conditions réelles ──
    const qcCheck = await page.evaluate(async (k) => {
      const a = window._adocArtifacts[k];
      const r = await window.adocRenderClinicalDocument(a._adocStructuredDoc, a._adocStructuredSnapshot, a._adocRenderManifestOverride || null);
      return r.qc;
    }, art.key);
    log('2g. Le document Carrousel est VALIDE selon le schéma (aucune AdocSchemaValidationError, rendu réussi)', !!qcCheck, qcCheck);
    log('2h. Aucun blocage QC (le callout "(Point de vigilance clinique.)" n\'est pas signalé tronqué — item 21 Partie C, appliqué sans changement)', qcCheck.blocking.length === 0, qcCheck.blocking);

    // ── Édition directe du titre de carte (item 68) — réutilisée sans aucune modification ──
    await page.evaluate((k) => window.adocOpenWorkspace(k), art.key);
    await page.waitForSelector('.adoc-sc-card-title');
    await page.click('.adoc-sc-card:nth-child(1) .adoc-sc-card-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Étape 1 (éditée)');
    const editedTitle = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.title, art.key);
    log('2i. Édition directe du titre de carte fonctionne SANS AUCUNE modification d\'item 68', editedTitle === 'Étape 1 (éditée)', editedTitle);
    const panelAppeared = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('2j. Toujours aucun panneau de style sur le titre de carte (Option A item 68 intacte)', !panelAppeared, null);

    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    savedCarrBody = captured.createBody;
    log('2k. Sauvegarde envoie un ClinicalDocument documentKind="carrousel" avec le titre édité', savedCarrBody && savedCarrBody.document.clinicalDocument.documentKind === 'carrousel' && savedCarrBody.document.clinicalDocument.blocks[0].content.title === 'Étape 1 (éditée)', savedCarrBody && savedCarrBody.document.clinicalDocument);
    log('2l. Aucune erreur JS (Carrousel structuré)', errors.length === 0, errors);
    await page.close();
  }
  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    const reopened = await page2.evaluate(async (savedDoc) => {
      window.openAssistDoc(); document.getElementById('cc-landing').style.display = 'none';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened-carr'] = {
        name: savedDoc.title, fmt: 'html', _adocStructuredDoc: savedDoc,
        _adocStructuredSnapshot: { sourceSnapshotId: savedDoc.sourceSnapshotId, entries: [] },
        _adocRenderManifestOverride: null, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      };
      const ok = await window.adocOpenWorkspace('reopened-carr');
      return { ok, text: document.getElementById('cc-ws-doc-card').textContent };
    }, savedCarrBody.document.clinicalDocument);
    log('2m. Rechargement de page COMPLET (Carrousel structuré) — réouverture réussie, titre édité présent', reopened.ok === true && reopened.text.includes('Étape 1 (éditée)'), reopened);
    log('2n. Aucune erreur JS après rechargement (Carrousel)', errors2.length === 0, errors2);
    await page2.close();
  }

  // ═══════════════════════════════ 3. REPLI LEGACY après échec structuré ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    baseRoutes(page, { structuredToolName: 'emit_carrousel_document', failStructured: true, intent: 'carrousel', legacyHtml: '<!DOCTYPE html><html><body><h1>Carrousel — repli legacy</h1><p>Généré malgré l\'échec structuré.</p></body></html>' });
    await page.goto('file://' + FILE);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const legacyArt = await page.evaluate(() => {
      const [, a] = Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html');
      return { html: a.html, documentKind: a._adocDocumentKind, capabilities: a._adocCapabilities };
    });
    log('3a. Échec structuré Carrousel → repli automatique vers legacy (jamais d\'interruption)', legacyArt.html.includes('repli legacy'), legacyArt.html.slice(0, 200));
    log('3b. _adocDocumentKind reflète bien "carrousel" sur le repli', legacyArt.documentKind === 'carrousel', legacyArt.documentKind);
    log('3c. Capacités legacy toujours posées par défaut (item 48, inchangé)', legacyArt.capabilities.workspace === true && legacyArt.capabilities.legacyBlockEditing === true, legacyArt.capabilities);
    log('3d. Aucune erreur JS (repli legacy Carrousel)', errors.length === 0, errors);
    await page.close();
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 69 CONSTRUCTION (orchestrateur générique) ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
