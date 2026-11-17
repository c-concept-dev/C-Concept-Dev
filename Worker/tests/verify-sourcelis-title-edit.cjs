const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = readFileSync(path.join(__dirname, '../../tools/Projet therapeutes/bibliotheque-admin.html'), 'utf8');

// S1 — la fenêtre d'édition expose le titre et impose les mêmes bornes côté client
// que la route Worker. Ce contrôle lit le vrai HTML livré, jamais une copie du formulaire.
assert.match(html, /<label[^>]*for="edit-title"[^>]*>Titre<\/label>/, 'champ Titre étiqueté attendu');
assert.match(html, /<input[^>]*id="edit-title"[^>]*maxlength="300"[^>]*required/, 'titre requis, limité à 300 caractères');
assert.match(html, /const bookTitle = document\.getElementById\('edit-title'\)\.value\.trim\(\)/,
  'le titre envoyé doit être débarrassé de ses espaces de bord');
assert.match(html, /if \(!bookTitle \|\| bookTitle\.length > 300\)/,
  'validation explicite non vide et 300 caractères maximum attendue');
assert.match(html, /JSON\.stringify\(\{ book_id: bookId, book_title: bookTitle, approach, author, language \}\)/,
  'book_title validé doit être envoyé à /update-book-meta');

console.log('PASS S1 — champ Titre prérempli, borné, nettoyé et transmis');
