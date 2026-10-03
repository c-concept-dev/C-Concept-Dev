/** Enveloppe TIFF minimale, à usage de contrôle seulement : elle sert à faire juger notre
 *  encodeur groupe 4 par libtiff. Le produit, lui, range le groupe 4 dans un PDF. */

type Entree = { readonly tag: number; readonly type: number; readonly valeur: number };

const SHORT = 3;
const LONG = 4;

export function tiffGroupe4(donnees: Buffer, largeur: number, hauteur: number): Buffer {
  const entetes: Entree[] = [
    { tag: 256, type: LONG, valeur: largeur },
    { tag: 257, type: LONG, valeur: hauteur },
    { tag: 258, type: SHORT, valeur: 1 },
    { tag: 259, type: SHORT, valeur: 4 },
    { tag: 262, type: SHORT, valeur: 0 },
    { tag: 273, type: LONG, valeur: 0 },
    { tag: 277, type: SHORT, valeur: 1 },
    { tag: 278, type: LONG, valeur: hauteur },
    { tag: 279, type: LONG, valeur: donnees.length },
  ];

  const tailleIfd = 2 + entetes.length * 12 + 4;
  const debutDonnees = 8 + tailleIfd;
  const ifd = Buffer.alloc(tailleIfd);
  ifd.writeUInt16LE(entetes.length, 0);

  entetes.forEach((entree, rang) => {
    const base = 2 + rang * 12;
    ifd.writeUInt16LE(entree.tag, base);
    ifd.writeUInt16LE(entree.type, base + 2);
    ifd.writeUInt32LE(1, base + 4);
    const valeur = entree.tag === 273 ? debutDonnees : entree.valeur;
    if (entree.type === SHORT) ifd.writeUInt16LE(valeur, base + 8);
    else ifd.writeUInt32LE(valeur, base + 8);
  });

  const entete = Buffer.alloc(8);
  entete.write("II", 0, "latin1");
  entete.writeUInt16LE(42, 2);
  entete.writeUInt32LE(8, 4);

  return Buffer.concat([entete, ifd, donnees]);
}
