import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** La page et l'API au même endroit, sans qu'un fichier masque une route (étape 7 d'E5).
 *
 *  Le Worker sert aussi la page. Ce n'est pas une préférence : le témoin de session est
 *  `SameSite=Lax` et aucun CORS n'existe ici, donc une page servie ailleurs ne pourrait
 *  **jamais** présenter sa session. L'origine unique est ce que le code suppose déjà.
 *
 *  **Le seul vrai risque est qu'un fichier masque une route.** La couche des ressources répond
 *  avant le Worker : une route nommée comme un fichier livré deviendrait muette, sans erreur et
 *  sans journal. C'est ce que ce test interdit.
 *
 *  Il ne mesure pas une intention mais deux sources : les routes **déclarées** dans `app.ts` et
 *  la surface **réellement livrée** par la construction. */

const ICI = import.meta.dirname;
const WORKER = join(ICI, "..");
const SOURCE = readFileSync(join(WORKER, "src/app.ts"), "utf8");
const CONFIG = readFileSync(join(WORKER, "wrangler.toml"), "utf8");

/** Les chemins que le Worker déclare, y compris ceux posés en boucle. */
const routes = (): readonly string[] => {
  const un = [...SOURCE.matchAll(/app\.(?:get|post|put|delete)\("([^"]+)"/g)].map((trouve) => trouve[1]!);
  // Les trois routes de la façade sont posées par une boucle sur un tableau : les lire aussi,
  // sans quoi le garde-fou ignorerait précisément celles que l'application appelle le plus.
  const enBoucle = [...SOURCE.matchAll(/for \(const route of \[([^\]]+)\]/g)].flatMap((trouve) =>
    [...trouve[1]!.matchAll(/"([^"]+)"/g)].map((chemin) => chemin[1]!),
  );
  return [...un, ...enBoucle];
};

describe("la configuration déclare les ressources de la page", () => {
  it("désigne la construction de l'application", () => {
    expect(CONFIG).toMatch(/^\[assets\]/m);
    expect(CONFIG).toMatch(/directory\s*=\s*"\.\.\/app\/dist"/);
  });

  it("laisse le Worker rendre ses 404", () => {
    // « none » et non le repli d'application monopage : l'application navigue par ancres —
    // « #lecteur/page=3 » — donc elle n'a aucun besoin du repli, et l'activer renverrait
    // index.html sur n'importe quelle adresse, masquant les 404 de l'API.
    expect(CONFIG).toMatch(/not_found_handling\s*=\s*"none"/);
  });
});

describe("aucun fichier ne peut masquer une route", () => {
  it("déclare bien les routes qu'on croit, boucle comprise", () => {
    // Si ce relevé cessait de voir les routes, le garde-fou deviendrait vide sans le dire.
    const vues = routes();
    expect(vues.length).toBeGreaterThanOrEqual(20);
    for (const attendue of ["/sante", "/search-library", "/vue/apercu", "/laissez", "/entree"])
      expect(vues, attendue).toContain(attendue);
  });

  it("n'a aucune route à la racine ni sous « /assets/ »", () => {
    // La surface livrée par Vite est « / » pour index.html et « /assets/… » pour le reste.
    const fautives = routes().filter((chemin) => chemin === "/" || chemin.startsWith("/assets/"));
    expect(fautives, `ces routes seraient masquées par un fichier : ${fautives.join(", ")}`).toEqual([]);
  });

  it("ne livre rien hors de « / » et « /assets/ », quand la construction est là", () => {
    // Conditionnel, et dit comme tel : la construction n'existe pas toujours quand les tests
    // tournent. Les deux contrôles ci-dessus, eux, ne dépendent de rien.
    const dist = join(WORKER, "../app/dist");
    if (!existsSync(dist)) return;

    const fichiers: string[] = [];
    const parcourir = (dossier: string, prefixe: string): void => {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin, `${prefixe}${entree}/`);
        else fichiers.push(`${prefixe}${entree}`);
      }
    };
    parcourir(dist, "/");

    const inattendus = fichiers.filter((chemin) => chemin !== "/index.html" && !chemin.startsWith("/assets/"));
    expect(inattendus, `la construction livre hors de la surface connue : ${inattendus.join(", ")}`).toEqual([]);
  });

  it("ne livre plus les polices en double", () => {
    // Les TTF n'étaient qu'un repli derrière le WOFF2, que les trois moteurs visés acceptent
    // tous : jamais téléchargés, toujours embarqués. Deux mégaoctets sur quatre et demi.
    const dist = join(WORKER, "../app/dist/assets");
    if (!existsSync(dist)) return;
    const ttf = readdirSync(dist).filter((nom) => nom.endsWith(".ttf"));
    expect(ttf, `des polices TTF sont encore livrées : ${ttf.join(", ")}`).toEqual([]);
  });
});
