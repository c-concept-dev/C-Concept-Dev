// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Derive, PLAFONDS_DERIVE } from "@lienotheque/contrats";
import {
  POINTS_FORME_ONDE,
  SIGNATURE_FORME_ONDE,
  apercu,
  deriveFormeOnde,
  formeOnde,
  pcmDeWav,
  rvbaDepuisBilevel,
  vignette,
  type ImageRvba,
} from "../src/index.js";

const EMPREINTE = "c".repeat(64);

/** Une image colorée et bruitée : un aplat se compresserait trop bien pour éprouver quoi que ce soit. */
function imageBruitee(largeur: number, hauteur: number): ImageRvba {
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  let graine = 7;
  for (let rang = 0; rang < largeur * hauteur; rang += 1) {
    graine = (graine * 1_103_515_245 + 12_345) % 2_147_483_648;
    const base = rang * 4;
    data[base] = graine % 256;
    data[base + 1] = (graine >> 8) % 256;
    data[base + 2] = (graine >> 16) % 256;
    data[base + 3] = 255;
  }
  return { data, width: largeur, height: hauteur, colorSpace: "srgb" };
}

/** Une page vraisemblable : fond clair, traits sombres. Ce que l'optimiseur voit vraiment. */
function imagePage(largeur: number, hauteur: number): ImageRvba {
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1) {
      const trait = y % 23 < 2 && x % 3 < 2;
      const ton = trait ? 30 : 245;
      const base = (y * largeur + x) * 4;
      data[base] = ton;
      data[base + 1] = ton;
      data[base + 2] = ton;
      data[base + 3] = 255;
    }
  return { data, width: largeur, height: hauteur, colorSpace: "srgb" };
}

describe("vignette et aperçu (OUT-04, OPT-05)", () => {
  it("réduit la vignette à 320 px de large et garde les proportions", async () => {
    const { derive } = await vignette(imageBruitee(2465, 3520), EMPREINTE);
    expect(derive.largeur).toBe(320);
    expect(derive.hauteur).toBe(Math.round((3520 * 320) / 2465));
  }, 120_000);

  it("tient sous 25 Ko même sur une image qui résiste à la compression", async () => {
    const { derive, octets } = await vignette(imageBruitee(2465, 3520), EMPREINTE);
    expect(octets.length).toBeLessThanOrEqual(PLAFONDS_DERIVE.vignette!);
    expect(Derive.parse(derive).octets).toBe(octets.length);
  }, 120_000);

  it("porte l'aperçu à 1 200 px, sans plafond d'octets", async () => {
    const { derive } = await apercu(imageBruitee(2465, 3520), EMPREINTE);
    expect(derive.largeur).toBe(1200);
    expect(Derive.safeParse(derive).success).toBe(true);
  }, 180_000);

  it("n'agrandit jamais une image plus petite que la cible", async () => {
    const { derive } = await vignette(imageBruitee(120, 90), EMPREINTE);
    expect(derive.largeur).toBe(120);
    expect(derive.hauteur).toBe(90);
  }, 120_000);

  it("sait sortir en AVIF comme en WebP", async () => {
    const enWebp = await vignette(imageBruitee(400, 300), EMPREINTE);
    const enAvif = await vignette(imagePage(400, 300), EMPREINTE, { format: "avif" });
    expect(enWebp.derive.typeMime).toBe("image/webp");
    expect(enAvif.derive.typeMime).toBe("image/avif");
  }, 180_000);

  it("tient le plafond dans les deux formats, même sur du bruit pur", async () => {
    // Le bruit est le pire cas : aucun codec n'y trouve de structure. L'échelle de qualité
    // descend jusqu'à ce que le plafond tienne, et c'est elle qu'on éprouve ici.
    for (const format of ["webp", "avif"] as const) {
      const { octets } = await vignette(imageBruitee(2465, 3520), EMPREINTE, { format });
      expect(octets.length, format).toBeLessThanOrEqual(PLAFONDS_DERIVE.vignette!);
    }
  }, 240_000);
});

describe("page 1 bit vers pixels", () => {
  it("rend l'encre en noir et le fond en blanc, opaque", () => {
    const donnees = Uint8Array.from([0b10100000]);
    const image = rvbaDepuisBilevel(donnees, 4, 1);
    expect([...image.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...image.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
    expect(image.width).toBe(4);
  });
});

describe("forme d'onde (OPT-05)", () => {
  const sinus = (longueur: number): Float32Array =>
    Float32Array.from({ length: longueur }, (_, rang) => Math.sin((rang / 50) * Math.PI));

  it("tient sous 10 Ko", () => {
    const octets = formeOnde(sinus(44_100 * 60));
    expect(octets.length).toBeLessThanOrEqual(PLAFONDS_DERIVE.forme_onde!);
    expect(Derive.safeParse(deriveFormeOnde(octets, EMPREINTE)).success).toBe(true);
  });

  it("porte sa signature, sa version et son nombre de points", () => {
    const octets = formeOnde(sinus(100_000));
    expect(octets.toString("latin1", 0, 4)).toBe(SIGNATURE_FORME_ONDE);
    expect(octets.readUInt8(4)).toBe(1);
    expect(octets.readUInt16LE(6)).toBe(POINTS_FORME_ONDE);
    expect(octets.length).toBe(8 + POINTS_FORME_ONDE * 2);
  });

  it("garde un creux et une crête par tranche", () => {
    const octets = formeOnde(sinus(100_000), 16);
    const creux: number[] = [];
    const cretes: number[] = [];
    for (let point = 0; point < 16; point += 1) {
      creux.push(octets.readInt8(8 + point * 2));
      cretes.push(octets.readInt8(8 + point * 2 + 1));
    }
    expect(Math.min(...creux)).toBeLessThan(-100);
    expect(Math.max(...cretes)).toBeGreaterThan(100);
    for (let point = 0; point < 16; point += 1) expect(creux[point]!).toBeLessThanOrEqual(cretes[point]!);
  });

  it("ne rend jamais plus de points qu'il n'a d'échantillons", () => {
    expect(formeOnde(sinus(10), 3072).readUInt16LE(6)).toBe(10);
  });

  it("refuse de dessiner le silence absolu d'un fichier vide", () => {
    expect(() => formeOnde(new Float32Array(0))).toThrow(/Aucun échantillon/);
  });
});

describe("PCM d'un WAV", () => {
  /** Un WAV 16 bits, écrit à la main : la lecture doit retrouver exactement ces valeurs. */
  function wav(echantillons: readonly number[], canaux = 1, frequence = 44_100): Buffer {
    const donnees = Buffer.alloc(echantillons.length * 2);
    echantillons.forEach((valeur, rang) => donnees.writeInt16LE(valeur, rang * 2));
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(1, 0);
    fmt.writeUInt16LE(canaux, 2);
    fmt.writeUInt32LE(frequence, 4);
    fmt.writeUInt32LE(frequence * canaux * 2, 8);
    fmt.writeUInt16LE(canaux * 2, 12);
    fmt.writeUInt16LE(16, 14);

    const bloc = (nom: string, corps: Buffer): Buffer => {
      const entete = Buffer.alloc(8);
      entete.write(nom, 0, "latin1");
      entete.writeUInt32LE(corps.length, 4);
      return Buffer.concat([entete, corps]);
    };
    const corps = Buffer.concat([Buffer.from("WAVE", "latin1"), bloc("fmt ", fmt), bloc("data", donnees)]);
    const entete = Buffer.alloc(8);
    entete.write("RIFF", 0, "latin1");
    entete.writeUInt32LE(corps.length, 4);
    return Buffer.concat([entete, corps]);
  }

  it("rend les échantillons ramenés entre -1 et 1", () => {
    const lu = pcmDeWav(wav([0, 16_384, -16_384, 32_767]));
    expect(lu.frequence).toBe(44_100);
    expect(lu.canaux).toBe(1);
    expect(lu.echantillons[1]).toBeCloseTo(0.5, 4);
    expect(lu.echantillons[2]).toBeCloseTo(-0.5, 4);
  });

  it("mélange les canaux d'un stéréo", () => {
    const lu = pcmDeWav(wav([32_767, -32_767, 16_384, 16_384], 2));
    expect(lu.canaux).toBe(2);
    expect(lu.echantillons).toHaveLength(2);
    expect(lu.echantillons[0]).toBeCloseTo(0, 3);
    expect(lu.echantillons[1]).toBeCloseTo(0.5, 3);
  });

  it("refuse ce qui n'est pas un WAV, et le dit", () => {
    expect(() => pcmDeWav(Buffer.from("pas du tout un wav du tout"))).toThrow(/pas un WAV/);
  });
});
