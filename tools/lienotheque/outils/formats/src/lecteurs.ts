import { CapacitesLecteur, type DescriptionLecteur } from "@lienotheque/contrats";

/** Registre des lecteurs de format (FMT-02).
 *
 *  Chaque lecteur déclare ce qu'il sait faire ; le noyau ne devine rien et n'en connaît aucun
 *  en particulier. En ajouter un ne touche à rien d'autre : on inscrit sa description. */

const capacites = (partielles: Partial<CapacitesLecteur>): CapacitesLecteur => CapacitesLecteur.parse(partielles);

export type Registre = {
  readonly inscrire: (description: DescriptionLecteur) => void;
  readonly lecteurs: () => readonly DescriptionLecteur[];
  /** Lecteur capable d'ouvrir ce type de média, s'il en existe un. */
  readonly pour: (typeMime: string) => DescriptionLecteur | undefined;
};

/** Types de média qu'un lecteur prend en charge, en données. */
const MIMES = new WeakMap<DescriptionLecteur, readonly string[]>();

export function registreVide(): Registre {
  const inscrits: DescriptionLecteur[] = [];
  return {
    inscrire(description) {
      const rang = inscrits.findIndex((d) => d.nom === description.nom);
      if (rang >= 0) inscrits[rang] = description;
      else inscrits.push(description);
    },
    lecteurs: () => [...inscrits],
    pour: (typeMime) => inscrits.find((d) => (MIMES.get(d) ?? []).includes(typeMime)),
  };
}

export function decrireLecteur(
  description: Omit<DescriptionLecteur, "capacites"> & { capacites: Partial<CapacitesLecteur>; typesMime: readonly string[] },
): DescriptionLecteur {
  const { typesMime, capacites: brutes, ...reste } = description;
  const decrit: DescriptionLecteur = { ...reste, capacites: capacites(brutes) };
  MIMES.set(decrit, [...typesMime]);
  return decrit;
}

export const typesMimeDe = (description: DescriptionLecteur): readonly string[] => MIMES.get(description) ?? [];
