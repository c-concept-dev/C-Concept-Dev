#!/usr/bin/env node
// COMPLÉMENT 6, POINT 2 — LA PISTE VIDÉO, IMAGE PAR IMAGE
//
// Christophe n'a vu QU'UN flash dans Chrome sur le MP4 de calibration. Deux explications
// possibles, et il faut mesurer pour trancher : soit les flashs de 5 s et 9 s ne sont pas des
// images distinctes dans le fichier, soit elles le sont et c'est le lecteur qui ne les présente
// pas. Ce banc répond à la PREMIÈRE question seulement, en dépliant la table `stts`.
//
// `stts` (decoding time to sample) est une liste de couples (nombre d'échantillons, delta). Une
// image TENUE y apparaît comme un échantillon unique de grand delta ; une cadence constante comme
// beaucoup d'échantillons de delta 1/30. C'est exactement la différence entre les deux variantes
// de la mire.
//
// `ffprobe` est absent de la machine et `ffmpeg -showinfo` n'a rien donné d'exploitable ici : d'où
// ce lecteur de boîtes, écrit pour le lot.

const fs = require('node:fs'), path = require('node:path');

function boites(buf, debut, fin) {
  const out = [];
  let p = debut;
  while (p + 8 <= fin) {
    let taille = buf.readUInt32BE(p);
    const nom = buf.toString('latin1', p + 4, p + 8);
    let corps = p + 8;
    if (taille === 1) { taille = Number(buf.readBigUInt64BE(p + 8)); corps = p + 16; }
    else if (taille === 0) { taille = fin - p; }
    if (taille < 8 || p + taille > fin) break;
    out.push({ nom, debut: p, corps, fin: p + taille });
    p += taille;
  }
  return out;
}
function descendre(buf, zone, chemin) {
  let courant = [zone];
  for (const nom of chemin) {
    const suivant = [];
    for (const z of courant) for (const b of boites(buf, z.corps, z.fin)) if (b.nom === nom) suivant.push(b);
    courant = suivant;
    if (!courant.length) return [];
  }
  return courant;
}

function lirePisteVideo(fichier) {
  const buf = fs.readFileSync(fichier);
  const racine = { corps: 0, fin: buf.length };
  const traks = descendre(buf, racine, ['moov', 'trak']);
  for (const trak of traks) {
    const hdlr = descendre(buf, trak, ['mdia', 'hdlr'])[0];
    if (!hdlr) continue;
    const type = buf.toString('latin1', hdlr.corps + 8, hdlr.corps + 12);
    if (type !== 'vide') continue;
    const mdhd = descendre(buf, trak, ['mdia', 'mdhd'])[0];
    if (!mdhd) continue;
    const version = buf[mdhd.corps];
    const echelle = version === 1 ? buf.readUInt32BE(mdhd.corps + 20) : buf.readUInt32BE(mdhd.corps + 12);
    const duree = version === 1 ? Number(buf.readBigUInt64BE(mdhd.corps + 24)) : buf.readUInt32BE(mdhd.corps + 16);
    const stts = descendre(buf, trak, ['mdia', 'minf', 'stbl', 'stts'])[0];
    const stss = descendre(buf, trak, ['mdia', 'minf', 'stbl', 'stss'])[0];
    if (!stts) continue;
    const nEntrees = buf.readUInt32BE(stts.corps + 4);
    const entrees = [];
    for (let i = 0; i < nEntrees; i++) {
      const o = stts.corps + 8 + i * 8;
      if (o + 8 > stts.fin) break;
      entrees.push({ nombre: buf.readUInt32BE(o), delta: buf.readUInt32BE(o + 4) });
    }
    let cles = null;
    if (stss) {
      const nc = buf.readUInt32BE(stss.corps + 4);
      cles = [];
      for (let i = 0; i < nc; i++) {
        const o = stss.corps + 8 + i * 4;
        if (o + 4 > stss.fin) break;
        cles.push(buf.readUInt32BE(o));
      }
    }
    // Dépliage : un échantillon par ligne, avec son instant de début et sa durée.
    const images = [];
    let t = 0;
    for (const e of entrees) for (let k = 0; k < e.nombre; k++) {
      images.push({ rang: images.length + 1, debut_s: t / echelle, duree_s: e.delta / echelle });
      t += e.delta;
    }
    return { echelle, duree_timescale: duree, duree_s: duree / echelle,
             entrees_stts: entrees, images, cles };
  }
  return null;
}

if (require.main === module) {
  const fichiers = process.argv.slice(2);
  if (!fichiers.length) { console.error('usage: node outils/piste-video.cjs <fichier.mp4> …'); process.exit(2); }
  const INSTANTS = [1, 5, 9];
  for (const f of fichiers) {
    console.log(path.basename(f));
    const v = lirePisteVideo(f);
    if (!v) { console.log('  aucune piste vidéo lisible'); continue; }
    console.log('  échelle de temps ' + v.echelle + ', durée ' + v.duree_s.toFixed(3) + ' s, '
      + v.images.length + ' image(s) écrite(s)');
    console.log('  table stts : ' + v.entrees_stts.map((e) => e.nombre + '×' + e.delta
      + ' (' + (e.delta / v.echelle).toFixed(4) + ' s)').join(', '));
    const clesTexte = v.cles
    ? v.cles.length + ' (' + v.cles.slice(0, 8).join(', ') + (v.cles.length > 8 ? ', …' : '') + ')'
    : 'aucune boîte stss';
  console.log('  images clés : ' + clesTexte);
    // Pour chaque instant visé, quelle image le recouvre, et est-elle distincte de la précédente ?
    const vus = [];
    for (const inst of INSTANTS) {
      const idx = v.images.findIndex((im) => inst >= im.debut_s - 1e-9 && inst < im.debut_s + im.duree_s - 1e-9);
      if (idx < 0) { console.log('    t=' + inst + ' s : aucune image ne couvre cet instant'); continue; }
      const im = v.images[idx];
      vus.push(idx);
      console.log('    t=' + inst + ' s  →  image n°' + im.rang
        + ', début ' + im.debut_s.toFixed(4) + ' s, durée ' + im.duree_s.toFixed(4) + ' s'
        + (Math.abs(im.debut_s - inst) < 1e-6 ? '   [commence PILE à l\'instant visé]' : ''));
    }
    const distinctes = new Set(vus).size === vus.length && vus.length === INSTANTS.length;
    console.log('  → les trois instants tombent sur ' + new Set(vus).size + ' image(s) distincte(s) : '
      + (distinctes ? 'OUI, trois images distinctes' : 'NON — au moins deux instants partagent la même image'));
    console.log('');
  }
}

module.exports = { lirePisteVideo };
