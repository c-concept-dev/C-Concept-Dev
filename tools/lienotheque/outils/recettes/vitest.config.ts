import { defineConfig, mergeConfig } from "vitest/config";
import { configurationCommune } from "../../packages/banc/configuration-commune.ts";

/** Ces tests font tourner un moteur d'OCR sur des centaines de pages : un seul d'entre eux dure
 *  plusieurs minutes. Le rapporteur de vitest, lui, attend des nouvelles de ses ouvriers à
 *  intervalles courts et finit par abandonner — « Timeout calling onTaskUpdate » —, alors que
 *  tous les contrôles ont passé.
 *
 *  Des processus séparés plutôt que des fils, et des délais à la mesure du travail. */
export default mergeConfig(
  configurationCommune,
  defineConfig({
    test: {
      pool: "forks",
      testTimeout: 3_600_000,
      hookTimeout: 600_000,
      teardownTimeout: 600_000,
    },
  }),
);
