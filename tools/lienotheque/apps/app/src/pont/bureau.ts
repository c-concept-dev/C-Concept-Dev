import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { DescriptionBibliotheque, ReglagesHote } from "@lienotheque/contrats";

/** Le pont vers l'hôte de bureau (PLT-02).
 *
 *  Toutes les commandes de l'hôte passent par ici, et par nulle part ailleurs : un nom de commande
 *  écrit à deux endroits finit par ne plus être le même. La page ne touche jamais au dépôt — elle
 *  demande, l'hôte écrit (JOB-06).
 *
 *  Ce que l'hôte rend est du texte, pas un objet : il traverse une frontière, donc son contrat le
 *  valide ici avant que le moindre écran s'y fie. */

/** Vrai seulement dans l'application de bureau : la page web n'a pas d'hôte derrière elle. */
export function estBureau(): boolean {
  return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

/** Crée la bibliothèque dans son dossier portable, et rend le chemin de sa description.
 *
 *  L'hôte refuse d'écraser une bibliothèque existante : on le dit, on n'écrase pas en silence. */
export async function creerBibliotheque(racine: string, description: DescriptionBibliotheque): Promise<string> {
  return invoke<string>("creer_bibliotheque", { racine, description: JSON.stringify(description) });
}

/** La description d'une bibliothèque, ou rien si ce dossier n'en porte pas. */
export async function lireBibliotheque(racine: string): Promise<DescriptionBibliotheque | undefined> {
  const brut = await invoke<string | null>("lire_bibliotheque", { racine });
  return brut === null ? undefined : DescriptionBibliotheque.parse(JSON.parse(brut));
}

/** Réécrit la description d'une bibliothèque qui existe déjà (CLA-03, CLA-08). */
export async function ecrireBibliotheque(racine: string, description: DescriptionBibliotheque): Promise<void> {
  await invoke("ecrire_bibliotheque", { racine, description: JSON.stringify(description) });
}

/** Ouvre le sélecteur de dossier du système, et rend le chemin choisi — ou rien si l'on renonce. */
export async function choisirDossier(titre: string): Promise<string | undefined> {
  const choisi = await open({ directory: true, multiple: false, title: titre });
  return typeof choisi === "string" ? choisi : undefined;
}

/** Ce que l'hôte retient d'une session à l'autre : cet appareil, et les bibliothèques ouvertes. */
export async function reglages(): Promise<ReglagesHote> {
  return ReglagesHote.parse(await invoke("reglages"));
}

/** Met une bibliothèque en tête des récentes. Après l'avoir créée, ou ouverte. */
export async function retenirBibliotheque(racine: string): Promise<ReglagesHote> {
  return ReglagesHote.parse(await invoke("retenir_bibliotheque", { racine }));
}

/** Retire une bibliothèque de la liste des récentes. Le dossier n'est pas touché. */
export async function oublierBibliotheque(racine: string): Promise<ReglagesHote> {
  return ReglagesHote.parse(await invoke("oublier_bibliotheque", { racine }));
}

/** Les bibliothèques que l'hôte connaît, avec leur description — celles dont le dossier a
 *  disparu ou n'en porte plus sont écartées, sans bruit et sans les oublier pour autant : un
 *  volume externe débranché n'est pas une bibliothèque supprimée. */
export async function bibliothequesRetenues(): Promise<readonly { racine: string; description: DescriptionBibliotheque }[]> {
  const connues = await reglages();
  const lues = await Promise.all(
    connues.bibliotheques.map(async (racine) => {
      try {
        const description = await lireBibliotheque(racine);
        return description === undefined ? undefined : { racine, description };
      } catch {
        return undefined;
      }
    }),
  );
  return lues.filter((lue) => lue !== undefined);
}
