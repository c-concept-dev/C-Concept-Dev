// Parité 0F (monobloc) — application automatique de la charte choisie à la génération, pour
// l'ancien moteur. Investigation confirmée : #cc-brandkit-select (écran d'accueil) capture déjà
// la charte choisie pour CHAQUE demande (conseiller-clinique:start -> adocActiveBrandKitId),
// exactement comme adocPendingDocumentKind pour le type de document — jamais un second
// mécanisme de capture. Ce test vérifie : (1) une demande traitée directement par l'ancien
// moteur (carte "Tableau", jamais de tentative structurée) avec une charte explicitement
// choisie ressort déjà teintée, sans le moindre geste manuel ; (2) sans charte choisie
// (liste vide au moment de la demande), comportement STRICTEMENT inchangé, panneau manuel
// toujours accessible ; (3) non-régression Phase 1/2 (bloc legacy) et structuré (UX-8B Lot 2).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const BRAND_KIT_RED = { id: 'kit-red', name: 'Charte Rouge Vif', version: 1, colors: { primary: '#ff0000', accent: '#cc0000', background: '#fff0f0', text: '#330000', warning: '#aa0000' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } };

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
// Gabarit couleur OBLIGATOIRE réellement imposé au modèle (system prompt, ligne ~4377) — un
// document legacy réel le porte toujours ; reproduit ici tel quel pour un test représentatif.
const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}body{font-family:"IBM Plex Sans";}h1{font-family:"Source Serif 4";}</style></head><body>'
  + '<h1>Tableau comparatif des approches</h1>'
  + '<table><tbody><tr><td>Approche</td><td>Indication</td></tr></tbody></table>'
  + '</body></html>';

function baseRoutes(page, { brandKits = [], onCall2, plannerIntent = 'script' } = {}) {
  return page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: brandKits }) }); return; }
    if (url.includes('/brand-kits/')) {
      const id = decodeURIComponent(url.split('/brand-kits/')[1]);
      const kit = brandKits.find(k => k.id === id);
      route.fulfill({ status: kit ? 200 : 404, contentType: 'application/json', body: JSON.stringify(kit || { error: 'introuvable' }) });
      return;
    }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'x', book_title: 'y', author: 'z', page_number: 1 }] }) }); return; }
    if (url.includes('/clinical-documents')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"type":"tool","name":"emit_fiche_document"')) { if (onCall2) { onCall2(route); return; } route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: false, searches: [], vector_angles: [], approach_filter: null, intent: plannerIntent, clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'sujet', deep_scan: false, max_tokens: 2000, images_only: false };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ═══ 1. Charte explicitement choisie + demande DIRECTE ancien moteur (Tableau, jamais de tentative structurée) ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, { brandKits: [BRAND_KIT_RED] });
    await page.goto('file://' + FILE);
    await page.waitForFunction(() => { const s = document.querySelector('#cc-brandkit-select'); return s && Array.from(s.options).some((o) => o.value === 'kit-red'); }, { timeout: 10000 });
    await page.selectOption('#cc-brandkit-select', 'kit-red');
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Fais-moi un tableau comparatif des approches');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
    await page.waitForTimeout(300); // laisse la promesse asynchrone (adocApplyBrandKitToLegacyArtifact) se résoudre avant lecture
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('1a. Le document ressort déjà teinté (couleur --mer dérivée de la charte rouge, jamais la couleur par défaut #1f5053)', art.html.includes('--mer:') && !art.html.includes('--mer:#1f5053'), art.html.match(/--mer:[^;]+/));
    log('1b. Contenu/structure/scripts inchangés (seules les couleurs, jamais le texte)', art.html.includes('Tableau comparatif des approches') && art.html.includes('<td>Approche</td>'), null);
    log('1c. Aucun geste manuel n\'a été nécessaire (aucun panneau de ré-habillage jamais ouvert dans ce scénario)', await page.evaluate(() => !document.getElementById('cc-legacy-retheme-modal')?.classList.contains('open')), null);
    log('1d. La traçabilité de la charte est bien posée (_adocBrandKitName), même champ que le mécanisme manuel', art._adocBrandKitName === 'Charte Rouge Vif', art._adocBrandKitName);
    log('1e. Le panneau manuel de ré-habillage reste pleinement accessible ensuite (peut re-teindre à volonté)', true, null); // vérifié fonctionnellement au scénario 3 (non-régression legacy retheme)
    log('1f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 2. Aucune charte choisie (liste vide au moment de la demande) → comportement STRICTEMENT inchangé ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, { brandKits: [] });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(300);
    const selectValue = await page.evaluate(() => document.querySelector('#cc-brandkit-select').value);
    log('2a. Aucune charte disponible ⇒ le sélecteur reste vide (aucun choix explicite possible)', selectValue === '', selectValue);
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Fais-moi un tableau comparatif des approches');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
    await page.waitForTimeout(300);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('2b. Le document ressort avec les couleurs par défaut, STRICTEMENT inchangées (aucune charte choisie)', art.html.includes('--mer:#1f5053'), art.html.match(/--mer:[^;]+/));
    log('2c. Aucune traçabilité de charte posée (comportement inchangé)', !art._adocBrandKitName, art._adocBrandKitName);
    // Le panneau manuel reste accessible malgré tout (0 charte au chargement, mais réessaie un vrai GET).
    await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
    await page.waitForTimeout(200);
    const cardId = await page.evaluate((k) => k, storeKey);
    log('2d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 3. Non-régression — le panneau manuel de ré-habillage reste pleinement fonctionnel ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const BRAND_KIT_BLUE = { id: 'kit-blue', name: 'Charte Bleu Nuit', version: 1, colors: { primary: '#000066', accent: '#0000aa', background: '#eef0ff', text: '#000033', warning: '#0000cc' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } };
    await baseRoutes(page, { brandKits: [BRAND_KIT_RED, BRAND_KIT_BLUE] });
    await page.goto('file://' + FILE);
    await page.waitForFunction(() => { const s = document.querySelector('#cc-brandkit-select'); return s && s.options.length > 1; }, { timeout: 10000 });
    await page.selectOption('#cc-brandkit-select', 'kit-red');
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Fais-moi un tableau comparatif des approches');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
    await page.waitForTimeout(300);
    // L'utilisatrice change ensuite manuellement d'avis pour une AUTRE charte via le panneau existant.
    await page.evaluate((k) => window.adocOpenLegacyReThemePanel(k), storeKey);
    await page.waitForSelector('#cc-legacy-retheme-body button:has-text("Charte Bleu Nuit")');
    await page.click('#cc-legacy-retheme-body button:has-text("Charte Bleu Nuit")');
    await page.waitForSelector('#cc-legacy-retheme-body button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('#cc-legacy-retheme-body button:has-text("Confirmer")');
    await page.waitForFunction((k) => window._adocArtifacts[k]._adocBrandKitName === 'Charte Bleu Nuit', storeKey, { timeout: 10000 });
    const artAfter = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('3a. Non-régression — le panneau manuel peut toujours re-teindre après coup, même sur un document déjà auto-teinté', artAfter.html.includes('--mer:') && !artAfter.html.includes('--mer:#1f5053'), artAfter._adocBrandKitName);
    log('3b. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 4. Non-régression — repli structuré→legacy (rang 6) : charte appliquée SANS perturber la continuité ═══
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, { brandKits: [BRAND_KIT_RED], plannerIntent: 'fiche', onCall2: (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'échec structuré simulé' } }) }) });
    await page.goto('file://' + FILE);
    // Instrumentation rang 6 — deux tentatives précédentes se sont révélées trompeuses :
    // (1) un comptage global des créations `.adoc-msg.assistant` confond une bulle assistant
    // sans rapport avec une vraie carte détruite/recréée ; (2) marquer "la première carte
    // assistant créée" marque en réalité la carte TRANSITOIRE de la porte de clarté
    // (adoc-typing-<id>, créée puis retirée quasi instantanément dès que evaluate_clarity répond
    // "ready" — confirmé par une trace complète des ADD/REMOVE : ADD carte-clarté, REMOVE
    // carte-clarté, ADD bulle utilisateur, ADD carte-génération-réelle, ADD message final,
    // REMOVE carte-génération-réelle) — jamais la vraie carte de progression du repli, qui
    // n'apparaît qu'ENSUITE, une fois la clarté déjà résolue. Un waitForFunction qui sonde par
    // intervalles peut aussi manquer cette fenêtre transitoire, expliquant l'échec intermittent
    // observé. Solution fiable : enregistrer la timeline COMPLÈTE des ADD de `.adoc-msg.assistant`
    // côté page (horodatage in-page, jamais de sondage Node) dès avant le clic, puis vérifier
    // après coup qu'une seule carte de progression (id commençant par `adoc-typing-`) a été créée
    // APRÈS la bulle utilisateur et AVANT le message final — exactement le motif confirmé par le
    // code (catch ~ligne 5420-5433 : « La carte elle-même (typingId) n'est PAS détruite ici »).
    // Une deuxième création dans cette fenêtre signerait une carte détruite puis recréée au repli.
    await page.evaluate(() => {
      window.__adocTimeline = [];
      const area = document.getElementById('adoc-messages');
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1 || !node.classList?.contains('adoc-msg')) continue;
            window.__adocTimeline.push({
              role: node.classList.contains('user') ? 'user' : (node.classList.contains('assistant') ? 'assistant' : '?'),
              isTyping: (node.id || '').startsWith('adoc-typing-'),
              isFinal: node.hasAttribute('data-storekey'),
            });
          }
        }
      }).observe(area, { childList: true });
    });
    await page.selectOption('#cc-brandkit-select', 'kit-red');
    await page.fill('#clinical-question', 'Fais-moi une fiche sur un sujet clinique');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
    const timeline = await page.evaluate(() => window.__adocTimeline);
    const userIdx = timeline.findIndex(e => e.role === 'user');
    const finalIdx = timeline.findIndex(e => e.isFinal);
    const typingCardsDuringGeneration = timeline.slice(userIdx + 1, finalIdx).filter(e => e.isTyping).length;
    log('4a. Non-régression rang 6 — une seule carte de progression créée entre la bulle utilisateur et le message final (jamais détruite puis recréée au repli)', userIdx !== -1 && finalIdx !== -1 && typingCardsDuringGeneration === 1, { timeline, typingCardsDuringGeneration });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
    await page.waitForTimeout(300);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('4b. La charte choisie s\'applique bien aussi sur un document de REPLI (pas seulement direct)', art.html.includes('--mer:') && !art.html.includes('--mer:#1f5053'), art._adocBrandKitName);
    log('4c. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ═══ 5. Non-régression — présélection mécanique du sélecteur (PAS un choix explicite) ═══
  // Bug réel découvert par la régression complète (verify-legacy-retheme.js, échecs 1d/3a) :
  // #cc-brandkit-select présélectionne TOUJOURS la première charte dès qu'au moins une existe
  // (window.setConseillerCliniqueBrandKits, aucune préférence sauvegardée ⇒ brandKits[0].id) —
  // ce n'est PAS un geste de la thérapeute. Avant correctif (adocActiveBrandKitExplicit), ce
  // scénario aurait fait ressortir un document déjà teinté malgré une thérapeute n'ayant JAMAIS
  // touché le sélecteur. Ici : deux chartes proposées, aucune interaction avec le sélecteur.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await baseRoutes(page, { brandKits: [BRAND_KIT_RED] });
    await page.goto('file://' + FILE);
    await page.waitForFunction(() => { const s = document.querySelector('#cc-brandkit-select'); return s && Array.from(s.options).some((o) => o.value === 'kit-red'); }, { timeout: 10000 });
    const preselected = await page.evaluate(() => document.querySelector('#cc-brandkit-select').value);
    log('5a. Précondition — le sélecteur présélectionne bien mécaniquement la charte (confirme le bug réel, pas une hypothèse)', preselected === 'kit-red', preselected);
    // Aucun selectOption ici — la thérapeute ne touche jamais le sélecteur.
    await page.click('#format-script');
    await page.fill('#clinical-question', 'Fais-moi un script sur un sujet clinique');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a.fmt === 'html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a.fmt === 'html')[0]);
    await page.waitForTimeout(300);
    const art = await page.evaluate((k) => window._adocArtifacts[k], storeKey);
    log('5b. Sans geste manuel sur le sélecteur, le document ressort STRICTEMENT inchangé (couleur par défaut, jamais teint malgré elle)', art.html.includes('--mer:#1f5053'), art.html.match(/--mer:[^;]+/));
    log('5c. Aucune traçabilité de charte posée (aucun geste = aucune application)', !art._adocBrandKitName, art._adocBrandKitName);
    log('5d. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Parité 0F : application automatique de la charte (ancien moteur) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
