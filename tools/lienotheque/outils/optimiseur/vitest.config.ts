import { configDefaults, defineConfig } from "vitest/config";

/** Deux bancs de mesure vivent ici : l'échantillon F7, qui encode des pages entières en AVIF, et
 *  la justesse du découpage, qui décode des médias. Chacun dure des minutes.
 *
 *  Ils ne sont pas des contrôles de non-régression mais des mesures, et on ne les relance qu'en
 *  les demandant — `pnpm --filter @lienotheque/optimiseur run mesures`. Les garder dans la
 *  vérification courante la ferait durer dix fois plus et la rendrait instable : le rapporteur de
 *  vitest abandonne quand un seul test occupe un ouvrier plusieurs minutes.
 *
 *  Leurs résultats sont consignés dans docs/decisions.md ; le workflow Tauri les relance. */
export default defineConfig({
  test: {
    pool: "forks",
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    teardownTimeout: 600_000,
    exclude: [...configDefaults.exclude, "test/mesures-f7.test.ts", "test/segments-f4.test.ts"],
  },
});
