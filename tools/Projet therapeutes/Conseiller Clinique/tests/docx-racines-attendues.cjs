// LA TABLE DES RACINES ATTENDUES DU .docx — une seule, partagée par les contrôles.
//
// DEUX adresses très proches, et c'est tout l'enjeu du défaut du 20 octobre :
//   package/2006/relationships        → le CONTENEUR : le xmlns de la racine <Relationships>
//   officeDocument/2006/relationships → les TYPES : l'attribut Type= de chaque <Relationship>
// Une seule constante servait aux deux dans le générateur, et la racine portait l'adresse des
// types. Le validateur OOXML refusait la racine, LibreOffice ne rendait aucun PDF.
//
// Cette table est CONFRONTÉE À LA RÉFÉRENCE par verify-docx-espaces-de-noms : si elle se
// trompait, ce contrôle le dirait. Elle n'est donc pas une croyance, mais une affirmation
// vérifiable.
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const ATTENDU = {
  'word/document.xml':            { nom: 'w:document',        ns: W },
  'word/styles.xml':              { nom: 'w:styles',          ns: W },
  'word/numbering.xml':           { nom: 'w:numbering',       ns: W },
  '_rels/.rels':                  { nom: 'Relationships',     ns: PKG },
  'word/_rels/document.xml.rels': { nom: 'Relationships',     ns: PKG },
  '[Content_Types].xml':          { nom: 'Types',             ns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
  'docProps/core.xml':            { nom: 'cp:coreProperties', ns: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties' },
  'docProps/app.xml':             { nom: 'Properties',        ns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties' },
};

module.exports = ATTENDU;
module.exports.PKG = PKG;
module.exports.TYPE = TYPE;
