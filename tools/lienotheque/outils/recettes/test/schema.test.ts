import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecetteInvalide, chargerRecette, filiation } from "../src/index.js";

const RECETTES = join(import.meta.dirname, "../../../fixtures/recettes");
const lire = (nom: string): unknown => JSON.parse(readFileSync(join(RECETTES, nom), "utf8"));

describe("chargement d'une recette (REC-01)", () => {
  it("accepte les recettes prouvées du dépôt", () => {
    for (const nom of ["methode-pastille-piste.v1.json", "methode-pastille-piste.v2.json", "methode-pastilles-cd.v4.json", "methode-pastilles-cd.v5.json"])
      expect(() => chargerRecette(lire(nom)), nom).not.toThrow();
  });

  it("refuse un paramètre inconnu, et le nomme", () => {
    const recette = lire("methode-pastille-piste.v2.json") as Record<string, unknown>;
    let erreur: RecetteInvalide | undefined;
    try {
      chargerRecette({ ...recette, cadence: 120 });
    } catch (leve) {
      erreur = leve as RecetteInvalide;
    }
    expect(erreur).toBeInstanceOf(RecetteInvalide);
    expect(erreur!.problemes.join(" ")).toContain("paramètre inconnu");
    expect(erreur!.problemes.join(" ")).toContain("cadence");
  });

  it("dit en français ce qui manque", () => {
    const recette = lire("methode-pastille-piste.v2.json") as Record<string, unknown>;
    const { validation: _absente, ...sansValidation } = recette;
    try {
      chargerRecette(sansValidation);
      expect.unreachable("une recette sans seuil de validation doit être refusée");
    } catch (leve) {
      const problemes = (leve as RecetteInvalide).problemes.join(" ");
      expect(problemes).toContain("validation");
      expect(problemes).toContain("obligatoire");
    }
  });

  it("dit quelles valeurs sont permises quand on en propose une autre", () => {
    const recette = lire("methode-pastille-piste.v2.json") as Record<string, unknown>;
    try {
      chargerRecette({ ...recette, preparation: { redressement: "peut-être", double_page: false } });
      expect.unreachable("un redressement inventé doit être refusé");
    } catch (leve) {
      expect((leve as RecetteInvalide).problemes.join(" ")).toMatch(/« auto »|« aucun »/);
    }
  });

  it("le message complet se lit d'une traite", () => {
    try {
      chargerRecette({ id: "essai" });
      expect.unreachable("recette tronquée");
    } catch (leve) {
      expect((leve as Error).message).toMatch(/^Recette refusée :\n {2}— /);
    }
  });
});

describe("filiation d'une recette (REC-03)", () => {
  it("nomme la recette et sa version", () => {
    expect(filiation(chargerRecette(lire("methode-pastilles-cd.v4.json")))).toBe("methode-pastilles-cd v4");
  });

  it("nomme aussi celle dont elle est dérivée", () => {
    expect(filiation(chargerRecette(lire("methode-pastille-piste.v2.json")))).toBe(
      "methode-pastille-piste v2 (dérivée de methode-pastilles-cd v4)",
    );
  });

  it("les deux versions de la même recette coexistent : l'historique reste consultable", () => {
    const v1 = chargerRecette(lire("methode-pastille-piste.v1.json"));
    const v2 = chargerRecette(lire("methode-pastille-piste.v2.json"));
    expect(v1.id).toBe(v2.id);
    expect(v2.version).toBe(v1.version + 1);
    // La correction qui a motivé la v2 : la pastille suit le libellé, elle ne le précède pas.
    const positionDe = (recette: typeof v1) => recette.lectures.find((l) => l.ancre === "piste")?.position;
    expect(positionDe(v1)).toBe("gauche");
    expect(positionDe(v2)).toBe("droite");
  });
});

describe("relecture ciblée déclarée par la recette (REC-01, OUT-08)", () => {
  const v5 = () => chargerRecette(lire("methode-pastilles-cd.v5.json"));

  it("se déclare avec ses plafonds, et c'est ce qui change de la v4", () => {
    // Les trois plafonds sont mesurés : 184 pavés relevés sur les clichés de référence pour un
    // plafond de 300, 1,4 par page pour un plafond de 6, et 0,045 $ pour le lot entier — d'où
    // 0,20 € de plafond de dépense, environ cinq fois ce qu'un lot coûte.
    expect(v5().vision).toEqual({ zones_max_par_lot: 300, zones_max_par_page: 6, cout_max_eur: 0.2, agrandissement: 2 });
    expect(chargerRecette(lire("methode-pastilles-cd.v4.json")).vision).toBeUndefined();
    expect(filiation(v5())).toBe("methode-pastilles-cd v5 (dérivée de methode-pastilles-cd v4)");
  });

  it("reste facultative : la plupart des recettes n'en auront jamais", () => {
    expect(chargerRecette(lire("methode-pastille-piste.v2.json")).vision).toBeUndefined();
  });

  it("porte l'agrandissement que la mesure a imposé", () => {
    // 15 pavés justes sur 18 à l'échelle d'origine, 18 sur 18 au double : c'est la mesure qui a
    // tranché, contre le plan qui disait de ne jamais agrandir.
    expect(v5().vision?.agrandissement).toBe(2);
    const recette = lire("methode-pastilles-cd.v5.json") as Record<string, unknown>;
    expect(() => chargerRecette({ ...recette, vision: { zones_max_par_lot: 300, zones_max_par_page: 6, agrandissement: 0 } })).toThrow(RecetteInvalide);
    expect(() => chargerRecette({ ...recette, vision: { zones_max_par_lot: 300, zones_max_par_page: 6, agrandissement: 1.5 } })).toThrow(RecetteInvalide);
  });

  it("refuse un plafond absent : une recette qui envoie des images dit combien", () => {
    const recette = lire("methode-pastilles-cd.v5.json") as Record<string, unknown>;
    expect(() => chargerRecette({ ...recette, vision: { zones_max_par_page: 6 } })).toThrow(RecetteInvalide);
    expect(() => chargerRecette({ ...recette, vision: { zones_max_par_lot: 300 } })).toThrow(RecetteInvalide);
  });

  it("refuse un plafond qui n'en est pas un", () => {
    const recette = lire("methode-pastilles-cd.v5.json") as Record<string, unknown>;
    for (const vision of [
      { zones_max_par_lot: 0, zones_max_par_page: 6 },
      { zones_max_par_lot: 300, zones_max_par_page: -1 },
      { zones_max_par_lot: 300, zones_max_par_page: 6, cout_max_eur: 0 },
    ])
      expect(() => chargerRecette({ ...recette, vision }), JSON.stringify(vision)).toThrow(RecetteInvalide);
  });

  it("porte un coût qui a été mesuré, et accepte de ne pas en porter du tout", () => {
    const recette = lire("methode-pastilles-cd.v5.json") as Record<string, unknown>;
    // Il a été mesuré, il est donc écrit. Avant la mesure il était absent, et le schéma le permet
    // toujours : on ne plafonne pas une estimation, et une recette neuve n'a rien à plafonner.
    expect(v5().vision?.cout_max_eur).toBe(0.2);
    expect(chargerRecette({ ...recette, vision: { zones_max_par_lot: 300, zones_max_par_page: 6 } }).vision?.cout_max_eur).toBeUndefined();
  });
});
