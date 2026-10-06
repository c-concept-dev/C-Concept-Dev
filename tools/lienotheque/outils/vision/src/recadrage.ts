import { createHash } from "node:crypto";
import { COTE_MAX_RECADRAGE, OCTETS_MAX_RECADRAGE, type ZoneAlire } from "@lienotheque/contrats";
import { agrandir, type ImageGrise, encoderWebp, recadrer, type Boite } from "@lienotheque/images";
import type { Candidat } from "./candidats.js";

/** Du candidat à ce qui part sur le réseau (OUT-08).
 *
 *  Jamais réduite : réduire enlève ce qu'on est venu chercher. Agrandie, en revanche, quand la
 *  recette le demande — et c'est une mesure qui l'a imposé contre mon propre plan. Agrandir
 *  n'ajoute aucune information, mais un repère de 80 pixels ne fait que deux tuiles sur deux pour
 *  un modèle, et à cette taille il perd des chiffres : 15 pavés justes sur 18 à l'échelle
 *  d'origine, 18 sur 18 au double.
 *
 *  Et au plus juste : ce qui part est le pavé d'un repère, une marge claire autour. Le contrat le
 *  garantit — plus de 1024 px de côté est refusé —, et sur F4 cette fonction s'arrête à moins de
 *  250, soit un quart du plafond. */

/** Empreinte d'un recadrage : elle identifie l'image, pas son emplacement.
 *
 *  Deux repères dont le recadrage donne les mêmes pixels donnent la même empreinte et ne se
 *  payent qu'une fois. Et c'est ce qui rend un rejeu identique : la réponse est gardée sous
 *  cette clef, et relire le lot ne rappelle personne. */
export function empreinteDuRecadrage(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex").slice(0, 32);
}

/** Gris vers RVBA : les codecs ne connaissent que le RVBA. */
export function rvbaDepuisGris(image: ImageGrise): { data: Uint8ClampedArray; width: number; height: number; colorSpace: "srgb" } {
  const data = new Uint8ClampedArray(image.largeur * image.hauteur * 4);
  for (let rang = 0; rang < image.pixels.length; rang += 1) {
    const ton = image.pixels[rang]!;
    const base = rang * 4;
    data[base] = ton;
    data[base + 1] = ton;
    data[base + 2] = ton;
    data[base + 3] = 255;
  }
  return { data, width: image.largeur, height: image.hauteur, colorSpace: "srgb" };
}

export type RecadrageProduit = {
  readonly candidat: Candidat;
  readonly zone: ZoneAlire;
  readonly octets: Buffer;
};

/** Recadre, encode et empreinte. Rend `undefined` quand le résultat ne tient pas dans ce qu'on
 *  accepte d'envoyer — mieux vaut une zone en moins qu'un contrat forcé. */
export async function recadrerPour(
  image: ImageGrise,
  candidat: Candidat,
  attendu?: { min: number; max: number },
  agrandissement = 1,
): Promise<RecadrageProduit | undefined> {
  const boite: Boite = candidat.recadrage;
  if (boite.l <= 0 || boite.h <= 0) return undefined;
  if (boite.l * agrandissement > COTE_MAX_RECADRAGE || boite.h * agrandissement > COTE_MAX_RECADRAGE) return undefined;

  const decoupe = recadrer(image, boite);
  if (decoupe.largeur === 0 || decoupe.hauteur === 0) return undefined;
  // On découpe d'abord, on agrandit ensuite : agrandir la page entière coûterait quatre fois sa
  // mémoire pour n'en garder qu'un millième.
  const vue = agrandissement === 1 ? decoupe : agrandir(decoupe, agrandissement);

  // Sans perte : on envoie lire des chiffres de trente pixels de haut, et un codec qui lisse
  // les bords enlève précisément ce qui les distingue.
  const octets = await encoderWebp(rvbaDepuisGris(vue), { lossless: 1 });
  if (octets.length > OCTETS_MAX_RECADRAGE) return undefined;

  return {
    candidat,
    octets,
    zone: {
      empreinte: empreinteDuRecadrage(octets),
      image: octets.toString("base64"),
      typeMime: "image/webp",
      largeur: vue.largeur,
      hauteur: vue.hauteur,
      cherche: candidat.cherche ?? "numero",
      ...(attendu === undefined ? {} : { attendu }),
    },
  };
}
