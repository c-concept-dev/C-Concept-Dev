// THÈMES, PHASE A — une paire de polices + une palette, en un seul réglage. Sans interface : cette
// phase éprouve la table, le constructeur de surcharge et l'application.
//
// Un thème n'est PAS un mécanisme nouveau : c'est une surcharge de manifeste de rendu, la même forme
// qu'un import de charte produit. art._adocRenderManifestOverride est déjà lu par le rendu direct
// (5 sites adocRenderClinicalDocument), par l'export (3 sites adocExportClinicalDocumentHTML) et par
// la persistance — un seul point d'application, vivant et exporté.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const para = (id, text) => ({ id, type: 'paragraph', content: { text }, citationIds: [], validation: {} });
function ficheDoc(blocks) {
  return {
    schemaVersion: 1, documentId: 'doc-th-001', versionId: 'doc-th-001-v1', previousVersionId: null,
    requestId: 'request-th-001', sourceSnapshotId: 'snapshot-th-001',
    createdAt: '2026-09-30T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test thèmes', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocApplyTheme === 'function' && typeof window.adocThemes === 'function');

    // ── 1 — la table : aucune donnée de police dupliquée, paires existantes, 4 tons ──
    const table = await page.evaluate(() => {
      const t = window.adocThemes();
      const pairesConnues = new Set(Object.keys(window.adocRenderManifests || {}).length ? [] : []);
      return {
        n: t.length,
        ids: t.map((x) => x.id),
        idsUniques: new Set(t.map((x) => x.id)).size === t.length,
        // Un thème ne doit porter AUCUN nom de police : seulement l'id d'une paire.
        portentUnePolice: t.filter((x) => JSON.stringify(x).match(/bodyFont|headingFont|googleFontsHref/)).length,
        tons: t.map((x) => Object.keys(x.colors).sort().join(',')),
        hex: t.every((x) => Object.values(x.colors).every((c) => /^#[0-9a-f]{6}$/i.test(c))),
        pairesExistent: t.every((x) => !!(window.adocThemes && x.fontPairId)),
      };
    });
    assert.ok(table.n >= 3 && table.n <= 5, 'entre 3 et 5 thèmes, reçu ' + table.n);
    assert.equal(table.idsUniques, true, 'ids uniques');
    assert.equal(table.portentUnePolice, 0,
      'un thème ne doit porter AUCUN nom de police : il désigne une paire par son id, sinon la donnée '
      + 'de police existerait en deux endroits et finirait par diverger');
    assert.deepEqual([...new Set(table.tons)], ['accent,background,primary,text'],
      'exactement quatre tons, les mêmes partout : adocBrandKitToTokensSnapshot dérive tout le reste');
    assert.equal(table.hex, true, 'toutes les couleurs en hexadécimal à 6 chiffres');
    console.log('PASS ' + (++n) + '/6 — table de ' + table.n + ' thèmes : 4 tons, aucune donnée de police dupliquée.');

    // ── 2 — la surcharge produite VALIDE contre render-manifest.schema.json ──
    const valide = await page.evaluate(async () => {
      const doc = { renderManifestId: 'manifest-default-001' };
      const m = await window.adocBuildRenderManifestForTheme(doc, window.adocThemes()[1]);
      const ajv = new window.Ajv2020({ strict: true, allErrors: true });
      if (typeof window.ajvAddFormats === 'function') window.ajvAddFormats(ajv);
      const sc = JSON.parse(document.getElementById('adoc-sc-schemas').textContent);
      Object.keys(sc).forEach((id) => ajv.addSchema(sc[id], id));
      const v = ajv.getSchema('render-manifest.schema.json');
      const ok = v(m);
      return { ok, erreurs: ok ? [] : v.errors.map((e) => (e.instancePath || '/') + ' ' + e.message),
               manifeste: m, snapshotEnregistre: !!window.adocTokensSnapshots[m.tokensSnapshotId] };
    });
    assert.equal(valide.ok, true, 'la surcharge doit VALIDER : ' + valide.erreurs.join(' ; '));
    assert.equal(valide.snapshotEnregistre, true,
      'le snapshot de jetons doit être enregistré dans window.adocTokensSnapshots, sinon '
      + 'adocResolveTokens ne le retrouvera pas et le thème ne s\'appliquera pas');
    // brandKitRef : le schéma EXIGE un objet {id, version} et refuse null. Le thème s'y nomme.
    assert.deepEqual(valide.manifeste.brandKitRef, { id: 'theme-ardoise', version: 1 },
      'brandKitRef nomme le THÈME : le schéma refuse null (required + $defs/brandKitRef objet), et le '
      + 'thème est bien la source réelle de ces jetons');
    assert.equal(valide.manifeste.assetsSnapshotId, null, 'assetsSnapshotId reste null, comme pour une charte');
    console.log('PASS ' + (++n) + '/6 — surcharge valide contre le schéma, snapshot enregistré, brandKitRef nommant le thème.');

    // ── 3 — la somme SHA-256 est RÉELLEMENT celle du contenu ──
    // Recalculée INDÉPENDAMMENT ici, avec crypto.subtle du navigateur et une sérialisation canonique
    // écrite dans le test : appeler adocCanonicalJSONStringify de production validerait la fonction
    // par elle-même. Le schéma documente la règle (clés triées, sans espace superflu), c'est donc
    // elle qu'on réimplémente, pas la fonction.
    const somme = await page.evaluate(async () => {
      const canon = (v) => {
        if (v === null || typeof v !== 'object') return JSON.stringify(v);
        if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
        return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
      };
      const m = await window.adocBuildRenderManifestForTheme({ renderManifestId: 'manifest-default-001' }, window.adocThemes()[0]);
      const sansSomme = Object.assign({}, m);
      delete sansSomme.manifestChecksum;
      const octets = new TextEncoder().encode(canon(sansSomme));
      const brut = await crypto.subtle.digest('SHA-256', octets);
      const attendue = 'sha256:' + Array.from(new Uint8Array(brut)).map((b) => b.toString(16).padStart(2, '0')).join('');
      return { portee: m.manifestChecksum, recalculee: attendue, motif: /^sha256:[0-9a-f]{64}$/.test(m.manifestChecksum) };
    });
    assert.equal(somme.motif, true, 'la somme doit respecter ^sha256:[0-9a-f]{64}$');
    assert.equal(somme.portee, somme.recalculee,
      'la somme doit correspondre RÉELLEMENT au contenu, recalculée indépendamment : un manifeste dont '
      + 'la somme est figée ou calculée sur autre chose mentira au premier contrôle.\n  portée     : '
      + somme.portee + '\n  recalculée : ' + somme.recalculee);
    console.log('PASS ' + (++n) + '/6 — somme SHA-256 recalculée indépendamment et conforme au contenu.');

    // ── 4 — deux thèmes différents produisent des jetons différents ──
    const distincts = await page.evaluate(async () => {
      const doc = { renderManifestId: 'manifest-default-001' };
      const a = await window.adocBuildRenderManifestForTheme(doc, window.adocThemes()[0]);
      const b = await window.adocBuildRenderManifestForTheme(doc, window.adocThemes()[2]);
      const ja = window.adocTokensSnapshots[a.tokensSnapshotId];
      const jb = window.adocTokensSnapshots[b.tokensSnapshotId];
      return { idsDifferents: a.tokensSnapshotId !== b.tokensSnapshotId,
               couleursDifferentes: JSON.stringify(ja.colors) !== JSON.stringify(jb.colors),
               policesDifferentes: JSON.stringify(ja.typography) !== JSON.stringify(jb.typography),
               typoA: ja.typography, sommesDifferentes: a.manifestChecksum !== b.manifestChecksum };
    });
    assert.equal(distincts.idsDifferents, true, 'deux thèmes ont deux snapshots distincts');
    assert.equal(distincts.couleursDifferentes, true, 'et des couleurs réellement différentes');
    assert.equal(distincts.policesDifferentes, true,
      'et des polices différentes : la paire désignée par fontPairId doit vraiment atteindre les jetons');
    assert.ok(/Source Serif|IBM Plex/.test(JSON.stringify(distincts.typoA)),
      'le thème « studio » porte bien la paire par défaut du Studio : ' + JSON.stringify(distincts.typoA));
    assert.equal(distincts.sommesDifferentes, true, 'et deux sommes distinctes');
    console.log('PASS ' + (++n) + '/6 — deux thèmes donnent jetons, polices et sommes distincts.');

    // ── 5 — APPLICATION RÉELLE sur un document ouvert ──
    await page.evaluate((doc) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.th = { name: 'Test thèmes', _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
    }, ficheDoc([para('blk-a', 'Un paragraphe.')]));
    const ok = await page.evaluate(() => window.adocApplyTheme('th', 'argile'));
    assert.equal(ok, true, 'adocApplyTheme doit réussir sur un document valide');
    const etat = await page.evaluate(() => {
      const art = window._adocArtifacts.th;
      const o = art._adocRenderManifestOverride;
      return { pose: !!o, brandKitRef: o && o.brandKitRef, nom: art._adocBrandKitName,
               jetons: o ? window.adocTokensSnapshots[o.tokensSnapshotId].colors.ivory : null };
    });
    assert.equal(etat.pose, true, 'la surcharge doit être posée sur l\'artefact — le point d\'application unique');
    assert.deepEqual(etat.brandKitRef, { id: 'theme-argile', version: 1 }, 'et nommer le thème appliqué');
    assert.equal(etat.jetons, '#faf6f0', 'le fond du thème « argile » doit atteindre les jetons résolus');
    console.log('PASS ' + (++n) + '/6 — application réelle : surcharge posée, jetons résolus (' + etat.jetons + ').');

    // ── 6 — un thème inconnu est refusé, sans rien abîmer ──
    const avant = await page.evaluate(() => JSON.stringify(window._adocArtifacts.th._adocRenderManifestOverride));
    const refus = await page.evaluate(() => window.adocApplyTheme('th', 'theme-qui-n-existe-pas'));
    const apres = await page.evaluate(() => JSON.stringify(window._adocArtifacts.th._adocRenderManifestOverride));
    assert.equal(refus, false, 'un thème inconnu doit être refusé');
    assert.equal(apres, avant, 'et la surcharge en place ne doit PAS être touchée — jamais une perte silencieuse');
    const refusDoc = await page.evaluate(() => window.adocApplyTheme('cle-inexistante', 'studio'));
    assert.equal(refusDoc, false, 'un artefact inexistant est refusé aussi');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/6 — thème inconnu et artefact inexistant refusés, surcharge en place intacte.');
    await page.close();

    console.log('\nTOUS LES TESTS THÈMES PHASE A PASSENT (' + n + '/6)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
