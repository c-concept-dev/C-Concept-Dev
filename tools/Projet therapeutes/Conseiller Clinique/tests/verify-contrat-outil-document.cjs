// CONTRAT ENTRE LE SCHÉMA D'OUTIL ET LE SCHÉMA DE DOCUMENT.
//
// Le défaut qu'il doit rendre impossible : le schéma d'outil exigeait imageQuery/imageAlt sur chaque
// page d'approfondissement, adocConvertDeepDives les reportait, et deepDives.items du schéma de
// document les refusait (additionalProperties:false). En production : AdocSchemaValidationError puis
// repli sur l'ancien moteur, dès que le modèle illustrait une page. Aucun test ne le voyait : tous
// appelaient la conversion ou forgeaient des documents, sans traverser la validation.
//
// POURQUOI PAS UNE COMPARAISON DE NOMS, que le brief demandait d'abord : elle produit des FAUX
// POSITIFS, et il en existe trois aujourd'hui. Mesuré —
//   deepDives : outil \ document = imageQuery, imageAlt, deepDiveLinks
//   cards     : outil \ cardContent = coverImageQuery, coverImageAlt
// Or deepDiveLinks d'une page est CONSOMMÉ par repartirLiensDePage (réparti sur les paragraphes), et
// coverImageQuery/coverImageAlt sont RENOMMÉS en imageRef/imageAlt par adocResolveCardCoverFields.
// Ces trois absences sont correctes. Asserter sur les noms obligerait donc à tenir une liste
// d'exceptions à la main — exactement ce que ce test doit éviter.
//
// LE CRITÈRE RETENU, mécanique et sans liste : on engendre DEPUIS LE SCHÉMA D'OUTIL une entrée
// maximale (tous les champs de tous les objets, un bloc par valeur de type.enum), on la fait
// traverser le pipeline RÉEL, et on exige qu'elle franchisse la validation. Un champ qui survit
// dans le document produit est donc forcément admis par le schéma ; un champ qui n'y survit pas a
// été consommé ou renommé — et le test le RAPPORTE, déduit du document réel.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const sse = (events) => events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';

// Extraction reprise de verify-schema-outil-fige : le schéma d'outil n'est pas exposé au runtime.
function extraire(source, nom) {
  const debut = source.indexOf('  const ' + nom + ' = {');
  if (debut === -1) throw new Error('schéma introuvable : ' + nom);
  const ouvrante = source.indexOf('{', debut);
  let profondeur = 0, i = ouvrante, dansChaine = null;
  for (; i < source.length; i++) {
    const c = source[i], suivant = source[i + 1];
    if (dansChaine) { if (c === '\\') i++; else if (c === dansChaine) dansChaine = null; continue; }
    if (c === '/' && suivant === '/') { i = source.indexOf('\n', i); if (i === -1) break; continue; }
    if (c === '/' && suivant === '*') { i = source.indexOf('*/', i + 2) + 1; if (i === 0) break; continue; }
    if (c === '"' || c === "'" || c === '`') { dansChaine = c; continue; }
    if (c === '{') profondeur++; else if (c === '}') { profondeur--; if (!profondeur) break; }
  }
  if (profondeur !== 0) throw new Error('accolades non refermées');
  // eslint-disable-next-line no-eval
  return eval('(' + source.slice(ouvrante, i + 1) + ')');
}

// Générateur piloté par le SCHÉMA : type, enum, items. Le contenu est choisi EXPLOITABLE (deux
// questions, deux options, profils couvrant la plage) parce qu'un bloc inexploitable est rejeté
// par convertBlock et n'éprouverait alors aucun champ — ce n'est pas une liste de champs recopiée,
// c'est du contenu valide.
function valeurPour(def, cle, type) {
  if (!def) return null;
  if (Array.isArray(def.enum)) {
    if (cle === 'type') return type;
    return def.enum[0];
  }
  switch (def.type) {
    case 'string': return cle === 'id' ? 'p1' : 'Texte engendré pour ' + cle + '.';
    case 'integer': case 'number': return 1;
    case 'boolean': return true;
    case 'array': {
      if (cle === 'items') return ['Premier point', 'Second point'];
      if (cle === 'citationEntryIds') return [];
      if (cle === 'paragraphs') return ['Un paragraphe de page engendré pour le contrat.'];
      if (cle === 'deepDiveLinks') return [{ text: 'Texte engendré', targetId: 'p1' }];
      if (cle === 'coverDeepDiveLinks') return ['Texte engendré → p1'];
      if (cle === 'questionnaireQuestions') return [
        { text: 'Première question ?', options: [{ text: 'Plutôt oui', points: 2 }, { text: 'Plutôt non', points: 0 }] },
        { text: 'Seconde question ?', options: [{ text: 'Plutôt oui', points: 2 }, { text: 'Plutôt non', points: 0 }] }];
      if (cle === 'questionnaireProfiles') return [
        { label: 'Premier profil', minScore: 0, maxScore: 2, interpretation: 'Une interprétation engendrée.' },
        { label: 'Second profil', minScore: 3, maxScore: 4, interpretation: 'Une autre interprétation engendrée.' }];
      return [];
    }
    default: return 'Texte engendré.';
  }
}
function objetMaximal(schemaObjet, type) {
  const out = {};
  Object.keys(schemaObjet.properties || {}).forEach((cle) => {
    if (cle === 'blocks') return;  // rempli par l'appelant
    out[cle] = valeurPour(schemaObjet.properties[cle], cle, type);
  });
  return out;
}

const source = fs.readFileSync(path.join(__dirname, '..', 'studio-clinique-core.js'), 'utf8');
const outil = extraire(source, 'ADOC_STRUCTURED_PRESENTATION_TOOL');
const ti = outil.input_schema;
const schemaCarte = ti.properties.cards.items;
const schemaBloc = schemaCarte.properties.blocks.items;
const schemaPage = ti.properties.deepDives.items;
const TYPES = schemaBloc.properties.type.enum;

// UNE CARTE PAR TYPE DE BLOC : un bloc ne porte qu'un sous-ensemble utile de champs selon son type,
// et les exercer tous demande donc de parcourir type.enum — ce que le schéma fournit.
const CARTES = TYPES.map((type) => {
  const carte = objetMaximal(schemaCarte, type);
  carte.title = 'Carte ' + type;
  const bloc = objetMaximal(schemaBloc, type);
  bloc.text = type === 'heading' ? 'Un intertitre engendré' : 'Un texte engendré pour le contrat.';
  if (type === 'image') { bloc.imageQuery = 'calm therapy room'; bloc.imageAlt = 'Une scène engendrée'; }
  carte.blocks = [bloc];
  return carte;
});
const PAGES = [objetMaximal(schemaPage, 'paragraph')];
PAGES[0].id = 'p1'; PAGES[0].title = 'Page engendrée';
PAGES[0].imageQuery = 'therapist office'; PAGES[0].imageAlt = 'Un cabinet engendré';
PAGES[0].deepDiveLinks = [];

const ENTREE = objetMaximal(ti, 'paragraph');
ENTREE.title = 'Contrat outil / document'; ENTREE.cards = CARTES; ENTREE.deepDives = PAGES;

const sseDoc = () => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_c', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(ENTREE) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
]);
const sseTexte = (t) => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  { type: 'message_stop' },
]);

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    const erreurs = [], journal = [];
    page.on('pageerror', (e) => { if (e.message !== FLAKE) erreurs.push(e.message); });
    page.on('console', (m) => journal.push(m.text()));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'valeur-d-essai-locale'));
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      if (u.startsWith('file:')) return route.continue();
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch (_) {}
      const tc = body.payload && body.payload.tool_choice;
      if (tc && tc.type === 'tool' && tc.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseDoc() });
      }
      if (u.includes('/fetch-image')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/p.jpg', thumb: '', photographer: 'A', alt: 'a' }], total: 1 }) });
      if (body.payload) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseTexte('Entendu.') });
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocRunGenerationPipeline === 'function');
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
    });

    // ── 1 — L'ENTRÉE MAXIMALE TRAVERSE LA VALIDATION ─────────────────────────────────────────
    console.log('  entrée engendrée : ' + CARTES.length + ' cartes (une par type de bloc : '
      + TYPES.join(', ') + '), ' + PAGES.length + ' page, tous champs peuplés.');
    await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-c'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const plan = { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 10,
                     audience_type: 'praticien', _formatClarityResolved: true };
      const rag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline('Un exposé de contrat.', plan, 'typing-c', 'https://clone-proxy.test.local', rag);
    });
    const storeKey = await page.evaluate(() => Object.keys(window._adocArtifacts || {})[0]);
    const plaintes = journal.filter((l) => /AdocSchemaValidationError|must NOT have additional|repli automatique/i.test(l));
    assert.ok(storeKey,
      'un artefact doit être créé. Plaintes du journal : ' + plaintes.join(' | '));
    const art = await page.evaluate((sk) => ({
      moteur: window._adocArtifacts[sk]._adocGenerationEngine || null,
      doc: window._adocArtifacts[sk]._adocStructuredDoc || null,
    }), storeKey);
    assert.notEqual(art.moteur, 'legacy-html',
      'AUCUN repli : tout ce que le schéma d\'outil permet d\'émettre doit franchir la validation du '
      + 'schéma de document. Plaintes : ' + plaintes.join(' | '));
    assert.deepEqual(plaintes, [],
      'et aucune plainte de validation dans le journal : ' + plaintes.join(' | '));
    assert.ok(art.doc && art.doc.documentKind === 'presentation', 'le document structuré doit exister');
    console.log('PASS ' + (++n) + '/3 — l\'entrée maximale franchit conversion, validation et rendu, sans repli.');

    // ── 2 — CE QUE CHAQUE CHAMP D'OUTIL DEVIENT, déduit du document RÉEL ────────────────────
    // Critère mécanique : un champ qui SURVIT dans le document est forcément admis par le schéma
    // (la validation vient de passer). Un champ qui n'y survit pas a été consommé ou renommé.
    // La survie est jugée SUR L'OBJET LUI-MÊME, jamais par une recherche dans tout le document :
    // « deepDiveLinks » apparaît ailleurs (sur les blocs, et sur les paragraphes de page après
    // répartition), et une recherche globale le ferait croire reporté sur l'objet page. Première
    // version de ce test, corrigée après l'avoir constaté.
    const cartes = art.doc.blocks || [];
    const blocsProduits = cartes.flatMap((c) => (c.content && c.content.blocks) || []);
    const clefsDe = (objets) => {
      const vues = new Set();
      objets.forEach((o) => {
        if (!o) return;
        Object.keys(o).forEach((k) => vues.add(k));
        if (o.content && typeof o.content === 'object') Object.keys(o.content).forEach((k) => vues.add(k));
      });
      return vues;
    };
    const groupes = [
      ['racine', Object.keys(ti.properties), clefsDe([art.doc])],
      ['cards.items', Object.keys(schemaCarte.properties), clefsDe(cartes)],
      ['blocks.items', Object.keys(schemaBloc.properties), clefsDe(blocsProduits)],
      ['deepDives.items', Object.keys(schemaPage.properties), clefsDe(art.doc.deepDives || [])],
    ];
    console.log('  devenir de chaque champ du schéma d\'outil, lu dans le document produit :');
    const consommes = [];
    groupes.forEach(([nom, cles, presentes]) => {
      const porte = cles.filter((c) => presentes.has(c)), absents = cles.filter((c) => !presentes.has(c));
      console.log('    ' + nom.padEnd(16) + 'reportés : ' + (porte.join(', ') || '(aucun)'));
      if (absents.length) console.log('    ' + ''.padEnd(16) + 'consommés/renommés : ' + absents.join(', '));
      absents.forEach((c) => consommes.push(nom + '.' + c));
    });
    // Les deux champs du défaut doivent, eux, être REPORTÉS — sinon ce test ne prouve rien.
    const pageProduite = (art.doc.deepDives || [])[0] || {};
    assert.ok(Object.prototype.hasOwnProperty.call(pageProduite, 'imageQuery')
           && Object.prototype.hasOwnProperty.call(pageProduite, 'imageAlt'),
      'NON-VACUITÉ : la page produite doit RÉELLEMENT porter imageQuery et imageAlt, sinon la '
      + 'validation n\'aurait rien eu à admettre et ce test serait creux. Clés reçues : '
      + JSON.stringify(Object.keys(pageProduite)));
    console.log('PASS ' + (++n) + '/3 — imageQuery et imageAlt sont bien reportés, donc réellement admis.');

    // ── 3 — LE SCHÉMA DE DOCUMENT RESTE FERMÉ ───────────────────────────────────────────────
    // Admettre deux champs de plus ne doit pas avoir ouvert la porte : un champ inconnu reste
    // refusé. On l'éprouve par la validation réelle, jamais par lecture du schéma.
    const refus = await page.evaluate(async (sk) => {
      const d = JSON.parse(JSON.stringify(window._adocArtifacts[sk]._adocStructuredDoc));
      d.deepDives[0].champInvente = 'valeur';
      try { await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] }); return null; }
      catch (e) { return String(e && e.message || e); }
    }, storeKey);
    assert.ok(refus && /additional propert/i.test(refus),
      'un champ INCONNU sur une page doit toujours être refusé — additionalProperties:false est '
      + 'conservé. Reçu : ' + JSON.stringify(refus));
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/3 — le schéma reste fermé : un champ inconnu est toujours rejeté.');
    await page.close();

    console.log('\nTOUS LES TESTS DE CONTRAT PASSENT (' + n + '/3)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
