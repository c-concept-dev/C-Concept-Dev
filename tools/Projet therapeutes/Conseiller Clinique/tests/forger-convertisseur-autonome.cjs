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

  // ── 2 ter. LES DEUX POLICES, EMBARQUÉES ────────────────────────────────────────────────
  //
  // Sans réseau, aucune des 30 polices du Studio ne charge : mesuré, 0 image sur 19 identique à
  // celles du banc servi. On les embarque donc, en base64, dans le fichier. Licence SIL OFL 1.1
  // pour les deux, licences et provenance dans `vendor/polices/`.
  //
  // IBM Plex Sans est une police VARIABLE : mesuré en la prenant, les quatre graisses demandées
  // renvoient le même octet (deux empreintes pour huit téléchargements). Elle est donc déclarée
  // avec une PLAGE de graisses — quatre déclarations pointant le même fichier donneraient quatre
  // fois la graisse par défaut.
  function police(nom, famille, poids, extra) {
    const b64 = fs.readFileSync(path.join(RACINE, 'vendor', 'polices', nom)).toString('base64');
    return '@font-face{font-family:"' + famille + '";font-style:normal;font-weight:' + poids
      + ';font-display:block;' + (extra || '')
      + 'src:url(data:font/woff2;base64,' + b64 + ') format("woff2");}';
  }
  const styleDesPolices = '<style id="cv-polices">\n'
    + police('IBMPlexSans-variable-latin.woff2', 'IBM Plex Sans', '100 900') + '\n'
    + police('IBMPlexSans-variable-latin-ext.woff2', 'IBM Plex Sans', '100 900') + '\n'
    + police('SourceSerif4-latin-ext.woff2', 'Source Serif 4', '200 900', 'font-stretch:normal;') + '\n'
    + '</style>\n';
  const teteFin = page.indexOf('</head>');
  if (teteFin < 0) throw new Error('aucun `</head>` dans la page du banc');
  page = page.slice(0, teteFin) + styleDesPolices + page.slice(teteFin);

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

  // ── 4. L'ÉCRAN DE CHRISTOPHE : DÉPOSER, CONVERTIR, TÉLÉCHARGER ────────────────────────
  //
  // CE QUE CET ÉCRAN NE FAIT PAS : il ne refait aucun travail. Il n'a ni lecteur d'export, ni
  // rendu, ni écrivain de zip : il CLIQUE ceux du chutier, repliés dans « Réglages avancés ».
  // Un second chemin finirait par lire, rendre ou zipper autrement que le premier — et c'est
  // exactement le genre de divergence que ce projet paie cher.
  //
  // CE QU'IL AJOUTE, et qui n'existait nulle part : un enchaînement. Le rendu démarre au dépôt,
  // avec les réglages par défaut du lot 2 (scène par diapositive, texte tel quel, plancher 2 %,
  // mode capture actif, citations visibles) — ceux du banc, qu'il ne touche pas.
  const ajout = `
<div id="cv-ecran" style="position:fixed;inset:0;z-index:1000000;overflow:auto;background:#f6f2ea;
     color:#273331;font:16px/1.55 'IBM Plex Sans',-apple-system,system-ui,sans-serif;padding:34px 28px 60px;">
  <div style="max-width:980px;margin:0 auto;">
    <h1 style="font-family:'Source Serif 4',Georgia,serif;font-size:34px;font-weight:600;margin:0 0 6px;">
      Images de la présentation</h1>
    <p id="cv-polices-avis" style="color:#8a5a2b;font-size:14px;margin:0 0 20px;"></p>

    <div id="cv-zone" style="border:2.5px dashed #9fb0ab;border-radius:14px;background:#fffdf9;
         padding:34px 24px;text-align:center;cursor:pointer;">
      <div style="font-size:19px;font-weight:600;">Glissez ici l’export de votre présentation
        (fichier .html)</div>
      <div style="color:#5b6b67;font-size:14px;margin-top:8px;">ou cliquez pour le choisir</div>
    </div>
    <div style="margin:10px 0 24px;color:#5b6b67;font-size:14px;">
      <span id="cv-zone-json" style="cursor:pointer;text-decoration:underline;">Déposer aussi le
        document de travail (.json)</span> — pour joindre la narration. Facultatif.
      <span id="cv-narration-etat" style="color:#1f5053;"></span>
    </div>

    <div style="margin:0 0 24px;">
      <div style="font-weight:600;margin-bottom:8px;">Format des images</div>
      <button id="cv-png" type="button" style="font:inherit;padding:10px 20px;border-radius:9px;
        border:2px solid #1f5053;background:#1f5053;color:#fff;cursor:pointer;font-weight:600;">PNG</button>
      <button id="cv-jpeg" type="button" style="font:inherit;padding:10px 20px;border-radius:9px;
        border:2px solid #9fb0ab;background:#fff;color:#273331;cursor:pointer;margin-left:8px;">JPEG</button>
      <div style="color:#5b6b67;font-size:14px;margin-top:8px;">PNG = qualité maximale.
        JPEG = beaucoup plus léger.</div>
    </div>

    <div id="cv-avancement" style="display:none;margin:0 0 20px;">
      <div id="cv-avancement-texte" style="font-weight:600;margin-bottom:7px;">—</div>
      <div style="height:14px;background:#e4ded2;border-radius:7px;overflow:hidden;">
        <div id="cv-barre" style="height:100%;width:0%;background:#1f5053;transition:width .18s;"></div>
      </div>
    </div>

    <p id="cv-message" style="display:none;font-size:15px;border-radius:9px;padding:12px 14px;margin:0 0 20px;"></p>

    <button id="cv-zip" type="button" disabled style="font:inherit;font-size:19px;font-weight:600;
      padding:17px 30px;border-radius:12px;border:0;background:#c9c3b8;color:#fff;cursor:not-allowed;
      width:100%;">Télécharger le zip</button>

    <div id="cv-vignettes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));
         gap:14px;margin-top:26px;"></div>

    <p style="margin-top:34px;font-size:14px;color:#5b6b67;">
      <a id="cv-aide" href="#" style="color:#1f5053;">Aide</a>
      &nbsp;·&nbsp;
      <a id="cv-avances" href="#" style="color:#1f5053;">Réglages avancés</a>
    </p>
    <div id="cv-aide-texte" style="display:none;background:#fffdf9;border:1px solid #c9c3b8;
         border-radius:10px;padding:16px 18px;font-size:14px;color:#3b4a47;margin-top:10px;"></div>
  </div>
</div>
<div id="cv-voile" style="position:fixed;inset:0;z-index:1000001;display:none;align-items:center;
     justify-content:center;background:rgba(39,51,49,.9);color:#f6f2ea;text-align:center;padding:40px;
     font:600 24px/1.4 'IBM Plex Sans',-apple-system,system-ui,sans-serif;">
  Déposez l’export de votre présentation
</div>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var banc = $('banc-chutier');
  var ecran = $('cv-ecran');
  var narrationEnAttente = null;
  var rendu = false;

  // ── LE PANNEAU DU CHUTIER EST REPLIÉ, PAS SUPPRIMÉ ────────────────────────────────────
  // Tout le moteur reste là, et « Réglages avancés » le redonne entier. Il couvre l'écran par
  // construction (position fixe) : on le cache, et on le rend en le remettant au-dessus.
  // ── L'APPLICATION ELLE-MÊME EST RENDUE INVISIBLE ET INERTE, PAR UNE RÈGLE ────────────
  //
  // Trouvé par le contrôle, en deux fois. D'abord mon écran COUVRAIT l'application sans la
  // cacher : ses boutons restaient dans la page et elle travaillait derrière — elle chargeait
  // ses chartes. Puis, en masquant les enfants du corps un par un, deux zones ont survécu :
  // «  Importer une charte » et  » Déposer ou cliquer », que le démarrage de l'application ajoute
  // APRÈS. Une boucle ne voit que ce qui existe à l'instant où elle tourne ; une règle CSS vaut
  // aussi pour ce qui arrive ensuite.
  //
  // CE QUI EST EXEMPTÉ, ET POURQUOI. L'écran, le voile, le panneau du moteur — et
  // « [data-atelier-scene] », la scène hors écran que le moteur attache au corps pour capturer.
  // La masquer donnerait des images blanches : c'est précisément ce qu'on photographie.
  //
  // POURQUOI «  visibility » ET NON  » display ». Le moteur mesure des hauteurs et hérite des
  // styles de la page ; retirer des blocs de la mise en page pourrait déplacer quelque chose
  // sous ses pieds. « visibility » garde la mise en page et rend les éléments invisibles.
  (function masquerLApplication() {
    var sauf = ':not(#cv-ecran):not(#cv-voile):not(#banc-chutier):not([data-atelier-scene])'
      + ':not(script):not(style):not(template)';
    var regle = document.createElement('style');
    regle.id = 'cv-masque';
    regle.textContent = 'body > *' + sauf + ', body > *' + sauf + ' *'
      + '{visibility:hidden !important;pointer-events:none !important;}';
    document.head.appendChild(regle);
  })();

  function avances(ouvrir) {
    banc.style.display = ouvrir ? 'block' : 'none';
    ecran.style.display = ouvrir ? 'none' : 'block';
    if (ouvrir && !$('cv-retour')) {
      var b = document.createElement('button');
      b.id = 'cv-retour';
      b.type = 'button';
      b.textContent = 'Revenir à l’écran simple';
      b.style.cssText = 'font:inherit;padding:8px 16px;margin:0 0 12px;cursor:pointer;'
        + 'border-radius:8px;border:2px solid #1f5053;background:#1f5053;color:#fff;font-weight:600;';
      b.onclick = function () { avances(false); };
      banc.insertBefore(b, banc.firstChild);
    }
  }
  avances(false);
  $('cv-avances').onclick = function (e) { e.preventDefault(); avances(true); };

  // ── L'AIDE : les textes d'explication du banc, repris tels quels ──────────────────────
  var aideFaite = false;
  $('cv-aide').onclick = function (e) {
    e.preventDefault();
    var t = $('cv-aide-texte');
    if (!aideFaite) {
      var morceaux = [];
      var ps = banc.querySelectorAll('p');
      for (var i = 0; i < ps.length && morceaux.length < 4; i++) {
        var texte = (ps[i].textContent || '').trim();
        if (texte.length > 120) morceaux.push('<p>' + texte + '</p>');
      }
      t.innerHTML = morceaux.join('') || '<p>Aucun texte d’explication dans cette version.</p>';
      aideFaite = true;
    }
    t.style.display = (t.style.display === 'none') ? 'block' : 'none';
  };

  // ── LES MESSAGES, EN FRANÇAIS SIMPLE ─────────────────────────────────────────────────
  function dire(texte, couleur) {
    var m = $('cv-message');
    if (!texte) { m.style.display = 'none'; return; }
    m.style.display = 'block';
    m.innerHTML = texte;
    m.style.background = (couleur === 'rouge') ? '#f7e3e0' : (couleur === 'orange' ? '#fdf0e3' : '#e8f1ef');
    m.style.color = (couleur === 'rouge') ? '#8a2f24' : (couleur === 'orange' ? '#8a5a2b' : '#1f5053');
  }

  // L'AVIS SUR LES POLICES : il ne reste que si les polices embarquées ne sont pas là.
  (function () {
    var avis = $('cv-polices-avis');
    var embarquees = !!document.getElementById('cv-polices');
    if (!embarquees) {
      avis.textContent = 'Polices du Studio non chargées : le texte est dans les polices du système.';
      return;
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        var ok = document.fonts.check('600 16px "IBM Plex Sans"')
          && document.fonts.check('600 16px "Source Serif 4"');
        avis.textContent = ok ? '' :
          'Polices du Studio non chargées : le texte est dans les polices du système.';
        window.__policesPretes = ok;
      });
    }
  })();

  // ── LE FORMAT : PNG PAR DÉFAUT ───────────────────────────────────────────────────────
  function choisirFormat(quoi) {
    document.getElementById('bc-format').value = quoi;
    var png = quoi === 'image/png';
    $('cv-png').style.background = png ? '#1f5053' : '#fff';
    $('cv-png').style.color = png ? '#fff' : '#273331';
    $('cv-png').style.borderColor = png ? '#1f5053' : '#9fb0ab';
    $('cv-jpeg').style.background = png ? '#fff' : '#1f5053';
    $('cv-jpeg').style.color = png ? '#273331' : '#fff';
    $('cv-jpeg').style.borderColor = png ? '#9fb0ab' : '#1f5053';
    if (rendu) dire('Le format a changé : déposez de nouveau l’export pour refaire les images, '
      + 'ou ouvrez «  Réglages avancés » et cliquez  » Rendre les images ».', 'orange');
  }
  $('cv-png').onclick = function () { choisirFormat('image/png'); };
  $('cv-jpeg').onclick = function () { choisirFormat('image/jpeg'); };
  choisirFormat('image/png');

  // ── L'AVANCEMENT, LU SUR CE QUE LE BANC AFFICHE ──────────────────────────────────────
  // Le moteur écrit « rendu : image 7 sur 19 » dans son propre état : on le lit, plutôt que
  // d'ouvrir un second compteur qui pourrait dire autre chose.
  var etat = document.getElementById('bc-etat');
  new MutationObserver(function () {
    var t = etat.textContent || '';
    var m = t.match(/rendu : image (\\d+) sur (\\d+)/);
    if (m) {
      $('cv-avancement').style.display = 'block';
      $('cv-avancement-texte').textContent = 'image ' + m[1] + ' sur ' + m[2];
      $('cv-barre').style.width = Math.round(m[1] / m[2] * 100) + '%';
    }
  }).observe(etat, { childList: true, characterData: true, subtree: true });

  // ── LES VIGNETTES (V2) : diapositive, étape et titre, sans clic ──────────────────────
  function peindreVignettes(res) {
    var hote = $('cv-vignettes');
    hote.innerHTML = '';
    res.images.forEach(function (im) {
      var cell = document.createElement('figure');
      cell.style.cssText = 'margin:0;background:#fffdf9;border:1px solid #c9c3b8;border-radius:9px;'
        + 'overflow:hidden;';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(im.blob);
      img.alt = '';
      img.style.cssText = 'display:block;width:100%;height:auto;';
      var cap = document.createElement('figcaption');
      cap.style.cssText = 'font-size:12px;color:#5b6b67;padding:6px 8px;';
      cap.textContent = 'diapositive ' + (im.cardIndex + 1) + ', étape ' + im.rang
        + ' sur ' + im.surRang + (im.titre ? ' — ' + im.titre : '');
      cell.appendChild(img); cell.appendChild(cap);
      hote.appendChild(cell);
    });
  }

  function apresRendu() {
    var d = window.__chutier && window.__chutier.dernier();
    if (!d) return;
    rendu = true;
    peindreVignettes(d.res);
    // LA NARRATION DÉPOSÉE AVANT LE RENDU est jointe maintenant.
    if (narrationEnAttente) joindreNarration(narrationEnAttente);
    var n = d.res.images.length;
    var bouton = $('cv-zip');
    bouton.disabled = false;
    bouton.textContent = 'Télécharger le zip (' + n + ' image' + (n > 1 ? 's' : '') + ')';
    bouton.style.background = '#1f5053';
    bouton.style.cursor = 'pointer';
    $('cv-avancement-texte').textContent = n + ' image' + (n > 1 ? 's' : '') + ' prêtes';
    $('cv-barre').style.width = '100%';
    // L'IMAGE HAUTE, DITE EN FRANÇAIS SIMPLE.
    var cadre = (d.res.sortie && d.res.sortie.hauteur) || 1080;
    var hautes = [];
    d.res.images.forEach(function (im) {
      if (im.hauteur > cadre && hautes.indexOf(im.cardIndex + 1) < 0) hautes.push(im.cardIndex + 1);
    });
    if (hautes.length) {
      dire(hautes.map(function (k) {
        return 'La diapositive ' + k + ' est plus haute que l’écran : ses images défilent dans iMovie.';
      }).join('<br>'), 'orange');
    } else {
      dire('');
    }
  }

  function joindreNarration(doc) {
    var d = window.__chutier && window.__chutier.dernier();
    var liste = (doc && doc.narration) || [];
    if (!liste.length) {
      $('cv-narration-etat').textContent = ' — ce document ne porte aucune narration.';
      return;
    }
    if (!d) { narrationEnAttente = doc; $('cv-narration-etat').textContent =
      ' — narration gardée (' + liste.length + ' étapes), elle sera jointe au zip.'; return; }
    // On attache la narration au document RENDU : le zip la lit là, et rien n'est rendu de neuf.
    d.p.doc.narration = JSON.parse(JSON.stringify(liste));
    narrationEnAttente = null;
    $('cv-narration-etat').textContent = ' — narration jointe (' + liste.length + ' étapes).';
  }

  // ── LE DÉPÔT : UN SEUL CHEMIN, CELUI DU BANC ─────────────────────────────────────────
  function deposer(f) {
    if (!f) return;
    var estJson = /[.]json$/i.test(f.name);
    if (!estJson && !/[.]html?$/i.test(f.name)) {
      dire('Ce fichier n’est pas un export de présentation. Il faut le fichier <strong>.html</strong> '
        + 'exporté par le Studio (son nom finit par « -interactive.html »), ou un document de '
        + 'travail <strong>.json</strong> pour la narration.', 'rouge');
      return;
    }
    if (estJson) {
      var fr = new FileReader();
      fr.onload = function () {
        var doc = null;
        try { doc = JSON.parse(fr.result); } catch (e) { doc = null; }
        if (!doc || !doc.blocks) {
          dire('Ce fichier .json n’est pas un document de travail du Studio.', 'rouge');
          return;
        }
        joindreNarration(doc);
      };
      fr.readAsText(f);
      return;
    }
    // L'EXPORT HTML PASSE PAR L'ENTRÉE DU BANC : même lecture, mêmes refus, mêmes messages.
    dire('');
    $('cv-avancement').style.display = 'block';
    $('cv-avancement-texte').textContent = 'lecture de l’export…';
    $('cv-barre').style.width = '4%';
    var attendu = (etat.textContent || '');
    var dt = new DataTransfer();
    dt.items.add(f);
    var entree = document.getElementById('bc-export');
    entree.files = dt.files;
    entree.dispatchEvent(new Event('change', { bubbles: true }));
    // On attend que le banc ait parlé : soit « Export lu », soit son refus, qu'on reprend.
    var tours = 0;
    (function attendre() {
      var t = etat.textContent || '';
      if (t.indexOf('Export lu') >= 0) {
        $('cv-avancement-texte').textContent = 'rendu des images…';
        document.getElementById('bc-rendre').click();
        var tours2 = 0;
        (function attendreRendu() {
          if (!document.getElementById('bc-zip').disabled) return apresRendu();
          if (++tours2 > 3000) {
            dire('Le rendu n’a pas abouti. Ouvrez « Réglages avancés » pour voir le détail.', 'rouge');
            return;
          }
          setTimeout(attendreRendu, 100);
        })();
        return;
      }
      if (t !== attendu && t.length > 0 && t.indexOf('lecture') < 0) {
        $('cv-avancement').style.display = 'none';
        dire('Ce fichier n’a pas pu être lu comme un export du Studio.<br><span style="font-size:13px;">'
          + t.split('\\n')[0] + '</span>', 'rouge');
        return;
      }
      if (++tours > 600) {
        $('cv-avancement').style.display = 'none';
        dire('Ce fichier n’a pas pu être lu comme un export du Studio.', 'rouge');
        return;
      }
      setTimeout(attendre, 100);
    })();
  }

  // ── LE ZIP : LE BOUTON DU BANC, CLIQUÉ ───────────────────────────────────────────────
  $('cv-zip').onclick = function () {
    if (this.disabled) return;
    var avant = etat.textContent || '';
    document.getElementById('bc-zip').click();
    var tours = 0;
    (function attendre() {
      var t = etat.textContent || '';
      if (/zip écrit/i.test(t)) {
        dire('Zip téléchargé. Regardez dans votre dossier Téléchargements.', 'vert');
        return;
      }
      if (/ABANDONN/i.test(t)) {
        // X4 : rien n'est téléchargé, et on le dit sans adoucir.
        dire('<strong>Le zip n’a pas été écrit</strong>, et rien n’a été téléchargé : une image '
          + 'manque.<br><span style="font-size:13px;">' + t.split('\\n').pop() + '</span>', 'rouge');
        return;
      }
      if (++tours > 3000) return;
      setTimeout(attendre, 100);
    })();
  };

  // ── LE GLISSER-DÉPOSER ET LES DEUX ZONES CLIQUABLES ──────────────────────────────────
  var voile = $('cv-voile');
  var compte = 0;
  function montrer(oui) { voile.style.display = oui ? 'flex' : 'none'; }
  window.addEventListener('dragenter', function (e) { e.preventDefault(); compte++; montrer(true); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function (e) { e.preventDefault(); compte--; if (compte <= 0) montrer(false); });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); compte = 0; montrer(false);
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    deposer(f);
  });
  function choisir(accept) {
    var i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = function () { deposer(i.files && i.files[0]); };
    i.click();
  }
  $('cv-zone').onclick = function () { choisir('.html,.htm,text/html'); };
  $('cv-zone-json').onclick = function () { choisir('.json,application/json'); };
})();
</script>
`;

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
