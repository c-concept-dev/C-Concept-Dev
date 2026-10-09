import type { DescriptionBibliotheque, TypeDeContenu, VueBibliotheque } from "@lienotheque/contrats";
import type { BibliothequeAffichee } from "./modele.js";
import type { Collection, NomIcone } from "../composants/index.js";

/** Ce que l'accueil montre d'une bibliothèque ouverte (B1).
 *
 *  Une bibliothèque créée n'apparaissait nulle part : l'accueil ne lisait qu'un jeu de données
 *  séparé, et l'administrateur se retrouvait devant un premier lancement alors qu'il venait de
 *  créer sa bibliothèque. Elle vient maintenant de sa description et de sa version active.
 *
 *  Aucun mot de domaine : les compteurs portent les mots de la bibliothèque, et le bandeau est
 *  choisi d'après ce qu'elle contient — jamais d'après ce que ses éléments représentent. */

/** Le bandeau d'une bibliothèque, d'après ce qu'elle annonce contenir.
 *
 *  Un choix de présentation, pas un classement : il dit « il y a des vidéos là-dedans », pas ce
 *  que ces vidéos sont. */
export function bandeauDe(contenus: readonly TypeDeContenu[]): Collection {
  if (contenus.includes("videos")) return "video";
  if (contenus.includes("documents")) return "method";
  if (contenus.includes("images")) return "photos";
  return "research";
}

const ICONES: Readonly<Record<TypeDeContenu, NomIcone>> = {
  documents: "livre",
  audio: "audio",
  videos: "video",
  images: "image",
};

/** Une bibliothèque telle que l'accueil la montre. Sans version active, elle existe quand même :
 *  elle n'a simplement encore rien traité, et le dire vaut mieux que la cacher. */
export function pourLAccueil(
  description: DescriptionBibliotheque,
  vue: VueBibliotheque | undefined,
  surCetAppareil: string,
): BibliothequeAffichee {
  const compteurs = vue?.compteurs ?? [];
  return {
    id: description.id,
    nom: description.nom,
    href: "#depot",
    collection: bandeauDe(description.contenus),
    icones: description.contenus.map((contenu) => ICONES[contenu]),
    compteurs,
    ...(vue === undefined || vue.aVerifier === 0 ? {} : { aVerifier: vue.aVerifier }),
    hebergement: { libelle: surCetAppareil, icones: ["ordinateur"] },
    etat:
      vue === undefined
        ? { libelle: "Rien de traité pour l’instant", icone: "horloge" }
        : { libelle: "Prêt", icone: "valide" },
    ouverte: "à l’instant",
  };
}
