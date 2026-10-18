// LE CONVERTISSEUR AUTONOME, ÉPROUVÉ EN file:// AVEC LE RÉSEAU COUPÉ (lot 2C).
//
// CE QUE CE CONTRÔLE PROUVE, ET COMMENT. Il ouvre le fichier unique par son adresse `file://`,
// REFUSE toute requête qui n'est pas `file:`, `data:` ou `blob:` — donc coupe le réseau pour de
// bon —, dépose l'export HTML d'une présentation par un VRAI glisser-déposer, attend le rendu,
// clique le zip, et relit le fichier téléchargé avec `zipfile` de Python et `unzip -t`.
//
// Si quelque chose dans la page avait encore besoin d'un voisin ou du réseau, il échouerait ici.
//
//   NODE_PATH=<playwright> node tests/verify-convertisseur-autonome.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const RACINE_ZIP = 'images-presentation-par-etape';
const EXPORT_ESSAI = path.join(RACINE, 'banc-chutier', 'export-pour-essai.html');

function lireLeZip(fichier) {
  const programme = `
import json, hashlib, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
out = {"mauvais": z.testzip(), "entrees": []}
for i in z.infolist():
    d = z.read(i.filename)
    out["entrees"].append({"nom": i.filename, "octets": len(d), "methode": i.compress_type,
                           "sha256": hashlib.sha256(d).hexdigest()})
print(json.dumps(out))
`;
  return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-c', programme, fichier],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  // Le banc d'abord (le convertisseur en est tiré), puis l'export d'essai, puis le fichier unique.
  execFileSync(process.execPath, [path.join(__dirname, 'forger-banc-chutier.cjs')], { stdio: 'pipe' });
  if (!fs.existsSync(EXPORT_ESSAI)) {
    execFileSync(process.execPath, [path.join(__dirname, 'forger-presentation-essai.cjs')], { stdio: 'pipe' });
  }
  assert.ok(fs.existsSync(EXPORT_ESSAI), 'il faut un export de présentation à déposer');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'convertisseur-'));
  const fichierUnique = path.join(temp, 'convertisseur-images.html');
  execFileSync(process.execPath,
    [path.join(__dirname, 'forger-convertisseur-autonome.cjs'), fichierUnique], { stdio: 'pipe' });
  const octets = fs.statSync(fichierUnique).size;

  // ── CE QUE LE FICHIER PORTE, ET CE QU'IL CHARGE : DEUX QUESTIONS DIFFÉRENTES ──────────
  //
  // J'avais d'abord cherché des balises survivantes dans le TEXTE du fichier. Mauvaise idée, et
  // le contrôle l'a montré : le cœur du Studio contient des balises dans ses CHAÎNES, parce
  // qu'il fabrique lui-même des exports HTML. Un fichier qui contient le texte
  // `<link href="... googleFontsHref ...">` dans une chaîne ne charge rien du tout.
  //
  // CE QUI SE MESURE, c'est ce que la page DEMANDE. Toutes les requêtes sont donc comptées plus
  // bas, et la seule admise est le fichier lui-même : un voisin encore désigné se verrait comme
  // une seconde requête `file:`, et le réseau comme une requête refusée.
  //
  // Cette première passe garde ce qui reste décidable sur le texte, et rien d'autre : la
  // corruption qu'elle a déjà trouvée une fois (chaque `$&` d'ajv remplacé par la balise
  // elle-même, six morceaux de la bibliothèque détruits) se reconnaît à la balise RECOLLÉE au
  // milieu d'une expression régulière.
  const source = fs.readFileSync(fichierUnique, 'utf8');
  const recollees = source.match(/\[[^\]]{0,40}<script src="[^"]*"><\/script>/g) || [];
  assert.deepEqual(recollees, [],
    'une balise recollée au milieu d\'une classe de caractères signe la corruption par `$&` : '
    + JSON.stringify(recollees.slice(0, 2)));
  assert.ok(source.indexOf('window.snapdom =') > 0,
    'SnapDOM doit être mis en ligne et posé sur window');
  assert.ok(source.indexOf('mis en ligne : aucun fichier voisin') > 0,
    'les cinq scripts voisins doivent être mis en ligne');
  pass('fichier unique de ' + (octets / 1048576).toFixed(2)
    + ' Mo : SnapDOM et les cinq scripts en ligne, aucune balise recollée.');

  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const ctx = await nav.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const erreurs = [];
    const horsFichier = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
    // ── LE RÉSEAU EST COUPÉ POUR DE BON ────────────────────────────────────────────────────
    const demandes = [];
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('file:')) { demandes.push(u); return route.continue(); }
      if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      horsFichier.push(u);
      return route.abort();
    });
    // La page du banc s'ouvre avec ce paramètre — c'est ce que fait le lanceur, et c'est ce
    // qui installe le panneau par-dessus l'application. Sans lui, le panneau reste masqué.
    await page.goto('file://' + fichierUnique + '?atelier-local=1');
    // C'est l'ÉCRAN MINIMAL qu'on attend, pas le panneau du moteur : celui-ci est replié par
    // construction, et l'attendre visible serait exiger que le nettoyage n'ait pas eu lieu.
    await page.waitForSelector('#cv-ecran', { timeout: 30000 });
    await page.waitForSelector('#banc-chutier', { state: 'attached', timeout: 30000 });
    await page.waitForFunction(() => typeof window.AtelierImages === 'object', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.snapdom === 'function', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.ZipStocke === 'object', { timeout: 30000 });
    pass('ouvert en file:// : le panneau s\'installe, le moteur, SnapDOM et l\'écrivain de zip sont là.');

    // ── ON ATTEND QUE L'APPLICATION AIT FINI DE SE PEINDRE AVANT DE REGARDER ─────────────
    // Mesuré : le premier relevé voyait « Importer une charte » et « Déposer ou cliquer » comme
    // cliquables, alors que le masque les rend bien invisibles — le relevé passait simplement
    // AVANT que l'application ait posé sa page d'accueil. Un écran se juge quand il a fini de
    // s'afficher, pas pendant.
    await page.waitForSelector('#cc-landing', { state: 'attached', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => (document.fonts && document.fonts.ready) || true);
    await page.waitForTimeout(1500);

    // ── LES DEUX POLICES EMBARQUÉES CHARGENT-ELLES VRAIMENT ? ────────────────────────────
    //
    // C'est ce qui décide du message orange. Tant qu'elles ne chargent pas, le texte des images
    // sort dans les polices du système et le convertisseur ne rend pas la typographie dont le
    // lot 2 a mesuré la fidélité. Le témoin ne peut pas être « la règle @font-face est là » :
    // il faut que le navigateur DISE qu'il a la police, et qu'une largeur de texte le confirme.
    const polices = await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const mesurer = (famille) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:-9999px;font-size:60px;font-weight:600;'
          + 'white-space:nowrap;font-family:' + famille;
        d.textContent = 'Respirer avant de parler';
        document.body.appendChild(d);
        const l = d.getBoundingClientRect().width;
        d.remove();
        return l;
      };
      return {
        plexDeclaree: document.fonts.check('600 16px "IBM Plex Sans"'),
        serifDeclaree: document.fonts.check('600 16px "Source Serif 4"'),
        plex: mesurer('"IBM Plex Sans", monospace'),
        serif: mesurer('"Source Serif 4", monospace'),
        repli: mesurer('monospace'),
        avis: (document.getElementById('cv-polices-avis').textContent || '').trim(),
      };
    });
    assert.ok(polices.plexDeclaree, 'le navigateur doit déclarer IBM Plex Sans chargée');
    assert.ok(polices.serifDeclaree, 'le navigateur doit déclarer Source Serif 4 chargée');
    // ET LE TÉMOIN QUI NE SE CONTENTE PAS D'UNE DÉCLARATION : la largeur du même texte DIFFÈRE
    // de celle du repli. Sans cela, « chargée » pourrait n'être qu'un nom enregistré.
    assert.ok(Math.abs(polices.plex - polices.repli) > 5,
      'IBM Plex Sans doit mesurer autrement que le repli : ' + polices.plex + ' contre '
      + polices.repli);
    assert.ok(Math.abs(polices.serif - polices.repli) > 5,
      'Source Serif 4 doit mesurer autrement que le repli : ' + polices.serif + ' contre '
      + polices.repli);
    assert.equal(polices.avis, '',
      'les polices étant chargées, l\'avis orange ne doit PLUS être affiché : « '
      + polices.avis + ' »');
    console.log('      polices : « Respirer avant de parler » en 60 px fait ' + Math.round(polices.plex)
      + ' px en Plex, ' + Math.round(polices.serif) + ' px en Source Serif, '
      + Math.round(polices.repli) + ' px en repli — l\'avis orange est retiré');
    pass('les deux polices embarquées chargent et mesurent autrement que le repli ; '
      + 'l\'avis orange disparaît.');

    // ── CE QUE LA PAGE MONTRE À L'OUVERTURE, ET RIEN DE PLUS ──────────────────────────────
    //
    // LA LISTE EST EXHAUSTIVE ET VIENT DE LA CAPTURE DE CHRISTOPHE SUR SAFARI RÉEL : ce sont les
    // contrôles du moteur qu'il voyait et dont il ne veut pas à l'ouverture. Aucun ne doit être
    // VISIBLE ; aucun n'est SUPPRIMÉ — « Réglages avancés » les rend tous, et le dernier contrôle
    // de ce fichier le vérifie.
    const avances = {
      'mode capture': '#bc-mode-capture', 'réglage de scène': '#bc-reglage',
      'plancher de lisibilité': '#bc-plancher', 'masquer citations et sources': '#bc-sans-citations',
      'Rendre les images': '#bc-rendre', 'Rendre les trois': '#bc-tout',
      'Télécharger en JPEG': '#bc-jpeg', 'Planche à l\'œil': '#bc-planche',
      'Modifier un texte et revérifier': '#bc-perime',
      'Utiliser la présentation ouverte': '#bc-ouverte',
      'Charger un JSON': '#bc-fichier', 'Charger un export HTML': '#bc-export',
      'Ouvrir dans l\'espace de travail': '#bc-atelier',
      'Télécharger le document de travail': '#bc-telecharger',
      'Réduire le panneau': '#bc-reduire', 'Relevé à renvoyer': '#bc-releve',
      'zip du banc': '#bc-zip', 'liste des présentations': '#bc-presentation',
    };
    const visibles = await page.evaluate((sel) => {
      const out = {};
      Object.keys(sel).forEach((nom) => {
        const e = document.querySelector(sel[nom]);
        if (!e) { out[nom] = 'absent du document'; return; }
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        out[nom] = (r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none')
          ? 'VISIBLE' : 'replié';
      });
      return out;
    }, avances);
    const fautifs = Object.keys(visibles).filter((n) => visibles[n] === 'VISIBLE');
    assert.deepEqual(fautifs, [],
      'aucun contrôle avancé ne doit être visible à l\'ouverture : ' + JSON.stringify(fautifs));
    const absents = Object.keys(visibles).filter((n) => visibles[n] === 'absent du document');
    assert.deepEqual(absents, [],
      'et aucun ne doit avoir été SUPPRIMÉ du moteur : ' + JSON.stringify(absents));

    // ── CE QUI EST VISIBLE, ET QUI EST TOUT CE QUI DOIT L'ÊTRE ───────────────────────────
    const ecran = await page.evaluate(() => {
      const vu = (s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        // Les blancs sont normalisés : le texte d'un bloc HTML porte les sauts de ligne de la
        // source, et une assertion qui les compte mesurerait ma mise en page, pas l'écran.
        return (r.width > 0 && r.height > 0)
          ? (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
      };
      // Tout ce qui est cliquable et visible, pour que « rien d'autre » soit une mesure.
      const cliquables = [...document.querySelectorAll('button,a,select,input,[onclick]')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const st = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
        })
        .map((e) => (e.id || e.tagName.toLowerCase()) + ':' + (e.textContent || e.value || '').trim().slice(0, 28));
      return { titre: vu('#cv-ecran h1'), zone: vu('#cv-zone'), json: vu('#cv-zone-json'),
               png: vu('#cv-png'), jpeg: vu('#cv-jpeg'), zip: vu('#cv-zip'),
               zipActif: !document.querySelector('#cv-zip').disabled,
               avancement: !!vu('#cv-avancement'), cliquables };
    });
    assert.equal(ecran.titre, 'Images de la présentation', 'le titre : ' + ecran.titre);
    assert.match(ecran.zone, /Glissez ici l’export de votre présentation \(fichier \.html\)/,
      'la zone de dépôt : ' + ecran.zone);
    assert.match(ecran.json, /document de travail \(\.json\)/, 'la ligne du .json : ' + ecran.json);
    assert.equal(ecran.png, 'PNG', 'le bouton PNG : ' + ecran.png);
    assert.equal(ecran.jpeg, 'JPEG', 'le bouton JPEG : ' + ecran.jpeg);
    assert.match(ecran.zip, /Télécharger le zip/, 'le bouton du zip : ' + ecran.zip);
    assert.equal(ecran.zipActif, false, 'le bouton du zip est inactif avant tout rendu');
    assert.equal(ecran.avancement, false, 'aucune progression avant le dépôt');
    // PNG PAR DÉFAUT, lu sur le réglage du moteur et non sur la couleur du bouton.
    assert.equal(await page.inputValue('#bc-format'), 'image/png',
      'PNG doit être le format par défaut');
    // RIEN D'AUTRE DE CLIQUABLE que l'écran, « Aide » et « Réglages avancés ».
    const permis = ['cv-zone', 'cv-zone-json', 'cv-png', 'cv-jpeg', 'cv-zip', 'cv-aide', 'cv-avances'];
    const enTrop = ecran.cliquables.filter((c) => permis.indexOf(c.split(':')[0]) < 0);
    assert.deepEqual(enTrop, [],
      'rien d\'autre ne doit être cliquable à l\'ouverture : ' + JSON.stringify(enTrop));
    console.log('      visible : titre, zone de dépôt, .json, PNG/JPEG, zip inactif, Aide, Réglages avancés');
    console.log('      replié  : ' + Object.keys(avances).length + ' contrôles du moteur, aucun supprimé');
    pass('à l\'ouverture : ' + Object.keys(avances).length + ' contrôles avancés repliés, '
      + ecran.cliquables.length + ' éléments cliquables, PNG par défaut.');

    // ── LE GLISSER-DÉPOSER, POUR DE VRAI ──────────────────────────────────────────────────
    // On fabrique un DataTransfer dans la page avec les octets du fichier, et on envoie un vrai
    // événement `drop` sur la fenêtre : c'est le geste de Christophe, pas un raccourci par
    // l'entrée de fichier cachée.
    const contenu = fs.readFileSync(EXPORT_ESSAI, 'utf8');
    await page.evaluate(({ nom, texte }) => {
      const f = new File([texte], nom, { type: 'text/html' });
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { nom: path.basename(EXPORT_ESSAI), texte: contenu });
    await page.waitForFunction(() => /étapes|etapes/.test(document.getElementById('bc-etat').textContent),
      { timeout: 60000 });
    // ── LE RENDU DÉMARRE TOUT SEUL : aucun autre clic, et le bouton du zip s'active ───────
    await page.waitForFunction(() => !document.querySelector('#cv-zip').disabled, { timeout: 300000 });
    const apresRendu = await page.evaluate(() => ({
      zip: document.querySelector('#cv-zip').textContent.trim(),
      vignettes: document.querySelectorAll('#cv-vignettes figure').length,
      legende: (document.querySelector('#cv-vignettes figcaption') || {}).textContent,
      message: (document.querySelector('#cv-message').style.display !== 'none')
        ? document.querySelector('#cv-message').textContent.trim() : '',
      avancement: (document.querySelector('#cv-avancement-texte') || {}).textContent,
    }));
    assert.match(apresRendu.zip, /^Télécharger le zip \(\d+ images?\)$/,
      'le bouton du zip doit porter le compte : ' + apresRendu.zip);
    // (V2) LES VIGNETTES, avec diapositive, étape et titre.
    assert.ok(apresRendu.vignettes > 0, 'des vignettes doivent apparaître : ' + apresRendu.vignettes);
    assert.match(apresRendu.legende, /diapositive \d+, étape \d+ sur \d+/,
      'chaque vignette dit sa diapositive et son étape (V2) : ' + apresRendu.legende);
    console.log('      après dépôt, sans autre clic : ' + apresRendu.zip + ' · '
      + apresRendu.vignettes + ' vignettes · « ' + (apresRendu.legende || '').slice(0, 60) + ' »');
    // LE NOMBRE D'ÉTAPES VIENT DU MOTEUR, pas d'un message que le rendu a déjà remplacé :
    // l'enchaînement automatique est si rapide que « Export lu … N étapes » n'est plus à
    // l'écran quand on le lit. On prend donc le compte que le moteur ANNONCE, et on vérifie
    // qu'il y a bien une image par étape (V1).
    const compte = await page.evaluate(() => {
      const d = window.__chutier.dernier();
      return { annoncees: d.res.etapes_annoncees, images: d.res.images.length };
    });
    assert.ok(compte.annoncees > 0, 'le moteur doit annoncer des étapes : ' + JSON.stringify(compte));
    assert.equal(compte.images, compte.annoncees,
      'une image par étape (V1) : ' + compte.images + ' pour ' + compte.annoncees);
    const nbEtapes = compte.annoncees;
    pass('glisser-déposer d\'un export HTML : rendu déclenché SANS autre clic, '
      + nbEtapes + ' étapes, ' + compte.images + ' images.');

    // ── LE RENDU, PUIS LE ZIP ─────────────────────────────────────────────────────────────
    const rendu = await page.evaluate(() => {
      const d = window.__chutier.dernier();
      return { images: d.res.images.length, largeurs: [...new Set(d.res.images.map((i) => i.largeur))],
               coupes: d.res.images.filter((i) => i.coupe_px > 0).length };
    });
    assert.equal(rendu.images, nbEtapes,
      'une image par étape : ' + rendu.images + ' pour ' + nbEtapes + ' étapes');
    assert.deepEqual(rendu.largeurs, [1920], 'toutes à 1920 de large (V1) : ' + rendu.largeurs);
    assert.equal(rendu.coupes, 0, 'aucune image plus courte que son contenu (V8) : ' + rendu.coupes);

    const recus = [];
    page.on('download', async (d) => {
      const dest = path.join(temp, d.suggestedFilename());
      await d.saveAs(dest);
      recus.push({ nom: d.suggestedFilename(), chemin: dest });
    });
    // LE ZIP PAR LE GROS BOUTON DE L'ÉCRAN, pas par celui du moteur.
    await page.click('#cv-zip');
    await page.waitForFunction(() => /zip (écrit|ecrit)/i.test(document.getElementById('bc-etat').textContent),
      { timeout: 300000 });
    await page.waitForTimeout(1000);
    assert.equal(recus.length, 1, 'un zip attendu : ' + JSON.stringify(recus.map((r) => r.nom)));

    const t = execFileSync('/usr/bin/unzip', ['-t', recus[0].chemin], { encoding: 'utf8' });
    assert.match(t, /No errors detected/, 'unzip -t : ' + t);
    const lu = lireLeZip(recus[0].chemin);
    assert.equal(lu.mauvais, null, 'tous les CRC doivent être exacts');
    assert.equal(lu.entrees.length, rendu.images + 1,
      'une image par étape plus index.csv : ' + lu.entrees.length);
    assert.ok(lu.entrees.every((e) => e.nom.indexOf(RACINE_ZIP + '/') === 0),
      'tout est dans le dossier racine');
    assert.ok(lu.entrees.filter((e) => e.nom.endsWith('.jpg'))
      .every((e, i, a) => i === 0 || a[i - 1].nom < e.nom), 'les noms sont triés dans l\'ordre');
    pass('rendu de ' + rendu.images + ' images à 1920, puis zip valide de ' + lu.entrees.length
      + ' entrées, téléchargé depuis file://.');

    // ── ET RIEN N'A TOUCHÉ LE RÉSEAU, D'UN BOUT À L'AUTRE ────────────────────────────────
    assert.deepEqual(horsFichier, [],
      'aucune requête hors file: ne doit partir, du chargement au zip : ' + JSON.stringify(horsFichier));
    // ── ET AUCUN VOISIN N'EST DEMANDÉ : une seule requête `file:`, le fichier lui-même ────
    // C'est la mesure qui remplace la lecture du texte : si un script, une feuille ou un module
    // était encore désigné, il apparaîtrait ici.
    const voisinsDemandes = demandes.filter((u) => u.split('?')[0] !== 'file://' + fichierUnique);
    assert.deepEqual(voisinsDemandes, [],
      'le fichier ne doit demander AUCUN voisin : ' + JSON.stringify(voisinsDemandes));
    // ── ET LA PAGE A NEUTRALISÉ ELLE-MÊME CE QUE L'APPLICATION TENTAIT ──────────────────
    // « Aucune connexion » doit être vrai PAR LE FICHIER, pas grâce au refus du contrôle : la
    // garde posée avant le cœur compte ce qu'elle a arrêté, et c'est ce compteur qu'on lit.
    const neutralises = await page.evaluate(() => window.__reseauNeutralise || null);
    assert.ok(Array.isArray(neutralises),
      'la garde réseau doit être installée et compter ce qu\'elle refuse');
    console.log('      requêtes file: : ' + demandes.length + ' (le fichier lui-même) · hors '
      + 'file: parvenues au contrôle : ' + horsFichier.length + ' · neutralisées par la page : '
      + neutralises.length + (neutralises.length ? ' (' + neutralises
        .map((u) => u.replace(/^https?:\/\//, '').split('/')[0]).filter((v, i, a) => a.indexOf(v) === i)
        .join(', ') + ')' : ''));
    const graves = erreurs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
    assert.deepEqual(graves, [], 'aucune erreur de page : ' + JSON.stringify(graves.slice(0, 4)));
    console.log('      zip : ' + recus[0].nom + ', '
      + Math.round(fs.statSync(recus[0].chemin).size / 1024) + ' Ko');
    pass('zéro requête réseau et zéro erreur de page, du double-clic au zip.');
    // ── 7. UN FICHIER QUI N'EST PAS UN EXPORT : UNE ERREUR CLAIRE, ET RIEN D'AUTRE ───────
    const avantFaute = recus.length;
    await page.evaluate(() => {
      const f = new File(['ceci est un texte, pas un export'], 'notes.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => {
      const m = document.getElementById('cv-message');
      return m.style.display !== 'none' && /n’est pas un export/.test(m.textContent);
    }, { timeout: 20000 });
    const msgFaute = (await page.textContent('#cv-message')).replace(/\s+/g, ' ').trim();
    assert.match(msgFaute, /fichier \.html/, 'le message doit dire quoi déposer : ' + msgFaute);
    assert.equal(recus.length, avantFaute, 'et rien ne doit être téléchargé');
    console.log('      fichier fautif : « ' + msgFaute.slice(0, 110) + ' »');
    pass('un fichier qui n\'est pas un export donne une erreur claire, et rien n\'est téléchargé.');

    // ── 8. LE .JSON APRÈS COUP : LA NARRATION EST JOINTE, SANS REFAIRE LE RENDU ──────────
    const avantJson = await page.evaluate(() => ({
      images: window.__chutier.dernier().res.images.length,
      signature: window.__chutier.dernier().res.images[0].signature,
    }));
    const docNarre = await page.evaluate(() => {
      const d = window.__chutier.dernier();
      const doc = JSON.parse(JSON.stringify(d.p.doc));
      const etapes = window.adocPresentStepList(doc);
      doc.narration = etapes.map((e, i) => ({ stepId: e.stepId,
        text: 'Commentaire ' + (i + 1) + ' de cette etape, ecrit pour le controle.' }));
      return doc;
    });
    const jsonNarre = path.join(temp, 'document-narre.json');
    fs.writeFileSync(jsonNarre, JSON.stringify(docNarre));
    await page.evaluate(({ nom, texte }) => {
      const f = new File([texte], nom, { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { nom: 'document-narre.json', texte: JSON.stringify(docNarre) });
    await page.waitForFunction(() => /narration jointe/.test(
      document.getElementById('cv-narration-etat').textContent), { timeout: 20000 });
    const apresJson = await page.evaluate(() => ({
      images: window.__chutier.dernier().res.images.length,
      signature: window.__chutier.dernier().res.images[0].signature,
      etat: document.getElementById('cv-narration-etat').textContent.trim(),
    }));
    // LE RENDU N'A PAS ÉTÉ REFAIT : mêmes images, même signature de contenu.
    assert.equal(apresJson.images, avantJson.images, 'le dépôt du .json ne refait pas le rendu');
    assert.equal(apresJson.signature, avantJson.signature,
      'et les images sont les mêmes, à la signature près : ' + apresJson.signature);
    assert.match(apresJson.etat, /narration jointe \(\d+ étapes\)/, apresJson.etat);
    // ET LE ZIP QUI SUIT PORTE LA NARRATION.
    await page.click('#cv-zip');
    await page.waitForFunction(() => /narration incluse/.test(
      document.getElementById('bc-etat').textContent), { timeout: 120000 });
    await page.waitForTimeout(800);
    const zipNarre = recus[recus.length - 1];
    const luNarre = lireLeZip(zipNarre.chemin);
    const aNarration = luNarre.entrees.some((e) => e.nom.endsWith('narration.txt'));
    assert.ok(aNarration, 'le zip doit porter narration.txt : '
      + JSON.stringify(luNarre.entrees.map((e) => e.nom)));
    console.log('      ' + apresJson.etat + ' · zip avec narration.txt, '
      + luNarre.entrees.length + ' entrées');
    pass('le .json déposé après coup joint la narration sans refaire le rendu, et le zip la porte.');

  } finally {
    await nav.close();
  }
  console.log('\nPASS verify-convertisseur-autonome — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
