// LOT 1b — « RÉDIGER LA NARRATION » : le moteur et l'interface, sans UN SEUL appel réel.
//
// Le transport est injecté. Huit réponses de fixture éprouvent le contrat ; l'interface est
// éprouvée sur CE QUE LA PAGE AFFICHE (textContent, état des boutons, contenu du document),
// jamais sur les nombres que le code déclare à son propre sujet — c'est la leçon du 7 octobre.
//
//   NODE_PATH=<playwright> node tests/verify-narration-ia.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const { PRESENTATION } = require('./narration-ia-fixtures.cjs');

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
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const { serveur, port } = await servir();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message)));
    page.on('dialog', (d) => d.accept());
    // Le réseau est coupé vers tout ce qui n'est pas notre serveur, et chaque tentative est
    // notée. L'application en fait trois au démarrage (polices, CDN, Worker) : ce n'est PAS ce
    // qu'on mesure ici. Ce qu'on mesure, c'est qu'AUCUNE sortie n'est causée par la rédaction.
    const sorties = [];
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' && u.port === String(port)) return route.continue();
      sorties.push(u.hostname);
      return route.abort();
    });
    // L'ÉCRAN DE CONNEXION couvre toute la page tant qu'aucune clé n'est en mémoire locale, et
    // il intercepterait les clics de l'interface. On simule l'état CONNECTÉ par le mécanisme réel
    // de l'application — une clé en localStorage — et non en retirant l'écran du DOM : c'est ce
    // que vit Christophe sur son site. La valeur n'a aucune importance, puisque tout le réseau
    // est coupé dans ce test (contrôle 16) ; aucun appel ne peut l'employer.
    await page.addInitScript(() => {
      try { localStorage.setItem('workerApiKey', 'cle-de-test-sans-valeur'); } catch (e) {}
    });
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.NarrationIA === 'object'
      && typeof window.adocPresentStepList === 'function'
      && typeof window.adocNarrationCount === 'function'
      && typeof window.adocValidateSchema === 'function'
      && typeof window.NarrationIA.brancher === 'function');
    const DOC = PRESENTATION;   // « Quand le silence s'installe » : 3 diapositives, 8 étapes

    // ── 0. La fixture est valide pour le VRAI schéma ─────────────────────────────────────────
    // Sans cela, tout ce qui suit mesurerait le comportement sur un document que l'application
    // refuserait.
    const schema = await page.evaluate((d) => {
      const r = window.adocValidateSchema('clinicalDocument', d);
      return { valid: !!r.valid, skipped: !!r.skipped, erreurs: (r.errors || []).slice(0, 3).map(String) };
    }, DOC);
    assert.equal(schema.skipped, false, 'AJV doit être actif');
    assert.equal(schema.valid, true, 'fixture invalide : ' + schema.erreurs.join(' | '));
    pass('la présentation d\'essai valide contre le schéma réel.');

    // ── 1. Le module est séparé et ne touche à rien tant qu'on ne l'appelle pas ──────────────
    const surface = await page.evaluate(() => Object.keys(window.NarrationIA).sort());
    assert.ok(surface.includes('rediger') && surface.includes('promptSysteme')
      && surface.includes('validerReponse') && surface.includes('repartirMots'),
      'surface du module : ' + surface.join(','));
    pass('module narration-ia.js chargé, ' + surface.length + ' points d\'entrée exposés.');

    // ── 2. LE COMPTE DES MOTS ignore les marques de pause, qui ne sont pas dites ─────────────
    const mots = await page.evaluate(() => {
      const A = window.NarrationIA;
      return {
        simple: A.compterMots('Imaginez un couple où personne ne parle d’argent.'),
        avecPause: A.compterMots('Imaginez un couple [pause] où personne ne parle. [pause 2 s]'),
        memeTexte: A.compterMots('Imaginez un couple où personne ne parle.'),
        apostrophe: A.compterMots('C’est l’argent qui parle, aujourd’hui.'),
        vide: A.compterMots(''),
        duree: Math.round(A.dureeSecondes('un deux trois quatre cinq') * 10) / 10,
        // La vérification qui compte : les deux compteurs sont-ils le MÊME ?
        // La DÉLÉGATION, prouvée par espionnage : deux implémentations qui donnent le même
        // résultat aujourd'hui restent deux vérités qui divergeront demain. Ce qu'il faut
        // établir, c'est que le module APPELLE le compteur du lot 1a.
        delegue: (() => {
          const vrai = window.adocNarrationCount;
          let appels = 0;
          window.adocNarrationCount = (t) => { appels++; return vrai(t); };
          try { A.compterMots('un deux trois'); } finally { window.adocNarrationCount = vrai; }
          return appels;
        })(),
        memeCompteurQueLot1a: ['Imaginez un couple [pause] qui se tait. [pause 2 s] Vraiment.',
          'C’est l’argent qui parle.', '', 'Un seul mot']
          .every((t) => A.compterMots(t) === window.adocNarrationCount(t).mots),
      };
    });
    assert.equal(mots.avecPause, mots.memeTexte,
      'les marques de pause ne doivent pas compter : ' + mots.avecPause + ' vs ' + mots.memeTexte);
    assert.equal(mots.simple, 8, 'huit mots attendus : ' + mots.simple);
    // « C'est l'argent qui parle, aujourd'hui. » = 5 unités séparées par des espaces :
    // l'apostrophe ne coupe donc PAS un mot. C'est la règle du lot 1a, et le module emploie
    // la sienne — c'est ce que vérifie `memeCompteurQueLot1a` ci-dessous.
    assert.equal(mots.apostrophe, 5, 'l’apostrophe ne coupe pas un mot : ' + mots.apostrophe);
    assert.equal(mots.memeCompteurQueLot1a, true,
      'le module et le champ du lot 1a doivent compter EXACTEMENT pareil');
    assert.equal(mots.delegue, 1,
      'le module doit APPELER adocNarrationCount, pas en recopier la logique : '
      + mots.delegue + ' appel(s) observé(s)');
    assert.equal(mots.vide, 0);
    assert.equal(mots.duree, 2, 'cinq mots à 2,5 mots/s font 2 s : ' + mots.duree);
    pass('compte des mots : apostrophes liées, marques de pause ignorées, durée = mots / 2,5.');

    // ── 3. RÉPARTITION DES MOTS : total, prorata, bornes, redistribution ─────────────────────
    const rep = await page.evaluate((d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 10);
      const tenable = A.repartirMots(etapes, 4);
      // 0,5 min = 75 mots pour 8 étapes, soit moins que 8 x 15 : le plancher mord partout.
      // (1 minute ne suffit pas : 150 mots passent encore au-dessus de 8 x 15 = 120.)
      const serre = A.repartirMots(etapes, 0.5);
      const large = A.repartirMots(etapes, 60);     // force le plafond
      return { etapes: etapes.length, r, tenable, serre, large,
               min: A.MOTS_MIN_ETAPE, max: A.MOTS_MAX_ETAPE };
    }, DOC);
    assert.equal(rep.r.total_vise, 10 * 60 * 2.5, 'total = durée × 60 × 2,5');
    // Sur cette fixture, 8 étapes plafonnées à 120 mots ne portent que 960 mots : 10 min n'est
    // PAS atteignable, et le moteur doit le dire au lieu de livrer 6,4 min en silence.
    assert.equal(rep.r.atteignable, false, 'le moteur doit signaler que 10 min est hors d\'atteinte');
    assert.equal(rep.r.limite, 'plafond');
    assert.equal(rep.r.total_reparti, rep.etapes * rep.max, 'toutes les étapes au plafond');
    // Et une durée qui TIENT doit être annoncée atteignable : sans ce second point, le contrôle
    // passerait avec un moteur qui dirait « inatteignable » tout le temps.
    assert.equal(rep.tenable.atteignable, true,
      '4 min sur 8 étapes doit être atteignable : ' + JSON.stringify(rep.tenable.limite));
    assert.ok(Math.abs(rep.tenable.total_reparti - rep.tenable.total_vise) <= rep.etapes,
      'et le réparti coller au visé à l\'arrondi près : ' + rep.tenable.total_reparti
      + ' pour ' + rep.tenable.total_vise);
    rep.tenable.cibles.forEach((c) => {
      assert.ok(c.mots >= rep.min && c.mots <= rep.max,
        c.stepId + ' hors bornes : ' + c.mots + ' (bornes ' + rep.min + '–' + rep.max + ')');
    });
    // Les bornes MORDENT vraiment, sinon le contrôle ne vérifie rien.
    assert.ok(rep.serre.cibles.every((c) => c.mots === rep.min),
      '0,5 minute sur ' + rep.etapes + ' étapes doit tomber au plancher : '
      + rep.serre.cibles.map((c) => c.mots).join(','));
    assert.equal(rep.serre.limite, 'plancher', 'et la limite atteinte doit être nommée');
    assert.equal(rep.serre.atteignable, false, 'et la durée annoncée inatteignable');
    // Correction 7 : UN TITRE REÇOIT MOINS QU'UN PARAGRAPHE, et c'est vérifié sur le document,
    // pas sur la table des poids — c'est le résultat qui compte.
    const parType = {};
    rep.tenable.cibles.forEach((c) => { (parType[c.type] = parType[c.type] || []).push(c.mots); });
    assert.ok(parType.heading && parType.paragraph, 'la fixture doit porter les deux types : '
      + Object.keys(parType).join(','));
    const moy = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
    assert.ok(moy(parType.heading) < moy(parType.paragraph),
      'un titre doit recevoir MOINS qu\'un paragraphe : titres ' + moy(parType.heading).toFixed(0)
      + ' mots, paragraphes ' + moy(parType.paragraph).toFixed(0));
    // Et la racine amortit : deux paragraphes dont l'un fait trois fois l'autre ne doivent pas
    // recevoir trois fois plus. On le mesure sur le poids lui-même.
    const poids = await page.evaluate(() => {
      const A = window.NarrationIA;
      const p = (mots, type) => A.poidsEtape({ type: type, texte: 'mot '.repeat(mots) });
      return { court: p(9, 'paragraph'), long: p(100, 'paragraph'),
               titre: p(9, 'heading'), liste: p(9, 'list'), vide: p(0, 'image') };
    });
    const rapport = poids.long / poids.court;
    assert.ok(rapport > 3 && rapport < 4,
      'cent mots contre neuf doivent peser environ 3,3 fois, pas 11 : ' + rapport.toFixed(2));
    assert.ok(poids.titre < poids.court, 'à longueur égale, un titre pèse moins qu\'un paragraphe');
    assert.ok(poids.liste > poids.court, 'et une liste pèse plus');
    assert.ok(poids.vide > 0, 'une étape sans texte garde un poids : elle a besoin d\'un commentaire');
    console.log('      poids : titre 9 mots ' + poids.titre.toFixed(2) + ', paragraphe 9 mots '
      + poids.court.toFixed(2) + ', paragraphe 100 mots ' + poids.long.toFixed(2)
      + ' (rapport ' + rapport.toFixed(2) + '), liste 9 mots ' + poids.liste.toFixed(2));
    assert.ok(rep.large.cibles.every((c) => c.mots === rep.max),
      '60 minutes doit tomber au plafond : ' + rep.large.cibles.map((c) => c.mots).join(','));
    assert.ok(rep.serre.bornees > 0 && rep.large.bornees > 0, 'les bornes doivent être signalées');
    console.log('      10 min → ' + rep.r.cibles.map((c) => c.mots).join(', ') + ' mots ('
      + rep.r.total_reparti + ' au total, ' + Math.round(rep.r.duree_estimee_s) + ' s)');
    pass('répartition : total exact, prorata du contenu, bornes ' + rep.min + '–' + rep.max + ' qui mordent.');

    // ── 4. BUDGET DE DÉLAI dérivé de la règle maison, pas inventé ────────────────────────────
    const budget = await page.evaluate(() => {
      const A = window.NarrationIA;
      return {
        regle: A.BUDGET_MS_POUR_8000_JETONS, plancher: A.BUDGET_PLANCHER_MS, plafond: A.BUDGET_PLAFOND_MS,
        a8000: A.budgetDelaiMs(8000), a16000: A.budgetDelaiMs(16000), a4000: A.budgetDelaiMs(4000),
        a1000: A.budgetDelaiMs(1000), a100000: A.budgetDelaiMs(100000),
        jetons1500: A.jetonsPour(1500), jetons0: A.jetonsPour(0),
      };
    });
    assert.equal(budget.a8000, 90000, '8 000 jetons → 90 s, la règle maison');
    assert.equal(budget.a16000, 180000, 'proportionnel : 16 000 → 180 s');
    assert.equal(budget.a4000, 45000, 'proportionnel : 4 000 → 45 s');
    assert.equal(budget.a1000, budget.plancher, 'sous le plancher, on prend le plancher (45 s, le délai de transport de l\'appel 2)');
    assert.equal(budget.a100000, budget.plafond, 'et le plafond au-dessus');
    assert.ok(budget.jetons1500 > 1500 && budget.jetons1500 < 8000,
      '1 500 mots → ' + budget.jetons1500 + ' jetons');
    pass('budget de délai : 8 000 jetons → 90 s, proportionnel, plancher ' + (budget.plancher / 1000)
      + ' s et plafond ' + (budget.plafond / 1000) + ' s.');

    // ── 5. LE PROMPT SYSTÈME dit ce qu'il doit dire ──────────────────────────────────────────
    const prompt = await page.evaluate((d) => ({
      vous: window.NarrationIA.promptSysteme({ adresse: 'vous', titre: d.title, public: d.audience }),
      tu: window.NarrationIA.promptSysteme({ adresse: 'tu', titre: d.title, public: d.audience }),
      sansTitre: window.NarrationIA.promptSysteme({ adresse: 'vous' }),
      autreSujet: window.NarrationIA.promptSysteme({ adresse: 'vous',
        titre: 'Comprendre les crises de panique', public: 'grand public' }),
      pro: window.NarrationIA.promptSysteme({ adresse: 'vous', titre: 'T', public: 'clinicien' }),
      accompagnees: window.NarrationIA.promptSysteme({ adresse: 'vous', titre: 'T', public: 'personnes accompagnées' }),
      large: window.NarrationIA.promptSysteme({ adresse: 'vous', titre: 'T', public: 'grand public' }),
      sansPublic: window.NarrationIA.promptSysteme({ adresse: 'vous', titre: 'T' }),
    }), DOC);
    const exigences = [
      ['doublage', /doublage/i], ['dit, pas lu', /SERA DIT, PAS LU/],
      ['phrases courtes', /phrases courtes/i], ['pas de Markdown', /Aucun Markdown/],
      ['ajoute et commente', /AJOUTE à la diapositive/],
      ['ne répète pas', /ne la lit pas et ne la\s*\n?répète pas/],
      ['exemples annoncés', /Imaginez un couple/],
      ['rien d\'inventé', /qui ne figure pas déjà dans le document/],
      // Chaque interdiction a sa propre ligne, donc sa propre vérification : une seule
      // assertion par famille laissait passer le retrait de la ligne voisine.
      ['pas de statistique', /Aucune statistique, aucun pourcentage, aucune étude/],
      ['pas de source inventée', /aucune source, aucun nom d\u2019auteur|aucune source, aucun nom d'auteur/],
      ['cas jamais présenté comme réel', /Jamais un cas présenté comme réel/],
      ['pas de jargon', /Aucun jargon/],
      // Correction 1 du 8 octobre : l'exemple de nombre ne doit plus être une proportion, qui
      // ressemblait à une statistique et invitait à en produire.
      ['nombre en toutes lettres, neutre', /« douze semaines »,\s*\n?\s*« trois mois »/],
      ['aucun chiffre venu d\'ailleurs', /Jamais un chiffre qui ne figure pas dans le document/],
      // Correction 4 : la continuité du discours.
      ['un seul discours', /UN SEUL DISCOURS, DU DÉBUT À LA FIN\./],
      ['reprend là où on s\'est arrêté', /reprend là où la précédente s.est arrêtée/],
      ['pas deux fois le même exemple', /Ne réutilisez jamais un exemple, une image ou une comparaison/],
      ['la première ouvre', /La PREMIÈRE étape ouvre la vidéo/],
      ['pas « nous allons voir »', /Ne commencez pas par « Dans cette présentation, nous allons voir/],
      ['la dernière referme', /La DERNIÈRE étape referme/],
      ['sans récapituler', /ne récapitule pas mécaniquement/],
      // Correction 5 : l'inclusivité.
      ['aucun rôle attribué d\'office', /N.attribuez jamais d.office un rôle à l.homme ou à la femme/],
      ['l\'un et l\'autre', /Dites « l.un » et « l.autre », ou « l.un des deux »/],
      ['pas forcément un homme et une femme', /n.est pas forcément un homme et une femme/],
      // Correction 6 : la typographie.
      ['guillemets français', /employez les guillemets français : « comme ceci »/],
      ['jamais le guillemet droit', /N.employez JAMAIS le\s*\n?\s*guillemet droit/],
      ['apostrophe typographique', /L.apostrophe s.écrit ’, jamais '/],
      ['pas de parenthèse', /Aucune parenthèse/],
      ['aucun diagnostic', /Aucun diagnostic/],
      ['aucune promesse', /promesse\s*\n?de résultat thérapeutique/],
      ['relecture humaine', /relecture humaine est requise/],
      ['brouillon', /BROUILLON/],
      ['pauses R8', /\[pause\]/], ['pause chiffrée', /\[pause 2 s\]/],
      ['contrat JSON', /\[\{"stepId": "\.\.\.", "text": "\.\.\."\}\]/],
      ['un par étape', /un élément par étape demandée/],
      ['français', /en français/],
      ['tolérance', /Respectez-la à 20 % près/],
    ];
    exigences.forEach(([nom, re]) => {
      assert.ok(re.test(prompt.vous), 'le prompt doit porter : ' + nom);
    });
    // Et ce qui ne doit PLUS y être : une proportion donnée en exemple.
    assert.equal(/un couple sur trois/.test(prompt.vous), false,
      'l\'ancien exemple « un couple sur trois » ressemblait à une statistique');
    // Correction 2 : le sujet vient du TITRE, et le mot « couple » n'est plus en dur.
    assert.ok(prompt.vous.indexOf('intitulée « ' + DOC.title + ' »') !== -1,
      'le prompt doit nommer la présentation : ' + prompt.vous.slice(0, 220));
    assert.ok(prompt.autreSujet.indexOf('Comprendre les crises de panique') !== -1,
      'un autre document donne un autre sujet');
    assert.equal(/psychoéducation sur le couple/.test(prompt.autreSujet), false,
      'le sujet ne doit plus être « le couple » en dur — le dossier porte aussi l\'attachement et la panique');
    assert.match(prompt.sansTitre, /Le sujet est celui de la présentation fournie\. Tenez-vous-y/,
      'sans titre, la consigne reste tenable');
    // Correction 3 : le registre suit le public, et les quatre cas sont distincts.
    assert.match(prompt.pro, /Des professionnels\./, 'public professionnel');
    assert.match(prompt.pro, /nommer un mécanisme par son nom/);
    assert.match(prompt.accompagnees, /Des personnes accompagnées/, 'public accompagné');
    assert.match(prompt.accompagnees, /aucune phrase qui laisse entendre qu.elles auraient dû savoir/);
    assert.match(prompt.large, /Un public large/, 'grand public');
    assert.match(prompt.large, /Aucun terme technique sans une phrase qui l.explique/);
    assert.match(prompt.sansPublic, /Le public n.est pas précisé/, 'public absent');
    const registres = [prompt.pro, prompt.accompagnees, prompt.large, prompt.sansPublic];
    assert.equal(new Set(registres).size, 4, 'les quatre registres doivent être DISTINCTS');
    assert.ok(registres.every((r) => /À QUI VOUS PARLEZ\./.test(r)), 'chacun a sa section');
    assert.match(prompt.vous, /en disant « vous ». Jamais « tu »/);
    assert.match(prompt.tu, /en disant « tu ». Jamais « vous »/);
    assert.ok(!/« tu ». Jamais « vous »/.test(prompt.vous), 'les deux adresses ne doivent pas coexister');
    pass('prompt système : ' + exigences.length + ' exigences présentes, adresse « vous » et « tu » exclusives.');

    // ── 6. LE MESSAGE ne transporte que le nécessaire ────────────────────────────────────────
    const msg = await page.evaluate((d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 8);
      return { texte: A.construireMessage(d, etapes, r, { minutes: 8 }), etapes: etapes.length,
               doc: JSON.stringify(d) };
    }, DOC);
    assert.ok(msg.texte.indexOf('stepId:') !== -1, 'les identifiants d\'étape doivent y être');
    assert.ok(msg.texte.indexOf('cible:') !== -1, 'les cibles de mots aussi');
    // Ce qui ne doit PAS y être : le document brut, les citations, le snapshot, les manifestes.
    ['sourceSnapshotId', 'citationLinks', 'renderManifestId', 'contentChecksum', 'documentId',
     'versionId', 'requestId'].forEach((champ) => {
      assert.equal(msg.texte.indexOf(champ), -1, 'le message ne doit pas porter « ' + champ + ' »');
    });
    assert.ok(msg.texte.length < msg.doc.length,
      'le message doit être plus court que le document brut : ' + msg.texte.length + ' vs ' + msg.doc.length);
    pass('message : titres, textes, identifiants d\'étape et cibles — ni snapshot, ni citations, ni identifiants techniques.');

    // ── 7. LES HUIT FIXTURES DE RÉPONSE ──────────────────────────────────────────────────────
    const cas = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 8);
      const cible = {}; r.cibles.forEach((c) => { cible[c.stepId] = c.mots; });
      const mot = 'phrase ';
      const texteDe = (n) => ('Imaginez un couple. ' + mot.repeat(Math.max(0, n - 3))).trim();
      const bonne = JSON.stringify(etapes.map((e) => ({ stepId: e.stepId, text: texteDe(cible[e.stepId]) })));

      const fixtures = {
        valide: bonne,
        etapeManquante: JSON.stringify(etapes.slice(1).map((e) => ({ stepId: e.stepId, text: texteDe(cible[e.stepId]) }))),
        identifiantInconnu: JSON.stringify(etapes.map((e, i) => ({ stepId: i === 0 ? 'etape-fantome' : e.stepId, text: texteDe(cible[e.stepId]) }))),
        markdown: JSON.stringify(etapes.map((e, i) => ({ stepId: e.stepId, text: (i === 0 ? '**Imaginez** un couple. ' : 'Imaginez un couple. ') + mot.repeat(Math.max(0, cible[e.stepId] - 3)) }))),
        tropLong: JSON.stringify(etapes.map((e) => ({ stepId: e.stepId, text: texteDe(cible[e.stepId] * 3) }))),
        tropCourt: JSON.stringify(etapes.map((e) => ({ stepId: e.stepId, text: 'Trop court.' }))),
        jsonInvalide: '[{"stepId": "x", "text": "manque une accolade"',
        vide: '',
        enBlocDeCode: '```json\n' + bonne + '\n```',
      };
      const out = {};
      for (const [nom, rep] of Object.entries(fixtures)) {
        const v = A.validerReponse(rep, etapes, r);
        out[nom] = { ok: v.ok, n: v.entrees.length, violations: v.violations.slice(0, 3) };
      }
      return { out, etapes: etapes.length };
    }, DOC);
    const c = cas.out;
    assert.equal(c.valide.ok, true, 'la réponse valide doit passer : ' + c.valide.violations.join(' | '));
    assert.equal(c.valide.n, cas.etapes, 'une entrée par étape');
    assert.equal(c.enBlocDeCode.ok, true, 'un bloc de code est toléré à la LECTURE : ' + c.enBlocDeCode.violations.join(' | '));
    const doitEchouer = {
      etapeManquante: /étape manquante/, identifiantInconnu: /identifiant inconnu/,
      markdown: /Markdown/, tropLong: /trop long/, tropCourt: /trop court/,
      jsonInvalide: /pas un tableau JSON lisible/, vide: /pas un tableau JSON lisible/,
    };
    Object.entries(doitEchouer).forEach(([nom, re]) => {
      assert.equal(c[nom].ok, false, nom + ' doit être refusé');
      assert.ok(c[nom].violations.some((v) => re.test(v)),
        nom + ' : motif attendu ' + re + ', obtenu ' + JSON.stringify(c[nom].violations));
    });
    console.log('      ' + Object.keys(c).length + ' fixtures : '
      + Object.entries(c).map(([k, v]) => k + '=' + (v.ok ? 'ok' : 'refusé')).join(', '));
    pass('contrat de réponse : les 9 fixtures produisent chacune le comportement prévu.');

    // ── 8b. TYPOGRAPHIE : normalisée quand c'est sans ambiguïté, refusée quand ça ne l'est pas ─
    const typo = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const n = (t) => A.normaliserTypographie(t);
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 4);
      const cible = {}; r.cibles.forEach((c) => { cible[c.stepId] = c.mots; });
      const remplir = (t, c) => (t + ' ' + 'phrase '.repeat(Math.max(0, c - A.compterMots(t)))).trim();
      // Une réponse entière qui porte des guillemets droits APPARIÉS : doit être acceptée et
      // normalisée, pas refusée.
      const appariee = JSON.stringify(etapes.map((e) => ({ stepId: e.stepId,
        text: remplir('Il dit "je ne sais pas" et c\'est tout.', cible[e.stepId]) })));
      // Et une qui en porte un seul : ambigu, donc refusé.
      const impaire = JSON.stringify(etapes.map((e, i) => ({ stepId: e.stepId,
        text: remplir(i === 0 ? 'Il dit "je ne sais pas et c\'est tout.' : 'Rien de special ici.', cible[e.stepId]) })));
      return {
        apostrophe: n("C'est l'argent qui parle."),
        citation: n('Il dit "je ne sais pas" et il se tait.'),
        impair: n('Il dit "je ne sais pas et il se tait.'),
        rien: n('Rien à normaliser ici.'),
        vApp: (() => { const v = A.validerReponse(appariee, etapes, r);
          return { ok: v.ok, notes: v.normalisations.length, premier: v.entrees[0] && v.entrees[0].text,
                   violations: v.violations.slice(0, 2) }; })(),
        vImp: (() => { const v = A.validerReponse(impaire, etapes, r);
          return { ok: v.ok, violations: v.violations.slice(0, 2) }; })(),
      };
    }, DOC);
    // L'apostrophe droite est TOUJOURS remplacée — jamais un tour de correction gâché pour cela.
    assert.equal(typo.apostrophe.texte, 'C\u2019est l\u2019argent qui parle.');
    assert.equal(typo.apostrophe.refus, null);
    assert.match(typo.apostrophe.notes[0], /2 apostrophe\(s\) droite\(s\) remplacée/);
    // Une citation appariée devient « … », avec les espaces insécables.
    assert.equal(typo.citation.texte, 'Il dit \u00ab\u00a0je ne sais pas\u00a0\u00bb et il se tait.');
    assert.equal(typo.citation.refus, null);
    // Un guillemet droit SEUL est ambigu : refusé, jamais deviné.
    assert.ok(typo.impair.refus, 'un guillemet droit non apparié doit être refusé');
    assert.match(typo.impair.refus, /non apparié/);
    assert.deepEqual(typo.rien.notes, [], 'un texte propre ne doit rien déclencher');
    // Et au niveau de la réponse entière :
    assert.equal(typo.vApp.ok, true, 'des guillemets appariés sont acceptés : ' + typo.vApp.violations.join(' | '));
    assert.equal(typo.vApp.notes > 0, true, 'et la normalisation est DITE, pas silencieuse');
    assert.equal(typo.vApp.premier.indexOf('"'), -1, 'plus aucun guillemet droit dans le texte retenu');
    assert.ok(typo.vApp.premier.indexOf('\u00ab') !== -1, 'remplacé par des guillemets français');
    assert.equal(typo.vImp.ok, false, 'un guillemet non apparié fait échouer la réponse');
    assert.ok(typo.vImp.violations.some((v) => /non apparié/.test(v)), typo.vImp.violations.join(' | '));
    console.log('      « ' + typo.citation.texte + ' »  |  impair → ' + typo.impair.refus);
    pass('typographie : apostrophe droite remplacée, citation appariée passée en « », guillemet seul refusé.');

    // ── 8. UN SEUL TOUR DE CORRECTION, puis une erreur claire ────────────────────────────────
    const correction = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 8);
      const cible = {}; r.cibles.forEach((x) => { cible[x.stepId] = x.mots; });
      const bonne = JSON.stringify(etapes.map((e) => ({ stepId: e.stepId,
        text: ('Imaginez un couple. ' + 'phrase '.repeat(Math.max(0, cible[e.stepId] - 3))).trim() })));
      const mauvaise = JSON.stringify(etapes.map((e) => ({ stepId: e.stepId, text: 'Trop court.' })));

      // a) mauvaise puis bonne → réussit au 2e tour, et le 2e message dit ce qui n'allait pas
      let vus = [], secondTour = null;
      const t1 = async (req) => {
        vus.push(req.messages.length);
        if (req.tour === 1) {
          // Ce que le second tour transporte RÉELLEMENT : la réponse fautive, puis le détail
          // des violations. Compter les messages ne suffit pas — trois messages vides feraient
          // le même compte.
          secondTour = { reponseFautive: req.messages[1] && req.messages[1].content,
                         consigne: req.messages[2] && req.messages[2].content };
        }
        return req.tour === 0 ? mauvaise : bonne;
      };
      const r1 = await A.rediger(d, { minutes: 8, seulementVides: false, transport: t1 });
      // b) mauvaise deux fois → erreur, jamais de résultat partiel
      // On COMPTE les appels : un contrat « un seul tour de correction » se vérifie au nombre
      // d'appels, jamais au seul fait que l'erreur survienne. Quatre tours échoueraient aussi.
      let r2 = null, err = null, appels = 0;
      try { r2 = await A.rediger(d, { minutes: 8, seulementVides: false,
        transport: async () => { appels++; return mauvaise; } }); }
      catch (e) { err = { message: e.message, journal: e.journal }; }
      // c) le transport reçoit bien le budget et les jetons dérivés
      let vu = null;
      await A.rediger(d, { minutes: 8, seulementVides: false,
        transport: async (req) => { vu = { maxTokens: req.maxTokens, budgetMs: req.budgetMs,
          systemLen: req.system.length, role: req.messages[0].role }; return bonne; } });
      return { tours: r1.tours, entrees: r1.entrees.length, messagesParTour: vus,
               secondTour: secondTour, mauvaise: mauvaise,
               appelsQuandToutEchoue: appels, erreur: err, resultatPartiel: r2, vu };
    }, DOC);
    assert.equal(correction.tours, 2, 'une réponse corrigée au 2e tour doit réussir');
    assert.equal(correction.entrees, cas.etapes);
    assert.deepEqual(correction.messagesParTour, [1, 3],
      'le 2e tour doit porter trois messages : ' + correction.messagesParTour);
    assert.equal(correction.secondTour.reponseFautive, correction.mauvaise,
      'le 2e tour doit renvoyer au modèle SA PROPRE réponse fautive, pas une chaîne vide');
    assert.match(correction.secondTour.consigne, /ne respecte pas le contrat sur les points suivants/,
      'et la consigne doit lister les violations : ' + String(correction.secondTour.consigne).slice(0, 80));
    assert.match(correction.secondTour.consigne, /trop court/,
      'nommément : ' + String(correction.secondTour.consigne).slice(0, 120));
    assert.equal(correction.resultatPartiel, null, 'JAMAIS de résultat partiel');
    assert.ok(correction.erreur, 'deux échecs doivent lever une erreur');
    assert.match(correction.erreur.message, /n’a pas respecté le contrat après un tour de correction/);
    assert.match(correction.erreur.message, /trop court/, 'l\'erreur doit DIRE ce qui n\'allait pas');
    assert.equal(correction.erreur.journal.length, 2, 'le journal doit porter les deux tours');
    assert.equal(correction.appelsQuandToutEchoue, 2,
      'UN SEUL tour de correction : deux appels au total, jamais plus — ' 
      + correction.appelsQuandToutEchoue + ' observés');
    assert.equal(correction.vu.maxTokens > 0, true);
    assert.equal(correction.vu.budgetMs, await page.evaluate((t) => window.NarrationIA.budgetDelaiMs(t), correction.vu.maxTokens));
    pass('un seul tour de correction : réussit au 2e, sinon erreur nommée et aucun résultat partiel.');

    // ── 9. « N'ÉCRIRE QUE LES ÉTAPES VIDES » ─────────────────────────────────────────────────
    const vides = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const doc = JSON.parse(JSON.stringify(d));
      const etapes = A.contenuParEtape(doc);
      doc.narration = [{ stepId: etapes[0].stepId, text: 'Narration déjà écrite à la main.' }];
      const demandees = [];
      // Transport simulé CONFORME : il lit les cibles dans le message et rend le bon nombre de
      // mots, comme le ferait un modèle qui obéit. Un transport qui ignore les cibles ferait
      // échouer le contrat et mesurerait la détection de violation, pas ce qu'on veut ici.
      const transport = async (req) => {
        const bloc = req.messages[0].content;
        const ids = (bloc.match(/stepId: (\S+)/g) || []).map((x) => x.slice(8));
        const cibles = (bloc.match(/cible: (\d+) mots/g) || []).map((x) => parseInt(x.slice(7), 10));
        demandees.push(ids);
        return JSON.stringify(ids.map((id, i) => ({ stepId: id,
          text: ('Imaginez un couple. ' + 'phrase '.repeat(Math.max(0, cibles[i] - 3))).trim() })));
      };
      const avecOption = await A.rediger(doc, { minutes: 8, seulementVides: true, transport });
      const sansOption = await A.rediger(doc, { minutes: 8, seulementVides: false, transport });
      return { total: etapes.length, demandees,
               avec: avecOption.entrees.map((e) => e.stepId), sans: sansOption.entrees.map((e) => e.stepId),
               premiere: etapes[0].stepId };
    }, DOC);
    assert.equal(vides.avec.length, vides.total - 1, 'avec l\'option, l\'étape déjà narrée est exclue');
    assert.equal(vides.avec.indexOf(vides.premiere), -1, 'et c\'est bien elle qui manque');
    assert.equal(vides.sans.length, vides.total, 'sans l\'option, toutes les étapes sont demandées');
    assert.equal(vides.demandees[0].indexOf(vides.premiere), -1,
      'l\'étape déjà narrée ne doit même pas être ENVOYÉE au modèle');
    pass('« n\'écrire que les étapes vides » : l\'étape déjà narrée n\'est ni demandée ni réécrite.');

    // ── 10. L'INTERFACE : aperçu, application, confirmation, annulation ──────────────────────
    // On passe par l'éditeur réel : ouverture du document, sélection d'une étape, clics.
    await page.evaluate((d) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['essai1b'] = {
        name: d.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: false, blockEditing: true, export: true, qualityControlledExport: true },
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)),
        _adocStructuredSnapshot: { sourceSnapshotId: d.sourceSnapshotId, entries: [] },
      };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'essai1b' });
      return window.adocOpenWorkspace('essai1b');
    }, DOC);
    await page.waitForTimeout(500);
    // Le transport d'essai, posé sur le module : l'interface ne sait pas qu'il est simulé.
    await page.evaluate(() => {
      // Même principe pour l'interface : le transport simulé respecte les cibles, et place une
      // marque de pause — qui ne doit compter ni dans les mots ni dans la durée affichée.
      window.NarrationIA._transportDEssai = async (req) => {
        const bloc = req.messages[0].content;
        const ids = (bloc.match(/stepId: (\S+)/g) || []).map((x) => x.slice(8));
        const cibles = (bloc.match(/cible: (\d+) mots/g) || []).map((x) => parseInt(x.slice(7), 10));
        return JSON.stringify(ids.map((id, i) => ({ stepId: id,
          text: 'Imaginez un couple qui n’en parle jamais. [pause] '
            + 'mot '.repeat(Math.max(0, cibles[i] - 8)) + 'Et vous, de quoi ne parlez-vous pas ?' })));
      };
    });
    const ouvert = await page.evaluate(async () => {
      const d = window._adocArtifacts['essai1b']._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId) || document.getElementById('root:card-title:' + e.cardId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 400));
      const boite = document.querySelector('.cc-editor-narration');
      const btn = boite && boite.querySelector('.nia-bouton');
      let dessus = null, atteint = false;
      if (btn) {
        btn.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
        const rect = btn.getBoundingClientRect();
        const el = document.elementFromPoint(Math.round(rect.left + rect.width / 2),
                                             Math.round(rect.top + rect.height / 2));
        dessus = el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
          + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '') : null;
        atteint = el === btn || (el && btn.contains(el));
      }
      return { boite: !!boite, bouton: !!btn,
               libelleBouton: btn ? btn.textContent : null,
               boutonAtteint: atteint, dessusBouton: dessus,
               panneauCache: boite && boite.querySelector('.nia-panneau') ? boite.querySelector('.nia-panneau').hidden : null };
    });
    assert.equal(ouvert.bouton, true, 'le bouton doit être posé dans la boîte Narration');
    assert.equal(ouvert.libelleBouton, 'Rédiger la narration');
    assert.equal(ouvert.panneauCache, true, 'le panneau est fermé au départ');
    // LA LEÇON DU 8 OCTOBRE : un bouton présent dans le DOM ne prouve pas qu'on peut le
    // cliquer. On demande au navigateur qui recevrait le clic.
    assert.equal(ouvert.boutonAtteint, true,
      'le bouton doit être ATTEINT par le pointeur, pas seulement présent — ce qui recevrait '
      + 'le clic : ' + ouvert.dessusBouton);
    pass('bouton « Rédiger la narration » posé dans la boîte Narration du lot 1a, panneau fermé.');

    // ── 11. Les réglages par défaut, lus À L'ÉCRAN ───────────────────────────────────────────
    const sortiesAvantRedaction = sorties.length;
    await page.click('.nia-bouton');
    const reglages = await page.evaluate(() => {
      const p = document.querySelector('.nia-panneau');
      return { cache: p.hidden,
               minutes: p.querySelector('.nia-minutes').value,
               adresse: p.querySelector('.nia-adresse').value,
               vides: p.querySelector('.nia-vides').checked,
               appliquer: p.querySelector('.nia-appliquer').disabled,
               annuler: p.querySelector('.nia-annuler').disabled };
    });
    assert.equal(reglages.cache, false, 'le panneau s\'ouvre au clic');
    assert.equal(reglages.minutes, '8', 'durée par défaut proposée : 8 min');
    assert.equal(reglages.adresse, 'vous', '« vous » par défaut');
    assert.equal(reglages.vides, true, '« n\'écrire que les étapes vides » coché par défaut');
    assert.equal(reglages.appliquer, true, '« Appliquer » désactivé avant toute rédaction');
    assert.equal(reglages.annuler, true, '« Annuler » désactivé avant tout geste');
    pass('réglages par défaut à l\'écran : 8 min, « vous », étapes vides cochées, boutons inactifs.');

    // ── 12. APERÇU avant écriture : le document ne doit PAS avoir bougé ──────────────────────
    await page.click('.nia-generer');
    await page.waitForFunction(() => /étape\(s\) rédigée\(s\)/.test(document.querySelector('.nia-etat').textContent),
      { timeout: 20000 });
    const apercu = await page.evaluate(() => {
      const p = document.querySelector('.nia-panneau');
      const d = window._adocArtifacts['essai1b']._adocStructuredDoc;
      return {
        etat: p.querySelector('.nia-etat').textContent,
        etapesAffichees: p.querySelectorAll('.nia-etape').length,
        premierTexte: p.querySelector('.nia-etape .nia-texte').textContent,
        premiereMeta: p.querySelector('.nia-etape .nia-meta').textContent,
        premierTitre: p.querySelector('.nia-etape h5').textContent,
        narrationDansLeDoc: (d.narration || []).length,
        appliquer: p.querySelector('.nia-appliquer').disabled,
      };
    });
    assert.equal(apercu.narrationDansLeDoc, 0, 'RIEN ne doit être écrit avant « Appliquer »');
    assert.ok(apercu.etapesAffichees > 0, 'l\'aperçu doit montrer les étapes');
    assert.match(apercu.etat, /Rien n’est encore écrit/, 'et le dire : ' + apercu.etat);
    assert.match(apercu.premiereMeta, /\d+ mots \(cible \d+\) — \d+ s/, 'méta : ' + apercu.premiereMeta);
    assert.match(apercu.premierTitre, /Diapositive/, 'titre d\'étape : ' + apercu.premierTitre);
    assert.ok(apercu.premierTexte.indexOf('Imaginez') === 0, 'le texte proposé est affiché');
    assert.equal(apercu.appliquer, false, '« Appliquer » devient actif');
    pass('aperçu : ' + apercu.etapesAffichees + ' étapes affichées avec mots, cible et durée — document intact.');

    // ── 13. APPLIQUER : le document reçoit la narration, et le champ du lot 1a l'affiche ─────
    await page.click('.nia-appliquer');
    await page.waitForTimeout(400);
    const applique = await page.evaluate(() => {
      const d = window._adocArtifacts['essai1b']._adocStructuredDoc;
      const zone = document.querySelector('[data-editor-narration]');
      return { n: (d.narration || []).length,
               champ: zone ? zone.value.slice(0, 20) : null,
               compte: (document.querySelector('.cc-editor-narration-compte') || {}).textContent,
               etat: document.querySelector('.nia-etat').textContent,
               annuler: document.querySelector('.nia-annuler').disabled };
    });
    assert.ok(applique.n > 0, 'le document doit porter les narrations');
    assert.equal(applique.champ, 'Imaginez un couple q', 'le champ du lot 1a doit AFFICHER le texte : ' + applique.champ);
    assert.match(applique.compte || '', /mot/, 'et le compte de mots se met à jour : ' + applique.compte);
    assert.match(applique.etat, /narration\(s\) écrite\(s\)/);
    assert.equal(applique.annuler, false, '« Annuler ce geste » devient actif');
    pass(applique.n + ' narrations écrites, affichées dans le champ du lot 1a, compte de mots à jour.');

    // ── 14. ÉCRASEMENT : jamais sans confirmation (N4) ───────────────────────────────────────
    let demandes = [];
    page.on('dialog', (d) => { demandes.push(d.message()); });
    // La SECONDE rédaction doit produire un texte DIFFÉRENT, sinon « écraser » ne change rien
    // et l'annulation n'aurait rien à restaurer : le contrôle passerait sans rien éprouver.
    await page.evaluate(() => {
      const base = window.NarrationIA._transportDEssai;
      window.NarrationIA._transportDEssai = async (req) => {
        const brut = await base(req);
        return JSON.stringify(JSON.parse(brut).map((e) => ({ stepId: e.stepId,
          text: 'Seconde version. ' + e.text })));
      };
      document.querySelector('.nia-vides').checked = false;
    });
    await page.click('.nia-generer');
    await page.waitForFunction(() => /étape\(s\) rédigée\(s\)/.test(document.querySelector('.nia-etat').textContent),
      { timeout: 20000 });
    const avantEcrasement = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window._adocArtifacts['essai1b']._adocStructuredDoc.narration || [])));
    // Refus : le document ne doit pas bouger.
    await page.evaluate(() => { window.confirm = () => false; });
    await page.click('.nia-appliquer');
    await page.waitForTimeout(300);
    const refus = await page.evaluate(() => ({
      narration: window._adocArtifacts['essai1b']._adocStructuredDoc.narration || [],
      etat: document.querySelector('.nia-etat').textContent }));
    assert.deepEqual(refus.narration, avantEcrasement, 'un refus ne doit RIEN changer');
    assert.match(refus.etat, /Rien n’a été écrit/, 'et le dire : ' + refus.etat);
    // Acceptation : le document change, et le message dit combien ont été remplacées.
    let messageConfirmation = null;
    await page.evaluate(() => {
      window.__msg = null;
      window.confirm = (m) => { window.__msg = m; return true; };
    });
    await page.click('.nia-appliquer');
    await page.waitForTimeout(300);
    const accepte = await page.evaluate(() => ({
      msg: window.__msg,
      n: (window._adocArtifacts['essai1b']._adocStructuredDoc.narration || []).length,
      etat: document.querySelector('.nia-etat').textContent }));
    assert.ok(accepte.msg && /portent déjà une narration/.test(accepte.msg),
      'la confirmation doit dire ce qui sera remplacé : ' + accepte.msg);
    assert.match(accepte.msg, /^\d+ étape\(s\)/, 'avec le NOMBRE exact : ' + accepte.msg);
    assert.match(accepte.etat, /remplacée\(s\), après confirmation/);
    pass('N4 : écrasement refusé → rien ne bouge ; accepté → le nombre exact est annoncé puis écrit.');

    // ── 15. ANNULER LE GESTE : retour exact à l'état d'avant ─────────────────────────────────
    const avantAnnulation = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window._adocArtifacts['essai1b']._adocStructuredDoc.narration || [])));
    await page.click('.nia-annuler');
    await page.waitForTimeout(300);
    const annule = await page.evaluate(() => ({
      narration: window._adocArtifacts['essai1b']._adocStructuredDoc.narration || [],
      etat: document.querySelector('.nia-etat').textContent,
      annuler: document.querySelector('.nia-annuler').disabled }));
    assert.deepEqual(annule.narration, avantEcrasement,
      'l\'annulation doit restaurer l\'état d\'AVANT le dernier geste');
    assert.notDeepEqual(annule.narration, avantAnnulation, 'et donc changer quelque chose');
    assert.match(annule.etat, /Geste annulé/);
    assert.equal(annule.annuler, true, 'le bouton se désactive après usage');
    pass('annulation d\'un geste : la narration revient exactement à son état d\'avant.');

    // ── 17. AUCUN APPEL RÉSEAU causé par la rédaction ────────────────────────────────────────
    // L'application appelle le Worker et des CDN au DÉMARRAGE — c'est son comportement, pas
    // celui de ce lot. Ce qui doit être vrai : entre l'ouverture du panneau et l'annulation du
    // geste, rien n'est sorti. Le transport est simulé, donc aucun appel réel n'a lieu.
    const sortiesPendantRedaction = sorties.slice(sortiesAvantRedaction);
    assert.deepEqual(sortiesPendantRedaction, [],
      'la rédaction ne doit causer AUCUNE sortie réseau : ' + sortiesPendantRedaction.join(', '));
    console.log('      ' + sortiesAvantRedaction + ' sortie(s) au démarrage de l\'application ('
      + Array.from(new Set(sorties.slice(0, sortiesAvantRedaction))).join(', ')
      + '), 0 pendant la rédaction.');
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    pass('aucune sortie réseau causée par la rédaction, aucune erreur de page sur la séance.');

    console.log('\nPASS verify-narration-ia — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
