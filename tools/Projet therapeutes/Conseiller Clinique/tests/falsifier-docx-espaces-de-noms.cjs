// FALSIFICATION DU CONTRÔLE DES ESPACES DE NOMS DU .docx.
//
// Le défaut du 20 octobre a traversé toute une livraison sans être vu. Un contrôle qui le
// rattrape aujourd'hui ne vaut que si l'on prouve qu'il ÉCHOUE quand on le remet. On remet donc
// le mauvais espace de noms dans UNE partie, puis dans L'AUTRE, puis dans les DEUX — trois
// mutations, car une seule aurait pu être rattrapée par hasard pendant que l'autre passait.
//
//   node tests/falsifier-docx-espaces-de-noms.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const COEUR = path.join(RACINE, 'studio-clinique-core.js');
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

// Les deux lignes qui écrivent la racine de chaque partie de relations. Mutation : remettre
// l'adresse des TYPES là où il faut celle du CONTENEUR.
const RELS = "    const rels = ADOC_DOCX_ENTETE + '<Relationships xmlns=\"' + R_CONTENEUR + '\">'";
const DOCRELS = "    const docRels = ADOC_DOCX_ENTETE + '<Relationships xmlns=\"' + R_CONTENEUR + '\">'";
const mauvais = (l) => l.replace('R_CONTENEUR', 'R_TYPE');

const MUTATIONS = [
  { nom: '_rels/.rels retrouve le mauvais espace de noms', lignes: [[RELS, mauvais(RELS)]] },
  { nom: 'word/_rels/document.xml.rels retrouve le mauvais espace de noms',
    lignes: [[DOCRELS, mauvais(DOCRELS)]] },
  { nom: 'les DEUX parties de relations à la fois',
    lignes: [[RELS, mauvais(RELS)], [DOCRELS, mauvais(DOCRELS)]] },
];

// Les contrôles qui DOIVENT échouer sous chacune de ces mutations.
const CONTROLES = ['verify-docx-espaces-de-noms.cjs', 'verify-docx-reference.cjs'];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = (f) => { try { execFileSync(process.execPath, [path.join('tests', f)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const original = fs.readFileSync(COEUR, 'utf8');
  const empreinte = sha(original);

  // Les ancres existent-elles, une fois et une seule ? Sans ça, une mutation qui ne mute rien
  // ferait croire à un contrôle solide.
  for (const a of [RELS, DOCRELS]) {
    const nb = original.split(a).length - 1;
    assert.equal(nb, 1, 'ancre absente ou multiple (' + nb + ') : ' + a.slice(0, 50));
  }
  console.log('2 ancres vérifiées, chacune présente une fois et une seule.\n');

  // Au départ, tout doit être vert : un falsificateur lancé sur un code déjà cassé ne prouverait
  // rien.
  for (const c of CONTROLES) assert.ok(lance(c), 'avant toute mutation, ' + c + ' doit être VERT');
  console.log('Avant mutation : les ' + CONTROLES.length + ' contrôles sont verts.\n');

  let trous = 0, conformes = 0;
  try {
    MUTATIONS.forEach((m, i) => {
      let mute = original;
      m.lignes.forEach(([de, vers]) => { mute = mute.replace(de, vers); });
      assert.notEqual(mute, original, m.nom + ' : la mutation n\'a rien changé');
      fs.writeFileSync(COEUR, mute);
      console.log('#' + (i + 1) + ' ' + m.nom);
      // Preuve directe : le fichier produit porte bien le mauvais espace de noms.
      delete require.cache[require.resolve('./docx-outils.cjs')];
      const parties = require('./docx-outils.cjs').mesParties();
      const faux = ['_rels/.rels', 'word/_rels/document.xml.rels']
        .filter((p) => !String(parties[p]).includes('xmlns="' + PKG + '"'));
      console.log('     parties réellement fautives : ' + (faux.join(', ') || 'aucune'));
      assert.ok(faux.length > 0, m.nom + ' : la mutation devait produire au moins une partie fautive');

      const survivants = CONTROLES.filter((c) => lance(c));
      if (survivants.length) {
        console.log('     TROU : ' + survivants.join(', ') + ' PASSE malgré la mutation');
        trous++;
      } else {
        console.log('     les ' + CONTROLES.length + ' contrôles ÉCHOUENT, comme ils le doivent');
        conformes++;
      }
    });
  } finally {
    fs.writeFileSync(COEUR, original);
    assert.equal(sha(fs.readFileSync(COEUR)), empreinte, 'le cœur doit être restauré à l\'identique');
    console.log('  ' + empreinte.slice(0, 16) + '  studio-clinique-core.js  restauré');
  }

  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-docx-espaces-de-noms');
})();
