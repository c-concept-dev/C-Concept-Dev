// BILAN D'EMBARQUEMENT DES IMAGES — le rapport était produit puis jeté, et le libellé de reprise
// affichait « image NaN sur undefined ».
//
// CE QUE CE TEST DOIT PROUVER, et qu'une lecture du source ne prouve pas : que le bilan paraît
// réellement dans la conversation au bout du VRAI chemin du bouton, et que le libellé du bouton ne
// dit jamais NaN pendant une reprise. Les deux ne se manifestent qu'à l'exécution.
//
// AUCUNE SORTIE RÉSEAU : /fetch-image est intercepté, et c'est justement ce qui permet d'éprouver
// les cas rares — quota atteint à mi-parcours, rafale reprise — sans dépenser un quota qui, dans la
// vraie vie, manque déjà. La clé posée est une valeur d'essai pour une application servie
// localement, jamais un secret.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const QUOTA = 200; // ADOC_EXPORT_IMG_QUOTA_HORAIRE, redit ici plutôt que lu depuis la production

// Un document dont chaque diapositive porte UNE image, donc une requête chacune.
//
// content.query, et NON content.imageRef : c'est `query` que le rendu d'un bloc image émet en
// data-pexels, `imageRef` étant le champ de la COUVERTURE d'une carte. Mesuré en écrivant ce test :
// avec imageRef, adocEsc(b.content.query) produit la chaîne littérale « undefined », les quatre
// diapositives donnent donc quatre requêtes IDENTIQUES que le dédoublonnage réduit à une seule.
const docAvecImages = (n) => ({
  documentKind: 'presentation', title: 'Cours', citations: [],
  blocks: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, type: 'card',
    content: { title: 'D' + i, imageRef: null, imageAlt: null, blocks: [
      { id: 'im' + i, type: 'image', content: { query: 'therapy room ' + i, alt: 'Une scène ' + i, widthPercent: 100 },
        citationIds: [], validation: {} }] } })),
  deepDives: [],
});

async function ouvrir(browser, reponseFetchImage) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const erreurs = [];
  const FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
  page.on('pageerror', (e) => { if (e.message !== FLAKE) erreurs.push(e.message); });
  page.on('download', (d) => { d.delete().catch(() => {}); });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'valeur-d-essai-locale'));
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith('file:')) return route.continue();
    if (u.includes('/fetch-image')) return route.fulfill(reponseFetchImage);
    return route.abort();
  });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.adocWsExportStandalonePresentation === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  return { page, erreurs };
}

// Gréement minimal de l'atelier, et observation du libellé du bouton AVANT de lancer l'export :
// un relevé après coup ne verrait que le dernier état, or c'est la suite des états qui est en jeu.
async function lancerExport(page, doc) {
  await page.evaluate((d) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts['k'] = { name: 'Cours', fmt: 'html', _adocStructuredDoc: d,
      _adocCapabilities: { workspace: true }, _adocStructuredSnapshot: null };
    window._adocWsState = window._adocWsState || {};
    window._adocWsState.storeKey = 'k';
    const btn = document.getElementById('cc-ws-export-standalone-presentation-btn');
    if (btn) btn.hidden = false;
    window.__libelles = [];
    if (btn) {
      const o = new MutationObserver(() => window.__libelles.push(btn.textContent));
      o.observe(btn, { childList: true, characterData: true, subtree: true });
    }
  }, doc);
  await page.evaluate(() => window.adocWsExportStandalonePresentation());
}

const messages = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#adoc-messages .adoc-msg.assistant')].map((d) => d.textContent));

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  try {
    // ══ 1 à 4 — LA FONCTION PURE, éprouvée sans lancer d'export ═══════════════════════════════
    const { page, erreurs } = await ouvrir(browser, { status: 500, body: 'boom' });
    const msg = (r) => page.evaluate((x) => window.adocExportImageRapportMessage(x), r);

    assert.equal(await msg(null), null, 'aucun rapport : aucun message');
    assert.equal(await msg({ requetes: 0, echecs: [] }), null,
      'aucun embarquement demandé (embedImages:false) : aucun message, jamais un bilan vide');
    console.log('PASS ' + (++n) + '/8 — silencieuse quand il n\'y a rien à dire.');

    const toutBon = await msg({ requetes: 130, telecharges: 130, echecs: [], koBase64: 11980 });
    assert.match(toutBon, /130 images sur 130 embarquées/, 'le cas réussi dit le compte : ' + toutBon);
    assert.match(toutBon, /11,7 Mo d'images/,
      'et le poids, qui est le critère d\'envoi par courriel : ' + toutBon);
    assert.doesNotMatch(toutBon, /aplat|quota/,
      'sans parler d\'aplat ni de quota quand il n\'y en a pas : ' + toutBon);
    const petit = await msg({ requetes: 2, telecharges: 2, echecs: [], koBase64: 180 });
    assert.doesNotMatch(petit, /Mo/,
      'sous 1 Mo, le poids n\'apprend rien et n\'est pas dit : ' + petit);
    console.log('PASS ' + (++n) + '/8 — cas réussi : compte, poids au-delà de 1 Mo, et rien d\'autre.');

    const replis = await msg({ requetes: 10, telecharges: 7, koBase64: 600,
      echecs: [{ rang: 3, requete: 'a', cause: 'CDN 404', quotaExterne: false },
               { rang: 5, requete: 'b', cause: 'aucune photo', quotaExterne: false },
               { rang: 9, requete: 'c', cause: 'CDN 500', quotaExterne: false }] });
    assert.match(replis, /7 images sur 10 embarquées/, 'le compte tient compte des replis : ' + replis);
    assert.match(replis, /3 sont remplacées par un aplat portant son texte alternatif/,
      'et les replis sont nommés : ' + replis);
    assert.doesNotMatch(replis, /quota/,
      'sans invoquer le quota quand la cause est ailleurs — ce serait une fausse explication : ' + replis);
    const unSeul = await msg({ requetes: 3, telecharges: 2, koBase64: 200,
      echecs: [{ rang: 2, requete: 'a', cause: 'CDN 404', quotaExterne: false }] });
    assert.match(unSeul, /2 images sur 3 embarquées/, 'pluriel du compte : ' + unSeul);
    assert.match(unSeul, /1 est remplacée/, 'singulier du repli : ' + unSeul);
    console.log('PASS ' + (++n) + '/8 — replis comptés et nommés, sans attribuer au quota ce qui vient d\'ailleurs.');

    const quota = await msg({ requetes: 130, telecharges: 71, koBase64: 6500,
      quotaExterneAtteint: true, quotaAtteintALaRequete: 72,
      echecs: Array.from({ length: 59 }, (_, i) => ({ rang: 72 + i, requete: 'q' + i,
        cause: '/fetch-image 429 — Pexels API error (HTTP 429)', quotaExterne: true })) });
    assert.match(quota, /71 images sur 130 embarquées/, 'compte : ' + quota);
    assert.match(quota, /Dont 59 faute de quota/, 'la cause, chiffrée : ' + quota);
    assert.match(quota, new RegExp(QUOTA + ' par heure'), 'la limite, nommée : ' + quota);
    assert.match(quota, /atteint à la requête 72/, 'et le rang où elle est tombée : ' + quota);
    assert.match(quota, /restent dans le fichier/,
      'plus le fait que les images obtenues sont conservées — sans quoi elle croirait devoir tout refaire');
    console.log('PASS ' + (++n) + '/8 — quota : cause nommée, chiffrée, située, et son conséquent pratique dit.');

    // ══ 5 et 6 — LE VRAI CHEMIN DU BOUTON, avec une RAFALE reprise (500) ══════════════════════
    await lancerExport(page, docAvecImages(1));
    // On attend la FIN, puis on juge la suite complète des libellés. Attendre d'abord le libellé de
    // reprise ferait tomber le test sur cette attente plutôt que sur l'assertion nommée : le défaut
    // serait bien détecté, mais par un délai dépassé qui ne dit pas ce qui manque.
    await page.waitForFunction(() =>
      !/Préparation/.test(document.getElementById('cc-ws-export-standalone-presentation-btn').textContent),
      null, { timeout: 30000 });
    const libelles = await page.evaluate(() => window.__libelles);
    const fautifs = libelles.filter((l) => /NaN|undefined/.test(l));
    assert.deepEqual(fautifs, [],
      'AUCUN libellé ne doit contenir NaN ni undefined. C\'était le défaut : l\'événement d\'attente '
      + 'ne porte ni index ni total, et le gestionnaire les lisait quand même. Relevé fautif : '
      + JSON.stringify(fautifs));
    assert.ok(libelles.some((l) => /image 1 sur 1/.test(l)), 'l\'avancement est dit : ' + JSON.stringify(libelles.slice(0, 3)));
    assert.ok(libelles.some((l) => /image 1 sur 1, nouvelle tentative dans \d+ s/.test(l)),
      'et la reprise GARDE son contexte — c\'est la même image qu\'on retente : ' + JSON.stringify(libelles));
    console.log('PASS ' + (++n) + '/8 — reprise réelle : aucun NaN, et le rang est conservé pendant l\'attente.');

    await page.waitForFunction(() =>
      [...document.querySelectorAll('#adoc-messages .adoc-msg.assistant')].some((d) => /Export terminé/.test(d.textContent)),
      null, { timeout: 30000 });
    const apresRafale = (await messages(page)).filter((t) => /Export terminé/.test(t));
    assert.equal(apresRafale.length, 1, 'un seul bilan, jamais deux');
    assert.match(apresRafale[0], /0 image sur 1 embarquée/, 'bilan après rafale perdue : ' + apresRafale[0]);
    assert.match(apresRafale[0], /1 est remplacée par un aplat/, 'et le repli est dit : ' + apresRafale[0]);
    assert.doesNotMatch(apresRafale[0], /quota/,
      'un 500 générique n\'est PAS un quota : le bilan ne doit pas l\'inventer — ' + apresRafale[0]);
    const btnFinal = await page.evaluate(() =>
      document.getElementById('cc-ws-export-standalone-presentation-btn').textContent);
    assert.doesNotMatch(btnFinal, /Préparation/, 'le bouton est rendu à son libellé : ' + btnFinal);
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/8 — le bilan paraît réellement dans la conversation, une seule fois.');
    await page.close();

    // ══ 7 et 8 — LE VRAI CHEMIN, avec un QUOTA épuisé (429 nommé Pexels) ═════════════════════
    const { page: p2, erreurs: err2 } = await ouvrir(browser,
      { status: 429, body: 'Pexels API error (HTTP 429): Too Many Requests' });
    await lancerExport(p2, docAvecImages(4));
    await p2.waitForFunction(() =>
      [...document.querySelectorAll('#adoc-messages .adoc-msg.assistant')].some((d) => /Export terminé/.test(d.textContent)),
      null, { timeout: 40000 });
    const bilanQuota = (await messages(p2)).filter((t) => /Export terminé/.test(t))[0];
    assert.match(bilanQuota, /0 image sur 4 embarquée/, 'compte : ' + bilanQuota);
    assert.match(bilanQuota, /Dont 4 faute de quota/,
      'un 429 NOMMÉ Pexels est bien attribué au quota, à la différence du 500 ci-dessus : ' + bilanQuota);
    assert.match(bilanQuota, new RegExp(QUOTA + ' par heure'), 'la limite est dite : ' + bilanQuota);
    const lib2 = await p2.evaluate(() => window.__libelles);
    assert.deepEqual(lib2.filter((l) => /NaN|undefined/.test(l)), [], 'aucun NaN non plus ici');
    // Un quota épuisé n'est JAMAIS rejoué : aucune attente ne doit donc apparaître.
    assert.deepEqual(lib2.filter((l) => /nouvelle tentative/.test(l)), [],
      'un quota épuisé ne se réessaie pas — chaque reprise consommerait le quota qui manque déjà : '
      + JSON.stringify(lib2));
    assert.deepEqual(err2, [], 'aucune erreur JS : ' + err2.join(' | '));
    console.log('PASS ' + (++n) + '/8 — quota épuisé : cause correctement attribuée, et aucune reprise tentée.');

    const rapport = await p2.evaluate(() => window._adocLastExportImageReport);
    assert.equal(rapport.quotaExterneAtteint, true,
      'préalable : le rapport porte bien le drapeau de quota, c\'est lui que le bilan lit');
    assert.equal(rapport.requetes, 4, 'et le nombre de requêtes');
    console.log('PASS ' + (++n) + '/8 — le bilan lit le rapport réel, pas une reconstitution.');
    await p2.close();

    console.log('\nTOUS LES TESTS DE BILAN D\'IMAGES PASSENT (' + n + '/8)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
