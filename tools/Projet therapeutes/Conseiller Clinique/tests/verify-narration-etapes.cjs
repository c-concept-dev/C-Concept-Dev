// NARRATION PAR ÉTAPE (lot 1a) — la règle d'étape, la réorganisation, et l'absence des exports.
//
// CE QUE CE TEST ÉPROUVE, ET CE QU'IL NE PEUT PAS ÉPROUVER. Trois des quatre gestes demandés —
// déplacer un bloc d'une carte à une autre, le supprimer, le dupliquer — N'EXISTENT PAS dans
// l'éditeur aujourd'hui : il n'y a ni bouton Supprimer ni bouton Dupliquer pour un bloc, et le
// glisser-déposer est restreint aux frères directs du même conteneur DOM (point 5 du CDC,
// « jamais un bloc d'un autre conteneur »). Les éprouver par l'interface serait donc impossible.
// Ils sont éprouvés ici sur la DONNÉE, par la mutation exacte que chacun de ces gestes
// produirait — ce qui fixe l'invariant le jour où ils arriveront, au lieu de le supposer.
// Le réordonnancement, lui, existe : il est éprouvé par la mutation que fait réellement le
// glisser-déposer (deux splice sur le MÊME tableau, adocWsSetupBlockEditing).
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-narration-etapes.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, open } = require('./presentation-edit-fixtures.cjs');

const SENTINELLE = 'SENTINELLE-NARRATION-QUI-NE-DOIT-JAMAIS-SORTIR';

const bloc = (id, texte) => ({ id, type: 'paragraph', content: { text: texte }, citationIds: [], validation: {} });
const carte = (id, titre, blocs) => ({ id, type: 'card',
  content: { title: titre, imageRef: null, imageAlt: null, blocks: blocs },
  citationIds: [], validation: {} });

// Quatre tailles de carte, dont le cas à ZÉRO bloc : ce n'est pas une hypothèse, c'est ce que
// construit adocAssembleCourse pour la diapositive de titre d'un module sans notions clés.
function documentQuatreTailles() {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'Fixtures/fixture-carrousel-type.json'), 'utf8'));
  base.documentKind = 'presentation';
  base.citations = [];
  base.title = 'Présentation à quatre tailles de carte';
  base.blocks = [
    carte('slide-01', 'Titre du module', []),
    carte('slide-02', 'Une seule idée', [bloc('paragraph-01', 'Une idée.')]),
    carte('slide-03', 'Deux temps', [bloc('paragraph-02', 'Premier temps.'), bloc('paragraph-03', 'Second temps.')]),
    carte('slide-04', 'Quatre temps', [bloc('paragraph-04', 'Un.'), bloc('paragraph-05', 'Deux.'),
                                       bloc('paragraph-06', 'Trois.'), bloc('paragraph-07', 'Quatre.')]),
  ];
  return base;
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  let n = 0;
  const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentStepList === 'function');
    const doc = documentQuatreTailles();

    // ── 1. La règle d'étape, sur 0, 1, 2 et 4 blocs ───────────────────────────────────────────
    const etapes = await page.evaluate((d) => window.adocPresentStepList(d), doc);
    assert.deepEqual(etapes.map((e) => e.stepId),
      ['slide-01', 'paragraph-01', 'paragraph-02', 'paragraph-03',
       'paragraph-04', 'paragraph-05', 'paragraph-06', 'paragraph-07'],
      'une carte à 0 bloc donne une étape portée par la CARTE ; une carte à 1 bloc, une étape portée par le BLOC ; au-delà, une par bloc');
    assert.deepEqual(etapes.map((e) => e.rang + '/' + e.surRang),
      ['1/1', '1/1', '1/2', '2/2', '1/4', '2/4', '3/4', '4/4'], 'rangs et totaux');
    pass('règle d\'étape sur des cartes à 0, 1, 2 et 4 blocs : 8 étapes, identifiants attendus.');

    // ── 2. La règle de DONNÉE concorde avec la règle de RENDU ─────────────────────────────────
    // adocPresentApplyReveal compte les blocs RENDUS, adocPresentStepList les blocs de DONNÉES.
    // Rien ne garantit a priori que les deux comptes coïncident : on le mesure.
    const rendus = await page.evaluate(async (d) => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: d.sourceSnapshotId, entries: [] }, null);
      const bac = document.createElement('div');
      bac.innerHTML = r.html;
      return Array.from(bac.querySelectorAll('.adoc-sc-card')).map(function (c) {
        return Array.from(c.children).filter(function (e) { return e.classList.contains('adoc-sc-block'); }).length;
      });
    }, doc);
    assert.deepEqual(rendus, [0, 1, 2, 4], 'le rendu doit produire autant de blocs que la donnée en porte : ' + JSON.stringify(rendus));
    const parRendu = rendus.map((k) => (k <= 1 ? 1 : k));
    const parDonnee = [0, 1, 2, 3].map((i) => etapes.filter((e) => e.cardId === doc.blocks[i].id).length);
    assert.deepEqual(parDonnee, parRendu, 'la règle de donnée et la règle de rendu doivent donner le même nombre d\'étapes');
    pass('blocs rendus et blocs de donnée concordent : mêmes nombres d\'étapes par carte.');

    // ── 3. Écriture, lecture, retrait par chaîne vide ─────────────────────────────────────────
    const ecriture = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', '  Vous posez la question, puis vous attendez.  ');
      const relu = window.adocNarrationRead(doc, 'paragraph-02');
      const deuxiemeFois = window.adocNarrationWrite(doc, 'paragraph-02', 'Vous posez la question, puis vous attendez.');
      window.adocNarrationWrite(doc, 'paragraph-02', '');
      return { relu, deuxiemeFois, apresVide: doc.narration, lectureApres: window.adocNarrationRead(doc, 'paragraph-02') };
    }, doc);
    assert.equal(ecriture.relu, 'Vous posez la question, puis vous attendez.', 'le texte est rangé sans ses espaces de bord');
    assert.equal(ecriture.deuxiemeFois, false, 'réécrire le même texte ne doit pas marquer le document modifié');
    assert.equal(ecriture.apresVide, undefined, 'une narration vidée retire l\'entrée, et la dernière retire le champ');
    assert.equal(ecriture.lectureApres, '', 'relecture après retrait');
    pass('écriture, relecture, et retrait d\'une narration vidée.');

    // ── 4. RÉORDONNANCEMENT dans une carte — le geste qui existe ───────────────────────────────
    const reordonne = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-04', 'Premier temps parlé.');
      window.adocNarrationWrite(doc, 'paragraph-07', 'Dernier temps parlé.');
      // La mutation EXACTE du glisser-déposer : deux splice sur le MÊME tableau.
      const freres = doc.blocks[3].content.blocks;
      const bloc = freres[0];
      freres.splice(0, 1);
      freres.splice(3, 0, bloc);
      return { ordre: freres.map(function (b) { return b.id; }),
               p04: window.adocNarrationRead(doc, 'paragraph-04'),
               p07: window.adocNarrationRead(doc, 'paragraph-07'),
               purgees: window.adocNarrationPurge(doc),
               etapes: window.adocPresentStepList(doc).filter(function (e) { return e.cardId === 'slide-04'; }).map(function (e) { return e.stepId; }) };
    }, doc);
    assert.deepEqual(reordonne.ordre, ['paragraph-05', 'paragraph-06', 'paragraph-07', 'paragraph-04'], 'ordre après déplacement');
    assert.equal(reordonne.p04, 'Premier temps parlé.', 'la narration suit le bloc déplacé dans sa carte');
    assert.equal(reordonne.p07, 'Dernier temps parlé.', 'la narration des autres blocs ne bouge pas');
    assert.deepEqual(reordonne.purgees, [], 'un réordonnancement ne rend AUCUNE narration orpheline');
    assert.deepEqual(reordonne.etapes, ['paragraph-05', 'paragraph-06', 'paragraph-07', 'paragraph-04'], 'les étapes suivent le nouvel ordre');
    pass('réordonnancement dans une carte : la narration suit le bloc, rien n\'est orphelin.');

    // ── 5. DÉPLACEMENT d'un bloc d'une carte à une autre ──────────────────────────────────────
    // Geste inexistant aujourd'hui ; c'est précisément pourquoi l'invariant doit être fixé ici.
    const deplace = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', 'Ce que je dis sur ce bloc, où qu\'il aille.');
      const source = doc.blocks[2].content.blocks;     // slide-03, deux blocs
      const cible = doc.blocks[3].content.blocks;      // slide-04, quatre blocs
      cible.push(source.splice(0, 1)[0]);              // paragraph-02 change de carte
      return { lecture: window.adocNarrationRead(doc, 'paragraph-02'),
               purgees: window.adocNarrationPurge(doc),
               carteDeLEtape: (window.adocPresentStepList(doc).find(function (e) { return e.stepId === 'paragraph-02'; }) || {}).cardId };
    }, doc);
    assert.equal(deplace.lecture, 'Ce que je dis sur ce bloc, où qu\'il aille.', 'la narration suit le bloc d\'une carte à l\'autre');
    assert.deepEqual(deplace.purgees, [], 'un déplacement entre cartes ne rend AUCUNE narration orpheline');
    assert.equal(deplace.carteDeLEtape, 'slide-04', 'l\'étape est désormais rattachée à la carte d\'arrivée');
    pass('déplacement d\'un bloc entre deux cartes : la narration le suit, rien n\'est perdu.');

    // ── 6. SUPPRESSION — la purge retire exactement l'orpheline, et le dit ─────────────────────
    const supprime = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', 'Narration du bloc supprimé.');
      window.adocNarrationWrite(doc, 'paragraph-03', 'Narration du bloc gardé.');
      doc.blocks[2].content.blocks.splice(0, 1);       // paragraph-02 disparaît
      const purgees = window.adocNarrationPurge(doc);
      return { purgees, restante: window.adocNarrationRead(doc, 'paragraph-03'),
               disparue: window.adocNarrationRead(doc, 'paragraph-02'), nb: (doc.narration || []).length };
    }, doc);
    assert.deepEqual(supprime.purgees, ['paragraph-02'], 'la purge nomme l\'étape retirée');
    assert.equal(supprime.disparue, '', 'la narration de l\'étape supprimée ne survit pas');
    assert.equal(supprime.restante, 'Narration du bloc gardé.', 'les autres narrations sont intactes');
    assert.equal(supprime.nb, 1, 'une seule narration subsiste');
    pass('suppression d\'un bloc : la purge retire son unique narration et la nomme.');

    // ── 7. DUPLICATION — la copie est une étape NEUVE, sans narration ─────────────────────────
    // Choix à acter par Christophe : dupliquer un bloc ne recopie PAS sa narration. Deux étapes
    // porteraient sinon les mêmes mots sans qu'on l'ait demandé.
    const duplique = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', 'Narration de l\'original.');
      const freres = doc.blocks[2].content.blocks;
      const copie = JSON.parse(JSON.stringify(freres[0]));
      copie.id = 'paragraph-99';                        // ce que fait adocNextBlockId : un id NEUF
      freres.splice(1, 0, copie);
      return { original: window.adocNarrationRead(doc, 'paragraph-02'),
               copie: window.adocNarrationRead(doc, 'paragraph-99'),
               purgees: window.adocNarrationPurge(doc) };
    }, doc);
    assert.equal(duplique.original, 'Narration de l\'original.', 'l\'original garde sa narration');
    assert.equal(duplique.copie, '', 'la copie commence sans narration');
    assert.deepEqual(duplique.purgees, [], 'dupliquer ne rend rien orphelin');
    pass('duplication d\'un bloc : la copie est une étape neuve, l\'original garde la sienne.');

    // ── 8. ZÉRO À UN BLOC — le seul changement d'identifiant d'étape que la règle provoque ─────
    const insertion = await page.evaluate(async (d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'slide-01', 'Ce que je dis sur la diapositive de titre.');
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['t'] = { name: doc.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, blockEditing: true, export: true, qualityControlledExport: true },
        _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: doc.sourceSnapshotId, entries: [] } };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 't' });
      await window.adocOpenWorkspace('t');
      window._adocBlockEditState = Object.assign({}, window._adocBlockEditState,
        { storeKey: 't', blockId: 'root:card-title:slide-01' });
      const ok = await window.adocConfirmBlockInsert('after', 'paragraph');
      const vivant = window._adocArtifacts['t']._adocStructuredDoc;
      const nouveau = vivant.blocks[0].content.blocks[0];
      return { ok: ok, insere: !!nouveau, nouvelId: nouveau && nouveau.id,
               surLeBloc: nouveau ? window.adocNarrationRead(vivant, nouveau.id) : null,
               surLaCarte: window.adocNarrationRead(vivant, 'slide-01'),
               purgees: window.adocNarrationPurge(vivant) };
    }, doc);
    assert.equal(insertion.ok, true, 'l\'insertion réelle doit aboutir : ' + JSON.stringify(insertion));
    assert.equal(insertion.insere, true, 'un bloc est bien entré dans la diapositive de titre');
    assert.equal(insertion.surLeBloc, 'Ce que je dis sur la diapositive de titre.',
      'la narration portée par la carte passe sur le bloc devenu l\'étape unique');
    assert.equal(insertion.surLaCarte, '', 'elle ne reste pas en double sur l\'identifiant de la carte');
    assert.deepEqual(insertion.purgees, [], 'et surtout : la purge ne l\'efface pas');
    pass('insertion d\'un premier bloc dans une carte vide : la narration est reportée, pas perdue.');

    // ── 9. ÉCRITURE EN LOT — jamais d'écrasement sans demande explicite ────────────────────────
    const lot = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', 'Écrit à la main.');
      const sans = window.adocNarrationApply(doc, [
        { stepId: 'paragraph-02', text: 'Produit automatiquement.' },
        { stepId: 'paragraph-03', text: 'Produit automatiquement aussi.' }]);
      const apresSans = window.adocNarrationRead(doc, 'paragraph-02');
      const avec = window.adocNarrationApply(doc, [{ stepId: 'paragraph-02', text: 'Produit automatiquement.' }], { remplacer: true });
      return { sans, apresSans, avec, apresAvec: window.adocNarrationRead(doc, 'paragraph-02'),
               nouvelle: window.adocNarrationRead(doc, 'paragraph-03') };
    }, doc);
    assert.deepEqual(lot.sans.refusees, ['paragraph-02'], 'une narration déjà écrite est refusée, et nommée');
    assert.deepEqual(lot.sans.ecrites, ['paragraph-03'], 'une étape vide est servie normalement');
    assert.equal(lot.apresSans, 'Écrit à la main.', 'le texte écrit à la main n\'a pas bougé');
    assert.deepEqual(lot.avec.ecrites, ['paragraph-02'], 'avec remplacer:true, l\'écrasement est permis');
    assert.equal(lot.apresAvec, 'Produit automatiquement.', 'et il a bien eu lieu');
    assert.equal(lot.nouvelle, 'Produit automatiquement aussi.', 'la narration ajoutée est là');
    pass('écriture en lot : jamais d\'écrasement sans `remplacer`, et les refus sont nommés.');

    // ── 10. Mots et durée indicative ──────────────────────────────────────────────────────────
    const compte = await page.evaluate(() => [
      window.adocNarrationCount(''),
      window.adocNarrationCount('Un seul mot ici fait six.'),
      window.adocNarrationCount(new Array(50).fill('mot').join(' ')),
    ]);
    assert.deepEqual(compte[0], { mots: 0, secondes: 0 }, 'texte vide');
    assert.equal(compte[1].mots, 6, 'six mots');
    assert.deepEqual(compte[2], { mots: 50, secondes: 20 }, '50 mots à 2,5 mots/s font 20 s');
    pass('compte de mots et durée indicative (2,5 mots par seconde).');

    // ── 11. ALLER-RETOUR D'ENREGISTREMENT, par le vrai point de sérialisation ──────────────────
    const allerRetour = await page.evaluate((d) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', 'Narration qui doit survivre à l\'enregistrement.');
      window.adocNarrationWrite(doc, 'bloc-qui-n-existe-plus', 'Orpheline.');
      const art = { _adocGenerationEngine: 'structured', _adocStructuredDoc: doc,
                    _adocStructuredSnapshot: { sourceSnapshotId: doc.sourceSnapshotId, entries: [] } };
      const contenu = window.adocBuildClinicalDocumentContent(art);
      const relu = JSON.parse(JSON.stringify(contenu));          // ce qui part vraiment sur le réseau
      const valide = window.adocValidateSchema('clinicalDocument', relu.clinicalDocument);
      return { narration: relu.clinicalDocument.narration, valide: !!valide.valid, skipped: !!valide.skipped,
               erreurs: (valide.errors || []).slice(0, 3).map(String) };
    }, doc);
    assert.equal(allerRetour.skipped, false, 'AJV doit être actif');
    assert.equal(allerRetour.valide, true, 'le document enregistré doit valider : ' + allerRetour.erreurs.join(' | '));
    assert.deepEqual(allerRetour.narration, [{ stepId: 'paragraph-02', text: 'Narration qui doit survivre à l\'enregistrement.' }],
      'la narration est enregistrée avec le document, et l\'orpheline purgée au passage');
    pass('aller-retour d\'enregistrement : narration persistée, orpheline purgée, document valide.');

    // ── 12. ABSENTE DE TOUS LES EXPORTS ───────────────────────────────────────────────────────
    const sorties = await page.evaluate(async ({ d, s }) => {
      const doc = JSON.parse(JSON.stringify(d));
      window.adocNarrationWrite(doc, 'paragraph-02', s);
      window.adocNarrationWrite(doc, 'slide-01', s + '-BIS');
      const snap = { sourceSnapshotId: doc.sourceSnapshotId, entries: [] };
      const rendu = await window.adocRenderClinicalDocument(doc, snap, null);
      const exportHtml = await window.adocExportClinicalDocumentHTML(doc, snap, null);
      const autonome = await window.adocBuildStandalonePresentationHTML(doc, {});
      // Le document embarqué dans l'export autonome, relu tel qu'il y figure.
      const m = /window\.ADOC_EXPORT_DOC = (\{[\s\S]*?\});/.exec(autonome);
      return {
        apercu: rendu.html, exportHtml: (exportHtml && exportHtml.html) || '', autonome: autonome,
        embarqueTrouve: !!m,
        embarqueANarration: m ? Object.prototype.hasOwnProperty.call(JSON.parse(m[1]), 'narration') : null,
        embarqueADesBlocs: m ? (JSON.parse(m[1]).blocks || []).length : null,
        docIntact: (doc.narration || []).length,
      };
    }, { d: doc, s: SENTINELLE });
    assert.equal(sorties.apercu.includes(SENTINELLE), false, 'la narration ne doit pas entrer dans l\'aperçu');
    assert.equal(sorties.exportHtml.includes(SENTINELLE), false, 'ni dans l\'export HTML');
    assert.equal(sorties.autonome.includes(SENTINELLE), false, 'ni dans l\'export autonome');
    assert.equal(sorties.embarqueTrouve, true, 'le document embarqué doit être retrouvé dans l\'export autonome');
    assert.equal(sorties.embarqueANarration, false, 'le document embarqué ne porte PAS la clé narration');
    assert.equal(sorties.embarqueADesBlocs, 4, 'et il porte bien tout le reste : ses 4 diapositives');
    assert.equal(sorties.docIntact, 2, 'le document de travail, lui, garde ses deux narrations');
    pass('narration absente de l\'aperçu, de l\'export HTML et de l\'export autonome — le reste intact.');

    // ── 13. Un seul point d'embarquement, et il passe par le retrait ──────────────────────────
    // Garde-fou de source contre un SECOND point d'embarquement ajouté plus tard : les exports
    // JPEG/PDF/PPTX passent par le HTML rendu, déjà vérifié ci-dessus, et ne sérialisent pas le
    // document. Si un jour l'un d'eux le faisait, cette assertion tomberait.
    const src = fs.readFileSync(path.join(ROOT, 'studio-clinique-core.js'), 'utf8');
    assert.equal(src.includes("'window.ADOC_EXPORT_DOC = ' + JSON.stringify(adocDocumentPourExport(doc)) + ';'"), true,
      'le seul embarquement du document doit passer par adocDocumentPourExport');
    const embarquements = (src.match(/JSON\.stringify\(doc\)/g) || []).length;
    assert.equal(embarquements, 1, 'un seul JSON.stringify(doc) doit subsister, et c\'est l\'instantané d\'annulation : ' + embarquements);
    assert.equal(/const oldDoc = JSON\.parse\(JSON\.stringify\(doc\)\)/.test(src), true,
      'et c\'est bien celui-là');
    pass('un seul point d\'embarquement du document, et il retire la narration.');

    console.log('\nPASS verify-narration-etapes — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
