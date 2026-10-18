#!/usr/bin/env node
// FORGE LE CONVERTISSEUR AUTONOME (lot 2C) — UN SEUL FICHIER, AUCUN SERVEUR.
//
// CE QU'IL PRODUIT : un `.html` unique, ouvert par double-clic, où Christophe dépose l'export
// HTML d'une présentation et qui lui rend un zip d'images, une par étape, pour iMovie.
//
// POURQUOI C'ÉTAIT « IMPOSSIBLE » HIER, ET CE QUI A CHANGÉ. J'avais mesuré qu'en `file://` le
// navigateur refuse d'importer le module ES de SnapDOM (origine « null ») et refuse même de le
// lire par `fetch`. C'était vrai, et insuffisant : un module n'a besoin d'être ALLÉ CHERCHER que
// s'il n'est pas déjà là. Mesuré depuis : un `<script type="module">` EN LIGNE, qui pose
// `window.snapdom`, fonctionne en `file://` et capture réellement (200×60 au premier essai).
// `atelier-images.js` préfère désormais un snapdom déjà présent. Il n'y a plus de verrou.
//
// LE FICHIER PRODUIT N'ENTRE PAS AU DÉPÔT : il va dans ~/Documents/Studio-Clinique-Outils/.
// C'est un outil local, il porte le code de l'application, et il n'a rien à faire en ligne.
//
//   node "/chemin/absolu/tests/forger-convertisseur-autonome.cjs"
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'banc-chutier', 'chutier.html');
const SORTIE = process.argv[2]
  || path.join(os.homedir(), 'Documents', 'Studio-Clinique-Outils', 'convertisseur-images.html');

// ── LE MODULE ES, MIS EN LIGNE ET EXPOSÉ SUR `window` ───────────────────────────────────────
// La clause d'export finale est remplacée par une affectation : un module en ligne ne peut rien
// exporter à personne, mais il peut poser ce qu'il faut là où le moteur le cherche.
function snapdomEnLigne() {
  const src = fs.readFileSync(path.join(RACINE, 'vendor', 'snapdom.mjs'), 'utf8').trim();
  const m = src.match(/export\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error('clause export finale introuvable dans vendor/snapdom.mjs');
  const paires = m[1].split(',').map((p) => p.split(' as '));
  const snapdom = paires.find((p) => (p[1] || p[0]).trim() === 'snapdom');
  if (!snapdom) throw new Error('vendor/snapdom.mjs n\'exporte pas « snapdom »');
  return src.slice(0, m.index) + '\nwindow.snapdom = ' + snapdom[0].trim() + ';'
    + '\nwindow.__snapdomPret = true;\n';
}

function enLigne(fichier) {
  return fs.readFileSync(path.join(RACINE, fichier), 'utf8');
}

function forger() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error('la page du banc est absente : ' + SOURCE
      + '\n  elle se forge par : node tests/forger-banc-chutier.cjs');
  }
  let page = fs.readFileSync(SOURCE, 'utf8');

  // ── 1. LES CINQ SCRIPTS VOISINS, MIS EN LIGNE DANS L'ORDRE OÙ ILS ÉTAIENT ───────────────
  // L'ordre compte : ajv avant le cœur, le cœur avant l'atelier, l'atelier avant le panneau.
  const voisins = ['vendor/ajv2020.min.js', 'studio-clinique-core.js', 'atelier-images.js',
                   'zip-stocke.js', 'narration-ia.js'];
  voisins.forEach((f) => {
    const balise = '<script src="../' + f + '"></script>';
    if (page.indexOf(balise) < 0) throw new Error('balise introuvable : ' + balise);
    // Un `</script>` dans le source couperait la balise : on le coupe en deux, ce qui ne change
    // rien pour le moteur JavaScript et tout pour l'analyseur HTML.
    const corps = enLigne(f).split('</script>').join('<\\/script>');
    // ── LE REMPLACEMENT PASSE PAR UNE FONCTION, ET C'EST INDISPENSABLE ──────────────────
    // `String.replace` interprète `$&`, `$'`, `$1`… DANS LA CHAÎNE DE REMPLACEMENT. Or
    // `ajv2020.min.js` contient `$&` dans ses classes de caractères (`/^[A-Za-z0-9\\-._~!$&'()*+,;=:@/]$/u`),
    // et chaque `$&` a été remplacé par la balise elle-même : la bibliothèque arrivait
    // SILENCIEUSEMENT CORROMPUE dans le fichier produit. Trouvé par le contrôle, qui cherchait
    // des balises survivantes et en a trouvé six — six morceaux d'ajv détruits. Une fonction de
    // remplacement rend la chaîne littérale et clôt la question.
    page = page.replace(balise, () =>
      '<!-- (lot 2C) ' + f + ' mis en ligne : aucun fichier voisin à aller chercher -->\n'
      + '<script>\n' + corps + '\n</script>');
  });

  // ── 2. SNAPDOM, EN MODULE EN LIGNE, AVANT TOUT LE RESTE ────────────────────────────────
  // Avant, parce que `atelier-images.js` le cherche sur `window` au moment de capturer, et que
  // rien ne garantit l'ordre d'exécution d'un module par rapport aux scripts classiques.
  const marque = '<!-- (lot 2C) ' + voisins[0] + ' mis en ligne';
  if (page.indexOf(marque) < 0) throw new Error('marque d\'insertion introuvable');

  // ── 2 bis. AUCUN APPEL RÉSEAU, PAR CONSTRUCTION ET NON PAR CHANCE ─────────────────────
  //
  // Mesuré : même sans balise externe, la page tente DEUX appels au chargement — l'application
  // demande ses statistiques de bibliothèque et ses chartes à son Worker. Ces appels échouent
  // sans casser le reste, mais « aucune connexion » serait alors une promesse tenue par
  // l'absence de réseau, pas par le fichier. On les neutralise donc ICI, avant que le cœur ne
  // s'exécute, et la page COMPTE ce qu'elle a refusé : c'est ce compteur que le contrôle lit.
  //
  // Ce qui reste autorisé : tout ce qui résout en `file:`, `data:` ou `blob:` — c'est-à-dire la
  // page elle-même, les images embarquées de l'export, et l'objet du zip à télécharger.
  const garde = '<!-- (lot 2C) le réseau est neutralisé avant que le cœur ne s\'exécute -->\n'
    + '<script>\n'
    + '(function () {\n'
    + '  function localUrl(u) {\n'
    + '    try {\n'
    + '      var s = (u && typeof u === "object" && u.url) ? u.url : String(u);\n'
    + '      var p = new URL(s, location.href).protocol;\n'
    + '      return p === "file:" || p === "data:" || p === "blob:";\n'
    + '    } catch (e) { return false; }\n'
    + '  }\n'
    + '  window.__reseauNeutralise = [];\n'
    + '  var vraiFetch = window.fetch && window.fetch.bind(window);\n'
    + '  window.fetch = function (u, o) {\n'
    + '    if (localUrl(u)) return vraiFetch(u, o);\n'
    + '    window.__reseauNeutralise.push(String((u && u.url) || u));\n'
    + '    return Promise.reject(new Error("convertisseur autonome : aucun appel reseau"));\n'
    + '  };\n'
    + '  var ouvrir = XMLHttpRequest.prototype.open;\n'
    + '  XMLHttpRequest.prototype.open = function (m, u) {\n'
    + '    if (!localUrl(u)) {\n'
    + '      window.__reseauNeutralise.push(String(u));\n'
    + '      throw new Error("convertisseur autonome : aucun appel reseau");\n'
    + '    }\n'
    + '    return ouvrir.apply(this, arguments);\n'
    + '  };\n'
    + '})();\n'
    + '</script>\n';
  page = page.replace(marque, () => garde + marque);
  const moduleEnLigne = snapdomEnLigne();
  page = page.replace(marque, () =>
    '<!-- (lot 2C) SnapDOM ' + 'mis en ligne et posé sur window : en file://, un module ne peut\n'
    + '     pas être allé chercher (origine « null »), mais il peut être déjà là. -->\n'
    + '<script type="module">\n' + moduleEnLigne + '\n</script>\n' + marque);

  // ── 3. CE QUI RESTAIT À ALLER CHERCHER, ET QUI N'EXISTE PAS EN file:// ─────────────────
  // Les polices de Google : en file://, elles ne chargent pas, et le texte sort dans les polices
  // système. Mesuré sur 19 étapes : les HAUTEURS ne changent pas (donc rien n'est coupé) mais
  // aucune image n'est identique et le poids monte de 3,8 %. On RETIRE la feuille plutôt que de
  // la laisser échouer en silence, et la page le DIT à l'écran : c'est la seule différence
  // assumée entre ce convertisseur et le banc servi.
  const avant = page.length;
  page = page.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g,
    '<!-- (lot 2C) polices de Google retirées : en file:// elles ne chargent pas -->');
  page = page.replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/g, '');

  // ── 4. LE DÉPÔT PAR GLISSER-DÉPOSER, ET L'AVIS SUR LES POLICES ────────────────────────
  const ajout = `
<div id="cv-depot" style="position:fixed;inset:0;z-index:999999;display:none;
     align-items:center;justify-content:center;background:rgba(39,51,49,.88);color:#f6f2ea;
     font:600 22px/1.4 -apple-system,system-ui,sans-serif;text-align:center;padding:40px;">
  Déposez l'export HTML de votre présentation
</div>
<script>
(function () {
  var voile = document.getElementById('cv-depot');
  var compte = 0;
  function montrer(oui) { voile.style.display = oui ? 'flex' : 'none'; }
  window.addEventListener('dragenter', function (e) { e.preventDefault(); compte++; montrer(true); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function (e) { e.preventDefault(); compte--; if (compte <= 0) montrer(false); });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); compte = 0; montrer(false);
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    // LE MÊME CHEMIN QUE LE BOUTON : on ne duplique pas la lecture de l'export, on la réutilise.
    // Un second chemin de lecture finirait par lire autrement que le premier.
    var cible = /[.]json$/i.test(f.name) ? 'bc-fichier' : 'bc-export';
    var dt = new DataTransfer();
    dt.items.add(f);
    var entree = document.getElementById(cible);
    entree.files = dt.files;
    entree.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // L'AVIS SUR LES POLICES, à l'écran et non dans un coin de ma tête.
  var note = document.createElement('p');
  note.className = 'note';
  note.style.cssText = 'color:#8a5a2b;font-size:13px;margin:0 0 10px;max-width:78ch;';
  note.innerHTML = '<strong>Fichier autonome</strong> : aucun serveur, aucune connexion. '
    + 'En contrepartie, les polices du Studio ne sont pas chargées — le texte des images sort '
    + 'dans les polices système. Mesuré sur 19 étapes : les hauteurs ne changent pas, donc rien '
    + 'n’est coupé, mais les images ne sont pas identiques à celles du banc servi. '
    + 'Glissez-déposez l’export HTML de votre présentation n’importe où sur cette page.';
  var hote = document.getElementById('banc-chutier');
  if (hote) hote.insertBefore(note, hote.children[2] || null);
})();
</script>
`;
  // ── L'INSERTION SE FAIT AU DERNIER `</body></html>`, ET ON EXIGE QU'IL TERMINE LE DOCUMENT
  //
  // C'est le garde-fou nº 1 de la forge du banc, écrit après un bug payé au lot 0, et je suis
  // tombé dedans quand même : dans cette page, `</body></html>` apparaît AUSSI à l'intérieur de
  // chaînes JavaScript (le cœur fabrique des exports HTML). Un `replace` ordinaire a donc coupé
  // une chaîne en deux, la page est morte sur « Invalid or unexpected token », et mon bloc de
  // glisser-déposer n'a jamais été installé. Le contrôle l'a vu — zone de dépôt absente, deux
  // erreurs de page — parce qu'il lit ce que la page fait, pas ce que la forge croit avoir fait.
  // La page du banc ne finit PAS par `</body></html>` collé : elle finit par `</body>` puis
  // `</html>`, chacun sur sa ligne. Et le motif collé, lui, vit dans une chaîne du panneau (le
  // constructeur de la planche en fabrique un). Le garde-fou a refusé d'écrire, et il avait
  // raison : on cherche donc la vraie fermeture, et on exige qu'elle TERMINE le document.
  const fin = page.lastIndexOf('</body>');
  if (fin < 0) throw new Error('aucun `</body>` dans la page du banc');
  const queue = page.slice(fin).trim();
  if (queue !== '</body>\n</html>' && queue !== '</body></html>') {
    throw new Error('le dernier `</body>` ne termine pas le document : '
      + JSON.stringify(queue.slice(0, 80)));
  }
  page = page.slice(0, fin) + ajout + queue + '\n';

  // ── ET LE SCRIPT AJOUTÉ EST CONTRÔLÉ AVANT D'ÊTRE ÉCRIT ─────────────────────────────────
  // Garde-fou nº 2 de la forge du banc, pour la même raison : un script qui ne compile pas ne
  // doit pas sortir d'ici. On extrait le script de l'ajout et on le passe au compilateur.
  const script = ajout.slice(ajout.indexOf('<script>') + 8, ajout.lastIndexOf('</script>'));
  new (require('node:vm').Script)(script);

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, page);
  return { sortie: SORTIE, octets: page.length, policesRetirees: avant - page.length > 0 };
}

const r = forger();
console.log('Convertisseur autonome écrit :');
console.log('  ' + r.sortie);
console.log('  ' + (r.octets / 1048576).toFixed(2) + ' Mo, un seul fichier, aucun voisin.');
console.log('\nOuverture : double-cliquez le fichier, puis glissez-déposez votre export HTML.');
