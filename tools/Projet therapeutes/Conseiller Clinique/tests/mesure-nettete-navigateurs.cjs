#!/usr/bin/env node
// NETTETÉ DE SNAPDOM DANS SAFARI RÉEL ET DANS WEBKIT — pas dans Chromium.
//
// POURQUOI CET OUTIL EXISTE. La mesure précédente concluait « SnapDOM ne coûte rien », et elle
// était faite dans Chromium seulement. La planche qui l'illustrait affichait, dans Safari, des PNG
// produits par Chromium : elle ne disait donc RIEN de SnapDOM dans Safari. Et le lot 0 avait
// mesuré dans WebKit un texte plus doux. Les deux résultats ne se contredisent que si l'on suppose
// que tous les moteurs rastérisent le SVG de SnapDOM de la même façon — ce qui est précisément ce
// qu'il faut vérifier.
//
// CE QUI EST COMPARÉ, dans CHAQUE navigateur, à mise en page et taille identiques :
//   A. scène 1920×1080, échelle 1  — SnapDOM contre la rastérisation native du navigateur
//   B. mode vidéo 960×540 ×1,4, sortie 1920×1080 — SnapDOM à l'échelle 2 contre le même contenu
//      sous transform:scale(2), que le navigateur REDESSINE à la taille doublée
// La capture native vient du PILOTE (WebDriver pour Safari, Playwright pour WebKit) ; la capture
// SnapDOM est exécutée DANS ce même navigateur, sur la même scène, au même instant.
//
// TÉMOIN : deux étapes voisines doivent différer. Sans lui, « zéro pixel » ne prouve rien.
//
// L'ÉCRAN DE CONNEXION DE L'APPLICATION NE GÊNE PAS, et c'est vérifié : avec lui affiché, le
// moteur ouvre sa scène et capture une image de 1920×1080. La mesure forge sa propre présentation
// d'essai en mémoire et ne touche à aucun document enregistré — aucun mot de passe n'est requis.
//
// EN REVANCHE, PILOTER LE SAFARI RÉEL PREND L'ÉCRAN. Safari met la session automatisée EN PAUSE
// dès qu'on touche son clavier ou sa fenêtre, et affiche « La fenêtre Safari est contrôlée à
// distance ». Il faut donc laisser la machine tranquille pendant la mesure — d'où le choix du
// navigateur en argument, pour pouvoir faire WebKit sans déranger personne.
//
//   NODE_PATH=<playwright> node tests/mesure-nettete-navigateurs.cjs [safari|webkit|les-deux]
const { webkit } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PNG } = require('pngjs');
const _pm = require('pixelmatch');
const pixelmatch = typeof _pm === 'function' ? _pm : _pm.default;
const { PRESENTATIONS, IMAGES_EMBARQUEES } = require('./chutier-fixtures.cjs');

const RACINE = path.join(__dirname, '..');
const BANC = path.join(RACINE, 'banc-chutier');
const DOSSIER = path.join(BANC, 'nettete-navigateurs');
const PORT_WD = 47913;
const SELECTEUR = '[data-atelier-scene] .cc-ws-present-slide-inner';
const PRESENTATION = PRESENTATIONS[1];        // texte dense : la netteté se mesure sur du texte
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const COMPARAISONS = [
  { cle: 'A', titre: 'A. Scène 1920×1080, échelle 1', facteur: 1,
    opts: { scene: { largeur: 1920, hauteur: 1080 }, echelleTypo: 2.8 } },
  { cle: 'B', titre: 'B. Mode vidéo 960×540 ×1,4, sortie 1920×1080', facteur: 2, opts: {} },
];

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream',
                         'content-length': fs.statSync(p).size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

// ── Les scripts injectés, écrits UNE fois et joués par les deux pilotes ──────────────────────
const SCRIPTS = {
  ouvrir: `
    window.ADOC_EXPORT_IMAGES = Object.assign({}, window.ADOC_EXPORT_IMAGES || {}, ARGS.images);
    window.__sc = await window.AtelierImages.ouvrirScene(ARGS.doc, ARGS.opts);
    return { etapes: window.__sc.etapes.length, scene: window.__sc.scene };`,
  poser: `
    window.__infos = await window.__sc.allerA(ARGS.n);
    var sc = window.__sc, f = ARGS.facteur, scene = sc.scene;
    var deb = sc.mesurer();
    var hNec = Math.max(scene.hauteur, sc.inner.scrollHeight,
      (sc.inner.querySelector('.adoc-sc-card') || { scrollHeight: 0 }).scrollHeight);
    var h = (deb.verdict === 'aucun') ? scene.hauteur : hNec;
    window.__avant = { hote: sc.hote.style.cssText, outer: sc.outer.style.cssText, inner: sc.inner.style.cssText };
    sc.hote.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;display:block;background:#fff;';
    // « display:block » : la classe de l'enveloppe centre son contenu (flex, align et justify au
    // centre). Avec une transformation d'origine haut-gauche, cela posait la scène en (480, 270)
    // au lieu de (0, 0) — taille juste, position fausse. Une capture de fenêtre découpée en (0,0)
    // aurait alors comparé deux cadrages différents, et l'écart aurait été attribué à SnapDOM.
    sc.outer.style.cssText = 'display:block;width:' + (scene.largeur * f) + 'px;height:' + (h * f) + 'px;'
      + 'min-width:' + (scene.largeur * f) + 'px;min-height:' + (h * f) + 'px;flex:0 0 auto;overflow:visible;';
    // « transition:none » EST OBLIGATOIRE ICI. La classe du lecteur déclare une transition de
    // 260 ms sur transform ; creerScene la coupe, mais réécrire cssText efface cette coupure. Sans
    // elle, poser scale(2) lance une ANIMATION de 1 vers 2, et deux images d'attente mesurent au
    // milieu du chemin : 1,147569 — le chiffre exact qu'a rendu le diagnostic, et qui m'a d'abord
    // fait chercher une règle d'échelle là où il n'y avait qu'une transition en cours.
    sc.inner.style.cssText = 'width:' + scene.largeur + 'px;height:' + h + 'px;overflow:visible;'
      + 'transition:none !important;';
    // LA TRANSFORMATION DU LECTEUR EST SUR L'ENVELOPPE, pas sur l'intérieur : c'est
    // .cc-ws-present-slide-outer qui porte « transform:scale(var(--adoc-present-echelle,1)) » avec
    // origine au centre. D'où une scène mesurée à 1095×616 décalée de (480,270) alors qu'on la
    // posait à 1920×1080 — et d'où l'inutilité d'un !important posé sur l'intérieur seul.
    sc.outer.style.setProperty('transform', 'none', 'important');
    // En « important » : la règle du lecteur applique sa propre transformation à ces classes, et
    // elle l'emporterait sur une déclaration ordinaire posée plus tôt.
    if (f !== 1) {
      sc.inner.style.setProperty('transform', 'scale(' + f + ')', 'important');
      sc.inner.style.setProperty('transform-origin', '0 0', 'important');
    } else {
      sc.inner.style.setProperty('transform', 'none', 'important');
    }
    // Et par sécurité, on attend qu'il ne reste aucune animation en cours sur la scène : la
    // coupure ci-dessus devrait suffire, cette attente le prouve plutôt que de l'espérer.
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    try {
      if (sc.inner.getAnimations) {
        await Promise.all(sc.inner.getAnimations({ subtree: true }).map(function (an) { return an.finished.catch(function () {}); }));
      }
    } catch (e) {}
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    // LA SCÈNE POSÉE EST MESURÉE, et non supposée. C'est ce contrôle qui a révélé que le lecteur
    // redimensionnait la scène dans notre dos. Sans lui, la comparaison aurait porté sur une image
    // décalée et réduite, et aurait annoncé une douceur qui n'existait pas.
    var b = sc.inner.getBoundingClientRect();
    return { attendue: { l: scene.largeur * f, h: h * f }, verdict: deb.verdict,
             mesuree: { x: Math.round(b.x), y: Math.round(b.y), l: Math.round(b.width), h: Math.round(b.height) },
             // De quoi diagnostiquer sans relancer, si la scène se trouvait encore mal posée.
             transformations: { outer: getComputedStyle(sc.outer).transform,
                                inner: getComputedStyle(sc.inner).transform } };`,
  capturer: `
    var sc = window.__sc;
    sc.hote.style.cssText = window.__avant.hote;
    sc.outer.style.cssText = window.__avant.outer;
    sc.inner.style.cssText = window.__avant.inner;
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    var im = await sc.capturerEtape(ARGS.n, window.__infos);
    var b64 = await new Promise(function (ok) {
      var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(',')[1]); };
      fr.readAsDataURL(im.blob);
    });
    return { b64: b64, stepId: im.stepId, largeur: im.largeur, hauteur: im.hauteur,
             verdict: im.debordement_verdict };`,
  fermer: `window.__sc.fermer(); window.__sc = null; return 1;`,
};

// ── Pilote WebDriver (Safari réel) ───────────────────────────────────────────────────────────
// CHIEN DE GARDE. Safari SUSPEND la session automatisée dès qu'on touche sa fenêtre : la commande
// en cours reste alors en attente, sans erreur, aussi longtemps que la fenêtre d'avertissement est
// affichée. Une mesure qui attend en silence n'est pas une mesure. Chaque appel est donc borné, et
// l'abandon DIT ce qu'il faut regarder — y compris le cas où une fenêtre du système réclamerait
// quelque chose, auquel cas on s'arrête au lieu d'attendre.
const DELAI_APPEL_MS = 90000;
async function wdAppel(methode, chemin, corps) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), DELAI_APPEL_MS);
  let r;
  try {
    r = await fetch('http://127.0.0.1:' + PORT_WD + chemin, {
      method: methode, headers: { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps), signal: arret.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('Safari n\'a pas répondu en ' + (DELAI_APPEL_MS / 1000) + ' s sur ' + methode + ' ' + chemin
        + ' — la session est probablement SUSPENDUE. Cela arrive dès qu\'on clique ou qu\'on tape dans '
        + 'la fenêtre pilotée : Safari affiche alors « La fenêtre Safari est contrôlée à distance par '
        + 'un test automatisé » et attend un choix. Si une fenêtre du système demande autre chose, '
        + 'arrêtez ici : rien dans cette mesure n\'exige de mot de passe.');
    }
    throw e;
  } finally { clearTimeout(minuteur); }
  const j = JSON.parse(await r.text());
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + String(j.value.message || '').slice(0, 200));
  return j && j.value;
}
const etape = (t) => { process.stdout.write('   · ' + t + '\n'); };
async function piloteSafari(url) {
  etape('démarrage de safaridriver sur le port ' + PORT_WD);
  const pilote = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(PORT_WD)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  etape('ouverture de la session Safari');
  const v = await wdAppel('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  const s = v.sessionId;
  await wdAppel('POST', '/session/' + s + '/timeouts', { script: 600000 });
  etape('fenêtre à 2000x1300');
  await wdAppel('POST', '/session/' + s + '/window/rect', { x: 0, y: 0, width: 2000, height: 1300 });
  etape('chargement de la page');
  await wdAppel('POST', '/session/' + s + '/url', { url });
  // UNE BOÎTE DE DIALOGUE DE LA PAGE BLOQUE TOUT. WebDriver refuse d'exécuter le moindre script
  // tant qu'un alert/confirm/prompt est ouvert : il rend « unexpected alert open », et c'est
  // exactement ce qui a fait croire à une session suspendue. On la LIT — pour savoir ce qu'elle
  // disait, au lieu de la faire disparaître en aveugle — puis on l'accepte.
  for (let essai = 0; essai < 5; essai++) {
    let texte = null;
    try { texte = await wdAppel('GET', '/session/' + s + '/alert/text'); } catch (e) { break; }
    if (texte === null || texte === undefined) break;
    etape('boîte de dialogue de la page, acceptée : « ' + String(texte).replace(/\s+/g, ' ').slice(0, 120) + ' »');
    try { await wdAppel('POST', '/session/' + s + '/alert/accept', {}); } catch (e) { break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  etape('attente du moteur');
  // Attendre que le moteur soit là : WebDriver rend la main dès que le document est chargé, pas
  // quand les scripts ont fini. Sans cette attente, le premier appel tombait sur un AtelierImages
  // encore indéfini — une course que rien ne signalait.
  const pret = await wdAppel('POST', '/session/' + s + '/execute/async', {
    script: 'var cb = arguments[0]; var t0 = Date.now(); (function boucle() {'
          + ' if (window.AtelierImages && window.adocPresentStepList) return cb(true);'
          + ' if (Date.now() - t0 > 30000) return cb(false); setTimeout(boucle, 100); })();', args: [] });
  if (!pret) throw new Error('AtelierImages ne s\'est pas chargé dans Safari en 30 s');
  const infos = await wdAppel('POST', '/session/' + s + '/execute/sync', {
    script: 'return { dpr: window.devicePixelRatio, iw: window.innerWidth, ih: window.innerHeight };', args: [] });
  return {
    nom: 'Safari ' + (v.capabilities && v.capabilities.browserVersion) + ' réel',
    infos,
    evaluer: async (corps, args) => wdAppel('POST', '/session/' + s + '/execute/async', {
      script: 'var ARGS = arguments[0], cb = arguments[1];'
            + '(async function () { ' + corps + ' })().then(cb).catch(function (e) { cb({ __erreur: String(e && e.message || e) }); });',
      args: [args || {}] }),
    photographier: async () => Buffer.from(await wdAppel('GET', '/session/' + s + '/screenshot'), 'base64'),
    fermer: async () => { try { await wdAppel('DELETE', '/session/' + s); } catch (e) {} pilote.kill(); },
  };
}

// ── Pilote Playwright (WebKit) ───────────────────────────────────────────────────────────────
async function piloteWebKit(url) {
  const nav = await webkit.launch();
  const ctx = await nav.newContext({ viewport: { width: 1980, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => typeof window.AtelierImages === 'object');
  const infos = await page.evaluate(() => ({ dpr: window.devicePixelRatio, iw: innerWidth, ih: innerHeight }));
  return {
    nom: 'WebKit (Playwright ' + nav.version() + ')', infos,
    evaluer: async (corps, args) => page.evaluate(
      new Function('ARGS', 'return (async function () { ' + corps + ' })();'), args || {}),
    photographier: async () => page.screenshot({ type: 'png' }),
    fermer: async () => { await nav.close(); },
  };
}

// DÉCOUPE D'UNE CAPTURE DE FENÊTRE. Safari IGNORE transform:scale(2) dans sa capture d'élément :
// il rend la boîte non transformée, 960×540 là où l'écran montre 1920×1080. Mesuré — Chromium et
// WebKit, eux, l'honorent. Plutôt que deux méthodes selon le navigateur, qui auraient rendu les
// colonnes incomparables entre elles, les deux pilotes photographient désormais la FENÊTRE et la
// découpe se fait ici, à l'identique.
function decouper(png, l, h) {
  if (png.width < l || png.height < h) {
    throw new Error('fenêtre trop petite pour la découpe : ' + png.width + 'x' + png.height
      + ' alors qu\'il faut ' + l + 'x' + h + '. Agrandissez la fenêtre du navigateur.');
  }
  if (png.width === l && png.height === h) return png;
  const out = new PNG({ width: l, height: h });
  for (let y = 0; y < h; y++) {
    png.data.copy(out.data, y * l * 4, (y * png.width) * 4, (y * png.width + l) * 4);
  }
  return out;
}

// ── Comparaison de deux images ───────────────────────────────────────────────────────────────
function comparer(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { comparable: false, raison: a.width + 'x' + a.height + ' contre ' + b.width + 'x' + b.height };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const differents = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  // L'écart MAXIMAL et l'écart MOYEN sur les canaux : « combien de pixels diffèrent » ne dit pas
  // de combien. Un texte plus doux, c'est beaucoup de pixels qui diffèrent un peu.
  let max = 0, somme = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
                       Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 0) { n++; somme += d; if (d > max) max = d; }
  }
  return { comparable: true, differents, diff,
    part: +((100 * differents) / (a.width * a.height)).toFixed(3),
    ecart_max: max, ecart_moyen: n ? +(somme / n).toFixed(1) : 0,
    pixels_non_identiques: n, l: a.width, h: a.height };
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const { serveur, port } = await servir();
  const url = 'http://127.0.0.1:' + port + '/studio-clinique.html';
  const releve = [];

  const choix = (process.argv[2] || 'les-deux').toLowerCase();
  const fabriques = [];
  if (choix === 'safari' || choix === 'les-deux') fabriques.push(piloteSafari);
  if (choix === 'webkit' || choix === 'les-deux') fabriques.push(piloteWebKit);
  if (!fabriques.length) { console.error('navigateur inconnu : ' + choix); process.exit(1); }
  // Le relevé déjà écrit est repris, pour que deux passages séparés composent UNE planche.
  const cheminJson = path.join(BANC, 'nettete-navigateurs.json');
  if (fs.existsSync(cheminJson)) {
    try {
      JSON.parse(fs.readFileSync(cheminJson, 'utf8')).forEach(function (x) {
        if (!fabriques.some((f) => f.name.toLowerCase().indexOf(x.navigateur.split(' ')[0].toLowerCase()) !== -1)) releve.push(x);
      });
    } catch (e) {}
  }

  for (const fabrique of fabriques) {
    let p = null;
    try { p = await fabrique(url); }
    catch (e) { console.log('PILOTE INDISPONIBLE : ' + String(e.message).slice(0, 140)); continue; }
    console.log('');
    console.log('══ ' + p.nom + '  —  rapport de pixels ' + p.infos.dpr
      + ', fenêtre interne ' + p.infos.iw + '×' + p.infos.ih + ' ' + '═'.repeat(8));
    const parNavigateur = { navigateur: p.nom, infos: p.infos, comparaisons: [] };
    try {
      for (const comp of COMPARAISONS) {
        etape(comp.cle + ' — ouverture de la scène (import de SnapDOM)');
        const ouverture = await p.evaluer(SCRIPTS.ouvrir,
          { doc: PRESENTATION.doc, images: IMAGES_EMBARQUEES, opts: comp.opts });
        if (ouverture && ouverture.__erreur) throw new Error(comp.cle + ' : ' + ouverture.__erreur);
        const lignes = [];
        const natifs = [];
        for (let n = 0; n < ouverture.etapes; n++) {
          etape(comp.cle + ' — étape ' + (n + 1) + ' sur ' + ouverture.etapes + ' : mise en place');
          const pose = await p.evaluer(SCRIPTS.poser, { n, facteur: comp.facteur });
          if (pose && pose.__erreur) throw new Error('poser ' + n + ' : ' + pose.__erreur);
          const m = pose.mesuree, att = pose.attendue;
          if (m.x !== 0 || m.y !== 0 || m.l !== att.l || m.h !== att.h) {
            throw new Error('scène mal posée à l\'étape ' + (n + 1) + ' : mesurée '
              + m.l + 'x' + m.h + ' en (' + m.x + ',' + m.y + ') au lieu de ' + att.l + 'x' + att.h
              + ' en (0,0). Transformations calculées : enveloppe ' + pose.transformations.outer
              + ', intérieur ' + pose.transformations.inner
              + '. Capture native refusée — elle ne montrerait pas la même chose que SnapDOM.');
          }
          etape(comp.cle + ' — étape ' + (n + 1) + ' : capture native');
          const natif = await p.photographier();
          etape(comp.cle + ' — étape ' + (n + 1) + ' : capture SnapDOM');
          const capt = await p.evaluer(SCRIPTS.capturer, { n });
          if (capt && capt.__erreur) throw new Error('capturer ' + n + ' : ' + capt.__erreur);
          // La scène est posée en haut à gauche de la fenêtre par le script `poser` : la découpe
          // part donc de (0,0) et prend exactement la taille attendue.
          const pngNatif = decouper(PNG.sync.read(natif), pose.attendue.l, pose.attendue.h);
          const pngSnap = PNG.sync.read(Buffer.from(capt.b64, 'base64'));
          const base = p.nom.split(' ')[0].toLowerCase() + '-' + comp.cle + (n + 1);
          fs.writeFileSync(path.join(DOSSIER, base + '-natif.png'), PNG.sync.write(pngNatif));
          fs.writeFileSync(path.join(DOSSIER, base + '-snapdom.png'), Buffer.from(capt.b64, 'base64'));
          natifs.push(pngNatif);
          const c = comparer(pngNatif, pngSnap);
          if (c.comparable) fs.writeFileSync(path.join(DOSSIER, base + '-ecart.png'), PNG.sync.write(c.diff));
          lignes.push({ etape: n + 1, stepId: capt.stepId, base, attendue: pose.attendue,
            natif: pngNatif.width + 'x' + pngNatif.height, snapdom: pngSnap.width + 'x' + pngSnap.height,
            comparable: c.comparable, raison: c.raison || null, differents: c.differents,
            part: c.part, ecart_max: c.ecart_max, ecart_moyen: c.ecart_moyen,
            pixels_non_identiques: c.pixels_non_identiques });
        }
        // Témoin : deux étapes voisines, rendues nativement, doivent différer.
        let temoin = null;
        if (natifs.length >= 2) {
          const t = comparer(natifs[natifs.length - 2], natifs[natifs.length - 1]);
          temoin = { comparable: t.comparable, differents: t.differents, part: t.part, raison: t.raison || null };
        }
        await p.evaluer(SCRIPTS.fermer, {});
        parNavigateur.comparaisons.push({ cle: comp.cle, titre: comp.titre, lignes, temoin });

        console.log('── ' + comp.titre);
        console.log('   ÉTAPE  TAILLE        PIXELS DIFFÉRENTS      ÉCART MAX   ÉCART MOYEN');
        lignes.forEach((l) => console.log('   ' + String(l.etape).padEnd(7)
          + (l.natif).padEnd(14)
          + (l.comparable ? (l.differents + ' (' + l.part + ' %)').padEnd(23) : ('non comparable : ' + l.raison).padEnd(23))
          + (l.comparable ? String(l.ecart_max).padEnd(12) + String(l.ecart_moyen) : '')));
        if (temoin) {
          console.log('   TÉMOIN deux étapes voisines, natives : '
            + (temoin.comparable ? temoin.differents + ' pixels différents (' + temoin.part + ' %)'
                 + (temoin.differents > 1000 ? '   ✓ la mesure voit' : '   ✗ LA MESURE EST AVEUGLE')
               : 'non comparable (' + temoin.raison + ')'));
        }
      }
    } catch (e) {
      console.log('   ÉCHEC : ' + String(e.message).slice(0, 220));
      parNavigateur.echec = String(e.message).slice(0, 300);
    } finally { await p.fermer(); }
    releve.push(parNavigateur);
  }
  serveur.close();

  // ── Planche, à partir de CES images ─────────────────────────────────────────────────────────
  const bloc = (nav) => '<h2>' + nav.navigateur + '</h2>'
    + (nav.echec ? '<p class="note">ÉCHEC : ' + nav.echec + '</p>' : '')
    + nav.comparaisons.map((c) => '<h3>' + c.titre + '</h3>'
        + '<table><thead><tr><th>Étape</th><th>Natif (ce navigateur)</th><th>SnapDOM (ce navigateur)</th><th>Écart</th></tr></thead><tbody>'
        + c.lignes.map((l) => '<tr><th>' + l.etape + '<br><span>' + l.stepId + '</span></th>'
            + '<td><img src="nettete-navigateurs/' + l.base + '-natif.png" alt="natif"><p>' + l.natif + '</p></td>'
            + '<td><img src="nettete-navigateurs/' + l.base + '-snapdom.png" alt="snapdom"><p>' + l.snapdom + '</p></td>'
            + '<td>' + (l.comparable
                ? '<img src="nettete-navigateurs/' + l.base + '-ecart.png" alt="écart"><p>'
                  + l.differents + ' pixels différents (' + l.part + ' %)<br>écart maximal ' + l.ecart_max
                  + ', moyen ' + l.ecart_moyen + '</p>'
                : '<p>non comparable : ' + l.raison + '</p>') + '</td></tr>').join('')
        + '</tbody></table>'
        + (c.temoin ? '<p class="note">Témoin, deux étapes voisines rendues nativement : '
            + (c.temoin.comparable ? c.temoin.differents + ' pixels différents (' + c.temoin.part + ' %)'
               : 'non comparable') + '.</p>' : '')).join('');
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
    + '<title>SnapDOM dans Safari et dans WebKit</title><style>'
    + 'body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:20px 24px 60px;background:#f6f2ea;color:#273331;}'
    + 'h1{font-size:19px;margin:0 0 4px;} h2{font-size:16px;margin:28px 0 6px;} h3{font-size:14px;margin:16px 0 6px;color:#556;}'
    + 'p.note{color:#667;font-size:13px;max-width:84ch;} table{border-collapse:collapse;margin-bottom:8px;}'
    + 'td,th{vertical-align:top;border:1px solid #c9c3b8;padding:8px;background:#fffdf9;}'
    + 'th{text-align:left;font-size:13px;} th span{font-weight:400;color:#667;font-size:12px;}'
    + 'td img{width:520px;height:auto;display:block;border:1px solid #e3ded3;} td p{margin:5px 0 0;font-size:11px;color:#667;}'
    + '</style></head><body><h1>SnapDOM dans Safari réel et dans WebKit</h1>'
    + '<p class="note"><strong>Toutes les images de cette planche ont été produites par le navigateur '
    + 'qui les titre</strong> — aucune ne vient de Chromium. La capture « natif » est prise par le '
    + 'pilote (WebDriver pour Safari, Playwright pour WebKit) ; la capture SnapDOM est exécutée dans '
    + 'ce même navigateur, sur la même scène, au même instant. Les vignettes font 520 px : '
    + '<strong>ouvrez une image dans un onglet pour juger à sa taille réelle.</strong></p>'
    + releve.map(bloc).join('') + '</body></html>';
  fs.writeFileSync(path.join(BANC, 'planche-nettete-navigateurs.html'), html, 'utf8');
  fs.writeFileSync(path.join(BANC, 'nettete-navigateurs.json'), JSON.stringify(releve, null, 1), 'utf8');
  console.log('');
  console.log('planche : ' + path.join(BANC, 'planche-nettete-navigateurs.html'));
  console.log('');
  console.log('  python3 -m http.server 8765 --directory ' + JSON.stringify(RACINE)
    + ' & sleep 1 && open -a Safari "http://127.0.0.1:8765/banc-chutier/planche-nettete-navigateurs.html"');
})().catch((e) => { console.error('ÉCHEC', e.message); process.exit(1); });
