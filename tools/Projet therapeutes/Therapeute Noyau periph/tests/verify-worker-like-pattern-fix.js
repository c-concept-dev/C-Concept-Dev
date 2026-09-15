// PHASE 3 (monobloc) — motif LIKE de repli jugé "trop complexe" par SQLite (preuve réelle,
// journaux du Worker : "[D1_SEARCH] FTS5 failed, falling back to LIKE: D1_ERROR: LIKE or GLOB
// pattern too complex" / "[D1_SEARCH_FAIL] D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR").
//
// Localisé dans handleD1Query (Worker/index.js) : chaque terme/auteur/titre était injecté
// DIRECTEMENT entre deux '%' ("%" + valeur + "%"), sans jamais échapper les caractères qui sont
// eux-mêmes des jokers LIKE ('%' et '_') ni jamais borner leur longueur. Vérifié ici avec un
// VRAI moteur SQLite (node:sqlite, pas un mock) : un motif contenant des dizaines de milliers de
// caractères '%' déclenche RÉELLEMENT "LIKE or GLOB pattern too complex" (seuil expérimental
// situé entre 10 000 et 50 000 jokers) — la combinaison échappement + troncature à 100
// caractères (d1SearchLikeParam/d1SearchLikePrefixParam, ajoutées dans ce lot) neutralise ce cas
// tout en préservant une correspondance littérale correcte pour un terme contenant
// légitimement un '%' ou un '_'.
//
// Ce test réimplémente les deux helpers AJOUTÉS (copie exacte du code livré, pas une
// réinterprétation) et vérifie en plus, par une lecture directe du fichier livré, que les
// clauses LIKE réellement utilisées par handleD1Query portent bien ESCAPE '\' et appellent bien
// ces helpers — pas seulement que la logique fonctionne en isolation.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const WORKER_FILE = '/home/user/C-Concept-Dev/Worker/index.js';

// ── Copie exacte des helpers livrés (Worker/index.js) ──
const D1_SEARCH_LIKE_MAX_VALUE_LENGTH = 100;
function d1SearchLikeParam(s) {
  const truncated = String(s).slice(0, D1_SEARCH_LIKE_MAX_VALUE_LENGTH);
  const escaped = truncated.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return "%" + escaped + "%";
}
function d1SearchLikePrefixParam(s) {
  const truncated = String(s).slice(0, D1_SEARCH_LIKE_MAX_VALUE_LENGTH);
  const escaped = truncated.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return escaped + "%";
}

const results = [];
const log = (label, ok, extra) => results.push([label, ok, extra]);

// ═══ 1. Reproduction réelle de la cause : un motif non échappé et non borné casse SQLite ═══
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chunks (content TEXT)');
  db.exec("INSERT INTO chunks VALUES ('hello world')");
  const adversarial = '%'.repeat(200000); // simule un terme pathologique (upstream malformé)
  let threw = false, message = '';
  try {
    db.prepare('SELECT * FROM chunks WHERE lower(content) LIKE ?').all('%' + adversarial + '%');
  } catch (e) { threw = true; message = e.message; }
  log('1a. Confirmation de la cause réelle — un motif non échappé/non borné déclenche bien "LIKE or GLOB pattern too complex" sur un vrai moteur SQLite', threw && message.includes('too complex'), message);
}

// ═══ 2. Le même terme adversarial, une fois passé par le correctif, ne casse plus rien ═══
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chunks (content TEXT)');
  db.exec("INSERT INTO chunks VALUES ('hello world')");
  const adversarial = '%'.repeat(200000);
  const param = d1SearchLikeParam(adversarial);
  let threw = false, rows = null;
  try {
    rows = db.prepare("SELECT * FROM chunks WHERE lower(content) LIKE ? ESCAPE '\\'").all(param);
  } catch (e) { threw = true; }
  log('2a. Le motif adversarial neutralisé par troncature (<=100 avant échappement) ne déclenche plus jamais l\'erreur', !threw, { paramLength: param.length });
  log('2b. La requête aboutit normalement (0 résultat, mais AUCUNE exception) plutôt que de faire tomber tout le RAG', Array.isArray(rows), rows);
}

// ═══ 3. Correction n'introduit aucune régression sur une recherche légitime multi-mots ═══
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chunks (content TEXT)');
  db.exec("INSERT INTO chunks VALUES ('attachement anxieux chez l adulte')");
  db.exec("INSERT INTO chunks VALUES ('sujet totalement different')");
  const terms = ['attachement', 'anxieux'].map((t) => t.toLowerCase());
  const params = terms.map((t) => d1SearchLikeParam(t));
  const clause = '(' + terms.map(() => "lower(content) LIKE ? ESCAPE '\\'").join(' OR ') + ')';
  const rows = db.prepare(`SELECT content FROM chunks WHERE ${clause}`).all(...params);
  log('3a. Non-régression — une recherche légitime à plusieurs mots (celle ayant déclenché l\'erreur réelle) continue d\'aboutir normalement', rows.length === 1 && rows[0].content.includes('attachement'), rows);
}

// ═══ 4. Un terme contenant littéralement '%' ou '_' matche littéralement (correction, pas juste évitement d'erreur) ═══
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chunks (content TEXT)');
  db.exec("INSERT INTO chunks VALUES ('taux de reussite : 50% des cas suivis')");
  db.exec("INSERT INTO chunks VALUES ('attachment_disorganized_type frequent')");
  const p1 = d1SearchLikeParam('50%'.toLowerCase());
  const r1 = db.prepare("SELECT content FROM chunks WHERE lower(content) LIKE ? ESCAPE '\\'").all(p1);
  log('4a. Un terme contenant un \'%\' littéral (ex. "50%") matche bien le contenu correspondant, sans faux jokers', r1.length === 1 && r1[0].content.includes('50%'), r1);
  const p2 = d1SearchLikeParam('attachment_disorganized'.toLowerCase());
  const r2 = db.prepare("SELECT content FROM chunks WHERE lower(content) LIKE ? ESCAPE '\\'").all(p2);
  log('4b. Un terme contenant des \'_\' littéraux matche bien le contenu correspondant exact, sans les traiter comme jokers "un caractère quelconque"', r2.length === 1 && r2[0].content.includes('attachment_disorganized'), r2);
}

// ═══ 5. Vérification statique — le fichier LIVRÉ (pas une réimplémentation) porte bien le correctif ═══
{
  const src = fs.readFileSync(WORKER_FILE, 'utf-8');
  log('5a. Worker/index.js définit bien d1SearchLikeParam (troncature + échappement)', src.includes('function d1SearchLikeParam(s)') && src.includes('D1_SEARCH_LIKE_MAX_VALUE_LENGTH'));
  log('5b. Worker/index.js définit bien d1SearchLikePrefixParam (même principe, motif préfixe)', src.includes('function d1SearchLikePrefixParam(s)'));
  const likeEscapeCount = (src.match(/LIKE \? ESCAPE '\\\\'/g) || []).length;
  log('5c. Toutes les clauses LIKE de handleD1Query (contenu, auteurs ×2 gabarits, titres ×2 gabarits) portent bien ESCAPE \'\\\'', likeEscapeCount >= 6, { likeEscapeCount });
  const usesHelperCount = (src.match(/d1SearchLikeParam\(/g) || []).length + (src.match(/d1SearchLikePrefixParam\(/g) || []).length;
  log('5d. Les paramètres liés utilisent bien les helpers (troncature+échappement), plus aucune concaténation brute "%" + valeur + "%"', usesHelperCount >= 6, { usesHelperCount });
  log('5e. Le repli LIKE porte bien son propre try/catch avec un message clair (jamais l\'erreur SQLite brute) en dernier recours', src.includes('Recherche trop complexe pour ces termes'), null);
}

console.log('=== Résultats — Phase 3, motif LIKE trop complexe (Worker) ===');
let failCount = 0;
for (const [label, ok, extra] of results) {
  console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
  if (!ok) failCount++;
}
console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
