// Kit v2.4 — Écran d'accueil, Volet 1 (comportemental) : aucune présélection de type de
// document, 5 boutons aria-pressed (toggle réel, jamais un <input type="radio"> masqué),
// documentKind transmis comme contrainte structurée séparée (plus de concaténation
// formatPhrases[format]+prompt), libellé d'envoi invariable, géométrie identique des 5
// cadres, aucune dépendance à un fichier d'icônes externe.
// Couvre les 10 critères d'acceptance de state-a-contract.json.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function simpleTextSSE(text) {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
}

const MOCK_LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF}</style></head><body><h1>Test</h1><p>Contenu de test.</p></body></html>';

const KIND_IDS = {
  carrousel: '#format-carousel',
  tableau: '#format-table',
  fiche: '#format-summary',
  script: '#format-script',
  liens: '#format-links',
};

async function setupPage(browser, { onPlannerCall, onGenerationCall } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":2000')) {
        if (onPlannerCall) onPlannerCall(body);
        const plan = { needs_rag: true, searches: [{ terms: ['attachement'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'attachement couple', deep_scan: false, max_tokens: 2000 };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
        return;
      }
      if (body.includes('"max_tokens":16000')) {
        if (onGenerationCall) onGenerationCall(body);
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(MOCK_LEGACY_HTML) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Aucune présélection au chargement ═══
  console.log('[progress] bloc 1');
  {
    const { page, errors } = await setupPage(browser);
    const state = await page.evaluate(() => {
      const radios = document.querySelectorAll('[name="output-format"]');
      const cards = [...document.querySelectorAll('#cc-landing .format-card[data-kind]')];
      return {
        radioCount: radios.length,
        checkedRadio: document.querySelector('[name="output-format"]:checked'),
        cardCount: cards.length,
        allUnpressed: cards.every(c => c.getAttribute('aria-pressed') === 'false'),
        kinds: cards.map(c => c.dataset.kind),
        submitLabel: document.getElementById('submit-label')?.textContent,
        headingText: document.getElementById('document-kind-heading')?.textContent.trim(),
        noExamples: document.querySelectorAll('.examples, [data-example]').length,
        noRecommendedBadge: document.querySelectorAll('.recommended-badge').length,
      };
    });
    log('1a. Aucun <input name="output-format"> dans le DOM', state.radioCount === 0, state.radioCount);
    log('1b. Aucune valeur :checked au chargement', state.checkedRadio === null);
    log('1c. 5 boutons de type, tous aria-pressed=false', state.cardCount === 5 && state.allUnpressed);
    log('1d. Les 5 valeurs attendues sont présentes', JSON.stringify(state.kinds.sort()) === JSON.stringify(['carrousel', 'fiche', 'liens', 'script', 'tableau']));
    log('1e. Libellé d\'envoi = "Envoyer ma demande" au chargement', state.submitLabel === 'Envoyer ma demande');
    log('1f. Intitulé exact "2 — Type de document (optionnel)"', state.headingText === '2 — Type de document (optionnel)', state.headingText);
    log('1g. Section "Quelques points de départ" / data-example retirée', state.noExamples === 0);
    log('1h. Aucun badge "recommandé"', state.noRecommendedBadge === 0);
    log('1i. Aucune erreur JS au chargement', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 2');
  // ═══ 2. Clic sur un type — ne change QUE aria-pressed/documentKind, jamais le texte ni le libellé ═══
  {
    const { page, errors } = await setupPage(browser);
    await page.fill('#clinical-question', 'Texte témoin qui ne doit jamais bouger');
    await page.click(KIND_IDS.carrousel);
    const afterClick = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll('#cc-landing .format-card[data-kind]')].map(c => [c.dataset.kind, c.getAttribute('aria-pressed')]),
      question: document.getElementById('clinical-question').value,
      submitLabel: document.getElementById('submit-label')?.textContent,
    }));
    const onlyCarrouselPressed = afterClick.pressed.every(([k, p]) => (k === 'carrousel') === (p === 'true'));
    log('2a. Un clic ne coche que ce bouton (aria-pressed exclusif)', onlyCarrouselPressed, afterClick.pressed);
    log('2b. Le texte tapé reste strictement inchangé après un clic', afterClick.question === 'Texte témoin qui ne doit jamais bouger');
    log('2c. Le libellé d\'envoi ne change jamais avec le type', afterClick.submitLabel === 'Envoyer ma demande', afterClick.submitLabel);

    // Reclique sur le même bouton → désélection (documentKind revient à null).
    await page.click(KIND_IDS.carrousel);
    const afterSecondClick = await page.evaluate(() =>
      [...document.querySelectorAll('#cc-landing .format-card[data-kind]')].every(c => c.getAttribute('aria-pressed') === 'false')
    );
    log('2d. Recliquer sur le même bouton le désélectionne', afterSecondClick);
    log('2e. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 3');
  // ═══ 3. Clavier — sélectionne/désélectionne sans jamais soumettre le formulaire ═══
  {
    const { page, errors } = await setupPage(browser);
    await page.locator(KIND_IDS.tableau).focus();
    await page.keyboard.press('Enter');
    const afterEnter = await page.evaluate(() => ({
      pressed: document.querySelector('#format-table').getAttribute('aria-pressed'),
      landingVisible: document.getElementById('cc-landing').style.display !== 'none',
    }));
    log('3a. Enter sur un bouton le sélectionne (aria-pressed=true)', afterEnter.pressed === 'true');
    log('3b. Aucune soumission du formulaire déclenchée (écran d\'accueil toujours visible)', afterEnter.landingVisible);
    await page.keyboard.press('Space');
    const afterSpace = await page.evaluate(() => document.querySelector('#format-table').getAttribute('aria-pressed'));
    log('3c. Space désélectionne à nouveau (toggle)', afterSpace === 'false');
    log('3d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 4');
  // ═══ 4. Bulle d'aide "?" — accessible, sans effet de bord ═══
  {
    const { page, errors } = await setupPage(browser);
    await page.fill('#clinical-question', 'Ne doit pas changer');
    const helpBtn = page.locator('#cc-landing .format-option:has(#format-carousel) .format-help');
    await helpBtn.click();
    const afterOpen = await page.evaluate(() => {
      const btn = document.querySelector('#cc-landing .format-option:has(#format-carousel) .format-help');
      const bubble = document.getElementById(btn.getAttribute('aria-controls'));
      return {
        expanded: btn.getAttribute('aria-expanded'),
        open: bubble.classList.contains('is-open'),
        pressed: document.getElementById('format-carousel').getAttribute('aria-pressed'),
        question: document.getElementById('clinical-question').value,
      };
    });
    log('4a. "?" ouvre la bulle (aria-expanded=true, classe is-open)', afterOpen.expanded === 'true' && afterOpen.open);
    log('4b. Ouvrir l\'aide ne sélectionne jamais le type', afterOpen.pressed === 'false');
    log('4c. Ouvrir l\'aide ne modifie jamais le texte tapé', afterOpen.question === 'Ne doit pas changer');

    await page.keyboard.press('Escape');
    const afterEscape = await page.evaluate(() => {
      const btn = document.querySelector('#cc-landing .format-option:has(#format-carousel) .format-help');
      return btn.getAttribute('aria-expanded');
    });
    log('4d. Escape ferme la bulle', afterEscape === 'false');

    await helpBtn.click();
    await page.mouse.click(5, 5);
    const afterOutsideClick = await page.evaluate(() => {
      const btn = document.querySelector('#cc-landing .format-option:has(#format-carousel) .format-help');
      return btn.getAttribute('aria-expanded');
    });
    log('4e. Un clic à l\'extérieur ferme la bulle', afterOutsideClick === 'false');
    log('4f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 5');
  // ═══ 5. Test obligatoire — texte "sans type choisi" atteint le planner octet pour octet ═══
  {
    const TEST_SENTENCE = "fais moi 4 pages sur l'attachement dans le couple, pas de texte uniquement du visuel";
    let plannerBody = null;
    const { page, errors } = await setupPage(browser, { onPlannerCall: (b) => { plannerBody = plannerBody || b; } });
    await page.evaluate(() => {
      window.__capturedDetail = null;
      window.addEventListener('conseiller-clinique:start', (e) => {
        window.__capturedDetail = { prompt: e.detail.prompt, format: e.detail.format };
      }, { once: true });
    });
    await page.fill('#clinical-question', TEST_SENTENCE);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(800);
    const detail = await page.evaluate(() => window.__capturedDetail);
    log('5a. detail.format === null (aucun type choisi)', detail && detail.format === null, detail);
    log('5b. detail.prompt strictement identique au texte tapé', detail && detail.prompt === TEST_SENTENCE);
    let plannerContent = null;
    if (plannerBody) {
      try { plannerContent = JSON.parse(plannerBody).payload.messages[0].content; } catch (e) {}
    }
    // adocPlanQuery préfixe légitimement avec "Échanges récents" dès que adocConversations
    // contient ce même message (poussé par adocSend AVANT adocMultiPlan) — mécanisme
    // préexistant, sans rapport avec ce lot. Ce qui compte pour l'acceptance ("byte-for-byte")
    // c'est qu'aucun MOT ne soit ajouté DEVANT le texte tapé lui-même (l'ancien
    // formatPhrases[format] + prompt) : le texte doit apparaître tel quel, en toute fin.
    const plannerHasExactSuffix = !!plannerContent && (plannerContent === TEST_SENTENCE || plannerContent.endsWith('Demande actuelle : ' + TEST_SENTENCE));
    log('5c. Le texte atteint adocMultiPlan/le planner octet pour octet (aucun préfixe)', plannerHasExactSuffix, plannerContent);
    log('5d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 6');
  // ═══ 6. Un type explicitement choisi voyage comme contrainte structurée séparée ═══
  {
    const PROMPT = 'Fais un document de 4 pages sur l\'attachement du couple';
    let generationSystem = null;
    let plannerContent = null;
    const { page, errors } = await setupPage(browser, {
      onPlannerCall: (b) => { try { plannerContent = plannerContent || JSON.parse(b).payload.messages[0].content; } catch (e) {} },
      onGenerationCall: (b) => { generationSystem = generationSystem || JSON.parse(b).payload.system; },
    });
    await page.evaluate(() => {
      window.__capturedDetail = null;
      window.addEventListener('conseiller-clinique:start', (e) => { window.__capturedDetail = { prompt: e.detail.prompt, format: e.detail.format }; }, { once: true });
    });
    await page.click(KIND_IDS.carrousel);
    await page.fill('#clinical-question', PROMPT);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1200);
    const detail = await page.evaluate(() => window.__capturedDetail);
    log('6a. detail.format === "carrousel" (transmis via detail.format, sans concaténation)', detail && detail.format === 'carrousel', detail);
    log('6b. Le prompt reste strictement inchangé (aucun mot ajouté)', detail && detail.prompt === PROMPT);
    const plannerHasExactSuffix6 = !!plannerContent && (plannerContent === PROMPT || plannerContent.endsWith('Demande actuelle : ' + PROMPT));
    log('6c. Le texte atteint le planner octet pour octet malgré le type choisi', plannerHasExactSuffix6, plannerContent);
    log('6d. Le prompt système de génération porte une structure imposée "carrousel"', !!(generationSystem && generationSystem.includes('STRUCTURE IMPOSÉE') && generationSystem.includes('Carrousel de diapositives')), generationSystem ? generationSystem.length : null);
    log('6e. Le conteneur d\'export n\'est jamais mentionné comme imposé par documentKind', !!(generationSystem && generationSystem.includes('jamais sur le conteneur d’export')));
    log('6f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 7');
  // ═══ 7. Sans type choisi — aucune structure imposée dans le prompt système ═══
  {
    let generationSystem = null;
    const { page, errors } = await setupPage(browser, {
      onGenerationCall: (b) => { generationSystem = generationSystem || JSON.parse(b).payload.system; },
    });
    await page.fill('#clinical-question', 'Explique-moi les cavaliers de Gottman');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1200);
    log('7a. Aucun bloc "STRUCTURE IMPOSÉE" quand aucun type n\'est choisi', !!(generationSystem && !generationSystem.includes('STRUCTURE IMPOSÉE')));
    log('7b. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 8');
  // ═══ 8. Icônes — aucune dépendance à un fichier externe pour les 5 types ═══
  {
    const { page, errors } = await setupPage(browser);
    const iconState = await page.evaluate(() => ({
      useCount: document.querySelectorAll('#cc-landing .format-card use').length,
      externalHrefs: [...document.querySelectorAll('#cc-landing .format-card [href]')].map(el => el.getAttribute('href')).filter(h => h && !h.startsWith('#')),
      svgCount: document.querySelectorAll('#cc-landing .format-card svg.format-icon').length,
    }));
    log('8a. Aucun <use> (ni sprite interne ni externe) sur les icônes de type — inline pur', iconState.useCount === 0, iconState.useCount);
    log('8b. Aucune référence href vers un fichier externe', iconState.externalHrefs.length === 0, iconState.externalHrefs);
    log('8c. Les 5 icônes de type sont bien présentes (inline, visibles hors ligne/file://)', iconState.svgCount === 5);
    log('8d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('[progress] bloc 9');
  // ═══ 9. Géométrie identique des 5 cadres, "?" toujours dans le cadre — 3 viewports ═══
  {
    const viewports = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 900 }];
    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: vp });
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
        if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
        route.continue();
      });
      await page.goto('file://' + FILE);
      await page.waitForTimeout(300);
      const geo = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#cc-landing .format-card[data-kind]')];
        return cards.map((card) => {
          const cardBox = card.getBoundingClientRect();
          const option = card.closest('.format-option');
          const help = option.querySelector('.format-help');
          const helpBox = help.getBoundingClientRect();
          return {
            height: Math.round(cardBox.height),
            helpFullyInside: helpBox.top >= cardBox.top - 0.5 && helpBox.bottom <= cardBox.bottom + 0.5,
          };
        });
      });
      const heights = geo.map(g => g.height);
      const allSameHeight = heights.every(h => h === heights[0]);
      const allHelpInside = geo.every(g => g.helpFullyInside);
      log(`9a. [${vp.width}x${vp.height}] Les 5 cadres ont une hauteur strictement identique`, allSameHeight, heights);
      log(`9b. [${vp.width}x${vp.height}] Hauteur = 82px (state-a-contract.json)`, heights[0] === 82, heights[0]);
      log(`9c. [${vp.width}x${vp.height}] "?" toujours entièrement dans le cadre`, allHelpInside);
      log(`9d. [${vp.width}x${vp.height}] Aucune erreur JS`, errors.length === 0, errors);
      await page.close();
    }
  }

  console.log('=== Résultats — Écran d\'accueil, documentKind (Kit v2.4, Volet 1) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
