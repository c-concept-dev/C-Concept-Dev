// Contrôle qualité — l'heuristique de troncature ne doit plus jeter un document COMPLET.
//
// Mesuré : une présentation de 60 minutes, terminée par le modèle lui-même (stop_reason
// « tool_use »), 34 726 caractères, aucune coupure — rejetée pour un seul callout ne finissant pas
// par un point. L'utilisatrice a reçu à la place un document de l'ancien moteur, sans savoir
// pourquoi. La règle est lexicale : elle ne peut pas distinguer un texte coupé d'un texte qui
// finit sans point.
//
// Trois remèdes, éprouvés ici sans aucun appel :
//   — quand la génération s'est terminée d'elle-même, le signalement AVERTIT au lieu de BLOQUER ;
//   — le message CITE les 60 derniers caractères, sans quoi on ne peut ni corriger la règle ni lui
//     donner tort ;
//   — le prompt demande une ponctuation finale, pour que le cas ne se présente plus.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-qc-troncature.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const carte = (id, blocs) => ({ id, type: 'card',
  content: { title: 'Diapositive', imageRef: null, imageAlt: null, blocks: blocs },
  citationIds: [], validation: {} });
const DOC = texte => ({
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'T', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [carte('card-01', [
    { id: 'paragraph-01', type: 'paragraph', content: { text: 'Un paragraphe complet.' }, citationIds: [], validation: {} },
    { id: 'callout-36', type: 'callout', content: { text: texte, visualRole: 'info' }, citationIds: [], validation: {} },
  ])],
});
// Le cas réel : un callout bref qui se termine sans ponctuation. 60 caractères significatifs.
const SANS_POINT = 'Repère clinique : ne jamais conclure sur un seul entretien';

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocRenderClinicalDocument === 'function');
    const qc = (doc, opts) => page.evaluate(async ([d, o]) => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] }, null, o);
      return { blocking: r.qc.blocking, nonBlocking: r.qc.nonBlocking, exportAllowed: r.qc.exportAllowed };
    }, [doc, opts]);

    // ── 1. GÉNÉRATION COMPLÈTE : on avertit, on ne bloque pas ──────────────────────────────────
    const complet = await qc(DOC(SANS_POINT), { genereEnEntier: true });
    assert.equal(complet.blocking.length, 0,
      'un document COMPLET ne doit plus être bloqué pour une ponctuation manquante : ' + complet.blocking.join(' | '));
    assert.equal(complet.exportAllowed, true, 'et il doit rester exportable');
    assert.equal(complet.nonBlocking.filter(m => /callout-36/.test(m)).length, 1,
      'mais le défaut doit être SIGNALÉ, jamais passé sous silence');
    console.log('PASS 1/6  génération complète : avertissement, aucun blocage, document exportable.');

    // ── 2. LE MESSAGE CITE LES 60 DERNIERS CARACTÈRES ─────────────────────────────────────────
    const avert = complet.nonBlocking.find(m => /callout-36/.test(m));
    assert.match(avert, /fin du texte : « …/, 'le message doit citer la fin réelle du texte');
    assert.ok(avert.includes(SANS_POINT.slice(-60)),
      'les 60 derniers caractères doivent y figurer tels quels : ' + avert);
    assert.match(avert, /génération complète : signalé, non bloquant/);
    console.log('PASS 2/6  le message cite les 60 derniers caractères et dit pourquoi il ne bloque pas.');

    // ── 3. SANS CETTE INFORMATION : comportement d'avant, inchangé ────────────────────────────
    // Un document rouvert, importé ou testé n'a pas de stop_reason : la règle doit continuer de
    // bloquer, sans quoi une vraie troncature passerait inaperçue.
    const inconnu = await qc(DOC(SANS_POINT), undefined);
    assert.equal(inconnu.blocking.filter(m => /callout-36/.test(m)).length, 1,
      'sans stop_reason connu, le blocage doit rester : une vraie troncature ne doit jamais passer');
    assert.equal(inconnu.exportAllowed, false);
    assert.match(inconnu.blocking.find(m => /callout-36/.test(m)), /contenu apparemment tronqué/);
    console.log('PASS 3/6  stop_reason inconnu : blocage maintenu, comportement d\'avant.');

    // ── 4. GÉNÉRATION COUPÉE : blocage, évidemment ────────────────────────────────────────────
    const coupe = await qc(DOC(SANS_POINT), { genereEnEntier: false });
    assert.equal(coupe.blocking.filter(m => /callout-36/.test(m)).length, 1,
      'une génération coupée doit bloquer : là, le texte EST probablement tronqué');
    console.log('PASS 4/6  génération coupée (max_tokens) : blocage conservé.');

    // ── 5. UN TEXTE CORRECTEMENT PONCTUÉ ne déclenche rien ────────────────────────────────────
    for (const bon of ['Une phrase complète.', 'Une question ?', 'Un appel !', 'Une suite…', 'Il a dit « oui »']) {
      const r = await qc(DOC(bon), { genereEnEntier: true });
      assert.equal(r.blocking.length + r.nonBlocking.filter(m => /callout-36/.test(m)).length, 0,
        'aucun signalement attendu pour « ' + bon + ' »');
    }
    console.log('PASS 5/6  textes correctement ponctués : aucun signalement, dans les cinq formes.');

    // ── 6. LA CONSIGNE EST BIEN DANS LE PROMPT ────────────────────────────────────────────────
    // Pour que le cas ne se présente tout simplement plus.
    const source = fs.readFileSync(path.join(__dirname, '..', 'studio-clinique-core.js'), 'utf8');
    const debutBudget = source.indexOf('  function adocPresentationSlideBudget(plan) {');
    // eslint-disable-next-line no-eval
    eval(source.slice(debutBudget, source.indexOf('\n  }\n', debutBudget) + 4));
    const d = source.indexOf("      buildPromptSuffix: function(passagesListing, plan) {");
    // eslint-disable-next-line no-eval
    const profil = eval('({ ' + source.slice(d, source.indexOf("\n      },", d) + 8).trim().replace(/,$/, '') + ' })');
    const t = profil.buildPromptSuffix('(passages)', { duree_minutes: 30 });
    assert.match(t, /Termine CHAQUE paragraphe, callout et citation par une ponctuation finale/);
    assert.match(t, /Une formule brève ou un intitulé en portent une aussi/,
      'le cas qui a réellement bloqué — un intitulé bref — doit être nommé');
    console.log('PASS 6/6  le prompt demande une ponctuation finale, y compris sur les formules brèves.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('\nPASS verify-qc-troncature — 6/6.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
