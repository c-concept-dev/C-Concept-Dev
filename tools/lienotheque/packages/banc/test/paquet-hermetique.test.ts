// @vitest-environment node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chargees, estMacho, fuites, machoDuPaquet, referencesDuPaquet } from "../src/paquet-hermetique.js";

/** Le paquet des moteurs ne charge rien de l'extérieur (lot 0b, étape 0).
 *
 *  Le garde-fou lui-même est dans `src/` ; ici on prouve d'abord qu'il **voit**, sur les
 *  références réellement mesurées le 9 novembre 2026, puis on le lance sur le paquet réel.
 *  L'ordre compte, et plus encore ici qu'ailleurs : le paquet est ignoré par Git, donc absent de
 *  l'intégration continue. Un garde-fou qu'on ne vérifierait que sur l'état du disque y serait
 *  sauté en silence, et un saut silencieux est indistinguable d'un succès. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const MOTEURS = `${RACINE}apps/app/src-tauri/moteurs`;

/** Ce que le paquet embarquait vraiment quand le défaut a été trouvé. */
const MESURE_DU_9_NOVEMBRE = [
  { binaire: "lib/libleptonica.6.dylib", nom: "/opt/homebrew/opt/jpeg-turbo/lib/libjpeg.8.dylib" },
  { binaire: "lib/libleptonica.6.dylib", nom: "/opt/homebrew/opt/webp/lib/libwebp.7.dylib" },
  { binaire: "lib/libwebpmux.3.1.2.dylib", nom: "@rpath/libwebp.7.dylib" },
  { binaire: "lib/libtesseract.5.dylib", nom: "@loader_path/libleptonica.6.dylib" },
  { binaire: "bin/tesseract", nom: "/usr/lib/libcurl.4.dylib" },
];

/** Les fichiers que le paquet contenait alors : les noms COMPLETS, pas les sonames courts. */
const EMBARQUES = ["lib/libjpeg.8.3.2.dylib", "lib/libwebp.7.2.0.dylib", "lib/libleptonica.6.dylib"];

describe("la règle voit ce qu'elle doit voir", () => {
  it("refuse un chemin absolu hors système, et dit que c'est la machine de fabrication", () => {
    const trouvees = fuites(MESURE_DU_9_NOVEMBRE, EMBARQUES);
    const absolues = trouvees.filter((fuite) => fuite.nom.startsWith("/opt/homebrew"));
    expect(absolues).toHaveLength(2);
    expect(absolues[0]?.pourquoi).toMatch(/machine qui a fabriqué/);
  });

  it("refuse un soname court que le paquet ne porte pas, même sans chemin absolu", () => {
    // C'est le cas qui avait échappé à la lecture à l'œil : `@rpath/libwebp.7.dylib` n'a l'air de
    // rien, mais le paquet contient `libwebp.7.2.0.dylib` — le chargeur ne les apparie pas.
    const trouvees = fuites([{ binaire: "lib/libwebpmux.3.1.2.dylib", nom: "@rpath/libwebp.7.dylib" }], EMBARQUES);
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]?.pourquoi).toMatch(/n'est pas dans le paquet/);
  });

  it("laisse passer un nom relatif que le paquet porte vraiment", () => {
    expect(fuites([{ binaire: "lib/libtesseract.5.dylib", nom: "@loader_path/libleptonica.6.dylib" }], EMBARQUES)).toEqual(
      [],
    );
  });

  it("laisse passer les bibliothèques du système, présentes partout", () => {
    const systeme = [
      { binaire: "bin/tesseract", nom: "/usr/lib/libcurl.4.dylib" },
      { binaire: "bin/node", nom: "/System/Library/Frameworks/Security.framework/Versions/A/Security" },
    ];
    expect(fuites(systeme, [])).toEqual([]);
  });

  it("compte trois fuites sur les cinq références mesurées, et pas davantage", () => {
    // Cinq références, trois fuites : deux chemins absolus et un soname court. Les deux autres
    // sont légitimes — un `@loader_path` que le paquet porte, et une bibliothèque du système.
    expect(fuites(MESURE_DU_9_NOVEMBRE, EMBARQUES)).toHaveLength(3);
  });

  it("ne prend pas une donnée pour un binaire", () => {
    expect(estMacho(`${RACINE}package.json`)).toBe(false);
  });
});

const siPaquet = existsSync(MOTEURS) ? describe : describe.skip;

siPaquet("le paquet réellement embarqué sur cette machine", () => {
  it("ne charge rien hors du paquet, hors bibliothèques du système", () => {
    const { references, fichiers } = referencesDuPaquet(MOTEURS);
    const trouvees = fuites(references, fichiers);
    expect(
      trouvees.map((fuite) => `${fuite.binaire} → ${fuite.nom} (${fuite.pourquoi})`),
      "le paquet dépend de la machine qui l'a fabriqué : il ne se chargerait pas chez un testeur",
    ).toEqual([]);
  });

  it("embarque bien les trois moteurs, et leurs références sont lisibles", () => {
    const machos = machoDuPaquet(MOTEURS).map((chemin) => chemin.slice(MOTEURS.length + 1));
    expect(machos).toContain("bin/tesseract");
    expect(machos).toContain("bin/node");
    expect(machos).toContain("bin/sf");
    // Lisibles : si `otool` ne rendait plus rien, le contrôle ci-dessus passerait au vert sur une
    // liste vide. On exige donc que le binaire le plus dépendant cite bel et bien des choses.
    expect(chargees(`${MOTEURS}/bin/tesseract`).length).toBeGreaterThan(0);
  });
});

it("dit pourquoi il se saute, au lieu de se taire", () => {
  // Le contrôle qui garde le saut honnête. Le paquet est ignoré par Git : sur la CI il n'existe
  // pas, et les deux contrôles ci-dessus se sautent. Ce qui ne se saute jamais, c'est la règle
  // elle-même, éprouvée plus haut sur des références mesurées.
  expect(MOTEURS).toMatch(/src-tauri\/moteurs$/);
  expect(fuites([{ binaire: "x", nom: "/opt/homebrew/lib/libx.dylib" }], [])).toHaveLength(1);
});
