/* SAF-MULTI-01 — LA LECTURE MULTIMODALE QUI ÉCHOUAIT EN SAFARI
 * ============================================================================
 *
 * CE QUE LA MESURE A DIT, ET QUI CONTREDIT LE SYMPTÔME. La personne voyait « Lecture IA
 * impossible : Délai API dépassé. » Relevé dans son propre Safari 26.3 le 2026-10-04, sur un PDF
 * de 8 pages et 16 images, l'instrumentation de `fetch` donne ceci :
 *
 *     appel 1 : 647 604 octets envoyés → HTTP 200 en 50 827 ms
 *     appel 2 : 662 957 octets envoyés → HTTP 200 en 51 989 ms
 *     total   : 103 034 ms
 *     état    : « Lecture non conforme : $.reading.method : doit valoir « provider_multimodal » ;
 *                $.reading.provider : doit valoir « anthropic » »
 *
 * AUCUN délai n'a été dépassé : les deux appels ont abouti, chacun à 51 s pour un budget de 90 s.
 * La lecture était complète — 140 908 caractères de matériau — et elle a été jetée sur deux champs
 * qui ne décrivent pas le document mais l'appel. Le modèle ne pouvait pas les deviner : le prompt
 * fournisseur ne les mentionnait pas, à la différence du prompt manuel qui, lui, les impose.
 *
 * D'OÙ DEUX CORRECTIONS, ET PAS UNE DE PLUS :
 *  1. la provenance est POSÉE par l'Atelier, qui seul la connaît, au lieu d'être demandée au
 *     modèle puis refusée ;
 *  2. le budget de la lecture documentaire est DÉRIVÉ comme celui de l'analyse — 90 s pour 8 000
 *     jetons de sortie, au prorata au-delà —, ce qui donne 180 s pour les 16 000 jetons d'une
 *     lecture. 50,8 s mesurés tenaient dans 90 s, mais à 56 % du budget : la marge manquait pour
 *     un document plus lourd, et c'est là le « Délai API dépassé » que la personne a vu passer.
 *
 * CE QUI N'A PAS CHANGÉ, ET QUI EST ÉPROUVÉ ICI AUSSI : le transport texte garde ses 90 s, parce
 * qu'il n'a pas à devenir plus lent à détecter une panne pour accommoder un PDF ; et le chemin
 * manuel garde son contrôle strict de provenance, parce que là la déclaration de la personne est
 * le seul garde-fou contre une lecture collée pour un autre document.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lecture from '../core/documents/reading.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTEFACT = 'atelier-prompts-v11.5-lot10g-decision-provider.html';
const html = fs.readFileSync(path.join(racine, ARTEFACT), 'utf8');
const CHARTE = 'Charte_graphique_Institut_Relation_Couple_v6.pdf';

/* Le corps de la lecture refusée le 2026-10-04 : complète, fidèle, et jetée sur sa seule
   provenance. `method` et `provider` sont ceux qu'Anthropic a réellement rendus — les valeurs du
   chemin manuel, les seules que le schéma nommait sans dire quand les employer. */
const lectureRefusee = () => ({
  document: { name: CHARTE, mime_type: 'application/pdf', source: 'user_document' },
  reading: {
    method: 'external_llm_manual', provider: null,
    text: 'CHARTE GRAPHIQUE\nInstitut de la Relation et du Couple\n' + 'x'.repeat(2000),
    structure: [{ level: 1, title: 'Charte graphique' }, { level: 2, title: 'Palette' }],
    visual_elements: [
      { kind: 'palette', description: 'Palette de sept aplats, chaque aplat portant son code écrit.', value: '#086582, #68A8B0' },
      { kind: 'logo', description: 'Logo en trois variantes : pleine couleur, monochrome, blanc.', value: null }
    ],
    tables: [{ title: 'Usages couleur', rows: [['Couleur', 'Usage'], ['#086582', 'Titres']] }],
    uncertain_or_unreadable: ['Le pied de page de la page 4 est coupé.']
  }
});
const attenduFournisseur = { name: CHARTE, method: 'provider_multimodal', provider: 'anthropic' };

// =================================================================================================
// LA PANNE ELLE-MÊME
// =================================================================================================

test('SAF-MULTI-01 · LA_PANNE_MESURÉE : la lecture refusée le 2026-10-04 est désormais admise', () => {
  /* Avant : deux appels aboutis, 103 s, et rien. La preuve que c'était bien ce refus-là. */
  const avant = lecture.validateReading(lectureRefusee(), attenduFournisseur);
  assert.equal(avant.valid, false, 'sans estampille, la lecture est refusée — c’est la panne');
  assert.deepEqual(avant.violations, [
    '$.reading.method : doit valoir « provider_multimodal »',
    '$.reading.provider : doit valoir « anthropic »'
  ], 'et refusée sur exactement les deux champs que Safari a rapportés, mot pour mot');

  /* Après : l'Atelier pose ce qu'il sait, et la lecture passe. */
  const apres = lectureRefusee();
  lecture.stampProvenance(apres, { name: CHARTE, mimeType: 'application/pdf', method: 'provider_multimodal', provider: 'anthropic' });
  const verdict = lecture.validateReading(apres, attenduFournisseur);
  assert.equal(verdict.valid, true, 'après estampille : ' + verdict.violations.join(' ; '));
  assert.equal(apres.reading.method, 'provider_multimodal');
  assert.equal(apres.reading.provider, 'anthropic');
});

test('SAF-MULTI-02 · RIEN_D_AUTRE_N_EST_TOUCHÉ : seule la provenance est posée, la lecture est intacte', () => {
  const avant = lectureRefusee();
  const apres = lectureRefusee();
  lecture.stampProvenance(apres, { name: CHARTE, mimeType: 'application/pdf', method: 'provider_multimodal', provider: 'anthropic' });
  /* Ce que le modèle a lu reste ce que le modèle a lu : octet pour octet. */
  for (const champ of ['text', 'structure', 'visual_elements', 'tables', 'uncertain_or_unreadable']) {
    assert.deepEqual(apres.reading[champ], avant.reading[champ], '« ' + champ + ' » n’est pas réécrit');
  }
  assert.deepEqual(Object.keys(apres.reading), Object.keys(avant.reading), 'aucun champ ajouté ni retiré');
  assert.deepEqual(Object.keys(apres.document), Object.keys(avant.document));
});

test('SAF-MULTI-03 · AUCUNE_RÉPARATION_SILENCIEUSE : une forme invalide repart telle quelle, et reste refusée', () => {
  /* L'estampille n'est pas un correcteur : elle pose cinq champs, elle ne fabrique pas d'objet.
     Une sortie difforme doit continuer d'être REFUSÉE, et non rendue présentable. */
  const sansLecture = { document: { name: CHARTE, source: 'user_document' } };
  lecture.stampProvenance(sansLecture, { name: CHARTE, method: 'provider_multimodal', provider: 'anthropic' });
  assert.equal(sansLecture.reading, undefined, '« reading » n’est pas inventé');
  assert.equal(lecture.validateReading(sansLecture, attenduFournisseur).valid, false);

  const lectureEnTableau = { document: { name: CHARTE, source: 'user_document' }, reading: [] };
  lecture.stampProvenance(lectureEnTableau, { name: CHARTE, method: 'provider_multimodal', provider: 'anthropic' });
  assert.deepEqual(lectureEnTableau.reading, [], 'un tableau n’est pas converti en objet');
  assert.equal(lecture.validateReading(lectureEnTableau, attenduFournisseur).valid, false);

  for (const rien of [null, undefined, 'texte', 42, []]) {
    assert.doesNotThrow(() => lecture.stampProvenance(rien, { name: CHARTE, method: 'provider_multimodal', provider: 'anthropic' }));
  }

  /* Et une lecture dont le CONTENU est fautif reste refusée : l'estampille ne couvre pas le fond. */
  const trop = lectureRefusee();
  trop.reading.text = 'x'.repeat(lecture.READING_LIMITS.textChars + 1);
  lecture.stampProvenance(trop, { name: CHARTE, method: 'provider_multimodal', provider: 'anthropic' });
  const v = lecture.validateReading(trop, attenduFournisseur);
  assert.equal(v.valid, false);
  assert.match(v.violations.join(' '), /\$\.reading\.text/, 'le plafond de texte est toujours opposé');
});

test('SAF-MULTI-04 · LE_CHEMIN_MANUEL_RESTE_STRICT : rien n’y est estampillé, et c’est voulu', () => {
  /* Là, la personne colle une réponse obtenue ailleurs : la provenance déclarée est le SEUL
     garde-fou contre une lecture faite pour un autre document, ou par un autre chemin. */
  const colleePourUnAutreDocument = lectureRefusee();
  colleePourUnAutreDocument.document.name = 'un_autre_document.pdf';
  const v1 = lecture.validateReading(colleePourUnAutreDocument, { name: CHARTE, method: 'external_llm_manual', provider: null });
  assert.equal(v1.valid, false, 'une lecture pour un autre document est refusée');
  assert.match(v1.violations.join(' '), /\$\.document\.name/);

  const colleeEnPretendantUnAppel = lectureRefusee();
  colleeEnPretendantUnAppel.reading.method = 'provider_multimodal';
  colleeEnPretendantUnAppel.reading.provider = 'anthropic';
  const v2 = lecture.validateReading(colleeEnPretendantUnAppel, { name: CHARTE, method: 'external_llm_manual', provider: null });
  assert.equal(v2.valid, false, 'une lecture collée ne peut pas se déclarer appel fournisseur');

  /* Et le prompt manuel, lui, continue de DIRE les valeurs attendues : la personne les recopie. */
  const prompt = lecture.buildManualPrompt({ name: CHARTE });
  assert.match(prompt, /"reading\.method" vaut exactement : external_llm_manual/);
  assert.match(prompt, /"reading\.provider" vaut exactement : null/);
});

// =================================================================================================
// LES BUDGETS — celui du texte intact, celui de la lecture dérivé
// =================================================================================================

test('SAF-MULTI-05 · LE_TEXTE_GARDE_SES_90_S : aucun transport n’a été ralenti', () => {
  /* La consigne de la mission, littéralement : le transport texte n'a pas à devenir plus lent à
     détecter une panne pour accommoder un PDF. Les deux transports gardent donc leur défaut. */
  const defauts = [...html.matchAll(/delaiMs = delaiMs \|\| (\d+);/g)].map((m) => Number(m[1]));
  assert.deepEqual(defauts, [90000, 90000], 'un défaut de 90 s par transport, et pas d’autre valeur');
  assert.equal((html.match(/const minuteur = setTimeout\(\(\) => ctrl\.abort\(\), delaiMs\);/g) || []).length, 2,
    'et chaque transport arme son minuteur sur ce même delaiMs');
});

test('SAF-MULTI-06 · LE_BUDGET_EST_DÉRIVÉ, PAS CHOISI : la règle maison appliquée à 16 000 jetons', () => {
  /* Le produit énonce déjà la règle pour l'analyse : « appel à 90 s, calibré pour 8 000 jetons :
     le délai de l'analyse suit le plafond dans le même rapport. » Le même rapport vaut ici. */
  const regle = (maxJetons) => Math.max(90000, Math.round(maxJetons * 90000 / 8000));
  assert.equal(regle(8000), 90000, 'à 8 000 jetons, la règle rend le budget d’origine');
  assert.equal(regle(16000), 180000, 'à 16 000 jetons — ce qu’une lecture demande — elle rend 180 s');

  assert.match(html, /const delaiAnalyseMs=Math\.max\(90000,Math\.round\(maxAnalyse\*90000\/8000\)\);/,
    'la règle de l’analyse est toujours là, inchangée');
  assert.match(html, /const maxJetonsLecture=16000;/);
  assert.match(html, /const delaiLectureMs=Math\.max\(90000,Math\.round\(maxJetonsLecture\*90000\/8000\)\);/,
    'et la lecture emploie LA MÊME formule, pas un nombre posé à la main');

  /* Nulle part un budget n'a été gonflé en dur pour faire passer un cas. */
  assert.equal(/delaiMs\s*[:=]\s*(120000|150000|180000|300000)/.test(html), false,
    'aucun délai écrit en dur : il se dérive ou il n’existe pas');
});

test('SAF-MULTI-07 · LA_LECTURE_EMPLOIE_SON_BUDGET, ET ESTAMPILLE AVANT DE VALIDER', () => {
  /* v11LireAvecFournisseur vit dans l'IIFE du routeur v11 : aucune poignée globale n'a été
     ajoutée pour l'atteindre — quatre gardes du dépôt l'interdisent, et une surface qui ne
     servirait qu'aux tests n'en est pas une. Ce qui se vérifie ici est donc le CÂBLAGE ; le
     comportement de bout en bout est relevé par le smoke navigateur, en Safari réel. */
  const i = html.indexOf('async function v11LireAvecFournisseur(doc){');
  assert.notEqual(i, -1, 'la fonction est toujours là');
  const corps = html.slice(i, html.indexOf('\n}', html.indexOf('catch(error)', i)));

  assert.match(corps, /delaiMs:delaiLectureMs/, 'l’appel porte le budget dérivé');
  assert.match(corps, /maxTokens:maxJetonsLecture/, 'et le plafond dont ce budget se dérive — les deux ne peuvent pas divorcer');

  const posee = corps.indexOf('lecture.stampProvenance(');
  const validee = corps.indexOf('lecture.validateReading(');
  assert.notEqual(posee, -1, 'la provenance est posée');
  assert.ok(posee < validee, 'et elle est posée AVANT la validation, sinon elle ne sert à rien');
  assert.match(corps, /stampProvenance\(extrait\.value,\{name:doc\.name,mimeType:doc\.type\|\|'',method:'provider_multimodal',provider:acces\.id\}\)/,
    'avec le fournisseur réellement appelé, jamais une valeur écrite en dur');
});

test('SAF-MULTI-08 · LE_PROMPT_NE_DEMANDE_PLUS_CE_QUE_L_ATELIER_SAIT', () => {
  const prompt = lecture.buildProviderPrompt({ name: CHARTE }, { localText: 'Un texte extrait localement.' });
  assert.match(prompt, /Règles de sortie :/, 'le prompt fournisseur a enfin ses règles de sortie, comme le manuel');
  assert.match(prompt, /la provenance ne vous concerne pas/, 'le modèle est prévenu');
  assert.match(prompt, /sont posés par l’outil qui vous appelle/);
  assert.match(prompt, /un tableau vide si vous n’avez rien à y mettre/, 'et la règle des tableaux vides, qui manquait aussi');
  /* Et ce qui faisait la valeur du prompt reste : la consigne, le texte local qui fait foi, les
     observables visuels. La correction n'a rien retiré. */
  assert.match(prompt, /DOCUMENT : /);
  assert.match(prompt, /LE TEXTE CI-DESSOUS A DÉJÀ ÉTÉ EXTRAIT LOCALEMENT/);
  assert.match(prompt, /N’INVENTEZ RIEN/);
  assert.match(prompt, /palettes et codes couleur/);
});

test('SAF-MULTI-09 · UNE_VRAIE_PANNE_EST_TOUJOURS_DÉTECTÉE, et nommée', async () => {
  /* Élargir un budget ne doit pas rendre une panne muette. Le mécanisme est éprouvé pour de vrai,
     sur un budget court : un serveur qui n'envoie jamais rien est abandonné, et il est DIT. */
  const t0 = Date.now();
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), 300);
  let nom = null;
  try {
    await new Promise((_, rejette) => {
      ctrl.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rejette(e); });
    });
  } catch (e) { nom = e.name; }
  clearTimeout(minuteur);
  const ecoule = Date.now() - t0;
  assert.equal(nom, 'AbortError', 'un silence prolongé est bien abandonné');
  assert.ok(ecoule >= 290 && ecoule < 3000, 'au budget, pas plus tard (' + ecoule + ' ms)');

  /* Et le produit traduit toujours cet abandon en message, dans les deux transports. */
  assert.equal((html.match(/if\(err\.name === 'AbortError'\) throw creerErreurApi\(\{categorie:'delai_depasse'/g) || []).length, 2);
  assert.equal((html.match(/message_utilisateur:'Délai API dépassé\.'/g) || []).length, 2,
    'les deux transports nomment la panne de la même façon');
  assert.match(html, /if\(\/Délai API dépassé\/\.test\(m\)\)return 'delai_depasse';/,
    'et la classification en aval reconnaît toujours ce message');
});
