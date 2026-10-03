import { z } from "zod";
import { Confiance, Empreinte, RefOutil, RefRecette } from "./commun.js";
import { Selecteur } from "./ancre.js";
import { NatureLien, Preuve } from "./lien.js";

/** Sortie d'un outil : propositions, jamais d'écriture directe en base (contrat commun des outils). */
export const ResultatOutil = z
  .object({
    outil: RefOutil,
    source: Empreinte,
    recette: RefRecette.optional(),
    ancres: z.array(z.object({ cle: z.string().min(1), selecteur: Selecteur, valeur: z.string().optional(), confiance: Confiance }).strict()),
    liens: z.array(z.object({ de: z.string(), vers: z.string(), nature: NatureLien, preuve: Preuve, confiance: Confiance }).strict()),
    textes: z.array(z.object({ ancre: z.string(), contenu: z.string(), langue: z.string().min(2) }).strict()),
    avertissements: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((r, ctx) => {
    const cles = new Set(r.ancres.map((a) => a.cle));
    r.liens.forEach((l, i) => {
      if (!cles.has(l.de)) ctx.addIssue({ code: "custom", path: ["liens", i, "de"], message: `Ancre inconnue : ${l.de}` });
    });
  });
export type ResultatOutil = z.infer<typeof ResultatOutil>;
