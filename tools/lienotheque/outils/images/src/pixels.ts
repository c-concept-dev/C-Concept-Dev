import type { ImageRvba } from "./codecs.js";

/** Opérations sur les pixels dont le lecteur de repères a besoin : passer en gris, recadrer,
 *  seuiller, trouver la boîte de ce qui est sombre, écrire un fichier qu'un moteur d'OCR sait
 *  ouvrir. Rien de plus — chacune tient en quelques lignes et se vérifie à la main. */

/** Image en niveaux de gris, un octet par pixel. */
export type ImageGrise = { readonly largeur: number; readonly hauteur: number; readonly pixels: Uint8Array };

/** Rectangle en pixels, bord droit et bas exclus. */
export type Boite = { readonly x: number; readonly y: number; readonly l: number; readonly h: number };

/** Luminance perçue, pondérée comme le fait tout le monde depuis la télévision en couleurs. */
export function enGris(image: ImageRvba): ImageGrise {
  const pixels = new Uint8Array(image.width * image.height);
  for (let rang = 0; rang < pixels.length; rang += 1) {
    const base = rang * 4;
    pixels[rang] = Math.round(0.299 * image.data[base]! + 0.587 * image.data[base + 1]! + 0.114 * image.data[base + 2]!);
  }
  return { largeur: image.width, hauteur: image.height, pixels };
}

/** Recadre, en rabotant ce qui dépasse plutôt qu'en se plaignant : un repère cherché près d'un
 *  bord donne souvent une boîte qui déborde. */
export function recadrer(image: ImageGrise, boite: Boite): ImageGrise {
  const x = Math.max(0, Math.min(image.largeur, Math.round(boite.x)));
  const y = Math.max(0, Math.min(image.hauteur, Math.round(boite.y)));
  const l = Math.max(0, Math.min(image.largeur - x, Math.round(boite.l)));
  const h = Math.max(0, Math.min(image.hauteur - y, Math.round(boite.h)));
  const pixels = new Uint8Array(l * h);
  for (let ligne = 0; ligne < h; ligne += 1)
    pixels.set(image.pixels.subarray((y + ligne) * image.largeur + x, (y + ligne) * image.largeur + x + l), ligne * l);
  return { largeur: l, hauteur: h, pixels };
}

/** Tout ce qui est sous le seuil devient noir, le reste blanc. */
export function seuiller(image: ImageGrise, seuil: number): ImageGrise {
  const pixels = new Uint8Array(image.pixels.length);
  for (let rang = 0; rang < pixels.length; rang += 1) pixels[rang] = image.pixels[rang]! < seuil ? 0 : 255;
  return { largeur: image.largeur, hauteur: image.hauteur, pixels };
}

export function inverser(image: ImageGrise): ImageGrise {
  const pixels = new Uint8Array(image.pixels.length);
  for (let rang = 0; rang < pixels.length; rang += 1) pixels[rang] = 255 - image.pixels[rang]!;
  return { largeur: image.largeur, hauteur: image.hauteur, pixels };
}

/** Boîte englobante de ce qui est sombre. `undefined` si tout est clair : il n'y a rien à cadrer. */
export function boiteSombre(image: ImageGrise, seuil = 128): Boite | undefined {
  let gauche = image.largeur;
  let haut = image.hauteur;
  let droite = -1;
  let bas = -1;

  for (let y = 0; y < image.hauteur; y += 1)
    for (let x = 0; x < image.largeur; x += 1)
      if (image.pixels[y * image.largeur + x]! < seuil) {
        if (x < gauche) gauche = x;
        if (x > droite) droite = x;
        if (y < haut) haut = y;
        if (y > bas) bas = y;
      }

  return droite < 0 ? undefined : { x: gauche, y: haut, l: droite - gauche + 1, h: bas - haut + 1 };
}

/** Agrandit par un facteur entier, en répétant les pixels. Un moteur d'OCR lit mieux un petit
 *  chiffre agrandi, et répéter ne crée aucun détail qui n'y était pas. */
export function agrandir(image: ImageGrise, facteur: number): ImageGrise {
  if (!Number.isInteger(facteur) || facteur < 1) throw new Error("Le facteur d'agrandissement est un entier d'au moins 1");
  if (facteur === 1) return image;
  const largeur = image.largeur * facteur;
  const hauteur = image.hauteur * facteur;
  const pixels = new Uint8Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    const source = Math.floor(y / facteur) * image.largeur;
    for (let x = 0; x < largeur; x += 1) pixels[y * largeur + x] = image.pixels[source + Math.floor(x / facteur)]!;
  }
  return { largeur, hauteur, pixels };
}

/** Entoure l'image d'une marge claire : un chiffre collé au bord se lit mal. */
export function border(image: ImageGrise, marge: number, ton = 255): ImageGrise {
  const largeur = image.largeur + marge * 2;
  const hauteur = image.hauteur + marge * 2;
  const pixels = new Uint8Array(largeur * hauteur).fill(ton);
  for (let y = 0; y < image.hauteur; y += 1)
    pixels.set(image.pixels.subarray(y * image.largeur, (y + 1) * image.largeur), (y + marge) * largeur + marge);
  return { largeur, hauteur, pixels };
}

/** PGM binaire (P5) : le format d'image le plus simple qui soit, et que tout moteur d'OCR ouvre.
 *  L'écrire évite d'embarquer un encodeur pour montrer un recadrage à Tesseract. */
export function versPgm(image: ImageGrise): Buffer {
  const entete = Buffer.from(`P5\n${image.largeur} ${image.hauteur}\n255\n`, "latin1");
  return Buffer.concat([entete, Buffer.from(image.pixels)]);
}
