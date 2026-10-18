// TROIS CAPTURES DE LA BARRE DU HAUT, POUR L'ŒIL DE CHRISTOPHE (lot 2C, 2.2 bis).
//
// CE QUE CES IMAGES CONTIENNENT : la barre d'un document SYNTHÉTIQUE (« Cinq pages pour un
// essai »), à trois largeurs. Aucun contenu de Christophe, aucune présentation réelle.
//
// LE BOUTON DE D7 EST SIGNALÉ, PAS LIVRÉ : il est `hidden` dans le produit. La capture le
// RÉVÈLE, en pointillé et en demi-teinte, uniquement pour montrer où il se posera. C'est une
// annotation de la capture, ajoutée ici et nulle part ailleurs : le produit ne change pas.
//
// Les images vont HORS du dépôt.
//
//   NODE_PATH=<playwright> node tests/capturer-barre-du-haut.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(os.homedir(), 'Documents', 'Studio-Clinique-Outils', 'captures-barre');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

(async () => {
  const s = http.createServer((q, r) => {
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  fs.mkdirSync(SORTIE, { recursive: true });
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const faites = [];
  try {
    for (const largeur of [1024, 1272, 1440]) {
      const ctx = await nav.newContext({ viewport: { width: largeur, height: 900 },
                                         deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.route('**/*', (route) => {
        const u = route.request().url();
        return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
          ? route.continue() : route.abort();
      });
      await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
      await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
      await page.evaluate(async (d) => {
        const cle = 'capture-barre';
        window._adocArtifacts = window._adocArtifacts || {};
        // L'ÉTAT ENREGISTRÉ, le plus chargé (« Supprimer » en plus, « Nouvelle version » à la
        // place d'« Enregistrer »), obtenu comme l'application l'obtient. Une première version
        // de cette capture réécrivait seulement le libellé : l'image montrait alors
        // « Nouvelle version » à côté de la pastille « Non enregistré », deux états qui ne
        // coexistent jamais, et il y manquait « Supprimer ».
        window._adocArtifacts[cle] = { name: d.title, _adocGenerationEngine: 'structured',
          _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
          _adocClinicalDocumentId: 'document-synthetique-0001', _ccEditorDirty: false,
          _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
            blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
        await window.adocOpenWorkspace(cle);
        // L'ANNOTATION DE LA CAPTURE : on révèle le bouton réservé de D7, en pointillé et en
        // demi-teinte, pour que sa place se voie. Rien de cela n'existe dans le produit.
        const d7 = document.getElementById('cc-ws-texte-diapositives-btn');
        if (d7) {
          d7.hidden = false;
          d7.style.borderStyle = 'dashed';
          d7.style.opacity = '.55';
          d7.title = 'Réservé pour D7 — pas encore livré';
        }
      }, PRESENTATION);
      await page.waitForTimeout(600);
      const barre = page.locator('.cc-ws-topbar');
      const boite = await barre.boundingBox();
      const nom = 'barre-du-haut-' + largeur + 'px.png';
      await barre.screenshot({ path: path.join(SORTIE, nom) });
      faites.push({ nom: nom, largeur: largeur,
                    hauteur: boite ? Math.round(boite.height) : null,
                    octets: fs.statSync(path.join(SORTIE, nom)).size });
      await ctx.close();
    }
  } finally {
    await nav.close();
    s.close();
  }
  console.log('Captures écrites HORS du dépôt :');
  console.log('  ' + SORTIE);
  faites.forEach((f) => console.log('  ' + f.nom + '  (fenêtre ' + f.largeur + ' px · barre '
    + f.hauteur + ' px · ' + Math.round(f.octets / 1024) + ' Ko, rendu à 2×)'));
  console.log('\nLe bouton « Texte des diapositives » y paraît EN POINTILLÉ et en demi-teinte :');
  console.log('c\'est sa place réservée (D7), révélée par la capture, absente du produit.');
})();
