#!/usr/bin/env node
// SUITE 2 — ÉCART AUDIO/VIDÉO, MESURÉ DANS TROIS NAVIGATEURS
//
// Deux horloges à relier, et c'est tout l'enjeu : l'instant d'AFFICHAGE d'une image vient de
// requestVideoFrameCallback (expectedDisplayTime, horloge performance), l'attaque du BIP vient d'un
// worklet audio horodaté sur l'horloge du contexte audio. getOutputTimestamp() donne des couples
// (contextTime, performanceTime) ; la page en fait une régression linéaire, parce que les deux
// horloges dérivent l'une par rapport à l'autre.
//
// Convention : écart NÉGATIF = audio en AVANCE. Tolérance du CDC : jamais plus de 20 ms en avance
// ni 60 ms en retard.
//
// LIMITE ASSUMÉE : un navigateur piloté sans fenêtre peut n'avoir aucune sortie audio réelle. Si
// aucun bip n'est détecté, le banc le DIT et ne produit pas de chiffre.

const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
const pw = require('playwright');

const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'controle-humain');
const MESURES = path.join(RACINE, 'mesures');
const PAGE = 'I-ecart-audio-video.html';
const PORT_WD = 47905;
const FICHIERS = ['MIRE-CFR-mesure.mp4', 'MIRE-CFR-echelle.mp4'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.js': 'text/javascript' };

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const p = path.join(PAQUET, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(PAQUET) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      const st = fs.statSync(p), ct = TYPES[path.extname(p)] || 'application/octet-stream';
      const range = q.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : st.size - 1;
        r.writeHead(206, { 'content-type': ct, 'accept-ranges': 'bytes',
          'content-range': 'bytes ' + a + '-' + b + '/' + st.size, 'content-length': b - a + 1 });
        return fs.createReadStream(p, { start: a, end: b }).pipe(r);
      }
      r.writeHead(200, { 'content-type': ct, 'accept-ranges': 'bytes', 'content-length': st.size });
      fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}
async function wd(m, c, b) {
  const r = await fetch('http://127.0.0.1:' + PORT_WD + c, {
    method: m, headers: { 'Content-Type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b) });
  const j = JSON.parse(await r.text());
  if (j && j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 160));
  return j && j.value;
}
function afficher(etiquette, r) {
  if (!r || r.erreur) { console.log('    ' + etiquette.padEnd(26) + 'ÉCHEC : ' + ((r && r.erreur) || 'inconnu')); return; }
  if (!r.bips_detectes) {
    console.log('    ' + etiquette.padEnd(26) + 'AUCUN BIP DÉTECTÉ — pas de sortie audio réelle, aucun chiffre produit');
    return;
  }
  const e = (r.ecart_juge_ms !== undefined && r.ecart_juge_ms !== null) ? r.ecart_juge_ms : r.ecart_moyen_ms;
  const brut = r.ecart_moyen_brut_ms !== undefined ? r.ecart_moyen_brut_ms : r.ecart_moyen_ms;
  console.log('    ' + etiquette.padEnd(26) + 'brut ' + (brut >= 0 ? '+' : '') + brut
    + ' ms, latence sortie ' + (r.latence_sortie_ms === null ? '?' : r.latence_sortie_ms)
    + ' ms  →  CORRIGÉ ' + (e >= 0 ? '+' : '') + e + ' ms'
    + '   bips ' + r.bips_detectes + '/9   images ' + r.images_presentees
    + '   ponts ' + r.ponts
    + '   tolérance CDC : ' + (r.dans_la_tolerance ? 'TENUE' : 'DÉPASSÉE'));
  const par = r.paires.filter((p) => p.ecart_ms !== null).map((p) => (p.ecart_ms >= 0 ? '+' : '') + p.ecart_ms);
  console.log('    ' + ' '.repeat(26) + 'par paire : [' + par.join(', ') + ']');
}

(async () => {
  for (const f of FICHIERS.concat([PAGE, 'mire-worklet.js'])) {
    if (!fs.existsSync(path.join(PAQUET, f))) { console.error('absent : ' + f); process.exit(1); }
  }
  const { serveur, port } = await servir();
  const url = 'http://127.0.0.1:' + port + '/' + PAGE;
  const tout = [];
  console.log('ÉCART AUDIO/VIDÉO — mire en cadence constante, flash de 150 ms');
  console.log('  écart négatif = audio en avance. Tolérance du CDC : −20 ms à +60 ms.');
  console.log('');

  for (const [nom, lancer] of [
      ['Chrome installé', () => pw.chromium.launch({ channel: 'chrome',
        args: ['--autoplay-policy=no-user-gesture-required'] })],
      ['WebKit Playwright', () => pw.webkit.launch()]]) {
    let nav = null;
    try {
      nav = await lancer();
      const page = await nav.newPage();
      await page.goto(url);
      await page.waitForFunction(() => typeof window.__mireApi === 'object');
      console.log('  ' + nom);
      for (const f of FICHIERS) {
        let r;
        try { r = await page.evaluate((x) => window.__mireApi.mesurer(x), f, { timeout: 0 }); }
        catch (e) { r = { erreur: String(e.message).slice(0, 140) }; }
        afficher(f.replace('MIRE-CFR-', '').replace('.mp4', ''), r);
        tout.push(Object.assign({ navigateur: nom, fichier: f }, r || {}));
      }
    } catch (e) { console.log('  ' + nom + ' : INDISPONIBLE — ' + String(e.message).slice(0, 120)); }
    finally { if (nav) await nav.close(); }
    console.log('');
  }

  // ── Safari réel ───────────────────────────────────────────────────────────────────────────
  const pilote = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(PORT_WD)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2000));
  let session = null;
  try {
    const v = await wd('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'safari', 'safari:alwaysAllowAutoplay': true } } });
    session = v.sessionId;
    await wd('POST', '/session/' + session + '/timeouts', { script: 180000 });
    await wd('POST', '/session/' + session + '/url', { url });
    console.log('  Safari ' + (v.capabilities && v.capabilities.browserVersion) + ' réel');
    for (const f of FICHIERS) {
      let r;
      try {
        r = await wd('POST', '/session/' + session + '/execute/async', {
          script: 'var f = arguments[0], cb = arguments[1];'
                + 'window.__mireApi.mesurer(f).then(cb).catch(function (e) { cb({ erreur: String(e && e.message || e) }); });',
          args: [f] });
      } catch (e) { r = { erreur: String(e.message).slice(0, 140) }; }
      afficher(f.replace('MIRE-CFR-', '').replace('.mp4', ''), r);
      tout.push(Object.assign({ navigateur: 'Safari réel', fichier: f }, r || {}));
    }
  } catch (e) { console.log('  Safari : ÉCHEC — ' + String(e.message).slice(0, 160)); }
  finally {
    if (session) { try { await wd('DELETE', '/session/' + session); } catch (e) {} }
    pilote.kill(); serveur.close();
  }
  fs.mkdirSync(MESURES, { recursive: true });
  fs.writeFileSync(path.join(MESURES, 'ecart-audio-video.json'),
    JSON.stringify({ convention: 'négatif = audio en avance', tolerance_cdc: { avance_ms: 20, retard_ms: 60 },
                     resultats: tout }, null, 2), 'utf8');
  console.log('');
  console.log('relevé : mesures/ecart-audio-video.json');
})();
