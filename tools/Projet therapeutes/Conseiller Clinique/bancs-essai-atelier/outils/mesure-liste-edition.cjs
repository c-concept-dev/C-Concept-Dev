#!/usr/bin/env node
// COMPLÉMENT 3, POINT 1 (suite) — UNE LISTE D'ÉDITION CORRIGE-T-ELLE ffmpeg SANS CASSER afconvert ?
//
// Acquis du complément 3 : ffmpeg ne retire PAS l'amorce (+48,2 ms à 48 kHz, +52,1 ms à 44,1 kHz),
// afconvert la retire (+4,2 ms). La différence entre les deux décodeurs vaut exactement 2112
// échantillons. Un lecteur non-Apple est donc hors du critère de 40 ms.
//
// Mediabunny SAIT écrire une liste d'édition, et la branche qu'il faut existe : quand le premier
// horodatage de la piste est NÉGATIF, son écrivain edts émet une entrée unique de media_time
// POSITIF (lu dans le dist : `mediaTime = intoTimescale(-offset, trackData.timescale)`). Le levier
// est `new AudioBufferSource(config, { startTimestamp })`. Poser startTimestamp = -2112/SE doit
// donc produire media_time = 2112, soit exactement l'amorce.
//
// LE RISQUE EST LA DOUBLE COMPENSATION AU DÉCODAGE, et c'est lui qui décide : afconvert retire déjà l'amorce
// du train AAC. S'il honore EN PLUS la liste d'édition, l'audio part 44 ms trop TÔT. Ce banc mesure
// des DÉCODEURS, jamais QuickTime Player : rien ici ne vaut pour un lecteur Apple réel.
// Les quatre combinaisons sont donc mesurées, et RIEN n'est
// recommandé sans le résultat des deux décodeurs.

const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const pw = require('playwright');
const { servir } = require('./serveur.cjs');
const { lireWavQuelconque } = require('./lire-wav.cjs');
const { attaque } = require('./attaque.cjs');
const { produireMp4 } = require('./produire-mp4-essai.cjs');

const RACINE = path.join(__dirname, '..');
const MESURES = path.join(RACINE, 'mesures');
const INSTANTS = [1, 5, 9];
const AMORCE_ECH = 2112;
const FFMPEG = path.join(RACINE, 'ffmpeg-externe', 'node_modules', 'ffmpeg-static', 'ffmpeg');

// Recherche de elst et lecture de sa première entrée. Parcours de boîtes, sans dépendance :
// l'enjeu est de PROUVER le media_time écrit, pas de croire que Mediabunny a fait ce qu'on espère.
function lireElst(buf) {
  for (let i = 0; i + 8 <= buf.length; i++) {
    if (buf.toString('latin1', i, i + 4) !== 'elst') continue;
    const version = buf[i + 4];
    const nb = buf.readUInt32BE(i + 8);
    const p = i + 12;
    if (version === 1) {
      if (p + 20 > buf.length) continue;
      return { present: true, version, entrees: nb,
               duree_segment: Number(buf.readBigUInt64BE(p)),
               media_time: Number(buf.readBigInt64BE(p + 8)) };
    }
    if (p + 12 > buf.length) continue;
    return { present: true, version, entrees: nb,
             duree_segment: buf.readUInt32BE(p), media_time: buf.readInt32BE(p + 4) };
  }
  return { present: false };
}

function decoder(outil, mp4, sortie) {
  if (outil === 'ffmpeg') {
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
      '-i', mp4, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', sortie], { stdio: 'pipe' });
  } else {
    execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', mp4, sortie], { stdio: 'pipe' });
  }
  return sortie;
}

function ecarts(wav, se) {
  const e = lireWavQuelconque(fs.readFileSync(wav));
  if (e.echantillonnage !== se) return { erreur: 'rééchantillonné à ' + e.echantillonnage };
  const m = INSTANTS.map((inst) => {
    const a = attaque(e.pcm, se, inst, 0.3);
    return a.t === null ? null : +((a.t - inst) * 1000).toFixed(1);
  });
  const v = m.filter((x) => x !== null);
  return { par_instant: m, echantillons: e.echantillons,
           moyen: v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null };
}

(async () => {
  if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg absent (voir mesure-ffmpeg.cjs).'); process.exit(1); }
  const { serveur, port } = await servir(RACINE, 0);
  const nav = await pw.webkit.launch();
  const resultats = [];
  let rouges = 0;

  console.log('LISTE D\'ÉDITION — EFFET SUR LES DEUX DÉCODEURS');
  console.log('  Le risque mesuré est la DOUBLE COMPENSATION chez afconvert.');
  console.log('');

  for (const se of [48000, 44100]) {
    const amorce_ms = +(AMORCE_ECH / se * 1000).toFixed(2);
    console.log('  ' + se + ' Hz   (amorce = ' + AMORCE_ECH + ' éch. = ' + amorce_ms + ' ms)');

    for (const variante of ['sans', 'avec']) {
      const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route('**/*', (r) => /^https?:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
      await page.goto('http://127.0.0.1:' + port + '/essai3-mp4.html');
      await page.waitForFunction(() => typeof window.__essai3Api === 'object');

      // Production déléguée à outils/produire-mp4-essai.cjs : les MP4 remis à Christophe dans
      // controle-humain/ sortent du MÊME code que ceux mesurés ici.
      const b64 = await produireMp4(page, { se, instants: INSTANTS,
        decalage: variante === 'avec' ? -AMORCE_ECH / se : 0, duree: 12 });
      await page.close();

      const mp4 = path.join(MESURES, 'elst-' + variante + '-' + se + '.mp4');
      const octets = Buffer.from(b64, 'base64');
      fs.writeFileSync(mp4, octets);
      const elst = lireElst(octets);

      // FALSIFICATION : la variante « avec » n'a de sens que si elst est RÉELLEMENT écrit, avec le
      // media_time attendu. Sinon on mesurerait deux fichiers identiques en croyant tester.
      const attenduPresent = (variante === 'avec');
      if (elst.present !== attenduPresent) {
        console.log('    ' + variante.padEnd(5) + ' ROUGE : elst '
          + (elst.present ? 'présent alors qu\'il ne devait pas l\'être' : 'ABSENT alors qu\'il était attendu')
          + ' — variante non concluante');
        rouges++; continue;
      }
      let detail = 'aucune liste d\'édition';
      if (elst.present) {
        const conforme = (elst.media_time === AMORCE_ECH);
        if (!conforme) rouges++;
        detail = 'elst v' + elst.version + ', ' + elst.entrees + ' entrée(s), media_time '
          + elst.media_time + ' éch. (attendu ' + AMORCE_ECH + ') ' + (conforme ? 'OK' : 'ROUGE');
      }
      console.log('    ' + variante.padEnd(5) + ' ' + detail);

      const ligne = { echantillonnage: se, variante, elst, decodeurs: {} };
      for (const outil of ['ffmpeg', 'afconvert']) {
        const wav = path.join(MESURES, 'elst-' + variante + '-' + se + '-' + outil + '.wav');
        let r;
        try { r = ecarts(decoder(outil, mp4, wav), se); }
        catch (e) { r = { erreur: String(e.message).slice(0, 120) }; }
        ligne.decodeurs[outil] = r;
        console.log('           ' + outil.padEnd(10) + (r.erreur ? 'ERREUR ' + r.erreur
          : 'écart moyen ' + (r.moyen >= 0 ? '+' : '') + r.moyen + ' ms   par instant ['
            + r.par_instant.join(', ') + ']'));
      }
      resultats.push(ligne);
    }

    // Verdict par fréquence : les deux décodeurs doivent tenir les 40 ms EN MÊME TEMPS.
    const avec = resultats.find((r) => r.echantillonnage === se && r.variante === 'avec');
    const sans = resultats.find((r) => r.echantillonnage === se && r.variante === 'sans');
    if (avec && sans && !avec.decodeurs.ffmpeg.erreur && !avec.decodeurs.afconvert.erreur) {
      const f = avec.decodeurs.ffmpeg.moyen, a = avec.decodeurs.afconvert.moyen;
      const doubleComp = Math.abs(a) > 40;
      console.log('    → avec liste d\'édition : ffmpeg ' + (f >= 0 ? '+' : '') + f + ' ms, afconvert '
        + (a >= 0 ? '+' : '') + a + ' ms');
      console.log('    → ' + (Math.abs(f) <= 40 && Math.abs(a) <= 40
        ? 'LES DEUX DÉCODEURS tiennent les 40 ms (afconvert et ffmpeg, pas QuickTime)'
        : (doubleComp ? 'DOUBLE COMPENSATION au décodage afconvert : la liste d\'édition le dégrade'
                      : 'au moins un décodeur reste hors critère')));
    }
    console.log('');
  }

  await nav.close(); serveur.close();
  fs.writeFileSync(path.join(MESURES, 'essai3-liste-edition.json'),
    JSON.stringify({ levier: 'AudioBufferSource options.startTimestamp = -2112/SE',
                     methode: 'attaque.cjs partagé ; elst relu dans les octets du MP4 produit',
                     resultats }, null, 2), 'utf8');
  console.log('  ' + (rouges ? rouges + ' ROUGE(S)' : 'verts : ' + resultats.length + '   rouges : 0'));
  process.exit(rouges ? 1 : 0);
})();
