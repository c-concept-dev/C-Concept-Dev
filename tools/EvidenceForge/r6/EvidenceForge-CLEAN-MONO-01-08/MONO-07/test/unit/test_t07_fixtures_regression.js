"use strict";
// test/unit/test_t07_fixtures_regression.js
//
// Deux bugs réels trouvés dans MONO-07 lui-même (jamais un lot gelé) pendant
// la construction du happy path E2E — tests de non-régression dédiés.

const fx = require("../../lib/synthetic-fixtures");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  // === BUG 1 : branchement D2/D3 ambigu ===
  // Un prompt D3 (couverture) RAPPELLE le jugement D2 déjà établi dans son
  // contexte ("[EF-02D2 déjà établi : pertinence=...]"), ce qui contient
  // littéralement le mot "relevanceStatus" en toutes lettres si on cherche
  // ce substring — la condition naïve prompt.includes("relevanceStatus")
  // routait donc À TORT les prompts D3 vers le handler D2.
  {
    const promptD2 = 'Retourne {"dimensionId":"d1","relevanceStatus":"mission_relevant",...}';
    const promptD3AvecRappelD2 = 'd1: Label — Definition [EF-02D2 déjà établi : pertinence=mission_relevant, preuve=documented]\nRetourne {"id":"d1","level":"strong","evidenceWorks":[...]}';

    const respD2 = JSON.parse(fx.eligibilityWorkerResponder(promptD2));
    check("T07-FIX-01a. un prompt D2 (contient \"dimensionId\") produit bien une réponse au format D2 (judgments[])", Array.isArray(respD2.judgments), JSON.stringify(respD2));

    const respD3 = JSON.parse(fx.eligibilityWorkerResponder(promptD3AvecRappelD2));
    check("T07-FIX-01b. un prompt D3 contenant un RAPPEL du mot \"relevanceStatus\" (contexte D2 déjà établi) produit bien une réponse au format D3 (dimensions[]), jamais D2", Array.isArray(respD3.dimensions) && !("judgments" in respD3), JSON.stringify(respD3));
  }

  // === BUG 2 : couverture identique -> second professionnel jamais sélectionné ===
  // Vérifie que la réponse D3 synthétique produit bien une couverture
  // DIFFÉRENCIÉE entre les deux professionnels (jamais une redondance totale
  // qui ferait ignorer le second par l'algorithme réel de panel).
  {
    const promptD3_P1 = 'Titre: SYNTHETIC_CORPUS_WORK_001A\nRetourne {"id":"SYNTHETIC_DIM_A","level":"...","evidenceWorks":[...]}';
    const promptD3_P2 = 'Titre: SYNTHETIC_CORPUS_WORK_002A\nRetourne {"id":"SYNTHETIC_DIM_A","level":"...","evidenceWorks":[...]}';
    const respP1 = JSON.parse(fx.eligibilityWorkerResponder(promptD3_P1));
    const respP2 = JSON.parse(fx.eligibilityWorkerResponder(promptD3_P2));
    const levelsP1 = Object.fromEntries(respP1.dimensions.map((d) => [d.id, d.level]));
    const levelsP2 = Object.fromEntries(respP2.dimensions.map((d) => [d.id, d.level]));
    check(
      "T07-FIX-02. les deux professionnels synthétiques ont une couverture DIFFÉRENCIÉE par dimension (jamais identique), condition nécessaire pour que l'algorithme réel de sélection de panel retienne les deux",
      JSON.stringify(levelsP1) !== JSON.stringify(levelsP2),
      `P1=${JSON.stringify(levelsP1)} P2=${JSON.stringify(levelsP2)}`
    );
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
