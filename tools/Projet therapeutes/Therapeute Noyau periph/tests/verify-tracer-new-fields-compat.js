// Axe 2, point 5 — confirme que le traceur persistant accepte les nouveaux champs
// d'instrumentation (ajoutés directement sur metrics2, donc automatiquement relayés dans
// l'entrée enregistrée) SANS casser la lecture d'entrées déjà enregistrées AVANT ce lot (format
// ancien, sans ces champs). adocDumpFallbackTrace() ne doit jamais planter, qu'une entrée les
// ait ou non.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.continue());
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    // Entrée "ancienne" — EXACTEMENT le format d'avant ce lot (aucun des nouveaux champs).
    const oldEntry = {
      timestamp: '2026-09-06T18:00:00.000Z', hourOfDay: 18, failedCall: 2, sourceCount: 12,
      ragChunkCount: 12, usedWebSearch: false,
      metrics1: { payloadBytes: 800, msToHttp200: 5, usefulContentFragmentCount: 1, lastEventType: 'message_stop', finalState: 'completed' },
      metrics2: { payloadBytes: 27500, usefulContentFragmentCount: 40, lastEventType: 'ping', finalState: 'semantic-timeout', msSinceLastSemanticActivity: 45000 },
      errorMessage: 'Ancienne entrée (avant ce lot) — aucun des nouveaux champs.',
    };
    // Entrée "nouvelle" — avec tous les champs ajoutés dans ce lot.
    const newEntry = {
      timestamp: '2026-09-06T19:00:00.000Z', hourOfDay: 19, failedCall: 2, sourceCount: 10,
      ragChunkCount: 10, usedWebSearch: false,
      metrics1: { payloadBytes: 800, msToHttp200: 5, usefulContentFragmentCount: 1, lastEventType: 'message_stop', finalState: 'completed' },
      metrics2: {
        payloadBytes: 27500, usefulContentFragmentCount: 40, lastEventType: 'ping', finalState: 'semantic-timeout',
        msSinceLastSemanticActivity: 120000,
        interFragmentIntervalsMs: [500, 700, 1200], jsonLengthAtIntervalStart: [50, 120, 300],
        pingCount: 3, pingTimestampsMs: [40000, 80000, 120000],
        receivedContentBlockStop: false, receivedMessageStop: false, stopReasonAtAbandon: null,
      },
      errorMessage: 'Nouvelle entrée (après ce lot) — tous les nouveaux champs présents.',
    };
    localStorage.setItem('adocFallbackTrace', JSON.stringify([oldEntry, newEntry]));

    const tableRows = [];
    const origTable = console.table;
    console.table = function (rows) { tableRows.push(...rows); };
    let threw = false, threwMessage = null;
    try { window.adocDumpFallbackTrace(); } catch (e) { threw = true; threwMessage = e.message; }
    console.table = origTable;
    return { threw, threwMessage, tableRows };
  });

  console.log('adocDumpFallbackTrace() ne lève aucune erreur avec un mélange ancien/nouveau format:', result.threw === false, result.threwMessage || '');
  console.log('\n=== Ligne ANCIENNE entrée (sans les nouveaux champs) ===');
  console.log(result.tableRows[0]);
  console.log('=> Champs déjà existants toujours corrects (msSinceLastSemanticActivity=45000, payloadBytes=27500):',
    result.tableRows[0].msSinceLastSemanticActivity === 45000 && result.tableRows[0].payloadBytes === 27500);

  console.log('\n=== Ligne NOUVELLE entrée (avec les nouveaux champs) ===');
  console.log(result.tableRows[1]);
  console.log('=> Lecture correcte, aucune régression sur les champs déjà affichés:',
    result.tableRows[1].msSinceLastSemanticActivity === 120000 && result.tableRows[1].payloadBytes === 27500);

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
