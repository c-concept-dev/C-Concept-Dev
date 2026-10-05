// TEST AUTOMATIQUE DE L'ESSAI 1, en Chromium avec un micro factice.
//
// CE QU'IL PROUVE : les marqueurs sont datés en ÉCHANTILLONS et alignés sur le quantum de rendu ;
// le WAV produit a un en-tête exact, relu octet par octet par un lecteur écrit pour ça ; une prise
// survit à un rechargement d'onglet.
//
// CE QU'IL NE PROUVE PAS, et c'est écrit dans le rapport : rien de ce que fait SAFARI. Chromium
// accorde le micro factice sans boîte de dialogue et respecte les trois contraintes de traitement ;
// Safari peut refuser, livrer deux canaux, ou appliquer « Voix isolée ». Seul Christophe le verra.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lireWav } = require('./outils/lire-wav.cjs');
const { servir } = require('./outils/serveur.cjs');

const RACINE = __dirname;
const SORTIE = path.join(RACINE, 'mesures');

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const base = 'http://127.0.0.1:' + port;
  const navigateur = await chromium.launch({ args: [
    '--use-fake-device-for-media-stream',   // micro synthétique : un bip de 440 Hz
    '--use-fake-ui-for-media-stream',       // accorde la permission sans dialogue
    '--autoplay-policy=no-user-gesture-required',
  ] });
  let n = 0;
  const releve = { environnement: 'Chromium (Playwright) — micro factice', etapes: [] };
  try {
    const ctx = await navigateur.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(base + '/essai1-micro.html');

    // ── 1 — LE MICRO EST ACCORDÉ ET CE QU'IL LIVRE EST AFFICHÉ ──────────────────────────────
    assert.equal(await page.evaluate(() => window.__essai1Api.demanderMicro()), true,
      'le micro factice doit être accordé');
    const reglages = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#tblPeriph tbody tr')].map((tr) => [tr.children[0].textContent, tr.children[1].textContent]);
      return Object.fromEntries(t);
    });
    assert.ok(reglages['canaux livrés (getSettings)'], 'le nombre de canaux livrés doit être affiché');
    assert.ok(reglages['fréquence d\'échantillonnage'], 'la fréquence doit être affichée');
    ['echoCancellation', 'noiseSuppression', 'autoGainControl'].forEach((k) => {
      assert.ok(reglages[k] !== undefined, 'le traitement ' + k + ' doit être affiché (valeur réellement livrée)');
    });
    releve.etapes.push({ etape: 'reglages_micro', valeurs: reglages });
    console.log('PASS ' + (++n) + '/4 — micro accordé, réglages réellement livrés affichés : '
      + 'canaux=' + reglages['canaux livrés (getSettings)']
      + ', ' + reglages['fréquence d\'échantillonnage']
      + ', EC=' + reglages.echoCancellation + ' NS=' + reglages.noiseSuppression + ' AGC=' + reglages.autoGainControl);

    // ── 2 — MARQUEURS EN ÉCHANTILLONS, ALIGNÉS SUR LE QUANTUM ───────────────────────────────
    await page.evaluate(() => window.__essai1Api.demarrer());
    await page.waitForFunction(() => window.__essai1Api.ETAT.enCours === true, null, { timeout: 15000 });
    await page.waitForTimeout(3400);                       // laisse passer les 3 s de silence
    for (let k = 0; k < 5; k++) {                          // 5 marqueurs, espacés
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(420);
    }
    // Recul d'un numéro : ne doit RIEN effacer.
    const avantRecul = await page.evaluate(() => window.__essai1Api.ETAT.marqueurs.length);
    await page.keyboard.press('ArrowLeft');
    const apresRecul = await page.evaluate(() => ({
      nb: window.__essai1Api.ETAT.marqueurs.length, prochain: window.__essai1Api.ETAT.numCourant }));
    assert.equal(apresRecul.nb, avantRecul, 'reculer d\'un numéro ne doit effacer AUCUN marqueur');
    assert.equal(apresRecul.prochain, 5, 'mais le prochain numéro doit reculer (6 → 5)');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__essai1Api.arreter());
    await page.waitForFunction(() => !!window.__essai1, null, { timeout: 10000 });
    const r1 = await page.evaluate(() => window.__essai1);
    assert.equal(r1.marqueurs.length, 5, '5 marqueurs posés');
    const q = r1.mesures.quantum_echantillons;
    assert.ok(q > 0, 'le quantum de rendu doit être MESURÉ, jamais supposé : ' + q);
    r1.marqueurs.forEach((m, i) => {
      assert.ok(Number.isInteger(m.echantillon), 'marqueur ' + i + ' : un échantillon est un entier');
      assert.equal(m.echantillon % q, 0,
        'marqueur ' + i + ' (' + m.echantillon + ') doit tomber sur une frontière de quantum (' + q
        + ') — c\'est la preuve qu\'il est daté par l\'horloge AUDIO et non par Date.now()');
    });
    const croissants = r1.marqueurs.every((m, i) => i === 0 || m.echantillon > r1.marqueurs[i - 1].echantillon);
    assert.ok(croissants, 'les marqueurs doivent être strictement croissants');
    releve.etapes.push({ etape: 'marqueurs', quantum: q,
      granularite_ms: r1.mesures.granularite_marqueur_ms, marqueurs: r1.marqueurs, mesures: r1.mesures });
    console.log('PASS ' + (++n) + '/4 — marqueurs datés en échantillons, alignés sur le quantum de '
      + q + ' (' + r1.mesures.granularite_marqueur_ms + ' ms) ; recul sans effacement.');

    // ── 3 — LE WAV, RELU OCTET PAR OCTET ────────────────────────────────────────────────────
    const octets = await page.evaluate(async () => {
      const b = window.__essai1Api.ETAT.wav;
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    const wav = Buffer.from(octets);
    fs.mkdirSync(SORTIE, { recursive: true });
    fs.writeFileSync(path.join(SORTIE, 'essai1-chromium.wav'), wav);
    const info = lireWav(wav);
    assert.ok(info.valide, 'l\'en-tête WAV doit être exact. Problèmes : ' + info.problemes.join(' | '));
    assert.equal(info.canaux, 1, 'mono');
    assert.equal(info.bits, 16, '16 bits');
    assert.ok(info.duree_s > 3, 'la prise doit durer plus que les 3 s de silence : ' + info.duree_s + ' s');
    const ecart = Math.abs(r1.mesures.ecart_s);
    releve.etapes.push({ etape: 'wav', entete: info, ecart_echantillons_horloge_s: r1.mesures.ecart_s });
    console.log('PASS ' + (++n) + '/4 — WAV valide : mono, 16 bits, ' + info.echantillonnage + ' Hz, '
      + info.duree_s + ' s ; écart échantillons/horloge ' + r1.mesures.ecart_s + ' s.');

    // ── 4 — LA PRISE SURVIT À UN RECHARGEMENT ───────────────────────────────────────────────
    await page.reload();
    await page.waitForFunction(() => typeof window.__essai1Api === 'object');
    await page.click('#btnRecup');
    await page.waitForFunction(() => !!(window.__essai1 && window.__essai1.recupere), null, { timeout: 10000 });
    const r2 = await page.evaluate(() => window.__essai1);
    assert.equal(r2.marqueurs.length, r1.marqueurs.length,
      'après rechargement, les marqueurs doivent être retrouvés : ' + r2.marqueurs.length + ' au lieu de ' + r1.marqueurs.length);
    assert.deepEqual(r2.marqueurs.map((m) => m.echantillon), r1.marqueurs.map((m) => m.echantillon),
      'et à l\'échantillon près — une récupération approximative placerait les diapositives ailleurs');
    assert.ok(r2.octetsWav > 44, 'et le WAV doit être reconstructible depuis la réserve');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    releve.etapes.push({ etape: 'recuperation', marqueurs_retrouves: r2.marqueurs.length, octets_wav: r2.octetsWav });
    console.log('PASS ' + (++n) + '/4 — récupération après rechargement : ' + r2.marqueurs.length
      + ' marqueurs retrouvés à l\'échantillon près.');

    releve.verdict = 'les 4 contrôles passent en Chromium';
    fs.writeFileSync(path.join(SORTIE, 'essai1-chromium.json'), JSON.stringify(releve, null, 2), 'utf8');
    console.log('\nTOUS LES CONTRÔLES DE L\'ESSAI 1 PASSENT (' + n + '/4) — mesures dans mesures/essai1-chromium.json');
  } finally {
    await navigateur.close();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
