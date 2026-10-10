// LOT 1b — LES TROIS FAUX AVERTISSEMENTS, relevés par Christophe au troisième tirage.
//
//   NODE_PATH=<playwright> node tests/verify-narration-avertissements.cjs
//
// Quatre avertissements sur dix étaient faux. Ce fichier éprouve les trois causes, dans la VRAIE
// page et par la VRAIE fonction (`window.NarrationIA.avertissementsEtape`), jamais sur une copie
// de ses règles.
//
// 1. « passe au tu » sur deux étapes sans aucun « tu ». Cause : `/\b(toi|tu|ton|ta|tes)\b/i`.
//    En JavaScript, sans le drapeau `u`, « ê » est une NON-lettre pour `\b` : il y a donc une
//    borne de mot entre « ê » et « t », et `tes` se retrouve dans « êtes ».
// 2. « citation non identique » sur un dialogue imaginé entre guillemets après « Imaginez… ».
// 3. Une étape de liste qui annonce une idée puis en énumère trois.
//
// CE QUE CE CONTRÔLE NE FAIT PAS : aucun appel réel, aucun transport, aucune clé. Il n'éprouve
// que des fonctions pures et la fonction d'avertissement, sur des textes écrits ici.

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(RACINE, 'narration-ia.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

function servir() {
  return new Promise((ok) => {
    const srv = http.createServer((q, s) => {
      const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '');
      const abs = path.join(RACINE, rel);
      if (!abs.startsWith(RACINE) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        s.writeHead(404); s.end('non'); return;
      }
      s.writeHead(200, { 'content-type': TYPES[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(s);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

// ── LES MOTS DU FRANÇAIS QUI NE DOIVENT RIEN DÉCLENCHER ─────────────────────────────────────
// Les six que Christophe a nommés, PLUS la famille entière que la mesure a révélée : toute
// lettre accentuée placée juste avant « tu », « toi », « ton », « ta » ou « tes » ouvre la même
// porte. Quinze faux positifs sur l'ancienne expression, pas deux.
const FRANCAIS_INNOCENT = [
  // les six de Christophe
  'êtes', 'être', 'Étienne', 'tant', 'tonalité', 'table',
  // ses deux phrases réelles
  'vous êtes ensemble depuis dix ans', 'vous en êtes réellement',
  // la famille par `tes`
  'fêtes', 'têtes', 'bêtes', 'quêtes', 'arrêtes', 'tempêtes', 'prêtes', 'pâtes',
  // la famille par `ton`
  'béton', 'bâton', 'piéton', 'étonnant',
  // la famille par `ta`
  'appâta', 'hâte', 'côté', 'ôter', 'statue', 'bateau', 'tableau', 'attention', 'situation',
  // CES MOTS EXIGENT LA BORNE DE GAUCHE : ils FINISSENT par « tu » après une lettre ASCII.
  // Sans le lookbehind, le seul lookahead les laisserait passer pour du tutoiement.
  'vertu', 'battu', 'vêtu', 'abattu', 'combattu',
  // le vouvoiement, qui ne doit pas déclencher l'avertissement inverse
  'vous', 'votre', 'vos',
];

const TUTOIEMENTS_VRAIS = [
  'tu viens quand tu veux', 'pour toi', 'ton choix', 'ta place', 'tes mots',
  'Tu', 'TOI', 'et tu sais', '(tu)', 'à toi de voir', 'c’est ton tour',
];

// `--seulement §1,§2` ne lance que les sections nommées. Le falsifieur s'en sert pour ne
// rejouer QUE le contrôle que sa mutation vise.
const FILTRE = (() => {
  const i = process.argv.indexOf('--seulement');
  if (i < 0) return null;
  return String(process.argv[i + 1] || '').split(',').map((x) => x.trim()).filter(Boolean);
})();

// ── RÉFÉRENCE AU SUPPORT (4e tirage) ────────────────────────────────────────────────────────
// LE DÉTERMINANT PORTE LA DÉCISION, et c'est ce qui tranche les deux cas que Christophe m'a
// laissés : un déterminant DÉFINI ou DÉMONSTRATIF désigne le support qu'on a sous les yeux, un
// déterminant INDÉFINI introduit une chose dont on parle. Et « l'écran » n'est jamais signalé,
// puisque le prompt l'autorise comme la bonne façon de nommer ce qu'on voit.
const SUPPORT_VRAIS = [
  'le document', 'ce document', 'cette présentation', 'cette diapositive',
  'comme le dit le document', 'tiré du document', 'les documents le montrent',
  'dans cette présentation', 'ces diapositives', 'de la présentation',
  // DÉCIDÉ : « ce document-là » est un démonstratif sur un nom de support. Il se signale.
  'ce document-là est à vous',
];
const SUPPORT_FAUX = [
  // DÉCIDÉ : indéfini → ce n'est pas le support, c'est un objet du propos.
  'un document de travail', 'un bon document', 'une présentation claire',
  // DÉCIDÉ : « l'écran » est la formulation que le prompt RECOMMANDE.
  // Les trois premières portent un déterminant ÉLIDÉ (`l’`), qui n'est pas dans la liste des
  // déterminants : elles ne pourraient pas matcher même si « écran » devenait un nom de support.
  // Les trois suivantes portent un déterminant DE LA LISTE : ce sont elles le vrai témoin.
  // Sans elles, ajouter « écran » aux noms de support ne faisait échouer aucun contrôle.
  'l’écran', 'à l’écran', 'ce qu’on voit à l’écran',
  'cet écran', 'les écrans', 'sur cet écran',
  // des mots de la même famille, qui ne désignent aucun support
  'documenter sa pratique', 'la documentation', 'présenter les choses autrement',
  'sa présentation de soi', 'le présent',
];

let reussis = 0;
let ignores = 0;
const echecs = [];
async function controle(nom, fn) {
  if (FILTRE && !FILTRE.some((f) => nom.startsWith(f))) { ignores++; return; }
  try { await fn(); reussis++; console.log('  ok   ' + nom); }
  catch (e) { echecs.push(nom + ' → ' + e.message); console.log('  ÉCHEC ' + nom + '\n        ' + e.message); }
}

(async () => {
  console.log('\nLOT 1b — les trois faux avertissements\n');
  const srv = await servir();
  const port = srv.address().port;
  const nav = await chromium.launch();
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('workerApiKey', 'cle-de-test-sans-valeur'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html');
  await page.waitForFunction(() => typeof window.NarrationIA === 'object'
    && typeof window.NarrationIA.avertissementsEtape === 'function'
    && typeof window.NarrationIA.phrasesDe === 'function');

  // ── §0 — SAFARI PORTE-T-IL CE QU'ON EMPLOIE ? ─────────────────────────────────────────────
  // Le lookbehind et `\p{L}` demandent Safari 16.4. On le vérifie DANS la page, en construisant
  // l'expression comme le module la construit — pas en lisant une table de compatibilité.
  await controle('§0 la page sait construire une borne Unicode (lookbehind + \\p{L})', async () => {
    const r = await page.evaluate(() => {
      try {
        const re = window.NarrationIA.borneMot('tu|toi');
        return { ok: true, source: re.source, drapeaux: re.flags,
                 essai: re.test('tu') && !re.test('statue') };
      } catch (e) { return { ok: false, err: String(e.message) }; }
    });
    assert.ok(r.ok, 'la construction a levé : ' + r.err);
    assert.ok(r.drapeaux.includes('u'), 'le drapeau u est nécessaire à \\p{L} : ' + r.drapeaux);
    assert.ok(r.drapeaux.includes('i'), 'la casse doit être ignorée : ' + r.drapeaux);
    assert.ok(r.essai, 'la borne doit prendre « tu » et épargner « statue »');
    console.log('        ' + r.source + '  drapeaux ' + r.drapeaux);
  });

  // ── §1 — LE TUTOIEMENT : AUCUN FAUX POSITIF, AUCUN VRAI MANQUÉ ────────────────────────────
  await controle('§1 « passe au tu » : ' + FRANCAIS_INNOCENT.length + ' mots français épargnés, '
    + TUTOIEMENTS_VRAIS.length + ' tutoiements détectés', async () => {
    const r = await page.evaluate(([innocents, vrais]) => {
      const A = window.NarrationIA;
      const etape = { contenuBrut: null, texte: '' };
      const avertit = (t) => A.avertissementsEtape(t, etape, { adresse: 'vous', texteDocument: '' })
        .some((a) => a.type === 'adresse');
      return {
        faux: innocents.filter(avertit),
        manques: vrais.filter((t) => !avertit(t)),
      };
    }, [FRANCAIS_INNOCENT, TUTOIEMENTS_VRAIS]);
    assert.deepEqual(r.faux, [],
      'mots français signalés à tort comme tutoiement : ' + JSON.stringify(r.faux));
    assert.deepEqual(r.manques, [],
      'vrais tutoiements non détectés : ' + JSON.stringify(r.manques));
    console.log('        ' + FRANCAIS_INNOCENT.length + ' mots épargnés · ' +
      TUTOIEMENTS_VRAIS.length + ' tutoiements détectés');
  });

  await controle('§1b les deux phrases EXACTES de Christophe ne déclenchent plus rien', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const etape = { contenuBrut: null, texte: '' };
      return ['vous êtes ensemble depuis dix ans', 'vous en êtes réellement']
        .map((t) => ({ texte: t,
          types: A.avertissementsEtape(t, etape, { adresse: 'vous', texteDocument: '' })
            .map((a) => a.type) }));
    });
    r.forEach((x) => assert.ok(!x.types.includes('adresse'),
      '« ' + x.texte + ' » déclenche encore : ' + JSON.stringify(x.types)));
    console.log('        les deux phrases : aucun avertissement d\'adresse');
  });

  await controle('§1c l\'avertissement INVERSE (« passe au vous ») suit la même règle', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const etape = { contenuBrut: null, texte: '' };
      const avertit = (t) => A.avertissementsEtape(t, etape, { adresse: 'tu', texteDocument: '' })
        .some((a) => a.type === 'adresse');
      return { vrais: ['vous venez', 'votre choix', 'vos mots'].filter(avertit),
               faux: ['époux', 'Vosges', 'dévoué', 'révolu'].filter(avertit) };
    });
    assert.equal(r.vrais.length, 3, 'les trois vouvoiements doivent être vus : ' + JSON.stringify(r.vrais));
    assert.deepEqual(r.faux, [], 'faux positifs : ' + JSON.stringify(r.faux));
  });

  // ── §2 — CITATION PROCHE CONTRE PROPOS IMAGINÉ ────────────────────────────────────────────
  await controle('§2 le dialogue imaginé n\'est plus un défaut ; la citation abîmée en reste un', async () => {
    const ECRAN = 'Le silence qui suit une dispute protège autant qu’il isole. '
                + 'Chacun attend que l’autre fasse le premier pas.';
    const r = await page.evaluate((ecran) => {
      const A = window.NarrationIA;
      const etape = { contenuBrut: null, texte: ecran };
      // ON APPELLE COMME LA PRODUCTION APPELLE : `texteDocument` est un TABLEAU de mots
      // normalisés (c'est ce que `rediger` et `reecrireEtape` construisent), et `texteDocumentBrut`
      // est la chaîne dont on tire les phrases. Mon premier jet passait la chaîne aux deux, ce que
      // le vrai chemin ne fait jamais — régression #11(a), et c'est ce contrôle qui l'a dit.
      const essai = (com) => {
        const l = A.avertissementsEtape(com, etape, { adresse: 'vous',
          texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran });
        return {
          citation: l.filter((a) => a.type === 'citation').map((a) => ({ t: a.texte, part: a.part })),
          imagine: l.filter((a) => a.type === 'propos-imagine')
            .map((a) => ({ part: a.part, information: a.information })),
        };
      };
      return {
        seuil: A.SEUIL_CITATION_PROCHE,
        // (a) un dialogue imaginé : aucun mot en commun avec l'écran
        imagine: essai('Imaginez quelqu’un qui dirait : « je ne sais plus quoi lui dire ». '
                     + 'Ou encore : « j’attends qu’il revienne vers moi ».'),
        // (b) une citation ABÎMÉE : presque la phrase de l'écran, mais pas tout à fait
        abimee: essai('Le document le dit : « le silence qui suit une dispute protège autant '
                    + 'qu’il isole vraiment ».'),
        // (c) une citation EXACTE : rien du tout
        exacte: essai('Le document le dit : « Chacun attend que l’autre fasse le premier pas ».'),
      };
    }, ECRAN);

    assert.equal(r.seuil, 0.60, 'le seuil de Christophe est 60 % ; lu : ' + r.seuil);

    // (a) le dialogue imaginé : zéro avertissement de citation, une information neutre
    assert.deepEqual(r.imagine.citation, [],
      'le dialogue imaginé ne doit plus être un défaut : ' + JSON.stringify(r.imagine.citation));
    assert.equal(r.imagine.imagine.length, 2, 'les deux passages imaginés doivent être signalés comme information');
    r.imagine.imagine.forEach((x) => {
      assert.equal(x.information, true, 'ils doivent porter information: true');
      assert.ok(x.part < 0.60, 'et une part sous le seuil : ' + x.part);
    });

    // (b) la citation abîmée : c'est un défaut, et il dit sa part
    assert.equal(r.abimee.citation.length, 1,
      'la citation abîmée doit rester un défaut : ' + JSON.stringify(r.abimee));
    assert.ok(r.abimee.citation[0].part >= 0.60,
      'et sa part doit dépasser le seuil : ' + r.abimee.citation[0].part);
    assert.ok(/% des mots/.test(r.abimee.citation[0].t),
      'le message doit porter la grandeur dont il découle : ' + r.abimee.citation[0].t);
    assert.equal(r.abimee.imagine.length, 0, 'et ne pas être classée comme propos imaginé');

    // (c) la citation exacte : rien
    assert.deepEqual(r.exacte.citation, [], 'une citation exacte ne dit rien');
    assert.deepEqual(r.exacte.imagine, [], 'et n\'est pas un propos imaginé');
    console.log('        imaginé : part ' + r.imagine.imagine.map((x) => Math.round(x.part * 100) + ' %').join(', ') +
      ' · abîmée : ' + Math.round(r.abimee.citation[0].part * 100) + ' % · exacte : rien');
  });

  await controle('§2c la part se mesure PHRASE PAR PHRASE, jamais contre le document entier', async () => {
    // LE CAS QUI SÉPARE LES DEUX RÈGLES, et sans lui la faute ne se voit pas. Un propos imaginé
    // dont les mots sont TOUS présents dans le document, mais DISPERSÉS sur trois phrases :
    //   · par phrase, la meilleure part vaut 30 % → propos imaginé, information neutre ;
    //   · contre le document pris comme un seul bloc, elle vaut 70 % → citation abîmée, à tort.
    // C'est exactement ce que produirait `phrasesDe(motsDocument)` : le tableau de mots devient
    // une seule phrase géante. Les deux lectures sont vraies sous leur propre règle, et c'est
    // pour cela qu'un contrôle doit nommer la sienne (régression #11(f)).
    const ECRAN = 'Le silence protège parfois. Chacun attend le premier pas. '
                + 'Personne ne sait vraiment quoi dire.';
    const r = await page.evaluate((ecran) => {
      const A = window.NarrationIA;
      const l = A.avertissementsEtape(
        'Imaginez : « je ne sais pas quoi dire après le premier silence ».',
        { contenuBrut: null, texte: ecran },
        { adresse: 'vous', texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran });
      return {
        citations: l.filter((a) => a.type === 'citation').map((a) => a.part),
        imagines: l.filter((a) => a.type === 'propos-imagine').map((a) => a.part),
        nbPhrases: A.phrasesDe(ecran).length,
      };
    }, ECRAN);
    assert.equal(r.nbPhrases, 3, 'l\'écran doit faire trois phrases : ' + r.nbPhrases);
    assert.deepEqual(r.citations, [],
      'mesurée phrase par phrase, cette part vaut 30 % : ce n\'est pas une citation abîmée. ' +
      'Obtenu : ' + JSON.stringify(r.citations) + ' — si une part proche de 70 % apparaît, ' +
      'la comparaison se fait contre le document entier.');
    assert.equal(r.imagines.length, 1, 'un propos imaginé attendu : ' + JSON.stringify(r.imagines));
    assert.ok(r.imagines[0] < 0.60 && r.imagines[0] > 0.1,
      'la part par phrase doit être nettement sous le seuil, et non nulle : ' + r.imagines[0]);
    console.log('        part par phrase ' + Math.round(r.imagines[0] * 100) +
      ' % (contre le document entier, elle vaudrait 70 %)');
  });

  await controle('§2b une information neutre ne compte pas comme avertissement', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const ecran = 'Un texte sans rapport aucun.';
      const l = A.avertissementsEtape(
        'Imaginez : « je ne sais plus quoi lui dire ».',
        { contenuBrut: null, texte: ecran },
        { adresse: 'vous', texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran });
      return { total: l.length, defauts: l.filter((a) => !a.information).length,
               types: l.map((a) => a.type) };
    });
    assert.ok(r.total >= 1, 'le propos imaginé doit être présent : ' + JSON.stringify(r.types));
    assert.equal(r.defauts, 0,
      'aucun DÉFAUT ne doit être compté ici ; types : ' + JSON.stringify(r.types));
  });

  // ── §6 — RÉFÉRENCE AU SUPPORT (4e tirage) ─────────────────────────────────────────────────
  await controle('§6 « référence au support » : ' + SUPPORT_VRAIS.length + ' vraies vues, '
    + SUPPORT_FAUX.length + ' tournures épargnées', async () => {
    const r = await page.evaluate(([vrais, faux]) => {
      const A = window.NarrationIA;
      const ecran = 'Un texte d’écran quelconque.';
      const etape = { contenuBrut: null, texte: ecran };
      const voit = (t) => A.avertissementsEtape(t, etape, { adresse: 'vous',
        texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran })
        .some((a) => a.type === 'reference-support');
      return { manques: vrais.filter((t) => !voit(t)), fauxPositifs: faux.filter(voit) };
    }, [SUPPORT_VRAIS, SUPPORT_FAUX]);
    assert.deepEqual(r.manques, [],
      'références au support non vues : ' + JSON.stringify(r.manques));
    assert.deepEqual(r.fauxPositifs, [],
      'tournures signalées à tort : ' + JSON.stringify(r.fauxPositifs));
  });

  await controle('§6b l\'avertissement compte les occurrences et cite les expressions', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const ecran = 'Un texte d’écran quelconque.';
      const etape = { contenuBrut: null, texte: ecran };
      // Les TROIS références du quatrième tirage, dans un seul commentaire.
      const l = A.avertissementsEtape(
        'Comme le dit le document, la tension monte. Cette présentation le montre bien. '
        + 'Et le document y revient plus loin.',
        etape, { adresse: 'vous', texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran });
      const a = l.find((x) => x.type === 'reference-support');
      return a ? { occurrences: a.occurrences, expressions: a.expressions, texte: a.texte,
                   information: !!a.information } : null;
    });
    assert.ok(r, 'l\'avertissement doit être présent');
    assert.equal(r.occurrences, 3, 'trois références attendues : ' + r.occurrences);
    assert.ok(r.texte.includes('3 fois'), 'le texte doit porter le compte : ' + r.texte);
    assert.ok(r.expressions.length >= 2,
      'et citer les expressions trouvées : ' + JSON.stringify(r.expressions));
    assert.equal(r.information, false, 'c\'est un défaut, pas une information neutre');
  });

  await controle('§6c une citation qui contient « le document » n\'est pas comptée', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const ecran = 'Le document fondateur parle de rupture.';
      const etape = { contenuBrut: null, texte: ecran };
      // Si l'écran écrit « le document », la citation exacte a le droit de le reprendre.
      return A.avertissementsEtape('Il le dit ainsi : « Le document fondateur parle de rupture ».',
        etape, { adresse: 'vous', texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran })
        .map((a) => a.type);
    });
    assert.ok(!r.includes('reference-support'),
      'une référence DANS une citation ne doit pas être comptée : ' + JSON.stringify(r));
  });

  // ── §7 — L'ANGLE MORT DE « PARCOURT LA LISTE » ────────────────────────────────────────────
  await controle('§7 « énumère » voit trois propositions reformulées, invisibles au vocabulaire', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      // Une étape de LISTE : c'est la condition d'application.
      const etape = { texte: 'Trois appuis : le sommeil, le mouvement, le lien.',
        contenuBrut: { type: 'list', items: [
          { text: 'le sommeil, qui répare' }, { text: 'le mouvement, qui décharge' },
          { text: 'le lien, qui soutient' }] } };
      const ecran = etape.texte;
      const av = (com) => A.avertissementsEtape(com, etape, { adresse: 'vous',
        texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran });
      const types = (com) => av(com).map((a) => a.type);
      // LE TEXTE EXACT DE L'ANGLE MORT : trois idées énumérées, reformulées, aucun mot emprunté.
      const angleMort = 'Peut-être que c’est la fatigue qui parle. Peut-être que c’est la peur '
                      + 'de recommencer. Peut-être que c’est simplement l’habitude installée.';
      const a = av(angleMort).find((x) => x.type === 'enumere');
      return {
        angleMort: types(angleMort),
        detail: a ? { regle: a.regle, ouverture: a.ouverture, repetitions: a.repetitions,
                      texte: a.texte } : null,
        // l'ancien détecteur de vocabulaire ne le voit PAS : c'est tout l'intérêt
        parcoursVu: types(angleMort).includes('parcours'),
        // L'ÉNUMÉRATION DANS UNE SEULE PHRASE, séparée par des virgules — et c'est le vrai
        // témoin de la coupure sur la virgule. Avec trois phrases, couper seulement sur le
        // point suffisait, et retirer la virgule ne faisait échouer aucun contrôle.
        uneSeulePhrase: types('Peut-être que c’est la fatigue, peut-être que c’est la peur, '
                            + 'peut-être que c’est l’habitude.'),
        // marqueurs d'ordre
        ordinaux: types('La première chose tient au sommeil. La deuxième touche au mouvement. '
                      + 'La troisième concerne le lien.'),
        // un seul élément illustré : rien
        unSeul: types('Prenez le sommeil. Une nuit hachée suffit à rendre une journée ordinaire '
                    + 'beaucoup plus rude.'),
        // deux propositions seulement : sous le seuil de trois
        deuxSeules: types('Peut-être que c’est la fatigue. Peut-être que c’est la peur.'),
      };
    });
    assert.ok(r.angleMort.includes('enumere'),
      'l\'angle mort doit être vu : ' + JSON.stringify(r.angleMort));
    assert.equal(r.detail.regle, 'ouverture répétée', 'par la forme : ' + r.detail.regle);
    assert.equal(r.detail.repetitions, 3, 'trois propositions : ' + r.detail.repetitions);
    assert.ok(r.detail.texte.includes(r.detail.ouverture),
      'le message doit citer l\'ouverture qui se répète : ' + r.detail.texte);
    assert.equal(r.parcoursVu, false,
      'le détecteur de VOCABULAIRE ne le voit pas — c\'est pour cela que celui de FORME existe');
    assert.ok(r.uneSeulePhrase.includes('enumere'),
      'une énumération tient souvent dans UNE phrase, séparée par des virgules : ' +
      JSON.stringify(r.uneSeulePhrase));
    assert.ok(r.ordinaux.includes('enumere'),
      'les marqueurs d\'ordre doivent être vus : ' + JSON.stringify(r.ordinaux));
    assert.ok(!r.unSeul.includes('enumere'),
      'un seul élément illustré n\'énumère pas : ' + JSON.stringify(r.unSeul));
    assert.ok(!r.deuxSeules.includes('enumere'),
      'deux propositions sont sous le seuil de trois : ' + JSON.stringify(r.deuxSeules));
    console.log('        ouverture « ' + r.detail.ouverture + ' » × ' + r.detail.repetitions +
      ' · le détecteur de vocabulaire, lui, ne voyait rien');
  });

  await controle('§7b dans de la PROSE, trois phrases qui commencent pareil sont une anaphore', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      // Aucun contenuBrut : ce n'est ni une liste ni un questionnaire.
      const etape = { contenuBrut: null, texte: 'Le silence s’installe entre eux.' };
      const ecran = etape.texte;
      return A.avertissementsEtape(
        'Peut-être que c’est la fatigue qui parle. Peut-être que c’est la peur de recommencer. '
        + 'Peut-être que c’est simplement l’habitude installée.',
        etape, { adresse: 'vous', texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran })
        .map((a) => a.type);
    });
    assert.ok(!r.includes('enumere'),
      'hors liste, une anaphore est une figure de style et non un défaut : ' + JSON.stringify(r));
  });

  // ── §3 — LA LISTE PARCOURUE ───────────────────────────────────────────────────────────────
  await controle('§3 la règle de liste est explicite dans le prompt, et le parcours est vu', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const p = A.promptSysteme({ adresse: 'vous', titre: 'T', public: 'large' });
      // Une étape de liste à quatre éléments, comme celle de Christophe.
      const etape = { texte: 'Quatre appuis : le sommeil, le mouvement, le lien, le sens.',
        contenuBrut: { type: 'list', items: [
          { text: 'le sommeil, qui répare' }, { text: 'le mouvement, qui décharge' },
          { text: 'le lien, qui soutient' }, { text: 'le sens, qui orient' }] } };
      const ecran = etape.texte;
      const types = (com) => A.avertissementsEtape(com, etape, { adresse: 'vous',
        texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran }).map((a) => a.type);
      return {
        regleDansLePrompt: /SI VOUS EN NOMMEZ PLUS D’UNE|SI VOUS EN NOMMEZ PLUS D'UNE/.test(p),
        seuilLongueur: A.SEUIL_PHRASE_LONGUE,
        compteExplicite: /Nommez-en UNE SEULE, ou AUCUNE/.test(p),
        dialogueDansLePrompt: /DIALOGUE IMAGINÉ/.test(p),
        // les trois règles du 4e tirage
        limite25: /AUCUNE PHRASE DE PLUS DE 25 MOTS/.test(p),
        supportInterdit: /NE DITES JAMAIS « le document »/.test(p),
        niLuiNiElle: /N'EMPLOYEZ NI « lui » NI « elle »/.test(p),
        // et la règle du couple ne doit exister qu'UNE fois : elle était déjà là
        foisCouple: p.split('l\'un des deux').length - 1,
        // trois éléments nommés : c'est un parcours
        troisNommes: types('Retenez une idée : le sommeil répare, le mouvement décharge, '
                         + 'et le lien soutient.'),
        // un seul élément illustré : ce n'est pas un parcours
        unSeul: types('Prenez le sommeil. Une nuit hachée suffit à rendre une journée '
                    + 'ordinaire beaucoup plus rude.'),
      };
    });
    assert.ok(r.regleDansLePrompt, 'la règle « si vous en nommez plus d’une » doit être dans le prompt');
    assert.ok(r.compteExplicite, 'et le compte doit être explicite : « une seule, ou aucune »');
    assert.ok(r.dialogueDansLePrompt, 'la règle du dialogue imaginé doit y être aussi');
    assert.ok(r.limite25, 'la limite chiffrée de 25 mots doit être dans le prompt');
    assert.ok(r.supportInterdit, 'l\'interdiction de nommer le support doit y être');
    assert.ok(r.niLuiNiElle, '« ni lui ni elle » doit y être');
    assert.equal(r.foisCouple, 1,
      'la règle du couple existait DÉJÀ : elle doit apparaître une seule fois, pas deux. ' +
      'Occurrences : ' + r.foisCouple);
    assert.equal(r.seuilLongueur, 30,
      'le seuil d\'AVERTISSEMENT reste à 30 même si le prompt demande 25 : ' + r.seuilLongueur);
    assert.ok(r.troisNommes.includes('parcours'),
      'trois éléments nommés doivent être vus comme un parcours : ' + JSON.stringify(r.troisNommes));
    assert.ok(!r.unSeul.includes('parcours'),
      'un seul élément illustré n\'est pas un parcours : ' + JSON.stringify(r.unSeul));
    console.log('        trois nommés → ' + JSON.stringify(r.troisNommes) +
      ' · un seul → ' + JSON.stringify(r.unSeul));
  });

  // ── §4 — AUCUNE RÉGRESSION SUR CE QUI MARCHAIT ────────────────────────────────────────────
  await controle('§4 phrasesLongues garde son découpage : « … » coupe encore une phrase', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      return {
        // « … » coupe pour la longueur : deux morceaux courts, aucun avertissement
        suspension: A.phrasesLongues('Imaginez… une porte qui se ferme sur une conversation.'),
        // mais PAS pour la comparaison de citation : une seule phrase
        phrasesPourCitation: A.phrasesDe('Imaginez… une porte qui se ferme.').length,
        phrasesPourLongueur: A.phrasesDe('Imaginez… une porte qui se ferme.',
          { couperSurSuspension: true }).length,
        seuil: A.SEUIL_PHRASE_LONGUE,
      };
    });
    assert.deepEqual(r.suspension, [],
      'ces deux morceaux sont courts : aucun avertissement de phrase longue attendu, obtenu ' +
      JSON.stringify(r.suspension));
    assert.equal(r.phrasesPourCitation, 1,
      'pour comparer une citation, « … » ne coupe PAS : une seule phrase attendue, obtenu ' +
      r.phrasesPourCitation);
    assert.equal(r.phrasesPourLongueur, 2,
      'pour compter la longueur, « … » coupe : deux phrases attendues, obtenu ' +
      r.phrasesPourLongueur);
    console.log('        un seul découpage, deux règles nommées : ' + r.phrasesPourCitation +
      ' phrase pour la citation, ' + r.phrasesPourLongueur + ' pour la longueur');
  });

  await controle('§4c « … » coupe pour la LONGUEUR : deux propositions de 20 mots ne font pas 40', async () => {
    // LE CAS QUI SÉPARE LES DEUX RÈGLES. Deux propositions de vingt mots séparées par « … » :
    //   · en coupant sur « … » → [20, 20], aucune au-delà de trente, aucun avertissement ;
    //   · sans couper        → [40], une phrase au-delà de trente, un avertissement.
    // Sans ce cas, retirer la coupure ne se voyait pas : mes textes d'essai étaient trop courts
    // pour que la différence atteigne le seuil.
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const T = 'Voici une première proposition qui compte environ vingt mots afin de rester '
              + 'seule sous le seuil de trente mots fixé… et voici une seconde proposition qui '
              + 'en compte autant pour que leur somme dépasse nettement ce même seuil de trente.';
      return {
        longues: A.phrasesLongues(T),
        motsEnCoupant: A.phrasesDe(T, { couperSurSuspension: true })
          .map((x) => A.normaliserMots(x).length),
        motsSansCouper: A.phrasesDe(T).map((x) => A.normaliserMots(x).length),
        seuil: A.SEUIL_PHRASE_LONGUE,
      };
    });
    assert.deepEqual(r.motsEnCoupant, [20, 20],
      'en coupant sur « … », deux propositions de vingt mots : ' + JSON.stringify(r.motsEnCoupant));
    assert.deepEqual(r.motsSansCouper, [40],
      'sans couper, une seule de quarante : ' + JSON.stringify(r.motsSansCouper));
    assert.deepEqual(r.longues, [],
      'donc aucune phrase au-delà de ' + r.seuil + ' mots, et aucun avertissement ; obtenu ' +
      JSON.stringify(r.longues) + ' — si 40 apparaît, la coupure sur « … » a disparu.');
    console.log('        en coupant [20, 20] · sans couper [40] · seuil ' + r.seuil +
      ' → aucun avertissement, comme il faut');
  });

  await controle('§4b les autres avertissements répondent toujours', async () => {
    const r = await page.evaluate(() => {
      const A = window.NarrationIA;
      const ecran = 'Le silence qui suit une dispute protège autant qu’il isole.';
      const etape = { contenuBrut: null, texte: ecran };
      const types = (com) => A.avertissementsEtape(com, etape, { adresse: 'vous',
        texteDocument: A.normaliserMots(ecran), texteDocumentBrut: ecran }).map((a) => a.type);
      return {
        // une reprise mot pour mot de l'écran
        repris: types('Le silence qui suit une dispute protège autant qu’il isole.'),
        // Une phrase très longue. LE SEUIL EST 30 MOTS, lu dans le module et non supposé :
        // ma première phrase d'essai en comptait vingt-deux et n'avait aucune raison d'être
        // signalée. Le contrôle lisait un seuil qu'il avait imaginé.
        longue: types('Voici une phrase qui continue bien au-delà de ce que l’oreille peut '
                    + 'suivre sans reprendre son souffle une seule fois, et qui poursuit encore '
                    + 'sa route en ajoutant des propositions les unes aux autres sans jamais '
                    + 'offrir au lecteur le moindre point final avant très longtemps.'),
        seuilLu: A.SEUIL_PHRASE_LONGUE,
      };
    });
    assert.ok(r.repris.length > 0, 'une reprise mot pour mot doit encore être signalée : ' +
      JSON.stringify(r.repris));
    assert.equal(r.seuilLu, 30, 'le seuil de phrase longue lu dans le module : ' + r.seuilLu);
    assert.ok(r.longue.includes('phrase'), 'une phrase de plus de ' + r.seuilLu +
      ' mots doit encore être signalée : ' + JSON.stringify(r.longue));
    console.log('        reprise → ' + JSON.stringify(r.repris) + ' · longue → ' + JSON.stringify(r.longue));
  });

  await controle('§5 aucune erreur de page', async () => {
    assert.deepEqual(erreurs, [], 'erreurs : ' + erreurs.join(' | '));
  });

  await ctx.close();
  await nav.close();
  srv.close();

  console.log('\n' + '─'.repeat(74));
  const total = reussis + echecs.length;
  console.log('  ' + crypto.createHash('sha256').update(SOURCE).digest('hex').slice(0, 16) +
              '  narration-ia.js');
  if (echecs.length) {
    console.log('ÉCHEC — ' + reussis + '/' + total + '\n');
    echecs.forEach((e) => console.log('  · ' + e));
    process.exit(1);
  }
  if (!total) { console.log('AUCUN contrôle ne correspond au filtre.'); process.exit(3); }
  console.log('PASS verify-narration-avertissements — ' + reussis + '/' + total + ' contrôles'
    + (ignores ? ' (' + ignores + ' hors filtre)' : '') + '.');
})().catch((e) => { console.error('\nInterrompu : ' + e.stack); process.exit(1); });
