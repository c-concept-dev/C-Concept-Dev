import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { preparerLot } from "../src/banc.js";
import { chargerRecette } from "../src/schema.js";

/** OUT-15 — la feuille désignée par une page préparée est la feuille physique du document.
 *
 *  **Test rouge du 5 novembre 2026. Il échoue aujourd'hui, et c'est ce qu'on lui demande.**
 *
 *  `pagesEnGris` saute toute feuille qui ne porte aucune image (`banc.ts` — « Une page native
 *  sans aucune image n'a pas de repère photographié à lire »), et `preparerLot` n'incrémente son
 *  `index` que pour les feuilles qu'il a émises. L'index n'est donc pas le rang de la feuille :
 *  c'est le rang dans la suite des feuilles retenues. Les deux coïncident tant qu'aucune feuille
 *  n'est sautée, et divergent dès la première.
 *
 *  En aval, `instantane.ts` sert l'image par cet index (`entree.imageDePage?.(page.index)`) face
 *  à des images numérotées **par feuille** (`pages-images.ts`), et `lot.ts` pose le numéro
 *  imprimé et le début d'élément au rang `index + PREMIER_RANG`. Mesuré le 5 novembre sur la
 *  bibliothèque musicale : les cinquante-deux liens de `ca36cf98` sont tous posés **une page
 *  trop tôt** — « Workout 3 » et le folio 10 sont sur la feuille 12, affichés page 11.
 *
 *  Deux extraits, fabriqués par la logique d'`extracteur-pages.html`
 *  (`outils/recettes/mesures/extraire-a1.ts`) :
 *    (a) une feuille sans image au début            → décalage de 1, constant ;
 *    (b) une majorité de feuilles sans image        → décalages 0, 2 puis 3.
 *  Le même correctif doit faire passer les deux.
 *
 *  Les œuvres ne sont jamais versionnées : les extraits vivent sous `fixtures/fichiers/`, ignoré
 *  par Git, et seules leurs empreintes sont au dépôt (`fixtures/references/`). Sans eux, le
 *  contrôle se tait — mais il ne se tait pas si un extrait présent ne porte pas l'empreinte
 *  attendue : ce serait juger un autre fichier. */

const RACINE = join(import.meta.dirname, "../../..");
const EXTRAITS = join(RACINE, "fixtures/fichiers/A1");
const REFERENCE = join(RACINE, "fixtures/references/a1-feuille-contre-index.json");

/** Une recette qui ne redresse ni ne coupe : `preparerLot` rend alors la feuille telle quelle,
 *  et ce qu'on éprouve est la numérotation, rien d'autre. */
const RECETTE = chargerRecette(
  JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-numero-compose-piste.v1.json"), "utf8")),
);

type Verite = {
  readonly sha256: string;
  readonly feuilles: number;
  readonly feuillesAvecImage: readonly number[];
  readonly indexAttendus: readonly number[];
  readonly pourquoi: string;
};

const verites = existsSync(REFERENCE)
  ? (JSON.parse(readFileSync(REFERENCE, "utf8")) as Record<string, Verite>)
  : {};

describe("OUT-15 — l'index d'une page préparée désigne sa feuille physique", () => {
  for (const [nom, verite] of Object.entries(verites)) {
    const chemin = join(EXTRAITS, nom);
    const present = existsSync(chemin);
    const siPresent = present ? it : it.skip;

    siPresent(`${nom} — ${verite.pourquoi} (OUT-15)`, async () => {
      // L'empreinte d'abord : un extrait refabriqué autrement n'éprouve plus la même chose.
      const octets = readFileSync(chemin);
      expect(createHash("sha256").update(octets).digest("hex"), `empreinte de ${nom}`).toBe(verite.sha256);

      const index: number[] = [];
      for await (const page of preparerLot(chemin, RECETTE)) index.push(page.feuille);

      expect(index.length, "une page préparée par feuille portant une image").toBe(
        verite.feuillesAvecImage.length,
      );
      expect(
        index,
        `les feuilles ${verite.feuillesAvecImage.join(", ")} de l'extrait portent une image ; ` +
          `leurs index doivent les désigner, pas compter les pages retenues`,
      ).toEqual([...verite.indexAttendus]);
    }, 600_000);
  }

  it("les vérités attendues des extraits A1 sont au dépôt", () => {
    expect(Object.keys(verites).length, `${REFERENCE} décrit les extraits`).toBeGreaterThan(0);
  });
});
