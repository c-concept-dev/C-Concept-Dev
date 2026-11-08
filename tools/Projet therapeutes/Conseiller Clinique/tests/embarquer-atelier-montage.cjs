const fs = require('node:fs');
const path = require('node:path');

const base = path.join(__dirname, '..');
const target = path.join(base, 'atelier-diapos.html');
const source = fs.readFileSync(path.join(base, 'atelier-montage.js'), 'utf8');
const muxer = fs.readFileSync(path.join(base, 'atelier-muxer.bundle.js'), 'utf8');
let html = fs.readFileSync(target, 'utf8');
const start = '<!-- atelier-montage:start -->';
const end = '<!-- atelier-montage:end -->';
const block = `${start}\n<script>\n${muxer.replace(/<\/script/gi, '<\\/script')}\n</script>\n<script>\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>\n${end}`;
if (html.includes(start)) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  if (b < 0) throw Error('Fin du montage introuvable');
  html = html.slice(0, a) + block + html.slice(b + end.length);
} else {
  const i = html.lastIndexOf('</body>');
  if (i < 0) throw Error('Balise body introuvable');
  html = html.slice(0, i) + block + '\n' + html.slice(i);
}
fs.writeFileSync(target, html);
console.log('Montage embarqué dans atelier-diapos.html');
