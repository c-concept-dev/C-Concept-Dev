#!/usr/bin/env node
// SUITE 2 — LA MIRE DE SYNCHRONISATION, EN CADENCE CONSTANTE
//
// Deux fichiers, pour deux usages qu'il ne faut pas confondre :
//
//   MIRE-CFR-mesure.mp4   — 9 paires flash/bip ALIGNÉES (décalage nul), toutes les 3 s.
//                           Sert à MESURER l'écart qu'un lecteur introduit de lui-même.
//   MIRE-CFR-echelle.mp4  — 9 paires dont le bip est décalé de -160 à +160 ms par pas de 40,
//                           numérotées à l'écran. Sert au JUGEMENT À L'OREILLE de Christophe :
//                           la paire qui lui paraît synchrone donne le décalage du lecteur, qui
//                           est l'OPPOSÉ du décalage de cette paire.
//
// Les deux en cadence constante à 30 i/s, flash de 150 ms (5 images), bip de 50 ms — la cadence
// constante étant retenue, mesurer encore des images tenues n'aurait plus d'objet.

const fs = require('node:fs'), path = require('node:path');
const pw = require('playwright');
const { servir } = require('./serveur.cjs');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const PLAN = {
  largeur: 1920, hauteur: 1080, ips: 30, duree: 33, se: 48000,
  flashS: 0.150, bipS: 0.050, bipHz: 1000,
  instants: [3, 6, 9, 12, 15, 18, 21, 24, 27],
  // Décalages de l'échelle, en ms. Négatif = bip EN AVANCE sur le flash.
  echelle: [-160, -120, -80, -40, 0, 40, 80, 120, 160],
};

async function produire(page, plan, decalages) {
  return page.evaluate(async (a) => {
    const P = a.plan, DEC = a.decalages;
    const mod = await import('/vendeur/mediabunny.mjs');
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH } = mod;
    const L = P.largeur, H = P.hauteur, SE = P.se;
    const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const canvas = document.createElement('canvas'); canvas.width = L; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const vs = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
    sortie.addVideoTrack(vs, { frameRate: P.ips });

    // ── audio : un bip par paire, décalé selon l'échelle ──
    const ctxA = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SE });
    const n = Math.round(P.duree * SE);
    const buf = ctxA.createBuffer(1, n, SE), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.015 * Math.sin(2 * Math.PI * 160 * i / SE);
    P.instants.forEach((t, k) => {
      const dec = (DEC && DEC.length ? DEC[k] : 0) / 1000;
      const d0 = Math.round((t + dec) * SE);
      const d1 = Math.min(n, d0 + Math.round(P.bipS * SE));
      for (let i = Math.max(0, d0); i < d1; i++) {
        const p = (i - d0) / (d1 - d0);
        // Attaque FRANCHE, pas d'enveloppe en cloche : le pic doit coïncider avec le début, sinon
        // la mesure du décalage hériterait des 20 ms d'artefact déjà rencontrés au lot 0.
        d[i] = 0.9 * Math.sin(2 * Math.PI * P.bipHz * (i - d0) / SE) * Math.min(1, (1 - p) * 8);
      }
    });
    const as = new AudioBufferSource({ codec: 'aac', bitrate: 128000 });
    sortie.addAudioTrack(as);
    await sortie.start(); await as.add(buf); as.close();

    // ── vidéo : fond sombre, grand numéro visible AVANT le flash, puis flash blanc ──
    function fond(numero) {
      ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, L, H);
      if (numero) {
        ctx.fillStyle = '#eef2f6';
        ctx.font = '700 420px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(numero), L / 2, H / 2);
        ctx.font = '400 44px -apple-system, system-ui, sans-serif';
        ctx.fillText('paire ' + numero, L / 2, H / 2 + 300);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    function dessiner(t) {
      // Le numéro de la paire à venir s'affiche pendant les 2 s qui précèdent son flash.
      let numero = 0;
      for (let k = 0; k < P.instants.length; k++) {
        const tf = P.instants[k];
        if (t >= tf - 2 && t < tf + P.flashS) numero = k + 1;
      }
      fond(numero);
      for (const tf of P.instants) {
        if (t >= tf - 1e-9 && t < tf + P.flashS - 1e-9) {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, H);
          break;
        }
      }
    }

    const total = Math.round(P.duree * P.ips), pas = 1 / P.ips;
    const t0 = performance.now();
    for (let k = 0; k < total; k++) { dessiner(k * pas); await vs.add(k * pas, pas); }
    vs.close(); await sortie.finalize();
    const ms = Math.round(performance.now() - t0);
    const u8 = new Uint8Array(sortie.target.buffer);
    let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return { b64: btoa(s), images: total, ms };
  }, { plan, decalages });
}

(async () => {
  fs.mkdirSync(PAQUET, { recursive: true });
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const resume = [];
  for (const [nom, dec] of [['MIRE-CFR-mesure.mp4', null], ['MIRE-CFR-echelle.mp4', PLAN.echelle]]) {
    const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
    await page.waitForFunction(() => typeof window.__essai3Api === 'object');
    const r = await produire(page, PLAN, dec);
    await page.close();
    const f = path.join(PAQUET, nom);
    fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
    console.log('  ' + nom.padEnd(26) + String(Math.round(fs.statSync(f).size / 1024)).padStart(5) + ' Ko   '
      + r.images + ' images   ' + (r.ms / 1000).toFixed(1) + ' s'
      + (dec ? '   échelle ' + dec.join(', ') + ' ms' : '   décalages nuls'));
    resume.push({ fichier: nom, octets: fs.statSync(f).size, images: r.images, encodage_ms: r.ms,
                  decalages_ms: dec });
  }
  await nav.close(); serveur.close();
  fs.mkdirSync(path.join(RACINE, 'mesures'), { recursive: true });
  fs.writeFileSync(path.join(RACINE, 'mesures', 'mire-cfr.json'),
    JSON.stringify({ plan: PLAN, fichiers: resume }, null, 2), 'utf8');
})();
