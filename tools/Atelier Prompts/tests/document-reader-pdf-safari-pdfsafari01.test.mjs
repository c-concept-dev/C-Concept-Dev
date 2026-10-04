/* PDF-SAFARI-01 — LA LECTURE PDF LOCALE ÉCHOUAIT DANS SAFARI, ET NULLE PART AILLEURS
 * ============================================================================
 *
 * MESURÉ dans le Safari de la personne (26.3, WebKit 605.1.15), sur ses propres fichiers, par
 * safaridriver : tout PDF mourait à sa première page avec
 *
 *   TypeError: undefined is not a function (near '...value of readableStream...')
 *     at getTextContent (vendor/pdf/pdf.mjs:16040)  <-  extractDocument (reader.js:116)
 *
 * parce que `PDFPageProxy.getTextContent()` consomme son propre flux avec
 * `for await (const value of readableStream)`, et que Safari n'implémente ni
 * `ReadableStream.prototype[Symbol.asyncIterator]` ni `ReadableStream.prototype.values`.
 * Relevé dans ce même Safari : asyncIterator = undefined, values = undefined, getReader = function.
 *
 * POURQUOI AUCUN TEST NE L'AVAIT VU, ET POURQUOI CELUI-CI LE VOIT. Les tests du lecteur injectent
 * un `pdfLoader` dont les pages exposent directement `getTextContent` : le flux, et donc son
 * itération, n'existaient jamais. Chromium, Firefox ET le WebKit embarqué par Playwright
 * implémentent tous cette itération — le défaut était donc invisible à tous les moteurs
 * automatisables, et ne se voyait que dans le vrai Safari. Ce fichier fait deux choses que les
 * tests existants ne faisaient pas : son faux PDF.js REPRODUIT le vrai `getTextContent` (il crée un
 * ReadableStream et le parcourt avec `for await`), et il joue ce chemin sur un moteur rendu
 * SEMBLABLE À SAFARI en retirant l'itération asynchrone de ReadableStream.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { extractDocument, readOffice, installStreamAsyncIteration } from '../core/documents/reader.js';
globalThis.DOMParser = DOMParser;

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Rend le moteur courant SEMBLABLE À SAFARI 26.3 : getReader reste, l'itération disparaît. */
function sansIterationDeFlux(corps) {
  const iterateur = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  const values = Object.getOwnPropertyDescriptor(ReadableStream.prototype, 'values');
  delete ReadableStream.prototype[Symbol.asyncIterator];
  delete ReadableStream.prototype.values;
  assert.equal(ReadableStream.prototype[Symbol.asyncIterator], undefined, 'le moteur simulé n’itère plus');
  assert.equal(typeof ReadableStream.prototype.getReader, 'function', 'mais il sait toujours lire');
  const rendre = () => {
    delete ReadableStream.prototype[Symbol.asyncIterator];
    delete ReadableStream.prototype.values;
    if (iterateur) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, iterateur);
    if (values) Object.defineProperty(ReadableStream.prototype, 'values', values);
  };
  const sortie = corps();
  return sortie && typeof sortie.then === 'function'
    ? sortie.then(v => { rendre(); return v; }, e => { rendre(); throw e; })
    : (rendre(), sortie);
}

/** Un PDF.js factice dont getTextContent est celui de la vraie bibliothèque : un flux, parcouru. */
function pdfjsCommeLeVrai(pages, { texte = n => `PAGE_${n} ` + 'texte '.repeat(30), suite = '(suite)' } = {}) {
  const compte = { nettoyees: 0, detruits: 0, flux: 0, rendus: 0 };
  const loader = async () => ({
    getDocument: () => ({
      destroy: async () => { compte.detruits++; },
      promise: Promise.resolve({
        numPages: pages,
        getPage: async n => ({
          /* La forme réelle : sendWithStream rend un ReadableStream de morceaux. */
          streamTextContent() {
            compte.flux++;
            return new ReadableStream({ start(c) {
              c.enqueue({ items: [{ str: texte(n), hasEOL: true }], styles: { s1: {} }, lang: 'fr' });
              c.enqueue({ items: [{ str: suite, hasEOL: false }], styles: {}, lang: null });
              c.close();
            } });
          },
          /* Et la vraie implémentation de PDF.js, mot pour mot dans sa mécanique. */
          async getTextContent() {
            const readableStream = this.streamTextContent();
            const textContent = { items: [], styles: Object.create(null), lang: null };
            for await (const value of readableStream) {
              textContent.lang ??= value.lang;
              Object.assign(textContent.styles, value.styles);
              textContent.items.push(...value.items);
            }
            return textContent;
          },
          /* Le repli OCR du lecteur rend la page avant de la reconnaître : ces deux méthodes
             existent sur la vraie PDFPageProxy, et manquer l'une faisait échouer ce test pour une
             raison qui n'était pas celle qu'il mesure. */
          getViewport({ scale = 1 } = {}) { return { width: 600 * scale, height: 800 * scale }; },
          render() { compte.rendus++; return { promise: Promise.resolve() }; },
          cleanup() { compte.nettoyees++; }
        })
      })
    })
  });
  return { loader, compte };
}

const sansOCR = () => { throw new Error('OCR inattendu'); };

/** Le strict nécessaire pour que le repli OCR du lecteur s'exécute hors navigateur. */
function avecCanvas(corps) {
  const avant = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
  const rendre = () => { if (avant === undefined) delete globalThis.document; else globalThis.document = avant; };
  const sortie = corps();
  return sortie && typeof sortie.then === 'function'
    ? sortie.then(v => { rendre(); return v; }, e => { rendre(); throw e; })
    : (rendre(), sortie);
}

// =================================================================================================
// LE DÉFAUT, ET SA CORRECTION
// =================================================================================================

test('PDF-SAFARI-01-01 · MOTEUR_SANS_ITERATION : le relevé de Safari 26.3 est reproduit, et le défaut aussi', async () => {
  /* Sans le correctif, le chemin réel de PDF.js lève EXACTEMENT l'erreur rapportée. C'est ce test
     qui prouve que la régression ajoutée ici aurait attrapé le défaut d'origine. */
  const { loader } = pdfjsCommeLeVrai(2);
  const erreur = await sansIterationDeFlux(async () => {
    const page = (await (await loader()).getDocument().promise).getPage(1);
    try { await (await page).getTextContent(); return null; } catch (e) { return e; }
  });
  assert.ok(erreur, 'le chemin PDF.js échoue sur un moteur sans itération de flux');
  assert.equal(erreur.constructor.name, 'TypeError');
  assert.match(erreur.message, /is not a function|is not iterable|not async iterable/i,
    'et il échoue pour la raison relevée dans Safari : la méthode d’itération manque');
});

test('PDF-SAFARI-01-02 · CORRECTIF : sur ce même moteur, le correctif rétablit l’itération, et le PDF est lu', async () => {
  const { loader, compte } = pdfjsCommeLeVrai(3);
  const sortie = await sansIterationDeFlux(async () => {
    assert.equal(installStreamAsyncIteration(), true, 'le correctif s’installe là où l’API manque');
    return extractDocument(new File(['pdf'], 'charte.pdf'), { pdfLoader: loader, ocrFactory: sansOCR });
  });
  assert.equal(sortie.pages, 3);
  assert.equal(sortie.ocrPages, 0, 'du texte existe : aucun OCR ne doit se déclencher');
  assert.match(sortie.notice, /Texte extrait/);
  assert.ok(sortie.text.includes('PAGE_1 ') && sortie.text.includes('PAGE_3 '));
  assert.ok(sortie.text.includes('(suite)'), 'tous les morceaux du flux sont consommés, pas seulement le premier');
  assert.equal(compte.flux, 3); assert.equal(compte.nettoyees, 3); assert.equal(compte.detruits, 1);
});

test('PDF-SAFARI-01-03 · AUCUN_MESSAGE_DE_PANNE : plus jamais « undefined is not a function » sur ce chemin', async () => {
  const { loader } = pdfjsCommeLeVrai(2);
  const sortie = await sansIterationDeFlux(async () => {
    installStreamAsyncIteration();
    return extractDocument(new File(['pdf'], 'charte.pdf'), { pdfLoader: loader, ocrFactory: sansOCR });
  });
  assert.equal(/undefined is not a function/.test(sortie.text), false);
  assert.match(sortie.text, /\[Page 1\/2\]/);
});

test('PDF-SAFARI-01-04 · MULTIPAGE : l’ordre des pages est conservé sur un moteur sans itération', async () => {
  const { loader } = pdfjsCommeLeVrai(12);
  const sortie = await sansIterationDeFlux(async () => {
    installStreamAsyncIteration();
    return extractDocument(new File(['pdf'], 'long.pdf'), { pdfLoader: loader, ocrFactory: sansOCR });
  });
  assert.equal(sortie.pages, 12);
  const positions = Array.from({ length: 12 }, (_, i) => sortie.text.indexOf(`PAGE_${i + 1} `));
  assert.equal(positions.some(p => p < 0), false, 'les douze pages sont présentes');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'et dans l’ordre');
});

// =================================================================================================
// CE QUE LE CORRECTIF FAIT, ET CE QU'IL NE FAIT PAS
// =================================================================================================

test('PDF-SAFARI-01-05 · NO_OP_AILLEURS : là où l’itération existe, rien n’est remplacé', () => {
  const natif = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  assert.ok(natif, 'ce moteur-ci possède l’itération nativement');
  assert.equal(installStreamAsyncIteration(), false, 'le correctif ne s’installe pas');
  assert.deepEqual(Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator), natif,
    'et l’implémentation native est intacte — Chromium et Firefox gardent la leur');
  /* Appelé sur une cible absente, il ne tente rien. */
  assert.equal(installStreamAsyncIteration(null), false);
});

test('PDF-SAFARI-01-06 · VERROU_ET_ANNULATION : une sortie anticipée libère le flux et l’annule', async () => {
  await sansIterationDeFlux(async () => {
    installStreamAsyncIteration();
    let annule = null;
    const flux = new ReadableStream({
      start(c) { c.enqueue(1); c.enqueue(2); },
      cancel(raison) { annule = raison ?? 'annulé'; }
    });
    for await (const v of flux) { assert.equal(v, 1); break; }   /* sortie anticipée */
    assert.ok(annule !== null, 'le flux est annulé, pas abandonné verrouillé');
    assert.equal(flux.locked, false, 'et le verrou est rendu : le flux reste utilisable');
    /* preventCancel, tel que la spécification le prévoit : on relâche sans annuler. */
    let annule2 = null;
    const flux2 = new ReadableStream({ start(c) { c.enqueue('a'); }, cancel() { annule2 = true; } });
    const it = flux2.values({ preventCancel: true });
    await it.next(); await it.return();
    assert.equal(annule2, null); assert.equal(flux2.locked, false);
  });
});

test('PDF-SAFARI-01-07 · ERREUR_PROPAGEE : une erreur du flux remonte telle quelle, verrou rendu', async () => {
  await sansIterationDeFlux(async () => {
    installStreamAsyncIteration();
    const flux = new ReadableStream({ start(c) { c.error(new Error('flux rompu')); } });
    await assert.rejects(async () => { for await (const v of flux) void v; }, /flux rompu/);
    assert.equal(flux.locked, false);
  });
});

// =================================================================================================
// LE CONTRAT EXISTANT, INCHANGÉ
// =================================================================================================

test('PDF-SAFARI-01-08 · DOCX_NON_REGRESSE : le chemin bureautique ne passe par aucun flux', async () => {
  const bytes = zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="word"><w:p><w:r><w:t>Bilan</w:t></w:r></w:p></w:document>') });
  const texte = await sansIterationDeFlux(() => readOffice(bytes, 'docx', unzipSync));
  assert.match(texte, /Bilan/, 'il est lu même sur un moteur sans itération de flux');
  const sortie = await extractDocument(new File([bytes], 'synthese.docx'));
  assert.match(sortie.notice, /Texte extrait/);
  assert.equal(sortie.pages, null);
});

test('PDF-SAFARI-01-09 · ECHEC_CLAIR : un PDF illisible reste un refus explicite, jamais un silence', async () => {
  /* Aucune page lisible : le message doit dire ce qui s'est passé, et le document ne doit pas
     passer en silence. Contrat d'origine, revérifié sur un moteur sans itération. */
  const { loader, compte } = pdfjsCommeLeVrai(1, { texte: () => '', suite: '' });
  await sansIterationDeFlux(() => avecCanvas(async () => {
    installStreamAsyncIteration();
    await assert.rejects(
      extractDocument(new File(['pdf'], 'scan.pdf'), { pdfLoader: loader, ocrFactory: async () => ({
        recognize: async () => ({ data: { text: '', confidence: 0 } }), terminate: async () => {} }) }),
      /Aucun texte reconnu dans ce PDF/);
    assert.equal(compte.rendus, 1, 'le repli OCR a bien été tenté avant de refuser');
  }));
  /* Et un chargement impossible reste une erreur, pas un document vide. */
  await assert.rejects(extractDocument(new File(['pas un pdf'], 'casse.pdf'),
    { pdfLoader: async () => ({ getDocument: () => ({ destroy: async () => {},
      promise: Promise.reject(new Error('Invalid PDF structure')) }) }) }), /Invalid PDF structure/);
});

test('PDF-SAFARI-01-10 · PERIMETRE : la bibliothèque vendorée n’est pas retouchée, et rien n’est ajouté', () => {
  /* Le correctif vit dans NOTRE fichier. PDF.js garde son code d'origine, y compris la boucle
     fautive : c'est le moteur qu'on complète, pas la bibliothèque qu'on corrige. */
  const pdfjs = fs.readFileSync(path.join(racine, 'core/documents/vendor/pdf/pdf.mjs'), 'utf8');
  assert.match(pdfjs, /for await \(const value of readableStream\)/, 'la boucle de PDF.js est intacte');
  assert.equal(/PDF-SAFARI/.test(pdfjs), false, 'aucune marque de ce lot dans la bibliothèque vendorée');
  const reader = fs.readFileSync(path.join(racine, 'core/documents/reader.js'), 'utf8');
  assert.match(reader, /installStreamAsyncIteration\(\);/, 'le correctif est installé à l’import');
  /* Aucune dépendance ajoutée, aucune version changée. */
  const paquet = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8'));
  assert.equal(paquet.dependencies['pdfjs-dist'], '6.3.289', 'la version de PDF.js est celle d’avant ce lot');
  assert.deepEqual(Object.keys(paquet.dependencies).sort(),
    ['@tesseract.js-data/eng', '@tesseract.js-data/fra', 'fflate', 'pdfjs-dist', 'tesseract.js']);
});
