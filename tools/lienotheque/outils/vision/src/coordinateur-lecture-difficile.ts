/** Coordinateur commun des lectures difficiles.
 *
 * Il ne remplace ni l'OCR, ni les lecteurs de repères, ni le diagnostic structurel. Il impose
 * leur ordre et leur règle de sûreté : local d'abord, Vision sur la seule page en difficulté,
 * puis corroboration indépendante avant toute conservation automatique. Une rupture de gabarit
 * peut ouvrir un nouveau segment, mais seulement après un recalibrage déclaré valide.
 *
 * Aucune page ne disparaît : chaque entrée rend soit une valeur retenue, soit une décision
 * explicite « à vérifier » avec ses raisons. */

export type LectureTentative<Valeur> =
  | { readonly etat: "valide"; readonly valeur: Valeur; readonly confiance: number }
  | { readonly etat: "incertaine"; readonly raison: string; readonly candidat?: Valeur }
  | { readonly etat: "echec"; readonly raison: string }
  | { readonly etat: "rupture"; readonly raison: string };

export type Recalibrage<Modele> =
  | { readonly etat: "valide"; readonly modele: Modele }
  | { readonly etat: "refuse"; readonly raison: string };

export type PageRetenue<Page, Valeur, Modele> = {
  readonly page: number;
  readonly entree: Page;
  readonly etat: "retenue";
  readonly valeur: Valeur;
  readonly source: "locale" | "vision_corroboree";
  readonly confiance: number;
  readonly modele: Modele;
  readonly visionUtilisee: boolean;
};

export type PageAVerifier<Page, Modele> = {
  readonly page: number;
  readonly entree: Page;
  readonly etat: "a_verifier";
  readonly raisons: readonly string[];
  readonly modele: Modele;
  readonly visionUtilisee: boolean;
};

export type DecisionPage<Page, Valeur, Modele> = PageRetenue<Page, Valeur, Modele> | PageAVerifier<Page, Modele>;

export type SegmentStructurel<Modele> = {
  readonly depuis: number;
  readonly modele: Modele;
  readonly origine: "initiale" | "recalibrage_valide";
};

export type OptionsCoordinateur<Page, Valeur, Modele> = {
  /** Le numéro logique est fourni par l'appelant : le coordinateur ne suppose ni base zéro, ni
   * pagination imprimée. Par défaut, il lit la propriété numérique `numero`. */
  readonly numeroDePage?: (page: Page, rang: number) => number;
  readonly lireLocalement: (contexte: { readonly page: Page; readonly modele: Modele }) =>
    | LectureTentative<Valeur>
    | Promise<LectureTentative<Valeur>>;
  /** Ce port reçoit toujours une seule page. Le groupage réseau éventuel reste la responsabilité
   * du transport, jamais une raison d'élargir ce qui quitte la machine. */
  readonly relireParVision: (contexte: {
    readonly page: Page;
    readonly modele: Modele;
    readonly lectureLocale: LectureTentative<Valeur>;
  }) => LectureTentative<Valeur> | Promise<LectureTentative<Valeur>>;
  /** Vision ne constitue pas sa propre preuve. L'appelant recoupe avec un candidat local, un
   * inventaire de médias, une contrainte structurelle ou toute autre source indépendante. */
  readonly corroborer: (contexte: {
    readonly page: Page;
    readonly modele: Modele;
    readonly locale: LectureTentative<Valeur>;
    readonly vision: Extract<LectureTentative<Valeur>, { readonly etat: "valide" }>;
  }) => boolean | Promise<boolean>;
  /** Appelé seulement sur une rupture déclarée. Le coordinateur transmet la page courante et les
   * suivantes, dans une fenêtre bornée. Un refus ne modifie jamais le modèle actif. */
  readonly recalibrer?: (contexte: {
    readonly depuis: number;
    readonly pages: readonly Page[];
    readonly modele: Modele;
    readonly raison: string;
  }) => Recalibrage<Modele> | Promise<Recalibrage<Modele>>;
  readonly pagesDeCalibrage?: number;
  /** Seuil appliqué par le coordinateur lui-même, y compris si un lecteur qualifie abusivement
   * sa réponse de valide. */
  readonly seuilConfiance?: number;
};

export type ResultatCoordinateur<Page, Valeur, Modele> = {
  readonly pages: readonly DecisionPage<Page, Valeur, Modele>[];
  readonly segments: readonly SegmentStructurel<Modele>[];
};

const messageDe = (leve: unknown): string => (leve instanceof Error ? leve.message : String(leve));

const raisonDe = <Valeur>(lecture: LectureTentative<Valeur>): string | undefined =>
  lecture.etat === "valide" ? undefined : lecture.raison;

const numeroParDefaut = <Page>(page: Page, rang: number): number => {
  const candidate = (page as { readonly numero?: unknown }).numero;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : rang;
};

const imposerSeuil = <Valeur>(lecture: LectureTentative<Valeur>, seuil: number): LectureTentative<Valeur> => {
  if (lecture.etat !== "valide") return lecture;
  if (Number.isFinite(lecture.confiance) && lecture.confiance >= seuil && lecture.confiance <= 1) return lecture;
  return {
    etat: "incertaine",
    raison: `confiance ${Number.isFinite(lecture.confiance) ? lecture.confiance.toFixed(3) : "invalide"} sous le seuil ${seuil.toFixed(3)}`,
    candidat: lecture.valeur,
  };
};

/** Ordonne les replis de lecture et segmente les changements de gabarit sans jamais inventer de
 * résultat. La fonction reste générique : une valeur peut être un texte, un numéro, un repère ou
 * une structure plus riche. */
export async function coordonnerLectureDifficile<Page, Valeur, Modele>(
  pages: readonly Page[],
  modeleInitial: Modele,
  options: OptionsCoordinateur<Page, Valeur, Modele>,
): Promise<ResultatCoordinateur<Page, Valeur, Modele>> {
  if (pages.length === 0) return { pages: [], segments: [] };
  const numero = options.numeroDePage ?? numeroParDefaut<Page>;
  const largeur = Math.max(2, Math.min(8, Math.trunc(options.pagesDeCalibrage ?? 8)));
  const seuil = Math.max(0, Math.min(1, options.seuilConfiance ?? 0.8));
  let modele = modeleInitial;
  const segments: SegmentStructurel<Modele>[] = [{ depuis: numero(pages[0]!, 0), modele, origine: "initiale" }];
  const decisions: DecisionPage<Page, Valeur, Modele>[] = [];

  for (let rang = 0; rang < pages.length; rang += 1) {
    const page = pages[rang]!;
    const pageNumero = numero(page, rang);
    const raisons: string[] = [];
    let locale: LectureTentative<Valeur>;
    try {
      locale = imposerSeuil(await options.lireLocalement({ page, modele }), seuil);
    } catch (leve) {
      locale = { etat: "echec", raison: `Lecture locale en échec : ${messageDe(leve)}` };
    }

    if (locale.etat === "rupture") {
      raisons.push(`Rupture structurelle : ${locale.raison}`);
      if (options.recalibrer === undefined) raisons.push("Aucun recalibrage n'est disponible pour cette rupture.");
      else {
        try {
          const recalibrage = await options.recalibrer({
            depuis: pageNumero,
            pages: pages.slice(rang, rang + largeur),
            modele,
            raison: locale.raison,
          });
          if (recalibrage.etat === "valide") {
            modele = recalibrage.modele;
            segments.push({ depuis: pageNumero, modele, origine: "recalibrage_valide" });
            try {
              locale = imposerSeuil(await options.lireLocalement({ page, modele }), seuil);
            } catch (leve) {
              locale = { etat: "echec", raison: `Lecture locale après recalibrage en échec : ${messageDe(leve)}` };
            }
          } else raisons.push(`Recalibrage refusé : ${recalibrage.raison}`);
        } catch (leve) {
          raisons.push(`Recalibrage en échec : ${messageDe(leve)}`);
        }
      }
    }

    if (locale.etat === "valide") {
      decisions.push({
        page: pageNumero,
        entree: page,
        etat: "retenue",
        valeur: locale.valeur,
        source: "locale",
        confiance: locale.confiance,
        modele,
        visionUtilisee: false,
      });
      continue;
    }

    const raisonLocale = raisonDe(locale);
    if (raisonLocale !== undefined && !raisons.some((raison) => raison.includes(raisonLocale))) raisons.push(`Lecture locale : ${raisonLocale}`);

    let vision: LectureTentative<Valeur>;
    try {
      vision = imposerSeuil(await options.relireParVision({ page, modele, lectureLocale: locale }), seuil);
    } catch (leve) {
      raisons.push(`Repli Vision indisponible : ${messageDe(leve)}`);
      decisions.push({ page: pageNumero, entree: page, etat: "a_verifier", raisons, modele, visionUtilisee: true });
      continue;
    }

    if (vision.etat !== "valide") {
      raisons.push(`Repli Vision sans résultat sûr : ${vision.raison}`);
      decisions.push({ page: pageNumero, entree: page, etat: "a_verifier", raisons, modele, visionUtilisee: true });
      continue;
    }

    let corroboree = false;
    try {
      corroboree = await options.corroborer({ page, modele, locale, vision });
    } catch (leve) {
      raisons.push(`Corroboration en échec : ${messageDe(leve)}`);
    }
    if (!corroboree) {
      raisons.push(
        locale.etat === "incertaine" && locale.candidat !== undefined
          ? "Vision contredit la lecture locale ou ne la corrobore pas."
          : "La réponse Vision reste seule, sans corroboration indépendante.",
      );
      decisions.push({ page: pageNumero, entree: page, etat: "a_verifier", raisons, modele, visionUtilisee: true });
      continue;
    }

    decisions.push({
      page: pageNumero,
      entree: page,
      etat: "retenue",
      valeur: vision.valeur,
      source: "vision_corroboree",
      confiance: vision.confiance,
      modele,
      visionUtilisee: true,
    });
  }

  return { pages: decisions, segments };
}
