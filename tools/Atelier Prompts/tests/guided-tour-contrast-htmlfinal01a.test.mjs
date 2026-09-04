/* HTML-FINAL-01A — LES DEUX DERNIERS TEXTES QUI NE SE LAISSAIENT PAS LIRE.
 * ============================================================================
 *
 * HTML-FINAL-01 a fermé six sous-gates sur sept et laissé le septième ouvert
 * pour deux textes de la visite guidée, mesurés à 3,61:1 et 3,76:1 en thème
 * clair. Ce lot ne fait que cela : les amener au-dessus du seuil, sans toucher
 * au jeton --signal, sans toucher à la classe .bouton, sans rien déplacer.
 *
 * LE SEUIL N'EST PAS CHOISI, IL EST CONSTATÉ. Le compteur d'étape est rendu à
 * 10,5 px et le libellé « Suivant » à 11 px. Le seuil réduit de 3:1 ne
 * s'ouvre qu'à partir de 24 px, ou de 18,66 px en gras. Aucun des deux n'en
 * approche : le seuil applicable est 4,5:1, sans exception à invoquer.
 *
 * LA PORTÉE EST LA PREUVE. Les trois règles ajoutées vivent toutes derrière
 * .visite-carte ou .visite-actions, et derrière :not([data-theme="sombre"]) —
 * le thème sombre rendait déjà 5,5:1 et 6,06:1, il est donc exclu par
 * construction plutôt que corrigé puis recorrigé.
 *
 * CE FICHIER CALCULE VRAIMENT. Il ne compare pas des chaînes de couleur : il
 * résout les variables CSS comme le ferait la cascade, puis applique la
 * formule de luminance relative. Les nombres qu'il affirme sont ceux que le
 * navigateur réel a rendus — 6,17:1 et 6,44:1.
 *
 * Et il ne dit rien de la latence : PERF-REAL-01 reste ouverte.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRE = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');
const CSS = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/** Les deux portées de variables du produit, lues telles que la cascade les voit. */
function variables(selecteur) {
  const table = new Map();
  const motif = new RegExp(`^\\s*${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`, 'gm');
  for (const bloc of CSS.matchAll(motif)) {
    for (const d of bloc[1].matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+)/g)) table.set(d[1], d[2].trim());
  }
  return table;
}
const CLAIR = variables(':root');
const SOMBRE = variables('html[data-theme="sombre"]');

/** Résout var(--x) en remontant la portée du thème, puis la portée racine. */
function resoudre(valeur, sombre, profondeur = 0) {
  assert.ok(profondeur < 12, `cycle de variables sur ${valeur}`);
  const v = String(valeur).trim();
  const m = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v);
  if (!m) return v;
  const brut = (sombre && SOMBRE.get(m[1])) || CLAIR.get(m[1]) || (m[2] || '').trim();
  assert.ok(brut, `variable non définie : ${m[1]}`);
  return resoudre(brut, sombre, profondeur + 1);
}
function canal(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  assert.equal(h.length, 6, `couleur non résolue : ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = canal(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Rapport de contraste WCAG, arrondi au centième comme le rapporte le navigateur. */
function contraste(avant, arriere) {
  const a = luminance(avant); const b = luminance(arriere);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}
/** Le corps d'une règle, cherché à l'identique dans la feuille du document. */
function regle(selecteur) {
  const motif = new RegExp(`(?:^|[}\\n])\\s*${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`);
  const m = motif.exec(CSS);
  assert.ok(m, `règle introuvable : ${selecteur}`);
  return m[1];
}
const propriete = (corps, nom) => {
  const m = new RegExp(`(?:^|;)\\s*${nom}\\s*:\\s*([^;]+)`).exec(corps);
  return m ? m[1].trim() : null;
};

/* Le seuil, établi une fois, à partir des tailles réellement rendues. */
const TAILLE_ETAPE = 10.5;
const TAILLE_SUIVANT = 11;
const SEUIL = 4.5;

// =================================================================================================

test('T-HTMLFINAL01A-00 : le seuil applicable est celui du texte standard, et il est constaté', () => {
  /* Le seuil réduit de 3:1 exige 24 px, ou 18,66 px en gras. On mesure d'abord,
     on conclut ensuite — l'exception n'est pas invoquée, elle est écartée. */
  assert.match(regle('.visite-carte .visite-etape'), /font-size:10\.5px/);
  assert.match(regle('.bouton'), /font-size:11px/);
  for (const [nom, taille] of [['compteur d’étape', TAILLE_ETAPE], ['bouton Suivant', TAILLE_SUIVANT]]) {
    assert.ok(taille < 18.66, `${nom} : ${taille} px — sous les 18,66 px du gras`);
    assert.ok(taille < 24, `${nom} : ${taille} px — sous les 24 px du texte large`);
  }
  assert.equal(SEUIL, 4.5, 'APPLICABLE_CONTRAST_THRESHOLD = 4.5:1');
});

test('T-HTMLFINAL01A-01 : le compteur d’étape est conforme en thème clair', () => {
  const couleur = resoudre(propriete(regle('html:not([data-theme="sombre"]) .visite-carte .visite-etape'), 'color'), false);
  const fond = resoudre(propriete(regle('.visite-carte'), 'background'), false);
  const r = contraste(couleur, fond);
  assert.equal(r, 6.17, 'GUIDED_TOUR_STEP_CONTRAST_LIGHT');
  assert.ok(r >= SEUIL, `${r}:1 ≥ ${SEUIL}:1`);
  /* Et la valeur d'avant est bien celle qui échouait : le lot corrige un défaut réel. */
  assert.equal(contraste(resoudre('var(--signal)', false), fond), 3.61, 'la mesure d’avant, conservée pour mémoire');
});

test('T-HTMLFINAL01A-02 : le compteur d’étape reste conforme en thème sombre, sans y avoir été touché', () => {
  /* La règle claire est explicitement exclue du thème sombre : c'est donc la
     déclaration d'origine, var(--signal), qui s'applique — et elle passait déjà. */
  const portee = 'html:not([data-theme="sombre"]) .visite-carte .visite-etape';
  assert.ok(CSS.includes(portee), 'la correction est gardée par :not([data-theme="sombre"])');
  const couleur = resoudre(propriete(regle('.visite-carte .visite-etape'), 'color'), true);
  const fond = resoudre(propriete(regle('.visite-carte'), 'background'), true);
  const r = contraste(couleur, fond);
  assert.equal(r, 5.5, 'GUIDED_TOUR_STEP_CONTRAST_DARK');
  assert.ok(r >= SEUIL);
  assert.equal(couleur.toLowerCase(), resoudre('var(--ds-accent)', true).toLowerCase(),
    'le thème sombre garde l’accent de sa propre palette.');
});

test('T-HTMLFINAL01A-03 : le libellé « Suivant » est conforme en thème clair', () => {
  const fond = resoudre(propriete(regle('html:not([data-theme="sombre"]) .visite-actions .bouton.primaire'), 'background'), false);
  const texte = resoudre(propriete(regle('.bouton.primaire'), 'color'), false);
  const r = contraste(texte, fond);
  assert.equal(r, 6.44, 'GUIDED_TOUR_NEXT_CONTRAST_LIGHT');
  assert.ok(r >= SEUIL, `${r}:1 ≥ ${SEUIL}:1`);
  assert.equal(contraste(texte, resoudre('var(--signal)', false)), 3.76, 'la mesure d’avant, conservée pour mémoire');
  /* La teinte employée n'est pas nouvelle : trois surfaces du produit la portent déjà. */
  assert.equal(fond.toLowerCase(), '#7b5738');
  for (const voisin of ['.ui-api-status', '.ui-mode-badge', '.ui-eyebrow']) {
    assert.ok(CSS.includes(`#v11-shell ${voisin}{`) && CSS.slice(CSS.indexOf(`#v11-shell ${voisin}{`)).slice(0, 400).includes('#7b5738'),
      `#7b5738 est déjà la couleur de ${voisin}`);
  }
});

test('T-HTMLFINAL01A-04 : le libellé « Suivant » reste conforme en thème sombre, sans y avoir été touché', () => {
  const fond = resoudre(propriete(regle('.bouton.primaire'), 'background'), true);
  const texte = resoudre(propriete(regle('html[data-theme="sombre"] .bouton.primaire'), 'color'), true);
  const r = contraste(texte, fond);
  assert.equal(r, 6.06, 'GUIDED_TOUR_NEXT_CONTRAST_DARK');
  assert.ok(r >= SEUIL);
  /* Aucune des trois règles ajoutées ne s'applique en thème sombre. */
  for (const ajoutee of ['html:not([data-theme="sombre"]) .visite-carte .visite-etape',
                         'html:not([data-theme="sombre"]) .visite-actions .bouton.primaire',
                         'html:not([data-theme="sombre"]) .visite-actions .bouton.primaire:hover']) {
    assert.ok(CSS.includes(ajoutee), `règle présente et gardée : ${ajoutee}`);
  }
});

test('T-HTMLFINAL01A-05 : survol et focus restent sûrs, et le survol n’a pas été perdu en route', () => {
  /* Le survol devait être redéclaré dans la portée : la règle générale
     .bouton.primaire:hover a une spécificité inférieure et serait supplantée. */
  const survol = regle('html:not([data-theme="sombre"]) .visite-actions .bouton.primaire:hover');
  const fondSurvol = resoudre(propriete(survol, 'background'), false);
  const texte = resoudre(propriete(regle('.bouton.primaire'), 'color'), false);
  const rSurvol = contraste(texte, fondSurvol);
  assert.equal(rSurvol, 14.27, 'GUIDED_TOUR_NEXT_HOVER_CONTRAST');
  assert.ok(rSurvol >= SEUIL);
  assert.equal(fondSurvol.toLowerCase(), resoudre('var(--encre)', false).toLowerCase(),
    'le survol reste exactement ce qu’il était : le fond d’encre.');
  const survolSombre = resoudre(propriete(regle('.bouton.primaire:hover'), 'background'), true);
  assert.ok(contraste(resoudre(propriete(regle('html[data-theme="sombre"] .bouton.primaire:hover'), 'color'), true),
    survolSombre) >= SEUIL, 'et le survol sombre reste conforme.');
  /* FOCUS : le contour ne change ni le texte ni le fond ; il s'écarte de 2 px et se
     détache donc du fond de la carte, où il rend 3,61:1 — au-dessus des 3:1 exigés
     d'un indicateur non textuel. Le texte, lui, garde son propre rapport. */
  assert.match(CSS, /:focus-visible\{outline:2px solid var\(--signal\);outline-offset:2px\}/);
  const contour = resoudre('var(--signal)', false);
  assert.ok(contraste(contour, resoudre(propriete(regle('.visite-carte'), 'background'), false)) >= 3,
    'GUIDED_TOUR_NEXT_FOCUS_CONTRAST : le contour se détache de la carte.');
  assert.equal(contraste(texte, resoudre(propriete(regle('html:not([data-theme="sombre"]) .visite-actions .bouton.primaire'), 'background'), false)), 6.44,
    'et au focus le texte rend toujours 6,44:1.');
  /* L'ÉTAT DÉSACTIVÉ N'EXISTE PAS pour ce bouton : rien ne le désactive jamais. */
  assert.equal([...html.matchAll(/visite-suivant[^\n]{0,120}disabled/g)].length, 0);
  assert.equal(/<button type="button" class="bouton primaire" id="visite-suivant">Suivant<\/button>/.test(html), true);
});

test('T-HTMLFINAL01A-06 : le jeton --signal n’a pas bougé', () => {
  assert.equal(CLAIR.get('--signal'), 'var(--ds-accent)', 'GLOBAL_SIGNAL_TOKEN_CHANGED = NO');
  assert.equal(resoudre('var(--signal)', false).toLowerCase(), '#b87346');
  assert.equal(resoudre('var(--signal)', true).toLowerCase(), '#d28b5c');
  assert.equal(CLAIR.get('--ds-accent'), '#b87346');
  assert.equal(SOMBRE.get('--ds-accent'), '#d28b5c');
  /* Et aucune règle ajoutée ne redéfinit une variable, où que ce soit. */
  for (const ajoutee of ['html:not([data-theme="sombre"]) .visite-carte .visite-etape',
                         'html:not([data-theme="sombre"]) .visite-actions .bouton.primaire']) {
    assert.equal(/--[a-zA-Z0-9-]+\s*:/.test(regle(ajoutee)), false, `${ajoutee} ne pose aucun jeton.`);
  }
});

test('T-HTMLFINAL01A-07 : la classe .bouton globale n’a pas bougé', () => {
  assert.equal(regle('.bouton.primaire').trim(),
    'background:var(--signal);border-color:var(--signal);color:#fff');
  assert.equal(regle('.bouton.primaire:hover').trim(),
    'background:var(--encre);border-color:var(--encre)');
  assert.match(regle('.bouton'), /font-size:11px;letter-spacing:\.1em;text-transform:uppercase/);
  assert.match(regle('.bouton'), /border:1px solid var\(--trait\);background:var\(--papier\);color:var\(--encre\)/);
  /* GLOBAL_BUTTON_CLASS_CHANGED = NO : toute règle nouvelle passe par la visite. */
  const nouvelles = [...CSS.matchAll(/^html:not\(\[data-theme="sombre"\]\)([^{]*)\{/gm)].map((m) => m[1].trim());
  assert.deepEqual(nouvelles, ['.visite-carte .visite-etape', '.visite-actions .bouton.primaire',
    '.visite-actions .bouton.primaire:hover']);
  for (const sel of nouvelles) {
    assert.ok(/^\.visite-(carte|actions)\b/.test(sel), `portée limitée à la visite : ${sel}`);
  }
});

test('T-HTMLFINAL01A-08 : aucune nouvelle défaillance de contraste', () => {
  /* Les six textes de la carte de visite, dans les deux thèmes, calculés ici. */
  const fondCarte = (sombre) => resoudre(propriete(regle('.visite-carte'), 'background'), sombre);
  const mesures = [];
  for (const sombre of [false, true]) {
    const etape = sombre
      ? resoudre(propriete(regle('.visite-carte .visite-etape'), 'color'), true)
      : resoudre(propriete(regle('html:not([data-theme="sombre"]) .visite-carte .visite-etape'), 'color'), false);
    mesures.push([`étape/${sombre ? 'sombre' : 'clair'}`, contraste(etape, fondCarte(sombre))]);
    const titre = resoudre('var(--encre)', sombre);
    mesures.push([`titre/${sombre ? 'sombre' : 'clair'}`, contraste(titre, fondCarte(sombre))]);
    mesures.push([`texte/${sombre ? 'sombre' : 'clair'}`,
      contraste(resoudre(propriete(regle('.visite-carte p'), 'color'), sombre), fondCarte(sombre))]);
    mesures.push([`passer/${sombre ? 'sombre' : 'clair'}`,
      contraste(resoudre(propriete(regle('.visite-actions button.lien'), 'color'), sombre), fondCarte(sombre))]);
    const fondSuivant = sombre
      ? resoudre(propriete(regle('.bouton.primaire'), 'background'), true)
      : resoudre(propriete(regle('html:not([data-theme="sombre"]) .visite-actions .bouton.primaire'), 'background'), false);
    const texteSuivant = sombre
      ? resoudre(propriete(regle('html[data-theme="sombre"] .bouton.primaire'), 'color'), true)
      : resoudre(propriete(regle('.bouton.primaire'), 'color'), false);
    mesures.push([`suivant/${sombre ? 'sombre' : 'clair'}`, contraste(texteSuivant, fondSuivant)]);
  }
  const sousSeuil = mesures.filter(([, r]) => r < SEUIL);
  assert.deepEqual(sousSeuil, [], `NEW_CONTRAST_FAILURE_COUNT = 0 — mesures : ${JSON.stringify(mesures)}`);
  /* Et les corrections de HTML-FINAL-01 tiennent toujours, aux mêmes valeurs. */
  assert.equal(contraste('#7b5738', resoudre('var(--ui-accent-3)', false)), 4.96, 'pastille de mode');
  assert.equal(contraste(resoudre('var(--ds-accent-hover)', true), resoudre('var(--ds-accent-soft)', true)), 5.02,
    'pastille de mode, thème sombre');
  assert.equal(contraste(resoudre('var(--ds-bg)', true), resoudre('var(--ds-text)', true)), 14.01,
    'lien d’évitement, thème sombre');
});

test('T-HTMLFINAL01A-09 : aucune régression de mise en page ni de responsive', () => {
  /* Les trois règles ajoutées ne portent QUE de la couleur : rien qui occupe de la place. */
  const geometriques = /(?:^|;)\s*(width|height|padding|margin|font-size|line-height|display|position|top|left|right|bottom|gap|border-width|border-radius|flex|grid|transform)\s*:/;
  for (const sel of ['html:not([data-theme="sombre"]) .visite-carte .visite-etape',
                     'html:not([data-theme="sombre"]) .visite-actions .bouton.primaire',
                     'html:not([data-theme="sombre"]) .visite-actions .bouton.primaire:hover']) {
    assert.equal(geometriques.test(regle(sel)), false, `${sel} ne touche à aucune dimension.`);
    for (const d of regle(sel).split(';').filter(Boolean)) {
      assert.match(d.trim(), /^(color|background|border-color)\s*:/, `déclaration purement chromatique : ${d.trim()}`);
    }
  }
  /* La carte de visite garde sa largeur et son repli mobile. */
  assert.match(CSS, /\.visite-carte\{[^}]*width:290px;max-width:calc\(100vw - 32px\)/);
  assert.match(CSS, /@media\(max-width:900px\)\{\s*\.visite-carte\{width:calc\(100vw - 32px\)\}/);
  /* Et les invariants responsive de HTML-FINAL-01 sont intacts. */
  assert.match(CSS, /#v11-shell \.ui-mode-cards\{grid-template-columns:1fr\}/);
  assert.match(CSS, /#v11-shell,\.scene,\.vue,\.panneau,\.ui-panel,\.ui-stage-card\{min-width:0\}/);
  assert.match(CSS, /pre,\.sortie,#ui-rapid-output\{overflow-wrap:anywhere;word-break:break-word\}/);
});

test('T-HTMLFINAL01A-10 : les autres sous-gates de HTML-FINAL-01 restent fermés', () => {
  /* Structure : aucun identifiant en double, aucun attribut répété. */
  const marquage = (() => {
    let out = '', i = 0;
    for (const m of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g)) {
      out += html.slice(i, m.index) + ' '.repeat(m[0].length); i = m.index + m[0].length;
    }
    return out + html.slice(i);
  })();
  const vus = new Map();
  for (const m of marquage.matchAll(/\sid="([^"]+)"/g)) vus.set(m[1], (vus.get(m[1]) || 0) + 1);
  assert.deepEqual([...vus].filter(([, n]) => n > 1), []);
  /* A11Y : les noms accessibles posés par HTML-FINAL-01 sont toujours là. */
  for (const [id, nom] of [['v11-files', 'Choisir des documents à joindre'],
                           ['v11-answer', 'Votre réponse à la question posée'],
                           ['v11-final', 'Demande finale préparée'],
                           ['qualite-corpus-json', 'Corpus au format JSON']]) {
    assert.ok(marquage.includes(`id="${id}"`) && marquage.slice(marquage.indexOf(`id="${id}"`) - 220,
      marquage.indexOf(`id="${id}"`) + 260).includes(`aria-label="${nom}"`), `#${id} garde son nom`);
  }
  assert.match(marquage, /<div class="v11-stage" id="v11-api-progress" role="status" aria-live="polite" hidden>/);
  assert.match(marquage, /<section class="ui-inline-result" id="ui-rapid-result" aria-live="polite" hidden>/);
  /* Titres : la hiérarchie reste sans saut. */
  for (const titre of ['Aller droit au but', 'Comprendre et structurer', 'Fabriquer avec inventivité']) {
    assert.ok(marquage.includes(`<h2>${titre}</h2>`));
  }
  /* Thème sombre : le bloc de HTML-FINAL-01 est intact. */
  assert.match(CSS, /html\[data-theme="sombre"\]\{--ui-surface:rgba\(41,37,33,\.96\)\}/);
  assert.match(CSS, /background:var\(--ds-text,#2d2a27\);color:var\(--ds-bg,#fff\)/);
  /* Et la dette de performance reste ouverte, entière. */
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
});
