import { describe, expect, it } from "vitest";
import { ACCUEIL, adresseDe, destinationDe, type Destination } from "../src/navigation.js";

/** B4 : l'adresse dit où l'on est. Elle survit au rechargement, se copie et se met en favori —
 *  c'est ce qui permet de reprendre une lecture (SYN-03) et de partager un cas à vérifier. */

const BIB = "0190f0a0-0000-7000-8000-0000000000c1";
const ANCRE = "0190f0a0-0000-7000-8000-000000000901";

describe("navigation : une adresse par écran (B4)", () => {
  const destinations: readonly Destination[] = [
    { ecran: "accueil" },
    { ecran: "reglages" },
    { ecran: "catalogue", bibliothequeId: BIB },
    { ecran: "verifier", bibliothequeId: BIB },
    { ecran: "verifier", bibliothequeId: BIB, casId: "0190f0a0-0000-7000-8000-000000000d01" },
    { ecran: "lecteur", bibliothequeId: BIB, page: 12 },
    { ecran: "lecteur", bibliothequeId: BIB, page: 12, ancreId: ANCRE },
  ];

  it("relit ce qu'elle écrit, pour chaque écran", () => {
    for (const destination of destinations) expect(destinationDe(adresseDe(destination)), adresseDe(destination)).toEqual(destination);
  });

  it("écrit une adresse lisible, pas un jeton opaque", () => {
    expect(adresseDe({ ecran: "lecteur", bibliothequeId: BIB, page: 127, ancreId: ANCRE })).toBe(
      `#bibliotheque/${BIB}/page/127/element/${ANCRE}`,
    );
    expect(adresseDe({ ecran: "verifier", bibliothequeId: BIB })).toBe(`#bibliotheque/${BIB}/verifier`);
  });

  it("ramène à l'accueil ce qu'elle ne comprend pas, au lieu d'afficher une erreur", () => {
    for (const fragment of ["", "#", "#n’importe quoi", "#bibliotheque", "#bibliotheque/"])
      expect(destinationDe(fragment), fragment).toEqual(ACCUEIL);
  });

  it("tombe sur le catalogue quand le numéro de page n'en est pas un", () => {
    expect(destinationDe(`#bibliotheque/${BIB}/page/zéro`)).toEqual({ ecran: "catalogue", bibliothequeId: BIB });
    expect(destinationDe(`#bibliotheque/${BIB}/page/0`)).toEqual({ ecran: "catalogue", bibliothequeId: BIB });
  });

  it("accepte le fragment avec ou sans dièse : c'est la même adresse", () => {
    expect(destinationDe(`bibliotheque/${BIB}/page/12`)).toEqual(destinationDe(`#bibliotheque/${BIB}/page/12`));
  });
});
