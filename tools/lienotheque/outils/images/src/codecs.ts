import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Amorçage des codecs @jsquash hors d'un navigateur.
 *
 *  Ces modules vont chercher leur WebAssembly par une adresse ; dans l'application comme dans les
 *  tests, il n'y a pas d'adresse à suivre, seulement un fichier. On le lit, on le compile, on le
 *  leur donne. Un codec n'est amorcé qu'une fois. */

export type ImageRvba = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb";
};

const exige = createRequire(import.meta.url);

const racine = (paquet: string): string => dirname(exige.resolve(`${paquet}/package.json`));

const compile = async (chemin: string): Promise<WebAssembly.Module> =>
  WebAssembly.compile(await readFile(chemin));

const amorces = new Map<string, Promise<unknown>>();
const uneSeuleFois = <T>(clef: string, faire: () => Promise<T>): Promise<T> => {
  const dejaLa = amorces.get(clef) as Promise<T> | undefined;
  if (dejaLa !== undefined) return dejaLa;
  const en_cours = faire();
  amorces.set(clef, en_cours);
  return en_cours;
};

export async function encoderWebp(image: ImageRvba, options: Record<string, unknown> = {}): Promise<Buffer> {
  const encodeur = await uneSeuleFois("webp", async () => {
    const module = await import("@jsquash/webp/encode.js");
    await module.init(await compile(join(racine("@jsquash/webp"), "codec/enc/webp_enc.wasm")));
    return module.default;
  });
  return Buffer.from(await encodeur(image as never, options as never));
}

export async function encoderAvif(image: ImageRvba, options: Record<string, unknown> = {}): Promise<Buffer> {
  const encodeur = await uneSeuleFois("avif", async () => {
    const module = await import("@jsquash/avif/encode.js");
    await module.init(await compile(join(racine("@jsquash/avif"), "codec/enc/avif_enc.wasm")));
    return module.default;
  });
  return Buffer.from(await encodeur(image as never, options as never));
}

export async function redimensionner(image: ImageRvba, largeur: number, hauteur: number): Promise<ImageRvba> {
  const outil = await uneSeuleFois("resize", async () => {
    const module = await import("@jsquash/resize");
    await module.initResize(await compile(join(racine("@jsquash/resize"), "lib/resize/pkg/squoosh_resize_bg.wasm")));
    return module.default;
  });
  return (await outil(image as never, { width: largeur, height: hauteur } as never)) as unknown as ImageRvba;
}

/** Décodage JPEG : les pages numérisées d'un PDF en sont souvent faites, et un dérivé se tire
 *  de pixels, pas d'un train d'octets. L'original, lui, n'est jamais redécodé pour être rangé
 *  (OPT-04) : il est repris tel quel. */
export async function decoderJpeg(octets: Uint8Array): Promise<ImageRvba> {
  const decodeur = await uneSeuleFois("jpeg", async () => {
    const module = await import("@jsquash/jpeg/decode.js");
    await module.init(await compile(join(racine("@jsquash/jpeg"), "codec/dec/mozjpeg_dec.wasm")));
    return module.default;
  });
  const image = (await decodeur(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer)) as unknown as ImageRvba;
  return image;
}
