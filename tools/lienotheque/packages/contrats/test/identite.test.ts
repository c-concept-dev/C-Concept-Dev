import { describe, expect, it } from "vitest";
import {
  DONNEES_MAX,
  IDENTIFIANT_MAX,
  PreuveDEnrolement,
  PreuveDEntree,
  SIGNATURE_MAX,
} from "../src/index.js";

/** Les bornes des preuves d'identité (SEC-02, SEC-07).
 *
 *  Ce qui est éprouvé ici n'est pas une convenance de forme. Sans maximum sur `identifiant`, une
 *  entrée refusée écrivait au journal d'audit une ligne de la taille que l'appelant voulait :
 *  deux cent cinquante requêtes remplissaient une base de cinq cents mégaoctets, et le journal
 *  est la table dont SEC-07 dit que rien ne l'efface.
 *
 *  La borne doit agir **dans le contrat**, pas dans la route : c'est ce qui garantit qu'`entrer`
 *  n'est jamais appelée sur un corps démesuré, donc que rien n'est écrit du tout. */
const preuveDEntree = (surcharge: Record<string, unknown> = {}) => ({
  identifiant: "abc",
  donneesAuthentificateur: "abc",
  donneesClient: "abc",
  signature: "abc",
  ...surcharge,
});

describe("les bornes des preuves d'identité (SEC-02)", () => {
  it("accepte une preuve d'entrée ordinaire", () => {
    expect(PreuveDEntree.safeParse(preuveDEntree()).success).toBe(true);
  });

  it("refuse un identifiant plus long que la borne, avant que rien ne soit écrit", () => {
    const trop = "a".repeat(IDENTIFIANT_MAX + 1);
    expect(PreuveDEntree.safeParse(preuveDEntree({ identifiant: trop })).success).toBe(false);
    expect(PreuveDEnrolement.safeParse({
      identifiant: trop,
      clePublique: "abc",
      algorithme: -7,
      donneesClient: "abc",
    }).success).toBe(false);
  });

  it("accepte un identifiant de la taille que la spécification autorise", () => {
    // Mille vingt-trois octets en base64url font mille trois cent soixante-quatre caractères :
    // une borne qui les refuserait interdirait à un authentificateur conforme d'entrer, ce qui
    // serait un dégât pire que celui qu'on répare.
    const limite = "a".repeat(1_364);
    expect(limite.length).toBeLessThanOrEqual(IDENTIFIANT_MAX);
    expect(PreuveDEntree.safeParse(preuveDEntree({ identifiant: limite })).success).toBe(true);
  });

  it("borne aussi les trois autres champs, qui coûtent du calcul avant de coûter de la place", () => {
    for (const [champ, max] of [
      ["donneesAuthentificateur", DONNEES_MAX],
      ["donneesClient", DONNEES_MAX],
      ["signature", SIGNATURE_MAX],
    ] as const) {
      const verdict = PreuveDEntree.safeParse(preuveDEntree({ [champ]: "a".repeat(max + 1) }));
      expect(verdict.success, champ).toBe(false);
    }
  });
});
