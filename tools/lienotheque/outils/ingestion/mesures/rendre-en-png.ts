/** Rendre des pages en PNG, pour les regarder.
 *
 *  Une mesure qui accuse mérite la même défiance qu'une mesure qui rassure : quand un détecteur
 *  dit « je n'ai rien vu », la page rendue dit en deux minutes s'il n'y avait rien à voir.
 *
 *  L'encodage est écrit ici, sans bibliothèque d'image : ce banc n'appartient à aucune chaîne du
 *  produit, et lui ajouter une dépendance pour regarder une page serait payer cher un coup d'œil.
 *
 *  Usage : rendre-en-png.ts <doc.pdf> <dossier de sortie> <pages séparées par des virgules> [largeur]
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
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

/** Un PNG en couleurs vraies, sans filtrage : le plus simple qui soit lisible partout. */
function png(data: Uint8ClampedArray, largeur: number, hauteur: number): Buffer {
  const lignes = Buffer.alloc(hauteur * (1 + largeur * 3));
  for (let y = 0; y < hauteur; y += 1) {
    const depart = y * (1 + largeur * 3);
    lignes[depart] = 0;
    for (let x = 0; x < largeur; x += 1) {
      const source = (y * largeur + x) * 4;
      const cible = depart + 1 + x * 3;
      lignes[cible] = data[source]!;
      lignes[cible + 1] = data[source + 1]!;
      lignes[cible + 2] = data[source + 2]!;
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8;
  entete[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", deflateSync(lignes, { level: 6 })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

const pdf = process.argv[2]!;
const sortie = process.argv[3]!;
const pages = process.argv[4]!.split(",").map((brut) => Number.parseInt(brut, 10));
const largeurVoulue = Number.parseInt(process.argv[5] ?? "1400", 10);

/** Un quart de page, en parts de page : « 0,0 0,0 0,3 0,3 » pour le coin haut gauche. */
const cadre = (process.argv[6] ?? "").split(/[ ,]+/u).filter((brut) => brut !== "").map(Number.parseFloat);

/** Découpe un rectangle dans les pixels rendus, sans rien redimensionner. */
function recadrer(
  data: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  part: readonly number[],
): { data: Uint8ClampedArray; largeur: number; hauteur: number } {
  const x = Math.max(0, Math.round(part[0]! * largeur));
  const y = Math.max(0, Math.round(part[1]! * hauteur));
  const l = Math.min(largeur - x, Math.round(part[2]! * largeur));
  const h = Math.min(hauteur - y, Math.round(part[3]! * hauteur));
  const coupe = new Uint8ClampedArray(l * h * 4);
  for (let ligne = 0; ligne < h; ligne += 1)
    coupe.set(data.subarray(((y + ligne) * largeur + x) * 4, ((y + ligne) * largeur + x + l) * 4), ligne * l * 4);
  return { data: coupe, largeur: l, hauteur: h };
}

const rendu = await ouvrirRenduPdf(pdf);
try {
  for (const numero of pages) {
    if (numero < 1 || numero > rendu.nombreDePages) continue;
    const entiere = await rendu.page(numero, largeurVoulue);
    const page =
      cadre.length === 4
        ? recadrer(entiere.data, entiere.width, entiere.height, cadre)
        : { data: entiere.data, largeur: entiere.width, hauteur: entiere.height };
    const chemin = join(sortie, `page-${String(numero).padStart(4, "0")}.png`);
    const octets = png(page.data, page.largeur, page.hauteur);
    writeFileSync(chemin, octets);
    console.log(`${chemin}  ${page.largeur}×${page.hauteur}  ${createHash("sha256").update(octets).digest("hex").slice(0, 12)}`);
  }
} finally {
  await rendu.fermer();
}
