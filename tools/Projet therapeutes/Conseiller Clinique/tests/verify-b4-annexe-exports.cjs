// LOT B4 — les pages d'approfondissement survivent aux exports NON INTERACTIFS.
//
// Un export HTML statique ou un PDF n'a pas de porte plein écran : les pages d'approfondissement y
// disparaissaient purement et simplement — écrites, payées, exportées, puis perdues. Elles sont
// désormais reportées en annexe.
//
// Le HTML du PDF n'est pas reconstruit ici : il est CAPTURÉ sur la requête réellement émise vers
// le générateur, par interception réseau. C'est bien l'octet qui part qui est éprouvé.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b4-annexe-exports.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const carte = (id, titre, blocs) => ({ id, type: 'card', content: { title: titre, imageRef: null, imageAlt: '', blocks: blocs }, citationIds: [], validation: {} });
const para = (id, texte, liens) => ({ id, type: 'paragraph', content: { text: texte }, citationIds: [], validation: {}, ...(liens ? { deepDiveLinks: liens } : {}) });
const BASE = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B4 annexe', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
};
// « n2 » est visé par n1 ET par n3 : si l'annexe recopiait le contenu des pages visées, son texte
// apparaîtrait DEUX fois. C'est précisément ce que ce test interdit.
const LONG = Array.from({ length: 150 }, (_, i) => 'Phrase numero ' + (i + 1) + ' de la page longue, destinee a depasser largement une feuille imprimee.').join(' ');
const DOC = { ...BASE,
  blocks: [carte('card-01', 'Diapositive', [para('paragraph-01', 'Le stress chronique agit.', [lien('stress chronique', 'n1')])])],
  deepDives: [
    { id: 'n1', title: 'Le cortisol', paragraphs: [{ text: 'Premier paragraphe du cortisol.', deepDiveLinks: [lien('cortisol', 'n2')] }, 'Second paragraphe du cortisol.'] },
    { id: 'n2', title: 'La boucle & le <retour>', paragraphs: ['CONTENU-UNIQUE-DE-N2 a ne jamais voir deux fois.'] },
    { id: 'n3', title: 'Axe HPA', paragraphs: [{ text: 'Renvoie lui aussi vers la boucle.', deepDiveLinks: [lien('la boucle', 'n2')] }] },
    { id: 'n4', title: 'Page tres longue', paragraphs: [LONG] },
  ],
};
const DOC_SANS = { ...BASE, documentKind: 'presentation', blocks: [carte('card-01', 'Rien', [para('paragraph-01', 'Aucun approfondissement.')])] };

const compter = (foin, aiguille) => foin.split(aiguille).length - 1;

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('workerApiKey', 'valeur-factice-de-test'); } catch (_) {} });

    // Le HTML du PDF est CAPTURÉ sur la requête réellement émise. Rien ne sort : la requête est
    // interceptée et une réponse factice est rendue.
    let htmlPdf = null;
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:')) return route.continue();
      const corps = route.request().postData() || '';
      if (/adoc-pdf-page/.test(corps)) {
        try { htmlPdf = JSON.parse(corps).html || corps; } catch (_) { htmlPdf = corps; }
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 factice' });
      }
      // Toute AUTRE requête sortante est simplement coupée. Lui rendre le faux PDF servait un
      // « %PDF » à des scripts externes, qui levaient « Unexpected token '%' » — des erreurs
      // fabriquées par le test lui-même, qui auraient masqué une vraie erreur de la page.
      return route.abort();
    });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.evaluate(() => document.getElementById('cc-login-screen')?.remove());
    await page.waitForFunction(() => typeof window.adocRenderClinicalDocument === 'function');

    // ── 1. ENVELOPPE HTML CLINIQUE — l'annexe est là, une fois par page ─────────────────────────
    const htmlClinique = await page.evaluate(async d => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] });
      return (await window.adocExportClinicalDocumentHTML(d, { sourceSnapshotId: 's', entries: [] })).html || r.html;
    }, DOC);
    assert.ok(/adoc-dd-annexe/.test(htmlClinique), "l'annexe doit exister dans l'export HTML clinique");
    assert.equal(compter(htmlClinique, 'class="adoc-dd-page"'), 4, 'exactement une entrée par page d\'approfondissement');
    console.log('PASS 1/8  export HTML : annexe présente, exactement 4 entrées pour 4 pages.');

    // ── 2. AUCUNE EXPANSION RÉCURSIVE ──────────────────────────────────────────────────────────
    assert.equal(compter(htmlClinique, 'CONTENU-UNIQUE-DE-N2'), 1,
      'le contenu d\'une page visée par DEUX autres ne doit apparaître qu\'une fois : jamais d\'expansion récursive');
    assert.equal(compter(htmlClinique, 'Premier paragraphe du cortisol'), 1, 'chaque texte exactement une fois');
    console.log('PASS 2/8  aucune expansion récursive : la page visée deux fois n\'apparaît qu\'une seule fois.');

    // ── 3. « VOIR AUSSI » NOMME LES CIBLES, sans recopier leur contenu ──────────────────────────
    assert.ok(/Voir aussi :/.test(htmlClinique), 'la ligne « Voir aussi » doit exister');
    assert.equal(compter(htmlClinique, 'class="adoc-dd-voir"'), 2,
      'seules les deux pages qui renvoient réellement ailleurs portent une ligne « Voir aussi »');
    console.log('PASS 3/8  « Voir aussi » nomme les cibles, et seulement sur les pages qui en ont.');

    // ── 4. ÉCHAPPEMENT ─────────────────────────────────────────────────────────────────────────
    assert.ok(!/<retour>/.test(htmlClinique), 'les chevrons d\'un titre doivent être échappés, jamais injectés tels quels');
    assert.ok(/&lt;retour&gt;/.test(htmlClinique), 'échappement attendu des chevrons');
    assert.ok(/La boucle &amp; le/.test(htmlClinique), 'échappement attendu de l\'esperluette');
    console.log('PASS 4/8  échappement HTML du titre (chevrons et esperluette).');

    // ── 5. DOCUMENT SANS PAGE — rien n'est ajouté, pas même du CSS ──────────────────────────────
    const htmlSans = await page.evaluate(async d =>
      (await window.adocExportClinicalDocumentHTML(d, { sourceSnapshotId: 's', entries: [] })).html, DOC_SANS);
    assert.ok(!/adoc-dd/.test(htmlSans),
      'un document sans page d\'approfondissement ne doit recevoir NI balisage NI règle CSS d\'annexe');
    console.log('PASS 5/8  document sans page : aucune trace d\'annexe, pas même une règle CSS.');

    // ── 6. LE HTML RÉELLEMENT ENVOYÉ AU GÉNÉRATEUR PDF ─────────────────────────────────────────
    await page.evaluate(async d => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.test = { _adocStructuredDoc: d, _adocStructuredSnapshot: { sourceSnapshotId: 's', entries: [] }, name: 'test', _adocGenerationEngine: 'structured' };
      window._adocWsState = window._adocWsState || {};
      window._adocWsState.storeKey = 'test';
    }, DOC);
    await page.evaluate(() => window.adocWsExportCarrouselPDF());
    await page.waitForFunction(() => true);
    for (let i = 0; i < 40 && !htmlPdf; i++) await page.waitForTimeout(250);
    assert.ok(htmlPdf, 'le HTML envoyé au générateur PDF doit avoir été capturé sur la requête réelle');
    assert.ok(/adoc-dd-annexe/.test(htmlPdf), 'l\'annexe doit figurer dans le HTML RÉELLEMENT envoyé au générateur');
    assert.equal(compter(htmlPdf, 'class="adoc-dd-page"'), 4, 'une entrée par page, dans le HTML envoyé');
    assert.equal(compter(htmlPdf, 'CONTENU-UNIQUE-DE-N2'), 1, 'aucune expansion récursive dans le HTML envoyé');
    console.log('PASS 6/8  HTML CAPTURÉ sur la requête réelle : annexe complète, une entrée par page.');

    // ── 7. PAGINATION — l'annexe ne peut pas vivre dans un gabarit qui masque le débordement ────
    const fichier = path.join(os.tmpdir(), 'cc-b4-pdf-source.html');
    fs.writeFileSync(fichier, htmlPdf, 'utf8');
    const rendu = await browser.newPage();
    await rendu.goto('file://' + fichier);
    const mise = await rendu.evaluate(() => {
      const a = document.querySelector('.adoc-dd-annexe');
      if (!a) return null;
      const dansGabarit = !!a.closest('.adoc-pdf-page');
      let clippe = false, e = a.parentElement;
      while (e && e !== document.body) {
        const cs = getComputedStyle(e);
        if (cs.overflow === 'hidden' && e.clientHeight && e.scrollHeight > e.clientHeight + 1) clippe = true;
        e = e.parentElement;
      }
      return { dansGabarit, clippe, hauteur: Math.round(a.getBoundingClientRect().height),
               derniere: /Phrase numero 150 /.test(a.textContent) };
    });
    assert.ok(mise, 'l\'annexe doit être présente dans le document rendu');
    assert.equal(mise.dansGabarit, false,
      'l\'annexe ne doit JAMAIS être dans un .adoc-pdf-page : ce gabarit fait 768 px avec overflow:hidden, tout dépassement serait perdu');
    assert.equal(mise.clippe, false, 'aucun ancêtre ne doit rogner l\'annexe');
    assert.ok(mise.hauteur > 768, 'la page longue doit effectivement dépasser une feuille (' + mise.hauteur + ' px) — sinon ce test ne prouve rien');
    assert.equal(mise.derniere, true, 'la DERNIÈRE phrase de la page longue doit être présente, jamais tronquée');
    console.log('PASS 7/8  annexe hors du gabarit à hauteur fixe, non rognée, ' + mise.hauteur + ' px — dernière phrase présente.');

    // ── 8. LE PDF EST RÉELLEMENT PRODUIT, et plus gros qu'un document sans annexe ───────────────
    const pdfAvec = await rendu.pdf({ preferCSSPageSize: true });
    const sansAnnexe = htmlPdf.replace(/<section class="adoc-dd-annexe"[\s\S]*?<\/section>\s*<\/body>/, '</body>');
    const f2 = path.join(os.tmpdir(), 'cc-b4-pdf-sans.html');
    fs.writeFileSync(f2, sansAnnexe, 'utf8');
    const rendu2 = await browser.newPage();
    await rendu2.goto('file://' + f2);
    const pdfSans = await rendu2.pdf({ preferCSSPageSize: true });
    assert.ok(pdfAvec.length > pdfSans.length,
      'le PDF avec annexe doit être plus lourd que sans (' + pdfAvec.length + ' contre ' + pdfSans.length + ')');
    console.log('PASS 8/8  PDF réellement produit : ' + Math.round(pdfAvec.length / 1024) + ' Ko avec annexe, ' + Math.round(pdfSans.length / 1024) + ' Ko sans.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\nPASS verify-b4-annexe-exports — 8/8.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
