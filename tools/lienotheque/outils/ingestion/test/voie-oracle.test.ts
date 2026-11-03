// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import {
  BUDGET_EXPLORATION,
  MOTIFS,
  VERSION_DE_LA_VOIE,
  autourDeLaMarque,
  corroborerParTable,
  rejouerParOracle,
} from "../src/index.js";
import type { LigneInterpretee } from "@lienotheque/contrats";
import type { TableLue } from "@lienotheque/noyau";

/** Lire un document sans manière de lire écrite à la main (OUT-10, REC-02).
 *
 *  Les fixtures sont fabriquées ici, en PDF brut : des pages qui portent, ou ne portent pas, une
 *  marque qui revient. Pointer un document du corpus rendrait ce contrôle dépendant d'un fichier
 *  sous droits qui n'est pas dans le dépôt — et un contrôle qui se saute ne prouve rien.
 */

const bac = mkdtempSync(join(tmpdir(), "lienotheque-voie-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

it("le vivier ne peut pas abaisser le plancher tant que les petits échantillons ne sont pas robustes (OUT-10)", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/voie-oracle.ts", import.meta.url)), "utf8");
  expect(source).toContain("zonesRecurrentes(formes, combienDePages)");
  expect(source).not.toMatch(/zonesRecurrentes\(formes, combienDePages,\s*medias\.length\)/u);
});

/** Un PDF dont chaque page porte le contenu donné, en coordonnées PDF (origine en bas à gauche). */
function pdfDePages(
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

describe("une table globale corrobore sans jamais décider seule (OUT-10, REC-02)", () => {
  const lignes: LigneInterpretee[] = Array.from({ length: 52 }, (_, place) => ({
    numero: place + 1,
    pageImprimee: 8 + place * 2,
    piste: place + 1,
    disque: 1,
    sourcePiste: "pastille",
    confiance: 1,
  }));
  const table = (combien: number, colonnes = 3): TableLue => ({
    colonnes: Array.from({ length: colonnes }, (_, place) => ({ x: 100 + place * 100, etendue: 0, presentDans: combien })),
    panneaux: 1,
    rangees: Array.from({ length: combien }, (_, place) => ({
      y: 100 + place * 10,
      intitule: "Entrée",
      cellules: colonnes === 3 ? [place + 1, place + 1, 8 + place * 2] : [place + 1, 8 + place * 2],
    })),
    utilisables: Array.from({ length: combien }, (_, place) => place),
    incompletes: [],
    suspectes: [],
    estUneTable: true,
  });

  it("retient les 43 correspondances exactes et écarte les faux tableaux courts", () => {
    const preuve = corroborerParTable(
      lignes,
      [
        { page: 4, table: table(4, 2) },
        { page: 5, table: table(43) },
        { page: 9, table: table(2, 2) },
      ],
      52,
    );

    expect(preuve?.page).toBe(5);
    expect(preuve?.lignes).toHaveLength(43);
    expect(new Set(preuve?.lignes.map((ligne) => ligne.sourcePiste))).toEqual(new Set(["corroboration_table"]));
    expect(preuve?.signaux).toEqual(["pastille", "corroboration_table"]);
  });

  it("refuse une table courte même quand ses quatre valeurs coïncident", () => {
    expect(corroborerParTable(lignes, [{ page: 4, table: table(4, 3) }], 52)).toBeUndefined();
  });

  it("refuse les valeurs hors du vivier au lieu de les rabattre", () => {
    const horsBornes = table(43);
    const rangees = horsBornes.rangees.map((rangee, place) =>
      place === 12 ? { ...rangee, cellules: [13, 113, 32] } : rangee,
    );
    expect(
      corroborerParTable(lignes, [{ page: 5, table: { ...horsBornes, rangees } }], 52),
    ).toBeUndefined();
  });

  it("sait confronter la table aux candidats venus des noms, sans exiger une marque", () => {
    const nommees = lignes.map((ligne) => ({
      ...ligne,
      // Le titre peut être retrouvé sur une page intérieure de l'élément, tandis que la table
      // donne sa page de départ. Ce sont deux localisateurs du même workout, pas une contradiction.
      pageImprimee: ligne.pageImprimee + 1,
      sourcePiste: "corroboration_media" as const,
    }));
    const preuve = corroborerParTable(nommees, [{ page: 5, table: table(43) }], 52);

    expect(preuve?.lignes).toHaveLength(43);
    expect(preuve?.lignes[0]?.pageImprimee, "la table donne la page de départ").toBe(8);
    expect(preuve?.signaux).toEqual(["corroboration_media", "corroboration_table"]);
  });
});

describe("un document sans manière de lire (OUT-10)", () => {
  it("publie l'accord noms-table même si les pages liminaires n'ont pas de folio (REC-02, OUT-15)", async () => {
    const pdf = pdfDePages("noms-et-table.pdf", Array.from({ length: 10 }, () => prose(700)));
    const motsDeTable = Array.from({ length: 8 }, (_, place) =>
      [place + 1, place + 1, place + 8].map((valeur, colonne) => ({
        texte: String(valeur),
        x: 100 + colonne * 100,
        y: 100 + place * 20,
        l: 12,
        h: 10,
      })),
    ).flat();
    const inventaire = Array.from({ length: 8 }, (_, place) => ({
      nom: `${String(place + 1).padStart(2, "0")} - Workout #${place + 1}.mp3`,
      empreinte: `${place}`.repeat(64).slice(0, 64),
      provenances: ["lot:epreuve"],
    }));
    const texteDesPages = [
      { page: 1, texte: "Table des pistes", mots: motsDeTable },
      { page: 2, pageImprimee: 8, texte: "Début du premier élément", mots: [] },
      ...Array.from({ length: 8 }, (_, place) => ({
        page: place + 3,
        // Comme sur le vrai Bass Aerobics, le vote documentaire établit la suite des folios
        // sans que l'OCR relise chacun d'eux. La table doit pouvoir préciser les départs situés
        // entre les deux bornes effectivement relues, mais jamais en dehors.
        ...(place === 7 ? { pageImprimee: 16 } : {}),
        texte: `Workout #${place + 1}`,
        mots: [],
      })),
    ];

    const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
      inventaireMedias: inventaire,
      provenancesMedias: ["lot:epreuve"],
      foliosEtablis: true,
      texteDesPages,
      budgetExploration: { paires: 256, secondes: 0 },
    });

    expect(rejeu.resultat.lignes).toHaveLength(8);
    expect(rejeu.resultat.lignes.map((ligne) => ligne.pageImprimee)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste))).toEqual(
      new Set(["corroboration_table"]),
    );
    expect(
      rejeu.resultat.pages.filter((page) => page.elements.length > 0).map((page) => page.index),
      "les noms situent physiquement les éléments même quand la table corrige leur folio",
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rejeu.association.abstention).toBeUndefined();
    expect(rejeu.association.appariements).toHaveLength(8);
  });

  it("apprend un repère numérique récurrent des accords prouvés et récupère un départ absent de la table", async () => {
    const pdf = pdfDePages("repere-appris.pdf", Array.from({ length: 23 }, () => prose(700)));
    const motsDeTable = Array.from({ length: 20 }, (_, place) =>
      [place + 1, place + 1, place + 8].map((valeur, colonne) => ({
        texte: String(valeur),
        x: 100 + colonne * 100,
        y: 100 + place * 20,
        l: 12,
        h: 10,
      })),
    ).flat();
    const inventaire = Array.from({ length: 21 }, (_, place) => ({
      nom: `${String(place + 1).padStart(2, "0")} - Clause #${place + 1}.mp3`,
      empreinte: `${place}`.repeat(64).slice(0, 64),
      provenances: ["lot:epreuve"],
    }));
    const texteDesPages = [
      { page: 1, texte: "Table", mots: motsDeTable },
      { page: 2, pageImprimee: 8, texte: "Borne 1 Clause #1", mots: [] },
      ...Array.from({ length: 20 }, (_, place) => ({
        page: place + 3,
        ...(place === 19 ? { pageImprimee: 28 } : {}),
        texte: `Borne ${place + 2} Clause #${place + 2}${place === 0 ? " Borne 999" : ""}`,
        mots: [],
      })),
      { page: 23, texte: "Fin", mots: [] },
    ];

    const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
      inventaireMedias: inventaire,
      provenancesMedias: ["lot:epreuve"],
      foliosEtablis: true,
      texteDesPages,
      budgetExploration: { paires: 256, secondes: 0 },
    });

    expect(rejeu.resultat.lignes, rejeu.journal.join("\n")).toHaveLength(21);
    expect(rejeu.resultat.lignes.find((ligne) => ligne.numero === 21)).toMatchObject({
      pageImprimee: 28,
      piste: 21,
      sourcePiste: "corroboration_recurrente",
    });
    expect(rejeu.association.abstention).toBeUndefined();
  });

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
    "montre les candidats nommés sans jamais les publier quand aucun second signal n'existe (REC-02)",
    { timeout: 180_000 },
    async () => {
      // Aucune marque ne revient dans ce document. Le texte déjà lu retrouve pourtant deux noms
      // du vivier, chacun sur une seule page : ce sont des pistes de vérification humaine, pas
      // deux preuves. Elles doivent donc rester visibles tout en laissant zéro lien actif.
      const pdf = pdfDePages("noms-seuls.pdf", [prose(700), prose(500), prose(300), prose(200)]);
      const noms = ["01 - Doxy.mp3", "02 - Autre chose.mp3", "03 - Encore autre.mp3", "04 - Solitude.mp3"];
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: noms.map((nom, place) => ({
          nom,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
        foliosEtablis: true,
        texteDesPages: [
          { page: 1, pageImprimee: 17, texte: "Doxy" },
          { page: 2, pageImprimee: 18, texte: "" },
          { page: 3, pageImprimee: 19, texte: "" },
          { page: 4, pageImprimee: 20, texte: "Solitude" },
        ],
      });

      expect(rejeu.resultat.lignes.map((ligne) => ligne.piste), "les deux propositions restent visibles").toEqual([1, 4]);
      expect(new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste))).toEqual(
        new Set(["corroboration_media"]),
      );
      expect(rejeu.association.abstention?.raison, "un nom seul n'est jamais une publication").toBe(
        "corroboration_insuffisante",
      );
      expect(rejeu.association.abstention?.combien).toBe(2);
      expect(rejeu.association.appariements, "zéro lien actif").toEqual([]);
    },
  );

  siTesseract(
    "coupe chaque feuille double avant de chercher les marques et reprend les folios établis (OUT-03, OUT-15)",
    { timeout: 180_000 },
    async () => {
      const feuilles = [0, 1, 2, 3].map((rang) =>
        [
          marque(70, 620, rang * 2 + 1),
          marque(665, 620, rang * 2 + 2),
          prose(760),
          "0 g 592 0 6 842 re f",
        ].join("\n"),
      );
      const pdf = pdfDePages("doubles-pages-oracle.pdf", feuilles, { largeur: 1190, hauteur: 842 });
      const options = {
        inventaireMedias: Array.from({ length: 8 }, (_, place) => ({
          nom: `${String(place + 1).padStart(2, "0")}.mp3`,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
        doublePage: true,
        foliosEtablis: true,
        texteDesPages: Array.from({ length: 8 }, (_, place) => ({
          page: place + 1,
          pageImprimee: 56 + place,
          texte: "",
        })),
      };

      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, options as Parameters<typeof rejouerParOracle>[2]);

      expect(rejeu.resultat.pages, "quatre feuilles doivent devenir huit pages logiques").toHaveLength(8);
      expect(rejeu.resultat.pages.map((page) => page.pageImprimee)).toEqual([56, 57, 58, 59, 60, 61, 62, 63]);
      expect(rejeu.resultat.pages.every((page) => page.statut === "lue")).toBe(true);
    },
  );

  siTesseract(
    "ne publie pas une corroboration quand le document n'a établi aucun folio (OUT-15, REC-02)",
    { timeout: 180_000 },
    async () => {
      const intitules = ["Doxy", "", "", "Solitude"];
      const pages = [0, 1, 2, 3].map((rang) =>
        [marque(70, 620, rang + 1), prose(760), ...(intitules[rang] === "" ? [] : [titre(400, intitules[rang]!)])].join(
          "\n",
        ),
      );
      const pdf = pdfDePages("folios-non-etablis.pdf", pages);
      const noms = ["01 - Doxy.mp3", "02 - Autre chose.mp3", "03 - Encore autre.mp3", "04 - Solitude.mp3"];
      const options = {
        inventaireMedias: noms.map((nom, place) => ({
          nom,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
        foliosEtablis: false,
        texteDesPages: [
          { page: 1, texte: "Doxy" },
          { page: 2, texte: "" },
          { page: 3, texte: "" },
          { page: 4, texte: "Solitude" },
        ],
      };

      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, options as Parameters<typeof rejouerParOracle>[2]);

      expect(rejeu.resultat.lignes.length, "les candidats restent visibles").toBeGreaterThan(0);
      expect(rejeu.association.appariements, "aucun lien sans folio documentaire").toEqual([]);
      expect(rejeu.association.abstention?.raison).toBe("corroboration_insuffisante");
      expect(rejeu.journal.join(" ")).toMatch(/folio/i);
    },
  );

  siTesseract(
    "ne publie pas sur un vivier que rien ne borne, même en ayant lu (REC-02)",
    { timeout: 180_000 },
    async () => {
      const pages = [0, 1, 2, 3].map((rang) => [marque(70, 620, rang + 1), prose(760)].join("\n"));
      const pdf = pdfDePages("vivier-non-borne.pdf", pages);
      // Un inventaire sans provenance : rien ne dit que ces pistes appartiennent à ce document.
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64) }],
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
      });

      expect(rejeu.association.appariements, "aucun lien tiré d'une forme qui ne numérote pas").toEqual([]);
      expect(rejeu.journal.join(" ")).toMatch(/ne porte une numérotation/);
    },
  );

  siTesseract(
    "ne publie pas sur une seule lecture, quelle que soit la confiance (REC-02, CDC §0 bis)",
    { timeout: 180_000 },
    async () => {
      // Huit marques nettes, lues sans hésiter, et des noms qui ne portent que le rang : une
      // seule façon de lire. Aucun réglage ne doit permettre de publier cela — mesuré le 30
      // octobre 2026, c'est ainsi que 40 liens ont été publiés sur un document réel en empruntant
      // la vérification d'une lecture antérieure que personne n'avait refaite. Qu'ils aient été
      // justes pour la plupart ne change rien : rien dans la chaîne ne le savait.
      const pages = [0, 1, 2, 3].map((rang) =>
        [marque(70, 620, rang * 2 + 1), marque(70, 320, rang * 2 + 2), prose(760)].join("\n"),
      );
      const pdf = pdfDePages("une-seule-lecture.pdf", pages);
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: Array.from({ length: 8 }, (_, place) => ({
          nom: `${String(place + 1).padStart(2, "0")}.mp3`,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
      });

      expect(rejeu.resultat.lignes.length, "les lectures existent").toBe(8);
      expect(rejeu.resultat.lignes.every((ligne) => ligne.piste !== undefined), "les candidats gardent leur piste").toBe(true);
      expect(new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste))).toEqual(new Set(["pastille"]));
      expect(rejeu.association.abstention?.raison).toBe("corroboration_insuffisante");
      expect(rejeu.association.abstention?.combien, "les candidats restent comptés pour la vérification humaine").toBe(8);
      expect(rejeu.association.appariements, "et rien n'est publié").toEqual([]);
    },
  );

  it("garde un budget d'exploration au-dessus de tout ce qui a été mesuré (REC-02)", () => {
    // Le filet ne vaut que s'il ne se referme pas sur un succès réel. Sur vingt documents, la
    // plus longue exploration menée à terme a éprouvé 182 essais « endroit × façon de lire »,
    // au rythme le plus lent de 10,2 s l'essai. Baisser l'une de ces bornes sous la réalité
    // mesurée transformerait des lectures justes en abstentions : que cela se voie ici.
    expect(BUDGET_EXPLORATION.paires, "au-dessus des 182 essais mesurés").toBeGreaterThan(182);
    expect(BUDGET_EXPLORATION.secondes, "de quoi mener ces essais au rythme le plus lent observé").toBeGreaterThanOrEqual(
      BUDGET_EXPLORATION.paires * 10.2,
    );
  });

  siTesseract(
    "renonce quand le budget d'essais est épuisé, et dit après combien d'essais (REC-02)",
    { timeout: 180_000 },
    async () => {
      // Des formes qui reviennent et se lisent, mais ne numérotent rien : aucun endroit ne peut
      // qualifier, quel que soit le nombre d'essais. Avec un budget d'un seul essai, la voie doit
      // s'arrêter avant d'avoir tout vu — et le dire autrement que « j'ai tout essayé ».
      const pages = [0, 1, 2, 3].map(() => [marque(70, 620, 7), marque(70, 320, 7), prose(760)].join("\n"));
      const pdf = pdfDePages("budget-epuise.pdf", pages);
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64), provenances: ["lot:epreuve"] }],
        provenancesMedias: ["lot:epreuve"],
        budgetExploration: { paires: 1, secondes: 3600 },
      });

      const dit = rejeu.journal.join(" ");
      expect(dit, "l'arrêt est dit, avec son décompte").toMatch(
        /exploration arrêtée après 1 essai\(s\) sur \d+ possibles : le budget n'en porte pas plus de 1/,
      );
      expect(rejeu.journal.at(-1), "et l'abstention dit combien d'essais sur combien de possibles").toMatch(
        /exploration arrêtée après 1 essai\(s\) sur les \d+ qu'offrent \d+ endroit\(s\)/,
      );
      expect(rejeu.association.appariements, "jamais un lien pour éviter d'attendre").toEqual([]);
    },
  );

  siTesseract(
    "renonce aussi sur le temps écoulé, sans tenter de lecture (REC-02)",
    { timeout: 180_000 },
    async () => {
      // Le décompte d'essais ne borne le temps que si chaque essai coûte ce qu'on croit. La
      // seconde borne est une horloge : avec zéro seconde accordée, pas une reconnaissance ne
      // doit être lancée, et l'abstention doit le dire.
      const pages = [0, 1, 2, 3].map((rang) => [marque(70, 620, rang + 1), prose(760)].join("\n"));
      const pdf = pdfDePages("budget-horloge.pdf", pages);
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: [{ nom: "a.mp3", empreinte: "a".repeat(64), provenances: ["lot:epreuve"] }],
        provenancesMedias: ["lot:epreuve"],
        budgetExploration: { paires: 256, secondes: 0 },
      });

      expect(rejeu.journal.join(" "), "l'horloge, et non le décompte").toMatch(
        /exploration arrêtée après 0 essai\(s\) sur \d+ possibles : les 0 s du budget sont écoulées/,
      );
      expect(rejeu.journal.at(-1)).toMatch(/après 0 essai\(s\)/);
      expect(rejeu.association.appariements).toEqual([]);
    },
  );

  siTesseract(
    "s'abstient quand le texte transmis ne correspond pas aux feuilles rendues (REC-02, CDC §0 bis)",
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
        // Une lecture décalée ne doit jamais confirmer une autre feuille. Le PDF porte pourtant
        // les vrais intitulés : si la voie le relisait comme un repli, elle fabriquerait un second
        // signal après avoir constaté que la lecture publiée et le rendu ne s'alignent pas.
        texteDesPages: [{ page: 99, texte: "Doxy Solitude" }],
      });

      const sources = new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste));
      expect(sources, "les candidats visuels restent disponibles").toEqual(new Set(["pastille"]));
      expect(rejeu.resultat.lignes.every((ligne) => ligne.piste !== undefined), "les candidats gardent leur piste").toBe(true);
      expect(rejeu.association.abstention?.raison).toBe("corroboration_insuffisante");
      expect(rejeu.association.abstention?.combien, "les candidats restent nommés pour la vérification humaine").toBeGreaterThan(0);
      expect(rejeu.association.appariements, "aucun lien n'est publié après un désalignement").toEqual([]);
      expect(rejeu.journal.join(" ")).toMatch(/texte déjà lu écarté/i);
    },
  );

  siTesseract(
    "réutilise le texte déjà lu par la chaîne au lieu de réocériser l'étape 5 (REC-02)",
    { timeout: 180_000 },
    async () => {
      // Le PDF ne porte volontairement aucun des deux intitulés. Ils arrivent de la lecture faite
      // en amont par `instantaneDeLot` : si la voie relit le document au lieu de réutiliser cette
      // donnée, elle ne trouvera aucun second signal et devra s'abstenir.
      const pages = [0, 1, 2, 3].map((rang) => [marque(70, 620, rang + 1), prose(760)].join("\n"));
      const pdf = pdfDePages("texte-deja-lu.pdf", pages);
      const noms = ["01 - Doxy.mp3", "02 - Autre chose.mp3", "03 - Encore autre.mp3", "04 - Solitude.mp3"];
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        inventaireMedias: noms.map((nom, place) => ({
          nom,
          empreinte: `${place}`.repeat(64).slice(0, 64),
          provenances: ["lot:epreuve"],
        })),
        provenancesMedias: ["lot:epreuve"],
        foliosEtablis: true,
        texteDesPages: [
          { page: 1, pageImprimee: 17, texte: "Doxy" },
          { page: 2, pageImprimee: 18, texte: "" },
          { page: 3, pageImprimee: 19, texte: "" },
          { page: 4, pageImprimee: 20, texte: "Solitude" },
        ],
      });

      expect(new Set(rejeu.resultat.lignes.map((ligne) => ligne.sourcePiste))).toContain("corroboration_media");
      expect(rejeu.association.abstention).toBeUndefined();
      expect(rejeu.association.appariements.length).toBeGreaterThan(0);
      expect(rejeu.journal.join(" ")).toMatch(/texte déjà lu/i);
    },
  );
});


describe("ce que la voie retient d'un document, pour ne pas l'apprendre deux fois (OUT-10, REC-02)", () => {
  const vivier = Array.from({ length: 8 }, (_, place) => ({
    nom: `${String(place + 1).padStart(2, "0")}.mp3`,
    empreinte: `${place}`.repeat(64).slice(0, 64),
    provenances: ["lot:epreuve"],
  }));
  const commun = { inventaireMedias: vivier, provenancesMedias: ["lot:epreuve"] } as const;

  siTesseract(
    "retrouve l'endroit qu'elle avait trouvé, et n'éprouve plus aucun autre (OUT-10)",
    { timeout: 360_000 },
    async () => {
      const pages = [0, 1, 2, 3].map((rang) =>
        [marque(70, 620, rang * 2 + 1), marque(70, 320, rang * 2 + 2), prose(760)].join("\n"),
      );
      const pdf = pdfDePages("acquis-endroit.pdf", pages);

      const premier = await rejouerParOracle(pdf, dossierSansPiste, commun);
      expect(premier.acquis?.etat, "une lecture qui trouve retient ce qu'elle a trouvé").toBe("endroit_trouve");

      const second = await rejouerParOracle(pdf, dossierSansPiste, { ...commun, acquis: premier.acquis });
      const dit = second.journal.join(" ");
      expect(dit, "l'endroit est reconnu, pas recherché").toMatch(/endroit déjà connu de ce document/);
      expect(dit, "et plus aucun essai n'est mené").not.toMatch(/essai\(s\) éprouvé\(s\)/);
      expect(
        second.resultat.lignes.map((ligne) => ligne.piste),
        "et la seconde lecture dit exactement la même chose que la première",
      ).toEqual(premier.resultat.lignes.map((ligne) => ligne.piste));
    },
  );

  siTesseract(
    "ne refait pas l'exploration d'un document dont il est établi qu'aucun endroit ne numérote (OUT-10)",
    { timeout: 360_000 },
    async () => {
      // Le cas qui pèse le plus : seize documents sur vingt mesurés. La seconde lecture ne doit
      // rendre aucune page, ne chercher aucune forme et ne lancer aucune reconnaissance.
      const pages = [0, 1, 2, 3].map(() => [marque(70, 620, 7), marque(70, 320, 7), prose(760)].join("\n"));
      const pdf = pdfDePages("acquis-aucun-endroit.pdf", pages);

      const premier = await rejouerParOracle(pdf, dossierSansPiste, commun);
      expect(premier.acquis?.etat).toBe("aucun_endroit");

      const second = await rejouerParOracle(pdf, dossierSansPiste, { ...commun, acquis: premier.acquis });
      const dit = second.journal.join(" ");
      expect(dit, "pas une page regardée").not.toMatch(/page\(s\) regardée\(s\)/);
      expect(dit, "pas un endroit proposé").not.toMatch(/endroit\(s\) proposé\(s\)/);
      expect(second.journal.at(-1), "et la conclusion se dit retrouvée, non refaite").toMatch(
        /Conclusion retrouvée, non refaite/,
      );
      expect(second.resultat.pages.length, "le document garde pourtant toutes ses pages").toBe(
        premier.resultat.pages.length,
      );
      expect(second.acquis, "et l'acquis repart avec la nouvelle version").toEqual(premier.acquis);
    },
  );

  siTesseract(
    "écarte un acquis formé sur un autre document, quoi qu'en dise l'appelant (REC-02)",
    { timeout: 360_000 },
    async () => {
      // Le garde-fou le plus important de cette mémoire : l'empreinte est recalculée ici. Une
      // erreur de clé chez l'appelant appliquerait l'endroit d'un document à un autre, et
      // produirait des liens faux et réguliers — exactement ce que tout le reste empêche.
      const pdf = pdfDePages("acquis-etranger.pdf", [prose(700), prose(500), prose(300), prose(200)]);
      const menteur = {
        etat: "aucun_endroit" as const,
        conteneur: "f".repeat(64),
        voie: { id: "voie-sans-maniere-de-lire", version: VERSION_DE_LA_VOIE },
        pagesRegardees: 4,
        etabliLe: 1793500000,
        endroitsProposes: 56,
        essaisEprouves: 112,
        borneLaPlusHaute: 0.486,
      };
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, { ...commun, acquis: menteur });
      expect(rejeu.journal.join(" ")).toMatch(/acquis écarté : il a été formé sur un autre document/);
      expect(rejeu.journal.join(" "), "et le document est bel et bien relu").toMatch(/page\(s\) regardée\(s\)/);
    },
  );

  siTesseract(
    "écarte un acquis que la lecture a périmé depuis (OUT-10)",
    { timeout: 360_000 },
    async () => {
      // Sans ce contrôle, améliorer la lecture laisserait les documents déjà vus sur les
      // conclusions de l'ancienne, pour toujours et sans que rien ne le dise.
      const pdf = pdfDePages("acquis-perime.pdf", [prose(700), prose(500), prose(300), prose(200)]);
      const premier = await rejouerParOracle(pdf, dossierSansPiste, commun);
      expect(premier.acquis).toBeDefined();
      const vieilli = { ...premier.acquis!, voie: { id: "voie-sans-maniere-de-lire", version: VERSION_DE_LA_VOIE + 1 } };
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, { ...commun, acquis: vieilli });
      expect(rejeu.journal.join(" ")).toMatch(/acquis écarté : il vient de .* et la lecture a changé depuis/);
    },
  );

  siTesseract(
    "ne retient rien d'une exploration arrêtée par son budget (REC-02)",
    { timeout: 360_000 },
    async () => {
      // Se souvenir de « je n'ai pas fini » autoriserait plus tard à conclure de ce qu'on n'a pas
      // vu. Le filet ne doit donc jamais produire d'acquis, même quand il s'est refermé près du but.
      const pages = [0, 1, 2, 3].map(() => [marque(70, 620, 7), marque(70, 320, 7), prose(760)].join("\n"));
      const pdf = pdfDePages("acquis-budget.pdf", pages);
      const rejeu = await rejouerParOracle(pdf, dossierSansPiste, {
        ...commun,
        budgetExploration: { paires: 1, secondes: 3600 },
      });
      expect(rejeu.journal.join(" ")).toMatch(/exploration arrêtée/);
      expect(rejeu.acquis, "rien n'est retenu d'une exploration qui n'a pas conclu").toBeUndefined();
    },
  );
});

describe("lire ce qui est écrit autour d'un signe (OUT-10)", () => {
  /** La fenêtre d'une marque porte déjà un dixième de marge de chaque côté : elle vaut 1,2 fois
   *  le signe. L'élargir d'une taille de signe des quatre côtés la porte donc à 3,2 fois. */
  it("s'ouvre d'une taille de signe dans les quatre directions (OUT-10)", () => {
    // Un signe de 100 × 50, dont la fenêtre fait 120 × 60 et commence dix unités plus haut.
    expect(autourDeLaMarque({ x: 110, y: 205, l: 120, h: 60 })).toEqual({ x: 10, y: 155, l: 320, h: 160 });
  });

  it("ne sort pas de la page par le haut ni par la gauche (OUT-10)", () => {
    const vue = autourDeLaMarque({ x: 5, y: 3, l: 120, h: 60 });
    expect(vue.x, "une marque près du bord ne demande pas d'abscisse négative").toBe(0);
    expect(vue.y).toBe(0);
  });

  it("le budget d'exploration suit le nombre de façons de lire (OUT-10)", () => {
    // Ce qui a été mesuré est un nombre d'endroits ; le compte d'essais en est le produit par le
    // nombre de façons. Figé, il rognerait les endroits couverts le jour où une façon s'ajoute,
    // sans que personne l'ait voulu — et la voie s'abstiendrait là où elle concluait.
    expect(BUDGET_EXPLORATION.paires % MOTIFS.length, "le budget est un nombre entier d'endroits").toBe(0);
    expect(BUDGET_EXPLORATION.paires / MOTIFS.length, "128 endroits, soit 1,4 fois le maximum observé").toBe(128);
  });
});
