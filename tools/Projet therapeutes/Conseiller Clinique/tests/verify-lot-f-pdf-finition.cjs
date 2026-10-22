// Lot F: exercices du vrai constructeur PDF et du moteur Chromium, sans Worker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { pdfText, comparePieces, extractHtmlPieces, normalizeText } = require('./pdf-text-compare.cjs');

const root = path.join(__dirname, '..');
const output = process.env.ADOC_LOTF_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot-f-'));
fs.mkdirSync(output, { recursive: true });
const events = [
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_lot_f', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ title: 'Fixture pagination', purpose: 'formation', audience: 'praticien', cards: [{ title: 'Départ', blocks: [{ type: 'paragraph', text: 'Départ clinique.', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '', citationEntryIds: [] }] }] }) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
];
const reply = events.map(event => 'data: ' + JSON.stringify(event)).join('\n\n') + '\n\n';

async function buildFixture(page) {
  let captured;
  page.on('dialog', async d => { console.log('DIALOG', d.message()); await d.dismiss(); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text()); });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto('file://' + path.join(root, 'studio-clinique.html'));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/browser-rendering/generate-carrousel-pdf')) {
      captured = route.request().postDataJSON().html;
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%%EOF') });
    }
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch (_) {}
    if (body.payload?.tool_choice?.name === 'emit_presentation_document')
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: reply });
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  const key = await page.evaluate(async () => {
    const area = document.getElementById('adoc-messages');
    const node = document.createElement('div'); node.id = 'typing-lot-f'; node.innerHTML = '<div class="adoc-bubble"></div>'; area.appendChild(node);
    await window.adocRunGenerationPipeline('Fais une présentation clinique.',
      { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
      'typing-lot-f', 'https://clone-proxy.test.local', { chunks: [{ content: 'Passage clinique.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] });
    return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
  });
  assert.ok(key, 'artefact local absent');
  return { key, getHtml: () => captured };
}

async function exportFixture(browser, renderBrowser, page, fixture, kind) {
  const result = await page.evaluate(async ({ key, kind, annexeCount }) => {
    const art = window._adocArtifacts[key];
    const original = art._adocStructuredDoc.blocks[0];
    const paragraph = original.content.blocks[0];
    const card = structuredClone(original);
    card.id = 'lot-f-card-' + kind;
    card.content.title = kind === 'questionnaire' ? 'Évaluation du couple' : 'Histoire du couple';
    card.content.imageRef = null; card.content.imageAlt = null;
    card.content.blocks = [];
    if (kind === 'questionnaire') {
      const questions = [
        "Quand vous pensez à l'argent dans votre couple, quelle est votre première réaction spontanée ?",
        "À quelle fréquence parlez-vous ouvertement d'argent avec votre partenaire ?",
        'Avez-vous une idée claire des valeurs financières de votre partenaire ?',
        "Lors d'un désaccord financier, comment cela se passe-t-il généralement ?",
        'Avez-vous le sentiment que la gestion financière est équitable dans votre couple ?',
      ];
      card.content.blocks.push({ id: 'lot-f-questionnaire', type: 'questionnaire', citationIds: [], validation: {}, content: {
        questions: questions.map((text, i) => ({ text, options: Array.from({ length: i < 2 ? 3 : 4 }, (_, j) => ({
          text: 'Choix question ' + (i + 1) + ' réponse ' + (j + 1) + ' : ' + 'Nous en parlons de façon suffisamment claire et régulière.', points: j,
        })) })),
        profiles: [
          { label: 'À explorer', minScore: 0, maxScore: 7, interpretation: 'Un dialogue à poursuivre.' },
          { label: 'Dialogue installé', minScore: 8, maxScore: 15, interpretation: 'Des échanges déjà réguliers.' },
        ], allowTwoPartners: false,
      } });
    } else if (kind === 'annexe') {
      const p = structuredClone(paragraph);
      p.id = 'lot-f-annexe-card';
      p.content.text = 'Introduction à l’histoire du couple. ' + 'Les liens se construisent au fil des expériences et des contextes sociaux. '.repeat(9);
      card.content.blocks.push(p);
      art._adocStructuredDoc.deepDives = [{ id: 'lot-f-annexe', title: 'Annexe sur l’histoire clinique', paragraphs: [
        ...Array.from({ length: annexeCount }, (_, i) => 'Paragraphe d’annexe ' + String(i + 1).padStart(2, '0') + '. ' + 'Les modèles du couple ont changé avec les institutions, les époques et les pratiques cliniques. '.repeat(4)),
        "Ce modèle est aujourd'hui l'un des fondements de toute thérapie de couple moderne.",
      ] }];
    } else if (kind === 'widow') {
      const p = structuredClone(paragraph);
      p.id = 'lot-f-widow';
      p.content.text = Array.from({ length: 85 }, (_, i) => 'Ligne du paragraphe continu ' + String(i + 1).padStart(2, '0') + ' : preuve de texte préservé.').join('\n');
      card.content.blocks.push(p);
    } else {
      for (let i = 0; i < 31; i++) {
        const p = structuredClone(paragraph);
        p.id = 'lot-f-p-' + i;
        p.content.text = 'Paragraphe historique ' + String(i + 1).padStart(2, '0') + '. ' +
          'Les relations de couple évoluent avec la société, les institutions et les pratiques cliniques. '.repeat(i === 30 ? 1 : 3);
        card.content.blocks.push(p);
      }
      const last = structuredClone(paragraph);
      last.id = 'lot-f-final';
      last.content.text = "Ce modèle est aujourd'hui l'un des fondements de toute thérapie de couple moderne.";
      card.content.blocks.push(last);
    }
    art._adocStructuredDoc.blocks = [card];
    await window.adocOpenWorkspace(key);
    await window.adocWsExportCarrouselPDF();
    return { count: art._adocStructuredDoc.blocks[0].content.blocks.length, kind: art._adocStructuredDoc.documentKind };
  }, { key: fixture.key, kind, annexeCount: Number(process.env.ADOC_LOTF_ANNEXE_COUNT || 23) });
  const html = fixture.getHtml();
  assert.ok(html, 'HTML PDF non capturé : ' + JSON.stringify(result));
  const rendered = await renderBrowser.newPage();
  await rendered.setContent(html, { waitUntil: 'load' });
  await rendered.evaluate(() => document.fonts.ready);
  const buffer = await rendered.pdf({ preferCSSPageSize: true, printBackground: true });
  const file = path.join(output, kind + '.pdf');
  fs.writeFileSync(file, buffer);
  const text = pdfText(file);
  const pieces = await rendered.evaluate(extractHtmlPieces);
  const comparison = comparePieces(text, pieces);
  assert.deepEqual(comparison.failures, [], 'texte absent ou désordonné : ' + JSON.stringify(comparison.failures));
  const sizes = spawnSync('python3', ['-c', 'from pypdf import PdfReader;import json,sys;print(json.dumps([[float(p.mediabox.width),float(p.mediabox.height)] for p in PdfReader(sys.argv[1]).pages]))', file], { encoding: 'utf8' });
  assert.equal(sizes.status, 0, sizes.stderr);
  const geometry = JSON.parse(sizes.stdout);
  assert.ok(geometry.every(([w, h]) => Math.abs(w - 841.9) < 3 && Math.abs(h - 595.3) < 3), 'format hors A4 paysage');
  const pages = text.split('\f').filter(x => x.trim());
  const measured = spawnSync('/Users/christophebonnet/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    ['-c', 'import json,pdfplumber,sys,logging;logging.getLogger("pdfminer").setLevel(logging.ERROR)\nwith pdfplumber.open(sys.argv[1]) as pdf:\n print(json.dumps([{"lines":len(set(round(w["top"],1) for w in p.extract_words())),"height":max(w["bottom"] for w in p.extract_words())-min(w["top"] for w in p.extract_words()),"pageHeight":float(p.height)} for p in pdf.pages]))', file],
    { encoding: 'utf8' });
  assert.equal(measured.status, 0, measured.stderr);
  const measurements = JSON.parse(measured.stdout);
  assert.equal(measurements.length, pages.length, 'feuille vide dans le PDF');
  for (const [i, m] of measurements.entries()) {
    assert.ok(m.lines >= 4, 'page ' + (i + 1) + ' : seulement ' + m.lines + ' lignes');
    assert.ok(m.height >= (m.pageHeight - 36) * 0.15, 'page ' + (i + 1) + ' : hauteur imprimée ' + m.height.toFixed(1) + ' < 15 % utiles');
  }
  console.log(kind, JSON.stringify({ file, pages: pages.length, chars: pages.map(x => normalizeText(x).length), zoom: await rendered.locator('.adoc-sc-card').first().evaluate(el => el.style.zoom) }));
  if (process.env.ADOC_LOTF_DEBUG) console.log('geometry', JSON.stringify(await rendered.evaluate(() => {
    const card = document.querySelector('.adoc-pdf-page .adoc-sc-card');
    return { card: card.getBoundingClientRect().toJSON(), page: document.querySelector('.adoc-pdf-page').getBoundingClientRect().toJSON(), blocks: [...card.querySelectorAll('.adoc-sc-block')].map(x => ({ id: x.id, r: x.getBoundingClientRect().toJSON() })) };
  })));
  if (kind === 'questionnaire') {
    assert.ok(pages[0].includes('1. Quand vous pensez'), 'première feuille limitée au titre du questionnaire');
    const groups = [1, 2, 3, 4, 5].map(n => pages.map((s, i) => s.includes('Choix question ' + n + ' réponse 1') || s.includes('Choix question ' + n + ' réponse 4') ? i + 1 : 0).filter(Boolean));
    assert.ok(groups.every(x => new Set(x).size === 1), 'question coupée : ' + JSON.stringify(groups));
  } else if (kind === 'annexe') {
    assert.ok(pages.at(-1).includes("Ce modèle est aujourd'hui l'un des fondements de toute thérapie de couple moderne."), 'phrase finale de l’annexe absente');
  } else if (kind === 'widow') {
    const perPage = pages.map(pageText => (pageText.match(/Ligne du paragraphe continu/g) || []).length);
    assert.equal(perPage.reduce((a, b) => a + b, 0), 85, 'lignes du paragraphe perdues');
    assert.ok(perPage.filter(Boolean).every(count => count >= 4), 'veuves ou orphelines : ' + perPage.join(','));
    const style = await rendered.locator('#lot-f-widow .adoc-sc-block-text').evaluate(el => ({ widows: getComputedStyle(el).widows, orphans: getComputedStyle(el).orphans }));
    assert.ok(Number(style.widows) >= 4 && Number(style.orphans) >= 4, 'règle de veuves/orphelines absente : ' + JSON.stringify(style));
  } else {
    const last = pages.at(-1);
    assert.ok(normalizeText(last).length >= 180, 'dernière page presque vide : ' + normalizeText(last).length + ' caractères');
    assert.ok(pages.every(p => p.trim().split(/\n/).filter(Boolean).length >= 4), 'page de moins de 4 lignes');
  }
  await rendered.close();
  return { file, pages };
}

(async () => {
  const useWebkit = process.env.ADOC_LOTF_MEASURE_WEBKIT === '1';
  const browser = await (useWebkit ? webkit : chromium).launch();
  const renderBrowser = useWebkit ? await chromium.launch() : browser;
  try {
    for (const kind of (process.env.ADOC_LOTF_CASE ? [process.env.ADOC_LOTF_CASE] : ['questionnaire', 'tail', 'annexe', 'widow'])) {
      const page = await browser.newPage();
      const fixture = await buildFixture(page);
      await exportFixture(browser, renderBrowser, page, fixture, kind);
      await page.close();
    }
    console.log('PASS lot F : A4, questionnaires insécables, fin équilibrée, texte intégral');
  } finally { await browser.close(); if (renderBrowser !== browser) await renderBrowser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
