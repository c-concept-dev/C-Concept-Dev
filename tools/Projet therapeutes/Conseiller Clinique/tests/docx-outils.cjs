// OUTILS PARTAGÉS DES CONTRÔLES DU .docx — une seule implémentation, jamais deux.
//
// Trois contrôles s'en servent : verify-docx-reference (comparaison partie par partie),
// verify-docx-espaces-de-noms (la table des espaces de noms) et leur falsificateur. Les y
// dupliquer aurait laissé deux lectures du ZIP et deux extractions du générateur libres de
// divergeer en silence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const RACINE = path.join(__dirname, '..');
// LA RÉFÉRENCE VIT DANS LE DÉPÔT, à côté des contrôles. C'est une FIXTURE, une ENTRÉE de la
// mesure — jamais un fichier produit par une mesure. Contenu entièrement inventé, auteur
// « Studio Clinique », aucune donnée personnelle, 9 568 octets, fouillé avant d'être versionné.
const REFERENCE = path.join(__dirname, 'reference-texte-des-diapositives.docx');

// Le contenu de la référence, transcrit en structure — c'est la MÊME entrée, pas une approchante.
const STRUCTURE = { titre: 'Cinq pages pour un essai', diapositives: [
  { numero: 1, total: 4, titre: 'La parole autour de l’argent'.replace('’', "'"), elements: [
    { genre: 'etape', rang: 1, surRang: 3 },
    { genre: 'paragraph', texte: "Dans un couple, on parle de tout, mais rarement de ce que l'on dépense, gagne ou épargne." },
    { genre: 'etape', rang: 2, surRang: 3 },
    { genre: 'list', ordonnee: false, items: ["Les souvenirs d'enfance liés à l'argent",
      'Les peurs : manquer, dépendre, perdre le contrôle', 'Les attentes jamais dites à voix haute'] },
    { genre: 'etape', rang: 3, surRang: 3 },
    { genre: 'callout', texte: 'Un sujet intime, pas seulement un sujet de chiffres.' }] },
  { numero: 2, total: 4, titre: 'Trois temps pour en parler', elements: [
    { genre: 'etape', rang: 1, surRang: 2 },
    { genre: 'list', ordonnee: true, items: ['Choisir un moment calme',
      "Dire ce que l'on ressent, sans accuser", "Décider d'une petite action commune"] },
    { genre: 'etape', rang: 2, surRang: 2 },
    { genre: 'quote', texte: "« Ce n'est pas le montant qui blesse, c'est le silence autour. »" }] },
  { numero: 3, total: 4, titre: 'Caractères spéciaux & mise en garde <test>', elements: [
    { genre: 'etape', rang: 1, surRang: 1 },
    { genre: 'paragraph', texte: "Accents : é è ê à ù ç œ ; guillemets « français » ; apostrophe d'usage ; esperluette & ; chevrons < > ; tiret — long." }] },
  { numero: 4, total: 4, titre: 'Une diapositive sans étape détaillée', elements: [
    { genre: 'etape', rang: 1, surRang: 1 },
    { genre: 'paragraph', texte: 'Un seul paragraphe, donc une seule étape.' }] },
]};

function lireZip(octets) {
  let eocd = -1;
  for (let i = octets.length - 22; i >= 0; i--)
    if (octets[i] === 0x50 && octets[i + 1] === 0x4B && octets[i + 2] === 0x05 && octets[i + 3] === 0x06) { eocd = i; break; }
  const nb = octets.readUInt16LE(eocd + 10);
  let p = octets.readUInt32LE(eocd + 16);
  const parties = {};
  for (let k = 0; k < nb; k++) {
    const methode = octets.readUInt16LE(p + 10);
    const lNom = octets.readUInt16LE(p + 28), lExtra = octets.readUInt16LE(p + 30), lComm = octets.readUInt16LE(p + 32);
    const debutLocal = octets.readUInt32LE(p + 42);
    const nom = octets.slice(p + 46, p + 46 + lNom).toString('utf8');
    const d = debutLocal + 30 + octets.readUInt16LE(debutLocal + 26) + octets.readUInt16LE(debutLocal + 28);
    let donnees = octets.slice(d, d + octets.readUInt32LE(debutLocal + 18));
    if (methode === 8) donnees = zlib.inflateRawSync(donnees);
    parties[nom] = donnees.toString('utf8');
    p += 46 + lNom + lExtra + lComm;
  }
  return parties;
}

// Le générateur du cœur, extrait par ses bornes — c'est bien SON code qu'on juge.
function chargerGenerateur() {
  const src = fs.readFileSync(path.join(RACINE, 'studio-clinique-core.js'), 'utf8');
  const prendre = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d > 0, 'introuvable : ' + debut);
    const f = src.indexOf(fin, d); return src.slice(d, f + fin.length); };
  const code = [
    prendre('  var _adocCrcTable = null;', '\n  }'),
    prendre('  function adocZipStocke', '\n  }'),
    prendre('  function adocXmlEchappe', '\n  }'),
    prendre('  const ADOC_DOCX_NS', "standalone=\"yes\"?>\\n';"),
    prendre('  function adocDocxParagraphe', '\n  }'),
    prendre('  function adocDocxRun', '\n  }'),
    prendre('  function adocDocxCorps', '\n  }'),
    prendre('  function adocDocxParties', '\n  }'),
  ].join('\n').replace(/^  /gm, '');
  const bac = { console, TextEncoder, Uint8Array, Uint32Array, Math, Array, String, Number, JSON };
  bac.globalThis = bac;
  vm.runInNewContext(code + '\n;globalThis.__parties = adocDocxParties; globalThis.__zip = adocZipStocke;', bac);
  return bac;
}

// Le nom de la racine d'une partie XML et SON espace de noms — lus, jamais devinés. C'est
// exactement ce que mes anciens contrôles ne regardaient pas : ils vérifiaient que le XML était
// bien formé et que les relations pointaient vers des parties réelles, jamais sous quel espace
// de noms la racine était déclarée.
function racineXml(xml) {
  const s = String(xml);
  // On saute prologue et commentaires pour atteindre le PREMIER élément.
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) return null;
    if (s.startsWith('<?', lt)) { i = s.indexOf('?>', lt) + 2; continue; }
    if (s.startsWith('<!', lt)) { i = s.indexOf('>', lt) + 1; continue; }
    const gt = s.indexOf('>', lt);
    const brut = s.slice(lt + 1, gt).replace(/\/$/, '');
    const nom = brut.split(/[\s/]/)[0];
    const attrs = {};
    for (const m of brut.slice(nom.length).matchAll(/\s+([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
    // L'espace de noms de la racine : le préfixe s'il en porte un, sinon xmlns par défaut.
    const prefixe = nom.includes(':') ? nom.split(':')[0] : null;
    const ns = prefixe ? attrs['xmlns:' + prefixe] : attrs['xmlns'];
    return { nom: nom, ns: ns || null, attrs: attrs };
  }
  return null;
}

// Lit un .docx sur le disque et rend ses parties, texte par texte.
function lireDocx(chemin) { return lireZip(fs.readFileSync(chemin)); }

// Les parties que MON générateur produit, pour un contenu donné (la référence par défaut).
function mesParties(structure) {
  const bac = chargerGenerateur();
  const parties = {};
  bac.__parties(structure || STRUCTURE).forEach((p) => { parties[p.nom] = p.contenu; });
  return parties;
}

module.exports = { RACINE, REFERENCE, STRUCTURE, lireZip, lireDocx, chargerGenerateur,
  mesParties, racineXml };
