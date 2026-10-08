// LIRE LE DOCUMENT EMBARQUÉ DANS UN EXPORT AUTONOME, côté Node.
//
// La page du banc porte sa propre copie de cet extracteur (elle tourne dans le navigateur, sans
// `require`). Les deux emploient le même appariement d'accolades, qui respecte les chaînes :
// une recherche naïve de la dernière accolade couperait au premier « } » d'un texte de
// diapositive. Si l'un des deux change, l'autre doit suivre — d'où ce commentaire.
//
// Rien de ce qui est lu ici n'entre dans le dépôt : les exports de Christophe vivent dans
// banc-chutier/, qui est ignoré par git.
const fs = require('node:fs');

function extraireObjet(source, nom) {
  const depart = source.indexOf(nom);
  if (depart === -1) return null;
  const i = source.indexOf('{', depart);
  if (i === -1) return null;
  let profondeur = 0, dansChaine = null;
  const echap = String.fromCharCode(92);
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (dansChaine) {
      if (c === echap) { j++; continue; }
      if (c === dansChaine) dansChaine = null;
      continue;
    }
    if (c === '"' || c === "'") { dansChaine = c; continue; }
    if (c === '{') profondeur++;
    else if (c === '}') { profondeur--; if (profondeur === 0) return source.slice(i, j + 1); }
  }
  return null;
}

function lireExport(chemin) {
  const texte = fs.readFileSync(chemin, 'utf8');
  const brutDoc = extraireObjet(texte, 'window.ADOC_EXPORT_DOC');
  if (!brutDoc) throw new Error(chemin + ' ne porte pas de document embarqué.');
  const doc = JSON.parse(brutDoc);
  if (doc.documentKind !== 'presentation') {
    throw new Error('l\'export embarque un « ' + doc.documentKind + ' », pas une Présentation.');
  }
  let images = {};
  const brutImages = extraireObjet(texte, 'window.ADOC_EXPORT_IMAGES');
  if (brutImages) { try { images = JSON.parse(brutImages); } catch (e) { images = {}; } }
  return { doc, images };
}

module.exports = { lireExport, extraireObjet };
