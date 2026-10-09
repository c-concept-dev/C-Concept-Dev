import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emplacementInstantane } from "./emplacement-instantane.js";
import react from "@vitejs/plugin-react";
import { feuilleCss } from "@lienotheque/jetons";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { ID_JETONS, ID_MODELES } from "./src/jetons-virtuels.js";

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

/** Dossier des modèles de bibliothèque. Un domaine s'ajoute en y déposant un fichier (CLA-09). */
const MODELES = fileURLToPath(new URL("../../fixtures/modeles", import.meta.url));

/** Le catalogue des modèles, lu au moment de la construction.
 *
 *  Les modèles sont des données : ils ne sont pas recopiés dans le code, et personne n'écrit un
 *  nom de domaine dans `src`. Ils sont embarqués plutôt que servis parce que l'application de
 *  bureau charge sa page construite, sans serveur derrière — et que l'assistant de création doit
 *  pouvoir proposer un rangement dès le premier lancement, hors ligne. */
function modelesEmbarques(): Plugin {
  const resolu = `\0${ID_MODELES}`;
  return {
    name: "lienotheque:modeles",
    resolveId: (id) => (id === ID_MODELES ? resolu : undefined),
    load: (id) => {
      if (id !== resolu) return undefined;
      const catalogue = readdirSync(MODELES)
        .filter((fichier) => fichier.endsWith(".json"))
        .sort()
        .map((fichier) => JSON.parse(readFileSync(join(MODELES, fichier), "utf8")) as { modele: unknown })
        .map((lu) => lu.modele);
      return `export default ${JSON.stringify(catalogue)};`;
    },
  };
}

/** Chemin de l'instantané de bibliothèque servi à l'application.
 *
 *  Il est produit depuis des fichiers sous droits : il n'a rien à faire dans `public/`, qui est un
 *  dossier publiable et recopié tel quel dans la construction. Il vit au cache de travail, hors du
 *  dépôt, et c'est ce greffon qui le sert — en développement comme sur la version construite. */
const { instantane: INSTANTANE, pages: DOSSIER_PAGES, medias: DOSSIER_MEDIAS } = emplacementInstantane();

const ADRESSE_INSTANTANE = "/donnees/bibliotheque.json";
/** Images de page, à côté de l'instantané et servies de la même façon. */
const ADRESSE_PAGES = "/donnees/pages";
/** Médias, servis là où ils sont : ils ne passent ni par le cache ni par `public/`. */
const ADRESSE_MEDIAS = "/donnees/medias";
/** Ce qu'on accepte de servir comme média, et le type qu'on annonce. Une liste close : un
 *  dossier de médias n'a pas à pouvoir servir n'importe quel fichier de la machine. */
const TYPES_MEDIA: Readonly<Record<string, string>> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
};

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

  const servirMedias = (serveur: { middlewares: { use: (chemin: string, gestion: (requete: IncomingMessage, reponse: ServerResponse) => void) => void } }): void => {
    serveur.middlewares.use(ADRESSE_MEDIAS, (requete, reponse) => {
      // Un nom de fichier, rien d'autre : jamais de chemin qui remonte hors du dossier. Et une
      // extension connue : ce dossier sert des médias, pas ce qui s'y trouve par hasard.
      const nom = decodeURIComponent(basename((requete.url ?? "").split("?")[0] ?? ""));
      const type = TYPES_MEDIA[extname(nom).toLowerCase()];
      const chemin = DOSSIER_MEDIAS === undefined ? undefined : join(DOSSIER_MEDIAS, nom);
      if (nom === "" || type === undefined || chemin === undefined || !existsSync(chemin)) {
        // 404 : c'est l'état « média non disponible ici », pas une panne. L'écran le dit.
        reponse.statusCode = 404;
        reponse.end();
        return;
      }
      // En entier, sans intervalles : un segment se joue en se plaçant dedans, pas en
      // redécoupant le fichier. Le jour où les lots se compteront en heures, il faudra les
      // intervalles — pas avant.
      const octets = readFileSync(chemin);
      reponse.setHeader("Content-Type", type);
      reponse.setHeader("Content-Length", String(octets.length));
      reponse.setHeader("Cache-Control", "no-store");
      reponse.end(octets);
    });
  };

  return {
    name: "lienotheque:instantane",
    configureServer: (serveur) => {
      servir(serveur);
      servirPages(serveur);
      servirMedias(serveur);
    },
    configurePreviewServer: (serveur) => {
      servir(serveur);
      servirPages(serveur);
      servirMedias(serveur);
    },
  };
}

export default defineConfig({
  plugins: [react(), jetonsCss(), modelesEmbarques(), instantaneServi()],
  resolve: { alias: { "@kit": KIT } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/configuration.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
