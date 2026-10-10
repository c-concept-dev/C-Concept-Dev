// CONTRÔLES DU LOT 3, JALON I — capture et stockage.
//
//   NODE_PATH=<playwright> node tests/verify-enregistreur-capture.cjs
//   (les fixtures d'abord : node tests/enregistreur-fixtures.cjs)
//
// CE QUI EST SIMULÉ, ET RIEN DE PLUS. Le vrai AudioWorklet, le vrai bouton, la vraie IndexedDB,
// le vrai export WAV, le vrai affichage. La seule couche remplacée est la PLUS BASSE possible :
// à la place du micro, une source audio alimentée par une fixture synthétique. Et un contrôle
// (§8) N'EMPRUNTE PAS ce remplacement : il passe par le vrai `getUserMedia`, avec le micro
// factice de Chromium — parce qu'un point d'injection a besoin d'au moins un contrôle qui ne
// l'emprunte pas (régression #11(a)).
//
// CHAQUE CONTRÔLE LIT CE QUE LA PAGE AFFICHE, pas ce que le module déclare (régression #11(e)).
// Là où il lit l'état du module, il le CONFRONTE à un témoin relevé par un autre chemin : les
// octets relus dans IndexedDB, ou l'en-tête WAV recalculé par le générateur de fixtures, qui est
// un code différent de celui du produit (régression #11(j)).
//
// Noter le fait suivant, qui est un cadeau : le micro factice de Chromium tourne à 44 100 Hz,
// pas à 48 000. Rien ici ne suppose 48 kHz, et c'est précisément ce que ce contrôle vérifie.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const RACINE = path.join(__dirname, '..');
const FIXTURES = path.join(RACINE, 'banc-enregistreur', 'fixtures');
const SOURCE_MODULE = fs.readFileSync(path.join(RACINE, 'enregistreur-voix.js'), 'utf8');
const SOURCE_STOCKAGE = fs.readFileSync(path.join(RACINE, 'voix-stockage.js'), 'utf8');
const SOURCE_WORKLET = fs.readFileSync(path.join(RACINE, 'enregistreur-worklet.js'), 'utf8');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};

// `--seulement §5a,§6` ne lance que les sections nommées. Le falsifieur s'en sert pour ne
// rejouer QUE le contrôle que sa mutation vise : rejouer les vingt-trois à chaque mutation
// dépasserait l'attente bornée, et ne dirait rien de plus.
const FILTRE = (() => {
  const i = process.argv.indexOf('--seulement');
  if (i < 0) return null;
  return String(process.argv[i + 1] || '').split(',').map((x) => x.trim()).filter(Boolean);
})();

let reussis = 0;
let ignores = 0;
const echecs = [];
function controle(nom, fn) {
  if (FILTRE && !FILTRE.some((f) => nom.startsWith(f))) { ignores++; return Promise.resolve(); }
  return Promise.resolve()
    .then(fn)
    .then(() => { reussis++; console.log('  ok   ' + nom); })
    .catch((e) => { echecs.push(nom + ' → ' + e.message); console.log('  ÉCHEC ' + nom + '\n        ' + e.message); });
}

function servir() {
  const srv = http.createServer((q, s) => {
    const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '');
    const abs = path.join(RACINE, rel);
    if (!abs.startsWith(RACINE) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      s.writeHead(404); s.end('introuvable'); return;
    }
    // `?lent=NNN` retarde la réponse de NNN millisecondes. Un seul usage : rendre
    // DÉTERMINISTE l'ordre de résolution de deux constructions de graphe concurrentes (§19b).
    // Sans cela, la course ne se reproduit qu'au hasard des caches, et un contrôle qui échoue
    // une fois sur trois ne contrôle rien.
    const lent = Number(new URL(q.url, 'http://x').searchParams.get('lent') || 0);
    const envoyer = () => {
      s.writeHead(200, { 'content-type': TYPES[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(s);
    };
    if (lent > 0) setTimeout(envoyer, Math.min(5000, lent)); else envoyer();
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// Un contexte neuf par cas : IndexedDB est par origine, et deux cas qui se partagent la base se
// contaminent. Chaque cas repart d'un stockage vierge — sauf §7, qui a besoin du contraire.
async function ouvrirBanc(nav, base, requete, opts = {}) {
  const ctx = await nav.newContext({ permissions: ['microphone'], ...(opts.ctx || {}) });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e && e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  await page.goto(base + '/banc-enregistreur.html' + (requete || ''));
  await page.waitForFunction(() => window.__bancPret === true || window.__bancErreur, null, { timeout: 20000 });
  const err = await page.evaluate(() => window.__bancErreur || null);
  if (err) throw new Error('le banc n\'a pas démarré : ' + err);
  return { ctx, page, erreurs };
}

// Joue une fixture du début à la fin d'une prise, par les VRAIS boutons, et rend ce que la PAGE
// affiche plus ce qu'IndexedDB contient réellement.
async function prendre(page, { attendreMs, jusqua, pendant, reglageCanal, tailleMorceau }) {
  if (tailleMorceau) {
    await page.selectOption('[data-taille-morceau]', String(tailleMorceau));
    await page.waitForTimeout(400);
  }
  if (reglageCanal) await page.selectOption('[data-reglage-canal]', reglageCanal);

  await page.click('[data-action="autoriser"]');
  // ON ATTEND UNE FENÊTRE DE DÉCISION PLEINE, et pas seulement « quelques échantillons ».
  // Avant cette correction, les contrôles démarraient à 0,5 s et passaient donc TOUS par le
  // repli « fenêtre trop courte » sans que personne ne le voie : ils n'éprouvaient jamais le
  // chemin normal. Christophe, lui, laisse le vu-mètre tourner avant de cliquer.
  await page.waitForFunction(() => {
    const f = window.EnregistreurVoix._fenetreDeDecision();
    return f.suffisante && f.secondes >= 1.5;
  }, null, { timeout: 20000 });

  await page.click('[data-action="demarrer"]');
  if (jusqua) await page.waitForFunction(jusqua, null, { timeout: 30000 });
  else await page.waitForTimeout(attendreMs || 2500);
  if (pendant) await pendant();
  await page.click('[data-action="arreter"]');
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-mode]');
    return t && /terminée|muette/i.test(t.textContent);
  }, null, { timeout: 20000 });

  return page.evaluate(async () => {
    const e = window.EnregistreurVoix._etat();
    // LE TÉMOIN : on relit les octets dans IndexedDB, par le curseur, sans croire les compteurs.
    let morceaux = 0, echantillons = 0, min = 32767, max = -32768, indexVus = [];
    await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
      morceaux++; indexVus.push(m.index);
      const a = new Int16Array(m.pcm);
      echantillons += a.length;
      for (let i = 0; i < a.length; i++) { if (a[i] < min) min = a[i]; if (a[i] > max) max = a[i]; }
    });
    const prise = await window.VoixStockage.lirePrise(e.db, e.priseId);
    return {
      // ce que la PAGE affiche
      affiche: {
        mode: document.querySelector('[data-mode]').textContent,
        niveau: document.querySelector('[data-vu-niveau]').textContent,
        barre: document.querySelector('[data-vu-barre]').style.width,
        detail: document.querySelector('[data-vu-detail]').textContent,
        canalRetenu: document.querySelector('[data-canal-retenu]').textContent,
        sbCanal: document.querySelector('[data-sb-canal]').textContent,
        sbMorceaux: document.querySelector('[data-sb-morceaux]').textContent,
        sbPiste: document.querySelector('[data-sb-piste]').textContent,
        sbFrequence: document.querySelector('[data-sb-frequence]').textContent,
        sbMicro: (document.querySelector('[data-sb-micro]') || {}).textContent,
        bruit: (document.querySelector('[data-bruit]') || {}).textContent,
        messages: [...document.querySelectorAll('[data-messages] .sc-bm-message')]
          .map((m) => ({ etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent,
                         icone: m.querySelector('use').getAttribute('href') })),
      },
      // ce que le MODULE croit
      module: {
        canalRetenu: e.canalRetenu, canalRaison: e.canalRaison,
        echantillonnage: e.echantillonnage, morceauxEcrits: e.morceauxEcrits,
        echantillonsEcrits: e.echantillonsEcrits, tailleMorceau_s: e.tailleMorceau_s,
        journal: e.journal, mesures: e.mesures,
      },
      // ce qu'INDEXEDDB contient
      stockage: { morceaux, echantillons, min, max, indexVus, prise },
    };
  });
}

(async () => {
  console.log('\nCONTRÔLES DU JALON I — enregistreur de voix\n');

  if (!fs.existsSync(path.join(FIXTURES, 'index.json'))) {
    console.error('Fixtures absentes. Lancer d\'abord : node tests/enregistreur-fixtures.cjs');
    process.exit(2);
  }

  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
           '--autoplay-policy=no-user-gesture-required'],
  });

  // ── §1 — LE BALAYAGE DES NOMS PRIS SUR `window` ────────────────────────────────────────────
  // La liste n'est pas écrite à la main : elle est BALAYÉE dans les sources, puis vérifiée dans
  // la page. Sans quoi le nom ajouté demain ne serait vérifié par personne (régression #11(b)).
  await controle('§1 les noms pris sur window existent tous dans la page', async () => {
    const pris = [...new Set(
      [...(SOURCE_MODULE.match(/window\.([A-Za-z_$][\w$]*)/g) || []),
       ...(SOURCE_STOCKAGE.match(/self\.([A-Za-z_$][\w$]*)/g) || [])]
        .map((x) => x.replace(/^(window|self)\./, ''))
    )].filter((n) => !['AudioContext', 'webkitAudioContext', 'confirm', 'addEventListener',
                       'URL', 'Blob', 'indexedDB', 'navigator'].includes(n));
    assert.ok(pris.length >= 2, 'le balayage doit trouver des noms, il a trouvé : ' + pris.join(','));
    const { ctx, page } = await ouvrirBanc(nav, base);
    const absents = await page.evaluate((noms) =>
      noms.filter((n) => typeof window[n] === 'undefined'), pris);
    await ctx.close();
    assert.deepEqual(absents, [], 'noms balayés mais absents de la page : ' + absents.join(','));
    console.log('        balayés : ' + pris.join(', '));
  });

  // ── §2 — LES FONCTIONS PURES ───────────────────────────────────────────────────────────────
  await controle('§2a la corrélation ne rend JAMAIS null — une raison à la place', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const s = (o) => Object.assign({ n: 1000, canaux: 2, sommeG: 0, sommeD: 0, sommeCarreG: 1,
        sommeCarreD: 1, sommeProduit: 0, creteG: 0.5, creteD: 0.5, zerosG: 0, zerosD: 0 }, o);
      return {
        rien: A.correlation({ n: 0 }),
        mono: A.correlation(s({ canaux: 1 })),
        droitVide: A.correlation(s({ creteD: 0, zerosD: 1000, sommeCarreD: 0 })),
        gaucheVide: A.correlation(s({ creteG: 0, zerosG: 1000, sommeCarreG: 0 })),
        deuxVides: A.correlation(s({ creteG: 0, creteD: 0, zerosG: 1000, zerosD: 1000, sommeCarreG: 0, sommeCarreD: 0 })),
        constant: A.correlation(s({ sommeCarreD: 1000 * 0.001 * 0.001, sommeD: 1000 * 0.001, creteD: 0.001 })),
        // Deux signaux identiques : corrélation exactement 1.
        parfaite: A.correlation(s({ sommeProduit: 1, sommeCarreG: 1, sommeCarreD: 1 })),
        // LE CAS QUI SÉPARE PEARSON DU RACCOURCI, et il n'est pas de laboratoire.
        // Deux canaux en OPPOSITION DE PHASE autour d'une composante continue de 1,0 :
        //   g = 1 + e, d = 1 − e, avec e alternant ±0,01 sur 1 000 échantillons.
        //   Σg = Σd = 1000 · Σg² = Σd² = 1000,1 · Σgd = 999,9
        //   Pearson (moyennes retirées) : cov = −0,1 ; var = 0,1 → r = −1 exactement.
        //   Raccourci Σgd/√(Σg²Σd²) : 999,9/1000,1 ≈ +0,9998.
        // Le raccourci dirait « même signal, prends la moyenne » — et la moyenne de deux canaux
        // en opposition de phase ANNULE la voix. C'est pour ce cas que les moyennes se retirent.
        oppositionDePhase: A.correlation({
          n: 1000, canaux: 2,
          sommeG: 1000, sommeD: 1000,
          sommeCarreG: 1000.1, sommeCarreD: 1000.1,
          sommeProduit: 999.9,
          creteG: 1.01, creteD: 1.01, zerosG: 0, zerosD: 0,
        }),
      };
    });
    await ctx.close();
    for (const [cle, v] of Object.entries(r)) {
      assert.notEqual(v, null, cle + ' rend null, ce qui est interdit');
      assert.ok(v !== undefined, cle + ' rend undefined');
    }
    assert.equal(r.rien, 'rien mesuré');
    assert.equal(r.mono, 'entrée mono');
    assert.equal(r.droitVide, 'canal vide : droit');
    assert.equal(r.gaucheVide, 'canal vide : gauche');
    assert.equal(r.deuxVides, 'deux canaux vides');
    assert.equal(r.constant, 'canal constant : droit');
    assert.ok(Math.abs(r.parfaite - 1) < 1e-9, 'corrélation parfaite attendue, obtenu ' + r.parfaite);
    assert.ok(typeof r.oppositionDePhase === 'number',
      'opposition de phase : ' + JSON.stringify(r.oppositionDePhase));
    assert.ok(Math.abs(r.oppositionDePhase + 1) < 1e-6,
      'deux canaux en opposition de phase autour d\'une continue donnent −1 avec Pearson, et ' +
      '+0,9998 avec le raccourci qui suppose une moyenne nulle. Obtenu ' + r.oppositionDePhase +
      ' : si c\'est positif, la moyenne serait prise et la voix s\'annulerait.');
  });

  await controle('§2b l\'en-tête WAV fait 44 octets exacts, confrontés à un AUTRE générateur', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const duProduit = await page.evaluate(() =>
      [...window.VoixStockage.enTeteWav(14400000, 48000)]);
    const duProduit441 = await page.evaluate(() =>
      [...window.VoixStockage.enTeteWav(441, 44100)]);
    await ctx.close();

    // LE TÉMOIN vient du générateur de fixtures — un autre fichier, écrit indépendamment.
    const { ecrireWav, zeros } = require('./enregistreur-fixtures.cjs');
    const tmp = path.join(FIXTURES, '_temoin-entete.wav');
    ecrireWav(tmp, [zeros(14400000)], 48000);
    const temoin = [...fs.readFileSync(tmp).subarray(0, 44)];
    fs.unlinkSync(tmp);

    assert.equal(duProduit.length, 44, 'en-tête de ' + duProduit.length + ' octets');
    assert.deepEqual(duProduit, temoin,
      'l\'en-tête du produit diffère du témoin :\n  produit ' + duProduit.join(',') +
      '\n  témoin  ' + temoin.join(','));
    // Et il ne suppose pas 48 kHz : à 44 100, les champs suivent.
    const v = Buffer.from(duProduit441);
    assert.equal(v.readUInt32LE(24), 44100, 'échantillonnage dans l\'en-tête');
    assert.equal(v.readUInt32LE(28), 44100 * 2, 'octets par seconde');
    assert.equal(v.readUInt16LE(22), 1, 'un seul canal : mono');
    assert.equal(v.readUInt16LE(34), 16, '16 bits');
    assert.equal(v.readUInt32LE(40), 441 * 2, 'taille du bloc data');
  });

  await controle('§2c la règle du canal suit les quatre cas décidés par Christophe', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const n = 100000;
      // Des sommes fabriquées pour chaque cas, avec leurs grandeurs explicites.
      const fort = 0.2 * 0.2 * n, faible = 0.02 * 0.02 * n;
      const base = { n, canaux: 2, sommeG: 0, sommeD: 0, sommeProduit: 0,
                     creteG: 0.3, creteD: 0.3, zerosG: 0, zerosD: 0 };
      return {
        droitVide: A.choisirCanal({ ...base, sommeCarreG: fort, sommeCarreD: 0,
                                    creteD: 0, zerosD: n }, 'auto'),
        gaucheVide: A.choisirCanal({ ...base, sommeCarreG: 0, sommeCarreD: fort,
                                     creteG: 0, zerosG: n }, 'auto'),
        correles: A.choisirCanal({ ...base, sommeCarreG: fort, sommeCarreD: fort,
                                   sommeProduit: fort * 0.95 }, 'auto'),
        differents: A.choisirCanal({ ...base, sommeCarreG: faible, sommeCarreD: fort,
                                     sommeProduit: 0 }, 'auto'),
        force: A.choisirCanal({ ...base, sommeCarreG: fort, sommeCarreD: 0,
                                creteD: 0, zerosD: n }, 'droit'),
        mono: A.choisirCanal({ ...base, canaux: 1, sommeCarreG: fort }, 'auto'),
      };
    });
    await ctx.close();
    assert.equal(r.droitVide.canal, 'gauche', 'droit vide → gauche');
    assert.ok(/sans moyenne/.test(r.droitVide.raison), 'la raison doit dire qu\'on ne moyenne pas');
    assert.equal(r.gaucheVide.canal, 'droit', 'gauche vide → droit');
    assert.equal(r.correles.canal, 'moyenne', 'deux actifs corrélés → moyenne');
    assert.ok(r.correles.correlation > 0.8, 'corrélation ' + r.correles.correlation);
    assert.equal(r.differents.canal, 'droit', 'deux actifs différents → le plus fort');
    assert.equal(r.force.canal, 'droit', 'le réglage forcé l\'emporte');
    assert.equal(r.force.auto, false);
    assert.equal(r.mono.canal, 'gauche', 'entrée mono → canal 0');
  });

  await controle('§2d les blocs perdus rendent leurs DEUX termes, pas seulement l\'écart', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    // 240 000 trames = 5 s à 48 kHz = 1 875 blocs exactement.
    const r = await page.evaluate(() =>
      window.EnregistreurVoix.blocsPerdus(1875, 0, 240000, 48000));
    await ctx.close();
    assert.equal(r.blocsAttendusParLHorlogeAudio, 1875, 'attendus = 240000 / 128');
    assert.equal(r.secondesHorlogeAudio, 5, 'et les secondes découlent des trames');
    assert.equal(r.blocsComptesParLeWorklet, 1875);
    assert.equal(r.ecart, 0);
    assert.ok(typeof r.regle === 'string' && r.regle.length > 20, 'chaque ligne NOMME sa règle');
  });

  // ── §3 — LE MIXAGE MONO SUR LE VRAI CHEMIN (E3) ────────────────────────────────────────────
  // Le piège mesuré au lot 0 : avec le canal droit vide, la MOYENNE coûte 6 dB. Ce contrôle le
  // prouve par les octets stockés, pas par la formule.
  await controle('§3a canal droit vide → canal actif pris, et PAS de perte de 6 dB', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const auto = await prendre(page, { attendreMs: 2600 });
    await ctx.close();

    assert.equal(auto.module.canalRetenu, 'gauche');
    assert.ok(/canal gauche/.test(auto.affiche.sbCanal), 'la page doit afficher le canal retenu : ' + auto.affiche.sbCanal);
    assert.ok(/droit vide/.test(auto.affiche.canalRetenu), 'la page doit dire POURQUOI : ' + auto.affiche.canalRetenu);
    const r = auto.module.mesures.correlationEntreCanaux;
    assert.equal(r, 'canal vide : droit', 'corrélation : ' + JSON.stringify(r));

    // La preuve en décibels : le même passage, forcé en moyenne, doit tomber d'environ 6 dB.
    const { ctx: c2, page: p2 } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const moy = await prendre(p2, { attendreMs: 2600, reglageCanal: 'moyenne' });
    await c2.close();

    const dbAuto = auto.module.mesures.niveaux.gauche.efficaceDbfs;
    const dbMoy = moy.module.mesures.niveaux.gauche.efficaceDbfs;
    // Les niveaux PAR CANAL sont mesurés à l'entrée : identiques dans les deux cas. Ce qui
    // change est ce qui a été ÉCRIT. On le mesure donc sur les octets stockés.
    assert.ok(Math.abs(dbAuto - dbMoy) < 1.5,
      'le niveau d\'entrée du canal gauche doit être le même : ' + dbAuto + ' vs ' + dbMoy);
    const effAuto = Math.max(Math.abs(auto.stockage.min), auto.stockage.max);
    const effMoy = Math.max(Math.abs(moy.stockage.min), moy.stockage.max);
    const chute = 20 * Math.log10(effMoy / effAuto);
    assert.ok(chute < -4.5 && chute > -7.5,
      'la moyenne sur un canal vide doit coûter environ 6 dB ; mesuré ' + chute.toFixed(2) +
      ' dB (crêtes stockées ' + effAuto + ' puis ' + effMoy + ')');
    console.log('        crête stockée : canal actif ' + effAuto + ' · moyenne ' + effMoy +
                ' → ' + chute.toFixed(2) + ' dB, l\'erreur que E3 interdit');
  });

  await controle('§3b canal gauche vide → le droit est pris (la règle n\'est pas écrite d\'un seul côté)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-gauche-vide.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 2600 });
    await ctx.close();
    assert.equal(r.module.canalRetenu, 'droit');
    assert.equal(r.module.mesures.correlationEntreCanaux, 'canal vide : gauche');
    assert.ok(r.stockage.echantillons > 0, 'des échantillons doivent être écrits');
    assert.ok(Math.max(Math.abs(r.stockage.min), r.stockage.max) > 3000,
      'le signal du canal droit doit se retrouver dans les octets, crête ' +
      Math.max(Math.abs(r.stockage.min), r.stockage.max));
  });

  await controle('§3c deux canaux corrélés → moyenne ; deux canaux différents → le plus fort', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/deux-canaux-correles.wav&boucle=1');
    const c = await prendre(page, { attendreMs: 2600 });
    await ctx.close();
    assert.equal(c.module.canalRetenu, 'moyenne', 'raison affichée : ' + c.affiche.canalRetenu);
    assert.ok(typeof c.module.mesures.correlationEntreCanaux === 'number' &&
      c.module.mesures.correlationEntreCanaux > 0.8,
      'corrélation attendue > 0,8 ; obtenu ' + c.module.mesures.correlationEntreCanaux);

    const { ctx: c2, page: p2 } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/deux-canaux-differents.wav&boucle=1');
    const d = await prendre(p2, { attendreMs: 2600 });
    await c2.close();
    assert.equal(d.module.canalRetenu, 'droit', 'le droit est le plus fort ; raison : ' + d.affiche.canalRetenu);
    const rd = d.module.mesures.correlationEntreCanaux;
    assert.ok(typeof rd === 'number' && Math.abs(rd) < 0.5,
      'deux fréquences sans rapport : corrélation proche de 0 ; obtenu ' + rd);
  });

  await controle('§3d entrée mono et canal constant : une raison, jamais null', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/mono.wav&boucle=1');
    const m = await prendre(page, { attendreMs: 2200 });
    await ctx.close();
    assert.equal(m.module.canalRetenu, 'gauche');
    assert.equal(m.module.mesures.correlationEntreCanaux, 'entrée mono');

    // LE CAS « CANAL CONSTANT » NE SE PROUVE PAS ICI, ET C'EST UN FAIT, PAS UN RENONCEMENT.
    // Un canal exactement constant ne traverse pas un graphe audio : le contexte rééchantillonne
    // (44 100 contre 48 000), et le rééchantillonnage donne à la « constante » une variance
    // minuscule mais NON NULLE. La corrélation redevient donc calculable, et elle vaut environ
    // zéro — ce qui est juste. La branche « canal constant » est éprouvée en §2a, sur des sommes
    // exactes, là où elle est atteignable. Ici on éprouve ce qui est réellement en jeu : une
    // composante continue ne se fait pas passer pour la voix.
    const { ctx: c2, page: p2 } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-constant.wav&boucle=1');
    const k = await prendre(p2, { attendreMs: 2200 });
    await c2.close();
    const rk = k.module.mesures.correlationEntreCanaux;
    assert.ok(typeof rk === 'number' && Math.abs(rk) < 0.2,
      'une continue et un sinus ne sont pas corrélés ; obtenu ' + JSON.stringify(rk));
    assert.equal(k.module.canalRetenu, 'gauche',
      'le sinus (0,2) est plus fort que la continue (0,05) ; raison : ' + k.affiche.canalRetenu);
    assert.ok(k.module.mesures.niveaux.gauche.efficaceDbfs >
              k.module.mesures.niveaux.droit.efficaceDbfs,
      'et la mesure doit le dire : gauche ' + k.module.mesures.niveaux.gauche.efficaceDbfs +
      ' contre droit ' + k.module.mesures.niveaux.droit.efficaceDbfs);
  });

  // ── §4 — L'ÉCRÊTAGE, SUR LE VRAI CHEMIN ────────────────────────────────────────────────────
  await controle('§4 au-delà de la pleine échelle, l\'écrêtage tient les bornes ASYMÉTRIQUES', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/ecretage.wav&boucle=1&gain=3');
    const r = await prendre(page, { attendreMs: 2200 });
    await ctx.close();
    const gain = await 3;
    assert.ok(r.stockage.echantillons > 0, 'rien n\'a été écrit');
    assert.equal(r.stockage.max, 32767, 'borne haute : attendu 32767, obtenu ' + r.stockage.max);
    assert.equal(r.stockage.min, -32768, 'borne basse : attendu −32768, obtenu ' + r.stockage.min);
    console.log('        gain ×' + gain + ' sur une pleine échelle : stocké [' +
                r.stockage.min + ', ' + r.stockage.max + '], aucun débordement');
  });

  // ── §5 — LA CAPTURE MUETTE (E8) ────────────────────────────────────────────────────────────
  await controle('§5a 71 s de zéros : bandeau à 2 s, prise MUETTE, jamais réussie', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/zeros-71s.wav');
    // On n'attend pas 71 secondes : on attend que la page AFFICHE le bandeau, puis on arrête.
    // Et on relève le bandeau PENDANT la prise : à l'arrêt, le verdict final s'ajoute, et une
    // lecture faite après ne prouverait plus que l'alerte est tombée AU BON MOMENT — c'est-à-dire
    // aussitôt, comme E8 l'exige, et non à la fin.
    let bandeauPendant = null;
    const r = await prendre(page, {
      jusqua: () => !!document.querySelector('[data-messages] [data-cle="muet"]'),
      pendant: async () => {
        bandeauPendant = await page.evaluate(() => {
          const m = document.querySelector('[data-messages] [data-cle="muet"]');
          return m ? { etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent,
                       icone: m.querySelector('use').getAttribute('href'),
                       modeAffiche: document.querySelector('[data-mode]').textContent } : null;
        });
      },
    });
    await ctx.close();

    const bandeau = bandeauPendant;
    assert.ok(bandeau, 'le bandeau E8 doit être affiché PENDANT la prise, pas seulement à la fin');
    assert.equal(bandeau.modeAffiche, 'Prise en cours',
      'le bandeau doit tomber alors que la prise tourne encore ; mode affiché : ' + bandeau.modeAffiche);
    // Et le verdict final doit s'AJOUTER, sans effacer l'alerte.
    const verdict = r.affiche.messages.find((m) => /Cette prise est MUETTE/.test(m.texte));
    assert.ok(verdict, 'le verdict final doit être affiché : ' + JSON.stringify(r.affiche.messages));
    assert.ok(r.affiche.messages.some((m) => /Aucun son reçu du micro/.test(m.texte)),
      'et l\'alerte E8 doit SURVIVRE au verdict : ' + JSON.stringify(r.affiche.messages));
    assert.ok(bandeau, 'le bandeau E8 doit être AFFICHÉ ; messages : ' +
      JSON.stringify(r.affiche.messages));
    assert.equal(bandeau.etat, 'error', 'le bandeau doit être une erreur');
    assert.equal(bandeau.icone, '#icon-warning', 'icône du sprite du kit');
    assert.ok(/MUETTE/i.test(r.affiche.mode) || /muette/i.test(r.stockage.prise.etat),
      'la prise doit être marquée muette ; affiché « ' + r.affiche.mode + ' », stocké « ' +
      r.stockage.prise.etat + ' »');
    assert.equal(r.stockage.prise.etat, 'muette', 'état stocké : ' + r.stockage.prise.etat);

    // Le journal est en ÉCHANTILLONS, pas en millisecondes d'horloge d'interface.
    const e = r.module.journal.find((x) => x.quoi === 'piste muette');
    assert.ok(e, 'le journal doit porter « piste muette » ; journal : ' +
      JSON.stringify(r.module.journal.map((x) => x.quoi)));
    assert.equal(typeof e.aEchantillon, 'number');
    const ech = r.module.echantillonnage;
    const sec = e.echantillonsAZero / ech;
    assert.ok(sec >= 2 && sec < 2.1,
      'le seuil doit tomber à 2 s exactement, en échantillons ; mesuré ' + sec.toFixed(4) +
      ' s (' + e.echantillonsAZero + ' échantillons à ' + ech + ' Hz)');
    console.log('        seuil atteint à ' + e.echantillonsAZero + ' échantillons = ' +
                sec.toFixed(4) + ' s à ' + ech + ' Hz');
  });

  await controle('§5b 0,4 s de silence initial NE déclenche pas l\'alerte (T13)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/silence-initial-non-respecte.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 2600 });
    await ctx.close();
    assert.ok(!r.module.journal.some((x) => x.quoi === 'piste muette'),
      'aucune alerte muette attendue sous 2 s de zéro ; journal : ' +
      JSON.stringify(r.module.journal.map((x) => x.quoi)));
    assert.equal(r.stockage.prise.etat, 'terminee');
  });

  await controle('§5c un silence de 2,5 s au milieu : alerte PUIS rétractation, les deux consignées', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/silence-de-2s-au-milieu.wav');
    const r = await prendre(page, {
      jusqua: () => {
        const e = window.EnregistreurVoix._etat();
        return e.journal.some((x) => x.quoi === 'son revenu');
      },
    });
    await ctx.close();
    const quoi = r.module.journal.map((x) => x.quoi);
    assert.ok(quoi.includes('piste muette'), 'journal : ' + JSON.stringify(quoi));
    assert.ok(quoi.includes('son revenu'), 'journal : ' + JSON.stringify(quoi));
    assert.ok(quoi.indexOf('piste muette') < quoi.indexOf('son revenu'), 'dans cet ordre');
    // La prise n'est PAS muette : elle a du son, et le passage muet reste consigné.
    assert.equal(r.stockage.prise.etat, 'terminee');
    assert.ok(r.stockage.prise.journal.some((x) => x.quoi === 'piste muette'),
      'le passage muet doit SURVIVRE dans la prise stockée');
  });

  // ── §6 — LA COMPTABILITÉ DES MORCEAUX ──────────────────────────────────────────────────────
  await controle('§6 morceaux : index continus, somme = compteur, et un nombre ENTIER de blocs', async () => {
    for (const taille of [5, 2]) {
      const { ctx, page } = await ouvrirBanc(nav, base,
        '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
      const r = await prendre(page, { attendreMs: taille === 5 ? 11000 : 5000, tailleMorceau: taille });
      await ctx.close();

      const ech = r.module.echantillonnage;
      const parMorceau = r.stockage.prise.echantillonsParMorceau;
      // (c) UNE SEULE GRANDEUR STOCKÉE : la taille EFFECTIVE. La nominale de 5 s n'est écrite
      // NI dans la prise NI dans le rapport — elle reste une consigne d'interface. Garder les
      // deux faisait deux vérités pour une même grandeur (220 500 contre 220 544 à 44 100 Hz).
      assert.equal(r.stockage.prise.echantillonsParMorceauDemandes, undefined,
        'la taille NOMINALE ne doit plus être écrite dans la prise');
      assert.equal(r.stockage.prise.tailleMorceau_s, undefined,
        'ni la durée nominale en secondes');
      assert.equal(r.module.mesures.morceaux.dureeMorceau_s, undefined,
        'ni dans le rapport');
      assert.equal(parMorceau % 128, 0,
        'un morceau doit faire un nombre ENTIER de blocs de 128 ; ' + parMorceau +
        ' % 128 = ' + (parMorceau % 128));
      // LA MÊME VALEUR PARTOUT : la prise, le rapport et le journal.
      assert.equal(r.module.mesures.morceaux.echantillonsParMorceau, parMorceau,
        'le rapport doit donner la taille effective de la prise : ' +
        r.module.mesures.morceaux.echantillonsParMorceau + ' contre ' + parMorceau);
      assert.equal(r.module.mesures.morceaux.blocsParMorceau, parMorceau / 128,
        'et son nombre de blocs');
      const auJournal = r.module.journal.find((x) => x.quoi === 'prise démarrée');
      assert.ok(auJournal, 'le journal doit porter « prise démarrée »');
      assert.equal(auJournal.echantillonsParMorceau, parMorceau,
        'le journal doit donner LA MÊME taille que le rapport : ' +
        auJournal.echantillonsParMorceau + ' contre ' + parMorceau);
      // Et elle doit rester à moins d'un bloc de ce que l'interface demandait.
      assert.ok(Math.abs(parMorceau - Math.round(taille * ech)) < 128,
        'la taille effective doit rester à moins d\'un bloc de la consigne : ' + parMorceau +
        ' contre ' + Math.round(taille * ech));

      // Index continus, sans trou : un trou dirait « morceau perdu » et doit se voir.
      const attendus = r.stockage.indexVus.map((_, i) => i);
      assert.deepEqual(r.stockage.indexVus.slice().sort((a, b) => a - b), attendus,
        'index des morceaux : ' + JSON.stringify(r.stockage.indexVus));

      // LE TÉMOIN : la somme relue dans IndexedDB contre le compteur du module.
      assert.equal(r.stockage.echantillons, r.module.echantillonsEcrits,
        'octets relus (' + r.stockage.echantillons + ') contre compteur du module (' +
        r.module.echantillonsEcrits + ')');
      assert.equal(r.stockage.morceaux, r.module.morceauxEcrits);
      assert.equal(r.stockage.prise.nbEchantillons, r.stockage.echantillons,
        'la prise stockée doit annoncer ce qu\'elle contient vraiment');

      // Et ce que la page AFFICHE doit dire la même chose.
      assert.ok(r.affiche.sbMorceaux.includes(String(r.stockage.morceaux)),
        'la barre d\'état affiche « ' + r.affiche.sbMorceaux + ' » pour ' +
        r.stockage.morceaux + ' morceaux');

      // Les blocs perdus, avec leurs deux termes.
      const b = r.module.mesures.blocs;
      assert.ok(typeof b.blocsComptesParLeWorklet === 'number' &&
                typeof b.blocsAttendusParLHorlogeAudio === 'number',
        'les deux termes doivent être présents');
      // L'ATTENDU VIENT DU FIL AUDIO, pas du fil principal. On ne présume pas zéro — on BORNE :
      // entre la trame notée à la réception de `demarrer-prise` et le premier bloc traité il peut
      // s'écouler un bloc, et autant à l'arrêt. Au-delà de deux blocs, quelque chose manque
      // vraiment, et ce contrôle doit le dire. Avec l'instant du fil PRINCIPAL, l'écart valait 10
      // à 12 blocs — la latence du message, prise pour une perte.
      assert.ok(typeof b.tramesEcouleesSurLeFilAudio === 'number' && b.tramesEcouleesSurLeFilAudio > 0,
        'les trames écoulées doivent venir du fil audio : ' + b.tramesEcouleesSurLeFilAudio);
      assert.ok(Math.abs(b.ecart) <= 2,
        'écart de ' + b.ecart + ' blocs entre le compte du worklet (' +
        b.blocsComptesParLeWorklet + ') et les trames du fil audio (' +
        b.blocsAttendusParLHorlogeAudio + ') : au-delà de 2, ce n\'est plus la granularité du ' +
        'démarrage, c\'est une perte');
      assert.ok(b.latenceDuDemarrage_ms !== undefined,
        'la latence du message de démarrage doit être mesurée POUR ELLE-MÊME, pas confondue ' +
        'avec une perte');
      console.log('        ' + taille + ' s/morceau à ' + ech + ' Hz : ' + parMorceau +
        ' éch effectifs (consigne ' + Math.round(taille * ech) + ') = ' + (parMorceau / 128) + ' blocs · ' +
        r.stockage.morceaux + ' morceaux · ' +
        r.stockage.echantillons + ' éch · blocs comptés ' + b.blocsComptesParLeWorklet +
        ' contre ' + b.blocsAttendusParLHorlogeAudio + ' attendus (écart ' + b.ecart +
        ', latence du démarrage ' + b.latenceDuDemarrage_ms + ' ms)');
    }
  });

  // ── §6b — À L'ARRÊT, PLUS AUCUNE ÉCRITURE EN VOL ───────────────────────────────────────────
  // « Écrit » et « cru écrit » sont deux choses. `ecrireMorceau` ne doit se tenir pour faite qu'à
  // `oncomplete` de la transaction, jamais au succès de la requête : entre les deux, la
  // transaction peut encore être abandonnée. Ce contrôle lit les compteurs du stockage DANS LE
  // MÊME tour que l'arrêt, et exige qu'il ne reste rien en vol — sinon la prise est annoncée
  // terminée alors que ses derniers octets ne sont pas sur le disque.
  await controle('§6b à l\'arrêt, aucune écriture ne reste en vol (attendue, pas seulement lancée)', async () => {
    // LE CONTRAT, ÉPROUVÉ DIRECTEMENT ET SANS COURSE. `oncomplete` est un ÉVÉNEMENT : il
    // s'exécute dans une tâche. Une promesse qui l'attend ne peut donc pas se résoudre avant
    // lui. Une promesse qui ne l'attend pas se résout dans une micro-tâche, c'est-à-dire AVANT.
    // Donc : si `ecrireMorceau` attend vraiment la transaction, le compteur `terminees` a
    // forcément avancé à l'instant où sa promesse se résout. Sinon, il ne peut pas avoir avancé.
    // C'est déterministe, là où mesurer « reste-t-il quelque chose en vol après l'arrêt ? » ne
    // l'était pas : l'arrêt laisse assez de temps aux transactions pour se clore d'elles-mêmes,
    // et la mutation passait.
    {
      const { ctx: c0, page: p0 } = await ouvrirBanc(nav, base);
      const t = await p0.evaluate(async () => {
        const e = window.EnregistreurVoix._etat();
        const S = window.VoixStockage;
        await S.creerPrise(e.db, {
          id: 'contrat', nom: 'contrat', creeLe: new Date().toISOString(),
          echantillonnage: 48000, canaux: 1, canalRetenu: 'gauche', tailleMorceau_s: 2,
          echantillonsParMorceau: 96000, nbEchantillons: 0, nbMorceaux: 0, etat: 'en-cours',
        });
        const avant = S.compteurs.terminees;
        const buf = new Int16Array(1000).buffer;
        await S.ecrireMorceau(e.db, 'contrat', 0, 0, buf, false);
        const apres = S.compteurs.terminees;
        return { avant, apres };
      });
      await c0.close();
      assert.equal(t.apres, t.avant + 1,
        'au moment où `ecrireMorceau` se résout, la transaction doit être TERMINÉE : compteur ' +
        t.avant + ' → ' + t.apres + '. `oncomplete` est un événement, donc une promesse qui ' +
        'l\'attend se résout après lui ; une promesse qui ne l\'attend pas se résout avant, et le ' +
        'compteur n\'a pas bougé. Un morceau « cru écrit » n\'est pas un morceau écrit.');
    }

    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });

    const r = await page.evaluate(async () => {
      const A = window.EnregistreurVoix;
      await A._demarrer();
      await new Promise((r2) => setTimeout(r2, 5200));   // plus de deux morceaux de 2 s
      await A._arreter();
      // Relevé PRIS AUSSITÔT : pas de setTimeout qui laisserait les transactions se clore.
      const c = window.VoixStockage.compteurs;
      const enVol = window.VoixStockage.enVol();
      const e = A._etat();
      let morceaux = 0, echantillons = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
        morceaux++; echantillons += m.pcm.byteLength / 2;
      });
      const prise = await window.VoixStockage.lirePrise(e.db, e.priseId);
      return {
        enVol, demandees: c.demandees, terminees: c.terminees, abandonnees: c.abandonnees,
        morceaux, echantillons,
        priseAnnonce: prise.nbEchantillons, priseMorceaux: prise.nbMorceaux, etat: prise.etat,
      };
    });
    await ctx.close();

    assert.equal(r.abandonnees, 0, 'aucune transaction ne doit être abandonnée : ' + r.abandonnees);
    assert.equal(r.enVol, 0,
      'il reste ' + r.enVol + ' transaction(s) en vol au moment où la prise est annoncée ' +
      'terminée (' + r.demandees + ' demandées, ' + r.terminees + ' terminées) : des octets sont ' +
      'annoncés écrits sans l\'être');
    assert.ok(r.morceaux >= 2, 'au moins deux morceaux attendus : ' + r.morceaux);
    assert.equal(r.priseAnnonce, r.echantillons,
      'la prise annonce ' + r.priseAnnonce + ' échantillons ; la base en contient ' + r.echantillons);
    assert.equal(r.priseMorceaux, r.morceaux, 'et le même nombre de morceaux');
    console.log('        ' + r.demandees + ' transactions demandées, ' + r.terminees +
      ' terminées, 0 en vol · ' + r.morceaux + ' morceaux / ' + r.echantillons + ' éch, annoncés ' +
      r.priseAnnonce);
  });

  // ── §16 — (a) LA FRÉQUENCE : CE QUE LE NAVIGATEUR FAIT VRAIMENT DE LA DEMANDE ─────────────
  // La mesure qui a fondé la décision, gardée comme contrôle pour qu'elle ne devienne pas une
  // croyance : si un jour un moteur refuse l'option, ou si la piste arrive déjà à 48 kHz, le
  // relevé le dira au lieu de laisser le commentaire du module mentir.
  await controle('§16 la demande de 48 000 Hz : honorée, mais la piste garde la sienne', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const out = {};
      const n = new AC(); out.natif = n.sampleRate; await n.close();
      try { const d = new AC({ sampleRate: 48000 }); out.demande48 = d.sampleRate; await d.close(); }
      catch (e) { out.demande48 = 'levée : ' + e.name; }
      const flux = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 2,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      out.piste = flux.getAudioTracks()[0].getSettings().sampleRate;
      flux.getTracks().forEach((t) => t.stop());
      out.constanteDuModule = window.EnregistreurVoix.FREQUENCE_DEMANDEE;
      return out;
    });
    await ctx.close();
    assert.equal(r.demande48, 48000,
      'l\'option est honorée dans ce moteur : ' + r.demande48 +
      ' — si elle cesse de l\'être, la décision du module doit être relue');
    assert.ok(typeof r.piste === 'number' && r.piste > 8000, 'piste : ' + r.piste);
    assert.equal(r.constanteDuModule, null,
      'le module garde la fréquence NATIVE : la demande interpole en amont et efface la ' +
      'fréquence où la voix est née');
    console.log('        natif ' + r.natif + ' Hz · demande 48000 → ' + r.demande48 +
      ' Hz (honorée) · piste du micro ' + r.piste + ' Hz → le contexte interpolerait');
  });

  // ── §16b — (a) DEUX PRISES DE FRÉQUENCES DIFFÉRENTES DANS UN MÊME MONTAGE ─────────────────
  // LE TEST QUE LE CDC DEMANDE À T1 a, ET QUI MANQUAIT. §16 mesurait que l'option de fréquence
  // est honorée, §8 et §20 qu'UNE prise porte sa fréquence réelle — mais rien n'éprouvait le cas
  // qui compte pour le lot 4 : deux prises de fréquences DIFFÉRENTES côte à côte dans le même
  // stockage, c'est-à-dire dans le même montage. Aucun périphérique ne produit cela tout seul,
  // d'où la fréquence imposée au banc (`?frequence=`), le défaut du produit restant le natif.
  await controle('§16b deux prises de fréquences différentes dans un même montage', async () => {
    // UN SEUL contexte de navigateur pour les deux prises : même origine, donc même IndexedDB,
    // donc même montage. C'est tout le point — deux onglets séparés ne prouveraient rien.
    const ctx = await nav.newContext({ permissions: ['microphone'] });

    const prendreA = async (requete) => {
      const page = await ctx.newPage();
      await page.goto(base + '/banc-enregistreur.html' + requete);
      await page.waitForFunction(() => window.__bancPret === true || window.__bancErreur,
        null, { timeout: 20000 });
      await page.click('[data-action="autoriser"]');
      await page.waitForFunction(() => {
        const f = window.EnregistreurVoix._fenetreDeDecision();
        return f.suffisante && f.secondes >= 1.5;
      }, null, { timeout: 20000 });
      await page.click('[data-action="demarrer"]');
      await page.waitForTimeout(1600);
      await page.click('[data-action="arreter"]');
      await page.waitForFunction(() => /terminée|muette/i.test(
        document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
      const r = await page.evaluate(() => {
        const e = window.EnregistreurVoix._etat();
        return { priseId: e.priseId, echantillonnage: e.echantillonnage,
                 frequenceAffichee: document.querySelector('[data-sb-frequence]').textContent,
                 mesures: e.mesures };
      });
      await page.close();
      return r;
    };

    // Prise 1 : la fréquence NATIVE du périphérique (celle du produit).
    const a = await prendreA('');
    // Prise 2 : 48 000 Hz imposés au contexte, dans le MÊME stockage.
    const b = await prendreA('?frequence=48000');

    // Les deux prises relues depuis le stockage partagé : c'est le montage.
    const page3 = await ctx.newPage();
    await page3.goto(base + '/banc-enregistreur.html');
    await page3.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    const montage = await page3.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const l = await window.VoixStockage.listerPrises(e.db);
      const out = [];
      for (const p of l) {
        let ech = 0, nb = 0;
        await window.VoixStockage.parcourirMorceaux(e.db, p.id, (m) => {
          nb++; ech += m.pcm.byteLength / 2;
        });
        out.push({ id: p.id, echantillonnage: p.echantillonnage,
                   parMorceau: p.echantillonsParMorceau, nbEchantillons: p.nbEchantillons,
                   morceaux: nb, echantillonsRelus: ech,
                   duree_s: p.nbEchantillons / p.echantillonnage });
      }
      // Ce que la liste AFFICHE, et non ce que le module déclare.
      const affichees = [...document.querySelectorAll('[data-prises] [data-prise]')]
        .map((el) => el.querySelector('[data-detail]').textContent);
      return { prises: out, affichees };
    });
    await page3.close();
    await ctx.close();

    // ── LES DEUX FRÉQUENCES SONT BIEN DIFFÉRENTES ──────────────────────────────────────────
    assert.notEqual(a.echantillonnage, b.echantillonnage,
      'les deux prises doivent avoir des fréquences différentes ; obtenu ' + a.echantillonnage +
      ' et ' + b.echantillonnage + ' — sans cela le contrôle n\'éprouve rien');
    assert.equal(b.echantillonnage, 48000, 'la seconde doit être à 48 000 : ' + b.echantillonnage);

    // ── CHAQUE PRISE PORTE SA PROPRE FRÉQUENCE, dans le montage ────────────────────────────
    assert.equal(montage.prises.length, 2,
      'les deux prises doivent coexister dans le même stockage : ' + JSON.stringify(montage.prises));
    const pa = montage.prises.find((x) => x.id === a.priseId);
    const pb = montage.prises.find((x) => x.id === b.priseId);
    assert.ok(pa && pb, 'les deux prises doivent être retrouvées par leur identifiant');
    assert.equal(pa.echantillonnage, a.echantillonnage,
      'la prise 1 doit porter SA fréquence : ' + pa.echantillonnage);
    assert.equal(pb.echantillonnage, 48000,
      'la prise 2 doit porter SA fréquence : ' + pb.echantillonnage);

    // ── CHAQUE TAILLE DE MORCEAU RESTE UN NOMBRE ENTIER DE BLOCS, à sa fréquence ───────────
    for (const x of [pa, pb]) {
      assert.equal(x.parMorceau % 128, 0,
        'à ' + x.echantillonnage + ' Hz, la taille effective doit être un entier de blocs : ' +
        x.parMorceau + ' % 128 = ' + (x.parMorceau % 128));
      assert.equal(x.echantillonsRelus, x.nbEchantillons,
        'et la prise doit annoncer ce qu\'elle contient : ' + x.nbEchantillons + ' contre ' +
        x.echantillonsRelus);
    }
    // À 48 000 Hz, 5 s font 240 000 échantillons, qui SONT un entier de blocs : la taille
    // effective doit donc valoir exactement la consigne, contrairement à 44 100 Hz.
    assert.equal(pb.parMorceau, 240000,
      'à 48 000 Hz, 5 s font 240 000 échantillons pile (1 875 blocs) : ' + pb.parMorceau);
    assert.notEqual(pa.parMorceau, pb.parMorceau,
      'et les deux tailles effectives diffèrent, puisque les fréquences diffèrent');

    // ── CE QUE LE LOT 4 DEVRA FAIRE, dit prise par prise ──────────────────────────────────
    assert.equal(b.mesures.frequence.aReechantillonnerAuLot4, false,
      'la prise à 48 000 Hz ne demande aucun rééchantillonnage');
    assert.equal(a.mesures.frequence.aReechantillonnerAuLot4, a.echantillonnage !== 48000,
      'et la prise native le demande si elle n\'est pas à 48 000 : ' + a.echantillonnage);

    // ── ET LA PAGE AFFICHE LES DEUX FRÉQUENCES, pas une seule ─────────────────────────────
    assert.ok(a.frequenceAffichee.includes(String(a.echantillonnage)),
      'la page de la prise 1 affichait sa fréquence : ' + a.frequenceAffichee);
    assert.ok(b.frequenceAffichee.includes('48000'),
      'celle de la prise 2 aussi : ' + b.frequenceAffichee);
    assert.equal(montage.affichees.length, 2, 'les deux prises doivent être AFFICHÉES');
    assert.ok(montage.affichees.some((t) => t.includes(String(a.echantillonnage) + ' Hz')),
      'la liste doit montrer la fréquence de la prise 1 : ' + JSON.stringify(montage.affichees));
    assert.ok(montage.affichees.some((t) => t.includes('48000 Hz')),
      'et celle de la prise 2 : ' + JSON.stringify(montage.affichees));

    console.log('        prise 1 : ' + pa.echantillonnage + ' Hz, ' + pa.parMorceau +
      ' éch/morceau (' + (pa.parMorceau / 128) + ' blocs), rééchantillonnage ' +
      a.mesures.frequence.aReechantillonnerAuLot4);
    console.log('        prise 2 : ' + pb.echantillonnage + ' Hz, ' + pb.parMorceau +
      ' éch/morceau (' + (pb.parMorceau / 128) + ' blocs), rééchantillonnage ' +
      b.mesures.frequence.aReechantillonnerAuLot4);
    console.log('        les deux coexistent dans le même stockage, chacune avec SA fréquence');
  });

  await controle('§16c le défaut du PRODUIT reste la fréquence native', async () => {
    // La fréquence imposée est un levier du BANC, pas un changement de décision : la constante
    // du module doit rester `null`, sans quoi §16b aurait verrouillé 48 000 par la porte de
    // derrière.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => ({
      constante: window.EnregistreurVoix.FREQUENCE_DEMANDEE,
      servicesDuBanc: window.__bancServices ? ('frequenceDemandee' in window.__bancServices) : 'absent',
    }));
    await ctx.close();
    assert.equal(r.constante, null,
      'la constante du module doit rester null : ' + JSON.stringify(r.constante));
    assert.equal(r.servicesDuBanc, false,
      'et sans `?frequence=`, le banc ne doit rien imposer : ' + JSON.stringify(r.servicesDuBanc));
  });

  // ── §17 — (b) LE CANAL : FENÊTRE DE DÉCISION, PUIS VÉRIFICATION SUR LA PRISE ───────────────
  await controle('§17 un canal actif au DÉMARRAGE puis à zéro ne décide pas de la prise', async () => {
    // La fixture : le canal droit porte du signal pendant la première seconde, puis tombe à zéro
    // pour toujours. C'est le cas que la fenêtre de deux secondes doit neutraliser — et c'est
    // aussi celui où la vérification de fin de prise doit parler.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/droit-actif-puis-zero.wav');
    await page.click('[data-action="autoriser"]');
    const r = await page.evaluate(async () => {
      const A = window.EnregistreurVoix;
      // On attend que la fenêtre soit pleine ET que la première seconde du droit soit passée.
      const t0 = performance.now();
      while (performance.now() - t0 < 3400) await new Promise((r2) => setTimeout(r2, 100));
      const f = A._fenetreDeDecision();
      return {
        fenetre_s: f.secondes, suffisante: f.suffisante, releves: f.relevés,
        surLaFenetre: A.choisirCanal(f.sommes, 'auto'),
        surToutDepuisLAutorisation: A.choisirCanal(A._etat().sommesAnalyse, 'auto'),
      };
    });
    assert.ok(r.suffisante, 'la fenêtre doit être pleine : ' + r.fenetre_s + ' s');
    assert.ok(r.fenetre_s <= 2.2 && r.fenetre_s >= 1.0,
      'la fenêtre doit faire environ deux secondes, pas tout l\'historique : ' + r.fenetre_s + ' s');
    // SUR LA FENÊTRE : le droit est à zéro depuis une seconde → gauche.
    assert.equal(r.surLaFenetre.canal, 'gauche',
      'sur les deux dernières secondes, le droit est vide : ' + r.surLaFenetre.raison);
    // SUR TOUT L'HISTORIQUE : le droit a porté du signal → la décision serait autre, et c'est
    // précisément ce que la fenêtre évite.
    assert.notEqual(r.surToutDepuisLAutorisation.canal, 'gauche',
      'sur tout l\'historique, le droit compte encore — c\'est ce que la fenêtre neutralise. ' +
      'Obtenu : ' + r.surToutDepuisLAutorisation.canal + ' (' +
      r.surToutDepuisLAutorisation.raison + ')');

    // ET LA DÉCISION RÉELLE, celle que le module gèle en démarrant. Sans cette partie, le
    // contrôle n'éprouvait que `choisirCanal` sur deux jeux de sommes : une mutation qui fait
    // décider le module sur tout l'historique passait sans être vue.
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1200);
    const gele = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { canalRetenu: e.canalRetenu, raison: e.canalRaison,
               affiche: document.querySelector('[data-sb-canal]').textContent };
    });
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    await ctx.close();
    assert.equal(gele.canalRetenu, 'gauche',
      'le canal RÉELLEMENT gelé par le module doit suivre la fenêtre, non l\'historique : ' +
      gele.canalRetenu + ' (' + gele.raison + ')');
    assert.ok(/canal gauche/.test(gele.affiche),
      'et la page doit l\'afficher : ' + gele.affiche);
    console.log('        fenêtre ' + r.fenetre_s.toFixed(2) + ' s → ' + r.surLaFenetre.canal +
      ' · tout l\'historique → ' + r.surToutDepuisLAutorisation.canal);
  });

  await controle('§17b la raison du rapport est calculée SUR LA PRISE, et le désaccord est dit', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 2600 });
    await ctx.close();
    const v = r.module.mesures.verificationDuCanal;
    assert.ok(v && typeof v === 'object', 'la vérification doit être au rapport : ' + JSON.stringify(v));
    assert.equal(v.geleAvantLaPrise, r.module.canalRetenu, 'le gel doit être consigné');
    assert.ok(v.recalculeSurLaPrise, 'le recalcul sur la prise doit être consigné');
    assert.equal(v.accord, true, 'sur cette fixture, les deux doivent s\'accorder');
    // LA RAISON DU RAPPORT EST CELLE DE LA PRISE, jamais celle de la fenêtre d'avant.
    assert.equal(r.module.mesures.raisonDuCanal, v.raisonSurLaPrise,
      'le rapport doit porter la raison calculée sur la prise, pas sur la fenêtre d\'avant');
    assert.ok(v.fenetreDeDecision && typeof v.fenetreDeDecision.secondes === 'number',
      'et dire sur quelle fenêtre la décision avait été gelée : ' + JSON.stringify(v.fenetreDeDecision));
    assert.ok(v.regle && v.regle.length > 40, 'la règle doit être nommée');
    console.log('        gelé ' + v.geleAvantLaPrise + ' · recalculé ' + v.recalculeSurLaPrise +
      ' · accord ' + v.accord + ' · fenêtre ' + v.fenetreDeDecision.secondes + ' s');
  });

  await controle('§17c le canal qui CHANGE pendant la prise : désaccord dit, raison de la prise', async () => {
    // LE SEUL CAS OÙ LA REVÉRIFICATION A QUELQUE CHOSE À DIRE. Le droit est à zéro pendant les
    // quatre premières secondes — la fenêtre d'avant-prise voit donc « droit vide → gauche » —
    // puis il devient actif et plus fort. La prise, elle, dit « le plus fort → droit ». Sans
    // cette fixture, la revérification s'exécutait toujours sur un cas d'accord et ne prouvait
    // rien : trois mutations passaient.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/droit-devient-actif-pendant.wav');
    const r = await prendre(page, { attendreMs: 9000 });
    await ctx.close();

    const v = r.module.mesures.verificationDuCanal;
    assert.equal(v.geleAvantLaPrise, 'gauche',
      'la fenêtre d\'avant-prise voit le droit vide : ' + v.raisonAvantLaPrise);
    assert.equal(v.recalculeSurLaPrise, 'droit',
      'la prise elle-même porte un droit actif et plus fort : ' + v.raisonSurLaPrise);
    assert.equal(v.accord, false, 'les deux verdicts diffèrent, et cela doit être dit');
    // LA RAISON DU RAPPORT EST CELLE DE LA PRISE, et elle diffère ici de celle de la fenêtre.
    assert.equal(r.module.mesures.raisonDuCanal, v.raisonSurLaPrise,
      'le rapport doit porter la raison calculée sur la prise');
    assert.notEqual(r.module.mesures.raisonDuCanal, v.raisonAvantLaPrise,
      'et non celle de la fenêtre d\'avant : les deux sont différentes dans ce cas');
    // LE DÉSACCORD EST AFFICHÉ, et journalisé.
    const bandeau = r.affiche.messages.find((m) => /ne correspond pas à ce que la prise/.test(m.texte));
    assert.ok(bandeau, 'un avis doit être AFFICHÉ ; messages : ' +
      JSON.stringify(r.affiche.messages.map((m) => m.texte.slice(0, 50))));
    assert.equal(bandeau.etat, 'error', 'et signalé comme une erreur');
    assert.ok(r.module.journal.some((x) => x.quoi === 'canal démenti par la prise'),
      'et journalisé ; journal : ' + JSON.stringify(r.module.journal.map((x) => x.quoi)));
    // RIEN N'EST BLOQUÉ : la prise est enregistrée malgré le désaccord.
    assert.ok(r.stockage.echantillons > 0, 'la prise doit être enregistrée');
    console.log('        gelé ' + v.geleAvantLaPrise + ' · prise ' + v.recalculeSurLaPrise +
      ' · accord false · avis affiché et journalisé');
  });

  // ── §18 — (d) LE BRUIT DE PIÈCE (T13) ─────────────────────────────────────────────────────
  await controle('§18 trois états de bruit, aux seuils de la constante unique', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const B = A.BRUIT;
      // Des sommes fabriquées pour tomber de part et d'autre des deux paliers. L'amplitude
      // efficace qui donne d dBFS est 10^(d/20).
      const pour = (dbfs, partGrave) => {
        const eff = Math.pow(10, dbfs / 20), n = 48000 * 3;
        return { n, sommeCarre: eff * eff * n, sommeCarreGrave: eff * eff * n * partGrave,
                 crete: eff * Math.SQRT2, zeros: 0, coupureHz: 120, echantillonnage: 48000 };
      };
      return {
        seuils: { calme: B.calmeMax_dbfs, bruyant: B.bruyantMin_dbfs, grave: B.partGraveMin },
        tresCalme: A.verdictBruit(pour(-72, 0.2)),
        aLaLimiteCalme: A.verdictBruit(pour(-65, 0.2)),
        correct: A.verdictBruit(pour(-61, 0.2)),
        aLaLimiteBruyant: A.verdictBruit(pour(-58, 0.2)),
        bruyant: A.verdictBruit(pour(-56, 0.2)),
        // la salle de soins de Christophe : bruyante ET grave
        salleDeSoins: A.verdictBruit(pour(-56.8, 0.72)),
        nonMesure: A.verdictBruit(null),
      };
    });
    assert.deepEqual(r.seuils, { calme: -65, bruyant: -58, grave: 0.5 },
      'les seuils doivent être ceux décidés : ' + JSON.stringify(r.seuils));
    assert.equal(r.tresCalme.etat, 'calme');
    assert.equal(r.aLaLimiteCalme.etat, 'calme', '≤ −65 est calme, bornes comprises');
    assert.equal(r.correct.etat, 'correct');
    assert.equal(r.aLaLimiteBruyant.etat, 'correct', '−58 pile n\'est pas encore bruyant');
    assert.equal(r.bruyant.etat, 'bruyant');
    // La salle de soins réelle : bruyante, et le grave est dominant.
    assert.equal(r.salleDeSoins.etat, 'bruyant');
    assert.equal(r.salleDeSoins.graveDominant, true,
      'part de grave ' + r.salleDeSoins.partGrave + ' > ' + r.seuils.grave);
    assert.ok(/filtre le réduira au mixage/.test(r.salleDeSoins.mention),
      'la mention de grave doit être celle demandée : ' + r.salleDeSoins.mention);
    assert.equal(r.correct.graveDominant, false, 'un bruit à 20 % de grave n\'est pas grave');
    assert.equal(r.nonMesure.mesure, false, 'non mesuré doit se dire, non s\'inventer');
    assert.ok(r.bruyant.regle.includes('PENTE') || r.bruyant.regle.includes('pente'),
      'la règle doit dire que le passe-bas est une pente, pas un mur : ' + r.bruyant.regle);
    await ctx.close();
    console.log('        −72 calme · −65 calme · −61 correct · −58 correct · −56 bruyant · ' +
      'salle de soins (−56,8 dBFS, grave 0,72) bruyant + grave');
  });

  await controle('§18b le bruit est mesuré sur le VRAI chemin, pendant le silence initial', async () => {
    // La fixture : trois secondes de bruit grave (50 et 100 Hz) puis de la voix. C'est le profil
    // de la salle de Christophe, et la mesure doit porter sur les trois premières secondes.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/bruit-grave-puis-voix.wav');
    const r = await prendre(page, {
      jusqua: () => !!window.EnregistreurVoix._etat().bruit,
    });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b));
    assert.ok(b.secondes >= 2.8 && b.secondes <= 3.2,
      'la mesure doit porter sur les trois secondes du silence initial : ' + b.secondes);
    assert.equal(b.silenceInitialRespecte, true,
      'ici le silence initial EST tenu (7 s de bruit seul) ; montée mesurée ' +
      b.monteeEntreLesDeuxMoities_db.toFixed(1) + ' dB');
    assert.equal(b.etat, 'bruyant', 'et le verdict est rendu : ' + b.etat);
    assert.equal(b.graveDominant, true,
      'un bruit à 50 et 100 Hz doit être vu comme grave ; part mesurée ' + b.partGrave);
    assert.ok(b.partGrave > 0.5, 'part de grave : ' + b.partGrave);
    // CE QUE LA PAGE AFFICHE, et non ce que le module déclare.
    const affiche = r.affiche.bruit || '';
    assert.ok(/Bruit de pièce/.test(affiche), 'la page doit afficher le bruit : ' + affiche);
    assert.ok(affiche.includes('part de grave'),
      'avec la grandeur dont le verdict découle : ' + affiche);
    assert.ok(/filtre le réduira au mixage/.test(affiche),
      'et la mention de grave : ' + affiche);
    // LES DEUX MOITIÉS DOIVENT ÊTRE MESURÉES SUR LE VRAI CHEMIN. Sans cette vérification, une
    // mutation du worklet qui cesse de les compter laisse monteeDb à 0 et personne ne le voit :
    // le contrôle exact (§18c) travaille sur des sommes fabriquées, pas sur le worklet.
    assert.ok(typeof b.efficaceDbfsPremiereMoitie === 'number' &&
              isFinite(b.efficaceDbfsPremiereMoitie),
      'la première moitié doit porter un niveau fini : ' + b.efficaceDbfsPremiereMoitie);
    assert.ok(typeof b.efficaceDbfsSecondeMoitie === 'number' &&
              isFinite(b.efficaceDbfsSecondeMoitie),
      'la seconde moitié aussi : ' + b.efficaceDbfsSecondeMoitie);
    assert.ok(b.efficaceDbfsPremiereMoitie < -40 && b.efficaceDbfsSecondeMoitie < -40,
      'et toutes deux au niveau d\'un bruit de pièce : ' +
      b.efficaceDbfsPremiereMoitie.toFixed(1) + ' et ' + b.efficaceDbfsSecondeMoitie.toFixed(1));
    assert.ok(Math.abs(b.monteeEntreLesDeuxMoities_db) < 3,
      'le bruit étant régulier, les deux moitiés doivent s\'accorder : ' +
      b.monteeEntreLesDeuxMoities_db.toFixed(2) + ' dB');
    // T13 N'EST JAMAIS BLOQUANT : l'avis est une INFORMATION, pas une erreur.
    const avis = r.affiche.messages.find((m) => /La pièce est bruyante/.test(m.texte));
    assert.ok(avis, 'l\'avis de pièce bruyante doit être affiché : ' +
      JSON.stringify(r.affiche.messages.map((m) => m.texte.slice(0, 40))));
    assert.equal(avis.etat, 'info',
      'T13 n\'est JAMAIS bloquant : l\'avis doit être une information, pas une erreur. Obtenu : '
      + avis.etat);
    assert.equal(avis.icone, '#icon-info', 'avec l\'icône d\'information du sprite du kit');
    // JAMAIS BLOQUANT : la prise s'est faite.
    assert.ok(r.stockage.echantillons > 0, 'la prise doit avoir été enregistrée malgré le bruit');
    assert.notEqual(r.stockage.prise.etat, 'muette', 'et ne pas être muette');
    console.log('        ' + b.etat + ' · ' + b.efficaceDbfs.toFixed(1) + ' dBFS · part de grave ' +
      b.partGrave.toFixed(3) + ' sur ' + b.secondes.toFixed(2) + ' s · prise enregistrée quand même');
  });

  await controle('§18c un silence initial NON tenu rend la mesure douteuse, pas fausse', async () => {
    // CE CONTRÔLE EST EXACT, ET NON SUR LE VRAI CHEMIN, POUR UNE RAISON QUI SE DIT.
    // La fenêtre de mesure démarre avec la prise, et l'instant où la prise démarre ne peut pas
    // être épinglé sur la frise d'une fixture : il dépend du temps que met la fenêtre de décision
    // du canal à se remplir. Un essai réel plaçait donc la voix soit entièrement dans la fenêtre,
    // soit entièrement dehors, selon la machine — un contrôle qui passe ou échoue au hasard ne
    // contrôle rien. La RÈGLE se vérifie donc sur des sommes exactes, et le VRAI chemin est
    // éprouvé en §18b sur le cas où le silence EST tenu.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const ECH = 48000, N = ECH * 3;
      // Deux moitiés d'une fenêtre de 3 s. `pour` fabrique les sommes brutes que le worklet
      // posterait, avec une amplitude efficace par moitié.
      const pour = (db1, db2, partGrave) => {
        const e1 = Math.pow(10, db1 / 20), e2 = Math.pow(10, db2 / 20);
        const n1 = N / 2, n2 = N / 2;
        const sc = e1 * e1 * n1 + e2 * e2 * n2;
        return { n: N, sommeCarre: sc, sommeCarreGrave: sc * partGrave,
                 crete: Math.max(e1, e2) * Math.SQRT2, zeros: 0,
                 n1, sommeCarre1: e1 * e1 * n1, n2, sommeCarre2: e2 * e2 * n2,
                 coupureHz: 120, echantillonnage: ECH };
      };
      return {
        seuilMontee: A.BRUIT.monteeMax_db,
        // le silence tenu : les deux moitiés au même niveau
        tenu: A.verdictBruit(pour(-57, -57, 0.72)),
        // juste sous le seuil : 5 dB de montée, encore crédible pour un bruit de pièce
        sousLeSeuil: A.verdictBruit(pour(-60, -55, 0.72)),
        // le fait du lot 0 : la voix démarre dans la seconde moitié, +27 dB
        voixDansLaSecondeMoitie: A.verdictBruit(pour(-57, -30, 0.20)),
        // juste au-dessus du seuil
        justeAuDessus: A.verdictBruit(pour(-60, -53.5, 0.72)),
      };
    });
    await ctx.close();

    assert.equal(r.seuilMontee, 6, 'le seuil de montée doit être 6 dB : ' + r.seuilMontee);

    assert.equal(r.tenu.silenceInitialRespecte, true, 'deux moitiés égales : silence tenu');
    assert.equal(r.tenu.etat, 'bruyant', 'et le verdict est rendu : ' + r.tenu.etat);
    assert.ok(Math.abs(r.tenu.monteeEntreLesDeuxMoities_db) < 0.01,
      'montée nulle attendue : ' + r.tenu.monteeEntreLesDeuxMoities_db);

    assert.equal(r.sousLeSeuil.silenceInitialRespecte, true,
      '5 dB de montée reste crédible pour une pièce : ' +
      r.sousLeSeuil.monteeEntreLesDeuxMoities_db.toFixed(1) + ' dB');
    assert.notEqual(r.sousLeSeuil.etat, 'douteux', 'donc le verdict est rendu');

    const v = r.voixDansLaSecondeMoitie;
    assert.equal(v.silenceInitialRespecte, false,
      'une voix qui démarre dans la seconde moitié doit être vue : ' +
      v.monteeEntreLesDeuxMoities_db.toFixed(1) + ' dB');
    assert.equal(v.etat, 'douteux',
      'l\'état doit être « douteux » plutôt qu\'un verdict crédible et faux : ' + v.etat);
    assert.ok(v.monteeEntreLesDeuxMoities_db > 20,
      'la montée doit être franche : ' + v.monteeEntreLesDeuxMoities_db);
    assert.ok(/silence initial n’a pas été respecté|silence initial n\'a pas été respecté/.test(v.mention),
      'la mention doit dire pourquoi : ' + v.mention);
    // CE QU'ON AURAIT RENDU reste lisible : rien n'est perdu, c'est juste déclaré peu fiable.
    assert.ok(v.etatSiLeSilenceEtaitRespecte,
      'l\'état qui aurait été rendu doit rester au rapport : ' + v.etatSiLeSilenceEtaitRespecte);
    assert.ok(typeof v.efficaceDbfsPremiereMoitie === 'number' &&
              typeof v.efficaceDbfsSecondeMoitie === 'number',
      'et les deux moitiés doivent porter leur décibel, pour que le lecteur refasse le calcul');

    assert.equal(r.justeAuDessus.etat, 'douteux',
      '6,5 dB dépasse le seuil : ' + r.justeAuDessus.monteeEntreLesDeuxMoities_db.toFixed(1));

    console.log('        tenu 0,0 dB → verdict rendu · 5,0 dB → rendu · ' +
      r.justeAuDessus.monteeEntreLesDeuxMoities_db.toFixed(1) + ' dB → douteux · ' +
      v.monteeEntreLesDeuxMoities_db.toFixed(1) + ' dB (voix) → douteux');
  });

  await controle('§18d le passe-bas coupe à 120 Hz, mesuré sur un son pur à 120 Hz', async () => {
    // LE SEUL SON QUI RÉVÈLE LA COUPURE. Un passe-bas de Butterworth du 2e ordre laisse passer
    // la MOITIÉ de l'énergie à sa fréquence de coupure : la part de grave doit donc valoir 0,50.
    // Un filtre calculé pour 48 kHz mais appliqué à 44,1 kHz couperait à 110 Hz et donnerait
    // environ 0,42. Avec un bruit à 50 et 100 Hz, les deux filtres donnent presque la même
    // chose, et la mutation passait : il faut un son À la coupure pour la voir.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/bruit-120hz.wav');
    const r = await prendre(page, {
      jusqua: () => !!window.EnregistreurVoix._etat().bruit,
    });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b));
    assert.equal(b.coupureHz, 120, 'la coupure annoncée : ' + b.coupureHz);
    assert.ok(Math.abs(b.partGrave - 0.5) < 0.03,
      'à 120 Hz pile, un Butterworth du 2e ordre laisse passer la moitié de l\'énergie : ' +
      'part attendue 0,50 ± 0,03, mesurée ' + b.partGrave.toFixed(4) +
      '. Une valeur vers 0,42 signifie que le filtre coupe à 110 Hz — calculé pour 48 kHz et ' +
      'appliqué à ' + r.module.echantillonnage + ' Hz.');
    console.log('        son pur à 120 Hz, contexte à ' + r.module.echantillonnage +
      ' Hz → part de grave ' + b.partGrave.toFixed(4) + ' (attendu 0,50)');
  });

  // ── §19 — LA CONSTRUCTION DU GRAPHE : UNE SEULE À LA FOIS ─────────────────────────────────
  await controle('§19 deux constructions concurrentes : le nœud appartient au contexte vivant', async () => {
    // LA COURSE QUI A FAIT UNE « PRISE MUETTE ». Changer la taille de morceau lance une
    // construction, cliquer « Autoriser » en lance une seconde ; `addModule` étant asynchrone,
    // la seconde fermait le contexte de la première, qui installait ensuite SON nœud — orphelin.
    // §15 ne le voyait plus depuis que la fenêtre est vidée à la reconstruction : l'attente
    // d'une fenêtre pleine masquait le défaut. Ce contrôle vise donc l'INVARIANT, pas le symptôme.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });

    // DEUX CONSTRUCTIONS LANCÉES DOS À DOS, sans laisser la première finir.
    const apres = await page.evaluate(async () => {
      const A = window.EnregistreurVoix;
      // Le changement de taille déclenche une reconstruction…
      const sel = document.querySelector('[data-taille-morceau]');
      sel.value = '2';
      sel.dispatchEvent(new Event('change'));
      // …et le clic sur « Autoriser » une seconde, aussitôt.
      document.querySelector('[data-action="autoriser"]').click();
      // On laisse les deux se résoudre.
      await new Promise((r) => setTimeout(r, 2500));
      const e = A._etat();
      return {
        etatDuContexte: e.ctx ? e.ctx.state : 'absent',
        noeudSurLeContexteVivant: !!(e.noeud && e.ctx && e.noeud.context === e.ctx),
        frequenceAffichee: document.querySelector('[data-sb-frequence]').textContent,
      };
    });
    assert.notEqual(apres.etatDuContexte, 'closed',
      'le contexte installé ne doit JAMAIS être fermé : ' + apres.etatDuContexte);
    assert.equal(apres.noeudSurLeContexteVivant, true,
      'le nœud installé doit appartenir au contexte installé — sinon il est orphelin et la ' +
      'prise suivante n\'enregistre rien');

    // ET LA FENÊTRE EST VIDÉE À LA RECONSTRUCTION : des relevés d'un contexte fermé ne doivent
    // pas décider du canal du suivant.
    const fenetre = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const avant = A._fenetreDeDecision().sommes.n;
      const sel = document.querySelector('[data-taille-morceau]');
      sel.value = '5';
      sel.dispatchEvent(new Event('change'));
      return { avant, aussitotApres: A._fenetreDeDecision().sommes.n };
    });
    assert.ok(fenetre.avant > 0, 'la fenêtre était pleine avant : ' + fenetre.avant);
    assert.equal(fenetre.aussitotApres, 0,
      'et vide aussitôt après la reconstruction : ' + fenetre.aussitotApres + ' échantillons');

    // Puis la prise redevient possible : le graphe est vivant.
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1500);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    const prise = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { ech: e.echantillonsEcrits, mode: document.querySelector('[data-mode]').textContent };
    });
    await ctx.close();
    assert.ok(prise.ech > 0,
      'après deux constructions concurrentes, la prise doit enregistrer : ' + prise.ech +
      ' échantillons, état « ' + prise.mode + ' »');
    assert.ok(!/muette/i.test(prise.mode), 'et ne pas être muette : ' + prise.mode);
    console.log('        contexte ' + apres.etatDuContexte + ' · nœud sur le contexte vivant · ' +
      'fenêtre ' + fenetre.avant + ' → ' + fenetre.aussitotApres + ' · prise ' + prise.ech + ' éch');
  });

  await controle('§19b la construction DÉPASSÉE n\'installe jamais son nœud (ordre forcé)', async () => {
    // LA COURSE, REPRODUITE À COUP SÛR. Le défaut ne se manifeste que si la construction la plus
    // ANCIENNE finit la DERNIÈRE : elle installe alors son nœud par-dessus le graphe récent, et
    // comme son propre contexte a été fermé entre-temps, ce nœud est orphelin — la prise
    // suivante n'enregistre rien et se déclare « muette ». En laissant faire le hasard des
    // caches, l'ordre défavorable n'arrive qu'une fois sur deux ; on le FORCE donc en servant le
    // worklet de la première construction avec un retard.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });

    const r = await page.evaluate(async () => {
      const A = window.EnregistreurVoix;
      const S = window.__bancServices;
      const normal = S.urlWorklet;
      // 1) construction LENTE : son `addModule` mettra 1,5 s à répondre.
      S.urlWorklet = normal + '?lent=1500';
      const sel = document.querySelector('[data-taille-morceau]');
      sel.value = '2'; sel.dispatchEvent(new Event('change'));
      // 2) construction RAPIDE, lancée aussitôt : elle finira la première et fermera le
      //    contexte de la lente.
      await new Promise((r2) => setTimeout(r2, 50));
      S.urlWorklet = normal;
      sel.value = '5'; sel.dispatchEvent(new Event('change'));
      // 3) on laisse la LENTE se résoudre, bien après la rapide.
      await new Promise((r2) => setTimeout(r2, 3000));
      const e = A._etat();
      return {
        etatDuContexte: e.ctx ? e.ctx.state : 'absent',
        noeudSurLeContexteVivant: !!(e.noeud && e.ctx && e.noeud.context === e.ctx),
        etatDuContexteDuNoeud: (e.noeud && e.noeud.context) ? e.noeud.context.state : 'absent',
        // CE QUI REND LA COURSE OBSERVABLE. Mesuré : `new AudioWorkletNode` sur un contexte
        // fermé LÈVE InvalidStateError. Sans le compteur de génération, la construction dépassée
        // ne parvient donc pas à installer son nœud — mais sa promesse REJETTE, et le gestionnaire
        // du sélecteur affiche alors à Christophe « Le graphe audio n'a pas pu être reconstruit »
        // pour une reconstruction qui, elle, a parfaitement réussi. Un bandeau d'erreur qui
        // apparaît sans qu'il y ait d'erreur est précisément ce qu'on ne veut pas.
        erreurDeGraphe: (() => {
          const m = document.querySelector('[data-messages] [data-cle="graphe"]');
          return m ? m.querySelector('span').textContent : null;
        })(),
      };
    });
    assert.notEqual(r.etatDuContexte, 'closed',
      'le contexte installé ne doit pas être fermé : ' + r.etatDuContexte);
    assert.equal(r.etatDuContexteDuNoeud, 'running',
      'le contexte DU NŒUD doit tourner ; « closed » signifie qu\'une construction dépassée a ' +
      'installé son nœud orphelin. Obtenu : ' + r.etatDuContexteDuNoeud);
    assert.equal(r.noeudSurLeContexteVivant, true,
      'et le nœud doit appartenir au contexte installé');
    assert.equal(r.erreurDeGraphe, null,
      'AUCUN bandeau d\'erreur de graphe ne doit apparaître : la construction dépassée doit se ' +
      'retirer proprement, non échouer. Affiché : ' + JSON.stringify(r.erreurDeGraphe));

    // LA PREUVE PAR LA PRISE : un graphe sain enregistre.
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1500);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    const prise = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { ech: e.echantillonsEcrits, mode: document.querySelector('[data-mode]').textContent };
    });
    await ctx.close();
    assert.ok(prise.ech > 0,
      'après l\'ordre défavorable forcé, la prise doit enregistrer : ' + prise.ech +
      ' échantillons, état « ' + prise.mode + ' »');
    assert.ok(!/muette/i.test(prise.mode), 'et ne pas être muette : ' + prise.mode);
    console.log('        ordre défavorable forcé (worklet lent 1,5 s puis rapide) · contexte du ' +
      'nœud ' + r.etatDuContexteDuNoeud + ' · prise ' + prise.ech + ' éch');
  });

  // ── §7 — LA REPRISE APRÈS FERMETURE (E5) ───────────────────────────────────────────────────
  // On ne simule pas la fermeture : on FERME la page au milieu d'une prise, puis on rouvre le
  // banc dans le même contexte (même IndexedDB) et on lit ce que la page propose.
  await controle('§7 fermeture en pleine prise : la reprise compte ce qui a SURVÉCU, relu', async () => {
    const ctx = await nav.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    await page.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page.click('[data-action="demarrer"]');
    // Laisser passer au moins deux morceaux de 2 s, puis fermer SANS arrêter la prise.
    await page.waitForFunction(() => window.EnregistreurVoix._etat().morceauxEcrits >= 2,
      null, { timeout: 20000 });
    const avant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { priseId: e.priseId, morceaux: e.morceauxEcrits, echantillons: e.echantillonsEcrits };
    });
    await page.close();   // la page meurt en pleine prise

    const page2 = await ctx.newPage();
    await page2.goto(base + '/banc-enregistreur.html');
    await page2.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });

    const propose = await page2.evaluate(async () => {
      const s = document.querySelector('[data-reprise] [data-reprise-prise]');
      if (!s) return null;
      const id = s.getAttribute('data-reprise-prise');
      // LE TÉMOIN, par un autre chemin que l'affichage : les morceaux réellement en base.
      const e = window.EnregistreurVoix._etat();
      let morceaux = 0, echantillons = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, id, (m) => {
        morceaux++; echantillons += m.pcm.byteLength / 2;
      });
      return { id, texte: s.querySelector('[data-reprise-detail]').textContent,
               enBase: { morceaux, echantillons } };
    });
    assert.ok(propose, 'la page doit PROPOSER la reprise ; rien n\'est affiché');
    assert.equal(propose.id, avant.priseId, 'la prise proposée doit être celle qui a été coupée');
    assert.ok(/relu dans IndexedDB/.test(propose.texte),
      'la proposition doit dire que le compte est relu, pas déduit : ' + propose.texte);
    // ON NE COMPARE PAS À UN NOMBRE FIGÉ RELEVÉ AVANT LA FERMETURE : un morceau de plus peut
    // être écrit entre la lecture du compteur et la mort de la page, et c'est le propre d'une
    // fermeture brutale. Le contrôle vérifie donc ce qui est VÉRIFIABLE : le nombre affiché est
    // exactement celui des morceaux présents en base, et au moins ceux qui étaient déjà écrits.
    assert.ok(propose.enBase.morceaux >= avant.morceaux,
      'la base doit contenir au moins les ' + avant.morceaux + ' morceaux déjà écrits, elle en a ' +
      propose.enBase.morceaux);
    assert.ok(new RegExp('\\b' + propose.enBase.morceaux + ' morceaux retrouvés').test(propose.texte),
      'la page affiche « ' + propose.texte + ' » pour ' + propose.enBase.morceaux +
      ' morceaux réellement en base');
    assert.ok(new RegExp('\\b' + propose.enBase.echantillons + ' échantillons').test(propose.texte),
      'et ' + propose.enBase.echantillons + ' échantillons dans « ' + propose.texte + ' »');

    await page2.click('[data-action="recuperer"]');
    await page2.waitForFunction(() => !document.querySelector('[data-reprise] [data-reprise-prise]'),
      null, { timeout: 10000 });
    const apres = await page2.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const prises = await window.VoixStockage.listerPrises(e.db);
      return prises.map((p) => ({ id: p.id, etat: p.etat, ech: p.nbEchantillons, nb: p.nbMorceaux }));
    });
    await ctx.close();

    const p = apres.find((x) => x.id === avant.priseId);
    assert.ok(p, 'la prise doit rester en base');
    assert.equal(p.etat, 'terminee', 'après récupération : ' + p.etat);
    assert.equal(p.nb, propose.enBase.morceaux, 'morceaux récupérés contre morceaux en base');
    assert.equal(p.ech, propose.enBase.echantillons,
      'échantillons récupérés contre échantillons en base — à l\'échantillon près');
    console.log('        coupée après ' + avant.morceaux + ' morceaux comptés ; ' +
                propose.enBase.morceaux + ' morceaux / ' + propose.enBase.echantillons +
                ' éch survivent en base ; récupérée à ' + p.nb + ' / ' + p.ech + ' — exact');
  });

  // ── §8 — LE CHEMIN QUI N'EMPRUNTE PAS L'INJECTION (régression #11(a)) ──────────────────────
  await controle('§8 le VRAI getUserMedia, sans la source de fixture : le chemin de Christophe', async () => {
    const { ctx, page, erreurs } = await ouvrirBanc(nav, base);  // aucun ?source=fixture
    const r = await prendre(page, { attendreMs: 3000 });
    await ctx.close();

    assert.ok(r.stockage.echantillons > 0, 'rien enregistré par le vrai chemin micro');
    assert.equal(r.stockage.prise.etat, 'terminee', 'état : ' + r.stockage.prise.etat);
    // Le micro factice de Chromium est à 44 100 Hz : rien ne doit supposer 48 000.
    assert.ok(r.module.echantillonnage > 8000, 'échantillonnage : ' + r.module.echantillonnage);
    assert.equal(r.stockage.prise.echantillonnage, r.module.echantillonnage);
    // Les morceaux suivent l'échantillonnage RÉEL (44 100 ici), pas 48 000 en dur — et ils
    // tombent sur un nombre entier de blocs, ce que 5 s à 44 100 Hz n'est pas.
    assert.equal(r.stockage.prise.echantillonsParMorceau % 128, 0,
      'la taille effective doit être un nombre entier de blocs');
    assert.equal(r.stockage.prise.echantillonsParMorceauDemandes, undefined,
      'la taille nominale n\'est plus écrite dans la prise');
    // (a) LA PRISE PORTE LA FRÉQUENCE RÉELLE, et le rapport dit si le lot 4 devra la changer.
    assert.equal(r.module.mesures.frequence.reelle_hz, r.module.echantillonnage,
      'le rapport doit porter la fréquence réelle');
    assert.equal(r.module.mesures.frequence.native, true,
      'la fréquence native est le choix mesuré du 10 octobre');
    assert.equal(r.module.mesures.frequence.aReechantillonnerAuLot4,
      r.module.echantillonnage !== 48000,
      'le rapport doit dire si le lot 4 devra rééchantillonner');
    // La piste réelle a bien été ouverte sans traitement du navigateur (E3).
    const ouverture = r.module.journal.find((x) => x.quoi === 'piste ouverte');
    assert.ok(ouverture, 'la piste doit être journalisée ; journal : ' +
      JSON.stringify(r.module.journal.map((x) => x.quoi)));
    assert.equal(ouverture.annulationEcho, false, 'echoCancellation doit être désactivée (E3)');
    assert.equal(ouverture.suppressionBruit, false, 'noiseSuppression doit être désactivée (E3)');
    assert.equal(ouverture.gainAutomatique, false, 'autoGainControl doit être désactivé (E3)');
    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('        micro réel (factice Chromium) à ' + r.module.echantillonnage +
      ' Hz · ' + r.stockage.morceaux + ' morceaux · ' + r.stockage.echantillons + ' éch · ' +
      'traitements navigateur désactivés');
  });

  // ── §20 — (e) LE PÉRIPHÉRIQUE ET LES LATENCES : MESURÉS, PAS DEVINÉS ──────────────────────
  await controle('§20 nom du micro, fréquence du contexte, latences — et « indisponible » quand ça l\'est', async () => {
    // Sur le VRAI chemin micro : la piste existe, donc le libellé et les latences existent.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await prendre(page, { attendreMs: 2500 });
    await ctx.close();
    const m = r.module.mesures.microphone;
    const l = r.module.mesures.latences;

    assert.ok(m && typeof m === 'object', 'le périphérique doit être au rapport : ' + JSON.stringify(m));
    assert.ok(typeof m.nom === 'string' && m.nom.length > 0, 'avec son nom : ' + m.nom);
    assert.ok(!/indisponible/.test(m.nom),
      'le libellé existe après autorisation : ' + m.nom);
    assert.equal(m.annulationEcho, false, 'et les traitements désactivés sont consignés (E3)');
    assert.equal(m.suppressionBruit, false);
    assert.equal(m.gainAutomatique, false);
    assert.equal(m.echantillonnageDeLaPiste, r.module.echantillonnage,
      'la fréquence de la PISTE, à côté de celle du contexte');

    assert.equal(r.module.mesures.contexteAudio.echantillonnage, r.module.echantillonnage,
      'la fréquence du contexte audio doit être au rapport');

    // LA LATENCE DE SORTIE EST LUE TARD, graphe en marche. Mesuré : elle vaut 0 avant qu'une
    // source ne soit connectée. Un zéro à cet endroit serait un faux chiffre.
    assert.ok(l && typeof l === 'object', 'les latences doivent être au rapport : ' + JSON.stringify(l));
    assert.ok(typeof l.sortie_s === 'number' || /absente/.test(String(l.sortie_s)),
      'la latence de sortie est un nombre, ou dit explicitement qu\'elle est absente de l\'API : '
      + JSON.stringify(l.sortie_s));
    if (typeof l.sortie_s === 'number') {
      assert.ok(l.sortie_s > 0 && l.sortie_s < 1,
        'lue graphe en marche, elle doit être non nulle et plausible : ' + l.sortie_s +
        ' s — un zéro signifie qu\'elle a été lue trop tôt');
    }
    assert.ok(typeof l.base_s === 'number' || /absente/.test(String(l.base_s)),
      'baseLatency : ' + JSON.stringify(l.base_s));
    assert.ok(/arrêt de la prise/.test(l.releveeQuand),
      'le rapport doit dire QUAND la mesure a été prise : ' + l.releveeQuand);
    assert.ok(l.regle && l.regle.length > 40, 'et nommer sa règle');

    // CE QUE LA PAGE AFFICHE.
    assert.ok(/Micro : /.test(r.affiche.sbMicro || ''),
      'la page doit afficher le micro : ' + r.affiche.sbMicro);
    assert.ok((r.affiche.sbMicro || '').includes(m.nom.slice(0, 12)),
      'et le même nom que le rapport : « ' + r.affiche.sbMicro + ' » contre « ' + m.nom + ' »');

    console.log('        micro « ' + m.nom + ' » · piste ' + m.echantillonnageDeLaPiste +
      ' Hz · contexte ' + r.module.mesures.contexteAudio.echantillonnage + ' Hz · entrée ' +
      m.latenceEntree_s + ' s · sortie ' + l.sortie_s + ' s · base ' +
      (typeof l.base_s === 'number' ? l.base_s.toFixed(6) : l.base_s) + ' s');
  });

  await controle('§20b sans piste réelle, le rapport dit « indisponible » au lieu d\'inventer', async () => {
    // Avec une source de fixture il n'y a PAS de piste : le rapport doit le dire, pas combler.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 2500 });
    await ctx.close();
    assert.ok(/indisponible/.test(String(r.module.mesures.microphone)),
      'sans piste, le périphérique doit être déclaré indisponible : ' +
      JSON.stringify(r.module.mesures.microphone));
    // Les latences, elles, viennent du CONTEXTE : elles existent même sans piste.
    const l = r.module.mesures.latences;
    assert.ok(l && typeof l === 'object', 'les latences du contexte existent sans piste : ' +
      JSON.stringify(l));
    assert.equal(l.entree_s, 'indisponible',
      'mais la latence d\'ENTRÉE vient de la piste : elle doit être déclarée indisponible');
    console.log('        sans piste : périphérique « indisponible », latence d\'entrée ' +
      '« indisponible », latences du contexte présentes');
  });

  // ── §9 — L'EXPORT WAV (E7), confronté à un générateur indépendant ──────────────────────────
  await controle('§9 l\'export WAV porte le nombre d\'échantillons RELU, et son en-tête est exact', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const pris = await prendre(page, { attendreMs: 5000, tailleMorceau: 2 });
    const exp = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const r = await window.VoixStockage.exporterWav(e.db, e.priseId);
      const ab = await r.blob.arrayBuffer();
      return {
        entete: [...new Uint8Array(ab.slice(0, 44))],
        octets: r.octets, nbEchantillons: r.nbEchantillons, nbMorceaux: r.nbMorceaux,
        echantillonnage: r.echantillonnage, duree_s: r.duree_s,
        echantillonsAnnonces: r.echantillonsAnnonces, trous: r.trousDIndex,
      };
    });
    await ctx.close();

    assert.deepEqual(exp.trous, [], 'aucun trou d\'index : ' + JSON.stringify(exp.trous));
    assert.equal(exp.nbEchantillons, pris.stockage.echantillons,
      'l\'export doit relire exactement ce que le stockage contient');
    assert.equal(exp.nbEchantillons, exp.echantillonsAnnonces,
      'ce que la prise annonce et ce qui est relu doivent s\'accorder : ' +
      exp.echantillonsAnnonces + ' contre ' + exp.nbEchantillons);
    assert.equal(exp.octets, 44 + exp.nbEchantillons * 2, 'poids = 44 + 2 octets par échantillon');

    const v = Buffer.from(exp.entete);
    assert.equal(v.toString('ascii', 0, 4), 'RIFF');
    assert.equal(v.toString('ascii', 8, 12), 'WAVE');
    assert.equal(v.toString('ascii', 36, 40), 'data');
    assert.equal(v.readUInt32LE(40), exp.nbEchantillons * 2,
      'le bloc data doit annoncer les octets RÉELLEMENT présents');
    assert.equal(v.readUInt32LE(4), 36 + exp.nbEchantillons * 2, 'taille RIFF');
    assert.equal(v.readUInt16LE(22), 1, 'mono');
    assert.equal(v.readUInt32LE(24), exp.echantillonnage);
    assert.equal(v.readUInt16LE(34), 16, '16 bits (E7)');

    // Le témoin, par un autre code : l'en-tête que produit le générateur de fixtures.
    const { ecrireWav, zeros } = require('./enregistreur-fixtures.cjs');
    const tmp = path.join(FIXTURES, '_temoin-export.wav');
    ecrireWav(tmp, [zeros(exp.nbEchantillons)], exp.echantillonnage);
    const temoin = [...fs.readFileSync(tmp).subarray(0, 44)];
    fs.unlinkSync(tmp);
    assert.deepEqual(exp.entete, temoin, 'en-tête du produit contre en-tête du témoin');

    // LE CAS OÙ « ANNONCÉ » ET « RELU » DIVERGENT, et c'est le cas qui compte : une prise coupée
    // net n'a pas eu le temps de se clore, donc elle annonce 0 échantillon alors que ses morceaux
    // sont là. Un en-tête bâti sur le nombre ANNONCÉ produirait un WAV de 44 octets utiles qui
    // s'ouvre sans erreur et ne contient rien. Tant que les deux valeurs sont d'accord, aucun
    // contrôle ne peut distinguer les deux formules — il faut donc les faire diverger exprès.
    const { ctx: c2, page: p2 } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const inachevee = await p2.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const id = 'prise-coupee-net';
      // Une prise « en-cours » qui annonce 0, avec deux morceaux réellement écrits : l'état exact
      // dans lequel une fermeture brutale laisse les choses.
      await window.VoixStockage.creerPrise(e.db, {
        id, nom: id, creeLe: new Date().toISOString(), echantillonnage: 48000,
        canaux: 2, canalRetenu: 'gauche', tailleMorceau_s: 2,
        echantillonsParMorceau: 96000, nbEchantillons: 0, nbMorceaux: 0, etat: 'en-cours',
      });
      for (let k = 0; k < 2; k++) {
        const a = new Int16Array(96000);
        for (let i = 0; i < a.length; i++) a[i] = ((i + k) % 1000) - 500;
        await window.VoixStockage.ecrireMorceau(e.db, id, k, k * 96000, a.buffer, false);
      }
      const r = await window.VoixStockage.exporterWav(e.db, id);
      const ab = await r.blob.arrayBuffer();
      return {
        annonces: r.echantillonsAnnonces, relus: r.nbEchantillons, octets: r.octets,
        tailleData: new DataView(ab).getUint32(40, true),
        tailleRiff: new DataView(ab).getUint32(4, true),
        octetsReels: ab.byteLength,
      };
    });
    await c2.close();
    assert.equal(inachevee.annonces, 0, 'la prise coupée doit bien annoncer 0 : ' + inachevee.annonces);
    assert.equal(inachevee.relus, 192000, 'et porter 192 000 échantillons relus');
    assert.equal(inachevee.tailleData, 192000 * 2,
      'le bloc data doit annoncer les ' + (192000 * 2) + ' octets RELUS, pas les 0 annoncés par ' +
      'la prise ; obtenu ' + inachevee.tailleData);
    assert.equal(inachevee.tailleRiff, 36 + 192000 * 2, 'et la taille RIFF doit suivre');
    assert.equal(inachevee.octetsReels, 44 + 192000 * 2,
      'le fichier doit vraiment peser ce que son en-tête annonce');
    console.log('        prise coupée net : annoncés ' + inachevee.annonces + ', relus ' +
      inachevee.relus + ' → en-tête à ' + inachevee.tailleData + ' octets de données');
    console.log('        WAV : ' + exp.nbEchantillons + ' éch · ' + exp.octets + ' o · ' +
      exp.echantillonnage + ' Hz · ' + exp.duree_s.toFixed(3) + ' s · en-tête identique au témoin');
  });

  // ── §10 — LE STOCKAGE À 5 ET 15 MINUTES, SANS AUDIO ────────────────────────────────────────
  // CE QUE CETTE MESURE MESURE, ET CE QU'ELLE NE MESURE PAS. Elle écrit les morceaux
  // DIRECTEMENT dans IndexedDB, sans micro ni worklet : elle mesure le stockage, le relecture,
  // l'export et les octets par minute. Elle NE mesure PAS la capture — jouer quinze minutes
  // prendrait quinze minutes, et c'est l'essai de Christophe, en temps réel, sur son Safari.
  await controle('§10 stockage à 5 et 15 minutes : octets, relecture, export, sans jamais tout tenir', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(async () => {
      const ECH = 48000;
      const out = [];
      for (const [minutes, taille] of [[5, 5], [15, 5], [15, 2]]) {
        const parMorceau = taille * ECH;
        const total = minutes * 60 * ECH;
        const nb = Math.ceil(total / parMorceau);
        const id = 'mesure-' + minutes + 'min-' + taille + 's';
        const t0 = performance.now();
        const e = window.EnregistreurVoix._etat();
        await window.VoixStockage.creerPrise(e.db, {
          id, nom: id, creeLe: new Date().toISOString(), echantillonnage: ECH,
          canaux: 2, canalRetenu: 'gauche', tailleMorceau_s: taille,
          echantillonsParMorceau: parMorceau, nbEchantillons: 0, nbMorceaux: 0, etat: 'en-cours',
        });
        // Un seul morceau en mémoire à la fois, jamais les 86 Mo.
        const bloc = new Int16Array(parMorceau);
        for (let i = 0; i < parMorceau; i++) bloc[i] = ((i * 2654435761) % 20000) - 10000;
        for (let k = 0; k < nb; k++) {
          const copie = bloc.slice();
          await window.VoixStockage.ecrireMorceau(e.db, id, k, k * parMorceau, copie.buffer, false);
        }
        const tEcrit = performance.now() - t0;
        await window.VoixStockage.majPrise(e.db, id,
          { etat: 'terminee', nbEchantillons: total, nbMorceaux: nb });

        const t1 = performance.now();
        let relus = 0, morceaux = 0;
        await window.VoixStockage.parcourirMorceaux(e.db, id, (m) => {
          morceaux++; relus += m.pcm.byteLength / 2;
        });
        const tRelu = performance.now() - t1;

        const t2 = performance.now();
        const exp = await window.VoixStockage.exporterWav(e.db, id);
        const tExport = performance.now() - t2;

        const q = await navigator.storage.estimate();
        out.push({
          minutes, tailleMorceau_s: taille, morceauxAttendus: nb, morceauxRelus: morceaux,
          echantillonsAttendus: total, echantillonsRelus: relus,
          octets: relus * 2, octetsParMinute: ECH * 2 * 60,
          msEcriture: Math.round(tEcrit), msRelecture: Math.round(tRelu),
          msExport: Math.round(tExport), octetsWav: exp.octets,
          quotaMo: Math.round(q.quota / 1048576), utiliseMo: +(q.usage / 1048576).toFixed(1),
        });
        await window.VoixStockage.supprimerPrise(e.db, id);
      }
      return out;
    });
    await ctx.close();

    for (const m of r) {
      assert.equal(m.morceauxRelus, m.morceauxAttendus,
        m.minutes + ' min / ' + m.tailleMorceau_s + ' s : morceaux');
      assert.equal(m.echantillonsRelus, m.echantillonsAttendus, 'échantillons');
      assert.equal(m.octetsWav, 44 + m.echantillonsAttendus * 2, 'poids du WAV');
      assert.equal(m.octetsParMinute, 5760000, '48000 × 2 × 60');
      console.log('        ' + m.minutes + ' min, morceaux de ' + m.tailleMorceau_s + ' s : ' +
        m.morceauxRelus + ' morceaux · ' + (m.octets / 1048576).toFixed(1) + ' Mo · écriture ' +
        m.msEcriture + ' ms · relecture ' + m.msRelecture + ' ms · export ' + m.msExport +
        ' ms · quota ' + m.quotaMo + ' Mo, utilisé ' + m.utiliseMo + ' Mo');
    }
    const c5 = r.find((x) => x.minutes === 15 && x.tailleMorceau_s === 5);
    const c2 = r.find((x) => x.minutes === 15 && x.tailleMorceau_s === 2);
    assert.equal(c5.morceauxAttendus, 180, '15 min en morceaux de 5 s');
    assert.equal(c2.morceauxAttendus, 450, '15 min en morceaux de 2 s');
    assert.equal(c5.octets, 86400000, '86,4 Mo pour 15 minutes');
    console.log('        COMPARAISON 5 s contre 2 s à 15 minutes : ' + c5.morceauxAttendus +
      ' transactions en ' + c5.msEcriture + ' ms contre ' + c2.morceauxAttendus + ' en ' +
      c2.msEcriture + ' ms — perte maximale sur coupure : 5 s contre 2 s');
  });

  // ── §11 — LA PERSISTANCE DEMANDÉE, ET SA RÉPONSE RAPPORTÉE ─────────────────────────────────
  await controle('§11 navigator.storage.persist() est demandé et sa réponse est AFFICHÉE', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => ({
      affiche: document.querySelector('[data-persistance]').textContent,
      etat: window.EnregistreurVoix._etat().persistance,
    }));
    await ctx.close();
    assert.ok(r.etat, 'la persistance doit être relevée');
    assert.equal(r.etat.disponible, true, 'API storage attendue dans Chromium');
    assert.notEqual(r.etat.accordee, null, 'la réponse ne doit jamais être null');
    // `persist()` rend un BOOLÉEN. Exiger seulement « pas null » laissait passer une version qui
    // ne demandait rien et écrivait « non demandée » : le texte était présent, la demande non.
    // Le type est la preuve que l'appel a réellement eu lieu.
    assert.equal(typeof r.etat.accordee, 'boolean',
      'navigator.storage.persist() rend un booléen ; obtenu ' + JSON.stringify(r.etat.accordee) +
      ' — une chaîne signifie que la demande n\'a pas été faite');
    assert.equal(typeof r.etat.persistantAvant, 'boolean',
      'persisted() rend un booléen ; obtenu ' + JSON.stringify(r.etat.persistantAvant));
    assert.ok(new RegExp('demandée → ' + r.etat.accordee).test(r.affiche),
      'la page doit afficher la réponse réelle (' + r.etat.accordee + ') : ' + r.affiche);
    assert.ok(/Persistance du stockage : demandée/.test(r.affiche),
      'la page doit AFFICHER la réponse : ' + r.affiche);
    assert.ok(/quota/.test(r.affiche) && /utilisé/.test(r.affiche), r.affiche);
    console.log('        ' + r.affiche);
  });

  // ── §12 — LE RAPPORT DE MESURES EXPORTABLE ─────────────────────────────────────────────────
  await controle('§12 le rapport JSON est complet et ne contient AUCUN null', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const pris = await prendre(page, { attendreMs: 2600 });
    const texte = await page.evaluate(() => JSON.stringify(
      window.EnregistreurVoix._etat().mesures, window.EnregistreurVoix.remplacerInfinis, 2));
    await ctx.close();

    const r = JSON.parse(texte);
    for (const cle of ['canalRetenu', 'raisonDuCanal', 'regleDuCanal', 'niveaux',
                       'correlationEntreCanaux', 'regleCorrelation', 'blocs', 'morceaux',
                       'etatDeLaPiste', 'journal', 'persistance', 'echantillonnage']) {
      assert.ok(r[cle] !== undefined && r[cle] !== null, 'champ manquant ou null : ' + cle);
    }
    // Niveau ET crête, par canal, chacun avec son amplitude à côté de son décibel.
    for (const c of ['gauche', 'droit']) {
      const n = r.niveaux[c];
      assert.ok(n, 'niveaux.' + c + ' absent');
      if (n.mesure) {
        for (const k of ['crete', 'creteDbfs', 'efficace', 'efficaceDbfs', 'etat', 'echantillonsAZero']) {
          assert.ok(n[k] !== undefined && n[k] !== null, 'niveaux.' + c + '.' + k);
        }
      } else {
        assert.ok(n.raison, 'un canal non mesuré doit porter sa raison');
      }
    }
    assert.equal(r.niveaux.droit.etat, 'vide', 'le canal droit de cette fixture est vide');
    // AUCUN null nulle part dans le document, à aucune profondeur.
    const nulls = [];
    (function balayer(o, chemin) {
      if (o === null) { nulls.push(chemin); return; }
      if (Array.isArray(o)) { o.forEach((x, i) => balayer(x, chemin + '[' + i + ']')); return; }
      if (o && typeof o === 'object') {
        Object.keys(o).forEach((k) => balayer(o[k], chemin + '.' + k));
      }
    })(r, '');
    assert.deepEqual(nulls, [], 'des null subsistent dans le rapport : ' + nulls.join(', '));
    assert.ok(Array.isArray(r.aJugerParChristophe) && r.aJugerParChristophe.length,
      'le rapport doit séparer ce qui est à juger');
    assert.ok(Array.isArray(r.nonVerifiable) && r.nonVerifiable.length,
      'et dire ce qui n\'est pas vérifiable sans micro réel');
    assert.ok(pris.module.mesures.etatDeLaPiste === 'sonore');
    console.log('        rapport : ' + Object.keys(r).length + ' champs, 0 null, ' +
      r.journal.length + ' entrées de journal en échantillons');
  });

  // ── §12b — LE NIVEAU AFFICHÉ EST LA MESURE, CONFRONTÉ À UN TÉMOIN CALCULÉ ICI ──────────────
  // Régression #11(e) : une interface qui montre ce que le code a DEMANDÉ à la place de ce qu'il
  // a REÇU est crédible et fausse. Le contrôle refait donc l'arithmétique LUI-MÊME, à partir des
  // sommes brutes du worklet, et exige que le chiffre de la page s'y accorde. Sans ça, un
  // vu-mètre figé à « −12 dB » passerait tous les autres contrôles.
  await controle('§12b le niveau affiché s\'accorde au décibel recalculé depuis les sommes brutes', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.dernierReleve && e.dernierReleve.releve && e.dernierReleve.releve.n > 1000;
    }, null, { timeout: 15000 });

    // Les deux relevés viennent du MÊME instant : le texte peint et les sommes qui l'ont peint.
    const vu = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return {
        texte: document.querySelector('[data-vu-niveau]').textContent,
        barre: document.querySelector('[data-vu-barre]').style.width,
        detail: document.querySelector('[data-vu-detail]').textContent,
        sommes: e.dernierReleve.releve,
        canal: e.canalRetenu || window.EnregistreurVoix.choisirCanal(e.sommesAnalyse, e.reglageCanal).canal,
      };
    });
    await ctx.close();

    // LE TÉMOIN, calculé ici, par un autre chemin que le module : √(Σx²/n) puis 20·log10.
    const g = vu.sommes;
    const sommeCarre = vu.canal === 'droit' ? g.sommeCarreD : g.sommeCarreG;
    const efficace = Math.sqrt(sommeCarre / g.n);
    const dbTemoin = 20 * Math.log10(efficace);
    const affiche = parseFloat(vu.texte.replace('−', '-').replace(' dB', ''));
    assert.ok(!Number.isNaN(affiche), 'le niveau affiché doit être un nombre : « ' + vu.texte + ' »');
    assert.ok(Math.abs(affiche - dbTemoin) < 0.2,
      'la page affiche ' + affiche + ' dB ; le témoin recalculé depuis les sommes brutes donne ' +
      dbTemoin.toFixed(3) + ' dB (efficace ' + efficace.toExponential(3) + ' sur ' + g.n +
      ' échantillons). Un chiffre affiché doit être la mesure, pas une cible.');
    // Et le détail doit porter la GRANDEUR dont le pourcentage découle (régression #11(j)).
    assert.ok(/amplitude/.test(vu.detail) && /barre/.test(vu.detail),
      'le détail doit porter l\'amplitude et le pourcentage : « ' + vu.detail + ' »');
    console.log('        affiché ' + affiche + ' dB · témoin ' + dbTemoin.toFixed(3) +
      ' dB · barre ' + vu.barre + ' · ' + g.n + ' échantillons');
  });

  // ── §13 — LA PAGE N'UTILISE QUE DES COMPOSANTS DE LOT ≤ 3 ──────────────────────────────────
  await controle('§13 aucun composant de lot > 3 dans l\'interface, et rien de grisé', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => ({
      lotsDeclares: [...new Set([...document.querySelectorAll('[data-lot]')]
        .map((e) => e.getAttribute('data-lot')))],
      // Des composants d'un lot ultérieur doivent être ABSENTS, pas désactivés.
      steps: document.querySelectorAll('.sc-bm-screen-steps').length,
      preview: document.querySelectorAll('.sc-bm-preview').length,
      band: document.querySelectorAll('.sc-bm-band').length,
      blocking: document.querySelectorAll('.sc-bm-blocking').length,
      timeline: document.querySelectorAll('.sc-bm-ruler, .sc-bm-playhead, .sc-bm-clip--voice').length,
      desactives: [...document.querySelectorAll('button, select, input')]
        .filter((e) => e.disabled || e.getAttribute('aria-disabled') === 'true')
        .map((e) => e.textContent.trim() || e.getAttribute('aria-label')),
      // Le CSS du kit est-il réellement chargé ?
      cssDuKit: [...document.styleSheets].some((s) => (s.href || '').includes('banc-montage.css')),
      policeAppliquee: getComputedStyle(document.body).fontFamily,
    }));
    await ctx.close();
    assert.equal(r.steps, 0, 'les étapes sont du lot 4 : absentes');
    assert.equal(r.preview, 0, 'l\'aperçu de présentation est du lot 4 : absent');
    assert.equal(r.band, 0, 'la bande rythmo est du jalon II : absente');
    assert.equal(r.blocking, 0, 'les avis bloquants sont du jalon III : absents');
    assert.equal(r.timeline, 0, 'la timeline est du lot 5 : absente');
    assert.deepEqual(r.desactives, [], 'rien ne doit être grisé : ' + JSON.stringify(r.desactives));
    const trop = r.lotsDeclares.filter((l) => l && Number(l) > 3);
    assert.deepEqual(trop, [], 'data-lot au-delà de 3 : ' + trop.join(','));
    assert.ok(r.cssDuKit, 'le CSS du kit doit être chargé');
    assert.ok(/Plex|Serif/i.test(r.policeAppliquee),
      'les polices du kit doivent s\'appliquer : ' + r.policeAppliquee);
    console.log('        data-lot présents : ' + r.lotsDeclares.join(', ') +
      ' · police « ' + r.policeAppliquee.slice(0, 40) + '… »');
  });

  // ── §14 — LA SORTIE QUAND LA PAGE SE MASQUE ────────────────────────────────────────────────
  await controle('§14 page masquée en pleine prise : le morceau PARTIEL est poussé', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '5');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page.click('[data-action="demarrer"]');
    // Moins d'un morceau de 5 s : sans la poussée, tout serait perdu.
    await page.waitForTimeout(1800);
    const avant = await page.evaluate(() => window.EnregistreurVoix._etat().morceauxEcrits);

    // On déclenche le VRAI événement, par la page, pas en appelant la fonction.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction((n) => window.EnregistreurVoix._etat().morceauxEcrits > n,
      avant, { timeout: 10000 });
    const r = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { morceaux: e.morceauxEcrits, echantillons: e.echantillonsEcrits,
               journal: e.journal.map((x) => x.quoi) };
    });
    await ctx.close();
    assert.equal(avant, 0, 'moins d\'un morceau plein devait avoir été écrit, il y en avait ' + avant);
    assert.ok(r.morceaux >= 1, 'le morceau partiel doit être écrit ; morceaux : ' + r.morceaux);
    assert.ok(r.echantillons > 0, 'et porter des échantillons : ' + r.echantillons);
    assert.ok(r.journal.includes('page masquée'), 'journal : ' + JSON.stringify(r.journal));
    assert.ok(r.journal.includes('morceau partiel poussé'), 'journal : ' + JSON.stringify(r.journal));
    console.log('        avant ' + avant + ' morceau, après masquage ' + r.morceaux + ' (' +
      r.echantillons + ' échantillons sauvés d\'un morceau de 5 s non plein)');
  });

  // ── §15 — UNE PRISE N'EST JAMAIS ÉCRASÉE (T9) ──────────────────────────────────────────────
  await controle('§15 deux prises de suite : la première survit intacte (T9)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const un = await prendre(page, { attendreMs: 2400, tailleMorceau: 2 });
    await page.fill('[data-nom-prise]', 'Deuxième prise');
    const deux = await prendre(page, { attendreMs: 2400, tailleMorceau: 2 });
    const liste = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const l = await window.VoixStockage.listerPrises(e.db);
      return l.map((p) => ({ id: p.id, nom: p.nom, ech: p.nbEchantillons, etat: p.etat }));
    });
    const affichees = await page.evaluate(() =>
      [...document.querySelectorAll('[data-prises] [data-prise]')].map((e) => e.getAttribute('data-prise')));
    await ctx.close();

    assert.notEqual(un.module.echantillonsEcrits, 0);
    assert.notEqual(deux.module.echantillonsEcrits, 0);
    assert.equal(liste.length, 2, 'les deux prises doivent coexister : ' + JSON.stringify(liste));
    const premiere = liste.find((p) => p.id === un.stockage.prise.id);
    assert.ok(premiere, 'la première prise doit survivre');
    assert.equal(premiere.ech, un.stockage.echantillons, 'intacte, à l\'échantillon près');
    assert.equal(affichees.length, 2, 'et les deux doivent être AFFICHÉES : ' + JSON.stringify(affichees));
    console.log('        deux prises : ' + liste.map((p) => p.nom + ' (' + p.ech + ' éch)').join(' · '));
  });

  await nav.close();
  srv.close();

  console.log('\n' + '─'.repeat(78));
  const total = reussis + echecs.length;
  if (echecs.length) {
    console.log('ÉCHEC — ' + reussis + '/' + total + ' contrôles passent.\n');
    echecs.forEach((e) => console.log('  · ' + e));
    console.log('\nEmpreintes des sources éprouvées :');
    [['enregistreur-voix.js', SOURCE_MODULE], ['voix-stockage.js', SOURCE_STOCKAGE],
     ['enregistreur-worklet.js', SOURCE_WORKLET]].forEach(([n, s]) =>
      console.log('  ' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 16) + '  ' + n));
    process.exit(1);
  }
  if (!total) {
    console.log('AUCUN contrôle ne correspond au filtre : ' + (FILTRE || []).join(','));
    process.exit(3);
  }
  console.log('PASS verify-enregistreur-capture — ' + reussis + '/' + total + ' contrôles' +
    (ignores ? ' (' + ignores + ' hors filtre)' : '') + '.');
  console.log('\nEmpreintes des sources éprouvées :');
  [['enregistreur-voix.js', SOURCE_MODULE], ['voix-stockage.js', SOURCE_STOCKAGE],
   ['enregistreur-worklet.js', SOURCE_WORKLET]].forEach(([n, s]) =>
    console.log('  ' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 16) + '  ' + n));
})().catch((e) => { console.error('\nLe contrôle s\'est interrompu : ' + e.stack); process.exit(1); });
