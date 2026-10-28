import { invoke as invoquerSansTrace } from "@tauri-apps/api/core";
import type { DecisionVerification, EtatApplicationEmbarquee, PortAdministration, PortDeLecture } from "./port.js";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ApercuDocument,
  AnalyseDepot,
  ArchivePreparee,
  ArriveeDeFichiers,
  ClassementLocal,
  CorrespondancesBibliotheque,
  DescriptionBibliotheque,
  Doublons,
  Passage,
  Recette,
  ReglagesHote,
  RetraitDeDocument,
  Rotation,
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
  if (typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis) return true;
  // En développement seulement : « ?bureau » fait prendre aux écrans la branche de l'hôte sans
  // hôte derrière. Un défaut qui ne se voit que dans le paquet ne se cherche pas autrement — le
  // navigateur ne prend jamais ce chemin, et le paquet n'a pas de console.
  return import.meta.env?.DEV === true && new URLSearchParams(globalThis.location?.search ?? "").has("bureau");
}

/** Écoute le vrai glisser-déposer de fichiers du paquet Tauri.
 *
 * Le DOM d'une WebView ne reçoit pas des chemins exploitables : l'hôte, lui, les connaît. Le
 * chargement dynamique garde cette dépendance native hors du chemin web et des tests navigateur. */
export async function observerDepotsDeFichiers(
  recevoir: (chemins: readonly string[]) => void,
): Promise<() => void> {
  if (typeof globalThis === "undefined" || !("__TAURI_INTERNALS__" in globalThis)) return () => undefined;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((evenement) => {
    if (evenement.payload.type === "drop" && evenement.payload.paths.length > 0) {
      recevoir(evenement.payload.paths);
    }
  });
}

/** Dit à l'hôte ce que la page affiche, pour qu'il l'écrive à son journal.
 *
 *  Un paquet n'a pas de console : sans ce fil, un écran qui ne s'affiche pas ne laisse aucune
 *  trace, et il faut le deviner. Elle ne lève jamais — un journal qui fait tomber ce qu'il
 *  observe ne sert à rien. */
export function journaliser(texte: string): void {
  if (!estBureau()) return;
  // Sans trace, et c'est vital : `invoke` ci-dessous journalise chacun de ses appels. Tracer
  // celui-ci ferait un appel par appel, sans fin.
  void invoquerSansTrace("journal_page", { texte }).catch(() => undefined);
}

/** Tout appel à l'hôte passe par ici, et chacun laisse deux lignes : la demande, puis ce qu'elle
 *  est devenue.
 *
 *  C'est la pièce qui manquait au traceur du 21 octobre. Il voyait le clic, et plus rien après :
 *  on ne pouvait pas distinguer « le gestionnaire n'a pas été appelé » de « il a été appelé et
 *  l'hôte a refusé ». Deux causes, deux remèdes opposés, et aucune ligne pour les séparer.
 *
 *  Les arguments ne sont **jamais** écrits : ils portent des chemins de l'ordinateur et le
 *  contenu des bibliothèques. On écrit leurs noms, et c'est assez pour savoir ce qui est parti. */
/** Les commandes que l'écran rappelle toutes les deux secondes **par dessein**.
 *
 *  Elles ne se taisent qu'en réussissant : un échec s'écrit toujours. Sans ce filtre, une trace
 *  de trente secondes compte des dizaines de lignes de veille et la ligne qu'on y cherche —
 *  celle du geste — y disparaît.
 *
 *  **Deux de plus y figuraient, et c'était une faute.** `apercu_de_bibliotheque` et
 *  `classements_de_bibliotheque` lisent la bibliothèque entière : les taire parce qu'ils se
 *  répétaient revenait à cacher le symptôme. Ils se répétaient parce que leur effet dépendait de
 *  la file, relue toutes les deux secondes — soixante-dix mégaoctets relus en boucle. On ne tait
 *  pas ce qui n'aurait pas dû se répéter ; on l'empêche de se répéter, et on le laisse se voir. */
const VEILLE: ReadonlySet<string> = new Set(["travaux", "faire_tourner"]);

async function invoke<T>(nom: string, arguments_?: Record<string, unknown>): Promise<T> {
  const bavard = !VEILLE.has(nom);
  const clefs = arguments_ === undefined ? "" : ` (${Object.keys(arguments_).join(", ")})`;
  if (bavard) journaliser(`→ hôte · ${nom}${clefs}`);
  try {
    const rendu = await invoquerSansTrace<T>(nom, arguments_);
    if (bavard) journaliser(`← hôte · ${nom} · répondu`);
    return rendu;
  } catch (souci) {
    journaliser(`← hôte · ${nom} ÉCHEC : ${souci instanceof Error ? souci.message : String(souci)}`);
    throw souci;
  }
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

function lireEtatApplicationEmbarquee(brut: unknown): EtatApplicationEmbarquee {
  if (typeof brut !== "object" || brut === null) throw new Error("État de l'application embarquée invalide.");
  const objet = brut as Record<string, unknown>;
  const statuts = ["absente", "non_referencee", "a_jour", "mise_a_jour_disponible", "source_plus_ancienne"] as const;
  if (
    !statuts.includes(objet["statut"] as (typeof statuts)[number]) ||
    typeof objet["versionCourante"] !== "string" ||
    !(objet["versionEmbarquee"] === null || typeof objet["versionEmbarquee"] === "string") ||
    typeof objet["message"] !== "string" ||
    typeof objet["actionDisponible"] !== "boolean"
  )
    throw new Error("État de l'application embarquée incomplet.");
  return objet as EtatApplicationEmbarquee;
}

export async function etatApplicationEmbarquee(racine: string): Promise<EtatApplicationEmbarquee> {
  return lireEtatApplicationEmbarquee(await invoke("etat_application_embarquee", { racine }));
}

export async function mettreAJourApplicationEmbarquee(racine: string): Promise<EtatApplicationEmbarquee> {
  return lireEtatApplicationEmbarquee(await invoke("mettre_a_jour_application_embarquee", { racine }));
}

/** Ouvre le sélecteur de dossier du système, et rend le chemin choisi — ou rien si l'on renonce. */
export async function choisirDossier(titre: string): Promise<string | undefined> {
  // Tracée à part : le sélecteur de dossier ne passe pas par une commande de l'hôte mais par le
  // greffon de dialogue, dont les droits se déclarent dans la configuration du paquet. Un
  // greffon sans droit échoue **silencieusement du point de vue de l'écran** — le bouton paraît
  // ne rien faire. Ces trois lignes disent lequel des trois cas on a : jamais appelé, appelé et
  // refusé, appelé et renoncé.
  journaliser("→ dialogue · choisir un dossier");
  try {
    const choisi = await open({ directory: true, multiple: false, title: titre });
    journaliser(`← dialogue · ${typeof choisi === "string" ? "un dossier choisi" : "renoncé"}`);
    return typeof choisi === "string" ? choisi : undefined;
  } catch (souci) {
    journaliser(`← dialogue ÉCHEC : ${souci instanceof Error ? souci.message : String(souci)}`);
    throw souci;
  }
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
/** Met une bibliothèque à la corbeille, et l'oublie. Rend l'endroit où elle a atterri.
 *
 *  À la corbeille, jamais en effacement direct : se tromper de bouton ne doit pas coûter une
 *  collection, et le dossier se ressort d'un glisser. L'hôte refuse d'ailleurs de jeter un
 *  dossier qui ne porte pas de bibliothèque. */
export async function supprimerBibliotheque(racine: string): Promise<string> {
  return invoke<string>("supprimer_bibliotheque", { racine });
}

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

export async function analyserDepot(chemins: readonly string[]): Promise<AnalyseDepot> {
  return AnalyseDepot.parse(await invoke("analyser_depot", { chemins: [...chemins] }));
}

export async function creerArchive(
  chemins: readonly string[],
  principal: string,
  destination: string,
  nom: string,
): Promise<ArchivePreparee> {
  return ArchivePreparee.parse(await invoke("creer_archive", { chemins: [...chemins], principal, destination, nom }));
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
  empreinte: string,
  nom: string,
  depuis: number,
  combien: number,
): Promise<readonly { rang: number; image: string }[]> {
  // L'hôte rend les images elles-mêmes, et non des chemins : ouvrir l'accès au disque depuis la
  // page pour montrer huit vignettes serait payer très cher une commodité.
  const rendu = await invoke<{ pages?: { rang: number; image: string }[] }>("apercu_de_pages", {
    racine,
    empreinte,
    nom,
    depuis,
    combien,
  });
  return (rendu.pages ?? []).map((page) => ({ rang: page.rang, image: page.image }));
}

/** Essaie une manière de lire sur quelques pages, sans rien enregistrer (REC-07). */
export async function essayerManiere(
  racine: string,
  empreinte: string,
  nom: string,
  recette: unknown,
  depuis: number,
  pages: number,
): Promise<VueBibliotheque> {
  const rendu = await invoke<{ vue: unknown }>("essayer_maniere", {
    racine,
    empreinte,
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

export async function lireDecisions(racine: string, empreinte: string): Promise<ReadonlyMap<string, DecisionVerification>> {
  const brut = await invoke<Record<string, unknown>>("lire_decisions", { racine, empreinte });
  const decisions = new Map<string, DecisionVerification>();
  for (const [cas, decision] of Object.entries(brut)) {
    if (decision === "confirme" || decision === "corrige" || decision === "ignore" || decision === "vu") {
      decisions.set(cas, decision);
    }
  }
  return decisions;
}

export async function enregistrerDecision(
  racine: string,
  empreinte: string,
  cas: string,
  decision: DecisionVerification,
): Promise<void> {
  return invoke<void>("enregistrer_decision", { racine, empreinte, cas, decision });
}

export async function annulerDecision(racine: string, empreinte: string, cas: string): Promise<void> {
  return invoke<void>("annuler_decision", { racine, empreinte, cas });
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

export async function rechercherBibliotheque(racine: string, requete: string, combien = 50) {
  return CorrespondancesBibliotheque.parse(await invoke("rechercher_bibliotheque", { racine, requete, combien }));
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

/** Corrections visuelles choisies dans le Lecteur. Le contrat est relu à la frontière : un
 * fichier local abîmé ne doit jamais injecter un angle arbitraire dans la page. */
export async function rotationsManuelles(racine: string, empreinte: string): Promise<ReadonlyMap<number, Rotation>> {
  const brut = await invoke<Record<string, unknown>>("rotations_manuelles", { racine, empreinte });
  return new Map(
    Object.entries(brut).map(([page, rotation]) => [Number(page), Rotation.parse(rotation)]),
  );
}

export async function tournerPage(racine: string, empreinte: string, page: number, rotation: Rotation): Promise<void> {
  await invoke("tourner_page", { racine, empreinte, page, rotation: Rotation.parse(rotation) });
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

/** Relit une seule image avec le moteur embarqué. Rien n'est écrit : c'est une correction de
 * lecture dans le Lecteur, limitée aux pages dont le passage conservé vient déjà de l'OCR. */
export async function relireTexteDePage(
  racine: string,
  version: string,
  fichier: string,
  langue: string,
): Promise<string | undefined> {
  return (await invoke<string | null>("relire_texte_page", { racine, version, fichier, langue })) ?? undefined;
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
  rechercherBibliotheque,
  versionActive,
  imageDePage,
  classementsDeBibliotheque,
  classerDocument,
};

/** Les groupes de documents qui disent la même chose (HER-08).
 *
 *  Elle **ne retire rien**. C'est une lecture, et son rendu ne porte aucun ordre : à qui la
 *  bibliothèque appartient de trancher, document par document, par `retirerDocument`. */
export async function doublonsDeBibliotheque(racine: string): Promise<Doublons> {
  return Doublons.parse(await invoke("doublons_de_bibliotheque", { racine }));
}

/** Retire un document de la bibliothèque, et dit ce que le retrait a emporté (HER-07).
 *
 *  Sa source part à la corbeille du système : se tromper de document ne doit pas coûter un livre. */
export async function retirerDocument(racine: string, empreinte: string): Promise<RetraitDeDocument> {
  return RetraitDeDocument.parse(await invoke("retirer_document", { racine, empreinte }));
}

export const administrationDuBureau: PortAdministration = {
  creerBibliotheque,
  lireBibliotheque,
  ecrireBibliotheque,
  retenirBibliotheque,
  oublierBibliotheque,
  supprimerBibliotheque,
  bibliothequesRetenues,
  etatApplicationEmbarquee,
  mettreAJourApplicationEmbarquee,
  choisirDossier,
  choisirFichiers,
  analyserDepot,
  creerArchive,
  deposer,
  faireTourner,
  travauxDe,
  agirSurTravail,
  apercuDePages,
  essayerManiere,
  enregistrerManiere,
  lireManiere,
  relireTexteDePage,
  rotationsManuelles,
  tournerPage,
  lireDecisions,
  enregistrerDecision,
  annulerDecision,
  doublonsDeBibliotheque,
  retirerDocument,
};
