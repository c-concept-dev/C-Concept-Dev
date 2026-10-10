// LA PAGE D'ESSAI DU CHUTIER, PILOTÉE (lot 2).
//
// Forger une page et la déclarer bonne sans l'ouvrir serait exactement le genre d'affirmation que
// ce projet s'interdit. Ce test la forge, la sert, clique ses boutons et lit ce qu'elle affiche.
//
//   NODE_PATH=<playwright> node tests/verify-banc-chutier.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const CIBLE = path.join(RACINE, 'banc-chutier', 'chutier.html');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  // ── 1. La forge aboutit, et la page est bien dans le dossier ignoré ─────────────────────────
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  assert.ok(fs.existsSync(CIBLE), 'la page doit exister après la forge');
  const ignore = execFileSync('/usr/bin/git', ['-C', RACINE, 'check-ignore', '-v', CIBLE],
    { encoding: 'utf8' });
  assert.match(ignore, /banc-chutier\//, 'la page doit être ignorée par git : ' + ignore);
  pass('page forgée (' + Math.round(fs.statSync(CIBLE).size / 1024) + ' Ko) et ignorée par git.');

  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const dossierTelechargements = fs.mkdtempSync(path.join(os.tmpdir(), 'chutier-'));
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');

    // ── 2. Le panneau s'installe, et le moteur est là ─────────────────────────────────────────
    await page.waitForSelector('#banc-chutier', { timeout: 15000 });
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    const options = await page.$$eval('#bc-presentation option', (o) => o.map((x) => x.textContent));
    assert.deepEqual(options, ['Couverture avec photo', 'Texte dense', 'Questionnaire et chiffres'],
      'les trois présentations doivent être proposées : ' + JSON.stringify(options));
    assert.match(await page.textContent('#bc-etat'), /prêt/, 'la page doit s\'annoncer prête');
    pass('panneau installé, moteur chargé, les trois présentations proposées.');

    // ── 3. « Rendre les trois » produit des vignettes, un compte, un temps et une mémoire ─────
    await page.click('#bc-tout');
    await page.waitForFunction(() => {
      const b = document.getElementById('bc-tout');
      return b && !b.disabled && /images/.test(document.getElementById('bc-etat').textContent);
    }, { timeout: 180000 });
    const etat = await page.textContent('#bc-etat');
    const lignes = etat.trim().split('\n');
    assert.equal(lignes.length, 3, 'une ligne de bilan par présentation : ' + etat);
    lignes.forEach((l) => assert.match(l, /[0-9]+ images, [0-9.]+ Mo, [0-9]+ ms/, 'bilan illisible : ' + l));
    const vignettes = await page.$$eval('#bc-vignettes figure', (f) => f.map((x) => ({
      alt: x.querySelector('img').alt, naturelle: x.querySelector('img').naturalWidth,
      legende: x.querySelector('figcaption').textContent,
    })));
    assert.equal(vignettes.length, 4, 'la dernière présentation rendue en compte quatre : ' + vignettes.length);
    vignettes.forEach((v) => {
      assert.equal(v.naturelle, 1920, 'chaque vignette affiche une image de 1920 de large : ' + v.naturelle);
      assert.match(v.legende, /1920x(1080|[0-9]{3,4})/, 'la légende porte la taille : ' + v.legende);
      assert.match(v.legende, /[0-9a-f]{16}/, 'la légende porte la signature : ' + v.legende);
    });
    const recap = await page.$$eval('#bc-recap tr', (r) => r.map((x) => x.cells[0].textContent + ' = ' + x.cells[1].textContent));
    const trouve = (c) => recap.find((l) => l.indexOf(c) === 0) || '';
    assert.match(trouve('images rendues'), /= 4$/, 'compte des images : ' + trouve('images rendues'));
    assert.match(trouve('durée par image'), /= [0-9]+ ms$/, 'durée par image : ' + trouve('durée par image'));
    assert.match(trouve('tas JS'), /Mo avant, .*Mo après/, 'mémoire : ' + trouve('tas JS'));
    assert.match(trouve('images décodées en mémoire'), /= 0 /, 'aucune image ne doit rester décodée : ' + trouve('images décodées en mémoire'));
    // La ligne « débordements » est désormais un récapitulatif par verdict, et le détail de chaque
    // étape qui déborde vit sur sa propre ligne, avec son ampleur, son rapport et son verdict.
    assert.match(trouve('débordements'), /[0-9]+ sans, [0-9]+ à faire défiler, [0-9]+ à scinder/,
      'récapitulatif des débordements : ' + trouve('débordements'));
    // CETTE ATTENTE A CHANGÉ LE 9 OCTOBRE, et c'est le résultat qu'on cherchait. Le
    // questionnaire était proposé à la SCISSION parce qu'une scène unique de 960×540 le faisait
    // déborder du double. Avec une scène par diapositive, il reçoit 1333×750 et ne dépasse plus
    // que de 11 % : le verdict devient « défilement », et le travelling suffit. Exiger encore
    // « à scinder » serait exiger que le correctif ne marche pas.
    //
    // CE QUI RESTE EXIGÉ, et qui est l'objet de V3 : il DÉBORDE, et son débordement est nommé.
    assert.match(trouve('débordements'), /[1-9][0-9]* à faire défiler|[1-9][0-9]* à scinder/,
      'le questionnaire doit déborder, et le relevé doit le dire : ' + trouve('débordements'));
    const detail = recap.find((l) => /déborde de [0-9]+ px de scène/.test(l));
    assert.ok(detail, 'une ligne de détail doit nommer l\'étape qui déborde');
    assert.match(detail, /rapport [0-9.]+/, 'avec son rapport : ' + detail);
    assert.match(detail, /SCISSION|DEFILEMENT/, 'et son verdict : ' + detail);
    console.log('      ' + lignes.join('\n      '));
    console.log('      ' + trouve('tas JS'));
    console.log('      ' + trouve('débordements'));
    pass('trois présentations rendues, vignettes à 1920, compte, durée, mémoire et débordement affichés.');

    // ── 4. Le bouton JPEG télécharge vraiment ─────────────────────────────────────────────────
    const telecharges = [];
    page.on('download', async (d) => {
      const dest = path.join(dossierTelechargements, d.suggestedFilename());
      await d.saveAs(dest);
      telecharges.push({ nom: d.suggestedFilename(), octets: fs.statSync(dest).size });
    });
    await page.click('#bc-jpeg');
    await page.waitForFunction(() => /téléchargement terminé/.test(document.getElementById('bc-etat').textContent),
      { timeout: 120000 });
    await page.waitForTimeout(600);
    assert.equal(telecharges.length, 4, '4 fichiers attendus, ' + telecharges.length + ' reçus');
    telecharges.forEach((t) => {
      assert.match(t.nom, /^[0-9]{3}-[0-9]{2}-[0-9a-zA-Z-]+\.jpg$/, 'nom conforme à X5 : ' + t.nom);
      assert.ok(t.octets > 5000, t.nom + ' ne pèse que ' + t.octets + ' octets');
      // Un JPEG commence par FF D8 FF : on vérifie le fichier, pas l'extension.
      const tete = fs.readFileSync(path.join(dossierTelechargements, t.nom)).slice(0, 3);
      assert.deepEqual([...tete], [0xFF, 0xD8, 0xFF], t.nom + ' n\'est pas un JPEG');
    });
    console.log('      ' + telecharges.map((t) => t.nom + ' ' + Math.round(t.octets / 1024) + ' Ko').join('   '));
    pass('bouton JPEG : 4 vrais fichiers JPEG téléchargés, noms conformes à X5.');

    // ── 5. LA PLANCHE À L'ŒIL : un seul fichier, et ses deux repères ─────────────────────────
    // Christophe juge les images à l'œil : texte lisible, rien de coupé, et sur une diapositive
    // haute, l'encre s'arrête-t-elle avant la fin du travelling. La planche est le fichier qui
    // lui permet de le voir. Elle est TÉLÉCHARGÉE, jamais écrite dans le dépôt : elle porte des
    // images de sa présentation, qui n'ont rien à y faire.
    const avantPlanche = telecharges.length;
    await page.click('#bc-planche');
    await page.waitForFunction(() => /planche téléchargée/.test(document.getElementById('bc-etat').textContent),
      { timeout: 300000 });
    await page.waitForTimeout(600);
    const planche = telecharges.slice(avantPlanche);
    assert.equal(planche.length, 1, 'la planche est UN seul fichier : ' + planche.length + ' reçu(s)');
    assert.match(planche[0].nom, /^planche-a-l-oeil-4-etapes\.html$/, 'nom : ' + planche[0].nom);
    const corps = fs.readFileSync(path.join(dossierTelechargements, planche[0].nom), 'utf8');
    assert.equal((corps.match(/<figure>/g) || []).length, 4,
      'une figure par étape : ' + (corps.match(/<figure>/g) || []).length);
    assert.equal((corps.match(/data:image\/jpeg;base64,/g) || []).length, 4,
      'et une image embarquée par figure — la planche doit s\'ouvrir seule, sans fichier à côté');
    // LES DEUX REPÈRES, sur la diapositive qui déborde. Sans eux, la planche ne dirait pas où
    // s'arrête le premier cadre ni où s'arrête le travelling : elle montrerait une image haute
    // sans dire ce que le spectateur en verra.
    assert.ok((corps.match(/premier cadre, 1080 px/g) || []).length >= 1,
      'le trait du premier cadre doit être tracé sur l\'image qui déborde');
    assert.ok((corps.match(/fin du travelling, [0-9]+ px/g) || []).length >= 1,
      'et celui de la fin du travelling');
    assert.match(corps, /corps 15 px soit [0-9.]+ % du cadre/,
      'chaque légende nomme la taille du corps et son pourcentage');
    assert.match(corps, /coupé 0 px/, 'et ce qui est coupé, qui doit valoir 0');
    console.log('      planche : ' + planche[0].nom + ' ' + Math.round(planche[0].octets / 1024) + ' Ko, '
      + (corps.match(/<figure>/g) || []).length + ' figures, repères tracés');
    pass('planche à l\'œil : un fichier autonome, une figure par étape, les deux repères du travelling.');

    // ── 6. Le bouton de péremption signale, et ne remplace rien ───────────────────────────────
    await page.click('#bc-perime');
    await page.waitForFunction(() => /à jour :/.test(document.getElementById('bc-etat').textContent),
      { timeout: 30000 });
    const verdict = await page.textContent('#bc-etat');
    assert.match(verdict, /périmées : [^a]/, 'au moins une étape périmée : ' + verdict);
    assert.match(verdict, /à jour : NON/, 'le verdict doit dire NON : ' + verdict);
    console.log('      ' + verdict.trim().split('\n').map((l) => l.trim()).join(' | '));
    pass('péremption signalée dans la page, sans aucun remplacement silencieux.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    pass('aucune erreur de page sur tout le parcours.');

    fs.rmSync(dossierTelechargements, { recursive: true, force: true });
    console.log('\nPASS verify-banc-chutier — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
