#!/usr/bin/env node
// QUATRE RÉGLAGES DE SCÈNE ET DE TYPOGRAPHIE, MESURÉS ET MIS CÔTE À CÔTE.
//
// Le texte des captures fait 20,3 px dans un cadre de 1080, soit 1,88 % de sa hauteur. Est-ce
// assez ? La question ne se tranche pas par le calcul : elle se tranche à l'œil, sur des images
// comparables. Cet outil produit les mesures ET la planche.
//
//   (a) 1422×800 telle quelle          — la scène du lecteur, référence
//   (b) 960×540                        — scène plus petite, donc agrandissement plus fort (×2)
//   (c) 1422×800, échelle typo ×1,6    — même scène, texte plus grand
//   (d) 960×540, échelle typo ×1,4     — les deux leviers ensemble
//
// UNE PRÉSENTATION RÉELLE. Déposez son JSON dans banc-chutier/entrees/ — dossier ignoré par git,
// donc rien n'entre au dépôt, et le fichier n'est jamais copié ailleurs. Deux formes sont
// acceptées : le ClinicalDocument nu, ou l'enveloppe { clinicalDocument: … } telle qu'elle est
// enregistrée. Sans fichier, l'outil tourne sur les trois présentations d'essai et le dit.
//
//   NODE_PATH=<playwright> node tests/mesure-reglages-typo.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');
const { INSPECTEUR } = require('./chutier-inspecteur.cjs');

const RACINE = path.join(__dirname, '..');
const BANC = path.join(RACINE, 'banc-chutier');
const ENTREES = path.join(BANC, 'entrees');
const PLANCHE = path.join(BANC, 'planche');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const REGLAGES = [
  { cle: 'a', nom: '1422x800, echelle 1', court: '(a) 1422×800, échelle 1', scene: null, echelleTypo: 1 },
  { cle: 'b', nom: '960x540, echelle 1', court: '(b) 960×540, échelle 1', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1 },
  { cle: 'c', nom: '1422x800, echelle x1,6', court: '(c) 1422×800, typo ×1,6', scene: null, echelleTypo: 1.6 },
  { cle: 'd', nom: '960x540, echelle x1,4', court: '(d) 960×540, typo ×1,4', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.4 },
];

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

function presentationsReelles() {
  if (!fs.existsSync(ENTREES)) return [];
  return fs.readdirSync(ENTREES).filter((f) => f.endsWith('.json')).map((f) => {
    const brut = JSON.parse(fs.readFileSync(path.join(ENTREES, f), 'utf8'));
    const doc = brut.clinicalDocument || brut;
    if (!doc || doc.documentKind !== 'presentation') {
      console.log('  ignoré : ' + f + ' — documentKind « ' + (doc && doc.documentKind) +' », ce n\'est pas une Présentation');
      return null;
    }
    return { cle: 'reelle-' + f.replace(/\.json$/, ''), nom: 'RÉELLE — ' + (doc.title || f), doc, reelle: true };
  }).filter(Boolean);
}

const mediane = (xs) => {
  if (!xs.length) return null;
  const t = xs.slice().sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

(async () => {
  const reelles = presentationsReelles();
  const jeux = PRESENTATIONS.concat(reelles);
  fs.mkdirSync(PLANCHE, { recursive: true });
  for (const f of fs.readdirSync(PLANCHE)) fs.unlinkSync(path.join(PLANCHE, f));

  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const releve = {};
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.AtelierImages === 'object');
    await page.evaluate((imgs) => { window.ADOC_EXPORT_IMAGES = imgs; }, IMAGES_EMBARQUEES);

    console.log('QUATRE RÉGLAGES — mesuré sur la scène vivante, juste avant SnapDOM.');
    console.log('Sortie toujours 1920 de large. Les pourcentages de texte sont rapportés aux 1080 du cadre.');
    console.log(reelles.length
      ? 'Présentations réelles chargées depuis banc-chutier/entrees/ : ' + reelles.length
      : 'AUCUNE présentation réelle dans banc-chutier/entrees/ — mesure sur les trois présentations d\'essai seulement.');
    console.log('');

    for (const reg of REGLAGES) {
      releve[reg.cle] = {};
      for (const p of jeux) {
        const r = await page.evaluate(async ({ d, src, opts }) => {
          const inspecter = eval('(' + src + ')');
          const t0 = performance.now();
          const res = await window.AtelierImages.rendreImages(d, Object.assign({ inspecter }, opts));
          const duree = Math.round(performance.now() - t0);
          const images = [];
          for (const im of res.images) {
            // Les images partent en base64 vers Node, qui les écrit dans le dossier ignoré.
            const b64 = await new Promise((ok) => {
              const fr = new FileReader();
              fr.onload = () => ok(String(fr.result).split(',')[1]);
              fr.readAsDataURL(im.blob);
            });
            images.push({ stepId: im.stepId, titre: im.titre, rang: im.rang, surRang: im.surRang,
                          largeur: im.largeur, hauteur: im.hauteur, debordement: im.debordement,
                          hauteurScene: im.hauteurScene, octets: im.octets, i: im.inspection, b64 });
          }
          return { duree, scene: res.scene, echelle: res.echelle_typo, images };
        }, { d: p.doc, src: INSPECTEUR.toString(),
             opts: { scene: reg.scene, echelleTypo: reg.echelleTypo, type: 'image/png' } });

        r.images.forEach((im) => {
          const nom = reg.cle + '-' + p.cle + '-' + String(im.rang).padStart(2, '0') + '-' + im.stepId.replace(/[^a-zA-Z0-9-]/g, '-') + '.png';
          fs.writeFileSync(path.join(PLANCHE, nom), Buffer.from(im.b64, 'base64'));
          im.fichier = nom; delete im.b64;
        });
        releve[reg.cle][p.cle] = r;
      }
    }
  } finally {
    await browser.close();
    serveur.close();
  }

  // ── Le tableau ──────────────────────────────────────────────────────────────────────────────
  console.log('RÉGLAGE'.padEnd(26) + 'TEXTE (médiane)'.padEnd(22) + 'DÉBORDE'.padEnd(10)
    + 'REMPLISSAGE'.padEnd(14) + 'TEMPS');
  const resume = [];
  for (const reg of REGLAGES) {
    const toutes = jeux.flatMap((p) => releve[reg.cle][p.cle].images);
    const tailles = toutes.flatMap((im) => im.i.tailles.map((t) => t.sortie));
    const pcs = toutes.flatMap((im) => im.i.tailles.map((t) => t.pc_hauteur));
    const remplissages = toutes.map((im) => im.i.encre ? im.i.encre.part_surface : 0);
    const debordent = toutes.filter((im) => im.debordement).length;
    const duree = jeux.reduce((a, p) => a + releve[reg.cle][p.cle].duree, 0);
    const l = {
      cle: reg.cle, nom: reg.court,
      texte_px: mediane(tailles), texte_pc: mediane(pcs),
      texte_min_px: Math.min.apply(null, tailles), texte_max_px: Math.max.apply(null, tailles),
      debordent, total: toutes.length,
      remplissage: +(remplissages.reduce((a, b) => a + b, 0) / remplissages.length).toFixed(1),
      ms_par_image: Math.round(duree / toutes.length),
    };
    resume.push(l);
    console.log(reg.court.padEnd(26)
      + (l.texte_px + ' px / ' + l.texte_pc + ' %').padEnd(22)
      + (l.debordent + ' / ' + l.total).padEnd(10)
      + (l.remplissage + ' % moy.').padEnd(14)
      + l.ms_par_image + ' ms');
  }
  console.log('');
  console.log('Texte : médiane sur tous les porteurs de texte de toutes les étapes ; min et max :');
  resume.forEach((l) => console.log('  ' + l.nom.padEnd(26) + 'de ' + l.texte_min_px + ' à ' + l.texte_max_px + ' px'));

  // ── La planche ──────────────────────────────────────────────────────────────────────────────
  const etapes = [];
  jeux.forEach((p) => releve.a[p.cle].images.forEach((im, k) => etapes.push({ p, k, im })));
  const rang = (regCle, pCle, k) => releve[regCle][pCle].images[k];
  const lignes = etapes.map(({ p, k, im }) => {
    const cases = REGLAGES.map((reg) => {
      const x = rang(reg.cle, p.cle, k);
      if (!x) return '<td class="vide">—</td>';
      return '<td><img src="planche/' + x.fichier + '" alt="' + reg.court + '">'
        + '<p>' + x.largeur + '×' + x.hauteur + (x.debordement ? ' <b>déborde</b>' : '')
        + ' — texte ' + (x.i.tailles[0] ? x.i.tailles[0].sortie + ' px (' + x.i.tailles[0].pc_hauteur + ' %)' : '—')
        + ' — remplissage ' + (x.i.encre ? x.i.encre.part_surface : 0) + ' %</p></td>';
    }).join('');
    return '<tr><th>' + p.nom + '<br><span>' + im.titre + '<br>étape ' + im.rang + '/' + im.surRang + '</span></th>' + cases + '</tr>';
  }).join('\n');

  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
    + '<title>Planche comparative — réglages de scène et de typographie</title><style>'
    + 'body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:20px 24px 60px;background:#f6f2ea;color:#273331;}'
    + 'h1{font-size:19px;margin:0 0 4px;} p.note{color:#667;font-size:13px;max-width:78ch;margin:0 0 14px;}'
    + 'table{border-collapse:collapse;} '
    // « ne centre pas verticalement » : tout est aligné en haut, pour que les quatre variantes
    // d'une même étape commencent à la même ligne et se comparent d'un seul regard.
    + 'td,th{vertical-align:top;border:1px solid #c9c3b8;padding:8px;background:#fffdf9;}'
    + 'th{text-align:left;width:190px;font-size:13px;} th span{font-weight:400;color:#667;font-size:12px;}'
    + 'td img{width:440px;height:auto;display:block;border:1px solid #e3ded3;}'
    + 'td p{margin:5px 0 0;font-size:11px;color:#667;} td.vide{color:#999;}'
    + 'thead th{position:sticky;top:0;background:#efe9dd;z-index:1;}'
    + '</style></head><body>'
    + '<h1>Quatre réglages, les mêmes étapes côte à côte</h1>'
    + '<p class="note">Toutes les images sortent en 1920 de large. Les vignettes font 440 px ici : '
    + 'pour juger la lisibilité réelle, ouvrez une image dans un onglet — elle s\'affichera à sa '
    + 'taille. Rien n\'est centré verticalement : les quatre variantes d\'une étape commencent à la '
    + 'même ligne.</p>'
    + '<table><thead><tr><th>Étape</th>' + REGLAGES.map((r) => '<th>' + r.court + '</th>').join('') + '</tr></thead>'
    + '<tbody>' + lignes + '</tbody></table></body></html>';
  fs.writeFileSync(path.join(BANC, 'planche-typo.html'), html, 'utf8');
  fs.writeFileSync(path.join(BANC, 'reglages-typo.json'), JSON.stringify({ resume, releve }, null, 1), 'utf8');

  console.log('');
  console.log('planche : ' + path.join(BANC, 'planche-typo.html') + '  (' + etapes.length + ' étapes × 4 réglages)');
  console.log('relevé  : ' + path.join(BANC, 'reglages-typo.json'));
  console.log('');
  console.log('Pour l\'ouvrir dans Safari — UNE commande, chemins absolus :');
  console.log('');
  console.log('  python3 -m http.server 8765 --directory ' + JSON.stringify(RACINE)
    + ' & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-typo.html"');
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
