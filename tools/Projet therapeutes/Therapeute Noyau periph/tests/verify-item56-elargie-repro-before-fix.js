// Item 56, Étape 1 élargie — REPRODUCTION AVANT CORRECTIF (protocole v2, étape 0).
//
// Confirme, sur le code NON modifié :
// (a) comparatif : intent==='comparatif' force TOUJOURS fmt='xlsx', quel que soit output_format
//     du planner (_intentOverridesXlsx, Site 2 ~L4410 ; _INTENT_FMT_OVERRIDE.comparatif, Site 3
//     ~L5890) — jamais de HTML personnalisable en aperçu, contrairement à la nouvelle décision.
// (b) cours : quand le planner LLM devine lui-même output_format='pptx' (jugement libre, ex.
//     demande de cours perçue comme présentation), _isLongDoc EXCLUT ce cas (pptx dans la liste
//     binaire ~L5393/5405) → bascule sur le pipeline standard → fmt='pptx' au lieu de
//     'html-visual' → génération autonome pptx-data (badges/bullets EMOJI, jamais passés par
//     adocStripEmoji, contrairement au chemin HTML-first ~L6030) → AUCUNE _adocCapabilities.
//     C'est le bug réel du 13 septembre (console observée : intent=cours fmt=pptx).
// (c) document : même mécanisme que cours avec output_format='docx'.
// (d) carrousel : faille latente identique, jamais encore observée en usage réel — planner
//     devine output_format='pptx' pour une demande de carrousel (mots-clés "présentation
//     slides"/"deck" du plannerSystem) → même bascule non désirée vers pptx.
// (e) même un cours "normal" qui atterrit correctement sur 'html-visual' (fmt PAS binaire) ne
//     reçoit JAMAIS _adocCapabilities aujourd'hui : le gate est exactement fmt==='html' dans
//     adocFinalizeGeneration (~L4771), or html-visual est livré comme fmt:'zip' (~L6037-6039) —
//     jamais 'html'. Donc même le cas "sans bug pptx" n'est pas personnalisable aujourd'hui.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}</style></head><body><h1>Titre</h1><p>Texte réel.</p></body></html>';
// Reproduit EXACTEMENT le mécanisme signalé par Christophe (comparaison directe aperçu/.pptx) :
// le modèle, malgré l'instruction "UNIQUEMENT ce JSON" du contrat pptx-data (_isDataEmbed),
// produit quand même un document HTML riche et personnalisé (sections numérotées, encadré
// EVIDENCE avec citation, badges avec emoji) SANS le script pptx-data attendu. adocDeliverArtifact
// retombe alors sur adocParsePptxSlides(markdown, topic) — un aplatissement Markdown naïf
// (## / - uniquement) de ce même HTML, qui perd les citations/images/mise en forme et ne filtre
// jamais les emojis (adocStripEmoji n'est JAMAIS appliqué sur ce chemin fmt==='pptx'). CE N'EST
// PAS une seconde génération indépendante (aucune deuxième recherche RAG, aucun deuxième appel
// planificateur dans ce code) — mais UNE SEULE génération dont deux dérivations radicalement
// divergentes sont produites : l'aperçu (html brut riche, stocké dans htmlBlobUrl) et le .pptx
// réellement téléchargé (markdown aplati, sans citations, sans filtre emoji).
const PPTX_MISCLASSIFIED_RICH_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
  + '<h1>Les schémas précoces de Young</h1>'
  + '<h2>2A — L\'imagerie : diagnostique puis réécriture</h2>'
  + '<div class="evidence"><p>EVIDENCE : <sup title="Young, p.42">1</sup> étude contrôlée démontre l\'efficacité du protocole en 8 séances.</p></div>'
  + '<p>⏱ 50 minutes ⏱ 🎯 Niveau avancé</p>'
  + '<img src="illustration.jpg" alt="Illustration">'
  + '<h2>Pilier 1 — Évaluation initiale</h2>'
  + '<p>Protocole en 3 étapes numérotées : (1) entretien, (2) questionnaire YSQ, (3) restitution.</p>'
  + '<h2>Pilier 2 — Intervention</h2>'
  + '<ul><li>Étape A</li><li>Étape B</li></ul>'
  + '</body></html>';
const DOCX_DATA = '<!DOCTYPE html><html><body><h1>Document</h1><p>Contenu réel.</p></body></html>';

async function runScenario(browser, { formatButtonId, question, plannerIntent, plannerOutputFormat, label }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) {
        // Simule un modèle QUI SUIT ses instructions système (fmt réellement calculé côté client) :
        // produit le format effectivement demandé par le system prompt, jamais un choix libre.
        let reply;
        if (body.includes('pptx-data')) reply = PPTX_MISCLASSIFIED_RICH_HTML;
        else if (body.includes('DOCX')) reply = DOCX_DATA;
        else reply = LEGACY_HTML;
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(reply) });
        return;
      }
      // Plan du planner LLM — jugement libre non contraint (intent/output_format simulant
      // exactement le scénario décrit).
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
  await page.waitForTimeout(1800);

  const result = await page.evaluate(() => {
    const arts = window._adocArtifacts || {};
    const entries = Object.entries(arts);
    if (!entries.length) return { count: 0 };
    const [storeKey, art] = entries[entries.length - 1];
    return {
      count: entries.length, storeKey, fmt: art.fmt,
      hasCapabilities: !!art._adocCapabilities,
      pptxSlidesRaw: art.pptxSlides ? JSON.stringify(art.pptxSlides) : null,
      htmlBlobUrlPresent: !!art.htmlBlobUrl,
      hasCitationInAperçu: !!(art.htmlBlobUrl && false), // aperçu réel non inspectable hors iframe ici
    };
  });
  const emojiRe = /[←-⯿\u{1F300}-\u{1FAFF}]/u;
  console.log(`[${label}] fmt='${result.fmt}' | count=${result.count} | _adocCapabilities=${result.hasCapabilities} | aperçu(htmlBlobUrl) stocké séparément=${result.htmlBlobUrlPresent} | .pptx slides contient emoji=${result.pptxSlidesRaw ? emojiRe.test(result.pptxSlidesRaw) : 'n/a'}`);
  if (result.pptxSlidesRaw) console.log(`[${label}] slides réellement envoyées au Worker /generate-pptx (contenu divergent de l'aperçu riche) :`, result.pptxSlidesRaw);
  console.log(`[${label}] erreurs JS:`, errors);
  await page.close();
  return result;
}

(async () => {
  const browser = await chromium.launch();
  console.log('=== REPRODUCTION — Item 56 Étape 1 élargie (comparatif/cours/document/carrousel), code NON modifié ===\n');

  await runScenario(browser, {
    formatButtonId: null, question: 'Fais-moi un tableau comparatif entre EMDR, ICV et IFS',
    plannerIntent: 'comparatif', plannerOutputFormat: 'html', label: 'comparatif (LLM output_format=html, intent=comparatif)',
  });

  await runScenario(browser, {
    formatButtonId: null, question: 'Fais-moi un cours complet sur les schémas de Young',
    plannerIntent: 'cours', plannerOutputFormat: 'pptx', label: 'cours (LLM output_format=pptx)',
  });

  await runScenario(browser, {
    formatButtonId: null, question: 'Fais-moi un document de synthèse sur ACT',
    plannerIntent: 'document', plannerOutputFormat: 'docx', label: 'document (LLM output_format=docx)',
  });

  await runScenario(browser, {
    formatButtonId: '#format-carousel', question: 'Fais-moi un carrousel type deck de présentation sur ACT',
    plannerIntent: 'carrousel', plannerOutputFormat: 'pptx', label: 'carrousel (LLM output_format=pptx, faille latente)',
  });

  // (e) cours "normal" (output_format correctement deviné html-visual) — confirme l'absence de
  // _adocCapabilities MÊME sans le bug pptx.
  await runScenario(browser, {
    formatButtonId: null, question: 'Fais-moi un cours complet sur ACT',
    plannerIntent: 'cours', plannerOutputFormat: 'html-visual', label: 'cours (LLM output_format=html-visual, cas "normal" sans bug pptx)',
  });

  await browser.close();
})();
