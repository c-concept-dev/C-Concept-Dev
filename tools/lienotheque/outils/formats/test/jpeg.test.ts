// @vitest-environment node
import { describe, expect, it } from "vitest";
import { causeJpegFatalAvantDecodage, causeJpegNonDirect, composantesJpeg, jpegComplet } from "../src/index.js";

function jpegAvec(composantes: number, complet = true): Uint8Array {
  const octets = [
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b + composantes * 3,
    0x08,
    0x00,
    0x10,
    0x00,
    0x10,
    composantes,
  ];
  for (let index = 0; index < composantes; index += 1) octets.push(index + 1, 0x11, 0x00);
  if (complet) octets.push(0xff, 0xd9);
  return Uint8Array.from(octets);
}

describe("préflight des JPEG extraits d'un PDF", () => {
  it("refuse comme incomplet un flux sans marque de fin", () => {
    const jpeg = jpegAvec(3, false);
    expect(jpegComplet(jpeg)).toBe(false);
    expect(composantesJpeg(jpeg)).toBe(3);
    expect(causeJpegNonDirect(jpeg)).toBe("flux JPEG incomplet");
    expect(causeJpegFatalAvantDecodage(jpeg)).toBe("flux JPEG incomplet et trop court pour être décodé sûrement");
  });

  it("reconnaît les trois composantes d'un JPEG RVB entier", () => {
    const jpeg = jpegAvec(3);
    expect(jpegComplet(jpeg)).toBe(true);
    expect(composantesJpeg(jpeg)).toBe(3);
    expect(causeJpegNonDirect(jpeg)).toBeUndefined();
    expect(causeJpegFatalAvantDecodage(jpeg)).toBeUndefined();
  });

  it("reconnaît les quatre composantes d'un JPEG CMJN avant le décodeur", () => {
    const jpeg = jpegAvec(4);
    expect(jpegComplet(jpeg)).toBe(true);
    expect(composantesJpeg(jpeg)).toBe(4);
    expect(causeJpegNonDirect(jpeg)).toBe("JPEG à 4 composantes colorimétriques");
    expect(causeJpegFatalAvantDecodage(jpeg)).toBe("JPEG à 4 composantes colorimétriques");
  });

  it("ne condamne pas un long JPEG sans marque de fin que le codec sait tolérer", () => {
    const court = jpegAvec(3, false);
    const long = Uint8Array.from([...court, ...Array(2_000).fill(0)]);
    expect(jpegComplet(long)).toBe(false);
    expect(causeJpegFatalAvantDecodage(long)).toBeUndefined();
  });
});
