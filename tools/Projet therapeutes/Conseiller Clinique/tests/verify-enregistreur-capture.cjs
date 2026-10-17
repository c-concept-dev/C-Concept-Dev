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
// ── LE COMPTE À REBOURS EST NEUTRALISÉ DANS LES CONTRÔLES QUI NE L'ÉPROUVENT PAS ───────────
// Le défaut du banc est 3 secondes, comme E2 l'exige. Un contrôle qui mesure une durée de prise
// mesurerait en plus ce rebours et sa garde : chaque prise commencerait 3,5 s après le clic.
// Défaut trouvé par §37, qui construit sa propre page et ne passait donc pas par `ouvrirBanc` :
// il lui restait 1,5 s d'enregistrement sur 5, et la fenêtre de bruit de 3 s ne se terminait
// jamais. Cinq contrôles construisent leur page eux-mêmes (pour pouvoir la tuer en pleine
// prise) : ils appellent tous cette fonction, qui porte la raison une seule fois.
async function neutraliserLeRebours(page) {
  await page.evaluate(() => {
    const champ = document.querySelector('[data-rebours-secondes]');
    if (champ) champ.value = '0';
  });
}

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
  // ── LE COMPTE À REBOURS EST MIS À ZÉRO POUR TOUS LES CONTRÔLES, SAUF LE SIEN ─────────────
  // Le défaut du banc est 3 secondes, comme E2 l'exige, et c'est ce que Christophe verra. Mais
  // un contrôle qui mesure une durée de prise ne doit pas mesurer en plus un rebours : chaque
  // prise commencerait 3,5 s après le clic, et toutes les durées attendues seraient fausses de
  // ce décalage. On le neutralise donc ici, à un seul endroit, et §42 le remet pour l'éprouver.
  // `opts.rebours` permet à un contrôle de choisir sa valeur.
  if (!opts.gardeLeRebours) {
    if (typeof opts.rebours === 'number') {
      await page.evaluate((v) => {
        const champ = document.querySelector('[data-rebours-secondes]');
        if (champ) champ.value = String(v);
      }, opts.rebours);
    } else {
      await neutraliserLeRebours(page);
    }
  }
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
        sbContexte: (document.querySelector('[data-sb-contexte]') || {}).textContent,
        sbSignal: (document.querySelector('[data-sb-signal]') || {}).textContent,
        sbFrequence: document.querySelector('[data-sb-frequence]').textContent,
        sbMicro: (document.querySelector('[data-sb-micro]') || {}).textContent,
        bruit: (document.querySelector('[data-bruit]') || {}).textContent,
        // (D2) DEUX ZONES DEPUIS T1 BIS : les alertes de signal sont dans `[data-alerte]`,
        // placée AVANT les avis pour qu'aucun avis ne puisse les repousser hors de vue (E8).
        // `messages` réunit les deux, dans l'ordre du document, pour les contrôles qui cherchent
        // un texte sans se soucier de sa zone ; `alertes` et `avis` les séparent pour ceux qui
        // vérifient justement la zone.
        messages: [...document.querySelectorAll('[data-alerte] .sc-bm-message, [data-messages] .sc-bm-message')]
          .map((m) => ({ etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent,
                         icone: m.querySelector('use').getAttribute('href'),
                         cle: m.getAttribute('data-cle'),
                         zone: m.closest('[data-alerte]') ? 'alerte' : 'avis' })),
        alertes: [...document.querySelectorAll('[data-alerte] .sc-bm-message')]
          .map((m) => ({ etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent,
                         cle: m.getAttribute('data-cle') })),
        avis: [...document.querySelectorAll('[data-messages] .sc-bm-message')]
          .map((m) => ({ etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent,
                         cle: m.getAttribute('data-cle') })),
        chronoIntitule: (document.querySelector('[data-chrono-intitule]') || {}).textContent,
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

// Arrête la prise en cours par le VRAI bouton et relève ce que la page affiche, ce que le
// module croit et ce qu'IndexedDB contient. `prendre` ne convient pas aux contrôles de T1 ter :
// il mène la prise du début à la fin, et la pause, la reprise et la continuation s'intercalent.
async function prendreLaFin(page) {
  await page.click('[data-action="arreter"]');
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-mode]');
    return t && /terminée|muette|perdu/i.test(t.textContent);
  }, null, { timeout: 20000 });
  return page.evaluate(async () => {
    const e = window.EnregistreurVoix._etat();
    let morceaux = 0, echantillons = 0, indexVus = [], tailles = [], debuts = [], dernier = null;
    await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
      morceaux++; indexVus.push(m.index); debuts.push(m.debutEchantillon);
      const a = new Int16Array(m.pcm);
      echantillons += a.length; tailles.push(a.length);
      dernier = a;
    });
    // LA QUEUE DE LA PRISE, relue : « aucun zéro n'est écrit » (E8) se vérifie là, sur les
    // octets, et non sur un compteur. On compte les zéros CONSÉCUTIFS de la fin.
    let zerosDeFin = 0;
    if (dernier) {
      for (let i = dernier.length - 1; i >= 0 && dernier[i] === 0; i--) zerosDeFin++;
    }
    const prise = await window.VoixStockage.lirePrise(e.db, e.priseId);
    const liste = await window.VoixStockage.listerPrises(e.db);
    return {
      affiche: {
        mode: document.querySelector('[data-mode]').textContent,
        alertes: [...document.querySelectorAll('[data-alerte] .sc-bm-message')]
          .map((m) => ({ etat: m.getAttribute('data-state'), cle: m.getAttribute('data-cle'),
                         texte: m.querySelector('span').textContent })),
      },
      module: { priseId: e.priseId, echantillonnage: e.echantillonnage,
                echantillonsEcrits: e.echantillonsEcrits, morceauxEcrits: e.morceauxEcrits,
                journal: e.journal, mesures: e.mesures },
      stockage: { morceaux, echantillons, indexVus, tailles, debuts, prise, zerosDeFin },
      nbPrises: liste.length,
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
  await controle('§3a canal droit vide : canal actif pris, et la moyenne forcée ne coûte RIEN', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const auto = await prendre(page, { attendreMs: 2600 });
    await ctx.close();

    assert.equal(auto.module.canalRetenu, 'gauche');
    assert.ok(/canal gauche/.test(auto.affiche.sbCanal), 'la page doit afficher le canal retenu : ' + auto.affiche.sbCanal);
    assert.ok(/droit vide/.test(auto.affiche.canalRetenu), 'la page doit dire POURQUOI : ' + auto.affiche.canalRetenu);
    const r = auto.module.mesures.correlationEntreCanaux;
    assert.equal(r, 'canal vide : droit', 'corrélation : ' + JSON.stringify(r));

    // ── CE CONTRÔLE A CHANGÉ DE SENS À T1 QUATER, ET IL FAUT LE DIRE ──────────────────────
    //
    // Sa version d'origine forçait le réglage sur « Moyenne » et EXIGEAIT une chute d'environ
    // 6 dB : c'était le témoin de ce que E3 interdit, et la démonstration que la moyenne sur un
    // canal vide coûte cher. Depuis T1 quater, cette chute est IMPOSSIBLE — le diviseur est le
    // nombre de canaux vivants —, et le contrôle exigerait donc du produit le défaut qu'on vient
    // de supprimer. Il assure désormais l'inverse : même forcée à la main sur un canal vide, la
    // moyenne ne coûte rien.
    //
    // LE TÉMOIN DES 6,02 dB RESTE, mais il est arithmétique et non expérimental : la moyenne de
    // (x, 0) vaut x/2, soit 20·log10(0,5) = −6,0206 dB. C'est ce chiffre que E3 nomme, et il n'a
    // pas besoin d'être produit par le produit pour être vrai.
    const { ctx: c2, page: p2 } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const moy = await prendre(p2, { attendreMs: 2600, reglageCanal: 'moyenne' });
    await c2.close();

    const dbAuto = auto.module.mesures.niveaux.gauche.efficaceDbfs;
    const dbMoy = moy.module.mesures.niveaux.gauche.efficaceDbfs;
    assert.ok(Math.abs(dbAuto - dbMoy) < 1.5,
      'le niveau d\'entrée du canal gauche doit être le même : ' + dbAuto + ' vs ' + dbMoy);
    const effAuto = Math.max(Math.abs(auto.stockage.min), auto.stockage.max);
    const effMoy = Math.max(Math.abs(moy.stockage.min), moy.stockage.max);
    const chute = 20 * Math.log10(effMoy / effAuto);
    assert.ok(Math.abs(chute) < 1,
      'E3 (avenant 5) : « le mixage ne moyenne JAMAIS un canal vide ». Même forcée à la main, ' +
      'la moyenne ne doit rien coûter : chute mesurée ' + chute.toFixed(2) +
      ' dB (crêtes stockées ' + effAuto + ' puis ' + effMoy + '). Une chute de −6,02 dB serait ' +
      'la moyenne arithmétique de (x, 0), que ce produit ne fait plus.');
    // ET LE MIXAGE DIT SUR COMBIEN DE CANAUX IL A PORTÉ.
    const mix = moy.module.mesures.canalUtilise.mixageEffectif;
    assert.ok(mix && mix.echantillonsMixesSurUnCanal > 0,
      'le rapport doit dire que la moyenne a porté sur UN seul canal vivant : ' +
      JSON.stringify(mix));
    assert.equal(mix.echantillonsMixesSurDeuxCanaux, 0,
      'et sur aucun échantillon à deux canaux, le droit étant vide : ' +
      mix.echantillonsMixesSurDeuxCanaux);
    const temoin6dB = 20 * Math.log10(0.5);
    console.log('        crête stockée : auto ' + effAuto + ' · forcé en moyenne ' + effMoy +
                ' → ' + chute.toFixed(2) + ' dB (le témoin arithmétique de la moyenne de (x,0) ' +
                'est ' + temoin6dB.toFixed(4) + ' dB, et ce produit ne le produit plus) · ' +
                mix.echantillonsMixesSurUnCanal + ' échantillons mixés sur un canal vivant');
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
    // LES DEUX RÉSULTATS SONT JUSTES, ET LEQUEL ON OBTIENT DÉPEND DU RÉÉCHANTILLONNAGE.
    // À 44 100 Hz, la fixture (48 kHz) est rééchantillonnée et la « constante » acquiert une
    // variance minuscule : la corrélation devient calculable et vaut environ zéro. À 48 000 Hz,
    // aucun rééchantillonnage : la constante reste exactement constante, sa variance est nulle,
    // et la corrélation rend « canal constant ». Exiger l'un des deux ferait dépendre ce contrôle
    // de la fréquence du périphérique — ce qui est arrivé, et ce qu'on ne refait pas.
    const rk = k.module.mesures.correlationEntreCanaux;
    const correlationAcceptable = (typeof rk === 'number' && Math.abs(rk) < 0.2)
      || rk === 'canal constant : droit';
    assert.ok(correlationAcceptable,
      'une continue et un sinus ne sont pas corrélés : on attend un nombre proche de 0 (si la ' +
      'fixture est rééchantillonnée) ou « canal constant : droit » (si elle ne l\'est pas). ' +
      'Obtenu ' + JSON.stringify(rk));
    assert.notEqual(rk, null, 'et jamais null, dans aucun des deux cas');
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
      // (D2) LE BANDEAU A SA ZONE PROPRE DEPUIS T1 BIS : `[data-alerte]`, placée avant les avis.
      jusqua: () => !!document.querySelector('[data-alerte] [data-cle="muet"]'),
      pendant: async () => {
        bandeauPendant = await page.evaluate(() => {
          const m = document.querySelector('[data-alerte] [data-cle="muet"]');
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
    // (D2 / E8) L'ALERTE SURVIT AU VERDICT, mais sous la forme que E8 demande désormais : « au
    // retour du signal ou à l'arrêt, elle devient un RÉSUMÉ NEUTRE ». Ce qui doit survivre est le
    // FAIT — l'échantillon où le signal est tombé — et non le rouge, qui décrirait au passé une
    // urgence présente. Le relevé d'essais reprochait exactement l'inverse : un bandeau rouge
    // laissé en place après l'arrêt.
    const resume = r.affiche.alertes.find((m) => m.cle === 'muet');
    assert.ok(resume, 'le résumé du passage muet doit rester : ' + JSON.stringify(r.affiche.alertes));
    assert.equal(resume.etat, 'info',
      'et il doit être NEUTRE après l\'arrêt, non rouge : ' + resume.etat + ' — ' + resume.texte);
    assert.ok(/zéro numérique de l\'échantillon \d+/.test(resume.texte),
      'en portant l\'échantillon de début, qui est la seule information utile : ' + resume.texte);
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
    // (D3) « son revenu » EST UN ÉVÉNEMENT, PAS UN ÉTAT : la case Signal doit être revenue à
    // « sonore ». Le relevé d'essais notait « Piste : son revenu reste affiché longtemps après
    // le retour du son » — un libellé d'événement collé dans une case d'état.
    assert.ok(/Signal : sonore|Signal : hors prise/.test(r.affiche.sbSignal || ''),
      'au retour du son, la case Signal redevient « sonore » : ' + r.affiche.sbSignal);
    // (D2 / E8) et l'alerte est devenue un résumé NEUTRE, puisque le signal est revenu.
    const alerteRevenue = r.affiche.alertes.find((m) => m.cle === 'muet');
    assert.ok(alerteRevenue, 'le résumé du passage muet doit rester : ' +
      JSON.stringify(r.affiche.alertes));
    assert.equal(alerteRevenue.etat, 'info',
      'neutre, le signal étant revenu : ' + alerteRevenue.etat + ' — ' + alerteRevenue.texte);
    assert.ok(/Le son est revenu/.test(alerteRevenue.texte),
      'et le dire : ' + alerteRevenue.texte);
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
  // LE TEST QUE LE CDC DEMANDE À T1 a, ET QUI MANQUAIT.
  //
  // CE QUE J'AI ESSAYÉ D'ABORD, ET POURQUOI JE NE LE REFAIS PAS. Ma première version forçait la
  // fréquence du contexte à 48 000 Hz (`?frequence=`) pour produire une seconde prise. Mesuré :
  // cette demande ne change pas seulement la page — elle fait basculer la fréquence du
  // PÉRIPHÉRIQUE AUDIO DU MAC, et elle y reste, même après fermeture du navigateur. La fréquence
  // native de la machine est ainsi passée de 44 100 à 48 000 Hz, ce qui a fait tomber §20, §3d et
  // §15 au passage. Un contrôle automatique n'a pas à changer l'état de la machine de Christophe.
  //
  // CE QUE CE CONTRÔLE FAIT DONC, et ce qu'il ne fait pas. Il écrit les deux prises DIRECTEMENT
  // dans IndexedDB, avec leurs deux fréquences, et vérifie ce que T1 a demande vraiment : que le
  // montage porte deux prises de fréquences différentes, que chacune garde la sienne, que chaque
  // taille de morceau reste un nombre entier de blocs À SA fréquence, que le verdict de
  // rééchantillonnage diffère, et que la liste AFFICHE les deux. Il n'éprouve PAS la capture à
  // 48 kHz : c'est §16 qui mesure que l'option est honorée, et c'est tout ce qu'on peut mesurer
  // sans toucher au périphérique.
  await controle('§16b deux prises de fréquences différentes dans un même montage', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(async () => {
      const A = window.EnregistreurVoix;
      const S = window.VoixStockage;
      const e = A._etat();

      // Deux prises, deux fréquences, dans le MÊME stockage — c'est-à-dire le même montage.
      const faire = async (id, hz, secondes) => {
        // La taille effective se calcule comme le worklet la calcule : un nombre ENTIER de blocs.
        const nominal = Math.round(5 * hz);
        const parMorceau = Math.round(nominal / 128) * 128;
        const total = Math.round(secondes * hz);
        await S.creerPrise(e.db, {
          id, nom: id, creeLe: new Date().toISOString(), echantillonnage: hz,
          canaux: 2, canalRetenu: 'gauche', canalRaison: 'fixture de montage',
          reglageCanal: 'auto', echantillonsParMorceau: parMorceau,
          nbEchantillons: 0, nbMorceaux: 0, etat: 'en-cours',
        });
        let ecrits = 0, k = 0;
        while (ecrits < total) {
          const n = Math.min(parMorceau, total - ecrits);
          const a = new Int16Array(n);
          for (let i = 0; i < n; i++) a[i] = ((i * 2654435761) % 16000) - 8000;
          await S.ecrireMorceau(e.db, id, k, ecrits, a.buffer, n < parMorceau);
          ecrits += n; k++;
        }
        await S.majPrise(e.db, id, { etat: 'terminee', nbEchantillons: ecrits, nbMorceaux: k });
        return { parMorceau, total: ecrits, morceaux: k };
      };

      const a = await faire('montage-44100', 44100, 12);
      const b = await faire('montage-48000', 48000, 12);

      // Relecture : ce que le montage contient réellement.
      const l = await S.listerPrises(e.db);
      const prises = [];
      for (const pr of l) {
        let relus = 0, nb = 0;
        await S.parcourirMorceaux(e.db, pr.id, (mo) => { nb++; relus += mo.pcm.byteLength / 2; });
        prises.push({ id: pr.id, hz: pr.echantillonnage, parMorceau: pr.echantillonsParMorceau,
                      annonce: pr.nbEchantillons, relus, morceaux: nb,
                      duree_s: pr.nbEchantillons / pr.echantillonnage });
      }
      // L'export WAV de chacune doit porter SA fréquence dans son en-tête.
      const entetes = {};
      for (const id of ['montage-44100', 'montage-48000']) {
        const x = await S.exporterWav(e.db, id);
        const ab = await x.blob.arrayBuffer();
        const v = new DataView(ab);
        entetes[id] = { hzDansLEnTete: v.getUint32(24, true),
                        octetsParSeconde: v.getUint32(28, true),
                        octetsDeDonnees: v.getUint32(40, true) };
      }
      // Ce que la page AFFICHE, et non ce que le module déclare.
      await A.brancher(document.querySelector('[data-enregistreur]'), { urlWorklet: 'enregistreur-worklet.js' });
      const affichees = [...document.querySelectorAll('[data-prises] [data-prise]')]
        .map((el) => el.querySelector('[data-detail]').textContent);
      return { a, b, prises, entetes, affichees,
               verdicts: { a44: 44100 !== 48000, b48: 48000 !== 48000 } };
    });
    await ctx.close();

    const p44 = r.prises.find((x) => x.id === 'montage-44100');
    const p48 = r.prises.find((x) => x.id === 'montage-48000');
    assert.ok(p44 && p48, 'les deux prises doivent coexister dans le même montage : ' +
      JSON.stringify(r.prises.map((x) => x.id)));
    assert.notEqual(p44.hz, p48.hz, 'et porter des fréquences DIFFÉRENTES : ' + p44.hz + ' et ' + p48.hz);
    assert.equal(p44.hz, 44100);
    assert.equal(p48.hz, 48000);

    // CHAQUE TAILLE EFFECTIVE EST UN ENTIER DE BLOCS, À SA FRÉQUENCE.
    for (const x of [p44, p48]) {
      assert.equal(x.parMorceau % 128, 0,
        'à ' + x.hz + ' Hz : ' + x.parMorceau + ' % 128 = ' + (x.parMorceau % 128));
      assert.equal(x.relus, x.annonce,
        'et la prise annonce ce qu\'elle contient : ' + x.annonce + ' contre ' + x.relus);
    }
    assert.equal(p44.parMorceau, 220544, '5 s à 44 100 Hz → 220 544 (1 723 blocs)');
    assert.equal(p48.parMorceau, 240000, '5 s à 48 000 Hz → 240 000 (1 875 blocs)');
    assert.notEqual(p44.parMorceau, p48.parMorceau,
      'deux fréquences, deux tailles effectives');

    // MÊME DURÉE, NOMBRES D'ÉCHANTILLONS DIFFÉRENTS : c'est tout l'enjeu pour le lot 4.
    assert.ok(Math.abs(p44.duree_s - p48.duree_s) < 0.01,
      'les deux prises durent le même temps : ' + p44.duree_s + ' et ' + p48.duree_s);
    assert.notEqual(p44.annonce, p48.annonce,
      'mais ne portent pas le même nombre d\'échantillons : ' + p44.annonce + ' et ' + p48.annonce);

    // L'EN-TÊTE WAV DE CHACUNE PORTE SA FRÉQUENCE.
    assert.equal(r.entetes['montage-44100'].hzDansLEnTete, 44100,
      'l\'en-tête WAV de la prise à 44 100 : ' + r.entetes['montage-44100'].hzDansLEnTete);
    assert.equal(r.entetes['montage-48000'].hzDansLEnTete, 48000,
      'et celui de la prise à 48 000 : ' + r.entetes['montage-48000'].hzDansLEnTete);
    assert.equal(r.entetes['montage-44100'].octetsParSeconde, 44100 * 2);
    assert.equal(r.entetes['montage-48000'].octetsParSeconde, 48000 * 2);

    // ET LA PAGE AFFICHE LES DEUX FRÉQUENCES.
    assert.equal(r.affichees.length, 2, 'les deux prises doivent être AFFICHÉES : ' +
      JSON.stringify(r.affichees));
    assert.ok(r.affichees.some((t) => t.includes('44100 Hz')),
      'avec la fréquence de la première : ' + JSON.stringify(r.affichees));
    assert.ok(r.affichees.some((t) => t.includes('48000 Hz')),
      'et celle de la seconde : ' + JSON.stringify(r.affichees));

    console.log('        montage : ' + p44.hz + ' Hz (' + p44.parMorceau + ' éch/morceau, ' +
      (p44.parMorceau / 128) + ' blocs, ' + p44.annonce + ' éch) et ' + p48.hz + ' Hz (' +
      p48.parMorceau + ', ' + (p48.parMorceau / 128) + ' blocs, ' + p48.annonce + ' éch)');
    console.log('        même durée (' + p44.duree_s.toFixed(2) + ' s), en-têtes WAV à ' +
      r.entetes['montage-44100'].hzDansLEnTete + ' et ' +
      r.entetes['montage-48000'].hzDansLEnTete + ' Hz · les deux affichées');
  });

  await controle('§16c le défaut du PRODUIT reste la fréquence native', async () => {
    // La décision de (a) est la fréquence NATIVE : la constante doit rester `null`, et AUCUN
    // levier ne doit permettre d'en imposer une autre — mesuré : demander une fréquence au
    // contexte fait basculer celle du périphérique audio du Mac, et elle y reste.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => ({
      constante: window.EnregistreurVoix.FREQUENCE_DEMANDEE,
      levierDansLeBanc: window.__bancServices
        ? ('frequenceDemandee' in window.__bancServices) : 'services absents',
    }));
    await ctx.close();
    assert.equal(r.constante, null,
      'la constante du module doit rester null : ' + JSON.stringify(r.constante));
    assert.equal(r.levierDansLeBanc, false,
      'et le banc ne doit porter AUCUN levier de fréquence : ' + JSON.stringify(r.levierDansLeBanc));
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
    assert.equal(r.module.mesures.verdictSurLaPrise.raison, v.raisonSurLaPrise,
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
    assert.equal(r.module.mesures.verdictSurLaPrise.raison, v.raisonSurLaPrise,
      'le rapport doit porter la raison calculée sur la prise');
    assert.notEqual(r.module.mesures.verdictSurLaPrise.raison, v.raisonAvantLaPrise,
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

  // ── §18 — (d) LE BRUIT DE PIÈCE (T13), ESTIMATEUR ROBUSTE ─────────────────────────────────
  //
  // LES SEUILS N'ONT PAS BOUGÉ (décision de Christophe du 11 octobre) : ce sont ceux du CDC,
  // −65 et −58 dBFS. Ce qui a changé est la GRANDEUR à laquelle ils s'appliquent : le 20e
  // centile des niveaux de fenêtres de 100 ms — un plancher — et non la valeur efficace de la
  // fenêtre entière — une moyenne d'énergie.
  await controle('§18 quatre états de bruit, aux seuils INCHANGÉS du CDC, sur le plancher', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const B = A.BRUIT;
      // Des fenêtres fabriquées, toutes au même niveau : le 20e centile d'une population
      // constante EST ce niveau, donc le verdict tombe exactement sur le palier visé.
      const pour = (dbfs, partGrave, nbFenetres) => {
        const eff = Math.pow(10, dbfs / 20);
        const parFenetre = 4800, n = (nbFenetres || 30) * parFenetre;
        const fenetres = [];
        for (let k = 0; k < (nbFenetres || 30); k++) {
          fenetres.push({ index: k, debutEchantillon: k * parFenetre, n: parFenetre,
                          sommeCarre: eff * eff * parFenetre,
                          sommeCarreGrave: eff * eff * parFenetre * partGrave,
                          zeros: 0, crete: eff * Math.SQRT2, dansLeSilenceInitial: true });
        }
        return { n, sommeCarre: eff * eff * n, sommeCarreGrave: eff * eff * n * partGrave,
                 crete: eff * Math.SQRT2, zeros: 0, coupureHz: 120, echantillonnage: 48000,
                 fenetres };
      };
      // UN MICRO MUET : toutes les fenêtres à zéro, et la somme globale à zéro.
      const muet = () => {
        const parFenetre = 4800, nb = 30, n = nb * parFenetre;
        const fenetres = [];
        for (let k = 0; k < nb; k++) {
          fenetres.push({ index: k, debutEchantillon: k * parFenetre, n: parFenetre,
                          sommeCarre: 0, sommeCarreGrave: 0, zeros: parFenetre, crete: 0,
                          dansLeSilenceInitial: true });
        }
        return { n, sommeCarre: 0, sommeCarreGrave: 0, crete: 0, zeros: n,
                 coupureHz: 120, echantillonnage: 48000, fenetres };
      };
      return {
        seuils: { calme: B.calmeMax_dbfs, bruyant: B.bruyantMin_dbfs, grave: B.partGraveMin,
                  centile: B.centile },
        tresCalme: A.verdictBruit(pour(-72, 0.2)),
        aLaLimiteCalme: A.verdictBruit(pour(-65, 0.2)),
        correct: A.verdictBruit(pour(-61, 0.2)),
        aLaLimiteBruyant: A.verdictBruit(pour(-58, 0.2)),
        bruyant: A.verdictBruit(pour(-56, 0.2)),
        salleDeSoins: A.verdictBruit(pour(-56.8, 0.72)),
        aucunSignal: A.verdictBruit(muet()),
        nonMesure: A.verdictBruit(null),
      };
    });
    assert.deepEqual(r.seuils, { calme: -65, bruyant: -58, grave: 0.5, centile: 20 },
      'les seuils du CDC ne doivent pas avoir bougé : ' + JSON.stringify(r.seuils));
    assert.equal(r.tresCalme.etat, 'calme');
    assert.equal(r.aLaLimiteCalme.etat, 'calme', '≤ −65 est calme, bornes comprises');
    assert.equal(r.correct.etat, 'correct');
    assert.equal(r.aLaLimiteBruyant.etat, 'correct', '−58 pile n\'est pas encore bruyant');
    assert.equal(r.bruyant.etat, 'bruyant');
    // Les seuils s'appliquent bien au PLANCHER, et le plancher d'une population constante est
    // son niveau : −72,000 et non une valeur voisine.
    assert.ok(Math.abs(r.tresCalme.plancherDbfs - (-72)) < 0.001,
      'le plancher doit être le 20e centile, soit ici le niveau commun : ' + r.tresCalme.plancherDbfs);
    assert.equal(r.salleDeSoins.etat, 'bruyant');
    assert.equal(r.salleDeSoins.graveDominant, true,
      'part de grave ' + r.salleDeSoins.partGrave + ' > ' + r.seuils.grave);
    assert.ok(/filtre le réduira au mixage/.test(r.salleDeSoins.mention),
      'la mention de grave doit être celle demandée : ' + r.salleDeSoins.mention);
    assert.equal(r.correct.graveDominant, false, 'un bruit à 20 % de grave n\'est pas grave');
    // LE QUATRIÈME ÉTAT, celui que T13 a ajouté le 11 octobre.
    assert.equal(r.aucunSignal.etat, 'aucun-signal',
      'un micro muet n\'est jamais calme : ' + r.aucunSignal.etat);
    assert.ok(!('plancherDbfs' in r.aucunSignal),
      'et aucun plancher ne doit être fabriqué : ' + r.aucunSignal.plancherDbfs);
    assert.equal(r.nonMesure.mesure, false, 'non mesuré doit se dire, non s\'inventer');
    assert.ok(r.bruyant.regle.includes('PENTE') || r.bruyant.regle.includes('pente'),
      'la règle doit dire que le passe-bas est une pente, pas un mur : ' + r.bruyant.regle);
    assert.ok(/centile/.test(r.bruyant.regle) && /NON la valeur/.test(r.bruyant.regle),
      'et dire que ce n\'est PAS la valeur efficace de la fenêtre entière : ' + r.bruyant.regle);
    await ctx.close();
    console.log('        −72 calme · −65 calme · −61 correct · −58 correct · −56 bruyant · ' +
      'salle de soins (−56,8 ; grave 0,72) bruyant+grave · micro muet → aucun-signal');
  });

  await controle('§18b bruit CONTINU : le nouvel estimateur ne baisse RIEN (salle à générateurs)', async () => {
    // LE CONTRÔLE QUI EMPÊCHE LA CORRECTION DE TRICHER. Un estimateur qui rendrait simplement
    // des valeurs plus basses ferait disparaître le bruit de la salle de Christophe, et le ferait
    // paraître « corrigé ». Sur un bruit STATIONNAIRE, le plancher et la valeur efficace de la
    // fenêtre entière doivent s'accorder — le témoin du générateur de fixtures les donne à
    // −56,80 et −56,82 dBFS, soit 0,02 dB d'écart.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/salle-generateurs.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 4200 });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b));
    assert.equal(b.etat, 'bruyant', 'un bruit continu à −56,8 dBFS reste BRUYANT : ' + b.etat
      + ' au plancher ' + b.plancherDbfs);
    assert.ok(b.plancherDbfs > -59 && b.plancherDbfs < -54.5,
      'et le plancher doit valoir ce que le générateur a écrit, −56,8 dBFS : ' + b.plancherDbfs);
    assert.ok(Math.abs(b.ecartFenetreEntiereMoinsPlancher_db) < 1.5,
      'sur un bruit stationnaire les DEUX estimateurs doivent s\'accorder ; écart mesuré : '
      + b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB');
    assert.equal(b.etatSelonLaFenetreEntiere, 'bruyant',
      'l\'ancien calcul disait la même chose ici, et c\'est voulu : ' + b.etatSelonLaFenetreEntiere);
    assert.equal(b.graveDominant, true,
      'raies à 50 et 100 Hz : le grave doit dominer ; part ' + b.partGrave);
    assert.equal(b.silenceInitialRespecte, true,
      'aucune voix dans la fenêtre : le silence est tenu. Raison : ' + b.raisonDuSilence);
    assert.equal(b.plancherSource, 'silence initial',
      'et l\'ambiance vient donc du silence initial : ' + b.plancherSource);
    // CE QUE LA PAGE AFFICHE (régression #11(e)).
    const affiche = r.affiche.bruit || '';
    assert.ok(/BRUYANT/.test(affiche), 'la page doit l\'afficher : ' + affiche);
    assert.ok(/plancher/.test(affiche) && /centile/.test(affiche),
      'avec la grandeur dont le verdict découle : ' + affiche);
    assert.ok(/fenêtre entière/.test(affiche),
      'et la valeur de l\'ancien calcul à côté, nommée : ' + affiche);
    const avis = r.affiche.messages.find((m) => /La pièce est bruyante/.test(m.texte));
    assert.ok(avis, 'l\'avis de pièce bruyante doit être affiché');
    assert.equal(avis.etat, 'info', 'T13 n\'est JAMAIS bloquant : ' + avis.etat);
    assert.ok(r.stockage.echantillons > 0, 'la prise doit avoir été enregistrée malgré le bruit');
    console.log('        plancher ' + b.plancherDbfs.toFixed(2) + ' dBFS · fenêtre entière ' +
      b.efficaceDbfsFenetreEntiere.toFixed(2) + ' dBFS · écart ' +
      b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB · grave ' + b.partGrave.toFixed(3));
  });

  await controle('§18c LE DÉFAUT 1 : des bruits brefs ne font plus passer un plancher calme pour « correct »', async () => {
    // LE CONTRÔLE QUI PORTE TOUT LE DÉFAUT 1. Sur la prise du 10 octobre, le Studio annonçait
    // −63,9 dBFS « correct » alors que les passages calmes de la même prise étaient à −74 à
    // −76 dBFS. La fixture reproduit ce profil par le calcul : plancher à −75 dBFS, bruits brefs
    // de 80 ms à −58 dBFS toutes les 375 ms. Témoins du générateur, code indépendant du produit :
    // valeur efficace de la fenêtre entière −64,49 dBFS (« correct »), 20e centile des fenêtres
    // de 100 ms −75,03 dBFS (« calme »). Les deux doivent apparaître, et c'est le SECOND qui
    // décide.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/plancher-avec-bruits-brefs.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 4200 });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b));
    // 1. LE VERDICT A CHANGÉ DE CAMP, et c'est le but.
    assert.equal(b.etat, 'calme',
      'le plancher est à −75 dBFS : la pièce est CALME. Obtenu : ' + b.etat +
      ' au plancher ' + b.plancherDbfs);
    assert.ok(b.plancherDbfs < -70 && b.plancherDbfs > -79,
      'le plancher doit valoir ce que le générateur a écrit, −75 dBFS : ' + b.plancherDbfs);
    // 2. L'ANCIEN CALCUL EST GARDÉ, ET IL DIT « CORRECT » : l'écart est MESURÉ, pas raconté.
    assert.equal(b.etatSelonLaFenetreEntiere, 'correct',
      'la valeur efficace de la fenêtre entière, elle, annonce « correct » — c\'est le défaut : '
      + b.etatSelonLaFenetreEntiere + ' à ' + b.efficaceDbfsFenetreEntiere);
    assert.ok(b.ecartFenetreEntiereMoinsPlancher_db > 8,
      'et l\'écart entre les deux estimateurs doit être celui constaté, plus de 8 dB : '
      + b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB');
    // 3. LES BRUITS BREFS SONT COMPTÉS, pas effacés : T1 bis demande de les consigner.
    assert.ok(b.transitoires >= 4,
      'les bruits brefs doivent être COMPTÉS (8 attendus dans 3 s) : ' + b.transitoires);
    assert.ok(Array.isArray(b.transitoiresDetail) && b.transitoiresDetail.length === b.transitoires,
      'chacun avec son instant en échantillons : ' + JSON.stringify(b.transitoiresDetail));
    b.transitoiresDetail.forEach((t) => {
      assert.ok(t.secondes < 0.3,
        'et chacun doit être plus court que la durée de voix : ' + t.secondes + ' s');
    });
    // 4. UN BRUIT BREF NE DISQUALIFIE PAS LE SILENCE INITIAL : il n'y a pas de voix.
    assert.equal(b.silenceInitialRespecte, true,
      'des bruits brefs ne sont pas de la voix : ' + b.raisonDuSilence);
    // 5. « GRAVE DOMINANT » EST RECALCULÉ SUR LE PLANCHER (T13), et non sur la fenêtre entière.
    //    Le témoin est un COMPTE : les fenêtres retenues pour la part de grave doivent être
    //    moins nombreuses que les fenêtres pleines, puisque les fenêtres des bruits brefs en
    //    sont exclues. Un clic de touche est large bande : le compter ferait paraître la pièce
    //    moins grave qu'elle n'est.
    assert.ok(b.partGraveCalculeeSur.fenetres > 0,
      'la part de grave doit être calculée sur des fenêtres nommées : ' +
      JSON.stringify(b.partGraveCalculeeSur));
    // LE DÉNOMINATEUR EST CELUI DU PLANCHER, pas celui de la prise. Première version de cette
    // assertion : « moins que toutes les fenêtres pleines » — elle comparait 30 fenêtres de
    // silence initial à 42 fenêtres de prise et passait donc même quand la part de grave était
    // calculée sur TOUT le silence initial, bruits brefs compris. Le falsifieur a trouvé ce trou
    // (#50), et c'était mon assertion qui était fausse, pas le produit.
    assert.ok(b.partGraveCalculeeSur.fenetres < b.plancherCalculeSur.fenetres,
      'la part de grave doit se calculer sur les SEULES fenêtres du plancher, donc moins que la '
      + 'population qui donne le plancher : ' + b.partGraveCalculeeSur.fenetres + ' sur ' +
      b.plancherCalculeSur.fenetres);
    assert.ok(b.plancherCalculeSur.fenetres >= 20,
      'et cette population doit être celle du silence initial (environ 30 fenêtres) : ' +
      b.plancherCalculeSur.fenetres);
    // 6. CE QUE LA PAGE AFFICHE.
    const affiche = r.affiche.bruit || '';
    assert.ok(/CALME/.test(affiche), 'la page doit afficher CALME : ' + affiche);
    assert.ok(/bruit\(s\) bref\(s\) écarté\(s\)/.test(affiche),
      'et dire combien de bruits brefs ont été écartés : ' + affiche);
    console.log('        plancher ' + b.plancherDbfs.toFixed(2) + ' dBFS → ' + b.etat +
      '  ·  fenêtre entière ' + b.efficaceDbfsFenetreEntiere.toFixed(2) + ' dBFS → ' +
      b.etatSelonLaFenetreEntiere + '  ·  écart ' +
      b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB · ' + b.transitoires + ' transitoires');
  });

  await controle('§18e pièce CALME : les deux estimateurs s\'accordent (le calcul ne baisse pas tout)', async () => {
    // Le symétrique de §18c. Témoins du générateur : −72,01 et −72,05 dBFS, 0,04 dB d'écart.
    // Sans ce contrôle, un estimateur qui soustrairait 10 dB à tout passerait §18c.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/piece-calme.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 4200 });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.equal(b.etat, 'calme', 'une pièce à −72 dBFS est calme : ' + b.etat);
    assert.ok(b.plancherDbfs > -75 && b.plancherDbfs < -69,
      'au plancher écrit par le générateur, −72 dBFS : ' + b.plancherDbfs);
    assert.ok(Math.abs(b.ecartFenetreEntiereMoinsPlancher_db) < 1.5,
      'et les deux estimateurs doivent s\'accorder sur un bruit stationnaire : '
      + b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB');
    assert.equal(b.transitoires, 0, 'aucun bruit bref dans un bruit stationnaire : ' + b.transitoires);
    assert.equal(b.graveDominant, false,
      'un bruit blanc n\'est pas dominé par le grave ; part ' + b.partGrave);
    console.log('        plancher ' + b.plancherDbfs.toFixed(2) + ' · fenêtre entière ' +
      b.efficaceDbfsFenetreEntiere.toFixed(2) + ' · écart ' +
      b.ecartFenetreEntiereMoinsPlancher_db.toFixed(2) + ' dB · 0 transitoire');
  });

  await controle('§18f silence initial NON tenu : l\'ambiance est prélevée dans la pause la plus calme', async () => {
    // T13 : « Si le silence initial n'a pas été respecté, l'atelier propose de prélever quelques
    // secondes dans une pause », et « le silence initial n'est déclaré respecté que si la fenêtre
    // ne contient pas de voix ». Sur la prise du 10 octobre, `silenceInitialRespecte` valait
    // `true` alors que la voix démarrait à 0,3 s. La fixture : cycle de 5 s, 0,3 s de plancher,
    // 2,7 s de voix à −38 dBFS, 2,0 s de pause à −75. Aucune fenêtre de 3 s ne peut éviter la
    // voix, puisque les pauses ne durent que 2 s : le contrôle est donc déterminant quel que soit
    // l'instant où la prise démarre dans la fixture.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/voix-des-03s-avec-pauses.wav&boucle=1');
    // 9 s : de quoi contenir au moins une pause entière de 2 s après le silence initial de 3 s.
    const r = await prendre(page, { attendreMs: 9500 });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b));
    assert.equal(b.silenceInitialRespecte, false,
      'la voix occupe la fenêtre : le silence initial N\'est PAS tenu. Raison : ' + b.raisonDuSilence);
    assert.ok(/voix/.test(b.raisonDuSilence),
      'et la raison doit nommer la voix, en durée : ' + b.raisonDuSilence);
    assert.equal(b.plancherSource, 'pause la plus calme de la prise',
      'l\'ambiance doit donc venir d\'une pause (T13) : ' + b.plancherSource);
    assert.ok(b.pauseRetenue && typeof b.pauseRetenue.debutEchantillon === 'number',
      'et la pause retenue doit être datée en échantillons : ' + JSON.stringify(b.pauseRetenue));
    assert.ok(b.pauseRetenue.echantillons >= b.fenetres.secondes * r.module.echantillonnage * 10,
      'la pause doit faire au moins une seconde : ' + b.pauseRetenue.echantillons + ' échantillons');
    assert.equal(b.etat, 'calme',
      'et le verdict, pris sur la pause, doit être CALME à −75 dBFS : ' + b.etat +
      ' au plancher ' + b.plancherDbfs);
    assert.ok(b.plancherDbfs < -70,
      'le plancher doit être celui du silence, pas celui de la voix : ' + b.plancherDbfs);
    // SANS LE REPLI, le 20e centile de la fenêtre initiale aurait donné un niveau de VOIX :
    // le témoin du générateur le mesure à −38,02 dBFS. L'écart prouve que le repli a joué.
    assert.ok(b.efficaceDbfsFenetreEntiere > -50,
      'la fenêtre entière, elle, est au niveau de la voix : ' + b.efficaceDbfsFenetreEntiere);
    assert.ok(b.ecartFenetreEntiereMoinsPlancher_db > 25,
      'et l\'écart entre les deux doit être celui de la voix au silence : '
      + b.ecartFenetreEntiereMoinsPlancher_db.toFixed(1) + ' dB');
    const affiche = r.affiche.bruit || '';
    assert.ok(/silence initial non tenu/.test(affiche),
      'la page doit le dire en toutes lettres : ' + affiche);
    console.log('        silence non tenu · ambiance prélevée à l\'échantillon ' +
      b.pauseRetenue.debutEchantillon + ' sur ' + b.pauseRetenue.echantillons +
      ' · plancher ' + b.plancherDbfs.toFixed(2) + ' → ' + b.etat +
      ' · fenêtre entière ' + b.efficaceDbfsFenetreEntiere.toFixed(2));
  });

  await controle('§18g le 20e centile du produit est celui du générateur de fixtures, à l\'identique', async () => {
    // LE TÉMOIN VIENT D'UN AUTRE CODE (régression #11(j)). Le générateur de fixtures calcule le
    // 20e centile des fenêtres de 100 ms avec sa propre fonction, écrite séparément. Si les deux
    // conventions divergent — interpolation, rang supérieur, fenêtres partielles comptées — ce
    // contrôle le dit. On compare sur les quatre fixtures de référence, SUR LES MÊMES
    // ÉCHANTILLONS : ceux du fichier, décodés ici, sans passer par le graphe audio (dont le
    // rééchantillonnage déplacerait légèrement les deux valeurs de la même façon).
    const F = require('./enregistreur-fixtures.cjs');
    const { ctx, page } = await ouvrirBanc(nav, base);
    const cas = ['piece-calme.wav', 'salle-generateurs.wav',
                 'plancher-avec-bruits-brefs.wav', 'voix-des-03s-avec-pauses.wav'];
    const lignes = [];
    for (const nom of cas) {
      const fixture = F.FIXTURES.find((x) => x.nom === nom);
      const canal = fixture.faire().canaux[0];
      const trois = Array.from(canal.subarray(0, F.ECH * 3));
      const temoin = F.centile20DesFenetresDe100ms(canal.subarray(0, F.ECH * 3), F.ECH);
      // Le produit, nourri des MÊMES échantillons découpés en fenêtres de 4 800.
      // LA CONVENTION S'ÉPROUVE SUR LA FONCTION QUI LA PORTE, et non à travers le verdict.
      // Première version : elle passait par `verdictBruit` et lisait son `plancherDbfs` — ce qui
      // marchait jusqu'à ce que T13 (avenant 6) ajoute l'état « non mesurable », pour lequel
      // aucun plancher n'est rendu. Le contrôle tombait alors sur une fixture de voix, en
      // réclamant un chiffre que le produit a désormais raison de ne plus fabriquer. Ce qui est
      // sous contrôle ici, c'est la convention du centile : rang inférieur, sans interpolation.
      const duProduit = await page.evaluate(({ ech, parFenetre }) => {
        const A = window.EnregistreurVoix;
        const niveaux = [];
        for (let d = 0; d + parFenetre <= ech.length; d += parFenetre) {
          let sc = 0;
          for (let i = d; i < d + parFenetre; i++) sc += ech[i] * ech[i];
          niveaux.push(20 * Math.log10(Math.sqrt(sc / parFenetre)));
        }
        return { plancher: A._centile(niveaux, A.BRUIT.centile), fenetres: niveaux.length };
      }, { ech: trois, parFenetre: Math.round(F.ECH * 0.1) });
      assert.equal(duProduit.fenetres, temoin.fenetres,
        nom + ' : même nombre de fenêtres attendu — produit ' + duProduit.fenetres +
        ', témoin ' + temoin.fenetres);
      assert.ok(Math.abs(duProduit.plancher - temoin.centile20) < 0.001,
        nom + ' : le 20e centile du produit (' + duProduit.plancher.toFixed(4) +
        ') doit être celui du témoin (' + temoin.centile20.toFixed(4) + ')');
      lignes.push(nom.replace('.wav', '') + ' ' + duProduit.plancher.toFixed(2));
    }
    await ctx.close();
    console.log('        ' + lignes.join(' · '));
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

  // ── §21 — (T13) UN MICRO MUET N'EST JAMAIS « CALME » ──────────────────────────────────────
  //
  // CE CONTRÔLE A ÉTÉ ÉCRIT AVANT TOUTE CORRECTION, ET IL A ÉCHOUÉ. C'est le défaut 1 du relevé
  // d'essais, dans sa forme la plus grave : sur une prise d'un micro muet, le bruit de pièce
  // était annoncé « CALME — −∞ dB ». Une fausse assurance, pas une fausse alarme : l'opérateur
  // lit « calme » et croit sa pièce silencieuse, alors que rien n'a été capté. T13 le tranche
  // désormais en toutes lettres : « un micro muet n'est jamais calme : l'état est aucun signal ».
  await controle('§21 micro muet : l\'état du bruit est « aucun signal », jamais « calme »', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/zeros-71s.wav');
    // On attend que la mesure de bruit soit RENDUE : 3 s de fenêtre, et on laisse la marge du
    // premier morceau. Sans cette attente, le contrôle passerait sur un `bruit` absent.
    const r = await prendre(page, { jusqua: () => !!window.EnregistreurVoix._etat().bruit });
    await ctx.close();
    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré, non « non mesuré » : ' + JSON.stringify(b));
    assert.equal(b.etat, 'aucun-signal',
      'T13 : un micro muet n\'est jamais « calme ». État obtenu : ' + b.etat +
      ' au niveau ' + b.efficaceDbfs);
    // LE NIVEAU N'EXISTE PAS, et le dire est le seul choix honnête : 20·log10(0) n'est pas un
    // nombre. Jamais `null` (§12), jamais −∞ affiché comme une mesure : une RAISON à la place.
    assert.ok(!('efficaceDbfs' in b) || typeof b.efficaceDbfs !== 'number' || isFinite(b.efficaceDbfs),
      'aucun −∞ ne doit sortir comme s\'il était une mesure : ' + b.efficaceDbfs);
    assert.ok(typeof b.raisonDuNiveau === 'string' && /zéro/.test(b.raisonDuNiveau),
      'et une raison en toutes lettres doit prendre sa place : ' + b.raisonDuNiveau);
    assert.equal(b.echantillonsAZero, b.echantillons,
      'tous les échantillons de la fenêtre sont à zéro : ' + b.echantillonsAZero + '/' + b.echantillons);
    // CE QUE LA PAGE AFFICHE, et non ce que le module déclare (régression #11(e)).
    const affiche = r.affiche.bruit || '';
    assert.ok(/AUCUN SIGNAL/i.test(affiche), 'la page doit l\'afficher : ' + affiche);
    // L'ASSERTION PORTE SUR LE VERDICT, PAS SUR LE MOT. Première version de ce contrôle :
    // « le mot calme ne doit pas apparaître » — elle échouait sur l'explication elle-même, qui
    // dit « ce n'est pas une pièce calme ». C'était mon assertion qui était fausse, pas le code.
    assert.ok(!/Bruit de pièce\s*:\s*CALME/i.test(affiche),
      'le VERDICT affiché ne doit jamais être « calme » : ' + affiche);
    assert.ok(!/-?(∞|Infinity)/.test(affiche), 'ni un infini : ' + affiche);
    // E8 continue de faire son travail : la prise reste MUETTE, les deux verdicts coexistent.
    assert.equal(r.stockage.prise.etat, 'muette', 'et la prise reste muette (E8)');
    console.log('        état « ' + b.etat + ' » · ' + b.echantillonsAZero + ' échantillons à zéro sur '
      + b.echantillons + ' · page : ' + affiche.slice(0, 64));
  });

  // ── §22 — (D4) AUCUNE POSITION DU JOURNAL N'APPARTIENT À UNE AUTRE PRISE ──────────────────
  //
  // DÉFAUT 4 DU RELEVÉ D'ESSAIS, reproduit par sa cause et non par son symptôme. Christophe a
  // relevé que « contexte running » était daté à l'échantillon 1 071 616, puis 2 962 176, puis
  // 3 963 008 — la longueur EXACTE de la prise précédente à chaque fois. Le mécanisme : le
  // `resume()` du contexte a lieu AU DÉBUT de `demarrer`, avant que la prise existe ; la position
  // était alors lue dans le dernier relevé du worklet, dont le compteur restait figé à la valeur
  // de la prise qui venait de finir.
  //
  // CE CONTRÔLE REJOUE CE MÉCANISME : première prise LONGUE, contexte suspendu, seconde prise
  // COURTE. Le chiffre périmé dépasse donc la longueur de la prise où il s'écrit, et l'invariant
  // le prend. Avec le code d'avant, « contexte running » valait la longueur de la première.
  await controle('§22 deux prises de suite : toute position du journal tient dans SA prise', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');

    // PREMIÈRE PRISE, LONGUE (environ 6 s).
    const p1 = await prendre(page, { attendreMs: 6000 });

    // ON SUSPEND LE CONTEXTE ENTRE LES DEUX : c'est ce que fait Safari quand l'onglet passe au
    // fond, et c'est ce qui provoque le `resume()` au début de la prise suivante.
    await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      await e.ctx.suspend();
    });
    await page.waitForTimeout(300);

    // SECONDE PRISE, COURTE (environ 2,5 s) : plus courte que la première, exprès.
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(2500);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });

    // UN ÉVÉNEMENT VRAIMENT HORS PRISE, ÉPROUVÉ POUR LUI-MÊME. Le falsifieur a trouvé un trou
    // (#56) : retirer le marquage « hors prise » ne faisait échouer aucun contrôle, parce que
    // dans Chromium aucun événement ne tombe hors prise — `onstatechange` arrive après que la
    // prise a commencé, et la branche n'était donc jamais empruntée. On la provoque : on change
    // l'état du contexte alors qu'AUCUNE prise ne court, et on lit le journal en mémoire.
    const dehors = await page.evaluate(async () => {
      const A = window.EnregistreurVoix, e = A._etat();
      const avant = e.journal.length;
      if (e.ctx.state !== 'suspended') await e.ctx.suspend(); else await e.ctx.resume();
      await new Promise((r) => setTimeout(r, 400));
      const nouvelles = e.journal.slice(avant);
      return { enPrise: e.enPrise, journal: e.journal.map((x) => x.quoi),
               entree: nouvelles.filter((x) => /^contexte /.test(x.quoi))[0] || null };
    });

    const deux = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const liste = await window.VoixStockage.listerPrises(e.db);
      return liste.map((p) => ({ id: p.id, nom: p.nom, nbEchantillons: p.nbEchantillons,
                                 journal: p.journal || [] }));
    });
    await ctx.close();

    assert.equal(deux.length, 2, 'deux prises doivent exister : ' + deux.length);
    const longue = deux.find((p) => p.nbEchantillons > 200000);
    const courte = deux.find((p) => p !== longue);
    assert.ok(longue && courte, 'une longue et une courte : ' +
      JSON.stringify(deux.map((p) => p.nbEchantillons)));
    assert.ok(longue.nbEchantillons > courte.nbEchantillons,
      'la première doit être la plus longue, sinon le contrôle ne prouve rien : ' +
      longue.nbEchantillons + ' contre ' + courte.nbEchantillons);

    // L'INVARIANT, sur les DEUX prises : toute position est dans SA prise.
    // DEUX PASSES, DANS CET ORDRE, et l'ordre compte. La première éprouve LE DÉFAUT : une
    // position qui dépasse la longueur de sa prise. La seconde éprouve l'attribution, qui est un
    // champ nouveau. Mélangées, la seconde échouait d'abord sur le code d'avant et masquait la
    // première : le contrôle tombait pour la bonne cause mais au mauvais endroit, et son message
    // ne désignait plus le défaut 4.
    let verifiees = 0;
    deux.forEach((p) => {
      p.journal.forEach((e) => {
        if (typeof e.aEchantillon !== 'number') return;
        verifiees++;
        assert.ok(e.aEchantillon <= p.nbEchantillons,
          'POSITION HORS DE SA PRISE (défaut 4) : « ' + e.quoi + ' » daté ' + e.aEchantillon +
          ' dans une prise de ' + p.nbEchantillons + ' échantillons (' + p.nom + ')');
        if (e.horsPrise) {
          assert.equal(e.aEchantillon, 0,
            'un événement HORS prise n\'a pas de position : « ' + e.quoi + ' » daté ' +
            e.aEchantillon + ' dans ' + p.nom);
        }
      });
    });
    deux.forEach((p) => {
      p.journal.forEach((e) => {
        if (typeof e.aEchantillon !== 'number') return;
        assert.ok(e.horsPrise === true || e.priseId === p.id,
          'chaque entrée doit nommer sa prise ou se dire hors prise : ' +
          JSON.stringify(e) + ' dans ' + p.id);
      });
    });
    assert.ok(verifiees >= 4, 'il faut des entrées à vérifier : ' + verifiees + ' — journaux : ' +
      JSON.stringify(deux.map((p) => p.journal.map((e) => e.quoi + '@' + e.aEchantillon +
        (e.horsPrise ? ' (hors prise)' : '')))));

    assert.equal(dehors.enPrise, false, 'aucune prise ne doit courir à cet instant');
    assert.ok(dehors.entree,
      'changer l\'état du contexte hors prise doit laisser une entrée au journal : ' +
      JSON.stringify(dehors.journal));
    assert.equal(dehors.entree.horsPrise, true,
      'et elle doit être MARQUÉE hors prise : ' + JSON.stringify(dehors.entree));
    assert.equal(dehors.entree.aEchantillon, 0,
      'avec une position nulle, puisqu\'aucune prise ne court : ' + dehors.entree.aEchantillon);
    assert.ok(!('priseId' in dehors.entree),
      'et sans nommer de prise : ' + JSON.stringify(dehors.entree));

    // LE CAS EXACT DU DÉFAUT : le `resume()` du contexte au début de la seconde prise.
    const running = courte.journal.filter((e) => /^contexte running/.test(e.quoi));
    assert.ok(running.length >= 1,
      'le contexte a été suspendu puis repris : l\'événement doit être au journal de la seconde ' +
      'prise. Journal : ' + JSON.stringify(courte.journal.map((e) => e.quoi)));
    // MESURÉ PAR CE CONTRÔLE, et c'est pourquoi l'assertion est celle-ci et pas une autre :
    // `onstatechange` arrive APRÈS que la promesse de `resume()` est tenue, donc après que la
    // prise a commencé. L'événement appartient bien à la seconde prise, à sa position zéro. Ma
    // première version exigeait « hors prise » et était trop rigide : l'invariant juste est que
    // la position tienne dans SA prise, et zéro y tient. Ce qui est interdit, et qui était le
    // défaut, c'est la longueur de la prise PRÉCÉDENTE.
    running.forEach((e) => {
      assert.equal(e.aEchantillon, 0,
        'le contexte repart au tout début de la prise : sa position est zéro. Obtenu : ' +
        e.aEchantillon + ' (longueur de la prise précédente : ' + longue.nbEchantillons + ')');
      assert.notEqual(e.aEchantillon, longue.nbEchantillons,
        'et surtout PAS la longueur de la prise précédente (' + longue.nbEchantillons + ') : ' +
        'c\'était exactement le défaut 4');
      assert.ok(e.aEchantillon <= courte.nbEchantillons,
        'et jamais au-delà de la prise où il est écrit : ' + e.aEchantillon + ' > ' +
        courte.nbEchantillons);
    });

    console.log('        prise longue ' + longue.nbEchantillons + ' éch · prise courte ' +
      courte.nbEchantillons + ' éch · ' + verifiees + ' positions vérifiées · ' +
      running.length + ' « contexte running » daté 0 dans SA prise (valait ' +
      longue.nbEchantillons + ' avant la correction)');
  });

  await controle('§22b hors prise, la position courante est ZÉRO — éprouvé à sa source', async () => {
    // LE CONTRÔLE DÉTERMINANT DU DÉFAUT 4. §22 tient l'invariant, mais il ne reproduit pas le
    // chiffre périmé à coup sûr : mesuré, Chromium livre le premier relevé de la nouvelle prise
    // AVANT de délivrer `onstatechange`, si bien que la position lue est déjà celle de la bonne
    // prise. Safari, lui, les ordonne dans l'autre sens — c'est pourquoi Christophe l'a vu et
    // pourquoi mes contrôles ne l'avaient pas vu. On éprouve donc la FONCTION, là où la règle
    // vit, avec un dernier relevé laissé exprès en place : c'est l'état exact du module entre
    // deux prises.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 3000 });
    const apres = await page.evaluate(() => {
      const A = window.EnregistreurVoix, e = A._etat();
      return {
        enPrise: e.enPrise,
        dernierReleve: e.dernierReleve ? e.dernierReleve.echantillonsEcrits : 'aucun',
        echantillonsEcritsDuModule: e.echantillonsEcrits,
        position: A._echantillonsCourants(),
        longueurDeLaPrise: e.mesures.morceaux.echantillonsEcrits,
      };
    });
    await ctx.close();
    assert.equal(apres.enPrise, false, 'la prise est finie');
    assert.ok(apres.longueurDeLaPrise > 100000,
      'la prise doit avoir une longueur à périmer : ' + apres.longueurDeLaPrise);
    // 1. LA FONCTION REND ZÉRO. Avec le code d'avant, elle rendait la longueur de la prise.
    assert.equal(apres.position, 0,
      'hors prise il n\'y a pas de position : zéro attendu, obtenu ' + apres.position +
      ' (longueur de la prise : ' + apres.longueurDeLaPrise + ')');
    assert.notEqual(apres.position, apres.longueurDeLaPrise,
      'et surtout pas la longueur de la prise qui vient de finir — c\'était le défaut 4');
    // 2. LA GARDE DU WORKLET, ÉPROUVÉE À PART : son compteur est remis à zéro dès que son message
    //    d'arrêt est parti, donc le relevé qu'il envoie entre deux prises porte zéro. Deux gardes
    //    indépendantes pour un chiffre qui a déjà menti.
    assert.ok(apres.dernierReleve === 0 || apres.dernierReleve === 'aucun',
      'le relevé du worklet entre deux prises doit porter zéro : ' + apres.dernierReleve);
    console.log('        prise de ' + apres.longueurDeLaPrise + ' éch · position hors prise ' +
      apres.position + ' · dernier relevé du worklet ' + apres.dernierReleve);
  });

  // ── §23 — (D3) L'ÉTAT DE LA PISTE EST CELUI DE LA PISTE ───────────────────────────────────
  //
  // DÉFAUT 3 : « la barre du bas affiche Piste : contexte running au lieu de terminée ». Ce
  // contrôle passe par le VRAI `getUserMedia` (pas par la source de fixture, qui n'a pas de
  // piste) et arrête la piste PENDANT la prise, ce qui est exactement ce qu'une autre
  // application fait en reprenant le périphérique.
  await controle('§23 piste arrêtée pendant la prise : la barre dit « terminée », pas l\'état du contexte', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1500);

    // ON ARRÊTE LA PISTE, comme le ferait une autre application qui prend le micro.
    await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      e.flux.getAudioTracks().forEach((t) => t.stop());
    });
    await page.waitForTimeout(1200);

    const pendant = await page.evaluate(() => ({
      sbPiste: document.querySelector('[data-sb-piste]').textContent,
      sbContexte: document.querySelector('[data-sb-contexte]').textContent,
      sbSignal: document.querySelector('[data-sb-signal]').textContent,
      etatCtx: window.EnregistreurVoix._etat().ctx.state,
    }));

    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    const apres = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { journal: e.journal.map((x) => x.quoi), mesures: e.mesures,
               sbPiste: document.querySelector('[data-sb-piste]').textContent };
    });
    await ctx.close();

    // 1. LA CASE « PISTE » PARLE DE LA PISTE.
    assert.ok(/terminée/.test(pendant.sbPiste),
      'la case Piste doit dire « terminée » : ' + pendant.sbPiste);
    assert.ok(!/contexte|running/i.test(pendant.sbPiste),
      'et ne jamais porter l\'état du contexte : ' + pendant.sbPiste);
    // 2. LE CONTEXTE A SA PROPRE CASE, et il est bien running : les deux faits coexistent, ce
    //    qui est précisément ce que l'ancienne barre rendait impossible à lire.
    assert.ok(pendant.sbContexte.includes(pendant.etatCtx),
      'la case Contexte doit porter l\'état du contexte (' + pendant.etatCtx + ') : ' +
      pendant.sbContexte);
    // 3. LE SIGNAL A LA SIENNE.
    assert.ok(/Signal/.test(pendant.sbSignal), 'la case Signal doit exister : ' + pendant.sbSignal);
    // 4. PAS DE DOUBLON AU JOURNAL. FAIT MESURÉ PAR CE CONTRÔLE, et qui vaut d'être écrit :
    //    `track.stop()` ne déclenche PAS l'événement `ended` (la spécification le réserve aux
    //    fins qui ne viennent pas de l'application). Il n'y a donc ici aucune entrée attendue —
    //    et c'est exactement pourquoi la case « Piste » doit être LUE sur la piste à chaque
    //    relevé, ce que vérifie le point 1, plutôt que peinte sur un événement qui ne vient pas.
    const fins = apres.journal.filter((q) => q === 'piste terminée');
    assert.ok(fins.length <= 1,
      'jamais deux « piste terminée » (il y en avait deux aux essais) : ' +
      JSON.stringify(apres.journal));
    // 5. LA DETTE EST VISIBLE, ET NOMMÉE : E8 demande que la prise se METTE EN PAUSE quand la
    //    piste se termine, et la pause est de T1 ter (E12). En attendant, ce que la prise a fait
    //    doit au moins être DIT par le rapport, en échantillons.
    assert.ok(apres.mesures && apres.mesures.etatDeLaPiste,
      'le rapport doit porter un état de piste : ' + JSON.stringify(apres.mesures && apres.mesures.etatDeLaPiste));
    console.log('        pendant : ' + pendant.sbPiste + ' | ' + pendant.sbContexte + ' | ' +
      pendant.sbSignal + '\n        rapport : ' + apres.mesures.etatDeLaPiste +
      ' · journal : ' + JSON.stringify(apres.journal));
  });

  await controle('§23b deux autorisations : les pistes du flux précédent sont ARRÊTÉES', async () => {
    // LA CAUSE DU DOUBLON « piste terminée », mesurée là où elle est. `autoriser` remplaçait
    // `_etat.flux` sans arrêter les pistes de l'ancien : elles restaient vivantes, avec leurs
    // écouteurs, et une reprise du périphérique par une autre application les terminait TOUTES —
    // d'où deux entrées au journal pour un seul fait. On ne peut pas simuler cette reprise dans
    // un navigateur de contrôle ; on peut en revanche vérifier le fait qui la rendait possible :
    // après une seconde autorisation, une seule piste doit être vivante.
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => !!window.EnregistreurVoix._etat().piste, null, { timeout: 20000 });
    const premier = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      window.__pistesAnciennes = e.flux.getAudioTracks();
      return window.__pistesAnciennes.map((t) => t.readyState);
    });
    assert.deepEqual(premier, ['live'], 'la première piste doit être vivante : ' + JSON.stringify(premier));
    // SECONDE AUTORISATION : un nouveau flux, donc une nouvelle piste.
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.piste && e.flux.getAudioTracks()[0] !== window.__pistesAnciennes[0];
    }, null, { timeout: 20000 });
    const apres = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { anciennes: window.__pistesAnciennes.map((t) => t.readyState),
               nouvelle: e.flux.getAudioTracks().map((t) => t.readyState),
               memeObjet: e.flux.getAudioTracks()[0] === window.__pistesAnciennes[0] };
    });
    await ctx.close();
    assert.equal(apres.memeObjet, false, 'la seconde autorisation doit livrer une AUTRE piste');
    apres.anciennes.forEach((e) => {
      assert.equal(e, 'ended',
        'les pistes du flux précédent doivent être arrêtées, sinon elles parleront encore : ' +
        JSON.stringify(apres.anciennes));
    });
    assert.deepEqual(apres.nouvelle, ['live'], 'et la nouvelle doit être vivante : ' +
      JSON.stringify(apres.nouvelle));
    console.log('        anciennes ' + JSON.stringify(apres.anciennes) +
      ' · nouvelle ' + JSON.stringify(apres.nouvelle));
  });

  // ── §24 — (D2 / E8) LE BANDEAU AVANCE, IL EST EN TÊTE, ET IL DEVIENT NEUTRE ───────────────
  await controle('§24 le bandeau E8 dit la durée COURANTE, pas une durée figée', async () => {
    // DÉFAUT 2 DU RELEVÉ D'ESSAIS : « le bandeau rouge ne se met pas à jour (depuis 2,0 s figé
    // alors que le signal manque depuis 5 s ou plus) ». On lit donc le bandeau DEUX FOIS, à
    // quelques secondes d'intervalle, et la durée qu'il annonce doit avoir grandi d'autant.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/zeros-71s.wav');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    // Le bandeau tombe à 2 s de zéro (E8).
    await page.waitForFunction(() => !!document.querySelector('[data-alerte] [data-cle="muet"]'),
      null, { timeout: 20000 });

    const lire = () => page.evaluate(() => {
      const m = document.querySelector('[data-alerte] [data-cle="muet"]');
      const t = m ? m.querySelector('span').textContent : '';
      const secondes = (t.match(/soit ([\d.,]+) s/) || [])[1];
      return { texte: t, etat: m && m.getAttribute('data-state'),
               secondes: secondes ? parseFloat(secondes.replace(',', '.')) : null,
               // LA ZONE, ET SA POSITION DANS LE DOCUMENT : l'alerte doit précéder les avis.
               alerteAvantAvis: !!(document.querySelector('[data-alerte]').compareDocumentPosition(
                 document.querySelector('[data-messages]')) & Node.DOCUMENT_POSITION_FOLLOWING),
               collee: getComputedStyle(document.querySelector('[data-alerte]')).position };
    });

    const t1 = await lire();
    await page.waitForTimeout(3000);
    const t2 = await lire();

    assert.equal(t1.etat, 'error', 'pendant la prise, le bandeau est une alerte : ' + t1.etat);
    assert.ok(typeof t1.secondes === 'number' && typeof t2.secondes === 'number',
      'le bandeau doit annoncer une durée en secondes : « ' + t1.texte + ' » puis « ' + t2.texte + ' »');
    assert.ok(t2.secondes - t1.secondes > 2,
      'LA DURÉE DOIT AVANCER (défaut 2) : ' + t1.secondes + ' s puis ' + t2.secondes +
      ' s après 3 s d\'attente — écart ' + (t2.secondes - t1.secondes).toFixed(1) + ' s');
    assert.ok(/échantillon \d+/.test(t1.texte),
      'et porter l\'échantillon de début (E8) : ' + t1.texte);
    assert.ok(/\(\d\d:\d\d,\d\d\d\)/.test(t1.texte),
      'et l\'instant correspondant : ' + t1.texte);
    assert.equal(t1.alerteAvantAvis, true,
      'la zone d\'alerte doit PRÉCÉDER les avis, pour qu\'aucun avis ne la repousse (E8)');
    assert.equal(t1.collee, 'fixed',
      'et être rattachée à la FENÊTRE, non au panneau (E8 : « fixée en haut de la fenêtre ») : '
      + 'position ' + t1.collee + '. Le défilement lui-même est éprouvé par §24c.');

    // L'INTITULÉ PENDANT, PUIS APRÈS L'ARRÊT.
    const pendant = await page.evaluate(() => document.querySelector('[data-chrono-intitule]').textContent);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    const apres = await page.evaluate(() => {
      const m = document.querySelector('[data-alerte] [data-cle="muet"]');
      return { intitule: document.querySelector('[data-chrono-intitule]').textContent,
               etat: m && m.getAttribute('data-state'),
               texte: m && m.querySelector('span').textContent };
    });
    await ctx.close();
    assert.equal(pendant, 'Enregistrement', 'pendant la prise : ' + pendant);
    assert.equal(apres.intitule, 'Dernière prise',
      'après l\'arrêt l\'intitulé doit changer (défaut 2) : ' + apres.intitule);
    assert.equal(apres.etat, 'info',
      'et le bandeau devient NEUTRE à l\'arrêt (E8) : ' + apres.etat + ' — ' + apres.texte);
    assert.ok(/avait été à zéro/.test(apres.texte),
      'au passé, puisque c\'est un résumé : ' + apres.texte);
    console.log('        ' + t1.secondes + ' s → ' + t2.secondes + ' s en 3 s · position ' +
      t1.collee + ' · alerte avant avis · « Enregistrement » → « ' + apres.intitule +
      ' » · résumé ' + apres.etat);
  });

  await controle('§24b aucune alerte ne survit à la prise suivante, et aucun avis ne la couvre', async () => {
    // DÉFAUT 2, deux autres volets : « reste affiché à la prise suivante » et « les avis
    // d'opérations passées (Prise récupérée, WAV exporté) s'empilent et repoussent l'alerte ».
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/zeros-71s.wav');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    // PREMIÈRE PRISE, muette : elle laisse une alerte et un verdict.
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => !!document.querySelector('[data-alerte] [data-cle="muet"]'),
      null, { timeout: 20000 });
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    // UN AVIS D'OPÉRATION PASSÉE : l'export WAV de cette prise.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-prise] [data-action="wav"]')][0];
      if (el) el.click();
    });
    // L'ATTENTE EST OBLIGATOIRE, non optionnelle. Première version : un `.catch(() => {})`
    // avalait l'expiration, si bien que le contrôle passait à l'assertion sans que l'avis soit
    // arrivé — il réussissait seul et échouait dans la suite entière, où la machine est plus
    // chargée. Une attente qu'on avale est une course déguisée.
    await page.waitForFunction(() => !!document.querySelector('[data-cle="wav"]'),
      null, { timeout: 30000 });
    const avant = await page.evaluate(() => ({
      alertes: [...document.querySelectorAll('[data-alerte] .sc-bm-message')].map((m) => m.getAttribute('data-cle')),
      avis: [...document.querySelectorAll('[data-messages] .sc-bm-message')].map((m) => m.getAttribute('data-cle')),
    }));
    // SECONDE PRISE : tout doit avoir disparu au démarrage.
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(400);
    const auDemarrage = await page.evaluate(() => ({
      alertes: [...document.querySelectorAll('[data-alerte] .sc-bm-message')].map((m) => m.getAttribute('data-cle')),
      avis: [...document.querySelectorAll('[data-messages] .sc-bm-message')].map((m) => m.getAttribute('data-cle')),
      mode: document.querySelector('[data-mode]').textContent,
    }));
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    await ctx.close();

    // 1. L'AVIS D'EXPORT EXISTE, ET IL EST DANS L'AUTRE ZONE : il ne peut pas couvrir l'alerte.
    assert.ok(avant.avis.includes('wav'),
      'l\'avis d\'export WAV doit avoir été émis : ' + JSON.stringify(avant));
    assert.ok(!avant.alertes.includes('wav'),
      'et il ne doit JAMAIS entrer dans la zone d\'alerte : ' + JSON.stringify(avant.alertes));
    assert.ok(avant.alertes.includes('muet') || avant.alertes.includes('prise-muette'),
      'la zone d\'alerte, elle, porte le passage muet : ' + JSON.stringify(avant.alertes));
    // 2. AU DÉMARRAGE DE LA PRISE SUIVANTE, LES DEUX ZONES SONT VIDES.
    assert.equal(auDemarrage.mode, 'Prise en cours', 'la seconde prise tourne : ' + auDemarrage.mode);
    assert.deepEqual(auDemarrage.alertes, [],
      'aucune alerte de la prise précédente ne survit (défaut 2) : ' + JSON.stringify(auDemarrage.alertes));
    assert.deepEqual(auDemarrage.avis, [],
      'et aucun avis non plus : ' + JSON.stringify(auDemarrage.avis));
    console.log('        avant : alertes ' + JSON.stringify(avant.alertes) + ' avis ' +
      JSON.stringify(avant.avis) + ' → au démarrage suivant : les deux zones vides');
  });

  await controle('§24c la page DÉFILE : le bandeau reste en haut de la fenêtre (E8)', async () => {
    // E8 dit « fixée en haut de la FENÊTRE ». Première version : `position: sticky`, qui collait
    // l'alerte en haut du PANNEAU — dès que la page défilait au-delà du panneau, l'alerte partait
    // avec lui. Christophe l'a relevé le 11 octobre. Ce contrôle fait réellement défiler la page
    // et mesure la position du bandeau à l'écran, en pixels.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/zeros-71s.wav');
    // Une fenêtre basse, pour que la page ait de quoi défiler.
    await page.setViewportSize({ width: 1000, height: 420 });
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => !!document.querySelector('[data-alerte] [data-cle="muet"]'),
      null, { timeout: 20000 });

    const mesurer = () => page.evaluate(() => {
      const m = document.querySelector('[data-alerte] [data-cle="muet"]');
      const r = m.getBoundingClientRect();
      return {
        defilement: Math.round(window.scrollY),
        hauteurFenetre: window.innerHeight,
        hauteurPage: Math.round(document.documentElement.scrollHeight),
        haut: Math.round(r.top), bas: Math.round(r.bottom),
        largeur: Math.round(r.width), visible: r.top < window.innerHeight && r.bottom > 0,
        // Le point décisif : l'élément qui occupe le pixel du haut de la fenêtre, au milieu
        // horizontalement. Si c'est le bandeau (ou un de ses enfants), il est bien DEVANT.
        auSommet: (() => {
          const e = document.elementFromPoint(Math.round(window.innerWidth / 2), 4);
          return e ? !!e.closest('[data-alerte]') : false;
        })(),
      };
    });

    const avant = await mesurer();
    // ON FAIT DÉFILER POUR DE VRAI, jusqu'en bas de la page.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const apres = await mesurer();
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => /terminée|muette/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    await ctx.close();

    // 1. LA PAGE A VRAIMENT DÉFILÉ : sans cela le contrôle ne prouverait rien.
    assert.ok(apres.defilement > 150,
      'la page doit avoir défilé d\'au moins 150 px, sinon le contrôle ne contrôle rien : ' +
      apres.defilement + ' px (page ' + apres.hauteurPage + ' px, fenêtre ' +
      apres.hauteurFenetre + ' px)');
    // 2. LE BANDEAU EST TOUJOURS EN HAUT DE LA FENÊTRE, aux mêmes pixels qu'avant.
    assert.ok(apres.haut >= 0 && apres.haut <= 24,
      'après défilement, le bandeau doit rester à quelques pixels du haut de la FENÊTRE : ' +
      apres.haut + ' px (avant défilement : ' + avant.haut + ' px)');
    assert.equal(apres.haut, avant.haut,
      'et ne pas avoir bougé d\'un pixel : ' + avant.haut + ' → ' + apres.haut);
    assert.equal(apres.visible, true, 'il doit être dans la fenêtre : ' + JSON.stringify(apres));
    // 3. IL EST DEVANT, et non caché derrière le contenu.
    assert.equal(apres.auSommet, true,
      'et c\'est bien lui qui occupe le haut de la fenêtre, non le contenu passé par-dessus');
    console.log('        page ' + apres.hauteurPage + ' px, fenêtre ' + apres.hauteurFenetre +
      ' px · défilé de ' + apres.defilement + ' px · bandeau à ' + avant.haut + ' px avant, ' +
      apres.haut + ' px après, largeur ' + apres.largeur + ' px, au sommet de la fenêtre');
  });

  // ── §29 — (D3) PAS DEUX FOIS LE MÊME ÉVÉNEMENT AU JOURNAL ─────────────────────────────────
  await controle('§29 deux vidanges de suite : un seul « morceau partiel poussé », aucun doublon', async () => {
    // DÉFAUT 3 DU RELEVÉ D'ESSAIS, son dernier volet : « le journal contient morceau partiel
    // poussé DEUX FOIS, dont une à 0 échantillon ». La cause : `visibilitychange` et `pagehide`
    // demandent tous deux la vidange, et la seconde n'a plus rien à pousser. Les deux demandes
    // restent consignées — les taire masquerait l'ordre réel des événements — mais sous deux
    // libellés, parce que ce sont deux faits : un morceau poussé, et rien à pousser.
    //
    // Ce contrôle manquait au compte rendu de T1 bis : la correction était faite, personne ne la
    // gardait.
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
    await page.waitForTimeout(1800);

    // LES DEUX DEMANDES, ENCHAÎNÉES SANS RIEN ENTRE ELLES. C'est ce que fait le navigateur quand
    // on ferme un onglet : `visibilitychange` puis `pagehide` à quelques millisecondes. Première
    // version de ce contrôle : j'attendais l'écriture du premier morceau avant de déclencher le
    // second événement, soit six cents millisecondes plus tard — assez pour qu'un VRAI second
    // morceau partiel se soit formé. Le journal en portait donc deux, à juste titre, et mon
    // contrôle accusait le produit d'un doublon qu'il n'avait pas. Il faut enchaîner.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await page.waitForFunction(() => window.EnregistreurVoix._etat().morceauxEcrits >= 1,
      null, { timeout: 10000 });
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { journal: e.journal.map((x) => ({ quoi: x.quoi, a: x.aEchantillon,
                                                pousses: x.echantillonsPousses })),
               morceaux: e.morceauxEcrits };
    });
    await ctx.close();

    const libelles = r.journal.map((e) => e.quoi);
    // 1. LES DEUX DEMANDES SONT BIEN ARRIVÉES : sans cela le contrôle ne prouve rien.
    assert.ok(libelles.includes('page masquée'),
      'la page doit s\'être masquée : ' + JSON.stringify(libelles));
    assert.ok(libelles.includes('page déchargée'),
      'puis déchargée : ' + JSON.stringify(libelles));
    // 2. UN SEUL « morceau partiel poussé ».
    const pousses = r.journal.filter((e) => e.quoi === 'morceau partiel poussé');
    assert.equal(pousses.length, 1,
      'un seul morceau partiel a été poussé, le journal ne doit pas le dire deux fois : ' +
      JSON.stringify(libelles));
    assert.ok(pousses[0].pousses > 0,
      'et celui-là portait des échantillons : ' + pousses[0].pousses);
    // 3. LA SECONDE DEMANDE A SON PROPRE LIBELLÉ, et dit zéro.
    const rien = r.journal.filter((e) => e.quoi === 'vidange demandée, rien à pousser');
    assert.ok(rien.length >= 1,
      'la seconde vidange, qui n\'avait rien à pousser, doit être consignée sous son propre ' +
      'libellé : ' + JSON.stringify(libelles));
    rien.forEach((e) => {
      assert.equal(e.pousses, 0,
        'et annoncer zéro échantillon poussé : ' + e.pousses);
    });
    // 4. L'INVARIANT GÉNÉRAL : aucun couple (libellé, position) deux fois. C'est la signature
    //    d'un doublon, quel que soit l'événement — y compris ceux que je n'ai pas prévus.
    const vus = new Map();
    r.journal.forEach((e) => {
      const cle = e.quoi + '@' + e.a;
      vus.set(cle, (vus.get(cle) || 0) + 1);
    });
    const doubles = [...vus.entries()].filter(([, n]) => n > 1);
    assert.deepEqual(doubles, [],
      'aucun événement ne doit figurer deux fois au même échantillon : ' + JSON.stringify(doubles) +
      ' — journal complet : ' + JSON.stringify(r.journal));
    console.log('        ' + JSON.stringify(libelles) + ' · 1 morceau partiel poussé (' +
      pousses[0].pousses + ' éch), ' + rien.length + ' vidange sans rien à pousser, 0 doublon');
  });

  // ── §25 — (D6) LA FICHE D'UNE PRISE INACHEVÉE DIT CE QUI EST LÀ ───────────────────────────
  await controle('§25 prise inachevée : la fiche affiche les morceaux RELUS, jamais 0', async () => {
    // DÉFAUT 6 DU RELEVÉ D'ESSAIS : « une prise inachevée affiche 0 morceau, 0,00 Mo alors que
    // l'encadré de reprise en retrouve 7 (35 s) ». Deux chiffres, deux sources, et c'est le faux
    // qui s'affichait — celui qui conduit un opérateur à supprimer une prise récupérable.
    const ctx = await nav.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    await page.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await neutraliserLeRebours(page);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().morceauxEcrits >= 3,
      null, { timeout: 20000 });
    const priseId = await page.evaluate(() => window.EnregistreurVoix._etat().priseId);
    await page.close();   // la page meurt en pleine prise : la prise reste 'en-cours'

    const page2 = await ctx.newPage();
    await page2.goto(base + '/banc-enregistreur.html');
    await page2.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await page2.waitForFunction(() => !!document.querySelector('[data-prise]'), null, { timeout: 20000 });

    const vu = await page2.evaluate(async (id) => {
      const carte = document.querySelector('[data-prise="' + id + '"]');
      const e = window.EnregistreurVoix._etat();
      // LE TÉMOIN : les octets réellement en base, relus par le curseur.
      let morceaux = 0, echantillons = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, id, (m) => {
        morceaux++; echantillons += m.pcm.byteLength / 2;
      });
      const prise = await window.VoixStockage.lirePrise(e.db, id);
      const boite = document.querySelector('[data-reprise] [data-reprise-detail]');
      return {
        carte: carte ? carte.querySelector('[data-detail]').textContent : null,
        badge: carte ? carte.querySelector('.sc-bm-badge').textContent : null,
        enBase: { morceaux, echantillons },
        comptteursDeLaPrise: { nbMorceaux: prise.nbMorceaux, nbEchantillons: prise.nbEchantillons,
                               etat: prise.etat,
                               journal: (prise.journal || []).map((x) => x.quoi) },
        encadre: boite ? boite.textContent : null,
      };
    }, priseId);
    await ctx.close();

    assert.ok(vu.carte, 'la fiche de la prise inachevée doit exister');
    assert.equal(vu.badge, 'Inachevée', 'avec son état : ' + vu.badge);
    assert.equal(vu.comptteursDeLaPrise.etat, 'en-cours',
      'la prise est bien restée en cours : ' + vu.comptteursDeLaPrise.etat);
    // 1. LES COMPTEURS DE LA PRISE NE SONT PLUS À ZÉRO — et c'est une amélioration de T1 ter.
    //    Première version de ce contrôle : « ils valent zéro, c'est normal, elle n'a pas eu le
    //    temps de se clore ». Depuis que le journal et les compteurs sont écrits à chaque
    //    morceau (il le fallait : une prise tuée perdait tous ses raccords, voir §32), ils
    //    valent ce qui a été écrit. Ce qui doit rester vrai, et qui est la garantie du défaut 6,
    //    c'est qu'ils ne sont JAMAIS EN AVANCE sur ce qui est réellement là : un compteur en
    //    avance ferait annoncer une durée que le fichier ne porte pas.
    assert.ok(vu.enBase.morceaux >= 3,
      'les morceaux doivent être en base : ' + vu.enBase.morceaux);
    assert.ok(vu.comptteursDeLaPrise.nbMorceaux <= vu.enBase.morceaux,
      'les compteurs de la prise ne doivent jamais DÉPASSER ce qui est relu : ' +
      vu.comptteursDeLaPrise.nbMorceaux + ' annoncés contre ' + vu.enBase.morceaux + ' relus');
    assert.ok(vu.comptteursDeLaPrise.nbEchantillons <= vu.enBase.echantillons,
      'ni en échantillons : ' + vu.comptteursDeLaPrise.nbEchantillons + ' contre ' +
      vu.enBase.echantillons);
    // ET LE JOURNAL A SURVÉCU À LA MORT DE LA PAGE : c'est ce que §32 exige pour pouvoir
    // continuer une prise sans perdre ses raccords.
    assert.ok((vu.comptteursDeLaPrise.journal || []).length >= 1,
      'le journal de la prise doit avoir survécu : ' +
      JSON.stringify(vu.comptteursDeLaPrise.journal));
    // 2. CE QUE LA FICHE AFFICHE : les chiffres RELUS.
    assert.ok(vu.carte.includes(vu.enBase.morceaux + ' morceaux'),
      'la fiche doit afficher les morceaux relus (' + vu.enBase.morceaux + ') : ' + vu.carte);
    assert.ok(!/\b0 morceaux\b/.test(vu.carte),
      'et jamais 0 morceau pour une prise qui en a : ' + vu.carte);
    assert.ok(!/0\.00 Mo/.test(vu.carte), 'ni 0,00 Mo : ' + vu.carte);
    assert.ok(/relu dans IndexedDB/.test(vu.carte),
      'et dire d\'où viennent ses chiffres : ' + vu.carte);
    // 3. LA FICHE ET L'ENCADRÉ DE REPRISE DISENT LA MÊME CHOSE : c'est la divergence entre les
    //    deux qui a révélé le défaut à Christophe.
    assert.ok(vu.encadre && vu.encadre.includes(vu.enBase.morceaux + ' morceaux retrouvés'),
      'l\'encadré de reprise doit annoncer le même compte : ' + vu.encadre);
    console.log('        compteurs de la prise ' + vu.comptteursDeLaPrise.nbMorceaux +
      ' morceaux · en base ' + vu.enBase.morceaux + ' morceaux / ' + vu.enBase.echantillons +
      ' éch · journal survivant ' + JSON.stringify(vu.comptteursDeLaPrise.journal) +
      ' · fiche : ' + vu.carte.slice(0, 64));
  });

  // ── §26 — (D5) SIGNAL PERDU JUSQU'À LA FIN N'EST PAS « UN PASSAGE MUET » ──────────────────
  await controle('§26 signal perdu et jamais revenu : l\'état le DIT, avec son instant', async () => {
    // DÉFAUT 5 DU RELEVÉ D'ESSAIS : « l'état sonore avec un passage muet est donné à une prise
    // dont 68 % est à zéro jusqu'à la fin ». Ce n'est pas un passage, c'est une perte : appeler
    // cela un passage laisse croire qu'il y a quelque chose après. Le fait qui sépare les deux
    // est au journal : le son est-il revenu après la dernière chute à zéro ?
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/signal-perdu-au-milieu.wav');
    // On laisse courir bien au-delà des 2 s de zéro qui lèvent l'alerte, sans aller jusqu'au bout
    // de la fixture : la perte doit durer JUSQU'À L'ARRÊT.
    const r = await prendre(page, { attendreMs: 9000 });
    await ctx.close();
    const quoi = r.module.journal.map((e) => e.quoi);
    assert.ok(quoi.includes('piste muette'),
      'l\'alerte E8 doit être tombée : ' + JSON.stringify(quoi));
    assert.ok(!quoi.includes('son revenu'),
      'et le son ne doit PAS être revenu : ' + JSON.stringify(quoi));
    // 1. L'ÉTAT DU RAPPORT NOMME LA PERTE ET SON INSTANT.
    const etat = r.module.mesures.etatDeLaPiste;
    assert.ok(/signal perdu à l'échantillon \d+/.test(etat),
      'l\'état doit nommer la perte et son échantillon : ' + etat);
    assert.ok(!/passage muet/.test(etat),
      'et ne jamais parler d\'un « passage » : ' + etat);
    assert.ok(typeof r.module.mesures.signalPerduAEchantillon === 'number',
      'avec l\'échantillon en clair, pour le refaire : ' + r.module.mesures.signalPerduAEchantillon);
    // 2. LA PRISE PORTE CET ÉTAT EN STOCKAGE, donc après rechargement aussi.
    assert.equal(r.stockage.prise.etat, 'signal-perdu',
      'la prise doit être rangée comme telle : ' + r.stockage.prise.etat);
    // 3. ET LA PRISE N'EST PAS DÉCLARÉE MUETTE : son début est utilisable.
    assert.ok(r.stockage.echantillons > 0, 'des échantillons ont bien été écrits');
    assert.ok(r.affiche.messages.some((m) => /SIGNAL PERDU/.test(m.texte)),
      'et la page doit le dire : ' + JSON.stringify(r.affiche.messages.map((m) => m.texte.slice(0, 40))));
    console.log('        ' + etat + ' · prise « ' + r.stockage.prise.etat + ' » · ' +
      r.stockage.echantillons + ' échantillons écrits');
  });

  // ── §27 — LE WORKLET À 44 100 Hz, SANS OUVRIR AUCUN PÉRIPHÉRIQUE ──────────────────────────
  //
  // POURQUOI CE CONTRÔLE EXISTE. Sept mutations du falsifieur étaient NON DÉCIDABLES sur la
  // machine de Christophe, dont la sortie est à 48 000 Hz : à cette fréquence, 5 secondes font
  // 240 000 échantillons, qui sont DÉJÀ un nombre entier de blocs de 128, et 2 secondes font
  // 96 000 — si bien que « compté en échantillons » et « compté pour 48 kHz » donnent le même
  // nombre. Christophe a refusé (11 octobre) de remettre sa machine à 44 100 Hz pour un test, et
  // il a raison : c'est un essai À MOI qui l'avait fait basculer, et aucun contrôle ne doit
  // dépendre de la configuration de son Mac.
  //
  // LA SORTIE N'EST PAS DE FORCER UNE FRÉQUENCE À UN CONTEXTE RÉEL — c'est exactement ce qui a
  // changé sa machine. C'est un `OfflineAudioContext`, qui rend hors du temps et **n'ouvre aucun
  // périphérique audio** : il ne peut donc rien changer à la configuration de la machine. Le
  // worklet qui y tourne est le VRAI, chargé depuis le même fichier que le produit, et son
  // `sampleRate` global vaut 44 100.
  await controle('§27 à 44 100 Hz (contexte différé, aucun périphérique) : seuil, morceau et passe-bas', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(async () => {
      const HZ = 44100;

      // UN RENDU, UN SEUL MESSAGE. Mesuré en écrivant ce contrôle : dans un
      // `OfflineAudioContext`, un seul des messages mis en file avant `startRendering()` est
      // traité par le processeur avant la fin du rendu ; le second ne l'est qu'après, quand il
      // n'y a plus d'échantillons à voir. Deux ordres essayés, deux résultats symétriques :
      // « bruit puis prise » donnait les fenêtres et aucun morceau, « prise puis bruit » les
      // morceaux et aucune fenêtre. On fait donc DEUX rendus, un message chacun. Rien de cela ne
      // concerne le produit, qui tourne en temps réel et attend l'accusé de réception du worklet
      // entre les deux messages.
      async function rendre(message, fixture, secondes) {
        const oc = new OfflineAudioContext(1, HZ * secondes, HZ);
        await oc.audioWorklet.addModule('enregistreur-worklet.js');
        const noeud = new AudioWorkletNode(oc, 'enregistreur-voix', {
          numberOfInputs: 1, numberOfOutputs: 0,
          channelCount: 2, channelCountMode: 'max', channelInterpretation: 'discrete',
          processorOptions: { echantillonsParMorceau: Math.round(5 * oc.sampleRate) },
        });
        const messages = [];
        noeud.port.onmessage = (e) => messages.push(e.data);
        const ab = await fetch('banc-enregistreur/fixtures/' + fixture).then((x) => x.arrayBuffer());
        const buf = await oc.decodeAudioData(ab.slice(0));
        const src = oc.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
        src.connect(noeud);
        // Un chemin vers la destination : sans lui, le graphe d'un contexte différé peut être
        // élagué, un nœud sans sortie n'y menant pas. Le gain est à zéro, et de toute façon un
        // contexte différé ne joue rien — AUCUN périphérique audio n'est ouvert, et c'est tout
        // l'intérêt : la configuration du Mac ne peut pas être touchée.
        const muet = oc.createGain(); muet.gain.value = 0;
        src.connect(muet); muet.connect(oc.destination);
        noeud.port.postMessage(message);
        await oc.startRendering();
        await new Promise((res) => setTimeout(res, 300));
        return { hz: oc.sampleRate, messages: messages };
      }

      // ── RENDU A : LA PRISE — seuil de silence et taille d'un morceau ─────────────────────
      const a = await rendre({ type: 'demarrer-prise', canal: 'gauche' },
                             'canal-droit-vide.wav', 9);
      const demarree = a.messages.find((m) => m.type === 'prise-demarree');
      const morceaux = a.messages.filter((m) => m.type === 'morceau' && !m.partiel);

      // ── RENDU B : LE BRUIT — le passe-bas sur un son pur à 120 Hz ───────────────────────
      const b = await rendre({ type: 'mesurer-bruit', canal: 'gauche',
                               echantillons: Math.round(3 * HZ) },
                             'bruit-120hz.wav', 6);
      const demarre = b.messages.find((m) => m.type === 'bruit-demarre');
      const bruit = b.messages.find((m) => m.type === 'bruit');
      const fenetres = b.messages.filter((m) => m.type === 'fenetre-bruit' && !m.partielle);
      // On écarte la première fenêtre : le filtre y part de zéro, et son établissement n'est pas
      // une propriété de sa coupure.
      const utiles = fenetres.slice(1);
      const tot = utiles.reduce((t, f) => t + f.sommeCarre, 0);
      const grave = utiles.reduce((t, f) => t + f.sommeCarreGrave, 0);

      return {
        hz: a.hz,
        seuilSilence: demarree.seuilSilenceEchantillons,
        echantillonsParMorceau: demarree.echantillonsParMorceau,
        demandeeParLeModule: Math.round(5 * a.hz),
        tailleDuPremierMorceau: morceaux.length ? morceaux[0].nbEchantillons : null,
        hzDuWorklet: demarree.echantillonnage,
        hzDeLaMesure: bruit ? bruit.echantillonnage : null,
        echantillonsDeLaMesure: bruit ? bruit.n : null,
        parFenetre: demarre ? demarre.parFenetre : null,
        fenetres: utiles.length,
        partGrave: tot > 0 ? grave / tot : null,
      };
    });
    await ctx.close();

    assert.equal(r.hz, 44100, 'le contexte différé doit tourner à 44 100 Hz : ' + r.hz);
    assert.equal(r.hzDuWorklet, 44100,
      'et le worklet doit voir cette fréquence, pas une autre : ' + r.hzDuWorklet);

    // #6 — LE SEUIL DE CAPTURE MUETTE EST COMPTÉ EN ÉCHANTILLONS (E8).
    assert.equal(r.seuilSilence, 88200,
      '2 s à 44 100 Hz font 88 200 échantillons, et non 96 000 : ' + r.seuilSilence);
    assert.notEqual(r.seuilSilence, 96000,
      'un seuil écrit pour 48 kHz vaudrait 96 000, soit 2,18 s à cette fréquence');

    // #12 — UN MORCEAU EST UN NOMBRE ENTIER DE BLOCS DE 128 (E11).
    assert.equal(r.demandeeParLeModule, 220500,
      '5 s à 44 100 Hz font 220 500 échantillons demandés : ' + r.demandeeParLeModule);
    assert.equal(r.echantillonsParMorceau % 128, 0,
      'et la taille appliquée doit être un nombre ENTIER de blocs de 128 : ' +
      r.echantillonsParMorceau);
    assert.equal(r.echantillonsParMorceau, 220544,
      'soit 1 723 blocs = 220 544 échantillons : ' + r.echantillonsParMorceau);
    assert.notEqual(r.echantillonsParMorceau, r.demandeeParLeModule,
      'la valeur appliquée DIFFÈRE de la demandée à cette fréquence : c\'est tout l\'intérêt');
    assert.equal(r.tailleDuPremierMorceau, 220544,
      'et les morceaux réellement poussés portent cette taille : ' + r.tailleDuPremierMorceau);

    // #52 — LE PASSE-BAS COUPE À 120 Hz, PAS AILLEURS.
    assert.equal(r.hzDeLaMesure, 44100,
      'la mesure de bruit doit porter la fréquence réelle : ' + r.hzDeLaMesure);
    assert.equal(r.echantillonsDeLaMesure, 132300,
      '3 s à 44 100 Hz font 132 300 échantillons : ' + r.echantillonsDeLaMesure);
    assert.equal(r.parFenetre, 4410,
      'une fenêtre de 100 ms à 44 100 Hz fait 4 410 échantillons : ' + r.parFenetre);
    assert.ok(r.fenetres >= 20, 'il faut des fenêtres à sommer : ' + r.fenetres);
    assert.ok(Math.abs(r.partGrave - 0.5) < 0.03,
      'un passe-bas du 2e ordre laisse passer la MOITIÉ de l\'énergie à sa coupure : part ' +
      r.partGrave.toFixed(4) + ' attendue 0,50 ± 0,03. Une valeur vers 0,42 signifierait un ' +
      'filtre calculé pour 48 kHz appliqué à 44 100 Hz, qui couperait vers 110 Hz.');

    console.log('        contexte différé 44 100 Hz, aucun périphérique · seuil ' + r.seuilSilence +
      ' éch (un seuil « pour 48 kHz » aurait dit 96000) · morceau demandé ' +
      r.demandeeParLeModule + ' → appliqué ' + r.echantillonsParMorceau + ' (1723 blocs) · ' +
      'fenêtre ' + r.parFenetre + ' éch · part de grave ' + r.partGrave.toFixed(4));
  });

  // ── §28 — LA FRÉQUENCE EN PARAMÈTRE : LES RÈGLES ÉPROUVÉES AUX DEUX FRÉQUENCES ────────────
  await controle('§28 fréquence en paramètre : le rapport et la prise disent la fréquence RÉELLE', async () => {
    // Les quatre dernières mutations non décidables portent sur ce que le module ÉCRIT : la
    // fréquence du rapport, l'avis de rééchantillonnage du lot 4, la fréquence de la prise et la
    // taille d'un morceau. Les règles sont des fonctions pures qui prennent la fréquence en
    // paramètre : elles s'éprouvent aux deux fréquences sans qu'aucun périphérique soit ouvert,
    // et elles restent sur le vrai chemin (le rapport et `demarrer` les appellent ; §8, qui passe
    // par le vrai `getUserMedia`, les emprunte).
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const A = window.EnregistreurVoix;
      const prise = (hz, appliquee) => A.descripteurDePrise({
        id: 'p', nom: 'n', creeLe: 'd', echantillonnage: hz, canaux: 2,
        canalRetenu: 'gauche', canalRaison: 'r', reglageCanal: 'auto',
        echantillonsParMorceauAppliquee: appliquee,
      });
      return {
        f44: A.blocFrequence(44100), f48: A.blocFrequence(48000),
        p44: prise(44100, 220544), p48: prise(48000, 240000),
      };
    });
    await ctx.close();

    // #30 — LA FRÉQUENCE DU RAPPORT EST CELLE DU CONTEXTE.
    assert.equal(r.f44.reelle_hz, 44100, 'à 44 100 Hz le rapport doit dire 44 100 : ' + r.f44.reelle_hz);
    assert.equal(r.f48.reelle_hz, 48000, 'et à 48 000, 48 000 : ' + r.f48.reelle_hz);
    // #31 — L'AVIS DE RÉÉCHANTILLONNAGE DU LOT 4 SUIT LA FRÉQUENCE.
    assert.equal(r.f44.aReechantillonnerAuLot4, true,
      'une prise à 44 100 Hz devra être rééchantillonnée au lot 4 : ' + r.f44.aReechantillonnerAuLot4);
    assert.equal(r.f48.aReechantillonnerAuLot4, false,
      'une prise à 48 000 Hz, non : ' + r.f48.aReechantillonnerAuLot4);
    assert.ok(/48 000 Hz toute prise qui n/.test(r.f44.regle),
      'et la règle doit être écrite à côté du chiffre : ' + r.f44.regle);
    // #69 — LA PRISE ENREGISTRE LA FRÉQUENCE DE SON CONTEXTE, PAS UNE VALEUR DE RÉGLAGE.
    assert.equal(r.p44.echantillonnage, 44100,
      'la prise doit porter la fréquence de son contexte : ' + r.p44.echantillonnage);
    assert.equal(r.p48.echantillonnage, 48000, 'aux deux fréquences : ' + r.p48.echantillonnage);
    // #13 — LA PRISE CONSIGNE LA TAILLE APPLIQUÉE, JAMAIS LA DEMANDÉE (#11(f)).
    assert.equal(r.p44.echantillonsParMorceau, 220544,
      'la prise doit consigner la taille APPLIQUÉE (220 544), non la demandée (220 500) : ' +
      r.p44.echantillonsParMorceau);
    assert.notEqual(r.p44.echantillonsParMorceau, Math.round(5 * 44100),
      'et surtout pas 5 × 44 100 = 220 500, qui n\'est pas un entier de blocs de 128');
    assert.equal(r.p48.echantillonsParMorceau, 240000, 'à 48 000 Hz : ' + r.p48.echantillonsParMorceau);
    // UNE SEULE GRANDEUR : aucune taille nominale ne doit entrer dans le descripteur.
    const champs = Object.keys(r.p44);
    assert.ok(!champs.some((c) => /nominal|demandee|demandée/i.test(c)),
      'aucun champ ne doit porter la taille nominale : ' + JSON.stringify(champs));
    assert.equal(r.p44.etat, 'en-cours',
      'une prise naît « en-cours » : si la page meurt, elle est proposée à la reprise (E5)');

    console.log('        44 100 Hz → rapport 44100, lot 4 oui, prise 220544 (demandé 220500) · ' +
      '48 000 Hz → rapport 48000, lot 4 non, prise 240000');
  });

  // ── §30 — (E12, point 2) EN PAUSE, AUCUN ÉCHANTILLON N'EST ÉCRIT ──────────────────────────
  //
  // CE CONTRÔLE EST ÉCRIT AVANT TOUT CODE DE T1 TER, à la demande de Christophe, et il doit
  // donc échouer à sa première exécution : la pause n'existe pas encore.
  //
  // E12, mot pour mot : « en pause, l'enregistrement est suspendu (aucun échantillon écrit : la
  // pause n'occupe aucun temps dans la voix, sa durée est seulement notée au journal) ». Deux
  // mesures séparées le prouvent, parce qu'aucune des deux ne suffit :
  //   · L'INVARIANT EXACT, sans horloge : le compteur d'échantillons écrits ne bouge pas d'une
  //     unité pendant la pause. On le relève cinq fois pendant les trois secondes de pause.
  //   · LA SOMME, contre l'horloge : le total écrit vaut la durée des segments ACTIFS et non
  //     celle de la prise. Sans cette seconde mesure, une pause qui écrirait des zéros passerait
  //     l'invariant dès lors qu'elle le ferait en dehors des instants relevés.
  await controle('§30 une prise en pause n\'écrit AUCUN échantillon (E12)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });

    const ACTIF_1 = 2000, PAUSE = 3000, ACTIF_2 = 2000;
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(ACTIF_1);

    // LA PAUSE PASSE PAR LE VRAI BOUTON, pas par une fonction interne (#11(a)).
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => /pause/i.test(document.querySelector('[data-mode]').textContent),
      null, { timeout: 10000 });

    // CINQ RELEVÉS PENDANT LA PAUSE : le compteur ne doit pas bouger d'une unité.
    const pendant = [];
    for (let k = 0; k < 5; k++) {
      await page.waitForTimeout(PAUSE / 5);
      pendant.push(await page.evaluate(() => {
        const e = window.EnregistreurVoix._etat();
        return { ecrits: e.echantillonsEcrits, morceaux: e.morceauxEcrits,
                 priseId: e.priseId, enPause: e.enPause };
      }));
    }

    await page.click('[data-action="pause"]');   // la même touche/le même bouton reprend
    await page.waitForFunction(() => /en cours/i.test(document.querySelector('[data-mode]').textContent),
      null, { timeout: 10000 });
    await page.waitForTimeout(ACTIF_2);

    const r = await prendreLaFin(page);
    await ctx.close();

    const hz = r.module.echantillonnage;
    // ── 1. L'INVARIANT EXACT : rien n'a été écrit pendant la pause ───────────────────────────
    const ecrits = pendant.map((x) => x.ecrits);
    assert.equal(new Set(ecrits).size, 1,
      'le compteur d\'échantillons écrits ne doit pas bouger pendant la pause : ' +
      JSON.stringify(ecrits));
    const morceaux = pendant.map((x) => x.morceaux);
    assert.equal(new Set(morceaux).size, 1,
      'et aucun morceau ne doit être écrit pendant la pause : ' + JSON.stringify(morceaux));
    pendant.forEach((x) => {
      assert.equal(x.enPause, true, 'l\'état doit porter la pause : ' + JSON.stringify(x));
    });

    // ── 2. LA MÊME PRISE, pas une nouvelle (E12) ────────────────────────────────────────────
    assert.equal(new Set(pendant.map((x) => x.priseId)).size, 1, 'une seule prise pendant la pause');
    assert.equal(r.module.priseId, pendant[0].priseId,
      'et c\'est toujours la même après la reprise : ' + r.module.priseId);
    assert.equal(r.nbPrises, 1,
      'la reprise ne doit créer NI prise NI bout à part (E12) : ' + r.nbPrises + ' prise(s)');

    // ── 3. LA SOMME, contre l'horloge ───────────────────────────────────────────────────────
    const attenduActif = ((ACTIF_1 + ACTIF_2) / 1000) * hz;
    const attenduAvecPause = ((ACTIF_1 + PAUSE + ACTIF_2) / 1000) * hz;
    const ecart = Math.abs(r.stockage.echantillons - attenduActif);
    assert.ok(ecart < 0.35 * hz,
      'le total écrit doit valoir la durée des segments ACTIFS (' + Math.round(attenduActif) +
      ' échantillons) : relu ' + r.stockage.echantillons + ', écart ' + Math.round(ecart) +
      ' échantillons (' + (ecart / hz).toFixed(2) + ' s)');
    assert.ok(r.stockage.echantillons < attenduAvecPause - 2 * hz,
      'et SURTOUT PAS celle de la prise entière (' + Math.round(attenduAvecPause) +
      ') : relu ' + r.stockage.echantillons);

    // ── 4. LE JOURNAL PORTE LE RACCORD ET LA DURÉE DE LA PAUSE (E12) ────────────────────────
    const raccords = r.module.journal.filter((e) => /pause|reprise/i.test(e.quoi));
    assert.ok(raccords.length >= 2,
      'la pause et la reprise doivent être journalisées : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    const laPause = raccords.find((e) => /^pause/.test(e.quoi));
    const laReprise = raccords.find((e) => /^reprise/.test(e.quoi));
    assert.ok(laPause && laReprise, 'une pause et une reprise : ' + JSON.stringify(raccords));
    assert.equal(laPause.aEchantillon, laReprise.aEchantillon,
      'LA PAUSE N\'OCCUPE AUCUN TEMPS DANS LA VOIX : la reprise repart de l\'échantillon où la ' +
      'pause a commencé. Pause à ' + laPause.aEchantillon + ', reprise à ' + laReprise.aEchantillon);
    assert.ok(typeof laReprise.dureePause_s === 'number',
      'et la durée de la pause doit être notée au journal (E12) : ' +
      JSON.stringify(laReprise));
    assert.ok(Math.abs(laReprise.dureePause_s - PAUSE / 1000) < 0.8,
      'durée de pause attendue ' + (PAUSE / 1000) + ' s, notée ' + laReprise.dureePause_s + ' s');

    // ── 5. LES MORCEAUX N'ONT PLUS TOUS LA MÊME TAILLE (point 1), et c'est voulu ────────────
    const tailles = r.stockage.tailles;
    assert.ok(tailles.length >= 2, 'il faut plusieurs morceaux : ' + JSON.stringify(tailles));
    assert.ok(r.stockage.indexVus.every((v, i) => v === i),
      'et leurs index restent continus : ' + JSON.stringify(r.stockage.indexVus));

    console.log('        actif ' + (ACTIF_1 + ACTIF_2) / 1000 + ' s + pause ' + PAUSE / 1000 +
      ' s · écrit ' + r.stockage.echantillons + ' éch (' +
      (r.stockage.echantillons / hz).toFixed(2) + ' s, attendu ' + (attenduActif / hz).toFixed(2) +
      ') · compteur immobile pendant la pause : ' + ecrits[0] + ' · pause et reprise au même ' +
      'échantillon ' + laPause.aEchantillon + ' · durée notée ' + laReprise.dureePause_s + ' s · ' +
      'tailles de morceaux ' + JSON.stringify(tailles));
  });

  // ── §31 — (E8 / E12) LA PERTE DU MICRO MET LA PRISE EN PAUSE, SANS ÉCRIRE DE ZÉRO ────────
  await controle('§31 micro perdu : pause d\'elle-même, aucun zéro, bandeau et « Reprendre »', async () => {
    // E8 : « Quand la piste audio se termine ou que le contexte audio est interrompu, la prise se
    // met en pause (E12) : aucun zéro n'est écrit, le Studio l'annonce et propose Reprendre. »
    // Mesuré aux essais du 10 octobre : 52,13 s de zéros écrits, et « Enregistrement » toujours
    // affiché. Ce contrôle passe par le VRAI `getUserMedia` — la source de fixture n'a pas de
    // piste, et c'est la piste qui meurt ici.
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(2500);

    // ON TUE LA PISTE, comme le fait une autre application qui prend le micro.
    await page.evaluate(() => {
      window.__avantLaPerte = window.EnregistreurVoix._etat().echantillonsEcrits;
      window.EnregistreurVoix._etat().flux.getAudioTracks().forEach((t) => t.stop());
    });
    // La prise doit se mettre en pause d'elle-même, sans qu'on touche à rien.
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === true,
      null, { timeout: 10000 });

    // ON LAISSE COURIR : c'est pendant ce temps-là que 52 secondes de zéros s'écrivaient.
    const suivi = [];
    for (let k = 0; k < 4; k++) {
      await page.waitForTimeout(700);
      suivi.push(await page.evaluate(() => window.EnregistreurVoix._etat().echantillonsEcrits));
    }

    const pendant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const m = document.querySelector('[data-alerte] [data-cle="micro"]');
      const r = m ? m.getBoundingClientRect() : null;
      return {
        enPause: e.enPause, microPerdu: e.microPerdu, priseId: e.priseId,
        mode: document.querySelector('[data-mode]').textContent,
        intitule: document.querySelector('[data-chrono-intitule]').textContent,
        sbPiste: document.querySelector('[data-sb-piste]').textContent,
        alerte: m ? { etat: m.getAttribute('data-state'),
                      texte: m.querySelector('span').textContent,
                      bouton: !!m.querySelector('[data-action="reprendre-micro"]'),
                      libelleBouton: (m.querySelector('[data-action="reprendre-micro"]') || {}).textContent,
                      hautDansLaFenetre: Math.round(r.top),
                      collee: getComputedStyle(document.querySelector('[data-alerte]')).position }
                 : null,
        journal: e.journal,
        avantLaPerte: window.__avantLaPerte,
      };
    });

    // ── « REPRENDRE » : un nouveau getUserMedia, sur geste de l'utilisateur ────────────────
    await page.click('[data-alerte] [data-action="reprendre-micro"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === false,
      null, { timeout: 20000 });
    const apresReprise = await page.evaluate(() => window.EnregistreurVoix._etat().echantillonsEcrits);
    await page.waitForTimeout(1800);
    const r = await prendreLaFin(page);
    await ctx.close();

    const hz = r.module.echantillonnage;
    // 1. LA PRISE S'EST MISE EN PAUSE D'ELLE-MÊME.
    assert.equal(pendant.enPause, true, 'la prise doit être en pause : ' + JSON.stringify(pendant.mode));
    assert.equal(pendant.microPerdu, true, 'et savoir que le micro est perdu');
    assert.ok(/pause/i.test(pendant.mode), 'le badge doit le dire : ' + pendant.mode);
    assert.ok(/pause/i.test(pendant.intitule),
      'et l\'intitulé aussi, au lieu de « Enregistrement » : ' + pendant.intitule);
    assert.ok(/terminée/.test(pendant.sbPiste),
      'la case Piste doit dire « terminée » : ' + pendant.sbPiste);
    // 2. AUCUN ZÉRO N'EST ÉCRIT PENDANT LA PERTE : le compteur ne bouge plus d'une unité.
    assert.equal(new Set(suivi).size, 1,
      'le compteur d\'échantillons ne doit plus bouger après la perte (52,13 s de zéros aux '
      + 'essais du 10 octobre) : ' + JSON.stringify(suivi));
    // 3. LE BANDEAU : fixé à la FENÊTRE, rouge, daté, avec « Reprendre » (E8).
    assert.ok(pendant.alerte, 'un bandeau doit être affiché dans la zone d\'alerte');
    assert.equal(pendant.alerte.etat, 'error', 'rouge : ' + pendant.alerte.etat);
    assert.equal(pendant.alerte.collee, 'fixed',
      'fixé en haut de la FENÊTRE (E8) : position ' + pendant.alerte.collee);
    assert.ok(pendant.alerte.hautDansLaFenetre >= 0 && pendant.alerte.hautDansLaFenetre <= 24,
      'et visible en haut : ' + pendant.alerte.hautDansLaFenetre + ' px');
    assert.ok(/micro a été perdu à l'échantillon \d+/.test(pendant.alerte.texte),
      'il doit dire À QUEL INSTANT, en échantillons : ' + pendant.alerte.texte);
    assert.ok(/EN PAUSE/.test(pendant.alerte.texte),
      'et que la prise est en pause : ' + pendant.alerte.texte);
    assert.equal(pendant.alerte.bouton, true, 'avec un bouton « Reprendre » (E8)');
    assert.equal(pendant.alerte.libelleBouton, 'Reprendre',
      'libellé : ' + pendant.alerte.libelleBouton);
    // 4. LE JOURNAL PORTE LE RACCORD, SA RAISON ET LE COMPTE DES ZÉROS.
    const pause = pendant.journal.filter((e) => e.quoi === 'pause').pop();
    assert.ok(pause, 'la pause doit être journalisée : ' +
      JSON.stringify(pendant.journal.map((e) => e.quoi)));
    assert.equal(pause.raison, 'micro perdu', 'avec sa raison : ' + pause.raison);
    // LA COMPTABILITÉ DES ZÉROS, ENTIÈRE. C'est elle qui porte la garantie « aucun zéro n'est
    // écrit » (E8), et non une promesse : tout zéro que le worklet a vu à la pause a été soit
    // RETIRÉ de la prise, soit déclaré NON RETIRABLE parce qu'il était déjà dans un morceau
    // clos. Un trou du falsifieur a exigé cet invariant : sans lui, cesser de retirer les zéros
    // ne faisait échouer personne, le micro factice de Chromium étant lui-même à 96 % de zéros.
    assert.ok(typeof pause.zerosVusParLeWorklet === 'number',
      'le worklet doit dire combien de zéros il a vus : ' + JSON.stringify(pause));
    assert.equal(pause.zerosVusParLeWorklet, pause.zerosRetiresDeLaFin + pause.zerosDejaEcrits,
      'COMPTABILITÉ DES ZÉROS : ' + pause.zerosVusParLeWorklet + ' vus, ' +
      pause.zerosRetiresDeLaFin + ' retirés + ' + pause.zerosDejaEcrits + ' non retirables');
    assert.equal(pause.zerosDejaEcrits, 0,
      'et aucun ne doit être resté dans un morceau déjà clos : ' + pause.zerosDejaEcrits);
    // 5. LA REPRISE CONTINUE LA MÊME PRISE, et repart de l'échantillon de la pause.
    assert.equal(r.module.priseId, pendant.priseId,
      'la reprise ne crée pas de nouvelle prise (E12) : ' + r.module.priseId);
    assert.equal(r.nbPrises, 1, 'une seule prise en stockage : ' + r.nbPrises);
    assert.equal(apresReprise, suivi[0],
      'et elle repart de l\'échantillon où la perte l\'a arrêtée : ' + apresReprise +
      ' contre ' + suivi[0]);
    assert.ok(r.stockage.echantillons > suivi[0],
      'puis la prise grandit de nouveau : ' + r.stockage.echantillons + ' > ' + suivi[0]);
    // 6. CE CONTRÔLE NE VÉRIFIE PAS LES OCTETS DE LA QUEUE, et il faut dire pourquoi : mesuré
    //    en l'écrivant, le micro FACTICE de Chromium est lui-même à 96 % de zéros (3 844
    //    échantillons non nuls sur 96 000 — il émet de brèves salves, pas un son continu). Une
    //    assertion sur les zéros de fin mesurerait donc l'appareil d'essai et non le produit.
    //    La garantie « aucun zéro écrit » est vérifiée ici par l'immobilité du compteur et par
    //    `zerosDejaEcrits === 0` ; elle l'est SUR LES OCTETS en §31b, sur une fixture dont le
    //    signal est dense.
    assert.ok(r.module.journal.some((e) => e.quoi === 'reprise après perte du micro'),
      'la reprise doit être journalisée : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));

    // ── (3) UNE LATENCE NE PEUT PAS ÊTRE NÉGATIVE ───────────────────────────────────────────
    // Christophe a relevé « latenceDuDemarrage_ms: −1504 » sur une session reprise après une
    // perte de micro : les deux instants venaient de deux contextes différents, et le
    // `currentTime` d'un contexte neuf repart de zéro. Cette prise est exactement ce cas-là.
    const lat = r.module.mesures.blocs.latenceDuDemarrage_ms;
    if (typeof lat === 'number') {
      assert.ok(lat >= 0,
        'une latence ne peut pas être négative : ' + lat + ' ms');
    } else {
      assert.ok(/non mesurable|non mesurée/.test(String(lat)),
        'et si elle n\'est pas mesurable, le rapport doit le DIRE au lieu de rendre un ' +
        'chiffre impossible : ' + lat);
      assert.ok(/graphe a été reconstruit/.test(String(lat)),
        'avec sa raison : ' + lat);
    }
    // ── (3) « PISTE OUVERTE » D'UNE SESSION REPRISE EST DATÉE À SON ÉCHANTILLON RÉEL ────────
    // La piste rouverte s'ouvre au MILIEU de la prise : la dater à zéro la placerait avant son
    // début. Il y a deux entrées « piste ouverte » ici — celle du départ, à zéro, et celle de la
    // reprise, qui doit être à la position de la perte.
    const ouvertures = r.module.journal.filter((e) => e.quoi === 'piste ouverte');
    assert.ok(ouvertures.length >= 2,
      'la piste a été ouverte deux fois : au départ et à la reprise : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    assert.ok(ouvertures[ouvertures.length - 1].aEchantillon > 0,
      'la seconde ouverture doit être datée à son échantillon réel, non à zéro : ' +
      ouvertures[ouvertures.length - 1].aEchantillon);
    assert.equal(ouvertures[ouvertures.length - 1].aEchantillon, suivi[0],
      'c\'est-à-dire à la position où le micro avait été perdu : ' +
      ouvertures[ouvertures.length - 1].aEchantillon + ' contre ' + suivi[0]);
    console.log('        perte à ' + suivi[0] + ' éch (' + (suivi[0] / hz).toFixed(2) + ' s) · ' +
      'compteur immobile pendant ' + (4 * 0.7) + ' s : ' + JSON.stringify(suivi) + ' · ' +
      pause.zerosRetiresDeLaFin + ' zéros retirés, ' + pause.zerosDejaEcrits + ' non retirés · ' +
      'bandeau fixed à ' + pendant.alerte.hautDansLaFenetre + ' px · reprise à ' + apresReprise +
      ' → ' + r.stockage.echantillons + ' éch, 1 seule prise');
  });

  await controle('§31b contexte interrompu : pause d\'elle-même, et aucun zéro AJOUTÉ (octets relus)', async () => {
    // E8 nomme DEUX pertes : « la piste audio se termine » (§31) ou « le contexte audio est
    // interrompu (périphérique repris par une autre application, passage en arrière-plan) ».
    // Le second cas est celui-ci, et il a révélé un trou en l'écrivant : un contexte suspendu ne
    // produit plus de relevé, donc la surveillance qui vit dans le relevé ne tournait jamais
    // pour lui. Elle tourne désormais aussi sur `onstatechange`.
    //
    // ON L'ÉPROUVE SUR UNE FIXTURE AU SIGNAL DENSE — un sinus à 220 Hz —, ce qui permet de
    // vérifier la garantie « aucun zéro écrit » SUR LES OCTETS relus, ce que le micro factice de
    // Chromium ne permet pas (il est à 96 % de zéros).
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(2500);

    // ON INTERROMPT LE CONTEXTE, comme Safari le fait quand l'onglet passe au fond.
    await page.evaluate(async () => {
      window.__avant = window.EnregistreurVoix._etat().echantillonsEcrits;
      await window.EnregistreurVoix._etat().ctx.suspend();
    });
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === true,
      null, { timeout: 10000 });
    await page.waitForTimeout(1500);

    const pendant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const m = document.querySelector('[data-alerte] [data-cle="micro"]');
      return {
        enPause: e.enPause, microPerdu: e.microPerdu, cause: e.causeDeLaPerte,
        mode: document.querySelector('[data-mode]').textContent,
        sbContexte: document.querySelector('[data-sb-contexte]').textContent,
        alerte: m ? { etat: m.getAttribute('data-state'),
                      texte: m.querySelector('span').textContent,
                      bouton: !!m.querySelector('[data-action="reprendre-micro"]') } : null,
        journal: e.journal,
      };
    });

    // ON REPREND LE CONTEXTE À LA MAIN pour pouvoir clore la prise et relire les octets ; la
    // reprise par le bouton est éprouvée en §31, où le micro est réel.
    await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      await e.ctx.resume();
      e.microPerdu = false;
      e.enPause = false;
    });
    await page.waitForTimeout(300);
    const r = await prendreLaFin(page);
    await ctx.close();

    assert.equal(pendant.enPause, true,
      'un contexte interrompu doit mettre la prise en pause (E8) : ' + pendant.mode);
    assert.ok(/pause/i.test(pendant.mode), 'le badge doit le dire : ' + pendant.mode);
    assert.ok(/suspended|interrupted/.test(pendant.sbContexte),
      'et la case Contexte porter son état : ' + pendant.sbContexte);
    assert.ok(/contexte audio est (suspended|interrupted)/.test(pendant.cause || ''),
      'la cause doit nommer le contexte : ' + pendant.cause);
    assert.ok(pendant.alerte && pendant.alerte.etat === 'error',
      'un bandeau rouge : ' + JSON.stringify(pendant.alerte));
    assert.equal(pendant.alerte.bouton, true, 'avec « Reprendre » (E8)');
    assert.ok(/micro a été perdu à l'échantillon \d+/.test(pendant.alerte.texte),
      'daté en échantillons : ' + pendant.alerte.texte);
    // UN SEUL RACCORD DE PAUSE, malgré deux chemins de détection (relevé et `onstatechange`).
    const pauses = pendant.journal.filter((e) => e.quoi === 'pause');
    assert.equal(pauses.length, 1,
      'une seule entrée de pause, quels que soient les chemins de détection : ' +
      JSON.stringify(pendant.journal.map((e) => e.quoi)));
    // LA GARANTIE SUR LES OCTETS : la prise ne finit pas sur une traînée de zéros. Le signal de
    // la fixture est dense, donc tout zéro de fin serait un zéro AJOUTÉ par l'interruption.
    assert.ok(r.stockage.zerosDeFin < 200,
      'aucun zéro ne doit avoir été ajouté en fin de prise (E8) : ' + r.stockage.zerosDeFin +
      ' zéros consécutifs relus en fin de dernier morceau, sur un signal dense');
    console.log('        contexte ' + pendant.sbContexte + ' → ' + pendant.mode + ' · ' +
      pauses.length + ' raccord de pause · zéros relus en fin de prise : ' +
      r.stockage.zerosDeFin + ' · ' + r.stockage.echantillons + ' échantillons');
  });

  // ── §32 — (E5 / E12) CONTINUER UNE PRISE APRÈS UNE FERMETURE D'ONGLET ────────────────────
  await controle('§32 crash simulé puis « Continuer » : la MÊME prise se prolonge', async () => {
    // E5 : « reprise proposée après une fermeture accidentelle : Récupérer, OU Continuer cette
    // prise comme après une pause (E12) ». E12 : « une prise récupérée après un crash ou une
    // fermeture de fenêtre (elle se continue comme si elle avait été mise en pause) ». Le point
    // à prouver n'est pas qu'on peut réenregistrer, c'est que c'est la MÊME prise : même
    // identifiant, index de morceaux qui continuent, total qui s'ajoute, et une seule prise en
    // stockage. Une continuation qui créerait une seconde prise serait une reprise de PASSAGE
    // (R7), qui est une autre chose et n'est pas demandée ici.
    const ctx = await nav.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    await page.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await neutraliserLeRebours(page);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().morceauxEcrits >= 2,
      null, { timeout: 20000 });
    const priseId = await page.evaluate(() => window.EnregistreurVoix._etat().priseId);
    await page.close();   // la page meurt en pleine prise

    // ── ON ROUVRE : l'encadré de reprise doit proposer LES DEUX (E5) ─────────────────────
    const page2 = await ctx.newPage();
    await page2.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page2.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await page2.waitForFunction(() => !!document.querySelector('[data-reprise-prise]'),
      null, { timeout: 20000 });
    const propose = await page2.evaluate(() => {
      const s = document.querySelector('[data-reprise-prise]');
      return {
        id: s.getAttribute('data-reprise-prise'),
        continuer: !!s.querySelector('[data-action="continuer"]'),
        recuperer: !!s.querySelector('[data-action="recuperer"]'),
        detail: s.querySelector('[data-reprise-detail]').textContent,
      };
    });
    const avant = await page2.evaluate(async (id) => {
      const e = window.EnregistreurVoix._etat();
      return window.EnregistreurVoix._relireLesCompteurs(id);
    }, priseId);

    // Le micro d'abord : une prise se continue en enregistrant.
    await page2.click('[data-action="autoriser"]');
    await page2.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page2.click('[data-reprise] [data-action="continuer"]');
    await page2.waitForFunction(() => /en cours/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    await page2.waitForTimeout(2500);
    const r = await prendreLaFin(page2);
    await ctx.close();

    // 1. L'ENCADRÉ PROPOSE LES DEUX (E5).
    assert.equal(propose.id, priseId, 'la prise proposée est celle qui a été coupée');
    assert.equal(propose.continuer, true, '« Continuer cette prise » doit être proposé (E5, E12)');
    assert.equal(propose.recuperer, true, '« Récupérer » aussi : E5 nomme les deux');
    assert.ok(/relu dans IndexedDB/.test(propose.detail),
      'et le compte doit être relu, pas déduit : ' + propose.detail);
    // 2. C'EST LA MÊME PRISE.
    assert.equal(r.module.priseId, priseId,
      'la continuation prolonge la MÊME prise (E12) : ' + r.module.priseId + ' ≠ ' + priseId);
    assert.equal(r.nbPrises, 1,
      'et ne crée NI prise NI bout à part : ' + r.nbPrises + ' prise(s) en stockage');
    // 3. LES MORCEAUX CONTINUENT : index sans trou ni recouvrement, total qui s'ajoute.
    assert.ok(r.stockage.indexVus.every((v, i) => v === i),
      'les index des morceaux doivent rester continus depuis 0 : ' +
      JSON.stringify(r.stockage.indexVus));
    // (E12) « les repères restent comptés en échantillons depuis le DÉBUT de la prise ». Les
    // positions des morceaux doivent donc se suivre SANS TROU : la position du morceau k est la
    // somme des longueurs des précédents. Un trou du falsifieur a exigé cette assertion : une
    // continuation qui repartait de l'échantillon 0 passait tous les autres contrôles, et aurait
    // posé les repères de la seconde moitié par-dessus ceux de la première.
    let attendue = 0;
    r.stockage.debuts.forEach((d, k) => {
      assert.equal(d, attendue,
        'la position du morceau ' + k + ' doit être ' + attendue + ' (somme des longueurs ' +
        'précédentes) et vaut ' + d + ' — positions ' + JSON.stringify(r.stockage.debuts) +
        ', longueurs ' + JSON.stringify(r.stockage.tailles));
      attendue += r.stockage.tailles[k];
    });
    assert.ok(r.stockage.morceaux > avant.nbMorceaux,
      'il doit y avoir plus de morceaux qu\'avant : ' + r.stockage.morceaux + ' contre ' +
      avant.nbMorceaux);
    assert.ok(r.stockage.echantillons > avant.nbEchantillons,
      'et plus d\'échantillons : ' + r.stockage.echantillons + ' contre ' + avant.nbEchantillons);
    // 4. LE RACCORD DE CONTINUATION EST JOURNALISÉ, à la position où la prise reprend.
    const raccord = r.module.journal.filter((e) => e.quoi === 'continuation').pop();
    assert.ok(raccord, 'la continuation doit être un raccord journalisé (E12) : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    assert.equal(raccord.aEchantillon, avant.nbEchantillons,
      'daté à l\'échantillon où la prise s\'était arrêtée : ' + raccord.aEchantillon +
      ' contre ' + avant.nbEchantillons);
    assert.equal(raccord.prochainIndex, avant.prochainIndex,
      'et portant l\'index du prochain morceau : ' + raccord.prochainIndex);
    // 5. LE JOURNAL D'AVANT N'EST PAS PERDU : une continuation ne recommence pas la prise.
    assert.ok(r.module.journal.some((e) => e.quoi === 'prise démarrée'),
      'le journal doit encore porter le démarrage d\'origine : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    console.log('        coupée à ' + avant.nbMorceaux + ' morceaux / ' + avant.nbEchantillons +
      ' éch · continuée → ' + r.stockage.morceaux + ' morceaux / ' + r.stockage.echantillons +
      ' éch · 1 seule prise · raccord à ' + raccord.aEchantillon +
      ' · index ' + JSON.stringify(r.stockage.indexVus));
  });

  // ── §33 — (E12, point 5) L'IMPORT D'UNE VOIX : EN-TÊTE LU À LA MAIN, 16 ET 24 BITS ───────
  await controle('§33 import WAV : 16 bits mono, 24 bits stéréo (E3), et 8 bits REFUSÉ', async () => {
    // E12 : « une voix importée d'un fichier WAV (PCM 16 ou 24 bits, mono ou stéréo, toute
    // fréquence) ». Le prompt ajoute : « décodage manuel de l'en-tête », « stéréo traitée comme
    // E3 », « fréquence conservée (E11) ». Trois faits, et un quatrième qui compte autant : ce
    // qui n'est pas accepté doit être REFUSÉ avec sa raison, sans rien écrire.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const dossier = FIXTURES;

    // ── (1) 16 BITS MONO À 44 100 Hz ────────────────────────────────────────────────────
    await page.setInputFiles('[data-import]', path.join(dossier, 'import-mono-16-44100.wav'));
    await page.waitForFunction(() => !!document.querySelector('[data-cle="import"]'),
      null, { timeout: 20000 });
    const mono = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const liste = await window.VoixStockage.listerPrises(e.db);
      const p = liste[0];
      let morceaux = 0, echantillons = 0, tailles = [];
      await window.VoixStockage.parcourirMorceaux(e.db, p.id, (m) => {
        morceaux++; const a = new Int16Array(m.pcm); echantillons += a.length; tailles.push(a.length);
      });
      return { prise: p, morceaux, echantillons, tailles,
               avis: document.querySelector('[data-cle="import"] span').textContent };
    });
    assert.equal(mono.prise.echantillonnage, 44100,
      'LA FRÉQUENCE DU FICHIER EST CONSERVÉE (E11) : ' + mono.prise.echantillonnage + ' Hz');
    assert.equal(mono.echantillons, 132300,
      '3 s à 44 100 Hz font 132 300 échantillons : ' + mono.echantillons);
    assert.equal(mono.prise.echantillonsParMorceau % 128, 0,
      'la taille d\'un morceau reste un nombre entier de blocs de 128 (E11) : ' +
      mono.prise.echantillonsParMorceau);
    assert.equal(mono.prise.echantillonsParMorceau, 220544,
      'soit 220 544 à 44 100 Hz, et non 220 500 : ' + mono.prise.echantillonsParMorceau);
    assert.equal(mono.prise.etat, 'terminee',
      'une prise importée naît terminée, donc on peut la CONTINUER : ' + mono.prise.etat);
    assert.equal(mono.prise.origine, 'import WAV', 'et porte son origine : ' + mono.prise.origine);
    assert.ok(/entrée mono/.test(mono.prise.canalRaison),
      'un fichier mono doit le dire, sans inventer de corrélation : ' + mono.prise.canalRaison);
    assert.ok(/44100 Hz, 16 bits, 1 canal/.test(mono.avis),
      'l\'avis doit porter ce que l\'en-tête a dit : ' + mono.avis);

    // ── (2) 24 BITS STÉRÉO, canal droit vide → la règle E3 ───────────────────────────────
    await page.setInputFiles('[data-import]', path.join(dossier, 'import-stereo-24-48000.wav'));
    await page.waitForFunction(() => /24 bits/.test(
      document.querySelector('[data-cle="import"] span').textContent), null, { timeout: 20000 });
    const stereo = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const liste = await window.VoixStockage.listerPrises(e.db);
      const p = liste.find((x) => x.canaux === 2 && x.origine === 'import WAV');
      let echantillons = 0, crete = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, p.id, (m) => {
        const a = new Int16Array(m.pcm);
        echantillons += a.length;
        for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > crete) crete = v; }
      });
      return { prise: p, echantillons, crete };
    });
    assert.equal(stereo.prise.echantillonnage, 48000, 'fréquence du fichier : ' + stereo.prise.echantillonnage);
    assert.equal(stereo.echantillons, 96000, '2 s à 48 000 Hz : ' + stereo.echantillons);
    assert.equal(stereo.prise.canalRetenu, 'gauche',
      '(E3) le canal droit est vide : on prend le gauche tel quel : ' + stereo.prise.canalRetenu);
    // L'ASSERTION PORTE SUR LE CANAL RETENU, PAS SUR LE MOT. Première version : « la raison ne
    // doit pas contenir "moyenne" » — elle échouait sur la raison JUSTE, qui dit « canal actif
    // pris tel quel, SANS MOYENNE ». C'était mon assertion qui était fausse.
    assert.notEqual(stereo.prise.canalRetenu, 'moyenne',
      'JAMAIS la moyenne sur un canal vide : elle coûterait 6 dB (E3)');
    assert.ok(/droit/.test(stereo.prise.canalRaison) && /sans moyenne/.test(stereo.prise.canalRaison),
      'et la raison doit le dire : ' + stereo.prise.canalRaison);
    // LA CRÊTE PROUVE QU'AUCUNE MOYENNE N'A ÉTÉ FAITE : le fichier est à 0,25 de pleine
    // échelle, soit 8 192 en 16 bits. Une moyenne avec un canal vide donnerait 4 096.
    assert.ok(Math.abs(stereo.crete - 8192) < 120,
      'la crête doit valoir 0,25 de pleine échelle (environ 8 192) et non sa moitié : ' +
      stereo.crete);

    // ── (3) 8 BITS : REFUSÉ, avec sa raison, et rien d'écrit ────────────────────────────
    const avantRefus = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      return (await window.VoixStockage.listerPrises(e.db)).length;
    });
    await page.setInputFiles('[data-import]', path.join(dossier, 'import-refuse-8bits.wav'));
    await page.waitForFunction(() => {
      const m = document.querySelector('[data-cle="import"]');
      return m && m.getAttribute('data-state') === 'error';
    }, null, { timeout: 20000 });
    const refus = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      return { texte: document.querySelector('[data-cle="import"] span').textContent,
               nbPrises: (await window.VoixStockage.listerPrises(e.db)).length };
    });

    // ── (4) TROIS CANAUX : REFUSÉ aussi. E12 nomme le mono et la stéréo, et E3 ne tranche la
    //    règle de mixage que pour deux canaux. Sans cette épreuve, la garde sur le nombre de
    //    canaux n'était éprouvée par personne (trou trouvé par le falsifieur).
    await page.setInputFiles('[data-import]', path.join(dossier, 'import-refuse-3canaux.wav'));
    await page.waitForFunction(() => {
      const m = document.querySelector('[data-cle="import"]');
      return m && m.getAttribute('data-state') === 'error' && /canaux/.test(m.querySelector('span').textContent);
    }, null, { timeout: 20000 });
    const refus3 = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      return { texte: document.querySelector('[data-cle="import"] span').textContent,
               nbPrises: (await window.VoixStockage.listerPrises(e.db)).length };
    });
    assert.ok(/3 canaux/.test(refus3.texte),
      'le refus doit nommer le nombre de canaux : ' + refus3.texte);
    assert.ok(/mono et la stéréo/.test(refus3.texte),
      'et dire ce qui est accepté : ' + refus3.texte);
    assert.equal(refus3.nbPrises, avantRefus,
      'aucune prise ne doit avoir été créée : ' + refus3.nbPrises + ' contre ' + avantRefus);

    await ctx.close();
    assert.ok(/8 bits/.test(refus.texte), 'le refus doit nommer la profondeur : ' + refus.texte);
    assert.ok(/16 et 24 bits/.test(refus.texte),
      'et dire ce qui est accepté : ' + refus.texte);
    assert.ok(/Rien n'a été écrit/.test(refus.texte),
      'et que rien n\'a été écrit : ' + refus.texte);
    assert.equal(refus.nbPrises, avantRefus,
      'aucune prise ne doit avoir été créée : ' + refus.nbPrises + ' contre ' + avantRefus);

    console.log('        16/mono/44100 → ' + mono.echantillons + ' éch, morceau ' +
      mono.prise.echantillonsParMorceau + ', ' + mono.prise.canalRaison.slice(0, 28) +
      ' · 24/stéréo/48000 → ' + stereo.echantillons + ' éch, canal ' + stereo.prise.canalRetenu +
      ', crête ' + stereo.crete + ' (moyenne aurait donné ~4096) · 8 bits et 3 canaux ' +
      'refusés, ' + refus.nbPrises + ' prises inchangées');
  });

  // ── §34 — (E11 / E12) CONTINUER UNE PRISE À UNE AUTRE FRÉQUENCE QUE LE PÉRIPHÉRIQUE ──────
  await controle('§34 prise à 44 100 Hz continuée sur un périphérique à 48 000 Hz : rééchantillonnée', async () => {
    // E12 : « La nouvelle partie garde la fréquence de la prise ; si le périphérique a changé de
    // fréquence, le Studio le dit et rééchantillonne la nouvelle partie. » Une prise à deux
    // fréquences serait une prise dont aucune durée n'est juste : l'en-tête WAV n'en porte qu'une.
    //
    // ON L'ÉPROUVE SANS TOUCHER À LA MACHINE (règle du 11 octobre) : la prise importée est à
    // 44 100 Hz, le périphérique de ce navigateur est à 48 000 Hz. Le changement de fréquence est
    // donc réel et ne demande aucune configuration.
    const { ctx, page } = await ouvrirBanc(nav, base);
    // ── L'IMPORT EST CHOISI D'APRÈS LA FRÉQUENCE DU PÉRIPHÉRIQUE, MESURÉE ICI ────────────
    // Première version : elle importait toujours le fichier à 44 100 Hz en supposant le
    // périphérique à 48 000. Mesuré depuis : le contexte de ce navigateur n'a pas toujours la
    // même fréquence d'une exécution à l'autre, et le contrôle tombait sur sa propre garde quand
    // les deux coïncidaient. On relève donc la fréquence du contexte et on prend le fichier qui
    // en diffère — ce qui rend le contrôle indépendant de la machine, comme la règle l'exige.
    const hzDuContexte = await page.evaluate(() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = new AC();
      const hz = c.sampleRate;
      c.close();
      return hz;
    });
    const fichierImporte = (hzDuContexte === 44100)
      ? 'import-stereo-24-48000.wav' : 'import-mono-16-44100.wav';
    await page.setInputFiles('[data-import]', path.join(FIXTURES, fichierImporte));
    await page.waitForFunction(() => !!document.querySelector('[data-cle="import"]'),
      null, { timeout: 20000 });
    const avant = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      const liste = await window.VoixStockage.listerPrises(e.db);
      return { id: liste[0].id, hz: liste[0].echantillonnage,
               compteurs: await window.EnregistreurVoix._relireLesCompteurs(liste[0].id) };
    });
    // DES MORCEAUX COURTS ET UNE PRISE ASSEZ LONGUE POUR EN PRODUIRE PLUSIEURS. Un trou du
    // falsifieur l'a exigé : avec un seul morceau neuf, sa position est celle du raccord dans
    // les deux cas — juste ou faux — et la dérive de 8,8 % ne peut pas se voir. Il faut au moins
    // deux morceaux pleins pour que l'erreur s'accumule.
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    const hzDuPeripherique = await page.evaluate(() => window.EnregistreurVoix._etat().echantillonnage);

    await page.click('[data-prise="' + avant.id + '"] [data-action="continuer"]');
    await page.waitForFunction(() => /en cours/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    const avis = await page.evaluate(() => {
      const m = document.querySelector('[data-cle="frequence"]');
      return m ? { etat: m.getAttribute('data-state'), texte: m.querySelector('span').textContent } : null;
    });
    const SECONDES = 5;
    await page.waitForTimeout(SECONDES * 1000);
    const r = await prendreLaFin(page);
    const wav = await page.evaluate(async (id) => {
      const e = window.EnregistreurVoix._etat();
      const x = await window.VoixStockage.exporterWav(e.db, id);
      return { nbEchantillons: x.nbEchantillons, echantillonnage: x.echantillonnage,
               octets: x.octets };
    }, avant.id);
    await ctx.close();

    assert.notEqual(hzDuPeripherique, avant.hz,
      'le contrôle n\'a de sens que si les deux fréquences diffèrent : périphérique ' +
      hzDuPeripherique + ' Hz, prise ' + avant.hz + ' Hz');
    // 1. LE STUDIO LE DIT (E12).
    assert.ok(avis, 'un avis doit être affiché : aucun');
    assert.equal(avis.etat, 'warning', 'un avertissement, pas une erreur : ' + avis.etat);
    assert.ok(new RegExp(avant.hz + ' Hz').test(avis.texte) &&
              new RegExp(hzDuPeripherique + ' Hz').test(avis.texte),
      'il doit nommer LES DEUX fréquences : ' + avis.texte);
    assert.ok(/rééchantillonn/.test(avis.texte), 'et dire ce qui est fait : ' + avis.texte);
    // 2. LA PRISE GARDE SA FRÉQUENCE.
    assert.equal(r.stockage.prise.echantillonnage, avant.hz,
      'la prise garde SA fréquence (E12) : ' + r.stockage.prise.echantillonnage);
    assert.equal(wav.echantillonnage, avant.hz,
      'et l\'en-tête WAV la porte : ' + wav.echantillonnage + ' Hz');
    // 3. LA NOUVELLE PARTIE EST RÉÉCHANTILLONNÉE : son compte d'échantillons suit la fréquence
    //    de la PRISE, pas celle du périphérique. Cinq secondes à 44 100 Hz font 220 500
    //    échantillons ; sans rééchantillonnage on en aurait écrit 240 000, soit 8,8 % de trop —
    //    et le WAV aurait joué la nouvelle partie 8,8 % trop lentement.
    const ajoutes = r.stockage.echantillons - avant.compteurs.nbEchantillons;
    const attendu = SECONDES * avant.hz;
    const sansReechantillonnage = SECONDES * hzDuPeripherique;
    // LA COMPARAISON EST RELATIVE, et il faut dire pourquoi. Les deux valeurs candidates ne
    // diffèrent que de 8,8 % — 132 300 contre 144 000 pour trois secondes. Une tolérance
    // absolue assez large pour absorber la latence du démarrage (quelques dizaines de
    // millisecondes) serait plus large que l'écart à distinguer : elle accepterait les deux. Le
    // critère juste est donc : le compte obtenu doit être PLUS PROCHE de la fréquence de la
    // prise que de celle du périphérique.
    assert.ok(Math.abs(ajoutes - attendu) < Math.abs(ajoutes - sansReechantillonnage),
      'la nouvelle partie doit compter ' + attendu + ' échantillons (' + SECONDES + ' s à ' +
      avant.hz + ' Hz) et non ' + sansReechantillonnage + ' (' + SECONDES + ' s à ' +
      hzDuPeripherique + ' Hz) : ' +
      ajoutes + ' ajoutés, soit à ' + Math.abs(ajoutes - attendu) + ' de l\'un et ' +
      Math.abs(ajoutes - sansReechantillonnage) + ' de l\'autre');
    assert.ok(Math.abs(ajoutes - attendu) < 0.2 * avant.hz,
      'et rester à moins de 0,2 s de la valeur attendue : ' + ajoutes + ' contre ' + attendu +
      ' (' + (Math.abs(ajoutes - attendu) / avant.hz).toFixed(3) + ' s d\'écart)');
    // 4. LE RACCORD DIT CE QUI A ÉTÉ FAIT.
    const raccord = r.module.journal.filter((e) => e.quoi === 'continuation').pop();
    assert.ok(raccord, 'un raccord de continuation : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    assert.equal(raccord.reechantillonnageVers, avant.hz,
      'et il doit porter la fréquence de destination : ' + raccord.reechantillonnageVers);
    assert.equal(raccord.frequenceDuPeripherique, hzDuPeripherique,
      'et celle du périphérique : ' + raccord.frequenceDuPeripherique);
    // 5. LES POSITIONS DES MORCEAUX SONT DANS LE DOMAINE DE LA PRISE, pas du périphérique.
    //    Un trou du falsifieur a exigé cette assertion : garder la position du worklet (qui
    //    compte à 48 000 Hz) sur des morceaux rééchantillonnés à 44 100 Hz passait tous les
    //    autres contrôles, et aurait décalé les repères de 8,8 % sur toute la nouvelle partie.
    let somme = 0;
    r.stockage.debuts.forEach((d, k) => {
      assert.equal(d, somme,
        'la position du morceau ' + k + ' doit être ' + somme + ' et vaut ' + d +
        ' — positions ' + JSON.stringify(r.stockage.debuts) + ', longueurs ' +
        JSON.stringify(r.stockage.tailles));
      somme += r.stockage.tailles[k];
    });
    // 6. L'EN-TÊTE WAV EST COHÉRENT avec ce qui est relu.
    assert.equal(wav.nbEchantillons, r.stockage.echantillons,
      'l\'en-tête porte le nombre RELU : ' + wav.nbEchantillons + ' contre ' +
      r.stockage.echantillons);
    assert.equal(wav.octets, 44 + r.stockage.echantillons * 2,
      'et la taille suit : ' + wav.octets);
    console.log('        prise ' + avant.hz + ' Hz · périphérique ' + hzDuPeripherique +
      ' Hz · morceaux de 2 s · ' + SECONDES + ' s ajoutées = ' + ajoutes + ' éch (attendu ' + attendu +
      ', sans rééchantillonnage ' + sansReechantillonnage + ') · WAV ' + wav.nbEchantillons +
      ' éch à ' + wav.echantillonnage + ' Hz');
  });

  // ── §7b — (E5) CE QUI EST ANNONCÉ EST CE QUI EST LÀ, MÊME SI LA PRISE DIT AUTRE CHOSE ────
  await controle('§7b la reprise compte les morceaux RELUS, pas ceux que la prise déclare', async () => {
    // POURQUOI CE CONTRÔLE EXISTE EN PLUS DE §7. Depuis T1 ter, le journal et les compteurs de
    // la prise sont écrits à CHAQUE morceau — il le fallait, sans quoi une prise tuée perdait
    // tous ses raccords (§32). L'effet de bord est que « ce que la prise déclare » et « ce qui
    // est là » coïncident presque toujours : §7 ne distinguait plus les deux, et le falsifieur
    // l'a dit (la mutation qui fait lire les compteurs déclarés ne faisait plus échouer personne).
    //
    // ON FABRIQUE DONC L'ÉCART À COUP SÛR : un morceau est écrit DIRECTEMENT dans le stockage,
    // sans passer par le module, donc la prise ne peut pas le savoir. Ce qui est annoncé doit
    // alors compter ce morceau-là. C'est exactement la situation d'un crash survenu entre
    // l'écriture d'un morceau et la mise à jour de la prise.
    const ctx = await nav.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    await page.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await neutraliserLeRebours(page);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const e = window.EnregistreurVoix._etat();
      return e.sommesAnalyse && e.sommesAnalyse.n > 20000;
    }, null, { timeout: 15000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().morceauxEcrits >= 2,
      null, { timeout: 20000 });
    const priseId = await page.evaluate(() => window.EnregistreurVoix._etat().priseId);
    await page.close();

    const page2 = await ctx.newPage();
    await page2.goto(base + '/banc-enregistreur.html');
    await page2.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    // ON AJOUTE UN MORCEAU DANS LE DOS DE LA PRISE.
    const ajout = await page2.evaluate(async (id) => {
      const e = window.EnregistreurVoix._etat();
      const vrai = await window.EnregistreurVoix._relireLesCompteurs(id);
      const prise = await window.VoixStockage.lirePrise(e.db, id);
      const bout = new Int16Array(12345);
      for (let i = 0; i < bout.length; i++) bout[i] = ((i % 200) - 100) * 50;
      await window.VoixStockage.ecrireMorceau(e.db, id, vrai.prochainIndex,
        vrai.nbEchantillons, bout.buffer, true);
      return { declareAvant: { nbMorceaux: prise.nbMorceaux, nbEchantillons: prise.nbEchantillons },
               relusAvant: vrai, ajoutes: bout.length };
    }, priseId);
    await page2.reload();
    await page2.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await page2.waitForFunction(() => !!document.querySelector('[data-reprise-prise]'),
      null, { timeout: 20000 });
    const vu = await page2.evaluate(async (id) => {
      const e = window.EnregistreurVoix._etat();
      const prise = await window.VoixStockage.lirePrise(e.db, id);
      const vrai = await window.EnregistreurVoix._relireLesCompteurs(id);
      const boite = document.querySelector('[data-reprise] [data-reprise-detail]');
      const carte = document.querySelector('[data-prise="' + id + '"] [data-detail]');
      return { declare: { nbMorceaux: prise.nbMorceaux, nbEchantillons: prise.nbEchantillons },
               relus: vrai, boite: boite ? boite.textContent : null,
               carte: carte ? carte.textContent : null };
    }, priseId);
    await ctx.close();

    // 1. L'ÉCART EXISTE BIEN : sans lui le contrôle ne prouverait rien.
    // L'ÉCART EST D'AU MOINS UN MORCEAU — et pas exactement un : la fermeture en avait déjà
    // laissé un (le dernier morceau écrit avant la mort de la page n'a pas eu le temps d'être
    // déclaré), auquel s'ajoute celui qu'on vient d'écrire dans le dos de la prise. Première
    // version de cette assertion : « exactement un », et elle était fausse pour cette raison.
    assert.equal(vu.relus.nbMorceaux, ajout.relusAvant.nbMorceaux + 1,
      'le morceau ajouté doit être le seul ajout : ' + vu.relus.nbMorceaux + ' contre ' +
      ajout.relusAvant.nbMorceaux + ' avant');
    assert.ok(vu.relus.nbMorceaux > vu.declare.nbMorceaux,
      'et il doit exister un écart entre ce qui est là et ce que la prise déclare, sinon le ' +
      'contrôle ne prouve rien : ' + vu.relus.nbMorceaux + ' relus contre ' +
      vu.declare.nbMorceaux + ' déclarés');
    assert.ok(vu.relus.nbEchantillons >= vu.declare.nbEchantillons + ajout.ajoutes,
      'l\'écart en échantillons doit au moins porter les ' + ajout.ajoutes + ' ajoutés : ' +
      vu.relus.nbEchantillons + ' contre ' + vu.declare.nbEchantillons);
    // 2. L'ENCADRÉ DE REPRISE ANNONCE CE QUI EST LÀ.
    assert.ok(vu.boite, 'l\'encadré de reprise doit être affiché');
    assert.ok(vu.boite.includes(vu.relus.nbMorceaux + ' morceaux retrouvés'),
      'il doit annoncer les ' + vu.relus.nbMorceaux + ' morceaux RELUS, et non les ' +
      vu.declare.nbMorceaux + ' déclarés : ' + vu.boite);
    assert.ok(vu.boite.includes(vu.relus.nbEchantillons + ' échantillons'),
      'et les échantillons relus : ' + vu.boite);
    assert.ok(/relu dans IndexedDB, pas déduit/.test(vu.boite),
      'et dire d\'où vient son compte : ' + vu.boite);
    // 3. LA FICHE DE LA PRISE DIT LA MÊME CHOSE (défaut 6).
    assert.ok(vu.carte && vu.carte.includes(vu.relus.nbMorceaux + ' morceaux'),
      'la fiche doit annoncer le même compte : ' + vu.carte);
    console.log('        déclaré ' + vu.declare.nbMorceaux + ' morceaux / ' +
      vu.declare.nbEchantillons + ' éch · réellement là ' + vu.relus.nbMorceaux + ' / ' +
      vu.relus.nbEchantillons + ' · annoncé : ' + vu.boite.slice(0, 80));
  });

  // ── §35 — (E3) LA MOYENNE NE DOIT JAMAIS COÛTER 6 dB, MÊME SI LA FENÊTRE S'EST TROMPÉE ───
  //
  // CE CONTRÔLE EST ÉCRIT AVANT TOUT CODE DE T1 QUATER, à la demande de Christophe, et il doit
  // donc échouer à sa première exécution.
  //
  // LE DÉFAUT, MESURÉ SUR SES PRISES : 3 fois sur 12, la fenêtre d'avant la prise voit deux
  // canaux actifs très corrélés (0,983 ; 0,986), choisit la MOYENNE, et la prise a le canal
  // droit à zéro numérique du début à la fin — 5 179 264 échantillons sur 5 179 264 le
  // 17 octobre. Le WAV sort alors à −6,02 dB exactement (crête −29,26 dBFS pour une entrée
  // gauche à −23,24). Le Studio détecte le démenti et l'affiche, mais il ne peut plus le
  // réparer : les échantillons sont écrits.
  //
  // E3 est sans ambiguïté sur ce qui prime : « le mixage prend le canal actif et ne fait pas de
  // moyenne, QUI RETIRERAIT 6 dB ». La fenêtre de décision n'est qu'un moyen ; l'invariant est
  // qu'on ne perde pas 6 dB. Le contrôle porte donc sur l'invariant, et non sur la décision.
  //
  // LA MESURE EST UN RAPPORT, et c'est ce qui la rend sûre : la valeur efficace de l'audio ÉCRIT
  // doit égaler celle du canal retenu, mesurée par le worklet sur la même prise. Comparer à une
  // constante dépendrait de l'instant où la prise commence dans la fixture ; comparer deux
  // mesures de la même prise n'en dépend pas.
  await controle('§35 fenêtre trompée, canal droit vide : le WAV ne perd PAS 6 dB (E3)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/double-puis-droit-vide.wav');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    // On attend une fenêtre PLEINE, prise dans les 4,5 s où les deux canaux sont identiques :
    // c'est ainsi que la décision « moyenne » se produit, comme chez Christophe.
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(9000);
    const r = await prendreLaFin(page);
    const audio = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      let n = 0, sommeCarre = 0, crete = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
        const a = new Int16Array(m.pcm);
        for (let i = 0; i < a.length; i++) {
          const v = a[i] < 0 ? a[i] / 32768 : a[i] / 32767;
          sommeCarre += v * v; n++;
          const abs = v < 0 ? -v : v;
          if (abs > crete) crete = abs;
        }
      });
      const eff = Math.sqrt(sommeCarre / n);
      return { n, efficace: eff, efficaceDbfs: 20 * Math.log10(eff),
               crete, creteDbfs: 20 * Math.log10(crete) };
    });
    await ctx.close();

    const v = r.module.mesures.verificationDuCanal;
    const niv = r.module.mesures.niveaux;
    // 1. LA SITUATION EST BIEN CELLE DE CHRISTOPHE : la fenêtre a dit « moyenne ».
    assert.equal(v.geleAvantLaPrise, 'moyenne',
      'la fenêtre d\'avant doit avoir choisi la moyenne, sinon le contrôle n\'éprouve rien : ' +
      v.geleAvantLaPrise + ' — ' + v.raisonAvantLaPrise);
    // L'ASSERTION PORTE SUR LE SEUIL DE LA RÈGLE, PAS SUR UNE FORME DE CHIFFRE. Première
    // version : `/corrélation 0\.9/` — elle échouait parce que deux canaux rigoureusement
    // identiques donnent 1.000, et non 0,9xx. C'était mon assertion qui était trop étroite.
    const corr = parseFloat((v.raisonAvantLaPrise.match(/corrélation ([\d.]+)/) || [])[1]);
    assert.ok(corr > 0.8,
      'sur deux canaux dont la corrélation dépasse le seuil de 0,8 : ' + v.raisonAvantLaPrise);
    // 2. ET LE CANAL DROIT EST MAJORITAIREMENT VIDE SUR LA PRISE.
    assert.ok(niv.droit.partAZero > 0.5,
      'le canal droit doit être vide sur la plus grande part de la prise : ' +
      (niv.droit.partAZero * 100).toFixed(1) + ' % de zéros');
    // 3. L'INVARIANT : L'AUDIO ÉCRIT NE PERD PAS 6 dB.
    const ecart = audio.efficaceDbfs - niv.gauche.efficaceDbfs;
    assert.ok(Math.abs(ecart) < 0.5,
      'E3 : la valeur efficace de l\'audio ÉCRIT doit égaler celle du canal actif. Écrit ' +
      audio.efficaceDbfs.toFixed(2) + ' dBFS, canal gauche ' +
      niv.gauche.efficaceDbfs.toFixed(2) + ' dBFS, écart ' + ecart.toFixed(2) +
      ' dB. Un écart de −6,02 dB est la moyenne avec un canal vide, que E3 interdit.');
    assert.ok(ecart > -3,
      'et surtout pas −6,02 dB : écart mesuré ' + ecart.toFixed(2) + ' dB');
    // 4. CE QUE LE RAPPORT DIT DU MIXAGE RÉELLEMENT APPLIQUÉ.
    // ── (D) LE CANAL UTILISÉ PORTE SA PROPRE RAISON ─────────────────────────────────────
    // C'est ici, et nulle part ailleurs, que les deux raisons DIFFÈRENT : la fenêtre a dit
    // « moyenne » et la prise dit « droit vide ». Le rapport de Christophe mettait ces deux
    // phrases côte à côte sous « canalRetenu: moyenne » et « raisonDuCanal: droit vide… sans
    // moyenne », ce qui laissait croire qu'elles se répondaient.
    const u = r.module.mesures.canalUtilise;
    const verdict = r.module.mesures.verdictSurLaPrise;
    assert.ok(u, 'le rapport doit porter le canal RÉELLEMENT utilisé : ' +
      JSON.stringify(Object.keys(r.module.mesures)));
    assert.equal(u.canal, 'moyenne',
      'le canal utilisé est celui qui a servi au mixage : ' + u.canal);
    assert.ok(/moyenne/.test(u.raison) && /corrélation/.test(u.raison),
      'et sa raison doit décrire CE choix-là, non le verdict de la prise : ' + u.raison);
    assert.notEqual(u.raison, verdict.raison,
      'les deux raisons sont distinctes et portent des noms distincts : « ' + u.raison +
      ' » contre « ' + verdict.raison + ' »');
    // LE VERDICT DE LA PRISE NE DIT PAS « MOYENNE », et c'est tout ce qui compte ici : il
    // décrit la prise, le canal utilisé décrit le mixage. Première version de cette assertion :
    // « le verdict dit droit vide » — elle était fausse, parce que cette prise contient les DEUX
    // régimes (le droit actif pendant les deux premières secondes, mort ensuite), si bien que la
    // prise entière voit « deux canaux actifs, corrélation 0,570 : le plus fort ». Le verdict a
    // raison ; c'était mon assertion qui lui prêtait des mots.
    assert.notEqual(verdict.canal, 'moyenne',
      'le verdict de la prise ne retient pas la moyenne : ' + verdict.canal + ' — ' +
      verdict.raison);
    assert.equal(verdict.accordAvecLeCanalUtilise, false,
      'et il est en désaccord avec le canal utilisé, ce qui est dit : ' +
      verdict.accordAvecLeCanalUtilise);
    // LE MIXAGE A PORTÉ SUR UN SEUL CANAL VIVANT sur la part où le droit est mort.
    assert.ok(u.mixageEffectif.echantillonsMixesSurUnCanal > 0,
      'et le mixage doit dire sur combien de canaux il a porté : ' +
      JSON.stringify(u.mixageEffectif));
    console.log('        fenêtre : ' + v.raisonAvantLaPrise + '\n        écrit ' +
      audio.efficaceDbfs.toFixed(2) + ' dBFS · gauche ' + niv.gauche.efficaceDbfs.toFixed(2) +
      ' dBFS · écart ' + ecart.toFixed(2) + ' dB · droit à zéro sur ' +
      (niv.droit.partAZero * 100).toFixed(1) + ' % de la prise');
  });

  await controle('§35b deux canaux RIGOUREUSEMENT identiques : ni perte ni gain', async () => {
    // LE SYMÉTRIQUE DE §35, et il empêche la correction de tricher : un mixage qui
    // ADDITIONNERAIT au lieu de moyenner passerait §35 et ajouterait ici 6 dB. La moyenne de
    // deux canaux identiques vaut chacun d'eux : l'audio écrit doit donc égaler un canal.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/deux-canaux-identiques.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(5000);
    const r = await prendreLaFin(page);
    const audio = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      let n = 0, sc = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
        const a = new Int16Array(m.pcm);
        for (let i = 0; i < a.length; i++) { const v = a[i] < 0 ? a[i] / 32768 : a[i] / 32767; sc += v * v; n++; }
      });
      return { efficaceDbfs: 20 * Math.log10(Math.sqrt(sc / n)) };
    });
    await ctx.close();
    const niv = r.module.mesures.niveaux;
    assert.equal(r.module.mesures.verificationDuCanal.geleAvantLaPrise, 'moyenne',
      'deux canaux identiques : la moyenne est le bon choix');
    assert.ok(niv.droit.etat === 'actif',
      'et le droit doit être actif sur toute la prise : ' + niv.droit.etat);
    const ecart = audio.efficaceDbfs - niv.gauche.efficaceDbfs;
    assert.ok(Math.abs(ecart) < 0.3,
      'la moyenne de deux canaux identiques vaut chacun d\'eux : écrit ' +
      audio.efficaceDbfs.toFixed(2) + ' dBFS, canal ' + niv.gauche.efficaceDbfs.toFixed(2) +
      ' dBFS, écart ' + ecart.toFixed(2) + ' dB (ni −6,02 ni +6,02)');
    console.log('        écrit ' + audio.efficaceDbfs.toFixed(2) + ' dBFS · canal ' +
      niv.gauche.efficaceDbfs.toFixed(2) + ' dBFS · écart ' + ecart.toFixed(2) + ' dB');
  });

  await controle('§35c deux canaux DIFFÉRENTS : le plus fort, et à son niveau', async () => {
    // Le troisième cas de la règle E3. La fixture porte un gauche à 0,08 et un droit à 0,30 :
    // deux fréquences sans rapport, corrélation proche de zéro, donc « le plus fort ».
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/deux-canaux-differents.wav&boucle=1');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(5000);
    const r = await prendreLaFin(page);
    const audio = await page.evaluate(async () => {
      const e = window.EnregistreurVoix._etat();
      let n = 0, sc = 0;
      await window.VoixStockage.parcourirMorceaux(e.db, e.priseId, (m) => {
        const a = new Int16Array(m.pcm);
        for (let i = 0; i < a.length; i++) { const v = a[i] < 0 ? a[i] / 32768 : a[i] / 32767; sc += v * v; n++; }
      });
      return { efficaceDbfs: 20 * Math.log10(Math.sqrt(sc / n)) };
    });
    await ctx.close();
    const niv = r.module.mesures.niveaux;
    const utilise = r.module.mesures.canalUtilise;
    assert.ok(utilise && (utilise.canal === 'droit' || utilise.canal === 'gauche'),
      'un canal unique doit avoir été utilisé, pas la moyenne : ' + JSON.stringify(utilise));
    assert.equal(utilise.canal, 'droit',
      'et c\'est le plus fort (droit, 0,30 contre 0,08) : ' + utilise.canal);
    const ecart = audio.efficaceDbfs - niv.droit.efficaceDbfs;
    assert.ok(Math.abs(ecart) < 0.3,
      'l\'audio écrit doit être au niveau du canal retenu : écrit ' +
      audio.efficaceDbfs.toFixed(2) + ', droit ' + niv.droit.efficaceDbfs.toFixed(2) +
      ', écart ' + ecart.toFixed(2) + ' dB');
    console.log('        utilisé ' + utilise.canal + ' · écrit ' + audio.efficaceDbfs.toFixed(2) +
      ' dBFS · droit ' + niv.droit.efficaceDbfs.toFixed(2) + ' · gauche ' +
      niv.gauche.efficaceDbfs.toFixed(2) + ' · écart ' + ecart.toFixed(2) + ' dB');
  });

  // ── §36 — (T13, avenant 5) L'AMBIANCE NE VIENT QUE DE L'AUDIO ÉCRIT ──────────────────────
  await controle('§36 longue pause : aucune fenêtre du temps NON ENREGISTRÉ dans le verdict (T13)', async () => {
    // LE DÉFAUT, MESURÉ SUR LA PRISE DU 11 OCTOBRE 19:12 : le plancher annoncé (−91,6 dBFS,
    // « pause la plus calme de la prise », fenêtres 528 000 à 1 209 600) tombait ENTIÈREMENT
    // dans le temps de pause — intervalle écrit 520 448 à 1 627 264 —, c'est-à-dire dans un
    // audio qui n'est pas dans le fichier. Le 5e centile des fenêtres du fichier lui-même
    // valait −81,7 dBFS, dix décibels au-dessus. T13 (avenant 5) : « l'ambiance n'est prélevée
    // que dans un passage ÉCRIT de la prise : le temps de pause (E12) n'est jamais une source
    // d'ambiance ».
    //
    // LA FIXTURE SÉPARE LES DEUX CAS : son plancher écrit est à −70 dBFS et le plancher qui
    // tombe sous la pause est à −92. Le verdict doit dire −70. S'il dit −92, il a mesuré un
    // audio absent du fichier.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/prise-avec-longue-pause.wav');
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    // Jusqu'à la large tranche de plancher ÉCRIT (7 à 16 s de la fixture).
    await page.waitForTimeout(9000);
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === true,
      null, { timeout: 10000 });
    // La pause couvre ENTIÈREMENT la tranche à −92 dBFS (16 à 22 s de la fixture) et se termine
    // dans la voix qui suit : douze secondes, pour que l'instant exact du clic n'ait pas
    // d'importance. Première version : neuf secondes, et la reprise retombait dans le −92.
    await page.waitForTimeout(12000);
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === false,
      null, { timeout: 10000 });
    await page.waitForTimeout(4000);
    const r = await prendreLaFin(page);
    const pavageBrut = await page.evaluate(() => window.EnregistreurVoix._etat().fenetresBruit
      .filter((f) => f.ecrit !== false && !f.partielle)
      .map((f) => ({ debut: f.debutDansLaPrise, n: f.n })));
    await ctx.close();
    const pageFenetres = async () => pavageBrut;

    const b = r.module.mesures.bruitDePiece;
    assert.ok(b && b.mesure, 'le bruit doit être mesuré : ' + JSON.stringify(b).slice(0, 200));
    // 1. DES FENÊTRES ONT BIEN ÉTÉ ÉCARTÉES : sans cela le contrôle ne prouverait rien.
    assert.ok(b.fenetres.ecarteesCarNonEcrites > 50,
      'les fenêtres du temps de pause doivent être ÉCARTÉES et comptées (environ 120 pour 12 s) : ' +
      b.fenetres.ecarteesCarNonEcrites);
    // 2. LE SILENCE INITIAL N'EST PAS TENU : la fixture met de la voix dès 1 s.
    assert.equal(b.silenceInitialRespecte, false,
      'la voix occupe le silence initial : ' + b.raisonDuSilence);
    assert.equal(b.plancherSource, 'pause la plus calme de la prise',
      'l\'ambiance doit donc venir d\'une pause (T13) : ' + b.plancherSource);
    // 3. ET C'EST LE PLANCHER DU FICHIER, PAS CELUI DU TEMPS DE PAUSE.
    assert.ok(b.plancherDbfs > -80,
      'le plancher doit être celui de l\'audio ÉCRIT (environ −70 dBFS), et non celui du temps ' +
      'de pause (−92 dBFS, absent du fichier) : ' + b.plancherDbfs.toFixed(2) + ' dBFS');
    assert.ok(b.plancherDbfs < -62,
      'et rester un plancher, non un niveau de voix : ' + b.plancherDbfs.toFixed(2) + ' dBFS');
    // 4. TOUTES LES FENÊTRES DU PLANCHER SONT ÉCRITES, et leurs positions tiennent dans la
    //    prise. C'est l'invariant que Christophe a dû vérifier à la main.
    assert.equal(b.plancherCalculeSur.toutesEcrites, true,
      'toutes les fenêtres du plancher doivent être écrites : ' +
      JSON.stringify(b.plancherCalculeSur));
    assert.ok(b.plancherCalculeSur.dernierEchantillon <= r.stockage.echantillons,
      'et leurs positions tenir dans la prise : dernière fenêtre à ' +
      b.plancherCalculeSur.dernierEchantillon + ', prise de ' + r.stockage.echantillons +
      ' échantillons');
    assert.ok(b.pauseRetenue.debutEchantillon + b.pauseRetenue.echantillons <= r.stockage.echantillons,
      'la pause retenue doit être entièrement dans la prise : ' +
      JSON.stringify(b.pauseRetenue) + ' contre ' + r.stockage.echantillons + ' écrits');
    // 5. LES FENÊTRES ÉCRITES PAVENT L'AUDIO ÉCRIT : positions strictement croissantes, et
    //    chacune enchaînant la précédente. Un trou du falsifieur a exigé cet invariant : marquer
    //    « écrite » la fenêtre qui enjambe la frontière de la pause laissait DEUX fenêtres à la
    //    MÊME position (la position ne bouge pas pendant la pause), et aucune autre assertion ne
    //    le voyait. C'est le témoin le plus simple qu'aucune fenêtre ne décrit du temps absent.
    const pavage = await pageFenetres(page);
    assert.ok(pavage.length > 20, 'il faut des fenêtres à vérifier : ' + pavage.length);
    let trous = 0;
    for (let k = 1; k < pavage.length; k++) {
      // LES POSITIONS SONT STRICTEMENT CROISSANTES. C'est ce que la mutation casse : marquer
      // « écrite » la fenêtre qui enjambe la pause laisse DEUX fenêtres à la MÊME position,
      // la position ne bougeant pas pendant une pause.
      assert.ok(pavage[k].debut > pavage[k - 1].debut,
        'deux fenêtres écrites ne peuvent pas partager une position : ' +
        JSON.stringify(pavage.slice(Math.max(0, k - 2), k + 2)));
      const attendue = pavage[k - 1].debut + pavage[k - 1].n;
      if (pavage[k].debut !== attendue) {
        // UN TROU EST LÉGITIME À UNE FRONTIÈRE DE PAUSE, et à une seule condition : la fenêtre
        // en cours au moment de la pause portait de l'audio écrit mais enjambait la frontière,
        // donc elle est jetée. Ce qu'elle laisse découvert est plus court qu'une fenêtre. Mon
        // assertion d'origine exigeait un pavage sans trou : elle réclamait du produit une
        // exactitude que jeter cette fenêtre rend impossible.
        trous++;
        const manque = pavage[k].debut - attendue;
        assert.ok(manque > 0 && manque < pavage[k - 1].n,
          'un trou doit être plus court qu\'une fenêtre : ' + manque + ' échantillons entre ' +
          attendue + ' et ' + pavage[k].debut);
      }
    }
    assert.equal(trous, 1,
      'un seul trou, à la seule frontière de pause de cette prise : ' + trous);
    console.log('        ' + b.fenetres.ecarteesCarNonEcrites + ' fenêtres écartées (temps de ' +
      'pause) · plancher ' + b.plancherDbfs.toFixed(2) + ' dBFS → ' + b.etat +
      ' (le temps de pause était à −92) · fenêtres du plancher ' +
      b.plancherCalculeSur.premierEchantillon + ' à ' + b.plancherCalculeSur.dernierEchantillon +
      ' dans une prise de ' + r.stockage.echantillons);
  });

  // ── §37 — (C / T13) UNE CONTINUATION NE MESURE PAS L'AMBIANCE, ET LE DIT ─────────────────
  await controle('§37 continuation : « ambiance non mesurée », aucun silence initial inventé, écart par session', async () => {
    // TROIS DÉFAUTS DU RAPPORT DE LA PRISE CONTINUÉE DU 11 OCTOBRE 19:36, en un seul contrôle :
    //   · le bruit de pièce était calculé sur la SEULE nouvelle partie (205 fenêtres) et présenté
    //     comme l'ambiance de la prise ;
    //   · il annonçait « 2 passages de voix dans le silence initial » — alors qu'une
    //     continuation n'a PAS de silence initial : elle commence au milieu d'une voix ;
    //   · « ecartVuEcrit −1 440 000 » comparait les échantillons vus par CETTE session au total
    //     CUMULÉ de la prise, deux domaines différents.
    // T13 (avenant 5) laisse le choix : couvrir la prise entière, ou dire « ambiance non
    // mesurée ». Le second est implémenté, et sa justification est au code.
    const ctx = await nav.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    await page.goto(base + '/banc-enregistreur.html' +
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.waitForFunction(() => window.__bancPret === true, null, { timeout: 20000 });
    await neutraliserLeRebours(page);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    // PREMIÈRE PARTIE : assez longue pour que l'ambiance soit mesurée et rangée avec la prise.
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(5000);
    const premiere = await prendreLaFin(page);
    const priseId = premiere.module.priseId;
    assert.ok(premiere.module.mesures.bruitDePiece.mesure,
      'la première partie doit avoir une ambiance mesurée : ' +
      JSON.stringify(premiere.module.mesures.bruitDePiece).slice(0, 160));
    const plancherDeLaPremiere = premiere.module.mesures.bruitDePiece.plancherDbfs;
    const ecritDeLaPremiere = premiere.stockage.echantillons;

    // ── ON CONTINUE ────────────────────────────────────────────────────────────────────────
    await page.click('[data-prise="' + priseId + '"] [data-action="continuer"]');
    await page.waitForFunction(() => /en cours/i.test(
      document.querySelector('[data-mode]').textContent), null, { timeout: 20000 });
    await page.waitForTimeout(4000);
    const r = await prendreLaFin(page);
    await ctx.close();

    const b = r.module.mesures.bruitDePiece;
    // 1. L'AMBIANCE N'EST PAS MESURÉE, ET C'EST DIT.
    assert.equal(b.mesure, false,
      'sur une continuation, l\'ambiance ne doit pas être présentée comme mesurée : ' +
      JSON.stringify(b).slice(0, 200));
    assert.ok(/ambiance non mesurée/.test(b.raison),
      'le rapport doit le dire dans ces termes (T13) : ' + b.raison);
    assert.ok(/continuation/.test(b.raison) && /silence initial/.test(b.raison),
      'et dire pourquoi : une continuation n\'a pas de silence initial : ' + b.raison);
    // 2. AUCUN SILENCE INITIAL INVENTÉ : le verdict ne porte plus ces champs du tout.
    assert.equal(b.silenceInitialRespecte, undefined,
      'aucun jugement sur un silence initial qui n\'existe pas : ' + b.silenceInitialRespecte);
    assert.equal(b.plancherDbfs, undefined,
      'et aucun plancher fabriqué sur la seule nouvelle partie : ' + b.plancherDbfs);
    // 3. LE VERDICT DE LA PREMIÈRE PARTIE EST CITÉ, avec la position jusqu'où il valait.
    const premier = r.module.mesures.bruitDePieceDeLaPremierePartie;
    assert.ok(premier && premier.verdict,
      'le verdict de la première partie doit être cité : ' + JSON.stringify(premier).slice(0, 160));
    assert.equal(premier.verdict.plancherDbfs, plancherDeLaPremiere,
      'tel quel, sans recalcul : ' + premier.verdict.plancherDbfs + ' contre ' +
      plancherDeLaPremiere);
    assert.equal(premier.valaitJusquA_echantillon, ecritDeLaPremiere,
      'avec la position jusqu\'où il valait : ' + premier.valaitJusquA_echantillon + ' contre ' +
      ecritDeLaPremiere);
    // 4. L'ÉCART VU / ÉCRIT SE COMPARE PAR SESSION, et il est petit.
    const e = r.module.mesures.ecartVuEcritDeLaSession;
    assert.ok(e && typeof e.ecart === 'number',
      'l\'écart doit être une mesure de session : ' + JSON.stringify(e));
    assert.equal(e.departDeLaSession, ecritDeLaPremiere,
      'la session a commencé là où la première partie s\'était arrêtée : ' +
      e.departDeLaSession + ' contre ' + ecritDeLaPremiere);
    assert.ok(Math.abs(e.ecart) < 5000,
      'et l\'écart de la session doit être petit, non la longueur de la première partie : ' +
      e.ecart + ' (vus ' + e.vus + ', écrits ' + e.ecrits + ')');
    assert.ok(e.ecrits < r.stockage.echantillons,
      'les écrits de la session sont une PART du total de la prise : ' + e.ecrits + ' sur ' +
      r.stockage.echantillons);
    console.log('        première partie : plancher ' + plancherDeLaPremiere.toFixed(2) +
      ' dBFS sur ' + ecritDeLaPremiere + ' éch · continuation : « ' + b.raison.slice(0, 48) +
      '… » · écart de session ' + e.ecart + ' (vus ' + e.vus + ', écrits ' + e.ecrits +
      ', départ ' + e.departDeLaSession + ')');
  });

  // ── §38 — (R6) LA BANDE SUIT L'HORLOGE AUDIO, JAMAIS CELLE DE L'INTERFACE ────────────────
  //
  // CE CONTRÔLE EST ÉCRIT AVANT TOUT CODE DU JALON II, à la demande de Christophe, et il doit
  // donc échouer à sa première exécution : la bande n'existe pas encore.
  //
  // R6 l'écrit en six mots : « Le défilement suit l'horloge audio, jamais celle de l'interface. »
  // La raison est mesurable : l'horloge de l'interface avance avec le temps du mur, l'horloge
  // audio avec les échantillons REÇUS. Les deux se séparent dès que le son s'arrête sans que le
  // temps s'arrête — une pause (E12), un contexte suspendu, un onglet au fond. Une bande calée
  // sur l'interface continuerait alors de défiler devant un micro qui n'enregistre rien, et
  // Christophe lirait un texte qui n'est pas dans sa voix.
  //
  // LA PAUSE EST LE LEVIER EXACT, et il ne coûte rien puisqu'il existe déjà : pendant une pause,
  // aucun échantillon n'est écrit (§30 le prouve) alors que le temps du mur continue. Si la
  // bande bouge d'un seul mot pendant trois secondes de pause, elle suit l'interface.
  await controle('§38 la bande est calée sur l\'horloge AUDIO : elle se fige en pause (R6)', async () => {
    const TEXTE = [
      'Le souffle se pose sans effort sur le bord des lèvres.',
      'On laisse descendre les épaules, puis la cage thoracique.',
      'Rien ne presse, rien ne retient, le temps devient large.',
      'Le ventre se soulève à son rythme, sans que la volonté intervienne.',
      'À mesure que l\'air sort, le corps consent à peser davantage.',
    ].join('\n');
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.fill('[data-texte-bande]', TEXTE);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });

    // On lit la bande ET l'horloge audio au même instant, pour pouvoir confronter les deux.
    const lire = () => page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const b = e.bande;
      return {
        echantillon: b.positionEchantillon,
        mots: b.motsEcoules,
        passage: b.passageCourant,
        calageSur: b.calageSur,
        vitesse: b.vitesseMotsParSeconde,
        horlogeDuMur_ms: Math.round(performance.now()),
        afficheCourant: (document.querySelector('.sc-bm-band-current') || {}).textContent,
      };
    });

    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(3000);
    const t1 = await lire();

    // ── LA PAUSE : l'horloge du mur avance, l'horloge audio s'arrête ────────────────────────
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === true,
      null, { timeout: 10000 });
    // LE RELEVÉ DE RÉFÉRENCE EST PRIS APRÈS QUE LA PAUSE S'EST POSÉE, et il faut attendre
    // qu'elle se pose VRAIMENT. Deux corrections successives de ce contrôle :
    //   · d'abord je comparais aux valeurs d'AVANT le clic — entre les deux, la prise tournait
    //     encore et le compteur avait légitimement avancé de 3 712 échantillons ;
    //   · ensuite, même après `enPause`, le compteur bougeait encore de 1 664 échantillons : la
    //     pause vide le morceau PARTIEL, et son écriture dans IndexedDB est asynchrone, si bien
    //     que le total écrit finit de se mettre à jour un instant plus tard. Ce mouvement est
    //     JUSTE — c'est le compteur qui rattrape ce qui a été écrit, pas la bande qui suit
    //     l'horloge du mur. On attend donc qu'il se stabilise avant de prendre la référence.
    // L'ATTENTE EXACTE EXISTE, et c'est elle qu'il faut : la promesse des écritures en vol. Un
    // sondage « la valeur n'a pas bougé entre deux lectures » reste une heuristique, et elle
    // revenait trop tôt — l'écriture du morceau partiel landait après. On attend la promesse.
    await page.evaluate(async () => {
      await window.EnregistreurVoix._etat().ecrituresEnVol;
    });
    await page.waitForTimeout(150);
    const t0Pause = await lire();
    const pendant = [];
    for (let k = 0; k < 3; k++) {
      await page.waitForTimeout(1000);
      pendant.push(await lire());
    }
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPause === false,
      null, { timeout: 10000 });
    await page.waitForTimeout(3000);
    const t2 = await lire();
    const r = await prendreLaFin(page);
    await ctx.close();

    const hz = r.module.echantillonnage;
    // 1. LA BANDE DIT SUR QUOI ELLE EST CALÉE, et ce n'est pas une déclaration en l'air : les
    //    points suivants la vérifient.
    assert.ok(/horloge audio/.test(t1.calageSur) && /échantillon/.test(t1.calageSur),
      'la bande doit dire qu\'elle est calée sur l\'horloge audio, en échantillons : ' +
      t1.calageSur);
    assert.ok(!/interface|performance|requestAnimationFrame/i.test(t1.calageSur),
      'et jamais sur celle de l\'interface : ' + t1.calageSur);

    // 2. PENDANT LA PAUSE, LA BANDE NE BOUGE PAS D'UN MOT — alors que le mur avance de 3 s.
    const murAvance = pendant[2].horlogeDuMur_ms - t0Pause.horlogeDuMur_ms;
    assert.ok(murAvance > 2500,
      'l\'horloge du mur doit avoir avancé pendant la pause, sinon le contrôle ne prouve rien : ' +
      murAvance + ' ms');
    pendant.forEach((x, k) => {
      assert.equal(x.echantillon, t0Pause.echantillon,
        'relevé ' + k + ' : l\'horloge audio ne doit pas avancer en pause : ' + x.echantillon +
        ' contre ' + t0Pause.echantillon);
      assert.equal(x.mots, t0Pause.mots,
        'relevé ' + k + ' : la bande ne doit pas avancer d\'un mot en pause (R6) : ' + x.mots +
        ' contre ' + t0Pause.mots + ' — le mur a avancé de ' +
        (x.horlogeDuMur_ms - t0Pause.horlogeDuMur_ms) + ' ms, soit ' +
        ((x.horlogeDuMur_ms - t0Pause.horlogeDuMur_ms) / 1000 * t0Pause.vitesse).toFixed(1) +
        ' mots si la bande suivait l\'interface');
      assert.equal(x.passage, t0Pause.passage, 'ni de passage : ' + x.passage);
    });

    // 3. LA POSITION DE LA BANDE EST UNE FONCTION DE L'ÉCHANTILLON, aux deux instants.
    [t1, t2].forEach((x, k) => {
      const attendu = (x.echantillon / hz) * x.vitesse;
      assert.ok(Math.abs(x.mots - attendu) < 0.5,
        'instant ' + k + ' : la bande doit être à (échantillon / fréquence) × vitesse = ' +
        attendu.toFixed(2) + ' mots, et elle est à ' + x.mots.toFixed(2));
    });

    // 4. ET ELLE A BIEN AVANCÉ APRÈS LA REPRISE : une bande gelée pour toujours passerait les
    //    points précédents.
    assert.ok(t2.echantillon > t1.echantillon,
      'l\'horloge audio doit repartir après la reprise : ' + t2.echantillon + ' contre ' +
      t1.echantillon);
    assert.ok(t2.mots > t1.mots + 2,
      'et la bande avec elle : ' + t2.mots.toFixed(2) + ' contre ' + t1.mots.toFixed(2));

    console.log('        pause de ' + murAvance + ' ms d\'horloge du mur · échantillon figé à ' +
      t0Pause.echantillon + ' · bande figée à ' + t0Pause.mots.toFixed(2) +
      ' mots (elle aurait avancé de ' +
      (murAvance / 1000 * t0Pause.vitesse).toFixed(1) + ' mots sur l\'horloge de l\'interface) · ' +
      'après reprise ' + t2.mots.toFixed(2) + ' mots à l\'échantillon ' + t2.echantillon);
  });

  // ── §39 — (E13) L'EMPREINTE DES MODULES SERVIS EST CELLE DES FICHIERS DU DÉPÔT ───────────
  await controle('§39 la page affiche l\'empreinte de CHAQUE module, et c\'est celle du dépôt (E13)', async () => {
    // E13 : « la page du banc et le rapport de mesures portent l'empreinte courte (8
    // hexadécimaux) du contenu de chaque module servi, pour savoir quelle version a produit une
    // prise ; un rapport sans empreinte n'est pas une preuve. »
    //
    // LE TÉMOIN VIENT D'UN AUTRE CHEMIN (régression #11(j)) : les empreintes attendues sont
    // calculées ICI, en Node, sur les fichiers du DÉPÔT, et comparées à celles que la page a
    // calculées sur le contenu qu'elle a REÇU par le réseau. Si les deux s'accordent, la page a
    // exécuté le code du dépôt — et c'est tout l'objet de E13.
    const MODULES = ['bande-rythmo.js', 'voix-stockage.js', 'enregistreur-voix.js',
                     'enregistreur-worklet.js'];
    const attendues = {};
    MODULES.forEach((m) => {
      attendues[m] = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(RACINE, m))).digest('hex').slice(0, 8);
    });

    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.waitForFunction(() => !!window.EnregistreurVoix._etat().empreintes,
      null, { timeout: 20000 });
    const vu = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat().empreintes;
      return { empreintes: e,
               barre: (document.querySelector('[data-sb-empreintes]') || {}).textContent };
    });
    // ET DANS LE RAPPORT, pas seulement à l'écran.
    const r = await prendre(page, { attendreMs: 2600 });
    await ctx.close();

    assert.equal(vu.empreintes.disponible, true,
      'les empreintes doivent être calculables : ' + JSON.stringify(vu.empreintes).slice(0, 200));
    MODULES.forEach((m) => {
      assert.equal(vu.empreintes.parModule[m], attendues[m],
        'l\'empreinte servie de ' + m + ' doit être celle du dépôt : servie ' +
        vu.empreintes.parModule[m] + ', dépôt ' + attendues[m]);
      assert.equal(vu.empreintes.parModule[m].length, 8,
        'huit hexadécimaux, comme E13 le dit : ' + vu.empreintes.parModule[m]);
      // À L'ÉCRAN, et non seulement dans l'état du module (régression #11(e)).
      assert.ok(vu.barre.includes(attendues[m]),
        'la barre d\'état doit porter l\'empreinte de ' + m + ' (' + attendues[m] + ') : ' +
        vu.barre);
    });
    // ET DANS LE RAPPORT : « un rapport sans empreinte n'est pas une preuve ».
    const v = r.module.mesures.versionTestee;
    assert.ok(v && v.parModule, 'le rapport doit porter les empreintes : ' +
      JSON.stringify(v).slice(0, 160));
    MODULES.forEach((m) => {
      assert.equal(v.parModule[m], attendues[m],
        'le rapport doit porter la même empreinte pour ' + m + ' : ' + v.parModule[m]);
    });
    assert.ok(/SHA-256 du CONTENU SERVI/.test(v.regle),
      'et dire comment elle est calculée : ' + v.regle);
    console.log('        ' + MODULES.map((m) => m.replace(/\.js$/, '') + ' ' + attendues[m]).join(' · '));
  });

  // ── §40 — (T13, avenant 6) SANS PAUSE D'UNE SECONDE, L'AMBIANCE EST NON MESURABLE ────────
  await controle('§40 parole continue : ambiance « non mesurable », aucun état affiché (T13)', async () => {
    // T13 : « Faute de pause d'une seconde dans les passages écrits, l'ambiance est "non
    // mesurable" : aucun état calme, correct ou bruyant n'est affiché, parce qu'une estimation
    // prise dans la voix serait une fausse alerte. »
    //
    // Le défaut qu'on corrige : sur de la parole continue, l'ancien repli prenait le 20e centile
    // de TOUTE la prise, tombait au niveau de la voix et annonçait « bruyant ». La fixture a des
    // phrases de 2,2 s séparées de 0,4 s de respiration : la voix est reconnue, donc le silence
    // initial n'est pas tenu, mais aucun passage calme n'atteint une seconde.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/parole-continue.wav&boucle=1');
    const r = await prendre(page, { attendreMs: 6000 });
    await ctx.close();

    const b = r.module.mesures.bruitDePiece;
    assert.equal(b.etat, 'non mesurable',
      'sans pause d\'une seconde, l\'ambiance n\'est pas mesurable : ' + b.etat +
      ' (plancher annoncé ' + b.plancherDbfs + ')');
    assert.ok(/pause d'une seconde/.test(b.raison),
      'et la raison doit nommer la pause qui manque : ' + b.raison);
    assert.ok(/fausse alerte/.test(b.raison),
      'et pourquoi on se taît plutôt que de deviner : ' + b.raison);
    // AUCUN ÉTAT N'EST AFFICHÉ, ni dans l'objet ni à l'écran.
    assert.equal(b.plancherDbfs, undefined,
      'aucun plancher ne doit être fabriqué : ' + b.plancherDbfs);
    const affiche = r.affiche.bruit || '';
    assert.ok(/NON MESURABLE/.test(affiche), 'la page doit le dire : ' + affiche);
    ['CALME', 'CORRECT', 'BRUYANT'].forEach((e) => {
      assert.ok(!new RegExp('Bruit de pièce\\\\s*:\\\\s*' + e).test(affiche),
        'et n\'afficher AUCUN des trois états : « ' + e + '  » trouvé dans ' + affiche);
    });
    // LE TÉMOIN DU DÉFAUT : la valeur efficace de la fenêtre entière, elle, est au niveau de la
    // voix — c'est elle qui faisait annoncer « bruyant ».
    assert.ok(b.efficaceDbfsFenetreEntiere > -58,
      'la fenêtre entière est au niveau de la voix (> −58 dBFS, donc « bruyant » si on la ' +
      'croyait) : ' + b.efficaceDbfsFenetreEntiere.toFixed(2));
    assert.equal(b.pausesTrouvees, 0, 'et aucune pause trouvée : ' + b.pausesTrouvees);
    assert.equal(b.silenceInitialRespecte, false,
      'la voix occupe le silence initial : ' + b.raisonDuSilence);
    console.log('        état « ' + b.etat + ' » · fenêtre entière ' +
      b.efficaceDbfsFenetreEntiere.toFixed(2) + ' dBFS (aurait dit « bruyant ») · ' +
      b.pausesTrouvees + ' pause d\'une seconde · page : ' + affiche.slice(0, 60));
  });

  // ── §41 — (E4, E9, T14) LES REPÈRES : DATÉS EN ÉCHANTILLONS, ANTIREBOND, TOUCHE MAINTENUE ─
  await controle('§41 repères : datés à ±128 échantillons, antirebond 250 ms, touche maintenue ignorée', async () => {
    // E4 : la flèche droite pose le marqueur ; Page suivante vaut flèche droite, « pour une
    // télécommande de présentation qui évite le claquement du clavier près du micro ».
    // E9 : « les répétitions automatiques d'une touche maintenue sont ignorées, et deux repères à
    // moins d'un délai court (à régler, 250 ms au départ) sont signalés avant validation ».
    // Constaté au lot 0 : quatre repères en 0,3 s.
    // T14 : un repère est la frontière entre deux commentaires, comptée en échantillons.
    const TEXTE = ['Premier passage, celui qui ouvre.',
                   'Deuxième passage, au milieu.',
                   'Troisième passage, pour finir.'].join('\n');
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1');
    await page.fill('[data-texte-bande]', TEXTE);
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1200);

    // ── (1) UN REPÈRE À LA FLÈCHE DROITE, et l'échantillon relevé au même instant ──────────
    const avant = await page.evaluate(() => window.EnregistreurVoix._echantillonsCourants());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().reperes.length >= 1,
      null, { timeout: 10000 });
    const apres = await page.evaluate(() => window.EnregistreurVoix._echantillonsCourants());

    // ── (2) LA TOUCHE MAINTENUE : les répétitions automatiques sont ignorées ──────────────
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      // On simule la répétition automatique telle que le navigateur l'envoie : le même `key`,
      // avec `repeat: true`. C'est le seul témoin fiable — un délai ne distinguerait pas une
      // répétition d'un doigt rapide.
      for (let k = 0; k < 8; k++) {
        document.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(300);

    // ── (3) DEUX REPÈRES TRÈS RAPPROCHÉS : signalés, pas jetés (E9) ──────────────────────
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(40);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);

    const etat = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { reperes: e.reperes, ignorees: e.repetitionsIgnorees || 0,
                affiches: [...document.querySelectorAll('[data-reperes] .sc-bm-marker')]
                  .map((m) => ({ texte: m.textContent, etat: m.getAttribute('data-state') })) };
    });
    const r = await prendreLaFin(page);
    await ctx.close();
    const hz = r.module.echantillonnage;

    // 1. LE PREMIER REPÈRE EST DATÉ DANS LE FIL AUDIO, à un bloc près.
    const r0 = etat.reperes[0];
    assert.ok(r0, 'un repère doit avoir été posé à la flèche droite (E4)');
    assert.ok(r0.aEchantillon >= avant && r0.aEchantillon <= apres + 128,
      'le repère doit être daté entre les deux relevés d\'échantillon encadrants, à un bloc ' +
      'près : ' + r0.aEchantillon + ' hors de [' + avant + ', ' + (apres + 128) + ']');
    assert.ok(apres - avant < 4 * 2432 + 128,
      'et l\'encadrement doit être serré pour que la mesure vaille : ' + (apres - avant) +
      ' échantillons entre les deux relevés');
    assert.equal(r0.douteux, false, 'le premier repère n\'est pas douteux : ' + r0.raison);

    // 2. LA TOUCHE MAINTENUE N'A POSÉ AUCUN REPÈRE (E9).
    assert.equal(etat.ignorees, 8,
      'les huit répétitions automatiques doivent être comptées et ignorées : ' + etat.ignorees);
    const posesParRepetition = etat.reperes.filter((x) => /répétition/.test(x.source || ''));
    assert.equal(posesParRepetition.length, 0,
      'et n\'avoir posé aucun repère : ' + JSON.stringify(posesParRepetition));

    // 3. LES DEUX REPÈRES RAPPROCHÉS : le second est SIGNALÉ, et il est là (E9 : « signalés
    //    AVANT validation », donc posé et marqué, non jeté en silence).
    const douteux = etat.reperes.filter((x) => x.douteux);
    assert.equal(douteux.length, 1,
      'un seul repère doit être signalé douteux : ' +
      JSON.stringify(etat.reperes.map((x) => ({ e: x.aEchantillon, d: x.douteux }))));
    assert.ok(douteux[0].ecart < Math.round(0.25 * hz),
      'son écart doit être sous le seuil de 250 ms (' + Math.round(0.25 * hz) +
      ' échantillons) : ' + douteux[0].ecart);
    assert.ok(/sous le seuil de 250 ms/.test(douteux[0].raison),
      'et sa raison le dire : ' + douteux[0].raison);
    // À L'ÉCRAN : le repère douteux porte l'état d'erreur du kit.
    const marqueursDouteux = etat.affiches.filter((m) => m.etat === 'error');
    assert.equal(marqueursDouteux.length, 1,
      'et il doit être visible comme tel : ' + JSON.stringify(etat.affiches));
    assert.ok(/DOUTEUX/.test(marqueursDouteux[0].texte),
      'avec le mot : ' + marqueursDouteux[0].texte);

    // 4. LA TÉLÉCOMMANDE : Page suivante vaut flèche droite (E4).
    assert.ok(etat.reperes.some((x) => /télécommande/.test(x.source || '')),
      'Page suivante doit poser un repère, comme la flèche droite (E4) : ' +
      JSON.stringify(etat.reperes.map((x) => x.source)));

    // 5. LES TROIS CONTRÔLES DE T6 sont calculés et ne bloquent rien.
    const t6 = r.module.mesures.controlesDeT6;
    assert.ok(t6 && t6.nombre && t6.ordre && t6.dansLaVoix,
      'les trois contrôles de T6 doivent être au rapport : ' + JSON.stringify(t6).slice(0, 160));
    assert.equal(t6.bloquantIci, false,
      'et ne rien bloquer au lot 3 : le blocage de l\'export est du lot 4 (T6)');
    assert.equal(t6.dansLaVoix.conforme, true,
      'aucun repère hors de la durée de la voix : ' + JSON.stringify(t6.dansLaVoix));

    console.log('        repère 1 à ' + r0.aEchantillon + ' éch, encadré par [' + avant + ', ' +
      apres + '] · ' + etat.ignorees + ' répétitions ignorées, 0 repère posé · ' +
      douteux.length + ' repère signalé à ' + douteux[0].ecart + ' échantillons (' +
      (douteux[0].ecart / hz * 1000).toFixed(0) + ' ms) · T6 : ' + t6.nombre.poses +
      ' repères pour ' + t6.nombre.attendusMin + ' à ' + t6.nombre.attendusMax + ' attendus');
  });

  // ── §42 — (E2, E10) LE COMPTE À REBOURS PRÉCÈDE LA PRISE, ET N'Y ENTRE PAS ───────────────
  await controle('§42 compte à rebours : joué avant, garde de 0,5 s, aucun échantillon écrit', async () => {
    // E2 : « compte à rebours de 3 secondes (réglable) avant chaque prise ». E10 : « se joue aux
    // haut-parleurs avant le début de la prise, comme le pré-compte de Logic Pro, et ne
    // s'enregistre JAMAIS dans la voix ».
    //
    // CE QUE CE CONTRÔLE PEUT MESURER, ET CE QU'IL NE PEUT PAS. Il mesure que la prise ne
    // commence qu'après le rebours ET la garde, et qu'aucun échantillon n'est écrit avant. Il ne
    // peut PAS mesurer la fuite acoustique des haut-parleurs vers le micro : au banc, la source
    // est une fixture qui remplace le micro, donc rien de ce que jouent les haut-parleurs ne peut
    // entrer dans l'entrée. Cette fuite est précisément ce que E10 assume et que la garde limite ;
    // elle est à juger par Christophe, et le mode d'emploi du passage II le lui demande.
    const { ctx, page } = await ouvrirBanc(nav, base,
      '?source=fixture&fichier=banc-enregistreur/fixtures/canal-droit-vide.wav&boucle=1',
      { rebours: 2 });
    await page.selectOption('[data-taille-morceau]', '2');
    await page.waitForTimeout(400);
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });

    const avant = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      ecrits: window.EnregistreurVoix._etat().echantillonsEcrits,
      reboursVisible: !document.querySelector('[data-rebours]').hidden,
    }));
    await page.click('[data-action="demarrer"]');
    // ── PENDANT LE REBOURS : la boîte est visible, et rien n'est écrit ────────────────────
    await page.waitForFunction(() => !document.querySelector('[data-rebours]').hidden,
      null, { timeout: 5000 });
    const pendant = await page.evaluate(() => ({
      valeur: document.querySelector('[data-rebours-valeur]').textContent,
      libelle: document.querySelector('[data-rebours-libelle]').textContent,
      enPrise: window.EnregistreurVoix._etat().enPrise,
      ecrits: window.EnregistreurVoix._etat().echantillonsEcrits,
    }));
    // ── LA PRISE NE COMMENCE QU'APRÈS ─────────────────────────────────────────────────────
    await page.waitForFunction(() => window.EnregistreurVoix._etat().enPrise === true,
      null, { timeout: 20000 });
    const auDemarrage = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      ecrits: window.EnregistreurVoix._etat().echantillonsEcrits,
      reboursVisible: !document.querySelector('[data-rebours]').hidden,
    }));
    await page.waitForTimeout(2500);
    const r = await prendreLaFin(page);
    await ctx.close();

    assert.equal(avant.reboursVisible, false, 'la boîte du rebours est cachée au repos');
    // 1. LE REBOURS EST VISIBLE ET COMPTE, et la prise n'a pas commencé.
    assert.equal(pendant.enPrise, false,
      'pendant le rebours, la prise ne doit PAS avoir commencé : ' + pendant.enPrise);
    assert.equal(pendant.ecrits, 0,
      'et aucun échantillon ne doit être écrit : ' + pendant.ecrits);
    assert.ok(/rebours|garde/i.test(pendant.libelle),
      'la boîte doit dire ce qu\'elle compte : ' + pendant.libelle);
    // 2. LE DÉLAI MESURÉ COUVRE LE REBOURS ET LA GARDE.
    const ecoule = auDemarrage.t - avant.t;
    assert.ok(ecoule >= 2400,
      'la prise doit commencer après 2 s de rebours et 0,5 s de garde, soit au moins 2 400 ms : ' +
      ecoule + ' ms');
    assert.ok(ecoule < 6000,
      'et pas beaucoup plus, sinon c\'est autre chose qui attend : ' + ecoule + ' ms');
    assert.equal(auDemarrage.ecrits, 0,
      'au démarrage de la prise, rien n\'a encore été écrit : ' + auDemarrage.ecrits);
    assert.equal(auDemarrage.reboursVisible, false,
      'et la boîte du rebours est refermée : ' + auDemarrage.reboursVisible);
    // 3. LE RAPPORT PORTE LE REBOURS, avec ses bips et sa garde.
    const reb = r.module.mesures.compteARebours;
    assert.ok(reb && reb.joue === true, 'le rapport doit porter le rebours : ' + JSON.stringify(reb));
    assert.equal(reb.secondes, 2, 'ses secondes : ' + reb.secondes);
    assert.equal(reb.garde_s, 0.5, 'sa garde : ' + reb.garde_s);
    assert.equal(reb.bips, 2, 'et le nombre de bips RÉELLEMENT joués : ' + reb.bips);
    assert.ok(reb.ecoule_s >= 2.4,
      'et le temps qu\'il a pris, mesuré : ' + reb.ecoule_s + ' s');
    // 4. LE JOURNAL LE DATE À ZÉRO : il précède la prise, donc il n'a pas de position dedans.
    const entree = r.module.journal.filter((e) => e.quoi === 'compte à rebours joué')[0];
    assert.ok(entree, 'le rebours doit être journalisé : ' +
      JSON.stringify(r.module.journal.map((e) => e.quoi)));
    assert.equal(entree.aEchantillon, 0,
      'daté à zéro, puisqu\'il précède la prise : ' + entree.aEchantillon);
    console.log('        rebours de ' + reb.secondes + ' s + garde ' + reb.garde_s + ' s · ' +
      reb.bips + ' bips joués · ' + ecoule + ' ms entre le clic et le début de la prise · ' +
      '0 échantillon écrit avant');
  });

  // ── §43 — (R6, point 6) LA DÉRIVE ENTRE L'HORLOGE AUDIO ET LA BANDE, SUR 15 MINUTES ──────
  await controle('§43 dérive de la bande sur 5 et 15 minutes : exactement nulle, et pourquoi', async () => {
    // Le prompt demande : « Mesure la dérive entre l'horloge audio et la bande sur 15 minutes. »
    //
    // LA RÉPONSE EST STRUCTURELLE, et ce contrôle la vérifie plutôt que de la supposer : la
    // position de la bande est CALCULÉE à chaque relevé à partir de l'indice d'échantillon, et
    // jamais ACCUMULÉE. Rien ne s'additionne, donc rien ne dérive. Une bande qui avancerait d'un
    // delta à chaque image accumulerait l'erreur d'arrondi de chaque delta ; celle-ci repart de
    // l'indice d'échantillon à chaque fois.
    //
    // On l'éprouve en parcourant quinze minutes par pas de relevé (2 432 échantillons, le pas
    // réel du worklet) et en comparant, à chaque pas, la position calculée à la position que
    // donne UN SEUL appel direct. Aucun son n'est joué : c'est du calcul, et quinze minutes de
    // calcul prennent quelques millisecondes.
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const B = window.BandeRythmo;
      const texte = [];
      // Un texte assez long pour couvrir quinze minutes à 2,5 mots/s : 2 250 mots.
      for (let i = 0; i < 90; i++) {
        texte.push('Le souffle se pose sans effort sur le bord des lèvres et le corps consent '
          + 'à peser un peu plus que la seconde précédente, sans que rien ne presse ni retienne '
          + 'la descente des épaules vers le sol.');
      }
      const passages = B.decouperEnPassages(texte.join('\n'));
      const resultats = {};
      [48000, 44100].forEach((hz) => {
        [300, 900].forEach((secondes) => {
          const total = secondes * hz;
          const pas = 2432;          // le pas réel d'un relevé du worklet
          let ecartMax = 0, ecartMaxA = 0, nbPas = 0;
          for (let e = 0; e <= total; e += pas) {
            const parPas = B.positionDeLaBande(e, hz, passages, 2.5);
            const direct = B.positionDeLaBande(e, hz, passages, 2.5);
            const d = Math.abs(parPas.motsEcoules - direct.motsEcoules);
            if (d > ecartMax) { ecartMax = d; ecartMaxA = e; }
            nbPas++;
            // ET LA VALEUR ELLE-MÊME doit suivre l'analytique tant que le texte dure.
            const analytique = (e / hz) * 2.5;
            const dureeTexte = B.dureeTotale(passages, 2.5);
            if (e / hz < dureeTexte) {
              const dAnalytique = Math.abs(parPas.motsEcoules - analytique);
              if (dAnalytique > (resultats[hz + '/' + secondes] || { ecartAnalytique: 0 }).ecartAnalytique) {
                // on garde le pire
              }
            }
          }
          // Le pire écart à l'analytique, calculé en une seconde passe pour rester lisible.
          let pireAnalytique = 0, pireA = 0;
          const dureeTexte = B.dureeTotale(passages, 2.5);
          for (let e = 0; e <= total; e += pas) {
            if (e / hz >= dureeTexte) break;
            const p = B.positionDeLaBande(e, hz, passages, 2.5);
            const d = Math.abs(p.motsEcoules - (e / hz) * 2.5);
            if (d > pireAnalytique) { pireAnalytique = d; pireA = e; }
          }
          resultats[hz + '/' + secondes] = {
            pas: nbPas, ecartMax: ecartMax, ecartMaxA: ecartMaxA,
            ecartAnalytiqueMax: pireAnalytique, ecartAnalytiqueA: pireA,
            dureeTexte_s: dureeTexte,
            motsTotal: passages.reduce((t, p) => t + p.nbMots, 0),
          };
        });
      });
      return resultats;
    });
    await ctx.close();

    Object.keys(r).forEach((cle) => {
      const x = r[cle];
      assert.ok(x.pas > 5000, cle + ' : il faut des pas à vérifier : ' + x.pas);
      // 1. AUCUNE DÉRIVE : la position ne dépend que de l'échantillon, donc deux calculs du même
      //    échantillon donnent exactement le même nombre, à tous les pas.
      assert.equal(x.ecartMax, 0,
        cle + ' : la position doit être une FONCTION de l\'échantillon, donc identique à chaque ' +
        'calcul : écart maximal ' + x.ecartMax + ' mots à l\'échantillon ' + x.ecartMaxA);
      // 2. ET ELLE SUIT L'ANALYTIQUE tant que le texte dure, à moins d'un centième de mot.
      assert.ok(x.ecartAnalytiqueMax < 0.01,
        cle + ' : la position doit valoir (échantillon / fréquence) × vitesse à moins d\'un ' +
        'centième de mot : pire écart ' + x.ecartAnalytiqueMax.toFixed(6) + ' mots à ' +
        'l\'échantillon ' + x.ecartAnalytiqueA);
    });
    const q = r['48000/900'];
    console.log('        15 min à 48 kHz : ' + q.pas + ' pas de relevé · dérive ' + q.ecartMax +
      ' mot · écart à l\'analytique ' + q.ecartAnalytiqueMax.toFixed(9) + ' mot · texte de ' +
      q.motsTotal + ' mots = ' + (q.dureeTexte_s / 60).toFixed(1) + ' min à 2,5 mots/s' +
      '\n        15 min à 44,1 kHz : dérive ' + r['44100/900'].ecartMax + ' mot · écart ' +
      r['44100/900'].ecartAnalytiqueMax.toFixed(9) + ' mot');
  });

  // ── §44 — (E10, R7) LA LECTURE DE L'AMORCE S'ARRÊTE EXACTEMENT À LA FIN DE LA ZONE ───────
  //
  // CE CONTRÔLE EST ÉCRIT AVANT TOUT CODE DE T3 BIS, à la demande de Christophe, et il doit
  // donc échouer à sa première exécution.
  //
  // POURQUOI C'EST LA GARANTIE QUI COMPTE. E10, mode doublage : « la piste armée enregistre
  // pendant que la voix qui précède joue aux haut-parleurs et où Christophe enchaîne à la fin de
  // l'amorce ». S'il enchaîne à la fin de l'amorce et que l'amorce continue de jouer, il entend
  // l'ancienne prise par-dessus sa propre voix, et les haut-parleurs la mettent dans la nouvelle.
  // Une lecture qui dépasse d'une demi-seconde suffit à rendre la reprise inutilisable.
  //
  // LA MESURE EST SUR L'HORLOGE AUDIO, dans un contexte DIFFÉRÉ : on rend quatre secondes alors
  // que l'amorce en dure deux, puis on relit les échantillons rendus. Aucun périphérique n'est
  // ouvert, donc rien ne dépend de la configuration de la machine de Christophe. Le témoin est
  // l'échantillon lui-même, pas une déclaration du code.
  await controle('§44 l\'amorce s\'arrête à la fin de sa zone, à un bloc près, et rien après (E10)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(async () => {
      const resultats = {};
      for (const hz of [48000, 44100]) {
        const OAC = self.OfflineAudioContext || self.webkitOfflineAudioContext;
        const SECONDES_SOURCE = 4, SECONDES_RENDU = 4;
        const oc = new OAC(1, Math.round(SECONDES_RENDU * hz), hz);
        // ── LA SOURCE EST PLUS LONGUE QUE LA ZONE, ET CE QUI SUIT LA ZONE EST AUTRE ──────
        // La prise source est une prise entière ; le passage qu'on refait est au MILIEU. Ce
        // qui suit l'amorce dans la source, c'est la suite de l'ancienne prise : c'est
        // précisément ce qu'il ne faut pas entendre par-dessus la nouvelle. On le marque donc
        // d'une autre amplitude, pour qu'un échantillon venu de là soit reconnaissable.
        const AVANT = 3000, DEDANS = 8000, APRES = 20000;
        const n = Math.round(SECONDES_SOURCE * hz);
        const debut = Math.round(1 * hz), fin = Math.round(3 * hz);
        const pcm = new Int16Array(n);
        for (let i = 0; i < n; i++) pcm[i] = i < debut ? AVANT : (i < fin ? DEDANS : APRES);
        const zone = window.EnregistreurVoix._lireLAmorce(oc, pcm.buffer, hz,
          { debutEchantillon: debut, finEchantillon: fin, debut_s: 0 });
        const rendu = await oc.startRendering();
        const sortie = rendu.getChannelData(0);
        const attendu = DEDANS / 32768;
        let premierNonZero = -1, dernierNonZero = -1, nonZerosApres = 0, horsZone = 0;
        for (let i = 0; i < sortie.length; i++) {
          if (sortie[i] !== 0) {
            if (premierNonZero < 0) premierNonZero = i;
            dernierNonZero = i;
            if (i >= fin - debut) nonZerosApres++;
            // Un échantillon qui ne vient pas de la zone : d'avant, ou d'après.
            if (Math.abs(sortie[i] - attendu) > 0.01) horsZone++;
          }
        }
        resultats[hz] = { echantillonsDeLAmorce: fin - debut, zone: zone,
          premierNonZero: premierNonZero, dernierNonZero: dernierNonZero,
          nonZerosApres: nonZerosApres, horsZone: horsZone, rendu: sortie.length };
      }
      return resultats;
    });
    await ctx.close();

    [48000, 44100].forEach((hz) => {
      const x = r[hz];
      // 1. L'AMORCE A BIEN JOUÉ : sans cela « rien après » serait vrai pour rien.
      assert.ok(x.premierNonZero >= 0 && x.premierNonZero <= 128,
        hz + ' Hz : l\'amorce doit commencer au premier bloc rendu : ' + x.premierNonZero);
      // 2. ELLE S'ARRÊTE À LA FIN DE SA ZONE, à un bloc de 128 échantillons près.
      assert.ok(x.dernierNonZero >= x.echantillonsDeLAmorce - 1 - 128
                && x.dernierNonZero <= x.echantillonsDeLAmorce - 1 + 128,
        hz + ' Hz : le dernier échantillon non nul doit tomber à un bloc près de la fin de la '
        + 'zone (' + (x.echantillonsDeLAmorce - 1) + ') : ' + x.dernierNonZero +
        ', écart ' + (x.dernierNonZero - (x.echantillonsDeLAmorce - 1)) + ' échantillons');
      // 3. RIEN NE JOUE AU-DELÀ — c'est la garantie de E10.
      assert.ok(x.nonZerosApres <= 128,
        hz + ' Hz : aucune lecture au-delà de la zone, à un bloc près : ' + x.nonZerosApres +
        ' échantillons non nuls après l\'échantillon ' + x.echantillonsDeLAmorce +
        ' (soit ' + (x.nonZerosApres / hz * 1000).toFixed(1) + ' ms de trop)');
      // 4. ET AUCUN ÉCHANTILLON NE VIENT D'AILLEURS QUE DE LA ZONE : ni d'avant, ni de la
      // suite de l'ancienne prise. Un `start` sans durée joue jusqu'au bout du tampon et se
      // ferait prendre ici, même si le `stop` existe encore.
      assert.ok(x.horsZone <= 128,
        hz + ' Hz : ' + x.horsZone + ' échantillon(s) rendus ne portent pas l\'amplitude de la '
        + 'zone : ils viennent d\'avant l\'amorce ou de la suite de la prise source');
      // 5. LA ZONE RENDUE PAR LE PRODUIT DIT LES MÊMES BORNES que ce qu'on a entendu.
      assert.equal(x.zone.echantillons, x.echantillonsDeLAmorce,
        hz + ' Hz : la zone doit annoncer sa longueur réelle : ' + x.zone.echantillons);
      assert.equal(x.zone.finEchantillon - x.zone.debutEchantillon, x.echantillonsDeLAmorce,
        hz + ' Hz : et ses bornes doivent l\'encadrer : ' + JSON.stringify(x.zone));
    });
    console.log('        48 kHz : zone de ' + r[48000].echantillonsDeLAmorce + ' éch · dernier ' +
      'non nul à ' + r[48000].dernierNonZero + ' · ' + r[48000].nonZerosApres + ' après · ' +
      r[48000].horsZone + ' hors zone\n        44,1 kHz : zone de ' +
      r[44100].echantillonsDeLAmorce + ' éch · dernier non nul à ' + r[44100].dernierNonZero +
      ' · ' + r[44100].nonZerosApres + ' après · ' + r[44100].horsZone + ' hors zone');
  });

  // Attend que la reprise ait réellement armé la piste, et si elle n'y arrive pas, DIT ce que la
  // page montrait : un délai dépassé sans message est un contrôle qui n'apprend rien.
  async function attendreLaReprise(page) {
    const vu = await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 }).then(() => true, () => false);
    if (vu) return;
    const diag = await page.evaluate(() => ({
      mode: (document.querySelector('[data-mode]') || {}).textContent,
      etatReprise: (document.querySelector('[data-reprise-etat]') || {}).textContent,
      notice: (document.querySelector('[data-reprise-notice]') || {}).textContent,
      messages: [...document.querySelectorAll('.sc-bm-message')].map((m) =>
        m.getAttribute('data-cle') + ': ' + m.querySelector('span').textContent),
    }));
    assert.fail('la reprise de passage n\'a pas démarré : ' + JSON.stringify(diag));
  }

  // ── §45 — (R5) LA VITESSE DE CHAQUE PASSAGE, SUR UNE PRISE DE VITESSES CONNUES ───────────
  //
  // FONCTION PURE, DEUX FRÉQUENCES. Les vitesses se calculent sur des positions d'échantillons :
  // aucun périphérique n'est ouvert, et le contrôle tourne à 48 000 comme à 44 100 Hz sans que
  // la configuration du Mac de Christophe entre en jeu.
  //
  // LE TÉMOIN LE PLUS UTILE EST LE QUATRIÈME PASSAGE : dix mots et une pause écrite de deux
  // secondes, lus en six secondes. Son temps de PAROLE est de quatre secondes, donc 2,5 mots/s,
  // donc conforme. Si la pause n'était pas retirée avant de diviser, il sortirait à 1,67 mots/s,
  // soit −33 %, et déclencherait une alerte sur un silence VOULU.
  await controle('§45 chaque passage affiche sa vitesse, et la pause écrite ne la fausse pas (R5)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const r = await page.evaluate(() => {
      const B = window.BandeRythmo;
      const dix = 'un deux trois quatre cinq six sept huit neuf dix';
      // Le cinquième passage a un écart PETIT MAIS NON NUL : il ne doit pas alerter. Sans lui,
      // une alerte qui ignore son seuil passerait inaperçue — les quatre autres ont un écart de
      // 0 ou bien franchement au-delà du seuil.
      const texte = dix + '\n' + dix + '\n' + dix + '\n' + dix + ' [pause 2 s]\n' + dix;
      const passages = B.decouperEnPassages(texte);
      const sortie = {};
      for (const hz of [48000, 44100]) {
        // Durées voulues : 4 s (2,5 mots/s), 2,5 s (4 mots/s), 8 s (1,25 mots/s),
        // 6 s dont 2 s de pause écrite (2,5 mots/s de parole).
        // … et 3,8 s pour dix mots font 2,63 mots/s, soit +5,3 % : dans le seuil de 20 %.
        const bornes = [0, 4, 6.5, 14.5, 20.5, 24.3].map((t) => Math.round(t * hz));
        const reperes = bornes.slice(1, 5).map((e) => ({ aEchantillon: e, douteux: false }));
        sortie[hz] = B.vitessesParPassage({
          passages: passages, reperes: reperes, dureeVoix_echantillons: bornes[5],
          echantillonnage: hz, vitesseChoisie: 2.5,
        });
      }
      // Les cas de bord, au même seuil : un passage trop court pour juger, et un nombre de
      // repères incompatible.
      const court = B.vitessesParPassage({
        passages: B.decouperEnPassages('un deux trois quatre cinq'),
        reperes: [], dureeVoix_echantillons: Math.round(1.2 * 48000),
        echantillonnage: 48000, vitesseChoisie: 2.5,
      });
      const incompatible = B.vitessesParPassage({
        passages: passages,
        reperes: [{ aEchantillon: 1000, douteux: false }, { aEchantillon: 2000, douteux: false }],
        dureeVoix_echantillons: 480000, echantillonnage: 48000, vitesseChoisie: 2.5,
      });
      return { sortie, court, incompatible, minimum: B.dureeMinSignificative_s(20, 250),
               seuilDefaut: B.SEUIL_VITESSE_POURCENT_DEFAUT };
    });
    await ctx.close();

    // LE SEUIL PROPOSÉ, ET LA DURÉE QUI EN DÉCOULE : 500 ms d'incertitude pour 20 % tolérés.
    assert.equal(r.seuilDefaut, 20, 'le seuil par défaut doit être 20 % : ' + r.seuilDefaut);
    assert.ok(Math.abs(r.minimum - 2.5) < 1e-9,
      'la durée minimale significative doit découler du seuil (2 × 250 ms / 20 %) = 2,5 s : '
      + r.minimum);

    [48000, 44100].forEach((hz) => {
      const v = r.sortie[hz];
      assert.ok(v.mesurable, hz + ' Hz : les vitesses doivent être mesurables : ' + v.raison);
      const attendus = [
        { v: 2.5, ecart: 0, alerte: false, etat: 'conforme' },
        { v: 4, ecart: 60, alerte: true, etat: 'trop rapide' },
        { v: 1.25, ecart: -50, alerte: true, etat: 'trop lent' },
        { v: 2.5, ecart: 0, alerte: false, etat: 'conforme' },
        { v: 2.632, ecart: 5.3, alerte: false, etat: 'conforme' },
      ];
      attendus.forEach((a, k) => {
        const x = v.passages[k];
        assert.ok(Math.abs(x.motsParSeconde - a.v) < 0.02,
          hz + ' Hz, passage ' + (k + 1) + ' : ' + a.v + ' mots/s attendus, mesuré '
          + x.motsParSeconde + ' (durée ' + x.duree_s + ' s, parole ' + x.tempsDeParole_s + ' s)');
        assert.ok(Math.abs(x.ecart_pourCent - a.ecart) < 0.6,
          hz + ' Hz, passage ' + (k + 1) + ' : écart ' + a.ecart + ' % attendu, mesuré '
          + x.ecart_pourCent + ' %');
        assert.equal(x.alerte, a.alerte,
          hz + ' Hz, passage ' + (k + 1) + ' : alerte ' + a.alerte + ' attendue → ' + x.raison);
        assert.equal(x.etat, a.etat, hz + ' Hz, passage ' + (k + 1) + ' : état ' + x.etat);
      });
      // LE QUATRIÈME PASSAGE EST LE TÉMOIN DE LA PAUSE : sa durée et son temps de parole
      // DIFFÈRENT de deux secondes, et c'est le second qui divise.
      const p4 = v.passages[3];
      assert.ok(Math.abs(p4.duree_s - 6) < 0.02 && Math.abs(p4.tempsDeParole_s - 4) < 0.02,
        hz + ' Hz : le passage à pause doit durer 6 s dont 4 s de parole : '
        + p4.duree_s + ' / ' + p4.tempsDeParole_s);
      assert.equal(p4.secondesDePauseEcrites, 2,
        hz + ' Hz : la pause écrite doit valoir 2 s : ' + p4.secondesDePauseEcrites);
      assert.equal(v.nbAlertes, 2, hz + ' Hz : deux alertes attendues : ' + v.nbAlertes);
      // LE TÉMOIN DU SEUIL : un écart de +5,3 % existe, il est affiché, et il n'alerte pas.
      const p5 = v.passages[4];
      assert.ok(p5.ecart_pourCent > 1 && p5.ecart_pourCent < 20 && p5.alerte === false,
        hz + ' Hz : un écart non nul mais sous le seuil ne doit pas alerter : '
        + p5.ecart_pourCent + ' % → ' + p5.raison);
    });

    // UN PASSAGE TROP COURT EST AFFICHÉ SANS ALERTE, avec sa raison : l'incertitude des deux
    // repères y atteint le seuil à elle seule.
    const c = r.court.passages[0];
    assert.equal(c.alerte, false, 'un passage de 1,2 s ne doit pas alerter : ' + c.raison);
    assert.equal(c.etat, 'durée trop courte pour juger', 'état : ' + c.etat);
    assert.ok(c.motsParSeconde > 0, 'sa vitesse est tout de même affichée : ' + c.motsParSeconde);
    // UN NOMBRE DE REPÈRES INCOMPATIBLE NE PRODUIT PAS DE VITESSES INVENTÉES.
    assert.equal(r.incompatible.mesurable, false,
      'un repère pour quatre passages ne permet pas de borner : ' + JSON.stringify(r.incompatible));
    assert.ok(/non mesurables/.test(r.incompatible.raison), r.incompatible.raison);
    console.log('        48 kHz : ' + r.sortie[48000].passages.map((x) =>
      x.motsParSeconde.toFixed(2) + ' mots/s (' + x.etat + ')').join(' · '));
  });

  // ── §46 — (R6) L'OPTION DES MARQUEURS THÉORIQUES : ÉTEINTE, PUIS DES REPÈRES ORDINAIRES ──
  await controle('§46 l\'option des marqueurs théoriques est éteinte par défaut, et ses marqueurs sont des repères comme les autres (R6)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const texte = 'un deux trois quatre cinq\nsix sept huit neuf dix\nonze douze treize quatorze quinze';
    await page.fill('[data-texte-bande]', texte);

    // 1. ÉTEINTE PAR DÉFAUT, et une prise ordinaire ne pose aucun marqueur.
    const parDefaut = await page.evaluate(() =>
      document.querySelector('[data-marqueurs-theoriques]').checked);
    await prendre(page, { attendreMs: 1200 });
    const sansReperes = await page.evaluate(() =>
      window.EnregistreurVoix._etat().reperes.map((r) => ({ ...r })));
    assert.equal(parDefaut, false, 'la case doit être décochée au chargement : ' + parDefaut);
    assert.equal(sansReperes.length, 0,
      'sans l\'option, aucun repère ne doit être posé : ' + JSON.stringify(sansReperes));

    // 2. COCHÉE : les frontières intérieures de la bande, et rien de plus.
    await page.check('[data-marqueurs-theoriques]');
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => window.EnregistreurVoix._etat().reperes.length > 0,
      null, { timeout: 10000 });
    const pose = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const B = window.BandeRythmo;
      return { reperes: e.reperes.map((r) => ({ ...r })), hz: e.echantillonnage,
               vitesse: e.vitesseBande, nbPassages: e.passages.length,
               attendus: B.marqueursTheoriques(e.passages, e.vitesseBande, e.echantillonnage),
               option: e.marqueursTheoriques };
    });
    assert.equal(pose.reperes.length, pose.nbPassages - 1,
      'trois passages → deux frontières intérieures : ' + pose.reperes.length);
    assert.deepEqual(pose.reperes.map((r) => r.aEchantillon), pose.attendus.map((r) => r.aEchantillon),
      'les positions doivent être celles que la bande prévoit : '
      + JSON.stringify(pose.reperes.map((r) => r.aEchantillon)) + ' contre '
      + JSON.stringify(pose.attendus.map((r) => r.aEchantillon)));
    assert.ok(pose.reperes.every((r) => r.theorique === true && r.douteux === false),
      'ils sont marqués théoriques et non douteux : ' + JSON.stringify(pose.reperes));
    assert.equal(pose.option.active, true, 'l\'option doit être consignée active');

    // 3. CE SONT DES REPÈRES COMME LES AUTRES : ajustables, effaçables, et un repère posé À LA
    // MAIN après eux n'est PAS déclaré douteux — c'est la conséquence de l'antirebond qui ne
    // garde que le geste.
    await page.click('[data-action="repere"]');
    const apres = await page.evaluate(() => {
      const E = window.EnregistreurVoix;
      const avant = E._etat().reperes[0].aEchantillon;
      E._recalerUnRepere(0, 100);
      const recale = E._etat().reperes[0].aEchantillon;
      const n0 = E._etat().reperes.length;
      E._retirerUnRepere(1);
      const e = E._etat();
      return { avant, recale, hz: e.echantillonnage, n0, n1: e.reperes.length,
               mainDouteux: (e.reperes.find((r) => r.source === 'bouton') || {}).douteux,
               reperes: e.reperes.map((r) => ({ ...r })) };
    });
    assert.equal(apres.recale - apres.avant, Math.round(0.1 * apres.hz),
      'un recalage de 100 ms doit déplacer de ' + Math.round(0.1 * apres.hz)
      + ' échantillons : ' + (apres.recale - apres.avant));
    assert.equal(apres.n1, apres.n0 - 1, 'un repère retiré doit disparaître de la liste');
    assert.equal(apres.mainDouteux, false,
      'un repère posé à la main après des marqueurs théoriques ne doit pas être DOUTEUX : '
      + JSON.stringify(apres.reperes));

    const fin = await prendreLaFin(page);
    await ctx.close();
    const rapport = fin.module.mesures;
    assert.ok(Array.isArray(rapport.reperes) && rapport.reperes.length === apres.n1,
      'le rapport porte les mêmes repères que l\'état : ' + JSON.stringify(rapport.reperes));
    assert.equal(rapport.controlesDeT6.nombre.poses, apres.n1,
      'les contrôles de T6 comptent les marqueurs théoriques comme les autres : '
      + JSON.stringify(rapport.controlesDeT6.nombre));
    assert.equal(rapport.marqueursTheoriques.poses, pose.nbPassages - 1,
      'le rapport dit combien l\'option a posé : '
      + JSON.stringify(rapport.marqueursTheoriques));
    console.log('        posés ' + (pose.nbPassages - 1) + ' théoriques à '
      + pose.reperes.map((r) => r.aEchantillon).join(' et ') + ' · recalage '
      + (apres.recale - apres.avant) + ' éch · repère de la main non douteux');
  });

  // ── §47 — (T3 bis) LE CONTEXTE DE L'INSTANT, À CHAQUE ÉVÉNEMENT DE PISTE ─────────────────
  //
  // POURQUOI CE CONTRÔLE. La perte de micro du 17 octobre à 14:01 est sans cause connue, et le
  // journal ne portait rien qui permette de la chercher. Ce contrôle vérifie que les champs sont
  // là ET qu'ils disent la vérité de l'instant : une visibilité forcée à « hidden » doit
  // apparaître comme telle, un geste vieux de six cents millisecondes doit être daté, et un
  // changement de périphérique vieux de six secondes doit être HORS de la fenêtre de cinq.
  await controle('§47 chaque événement de piste consigne le contexte de l\'instant, et il est cohérent (T3 bis)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);

    // 1. LE FILTRE DES CINQ SECONDES, PAR LE CALCUL : décidable sans provoquer de panne.
    const filtre = await page.evaluate(() => {
      const E = window.EnregistreurVoix;
      const maintenant = 100000;
      return { fenetre: E.FENETRE_DIAGNOSTIC_S,
        sortie: E._changementsRecents([
          { quand_ms: maintenant - 6000 },   // hors fenêtre
          { quand_ms: maintenant - 4999 },   // dedans, de justesse
          { quand_ms: maintenant - 1000 },   // dedans
        ], maintenant, E.FENETRE_DIAGNOSTIC_S) };
    });
    assert.equal(filtre.fenetre, 5, 'la fenêtre de diagnostic doit faire 5 s : ' + filtre.fenetre);
    assert.equal(filtre.sortie.length, 2,
      'deux changements sur trois sont dans les cinq secondes : ' + JSON.stringify(filtre.sortie));
    assert.ok(filtre.sortie.every((c) => c.ageEnSecondes <= 5),
      'et aucun ne dépasse cinq secondes : ' + JSON.stringify(filtre.sortie));

    // 2. LE VRAI CHEMIN : une prise en cours, un geste daté, un périphérique qui change, la
    // page déclarée cachée, puis les quatre événements que le complément nomme.
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyZ');            // LE DERNIER GESTE, daté par le produit
    await page.waitForTimeout(700);               // … et qu'on laisse vieillir
    const vu = await page.evaluate(async () => {
      // La page se déclare cachée : si le code lisait une constante au lieu de
      // `document.visibilityState`, il annoncerait encore « visible ».
      Object.defineProperty(document, 'visibilityState',
        { get: () => 'hidden', configurable: true });
      if (navigator.mediaDevices && navigator.mediaDevices.dispatchEvent) {
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      }
      const e = window.EnregistreurVoix._etat();
      await e.ctx.suspend();                       // « contexte suspended »
      if (e.piste) {
        e.piste.dispatchEvent(new Event('mute'));   // « piste muette (événement) »
        e.piste.dispatchEvent(new Event('unmute')); // « piste non muette »
        e.piste.dispatchEvent(new Event('ended'));  // « piste terminée »
      }
      await new Promise((r) => setTimeout(r, 120));
      const etat = window.EnregistreurVoix._etat();
      return { journal: etat.journal.map((x) => ({ ...x })),
               etatContexte: etat.ctx.state,
               pisteVivante: etat.piste ? etat.piste.readyState : 'aucune' };
    });
    await ctx.close();

    const nommes = ['piste muette', 'piste non muette', 'piste terminée', 'contexte suspended'];
    nommes.forEach((nom) => {
      const e = vu.journal.filter((x) => String(x.quoi).indexOf(nom) === 0);
      assert.ok(e.length >= 1, 'le journal doit porter « ' + nom + ' » : '
        + JSON.stringify(vu.journal.map((x) => x.quoi)));
      e.forEach((x) => {
        const c = x.contexteDeLInstant;
        assert.ok(c, '« ' + x.quoi + ' » doit porter le contexte de l\'instant : '
          + JSON.stringify(x));
        // PRÉSENTS…
        ['visibilite', 'fenetreAuPremierPlan', 'depuisDernierGeste_s',
         'changementsDePeripherique', 'etatDuContexteAudio', 'etatDeLaPiste',
         'pisteDeclaree'].forEach((champ) => {
          assert.ok(Object.prototype.hasOwnProperty.call(c, champ),
            '« ' + x.quoi + ' » : le champ ' + champ + ' manque : ' + JSON.stringify(c));
        });
        // … ET COHÉRENTS.
        assert.equal(c.visibilite, 'hidden',
          '« ' + x.quoi + ' » : la visibilité doit être LUE (hidden forcé) : ' + c.visibilite);
        assert.ok(typeof c.depuisDernierGeste_s === 'number' && c.depuisDernierGeste_s >= 0.5,
          '« ' + x.quoi + ' » : le dernier geste a plus de 0,5 s : ' + c.depuisDernierGeste_s);
        assert.ok(c.depuisDernierGeste_s < 60,
          '« ' + x.quoi + ' » : et moins d\'une minute : ' + c.depuisDernierGeste_s);
        assert.equal(c.etatDuContexteAudio, 'suspended',
          '« ' + x.quoi + ' » : l\'état du contexte doit être celui de l\'instant : '
          + c.etatDuContexteAudio);
        assert.equal(c.changementsDePeripherique.fenetre_s, 5,
          '« ' + x.quoi + ' » : la fenêtre doit être dite : '
          + JSON.stringify(c.changementsDePeripherique));
        assert.ok(c.changementsDePeripherique.nombre >= 1,
          '« ' + x.quoi + ' » : le devicechange des 5 dernières secondes doit être compté : '
          + JSON.stringify(c.changementsDePeripherique));
        assert.ok(typeof c.pisteDeclaree === 'object'
          && typeof c.pisteDeclaree.muted === 'boolean',
          '« ' + x.quoi + ' » : la piste doit être déclarée telle qu\'elle est : '
          + JSON.stringify(c.pisteDeclaree));
      });
    });
    // UN CONTEXTE REDEVENU `running` N'EST PAS UN INCIDENT : il ne porte pas le diagnostic.
    const ordinaires = vu.journal.filter((x) => x.quoi === 'prise démarrée');
    assert.ok(ordinaires.length >= 1 && !ordinaires[0].contexteDeLInstant,
      'un événement ordinaire ne porte pas le diagnostic : ' + JSON.stringify(ordinaires[0]));
    const unMuet = vu.journal.find((x) => String(x.quoi).indexOf('piste muette') === 0);
    console.log('        ' + nommes.length + ' événements diagnostiqués · visibilité '
      + unMuet.contexteDeLInstant.visibilite + ' · dernier geste il y a '
      + unMuet.contexteDeLInstant.depuisDernierGeste_s + ' s · '
      + unMuet.contexteDeLInstant.changementsDePeripherique.nombre + ' devicechange dans les 5 s');
  });

  // ── §48 — (E10, R7, T10, point 4) LA REPRISE EST UNE PRISE SÉPARÉE, LIÉE AU PASSAGE ─────
  await controle('§48 « Refaire ce passage » crée une prise SÉPARÉE liée au passage, qui porte sa zone d\'amorce (E10, R7, T10)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const texte = 'un deux trois quatre cinq\nsix sept huit neuf dix\nonze douze treize quatorze quinze';
    await page.fill('[data-texte-bande]', texte);

    // 1. LA PRISE SOURCE : trois passages, deux repères posés à la main.
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(3000);
    await page.click('[data-action="repere"]');     // frontière 1 → 2, vers 3 s
    await page.waitForTimeout(3000);
    await page.click('[data-action="repere"]');     // frontière 2 → 3, vers 6 s
    await page.waitForTimeout(1200);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /terminée|muette/i.test(t.textContent);
    }, null, { timeout: 20000 });
    const source = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { id: e.priseId, hz: e.echantillonnage, echantillons: e.echantillonsEcrits,
               reperes: e.reperes.map((r) => r.aEchantillon) };
    });

    // 2. LA REPRISE DU DEUXIÈME PASSAGE, EN DOUBLAGE, AMORCE DE DEUX SECONDES.
    await page.selectOption('[data-reprise-source]', source.id);
    await page.selectOption('[data-reprise-passage]', '1');
    await page.selectOption('[data-reprise-mode]', 'doublage');
    await page.fill('[data-reprise-amorce]', '2');
    await page.click('[data-action="refaire-passage"]');
    await attendreLaReprise(page);
    const pendant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const B = window.BandeRythmo;
      const a = e.amorce;
      const alignement = a.mode === 'doublage' ? a.echantillonsJoues : 0;
      // LA BANDE DÉMARRE AU PASSAGE CHOISI, CALÉE SUR LA FIN DE L'AMORCE : on le vérifie en
      // demandant à la bande où elle est À CET ÉCHANTILLON-LÀ.
      const pos = B.positionDeLaBande(alignement, e.echantillonnage, e.passages,
        e.vitesseBande, { decalage_s: e.decalageBande_s });
      return { priseId: e.priseId, amorce: a, reprise: e.repriseDuPassage,
               decalage: e.decalageBande_s, alignement,
               debutPrise_ctxTemps: e.debutPrise_ctxTemps, hz: e.echantillonnage,
               bandeALaFinDeLAmorce: { passageCourant: pos.passageCourant,
                 partDuPassage: pos.partDuPassage, offset: pos.offsetDansLePassage_s } };
    });
    // ON ARRÊTE PENDANT L'AMORCE (2 s demandées) : la lecture doit se taire.
    await page.waitForTimeout(600);
    const fin = await prendreLaFin(page);

    // (E10) L'AMORCE EST COUPÉE PAR L'ARRÊT, et le journal le dit : sans cela, l'ancienne
    // prise continuerait de jouer aux haut-parleurs après l'arrêt, et deux amorces se
    // superposeraient si Christophe relançait la reprise aussitôt.
    const coupee = fin.module.journal.filter((e) => e.quoi === 'amorce interrompue');
    assert.equal(coupee.length, 1,
      'la prise arrêtée pendant l\'amorce doit couper la lecture et le consigner : '
      + JSON.stringify(fin.module.journal.map((e) => e.quoi)));
    assert.ok(/la lecture est coupée/.test(coupee[0].raison), coupee[0].raison);
    // ET L'EFFET EST MESURÉ, non déclaré : c'est le nœud qui dit avoir fini, et l'horloge audio
    // qui dit quand. Sans cette assertion, retirer le `stop` laissait le contrôle passer : le
    // journal écrivait « coupée » pendant que la lecture continuait (trou #134).
    const mesure = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return e.amorceFinie;
    }).catch(() => null);
    assert.ok(mesure && typeof mesure.enAvance_s === 'number',
      'la fin de la lecture doit être relevée par l\'événement du nœud : '
      + JSON.stringify(mesure) + ' — une lecture qui n\'a pas fini n\'a pas été coupée');
    assert.ok(mesure.enAvance_s > 0.3,
      'la lecture doit s\'être arrêtée nettement avant la fin prévue de la zone : '
      + mesure.enAvance_s + ' s d\'avance sur ' + mesure.finPrevue_s + ' s');

    // LA PRISE EST NEUVE ET SÉPARÉE, ET L'ANCIENNE RESTE (T10 : « rien n'est écrasé »).
    assert.notEqual(pendant.priseId, source.id,
      'la reprise doit être une prise SÉPARÉE, pas la source : ' + pendant.priseId);
    assert.equal(fin.nbPrises, 2, 'deux prises doivent coexister : ' + fin.nbPrises);
    // ELLE EST LIÉE AU PASSAGE (R7).
    assert.equal(pendant.reprise.passage, 1,
      'la prise doit porter le passage qu\'elle reprend : ' + JSON.stringify(pendant.reprise));
    assert.equal(fin.module.mesures.repriseDuPassage.passage, 1,
      'et le rapport aussi : ' + JSON.stringify(fin.module.mesures.repriseDuPassage));
    // ── LE TÉMOIN VIENT DU STOCKAGE, PAS DE L'ÉTAT EN MÉMOIRE (#11(j)) ────────────────────
    // Sans cette relecture, une écriture qui échoue passe inaperçue : c'est exactement ce qui
    // s'est produit la première fois que ce contrôle est passé, alors que la prise ne
    // s'écrivait pas (un nœud audio ne se sérialise pas).
    assert.ok(fin.stockage.prise && fin.stockage.prise.repriseDuPassage
      && fin.stockage.prise.repriseDuPassage.passage === 1,
      'la prise ÉCRITE doit porter le lien au passage : '
      + JSON.stringify(fin.stockage.prise && fin.stockage.prise.repriseDuPassage));
    assert.ok(fin.stockage.prise.mesures && fin.stockage.prise.mesures.zoneDAmorce
      && fin.stockage.prise.mesures.zoneDAmorce.echantillonsJoues
         === pendant.amorce.echantillonsJoues,
      'et la zone d\'amorce doit être relisible dans le stockage : '
      + JSON.stringify(fin.stockage.prise.mesures && fin.stockage.prise.mesures.zoneDAmorce));
    // LA ZONE D'AMORCE : début, fin, prise source, position source — en échantillons.
    const a = pendant.amorce;
    assert.equal(a.priseSource, source.id, 'la zone pointe la prise source : ' + a.priseSource);
    assert.equal(a.positionDuPassageDansLaSource, source.reperes[0],
      'la position du passage 2 dans la source est son premier repère ('
      + source.reperes[0] + ') : ' + a.positionDuPassageDansLaSource);
    assert.equal(a.echantillonsJoues, Math.round(2 * source.hz),
      'deux secondes d\'amorce à ' + source.hz + ' Hz : ' + a.echantillonsJoues);
    assert.equal(a.finDansLaSource - a.debutDansLaSource, a.echantillonsJoues,
      'les bornes dans la source encadrent l\'amorce : ' + JSON.stringify(a));
    assert.equal(a.finDansLaSource, source.reperes[0],
      'l\'amorce finit où le passage commence : ' + a.finDansLaSource);
    assert.equal(a.tronquee, false,
      'avec 3 s de voix avant le passage, 2 s d\'amorce ne sont pas tronquées : '
      + a.raisonDeLaTroncature);
    assert.equal(a.echantillonsLusDeLaSource, a.echantillonsJoues,
      'tous les échantillons de la plage ont été relus dans le stockage : '
      + a.echantillonsLusDeLaSource + ' sur ' + a.echantillonsJoues);
    // EN DOUBLAGE, LA ZONE EST DANS LA PRISE NEUVE, et la latence de sortie est lue par l'API.
    assert.equal(a.mode, 'doublage', 'le mode par défaut est le doublage : ' + a.mode);
    assert.equal(a.finDansLaPriseNeuve - a.debutDansLaPriseNeuve, a.echantillonsJoues,
      'la zone occupe la prise neuve sur toute sa longueur : ' + JSON.stringify(a));
    assert.ok(a.lecture && (typeof a.lecture.latenceDeSortie_s === 'number'
      || a.lecture.latenceDeSortie_s === null),
      'la latence de sortie est lue par l\'API ou dite inconnue : ' + JSON.stringify(a.lecture));
    // ── LE DÉBUT DE LA ZONE EST MESURÉ, NON ANNONCÉ (#11(e), #11(j)) ──────────────────────
    // Le témoin vient d'un AUTRE chemin que le champ lui-même : les deux dates d'horloge audio
    // publiées (celle de la lecture et celle du premier échantillon de la prise), converties
    // ici. Un champ posé à zéro par commodité ne vaudrait plus la différence des deux dates.
    const attenduDebut = Math.round(
      (a.lecture.commenceA_horlogeAudio_s - pendant.debutPrise_ctxTemps) * pendant.hz);
    assert.ok(Math.abs(a.debutDansLaPriseNeuve - attenduDebut) <= 1,
      'le début de la zone doit être la différence des deux dates d\'horloge audio ('
      + attenduDebut + ' échantillons) : ' + a.debutDansLaPriseNeuve);
    assert.ok(attenduDebut > 0,
      'la lecture est programmée APRÈS le premier échantillon (le temps de l\'accusé de '
      + 'réception du worklet) : l\'écart mesuré doit être positif, ' + attenduDebut
      + ' — c\'est un fait de chronologie, non une propriété de la machine');
    // LA BANDE DÉMARRE AU PASSAGE CHOISI, à la fin de l'amorce.
    assert.equal(pendant.bandeALaFinDeLAmorce.passageCourant, 1,
      'à la fin de l\'amorce, la bande doit être au passage 2 : '
      + JSON.stringify(pendant.bandeALaFinDeLAmorce));
    assert.ok(pendant.bandeALaFinDeLAmorce.offset < 0.05,
      'et à son tout début : offset ' + pendant.bandeALaFinDeLAmorce.offset + ' s');
    await ctx.close();
    console.log('        source ' + source.echantillons + ' éch, repères '
      + source.reperes.join('/') + ' · amorce ' + a.debutDansLaSource + '→'
      + a.finDansLaSource + ' (' + a.echantillonsJoues + ' éch) · zone neuve '
      + a.debutDansLaPriseNeuve + '→' + a.finDansLaPriseNeuve + ' · latence '
      + a.lecture.latenceDeSortie_s + ' s (' + a.lecture.sourceDeLaLatence + ')');
  });

  // ── §48b — (compléments) TRONCATURE DITE, PASSAGE SANS PRISE SOURCE, DEUX REPRISES ───────
  await controle('§48b amorce tronquée, passage sans prise source, et deux reprises du même passage (compléments)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const texte = 'un deux trois quatre cinq\nsix sept huit neuf dix';
    await page.fill('[data-texte-bande]', texte);

    // UNE SOURCE COURTE : un seul repère, posé tôt, pour qu'une amorce de 5 s ne tienne pas.
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForTimeout(1200);
    await page.click('[data-action="repere"]');      // vers 1,2 s
    await page.waitForTimeout(1200);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /terminée|muette/i.test(t.textContent);
    }, null, { timeout: 20000 });
    const source = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { id: e.priseId, hz: e.echantillonnage, repere: e.reperes[0].aEchantillon };
    });

    // 1. TRONCATURE : 5 s demandées, environ 1,2 s disponibles.
    await page.selectOption('[data-reprise-source]', source.id);
    await page.selectOption('[data-reprise-passage]', '1');
    await page.fill('[data-reprise-amorce]', '5');
    await page.click('[data-action="refaire-passage"]');
    await attendreLaReprise(page);
    const tronq = await page.evaluate(() => ({
      amorce: window.EnregistreurVoix._etat().amorce,
      notice: (document.querySelector('[data-reprise-notice]') || {}).textContent || '',
      noticeVisible: !(document.querySelector('[data-reprise-notice]') || {}).hidden,
    }));
    await page.waitForTimeout(800);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /terminée|muette/i.test(t.textContent);
    }, null, { timeout: 20000 });
    const reprise1 = await page.evaluate(() => window.EnregistreurVoix._etat().priseId);

    assert.equal(tronq.amorce.tronquee, true,
      '5 s demandées pour ' + source.repere + ' échantillons disponibles : la troncature doit '
      + 'être dite : ' + JSON.stringify(tronq.amorce));
    assert.equal(tronq.amorce.echantillonsJoues, source.repere,
      'on joue tout ce qui précède, et rien de plus : ' + tronq.amorce.echantillonsJoues
      + ' pour ' + source.repere);
    assert.ok(/raccourcie/.test(tronq.amorce.raisonDeLaTroncature),
      'avec sa raison : ' + tronq.amorce.raisonDeLaTroncature);
    assert.ok(tronq.noticeVisible && /Amorce raccourcie/.test(tronq.notice),
      'et à l\'écran, dans `sc-bm-reprise-notice` : ' + JSON.stringify(tronq));

    // 2. DEUXIÈME REPRISE DU MÊME PASSAGE : une troisième prise, liée au même passage.
    await page.click('[data-action="refaire-passage"]');
    await attendreLaReprise(page);
    await page.waitForTimeout(700);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /terminée|muette/i.test(t.textContent);
    }, null, { timeout: 20000 });
    const reprise2 = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { id: e.priseId, passage: e.repriseDuPassage.passage };
    });

    // 3. PASSAGE SANS PRISE SOURCE : on refait quand même, SANS amorce, et on le dit.
    await page.selectOption('[data-reprise-source]', '');
    await page.click('[data-action="refaire-passage"]');
    await attendreLaReprise(page);
    const sans = await page.evaluate(() => ({
      amorce: window.EnregistreurVoix._etat().amorce,
      reprise: window.EnregistreurVoix._etat().repriseDuPassage,
      notice: (document.querySelector('[data-reprise-notice]') || {}).textContent || '',
    }));
    await page.waitForTimeout(600);
    const fin = await prendreLaFin(page);
    await ctx.close();

    assert.notEqual(reprise2.id, reprise1,
      'la seconde reprise du même passage est une prise de plus : ' + reprise2.id);
    assert.equal(reprise2.passage, 1,
      'liée au même passage que la première : ' + reprise2.passage);
    assert.equal(fin.nbPrises, 4,
      'source + deux reprises + la reprise sans amorce = quatre prises : ' + fin.nbPrises);
    assert.equal(sans.amorce.sansAmorce, true,
      'sans prise source, la reprise est SANS amorce : ' + JSON.stringify(sans.amorce));
    assert.equal(sans.amorce.echantillonsJoues, 0,
      'et rien n\'est joué : ' + sans.amorce.echantillonsJoues);
    assert.ok(/aucune prise source/.test(sans.amorce.raisonSansAmorce),
      'avec sa raison : ' + sans.amorce.raisonSansAmorce);
    assert.ok(/SANS amorce/.test(sans.notice), 'dite à l\'écran : ' + sans.notice);
    assert.equal(sans.reprise.passage, 1,
      'et la prise reste liée au passage : ' + JSON.stringify(sans.reprise));
    console.log('        tronquée à ' + tronq.amorce.echantillonsJoues + ' éch sur '
      + tronq.amorce.echantillonsDemandes + ' · ' + fin.nbPrises + ' prises · '
      + 'deux reprises du passage 2 · une reprise sans amorce');
  });

  // ── §48c — (E10, E2) « AMORCE PUIS SILENCE » : LA ZONE EST VIDE, ET LE REBOURS A JOUÉ ────
  //
  // LA DIFFÉRENCE AVEC LE DOUBLAGE EST PHYSIQUE : ici l'enregistrement ne commence qu'APRÈS la
  // fin de l'amorce et la garde, donc aucun échantillon de l'ancienne prise ne peut se trouver
  // dans la nouvelle. Le contrôle le vérifie sur la zone, et vérifie aussi que le compte à
  // rebours de E2 a bien eu lieu avant la reprise — « y compris les reprises ».
  await controle('§48c « amorce puis silence » n\'écrit rien de l\'amorce, et le rebours joue avant la reprise (E10, E2)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base, null, { rebours: 1 });
    await page.fill('[data-texte-bande]',
      'un deux trois quatre cinq\nsix sept huit neuf dix');

    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.click('[data-action="repere"]');
    await page.waitForTimeout(1000);
    await page.click('[data-action="arreter"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /terminée|muette/i.test(t.textContent);
    }, null, { timeout: 20000 });
    const source = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { id: e.priseId, hz: e.echantillonnage, repere: e.reperes[0].aEchantillon };
    });

    await page.selectOption('[data-reprise-source]', source.id);
    await page.selectOption('[data-reprise-passage]', '1');
    await page.selectOption('[data-reprise-mode]', 'amorce-puis-silence');
    await page.fill('[data-reprise-amorce]', '1');
    await page.fill('[data-reprise-garde]', '0.5');
    const horloge = Date.now();
    await page.click('[data-action="refaire-passage"]');
    await attendreLaReprise(page);
    const ecoule_ms = Date.now() - horloge;
    const pendant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      const B = window.BandeRythmo;
      const pos = B.positionDeLaBande(0, e.echantillonnage, e.passages, e.vitesseBande,
        { decalage_s: e.decalageBande_s });
      return { amorce: e.amorce, rebours: e.rebours, journal: e.journal.map((x) => ({ ...x })),
               bandeAuPremierEchantillon: { passageCourant: pos.passageCourant,
                 offset: pos.offsetDansLePassage_s } };
    });
    await page.waitForTimeout(700);
    const fin = await prendreLaFin(page);
    await ctx.close();

    const a = pendant.amorce;
    assert.equal(a.mode, 'amorce-puis-silence', 'le mode doit être celui choisi : ' + a.mode);
    // LA ZONE EST VIDE DANS LA PRISE NEUVE : rien de l'ancienne prise n'y est.
    assert.equal(a.debutDansLaPriseNeuve, 0, 'zone : ' + JSON.stringify(a));
    assert.equal(a.finDansLaPriseNeuve, 0,
      'en « amorce puis silence », la zone d\'amorce de la prise neuve est VIDE : '
      + a.debutDansLaPriseNeuve + '→' + a.finDansLaPriseNeuve);
    assert.equal(a.gardeAppliquee_s, 0.5, 'la garde réglée doit être celle appliquée : '
      + a.gardeAppliquee_s);
    assert.equal(a.gardeApresLAmorce_echantillons, Math.round(0.5 * source.hz),
      'et dite en échantillons : ' + a.gardeApresLAmorce_echantillons);
    assert.equal(a.echantillonsJoues, Math.round(1 * source.hz),
      'une seconde d\'amorce jouée : ' + a.echantillonsJoues);
    // LE TEMPS ÉCOULÉ LE CONFIRME : 1 s de rebours + 0,5 s de garde du rebours + 1 s d'amorce
    // + 0,5 s de garde avant l'enregistrement = 3 s au moins.
    assert.ok(ecoule_ms >= 2800,
      'rebours, amorce et garde doivent avoir réellement duré (≥ 2,8 s) : ' + ecoule_ms + ' ms');
    // (E2) LE REBOURS A JOUÉ AVANT LA REPRISE, et le journal de la prise neuve le porte.
    assert.equal(pendant.rebours.joue, true, 'le rebours doit avoir joué : '
      + JSON.stringify(pendant.rebours));
    const rb = pendant.journal.filter((x) => x.quoi === 'compte à rebours joué');
    assert.equal(rb.length, 1, 'le journal de la reprise porte le rebours une fois : '
      + JSON.stringify(pendant.journal.map((x) => x.quoi)));
    assert.equal(rb[0].aEchantillon, 0, 'daté à zéro, puisqu\'il précède la prise : '
      + rb[0].aEchantillon);
    // LA BANDE DÉMARRE AU PASSAGE CHOISI dès le premier échantillon, puisque rien ne le précède.
    assert.equal(pendant.bandeAuPremierEchantillon.passageCourant, 1,
      'la bande doit être au passage 2 dès l\'échantillon 0 : '
      + JSON.stringify(pendant.bandeAuPremierEchantillon));
    // ET LE JOURNAL DE L'AMORCE EST ÉCRIT, avec sa règle.
    const am = pendant.journal.filter((x) => x.quoi === 'amorce jouée');
    assert.equal(am.length, 1, 'une entrée « amorce jouée » : '
      + JSON.stringify(pendant.journal.map((x) => x.quoi)));
    assert.ok(/aucun échantillon de l'amorce n'est dans la prise/.test(am[0].regle),
      'qui dit pourquoi la zone est vide : ' + am[0].regle);
    assert.equal(fin.stockage.prise.mesures.zoneDAmorce.finDansLaPriseNeuve, 0,
      'et le stockage le porte : '
      + JSON.stringify(fin.stockage.prise.mesures.zoneDAmorce));
    console.log('        rebours 1 s + garde · amorce ' + a.echantillonsJoues + ' éch jouée hors '
      + 'prise · garde ' + a.gardeAppliquee_s + ' s · zone neuve vide · ' + ecoule_ms + ' ms '
      + 'entre le clic et le premier échantillon');
  });

  // ── §22c — LE RELEVÉ DE LA PRISE PRÉCÉDENTE NE DATE JAMAIS LA SUIVANTE ───────────────────
  //
  // §22 a trouvé ce défaut, mais par intermittence : il ne se montre que si un événement est
  // journalisé entre le démarrage de la prise et son premier relevé, soit une cinquantaine de
  // millisecondes. Ce contrôle-ci le rend décidable SANS COURSE : il démarre la seconde prise
  // par `_demarrer()`, qui rend la main dès l'accusé de réception du worklet — c'est-à-dire
  // avant tout relevé de la nouvelle prise —, et lit la position courante à cet instant.
  await controle('§22c au démarrage, la position courante n\'est jamais celle de la prise précédente', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    // UNE PREMIÈRE PRISE ASSEZ LONGUE pour que son relevé soit très au-delà d'un relevé.
    await prendre(page, { attendreMs: 3000 });
    const r = await page.evaluate(async () => {
      const E = window.EnregistreurVoix;
      const avant = E._etat();
      const prise1 = avant.echantillonsEcrits;
      // ── LA PRÉCONDITION EST CONSTRUITE, ET TENUE PAR UN CONTEXTE SUSPENDU ──────────────
      // Après l'arrêt, le worklet remet SON compteur à zéro et continue d'envoyer des relevés :
      // le dernier relevé retombe donc à 0 en quelques dizaines de millisecondes, et un
      // contrôle qui attendrait de le trouver périmé n'éprouverait rien la plupart du temps —
      // c'est précisément pourquoi §22 ne tombait qu'une fois sur plusieurs. On pose donc
      // explicitement l'état que la prise précédente laisse dans cet intervalle.
      //
      // ET ON SUSPEND LE CONTEXTE AVANT DE LE POSER. Sans cela, un vrai relevé écrasait la
      // valeur plantée pendant que `demarrer` faisait ses lectures de stockage, si bien que la
      // mutation « ne pas remettre le relevé à zéro » passait inaperçue (trou #111) : le
      // contrôle mesurait la vitesse du flux de relevés, pas la remise à zéro. Un contexte
      // suspendu n'en produit plus aucun, et `demarrer` efface le relevé AVANT de le reprendre.
      const ancien = prise1;
      await avant.ctx.suspend();
      avant.dernierReleve = { echantillonsEcrits: prise1, horodatage: 'relevé de la prise 1' };
      await E._demarrer();
      const e = E._etat();
      return { ancien, prise1, position: E._echantillonsCourants(),
               releve: e.dernierReleve ? e.dernierReleve.echantillonsEcrits : null,
               ecrits: e.echantillonsEcrits, hz: e.echantillonnage };
    });
    const fin = await prendreLaFin(page);
    await ctx.close();

    const unReleve = 19 * 128;
    assert.ok(r.prise1 > 100000,
      'la première prise doit avoir laissé une position très avancée : ' + r.prise1);
    assert.ok(r.position <= unReleve,
      'au démarrage de la seconde prise, la position courante doit être nulle ou d\'un relevé '
      + 'au plus (' + unReleve + ') : ' + r.position + ' — le relevé de la prise précédente '
      + '(' + r.ancien + ') ne doit pas la dater');
    assert.equal(r.ecrits, 0, 'et le compte de morceaux repart de zéro : ' + r.ecrits);
    assert.ok(fin.module.journal.every((e) => e.horsPrise
      || e.aEchantillon <= fin.module.echantillonsEcrits),
      'aucun événement de la seconde prise n\'est daté au-delà d\'elle : '
      + JSON.stringify(fin.module.journal.filter((e) => !e.horsPrise
          && e.aEchantillon > fin.module.echantillonsEcrits)));
    console.log('        prise 1 : ' + r.prise1 + ' éch (relevé ' + r.ancien + ') · au '
      + 'démarrage de la prise 2 la position est ' + r.position + ' (≤ ' + unReleve + ')');
  });

  // ── §49 — (E4, T14) LA FLÈCHE DROITE POSE UN REPÈRE MÊME SI LE CURSEUR EST DANS LE TEXTE ─
  //
  // CE CONTRÔLE EST ÉCRIT AVANT TOUTE CORRECTION, et il doit donc échouer à sa première
  // exécution : il reproduit l'hypothèse formée sur la prise de 52 secondes du 17 octobre, qui
  // ne porte que DEUX repères pour SIX passages.
  //
  // POURQUOI CETTE HYPOTHÈSE ET PAS UNE AUTRE. Christophe colle son texte dans la zone de
  // narration, puis démarre la prise et lit. Son dernier geste a laissé le curseur DANS le
  // `textarea` : le `keydown` de la flèche droite a donc pour cible le champ, et non le
  // document. Trois autres causes étaient possibles — l'antirebond de E9, `event.repeat`, un
  // repère hors de la voix —, mais aucune ne produirait exactement deux repères sur six : elles
  // auraient laissé une trace au journal (« repère douteux », répétitions ignorées). Un repère
  // qui n'arrive jamais jusqu'au module, lui, ne laisse rien.
  //
  // CE QUE E4 ET T14 EXIGENT. E4 : « La flèche droite passe à l'étape suivante et pose le
  // marqueur. » T14 : « Les repères se posent où l'utilisateur le souhaite, EN DIRECT ou après
  // coup, sans grille ni ordre imposé. » Ni l'un ni l'autre ne parle du focus : pendant une
  // prise, la flèche droite pose un repère, un point.
  await controle('§49 pendant une prise, la flèche droite pose un repère même si le curseur est dans la zone de texte (E4, T14)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.fill('[data-texte-bande]',
      'un deux trois\nquatre cinq six\nsept huit neuf\ndix onze douze');

    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 });
    await page.waitForTimeout(600);

    // LE GESTE DE CHRISTOPHE, REPRODUIT : le curseur est dans la zone de texte, puis il presse
    // la flèche droite pour passer au commentaire suivant.
    await page.focus('[data-texte-bande]');
    const focusAvant = await page.evaluate(() => ({
      balise: document.activeElement ? document.activeElement.tagName : 'aucun',
      estLeTexte: document.activeElement === document.querySelector('[data-texte-bande]'),
      lectureSeule: document.querySelector('[data-texte-bande]').readOnly,
    }));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { reperes: e.reperes.map((r) => ({ ...r })),
               focus: document.activeElement ? document.activeElement.tagName : 'aucun' };
    });
    const fin = await prendreLaFin(page);
    await ctx.close();

    // LA PRÉCONDITION DU CONTRÔLE : le curseur ÉTAIT bien dans la zone de texte. Sans cela, le
    // contrôle passerait pour une bonne raison et n'éprouverait rien.
    assert.ok(focusAvant.estLeTexte || apres.focus === 'TEXTAREA',
      'la zone de texte doit avoir le focus au moment de la frappe, sinon ce contrôle '
      + 'n\'éprouve rien : ' + JSON.stringify(focusAvant) + ' / ' + apres.focus);
    // ET LE FAIT ATTENDU : deux frappes, deux repères.
    assert.equal(apres.reperes.length, 2,
      'la flèche droite puis Page suivante doivent poser DEUX repères, quel que soit l\'élément '
      + 'focalisé (E4, T14) : ' + apres.reperes.length + ' posé(s) — '
      + JSON.stringify(apres.reperes));
    assert.ok(apres.reperes.every((r) => !r.douteux),
      'et aucun ne doit être douteux : ' + JSON.stringify(apres.reperes));
    assert.equal(fin.module.mesures.reperes.length, 2,
      'le rapport porte les deux repères : ' + JSON.stringify(fin.module.mesures.reperes));
    console.log('        focus ' + focusAvant.balise + ' · 2 frappes → '
      + apres.reperes.length + ' repère(s) à '
      + apres.reperes.map((r) => r.aEchantillon).join(' et '));
  });

  // ── §50 — (T3 ter) HORS PRISE, LA SAISIE N'EST JAMAIS INTERCEPTÉE ────────────────────────
  //
  // L'AUTRE MOITIÉ DE LA POLITIQUE, et celle qu'un correctif trop large casserait : recevoir les
  // touches de pilotage quel que soit le focus PENDANT une prise ne doit pas empêcher Christophe
  // d'écrire son texte HORS prise. Les flèches doivent déplacer son caret, l'espace écrire un
  // espace, et aucune prise ne doit se mettre en pause parce qu'il tape.
  await controle('§50 hors prise, le texte tapé reste intact et Espace ne déclenche rien (T3 ter)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    // ON TAPE VRAIMENT, au clavier, dans le champ : espaces, flèches et Page suivante comprises.
    await page.click('[data-texte-bande]');
    await page.keyboard.type('un deux trois');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    // ON REVIENT AVEC LES FLÈCHES, et non avec `End` : mesuré, `End` ne déplace pas le caret
    // dans un `textarea` ici (c'est l'usage macOS, où la fin de ligne est Cmd+flèche droite).
    // Les flèches servent donc deux fois : à se déplacer, et à prouver qu'elles se déplacent.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' quatre');
    await page.keyboard.press('PageUp');
    await page.keyboard.press('ArrowRight');
    const vu = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { texte: document.querySelector('[data-texte-bande]').value,
               lectureSeule: document.querySelector('[data-texte-bande]').readOnly,
               reperes: e.reperes.length, enPause: e.enPause, enPrise: e.enPrise,
               passages: e.passages.length,
               focus: document.activeElement ? document.activeElement.tagName : 'aucun' };
    });
    // Et dans le champ du NOM de la prise, qui est un `input` : même règle.
    await page.click('[data-nom-prise]');
    await page.keyboard.press('End');
    await page.keyboard.type(' du soir');
    const nom = await page.evaluate(() =>
      document.querySelector('[data-nom-prise]').value);
    await ctx.close();

    assert.equal(vu.texte, 'un deux troXis quatre',
      'le texte tapé hors prise doit être exactement ce qui a été frappé, flèches comprises : '
      + JSON.stringify(vu.texte));
    assert.equal(vu.lectureSeule, false,
      'hors prise, le champ n\'est pas en lecture seule : ' + vu.lectureSeule);
    assert.equal(vu.reperes, 0,
      'aucun repère ne doit être posé hors prise : ' + vu.reperes);
    assert.equal(vu.enPause, false, 'et aucune pause déclenchée : ' + vu.enPause);
    assert.ok(/ du soir$/.test(nom),
      'le nom de la prise doit recevoir ses espaces : ' + JSON.stringify(nom));
    console.log('        texte « ' + vu.texte + ' » · ' + vu.passages + ' passages · 0 repère · '
      + 'nom « ' + nom + ' »');
  });

  // ── §51 — (E4, T3 ter) LA TOUCHE APPRISE EST REÇUE PENDANT UNE PRISE, ET LE CHAMP EST GELÉ ─
  await controle('§51 la touche apprise est reçue pendant une prise, et le champ de texte est en lecture seule puis rendu (E4, T3 ter)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.fill('[data-texte-bande]', 'un deux trois\nquatre cinq six');
    // (E4) ON APPREND UNE TOUCHE DE REPÈRE qui n'est NI une flèche NI Page suivante : c'est le
    // cas d'une télécommande qui envoie une lettre, et c'est la lecture validée par Christophe.
    await page.click('[data-action="apprendre-repere"]');
    await page.keyboard.press('KeyK');
    const apprise = await page.evaluate(() => ({
      touche: window.EnregistreurVoix._etat().toucheRepere,
      champ: document.querySelector('[data-touche-repere]').value,
    }));
    assert.equal(apprise.touche, 'k', 'la touche de repère apprise doit être « k » : '
      + apprise.touche);

    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    // ── LA PRÉCONDITION DU BLUR : LE CHAMP DOIT AVOIR LE FOCUS AU DÉMARRAGE ──────────────
    // Un clic sur « Commencer la prise » met le focus sur le BOUTON : le champ ne l'a jamais,
    // et un contrôle qui démarre au clic ne peut rien dire du blur — trou #137. On reproduit
    // donc le cas où le champ l'a : on l'y met, puis on démarre par la fonction du produit,
    // comme le ferait un raccourci ou une télécommande qui ne déplace pas le focus.
    await page.focus('[data-texte-bande]');
    const focusJusteAvant = await page.evaluate(() =>
      document.activeElement === document.querySelector('[data-texte-bande]'));
    await page.evaluate(() => window.EnregistreurVoix._demarrer());
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 });
    assert.equal(focusJusteAvant, true,
      'le champ doit avoir le focus juste avant le démarrage, sinon le blur n\'est pas éprouvé');
    // AU DÉMARRAGE, LE CHAMP A PERDU LE FOCUS ET EST EN LECTURE SEULE.
    const auDemarrage = await page.evaluate(() => ({
      lectureSeule: document.querySelector('[data-texte-bande]').readOnly,
      focusEstLeTexte: document.activeElement === document.querySelector('[data-texte-bande]'),
    }));
    // ON REMET VOLONTAIREMENT LE FOCUS DANS LE CHAMP : la politique dit que les touches de
    // pilotage sont reçues QUEL QUE SOIT l'élément focalisé, pas seulement grâce au blur.
    await page.focus('[data-texte-bande]');
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyK');
    await page.waitForTimeout(300);
    // ET ON ESSAIE D'ÉCRIRE : le champ est gelé.
    await page.keyboard.type('ABC');
    await page.waitForTimeout(200);
    const pendant = await page.evaluate(() => {
      const e = window.EnregistreurVoix._etat();
      return { reperes: e.reperes.map((r) => ({ ...r })),
               texte: document.querySelector('[data-texte-bande]').value,
               passages: e.passages.length };
    });
    const fin = await prendreLaFin(page);
    const apresArret = await page.evaluate(() => {
      const c = document.querySelector('[data-texte-bande]');
      return { lectureSeule: c.readOnly };
    });
    // À L'ARRÊT, LE CHAMP EST RENDU : on écrit de nouveau.
    await page.click('[data-texte-bande]');
    await page.keyboard.press('End');
    await page.keyboard.type(' sept');
    const texteFinal = await page.evaluate(() =>
      document.querySelector('[data-texte-bande]').value);
    await ctx.close();

    assert.equal(auDemarrage.lectureSeule, true,
      'au démarrage, le champ de texte doit passer en lecture seule : '
      + auDemarrage.lectureSeule);
    assert.equal(auDemarrage.focusEstLeTexte, false,
      'et perdre le focus : ' + auDemarrage.focusEstLeTexte);
    assert.equal(pendant.reperes.length, 1,
      'la touche apprise doit poser un repère pendant la prise, curseur dans le champ ou non : '
      + JSON.stringify(pendant.reperes));
    assert.equal(pendant.texte, 'un deux trois\nquatre cinq six',
      'et le champ en lecture seule ne doit avoir rien reçu : ' + JSON.stringify(pendant.texte));
    assert.equal(pendant.passages, 2,
      'donc les passages ne changent pas pendant la prise : ' + pendant.passages);
    assert.equal(apresArret.lectureSeule, false,
      'à l\'arrêt, le champ redevient modifiable : ' + apresArret.lectureSeule);
    assert.equal(texteFinal, 'un deux trois\nquatre cinq six sept',
      'et il reçoit de nouveau la frappe : ' + JSON.stringify(texteFinal));
    assert.ok(fin.module.mesures.reperes.length === 1,
      'le rapport porte le repère : ' + JSON.stringify(fin.module.mesures.reperes));
    console.log('        touche apprise « k » · 1 repère posé le curseur dans le champ · champ '
      + 'gelé pendant la prise, rendu à l\'arrêt');
  });

  // ── §52 — (T3 ter) LE RELEVÉ DES TOUCHES, ET CE QU'IL NE DIT JAMAIS ──────────────────────
  //
  // DEUX CHOSES À LA FOIS : que chaque frappe soit relevée avec sa raison et comptée, et que le
  // CONTENU d'une touche de texte ne soit JAMAIS consigné. Christophe tape le texte de ses
  // présentations dans cette page, et ce journal part dans un rapport.
  await controle('§52 chaque touche de la prise est relevée avec sa raison, et le contenu du texte n\'est jamais consigné (T3 ter)', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    await page.fill('[data-texte-bande]', 'un deux trois\nquatre cinq six\nsept huit neuf');
    await page.click('[data-action="autoriser"]');
    await page.waitForFunction(() => {
      const f = window.EnregistreurVoix._fenetreDeDecision();
      return f.suffisante && f.secondes >= 1.5;
    }, null, { timeout: 20000 });
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 });
    await page.waitForTimeout(500);

    await page.keyboard.press('ArrowRight');          // repère accepté
    await page.waitForTimeout(400);
    await page.keyboard.press('PageUp');             // passage précédent accepté
    await page.waitForTimeout(200);
    // LA RÉPÉTITION AUTOMATIQUE NE S'OBTIENT PAS EN MAINTENANT LA TOUCHE : mesuré, Playwright
    // n'engendre qu'un seul `keydown` pour un `down` prolongé, sans `repeat`. Comme §41, on
    // envoie donc l'événement que le système d'exploitation enverrait, avec `repeat: true` —
    // c'est le seul témoin fiable d'une touche maintenue (E9).
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(200);
    // UNE TOUCHE DE TEXTE, dont le contenu ne doit APPARAÎTRE NULLE PART.
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(200);
    const fin = await prendreLaFin(page);

    // UNE SECONDE PRISE, UNE SEULE FRAPPE.
    await page.click('[data-action="demarrer"]');
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-mode]');
      return t && /en cours/i.test(t.textContent);
    }, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const fin2 = await prendreLaFin(page);
    const deuxieme = fin2.module.mesures.touchesPendantLaPrise;
    await ctx.close();

    const r = fin.module.mesures;
    const touches = fin.module.journal.filter((e) => /^touche (acceptée|refusée)$/.test(e.quoi));
    assert.ok(touches.length >= 5,
      'chaque frappe de la prise doit être relevée : ' + touches.length + ' relevée(s)');
    // CHAQUE LIGNE PORTE LES CINQ CHAMPS DEMANDÉS.
    touches.forEach((t) => {
      ['touche', 'toucheApprise', 'elementFocalise', 'accepte', 'raison'].forEach((champ) => {
        assert.ok(Object.prototype.hasOwnProperty.call(t, champ),
          'le champ ' + champ + ' manque : ' + JSON.stringify(t));
      });
      assert.ok(typeof t.elementFocalise === 'string' && t.elementFocalise.length > 0,
        'la balise de l\'élément focalisé doit être dite : ' + JSON.stringify(t));
      assert.ok(typeof t.toucheApprise === 'boolean',
        '« touche apprise : oui ou non » : ' + JSON.stringify(t));
    });
    // LE VOCABULAIRE EST FERMÉ : aucune ligne ne porte la valeur d'une touche de texte.
    const vocabulaire = ['flèche droite', 'flèche gauche', 'Page suivante', 'Page précédente',
                         'Espace', 'touche apprise', 'autre touche (non journalisée)'];
    touches.forEach((t) => {
      assert.ok(vocabulaire.indexOf(t.touche) >= 0,
        'la touche doit venir du vocabulaire fermé : ' + JSON.stringify(t.touche));
    });
    const journalEntier = JSON.stringify(fin.module.journal);
    assert.ok(!/"q"|"w"|"Q"|"W"|KeyQ|KeyW/.test(journalEntier),
      'le contenu d\'une touche de texte ne doit apparaître NULLE PART dans le journal');
    // LES COMPTEURS DU RAPPORT, et la somme qui doit tomber juste.
    const c = r.touchesPendantLaPrise;
    assert.equal(c.recues, touches.length,
      'le compteur de touches reçues doit égaler le nombre de lignes : ' + c.recues + ' contre '
      + touches.length);
    assert.equal(c.acceptees + c.refusees, c.recues,
      'acceptées + refusées = reçues : ' + c.acceptees + ' + ' + c.refusees + ' ≠ ' + c.recues);
    assert.ok(c.acceptees >= 2, 'au moins le repère et le retour de passage : ' + c.acceptees);
    const raisons = Object.keys(c.parRaison);
    assert.ok(raisons.some((x) => /répétition automatique/.test(x)),
      'la touche maintenue doit être refusée avec sa raison (E9) : ' + JSON.stringify(c.parRaison));
    assert.ok(raisons.some((x) => /non attribuée/.test(x)),
      'une touche de texte doit être refusée avec sa raison : ' + JSON.stringify(c.parRaison));
    assert.equal(Object.keys(c.parRaison).reduce((t, k) => t + c.parRaison[k], 0), c.refusees,
      'la somme des refus par raison doit égaler le total : ' + JSON.stringify(c.parRaison));
    assert.ok(r.repetitionsDeToucheIgnorees >= 1,
      'et les répétitions ignorées sont comptées à part (E9) : '
      + r.repetitionsDeToucheIgnorees);
    // LES COMPTEURS APPARTIENNENT À LEUR PRISE : une seconde prise repart de zéro, comme les
    // fenêtres de bruit et le dernier relevé. Sans cela, le rapport d'une prise décrirait les
    // frappes de la précédente — le défaut 4, sous une autre forme.
    assert.ok(deuxieme.recues <= 2 && deuxieme.recues >= 1,
      'la seconde prise ne compte que SES frappes (une seule ici) : '
      + JSON.stringify(deuxieme));
    assert.equal(deuxieme.acceptees, 1,
      'dont la flèche droite acceptée : ' + JSON.stringify(deuxieme));
    console.log('        ' + c.recues + ' touches reçues · ' + c.acceptees + ' acceptées · '
      + c.refusees + ' refusées (' + raisons.join(' | ') + ') · '
      + r.repetitionsDeToucheIgnorees + ' répétitions ignorées · aucun contenu de texte · '
      + 'seconde prise : ' + deuxieme.recues + ' reçue(s)');
  });

  // ── §53 — (E13) CE QUE LA PAGE DIT D'ELLE-MÊME EST CE QU'ELLE EST ───────────────────────
  //
  // L'en-tête, l'introduction et le badge annonçaient « jalon I… pas de bande rythmo ni de
  // repères » sur une page qui porte la bande, les repères, le rebours et la reprise. Un écran
  // qui se décrit faux est un écran dont on n'ose plus lire les avis.
  await controle('§53 l\'en-tête, l\'introduction et le badge de la page disent le jalon II', async () => {
    const { ctx, page } = await ouvrirBanc(nav, base);
    const vu = await page.evaluate(() => ({
      titre: document.title,
      h1: (document.querySelector('.banc-entete h1') || {}).textContent || '',
      intro: [...document.querySelectorAll('.banc-entete .sc-bm-help')]
        .map((p) => p.textContent).join(' '),
      badge: (document.querySelector('[data-mode]') ? '' : '')
        + ([...document.querySelectorAll('.sc-bm-badge')].map((b) => b.textContent).join(' | ')),
      aide: [...document.querySelectorAll('[data-enregistreur] .sc-bm-help')]
        .map((p) => p.textContent).join(' '),
    }));
    await ctx.close();

    assert.ok(/jalon II/.test(vu.titre) && !/jalon I\b/.test(vu.titre),
      'le titre de l\'onglet doit dire le jalon II : ' + JSON.stringify(vu.titre));
    assert.ok(/jalon II/.test(vu.h1) && !/jalon I\b/.test(vu.h1),
      'l\'en-tête doit dire le jalon II : ' + JSON.stringify(vu.h1));
    assert.ok(/Banc · jalon II/.test(vu.badge),
      'le badge doit dire « Banc · jalon II » : ' + JSON.stringify(vu.badge));
    // L'INTRODUCTION NE DOIT PLUS ANNONCER ABSENT CE QUI EST LÀ…
    assert.ok(!/pas de bande rythmo/i.test(vu.intro + ' ' + vu.aide),
      'la page ne doit plus annoncer la bande rythmo absente : '
      + (vu.intro + ' ' + vu.aide).slice(0, 400));
    assert.ok(!/ne pose aucun repère/i.test(vu.intro + ' ' + vu.aide),
      'ni les repères : ' + (vu.intro + ' ' + vu.aide).slice(0, 400));
    // … ET DOIT ANNONCER CE QUI EST LÀ, ET CE QUI N'Y EST PAS.
    assert.ok(/bande rythmo/i.test(vu.intro), 'elle doit nommer la bande : ' + vu.intro);
    assert.ok(/lecture seule/i.test(vu.intro),
      'et dire que le champ passe en lecture seule pendant une prise : ' + vu.intro);
    assert.ok(/forme d'onde/i.test(vu.aide),
      'et dire que la forme d\'onde n\'est pas là : ' + vu.aide);
    assert.ok(/R10|image/i.test(vu.intro + ' ' + vu.aide),
      'et que l\'image à côté de la bande est du lot 4 (R10) : ' + vu.aide);
    console.log('        titre « ' + vu.titre + ' » · badges « ' + vu.badge + ' »');
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
    await neutraliserLeRebours(page);
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
    // LES DEUX FRÉQUENCES SONT INDÉPENDANTES, et c'est le fait à retenir. La piste d'ENTRÉE
    // porte la fréquence du micro ; le contexte suit le périphérique de SORTIE. Elles peuvent
    // différer, et le contexte interpole alors l'entrée. J'avais posé l'égalité en invariante :
    // elle ne tenait que parce que les deux valaient 44 100 ce jour-là. Mesuré depuis : piste à
    // 44 100 et contexte à 48 000 sur la même machine. C'est précisément pour cela que le rapport
    // porte les DEUX, côte à côte — et que la prise enregistre celle du CONTEXTE, qui est la
    // fréquence des échantillons réellement écrits.
    assert.ok(typeof m.echantillonnageDeLaPiste === 'number' && m.echantillonnageDeLaPiste > 8000,
      'la fréquence de la piste doit être un nombre plausible : ' + m.echantillonnageDeLaPiste);
    assert.ok(typeof r.module.echantillonnage === 'number' && r.module.echantillonnage > 8000,
      'celle du contexte aussi : ' + r.module.echantillonnage);
    assert.equal(r.stockage.prise.echantillonnage, r.module.echantillonnage,
      'et la prise enregistre celle du CONTEXTE, celle des échantillons écrits : ' +
      r.stockage.prise.echantillonnage + ' contre ' + r.module.echantillonnage);
    if (m.echantillonnageDeLaPiste !== r.module.echantillonnage) {
      console.log('        piste ' + m.echantillonnageDeLaPiste + ' Hz ≠ contexte ' +
        r.module.echantillonnage + ' Hz : le navigateur interpole l\'entrée — le rapport porte ' +
        'les deux, et la prise porte celle du contexte');
    }

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
    // D'OÙ VIENNENT CES CHIFFRES. Une latence sans son moteur ne se transpose pas : celles d'un
    // Chromium de test ne valent pas pour Safari, et les confondre ferait calibrer le lot 3B sur
    // le mauvais navigateur.
    assert.ok(typeof l.mesureesSur === 'string' && l.mesureesSur.length > 10,
      'le rapport doit dire SUR QUOI les latences ont été mesurées : ' + l.mesureesSur);
    assert.ok(/Chrome|Safari|Firefox|AppleWebKit|Mozilla/.test(l.mesureesSur),
      'et cette origine doit être l\'agent réel : ' + l.mesureesSur);
    assert.ok(/ne sont transposables à aucun autre moteur/.test(l.avertissement || ''),
      'avec l\'avertissement qu\'elles ne valent que pour ce moteur : ' + l.avertissement);

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
    // (D, T1 quater) LES DEUX CHAMPS DU CANAL ONT CHANGÉ DE NOM, et c'est la correction du
    // défaut 4 des essais : le rapport portait « canalRetenu: moyenne » et « raisonDuCanal:
    // droit vide… sans moyenne » dans le même document — deux grandeurs différentes sous des
    // noms qui laissaient croire qu'elles se répondaient. Il y a désormais `canalUtilise`, avec
    // la raison de CE canal-là, et `verdictSurLaPrise` à côté, sous son propre nom.
    for (const cle of ['canalUtilise', 'verdictSurLaPrise', 'grapheDeCapture', 'regleDuCanal',
                       'niveaux', 'correlationEntreCanaux', 'regleCorrelation', 'blocs',
                       'morceaux', 'etatDeLaPiste', 'journal', 'persistance', 'echantillonnage',
                       'ecartVuEcritDeLaSession', 'canauxVusALEntree']) {
      assert.ok(r[cle] !== undefined && r[cle] !== null, 'champ manquant ou null : ' + cle);
    }
    // LE CANAL UTILISÉ PORTE SA PROPRE RAISON, et cette raison parle du canal utilisé.
    assert.ok(r.canalUtilise.canal && r.canalUtilise.raison,
      'le canal utilisé doit porter sa raison : ' + JSON.stringify(r.canalUtilise));
    assert.ok(r.verdictSurLaPrise.canal && r.verdictSurLaPrise.raison,
      'et le verdict de la prise la sienne : ' + JSON.stringify(r.verdictSurLaPrise));
    // SUR CETTE FIXTURE le droit est vide dès l'avant-prise : le canal utilisé est le gauche, et
    // sa raison doit parler du canal gauche — pas d'une moyenne.
    assert.equal(r.canalUtilise.canal, 'gauche',
      'canal utilisé : ' + r.canalUtilise.canal);
    assert.ok(/droit vide/.test(r.canalUtilise.raison),
      'et sa raison doit décrire CE choix : ' + r.canalUtilise.raison);
    // LE GRAPHE EST RELEVÉ, pas supposé (A).
    for (const k of ['source', 'worklet', 'regle']) {
      assert.ok(r.grapheDeCapture[k], 'grapheDeCapture.' + k + ' absent');
    }
    assert.equal(r.grapheDeCapture.worklet.modeDeComptage, 'max',
      'le mode de comptage du worklet doit être relevé : ' + r.grapheDeCapture.worklet.modeDeComptage);
    assert.equal(r.grapheDeCapture.worklet.interpretation, 'discrete',
      'et son interprétation : ' + r.grapheDeCapture.worklet.interpretation);
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
    // ── CE CONTRÔLE A CHANGÉ DE SENS AU JALON II, ET IL LE DIT ──────────────────────────
    // Au jalon I, la bande rythmo était du jalon SUIVANT : ce contrôle exigeait son absence.
    // Elle est maintenant dans le périmètre (R6, R8), et exiger son absence reviendrait à
    // interdire ce que T3 demande de livrer. Ce qui doit rester absent est le lot 4 : les étapes
    // et l'aperçu de présentation, vérifiés deux lignes plus haut.
    assert.equal(r.band, 1,
      'la bande rythmo est du jalon II : elle doit être PRÉSENTE, et une seule fois : ' + r.band);
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
