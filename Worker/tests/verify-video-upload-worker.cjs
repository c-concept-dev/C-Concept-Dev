const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { strict: assert } = require('node:assert');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../index.js'), 'utf8');
const start = source.indexOf('async function handleVideoAssetUpload(');
const end = source.indexOf('__name(handleVideoAssetUpload, "handleVideoAssetUpload");', start);
assert.ok(start >= 0 && end > start);
const code = source.slice(start, end);
let persisted = 0, inserted = null;
const sandbox = {
  module: { exports: {} }, Uint8Array, String, Number, URL, crypto, Response,
  json: (data, status = 200) => Response.json(data, { status }),
  jsonErr: (error, status) => Response.json({ error }, { status }),
  adocPersistVideoAsset: async (_env, bytes, mime) => {
    persisted++;
    assert.equal(mime, 'video/mp4');
    return { r2Key: 'video/test', deduplicated: false, sizeBytes: bytes.byteLength };
  },
};
vm.createContext(sandbox);
vm.runInContext(code + '\nmodule.exports = handleVideoAssetUpload;', sandbox);
const upload = sandbox.module.exports;
const env = {
  BRAND_ASSETS: {},
  DB: { prepare(sql) {
    assert.match(sql, /INSERT INTO video_links/);
    return { bind(...args) { inserted = args; return { async run() {} }; } };
  } },
};
async function request(bytes, title) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), 'essai.mp4');
  form.append('title', title);
  return new Request('https://studio.example/video-assets/upload', { method: 'POST', body: form });
}

(async () => {
  const invalid = await upload(await request(new Uint8Array([1, 2, 3]), 'Essai'), env);
  assert.equal(invalid.status, 415);
  assert.equal(persisted, 0);
  const missingTitle = await upload(await request(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]), ''), env);
  assert.equal(missingTitle.status, 400);
  const good = await upload(await request(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0]), 'Essai'), env);
  assert.equal(good.status, 200);
  const data = await good.json();
  assert.equal(persisted, 1);
  assert.equal(data.storage_type, 'cloudflare');
  assert.equal(data.url, 'https://studio.example/video-assets/' + data.id);
  assert.equal(inserted[1], data.url);
  assert.equal(inserted[2], 'Essai');
  assert.equal(inserted[3], 'video/test');
  console.log('PASS Worker import MP4 : signature, titre, persistance et bibliothèque');
})().catch(e => { console.error(e); process.exitCode = 1; });
