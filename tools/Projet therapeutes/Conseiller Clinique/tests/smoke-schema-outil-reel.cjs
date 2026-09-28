// Test de fumée — les schémas d'outil `strict` compilent-ils RÉELLEMENT chez Anthropic ?
//
// À LANCER AVANT TOUT PUSH QUI TOUCHE À UN SCHÉMA D'OUTIL. Aucun contrôle local ne remplace
// celui-ci, et c'est le point de tout ce fichier.
//
// Pourquoi il existe — incident du 28/09/2026. Un schéma ajouté au lot « ACTE 3 » était valide
// JSON Schema, conforme à TOUTES les limites documentées d'Anthropic (20 outils stricts, 24
// paramètres optionnels, 16 paramètres de type union — il en comptait 0 des deux dernières), et
// acceptée par tous les contrôles locaux. En production il a produit un HTTP 400 DÉTERMINISTE sur
// chaque génération de Présentation, en ~0,4 s, avant toute réponse :
//
//     The compiled grammar is too large, which would cause performance issues.
//     Simplify your tool schemas or reduce the number of strict tools.
//
// Un schéma `strict` est compilé en GRAMMAIRE par l'API, et cette grammaire a une taille maximale
// qui n'est pas documentée et qu'aucune inspection locale ne permet de prévoir. La marge restante,
// mesurée le même jour contre l'API réelle, ne tenait qu'à un seul tableau de chaînes. Autrement
// dit : ces schémas vivent au bord de la limite, et la SEULE façon de savoir si une modification
// passe est de la soumettre à l'API.
//
// Ce que fait ce test : pour chaque outil structuré, un VRAI appel avec max_tokens:1 — la grammaire
// est compilée avant que le moindre jeton ne soit produit, donc un schéma trop gros échoue tout de
// suite, pour un coût négligeable.
//
// Usage (la clé n'est jamais écrite dans le dépôt ni affichée) :
//     STUDIO_WORKER_API_KEY=… node tests/smoke-schema-outil-reel.cjs
// C'est la même clé que celle posée dans le navigateur par
// localStorage.setItem('workerApiKey', …).

const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = process.env.STUDIO_WORKER_API_KEY;
if (!CLE) {
  console.error("Ce test fait de VRAIS appels : il lui faut la clé du Worker.\n" +
    "  STUDIO_WORKER_API_KEY=… node tests/smoke-schema-outil-reel.cjs\n" +
    "(la même que localStorage.getItem('workerApiKey') dans le navigateur ; " +
    "ne la place jamais dans un fichier du dépôt.)");
  process.exit(2);
}

// Extraction STATIQUE des schémas depuis la source réelle — jamais une copie tenue à jour à la
// main, qui finirait par diverger de ce qui part vraiment en production.
const source = fs.readFileSync(path.join(__dirname, '..', 'studio-clinique-core.js'), 'utf8');
function extraire(nom) {
  const debut = source.indexOf('  const ' + nom + ' = {');
  if (debut === -1) throw new Error('schéma introuvable dans la source : ' + nom);
  const ouvrante = source.indexOf('{', debut);
  // Compteur d'accolades qui saute chaînes ET commentaires. Les commentaires comptent vraiment :
  // ce fichier est commenté en français, et un simple « l'outil » dans un // suffit à faire
  // croire à un scanner naïf qu'une chaîne vient de s'ouvrir — l'extraction s'arrête alors au
  // mauvais endroit et le test échoue sur du JavaScript tronqué plutôt que sur un vrai refus de
  // l'API. (Constaté ici même en écrivant ce test.)
  let profondeur = 0, i = ouvrante, dansChaine = null;
  for (; i < source.length; i++) {
    const c = source[i], suivant = source[i + 1];
    if (dansChaine) {
      if (c === '\\') i++;
      else if (c === dansChaine) dansChaine = null;
      continue;
    }
    if (c === '/' && suivant === '/') { i = source.indexOf('\n', i); if (i === -1) break; continue; }
    if (c === '/' && suivant === '*') { i = source.indexOf('*/', i + 2) + 1; if (i === 0) break; continue; }
    if (c === '"' || c === "'" || c === '`') { dansChaine = c; continue; }
    if (c === '{') profondeur++;
    else if (c === '}') { profondeur--; if (!profondeur) break; }
  }
  if (profondeur !== 0) throw new Error('accolades non refermées en extrayant ' + nom);
  // eslint-disable-next-line no-eval
  return eval('(' + source.slice(ouvrante, i + 1) + ')');
}

const OUTILS = ['ADOC_STRUCTURED_FICHE_TOOL', 'ADOC_STRUCTURED_CARROUSEL_TOOL',
  'ADOC_STRUCTURED_PRESENTATION_TOOL', 'ADOC_STRUCTURED_SCRIPT_TOOL',
  'ADOC_STRUCTURED_TABLEAU_TOOL', 'ADOC_STRUCTURED_LIENS_TOOL'];

(async function () {
  let echecs = 0;
  console.log('Appels RÉELS à Anthropic via le Worker, max_tokens:1 — un par schéma.\n');
  for (const nom of OUTILS) {
    const outil = extraire(nom);
    const taille = Buffer.byteLength(JSON.stringify(outil.input_schema || {}));
    const payload = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      max_tokens: 1,
      system: 'Test de compilation de schéma.',
      messages: [{ role: 'user', content: 'ok' }],
      tools: [outil],
      tool_choice: { type: 'tool', name: outil.name },
    };
    let statut = 0, detail = '';
    try {
      const r = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': CLE },
        body: JSON.stringify({ payload: payload }),
      });
      statut = r.status;
      if (!r.ok) {
        const brut = await r.text();
        try { detail = JSON.parse(brut).error.message; } catch (_) { detail = brut; }
        detail = String(detail).replace(/\s+/g, ' ').slice(0, 300);
      }
    } catch (e) {
      detail = 'appel impossible : ' + (e && e.message);
    }
    // max_tokens:1 fait forcément buter sur la limite de jetons : c'est attendu, et cela prouve
    // justement que la grammaire a été compilée. Seul un refus AVANT génération nous intéresse.
    const ok = statut === 200;
    if (!ok) echecs++;
    console.log((ok ? 'PASS  ' : 'ÉCHEC ') + nom.replace('ADOC_STRUCTURED_', '').replace('_TOOL', '').padEnd(13)
      + String(taille).padStart(6) + ' o   HTTP ' + statut + (detail ? '  | ' + detail : ''));
  }
  console.log('');
  if (echecs) {
    console.error('ÉCHEC — ' + echecs + ' schéma(s) refusé(s) par l\'API. NE PAS POUSSER.');
    console.error('Si le message parle de « compiled grammar is too large » : le schéma doit être');
    console.error('ALLÉGÉ, pas seulement rendu valide. Mesurer chaque variante par un appel réel.');
    process.exit(1);
  }
  console.log('PASS — les ' + OUTILS.length + ' schémas compilent chez Anthropic.');
})();
