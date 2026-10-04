import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";

/** Où vivent l'instantané de bibliothèque et les images de page (correction 8).
 *
 *  Un seul endroit décide, et deux le lisent : le greffon de Vite qui les sert, et la préparation
 *  des tests de rendu qui les écrit. Quand chacun résolvait le chemin de son côté, ils tombaient
 *  d'accord sur cette machine et nulle part ailleurs — la préparation se repliait sur un dossier
 *  local, le greffon continuait de chercher le volume externe, et les écrans ne trouvaient rien.
 *
 *  `LIENOTHEQUE_INSTANTANE` passe devant tout : c'est ainsi qu'on montre un autre lot sans rien
 *  déplacer. Sinon `ouvrirCache` décide, et se replie sur un dossier local quand le volume prévu
 *  n'est pas monté — une machine d'intégration continue n'a pas de disque externe. */
export function emplacementInstantane(): { readonly instantane: string; readonly pages: string; readonly medias: string | undefined } {
  // Les médias, eux, ne sont jamais recopiés : ils sont servis là où ils sont. Un lot réel pèse
  // des gigaoctets, et les dupliquer pour les montrer serait payer deux fois pour la même chose.
  // Sans ce chemin, les écrans disent « média non disponible ici » (ANC-05).
  const medias = process.env["LIENOTHEQUE_MEDIAS"];

  const declare = process.env["LIENOTHEQUE_INSTANTANE"];
  if (declare !== undefined)
    return { instantane: declare, pages: process.env["LIENOTHEQUE_PAGES"] ?? join(declare, "..", "pages"), medias };

  const dossier = coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "instantane");
  return {
    instantane: join(dossier, "bibliotheque.json"),
    pages: process.env["LIENOTHEQUE_PAGES"] ?? join(dossier, "pages"),
    medias,
  };
}
