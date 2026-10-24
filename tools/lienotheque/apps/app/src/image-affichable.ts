/** Une adresse que le moteur de rendu sait réellement charger.
 *
 *  Les vues locales portent aussi des noms de dérivés relatifs (`pages/page-0001.webp`). Ils
 *  servent à retrouver le fichier côté hôte, mais ne sont pas des URL : les donner directement
 *  à `<img>` produit l'icône d'image cassée observée dans Recherche, Catalogue et le Lecteur. */
export function imageAffichable(adresse: string | undefined, accepteCheminWeb = true): string | undefined {
  if (adresse === undefined) return undefined;
  const protocole = /^(?:data:|blob:|https?:|asset:|tauri:)/;
  return protocole.test(adresse) || (accepteCheminWeb && adresse.startsWith("/")) ? adresse : undefined;
}
