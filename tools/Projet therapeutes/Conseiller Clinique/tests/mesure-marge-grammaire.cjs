// MESURE DE LA MARGE DE GRAMMAIRE RESTANTE — combien de chaînes scalaires peuvent encore être
// ajoutées à ADOC_STRUCTURED_PRESENTATION_TOOL avant que la compilation ne soit refusée
// (« The compiled grammar is too large », HTTP 400). Aucun contrôle local ne peut y répondre :
// la limite n'est pas documentée et ne se constate qu'à l'appel.
//
// Même extracteur que tests/smoke-schema-outil-reel.cjs (équilibrage d'accolades tolérant aux
// commentaires et aux chaînes), même discipline de verdict : SEULS 200 et 400 tranchent. Un 401
// (clé), un 429 (quota) ou un 5xx (panne) veulent dire que la question n'a pas été posée — les
// compter en refus ferait conclure « marge nulle » sur une clé mal collée.
//
// Les champs ajoutés sont des chaînes REQUISES SANS description : c'est l'unité du budget, et une
// description gonflerait les octets sans nécessairement peser sur la grammaire — on mesure ici le
// coût structurel seul, celui qui décide.
const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
if (!CLE || /^[<'"…]|\.\.\.$/.test(CLE)) {
  console.error("STUDIO_WORKER_API_KEY absente ou factice. Lance ce banc via son script d'appel.");
  process.exit(2);
}

const FICHIER = path.join(__dirname, '..', 'studio-clinique-core.js');
const source = fs.readFileSync(FICHIER, 'utf8');
function extraire(nom) {
  const i = source.indexOf('const ' + nom);
  if (i < 0) throw new Error('outil introuvable : ' + nom);
  const j = source.indexOf('{', i);
  let prof = 0, k = j, chaine = null, echap = false, ligne = false, bloc = false;
  for (; k < source.length; k++) {
    const c = source[k], s = source[k + 1];
    if (echap) { echap = false; continue; }
    if (chaine) { if (c === '\\') { echap = true; continue; } if (c === chaine) chaine = null; continue; }
    if (ligne) { if (c === '\n') ligne = false; continue; }
    if (bloc) { if (c === '*' && s === '/') { bloc = false; k++; } continue; }
    if (c === '/' && s === '/') { ligne = true; k++; continue; }
    if (c === '/' && s === '*') { bloc = true; k++; continue; }
    if (c === "'" || c === '"' || c === '`') { chaine = c; continue; }
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) break; }
  }
  return eval('(' + source.slice(j, k + 1) + ')');
}

const BASE = extraire('ADOC_STRUCTURED_PRESENTATION_TOOL');

function avecChaines(n) {
  const outil = JSON.parse(JSON.stringify(BASE));
  const page = outil.input_schema.properties.deepDives.items;
  for (let i = 0; i < n; i++) {
    page.properties['mesureChamp' + i] = { type: 'string' };
    page.required.push('mesureChamp' + i);
  }
  return outil;
}

async function essai(n) {
  const outil = avecChaines(n);
  const octets = Buffer.byteLength(JSON.stringify(outil.input_schema));
  const payload = {
    provider: 'anthropic', model: 'claude-sonnet-4-6', max_tokens: 1,
    system: 'Mesure de compilation de schéma.',
    messages: [{ role: 'user', content: 'ok' }],
    tools: [outil], tool_choice: { type: 'tool', name: outil.name },
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
      let msg = brut;
      try { const j = JSON.parse(brut); const e = j && j.error; msg = (e && typeof e === 'object' ? e.message : e) || j.message || brut; } catch (_) {}
      detail = String(msg == null ? brut : msg).replace(/\s+/g, ' ').slice(0, 160);
    }
  } catch (e) { statut = -1; detail = (e && e.message) || String(e); }
  const verdict = statut === 200 ? 'ACCEPTÉ' : statut === 400 ? 'REFUSÉ ' : 'INDÉTERMINÉ';
  console.log('  +' + String(n).padStart(2) + ' chaîne(s)  ' + String(octets).padStart(5) + ' o  HTTP ' +
    String(statut).padStart(3) + '  ' + verdict + (detail ? '  — ' + detail : ''));
  if (verdict === 'INDÉTERMINÉ') { console.error('\nArrêt : la question n\'a pas été posée (ni 200 ni 400). Rien n\'est conclu.'); process.exit(3); }
  return verdict === 'ACCEPTÉ';
}

(async function () {
  // BANDEAU DE PROVENANCE — la campagne de cours a déjà été mesurée deux fois sur du code périmé
  // sans que rien ne le signale. Un banc qui ne dit pas CE QU'IL MESURE peut rendre un chiffre juste
  // sur un fichier faux.
  const crypto = require('node:crypto');
  const { execFileSync } = require('node:child_process');
  const js = JSON.stringify(BASE.input_schema);
  // Empreinte sur l'outil ENTIER et taille sur input_schema seul : exactement les deux conventions de
  // tests/verify-schema-outil-fige.cjs, pour que les chiffres des deux bancs se comparent au lieu de
  // se contredire. Une empreinte calculée autrement ici ressemblerait à la référence sans l'être.
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(BASE)).digest('hex').slice(0, 16);
  let commit = '(hors dépôt git)', sales = '';
  try {
    const dir = path.dirname(FICHIER);
    commit = execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const st = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--', FICHIER], { encoding: 'utf8' }).trim();
    if (st) sales = '  *** NON COMMITÉ ***';
  } catch (_) { /* pas de git : on le dit, on ne l'invente pas */ }
  console.log('Code mesuré : ' + commit + sales);
  console.log('Fichier     : ' + FICHIER);
  console.log('Schéma      : ' + Buffer.byteLength(js) + ' o, empreinte ' + empreinte + '\n');
  console.log('Appels RÉELS, max_tokens:1 — quelques centimes.\n');
  if (!(await essai(0))) {
    console.error('\nMARGE NÉGATIVE : le schéma ACTUEL est déjà refusé. À rapporter en priorité absolue.');
    process.exit(1);
  }
  // Sonde exponentielle : on cherche d'abord une borne haute qui échoue, sans dépasser 32.
  let bas = 0, haut = null;
  for (const n of [1, 2, 4, 8, 16, 32]) {
    if (await essai(n)) bas = n; else { haut = n; break; }
  }
  if (haut === null) {
    console.log('\nMarge >= 32 chaînes scalaires : largement suffisante, aucune contrainte pratique.');
    return;
  }
  // Bissection entre la dernière acceptée et la première refusée.
  while (haut - bas > 1) {
    const m = Math.floor((bas + haut) / 2);
    if (await essai(m)) bas = m; else haut = m;
  }
  console.log('\n=== MARGE MESURÉE : ' + bas + ' chaîne(s) scalaire(s) encore acceptée(s) ; ' + haut + ' est refusée. ===');
})();
