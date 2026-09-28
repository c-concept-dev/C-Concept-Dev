// Cours en modules — l'ORCHESTRATEUR, éprouvé avec un générateur SIMULÉ : aucun appel au modèle.
//
// Ce que ce test protège, et qui ne se voit pas en lisant le code : l'enchaînement doit rester
// SÛR quand un module rate. Un module coupé à max_tokens, un module de 20 diapositives là où le
// plan en prévoyait 11, un module annulé en cours de route — aucun de ces cas ne doit se retrouver
// dans le cours assemblé, et aucun ne doit faire perdre les modules déjà réussis.
//
// C'est pour cela que le générateur est injectable : sans cela, chaque vérification ici coûterait
// un appel réel, et les cas d'échec seraient intestables (on ne sait pas provoquer une coupure).
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-orchestrateur-cours.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const sha256 = t => 'sha256:' + crypto.createHash('sha256').update(t).digest('hex');

// Plan de cours forgé — la forme EXACTE que produit adocNormalizeCoursePlan.
const forgerPlan = n => ({
  courseId: 'c1', titre: 'Les troubles de l\'attachement', dureeMinutes: n * 20,
  modules: Array.from({ length: n }, (_, i) => ({
    id: 'm' + (i + 1), titre: 'Module ' + (i + 1), objectifs: ['objectif ' + (i + 1)],
    notionsCles: ['notion ' + (i + 1)], dureeMinutes: 20, slideCount: 13,
    requeteBibliotheque: 'attachement notion' + (i + 1),
  })),
});

// Module forgé RÉEL (schéma complet, condensat calculé) — pour l'assemblage partiel.
function forgerDoc(n, diapos) {
  const texte = 'Texte du passage p' + n;
  const entries = [{ sourceSnapshotEntryId: 'entry-1', sourceType: 'library', sourceId: 'livre-p' + n,
    passageId: 'p' + n, exactText: texte, contentChecksum: sha256(texte), book: 'Livre p' + n,
    author: 'Auteur', locator: { page: 10, section: null }, retrievedAt: '2026-01-01T00:00:00Z' }];
  const citations = [{ citationId: 'citation-1', sourceSnapshotEntryId: 'entry-1', displayLabel: 'Livre p' + n + ', p. 10' }];
  const cards = Array.from({ length: diapos }, (_, c) => ({
    id: 'card-' + String(c + 1).padStart(2, '0'), type: 'card', citationIds: [], validation: {},
    content: { title: 'Module ' + n + ' — diapositive ' + (c + 1), imageRef: null, imageAlt: null,
      blocks: [{ id: 'paragraph-' + (c + 1), type: 'paragraph',
        content: { text: 'Module ' + n + ', diapositive ' + (c + 1) + '.' }, citationIds: ['citation-1'],
        validation: { citationLinks: [{ citationId: 'citation-1', claimText: 'Affirmation.', claimSupport: 'pending' }] } }] },
  }));
  return { doc: { schemaVersion: 1, documentId: 'm' + n, versionId: 'm' + n + '-v1', previousVersionId: null,
      requestId: 'r' + n, sourceSnapshotId: 's' + n, createdAt: '2026-01-01T00:00:00Z', language: 'fr',
      status: 'draft', title: 'Module ' + n, purpose: 'Objectif', audience: 'clinicien',
      documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
      blocks: cards, citations,
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
        accessibility: 'pending', humanClinicalReview: 'required' } },
    snapshot: { sourceSnapshotId: 's' + n, entries } };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    // Tout le réseau est coupé et relevé. Le point qui compte : le générateur simulé doit être le
    // SEUL chemin emprunté — si l'orchestrateur appelait quand même la recherche ou le modèle, le
    // test serait une illusion. Les requêtes d'ouverture de la page (bibliothèques externes,
    // statistiques de bibliothèque) sont relevées à part : elles sont antérieures à tout lancement.
    const reseau = [];
    await page.route('**/*', route => {
      const u = route.request().url();
      if (/^file:/.test(u)) return route.continue();
      reseau.push(route.request().method() + ' ' + u); return route.abort();
    });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocRunCourseGeneration === 'function');

    // ── Le banc : générateur simulé piloté par un scénario sérialisable ───────────────────────
    await page.evaluate(() => {
      window.__lancer = async (plan, scenario, extra) => {
        const ex = extra || {};
        const journal = [];
        const ctrl = new AbortController();
        let appels = 0;
        const generateur = async (p, i, ctx) => {
          appels++;
          journal.push({ appel: appels, index: i, essai: ctx.essai, titre: p.modules[i].titre,
            planOrigineVue: ctx.planOrigine ? ctx.planOrigine.approach_filter : null });
          if (ex.annulerApresAppel === appels) ctrl.abort();
          const s = scenario[p.modules[i].id] || {};
          const cas = Array.isArray(s.essais) ? (s.essais[ctx.essai - 1] || s.essais[s.essais.length - 1]) : s;
          if (cas.jeter) throw new Error(cas.jeter);
          const diapos = typeof cas.diapos === 'number' ? cas.diapos : p.modules[i].slideCount;
          const reel = ex.docsReels ? window.__docsReels[p.modules[i].id] : null;
          return { doc: reel ? reel.doc : { documentId: p.modules[i].id, title: p.modules[i].titre,
                     blocks: Array.from({ length: diapos }, (_, k) => ({ id: 'card-' + k })) },
                   snapshot: reel ? reel.snapshot : { sourceSnapshotId: 's', entries: [] },
                   stopReason: cas.stopReason === null ? null : (cas.stopReason || 'tool_use') };
        };
        const progression = [];
        // Le libellé de progression est relevé DANS LE DOM, pas seulement dans le rappel : c'est
        // ce que l'utilisatrice lit, et c'est écrasé à chaque module.
        const libelles = [];
        if (ex.typingId) {
          const h = document.createElement('div'); h.id = ex.typingId;
          h.innerHTML = '<span class="adoc-typing-label"></span>';
          document.body.appendChild(h);
          new MutationObserver(() => {
            const t = h.querySelector('.adoc-typing-label').textContent;
            if (t && libelles[libelles.length - 1] !== t) libelles.push(t);
          }).observe(h, { childList: true, subtree: true, characterData: true });
        }
        const r = await window.adocRunCourseGeneration(plan, {
          generateur, surProgression: e => progression.push(e), signal: ctrl.signal,
          typingId: ex.typingId, planOrigine: { approach_filter: 'attachment' },
        });
        window.__dernier = r;
        return { journal, progression, libelles, annule: r.annule, rapport: r.rapport,
          modules: r.modules.map(m => ({ id: m.id, statut: m.statut, nom: m.nom, essais: m.essais,
            diapositives: m.diapositives, erreur: m.erreur })) };
      };
    });
    const lancer = (plan, scenario, extra) => page.evaluate(([p, s, e]) => window.__lancer(p, s, e),
      [plan, scenario, extra || null]);

    // ── 1. SÉQUENCE NOMINALE : un module après l'autre, dans l'ordre ──────────────────────────
    const p3 = forgerPlan(3);
    const a = await lancer(p3, {}, { typingId: 'typ-a' });
    assert.deepEqual(a.journal.map(j => j.index), [0, 1, 2], 'les modules sont générés en séquence, dans l\'ordre du plan');
    assert.deepEqual(a.journal.map(j => j.essai), [1, 1, 1], 'aucune reprise quand tout passe');
    assert.deepEqual(a.modules.map(m => m.statut), ['ok', 'ok', 'ok']);
    assert.equal(a.rapport.reussis, 3);
    assert.deepEqual(a.rapport.skip, [], 'rien à omettre : l\'assemblage sera complet');
    assert.equal(a.rapport.genereEnEntier, true, 'tous arrêtés d\'eux-mêmes → le contrat qualité peut se détendre');
    assert.equal(a.annule, false);
    assert.deepEqual(a.journal.map(j => j.planOrigineVue), ['attachment', 'attachment', 'attachment'],
      'le filtre d\'approche du cours est transmis à CHAQUE module, pas seulement au premier');
    console.log('PASS 1/9  séquence nominale : ordre du plan, aucune reprise, rapport complet, filtre d\'approche transmis.');

    // ── 2. LIBELLÉS DE PROGRESSION — relevés dans le DOM ─────────────────────────────────────
    assert.deepEqual(a.libelles, ['Module 1 sur 3 — Module 1', 'Module 2 sur 3 — Module 2', 'Module 3 sur 3 — Module 3'],
      'le libellé affiché dit où l\'on en est, sur combien, et de quoi il s\'agit');
    assert.deepEqual(a.progression.filter(e => e.etat === 'en-cours').map(e => e.etiquette), a.libelles,
      'le rappel de progression et le DOM portent le MÊME texte — jamais deux vérités');
    console.log('PASS 2/9  progression : « Module k sur N — <titre> » écrit dans le DOM, identique au rappel.');

    // ── 3. NOMMAGE ───────────────────────────────────────────────────────────────────────────
    assert.deepEqual(a.modules.map(m => m.nom), [
      'Cours — Les troubles de l\'attachement · Module 1 sur 3 · Module 1',
      'Cours — Les troubles de l\'attachement · Module 2 sur 3 · Module 2',
      'Cours — Les troubles de l\'attachement · Module 3 sur 3 · Module 3']);
    // « sur » et non « / » : adocDeliverArtifact dérive le nom de FICHIER de ce même libellé en
    // retirant tout caractère non alphanumérique — « Module 1/12 » y devenait « Module-112 ».
    // Le slug est recalculé ici avec la MÊME expression que la fonction de livraison.
    const slug = n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    assert.match(slug(a.modules[0].nom), /Module-1-sur-3/, 'le rang reste lisible dans le nom de fichier');
    assert.doesNotMatch(slug(a.modules[0].nom), /Module-13/, 'jamais « Module-13 » pour un module 1 sur 3');
    assert.equal(await page.evaluate(p => window.adocCourseAssembledName(p), p3),
      'Cours — Les troubles de l\'attachement (assemblé)');
    console.log('PASS 3/9  nommage : rang, total et titre du module dans chaque nom ; le cours assemblé se distingue.');

    // ── 4. REPRISE : un échec passager, une seule nouvelle tentative, et ça passe ─────────────
    const b = await lancer(p3, { m2: { essais: [{ jeter: 'HTTP 529 surcharge' }, {}] } });
    assert.deepEqual(b.journal.map(j => [j.index, j.essai]), [[0, 1], [1, 1], [1, 2], [2, 1]],
      'seul le module fautif est rejoué — jamais le cours entier');
    assert.equal(b.modules[1].statut, 'ok');
    assert.equal(b.modules[1].essais, 2);
    assert.deepEqual(b.rapport.skip, []);
    console.log('PASS 4/9  reprise : le module fautif seul est rejoué, une fois, et le cours reste complet.');

    // ── 5. ÉCHEC DÉFINITIF : marqué « à régénérer », les autres conservés ─────────────────────
    const c = await lancer(p3, { m2: { jeter: 'HTTP 500' } });
    assert.equal(c.journal.filter(j => j.index === 1).length, 2, 'deux tentatives, pas trois : on ne s\'acharne pas');
    assert.equal(c.modules[1].statut, 'a-regenerer');
    assert.match(c.modules[1].erreur, /HTTP 500/, 'la cause réelle est conservée, pas remplacée par « échec »');
    assert.deepEqual(c.modules.map(m => m.statut), ['ok', 'a-regenerer', 'ok'],
      'un échec au milieu n\'emporte NI ce qui précède NI ce qui suit');
    assert.deepEqual(c.rapport.skip, ['m2']);
    assert.deepEqual(c.rapport.aRegenerer, ['m2']);
    assert.equal(c.rapport.reussis, 2);
    console.log('PASS 5/9  échec définitif : 2 tentatives, cause conservée, modules voisins intacts, m2 à omettre.');

    // ── 6. LE MODÈLE NE S'EST PAS ARRÊTÉ DE LUI-MÊME → document écarté ───────────────────────
    // C'est le garde-fou central : un document coupé à max_tokens est complet EN APPARENCE.
    const d = await lancer(p3, { m2: { stopReason: 'max_tokens' } });
    assert.equal(d.modules[1].statut, 'a-regenerer', 'stop_reason « max_tokens » n\'est jamais un demi-succès');
    assert.match(d.modules[1].erreur, /max_tokens/);
    assert.equal(d.rapport.genereEnEntier, true, 'les modules RETENUS se sont tous arrêtés d\'eux-mêmes');
    const d2 = await lancer(p3, { m1: { essais: [{ stopReason: 'max_tokens' }, { stopReason: 'max_tokens' }] } });
    assert.equal(d2.rapport.genereEnEntier, true);
    const d3 = await lancer(forgerPlan(1), { m1: { stopReason: null } });
    assert.equal(d3.rapport.genereEnEntier, false, 'aucun module retenu : le contrat qualité ne se détend pas');
    assert.match(d3.modules[0].erreur, /inconnu/, 'un stop_reason absent est nommé, pas deviné');
    console.log('PASS 6/9  arrêt non spontané : document écarté, jamais assemblé ; genereEnEntier ne se détend jamais à vide.');

    // ── 7. NOMBRE DE DIAPOSITIVES : ±2 toléré, au-delà refusé ────────────────────────────────
    const e1 = await lancer(forgerPlan(1), { m1: { diapos: 15 } });      // 13 + 2
    assert.equal(e1.modules[0].statut, 'ok', '±2 est toléré : le modèle n\'est pas une imprimante');
    assert.equal(e1.modules[0].diapositives, 15);
    const e2 = await lancer(forgerPlan(1), { m1: { diapos: 16 } });      // 13 + 3
    assert.equal(e2.modules[0].statut, 'a-regenerer');
    assert.match(e2.modules[0].erreur, /16 diapositives au lieu de 13/, 'le chiffre mesuré est dit, pas résumé');
    const e3 = await lancer(forgerPlan(1), { m1: { essais: [{ diapos: 25 }, { diapos: 12 }] } });
    assert.equal(e3.modules[0].statut, 'ok', 'un dépassement se rejoue : c\'est souvent transitoire');
    assert.equal(e3.modules[0].essais, 2);
    console.log('PASS 7/9  densité : ±2 toléré, au-delà rejoué puis refusé, avec le nombre réellement mesuré.');

    // ── 8. ANNULATION : les modules terminés sont CONSERVÉS ───────────────────────────────────
    const f = await lancer(forgerPlan(4), {}, { annulerApresAppel: 2, typingId: 'typ-f' });
    assert.equal(f.annule, true);
    assert.deepEqual(f.modules.map(m => m.statut), ['ok', 'ok'], 'les deux modules déjà produits sont gardés');
    assert.equal(f.journal.length, 2, 'aucun appel après l\'annulation — c\'est aussi ce qui évite de payer pour rien');
    assert.deepEqual(f.rapport.nonGeneres, ['m3', 'm4']);
    assert.deepEqual(f.rapport.skip, ['m3', 'm4'], 'l\'assemblage partiel des 2 premiers reste proposé');
    assert.deepEqual(f.rapport.annules, [], 'aucun module n\'a été interrompu EN COURS ici');
    const g = await lancer(forgerPlan(3), { m2: { jeter: 'coupé' } }, { annulerApresAppel: 2 });
    assert.equal(g.modules[1].statut, 'annule', 'un module interrompu est « annulé », pas « à régénérer » : la cause diffère');
    assert.deepEqual(g.rapport.annules, ['m2']);
    assert.deepEqual(g.rapport.aRegenerer, []);
    console.log('PASS 8/9  annulation : modules terminés conservés, aucun appel de plus, interruption distinguée d\'un échec.');

    // ── 9. ASSEMBLAGE PARTIEL RÉEL : le rapport de l'orchestrateur se passe tel quel ──────────
    await page.evaluate(d => { window.__docsReels = d; },
      { m1: forgerDoc(1, 13), m2: forgerDoc(2, 13), m3: forgerDoc(3, 13) });
    const h = await lancer(forgerPlan(3), { m2: { jeter: 'HTTP 500' } }, { docsReels: true });
    assert.deepEqual(h.rapport.skip, ['m2']);
    const asm = await page.evaluate(([p, skip]) => {
      const retenus = window.__dernier.modules.filter(m => m.statut === 'ok')
        .map(m => ({ id: m.id, doc: m.doc, snapshot: m.snapshot }));
      const r = window.adocAssembleCourse(retenus, p, { skip: skip, ids: { documentId: 'cours-1',
        versionId: 'cours-1-v1', createdAt: '2026-01-01T00:00:00Z', requestId: 'req-1' } });
      return { diapos: r.doc.blocks.length, modules: r.doc.modules.map(m => m.id),
               titres: r.doc.modules.map(m => m.title), entrees: r.snapshot.entries.length,
               rapport: r.rapport };
    }, [forgerPlan(3), h.rapport.skip]);
    // 2 × (1 diapositive de titre + 13) : la diapositive de titre est ajoutée par l'assembleur.
    assert.equal(asm.diapos, 28, '2 modules retenus seulement — le module manquant ne laisse pas de trou');
    assert.deepEqual(asm.modules, ['m1', 'm3'], 'le sommaire groupé ne mentionne pas le module absent');
    assert.deepEqual(asm.titres, ['Module 1', 'Module 3'], 'ce sont les titres du PLAN, pas une renumérotation');
    assert.equal(asm.rapport.modulesOmis.length, 1, 'l\'assemblage partiel est ANNONCÉ, jamais silencieux');
    assert.equal(asm.entrees, 2);
    console.log('PASS 9/9  assemblage partiel : le rapport de l\'orchestrateur s\'enchaîne tel quel sur l\'assembleur.');

    // Les points d'entrée de génération : la racine du Worker (modèle), la recherche structurée,
    // la recherche vectorielle. Aucun ne doit apparaître.
    const generation = reseau.filter(u => /\/d1-query|\/vector-search|\/hal-search|POST https:\/\/[^/]*workers\.dev\/?$|anthropic/.test(u));
    assert.deepEqual(generation, [], 'appels de génération alors que le générateur est simulé : ' + generation.join(', '));
    console.log('\n  Réseau relevé (ouverture de la page uniquement, tout coupé) :\n' +
      reseau.map(u => '    ' + u).join('\n'));
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nTOUT PASSE — 9/9, générateur simulé, aucun appel de génération.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
