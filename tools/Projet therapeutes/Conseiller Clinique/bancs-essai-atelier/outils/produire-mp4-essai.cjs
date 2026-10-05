// Production du MP4 d'essai — flash vidéo et bip audio aux mêmes instants.
//
// Extrait de mesure-liste-edition.cjs pour être partagé avec paquet-controle-humain.cjs : les
// fichiers que Christophe écoute dans QuickTime doivent être produits par EXACTEMENT le même code
// que ceux mesurés par ffmpeg et afconvert, sinon la vérification humaine ne porte plus sur ce qui
// a été mesuré. La parité est éprouvée en relançant mesure-liste-edition.cjs après la bascule :
// les écarts doivent rester +48,2 / +4,2 ms à 48 kHz et +52,1 / +4,2 ms à 44,1 kHz.
//
// `decalage` est l'horodatage de départ de la piste audio. Négatif, il fait écrire à Mediabunny une
// liste d'édition de media_time positif, soit la compensation d'amorce. Nul, aucun edts n'est émis.

async function produireMp4(page, opts) {
  return page.evaluate(async (a) => {
    const mod = await import('/vendeur/mediabunny.mjs');
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
            QUALITY_HIGH } = mod;
    const L = 1920, H = 1080, IPS = 30, SE = a.se, BIP_S = 0.05, BIP_HZ = 1000;
    const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const canvas = document.createElement('canvas'); canvas.width = L; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const vs = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
    sortie.addVideoTrack(vs, { frameRate: IPS });
    const ctxA = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SE });
    const n = Math.round(a.duree * SE);
    const buf = ctxA.createBuffer(1, n, SE), d = buf.getChannelData(0);
    // Fond sonore très faible : il rend audible le fait que la piste joue, sans masquer le bip.
    for (let i = 0; i < n; i++) d[i] = 0.02 * Math.sin(2 * Math.PI * 160 * i / SE);
    for (const t of a.instants) {
      const d0 = Math.round(t * SE), d1 = Math.min(n, d0 + Math.round(BIP_S * SE));
      for (let i = d0; i < d1; i++) {
        const p = (i - d0) / (d1 - d0);
        // Enveloppe sin(pi*p) : son pic tombe au MILIEU de la rafale, 20 ms après l'attaque.
        // C'est ce qui avait faussé de 20 ms mes premières mesures, prises sur le pic.
        d[i] = 0.85 * Math.sin(2 * Math.PI * BIP_HZ * (i - d0) / SE) * Math.sin(Math.PI * p);
      }
    }
    const opts = a.decalage ? { startTimestamp: a.decalage } : {};
    const as = new AudioBufferSource({ codec: 'aac', bitrate: 128000 }, opts);
    sortie.addAudioTrack(as);
    await sortie.start(); await as.add(buf); as.close();
    // Vidéo : fond tenu, coupé par un flash d'UNE image à chaque instant. Une image tenue ne coûte
    // qu'un échantillon, d'où 33 échantillons pour 20 s au lieu de 600.
    let curseur = 0;
    for (const t of a.instants) {
      if (t > curseur) { ctx.fillStyle = '#1f5053'; ctx.fillRect(0, 0, L, H); await vs.add(curseur, t - curseur); }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, H);
      await vs.add(t, 1 / IPS); curseur = t + 1 / IPS;
    }
    ctx.fillStyle = '#1f5053'; ctx.fillRect(0, 0, L, H);
    await vs.add(curseur, a.duree - curseur);
    vs.close(); await sortie.finalize();
    const u8 = new Uint8Array(sortie.target.buffer);
    let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }, { se: opts.se, instants: opts.instants, decalage: opts.decalage || 0, duree: opts.duree || 12 });
}

module.exports = { produireMp4 };
