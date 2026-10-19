// L'IDENTITÉ QUE LE RELAIS ANNONCE AU WORKER — mesurée, sans toucher au réseau.
//
// Pourquoi ce contrôle existe. Mesure de Christophe au curl, sans clé, sur la racine du Worker :
// l'identité « Python-urllib/3.12 » obtient un HTTP 403 — un refus de Cloudflare, AVANT le
// Worker — là où « Studio-Clinique-relais/1.0 » obtient un 401, qui est le refus normal du
// Worker pour une clé manquante. urllib envoie l'identité Python par défaut : le relais était
// donc arrêté à la porte, et le 403 n'avait rien à voir avec la clé ni avec le schéma.
//
// Ce contrôle NE SORT PAS DE LA MACHINE : il fait pointer le relais vers un FAUX Worker local,
// qui relève l'en-tête réellement reçu. Aucune clé, aucun appel réel.
//
//   node tests/verify-identite-relais.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const RELAIS = path.join(os.homedir(), 'Documents', 'Studio-Clinique-Outils', 'relais-essai-lot2c.py');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  // Le faux Worker : il ne fait que relever ce qu'on lui envoie.
  const recu = [];
  const faux = http.createServer((q, r) => {
    let corps = '';
    q.on('data', (c) => { corps += c; });
    q.on('end', () => {
      recu.push({ agent: q.headers['user-agent'], cle: q.headers['x-api-key'], octets: corps.length });
      r.writeHead(401, { 'content-type': 'application/json' });
      r.end('{"error":"faux worker : pas de cle"}');
    });
  });
  await new Promise((ok) => faux.listen(0, '127.0.0.1', ok));
  const portFaux = faux.address().port;

  // Le relais est lancé SANS CLÉ, et son adresse de Worker est détournée vers le faux, par une
  // copie temporaire hors du dépôt : on ne modifie jamais le relais lui-même pour le mesurer.
  const source = fs.readFileSync(RELAIS, 'utf8');
  // ── UN PORT À SOI, ET LA PREUVE QU'ON PARLE BIEN À SA PROPRE INSTANCE ──────────────────
  // Défaut réel, constaté ici : un relais de Christophe tournait déjà sur le port 8777, AVEC SA
  // VRAIE CLÉ. Ma copie n'a pas pu s'y attacher, mais mon attente de port a vu le sien — et ma
  // requête de contrôle est partie chez lui, qui l'a relayée au vrai Worker. Une requête réelle
  // non voulue. Le contrôle prend donc un port qu'il réserve lui-même, et refuse de continuer
  // s'il n'obtient pas exactement celui-là.
  const portRelais = await new Promise((ok) => {
    const t = net.createServer();
    t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => ok(p)); });
  });
  const copie = path.join(os.tmpdir(), 'relais-mesure-identite.py');
  fs.writeFileSync(copie, source
    .replace(/^WORKER = ".*"$/m, 'WORKER = "http://127.0.0.1:' + portFaux + '"')
    .replace(/^PORT = \d+$/m, 'PORT = ' + portRelais)
    // Sans clé, le relais refuse avant d'appeler : on lui en donne une factice pour qu'il
    // appelle vraiment — elle ne part que vers le faux Worker, sur cette machine.
    .replace('CLE = lire_la_cle()', 'CLE = "cle-factice-pour-la-mesure"'));

  const relais = require('node:child_process').spawn('python3', ['-u', copie],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let mort = null;
  relais.on('exit', (c) => { mort = c; });
  await new Promise((ok, ko) => { const d = Date.now(); (function essayer() {
    if (mort !== null) return ko(new Error('la copie du relais est morte (code ' + mort + ') — '
      + 'port déjà pris ? le contrôle refuse de parler à une instance qui n\'est pas la sienne'));
    const s = net.connect(portRelais, '127.0.0.1');
    s.on('connect', () => { s.destroy(); ok(); });
    s.on('error', () => { s.destroy();
      if (Date.now() - d > 20000) return ko(new Error('la copie du relais n\'a pas démarré'));
      setTimeout(essayer, 150); }); })(); });

  try {
    const reponse = await fetch('http://127.0.0.1:' + portRelais + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'X-API-Key': 'valeur-factice-du-navigateur',
                 'User-Agent': 'Mozilla/5.0 (faux navigateur de contrôle)' },
      body: JSON.stringify({ payload: { model: 'x' } }),
    });
    assert.equal(reponse.status, 401, 'le faux Worker doit répondre 401 : ' + reponse.status);
    assert.equal(recu.length, 1,
      'le FAUX Worker doit avoir reçu l\'appel — s\'il n\'a rien reçu, c\'est qu\'on parlait à '
      + 'une autre instance : ' + recu.length);
    const vu = recu[0];

    assert.equal(vu.agent, 'Studio-Clinique-relais/1.0',
      'l\'identité reçue doit être exactement celle du relais ; reçue : ' + JSON.stringify(vu.agent));
    pass('le Worker reçoit exactement « ' + vu.agent +' ».');

    assert.ok(!/python|urllib/i.test(vu.agent || ''),
      'l\'identité ne doit jamais contenir « Python » ni « urllib » : ' + JSON.stringify(vu.agent));
    pass('aucune trace de « Python-urllib » — c\'est ce que Cloudflare refusait en 403.');

    // Le relais n'est pas le navigateur : il ne doit jamais se faire passer pour lui.
    assert.ok(!/Mozilla|faux navigateur/i.test(vu.agent || ''),
      'l\'identité du navigateur ne doit JAMAIS être recopiée : ' + JSON.stringify(vu.agent));
    pass('l\'identité du navigateur n\'est pas recopiée : le relais dit qui il est.');

    // Et la clé factice du navigateur a bien été jetée, remplacée par celle du relais.
    assert.notEqual(vu.cle, 'valeur-factice-du-navigateur',
      'la valeur factice du navigateur ne doit jamais être transmise');
    pass('la valeur d\'accès du navigateur est jetée, remplacée par celle du relais.');
  } finally {
    relais.kill('SIGTERM');
    faux.close();
    try { fs.unlinkSync(copie); } catch (e) {}
  }
  console.log('\nPASS verify-identite-relais — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
