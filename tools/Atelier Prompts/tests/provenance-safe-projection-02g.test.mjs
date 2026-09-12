/* 02G — UN VERROU NE PEUT PAS INVENTER L'HISTOIRE DE LA DEMANDE.
 * ============================================================================
 *
 * Le smoke produit qui a suivi 02F a livré des prompts qui affirmaient des faits absents de la
 * demande. « Fais-moi un plan de révision en 5 séances » recevait « Ce qui est demandé : code,
 * interface, navigation, export », « aucun barème publié », « depuis un fichier local ».
 * « Compare le train et l'avion » recevait « Titre d'accès : accès professionnel régulier », « usage
 * professionnel interne » et « le matériau nécessaire est fourni dans ce prompt » — sans qu'aucun
 * matériau n'ait été fourni. Et « Corrige les fautes de ce texte » recevait à la fois le texte à
 * corriger et l'interdiction de le restituer : une tâche rendue infaisable.
 *
 * La cause n'était pas la sélection des verrous, qui est justifiée et traçable. C'était la
 * projection : `perimetre` était le seul projecteur des treize à ne recevoir AUCUN argument, donc à
 * ne rien pouvoir dire de la demande ; et `provenance` servait des valeurs de repli dès que ses
 * champs étaient vides, c'est-à-dire presque toujours.
 *
 * Ce que cette suite fige :
 *   NO ASSERTION WITHOUT PROVENANCE
 *   — un fait établi est projeté fidèlement ;
 *   — un fait absent ne devient jamais une affirmation ;
 *   — un verrou sans rien de sourcé à dire se limite à une discipline non assertive ;
 *   — et la projection ne peut pas interdire ce que la tâche exige.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runRapidePipeline, createRapideHarness, sectionBody, sectionTitles } from './rapide-assembler-harness.helper.mjs';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

/* Vocabulaire de domaine que la production ne doit JAMAIS introduire d'elle-même. Il vit ici, dans
   le test, et nulle part dans la logique corrigée. */
const INVENTIONS = [
  'Code, logique de calcul', 'interface, navigation', 'barème publié', 'contenu protégé',
  'fichier local', 'accès professionnel régulier', 'usage professionnel interne',
  'matériau professionnel dont', 'professionnel du domaine', 'données factices'
];

function contrat(contraintes, demande, livrable = 'Un livrable.') {
  const turn = oprieReadyTurn({ state: 'operational_request_ready' });
  turn.operational_request_candidate = {
    ...turn.operational_request_candidate,
    confirmed_constraints: contraintes,
    expected_deliverable: livrable
  };
  return canonicalFrom(turn, { request_id: '02g', original_request: demande });
}
/** Chaîne canonique complète : même chemin de production que le smoke. */
function jouer(contraintes, demande, materiau = '') {
  const base = contrat(contraintes, demande);
  return runRapidePipeline({
    demande, materiau,
    orientation: {
      source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
      canonical: base, envelope: null, semantic: null, providerResult: null,
      action: null, decision: { state: 'ready' }
    }
  });
}
const perimetre = (p) => String(sectionBody(p, 'PÉRIMÈTRE DU LIVRABLE') || '');
const provenance = (p) => String(sectionBody(p, 'PROVENANCE ET USAGE DU MATÉRIAU') || '');
const quantifiees = (p) => String(sectionBody(p, 'CONTRAINTES QUANTIFIÉES') || '');

/** Projection avec les champs de provenance de l'atelier réellement renseignés. */
function jouerAvecChamps(champs, { demande, materiau = '', verrous }) {
  const h = createRapideHarness({ demande, materiau });
  for (const [id, v] of Object.entries(champs)) h.element(id).value = v;
  const r = h.assemblerRapideAdaptatif();
  return h.assembler(r.ctx, verrous);
}

/* ==========================================================================
 * T-02G-01 / 02 — PÉRIMÈTRE
 * ======================================================================= */

test('T-02G-01 : le projecteur de périmètre n’invente aucun détail de domaine', () => {
  const p = jouer(['Le nombre d’idées doit être exactement 7'],
    'Donne exactement 7 idées de cadeaux pour un enfant de 8 ans');
  const bloc = perimetre(p.promptFinal);
  assert.notEqual(bloc, '', 'prémisse : le verrou périmètre est bien sélectionné');
  for (const mot of INVENTIONS) {
    assert.equal(bloc.includes(mot), false, `« ${mot} » n’a aucune source dans cette demande`);
  }
});

test('T-02G-02 : un périmètre établi est projeté fidèlement, mot pour mot', () => {
  const contraintes = ['Ne pas modifier le sens du texte', 'Ne pas modifier la structure ou le style des phrases'];
  const bloc = perimetre(jouer(contraintes, 'Corrige les fautes de ce texte', 'Un texte avec des faute.').promptFinal);
  for (const c of contraintes) assert.ok(bloc.includes(c), `« ${c} » doit figurer telle quelle`);
});

/* ==========================================================================
 * T-02G-03 / 04 — MATÉRIAU
 * ======================================================================= */

test('T-02G-03 : un matériau absent n’est jamais déclaré fourni', () => {
  const p = jouer([], 'Compare les avantages et inconvénients du train et de l’avion, sous forme de tableau');
  assert.doesNotMatch(p.promptFinal, /matériau .{0,40}est fourni dans ce prompt/,
    'aucun matériau n’a été fourni : le prompt ne peut pas l’affirmer');
  assert.doesNotMatch(p.promptFinal, /les données sources/,
    'et il ne peut pas non plus affirmer des données sources inexistantes');
});

test('T-02G-04 : un matériau fourni reste déclaré fourni', () => {
  const p = jouer([], 'Corrige les fautes de ce texte', 'Le télétravail c’est developpé tres vite.');
  assert.match(provenance(p.promptFinal), /est fourni dans ce prompt/,
    'le matériau est réellement là : le dire est fidèle, pas inventé');
  assert.ok(sectionTitles(p.promptFinal).includes('DONNÉES SOURCES'));
});

/* ==========================================================================
 * T-02G-05 / 06 — PROVENANCE
 * ======================================================================= */

test('T-02G-05 : une provenance inconnue n’est pas fabriquée', () => {
  const bloc = provenance(jouer([], 'Corrige les fautes de ce texte', 'Un texte avec des faute.').promptFinal);
  assert.notEqual(bloc, '', 'prémisse : la section existe');
  assert.equal(bloc.includes('Origine :'), false, 'aucune origine n’a été donnée');
  assert.equal(bloc.includes('matériau professionnel dont'), false);
  assert.equal(bloc.includes('Usage du livrable :'), false, 'aucun usage n’a été donné');
});

test('T-02G-06 : une provenance explicite est préservée', () => {
  const p = jouerAvecChamps(
    { provenance: 'document interne fourni par la direction des opérations',
      usage: 'diffusion interne à l’équipe projet uniquement' },
    { demande: 'Rédige une note de cadrage à partir du document fourni',
      materiau: 'Note interne — projet Atlas.',
      verrous: ['role', 'donnees', 'provenance', 'format', 'interdits', 'controle'] });
  const bloc = provenance(p);
  assert.match(bloc, /Origine : document interne fourni par la direction des opérations\./);
  assert.match(bloc, /Usage du livrable : diffusion interne à l’équipe projet uniquement\./);
});

/* ==========================================================================
 * T-02G-07 / 08 — DROITS ET ACCÈS
 * ======================================================================= */

test('T-02G-07 : un droit ou un titre d’accès inconnu n’est pas inventé', () => {
  const bloc = provenance(jouer([], 'Corrige les fautes de ce texte', 'Un texte avec des faute.').promptFinal);
  assert.equal(bloc.includes('Titre d’accès'), false, 'personne n’a déclaré de titre d’accès');
  assert.equal(bloc.includes('accès professionnel régulier'), false);
  /* La discipline générique reste : elle n’affirme l’existence d’aucune restriction. */
  assert.match(bloc, /Respectez les droits et restrictions explicitement fournis/);
});

test('T-02G-08 : une restriction de droits explicite est préservée', () => {
  const bloc = provenance(jouerAvecChamps(
    { droit: 'licence interne, diffusion restreinte' },
    { demande: 'Rédige une note de cadrage à partir du document fourni',
      materiau: 'Note interne — projet Atlas.',
      verrous: ['role', 'donnees', 'provenance', 'format', 'interdits', 'controle'] }));
  assert.match(bloc, /Titre d’accès : licence interne, diffusion restreinte\./);
});

/* ==========================================================================
 * T-02G-09 — TRANSFORMATION DE MATÉRIAU : AUCUNE CONTRADICTION
 * ======================================================================= */

test('T-02G-09 : un prompt de transformation de matériau ne se contredit pas', () => {
  const p = jouer(['Ne pas modifier le sens du texte'],
    'Corrige les fautes d’orthographe et de grammaire de ce texte',
    'Le télétravail c’est developpé tres vite depuis 2020.');
  const prompt = p.promptFinal;
  /* Le matériau est fourni POUR être transformé : rien ne peut interdire de l'utiliser. */
  assert.ok(sectionTitles(prompt).includes('DONNÉES SOURCES'), 'prémisse : le matériau est bien là');
  for (const interdiction of [
    /Ne restituez pas de passage étendu/,
    /Il ne s’agit pas de reproduire la source/,
    /Ne recopiez dans le livrable/
  ]) {
    assert.doesNotMatch(prompt, interdiction,
      'une règle de provenance ne peut pas interdire l’opération demandée');
  }
});

/* ==========================================================================
 * T-02G-10 / 15 — ANTI-INVENTION, PROPRIÉTÉ GÉNÉRALE
 * ======================================================================= */

test('T-02G-10 : une demande banale ne contient aucune assertion de domaine héritée', () => {
  for (const [contraintes, demande] of [
    [[], 'Explique la photosynthèse simplement'],
    [['Le nombre d’idées doit être exactement 7'], 'Donne 7 idées de cadeaux pour un enfant de 8 ans'],
    [[], 'Compare le train et l’avion en tableau'],
    [['5 séances exactement'], 'Fais-moi un plan de révision en 5 séances']
  ]) {
    const prompt = jouer(contraintes, demande).promptFinal;
    for (const mot of INVENTIONS) {
      assert.equal(prompt.includes(mot), false, `« ${mot} » dans le prompt de « ${demande} »`);
    }
  }
});

test('T-02G-16 : tout projecteur reçoit le contexte — aucun ne peut plus parler sans source', () => {
  /* La cause racine était mesurable ainsi : `perimetre` était d'arité 0, seul parmi les treize.
     Un projecteur qui ne reçoit rien ne peut rien sourcer. */
  const h = createRapideHarness({ demande: 'x' });
  const arites = JSON.parse(h.evaluate(
    'JSON.stringify(Object.fromEntries(Object.entries(SECTIONS).map(([k,v])=>[k,v.length])))'));
  const muets = Object.entries(arites).filter(([, n]) => n === 0).map(([k]) => k);
  assert.deepEqual(muets, [], `projecteur(s) sans entrée : ${muets.join(', ')}`);
});

/* ==========================================================================
 * T-02G-11 / 12 / 13 — LES TROIS CAS DU SMOKE QUI ÉCHOUAIENT
 *
 * Les contraintes confirmées citées ici sont celles que l'Arbitre réel a produites, reprises mot
 * pour mot des tours capturés pendant le smoke. Les prompts livrés en chaîne réelle figurent dans
 * le rapport ; ces tests figent l'invariant sans dépendre du réseau.
 * ======================================================================= */

test('T-02G-11 : smoke S1 — plan de révision en 5 séances', () => {
  const prompt = jouer(['5 séances exactement', 'Examen dans 3 semaines'],
    'Fais-moi un plan de révision en 5 séances pour un examen de droit constitutionnel dans 3 semaines').promptFinal;
  for (const mot of INVENTIONS) assert.equal(prompt.includes(mot), false, `« ${mot} »`);
  assert.match(perimetre(prompt), /5 séances exactement/);
  assert.match(perimetre(prompt), /Examen dans 3 semaines/);
});

test('T-02G-12 : smoke S2 — comparaison train / avion, sans matériau', () => {
  const prompt = jouer([], "Compare les avantages et inconvénients du train et de l'avion pour Paris-Marseille, sous forme de tableau").promptFinal;
  for (const mot of INVENTIONS) assert.equal(prompt.includes(mot), false, `« ${mot} »`);
  assert.doesNotMatch(prompt, /est fourni dans ce prompt/);
  assert.equal(sectionTitles(prompt).includes('DONNÉES SOURCES'), false);
});

test('T-02G-13 : smoke S3 — correction d’un texte fourni', () => {
  const prompt = jouer(['Ne pas modifier le sens du texte', 'Ne pas modifier la structure ou le style des phrases'],
    "Corrige les fautes d'orthographe et de grammaire de ce texte",
    'Le télétravail c’est developpé tres vite depuis 2020.').promptFinal;
  for (const mot of INVENTIONS) assert.equal(prompt.includes(mot), false, `« ${mot} »`);
  assert.match(provenance(prompt), /est fourni dans ce prompt/, 'le matériau est là : le dire est vrai');
  assert.match(perimetre(prompt), /Ne pas modifier le sens du texte/);
  assert.doesNotMatch(prompt, /Ne restituez pas de passage étendu/);
});

/* ==========================================================================
 * T-02G-14 / 15 / 17 / 18 — SOURCE_COVERAGE_WITHOUT_SOURCE
 *
 * « Une règle qui dépend de données sources ne peut exister dans le prompt que si ces données
 * sources existent réellement. » La manifestation signalée — « Couverture : 100 % des éléments
 * présents dans les données sources » sans matériau — appartient à la famille déjà traitée dans ce
 * lot. Le balayage des formulations ÉQUIVALENTES en a révélé deux autres, dont une écrite par ce
 * lot lui-même.
 * ======================================================================= */

/* Toute formulation du prompt qui suppose l'existence d'une source. */
const SUPPOSE_UNE_SOURCE = [
  /100 % des éléments présents dans les données sources/,
  /couvrir toutes les données sources/i,
  /le matériau fourni/i,
  /les données fournies/i,
  /ou par le matériau/,
  /comme une donnée fournie/,
  /du matériau à traiter/,
  /\[coller ici le matériau/
];

test('T-02G-14 : sans matériau, aucune instruction ne suppose de données sources', () => {
  for (const [contraintes, demande] of [
    [['Le nombre d’idées doit être exactement 7'], 'Donne exactement 7 idées de cadeaux'],
    [[], 'Compare le train et l’avion en tableau'],
    [['5 séances exactement'], 'Fais-moi un plan de révision en 5 séances'],
    [[], 'Explique la photosynthèse simplement']
  ]) {
    const prompt = jouer(contraintes, demande).promptFinal;
    for (const re of SUPPOSE_UNE_SOURCE) {
      assert.doesNotMatch(prompt, re, `« ${demande} » — aucun matériau, donc aucune source supposée`);
    }
    assert.match(quantifiees(prompt) + sectionBody(prompt, 'INTERDICTIONS'),
      /Traitez la totalité de ce qui est demandé|Pas de résumé/,
      'l’exigence d’exhaustivité subsiste, portée sur ce qui est demandé');
  }
});

test('T-02G-15 : avec un matériau réel, la discipline de couverture peut rester', () => {
  const p = jouer(['Le nombre de sections doit être exactement 3'],
    'Résume ce texte en 3 sections', 'Le télétravail s’est développé très vite depuis 2020.');
  const prompt = p.promptFinal;
  assert.ok(sectionTitles(prompt).includes('DONNÉES SOURCES'), 'prémisse : le matériau est là');
  /* La couverture porte alors sur des données qui existent — et aucune provenance n’est inventée
     pour autant : ni titre d’accès, ni origine, ni usage. */
  const prov = provenance(prompt);
  assert.equal(prov.includes('Titre d’accès'), false);
  assert.equal(prov.includes('Origine :'), false);
  assert.equal(prov.includes('Usage du livrable :'), false);
  assert.match(prov, /est fourni dans ce prompt/, 'le matériau réel peut être déclaré fourni');
});

test('T-02G-17 : un format qui exige des données n’en fabrique pas pour autant', () => {
  /* `T-RAPCHAR-15` avait nommé ce défaut « ANOMALIE ATTENDUE À ÉVOLUER » : sans matériau, la
     section était remplie d’un espace réservé que le même prompt interdit et demande de traquer,
     et qui s’adressait à l’utilisateur de l’atelier, pas au modèle. */
  for (const demande of [
    'Donne-moi un objet JSON décrivant une fiche produit',
    'Écris une fonction JavaScript qui valide une adresse e-mail',
    'Produis un JSON valide avec les champs nom, objectif, risques.'
  ]) {
    const prompt = runRapidePipeline({ demande }).promptFinal;
    assert.equal(sectionTitles(prompt).includes('DONNÉES SOURCES'), false,
      `« ${demande} » : aucune donnée fournie, donc aucune section de données`);
    assert.doesNotMatch(prompt, /\[coller ici le matériau/);
    /* L’absence n’est pas passée sous silence : le contrat produit existant s’en charge. */
    assert.match(sectionBody(prompt, 'INFORMATIONS MANQUANTES'), /source non fournie/,
      'la section INFORMATIONS MANQUANTES nomme déjà le cas');
  }
});

test('T-02G-18 : la discipline de provenance ne suppose un matériau que s’il y en a un', () => {
  /* Le verrou provenance est levé par des faits externes à rechercher — c'est ce qui s'est passé
     sur la comparaison train / avion : l'Arbitre réel en avait relevé quatre. On reproduit cette
     condition, sinon le verrou n'est pas sélectionné et le test passerait par vacuité. */
  const turn = oprieReadyTurn({ state: 'operational_request_ready' });
  turn.operational_request_candidate = {
    ...turn.operational_request_candidate,
    expected_deliverable: 'Un tableau comparatif.',
    external_facts_to_research: ['Durées de trajet typiques', 'Fourchettes de prix habituelles']
  };
  const base = canonicalFrom(turn, { request_id: '02g-18', original_request: 'Compare le train et l’avion en tableau' });
  const p = runRapidePipeline({
    demande: 'Compare le train et l’avion en tableau',
    orientation: { source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
      canonical: base, envelope: null, semantic: null, providerResult: null, action: null, decision: { state: 'ready' } }
  });
  const sans = provenance(p.promptFinal);
  assert.notEqual(sans, '', 'prémisse : le verrou provenance est bien sélectionné');
  const avec = provenance(jouer([], 'Corrige les fautes de ce texte', 'Un texte avec des faute.').promptFinal);
  assert.match(sans, /Distinguez ce qui est établi par la demande de ce que vous apportez/);
  assert.doesNotMatch(sans, /ou par le matériau/);
  assert.match(avec, /Distinguez ce qui est établi par la demande ou par le matériau/);
});
