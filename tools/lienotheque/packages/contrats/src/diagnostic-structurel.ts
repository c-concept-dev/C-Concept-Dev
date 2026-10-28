import { z } from "zod";
import { Confiance } from "./commun.js";

/** Diagnostic ponctuel d'un gabarit de document.
 *
 * Vision propose des hypothèses depuis un petit échantillon qui peut être élargi de façon
 * bornée. Elle ne produit jamais une recette exécutable : les coordonnées définitives viennent
 * du calibrage local puis de pages témoins que le modèle n'a pas vues. */

export const MAX_PAGES_DIAGNOSTIC_STRUCTUREL = 8;

export const EmpreinteDocumentStructurel = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Empreinte de document attendue (SHA-256 hexadécimal)");

export const ZoneNormalisee = z
  .object({
    x: z.number().min(0).lt(1),
    y: z.number().min(0).lt(1),
    l: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .strict()
  .superRefine((zone, contexte) => {
    if (zone.x + zone.l > 1) contexte.addIssue({ code: "custom", path: ["l"], message: "La zone dépasse la largeur de la page" });
    if (zone.y + zone.h > 1) contexte.addIssue({ code: "custom", path: ["h"], message: "La zone dépasse la hauteur de la page" });
    if (zone.l * zone.h > 0.6)
      contexte.addIssue({ code: "custom", path: [], message: "Une zone structurelle ne peut pas couvrir presque toute la page" });
  });
export type ZoneNormalisee = z.infer<typeof ZoneNormalisee>;

export const PageDiagnosticStructurel = z
  .object({
    numero: z.number().int().nonnegative(),
    empreinte: EmpreinteDocumentStructurel,
    image: z.string().min(1).max(16 * 1024 * 1024),
    typeMime: z.enum(["image/png", "image/webp"]),
    largeur: z.number().int().positive().max(8192),
    hauteur: z.number().int().positive().max(8192),
  })
  .strict();
export type PageDiagnosticStructurel = z.infer<typeof PageDiagnosticStructurel>;

export const DemandeDiagnosticStructurel = z
  .object({
    document: EmpreinteDocumentStructurel,
    pages: z.array(PageDiagnosticStructurel).min(2).max(MAX_PAGES_DIAGNOSTIC_STRUCTUREL),
  })
  .strict()
  .superRefine((demande, contexte) => {
    const numeros = new Set<number>();
    const empreintes = new Set<string>();
    for (const [rang, page] of demande.pages.entries()) {
      if (numeros.has(page.numero))
        contexte.addIssue({ code: "custom", path: ["pages", rang, "numero"], message: "La même page est présente deux fois" });
      if (empreintes.has(page.empreinte))
        contexte.addIssue({ code: "custom", path: ["pages", rang, "empreinte"], message: "La même image est présente deux fois" });
      numeros.add(page.numero);
      empreintes.add(page.empreinte);
    }
  });
export type DemandeDiagnosticStructurel = z.infer<typeof DemandeDiagnosticStructurel>;

const ObservationStructurelle = z
  .object({
    page: z.number().int().nonnegative(),
    zone: ZoneNormalisee,
    /** Valeur réellement visible dans cet exemple, si elle est lisible. Elle sert à déduire un
     * format et jamais à inventer les exemples restés illisibles. */
    valeur: z.string().min(1).max(80).optional(),
  })
  .strict();

const LectureStructurelle = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    nature: z.enum(["page_imprimee", "element", "repere", "exclusion"]),
    /** Zone de recherche grossière proposée par Vision. Elle sera remplacée par le calibrage. */
    zone: ZoneNormalisee,
    repetition: z.enum(["fixe", "verticale"]),
    forme: z.enum(["texte", "rectangle", "losange", "cercle", "ligne", "autre"]),
    alphabet: z.enum(["chiffres", "latin", "tous"]),
    exemple: z.string().min(1).max(80).optional(),
    confiance: Confiance,
    /** Boîtes grossières d'exemples visibles. Elles donnent au calibrateur des pixels à mesurer. */
    observations: z.array(ObservationStructurelle).min(2).max(24),
  })
  .strict();

const RelationStructurelle = z
  .object({
    de: z.string().min(1),
    vers: z.string().min(1),
    position: z.enum(["dessous", "dessus", "gauche", "droite", "dans"]),
  })
  .strict();

const CHAMPS_MODELE = {
  document: EmpreinteDocumentStructurel,
  pagesObservees: z.array(z.number().int().nonnegative()).min(2).max(MAX_PAGES_DIAGNOSTIC_STRUCTUREL),
  geometrie: z.object({ orientation: z.enum(["portrait", "paysage"]), doublePage: z.boolean() }).strict(),
  lectures: z.array(LectureStructurelle).min(1).max(16),
  relations: z.array(RelationStructurelle).max(24),
  inconnues: z.array(z.string().min(1).max(240)).max(24),
} as const;

const verifierModele = (
  modele: { pagesObservees: readonly number[]; lectures: readonly z.infer<typeof LectureStructurelle>[]; relations: readonly z.infer<typeof RelationStructurelle>[] },
  contexte: z.RefinementCtx,
): void => {
  const pages = new Set(modele.pagesObservees);
  if (pages.size !== modele.pagesObservees.length)
    contexte.addIssue({ code: "custom", path: ["pagesObservees"], message: "Une page observée est citée deux fois" });

  const ids = new Set<string>();
  for (const [rang, lecture] of modele.lectures.entries()) {
    if (ids.has(lecture.id))
      contexte.addIssue({ code: "custom", path: ["lectures", rang, "id"], message: "Deux lectures portent le même identifiant" });
    ids.add(lecture.id);
    for (const [preuve, observation] of lecture.observations.entries())
      if (!pages.has(observation.page))
        contexte.addIssue({
          code: "custom",
          path: ["lectures", rang, "observations", preuve, "page"],
          message: "Une observation doit venir d'une page de l'échantillon",
        });
  }
  for (const [rang, relation] of modele.relations.entries()) {
    if (!ids.has(relation.de) || !ids.has(relation.vers))
      contexte.addIssue({ code: "custom", path: ["relations", rang], message: "Une relation cite une lecture inconnue" });
  }
};

export const ModeleStructurelPropose = z
  .object({ etat: z.literal("propose"), ...CHAMPS_MODELE })
  .strict()
  .superRefine(verifierModele);
export type ModeleStructurelPropose = z.infer<typeof ModeleStructurelPropose>;

export const ModeleStructurelValide = z
  .object({
    etat: z.literal("valide"),
    ...CHAMPS_MODELE,
    validation: z
      .object({
        pagesTemoins: z.array(z.number().int().nonnegative()).min(1).max(8),
        ecarts: z.array(z.string()).max(0),
        superpositionsApprouvees: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((modele, contexte) => {
    verifierModele(modele, contexte);
    const vues = new Set(modele.pagesObservees);
    for (const [rang, page] of modele.validation.pagesTemoins.entries())
      if (vues.has(page))
        contexte.addIssue({ code: "custom", path: ["validation", "pagesTemoins", rang], message: "Une page témoin doit rester hors échantillon" });
  });
export type ModeleStructurelValide = z.infer<typeof ModeleStructurelValide>;

export const ReponseDiagnosticStructurel = z
  .object({
    modele: ModeleStructurelPropose,
    jetons: z.object({ entree: z.number().int().nonnegative(), sortie: z.number().int().nonnegative() }).strict(),
    outil: z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict(),
  })
  .strict();
export type ReponseDiagnosticStructurel = z.infer<typeof ReponseDiagnosticStructurel>;

/** Recoupe les deux côtés de la frontière. Un modèle conforme mais rendu pour une autre image
 * reste une réponse fausse. */
export function diagnosticRepondA(demande: DemandeDiagnosticStructurel, reponse: ReponseDiagnosticStructurel): readonly string[] {
  const ecarts: string[] = [];
  if (demande.document !== reponse.modele.document) ecarts.push("le document rendu n'est pas le document demandé");
  const demandees = [...demande.pages.map((page) => page.numero)].sort((a, b) => a - b);
  const rendues = [...reponse.modele.pagesObservees].sort((a, b) => a - b);
  if (JSON.stringify(demandees) !== JSON.stringify(rendues)) ecarts.push("les pages rendues ne sont pas les pages demandées");
  return ecarts;
}

/** Repli ponctuel quand la règle locale a détecté une rupture mais n'a pas su lire quelques
 * identifiants attendus. Les cibles viennent d'un inventaire indépendant (par exemple les noms
 * structurés des médias) ; Vision doit seulement dire si elles sont réellement visibles sur les
 * pages transmises. Une absence ou un doute reste une abstention. */
export const DemandeValidationCibles = z
  .object({
    document: EmpreinteDocumentStructurel,
    pages: z.array(PageDiagnosticStructurel).min(1).max(MAX_PAGES_DIAGNOSTIC_STRUCTUREL),
    cibles: z.array(z.string().regex(/^\d+(?:[.,-]\d+)*$/).max(40)).min(1).max(32),
  })
  .strict()
  .superRefine((demande, contexte) => {
    if (new Set(demande.pages.map((page) => page.numero)).size !== demande.pages.length)
      contexte.addIssue({ code: "custom", path: ["pages"], message: "La même page est présente deux fois" });
    if (new Set(demande.cibles).size !== demande.cibles.length)
      contexte.addIssue({ code: "custom", path: ["cibles"], message: "La même cible est présente deux fois" });
  });
export type DemandeValidationCibles = z.infer<typeof DemandeValidationCibles>;

const ResultatValidationCible = z
  .object({
    cible: z.string().min(1).max(40),
    etat: z.enum(["trouve", "absent", "incertain"]),
    page: z.number().int().nonnegative().optional(),
    zone: ZoneNormalisee.optional(),
    confiance: Confiance,
  })
  .strict()
  .superRefine((resultat, contexte) => {
    const localise = resultat.page !== undefined && resultat.zone !== undefined;
    if (resultat.etat === "trouve" && !localise)
      contexte.addIssue({ code: "custom", path: [], message: "Une cible trouvée doit être localisée" });
    if (resultat.etat !== "trouve" && localise)
      contexte.addIssue({ code: "custom", path: [], message: "Une cible non trouvée ne doit pas être localisée" });
  });

export const ReponseValidationCibles = z
  .object({
    document: EmpreinteDocumentStructurel,
    resultats: z.array(ResultatValidationCible).min(1).max(32),
    jetons: z.object({ entree: z.number().int().nonnegative(), sortie: z.number().int().nonnegative() }).strict(),
    outil: z.object({ nom: z.string().min(1), version: z.string().min(1) }).strict(),
  })
  .strict();
export type ReponseValidationCibles = z.infer<typeof ReponseValidationCibles>;

export function validationCiblesRepondA(demande: DemandeValidationCibles, reponse: ReponseValidationCibles): readonly string[] {
  const ecarts: string[] = [];
  if (demande.document !== reponse.document) ecarts.push("le document rendu n'est pas le document demandé");
  const attendues = [...demande.cibles].sort((a, b) => a.localeCompare(b, "fr"));
  const rendues = [...reponse.resultats.map((resultat) => resultat.cible)].sort((a, b) => a.localeCompare(b, "fr"));
  if (JSON.stringify(attendues) !== JSON.stringify(rendues)) ecarts.push("les cibles rendues ne sont pas les cibles demandées");
  const pages = new Set(demande.pages.map((page) => page.numero));
  for (const resultat of reponse.resultats)
    if (resultat.etat === "trouve" && (resultat.page === undefined || !pages.has(resultat.page)))
      ecarts.push(`la cible ${resultat.cible} cite une page non transmise`);
  return ecarts;
}
