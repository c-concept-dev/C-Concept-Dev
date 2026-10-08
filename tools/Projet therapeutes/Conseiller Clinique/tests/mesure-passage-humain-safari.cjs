// CE QU'UN HUMAIN VOIT APRÈS « OUVRIR DANS L'ESPACE DE TRAVAIL » PUIS « RÉDUIRE LE PANNEAU ».
//
// Christophe est tombé sur l'écran de connexion. Mon test 6/6 passait pourtant : il lisait le DOM
// SOUS l'écran (`boite.hidden === false`, et une écriture par script dans le champ), ce qui ne dit
// rien de ce qu'un œil atteint. Cette mesure-ci ne lit pas le DOM : elle demande au navigateur
// QUEL ÉLÉMENT se trouve sous le pointeur, et elle prend une capture d'écran.
//
//   NODE_PATH=<playwright> node tests/mesure-passage-humain-safari.cjs [?parametre]
//
// Avec un argument, il est ajouté à l'adresse (par exemple « atelier-local=1 »).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'banc-chutier', 'captures');
const PORT_WD = 7055;
const PORT_WEB = 8765;
const PARAM = process.argv[2] ? String(process.argv[2]).replace(/^\?/, '') : '';
const ENTREES = path.join(RACINE, 'banc-chutier', 'entrees');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(PORT_WEB, '127.0.0.1', () => ok(s));
  });
}

const DELAI = 90000;
async function wd(methode, chemin, corps) {
  const arret = new AbortController();
  const t = setTimeout(() => arret.abort(), DELAI);
  let r;
  try {
    r = await fetch('http://127.0.0.1:' + PORT_WD + chemin, {
      method: methode, headers: { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps), signal: arret.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('Safari n\'a pas répondu en ' + (DELAI / 1000) + ' s sur ' + methode + ' ' + chemin
        + ' — la session est probablement SUSPENDUE parce que la fenêtre pilotée a été touchée. '
        + 'Rien dans cette mesure n\'exige de mot de passe : si une fenêtre du système en demande un, arrêtez.');
    }
    throw e;
  } finally { clearTimeout(t); }
  const j = JSON.parse(await r.text());
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + String(j.value.message || '').slice(0, 200));
  return j && j.value;
}
const dire = (t) => process.stdout.write('   · ' + t + '\n');

// Ce que l'œil atteint, demandé au navigateur lui-même : elementFromPoint rend l'élément du
// DESSUS, celui qui recevrait le clic. C'est la seule lecture qui ne se laisse pas tromper par
// un élément présent dans le DOM mais recouvert.
const REGARDER = `
  var r = { url: location.href, parametre: location.search, hote: location.hostname };
  var ecran = document.getElementById('cc-login-screen');
  r.ecranConnexion = !ecran ? 'absent du balisage' : (function () {
    var s = getComputedStyle(ecran), b = ecran.getBoundingClientRect();
    return { display: s.display, zIndex: s.zIndex, couvre: Math.round(b.width) + 'x' + Math.round(b.height),
             visible: s.display !== 'none' && b.width > 0 && b.height > 0 };
  })();
  var au = function (x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var chaine = [], n = el;
    while (n && n !== document.body && chaine.length < 6) {
      chaine.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '')
        + (n.className && n.className.toString ? '.' + n.className.toString().trim().split(/\\s+/)[0] : ''));
      n = n.parentElement;
    }
    return chaine.join(' < ');
  };
  r.auCentre = au(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
  r.enHaut = au(Math.round(innerWidth / 2), 60);
  var champ = document.querySelector('[data-editor-narration]');
  r.champNarration = !champ ? 'absent du DOM' : (function () {
    var b = champ.getBoundingClientRect();
    var s = getComputedStyle(champ);
    var cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    var dessus = document.elementFromPoint(cx, cy);
    return {
      dansLeDOM: true,
      attributHidden: !!(champ.closest('.cc-editor-narration') || {}).hidden,
      display: s.display,
      rectangle: Math.round(b.width) + 'x' + Math.round(b.height) + ' en (' + Math.round(b.left) + ',' + Math.round(b.top) + ')',
      dansLaFenetre: b.width > 0 && b.height > 0 && b.top < innerHeight && b.bottom > 0,
      // LA QUESTION QUI COMPTE : si on cliquait au milieu du champ, qui recevrait le clic ?
      quiRecevraitLeClic: dessus ? (dessus.tagName.toLowerCase() + (dessus.id ? '#' + dessus.id : '')
        + (dessus.className && dessus.className.toString ? '.' + dessus.className.toString().trim().split(/\\s+/)[0] : '')) : null,
      atteintParLePointeur: dessus === champ || (dessus && champ.contains(dessus)),
    };
  })();
  var expo = document.getElementById('bc-telecharger');
  r.boutonTelecharger = !expo ? 'absent' : (function () {
    var b = expo.getBoundingClientRect();
    var d = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return { dansLaFenetre: b.width > 0 && b.height > 0, atteint: d === expo };
  })();
  return JSON.stringify(r);
`;

(async () => {
  const serveur = await servir();
  const fichierExport = fs.existsSync(ENTREES)
    ? fs.readdirSync(ENTREES).filter((x) => /\.html?$/i.test(x)).sort()[0] : null;
  const exportUrl = fichierExport
    ? 'http://127.0.0.1:' + PORT_WEB + '/banc-chutier/entrees/' + encodeURIComponent(fichierExport) : null;
  const url = 'http://127.0.0.1:' + PORT_WEB + '/banc-chutier/chutier.html' + (PARAM ? '?' + PARAM : '');
  fs.mkdirSync(SORTIE, { recursive: true });
  const suffixe = PARAM ? 'avec-parametre' : 'sans-parametre';
  dire('démarrage de safaridriver sur le port ' + PORT_WD);
  const pilote = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(PORT_WD)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  let s = null;
  try {
    const v = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
    s = v.sessionId;
    await wd('POST', '/session/' + s + '/timeouts', { script: 120000 });
    await wd('POST', '/session/' + s + '/window/rect', { x: 0, y: 0, width: 1600, height: 1100 });
    // UNE BOÎTE DE DIALOGUE DE LA PAGE BLOQUE TOUT : WebDriver refuse le moindre script tant
    // qu'un alert est ouvert, et rend « unexpected alert open ». La page en ouvre un à l'arrivée
    // (« Clé d'accès non configurée »), ce qui fait partie de ce qu'un humain voit : on la LIT,
    // on la note, puis on l'accepte.
    const dialogues = [];
    const draine = async () => {
      for (let i = 0; i < 6; i++) {
        let texte = null;
        try { texte = await wd('GET', '/session/' + s + '/alert/text'); } catch (e) { return; }
        if (texte === null || texte === undefined) return;
        const t = String(texte).replace(/\s+/g, ' ').trim();
        dialogues.push(t);
        dire('boîte de dialogue de la page : « ' + t.slice(0, 110) + ' »');
        try { await wd('POST', '/session/' + s + '/alert/accept', {}); } catch (e) { return; }
        await new Promise((r) => setTimeout(r, 300));
      }
    };
    dire('ouverture de ' + url);
    await wd('POST', '/session/' + s + '/url', { url });
    await draine();
    const executer = (script, args) => wd('POST', '/session/' + s + '/execute/sync', { script, args: args || [] });
    const capturer = async (nom) => {
      const b64 = await wd('GET', '/session/' + s + '/screenshot');
      const f = path.join(SORTIE, nom + '-' + suffixe + '.png');
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      dire('capture : ' + f);
      return f;
    };
    // On attend que la page du banc soit prête, sans rien cliquer à la main.
    await wd('POST', '/session/' + s + '/execute/async', {
      script: 'var cb = arguments[0], t0 = Date.now(); (function b() {'
            + ' if (document.getElementById("bc-atelier")) return cb(true);'
            + ' if (Date.now() - t0 > 30000) return cb(false); setTimeout(b, 100); })();', args: [] });

    const vues = {};
    await draine();
    vues.arrivee = JSON.parse(await executer(REGARDER));
    await capturer('1-arrivee');

    // LE CHEMIN EXACT DE CHRISTOPHE. « Ouvrir dans l'espace de travail » reste désactivé tant
    // qu'aucun document n'a été chargé : il est passé par « Charger un export HTML ». On emprunte
    // le MÊME gestionnaire — celui du champ de fichier — en lui donnant le fichier tel que le
    // sélecteur de fichiers le donnerait, plutôt qu'en activant le bouton à la main : activer le
    // bouton serait fabriquer un état que l'application n'atteint jamais ainsi.
    if (!exportUrl) throw new Error('aucun export HTML dans ' + ENTREES + ' — impossible de reproduire le chemin de Christophe.');
    dire('chargement de l\'export par le champ « Charger un export HTML »');
    await wd('POST', '/session/' + s + '/execute/async', {
      script: 'var cb = arguments[0], url = arguments[1];'
            + ' fetch(url).then(function (r) { return r.text(); }).then(function (t) {'
            + '   var dt = new DataTransfer();'
            + '   dt.items.add(new File([t], "export.html", { type: "text/html" }));'
            + '   var inp = document.getElementById("bc-export");'
            + '   inp.files = dt.files;'
            + '   inp.dispatchEvent(new Event("change", { bubbles: true }));'
            + '   cb("envoyé, " + t.length + " octets");'
            + ' }).catch(function (e) { cb("ÉCHEC " + e.message); });', args: [exportUrl] })
      .then((x) => dire(String(x)));
    await wd('POST', '/session/' + s + '/execute/async', {
      script: 'var cb = arguments[0], t0 = Date.now(); (function b() {'
            + ' var e = document.getElementById("bc-etat");'
            + ' if (e && /Export lu/.test(e.textContent)) return cb(true);'
            + ' if (Date.now() - t0 > 40000) return cb(false); setTimeout(b, 200); })();', args: [] });
    const actif = await executer('return document.getElementById("bc-atelier").disabled ? "DÉSACTIVÉ" : "actif";');
    dire('« Ouvrir dans l\'espace de travail » : ' + actif);

    dire('clic sur « Ouvrir dans l\'espace de travail »');
    await executer('document.getElementById("bc-atelier").click(); return 1;');
    await draine();
    await wd('POST', '/session/' + s + '/execute/async', {
      script: 'var cb = arguments[0], t0 = Date.now(); (function b() {'
            + ' var e = document.getElementById("bc-etat");'
            + ' if (e && /espace de travail/.test(e.textContent)) return cb(true);'
            + ' if (Date.now() - t0 > 40000) return cb(false); setTimeout(b, 200); })();', args: [] });
    // Sélectionner une étape, comme Christophe le ferait en cliquant une diapositive.
    await executer('var d = window._adocArtifacts["banc"]._adocStructuredDoc;'
      + ' var e = window.adocPresentStepList(d)[0];'
      + ' var el = document.getElementById(e.stepId) || document.getElementById("root:card-title:" + e.cardId);'
      + ' if (el) el.click(); return 1;');
    await draine();
    vues.espaceOuvert = JSON.parse(await executer(REGARDER));
    await capturer('2-espace-ouvert');

    dire('clic sur « Réduire le panneau »');
    await executer('document.getElementById("bc-reduire").click(); return 1;');
    await new Promise((r) => setTimeout(r, 600));
    await draine();
    vues.panneauReduit = JSON.parse(await executer(REGARDER));
    const derniere = await capturer('3-panneau-reduit');

    console.log('\nCE QU\'UN HUMAIN VOIT — Safari réel, ' + (PARAM ? 'avec « ' + PARAM + ' »' : 'sans paramètre'));
    console.log('  adresse : ' + url + '\n');
    for (const [nom, v] of Object.entries(vues)) {
      console.log('  — ' + nom.toUpperCase());
      console.log('    écran de connexion : ' + (typeof v.ecranConnexion === 'string' ? v.ecranConnexion
        : (v.ecranConnexion.visible ? 'VISIBLE, ' + v.ecranConnexion.couvre + ', z-index ' + v.ecranConnexion.zIndex
           : 'masqué (display:' + v.ecranConnexion.display + ')')));
      console.log('    au centre de la fenêtre : ' + v.auCentre);
      console.log('    en haut de la fenêtre   : ' + v.enHaut);
      const c = v.champNarration;
      console.log('    champ Narration : ' + (typeof c === 'string' ? c
        : 'dans le DOM, hidden=' + c.attributHidden + ', ' + c.rectangle
          + '\n                      qui recevrait le clic : ' + c.quiRecevraitLeClic
          + '\n                      ATTEINT PAR LE POINTEUR : ' + (c.atteintParLePointeur ? 'OUI' : 'NON')));
      console.log('');
    }
    console.log('  dernière capture : ' + derniere);
    console.log('  boîtes de dialogue rencontrées : ' + (dialogues.length
      ? '\n    · ' + dialogues.map((t) => t.slice(0, 160)).join('\n    · ') : 'aucune'));
  } finally {
    if (s) { try { await wd('DELETE', '/session/' + s); } catch (e) {} }
    pilote.kill();
    serveur.close();
  }
})().catch((e) => { console.error('ÉCHEC : ' + e.message); process.exit(1); });
