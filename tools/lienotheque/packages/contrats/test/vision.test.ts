import { describe, expect, it } from "vitest";
import {
  COTE_MAX_RECADRAGE,
  DemandeVision,
  Preuve,
  Recette,
  ReponseVision,
  ZONES_MAX_PAR_APPEL,
  reponseRepondA,
} from "../src/index.js";

/** Contrats de la relecture ciblée (OUT-08, ANC-02).
 *
 *  Ce qui traverse une frontière est validé des deux côtés. Les contrôles ci-dessous disent ce
 *  qu'on refuse, pas seulement ce qu'on accepte : c'est le refus qui protège. */

const EMPREINTE = (n: number): string => String(n).padStart(32, "0");

const zone = (sur: Record<string, unknown> = {}): unknown => ({
  empreinte: EMPREINTE(1),
  image: "AAAA",
  typeMime: "image/png",
  largeur: 357,
  hauteur: 230,
  ...sur,
});

const demande = (zones: unknown[]): unknown => ({ alphabet: "chiffres", zones });

describe("une demande ne porte que des recadrages", () => {
  it("accepte un rectangle de marge", () => {
    expect(DemandeVision.safeParse(demande([zone()])).success).toBe(true);
  });

  it("refuse une image trop grande pour être un recadrage", () => {
    // Le contrat garantit ce que la discipline laisserait filer : ce qui part d'ici est un bout
    // de marge, jamais une page.
    expect(DemandeVision.safeParse(demande([zone({ largeur: COTE_MAX_RECADRAGE + 1 })])).success).toBe(false);
    expect(DemandeVision.safeParse(demande([zone({ hauteur: COTE_MAX_RECADRAGE + 1 })])).success).toBe(false);
  });

  it("refuse un appel vide, et un appel qui porte tout un livre", () => {
    expect(DemandeVision.safeParse(demande([])).success).toBe(false);
    const trop = Array.from({ length: ZONES_MAX_PAR_APPEL + 1 }, (_, rang) => zone({ empreinte: EMPREINTE(rang) }));
    expect(DemandeVision.safeParse(demande(trop)).success).toBe(false);
  });

  it("refuse deux fois la même zone : on ne paye pas deux fois la même image", () => {
    expect(DemandeVision.safeParse(demande([zone(), zone()])).success).toBe(false);
  });

  it("refuse un intervalle qui finit avant de commencer", () => {
    expect(DemandeVision.safeParse(demande([zone({ attendu: { min: 40, max: 12 } })])).success).toBe(false);
    expect(DemandeVision.safeParse(demande([zone({ attendu: { min: 12, max: 40 } })])).success).toBe(true);
  });

  it("refuse un format qu'on n'a pas choisi de servir", () => {
    expect(DemandeVision.safeParse(demande([zone({ typeMime: "image/jpeg" })])).success).toBe(false);
  });
});

describe("une réponse dit ce qui a été lu, ou que rien ne l'a été", () => {
  const reponse = (zones: unknown[]): unknown => ({
    zones,
    jetons: { entree: 110, sortie: 12 },
    outil: { nom: "vision-ciblee", version: "0.1.0" },
  });

  it("accepte un numéro lu avec sa confiance", () => {
    expect(ReponseVision.safeParse(reponse([{ empreinte: EMPREINTE(1), numero: 189, confiance: 0.9 }])).success).toBe(true);
  });

  it("accepte « rien de lu » : une marge vide est une information", () => {
    expect(ReponseVision.safeParse(reponse([{ empreinte: EMPREINTE(1), numero: null, confiance: 0 }])).success).toBe(true);
  });

  it("refuse « rien de lu » assorti d'une confiance : cela ne veut rien dire", () => {
    expect(ReponseVision.safeParse(reponse([{ empreinte: EMPREINTE(1), numero: null, confiance: 0.8 }])).success).toBe(false);
  });

  it("porte les jetons dépensés et la version de l'outil", () => {
    const lue = ReponseVision.safeParse(reponse([]));
    expect(lue.success).toBe(true);
    if (lue.success) {
      expect(lue.data.jetons.entree).toBe(110);
      expect(lue.data.outil.version).toBe("0.1.0");
    }
  });
});

describe("une réponse répond à sa demande, zone par zone", () => {
  const demandee = DemandeVision.parse(demande([zone({ empreinte: EMPREINTE(1) }), zone({ empreinte: EMPREINTE(2) })]));
  const rendre = (zones: unknown[]): ReponseVision =>
    ReponseVision.parse({ zones, jetons: { entree: 0, sortie: 0 }, outil: { nom: "x", version: "1" } });

  it("ne dit rien quand tout correspond", () => {
    const reponse = rendre([
      { empreinte: EMPREINTE(1), numero: 1, confiance: 0.9 },
      { empreinte: EMPREINTE(2), numero: null, confiance: 0 },
    ]);
    expect(reponseRepondA(demandee, reponse)).toEqual([]);
  });

  it("signale une zone restée sans réponse", () => {
    const reponse = rendre([{ empreinte: EMPREINTE(1), numero: 1, confiance: 0.9 }]);
    expect(reponseRepondA(demandee, reponse)).toEqual([`zone sans réponse : ${EMPREINTE(2)}`]);
  });

  it("signale une réponse qu'on n'a pas demandée", () => {
    const reponse = rendre([
      { empreinte: EMPREINTE(1), numero: 1, confiance: 0.9 },
      { empreinte: EMPREINTE(2), numero: 2, confiance: 0.9 },
      { empreinte: EMPREINTE(3), numero: 3, confiance: 0.9 },
    ]);
    expect(reponseRepondA(demandee, reponse)).toEqual([`réponse sans zone : ${EMPREINTE(3)}`]);
  });
});

describe("la preuve « vision » est au contrat (ANC-02)", () => {
  it("rejoint les quatre autres", () => {
    expect(Preuve.options).toContain("vision");
    expect(Preuve.safeParse("vision").success).toBe(true);
  });

  it("et la liste reste close", () => {
    expect(Preuve.safeParse("devine").success).toBe(false);
  });
});

describe("une recette qui demande la vision dit son budget", () => {
  const base = {
    id: "essai",
    version: 1,
    derivee_de: null,
    preparation: { redressement: "aucun", double_page: false },
    lectures: [
      {
        ancre: "element",
        zone: { type: "marges_exterieures", largeur_rel: 0.2 },
        hauteur_rel: { min: 0.012, max: 0.032 },
        alphabet: "chiffres",
      },
    ],
    regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
    validation: { seuil_confiance: 0.6 },
  };

  it("passe sans bloc « vision » : la plupart des lots n'en auront jamais", () => {
    expect(Recette.safeParse(base).success).toBe(true);
  });

  it("accepte un budget complet", () => {
    const avec = { ...base, vision: { zones_max_par_lot: 400, zones_max_par_page: 6, cout_max_eur: 0.5 } };
    expect(Recette.safeParse(avec).success).toBe(true);
  });

  it("refuse une vision sans plafond : on ne découvre pas le budget à la centième zone", () => {
    expect(Recette.safeParse({ ...base, vision: {} }).success).toBe(false);
    expect(Recette.safeParse({ ...base, vision: { zones_max_par_lot: 400 } }).success).toBe(false);
    expect(Recette.safeParse({ ...base, vision: { zones_max_par_page: 6 } }).success).toBe(false);
  });

  it("laisse le plafond de dépense à mesurer : on ne le pose pas sur une estimation", () => {
    expect(Recette.safeParse({ ...base, vision: { zones_max_par_lot: 400, zones_max_par_page: 6 } }).success).toBe(true);
  });

  it("refuse un plafond qui n'en est pas un", () => {
    expect(Recette.safeParse({ ...base, vision: { zones_max_par_lot: 0, zones_max_par_page: 6 } }).success).toBe(false);
    expect(Recette.safeParse({ ...base, vision: { zones_max_par_lot: 400, zones_max_par_page: 6, cout_max_eur: 0 } }).success).toBe(false);
  });
});
