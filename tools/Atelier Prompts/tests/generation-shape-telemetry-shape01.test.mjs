/* GROQ-FAILED-GENERATION-SHAPE-01 — DÉCRIRE UNE FORME, JAMAIS IDENTIFIER UN CONTENU.
 * ============================================================================
 *
 * CE QUI RESTAIT INCONNU. Huit rejets `json_validate_failed` en production, tous porteurs d'un
 * `failed_generation` de 64 caractères, non parsable, sans aucune clé, NON tronqué — identique cinq
 * fois sur deux versions de Worker. Le modèle produit donc quelque chose de déterministe, et sa
 * NATURE était hors de portée : fragment de JSON, phrase, répétition ? Ces trois hypothèses
 * appellent trois corrections opposées, et rien ne permettait de choisir.
 *
 * LA CONTRAINTE, ET ELLE EST ABSOLUE. Pas un caractère du contenu ne sort. Ni extrait, ni préfixe,
 * ni suffixe, ni le premier caractère réel — seulement sa CLASSE. Aucun hachage, aucun encodage,
 * aucune échappée : un hachage identifierait un contenu, ce que ce relevé doit précisément ne pas
 * pouvoir faire.
 *
 * ET LA PROPRIÉTÉ QUI LE PROUVE : deux chaînes DIFFÉRENTES de même forme rendent le MÊME profil.
 * C'est recherché, pas subi. Un relevé capable de distinguer deux contenus serait un relevé qui les
 * décrit — T-SHAPE-07 en fait un test.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  describeGenerationShape, GENERATION_SHAPE_CHAR_CLASSES, describeFailedGeneration,
  FAST_INTERACTION_ADAPTERS, classifyProviderHttpStatus, FAST_PROVIDER_ORDER
} from '../workers/groq/src/index.js';
import { createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import { FAILURE_CLASSES } from '../workers/shared/provider-ha.js';

const source = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');

/** Les sept formes que le profil doit savoir séparer. */
const FORMES = {
  json_valide: '{"type":"ACKNOWLEDGE","text":"Bien noté."}',
  json_fragmentaire: '{"type":"ASK_CLARIFICATION","text":"Depuis quelle vill',
  prose: 'Je ne peux pas produire une sortie conforme au schéma demandé ici.',
  ponctuation: '.....,,,,,:::::;;;;;',
  unicode: 'réunion reportée — lundi à 10 h ✓ équipe de six personnes',
  avec_secret: 'clé gsk_ABCDEFGH12345678abcdefghij et Bearer zzzzzzzzzzzzzzzz',
  avec_texte_utilisateur: 'PHRASE_PRIVEE_DE_LA_PERSONNE qui ne doit jamais ressortir'
};

/* ==========================================================================
 * LE PROFIL SÉPARE LES FORMES
 * ======================================================================= */

test('T-SHAPE-01 : un JSON valide se reconnaît à sa forme, sans lire son contenu', () => {
  const f = describeGenerationShape(FORMES.json_valide);
  assert.equal(f.shape_measured, true);
  assert.equal(f.shape_json_parseable, true);
  assert.equal(f.shape_starts_with_json_container, true);
  assert.equal(f.shape_ends_with_json_container, true);
  assert.equal(f.shape_balanced_curly_braces, true);
  assert.equal(f.shape_quote_count_even, true);
  assert.equal(f.shape_first_char_class, 'brace');
  assert.equal(f.shape_last_char_class, 'brace');
  assert.equal(f.shape_parse_error_position, null, 'rien à signaler : il parse');
});

test('T-SHAPE-02 : un fragment JSON se distingue d’un JSON valide — et c’est le cas qui compte', () => {
  /* LA QUESTION OUVERTE DE LA PRODUCTION : les 64 caractères sont-ils un JSON coupé ? Un fragment
     a des conteneurs DÉSÉQUILIBRÉS et, souvent, un nombre impair de guillemets. */
  const f = describeGenerationShape(FORMES.json_fragmentaire);
  assert.equal(f.shape_json_parseable, false);
  assert.equal(f.shape_starts_with_json_container, true, 'il commence comme un JSON');
  assert.equal(f.shape_ends_with_json_container, false, 'mais ne se referme pas');
  assert.equal(f.shape_balanced_curly_braces, false, 'accolades déséquilibrées');
  assert.equal(f.shape_quote_count_even, false, 'guillemet non refermé');
  assert.equal(f.shape_contains_json_like_punctuation, true);
  assert.ok(f.shape_colons > 0 && f.shape_commas > 0);
});

test('T-SHAPE-03 : de la prose ne ressemble à aucun JSON', () => {
  const f = describeGenerationShape(FORMES.prose);
  assert.equal(f.shape_json_parseable, false);
  assert.equal(f.shape_starts_with_json_container, false);
  assert.equal(f.shape_first_char_class, 'letter');
  assert.equal(f.shape_curly_open + f.shape_curly_close, 0, 'aucune accolade');
  assert.equal(f.shape_quotes, 0, 'aucun guillemet');
  assert.ok(f.shape_letters > f.shape_punctuation, 'dominée par des lettres');
  assert.ok(f.shape_spaces > 5, 'des mots séparés');
});

test('T-SHAPE-04 : ponctuation seule, et Unicode, sont reconnus pour ce qu’ils sont', () => {
  const p = describeGenerationShape(FORMES.ponctuation);
  assert.equal(p.shape_letters, 0);
  assert.equal(p.shape_spaces, 0);
  assert.equal(p.shape_first_char_class, 'punctuation');
  assert.ok(p.shape_punctuation > 0);

  const u = describeGenerationShape(FORMES.unicode);
  assert.ok(u.shape_non_ascii > 0, 'le hors-ASCII est compté');
  assert.equal(u.shape_first_char_class, 'letter');
  /* Et les caractères hors ASCII comptent pour UN, pas pour leurs octets. */
  assert.equal(u.shape_length, [...FORMES.unicode].length);
});

test('T-SHAPE-05 : une valeur absente ne produit aucune mesure inventée', () => {
  for (const vide of [undefined, null, '', 42, {}]) {
    const f = describeGenerationShape(vide);
    assert.equal(f.shape_measured, false);
    for (const [cle, valeur] of Object.entries(f)) {
      if (cle === 'shape_measured') continue;
      assert.equal(valeur, null, `${cle} reste null`);
    }
  }
});

/* ==========================================================================
 * CE QUI NE DOIT JAMAIS SORTIR
 * ======================================================================= */

test('T-SHAPE-06 : aucun contenu, aucun secret, aucune sous-chaîne identifiable', () => {
  for (const [nom, valeur] of Object.entries(FORMES)) {
    const serialise = JSON.stringify(describeGenerationShape(valeur));
    /* Le contenu entier. */
    assert.equal(serialise.includes(valeur), false, `${nom} : le contenu ne sort pas`);
    /* Tout préfixe et tout suffixe de 4 caractères ou plus. */
    for (let n = 4; n <= Math.min(20, valeur.length); n += 1) {
      assert.equal(serialise.includes(valeur.slice(0, n)), false, `${nom} : préfixe de ${n} interdit`);
      assert.equal(serialise.includes(valeur.slice(-n)), false, `${nom} : suffixe de ${n} interdit`);
    }
    /* Tout mot de 4 caractères ou plus. */
    for (const mot of valeur.split(/[\s.,:;"{}[\]]+/).filter((m) => m.length >= 4)) {
      assert.equal(serialise.includes(mot), false, `${nom} : le mot « ${mot.slice(0, 6)}… » ne doit pas sortir`);
    }
  }
  /* Nommément, le secret et le texte privé. */
  const avecSecret = JSON.stringify(describeGenerationShape(FORMES.avec_secret));
  for (const fuite of ['gsk_', 'Bearer', 'ABCDEFGH', 'zzzz']) {
    assert.equal(avecSecret.includes(fuite), false, `« ${fuite} » ne doit pas sortir`);
  }
  const avecTexte = JSON.stringify(describeGenerationShape(FORMES.avec_texte_utilisateur));
  for (const fuite of ['PHRASE', 'PRIVEE', 'PERSONNE', 'ressortir']) {
    assert.equal(avecTexte.includes(fuite), false, `« ${fuite} » ne doit pas sortir`);
  }
});

test('T-SHAPE-07 : deux contenus DIFFÉRENTS de même forme rendent le MÊME profil', () => {
  /* LA PROPRIÉTÉ RECHERCHÉE, ET C'EST ELLE QUI PROUVE QU'AUCUN CONTENU N'EST IDENTIFIABLE. Un
     relevé capable de séparer deux chaînes de même forme serait un relevé qui les décrit. */
  const paires = [
    ['{"a":"bb"}', '{"z":"yy"}'],
    ['abcd efgh ijkl', 'wxyz mnop qrst'],
    ['MOT_SECRET_AAAA', 'AUTRE_CHOSE_BBB'.slice(0, 15)]
  ];
  for (const [gauche, droite] of paires) {
    assert.notEqual(gauche, droite, 'les deux contenus diffèrent');
    assert.deepEqual(describeGenerationShape(gauche), describeGenerationShape(droite),
      'et pourtant le profil est identique');
  }
});

test('T-SHAPE-08 : le profil ne porte que des nombres, des booléens et des CLASSES fermées', () => {
  const f = describeGenerationShape(FORMES.json_fragmentaire);
  for (const [cle, valeur] of Object.entries(f)) {
    if (cle.endsWith('_char_class')) {
      assert.ok(GENERATION_SHAPE_CHAR_CLASSES.includes(valeur), `${cle} appartient à l’énumération fermée`);
      continue;
    }
    assert.ok(valeur === null || typeof valeur === 'number' || typeof valeur === 'boolean',
      `${cle} est un nombre, un booléen ou null — jamais une chaîne libre`);
  }
  /* La position d'erreur est un ENTIER, extrait sans jamais conserver le message. */
  assert.equal(typeof f.shape_parse_error_position, 'number');
  const corps = source.slice(source.indexOf('export function describeGenerationShape'),
    source.indexOf('export function describeFailedGeneration'));
  assert.match(corps, /\/at position \(\\d\+\)\/\.exec/, 'seuls des chiffres sont capturés');
  for (const interdit of ['erreur.message)', 'slice(0,', 'substring', 'btoa', 'createHash', 'toString("base64")']) {
    assert.equal(corps.includes(interdit), false, `« ${interdit} » n’a pas sa place ici`);
  }
});

/* ==========================================================================
 * LE POINT DE CAPTURE, ET CE QUI N'A PAS CHANGÉ
 * ======================================================================= */

test('T-SHAPE-09 : le profil remonte par l’observabilité provider déjà créée', async () => {
  const secret = 'CONTENU_DU_MODELE_QUI_NE_SORT_PAS_DU_WORKER_JAMAIS';
  const vrai = globalThis.fetch;
  const vraiErr = console.error;
  const journal = [];
  globalThis.fetch = async () => Response.json({ error: {
    code: 'json_validate_failed', message: 'Failed to generate JSON.', failed_generation: secret
  } }, { status: 400 });
  console.error = (...a) => journal.push(a[0]);
  let erreur = null;
  try {
    await FAST_INTERACTION_ADAPTERS.groq(
      createTurnSnapshot({ turn_id: 1, original_request: 'Une demande.', clarification_history: [],
        current_answer: null, canonical_version: 0, material_present: false }),
      { GROQ_API_KEY: 'gsk_TEST' });
  } catch (e) { erreur = e; } finally { globalThis.fetch = vrai; console.error = vraiErr; }

  /* Le profil est dans le motif fournisseur — celui que `fast_unavailable` rend désormais. */
  assert.equal(erreur.provider_error.shape_measured, true);
  assert.equal(erreur.provider_error.shape_length, secret.length);
  assert.equal(erreur.provider_error.shape_json_parseable, false);
  /* Et dans le relevé d'adaptateur existant, sans nouveau canal. */
  const releve = journal.find((x) => x && x.event === 'groq_api_error');
  assert.equal(releve.shape_measured, true);
  assert.equal(releve.failed_generation_length, secret.length, 'l’ancien descripteur est intact');
  /* LE CONTENU NE SORT NULLE PART. */
  for (const cible of [erreur.provider_error, releve, erreur.attempts]) {
    assert.equal(JSON.stringify(cible ?? null).includes('CONTENU_DU_MODELE'), false);
    assert.equal(JSON.stringify(cible ?? null).includes('NE_SORT_PAS'), false);
  }
  /* Et rien de la décision n'a bougé. */
  assert.equal(erreur.failure_class, FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(erreur.status, 400);
});

test('T-SHAPE-10 : durée de vie du contenu brut inchangée, et aucune décision ne lit la forme', () => {
  /* Le contenu est mesuré LÀ OÙ IL EXISTE DÉJÀ, puis jeté comme avant : aucune variable ne le
     retient, aucune persistance n'est ajoutée. */
  const capture = source.slice(source.indexOf('if (!response.ok) {'),
    source.indexOf('let envelope;'));
  assert.match(capture, /forme = describeGenerationShape\(error\?\.failed_generation\);/);
  for (const interdit of ['globalThis.', 'caches.', 'localStorage', 'KV.', '.put(']) {
    assert.equal(capture.includes(interdit), false, `aucune persistance (« ${interdit} »)`);
  }
  /* AUCUNE BRANCHE ne lit le profil : il n'apparaît dans aucune condition. */
  assert.equal(/if\s*\([^)]*shape_/.test(source), false, 'aucune décision sur la forme');

  /* Les politiques restent intactes. */
  assert.equal(classifyProviderHttpStatus(400), FAILURE_CLASSES.REQUEST_REJECTED);
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  /* Et le descripteur historique n'a pas été touché. */
  const ancien = describeFailedGeneration('{"type":"x"}');
  assert.equal(ancien.failed_generation_json_parseable, true);
  assert.equal('shape_length' in ancien, false, 'les deux descripteurs restent distincts');
});
