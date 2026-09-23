// Reproducible local assets: no CDN or document upload at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copy = (from, to) => {
  const destination = path.join(root, 'core/documents/vendor', to);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, 'node_modules', from), destination, { recursive: true });
};
for (const name of ['pdf.mjs','pdf.worker.mjs']) copy(`pdfjs-dist/build/${name}`, `pdf/${name}`);
for (const name of ['cmaps','standard_fonts','wasm']) copy(`pdfjs-dist/${name}`, `pdf/${name}`);
copy('pdfjs-dist/LICENSE', 'pdf/LICENSE');
copy('fflate/esm/browser.js', 'fflate.mjs'); copy('fflate/LICENSE', 'fflate-LICENSE');
for (const name of ['tesseract.esm.min.js','worker.min.js','worker.min.js.LICENSE.txt']) copy(`tesseract.js/dist/${name}`, `tesseract/${name}`);
copy('tesseract.js/LICENSE.md', 'tesseract/LICENSE.md'); copy('tesseract.js-core/LICENSE', 'tesseract/core/LICENSE');
// Keep WASM binary separate: the loader expects a .wasm.js wrapper, but the
// upstream plain JS wrapper loads its matching .wasm file without embedded base64.
for (const name of fs.readdirSync(path.join(root, 'node_modules/tesseract.js-core')).filter(n => n.endsWith('.wasm'))) {
  // Emscripten resolves the binary relative to worker.min.js, not importScripts.
  copy(`tesseract.js-core/${name}`, `tesseract/${name}`);
  const obsolete = path.join(root, 'core/documents/vendor/tesseract/core', name);
  if (fs.existsSync(obsolete)) fs.unlinkSync(obsolete);
  copy(`tesseract.js-core/${name.replace(/\.wasm$/, '.js')}`, `tesseract/core/${name}.js`);
}
for (const lang of ['fra','eng']) {
  copy(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `tesseract/lang/${lang}.traineddata.gz`);
  copy(`@tesseract.js-data/${lang}/README.md`, `tesseract/lang/${lang}-README.md`);
}
console.log('Document readers and OCR assets built locally.');
