import { LARGEURS_DERIVE, PLAFONDS_DERIVE, type Derive, type Empreinte } from "@lienotheque/contrats";
import { encoderAvif, encoderWebp, redimensionner, type ImageRvba } from "@lienotheque/images";

/** Générateur de dérivés (OUT-04, OPT-05).
 *
 *  Trois dérivés sont produits à l'ingestion : la vignette, l'aperçu et la forme d'onde. La
 *  loupe n'en est pas : elle est recadrée à la volée dans l'image d'origine, et jamais stockée —
 *  c'est pour cela qu'aucune fonction ici ne la fabrique. */

export type DeriveProduit = { readonly derive: Derive; readonly octets: Buffer };

/** Hauteur qui garde les proportions, jamais nulle. */
const hauteurPour = (image: ImageRvba, largeur: number): number =>
  Math.max(1, Math.round((image.height * largeur) / image.width));

/** Qualités tentées, de la meilleure à la plus basse. On s'arrête à la première qui tient sous
 *  le plafond : une vignette trop lourde n'est pas une vignette. */
const QUALITES = [82, 72, 62, 52, 42, 32, 22, 12] as const;

export type OptionsImage = {
  readonly format?: "webp" | "avif";
  /** Largeur visée ; par défaut celle de l'espèce (OPT-05). */
  readonly largeur?: number;
};

async function encoder(image: ImageRvba, format: "webp" | "avif", qualite: number): Promise<Buffer> {
  return format === "avif" ? encoderAvif(image, { cqLevel: Math.round(63 - (qualite * 63) / 100) }) : encoderWebp(image, { quality: qualite });
}

/** Réduit puis encode, en descendant la qualité tant que le plafond n'est pas tenu. */
async function imageDerivee(
  espece: "vignette" | "apercu",
  image: ImageRvba,
  source: Empreinte,
  options: OptionsImage = {},
): Promise<DeriveProduit> {
  const format = options.format ?? "webp";
  const largeur = Math.min(options.largeur ?? LARGEURS_DERIVE[espece], image.width);
  const hauteur = hauteurPour(image, largeur);
  const reduite = largeur === image.width && hauteur === image.height ? image : await redimensionner(image, largeur, hauteur);
  const plafond = PLAFONDS_DERIVE[espece];

  let octets = await encoder(reduite, format, QUALITES[0]);
  if (plafond !== undefined)
    for (const qualite of QUALITES.slice(1)) {
      if (octets.length <= plafond) break;
      octets = await encoder(reduite, format, qualite);
    }

  if (plafond !== undefined && octets.length > plafond)
    throw new Error(
      `Dérivé « ${espece} » encore à ${octets.length} octets à la qualité la plus basse (plafond ${plafond}) : ` +
        "cette image ne se comprime pas, il faut descendre sa taille",
    );

  return {
    octets,
    derive: {
      espece,
      source,
      octets: octets.length,
      largeur,
      hauteur,
      typeMime: format === "avif" ? "image/avif" : "image/webp",
    },
  };
}

export const vignette = (image: ImageRvba, source: Empreinte, options: OptionsImage = {}): Promise<DeriveProduit> =>
  imageDerivee("vignette", image, source, options);

export const apercu = (image: ImageRvba, source: Empreinte, options: OptionsImage = {}): Promise<DeriveProduit> =>
  imageDerivee("apercu", image, source, options);

/** Image RVBA tirée d'une page 1 bit, bit levé = encre. Les codecs ne connaissent que le RVBA. */
export function rvbaDepuisBilevel(donnees: Uint8Array, largeur: number, hauteur: number): ImageRvba {
  const parLigne = Math.ceil(largeur / 8);
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1) {
      const encre = (donnees[y * parLigne + (x >> 3)]! >> (7 - (x & 7))) & 1;
      const ton = encre === 1 ? 0 : 255;
      const base = (y * largeur + x) * 4;
      data[base] = ton;
      data[base + 1] = ton;
      data[base + 2] = ton;
      data[base + 3] = 255;
    }
  return { data, width: largeur, height: hauteur, colorSpace: "srgb" };
}

/** En-tête de la forme d'onde : quatre lettres, une version, le nombre de points. */
export const SIGNATURE_FORME_ONDE = "LNFO";
const ENTETE = 8;

/** Forme d'onde (OPT-05) : un creux et une crête par tranche, chacun sur un octet signé.
 *  Trois mille points tiennent largement sous les 10 Ko, et suffisent à dessiner une piste. */
export const POINTS_FORME_ONDE = 3072;

export function formeOnde(echantillons: Float32Array, points = POINTS_FORME_ONDE): Buffer {
  if (echantillons.length === 0) throw new Error("Aucun échantillon : rien à dessiner");
  const retenus = Math.min(points, echantillons.length);
  const sortie = Buffer.alloc(ENTETE + retenus * 2);
  sortie.write(SIGNATURE_FORME_ONDE, 0, "latin1");
  sortie.writeUInt8(1, 4);
  sortie.writeUInt8(0, 5);
  sortie.writeUInt16LE(retenus, 6);

  const parPoint = echantillons.length / retenus;
  for (let point = 0; point < retenus; point += 1) {
    const debut = Math.floor(point * parPoint);
    const fin = Math.max(debut + 1, Math.floor((point + 1) * parPoint));
    let creux = 0;
    let crete = 0;
    for (let rang = debut; rang < fin && rang < echantillons.length; rang += 1) {
      const valeur = echantillons[rang]!;
      if (valeur < creux) creux = valeur;
      if (valeur > crete) crete = valeur;
    }
    sortie.writeInt8(Math.max(-127, Math.round(creux * 127)), ENTETE + point * 2);
    sortie.writeInt8(Math.min(127, Math.round(crete * 127)), ENTETE + point * 2 + 1);
  }
  return sortie;
}

export const deriveFormeOnde = (octets: Buffer, source: Empreinte): Derive => ({
  espece: "forme_onde",
  source,
  octets: octets.length,
  typeMime: "application/vnd.lienotheque.forme-onde",
});

/** PCM d'un WAV sans compression, ramené à un canal et à l'intervalle [-1, 1].
 *
 *  La forme d'onde n'a besoin que de PCM. D'où il vient ne la regarde pas : l'application de
 *  bureau le tirera de son décodeur d'hôte, comme le dépôt tire sa base de son hôte. */
export function pcmDeWav(donnees: Buffer): { echantillons: Float32Array; frequence: number; canaux: number } {
  if (donnees.toString("latin1", 0, 4) !== "RIFF" || donnees.toString("latin1", 8, 12) !== "WAVE")
    throw new Error("Ce n'est pas un WAV");

  let position = 12;
  let canaux = 0;
  let frequence = 0;
  let bits = 0;
  let format = 1;

  while (position + 8 <= donnees.length) {
    const nom = donnees.toString("latin1", position, position + 4);
    const taille = donnees.readUInt32LE(position + 4);
    const corps = position + 8;

    if (nom === "fmt ") {
      format = donnees.readUInt16LE(corps);
      canaux = donnees.readUInt16LE(corps + 2);
      frequence = donnees.readUInt32LE(corps + 4);
      bits = donnees.readUInt16LE(corps + 14);
    } else if (nom === "data") {
      if (canaux === 0) throw new Error("Bloc « data » avant « fmt »");
      if (format !== 1 || bits !== 16) throw new Error(`WAV non géré : format ${format}, ${bits} bits`);
      const total = Math.floor(Math.min(taille, donnees.length - corps) / 2);
      const parCanal = Math.floor(total / canaux);
      const echantillons = new Float32Array(parCanal);
      for (let rang = 0; rang < parCanal; rang += 1) {
        let somme = 0;
        for (let canal = 0; canal < canaux; canal += 1) somme += donnees.readInt16LE(corps + (rang * canaux + canal) * 2);
        echantillons[rang] = somme / canaux / 32_768;
      }
      return { echantillons, frequence, canaux };
    }
    position = corps + taille + (taille % 2);
  }
  throw new Error("WAV sans bloc « data »");
}
