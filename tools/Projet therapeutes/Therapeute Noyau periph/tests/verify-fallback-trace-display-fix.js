// Correctif d'affichage adocDumpFallbackTrace() — vérifie que msSinceLastSemanticActivity,
// payloadBytes et usefulContentFragmentCount sont lus depuis le BON sous-objet (metrics1 ou
// metrics2 selon failedCall), plus jamais toujours metrics2. Avant ce correctif, une entrée
// simulée avec failedCall===1 aurait affiché "undefined" pour ces 3 champs (metrics2 jamais
// consulté dans ce cas — c'est exactement le bug décrit).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

// Reflète désormais la VRAIE forme d'un metrics1/metrics2 tel que réellement stocké par le
// traceur (cf. correctif _adocLogCallMetrics qui persiste msSinceLast*Activity sur `m` lui-même,
// confirmé via verify-fallback-trace.js sur un vrai repli) — msSinceLastSemanticActivity est un
// champ RÉEL de l'objet, jamais recalculé ici.
const REALISTIC_METRICS1 = {
  payloadBytes: 868, msToHttp200: 5, msToFirstByte: 6, msToFirstValidSSE: 6, msToFirstSemanticProgress: 6,
  bytesReceived: 302, fragmentsReceived: 1, validSSEEventCount: 4, usefulContentFragmentCount: 11,
  lastEventType: 'ping', lastTransportActivityAt: 1000, lastSemanticActivityAt: 500, finalState: 'semantic-timeout',
  msSinceLastTransportActivity: 19012, msSinceLastSemanticActivity: 19500,
};
const REALISTIC_METRICS2 = {
  payloadBytes: 27500, msToHttp200: 8, msToFirstByte: 12, msToFirstValidSSE: 12, msToFirstSemanticProgress: 15,
  bytesReceived: 9000, fragmentsReceived: 40, validSSEEventCount: 120, usefulContentFragmentCount: 40,
  lastEventType: 'ping', lastTransportActivityAt: 45012, lastSemanticActivityAt: 45000, finalState: 'semantic-timeout',
  msSinceLastTransportActivity: 44988, msSinceLastSemanticActivity: 45000,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.continue());
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(({ m1, m2 }) => {
    // Entrée réaliste failedCall===2 (le cas déjà rencontré dans les 3 occurrences réelles) —
    // doit continuer à fonctionner exactement comme avant ce correctif.
    const entryCall2 = {
      timestamp: '2026-09-06T18:00:00.000Z', hourOfDay: 18, failedCall: 2, sourceCount: 12,
      ragChunkCount: 12, usedWebSearch: false, metrics1: m1, metrics2: m2,
      errorMessage: "Génération structurée : inactivité du flux (semantic-timeout), abandon.",
    };
    // Entrée simulée failedCall===1 — EXACTEMENT le cas que le bug décrit (avant ce correctif,
    // le code ne regardait jamais metrics1, donc affichait undefined pour ces 3 champs).
    const entryCall1 = {
      timestamp: '2026-09-06T19:00:00.000Z', hourOfDay: 19, failedCall: 1, sourceCount: 8,
      ragChunkCount: 8, usedWebSearch: true, metrics1: m1, metrics2: null,
      errorMessage: 'Simulation — échec appel 1 (test du correctif d\'affichage).',
    };
    localStorage.setItem('adocFallbackTrace', JSON.stringify([entryCall2, entryCall1]));

    const tableRows = [];
    const origTable = console.table;
    console.table = function (rows) { tableRows.push(...rows); };
    let threw = false;
    try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; }
    console.table = origTable;

    return { threw, tableRows };
  }, { m1: REALISTIC_METRICS1, m2: REALISTIC_METRICS2 });

  console.log('adocDumpFallbackTrace() ne lève aucune erreur:', result.threw === false);
  console.log('\n=== Ligne failedCall===2 (doit lire depuis metrics2) ===');
  console.log(result.tableRows[0]);
  const row2 = result.tableRows[0];
  console.log('msSinceLastSemanticActivity correct (depuis metrics2, pas undefined):', row2.msSinceLastSemanticActivity === REALISTIC_METRICS2.msSinceLastSemanticActivity);
  console.log('payloadBytes correct (depuis metrics2):', row2.payloadBytes === REALISTIC_METRICS2.payloadBytes);
  console.log('usefulContentFragmentCount correct (depuis metrics2):', row2.usefulContentFragmentCount === REALISTIC_METRICS2.usefulContentFragmentCount);

  console.log('\n=== Ligne failedCall===1 (LE CAS DU BUG — doit lire depuis metrics1, jamais metrics2) ===');
  console.log(result.tableRows[1]);
  const row1 = result.tableRows[1];
  console.log('msSinceLastSemanticActivity correct (depuis metrics1, PAS undefined):', row1.msSinceLastSemanticActivity === REALISTIC_METRICS1.msSinceLastSemanticActivity && row1.msSinceLastSemanticActivity !== undefined);
  console.log('payloadBytes correct (depuis metrics1, PAS undefined):', row1.payloadBytes === REALISTIC_METRICS1.payloadBytes && row1.payloadBytes !== undefined);
  console.log('usefulContentFragmentCount correct (depuis metrics1, PAS undefined):', row1.usefulContentFragmentCount === REALISTIC_METRICS1.usefulContentFragmentCount && row1.usefulContentFragmentCount !== undefined);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
