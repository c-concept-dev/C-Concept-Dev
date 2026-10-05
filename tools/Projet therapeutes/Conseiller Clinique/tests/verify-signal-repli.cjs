// LE REPLI SE VOIT.
//
// MESURÉ AVANT CE LOT : quand la génération structurée échoue, l'ancien moteur n'échoue PAS — il
// livre un artefact HTML complet, exportable, avec aperçu (legacy-html, fmt html, vérifié sur les
// intentions chat/cours/document). L'utilisatrice reçoit donc un document PLAUSIBLE sans pouvoir
// savoir qu'elle a perdu le format demandé. Seuls une légende transitoire, un avertissement de
// console et un traceur de diagnostic en gardaient trace : rien de durable à l'écran.
//
// Ce test éprouve les deux faces : le message paraît quand il y a repli, et il ne paraît PAS quand
// la génération structurée aboutit — un avertissement qui crierait au loup sur un succès serait
// pire que son absence.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const sse = (e) => e.map((x) => 'data: ' + JSON.stringify(x)).join('\n\n') + '\n\n';
const bloc = (o) => Object.assign({ type: 'paragraph', text: 'Un texte.', level: 2, visualRole: 'info',
  items: [], ordered: false, imageQuery: '', imageAlt: '', questionnaireQuestions: [],
  questionnaireProfiles: [], questionnaireTwoPartners: false, deepDiveLinks: [], citationEntryIds: [] }, o);
const CARTES = [{ title: 'Une carte', coverImageQuery: 'couple', coverImageAlt: 'Deux mains',
  coverDeepDiveLinks: [], blocks: [bloc({})] }];

// Entrée SAINE : la génération structurée doit aboutir, donc aucun message de repli.
const SAIN = { title: 'Document sain', purpose: 'formation', audience: 'praticien', cards: CARTES, deepDives: [] };
// CE QUI DÉCLENCHE LE REPLI ICI, et pourquoi pas autre chose — constaté en écrivant ce test :
// un champ INCONNU posé sur une page ne déclenche RIEN. adocConvertDeepDives reconstruit chaque
// entrée à partir des seuls champs connus, le champ surnuméraire est donc filtré avant d'atteindre
// la validation. C'est rassurant (la conversion est un tamis) mais cela ôte le déclencheur le plus
// évident. Une page sans titre ou sans paragraphe est, elle aussi, rejetée proprement par
// convertDeepDive sans erreur. Le déclencheur retenu est donc une réponse d'outil au JSON TRONQUÉ :
// la tentative structurée échoue à l'analyse, et emprunte exactement le même chemin de repli que
// le refus de validation observé en production — c'est ce chemin, et le signal qu'il doit produire,
// que ce test éprouve, jamais la nature de la panne.
const CASSE_JSON = '{"title":"Document cassé","purpose":"formation","audience":"praticien","cards":[{"title":"Une cart';

const sseOutil = (entree) => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta',
    partial_json: typeof entree === 'string' ? entree : JSON.stringify(entree) } },
  { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' }]);
const sseTexte = (t) => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }]);

async function generer(browser, entree, planSurcharge) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
  const erreurs = [];
  page.on('pageerror', (e) => { if (e.message !== FLAKE) erreurs.push(e.message); });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'valeur-d-essai-locale'));
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith('file:')) return route.continue();
    let body = {}; try { body = route.request().postDataJSON() || {}; } catch (_) {}
    const tc = body.payload && body.payload.tool_choice;
    if (tc && tc.type === 'tool' && tc.name === 'emit_presentation_document') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseOutil(entree) });
    }
    if (u.includes('/fetch-image')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ photos: [{ url: 'https://x.test/p.jpg', thumb: '', photographer: 'A', alt: 'a' }], total: 1 }) });
    if (body.payload) return route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: sseTexte('<!DOCTYPE html><html><body><h1>Document standard</h1><p>Texte.</p></body></html>') });
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.adocRunGenerationPipeline === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
  });
  await page.evaluate(async (surcharge) => {
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div'); el.id = 'tp'; el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    const plan = surcharge || { needs_rag: true, documentKind: 'presentation', intent: 'chat',
                                duree_minutes: 10, audience_type: 'praticien', _formatClarityResolved: true };
    const rag = { chunks: [{ content: 'P.', book_title: 'L', author: 'A', page_number: 1, _score: 0.9 }] };
    try { await window.adocRunGenerationPipeline('Un exposé.', plan, 'tp', 'https://clone-proxy.test.local', rag); } catch (_) {}
  }, planSurcharge || null);
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const cles = Object.keys(window._adocArtifacts || {});
    const art = cles.length ? window._adocArtifacts[cles[0]] : null;
    return { moteur: art && (art._adocGenerationEngine || '(structuré)'),
             messages: [...document.querySelectorAll('#adoc-messages .adoc-msg.assistant')].map((d) => (d.textContent || '').trim()) };
  });
  await page.close();
  return { ...r, erreurs };
}

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    // ── 1 — LA FONCTION PURE ────────────────────────────────────────────────────────────────
    const page = await browser.newPage();
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocReplyFallbackNotice === 'function');
    const msg = (plan) => page.evaluate((p) => window.adocReplyFallbackNotice(p), plan);
    assert.equal(await msg(null), null, 'aucun plan : aucun message');
    assert.equal(await msg({}), null, 'plan sans type : aucun message, jamais un type inventé');
    assert.equal(await msg({ documentKind: 'inconnu' }), null,
      'un type hors du vocabulaire connu ne doit pas produire de message bancal');
    const pres = await msg({ documentKind: 'presentation' });
    assert.match(pres, /Le format présentation n'a pas abouti/, 'le format est nommé : ' + pres);
    assert.match(pres, /moteur standard/, 'et ce qui l\'a produit à la place');
    assert.match(pres, /diapositives, de pages d'approfondissement ni de mode plein écran/,
      'la présentation perd son mode de lecture, et le message le dit : ' + pres);
    assert.doesNotMatch(pres, /relanc|réessay/i,
      'aucun conseil de relance : un refus de validation est déterministe, une relance ne le '
      + 'corrigerait pas — le promettre serait faux');
    const fiche = await msg({ documentKind: 'fiche' });
    assert.match(fiche, /Le format fiche synthèse n'a pas abouti/, 'le vocabulaire existant est réutilisé : ' + fiche);
    assert.doesNotMatch(fiche, /diapositives/, 'et la clause propre à la présentation ne déborde pas : ' + fiche);
    const parIntent = await msg({ intent: 'carrousel' });
    assert.match(parIntent, /carrousel/, 'à défaut de documentKind, l\'intention est lue : ' + parIntent);
    console.log('PASS ' + (++n) + '/4 — fonction pure : format nommé, pertes dites, aucun conseil promis, aucun type inventé.');
    await page.close();

    // ── 2 — LE MESSAGE PARAÎT QUAND IL Y A REPLI ────────────────────────────────────────────
    const casse = await generer(browser, CASSE_JSON);
    assert.equal(casse.moteur, 'legacy-html',
      'préalable : le repli doit bien s\'être produit, sinon ce test ne prouve rien. Moteur : '
      + JSON.stringify(casse.moteur));
    const signaux = casse.messages.filter((t) => /n'a pas abouti/.test(t));
    assert.equal(signaux.length, 1, 'un seul signal, jamais deux : ' + JSON.stringify(signaux));
    assert.match(signaux[0], /Le format présentation n'a pas abouti/, 'et il nomme le format : ' + signaux[0]);
    assert.ok(casse.messages.some((t) => /Document standard|Document ·/.test(t)),
      'le document de l\'ancien moteur est bien livré EN PLUS du signal — le signal ne le remplace pas');
    assert.deepEqual(casse.erreurs, [], 'aucune erreur JS : ' + casse.erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/4 — repli réel : le signal paraît une fois, et le document est livré quand même.');

    // ── 3 — ET PAS QUAND LA GÉNÉRATION ABOUTIT ──────────────────────────────────────────────
    const sain = await generer(browser, SAIN);
    assert.notEqual(sain.moteur, 'legacy-html',
      'préalable : la génération structurée doit aboutir ici. Moteur : ' + JSON.stringify(sain.moteur));
    assert.deepEqual(sain.messages.filter((t) => /n'a pas abouti/.test(t)), [],
      'AUCUN signal sur un succès : un avertissement qui crie au loup serait pire que son absence');
    assert.deepEqual(sain.erreurs, [], 'aucune erreur JS : ' + sain.erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/4 — succès structuré : aucun signal, aucun faux positif.');

    // ── 4 — POURQUOI LE GARDE NE PEUT PAS ÊTRE ÉPROUVÉ, et ce qui le surveille ────────────
    // J'ai d'abord écrit ici un cas « génération directe vers l'ancien moteur », pensant y tenir le
    // garde fellBackFromStructured. Deux mesures l'ont démenti :
    //   — sur un SUCCÈS structuré, adocFinalizeGeneration n'est jamais appelée (la livraison passe
    //     par adocDeliverStructuredFicheArtifact) : le cas 3 passerait donc même sans garde ;
    //   — une intention « carrousel » tente elle AUSSI le moteur structuré, et mon harnais la fait
    //     échouer : le signal qui paraissait alors était JUSTE, c'était ma prémisse qui était fausse.
    // Et la cause profonde est dans le registre : les SIX types qui portent un libellé
    // (ADOC_GENERATION_KIND_LABELS) sont TOUS câblés au structuré. Or le message n'est produit que
    // pour un type portant un libellé. Aucun chemin ne peut donc produire ce message sans avoir
    // d'abord tenté le structuré : le garde est correct et défensif, mais inéprouvable de l'extérieur.
    //
    // Plutôt qu'un test creux, on assertionne l'invariant QUI REND LE GARDE INÉPROUVABLE. Le jour où
    // un type portant un libellé cessera d'être câblé, cette assertion tombera — et il faudra alors
    // écrire le cas de génération directe, qui sera enfin atteignable.
    const registres = await (async () => {
      const p2 = await browser.newPage();
      await p2.goto(PAGE);
      await p2.waitForFunction(() => typeof window.adocStructuredGenerationWiredByDocumentKind === 'object');
      const r = await p2.evaluate(() => ({
        cables: Object.keys(window.adocStructuredGenerationWiredByDocumentKind)
          .filter((k) => window.adocStructuredGenerationWiredByDocumentKind[k] === true),
        // Les libellés ne sont pas exposés : on les déduit en interrogeant la fonction elle-même,
        // qui ne répond que pour un type connu — jamais une liste recopiée ici.
        libelles: ['fiche', 'carrousel', 'tableau', 'script', 'liens', 'presentation', 'document',
                   'comparatif', 'chat', 'supervision']
          .filter((k) => window.adocReplyFallbackNotice({ documentKind: k }) !== null),
      }));
      await p2.close();
      return r;
    })();
    const sansGarde = registres.libelles.filter((k) => !registres.cables.includes(k));
    assert.deepEqual(sansGarde, [],
      'INVARIANT : tout type pouvant produire ce message doit être câblé au moteur structuré, sinon '
      + 'une génération DIRECTE l\'afficherait à tort et il faudrait éprouver le garde '
      + 'fellBackFromStructured par un cas dédié. Types à libellé non câblés : ' + JSON.stringify(sansGarde)
      + ' | libellés : ' + JSON.stringify(registres.libelles)
      + ' | câblés : ' + JSON.stringify(registres.cables));
    console.log('PASS ' + (++n) + '/4 — invariant du garde : les ' + registres.libelles.length
      + ' types à libellé sont tous câblés au structuré, donc aucun faux signal possible.');

    console.log('\nTOUS LES TESTS DE SIGNAL DE REPLI PASSENT (' + n + '/4)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
