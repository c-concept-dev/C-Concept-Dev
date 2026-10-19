// LA PRÉSENTATION SYNTHÉTIQUE DU LOT 2C : cinq diapositives, narration sur deux étapes.
//
// SYNTHÉTIQUE, ET RIEN D'AUTRE : aucun mot de Christophe ni de Christine, aucun contenu réel.
// Cinq diapositives dont deux portent plusieurs blocs, pour que le calcul des étapes
// (adocPresentStepList : une étape par bloc dès qu'il y en a plus d'un, sinon une seule par
// carte) soit exercé dans ses DEUX branches — sans quoi D4 ne serait éprouvé qu'à moitié.
//
//   3 blocs + 1 bloc + 2 blocs + 1 bloc + 1 bloc = 8 étapes
const bloc = (id, texte) => ({ id, type: 'paragraph', content: { text: texte },
                               citationIds: [], validation: {} });
const titre = (id, texte) => ({ id, type: 'heading', content: { text: texte, level: 2 },
                                citationIds: [], validation: {} });
const carte = (id, t, blocs) => ({ id, type: 'card',
  content: { title: t, imageRef: null, imageAlt: null, blocks: blocs },
  citationIds: [], validation: {} });

const PRESENTATION = {
  schemaVersion: 1,
  documentId: 'lot2c-essai', versionId: 'lot2c-essai-v1', previousVersionId: null,
  requestId: 'lot2c-essai-r', sourceSnapshotId: 'lot2c-essai-s',
  createdAt: '2026-10-18T09:00:00Z', language: 'fr', status: 'draft',
  title: 'Cinq pages pour un essai', purpose: 'Essai du lot 2C',
  audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null,
  blocks: [
    carte('card-01', 'Premiere page', [
      titre('heading-01', 'Trois temps'),
      bloc('paragraph-01', 'Le premier temps consiste a nommer ce qui se passe.'),
      bloc('paragraph-02', 'Le second temps consiste a laisser le corps revenir.'),
    ]),
    carte('card-02', 'Deuxieme page', [
      bloc('paragraph-03', 'Une seule idee par page, et elle tient en deux phrases.'),
    ]),
    carte('card-03', 'Troisieme page', [
      bloc('paragraph-04', 'Ce que l evitement promet, il le tient a court terme.'),
      bloc('paragraph-05', 'C est pour cela qu il s installe si solidement.'),
    ]),
    carte('card-04', 'Quatrieme page', [
      bloc('paragraph-06', 'Douze semaines suffisent souvent pour desserrer le cercle.'),
    ]),
    carte('card-05', 'Cinquieme page', [
      bloc('paragraph-07', 'Ce qu il reste a faire tient en une phrase.'),
    ]),
  ],
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
  // (N1, N4) LA NARRATION SUR DEUX ÉTAPES SEULEMENT : une étape d'une carte à plusieurs blocs
  // et une étape d'une carte à bloc unique. D3 exige qu'aucune des deux ne bouge.
  narration: [
    { stepId: 'paragraph-02', text: 'Commentaire de la deuxieme etape de la premiere page.' },
    { stepId: 'paragraph-04', text: 'Commentaire de la premiere etape de la troisieme page.' },
  ],
};

// LA RÉPONSE SIMULÉE DU MODÈLE : une page créée par le Studio, avec les seuls types de blocs
// existants (D2 : ni image ni vidéo), et AUCUNE référence bibliographique.
const PAGE_SIMULEE = {
  title: 'Page inseree par le Studio',
  blocks: [
    { type: 'heading', text: 'Ce que cette page ajoute' },
    { type: 'paragraph', text: 'Un premier paragraphe, ecrit pour le public visee du document.' },
    { type: 'paragraph', text: 'Un second paragraphe, qui prolonge le premier sans le repeter.' },
  ],
};


// ── LA RÉPONSE RÉELLE DU 19 OCTOBRE, STRUCTURE EXACTE, TEXTE NEUTRALISÉ ──────────────────
// Ce que le modèle a réellement rendu lors de l'essai dans Safari (vrai Worker, vrai modèle) :
// un paragraphe correct, puis TROIS blocs de type « list » portant `headers` et `rows` — des
// champs de TABLE — et AUCUN `items`, AUCUN `text`.
//
// La structure est conservée à l'identique ; seul le texte est remplacé par un texte neutre,
// pour qu'aucun contenu de Christophe n'entre dans le dépôt.
//
// L'ancien schéma plat PERMETTAIT cette réponse : les huit propriétés étaient disponibles sur
// n'importe quel bloc et seule `type` était requise. C'est le défaut même.
const REPONSE_REELLE_19_OCTOBRE = {
  title: 'Un titre neutre pour l\'essai',
  blocks: [
    { type: 'paragraph', text: 'Un premier paragraphe, correct, tel que le modele l\'a rendu.' },
    { type: 'list', ordered: false, headers: [], rows: [] },
    { type: 'list', ordered: false, headers: [], rows: [] },
    { type: 'list', ordered: false, headers: [], rows: [] },
  ],
};

module.exports = { REPONSE_REELLE_19_OCTOBRE, PRESENTATION, PAGE_SIMULEE };
