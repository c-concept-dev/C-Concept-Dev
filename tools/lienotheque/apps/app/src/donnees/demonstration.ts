import type { Ancre, Document as DocumentLn, Travail } from "@lienotheque/contrats";
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
