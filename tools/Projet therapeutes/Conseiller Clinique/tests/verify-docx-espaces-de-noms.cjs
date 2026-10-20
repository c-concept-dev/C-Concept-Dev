// Q2 — L'ESPACE DE NOMS DE LA RACINE DE CHAQUE PARTIE DU .docx.
//
// POURQUOI CE CONTRÔLE EXISTE. Les deux parties de relations (_rels/.rels et
// word/_rels/document.xml.rels) ont été écrites avec « .../officeDocument/2006/relationships »
// au lieu de « .../package/2006/relationships ». Les deux adresses existent et se ressemblent :
// la première est celle des TYPES de relation (l'attribut Type=), la seconde celle du
// CONTENEUR (le xmlns de la racine <Relationships>). Conséquences mesurées par Christophe : le
// validateur OOXML refuse la racine (« No matching global declaration available for the
// validation root »), LibreOffice ne rend aucun PDF, et Word proposera très probablement une
// réparation.
//
// Rien ne l'avait attrapé : mes contrôles vérifiaient que chaque partie était BIEN FORMÉE et
// que chaque relation pointait vers une partie RÉELLE — jamais sous quel espace de noms la
// racine était déclarée. Un XML peut être parfaitement bien formé et parfaitement refusé.
//
// Ce contrôle lit la racine de CHAQUE partie XML et la confronte à une table d'espaces de noms
// attendus. Et pour que la table elle-même ne puisse pas être fausse, elle est RECONFRONTÉE à
// la référence, partie par partie : une table qui divergerait de la référence validée fait
// échouer le contrôle.
//
//   node tests/verify-docx-espaces-de-noms.cjs
const assert = require('node:assert/strict');
const { REFERENCE, lireDocx, mesParties, racineXml } = require('./docx-outils.cjs');

let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// LA TABLE vit dans son propre fichier : les deux contrôles la partagent, il n'en existe qu'une.
const ATTENDU = require('./docx-racines-attendues.cjs');
const PKG = ATTENDU.PKG, TYPE = ATTENDU.TYPE;
const PARTIES = Object.keys(ATTENDU).filter((k) => k !== 'PKG' && k !== 'TYPE');

(() => {
  const ref = lireDocx(REFERENCE);
  const mien = mesParties();

  // ── 1. LA TABLE EST-ELLE JUSTE ? ──────────────────────────────────────────────────────
  // On la confronte à la référence AVANT de juger quoi que ce soit avec elle. Sinon une table
  // fausse validerait un fichier faux.
  const verifieesSurLaReference = [];
  for (const partie of PARTIES) {
    const attendu = ATTENDU[partie];
    if (ref[partie] === undefined) continue;
    const r = racineXml(ref[partie]);
    assert.ok(r, 'la référence : ' + partie + ' doit avoir une racine lisible');
    assert.equal(r.nom, attendu.nom,
      'ma table se trompe de racine pour ' + partie + ' : table « ' + attendu.nom
      + ' », référence « ' + r.nom + ' »');
    assert.equal(r.ns, attendu.ns,
      'ma table se trompe d\'espace de noms pour ' + partie + ' :\n    table     ' + attendu.ns
      + '\n    référence ' + r.ns);
    verifieesSurLaReference.push(partie);
  }
  pass('la table est confrontée à la référence : ' + verifieesSurLaReference.length + ' des '
    + PARTIES.length + ' parties y figurent et concordent — la table ne peut pas '
    + 'être fausse sans que ce contrôle le dise.');

  // ── 2. CHAQUE PARTIE DE MON FICHIER ───────────────────────────────────────────────────
  const fautes = [];
  for (const partie of PARTIES) {
    const attendu = ATTENDU[partie];
    if (mien[partie] === undefined) { fautes.push(partie + ' : ABSENTE de mon fichier'); continue; }
    const r = racineXml(mien[partie]);
    if (!r) { fautes.push(partie + ' : racine illisible'); continue; }
    if (r.nom !== attendu.nom) fautes.push(partie + ' : racine « ' + r.nom + ' » au lieu de « ' + attendu.nom + ' »');
    if (r.ns !== attendu.ns) fautes.push(partie + ' : espace de noms\n      attendu ' + attendu.ns + '\n      écrit   ' + r.ns);
  }
  if (fautes.length) {
    console.error('\nÉCHEC  ' + fautes.length + ' partie(s) hors de leur espace de noms :');
    fautes.forEach((f) => console.error('    ' + f));
    process.exit(1);
  }
  pass('les ' + PARTIES.length + ' parties portent la racine et l\'espace de noms attendus.');

  // ── 3. LES DEUX ADRESSES NE DOIVENT PAS ÊTRE CONFONDUES ───────────────────────────────
  // C'est la confusion exacte qui a causé le défaut : on l'interdit explicitement, dans les
  // deux sens.
  for (const partie of ['_rels/.rels', 'word/_rels/document.xml.rels']) {
    const r = racineXml(mien[partie]);
    assert.notEqual(r.ns, TYPE,
      partie + ' : la racine <Relationships> ne doit JAMAIS porter l\'espace de noms des TYPES '
      + '(' + TYPE + ') — c\'est le défaut trouvé le 20 octobre.');
    assert.equal(r.ns, PKG, partie + ' : la racine porte l\'espace de noms du CONTENEUR.');
    // Et les Type= doivent, eux, porter l'autre adresse : sans ça, « corriger » le xmlns en
    // changeant la constante partout aurait cassé les types sans que rien ne le dise.
    const types = [...String(mien[partie]).matchAll(/Type="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(types.length > 0, partie + ' : au moins une relation');
    types.forEach((t) => assert.ok(t.startsWith(TYPE + '/'),
      partie + ' : le Type « ' + t + ' » doit commencer par ' + TYPE + '/'));
    // Les cibles existent : on garde l'ancienne garantie, on ne la remplace pas.
    const prefixe = partie === '_rels/.rels' ? '' : 'word/';
    [...String(mien[partie]).matchAll(/Target="([^"]+)"/g)].forEach((m) => {
      assert.ok(mien[prefixe + m[1]] !== undefined,
        partie + ' : la cible « ' + m[1] + ' » doit être une partie réelle');
    });
  }
  pass('les deux parties de relations : conteneur et types sur les BONNES adresses, cibles réelles.');

  console.log('\nPASS verify-docx-espaces-de-noms — ' + n + ' contrôles.');
})();
