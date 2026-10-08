// LA PORTE LOCALE — elle ne doit s'ouvrir QUE sur 127.0.0.1 ou localhost, ET avec le paramètre.
//
// Ce test ne lit pas `hidden` : c'est précisément l'erreur qui a fait passer verify-banc-sans-
// connexion 6/6 alors qu'un humain ne voyait que l'écran de connexion. Il demande au navigateur
// QUEL ÉLÉMENT recevrait le clic au centre de la fenêtre et au centre du champ Narration.
//
// Les hôtes sont éprouvés pour de vrai : Playwright intercepte les requêtes et sert les fichiers
// du disque sous n'importe quel nom d'hôte, y compris celui du site publié. Aucun réseau.
//
//   NODE_PATH=<playwright> node tests/verify-porte-locale.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Ce que l'œil atteint, demandé au navigateur. `elementFromPoint` rend l'élément du DESSUS :
// un élément présent dans le DOM mais recouvert ne s'y trouve pas.
const REGARDER = () => {
  const ecran = document.getElementById('cc-login-screen');
  const s = ecran ? getComputedStyle(ecran) : null;
  const b = ecran ? ecran.getBoundingClientRect() : null;
  const nom = (el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '') : null;
  const au = (x, y) => nom(document.elementFromPoint(x, y));
  return {
    hote: location.hostname,
    parametre: location.search,
    marqueLocale: document.documentElement.hasAttribute('data-atelier-local'),
    bandeau: !!document.getElementById('cc-atelier-local-bandeau'),
    ecranVisible: !!(s && s.display !== 'none' && b.width > 0 && b.height > 0),
    ecranCouvre: b ? Math.round(b.width) + 'x' + Math.round(b.height) : null,
    // LA QUESTION QUI COMPTE : qui recevrait un clic au milieu de la fenêtre ?
    auCentre: au(Math.round(innerWidth / 2), Math.round(innerHeight / 2)),
    champMotDePasseAuCentre: (() => {
      const i = document.getElementById('cc-login-password');
      if (!i) return false;
      const r = i.getBoundingClientRect();
      if (r.width === 0) return false;
      return nom(document.elementFromPoint(Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2))) === 'input#cc-login-password';
    })(),
    // Aucune clé n'a été posée : c'est ce qui garantit que rien n'est contourné côté serveur.
    cleEnStock: (() => { try { return !!localStorage.getItem('workerApiKey'); } catch (e) { return 'illisible'; } })(),
  };
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    page.on('dialog', (d) => d.accept());
    // Tout est servi du disque, quel que soit l'hôte demandé. Rien ne sort sur le réseau.
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      const p = path.join(RACINE, decodeURIComponent(u.pathname));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        return route.fulfill({ status: 404, body: '' });
      }
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(p)] || 'application/octet-stream',
                             body: fs.readFileSync(p) });
    });

    const voir = async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('cc-login-screen') !== null);
      await page.waitForTimeout(150);
      return page.evaluate(REGARDER);
    };
    // LES CONDITIONS D'HÔTE S'ÉPROUVENT SUR L'APPLICATION, où la porte vit. La page du banc
    // en est une copie, mais son panneau se pose PAR-DESSUS l'écran de connexion tant qu'il est
    // ouvert : y mesurer « qui reçoit le clic au centre » mesurerait le panneau, pas la porte.
    // Le chemin humain complet, panneau réduit, est éprouvé au contrôle 6, sur la page du banc.
    const PAGE = '/studio-clinique.html';
    const BANC = '/banc-chutier/chutier.html';

    // ── 1. Le site publié, AVEC le paramètre : l'écran de connexion reste ─────────────────────
    const prod = await voir('https://c-concept-dev.github.io' + PAGE + '?atelier-local=1');
    assert.equal(prod.hote, 'c-concept-dev.github.io');
    assert.equal(prod.ecranVisible, true, 'sur le site publié, l\'écran de connexion DOIT rester affiché');
    assert.equal(prod.marqueLocale, false, 'et la marque locale ne doit pas être posée');
    assert.equal(prod.bandeau, false, 'ni le bandeau');
    assert.equal(prod.champMotDePasseAuCentre, true,
      'c\'est bien le champ de mot de passe qui reçoit le clic : ' + prod.auCentre);
    pass('site publié + paramètre : écran de connexion affiché, ' + prod.ecranCouvre + ', clic sur ' + prod.auCentre + '.');

    // ── 2. Un hôte quelconque, AVEC le paramètre : l'écran reste ──────────────────────────────
    const autre = await voir('http://exemple-quelconque.test' + PAGE + '?atelier-local=1');
    assert.equal(autre.ecranVisible, true, 'un hôte quelconque ne doit pas ouvrir la porte');
    assert.equal(autre.marqueLocale, false);
    pass('hôte quelconque (' + autre.hote + ') + paramètre : écran de connexion affiché.');

    // ── 3. 127.0.0.1 SANS le paramètre : l'écran reste ────────────────────────────────────────
    const localSansParam = await voir('http://127.0.0.1' + PAGE);
    assert.equal(localSansParam.ecranVisible, true, 'sans le paramètre, l\'écran reste — les deux conditions sont nécessaires');
    assert.equal(localSansParam.marqueLocale, false);
    pass('127.0.0.1 sans paramètre : écran de connexion affiché.');

    // ── 4. Un paramètre VOISIN ne suffit pas ──────────────────────────────────────────────────
    const voisin = await voir('http://127.0.0.1' + PAGE + '?atelier=local');
    assert.equal(voisin.ecranVisible, true, '« atelier=local » n\'est pas « atelier-local »');
    pass('127.0.0.1 avec un paramètre voisin (?atelier=local) : écran de connexion affiché.');

    // ── 5. 127.0.0.1 ET localhost AVEC le paramètre : l'espace de travail est ATTEINT ─────────
    for (const hote of ['127.0.0.1', 'localhost']) {
      const v = await voir('http://' + hote + PAGE + '?atelier-local=1');
      assert.equal(v.ecranVisible, false, 'sur ' + hote + ' avec le paramètre, l\'écran doit disparaître');
      assert.equal(v.marqueLocale, true, 'et la marque locale être posée');
      assert.equal(v.bandeau, true, 'et le bandeau dire ce que ce mode ne permet pas');
      assert.notEqual(v.auCentre, 'input#cc-login-password',
        'ce n\'est plus le champ de mot de passe qui reçoit le clic : ' + v.auCentre);
      // AUCUNE CLÉ POSÉE : la porte ne déverrouille rien côté serveur.
      assert.equal(v.cleEnStock, false, 'la porte locale ne doit poser AUCUNE clé : ' + v.cleEnStock);
    }
    pass('127.0.0.1 et localhost + paramètre : écran masqué, marque et bandeau posés, aucune clé en stock.');

    // ── 6. LE CHAMP NARRATION EST ATTEINT PAR LE POINTEUR, panneau réduit ─────────────────────
    // Le test qui manquait. Celui d'avant lisait `boite.hidden === false` — vrai pendant que
    // l'écran de connexion recouvrait tout. Celui-ci clique pour de bon.
    await page.goto('http://127.0.0.1' + BANC + '?atelier-local=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function'
      && document.getElementById('bc-atelier') !== null);
    // On emprunte le champ de fichier, comme un humain : « Ouvrir dans l'espace de travail »
    // reste désactivé tant qu'aucun document n'a été chargé.
    const chemin = path.join(RACINE, 'banc-chutier', 'entrees');
    const fichier = fs.existsSync(chemin)
      ? fs.readdirSync(chemin).filter((x) => /\.html?$/i.test(x)).sort()[0] : null;
    assert.ok(fichier, 'il faut un export HTML dans banc-chutier/entrees/ pour ce contrôle');
    await page.setInputFiles('#bc-export', path.join(chemin, fichier));
    await page.waitForFunction(() => /Export lu/.test(document.getElementById('bc-etat').textContent),
      { timeout: 30000 });
    await page.click('#bc-atelier');
    await page.waitForFunction(() => /espace de travail/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    await page.click('#bc-reduire');
    await page.waitForTimeout(500);
    const narration = await page.evaluate(async () => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId) || document.getElementById('root:card-title:' + e.cardId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 400));
      const champ = document.querySelector('[data-editor-narration]');
      if (!champ) return { erreur: 'champ absent du DOM' };
      champ.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 300));
      const r = champ.getBoundingClientRect();
      const dessus = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return {
        hiddenCommeAvant: !!(champ.closest('.cc-editor-narration') || {}).hidden,
        atteintParLePointeur: dessus === champ || (dessus && champ.contains(dessus)),
        dessus: dessus ? dessus.tagName.toLowerCase() + (dessus.className ? '.' + String(dessus.className).trim().split(/\s+/)[0] : '') : null,
        libelle: (document.querySelector('.cc-editor-narration-etape') || {}).textContent,
      };
    });
    assert.equal(narration.erreur, undefined, narration.erreur);
    assert.equal(narration.atteintParLePointeur, true,
      'le champ Narration doit être ATTEINT par le pointeur, panneau réduit — ce qui recevrait '
      + 'le clic : ' + narration.dessus);
    assert.match(narration.libelle || '', /Diapositive/, 'libellé d\'étape : ' + narration.libelle);
    // Et on y écrit pour de bon, au clavier, pas par script.
    await page.click('[data-editor-narration]');
    await page.keyboard.type('Essai du passage humain.');
    const ecrit = await page.evaluate(() => {
      const d = window._adocArtifacts['banc']._adocStructuredDoc;
      return { n: (d.narration || []).length, texte: (d.narration || [])[0] && d.narration[0].text };
    });
    assert.equal(ecrit.n, 1, 'une narration tapée au clavier doit entrer dans le document');
    assert.equal(ecrit.texte, 'Essai du passage humain.');
    console.log('      champ atteint, libellé « ' + (narration.libelle || '').trim()
      + ' », narration tapée au clavier et enregistrée dans le document');
    pass('panneau réduit : le champ Narration est atteint par le pointeur et reçoit la frappe.');

    // ── 7. La page du banc n'est pas une copie PÉRIMÉE de l'application ───────────────────────
    // Elle est engendrée depuis studio-clinique.html. Si la porte change dans l'application sans
    // que la page soit régénérée, les contrôles 1 à 5 porteraient sur une porte, et le contrôle 6
    // sur une autre — chacun passerait, et l'ensemble ne prouverait rien.
    const porte = /local = \(location\.hostname === '127\.0\.0\.1' \|\| location\.hostname === 'localhost'\)[\s\S]{0,120}?has\('atelier-local'\)/;
    const appli = fs.readFileSync(path.join(RACINE, 'studio-clinique.html'), 'utf8');
    const banc = fs.readFileSync(path.join(RACINE, 'banc-chutier', 'chutier.html'), 'utf8');
    assert.ok(porte.test(appli), 'la porte doit être dans studio-clinique.html');
    assert.ok(porte.test(banc), 'la page du banc doit porter la MÊME porte — régénérez-la avec '
      + 'tests/forger-banc-chutier.cjs');
    pass('la page du banc porte la même porte locale que l\'application (copie à jour).');

    console.log('\nPASS verify-porte-locale — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
