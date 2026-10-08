import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DescriptionBibliotheque, FICHIER_DESCRIPTION, TypeDeContenu } from "../src/index.js";

/** La description d'une bibliothèque (CLA-01, ANC-05).
 *
 *  Elle traverse l'assistant qui la crée, l'hôte qui l'écrit et la chaîne qui la lit. Trois
 *  frontières, donc un contrat — et non l'analyseur écrit à la main qui la lisait, lequel
 *  acceptait un identifiant absent en le transformant en « undefined ». */

const MINIMALE = {
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  schema: {
    cle: "recueil",
    nom: "Recueil",
    langue: "fr",
    version: 1,
    axes: [
      {
        cle: "niveau",
        nom: "Niveau",
        nature: "referentiel",
        cardinalite: "une",
        valeurs: [{ cle: "debutant", nom: "Débutant" }],
      },
    ],
  },
};

describe("ce qu'une description doit porter", () => {
  it("accepte une description minimale, et lui donne des contenus vides plutôt qu'absents", () => {
    const lu = DescriptionBibliotheque.safeParse(MINIMALE);
    expect(lu.success).toBe(true);
    expect(lu.success && lu.data.contenus, "une liste vide se parcourt ; une absence se teste").toEqual([]);
  });

  it("refuse une description sans identifiant — l'ancien lecteur en faisait « undefined »", () => {
    const { id: _retire, ...sansId } = MINIMALE;
    expect(DescriptionBibliotheque.safeParse(sansId).success).toBe(false);
  });

  it("refuse un identifiant qui n'est pas une clé stable", () => {
    for (const mauvais of ["Une Bibliothèque", "avec espace", "-commence-par-un-tiret", ""])
      expect(DescriptionBibliotheque.safeParse({ ...MINIMALE, id: mauvais }).success, mauvais).toBe(false);
  });

  it("refuse un nom vide : une bibliothèque sans nom ne se retrouve pas", () => {
    expect(DescriptionBibliotheque.safeParse({ ...MINIMALE, nom: "" }).success).toBe(false);
  });

  it("refuse un champ qu'on n'attendait pas, plutôt que de l'ignorer", () => {
    expect(DescriptionBibliotheque.safeParse({ ...MINIMALE, couleur: "bleu" }).success).toBe(false);
  });

  it("exige les trois mots, au singulier et au pluriel : « 1 éléments » n'a pas été écrit pour des gens", () => {
    const sansPluriel = { ...MINIMALE, mots: { ...MINIMALE.mots, element: { un: "clause" } } };
    expect(DescriptionBibliotheque.safeParse(sansPluriel).success).toBe(false);
  });

  it("exige un schéma qui tienne debout : au moins un axe", () => {
    const sansAxe = { ...MINIMALE, schema: { ...MINIMALE.schema, axes: [] } };
    expect(DescriptionBibliotheque.safeParse(sansAxe).success).toBe(false);
  });

  it("exige qu'un axe de référentiel porte ses valeurs", () => {
    const axeVide = {
      ...MINIMALE,
      schema: { ...MINIMALE.schema, axes: [{ ...MINIMALE.schema.axes[0]!, valeurs: [] }] },
    };
    expect(DescriptionBibliotheque.safeParse(axeVide).success).toBe(false);
  });
});

describe("les types de contenu", () => {
  it("disent ce que la bibliothèque attend, jamais ce que ses éléments sont", () => {
    // « audio » annonce des enregistrements ; ce qu'ils représentent vient du schéma (CLA-01).
    expect(TypeDeContenu.options).toEqual(["documents", "audio", "videos", "images"]);
  });

  it("refuse un type inventé", () => {
    expect(DescriptionBibliotheque.safeParse({ ...MINIMALE, contenus: ["partitions"] }).success).toBe(false);
  });
});

describe("les descriptions du dépôt", () => {
  const dossier = join(import.meta.dirname, "../../../fixtures/bibliotheques");

  for (const fichier of readdirSync(dossier).filter((f) => f.endsWith(".json")))
    it(`${fichier} suit le contrat`, () => {
      const lu = DescriptionBibliotheque.safeParse(JSON.parse(readFileSync(join(dossier, fichier), "utf8")));
      expect(lu.success ? "" : lu.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")).toBe("");
    });

  it("nomme le fichier à un seul endroit", () => {
    // L'assistant, l'hôte et la chaîne le nomment tous les trois : trois chaînes identiques
    // finissent par ne plus l'être.
    expect(FICHIER_DESCRIPTION).toBe("bibliotheque.json");
  });
});
