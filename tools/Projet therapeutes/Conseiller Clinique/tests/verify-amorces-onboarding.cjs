// AMORCES DE LECTURE (onboarding phase 2) — deux phrases, chacune posée là où son sujet se voit,
// qui s'effacent au premier geste qu'elles décrivent et ne reviennent plus de toute la session.
//
// CE QUE CE TEST DOIT PROUVER, et que la première fermeture ne prouve PAS : la disparition survit à
// une navigation entre PLUSIEURS portes dans la même session. Un drapeau posé puis relu au mauvais
// moment (après le repeuplement de la porte, par exemple) laisserait l'amorce revenir à chaque page
// ouverte — défaut invisible si l'on s'arrête à la première fermeture.
//
// Trois sessions SÉPARÉES, parce qu'une absence n'est une preuve que si l'apparition était encore
// possible : la session B éprouve la porte image alors que le drapeau de porte est encore FAUX
// (assertion explicite), sans quoi l'absence constatée n'apprendrait rien.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Les textes sont REDITS ici, jamais lus depuis la production : un test qui importe la chaîne qu'il
// vérifie ne vérifie rien — il passerait encore après une réécriture accidentelle du texte validé.
const T_DIAPO = 'Certaines images et certains mots soulignés ouvrent une page plus détaillée. Un clic suffit.';
const T_PORTE = 'Les deux icônes en bas ramènent : la flèche à la page précédente, la maison à la diapositive.';

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const para = (id, texte, liens) => {
  const b = { id, type: 'paragraph', content: { text: texte }, citationIds: [], validation: {} };
  if (liens) b.deepDiveLinks = liens;
  return b;
};
const page3 = (n) => ({ id: 'n' + n, title: 'Niveau ' + n, imageQuery: '', imageAlt: '',
  paragraphs: ['Un paragraphe de la page de niveau ' + n + ', assez long pour être mis en page.'] });
// n4 : 8 paragraphes, JUSTE SOUS le seuil de révélation (9). C'est le cas maximal réel — rien n'est
// masqué, la colonne atteint donc sa pleine hauteur, et c'est exactement la page que la régression
// avait cassée (652/652 mesurés, elle tenait à 1 px près). Au-DESSUS du seuil la révélation replie la
// colonne à un seul paragraphe : 14 paragraphes donnaient 192 px, un faux cas maximal qui n'aurait
// rien éprouvé.
const pageLongue = { id: 'n4', title: 'Niveau 4', imageQuery: '', imageAlt: '',
  paragraphs: Array.from({ length: 8 }, (_, i) => 'Paragraphe ' + (i + 1)
    + " d'une page assez fournie pour occuper plusieurs lignes une fois mise en page dans la "
    + 'colonne de la porte, et éprouver ainsi le plafond de hauteur.') };
const DOC = {
  documentKind: 'presentation', title: 'Amorces', citations: [],
  blocks: [
    { id: 'c1', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      para('p1', 'Un texte avec un renvoi.', [{ text: 'un renvoi', targetId: 'n1' }]),
      // Image SANS renvoi : c'est elle qui ouvre la porte IMAGE, laquelle masque
      // .cc-ws-present-door-text et n'affiche donc aucune des deux icônes de retour.
      // content.query, et NON imageRef : `query` est le champ d'un BLOC image (exigé par le schéma),
      // `imageRef` celui de la COUVERTURE d'une carte. Avec imageRef, aucune référence d'image n'est
      // plus émise depuis le garde des requêtes inexploitables, et l'image perd son src.
      { id: 'img-zoom', type: 'image', content: { query: 'calm room', alt: 'Une scène clinique', widthPercent: 100 },
        citationIds: [], validation: {} },
    ] } },
    { id: 'c2', type: 'card', content: { title: 'D2', imageRef: null, imageAlt: null, blocks: [
      para('p2', 'Une seconde diapositive.'),
    ] } },
  ],
  deepDives: [page3(1), page3(2), page3(3), pageLongue],
};

// Jamais dans le dépôt : un fichier produit par une mesure n'y entre pas (dépôt public).
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'amorces-'));
const fichier = path.join(dossier, 'presentation.html');

const horsReseau = (p) => p.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());

// Relevé unique, lu à chaque étape : combien d'amorces de chaque sorte, leur texte, et l'état des
// drapeaux — pour qu'aucune assertion d'absence ne puisse être vide de sens.
const releve = (p) => p.evaluate(() => {
  const st = window._adocPresentState;
  const diapo = document.querySelector('#cc-ws-present-overlay > .adoc-amorce-diapo');
  const porte = document.querySelector('#cc-ws-present-door > .adoc-amorce-porte');
  return {
    nbDiapo: document.querySelectorAll('.adoc-amorce-diapo').length,
    nbPorte: document.querySelectorAll('.adoc-amorce-porte').length,
    // Total toutes classes confondues : attrape une amorce qui se serait posée ailleurs.
    nbTotal: document.querySelectorAll('.adoc-amorce').length,
    // Ce qui compte pour un lecteur : ce qui est RENDU. Un noeud dans une porte fermée
    // (hidden + display:none) n'a aucune boîte et ne figure pas dans l'arbre d'accessibilité.
    nbVisible: [...document.querySelectorAll('.adoc-amorce')].filter((e) => e.getClientRects().length > 0).length,
    texteDiapo: diapo ? diapo.textContent : null,
    textePorte: porte ? porte.textContent : null,
    roleDiapo: diapo ? diapo.getAttribute('role') : null,
    // Comme la pastille d'image : une phrase qui explique un geste ne doit jamais l'intercepter.
    clicsDiapo: diapo ? getComputedStyle(diapo).pointerEvents : null,
    clicsPorte: porte ? getComputedStyle(porte).pointerEvents : null,
    vivantDiapo: diapo ? diapo.getAttribute('aria-live') : null,
    // Les deux drapeaux, pour prouver la NON-VACUITÉ des assertions d'absence.
    drapeauDiapo: st ? !!st.amorceDiapoFaite : null,
    drapeauPorte: st ? !!st.amorcePorteFaite : null,
    index: st ? st.index : null,
    porteOuverte: !!document.getElementById('cc-ws-present-door')?.classList.contains('open'),
    titrePorte: document.querySelector('.cc-ws-present-door-title')?.textContent || null,
    // LA MESURE QUI A MANQUÉ : posée dans le flux de la colonne, l'amorce lui coûtait 56 px et
    // invalidait le seuil de révélation, qui est une calibration mesurée. On relève donc le plafond
    // de hauteur et le contenu de la colonne, plus le recouvrement éventuel des deux boîtes.
    colonne: (function () {
      const z = document.querySelector('.cc-ws-present-door-text');
      if (!z) return null;
      const bz = z.getBoundingClientRect();
      let recouvre = null;
      if (porte) {
        const ba = porte.getBoundingClientRect();
        recouvre = !(ba.right <= bz.left || ba.left >= bz.right || ba.bottom <= bz.top || ba.top >= bz.bottom);
      }
      return { visible: z.clientHeight, contenu: z.scrollHeight, recouvre: recouvre };
    })(),
    // Aucune trace de stockage : la portée doit être la SESSION, jamais localStorage.
    clesStockage: (function () {
      try { return Object.keys(localStorage).filter((k) => /amorce|onboard/i.test(k)); }
      catch (e) { return ['(localStorage inaccessible)']; }
    })(),
  };
});

const attendrePorte = (p, niveau) =>
  p.waitForFunction((n) => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Niveau ' + n), niveau);

async function demarrerExport(browser) {
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const err = [];
  p.on('pageerror', (e) => err.push(e.message));
  await horsReseau(p);
  await p.goto('file://' + fichier);
  await p.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  await p.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
  await p.waitForTimeout(400);
  return { p, err };
}

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    // ── CONSTRUCTION RÉELLE DE L'EXPORT ─────────────────────────────────────────────────────────
    const atelier = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errAtelier = [];
    atelier.on('pageerror', (e) => errAtelier.push(e.message));
    await horsReseau(atelier);
    await atelier.goto(PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    // Les DEUX textes doivent voyager : ce sont des constantes de portée de module, que engineFnRefs
    // ne transporte pas (il ne sérialise que des fonctions). Sans elles dans dataText, l'export
    // lèverait « ADOC_AMORCE_DIAPO is not defined ».
    assert.ok(html.includes('var ADOC_AMORCE_DIAPO ='), 'ADOC_AMORCE_DIAPO doit être émise dans dataText');
    assert.ok(html.includes('var ADOC_AMORCE_PORTE ='), 'ADOC_AMORCE_PORTE doit être émise dans dataText');
    assert.ok(html.includes(T_DIAPO), 'le texte de l\'amorce de diapositive doit être dans le fichier, au mot près');
    assert.ok(html.includes(T_PORTE), 'le texte de l\'amorce de page doit être dans le fichier, au mot près');
    assert.ok(/\.adoc-amorce\{/.test(html), 'la CSS des amorces doit être embarquée');
    assert.deepEqual(errAtelier, [], 'aucune erreur JS à la construction : ' + errAtelier.join(' | '));
    console.log('PASS ' + (++n) + '/7 — export construit : les deux textes et leur CSS voyagent, dataText inclus.');

    // ══ SESSION A — le parcours complet, dans l'export réellement ouvert ═══════════════════════
    const { p: A, err: errA } = await demarrerExport(browser);

    // 1 — l'amorce de diapositive est là, au mot près, et rien dans la porte
    let r = await releve(A);
    assert.equal(r.nbDiapo, 1, 'une amorce sur la première diapositive, exactement une');
    assert.equal(r.texteDiapo, T_DIAPO, 'texte de l\'amorce de diapositive, au mot près');
    assert.equal(r.roleDiapo, 'note', 'role="note"');
    assert.equal(r.clicsDiapo, 'none',
      'pointer-events:none, comme la pastille d\'image : une phrase qui explique un geste ne doit '
      + 'jamais pouvoir l\'empêcher');
    assert.equal(r.vivantDiapo, 'polite', 'aria-live="polite" : annoncée sans interrompre la lecture');
    assert.equal(r.nbPorte, 0, 'aucune amorce de page tant qu\'aucune page n\'est ouverte');
    assert.deepEqual(r.clesStockage, [], 'AUCUNE clé de stockage : la portée est la session, jamais localStorage');

    // 2 — liée à la PREMIÈRE diapositive : absente ailleurs, de retour au retour, car non consommée
    await A.evaluate(() => window.adocPresentGoTo(1));
    await A.waitForFunction(() => window._adocPresentState?.index === 1);
    await A.waitForTimeout(400);
    r = await releve(A);
    assert.equal(r.nbDiapo, 0, 'aucune amorce sur la seconde diapositive');
    assert.equal(r.drapeauDiapo, false, 'et le drapeau est encore FAUX : cette absence tient à l\'index, pas à une consommation');
    await A.evaluate(() => window.adocPresentGoTo(0));
    await A.waitForFunction(() => window._adocPresentState?.index === 0);
    await A.waitForTimeout(400);
    r = await releve(A);
    assert.equal(r.nbDiapo, 1, 'de retour sur la première diapositive, l\'amorce revient tant que le geste n\'a pas eu lieu');
    console.log('PASS ' + (++n) + '/7 — amorce de diapositive : présente, au mot près, liée à la première diapositive, rien en stockage.');

    // 3 — CLIC RÉEL sur la puce : la page s'ouvre, l'amorce de page paraît, celle de la diapositive s'en va
    await A.locator('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').first().click();
    await attendrePorte(A, 1);
    r = await releve(A);
    assert.equal(r.nbPorte, 1, 'à la première page ouverte, son amorce paraît');
    assert.equal(r.textePorte, T_PORTE, 'texte de l\'amorce de page, au mot près');
    assert.equal(r.clicsPorte, 'none', 'et elle non plus n\'intercepte aucun clic');
    assert.equal(r.nbDiapo, 0, 'et celle de la diapositive a disparu : le geste qu\'elle décrivait vient d\'avoir lieu');
    assert.equal(r.drapeauDiapo, true, 'drapeau de diapositive posé');
    assert.equal(r.drapeauPorte, false, 'drapeau de page encore FAUX : aucun geste de retour n\'a eu lieu');

    // 4 — descendre d'un niveau ne consomme PAS l'amorce de page : aucun retour n'a été fait
    await A.evaluate(() => window.adocPresentOpenDeepDive('n2'));
    await attendrePorte(A, 2);
    r = await releve(A);
    assert.equal(r.nbPorte, 1, 'descendre plus profond ne la consomme pas — le geste décrit est le RETOUR, pas l\'ouverture');
    console.log('PASS ' + (++n) + '/7 — amorce de page : paraît à la première page, au mot près, et survit à une descente.');

    // 5 — CLIC RÉEL sur Reculer : le geste a eu lieu, l'amorce s'en va
    await A.locator('.cc-ws-present-door-btn').first().click();
    await attendrePorte(A, 1);
    r = await releve(A);
    assert.equal(r.drapeauPorte, true, 'drapeau de page posé par le recul');
    assert.equal(r.nbPorte, 0, 'et l\'amorce a disparu de la page où l\'on vient de reculer — drapeau lu AVANT le repeuplement');

    // 6 — LE POINT DEMANDÉ : la disparition survit à une navigation entre PLUSIEURS portes
    await A.locator('.cc-ws-present-door-btn').nth(1).click();   // Maison
    await A.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const parcours = [];
    for (const etape of [['n1', 1], ['n2', 2], ['n3', 3]]) {
      await A.evaluate((id) => window.adocPresentOpenDeepDive(id), etape[0]);
      await attendrePorte(A, etape[1]);
      parcours.push({ ou: 'ouverture ' + etape[0], nbPorte: (await releve(A)).nbPorte });
      await A.locator('.cc-ws-present-door-btn').nth(1).click();  // Maison, retour à la diapositive
      await A.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    }
    // Puis une descente en chaîne, sans repasser par la diapositive
    await A.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await attendrePorte(A, 1);
    parcours.push({ ou: 'rouverture n1', nbPorte: (await releve(A)).nbPorte });
    await A.evaluate(() => window.adocPresentOpenDeepDive('n2'));
    await attendrePorte(A, 2);
    parcours.push({ ou: 'descente n1→n2', nbPorte: (await releve(A)).nbPorte });
    await A.locator('.cc-ws-present-door-btn').first().click();
    await attendrePorte(A, 1);
    parcours.push({ ou: 'recul n2→n1', nbPorte: (await releve(A)).nbPorte });
    assert.deepEqual(parcours.map((e) => e.nbPorte), [0, 0, 0, 0, 0, 0],
      'l\'amorce de page ne doit JAMAIS revenir, d\'une porte à l\'autre dans la même session — '
      + 'relevé : ' + JSON.stringify(parcours));

    // 7 — et l'amorce de diapositive ne revient pas non plus en rentrant
    await A.locator('.cc-ws-present-door-btn').nth(1).click();
    await A.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await A.waitForTimeout(300);
    r = await releve(A);
    assert.equal(r.index, 0, 'préalable : on est bien revenu sur la première diapositive');
    assert.equal(r.nbDiapo, 0, 'l\'amorce de diapositive ne revient pas après son geste, même sur la diapositive 1');
    assert.equal(r.nbTotal, 0, 'plus aucune amorce d\'aucune sorte dans la page');
    assert.deepEqual(r.clesStockage, [], 'toujours aucune clé de stockage');
    assert.deepEqual(errA, [], 'aucune erreur JS dans l\'export : ' + errA.join(' | '));
    console.log('PASS ' + (++n) + '/7 — disparition acquise : 6 navigations entre portes, aucun retour d\'amorce, 0 erreur JS.');
    await A.close();

    // ══ SESSION B — la porte IMAGE n'affiche jamais l'amorce de page ═══════════════════════════
    // Session NEUVE, et drapeau de porte vérifié FAUX : sans cela, l'absence ne prouverait rien.
    const { p: B, err: errB } = await demarrerExport(browser);
    // La diapositive se monte progressivement : en session neuve, seul le premier bloc est révélé,
    // et l'image du second est masquée (.adoc-sc-reveal). Un appui « suivant » la révèle — c'est le
    // geste réel, pas un contournement : adocPresentNext ne consomme aucune amorce.
    await B.evaluate(() => window.adocPresentNext());
    await B.locator('#cc-ws-present-slide-inner #img-zoom img').waitFor({ state: 'visible' });
    await B.locator('#cc-ws-present-slide-inner #img-zoom img').click();
    await B.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await B.waitForTimeout(300);
    r = await releve(B);
    assert.equal(r.porteOuverte, true, 'préalable : la porte image est bien ouverte');
    assert.equal(r.titrePorte, null, 'préalable : c\'est bien la porte IMAGE, pas une page d\'approfondissement');
    assert.equal(r.drapeauPorte, false,
      'NON-VACUITÉ : le drapeau de porte doit être encore FAUX ici, sinon l\'absence qui suit '
      + 'n\'apprendrait rien');
    assert.equal(r.nbPorte, 0,
      'aucune amorce de page dans la porte IMAGE : elle masque .cc-ws-present-door-text et n\'affiche '
      + 'donc NI la flèche NI la maison — cette phrase y parlerait d\'icônes invisibles');
    assert.equal(r.drapeauDiapo, true, 'en revanche l\'agrandissement consomme bien l\'amorce de diapositive');
    assert.equal(r.nbDiapo, 0, 'qui a donc disparu');
    assert.deepEqual(errB, [], 'aucune erreur JS : ' + errB.join(' | '));
    console.log('PASS ' + (++n) + '/7 — porte image : jamais l\'amorce de page, drapeau vérifié faux (absence non vide de sens).');
    await B.close();

    // ══ SESSION C — la portée est bien LA SESSION, et rien d'autre ════════════════════════════
    // Dans l'application : on consomme les deux amorces, on FERME, on rouvre — elles doivent
    // revenir. C'est la contrepartie de « disparition par session » : une portée persistante
    // laisserait un lecteur revenu des jours plus tard devant un document qu'il croit plat.
    const C = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errC = [];
    C.on('pageerror', (e) => errC.push(e.message));
    await horsReseau(C);
    await C.goto(PAGE);
    await C.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await C.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    const ouvrir = async () => {
      await C.evaluate((d) => window.adocPresentOpenWithDoc(d), DOC);
      await C.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
      await C.waitForTimeout(400);
    };
    await ouvrir();
    assert.equal((await releve(C)).nbDiapo, 1, 'première session : l\'amorce de diapositive est là');
    await C.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await attendrePorte(C, 1);
    assert.equal((await releve(C)).nbPorte, 1, 'première session : l\'amorce de page est là');
    await C.locator('.cc-ws-present-door-btn').nth(1).click();
    await C.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    r = await releve(C);
    assert.equal(r.nbVisible, 0,
      'première session : plus aucune amorce VISIBLE. Le compte de noeuds vaut ' + r.nbTotal
      + ' — refermer la porte par Maison la masque (hidden + display:none) sans réécrire son '
      + 'contenu, le balisage consommé y reste donc, sans boîte ni entrée d\'accessibilité. '
      + 'L\'assertion suivante vérifie qu\'il est bien REMPLACÉ, jamais accumulé.');
    // Réouverture dans la MÊME session : le peuplement réécrit textEl.innerHTML en entier, donc le
    // balisage consommé disparaît et aucun second ne s'ajoute. Sans cette vérification, l'assertion
    // de visibilité ci-dessus laisserait passer une accumulation silencieuse.
    await C.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await attendrePorte(C, 1);
    r = await releve(C);
    assert.equal(r.nbPorte, 0, 'réouverture dans la même session : aucune amorce de page');
    assert.equal(r.nbTotal, 0, 'et le balisage consommé a bien été remplacé, jamais accumulé');
    await C.locator('.cc-ws-present-door-btn').nth(1).click();
    await C.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));

    await C.evaluate(() => window.adocPresentClose());
    await C.waitForFunction(() => window._adocPresentState === null);
    await ouvrir();
    r = await releve(C);
    assert.equal(r.drapeauDiapo, false, 'session neuve : les drapeaux repartent de zéro');
    assert.equal(r.drapeauPorte, false, 'session neuve : idem pour celui de la porte');
    assert.equal(r.nbDiapo, 1, 'session neuve : l\'amorce de diapositive revient — la portée est la SESSION');
    await C.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await attendrePorte(C, 1);
    r = await releve(C);
    assert.equal(r.nbPorte, 1, 'session neuve : l\'amorce de page revient elle aussi');
    assert.deepEqual(r.clesStockage, [], 'et toujours rien en localStorage, dans aucune des deux sessions');
    assert.deepEqual(errC, [], 'aucune erreur JS : ' + errC.join(' | '));
    console.log('PASS ' + (++n) + '/7 — portée = la session : fermer puis rouvrir les fait revenir, sans jamais toucher au stockage.');
    await C.close();

    // ══ SESSIONS D et E — L'AMORCE NE COÛTE AUCUN PIXEL À LA COLONNE ═════════════════════════
    // La régression qui a fait échouer verify-porte-revelation : dans le flux, l'amorce retirait
    // 56 px au plafond de hauteur de la colonne, si bien qu'une page de 8 paragraphes — juste sous
    // le seuil de révélation, calibré à la mesure — se mettait à défiler. Le seuil devenait faux.
    // Deux sessions, MÊME page maximale (14 paragraphes), MÊME fenêtre : la seule différence est la
    // présence de l'amorce, obtenue par de vrais gestes, jamais par un drapeau forcé à la main.
    const { p: D, err: errD } = await demarrerExport(browser);
    await D.evaluate(() => window.adocPresentOpenDeepDive('n4'));
    await attendrePorte(D, 4);
    const avec = await releve(D);
    assert.equal(avec.nbPorte, 1, 'préalable session D : l\'amorce est bien affichée');
    assert.ok(avec.colonne.visible > 400,
      'NON-VACUITÉ : la colonne doit réellement être haute ici (' + avec.colonne.visible + ' px) — '
      + 'sous le seuil de révélation, rien n\'est masqué. Si ce chiffre s\'effondre, la comparaison '
      + 'qui suit ne mesure plus rien.');
    assert.equal(avec.colonne.recouvre, false,
      'l\'amorce ne doit RECOUVRIR à aucun endroit la colonne de la porte, même à son plafond de '
      + 'hauteur : le plafond (100% - 60px, centrée) laisse une bande libre au-dessus, et c\'est là '
      + 'qu\'elle se pose');
    assert.deepEqual(errD, [], 'aucune erreur JS : ' + errD.join(' | '));
    await D.close();

    const { p: E, err: errE } = await demarrerExport(browser);
    await E.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await attendrePorte(E, 1);
    await E.locator('.cc-ws-present-door-btn').nth(1).click();   // Maison : consomme l'amorce
    await E.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await E.evaluate(() => window.adocPresentOpenDeepDive('n4'));
    await attendrePorte(E, 4);
    const sans = await releve(E);
    assert.equal(sans.nbPorte, 0, 'préalable session E : l\'amorce est bien absente');
    assert.equal(avec.colonne.visible, sans.colonne.visible,
      'le PLAFOND de hauteur de la colonne doit être identique avec et sans l\'amorce — '
      + avec.colonne.visible + ' px contre ' + sans.colonne.visible + ' px. S\'ils diffèrent, '
      + 'l\'amorce consomme de la place et le seuil de révélation (calibré 652/652 à 8 paragraphes, '
      + '676/718 à 9) devient faux dès qu\'elle s\'affiche.');
    assert.equal(avec.colonne.contenu, sans.colonne.contenu,
      'et le contenu de la colonne doit être identique lui aussi : ' + avec.colonne.contenu
      + ' px contre ' + sans.colonne.contenu + ' px');
    assert.deepEqual(errE, [], 'aucune erreur JS : ' + errE.join(' | '));
    console.log('PASS ' + (++n) + '/7 — coût nul pour la colonne : plafond ' + avec.colonne.visible
      + ' px et contenu ' + avec.colonne.contenu + ' px, identiques avec et sans l\'amorce, sans recouvrement.');
    await E.close();

    console.log('\nTOUS LES TESTS D\'AMORCES PASSENT (' + n + '/7)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
