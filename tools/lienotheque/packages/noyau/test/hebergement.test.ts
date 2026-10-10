import { BibliothequePubliee, type Liaison } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import {
  apres,
  capacites,
  empechePublication,
  liaisonsLibres,
  poidsAnnonce,
  prefixeDe,
  REGION_PAR_DEFAUT,
} from "../src/hebergement.js";

const RESERVE: readonly Liaison[] = ["BIB_1", "BIB_2", "BIB_3", "BIB_4"];
const quand = "2026-10-10T08:00:00+00:00";

describe("réserve de liaisons (SEC-08)", () => {
  it("rend les places déclarées que personne n'occupe", () => {
    expect(liaisonsLibres(RESERVE, ["BIB_1", undefined, "BIB_3"])).toEqual(["BIB_2", "BIB_4"]);
  });

  it("ne propose jamais une place qui n'est pas déclarée", () => {
    // Une place non déclarée ne mène à aucune base : la proposer serait promettre un hébergement
    // qui n'existe pas. La réserve vient de la configuration, pas de l'imagination.
    expect(liaisonsLibres(["BIB_1"], [])).toEqual(["BIB_1"]);
    expect(liaisonsLibres(["BIB_1"], ["BIB_1"])).toEqual([]);
  });
});

describe("ce qui empêche de publier (HEB-01)", () => {
  it("laisse passer une bibliothèque locale quand une place est libre", () => {
    expect(empechePublication({ cle: "essai", etat: "locale" }, ["BIB_2"], [])).toBeUndefined();
  });

  it("refuse une bibliothèque déjà servie", () => {
    expect(empechePublication({ cle: "essai", etat: "publiee" }, ["BIB_2"], [])).toMatch(/déjà servie/);
  });

  it("dit qu'il faut redéployer quand la réserve est pleine, plutôt que d'échouer plus tard", () => {
    const dit = empechePublication({ cle: "essai", etat: "locale" }, [], []);
    expect(dit).toMatch(/redéployer/);
  });

  it("refuse deux bibliothèques au même emplacement de fichiers", () => {
    expect(empechePublication({ cle: "essai", etat: "locale" }, ["BIB_2"], ["essai/"])).toMatch(/occupe déjà/);
  });
});

describe("aller et retour sans perte (PLT-06)", () => {
  it("publie, dépublie, et revient là d'où l'on vient", () => {
    expect(apres("locale", "publier")).toBe("publiee");
    expect(apres("publiee", "depublier")).toBe("locale");
  });

  it("ne mène jamais à un état « supprimée » : la suppression n'est pas une transition", () => {
    const gestes = ["publier", "depublier", "passer_en_mixte"] as const;
    const etats = ["locale", "mixte", "publiee"] as const;
    const atteints = etats.flatMap((etat) => gestes.map((geste) => apres(etat, geste))).filter((e) => e !== undefined);
    expect(new Set(atteints)).toEqual(new Set(["locale", "mixte", "publiee"]));
  });

  it("rend « rien » pour un geste qui n'a pas de sens depuis là", () => {
    expect(apres("locale", "depublier")).toBeUndefined();
  });
});

describe("ce qu'un état promet (HEB-01, PLT-12)", () => {
  it("n'annonce les médias partout que lorsqu'ils y sont", () => {
    expect(capacites("publiee")).toContain("médias servis partout");
    expect(capacites("mixte").join(" ")).toMatch(/quand il est allumé/);
    expect(capacites("locale")).toEqual(["lecture sur cet ordinateur"]);
  });
});

describe("le préfixe et le poids annoncé", () => {
  it("compose le préfixe depuis la clé, et nulle part ailleurs", () => {
    expect(prefixeDe("therapie")).toBe("therapie/");
  });

  it("n'annonce que le poids des pages, jamais celui du dossier", () => {
    // 345 Mo sur le disque, 217,4 Mo de pages : c'est le second chiffre qui part chez
    // l'hébergeur. L'épreuve du lot E a montré 122,5 Mo d'images qu'aucune page ne réclame.
    expect(poidsAnnonce(217_400_000, 0.28)).toBe(60_872_000);
  });

  it("la région par défaut est nommée, pas devinée (HEB-05)", () => {
    expect(REGION_PAR_DEFAUT).toBe("weur");
  });
});

describe("le contrat du registre", () => {
  const servie = {
    cle: "essai",
    nom: "Bibliothèque d'essai",
    etat: "publiee",
    liaison: "BIB_1",
    prefixe: "essai/",
    region: "weur",
    schemaVersion: 2,
    publieeLe: quand,
    majLe: quand,
  };

  it("accepte une bibliothèque servie, complète", () => {
    expect(BibliothequePubliee.parse(servie)).toMatchObject({ cle: "essai", liaison: "BIB_1" });
  });

  it("refuse une bibliothèque servie sans place : le Worker n'aurait aucune base à lire", () => {
    const { liaison: _, ...sansPlace } = servie;
    expect(BibliothequePubliee.safeParse(sansPlace).success).toBe(false);
  });

  it("refuse une bibliothèque servie sans date de publication", () => {
    const { publieeLe: _, ...sansDate } = servie;
    expect(BibliothequePubliee.safeParse(sansDate).success).toBe(false);
  });

  it("accepte une bibliothèque locale sans place ni date", () => {
    expect(
      BibliothequePubliee.safeParse({
        cle: "essai",
        nom: "Bibliothèque d'essai",
        etat: "locale",
        prefixe: "essai/",
        region: "weur",
        schemaVersion: 2,
        majLe: quand,
      }).success,
    ).toBe(true);
  });

  it("refuse une place mal formée et un préfixe sans barre oblique", () => {
    expect(BibliothequePubliee.safeParse({ ...servie, liaison: "BIB" }).success).toBe(false);
    expect(BibliothequePubliee.safeParse({ ...servie, prefixe: "essai" }).success).toBe(false);
  });
});
