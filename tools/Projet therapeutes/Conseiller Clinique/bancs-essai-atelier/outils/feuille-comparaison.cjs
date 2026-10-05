// FEUILLE DE COMPARAISON — pour que Christophe juge à l'œil, pas sur un pourcentage.
// Un écart de 1,4 % peut être invisible (anticrénelage du texte) ou ruiner une image (police de
// remplacement). Seul le regard tranche, et c'est à lui que cette page s'adresse.
const fs = require('node:fs'), path = require('node:path');
const RACINE = path.join(__dirname, '..');
const cand = require(path.join(RACINE, 'mesures', 'essai2-candidats.json'));
const ref = require(path.join(RACINE, 'mesures', 'essai2-references.json'));
const mil = (n) => n.toLocaleString('fr-FR');

let lignes = '';
for (const r of cand.resultats) {
  if (!r.etapes.length) continue;
  for (const e of r.etapes) {
    const refImg = 'images/' + r.jeu + '-webkit-ref-' + String(e.etape).padStart(2, '0') + '.png';
    const p2 = e.prises[1].image ? 'images/' + e.prises[1].image : null;
    const diff = e.comparaison.image_diff ? 'images/' + e.comparaison.image_diff : null;
    const part = e.comparaison.comparable ? e.comparaison.part + ' %' : (e.comparaison.raison || '—');
    lignes += '<tr><td>' + r.candidat + '</td><td>' + r.jeu + '</td><td>' + e.etape
      + '</td><td class="n">' + part + '</td><td class="n">' + e.prises[1].duree_ms + ' ms</td>'
      + '<td>' + (e.prises[0].etat.vide ? '<b class="ko">vide</b>' : 'pleine') + '</td>'
      + '<td class="img">' + (refImg ? '<a href="' + refImg + '"><img src="' + refImg + '"></a>' : '—') + '</td>'
      + '<td class="img">' + (p2 ? '<a href="' + p2 + '"><img src="' + p2 + '"></a>' : '—') + '</td>'
      + '<td class="img">' + (diff ? '<a href="' + diff + '"><img src="' + diff + '"></a>' : '—') + '</td></tr>\n';
  }
}
const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Essai 2 — feuille de comparaison</title><style>
body{margin:0;padding:22px;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;background:#f6f2ea;color:#1b2a28}
h1{font-size:20px;margin:0 0 4px} p{max-width:72ch}
table{border-collapse:collapse;background:#fff;border:1px solid #c9c3b8;border-radius:8px;overflow:hidden}
th,td{padding:6px 9px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
th{background:#eceae4;font-weight:600} .n{font-variant-numeric:tabular-nums;text-align:right}
td.img img{width:230px;display:block;border:1px solid #ddd;border-radius:4px}
.ko{color:#8a3f29} .cle{background:#fff;border:1px solid #c9c3b8;border-radius:8px;padding:12px 14px;margin:12px 0}
</style></head><body>
<h1>Essai 2 — référence, candidat, différence</h1>
<p>Référence = capture par <strong>WebKit</strong> lui-même (moteur de Safari). Candidat = la
<strong>seconde</strong> des deux prises. Différence = pixels signalés par pixelmatch au seuil
${cand.seuil_pixel}. Cliquez une vignette pour la voir en taille réelle.</p>
<div class="cle">
<p><strong>Géométrie.</strong> La diapositive a toujours <code>1422×800</code> de mise en page ;
sa boîte rendue varie avec la fenêtre (l'échelle est posée sur un ancêtre). Les captures sont donc
faites à la fenêtre <code>${ref.fenetre}</code>, la seule où les deux manières de mesurer coïncident.
Pour une sortie <code>1920</code> de large, le rapport est <code>${ref.rapport_pour_1920}</code> — et il
donne <code>1919×1080</code>, largeur <strong>impaire</strong> : à corriger avant tout encodage H.264.</p>
<p><strong>Débordement.</strong> Le questionnaire mesure <code>2507 px</code> de contenu pour
<code>798 px</code> visibles : <strong>1709 px restent hors champ</strong>, et aucune des deux
bibliothèques ne les capture — elles photographient la boîte visible, pas la zone défilante.</p>
</div>
<table><thead><tr><th>candidat</th><th>jeu</th><th>étape</th><th>écart</th><th>durée</th>
<th>1<sup>re</sup> prise</th><th>référence (WebKit)</th><th>candidat</th><th>différence</th></tr></thead>
<tbody>
${lignes}</tbody></table>
</body></html>`;
fs.writeFileSync(path.join(RACINE, 'essai2-comparaison.html'), html, 'utf8');
console.log('feuille écrite : essai2-comparaison.html (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' Ko, '
  + (lignes.split('<tr>').length - 1) + ' lignes)');
