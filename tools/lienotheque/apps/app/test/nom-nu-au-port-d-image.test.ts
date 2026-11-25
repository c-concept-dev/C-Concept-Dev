// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** L'interface n'envoie au port d'image qu'un **nom nu** (lot `0z nonies`).
 *
 *  Les trois portes du bureau refusent désormais tout séparateur. `image_de_page` réécrivait en
 *  silence avec `file_name()` — `pages/x.webp` y devenait `x.webp` —, et c'est cette réécriture
 *  qui laissait un seul appel servir deux ports aux besoins contraires. Le préfixe `pages/` a donc
 *  déménagé dans `ligne.ts`, dont la clé d'objet en a besoin : `cleDerive` compose
 *  `…/derives/<version>/<nom>` et n'ajoute rien. La requête envoyée au service est inchangée au
 *  bit près, et `pont-en-ligne.test.ts` le tient.
 *
 *  Ce contrôle lit la source : `chargerImage` vit dans un `useCallback` d'`App`, il n'y a rien à
 *  importer. En environnement `node`, parce qu'il lui faut un chemin de fichier.
 *
 *  Il rougit dès qu'un appel reprend un préfixe — la mutation demandée par Christophe le
 *  25 novembre 2026. */
const APP = fileURLToPath(new URL("../src/App.tsx", import.meta.url));

describe("ce que l'interface envoie au port d'image (lot 0z nonies)", () => {
  it("n'appelle `imageDePage` qu'avec un nom nu, sans séparateur ni littéral", () => {
    const source = readFileSync(APP, "utf8");
    const appels = [...source.matchAll(/imageDePage\(([^)]*)\)/gu)].map((trouve) => trouve[1] ?? "");
    expect(appels.length, "l'appel à `imageDePage` a disparu d'App.tsx : ce contrôle ne garde plus rien")
      .toBeGreaterThan(0);
    for (const arguments_ of appels) {
      expect(arguments_, `un séparateur dans l'appel : « ${arguments_} »`).not.toMatch(/\//u);
      expect(arguments_, `un littéral de chaîne dans l'appel : « ${arguments_} »`).not.toMatch(/[`"']/u);
    }
  });
});
