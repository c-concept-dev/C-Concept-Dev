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
    console.log('PASS 1/8  nombre de modules : ~15 min chacun, borné 2..12, robuste à l\'absence de durée.');

    // ── 2. CAS NOMINAL ────────────────────────────────────────────────────────────────────────
    const a = await norm([mod('Attachement'), mod('Schémas précoces'), mod('Cycles du couple')], 'Cours', 180);
    assert.ok(a.ok, a.erreur);
    assert.deepEqual(a.p.modules.map(m => m.id), ['m1', 'm2', 'm3'], 'identifiants séquentiels');
    assert.equal(a.p.courseId, 'c1');
    assert.equal(a.p.dureeMinutes, 180);
    console.log('PASS 2/8  cas nominal : identifiants séquentiels, durée totale conservée.');

    // ── 3. LA DURÉE SE RÉPARTIT SUR LES MODULES RETENUS ───────────────────────────────────────
    // 3 modules pour 3 h font 60 min chacun, jamais 15 : sinon le plan annonce 45 min pour un
    // cours de 180, et l'utilisatrice valide un découpage qui ne tient pas.
    assert.deepEqual(a.p.modules.map(m => m.dureeMinutes), [60, 60, 60]);
    console.log('PASS 3/8  la durée se répartit sur les modules RÉELLEMENT retenus.');

    // ── 4. slideCount BORNÉ 10..12 ────────────────────────────────────────────────────────────
    a.p.modules.forEach(m => assert.ok(m.slideCount >= 10 && m.slideCount <= 12, 'slideCount hors bornes : ' + m.slideCount));
    const court = await norm([mod('A'), mod('B')], 'Cours', 20);
    assert.ok(court.p.modules.every(m => m.slideCount >= 10), 'même un module court garde un corps : 10 minimum');
    console.log('PASS 4/8  slideCount borné 10..12 dans tous les cas.');

    // ── 5. TROP DE MODULES : tronqué au plafond ───────────────────────────────────────────────
    const vingt = await norm(Array.from({ length: 20 }, (_, i) => mod('M' + (i + 1))), 'Cours', 180);
    assert.equal(vingt.p.modules.length, 12, 'jamais plus de 12, quoi que réponde le modèle');
    console.log('PASS 5/8  20 modules proposés : ramenés à 12.');

    // ── 6. RÉPONSES ABÎMÉES ───────────────────────────────────────────────────────────────────
    const sales = await norm([mod('Bon'), { titre: '   ' }, { objectifs: ['x'] }, mod('Autre')], 'Cours', 60);
    assert.deepEqual(sales.p.modules.map(m => m.titre), ['Bon', 'Autre'], 'un module sans titre est écarté, jamais rattrapé');
    const vide = await norm([{ objectifs: [] }], 'Cours', 60);
    assert.equal(vide.ok, false);
    assert.match(vide.erreur, /aucun module exploitable/, 'un plan vide doit être refusé NOMMÉMENT');
    console.log('PASS 6/8  modules sans titre écartés ; plan entièrement vide refusé nommément.');

    // ── 7. VOCABULAIRE ALTERNATIF et enveloppe {modules:[…]} ──────────────────────────────────
    const alt = await norm({ titre: 'Mon cours', modules: [{ title: 'En anglais', notions: ['n1', 'n2'], objectives: ['o1'] }] }, 'Cours', 30);
    assert.equal(alt.p.modules[0].titre, 'En anglais', 'title comme titre');
    assert.deepEqual(alt.p.modules[0].notionsCles, ['n1', 'n2'], 'notions comme notionsCles');
    assert.deepEqual(alt.p.modules[0].objectifs, ['o1']);
    assert.equal(alt.p.titre, 'Mon cours', 'le titre du plan est repris s\'il existe');
    console.log('PASS 7/8  vocabulaire alternatif et enveloppe {modules:[…]} acceptés.');

    // ── 8. REQUÊTE DE BIBLIOTHÈQUE toujours renseignée ────────────────────────────────────────
    // Sans elle, la recherche du module part de rien et le module sort creux.
    const sansRequete = await norm([mod('Attachement', { notionsCles: ['sécure', 'évitant'] })], 'Cours', 30);
    assert.equal(sansRequete.p.modules[0].requeteBibliotheque, 'Attachement sécure évitant',
      'à défaut, la requête se construit du titre et des notions clés');
    const avecRequete = await norm([mod('A', { requeteBibliotheque: 'termes choisis' })], 'Cours', 30);
    assert.equal(avecRequete.p.modules[0].requeteBibliotheque, 'termes choisis', 'celle du modèle l\'emporte');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 8/8  requête de bibliothèque toujours renseignée, celle du modèle prioritaire.');

    console.log('\nPASS verify-plan-cours — 8/8.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
