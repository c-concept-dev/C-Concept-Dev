// Une présentation d'essai pour le lot 1b : trois diapositives, huit étapes, du texte réel en
// français, AUCUNE citation (le contrôle qualité des citations n'a rien à voir avec ce lot) et
// aucune donnée personnelle. Valide pour le schéma réel — le contrôle 0 le vérifie.
const bloc = (id, type, content) => ({ id, type, content, citationIds: [], validation: {} });

const PRESENTATION = {
  schemaVersion: 1,
  documentId: 'essai-narration-ia',
  versionId: 'essai-narration-ia-v1',
  previousVersionId: null,
  requestId: 'essai-narration-ia-r',
  sourceSnapshotId: 'essai-narration-ia-s',
  createdAt: '2026-10-08T09:00:00Z',
  language: 'fr',
  status: 'draft',
  title: 'Quand le silence s’installe',
  purpose: 'Présentation d’essai pour la rédaction de narration',
  audience: 'clinicien',
  documentKind: 'presentation',
  renderManifestId: 'manifest-default-001',
  derivedFrom: null,
  citations: [],
  blocks: [
    { id: 'slide-01', type: 'card', citationIds: [], validation: {},
      content: { title: 'Ce qui ne se dit pas', imageRef: null, imageAlt: null, blocks: [
        bloc('heading-01', 'heading', { text: 'Le silence n’est pas toujours une absence', level: 2 }),
        bloc('paragraph-01', 'paragraph', { text: 'Dans beaucoup de couples, il existe un sujet dont on ne parle pas. Ce n’est pas qu’on l’a oublié : on le contourne, chacun de son côté, et ce contournement finit par organiser toute la relation.' }),
        bloc('callout-01', 'callout', { text: 'Le silence protège quelque chose. Tant qu’on ignore quoi, il est difficile de le lever.', visualRole: 'info' }),
      ] } },
    { id: 'slide-02', type: 'card', citationIds: [], validation: {},
      content: { title: 'Trois formes de silence', imageRef: null, imageAlt: null, blocks: [
        bloc('heading-02', 'heading', { text: 'Elles ne se ressemblent pas', level: 2 }),
        bloc('list-01', 'list', { ordered: true, items: [
          'Le silence de protection : parler ferait mal, alors on se tait.',
          'Le silence d’habitude : on a cessé d’essayer, sans décision consciente.',
          'Le silence de représailles : se taire est devenu une manière de répondre.',
        ] }),
        bloc('paragraph-02', 'paragraph', { text: 'Les reconnaître change la conversation : on ne s’adresse pas de la même façon à quelqu’un qui se protège et à quelqu’un qui riposte.' }),
      ] } },
    { id: 'slide-03', type: 'card', citationIds: [], validation: {},
      content: { title: 'Par où commencer', imageRef: null, imageAlt: null, blocks: [
        bloc('heading-03', 'heading', { text: 'Une seule phrase suffit', level: 2 }),
        bloc('quote-01', 'quote', { text: 'Il y a quelque chose dont on ne parle jamais. Je ne sais pas par où commencer, mais j’aimerais essayer.' }),
      ] } },
  ],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
};

module.exports = { PRESENTATION };

// ── Une seconde présentation d'essai, NEUTRE et non clinique ────────────────────────────────
// Elle porte ce qu'il faut pour éprouver les cinq avertissements du 9 octobre : une liste de
// trois éléments, un questionnaire de quatre questions, une liste de quatre idées, et une
// citation à reprendre mot pour mot. Sujet volontairement sans rapport avec le travail de
// Christophe : aucun contenu réel ne doit entrer dans un test.
const b2 = (id, type, content) => ({ id, type, content, citationIds: [], validation: {} });

const PRESENTATION_LISTES = {
  schemaVersion: 1,
  documentId: 'essai-listes',
  versionId: 'essai-listes-v1',
  previousVersionId: null,
  requestId: 'essai-listes-r',
  sourceSnapshotId: 'essai-listes-s',
  createdAt: '2026-10-09T09:00:00Z',
  language: 'fr',
  status: 'draft',
  title: 'Ranger un atelier',
  purpose: 'Donner trois gestes simples pour qu’un atelier reste utilisable d’une séance à l’autre.',
  audience: 'Grand public — personnes qui bricolent chez elles',
  documentKind: 'presentation',
  renderManifestId: 'manifest-default-001',
  derivedFrom: null,
  citations: [],
  blocks: [
    { id: 'slide-01', type: 'card', citationIds: [], validation: {},
      content: { title: 'Trois gestes', imageRef: null, imageAlt: null, blocks: [
        b2('heading-01', 'heading', { text: 'Un atelier se range en partant', level: 2 }),
        b2('liste-trois', 'list', { ordered: true, items: [
          'Remettre chaque outil à sa place avant de quitter la pièce.',
          'Vider les chutes dans un seul bac, jamais sur l’établi.',
          'Noter sur une feuille ce qui manque pour la prochaine fois.',
        ] }),
        b2('citation-01', 'quote', { text: 'Un atelier bien rangé fait gagner plus de temps qu’il n’en coûte.' }),
      ] } },
    { id: 'slide-02', type: 'card', citationIds: [], validation: {},
      content: { title: 'Où en êtes-vous', imageRef: null, imageAlt: null, blocks: [
        b2('heading-02', 'heading', { text: 'Quatre questions', level: 2 }),
        b2('questionnaire-01', 'questionnaire', { allowTwoPartners: false, profiles: [],
          questions: [
            { id: 'q1', text: 'Combien d’outils traînent sur votre établi en ce moment ?', options: [] },
            { id: 'q2', text: 'Quand avez-vous vidé les chutes pour la dernière fois ?', options: [] },
            { id: 'q3', text: 'Savez-vous ce qui vous manque pour votre prochain chantier ?', options: [] },
            { id: 'q4', text: 'Combien de temps perdez-vous à chercher un outil ?', options: [] },
          ] }),
      ] } },
    { id: 'slide-03', type: 'card', citationIds: [], validation: {},
      content: { title: 'Ce qu’on retient', imageRef: null, imageAlt: null, blocks: [
        b2('liste-quatre', 'list', { ordered: true, items: [
          'Ranger en partant coûte deux minutes et en fait gagner vingt.',
          'Un seul bac pour les chutes évite de trier deux fois.',
          'Une liste de manques évite un aller-retour au magasin.',
          'Un établi vide est une invitation à recommencer.',
        ] }),
      ] } },
  ],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' },
};

module.exports.PRESENTATION_LISTES = PRESENTATION_LISTES;
