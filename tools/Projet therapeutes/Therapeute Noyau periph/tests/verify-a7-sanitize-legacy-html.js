// A7 (audit Codex, P1) — HTML legacy inséré sans isolation dans le workspace.
// AVANT ce lot : art.html (produit par le modèle) était injecté tel quel via
// cc-ws-doc-card.innerHTML dans adocOpenWorkspace, sans le moindre assainissement — un attribut
// gestionnaire d'événement inline (onerror, onload, onclick…) s'exécute avec les mêmes
// privilèges que l'app hôte (window, cookies, DOM). Reproduit AVANT correctif dans
// verify-a7-repro-before-fix.js (Régression #5 : bug confirmé sur le code non modifié).
//
// Décision (options présentées, choix explicite de Christophe) : assainissement du HTML avant
// insertion plutôt qu'isolation complète par iframe — une iframe sandboxée sans
// allow-same-origin casserait Phase 1/2 (correction/insertion de bloc legacy), qui dépendent
// d'un accès direct au DOM du document depuis la page hôte.
//
// Ce lot : adocSanitizeLegacyHtmlForWorkspace retire tout <script> et tout attribut onXxx (et
// href/src "javascript:") du HTML avant l'affichage dans cc-ws-doc-card — jamais de art.html
// lui-même (export, charte automatique item 44, re-parsing Phase 1/2 restent inchangés).
//
// Scénario 1 — document legacy normal (Phase 1/2, item 44, item 48) : comportement STRICTEMENT
// inchangé, aucune régression sur les mécanismes déjà validés cette session.
// Scénario 2 — contenu HTML malveillant simulé : neutralisé, preuve concrète (pas supposée).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok, extra) => results.push([label, ok, extra]);

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 1 — document legacy normal, non-régression Phase 1/2 + item 44/48
  // ══════════════════════════════════════════════════════════════════════
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => { if (route.request().url().startsWith('file://')) return route.continue(); route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await page.goto('file://' + FILE);
    await page.waitForTimeout(200);

    const html = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
      + '<h1>Titre du document</h1>'
      + '<p>Un premier paragraphe de contenu clinique réel, jamais un texte de remplacement.</p>'
      + '<ul><li>Point A</li><li>Point B</li></ul>'
      + '<table><tbody><tr><td>Cellule 1</td><td>Cellule 2</td></tr></tbody></table>'
      + '<img src="https://images.example/photo.jpg" alt="illustration">'
      + '</body></html>';
    await page.evaluate((h) => {
      if (!window._adocArtifacts) window._adocArtifacts = {};
      window._adocArtifacts['a7-normal'] = { html: h, name: 'doc-a7-normal', fmt: 'html',
        _adocGenerationEngine: 'legacy-html', _adocLegacySourceSnapshot: { sourceSnapshotId: 'snap-1', entries: [{ id: 'e1' }] },
        _adocDocumentKind: 'fiche',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: true, transform: false, export: true, qualityControlledExport: false } };
    }, html);
    const opened = await page.evaluate((k) => window.adocOpenWorkspace(k), 'a7-normal');
    await page.waitForTimeout(200);
    log('[1] a. adocOpenWorkspace retourne true (rendu affiché avec succès)', opened === true, opened);

    const rendered = await page.evaluate(() => document.getElementById('cc-ws-doc-card').innerHTML);
    log('[1] b. Le contenu textuel réel est intact (titre, paragraphe, liste, tableau)',
      rendered.includes('Titre du document') && rendered.includes('contenu clinique réel') && rendered.includes('Point A') && rendered.includes('Point B') && rendered.includes('Cellule 1'), null);
    log('[1] c. La charte CSS (:root) est intacte', rendered.includes('--mer:#1f5053'), null);
    log('[1] d. L\'image (sans script associé) reste affichée', rendered.includes('photo.jpg'), null);

    // Non-régression Phase 1 (correction de bloc legacy) — data-cc-legacy-block-id toujours posé,
    // panneau de correction toujours ouvrable sur un document assaini.
    await page.click('#cc-ws-doc-card [data-cc-legacy-block-id]');
    await page.waitForTimeout(100);
    const panelPresent = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('[1] e. Non-régression Phase 1 — la sélection/correction de bloc legacy reste fonctionnelle après assainissement', panelPresent === true, panelPresent);
    log('[1] f. Aucune erreur JS', errors.length === 0, errors);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCÉNARIO 2 — contenu HTML malveillant simulé, neutralisation prouvée
  // ══════════════════════════════════════════════════════════════════════
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);
    await page.waitForTimeout(200);

    const maliciousHtml = '<!DOCTYPE html><html><body>'
      + '<h1>Faux document</h1>'
      + '<p onclick="window.__a7Attack1=true;document.title=\'PWNED\';">Cliquez ici</p>'
      + '<img src="x-does-not-exist.png" onerror="window.__a7Attack2={cookie:document.cookie,href:window.location.href};">'
      + '<a href="javascript:window.__a7Attack3=true;" id="a7-link">lien</a>'
      + '<script>window.__a7Attack4=true;<\/script>'
      + '</body></html>';
    await page.evaluate((h) => {
      if (!window._adocArtifacts) window._adocArtifacts = {};
      window._adocArtifacts['a7-evil'] = { html: h, name: 'doc-a7-evil', fmt: 'html',
        _adocGenerationEngine: 'legacy-html', _adocLegacySourceSnapshot: { sourceSnapshotId: 'snap-1', entries: [{ id: 'e1' }] },
        _adocDocumentKind: 'fiche',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: false, transform: false, export: true, qualityControlledExport: false } };
    }, maliciousHtml);
    await page.evaluate((k) => window.adocOpenWorkspace(k), 'a7-evil');
    await page.waitForTimeout(200);
    // Déclenche les vecteurs qui nécessitent une interaction (le onerror de l'image se déclenche
    // déjà seul ; le onclick nécessite un clic réel sur l'élément affiché).
    await page.click('#cc-ws-doc-card p').catch(() => {});
    const linkHref = await page.evaluate(() => { const a = document.getElementById('a7-link'); return a ? a.getAttribute('href') : 'ELEMENT_ABSENT'; });
    if (linkHref && linkHref !== 'ELEMENT_ABSENT') { await page.click('#a7-link').catch(() => {}); }
    await page.waitForTimeout(200);

    const poc = await page.evaluate(() => ({ attack1: window.__a7Attack1 || false, attack2: window.__a7Attack2 || null, attack3: window.__a7Attack3 || false, attack4: window.__a7Attack4 || false }));
    const hostTitle = await page.title();
    const renderedEvil = await page.evaluate(() => document.getElementById('cc-ws-doc-card').innerHTML);

    log('[2] a. onclick neutralisé — jamais déclenché même après un vrai clic sur l\'élément', poc.attack1 === false, poc.attack1);
    log('[2] b. onerror neutralisé — jamais d\'accès à document.cookie / window.location de l\'hôte', poc.attack2 === null, poc.attack2);
    log('[2] c. href="javascript:" neutralisé — attribut retiré, jamais exécuté même cliqué', linkHref !== 'javascript:window.__a7Attack3=true;' && poc.attack3 === false, { linkHref, attack3: poc.attack3 });
    log('[2] d. <script> retiré du DOM affiché (déjà inerte via innerHTML, retiré quand même en défense en profondeur)', !renderedEvil.includes('<script') && poc.attack4 === false, { attack4: poc.attack4 });
    log('[2] e. Le DOM hôte lui-même reste intact (document.title jamais modifié)', hostTitle !== 'PWNED', hostTitle);
    log('[2] f. Le contenu textuel légitime survit à l\'assainissement (jamais un document vidé)', renderedEvil.includes('Faux document') && renderedEvil.includes('Cliquez ici'), null);
    log('[2] g. Aucune erreur JS (l\'assainissement ne casse rien silencieusement)', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — A7 : HTML legacy assaini avant insertion dans le workspace ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
