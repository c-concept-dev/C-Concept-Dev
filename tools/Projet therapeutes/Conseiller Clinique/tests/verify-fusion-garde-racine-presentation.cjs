// STUDIO CLINIQUE — Fusion de documents : deux défauts de la MÊME fonction appelante
// (adocFusionCommitDrop) et de sa garde (adocFusionCanDropBlockType). Patron repris tel quel de
// verify-fusion-phase2-drag-drop.cjs (fixtures baseDoc/heading/para/card, Playwright, PASS
// numérotés), jamais une seconde mécanique de test.
//
// DÉFAUT 1 — la garde de RACINE ne nommait que 'carrousel'. Or clinical-document.schema.json
// oriente documentKind ∈ ["carrousel","presentation"] vers LA MÊME branche
// block.schema.json#/$defs/cardOnlyBlock : la racine d'une Présentation porte donc EXACTEMENT la
// même contrainte. Un bloc éditorial déposé à la racine d'une Présentation était accepté par la
// garde puis refusé par la validation de schéma.
//   PORTÉE HONNÊTE : ce défaut n'était PAS atteignable par le geste réel. adocFusionShowDropTargets
//   ne pose de points de dépôt que sur les .adoc-sc-block RENDUS, et dans une Présentation ils sont
//   tous imbriqués dans des cartes — adocEditorBlockContainer résout donc vers card.content.blocks,
//   jamais vers doc.blocks. Ce test attaque donc window.adocFusionCommitDrop PAR SON ENTRÉE RÉELLE
//   (fonction exposée, mêmes arguments que le clic/glissement), avec une fixture de Présentation
//   portant SCIEMMENT un bloc de premier niveau — la seule façon de rendre la branche atteignable.
//   Cette fixture est délibérément non canonique au sens du schéma : c'est le sujet du test, pas un
//   oubli. Aucun geste d'interface ne peut produire cet état aujourd'hui.
//
// DÉFAUT 2 — adocFusionCommitDrop ne défaisait pas son siblings.splice quand l'ouverture échouait
// ensuite, contrairement à adocInsertStructuredBlock. Deux modes d'échec distincts, tous deux
// couverts ici, car la correction du seul `catch` n'aurait PAS suffi :
//   (a) adocOpenWorkspace AVALE l'échec de rendu/validation et retourne `false` sans lever — le
//       `catch` ne s'exécutait donc JAMAIS sur le chemin d'échec le plus probable (dépôt refusé par
//       la validation), et le bloc restait dans le document ;
//   (b) adocOpenWorkspace lève réellement — le `catch` s'exécutait, mais sans défaire le splice.
//
// NON COUVERT, et volontairement pas revendiqué : les citations fusionnées dans A par
// adocFusionMergeCitationIntoTarget AVANT le splice ne sont pas défaites par ce retour arrière
// (entrées orphelines dans docA.citations / snapshot). Les blocs B de ce test sont donc SANS
// citation, pour que chaque assertion prouve exactement ce qu'elle annonce. Sujet distinct, versé
// aux découvertes de gouvernance (0D : un seul sujet par lot).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function baseDoc(id, title, documentKind, blocks) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: '2026-10-06T09:00:00Z', language: 'fr', status: 'draft',
    title: title, purpose: 'supervision', audience: 'clinicien',
    documentKind: documentKind, renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }
function card(id, title, nestedBlocks) { return { id: id, type: 'card', content: { title: title, imageRef: null, imageAlt: null, blocks: nestedBlocks }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Collecteur persistant — ce scénario provoque PLUSIEURS alertes attendues (un refus de garde par
  // documentKind, puis deux retours arrière). Un page.once ne couvrirait que la première et les
  // suivantes compteraient comme dialogue non géré.
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ── Fixtures ──
  // Trois documents CIBLES, un par documentKind à tester à la RACINE, chacun porteur d'un bloc de
  // premier niveau servant d'ancre de dépôt (sans ancre, adocFusionCommitDrop sort avant la garde).
  const docFiche = baseDoc('doc-garde-fiche', 'Cible Fiche', 'fiche', [heading('f-h1', 'Titre Fiche'), para('f-p1', 'Paragraphe Fiche')]);
  const docCarrousel = baseDoc('doc-garde-carrousel', 'Cible Carrousel', 'carrousel', [card('c-card1', 'Carte C1', [para('c-nested1', 'Imbriqué C1')]), para('c-root-para', 'Bloc de premier niveau, fixture non canonique.')]);
  const docPresentation = baseDoc('doc-garde-presentation', 'Cible Présentation', 'presentation', [card('p-card1', 'Diapositive P1', [para('p-nested1', 'Imbriqué P1')]), para('p-root-para', 'Bloc de premier niveau, fixture non canonique.')]);
  // Document SOURCE (B) et le bloc éditorial copié — sans citation (cf. en-tête).
  const docB = baseDoc('doc-garde-b', 'Source B', 'fiche', [para('b-p1', 'Paragraphe éditorial venu de B.')]);

  const keys = { fiche: 'adocArt_garde_fiche', carrousel: 'adocArt_garde_carrousel', presentation: 'adocArt_garde_presentation' };
  await page.evaluate(({ keys, docFiche, docCarrousel, docPresentation }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    function mk(doc) {
      return {
        name: doc.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
        _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-' + doc.documentId, entries: [] }, _adocRenderManifestOverride: null,
      };
    }
    window._adocArtifacts[keys.fiche] = mk(docFiche);
    window._adocArtifacts[keys.carrousel] = mk(docCarrousel);
    window._adocArtifacts[keys.presentation] = mk(docPresentation);
  }, { keys, docFiche, docCarrousel, docPresentation });

  // Pose un bouton DÉTACHÉ comme pending.btn : adocFusionCommitDrop ne manipule que classList /
  // textContent / disabled, qui fonctionnent hors document — permet de PROUVER la restauration de
  // l'état du bouton sans dépendre du panneau d'aperçu complet.
  await page.evaluate(() => {
    window.__testBtn = document.createElement('button');
    window.__testBtn.textContent = 'Copier vers le document';
    window.__testBtn.classList.add('cc-preview-copy-btn-picking');
  });

  // Prépare un dépôt à la RACINE du document ciblé, par l'entrée réelle de la fonction.
  async function tenterDepotRacine(storeKey, ancre, blockB) {
    return page.evaluate(async ({ storeKey, ancre, blockB, docB }) => {
      window._adocWsState.storeKey = storeKey;
      window.__testBtn.textContent = 'Copier vers le document';
      window.__testBtn.disabled = false;
      window.__testBtn.classList.add('cc-preview-copy-btn-picking');
      window._adocFusionPendingCopy = {
        blockId: blockB.id, blockB: blockB, btn: window.__testBtn,
        docB: docB, snapshotB: { sourceSnapshotId: 'snapshot-' + docB.documentId, entries: [] },
      };
      await window.adocFusionCommitDrop(ancre, 'after');
      const doc = window._adocArtifacts[storeKey]._adocStructuredDoc;
      return {
        ids: doc.blocks.map((b) => b.id),
        pending: window._adocFusionPendingCopy,
        btnText: window.__testBtn.textContent,
        btnDisabled: window.__testBtn.disabled,
        btnPicking: window.__testBtn.classList.contains('cc-preview-copy-btn-picking'),
      };
    }, { storeKey, ancre, blockB, docB });
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // DÉFAUT 1 — la garde de RACINE, documentKind par documentKind
  // ════════════════════════════════════════════════════════════════════════════════════════

  // Contre-épreuve indispensable : la garde doit ACCEPTER à la racine d'une Fiche. Sans elle, un
  // refus généralisé (garde qui refuserait tout) passerait les deux assertions suivantes et
  // « prouverait » le correctif à tort (régression #10 : conclusion tirée d'un indice trop étroit).
  {
    const r = await tenterDepotRacine(keys.fiche, 'f-h1', para('b-p1', 'Paragraphe éditorial venu de B.'));
    assert.equal(r.ids.length, 3, 'la racine d’une Fiche doit ACCEPTER un bloc éditorial (editorialBlock) — sinon la garde refuse tout et les deux tests suivants ne prouvent rien');
    assert.equal(r.ids[1].startsWith('b-p1') ? false : true, true, 'le bloc déposé doit recevoir un NOUVEL id relatif à la cible');
    assert.equal(r.pending, null, 'le dépôt accepté doit refermer l’attente');
    assert.equal(r.btnText, 'Copié ✓', 'le dépôt accepté doit afficher la confirmation sur le bouton');
    assert.equal(r.btnDisabled, true, 'le bouton doit être désactivé après un dépôt réussi');
  }
  console.log('PASS 1/7 — contre-épreuve : la racine d’une FICHE accepte bien un bloc éditorial (la garde discrimine par documentKind, elle ne refuse pas tout)');

  {
    const r = await tenterDepotRacine(keys.carrousel, 'c-root-para', para('b-p1', 'Paragraphe éditorial venu de B.'));
    assert.deepEqual(r.ids, ['c-card1', 'c-root-para'], 'la racine d’un CARROUSEL ne doit RIEN recevoir : cardOnlyBlock');
    assert.equal(r.pending, null, 'le refus doit refermer l’attente');
    assert.equal(r.btnPicking, false, 'le refus doit retirer l’état visuel « choix en cours » du bouton');
    const msg = dialogs[dialogs.length - 1];
    assert.ok(msg && msg.includes('paragraph') && msg.includes('autorisé'), 'le refus doit nommer le type incompatible : ' + msg);
  }
  console.log('PASS 2/7 — cas DÉJÀ couvert avant le correctif : la racine d’un CARROUSEL refuse un bloc éditorial, message clair, rien inséré');

  // ── LE CORRECTIF : même contrainte de schéma, même refus attendu ──
  {
    const r = await tenterDepotRacine(keys.presentation, 'p-root-para', para('b-p1', 'Paragraphe éditorial venu de B.'));
    assert.deepEqual(r.ids, ['p-card1', 'p-root-para'], 'la racine d’une PRÉSENTATION ne doit RIEN recevoir : clinical-document.schema.json l’oriente vers le MÊME cardOnlyBlock que le Carrousel. AVANT le correctif, la garde ne nommait que "carrousel" et ce bloc était inséré, pour être refusé juste après par la validation.');
    assert.equal(r.pending, null, 'le refus doit refermer l’attente');
    assert.equal(r.btnPicking, false, 'le refus doit retirer l’état visuel « choix en cours » du bouton');
    const msg = dialogs[dialogs.length - 1];
    assert.ok(msg && msg.includes('paragraph') && msg.includes('autorisé'), 'le refus doit nommer le type incompatible : ' + msg);
  }
  console.log('PASS 3/7 — DÉFAUT 1 CORRIGÉ : la racine d’une PRÉSENTATION refuse un bloc éditorial, exactement comme un Carrousel');

  // La garde lit la liste depuis UN SEUL endroit — vérifié par la valeur réellement évaluée dans la
  // page, jamais par un grep sur le source (régression #10 : une mesure se vérifie par le
  // comportement, pas par un motif de recherche).
  {
    const nested = await page.evaluate(() => {
      // Dépôt IMBRIQUÉ (card.content.blocks) d'un type hors nestedBlock : prouve que la seconde
      // branche de la garde, elle, n'a pas été touchée par le correctif.
      window._adocWsState.storeKey = 'adocArt_garde_presentation';
      window.__testBtn.textContent = 'Copier vers le document'; window.__testBtn.disabled = false;
      window._adocFusionPendingCopy = {
        blockId: 'b-table', blockB: { id: 'b-table', type: 'table', content: { headers: ['A'], rows: [['1']] }, citationIds: [], validation: {} },
        btn: window.__testBtn, docB: { documentId: 'doc-garde-b', citations: [] }, snapshotB: { sourceSnapshotId: 'snapshot-doc-garde-b', entries: [] },
      };
      return window.adocFusionCommitDrop('p-nested1', 'after').then(() => window._adocArtifacts['adocArt_garde_presentation']._adocStructuredDoc.blocks[0].content.blocks.map((b) => b.id));
    });
    assert.deepEqual(nested, ['p-nested1'], 'la branche IMBRIQUÉE de la garde (ADOC_NESTED_POSITIONABLE_TYPES, table exclue) doit rester inchangée par ce correctif');
  }
  console.log('PASS 4/7 — non-régression : la branche IMBRIQUÉE de la garde (table exclue de nestedBlock) reste inchangée');

  // ════════════════════════════════════════════════════════════════════════════════════════
  // DÉFAUT 2 — retour arrière du splice, DEUX modes d'échec
  // ════════════════════════════════════════════════════════════════════════════════════════

  // Mode (a) — adocOpenWorkspace retourne false SANS lever. C'est le mode réel d'un refus de
  // validation : adocOpenWorkspace attrape l'échec de rendu, alerte, puis `return false`.
  {
    const r = await page.evaluate(async ({ storeKey, blockB, docB }) => {
      const vrai = window.adocOpenWorkspace;
      window.adocOpenWorkspace = async function () { return false; };
      window._adocWsState.storeKey = storeKey;
      window.__testBtn.textContent = 'Copier vers le document'; window.__testBtn.disabled = false;
      window.__testBtn.classList.add('cc-preview-copy-btn-picking');
      const avant = window._adocArtifacts[storeKey]._adocStructuredDoc.blocks.map((b) => b.id);
      window._adocFusionPendingCopy = { blockId: blockB.id, blockB: blockB, btn: window.__testBtn, docB: docB, snapshotB: { sourceSnapshotId: 'snapshot-' + docB.documentId, entries: [] } };
      await window.adocFusionCommitDrop('f-h1', 'after');
      window.adocOpenWorkspace = vrai;
      return {
        avant: avant,
        apres: window._adocArtifacts[storeKey]._adocStructuredDoc.blocks.map((b) => b.id),
        pending: window._adocFusionPendingCopy,
        btnText: window.__testBtn.textContent, btnDisabled: window.__testBtn.disabled,
        btnPicking: window.__testBtn.classList.contains('cc-preview-copy-btn-picking'),
      };
    }, { storeKey: keys.fiche, blockB: para('b-p1', 'Paragraphe éditorial venu de B.'), docB: docB });
    assert.deepEqual(r.apres, r.avant, 'mode (a) : adocOpenWorkspace retournant false, le bloc inséré doit être RETIRÉ — AVANT le correctif, ce chemin sortait normalement, le catch ne s’exécutait jamais et le bloc restait');
    assert.equal(r.pending, null, 'l’attente doit être refermée après le retour arrière');
    assert.equal(r.btnText, 'Copier vers le document', 'le bouton doit retrouver son libellé initial, jamais « Copié ✓ » après un échec');
    assert.equal(r.btnDisabled, false, 'le bouton doit redevenir cliquable après un échec');
    assert.equal(r.btnPicking, false, 'l’état visuel « choix en cours » doit être retiré');
    const msg = dialogs[dialogs.length - 1];
    assert.ok(msg && msg.includes('Copie impossible'), 'l’échec doit être annoncé à l’utilisatrice : ' + msg);
  }
  console.log('PASS 5/7 — DÉFAUT 2 CORRIGÉ, mode (a) : refus par valeur de retour (false) → bloc retiré, bouton restauré, échec annoncé');

  // Mode (b) — adocOpenWorkspace lève réellement. Le catch s'exécutait déjà, mais sans défaire le
  // splice.
  {
    const r = await page.evaluate(async ({ storeKey, blockB, docB }) => {
      const vrai = window.adocOpenWorkspace;
      window.adocOpenWorkspace = async function () { throw new Error('panne de rendu simulée'); };
      window._adocWsState.storeKey = storeKey;
      window.__testBtn.textContent = 'Copier vers le document'; window.__testBtn.disabled = false;
      const avant = window._adocArtifacts[storeKey]._adocStructuredDoc.blocks.map((b) => b.id);
      window._adocFusionPendingCopy = { blockId: blockB.id, blockB: blockB, btn: window.__testBtn, docB: docB, snapshotB: { sourceSnapshotId: 'snapshot-' + docB.documentId, entries: [] } };
      await window.adocFusionCommitDrop('f-h1', 'after');
      window.adocOpenWorkspace = vrai;
      return {
        avant: avant,
        apres: window._adocArtifacts[storeKey]._adocStructuredDoc.blocks.map((b) => b.id),
        pending: window._adocFusionPendingCopy, btnDisabled: window.__testBtn.disabled,
      };
    }, { storeKey: keys.fiche, blockB: para('b-p1', 'Paragraphe éditorial venu de B.'), docB: docB });
    assert.deepEqual(r.apres, r.avant, 'mode (b) : adocOpenWorkspace levant une exception, le bloc inséré doit être RETIRÉ — AVANT le correctif, le catch s’exécutait mais ne défaisait pas le splice');
    assert.equal(r.pending, null, 'l’attente doit être refermée après le retour arrière');
    assert.equal(r.btnDisabled, false, 'le bouton doit redevenir cliquable après un échec');
    const msg = dialogs[dialogs.length - 1];
    assert.ok(msg && msg.includes('panne de rendu simulée'), 'le message d’échec doit porter la cause réelle : ' + msg);
  }
  console.log('PASS 6/7 — DÉFAUT 2 CORRIGÉ, mode (b) : exception réelle → bloc retiré, cause réelle annoncée');

  // Non-régression du chemin heureux : la conversion falsy→throw ne doit pas avoir cassé le succès.
  {
    const r = await tenterDepotRacine(keys.fiche, 'f-h1', para('b-p2', 'Second paragraphe de B, dépôt qui doit réussir.'));
    assert.equal(r.ids.length, 4, 'un dépôt compatible avec une ouverture réussie doit TOUJOURS aboutir — la conversion falsy→throw ne doit pas avoir cassé le chemin heureux');
    assert.equal(r.btnText, 'Copié ✓', 'le chemin heureux doit toujours confirmer sur le bouton');
    assert.equal(r.btnDisabled, true, 'le chemin heureux doit toujours désactiver le bouton');
  }
  console.log('PASS 7/7 — non-régression : le chemin heureux (dépôt compatible, ouverture réussie) aboutit toujours');

  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('');
  console.log('=== TOUS LES TESTS FUSION — GARDE DE RACINE PRÉSENTATION + RETOUR ARRIÈRE (7/7) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
