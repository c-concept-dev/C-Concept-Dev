import { describe, expect, it } from "vitest";
import type { PageLue } from "@lienotheque/contrats";
import { pageDeTexte } from "../src/passages.js";

/** Le repère des mots voyage avec eux, et rien de ce qui est écrit n'en dépend (OUT-03, OUT-04).
 *
 *  ## Pourquoi ce champ est apparu
 *
 *  Jusqu'au 6 novembre 2026, la largeur du repère où les mots sont mesurés était une **convention
 *  tacite** : le rendu à 1 800 pixels, non tourné. Le jour où la lecture s'est mise à redresser
 *  les pages, la convention s'est brisée en silence — une page tournée d'un quart de tour a pour
 *  largeur la **hauteur** du rendu, et tout découpage calculé sur l'ancienne convention tombait
 *  ailleurs sur la page. Rien ne cassait : les mots étaient justes, l'image était juste, et seul
 *  leur rapprochement était faux.
 *
 *  ## Et pourquoi rien d'ancien n'en souffre
 *
 *  Ce qui est **persisté** — les zones d'une version, les repères d'un élément — est **relatif**,
 *  entre 0 et 1, et le contrat le dit : « l'image lue, l'image affichée et l'image agrandie n'ont
 *  pas les mêmes dimensions, et seule la part est comparable entre les trois ».
 *
 *  Une part se calcule depuis les dimensions que `PageLue` a **toujours** portées. Le champ neuf
 *  ne fait que les rendre visibles plus loin dans la chaîne : il n'en change aucune.
 *
 *  Le cache de lecture n'est pas concerné non plus : il garde des `PageLue`, jamais des
 *  `PageDeTexte`. Monter sa version invaliderait tous les caches du corpus pour un champ qui n'y
 *  est pas. */

const page = (largeur: number, hauteur: number): PageLue => ({
  index: 1,
  source: "ocr",
  unite: "pixel",
  largeur,
  hauteur,
  mots: [{ texte: "INTRODUCTION", x: 387, y: 212, l: 480, h: 28, confiance: 0.96 }],
});

describe("le repère des mots voyage avec eux (OUT-03)", () => {
  it("porte les dimensions dans lesquelles les mots ont été mesurés", () => {
    const lue = pageDeTexte(page(1800, 2358));
    expect(lue.largeur).toBe(1800);
    expect(lue.hauteur).toBe(2358);
  });

  it("porte celles d'une page tournée, qui ne sont pas celles du rendu", () => {
    // Une page rendue à 1 800 puis tournée d'un quart de tour : sa largeur est 2 358.
    const lue = pageDeTexte(page(2358, 1800));
    expect(lue.largeur, "et non 1 800, qui était la convention tacite").toBe(2358);
  });

  it("laisse une part inchangée : c'est elle qu'on écrit, et elle ne dépend que de la page", () => {
    // La preuve que rien d'écrit avant ne bouge. Une zone persistée est une **part**, calculée
    // depuis les dimensions que la page a toujours portées. Le champ neuf ne les change pas.
    const ancienne = page(1800, 2358);
    const lue = pageDeTexte(ancienne);
    const mot = lue.mots![0]!;
    const part = { x: mot.x / ancienne.largeur, y: mot.y / ancienne.hauteur };
    expect(part.x).toBeCloseTo(387 / 1800, 10);
    expect(part.y).toBeCloseTo(212 / 2358, 10);
  });
});
