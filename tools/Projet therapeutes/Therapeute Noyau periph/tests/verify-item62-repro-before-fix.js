// Item 62 — REPRODUCTION AVANT CORRECTIF (protocole v2 : cause déjà connue par investigation
// directe de Christophe, mais la reproduction sur le code actuel reste obligatoire, régression #5).
//
// Confirme, sur le code NON modifié :
// (a) #cc-legacy-retheme-body existe bien au chargement (markup statique, dans .cc-clarity-card
//     à l'intérieur de #cc-legacy-retheme-modal, hors de #adoc-messages).
// (b) Dès qu'une porte de clarté affiche une carte de clarification (adocRenderClarityCard →
//     adocRemoveClarityCard, portée globale document.querySelectorAll('.cc-clarity-card')),
//     #cc-legacy-retheme-body est détruit — PERMANENTMENT, puisque ce n'est pas du contenu
//     recréé dynamiquement mais du markup statique de la page.
// (c) Conséquence utilisateur réelle : une fois un document direct de l'ancien moteur généré
//     (Carrousel), le bouton "Charte" ne fait plus rien du tout (adocOpenLegacyReThemePanel
//     retourne silencieusement faute de #cc-legacy-retheme-body — jamais d'erreur JS visible).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const CARROUSEL_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#FFFFFF;}</style></head><body><h1>Carrousel ACT</h1><p>Diapositive 1.</p></body></html>';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let clarityCallCount = 0;
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [{ id: 'kit-1', name: 'Charte Test', version: 1, colors: { primary: '#ff0000' }, typography: {} }] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        clarityCallCount++;
        // Premier envoi : demande jugée ambiguë (déclenche adocRenderClarityCard).
        const needsClarif = clarityCallCount === 1;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          content: [{ type: 'tool_use', name: 'evaluate_clarity', input: needsClarif
            ? { status: 'needs_clarification', understood_so_far: 'Un carrousel sur ACT', missing: ['public visé'], question: 'Pour quel public ?', quick_replies: ['Praticiens', 'Étudiants'], assumptions_if_proceeding: [] }
            : { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }]
        }) });
        return;
      }
      if (body.includes('"max_tokens":200,')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(CARROUSEL_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['act'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'carrousel', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Carrousel ACT', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);

  const bodyExistsBefore = await page.evaluate(() => !!document.getElementById('cc-legacy-retheme-body'));
  console.log('(a) #cc-legacy-retheme-body existe au chargement :', bodyExistsBefore);

  // ── Déclenche une porte de clarté (premier envoi jugé ambigu) ──
  await page.click('#format-carousel');
  await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(1200);

  const clarityCardVisible = await page.evaluate(() => !!document.querySelector('.cc-clarity-question'));
  console.log('Carte de clarification bien affichée :', clarityCardVisible);

  const bodyExistsAfterClarity = await page.evaluate(() => !!document.getElementById('cc-legacy-retheme-body'));
  console.log('(b) #cc-legacy-retheme-body existe APRÈS affichage de la carte de clarification :', bodyExistsAfterClarity, bodyExistsAfterClarity ? '(BUG NON REPRODUIT)' : '(BUG CONFIRMÉ — détruit par adocRemoveClarityCard, portée globale)');

  // ── Répond à la clarification pour poursuivre jusqu'à la génération réelle ──
  await page.click('.cc-clarity-reply-btn');
  await page.waitForTimeout(1500);

  const artifactInfo = await page.evaluate(() => {
    const entries = Object.entries(window._adocArtifacts || {});
    if (!entries.length) return null;
    const [storeKey, art] = entries[entries.length - 1];
    return { storeKey, fmt: art.fmt, hasCapabilities: !!art._adocCapabilities, isStructured: !!art._adocStructuredDoc };
  });
  console.log('Document généré :', artifactInfo);

  // ── Clic RÉEL sur le bouton Charte (déjà révélé automatiquement, setTimeout(0), L6509) ──
  if (artifactInfo) {
    const btnId = 'retheme-btn-' + artifactInfo.storeKey;
    const rethemeBtnVisible = await page.evaluate((id) => { const b = document.getElementById(id); return !!b && !b.hidden; }, btnId);
    console.log('Bouton "Charte" présent et visible sur la carte :', rethemeBtnVisible);
    if (rethemeBtnVisible) await page.click('#' + btnId);
    await page.waitForTimeout(300);
    const modalOpen = await page.evaluate(() => document.getElementById('cc-legacy-retheme-modal')?.classList.contains('open'));
    console.log('(c) Modal "Charte" bien ouvert après clic réel :', modalOpen, modalOpen ? '(BUG NON REPRODUIT)' : '(BUG CONFIRMÉ — le clic ne fait RIEN, exactement le symptôme signalé)');
  }

  console.log('Erreurs JS (attendu : aucune, le bug est silencieux) :', errors);
  await browser.close();
})();
