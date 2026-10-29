// Pose le thème avant le premier rendu : évite un clignotement au démarrage.
// Même ordre que themeInitial() dans src/theme/theme.ts : choix mémorisé, puis système.
//
// Ce script vivait en ligne dans index.html. Il en est sorti le 29 octobre 2026 pour une seule
// raison : une politique de sécurité du contenu qui autorise les scripts en ligne n'en est pas
// une, et c'est sur les scripts qu'elle protège vraiment. Un fichier de même origine, chargé
// sans « defer », s'exécute avant le premier rendu exactement comme le faisait la balise — le
// clignotement reste évité, et « script-src 'self' » peut être strict.
try {
  var memorise = localStorage.getItem("lienotheque.theme");
  var systeme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  var theme = ["light", "hybrid", "dark"].indexOf(memorise) >= 0 ? memorise : systeme;
  document.documentElement.dataset.theme = theme;
} catch (erreur) {
  document.documentElement.dataset.theme = "light";
}
