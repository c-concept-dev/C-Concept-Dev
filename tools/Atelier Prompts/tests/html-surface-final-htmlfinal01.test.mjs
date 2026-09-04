/* HTML-FINAL-01 — LA SURFACE, REGARDÉE COMME ON REGARDE UN PRODUIT FINI.
 * ============================================================================
 *
 * Après FC01b FINAL, la chaîne fonctionnelle est close. Reste ce que la personne
 * voit réellement : une page, trois modes, des contrôles, des états. Ce lot ne
 * touche à aucune décision — il vérifie que la surface ne ment pas sur ce que la
 * logique fait, et qu'elle reste utilisable là où elle est utilisée.
 *
 * TROIS DÉFAUTS ONT ÉTÉ TROUVÉS ET CORRIGÉS ICI, tous de présentation :
 *   1. Un attribut aria-live écrit deux fois sur la zone de résultat Rapide.
 *   2. Le champ de fichiers, masqué visuellement mais toujours focalisable,
 *      n'avait aucun nom accessible ; et les trois cartes de mode sautaient de
 *      h1 à h3.
 *   3. Le plus lourd : la coque d'accueil v11.5 portait huit surfaces à valeur
 *      claire écrite en dur. En thème sombre, le texte passait au blanc cassé
 *      pendant que le panneau restait blanc — titre à 1,15:1, « Votre demande »
 *      et « Mode » illisibles, et le lien d'évitement blanc sur blanc.
 *
 * CE QUE CE FICHIER NE PROUVE PAS. La mesure de mise en page — débordement
 * horizontal, contraste rendu, absence d'erreur console — a été prise dans un
 * navigateur réel (Chrome headless, sept largeurs, deux thèmes, douze bascules
 * de mode). node --test ne rend rien : ce fichier vérifie donc les RÈGLES qui
 * produisent ce résultat, pas le rendu lui-même. La preuve visuelle est REAL,
 * elle est hors de ce fichier, et ce fichier ne prétend pas la remplacer.
 *
 * Et il ne dit rien de la latence réelle : PERF-REAL-01 reste ouverte.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_CONTRACTS, contractFor, executionTargetFor } from '../core/adn/mode-contracts.js';
import { loadPilot, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRE = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');

/** Le balisage seul : scripts et styles neutralisés, positions préservées. */
const MARQUAGE = (() => {
  let out = '', i = 0;
  for (const m of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g)) {
    out += html.slice(i, m.index) + ' '.repeat(m[0].length); i = m.index + m[0].length;
  }
  return out + html.slice(i);
})();
const CSS = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const JS = (() => {
  const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i);
  return (html.slice(0, i) + html.slice(j)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
})();
const TEXTE_VISIBLE = MARQUAGE.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const tranche = (d, f) => { const a = html.indexOf(d); assert.notEqual(a, -1, `ancre absente : ${d}`); return html.slice(a, html.indexOf(f, a + d.length)); };
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ELEMENTS_VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// =================================================================================================
// §74 — STRUCTURE
// =================================================================================================

test('T-HTMLFINAL01-01 : aucun identifiant DOM en double', () => {
  const vus = new Map();
  for (const m of MARQUAGE.matchAll(/\sid="([^"]+)"/g)) vus.set(m[1], (vus.get(m[1]) || 0) + 1);
  assert.deepEqual([...vus].filter(([, n]) => n > 1).map(([id]) => id), [], 'DUPLICATE_DOM_ID_COUNT = 0');
  /* Et aucun identifiant n'est fabriqué deux fois par le script non plus. */
  const poses = [...JS.matchAll(/\.id\s*=\s*'([a-z0-9-]{4,})'/g)].map((m) => m[1]);
  assert.deepEqual(poses.filter((id) => MARQUAGE.includes(`id="${id}"`)), [],
    'aucun identifiant créé au script ne double un identifiant du balisage.');
});

test('T-HTMLFINAL01-02 : aucune référence DOM active sans cible', () => {
  const nommes = new Set([...JS.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]));
  for (const m of JS.matchAll(/getElementById\('([a-zA-Z0-9_-]+)'\)/g)) nommes.add(m[1]);
  for (const m of JS.matchAll(/aq\('#([a-zA-Z0-9_-]+)'\)/g)) nommes.add(m[1]);
  /* Une cible peut être écrite dans le balisage, produite dans une chaîne de
     balisage, ou posée par affectation sur un élément créé au vol. */
  const cible = (id) => html.includes(`id="${id}"`) || new RegExp(`\\.id\\s*=\\s*'${id}'`).test(html);
  const sansCible = [...nommes].filter((id) => !cible(id));
  /* La seule qui reste est une garde défensive caractérisée : elle RETIRE une balise
     de police distante si une version future en réintroduisait une. Sa cible absente
     est précisément ce qu'elle garantit. */
  assert.deepEqual(sansCible, ['polices-distantes'], 'ACTIVE_DEAD_DOM_REFERENCE_COUNT = 0 hors garde');
  assert.match(html, /const l = document\.getElementById\('polices-distantes'\);\s*\n\s*if\(actif\)\{\s*\n\s*if\(l\) l\.remove\(\);/);
});

test('T-HTMLFINAL01-03 : aucun écouteur d’événement sans cible', () => {
  const cibles = new Set();
  for (const m of JS.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)(?:\?)?\.addEventListener/g)) cibles.add(m[1]);
  for (const m of JS.matchAll(/aq\('#([a-zA-Z0-9_-]+)'\)(?:\?)?\.addEventListener/g)) cibles.add(m[1]);
  assert.deepEqual([...cibles].filter((id) => !MARQUAGE.includes(`id="${id}"`)), [],
    'DEAD_EVENT_LISTENER_COUNT = 0');
  /* Et chaque bouton du balisage a bien un chemin d'activation : identifiant lu par le
     script, classe déléguée, ou attribut de données consommé. */
  const orphelins = [];
  for (const m of MARQUAGE.matchAll(/<button\b([^>]*)>/g)) {
    const attrs = m[1];
    const id = /\sid="([^"]+)"/.exec(attrs);
    const classes = (/\sclass="([^"]+)"/.exec(attrs) || [, ''])[1].split(/\s+/).filter(Boolean);
    const donnees = [...attrs.matchAll(/\sdata-([a-zA-Z-]+)=/g)].map((d) => d[1]);
    const joignable = (id && new RegExp(`\\b${id[1]}\\b`).test(JS))
      || classes.some((c) => new RegExp(`['"\`.\\s]${c}['"\`\\s,\\[:]`).test(JS))
      || donnees.some((d) => JS.includes(`data-${d}`) || JS.includes(`dataset.${d.replace(/-/g, '')}`));
    if (!joignable) orphelins.push((id && id[1]) || classes.join('.'));
  }
  assert.deepEqual(orphelins, [], 'ACTIVE_DEAD_BUTTON_COUNT = 0');
});

test('T-HTMLFINAL01-04 : aucun sélecteur CSS orphelin injustifié', () => {
  const selecteurs = new Set();
  for (const m of CSS.matchAll(/(^|[,\s>+~])#([a-zA-Z][a-zA-Z0-9_-]*)\s*(?=[,{:.\[\s>+~])/g)) {
    /* Un « # » en CSS désigne aussi une couleur : les suites purement hexadécimales
       sont écartées — aucun identifiant du produit n'a cette forme. */
    if (!/^[0-9a-fA-F]{3,8}$/.test(m[2])) selecteurs.add(m[2]);
  }
  assert.deepEqual([...selecteurs].filter((id) => !MARQUAGE.includes(`id="${id}"`) && !JS.includes(`'${id}'`)), [],
    'UNJUSTIFIED_ORPHAN_CSS_SELECTOR_COUNT = 0');
});

test('T-HTMLFINAL01-05 : structure HTML valide — balises équilibrées, aucun attribut répété', () => {
  const repetes = [];
  for (const m of MARQUAGE.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>"']+(?:=(?:"[^"]*"|'[^']*'|[^\s<>]+))?)*)\s*\/?>/g)) {
    const vus = new Map();
    for (const a of m[2].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g)) {
      const nom = a[1].toLowerCase(); vus.set(nom, (vus.get(nom) || 0) + 1);
    }
    for (const [nom, n] of vus) if (n > 1) repetes.push(`<${m[1]} ${nom}×${n}>`);
  }
  assert.deepEqual(repetes, [], 'aucun attribut n’est écrit deux fois sur le même élément.');
  const pile = []; const erreurs = [];
  for (const m of MARQUAGE.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^<>]*?)(\/?)>/g)) {
    const [, fermant, brut, , auto] = m; const nom = brut.toLowerCase();
    if (nom === '!doctype') continue;
    if (fermant) {
      if (pile.at(-1) === nom) pile.pop();
      else if (pile.includes(nom)) { const i = pile.lastIndexOf(nom); erreurs.push(...pile.slice(i + 1)); pile.length = i; }
      else erreurs.push(`</${nom}> sans ouverture`);
    } else if (!ELEMENTS_VIDES.has(nom) && auto !== '/') pile.push(nom);
  }
  assert.deepEqual([...erreurs, ...pile], [], 'INVALID_HTML_STRUCTURE_COUNT = 0');
});

test('T-HTMLFINAL01-06 : la page se charge sans erreur — le frontend s’exécute pour de vrai', () => {
  /* Le harnais exécute le code frontend de production dans un DOM simulé. S'il jetait
     à l'évaluation, ce test échouerait ici, avant toute assertion. */
  const h = loadPilot({ mode: 'rapide' });
  assert.equal(typeof h.pilot.oprieRunTurn, 'function');
  assert.equal(typeof h.pilot.oprieState, 'object');
  /* Et chaque bloc de script du document est syntaxiquement analysable. */
  let blocs = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].trim()) continue;
    blocs += 1;
    assert.doesNotThrow(() => new Function(m[1]), `bloc de script ${blocs} analysable`);
  }
  assert.ok(blocs >= 1, 'CONSOLE_RUNTIME_ERROR_COUNT_ON_LOAD = 0');
});

// =================================================================================================
// §75 — LES SURFACES DES TROIS MODES
// =================================================================================================

test('T-HTMLFINAL01-07 : Rapide rend un prompt sur place, et rien d’autre', () => {
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false);
  const rapide = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
  assert.match(rapide, /const out=\$\('#ui-rapid-output'\),box=\$\('#ui-rapid-result'\)/);
  assert.match(rapide, /if\(out\)out\.textContent=r\.prompt/, 'le prompt s’affiche là où l’on est…');
  assert.doesNotMatch(rapide, /ouvrirVue\(|location\.|window\.open/, '…sans jamais déplacer la personne.');
  assert.doesNotMatch(rapide, /appelFournisseur|archControleSortie/, 'et sans produire de livrable.');
  /* La zone de résultat annonce son arrivée une seule fois, proprement. */
  assert.match(MARQUAGE, /<section class="ui-inline-result" id="ui-rapid-result" aria-live="polite" hidden>/);
  const copie = MARQUAGE.slice(MARQUAGE.indexOf('id="ui-rapid-result"'));
  assert.ok(copie.includes('id="ui-rapid-copy"'), 'et le prompt reste copiable.');
});

test('T-HTMLFINAL01-08 : Architecte dialogue puis rend un prompt final, pas un livrable', () => {
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true, 'le mode a une voie Pro…');
  const api = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
  assert.match(api, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\);show\('#v11-ready'/,
    '…mais sa voie principale s’arrête au prompt final.');
  assert.doesNotMatch(api, /archControleSortie|archConstruireExecuter/);
  /* Une seule question à la fois : la zone de dialogue porte un seul champ de réponse. */
  const dialogue = MARQUAGE.slice(MARQUAGE.indexOf('id="v11-dialogue"'), MARQUAGE.indexOf('id="v11-ready"'));
  assert.equal([...dialogue.matchAll(/id="v11-answer"/g)].length, 1);
  assert.equal([...dialogue.matchAll(/id="v11-question"/g)].length, 1);
});

test('T-HTMLFINAL01-09 : Architecte Pro est une surface distincte du prompt principal', () => {
  const pro = sansProse(tranche('async function archConstruireExecuter()', 'const ARCH_SAUVEGARDE_VERSION='));
  assert.match(pro, /await appelFournisseur\(/);
  assert.match(pro, /archControleSortie\(/);
  assert.match(pro, /aq\('#arch-execution-resultat'\)/, 'le livrable a sa propre zone…');
  assert.ok(MARQUAGE.includes('id="arch-execution-resultat"'));
  assert.notEqual(MARQUAGE.indexOf('id="arch-execution-resultat"'), MARQUAGE.indexOf('id="v11-final"'),
    '…qui n’est pas celle du prompt final.');
  /* Et l'exécution Pro passe par la garde d'unicité, jamais directement. */
  assert.match(MARQUAGE, /id="arch-construire-executer"/);
  assert.match(JS, /aq\('#arch-construire-executer'\)\.addEventListener\('click',archExecutionUneSeuleFois\)/);
});

test('T-HTMLFINAL01-10 : Atelier compose à la main, et le dit sans emprunter le vocabulaire gouverné', () => {
  assert.equal(contractFor('atelier').modeClass, 'manual_composition');
  assert.equal(executionTargetFor('atelier'), null);
  const carte = MARQUAGE.slice(MARQUAGE.indexOf('data-mode="atelier"'), MARQUAGE.indexOf('</button>', MARQUAGE.indexOf('data-mode="atelier"')));
  assert.match(carte, /<h2>Fabriquer avec inventivité<\/h2>/);
  for (const mot of ['READY', 'gouverné', 'exécution gouvernée', 'readiness']) {
    assert.equal(carte.includes(mot), false, `la carte Atelier n’emprunte pas « ${mot} »`);
  }
  const atelier = sansProse(tranche('function v11StartAtelier()', 'window.askDecisionProvider'));
  for (const interdit of ['oprieRunTurn', 'appelFournisseur', 'archControleSortie']) {
    assert.equal(atelier.includes(interdit), false);
  }
});

test('T-HTMLFINAL01-11 : une bascule de mode ne laisse jamais deux surfaces visibles', () => {
  const setMode = sansProse(tranche('function setMode(mode){', 'function currentMode()'));
  /* Une seule carte active, une seule pression annoncée, un seul mode inscrit sur le corps. */
  assert.match(setMode, /\$\$\('\.ui-mode-card'\)\.forEach\(card=>\{const active=card\.dataset\.mode===mode;card\.classList\.toggle\('is-active',active\);card\.setAttribute\('aria-pressed',String\(active\)\);\}\);/);
  assert.match(setMode, /if\(select&&select\.value!==mode\)select\.value=mode/);
  assert.equal([...JS.matchAll(/document\.body\.dataset\.v11Mode\s*=(?!=)/g)].length, 1);
  /* Et toute surface d'un mode précédent est refermée avant d'ouvrir le suivant. */
  const reset = sansProse(tranche('function resetModePresentation(mode){', 'function setMode(mode){'));
  for (const zone of ['#ui-rapid-result', '#ui-rapid-gate', '#v11-api-progress', '#v11-exchange', '#v11-dialogue', '#v11-ready']) {
    assert.ok(reset.includes(zone), `${zone} est refermé à la bascule.`);
  }
  assert.ok(setMode.indexOf('resetModePresentation(mode)') > setMode.indexOf('ui-mode-card'));
});

test('T-HTMLFINAL01-12 : la demande et les documents survivent à toutes les bascules', () => {
  const reset = tranche('function resetModePresentation(mode){', 'function setMode(mode){');
  for (const preserve of ['#v11-demande', '#v11-filelist', 'state.docs']) {
    assert.equal(sansProse(reset).includes(preserve), false, `${preserve} n’est pas touché.`);
  }
  assert.match(reset, /On conserve volontairement #v11-demande, les documents et state\.docs\./);
  /* Rien d'autre dans la bascule ne vide ces deux champs non plus. */
  const setMode = sansProse(tranche('function setMode(mode){', 'function currentMode()'));
  assert.equal(/v11-demande|filelist|state\.docs/.test(setMode), false);
});

// =================================================================================================
// §76 — CE QUE L'INTERFACE PROMET AU DOIGT ET À L'ŒIL
// =================================================================================================

test('T-HTMLFINAL01-13 : chaque contrôle d’aide dit réellement quelque chose', () => {
  const table = tranche('const AIDES = {', '\n};');
  const entrees = [...table.matchAll(/^\s*([a-zA-Z0-9_'"-]+)\s*:\s*(['"])((?:(?!\2)[\s\S])*)\2/gm)];
  assert.ok(entrees.length >= 30, `table d’aide fournie (${entrees.length} entrées)`);
  const creuses = entrees.filter((m) => m[3].trim().length < 20).map((m) => m[1]);
  assert.deepEqual(creuses, [], 'COSMETIC_HELP_CONTROL_COUNT = 0');
  /* Un contrôle d'aide ne se fabrique qu'AUTOUR d'un texte : il le porte en donnée,
     s'annonce au lecteur d'écran, et garde un repli natif si le script est empêché. */
  const fabrique = sansProse(tranche('function boutonAide(texte){', '\n}'));
  assert.match(fabrique, /b\.setAttribute\('aria-label','Aide'\)/);
  assert.match(fabrique, /b\.setAttribute\('aria-expanded','false'\)/);
  assert.match(fabrique, /b\.dataset\.aide = texte/);
  assert.match(fabrique, /b\.title = texte/, 'repli natif au survol si le script est empêché.');
  assert.equal([...MARQUAGE.matchAll(/\stitle=""/g)].length, 0, 'aucune infobulle vide dans le balisage.');
});

test('T-HTMLFINAL01-14 : les actions principales répondent avant le fournisseur', () => {
  /* Le voyant d'attente est posé à l'entrée du tour, pas à sa sortie. */
  const runTurn = sansProse(tranche('async function oprieRunTurn(', 'async function oprieRequestTurn()'));
  assert.ok(runTurn.indexOf('oprieSetBusy(true)') < runTurn.indexOf('await'), 'la main est prise avant l’attente.');
  assert.match(runTurn, /finally\{if\(seq===oprieState\.seq\)\{oprieState\.running=false;oprieSetBusy\(false\)/);
  /* Et chaque action principale est désactivable et transitionnée. */
  for (const id of ['ui-main-action', 'v11-answer-continue', 'arch-construire', 'arch-construire-executer']) {
    assert.ok(MARQUAGE.includes(`id="${id}"`), `${id} existe`);
    assert.match(MARQUAGE.slice(MARQUAGE.indexOf(`id="${id}"`) - 200, MARQUAGE.indexOf(`id="${id}"`) + 60),
      /<button\b/, `${id} est un bouton`);
  }
  assert.match(CSS, /#v11-shell button:disabled[^{]*\{opacity:\.55;cursor:not-allowed\}/);
  assert.match(CSS, /#v11-shell \.ui-cta\{[^}]*transition:/);
});

test('T-HTMLFINAL01-15 : aucun indicateur d’attente ne survit à une bascule', () => {
  const reset = sansProse(tranche('function resetModePresentation(mode){', 'function setMode(mode){'));
  assert.match(reset, /\['#v11-api-progress','#v11-exchange','#v11-dialogue','#v11-ready'\]\.forEach\(sel=>\{const el=\$\(sel\);if\(el\)el\.hidden=true;\}\)/);
  assert.match(reset, /const gate=\$\('#ui-rapid-gate'\); if\(gate\)gate\.hidden=true;/);
  /* Et la bascule vers Atelier périme le tour en vol : rien ne continue à tourner. */
  assert.match(JS, /if\(!v11ModeUsesGovernedPipeline\(mode\)\)v11AbandonGovernedTurn\(\)/);
  const abandon = sansProse(tranche('function v11AbandonGovernedTurn()', 'function v11RequireDemand'));
  assert.match(abandon, /oprieState\.running=false;oprieSetBusy\(false\)/);
});

test('T-HTMLFINAL01-16 : aucune surface claire figée ne subsiste sous le thème sombre', () => {
  /* Les valeurs claires écrites en dur dans la coque sont recensées ; chacune doit
     avoir sa contrepartie sombre. C'est le défaut principal corrigé par ce lot. */
  const clairesFigees = [
    ['--ui-surface', 'html[data-theme="sombre"]{--ui-surface:rgba(41,37,33,.96)}'],
    ['body.v11-normal', 'html[data-theme="sombre"] body.v11-normal{background:radial-gradient'],
    ['.ui-top-button', 'html[data-theme="sombre"] #v11-shell .ui-top-button{background:rgba(41,37,33,.82)'],
    ['.ui-mode-card', 'html[data-theme="sombre"] #v11-shell .ui-mode-card{background:rgba(41,37,33,.80)'],
    ['.ui-mode-helper', 'html[data-theme="sombre"] #v11-shell .ui-mode-helper{background:linear-gradient(180deg,#25211e,#201d1a)'],
    ['.ui-inline-result-output', 'html[data-theme="sombre"] #v11-shell .ui-inline-result-output{background:#25211e}'],
    ['.ui-hero-caption', 'html[data-theme="sombre"] #v11-shell .ui-hero-caption{background:linear-gradient(180deg,rgba(41,37,33,.55)'],
    ['.ui-api-status', 'html[data-theme="sombre"] #v11-shell .ui-api-status{color:var(--ds-accent)}'],
    ['.ui-status', 'html[data-theme="sombre"] #v11-shell .ui-status{color:var(--ds-accent)}']
  ];
  for (const [sujet, regle] of clairesFigees) {
    assert.ok(CSS.includes(regle), `ACTIVE_OLD_VISUAL_CHARTER_RESIDUE : ${sujet} a sa valeur sombre.`);
  }
  /* Le lien d'évitement s'inverse contre la page dans les deux thèmes. */
  assert.match(CSS, /background:var\(--ds-text,#2d2a27\);color:var\(--ds-bg,#fff\)/);
  /* Et aucune police ancienne isolée : toutes les familles passent par un jeton. */
  const familles = new Set([...CSS.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1].trim()));
  assert.deepEqual([...familles].filter((f) => !/^var\(--|^inherit$/.test(f)), [],
    'aucune famille de police écrite en dur.');
});

test('T-HTMLFINAL01-17 : le vocabulaire des modes est celui du produit, et lui seul', () => {
  for (const mode of ['Rapide', 'Architecte', 'Atelier']) {
    assert.ok(new RegExp(`\\b${mode}\\b`).test(TEXTE_VISIBLE), `${mode} est nommé.`);
  }
  /* Aucun nom de mode retiré ne reparaît comme mode. « Avancé », « Expert » et
     « Débutant » subsistent — mais désignent l'ESPACE de travail, pas un mode : ils
     ne se lisent que sur le sélecteur d'espace et sur des réglages, jamais sur une
     carte de mode ni sur le sélecteur de mode. */
  const cartes = MARQUAGE.slice(MARQUAGE.indexOf('class="ui-mode-cards"'), MARQUAGE.indexOf('id="ui-rapid-result"'));
  const selecteur = MARQUAGE.slice(MARQUAGE.indexOf('id="ui-mode-select"'), MARQUAGE.indexOf('</select>', MARQUAGE.indexOf('id="ui-mode-select"')));
  for (const perime of ['Avancé', 'Expert', 'Débutant', 'Normal', 'Simple', 'Standard', 'Pro ', 'Prudent']) {
    assert.equal(cartes.includes(perime), false, `OBSOLETE_MODE_LABEL : ${perime} absent des cartes`);
    assert.equal(selecteur.includes(perime), false, `OBSOLETE_MODE_LABEL : ${perime} absent du sélecteur`);
  }
  assert.deepEqual([...selecteur.matchAll(/value="([a-z]+)"/g)].map((m) => m[1]),
    ['rapide', 'architecte', 'atelier'], 'le sélecteur n’offre que les trois modes du produit.');
});

// =================================================================================================
// §77 — ACCESSIBILITÉ, LE SOCLE
// =================================================================================================

test('T-HTMLFINAL01-18 : tout contrôle de saisie actif porte un nom', () => {
  /* Quatre mécanismes nomment un champ, et le troisième — l'étiquette qui ENVELOPPE
     le contrôle — ne se voit pas en regardant la seule balise ouvrante. */
  const etiquettes = [...MARQUAGE.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)]
    .map((m) => [m.index, m.index + m[0].length]);
  const enveloppe = (i) => etiquettes.some(([a, b]) => a < i && i < b);
  const anonymes = [];
  for (const m of MARQUAGE.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/\stype="hidden"/.test(attrs) || /\sdisabled\b/.test(attrs)) continue;
    const id = (/\sid="([^"]+)"/.exec(attrs) || [, null])[1];
    if (/\saria-label="/.test(attrs) || /\saria-labelledby="/.test(attrs) || /\stitle="/.test(attrs)) continue;
    if (id && MARQUAGE.includes(`for="${id}"`)) continue;
    if (enveloppe(m.index)) continue;
    anonymes.push(`${m[1]}#${id || '(sans id)'}`);
  }
  assert.deepEqual(anonymes, [], 'UNLABELED_ACTIVE_FORM_CONTROL_COUNT = 0');
  /* Le champ de fichiers est masqué visuellement mais reste focalisable : il a un nom. */
  assert.match(MARQUAGE, /<input class="v11-hidden-input" id="v11-files" type="file" multiple aria-label="Choisir des documents à joindre"/);
  assert.match(CSS, /\.v11-hidden-input\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)\}/);
});

test('T-HTMLFINAL01-19 : tout bouton sans texte porte un nom', () => {
  const muets = [];
  for (const m of MARQUAGE.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const contenu = m[2].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim();
    if (contenu) continue;
    if (/\saria-label="/.test(m[1]) || /\stitle="/.test(m[1])) continue;
    muets.push((/\sid="([^"]+)"/.exec(m[1]) || [, '(sans id)'])[1]);
  }
  assert.deepEqual(muets, [], 'ICON_BUTTON_LABEL_COVERAGE complète');
  /* La zone de dépôt est un bouton au clavier comme à la souris, et elle se nomme. */
  assert.match(MARQUAGE, /<div id="v11-dropzone" class="ui-dropzone" role="button" tabindex="0" aria-label="Ajouter des documents ou du contexte">/);
});

test('T-HTMLFINAL01-20 : le focus reste visible, et personne ne l’efface sans le rendre', () => {
  const effacements = [...CSS.matchAll(/([^{}]*)\{([^{}]*outline:\s*none[^{}]*)\}/g)];
  for (const [, sel, corps] of effacements) {
    const rendu = /box-shadow:|outline:\s*[^n]/.test(corps)
      || new RegExp(`${sel.trim().split(',')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*:focus-visible`).test(CSS)
      || /:focus-visible/.test(sel) || /#v11-main:focus|#tools-main:focus/.test(sel);
    assert.ok(rendu, `outline:none rendu ailleurs pour « ${sel.trim().slice(0, 60)} »`);
  }
  assert.match(CSS, /#v11-shell button:focus-visible[^{]*\{outline:none;box-shadow:var\(--ds-focus-ring\)/);
  assert.match(CSS, /#v11-shell \.ui-mode-card:focus-visible,[\s\S]{0,120}outline:3px solid var\(--ds-accent\)/);
  /* Aucun ordre de tabulation forcé : rien ne double la séquence naturelle. */
  assert.deepEqual([...MARQUAGE.matchAll(/tabindex="([1-9]\d*)"/g)].map((m) => m[1]), [],
    'aucun tabindex positif.');
});

test('T-HTMLFINAL01-21 : la hiérarchie des titres ne saute aucun niveau', () => {
  const accueil = MARQUAGE.slice(MARQUAGE.indexOf('id="v11-shell"'), MARQUAGE.indexOf('id="v11-ready"'));
  const niveaux = [...accueil.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  assert.equal(niveaux[0], 1, 'la page commence par un seul titre de premier rang.');
  assert.equal([...MARQUAGE.matchAll(/<h1\b/g)].length, 1, 'et il n’y en a qu’un.');
  const sauts = [];
  for (let i = 1; i < niveaux.length; i += 1) if (niveaux[i] > niveaux[i - 1] + 1) sauts.push(`h${niveaux[i - 1]}→h${niveaux[i]}`);
  assert.deepEqual(sauts, [], 'aucun saut de niveau sur la surface d’accueil.');
  /* Les trois cartes de mode sont des sections de premier rang sous le titre. */
  for (const titre of ['Aller droit au but', 'Comprendre et structurer', 'Fabriquer avec inventivité']) {
    assert.ok(MARQUAGE.includes(`<h2>${titre}</h2>`), `« ${titre} » est un h2`);
  }
  assert.match(CSS, /#v11-shell \.ui-mode-card h2\{grid-area:title;/, 'et le style suit le niveau.');
});

test('T-HTMLFINAL01-22 : les zones qui changent seules s’annoncent', () => {
  for (const [id, attendu] of [['ui-mode-helper', 'polite'], ['ui-rapid-gate', 'polite'],
                               ['ui-rapid-result', 'polite'], ['v11-api-progress', 'polite'],
                               ['arch-statut', 'polite'], ['arch-prep-statut', 'polite'],
                               ['toast', 'polite']]) {
    const balise = MARQUAGE.slice(MARQUAGE.lastIndexOf('<', MARQUAGE.indexOf(`id="${id}"`)),
      MARQUAGE.indexOf('>', MARQUAGE.indexOf(`id="${id}"`)) + 1);
    assert.match(balise, new RegExp(`aria-live="${attendu}"`), `#${id} s’annonce`);
    assert.equal([...balise.matchAll(/aria-live=/g)].length, 1, `#${id} ne l’annonce qu’une fois`);
  }
  /* Le panneau d'attente d'Architecte annonce aussi son arrivée : sans cela, une
     personne au lecteur d'écran n'apprenait jamais que la préparation avait commencé. */
  assert.match(MARQUAGE, /<div class="v11-stage" id="v11-api-progress" role="status" aria-live="polite" hidden>/);
  /* Le lien d'évitement précède tout le reste. */
  assert.ok(MARQUAGE.indexOf('class="skip-link"') < MARQUAGE.indexOf('id="v11-shell"'));
  assert.match(MARQUAGE, /<a class="skip-link" href="#v11-main">Aller au contenu principal<\/a>/);
});

// =================================================================================================
// §78 — CE QUI TIENT LA MISE EN PAGE
// Ces tests vérifient les RÈGLES ; la mesure du rendu a été prise au navigateur réel.
// =================================================================================================

const PALIERS = [
  ['T-HTMLFINAL01-23', 'bureau', 1440],
  ['T-HTMLFINAL01-24', 'tablette', 768],
  ['T-HTMLFINAL01-25', 'mobile large', 430],
  ['T-HTMLFINAL01-26', 'mobile', 390],
  ['T-HTMLFINAL01-27', 'mobile étroit', 375]
];
for (const [id, nom, largeur] of PALIERS) {
  test(`${id} : rien ne peut déborder horizontalement à ${largeur} px (${nom})`, () => {
    /* Aucune largeur fixe ne peut dépasser le plus étroit des paliers testés. */
    const fixes = [...CSS.matchAll(/(?<!max-|min-)width:\s*(\d{3,4})px/g)].map((m) => Number(m[1]));
    assert.deepEqual(fixes.filter((v) => v > 375), [], `aucune largeur fixe > 375 px (vue à ${largeur})`);
    /* Toute grille multi-colonnes se replie, et aucune colonne ne refuse de rétrécir. */
    assert.match(CSS, /#v11-shell \.ui-mode-cards\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(CSS, /#v11-shell \.ui-mode-cards\{grid-template-columns:1fr\}/);
    assert.match(CSS, /#v11-shell,\.scene,\.vue,\.panneau,\.ui-panel,\.ui-stage-card\{min-width:0\}/);
    /* Et le contenu intrinsèque — URL, JSON, mot long — casse plutôt que d'élargir. */
    assert.match(CSS, /#v11-shell p,#v11-shell span,\.vue p,\.vue td,\.vue \.aide,\.vue \.faille\{overflow-wrap:anywhere\}/);
    assert.match(CSS, /pre,\.sortie,#ui-rapid-output\{overflow-wrap:anywhere;word-break:break-word\}/);
    /* Le palier lui-même est couvert par une requête de média. */
    const seuils = [...CSS.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
    assert.ok(seuils.some((s) => s >= largeur) || largeur >= 1440,
      `un palier couvre ${largeur} px (seuils : ${[...new Set(seuils)].sort((a, b) => a - b)})`);
  });
}

test('T-HTMLFINAL01-28 : un contenu long ne casse pas la mise en page', () => {
  /* Les zones qui reçoivent du texte non maîtrisé sont bornées et défilables. */
  assert.match(CSS, /#v11-shell \.ui-inline-result-output\{margin:0;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word/);
  assert.match(CSS, /pre,\.sortie,#ui-rapid-output\{overflow-wrap:anywhere;word-break:break-word\}/);
  /* Les tableaux techniques défilent dans leur propre boîte, pas dans la page. */
  assert.match(html, /<div style="overflow-x:auto"><table>/, 'le tableau technique défile dans sa boîte.');
  assert.match(CSS, /#v11-shell,\.scene,\.vue,\.panneau,\.ui-panel,\.ui-stage-card\{min-width:0\}/);
  /* Et un nom de fichier long ne pousse pas sa ligne. */
  assert.match(CSS, /#v11-shell \.ui-filelist \.file-item\{display:inline-flex/);
});

// =================================================================================================
// §79 — LES FRONTIÈRES QUE LA SURFACE NE FRANCHIT PAS
// =================================================================================================

test('T-HTMLFINAL01-29 : l’interface n’écrit aucune autorité sémantique', () => {
  /* Les gestes d'interface — bascule, présentation, thème — ne touchent à aucun état
     de décision : ni tour, ni readiness, ni contrat, ni verdict de gate. */
  const surface = ['function setMode(mode){|function currentMode()',
                   'function resetModePresentation(mode){|function setMode(mode){',
                   'function ouvrirVue(nom){|/* ------',
                   'function appliquerTheme(t){|/* ------']
    .map((paire) => { const [a, b] = paire.split('|'); return sansProse(tranche(a, b)); }).join('\n');
  for (const champ of ['oprieState.canonicalContract', 'oprieState.lastTurn', 'oprieState.seq',
                       'readiness', 'promptQG', 'outputQG', 'decideNextOrchestrationAction',
                       'executionTargetFor', 'assessAnalysisReadiness', 'guardPromptContract']) {
    assert.equal(surface.includes(champ), false, `UI_SEMANTIC_AUTHORITY_WRITE_PATH : ${champ} = 0`);
  }
  /* Le routeur est le seul point où un geste d'interface rejoint la logique. */
  assert.match(JS, /function routeCurrentMode\(\)\{\s*const router=window\.__V11_ROUTER__;\s*if\(router&&typeof router\.start==='function'\)router\.start\(currentMode\(\)\);\s*\}/);
  assert.equal([...JS.matchAll(/window\.__V11_ROUTER__=Object\.freeze/g)].length, 1);
});

test('T-HTMLFINAL01-30 : l’interface n’ouvre aucune machine à états parallèle', () => {
  /* Un seul état de présentation, et il ne porte que de la présentation. */
  const reset = sansProse(tranche('function resetModePresentation(mode){', 'function setMode(mode){'));
  assert.match(reset, /document\.body\.dataset\.v11Mode=mode/);
  assert.equal([...JS.matchAll(/document\.body\.dataset\.v11Mode\s*=(?!=)/g)].length, 1);
  /* Aucun minuteur ne pilote un mode, et aucune boucle ne rejoue un tour toute seule. */
  const minuteurs = [...JS.matchAll(/setInterval\(([^;]{0,120})/g)].map((m) => m[1]);
  assert.equal(minuteurs.length, 2, 'deux minuteurs, connus : la dictée et la sauvegarde de brouillon.');
  for (const m of minuteurs) {
    for (const interdit of ['oprieRunTurn', 'setMode', 'routeCurrentMode', 'appelFournisseur']) {
      assert.equal(m.includes(interdit), false, `UI_PARALLEL_STATE_MACHINE : ${interdit} = 0`);
    }
  }
  /* Et l'état d'interface se lit dans le DOM, pas dans une copie parallèle. */
  assert.match(JS, /function currentMode\(\)\{return \(\$\('#ui-mode-select'\)&&\$\('#ui-mode-select'\)\.value\)\|\|'architecte'\}/);
});

test('T-HTMLFINAL01-31 : les contrats de mode de FC01b sont intacts', () => {
  assert.equal(MODE_CONTRACTS.rapide.modeClass, 'governed_execution');
  assert.equal(MODE_CONTRACTS.architecte.modeClass, 'governed_execution');
  assert.equal(MODE_CONTRACTS.atelier.modeClass, 'manual_composition');
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false);
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true);
  assert.equal(executionTargetFor('rapide'), 'rapide');
  assert.equal(executionTargetFor('architecte'), 'architecte');
  assert.equal(executionTargetFor('atelier'), null);
  /* Et le sélecteur d'interface offre exactement les modes que les contrats décrivent. */
  const selecteur = MARQUAGE.slice(MARQUAGE.indexOf('id="ui-mode-select"'), MARQUAGE.indexOf('</select>', MARQUAGE.indexOf('id="ui-mode-select"')));
  assert.deepEqual([...selecteur.matchAll(/value="([a-z]+)"/g)].map((m) => m[1]).sort(),
    Object.keys(MODE_CONTRACTS).sort());
});

test('T-HTMLFINAL01-32 : PERF-REAL-01 reste ouverte, et ce lot ne prétend rien sur la latence', () => {
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.equal([...JS.matchAll(/TTFI|time_to_first|latency_ms|p95_real/g)].length, 0,
    'REAL_PROVIDER_TTFI_PROVEN = NO');
});
