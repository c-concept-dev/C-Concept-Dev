import type { DescriptionBibliotheque } from "@lienotheque/contrats";
import type { PortAdministration } from "./pont/port.js";

export type ModeOuverture = "durable" | "temporaire";

export type BibliothequeOuverte = {
  readonly racine: string;
  readonly description: DescriptionBibliotheque;
  readonly temporaire: boolean;
};

type BibliothequeRetenue = Pick<BibliothequeOuverte, "racine" | "description">;

/** Adapte l'ordre des réglages de l'hôte à celui de l'application.
 *
 * L'hôte range la bibliothèque la plus récemment ouverte en tête. L'application, elle, garde la
 * bibliothèque courante en queue afin qu'un choix depuis l'accueil consiste seulement à la
 * déplacer à cet endroit. Sans cette conversion, le démarrage ouvrait la plus ancienne
 * bibliothèque encore lisible. */
export function bibliothequesPourSession(
  retenues: readonly BibliothequeRetenue[],
): readonly BibliothequeRetenue[] {
  const courante = retenues[0];
  return courante === undefined ? [] : [...retenues.slice(1), courante];
}

/** Ouvre un dossier selon une intention explicite.
 *
 *  Le mode temporaire sert aux épreuves de portabilité : il vérifie et ouvre la copie dans la
 *  session courante, mais n'appelle jamais le geste qui modifie les réglages persistants. Cette
 *  distinction vit ici, près de l'effet, afin qu'un futur écran ne puisse pas transformer par
 *  inadvertance un test ponctuel en nouvelle bibliothèque par défaut. */
export async function ouvrirBibliothequeDepuisDisque(
  administration: PortAdministration,
  mode: ModeOuverture,
): Promise<BibliothequeOuverte | undefined> {
  const temporaire = mode === "temporaire";
  const racine = await administration.choisirDossier(
    temporaire ? "Quelle copie tester temporairement ?" : "Quelle bibliothèque ouvrir ?",
  );
  if (racine === undefined) return undefined;

  const description = await administration.lireBibliotheque(racine);
  if (description === undefined)
    throw new Error("Ce dossier ne porte pas de bibliothèque. Choisissez celui que Liénothèque a créé.");

  if (!temporaire) await administration.retenirBibliotheque(racine);
  return { racine, description, temporaire };
}
