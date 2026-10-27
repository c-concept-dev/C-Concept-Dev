import { z } from "zod";
import { Empreinte } from "./commun.js";
import { TypeDeContenu } from "./bibliotheque.js";

export const RoleFichierPrepare = z.enum(["principal", "supplement", "accompagnement"]);
export type RoleFichierPrepare = z.infer<typeof RoleFichierPrepare>;

export const FichierPrepare = z
  .object({
    chemin: z.string().min(1),
    nom: z.string().min(1),
    taille: z.number().int().nonnegative(),
    contenu: TypeDeContenu,
    empreinte: Empreinte,
    role: RoleFichierPrepare,
  })
  .strict();
export type FichierPrepare = z.infer<typeof FichierPrepare>;

export const DoublonPrepare = z
  .object({
    empreinte: Empreinte,
    chemins: z.array(z.string().min(1)).min(2),
  })
  .strict();
export type DoublonPrepare = z.infer<typeof DoublonPrepare>;

export const AnalyseDepot = z
  .object({
    fichiers: z.array(FichierPrepare),
    doublons: z.array(DoublonPrepare),
    avertissements: z.array(z.string().min(1)),
  })
  .strict();
export type AnalyseDepot = z.infer<typeof AnalyseDepot>;

export const ArchivePreparee = z
  .object({
    chemin: z.string().min(1),
    fichiers: z.number().int().positive(),
    taille: z.number().int().nonnegative(),
    empreinte: Empreinte,
  })
  .strict();
export type ArchivePreparee = z.infer<typeof ArchivePreparee>;
