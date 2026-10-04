import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { feuilleCss } from "@lienotheque/jetons";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { ID_JETONS } from "./src/jetons-virtuels.js";

/** Dossier du kit UI v1.1 : polices WOFF2, emblèmes et fond photographique. */
const KIT = fileURLToPath(new URL("../../docs/ui-kit", import.meta.url));

/** La feuille de jetons n'est jamais recopiée : elle est produite par @lienotheque/jetons
 *  au moment de la construction, donc toujours alignée sur tokens.json. */
function jetonsCss(): Plugin {
  const resolu = `\0${ID_JETONS}`;
  return {
    name: "lienotheque:jetons-css",
    resolveId: (id) => (id === ID_JETONS ? resolu : undefined),
    load: (id) => (id === resolu ? feuilleCss() : undefined),
  };
}

/** Chemin de l'instantané de bibliothèque servi à l'application.
 *
 *  Il est produit depuis des fichiers sous droits : il n'a rien à faire dans `public/`, qui est un
 *  dossier publiable et recopié tel quel dans la construction. Il vit au cache de travail, hors du
 *  dépôt, et c'est ce greffon qui le sert — en développement comme sur la version construite. */
const INSTANTANE =
  process.env["LIENOTHEQUE_INSTANTANE"] ??
  join(process.env["LIENOTHEQUE_CACHE"] ?? "/Volumes/Macbook Pro/lienotheque-cache", "instantane", "bibliotheque.json");

const ADRESSE_INSTANTANE = "/donnees/bibliotheque.json";
/** Images de page, à côté de l'instantané et servies de la même façon. */
const ADRESSE_PAGES = "/donnees/pages";
const DOSSIER_PAGES = process.env["LIENOTHEQUE_PAGES"] ?? join(dirname(INSTANTANE), "pages");

function instantaneServi(): Plugin {
  const servir = (serveur: { middlewares: { use: (chemin: string, gestion: (requete: unknown, reponse: ServerResponse) => void) => void } }): void => {
    serveur.middlewares.use(ADRESSE_INSTANTANE, (_requete, reponse) => {
      if (!existsSync(INSTANTANE)) {
        // Pas d'instantané : l'application montre l'accueil d'un dépôt vide. Ce n'est pas une
        // erreur — c'est l'état de quiconque n'a encore rien importé.
        reponse.statusCode = 404;
        reponse.end();
        return;
      }
      reponse.setHeader("Content-Type", "application/json; charset=utf-8");
      reponse.setHeader("Cache-Control", "no-store");
      reponse.end(readFileSync(INSTANTANE));
    });
  };
  const servirPages = (serveur: { middlewares: { use: (chemin: string, gestion: (requete: IncomingMessage, reponse: ServerResponse) => void) => void } }): void => {
    serveur.middlewares.use(ADRESSE_PAGES, (requete, reponse) => {
      // Un nom de fichier, rien d'autre : jamais de chemin qui remonte hors du dossier.
      const nom = basename((requete.url ?? "").split("?")[0] ?? "");
      const chemin = join(DOSSIER_PAGES, nom);
      if (nom === "" || !nom.endsWith(".webp") || !existsSync(chemin)) {
        reponse.statusCode = 404;
        reponse.end();
        return;
      }
      reponse.setHeader("Content-Type", "image/webp");
      reponse.setHeader("Cache-Control", "no-store");
      reponse.end(readFileSync(chemin));
    });
  };

  return {
    name: "lienotheque:instantane",
    configureServer: (serveur) => {
      servir(serveur);
      servirPages(serveur);
    },
    configurePreviewServer: (serveur) => {
      servir(serveur);
      servirPages(serveur);
    },
  };
}

export default defineConfig({
  plugins: [react(), jetonsCss(), instantaneServi()],
  resolve: { alias: { "@kit": KIT } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/configuration.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
