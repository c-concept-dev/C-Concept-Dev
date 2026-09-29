// Plan de cours — la partie PURE, éprouvée sans le moindre appel.
//
// C'est ici que vivent toutes les bornes, et c'est ici que se joue la robustesse : le modèle peut
// répondre trop de modules, trop peu, sans titre, sans notions, ou dans un autre vocabulaire. Rien
// de tout cela ne doit produire un plan bancal que l'utilisatrice validerait sans le voir.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-plan-cours.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const mod = (t, extra) => Object.assign({ titre: t, objectifs: ['o'], notionsCles: ['n'] }, extra || {});

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocNormalizeCoursePlan === 'function');
    const compte = d => page.evaluate(x => window.adocCourseModuleCount(x), d);
    const norm = (brut, demande, duree) => page.evaluate(([b, de, du]) => {
      try { return { ok: true, p: window.adocNormalizeCoursePlan(b, de, du, 'c1') }; }
      catch (e) { return { ok: false, erreur: e.message }; }
    }, [brut, demande, duree]);

    // ── 1. NOMBRE DE MODULES : ~15 min chacun, borné 2..12 ────────────────────────────────────
    assert.equal(await compte(180), 12, '3 h → 12 modules');
    assert.equal(await compte(60), 4);
    assert.equal(await compte(30), 2);
    assert.equal(await compte(10), 2, 'plancher à 2, jamais 1 ni 0');
    assert.equal(await compte(600), 12, 'plafond à 12 : au-delà ce sont plusieurs séances');
    assert.equal(await compte(null), 2, 'durée inconnue : plancher, jamais une exception');
    assert.equal(await compte(0), 2);
    console.log('PASS 1/11  nombre de modules : ~15 min chacun, borné 2..12, robuste à l\'absence de durée.');

    // ── 2. CAS NOMINAL ────────────────────────────────────────────────────────────────────────
    const a = await norm([mod('Attachement'), mod('Schémas précoces'), mod('Cycles du couple')], 'Cours', 180);
    assert.ok(a.ok, a.erreur);
    assert.deepEqual(a.p.modules.map(m => m.id), ['m1', 'm2', 'm3'], 'identifiants séquentiels');
    assert.equal(a.p.courseId, 'c1');
    assert.equal(a.p.dureeMinutes, 180);
    console.log('PASS 2/11  cas nominal : identifiants séquentiels, durée totale conservée.');

    // ── 3. LA DURÉE SE RÉPARTIT SUR LES MODULES RETENUS ───────────────────────────────────────
    // 3 modules pour 3 h font 60 min chacun, jamais 15 : sinon le plan annonce 45 min pour un
    // cours de 180, et l'utilisatrice valide un découpage qui ne tient pas.
    assert.deepEqual(a.p.modules.map(m => m.dureeMinutes), [60, 60, 60]);
    console.log('PASS 3/11  la durée se répartit sur les modules RÉELLEMENT retenus.');

    // ── 4. slideCount BORNÉ 10..12 ────────────────────────────────────────────────────────────
    a.p.modules.forEach(m => assert.ok(m.slideCount >= 10 && m.slideCount <= 12, 'slideCount hors bornes : ' + m.slideCount));
    const court = await norm([mod('A'), mod('B')], 'Cours', 20);
    assert.ok(court.p.modules.every(m => m.slideCount >= 10), 'même un module court garde un corps : 10 minimum');
    console.log('PASS 4/11  slideCount borné 10..12 dans tous les cas.');

    // ── 5. TROP DE MODULES : tronqué au plafond ───────────────────────────────────────────────
    const vingt = await norm(Array.from({ length: 20 }, (_, i) => mod('M' + (i + 1))), 'Cours', 180);
    assert.equal(vingt.p.modules.length, 12, 'jamais plus de 12, quoi que réponde le modèle');
    console.log('PASS 5/11  20 modules proposés : ramenés à 12.');

    // ── 6. RÉPONSES ABÎMÉES ───────────────────────────────────────────────────────────────────
    const sales = await norm([mod('Bon'), { titre: '   ' }, { objectifs: ['x'] }, mod('Autre')], 'Cours', 60);
    assert.deepEqual(sales.p.modules.map(m => m.titre), ['Bon', 'Autre'], 'un module sans titre est écarté, jamais rattrapé');
    const vide = await norm([{ objectifs: [] }], 'Cours', 60);
    assert.equal(vide.ok, false);
    assert.match(vide.erreur, /aucun module exploitable/, 'un plan vide doit être refusé NOMMÉMENT');
    console.log('PASS 6/11  modules sans titre écartés ; plan entièrement vide refusé nommément.');

    // ── 7. VOCABULAIRE ALTERNATIF et enveloppe {modules:[…]} ──────────────────────────────────
    const alt = await norm({ titre: 'Mon cours', modules: [{ title: 'En anglais', notions: ['n1', 'n2'], objectives: ['o1'] }] }, 'Cours', 30);
    assert.equal(alt.p.modules[0].titre, 'En anglais', 'title comme titre');
    assert.deepEqual(alt.p.modules[0].notionsCles, ['n1', 'n2'], 'notions comme notionsCles');
    assert.deepEqual(alt.p.modules[0].objectifs, ['o1']);
    assert.equal(alt.p.titre, 'Mon cours', 'le titre du plan est repris s\'il existe');
    console.log('PASS 7/11  vocabulaire alternatif et enveloppe {modules:[…]} acceptés.');

    // ── 8. REQUÊTE DE BIBLIOTHÈQUE toujours renseignée ────────────────────────────────────────
    // Sans elle, la recherche du module part de rien et le module sort creux.
    const sansRequete = await norm([mod('Attachement', { notionsCles: ['sécure', 'évitant'] })], 'Cours', 30);
    assert.equal(sansRequete.p.modules[0].requeteBibliotheque, 'Attachement sécure évitant',
      'à défaut, la requête se construit du titre et des notions clés');
    const avecRequete = await norm([mod('A', { requeteBibliotheque: 'termes choisis' })], 'Cours', 30);
    assert.equal(avecRequete.p.modules[0].requeteBibliotheque, 'termes choisis', 'celle du modèle l\'emporte');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 8/11  requête de bibliothèque toujours renseignée, celle du modèle prioritaire.');

    // ── 9. TITRES : le rang recopié et la demande recopiée, tous deux mesurés sur un plan RÉEL ──
    // Campagne du 29/09/2026, plan de 3 h pour un Master 2 : les 12 modules ont été rendus sous la
    // forme « Module 1 : … », et le cours n'avait aucun titre — la DEMANDE entière (180 caractères)
    // s'est retrouvée en titre, puis recopiée dans le nom des 12 pièces.
    const tRang = t => page.evaluate(x => window.adocStripCourseRank(x), t);
    assert.equal(await tRang('Module 1 : Définition et historique'), 'Définition et historique');
    assert.equal(await tRang('Module 12 - Pronostic'), 'Pronostic');
    assert.equal(await tRang('Partie n°3. Les styles'), 'Les styles');
    assert.equal(await tRang('Séance 2 — Évaluation'), 'Évaluation');
    assert.equal(await tRang('4) Interventions'), 'Interventions');
    assert.equal(await tRang('Les 4 styles d\'attachement'), 'Les 4 styles d\'attachement',
      'un chiffre DANS le titre n\'est pas un tRang : jamais amputé');
    assert.equal(await tRang('Module de psychoéducation'), 'Module de psychoéducation',
      '« Module » sans numéro n\'est pas un tRang');
    assert.equal(await tRang('Bowlby et Ainsworth'), 'Bowlby et Ainsworth');
    console.log('PASS 9/11 titres de module : rang recopié retiré, jamais un chiffre légitime.');

    // ── 10. TITRE DU COURS : celui du modèle, sinon un repli BORNÉ ───────────────────────────
    const tDEM = 'un cours de 3 heures pour des etudiants de Master 2 en psychologie clinique sur '
      + 'les troubles de l\'attachement dans le couple adulte : reperage, conceptualisation et interventions';
    const tSansTitre = await norm([mod('A'), mod('B')], tDEM, 60);
    assert.ok(tSansTitre.ok);
    assert.ok(tSansTitre.p.titre.length <= 61, 'repli borné : ' + tSansTitre.p.titre.length + ' caractères');
    assert.ok(tSansTitre.p.titre.endsWith('…'), 'la coupe est VISIBLE, jamais silencieuse');
    assert.ok(!/\s…$/.test(tSansTitre.p.titre), 'coupé sur une frontière de mot, jamais au milieu');
    assert.ok(tDEM.startsWith(tSansTitre.p.titre.slice(0, -1)), 'le repli est un préfixe exact de la demande');
    const demandeCourte = await norm([mod('A'), mod('B')], 'Attachement et couple', 60);
    assert.equal(demandeCourte.p.titre, 'Attachement et couple', 'une demande courte passe telle quelle');
    const tAvecTitre = await norm({ titre: 'Les troubles de l\'attachement', modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.equal(tAvecTitre.p.titre, 'Les troubles de l\'attachement', 'le titre du modèle fait foi');
    const tPrefixe = await norm({ titre: 'Cours : Attachement adulte', modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.equal(tPrefixe.p.titre, 'Attachement adulte', '« Cours : » recopié est retiré — il est déjà dans le nom');
    const tTitreVide = await norm({ titre: '   ', modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.ok(tTitreVide.p.titre.endsWith('…'), 'un titre tTitreVide retombe sur le repli, jamais sur une chaîne tTitreVide');
    const tLongModele = await norm({ titre: 'x'.repeat(300), modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.equal(tLongModele.p.titre.length, 100, 'le titre du modèle est borné lui aussi');
    console.log('PASS 10/11 titre du cours : celui du modèle, sinon un repli borné et visible.');

    // ── 11. LES DEUX ENSEMBLE, sur la forme EXACTE rendue par le modèle en campagne ──────────
    const tPlanReel = await norm({ modules: [
      { titre: 'Module 1 : Définition et historique de l\'attachement adulte', notionsCles: ['Bowlby'] },
      { titre: 'Module 2 : Les styles d\'attachement adulte', notionsCles: ['style sécure'] },
    ] }, tDEM, 30);
    assert.deepEqual(tPlanReel.p.modules.map(m => m.titre),
      ['Définition et historique de l\'attachement adulte', 'Les styles d\'attachement adulte']);
    assert.equal(tPlanReel.p.modules[0].requeteBibliotheque, 'Définition et historique de l\'attachement adulte Bowlby',
      'la requête bibliothèque est construite sur le titre NETTOYÉ, jamais sur « Module 1 : … »');
    const tNom = await page.evaluate(p => window.adocCourseModuleName(p, 0), tPlanReel.p);
    assert.ok(tNom.length <= 140, 'repli : ' + tNom.length + ' caractères — ' + tNom);
    assert.doesNotMatch(tNom, /Module 1 sur 2 · Module 1/, 'jamais le rang deux fois dans le même nom');
    // Deux longueurs MESURÉES, pas devinées : avec un titre du modèle (le cas normal depuis que
    // l'invite en demande un) et avec le repli (le cas dégradé, plus long — c'est le prix de ne
    // rien inventer à partir de la demande).
    const tPlanTitre = await norm({ titre: 'Les troubles de l\'attachement dans le couple', modules: [
      { titre: 'Module 1 : Définition et historique de l\'attachement adulte', notionsCles: ['Bowlby'] },
      { titre: 'Module 2 : Les styles d\'attachement adulte', notionsCles: ['style sécure'] },
    ] }, tDEM, 30);
    const tNomNormal = await page.evaluate(p => window.adocCourseModuleName(p, 0), tPlanTitre.p);
    assert.ok(tNomNormal.length <= 120, 'cas normal : ' + tNomNormal.length + ' caractères — ' + tNomNormal);
    console.log('PASS 11/11 cas réel de campagne — ' + tNomNormal.length + ' car. avec titre, '
      + tNom.length + ' car. en repli :\n            « ' + tNomNormal + ' »');

    console.log('\nPASS verify-plan-cours — 11/11.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
