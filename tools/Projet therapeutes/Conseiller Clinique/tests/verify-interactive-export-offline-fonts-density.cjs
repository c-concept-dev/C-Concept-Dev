#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'studio-clinique-core.js'), 'utf8');

assert.match(src, /async function adocEmbedExportFonts\(doc, art\)/,
  'le moteur doit disposer d’un embarquement typographique dédié');
assert.match(src, /data-adoc-fonts-offline="true"/,
  'les feuilles embarquées doivent être identifiables dans le fichier autonome');
assert.match(src, /'data:' \+ mime \+ ';base64,'/,
  'les fichiers de police doivent devenir des URL data: base64');
assert.match(src, /embedFonts: true/,
  'le bouton de production doit demander explicitement les polices hors ligne');
assert.match(src, /adocPdfBrandFontResource\(art, entry\.name\)/,
  'les fichiers de police des chartes importées doivent réutiliser le mécanisme d’asset existant');
assert.match(src, /polices\.html \+ '<title>'/,
  'l’export autonome doit écrire les polices résolues, pas les anciens liens en parallèle');
assert.match(src, /async function adocMesurerDensitePresentation\(doc\)/,
  'la densité doit être mesurée par une fonction dédiée');
assert.match(src, /width:' \+ ADOC_PRESENT_REF_W \+ 'px;height:' \+ ADOC_PRESENT_REF_H/,
  'la mesure doit utiliser le canevas fixe de la présentation');
assert.match(src, /carte\.scrollHeight - carte\.clientHeight/,
  'l’avertissement doit reposer sur le débordement rendu réel');
assert.match(src, /Continuer l\\'export avec ce défilement \?/,
  'l’utilisatrice doit pouvoir annuler avant l’export d’une présentation dense');

const densityPos = src.indexOf('const denses = await adocMesurerDensitePresentation(doc)');
const buildPos = src.indexOf('const html = await adocBuildStandalonePresentationHTML(doc, {', densityPos);
assert.ok(densityPos !== -1 && buildPos > densityPos,
  'la densité doit être vérifiée avant la construction et les téléchargements de l’export');

console.log('OK — polices hors ligne et avertissement de densité branchés');
