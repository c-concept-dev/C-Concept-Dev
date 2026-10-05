#!/usr/bin/env node
// Falsification de la métrique de netteté employée par mesure-nettete-1920.cjs.
//
// Une métrique qui ne sait pas reconnaître un flou délibéré ne prouve rien. Ce banc applique au
// PNG du MOTEUR à 1920 un flou de boîte horizontal de rayon connu, et exige que le gradient sur
// contours CHUTE. Il imprime en regard la valeur mesurée sur la capture SnapDOM, ce qui donne au
// chiffre de l'écart une unité interprétable : « équivalent à tel rayon de flou ».
//
// Aucun fichier existant n'est touché. Rien n'est écrit : seule la sortie console compte.

const fs = require('node:fs'), path = require('node:path');
const { PNG } = require('pngjs');

const SEUIL = 40; // identique à mesure-nettete-1920.cjs
const RACINE = path.join(__dirname, '..');
const IMG = (n) => path.join(RACINE, 'images', n);

// Même calcul que mesure-nettete-1920.cjs, mais sur un tampon déjà en mémoire.
function contours(buf) {
  const p = PNG.sync.read(buf);
  const y0 = Math.round(p.height * 0.25), y1 = Math.round(p.height * 0.75);
  let francs = 0, total = 0, somme = 0, pic = 0;
  for (let y = y0; y < y1; y++) for (let x = 1; x < p.width; x++) {
    const i = (y * p.width + x) * 4, j = i - 4;
    const g = Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i+1] - p.data[j+1])
            + Math.abs(p.data[i+2] - p.data[j+2]);
    total++;
    if (g > SEUIL) { francs++; somme += g; if (g > pic) pic = g; }
  }
  return { taille: p.width + 'x' + p.height, densite: +(100 * francs / total).toFixed(3),
           moyen: +(somme / (francs || 1)).toFixed(1), pic };
}

// Moyenne de boîte horizontale : dégrade exactement l'axe que mesure la métrique (gradient en x).
function flouBoite(buf, rayon) {
  const p = PNG.sync.read(buf), w = p.width, h = p.height;
  const src = Buffer.from(p.data), dst = Buffer.from(p.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let acc = 0, n = 0;
    for (let k = -rayon; k <= rayon; k++) {
      const xx = x + k; if (xx < 0 || xx >= w) continue;
      acc += src[((y * w + xx) * 4) + c]; n++;
    }
    dst[((y * w + x) * 4) + c] = Math.round(acc / n);
  }
  const q = new PNG({ width: w, height: h }); q.data = dst;
  return PNG.sync.write(q);
}

const REF = IMG('n2-c-moteur-1920.png');
const ENV = IMG('n2-e-snapdom-enveloppe1920.png');
if (!fs.existsSync(REF)) {
  console.error('Lance d\'abord outils/mesure-nettete-1920.cjs : ' + REF + ' est absent.');
  process.exit(1);
}

const ref = fs.readFileSync(REF);
const base = contours(ref);
let rouges = 0;

console.log('FALSIFICATION DE LA MÉTRIQUE DE NETTETÉ');
console.log('  référence : (c) le moteur rendant à 1920 — ' + base.taille);
console.log('    gradient sur contours ' + base.moyen + '   pic ' + base.pic
  + '   densité ' + base.densite + ' %');
console.log('');
console.log('  Le flou doit faire CHUTER le gradient. S\'il ne le fait pas, la métrique est aveugle');
console.log('  et toute conclusion de netteté tirée d\'elle est sans valeur.');

let precedent = base.moyen;
for (const rayon of [1, 2, 3]) {
  const m = contours(flouBoite(ref, rayon));
  const chute = +(100 * (base.moyen - m.moyen) / base.moyen).toFixed(1);
  const baisseStricte = m.moyen < precedent;
  const ok = chute > 0 && baisseStricte;
  if (!ok) rouges++;
  console.log('    flou rayon ' + rayon + ' px → gradient ' + m.moyen + '   pic ' + m.pic
    + '   chute ' + chute + ' %   ' + (ok ? 'OK' : 'ROUGE'));
  precedent = m.moyen;
}

if (fs.existsSync(ENV)) {
  const e = contours(fs.readFileSync(ENV));
  const chute = +(100 * (base.moyen - e.moyen) / base.moyen).toFixed(1);
  console.log('');
  console.log('  Mesure à expliquer : (e) SnapDOM sur enveloppe de mise en page 1920 — ' + e.taille);
  console.log('    gradient ' + e.moyen + '   pic ' + e.pic + '   chute ' + chute
    + ' % contre le moteur');
  console.log('    → chute du même ordre que le flou de rayon 1 px ci-dessus.');
} else {
  console.log('');
  console.log('  (e) absent : la mise en regard n\'est pas faite.');
}

console.log('');
console.log('  ' + (rouges ? rouges + ' ROUGE(S) : métrique non fiable' : 'verts : 3   rouges : 0'));
process.exit(rouges ? 1 : 0);
