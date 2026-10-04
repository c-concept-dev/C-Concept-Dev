import { ElementAffiche, VueBibliotheque, type PageAffichee } from "@lienotheque/contrats";

/** Jeu de démonstration des écrans du lot C. Développement seulement — `?demonstration` dans
 *  l'adresse, jamais dans la construction de production (voir vue.ts).
 *
 *  Aucune œuvre, aucun titre réel : des numéros et des mots du schéma. Le but est de faire
 *  travailler les écrans, pas de montrer un contenu. */

const ID = "0190f0a0-0000-7000-8000-0000000000c1";
const empreinte = (n: number): string => (n % 256).toString(16).padStart(2, "0").repeat(32);

const element = (n: number, page: number, options: Partial<ElementAffiche> = {}): ElementAffiche =>
  ElementAffiche.parse({
    ancreId: `0190f0a0-0000-7000-8000-${String(900 + n).padStart(12, "0")}`,
    numero: String(n),
    page,
    zone: { x: 0.1, y: 0.12 + ((n % 4) * 0.2), l: 0.8, h: 0.16 },
    ...options,
  });

const avecMedia = (n: number, page: number, piste: number, debut: number, fin: number, confiance: number, preuve: "lu" | "sequence" | "nom_de_fichier"): ElementAffiche =>
  element(n, page, {
    media: { empreinte: empreinte(n), nom: `piste-${String(piste).padStart(2, "0")}.mp3`, piste, position: { segment: "connu", debut, fin, confiance }, duree: fin + 25 },
    pourquoi: {
      preuve,
      confiance,
      phrase:
        preuve === "lu"
          ? `Numéro lu sur la page et pastille présente en marge : piste ${piste}.`
          : preuve === "sequence"
            ? `Position déduite de la suite des pistes : piste ${piste}.`
            : `Numéro trouvé dans le nom du fichier : piste ${piste}.`,
    },
    aVerifier: confiance < 0.8,
  });

const page = (numero: number, elements: readonly ElementAffiche[], texte: readonly string[]): PageAffichee => ({
  numero,
  elements: [...elements],
  texte: [...texte],
  traduction: [],
});

export const VUE_DEMONSTRATION = VueBibliotheque.parse({
  id: ID,
  nom: "Bibliothèque de démonstration",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "page", plusieurs: "pages" },
  },
  compteurs: [
    { nombre: 3, mot: "pages" },
    { nombre: 7, mot: "éléments" },
    { nombre: 5, mot: "pistes" },
  ],
  aVerifier: 2,
  filtres: [
    {
      cle: "etat",
      nom: "État",
      valeurs: [
        { cle: "valide", nom: "Validé", nombre: 5 },
        { cle: "a_verifier", nom: "À vérifier", nombre: 2 },
      ],
    },
    {
      cle: "preuve",
      nom: "Pourquoi",
      valeurs: [
        { cle: "lu", nom: "Numéro lu", nombre: 4 },
        { cle: "sequence", nom: "Suite des pistes", nombre: 2 },
        { cle: "nom_de_fichier", nom: "Nom du fichier", nombre: 1 },
      ],
    },
    {
      cle: "media",
      nom: "Média",
      valeurs: [
        { cle: "avec", nom: "Avec média", nombre: 6 },
        { cle: "sans", nom: "Sans média", nombre: 1 },
      ],
    },
  ],
  pages: [
    page(
      12,
      [avecMedia(188, 12, 13, 0, 42, 0.93, "lu"), avecMedia(189, 12, 14, 0, 51, 0.71, "sequence")],
      ["Exercice en deux temps", "Garder le tempo au métronome", "Reprendre la mesure 4"],
    ),
    page(
      13,
      [avecMedia(190, 13, 15, 0, 38, 0.88, "lu"), avecMedia(191, 13, 16, 12, 64, 0.64, "nom_de_fichier"), element(192, 13)],
      ["Variante sur deux octaves", "Lier les deux dernières notes"],
    ),
    page(14, [avecMedia(193, 14, 17, 0, 47, 0.9, "lu"), avecMedia(194, 14, 18, 0, 55, 0.85, "sequence")], ["Enchaîner sans reprendre souffle"]),
  ],
  douteux: [
    {
      id: "0190f0a0-0000-7000-8000-000000000d01",
      nature: "lien",
      etat: "confiance",
      element: avecMedia(189, 12, 14, 0, 51, 0.71, "sequence"),
      proposition: "Relier à la piste 14, du début à 51 s",
      motif: "Le numéro lu en marge et la suite des pistes ne disent pas la même chose.",
    },
    {
      id: "0190f0a0-0000-7000-8000-000000000d02",
      nature: "lien",
      etat: "segment_inconnu",
      element: avecMedia(191, 13, 16, 12, 64, 0.64, "nom_de_fichier"),
      proposition: "Relier à la piste 16, de 12 s à 1 min 04 s",
      motif: "Le segment a été trouvé au silence le plus proche, pas sur un repère.",
    },
  ],
});
