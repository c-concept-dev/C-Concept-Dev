import { z } from "zod";
import { Confiance } from "./commun.js";

/** Ce qui traverse vers la relecture ciblée, et ce qui en revient (OUT-08, ANC-02).
 *
 *  Deux frontières, un seul contrat : l'application valide ce qu'elle envoie, le Worker valide ce
 *  qu'il reçoit, et tous deux valident la réponse du modèle avant qu'elle n'entre où que ce soit.
 *  Une réponse non conforme est refusée — pas rattrapée au jugé.
 *
 *  Rien ici ne connaît de domaine : une zone est un rectangle d'image et un intervalle de
 *  numéros. Ce que ce numéro désigne dans une bibliothèque donnée ne regarde pas cette route. */

/** Empreinte d'un recadrage : elle identifie l'image envoyée, et sert de clef de cache.
 *
 *  Tronquée à 32 caractères comme les autres clefs de travail du projet : c'est assez pour
 *  qu'une collision soit hors de portée, et assez court pour tenir dans un nom de fichier. */
export const EmpreinteRecadrage = z.string().regex(/^[0-9a-f]{32}$/, "Empreinte de recadrage attendue (32 caractères hexadécimaux)");
export type EmpreinteRecadrage = z.infer<typeof EmpreinteRecadrage>;

/** Ce qu'on accepte de lire. Une liste close : cette route lit des nombres dans une marge, elle
 *  n'est pas un service de reconnaissance générale. */
export const AlphabetVision = z.enum(["chiffres"]);
export type AlphabetVision = z.infer<typeof AlphabetVision>;

/** Taille au-delà de laquelle un recadrage n'est plus un recadrage.
 *
 *  Mesuré sur F4 : un numéro de marge tient dans 357 × 230 px sur des clichés de 1786 × 2410.
 *  Le plafond laisse largement la place à un document plus grand, et refuse une page entière —
 *  ce qui part d'ici est un bout de marge, et le contrat le garantit plutôt que la discipline. */
export const COTE_MAX_RECADRAGE = 1024;
/** Poids maximal d'un recadrage encodé, en octets. */
export const OCTETS_MAX_RECADRAGE = 512 * 1024;

export const ZoneAlire = z
  .object({
    empreinte: EmpreinteRecadrage,
    /** Le recadrage lui-même, encodé en base64, à la résolution de l'original. */
    image: z.string().min(1),
    typeMime: z.enum(["image/png", "image/webp"]),
    largeur: z.number().int().positive().max(COTE_MAX_RECADRAGE),
    hauteur: z.number().int().positive().max(COTE_MAX_RECADRAGE),
    /** Ce que la séquence autorise ici. Le modèle ne décide pas de l'intervalle : il lit, et ce
     *  qui tombe hors de l'intervalle sera refusé par l'interprète, pas discuté. */
    attendu: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).strict().optional(),
  })
  .strict()
  .superRefine((zone, ctx) => {
    if (zone.attendu !== undefined && zone.attendu.max < zone.attendu.min)
      ctx.addIssue({ code: "custom", path: ["attendu", "max"], message: "Un intervalle finit après son début" });
  });
export type ZoneAlire = z.infer<typeof ZoneAlire>;

/** Nombre de zones qu'un seul appel transporte. Au-delà, on découpe : une requête qui porte tout
 *  un livre ne se rejoue pas, ne se reprend pas, et échoue d'un bloc. */
export const ZONES_MAX_PAR_APPEL = 20;

export const DemandeVision = z
  .object({
    alphabet: AlphabetVision,
    zones: z.array(ZoneAlire).min(1).max(ZONES_MAX_PAR_APPEL),
  })
  .strict()
  .superRefine((demande, ctx) => {
    const vues = new Set<string>();
    for (const [rang, zone] of demande.zones.entries()) {
      if (vues.has(zone.empreinte))
        ctx.addIssue({ code: "custom", path: ["zones", rang, "empreinte"], message: "Deux fois la même zone dans un appel" });
      vues.add(zone.empreinte);
    }
  });
export type DemandeVision = z.infer<typeof DemandeVision>;

/** Ce qu'une zone a donné.
 *
 *  `numero: null` est une réponse pleine et entière : une marge vide est une marge vide, et c'est
 *  une information utile. Ce n'est pas un échec, et cela ne se repaye pas. */
export const ZoneLue = z
  .object({
    empreinte: EmpreinteRecadrage,
    numero: z.number().int().positive().nullable(),
    confiance: Confiance,
  })
  .strict()
  .superRefine((zone, ctx) => {
    if (zone.numero === null && zone.confiance !== 0)
      ctx.addIssue({ code: "custom", path: ["confiance"], message: "Rien de lu ne se dit pas avec une confiance" });
  });
export type ZoneLue = z.infer<typeof ZoneLue>;

export const ReponseVision = z
  .object({
    zones: z.array(ZoneLue),
    /** Jetons réellement consommés, rendus par le modèle. C'est ce qui alimente le budget :
     *  on compte ce qui a été dépensé, jamais ce qu'on avait prévu de dépenser. */
    jetons: z.object({ entree: z.number().int().nonnegative(), sortie: z.number().int().nonnegative() }).strict(),
    /** Version de l'outil qui a lu : elle voyage jusque dans le lien (ANC-02). */
    outil: z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict(),
  })
  .strict();
export type ReponseVision = z.infer<typeof ReponseVision>;

/** Une réponse répond à sa demande, zone par zone — ni plus, ni moins, ni autre chose.
 *
 *  Le contrat seul ne peut pas le dire : il ne voit qu'un des deux côtés à la fois. C'est
 *  l'appelant qui recoupe, et il doit le faire avant d'écrire quoi que ce soit. */
export function reponseRepondA(demande: DemandeVision, reponse: ReponseVision): readonly string[] {
  const demandees = new Set(demande.zones.map((zone) => zone.empreinte));
  const rendues = new Set(reponse.zones.map((zone) => zone.empreinte));
  const ecarts: string[] = [];
  for (const empreinte of demandees) if (!rendues.has(empreinte)) ecarts.push(`zone sans réponse : ${empreinte}`);
  for (const empreinte of rendues) if (!demandees.has(empreinte)) ecarts.push(`réponse sans zone : ${empreinte}`);
  return ecarts;
}
