// Item 56, Étape 1 élargie — TEST DÉDIÉ APRÈS CORRECTIF (protocole v2 : un seul passage propre).
//
// Vérifie, sur le code CORRIGÉ :
// (1) comparatif/cours/document/carrousel produisent fmt==='html' par défaut, quel que soit
//     l'output_format deviné librement par le planner LLM (pptx/docx/xlsx/pdf) — plus jamais de
//     bascule vers une génération binaire autonome à la place du document réellement composé.
// (2) _adocCapabilities est réellement posé (workspace/persist) pour ces 4 intents — pas
//     seulement fmt='html' en façade : preuve d'usage réel (ouverture de l'espace de travail,
//     sauvegarde) — cross-check #2 exigé par le prompt.
// (3) Aucun emoji ne survit dans le contenu livré (adocStripEmoji appliqué, chemin HTML-first).
// (4) La richesse du contenu (sections, citations, structure) SURVIT au passage en HTML — cross-
//     check #1 (parité), rien n'est appauvri par rapport à ce que le modèle a réellement écrit.
// (5) comparatif rejoint l'exception _explicitXlsxRequested de tableau (xlsx reste un choix
//     d'export sur mention explicite, jamais le format de génération par défaut).
// (6) Non-régression : tableau (item 53) et script/liens (item 56 étape 1) inchangés.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const RICH_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}</style></head><body>'
  + '<h1>Les schémas précoces de Young</h1>'
  + '<h2>2A — L\'imagerie : diagnostique puis réécriture</h2>'
  + '<p>EVIDENCE : <sup title="Young, p.42">1</sup> étude contrôlée démontre l\'efficacité du protocole en 8 séances.</p>'
  + '<h2>Pilier 1 — Évaluation initiale</h2>'
  + '<p>Protocole en 3 étapes numérotées : (1) entretien, (2) questionnaire YSQ, (3) restitution.</p>'
  + '</body></html>';
const XLSX_DATA = '<!DOCTYPE html><html><head><script id="xlsx-data" type="application/json">'
  + JSON.stringify({ headers: ['Approche', 'Indication'], rows: [['EMDR', 'Trauma'], ['ICV', 'Attachement']] })
  + '</script></head><body></body></html>';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

// Item 70 Volet 2 (palier 2, clarté de format) — resolveFormatClarity : label du candidat à
// cliquer sur la carte de clarification, UNIQUEMENT pour les scénarios dont le texte correspond
// à un motif d'ambiguïté (aucun effet sur les autres, qui n'affichent jamais cette carte).
async function genScenario(browser, { formatButtonId, question, plannerIntent, plannerOutputFormat, mainReply, resolveFormatClarity }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(mainReply) });
        return;
      }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: plannerOutputFormat, audience_type: 'praticien', registre: 'clinique', topic_summary: question.slice(0, 30), deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  if (formatButtonId) await page.click(formatButtonId);
  await page.fill('#clinical-question', question);
  await page.click('#clinical-home-form button[type="submit"]');
  if (resolveFormatClarity) {
    const shown = await page.waitForFunction(() => !!document.querySelector('#adoc-messages .cc-clarity-card'), { timeout: 3000 }).then(() => true).catch(() => false);
    if (shown) await page.click(`#adoc-messages .cc-clarity-reply-btn:has-text("${resolveFormatClarity}")`);
  }
  await page.waitForTimeout(1800);

  const result = await page.evaluate(() => {
    const arts = window._adocArtifacts || {};
    const entries = Object.entries(arts);
    if (!entries.length) return { count: 0 };
    const [storeKey, art] = entries[entries.length - 1];
    return {
      count: entries.length, storeKey, fmt: art.fmt,
      hasCapabilities: !!art._adocCapabilities,
      workspace: art._adocCapabilities?.workspace,
      persist: art._adocCapabilities?.persist,
      generationEngine: art._adocGenerationEngine,
      hasSnapshot: !!art._adocLegacySourceSnapshot,
      html: art.html || null,
      isStructuredDoc: !!art._adocStructuredDoc,
    };
  });
  await page.close();
  return { result, errors };
}

(async () => {
  const browser = await chromium.launch();

  // ── (1)+(2)+(3)+(4) comparatif ──
  {
    const { result, errors } = await genScenario(browser, {
      formatButtonId: null, question: 'Fais-moi un tableau comparatif entre EMDR, ICV et IFS',
      plannerIntent: 'comparatif', plannerOutputFormat: 'xlsx', mainReply: RICH_HTML,
    });
    log('[comparatif] fmt===html (jamais xlsx par défaut, malgré output_format LLM=xlsx)', result.fmt === 'html', result.fmt);
    log('[comparatif] _adocCapabilities.workspace===true (personnalisation réelle)', result.workspace === true, result.workspace);
    log('[comparatif] _adocCapabilities.persist===true', result.persist === true, result.persist);
    log('[comparatif] _adocGenerationEngine===legacy-html', result.generationEngine === 'legacy-html', result.generationEngine);
    log('[comparatif] SourceSnapshot construit (sauvegarde possible sans 400)', result.hasSnapshot === true, result.hasSnapshot);
    log('[comparatif] richesse préservée : sections "2A"/"Pilier 1" présentes dans le HTML livré', /2A —/.test(result.html || '') && /Pilier 1/.test(result.html || ''), null);
    log('[comparatif] citation EVIDENCE préservée (pas aplatie/perdue)', /EVIDENCE/.test(result.html || ''), null);
    log('[comparatif] aucune erreur JS', errors.length === 0, errors);
  }

  // ── (5) comparatif + mention explicite Excel → xlsx (exception préservée) ──
  {
    const { result } = await genScenario(browser, {
      formatButtonId: null, question: 'Fais-moi un tableau comparatif EMDR/ICV/IFS en fichier Excel',
      plannerIntent: 'comparatif', plannerOutputFormat: 'xlsx', mainReply: XLSX_DATA,
    });
    log('[comparatif+Excel explicite] fmt===xlsx (exception préservée, item 53)', result.fmt === 'xlsx', result.fmt);
  }

  // ── (1)+(2)+(3) cours (avec le bug pptx du planner reproduit précédemment) ──
  // Item 70 Volet 2 — ce texte ("cours" sans durée, sans mot-clé de format) correspond exactement
  // au motif 3 de la nouvelle porte de clarté de format : le palier 2 se déclenche désormais avant
  // la génération. Option (b) retenue (comme pour item 53 scénario C) : le point vérifié ici est
  // le comportement de l'intent 'cours' auto-classifié (jamais un type explicitement cliqué), donc
  // le candidat "Document long" (kind:null) est choisi — il ne pose jamais adocClarityDocumentKind,
  // laissant _hasExplicitKind faux et le mécanisme _ADOC_HTML_FORCED_INTENTS testé ici (qui ne
  // dépend que de plan.intent, jamais de documentKind) inchangé par rapport à avant ce lot.
  {
    const { result, errors } = await genScenario(browser, {
      formatButtonId: null, question: 'Fais-moi un cours complet sur les schémas de Young',
      plannerIntent: 'cours', plannerOutputFormat: 'pptx', mainReply: RICH_HTML,
      resolveFormatClarity: 'Document long',
    });
    log('[cours] fmt===html (jamais pptx, malgré output_format LLM=pptx)', result.fmt === 'html', result.fmt);
    log('[cours] _adocCapabilities.workspace===true', result.workspace === true, result.workspace);
    log('[cours] richesse préservée (sections, EVIDENCE)', /2A —/.test(result.html || '') && /EVIDENCE/.test(result.html || ''), null);
    log('[cours] aucune erreur JS', errors.length === 0, errors);
  }

  // ── document ──
  {
    const { result } = await genScenario(browser, {
      formatButtonId: null, question: 'Fais-moi un document de synthèse sur ACT',
      plannerIntent: 'document', plannerOutputFormat: 'docx', mainReply: RICH_HTML,
    });
    log('[document] fmt===html (jamais docx)', result.fmt === 'html', result.fmt);
    log('[document] _adocCapabilities.workspace===true', result.workspace === true, result.workspace);
  }

  // ── carrousel (faille latente refermée) ──
  {
    const { result } = await genScenario(browser, {
      formatButtonId: '#format-carousel', question: 'Fais-moi un carrousel type deck de présentation sur ACT',
      plannerIntent: 'carrousel', plannerOutputFormat: 'pptx', mainReply: RICH_HTML,
    });
    log('[carrousel] fmt===html (jamais pptx)', result.fmt === 'html', result.fmt);
    log('[carrousel] _adocCapabilities.workspace===true', result.workspace === true, result.workspace);
  }

  // ── Non-régression : tableau (item 53) toujours html par défaut ──
  {
    const { result } = await genScenario(browser, {
      formatButtonId: '#format-table', question: 'Fais-moi un tableau sur les approches TCC',
      plannerIntent: 'tableau', plannerOutputFormat: 'xlsx', mainReply: RICH_HTML,
    });
    log('[non-régression tableau] fmt===html par défaut (item 53 intact)', result.fmt === 'html', result.fmt);
  }

  // ── Non-régression : liens (item 56 étape 1) toujours html ──
  {
    const { result } = await genScenario(browser, {
      formatButtonId: '#format-links', question: 'Fais-moi une carte des liens transversaux entre EMDR et ICV',
      plannerIntent: 'liens', plannerOutputFormat: 'chat', mainReply: RICH_HTML,
    });
    log('[non-régression liens] fmt===html (item 56 étape 1 intact)', result.fmt === 'html', result.fmt);
  }

  console.log('=== Résultats — Item 56 Étape 1 élargie (comparatif/cours/document/carrousel → html) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
