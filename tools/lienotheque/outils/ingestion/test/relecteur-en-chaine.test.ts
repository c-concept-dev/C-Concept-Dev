// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { relecteurEnChaine } from "../src/relecteur-en-chaine.js";
import type { DemandeDeRelecture, RelecteurDeZone } from "../src/relire-les-zones.js";

/** A2 — un étage payant ne paie que ce que les gratuits n'ont pas su lire (A2, OUT-05).
 *
 *  La doctrine des trois étages dit : chaque étage douteux passe la main au SUIVANT, jamais de
 *  saut. Appliquée à la relecture d'une case, elle a une conséquence en euros : **l'appel en
 *  ligne ne part que pour les cases restées sans accord sur place**. Un étage qui part quand le
 *  précédent a répondu paie ce qui était déjà acquis.
 *
 *  Et une panne d'étage ne doit pas se taire. Un réseau coupé rendrait « rien rattrapé », ce qui
 *  ressemble exactement à « rien à rattraper » — le trou qui ressemble au succès. */

const zone = (x: number): DemandeDeRelecture => ({ page: 1, x, y: 10, l: 8, h: 6, pourquoi: "illisible" });

describe("A2 : la relecture en chaîne", () => {
  it("n'appelle pas l'étage suivant quand le premier a lu (A2)", async () => {
    const surPlace = vi.fn<RelecteurDeZone>(async () => "13");
    const enLigne = vi.fn<RelecteurDeZone>(async () => "99");
    const chaine = relecteurEnChaine([
      { nom: "sur place", relire: surPlace },
      { nom: "en ligne", relire: enLigne },
    ]);

    expect(await chaine.relire(zone(1))).toBe("13");
    expect(enLigne).not.toHaveBeenCalled();
  });

  it("n'appelle l'étage suivant que pour ce que le premier n'a pas lu (A2)", async () => {
    const surPlace = vi.fn<RelecteurDeZone>(async (demande) => (demande.x === 2 ? undefined : "13"));
    const enLigne = vi.fn<RelecteurDeZone>(async () => "32");
    const chaine = relecteurEnChaine([
      { nom: "sur place", relire: surPlace },
      { nom: "en ligne", relire: enLigne },
    ]);

    for (const x of [1, 2, 3]) await chaine.relire(zone(x));

    expect(enLigne).toHaveBeenCalledTimes(1);
    expect(enLigne.mock.calls[0]![0].x).toBe(2);
    expect(chaine.releve()).toEqual([
      { nom: "sur place", demandes: 3, rendus: 2, pannes: 0 },
      { nom: "en ligne", demandes: 1, rendus: 1, pannes: 0 },
    ]);
  });

  it("rend ce que l'étage en ligne a lu quand il est le seul à savoir (A2)", async () => {
    const chaine = relecteurEnChaine([
      { nom: "sur place", relire: async () => undefined },
      { nom: "en ligne", relire: async () => "110" },
    ]);
    expect(await chaine.relire(zone(1))).toBe("110");
  });

  it("ne rend rien quand aucun étage ne sait, sans masquer le compte (A2)", async () => {
    const chaine = relecteurEnChaine([
      { nom: "sur place", relire: async () => undefined },
      { nom: "en ligne", relire: async () => undefined },
    ]);
    expect(await chaine.relire(zone(1))).toBeUndefined();
    expect(chaine.releve()).toEqual([
      { nom: "sur place", demandes: 1, rendus: 0, pannes: 0 },
      { nom: "en ligne", demandes: 1, rendus: 0, pannes: 0 },
    ]);
  });

  it("compte la panne d'un étage au lieu de l'avaler, et passe au suivant (A2)", async () => {
    const chaine = relecteurEnChaine([
      {
        nom: "en ligne",
        relire: async () => {
          throw new Error("réseau injoignable");
        },
      },
      { nom: "secours", relire: async () => "7" },
    ]);

    expect(await chaine.relire(zone(1))).toBe("7");
    expect(chaine.releve()).toEqual([
      { nom: "en ligne", demandes: 1, rendus: 0, pannes: 1 },
      { nom: "secours", demandes: 1, rendus: 1, pannes: 0 },
    ]);
  });
});
