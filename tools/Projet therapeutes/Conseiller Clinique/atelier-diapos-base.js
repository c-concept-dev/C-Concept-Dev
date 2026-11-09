(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var dernier = null;
  window.__chutier = { dernier: function () { return dernier; } };

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
  function lireFichier(fichier) {
    return fichier.text().then(function (texte) {
      var doc, images = {};
      if (/\.json$/i.test(fichier.name) || fichier.type === 'application/json') {
        var brut = JSON.parse(texte);
        doc = brut.clinicalDocument || brut;
      } else {
        var brutDoc = extraireObjet(texte, 'window.ADOC_EXPORT_DOC');
        if (!brutDoc) throw new Error('Ce fichier n’est pas un export de présentation. Choisissez le fichier « -interactive.html » ou un document de travail JSON.');
        doc = JSON.parse(brutDoc);
        var brutImages = extraireObjet(texte, 'window.ADOC_EXPORT_IMAGES');
        if (brutImages) images = JSON.parse(brutImages);
      }
      verifier(doc);
      window.ADOC_EXPORT_DOC = doc;
      window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {}, images);
      return { doc: doc, nom: fichier.name, images: Object.keys(images).length };
    });
  }
  async function rendre(presentation) {
    if (!window.AtelierImages) throw new Error('Le moteur d’images n’est pas disponible.');
    $('cv-avancement').hidden = false;
    $('cv-barre').style.width = '0%';
    $('cv-avancement-texte').textContent = 'Préparation des images…';
    var res = await window.AtelierImages.rendreImages(presentation.doc, {
      modeCapture: true,
      masquerCitations: false,
      type: 'image/jpeg',
      qualite: 0.92,
      formatImovie: $('cv-cadrage').value === 'imovie',
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
    message('Présentation chargée : ' + presentation.nom + ' — ' + res.images.length + ' images.');
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
