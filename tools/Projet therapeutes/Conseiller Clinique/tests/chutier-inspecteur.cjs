// L'INSPECTEUR DE SCÈNE — une seule implémentation, partagée par tous les outils de mesure.
//
// Il est appelé par le crochet `inspecter` du moteur, avec la scène VIVANTE juste avant que
// SnapDOM ne la rastérise. Il est écrit comme une fonction autonome parce qu'il est sérialisé
// puis évalué dans la page : il ne peut rien capturer de la portée de Node.
//
// Il mesure le RENDU, jamais le balisage. La nuance a déjà trompé une mesure : le texte d'un
// bouton d'option contient « Jamais(+0) » dans le DOM, alors que le barème est en display:none
// et n'apparaît pas à l'image. innerText voit ce que l'œil voit ; textContent, non.
module.exports.INSPECTEUR = function (inner, etape, scene) {
  var L = scene.largeur, H = scene.hauteur;
  var ECHELLE = 1920 / L;
  var carte = inner.querySelector('.adoc-sc-card');
  var rc = carte ? carte.getBoundingClientRect() : null;
  var sc = carte ? getComputedStyle(carte) : null;
  var visible = function (el) {
    var s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  var blocs = Array.prototype.slice.call(inner.querySelectorAll('.adoc-sc-card > .adoc-sc-block'))
    .filter(function (el) { return getComputedStyle(el).visibility !== 'hidden'; });

  // Encre : union des rectangles de ce qui est réellement visible dans les blocs montrés.
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  var origine = inner.getBoundingClientRect();
  var marque = function (el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    x0 = Math.min(x0, r.left - origine.left); y0 = Math.min(y0, r.top - origine.top);
    x1 = Math.max(x1, r.right - origine.left); y1 = Math.max(y1, r.bottom - origine.top);
  };
  blocs.forEach(function (b) { marque(b); Array.prototype.forEach.call(b.querySelectorAll('img'), marque); });

  // Tailles de texte — sur les éléments qui portent VRAIMENT du texte rendu, pas sur leur
  // conteneur : un bloc dont le texte est dans un <span> donnerait sinon la taille du bloc.
  var tailles = [];
  blocs.forEach(function (b) {
    var porteurs = b.matches('p, span, h1, h2, h3, li') ? [b]
      : Array.prototype.slice.call(b.querySelectorAll('p, span.adoc-sc-block-text, h1, h2, h3, li'));
    (porteurs.length ? porteurs : [b]).forEach(function (el) {
      if (!visible(el)) return;
      if (!(el.innerText || '').trim()) return;
      var t = parseFloat(getComputedStyle(el).fontSize);
      if (!t) return;
      tailles.push({ balise: el.tagName.toLowerCase(), scene: +t.toFixed(1),
                     sortie: +(t * ECHELLE).toFixed(1), pc_hauteur: +((t * ECHELLE / 1080) * 100).toFixed(2) });
    });
  });

  // Trois familles d'éléments que Christophe a vues sur ses propres images, et qu'il faut pouvoir
  // compter séparément : la puce « Approfondir », les appels de citation, et la ligne « Sources ».
  var compter = function (sel) {
    var tous = Array.prototype.slice.call(inner.querySelectorAll(sel));
    return { total: tous.length, visibles: tous.filter(visible).length };
  };
  var puces = compter('.adoc-sc-deepdive-chip');
  var appelsCitation = compter('.adoc-sc-cite');
  var lignesSources = compter('.adoc-sc-cite-note');

  // La loupe d'agrandissement : visible ou non. C'est elle que l'œil voit, pas l'attribut.
  var badges = Array.prototype.slice.call(inner.querySelectorAll('.adoc-sc-image-zoom-badge'));
  var badgesVisibles = badges.filter(visible).length;

  // Deux comptes distincts, parce qu'ils ne disent pas la même chose : ce qui est CLIQUABLE dans
  // le DOM, et ce qui RESSEMBLE à un bouton à l'image. Seul le second se voit sur une vidéo.
  var cliquables = Array.prototype.slice.call(inner.querySelectorAll('button, [role="button"], a[href], [onclick]'))
    .filter(visible);
  var fondCarte = sc ? sc.backgroundColor : '';
  var habillesEnBouton = cliquables.filter(function (el) {
    var s = getComputedStyle(el);
    var bordure = parseFloat(s.borderTopWidth) || 0;
    var fond = s.backgroundColor;
    var fondVisible = fond && fond !== 'rgba(0, 0, 0, 0)' && fond !== 'transparent' && fond !== fondCarte;
    var ombre = s.boxShadow && s.boxShadow !== 'none';
    return bordure > 0 || fondVisible || ombre;
  }).map(function (el) {
    var s = getComputedStyle(el);
    return { balise: el.tagName.toLowerCase(), classe: (el.className || '').toString().split(' ')[0] || null,
             texte: (el.innerText || '').trim().slice(0, 28) || null,
             bordure: s.borderTopWidth, fond: s.backgroundColor };
  });

  return {
    carte: rc ? { l: Math.round(rc.width), h: Math.round(rc.height), bordure: sc.borderTopWidth,
                  rayon: sc.borderTopLeftRadius, ombre: sc.boxShadow === 'none' ? 'aucune' : sc.boxShadow,
                  fond: sc.backgroundColor } : null,
    encre: isFinite(x0) ? {
      x: Math.round(x0), y: Math.round(y0), l: Math.round(x1 - x0), h: Math.round(y1 - y0),
      part_hauteur: +(((y1 - y0) / H) * 100).toFixed(1),
      part_surface: +((((x1 - x0) * (y1 - y0)) / (L * H)) * 100).toFixed(1),
    } : null,
    tailles: tailles,
    badges_loupe: { total: badges.length, visibles: badgesVisibles },
    puces_approfondir: puces, appels_citation: appelsCitation, lignes_sources: lignesSources,
    cliquables: cliquables.length,
    habilles_en_bouton: habillesEnBouton,
    // 400 caractères et non 60 : un questionnaire porte ses quatre libellés de réponse bien
    // après son intitulé, et une coupe à 60 faisait échouer un contrôle sur du texte qui était
    // pourtant là — la mesure était tronquée, pas le rendu.
    textes_rendus: blocs.filter(visible).map(function (b) { return (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 400); }),
  };
};
