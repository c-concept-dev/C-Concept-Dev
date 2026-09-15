// Priorité 3 (audit systémique) — confirme (1) que le contrat payload est désormais respecté
// pour le résumé de session (adocKvAutoSave), (2) qu'une erreur HTTP sur /session-load produit
// un message distinct de "aucune séance", (3) qu'une erreur HTTP sur /session-save n'affiche
// jamais un succès trompeur, et (4) qu'un résumé réel réussit bout en bout une fois le contrat
// corrigé (test réel, pas une relecture).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const capturedSummaryCallBodies = [];
  await page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const bodyStr = req.postData() || '';
      let parsed = {};
      try { parsed = JSON.parse(bodyStr); } catch (e) {}

      if (url.includes('/session-load')) {
        if (parsed.patientId === 'patient-http-error') {
          route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'D1 unavailable' }) });
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, history: [] }) });
        return;
      }
      if (url.includes('/session-save')) {
        if (parsed.patientId === 'patient-save-fail') {
          route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'KV write failed' }) });
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, patientId: parsed.patientId, sessions: 3 }) });
        return;
      }
      // Racine — appel du modèle pour le résumé (adocKvAutoSave). CONTRAT ATTENDU désormais :
      // { payload: {...} } — si reçu SANS cette enveloppe (regression du bug corrigé), on
      // renvoie délibérément 400 (identique au vrai comportement du Worker AVANT ce correctif),
      // pour que ce test échoue bruyamment si jamais la régression revenait.
      if (url.match(/workers\.dev\/?$/) && req.method() === 'POST') {
        capturedSummaryCallBodies.push(parsed);
        if (!parsed.payload) {
          route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Missing payload' }) });
          return;
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'Résumé réel généré par le modèle mocké.' }] }) });
        return;
      }
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  // ── 1. /session-load en erreur 500 → message distinct de "Aucune séance enregistrée" ──
  const loadErrorResult = await page.evaluate(async () => {
    window.adocKvPatientIdChange('patient-http-error');
    await window.adocKvLoad();
    return document.getElementById('adoc-kv-status').textContent;
  });
  console.log('=== Test 1 — /session-load en erreur 500 ===');
  console.log('Statut affiché:', JSON.stringify(loadErrorResult));
  console.log('=> Message distinct de "Aucune séance enregistrée":', !loadErrorResult.includes('Aucune séance enregistrée'));
  console.log('=> Message signale bien un problème (pas un état normal vide):', /impossible|erreur|réessayez/i.test(loadErrorResult));

  // Non-régression : un vrai "aucune séance" (200, found:false) affiche toujours le bon message.
  const loadEmptyResult = await page.evaluate(async () => {
    window.adocKvPatientIdChange('patient-vraiment-vide');
    await window.adocKvLoad();
    return document.getElementById('adoc-kv-status').textContent;
  });
  console.log('\n=== Non-régression — /session-load 200 avec found:false ===');
  console.log('Statut affiché:', JSON.stringify(loadEmptyResult));
  console.log('=> Toujours "Aucune séance enregistrée" pour ce cas légitime:', loadEmptyResult.includes('Aucune séance enregistrée'));

  // ── 2. Contrat payload corrigé + résumé réel réussi bout en bout ──
  const successResult = await page.evaluate(async () => {
    window.adocKvPatientIdChange('patient-summary-ok');
    // Force le chemin de sauvegarde (force=true, ignore le seuil de 2 échanges minimum).
    await window.adocKvSaveNow();
    return document.getElementById('adoc-kv-status').textContent;
  });
  console.log('\n=== Test 2 — contrat payload corrigé, résumé réel réussi ===');
  console.log('Corps envoyé au modèle (dernier appel):', JSON.stringify(capturedSummaryCallBodies[capturedSummaryCallBodies.length - 1]));
  console.log('=> Le corps envoyé enveloppe bien le payload sous { payload: ... } (contrat respecté):', !!(capturedSummaryCallBodies[capturedSummaryCallBodies.length - 1] || {}).payload);
  console.log('Statut affiché:', JSON.stringify(successResult));
  console.log('=> Sauvegarde réussie affichée (pas un échec, le contrat corrigé a permis un vrai résumé):', /Sauvegardé/.test(successResult));

  // ── 3. /session-save en erreur 500 → jamais un message de succès trompeur ──
  const saveFailResult = await page.evaluate(async () => {
    window.adocKvPatientIdChange('patient-save-fail');
    await window.adocKvSaveNow();
    return document.getElementById('adoc-kv-status').textContent;
  });
  console.log('\n=== Test 3 — /session-save en erreur 500 ===');
  console.log('Statut affiché:', JSON.stringify(saveFailResult));
  console.log('=> Jamais "Sauvegardé (undefined séance(s))" ni aucun message de succès trompeur:', !/Sauvegardé \(/.test(saveFailResult));
  console.log('=> Message d\'échec clair affiché:', /échouée|échoué|indisponible/i.test(saveFailResult));

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
