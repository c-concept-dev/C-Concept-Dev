const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const core = path.join(root, 'studio-clinique-core.js');
const schema = path.join(root, 'Schemas/block.schema.json');
const originals = new Map([[core, fs.readFileSync(core)], [schema, fs.readFileSync(schema)]]);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const run = file => spawnSync(process.execPath, [path.join(__dirname, file)], {
  cwd: root, env: process.env, encoding: 'utf8', timeout: 60000,
});
const mutations = [
  { name: 'rendu de couverture de carte', file: core,
    from: "adocImageDisplayStyle(card.content.imageDisplay, 'cover')", to: "''", test: 'verify-lot7-image-options.cjs' },
  { name: 'rendu de bloc image', file: core,
    from: "adocImageDisplayStyle(b.content.imageDisplay, 'image')", to: "''", test: 'verify-lot7-image-options.cjs' },
  { name: 'rendu de couverture de document', file: core,
    from: 'const display = coverBlock.content.imageDisplay;', to: 'const display = null;', test: 'verify-lot7-image-options.cjs' },
  { name: 'validation du réglage', file: schema,
    from: '"imageDisplay": {\n          "$ref": "#/$defs/imageDisplay"\n        }', to: '"imageDisplayXXX": {\n          "$ref": "#/$defs/imageDisplay"\n        }', test: 'verify-lot7-schema.cjs' },
];
try {
  for (const m of mutations) {
    const original = originals.get(m.file).toString();
    assert.ok(original.includes(m.from), m.name + ' : ancre absente');
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    try {
      const result = run(m.test);
      assert.notEqual(result.status, 0, m.name + ' : le contrôle n’a pas détecté la mutation');
      console.log('PASS mutation détectée : ' + m.name);
    } finally { fs.writeFileSync(m.file, originals.get(m.file)); }
  }
} finally {
  for (const [file, original] of originals) {
    fs.writeFileSync(file, original);
    assert.equal(sha(fs.readFileSync(file)), sha(original), file + ' non restauré');
  }
}
