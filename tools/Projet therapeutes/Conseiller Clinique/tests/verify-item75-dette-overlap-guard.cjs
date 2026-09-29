// STUDIO CLINIQUE — Item 75, nettoyage de la dette, Sujet 1 : preuve réelle du garde-fou
// anti-chevauchement entre cartes. Utilise la VRAIE fonction exposée window.adocApplyCardPosition
// (jamais réimplémentée) — c'est le point d'entrée "panneau de propriétés x/y/w/h" ; le point
// d'entrée "glissement à la souris" (docCard.onmousedown) partage EXACTEMENT le même garde-fou
// (mêmes fonctions adocRectsOverlap/adocCardOverlapsSiblings, même séquence clamp-puis-vérifie,
// cf. studio-clinique-core.js) — confirmé par lecture directe du code, jamais une seconde
// implémentation. Reconstituer un ClinicalDocument Carrousel complet et valide (schéma AJV) pour
// piloter aussi le glissement réel à la souris dépasserait la portée de ce test ciblé sur le
// garde-fou lui-même ; ce choix de portée est documenté tel quel dans le rapport de lot, pas caché.
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(PAGE_PATH);

  const setup = await page.evaluate(() => {
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;width:1024px;height:768px;';
    document.body.appendChild(container);
    const cardA = document.createElement('section');
    cardA.className = 'adoc-sc-card'; cardA.id = 'card-a';
    cardA.style.cssText = 'position:absolute;left:0px;top:0px;width:400px;height:300px;';
    const cardB = document.createElement('section');
    cardB.className = 'adoc-sc-card'; cardB.id = 'card-b';
    cardB.style.cssText = 'position:absolute;left:500px;top:0px;width:400px;height:300px;';
    container.appendChild(cardA); container.appendChild(cardB);

    const blockA = { id: 'card-a', type: 'card', style: { x: 0, y: 0, width: 400, height: 300 }, content: { title: 'A', imageRef: null, imageAlt: null, blocks: [] } };
    const blockB = { id: 'card-b', type: 'card', style: { x: 500, y: 0, width: 400, height: 300 }, content: { title: 'B', imageRef: null, imageAlt: null, blocks: [] } };
    window._adocArtifacts = { k1: { _adocGenerationEngine: 'structured', _adocStructuredDoc: { documentKind: 'carrousel', blocks: [blockA, blockB] } } };
    window._adocWsState = window._adocWsState || {};
    window._adocWsState.storeKey = 'k1';
    window._adocBlockEditState = { storeKey: 'k1', blockId: 'card-a', panelEl: null, pendingBlock: null, originalBlock: blockA, zone: 'position' };
    return { ok: typeof window.adocApplyCardPosition === 'function' };
  });
  assert.ok(setup.ok, 'window.adocApplyCardPosition doit être exposé');

  // ── Test 1 : tentative de chevauchement depuis une position saine → REFUSÉE ──
  // Carte A [0,400]x[0,300] → x=300 donnerait [300,700]x[0,300], chevauchant B [500,900]x[0,300].
  let r = await page.evaluate(() => {
    window.adocApplyCardPosition('x', 300, true);
    return window._adocArtifacts.k1._adocStructuredDoc.blocks[0].style.x;
  });
  assert.equal(r, 0, 'Le chevauchement doit être refusé : x doit rester à sa dernière valeur valide (0), jamais 300');
  console.log('PASS 1/4 — tentative de superposition (x=300, chevaucherait B) refusée : x reste à 0, jamais appliquée');

  // ── Test 2 : déplacement NORMAL sans chevauchement → toujours autorisé (non-régression) ──
  r = await page.evaluate(() => {
    window.adocApplyCardPosition('x', 50, true);
    return window._adocArtifacts.k1._adocStructuredDoc.blocks[0].style.x;
  });
  assert.equal(r, 50, 'Un déplacement qui ne crée aucun chevauchement doit rester appliqué normalement (non-régression)');
  console.log('PASS 2/4 — déplacement normal (x=50, aucun chevauchement) toujours appliqué — non-régression confirmée');

  // ── Test 3 : carte DÉJÀ chevauchante (document existant antérieur au garde-fou) reste
  // librement déplaçable — décision explicite du CDC, pas un oubli. ──
  r = await page.evaluate(() => {
    const blockA = window._adocArtifacts.k1._adocStructuredDoc.blocks[0];
    blockA.style = { x: 450, y: 0, width: 400, height: 300 }; // chevauche déjà B [500,900]
    window.adocApplyCardPosition('y', 10, true);
    return { x: blockA.style.x, y: blockA.style.y };
  });
  assert.equal(r.y, 10, 'Une carte déjà chevauchante avant ce geste doit rester librement modifiable (le garde-fou ne bloque jamais un état préexistant, seulement une création nouvelle)');
  console.log('PASS 3/4 — carte déjà chevauchante (document existant) reste librement déplaçable, comportement explicite confirmé (y appliqué : ' + r.y + ')');

  // ── Test 4 : ce même geste, une fois la carte sortie de tout chevauchement, redevient soumis
  // au garde-fou normalement (pas de "permission" durablement acquise). ──
  r = await page.evaluate(() => {
    const blockA = window._adocArtifacts.k1._adocStructuredDoc.blocks[0];
    blockA.style = { x: 50, y: 10, width: 400, height: 300 }; // plus de chevauchement
    window.adocApplyCardPosition('x', 300, true); // retenterait un chevauchement neuf
    return blockA.style.x;
  });
  assert.equal(r, 50, 'Une fois hors de tout chevauchement, le garde-fou redevient pleinement actif — aucune permission durable');
  console.log('PASS 4/4 — garde-fou réactivé dès que la carte est saine : nouvelle tentative de chevauchement (x=300) de nouveau refusée');

  console.log('\n=== TOUS LES TESTS ITEM 75 DETTE — SUJET 1 (GARDE-FOU ANTI-CHEVAUCHEMENT) PASSENT (4/4) ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
