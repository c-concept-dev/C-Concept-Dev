// UNE PAGE D'APPROFONDISSEMENT ILLUSTRÉE DOIT TRAVERSER LE PIPELINE RÉEL.
//
// DÉFAUT EN LIGNE, observé par Christophe : la génération aboutit (tool_use analysé), puis
//   AdocSchemaValidationError (clinical-document.schema.json) : /deepDives/1 must NOT have
//   additional properties
// suivi du repli automatique sur l'ancien moteur. Cause : le schéma d'OUTIL exige imageQuery et
// imageAlt sur chaque page, adocConvertDeepDives les reporte quand imageQuery n'est pas vide, mais
// deepDives.items du schéma de DOCUMENT n'admet que id/title/paragraphs avec
// additionalProperties:false. Le défaut est donc INTERMITTENT : il ne se déclenche que lorsque le
// modèle illustre réellement une page.
//
// POURQUOI LES TESTS NE L'ONT PAS VU : ils appellent la conversion, ou forgent des documents, sans
// traverser la validation complète. Ce test passe par window.adocRunGenerationPipeline — le point
// d'entrée réel, avec une réponse SSE simulée, comme verify-presentation-lot5-questionnaire.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const crypto = require('node:crypto');
const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
// Forme reprise de verify-assemblage-cours : c'est elle qu'adocAssembleCourse attend.
function forgerModule(n, illustree) {
  const entries = [{ sourceSnapshotEntryId: 'entry-1', sourceType: 'library', sourceId: 'livre-p' + n,
    passageId: 'p' + n, exactText: 'Texte du passage p' + n, contentChecksum: sha256('Texte du passage p' + n),
    book: 'Livre p' + n, author: 'Auteur', locator: { page: 10, section: null }, retrievedAt: '2026-01-01T00:00:00Z' }];
  const citations = [{ citationId: 'citation-1', sourceSnapshotEntryId: 'entry-1', displayLabel: 'Livre p' + n + ', p. 10' }];
  const page = { id: 'dd-a', title: 'Page du module ' + n, paragraphs: ['Un paragraphe de page.'] };
  if (illustree) { page.imageQuery = 'couple budget table'; page.imageAlt = 'Un couple devant des papiers'; }
  return { id: 'm' + n, snapshot: { sourceSnapshotId: 's' + n, entries }, doc: {
    schemaVersion: 1, documentId: 'm' + n, versionId: 'm' + n + '-v1', previousVersionId: null,
    requestId: 'r' + n, sourceSnapshotId: 's' + n, createdAt: '2026-01-01T00:00:00Z',
    language: 'fr', status: 'draft', title: 'Module ' + n, purpose: 'Objectif', audience: 'clinicien',
    documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
    citations: citations,
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                  accessibility: 'pending', humanClinicalReview: 'required' },
    blocks: [{ id: 'card-01', type: 'card', content: { title: 'Module ' + n + ' — diapositive',
      imageRef: null, imageAlt: null, blocks: [
        { id: 'paragraph-1', type: 'paragraph', content: { text: 'Module ' + n + '.' },
          citationIds: ['citation-1'], validation: { citationLinks: [{ citationId: 'citation-1',
            claimText: 'Une affirmation.', claimSupport: 'pending' }] } },
        { id: 'heading-1', type: 'heading', content: { text: 'Notion du module ' + n, level: 2 },
          citationIds: [], validation: {}, deepDiveLinks: [{ text: 'Notion du module ' + n, targetId: 'dd-a' }] }] },
      citationIds: [], validation: {} }],
    deepDives: [page] } };
}
const sse = (events) => events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
const flatBlock = (o) => Object.assign({
  type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
  imageQuery: '', imageAlt: '', questionnaireQuestions: [], questionnaireProfiles: [],
  questionnaireTwoPartners: false, deepDiveLinks: [], citationEntryIds: [],
}, o);
// Une page ILLUSTRÉE et une page NUE : c'est le contraste qui montre l'intermittence du défaut.
const PAGES = [
  { id: 'n1', title: 'La dette invisible', imageQuery: 'couple budget table', imageAlt: 'Un couple devant des papiers',
    paragraphs: ['Les comptes séparés dissimulent parfois une dette que l\'un porte seul.'], deepDiveLinks: [] },
  { id: 'n2', title: 'Le compte commun', imageQuery: '', imageAlt: '',
    paragraphs: ['Mettre en commun ne règle pas la question du pouvoir.'], deepDiveLinks: [] },
];
const CARTES = [
  { title: 'L\'argent dans le couple', coverImageQuery: 'couple finances', coverImageAlt: 'Deux mains et une calculatrice',
    coverDeepDiveLinks: [], blocks: [
      flatBlock({ type: 'paragraph', text: 'La dette invisible pèse sur la relation plus que son montant.',
                  deepDiveLinks: [{ text: 'La dette invisible', targetId: 'n1' }] }),
      flatBlock({ type: 'paragraph', text: 'Le compte commun n\'est pas une solution en soi.',
                  deepDiveLinks: [{ text: 'Le compte commun', targetId: 'n2' }] }) ] },
];
const sseDoc = (cards, deepDives) => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_img', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta',
    partial_json: JSON.stringify({ title: 'L\'argent dans le couple', purpose: 'formation', audience: 'praticien', cards: cards, deepDives: deepDives }) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
]);

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'page-illustree-'));
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const erreurs = [];
    const journal = [];
    // Même filtre nommé que verify-standalone-presentation-export-lot-a : un document sandboxé
    // sans allow-same-origin refuse localStorage. Propre à l'environnement de test, jamais au code.
    const FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== FLAKE) erreurs.push(e.message); });
    page.on('console', (m) => journal.push(m.type() + ': ' + m.text()));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'valeur-d-essai-locale'));
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch (_) {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool'
          && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseDoc(CARTES, PAGES) });
      }
      // Le pipeline émet d'ABORD un appel tool_choice:auto (web_search / études) : le refuser
      // coupait la génération avant même l'appel d'outil. Réponse bénigne, sans aucun outil.
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'auto') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Entendu.' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
          { type: 'message_stop' },
        ]) });
      }
      if (url.includes('/fetch-image')) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/p.jpg', thumb: '', photographer: 'A', alt: 'a' }], total: 1 }) });
      }
      // L'ancien moteur, quand le repli se déclenche, émet son PROPRE appel de génération. On le
      // satisfait pour pouvoir constater ce que l'utilisatrice obtient réellement après le repli —
      // sinon le test ne verrait qu'une absence d'artefact, qui est un artefact du harnais.
      if (body.payload) {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta',
            text: '<!DOCTYPE html><html><body><h1>Document de repli</h1></body></html>' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
          { type: 'message_stop' },
        ]) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocRunGenerationPipeline === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
    });

    // ── 1 — LA GÉNÉRATION RÉELLE : conversion, validation, rendu, sans repli ─────────────────
    await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-img'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 10,
                     audience_type: 'praticien', _formatClarityResolved: true };
      const rag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline('Prépare un exposé sur l\'argent dans le couple.', plan, 'typing-img', 'https://clone-proxy.test.local', rag);
    });
    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
    if (!storeKey) {
      console.error('JOURNAL DE CONSOLE (aucun artefact créé) :');
      journal.filter((l) => /UX-8A|Validation|additional/i.test(l)).forEach((l) => console.error('   ' + l));
      console.error('ERREURS DE PAGE :'); erreurs.forEach((l) => console.error('   ' + l.slice(0, 220)));
    }
    assert.ok(storeKey, 'un artefact doit avoir été créé');
    const art = await page.evaluate((sk) => {
      const a = window._adocArtifacts[sk];
      return { moteur: a._adocGenerationEngine || null, kind: a._adocStructuredDoc && a._adocStructuredDoc.documentKind,
               pages: (a._adocStructuredDoc && a._adocStructuredDoc.deepDives) || null };
    }, storeKey);

    // LE POINT CENTRAL : aucun repli. C'est la seule assertion que le défaut en ligne fait tomber.
    assert.notEqual(art.moteur, 'legacy-html',
      'AUCUN repli sur l\'ancien moteur : une page illustrée doit traverser la validation. '
      + 'Moteur reçu : ' + JSON.stringify(art.moteur) + '. Erreurs de validation dans le journal : '
      + journal.filter((l) => /SchemaValidation|additional propert/i.test(l)).join(' | '));
    assert.equal(art.kind, 'presentation', 'le document structuré doit exister et être une présentation');
    assert.ok(Array.isArray(art.pages) && art.pages.length === 2, 'les deux pages doivent être présentes');
    console.log('PASS ' + (++n) + '/6 — génération réelle : conversion, validation et rendu franchis, aucun repli.');

    // ── 2 — L'ILLUSTRATION A SURVÉCU À LA CONVERSION, et seulement là où elle existait ───────
    const illustree = art.pages.filter((p) => p.id === 'n1')[0];
    const nue = art.pages.filter((p) => p.id === 'n2')[0];
    assert.equal(illustree.imageQuery, 'couple budget table',
      'la requête d\'illustration doit être reportée sur la page qui en porte une');
    assert.equal(illustree.imageAlt, 'Un couple devant des papiers', 'et son texte alternatif avec');
    assert.ok(!('imageQuery' in nue) || !nue.imageQuery,
      'et la page NUE ne doit pas recevoir de champ vide — c\'est ce qui rendait le défaut '
      + 'intermittent, et c\'est le comportement voulu : ' + JSON.stringify(nue));
    console.log('PASS ' + (++n) + '/6 — illustration reportée sur la page illustrée, absente de la page nue.');

    // ── 3 — L'IMAGE S'AFFICHE DANS LA PORTE ─────────────────────────────────────────────────
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.adocPresentOpen());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await page.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('dette invisible'));
    await page.waitForTimeout(500);
    const dansPorte = await page.evaluate(() => {
      const im = document.querySelector('#cc-ws-present-door .cc-ws-present-door-illus');
      if (!im) return { presente: false };
      const r = im.getBoundingClientRect();
      return { presente: true, src: (im.getAttribute('src') || '').slice(0, 24),
               enAttente: im.hasAttribute('data-pexels'), largeur: Math.round(r.width) };
    });
    assert.equal(dansPorte.presente, true,
      'l\'illustration de la page doit être rendue dans la porte (adocDeepDiveImageHTML) : '
      + JSON.stringify(dansPorte));
    assert.equal(dansPorte.enAttente, false,
      'et résolue, jamais laissée en data-pexels : ' + JSON.stringify(dansPorte));
    assert.ok(dansPorte.largeur > 0, 'avec une boîte réelle : ' + JSON.stringify(dansPorte));
    // La page NUE ne doit pas inventer d'illustration.
    await page.evaluate(() => window.adocPresentDeepDiveHome());
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await page.evaluate(() => window.adocPresentOpenDeepDive('n2'));
    await page.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('compte commun'));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => !!document.querySelector('#cc-ws-present-door .cc-ws-present-door-illus')), false,
      'aucune illustration sur la page qui n\'en demande pas');
    console.log('PASS ' + (++n) + '/6 — l\'illustration s\'affiche dans la porte, résolue ; la page nue reste nue.');

    // ── 4 — AUCUNE ERREUR DE VALIDATION DANS LE JOURNAL ─────────────────────────────────────
    const plaintes = journal.filter((l) => /AdocSchemaValidationError|must NOT have additional/i.test(l));
    assert.deepEqual(plaintes, [],
      'le journal ne doit contenir AUCUNE plainte de validation : ' + plaintes.join(' | '));
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/6 — journal propre : aucune plainte de validation de schéma.');

    // ── 5 — UN EXPORT RÉELLEMENT CONSTRUIT EMBARQUE L'ILLUSTRATION ──────────────────────────
    await page.evaluate(() => window.adocPresentClose());
    const html = await page.evaluate((sk) => {
      const d = window._adocArtifacts[sk]._adocStructuredDoc;
      return window.adocBuildStandalonePresentationHTML(d, { embedImages: false });
    }, storeKey);
    assert.ok(html.includes('couple budget table'),
      'la requête d\'illustration de la page doit voyager dans l\'export : sans elle, la page '
      + 'exportée s\'ouvrirait sans son image');
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errExp = [];
    exp.on('pageerror', (e) => { if (e.message !== FLAKE) errExp.push(e.message); });
    await exp.route('**/*', async (route) => {
      const u = route.request().url();
      if (u.startsWith('file:')) return route.continue();
      if (u.includes('/fetch-image')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/p.jpg', thumb: '', photographer: 'A', alt: 'a' }], total: 1 }) });
      return route.abort();
    });
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await exp.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('dette invisible'));
    await exp.waitForTimeout(500);
    assert.equal(await exp.evaluate(() => !!document.querySelector('#cc-ws-present-door .cc-ws-present-door-illus')), true,
      'et l\'illustration doit être rendue dans le fichier exporté, réellement ouvert');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + '/6 — export construit et ouvert : l\'illustration de la page y est rendue.');
    await exp.close();
    await page.close();

    // ── 6 — UN COURS ASSEMBLÉ DE DEUX MODULES, dont l'un a une page illustrée ──────────────
    // adocAssembleCourse propage les mêmes champs : le cours assemblé était donc exposé au même
    // refus de validation. Éprouvé par le validateur RÉEL (window.adocValidateSchema), jamais par
    // lecture du schéma.
    const cours = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errCours = [];
    cours.on('pageerror', (e) => { if (e.message !== FLAKE) errCours.push(e.message); });
    await cours.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await cours.goto(PAGE);
    await cours.waitForFunction(() => typeof window.adocAssembleCourse === 'function' && typeof window.adocValidateSchema === 'function');
    const assemble = await cours.evaluate(([m, plan]) => {
      let r;
      try { r = window.adocAssembleCourse(m, plan, { ids: { documentId: 'c1', versionId: 'c1-v1', createdAt: '2026-01-01T00:00:00Z', requestId: 'rc1' } }); }
      catch (e) { return { erreur: String(e && e.message || e) }; }
      // La clé est 'clinicalDocument', JAMAIS le nom de fichier : adocValidateSchema indexe
      // _adocAjvValidators par clé courte, et un nom inconnu retombe silencieusement sur
      // {valid:true, skipped:true} — une validation IGNORÉE, qui ne prouverait rien.
      const v = window.adocValidateSchema('clinicalDocument', r.doc);
      return { pages: r.doc.deepDives || [], valide: !!v.valid, ignore: !!v.skipped,
               erreurs: (v.errors || []).slice(0, 4).map(String) };
    }, [[forgerModule(1, true), forgerModule(2, false)],
        { courseId: 'c1', titre: 'Cours complet', modules: [
          { id: 'm1', titre: 'Module 1', notionsCles: ['notion 1'], dureeMinutes: 20 },
          { id: 'm2', titre: 'Module 2', notionsCles: ['notion 2'], dureeMinutes: 20 }] }]);
    assert.ok(!assemble.erreur, 'l\'assemblage doit aboutir : ' + assemble.erreur);
    assert.equal(assemble.ignore, false,
      'la validation ne doit pas être IGNORÉE, sinon ce test ne prouverait rien');
    assert.equal(assemble.valide, true,
      'le cours assemblé doit franchir la validation du schéma de document — c\'est le même refus '
      + 'qui frappait les cours. Erreurs : ' + assemble.erreurs.join(' | '));
    const illustreeCours = assemble.pages.filter((p) => p.imageQuery)[0];
    assert.ok(illustreeCours,
      'NON-VACUITÉ : au moins une page du cours assemblé doit porter une illustration, sinon la '
      + 'validation n\'aurait rien eu à admettre. Pages : ' + JSON.stringify(assemble.pages.map((p) => Object.keys(p))));
    assert.equal(illustreeCours.imageQuery, 'couple budget table', 'et la requête doit être conservée');
    assert.deepEqual(errCours, [], 'aucune erreur JS : ' + errCours.join(' | '));
    console.log('PASS ' + (++n) + '/6 — cours assemblé de 2 modules : validation franchie, illustration conservée.');
    await cours.close();

    console.log('\nTOUS LES TESTS DE PAGE ILLUSTRÉE PASSENT (' + n + '/6)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
