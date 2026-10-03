import {
  FORMATS_ADMIS,
  PlanOptimisation,
  RAPPORTS_ESTIMES,
  type ClassePage,
  type Echantillon,
  type FormatCible,
  type PageInspectee,
  type PlanPage,
  type RapportInspecteur,
  type SortCoucheTexte,
} from "@lienotheque/contrats";

/** Optimiseur (OUT-02) : il décide d'un format par page et rend un plan lisible avant
 *  application. Il ne touche à rien — c'est le plan qu'on relit, pas le résultat.
 *
 *  Deux règles le bornent : une page native reste dans son PDF, couche texte intacte (OPT-02),
 *  et aucune image n'est re-rendue plus bas que sa résolution d'origine (OPT-04). */

/** Ce qu'une page inspectée devient, du point de vue de l'encodage (OPT-01).
 *
 *  Une page qui porte du texte et aucune image est native : on n'y touche pas. Une page mixte
 *  l'est aussi — son texte lui appartient. Le reste se range sur sa couleur. */
export function classer(page: PageInspectee): ClassePage {
  if (page.nature === "native" || page.nature === "mixte" || page.nature === "vide") return "native";
  return page.couleur ?? "couleur";
}

export type OptionsPlan = {
  /** Format préféré pour les pages couleur. AVIF par défaut : il pèse moins. */
  readonly couleur?: Extract<FormatCible, "avif" | "webp">;
  /** Pages à soumettre à l'œil avant d'appliquer au lot (OPT-03). */
  readonly echantillon?: Echantillon;
};

/** Le format d'une classe : le premier admis, sauf préférence exprimée pour la couleur. */
export function formatPour(classe: ClassePage, options: OptionsPlan = {}): FormatCible {
  const admis = FORMATS_ADMIS[classe];
  if (classe === "couleur" && options.couleur !== undefined && admis.includes(options.couleur)) return options.couleur;
  return admis[0]!;
}

/** Trois pages réparties sur le document : début, milieu, fin. L'échantillon d'OPT-03 n'a pas
 *  à être grand, il a à être représentatif. */
export function echantillonParDefaut(pages: readonly PageInspectee[]): Echantillon {
  const index = pages.map((page) => page.index);
  if (index.length === 0) return { pages: [], etat: "en_attente" };
  const choisies = [...new Set([index[0]!, index[Math.floor(index.length / 2)]!, index[index.length - 1]!])];
  return { pages: choisies, etat: "en_attente" };
}

export function planifier(rapport: RapportInspecteur, options: OptionsPlan = {}): PlanOptimisation {
  const pages: PlanPage[] = rapport.pages.map((page) => {
    const classe = classer(page);
    const largeur = page.largeurPx ?? 1;
    const hauteur = page.hauteurPx ?? 1;
    return {
      index: page.index,
      classe,
      formatCible: formatPour(classe, options),
      largeur,
      hauteur,
      // Jamais plus bas que la source (OPT-04) : à ce stade, exactement la source.
      largeurCible: largeur,
      hauteurCible: hauteur,
      octetsOrigine: page.octets,
      octetsEstimes: Math.round(page.octets * RAPPORTS_ESTIMES[classe]),
    };
  });

  // Un document qui porte du texte le garde ; aucun traitement n'en fabrique (OPT-02).
  const coucheTexte: SortCoucheTexte = rapport.pages.some((page) => page.nature === "native" || page.nature === "mixte")
    ? "preservee"
    : "aucune";

  return PlanOptimisation.parse({
    document: rapport.empreinte,
    pages,
    coucheTexte,
    echantillon: options.echantillon ?? echantillonParDefaut(rapport.pages),
  });
}
