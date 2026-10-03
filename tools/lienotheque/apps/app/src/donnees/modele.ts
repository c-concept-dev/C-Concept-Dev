import type { Collection, NomIcone } from "../composants/index.js";
import type { Position } from "./positions.js";

/** Ce que l'accueil sait afficher. Tout est facultatif sauf les bibliothèques :
 *  une section sans contenu ne s'affiche pas, et sans bibliothèque c'est un premier lancement. */

export type Compteur = { readonly nombre: number; readonly mot: string };

export type BibliothequeAffichee = {
  readonly id: string;
  readonly nom: string;
  readonly href: string;
  readonly collection: Collection;
  readonly icones: readonly NomIcone[];
  /** Libellés venus du schéma de la bibliothèque (CLAUDE.md, règle 1). */
  readonly compteurs: readonly Compteur[];
  readonly aVerifier?: number | undefined;
  readonly hebergement: { readonly libelle: string; readonly icones: readonly NomIcone[] };
  readonly etat: { readonly libelle: string; readonly icone?: NomIcone; readonly enCours?: boolean };
  readonly ouverte: string;
  readonly partages?: number | undefined;
};

export type Reprise = {
  readonly documentId: string;
  readonly titre: string;
  readonly href: string;
  readonly origine: readonly Position[];
  readonly cible?: Position | undefined;
  readonly quand: string;
};

export type AVerifier = { readonly nombre: number; readonly bibliotheque: string; readonly href: string };

export type Traitement = { readonly libelle: string; readonly reste: string; readonly progression: number };

export type Compte = { readonly initiales: string; readonly nom: string };

export type DonneesAccueil = {
  readonly bibliotheques: readonly BibliothequeAffichee[];
  readonly reprises: readonly Reprise[];
  readonly aVerifier?: AVerifier | undefined;
  readonly traitement?: Traitement | undefined;
  readonly compte?: Compte | undefined;
};

/** Premier lancement : rien à montrer, donc rien n'est montré. */
export const ACCUEIL_VIDE: DonneesAccueil = { bibliotheques: [], reprises: [] };

export const nombreFrancais = (nombre: number): string => nombre.toLocaleString("fr-FR");

export const decrireCompteur = ({ nombre, mot }: Compteur): string => `${nombreFrancais(nombre)} ${mot}`;
