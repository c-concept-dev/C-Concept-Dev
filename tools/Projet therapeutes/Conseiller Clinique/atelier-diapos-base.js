(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var dernier = null;
  var dernieresPolices = { regles: 0, familles: [] };
  window.__chutier = {
    dernier: function () { return dernier; },
    polices: function () { return { regles: dernieresPolices.regles, familles: dernieresPolices.familles.slice() }; }
  };

  function message(texte, erreur) {
    var el = $('cv-message');
    el.hidden = false;
    el.classList.toggle('erreur', !!erreur);
    el.textContent = texte;
  }
  function extraireObjet(source, nom) {
    var depart = source.indexOf(nom);
    if (depart === -1) return null;
    var i = source.indexOf('{', depart);
    if (i === -1) return null;
    var profondeur = 0, dansChaine = null, echap = String.fromCharCode(92);
    for (var j = i; j < source.length; j++) {
      var c = source[j];
      if (dansChaine) {
        if (c === echap) { j++; continue; }
        if (c === dansChaine) dansChaine = null;
        continue;
      }
      if (c === '"' || c === "'") { dansChaine = c; continue; }
      if (c === '{') profondeur++;
      else if (c === '}') { profondeur--; if (profondeur === 0) return source.slice(i, j + 1); }
    }
    return null;
  }
  function verifier(doc) {
    if (!doc || doc.documentKind !== 'presentation' || !Array.isArray(doc.blocks)) {
      throw new Error('Ce fichier ne contient pas une présentation valide.');
    }
    return doc;
  }
  // Un export interactif Studio Clinique autonome embarque ses polices en WOFF/WOFF2 dans des
  // règles @font-face. Trame ne peut pas se contenter d'importer ADOC_EXPORT_DOC : le document
  // continue alors de demander « Pompiere » ou « Montserrat », mais aucune fonte de ce nom
  // n'existe dans la page de Trame et Safari affiche une police de secours. Les tailles et les
  // retours à la ligne changent avec elle.
  //
  // On ne reprend JAMAIS la feuille CSS de l'export : elle pourrait modifier l'interface de
  // Trame. Seules les règles @font-face dont la source est une donnée de police embarquée en
  // base64 sont admises. Les URL réseau et tout autre CSS sont écartés.
  function extrairePolicesEmbarquees(source) {
    var candidates = String(source || '').match(/@font-face\s*\{[^{}]*\}/gi) || [];
    var autorisees = [], familles = [];
    candidates.forEach(function (regle) {
      var sourceData = regle.match(/src\s*:\s*url\(\s*(['"]?)data:((?:font|application)\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)\1\s*\)/i);
      var famille = regle.match(/font-family\s*:\s*(['"])([^'"{};]+)\1\s*;?/i);
      if (!sourceData || !famille) return;
      // Une charge utile base64 vide ou manifestement tronquée n'est pas une police.
      if (sourceData[3].replace(/\s/g, '').length < 64) return;
      autorisees.push(regle);
      if (familles.indexOf(famille[2]) === -1) familles.push(famille[2]);
    });
    return { css: autorisees.join('\n'), regles: autorisees.length, familles: familles };
  }
  function installerPolicesEmbarquees(polices) {
    var ancien = document.getElementById('atelier-polices-importees');
    if (ancien) ancien.remove();
    dernieresPolices = { regles: 0, familles: [] };
    if (!polices || !polices.css) return dernieresPolices;
    var style = document.createElement('style');
    style.id = 'atelier-polices-importees';
    style.setAttribute('data-source', 'export-studio-clinique');
    style.textContent = polices.css;
    document.head.appendChild(style);
    dernieresPolices = { regles: polices.regles, familles: polices.familles.slice() };
    return dernieresPolices;
  }
  function lireFichier(fichier) {
    return fichier.text().then(function (texte) {
      var doc, images = {}, polices = { css: '', regles: 0, familles: [] };
      if (/\.json$/i.test(fichier.name) || fichier.type === 'application/json') {
        var brut = JSON.parse(texte);
        doc = brut.clinicalDocument || brut;
      } else {
        var brutDoc = extraireObjet(texte, 'window.ADOC_EXPORT_DOC');
        if (!brutDoc) throw new Error('Ce fichier n’est pas un export de présentation. Choisissez le fichier « -interactive.html » ou un document de travail JSON.');
        doc = JSON.parse(brutDoc);
        var brutImages = extraireObjet(texte, 'window.ADOC_EXPORT_IMAGES');
        if (brutImages) images = JSON.parse(brutImages);
        polices = extrairePolicesEmbarquees(texte);
      }
      verifier(doc);
      installerPolicesEmbarquees(polices);
      window.ADOC_EXPORT_DOC = doc;
      window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {}, images);
      return { doc: doc, nom: fichier.name, images: Object.keys(images).length,
               polices: polices.regles, famillesPolices: polices.familles };
    });
  }
  async function rendre(presentation) {
    if (!window.AtelierImages) throw new Error('Le moteur d’images n’est pas disponible.');
    $('cv-avancement').hidden = false;
    $('cv-barre').style.width = '0%';
    $('cv-avancement-texte').textContent = 'Préparation des images…';
    // Le canevas fixe du lecteur Studio Clinique est la référence visuelle. Le mode « video »
    // du moteur choisit au contraire une scène différente pour chaque diapositive afin de
    // grossir le texte : utile comme option de lisibilité, mais ce n'est pas le même cadrage.
    // Le sélecteur pilotait jusqu'ici seulement un drapeau inutilisé (`formatImovie`) ; il doit
    // transmettre explicitement le mode au moteur pour que « fidèle » signifie réellement
    // mêmes proportions, mêmes marges et mêmes positions que la présentation source.
    var cadrage = $('cv-cadrage').value;
    var res = await window.AtelierImages.rendreImages(presentation.doc, {
      modeCapture: true,
      mode: cadrage === 'video' ? 'video' : 'fidele',
      masquerCitations: false,
      type: 'image/jpeg',
      qualite: 0.92,
      surAvancement: function (avancement, ancienTotal) {
        var fait = typeof avancement === 'object' ? avancement.fait : avancement;
        var total = typeof avancement === 'object' ? avancement.total : ancienTotal;
        $('cv-avancement-texte').textContent = 'Images : ' + fait + ' sur ' + total;
        $('cv-barre').style.width = Math.round(fait / Math.max(1, total) * 100) + '%';
      }
    });
    dernier = { p: presentation, res: res };
    $('cv-vignettes').textContent = '';
    res.images.forEach(function (im) {
      var figure = document.createElement('figure');
      var img = document.createElement('img');
      img.src = URL.createObjectURL(im.blob);
      img.alt = im.titre + ', étape ' + im.rang;
      var cap = document.createElement('figcaption');
      cap.textContent = im.titre + ' · étape ' + im.rang + '/' + im.surRang;
      figure.append(img, cap); $('cv-vignettes').appendChild(figure);
    });
    $('cv-zip').disabled = false;
    $('cv-mp4').disabled = false;
    $('cv-avancement-texte').textContent = res.images.length + ' images prêtes en 1920 × 1080.';
    var infoPolices = presentation.polices
      ? ' — ' + presentation.polices + ' variante' + (presentation.polices > 1 ? 's' : '')
        + ' de police embarquée' + (presentation.polices > 1 ? 's' : '')
        + (presentation.famillesPolices.length ? ' (' + presentation.famillesPolices.join(', ') + ')' : '')
      : '';
    message('Présentation chargée : ' + presentation.nom + ' — ' + res.images.length + ' images' + infoPolices + '.');
  }
  async function importer(fichiers) {
    var fichier = Array.from(fichiers || []).find(function (f) { return /\.(html?|json)$/i.test(f.name); });
    if (!fichier) { message('Déposez un export « -interactive.html » ou un document de travail JSON.', true); return; }
    try { await rendre(await lireFichier(fichier)); }
    catch (err) { message(err && err.message || String(err), true); }
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  var input = $('cv-fichier');
  $('cv-importer').onclick = function () { input.click(); };
  input.onchange = function () { importer(input.files); input.value = ''; };
  ['dragenter', 'dragover'].forEach(function (type) {
    $('cv-zone').addEventListener(type, function (e) { e.preventDefault(); $('cv-zone').classList.add('survol'); });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    $('cv-zone').addEventListener(type, function (e) { e.preventDefault(); $('cv-zone').classList.remove('survol'); });
  });
  $('cv-zone').addEventListener('drop', function (e) { importer(e.dataTransfer.files); });
  $('cv-zip').onclick = async function () {
    if (!dernier || !window.AtelierZip) return;
    this.disabled = true;
    try {
      var fichiers = [];
      for (var i = 0; i < dernier.res.images.length; i++) {
        var im = dernier.res.images[i];
        var blob = await window.AtelierImages.versType(im, 'image/jpeg', 0.92);
        fichiers.push({ nom: window.AtelierImages.nomFichier(im, 'jpg'), blob: blob });
      }
      telecharger(await window.AtelierZip.creer(fichiers), 'atelier-diapos-1920x1080.zip');
    } catch (err) { message('Export ZIP impossible : ' + (err && err.message || err), true); }
    this.disabled = false;
  };
})();
