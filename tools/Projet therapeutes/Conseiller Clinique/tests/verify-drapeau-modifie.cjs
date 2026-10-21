// Q7 — LE DRAPEAU « MODIFIÉ » : CHAQUE GESTE QUI ÉCRIT DOIT LE LEVER.
//
// S'il ne se lève pas, l'état continue d'afficher « Enregistré à … » sur un document qui a
// changé, et l'avertissement de fermeture ne prévient pas : le travail se perd en silence.
// C'est donc le drapeau, et non le confort, qui est en jeu.
//
// Chaque geste est joué, puis `_ccEditorDirty` est relu. Rien n'est supposé.
//
//   NODE_PATH=<playwright> node tests/verify-drapeau-modifie.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

const PAGE_SIMULEE = { title: 'Page pour l’essai du drapeau',
  blocks: [{ type: 'paragraph', text: 'Un paragraphe entier et correct.' }] };

// Une FICHE : seule forme de document où le titre du document est une feuille modifiable
// (.adoc-sc-cover-title n'est rendu que par fiche/script/tableau/liens, jamais par une
// présentation) et où un `table` est admis au premier niveau (block.schema.json,
// $defs/editorialBlock). Trois gestes de la liste de Christophe — titre du document, cellule
// d'un tableau, ligne d'un tableau — ne sont jouables que là.
const FICHE = {
  schemaVersion: 1,
  documentId: 'fiche-drapeau', versionId: 'fiche-drapeau-v1', previousVersionId: null,
  requestId: 'fiche-drapeau-r', sourceSnapshotId: 'fiche-drapeau-s',
  createdAt: '2026-10-20T09:00:00Z', language: 'fr', status: 'draft',
  title: 'Une fiche pour l’audit du drapeau', purpose: 'Audit du drapeau',
  audience: 'clinicien', documentKind: 'fiche',
  renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [
    { id: 'f-par-01', type: 'paragraph', content: { text: 'Un paragraphe de la fiche.' },
      citationIds: [], validation: {} },
    { id: 'f-liste-01', type: 'list',
      content: { items: ['Premier point', 'Deuxième point'], ordered: false },
      citationIds: [], validation: {} },
    { id: 'f-img-01', type: 'image',
      content: { query: 'ciel calme', alt: 'Un ciel calme, synthétique' },
      citationIds: [], validation: {} },
    { id: 'f-tab-01', type: 'table',
      content: { headers: ['Temps', 'Geste'], rows: [['Un', 'Nommer'], ['Deux', 'Attendre']] },
      citationIds: [], validation: {} },
  ],
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
  narration: [],
};

// Un CARROUSEL : le positionnement d'une carte (panneau « Position et taille ») est RÉSERVÉ au
// carrousel — docCard.onmousedown refuse tout autre documentKind (garde-fou explicite du cœur).
// Même structure de cartes qu'une présentation, seul documentKind change.
// Une carte PORTANT une image de couverture : « Retirer l'image » n'existe que là (le panneau
// d'une couverture ne propose que « Changer l'image » et « Retirer l'image »).
const AVEC_IMAGE = Object.assign({}, PRESENTATION, {
  documentId: 'image-drapeau', versionId: 'image-drapeau-v1',
  title: 'Une diapositive avec image',
  blocks: PRESENTATION.blocks.map((b, i) => i !== 0 ? b : Object.assign({}, b, {
    content: Object.assign({}, b.content, { imageRef: 'un ciel calme', imageAlt: 'Un ciel calme' }),
  })),
});

const CARROUSEL = Object.assign({}, PRESENTATION, {
  documentId: 'carrousel-drapeau', versionId: 'carrousel-drapeau-v1',
  documentKind: 'carrousel', title: 'Un carrousel pour l\u2019audit du drapeau',
});

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  // Le modèle est simulé par la racine : une page valide à chaque appel.
  const vrai = serveur.listeners('request')[0];
  serveur.removeAllListeners('request');
  serveur.on('request', (q, r) => {
    if (q.method === 'POST' && q.url === '/') {
      let c = ''; q.on('data', (d) => { c += d; });
      return q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' });
        r.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_new_slide', input: PAGE_SIMULEE }] })); });
    }
    return vrai(q, r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port; const base = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);

  const repartirPropre = (doc) => page.evaluate(async (d) => {
    window._adocArtifacts = { e: { name: d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
      _adocClinicalDocumentId: 'doc-propre', _ccEditorDirty: false,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
    await window.adocOpenWorkspace('e');
    window._adocArtifacts.e._ccEditorDirty = false;
    await new Promise((r) => setTimeout(r, 250));
    return !window._adocArtifacts.e._ccEditorDirty;
  }, doc || PRESENTATION);
  const sale = () => page.evaluate(() => !!window._adocArtifacts.e._ccEditorDirty);
  const choisirBloc = (i) => page.evaluate((k) => {
    const d = window._adocArtifacts.e._adocStructuredDoc;
    document.getElementById(d.blocks[k].content.blocks[0].id)?.click();
  }, i);

  // Outils communs pour jouer un geste par le VRAI chemin de l'éditeur.
  const outils = async () => { await page.evaluate(() =>
    window.adocEditorRefreshControls && window.adocEditorRefreshControls()); await page.waitForTimeout(200); };
  const action = (nom) => page.evaluate((a) => {
    const b = document.querySelector('[data-editor-action="' + a + '"]');
    if (!b) throw new Error('action absente : ' + a);
    b.click();
  }, nom);
  const style = (champ, valeur) => page.evaluate((a) => {
    const el = document.querySelector('[data-editor-style="' + a.c + '"]');
    if (!el) throw new Error('champ absent : ' + a.c);
    el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { c: champ, v: valeur });
  const portee = (v) => page.evaluate((x) => {
    const el = document.querySelector('[data-editor-scope]');
    el.value = x; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  // La frappe ne compte que dans une FEUILLE : l'écouteur du cœur est
  // `e.target.closest('[data-cc-editor-leaf]')`. Frapper dans l'enveloppe d'un bloc ne lèverait
  // rien — et ce serait le contrôle qui serait faux, pas le cœur. On vise donc la feuille, en
  // refusant de conclure si elle n'existe pas.
  const frapper = (selecteur, texte) => page.evaluate((a) => {
    const el = document.querySelector(a.s);
    if (!el) throw new Error('élément absent : ' + a.s);
    const leaf = el.matches('[data-cc-editor-leaf]') ? el : el.querySelector('[data-cc-editor-leaf]');
    if (!leaf) throw new Error('aucune feuille modifiable dans : ' + a.s);
    leaf.dispatchEvent(new Event('focusin', { bubbles: true }));
    leaf.focus();
    leaf.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: a.t }));
    leaf.textContent = (leaf.textContent || '') + a.t;
    leaf.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: a.t }));
  }, { s: selecteur, t: texte });
  const champ = (attr, valeur, evt) => page.evaluate((a) => {
    const el = document.querySelector('[' + a.k + ']');
    if (!el) throw new Error('champ absent : ' + a.k);
    el.value = a.v; el.dispatchEvent(new Event(a.e, { bubbles: true }));
  }, { k: attr, v: valeur, e: evt });

  // UN GESTE = UNE LIGNE = UNE MESURE. Chaque geste part d'un document propre, est joué par le
  // VRAI contrôle de l'éditeur (jamais en écrivant _ccEditorDirty), puis `_ccEditorDirty` est
  // relu. `doc` désigne le document d'essai quand le geste n'est pas jouable sur une
  // présentation ; `prealable` met en place la situation SANS être mesuré (drapeau remis à faux
  // juste après).
  const GESTES = [
    { nom: 'frappe dans un bloc', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(300);
        const id = await page.evaluate(() =>
          window._adocArtifacts.e._adocStructuredDoc.blocks[0].content.blocks[0].id);
        await frapper('#' + id, ' ajouté');
        await page.waitForTimeout(400);
      } },
    { nom: 'frappe dans le titre d’une diapositive', faire: async () => {
        await frapper('.adoc-sc-card-title', ' modifié');
        await page.waitForTimeout(400);
      } },
    { nom: 'frappe dans le titre du document', doc: 'FICHE', faire: async () => {
        await frapper('.adoc-sc-cover-title', ' modifié');
        await page.waitForTimeout(400);
      } },
    { nom: 'style appliqué au bloc entier (police)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block');
        await style('fontFamily', 'Lora');
        await page.waitForTimeout(400);
      } },
    { nom: 'style appliqué au texte sélectionné (gras)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('selection');
        await page.evaluate(() => {
          const d = window._adocArtifacts.e._adocStructuredDoc;
          const el = document.getElementById(d.blocks[0].content.blocks[0].id);
          const leaf = el.matches('[data-cc-editor-leaf]') ? el : el.querySelector('[data-cc-editor-leaf]');
          const r = document.createRange(); r.selectNodeContents(leaf || el);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await action('bold');
        await page.waitForTimeout(400);
      } },
    { nom: 'alignement du texte d’un bloc', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block'); await style('textAlign', 'center');
        await page.waitForTimeout(400);
      } },
    { nom: 'fond d’un bloc (couleur)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block'); await style('backgroundColor', '#eef2f3');
        await page.waitForTimeout(400);
      } },
    { nom: 'opacité du fond d’un bloc (curseur)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await champ('data-editor-opacity="backgroundOpacity"', '60', 'input');
        await page.waitForTimeout(400);
      } },
    { nom: 'remise à zéro du style d’un bloc', prealable: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block'); await style('fontSizePt', '19');
        await page.waitForTimeout(400);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await action('reset');
        await page.waitForTimeout(400);
      } },
    { nom: 'position d’une carte (champ X)', doc: 'CARROUSEL', faire: async () => {
        // Le panneau de position s'ouvre au mousedown sur la SURFACE PROPRE de la carte (ni son
        // titre, ni un bloc) : on envoie de vrais évènements de souris, jamais un appel direct.
        const boite = await page.evaluate(() => {
          const el = document.getElementById('card-01');
          if (!el) throw new Error('élément absent : carte card-01');
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        await page.mouse.move(boite.x + boite.w / 2, boite.y + boite.h - 6);
        await page.mouse.down(); await page.mouse.up();
        await page.waitForTimeout(500);
        await champ('data-card-position="x"', '42', 'change');
        await page.waitForTimeout(400);
      } },
    { nom: 'liste : ajout d’un élément', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-liste-01')?.click());
        await page.waitForTimeout(450); await outils();
        await page.evaluate(() => {
          const li = document.querySelector('#f-liste-01 li [data-cc-editor-leaf]')
            || document.querySelector('#f-liste-01 li');
          if (!li) throw new Error('élément absent : li de la liste');
          li.dispatchEvent(new Event('focusin', { bubbles: true }));
          const r = document.createRange(); r.selectNodeContents(li); r.collapse(false);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await action('list-add');
        await page.waitForTimeout(400);
      } },
    { nom: 'liste : retrait d’un élément', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-liste-01')?.click());
        await page.waitForTimeout(450); await outils();
        await page.evaluate(() => {
          const li = document.querySelector('#f-liste-01 li [data-cc-editor-leaf]')
            || document.querySelector('#f-liste-01 li');
          if (!li) throw new Error('élément absent : li de la liste');
          li.dispatchEvent(new Event('focusin', { bubbles: true }));
          const r = document.createRange(); r.selectNodeContents(li); r.collapse(false);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await action('list-remove');
        await page.waitForTimeout(400);
      } },
    { nom: 'tableau : style d’une cellule', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => {
          const c = document.querySelector('#f-tab-01 td [data-cc-editor-leaf]')
            || document.querySelector('#f-tab-01 td');
          if (!c) throw new Error('élément absent : cellule du tableau');
          c.dispatchEvent(new Event('focusin', { bubbles: true })); c.focus();
          const r = document.createRange(); r.selectNodeContents(c);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await page.waitForTimeout(500); await outils();
        await portee('cell'); await page.waitForTimeout(250);
        await style('backgroundColor', '#f4f1ea');
        await page.waitForTimeout(400);
      } },
    { nom: 'tableau : ajout d’une ligne', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => {
          const c = document.querySelector('#f-tab-01 td [data-cc-editor-leaf]')
            || document.querySelector('#f-tab-01 td');
          if (!c) throw new Error('élément absent : cellule du tableau');
          c.dispatchEvent(new Event('focusin', { bubbles: true })); c.focus();
          const r = document.createRange(); r.selectNodeContents(c); r.collapse(true);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await page.waitForTimeout(500); await outils();
        await action('row-after');
        await page.waitForTimeout(400);
      } },
    { nom: 'tableau : tri d’une colonne', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => {
          const c = document.querySelector('#f-tab-01 td [data-cc-editor-leaf]')
            || document.querySelector('#f-tab-01 td');
          if (!c) throw new Error('élément absent : cellule du tableau');
          c.dispatchEvent(new Event('focusin', { bubbles: true })); c.focus();
          const r = document.createRange(); r.selectNodeContents(c); r.collapse(true);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
        await page.waitForTimeout(500); await outils();
        await action('sort-asc');
        await page.waitForTimeout(400);
      } },
    { nom: 'image : opacité', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-img-01')?.click());
        await page.waitForTimeout(500);
        await champ('data-image-opacity="opacity"', '70', 'input');
        await page.waitForTimeout(400);
      } },
    { nom: 'image : taille', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-img-01')?.click());
        await page.waitForTimeout(500);
        await champ('data-image-size="widthPercent"', '60', 'input');
        await page.waitForTimeout(400);
      } },
    { nom: 'image : rotation', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-img-01')?.click());
        await page.waitForTimeout(500);
        await champ('data-image-rotation="rotation"', '15', 'input');
        await page.waitForTimeout(400);
      } },
    { nom: 'image : « Ajouter du texte » (bloc mixte)', doc: 'FICHE', faire: async () => {
        await page.evaluate(() => document.getElementById('f-img-01')?.click());
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const b = document.querySelector('[data-image-add-text]');
          if (!b) throw new Error('champ absent : data-image-add-text');
          b.click();
        });
        await page.waitForTimeout(600);
      } },
    // Q7 : le retrait reste en mémoire ; le serveur ne reçoit aucune version avant Sauvegarder.
    { nom: 'image de couverture : retrait', doc: 'AVEC_IMAGE', attendu: 'differe',
      prealable: async () => {
        await page.evaluate(async () => {
          window._adocArtifacts.e._adocClinicalDocumentId = null;
          await window.adocWsSave();
        });
        await page.waitForTimeout(700);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await page.evaluate(() => {
          const img = document.querySelector('.adoc-sc-card-img');
          if (!img) throw new Error('élément absent : image de couverture');
          img.click();
        });
        await page.waitForTimeout(600);
        await page.evaluate(async () => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => (x.textContent || '').trim() === 'Retirer l’image');
          if (!b) throw new Error('élément absent : bouton « Retirer l’image »');
          b.click();
        });
        await page.waitForTimeout(1200);
      } },
    { nom: 'insertion d’un bloc', faire: async () => {
        await choisirBloc(1); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer un bloc après$/ }).click();
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.cc-block-edit-result button')]
            .find((x) => !/^Annuler$/.test((x.textContent || '').trim()));
          b.click();
        });
        await page.waitForTimeout(500);
      } },
    // Q7 : la correction confirmée marque le document modifié, sans version automatique.
    // Le document existe déjà côté faux Worker pour mesurer la stabilité de sa version.
    { nom: 'correction d’un passage (modèle simulé)', attendu: 'differe', prealable: async () => {
        await page.evaluate(async () => {
          window._adocArtifacts.e._adocClinicalDocumentId = null;
          await window.adocWsSave();
        });
        await page.waitForTimeout(700);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        // Un PARAGRAPHE, jamais le titre : `headingContent` exige un `level`, et un bloc de
        // remplacement invalide ferait échouer le rendu — le cœur annulerait alors sa mutation
        // et ne sauvegarderait rien, à juste titre. Mesurer ça aurait mesuré mon erreur.
        await choisirBloc(1); await page.waitForTimeout(450);
        await page.evaluate(async () => {
          const st = window._adocBlockEditState;
          const b = st.originalBlock;
          if (!b || b.type !== 'paragraph') throw new Error('élément absent : paragraphe sélectionné');
          st.pendingBlock = { id: b.id, type: 'paragraph', content: { text: 'Passage corrigé.' },
            citationIds: b.citationIds || [], validation: {} };
          await window.adocConfirmBlockCorrection();
        });
        await page.waitForTimeout(900);
      } },
    { nom: 'narration écrite à la main (zone de l’éditeur)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(500); await outils();
        await champ('data-editor-narration', 'Ce que je dirai pendant cette étape.', 'input');
        await page.waitForTimeout(400);
      } },
    { nom: 'insertion d’une page (D2)', faire: async () => {
        await choisirBloc(2); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
        await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
        await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
        await page.waitForTimeout(800);
      } },
    { nom: 'annulation d’une page (D5)', prealable: async () => {
        // Il faut d'abord insérer une page, PUIS remettre le drapeau à faux : on mesure
        // seulement ce que l'ANNULATION fait.
        await choisirBloc(2); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
        await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
        await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
        await page.waitForTimeout(800);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await page.evaluate(() => window.adocAnnulerPageNeuve());
        await page.waitForTimeout(600);
      } },
    { nom: 'annuler de l’éditeur', prealable: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block'); await style('fontSizePt', '18');
        await page.waitForTimeout(400);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await action('undo');
        await page.waitForTimeout(500);
      } },
    { nom: 'rétablir de l’éditeur', prealable: async () => {
        await choisirBloc(0); await page.waitForTimeout(350); await outils();
        await portee('block'); await style('fontSizePt', '18');
        await page.waitForTimeout(400);
        await action('undo'); await page.waitForTimeout(450);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await action('redo');
        await page.waitForTimeout(500);
      } },
  ];

  // Gestes de la liste de Christophe qu'on NE JOUE PAS, avec la raison exacte. Aucun n'est
  // déclaré vert : ils sont déclarés non mesurés.
  const NON_JOUES = [
    ['image : AJOUT et CHANGEMENT',
     '« Changer l’image » appelle adocChooseBlockInsertType(\'replace\',\'image\'), qui ouvre la ' +
     'bibliothèque d’images (réseau) ; un ajout passe par là ou par le glisser-déposer d’un vrai ' +
     'fichier. Le RETRAIT, lui, est jouable et mesuré ci-dessus, et les réglages d’un bloc image ' +
     '(opacité, taille, rotation, bloc mixte) aussi.'],
    ['vidéo : ajout',
     'passe par la recherche de média (window.adocVideoSearch), un appel réseau.'],
    ['transformation du document',
     'adocMagicSwitchTransform construit un plan de génération complet et appelle le modèle par ' +
     'le pipeline entier — le banc ne simule qu’un seul tool_use, pas tout le protocole. Et la ' +
     'question du drapeau y est mal posée : la transformation ne modifie pas le document source, ' +
     'elle en CRÉE un nouveau, dérivé.'],
    ['narration : application d’une rédaction par le panneau',
     'MESURÉE DEPUIS, dans tests/verify-drapeau-narration-appliquee.cjs. Mon ancienne raison — ' +
     '« adocNarrationApply n’a aucun appelant » — était vraie mais sans portée : le panneau ' +
     'appelle adocNarrationWrite en boucle, et il vit dans narration-ia.js, un module que mon ' +
     'audit n’avait pas ouvert. C’est là qu’était le défaut de production du 20 octobre.'],
  ];

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    const resultats = [];
    const injouables = [];
    // Nombre total de versions chez le faux Worker : la seule preuve qu'un enregistrement a
    // réellement eu lieu (jamais un indicateur de l'écran).
    const versions = () => [...etat.documents.values()].reduce((t, d) => t + d.versions.length, 0);
    let avant = 0;
    for (const g of GESTES) {
      const doc = g.doc === 'FICHE' ? FICHE : g.doc === 'CARROUSEL' ? CARROUSEL
        : g.doc === 'AVEC_IMAGE' ? AVEC_IMAGE : PRESENTATION;
      const ou = g.doc === 'FICHE' ? 'fiche' : g.doc === 'CARROUSEL' ? 'carrousel'
        : g.doc === 'AVEC_IMAGE' ? 'présentation + image' : 'présentation';
      assert.ok(await repartirPropre(doc), g.nom + ' : on repart d\'un document propre');
      try {
        if (g.prealable) await g.prealable();
        avant = versions();
        await g.faire();
      } catch (e) {
        // Un contrôle ABSENT de l'interface n'est pas un drapeau oublié : c'est un geste qu'on
        // n'a pas pu jouer. On le dit, on ne le compte pas vert. Toute autre erreur reste une
        // vraie erreur et fait échouer le contrôle.
        if (!/(élément|champ|action) absent|aucune feuille modifiable/.test(e.message)) throw e;
        injouables.push({ nom: g.nom, raison: e.message.split('\n')[0] });
        console.log('      –  ' + g.nom + ' → NON JOUÉ (' + e.message.split('\n')[0] + ')');
        continue;
      }
      const leve = await sale();
      const apres = versions();
      const ok = g.attendu === 'enregistre' ? (!leve && apres === avant + 1)
        : g.attendu === 'differe' ? (leve && apres === avant) : leve;
      const dit = g.attendu === 'enregistre'
        ? (ok ? 'une version de plus chez le serveur, rien en attente'
              : 'ATTENDU +1 version et rien en attente ; drapeau=' + leve
                + ', versions ' + avant + '→' + apres)
        : g.attendu === 'differe'
          ? (ok ? 'drapeau levé, aucune version automatique'
                : 'ATTENDU drapeau levé et 0 version ; drapeau=' + leve + ', versions ' + avant + '→' + apres)
          : (ok ? 'drapeau levé' : 'drapeau PAS LEVÉ');
      resultats.push({ nom: g.nom, ok: ok, doc: ou, attendu: g.attendu || 'drapeau' });
      console.log('      ' + (ok ? '✓' : '✗') + '  ' + g.nom + ' [' + ou + '] → ' + dit);
    }
    console.log('\n   Gestes NON JOUÉS, et pourquoi :');
    NON_JOUES.concat(injouables.map((i) => [i.nom, i.raison]))
      .forEach((l) => console.log('      – ' + l[0] + ' : ' + l[1]));
    console.log('');
    const manquants = resultats.filter((r) => !r.ok);
    assert.deepEqual(manquants.map((r) => r.nom), [],
      'tout geste qui écrit doit lever le drapeau (ou enregistrer sur-le-champ) ; ne le font pas : '
      + JSON.stringify(manquants.map((r) => r.nom)));
    pass('les ' + resultats.length + ' gestes mesurés lèvent le drapeau « modifié » ('
      + resultats.filter((r) => r.doc === 'présentation').length + ' sur une présentation, '
      + resultats.filter((r) => r.doc === 'fiche').length + ' sur une fiche, '
      + resultats.filter((r) => r.doc === 'carrousel').length + ' sur un carrousel, '
      + resultats.filter((r) => r.doc === 'présentation + image').length
      + ' sur une présentation à image) ; '
      + (NON_JOUES.length + injouables.length) + ' gestes déclarés non mesurés.');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-drapeau-modifie — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
