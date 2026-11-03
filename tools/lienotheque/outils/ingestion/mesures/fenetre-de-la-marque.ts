/** Ce que le lecteur de marque a réellement sous les yeux.
 *
 *  Un endroit proposé se lit dans une fenêtre : la boîte de l'apparition, élargie d'un dixième.
 *  Quand la lecture rend n'importe quoi, la question précède le critère — **y avait-il un nombre
 *  dans la fenêtre ?** Ce banc l'écrit en image, sans reconnaissance, pour qu'on tranche à l'œil.
 *
 *  Usage : fenetre-de-la-marque.ts <document.pdf> <dossier de sortie> <largeur %> <hauteur %> <abscisse %> [combien]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { enGris, formesSombres, type ImageGrise } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";

const CRC: number[] = Array.from({ length: 256 }, (_, place) => {
  let valeur = place;
  for (let tour = 0; tour < 8; tour += 1) valeur = valeur & 1 ? 0xedb8_8320 ^ (valeur >>> 1) : valeur >>> 1;
  return valeur >>> 0;
});
const crc32 = (octets: Buffer): number => {
  let valeur = 0xffff_ffff;
  for (const octet of octets) valeur = CRC[(valeur ^ octet) & 0xff]! ^ (valeur >>> 8);
  return (valeur ^ 0xffff_ffff) >>> 0;
};
const bloc = (type: string, corps: Buffer): Buffer => {
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(corps.length);
  const nomEtCorps = Buffer.concat([Buffer.from(type, "ascii"), corps]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(nomEtCorps));
  return Buffer.concat([taille, nomEtCorps, somme]);
};
/** Un PNG en niveaux de gris, sans filtrage. */
function png(pixels: Uint8Array, largeur: number, hauteur: number): Buffer {
  const lignes = Buffer.alloc(hauteur * (1 + largeur));
  for (let y = 0; y < hauteur; y += 1) {
    lignes[y * (1 + largeur)] = 0;
    lignes.set(pixels.subarray(y * largeur, (y + 1) * largeur), y * (1 + largeur) + 1);
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8;
  entete[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", deflateSync(lignes, { level: 6 })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

const pdf = process.argv[2]!;
const sortie = process.argv[3]!;
const largeurCherchee = Number.parseFloat(process.argv[4]!) / 100;
const hauteurCherchee = Number.parseFloat(process.argv[5]!) / 100;
const abscisseCherchee = Number.parseFloat(process.argv[6]!) / 100;
const combien = Number.parseInt(process.argv[7] ?? "4", 10);
const LARGEUR_DE_RENDU = 1800;
const RAPPORT = 1.5;
const MEME_ABSCISSE = 0.03;

mkdirSync(sortie, { recursive: true });
const recadrer = (image: ImageGrise, x: number, y: number, l: number, h: number): Uint8Array => {
  const coupe = new Uint8Array(l * h);
  for (let ligne = 0; ligne < h; ligne += 1)
    coupe.set(image.pixels.subarray((y + ligne) * image.largeur + x, (y + ligne) * image.largeur + x + l), ligne * l);
  return coupe;
};

const rendu = await ouvrirRenduPdf(pdf);
let ecrites = 0;
try {
  for (let numero = 1; numero <= rendu.nombreDePages && ecrites < combien; numero += 1) {
    const image = enGris(await rendu.page(numero, LARGEUR_DE_RENDU));
    for (const { boite } of formesSombres(image)) {
      const l = boite.l / image.largeur;
      const h = boite.h / image.hauteur;
      const x = boite.x / image.largeur;
      const taille =
        Math.max(l, largeurCherchee) <= Math.min(l, largeurCherchee) * RAPPORT &&
        Math.max(h, hauteurCherchee) <= Math.min(h, hauteurCherchee) * RAPPORT;
      if (!taille || Math.abs(x - abscisseCherchee) > MEME_ABSCISSE) continue;
      // La fenêtre du lecteur : la boîte élargie d'un dixième, exactement comme la voie la calcule.
      const fx = Math.max(0, Math.round(boite.x - boite.l * 0.1));
      const fy = Math.max(0, Math.round(boite.y - boite.h * 0.1));
      const fl = Math.min(image.largeur - fx, Math.round(boite.l * 1.2));
      const fh = Math.min(image.hauteur - fy, Math.round(boite.h * 1.2));
      const chemin = join(sortie, `fenetre-p${String(numero).padStart(3, "0")}.png`);
      writeFileSync(chemin, png(recadrer(image, fx, fy, fl, fh), fl, fh));
      console.log(`${chemin}  ${fl}×${fh} px  (page ${numero}, ${(l * 100).toFixed(1)}×${(h * 100).toFixed(1)} % vers ${(x * 100).toFixed(0)} %)`);
      ecrites += 1;
      break;
    }
  }
} finally {
  await rendu.fermer();
}
