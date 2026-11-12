import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Aides de contrôle : fabriquer un PDF dont on connaît exactement le contenu.
 *
 *  Extraites de `voie-oracle.test.ts` le 6 novembre 2026, parce qu'un second fichier de contrôle
 *  en a eu besoin. Les recopier aurait fait deux générateurs de PDF à tenir d'accord — et un
 *  contrôle qui ne mesure plus la même chose que son voisin ne prouve plus rien de commun. */

/** Un PDF dont chaque page porte le contenu donné, en coordonnées PDF (origine en bas à gauche). */
export function pdfDePages(
  dossier: string,
  nom: string,
  contenus: readonly string[],
  dimensions: { readonly largeur: number; readonly hauteur: number } = { largeur: 595, hauteur: 842 },
): string {
  const objets: string[] = [];
  const ajouter = (contenu: string): number => objets.push(contenu);

  const catalogue = ajouter("");
  const racinePages = ajouter("");
  const police = ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pages = contenus.map((contenu) => {
    const flux = ajouter(`<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    return ajouter(
      `<< /Type /Page /Parent ${racinePages} 0 R /MediaBox [0 0 ${dimensions.largeur} ${dimensions.hauteur}]` +
        ` /Resources << /Font << /F1 ${police} 0 R >> >> /Contents ${flux} 0 R >>`,
    );
  });
  objets[catalogue - 1] = `<< /Type /Catalog /Pages ${racinePages} 0 R >>`;
  objets[racinePages - 1] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((n) => `${n} 0 R`).join(" ")}] >>`;

  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(corps.length);
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root ${catalogue} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const chemin = join(dossier, nom);
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

/** Un pavé sombre portant un nombre en clair, à l'abscisse `x` : la forme même d'une marque. */
export const marque = (x: number, y: number, valeur: number): string =>
  `0 g ${x} ${y} 54 34 re f 1 g BT /F1 22 Tf ${x + 12} ${y + 9} Td (${valeur}) Tj ET`;

/** Un intitulé imprimé, assez gros pour être du titre : ce que la couche texte doit rendre. */
export const titre = (y: number, texte: string): string => `0 g BT /F1 18 Tf 120 ${y} Td (${texte}) Tj ET`;

/** Du texte ordinaire, en noir : ce qui doit rester du texte et non devenir une marque. */
export const prose = (y: number): string => `0 g BT /F1 12 Tf 180 ${y} Td (une page ordinaire de ce document) Tj ET`;
