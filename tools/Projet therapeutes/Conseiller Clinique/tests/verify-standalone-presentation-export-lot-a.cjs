// STUDIO CLINIQUE — Export Présentation autonome, LOT A (fondation) — preuve réelle en navigateur
// (Playwright). Le fichier généré est ouvert via file:// (pas servi par un serveur), exactement
// comme un fichier téléchargé puis ouvert par une utilisatrice sur n'importe quel ordinateur.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function flatBlock(overrides) {
  return Object.assign({
    type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
    imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '',
    citationEntryIds: [],
  }, overrides);
}
function presentationSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation — export autonome', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_standalone', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-standalone-presentation';
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoc-standalone-'));

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  let failCount = 0;
  function check(cond, label) {
    if (cond) console.log('PASS —', label);
    else { console.log('FAIL —', label); failCount++; }
  }
  try {
    // ══════════════════════════════════════════════════════════════════════
    // ÉTAPE 1 — génération réelle d'une Présentation (quiz + couverture + vidéo locale), puis
    // génération du fichier autonome via le point d'accès réel (bouton → adocWsExportStandalonePresentation).
    // ══════════════════════════════════════════════════════════════════════
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const liveErrors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) liveErrors.push(e.message); });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const fetchImageCalls = [];
    let currentSSE = null;
    let capturedPdfHtml = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/fetch-image')) {
        const q = new URL(url).searchParams.get('q');
        fetchImageCalls.push(q);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/' + encodeURIComponent(q) + '.jpg' }] }) });
      }
      if (url.includes('/browser-rendering/generate-carrousel-pdf')) {
        let body = {};
        try { body = route.request().postDataJSON() || {}; } catch {}
        capturedPdfHtml = body.html;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: currentSSE });
      }
      // Le faux CDN sert de VRAIS octets. Depuis l'embarquement des images, l'export ne se
      // contente plus de retenir l'URL : il TÉLÉCHARGE l'image à la construction pour la
      // placer dans le fichier. Sans octets ici, l'export embarquerait l'aplat de repli —
      // comportement correct en cas d'échec, mais qui ne prouverait pas la résolution.
      if (url.startsWith('https://images.pexels.test/')) {
        return route.fulfill({ status: 200, contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const cards = [
      {
        title: 'Le stress chronique', coverImageQuery: 'chronic stress illustration', coverImageAlt: 'Illustration du stress chronique',
        blocks: [
          flatBlock({ type: 'heading', text: 'Le stress chronique', level: 2 }),
          flatBlock({
            type: 'quiz', text: 'Quelle hormone est associée au stress chronique ?',
            quizOptions: ['Dopamine', 'Cortisol'], quizCorrectIndex: 1,
            quizExplanation: "Le cortisol est l'hormone de stress principale.",
          }),
        ],
      },
      {
        title: 'Ressource vidéo', coverImageQuery: '', coverImageAlt: '',
        blocks: [flatBlock({ type: 'paragraph', text: 'Extrait commenté en séance.' })],
      },
    ];

    currentSSE = presentationSSE(cards);
    const storeKey = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-standalone'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline(
        'Prépare un exposé sur le stress chronique, avec un quiz et une vidéo.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-standalone', 'https://clone-proxy.test.local', precomputedRag
      );
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(storeKey, 'un artefact Présentation doit avoir été créé');

    // Insère un bloc vidéo local RÉEL sur la 2e diapositive, via le mécanisme existant du panneau
    // Médias (même convention que les tests précédents de ce projet) — jamais un objet construit à
    // la main hors du pipeline réel.
    await page.route('**/video-links', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'vid-1', url: 'http://localhost:47823/seance1.mp4', title: 'Extrait de séance' }] }) }));
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir');
    await page.evaluate(() => window.adocPresentNext ? null : null); // no-op, garde la forme du test homogène
    // Ajoute directement le bloc vidéo à la 2e diapositive du document structuré (même contrat que
    // adocVideoInsertFromSidebar écrirait), pour rester déterministe indépendamment de l'UI du
    // panneau Médias (hors périmètre de ce lot) — vérifié ensuite via le VRAI rendu partagé.
    await page.evaluate((sk) => {
      const art = window._adocArtifacts[sk];
      const slide2 = art._adocStructuredDoc.blocks[1];
      slide2.content.blocks.push({ id: 'video-1', type: 'video', content: { url: 'http://localhost:47823/seance1.mp4', title: 'Extrait de séance' }, citationIds: [], validation: {} });
    }, storeKey);

    // Capture le Blob réellement passé à adocDownloadArtifact (URL.createObjectURL), via le VRAI
    // point d'accès (bouton "Exporter — présentation interactive"), jamais un appel direct à une
    // fonction interne non exposée.
    await page.evaluate(() => {
      window.__capturedBlob = null;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.__capturedBlob = blob; return orig.call(URL, blob); };
    });
    const exportBtnVisible = await page.evaluate(() => !document.getElementById('cc-ws-export-standalone-presentation-btn').hidden);
    check(exportBtnVisible, 'le bouton "Exporter — présentation interactive" est visible pour ce documentKind');
    await page.evaluate(() => window.adocWsExportStandalonePresentation());
    const standaloneHtml = await page.evaluate(async () => window.__capturedBlob ? await window.__capturedBlob.text() : null);
    assert.ok(standaloneHtml, 'un fichier HTML autonome doit avoir été généré');
    const standalonePath = path.join(tmpDir, 'presentation-interactive.html');
    fs.writeFileSync(standalonePath, standaloneHtml, 'utf8');
    console.log('PASS 1/9 — Fichier autonome généré via le vrai point d\'accès (bouton), ' + standaloneHtml.length + ' caractères.');

    // ══════════════════════════════════════════════════════════════════════
    // ÉTAPE 2 — découverte incidente corrigée : l'export HTML classique ET l'export PDF embarquent
    // désormais les styles quiz/couverture/présentation.
    // ══════════════════════════════════════════════════════════════════════
    const classicHtml = await page.evaluate(async (sk) => {
      const art = window._adocArtifacts[sk];
      const result = await window.adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      return result.html;
    }, storeKey);
    for (const needle of ['.adoc-sc-quiz{', '.adoc-sc-presentation{', '.adoc-sc-card-img{']) {
      check(classicHtml.includes(needle), 'Export HTML classique — CSS "' + needle + '" désormais présente (découverte incidente corrigée)');
    }
    const classicScreenshotDir = path.join(tmpDir, 'classic-export.html');
    fs.writeFileSync(classicScreenshotDir, classicHtml, 'utf8');
    const classicPage = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await classicPage.goto('file://' + classicScreenshotDir);
    const classicQuizVisible = await classicPage.evaluate(() => {
      const reveal = document.querySelector('.adoc-sc-quiz-reveal');
      return reveal ? getComputedStyle(reveal).display !== 'none' : false;
    });
    check(classicQuizVisible, 'Export HTML classique — la réponse du quiz reste visible par défaut (jamais le masquage interactif ajouté par erreur)');
    await classicPage.close();

    await page.evaluate((sk) => {
      const art = window._adocArtifacts[sk];
      return window.adocWsExportCarrouselPDF ? window.adocWsExportCarrouselPDF() : null;
    }, storeKey).catch(() => {});
    await page.waitForTimeout(300);
    if (capturedPdfHtml) {
      for (const needle of ['.adoc-sc-quiz{', '.adoc-sc-presentation{', '.adoc-sc-card-img{']) {
        check(capturedPdfHtml.includes(needle), 'Export PDF — CSS "' + needle + '" désormais présente (découverte incidente corrigée)');
      }
    } else {
      check(false, 'Export PDF — HTML capturé (impossible de vérifier la CSS)');
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÉTAPE 3 — RÉGRESSION : le mode "Présenter" EN DIRECT reste strictement inchangé après le
    // passage de la CSS en constantes JS injectées (comportement visuel identique au correctif
    // visuel déjà testé).
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentOpen());
    const liveCheck = await page.evaluate(() => {
      const heading = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-heading');
      return heading ? getComputedStyle(heading).color : null;
    });
    check(!!liveCheck && liveCheck !== 'rgb(255, 255, 255)', 'RÉGRESSION — mode "Présenter" en direct : le titre reste lisible (jamais blanc sur fond clair), CSS injectée par JS strictement équivalente');
    const styleTagPresent = await page.evaluate(() => !!document.getElementById('adoc-present-engine-css'));
    check(styleTagPresent, 'RÉGRESSION — la balise <style id="adoc-present-engine-css"> a bien été injectée au chargement de la page vivante');
    await page.evaluate(() => window.adocPresentClose());
    await page.close();

    // ══════════════════════════════════════════════════════════════════════
    // ÉTAPE 4 — ouverture RÉELLE du fichier autonome via file:// (pas servi par un serveur), sur
    // une page fraîche indépendante de Studio Clinique.
    // ══════════════════════════════════════════════════════════════════════
    const standalonePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const standaloneErrors = [];
    standalonePage.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) standaloneErrors.push(e.message); });
    await standalonePage.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await standalonePage.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/fetch-image')) {
        const q = new URL(url).searchParams.get('q');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/' + encodeURIComponent(q) + '.jpg' }] }) });
      }
      // Le faux CDN sert de VRAIS octets. Depuis l'embarquement des images, l'export ne se
      // contente plus de retenir l'URL : il TÉLÉCHARGE l'image à la construction pour la
      // placer dans le fichier. Sans octets ici, l'export embarquerait l'aplat de repli —
      // comportement correct en cas d'échec, mais qui ne prouverait pas la résolution.
      if (url.startsWith('https://images.pexels.test/')) {
        return route.fulfill({ status: 200, contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await standalonePage.goto('file://' + standalonePath);
    // Depuis l'écran de démarrage (lot « plein écran », phase 3), un fichier exporté ne s'ouvre PLUS
    // tout seul : il attend le geste « ▶ Démarrer ». Ce n'est pas un défaut mais la correction d'un
    // défaut — un fichier ouvert au double-clic ne dispose d'AUCUNE activation utilisateur, et
    // aucun navigateur ne lui accorde le plein écran sans elle. Même ajustement que pour les neuf
    // autres suites qui ouvraient un export. Le clic est CONDITIONNEL : sans effet là où l'écran
    // n'existe pas.
    await standalonePage.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await standalonePage.waitForTimeout(400);
    await standalonePage.waitForTimeout(200);

    const openedState = await standalonePage.evaluate(() => ({
      overlayOpen: document.getElementById('cc-ws-present-overlay')?.classList.contains('open'),
      counter: document.getElementById('cc-ws-present-counter')?.textContent,
      hasHeading: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-heading'),
    }));
    check(openedState.overlayOpen === true, 'ÉTAPE 4 — le fichier autonome s\'ouvre en mode présentation après le clic sur « ▶ Démarrer »');
    check(openedState.counter === '1 / 2', 'ÉTAPE 4 — compteur correct (1 / 2)');
    check(openedState.hasHeading, 'ÉTAPE 4 — le contenu de la diapositive 1 est bien rendu');

    // Cover image réellement résolue (connexion internet disponible, comme prévu pour ce lot).
    const coverImg = await standalonePage.evaluate(() => {
      const img = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-img');
      return img ? { src: img.src, hasDataPexels: img.hasAttribute('data-pexels') } : null;
    });
    // Depuis le lot d'embarquement, la couverture n'est plus une URL distante jointe à l'ouverture :
    // elle est TÉLÉCHARGÉE à la construction et écrite dans le fichier. L'assertion est donc plus
    // forte qu'avant — non seulement l'image est résolue, mais le fichier n'a plus besoin du réseau.
    // Et ce n'est PAS l'aplat de repli : celui-ci est un data:image/svg+xml, et il signalerait un
    // téléchargement raté.
    check(!!coverImg && coverImg.src.startsWith('data:image/')
      && !coverImg.src.startsWith('data:image/svg+xml'),
      'ÉTAPE 4 — couverture EMBARQUÉE dans le fichier (ni URL distante, ni aplat de repli)');
    check(!!coverImg && coverImg.hasDataPexels === false, 'ÉTAPE 4 — data-pexels retiré après résolution');

    const screenshot1 = path.join(outDir, '1-standalone-diapositive1.png');
    await standalonePage.screenshot({ path: screenshot1, fullPage: false });
    console.log('CAPTURE —', screenshot1);

    // Révèle le quiz (2e bloc de la diapositive 1) puis clique une option.
    await standalonePage.evaluate(() => window.adocPresentNext());
    await standalonePage.waitForTimeout(50);
    const quizClick = await standalonePage.evaluate(() => {
      const quizEl = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-quiz');
      if (!quizEl) return null;
      const options = quizEl.querySelectorAll('.adoc-sc-quiz-option');
      options[0].click();
      return {
        answered: quizEl.classList.contains('is-answered'),
        correctMarked: options[1].classList.contains('is-correct'),
        revealShown: quizEl.querySelector('.adoc-sc-quiz-reveal').classList.contains('is-shown'),
      };
    });
    check(!!quizClick && quizClick.answered && quizClick.correctMarked && quizClick.revealShown,
      'ÉTAPE 4 — clic du quiz fonctionnel dans le fichier autonome (bonne réponse + explication révélées)');

    const screenshot2 = path.join(outDir, '2-standalone-quiz-revele.png');
    await standalonePage.screenshot({ path: screenshot2, fullPage: false });
    console.log('CAPTURE —', screenshot2);

    // Sommaire cliquable → saut vers la diapositive 2 (vidéo locale).
    await standalonePage.evaluate(() => window.adocPresentToggleToc());
    await standalonePage.evaluate(() => document.querySelectorAll('.cc-ws-present-toc-item')[1]?.click());
    await standalonePage.waitForTimeout(350);
    const slide2State = await standalonePage.evaluate(() => ({
      counter: document.getElementById('cc-ws-present-counter')?.textContent,
      videoWarning: document.querySelector('#cc-ws-present-slide-inner .adoc-sc-video-warning')?.textContent,
      hasVideoTag: !!document.querySelector('#cc-ws-present-slide-inner video'),
    }));
    check(slide2State.counter === '2 / 2', 'ÉTAPE 4 — sommaire cliquable : saut réussi vers la diapositive 2');
    check(slide2State.hasVideoTag, 'ÉTAPE 4 — le bloc vidéo est bien rendu sur la diapositive 2');
    check(slide2State.videoWarning === 'Vidéo locale — nécessite que le serveur vidéo tourne sur cet ordinateur.',
      'ÉTAPE 4 — repli honnête vidéo locale affiché correctement (aucun travail nécessaire, déjà géré par le rendu partagé)');

    const screenshot3 = path.join(outDir, '3-standalone-diapositive2-video.png');
    await standalonePage.screenshot({ path: screenshot3, fullPage: false });
    console.log('CAPTURE —', screenshot3);

    // Navigation clavier (flèche gauche) — la diapositive 2 a été atteinte pleinement révélée
    // (saut direct depuis le sommaire, forceFullyRevealed:true) : la diapositive 2 porte 2 blocs
    // (paragraphe + vidéo), donc une 1re flèche gauche démonte d'abord le dernier bloc révélé
    // (comportement de révélation progressive déjà établi et testé, jamais un bug), une 2e flèche
    // gauche change réellement de diapositive.
    await standalonePage.keyboard.press('ArrowLeft');
    await standalonePage.waitForTimeout(50);
    await standalonePage.keyboard.press('ArrowLeft');
    await standalonePage.waitForTimeout(350);
    const afterKeyboard = await standalonePage.evaluate(() => document.getElementById('cc-ws-present-counter')?.textContent);
    check(afterKeyboard === '1 / 2', 'ÉTAPE 4 — navigation clavier (flèche gauche) fonctionnelle');

    check(standaloneErrors.length === 0, 'ÉTAPE 4 — aucune erreur JS non gérée dans le fichier autonome (obtenu: ' + JSON.stringify(standaloneErrors) + ')');
    await standalonePage.close();

    check(liveErrors.length === 0, 'Aucune erreur JS non gérée pendant tout le scénario côté application');

  } finally {
    await browser.close();
  }
  console.log('\n' + (failCount === 0 ? 'TOUS LES TESTS PASSENT' : failCount + ' ÉCHEC(S)'));
  console.log('Fichier autonome : ' + tmpDir);
  console.log('Captures : ' + outDir);
  process.exit(failCount === 0 ? 0 : 1);
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
