// LES RÉPONSES IMPARFAITES D'UN VRAI MODÈLE — ce que mes contrôles ne voyaient pas.
//
// Défaut réel, essai du 19 octobre dans Safari, vrai Worker, vrai modèle : la page créée
// affichait un titre, un paragraphe, puis QUATRE CASES VIDES, et l'insertion faisait refuser
// l'affichage du document (« Validation de schéma échouée »). Aucun de mes 21 contrôles ne
// pouvait le voir : mon faux modèle répondait TOUJOURS parfaitement.
//
// Les champs d'un bloc sont FACULTATIFS dans emit_new_slide — ils dépendent du type — donc un
// modèle a parfaitement le droit de les omettre. Ce contrôle lui en fait exercer le droit.
//
// Pour chaque réponse imparfaite, on exige TROIS choses :
//   — aucune page invalide n'atteint l'aperçu ;
//   — rien n'est inséré, et rien ne reste d'insérable ;
//   — le document est INTACT, comparé champ à champ à son état d'avant.
//
//   NODE_PATH=<playwright> node tests/verify-page-generee-imparfaite.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

// Sept réponses qu'un vrai modèle peut produire, toutes permises par emit_new_slide.
const IMPARFAITES = [
  { nom: 'un paragraphe sans texte (le défaut réel du 19 octobre)',
    page: { title: 'Le stress au cœur du cercle vicieux', blocks: [
      { type: 'paragraph', text: 'Un premier paragraphe correct.' },
      { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }] } },
  { nom: 'une liste sans aucun élément',
    page: { title: 'Trois repères', blocks: [
      { type: 'paragraph', text: 'Voici les repères.' }, { type: 'list', ordered: false }] } },
  { nom: 'un type de bloc inconnu',
    page: { title: 'Une page', blocks: [{ type: 'accordeon', text: 'Replié.' }] } },
  // Celui-ci ne doit PAS être refusé : un champ inventé se jette, il ne casse pas la page.
  // La reconstruction recopie champ par champ ; `citation` n'est donc jamais repris, et la page
  // obtenue est valide. L'exiger refusée serait exiger le mauvais comportement.
  { nom: 'un champ supplémentaire inventé', accepte: true, intrus: 'citation',
    page: { title: 'Une page', blocks: [
      { type: 'paragraph', text: 'Un texte.', citation: 'Bowlby, 1969' }] } },
  { nom: 'un bloc image, malgré l’interdiction',
    page: { title: 'Une page', blocks: [
      { type: 'paragraph', text: 'Un texte.' }, { type: 'image', url: 'x.png', alt: 'une image' }] } },
  { nom: 'un tableau sans aucune ligne',
    page: { title: 'Comparaison', blocks: [{ type: 'table', headers: ['Avant', 'Après'] }] } },
  { nom: 'une page sans aucun bloc',
    page: { title: 'Une page vide', blocks: [] } },
];

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const etat = { reponse: null, appels: 0 };
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') {
      let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => {
        if (q.url !== '/') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
        etat.appels++;
        r.writeHead(200, { 'content-type': 'application/json' });
        r.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_new_slide', input: etat.reponse }] }));
      });
      return;
    }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => {
    try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {}
  }, port);
  const dialogues = [];
  page.on('dialog', (d) => { dialogues.push(d.message()); d.dismiss().catch(() => {}); });

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });

    for (const cas of IMPARFAITES) {
      etat.reponse = cas.page;
      // Document neuf à chaque cas, et empreinte exacte de son état d'avant.
      const avant = await page.evaluate(async (d) => {
        const cle = 'imparfait';
        window._adocArtifacts = window._adocArtifacts || {};
        window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
          _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
          _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
            blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
        await window.adocOpenWorkspace(cle);
        return JSON.stringify(window._adocArtifacts[cle]._adocStructuredDoc);
      }, PRESENTATION);

      await page.evaluate(() => {
        const d = window._adocArtifacts['imparfait']._adocStructuredDoc;
        document.getElementById(d.blocks[2].content.blocks[0].id)?.click();
      });
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
      await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Créer la page');
        b.click();
      });
      // On attend que le panneau se prononce, d'une façon ou d'une autre.
      await page.waitForFunction(() => {
        const r = document.querySelector('.cc-block-edit-result');
        return !!(document.querySelector('[data-page-apercu]')
          || (r && /incomplète|impossible/i.test(r.textContent || '')));
      }, { timeout: 20000 });

      const vu = await page.evaluate(() => {
        const r = document.querySelector('.cc-block-edit-result');
        const ps = window._adocPageInsertState;
        return { apercu: !!document.querySelector('[data-page-apercu]'),
                 message: (r && r.textContent || '').trim(),
                 armee: !!(ps && ps.page),
                 doc: JSON.stringify(window._adocArtifacts['imparfait']._adocStructuredDoc),
                 vides: [...document.querySelectorAll('[data-page-apercu] .cc-block-edit-text')]
                   .filter((e) => !(e.textContent || '').trim()).length,
                 // Le BRUT doit survivre au refus : c'est quand la page est refusée qu'on a
                 // besoin de savoir ce que le modèle avait répondu.
                 brut: window._adocDernierBrutPageNeuve
                   ? JSON.stringify(window._adocDernierBrutPageNeuve.brut) : null,
                 brutDate: window._adocDernierBrutPageNeuve
                   ? window._adocDernierBrutPageNeuve.recuLe : null,
                 // Et il ne doit avoir laissé AUCUNE trace ailleurs.
                 dansLeStockage: Object.keys(localStorage)
                   .filter((k) => /brut|slide|page/i.test(k)
                     || /emit_new_slide|accordeon/i.test(localStorage.getItem(k) || '')) };
      });

      assert.equal(vu.vides, 0, cas.nom + ' : aucune case vide, jamais');
      // LE BRUT, APRÈS CHAQUE CAS — y compris ceux refusés avant l'aperçu.
      assert.equal(vu.brut, JSON.stringify(cas.page),
        cas.nom + ' : la réponse brute doit rester disponible, telle que reçue ; vue : '
        + String(vu.brut).slice(0, 110));
      assert.ok(/^\d{4}-\d\d-\d\dT/.test(vu.brutDate || ''),
        cas.nom + ' : le brut doit être daté : ' + vu.brutDate);
      assert.deepEqual(vu.dansLeStockage, [],
        cas.nom + ' : le brut ne doit laisser aucune trace dans localStorage : '
        + JSON.stringify(vu.dansLeStockage));
      if (cas.accepte) {
        // Le seul cas qui doit PASSER : l'intrus est jeté, et la page reste valide.
        assert.equal(vu.apercu, true, cas.nom + ' : l\'aperçu doit s\'afficher');
        assert.ok(vu.armee, cas.nom + ' : la page doit être prête à insérer');
        const propre = await page.evaluate((champ) => {
          const p = window._adocPageInsertState.page;
          return JSON.stringify(p).indexOf('"' + champ + '"') < 0;
        }, cas.intrus);
        assert.ok(propre, cas.nom + ' : le champ « ' + cas.intrus + ' » ne doit pas entrer dans la page');
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Abandonner');
          b.click();
        });
        await page.waitForTimeout(250);
        pass(cas.nom + ' — acceptée, mais « ' + cas.intrus + ' » jeté : il n\'entre pas dans le document.');
        continue;
      }
      assert.equal(vu.apercu, false, cas.nom + ' : aucun aperçu ne doit s\'afficher');
      assert.ok(/La page générée est incomplète, rien n’a été inséré/.test(vu.message),
        cas.nom + ' : le message doit le dire en clair — vu : ' + JSON.stringify(vu.message.slice(0, 110)));
      assert.ok(/Refaire|Réessayer/.test(vu.message), cas.nom + ' : « Refaire » doit être proposé');
      assert.equal(vu.armee, false, cas.nom + ' : rien ne doit rester d\'insérable');
      assert.equal(vu.doc, avant, cas.nom + ' : le document doit être INTACT, champ pour champ');
      pass(cas.nom + ' — refusée, rien inséré, document intact, brut conservé.');
    }

    // ── LA SECONDE VALIDATION, CELLE D'AVANT L'INSERTION ──────────────────────────────────
    // L'aperçu peut rester ouvert longtemps pendant que le document change à côté. On vérifie
    // donc que l'insertion REJUGE la page au lieu de se fier au verdict rendu à l'aperçu : on
    // obtient un aperçu légitime, puis on abîme la page en attente, et on clique « Insérer ».
    etat.reponse = { title: 'Une page correcte', blocks: [{ type: 'paragraph', text: 'Un texte entier.' }] };
    const avantTardif = await page.evaluate(async (d) => {
      const cle = 'imparfait';
      window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
      await window.adocOpenWorkspace(cle);
      return JSON.stringify(window._adocArtifacts[cle]._adocStructuredDoc);
    }, PRESENTATION);
    await page.evaluate(() => {
      const d = window._adocArtifacts['imparfait']._adocStructuredDoc;
      document.getElementById(d.blocks[2].content.blocks[0].id)?.click();
    });
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
    await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Créer la page');
      b.click();
    });
    await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
    const abime = await page.evaluate(() => {
      // La page est devenue invalide APRÈS que l'aperçu l'a jugée bonne.
      window._adocPageInsertState.page.blocks[0].content.text = '';
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Insérer');
      b.click();
      return true;
    });
    assert.ok(abime);
    await page.waitForTimeout(700);
    const apresTardif = await page.evaluate(
      () => JSON.stringify(window._adocArtifacts['imparfait']._adocStructuredDoc));
    assert.equal(apresTardif, avantTardif,
      'une page devenue invalide après l\'aperçu ne doit pas entrer : document intact');
    assert.ok(dialogues.some((m) => /incomplète, rien n’a été inséré/.test(m)),
      'le refus tardif doit le dire en clair ; vu : ' + JSON.stringify(dialogues.slice(-1)));
    pass('une page abîmée APRÈS l\'aperçu est rejugée à l\'insertion : rien n\'entre, document intact.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
    pass('les ' + IMPARFAITES.length + ' réponses imparfaites ont été refusées, sans une seule erreur de page.');
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-page-generee-imparfaite — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
