// Détection d'attaque partagée entre les bancs de décodage (afconvert, ffmpeg).
//
// Extraite telle quelle de mesure-afconvert.cjs pour que la comparaison entre décodeurs soit à
// MÉTHODE ÉGALE : un écart de décodeur ne doit jamais pouvoir être un écart de détection. La
// parité est éprouvée dans mesure-ffmpeg.cjs, qui exige de retrouver au millième les chiffres
// afconvert déjà publiés avant de comparer quoi que ce soit.
//
// On mesure l'ATTAQUE, jamais le pic : l'enveloppe sin(π·p) du bip place son maximum au milieu de
// la rafale, ce qui ajoutait 20 ms d'artefact aux premiers chiffres du lot.
// Le seuil est relatif au pic LOCAL : un seuil absolu dépendrait du niveau d'encodage.
function attaque(pcm, se, instant, fenetre) {
  const d0 = Math.max(0, Math.round((instant - fenetre) * se));
  const d1 = Math.min(pcm.length, Math.round((instant + fenetre) * se));
  let pic = 0;
  for (let i = d0; i < d1; i++) { const a = Math.abs(pcm[i]); if (a > pic) pic = a; }
  const seuil = pic * 0.25;
  for (let i = d0; i < d1; i++) {
    if (Math.abs(pcm[i]) > seuil) return { t: +(i / se).toFixed(5), pic_local: +(pic / 32768).toFixed(3) };
  }
  return { t: null, pic_local: +(pic / 32768).toFixed(3) };
}
module.exports = { attaque };
