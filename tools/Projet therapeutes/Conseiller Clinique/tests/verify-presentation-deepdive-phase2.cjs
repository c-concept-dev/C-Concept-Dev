// STUDIO CLINIQUE — Présentation "site de poche", ACTE 2, PHASE 2 : rendu + porte pour les liens
// d'approfondissement. Construction directe sur la Phase 1 (schéma + génération, déjà vérifiée) et
// sur le patron de la porte image (déjà construit et vérifié) — porte GÉNÉRALISÉE (décision point 1
// du CDC), jamais un second élément dupliqué.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function flatBlock(overrides) {
  return Object.assign({
    type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
    imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '',
    questionnaireQuestions: [], questionnaireProfiles: [], questionnaireTwoPartners: false,
    deepDiveLinks: [], citationEntryIds: [],
  }, overrides);
}
function presentationSSE(input) {
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_deepdive2', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-presentation-deepdive-phase2';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    page.on('dialog', (d) => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const input = {
      title: 'Le stress chronique', purpose: 'formation', audience: 'praticien',
      cards: [{
        title: 'Le rôle du cortisol', coverImageQuery: '', coverImageAlt: '',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Le cortisol joue un rôle central dans la réponse au stress.', deepDiveLinks: [{ text: 'cortisol', targetId: 'deepdive-cortisol' }] }),
          flatBlock({ type: 'paragraph', text: 'Un second paragraphe sans rapport avec le premier.', deepDiveLinks: [{ text: 'expression absente de ce texte', targetId: 'deepdive-cortisol' }] }),
        ],
      }],
      deepDives: [
        { id: 'deepdive-cortisol', title: 'Le cortisol', paragraphs: ['Le cortisol est une hormone stéroïde sécrétée par les glandes surrénales.', 'Un taux chroniquement élevé est associé à plusieurs troubles cliniques.'] },
      ],
    };

    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool' && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationSSE(input) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const storeKey = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-deepdive2'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const precomputedRag = { chunks: [{ content: 'Le cortisol est une hormone du stress.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline(
        'Prépare un exposé avec un complément sur le cortisol.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-deepdive2', 'https://clone-proxy.test.local', precomputedRag
      );
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(storeKey, 'un artefact Présentation doit avoir été créé');
    assert.equal(await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey), true, 'adocOpenWorkspace doit réussir');

    // ══════════════════════════════════════════════════════════════════════
    // 0. ABSENCE hors présentation — aucun onclick/chip de porte dans l'espace de travail normal.
    // ══════════════════════════════════════════════════════════════════════
    const workspaceHtml = await page.evaluate(() => document.getElementById('cc-ws-doc-card')?.innerHTML || '');
    assert.ok(!workspaceHtml.includes('adocPresentOpenDeepDive'), 'aucun onclick d\'approfondissement ne doit apparaître dans l\'espace de travail normal');
    assert.ok(!workspaceHtml.includes('adoc-sc-deepdive'), 'aucune classe deep-dive (lien ni puce) ne doit apparaître dans l\'espace de travail normal');
    console.log('PASS 1/8 — Aucun rendu de lien/puce d\'approfondissement hors mode présentation.');

    // ══════════════════════════════════════════════════════════════════════
    // 1. MODE PRÉSENTATION — le 1er paragraphe (correspondance trouvée) porte le lien ET la puce ;
    //    le 2e paragraphe (correspondance ÉCHOUÉE délibérément) porte SEULEMENT la puce.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentOpen());
    await page.waitForTimeout(50);
    // Montage progressif (Partie C, déjà existant) — 2 blocs sur cette diapositive : révèle le
    // second avant toute interaction (pointer-events:none tant qu'un bloc n'est pas montré, cf.
    // .adoc-sc-reveal), jamais un contournement du mécanisme, juste son usage normal.
    await page.evaluate(() => window.adocPresentNext());
    await page.waitForTimeout(50);
    const paragraphs = await page.evaluate(() => Array.from(document.querySelectorAll('#cc-ws-present-slide-inner .adoc-sc-paragraph')).map((p) => ({
      hasLink: !!p.querySelector('.adoc-sc-deepdive-link'),
      linkText: p.querySelector('.adoc-sc-deepdive-link')?.textContent || null,
      chipCount: p.querySelectorAll('.adoc-sc-deepdive-chip').length,
    })));
    assert.equal(paragraphs.length, 2, 'les 2 paragraphes doivent être rendus');
    assert.equal(paragraphs[0].hasLink, true, 'le 1er paragraphe doit porter le lien en ligne (correspondance exacte trouvée)');
    assert.equal(paragraphs[0].linkText, 'cortisol', 'le lien en ligne doit envelopper EXACTEMENT l\'expression ancre');
    assert.equal(paragraphs[0].chipCount, 1, 'la puce doit AUSSI être présente même quand l\'enrichissement en ligne a réussi');
    assert.equal(paragraphs[1].hasLink, false, 'le 2e paragraphe ne doit PORTER AUCUN lien en ligne (l\'expression ancre n\'y apparaît pas)');
    assert.equal(paragraphs[1].chipCount, 1, 'la puce doit rester présente MÊME quand la correspondance de texte échoue — c\'est le vrai filet d\'accès');
    console.log('PASS 2/8 — Lien en ligne visuellement identifiable quand la correspondance existe ; puce "↳ Approfondir" TOUJOURS présente, y compris quand la correspondance échoue.');
    await page.waitForTimeout(300); // laisse la transition d'apparition du 2e bloc se terminer avant la capture
    await page.screenshot({ path: path.join(outDir, '1-diapositive-avec-liens.png') });

    // ══════════════════════════════════════════════════════════════════════
    // 2. Coche un état de référence AVANT toute ouverture de porte (preuve byte-pour-byte ensuite).
    // ══════════════════════════════════════════════════════════════════════
    const beforeHtml = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);

    // ══════════════════════════════════════════════════════════════════════
    // 3. OUVERTURE PAR LA PUCE (2e paragraphe, sans correspondance en ligne) — preuve que la puce
    //    ouvre bien la BONNE page (titre + paragraphes corrects).
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-slide-inner .adoc-sc-paragraph:nth-of-type(2) .adoc-sc-deepdive-chip');
    await page.waitForTimeout(50);
    const doorViaChip = await page.evaluate(() => {
      const door = document.getElementById('cc-ws-present-door');
      return {
        open: door.classList.contains('open'), hidden: door.hidden,
        title: door.querySelector('.cc-ws-present-door-title')?.textContent || null,
        paragraphs: Array.from(door.querySelectorAll('.cc-ws-present-door-text p')).map((p) => p.textContent),
        imgHidden: door.querySelector('img')?.hidden,
      };
    });
    assert.equal(doorViaChip.open, true, 'la porte doit s\'ouvrir via la puce');
    assert.equal(doorViaChip.hidden, false);
    assert.equal(doorViaChip.title, 'Le cortisol', 'le titre affiché doit être EXACTEMENT celui de l\'entrée deepDives référencée');
    assert.deepEqual(doorViaChip.paragraphs, ['Le cortisol est une hormone stéroïde sécrétée par les glandes surrénales.', 'Un taux chroniquement élevé est associé à plusieurs troubles cliniques.'], 'les paragraphes affichés doivent être EXACTEMENT ceux de deepDives, chacun dans son propre <p>');
    assert.equal(doorViaChip.imgHidden, true, 'l\'image ne doit pas être visible pendant qu\'un approfondissement est affiché (porte généralisée, slot exclusif)');
    console.log('PASS 3/8 — La puce ouvre la bonne page (titre + paragraphes exacts) — preuve que le filet d\'accès fonctionne indépendamment de l\'enrichissement en ligne.');
    await page.screenshot({ path: path.join(outDir, '2-porte-approfondissement-ouverte.png') });

    // ══════════════════════════════════════════════════════════════════════
    // 4. FERMETURE PAR LE BOUTON — diapositive de départ STRICTEMENT intacte (byte-pour-byte).
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-door-close');
    await page.waitForTimeout(50);
    const afterButtonClose = await page.evaluate(() => {
      const door = document.getElementById('cc-ws-present-door');
      const overlay = document.getElementById('cc-ws-present-overlay');
      return {
        doorHidden: door.hidden, doorOpen: door.classList.contains('open'),
        presentStillOpen: overlay.classList.contains('open'),
        html: document.getElementById('cc-ws-present-slide-inner').innerHTML,
      };
    });
    assert.equal(afterButtonClose.doorHidden, true, 'la porte doit se refermer (bouton)');
    assert.equal(afterButtonClose.doorOpen, false);
    assert.equal(afterButtonClose.presentStillOpen, true, 'le mode présentation lui-même doit rester ouvert après la fermeture d\'une porte');
    assert.equal(afterButtonClose.html, beforeHtml, 'le HTML de la diapositive de départ doit être BYTE POUR BYTE identique avant/après — la porte ne doit jamais toucher #cc-ws-present-slide-inner');
    console.log('PASS 4/8 — Fermeture par le bouton : diapositive de départ strictement intacte (byte pour byte).');

    // ══════════════════════════════════════════════════════════════════════
    // 5. OUVERTURE PAR LE LIEN EN LIGNE (1er paragraphe) — même porte, même contenu correct.
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-slide-inner .adoc-sc-deepdive-link');
    await page.waitForTimeout(50);
    const doorViaLink = await page.evaluate(() => ({
      open: document.getElementById('cc-ws-present-door').classList.contains('open'),
      title: document.querySelector('.cc-ws-present-door-title')?.textContent || null,
    }));
    assert.equal(doorViaLink.open, true, 'la porte doit s\'ouvrir via le lien en ligne aussi');
    assert.equal(doorViaLink.title, 'Le cortisol');
    console.log('PASS 5/8 — Le lien en ligne ouvre lui aussi la bonne page (même porte généralisée).');

    // ══════════════════════════════════════════════════════════════════════
    // 6. FERMETURE PAR ÉCHAP — ferme la porte SEULE, jamais le mode présentation.
    // ══════════════════════════════════════════════════════════════════════
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const afterEscape = await page.evaluate(() => ({
      doorHidden: document.getElementById('cc-ws-present-door').hidden,
      presentStillOpen: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
      counter: document.getElementById('cc-ws-present-counter').textContent,
      html: document.getElementById('cc-ws-present-slide-inner').innerHTML,
    }));
    assert.equal(afterEscape.doorHidden, true, 'Échap doit refermer la porte');
    assert.equal(afterEscape.presentStillOpen, true, 'Échap ne doit JAMAIS fermer les deux niveaux (présentation + porte) d\'un seul coup');
    assert.equal(afterEscape.counter, '1 / 1', 'la diapositive affichée ne doit pas avoir changé');
    assert.equal(afterEscape.html, beforeHtml, 'la diapositive de départ doit rester byte pour byte identique après une fermeture par Échap aussi');
    console.log('PASS 6/8 — Échap referme la porte d\'approfondissement seule, jamais le mode présentation lui-même ; diapositive strictement intacte.');
    await page.screenshot({ path: path.join(outDir, '3-apres-fermeture-echap.png') });

    // Une seconde pression sur Échap doit maintenant fermer le mode présentation lui-même.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const presentClosedNow = await page.evaluate(() => !document.getElementById('cc-ws-present-overlay').classList.contains('open'));
    assert.equal(presentClosedNow, true, 'une seconde pression sur Échap (porte déjà fermée) doit fermer le mode présentation, comportement préexistant inchangé');
    console.log('PASS 7/8 — Régression : Échap ferme bien le mode présentation lui-même une fois la porte déjà fermée.');

    // ══════════════════════════════════════════════════════════════════════
    // 8. Aucune erreur JS non gérée sur tout le scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario');
    console.log('PASS 8/8 — Zéro erreur JS non gérée.');

    console.log('\nTOUS LES TESTS PHASE 2 LIENS D\'APPROFONDISSEMENT PASSENT (8/8)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
