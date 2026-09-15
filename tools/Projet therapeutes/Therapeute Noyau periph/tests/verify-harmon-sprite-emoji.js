const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== Sprite : 55 symboles présents, tous <use> résolus ===');
  const spriteCheck = await page.evaluate(() => {
    const symbols = [...document.querySelectorAll('symbol[id]')].map(s => s.id);
    const uses = [...document.querySelectorAll('use')].map(u => (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace('#', ''));
    const missing = uses.filter(id => id && !symbols.includes(id));
    return { symbolCount: symbols.length, useCount: uses.length, missing: [...new Set(missing)] };
  });
  console.log('Nombre de symboles:', spriteCheck.symbolCount, '(attendu 55)');
  console.log('Nombre de <use> dans le DOM initial (accueil):', spriteCheck.useCount);
  console.log('Références <use> orphelines (id absent du sprite):', spriteCheck.missing.length ? spriteCheck.missing : 'aucune');

  console.log('=== .sc-icon visibles sur #cc-landing ont une taille réelle (ni 0x0 ni géante) ===');
  const iconSizes = await page.evaluate(() => {
    const landing = document.getElementById('cc-landing');
    return [...landing.querySelectorAll('svg.sc-icon')].map(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 || r.height > 0 };
    });
  });
  console.log('Icônes .sc-icon trouvées sur #cc-landing:', iconSizes.length, JSON.stringify(iconSizes));
  const brokenSizes = iconSizes.filter(s => s.w === 0 || s.h === 0 || s.w > 100 || s.h > 100);
  console.log('Icônes de taille suspecte (0 ou >100px):', brokenSizes.length ? JSON.stringify(brokenSizes) : 'aucune');

  console.log('=== Zéro emoji brut visible dans le DOM rendu (accueil) ===');
  const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
  const rawEmojiLanding = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'gu');
    const walker = document.createTreeWalker(document.getElementById('cc-landing'), NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const tag = n.parentElement && n.parentElement.closest('script,style');
        return tag ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const hits = [];
    let node;
    while ((node = walker.nextNode())) {
      const m = node.nodeValue.match(re);
      if (m) hits.push({ text: node.nodeValue.trim().slice(0, 60), match: m });
    }
    return hits;
  }, EMOJI_RE.source);
  console.log('Emoji trouvés dans le texte rendu de #cc-landing:', rawEmojiLanding.length ? JSON.stringify(rawEmojiLanding) : 'aucun');

  console.log('=== Démarrage conversation, vérification chrome sans emoji ===');
  await page.fill('#clinical-question', 'Techniques ICV pour trauma dissociatif');
  await page.click('#clinical-home-form button[type="submit"]');
  await page.waitForTimeout(500);

  const rawEmojiChat = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'gu');
    const walker = document.createTreeWalker(document.getElementById('assistdoc-screen') || document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let node;
    while ((node = walker.nextNode())) {
      const m = node.nodeValue.match(re);
      if (m) hits.push({ text: node.nodeValue.trim().slice(0, 60), match: m });
    }
    return hits;
  }, EMOJI_RE.source);
  console.log('Emoji trouvés dans le texte rendu de #assistdoc-screen:', rawEmojiChat.length ? JSON.stringify(rawEmojiChat) : 'aucun');

  console.log('=== Erreurs JS pendant le parcours ===', errors.length ? JSON.stringify(errors) : 'aucune');

  await browser.close();
})();
