// Régression signalée en production : pendant un document long multi-chapitres (6-7
// chapitres), les placeholders "Document N en cours de génération…" (adocUpdateStreamMsg,
// détection multi-bloc, ligne ~6463) s'affichaient lettre par ligne, empilés verticalement,
// plusieurs cartes adjacentes vides côte à côte.
//
// CAUSE RÉELLE (vérifiée, pas supposée) : AUCUNE fuite depuis le nouvel écran d'accueil —
// tous les sélecteurs #cc-landing/.format-* de ce soir restent strictement scopés à leur
// sous-arbre (confirmé : aucune classe "format-*" n'existe hors de <div id="cc-landing">).
// Le vrai mécanisme, PRÉEXISTANT à ce soir : .adoc-msg est display:flex (ligne ~385), et le
// wrapper anonyme entre .adoc-avatar et .adoc-bubble est donc un item flex sans min-width
// explicite. .adoc-bubble hérite word-break:break-word (ligne ~395), ce qui réduit le
// min-content de ce wrapper à la largeur d'un seul caractère (n'importe quel point peut
// couper le texte). Sous contrainte de largeur (fenêtre plus étroite que la largeur naturelle
// du message — reproduit ici dès ≤700px), flex-shrink comprime la boîte jusqu'à ce plancher
// quasi nul : le texte s'empile lettre par lettre. Correctif : min-width explicite sur CE
// placeholder précis (inline, localisé, aucune autre bulle de conversation affectée).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

async function runAtViewport(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async () => {
    if (typeof window.openAssistDoc === 'function') window.openAssistDoc();

    const streamMsgId = 'longdoc-repro-' + Date.now();
    const msgArea = document.getElementById('adoc-messages');
    const msgEl = document.createElement('div');
    msgEl.id = streamMsgId;
    msgEl.className = 'adoc-msg assistant';
    // Structure EXACTE produite par adocAddMsg (avatar + wrapper + .adoc-bubble).
    msgEl.innerHTML = '<div class="adoc-avatar"></div><div><div class="adoc-bubble"></div></div>';
    msgArea.appendChild(msgEl);

    const NB_CHAPTERS = 7;
    const chapterPlan = Array.from({ length: NB_CHAPTERS }, (_, i) => ({ titre: 'Chapitre ' + (i + 1), instructions: '...' }));

    window.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      if (payload.model === 'claude-haiku-4-5-20251001') {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(chapterPlan) }] }));
      }
      const text = '<!DOCTYPE html><html><body><h1>Chapitre</h1><p>Contenu du chapitre.</p></body></html>';
      const sse = [
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`,
        `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })}\n\n`,
        `data: [DONE]\n\n`
      ].join('');
      return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    };

    await window.adocLongDoc('Fais un document de 7 chapitres', { topic_summary: 'test', intent: 'cours', audience_type: 'praticien' }, { chunks: [] }, 'system prompt', streamMsgId, 'stub://worker');

    const bubble = msgEl.querySelector('.adoc-bubble');
    const placeholders = [...bubble.querySelectorAll('div')].filter(d => d.textContent.includes('en cours de génération'));
    const geometry = placeholders.map(d => {
      const rect = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      // "letter-stacking" width heuristic : à ce corps de texte (11px), une colonne saine
      // tient au moins un mot complet par ligne — un effondrement au caractère tombe sous 60px.
      return { text: d.textContent.trim(), width: rect.width, height: rect.height, writingMode: cs.writingMode };
    });
    return { placeholderCount: placeholders.length, geometry };
  });

  // Capture AVANT tout nettoyage — c'est la preuve visuelle demandée, elle doit montrer les
  // placeholders réellement rendus, pas un écran vidé.
  await page.screenshot({ path: `/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad/longdoc-multiblock-${width}px.png` }).catch(() => {});
  await page.close();
  return { width, errors, ...result };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // Prend le viewport de bureau habituel (1440) ET les largeurs où la régression signalée
  // se manifestait réellement (700/500/375/320) — jamais supposé réparé sans le revérifier
  // à chacune.
  for (const width of [1440, 1024, 700, 500, 375, 320]) {
    const r = await runAtViewport(browser, width);
    log(`[${width}px] 7 placeholders "Document N…" détectés simultanément`, r.placeholderCount === 7, r.placeholderCount);
    const allWide = r.geometry.every(g => g.width >= 60);
    log(`[${width}px] Aucun placeholder effondré (<60px = empilement lettre par lettre)`, allWide, r.geometry.map(g => Math.round(g.width)));
    const allHorizontal = r.geometry.every(g => g.writingMode === 'horizontal-tb');
    log(`[${width}px] Texte horizontal (writing-mode sain)`, allHorizontal);
    log(`[${width}px] Aucune erreur JS`, r.errors.length === 0, r.errors);
  }

  console.log('=== Résultats — Régression "Document N en cours de génération" (multi-chapitres) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  console.log('Captures sauvegardées : longdoc-multiblock-{1440,1024,700,500,375,320}px.png');

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
