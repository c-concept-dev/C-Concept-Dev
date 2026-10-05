// POINT 2 — D'OÙ VIENT LE DÉCALAGE AUDIO ? Décomposition, preuve par preuve.
//
// CE QUI EST DÉJÀ ÉTABLI, par afinfo (outil système macOS) sur les deux MP4 produits :
//     audio 960448 valid frames + 2112 priming + 0 remainder
// 2112 échantillons d'amorce à 48 kHz = 44,0 ms. Le repère de Christophe était donc juste au
// sample près, et mon « 3 317 échantillons » ne correspondait à rien de canonique.
//
// RESTE 69 − 44 = 25 ms. L'hypothèse testée ici : c'est MON artefact de mesure. Mon bip porte une
// enveloppe sin(π·p) sur 50 ms, donc son PIC d'amplitude tombe au MILIEU de la rafale, à +25 ms de
// son attaque. Chercher le pic plutôt que l'attaque ajoute donc exactement 25 ms au décalage.
// On mesure les deux, côte à côte, pour trancher.
//
// ET LA DÉPENDANCE À LA FRÉQUENCE est éprouvée : 44,1 kHz et 48 kHz. Si l'amorce vaut 2112
// échantillons dans les deux cas, le décalage en MILLISECONDES doit changer (47,9 ms contre 44,0).
const fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const { execFileSync } = require('node:child_process');
const { servir } = require('./serveur.cjs');
const RACINE = path.join(__dirname, '..');
const INSTANTS = [1, 5, 9];

function amorceSysteme(fichier) {
  try {
    const s = execFileSync('afinfo', [fichier], { encoding: 'utf8' });
    const m = /audio\s+(\d+)\s+valid frames\s*\+\s*(\d+)\s+priming\s*\+\s*(\d+)\s+remainder/.exec(s);
    const f = /(\d+(?:\.\d+)?)\s*Hz/.exec(s);
    const d = /estimated duration:\s*([\d.]+)/.exec(s);
    return m ? { valides: +m[1], amorce: +m[2], reste: +m[3], echantillonnage: f ? +f[1] : null,
                 duree_estimee_s: d ? +d[1] : null,
                 amorce_ms: f ? +((+m[2]) / (+f[1]) * 1000).toFixed(2) : null } : { brut: s.slice(0, 300) };
  } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
}

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const resultats = [];
  for (const se of [48000, 44100]) {
    const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
    await page.waitForFunction(() => typeof window.__essai3Api === 'object');
    await page.evaluate(() => window.__essai3Api.capacites());
    // On refait un export court en imposant la fréquence, et on mesure ATTAQUE et PIC.
    const r = await page.evaluate(async (a) => {
      const api = window.__essai3Api;
      const mod = await import('/vendeur/mediabunny.mjs');
      const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
              QUALITY_HIGH, Input, BlobSource, ALL_FORMATS, VideoSampleSink, AudioBufferSink } = mod;
      const L = 1920, H = 1080, IPS = 30, SE = a.se, BIP_S = 0.05, BIP_HZ = 1000;
      const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const canvas = document.createElement('canvas'); canvas.width = L; canvas.height = H;
      const ctx = canvas.getContext('2d', { alpha: false });
      const vs = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
      sortie.addVideoTrack(vs, { frameRate: IPS });
      const ctxA = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SE });
      const n = Math.round(12 * SE);
      const buf = ctxA.createBuffer(1, n, SE), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = 0.02 * Math.sin(2 * Math.PI * 160 * i / SE);
      for (const t of a.instants) {
        const d0 = Math.round(t * SE), d1 = Math.min(n, d0 + Math.round(BIP_S * SE));
        for (let i = d0; i < d1; i++) {
          const p = (i - d0) / (d1 - d0);
          d[i] = 0.85 * Math.sin(2 * Math.PI * BIP_HZ * (i - d0) / SE) * Math.sin(Math.PI * p);
        }
      }
      const as = new AudioBufferSource({ codec: 'aac', bitrate: 128000 });
      sortie.addAudioTrack(as);
      await sortie.start(); await as.add(buf); as.close();
      // Vidéo : fond tenu, coupé par un flash d'UNE image à chaque instant.
      let curseur = 0;
      for (const t of a.instants) {
        if (t > curseur) { ctx.fillStyle = '#1f5053'; ctx.fillRect(0, 0, L, H); await vs.add(curseur, t - curseur); }
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, H);
        await vs.add(t, 1 / IPS); curseur = t + 1 / IPS;
      }
      ctx.fillStyle = '#1f5053'; ctx.fillRect(0, 0, L, H);
      await vs.add(curseur, 12 - curseur);
      vs.close(); await sortie.finalize();
      const blob = new Blob([sortie.target.buffer], { type: 'video/mp4' });
      // Relecture : attaque ET pic du bip, et horodatage de la première image.
      const entree = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const pv = await entree.getPrimaryVideoTrack(), pa = await entree.getPrimaryAudioTrack();
      const sinkV = new VideoSampleSink(pv), sinkA = new AudioBufferSink(pa);
      const premiere = await sinkV.getSample(0);
      const t_premiere_image = premiere ? +premiere.timestamp.toFixed(5) : null;
      if (premiere && premiere.close) premiere.close();
      const mesures = [];
      for (const inst of a.instants) {
        // flash : image la plus claire autour de l'instant
        let best = null;
        for (let dt = -0.3; dt <= 0.3001; dt += 1 / IPS) {
          const ech = await sinkV.getSample(Math.max(0, inst + dt));
          if (!ech) continue;
          const c = document.createElement('canvas'); c.width = 32; c.height = 18;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(ech.toCanvasImageSource ? await ech.toCanvasImageSource() : ech, 0, 0, 32, 18);
          const px = g.getImageData(0, 0, 32, 18).data;
          let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i+1] + px[i+2];
          if (!best || s > best.s) best = { s, t: +ech.timestamp.toFixed(5) };
          if (ech.close) ech.close();
        }
        // bip : ATTAQUE (premier dépassement de seuil) et PIC
        let pic = 0, tPic = null, tAttaque = null;
        const SEUIL = 0.25;
        for await (const { buffer, timestamp } of sinkA.buffers(Math.max(0, inst - 0.3), inst + 0.3)) {
          const dd = buffer.getChannelData(0);
          for (let i = 0; i < dd.length; i++) {
            const v = Math.abs(dd[i]), t = timestamp + i / buffer.sampleRate;
            if (tAttaque === null && v > SEUIL) tAttaque = +t.toFixed(5);
            if (v > pic) { pic = v; tPic = +t.toFixed(5); }
          }
        }
        mesures.push({ instant: inst, flash_s: best ? best.t : null,
                       bip_attaque_s: tAttaque, bip_pic_s: tPic,
                       ecart_par_pic_ms: (best && tPic != null) ? +((best.t - tPic) * 1000).toFixed(1) : null,
                       ecart_par_attaque_ms: (best && tAttaque != null) ? +((best.t - tAttaque) * 1000).toFixed(1) : null });
      }
      const octets = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return { echantillonnage: SE, t_premiere_image, mesures, octets };
    }, { se, instants: INSTANTS });
    const f = path.join(RACINE, 'mesures', 'decalage-' + se + '.mp4');
    fs.writeFileSync(f, Buffer.from(r.octets));
    delete r.octets;
    r.afinfo = amorceSysteme(f);
    resultats.push(r);
    await page.close();
  }
  await nav.close(); serveur.close();

  console.log('DÉCOMPOSITION DU DÉCALAGE AUDIO');
  console.log('');
  for (const r of resultats) {
    const a = r.afinfo;
    console.log('  ' + r.echantillonnage + ' Hz');
    console.log('    afinfo (système)        : ' + (a.amorce != null
      ? a.amorce + ' échantillons d\'amorce = ' + a.amorce_ms + ' ms  (durée estimée ' + a.duree_estimee_s + ' s)'
      : JSON.stringify(a).slice(0, 120)));
    console.log('    première image vidéo    : t = ' + r.t_premiere_image + ' s');
    for (const m of r.mesures) {
      console.log('    instant ' + m.instant + ' s : flash ' + m.flash_s
        + '  attaque ' + m.bip_attaque_s + '  pic ' + m.bip_pic_s
        + '   → écart par ATTAQUE ' + m.ecart_par_attaque_ms + ' ms, par PIC ' + m.ecart_par_pic_ms + ' ms');
    }
    const parA = r.mesures.map((m) => m.ecart_par_attaque_ms).filter((x) => x != null);
    const moy = parA.length ? (parA.reduce((s, x) => s + x, 0) / parA.length).toFixed(1) : '—';
    console.log('    écart moyen par attaque : ' + moy + ' ms   (amorce déclarée : ' + a.amorce_ms + ' ms)');
    console.log('');
  }
  fs.writeFileSync(path.join(RACINE, 'mesures', 'essai3-decalage.json'),
    JSON.stringify({ methode: 'afinfo (système) + relecture Mediabunny, attaque ET pic', resultats }, null, 2), 'utf8');
})();
