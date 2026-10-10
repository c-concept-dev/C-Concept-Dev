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
  <p class="note" style="color:#667;font-size:13px;margin:0 0 10px;max-width:78ch;">
    <strong>Pour mesurer sur une de vos vraies présentations</strong> : cette page EST l'application.
    Réduisez le panneau, ouvrez votre présentation comme d'habitude, rouvrez le panneau, puis
    cliquez « Utiliser la présentation ouverte ». Rien n'est exporté, rien n'est écrit sur le
    disque, rien n'entre au dépôt — le document est lu en mémoire. Vous pouvez aussi charger un
    fichier JSON déjà en votre possession.
  </p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
    <select id="bc-presentation" style="font:inherit;padding:5px 8px;max-width:30em;"></select>
    <label style="font-size:13px;"><input type="checkbox" id="bc-mode-capture" checked> mode capture</label>
    <label style="font-size:13px;"><strong>réglage</strong>
      <select id="bc-reglage" style="font:inherit;padding:4px 6px;">
        <option value="auto" selected>SCÈNE PAR DIAPOSITIVE — texte tel quel</option>
        <option value="a">scène fixe 1422x800, typo x1</option>
        <option value="b">scène fixe 960x540, typo x1</option>
        <option value="c">scène fixe 1422x800, typo x1,6</option>
        <option value="d">scène fixe 960x540, typo x1,4 (ancien mode vidéo)</option>
      </select></label>
    <label style="font-size:13px;" id="bc-plancher-label">plancher de lisibilité
      <input type="number" id="bc-plancher" min="1" max="6" step="0.1" value="2"
             style="font:inherit;width:4.5em;padding:4px 6px;"> % de la hauteur</label>
    <label style="font-size:13px;">format
      <select id="bc-format" style="font:inherit;padding:4px 6px;">
        <option value="image/png">PNG</option>
        <option value="image/jpeg">JPEG 0,92</option>
      </select></label>
    <label style="font-size:13px;"><input type="checkbox" id="bc-sans-citations"> masquer citations et sources</label>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
    <button id="bc-rendre" style="font:inherit;padding:6px 12px;cursor:pointer;">Rendre les images</button>
    <button id="bc-tout" style="font:inherit;padding:6px 12px;cursor:pointer;">Rendre les trois</button>
    <button id="bc-jpeg" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Télécharger en JPEG haute qualité</button>
    <button id="bc-planche" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Planche à l’œil (un fichier)</button>
    <button id="bc-perime" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Modifier un texte et revérifier</button>
    <button id="bc-ouverte" style="font:inherit;padding:6px 12px;cursor:pointer;">Utiliser la présentation ouverte</button>
    <label style="font:inherit;padding:6px 12px;border:1px solid #888;border-radius:6px;cursor:pointer;">Charger un JSON
      <input type="file" id="bc-fichier" accept="application/json,.json" hidden></label>
    <label style="font:inherit;padding:6px 12px;border:1px solid #888;border-radius:6px;cursor:pointer;">Charger un export HTML
      <input type="file" id="bc-export" accept="text/html,.html,.htm" hidden></label>
    <button id="bc-atelier" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Ouvrir dans l’espace de travail</button>
    <button id="bc-telecharger" style="font:inherit;padding:6px 12px;cursor:pointer;" disabled>Télécharger le document de travail</button>
    <button id="bc-reduire" style="font:inherit;padding:6px 12px;cursor:pointer;">Réduire le panneau</button>
  </div>
  <div id="bc-etat" style="font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;min-height:3em;"></div>
  <div style="margin:10px 0;">
    <strong style="font-size:13px;">Relevé à renvoyer</strong>
    <button id="bc-copier" style="font:inherit;padding:4px 10px;margin-left:8px;cursor:pointer;" disabled>Copier</button>
    <p style="color:#667;font-size:12px;margin:4px 0;">Tout ce qui se mesure est déjà rempli. Les trois
      dernières lignes demandent votre œil : remplacez « ? » par oui ou non.</p>
    <pre id="bc-releve" style="font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#fffdf9;border:1px solid #c9c3b8;padding:10px;white-space:pre-wrap;margin:0;">—</pre>
  </div>
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
    var res = await window.AtelierImages.rendreImages(p.doc, Object.assign(reglages(), {
      surAvancement: function (a) { dire('rendu : image ' + a.fait + ' sur ' + a.total + '  (' + a.stepId + ')'); },
    }));
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
    // « par défaut » ne veut pas dire « celle du lecteur » : le défaut EST le mode vidéo, dont la
    // scène fait 960x540. L'ancien libellé annonçait « celle du lecteur » devant 960x540, ce qui
    // était faux et aurait pu entretenir exactement la confusion qu'on vient de corriger.
    if (res.scene_par_diapositive) {
      var sc = Object.keys(res.scenes_par_carte).map(function (k) {
        return res.scenes_par_carte[k]; });
      ligne('scène', 'UNE PAR DIAPOSITIVE — ' + sc.length + ' choisie(s), de '
        + Math.min.apply(null, sc.map(function (x) { return x.scene.largeur; })) + ' à '
        + Math.max.apply(null, sc.map(function (x) { return x.scene.largeur; }))
        + ' px de large  puis  ' + res.sortie.largeur + 'x' + res.sortie.hauteur);
      ligne('plancher de lisibilité', res.plancher_lisibilite_pc + ' % de la hauteur du cadre');
      sc.forEach(function (x, i) {
        // « CORPS DE TEXTE », et non « texte » : la colonne a dit « texte » pour une valeur qui
        // mesurait le TITRE du bloc, soit 1,5 fois trop. Elle nomme maintenant la taille en
        // pixels dont le pourcentage découle, et le plus petit texte de lecture quand il est
        // plus petit que le corps — un encadré descend à 14 px.
        ligne('  diapositive ' + (i + 1), x.scene.largeur + 'x' + x.scene.hauteur
          + '  —  corps ' + x.taille_px + ' px, soit ' + x.texte_pc + ' % de la hauteur du cadre'
          + (x.plus_petit_px && x.plus_petit_px < x.taille_px
             ? '  (plus petit texte ' + x.plus_petit_px + ' px, soit ' + x.plus_petit_pc + ' %'
               + (x.plus_petit_pc < x.plancher_pc ? ' — SOUS LE PLANCHER' : '') + ')' : '')
          + (x.sans_texte_courant ? '  (aucun texte courant : mesuré sur les titres)' : '')
          + '  —  ' + x.essais.length + ' essai(s)  —  '
          + (x.deborde ? 'DÉBORDE : ' : '') + x.raison);
      });
    } else {
      var estLecteur = res.scene.largeur === window.AtelierImages.SCENE.largeur
        && res.scene.hauteur === window.AtelierImages.SCENE.hauteur;
      ligne('scène puis sortie', res.scene.largeur + 'x' + res.scene.hauteur
        + (estLecteur ? ' (celle du lecteur)' : ' (fixe)')
        + ', IMPOSÉE  puis  ' + res.sortie.largeur + 'x' + res.sortie.hauteur);
    }
    ligne('échelle typographique', res.echelle_typo === 1 ? 'aucune' : 'x' + String(res.echelle_typo).replace('.', ','));
    ligne('réglage demandé', $('bc-reglage').options[$('bc-reglage').selectedIndex].textContent);
    ligne('format', res.images.length ? res.images[0].type + (res.images[0].type === 'image/jpeg' ? ' qualité 0,92' : '') : '—');
    ligne('citations et sources', res.citations_masquees ? 'MASQUÉES dans l’image' : 'visibles (défaut)');
    ligne('sources référencées', res.sources.utilisees + ' sur ' + res.sources.declarees + ' déclarées'
      + (res.sources.jamais_appelees.length ? '  —  ' + res.sources.jamais_appelees.length + ' jamais appelée(s)' : ''));
    ligne('débordements', res.debordements.aucun + ' sans, ' + res.debordements.defilement
      + ' à faire défiler, ' + res.debordements.scission + ' à scinder'
      + '   (tolérance ' + res.tolerance_debordement + ', seuil de scission ' + res.seuil_scission + ')');
    var debordants = res.images.filter(function (im) { return im.debordement; });
    debordants.forEach(function (im) {
      ligne('  ' + im.titre + ', étape ' + im.rang + '/' + im.surRang,
        'déborde de ' + im.debordement_px + ' px de scène (' + im.debordement_px_sortie + ' px à l’image)'
        + '  —  rapport ' + im.debordement_rapport + '  —  ' + im.debordement_verdict.toUpperCase()
        + ' (règle : ' + im.debordement_regle + ')');
    });
    // LE TRAVELLING, AVEC SES NOMBRES. Une diapositive qui déborde est livrée entière ; ce qui
    // décide si elle peut défiler, c'est la durée de son commentaire, et cette durée vient de la
    // narration. Sans narration, la page le DIT au lieu d'inventer une vitesse.
    var trav = res.travellings || { nombre: 0 };
    ligne('travellings', trav.nombre === 0 ? 'aucun — toutes les images tiennent dans le cadre'
      : trav.nombre + ' image(s) à faire défiler : ' + trav.tenables + ' tenable(s), '
        + trav.a_scinder.length + ' à scinder, ' + trav.sans_duree + ' sans durée connue'
        + (trav.sans_course ? '   —   ' + trav.sans_course + ' étape(s) débordent sans rien avoir '
           + 'à faire défiler : elles ne montrent que le haut de leur diapositive' : '')
        + '   (pose ' + String(res.pose_travelling_s).replace('.', ',') + ' s aux deux bouts, '
        + 'borne ' + res.vitesse_pan_max + ' px/s)');
    res.images.filter(function (im) { return im.travelling; }).forEach(function (im) {
      ligne('  ' + im.titre + ', étape ' + im.rang + '/' + im.surRang,
        im.travelling.course_px + ' px de course sur une image de ' + im.hauteur + ' px  —  '
        + (im.travelling.tenable === null ? 'DURÉE INCONNUE'
           : im.travelling.tenable ? im.travelling.vitesse_px_par_s + ' px/s en '
             + String(im.travelling.duree_utile_s).replace('.', ',') + ' s utiles sur '
             + String(im.travelling.duree_s).replace('.', ',') + ' s de commentaire'
           : 'À SCINDER')
        + '  —  ' + im.travelling.raison);
    });
    // HAUTEUR DU CONTENU CONTRE HAUTEUR D’IMAGE. C’est l’écart entre les deux qui a coupé le
    // dernier bloc de chaque diapositive, sans un mot, le 7 octobre. Il a maintenant sa ligne.
    var coupees = res.images.filter(function (im) { return im.coupe_px > 0; });
    var grandies = res.images.filter(function (im) {
      return im.hauteur_avant_stabilisation < im.hauteur_contenu; });
    ligne('contenu et image', coupees.length
      ? coupees.length + ' IMAGE(S) PLUS COURTE(S) QUE LEUR CONTENU — à signaler'
      : 'aucune image plus courte que son contenu (' + res.images.length + ' étapes vérifiées)');
    if (grandies.length) {
      ligne('hauteurs stabilisées', grandies.length + ' étape(s) dont le contenu a grandi quand la'
        + ' scène a été agrandie — par exemple ' + grandies[0].hauteur_avant_stabilisation + ' px'
        + ' puis ' + grandies[0].hauteur_contenu + ' px en ' + grandies[0].tours_stabilisation
        + ' redimensionnement(s). Sans la stabilisation, ces images seraient coupées.');
    }
    res.images.forEach(function (im) {
      ligne('  ' + im.titre + ', étape ' + im.rang + '/' + im.surRang + ' — hauteurs',
        'contenu ' + im.hauteur_contenu + ' px, image ' + im.hauteur_capture + ' px de scène ('
        + im.hauteur + ' px de sortie)'
        + (im.coupe_px > 0 ? '  —  ÉCART : ' + im.coupe_px + ' px COUPÉS'
           : im.depassement_px > 0
             ? '  —  ' + im.depassement_px + ' px de dépassement, dans la zone morte de '
               + im.zone_morte_px + ' px : rien de coupé'
             : '  —  rien de coupé'));
    });

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
        + '  —  contenu ' + im.hauteur_contenu + ' px / image ' + im.hauteur_capture + ' px'
        + (im.coupe_px > 0 ? '  —  ÉCART ' + im.coupe_px + ' px COUPÉS' : '')
        + (im.coupe_px === 0 && im.depassement_px > 0
            ? ' (' + im.depassement_px + ' px dans la zone morte)' : '')
        + '  —  ' + Math.round(im.octets / 1024) + ' Ko  —  ' + im.signature
        + '\\n' + im.titre;
      cap.style.whiteSpace = 'pre-line';
      cell.appendChild(img); cell.appendChild(cap);
      $('bc-vignettes').appendChild(cell);
    }
    // Le relevé, dans la forme exacte que Christophe a demandée. Ce qui se mesure est rempli ;
    // ce qui se juge reste un « ? » — remplir une appréciation à sa place serait inventer.
    var deb = res.images.filter(function (im) { return im.debordement; });
    var lignes = [
      'Rendu en ' + $('bc-reglage').value + ' : étapes rendues ' + res.images.length + '/' + res.etapes_annoncees,
      'étapes qui débordent ' + deb.length + (deb.length ? ' :' : ''),
    ];
    deb.forEach(function (im) {
      lignes.push('  · diapositive ' + (im.cardIndex + 1) + ' (' + im.titre + '), étape '
        + im.rang + '/' + im.surRang + ', rapport ' + im.debordement_rapport
        + ', ' + im.debordement_verdict + ' — déborde de ' + im.debordement_px_sortie + ' px à l\u2019image');
    });
    lignes.push('temps ' + (murs / 1000).toFixed(1) + ' s (' + Math.round(murs / res.images.length) + ' ms par image)');
    lignes.push('poids ' + mo(res.octets_total) + ' (' + Math.round(res.octets_total / res.images.length / 1024)
      + ' Ko par image, ' + (res.images[0] ? res.images[0].type : '—') + ')');
    var coupe = res.images.filter(function (im) { return im.coupe_px > 0; });
    lignes.push('hauteurs : ' + (coupe.length
      ? 'ÉCART sur ' + coupe.length + ' étape(s) — ' + coupe.map(function (im) {
          return 'diapositive ' + (im.cardIndex + 1) + ' étape ' + im.rang + ' : contenu '
            + im.hauteur_contenu + ' px, image ' + im.hauteur_capture + ' px, '
            + im.coupe_px + ' px coupés'; }).join(' ; ')
      : 'aucune image plus courte que son contenu (' + res.images.length + ' étapes)'));
    var depasse = res.images.filter(function (im) { return im.coupe_px === 0 && im.depassement_px > 0; });
    if (depasse.length) {
      lignes.push('  dont ' + depasse.length + ' étape(s) qui dépassent de quelques pixels'
        + ' (jusqu\u2019à ' + Math.max.apply(null, depasse.map(function (im) { return im.depassement_px; }))
        + ' px) sans rien couper : c\u2019est la zone morte de la mise en page');
    }
    var grandi = res.images.filter(function (im) {
      return im.hauteur_avant_stabilisation < im.hauteur_contenu; });
    if (grandi.length) {
      lignes.push('  dont ' + grandi.length + ' étape(s) stabilisée(s) après agrandissement de la'
        + ' scène (ex. ' + grandi[0].hauteur_avant_stabilisation + ' px puis '
        + grandi[0].hauteur_contenu + ' px)');
    }
    lignes.push('texte lisible : ?');
    lignes.push('');
    lignes.push('JPEG 0,92 : gêne visible sur le texte : ?   ;   sur les photos : ?');
    lignes.push('Citations et sources : masquer : ?');
    lignes.push('');
    lignes.push('— mesuré avec ' + res.scene.largeur + 'x' + res.scene.hauteur + ', typo x'
      + String(res.echelle_typo).replace('.', ',') + ', citations '
      + (res.citations_masquees ? 'masquées' : 'visibles')
      + ', seuil de scission ' + res.seuil_scission);
    $('bc-releve').textContent = lignes.join('\\n');
    $('bc-copier').disabled = false;
    dernier = { p: p, res: res };
    $('bc-jpeg').disabled = false;
    $('bc-planche').disabled = false;
    $('bc-perime').disabled = false;
    return res;
  }

  // LE RÉGLAGE (d) NE RÉPÈTE RIEN : il n'envoie AUCUNE option de scène ni de typographie, et
  // laisse donc le moteur appliquer son propre défaut. C'est précisément ce qui manquait : les
  // deux listes précédentes envoyaient « scène du lecteur » et « typo x1 » de façon EXPLICITE,
  // ce qui écrasait le mode vidéo du moteur sans que rien ne le dise. La page annonçait (d) et
  // rendait (a). Un réglage qui redit le défaut finit toujours par en diverger.
  // LES RÉGLAGES DE LA PAGE SONT CEUX DU MOTEUR, pas une liste parallèle. « auto » est le
  // défaut du moteur : scène par diapositive, texte tel quel. Les quatre scènes fixes restent
  // atteignables pour comparer, et elles disent qu'elles sont fixes — le 7 octobre, la page
  // annonçait (d) et rendait (a) parce qu'elle envoyait ses propres valeurs par-dessus.
  var REGLAGES = {
    auto: {},
    a: { mode: 'fidele' },
    b: { mode: 'fidele', scene: { largeur: 960, hauteur: 540 } },
    c: { mode: 'fidele', echelleTypo: 1.6 },
    d: { mode: 'fidele', scene: { largeur: 960, hauteur: 540 }, echelleTypo: 1.4 },
  };
  function reglages() {
    var cle = $('bc-reglage').value;
    var choisi = REGLAGES[cle] || REGLAGES.auto;
    var plancher = Number($('bc-plancher').value);
    // Le plancher n'a de sens qu'en « auto » : sur une scène fixe, il n'y a rien à choisir.
    $('bc-plancher-label').style.opacity = (cle === 'auto') ? '1' : '.4';
    // LE PLANCHER S'AJOUTE AU RÉGLAGE, IL NE LE REMPLACE PAS. Il le remplaçait, et comme
    // « auto » est vide cela ne se voyait pas : le tableau ci-dessus cessait d'être ce que la
    // page envoie dès que le plancher est rempli. C'est la forme exacte du défaut du 7 octobre
    // — la page annonce un réglage et en envoie un autre — et c'est pour cette seule raison
    // qu'une mutation de REGLAGES.auto passait inaperçue.
    if (cle === 'auto' && plancher > 0) choisi = Object.assign({}, choisi, { plancherLisibilitePc: plancher });
    return Object.assign({
      modeCapture: $('bc-mode-capture').checked,
      masquerCitations: $('bc-sans-citations').checked,
      type: $('bc-format').value,
      qualite: $('bc-format').value === 'image/jpeg' ? 0.92 : undefined,
    }, choisi);
  }
  function ajouter(p) {
    PRESENTATIONS.push(p);
    var o = document.createElement('option');
    o.value = String(PRESENTATIONS.length - 1); o.textContent = p.nom;
    sel.appendChild(o); sel.value = o.value;
    $('bc-atelier').disabled = false;
  }
  // Le document VIVANT de l'espace de travail, lu en mémoire. Rien n'est écrit, rien n'est
  // envoyé : c'est le même objet que celui que l'éditeur manipule.
  $('bc-ouverte').onclick = function () {
    var cle = window._adocWsState && window._adocWsState.storeKey;
    var art = cle && window._adocArtifacts && window._adocArtifacts[cle];
    var doc = art && art._adocStructuredDoc;
    if (!doc) { dire('Aucun document structuré ouvert. Réduisez le panneau, ouvrez une présentation, puis revenez.'); return; }
    if (doc.documentKind !== 'presentation') {
      dire('Le document ouvert est un « ' + doc.documentKind + ' » : le chutier ne rend que des Présentations.'); return;
    }
    ajouter({ cle: 'ouverte', nom: 'OUVERTE — ' + (doc.title || cle), doc: doc });
    dire('Présentation « ' + (doc.title || cle) + ' » reprise de l’espace de travail : '
      + (doc.blocks || []).length + ' diapositives, ' + window.adocPresentStepList(doc).length + ' étapes. '
      + 'Rien n’a été copié ni enregistré.');
  };
  // ── Lire le document embarqué dans un export autonome ──────────────────────────────────────
  // Un export porte « window.ADOC_EXPORT_DOC = { … }; » et son dictionnaire d’images. On les
  // extrait par appariement d’accolades, en respectant les chaînes : une recherche naïve de la
  // dernière accolade couperait au premier « } » rencontré dans un texte de diapositive.
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
  $('bc-export').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var texte = String(fr.result);
        var brutDoc = extraireObjet(texte, 'window.ADOC_EXPORT_DOC');
        if (!brutDoc) { dire('Ce fichier ne porte pas de document embarqué : ce n’est pas un export autonome de Présentation.'); return; }
        var doc = JSON.parse(brutDoc);
        if (doc.documentKind !== 'presentation') { dire('L’export embarque un « ' + doc.documentKind + ' », pas une Présentation.'); return; }
        var brutImages = extraireObjet(texte, 'window.ADOC_EXPORT_IMAGES');
        var nImages = 0;
        if (brutImages) {
          try {
            var imgs = JSON.parse(brutImages);
            window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {}, imgs);
            nImages = Object.keys(imgs).length;
          } catch (err) {}
        }
        ajouter({ cle: 'export', nom: 'EXPORT — ' + (doc.title || f.name), doc: doc });
        var nNarration = (doc.narration || []).length;
        dire('Export lu : ' + f.name
          + '\\n  ' + (doc.blocks || []).length + ' diapositives, ' + window.adocPresentStepList(doc).length + ' étapes'
          + '\\n  ' + nImages + ' images embarquées, reprises telles quelles — aucun appel au Worker'
          + '\\n  narration : ' + (nNarration ? nNarration + ' étapes narrées'
              : 'AUCUNE — un export n’en porte jamais, par construction (lot 1a). Pour une narration,'
                + '\\n              passez par « Télécharger le document de travail » puis « Charger un JSON ».')
          + '\\n  Aucune connexion, aucun mot de passe.');
      } catch (err) { dire('Lecture impossible : ' + (err && err.message || err)); }
    };
    fr.readAsText(f);
  };
  $('bc-fichier').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var brut = JSON.parse(String(fr.result));
        var doc = brut.clinicalDocument || brut;
        if (!doc || doc.documentKind !== 'presentation') { dire('Ce fichier ne contient pas une Présentation.'); return; }
        ajouter({ cle: 'fichier', nom: 'FICHIER — ' + (doc.title || f.name), doc: doc });
        dire('Chargé : ' + f.name + ' — ' + window.adocPresentStepList(doc).length + ' étapes. Le fichier n’est pas copié.');
      } catch (err) { dire('Lecture impossible : ' + (err && err.message || err)); }
    };
    fr.readAsText(f);
  };
  // ── Ouvrir le document chargé dans l’espace de travail ───────────────────────────────────
  // C’est ce qui rend possible le passage humain du lot 1a sans aucune connexion : le document
  // devient l’artefact courant, l’éditeur s’ouvre dessus, et le champ Narration apparaît sur
  // chaque étape. Rien n’est envoyé nulle part. En revanche « Enregistrer » passerait par le
  // Worker : c’est « Télécharger le document de travail » qui tient lieu d’enregistrement ici.
  $('bc-atelier').onclick = async function () {
    var p = PRESENTATIONS[Number(sel.value)];
    if (!p) return;
    this.disabled = true;
    try {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['banc'] = {
        name: p.doc.title || p.nom, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: false, blockEditing: true, export: true, qualityControlledExport: true },
        _adocStructuredDoc: p.doc,
        _adocStructuredSnapshot: { sourceSnapshotId: p.doc.sourceSnapshotId, entries: [] },
      };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'banc' });
      var ouvert = await window.adocOpenWorkspace('banc');
      $('bc-telecharger').disabled = false;
      dire(ouvert
        ? 'Ouvert dans l’espace de travail : « ' + (p.doc.title || p.nom) + ' ».'
          + '\\n  Réduisez le panneau pour écrire les narrations, puis revenez les télécharger.'
          + '\\n  Le bouton « Enregistrer » de l’application passerait par le Worker : utilisez'
          + '\\n  « Télécharger le document de travail », qui écrit un JSON sur votre disque.'
        : 'Le rendu a refusé ce document — rien n’a été ouvert.');
    } catch (e) { dire('Ouverture impossible : ' + (e && e.message || e)); }
    this.disabled = false;
  };
  // Le document de travail, narration comprise : c’est le fichier à recharger plus tard, et le
  // seul qui porte les narrations — l’export autonome, lui, n’en porte jamais.
  $('bc-telecharger').onclick = function () {
    var cle = window._adocWsState && window._adocWsState.storeKey;
    var art = cle && window._adocArtifacts && window._adocArtifacts[cle];
    var doc = art && art._adocStructuredDoc;
    if (!doc) { dire('Aucun document ouvert dans l’espace de travail.'); return; }
    var retirees = window.AtelierImages && window.AtelierImages.nombreDecodees ? null : null;
    if (typeof window.adocNarrationPurge === 'function') retirees = window.adocNarrationPurge(doc);
    var blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document-de-travail-' + (doc.documentId || 'presentation') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    dire('Téléchargé : ' + a.download
      + '\\n  ' + ((doc.narration || []).length) + ' étapes narrées'
      + (retirees && retirees.length ? '\\n  ' + retirees.length + ' narration(s) orpheline(s) purgée(s) : ' + retirees.join(', ') : '')
      + '\\n  Rechargez-le plus tard avec « Charger un JSON ». Ce fichier reste sur votre disque.');
  };
  $('bc-copier').onclick = function () {
    var t = $('bc-releve').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { dire('Relevé copié. Collez-le dans la conversation.'); },
        function () { dire('Copie refusée par le navigateur — sélectionnez le texte à la main.'); });
    } else { dire('Ce navigateur ne donne pas accès au presse-papiers — sélectionnez le texte à la main.'); }
  };
  $('bc-reduire').onclick = function () {
    var panneau = $('banc-chutier');
    panneau.style.display = 'none';
    var rouvrir = document.createElement('button');
    rouvrir.textContent = 'Rouvrir le chutier';
    rouvrir.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;font:14px -apple-system,system-ui,sans-serif;'
      + 'padding:8px 14px;border:1px solid #888;border-radius:8px;background:#fffdf9;cursor:pointer;';
    rouvrir.onclick = function () { panneau.style.display = ''; rouvrir.remove(); };
    document.body.appendChild(rouvrir);
  };
  $('bc-rendre').onclick = async function () {
    this.disabled = true;
    try { await rendre(PRESENTATIONS[Number(sel.value)]); }
    catch (e) { dire('ÉCHEC : ' + (e && e.message || e)); }
    this.disabled = false;
  };
  $('bc-tout').onclick = async function () {
    this.disabled = true;
    var lignes = [];
    for (var i = 0; i < 3; i++) {
      try {
        var r = await rendre(PRESENTATIONS[i]);
        lignes.push(PRESENTATIONS[i].nom + ' : ' + r.images.length + ' images, ' + mo(r.octets_total) + ', ' + r.duree_ms + ' ms');
      } catch (e) { lignes.push(PRESENTATIONS[i].nom + ' : ÉCHEC ' + (e && e.message || e)); }
    }
    dire(lignes.join('\\n'));
    this.disabled = false;
  };
  // ── LA PLANCHE À L'ŒIL ──────────────────────────────────────────────────────────────────────
  // Un SEUL fichier, téléchargé dans le dossier des téléchargements de Christophe : le dépôt n'en
  // voit rien, et aucun contenu de sa présentation n'y entre. Les images y sont à leur taille
  // réelle (1920 de large), en JPEG de qualité 0,82 pour que le fichier reste ouvrable, avec un
  // bouton « taille réelle » pour juger la lisibilité du texte au pixel.
  //
  // DEUX REPÈRES SUR LES IMAGES HAUTES, et c'est tout l'intérêt de la planche : un trait à
  // 1080 px dit où s'arrête le PREMIER cadre de la vidéo, et un second trait dit où s'arrête le
  // TRAVELLING. Entre les deux, ce que le spectateur verra défiler ; en dessous du second, ce
  // que le moteur a jugé vide. C'est exactement ce qu'il faut regarder pour valider ou refuser.
  function echapper(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  $('bc-planche').onclick = async function () {
    if (!dernier) return;
    this.disabled = true;
    var res = dernier.res;
    var parts = [];
    for (var i = 0; i < res.images.length; i++) {
      var im = res.images[i];
      dire('planche : image ' + (i + 1) + ' sur ' + res.images.length);
      var blob = await window.AtelierImages.versType(im, 'image/jpeg', 0.82);
      var data = await new Promise(function (ok) {
        var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.readAsDataURL(blob);
      });
      var t = im.travelling;
      var finPan = t ? (t.fin_y + res.sortie.hauteur) : res.sortie.hauteur;
      var reperes = '';
      if (im.hauteur > res.sortie.hauteur) {
        reperes = '<div class="rep cadre" style="top:' + (res.sortie.hauteur / im.hauteur * 100)
          + '%">premier cadre, ' + res.sortie.hauteur + ' px</div>';
        if (t && t.course_px > 0 && finPan < im.hauteur) {
          reperes += '<div class="rep pan" style="top:' + (finPan / im.hauteur * 100)
            + '%">fin du travelling, ' + finPan + ' px — rien ne doit porter d’encre en dessous</div>';
        }
      }
      parts.push('<figure><figcaption><b>diapositive ' + (im.cardIndex + 1) + ', étape '
        + im.rang + ' sur ' + im.surRang + '</b>'
        + '<span>image ' + im.largeur + '×' + im.hauteur + ' px'
        + '  ·  scène ' + im.scene_largeur + '×' + im.scene_hauteur
        + '  ·  corps ' + im.corps_px + ' px soit ' + im.texte_pc + ' % du cadre'
        + (im.plus_petit_texte_px && im.plus_petit_texte_px < im.corps_px
           ? '  ·  plus petit texte ' + im.plus_petit_texte_px + ' px soit ' + im.plus_petit_texte_pc + ' %' : '')
        + '  ·  contenu ' + im.hauteur_contenu + ' px, coupé ' + im.coupe_px + ' px'
        + '  ·  ' + im.debordement_verdict.toUpperCase()
        + (t ? (t.course_px > 0
                ? '  ·  travelling ' + t.course_px + ' px'
                  + (t.vitesse_px_par_s !== null ? ' à ' + t.vitesse_px_par_s + ' px/s' : ' (durée du commentaire inconnue)')
                : '  ·  rien à faire défiler à cette étape')
             : '  ·  aucun travelling')
        + '</span></figcaption>'
        + '<div class="cadre-img">' + reperes + '<img src="' + data + '" alt=""></div></figure>');
    }
    var tr = res.travellings || {};
    var entete = '<h1>Planche à l’œil — ' + echapper(dernier.p && dernier.p.nom) + '</h1>'
      + '<p class="meta">' + res.images.length + ' étapes  ·  sortie ' + res.sortie.largeur + '×'
      + res.sortie.hauteur + '  ·  ' + (res.scene_par_diapositive
        ? 'une scène par diapositive, plancher ' + res.plancher_lisibilite_pc + ' %'
        : 'scène imposée ' + res.scene.largeur + '×' + res.scene.hauteur)
      + '  ·  échelle typographique ' + (res.echelle_typo === 1 ? 'aucune' : '×' + res.echelle_typo)
      + '  ·  débordements : ' + res.debordements.aucun + ' sans, ' + res.debordements.defilement
      + ' à faire défiler, ' + res.debordements.scission + ' à scinder'
      + '  ·  travellings : ' + (tr.nombre || 0) + ' dont ' + (tr.tenables || 0) + ' tenable(s), '
      + (tr.sans_course || 0) + ' étape(s) qui débordent sans rien avoir à faire défiler'
      + '  ·  moteur ' + res.moteur + ', SnapDOM ' + res.snapdom + '</p>'
      + '<p class="meta">À regarder : le texte est-il lisible ? reste-t-il quelque chose de coupé '
      + '(« coupé » doit valoir 0 partout) ? et sur la diapositive à questionnaire, l’encre '
      + 's’arrête-t-elle bien avant le trait « fin du travelling » ?</p>'
      + '<p><button id="bascule">taille réelle / ajustée</button></p>';
    var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
      + '<title>Planche à l’œil</title><style>'
      + 'body{margin:0;padding:18px 20px 60px;background:#f6f2ea;color:#273331;'
      + 'font:14px/1.5 -apple-system,system-ui,sans-serif;}'
      + 'h1{font-size:18px;margin:0 0 6px;} .meta{font-size:12px;color:#5b6b67;margin:4px 0;}'
      + 'figure{margin:22px 0;} figcaption{font-size:12px;margin-bottom:6px;}'
      + 'figcaption span{display:block;color:#5b6b67;font-family:ui-monospace,Menlo,monospace;}'
      + '.cadre-img{position:relative;display:inline-block;border:1px solid #c9c3b8;background:#fff;}'
      + 'img{display:block;width:100%;height:auto;max-width:1100px;}'
      + 'body.reel img{width:auto;max-width:none;}'
      + '.rep{position:absolute;left:0;right:0;border-top:2px dashed #b4463c;color:#b4463c;'
      + 'font-size:11px;font-family:ui-monospace,Menlo,monospace;padding-left:4px;}'
      + '.rep.pan{border-top-color:#1f5053;color:#1f5053;}'
      + '</style></head><body>' + entete + parts.join('')
      // Le bouton de bascule, posé par un script et non par un attribut : un onclick en ligne
      // demanderait des apostrophes imbriquées dans la source du panneau, qui est elle-même une
      // chaîne. Mesuré en le tentant — la forge refusait de compiler.
      // LES DEUX BALISES SONT COUPÉES EN DEUX, et non échappées. Trois raisons, et je les ai
      // rencontrées dans cet ordre : une barre oblique inverse est refusée par le garde-fou 3 ;
      // une balise d'ouverture littérale fait découper le panneau au mauvais endroit par le
      // garde-fou 2, qui isole le script en coupant sur cette balise — y compris écrite dans un
      // COMMENTAIRE, ce qui m'est arrivé en écrivant celui-ci ; et une fermeture littérale
      // fermerait la balise de la page du banc. Les garde-fous ont rattrapé les trois.
      + '<' + 'script>document.getElementById("bascule").onclick=function(){'
      + 'document.body.classList.toggle("reel");};<' + '/script>'
      + '</body></html>';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'planche-a-l-oeil-' + res.images.length + '-etapes.html';
    document.body.appendChild(a); a.click(); a.remove();
    dire('planche téléchargée : ' + a.download + '  ('
      + Math.round(blob.size / 1024 / 1024 * 10) / 10 + ' Mo, ' + res.images.length + ' étapes). '
      + 'Rien n’a été écrit dans le dépôt.');
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
