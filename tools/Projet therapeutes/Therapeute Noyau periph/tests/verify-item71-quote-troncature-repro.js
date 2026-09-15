// Item 71 — INVESTIGATION (aucun code de production modifié) : reproduction de motifs réalistes
// de blocs "quote" pour identifier PRÉCISÉMENT quelles formes de fin de citation déclenchent
// looksTruncated (adocRunQualityContract), via le VRAI chemin (adocRenderClinicalDocument),
// jamais la regexp isolée.
//
// AVERTISSEMENT DE PORTÉE, honnête : le texte exact des deux citations réellement rejetées ce
// soir (req_011Cf5AVFf29Vb5evqqgfVCu) n'a pas pu être récupéré depuis cette session — aucun accès
// à un Worker déployé réel ni à la base D1 de production (même limitation que la clôture de la
// Partie B d'item 21). Cette reproduction utilise des motifs de citation RÉALISTES et courants
// (conventions d'attribution/aphorisme les plus fréquentes en contexte thérapeutique) pour
// déterminer empiriquement lesquels échouent — un signal fort, pas une preuve littérale des deux
// octets exacts perdus.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const CASES = [
  { label: 'Terminée par un point (référence, jamais tronquée)', text: 'La seule issue est d’accepter ce que l’on ne peut changer.' },
  { label: 'Attribution par tiret cadratin + auteur (motif de citation le plus courant)', text: 'Il n’y a pas de vent favorable pour celui qui ne sait pas où il va — Sénèque' },
  { label: 'Attribution par tiret + auteur ET œuvre', text: 'Le bonheur n’est pas une destination, c’est une manière de voyager — Margaret Lee Runbeck, Ma vie avec toi' },
  { label: 'Aphorisme sans ponctuation terminale (convention éditoriale d’une citation courte)', text: 'Ce que je peux, je le fais ; ce que je ne peux pas, je le laisse être' },
  { label: 'Citation se terminant par une apostrophe courbe fermante (’) — absente de la classe reconnue', text: 'Elle disait souvent : « tout ce qui compte, c’est maintenant’' },
  { label: 'Citation tronquée par le modèle en cours de phrase (VRAI cas de troncature à conserver bloqué)', text: 'La seule issue est d’accepter ce que l’on ne peut' },
  { label: 'Citation entre guillemets français, fermée par le guillemet (déjà couvert)', text: 'Vivre, c’est agir selon ses valeurs »' },
  { label: 'Citation vide (jamais déclarée tronquée)', text: '' },
];

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + FILE);

  const doc = {
    schemaVersion: 1, documentId: 'doc-71', versionId: 'doc-71-v1', previousVersionId: null,
    requestId: 'req-71', sourceSnapshotId: 'snap-71', createdAt: new Date().toISOString(),
    language: 'fr', status: 'draft', title: 'Test item 71', purpose: 'Test', audience: 'Clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: CASES.map((c, i) => ({ id: 'quote-' + String(i + 1).padStart(2, '0'), type: 'quote', content: { text: c.text }, citationIds: [], validation: {} })),
    citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };

  const qc = await page.evaluate(async (doc) => {
    const snapshot = { sourceSnapshotId: doc.sourceSnapshotId, entries: [] };
    const rendered = await window.adocRenderClinicalDocument(doc, snapshot, null);
    return rendered.qc;
  }, doc);

  console.log('\n=== ITEM 71 — MOTIFS DE FIN DE CITATION : REJETÉS PAR looksTruncated ? ===\n');
  CASES.forEach((c, i) => {
    const blockId = 'quote-' + String(i + 1).padStart(2, '0');
    const rejected = qc.blocking.some(msg => msg.includes('Bloc ' + blockId + ' ') && msg.includes('tronqué'));
    console.log((rejected ? '❌ REJETÉ' : '✅ accepté') + ' — ' + c.label);
    console.log('    texte : ' + JSON.stringify(c.text));
  });
  log('Aucune erreur JS pendant la reproduction', errors.length === 0, errors);

  await browser.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log('\nTotal contrôles annexes: ' + results.length + ' | Échoués: ' + failed.length);
  if (failed.length) process.exit(1);
})();
