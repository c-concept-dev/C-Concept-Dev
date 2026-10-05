#!/usr/bin/env node
// COMPLÉMENT 7, POINT 2 — CINQ VARIANTES D'UN MÊME CONTENU DE 40 s
//
// Christophe perd les flashs d'une seule image dans Chrome, et trouve les fondus plus lents et
// plus flous que dans QuickTime. Le fichier est pourtant correct. Pour séparer « c'est Chrome » de
// « c'est la structure de notre export », il faut faire varier UNE chose à la fois sur un contenu
// rigoureusement identique (outils/contenu-variantes.cjs).
//
//   V1  images TENUES, plage pleine            — l'export actuel
//   V2  cadence constante 30 i/s               — seule l'écriture change
//   V3  images tenues + une image chaque seconde — borne la durée d'une image tenue
//   V4  V2 RÉÉTIQUETÉE plage limitée BT.709, flux binaire COPIÉ (aucun réencodage)
//   V5  témoin ffmpeg/libx264, cadence constante, yuv420p plage limitée BT.709
//
// POURQUOI V4 N'EST PAS PRODUITE PAR LE NAVIGATEUR, et c'est une limite mesurée, pas un choix de
// confort : Mediabunny n'accepte en entrée que `colorSpace: 'srgb' | 'display-p3'` (lu dans son
// dist) et RECOPIE pour la sortie l'espace que lui donne l'encodeur WebCodecs — il n'existe aucun
// moyen de lui faire écrire une plage limitée. V4 est donc obtenue par réétiquetage ffmpeg SANS
// réencodage : cela isole l'ÉTIQUETTE du CODEC, ce que V5 (réencodage complet) ne permet pas.
//
// Si V4 et V5 corrigent le défaut mais pas V2, c'est la plage ; si V2 le corrige, c'est l'écriture
// en images tenues. Aucune de ces conclusions n'est tirée ici : ce banc ne fait que produire.

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const pw = require('playwright');
const { servir } = require('./serveur.cjs');
const { PLAN } = require('./contenu-variantes.cjs');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const FF = path.join(RACINE, 'ffmpeg-externe', 'node_modules', 'ffmpeg-static', 'ffmpeg');

// Le rendu, exécuté DANS la page. Un seul dessin pour les trois modes : seule la LISTE des
// instants écrits change, jamais le contenu dessiné.
async function produire(page, mode, plan) {
  return page.evaluate(async (a) => {
    const P = a.plan, mode = a.mode;
    const mod = await import('/vendeur/mediabunny.mjs');
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
            QUALITY_HIGH } = mod;
    const L = P.largeur, H = P.hauteur, SE = 48000;
    const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const canvas = document.createElement('canvas'); canvas.width = L; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const vs = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
    sortie.addVideoTrack(vs, { frameRate: P.ips });

    // ── audio : un bip de 50 ms au début de chaque flash ──
    const ctxA = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SE });
    const n = Math.round(P.duree * SE);
    const buf = ctxA.createBuffer(1, n, SE), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.02 * Math.sin(2 * Math.PI * 160 * i / SE);
    for (const t of P.instantsFlash) {
      const d0 = Math.round(t * SE), d1 = Math.min(n, d0 + Math.round(P.bipS * SE));
      for (let i = d0; i < d1; i++) {
        const p = (i - d0) / (d1 - d0);
        d[i] = 0.85 * Math.sin(2 * Math.PI * P.bipHz * (i - d0) / SE) * Math.sin(Math.PI * p);
      }
    }
    const as = new AudioBufferSource({ codec: 'aac', bitrate: 128000 });
    sortie.addAudioTrack(as);
    await sortie.start(); await as.add(buf); as.close();

    // ── dessin d'une image à l'instant t ──
    function diapo(i, alpha) {
      const s = P.diapositives[i];
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.fond; ctx.fillRect(0, 0, L, H);
      ctx.fillStyle = s.sombre ? '#1a1a1a' : '#f7f4ee';
      ctx.font = '700 120px -apple-system, system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.titre, 140, 520);
      ctx.font = '400 56px -apple-system, system-ui, sans-serif';
      ctx.fillText(s.sous, 140, 620);
      ctx.globalAlpha = 1;
    }
    function dessiner(t) {
      ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, L, H);
      let fait = false;
      for (let i = 0; i < P.bornes.length; i++) {
        const [d0, f0] = P.bornes[i];
        if (t >= d0 && t < f0) { diapo(i, 1); fait = true; break; }
        if (i < P.bornes.length - 1) {
          const d1 = P.bornes[i + 1][0];
          if (t >= f0 && t < d1) {               // fondu croisé
            const k = (t - f0) / (d1 - f0);
            diapo(i, 1); diapo(i + 1, k); fait = true; break;
          }
        }
      }
      if (!fait) diapo(P.bornes.length - 1, 1);
      // le flash recouvre tout, par-dessus
      for (const tf of P.instantsFlash) {
        if (t >= tf - 1e-9 && t < tf + P.flashS - 1e-9) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, H);
          break;
        }
      }
    }

    // ── la LISTE des instants écrits : c'est tout ce qui distingue les trois modes ──
    const pas = 1 / P.ips;
    let instants = [];
    if (mode === 'cfr') {
      const total = Math.round(P.duree * P.ips);
      for (let k = 0; k < total; k++) instants.push(k * pas);
    } else {
      const ens = new Set([0]);
      for (let i = 0; i < P.bornes.length - 1; i++) {
        const f0 = P.bornes[i][1], d1 = P.bornes[i + 1][0];
        const nb = Math.round((d1 - f0) * P.ips);
        for (let k = 0; k < nb; k++) ens.add(+(f0 + k * pas).toFixed(6));   // 12 images par fondu
        ens.add(+d1.toFixed(6));
      }
      for (const tf of P.instantsFlash) {
        ens.add(+tf.toFixed(6));
        ens.add(+(tf + P.flashS).toFixed(6));
      }
      if (mode === 'tenue-repetee') {
        for (let s = 1; s < P.duree; s++) ens.add(s);
      }
      instants = Array.from(ens).filter((x) => x < P.duree).sort((x, y) => x - y);
    }

    const t0 = performance.now();
    for (let i = 0; i < instants.length; i++) {
      const t = instants[i];
      const duree = (i + 1 < instants.length ? instants[i + 1] : P.duree) - t;
      if (duree <= 0) continue;
      dessiner(t);
      await vs.add(t, duree);
    }
    vs.close();
    await sortie.finalize();
    const ms = Math.round(performance.now() - t0);
    const u8 = new Uint8Array(sortie.target.buffer);
    let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return { b64: btoa(s), images_ecrites: instants.length, ms };
  }, { mode, plan });
}

(async () => {
  if (!fs.existsSync(FF)) { console.error('ffmpeg absent (voir le rapport)'); process.exit(1); }
  fs.mkdirSync(PAQUET, { recursive: true });
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const resume = [];

  const variantes = [
    { cle: 'V1', mode: 'tenue',         nom: 'V1-images-tenues-plage-pleine.mp4' },
    { cle: 'V2', mode: 'cfr',           nom: 'V2-cadence-constante-30ips.mp4' },
    { cle: 'V3', mode: 'tenue-repetee', nom: 'V3-images-tenues-plus-une-par-seconde.mp4' },
  ];
  for (const v of variantes) {
    const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
    await page.waitForFunction(() => typeof window.__essai3Api === 'object');
    const r = await produire(page, v.mode, PLAN);
    await page.close();
    const f = path.join(PAQUET, v.nom);
    fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
    const ko = Math.round(fs.statSync(f).size / 1024);
    console.log('  ' + v.cle + '  ' + v.nom.padEnd(46) + String(ko).padStart(6) + ' Ko   '
      + String(r.images_ecrites).padStart(5) + ' images écrites   ' + (r.ms / 1000).toFixed(1) + ' s');
    resume.push({ cle: v.cle, fichier: v.nom, octets: fs.statSync(f).size,
                  images_ecrites: r.images_ecrites, encodage_ms: r.ms, origine: 'navigateur (WebCodecs)' });
  }
  await nav.close(); serveur.close();

  // ── V4 : réétiquetage SEUL, flux binaire copié ──────────────────────────────────────────────
  const src = path.join(PAQUET, 'V2-cadence-constante-30ips.mp4');
  const v4 = path.join(PAQUET, 'V4-cadence-constante-plage-limitee-reetiquetee.mp4');
  let v4ok = true, v4msg = '';
  const t4 = Date.now();
  try {
    execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src,
      '-c', 'copy', '-color_range', 'tv', '-color_primaries', 'bt709',
      '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-bsf:v', 'h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
      '-movflags', '+faststart', v4], { stdio: 'pipe' });
  } catch (e) { v4ok = false; v4msg = String(e.stderr || e.message).slice(0, 200); }
  if (v4ok) {
    console.log('  V4  ' + path.basename(v4).padEnd(46) + String(Math.round(fs.statSync(v4).size / 1024)).padStart(6)
      + ' Ko   flux COPIÉ, étiquette seule changée   ' + ((Date.now() - t4) / 1000).toFixed(1) + ' s');
    resume.push({ cle: 'V4', fichier: path.basename(v4), octets: fs.statSync(v4).size,
                  images_ecrites: null, encodage_ms: Date.now() - t4,
                  origine: 'ffmpeg, réétiquetage sans réencodage (bitstream copié)' });
  } else {
    console.log('  V4  ÉCHEC du réétiquetage : ' + v4msg.split('\n')[0]);
    resume.push({ cle: 'V4', echec: v4msg.split('\n')[0] });
  }

  // ── V5 : témoin libx264 ─────────────────────────────────────────────────────────────────────
  const v5 = path.join(PAQUET, 'V5-temoin-ffmpeg-libx264.mp4');
  const t5 = Date.now();
  execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-r', String(PLAN.ips), '-vsync', 'cfr',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'copy', '-movflags', '+faststart', v5], { stdio: 'pipe' });
  console.log('  V5  ' + path.basename(v5).padEnd(46) + String(Math.round(fs.statSync(v5).size / 1024)).padStart(6)
    + ' Ko   libx264 crf 20                      ' + ((Date.now() - t5) / 1000).toFixed(1) + ' s');
  resume.push({ cle: 'V5', fichier: path.basename(v5), octets: fs.statSync(v5).size,
                images_ecrites: null, encodage_ms: Date.now() - t5,
                origine: 'ffmpeg/libx264, cadence constante, yuv420p plage limitée BT.709' });

  fs.mkdirSync(path.join(RACINE, 'mesures'), { recursive: true });
  fs.writeFileSync(path.join(RACINE, 'mesures', 'variantes.json'),
    JSON.stringify({ plan: PLAN, variantes: resume }, null, 2), 'utf8');
})();
