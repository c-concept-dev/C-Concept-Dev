// Serveur statique minimal, uniquement pour les tests automatiques : le micro et les AudioWorklet
// exigent une origine sûre, et file:// n'en est pas une.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.wav':'audio/wav', '.png':'image/png', '.mp4':'video/mp4', '.css':'text/css; charset=utf-8' };
function servir(racine, port) {
  return new Promise((ok) => {
    const s = http.createServer((rq, rs) => {
      const p = decodeURIComponent((rq.url || '/').split('?')[0]);
      const f = path.join(racine, p === '/' ? '/index.html' : p);
      if (!f.startsWith(racine)) { rs.statusCode = 403; return rs.end('hors racine'); }
      fs.readFile(f, (e, d) => {
        if (e) { rs.statusCode = 404; return rs.end('absent : ' + p); }
        rs.setHeader('Content-Type', TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream');
        rs.end(d);
      });
    });
    s.listen(port || 0, '127.0.0.1', () => ok({ serveur: s, port: s.address().port }));
  });
}
module.exports = { servir };
