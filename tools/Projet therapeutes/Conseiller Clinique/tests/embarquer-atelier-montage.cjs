const fs = require('node:fs');
const path = require('node:path');

const base = path.join(__dirname, '..');
const target = path.join(base, 'atelier-diapos.html');
const html = fs.readFileSync(target, 'utf8');
if (!html.includes('<script src="atelier-montage.js"></script>')) {
  throw Error('La page autonome doit charger atelier-montage.js comme dépendance locale.');
}
if (!html.includes('<script src="atelier-muxer.bundle.js"></script>')) {
  throw Error('La page autonome doit charger le multiplexeur comme dépendance locale.');
}
console.log('Montage référencé par la page autonome — aucun ré-embarquage nécessaire.');
