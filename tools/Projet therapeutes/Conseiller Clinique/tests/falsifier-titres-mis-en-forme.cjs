// FALSIFICATION DU LOT 2D-c (Q1) — huit mutations, chacune visant une façon précise de rompre
// la promesse « un titre mis en forme garde son apparence ».
//
// Le défaut a vécu en production : un titre mis en 20 pt revenait à sa taille d'avant, et rien
// ne le disait. Corriger ne vaut que si l'on prouve qu'en remettant chaque morceau du défaut,
// les contrôles ÉCHOUENT. Les mutations touchent le cœur, les SCHÉMAS et le validateur extrait
// du Worker — parce que ces trois-là peuvent trahir la promesse séparément.
//
//   NODE_PATH=<playwright> node tests/falsifier-titres-mis-en-forme.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const COEUR = path.join(RACINE, 'studio-clinique-core.js');
const PAGE = path.join(RACINE, 'studio-clinique.html');

const MUTATIONS = [
  { nom: 'l’éditeur n’écrit plus titleStyle (l’objet redevient jetable)',
    fichier: COEUR,
    de: '        set: function (v) { rootRef.styleSet(v); },',
    vers: '        set: function (v) { /* mutation : on jette */ },',
    attendu: 'le défaut d’origine : le style vit le temps de l’écran et meurt',
    controles: ['verify-titres-mis-en-forme.cjs'] },

  { nom: 'le rendu ignore titleStyle',
    fichier: COEUR,
    de: "    if (!titleStyle || !Object.keys(titleStyle).length) return '';",
    vers: "    if (true) return '';",
    attendu: 'le document garde le style, mais l’écran et les exports ne le montrent jamais',
    controles: ['verify-titres-mis-en-forme.cjs'] },

  { nom: 'la réouverture perd le style (le champ est effacé à la lecture)',
    fichier: COEUR,
    // Ancre ALLONGÉE : la première ligne seule apparaît deux fois (réouverture et sauvegarde).
    // La seconde ligne distingue la lecture (data.version.version_id) de l'écriture.
    de: '    art._adocClinicalDocumentId = data.document_id;\n    art._adocClinicalVersionId = data.version.version_id;',
    vers: '    art._adocClinicalDocumentId = data.document_id;\n    art._adocClinicalVersionId = data.version.version_id;\n'
      + '    try { delete data.version.document.clinicalDocument.titleStyle;\n'
      + '      (data.version.document.clinicalDocument.blocks || []).forEach(function (b) {\n'
      + '        if (b.content) delete b.content.titleStyle; }); } catch (e) {}',
    attendu: 'un autre ordinateur rouvrirait le document sans sa mise en forme',
    controles: ['verify-titres-mis-en-forme.cjs'] },

  { nom: 'un document SANS titleStyle est rendu différemment (migration cassée)',
    fichier: COEUR,
    de: "    if (!titleStyle || !Object.keys(titleStyle).length) return '';\n    const css = adocBlockStyleToCSSText(titleStyle, 'heading');",
    vers: "    if (!titleStyle || !Object.keys(titleStyle).length) return ' style=\"\"';\n    const css = adocBlockStyleToCSSText(titleStyle, 'heading');",
    attendu: 'tout document déjà sauvegardé changerait de rendu — la régression la plus sournoise',
    controles: ['verify-titres-mis-en-forme.cjs'] },

  { nom: 'le message honnête réapparaît pour un titre ENTIER',
    fichier: COEUR,
    de: "    adocEditorMessage(titreRacine && scope === 'selection'",
    vers: "    adocEditorMessage(titreRacine",
    attendu: 'on avertirait d’une perte qui n’existe plus : le mensonge inverse',
    controles: ['verify-titres-mis-en-forme.cjs', 'verify-message-style-titre.cjs'] },

  { nom: 'le message disparaît pour une PORTION de titre',
    fichier: COEUR,
    de: "    adocEditorMessage(titreRacine && scope === 'selection'\n      ? 'La mise en forme d’une partie du titre n’est pas conservée.'\n      : 'Modification appliquée.');",
    vers: "    adocEditorMessage('Modification appliquée.');",
    attendu: 'la mise en forme d’une portion se perdrait sans un mot — le défaut d’origine, déplacé',
    controles: ['verify-titres-mis-en-forme.cjs', 'verify-message-style-titre.cjs'] },

  { nom: 'le SCHÉMA refuse titleStyle (champ retiré des copies embarquées)',
    fichier: PAGE,
    de: '"titleStyle"',
    vers: '"titleStyleNeutralise"',
    tous: true,
    attendu: 'la sauvegarde serait refusée par AJV côté client, avant même le réseau',
    controles: ['verify-titres-mis-en-forme.cjs'] },

  { nom: 'le validateur du Worker refuserait un champ inconnu',
    fichier: COEUR,  // remplacé ci-dessous : cette mutation vise le contrôle du Worker
    simule: true,
    attendu: 'si le Worker devenait une liste blanche, titleStyle serait rejeté à la sauvegarde',
    controles: ['verify-worker-accepte-titlestyle.cjs'] },
];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lance = (f) => { try { execFileSync(process.execPath, [path.join('tests', f)],
  { cwd: RACINE, stdio: 'pipe' }); return true; } catch (e) { return false; } };

(() => {
  const originaux = new Map([[COEUR, fs.readFileSync(COEUR, 'utf8')],
                             [PAGE, fs.readFileSync(PAGE, 'utf8')]]);
  const empreintes = new Map([...originaux].map(([f, c]) => [f, sha(c)]));

  // Les ancres existent-elles, et une seule fois ? Une mutation qui ne mute rien ferait croire
  // à un contrôle solide.
  for (const m of MUTATIONS) {
    if (m.simule) continue;
    const nb = originaux.get(m.fichier).split(m.de).length - 1;
    if (m.tous) assert.ok(nb >= 2, m.nom + ' : ancre attendue plusieurs fois, vue ' + nb);
    else assert.equal(nb, 1, m.nom + ' : ancre absente ou multiple (' + nb + ')');
  }
  console.log(MUTATIONS.filter((m) => !m.simule).length + ' ancres vérifiées.\n');

  // Au départ, tout est vert : un falsificateur lancé sur un code déjà cassé ne prouve rien.
  for (const f of ['verify-titres-mis-en-forme.cjs', 'verify-message-style-titre.cjs',
                   'verify-worker-accepte-titlestyle.cjs']) {
    assert.ok(lance(f), 'avant toute mutation, ' + f + ' doit être VERT');
  }
  console.log('Avant mutation : les 3 contrôles sont verts.\n');

  let trous = 0, conformes = 0;
  try {
    MUTATIONS.forEach((m, i) => {
      console.log('#' + (i + 1) + ' ' + m.nom);
      console.log('     ' + m.attendu);
      if (m.simule) {
        // On ne mute pas Worker/index.js — jamais. On mute la COPIE que le contrôle extrait,
        // en neutralisant son extraction : si le validateur devenait une liste blanche, le
        // contrôle doit le dire. On le prouve en rendant l'extraction impossible.
        const c = fs.readFileSync(path.join(__dirname, 'verify-worker-accepte-titlestyle.cjs'), 'utf8');
        const mute = c.replace("'function adocValidateStructuredClinicalDocument(document, documentKind) {'",
          "'function adocValidateStructuredClinicalDocumentQUIN_EXISTE_PAS(document) {'");
        assert.notEqual(mute, c, 'la mutation simulée doit changer le contrôle');
        fs.writeFileSync(path.join(__dirname, 'verify-worker-accepte-titlestyle.cjs'), mute);
        const survivant = lance('verify-worker-accepte-titlestyle.cjs');
        fs.writeFileSync(path.join(__dirname, 'verify-worker-accepte-titlestyle.cjs'), c);
        if (survivant) { console.log('     TROU : le contrôle PASSE sans trouver le validateur'); trous++; }
        else { console.log('     le contrôle ÉCHOUE, comme il le doit'); conformes++; }
        return;
      }
      const src = originaux.get(m.fichier);
      fs.writeFileSync(m.fichier, m.tous ? src.split(m.de).join(m.vers) : src.replace(m.de, m.vers));
      const survivants = m.controles.filter((c) => lance(c));
      fs.writeFileSync(m.fichier, src);
      if (survivants.length) {
        console.log('     TROU : ' + survivants.join(', ') + ' PASSE malgré la mutation');
        trous++;
      } else {
        console.log('     les ' + m.controles.length + ' contrôle(s) visé(s) ÉCHOUENT, comme ils le doivent');
        conformes++;
      }
    });
  } finally {
    for (const [f, c] of originaux) {
      fs.writeFileSync(f, c);
      assert.equal(sha(fs.readFileSync(f)), empreintes.get(f), path.basename(f) + ' doit être restauré');
      console.log('  ' + empreintes.get(f).slice(0, 16) + '  ' + path.basename(f) + '  restauré');
    }
  }

  console.log('\n' + MUTATIONS.length + ' mutations · ' + conformes + ' conformes · ' + trous + ' trou(s)');
  if (trous) process.exit(1);
  console.log('\nPASS falsifier-titres-mis-en-forme');
})();
