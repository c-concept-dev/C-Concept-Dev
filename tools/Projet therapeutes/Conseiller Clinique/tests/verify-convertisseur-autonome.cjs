// LE CONVERTISSEUR AUTONOME, ÉPROUVÉ EN file:// AVEC LE RÉSEAU COUPÉ (lot 2C).
//
// CE QUE CE CONTRÔLE PROUVE, ET COMMENT. Il ouvre le fichier unique par son adresse `file://`,
// REFUSE toute requête qui n'est pas `file:`, `data:` ou `blob:` — donc coupe le réseau pour de
// bon —, dépose l'export HTML d'une présentation par un VRAI glisser-déposer, attend le rendu,
// clique le zip, et relit le fichier téléchargé avec `zipfile` de Python et `unzip -t`.
//
// Si quelque chose dans la page avait encore besoin d'un voisin ou du réseau, il échouerait ici.
//
//   NODE_PATH=<playwright> node tests/verify-convertisseur-autonome.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const RACINE_ZIP = 'images-presentation-par-etape';
const EXPORT_ESSAI = path.join(RACINE, 'banc-chutier', 'export-pour-essai.html');

function lireLeZip(fichier) {
  const programme = `
import json, hashlib, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
out = {"mauvais": z.testzip(), "entrees": []}
for i in z.infolist():
    d = z.read(i.filename)
    out["entrees"].append({"nom": i.filename, "octets": len(d), "methode": i.compress_type,
                           "sha256": hashlib.sha256(d).hexdigest()})
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-c', programme, fichier],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  // Le banc d'abord (le convertisseur en est tiré), puis l'export d'essai, puis le fichier unique.
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  if (!fs.existsSync(EXPORT_ESSAI)) {
    execFileSync(process.execPath, [path.join(__dirname, 'forger-presentation-essai.cjs')], { stdio: 'pipe' });
  }
  assert.ok(fs.existsSync(EXPORT_ESSAI), 'il faut un export de présentation à déposer');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'convertisseur-'));
  const fichierUnique = path.join(temp, 'convertisseur-images.html');
  execFileSync(process.execPath,
    [path.join(__dirname, 'forger-convertisseur-autonome.cjs'), fichierUnique], { stdio: 'pipe' });
  const octets = fs.statSync(fichierUnique).size;

  // ── CE QUE LE FICHIER PORTE, ET CE QU'IL CHARGE : DEUX QUESTIONS DIFFÉRENTES ──────────
  //
  // J'avais d'abord cherché des balises survivantes dans le TEXTE du fichier. Mauvaise idée, et
  // le contrôle l'a montré : le cœur du Studio contient des balises dans ses CHAÎNES, parce
  // qu'il fabrique lui-même des exports HTML. Un fichier qui contient le texte
  // `<link href="... googleFontsHref ...">` dans une chaîne ne charge rien du tout.
  //
  // CE QUI SE MESURE, c'est ce que la page DEMANDE. Toutes les requêtes sont donc comptées plus
  // bas, et la seule admise est le fichier lui-même : un voisin encore désigné se verrait comme
  // une seconde requête `file:`, et le réseau comme une requête refusée.
  //
  // Cette première passe garde ce qui reste décidable sur le texte, et rien d'autre : la
  // corruption qu'elle a déjà trouvée une fois (chaque `$&` d'ajv remplacé par la balise
  // elle-même, six morceaux de la bibliothèque détruits) se reconnaît à la balise RECOLLÉE au
  // milieu d'une expression régulière.
  const source = fs.readFileSync(fichierUnique, 'utf8');
  const recollees = source.match(/\[[^\]]{0,40}<script src="[^"]*"><\/script>/g) || [];
  assert.deepEqual(recollees, [],
    'une balise recollée au milieu d\'une classe de caractères signe la corruption par `$&` : '
    + JSON.stringify(recollees.slice(0, 2)));
  assert.ok(source.indexOf('window.snapdom =') > 0,
    'SnapDOM doit être mis en ligne et posé sur window');
  assert.ok(source.indexOf('mis en ligne : aucun fichier voisin') > 0,
    'les cinq scripts voisins doivent être mis en ligne');
  pass('fichier unique de ' + (octets / 1048576).toFixed(2)
    + ' Mo : SnapDOM et les cinq scripts en ligne, aucune balise recollée.');

  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const ctx = await nav.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const erreurs = [];
    const horsFichier = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
    // ── LE RÉSEAU EST COUPÉ POUR DE BON ────────────────────────────────────────────────────
    const demandes = [];
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('file:')) { demandes.push(u); return route.continue(); }
      if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      horsFichier.push(u);
      return route.abort();
    });
    // La page du banc s'ouvre avec ce paramètre — c'est ce que fait le lanceur, et c'est ce
    // qui installe le panneau par-dessus l'application. Sans lui, le panneau reste masqué.
    await page.goto('file://' + fichierUnique + '?atelier-local=1');
    await page.waitForSelector('#banc-chutier', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.AtelierImages === 'object', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.snapdom === 'function', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.ZipStocke === 'object', { timeout: 30000 });
    pass('ouvert en file:// : le panneau s\'installe, le moteur, SnapDOM et l\'écrivain de zip sont là.');

    // ── LE GLISSER-DÉPOSER, POUR DE VRAI ──────────────────────────────────────────────────
    // On fabrique un DataTransfer dans la page avec les octets du fichier, et on envoie un vrai
    // événement `drop` sur la fenêtre : c'est le geste de Christophe, pas un raccourci par
    // l'entrée de fichier cachée.
    const contenu = fs.readFileSync(EXPORT_ESSAI, 'utf8');
    await page.evaluate(({ nom, texte }) => {
      const f = new File([texte], nom, { type: 'text/html' });
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { nom: path.basename(EXPORT_ESSAI), texte: contenu });
    await page.waitForFunction(() => /étapes|etapes/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    const apresDepot = await page.textContent('#bc-etat');
    const nbEtapes = Number((apresDepot.match(/(\d+)\s*étapes/) || apresDepot.match(/(\d+)\s*etapes/) || [])[1]);
    assert.ok(nbEtapes > 0, 'le dépôt doit annoncer un nombre d\'étapes : ' + apresDepot);
    console.log('      après dépôt : ' + apresDepot.trim().split('\n').pop().slice(0, 150));
    pass('glisser-déposer d\'un export HTML : ' + nbEtapes + ' étapes annoncées, sans serveur.');

    // ── LE RENDU, PUIS LE ZIP ─────────────────────────────────────────────────────────────
    await page.selectOption('#bc-format', 'image/jpeg');
    await page.click('#bc-rendre');
    await page.waitForFunction(() => document.getElementById('bc-zip').disabled, { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById('bc-zip').disabled, { timeout: 300000 });
    const rendu = await page.evaluate(() => {
      const d = window.__chutier.dernier();
      return { images: d.res.images.length, largeurs: [...new Set(d.res.images.map((i) => i.largeur))],
               coupes: d.res.images.filter((i) => i.coupe_px > 0).length };
    });
    assert.equal(rendu.images, nbEtapes,
      'une image par étape : ' + rendu.images + ' pour ' + nbEtapes + ' étapes');
    assert.deepEqual(rendu.largeurs, [1920], 'toutes à 1920 de large (V1) : ' + rendu.largeurs);
    assert.equal(rendu.coupes, 0, 'aucune image plus courte que son contenu (V8) : ' + rendu.coupes);

    const recus = [];
    page.on('download', async (d) => {
      const dest = path.join(temp, d.suggestedFilename());
      await d.saveAs(dest);
      recus.push({ nom: d.suggestedFilename(), chemin: dest });
    });
    await page.click('#bc-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 300000 });
    await page.waitForTimeout(1000);
    assert.equal(recus.length, 1, 'un zip attendu : ' + JSON.stringify(recus.map((r) => r.nom)));

    const t = execFileSync('/usr/bin/unzip', ['-t', recus[0].chemin], { encoding: 'utf8' });
    assert.match(t, /No errors detected/, 'unzip -t : ' + t);
    const lu = lireLeZip(recus[0].chemin);
    assert.equal(lu.mauvais, null, 'tous les CRC doivent être exacts');
    assert.equal(lu.entrees.length, rendu.images + 1,
      'une image par étape plus index.csv : ' + lu.entrees.length);
    assert.ok(lu.entrees.every((e) => e.nom.indexOf(RACINE_ZIP + '/') === 0),
      'tout est dans le dossier racine');
    assert.ok(lu.entrees.filter((e) => e.nom.endsWith('.jpg'))
      .every((e, i, a) => i === 0 || a[i - 1].nom < e.nom), 'les noms sont triés dans l\'ordre');
    pass('rendu de ' + rendu.images + ' images à 1920, puis zip valide de ' + lu.entrees.length
      + ' entrées, téléchargé depuis file://.');

    // ── ET RIEN N'A TOUCHÉ LE RÉSEAU, D'UN BOUT À L'AUTRE ────────────────────────────────
    assert.deepEqual(horsFichier, [],
      'aucune requête hors file: ne doit partir, du chargement au zip : ' + JSON.stringify(horsFichier));
    // ── ET AUCUN VOISIN N'EST DEMANDÉ : une seule requête `file:`, le fichier lui-même ────
    // C'est la mesure qui remplace la lecture du texte : si un script, une feuille ou un module
    // était encore désigné, il apparaîtrait ici.
    const voisinsDemandes = demandes.filter((u) => u.split('?')[0] !== 'file://' + fichierUnique);
    assert.deepEqual(voisinsDemandes, [],
      'le fichier ne doit demander AUCUN voisin : ' + JSON.stringify(voisinsDemandes));
    // ── ET LA PAGE A NEUTRALISÉ ELLE-MÊME CE QUE L'APPLICATION TENTAIT ──────────────────
    // « Aucune connexion » doit être vrai PAR LE FICHIER, pas grâce au refus du contrôle : la
    // garde posée avant le cœur compte ce qu'elle a arrêté, et c'est ce compteur qu'on lit.
    const neutralises = await page.evaluate(() => window.__reseauNeutralise || null);
    assert.ok(Array.isArray(neutralises),
      'la garde réseau doit être installée et compter ce qu\'elle refuse');
    console.log('      requêtes file: : ' + demandes.length + ' (le fichier lui-même) · hors '
      + 'file: parvenues au contrôle : ' + horsFichier.length + ' · neutralisées par la page : '
      + neutralises.length + (neutralises.length ? ' (' + neutralises
        .map((u) => u.replace(/^https?:\/\//, '').split('/')[0]).filter((v, i, a) => a.indexOf(v) === i)
        .join(', ') + ')' : ''));
    const graves = erreurs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
    assert.deepEqual(graves, [], 'aucune erreur de page : ' + JSON.stringify(graves.slice(0, 4)));
    console.log('      zip : ' + recus[0].nom + ', '
      + Math.round(fs.statSync(recus[0].chemin).size / 1024) + ' Ko');
    pass('zéro requête réseau et zéro erreur de page, du double-clic au zip.');
  } finally {
    await nav.close();
  }
  console.log('\nPASS verify-convertisseur-autonome — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
