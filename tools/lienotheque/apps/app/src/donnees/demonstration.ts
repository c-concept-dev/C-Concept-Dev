import { DescriptionBibliotheque, Travail } from "@lienotheque/contrats";
import type { Ancre, Document as DocumentLn } from "@lienotheque/contrats";
import type { BibliothequeAffichee, DonneesAccueil, Reprise } from "./modele.js";

/** Jeu de démonstration. Il ne sert qu'au développement : `?demonstration` dans l'adresse,
 *  jamais dans la construction de production (voir chargement.ts).
 *
 *  Aucune donnée réelle, aucune œuvre. Tout est typé par @lienotheque/contrats et le test
 *  « données » le revalide à l'exécution. */

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const LE = "2026-10-03T09:00:00+02:00";

export const BIBLIOTHEQUES_ID = {
  methode: id(1),
  recherche: id(2),
  video: id(3),
  photos: id(4),
} as const;

export const DOCUMENTS = [
  { id: id(11), bibliothequeId: BIBLIOTHEQUES_ID.methode, titre: "Méthode d'instrument", alias: [], creeLe: LE },
  { id: id(12), bibliothequeId: BIBLIOTHEQUES_ID.recherche, titre: "Essai de sociologie", alias: [], creeLe: LE },
  { id: id(13), bibliothequeId: BIBLIOTHEQUES_ID.video, titre: "Conférence filmée", alias: [], creeLe: LE },
] as const satisfies readonly DocumentLn[];

export const ANCRES = [
  { id: id(21), versionId: id(31), fichier: "a".repeat(64), selecteur: { type: "page", index: 127, pageImprimee: { valeur: "127", statut: "lu" } } },
  { id: id(22), versionId: id(32), fichier: "b".repeat(64), selecteur: { type: "chapitre", ref: "41" } },
  { id: id(23), versionId: id(33), fichier: "c".repeat(64), selecteur: { type: "chapitre", ref: "4" } },
  { id: id(24), versionId: id(33), fichier: "c".repeat(64), selecteur: { type: "page", index: 88 } },
  { id: id(25), versionId: id(34), fichier: "d".repeat(64), selecteur: { type: "temps", debut: 760, fin: 820 } },
  { id: id(26), versionId: id(35), fichier: "e".repeat(64), selecteur: { type: "element", page: 15, valeur: "15" } },
] as const satisfies readonly Ancre[];

const ancre = (rang: number): Ancre => ANCRES[rang] as Ancre;

/** Travail en cours affiché dans le panneau « Traitement » (JOB-01 : persisté avant de commencer). */
export const TRAVAIL_EN_COURS = {
  id: id(41),
  outil: { nom: "transcripteur", version: "1.0.0" },
  versionCible: id(34),
  etat: "en_cours",
  lieu: "application",
  poids: "lourd",
  tentative: 1,
  pointReprise: { unite: "lot", valeur: 6 },
  progression: 0.6,
  creeLe: LE,
  majLe: LE,
} as const satisfies Travail;

/** « Reprendre où vous en étiez » (Accueil du CDC). Les mots « piste » et « diapositive »
 *  viennent du schéma de chaque bibliothèque, pas du composant. */
export const REPRISES: readonly Reprise[] = [
  {
    documentId: DOCUMENTS[0].id,
    titre: DOCUMENTS[0].titre,
    href: "#lecteur-methode",
    origine: [{ selecteur: ancre(0).selecteur }],
    cible: { selecteur: ancre(1).selecteur, mot: "piste" },
    quand: "il y a 2 h",
  },
  {
    documentId: DOCUMENTS[1].id,
    titre: DOCUMENTS[1].titre,
    href: "#lecteur-essai",
    origine: [{ selecteur: ancre(2).selecteur }, { selecteur: ancre(3).selecteur }],
    quand: "hier",
  },
  {
    documentId: DOCUMENTS[2].id,
    titre: DOCUMENTS[2].titre,
    href: "#lecteur-conference",
    origine: [{ selecteur: ancre(4).selecteur }],
    cible: { selecteur: ancre(5).selecteur, mot: "diapositive" },
    quand: "lundi",
  },
];

export const BIBLIOTHEQUES: readonly BibliothequeAffichee[] = [
  {
    id: BIBLIOTHEQUES_ID.methode,
    nom: "Méthode d'instrument",
    href: "#bibliotheque-methode",
    collection: "method",
    icones: ["document", "audio"],
    compteurs: [
      { nombre: 412, mot: "éléments" },
      { nombre: 380, mot: "liens" },
    ],
    aVerifier: 9,
    hebergement: { libelle: "Ordinateur", icones: ["ordinateur"] },
    etat: { libelle: "Prêt", icone: "valide" },
    ouverte: "il y a 2 h",
  },
  {
    id: BIBLIOTHEQUES_ID.recherche,
    nom: "Bibliothèque de recherche",
    href: "#bibliotheque-recherche",
    collection: "research",
    icones: ["livre"],
    compteurs: [
      { nombre: 234, mot: "livres" },
      { nombre: 1120, mot: "liens" },
    ],
    hebergement: { libelle: "Cloudflare", icones: ["nuage"] },
    etat: { libelle: "Prêt", icone: "valide" },
    ouverte: "hier",
    partages: 2,
  },
  {
    id: BIBLIOTHEQUES_ID.video,
    nom: "Cours vidéo",
    href: "#bibliotheque-video",
    collection: "video",
    icones: ["video", "document"],
    compteurs: [
      { nombre: 18, mot: "vidéos" },
      { nombre: 96, mot: "liens" },
    ],
    hebergement: { libelle: "Mixte", icones: ["ordinateur", "nuage"] },
    etat: { libelle: "En traitement", enCours: true },
    ouverte: "lundi",
  },
  {
    id: BIBLIOTHEQUES_ID.photos,
    nom: "Archives photo",
    href: "#bibliotheque-photos",
    collection: "photos",
    icones: ["image"],
    compteurs: [
      { nombre: 1204, mot: "images" },
      { nombre: 0, mot: "liens" },
    ],
    hebergement: { libelle: "Ordinateur", icones: ["ordinateur"] },
    etat: { libelle: "Prêt", icone: "valide" },
    ouverte: "hier",
  },
];

/** Cas en attente de décision humaine, repris du panneau « À vérifier » des maquettes. */
export const A_VERIFIER = { nombre: 9, bibliotheque: "Méthode d'instrument", href: "#verifier" } as const;

export const TRAITEMENT = { libelle: "Cours vidéo nº 4 · transcription", reste: "environ 4 min" } as const;

export const COMPTE = { initiales: "CB", nom: "Votre compte" } as const;

/** Le tout, tel que l'accueil le reçoit. */
export const DEMONSTRATION: DonneesAccueil = {
  bibliotheques: BIBLIOTHEQUES,
  reprises: REPRISES,
  aVerifier: A_VERIFIER,
  traitement: { ...TRAITEMENT, progression: TRAVAIL_EN_COURS.progression },
  compte: COMPTE,
};

/** Une bibliothèque de démonstration, pour l'écran d'organisation et pour les captures.
 *
 *  Elle est inventée de bout en bout : aucune œuvre, aucune donnée réelle. Trois façons de
 *  ranger, dont une déjà fusionnée, pour que l'écran montre aussi ce cas. Le test « données »
 *  la revalide par son contrat à l'exécution. */
export const BIBLIOTHEQUE: { readonly racine: string; readonly description: DescriptionBibliotheque } = {
  racine: "/Bibliothèques/Méthode d’instrument",
  description: DescriptionBibliotheque.parse({
    id: "methode-instrument",
    nom: "Méthode d’instrument",
    contenus: ["documents", "audio"],
    mots: {
      element: { un: "exercice", plusieurs: "exercices" },
      piste: { un: "piste", plusieurs: "pistes" },
      page: { un: "page", plusieurs: "pages" },
    },
    description: "Une méthode et ses enregistrements, reliés page à page.",
    schema: {
      cle: "methode-instrument",
      nom: "Méthode d’instrument",
      langue: "fr",
      version: 3,
      axes: [
        {
          cle: "style",
          nom: "Style",
          nature: "referentiel",
          cardinalite: "une",
          valeurs: [
            { cle: "funk", nom: "Funk", alias: ["funky"] },
            { cle: "disco", nom: "Disco" },
            { cle: "jazz", nom: "Jazz" },
            { cle: "blues", nom: "Blues" },
            { cle: "latin", nom: "Latin" },
            { cle: "rock", nom: "Rock" },
          ],
        },
        {
          cle: "niveau",
          nom: "Niveau",
          nature: "referentiel",
          cardinalite: "une",
          roleCommun: "niveau",
          valeurs: [
            { cle: "debutant", nom: "Débutant" },
            { cle: "intermediaire", nom: "Intermédiaire" },
            { cle: "avance", nom: "Avancé" },
          ],
        },
        {
          cle: "technique",
          nom: "Technique",
          nature: "liste_semi_ouverte",
          cardinalite: "plusieurs",
          valeurs: [
            { cle: "doigte", nom: "Doigté" },
            { cle: "articulation", nom: "Articulation" },
            { cle: "rythme", nom: "Rythme" },
            { cle: "lecture", nom: "Lecture" },
            { cle: "harmonie", nom: "Harmonie" },
            { cle: "improvisation", nom: "Improvisation" },
            { cle: "posture", nom: "Posture", retiree: true, redirigeVers: "doigte" },
          ],
        },
      ],
    },
  }),
};

/** Trois éléments, pour montrer ce que l'organisation donnera. Inventés eux aussi. */
export const EXEMPLES_ORGANISATION = [
  { titre: "Exercice 400", situation: "Page 127 · relié à la piste 40", valeurs: ["Funk", "Débutant", "Articulation", "Rythme"] },
  { titre: "Exercice 512", situation: "Page 158 · relié à la piste 52", valeurs: ["Disco", "Intermédiaire", "Doigté"] },
  { titre: "Exercice 844", situation: "Page 227 · aucune piste", valeurs: ["Jazz", "Avancé", "Improvisation", "Harmonie"] },
] as const;

/** Une file en train de tourner, pour l'écran de traitement et pour les captures.
 *
 *  Les six cas que l'écran doit savoir montrer : en cours avec son total, en cours sans total
 *  encore connu, en attente, en pause, en panne, et terminé. Inventés eux aussi. */
export const FILE = [
  {
    id: id(51),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(151),
    etat: "en_cours",
    tentative: 1,
    progression: 0.68,
    sujet: { nom: "Méthode d’instrument — volume 1.pdf", contenu: "documents", total: 286 },
    pointReprise: { unite: "page", valeur: 194 },
    creeLe: LE,
    majLe: LE,
  },
  {
    id: id(52),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(152),
    etat: "en_cours",
    tentative: 1,
    progression: 0.12,
    sujet: { nom: "Archives 1978-1984.pdf", contenu: "documents", total: 412 },
    pointReprise: { unite: "page", valeur: 49 },
    creeLe: LE,
    majLe: LE,
  },
  {
    id: id(53),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(153),
    etat: "en_file",
    tentative: 1,
    progression: 0,
    sujet: { nom: "Recueil de planches.pdf", contenu: "documents" },
    creeLe: LE,
    majLe: LE,
  },
  {
    id: id(54),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(154),
    etat: "en_pause",
    tentative: 1,
    progression: 0.55,
    sujet: { nom: "Cahier d’accompagnement.pdf", contenu: "documents", total: 158 },
    pointReprise: { unite: "page", valeur: 87 },
    creeLe: LE,
    majLe: LE,
  },
  {
    id: id(55),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(155),
    etat: "en_echec_recuperable",
    tentative: 1,
    progression: 0.94,
    sujet: { nom: "Livre d’exercices.pdf", contenu: "documents", total: 204 },
    pointReprise: { unite: "page", valeur: 192 },
    erreur: { cause: "2 pages illisibles — le reste du fichier est bien traité", elements: [], reprisePossible: true },
    creeLe: LE,
    majLe: LE,
  },
  {
    id: id(56),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: id(156),
    etat: "termine",
    tentative: 1,
    progression: 1,
    sujet: { nom: "Planches illustrées.pdf", contenu: "documents", total: 96 },
    pointReprise: { unite: "page", valeur: 96 },
    creeLe: LE,
    majLe: LE,
  },
].map((brut) => Travail.parse(brut)) satisfies readonly Travail[];

/** Ce qui est déposé mais ne se lit pas seul : il attend le document qui le nommera. */
export const ACCOMPAGNEMENTS = [
  { nom: "Disque 1 — 24 pistes.zip", contenu: "audio" },
  { nom: "Disque 2 — 18 pistes.zip", contenu: "audio" },
] as const;

/** Une page à annoter et deux zones déjà tracées, pour l'écran de manière de lire.
 *
 *  L'image est un dessin, pas une œuvre : des portées et un numéro encadré, de quoi montrer où
 *  l'on trace. Rien de ce document n'existe.
 *
 *  Ses couleurs viennent des jetons, lus sur le document au moment où on la dessine — une page
 *  imprimée suit la charte comme le reste, et elle suit donc aussi le thème. */
function jeton(nom: string, secours: string): string {
  const lu = globalThis.getComputedStyle?.(globalThis.document.documentElement).getPropertyValue(nom).trim();
  return lu === undefined || lu === "" ? secours : lu;
}

function pageDessinee(): string {
  const papier = jeton("--ln-print-background", "Canvas");
  const encre = jeton("--ln-print-text", "CanvasText");
  const portees = [0, 1, 2, 3, 4, 5]
    .map((rang) => {
      const y = 110 + rang * 118;
      const lignes = [0, 1, 2, 3, 4]
        .map((n) => `<line x1="38" y1="${y + n * 9}" x2="582" y2="${y + n * 9}" stroke="${encre}" stroke-opacity="0.55"/>`)
        .join("");
      const notes = [0, 1, 2, 3, 4, 5, 6, 7]
        .map((n) => `<ellipse cx="${72 + n * 64}" cy="${y + 9 + (n % 4) * 9}" rx="5" ry="3.6" fill="${encre}"/>`)
        .join("");
      return lignes + notes;
    })
    .join("");

  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 840" width="620" height="840">
       <rect width="620" height="840" fill="${papier}"/>
       <rect x="38" y="34" width="46" height="24" fill="none" stroke="${encre}" stroke-width="2"/>
       <text x="46" y="52" font-family="Inter, sans-serif" font-size="16" fill="${encre}">2.1</text>
       ${portees}
       <text x="566" y="812" font-family="Inter, sans-serif" font-size="14" fill="${encre}">15</text>
     </svg>`,
  )}`;
}

export const PAGES_A_TRACER = [
  { rang: 14, image: pageDessinee() },
  { rang: 15, image: pageDessinee() },
] as const;

export const ZONES_TRACEES = [
  { cle: "zone-element", role: "element" as const, rectangle: { x: 0.055, y: 0.035, l: 0.09, h: 0.035 } },
  { cle: "zone-page", role: "page_imprimee" as const, rectangle: { x: 0.88, y: 0.945, l: 0.09, h: 0.035 } },
];
