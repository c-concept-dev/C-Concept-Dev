// Plafond de 24 diapositives — sur les DEUX chemins de densité, sans aucun appel au modèle.
//
// Pourquoi ce plafond : une présentation de 35 minutes demandées produit 24 diapositives et
// ~11 900 jetons — elle aboutit. À 45 minutes, la densité en réclame 30 et la génération est
// coupée à max_tokens (51 414 caractères, ~15 500 jetons). Or être coupé, sur une Présentation,
// signifie REPLI TOTAL sur l'ancien moteur : la continuation ne sait pas traiter une racine
// `cards`. Au-delà de 24, on ne produit donc pas une présentation plus riche — on n'en produit
// AUCUNE.
//
// Le prompt est ÉVALUÉ pour de bon (buildPromptSuffix extrait de la source et exécuté), jamais
// lu au grep : c'est le texte réellement envoyé qui est vérifié.
//
//   node tests/verify-plafond-diapositives.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'studio-clinique-core.js'), 'utf8');
// buildPromptSuffix s'appuie désormais sur adocPresentationSlideBudget — la MÊME fonction que
// l'interface utilise pour annoncer un plafonnement. On extrait donc les deux : évaluer le prompt
// sans elle ne prouverait rien du texte réellement envoyé.
const debutBudget = source.indexOf('  function adocPresentationSlideBudget(plan) {');
assert.ok(debutBudget > 0, 'adocPresentationSlideBudget introuvable');
const finBudget = source.indexOf('\n  }\n', debutBudget) + '\n  }'.length;
// eslint-disable-next-line no-eval
eval(source.slice(debutBudget, finBudget));

const debut = source.indexOf("      buildPromptSuffix: function(passagesListing, plan) {");
assert.ok(debut > 0, 'buildPromptSuffix du profil presentation introuvable');
const fin = source.indexOf("\n      },", debut) + "\n      }".length;
// eslint-disable-next-line no-eval
const profil = eval('({ ' + source.slice(debut, fin).trim().replace(/,$/, '') + ' })');
const prompt = (plan) => profil.buildPromptSuffix('(passages)', plan);

const MAX = 20;
let n = 0;
const cas = (titre, plan, verifs) => {
  const t = prompt(plan);
  verifs(t);
  console.log('PASS ' + (++n) + '  ' + titre);
};

// ── Calcul automatique ────────────────────────────────────────────────────────────────────────
cas('20 minutes : 13 diapositives, aucun plafond annoncé', { duree_minutes: 20 }, t => {
  assert.match(t, /environ 13 diapositives/);
  assert.ok(!/maximum tenable/.test(t), 'aucune mention de plafond quand il ne mord pas');
});

cas('25 minutes : 17 diapositives, toujours sous le plafond', { duree_minutes: 25 }, t => {
  assert.match(t, /environ 17 diapositives/);
  assert.ok(!/maximum tenable/.test(t));
});

cas('35 minutes : ramené de 23 à 20', { duree_minutes: 35 }, t => {
  assert.match(t, /environ 20 diapositives/);
  assert.match(t, /maximum tenable/);
});

cas('45 minutes : ramené de 30 à 20, avec la consigne de couvrir le sujet EN ENTIER', { duree_minutes: 45 }, t => {
  assert.match(t, /environ 20 diapositives/);
  assert.ok(!/environ 30 diapositives/.test(t), 'la densité brute ne doit jamais être demandée');
  assert.match(t, /maximum tenable en une seule production/);
  assert.match(t, /couvre le sujet EN ENTIER/,
    'le modèle doit couvrir le sujet dans les 24, jamais le survoler puis s\'arrêter net');
});

cas('3 heures : 120 demandées par la densité, 20 produites', { duree_minutes: 180 }, t => {
  assert.match(t, /environ 20 diapositives/);
  assert.ok(!/environ 120 diapositives/.test(t));
  assert.match(t, /maximum tenable/);
});

// ── Nombre explicite ──────────────────────────────────────────────────────────────────────────
cas('slideCount 10 : respecté tel quel', { presentation_options: { slideCount: 10 } }, t => {
  assert.match(t, /demandé explicitement par l'utilisatrice : 10/);
  assert.ok(!/Nombre ramené/.test(t));
});

cas('slideCount 40 : ramené à 20, et le ramenage est ANNONCÉ', { presentation_options: { slideCount: 40 } }, t => {
  assert.match(t, /demandé explicitement par l'utilisatrice : 20/);
  assert.match(t, /Nombre ramené de 40 à 20/,
    'le modèle doit savoir que le nombre a été ramené, sinon il produit un plan pour 40 et le tronque');
});

cas('slideCount 1 : relevé à 3, plancher existant', { presentation_options: { slideCount: 1 } }, t => {
  assert.match(t, /demandé explicitement par l'utilisatrice : 3/);
});

cas('slideCount l\'emporte sur la durée, plafonné aussi', { duree_minutes: 180, presentation_options: { slideCount: 50 } }, t => {
  assert.match(t, /demandé explicitement par l'utilisatrice : 20/);
  assert.ok(!/Durée cible/.test(t), 'un nombre explicite remplace le calcul, jamais les deux mêlés');
});

// ── Aucune durée : comportement d'origine ─────────────────────────────────────────────────────
cas('aucune durée : 5 à 8 diapositives, texte inchangé', {}, t => {
  assert.match(t, /Durée non précisée — vise 5 à 8 diapositives/);
  assert.ok(!/maximum tenable/.test(t));
});

// ── Borne de densité PAR DIAPOSITIVE — toujours présente ──────────────────────────────────────
// Sans elle le plafond ne protège rien : mesuré, le modèle compense le nombre par le poids
// (~2 000 caractères par diapositive à 45 minutes plafonnées, contre ~1 640 sans plafond).
[{}, { duree_minutes: 20 }, { duree_minutes: 180 }, { presentation_options: { slideCount: 40 } }].forEach((plan, i) => {
  const t = prompt(plan);
  assert.match(t, /AU PLUS 4 blocs/, 'borne de densité absente du cas ' + (i + 1));
  assert.match(t, /jamais un pavé de texte/);
  assert.match(t, /renvoyer le détail vers une page d'approfondissement/,
    'le modèle doit avoir une ISSUE quand le contenu déborde, pas seulement une interdiction');
});
console.log('PASS ' + (++n) + '  borne de densité par diapositive : présente dans les quatre cas.');

console.log('\nPASS verify-plafond-diapositives — ' + n + '/' + n + '.');
