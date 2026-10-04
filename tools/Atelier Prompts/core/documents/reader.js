/* Local document ingestion. No upload, no summarisation, no semantic decision.
 * Reading text is not understanding charts/layout; that distinction is surfaced in the UI. */
export const DOCUMENT_LIMITS = Object.freeze({ fileBytes: 40 * 1024 * 1024, pages: 300,
  textChars: 180000, archiveBytes: 32 * 1024 * 1024, imagePixels: 20000000 });
const asset = path => new URL(`./vendor/${path}`, import.meta.url).href;

/* PDF-SAFARI-01 — Safari does not iterate a ReadableStream, and PDF.js assumes it does.
 *
 * MEASURED, in the user's own Safari 26.3 (WebKit 605.1.15), on their own files:
 *   ReadableStream.prototype[Symbol.asyncIterator] -> undefined
 *   ReadableStream.prototype.values                -> undefined
 *   ReadableStream.prototype.getReader             -> function
 * Every PDF therefore died on its first page with
 *   TypeError: undefined is not a function (near '...value of readableStream...')
 *   at getTextContent (vendor/pdf/pdf.mjs:16040) <- extractDocument (reader.js)
 * because PDFPageProxy.getTextContent() consumes its own stream with
 * `for await (const value of readableStream)`. Chromium, Firefox and the WebKit build that
 * Playwright bundles all implement that iteration, which is exactly why the fault was invisible
 * to every automated engine and only ever showed up in real Safari.
 *
 * WHY A SHIM AND NOT A CHANGE OF CALL SITE. The alternative was to stop calling getTextContent()
 * and drain page.streamTextContent() ourselves. That would have moved the reader onto a less
 * public PDF.js method, duplicated the lang/styles assembly that getTextContent() already does,
 * and changed the contract every existing test of this reader is written against — a lot of
 * surface for a gap that is one missing standard method. Nothing is patched in the vendored
 * library, and no dependency is added or upgraded.
 *
 * WHAT IT INSTALLS. Exactly the WHATWG ReadableStream async iteration, and only when the engine
 * lacks it: a reader-backed iterator that releases its lock when the stream ends or throws, and
 * cancels on early exit unless preventCancel was asked for. On an engine that already has it this
 * function does nothing at all, so Chromium and Firefox keep their native implementation. */
export function installStreamAsyncIteration(target = typeof ReadableStream === 'function' ? ReadableStream : null) {
  if (!target || target.prototype[Symbol.asyncIterator]) return false;
  const values = function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    const iterator = {
      async next() {
        try {
          const result = await reader.read();
          if (result.done) reader.releaseLock();
          return result;
        } catch (error) { reader.releaseLock(); throw error; }
      },
      async return(value) {
        /* An early `break`, `return` or `throw` inside `for await` lands here: the stream must not
           stay locked, and it is cancelled unless the caller asked to keep it. */
        if (preventCancel) reader.releaseLock();
        else { const cancelled = reader.cancel(value); reader.releaseLock(); await cancelled; }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; }
    };
    return iterator;
  };
  target.prototype.values = values;
  target.prototype[Symbol.asyncIterator] = values;
  return true;
}
/* Installed on import, before any PDF is loaded: PDF.js reads the method off the prototype at the
   moment it iterates, so the shim only has to exist by then. */
installStreamAsyncIteration();
const fail = message => { throw new Error(message); };
function checkText(text) {
  if (text.length > DOCUMENT_LIMITS.textChars) fail('Texte trop long pour une analyse complète en un tour (180 000 caractères). Séparez le document en parties. Aucun extrait tronqué n’a été utilisé.');
  return text;
}
function aborted(signal) { if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError'); }
const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
function parseXML(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('Déclarations XML externes interdites.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (elements(doc, 'parsererror').length) fail('Document XML endommagé.');
  return doc;
}
function officeText(xml) {
  const doc = parseXML(xml);
  // Walk once: preserve paragraph, line and table boundaries without duplicating nested text.
  function walk(n) {
    if (n.nodeType === 3) return n.nodeValue;
    const tag = n.localName;
    if (['script', 'style', 'binary-data'].includes(tag)) return '';
    if (tag === 'tab') return '\t';
    if (['br', 'line-break'].includes(tag)) return '\n';
    const text = Array.from(n.childNodes || []).map(walk).join('');
    return text + (['p', 'h', 'tr', 'table-row'].includes(tag) ? '\n' : ['tc', 'table-cell'].includes(tag) ? '\t' : '');
  }
  return walk(doc).trim();
}
export async function readOffice(bytes, extension, unzip) {
  let declared = 0;
  const files = unzip(bytes, { filter(entry) {
    declared += entry.originalSize;
    if (declared > DOCUMENT_LIMITS.archiveBytes) fail('Archive bureautique décompressée trop volumineuse.');
    return /\.xml$/.test(entry.name) && !entry.name.includes('..');
  } });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const get = key => files[key] ? decoder.decode(files[key]) : null;
  let sections = [];
  if (extension === 'docx') {
    if (!get('word/document.xml')) fail('Document Word invalide ou chiffré.');
    const keys = ['word/document.xml', ...Object.keys(files).filter(k => /^word\/(footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(k)).sort()];
    sections = keys.map(k => `[${k}]\n${officeText(get(k))}`);
  } else if (extension === 'pptx') {
    const keys = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b) => Number(a.match(/(\d+)\.xml$/)[1])-Number(b.match(/(\d+)\.xml$/)[1]));
    if (!keys.length) fail('Présentation sans diapositive lisible.');
    sections = keys.map(k => `[${k}]\n${officeText(get(k))}`);
  } else if (extension === 'xlsx') {
    const shared = get('xl/sharedStrings.xml');
    const strings = shared ? elements(parseXML(shared), 'si').map(n => elements(n, 't').map(t => t.textContent).join('')) : [];
    const keys = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a,b) => Number(a.match(/(\d+)\.xml$/)[1])-Number(b.match(/(\d+)\.xml$/)[1]));
    if (!keys.length) fail('Classeur sans feuille lisible.');
    sections = keys.map(k => `[${k} — valeurs stockées, sans recalcul des formules ni mise en forme des dates]\n` + elements(parseXML(get(k)), 'row').map(row => elements(row, 'c').map(cell => {
      const value = elements(cell, 'v')[0]?.textContent || '';
      const type = cell.getAttribute('t');
      const formula = elements(cell, 'f')[0]?.textContent;
      const text = type === 's' ? strings[Number(value)] ?? '' : type === 'inlineStr' ? elements(cell, 't').map(n => n.textContent).join('') : value;
      return `${cell.getAttribute('r')}: ${text}${formula ? ` [formule: ${formula}]` : ''}`;
    }).join('\t')).join('\n'));
  } else {
    const content = get('content.xml');
    if (!content) fail('Document OpenDocument invalide ou chiffré.');
    sections = [officeText(content)];
  }
  return checkText(sections.join('\n\n'));
}

async function defaultOCR() {
  const { default: { createWorker } } = await import('./vendor/tesseract/tesseract.esm.min.js');
  return createWorker('fra+eng', 1, { workerPath: asset('tesseract/worker.min.js'),
    corePath: asset('tesseract/core'), langPath: asset('tesseract/lang'), workerBlobURL: false });
}
async function defaultPDF() {
  const pdf = await import('./vendor/pdf/pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc = asset('pdf/pdf.worker.mjs');
  return pdf;
}
export async function extractDocument(file, { signal, progress = () => {}, pdfLoader = defaultPDF,
  ocrFactory = defaultOCR, unzipLoader = () => import('./vendor/fflate.mjs') } = {}) {
  if (file.size > DOCUMENT_LIMITS.fileBytes) fail('Fichier supérieur à 40 Mo. Compressez-le ou séparez-le en parties.');
  aborted(signal);
  const extension = file.name.split('.').pop().toLowerCase();
  let ocr = null, ocrStarting = null, pdfTask = null;
  const cancel = () => { void pdfTask?.destroy(); void ocr?.terminate(); };
  signal?.addEventListener('abort', cancel, { once: true });
  const recognize = async image => {
    aborted(signal);
    if (!ocr) { ocrStarting ||= ocrFactory(); ocr = await ocrStarting; }
    aborted(signal);
    const result = await ocr.recognize(image);
    aborted(signal);
    if (result.data.text.trim() && result.data.confidence < 40) fail('Reconnaissance de texte trop incertaine. Fournissez un scan plus net ou le texte original.');
    return result.data.text.trim();
  };
  try {
    let text = '', pages = null, ocrPages = 0, images = null;
    if (extension === 'pdf' || file.type === 'application/pdf') {
      const pdfjs = await pdfLoader();
      aborted(signal);
      pdfTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
        cMapUrl: asset('pdf/cmaps/'), cMapPacked: true, standardFontDataUrl: asset('pdf/standard_fonts/'),
        wasmUrl: asset('pdf/wasm/'), useSystemFonts: true });
      // Password protected files must not wait indefinitely for an invisible password prompt.
      pdfTask.onPassword = () => { void pdfTask.destroy(); };
      const doc = await pdfTask.promise;
      pages = doc.numPages;
      if (pages > DOCUMENT_LIMITS.pages) fail('PDF supérieur à 300 pages. Séparez-le en parties.');
      const parts = []; let readable = false;
      /* DOC-MULTI-01 — COMBIEN D'IMAGES, ET RIEN DE PLUS. Ce compte sert à DIRE à la personne que
         le document porte des visuels que cette lecture n'interprète pas ; il ne décide rien.
         Il est relevé dans la boucle de pages déjà ouverte, sur la liste d'opérateurs que PDF.js
         produit de toute façon pour rendre la page — aucune seconde passe sur le document. Un
         chargeur injecté qui n'expose pas getOperatorList (les tests historiques) laisse `images`
         à null, et « non établi » n'est pas « zéro » : la classification les distingue. */
      const operateursImage = pdfjs.OPS ? [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageXObjectRepeat].filter(op => op !== undefined) : [];
      for (let n = 1; n <= pages; n++) {
        aborted(signal); progress(`Lecture du PDF : page ${n}/${pages}`);
        const page = await doc.getPage(n);
        try {
          const content = await page.getTextContent();
          if (operateursImage.length && typeof page.getOperatorList === 'function') {
            try {
              const operateurs = await page.getOperatorList();
              images = (images || 0) + (operateurs.fnArray || []).filter(op => operateursImage.includes(op)).length;
            } catch (error) { /* Une page dont les opérateurs ne se lisent pas ne rend pas le texte faux. */ }
          }
          let pageText = content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
          // Sparse pages can contain an image plus a page number: OCR the entire page too.
          if (pageText.length < 80) {
            progress(`Reconnaissance de texte : page ${n}/${pages}`);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2, Math.sqrt(DOCUMENT_LIMITS.imagePixels / (base.width * base.height)));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            try {
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              const recognized = await recognize(canvas);
              if (recognized) pageText = recognized;
              ocrPages++;
            } finally { canvas.width = canvas.height = 0; }
          }
          if(pageText.trim())readable=true;
          parts.push(`[Page ${n}/${pages}]\n${pageText || '[Page sans texte reconnu : le contenu visuel n’est pas interprété.]'}`);
          text = checkText(parts.join('\n\n'));
        } finally { page.cleanup(); }
      }
      if(!readable)fail('Aucun texte reconnu dans ce PDF. Les illustrations seules ne peuvent pas être analysées par ce lecteur.');
    } else if (['docx','pptx','xlsx','odt','ods','odp'].includes(extension)) {
      progress('Lecture du document bureautique…');
      const { unzipSync } = await unzipLoader();
      text = await readOffice(new Uint8Array(await file.arrayBuffer()), extension, unzipSync);
    } else if (['png','jpg','jpeg','webp','bmp'].includes(extension)) {
      progress('Reconnaissance du texte de l’image…');
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > DOCUMENT_LIMITS.imagePixels) fail('Image trop grande (20 millions de pixels maximum).');
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        try { canvas.getContext('2d').drawImage(bitmap, 0, 0); text = await recognize(canvas); ocrPages = 1; }
        finally { canvas.width = canvas.height = 0; }
      } finally { bitmap.close(); }
    } else if (['txt','md','json','csv','tsv','xml','html','htm','log'].includes(extension) || file.type?.startsWith('text/')) {
      text = await file.text();
      if (text.includes('\u0000') || text.includes('\ufffd')) fail('Encodage du texte non lisible. Réenregistrez-le en UTF-8.');
    } else fail('Format non pris en charge automatiquement. Exportez en PDF, DOCX, OpenDocument ou texte UTF-8.');
    aborted(signal); checkText(text);
    if (!text.trim()) fail('Aucun texte lisible trouvé. Fournissez le texte ou un scan plus net.');
    return { text, pages, ocrPages, images, notice: ocrPages ? 'Texte reconnu automatiquement (OCR), à vérifier. Les schémas et images ne sont pas interprétés.' : 'Texte extrait ; la mise en page, les schémas et les images ne sont pas interprétés.' };
  } catch (error) {
    aborted(signal);
    if (/password|Password|destroyed/.test(error?.message || '')) fail('PDF protégé par mot de passe ou interrompu. Fournissez une copie déverrouillée.');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await pdfTask?.destroy();
    if (ocr) await ocr.terminate();
  }
}
