#!/usr/bin/env node
/**
 * Debug Scanner - Voir ce que Node.js détecte
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();

console.log('=== DEBUG SCANNER ===\n');
console.log('ROOT_DIR:', ROOT_DIR);
console.log('\n');

// Scanner tools/Outils
const outilsPath = path.join(ROOT_DIR, 'tools', 'Outils');

console.log('Scanning:', outilsPath);
console.log('Exists?', fs.existsSync(outilsPath));
console.log('\n');

if (fs.existsSync(outilsPath)) {
  const items = fs.readdirSync(outilsPath);
  console.log('Items found:', items.length);
  console.log('\n');
  
  items.forEach(item => {
    const fullPath = path.join(outilsPath, item);
    const stats = fs.statSync(fullPath);
    const isHTML = item.endsWith('.html');
    
    console.log('---');
    console.log('Item:', item);
    console.log('Is file?', stats.isFile());
    console.log('Is HTML?', isHTML);
    console.log('Size:', stats.size, 'bytes');
    
    if (stats.isFile() && isHTML) {
      console.log('✅ DEVRAIT ÊTRE DÉTECTÉ !');
    }
  });
}

// Test du pattern matching
console.log('\n\n=== TEST IGNORE PATTERNS ===\n');

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /^index\.html$/,
  /\.DS_Store/,
  /^\..*$/
];

const testItems = [
  'charte-graphique.html',
  '.DS_Store',
  'index.html',
  'vocal-prompt-genius-v6.2-ULTRA.html'
];

testItems.forEach(item => {
  const ignored = IGNORE_PATTERNS.some(pattern => pattern.test(item));
  console.log(item, '→', ignored ? '❌ IGNORÉ' : '✅ OK');
});
