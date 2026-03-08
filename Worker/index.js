// ═══════════════════════════════════════════════════════════════════════════
// clone-proxy — Worker v4.0  |  C Concept&Dev
// ═══════════════════════════════════════════════════════════════════════════
//
// ROUTES v3 (inchangées)
//   POST /                    → proxy Anthropic API
//   POST /search-library      → recherche vectorielle D1
//   GET  /library-stats       → stats bibliothèque
//   POST /ingest              → ingestion chunks
//   POST /delete-book         → suppression livre
//   POST /update-book-meta    → mise à jour métadonnées
//   POST /d1-query            → requête D1 directe
//   POST /store-file          → stockage KV texte (1h)
//   GET  /get-file/:id        → serve fichier depuis KV
//
// ROUTES v4 (nouvelles — génération fichiers réels)
//   POST /generate-pdf        → HTML → PDF réel (Cloudflare Browser Rendering)
//   POST /generate-docx       → JSON/HTML → DOCX réel (docx npm)
//   POST /generate-pptx       → JSON → PPTX réel (pptxgenjs npm)
//   POST /generate-xlsx       → JSON → XLSX réel (exceljs npm)
//   POST /generate-zip        → [files] → ZIP (fflate npm)
//
// BODY UNIFIÉ pour routes v4:
//   { content, filename, options? }
//   → content : HTML string (pdf) | objet structuré (docx/pptx/xlsx) | [{name,data}] (zip)
//   → filename : nom du fichier sans extension
//   → options : config spécifique au format
//
// RETOUR unifié:
//   { id, url, expires_in, filename, size }
//   → url : /get-file/:id?dl=1
// ═══════════════════════════════════════════════════════════════════════════

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import pptxgen from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { zipSync, strToU8 } from 'fflate';

// ── Constantes ────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization'
};

const C_CONCEPT_COLORS = {
  deep:   '3A5658',
  mer:    '8FAFB1',
  sable:  'E6D7C3',
  beige:  'D8CDBB',
  violet: '5B4A8A',
  vl:     'EDE8F8',
  text:   '2C3830',
  surf:   'F4F0EA'
};

// ── Router principal ──────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const p   = url.pathname;

    // Routes v3 — inchangées
    if (p === '/search-library'   && request.method === 'POST') return handleLibrarySearch(request, env);
    if (p === '/library-stats'    && request.method === 'GET')  return handleLibraryStats(env);
    if (p === '/ingest'           && request.method === 'POST') return handleIngest(request, env);
    if (p === '/delete-book'      && request.method === 'POST') return handleDeleteBook(request, env);
    if (p === '/update-book-meta' && request.method === 'POST') return handleUpdateBookMeta(request, env);
    if (p === '/d1-query'         && request.method === 'POST') return handleD1Query(request, env);
    if (p === '/store-file'       && request.method === 'POST') return handleStoreFile(request, env);
    if (p.startsWith('/get-file/')&& request.method === 'GET')  return handleGetFile(url, env);

    // Routes v4 — génération fichiers réels
    if (p === '/generate-pdf'  && request.method === 'POST') return handleGeneratePDF(request, env);
    if (p === '/generate-docx' && request.method === 'POST') return handleGenerateDOCX(request, env);
    if (p === '/generate-pptx' && request.method === 'POST') return handleGeneratePPTX(request, env);
    if (p === '/generate-xlsx' && request.method === 'POST') return handleGenerateXLSX(request, env);
    if (p === '/generate-zip'  && request.method === 'POST') return handleGenerateZIP(request, env);

    // Proxy Anthropic (route par défaut POST)
    if (request.method === 'POST') return handleAnthropicProxy(request, env);

    return jsonErr('Not found', 404);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES v4 — GÉNÉRATION FICHIERS RÉELS
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /generate-pdf ────────────────────────────────────────────────────
// Body: { content: "<html>...</html>", filename: "ma-fiche", options?: { format, margin } }
// Utilise Cloudflare Browser Rendering REST API → vrai PDF Chromium
async function handleGeneratePDF(request, env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return jsonErr('CF_ACCOUNT_ID et CF_API_TOKEN requis pour Browser Rendering', 500);
  }
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename = 'document', options = {} } = body;
  if (!content) return jsonErr('Missing content (HTML string)', 400);

  try {
    const pdfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          html: content,
          options: {
            format: options.format || 'A4',
            printBackground: true,
            margin: options.margin || { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
          }
        })
      }
    );

    if (!pdfRes.ok) {
      const err = await pdfRes.text();
      return jsonErr(`Browser Rendering error: ${err}`, 502);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    return await storeAndReturn(env, pdfBuffer, filename + '.pdf', 'application/pdf');
  } catch (err) {
    return jsonErr('PDF generation failed: ' + err.message, 500);
  }
}

// ── POST /generate-docx ───────────────────────────────────────────────────
// Body: { content: { title, sections: [{heading?, text?, bullets?, table?}] }, filename }
// Génère un vrai .docx avec styles C Concept&Dev
async function handleGenerateDOCX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename = 'document', options = {} } = body;
  if (!content) return jsonErr('Missing content', 400);

  try {
    const children = [];

    // Titre principal
    if (content.title) {
      children.push(new Paragraph({
        text: content.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }));
    }

    // Sous-titre / auteur
    if (content.subtitle) {
      children.push(new Paragraph({
        children: [new TextRun({ text: content.subtitle, color: C_CONCEPT_COLORS.deep, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 }
      }));
    }

    // Sections
    for (const section of (content.sections || [])) {
      // Titre de section
      if (section.heading) {
        children.push(new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        }));
      }
      if (section.subheading) {
        children.push(new Paragraph({
          text: section.subheading,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 160 }
        }));
      }

      // Texte courant
      if (section.text) {
        children.push(new Paragraph({
          children: [new TextRun({ text: section.text, size: 22 })],
          spacing: { after: 160 }
        }));
      }

      // Liste à puces
      if (section.bullets) {
        for (const bullet of section.bullets) {
          children.push(new Paragraph({
            text: bullet,
            bullet: { level: 0 },
            spacing: { after: 80 }
          }));
        }
      }

      // Tableau
      if (section.table) {
        const tableRows = section.table.map((row, ri) =>
          new TableRow({
            children: row.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({
                    text: String(cell),
                    bold: ri === 0,
                    color: ri === 0 ? 'FFFFFF' : C_CONCEPT_COLORS.text
                  })]
                })],
                shading: ri === 0 ? { fill: C_CONCEPT_COLORS.deep } : undefined
              })
            )
          })
        );
        children.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        }));
        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }
    }

    // Footer
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'C Concept&Dev — ' + (options.footer || new Date().getFullYear()),
        color: C_CONCEPT_COLORS.mer,
        size: 16,
        italics: true
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 }
    }));

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22, color: C_CONCEPT_COLORS.text } }
        }
      },
      sections: [{ children }]
    });

    const buffer = await Packer.toBuffer(doc);
    return await storeAndReturn(env, buffer, filename + '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (err) {
    return jsonErr('DOCX generation failed: ' + err.message, 500);
  }
}

// ── POST /generate-pptx ───────────────────────────────────────────────────
// Body: { content: { title, slides: [{title, bullets?, content?, layout?}] }, filename, options? }
async function handleGeneratePPTX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename = 'presentation', options = {} } = body;
  if (!content?.slides) return jsonErr('Missing content.slides array', 400);

  try {
    const prs = new pptxgen();

    // Thème C Concept&Dev
    prs.layout = 'LAYOUT_WIDE';
    prs.theme = { headFontFace: 'Montserrat', bodyFontFace: 'Calibri' };

    // Slide titre
    if (content.title) {
      const titleSlide = prs.addSlide();
      titleSlide.background = { color: C_CONCEPT_COLORS.deep };
      titleSlide.addText(content.title, {
        x: 0.5, y: 2.5, w: '90%', h: 1.5,
        fontSize: 36, bold: true, color: 'FFFFFF',
        align: 'center', fontFace: 'Montserrat'
      });
      if (content.subtitle) {
        titleSlide.addText(content.subtitle, {
          x: 0.5, y: 4.2, w: '90%', h: 0.8,
          fontSize: 18, color: C_CONCEPT_COLORS.mer,
          align: 'center', italics: true
        });
      }
      // Logo C Concept&Dev
      titleSlide.addText('C CONCEPT & DEV', {
        x: 0.3, y: 6.8, w: 3, h: 0.4,
        fontSize: 10, color: C_CONCEPT_COLORS.mer,
        fontFace: 'Montserrat', bold: true
      });
    }

    // Slides contenu
    for (const slide of content.slides) {
      const s = prs.addSlide();
      s.background = { color: 'F4F0EA' };

      // Barre titre
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 1.1,
        fill: { color: C_CONCEPT_COLORS.deep }
      });

      s.addText(slide.title || '', {
        x: 0.3, y: 0.15, w: '90%', h: 0.8,
        fontSize: 24, bold: true, color: 'FFFFFF',
        fontFace: 'Montserrat', valign: 'middle'
      });

      // Contenu selon layout
      if (slide.bullets && slide.bullets.length) {
        const bulletText = slide.bullets.map(b => ({ text: b, options: { bullet: true, indentLevel: 0 } }));
        s.addText(bulletText, {
          x: 0.5, y: 1.3, w: '90%', h: 5,
          fontSize: 16, color: C_CONCEPT_COLORS.text,
          valign: 'top', paraSpaceAfter: 8
        });
      }

      if (slide.content) {
        s.addText(slide.content, {
          x: 0.5, y: 1.3, w: '90%', h: 5,
          fontSize: 16, color: C_CONCEPT_COLORS.text,
          valign: 'top', wrap: true
        });
      }

      // Grille 2 colonnes
      if (slide.columns) {
        const [col1, col2] = slide.columns;
        s.addText(col1 || '', {
          x: 0.3, y: 1.4, w: '45%', h: 5,
          fontSize: 15, color: C_CONCEPT_COLORS.text, wrap: true
        });
        s.addText(col2 || '', {
          x: '52%', y: 1.4, w: '45%', h: 5,
          fontSize: 15, color: C_CONCEPT_COLORS.text, wrap: true
        });
      }

      // Numéro de slide
      s.addText(String(content.slides.indexOf(slide) + 1), {
        x: '95%', y: 6.8, w: 0.4, h: 0.35,
        fontSize: 11, color: C_CONCEPT_COLORS.mer, align: 'right'
      });
    }

    const buffer = await prs.write({ outputType: 'arraybuffer' });
    return await storeAndReturn(env, buffer, filename + '.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  } catch (err) {
    return jsonErr('PPTX generation failed: ' + err.message, 500);
  }
}

// ── POST /generate-xlsx ───────────────────────────────────────────────────
// Body: { content: { sheets: [{name, headers, rows, formulas?}] }, filename }
async function handleGenerateXLSX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename = 'tableau', options = {} } = body;
  if (!content?.sheets) return jsonErr('Missing content.sheets array', 400);

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'C Concept&Dev';
    workbook.created = new Date();

    for (const sheetDef of content.sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name || 'Feuille 1');

      // En-têtes avec style
      if (sheetDef.headers) {
        sheet.columns = sheetDef.headers.map((h, i) => ({
          header: h,
          key: `col${i}`,
          width: sheetDef.colWidths?.[i] || 20
        }));

        const headerRow = sheet.getRow(1);
        headerRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_CONCEPT_COLORS.deep } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            bottom: { style: 'medium', color: { argb: 'FF' + C_CONCEPT_COLORS.mer } }
          };
        });
        headerRow.height = 22;
      }

      // Données
      for (let ri = 0; ri < (sheetDef.rows || []).length; ri++) {
        const row = sheetDef.rows[ri];
        const excelRow = sheet.addRow(row);

        // Alternance couleurs lignes
        if (ri % 2 === 0) {
          excelRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F0EA' } };
          });
        }
        excelRow.eachCell(cell => {
          cell.alignment = { vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10 };
        });
      }

      // Formules
      if (sheetDef.formulas) {
        for (const f of sheetDef.formulas) {
          const cell = sheet.getCell(f.cell);
          cell.value = { formula: f.formula };
          cell.font = { bold: true, color: { argb: 'FF' + C_CONCEPT_COLORS.violet } };
        }
      }

      // Auto-filter
      if (sheetDef.headers) {
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: sheetDef.headers.length }
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return await storeAndReturn(env, buffer, filename + '.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (err) {
    return jsonErr('XLSX generation failed: ' + err.message, 500);
  }
}

// ── POST /generate-zip ────────────────────────────────────────────────────
// Body: { content: [{name: "fichier.html", data: "...", encoding?: "utf8"|"base64"}], filename }
async function handleGenerateZIP(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename = 'archive' } = body;
  if (!Array.isArray(content) || !content.length) return jsonErr('Missing content array', 400);

  try {
    const files = {};
    for (const f of content) {
      if (!f.name || f.data === undefined) continue;
      if (f.encoding === 'base64') {
        const bin = atob(f.data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        files[f.name] = arr;
      } else {
        files[f.name] = strToU8(f.data);
      }
    }

    const zipped = zipSync(files, { level: 6 });
    return await storeAndReturn(env, zipped.buffer, filename + '.zip', 'application/zip');
  } catch (err) {
    return jsonErr('ZIP generation failed: ' + err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER — Stocke buffer en KV et retourne URL
// ═══════════════════════════════════════════════════════════════════════════
async function storeAndReturn(env, buffer, filename, mime, ttl = 3600) {
  if (!env.CLONE_KV) return jsonErr('CLONE_KV binding not configured', 500);

  const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const meta = JSON.stringify({ filename, mime });

  // Stocker le binaire en base64 dans KV (KV ne supporte que text/ArrayBuffer)
  await env.CLONE_KV.put('file:' + id, buffer, { expirationTtl: ttl });
  await env.CLONE_KV.put('meta:' + id, meta, { expirationTtl: ttl });

  const url = 'https://clone-proxy.11drumboy11.workers.dev/get-file/' + id + '?dl=1';
  return json({ id, url, expires_in: ttl, filename, size: buffer.byteLength || buffer.length }, 200);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES v3 — INCHANGÉES
// ═══════════════════════════════════════════════════════════════════════════

async function handleStoreFile(request, env) {
  if (!env.CLONE_KV) return jsonErr('KV binding CLONE_KV not configured', 500);
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { content, filename, mime } = body;
  if (!content) return jsonErr('Missing content', 400);

  const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const meta = JSON.stringify({ filename: filename || 'document', mime: mime || 'text/html;charset=utf-8' });

  await env.CLONE_KV.put('file:' + id, content,  { expirationTtl: 3600 });
  await env.CLONE_KV.put('meta:' + id, meta,      { expirationTtl: 3600 });

  const fileUrl = 'https://clone-proxy.11drumboy11.workers.dev/get-file/' + id;
  return json({ id, url: fileUrl, expires_in: 3600, filename: filename || 'document' }, 200);
}

async function handleGetFile(url, env) {
  if (!env.CLONE_KV) return new Response('KV not configured', { status: 500 });
  const id = url.pathname.replace('/get-file/', '').split('/')[0];
  if (!id) return new Response('Missing file ID', { status: 400 });

  const [content, metaStr] = await Promise.all([
    env.CLONE_KV.get('file:' + id, { type: 'arrayBuffer' }),
    env.CLONE_KV.get('meta:' + id)
  ]);
  if (!content) return new Response('File not found or expired (TTL 1h)', { status: 404 });

  const meta = metaStr ? JSON.parse(metaStr) : { filename: 'document', mime: 'text/html;charset=utf-8' };
  const dl   = url.searchParams.get('dl') === '1';
  const disp = dl ? 'attachment' : 'inline';

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': meta.mime,
      'Content-Disposition': `${disp}; filename="${encodeURIComponent(meta.filename)}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

async function handleAnthropicProxy(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { payload } = body || {};
  if (!payload) return jsonErr('Missing payload', 400);
  const { model, messages, max_tokens, temperature, system, tools, tool_choice, stream } = payload;
  if (!env.ANTHROPIC_API_KEY) return jsonErr('Anthropic API key not configured', 500);
  const ab = { model, messages, max_tokens, temperature };
  if (system)      ab.system      = system;
  if (tools)       ab.tools       = tools;
  if (tool_choice) ab.tool_choice = tool_choice;
  if (stream)      ab.stream      = stream;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(ab)
  });
  return new Response(await res.text(), { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function handleLibrarySearch(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { query, approach, exclude_approach, language, topK = 5 } = body;
  if (!query) return jsonErr('Missing query', 400);
  if (!env.AI || !env.VECTOR_INDEX || !env.DB) return jsonErr('Worker bindings not configured. Need: AI, VECTOR_INDEX, DB', 500);
  try {
    const embedResult = await env.AI.run('@cf/baai/bge-m3', { text: [query] });
    if (!embedResult?.data?.[0]) return jsonErr('Embedding generation failed', 500);
    const fetchK = exclude_approach ? Math.min(topK * 3, 60) : Math.min(topK, 20);
    const vq = { topK: fetchK, returnMetadata: 'all' };
    if (approach) vq.filter = { approach };
    const matches = await env.VECTOR_INDEX.query(embedResult.data[0], vq);
    if (!matches?.matches?.length) return json({ results: [], query, message: 'No matches found' }, 200);
    const ids = matches.matches.map(m => m.id);
    const { results: chunks } = await env.DB.prepare(
      `SELECT id, book_title, author, chapter, page_number, content, approach, language FROM chunks WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();
    let results = matches.matches.map(m => {
      const c = chunks.find(c => c.id === m.id);
      return { id: m.id, score: m.score, book_title: c?.book_title || '?', author: c?.author || '?', chapter: c?.chapter || null, page: c?.page_number || null, approach: c?.approach || '?', language: c?.language || '?', content: c?.content || '[non trouvé]' };
    });
    if (language) results = results.filter(r => r.language === language);
    if (exclude_approach) { const ex = Array.isArray(exclude_approach) ? exclude_approach : [exclude_approach]; results = results.filter(r => !ex.includes(r.approach)); }
    results = results.slice(0, topK);
    return json({ query, results, total_matches: results.length }, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

async function handleLibraryStats(env) {
  if (!env.DB) return jsonErr('D1 not configured', 500);
  try {
    const total  = await env.DB.prepare('SELECT COUNT(*) as count FROM chunks').first();
    const books  = await env.DB.prepare('SELECT DISTINCT book_id, book_title, author, language, approach FROM chunks').all();
    const byAppr = await env.DB.prepare('SELECT approach, COUNT(*) as count FROM chunks GROUP BY approach').all();
    return json({ total_chunks: total?.count || 0, books: books?.results || [], by_approach: byAppr?.results || [] }, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

async function handleIngest(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { chunks, book_meta } = body;
  if (!chunks?.length) return jsonErr('Missing or empty chunks array', 400);
  if (!book_meta?.book_id || !book_meta?.title) return jsonErr('Missing book_meta', 400);
  if (!env.AI || !env.VECTOR_INDEX || !env.DB) return jsonErr('Worker bindings not configured', 500);
  try {
    let d1 = 0, vec = 0;
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = chunks.slice(i, i + 10);
      const emb = (await env.AI.run('@cf/baai/bge-m3', { text: batch.map(c => (c.content || '').substring(0, 2000)) }))?.data || [];
      for (let j = 0; j < batch.length; j++) {
        const ck = batch[j], id = ck.id || `${book_meta.book_id}-${i + j}`;
        try {
          await env.DB.prepare(`INSERT OR REPLACE INTO chunks (id,book_id,book_title,author,language,chapter,page_number,chunk_index,content,approach,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(id, book_meta.book_id, book_meta.title, book_meta.author||'Unknown', book_meta.language||'fr', ck.chapter||null, ck.page||0, i+j, ck.content, book_meta.approach||'general', JSON.stringify(book_meta.tags||[])).run();
          d1++;
        } catch {}
        if (emb[j]) { try { await env.VECTOR_INDEX.upsert([{ id, values: emb[j], metadata: { book_id: book_meta.book_id, book_title: book_meta.title, approach: book_meta.approach||'general', language: book_meta.language||'fr', page: ck.page||0 } }]); vec++; } catch {} }
      }
    }
    return json({ success: true, book_id: book_meta.book_id, title: book_meta.title, chunks_d1: d1, chunks_vectorize: vec, total_chunks: chunks.length }, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

async function handleDeleteBook(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { book_id } = body;
  if (!book_id) return jsonErr('Missing book_id', 400);
  try {
    const { results } = await env.DB.prepare('SELECT id FROM chunks WHERE book_id = ?').bind(book_id).all();
    const ids = results?.map(r => r.id) || [];
    await env.DB.prepare('DELETE FROM chunks WHERE book_id = ?').bind(book_id).run();
    if (env.VECTOR_INDEX) for (let i = 0; i < ids.length; i += 100) await env.VECTOR_INDEX.deleteByIds(ids.slice(i, i + 100));
    return json({ success: true, book_id, deleted_chunks: ids.length }, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

async function handleUpdateBookMeta(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { book_id, approach, author, language } = body;
  if (!book_id) return jsonErr('book_id requis', 400);
  if (!env.DB) return jsonErr('D1 not configured', 500);
  try {
    const updates = [], params = [];
    if (approach !== undefined) { updates.push('approach = ?'); params.push(approach); }
    if (author   !== undefined) { updates.push('author = ?');   params.push(author); }
    if (language !== undefined) { updates.push('language = ?'); params.push(language); }
    if (!updates.length) return jsonErr('Aucun champ à modifier', 400);
    params.push(book_id);
    const result = await env.DB.prepare(`UPDATE chunks SET ${updates.join(', ')} WHERE book_id = ?`).bind(...params).run();
    return json({ success: true, book_id, d1_changes: result.meta?.changes || 0 }, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

async function handleD1Query(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { sql, params } = body;
  if (!sql) return jsonErr('Missing sql', 400);
  if (!env.DB) return jsonErr('D1 not configured', 500);
  const upper = sql.toUpperCase().trim();
  if (upper.includes('DROP ') || upper.includes('ALTER ') || upper.includes('CREATE ')) return jsonErr('DDL statements not allowed', 403);
  try {
    let stmt = env.DB.prepare(sql);
    if (params?.length) stmt = stmt.bind(...params);
    const result = (upper.startsWith('SELECT') || upper.startsWith('WITH')) ? await stmt.all() : await stmt.run();
    return json(result, 200);
  } catch (err) { return jsonErr(err.message, 500); }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function json(data, status)    { return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
function jsonErr(msg, status)  { return json({ error: msg }, status || 500); }
