import { invoke } from "@tauri-apps/api/core";
import type { PortAdministration, PortDeLecture } from "./port.js";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ApercuDocument,
  ArriveeDeFichiers,
  ClassementLocal,
  DescriptionBibliotheque,
  Passage,
  Recette,
  ReglagesHote,
  Travail,
  VueBibliotheque,
} from "@lienotheque/contrats";

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

/** Ouvre le sélecteur de fichiers du système et rend les chemins choisis.
 *
 *  Des chemins, et non des fichiers : l'hôte copie depuis le disque, et un fichier choisi dans la
 *  page n'a pas de chemin qu'il puisse suivre. */
export async function choisirFichiers(titre: string): Promise<readonly string[]> {
  const choisis = await open({ directory: false, multiple: true, title: titre });
  return Array.isArray(choisis) ? choisis : typeof choisis === "string" ? [choisis] : [];
}

/** Dépose des fichiers dans une bibliothèque. L'hôte copie les originaux et met la file à jour. */
export async function deposer(racine: string, chemins: readonly string[]): Promise<ArriveeDeFichiers> {
  return ArriveeDeFichiers.parse(await invoke("deposer", { racine, chemins: [...chemins] }));
}

/** Met la file d'une bibliothèque en route. Deux appels pour la même ne font qu'un roulement. */
export async function faireTourner(racine: string): Promise<boolean> {
  return invoke<boolean>("faire_tourner", { racine });
}

/** La file d'une bibliothèque, telle que l'écran de traitement la montre. */
export async function travauxDe(racine: string): Promise<readonly Travail[]> {
  return Travail.array().parse(await invoke("travaux", { racine }));
}

/** Met un travail en pause, le reprend, ou l'annule (JOB-08). */
export async function agirSurTravail(racine: string, id: string, action: "pause" | "reprendre" | "annuler"): Promise<Travail> {
  return Travail.parse(await invoke("agir_sur_travail", { racine, id, action }));
}

/** Quelques pages d'un document déposé, en images, pour les montrer dans l'éditeur.
 *
 *  Avant toute recette : on ne peut pas montrer où regarder sur une page qu'on ne voit pas. */
export async function apercuDePages(
  racine: string,
  nom: string,
  depuis: number,
  combien: number,
): Promise<readonly { rang: number; image: string }[]> {
  // L'hôte rend les images elles-mêmes, et non des chemins : ouvrir l'accès au disque depuis la
  // page pour montrer huit vignettes serait payer très cher une commodité.
  const rendu = await invoke<{ pages?: { rang: number; image: string }[] }>("apercu_de_pages", {
    racine,
    nom,
    depuis,
    combien,
  });
  return (rendu.pages ?? []).map((page) => ({ rang: page.rang, image: page.image }));
}

/** Essaie une manière de lire sur quelques pages, sans rien enregistrer (REC-07). */
export async function essayerManiere(
  racine: string,
  nom: string,
  recette: unknown,
  depuis: number,
  pages: number,
): Promise<VueBibliotheque> {
  const rendu = await invoke<{ vue: unknown }>("essayer_maniere", {
    racine,
    nom,
    recette: JSON.stringify(recette),
    depuis,
    pages,
  });
  return VueBibliotheque.parse(rendu.vue);
}

/** Enregistre la manière de lire d'une bibliothèque, et rend le chemin où elle a été écrite. */
export async function enregistrerManiere(racine: string, recette: unknown): Promise<string> {
  return invoke<string>("enregistrer_maniere", { racine, recette: JSON.stringify(recette) });
}

/** La manière de lire d'une bibliothèque, ou rien si elle n'en a pas encore. */
export async function lireManiere(racine: string): Promise<Recette | undefined> {
  const brut = await invoke<string | null>("lire_maniere", { racine });
  return brut === null ? undefined : Recette.parse(JSON.parse(brut));
}

/** Ce que les écrans lisent d'une bibliothèque : sa version active (B5, JOB-06).
 *
 *  Rien si ce document n'a aucune version active — ce n'est pas une panne, c'est un document
 *  qui n'a pas encore été traité. */
export async function vueDeDocument(racine: string, empreinte: string): Promise<VueBibliotheque | undefined> {
  const brut = await invoke<unknown>("vue_de_document", { racine, empreinte });
  return brut === null || brut === undefined ? undefined : VueBibliotheque.parse(brut);
}

/** Ce que le Catalogue lit : une **projection légère** de tous les documents.
 *
 *  Une projection, jamais une concaténation : 1,10 Mo par version mesuré, soit deux cent
 *  soixante-quinze mégaoctets à lire pour afficher une liste de titres sur deux cent cinquante
 *  documents. On ne rend que ce qu'un catalogue montre. */
/** Le texte d'un document : les passages de sa version active (RCH-07).
 *
 *  À part de la vue, parce que le texte n'est pas dans la vue : la chaîne le range dans les
 *  passages de la version. Un document non traité n'en a aucun, et ce n'est pas une panne. */
export async function passagesDeDocument(racine: string, empreinte: string): Promise<readonly Passage[]> {
  const brut = await invoke<unknown>("passages_de_document", { racine, empreinte });
  // Un document non traité n'a pas de version active, et une version d'avant le chemin du texte
  // n'a pas de passages : une liste vide dans les deux cas, pas une panne. Au-delà, le contrat
  // tranche et lève — un passage abîmé se voit, il ne se perd pas en silence (FMT-04).
  if (!Array.isArray(brut)) return [];
  return brut.map((un) => Passage.parse(un));
}

/** Range un document sur les axes de sa bibliothèque (CLA-01).
 *
 *  Le classement est vérifié par le noyau avant d'arriver ici : `classerUnDocument` sait lire un
 *  schéma, l'hôte non. */
export async function classerDocument(racine: string, classement: ClassementLocal): Promise<void> {
  await invoke("classer_document", { racine, empreinte: classement.empreinte, classement });
}

/** Les classements de toute la bibliothèque, par empreinte.
 *
 *  Un document absent de la table n'est pas rangé — et c'est une réponse, pas un manque à
 *  combler par une valeur par défaut. */
export async function classementsDeBibliotheque(racine: string): Promise<ReadonlyMap<string, ClassementLocal>> {
  const brut = await invoke<unknown>("classements_de_bibliotheque", { racine });
  if (brut === null || typeof brut !== "object") return new Map();
  return new Map(Object.entries(brut).map(([empreinte, un]) => [empreinte, ClassementLocal.parse(un)]));
}

export async function apercuDeBibliotheque(racine: string): Promise<readonly ApercuDocument[]> {
  const brut = await invoke<unknown[]>("apercu_de_bibliotheque", { racine });
  return brut.map((un) => ApercuDocument.parse(un));
}

/** La version active d'un document : c'est elle qui dit où prendre les images. */
export async function versionActive(racine: string, empreinte: string): Promise<string | undefined> {
  return (await invoke<string | null>("version_active", { racine, empreinte })) ?? undefined;
}

/** L'image d'une page, à la demande. Une par une : un livre entier ne tient pas en mémoire. */
export async function imageDePage(racine: string, version: string, fichier: string): Promise<string | undefined> {
  return (await invoke<string | null>("image_de_page", { racine, version, fichier })) ?? undefined;
}

/** Le pont du bureau remplit **les deux** ports.
 *
 *  Rien n'est réécrit : les fonctions ci-dessus sont rassemblées telles quelles, et le typage
 *  vérifie qu'elles remplissent leur contrat. Si l'une s'en écarte un jour, la compilation le
 *  dira ici plutôt qu'à l'exécution dans la version en ligne.
 *
 *  La version en ligne ne remplira que le premier. C'est tout l'objet de la scission : elle
 *  n'aura pas à feindre de savoir désigner un dossier. */
export const lectureDuBureau: PortDeLecture = {
  apercuDeBibliotheque,
  vueDeDocument,
  passagesDeDocument,
  versionActive,
  imageDePage,
  classementsDeBibliotheque,
  classerDocument,
};

export const administrationDuBureau: PortAdministration = {
  creerBibliotheque,
  lireBibliotheque,
  ecrireBibliotheque,
  retenirBibliotheque,
  bibliothequesRetenues,
  choisirDossier,
  choisirFichiers,
  deposer,
  faireTourner,
  travauxDe,
  agirSurTravail,
  apercuDePages,
  essayerManiere,
  enregistrerManiere,
  lireManiere,
};
