const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = readFileSync(path.join(__dirname, '../../tools/Projet therapeutes/bibliotheque-admin.html'), 'utf8');
const start = html.indexOf('function libraryTitleReviewReasons(');
const end = html.indexOf('function renderTitleReviewList(', start);
assert.ok(start > 0 && end > start, 'détecteur de titres à vérifier introuvable');

const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);

const reasons = context.libraryTitleReviewReasons;
assert.deepEqual(Array.from(reasons({ book_title: '05-Ngô', author: 'Ngô' })), ['nom de fichier probable']);
assert.deepEqual(Array.from(reasons({ book_title: 'Trauma ACT (z-library.sk, 1lib.sk)', author: 'Russ Harris' })), ['nom de domaine dans le titre']);
assert.deepEqual(Array.from(reasons({ book_title: 'ouvrage-final.pdf', author: 'Autrice' })), ['nom de fichier probable']);
assert.deepEqual(Array.from(reasons({ book_title: 'Un titre normal', author: 'Unknown' })), ['auteur à renseigner']);
assert.deepEqual(Array.from(reasons({ book_title: 'Un titre normal', author: '  ' })), ['auteur à renseigner']);
assert.deepEqual(Array.from(reasons({ book_title: 'Un titre normal', author: 'Autrice connue' })), []);

assert.match(html, /id="titleReviewPanel"/);
assert.match(html, /Titres à vérifier/);
assert.match(html, /renderTitleReviewList\(window\._libBooks\)/,
  'la liste doit être recalculée depuis les données réelles de /library-stats');

console.log('PASS S3 — détection ciblée et liste de vérification en lecture seule');
