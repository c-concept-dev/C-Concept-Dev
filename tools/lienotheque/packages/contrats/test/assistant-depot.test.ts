import { describe, expect, it } from "vitest";
import { AnalyseDepot, ArchivePreparee } from "../src/index.js";

describe("assistant universel de dépôt (JOB-01, JOB-04, FMT-01)", () => {
  it("décrit des documents, des accompagnements et leurs doublons avant tout geste", () => {
    const analyse = AnalyseDepot.parse({
      fichiers: [
        {
          chemin: "/source/document.pdf",
          nom: "document.pdf",
          taille: 12,
          contenu: "documents",
          empreinte: "a".repeat(64),
          role: "principal",
        },
        {
          chemin: "/ailleurs/lecture.mp3",
          nom: "lecture.mp3",
          taille: 8,
          contenu: "audio",
          empreinte: "b".repeat(64),
          role: "accompagnement",
        },
      ],
      doublons: [],
      avertissements: [],
    });

    expect(analyse.fichiers.map((fichier) => fichier.contenu)).toEqual(["documents", "audio"]);
  });

  it("refuse une analyse qui invente un rôle ou une empreinte", () => {
    expect(() => AnalyseDepot.parse({ fichiers: [{ role: "devine" }], doublons: [], avertissements: [] })).toThrow();
  });

  it("valide le compte rendu d'une archive préparée", () => {
    expect(
      ArchivePreparee.parse({
        chemin: "/sortie/ensemble.zip",
        fichiers: 3,
        taille: 42,
        empreinte: "c".repeat(64),
      }).fichiers,
    ).toBe(3);
  });
});
