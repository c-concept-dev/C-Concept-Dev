// LE ZIP DU CHUTIER (lot 2B, X7), ÉPROUVÉ SUR LE FICHIER PRODUIT.
//
// CE QUE CE CONTRÔLE LIT, ET CE QU'IL NE LIT JAMAIS. Il clique les vrais boutons de la page,
// récupère le fichier que le navigateur télécharge, et le relit avec DEUX lecteurs qui ne
// partagent rien avec le code éprouvé : `zipfile` de Python (répertoire central, CRC-32
// recalculés) et `unzip -t`. Les dimensions des images sont lues par `sips`, qui décode le
// fichier lui-même. Rien n'est cru sur parole du module.
//
//   NODE_PATH=<playwright> node tests/verify-zip-chutier.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DIX_NEUF_ETAPES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const CIBLE = path.join(RACINE, 'banc-chutier', 'chutier.html');
const RACINE_ZIP = 'images-presentation-par-etape';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

// ── LE SERVEUR DU CONTRÔLE COMPTE CE QU'ON LUI DEMANDE ──────────────────────────────────────
// Il sert le dossier du projet et RIEN d'autre, et il tient la liste des chemins demandés : un
// appel réseau sorti de la page se verrait soit ici, soit dans les requêtes refusées par
// Playwright (voir `horsSite`).
function servir(journal) {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      journal.push(q.url.split('?')[0]);
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

// ── LE LECTEUR INDÉPENDANT : `zipfile` de Python ────────────────────────────────────────────
// Il relit le répertoire central, recalcule chaque CRC-32 (`testzip`) et rend, pour chaque
// entrée, son nom, sa taille, sa méthode et l'empreinte SHA-256 de son contenu décompressé.
// Aucun code de l'écrivain de zip n'intervient : si l'un des deux se trompe, ils divergent.
function lireLeZipEnPython(fichier) {
  const programme = `
import json, hashlib, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
mauvais = z.testzip()
out = {"crc_tous_bons": mauvais is None, "premier_mauvais": mauvais, "entrees": []}
for i in z.infolist():
    d = z.read(i.filename)
    out["entrees"].append({
        "nom": i.filename, "octets": len(d), "methode": i.compress_type,
        "comprime": i.compress_size, "crc": i.CRC,
        "utf8": bool(i.flag_bits & 0x800),
        "sha256": hashlib.sha256(d).hexdigest(),
    })
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-c', programme, fichier],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function dimensionsParSips(fichier) {
  const t = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', fichier],
    { encoding: 'utf8' });
  return { largeur: Number((t.match(/pixelWidth:\s*(\d+)/) || [])[1]),
           hauteur: Number((t.match(/pixelHeight:\s*(\d+)/) || [])[1]) };
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  assert.ok(fs.existsSync(CIBLE), 'la page doit exister après la forge');

  const demandes = [];
  const { serveur, port } = await servir(demandes);
  const navigateur = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-chutier-'));
  try {
    const ctx = await navigateur.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    // ── LE RÉSEAU, MESURÉ PAR PHASES ET NON EN BLOC ────────────────────────────────────────
    //
    // X7 dit : le zip « est écrit sans connexion ni appel au Worker ». Il ne dit pas que la PAGE
    // n'appelle rien : le banc est une copie de l'application, et l'application appelle son
    // Worker au chargement. Mesurer les deux ensemble aurait donné un échec qui ne désigne rien.
    // On compte donc par phase, on EXIGE le silence pendant l'export, et on RAPPORTE le reste —
    // c'est ce rapport qui dira si un chutier autonome est possible.
    //
    // Pendant le chargement, les requêtes externes sont LAISSÉES PASSER : les polices de Google
    // changent le rendu du texte, et les couper ici mesurerait une autre page que celle dont
    // le lot 2 a mesuré la fidélité (V7). Pendant l'export, elles sont REFUSÉES : si le zip en
    // dépendait, il échouerait au lieu de réussir en silence.
    let phase = 'chargement';
    const reseau = { chargement: [], rendu: [], export: [] };
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:')) {
        return route.continue();
      }
      reseau[phase].push(u);
      return phase === 'export' ? route.abort() : route.continue();
    });
    await page.goto('http://127.0.0.1:' + port + '/banc-chutier/chutier.html');
    await page.waitForSelector('#banc-chutier', { timeout: 15000 });
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');

    // ── LA FIXTURE DE 19 ÉTAPES, CHARGÉE PAR LE VRAI CHEMIN (« Charger un JSON ») ───────────
    const json = path.join(temp, 'dix-neuf-etapes.json');
    fs.writeFileSync(json, JSON.stringify(DIX_NEUF_ETAPES));
    await page.setInputFiles('#bc-fichier', json);
    await page.waitForFunction(() => /19 étapes|19 etapes/.test(document.getElementById('bc-etat').textContent),
      { timeout: 20000 });

    await page.selectOption('#bc-format', 'image/jpeg');
    phase = 'rendu';
    await page.click('#bc-rendre');
    await page.waitForFunction(() => {
      const b = document.getElementById('bc-zip');
      return b && !b.disabled;
    }, { timeout: 240000 });

    // ── CE QUE LA PAGE A RENDU, relevé AVANT l'export : nom attendu et empreinte des octets ──
    const rendu = await page.evaluate(async () => {
      const d = window.__chutier && window.__chutier.dernier();
      if (!d) return { erreur: 'le banc n\'expose pas son rendu' };
      const sortie = [];
      for (let i = 0; i < d.res.images.length; i++) {
        const im = d.res.images[i];
        const octets = new Uint8Array(await im.blob.arrayBuffer());
        const h = await crypto.subtle.digest('SHA-256', octets);
        sortie.push({
          diapositive: im.cardIndex + 1, etape: im.rang, surRang: im.surRang,
          largeur: im.largeur, hauteur: im.hauteur, octets: octets.length,
          coupe_px: im.coupe_px, type: im.blob.type,
          sha256: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''),
        });
      }
      return { images: sortie };
    });
    assert.ok(!rendu.erreur, rendu.erreur || '');
    assert.equal(rendu.images.length, 19,
      '19 étapes attendues, ' + rendu.images.length + ' rendues');

    // ── LE ZIP, PAR LE VRAI BOUTON ─────────────────────────────────────────────────────────
    const telecharges = [];
    page.on('download', async (d) => {
      const dest = path.join(temp, d.suggestedFilename());
      await d.saveAs(dest);
      telecharges.push({ nom: d.suggestedFilename(), chemin: dest });
    });
    phase = 'export';
    await page.click('#bc-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 240000 });
    await page.waitForTimeout(800);
    assert.equal(telecharges.length, 1, 'un seul fichier attendu : ' + JSON.stringify(telecharges));
    const zip = telecharges[0];
    assert.match(zip.nom, /^images-presentation-par-etape-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/,
      'le nom du zip doit porter sa date (X5) : ' + zip.nom);

    // ── LES DEUX LECTEURS INDÉPENDANTS ─────────────────────────────────────────────────────
    const t = execFileSync('/usr/bin/unzip', ['-t', zip.chemin], { encoding: 'utf8' });
    assert.match(t, /No errors detected/, 'unzip -t doit passer : ' + t);
    const lu = lireLeZipEnPython(zip.chemin);
    assert.ok(lu.crc_tous_bons, 'tous les CRC-32 doivent être exacts : ' + lu.premier_mauvais);

    // ── LES NOMS, L'ORDRE, ET RIEN DE PLUS ─────────────────────────────────────────────────
    const attendus = rendu.images.map((im) =>
      RACINE_ZIP + '/' + String(im.diapositive).padStart(2, '0') + '-' + im.etape + '.jpg');
    const noms = lu.entrees.map((e) => e.nom);
    assert.deepEqual(noms, attendus.concat([RACINE_ZIP + '/index.csv']),
      'le zip doit porter une image par étape, dans l\'ordre, puis index.csv :\n  reçu    '
      + JSON.stringify(noms) + '\n  attendu ' + JSON.stringify(attendus.concat([RACINE_ZIP + '/index.csv'])));

    // ── LES IMAGES, OCTET POUR OCTET ───────────────────────────────────────────────────────
    rendu.images.forEach((im, i) => {
      const e = lu.entrees[i];
      assert.equal(e.sha256, im.sha256,
        e.nom + ' ne contient pas l\'image rendue (empreintes différentes)');
      assert.equal(e.octets, im.octets, e.nom + ' : ' + e.octets + ' octets au lieu de ' + im.octets);
      assert.equal(e.methode, 0, e.nom + ' doit être STOCKÉ, non recompressé : méthode ' + e.methode);
      assert.equal(e.comprime, e.octets, e.nom + ' : la taille stockée doit égaler la taille réelle');
    });

    // ── L'IMAGE HAUTE EST LIVRÉE ENTIÈRE (V3, V8), lue par `sips` ──────────────────────────
    const dossier = fs.mkdtempSync(path.join(temp, 'ouvert-'));
    execFileSync('/usr/bin/unzip', ['-q', zip.chemin, '-d', dossier]);
    const haute = rendu.images.reduce((m, x) => (x.hauteur > m.hauteur ? x : m), rendu.images[0]);
    const nomHaute = String(haute.diapositive).padStart(2, '0') + '-' + haute.etape + '.jpg';
    const dim = dimensionsParSips(path.join(dossier, RACINE_ZIP, nomHaute));
    assert.equal(dim.largeur, haute.largeur, nomHaute + ' : largeur ' + dim.largeur);
    assert.equal(dim.hauteur, haute.hauteur,
      nomHaute + ' doit être livrée à sa hauteur entière : ' + dim.hauteur + ' au lieu de '
      + haute.hauteur);
    assert.ok(haute.hauteur > 1080,
      'la fixture doit porter une image plus haute que le cadre, sinon V3 n\'est pas éprouvé : '
      + haute.hauteur);

    // ── L'EXPORT N'APPELLE RIEN (X7) ───────────────────────────────────────────────────────
    assert.deepEqual(reseau.export, [],
      'le zip doit être écrit sans connexion ni appel au Worker (X7) : '
      + JSON.stringify(reseau.export));
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs));
    // ── CE QUE LA PAGE APPELLE AILLEURS, RAPPORTÉ ET NON TU ────────────────────────────────
    // Ce n'est pas un échec au regard de X7, c'est le fait qui décide de l'objectif 3 : un
    // chutier autonome devra se passer de ces appels, ou les perdre sans rien casser.
    const resume = (l) => (l.length ? l.map((u) => u.replace(/^https:\/\//, '').split('?')[0]) : ['aucun']);
    console.log('      réseau au chargement : ' + resume(reseau.chargement).join(', '));
    console.log('      réseau pendant le rendu : ' + resume(reseau.rendu).join(', '));
    console.log('      réseau pendant l\'export : ' + resume(reseau.export).join(', '));

    console.log('      zip ' + zip.nom + ' · ' + lu.entrees.length + ' entrées · '
      + Math.round(fs.statSync(zip.chemin).size / 1024) + ' Ko · image haute ' + nomHaute
      + ' ' + dim.largeur + 'x' + dim.hauteur);
    pass('le zip contient les 19 images rendues, octet pour octet, nommées et ordonnées, plus index.csv.');

    // ── 2. L'INDEX, RELU, ET COHÉRENT AVEC CE QUE LA PLANCHE DIT ───────────────────────────
    const csv = fs.readFileSync(path.join(dossier, RACINE_ZIP, 'index.csv'), 'utf8');
    const lignesCsv = csv.trim().split('\n');
    assert.equal(lignesCsv[0],
      'fichier;diapositive;etape;etapes_de_la_diapositive;largeur_px;hauteur_px;octets;coupe_px;travelling',
      'l\'en-tête du CSV, sans narration chargée : ' + lignesCsv[0]);
    assert.equal(lignesCsv.length, 20, 'une ligne d\'en-tête et 19 lignes : ' + lignesCsv.length);
    // Les colonnes de narration n'existent PAS quand aucune narration n'est chargée : une
    // colonne vide inviterait à croire qu'il n'y a rien à dire, alors qu'il n'y a rien de chargé.
    assert.ok(!/;mots;/.test(lignesCsv[0]) && !/duree_estimee_s/.test(lignesCsv[0]),
      'sans narration, ni « mots » ni « duree_estimee_s » : ' + lignesCsv[0]);
    assert.ok(!fs.existsSync(path.join(dossier, RACINE_ZIP, 'narration.txt')),
      'sans narration chargée, narration.txt ne doit PAS être écrit (jamais un fichier vide '
      + 'présenté comme complet)');
    // CHAQUE LIGNE DIT CE QUE LA PAGE A MESURÉ, et c'est relu sur le fichier, pas sur l'objet.
    rendu.images.forEach((im, i) => {
      const champs = lignesCsv[i + 1].split(';');
      const nom = String(im.diapositive).padStart(2, '0') + '-' + im.etape + '.jpg';
      assert.equal(champs[0], nom, 'ligne ' + (i + 1) + ' : fichier ' + champs[0]);
      assert.equal(Number(champs[1]), im.diapositive, nom + ' : diapositive');
      assert.equal(Number(champs[2]), im.etape, nom + ' : etape');
      assert.equal(Number(champs[3]), im.surRang, nom + ' : etapes_de_la_diapositive');
      assert.equal(Number(champs[4]), im.largeur, nom + ' : largeur_px');
      assert.equal(Number(champs[5]), im.hauteur, nom + ' : hauteur_px');
      assert.equal(Number(champs[6]), im.octets, nom + ' : octets doit être la taille réelle');
      assert.equal(Number(champs[7]), im.coupe_px, nom + ' : coupe_px');
      assert.ok(champs[8] && champs[8].length > 0, nom + ' : travelling doit être renseigné');
    });
    // LA DISTANCE DE DÉFILEMENT EST DANS L'INDEX POUR L'IMAGE HAUTE (V3, X7).
    const ligneHaute = lignesCsv.find((l) => l.indexOf(nomHaute + ';') === 0);
    // La distance peut venir d'un travelling calculé par le moteur, ou — quand la scène couvre
    // déjà tout le contenu et qu'il n'y a donc rien à faire défiler DANS la scène — du
    // dépassement de l'image sur le cadre de sortie. Les deux sont des distances en pixels, et
    // l'index doit en porter une : c'est la seule question que X7 pose sur une image haute.
    assert.ok(/travelling \d+ px|image haute : \d+ px à faire défiler/.test(ligneHaute),
      'l\'image haute doit porter sa distance de défilement dans l\'index : ' + ligneHaute);
    const distance = Number((ligneHaute.match(/(\d+) px à faire défiler/)
      || ligneHaute.match(/travelling (\d+) px/) || [])[1]);
    assert.ok(distance > 0, 'et cette distance doit être un nombre de pixels : ' + ligneHaute);
    console.log('      index : ' + lignesCsv[0]);
    console.log('      image haute : ' + ligneHaute);
    pass('index.csv relu : en-tête, 19 lignes, chaque champ égal à la mesure, travelling de l\'image haute dit.');

    // ── 3. CE QUE L'ÉCRIVAIN TIENT À LA FOIS, pour 19 et pour 100 entrées ────────────────
    //
    // J'AI D'ABORD MESURÉ LE MAUVAIS OBJET, et c'est le témoin qui l'a dit. `performance.memory`
    // dans la page annonçait un pic de +0,00 Mo pendant l'écriture : le résultat espéré. Mais le
    // témoin — les mêmes 9,3 Mo tirés DANS le tas par `arrayBuffer` — donnait aussi +0,00 Mo, et
    // `JSHeapUsedSize` du protocole DevTools n'a pas bougé davantage (8,03 Mo avant comme après).
    // RAISON : les octets d'un Blob comme ceux d'un ArrayBuffer vivent HORS du tas JS. Le tas
    // est le mauvais instrument, et un zéro mesuré avec lui ne prouve rien.
    //
    // CE QUI EST MESURÉ MAINTENANT est le plus gros bloc contigu que l'écrivain détient : 64 Ko
    // s'il lit par morceaux, la taille entière de l'image s'il la lit d'un coup. C'est le nombre
    // qui distingue les deux conceptions, et il est exact.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const tasJs = async () => {
      const m = await cdp.send('Performance.getMetrics');
      const x = m.metrics.find((v) => v.name === 'JSHeapUsedSize');
      return x ? x.value / 1048576 : null;
    };
    const ecritures = await page.evaluate(async () => {
      const faire = async (combien) => {
        const taille = 95 * 1024;
        const entrees = [];
        for (let i = 0; i < combien; i++) {
          const u8 = new Uint8Array(taille);
          for (let k = 0; k < taille; k += 997) u8[k] = (i * 31 + k) & 0xFF;
          entrees.push({ nom: 'x/' + i + '.bin', blob: new Blob([u8]) });
        }
        const t0 = performance.now();
        const r = await window.ZipStocke.ecrire(entrees);
        return { combien, octets: r.octets, picDeLecture: r.picDeLecture,
                 morceau: r.morceauDeLecture, tailleDUneEntree: taille,
                 ms: Math.round(performance.now() - t0) };
      };
      return { dixNeuf: await faire(19), cent: await faire(100) };
    });
    const tas = await tasJs();
    [ecritures.dixNeuf, ecritures.cent].forEach((m) => {
      assert.ok(m.picDeLecture <= m.morceau,
        m.combien + ' entrées : l\'écrivain ne doit jamais tenir plus d\'un morceau de '
        + m.morceau + ' octets, mesuré ' + m.picDeLecture);
      assert.ok(m.picDeLecture < m.tailleDUneEntree,
        m.combien + ' entrées : le pic (' + m.picDeLecture + ') doit rester SOUS la taille d\'une '
        + 'image (' + m.tailleDUneEntree + ') — sinon l\'image est lue d\'un coup');
    });
    console.log('      écriture : 19 entrées → ' + (ecritures.dixNeuf.octets / 1048576).toFixed(1)
      + ' Mo en ' + ecritures.dixNeuf.ms + ' ms, plus gros bloc tenu '
      + ecritures.dixNeuf.picDeLecture + ' octets ; 100 entrées → '
      + (ecritures.cent.octets / 1048576).toFixed(1) + ' Mo en ' + ecritures.cent.ms
      + ' ms, plus gros bloc tenu ' + ecritures.cent.picDeLecture + ' octets');
    console.log('      (le tas JS reste à ' + tas.toFixed(2) + ' Mo : les octets n\'y entrent pas)');
    pass('l\'écrivain ne tient jamais plus de ' + ecritures.cent.picDeLecture
      + ' octets à la fois, pour une archive de ' + (ecritures.cent.octets / 1048576).toFixed(1)
      + ' Mo et ' + ecritures.cent.combien + ' entrées.');

    // ── 4. UN EXPORT INTERROMPU NE LAISSE RIEN (X4) ───────────────────────────────────────
    //
    // LA PRÉCONDITION EST CONSTRUITE : on retire les octets d'une image au milieu du rendu, ce
    // qu'un échec de capture produirait. Ce qu'on ÉPROUVE est le produit : dit-il l'abandon, et
    // ne télécharge-t-il rien ?
    const avantPanne = telecharges.length;
    await page.evaluate(() => { window.__chutier.dernier().res.images[7].blob = null; });
    await page.click('#bc-zip');
    await page.waitForFunction(() => /ABANDONN/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    await page.waitForTimeout(800);
    const avis = await page.textContent('#bc-etat');
    assert.equal(telecharges.length, avantPanne,
      'un export interrompu ne doit RIEN télécharger : ' + (telecharges.length - avantPanne)
      + ' fichier(s) de plus');
    assert.match(avis, /rien n a été téléchargé/,
      'et l\'avis doit le dire : ' + avis);
    assert.match(avis, /diapositive 3, étape 2|étape/,
      'en nommant l\'étape fautive : ' + avis);
    console.log('      ' + avis.trim().split('\n').pop());
    pass('export interrompu : rien n\'est téléchargé, et l\'avis nomme l\'étape fautive (X4).');

    // ── 5. DEUX EXPORTS DE SUITE NE S'ÉCRASENT PAS (X5) ───────────────────────────────────
    // Le format demandé porte l'heure à la minute : deux exports dans la même minute auraient le
    // même nom. On en fait deux, et on exige deux noms.
    await page.evaluate(() => { window.__chutier.dernier().res.images[7].blob = window.__sauve; });
    await page.evaluate(() => {
      // On rend à l'image sabotée au contrôle 4 un contenu valide, pour repartir d'un rendu sain.
      const im = window.__chutier.dernier().res.images[7];
      if (!im.blob) im.blob = new Blob([new Uint8Array(1234)], { type: 'image/jpeg' });
    });
    const avantDeux = telecharges.length;
    await page.click('#bc-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 120000 });
    await page.waitForTimeout(500);
    await page.click('#bc-zip');
    await page.waitForFunction(() => {
      const t = document.getElementById('bc-etat').textContent;
      return /zip (écrit|ecrit)/i.test(t);
    }, { timeout: 120000 });
    await page.waitForTimeout(800);
    const deux = telecharges.slice(avantDeux).map((t) => t.nom);
    assert.equal(deux.length, 2, 'deux exports, deux fichiers : ' + JSON.stringify(deux));
    assert.notEqual(deux[0], deux[1],
      'deux exports de suite ne doivent pas porter le même nom (X5) : ' + JSON.stringify(deux));
    assert.match(deux[1], /^images-presentation-par-etape-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.zip$/,
      'le second nom reste lisible : ' + deux[1]);
    console.log('      deux exports : ' + deux.join(' puis '));
    pass('deux exports de suite produisent deux noms distincts.');

    // ── 6. LE FORMAT PNG : LES NOMS SUIVENT, ET LES OCTETS SONT CEUX D'UN PNG ─────────────
    phase = 'rendu';
    await page.selectOption('#bc-format', 'image/png');
    await page.click('#bc-rendre');
    // ON ATTEND UNE TRANSITION, PAS UN ÉTAT : le bouton était déjà actif, et l'attendre actif
    // rendait la main aussitôt — l'export portait alors sur le rendu PRÉCÉDENT, en JPEG. Le banc
    // désactive maintenant le bouton pendant un rendu, et c'est cette bascule qu'on attend.
    await page.waitForFunction(() => document.getElementById('bc-zip').disabled, { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById('bc-zip').disabled, { timeout: 240000 });
    const avantPng = telecharges.length;
    phase = 'export';
    await page.click('#bc-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 240000 });
    await page.waitForTimeout(800);
    assert.equal(telecharges.length, avantPng + 1, 'un zip PNG attendu');
    const zipPng = telecharges[telecharges.length - 1];
    const luPng = lireLeZipEnPython(zipPng.chemin);
    const nomsPng = luPng.entrees.map((e) => e.nom);
    assert.ok(nomsPng.every((x) => x.endsWith('.png') || x.endsWith('index.csv')),
      'en PNG, les images doivent porter l\'extension .png : ' + JSON.stringify(nomsPng.slice(0, 3)));
    assert.ok(luPng.crc_tous_bons, 'CRC du zip PNG');
    // La signature d'un PNG, lue sur les octets extraits : 89 50 4E 47.
    const dossierPng = fs.mkdtempSync(path.join(temp, 'png-'));
    execFileSync('/usr/bin/unzip', ['-q', zipPng.chemin, '-d', dossierPng]);
    const premierPng = nomsPng.find((x) => x.endsWith('.png'));
    const tete = fs.readFileSync(path.join(dossierPng, premierPng)).subarray(0, 4);
    assert.deepEqual([...tete], [0x89, 0x50, 0x4E, 0x47],
      premierPng + ' n\'est pas un PNG : ' + JSON.stringify([...tete]));
    const dimPng = dimensionsParSips(path.join(dossierPng, premierPng));
    assert.equal(dimPng.largeur, 1920, 'un PNG du zip doit faire 1920 de large : ' + dimPng.largeur);
    console.log('      PNG : ' + premierPng + ' ' + dimPng.largeur + 'x' + dimPng.hauteur + ', '
      + Math.round(fs.statSync(zipPng.chemin).size / 1024) + ' Ko pour ' + nomsPng.length + ' entrées');
    pass('le zip en PNG porte des .png réels, à 1920 de large, avec des CRC exacts.');

    // ── 7. AVEC UNE NARRATION CHARGÉE : DEUX COLONNES ET UN FICHIER TEXTE ────────────────
    const avecNar = JSON.parse(JSON.stringify(DIX_NEUF_ETAPES));
    avecNar.documentId = 'chutier-dix-neuf-narre';
    avecNar.versionId = 'chutier-dix-neuf-narre-v1';
    // Une narration par étape, de longueurs connues : 5, 10 et 15 mots, en rotation.
    const etapes = [];
    avecNar.blocks.forEach((c) => {
      const sous = (c.content.blocks || []);
      if (!sous.length) etapes.push(c.id);
      else sous.forEach((b) => etapes.push(b.id));
    });
    assert.equal(etapes.length, 19, 'la fixture doit compter 19 étapes : ' + etapes.length);
    const longueurs = [5, 10, 15];
    avecNar.narration = etapes.map((stepId, i) => ({
      stepId,
      text: Array.from({ length: longueurs[i % 3] }, (_, k) => 'mot' + (k + 1)).join(' '),
    }));
    const jsonNar = path.join(temp, 'dix-neuf-narre.json');
    fs.writeFileSync(jsonNar, JSON.stringify(avecNar));
    phase = 'rendu';
    await page.setInputFiles('#bc-fichier', jsonNar);
    await page.waitForTimeout(500);
    await page.selectOption('#bc-format', 'image/jpeg');
    await page.click('#bc-rendre');
    await page.waitForFunction(() => document.getElementById('bc-zip').disabled, { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById('bc-zip').disabled, { timeout: 240000 });
    const avantNar = telecharges.length;
    phase = 'export';
    await page.click('#bc-zip');
    await page.waitForFunction(() => /narration incluse/.test(document.getElementById('bc-etat').textContent),
      { timeout: 240000 });
    await page.waitForTimeout(800);
    assert.equal(telecharges.length, avantNar + 1, 'un zip avec narration attendu');
    const zipNar = telecharges[telecharges.length - 1];
    const dossierNar = fs.mkdtempSync(path.join(temp, 'narre-'));
    execFileSync('/usr/bin/unzip', ['-q', zipNar.chemin, '-d', dossierNar]);
    const csvNar = fs.readFileSync(path.join(dossierNar, RACINE_ZIP, 'index.csv'), 'utf8')
      .trim().split('\n');
    assert.equal(csvNar[0],
      'fichier;diapositive;etape;etapes_de_la_diapositive;largeur_px;hauteur_px;octets;coupe_px;travelling;mots;duree_estimee_s',
      'avec narration, l\'en-tête porte « mots » et « duree_estimee_s » : ' + csvNar[0]);
    // LES MOTS ET LA DURÉE SONT CEUX DE LA NARRATION, à la vitesse par défaut du CDC (2,5).
    for (let i = 1; i < csvNar.length; i++) {
      const champs = csvNar[i].split(';');
      const mots = Number(champs[9]);
      const duree = Number(champs[10]);
      assert.ok(longueurs.indexOf(mots) >= 0,
        'ligne ' + i + ' : ' + mots + ' mots ne correspond à aucune narration posée');
      assert.ok(Math.abs(duree - mots / 2.5) < 0.06,
        'ligne ' + i + ' : ' + mots + ' mots à 2,5 mots/s font ' + (mots / 2.5)
        + ' s, le CSV dit ' + duree);
    }
    // LE FICHIER TEXTE : un bloc par étape, introduit par le nom de l'image sans extension, et
    // le texte TEL QUEL.
    const txt = fs.readFileSync(path.join(dossierNar, RACINE_ZIP, 'narration.txt'), 'utf8');
    const blocs = txt.trim().split('\n\n');
    assert.equal(blocs.length, 19, 'un bloc par étape : ' + blocs.length);
    const nomsAttendus = luPng.entrees.filter((e) => e.nom.endsWith('.png'))
      .map((e) => path.basename(e.nom, '.png'));
    blocs.forEach((b, i) => {
      const l = b.split('\n');
      assert.equal(l[0], nomsAttendus[i],
        'le bloc ' + i + ' doit être introduit par « ' + nomsAttendus[i] + ' » : ' + l[0]);
      assert.equal(l.slice(1).join('\n'), avecNar.narration[i].text,
        'le texte du bloc ' + i + ' doit être celui du document, jamais modifié');
    });
    console.log('      narration : ' + blocs.length + ' blocs, premier « '
      + blocs[0].split('\n')[0] + ' » · ' + csvNar[1].split(';').slice(9).join(';') + ' (mots;durée)');
    pass('avec narration chargée : deux colonnes exactes et narration.txt, un bloc par étape, texte intact.');

  } finally {
    await navigateur.close();
    serveur.close();
  }
  console.log('\nPASS verify-zip-chutier — ' + n + ' contrôle(s).');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
