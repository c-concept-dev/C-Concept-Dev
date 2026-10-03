import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RAPPORTS_ESTIMES, RapportInspecteur, type PageInspectee } from "@lienotheque/contrats";
import { empreinteDe, objetsPdf, octetsImage, pagesPdf, type ImagePdf } from "@lienotheque/formats";

/** Inspecteur (OUT-01). Il dit ce qu'un document est, avant tout traitement : natif ou numérisé,
 *  à quelle résolution, en quelles couleurs, ce qu'il pèse, ce qui manque et ce qui se répète.
 *  Il ne modifie rien. */

/** Un PDF déclare sa page en points typographiques : 72 points font un pouce. */
const POINTS_PAR_POUCE = 72;

export type Couleur = "noir_et_blanc" | "gris" | "couleur";

/** La couleur se lit dans l'espace déclaré et le nombre de bits, pas dans les pixels. */
export function couleurDe(image: ImagePdf): Couleur {
  if (image.bits === 1) return "noir_et_blanc";
  if (/Gray/i.test(image.espaceCouleur)) return "gris";
  return "couleur";
}

const mediaBox = (dictionnaire: string): { largeur: number; hauteur: number } | undefined => {
  const trouve = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/.exec(dictionnaire);
  if (trouve === null) return undefined;
  return { largeur: Number(trouve[3]) - Number(trouve[1]), hauteur: Number(trouve[4]) - Number(trouve[2]) };
};

export type OptionsInspection = {
  /** Pages imprimées que le document devrait contenir, pour repérer les absentes (OUT-01). */
  readonly pagesAttendues?: readonly string[];
  readonly pagesPresentes?: readonly string[];
};

export async function inspecterPdf(chemin: string, options: OptionsInspection = {}): Promise<RapportInspecteur> {
  const donnees = await readFile(chemin);
  const empreinte = await empreinteDe(chemin);
  const objets = objetsPdf(donnees);
  const pages = pagesPdf(objets);

  const empreintesImages = new Map<string, number>();
  const inspectees: PageInspectee[] = pages.map((page) => {
    const dominante = [...page.images].sort((a, b) => b.largeur * b.hauteur - a.largeur * a.hauteur)[0];
    const octetsPage = page.images.reduce((somme, image) => somme + image.octets, 0);

    for (const image of page.images) {
      const octets = octetsImage(objets, image.numero);
      if (octets === undefined) continue;
      const cle = createHash("sha256").update(octets.octets).digest("hex");
      empreintesImages.set(cle, (empreintesImages.get(cle) ?? 0) + 1);
    }

    const boite = mediaBox(objets.get(page.numero)?.dictionnaire ?? "");
    const resolution =
      dominante !== undefined && boite !== undefined && boite.largeur > 0
        ? Math.round((dominante.largeur / (boite.largeur / POINTS_PAR_POUCE)) * 10) / 10
        : undefined;

    const nature = page.couchTexte && dominante === undefined ? "native" : page.couchTexte ? "mixte" : dominante === undefined ? "vide" : "numerisee";

    return {
      index: page.index + 1,
      nature,
      ...(dominante === undefined ? {} : { largeurPx: dominante.largeur, hauteurPx: dominante.hauteur }),
      ...(resolution === undefined ? {} : { resolutionPpp: resolution }),
      ...(dominante === undefined ? {} : { couleur: couleurDe(dominante) }),
      octets: octetsPage,
    };
  });

  const natives = inspectees.filter((p) => p.nature === "native").length;
  const numerisees = inspectees.filter((p) => p.nature === "numerisee").length;
  const nature = natives > 0 && numerisees > 0 ? "mixte" : numerisees > 0 ? "numerise" : "natif";

  const attendues = new Set(options.pagesAttendues ?? []);
  for (const presente of options.pagesPresentes ?? []) attendues.delete(presente);

  return RapportInspecteur.parse({
    empreinte,
    pages: inspectees,
    nature,
    octets: donnees.length,
    pagesManquantes: [...attendues],
    doublons: [...empreintesImages.entries()].filter(([, nombre]) => nombre > 1).map(([cle]) => cle),
    octetsOptimisesEstimes: estimerOptimise(inspectees),
  });
}

/** Estimation du poids après optimisation (OPT-01, OPT-06). Les rapports viennent des contrats,
 *  relevés sur l'échantillon F7 : une seule table, pour que l'Inspecteur et l'Optimiseur
 *  n'annoncent jamais deux chiffres différents. Ce n'est pas une promesse — l'Optimiseur mesure. */
export function estimerOptimise(pages: readonly PageInspectee[]): number {
  return Math.round(
    pages.reduce((somme, page) => somme + page.octets * (page.couleur === undefined ? 1 : RAPPORTS_ESTIMES[page.couleur]), 0),
  );
}
