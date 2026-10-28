// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validationStructurelleCiblee } from "../src/index.js";

describe("validation structurelle ciblée", () => {
  it("ne rend que les cibles exactement localisées sur leur page candidate", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "lienotheque-validation-"));
    const document = join(dossier, "methode.pdf");
    writeFileSync(document, "temoin");
    try {
      const appels: string[][] = [];
      const valider = validationStructurelleCiblee(
        async (demande) => {
          appels.push([...demande.cibles]);
          return {
            document: demande.document,
            resultats: demande.cibles.map((cible) =>
              cible === "5.8" && demande.cibles.length === 1
                ? { cible, etat: "trouve" as const, page: 65, zone: { x: 0.09, y: 0.63, l: 0.04, h: 0.04 }, confiance: 0.95 }
                : { cible, etat: "incertain" as const, confiance: 0.4 },
            ),
            jetons: { entree: 100, sortie: 20 },
            outil: { nom: "validation-cibles-structurelles", version: "0.1.0" },
          };
        },
        {
          cache: join(dossier, "cache"),
          rendre: async (_chemin, numeros) =>
            numeros.map((numero) => ({
              numero,
              empreinte: String(numero).padStart(64, "0"),
              image: "AA==",
              typeMime: "image/png" as const,
              largeur: 100,
              hauteur: 200,
            })),
        },
      );

      const contexte = {
        chemin: document,
        recette: { preparation: { double_page: false } } as never,
        cibles: [
          { numero: 5008, numeroLu: "5.8", pagesPdf: [65] },
          { numero: 5017, numeroLu: "5.17", pagesPdf: [67] },
        ],
      };
      const attendu = [
        { numero: 5008, numeroLu: "5.8", pagePdf: 65, zone: { x: 0.09, y: 0.63, l: 0.04, h: 0.04 }, confiance: 0.95 },
      ];
      await expect(valider(contexte)).resolves.toEqual(attendu);
      expect(appels).toEqual([["5.8", "5.17"], ["5.8"], ["5.17"]]);
      await expect(valider(contexte)).resolves.toEqual(attendu);
      expect(appels, "le second rejeu vient entièrement du cache").toEqual([["5.8", "5.17"], ["5.8"], ["5.17"]]);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
