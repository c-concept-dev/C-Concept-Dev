// Lot "Réduire Mémoire patient à un menu déroulant replié par défaut" — changement purement
// visuel : la section est enveloppée dans un composant repliable (réutilise le même patron
// chevron déjà existant pour cc-ws-memory-toggle/cc-ws-memory-body dans l'écran de travail,
// sous des classes distinctes adoc-sidebar-memory-toggle/adoc-sidebar-memory-body pour éviter
// toute collision de sélecteur avec l'élément équivalent que l'écran de travail crée
// dynamiquement), repliée par défaut, descendue en bas de la colonne latérale. AUCUNE fonction
// JS existante (adocKvPatientIdChange, adocKvSaveNow, adocKvLoad, adocKvClear, adocKvAutoSave)
// n'est retirée ni modifiée — seul l'affichage change.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  let autoSaveCallCount = 0;
  let lastSavedPatientId = null;
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 1, total_chunks: 1, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/session-load')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: false }) }); return; }
    if (url.includes('/session-save')) {
      autoSaveCallCount++;
      try { lastSavedPatientId = JSON.parse(req.postData() || '{}').patientId || null; } catch (e) {}
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // La sidebar (#assistdoc-screen) est masquée par défaut derrière l'écran d'accueil
  // (#cc-landing) — même mécanisme réel que les autres tests de ce fichier (cf.
  // verify-ux8w-workspace.js) : on déclenche l'événement réel 'conseiller-clinique:start'
  // pour atteindre l'écran principal, sans attendre la fin d'une génération complète.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('conseiller-clinique:start', { detail: { prompt: 'Question de test', format: 'fiche' } }));
  });
  await page.waitForTimeout(300);

  console.log('=== 1. Au chargement — section repliée par défaut ===');
  const initial = await page.evaluate(() => {
    const toggle = document.getElementById('adoc-sidebar-memory-toggle');
    const body = document.getElementById('adoc-sidebar-memory-body');
    const input = document.getElementById('adoc-kv-patient-id');
    return {
      toggleExists: !!toggle,
      ariaExpanded: toggle?.getAttribute('aria-expanded'),
      bodyHasOpenClass: body?.classList.contains('open'),
      inputVisible: input ? (input.getBoundingClientRect().height > 0 && getComputedStyle(input).display !== 'none' && getComputedStyle(body).display !== 'none') : null,
      toggleLabel: toggle?.textContent?.trim(),
    };
  });
  log('1a. Le bouton de repli existe', initial.toggleExists);
  log('1b. aria-expanded="false" au chargement', initial.ariaExpanded === 'false');
  log('1c. Le corps replié n\'a pas la classe "open"', initial.bodyHasOpenClass === false);
  log('1d. Le champ ID patient n\'est PAS visible (masqué par le repli)', initial.inputVisible === false);
  log('1e. Le libellé du bouton contient bien "Mémoire patient"', (initial.toggleLabel || '').includes('Mémoire patient'));

  console.log('\n=== 2. Position — après "Documents joints", pas en tête de colonne ===');
  const order = await page.evaluate(() => {
    const sidebar = document.getElementById('adoc-sidebar-panel');
    const sections = Array.from(sidebar.children);
    const memIdx = sections.findIndex(el => el.contains(document.getElementById('adoc-sidebar-memory-toggle')));
    const docsIdx = sections.findIndex(el => el.textContent.includes('Documents joints'));
    const firstSectionHasMemory = sections[0]?.contains(document.getElementById('adoc-sidebar-memory-toggle'));
    return { memIdx, docsIdx, firstSectionHasMemory };
  });
  log('2a. La section Mémoire patient vient APRÈS "Documents joints"', order.memIdx > order.docsIdx && order.docsIdx !== -1);
  log('2b. La section Mémoire patient n\'est plus en tête de colonne', order.firstSectionHasMemory === false);

  console.log('\n=== 3. Clic sur le libellé — dépliage ===');
  await page.click('#adoc-sidebar-memory-toggle');
  await page.waitForTimeout(100);
  const afterOpen = await page.evaluate(() => {
    const toggle = document.getElementById('adoc-sidebar-memory-toggle');
    const body = document.getElementById('adoc-sidebar-memory-body');
    const input = document.getElementById('adoc-kv-patient-id');
    return {
      ariaExpanded: toggle.getAttribute('aria-expanded'),
      bodyOpen: body.classList.contains('open'),
      inputVisible: input.getBoundingClientRect().height > 0 && getComputedStyle(body).display !== 'none',
    };
  });
  log('3a. aria-expanded devient "true" après clic', afterOpen.ariaExpanded === 'true');
  log('3b. Le corps devient visible (classe "open")', afterOpen.bodyOpen === true);
  log('3c. Le champ ID patient devient visible et manipulable', afterOpen.inputVisible === true);

  console.log('\n=== 4. Une fois dépliée — saisir un ID patient et sauvegarder fonctionne comme avant ===');
  await page.fill('#adoc-kv-patient-id', 'dupont-marie');
  await page.click('button[onclick="adocKvSaveNow()"]');
  await page.waitForTimeout(300);
  log('4a. adocKvSaveNow() déclenche bien un appel réseau de sauvegarde (non-régression)', autoSaveCallCount > 0);
  const patientIdValue = await page.evaluate(() => document.getElementById('adoc-kv-patient-id').value);
  log('4b. La valeur saisie est bien conservée dans le champ', patientIdValue === 'dupont-marie');

  console.log('\n=== 5. Re-clic sur le libellé — repliage (toggle bidirectionnel) ===');
  await page.click('#adoc-sidebar-memory-toggle');
  await page.waitForTimeout(100);
  const afterClose = await page.evaluate(() => ({
    ariaExpanded: document.getElementById('adoc-sidebar-memory-toggle').getAttribute('aria-expanded'),
    bodyOpen: document.getElementById('adoc-sidebar-memory-body').classList.contains('open'),
    valueStillThere: document.getElementById('adoc-kv-patient-id').value,
  }));
  log('5a. Un second clic replie de nouveau (aria-expanded="false")', afterClose.ariaExpanded === 'false');
  log('5b. Le corps redevient masqué', afterClose.bodyOpen === false);
  log('5c. La valeur saisie N\'EST PAS perdue en repliant (élément déplacé/masqué, jamais recréé)', afterClose.valueStillThere === 'dupont-marie');

  console.log('\n=== 6. Non-régression — aucune fonction JS existante retirée/renommée ===');
  const fnCheck = await page.evaluate(() => ({
    adocKvPatientIdChange: typeof window.adocKvPatientIdChange,
    adocKvSaveNow: typeof window.adocKvSaveNow,
    adocKvLoad: typeof window.adocKvLoad,
    adocKvClear: typeof window.adocKvClear,
  }));
  log('6a. adocKvPatientIdChange toujours une fonction', fnCheck.adocKvPatientIdChange === 'function');
  log('6b. adocKvSaveNow toujours une fonction', fnCheck.adocKvSaveNow === 'function');
  log('6c. adocKvLoad toujours une fonction', fnCheck.adocKvLoad === 'function');
  log('6d. adocKvClear toujours une fonction', fnCheck.adocKvClear === 'function');

  console.log('\n=== 7. Aucune erreur JS levée pendant tout le scénario ===');
  log('7a. Zéro pageerror', errors.length === 0);
  if (errors.length) console.log('  erreurs:', errors);

  console.log('=== Résultats — Mémoire patient repliée par défaut ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
