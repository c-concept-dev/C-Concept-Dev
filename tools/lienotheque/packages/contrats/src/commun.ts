import { z } from "zod";

/** Identifiant global, indépendant du contenu (ID-07). UUID v7 recommandé. */
export const Identifiant = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "UUID attendu");
export type Identifiant = z.infer<typeof Identifiant>;

/** Empreinte SHA-256 du contenu d'un fichier, en hexadécimal minuscule (ID-01). */
export const Empreinte = z.string().regex(/^[0-9a-f]{64}$/, "Empreinte SHA-256 attendue (64 caractères hexadécimaux)");
export type Empreinte = z.infer<typeof Empreinte>;

export const Horodatage = z.iso.datetime({ offset: true });
export const Confiance = z.number().min(0).max(1);
export const NumeroVersion = z.number().int().min(1);

/** Référence à un outil et à sa version (ID-06). */
export const RefOutil = z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict();

/** Référence à une recette et à sa version (ID-06, REC-03). */
export const RefRecette = z.object({ id: z.string().min(1), version: NumeroVersion }).strict();

/** Une zone d'une page, en part de ses dimensions : 0 à 1 en largeur comme en hauteur.
 *
 *  Relative, et pas en pixels : l'image lue, l'image affichée et l'image agrandie n'ont pas les
 *  mêmes dimensions, et seule la part est comparable entre les trois. C'est ce qui permet de
 *  lire une position sur une page à pleine résolution et de la montrer sur une vignette. */
export const ZoneRelative = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    l: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .strict();
export type ZoneRelative = z.infer<typeof ZoneRelative>;
