// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COTE_MAX_RECADRAGE, ZoneAlire } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { empreinteDuRecadrage, recadrerPour, type Candidat } from "../src/index.js";

/** Ce qui part sur le réseau (OUT-08). */

const page = (largeur: number, hauteur: number): ImageGrise => {
  const pixels = new Uint8Array(largeur * hauteur).fill(250);
  // Une tache, pour que deux recadrages différents ne donnent pas la même empreinte.
  for (let y = 10; y < 40; y += 1) for (let x = 10; x < 30; x += 1) pixels[y * largeur + x] = 10;
  return { largeur, hauteur, pixels };
};

const candidat = (recadrage: { x: number; y: number; l: number; h: number }): Candidat => ({
  page: 0,
  encre: { x: recadrage.x, y: recadrage.y, l: 30, h: 40 },
  recadrage,
});

describe("un recadrage est un bout de marge, et le contrat le garantit", () => {
  it("rend une zone conforme, à la taille demandée", async () => {
    const produit = await recadrerPour(page(800, 2000), candidat({ x: 0, y: 860, l: 160, h: 120 }));
    expect(produit).toBeDefined();
    expect(ZoneAlire.safeParse(produit!.zone).success).toBe(true);
    expect(produit!.zone.largeur).toBe(160);
    expect(produit!.zone.hauteur).toBe(120);
    expect(produit!.zone.typeMime).toBe("image/webp");
  }, 30_000);

  it("refuse plutôt que de forcer le contrat quand le cadre est trop grand", async () => {
    const cote = COTE_MAX_RECADRAGE + 1;
    expect(await recadrerPour(page(cote + 10, cote + 10), candidat({ x: 0, y: 0, l: cote, h: 10 }))).toBeUndefined();
    expect(await recadrerPour(page(cote + 10, cote + 10), candidat({ x: 0, y: 0, l: 10, h: cote }))).toBeUndefined();
  }, 30_000);

  it("refuse un cadre vide", async () => {
    expect(await recadrerPour(page(800, 2000), candidat({ x: 0, y: 0, l: 0, h: 120 }))).toBeUndefined();
  }, 30_000);

  it("porte l'intervalle que la séquence autorise, quand on le connaît", async () => {
    const produit = await recadrerPour(page(800, 2000), candidat({ x: 0, y: 0, l: 160, h: 120 }), { min: 180, max: 195 });
    expect(produit!.zone.attendu).toEqual({ min: 180, max: 195 });
  }, 30_000);
});

describe("l'empreinte identifie l'image, pas son emplacement", () => {
  it("rend la même clef pour les mêmes octets", () => {
    const octets = Buffer.from("de l'encre");
    expect(empreinteDuRecadrage(octets)).toBe(empreinteDuRecadrage(Buffer.from("de l'encre")));
    expect(empreinteDuRecadrage(octets)).toHaveLength(32);
  });

  it("rend une clef différente pour des octets différents", () => {
    expect(empreinteDuRecadrage(Buffer.from("a"))).not.toBe(empreinteDuRecadrage(Buffer.from("b")));
  });

  it("deux recadrages identiques ne se payeront qu'une fois", async () => {
    const image = page(800, 2000);
    const un = await recadrerPour(image, candidat({ x: 0, y: 0, l: 160, h: 120 }));
    const deux = await recadrerPour(image, candidat({ x: 0, y: 0, l: 160, h: 120 }));
    expect(un!.zone.empreinte).toBe(deux!.zone.empreinte);
  }, 30_000);

  it("et deux recadrages différents ne se confondent pas", async () => {
    const image = page(800, 2000);
    const un = await recadrerPour(image, candidat({ x: 0, y: 0, l: 160, h: 120 }));
    const deux = await recadrerPour(image, candidat({ x: 0, y: 500, l: 160, h: 120 }));
    expect(un!.zone.empreinte).not.toBe(deux!.zone.empreinte);
  }, 30_000);
});
