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

/** Réduit par un facteur entier, en prenant un pixel sur `facteur`.
 *
 *  Le pendant d'`agrandir`, et aussi grossier : on ne cherche pas une belle image, on cherche
 *  une image quatre fois plus rapide à sonder. Pour juger de quel côté une page est posée, le
 *  détail ne sert à rien — la disposition du texte suffit, et elle survit à la réduction. */
export function reduire(image: ImageGrise, facteur: number): ImageGrise {
  if (facteur <= 1) return image;
  const largeur = Math.max(1, Math.floor(image.largeur / facteur));
  const hauteur = Math.max(1, Math.floor(image.hauteur / facteur));
  const pixels = new Uint8Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1) pixels[y * largeur + x] = image.pixels[y * facteur * image.largeur + x * facteur]!;
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

/** Quart de tour dans le sens des aiguilles d'une montre. Les photos de livres arrivent posées
 *  dans un sens ou dans un autre ; un quart de tour suffit à les remettre d'aplomb. */
export function tourner(image: ImageGrise, degres: 0 | 90 | 180 | 270): ImageGrise {
  if (degres === 0) return image;
  const { largeur, hauteur, pixels } = image;
  const quartDeTour = degres === 90 || degres === 270;
  const l = quartDeTour ? hauteur : largeur;
  const h = quartDeTour ? largeur : hauteur;
  const sortie = new Uint8Array(pixels.length);

  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1) {
      const ton = pixels[y * largeur + x]!;
      const [xa, ya] =
        degres === 90 ? [hauteur - 1 - y, x] : degres === 180 ? [largeur - 1 - x, hauteur - 1 - y] : [y, largeur - 1 - x];
      sortie[ya * l + xa] = ton;
    }
  return { largeur: l, hauteur: h, pixels: sortie };
}

/** Moyenne des tons d'une colonne. Sert à trouver la pliure d'un livre ouvert : elle est sombre
 *  sur toute la hauteur, là où le papier plonge vers la reliure. */
export function moyennesParColonne(image: ImageGrise): Float64Array {
  const moyennes = new Float64Array(image.largeur);
  for (let x = 0; x < image.largeur; x += 1) {
    let somme = 0;
    for (let y = 0; y < image.hauteur; y += 1) somme += image.pixels[y * image.largeur + x]!;
    moyennes[x] = somme / image.hauteur;
  }
  return moyennes;
}

/** Image intégrale : chaque case porte la somme de tout ce qui est en haut à gauche d'elle.
 *  Elle rend la moyenne d'un rectangle en quatre lectures, quelle que soit sa taille — c'est ce
 *  qui rend une binarisation locale abordable sur une page entière. */
export function imageIntegrale(image: ImageGrise): { sommes: Float64Array; carres: Float64Array } {
  const { largeur, hauteur, pixels } = image;
  const sommes = new Float64Array((largeur + 1) * (hauteur + 1));
  const carres = new Float64Array((largeur + 1) * (hauteur + 1));

  for (let y = 0; y < hauteur; y += 1)
    for (let x = 0; x < largeur; x += 1) {
      const ton = pixels[y * largeur + x]!;
      const ici = (y + 1) * (largeur + 1) + (x + 1);
      const haut = y * (largeur + 1) + (x + 1);
      const gauche = (y + 1) * (largeur + 1) + x;
      const coin = y * (largeur + 1) + x;
      sommes[ici] = ton + sommes[haut]! + sommes[gauche]! - sommes[coin]!;
      carres[ici] = ton * ton + carres[haut]! + carres[gauche]! - carres[coin]!;
    }
  return { sommes, carres };
}

/** Fermeture morphologique du sombre : dilatation puis érosion, voisinage à huit.
 *
 *  Elle recolle ce qu'un seuil a séparé à tort. Un repère imprimé en deux parties — une étiquette
 *  et un chiffre, côte à côte — se lit comme deux formes distinctes tant qu'on ne les a pas
 *  rejointes ; après fermeture, c'en est une seule. L'érosion rend ensuite aux formes leur
 *  épaisseur d'origine, de sorte que rien n'est grossi, seulement réuni. */
export function fermer(image: ImageGrise, passes = 1, seuil = 128): ImageGrise {
  const { largeur, hauteur } = image;
  let sombre = new Uint8Array(image.pixels.length);
  for (let rang = 0; rang < sombre.length; rang += 1) sombre[rang] = image.pixels[rang]! < seuil ? 1 : 0;

  const passer = (source: Uint8Array<ArrayBuffer>, dilater: boolean): Uint8Array<ArrayBuffer> => {
    const sortie = new Uint8Array(source.length);
    for (let y = 0; y < hauteur; y += 1)
      for (let x = 0; x < largeur; x += 1) {
        let voisinSombre = false;
        let voisinClair = false;
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const vx = x + dx;
            const vy = y + dy;
            // Hors cadre : traité comme clair, pour ne pas faire déborder les formes des bords.
            if (vx < 0 || vy < 0 || vx >= largeur || vy >= hauteur) {
              voisinClair = true;
              continue;
            }
            if (source[vy * largeur + vx] === 1) voisinSombre = true;
            else voisinClair = true;
          }
        sortie[y * largeur + x] = dilater ? (voisinSombre ? 1 : 0) : voisinClair ? 0 : 1;
      }
    return sortie;
  };

  for (let fois = 0; fois < passes; fois += 1) sombre = passer(sombre, true);
  for (let fois = 0; fois < passes; fois += 1) sombre = passer(sombre, false);
  const pixels = new Uint8Array(sombre.length);
  for (let rang = 0; rang < pixels.length; rang += 1) pixels[rang] = sombre[rang] === 1 ? 0 : 255;
  return { largeur, hauteur, pixels };
}

/** Une forme sombre d'un seul tenant : sa boîte, et combien de pixels elle occupe dedans. */
export type FormeSombre = { readonly boite: Boite; readonly pixels: number };

/** Toutes les formes sombres d'un seul tenant.
 *
 *  `boiteSombre` cadre *tout* ce qui est sombre : une ligne de portée qui traverse la zone et un
 *  repère voisin n'y font qu'une seule boîte, immense et inutile. Ici on sépare les formes qui ne
 *  se touchent pas, et l'appelant choisit — la plus grosse n'est pas toujours la bonne.
 *
 *  Parcours en largeur, voisinage à huit : deux pixels sombres en diagonale appartiennent au même
 *  trait, et une forme imprimée a toujours quelques pixels de guingois sur ses bords. */
export function formesSombres(image: ImageGrise, seuil = 128): FormeSombre[] {
  const { largeur, hauteur, pixels } = image;
  if (largeur === 0 || hauteur === 0) return [];

  const vus = new Uint8Array(largeur * hauteur);
  const file = new Int32Array(largeur * hauteur);
  const formes: FormeSombre[] = [];

  for (let depart = 0; depart < pixels.length; depart += 1) {
    if (vus[depart] === 1 || pixels[depart]! >= seuil) continue;

    let tete = 0;
    let queue = 0;
    file[queue++] = depart;
    vus[depart] = 1;

    let gauche = largeur;
    let droite = -1;
    let haut = hauteur;
    let bas = -1;
    let taille = 0;

    while (tete < queue) {
      const rang = file[tete++]!;
      const x = rang % largeur;
      const y = (rang - x) / largeur;
      taille += 1;
      if (x < gauche) gauche = x;
      if (x > droite) droite = x;
      if (y < haut) haut = y;
      if (y > bas) bas = y;

      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const vx = x + dx;
          const vy = y + dy;
          if (vx < 0 || vy < 0 || vx >= largeur || vy >= hauteur) continue;
          const voisin = vy * largeur + vx;
          if (vus[voisin] === 1 || pixels[voisin]! >= seuil) continue;
          vus[voisin] = 1;
          file[queue++] = voisin;
        }
    }
    formes.push({ boite: { x: gauche, y: haut, l: droite - gauche + 1, h: bas - haut + 1 }, pixels: taille });
  }
  return formes;
}

/** Boîte de la plus grande forme sombre d'un seul tenant, par le nombre de pixels. */
export function plusGrandeFormeSombre(image: ImageGrise, seuil = 128): Boite | undefined {
  let meilleure: FormeSombre | undefined;
  for (const forme of formesSombres(image, seuil)) if (meilleure === undefined || forme.pixels > meilleure.pixels) meilleure = forme;
  return meilleure?.boite;
}

/** Part de la boîte d'une forme que la forme occupe réellement. Un pavé plein approche 1, un
 *  trait ou une lettre reste bas. */
export const remplissage = (forme: FormeSombre): number => forme.pixels / (forme.boite.l * forme.boite.h);
