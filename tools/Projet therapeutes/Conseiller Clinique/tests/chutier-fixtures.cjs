// TROIS PRÉSENTATIONS D'ESSAI POUR LE CHUTIER VISUEL (lot 2)
//
// Une source UNIQUE, partagée par la page d'essai (qui les reçoit inlinées par
// tests/forger-banc-chutier.cjs) et par les tests : jamais deux jeux de présentations qui
// divergeraient sans qu'on le voie.
//
// Les trois cas sont ceux que le brief demande, et chacun existe pour une raison mesurable :
//   1. COUVERTURE AVEC PHOTO — la seule qui fasse passer une image raster par SnapDOM. Le JPEG
//      ci-dessous est synthétique mais c'est un VRAI raster, avec du bruit de capteur : un
//      dégradé SVG se rastériserait proprement et masquerait un défaut d'agrandissement.
//      Il est servi HORS LIGNE par le dictionnaire d'images embarquées (window.ADOC_EXPORT_IMAGES,
//      consulté par adocResolveImages avant tout réseau) : aucun appel au Worker, aucune clé.
//   2. TEXTE DENSE — quatre blocs de prose, donc quatre étapes, et une mise en page qui remplit
//      la scène. C'est le cas qui éprouve la netteté du petit texte après agrandissement.
//   3. QUESTIONNAIRE AVEC BLOCS COMMENÇANT PAR UN CHIFFRE — les deux risques d'un coup :
//      l'animation de nombre (V6 : une capture à 300 ms montrait 16 % au lieu de 37 %) et le
//      débordement en hauteur (V3 : mesuré à 1422×2507 au lot 0).
//
// REQUETE_PHOTO est la clé du dictionnaire ET la valeur d'imageRef : c'est ainsi qu'imageRef
// fonctionne dans l'application — une requête, résolue au rendu — et non un chemin de fichier.

const REQUETE_PHOTO = 'lac calme a l aube, essai du chutier';
const PHOTO_DATA_URI = 'data:image/jpeg;base64,' +
  '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' +
  'AD//2Q==';

const IMAGES_EMBARQUEES = { [REQUETE_PHOTO]: PHOTO_DATA_URI };

const bloc = (id, texte) => ({ id, type: 'paragraph', content: { text: texte }, citationIds: [], validation: {} });
const titre = (id, texte) => ({ id, type: 'heading', content: { text: texte, level: 2 }, citationIds: [], validation: {} });
const carte = (id, t, blocs, couverture) => ({
  id, type: 'card',
  content: Object.assign({ title: t, imageRef: couverture ? REQUETE_PHOTO : null,
                           imageAlt: couverture ? 'Un lac calme a l aube' : null, blocks: blocs }),
  citationIds: [], validation: {},
});

function enveloppe(documentId, titreDoc, cartes) {
  return {
    schemaVersion: 1, documentId, versionId: documentId + '-v1', previousVersionId: null,
    requestId: documentId + '-r', sourceSnapshotId: documentId + '-s',
    createdAt: '2026-10-06T09:00:00Z', language: 'fr', status: 'draft',
    title: titreDoc, purpose: 'Essai du chutier visuel', audience: 'clinicien',
    documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: cartes, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                  accessibility: 'pending', humanClinicalReview: 'required' },
  };
}

// ── 1. Couverture avec photo ─────────────────────────────────────────────────────────────────
// Deux cartes : la couverture (un seul bloc, donc UNE étape) puis une carte à deux blocs.
const COUVERTURE = enveloppe('chutier-couverture', 'Respirer avant de parler', [
  carte('slide-01', 'Respirer avant de parler', [titre('heading-01', 'Une seule chose a retenir')], true),
  carte('slide-02', 'Deux temps', [
    bloc('paragraph-01', 'Le premier temps consiste a nommer ce qui se passe, sans le juger.'),
    bloc('paragraph-02', 'Le second temps consiste a laisser le corps revenir a son rythme.'),
  ]),
]);

// ── 2. Texte dense ───────────────────────────────────────────────────────────────────────────
const DENSE = enveloppe('chutier-dense', 'Le cercle de l evitement', [
  carte('slide-01', 'Le cercle de l evitement', [
    titre('heading-01', 'Quatre moments, toujours les memes'),
    bloc('paragraph-01', 'Une situation anodine declenche une sensation physique : la gorge se serre, le souffle se raccourcit, les mains deviennent moites. Rien de dangereux ne se produit, et pourtant le corps repond comme si quelque chose arrivait.'),
    bloc('paragraph-02', 'Vient alors la pensee qui interprete la sensation. Elle arrive si vite qu elle passe pour une evidence, et c est precisement ce qui la rend difficile a examiner : on ne discute pas ce qu on prend pour un fait.'),
    bloc('paragraph-03', 'L evitement soulage immediatement, et ce soulagement est reel. C est pour cela qu il s installe : il tient sa promesse a court terme, et il la tient chaque fois, ce qui en fait un apprentissage tres solide.'),
  ]),
]);

// ── 3. Questionnaire et blocs commençant par un chiffre ──────────────────────────────────────
// Le premier bloc de la seconde carte commence par « 37 % » : c est celui qu adocPresentAnimateNumberIfEligible
// anime sur 700 ms, et donc celui qui pourrait etre capture a 16 % si on partait trop tot.
const QUESTIONNAIRE = enveloppe('chutier-questionnaire', 'Ou en etes-vous', [
  carte('slide-01', 'Ou en etes-vous', [
    { id: 'questionnaire-01', type: 'questionnaire', content: {
        questions: [
          { text: 'Vous evitez une situation parce qu elle vous met mal a l aise.', options: [
            { text: 'Jamais', points: 0 }, { text: 'Parfois', points: 1 },
            { text: 'Souvent', points: 2 }, { text: 'Presque toujours', points: 3 }] },
          { text: 'Vous remettez a plus tard une conversation necessaire.', options: [
            { text: 'Jamais', points: 0 }, { text: 'Parfois', points: 1 },
            { text: 'Souvent', points: 2 }, { text: 'Presque toujours', points: 3 }] },
          { text: 'Vous preparez longuement ce que vous allez dire.', options: [
            { text: 'Jamais', points: 0 }, { text: 'Parfois', points: 1 },
            { text: 'Souvent', points: 2 }, { text: 'Presque toujours', points: 3 }] },
          { text: 'Vous quittez une piece quand la tension monte.', options: [
            { text: 'Jamais', points: 0 }, { text: 'Parfois', points: 1 },
            { text: 'Souvent', points: 2 }, { text: 'Presque toujours', points: 3 }] },
        ],
        // Forme exacte du schéma, relue et non devinée : label/minScore/maxScore/interpretation,
        // et allowTwoPartners obligatoire. Les bornes couvrent 0 à 12 sans trou ni chevauchement
        // (4 questions à 3 points au maximum).
        profiles: [
          { label: 'Peu d evitement', minScore: 0, maxScore: 4, interpretation: 'Les situations difficiles vous coutent, mais vous les traversez.' },
          { label: 'Evitement installe', minScore: 5, maxScore: 8, interpretation: 'Le soulagement a court terme guide une partie de vos choix.' },
          { label: 'Evitement central', minScore: 9, maxScore: 12, interpretation: 'L evitement organise votre quotidien ; un accompagnement aide a le desserrer.' },
        ],
        allowTwoPartners: false,
      }, citationIds: [], validation: {} },
  ]),
  carte('slide-02', 'Ce que disent les chiffres', [
    bloc('paragraph-01', '37 % des personnes accompagnees citent l evitement comme leur premiere difficulte.'),
    bloc('paragraph-02', 'Le chiffre importe moins que ce qu il permet de dire : vous n etes pas seul a fonctionner ainsi.'),
    bloc('paragraph-03', '12 semaines suffisent souvent pour que le cercle se desserre nettement.'),
  ]),
]);

const PRESENTATIONS = [
  { cle: 'couverture', nom: 'Couverture avec photo', doc: COUVERTURE },
  { cle: 'dense', nom: 'Texte dense', doc: DENSE },
  { cle: 'questionnaire', nom: 'Questionnaire et chiffres', doc: QUESTIONNAIRE },
];

module.exports = { PRESENTATIONS, IMAGES_EMBARQUEES, REQUETE_PHOTO, PHOTO_DATA_URI };
