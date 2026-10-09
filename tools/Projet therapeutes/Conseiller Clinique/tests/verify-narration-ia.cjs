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
    // `hotesAppeles` est le TÉMOIN du contrôle 18 : les hôtes que l'application appelle
    // d'elle-même, relevés sur le trafic réel. Comparer l'URL du transport à une valeur que le
    // module déclare ne prouverait rien — c'est la leçon du 7 octobre.
    const hotesAppeles = [];
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' && u.port === String(port)) return route.continue();
      sorties.push(u.hostname);
      hotesAppeles.push(u.hostname);
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
        a8000: A.budgetDelaiMs(8000), a16000: A.budgetDelaiMs(16000), a12000: A.budgetDelaiMs(12000),
        a4000: A.budgetDelaiMs(4000), a1000: A.budgetDelaiMs(1000), a100000: A.budgetDelaiMs(100000),
        // Ce que le vrai cas demande : 1 200 mots, soit environ 3 000 jetons.
        pour1200mots: A.budgetDelaiMs(A.jetonsPour(1200)),
        jetons1500: A.jetonsPour(1500), jetons0: A.jetonsPour(0),
      };
    });
    assert.equal(budget.a8000, 90000, '8 000 jetons → 90 s, la règle maison');
    assert.equal(budget.a16000, 180000, 'proportionnel : 16 000 → 180 s');
    assert.equal(budget.a12000, 135000, 'proportionnel : 12 000 → 135 s');
    // PLANCHER PORTÉ À 90 s le 9 octobre. Les 45 s venaient du délai de TRANSPORT de l'appel 2,
    // qui se réarme à chaque octet : c'est un seuil de silence, pas une durée totale. Ce
    // transport-ci attend une réponse entière d'environ 3 000 jetons, qui dépasse couramment
    // 45 s. Le précédent qui convient est la minuterie SÉMANTIQUE du même appel, portée à 120 s
    // après mesure ; 90 s se place entre les deux et coïncide avec la règle à 8 000 jetons.
    assert.equal(budget.plancher, 90000, 'le plancher doit être à 90 s');
    assert.equal(budget.a4000, budget.plancher, '4 000 jetons donneraient 45 s : le plancher s\'applique');
    assert.equal(budget.a1000, budget.plancher, 'et a fortiori 1 000');
    assert.equal(budget.pour1200mots, budget.plancher,
      'le cas réel — 1 200 mots — tombe sous le plancher, donc 90 s : ' + budget.pour1200mots);
    assert.equal(budget.a100000, budget.plafond, 'et le plafond au-dessus');
    assert.ok(budget.jetons1500 > 1500 && budget.jetons1500 < 8000,
      '1 500 mots → ' + budget.jetons1500 + ' jetons');
    console.log('      1 200 mots → ' + budget.jetons1500 + ' jetons environ, budget '
      + (budget.pour1200mots / 1000) + ' s (plancher)');
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
      // La ligne qui ÉNUMÈRE ce qui est interdit a sa propre assertion : vérifier la phrase
      // d'introduction laissait passer le retrait de la liste qui la suit. Troisième fois que
      // ce piège se présente dans ce lot — une assertion par ligne, désormais.
      ['ni proportion ni pourcentage ni durée ni effectif',
       /ni proportion, ni pourcentage, ni durée, ni effectif inventés/],
      // Correction 4 : la continuité du discours.
      ['un seul discours', /UN SEUL DISCOURS, DU DÉBUT À LA FIN\./],
      ['reprend là où on s\'est arrêté', /reprend là où la précédente s.est arrêtée/],
      ['pas deux fois le même exemple', /Ne réutilisez jamais un exemple, une image ou une comparaison/],
      ['la première ouvre', /La PREMIÈRE étape ouvre la vidéo/],
      ['pas « nous allons voir »', /Ne commencez pas par « Dans cette présentation, nous allons voir/],
      ['la dernière referme', /La DERNIÈRE étape referme/],
      ['sans récapituler', /ne récapitule pas mécaniquement/],
      // Vérification 2 du 9 octobre : l'objectif sert à ouvrir et à refermer.
      ['l\'objectif décide des deux bouts', /Le message vous donne l.OBJECTIF de la présentation/],
      ['la première fait naître le besoin', /faire naître le besoin auquel l.objectif répond/],
      ['la dernière rend capable', /en mesure de faire ce que l.objectif annonce/],
      ['ne jamais réciter l\'objectif', /Ne récitez\s*\n?\s*jamais l.objectif/],
      // Correction 5 : l'inclusivité.
      ['aucun rôle attribué d\'office', /N.attribuez jamais d.office un rôle à l.homme ou à la femme/],
      ['l\'un et l\'autre', /Dites « l.un » et « l.autre », ou « l.un des deux »/],
      ['pas forcément un homme et une femme', /n.est pas forcément un homme et une femme/],
      // Correction 6 : la typographie.
      ['guillemets français', /employez les guillemets français : « comme ceci »/],
      // Correction du 9 octobre, second retour : la règle des paragraphes.
      ['section paragraphe', /SI L.ÉCRAN MONTRE UN PARAGRAPHE\./],
      ['ne pas reformuler', /Ne le reformulez pas\./],
      ['dire ce qui n\'est pas dit', /Dites ce que la phrase\s*\n?affichée NE DIT PAS/],
      ['la conséquence vécue', /la conséquence vécue : ce que cela change concrètement/],
      ['un exemple annoncé', /un exemple qui donne un visage à l.idée, annoncé comme exemple/],
      ['une question sans réponse à l\'écran', /une question posée au spectateur, à laquelle l.écran ne répond pas/],
      ['ne pas reprendre l\'énumération', /ne reprenez pas son énumération/],
      // Les trois changements du 9 octobre, UNE ASSERTION PAR LIGNE.
      // Le test précédent était à l'envers : un commentaire qui reformule garderait tout son
      // sens sans la diapositive. Christophe l'a retourné — on barre ce que l'écran dit déjà.
      ['barrer ce que l\'écran dit déjà', /barrez mentalement tout ce que la diapositive dit déjà\./],
      ['s\'il ne reste rien', /S.il ne reste rien, vous avez reformulé\./],
      ['aucun fait ni chiffre ajouté', /sans introduire de fait, de chiffre ni d.étude qui ne soient dans le/],
      ['sans contredire le document', /document, et sans le contredire\./],
      ['la conséquence est une possibilité', /Formulez-la comme\s*\n?\s*une possibilité/],
      ['les deux tournures données', /« cela peut vouloir dire que… », « il arrive que… »/],
      ['jamais une règle ni une généralité', /jamais comme une\s*\n?\s*règle ni comme une généralité sur les gens/],
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
    // L'ANCIEN TEST NE DOIT PLUS Y ÊTRE : il était à l'envers, le garder à côté du nouveau
    // donnerait au modèle deux consignes contradictoires.
    assert.equal(/si on retirait la diapositive/.test(prompt.vous), false,
      'l\'ancien test, à l\'envers, doit avoir disparu du prompt');
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

    // LA PHRASE EXACTE DU DOCUMENT DE CHRISTOPHE, et quatre autres formulations. Le registre
    // est choisi par reconnaissance de motifs : il faut montrer ce qu'il choisit RÉELLEMENT,
    // pas ce qu'on espère. « sans prérequis clinique » passe à un cheveu du motif des
    // professionnels (« clinicien ») — c'est exactement le genre de coïncidence qui se vérifie
    // au lieu de se supposer.
    const AUDIENCES = [
      ['Grand public — adultes en couple ou ayant vécu en couple, sans prérequis clinique ou financier.', 'large'],
      ['clinicien', 'pro'],
      ['personnes accompagnées', 'accompagnees'],
      ['patients', 'accompagnees'],
      ['', 'repli'],
      ['thérapeutes de couple', 'pro'],
      ['couples en difficulté', 'accompagnees'],
    ];
    const choix = await page.evaluate((liste) => liste.map(([a]) => {
      const t = window.NarrationIA.promptSysteme({ adresse: 'vous', titre: 'T', public: a });
      const i = t.indexOf('À QUI VOUS PARLEZ.');
      const bloc = t.slice(i + 19, t.indexOf('\n\n', i));
      let famille = 'repli';
      if (/^Des professionnels\./.test(bloc)) famille = 'pro';
      else if (/^Des personnes accompagnées/.test(bloc)) famille = 'accompagnees';
      else if (/^Un public large/.test(bloc)) famille = 'large';
      return { famille: famille, bloc: bloc };
    }), AUDIENCES);
    console.log('\n      ── QUEL REGISTRE POUR QUELLE AUDIENCE ──');
    AUDIENCES.forEach(([a, attendu], i) => {
      const obtenu = choix[i].famille;
      console.log('      ' + (obtenu === attendu ? 'ok ' : 'NON') + '  « '
        + (a || '(chaîne vide)').slice(0, 62) + (a.length > 62 ? '…' : '') + ' »  →  ' + obtenu);
      assert.equal(obtenu, attendu, 'audience « ' + a + ' » : registre ' + obtenu
        + ' au lieu de ' + attendu);
    });
    console.log('\n      ── LES TROIS REGISTRES ET LE REPLI, EN ENTIER ──');
    [['professionnels', prompt.pro], ['personnes accompagnées', prompt.accompagnees],
     ['public large', prompt.large], ['repli, public absent', prompt.sansPublic]].forEach(([nom, t]) => {
      const i = t.indexOf('À QUI VOUS PARLEZ.');
      console.log('\n      [' + nom + ']');
      t.slice(i + 19, t.indexOf('\n\n', i)).split('\n').forEach((l) => console.log('        ' + l));
    });
    console.log('');
    assert.match(prompt.vous, /en disant « vous ». Jamais « tu »/);
    assert.match(prompt.tu, /en disant « tu ». Jamais « vous »/);
    assert.ok(!/« tu ». Jamais « vous »/.test(prompt.vous), 'les deux adresses ne doivent pas coexister');
    pass('prompt système : ' + exigences.length + ' exigences présentes, adresse « vous » et « tu » exclusives.');

    // ── 6. LE MESSAGE ne transporte que le nécessaire ────────────────────────────────────────
    const msg = await page.evaluate((d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 8);
      const sans = JSON.parse(JSON.stringify(d));
      delete sans.purpose;
      return { texte: A.construireMessage(d, etapes, r, { minutes: 8 }), etapes: etapes.length,
               sansObjectif: A.construireMessage(sans, A.contenuParEtape(sans), r, { minutes: 8 }),
               doc: JSON.stringify(d) };
    }, DOC);
    assert.ok(msg.texte.indexOf('stepId:') !== -1, 'les identifiants d\'étape doivent y être');
    assert.ok(msg.texte.indexOf('cible:') !== -1, 'les cibles de mots aussi');
    // Vérification 2 : le titre, le public ET l'objectif sont transportés, nommément.
    assert.ok(msg.texte.indexOf('Titre de la présentation : ' + DOC.title) !== -1,
      'le titre doit être dans le message');
    assert.ok(msg.texte.indexOf('Public : ' + DOC.audience) !== -1,
      'le public doit être dans le message');
    assert.ok(msg.texte.indexOf('Objectif : ' + DOC.purpose) !== -1,
      'l\'objectif doit être dans le message : ' + msg.texte.slice(0, 200));
    // Et un document sans objectif ne doit pas porter une ligne vide.
    assert.equal(msg.sansObjectif.indexOf('Objectif :'), -1,
      'sans purpose, aucune ligne « Objectif » : ' + msg.sansObjectif.slice(0, 160));
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
        // Un écart modéré : −8 % sur chaque étape, comme le 9 octobre.
        unPeuCourt: JSON.stringify(etapes.map((e) => ({ stepId: e.stepId,
          text: texteDe(Math.round(cible[e.stepId] * 0.92)) }))),
        jsonInvalide: '[{"stepId": "x", "text": "manque une accolade"',
        vide: '',
        enBlocDeCode: '```json\n' + bonne + '\n```',
      };
      const out = {};
      for (const [nom, rep] of Object.entries(fixtures)) {
        const v = A.validerReponse(rep, etapes, r);
        out[nom] = { ok: v.ok, n: v.entrees.length, violations: v.violations.slice(0, 3),
                     longueurs: v.longueurs.map((l) => l.texte).slice(0, 3),
                     longueurGrave: v.longueurGrave, raison: v.raisonLongueur,
                     motsRecus: v.mots_recus };
      }
      return { out, etapes: etapes.length };
    }, DOC);
    const c = cas.out;
    assert.equal(c.valide.ok, true, 'la réponse valide doit passer : ' + c.valide.violations.join(' | '));
    assert.equal(c.valide.n, cas.etapes, 'une entrée par étape');
    assert.equal(c.enBlocDeCode.ok, true, 'un bloc de code est toléré à la LECTURE : ' + c.enBlocDeCode.violations.join(' | '));
    // LES BLOQUANTES — décision du 9 octobre : réponse illisible, étape manquante, inconnue ou
    // en double, texte vide, Markdown, guillemet droit non apparié. Et RIEN D'AUTRE.
    const doitEchouer = {
      etapeManquante: /étape manquante/, identifiantInconnu: /identifiant inconnu/,
      markdown: /Markdown/,
      jsonInvalide: /pas un tableau JSON lisible/, vide: /pas un tableau JSON lisible/,
    };
    Object.entries(doitEchouer).forEach(([nom, re]) => {
      assert.equal(c[nom].ok, false, nom + ' doit être refusé');
      assert.ok(c[nom].violations.some((v) => re.test(v)),
        nom + ' : motif attendu ' + re + ', obtenu ' + JSON.stringify(c[nom].violations));
    });
    // LA LONGUEUR N'EST PLUS BLOQUANTE. Elle est signalée, et elle seule décide d'un second
    // tour quand elle est grave. Le 9 octobre, une réponse à −7 % a été parfaitement utilisable :
    // la refuser aurait coûté un appel pour rien.
    ['tropLong', 'tropCourt'].forEach((nom) => {
      assert.equal(c[nom].ok, true, nom + ' ne doit PAS être bloquant : ' + c[nom].violations.join(' | '));
      assert.deepEqual(c[nom].violations, [], nom + ' : aucune violation bloquante');
      assert.ok(c[nom].longueurs.length > 0, nom + ' doit être SIGNALÉ : ' + JSON.stringify(c[nom].longueurs));
      assert.equal(c[nom].longueurGrave, true, nom + ' est un écart grave, donc un tour de correction');
      assert.ok(c[nom].raison, 'la raison doit être dite : ' + c[nom].raison);
    });
    assert.ok(/trop long/.test(c.tropLong.longueurs.join(' ')), c.tropLong.longueurs.join(' | '));
    assert.ok(/trop court/.test(c.tropCourt.longueurs.join(' ')), c.tropCourt.longueurs.join(' | '));
    // Un écart MODÉRÉ ne déclenche rien du tout.
    assert.equal(c.unPeuCourt.ok, true);
    assert.equal(c.unPeuCourt.longueurGrave, false,
      'un écart de quelques pour cent ne doit pas provoquer de second appel : ' + c.unPeuCourt.raison);
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
      // Une violation BLOQUANTE — une étape manquante — et non plus un écart de longueur : la
      // longueur ne bloque plus, elle ne pourrait donc plus faire échouer deux tours.
      const mauvaise = JSON.stringify(etapes.slice(1).map((e) => ({ stepId: e.stepId,
        text: ('Imaginez un couple. ' + 'phrase '.repeat(Math.max(0, cible[e.stepId] - 3))).trim() })));

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
      catch (e) { err = { message: e.message, journal: e.journal, brut: e.brut }; }
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
    assert.match(correction.secondTour.consigne, /étape manquante/,
      'nommément : ' + String(correction.secondTour.consigne).slice(0, 120));
    assert.equal(correction.resultatPartiel, null, 'JAMAIS de résultat partiel');
    assert.ok(correction.erreur, 'deux échecs doivent lever une erreur');
    assert.match(correction.erreur.message, /n’a pas respecté le contrat après un tour de correction/);
    assert.match(correction.erreur.message, /étape manquante/, 'l\'erreur doit DIRE ce qui n\'allait pas');
    // L'ERREUR CITE CHAQUE TOUR, pas seulement le dernier : savoir que le second a échoué sans
    // savoir ce que le premier reprochait ne permet pas de comprendre ce qui s'est passé.
    assert.match(correction.erreur.message, /tour 1 :/, 'le tour 1 doit être cité : ' + correction.erreur.message);
    assert.match(correction.erreur.message, /tour 2 :/, 'le tour 2 aussi');
    assert.ok(correction.erreur.brut && correction.erreur.brut.length > 10,
      'la réponse brute doit être gardée pour « Voir la réponse du modèle »');
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

    // ── 17. TOUT CE QUE LE MODULE PREND SUR `window` EST ATTEIGNABLE ─────────────────────────
    // LE CONTRÔLE QUI MANQUAIT. Le 9 octobre, Christophe a cliqué « Rédiger » sur son site et
    // a reçu « adresse du Worker non configurée » : adocGetWorkerUrl et adocGetApiKey sont
    // déclarées DANS l'IIFE du cœur, sans affectation sur window. Mes contrôles ne l'avaient pas
    // vu parce qu'ils employaient tous un transport simulé — qui ne touche jamais à ces deux
    // fonctions. Un faux transport ne prouve rien sur le câblage réel.
    //
    // La liste n'est pas écrite à la main : elle est BALAYÉE dans la source du module. Un
    // `window.quelqueChose` ajouté demain sera donc vérifié sans que personne y pense.
    const SOURCE_MODULE = fs.readFileSync(path.join(RACINE, 'narration-ia.js'), 'utf8');
    // Ce que le navigateur fournit lui-même, et ce que le module pose lui-même : hors sujet ici.
    const FOURNIS_PAR_LE_NAVIGATEUR = new Set(['NarrationIA', 'fetch', 'confirm', 'document',
      'setTimeout', 'clearTimeout', 'AbortController', 'localStorage', 'performance', 'Event',
      'File', 'DataTransfer', 'FileReader', 'URL', 'Blob', 'requestAnimationFrame', 'console',
      'innerWidth', 'innerHeight', 'getComputedStyle', 'createImageBitmap', 'alert']);
    const prisSurWindow = Array.from(new Set(
      (SOURCE_MODULE.match(/window\.([A-Za-z_$][\w$]*)/g) || []).map((x) => x.slice(7))))
      .filter((n) => !FOURNIS_PAR_LE_NAVIGATEUR.has(n)).sort();
    assert.ok(prisSurWindow.length >= 6,
      'le balayage doit trouver les noms pris sur window : ' + prisSurWindow.join(','));
    // Mesuré DANS LA PAGE, document ouvert — c'est l'état où le bouton existe.
    const atteignables = await page.evaluate((noms) => noms.map((n) => ({
      nom: n, type: typeof window[n], present: n in window })), prisSurWindow);
    console.log('\n      ── CE QUE LE MODULE PREND SUR `window`, MESURÉ DANS LA PAGE ──');
    const manquants = [];
    atteignables.forEach((x) => {
      const ok = x.type !== 'undefined';
      if (!ok) manquants.push(x.nom);
      console.log('      ' + (ok ? 'ok    ' : 'MANQUE') + '  ' + x.nom.padEnd(34) + 'typeof ' + x.type);
    });
    assert.deepEqual(manquants, [],
      'ces noms sont pris sur window par le module mais n\'y sont pas : ' + manquants.join(', '));
    // Et les deux constantes portent leur VALEUR, pas `undefined` : une `var` exposée avant sa
    // ligne d'affectation est hissée mais vide — elle ment sans erreur.
    const valeurs = await page.evaluate(() => ({
      motsParSeconde: window.ADOC_NARRATION_MOTS_PAR_SECONDE,
      motifPause: window.ADOC_NARRATION_PAUSE_MOTIF,
    }));
    assert.equal(valeurs.motsParSeconde, 2.5, 'la constante doit porter sa valeur');
    assert.match(String(valeurs.motifPause), /pause/, 'le motif aussi : ' + valeurs.motifPause);
    console.log('');
    pass(prisSurWindow.length + ' noms pris sur `window` par le module, tous atteignables dans la page.');

    // ── 18. LE VRAI TRANSPORT, dans la vraie page, avec `fetch` seul simulé ──────────────────
    // On ne remplace PAS le transport : c'est lui qu'on éprouve. Seul `fetch` est simulé, et
    // l'appel part du vrai bouton, donc par le vrai branchement du cœur.
    // LE TÉMOIN SE DÉDUIT DU TRAFIC, il ne se nomme pas : écrire l'adresse du Worker ici la
    // ferait entrer dans un dépôt public (« aucun identifiant d'infrastructure »). On retire
    // donc les hôtes de ressources tierces, et ce qui reste est le serveur de l'application.
    const HOTES_TIERS = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|unpkg\.com|jsdelivr/;
    const hoteDuWorker = new Set(hotesAppeles.filter((h) => !HOTES_TIERS.test(h)));
    assert.ok(hoteDuWorker.size === 1,
      'l\'application doit avoir appelé SON Worker au démarrage, pour servir de témoin : '
      + Array.from(hoteDuWorker).join(','));
    const temoin = Array.from(hoteDuWorker)[0];

    const reel = await page.evaluate(async ({ temoin }) => {
      const A = window.NarrationIA;
      const doc = window._adocArtifacts['essai1b']._adocStructuredDoc;
      const vrai = window.fetch;
      const journaux = [];
      const vraiWarn = console.warn, vraiLog = console.log, vraiErr = console.error;
      ['warn', 'log', 'error'].forEach((k) => {
        console[k] = function () { journaux.push(Array.from(arguments).join(' ')); };
      });
      let vu = null;
      window.fetch = async (url, opts) => {
        vu = { url: String(url), methode: opts && opts.method,
               entetes: Object.assign({}, opts && opts.headers),
               corps: opts && opts.body ? JSON.parse(opts.body) : null,
               aUnSignal: !!(opts && opts.signal) };
        const etapes = A.contenuArEtape ? null : null;
        const ids = (vu.corps.payload.messages[0].content.match(/stepId: (\S+)/g) || []).map((x) => x.slice(8));
        const cibles = (vu.corps.payload.messages[0].content.match(/cible: (\d+) mots/g) || []).map((x) => parseInt(x.slice(7), 10));
        const texte = JSON.stringify(ids.map((id, i) => ({ stepId: id,
          text: ('Imaginez un couple. ' + 'phrase '.repeat(Math.max(0, cibles[i] - 3))).trim() })));
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: texte }] }) };
      };
      let res = null, erreur = null;
      // AUCUN `transport` passé : c'est transportReel qui doit s'exécuter.
      try { res = await A.rediger(doc, { minutes: 4, seulementVides: false }); }
      catch (e) { erreur = e.message; }
      // Et le cas d'erreur : le serveur refuse, la clé ne doit apparaître nulle part.
      window.fetch = async () => ({ ok: false, status: 401,
        json: async () => ({ error: 'Unauthorized' }) });
      let erreur401 = null;
      try { await A.rediger(doc, { minutes: 4, seulementVides: false }); }
      catch (e) { erreur401 = e.message; }
      window.fetch = vrai;
      console.warn = vraiWarn; console.log = vraiLog; console.error = vraiErr;
      const cle = (() => { try { return localStorage.getItem('workerApiKey'); } catch (e) { return null; } })();
      return { vu, res: res && { entrees: res.entrees.length }, erreur, erreur401, journaux, cle,
               cleSurWindow: Object.keys(window).filter((k) => /cleApi|apiKey|ApiKey/.test(k)) };
    }, { temoin });

    assert.equal(reel.erreur, null, 'le vrai transport doit aboutir : ' + reel.erreur);
    assert.ok(reel.vu, 'fetch doit avoir été appelé');
    // L'URL : LE MÊME HÔTE que les appels que l'application fait d'elle-même. Le témoin vient
    // du trafic réel de la page, jamais d'une valeur que le module déclarerait.
    assert.equal(new URL(reel.vu.url).hostname, temoin,
      'le transport doit appeler le MÊME Worker que l\'application : ' + reel.vu.url);
    assert.equal(reel.vu.methode, 'POST');
    assert.equal(reel.vu.entetes['Content-Type'], 'application/json');
    assert.equal(reel.vu.entetes['X-API-Key'], reel.cle, 'la clé envoyée est celle du cœur');
    assert.ok(reel.vu.aUnSignal, 'l\'appel doit porter un signal d\'abandon (budget de délai)');
    // Le corps : la forme exacte qu'attend le proxy du Worker.
    assert.ok(reel.vu.corps.payload, 'le corps doit porter « payload »');
    assert.equal(reel.vu.corps.payload.model, 'claude-sonnet-4-6');
    assert.ok(reel.vu.corps.payload.system.indexOf('doublage') !== -1, 'le prompt système doit y être');
    assert.equal(reel.vu.corps.payload.messages.length, 1);
    assert.ok(reel.vu.corps.payload.max_tokens > 0);
    assert.equal(reel.res.entrees, 8, 'les huit étapes doivent revenir');
    // LA CLÉ N'APPARAÎT NULLE PART : ni dans l'erreur 401, ni dans un journal.
    assert.match(reel.erreur401, /le serveur a refusé l\u2019appel \(401/, 'erreur 401 : ' + reel.erreur401);
    assert.equal(reel.erreur401.indexOf(reel.cle), -1, 'la clé ne doit pas être dans l\'erreur');
    reel.journaux.forEach((j) => {
      assert.equal(j.indexOf(reel.cle), -1, 'la clé ne doit pas être dans un journal : ' + j.slice(0, 80));
    });
    assert.deepEqual(reel.cleSurWindow, [], 'aucune clé posée sur window : ' + reel.cleSurWindow.join(','));
    // L'adresse n'est pas imprimée : un relevé se colle dans une conversation. Ce qui compte
    // est qu'elle soit la MÊME que celle de l'application, et c'est l'assertion au-dessus qui
    // l'établit, pas cette ligne.
    console.log('      ' + reel.vu.methode + ' <même Worker que l\'application>  —  payload.model '
      + reel.vu.corps.payload.model + ', max_tokens ' + reel.vu.corps.payload.max_tokens
      + ', X-API-Key présent  |  401 → « ' + reel.erreur401.slice(0, 48) + '… » sans la clé');
    pass('le VRAI transport, dans la vraie page : même Worker que l\'application, clé du cœur, jamais dans une erreur ni un journal.');

    // ── 20. LES CINQ AVERTISSEMENTS, sur des fixtures NEUTRES ────────────────────────────────
    // Les cinq défauts que Christophe a refusés le 9 octobre, reproduits sur une présentation
    // sans aucun rapport avec son travail. Mesurés sur le MOTEUR ici (contrôle 20), puis sur
    // CE QUE LA PAGE AFFICHE (contrôle 21) : les deux, parce que l'un sans l'autre ment.
    const { PRESENTATION_LISTES } = require('./narration-ia-fixtures.cjs');
    const cinq = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const parId = {}; etapes.forEach((e) => { parId[e.stepId] = e; });
      const r = A.repartirMots(etapes, 4);
      const texteDocument = A.normaliserMots(etapes.map((e) =>
        (e.cardTitle || '') + ' ' + (e.texte || '')).join(' '));
      const juger = (stepId, texte, adresse) => A.avertissementsEtape(texte, parId[stepId],
        { adresse: adresse || 'vous', texteDocument: texteDocument });
      return {
        // (a) citation modifiée ET attribuée à un groupe que le document ne nomme pas
        a: juger('citation-01', 'Ceux qui bricolent le disent souvent : « un atelier rangé fait '
          + 'gagner du temps ». On les croit volontiers.'),
        // (b) un « toi » dans un texte en « vous »
        b: juger('heading-01', 'Vous rangez votre atelier quand vous partez. Et toi, tu le fais ?'),
        // (c) une liste de trois éléments parcourue dans l'ordre
        c: juger('liste-trois', 'La première chose est de remettre chaque outil à sa place avant '
          + 'de quitter la pièce. La deuxième est de vider les chutes dans un seul bac, jamais '
          + 'sur l\u2019établi. La troisième est de noter sur une feuille ce qui manque pour la '
          + 'prochaine fois.'),
        // (d) un questionnaire lu à voix haute, avec une question ajoutée
        d: juger('questionnaire-01', 'Combien d\u2019outils traînent sur votre établi en ce '
          + 'moment ? Quand avez-vous vidé les chutes pour la dernière fois ? Savez-vous ce qui '
          + 'vous manque pour votre prochain chantier ? Combien de temps perdez-vous à chercher '
          + 'un outil ? Et combien de fois avez-vous racheté un outil que vous aviez déjà ?'),
        // (e) une liste de quatre idées parcourue élément par élément
        e: juger('liste-quatre', 'Ranger en partant coûte deux minutes et en fait gagner vingt. '
          + 'Un seul bac pour les chutes évite de trier deux fois. Une liste de manques évite un '
          + 'aller-retour au magasin. Et un établi vide est une invitation à recommencer, ce qui '
          + 'est peut-être le plus important de tout, parce que c\u2019est ce qui donne envie de '
          + 'revenir le lendemain.'),
        // Le TÉMOIN : un commentaire qui ajoute au lieu de redire. Il ne doit RIEN déclencher.
        temoin: juger('liste-trois', 'Imaginez la scène. Vous fermez la porte, et demain matin '
          + 'tout sera exactement là où votre main le cherchera. [pause] C\u2019est ce que coûte '
          + 'une minute de plus, le soir.'),
        temoinCitation: juger('citation-01', 'Une phrase de l\u2019écran le dit mieux que moi : '
          + '« Un atelier bien rangé fait gagner plus de temps qu\u2019il n\u2019en coûte. »'),
        // REPRISE SEULE : douze mots de l'écran repris sans guillemets, sur un bloc qui n'est
        // ni une liste ni un questionnaire. Sans elle, retirer l'avertissement de reprise
        // passait inaperçu — les autres cas le masquaient derrière « parcours ».
        repriseSeule: juger('citation-01', 'Un atelier bien rangé fait gagner plus de temps '
          + 'qu\u2019il n\u2019en coûte, et c\u2019est vrai aussi d\u2019une cuisine.'),
        // Une phrase trop longue
        phrase: juger('heading-01', 'Il y a une chose que personne ne vous dira jamais au moment '
          + 'où vous achetez votre premier établi et que pourtant tout le monde finit par '
          + 'apprendre à ses dépens au bout de quelques mois de pratique quotidienne et de '
          + 'désordre accumulé sans que rien ne soit jamais remis en place.'),
        seuils: { suite: A.SEUIL_SUITE_MOTS, tri: A.SEUIL_TRIGRAMMES, phrase: A.SEUIL_PHRASE_LONGUE },
      };
    }, PRESENTATION_LISTES);

    const typesDe = (liste) => liste.map((x) => x.type).sort();
    assert.ok(typesDe(cinq.a).includes('citation'),
      '(a) la citation modifiée doit être signalée : ' + JSON.stringify(cinq.a));
    assert.ok(typesDe(cinq.b).includes('adresse'),
      '(b) le « toi » dans un texte en « vous » doit être signalé : ' + JSON.stringify(cinq.b));
    assert.ok(typesDe(cinq.c).includes('parcours'),
      '(c) la liste de trois parcourue doit être signalée : ' + JSON.stringify(cinq.c));
    assert.ok(typesDe(cinq.d).includes('parcours'),
      '(d) le questionnaire lu doit être signalé : ' + JSON.stringify(cinq.d));
    assert.ok(typesDe(cinq.e).includes('parcours') || typesDe(cinq.e).includes('reprise'),
      '(e) la liste de quatre parcourue doit être signalée : ' + JSON.stringify(cinq.e));
    assert.deepEqual(typesDe(cinq.repriseSeule), ['reprise'],
      'une reprise littérale SANS guillemets doit être signalée, et elle seule : '
      + JSON.stringify(cinq.repriseSeule));
    assert.ok(cinq.repriseSeule[0].suite >= cinq.seuils.suite,
      'la plus longue suite doit atteindre le seuil : ' + cinq.repriseSeule[0].suite);
    assert.ok(cinq.phrase.some((x) => x.type === 'phrase' && x.mots > cinq.seuils.phrase),
      'une phrase de plus de ' + cinq.seuils.phrase + ' mots doit être signalée : ' + JSON.stringify(cinq.phrase));
    // LE TÉMOIN : sans lui, un détecteur qui signale TOUT passerait les six assertions ci-dessus.
    assert.deepEqual(cinq.temoin, [],
      'un commentaire qui ajoute ne doit RIEN déclencher : ' + JSON.stringify(cinq.temoin));
    assert.deepEqual(cinq.temoinCitation, [],
      'une citation EXACTE ne doit rien déclencher : ' + JSON.stringify(cinq.temoinCitation));
    console.log('      (a) ' + typesDe(cinq.a).join(',') + '  (b) ' + typesDe(cinq.b).join(',')
      + '  (c) ' + typesDe(cinq.c).join(',') + '  (d) ' + typesDe(cinq.d).join(',')
      + '  (e) ' + typesDe(cinq.e).join(',') + '  |  témoins : rien');
    pass('les cinq défauts du 9 octobre signalés sur fixtures neutres ; deux témoins ne déclenchent rien.');

    // (f) UN TITRE UN MOT SOUS LA TOLÉRANCE. Avec le plancher de 8 mots décidé le 9 octobre, il
    // passe ; avec l'ancien plancher de 5, il serait signalé. C'est exactement la différence que
    // le plancher doit faire, et elle se mesure.
    const titreLimite = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d).filter((e) => e.type === 'heading').slice(0, 1);
      const cible = 20;
      const r = { cibles: [{ stepId: etapes[0].stepId, mots: cible }] };
      const mots = (n) => 'mot '.repeat(n).trim() + '.';
      // marge = max(plancher, 20 % de 20 = 4). Avec 8 → 12..28 ; avec 5 → 15..25.
      const treize = JSON.stringify([{ stepId: etapes[0].stepId, text: mots(13) }]);
      const v = A.validerReponse(treize, etapes, r, {});
      return { plancherTitre: A.TOLERANCE_PLANCHER_TITRE, plancher: A.TOLERANCE_PLANCHER,
               type: etapes[0].type, marge: v.entrees[0] && v.entrees[0].marge,
               horsTolerance: v.entrees[0] && v.entrees[0].horsTolerance,
               longueurs: v.longueurs.length, mots: v.entrees[0] && v.entrees[0].mots };
    }, PRESENTATION_LISTES);
    assert.equal(titreLimite.plancherTitre, 8, 'le plancher des titres est de 8 mots');
    assert.equal(titreLimite.marge, 8, 'la marge appliquée à un titre de cible 20 doit être 8 : '
      + titreLimite.marge);
    assert.equal(titreLimite.horsTolerance, false,
      'treize mots pour une cible de vingt tiennent dans la marge d\'un titre');
    assert.equal(titreLimite.longueurs, 0, 'et rien n\'est signalé');
    assert.ok(titreLimite.marge > titreLimite.plancher,
      'le plancher des titres doit être PLUS LARGE que le plancher général ('
      + titreLimite.plancher + ')');
    console.log('      titre, cible 20, reçu ' + titreLimite.mots + ' mots : marge '
      + titreLimite.marge + ' (plancher titre ' + titreLimite.plancherTitre
      + ', général ' + titreLimite.plancher + ') → dans la tolérance');
    pass('un titre un mot sous l\'ancienne tolérance passe avec le plancher de 8 mots.');

    // ── 21. CE QUE LA PAGE AFFICHE : avertissements, total honnête, bouton de réécriture ─────
    // Tout ce qui précède interroge le MODULE. Ce contrôle-ci lit le DOM et clique : c'est la
    // seule façon de savoir ce que Christophe verra.
    await page.evaluate((d) => {
      window._adocArtifacts['listes'] = {
        name: d.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: false, blockEditing: true, export: true, qualityControlledExport: true },
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)),
        _adocStructuredSnapshot: { sourceSnapshotId: d.sourceSnapshotId, entries: [] },
      };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'listes' });
      return window.adocOpenWorkspace('listes');
    }, PRESENTATION_LISTES);
    await page.waitForTimeout(600);
    // Un transport qui produit EXACTEMENT les défauts du 9 octobre, sur la fixture neutre.
    await page.evaluate(() => {
      const DEFAUTS = {
        'liste-trois': 'La première chose est de remettre chaque outil à sa place avant de quitter '
          + 'la pièce. La deuxième est de vider les chutes dans un seul bac, jamais sur l\u2019établi. '
          + 'La troisième est de noter sur une feuille ce qui manque pour la prochaine fois.',
        'citation-01': 'Ceux qui bricolent le disent souvent : « un atelier rangé fait gagner du '
          + 'temps ». On les croit volontiers, et on range quand même rarement.',
        'heading-01': 'Vous rangez votre atelier quand vous partez. Et toi, tu le fais vraiment, '
          + 'chaque soir, ou seulement quand la pile devient trop haute pour être ignorée ?',
      };
      window.NarrationIA._transportDEssai = async (req) => {
        const bloc = req.messages[0].content;
        const ids = (bloc.match(/stepId: (\S+)/g) || []).map((x) => x.slice(8));
        const cibles = (bloc.match(/cible: (\d+) mots/g) || []).map((x) => parseInt(x.slice(7), 10));
        return JSON.stringify(ids.map((id, i) => ({ stepId: id,
          text: DEFAUTS[id] || ('Imaginez la scène. ' + 'mot '.repeat(Math.max(0, cibles[i] - 3))).trim() })));
      };
    });
    const ouvrirPanneau = await page.evaluate(async () => {
      const d = window._adocArtifacts['listes']._adocStructuredDoc;
      const e = window.adocPresentStepList(d)[0];
      const el = document.getElementById(e.stepId) || document.getElementById('root:card-title:' + e.cardId);
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 400));
      return !!document.querySelector('.nia-bouton');
    });
    assert.equal(ouvrirPanneau, true, 'le bouton doit être posé sur ce document aussi');
    await page.evaluate(() => {
      const p = document.querySelector('.nia-panneau');
      if (p.hidden) document.querySelector('.nia-bouton').click();
      p.querySelector('.nia-vides').checked = false;
    });
    await page.click('.nia-generer');
    await page.waitForFunction(() => /étape\(s\) rédigée\(s\)/.test(document.querySelector('.nia-etat').textContent),
      { timeout: 20000 });

    const vuDansLaPage = await page.evaluate(() => {
      const p = document.querySelector('.nia-panneau');
      const etapes = Array.from(p.querySelectorAll('.nia-etape')).map((el) => ({
        stepId: el.dataset.stepId,
        meta: el.querySelector('.nia-meta').textContent,
        texte: el.querySelector('.nia-texte').textContent,
        avertis: Array.from(el.querySelectorAll('.nia-avertis li')).map((li) => li.textContent),
        aUnBoutonReecrire: !!el.querySelector('.nia-reecrire'),
      }));
      // Le bouton de réécriture de la première étape est-il ATTEINT par le pointeur ?
      const btn = p.querySelector('.nia-etape .nia-reecrire');
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      const dessus = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                               Math.round(r.top + r.height / 2));
      const d = window._adocArtifacts['listes']._adocStructuredDoc;
      return { etat: p.querySelector('.nia-etat').textContent, etapes: etapes,
               boutonAtteint: dessus === btn || (dessus && btn.contains(dessus)),
               narrationDansLeDoc: (d.narration || []).length,
               sommeAffichee: (p.querySelector('.nia-etat').textContent.match(/(\d+) mots reçus/) || [])[1],
               sommeReelle: etapes.reduce((a, e) => a + (e.texte.trim()
                 ? window.adocNarrationCount(e.texte).mots : 0), 0) };
    });

    // LE TOTAL AFFICHÉ EST LA SOMME RÉELLE, jamais la cible.
    assert.ok(/mots reçus, cible/.test(vuDansLaPage.etat),
      'la ligne d\'état doit dire « mots reçus, cible … » : ' + vuDansLaPage.etat);
    assert.equal(Number(vuDansLaPage.sommeAffichee), vuDansLaPage.sommeReelle,
      'le nombre affiché doit être la SOMME des textes affichés : ' + vuDansLaPage.sommeAffichee
      + ' affiché pour ' + vuDansLaPage.sommeReelle + ' réels');
    assert.ok(/%, environ .* min pour/.test(vuDansLaPage.etat),
      'l\'écart et les deux durées doivent être dits : ' + vuDansLaPage.etat);
    // LES AVERTISSEMENTS SONT LUS DANS LE DOM, sous leur étape.
    const parStep = {};
    vuDansLaPage.etapes.forEach((e) => { parStep[e.stepId] = e.avertis.join(' | '); });
    assert.match(parStep['liste-trois'] || '', /parcourt la liste élément par élément/,
      'la liste parcourue, affichée : ' + parStep['liste-trois']);
    assert.match(parStep['citation-01'] || '', /citation non identique/,
      'la citation modifiée, affichée : ' + parStep['citation-01']);
    assert.match(parStep['heading-01'] || '', /passe au tu/,
      'le passage au tu, affiché : ' + parStep['heading-01']);
    assert.ok(vuDansLaPage.etapes.every((e) => e.aUnBoutonReecrire),
      'chaque étape doit porter son bouton « Réécrire cette étape »');
    assert.equal(vuDansLaPage.boutonAtteint, true,
      'et ce bouton doit être ATTEINT par le pointeur, pas seulement présent');
    assert.equal(vuDansLaPage.narrationDansLeDoc, 0, 'rien n\'est écrit avant « Appliquer »');
    console.log('      état : ' + vuDansLaPage.etat.split('\n')[1]);
    vuDansLaPage.etapes.filter((e) => e.avertis.length).forEach((e) => {
      console.log('      ' + e.stepId.padEnd(16) + e.avertis.join(' / '));
    });
    pass('la page AFFICHE les avertissements sous chaque étape, et le total est la somme reçue.');

    // ── 22. « RÉÉCRIRE CETTE ÉTAPE » ne touche que l'aperçu ──────────────────────────────────
    const avantReecriture = await page.evaluate(() =>
      document.querySelector('.nia-etape[data-step-id="liste-trois"] .nia-texte').textContent);
    await page.evaluate(() => {
      window.NarrationIA._transportDEssai = async (req) => {
        const bloc = req.messages[0].content;
        const id = (bloc.match(/stepId: (\S+)/) || [])[1];
        const cible = parseInt((bloc.match(/cible: (\d+) mots/) || [])[1], 10);
        window.__consigneVue = (bloc.match(/Consigne de l\u2019auteur : (.*)$/m) || [])[1];
        window.__messageVu = bloc;
        // Des PHRASES, pas un seul bloc de mots : sans ponctuation, le texte compterait comme
        // une phrase unique et déclencherait à juste titre « phrase de N mots ». La fixture
        // doit ressembler à ce qu'un modèle écrit, sinon elle éprouve autre chose.
        const phrases = [];
        let restants = Math.max(0, cible - 5);
        while (restants > 0) {
          const n = Math.min(10, restants);
          phrases.push('mot '.repeat(n).trim() + '.');
          restants -= n;
        }
        return JSON.stringify([{ stepId: id,
          text: ('Imaginez la porte qui se referme. ' + phrases.join(' ')).trim() }]);
      };
      const el = document.querySelector('.nia-etape[data-step-id="liste-trois"]');
      el.querySelector('.nia-consigne').value = 'plus court, un autre exemple';
      el.querySelector('.nia-reecrire').click();
    });
    await page.waitForFunction(() => /réécrite dans l\u2019aperçu/.test(document.querySelector('.nia-etat').textContent),
      { timeout: 20000 });
    const apresReecriture = await page.evaluate(() => ({
      texte: document.querySelector('.nia-etape[data-step-id="liste-trois"] .nia-texte').textContent,
      avertis: Array.from(document.querySelectorAll('.nia-etape[data-step-id="liste-trois"] .nia-avertis li')).map((li) => li.textContent),
      consigne: window.__consigneVue,
      message: window.__messageVu,
      narrationDansLeDoc: (window._adocArtifacts['listes']._adocStructuredDoc.narration || []).length,
      nEtapes: document.querySelectorAll('.nia-etape').length,
    }));
    assert.notEqual(apresReecriture.texte, avantReecriture, 'le texte de l\'aperçu doit changer');
    assert.equal(apresReecriture.narrationDansLeDoc, 0,
      'la réécriture ne doit RIEN écrire dans le document');
    assert.equal(apresReecriture.consigne, 'plus court, un autre exemple',
      'la consigne libre doit partir avec l\'appel : ' + apresReecriture.consigne);
    assert.deepEqual(apresReecriture.avertis, [],
      'le texte réécrit ne parcourt plus la liste : ' + apresReecriture.avertis.join(' | '));
    // L'APPEL NE PORTE QUE CETTE ÉTAPE : les identifiants des autres n'y sont pas.
    const autresIds = (apresReecriture.message.match(/stepId: (\S+)/g) || []);
    assert.equal(autresIds.length, 1, 'un seul stepId dans le message : ' + autresIds.join(','));
    assert.ok(/Commentaire de l\u2019étape (PRÉCÉDENTE|SUIVANTE)/.test(apresReecriture.message),
      'mais la continuité est donnée (étape précédente et/ou suivante)');
    assert.equal(apresReecriture.nEtapes, vuDansLaPage.etapes.length, 'l\'aperçu garde ses étapes');
    console.log('      consigne transmise : « ' + apresReecriture.consigne + ' »  |  un seul stepId dans l\'appel');
    pass('« Réécrire cette étape » : un seul stepId, la consigne transmise, l\'aperçu change, le document non.');

    // ── 24. LA PUCE ORPHELINE, et jamais de puce vide à l'écran ──────────────────────────────
    // Christophe voit « une ligne * isolée sous chaque étape ». Mesuré : la règle Markdown
    // exigeait une espace APRÈS la puce, donc une puce en toute fin de texte passait.
    const puce = await page.evaluate(async (d) => {
      const A = window.NarrationIA;
      const etapes = A.contenuParEtape(d);
      const r = A.repartirMots(etapes, 4);
      const cible = {}; r.cibles.forEach((c) => { cible[c.stepId] = c.mots; });
      const corps = (n) => {
        const ph = [];
        let reste = Math.max(0, n - 3);
        while (reste > 0) { const k = Math.min(10, reste); ph.push('mot '.repeat(k).trim() + '.'); reste -= k; }
        return 'Imaginez la scène. ' + ph.join(' ');
      };
      const avec = (suffixe) => JSON.stringify(etapes.map((e) => ({ stepId: e.stepId,
        text: corps(cible[e.stepId]) + suffixe })));
      const juger = (suffixe) => {
        const v = A.validerReponse(avec(suffixe), etapes, r, {});
        return { ok: v.ok, violations: v.violations.slice(0, 2) };
      };
      return {
        asterisqueFin: juger('\n*'),
        tiretFin: juger('\n-'),
        plusFin: juger('\n+'),
        asterisqueMilieu: juger('\n*\nSuite.'),
        propre: juger(''),
        cadratin: juger(' Un dernier mot — et voilà.'),
        // Et la fonction seule, pour que l'échec dise laquelle des deux règles a parlé.
        detecte: {
          fin: A.contientMarkdown('Un texte.\n*'),
          tiretFin: A.contientMarkdown('Un texte.\n-'),
          propre: A.contientMarkdown('Imaginez la scène. Et vous ?'),
          cadratin: A.contientMarkdown('Un texte — ordinaire — ici.'),
          gras: A.contientMarkdown('Un **mot** en gras.'),
        },
      };
    }, PRESENTATION);
    ['asterisqueFin', 'tiretFin', 'plusFin', 'asterisqueMilieu'].forEach((nom) => {
      assert.equal(puce[nom].ok, false, nom + ' : une puce orpheline doit être refusée');
      assert.ok(puce[nom].violations.some((v) => /Markdown/.test(v)),
        nom + ' : ' + JSON.stringify(puce[nom].violations));
    });
    // LES TÉMOINS : un texte propre et un tiret cadratin légitime ne déclenchent rien.
    assert.equal(puce.propre.ok, true, 'un texte propre passe : ' + puce.propre.violations.join(' | '));
    assert.equal(puce.cadratin.ok, true,
      'un tiret cadratin est légitime depuis le 9 octobre : ' + puce.cadratin.violations.join(' | '));
    assert.equal(puce.detecte.cadratin, false, 'le tiret cadratin n\'est pas une puce');
    assert.equal(puce.detecte.propre, false);
    assert.equal(puce.detecte.gras, true, 'le gras Markdown reste refusé');
    console.log('      puce orpheline : * - + en fin de texte → refusés ; tiret cadratin → accepté');
    pass('la puce orpheline est refusée (* - + seuls), le tiret cadratin reste accepté.');

    // Et À L'ÉCRAN : aucune puce vide sous une étape sans avertissement.
    // On force un avertissement SANS TEXTE dans l'aperçu : aucun des cinq n'en produit, mais
    // le filtre doit tenir le jour où l'un d'eux le ferait.
    await page.evaluate(() => {
      const doc = window._adocArtifacts['listes']._adocStructuredDoc;
      const e = window.adocPresentStepList(doc)[0];
      window.NarrationIA._rendreApercu(document.querySelector('.nia-panneau'), {
        entrees: [
          { stepId: e.stepId, text: 'Un texte.', mots: 2, cible: 20,
            avertissements: [{ type: 'vide', texte: '' },
                             { type: 'vide2', texte: '   ' },
                             { type: 'vrai', texte: 'un vrai avertissement' }] },
          // Une étape SANS aucun avertissement : sa liste doit être masquée, pas vide-et-visible.
          { stepId: e.stepId + '-bis', text: 'Un autre texte.', mots: 3, cible: 20,
            avertissements: [] },
        ],
        repartition: { total_reparti: 20, duree_estimee_s: 8 },
      }, doc);
    });
    const pucesVides = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('.nia-etape .nia-avertis li'));
      const uls = Array.from(document.querySelectorAll('.nia-etape .nia-avertis'));
      return {
        liVides: lis.filter((li) => !li.textContent.trim()).length,
        ulsVisiblesEtVides: uls.filter((ul) => !ul.hidden && !ul.children.length).length,
        total: uls.length,
        liAffichees: lis.map((li) => li.textContent),
      };
    });
    assert.deepEqual(pucesVides.liAffichees, ['un vrai avertissement'],
      'seul l\'avertissement qui porte un texte doit être affiché : '
      + JSON.stringify(pucesVides.liAffichees));
    assert.equal(pucesVides.liVides, 0, 'aucune puce sans texte à l\'écran');
    assert.equal(pucesVides.ulsVisiblesEtVides, 0,
      'une liste d\'avertissements vide doit être masquée : ' + pucesVides.ulsVisiblesEtVides
      + ' sur ' + pucesVides.total);
    pass('à l\'écran, aucune puce vide et aucune liste d\'avertissements vide affichée.');
    // On remet l'aperçu réel : le contrôle ci-dessus l'a remplacé par un rendu à une seule
    // étape, et le contrôle suivant travaille sur la liste complète.
    await page.evaluate(() => {
      window.NarrationIA._rendreApercu(document.querySelector('.nia-panneau'),
        window.__dernierRes, window.__dernierDoc);
    });
    await page.waitForTimeout(150);

    // ── 25. « APPLIQUER CETTE ÉTAPE » : n'écrire que les étapes cochées ──────────────────────
    const parEtape = await page.evaluate(async () => {
      const p = document.querySelector('.nia-panneau');
      const etapes = Array.from(p.querySelectorAll('.nia-etape'));
      const cases = etapes.map((el) => el.querySelector('.nia-garder-case'));
      const avantDecoche = { toutesCochees: cases.every((c) => c.checked),
                             libelle: p.querySelector('.nia-appliquer').textContent };
      // On décoche la deuxième étape, comme Christophe écarterait une étape à refaire.
      cases[1].checked = false;
      cases[1].dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const apresDecoche = { libelle: p.querySelector('.nia-appliquer').textContent,
                             grisee: etapes[1].dataset.ecartee };
      // La case est-elle ATTEINTE par le pointeur ?
      cases[1].scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 150));
      const r0 = cases[1].getBoundingClientRect();
      const dessus = document.elementFromPoint(Math.round(r0.left + r0.width / 2),
                                               Math.round(r0.top + r0.height / 2));
      return { avantDecoche, apresDecoche, nEtapes: etapes.length,
               caseAtteinte: dessus === cases[1],
               stepIdEcartee: etapes[1].dataset.stepId,
               stepIds: etapes.map((el) => el.dataset.stepId) };
    });
    assert.equal(parEtape.avantDecoche.toutesCochees, true, 'toutes les cases cochées par défaut');
    assert.match(parEtape.avantDecoche.libelle, /^Appliquer \(\d+\)$/,
      'le bouton dit combien : ' + parEtape.avantDecoche.libelle);
    assert.match(parEtape.apresDecoche.libelle, /sur \d+\)$/,
      'et le dit encore quand on décoche : ' + parEtape.apresDecoche.libelle);
    assert.equal(parEtape.apresDecoche.grisee, '1', 'l\'étape écartée est marquée à l\'écran');
    assert.equal(parEtape.caseAtteinte, true, 'la case doit être ATTEINTE par le pointeur');

    // On applique, et SEULES les étapes cochées doivent être écrites.
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.nia-appliquer');
    await page.waitForTimeout(400);
    const ecrit = await page.evaluate(() => {
      const d = window._adocArtifacts['listes']._adocStructuredDoc;
      return { n: (d.narration || []).length,
               ids: (d.narration || []).map((x) => x.stepId),
               etat: document.querySelector('.nia-etat').textContent };
    });
    assert.equal(ecrit.n, parEtape.nEtapes - 1,
      'une étape décochée ne doit PAS être écrite : ' + ecrit.n + ' pour ' + (parEtape.nEtapes - 1));
    assert.equal(ecrit.ids.indexOf(parEtape.stepIdEcartee), -1,
      'et c\'est bien celle-là qui manque : ' + ecrit.ids.join(','));
    assert.match(ecrit.etat, /étape\(s\) écartée\(s\)/, 'le nombre d\'écartées est dit : ' + ecrit.etat);
    // « Annuler ce geste » restaure l'état d'avant, comme toujours.
    await page.click('.nia-annuler');
    await page.waitForTimeout(300);
    const apresAnnulation = await page.evaluate(() =>
      (window._adocArtifacts['listes']._adocStructuredDoc.narration || []).length);
    assert.equal(apresAnnulation, 0, 'l\'annulation restaure l\'état d\'avant, écartées comprises');
    // ET ELLE SURVIT À UN NOUVEAU RENDU : réécrire une étape ne doit pas recocher les écartées.
    const apresRendu = await page.evaluate(async () => {
      const p = document.querySelector('.nia-panneau');
      const etapes = Array.from(p.querySelectorAll('.nia-etape'));
      etapes[1].querySelector('.nia-garder-case').checked = false;
      etapes[1].querySelector('.nia-garder-case').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      // Un nouveau rendu de l'aperçu, exactement ce que fait une réécriture.
      window.NarrationIA._rendreApercu(p, window.__dernierRes, window.__dernierDoc);
      await new Promise((r) => setTimeout(r, 120));
      const apres = Array.from(p.querySelectorAll('.nia-etape'));
      return { cochee: apres[1].querySelector('.nia-garder-case').checked,
               marquee: apres[1].dataset.ecartee,
               libelle: p.querySelector('.nia-appliquer').textContent };
    });
    assert.equal(apresRendu.cochee, false,
      'une étape écartée doit le RESTER après un nouveau rendu de l\'aperçu');
    assert.equal(apresRendu.marquee, '1', 'et rester marquée à l\'écran');
    console.log('      ' + parEtape.avantDecoche.libelle + ' → ' + parEtape.apresDecoche.libelle
      + '  |  ' + ecrit.n + ' écrites sur ' + parEtape.nEtapes + ', annulation → 0');
    pass('« appliquer cette étape » : cochée par défaut, le bouton dit combien, seules les cochées sont écrites.');

    // ── 19. AUCUN APPEL RÉSEAU causé par la rédaction ────────────────────────────────────────
    // L'application appelle le Worker et des CDN au DÉMARRAGE — c'est son comportement, pas
    // celui de ce lot. Ce qui doit être vrai : entre l'ouverture du panneau et l'annulation du
    // geste, rien n'est sorti. Le transport est simulé, donc aucun appel réel n'a lieu.
    const sortiesPendantRedaction = sorties.slice(sortiesAvantRedaction);
    assert.deepEqual(sortiesPendantRedaction, [],
      'la rédaction ne doit causer AUCUNE sortie réseau : ' + sortiesPendantRedaction.join(', '));
    console.log('      ' + sortiesAvantRedaction + ' sortie(s) au démarrage de l\'application ('
      + Array.from(new Set(sorties.slice(0, sortiesAvantRedaction)))
          .map((h) => HOTES_TIERS.test(h) ? h : '<le Worker>').join(', ')
      + '), 0 pendant la rédaction.');
    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    pass('aucune sortie réseau causée par la rédaction, aucune erreur de page sur la séance.');

    console.log('\nPASS verify-narration-ia — ' + n + '/' + n + '.');
  } finally {
    await browser.close();
    serveur.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
