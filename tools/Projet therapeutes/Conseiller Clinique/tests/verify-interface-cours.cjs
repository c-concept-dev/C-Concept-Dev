// Cours en modules — L'INTERFACE, éprouvée sur le DOM RÉEL, avec un générateur simulé.
//
// Ce que ce test protège : l'écran de plan est le SEUL moment où l'utilisatrice peut corriger le
// découpage avant de dépenser une douzaine d'appels réels. S'il annonce un nombre de diapositives
// que la génération ne tient pas, s'il perd le curseur à chaque frappe, ou si supprimer un module
// ne redistribue pas la durée, il vaut moins que rien : il donne confiance à tort.
//
// Le rendu et l'enregistrement traversés ici sont les VRAIS (adocRenderClinicalDocument,
// adocDeliverStructuredFicheArtifact) — seule la génération est simulée.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-interface-cours.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const sha256 = t => 'sha256:' + crypto.createHash('sha256').update(t).digest('hex');

// Module forgé RÉEL : schéma complet, condensat calculé, ponctuation finale — sinon le contrôle
// qualité le refuserait et le test mesurerait autre chose que ce qu'il croit.
function forgerDoc(id, titre, diapos) {
  const texte = 'Texte du passage ' + id;
  const cards = Array.from({ length: diapos }, (_, c) => ({
    id: 'card-' + String(c + 1).padStart(2, '0'), type: 'card', citationIds: [], validation: {},
    content: { title: titre + ' — diapositive ' + (c + 1), imageRef: null, imageAlt: null,
      blocks: [{ id: 'paragraph-' + (c + 1), type: 'paragraph',
        content: { text: 'Contenu de ' + titre + ', diapositive ' + (c + 1) + '.' },
        citationIds: ['citation-1'],
        validation: { citationLinks: [{ citationId: 'citation-1', claimText: 'Affirmation.', claimSupport: 'pending' }] } }] },
  }));
  return {
    doc: { schemaVersion: 1, documentId: id, versionId: id + '-v1', previousVersionId: null,
      requestId: 'r-' + id, sourceSnapshotId: 's-' + id, createdAt: '2026-01-01T00:00:00Z',
      language: 'fr', status: 'draft', title: titre, purpose: 'Objectif du module.',
      audience: 'clinicien', documentKind: 'presentation', renderManifestId: 'manifest-default-001',
      derivedFrom: null, blocks: cards,
      citations: [{ citationId: 'citation-1', sourceSnapshotEntryId: 'entry-1', displayLabel: 'Livre ' + id + ', p. 10' }],
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
        accessibility: 'pending', humanClinicalReview: 'required' } },
    snapshot: { sourceSnapshotId: 's-' + id, entries: [{ sourceSnapshotEntryId: 'entry-1',
      sourceType: 'library', sourceId: 'livre-' + id, passageId: 'p-' + id, exactText: texte,
      contentChecksum: sha256(texte), book: 'Livre ' + id, author: 'Auteur',
      locator: { page: 10, section: null }, retrievedAt: '2026-01-01T00:00:00Z' }] },
  };
}

const PLAN = {
  courseId: 'cours-test', titre: 'Les troubles de l\'attachement', dureeMinutes: 120,
  modules: ['Bases théoriques', 'Styles d\'attachement', 'Le couple', 'Interventions']
    .map((t, i) => ({ id: 'm' + (i + 1), titre: t, objectifs: ['objectif'], notionsCles: ['notion ' + (i + 1)],
      dureeMinutes: 30, slideCount: 12, requeteBibliotheque: t + ' notion ' + (i + 1) })),
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message + '\n' + (e.stack || '')));
    const reseau = [];
    await page.route('**/*', route => {
      const u = route.request().url();
      if (/^file:/.test(u)) return route.continue();
      reseau.push(route.request().method() + ' ' + u); return route.abort();
    });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocRenderCoursePlanCard === 'function');
    // L'écran de connexion intercepte les clics tant qu'il est là (cause de cinq suites mortes
    // par le passé) : le retirer, comme le font les autres suites d'interface.
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      // #cc-workspace reste FERMÉ : ouvert, il recouvre le fil de conversation et intercepte tous
      // les clics. Ces écrans-ci vivent dans le fil, pas dans l'espace de travail du document.
      // #assistdoc-screen est en display:none jusqu'à ce que l'écran d'accueil le révèle (.active,
      // cf. CSS de studio-clinique.html). Sans cela le fil de conversation a une hauteur nulle et
      // AUCUN clic n'aboutit — c'est la cause de cinq suites mortes par le passé.
      document.getElementById('assistdoc-screen')?.classList.add('active');
    });

    // ── 1. QUAND L'OFFRE EST POSÉE — et quand elle ne l'est pas ──────────────────────────────
    const offre = (plan, kind, presOpts) => page.evaluate(([p, k, o]) => {
      window.adocClarityDocumentKind = k || null;
      const b = window.adocCourseOfferBudget(Object.assign({ presentation_options: o || null }, p));
      return b ? { brute: b.brute, max: b.max, cible: b.cible } : null;
    }, [plan, kind, presOpts]);
    assert.deepEqual(await offre({ duree_minutes: 45, documentKind: 'presentation' }),
      { brute: 30, max: 20, cible: 20 }, '45 min → 30 diapositives : au-dessus de 20, l\'offre EST posée');
    const o180 = await offre({ duree_minutes: 180, documentKind: 'presentation' });
    assert.deepEqual(o180, { brute: 120, max: 20, cible: 20 }, '3 h → 120 diapositives demandées, 20 tenables');
    assert.equal(await offre({ duree_minutes: 25, documentKind: 'presentation' }), null,
      '25 min → 17 diapositives : ça tient, aucune offre, aucun écran de trop');
    assert.equal(await offre({ duree_minutes: 180, documentKind: 'fiche' }), null,
      'une fiche de 3 h n\'est pas une présentation : jamais d\'offre de cours');
    assert.equal(await offre({ duree_minutes: 180 }), null,
      'aucun type explicite : jamais d\'offre sur une simple supposition du classificateur');
    const oExplicite = await offre({ duree_minutes: 30, documentKind: 'presentation' }, null, { slideCount: 60 });
    assert.deepEqual(oExplicite, { brute: 60, max: 20, cible: 20 },
      'un nombre de diapositives demandé explicitement fait foi sur la durée');
    console.log('PASS 1/9  offre posée seulement quand une présentation dépasse 20 diapositives, jamais par supposition.');

    // ── 2. CALCUL PUR : répartition et totaux annoncés ───────────────────────────────────────
    const calc = (plan) => page.evaluate(p => {
      const r = window.adocCoursePlanRecompute(p);
      return { plan: r, resume: window.adocCoursePlanSummary(r) };
    }, plan);
    const c4 = await calc(PLAN);
    assert.deepEqual(c4.plan.modules.map(m => m.dureeMinutes), [30, 30, 30, 30]);
    assert.deepEqual(c4.plan.modules.map(m => m.slideCount), [12, 12, 12, 12], '30 min → 20 bridé à 12');
    assert.equal(c4.resume.diapositives, 4 * 13,
      'le total annoncé COMPTE la diapositive de titre de chaque module — sinon on annonce 48 et on livre 52');
    assert.equal(c4.resume.dureeMinutes, 120);
    const c2 = await calc(Object.assign({}, PLAN, { modules: PLAN.modules.slice(0, 2) }));
    assert.deepEqual(c2.plan.modules.map(m => m.dureeMinutes), [60, 60],
      'deux modules pour 2 h → 60 min chacun : la durée se répartit sur les modules RESTANTS');
    assert.deepEqual(c2.plan.modules.map(m => m.slideCount), [12, 12]);
    const cId = await calc(PLAN);
    assert.deepEqual(cId.plan.modules.map(m => m.id), ['m1', 'm2', 'm3', 'm4'],
      'les identifiants survivent au recalcul — l\'assembleur apparie sur eux');
    console.log('PASS 2/9  calcul : durée répartie sur les modules restants, total annoncé = ce qui sera livré.');

    // ── 3. L'ÉCRAN DE PLAN, DANS LE DOM ──────────────────────────────────────────────────────
    await page.evaluate(p => window.adocRenderCoursePlanCard(p, { plan: {}, workerUrl: '' }), PLAN);
    const carte = page.locator('#cc-course-plan-card');
    assert.equal(await carte.count(), 1);
    assert.equal(await carte.locator('.cc-course-module').count(), 4);
    const intro = await carte.locator('.cc-clarity-understood').innerText();
    assert.match(intro, /4 modules/);
    assert.match(intro, /120 minutes/);
    assert.match(intro, /52 diapositives/, 'le nombre annoncé est celui du cours livré');
    assert.match(intro, /estimation, pas une mesure/i, 'la durée de génération est donnée comme une estimation');
    assert.doesNotMatch(intro, /€|\$|euro|coût|prix|crédit/i, 'jamais d\'argent à l\'écran');
    assert.match(await carte.innerText(), /Générer les 4 modules/);
    console.log('PASS 3/9  écran de plan : 4 lignes, totaux réels, estimation annoncée comme telle, aucune mention d\'argent.');

    // ── 4. RENOMMER sans perdre le curseur ───────────────────────────────────────────────────
    const champ = carte.locator('.cc-course-titre').first();
    await champ.click();
    await champ.fill('');
    await champ.type('Fondations');
    assert.equal(await page.evaluate(() => document.activeElement.className.includes('cc-course-titre')), true,
      'le champ garde le focus pendant la frappe — une carte redessinée à chaque touche le perdrait');
    assert.equal(await page.evaluate(() => window._adocCourseUI.plan.modules[0].titre), 'Fondations');
    assert.equal(await page.evaluate(() => window._adocCourseUI.plan.modules[0].requeteBibliotheque),
      'Fondations notion 1', 'la recherche bibliothèque suit le titre — sinon le module part hors sujet');
    console.log('PASS 4/9  renommage : focus et curseur conservés, requête bibliothèque suivie.');

    // ── 5. DÉPLACER, SUPPRIMER, CHANGER LA DURÉE ─────────────────────────────────────────────
    await carte.locator('.cc-course-module[data-module="m2"] button[aria-label^="Monter"]').click();
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.plan.modules.map(m => m.id)),
      ['m2', 'm1', 'm3', 'm4'], 'un déplacement échange deux modules, sans renuméroter les identifiants');
    assert.equal(await page.locator('#cc-course-plan-card .cc-course-module').first().locator('input').inputValue(),
      'Styles d\'attachement', 'l\'affichage suit le déplacement');
    assert.equal(await page.locator('#cc-course-plan-card .cc-course-module').first()
      .locator('button[aria-label^="Monter"]').isDisabled(), true, 'le premier ne peut pas monter');
    await page.locator('#cc-course-plan-card .cc-course-module[data-module="m3"] button[aria-label^="Supprimer"]').click();
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.plan.modules.map(m => m.id)), ['m2', 'm1', 'm4']);
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.plan.modules.map(m => m.dureeMinutes)),
      [40, 40, 40], 'après suppression, les 120 minutes se répartissent sur 3 modules');
    await page.locator('#cc-course-plan-card input[type="number"]').fill('60');
    await page.locator('#cc-course-plan-card input[type="number"]').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.plan.modules.map(m => m.dureeMinutes)),
      [20, 20, 20], 'changer la durée totale redescend sur chaque module');
    assert.match(await page.locator('#cc-course-plan-card .cc-clarity-understood').innerText(), /39 diapositives/);
    // Plancher à 2 : on retire un module de plus, le troisième bouton doit être verrouillé.
    await page.locator('#cc-course-plan-card .cc-course-module[data-module="m4"] button[aria-label^="Supprimer"]').click();
    assert.equal(await page.locator('#cc-course-plan-card .cc-course-module button[aria-label^="Supprimer"]')
      .first().isDisabled(), true, 'à 2 modules, la suppression est verrouillée — un cours d\'un module n\'en est pas un');
    console.log('PASS 5/9  retouches : déplacement, suppression avec redistribution, durée totale, plancher à 2 modules.');

    // ── 6. GÉNÉRATION : progression, enregistrement RÉEL de chaque module, assemblage ─────────
    await page.evaluate(d => { window.__docs = d; }, {
      m1: forgerDoc('m1', 'Bases théoriques', 12), m2: forgerDoc('m2', 'Styles d\'attachement', 12),
      m3: forgerDoc('m3', 'Le couple', 12), m4: forgerDoc('m4', 'Interventions', 12),
    });
    await page.evaluate(() => {
      // Le scénario est LU À CHAQUE APPEL depuis window.__scenario, jamais capturé dans la
      // fermeture : la reprise d'un module (test 8) réutilise ce même générateur, et un scénario
      // figé ferait échouer indéfiniment le module qu'on vient justement de vouloir rejouer —
      // le test tournait alors sans fin au lieu d'échouer.
      window.__scenario = {};
      // Toute attente porte une échéance : un écran qui n'arrive jamais doit faire ÉCHOUER le test,
      // jamais le faire tourner en boucle.
      window.__attendre = (condition, quoi, ms) => new Promise((resolve, reject) => {
        const fin = Date.now() + (ms || 20000);
        const t = setInterval(() => {
          if (condition()) { clearInterval(t); resolve(true); }
          else if (Date.now() > fin) { clearInterval(t); reject(new Error('attente dépassée : ' + quoi)); }
        }, 50);
      });
      window.__lancerUI = async (plan, scenario) => {
        window.__scenario = scenario || {};
        document.getElementById('cc-course-recap-card')?.remove();
        document.getElementById('cc-course-progress-card')?.remove();
        const etapes = [];
        window.adocRenderCoursePlanCard(plan, {
          plan: { approach_filter: 'attachment' }, workerUrl: '',
          generateur: async (p, i) => {
            const m = p.modules[i];
            etapes.push(document.querySelectorAll('#cc-course-progress-card li[data-etat="ok"]').length);
            const cas = window.__scenario[m.id] || {};
            if (cas.jeter) throw new Error(cas.jeter);
            const f = window.__docs[m.id];
            return { doc: JSON.parse(JSON.stringify(f.doc)), snapshot: JSON.parse(JSON.stringify(f.snapshot)),
                     stopReason: cas.stopReason || 'tool_use' };
          },
        });
        window.__etapes = etapes;
        window.adocCoursePlanLaunch();
        return window.__attendre(() => document.getElementById('cc-course-recap-card'),
          'le récapitulatif du cours', 60000);
      };
    });
    const avant = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length);
    await page.evaluate(p => window.__lancerUI(p, {}), PLAN);
    const apres = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length);
    assert.equal(apres - avant, 5, '4 modules enregistrés au fil de l\'eau + 1 cours assemblé');
    // Le nom LU par l'utilisatrice est celui de l'entrée de la barre latérale, jamais `art.name`
    // (qui est le nom de FICHIER, débarrassé de ses accents et tronqué à 60 caractères).
    // La barre latérale présente la création la plus RÉCENTE en premier : on remet dans l'ordre de
    // production pour lire la séquence, sans toucher à cette convention de l'application.
    const noms = await page.evaluate(() => Array.from(document.querySelectorAll('#adoc-outputs-list .adoc-output-name'))
      .map(e => e.textContent).slice(0, 5).reverse());
    assert.deepEqual(noms.slice(0, 4), [
      'Cours — Les troubles de l\'attachement · Module 1 sur 4 · Bases théoriques',
      'Cours — Les troubles de l\'attachement · Module 2 sur 4 · Styles d\'attachement',
      'Cours — Les troubles de l\'attachement · Module 3 sur 4 · Le couple',
      'Cours — Les troubles de l\'attachement · Module 4 sur 4 · Interventions'],
      'chaque pièce porte son rang et son titre dans « Mes créations »');
    assert.equal(noms[4], 'Cours — Les troubles de l\'attachement (assemblé)',
      'le cours assemblé se distingue de ses pièces');
    // « sur » et non « / » : le nom de FICHIER téléchargé dérive du même libellé en supprimant tout
    // caractère non alphanumérique — « Module 1/12 » y devenait « Module-112 », illisible.
    const fichiers = await page.evaluate(() => Object.values(window._adocArtifacts).map(a => a.name).slice(-5));
    assert.match(fichiers[0], /Module-1-sur-4/, 'le rang reste lisible dans le nom de fichier');
    assert.ok(fichiers.every(n => !/Module-14|Module-24|Module-34|Module-44/.test(n)),
      'jamais un rang collé au total dans le nom de fichier');
    assert.deepEqual(await page.evaluate(() => window.__etapes), [0, 1, 2, 3],
      'la progression avance À MESURE : chaque module voit les précédents déjà cochés');
    const recap = page.locator('#cc-course-recap-card');
    assert.match(await recap.innerText(), /4 modules assemblés · 52 diapositives/);
    assert.equal(await recap.locator('button').count(), 0, 'tout a réussi : aucun bouton « Régénérer »');
    assert.equal(await page.evaluate(() => window._adocCourseUI.assemble.qc.blocking.length), 0,
      'le cours assemblé passe le contrôle qualité RÉEL, pas un contrôle simulé');
    console.log('PASS 6/9  génération : progression au fil de l\'eau, 4 modules + le cours enregistrés, QC réel vert.');

    // ── 7. UN MODULE EN ÉCHEC : le cours est assemblé sans lui, et le dit ─────────────────────
    await page.evaluate(p => window.__lancerUI(p, { m3: { jeter: 'HTTP 500 sur le module 3' } }), PLAN);
    const recap2 = page.locator('#cc-course-recap-card');
    const txt2 = await recap2.innerText();
    assert.match(txt2, /3 modules assemblés/);
    assert.match(txt2, /le cours assemblé est INCOMPLET/i, 'l\'assemblage partiel est ANNONCÉ, jamais silencieux');
    assert.match(txt2, /HTTP 500 sur le module 3/, 'la cause réelle est à l\'écran, pas seulement en console');
    assert.equal(await recap2.locator('li[data-statut="a-regenerer"] button').count(), 1);
    assert.equal(await recap2.locator('li[data-statut="ok"] button').count(), 0,
      'jamais de bouton « Régénérer » sur un module qui a réussi');
    console.log('PASS 7/9  échec partiel : cours assemblé sans le module manquant, incomplétude et cause affichées.');

    // ── 8. REPRENDRE UNE PIÈCE : elle reprend SA place ────────────────────────────────────────
    await page.evaluate(() => {
      // La panne est levée AVANT de rejouer : reprendre un module avec la même panne en place ne
      // vérifierait rien d'autre que le fait qu'il échoue encore.
      window.__scenario = {};
      window.adocCourseRegenerateModule('m3');
      window.__reprisFini = window.__attendre(() => {
        const c = document.getElementById('cc-course-recap-card');
        return c && !c.querySelector('li[data-statut="a-regenerer"]');
      }, 'le récapitulatif après reprise du module 3', 60000);
    });
    await page.evaluate(() => window.__reprisFini);
    const recap3 = page.locator('#cc-course-recap-card');
    assert.match(await recap3.innerText(), /4 modules assemblés · 52 diapositives/);
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.resultats.modules.map(m => m.id)),
      ['m1', 'm2', 'm3', 'm4'], 'le module rejoué reprend SA place — jamais ajouté en fin de cours');
    assert.deepEqual(await page.evaluate(() => window._adocCourseUI.resultats.rapport.skip), [],
      'le rapport est RECALCULÉ, jamais rafistolé : plus rien à omettre');
    assert.equal(await page.evaluate(() => window._adocCourseUI.resultats.rapport.genereEnEntier), true);
    assert.equal(await recap3.locator('button').count(), 0);
    console.log('PASS 8/9  reprise d\'une pièce : place conservée, rapport recalculé, cours complet à nouveau.');

    // ── 9. ABANDON AVANT TOUT APPEL ──────────────────────────────────────────────────────────
    await page.evaluate(p => window.adocRenderCoursePlanCard(p, { plan: {}, workerUrl: '' }), PLAN);
    const artefactsAvant = await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length);
    await page.locator('#cc-course-plan-card button:has-text("Annuler")').click();
    assert.equal(await page.locator('#cc-course-plan-card').count(), 0);
    assert.equal(await page.evaluate(() => window._adocCourseUI), null);
    assert.equal(await page.evaluate(() => Object.keys(window._adocArtifacts || {}).length), artefactsAvant,
      'annuler avant de lancer ne produit rien — et ne coûte rien');
    console.log('PASS 9/9  abandon : plan fermé, état effacé, aucun artefact créé.');

    const generation = reseau.filter(u => /\/d1-query|\/vector-search|POST https:\/\/[^/]*workers\.dev\/?$|anthropic/.test(u));
    assert.deepEqual(generation, [], 'appels de génération alors que le générateur est simulé : ' + generation.join(', '));
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nTOUT PASSE — 9/9, DOM réel, rendu et enregistrement réels, génération simulée.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
