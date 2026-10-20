// FAUX WORKER LOCAL, pour les contrôles de Q7 — jamais le vrai.
//
// Il conserve les documents et leurs versions EN MÉMOIRE, et imite trois propriétés du vrai
// Worker qui comptent pour Q7 :
//   — une version est IMMUABLE : on en ajoute, on n'en remplace jamais ;
//   — un pointeur « dernière version » désigne celle qu'on relit ;
//   — la clé d'accès est exigée (X-API-Key), comme en production.
//
// Il sert aussi les fichiers du dossier de travail, pour que la page se charge depuis la même
// origine — donc sans la moindre question d'origine croisée.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };

function creerFauxWorker(racine, options) {
  const opt = options || {};
  const etat = { documents: new Map(), appels: [], compteur: 0, panne: false, supprimes: new Set() };
  // HORLOGE PILOTABLE. Le vrai Worker date chaque version à l'instant de son écriture ; le faux
  // en fait autant par défaut. Mais pour mesurer un état comme « Sauvegardé le 19 oct. à
  // 14 h 32 », il faut pouvoir FIXER cette date : sans ça, le contrôle devrait deviner l'heure
  // qu'il vient lui-même de produire. `options.horloge` rend l'ISO à écrire ; on ne touche à
  // rien d'autre, et l'horodatage reste celui du SERVEUR, jamais du navigateur.
  const maintenant = () => (opt.horloge ? opt.horloge() : new Date().toISOString());
  const json = (r, code, corps) => { const t = JSON.stringify(corps);
    r.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); r.end(t); };

  const serveur = http.createServer((q, r) => {
    const url = new URL(q.url, 'http://127.0.0.1');
    const chemin = url.pathname;
    let corps = '';
    q.on('data', (c) => { corps += c; });
    q.on('end', () => {
      if (chemin.startsWith('/clinical-documents')) {
        etat.appels.push({ methode: q.method, chemin: chemin, cle: q.headers['x-api-key'] || null });
        if (!q.headers['x-api-key']) return json(r, 401, { error: 'cle manquante' });
        if (etat.panne) return json(r, 500, { error: 'panne simulee' });

        const m = chemin.match(/^\/clinical-documents\/([^/]+)(\/versions|\/thumbnail)?$/);
        // Liste — « Mes créations ».
        if (chemin === '/clinical-documents' && q.method === 'GET') {
          return json(r, 200, { documents: [...etat.documents.values()].map((d) => ({
            document_id: d.id, title: d.titre, updated_at: d.versions[d.versions.length - 1].quand,
            document_kind: d.kind })) });
        }
        // Création.
        if (chemin === '/clinical-documents' && q.method === 'POST') {
          const p = JSON.parse(corps || '{}');
          const id = 'doc-' + (++etat.compteur);
          const version = { id: 'v1', quand: maintenant(), charge: p };
          etat.documents.set(id, { id: id, titre: (p.document && p.document.title) || p.title || 'sans titre',
            kind: (p.document && p.document.documentKind) || null, versions: [version] });
          return json(r, 200, { document_id: id, version_id: 'v1', created_at: version.quand,
            generation_engine: 'structured' });
        }
        if (m) {
          const id = decodeURIComponent(m[1]);
          if (etat.supprimes.has(id)) return json(r, 404, { error: 'document supprime' });
          const d = etat.documents.get(id);
          if (!d) return json(r, 404, { error: 'inconnu' });
          // Nouvelle version — JAMAIS un remplacement.
          if (m[2] === '/versions' && q.method === 'POST') {
            const p = JSON.parse(corps || '{}');
            const v = { id: 'v' + (d.versions.length + 1), quand: maintenant(), charge: p };
            d.versions.push(v);
            d.titre = (p.document && p.document.title) || d.titre;
            return json(r, 200, { document_id: id, version_id: v.id,
              previous_version_id: d.versions[d.versions.length - 2].id,
              created_at: v.quand, generation_engine: 'structured' });
          }
          if (m[2] === '/thumbnail') return json(r, 200, { ok: true });
          if (q.method === 'DELETE') { etat.supprimes.add(id); etat.documents.delete(id); return json(r, 200, { ok: true }); }
          // Relecture — on rend TOUJOURS la version courante, dans la FORME DU VRAI WORKER
          // (Worker/index.js, route GET /clinical-documents/:id) : les champs du document, puis
          // un objet `version` qui porte `version_id`, `previous_version_id`, `created_at` et
          // `document`. C'est `version.created_at` qui date l'enregistrement.
          if (q.method === 'GET') {
            const v = d.versions[0];
            const i = d.versions.indexOf(v);
            return json(r, 200, {
              document_id: id, title: d.titre, document_kind: d.kind,
              created_at: d.versions[0].quand,
              current_version_id: v.id,
              version: { version_id: v.id,
                previous_version_id: i > 0 ? d.versions[i - 1].id : null,
                schema_version: 1, created_at: v.quand, change_summary: null,
                generation_engine: 'structured',
                document: (v.charge && v.charge.document) || v.charge },
            });
          }
        }
        return json(r, 404, { error: 'route inconnue' });
      }
      // Tout autre POST : réponse neutre (facettes, bibliothèque…).
      if (q.method === 'POST') return json(r, 200, {});
      const p = path.join(racine, decodeURIComponent(chemin));
      if (!p.startsWith(racine) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
  });
  return { serveur, etat };
}
module.exports = { creerFauxWorker };
