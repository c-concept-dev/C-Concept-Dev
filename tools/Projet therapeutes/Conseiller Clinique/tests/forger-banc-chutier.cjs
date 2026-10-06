#!/usr/bin/env node
// FORGE LA PAGE D'ESSAI DU CHUTIER VISUEL (lot 2) dans banc-chutier/, ignoré par git.
//
// La page est une COPIE de studio-clinique.html, avec ses références relatives réécrites vers le
// dossier parent et un panneau d'essai injecté. Pourquoi une copie plutôt qu'une page nue : le
// moteur a besoin de tout l'environnement réel — le CSS du lecteur, les schémas embarqués, AJV.
// Une page nue aurait mesuré autre chose que l'application.
//
// TROIS GARDE-FOUS, chacun né d'un bug payé au lot 0 :
//   1. L'injection se fait au DERNIER « </body></html> », et on exige qu'il termine le document.
//      Dans cette page, ce motif apparaît aussi à l'intérieur de chaînes JavaScript : un simple
//      replace coupait une chaîne en deux et la page mourait sur « Unexpected EOF », panneau
//      jamais installé.
//   2. Le script injecté est contrôlé syntaxiquement avant d'être écrit.
//   3. Aucune barre oblique inverse ne doit survivre dans le script injecté, sauf dans « \n ».
//      Un « \d » avalé par un littéral de gabarit avait produit /width="(d+)"/, qui échouait en
//      annonçant « dimensions illisibles » sur une balise qui les portait.
//
//   node "/chemin/absolu/tests/forger-banc-chutier.cjs"
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'banc-chutier');
const SOURCE = path.join(RACINE, 'studio-clinique.html');
const CIBLE = path.join(DOSSIER, 'chutier.html');

const PANNEAU = `
<div id="banc-chutier" style="position:fixed;inset:0;z-index:99999;overflow:auto;background:#f6f2ea;color:#273331;font:14px/1.5 -apple-system,system-ui,sans-serif;padding:18px 20px 60px;">
  <h1 style="font-size:19px;margin:0 0 4px;">Chutier visuel — essai du moteur</h1>
  <p style="color:#667;font-size:13px;margin:0 0 12px;max-width:72ch;">
    Une image par étape, rendue en pilotant le vrai lecteur dans une scène hors écran à 1422×800,
    puis composée sur un canvas de 1920×1080 exactement. Le mode capture est actif par défaut :
    aucune animation de nombre, donc jamais de valeur intermédiaire à l'image.
  </p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
    <select id="bc-presentation" style="font:inherit;padding:5px 8px;"></select>
    <label style="font-size:13px;"><input type="checkbox" id="bc-mode-capture" checked> mode capture</label>
    <button id="bc-rendre" style="font:inherit;padding:6px 12px;cursor:pointer;">Rendre les images</button>
    <button id="bc-tout" style="font:inherit;padding:6px 12px;cursor:pointer;">Rendre les trois</button>
    <button id="bc-jpeg" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Télécharger en JPEG haute qualité</button>
    <button id="bc-perime" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Modifier un texte et revérifier</button>
  </div>
  <div id="bc-etat" style="font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;min-height:3em;"></div>
  <table id="bc-recap" style="border-collapse:collapse;font-size:12px;margin:10px 0;"><tbody></tbody></table>
  <div id="bc-vignettes" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;"></div>
</div>
<script>
(function () {
  var PRESENTATIONS = __PRESENTATIONS__;
  window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {}, __IMAGES__);
  var $ = function (id) { return document.getElementById(id); };
  var dernier = null;
  var sel = $('bc-presentation');
  PRESENTATIONS.forEach(function (p, i) {
    var o = document.createElement('option'); o.value = String(i); o.textContent = p.nom; sel.appendChild(o);
  });
  function dire(t) { $('bc-etat').textContent = t; }
  function ligne(k, v) {
    var tr = document.createElement('tr');
    var a = document.createElement('td'); a.textContent = k;
    var b = document.createElement('td'); b.textContent = v;
    a.style.cssText = b.style.cssText = 'border:1px solid #c9c3b8;padding:3px 9px;text-align:left;';
    a.style.color = '#667';
    tr.appendChild(a); tr.appendChild(b);
    $('bc-recap').querySelector('tbody').appendChild(tr);
  }
  function tas() {
    return (window.performance && window.performance.memory)
      ? window.performance.memory.usedJSHeapSize : null;
  }
  function mo(o) { return (o / 1048576).toFixed(2) + ' Mo'; }

  async function rendre(p) {
    $('bc-recap').querySelector('tbody').innerHTML = '';
    $('bc-vignettes').innerHTML = '';
    var tasAvant = tas();
    var t0 = performance.now();
    var res = await window.AtelierImages.rendreImages(p.doc, {
      modeCapture: $('bc-mode-capture').checked,
      surAvancement: function (a) { dire('rendu : image ' + a.fait + ' sur ' + a.total + '  (' + a.stepId + ')'); },
    });
    var murs = Math.round(performance.now() - t0);
    var tasApres = tas();
    dire('terminé — ' + res.images.length + ' images');
    ligne('présentation', p.nom);
    ligne('étapes énumérées', res.etapes_annoncees);
    ligne('images rendues', res.images.length);
    ligne('mode capture', res.mode_capture ? 'actif (aucune animation)' : 'inactif (attente de ' + res.attente_animations_ms + ' ms par étape)');
    ligne('durée totale', murs + ' ms');
    ligne('durée par image', Math.round(murs / res.images.length) + ' ms');
    ligne('poids compressé', mo(res.octets_total) + '  (' + Math.round(res.octets_total / res.images.length / 1024) + ' Ko par image)');
    ligne('images décodées en mémoire', window.AtelierImages.nombreDecodees() + ' — les images restent compressées');
    // performance.memory n'est PAS une mesure de cet export : Chrome en quantifie la valeur et ne
    // la rafraîchit que rarement, si bien que l'écart ressort souvent à 0,00 Mo quoi qu'il se
    // passe — constaté ici. Elle est affichée pour mémoire, avec sa limite écrite à côté, et c'est
    // le poids COMPRESSÉ ci-dessus qui est la vraie grandeur. La mémoire du processus se relève
    // dans le Moniteur d'activité, qu'aucune page ne peut interroger.
    ligne('tas JS', tasAvant === null ? 'performance.memory absent de ce navigateur (Safari)'
      : mo(tasAvant) + ' avant, ' + mo(tasApres) + ' après, écart ' + mo(tasApres - tasAvant)
        + '  —  valeur quantifiée par Chrome, souvent inchangée : à ne pas lire comme une mesure');
    ligne('SnapDOM', res.snapdom + ', copie locale épinglée');
    ligne('scène puis sortie', res.scene.largeur + 'x' + res.scene.hauteur + '  puis  ' + res.sortie.largeur + 'x' + res.sortie.hauteur);
    var debordants = res.images.filter(function (im) { return im.debordement; });
    ligne('débordements', debordants.length
      ? debordants.map(function (im) { return im.stepId + ' : scène ' + im.hauteurScene + 'px, image ' + im.largeur + 'x' + im.hauteur; }).join('  |  ')
      : 'aucun');

    for (var i = 0; i < res.images.length; i++) {
      var im = res.images[i];
      var cell = document.createElement('figure');
      cell.style.cssText = 'margin:0;width:300px;';
      var url = URL.createObjectURL(im.blob);
      var img = document.createElement('img');
      img.src = url; img.alt = im.titre + ', étape ' + im.rang;
      img.style.cssText = 'width:300px;height:auto;display:block;border:1px solid #c9c3b8;background:#fff;';
      var cap = document.createElement('figcaption');
      cap.style.cssText = 'font-size:11px;color:#667;margin-top:4px;';
      cap.textContent = 'diapositive ' + (im.cardIndex + 1) + ', étape ' + im.rang + ' sur ' + im.surRang
        + '  —  ' + im.largeur + 'x' + im.hauteur + (im.debordement ? ' (déborde)' : '')
        + '  —  ' + Math.round(im.octets / 1024) + ' Ko  —  ' + im.signature
        + '\\n' + im.titre;
      cap.style.whiteSpace = 'pre-line';
      cell.appendChild(img); cell.appendChild(cap);
      $('bc-vignettes').appendChild(cell);
    }
    dernier = { p: p, res: res };
    $('bc-jpeg').disabled = false;
    $('bc-perime').disabled = false;
    return res;
  }

  $('bc-rendre').onclick = async function () {
    this.disabled = true;
    try { await rendre(PRESENTATIONS[Number(sel.value)]); }
    catch (e) { dire('ÉCHEC : ' + (e && e.message || e)); }
    this.disabled = false;
  };
  $('bc-tout').onclick = async function () {
    this.disabled = true;
    var lignes = [];
    for (var i = 0; i < PRESENTATIONS.length; i++) {
      try {
        var r = await rendre(PRESENTATIONS[i]);
        lignes.push(PRESENTATIONS[i].nom + ' : ' + r.images.length + ' images, ' + mo(r.octets_total) + ', ' + r.duree_ms + ' ms');
      } catch (e) { lignes.push(PRESENTATIONS[i].nom + ' : ÉCHEC ' + (e && e.message || e)); }
    }
    dire(lignes.join('\\n'));
    this.disabled = false;
  };
  $('bc-jpeg').onclick = async function () {
    if (!dernier) return;
    this.disabled = true;
    // Un téléchargement par image, sans archive : le bouton ne doit dépendre d'aucune
    // bibliothèque chargée depuis le réseau, puisque l'atelier doit fonctionner hors ligne.
    for (var i = 0; i < dernier.res.images.length; i++) {
      var im = dernier.res.images[i];
      var blob = await window.AtelierImages.versType(im, 'image/jpeg', 0.92);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = window.AtelierImages.nomFichier(im, 'jpg');
      document.body.appendChild(a); a.click(); a.remove();
      dire('téléchargé ' + (i + 1) + ' sur ' + dernier.res.images.length + ' : ' + a.download
        + '  (' + Math.round(blob.size / 1024) + ' Ko)');
      await new Promise(function (r) { setTimeout(r, 120); });
    }
    dire('téléchargement terminé — ' + dernier.res.images.length + ' fichiers JPEG de qualité 0,92.');
    this.disabled = false;
  };
  $('bc-perime').onclick = async function () {
    if (!dernier) return;
    this.disabled = true;
    var modifie = JSON.parse(JSON.stringify(dernier.p.doc));
    var premier = modifie.blocks[0].content.blocks[0];
    if (premier && premier.content && typeof premier.content.text === 'string') {
      premier.content.text = premier.content.text + ' (texte modifié)';
    } else {
      modifie.blocks[0].content.title = modifie.blocks[0].content.title + ' (modifié)';
    }
    var verdict = await window.AtelierImages.comparerAuDocument(dernier.res.images, modifie);
    dire('après modification du premier bloc :'
      + '\\n  périmées : ' + (verdict.perimees.join(', ') || 'aucune')
      + '\\n  disparues : ' + (verdict.disparues.join(', ') || 'aucune')
      + '\\n  nouvelles : ' + (verdict.nouvelles.join(', ') || 'aucune')
      + '\\n  intactes : ' + verdict.intactes.length
      + '\\n  à jour : ' + (verdict.a_jour ? 'oui' : 'NON — le Studio signale, il ne remplace jamais en silence'));
    this.disabled = false;
  };
  dire('prêt. Le moteur est chargé, SnapDOM sera importé à la première capture.');
})();
</script>
`;

function forger() {
  const source = fs.readFileSync(SOURCE, 'utf8');

  // Références relatives : la copie vit un dossier plus bas.
  let page = source
    .replace('<script src="studio-clinique-core.js"></script>', '<script src="../studio-clinique-core.js"></script>')
    .replace('<script src="atelier-images.js"></script>', '<script src="../atelier-images.js"></script>')
    .replace('<script src="vendor/ajv2020.min.js"></script>', '<script src="../vendor/ajv2020.min.js"></script>');
  ['../studio-clinique-core.js', '../atelier-images.js', '../vendor/ajv2020.min.js'].forEach((r) => {
    if (page.indexOf('src="' + r + '"') === -1) throw new Error('référence non réécrite : ' + r);
  });

  let bloc = PANNEAU
    .replace('__PRESENTATIONS__', JSON.stringify(PRESENTATIONS))
    .replace('__IMAGES__', JSON.stringify(IMAGES_EMBARQUEES));

  // Garde-fou 3 — aucune barre oblique inverse rescapée, sauf « \n ».
  const restes = bloc.replace(/\\n/g, '').indexOf('\\');
  if (restes !== -1) {
    throw new Error('barre oblique inverse rescapée dans le script injecté, à l\'offset '
      + restes + ' : « ' + bloc.replace(/\\n/g, '').slice(restes - 30, restes + 30) + ' »');
  }

  // Garde-fou 2 — le script injecté doit être syntaxiquement valide.
  const scripts = bloc.split('<script>');
  const corps = scripts[1].split('</' + 'script>')[0];
  new vm.Script(corps);   // lève si invalide

  // Garde-fou 1 — injection avant la fermeture du corps, qui doit TERMINER le document.
  // Dans l'export autonome du lot 0, « </body></html> » apparaissait trois fois, deux fois à
  // l'intérieur de chaînes JavaScript : un simple replace coupait une chaîne et la page mourait.
  // Ici, mesuré : chaque balise n'apparaît qu'UNE fois, et le fichier finit par
  // « </body>\n</html>\n ». On le vérifie au lieu de le supposer, et on refuse sinon.
  const ancre = '</body>';
  const nbCorps = page.split(ancre).length - 1;
  const nbHtml = page.split('</html>').length - 1;
  if (nbCorps !== 1 || nbHtml !== 1) {
    throw new Error('la page source ne porte plus exactement une fermeture de chacun : '
      + nbCorps + ' « </body> » et ' + nbHtml + ' « </html> ». '
      + 'Injection refusée : c\'est ainsi qu\'une chaîne JavaScript se coupe en deux.');
  }
  const pos = page.lastIndexOf(ancre);
  const apres = page.slice(pos + ancre.length).trim();
  if (apres !== '</html>') {
    throw new Error('la fermeture du corps ne termine pas le document — après elle : « '
      + apres.slice(0, 40) + ' »');
  }
  page = page.slice(0, pos) + bloc + '\n' + ancre + '\n</html>\n';

  fs.mkdirSync(DOSSIER, { recursive: true });
  fs.writeFileSync(CIBLE, page, 'utf8');
  return page;
}

const page = forger();
console.log('page forgée : ' + CIBLE);
console.log('  ' + (page.length / 1024).toFixed(0) + ' Ko, ' + PRESENTATIONS.length + ' présentations inlinées');
console.log('');
console.log('Pour l\'ouvrir — UNE seule commande, chemins absolus, aucun « cd » relatif.');
console.log('Un module ES ne s\'importe pas depuis file:// : il FAUT un serveur, sans quoi SnapDOM');
console.log('ne se charge pas et rien ne se capture.');
console.log('');
console.log('  python3 -m http.server 8765 --directory ' + JSON.stringify(RACINE)
  + ' & sleep 1 && open "http://127.0.0.1:8765/banc-chutier/chutier.html"');
console.log('');
console.log('Pour l\'arrêter ensuite :   kill %1');
