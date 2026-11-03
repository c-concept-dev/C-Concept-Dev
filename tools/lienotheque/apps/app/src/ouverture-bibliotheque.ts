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

/** Ce qu'on trouve en rouvrant une bibliothèque déjà connue de la session. */
export type ChoixDeBibliotheque =
  | { readonly etat: "ouverte"; readonly description: DescriptionBibliotheque }
  | { readonly etat: "absente" };

/** Rouvrir une bibliothèque que la session connaît déjà, en relisant son dossier.
 *
 *  Entre le démarrage et le clic, le dossier a pu partir : volume débranché, dossier déplacé,
 *  mis à la corbeille. La liste tenue en mémoire, elle, ne l'apprend jamais — elle a été filtrée
 *  une seule fois, au lancement. Sans cette relecture, choisir une bibliothèque absente se
 *  bornait à la remonter en queue de liste, et l'écran montrait **sous son nom les documents de
 *  celle d'avant**. Trouvé le 3 novembre 2026 en pilotant le paquet installé.
 *
 *  « Absente » ne veut pas dire « supprimée » : l'hôte continue de la retenir, et rebrancher le
 *  volume la ramène. C'est pourquoi rien n'est oublié ici. */
export async function choisirBibliothequeConnue(
  administration: PortAdministration,
  racine: string,
): Promise<ChoixDeBibliotheque> {
  try {
    const description = await administration.lireBibliotheque(racine);
    return description === undefined ? { etat: "absente" } : { etat: "ouverte", description };
  } catch {
    return { etat: "absente" };
  }
}
