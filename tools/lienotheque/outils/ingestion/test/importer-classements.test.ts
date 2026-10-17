// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SchemaBibliotheque } from "@lienotheque/contrats";
import { importerLesClassements } from "../src/index.js";

/** Reprendre le classement d'une base existante, sans rien inventer (CLA-01, CLA-03).
 *
 *  L'import apparie un **nom de fichier** à un ouvrage, puis l'ouvrage à son approche. Deux
 *  tables, deux occasions de perdre un document en silence — et c'est le silence qu'on refuse
 *  ici : tout document non classé sort nommé, avec sa raison.
 *
 *  Aucun mot de domaine : les axes et les valeurs sont nommés par des lettres.
 */

const EMPREINTE = (n: number): string => String(n).repeat(64).slice(0, 64);

const SCHEMA = SchemaBibliotheque.parse({
  cle: "essai",
  nom: "Essai",
  langue: "fr",
  version: 1,
  axes: [
    {
      cle: "a",
      nom: "A",
      nature: "referentiel",
      cardinalite: "une",
      valeurs: [{ cle: "v1", nom: "V1" }, { cle: "v2", nom: "V2" }],
      alias: [],
    },
    {
      cle: "b",
      nom: "B",
      nature: "referentiel",
      cardinalite: "une",
      valeurs: [{ cle: "fr", nom: "Français" }],
      alias: [],
    },
  ],
});

const AXES = { approche: "a", langue: "b" } as const;

describe("l'import reprend le classement d'une base existante", () => {
  it("apparie malgré la forme Unicode du nom de fichier", () => {
    // Le piège mesuré sur les vraies données : la table d'appariement porte les noms en NFD —
    // la forme du système de fichiers macOS — et la bibliothèque les porte en NFC. Les deux
    // chaînes s'affichent à l'identique et comparent **inégal**. Sans normalisation, seuls les
    // titres sans accent s'apparient : deux sur cinq dans la mini-bibliothèque, et en silence.
    const nfd: string = "The\u0300se sche\u0301mas.pdf";
    const nfc: string = "Thèse schémas.pdf";
    expect(nfd === nfc, "les deux formes doivent bien être distinctes pour que ce test prouve quelque chose").toBe(false);

    const fait = importerLesClassements({
      schema: SCHEMA,
      axes: AXES,
      documents: [{ empreinte: EMPREINTE(1), nom: nfc }],
      apparies: [{ fichier: `dossier/${nfd}`, book_id: "ouvrage-1" }],
      approches: [{ book_id: "ouvrage-1", approach: "v1", language: "fr" }],
    });

    expect(fait.ecartes, "aucun écart attendu").toEqual([]);
    expect(fait.sansAppariement).toEqual([]);
    expect(fait.table[EMPREINTE(1)]?.axes["a"]).toEqual({ type: "reference", valeurs: ["v1"] });
    expect(fait.table[EMPREINTE(1)]?.axes["b"]).toEqual({ type: "reference", valeurs: ["fr"] });
    expect(fait.table[EMPREINTE(1)]?.origine).toBe("import");
  });

  it("laisse sans rien un document qu'aucun appariement ne nomme, et le dit", () => {
    const fait = importerLesClassements({
      schema: SCHEMA,
      axes: AXES,
      documents: [{ empreinte: EMPREINTE(2), nom: "inconnu.pdf" }],
      apparies: [],
      approches: [],
    });
    expect(fait.table).toEqual({});
    expect(fait.sansAppariement).toEqual(["inconnu.pdf"]);
  });

  it("n'importe pas un ouvrage mis hors périmètre, et nomme la raison", () => {
    const fait = importerLesClassements({
      schema: SCHEMA,
      axes: AXES,
      documents: [{ empreinte: EMPREINTE(3), nom: "outil.pdf" }],
      apparies: [{ fichier: "outil.pdf", book_id: "hors-jeu" }],
      approches: [{ book_id: "hors-jeu", approach: "v1", language: "fr" }],
      horsPerimetre: ["hors-jeu"],
    });
    expect(fait.table).toEqual({});
    expect(fait.ecartes[0]?.nom).toBe("outil.pdf");
    expect(fait.ecartes[0]?.raison).toMatch(/hors périmètre/i);
  });

  it("un ouvrage sans approche connue sort nommé, au lieu d'être rangé au hasard", () => {
    const fait = importerLesClassements({
      schema: SCHEMA,
      axes: AXES,
      documents: [{ empreinte: EMPREINTE(4), nom: "orphelin.pdf" }],
      apparies: [{ fichier: "orphelin.pdf", book_id: "sans-approche" }],
      approches: [],
    });
    expect(fait.table).toEqual({});
    expect(fait.ecartes[0]?.raison).toMatch(/aucune approche/i);
  });

  it("une valeur que le schéma ignore écarte ce document seul, et non tout l'import", () => {
    // Deux cent seize documents ne doivent pas être perdus parce qu'un seul porte une valeur
    // inconnue. L'import continue, et l'écart se lit.
    const fait = importerLesClassements({
      schema: SCHEMA,
      axes: AXES,
      documents: [
        { empreinte: EMPREINTE(5), nom: "bon.pdf" },
        { empreinte: EMPREINTE(6), nom: "mauvais.pdf" },
      ],
      apparies: [
        { fichier: "bon.pdf", book_id: "ouvrage-bon" },
        { fichier: "mauvais.pdf", book_id: "ouvrage-mauvais" },
      ],
      approches: [
        { book_id: "ouvrage-bon", approach: "v2", language: "fr" },
        { book_id: "ouvrage-mauvais", approach: "valeur-inventee", language: "fr" },
      ],
    });
    expect(Object.keys(fait.table), "le bon document est rangé malgré l'autre").toEqual([EMPREINTE(5)]);
    expect(fait.ecartes).toHaveLength(1);
    expect(fait.ecartes[0]?.nom).toBe("mauvais.pdf");
    expect(fait.ecartes[0]?.raison).toContain("valeur-inventee");
  });
});
