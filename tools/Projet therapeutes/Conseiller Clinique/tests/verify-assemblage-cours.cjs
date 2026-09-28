// Cours en puzzle — l'ASSEMBLEUR, éprouvé sur des modules FORGÉS, sans le moindre appel au modèle.
//
// Ce que ce test protège, et qui n'a rien d'évident : remplacer un module puis réassembler doit
// donner EXACTEMENT le document qu'on aurait eu avec le bon module du premier coup. Sans cela, le
// « puzzle » n'en est pas un — on ne pourrait jamais rejouer une pièce sans tout refaire.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-assemblage-cours.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
// Le condensat est calculé POUR DE VRAI : le contrôle qualité de l'application le recalcule depuis
// exactText, et un faux condensat ferait échouer ce contrôle sans que l'assembleur y soit pour rien.
const sha256 = t => 'sha256:' + crypto.createHash('sha256').update(t).digest('hex');

const IDS = { documentId: 'cours-1', versionId: 'cours-1-v1', createdAt: '2026-01-01T00:00:00Z', requestId: 'req-1' };

// ── Forge déterministe ────────────────────────────────────────────────────────────────────────
// `passages` porte les identifiants de passages cités : deux modules qui partagent un passage
// doivent donner UNE entrée, pas deux.
function forgerModule(n, opts) {
  const o = opts || {};
  const passages = o.passages || ['p' + n];
  const entries = passages.map((p, i) => ({
    sourceSnapshotEntryId: 'entry-' + (i + 1), sourceType: 'library', sourceId: 'livre-' + p,
    passageId: p, exactText: 'Texte du passage ' + p, contentChecksum: sha256('Texte du passage ' + p),
    book: 'Livre ' + p, author: 'Auteur', locator: { page: 10, section: null },
    retrievedAt: '2026-01-01T00:00:00Z',
  }));
  const citations = passages.map((p, i) => ({
    citationId: 'citation-' + (i + 1), sourceSnapshotEntryId: 'entry-' + (i + 1), displayLabel: 'Livre ' + p + ', p. 10',
  }));
  const cards = [];
  for (let c = 1; c <= (o.cards || 2); c++) {
    const blocs = [{
      id: 'paragraph-' + c, type: 'paragraph', content: { text: 'Module ' + n + ', diapositive ' + c + '.' },
      citationIds: [citations[0].citationId], validation: { citationLinks: [{ citationId: citations[0].citationId, claimText: 'Affirmation ' + c + '.', claimSupport: 'pending' }] },
    }];
    if (c === 1 && o.deepDives !== false) {
      blocs.push({ id: 'heading-' + c, type: 'heading', content: { text: 'Notion du module ' + n, level: 2 },
        citationIds: [], validation: {}, deepDiveLinks: [{ text: 'Notion du module ' + n, targetId: 'dd-a' }] });
    }
    cards.push({ id: 'card-' + String(c).padStart(2, '0'), type: 'card',
      content: { title: 'Module ' + n + ' — diapositive ' + c, imageRef: null, imageAlt: null, blocks: blocs },
      citationIds: [], validation: {} });
  }
  const doc = {
    schemaVersion: 1, documentId: 'm' + n, versionId: 'm' + n + '-v1', previousVersionId: null,
    requestId: 'r' + n, sourceSnapshotId: 's' + n, createdAt: '2026-01-01T00:00:00Z',
    language: 'fr', status: 'draft', title: 'Module ' + n, purpose: 'Objectif', audience: 'clinicien',
    documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: cards, citations,
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
  if (o.deepDives !== false) {
    doc.deepDives = [
      { id: 'dd-a', title: 'Page A du module ' + n, paragraphs: [{ text: 'Vers la page B.', deepDiveLinks: [{ text: 'page B', targetId: 'dd-b' }] }] },
      { id: 'dd-b', title: 'Page B du module ' + n, paragraphs: ['Terminus.'] },
    ];
  }
  if (o.cycle) {
    doc.deepDives[1].paragraphs = [{ text: 'Retour vers A.', deepDiveLinks: [{ text: 'page A', targetId: 'dd-a' }] }];
  }
  return { id: 'm' + n, doc, snapshot: { sourceSnapshotId: 's' + n, entries } };
}
const forgerPlan = (n, titres) => ({
  courseId: 'c1', titre: 'Cours complet',
  modules: Array.from({ length: n }, (_, i) => ({ id: 'm' + (i + 1),
    titre: (titres && titres[i]) || ('Module ' + (i + 1)), notionsCles: ['notion ' + (i + 1)], dureeMinutes: 20 })),
});

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocAssembleCourse === 'function');
    const assembler = (modules, plan, options) => page.evaluate(([m, p, o]) => {
      try { return { ok: true, r: window.adocAssembleCourse(m, p, o) }; }
      catch (e) { return { ok: false, erreur: e.message }; }
    }, [modules, plan, options || { ids: IDS }]);
    const valider = (kind, obj) => page.evaluate(([k, o]) => {
      const r = window.adocValidateSchema(k, o);
      return { valid: !!r.valid, skipped: !!r.skipped, errors: (r.errors || []).slice(0, 5).map(String) };
    }, [kind, obj]);

    // ── 1. TROIS MODULES ──────────────────────────────────────────────────────────────────────
    const trois = [forgerModule(1), forgerModule(2), forgerModule(3)];
    const a = await assembler(trois, forgerPlan(3));
    assert.ok(a.ok, 'assemblage de 3 modules : ' + a.erreur);
    assert.equal(a.r.doc.blocks.length, 9, '3 en-têtes + 3×2 diapositives');
    assert.equal(a.r.doc.modules.length, 3);
    a.r.doc.modules.forEach((m, i) => {
      const carte = a.r.doc.blocks.find(b => b.id === m.cardId);
      assert.ok(carte, 'chaque entrée de modules doit pointer sur une diapositive existante');
      assert.equal(carte.content.title, 'Module ' + (i + 1));
      assert.match(carte.content.blocks[0].content.text, /Notions clés/);
    });
    console.log('PASS  1/13 3 modules : 9 diapositives, 3 en-têtes pointées par doc.modules.');

    // ── 2. DÉDOUBLONNAGE ──────────────────────────────────────────────────────────────────────
    const partages = [forgerModule(1, { passages: ['commun', 'prop1'] }),
                      forgerModule(2, { passages: ['commun', 'prop2'] }),
                      forgerModule(3, { passages: ['commun'] })];
    const d = await assembler(partages, forgerPlan(3));
    assert.ok(d.ok, d.erreur);
    assert.equal(d.r.snapshot.entries.length, 3, 'commun + prop1 + prop2 = 3 entrées, jamais 5');
    assert.equal(d.r.rapport.entreesDedoublonnees, 2, 'deux doublons du passage commun écartés');
    const cles = d.r.snapshot.entries.map(e => e.passageId).sort();
    assert.deepEqual(cles, ['commun', 'prop1', 'prop2']);
    assert.deepEqual(d.r.snapshot.entries.map(e => e.sourceSnapshotEntryId), ['entry-1', 'entry-2', 'entry-3']);
    console.log('PASS  2/13 dédoublonnage : 5 entrées de départ → 3 conservées, numérotées entry-1..3.');

    // ── 3. CITATIONS REMAPPÉES, sur les cartes ET leurs blocs ─────────────────────────────────
    const idsCitations = new Set(d.r.doc.citations.map(c => c.citationId));
    const verifierBloc = b => {
      (b.citationIds || []).forEach(c => assert.ok(idsCitations.has(c), 'citationId inconnu : ' + c));
      ((b.validation && b.validation.citationLinks) || []).forEach(l =>
        assert.ok(idsCitations.has(l.citationId), 'citationLinks pointe hors des citations : ' + l.citationId));
      (b.content && b.content.blocks || []).forEach(verifierBloc);
    };
    d.r.doc.blocks.forEach(verifierBloc);
    d.r.doc.citations.forEach(c => assert.ok(
      d.r.snapshot.entries.some(e => e.sourceSnapshotEntryId === c.sourceSnapshotEntryId),
      'chaque citation doit pointer sur une entrée réelle'));
    assert.deepEqual(d.r.doc.citations.map(c => c.citationId), ['citation-1', 'citation-2', 'citation-3']);
    console.log('PASS  3/13 citations : remappées partout, numérotées, toutes résolues.');

    // ── 4. deepDives PRÉFIXÉS ET REMAPPÉS ─────────────────────────────────────────────────────
    assert.equal(a.r.doc.deepDives.length, 6, '2 pages par module × 3');
    assert.deepEqual(a.r.doc.deepDives.map(x => x.id),
      ['m1-dd-a', 'm1-dd-b', 'm2-dd-a', 'm2-dd-b', 'm3-dd-a', 'm3-dd-b']);
    const lienInterne = a.r.doc.deepDives[0].paragraphs[0].deepDiveLinks[0];
    assert.equal(lienInterne.targetId, 'm1-dd-b', 'un renvoi interne reste dans SON module');
    const blocAvecRenvoi = a.r.doc.blocks[1].content.blocks.find(b => b.deepDiveLinks);
    assert.equal(blocAvecRenvoi.deepDiveLinks[0].targetId, 'm1-dd-a');
    console.log('PASS  4/13 pages préfixées par module ; renvois de blocs et de pages remappés.');

    // ── 5. CYCLE INTER-MODULES coupé ──────────────────────────────────────────────────────────
    // On fabrique un cycle qui ne peut exister qu'APRÈS assemblage : m1-dd-b renvoie vers m2-dd-a,
    // qui renvoie vers m2-dd-b, qui renvoie vers m1-dd-a, qui renvoie vers m1-dd-b.
    const cyc = [forgerModule(1), forgerModule(2)];
    cyc[0].doc.deepDives[1].paragraphs = [{ text: 'Vers le module 2.', deepDiveLinks: [{ text: 'module 2', targetId: 'dd-a' }] }];
    const c = await assembler(cyc, forgerPlan(2));
    assert.ok(c.ok, c.erreur);
    const chaine = {};
    c.r.doc.deepDives.forEach(p => { chaine[p.id] = p.paragraphs.flatMap(x => typeof x === 'string' ? [] : (x.deepDiveLinks || []).map(l => l.targetId)); });
    const vus = new Set(); let cur = 'm1-dd-a'; let boucle = false;
    while (cur && chaine[cur] && chaine[cur].length) {
      if (vus.has(cur)) { boucle = true; break; }
      vus.add(cur); cur = chaine[cur][0];
    }
    assert.equal(boucle, false, 'aucun cycle ne doit subsister après assemblage : ' + JSON.stringify(chaine));
    console.log('PASS  5/13 cycle inter-modules : coupé par le rejeu du filet à trois couleurs.');

    // ── 6. VALIDATION AJV du document ET du relevé ────────────────────────────────────────────
    const vDoc = await valider('clinicalDocument', a.r.doc);
    assert.equal(vDoc.skipped, false, 'AJV doit être actif');
    assert.equal(vDoc.valid, true, 'document assemblé invalide : ' + vDoc.errors.join(' | '));
    const vSnap = await valider('sourceSnapshot', a.r.snapshot);
    assert.equal(vSnap.valid, true, 'relevé de sources invalide : ' + vSnap.errors.join(' | '));
    console.log('PASS  6/13 document et relevé de sources : valides au schéma réel.');

    // ── 7. IDEMPOTENCE — deux assemblages identiques ──────────────────────────────────────────
    const b1 = await assembler(trois, forgerPlan(3));
    const b2 = await assembler(trois, forgerPlan(3));
    assert.deepEqual(b1.r.doc, b2.r.doc, 'deux assemblages du même jeu doivent être identiques');
    assert.deepEqual(b1.r.snapshot, b2.r.snapshot);
    console.log('PASS  7/13 deux assemblages du même jeu : documents rigoureusement identiques.');

    // ── 8. LE PUZZLE — remplacer un module et réassembler ─────────────────────────────────────
    const m2bis = forgerModule(2, { cards: 3 });
    const remplace = await assembler([trois[0], m2bis, trois[2]], forgerPlan(3));
    const direct = await assembler([forgerModule(1), forgerModule(2, { cards: 3 }), forgerModule(3)], forgerPlan(3));
    assert.deepEqual(remplace.r.doc, direct.r.doc,
      'remplacer le module 2 puis réassembler doit donner EXACTEMENT le document d\'un assemblage direct');
    assert.deepEqual(remplace.r.snapshot, direct.r.snapshot);
    console.log('PASS  8/13 module remplacé puis réassemblé : identique à un assemblage direct.');

    // ── 9. DOUZE MODULES ──────────────────────────────────────────────────────────────────────
    const douze = Array.from({ length: 12 }, (_, i) => forgerModule(i + 1, { cards: 10, passages: ['commun', 'p' + (i + 1)] }));
    const gros = await assembler(douze, forgerPlan(12));
    assert.ok(gros.ok, gros.erreur);
    assert.equal(gros.r.doc.blocks.length, 12 + 120, '12 en-têtes + 120 diapositives');
    assert.equal(gros.r.snapshot.entries.length, 13, 'commun + 12 propres');
    assert.equal(gros.r.doc.modules.length, 12);
    const vGros = await valider('clinicalDocument', gros.r.doc);
    assert.equal(vGros.valid, true, 'document de 132 diapositives invalide : ' + vGros.errors.join(' | '));
    console.log('PASS  9/13 12 modules : 132 diapositives, 13 entrées, document valide.');

    // ── 10. MODULE INVALIDE — nommé dans l'erreur ─────────────────────────────────────────────
    const casse = [forgerModule(1), { id: 'm2', doc: { blocks: [] }, snapshot: { entries: [] } }];
    const e1 = await assembler(casse, forgerPlan(2));
    assert.equal(e1.ok, false);
    assert.match(e1.erreur, /m2/, 'l\'erreur doit NOMMER le module fautif : ' + e1.erreur);
    const e2 = await assembler(trois, forgerPlan(3), { ids: { documentId: 'x', versionId: 'y', createdAt: 'z' } });
    assert.equal(e2.ok, false);
    assert.match(e2.erreur, /requestId/, 'un identifiant volatil manquant doit être refusé, jamais tiré au sort');
    console.log('PASS 10/13 module invalide nommé ; identifiant injecté manquant refusé.');

    // ── 11. ASSEMBLAGE PARTIEL annoncé ────────────────────────────────────────────────────────
    const partiel = await assembler(trois, forgerPlan(3), { ids: IDS, skip: ['m2'] });
    assert.ok(partiel.ok, partiel.erreur);
    assert.equal(partiel.r.doc.modules.length, 2);
    assert.deepEqual(partiel.r.rapport.modulesOmis.map(o => o.id), ['m2']);
    assert.deepEqual(partiel.r.rapport.modulesAssembles, ['m1', 'm3']);
    const vPartiel = await valider('clinicalDocument', partiel.r.doc);
    assert.equal(vPartiel.valid, true, 'assemblage partiel invalide : ' + vPartiel.errors.join(' | '));
    console.log('PASS 11/13 assemblage partiel : module omis annoncé dans le rapport, document valide.');

    // ── 12. CONTRÔLE QUALITÉ RÉEL sur le document assemblé ────────────────────────────────────
    // adocValidateClinicalDocument RECALCULE le sha256 de chaque passage depuis exactText : c'est
    // le seul contrôle qui dirait qu'un texte et son condensat ont divergé pendant l'assemblage.
    const qc = await page.evaluate(async ([d, s]) => {
      const r = await window.adocValidateClinicalDocument(d, s);
      return JSON.parse(JSON.stringify(r));
    }, [a.r.doc, a.r.snapshot]);
    assert.ok(qc, 'le contrôle qualité doit rendre un résultat');
    assert.equal(qc.exportAllowed !== false, true,
      'aucun blocage qualité ne doit apparaître sur un cours assemblé : ' + JSON.stringify(qc).slice(0, 400));
    console.log('PASS 12/13 contrôle qualité réel (condensats recalculés) : aucun blocage.');

    // ── 13. adocConvertDeepDives est-elle IDEMPOTENTE ? ───────────────────────────────────────
    // L'assembleur la REJOUE sur des pages déjà converties. Si elle ne l'était pas, un réassemblage
    // dégraderait le résultat à chaque tour — et le puzzle ne tiendrait pas.
    const idem = await page.evaluate(dd => {
      const un = window.adocConvertDeepDives(dd);
      const deux = window.adocConvertDeepDives(JSON.parse(JSON.stringify(un)));
      const trois = window.adocConvertDeepDives(JSON.parse(JSON.stringify(deux)));
      return { un, deux, trois };
    }, a.r.doc.deepDives);
    assert.deepEqual(idem.deux, idem.un, 'rejouer la conversion sur une forme déjà convertie doit être neutre');
    assert.deepEqual(idem.trois, idem.deux, 'et le rester au troisième tour');
    console.log('PASS 13/13 adocConvertDeepDives : idempotente sur une forme déjà convertie.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('\nPASS verify-assemblage-cours — 13/13.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
