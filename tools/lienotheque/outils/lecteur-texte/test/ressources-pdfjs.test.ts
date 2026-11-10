// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { lireCoucheTexte, metadonneesDuPdf } from "../src/index.js";

/** Les ressources de pdf.js suivent **toutes** les lectures, pas seulement le rendu (dette D24).
 *
 *  `rendu-page.ts` passe `ressourcesPdfJs()` à son `getDocument` ; `couche-texte.ts` ne le faisait
 *  pas. Or `useSystemFonts: false` — posé aux trois endroits — oblige pdf.js à **charger** les
 *  polices standard que le document ne porte pas, au lieu de leur substituer celles du système.
 *  Sans `standardFontDataUrl`, ce chargement échoue : pdf.js n'échoue pas, il **avertit**.
 *
 *  ## Ce que la correction change, mesuré, et ce qu'elle ne change pas
 *
 *  Sur **232 documents** de la bibliothèque réelle, **2** réclament une police standard —
 *  `aebersold-FRENCH.pdf` d'un dossier de cours (empreinte `588ef349…`, à ne pas confondre avec
 *  la fixture F1, qui porte le même nom et une autre empreinte) et un recueil de thèmes. Sur ces
 *  deux documents, douze pages comparées avec et sans les adresses : **957 et 443 suites de
 *  caractères, identiques à la décimale**, et **5 puis 2 avertissements qui disparaissent**.
 *
 *  Autrement dit : rien de ce qui est lu ne change, et c'est à dire. Ce que la dette coûtait est
 *  un journal qui crie au feu là où rien ne brûle — et un avertissement qu'on apprend à ignorer
 *  est un avertissement qui ne protège plus rien le jour où il dit vrai.
 *
 *  La fixture est fabriquée ici : une page, un mot, `/Helvetica`. Aucune œuvre, donc ce contrôle
 *  tourne partout, l'intégration continue comprise. */

const bac = mkdtempSync(join(tmpdir(), "lienotheque-ressources-pdfjs-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

/** Un PDF natif d'une page dont l'unique police est une des quatorze standard. */
function pdfEnPoliceStandard(): string {
  const flux = "BT /F1 24 Tf 20 100 Td (Bonjour) Tj ET";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(Buffer.byteLength(corps, "latin1"));
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = Buffer.byteLength(corps, "latin1");
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const chemin = join(bac, "police-standard.pdf");
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

/** Écoute ce que pdf.js écrit : il n'échoue pas, il avertit — et un avertissement que personne ne
 *  regarde est exactement la forme que cette dette avait prise. */
async function avertissementsPendant(travail: () => Promise<unknown>): Promise<readonly string[]> {
  const recueillis: string[] = [];
  const vrai = console.warn;
  console.warn = (...parts: unknown[]) => void recueillis.push(parts.map(String).join(" "));
  try {
    await travail();
  } finally {
    console.warn = vrai;
  }
  return recueillis;
}

describe("les ressources de pdf.js suivent la couche texte (D24, OUT-05)", () => {
  it("lit la couche texte d'un PDF en police standard sans un seul avertissement", async () => {
    const chemin = pdfEnPoliceStandard();
    let lu: Awaited<ReturnType<typeof lireCoucheTexte>> | undefined;
    const avertissements = await avertissementsPendant(async () => {
      lu = await lireCoucheTexte(chemin);
    });
    expect(lu?.pages.map((page) => page.mots.map((mot) => mot.texte))).toEqual([["Bonjour"]]);
    expect(avertissements, "pdf.js n'a rien à nous dire quand il a tout ce qu'il lui faut").toEqual([]);
  }, 30_000);

  /** Celui-ci était **vert avant** la correction : lire les métadonnées ne touche aucune police,
   *  donc le second `getDocument` n'avait pas de symptôme. Il porte quand même les adresses, pour
   *  qu'une lecture de pdf.js dans ce module ne puisse pas en manquer — et ce contrôle garde cet
   *  état plutôt qu'il ne le prouve. Je le dis plutôt que de le laisser passer pour une preuve. */
  it("lit les métadonnées sans un seul avertissement", async () => {
    const chemin = pdfEnPoliceStandard();
    let meta: Awaited<ReturnType<typeof metadonneesDuPdf>> | undefined;
    const avertissements = await avertissementsPendant(async () => {
      meta = await metadonneesDuPdf(chemin);
    });
    expect(meta?.connu).toBe(true);
    expect(avertissements).toEqual([]);
  }, 30_000);
});
