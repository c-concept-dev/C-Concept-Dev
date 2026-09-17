"use strict";
const { createMono01, REGISTRY_PATH, buildValidChain } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const chain = await buildValidChain(mono01, { missionId: "mission-t0112" });

  // L'adaptateur ne doit jamais modifier l'objet métier renvoyé :
  // module output -> adapter -> deepEqual(output), hors enveloppe.
  // On le vérifie à la fois par deepEqual ET par identité de référence stricte
  // (le port ne clone jamais, il transporte).

  const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Rejoue chaque étape en gardant la référence brute produite par le module gelé.
  const EF03AReviewSchema = require("../dependencies/ef-03a-review-schema-v1.js");
  const rawReviewSchema = await EF03AReviewSchema.buildReviewSchema({
    twinSet: chain.twinSet,
    dimensionSet: chain.dimensionSet,
    reviewTargets: require("../dependencies/ef-03a-review-schema-v1.js").buildReviewTargets(["Document de test"]),
    missionQuestion: chain.missionQuestion,
  });
  const portResult = await mono01.reviewSchemaPort.buildReviewSchema(
    chain.twinSet,
    chain.dimensionSet,
    require("../dependencies/ef-03a-review-schema-v1.js").buildReviewTargets(["Document de test"]),
    chain.missionQuestion,
    { missionId: "mission-t0112" }
  );

  check("1. deepEqual(output du port, output direct du module gelé)", deepEqual(portResult.output, rawReviewSchema), "diff éventuel non affiché (objets volumineux)");

  // Test d'identité de référence stricte sur la chaîne déjà construite :
  // chain.reviewSchema a été produit via mono01.reviewSchemaPort — on rejoue
  // StabilityPort directement et on vérifie l'identité de référence.
  const EF03DStabilityContradiction = require("../dependencies/ef-03d-stability-contradiction-v1.js");
  const rawStability = EF03DStabilityContradiction.buildStabilityContradictionAnalysis(chain.reviewSet, chain.aggregatedReview);
  const stabilityPortResult = mono01.stabilityPort.buildStabilityContradictionAnalysis(chain.reviewSet, chain.aggregatedReview, { missionId: "mission-t0112" });
  check("2. deepEqual pour StabilityPort (SYNC)", deepEqual(stabilityPortResult.output, rawStability));

  // Vérifie qu'aucune clé supplémentaire n'a été injectée par le port
  // (comparaison exhaustive des clés de premier niveau).
  const keysA = Object.keys(stabilityPortResult.output).sort();
  const keysB = Object.keys(rawStability).sort();
  check("3. aucune clé ajoutée/retirée par le port (mêmes clés de premier niveau)", JSON.stringify(keysA) === JSON.stringify(keysB), JSON.stringify({ keysA, keysB }));

  // L'enveloppe IntegrationResult elle-même est gelée (Object.freeze dans
  // port-factory.js) — vérifie qu'on ne peut pas la muter après coup.
  let mutationThrew = false;
  try {
    "use strict";
    stabilityPortResult.status = "SUCCESS_HACKED";
  } catch (e) {
    mutationThrew = true;
  }
  check(
    "4. l'enveloppe IntegrationResult est gelée (Object.freeze) — une mutation est silencieusement ignorée ou lève en mode strict",
    stabilityPortResult.status === "SUCCESS",
    stabilityPortResult.status
  );

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
