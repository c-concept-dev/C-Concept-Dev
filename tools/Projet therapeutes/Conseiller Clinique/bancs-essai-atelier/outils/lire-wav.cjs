// Relit un WAV et vérifie son EN-TÊTE octet par octet. Aucune bibliothèque : c'est justement
// l'en-tête produit à la main par essai1-micro.html qu'il s'agit de contrôler — le valider avec un
// décodeur tolérant ne prouverait pas qu'il est exact.
function lireWav(tampon) {
  const v = new DataView(tampon.buffer || tampon, tampon.byteOffset || 0, tampon.byteLength || tampon.length);
  const txt = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(o + i)); return s; };
  const pb = [];
  if (txt(0, 4) !== 'RIFF') pb.push('les 4 premiers octets ne sont pas RIFF : ' + JSON.stringify(txt(0, 4)));
  if (txt(8, 4) !== 'WAVE') pb.push('octets 8-11 ne sont pas WAVE : ' + JSON.stringify(txt(8, 4)));
  if (txt(12, 4) !== 'fmt ') pb.push('bloc fmt absent à l\'octet 12');
  if (txt(36, 4) !== 'data') pb.push('bloc data absent à l\'octet 36');
  const r = {
    taille_riff: v.getUint32(4, true), taille_fmt: v.getUint32(16, true),
    format: v.getUint16(20, true), canaux: v.getUint16(22, true),
    echantillonnage: v.getUint32(24, true), octets_par_seconde: v.getUint32(28, true),
    octets_par_trame: v.getUint16(32, true), bits: v.getUint16(34, true),
    taille_donnees: v.getUint32(40, true), taille_fichier: v.byteLength,
  };
  if (r.format !== 1) pb.push('format ' + r.format + ' au lieu de 1 (PCM entier)');
  if (r.bits !== 16) pb.push('bits ' + r.bits + ' au lieu de 16');
  if (r.taille_fmt !== 16) pb.push('taille du bloc fmt ' + r.taille_fmt + ' au lieu de 16');
  // Cohérences internes : c'est là que se nichent les en-têtes « presque » bons, que QuickTime
  // refuse sans expliquer.
  if (r.taille_riff !== 36 + r.taille_donnees) pb.push('taille RIFF ' + r.taille_riff + ' ≠ 36 + ' + r.taille_donnees);
  if (r.taille_fichier !== 44 + r.taille_donnees) pb.push('taille du fichier ' + r.taille_fichier + ' ≠ 44 + ' + r.taille_donnees);
  if (r.octets_par_trame !== r.canaux * r.bits / 8) pb.push('octets par trame ' + r.octets_par_trame + ' incohérent');
  if (r.octets_par_seconde !== r.echantillonnage * r.octets_par_trame) pb.push('octets par seconde incohérent');
  r.echantillons = r.taille_donnees / r.octets_par_trame;
  r.duree_s = r.echantillonnage ? +(r.echantillons / r.echantillonnage).toFixed(4) : null;
  r.valide = pb.length === 0;
  r.problemes = pb;
  return r;
}
// Lecteur GÉNÉRAL, pour un WAV venu d'ailleurs — afconvert écrit du WAVE_FORMAT_EXTENSIBLE
// (format 65534, bloc fmt de 40 octets, `data` au-delà de l'octet 36), parfaitement valide mais non
// canonique. lireWav ci-dessus reste STRICT à dessein : il valide l'en-tête que notre propre page
// fabrique, et l'assouplir lui ferait perdre son objet. Ici on parcourt les blocs.
function lireWavQuelconque(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('ce n\'est pas un fichier WAVE');
  }
  let o = 12, fmt = null, data = null;
  while (o + 8 <= buf.length) {
    const type = buf.toString('latin1', o, o + 4);
    const taille = buf.readUInt32LE(o + 4);
    const corps = o + 8;
    if (type === 'fmt ') {
      fmt = { format: buf.readUInt16LE(corps), canaux: buf.readUInt16LE(corps + 2),
              echantillonnage: buf.readUInt32LE(corps + 4), bits: buf.readUInt16LE(corps + 14),
              taille_bloc: taille };
      // WAVE_FORMAT_EXTENSIBLE : le vrai format vit dans le GUID du sous-format.
      if (fmt.format === 0xFFFE && taille >= 40) fmt.sous_format = buf.readUInt16LE(corps + 24);
    } else if (type === 'data') {
      data = { debut: corps, octets: Math.min(taille, buf.length - corps) };
    }
    o = corps + taille + (taille % 2);   // les blocs sont alignés sur un octet pair
  }
  if (!fmt || !data) throw new Error('bloc fmt ou data introuvable');
  const effectif = fmt.format === 0xFFFE ? (fmt.sous_format || null) : fmt.format;
  if (effectif !== 1) throw new Error('format ' + effectif + ' : seul le PCM entier est lu ici');
  if (fmt.bits !== 16) throw new Error('bits ' + fmt.bits + ' : seul le 16 bits est lu ici');
  const n = Math.floor(data.octets / 2 / fmt.canaux);
  const pcm = new Int16Array(n);
  // Si plusieurs canaux, on ne garde que le premier : les bancs sont mono.
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(data.debut + i * 2 * fmt.canaux);
  return { ...fmt, format_effectif: effectif, echantillons: n,
           duree_s: +(n / fmt.echantillonnage).toFixed(5), pcm };
}
module.exports = { lireWav, lireWavQuelconque };
