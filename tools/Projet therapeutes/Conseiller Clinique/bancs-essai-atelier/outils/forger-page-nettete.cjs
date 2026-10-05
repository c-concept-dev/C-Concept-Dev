#!/usr/bin/env node
// COMPLÉMENT 3, POINT 2 — forge la page d'essai de netteté que Christophe lance dans SON Safari.
//
// Pourquoi forger plutôt qu'écrire une page à part : les deux candidats doivent capturer le VRAI
// #cc-ws-present-slide-inner, avec ses polices, ses images et sa mise en page de 1422x800. Une
// page qui chargerait l'export dans une iframe ferait travailler les bibliothèques à travers une
// frontière de document, ce qu'elles ne garantissent pas. On part donc de l'export lui-même et on
// lui ajoute un panneau, sans toucher au document d'origine.
//
// La sortie va dans entrees/, ignoré par git : c'est un fichier produit, et le dépôt est public.
// Le même fichier sert au pilotage WebKit (mesure-nettete-candidats.cjs) et à la main dans Safari.

const fs = require('node:fs'), path = require('node:path');
const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'entrees', 'nombres.html');
const SORTIE = path.join(RACINE, 'entrees', 'nombres-nettete.html');

if (!fs.existsSync(SOURCE)) {
  console.error('entrees/nombres.html absent — lancer d\'abord outils/produire-exports.cjs');
  process.exit(1);
}
const source = fs.readFileSync(SOURCE, 'utf8');
// ANCRE D'INJECTION : la DERNIÈRE occurrence, et elle doit terminer le document.
// L'export contient « </body></html> » TROIS fois, dont deux à l'intérieur de chaînes
// JavaScript de son propre code (adocResolveImages construit un document en mémoire). Injecter
// à la première coupait cette chaîne en deux : le script de l'export cassait sur « Unexpected
// EOF » et le panneau ne s'installait jamais. Mesuré, puis corrigé.
const ANCRE = '</body></html>';
const ancreAt = source.lastIndexOf(ANCRE);
if (ancreAt < 0 || ancreAt + ANCRE.length !== source.length) {
  console.error('ancre d\'injection non concluante : la dernière occurrence de ' + ANCRE
    + ' ne termine pas le document (offset ' + ancreAt + ', longueur ' + source.length + ')');
  process.exit(1);
}
const occurrences = source.split(ANCRE).length - 1;
console.log('ancre : ' + occurrences + ' occurrence(s), injection à la dernière (offset ' + ancreAt + ')');

const HARNAIS = `
<style>
#bn-panneau{position:fixed;top:12px;right:12px;z-index:2147483647;background:#111;color:#eee;
 font:13px/1.45 -apple-system,system-ui,sans-serif;padding:12px 14px;border-radius:10px;
 max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
#bn-panneau h3{margin:0 0 6px;font-size:13px;letter-spacing:.02em}
#bn-panneau button{font:inherit;margin:3px 4px 3px 0;padding:5px 9px;border-radius:6px;
 border:1px solid #555;background:#222;color:#eee;cursor:pointer}
#bn-panneau button:disabled{opacity:.45;cursor:default}
#bn-sortie{white-space:pre-wrap;margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
#bn-panneau .bn-note{color:#9ab;font-size:11.5px;margin-top:6px}
</style>
<div id="bn-panneau">
  <h3>Netteté — deux candidats, cadre 1920×1080</h3>
  <button id="bn-prep">1. Préparer la diapositive</button>
  <button id="bn-tout" disabled>2. Tout mesurer</button>
  <button id="bn-tel" disabled>3. Télécharger</button>
  <div id="bn-sortie">En attente.</div>
  <div class="bn-note">La mesure porte sur la raideur des contours, à taille égale (1920×1080).
  Un refus de Safari sur foreignObject→canvas est signalé explicitement.</div>
</div>
<script>
(function () {
  var CIBLE = { l: 1920, h: 1080 }, SEUIL = 40;
  var sortie = document.getElementById('bn-sortie');
  var resultats = null;
  function dire(t) { sortie.textContent = t; }

  // Même formule que outils/contours.cjs, pour que les chiffres de Safari soient comparables
  // à ceux du pilotage WebKit sans retraitement.
  function contours(px, l, h) {
    var y0 = Math.round(h * 0.25), y1 = Math.round(h * 0.75);
    var francs = 0, total = 0, somme = 0, pic = 0;
    for (var y = y0; y < y1; y++) for (var x = 1; x < l; x++) {
      var i = (y * l + x) * 4, j = i - 4;
      var g = Math.abs(px[i] - px[j]) + Math.abs(px[i+1] - px[j+1]) + Math.abs(px[i+2] - px[j+2]);
      total++;
      if (g > SEUIL) { francs++; somme += g; if (g > pic) pic = g; }
    }
    return { taille: l + 'x' + h, densite: +(100 * francs / total).toFixed(3),
             moyen: +(somme / (francs || 1)).toFixed(1), pic: pic };
  }

  function cadre() {
    var c = document.createElement('canvas');
    c.width = CIBLE.l; c.height = CIBLE.h;
    return c;
  }
  // Lecture des pixels : c'est ICI que Safari refuse, si refus il y a. On distingue le refus de
  // sécurité (canvas souillé par le foreignObject) de toute autre panne.
  function pixels(canvas) {
    try {
      return { px: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data };
    } catch (e) {
      var n = String(e && e.name || ''), m = String(e && e.message || e);
      var souille = /SecurityError|insecure|tainted|cross-origin/i.test(n + ' ' + m);
      return { refus: souille ? 'REFUS DE SÉCURITÉ (canvas souillé) : ' + m : 'échec de lecture : ' + m,
               souille: souille };
    }
  }
  function cible() { return document.getElementById('cc-ws-present-slide-inner'); }

  async function preparer() {
    var b = document.querySelector('#cc-ws-present-start button');
    if (b) b.click();
    var t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      var o = document.getElementById('cc-ws-present-overlay');
      if (o && o.classList.contains('open') && cible()) break;
      await new Promise(function (r) { setTimeout(r, 60); });
    }
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    // 800 ms : l'animation de nombre dure 700 ms (adocPresentAnimateNumberIfEligible). Capturer
    // plus tôt enregistre « 16 % » au lieu de « 37 % ». Mesuré dans le lot 0.
    await new Promise(function (r) { setTimeout(r, 800); });
    var el = cible();
    return el ? { pret: true, mise_en_page: el.offsetWidth + 'x' + el.offsetHeight }
              : { pret: false, erreur: 'diapositive introuvable' };
  }

  // (a) SnapDOM toSvg, puis rastérisation par drawImage sur un canvas 1920x1080.
  async function candidatA() {
    var el = cible(); if (!el) return { erreur: 'diapositive introuvable' };
    var t0 = performance.now();
    var mod = await import('./../vendeur/snapdom.mjs');
    var res = await mod.snapdom(el, {});
    var img = await res.toSvg();   // HTMLImageElement portant une URL de données SVG
    if (!img.complete) { await img.decode().catch(function () {}); }
    var naturel = (img.naturalWidth || 0) + 'x' + (img.naturalHeight || 0);
    var c = cadre(), ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    try { ctx.drawImage(img, 0, 0, CIBLE.l, CIBLE.h); }
    catch (e) { return { erreur: 'drawImage refusé : ' + String(e && e.message || e), svg_naturel: naturel }; }
    var ms = +(performance.now() - t0).toFixed(0);
    var p = pixels(c);
    if (p.refus) return { refus: p.refus, souille: p.souille, svg_naturel: naturel, ms: ms };
    return Object.assign({ svg_naturel: naturel, ms: ms, png: c.toDataURL('image/png') },
                         contours(p.px, c.width, c.height));
  }

  // (c) la propriété CSS zoom, qui agit sur la MISE EN PAGE, au lieu de transform: scale, qui
  // n'agit que sur le rendu. SnapDOM lisant la mise en page, c'est le seul levier CSS qui puisse
  // lui faire voir 1920x1080. On repose l'état d'origine dans tous les cas, succès comme échec.
  async function candidatC() {
    var el = cible(); if (!el) return { erreur: "diapositive introuvable" };
    var ancien = el.getAttribute("style") || "";
    var t0 = performance.now();
    var facteur = CIBLE.l / el.offsetWidth;
    el.style.zoom = String(facteur);
    // Laisser la mise en page se refaire avant de lire quoi que ce soit.
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    var vue = el.offsetWidth + "x" + el.offsetHeight;
    var res, img;
    try {
      var mod = await import("./../vendeur/snapdom.mjs");
      res = await mod.snapdom(el, {});
      img = await res.toSvg();
      if (!img.complete) { await img.decode().catch(function () {}); }
    } catch (e) {
      el.setAttribute("style", ancien);
      return { erreur: "snapdom a échoué sous zoom : " + String(e && e.message || e), mise_en_page_vue: vue };
    }
    var naturel = (img.naturalWidth || 0) + "x" + (img.naturalHeight || 0);
    el.setAttribute("style", ancien);
    var c = cadre(), ctx = c.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    try { ctx.drawImage(img, 0, 0, CIBLE.l, CIBLE.h); }
    catch (e) { return { erreur: "drawImage refusé : " + String(e && e.message || e), svg_naturel: naturel }; }
    var ms = +(performance.now() - t0).toFixed(0);
    var p = pixels(c);
    if (p.refus) return { refus: p.refus, souille: p.souille, svg_naturel: naturel, ms: ms };
    return Object.assign({ zoom: +facteur.toFixed(4), mise_en_page_vue: vue, svg_naturel: naturel,
                           ms: ms, png: c.toDataURL("image/png") },
                         contours(p.px, c.width, c.height));
  }

  // (d) un SVG écrit ICI : on reprend la sérialisation de SnapDOM (qui inline styles, polices et
  // images) mais on remplace sa balise <svg> par width=1920 height=1080 viewBox="0 0 1422 800",
  // le foreignObject restant à 1422x800. Le navigateur doit alors rastériser le contenu du
  // foreignObject à 1920x1080 par le viewBox, au lieu de l'étirer après coup.
  async function candidatD() {
    var el = cible(); if (!el) return { erreur: "diapositive introuvable" };
    var t0 = performance.now();
    var mod = await import("./../vendeur/snapdom.mjs");
    var res = await mod.snapdom(el, {});
    var brut = await res.toRaw();
    var prefixe = "data:image/svg+xml;charset=utf-8,";
    if (String(brut).indexOf(prefixe) !== 0) return { erreur: "toRaw inattendu" };
    var svg = decodeURIComponent(String(brut).slice(prefixe.length));
    var ouvrante = (svg.match(/<svg[^>]*>/) || [null])[0];
    if (!ouvrante) return { erreur: "balise <svg> introuvable" };
    var l0 = (ouvrante.match(/width="([0-9]+(?:[.][0-9]+)?)"/) || [])[1];
    var h0 = (ouvrante.match(/height="([0-9]+(?:[.][0-9]+)?)"/) || [])[1];
    if (!l0 || !h0) return { erreur: "dimensions du SVG illisibles : " + ouvrante.slice(0, 120) };
    // viewBox sur les dimensions D ORIGINE, width/height sur la cible : c'est tout le ressort.
    var neuve = ouvrante
      .replace(/width="[^"]*"/, 'width="' + CIBLE.l + '"')
      .replace(/height="[^"]*"/, 'height="' + CIBLE.h + '"');
    if (!/viewBox=/.test(neuve)) {
      neuve = neuve.replace("<svg", '<svg viewBox="0 0 ' + l0 + " " + h0 + '"');
    } else {
      neuve = neuve.replace(/viewBox="[^"]*"/, 'viewBox="0 0 ' + l0 + " " + h0 + '"');
    }
    var svg2 = svg.replace(ouvrante, neuve);
    var img = new Image();
    var charge = await new Promise(function (ok) {
      img.onload = function () { ok(true); };
      img.onerror = function () { ok(false); };
      img.src = prefixe + encodeURIComponent(svg2);
    });
    if (!charge) return { erreur: "le SVG réécrit ne se charge pas", svg_ecrit: neuve.slice(0, 160) };
    var naturel = (img.naturalWidth || 0) + "x" + (img.naturalHeight || 0);
    var c = cadre(), ctx = c.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    try { ctx.drawImage(img, 0, 0, CIBLE.l, CIBLE.h); }
    catch (e) { return { erreur: "drawImage refusé : " + String(e && e.message || e), svg_naturel: naturel }; }
    var ms = +(performance.now() - t0).toFixed(0);
    var p = pixels(c);
    if (p.refus) return { refus: p.refus, souille: p.souille, svg_naturel: naturel, ms: ms };
    return Object.assign({ svg_origine: l0 + "x" + h0, svg_naturel: naturel,
                           svg_ecrit: neuve.slice(0, 160), ms: ms, png: c.toDataURL("image/png") },
                         contours(p.px, c.width, c.height));
  }

  // (b) html-to-image avec pixelRatio = 1920/1422.
  async function candidatB() {
    var el = cible(); if (!el) return { erreur: 'diapositive introuvable' };
    if (typeof window.htmlToImage === 'undefined') {
      await new Promise(function (ok, ko) {
        var s = document.createElement('script');
        s.src = './../vendeur/html-to-image.js'; s.onload = ok; s.onerror = function () { ko(new Error('chargement impossible')); };
        document.head.appendChild(s);
      }).catch(function (e) { return e; });
    }
    if (typeof window.htmlToImage === 'undefined') return { erreur: 'html-to-image indisponible' };
    var t0 = performance.now();
    var ratio = CIBLE.l / el.offsetWidth;
    var url;
    try { url = await window.htmlToImage.toPng(el, { pixelRatio: ratio, backgroundColor: '#fff' }); }
    catch (e) { return { erreur: 'html-to-image a échoué : ' + String(e && e.message || e), pixelRatio: +ratio.toFixed(4) }; }
    var ms = +(performance.now() - t0).toFixed(0);
    var img = new Image();
    await new Promise(function (ok, ko) { img.onload = ok; img.onerror = ko; img.src = url; });
    var rendu = img.naturalWidth + 'x' + img.naturalHeight;
    // Mise à taille égale : si la bibliothèque ne tombe pas pile sur 1920x1080, on la redessine
    // dans le cadre, et on le DIT, plutôt que de comparer des tailles différentes.
    var c = cadre(), ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, CIBLE.l, CIBLE.h);
    var p = pixels(c);
    if (p.refus) return { refus: p.refus, souille: p.souille, rendu: rendu, pixelRatio: +ratio.toFixed(4), ms: ms };
    return Object.assign({ rendu: rendu, pixelRatio: +ratio.toFixed(4),
                           redimensionne: rendu !== (CIBLE.l + 'x' + CIBLE.h), ms: ms,
                           png: c.toDataURL('image/png') },
                         contours(p.px, c.width, c.height));
  }

  function resume(r) {
    var l = [];
    l.push('préparation : ' + (r.preparation.pret ? 'OK, mise en page ' + r.preparation.mise_en_page : 'ÉCHEC'));
    [['(a) SnapDOM toSvg → drawImage', r.a], ['(b) html-to-image pixelRatio', r.b],
     ['(c) CSS zoom + SnapDOM', r.c], ['(d) SVG viewBox écrit ici', r.d]].forEach(function (p) {
      var x = p[1];
      if (x.refus) { l.push(p[0] + ' : ' + x.refus); return; }
      if (x.erreur) { l.push(p[0] + ' : ' + x.erreur); return; }
      l.push(p[0] + ' : ' + x.taille + '  densité ' + x.densite + ' %  gradient ' + x.moyen
        + '  pic ' + x.pic + '  ' + x.ms + ' ms'
        + (x.redimensionne ? '  [redimensionné depuis ' + x.rendu + ']' : ''));
    });
    l.push('');
    l.push('Repères du lot 0 (WebKit piloté) : moteur à 1920 → gradient 162,5 / pic 232 ;');
    l.push("moteur flouté d'1 px → 89 ; SnapDOM scale → 92,5.");
    return l.join('\\n');
  }

  document.getElementById('bn-prep').addEventListener('click', async function () {
    this.disabled = true; dire('Préparation…');
    var p = await preparer();
    dire(p.pret ? 'Prêt. Mise en page ' + p.mise_en_page + '. Cliquer « Tout mesurer ».'
                : 'Échec : ' + p.erreur);
    document.getElementById('bn-tout').disabled = !p.pret;
    window.__netteteEtat = p;
  });

  document.getElementById('bn-tout').addEventListener('click', async function () {
    this.disabled = true; dire('Mesure en cours…');
    resultats = { navigateur: navigator.userAgent, preparation: window.__netteteEtat || { pret: true },
                  a: await candidatA(), b: await candidatB(),
                  c: await candidatC(), d: await candidatD() };
    dire(resume(resultats));
    document.getElementById('bn-tel').disabled = false;
  });

  document.getElementById('bn-tel').addEventListener('click', function () {
    if (!resultats) return;
    ['a', 'b', 'c', 'd'].forEach(function (k) {
      if (!resultats[k] || !resultats[k].png) return;
      var a = document.createElement('a');
      a.href = resultats[k].png; a.download = 'nettete-' + k + '-safari.png'; a.click();
    });
    var sansPng = JSON.parse(JSON.stringify(resultats));
    ['a', 'b', 'c', 'd'].forEach(function (k) { if (sansPng[k]) delete sansPng[k].png; });
    var b = new Blob([JSON.stringify(sansPng, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'nettete-safari.json'; a.click();
  });

  // Pilotage automatisé : mêmes fonctions, sans le panneau.
  window.__netteteApi = { preparer: preparer, candidatA: candidatA, candidatB: candidatB,
                          candidatC: candidatC, candidatD: candidatD };
})();
</script>
`;

// CONTRÔLE AVANT ÉCRITURE : le script injecté est extrait et soumis à l'analyseur de Node.
// Une apostrophe mal échappée dans le gabarit s'est déjà traduite par un « Unexpected EOF »
// silencieux côté navigateur, le panneau ne s'installant jamais. On ne livre plus sans ce contrôle.
{
  const vm = require('node:vm');
  const morceaux = HARNAIS.split('<script>');
  if (morceaux.length !== 2) { console.error('harnais : un seul bloc <script> attendu'); process.exit(1); }
  const js = morceaux[1].split('</scr' + 'ipt>')[0];
  try { new vm.Script(js); }
  catch (e) { console.error('harnais REFUSÉ, erreur de syntaxe : ' + e.message); process.exit(1); }
  // Un antislash qui survit au gabarit signale une séquence d'échappement mal maîtrisée : soit
  // elle a été consommée et le code est devenu faux sans cesser d'être valide, soit elle traîne.
  // Seul « \n » est admis, parce qu'il est voulu dans le résumé affiché.
  const restants = (js.match(/\\./g) || []).filter((x) => x !== '\\n');
  if (restants.length) {
    console.error('harnais REFUSÉ : séquences d\'échappement suspectes ' + JSON.stringify(restants));
    console.error('  Écrire les regex sans antislash ([0-9] au lieu de \\d) : le gabarit les mange.');
    process.exit(1);
  }
  console.log('contrôle de syntaxe du script injecté : OK (' + js.length + ' caractères)');
}
fs.writeFileSync(SORTIE, source.slice(0, ancreAt) + HARNAIS + ANCRE, 'utf8');
console.log('forgé : entrees/nombres-nettete.html  ('
  + Math.round(fs.statSync(SORTIE).size / 1024) + ' Ko, source ' + Math.round(source.length / 1024) + ' Ko)');
console.log('Christophe : servir le dossier, puis ouvrir');
console.log('  http://localhost:8000/entrees/nombres-nettete.html');
