// Présentation ACTE 3 — conversion des pages d'approfondissement : deux formes de paragraphe,
// filet d'existence sur les liens internes, coupe des cycles.
//
// Éprouve adocConvertDeepDives DANS LE NAVIGATEUR, sur la vraie page, jamais une copie du code :
// c'est la fonction réellement appelée par adocGenerateStructuredDocument. Exposée sur window pour
// cela (même patron que window.adocRunGenerationPipeline), ce qui permet de vérifier la coupe des
// cycles sans appel réel — donc payant — au modèle.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-acte3-deepdive-cycle.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocConvertDeepDives === 'function');

    const convertir = raw => page.evaluate(r => window.adocConvertDeepDives(r), raw);
    const lien = (text, targetId) => ({ text, targetId });

    // ── 1. RÉTROCOMPATIBILITÉ STRICTE — un document Phase 1/2 traverse sans la moindre
    //      modification : paragraphes = chaînes, aucune clé ajoutée nulle part.
    const phase1 = [
      { id: 'a', title: 'Page A', paragraphs: ['premier', 'deuxième'] },
      { id: 'b', title: 'Page B', paragraphs: ['seul'] },
    ];
    const sortiePhase1 = await convertir(phase1);
    assert.deepEqual(sortiePhase1, phase1,
      'un document sans lien interne doit ressortir RIGOUREUSEMENT identique');
    console.log('PASS 1/11  rétrocompatibilité : sortie identique à l\'entrée, aucune clé ajoutée.');

    // ── 2. CYCLE COURT A→B→A — le lien qui reboucle est retiré, les DEUX entrées survivent.
    const cycle = await convertir([
      { id: 'a', title: 'A', paragraphs: [{ text: 'aller vers B', deepDiveLinks: [lien('vers B', 'b')] }] },
      { id: 'b', title: 'B', paragraphs: [{ text: 'retour vers A', deepDiveLinks: [lien('vers A', 'a')] }] },
    ]);
    assert.equal(cycle.length, 2, 'les deux entrées doivent survivre');
    assert.equal(cycle[0].paragraphs[0].deepDiveLinks.length, 1, 'A→B est légitime, il doit rester');
    assert.equal(cycle[0].paragraphs[0].deepDiveLinks[0].targetId, 'b');
    assert.equal(typeof cycle[1].paragraphs[0], 'string',
      "B n'a plus aucun lien : son paragraphe redevient une simple chaîne");
    assert.equal(cycle[1].paragraphs[0], 'retour vers A', 'le TEXTE de B doit être intact');
    console.log('PASS 2/11  cycle A→B→A : l\'arête de retour est coupée, les deux pages restent.');

    // ── 3. CYCLE LONG A→B→C→A — un test arête par arête ne le verrait pas.
    const long = await convertir([
      { id: 'a', title: 'A', paragraphs: [{ text: 'vers B', deepDiveLinks: [lien('vers B', 'b')] }] },
      { id: 'b', title: 'B', paragraphs: [{ text: 'vers C', deepDiveLinks: [lien('vers C', 'c')] }] },
      { id: 'c', title: 'C', paragraphs: [{ text: 'vers A', deepDiveLinks: [lien('vers A', 'a')] }] },
    ]);
    assert.equal(long.length, 3);
    assert.equal(long[0].paragraphs[0].deepDiveLinks[0].targetId, 'b');
    assert.equal(long[1].paragraphs[0].deepDiveLinks[0].targetId, 'c');
    assert.equal(typeof long[2].paragraphs[0], 'string', 'C→A referme le cycle : coupé');
    console.log('PASS 3/11  cycle long A→B→C→A : coupé au bon endroit, la chaîne aller survit.');

    // ── 4. PROFONDEUR RÉELLE 4 NIVEAUX SANS CYCLE — toute la chaîne survit.
    const chaine = await convertir([
      { id: 'n1', title: 'N1', paragraphs: [{ text: 'vers N2', deepDiveLinks: [lien('vers N2', 'n2')] }] },
      { id: 'n2', title: 'N2', paragraphs: [{ text: 'vers N3', deepDiveLinks: [lien('vers N3', 'n3')] }] },
      { id: 'n3', title: 'N3', paragraphs: [{ text: 'vers N4', deepDiveLinks: [lien('vers N4', 'n4')] }] },
      { id: 'n4', title: 'N4', paragraphs: ['terminus'] },
    ]);
    assert.equal(chaine.length, 4);
    for (let i = 0; i < 3; i++) {
      assert.equal(chaine[i].paragraphs[0].deepDiveLinks.length, 1,
        'aucun lien de la chaîne ne doit être coupé (niveau ' + (i + 1) + ')');
    }
    assert.equal(typeof chaine[3].paragraphs[0], 'string');
    console.log('PASS 4/11  profondeur 4 sans cycle : la chaîne entière survit à la conversion.');

    // ── 5. LOSANGE A→B, A→C, B→D, C→D — deux chemins vers D, ce n'est PAS un cycle.
    const losange = await convertir([
      { id: 'a', title: 'A', paragraphs: [{ text: 'vers B et vers C', deepDiveLinks: [lien('vers B', 'b'), lien('vers C', 'c')] }] },
      { id: 'b', title: 'B', paragraphs: [{ text: 'vers D', deepDiveLinks: [lien('vers D', 'd')] }] },
      { id: 'c', title: 'C', paragraphs: [{ text: 'vers D', deepDiveLinks: [lien('vers D', 'd')] }] },
      { id: 'd', title: 'D', paragraphs: ['fin'] },
    ]);
    assert.equal(losange[0].paragraphs[0].deepDiveLinks.length, 2);
    assert.equal(losange[1].paragraphs[0].deepDiveLinks.length, 1, 'B→D doit rester');
    assert.equal(losange[2].paragraphs[0].deepDiveLinks.length, 1,
      'C→D vise un nœud DÉJÀ terminé (noir), jamais un ancêtre : ce n\'est pas un cycle');
    console.log('PASS 5/11  losange : les deux chemins vers D survivent, rien n\'est coupé à tort.');

    // ── 6. LIEN ORPHELIN et LIEN VERS SOI-MÊME — retirés, le texte reste.
    const orphelins = await convertir([
      { id: 'a', title: 'A', paragraphs: [{ text: 'texte', deepDiveLinks: [lien('nulle part', 'inexistant'), lien('moi-même', 'a')] }] },
    ]);
    assert.equal(orphelins.length, 1, "l'entrée ne doit jamais être rejetée pour un lien mort");
    assert.equal(typeof orphelins[0].paragraphs[0], 'string');
    assert.equal(orphelins[0].paragraphs[0], 'texte', 'le texte du paragraphe doit être intact');
    console.log('PASS 6/11  lien orphelin et lien vers soi-même : retirés, texte préservé.');

    // ── 7. ENTRÉE INEXPLOITABLE — rejetée entière, jamais persistée à moitié remplie.
    const sales = await convertir([
      { id: '', title: 'sans id', paragraphs: ['x'] },
      { id: 'b', title: '', paragraphs: ['x'] },
      { id: 'c', title: 'sans paragraphe', paragraphs: [] },
      { id: 'd', title: 'valide', paragraphs: ['   ', 'bon'] },
    ]);
    assert.equal(sales.length, 1, 'seule l\'entrée exploitable doit survivre');
    assert.deepEqual(sales[0], { id: 'd', title: 'valide', paragraphs: ['bon'] },
      'les paragraphes vides sont retirés, jamais conservés à blanc');
    console.log('PASS 7/11  entrées inexploitables rejetées entières, paragraphes vides écartés.');

    // ── 8 à 11. LA FORME QUE LE MODÈLE PRODUIT RÉELLEMENT. Les cas 1 à 7 ci-dessus éprouvent la
    //      forme imbriquée — celle du DOCUMENT, du schéma, de la navigation et de l'export. Mais
    //      l'outil strict ne peut pas la faire produire : la grammaire compilée dépasserait la
    //      taille acceptée par l'API (HTTP 400 déterministe, incident du 28/09/2026). Le modèle
    //      renvoie donc, au niveau de la PAGE, un tableau de chaînes « expression → id », et la
    //      conversion les rend aux paragraphes. C'est cette voie-là qui part en production : elle
    //      doit être couverte aussi sévèrement que l'autre.
    const parPage = await convertir([
      { id: 'a', title: 'A', paragraphs: ['un premier paragraphe', 'et la boucle de retour ici'],
        deepDiveLinks: ['boucle de retour → b'] },
      { id: 'b', title: 'B', paragraphs: ['terminus'] },
    ]);
    assert.equal(typeof parPage[0].paragraphs[0], 'string',
      'le paragraphe SANS lien reste une simple chaîne');
    assert.equal(parPage[0].paragraphs[1].deepDiveLinks[0].targetId, 'b');
    assert.equal(parPage[0].paragraphs[1].deepDiveLinks[0].text, 'boucle de retour',
      "le lien se pose sur le paragraphe qui contient RÉELLEMENT l'expression, pas sur le premier");
    assert.deepEqual(parPage[1], { id: 'b', title: 'B', paragraphs: ['terminus'] },
      "la page CIBLE, qui ne porte aucun lien, ressort rigoureusement inchangée");
    console.log('PASS 8/11  liens de page en chaînes : posés sur le bon paragraphe, les autres intacts.');

    // ── 9. EXPRESSION INTROUVABLE (le modèle a reformulé) — repli sur le premier paragraphe. Une
    //      pastille légèrement mal placée vaut mieux qu'une page d'approfondissement inatteignable.
    const repli = await convertir([
      { id: 'a', title: 'A', paragraphs: ['aucune correspondance ici', 'ni là'],
        deepDiveLinks: ['tournure jamais écrite → b'] },
      { id: 'b', title: 'B', paragraphs: ['terminus'] },
    ]);
    assert.equal(repli[0].paragraphs[0].deepDiveLinks[0].targetId, 'b',
      "le lien doit survivre sur le premier paragraphe : la page B doit rester atteignable");
    assert.equal(typeof repli[0].paragraphs[1], 'string', 'le second paragraphe reste une chaîne');
    console.log('PASS 9/11  expression introuvable : repli sur le premier paragraphe, page atteignable.');

    // ── 10. SÉPARATEUR ASCII et ENTRÉES MALFORMÉES — une flèche tapée « -> » ne doit pas faire
    //      perdre le lien ; une entrée illisible est ignorée sans casser les autres.
    const tolerance = await convertir([
      { id: 'a', title: 'A', paragraphs: ['le cortisol agit', 'la surrénale répond'],
        deepDiveLinks: ['le cortisol -> b', 'sans aucune flèche', '→ c', 'la surrénale →   ', 'la surrénale → c'] },
      { id: 'b', title: 'B', paragraphs: ['terminus b'] },
      { id: 'c', title: 'C', paragraphs: ['terminus c'] },
    ]);
    assert.equal(tolerance[0].paragraphs[0].deepDiveLinks[0].targetId, 'b', 'la flèche ASCII est tolérée');
    assert.equal(tolerance[0].paragraphs[1].deepDiveLinks.length, 1,
      "une seule entrée valide sur la surrénale : les malformées sont ignorées, jamais conservées à blanc");
    assert.equal(tolerance[0].paragraphs[1].deepDiveLinks[0].targetId, 'c');
    console.log('PASS 10/11 flèche ASCII tolérée ; entrées malformées ignorées sans casser les autres.');

    // ── 11. LES MÊMES FILETS S'APPLIQUENT À CETTE FORME — orphelin, lien vers soi, et cycle. Le
    //      filet ne doit pas dépendre de la façon dont le lien est arrivé.
    const filets = await convertir([
      { id: 'a', title: 'A', paragraphs: ['vers b et vers nulle part et vers moi'],
        deepDiveLinks: ['vers b → b', 'vers nulle part → inexistant', 'vers moi → a'] },
      { id: 'b', title: 'B', paragraphs: ['retour vers a'], deepDiveLinks: ['retour vers a → a'] },
    ]);
    assert.equal(filets[0].paragraphs[0].deepDiveLinks.length, 1,
      "l'orphelin et le lien vers soi-même doivent partir, exactement comme en forme imbriquée");
    assert.equal(filets[0].paragraphs[0].deepDiveLinks[0].targetId, 'b');
    assert.equal(typeof filets[1].paragraphs[0], 'string',
      'B→A referme le cycle : coupé, et le paragraphe redevient une chaîne');
    assert.equal(filets[1].paragraphs[0], 'retour vers a', 'le texte reste intact');
    console.log('PASS 11/11 forme en chaînes : orphelin, lien vers soi et cycle traités à l\'identique.');

    assert.equal(erreurs.length, 0, 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\nPASS verify-acte3-deepdive-cycle — 11/11.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
