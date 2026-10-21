// Compare readable HTML text with an actual PDF without relying on pypdf's ligature mapping.
const { spawnSync } = require('node:child_process');

const POPPLER = process.env.PDFTOTEXT_BIN ||
  '/Users/christophebonnet/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext';

function pdfText(pdfPath) {
  const run = spawnSync(POPPLER, ['-enc', 'UTF-8', pdfPath, '-'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (run.status !== 0) throw new Error('pdftotext indisponible : ' + (run.error?.message || run.stderr || run.status));
  return run.stdout;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\ufb00-\ufb04]/g, x => ({ '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl', '\ufb03': 'ffi', '\ufb04': 'ffl' })[x])
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201b\u02bc]/g, "'")
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
    .replace(/\s+/g, '');
}

function comparePieces(text, pieces) {
  const haystack = normalizeText(text);
  const failures = [];
  let cursor = 0;
  let compared = 0;
  for (const piece of pieces) {
    if (String(piece.text || '').trim().length < (piece.minChars ?? 20)) continue;
    const needle = normalizeText(piece.text);
    compared++;
    const at = haystack.indexOf(needle, cursor);
    if (at < 0) {
      failures.push({ kind: piece.kind, slide: piece.slide, block: piece.block,
        reason: haystack.includes(needle) ? 'ordre' : 'absent', text: String(piece.text).slice(0, 90) });
    } else cursor = at + needle.length;
  }
  return { compared, failures };
}

// Self-contained so Playwright can serialize it into the page holding the exact HTML sent to PDF.
function extractHtmlPieces() {
  const pieces = [];
  const add = (kind, element, slide, block) => {
    const text = element?.textContent?.trim();
    if (text && text.length >= 20) pieces.push({ kind, slide, block, text });
  };
  document.querySelectorAll('.adoc-pdf-page').forEach((page, slideIndex) => {
    const slide = slideIndex + 1;
    add('title', page.querySelector('.adoc-sc-card-title'), slide, 0);
    page.querySelectorAll('.adoc-sc-card .adoc-sc-block').forEach((block, blockIndex) => {
      const number = blockIndex + 1;
      if (block.classList.contains('adoc-sc-list')) {
        block.querySelectorAll('.adoc-sc-list-el li').forEach(li =>
          add('list-item', li.querySelector(':scope > .adoc-sc-block-text') || li.firstElementChild || li, slide, number));
      } else if (block.classList.contains('adoc-sc-table')) {
        block.querySelectorAll('.adoc-sc-table-el th, .adoc-sc-table-el td').forEach(cell =>
          add('table-cell', cell, slide, number));
      } else if (block.classList.contains('adoc-sc-quiz')) {
        add('quiz-question', block.querySelector('.adoc-sc-quiz-question'), slide, number);
        block.querySelectorAll('.adoc-sc-quiz-option').forEach(option => add('quiz-choice', option, slide, number));
      } else if (block.classList.contains('adoc-sc-questionnaire')) {
        const panel = block.querySelector('.adoc-sc-questionnaire-partner-panel:not([hidden])');
        panel?.querySelectorAll('.adoc-sc-questionnaire-question').forEach(question => {
          add('questionnaire-question', question.querySelector('.adoc-sc-questionnaire-question-text'), slide, number);
          question.querySelectorAll('.adoc-sc-questionnaire-option').forEach(option =>
            add('questionnaire-choice', option, slide, number));
        });
      } else {
        const leaves = block.querySelectorAll('.adoc-sc-block-text');
        if (leaves.length) leaves.forEach(leaf => add('block-text', leaf, slide, number));
        else block.querySelectorAll('figcaption').forEach(caption => add('caption', caption, slide, number));
      }
    });
  });
  document.querySelectorAll('.adoc-dd-page').forEach((page, index) => {
    add('appendix-title', page.querySelector('.adoc-dd-titre'), 0, index + 1);
    page.querySelectorAll('.adoc-dd-p, .adoc-dd-voir').forEach(par => add('appendix-text', par, 0, index + 1));
  });
  return pieces;
}

module.exports = { pdfText, normalizeText, comparePieces, extractHtmlPieces };
