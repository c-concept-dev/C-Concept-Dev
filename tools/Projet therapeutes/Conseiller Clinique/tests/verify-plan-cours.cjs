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
    console.log('PASS 1/12  nombre de modules : ~15 min chacun, borné 2..12, robuste à l\'absence de durée.');

    // ── 2. CAS NOMINAL ────────────────────────────────────────────────────────────────────────
    const a = await norm([mod('Attachement'), mod('Schémas précoces'), mod('Cycles du couple')], 'Cours', 180);
    assert.ok(a.ok, a.erreur);
    assert.deepEqual(a.p.modules.map(m => m.id), ['m1', 'm2', 'm3'], 'identifiants séquentiels');
    assert.equal(a.p.courseId, 'c1');
    assert.equal(a.p.dureeMinutes, 180);
    console.log('PASS 2/12  cas nominal : identifiants séquentiels, durée totale conservée.');

    // ── 3. LA DURÉE SE RÉPARTIT SUR LES MODULES RETENUS ───────────────────────────────────────
    // 3 modules pour 3 h font 60 min chacun, jamais 15 : sinon le plan annonce 45 min pour un
    // cours de 180, et l'utilisatrice valide un découpage qui ne tient pas.
    assert.deepEqual(a.p.modules.map(m => m.dureeMinutes), [60, 60, 60]);
    console.log('PASS 3/12  la durée se répartit sur les modules RÉELLEMENT retenus.');

    // ── 4. slideCount BORNÉ 10..12 ────────────────────────────────────────────────────────────
    a.p.modules.forEach(m => assert.ok(m.slideCount >= 10 && m.slideCount <= 12, 'slideCount hors bornes : ' + m.slideCount));
    const court = await norm([mod('A'), mod('B')], 'Cours', 20);
    assert.ok(court.p.modules.every(m => m.slideCount >= 10), 'même un module court garde un corps : 10 minimum');
    console.log('PASS 4/12  slideCount borné 10..12 dans tous les cas.');

    // ── 5. TROP DE MODULES : tronqué au plafond ───────────────────────────────────────────────
    const vingt = await norm(Array.from({ length: 20 }, (_, i) => mod('M' + (i + 1))), 'Cours', 180);
    assert.equal(vingt.p.modules.length, 12, 'jamais plus de 12, quoi que réponde le modèle');
    console.log('PASS 5/12  20 modules proposés : ramenés à 12.');

    // ── 6. RÉPONSES ABÎMÉES ───────────────────────────────────────────────────────────────────
    const sales = await norm([mod('Bon'), { titre: '   ' }, { objectifs: ['x'] }, mod('Autre')], 'Cours', 60);
    assert.deepEqual(sales.p.modules.map(m => m.titre), ['Bon', 'Autre'], 'un module sans titre est écarté, jamais rattrapé');
    const vide = await norm([{ objectifs: [] }], 'Cours', 60);
    assert.equal(vide.ok, false);
    assert.match(vide.erreur, /aucun module exploitable/, 'un plan vide doit être refusé NOMMÉMENT');
    console.log('PASS 6/12  modules sans titre écartés ; plan entièrement vide refusé nommément.');

    // ── 7. VOCABULAIRE ALTERNATIF et enveloppe {modules:[…]} ──────────────────────────────────
    const alt = await norm({ titre: 'Mon cours', modules: [{ title: 'En anglais', notions: ['n1', 'n2'], objectives: ['o1'] }] }, 'Cours', 30);
    assert.equal(alt.p.modules[0].titre, 'En anglais', 'title comme titre');
    assert.deepEqual(alt.p.modules[0].notionsCles, ['n1', 'n2'], 'notions comme notionsCles');
    assert.deepEqual(alt.p.modules[0].objectifs, ['o1']);
    assert.equal(alt.p.titre, 'Mon cours', 'le titre du plan est repris s\'il existe');
    console.log('PASS 7/12  vocabulaire alternatif et enveloppe {modules:[…]} acceptés.');

    // ── 8. REQUÊTE DE BIBLIOTHÈQUE toujours renseignée ────────────────────────────────────────
    // Sans elle, la recherche du module part de rien et le module sort creux.
    const sansRequete = await norm([mod('Attachement', { notionsCles: ['sécure', 'évitant'] })], 'Cours', 30);
    assert.equal(sansRequete.p.modules[0].requeteBibliotheque, 'Attachement sécure évitant',
      'à défaut, la requête se construit du titre et des notions clés');
    const avecRequete = await norm([mod('A', { requeteBibliotheque: 'termes choisis' })], 'Cours', 30);
    assert.equal(avecRequete.p.modules[0].requeteBibliotheque, 'termes choisis', 'celle du modèle l\'emporte');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 8/12  requête de bibliothèque toujours renseignée, celle du modèle prioritaire.');

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
      'un chiffre DANS le titre n\'est pas un rang : jamais amputé');
    assert.equal(await tRang('Module de psychoéducation'), 'Module de psychoéducation',
      '« Module » sans numéro n\'est pas un rang');
    assert.equal(await tRang('Bowlby et Ainsworth'), 'Bowlby et Ainsworth');
    console.log('PASS 9/12 titres de module : rang recopié retiré, jamais un chiffre légitime.');

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
    assert.ok(tTitreVide.p.titre.endsWith('…'), 'un titre fait d\'espaces retombe sur le repli, jamais sur « Cours »');
    const tLongModele = await norm({ titre: 'x'.repeat(300), modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.equal(tLongModele.p.titre.length, 61, 'le titre du modèle subit la MÊME borne que le repli');
    assert.ok(tLongModele.p.titre.endsWith('…'));
    // Mesuré le 29/09/2026 : interrogé avec l'invite qui demande « 3 à 8 mots », le modèle a rendu
    // la demande ENTIÈRE comme titre. Une consigne d'invite ne remplace pas une borne.
    const tModeleRecopie = await norm({ titre: tDEM, modules: [mod('A'), mod('B')] }, tDEM, 60);
    assert.ok(tModeleRecopie.p.titre.length <= 61, 'une demande recopiée par le modèle est bornée aussi : '
      + tModeleRecopie.p.titre.length);
    assert.ok(tModeleRecopie.p.titre.endsWith('…'));
    console.log('PASS 10/12 titre du cours : celui du modèle, sinon un repli borné et visible.');

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
    console.log('PASS 11/12 cas réel de campagne — ' + tNomNormal.length + ' car. avec titre, '
      + tNom.length + ' car. en repli :\n            « ' + tNomNormal + ' »');

    // ── 12. L'APPEL LUI-MÊME : plafond de sortie, forme de la réponse, troncature nommée ─────
    // `fetch` est simulé : on éprouve la lecture de la réponse, jamais le réseau. Mesuré le
    // 29/09/2026 en campagne réelle — à 12 modules la réponse arrivait coupée, et le message
    // parlait d'un « JSON illisible », ce qui envoyait chercher un défaut de format inexistant.
    const appel = (reponse, duree) => page.evaluate(async ([rep, d]) => {
      const vrai = window.fetch;
      let envoye = null;
      window.fetch = async (url, opts) => {
        // Le corps réel est { payload: { model, max_tokens, messages } } — le plafond ne vit PAS
        // à la racine, et le lire à la racine donnait `undefined` sans que rien ne soit faux.
        envoye = (JSON.parse(opts.body) || {}).payload;
        return { ok: true, status: 200, json: async () => rep };
      };
      try {
        const plan = await window.adocBuildCoursePlan('une demande', d, 'https://exemple', 'c1');
        return { ok: true, plan: plan, envoye: envoye };
      } catch (e) { return { ok: false, erreur: e.message, envoye: envoye }; }
      finally { window.fetch = vrai; }
    }, [reponse, duree]);
    const rep = (texte, stop) => ({ content: [{ text: texte }], stop_reason: stop || 'end_turn' });

    // Le plafond suit le nombre de modules — 12 modules ne peuvent pas tenir dans le plafond de 2.
    const p12 = await appel(rep('[{"titre":"A"},{"titre":"B"}]'), 180);
    const p2 = await appel(rep('[{"titre":"A"},{"titre":"B"}]'), 20);
    assert.ok(p12.ok, 'appel simulé 12 modules : ' + p12.erreur);
    assert.ok(p2.ok, 'appel simulé 2 modules : ' + p2.erreur);
    assert.ok(p12.envoye.max_tokens > p2.envoye.max_tokens,
      'le plafond doit croître avec le nombre de modules : ' + p12.envoye.max_tokens + ' vs ' + p2.envoye.max_tokens);
    assert.ok(p12.envoye.max_tokens >= 6000, '12 modules : ' + p12.envoye.max_tokens
      + ' jetons — la réponse coupée en campagne faisait déjà ~1 900 jetons');
    assert.ok(p12.envoye.max_tokens <= 8000, 'jamais illimité : ' + p12.envoye.max_tokens);

    // Forme OBJET : le titre du modèle est lu. La chercher seulement sous forme de tableau, comme
    // le faisait ce code, jetait ce titre en silence.
    const pObjet = await appel(rep('{"titre":"Attachement adulte","modules":[{"titre":"A"},{"titre":"B"}]}'), 30);
    assert.ok(pObjet.ok, pObjet.erreur);
    assert.equal(pObjet.plan.titre, 'Attachement adulte', 'le titre de la forme objet doit être lu');
    assert.equal(pObjet.plan.modules.length, 2);

    // Forme TABLEAU : toujours acceptée, le modèle la rend encore souvent.
    const pTableau = await appel(rep('[{"titre":"A"},{"titre":"B"}]'), 30);
    assert.ok(pTableau.ok, pTableau.erreur);
    assert.equal(pTableau.plan.modules.length, 2);
    assert.ok(pTableau.plan.titre.startsWith('une demande'), 'sans titre du modèle : repli sur la demande');

    // TRONCATURE : la cause réelle est nommée la première, jamais « JSON illisible » tout court.
    const pCoupe = await appel(rep('{"titre":"X","modules":[{"titre":"A"},{"titre":"B"', 'max_tokens'), 180);
    assert.equal(pCoupe.ok, false);
    assert.match(pCoupe.erreur, /COUPÉE/, 'la troncature doit être dite : ' + pCoupe.erreur);
    assert.match(pCoupe.erreur, /max_tokens/);
    assert.match(pCoupe.erreur, /pas un défaut de format/, 'et doit écarter la fausse piste du format');

    // Illisible SANS troncature : le message ne doit PAS accuser une coupure qui n'a pas eu lieu.
    const pCasse = await appel(rep('{ ceci n\'est pas du JSON }'), 30);
    assert.equal(pCasse.ok, false);
    assert.doesNotMatch(pCasse.erreur, /COUPÉE/, 'aucune troncature ici : ' + pCasse.erreur);
    console.log('PASS 12/12 appel du plan : plafond proportionnel, objet ou tableau, troncature nommée.');

    console.log('\nPASS verify-plan-cours — 12/12.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
