// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chargerRecette, comparer, rejouer } from "@lienotheque/recettes";
import { jetonDacces, transportValidationCiblesVersWorker, validationStructurelleCiblee } from "../src/index.js";

const pdf = process.env["LIENOTHEQUE_FUNK_FUSION_PDF"];
const medias = process.env["LIENOTHEQUE_FUNK_FUSION_MEDIAS"];
const base = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"];
const jeton = base === undefined ? undefined : jetonDacces();
const disponible =
  pdf !== undefined &&
  medias !== undefined &&
  base !== undefined &&
  jeton !== undefined &&
  existsSync(pdf) &&
  existsSync(medias);

describe("Funk Fusion avec le repli structurel réel", () => {
  const surCorpus = disponible ? it : it.skip;

  surCorpus(
    "relie les 98 pistes sans faux lien ni supplément",
    async () => {
      const racine = join(import.meta.dirname, "../../..");
      const recette = chargerRecette(
        JSON.parse(readFileSync(join(racine, "fixtures/recettes/methode-numero-compose-piste.v2.json"), "utf8")),
      );
      const reference = JSON.parse(
        readFileSync(join(racine, "fixtures/references/funk-fusion-bass-appariement.json"), "utf8"),
      ) as { appariements: [number, number][] };
      const joue = await rejouer(pdf!, medias!, recette, {
        cache: process.env["LIENOTHEQUE_CACHE_LECTURES"],
        validationStructurelle: validationStructurelleCiblee(
          transportValidationCiblesVersWorker(base!, jeton!),
          process.env["LIENOTHEQUE_CACHE_VALIDATIONS"] === undefined
            ? {}
            : { cache: process.env["LIENOTHEQUE_CACHE_VALIDATIONS"] },
        ),
      });
      const score = comparer(
        joue.resultat.lignes,
        reference.appariements.map(([numero, piste]) => ({ numero, piste })),
      );

      expect(score).toMatchObject({ justes: 98, manquants: [], fautifs: [], supplementaires: [] });
      expect(joue.association.orphelins).toEqual([]);
    },
    180_000,
  );
});
