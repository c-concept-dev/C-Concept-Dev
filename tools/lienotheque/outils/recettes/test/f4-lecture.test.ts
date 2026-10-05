// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { PRESENCE_MINIMALE, appui, chargerRecette, interpreter, lireLot, preparerLot, type PageAlire } from "../src/index.js";

/** Redresser et lire 42 clichés prend deux minutes : on garde les lectures entre deux exécutions.
 *  Le cache ne contient que des numéros et des positions — rien du document lui-même. */
const CACHE = coin(ouvrirCache({ avertir: (message) => console.warn(message) }), "lectures");
const LOT = { pages: 42, cache: CACHE } as const;

/** Lecture de F4, méthode photographiée en doubles pages (A2).
 *
 *  La recette seule décrit ce document : pas de libellé devant les numéros, deux pages par
 *  cliché, pastille sous le numéro avec une étiquette de disque. Aucun code ne connaît ce livre.
 *
 *  Fixture sous droits : ces contrôles se sautent proprement ailleurs. On ne lit que trois
 *  clichés — le compte complet est l'affaire du banc. */

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));
const siF4 = existsSync(F4) && tesseractDisponible() ? it : it.skip;

describe("préparation du lot selon la recette (OUT-03, A2)", () => {
  siF4(
    "rend deux pages par cliché, chacune sachant son côté et son rang",
    async () => {
      // La préparation est un flux : on le rassemble ici, trois pages tiennent en mémoire.
      const pages: PageAlire[] = [];
      for await (const page of preparerLot(F4, RECETTE, { pages: 3 })) pages.push(page);
      expect(pages).toHaveLength(6);
      expect(pages.map((page) => page.cote)).toEqual(["gauche", "droite", "gauche", "droite", "gauche", "droite"]);
      expect(pages.map((page) => page.rang)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(pages.map((page) => page.index)).toEqual([0, 0, 1, 1, 2, 2]);
    },
    900_000,
  );
});

describe("lecture d'une double page de F4 (OUT-07, A2)", () => {
  siF4(
    "lit les numéros sans libellé, dans la marge extérieure de chaque page",
    async () => {
      // Clichés 39 à 41 : les pages imprimées 78 à 83, que l'on sait porter 179 à 193.
      const lues = (await lireLot(F4, RECETTE, LOT)).slice(78, 84);

      const numeros = lues.flatMap((page) => page.elements.map((element) => element.numero));
      for (const attendu of [184, 185, 186, 187, 189, 190, 191, 192, 193])
        expect(numeros, `l'élément ${attendu} est lu`).toContain(attendu);
    },
    1_800_000,
  );

  siF4(
    "trouve la pastille sous le numéro et lit son chiffre, étiquette de disque comprise",
    async () => {
      const lues = (await lireLot(F4, RECETTE, LOT)).slice(80, 82);
      const parNumero = new Map(lues.flatMap((page) => page.elements).map((element) => [element.numero, element]));

      // Sur ces deux pages, trois éléments portent un repère : 187 pour la piste 13, 189 et 191
      // pour la 14. Dans ce livre, chaque élément d'une piste porte son repère, pas seulement le
      // premier — c'est pourquoi 189 et 191 portent le même.
      let appuyees = 0;
      for (const [numero, piste] of [
        [187, 13],
        [189, 14],
        [191, 14],
      ] as const) {
        const element = parNumero.get(numero);
        expect(element, `l'élément ${numero} est lu`).toBeDefined();
        expect(element!.presencePiste, `une pastille est vue sous ${numero}`).toBeGreaterThanOrEqual(PRESENCE_MINIMALE);
        expect(element!.pisteLue, `la pastille de ${numero} est lue`).toBeDefined();
        if (appui(element!.pisteLue!, piste) > 0) appuyees += 1;
      }
      // Un moteur d'OCR perd ou ajoute parfois un chiffre sur un pavé sombre. Ce qui compte est
      // que la majorité des lectures appuie la bonne piste : la suite redresse le reste, et c'est
      // elle qui décide (voir pistes.ts).
      expect(appuyees, "au moins deux lectures sur trois appuient leur piste").toBeGreaterThanOrEqual(2);

      // Et les autres n'en portent pas : une pastille vue partout ne vaudrait rien.
      for (const numero of [185, 186, 190, 192]) {
        const element = parNumero.get(numero);
        if (element === undefined) continue;
        expect(element.pisteLue, `l'élément ${numero} n'ouvre pas de piste`).toBeUndefined();
      }
    },
    1_800_000,
  );

  siF4(
    "numérote les pages du cliché, la gauche portant le pair",
    async () => {
      const resultat = interpreter((await lireLot(F4, RECETTE, LOT)).slice(76, 84), RECETTE);

      const parNumero = new Map(resultat.lignes.map((ligne) => [ligne.numero, ligne.pageImprimee]));
      expect(parNumero.get(187), "187 est sur la page 80, à gauche").toBe(80);
      expect(parNumero.get(189), "189 est sur la page 81, à droite").toBe(81);
      expect(parNumero.get(193)).toBe(81);

      for (const page of resultat.pages)
        if (page.cote === "gauche" && page.pageImprimee !== undefined)
          expect(page.pageImprimee % 2, `la page gauche ${page.pageImprimee} est paire`).toBe(0);
    },
    1_800_000,
  );

  siF4(
    "répare un numéro mal lu quand la suite le force",
    async () => {
      // 183 revient parfois en « 13 » : entre 182 et 184 il n'y a qu'une place et qu'un numéro.
      const resultat = interpreter((await lireLot(F4, RECETTE, LOT)).slice(76, 84), RECETTE);
      const numeros = resultat.lignes.map((ligne) => ligne.numero);
      expect(numeros).toContain(183);
      expect(numeros, "la suite reste croissante").toEqual([...numeros].sort((a, b) => a - b));
    },
    1_800_000,
  );
});
