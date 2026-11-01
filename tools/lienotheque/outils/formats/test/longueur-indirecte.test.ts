import { describe, expect, it } from "vitest";
import { objetsPdf, pagesPdf } from "../src/index.js";

/** Un flux dont la longueur est une **référence** se lit en entier (FMT-01).
 *
 *  ## Le défaut, mesuré le 1er novembre 2026 sur la bibliothèque réelle
 *
 *  Un PDF peut écrire la longueur d'un flux de deux façons : en clair — `/Length 533135` — ou par
 *  référence à un autre objet — `/Length 229 0 R`, qui veut dire « voir l'objet 229 ». La seconde
 *  est courante chez les producteurs qui écrivent le flux avant d'en connaître la taille.
 *
 *  Le lecteur prenait le premier nombre venu après `/Length` : il lisait donc **229** là où la
 *  longueur était 533135, et tronquait l'image à la taille de son propre numéro d'objet. Une image
 *  de cinq cent mille octets était rendue sur deux cent vingt-neuf.
 *
 *  Conséquence mesurée, et c'est elle qui a fait trouver le défaut : le garde-fou qui écarte le
 *  décodeur WebAssembly devant un JPEG qu'il ne survit pas se déclenchait sur **la moitié** des
 *  documents réels — parce qu'un JPEG tronqué paraît toujours incomplet. Il protégeait d'un mal
 *  qu'il fabriquait lui-même. Et l'inspecteur, l'export d'images et la chaîne de texte recevaient
 *  tous le même flux amputé.
 */

/** Un PDF minimal dont le flux déclare sa longueur par référence, comme les vrais. */
function pdfALongueurIndirecte(contenu: string): Buffer {
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>",
    // La longueur est une référence : c'est tout l'objet de cette épreuve.
    `<< /Length 5 0 R >>\nstream\n${contenu}\nendstream`,
    String(contenu.length),
  ];
  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(corps.length);
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, "latin1");
}

describe("la longueur d'un flux peut être une référence, et se lit alors en entier", () => {
  it("lit tout le flux, et non le nombre d'octets du numéro d'objet", () => {
    // Le contenu fait 300 octets ; l'objet qui porte sa longueur est le n° 5. Un lecteur qui
    // confond les deux rendrait cinq octets.
    const contenu = "A".repeat(300);
    const objets = objetsPdf(pdfALongueurIndirecte(contenu));
    const flux = objets.get(4)?.flux;
    expect(flux, "le flux est lu").toBeDefined();
    expect(flux?.length, "en entier, et non à la taille du numéro d'objet").toBe(300);
    expect(flux?.toString("latin1")).toBe(contenu);
  });

  it("lit encore correctement une longueur écrite en clair", () => {
    // Le cas ordinaire ne doit pas être abîmé par la correction de l'autre.
    const contenu = "B".repeat(120);
    const brut = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream\nendobj\n%%EOF\n`,
      "latin1",
    );
    expect(objetsPdf(brut).get(1)?.flux?.length).toBe(120);
  });
});

/** Un PDF dont les ressources vivent sur le nœud **parent**, comme la spécification l'autorise. */
function pdfARessourcesHeritees(): Buffer {
  const image = "ÿØÿàJPEG-de-facade";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    // Les ressources sont ici, sur le nœud des pages : la page n'en porte aucune.
    "<< /Type /Pages /Count 1 /Kids [3 0 R] /Resources << /XObject << /Im0 4 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
    `<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /Filter /DCTDecode /Length ${image.length} >>\nstream\n${image}\nendstream`,
  ];
  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(corps.length);
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, "latin1");
}

describe("les ressources d'une page peuvent vivre sur son parent (FMT-01)", () => {
  it("trouve l'image d'une page qui hérite ses ressources", () => {
    // `/Resources` est **héritable** : une page qui n'en porte pas le reçoit d'un nœud ancêtre.
    // Le lecteur ne regardait que la page, et manquait donc toutes les images de ces pages-là.
    //
    // Mesuré le 1er novembre 2026 : un document sur 250 est concerné, 33 pages sur 11 035. Trouvé
    // en comparant un extrait à son original — l'extrait rendait 396 images là où l'original en
    // rendait zéro, parce que la copie aplatit l'héritage. Un extrait plus lisible que son
    // original est un signe qu'il faut suivre, pas une bonne nouvelle.
    const pages = pagesPdf(objetsPdf(pdfARessourcesHeritees()));
    expect(pages.length, "une page").toBe(1);
    expect(pages[0]?.images.length, "et son image, héritée du parent").toBe(1);
  });
});
