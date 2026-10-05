// Produit les TROIS exports autonomes qui servent d'entrées à l'essai 2.
//
// À SIGNALER DANS LE RAPPORT : le dossier entrees/ était VIDE — Christophe n'a fourni aucune
// présentation réelle. Ces trois documents sont donc forgés d'après les formes attendues par les
// schémas du dépôt (block.schema.json), pas extraits d'un usage réel. Ils couvrent les trois cas
// demandés, mais un document réellement généré peut contenir des structures qu'ils n'ont pas.
//
// L'export est fabriqué par le point d'entrée RÉEL (window.adocBuildStandalonePresentationHTML),
// jamais par un assemblage de HTML à la main : c'est ce fichier-là que Safari devra capturer.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const APP = 'file://' + path.join(RACINE, '..', 'studio-clinique.html');
const SORTIE = path.join(RACINE, 'entrees');

const bloc = (id, type, content, extra) => Object.assign({ id, type, content, citationIds: [], validation: {} }, extra || {});
const TEXTE_DENSE = "Dans un couple, l'argent n'est jamais seulement une affaire de comptes : il porte "
  + "l'histoire de chacun, les loyautés familiales, et la manière dont on s'autorise à recevoir. Un "
  + "déséquilibre de revenus ne devient un conflit que lorsqu'il rencontre une dette invisible — "
  + "celle que l'un croit devoir à l'autre, ou à sa propre famille d'origine.";

// 1 — avec image de couverture
const DOC_COUVERTURE = {
  documentKind: 'presentation', title: 'Avec couverture', citations: [],
  blocks: [
    { id: 'c1', type: 'card', content: { title: 'L\'argent dans le couple',
      imageRef: 'couple finances table', imageAlt: 'Un couple devant des papiers', blocks: [
        bloc('p1', 'paragraph', { text: 'Première approche du sujet.' }),
        bloc('p2', 'paragraph', { text: 'Deuxième temps, pour qu\'il y ait plusieurs étapes.' }) ] },
      citationIds: [], validation: {} },
    { id: 'c2', type: 'card', content: { title: 'Une seule étape', imageRef: null, imageAlt: null, blocks: [
        bloc('p3', 'paragraph', { text: 'Diapositive à un seul bloc : une seule étape, par construction.' }) ] },
      citationIds: [], validation: {} },
  ], deepDives: [],
};

// 2 — texte dense
const DOC_DENSE = {
  documentKind: 'presentation', title: 'Texte dense', citations: [],
  blocks: [
    { id: 'c1', type: 'card', content: { title: 'La dette invisible', imageRef: null, imageAlt: null, blocks: [
        bloc('h1', 'heading', { text: 'Ce que l\'argent porte', level: 2 }),
        bloc('p1', 'paragraph', { text: TEXTE_DENSE }),
        bloc('p2', 'paragraph', { text: TEXTE_DENSE }),
        bloc('l1', 'list', { items: ['Les loyautés familiales', 'Le droit de recevoir',
          'La peur de dépendre', 'Le compte commun comme symptôme'], ordered: false }),
        bloc('q1', 'quote', { text: 'Ce n\'est pas le montant qui blesse, c\'est ce qu\'il dit.' }) ] },
      citationIds: [], validation: {} },
  ], deepDives: [],
};

// 3 — questionnaire qui déborde (mesuré dans une session précédente : les questionnaires sont
// exactement les diapositives qui dépassent la hauteur de référence de 800 px)
const questions = Array.from({ length: 9 }, (_, i) => ({
  text: 'Question ' + (i + 1) + ' — dans quelle mesure cette situation vous est-elle familière ?',
  options: [{ text: 'Pas du tout', points: 0 }, { text: 'Un peu', points: 1 },
            { text: 'Beaucoup', points: 2 }, { text: 'Tout à fait', points: 3 }],
}));
const DOC_QUESTIONNAIRE = {
  documentKind: 'presentation', title: 'Questionnaire débordant', citations: [],
  blocks: [
    { id: 'c1', type: 'card', content: { title: 'Où en êtes-vous ?', imageRef: null, imageAlt: null, blocks: [
        bloc('p1', 'paragraph', { text: 'Répondez sans réfléchir trop longtemps.' }),
        bloc('qn1', 'questionnaire', { questions: questions, allowTwoPartners: true, profiles: [
          { label: 'Rarement en tension', minScore: 0, maxScore: 9, interpretation: 'Le sujet reste périphérique.' },
          { label: 'Tension installée', minScore: 10, maxScore: 18, interpretation: 'Le sujet revient régulièrement.' },
          { label: 'Tension centrale', minScore: 19, maxScore: 27, interpretation: 'Le sujet organise la relation.' } ] }) ] },
      citationIds: [], validation: {} },
  ], deepDives: [],
};

// 4 — BLOCS COMMENÇANT PAR UN NOMBRE. adocPresentAnimateNumberIfEligible anime tout bloc de texte
// simple dont le texte commence par un chiffre : 700 ms en requestAnimationFrame, appliqué au
// premier bloc à l'entrée ET à chaque bloc révélé. Sans une fixture de ce genre, rien n'anime et
// l'on conclut à tort qu'il n'y a pas d'animation — c'est l'erreur que ce jeu corrige.
const DOC_NOMBRES = {
  documentKind: 'presentation', title: 'Nombres animés', citations: [],
  blocks: [
    { id: 'c1', type: 'card', content: { title: 'Ce que disent les chiffres', imageRef: null, imageAlt: null, blocks: [
        bloc('n1', 'paragraph', { text: '37 % des couples déclarent que l\'argent est leur premier sujet de dispute.' }),
        bloc('n2', 'paragraph', { text: '2,5 fois plus de conflits quand les comptes restent séparés sans accord explicite.' }),
        bloc('n3', 'paragraph', { text: '18 mois en moyenne avant qu\'une dette invisible ne soit nommée.' }),
        bloc('t1', 'paragraph', { text: 'Un bloc sans chiffre initial, qui ne doit RIEN animer.' }) ] },
      citationIds: [], validation: {} },
  ], deepDives: [],
};

const JEUX = [
  { nom: 'couverture', doc: DOC_COUVERTURE, cas: 'avec image de couverture' },
  { nom: 'dense', doc: DOC_DENSE, cas: 'texte dense' },
  { nom: 'questionnaire', doc: DOC_QUESTIONNAIRE, cas: 'questionnaire qui déborde' },
  { nom: 'nombres', doc: DOC_NOMBRES, cas: 'blocs commençant par un nombre (animation 700 ms)' },
];

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  // Réseau coupé : les images partent sur leur aplat de repli, donc l'export est reproductible
  // d'une exécution à l'autre — indispensable pour comparer des pixels.
  await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP);
  await page.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
  const inventaire = [];
  for (const jeu of JEUX) {
    const html = await page.evaluate((d) => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), jeu.doc);
    const f = path.join(SORTIE, jeu.nom + '.html');
    fs.writeFileSync(f, html, 'utf8');
    inventaire.push({ nom: jeu.nom, cas: jeu.cas, fichier: path.basename(f),
                      octets: Buffer.byteLength(html), diapositives: jeu.doc.blocks.length });
    console.log('  ' + jeu.nom.padEnd(15) + jeu.cas.padEnd(30)
      + (Buffer.byteLength(html) / 1024).toFixed(0) + ' Ko, ' + jeu.doc.blocks.length + ' diapositive(s)');
  }
  await nav.close();
  fs.writeFileSync(path.join(SORTIE, 'PROVENANCE.json'), JSON.stringify({
    origine: 'FORGÉ depuis les schémas du dépôt — entrees/ était vide, aucune présentation réelle fournie',
    construit_par: 'window.adocBuildStandalonePresentationHTML (point d\'entrée réel)',
    reseau: 'coupé pendant la construction : les images partent sur leur aplat de repli, pour que la comparaison de pixels soit reproductible',
    jeux: inventaire, erreurs_js: erreurs,
  }, null, 2), 'utf8');
  if (erreurs.length) console.log('  erreurs JS : ' + erreurs.join(' | '));
})();
