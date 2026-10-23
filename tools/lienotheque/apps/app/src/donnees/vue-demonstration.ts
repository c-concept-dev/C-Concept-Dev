import { Passage, VueBibliotheque } from "@lienotheque/contrats";

/** Jeu de démonstration des écrans (B5).
 *
 *  Réservé au mode développement et à l'adresse `?demonstration` : une bibliothèque réelle vient
 *  du dépôt, jamais d'ici. Il sert à montrer les écrans sans rien importer, et à les éprouver
 *  dans les trois moteurs là où les fixtures sous droits sont absentes.
 *
 *  Ce fichier est dans `donnees/` : c'est la seule zone où un mot de métier est admis, parce que
 *  ce sont des données et non du code (CLA-01). */

const ID = (n: number): string => `0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`;
const EMPREINTE = (n: number): string => String(n).padStart(64, "0");

const TITRES = ["Lecture simple", "Gammes en legato", "Lecture et articulation", "Études rythmiques", "Nuances et phrasé", "Jeu lié et détaché"];

const page = (numero: number, rang: number) => {
  const premier = 397 + rang * 3;
  return {
    // Le **rang** dans le document, à partir de un — et non le numéro imprimé. Les deux
    // désignent la même page et ne la nomment pas pareil : c'est par le rang qu'un écran
    // navigue, et « #lecteur/page=3 » ne désignait aucune page tant que l'index valait 127.
    index: rang + 1,
    numero,
    titre: TITRES[rang],
    elements: [0, 1, 2].map((decalage) => {
      const numeroElement = premier + decalage;
      const douteux = numeroElement === 405 || numeroElement === 407;
      return {
        ancreId: ID(numeroElement - 390),
        numero: String(numeroElement),
        page: numero,
        zone: { x: 0.07, y: 0.18 + decalage * 0.26, l: 0.86, h: 0.2 },
        media: {
          empreinte: EMPREINTE(numeroElement - 360),
          nom: `Piste ${numeroElement - 360}.mp3`,
          piste: numeroElement - 360,
          position:
            decalage === 0
              ? { segment: "connu" as const, debut: 0, fin: 23, confiance: 0.9 }
              : { segment: "inconnu" as const },
        },
        pourquoi: {
          preuve: decalage === 0 ? ("lu" as const) : ("sequence" as const),
          confiance: douteux ? 0.55 : decalage === 0 ? 1 : 0.75,
          phrase:
            decalage === 0
              ? `Repère « Piste ${numeroElement - 360} » lu à côté du numéro`
              : "Repère partiellement lu, déduit de la séquence",
        },
        aVerifier: douteux,
      };
    }),
    texte: [
      "Ces exercices visent à développer une lecture fluide et une articulation précise.",
      "Jouer lentement, en respectant les liaisons et les valeurs,",
      "puis augmenter progressivement le tempo.",
    ],
    traduction: ["These exercises aim to develop fluent reading and precise articulation."],
  };
};

const pages = [125, 126, 127, 128, 129, 130].map((numero, rang) => page(numero, rang));

const douteux = pages
  .flatMap((p) => p.elements)
  .filter((element) => element.aVerifier)
  .map((element, rang) => ({
    id: ID(80 + rang),
    nature: "lien" as const,
    etat: (rang === 0 ? "confiance" : "conflit_appareils") as "confiance" | "conflit_appareils",
    element,
    proposition: `élément ${element.numero} → piste ${element.media.piste}`,
    motif: "repère partiellement lu, déduit de la séquence",
  }));

export const VUE_DEMONSTRATION = VueBibliotheque.parse({
  id: ID(1),
  nom: "Méthode d’instrument",
  mots: {
    element: { un: "élément", plusieurs: "éléments" },
    piste: { un: "piste", plusieurs: "pistes" },
    page: { un: "page", plusieurs: "pages" },
  },
  compteurs: [
    { nombre: 412, mot: "éléments" },
    { nombre: 380, mot: "liens" },
  ],
  aVerifier: douteux.length,
  filtres: [
    {
      cle: "style",
      nom: "Style",
      valeurs: [
        { cle: "lecture", nom: "Lecture", nombre: 128 },
        { cle: "articulation", nom: "Articulation", nombre: 96 },
        { cle: "expression", nom: "Expression", nombre: 72 },
      ],
    },
    {
      cle: "niveau",
      nom: "Niveau",
      valeurs: [
        { cle: "debutant", nom: "Débutant", nombre: 146 },
        { cle: "intermediaire", nom: "Intermédiaire", nombre: 184 },
        { cle: "avance", nom: "Avancé", nombre: 82 },
      ],
    },
    { cle: "audio", nom: "Avec audio", valeurs: [{ cle: "oui", nom: "Oui", nombre: 380 }, { cle: "non", nom: "Sans audio", nombre: 32 }] },
  ],
  pages,
  douteux,
});

/** La même bibliothèque, vue depuis un document **composé en texte** : aucune image de page.
 *
 *  C'est le seul moyen d'atteindre l'écran de lecture du texte à la main. Une vue réelle vient
 *  du dépôt, et ni elle ni ses passages ne se fabriquent depuis l'écran : sans ce jeu-ci,
 *  l'écran n'aurait que ses tests pour preuve — exactement la situation qui a produit les neuf
 *  défauts du 21 octobre, où un mécanisme juste n'était atteignable par aucune porte.
 *
 *  Les cinq passages couvrent ce que l'écran doit savoir dire : un numéro imprimé, une page sans
 *  numéro, un emplacement de chapitre, un texte venu de la reconnaissance, et une page dont rien
 *  n'était lisible. */
export const VUE_SANS_IMAGE = VueBibliotheque.parse({
  ...VUE_DEMONSTRATION,
  pages: [],
  douteux: [],
  compteurs: [{ nombre: 5, mot: "pages" }],
  aVerifier: 0,
});

export const PASSAGES_SANS_IMAGE: readonly Passage[] = [
  {
    rang: 0,
    page: 1,
    pageImprimee: 7,
    texte:
      "L’apprentissage d’un instrument ne se joue pas dans la vitesse, mais dans la régularité du geste.\nCe que l’on répète lentement et juste, on le jouera vite et juste ; ce que l’on répète vite et faux, on le jouera vite et faux.\nLes pages qui suivent proposent un ordre de travail, non une méthode exclusive.",
    source: "couche_texte",
  },
  {
    rang: 1,
    page: 2,
    pageImprimee: 8,
    texte:
      "La main gauche se place avant que la droite ne sonne. C’est l’inverse de ce que l’oreille suggère, et c’est pourtant l’ordre qui donne la netteté.\nOn travaillera donc d’abord le placement muet, sans produire aucun son, jusqu’à ce que la position vienne seule.",
    source: "couche_texte",
  },
  {
    rang: 2,
    page: 3,
    texte:
      "Deuxième partie — Le travail du rythme.\nRien de ce qui suit ne demande de la force. Tout demande de la patience, et un métronome que l’on accepte de laisser lent.",
    source: "couche_texte",
    emplacement: "Chapitre 2 — Le travail du rythme",
  },
  {
    rang: 3,
    page: 4,
    pageImprimee: 10,
    texte:
      "Les trois figures de la page précédente se combinent deux à deux. On les jouera d’abord séparément, puis enchaînées sans reprendre son souffle entre elles.",
    source: "ocr",
  },
  { rang: 4, page: 5, pageImprimee: 11, texte: "···", source: "ocr", lisible: false },
].map((brut) => Passage.parse(brut));
