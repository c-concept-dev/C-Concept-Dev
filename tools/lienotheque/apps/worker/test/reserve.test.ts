import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { baseDeLaPlace, placesDeclarees } from "../src/reserve.js";

const base = () => ({ prepare: () => ({}) });
const CONFIG = readFileSync(fileURLToPath(new URL("../wrangler.toml", import.meta.url)), "utf8");

/** La configuration sans ses commentaires. Le fichier **parle** de clone-proxy et de la base de
 *  Studio Clinique — c'est tout le propos de son avertissement en tête. La règle porte sur ce
 *  qu'il déclare, pas sur ce qu'il mentionne, et un test qui confond les deux interdit
 *  d'expliquer le danger dans le fichier où il se présente. */
const DECLARE = CONFIG.split("\n")
  .filter((ligne) => !ligne.trimStart().startsWith("#"))
  .join("\n");

describe("la réserve de places (SEC-08)", () => {
  it("ne retient que les liaisons qui sont vraiment des bases", () => {
    const places = placesDeclarees({ BIB_1: base(), REGISTRE: base(), JETON_ACCES: "secret", BIB_2: base() });
    expect(places).toEqual(["BIB_1", "BIB_2"]);
  });

  it("écarte une place dont le nom est bon mais qui n'est pas une base", () => {
    // Mieux vaut une réserve plus courte qu'une place qui échouerait au premier usage : une
    // place proposée est une promesse d'hébergement.
    expect(placesDeclarees({ BIB_1: base(), BIB_2: "pas une base" })).toEqual(["BIB_1"]);
  });

  it("range les places par leur numéro, pas par leur texte", () => {
    const liaisons = Object.fromEntries(["BIB_10", "BIB_2", "BIB_1"].map((nom) => [nom, base()]));
    expect(placesDeclarees(liaisons)).toEqual(["BIB_1", "BIB_2", "BIB_10"]);
  });

  it("rend la base d'une place, et rien pour une place vide", () => {
    const liaisons = { BIB_1: base() };
    expect(baseDeLaPlace(liaisons, "BIB_1")).toBeDefined();
    expect(baseDeLaPlace(liaisons, "BIB_2")).toBeUndefined();
  });
});

describe("la configuration déployée", () => {
  it("déclare le registre et au moins une place", () => {
    expect(DECLARE).toMatch(/binding\s*=\s*"REGISTRE"/);
    expect(DECLARE).toMatch(/binding\s*=\s*"BIB_1"/);
  });

  it("ne relie jamais la base de Studio Clinique", () => {
    // Le garde-fou qui compte. Les deux bibliothèques coexistent sans se voir, et cette règle
    // est vérifiée sur le fichier de configuration lui-même plutôt que laissée à la vigilance
    // de qui l'édite (CLA-01 par analogie : la règle est une donnée, pas une intention).
    expect(DECLARE).not.toMatch(/therapeute-library/);
    expect(DECLARE).not.toMatch(/clone-proxy/);
  });

  it("chaque base déclarée a son dossier de migrations", () => {
    const liaisons = [...DECLARE.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[\[|\n*$)/g)].map((m) => m[1] ?? "");
    expect(liaisons.length).toBeGreaterThan(0);
    for (const bloc of liaisons) {
      expect(bloc, `une base déclarée n'a pas de migrations_dir : ${bloc.trim().split("\n")[0]}`).toMatch(
        /migrations_dir\s*=/,
      );
    }
  });
});
