import type { ApercuDocument, DescriptionBibliotheque, TypeDeContenu, VueBibliotheque } from "@lienotheque/contrats";
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

/** Les comptes d'une bibliothèque entière, à partir de ses projections légères.
 *
 * Les compteurs de `VueBibliotheque` ne décrivent qu'un document. Les afficher dans l'en-tête
 * du Catalogue ou sur la carte d'Accueil faisait donc passer le document ouvert pour toute la
 * bibliothèque. Ici, les mots restent ceux des projections (CLA-01), les zéros sans information
 * disparaissent, et « document » désigne seulement l'objet que l'application sait compter. */
export function compteursDeBibliotheque(documents: readonly ApercuDocument[]): BibliothequeAffichee["compteurs"] {
  const sommes = new Map<string, number>();
  for (const document of documents)
    for (const compteur of document.compteurs)
      sommes.set(compteur.mot, (sommes.get(compteur.mot) ?? 0) + compteur.nombre);

  return [
    { nombre: documents.length, mot: documents.length === 1 ? "document" : "documents" },
    ...[...sommes].filter(([, nombre]) => nombre > 0).map(([mot, nombre]) => ({ nombre, mot })),
  ];
}

/** Une bibliothèque telle que l'accueil la montre. Sans version active, elle existe quand même :
 *  elle n'a simplement encore rien traité, et le dire vaut mieux que la cacher. */
export function pourLAccueil(
  description: DescriptionBibliotheque,
  vue: VueBibliotheque | undefined,
  surCetAppareil: string,
  compteursDeLaBibliotheque?: BibliothequeAffichee["compteurs"],
): BibliothequeAffichee {
  const compteurs = compteursDeLaBibliotheque ?? vue?.compteurs ?? [];
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
