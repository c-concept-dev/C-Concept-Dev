const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  await page.fill('#clinical-question', 'test');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(300);

  // ── Mock : force needs_clarification au premier appel, puis un plan direct + stream vide ──
  await page.evaluate(() => {
    let clarityCalls = 0;
    window.fetch = async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      const payload = body.payload || {};
      if (payload.tool_choice && payload.tool_choice.name === 'evaluate_clarity') {
        clarityCalls++;
        if (clarityCalls === 1) {
          return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: {
            status: 'needs_clarification',
            understood_so_far: 'Vous voulez travailler la dissociation en séance.',
            question: 'Quel cadre thérapeutique utilisez-vous principalement ?',
            quick_replies: ['ICV', 'EMDR', 'IFS'],
            assumptions_if_proceeding: []
          } }] }));
        }
        return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready' } }] }));
      }
      if (payload.model === 'claude-haiku-4-5-20251001' && !payload.stream && payload.max_tokens === 2000) {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
          needs_rag: true, searches: [{ terms: ['test'], limit: 5 }], vector_angles: [], approach_filter: null,
          intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien',
          registre: 'clinique', topic_summary: 'test', deep_scan: false, max_tokens: 2000
        }) }] }));
      }
      if (payload.stream) {
        await new Promise(r => setTimeout(r, 300));
        return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '[]' }], results: [] }));
    };
  });

  await page.fill('#adoc-input', 'Techniques pour la dissociation');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(600);

  console.log('=== État B : carte de clarification harmonisée ===');
  const cardInfo = await page.evaluate(() => {
    const card = document.querySelector('.cc-clarity-card');
    if (!card) return null;
    return {
      hasHarmonClass: card.classList.contains('sc-clarification-card'),
      hasIllustration: !!card.querySelector('.cc-clarity-illustration'),
      illustrationVisible: (() => { const img = card.querySelector('.cc-clarity-illustration'); return img ? img.getBoundingClientRect().width > 0 : false; })(),
      headingHasIcon: !!card.querySelector('.cc-clarity-question svg.sc-icon'),
      choiceCount: card.querySelectorAll('.sc-clarification-choice').length,
      otherBtnPresent: !!card.querySelector('.sc-clarification-choice--other'),
    };
  });
  console.log(JSON.stringify(cardInfo, null, 2));

  console.log('=== Clic sur un choix : classe is-selected + envoi déclenché (2 tours max respecté) ===');
  await page.click('.cc-clarity-reply-btn >> nth=0');
  await page.waitForTimeout(150);
  const selectedState = await page.evaluate(() => {
    const btn = document.querySelector('.cc-clarity-reply-btn');
    return btn ? btn.classList.contains('is-selected') : null;
  });
  console.log('Premier bouton de réponse a la classe is-selected:', selectedState);

  await page.waitForTimeout(1500);

  console.log('=== État C : aria-live + étapes de progression réelles ===');
  // Deuxième message pour observer un cycle génération complet (clarté déjà réglée -> 'ready' au 2e appel mocké)
  const stepsSeen = [];
  const pollInterval = setInterval(async () => {
    try {
      const snap = await page.evaluate(() => {
        const lbl = document.querySelector('.adoc-typing-label');
        const ul = document.querySelector('.sc-progress-steps');
        if (!lbl) return null;
        return {
          role: lbl.getAttribute('role'),
          ariaLive: lbl.getAttribute('aria-live'),
          text: lbl.textContent,
          stepsVisible: ul ? ul.style.display !== 'none' : false,
          activeSteps: ul ? [...ul.querySelectorAll('li')].map(li => li.className) : [],
          illustrationPresent: !!document.querySelector('.sc-generation-illustration'),
        };
      });
      if (snap) stepsSeen.push(snap);
    } catch (e) {}
  }, 60);

  await page.fill('#adoc-input', 'Une autre question de suivi');
  await page.click('#adoc-send-btn');
  await page.waitForTimeout(1600);
  clearInterval(pollInterval);

  console.log('role/aria-live constants sur toutes les captures:', stepsSeen.every(s => s.role === 'status' && s.ariaLive === 'polite'));
  const uniqueTexts = stepsSeen.map(s => s.text).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  console.log('Séquence de libellés observés:', JSON.stringify(uniqueTexts));
  const lastWithSteps = [...stepsSeen].reverse().find(s => s.stepsVisible);
  console.log('Dernier état des étapes visibles:', lastWithSteps ? JSON.stringify(lastWithSteps.activeSteps) : 'jamais affichées');
  console.log('Illustration de génération apparue au moins une fois:', stepsSeen.some(s => s.illustrationPresent));

  console.log('=== Erreurs JS ===', errors.length ? JSON.stringify(errors) : 'aucune');

  await browser.close();
})();
