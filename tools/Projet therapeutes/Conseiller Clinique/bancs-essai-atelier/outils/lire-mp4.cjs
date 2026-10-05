// Lit les boîtes d'un MP4 pour en extraire les durées PAR PISTE et les codecs.
//
// POURQUOI ÉCRIRE CELA PLUTÔT QUE D'UTILISER ffprobe : ffprobe et ffmpeg sont ABSENTS de cette
// machine (vérifié). Plutôt que de rendre « non vérifiable » le critère « durée vidéo = durée audio
// à une image près », on lit l'en-tête : les boîtes moov/mvhd/trak/mdia/mdhd/stsd suffisent, elles
// sont normalisées (ISO/IEC 14496-12) et leur lecture est courte.
function boites(buf, debut, fin) {
  const out = [];
  let o = debut;
  while (o + 8 <= fin) {
    let taille = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    let entete = 8;
    if (taille === 1) { taille = Number(buf.readBigUInt64BE(o + 8)); entete = 16; }
    else if (taille === 0) taille = fin - o;
    if (taille < entete || o + taille > fin) break;
    out.push({ type, debut: o, fin: o + taille, corps: o + entete });
    o += taille;
  }
  return out;
}
const trouver = (l, t) => l.filter((b) => b.type === t);

function lireMp4(buf) {
  const racine = boites(buf, 0, buf.length);
  const r = { taille_fichier: buf.length, boites_racine: racine.map((b) => b.type), pistes: [], problemes: [] };
  const ftyp = trouver(racine, 'ftyp')[0];
  if (!ftyp) r.problemes.push('boîte ftyp absente — ce n\'est pas un fichier ISO BMFF');
  else r.marque = buf.toString('latin1', ftyp.corps, ftyp.corps + 4);
  const moov = trouver(racine, 'moov')[0];
  if (!moov) { r.problemes.push('boîte moov absente'); r.valide = false; return r; }
  const dansMoov = boites(buf, moov.corps, moov.fin);
  const mvhd = trouver(dansMoov, 'mvhd')[0];
  if (mvhd) {
    const version = buf.readUInt8(mvhd.corps);
    // version 0 : échelle et durée en 32 bits ; version 1 : en 64 bits. Les deux existent.
    const o = mvhd.corps + 4 + (version === 1 ? 16 : 8);
    r.echelle_film = version === 1 ? buf.readUInt32BE(o) : buf.readUInt32BE(o);
    r.duree_film = version === 1 ? Number(buf.readBigUInt64BE(o + 4)) : buf.readUInt32BE(o + 4);
    r.duree_film_s = r.echelle_film ? +(r.duree_film / r.echelle_film).toFixed(4) : null;
  } else r.problemes.push('boîte mvhd absente');
  for (const trak of trouver(dansMoov, 'trak')) {
    const dansTrak = boites(buf, trak.corps, trak.fin);
    const mdia = trouver(dansTrak, 'mdia')[0];
    if (!mdia) continue;
    const dansMdia = boites(buf, mdia.corps, mdia.fin);
    const mdhd = trouver(dansMdia, 'mdhd')[0];
    const hdlr = trouver(dansMdia, 'hdlr')[0];
    const piste = {};
    if (mdhd) {
      const v = buf.readUInt8(mdhd.corps);
      const o = mdhd.corps + 4 + (v === 1 ? 16 : 8);
      piste.echelle = buf.readUInt32BE(o);
      piste.duree = v === 1 ? Number(buf.readBigUInt64BE(o + 4)) : buf.readUInt32BE(o + 4);
      piste.duree_s = piste.echelle ? +(piste.duree / piste.echelle).toFixed(4) : null;
    }
    if (hdlr) piste.genre = buf.toString('latin1', hdlr.corps + 8, hdlr.corps + 12);
    const minf = trouver(dansMdia, 'minf')[0];
    if (minf) {
      const stbl = trouver(boites(buf, minf.corps, minf.fin), 'stbl')[0];
      if (stbl) {
        const dansStbl = boites(buf, stbl.corps, stbl.fin);
        const stsd = trouver(dansStbl, 'stsd')[0];
        if (stsd) {
          // stsd : 4 octets de version/drapeaux, 4 d'occurrences, puis les descriptions.
          const desc = boites(buf, stsd.corps + 8, stsd.fin);
          piste.codec = desc.length ? desc[0].type : null;
          if (piste.codec && desc[0].fin - desc[0].corps > 28) {
            // Pour une piste vidéo, largeur et hauteur vivent à l'offset 24 de la description.
            if (piste.genre === 'vide') {
              piste.largeur = buf.readUInt16BE(desc[0].corps + 24);
              piste.hauteur = buf.readUInt16BE(desc[0].corps + 26);
            } else if (piste.genre === 'soun') {
              piste.canaux = buf.readUInt16BE(desc[0].corps + 16);
              piste.bits = buf.readUInt16BE(desc[0].corps + 18);
            }
          }
        }
        const stts = trouver(dansStbl, 'stts')[0];
        if (stts) {
          const n = buf.readUInt32BE(stts.corps + 4);
          let images = 0;
          for (let i = 0; i < n && stts.corps + 8 + i * 8 + 8 <= stts.fin; i++) {
            images += buf.readUInt32BE(stts.corps + 8 + i * 8);
          }
          piste.echantillons = images;
        }
      }
    }
    r.pistes.push(piste);
  }
  const v = r.pistes.filter((p) => p.genre === 'vide')[0] || null;
  const a = r.pistes.filter((p) => p.genre === 'soun')[0] || null;
  r.video = v; r.audio = a;
  if (!v) r.problemes.push('aucune piste vidéo');
  if (!a) r.problemes.push('aucune piste audio');
  if (v && a && v.duree_s != null && a.duree_s != null) {
    r.ecart_video_audio_s = +(v.duree_s - a.duree_s).toFixed(4);
    r.images_par_seconde = v.echantillons && v.duree_s ? +(v.echantillons / v.duree_s).toFixed(3) : null;
    // « À une image près » : le critère du brief, exprimé en secondes à la cadence mesurée.
    r.une_image_s = r.images_par_seconde ? +(1 / r.images_par_seconde).toFixed(4) : null;
  }
  r.valide = r.problemes.length === 0;
  return r;
}
module.exports = { lireMp4 };
