import { defineConfig, devices } from "@playwright/test";

/** Tests de rendu dans de vrais moteurs (PLT-09). jsdom n'a pas de moteur de mise en page :
 *  il ne sait pas dire où un élément tombe à l'écran. Ces tests-là mesurent.
 *
 *  Les trois moteurs sont ceux des trois plateformes visées : WebKit est celui de la vue
 *  intégrée de macOS, Chromium celui de Windows, Firefox le témoin indépendant. */

const PORT = 4317;

export default defineConfig({
  // Deux à la fois, partout : ces tests mesurent une mise en page, et une machine saturée rend
  // des mesures bruyantes. Mieux vaut une minute de plus qu'un contrôle qui vacille.
  workers: 2,
  testDir: "navigateurs",
  globalSetup: "./navigateurs/preparer.ts",
  // Ces tests mesurent une mise en page. Trois moteurs qui se disputent la machine rendent des
  // mesures bruyantes : les fichiers tournent en parallèle, les tests d'un fichier à la file.
  fullyParallel: false,
  expect: { timeout: 10_000 },
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  reporter: process.env["CI"] !== undefined ? [["github"], ["list"]] : [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // Sur la version construite, pas sur le serveur de développement : c'est ce qui est livré.
  webServer: {
    // --host : sans lui Vite écoute « localhost », qui ne résout pas toujours en IPv4.
    command: `pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 180_000,
  },
});
