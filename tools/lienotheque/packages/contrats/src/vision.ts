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

/** Ce qu'on accepte de lire. Une liste close : cette route lit un nombre dans un petit rectangle,
 *  elle n'est pas un service de reconnaissance générale. */
export const AlphabetVision = z.enum(["chiffres"]);
export type AlphabetVision = z.infer<typeof AlphabetVision>;

/** Ce qu'on demande d'un rectangle. Deux questions, et elles n'attendent pas la même réponse.
 *
 *  `repere` : le rectangle montre-t-il un repère, et quel nombre porte-t-il ? La première moitié
 *  de la question est celle qui manquait — une lecture seule ne dit pas si ce qu'elle a lu **est**
 *  un repère, et sur le corpus de référence la détection tire trois fois trop souvent.
 *
 *  `numero` : quel nombre le rectangle porte-t-il, sans qu'on demande ce qu'il est. C'est la
 *  question qu'on pose d'une marge où la lecture locale n'a rien rendu. */
export const QuestionVision = z.enum(["repere", "numero"]);
export type QuestionVision = z.infer<typeof QuestionVision>;

/** Le verdict sur la présence d'un repère.
 *
 *  Trois réponses, et `incertain` en est une pleine : un modèle qui hésite doit pouvoir le dire
 *  plutôt que de trancher, puisque c'est précisément l'hésitation qu'on est venu chercher. */
export const PresenceRepere = z.enum(["present", "absent", "incertain"]);
export type PresenceRepere = z.infer<typeof PresenceRepere>;

/** Taille au-delà de laquelle un recadrage n'est plus un recadrage.
 *
 *  Mesuré sur F4 : le pavé d'un repère tient dans 200 × 150 px sur des clichés de 1786 × 2410,
 *  marge claire comprise. Le plafond laisse largement la place à un document plus grand, et
 *  refuse une page entière — ce qui part d'ici est un repère, et c'est le contrat qui le
 *  garantit, pas la discipline de l'appelant. */
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
    /** Ce qu'on demande de ce rectangle. Par défaut la question d'origine : lire un nombre. */
    cherche: QuestionVision.default("numero"),
    /** Ce que la recette autorise ici — de 1 au nombre de pistes du support, un fait tiré du
     *  média et non de son nom (REC-05). Le modèle ne décide pas de l'intervalle : il lit, et ce
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
      // Une demande ne pose qu'une seule question. Deux questions dans le même appel voudraient un
      // formulaire où le verdict est tantôt attendu tantôt interdit, et c'est l'ambiguïté qu'on
      // évite : chaque appel a son formulaire, et deux appels ne coûtent qu'un préfixe de plus.
      if (zone.cherche !== demande.zones[0]!.cherche)
        ctx.addIssue({ code: "custom", path: ["zones", rang, "cherche"], message: "Un appel ne pose qu'une seule question" });
    }
  });
export type DemandeVision = z.infer<typeof DemandeVision>;

/** Ce qu'une zone a donné.
 *
 *  `numero: null` est une réponse pleine et entière : un pavé illisible est illisible, et le dire
 *  vaut mieux que le deviner. Ce n'est pas un échec, et cela ne se repaye pas. */
export const ZoneLue = z
  .object({
    empreinte: EmpreinteRecadrage,
    numero: z.number().int().positive().nullable(),
    confiance: Confiance,
    /** Le verdict sur la présence d'un repère, quand c'est ce qu'on a demandé. Absent sinon : on
     *  ne demande pas à une marge si elle est un repère. */
    repere: PresenceRepere.optional(),
  })
  .strict()
  .superRefine((zone, ctx) => {
    // Rien de lu ne se dit pas avec une confiance — **quand il n'y a rien d'autre à dire**.
    //
    // Cette règle était juste tant qu'une réponse ne portait qu'un nombre. Le verdict l'a rendue
    // fausse : « le repère est là, ses chiffres sont illisibles, et j'en suis sûr » est une réponse
    // cohérente, et la confiance y porte sur le verdict. Le modèle l'a rendue telle quelle, et
    // c'est le contrat qui avait tort — relâché sur preuve, pas par commodité.
    if (zone.numero === null && zone.repere === undefined && zone.confiance !== 0)
      ctx.addIssue({ code: "custom", path: ["confiance"], message: "Rien de lu ne se dit pas avec une confiance" });
    // Un nombre venu d'un repère qu'on déclare absent n'a pas de provenance : la réponse se
    // contredit, et on la refuse plutôt que de choisir laquelle de ses deux moitiés croire.
    if (zone.repere === "absent" && zone.numero !== null)
      ctx.addIssue({ code: "custom", path: ["numero"], message: "Un repère absent ne porte aucun nombre" });
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
  const demandees = new Map(demande.zones.map((zone) => [zone.empreinte, zone]));
  const rendues = new Map(reponse.zones.map((zone) => [zone.empreinte, zone]));
  const ecarts: string[] = [];
  for (const empreinte of demandees.keys()) if (!rendues.has(empreinte)) ecarts.push(`zone sans réponse : ${empreinte}`);
  for (const empreinte of rendues.keys()) if (!demandees.has(empreinte)) ecarts.push(`réponse sans zone : ${empreinte}`);

  // Et chaque question reçoit la réponse qu'elle attendait. Le contrat seul ne peut pas le dire :
  // il ne voit qu'un côté à la fois, et c'est tout l'objet de ce recoupement.
  for (const [empreinte, zone] of demandees) {
    const lue = rendues.get(empreinte);
    if (lue === undefined) continue;
    if (zone.cherche === "repere" && lue.repere === undefined) ecarts.push(`verdict de repère manquant : ${empreinte}`);
    if (zone.cherche === "numero" && lue.repere !== undefined) ecarts.push(`verdict de repère non demandé : ${empreinte}`);
  }
  return ecarts;
}

/** Ce qu'une estimation rend : les jetons qu'une demande coûterait, sans la payer.
 *
 *  Le pendant de REC-04 pour la relecture ciblée : on annonce avant de dépenser. Et on compte sur
 *  de vrais recadrages, jamais sur une règle de trois — c'est ce qui permet d'écrire un plafond
 *  dans une recette sans l'avoir supposé. */
export const EstimationVision = z
  .object({
    zones: z.number().int().nonnegative(),
    jetonsEntree: z.number().int().nonnegative(),
  })
  .strict();
export type EstimationVision = z.infer<typeof EstimationVision>;

/** Une réponse gardée, par empreinte de recadrage (REC-02).
 *
 *  Un appel à un modèle n'est pas déterministe ; l'interpréteur, lui, doit l'être. Ce qui a été lu
 *  est donc gardé sous l'empreinte de l'image qui l'a produit, et un rejeu lit le cache sans
 *  rappeler personne — le banc d'essai tourne sans réseau.
 *
 *  L'outil voyage avec la réponse : un lien doit pouvoir dire de quelle version vient son numéro,
 *  et une entrée écrite par une version plus ancienne reste lisible sans mentir sur sa provenance. */
export const EntreeCacheVision = z
  .object({
    zone: ZoneLue,
    outil: z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict(),
  })
  .strict();
export type EntreeCacheVision = z.infer<typeof EntreeCacheVision>;
