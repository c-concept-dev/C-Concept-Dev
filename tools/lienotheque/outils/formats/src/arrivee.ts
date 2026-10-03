import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Arrivee, type IdentificationFormat } from "@lienotheque/contrats";
import { empreinteDe, identifier, type OptionsIdentification } from "./identifier.js";
import { typesMimeDe, type Registre } from "./lecteurs.js";

/** Arrivée d'un fichier dans une bibliothèque (FMT-04, FMT-08).
 *
 *  Rien n'est refusé : ce qu'aucun lecteur ne sait ouvrir devient une pièce jointe, gardée avec
 *  son empreinte. L'original est copié tel quel et son empreinte relue : si elle a bougé, c'est
 *  une erreur, jamais un silence. */

export type OptionsArrivee = OptionsIdentification & { readonly dossierSources: string };

export async function accueillir(chemin: string, registre: Registre, options: OptionsArrivee): Promise<Arrivee> {
  const identification: IdentificationFormat = await identifier(chemin, options);

  await mkdir(options.dossierSources, { recursive: true });
  const destination = join(options.dossierSources, identification.empreinte);
  await copyFile(chemin, destination);
  const relue = await empreinteDe(destination);

  const lecteur = registre.lecteurs().find((d) => typesMimeDe(d).includes(identification.typeMime));
  const complet = lecteur !== undefined && lecteur.capacites.texte && lecteur.capacites.pages;

  return Arrivee.parse({
    identification,
    priseEnCharge: lecteur === undefined ? "piece_jointe" : complet ? "complete" : "partielle",
    ...(lecteur === undefined ? {} : { lecteur: lecteur.nom }),
    originalIntact: relue === identification.empreinte,
  });
}

/** Tableau des formats rencontrés et de ce qu'on sait en faire (FMT-10). */
export function tableauDesFormats(arrivees: readonly Arrivee[]): readonly { typeMime: string; nom: string; priseEnCharge: string; nombre: number }[] {
  const par = new Map<string, { typeMime: string; nom: string; priseEnCharge: string; nombre: number }>();
  for (const arrivee of arrivees) {
    const cle = arrivee.identification.typeMime;
    const vu = par.get(cle);
    par.set(cle, {
      typeMime: cle,
      nom: arrivee.identification.nom,
      priseEnCharge: arrivee.priseEnCharge,
      nombre: (vu?.nombre ?? 0) + 1,
    });
  }
  return [...par.values()].sort((a, b) => b.nombre - a.nombre);
}
