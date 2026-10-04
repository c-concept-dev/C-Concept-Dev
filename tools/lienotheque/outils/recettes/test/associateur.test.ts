import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LigneInterpretee } from "@lienotheque/contrats";
import { associer, chargerRecette, dureeReliee, lireNomMedia, pisteDuNom, type Media } from "../src/index.js";

const RECETTE = chargerRecette(
  JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")),
);

const ligne = (numero: number, piste: number, confiance = 1, disque = 1): LigneInterpretee => ({
  numero,
  pageImprimee: 3,
  piste,
  disque,
  sourcePiste: "pastille",
  confiance,
});

const media = (piste: number, nom: string, dureeS?: number): Media => ({
  piste,
  nom,
  empreinte: String(piste).padStart(64, "0"),
  ...(dureeS === undefined ? {} : { dureeS }),
});

describe("ce qu'un nom de fichier laisse deviner (REC-05)", () => {
  it("sans motif, prend le premier nombre", () => {
    expect(pisteDuNom("Track 45")).toBe(45);
    expect(pisteDuNom("70's Funk 12")).toBe(70);
    expect(pisteDuNom("sans numéro")).toBeUndefined();
  });

  it("avec le motif de la recette, lit chaque champ à sa place", () => {
    const lu = lireNomMedia("1-41 Latin Riffs - 400 Pg.127", "{disque}-{piste} {style} - {element} Pg.{page}");
    expect(lu).toEqual({ disque: 1, piste: 41, element: 400, page: 127 });
  });

  it("le motif l'emporte sur le premier nombre venu", () => {
    // Sans motif, « 1-14 … » donnerait la piste 1 : c'est le numéro de disque.
    expect(pisteDuNom("1-14 James Jamerson - 191 Pg.81")).toBe(1);
    expect(lireNomMedia("1-14 James Jamerson - 191 Pg.81", "{disque}-{piste} {style} - {element} Pg.{page}").piste).toBe(14);
  });

  it("ne devine rien quand le nom ne suit pas le motif", () => {
    expect(lireNomMedia("Track 45", "{disque}-{piste} {style} - {element} Pg.{page}")).toEqual({});
  });

  it("supporte les caractères que les noms d'origine contiennent", () => {
    const lu = lireNomMedia("1-05 4_4 Blues And R&B - 136 Pg.69", "{disque}-{piste} {style} - {element} Pg.{page}");
    expect(lu).toMatchObject({ disque: 1, piste: 5, element: 136, page: 69 });
  });
});

describe("supports multiples (A3)", () => {
  it("la piste 3 du disque 2 n'est pas la piste 3 du disque 1", () => {
    const medias = [media(3, "disque1.mp3"), { ...media(3, "disque2.mp3"), disque: 2 }];
    const association = associer([ligne(1, 3, 1, 1), ligne(2, 3, 1, 2)], medias, RECETTE);
    expect(association.appariements[0]?.media?.nom).toBe("disque1.mp3");
    expect(association.appariements[1]?.media?.nom).toBe("disque2.mp3");
    expect(association.orphelins).toEqual([]);
  });

  it("un élément d'un support dont on n'a pas le média reste sans média", () => {
    const association = associer([ligne(1, 3, 1, 2)], [media(3, "disque1.mp3")], RECETTE);
    expect(association.appariements[0]?.media).toBeUndefined();
    expect(association.orphelins, "le média du disque 1 n'est réclamé par personne").toEqual([3]);
    expect(association.manquants).toEqual([3]);
  });
});

describe("association des médias (OUT-10)", () => {
  it("relie chaque élément au média qui porte sa piste", () => {
    const association = associer([ligne(1, 1), ligne(2, 2)], [media(1, "Track 01.mp3"), media(2, "Track 02.mp3")], RECETTE);
    expect(association.appariements.map((a) => a.media?.nom)).toEqual(["Track 01.mp3", "Track 02.mp3"]);
    expect(association.appariements.every((a) => a.statut === "auto")).toBe(true);
  });

  it("ne fabrique aucune position : faute de segment vérifié, la paire est inconnue (ANC-03)", () => {
    const association = associer([ligne(1, 1)], [media(1, "Track 01.mp3", 180)], RECETTE);
    expect(association.appariements[0]?.segment).toBe("inconnu");
  });

  it("signale les médias qu'aucun élément ne réclame", () => {
    const association = associer([ligne(1, 1)], [media(1, "a.mp3"), media(7, "b.mp3"), media(5, "c.mp3")], RECETTE);
    expect(association.orphelins).toEqual([5, 7]);
  });

  it("signale les pistes que la page réclame et qu'aucun média ne porte", () => {
    const association = associer([ligne(1, 1), ligne(2, 9)], [media(1, "a.mp3")], RECETTE);
    expect(association.manquants).toEqual([9]);
    expect(association.appariements[1]?.statut).toBe("a_verifier");
  });

  it("met à vérifier ce qui passe sous le seuil de la recette", () => {
    const association = associer([ligne(1, 1, 0.4)], [media(1, "a.mp3")], RECETTE);
    expect(RECETTE.validation.seuil_confiance).toBe(0.6);
    expect(association.appariements[0]?.statut).toBe("a_verifier");
  });

  it("plusieurs éléments peuvent pointer la même piste", () => {
    const association = associer([ligne(1, 1), ligne(2, 1)], [media(1, "a.mp3")], RECETTE);
    expect(association.appariements.map((a) => a.media?.nom)).toEqual(["a.mp3", "a.mp3"]);
    expect(association.orphelins).toEqual([]);
  });

  it("à deux médias pour une piste, choisit par le nom : deux exécutions, un même résultat", () => {
    const medias = [media(1, "b.mp3"), media(1, "a.mp3")];
    expect(associer([ligne(1, 1)], medias, RECETTE).appariements[0]?.media?.nom).toBe("a.mp3");
    expect(associer([ligne(1, 1)], [...medias].reverse(), RECETTE).appariements[0]?.media?.nom).toBe("a.mp3");
  });

  it("un nom de fichier ne contredit jamais une piste lue sur la page (REC-05)", () => {
    // La page a lu la piste 2 ; le seul média disponible s'appelle « Track 99 ».
    const association = associer([ligne(1, 2)], [media(99, "Track 99.mp3")], RECETTE);
    expect(association.appariements[0]?.media).toBeUndefined();
    expect(association.appariements[0]?.ligne.piste, "la page garde raison").toBe(2);
    expect(association.manquants).toEqual([2]);
  });
});

describe("durée reliée", () => {
  it("compte chaque piste une fois, même citée plusieurs fois", () => {
    expect(dureeReliee(associer([ligne(1, 1), ligne(2, 1), ligne(3, 2)], [media(1, "a.mp3", 100), media(2, "b.mp3", 50)], RECETTE))).toBe(150);
  });

  it("ne rend rien plutôt qu'une somme incomplète", () => {
    expect(dureeReliee(associer([ligne(1, 1)], [media(1, "a.mp3")], RECETTE))).toBeUndefined();
  });
});
