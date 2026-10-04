import type { LigneInterpretee, MotsBibliotheque, SchemaBibliotheque } from "@lienotheque/contrats";
import type { Association } from "@lienotheque/recettes";
import type { Entree, MediaIngere } from "../src/index.js";

/** Un lot minimal pour les contrôles de l'instantané.
 *
 *  Les mots sont ceux d'un domaine imaginaire, et féminins exprès : c'est ce qui fait apparaître
 *  les tournures qui demandent un genre, que le schéma ne donne pas. */

export const MOTS: MotsBibliotheque = {
  element: { un: "clause", plusieurs: "clauses" },
  piste: { un: "plage", plusieurs: "plages" },
  page: { un: "feuillet", plusieurs: "feuillets" },
};

export const SCHEMA: SchemaBibliotheque = {
  cle: "recueil",
  nom: "Recueil",
  langue: "fr",
  version: 1,
  axes: [
    {
      cle: "niveau",
      nom: "Niveau",
      nature: "referentiel",
      cardinalite: "une",
      structure: "plat",
      obligatoire: false,
      alias: [],
      valeurs: [
        { cle: "debutant", nom: "Débutant", alias: [], synonymes: [], retiree: false },
        { cle: "ancien", nom: "Ancien", alias: [], synonymes: [], retiree: true, redirigeVers: "debutant" },
      ],
    },
    // Un axe que l'application sait remplir elle-même : son rôle dit « etat », ses valeurs
    // disent « present » et « absent ». Le reste — les noms — est une donnée de la
    // bibliothèque, et pourrait être n'importe quoi dans un autre domaine.
    {
      cle: "ecoute",
      nom: "Avec écoute",
      nature: "referentiel",
      cardinalite: "une",
      structure: "plat",
      roleCommun: "etat",
      obligatoire: false,
      alias: [],
      valeurs: [
        { cle: "oui", nom: "Oui", alias: [], synonymes: [], retiree: false, roleValeur: "present" },
        { cle: "non", nom: "Non", alias: [], synonymes: [], retiree: false, roleValeur: "absent" },
      ],
    },
  ],
};

export const ligne = (numero: number, sur: Partial<LigneInterpretee> = {}): LigneInterpretee => ({
  numero,
  pageImprimee: 100 + Math.floor(numero / 3),
  piste: numero,
  disque: 1,
  sourcePiste: "pastille",
  confiance: 1,
  ...sur,
});

export const media = (piste: number): MediaIngere => ({
  empreinte: String(piste).padStart(64, "0"),
  piste,
  disque: 1,
  nom: `Plage ${piste}.mp3`,
});

export const entreeMinimale = (sur: Partial<Entree> = {}): Entree => ({
  id: "recueil",
  nom: "Recueil de procédures",
  schema: SCHEMA,
  mots: MOTS,
  lignes: [ligne(1), ligne(2), ligne(3)],
  association: { appariements: [], orphelins: [], manquants: [] } satisfies Association,
  medias: [media(1), media(2), media(3)],
  seuil: 0.6,
  ...sur,
});
