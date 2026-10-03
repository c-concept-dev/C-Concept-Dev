import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { feuilleCss } from "@lienotheque/jetons";
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

export default defineConfig({
  plugins: [react(), jetonsCss()],
  resolve: { alias: { "@kit": KIT } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/configuration.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
