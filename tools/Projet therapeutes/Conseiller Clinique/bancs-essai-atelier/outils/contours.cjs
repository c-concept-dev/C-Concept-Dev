// Métrique de netteté partagée, extraite telle quelle de mesure-nettete-1920.cjs.
//
// Mesure la RAIDEUR des contours, pas une moyenne sur toute l'image : un agrandissement bicubique
// conserve l'énergie en l'étalant, donc une moyenne globale ne distingue rien. On ne retient que
// les gradients horizontaux francs (> SEUIL), sur la moitié centrale des lignes.
//
// La parité avec les chiffres déjà publiés est exigée par mesure-nettete-candidats.cjs avant toute
// comparaison : (c) le moteur à 1920 doit redonner densité 0,208 %, gradient 162,5, pic 232.
const SEUIL = 40;

// pixels : Uint8ClampedArray/Buffer RGBA ; largeur, hauteur en pixels.
function contoursPixels(pixels, largeur, hauteur) {
  const y0 = Math.round(hauteur * 0.25), y1 = Math.round(hauteur * 0.75);
  let francs = 0, total = 0, somme = 0, pic = 0;
  for (let y = y0; y < y1; y++) for (let x = 1; x < largeur; x++) {
    const i = (y * largeur + x) * 4, j = i - 4;
    const g = Math.abs(pixels[i] - pixels[j]) + Math.abs(pixels[i+1] - pixels[j+1])
            + Math.abs(pixels[i+2] - pixels[j+2]);
    total++;
    if (g > SEUIL) { francs++; somme += g; if (g > pic) pic = g; }
  }
  return { taille: largeur + 'x' + hauteur, densite: +(100 * francs / total).toFixed(3),
           moyen: +(somme / (francs || 1)).toFixed(1), pic };
}

// Moyenne de boîte horizontale : dégrade exactement l'axe que mesure la métrique.
function flouBoite(pixels, largeur, hauteur, rayon) {
  const src = Uint8ClampedArray.from(pixels), dst = Uint8ClampedArray.from(pixels);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) for (let c = 0; c < 3; c++) {
    let acc = 0, n = 0;
    for (let k = -rayon; k <= rayon; k++) {
      const xx = x + k; if (xx < 0 || xx >= largeur) continue;
      acc += src[((y * largeur + xx) * 4) + c]; n++;
    }
    dst[((y * largeur + x) * 4) + c] = Math.round(acc / n);
  }
  return dst;
}

module.exports = { SEUIL, contoursPixels, flouBoite };
