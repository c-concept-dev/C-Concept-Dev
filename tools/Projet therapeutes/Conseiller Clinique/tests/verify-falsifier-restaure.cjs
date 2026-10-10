// LE FALSIFIEUR REND LES SOURCES, MÊME TUÉ.
//
// LE DÉFAUT QUE CE TEST REND IMPOSSIBLE, et il est arrivé deux fois le 9 octobre. Le falsifieur
// mute un fichier source, lance un test, puis remet le fichier. Entre les deux, le fichier du
// dépôt PORTE un défaut écrit exprès. Arrêté par un signal à cet instant précis, le processus
// meurt avant son `finally` et la mutation reste : une règle de capture retirée la première
// fois, la borne de vitesse du travelling désarmée la seconde. Dans les deux cas, le dépôt
// portait un défaut que personne n'avait écrit, et seul le contrôle des ancres l'a vu.
//
// CE TEST NE SIMULE RIEN. Il lance le VRAI falsifieur, attend qu'une mutation soit réellement en
// place dans un fichier (donc que la fenêtre dangereuse soit ouverte), le tue par SIGTERM, et
// compare les deux fichiers à l'empreinte prise avant le lancement. Un `finally` ne protège que
// des erreurs ; c'est le signal qu'il faut éprouver, et on ne l'éprouve qu'en l'envoyant.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-falsifier-restaure.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
// LES QUATRE SOURCES QUE LE FALSIFIEUR MUTE, dans le même ordre que sa propre table : le moteur,
// le cœur, la page du banc et l'application. Les quatre sont surveillées ici, et non les deux que
// j'avais d'abord écrites — un test qui ne regarde que la moitié des fichiers ne dit rien sur
// l'autre moitié.
const FICHIERS = {
  moteur: path.join(RACINE, 'atelier-images.js'),
  'cœur': path.join(RACINE, 'studio-clinique-core.js'),
  banc: path.join(__dirname, 'forger-banc-chutier.cjs'),
  appli: path.join(RACINE, 'studio-clinique.html'),
};
const JOURNAL = path.join(RACINE, 'banc-chutier', '.falsifieur-en-cours.json');
const ATTENTE_MAX_MS = 6 * 60 * 1000;      // le témoin du falsifieur tourne d'abord (~1 min)

const empreinte = (t) => crypto.createHash('sha256').update(t).digest('hex');
const avant = {};
Object.keys(FICHIERS).forEach((k) => { avant[k] = fs.readFileSync(FICHIERS[k], 'utf8'); });

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

function mute() {
  return Object.keys(FICHIERS).filter((k) => fs.readFileSync(FICHIERS[k], 'utf8') !== avant[k]);
}

(async () => {
  const fils = spawn(process.execPath, [path.join(__dirname, 'falsifier-atelier-images.cjs')],
    { cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'] });
  let journal = '';
  fils.stdout.on('data', (d) => { journal += d; });
  fils.stderr.on('data', (d) => { journal += d; });
  const fini = new Promise((ok) => fils.on('exit', (code, sig) => ok({ code, sig })));

  try {
    // ── 1. ATTENDRE QUE LA FENÊTRE SOIT OUVERTE : une mutation vraiment en place ─────────────
    const t0 = Date.now();
    let mutes = [];
    while (Date.now() - t0 < ATTENTE_MAX_MS) {
      mutes = mute();
      if (mutes.length) break;
      if (fils.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(mutes.length,
      'aucune mutation n\'a été observée en ' + Math.round((Date.now() - t0) / 1000) + ' s : '
      + 'ce test n\'éprouverait alors rien du tout. Fin du journal : ' + journal.slice(-400));
    pass('une mutation est bien en place dans ' + mutes.join(', ')
      + ' après ' + Math.round((Date.now() - t0) / 1000) + ' s — la fenêtre existe.');

    // ── 2. LE JOURNAL DE REPRISE EXISTE PENDANT LA FENÊTRE ──────────────────────────────────
    assert.ok(fs.existsSync(JOURNAL),
      'le journal de reprise doit exister dès la première mutation : ' + JOURNAL);
    pass('le journal de reprise est écrit avant la première mutation.');

    // ── 3. LE TUER PAR SIGKILL — le pire cas, celui qu'aucun code ne peut intercepter ────────
    // SIGTERM serait plus doux, mais il ne prouverait pas grand-chose : le falsifieur passe
    // l'essentiel de son temps bloqué dans `execFileSync`, où aucun gestionnaire de signal ne
    // peut s'exécuter. SIGKILL, lui, ne laisse RIEN tourner. Si le dépôt se retrouve intact
    // après un SIGKILL, il se retrouvera intact après n'importe quoi.
    fils.kill('SIGKILL');
    const sortie = await Promise.race([fini,
      new Promise((ok) => setTimeout(() => ok({ code: null, sig: 'PAS MORT' }), 15000))]);
    assert.notEqual(sortie.sig, 'PAS MORT', 'le falsifieur doit mourir sur SIGKILL');
    const apresMort = mute();
    assert.ok(apresMort.length,
      'après SIGKILL, la mutation DOIT être encore en place — sinon ce test n\'éprouve pas la '
      + 'reprise mais une restauration qui a eu le temps de se faire');
    pass('tué par SIGKILL avec ' + apresMort.join(', ') + ' encore muté : rien n\'a pu s\'exécuter.');

    // ── 4. UNE REPRISE REMET TOUT EN ÉTAT, À L'OCTET ─────────────────────────────────────────
    const reprise = execFileSync(process.execPath,
      [path.join(__dirname, 'falsifier-atelier-images.cjs'), '--reprise-seule'],
      { cwd: RACINE, encoding: 'utf8' });
    const restants = mute();
    assert.deepEqual(restants, [],
      'mutation RESTÉE EN PLACE après la reprise dans : ' + restants.join(', ')
      + ' — c\'est exactement le défaut du 9 octobre');
    Object.keys(FICHIERS).forEach((k) => {
      assert.equal(empreinte(fs.readFileSync(FICHIERS[k], 'utf8')), empreinte(avant[k]),
        k + ' : empreinte différente après reprise');
    });
    assert.match(reprise, /REPRISE —/, 'la reprise doit DIRE ce qu\'elle a remis : ' + reprise);
    assert.equal(fs.existsSync(JOURNAL), false, 'et effacer son journal');
    console.log('      ' + reprise.trim().split('\n').filter(Boolean).join(' | '));
    pass('les quatre sources sont rendues à l\'octet près, et le journal est effacé.');

    console.log('\nPASS verify-falsifier-restaure — ' + n + '/' + n + '.');
  } finally {
    // CEINTURE DU TEST LUI-MÊME : s'il échoue à mi-chemin, il ne laisse pas le dépôt muté.
    try { fils.kill('SIGKILL'); } catch (e) {}
    Object.keys(FICHIERS).forEach((k) => {
      try {
        if (fs.readFileSync(FICHIERS[k], 'utf8') !== avant[k]) {
          fs.writeFileSync(FICHIERS[k], avant[k], 'utf8');
          console.log('(le test a dû remettre ' + k + ' en état lui-même)');
        }
      } catch (e) {}
    });
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
