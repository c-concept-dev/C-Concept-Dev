// @vitest-environment node
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { entreesZip } from "../src/zip.js";

/** Lire une archive ZIP, parce qu'un EPUB en est une (FMT-01).
 *
 *  ## Pourquoi l'écrire plutôt que l'emprunter
 *
 *  Un EPUB n'emploie que deux façons de ranger un fichier : tel quel, ou dégonflé. `node:zlib`
 *  sait dégonfler ; le reste est un format de table, et il tient en quelques dizaines de lignes.
 *  Le dépôt a déjà écrit son encodeur CCITT et sa table d'objets PDF plutôt que d'ajouter des
 *  dépendances pour les lire — c'est la même décision, et pour la même raison : une dépendance
 *  qu'on n'a pas est une dépendance qu'on n'a pas à suivre.
 *
 *  ## Ce qu'il lit, et ce qu'il refuse
 *
 *  On lit la **table centrale**, jamais la suite des en-têtes locaux : c'est la table qui fait
 *  foi dans un ZIP, et un fichier dont les deux se contredisent est précisément celui qu'on ne
 *  veut pas lire au hasard. Une méthode de compression qu'on ne connaît pas se dit, elle ne se
 *  devine pas.
 */

/** Une archive fabriquée pour l'épreuve. Elle n'emploie que ce qu'un EPUB emploie. */
function zipDe(entrees: readonly { nom: string; contenu: Buffer; degonfle?: boolean }[]): Buffer {
  const locaux: Buffer[] = [];
  const table: Buffer[] = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, "utf8");
    const brut = entree.contenu;
    const range = entree.degonfle === true ? deflateRawSync(brut) : brut;
    const methode = entree.degonfle === true ? 8 : 0;

    const local = Buffer.alloc(30 + nom.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(methode, 8);
    local.writeUInt32LE(0, 14); // somme de contrôle : non vérifiée ici
    local.writeUInt32LE(range.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    nom.copy(local, 30);
    locaux.push(local, range);

    const entreeTable = Buffer.alloc(46 + nom.length);
    entreeTable.writeUInt32LE(0x02014b50, 0);
    entreeTable.writeUInt16LE(methode, 10);
    entreeTable.writeUInt32LE(range.length, 20);
    entreeTable.writeUInt32LE(brut.length, 24);
    entreeTable.writeUInt16LE(nom.length, 28);
    entreeTable.writeUInt32LE(decalage, 42);
    nom.copy(entreeTable, 46);
    table.push(entreeTable);

    decalage += local.length + range.length;
  }

  const corps = Buffer.concat(locaux);
  const centrale = Buffer.concat(table);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(centrale.length, 12);
  fin.writeUInt32LE(corps.length, 16);
  return Buffer.concat([corps, centrale, fin]);
}

describe("une archive ZIP se lit par sa table centrale", () => {
  it("rend un fichier rangé tel quel", () => {
    const zip = zipDe([{ nom: "mimetype", contenu: Buffer.from("application/epub+zip") }]);
    expect(entreesZip(zip).get("mimetype")?.toString("utf8")).toBe("application/epub+zip");
  });

  it("rend un fichier dégonflé, et rend son contenu d'origine", () => {
    const texte = "Un chapitre entier, répété pour qu'il se dégonfle. ".repeat(40);
    const zip = zipDe([{ nom: "OEBPS/ch01.xhtml", contenu: Buffer.from(texte), degonfle: true }]);
    expect(entreesZip(zip).get("OEBPS/ch01.xhtml")?.toString("utf8")).toBe(texte);
  });

  it("rend plusieurs entrées, et les nomme par leur chemin dans l'archive", () => {
    const zip = zipDe([
      { nom: "mimetype", contenu: Buffer.from("application/epub+zip") },
      { nom: "META-INF/container.xml", contenu: Buffer.from("<container/>"), degonfle: true },
      { nom: "OEBPS/content.opf", contenu: Buffer.from("<package/>"), degonfle: true },
    ]);
    const entrees = entreesZip(zip);
    expect([...entrees.keys()].sort()).toEqual(["META-INF/container.xml", "OEBPS/content.opf", "mimetype"]);
  });

  it("garde les accents d'un nom de fichier", () => {
    const zip = zipDe([{ nom: "OEBPS/préface.xhtml", contenu: Buffer.from("x") }]);
    expect(entreesZip(zip).has("OEBPS/préface.xhtml")).toBe(true);
  });

  it("refuse ce qui n'est pas une archive, en le disant", () => {
    expect(() => entreesZip(Buffer.from("ceci n'est pas une archive"))).toThrow(/archive/i);
  });

  it("refuse une méthode de compression qu'il ne connaît pas, plutôt que de rendre du bruit", () => {
    // Un ZIP peut employer une dizaine de méthodes. Nous n'en lisons que deux, et le dire vaut
    // mieux que de rendre des octets qui ressembleraient à du texte sans en être.
    const zip = zipDe([{ nom: "x", contenu: Buffer.from("x") }]);
    // La méthode vit au décalage 10 de l'entrée de table ; on la remplace par une inconnue.
    const table = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(12, table + 10);
    expect(() => entreesZip(zip)).toThrow(/compression/i);
  });

  it("ne garde pas les dossiers, qui n'ont pas de contenu", () => {
    const zip = zipDe([
      { nom: "OEBPS/", contenu: Buffer.alloc(0) },
      { nom: "OEBPS/ch01.xhtml", contenu: Buffer.from("x") },
    ]);
    expect([...entreesZip(zip).keys()]).toEqual(["OEBPS/ch01.xhtml"]);
  });
});
