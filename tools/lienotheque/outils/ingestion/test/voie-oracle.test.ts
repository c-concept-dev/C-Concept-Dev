// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import { rejouerParOracle } from "../src/index.js";

/** Lire un document sans manière de lire écrite à la main (OUT-10, REC-02).
 *
 *  Les fixtures sont fabriquées ici, en PDF brut : des pages qui portent, ou ne portent pas, une
 *  marque qui revient. Pointer un document du corpus rendrait ce contrôle dépendant d'un fichier
 *  sous droits qui n'est pas dans le dépôt — et un contrôle qui se saute ne prouve rien.
 */

const bac = mkdtempSync(join(tmpdir(), "lienotheque-voie-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

/** Un PDF dont chaque page porte le contenu donné, en coordonnées PDF (origine en bas à gauche). */
function pdfDePages(nom: string, contenus: readonly string[]): string {
  const objets: string[] = [];
  const ajouter = (contenu: string): number => objets.push(contenu);

  const catalogue = ajouter("");
  const racinePages = ajouter("");
  const police = ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pages = contenus.map((contenu) => {
    const flux = ajouter(`<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    return ajouter(
      `<< /Type /Page /Parent ${racinePages} 0 R /MediaBox [0 0 595 842]` +
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

  const chemin = join(bac, nom);
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

/** Un pavé sombre portant un nombre en clair, à l'abscisse `x` : la forme même d'une marque. */
const marque = (x: number, y: number, valeur: number): string =>
  `0 g ${x} ${y} 54 34 re f 1 g BT /F1 22 Tf ${x + 12} ${y + 9} Td (${valeur}) Tj ET`;

/** Un intitulé imprimé, assez gros pour être du titre : ce que la couche texte doit rendre. */
const titre = (y: number, texte: string): string => `0 g BT /F1 18 Tf 120 ${y} Td (${texte}) Tj ET`;

/** Du texte ordinaire, en noir : ce qui doit rester du texte et non devenir une marque. */
const prose = (y: number): string => `0 g BT /F1 12 Tf 180 ${y} Td (une page ordinaire de ce document) Tj ET`;

const dossierSansPiste = mkdtempSync(join(tmpdir(), "lienotheque-sans-piste-"));
afterAll(() => rmSync(dossierSansPiste, { recursive: true, force: true }));

const siTesseract = tesseractDisponible() ? it : it.skip;

describe("un document sans manière de lire (OUT-10)", () => {
  siTesseract("trouve la marque qui revient et en tire des liens", { timeout: 180_000 }, async () => {
    // Quatre pages, deux marques par page, à la même abscisse : 1 2 / 3 4 / 5 6 / 7 8.
    const pages = [0, 1, 2, 3].map((rang) =>
      [marque(70, 620, rang * 2 + 1), marque(70, 320, rang * 2 + 2), prose(760)].join("\n"),
    );
    const pdf = pdfDePages("avec-marques.pdf", pages);
    const inventaire = Array.from({ length: 8 }, (_, place) => ({
      nom: `${String(place + 1).padStart(2, "0")}.mp3`,
      empreinte: `${place}`.repeat(64).slice(0, 64),
      provenances: ["lot:epreuve"],
    }));

    const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
      inventaireMedias: inventaire,
      provenancesMedias: ["lot:epreuve"],
      verifieParUnHumain: true,
    });

    expect(rejeu.resultat.lignes.length, "huit marques, huit lignes").toBe(8);
    expect(rejeu.resultat.lignes.map((ligne) => ligne.piste)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rejeu.journal.join(" ")).toMatch(/endroit retenu/);
  });

  siTesseract("s'abstient, et dit pourquoi, quand rien ne revient", { timeout: 180_000 }, async () => {
    const pdf = pdfDePages("sans-marque.pdf", [prose(700), prose(500), prose(300), prose(200)]);
    const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
      inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64), provenances: ["lot:epreuve"] }],
      provenancesMedias: ["lot:epreuve"],
    });

    expect(rejeu.association.appariements, "aucun lien n'est inventé").toEqual([]);
    expect(rejeu.association.abstention, "et l'abstention est dite").toBeDefined();
    expect(rejeu.journal.at(-1)).toMatch(/Aucun/);
  });

  siTesseract(
    "ne publie pas sur un vivier que rien ne borne, même en ayant lu (REC-02)",
    { timeout: 180_000 },
    async () => {
      const pages = [0, 1, 2, 3].map((rang) => [marque(70, 620, rang + 1), prose(760)].join("\n"));
      const pdf = pdfDePages("vivier-non-borne.pdf", pages);
      // Un inventaire sans provenance : rien ne dit que ces pistes appartiennent à ce document.
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64) }],
        verifieParUnHumain: true,
      });
      expect(rejeu.association.abstention?.raison).toBe("vivier_non_borne");
      expect(rejeu.association.appariements).toEqual([]);
    },
  );

  siTesseract("tient ses pages pour déduites, n'ayant lu aucun folio (OUT-15)", { timeout: 180_000 }, async () => {
    const pages = [0, 1, 2, 3].map((rang) => [marque(70, 620, rang + 1), prose(760)].join("\n"));
    const pdf = pdfDePages("folios.pdf", pages);
    const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
      inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64), provenances: ["lot:epreuve"] }],
      provenancesMedias: ["lot:epreuve"],
    });
    expect(
      rejeu.resultat.pages.every((page) => page.statut === "deduite"),
      "aucune page ne se dit lue : cette voie ne lit pas de folio",
    ).toBe(true);
  });
  siTesseract(
    "s'abstient quand la forme qui revient n'est pas une numérotation (REC-02)",
    { timeout: 180_000 },
    async () => {
      // Huit marques qui reviennent au même endroit, bien lisibles — et qui portent toutes le
      // même nombre. C'est ce qu'une forme de notation donne à la reconnaissance : elle se lit,
      // et elle ne numérote rien. L'ancienne règle, qui ne pesait que « ça se lit », l'élisait.
      const pages = [0, 1, 2, 3].map(() => [marque(70, 620, 7), marque(70, 320, 7), prose(760)].join("\n"));
      const pdf = pdfDePages("sans-numerotation.pdf", pages);
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: Array.from({ length: 8 }, (_, place) => ({
          nom: `${String(place + 1).padStart(2, "0")}.mp3`,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
        verifieParUnHumain: true,
      });

      expect(rejeu.association.appariements, "aucun lien tiré d'une forme qui ne numérote pas").toEqual([]);
      expect(rejeu.journal.join(" ")).toMatch(/ne porte une numérotation/);
    },
  );

  siTesseract(
    "publie sans œil humain quand les noms du vivier se retrouvent imprimés (REC-02, CDC §0 bis)",
    { timeout: 180_000 },
    async () => {
      // Quatre pages, une marque par page, et sur deux d'entre elles l'intitulé d'un
      // enregistrement du vivier. Deux lectures indépendantes s'accordent : la marque dit le
      // rang, le nom dit le nom. Personne n'a rien écouté, et c'est déjà corroboré.
      const intitules = ["Doxy", "", "", "Solitude"];
      const pages = [0, 1, 2, 3].map((rang) =>
        [marque(70, 620, rang + 1), prose(760), ...(intitules[rang] === "" ? [] : [titre(400, intitules[rang]!)])].join(
          "\n",
        ),
      );
      const pdf = pdfDePages("noms-imprimes.pdf", pages);
      const noms = ["01 - Doxy.mp3", "02 - Autre chose.mp3", "03 - Encore autre.mp3", "04 - Solitude.mp3"];
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: noms.map((nom, place) => ({
          nom,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
      });

      const sources = new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste));
      expect(sources, "deux façons de lire, et non une").toContain("corroboration_media");
      expect(sources).toContain("pastille");
      expect(rejeu.association.abstention, "aucune abstention : deux signaux suffisent").toBeUndefined();
      expect(rejeu.association.appariements.length).toBeGreaterThan(0);
    },
  );
});

