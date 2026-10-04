import { defineConfig } from "vitest/config";

/** Les bancs de mesure, à la demande. Voir `vitest.config.ts` pour la raison de leur mise à part. */
export default defineConfig({
  test: {
    pool: "forks",
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    teardownTimeout: 600_000,
    include: ["test/mesures-f7.test.ts", "test/segments-f4.test.ts"],
  },
});
