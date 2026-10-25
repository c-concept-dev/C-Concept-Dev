// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifierJpegAvantDecodage } from "../src/index.js";

function jpeg(composantes: number, complet = true): Uint8Array {
  const octets = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, composantes];
  for (let index = 0; index < composantes; index += 1) octets.push(index + 1, 0x11, 0x00);
  if (complet) octets.push(0xff, 0xd9);
  return Uint8Array.from(octets);
}

describe("garde centrale du décodeur JPEG", () => {
  it("nomme un flux incomplet avant l'appel au WebAssembly", () => {
    expect(() => verifierJpegAvantDecodage(jpeg(3, false))).toThrow("flux JPEG incomplet");
  });

  it("nomme un flux à quatre composantes avant l'appel au WebAssembly", () => {
    expect(() => verifierJpegAvantDecodage(jpeg(4))).toThrow("JPEG à 4 composantes colorimétriques");
  });

  it("laisse passer un JPEG RVB entier", () => {
    expect(() => verifierJpegAvantDecodage(jpeg(3))).not.toThrow();
  });

  it("laisse le codec tenter un long JPEG RVB sans marque de fin", () => {
    const long = Uint8Array.from([...jpeg(3, false), ...Array(2_000).fill(0)]);
    expect(() => verifierJpegAvantDecodage(long)).not.toThrow();
  });
});
