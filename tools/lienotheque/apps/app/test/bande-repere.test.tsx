// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ElementAffiche } from "@lienotheque/contrats";
import { bandesDeLaPage } from "../src/pages/lecteur/PageZoomable.js";

/** La bande d'un élément contient son repère (B1).
 *
 *  Un repère se pose à côté du numéro et déborde souvent vers le haut. La coiffe seule — trois
 *  quarts de la hauteur du numéro — le coupait en deux, et un repère coupé se lit mal. */

const element = (sur: Partial<ElementAffiche> & { numero: string }): ElementAffiche =>
  ({ ancreId: `a${sur.numero}`, page: 1, aVerifier: false, ...sur }) as ElementAffiche;

describe("le haut d'une bande", () => {
  it("coiffe le numéro quand aucun repère n'a été trouvé", () => {
    const [bande] = bandesDeLaPage([element({ numero: "1", zone: { x: 0.1, y: 0.4, l: 0.04, h: 0.02 } })]);
    // 0,4 − 0,02 × 0,75 = 0,385
    expect(bande?.zone.y).toBeCloseTo(0.385, 4);
  });

  it("monte jusqu'au repère quand il déborde au-dessus du numéro", () => {
    const [bande] = bandesDeLaPage([
      element({
        numero: "1",
        zone: { x: 0.1, y: 0.4, l: 0.04, h: 0.02 },
        zoneRepere: { x: 0.14, y: 0.37, l: 0.03, h: 0.05 },
      }),
    ]);
    expect(bande?.zone.y, "le repère commence plus haut que la coiffe").toBeCloseTo(0.37, 4);
  });

  it("garde la coiffe quand le repère est plus bas qu'elle", () => {
    const [bande] = bandesDeLaPage([
      element({
        numero: "1",
        zone: { x: 0.1, y: 0.4, l: 0.04, h: 0.02 },
        zoneRepere: { x: 0.14, y: 0.42, l: 0.03, h: 0.03 },
      }),
    ]);
    expect(bande?.zone.y, "on ne descend jamais sous la coiffe").toBeCloseTo(0.385, 4);
  });

  it("ne sort jamais du haut de la page", () => {
    const [bande] = bandesDeLaPage([
      element({ numero: "1", zone: { x: 0.1, y: 0.01, l: 0.04, h: 0.02 }, zoneRepere: { x: 0.14, y: 0.001, l: 0.03, h: 0.02 } }),
    ]);
    expect(bande?.zone.y).toBeGreaterThanOrEqual(0);
  });
});

describe("deux bandes qui se suivent", () => {
  const deux = bandesDeLaPage([
    element({ numero: "1", zone: { x: 0.1, y: 0.2, l: 0.04, h: 0.02 } }),
    element({ numero: "2", zone: { x: 0.1, y: 0.6, l: 0.04, h: 0.02 }, zoneRepere: { x: 0.14, y: 0.55, l: 0.03, h: 0.06 } }),
  ]);

  it("la première s'arrête où commence la seconde, repère compris", () => {
    expect(deux[0]?.zone.y).toBeCloseTo(0.185, 4);
    expect((deux[0]!.zone.y + deux[0]!.zone.h), "elle cède la place au repère du suivant").toBeCloseTo(0.55, 4);
    expect(deux[1]?.zone.y).toBeCloseTo(0.55, 4);
  });

  it("la dernière descend jusqu'au bas de la page", () => {
    expect(deux[1]!.zone.y + deux[1]!.zone.h).toBeCloseTo(1, 4);
  });

  it("aucune bande ne chevauche la suivante", () => {
    for (const [rang, bande] of deux.entries()) {
      const suivante = deux[rang + 1];
      if (suivante === undefined) continue;
      expect(bande.zone.y + bande.zone.h).toBeLessThanOrEqual(suivante.zone.y + 1e-9);
    }
  });
});

describe("ce qui n'a pas été lu n'a pas de bande", () => {
  it("un élément sans position n'en reçoit pas", () => {
    expect(bandesDeLaPage([element({ numero: "1" })])).toEqual([]);
  });
});
