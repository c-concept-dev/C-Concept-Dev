// Correction rang 3 — deux classificateurs de secours divergents (adocMultiPlan._fallback et le
// garde FIX-EMPTY-PLAN de adocSend) fusionnés en une seule fonction partagée,
// window.adocBuildFallbackPlan. Vérifie : (1) son comportement direct sur les 4 points de
// divergence tranchés ; (2) le déclenchement RÉEL via le chemin adocMultiPlan (échec du
// planificateur pour une sous-question) produit le même plan que l'appel direct ; (3) le
// déclenchement via le garde de adocSend (constaté par investigation comme non atteignable en
// pratique aujourd'hui — documenté, pas contourné) appelle bien la MÊME fonction partagée, au
// niveau du code source réellement livré ; (4) non-régression du mécanisme de repli global sur
// un cas déjà couvert par la suite existante (préservation de 'carrousel', Priorité 8.1).
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const consoleLines = [];
  page.on('console', m => consoleLines.push(m.text()));

  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      // Planificateur principal (adocPlanQuery) — échec délibéré (500) pour forcer le repli
      // PAR SOUS-QUESTION à l'intérieur d'adocMultiPlan (scénario 2 ci-dessous).
      if (body.includes('"max_tokens":2000')) {
        route.fulfill({ status: 500, body: 'planner down (test)' });
        return;
      }
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"message_stop"}\n\ndata: [DONE]\n\n' });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // ═══ 1. Comportement direct de la fonction unique sur les 4 points de divergence tranchés ═══
  {
    const r = await page.evaluate(() => {
      const conf = window.adocBuildFallbackPlan('Prépare un support pour ma conférence sur le deuil');
      // _tw (résumé/vector_angle) ne garde que les 4 premiers mots nettoyés — phrase choisie
      // SANS apostrophe/tiret parasite et avec le mot accentué dans cette fenêtre de 4 mots.
      const accentSummary = window.adocBuildFallbackPlan('Théorie attachement couple stable');
      // _w0 (mot-clé de recherche) retient le PREMIER mot de plus de 4 caractères du texte brut
      // (règle héritée d'adocMultiPlan, point de divergence 4) — phrase choisie pour que ce
      // premier mot éligible soit lui-même accentué, isolant précisément le traitement des
      // accents (point 3) de la règle de sélection elle-même (point 4, déjà couverte en 1e).
      const accentKeyword = window.adocBuildFallbackPlan('Théorie de Bowlby sur l\'attachement');
      const keyword = window.adocBuildFallbackPlan('un je la fiche Gottman');
      const carrousel = window.adocBuildFallbackPlan('Fais-moi un carrousel sur les schémas de Young');
      return {
        confIntent: conf.intent,
        confMaxTokens: conf.max_tokens,
        accentTopicSummary: accentSummary.topic_summary,
        accentSearchTerm: accentKeyword.searches[0].terms[0],
        keywordSearchTerm: keyword.searches[0].terms[0],
        carrouselIntent: carrousel.intent,
      };
    });
    log('1a. "conf" déclenche bien intent=document (liste la plus complète retenue)', r.confIntent === 'document', r.confIntent);
    log('1b. max_tokens=8000 uniformément (valeur retenue pour les 2 anciens points d\'entrée)', r.confMaxTokens === 8000, r.confMaxTokens);
    log('1c. Accents préservés dans le résumé de secours ("attachement" jamais tronqué en "attachment")', r.accentTopicSummary.includes('attachement'), r.accentTopicSummary);
    log('1d. Accents préservés dans le mot-clé de recherche extrait ("Théorie" jamais tronqué en "Thorie")', r.accentSearchTerm === 'Théorie', r.accentSearchTerm);
    log('1e. Sélection du mot-clé : mot >4 caractères retenu (jamais "un"/"je"/"la")', r.keywordSearchTerm.length > 4 && !['un','je','la'].includes(r.keywordSearchTerm.toLowerCase()), r.keywordSearchTerm);
    log('1f. "carrousel" toujours préservé (non-régression Priorité 8.1)', r.carrouselIntent === 'carrousel', r.carrouselIntent);
  }

  // ═══ 2. Déclenchement RÉEL via le chemin adocMultiPlan (échec du planificateur pour LA
  //    sous-question) — confirme que le plan produit correspond exactement à l'appel direct de
  //    la fonction partagée sur ce même texte. ═══
  {
    const TEXT = 'Fais-moi un carrousel sur les schémas de Young';
    await page.fill('#clinical-question', TEXT);
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const plannerLine = consoleLines.find(l => l.startsWith('[Planner]'));
    const directPlan = await page.evaluate((t) => {
      const p = window.adocBuildFallbackPlan(t);
      return { intent: p.intent, output_format: p.output_format };
    }, TEXT);
    let observed = null;
    try { observed = plannerLine ? JSON.parse(plannerLine.replace('[Planner] ', '')) : null; } catch (e) {}
    log('2a. Le repli PAR SOUS-QUESTION (adocMultiPlan) a bien été exercé (log [Planner] capturé)', !!observed, plannerLine);
    log('2b. intent produit par le chemin adocMultiPlan == appel direct de la fonction partagée', observed && observed.intent === directPlan.intent, { observed: observed?.intent, direct: directPlan.intent });
    log('2c. output_format produit par le chemin adocMultiPlan == appel direct de la fonction partagée', observed && observed.fmt === directPlan.output_format, { observed: observed?.fmt, direct: directPlan.output_format });
  }

  // ═══ 3. Déclenchement via le garde de adocSend (FIX-EMPTY-PLAN) ═══
  // Investigation (vérifiée empiriquement, pas supposée) : dans le code actuel, adocPlanQuery et
  // adocExecutePlan/adocD1Search/adocVectorSearch capturent CHACUN leurs propres échecs
  // (try/catch interne + .catch() au point d'appel) avant qu'ils puissent remonter jusqu'à
  // adocMultiPlan — reproduit ici en abattant intégralement le réseau (route.abort sur tous les
  // appels clone-proxy/d1-query) : adocMultiPlan complète malgré tout sans jamais lever
  // d'exception (confirmé par le log "[FIX-MULTI-PLAN] dominant intent=..." qui apparaît quand
  // même). Ce garde de adocSend n'est donc, dans l'état actuel du code, PAS atteignable par un
  // échec réseau légitime — un filet de sécurité pour un adocMultiPlan qui deviendrait un jour
  // synchrone-défaillant, jamais exercé aujourd'hui. Le vérifier "en conditions réelles" via le
  // réseau produirait donc un test qui ne prouve rien de plus que le scénario 2 ci-dessus. Il est
  // donc vérifié ici au niveau du code source réellement livré (ancre de texte stable, même
  // patron que l'ancien test verify-p8-misc-client.js pour cette même zone) : preuve que CE garde
  // précis, tel que livré, appelle bien window.adocBuildFallbackPlan — jamais une logique séparée.
  {
    const src = fs.readFileSync(FILE, 'utf-8');
    const guardStart = src.indexOf('if (!plan || !plan.intent) {  // FIX-EMPTY-PLAN');
    const guardEnd = src.indexOf('\n      }', guardStart);
    const guardCode = guardStart >= 0 && guardEnd >= 0 ? src.slice(guardStart, guardEnd + '\n      }'.length) : null;
    log('3a. Le garde FIX-EMPTY-PLAN est localisé dans le fichier livré', !!guardCode, guardCode);
    log('3b. Il ne contient plus aucune logique de classification propre (aucun "toLowerCase" local)', guardCode && !guardCode.includes('.toLowerCase()'), guardCode);
    log('3c. Il délègue explicitement à adocBuildFallbackPlan (la fonction partagée)', guardCode && guardCode.includes('adocBuildFallbackPlan(text)'), guardCode);
    const execResult = guardCode ? await page.evaluate((code) => {
      let plan = null; // reproduit fidèlement la condition qui déclenche le garde
      const text = 'Fais-moi un carrousel sur les schémas de Young';
      eval(code);
      return { intent: plan.intent, output_format: plan.output_format };
    }, guardCode) : null;
    const directPlan = await page.evaluate(() => {
      const p = window.adocBuildFallbackPlan('Fais-moi un carrousel sur les schémas de Young');
      return { intent: p.intent, output_format: p.output_format };
    });
    log('3d. Exécuté avec plan=null, ce garde produit EXACTEMENT le même plan que l\'appel direct de la fonction partagée', execResult && execResult.intent === directPlan.intent && execResult.output_format === directPlan.output_format, { execResult, directPlan });
  }

  // ═══ 4. Non-régression — mécanisme de repli global toujours fonctionnel pour un cas déjà
  //    couvert (préservation de 'carrousel', déjà testée dans verify-p8-misc-client.js) ═══
  {
    const r = await page.evaluate(() => window.adocBuildFallbackPlan('un carrousel please').intent);
    log('4a. Non-régression — "carrousel" toujours reconnu par le repli global (cas déjà couvert ailleurs)', r === 'carrousel', r);
  }

  log('5. Aucune erreur JS', errors.length === 0, errors);

  console.log('=== Résultats — Correction rang 3, repli de classification unique ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
