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
//     export STUDIO_WORKER_API_KEY='votre-clé'       # une seule fois par terminal
//     node tests/smoke-schema-outil-reel.cjs
// C'est la même clé que celle posée dans le navigateur par
// localStorage.setItem('workerApiKey', 'votre-clé').
//
// Ne PAS recopier un exemple contenant « … » ou « <…> » : ces caractères sont impossibles dans un
// en-tête HTTP, aucun appel ne partirait, et le test le dit explicitement plutôt que de conclure à
// tort que les schémas sont refusés.

const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
// Une clé inutilisable doit être dite TOUT DE SUITE, et jamais confondue avec un refus de l'API.
// Un en-tête HTTP n'accepte que de l'ASCII : le « … » d'une ligne de commande recopiée telle
// quelle fait échouer fetch AVANT tout appel — et un test qui conclurait « refusé par l'API »
// là-dessus mentirait sur la seule chose qu'on lui demande.
const placeholder = CLE === '…' || CLE === '...' || /^[<'"].*[>'"]$/.test(CLE) || /^votre/i.test(CLE);
if (CLE && (placeholder || /[^\x20-\x7E]/.test(CLE))) {
  console.error("La valeur de STUDIO_WORKER_API_KEY n'est pas une clé utilisable" +
    (placeholder ? " : c'est l'exemple de la documentation, à remplacer par la vraie clé."
                 : ' : elle contient un caractère non-ASCII, impossible dans un en-tête HTTP.') +
    "\nAucun appel n'a été émis. Les schémas ne sont NI validés NI invalidés.");
  process.exit(2);
}
if (!CLE) {
  console.error("Ce test fait de VRAIS appels : il lui faut la clé du Worker.\n" +
    "  export STUDIO_WORKER_API_KEY='votre-clé'\n" +
    "  node tests/smoke-schema-outil-reel.cjs\n" +
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
  let refuses = 0, indetermines = 0;
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
    let statut = 0, detail = '', joint = true;
    try {
      const r = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': CLE },
        body: JSON.stringify({ payload: payload }),
      });
      statut = r.status;
      if (!r.ok) {
        const brut = await r.text();
        // Le corps d'erreur n'a pas une forme unique : {error:{message}} chez Anthropic,
        // {error:"Unauthorized"} chez le Worker, parfois du texte brut. Une extraction qui
        // suppose une seule de ces formes affiche « undefined » — c'est-à-dire qu'elle perd
        // précisément le message pour lequel ce test existe.
        let msg = brut;
        try {
          const j = JSON.parse(brut);
          const e = j && j.error;
          msg = (e && typeof e === 'object' ? e.message : e) || j.message || brut;
        } catch (_) { /* corps non-JSON : on garde le texte brut */ }
        detail = String(msg == null ? brut : msg).replace(/\s+/g, ' ').slice(0, 300) || '(corps vide)';
      }
    } catch (e) {
      joint = false;
      detail = (e && e.message) || String(e);
    }
    // max_tokens:1 fait forcément buter sur la limite de jetons : c'est attendu, et cela prouve
    // justement que la grammaire a été compilée. Seul un refus AVANT génération nous intéresse.
    // SEULS 200 et 400 sont des verdicts sur le schéma. Un 401 (clé), un 429 (quota), un 5xx
    // (panne) disent que la question n'a pas été posée, pas que la réponse est non — les traiter
    // en échec ferait crier à la régression sur une clé mal collée, et, dans l'autre sens,
    // habituerait à ignorer un vrai refus. C'est la même confusion que « HTTP 400 » sans corps.
    const ok = joint && statut === 200;
    const verdict = joint && (statut === 200 || statut === 400);
    if (!verdict) indetermines++; else if (!ok) refuses++;
    const etiquette = ok ? 'PASS   ' : verdict ? 'REFUSÉ ' : 'INDÉT. ';
    console.log(etiquette + ' ' + nom.replace('ADOC_STRUCTURED_', '').replace('_TOOL', '').padEnd(13)
      + String(taille).padStart(6) + ' o   ' + (joint ? 'HTTP ' + statut : 'aucun appel émis')
      + (detail ? '  | ' + detail : ''));
  }
  console.log('');
  // Deux issues NÉGATIVES bien distinctes, jamais confondues : « l'API a refusé le schéma » est
  // un verdict sur le code ; « je n'ai joint personne » n'en est pas un et ne doit surtout pas en
  // prendre l'apparence — sans quoi une panne de réseau ou une clé mal collée ferait croire à une
  // régression, ou, pire, une vraie régression passerait pour un souci de connexion.
  if (indetermines) {
    console.error('INDÉTERMINÉ — ' + indetermines + ' appel(s) n\'ont pas obtenu de verdict.');
    console.error("Les schémas ne sont NI validés NI invalidés : ce test n'a rien prouvé.");
    console.error('Un 401 vient de la clé, un 429 du quota, un 5xx du service — jamais du schéma.');
    console.error('Corriger la cause puis relancer : tant que ce test ne dit pas PASS, ne pas pousser');
    console.error("de modification d'un schéma d'outil.");
    process.exit(2);
  }
  if (refuses) {
    console.error('ÉCHEC — ' + refuses + ' schéma(s) refusé(s) par l\'API. NE PAS POUSSER.');
    console.error('Si le message parle de « compiled grammar is too large » : le schéma doit être');
    console.error('ALLÉGÉ, pas seulement rendu valide. Mesurer chaque variante par un appel réel.');
    process.exit(1);
  }
  console.log('PASS — les ' + OUTILS.length + ' schémas compilent chez Anthropic.');
})();
