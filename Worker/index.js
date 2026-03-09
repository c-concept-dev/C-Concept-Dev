/**
 * clone-proxy — Worker Cloudflare v5.13.2
 * C Concept&Dev · Christophe · 2026
 *
 * Routes :
 *   POST /                    → proxy Anthropic API
 *   POST /search-library      → recherche vectorielle D1
 *   GET  /library-stats       → stats bibliothèque
 *   POST /ingest              → ingestion chunks
 *   POST /delete-book         → suppression livre
 *   POST /update-book-meta    → mise à jour métadonnées
 *   POST /d1-query            → requête D1 directe (bloque DROP/ALTER/CREATE)
 *   POST /store-file          → stockage KV texte (TTL 3600s)
 *   GET  /get-file/:id        → serve fichier depuis KV
 *   POST /generate-pdf        → HTML → PDF (Cloudflare Browser Rendering REST API)
 *   POST /generate-docx       → JSON → DOCX (docx npm)
 *   POST /generate-pptx       → JSON → PPTX (pptxgenjs npm)
 *   POST /generate-xlsx       → JSON → XLSX (exceljs npm)
 *   POST /generate-zip        → [{name,data}] → ZIP (fflate npm)
 *   POST /generate-image      → prompt → image PNG base64 (Workers AI FLUX)
 *   GET  /fetch-image         → q= → URL photo Pexels (proxy sans CORS)
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { zipSync, strToU8 } from 'fflate';

// ─── Constantes ──────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
};

const C_CONCEPT_COLORS = {
  deep:   '3A5658',
  mer:    '8FAFB1',
  sable:  'E6D7C3',
  beige:  'D8CDBB',
  violet: '5B4A8A',
  vl:     'EDE8F8',
  text:   '2C3830',
  surf:   'F4F0EA',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function jsonErr(msg, status = 500) {
  return json({ error: msg }, status);
}

// ─── Export default ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS')
      return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/search-library'   && request.method === 'POST') return handleLibrarySearch(request, env);
    if (p === '/library-stats'    && request.method === 'GET')  return handleLibraryStats(env);
    if (p === '/ingest'           && request.method === 'POST') return handleIngest(request, env);
    if (p === '/delete-book'      && request.method === 'POST') return handleDeleteBook(request, env);
    if (p === '/update-book-meta' && request.method === 'POST') return handleUpdateBookMeta(request, env);
    if (p === '/d1-query'         && request.method === 'POST') return handleD1Query(request, env);
    if (p === '/store-file'       && request.method === 'POST') return handleStoreFile(request, env);
    if (p.startsWith('/get-file/') && request.method === 'GET') return handleGetFile(url, env);
    if (p === '/generate-pdf'     && request.method === 'POST') return handleGeneratePDF(request, env);
    if (p === '/generate-docx'    && request.method === 'POST') return handleGenerateDOCX(request, env);
    if (p === '/generate-pptx'    && request.method === 'POST') return handleGeneratePPTX(request, env);
    if (p === '/generate-xlsx'    && request.method === 'POST') return handleGenerateXLSX(request, env);
    if (p === '/generate-zip'     && request.method === 'POST') return handleGenerateZIP(request, env);
    if (p === '/generate-image'   && request.method === 'POST') return handleGenerateImage(request, env);
    if (p === '/fetch-image'      && request.method === 'GET')  return handleFetchImage(url, env);
    if (p === '/session-save'     && request.method === 'POST') return handleSessionSave(request, env);
    if (p === '/session-load'     && request.method === 'POST') return handleSessionLoad(request, env);
    if (p === '/session-list'     && request.method === 'POST') return handleSessionList(request, env);
    if (p === '/sync-check'       && request.method === 'GET')  return handleSyncCheck(request, env);

    // ── Universal RAG API ─────────────────────────────────────────────────────
    if (p === '/rag-search'            && request.method === 'POST') return handleRagSearch(request, env);
    if (p === '/rag-stats'             && request.method === 'GET')  return handleRagStats(env);
    if (p === '/rag-query'             && request.method === 'POST') return handleRagQuery(request, env);
    if (p === '/llm-proxy'             && request.method === 'POST') return handleLLMProxy(request, env);

    // ── Pipeline présentation ─────────────────────────────────────────────────
    if (p === '/generate-presentation' && request.method === 'POST') return handleGeneratePresentation(request, env);

    if (request.method === 'POST') return handleAnthropicProxy(request, env);

    return jsonErr('Not found', 404);
  },
};

// ─── Anthropic Proxy ──────────────────────────────────────────────────────────

async function handleAnthropicProxy(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { payload } = body || {};
  if (!payload) return jsonErr('Missing payload', 400);

  const { model, messages, max_tokens, temperature, system, tools, tool_choice, stream, provider } = payload;

  // Routing OpenAI si demandé (rétrocompatibilité HTML legacy)
  if (provider === 'openai') {
    const llmReq = new Request('https://proxy/llm-proxy', {
      method: 'POST',
      body: JSON.stringify({ provider, model, messages, system, max_tokens, temperature, stream, tools, tool_choice }),
      headers: { 'Content-Type': 'application/json' },
    });
    return handleLLMProxy(llmReq, env);
  }

  if (!env.ANTHROPIC_API_KEY) return jsonErr('Anthropic API key not configured', 500);

  const ab = { model, messages, max_tokens, temperature };
  if (system)      ab.system      = system;
  if (tools)       ab.tools       = tools;
  if (tool_choice) ab.tool_choice = tool_choice;
  if (stream)      ab.stream      = stream;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ab),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Library Search ───────────────────────────────────────────────────────────

async function handleLibrarySearch(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { query, approach, exclude_approach, language, topK = 5 } = body;
  if (!query) return jsonErr('Missing query', 400);
  if (!env.AI || !env.VECTOR_INDEX || !env.DB)
    return jsonErr('Worker bindings not configured. Need: AI, VECTOR_INDEX, DB', 500);

  try {
    const embedResult = await env.AI.run('@cf/baai/bge-m3', { text: [query] });
    if (!embedResult?.data?.[0]) return jsonErr('Embedding generation failed', 500);

    const fetchK = exclude_approach ? Math.min(topK * 3, 50) : Math.min(topK, 20);
    const vq = { topK: fetchK, returnMetadata: 'all' };

    const matches = await env.VECTOR_INDEX.query(embedResult.data[0], vq);
    if (!matches?.matches?.length) return json({ results: [], query, message: 'No matches found' });

    const ids = matches.matches.map(m => m.id);
    const { results: chunks } = await env.DB.prepare(
      `SELECT id, book_title, author, chapter, page_number, content, approach, language FROM chunks WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();

    let results = matches.matches.map(m => {
      const c = chunks.find(c2 => c2.id === m.id);
      return {
        id: m.id, score: m.score,
        book_title: c?.book_title || '?', author: c?.author || '?',
        chapter: c?.chapter || null, page: c?.page_number || null,
        approach: c?.approach || '?', language: c?.language || '?',
        content: c?.content || '[non trouvé]',
      };
    });

    if (language) results = results.filter(r => r.language === language);
    if (exclude_approach) {
      const ex = Array.isArray(exclude_approach) ? exclude_approach : [exclude_approach];
      results = results.filter(r => !ex.includes(r.approach));
    }
    results = results.slice(0, topK);

    return json({ query, results, total_matches: results.length });
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── Library Stats ────────────────────────────────────────────────────────────

async function handleLibraryStats(env) {
  if (!env.DB) return jsonErr('D1 not configured', 500);
  try {
    const total  = await env.DB.prepare('SELECT COUNT(*) as count FROM chunks').first();
    const books  = await env.DB.prepare('SELECT DISTINCT book_id, book_title, author, language, approach FROM chunks').all();
    const byAppr = await env.DB.prepare('SELECT approach, COUNT(*) as count FROM chunks GROUP BY approach').all();
    return json({ total_chunks: total?.count || 0, books: books?.results || [], by_approach: byAppr?.results || [] });
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

async function handleIngest(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { chunks, book_meta } = body;
  if (!chunks?.length)                     return jsonErr('Missing or empty chunks array', 400);
  if (!book_meta?.book_id || !book_meta?.title) return jsonErr('Missing book_meta', 400);
  if (!env.AI || !env.VECTOR_INDEX || !env.DB) return jsonErr('Worker bindings not configured', 500);

  try {
    let d1 = 0, vec = 0;
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = chunks.slice(i, i + 10);
      const emb = (await env.AI.run('@cf/baai/bge-m3', {
        text: batch.map(c => (c.content || '').substring(0, 2000)),
      }))?.data || [];

      for (let j = 0; j < batch.length; j++) {
        const ck = batch[j];
        const id = ck.id || `${book_meta.book_id}-${i + j}`;
        try {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO chunks (id,book_id,book_title,author,language,chapter,page_number,chunk_index,content,approach,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            id, book_meta.book_id, book_meta.title,
            book_meta.author || 'Unknown', book_meta.language || 'fr',
            ck.chapter || null, ck.page || 0, i + j, ck.content,
            book_meta.approach || 'general', JSON.stringify(book_meta.tags || [])
          ).run();
          d1++;
        } catch {}

        if (emb[j]) {
          try {
            await env.VECTOR_INDEX.upsert([{
              id,
              values: emb[j],
              metadata: {
                book_id: book_meta.book_id, book_title: book_meta.title,
                approach: book_meta.approach || 'general', language: book_meta.language || 'fr',
                page: ck.page || 0,
              },
            }]);
            vec++;
          } catch {}
        }
      }
    }
    return json({ success: true, book_id: book_meta.book_id, title: book_meta.title, chunks_d1: d1, chunks_vectorize: vec, total_chunks: chunks.length });
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── Delete Book ──────────────────────────────────────────────────────────────

async function handleDeleteBook(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { book_id } = body;
  if (!book_id) return jsonErr('Missing book_id', 400);

  try {
    const { results } = await env.DB.prepare('SELECT id FROM chunks WHERE book_id = ?').bind(book_id).all();
    const ids = results?.map(r => r.id) || [];
    await env.DB.prepare('DELETE FROM chunks WHERE book_id = ?').bind(book_id).run();
    if (env.VECTOR_INDEX)
      for (let i = 0; i < ids.length; i += 100)
        await env.VECTOR_INDEX.deleteByIds(ids.slice(i, i + 100));
    return json({ success: true, book_id, deleted_chunks: ids.length });
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── Update Book Meta ─────────────────────────────────────────────────────────

async function handleUpdateBookMeta(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { book_id, approach, author, language } = body;
  if (!book_id) return jsonErr('book_id requis', 400);
  if (!env.DB)  return jsonErr('D1 not configured', 500);

  try {
    const updates = [], params = [];
    if (approach  !== undefined) { updates.push('approach = ?');  params.push(approach); }
    if (author    !== undefined) { updates.push('author = ?');    params.push(author); }
    if (language  !== undefined) { updates.push('language = ?');  params.push(language); }
    if (!updates.length) return jsonErr('Aucun champ à modifier', 400);
    params.push(book_id);
    const result = await env.DB.prepare(`UPDATE chunks SET ${updates.join(', ')} WHERE book_id = ?`).bind(...params).run();
    return json({ success: true, book_id, d1_changes: result.meta?.changes || 0 });
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── D1 Query ─────────────────────────────────────────────────────────────────

async function handleD1Query(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { sql, params } = body;
  if (!sql)    return jsonErr('Missing sql', 400);
  if (!env.DB) return jsonErr('D1 not configured', 500);

  const upper = sql.toUpperCase().trim();
  if (upper.includes('DROP ') || upper.includes('ALTER ') || upper.includes('CREATE '))
    return jsonErr('DDL statements not allowed', 403);

  try {
    let stmt = env.DB.prepare(sql);
    if (params?.length) stmt = stmt.bind(...params);
    const result = (upper.startsWith('SELECT') || upper.startsWith('WITH'))
      ? await stmt.all()
      : await stmt.run();
    return json(result);
  } catch (err) {
    return jsonErr(err.message, 500);
  }
}

// ─── Store File ───────────────────────────────────────────────────────────────

async function handleStoreFile(request, env) {
  if (!env.CLONE_KV) return jsonErr('KV binding CLONE_KV not configured', 500);
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { content, filename, mime } = body;
  if (!content) return jsonErr('Missing content', 400);

  const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const meta = JSON.stringify({ filename: filename || 'document', mime: mime || 'text/html;charset=utf-8' });

  await env.CLONE_KV.put('file:' + id, content, { expirationTtl: 3600 });
  await env.CLONE_KV.put('meta:' + id, meta,    { expirationTtl: 3600 });

  return json({ id, url: `https://clone-proxy.11drumboy11.workers.dev/get-file/${id}`, expires_in: 3600, filename: filename || 'document' });
}

// ─── Get File ─────────────────────────────────────────────────────────────────

async function handleGetFile(url, env) {
  if (!env.CLONE_KV) return new Response('KV not configured', { status: 500 });

  const id = url.pathname.replace('/get-file/', '').split('/')[0];
  if (!id) return new Response('Missing file ID', { status: 400 });

  const [content, metaStr] = await Promise.all([
    env.CLONE_KV.get('file:' + id, { type: 'arrayBuffer' }),
    env.CLONE_KV.get('meta:' + id),
  ]);

  if (!content) return new Response('File not found or expired (TTL 1h)', { status: 404 });

  const meta = metaStr ? JSON.parse(metaStr) : { filename: 'document', mime: 'text/html;charset=utf-8' };
  const dl   = url.searchParams.get('dl') === '1';

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': meta.mime,
      'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${encodeURIComponent(meta.filename)}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

// ─── Store + Return (helper binaires) ─────────────────────────────────────────

async function storeAndReturn(env, buffer, filename, mime, ttl = 3600) {
  if (!env.CLONE_KV) return jsonErr('CLONE_KV binding not configured', 500);

  const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const meta = JSON.stringify({ filename, mime });

  await env.CLONE_KV.put('file:' + id, buffer, { expirationTtl: ttl });
  await env.CLONE_KV.put('meta:' + id, meta,   { expirationTtl: ttl });

  const url         = `https://clone-proxy.11drumboy11.workers.dev/get-file/${id}?dl=1`;
  const url_preview = `https://clone-proxy.11drumboy11.workers.dev/get-file/${id}`;
  return json({ id, url, url_preview, expires_in: ttl, filename, size: buffer.byteLength || buffer.length });
}

// ─── Generate PDF — v4.2 FIX ─────────────────────────────────────────────────
// CORRECTION : printBackground et emulateMediaType ne sont PAS des paramètres
// valides de l'API REST Browser Rendering. Ce sont des options Puppeteer uniquement.
// Pour conserver les couleurs de fond en impression : addStyleTag avec print-color-adjust.

async function handleGeneratePDF(request, env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN)
    return jsonErr('CF_ACCOUNT_ID et CF_API_TOKEN requis pour Browser Rendering', 500);

  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { content, filename = 'document' } = body;
  if (!content) return jsonErr('Missing content (HTML string)', 400);

  try {
    const pdfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: content,
          addStyleTag: [
            { content: '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }' },
          ],
        }),
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

// ─── Generate DOCX ────────────────────────────────────────────────────────────

async function handleGenerateDOCX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { content, filename = 'document', options = {} } = body;
  if (!content) return jsonErr('Missing content', 400);

  try {
    const children = [];

    if (content.title) {
      children.push(new Paragraph({
        text: content.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }));
    }
    if (content.subtitle) {
      children.push(new Paragraph({
        children: [new TextRun({ text: content.subtitle, color: C_CONCEPT_COLORS.deep, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }));
    }

    for (const section of content.sections || []) {
      if (section.heading) {
        children.push(new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }));
      }
      if (section.subheading) {
        children.push(new Paragraph({
          text: section.subheading,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 160 },
        }));
      }
      if (section.text) {
        children.push(new Paragraph({
          children: [new TextRun({ text: section.text, size: 22 })],
          spacing: { after: 160 },
        }));
      }
      if (section.bullets) {
        for (const bullet of section.bullets) {
          children.push(new Paragraph({ text: bullet, bullet: { level: 0 }, spacing: { after: 80 } }));
        }
      }
      if (section.table) {
        const tableRows = section.table.map((row, ri) =>
          new TableRow({
            children: row.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({
                    text: String(cell),
                    bold: ri === 0,
                    color: ri === 0 ? 'FFFFFF' : C_CONCEPT_COLORS.text,
                  })],
                })],
                shading: ri === 0 ? { fill: C_CONCEPT_COLORS.deep } : undefined,
              })
            ),
          })
        );
        children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }
    }

    children.push(new Paragraph({
      children: [new TextRun({
        text: 'C Concept&Dev — ' + (options.footer || new Date().getFullYear()),
        color: C_CONCEPT_COLORS.mer,
        size: 16,
        italics: true,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
    }));

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Calibri', size: 22, color: C_CONCEPT_COLORS.text } } } },
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    return await storeAndReturn(env, buffer, filename + '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (err) {
    return jsonErr('DOCX generation failed: ' + err.message, 500);
  }
}

// ─── Generate PPTX ────────────────────────────────────────────────────────────

async function handleGeneratePPTX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { content, filename = 'presentation' } = body;
  if (!content?.slides) return jsonErr('Missing content.slides array', 400);

  try {
    const prs = new PptxGenJS();
    prs.layout = 'LAYOUT_WIDE';
    prs.theme  = { headFontFace: 'Montserrat', bodyFontFace: 'Calibri' };

    if (content.title) {
      const titleSlide = prs.addSlide();
      titleSlide.background = { color: C_CONCEPT_COLORS.deep };
      titleSlide.addText(content.title, {
        x: 0.5, y: 2.5, w: '90%', h: 1.5,
        fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Montserrat',
      });
      if (content.subtitle) {
        titleSlide.addText(content.subtitle, {
          x: 0.5, y: 4.2, w: '90%', h: 0.8,
          fontSize: 18, color: C_CONCEPT_COLORS.mer, align: 'center', italics: true,
        });
      }
      titleSlide.addText('C CONCEPT & DEV', {
        x: 0.3, y: 6.8, w: 3, h: 0.4,
        fontSize: 10, color: C_CONCEPT_COLORS.mer, fontFace: 'Montserrat', bold: true,
      });
    }

    // Pré-fetch toutes les images Pexels en parallèle (si image_query présent)
    const pexelsKey = env.PEXELS_API_KEY;
    const imageMap = {}; // slide index → base64 data URL
    if (pexelsKey) {
      await Promise.all(content.slides.map(async (slide, idx) => {
        const q = slide.image_query;
        if (!q) return;
        try {
          const safeQ = q.replace(/[^a-zA-Z0-9 \-+]/g, '').substring(0, 80);
          const resp = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQ)}&per_page=1&orientation=landscape`,
            { headers: { Authorization: pexelsKey } }
          );
          if (!resp.ok) return;
          const data = await resp.json();
          const photoUrl = data.photos?.[0]?.src?.large;
          if (!photoUrl) return;
          const imgResp = await fetch(photoUrl);
          if (!imgResp.ok) return;
          const buf = await imgResp.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          imageMap[idx] = 'data:image/jpeg;base64,' + b64;
        } catch {}
      }));
    }

    for (const slide of content.slides) {
      const idx = content.slides.indexOf(slide);
      const hasImage = !!imageMap[idx];
      const s = prs.addSlide();

      // Fond : image Pexels si disponible, sinon couleur
      if (hasImage) {
        s.background = { data: imageMap[idx] };
        // Overlay sombre pour lisibilité
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%',
          fill: { color: '000000', transparency: 45 } });
      } else {
        s.background = { color: 'F4F0EA' };
      }

      // Bande titre
      const titleBandColor = hasImage ? '000000' : C_CONCEPT_COLORS.deep;
      const titleBandAlpha = hasImage ? 55 : 0;
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.1,
        fill: { color: titleBandColor, transparency: titleBandAlpha } });
      s.addText(slide.title || '', {
        x: 0.3, y: 0.15, w: '90%', h: 0.8,
        fontSize: 24, bold: true, color: 'FFFFFF', fontFace: 'Montserrat', valign: 'middle',
      });

      const textColor = hasImage ? 'FFFFFF' : C_CONCEPT_COLORS.text;
      const contentY  = hasImage ? 1.4 : 1.3;
      const contentH  = hasImage ? 4.8 : 5;

      // Fusionner bullets + content dans une seule shape pour éviter les chevauchements
      if (slide.bullets?.length || slide.content) {
        const combined = [];
        if (slide.bullets?.length) {
          for (const b of slide.bullets) {
            combined.push({ text: b, options: { bullet: true, indentLevel: 0, paraSpaceAfter: 6 } });
          }
        }
        if (slide.content) {
          // Séparateur visuel si bullets + content
          if (slide.bullets?.length) {
            combined.push({ text: ' ', options: { bullet: false, fontSize: 8 } });
          }
          combined.push({ text: slide.content, options: {
            bullet: false, italic: true,
            color: hasImage ? 'E8E8E8' : C_CONCEPT_COLORS.muted || '7A8A82',
            fontSize: 14,
          }});
        }
        s.addText(combined, {
          x: 0.5, y: contentY, w: '90%', h: contentH,
          fontSize: 16, color: textColor, valign: 'top',
        });
      }
      if (slide.columns) {
        const [col1, col2] = slide.columns;
        s.addText(col1 || '', { x: 0.3, y: contentY, w: '45%', h: contentH, fontSize: 15, color: textColor, wrap: true });
        s.addText(col2 || '', { x: '52%', y: contentY, w: '45%', h: contentH, fontSize: 15, color: textColor, wrap: true });
      }

      s.addText(String(idx + 1), {
        x: '95%', y: 6.8, w: 0.4, h: 0.35,
        fontSize: 11, color: hasImage ? 'FFFFFF' : C_CONCEPT_COLORS.mer, align: 'right',
      });
    }

    const buffer = await prs.write({ outputType: 'arraybuffer' });
    return await storeAndReturn(env, buffer, filename + '.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  } catch (err) {
    return jsonErr('PPTX generation failed: ' + err.message, 500);
  }
}

// ─── Generate XLSX ────────────────────────────────────────────────────────────

async function handleGenerateXLSX(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { content, filename = 'tableau' } = body;
  if (!content?.sheets) return jsonErr('Missing content.sheets array', 400);

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'C Concept&Dev';
    workbook.created = new Date();

    for (const sheetDef of content.sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name || 'Feuille 1');

      if (sheetDef.headers) {
        sheet.columns = sheetDef.headers.map((h, i) => ({
          header: h, key: `col${i}`, width: sheetDef.colWidths?.[i] || 20,
        }));
        const headerRow = sheet.getRow(1);
        headerRow.eachCell(cell => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C_CONCEPT_COLORS.deep } };
          cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border    = { bottom: { style: 'medium', color: { argb: 'FF' + C_CONCEPT_COLORS.mer } } };
        });
        headerRow.height = 22;
      }

      for (let ri = 0; ri < (sheetDef.rows || []).length; ri++) {
        const excelRow = sheet.addRow(sheetDef.rows[ri]);
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

      if (sheetDef.formulas) {
        for (const f of sheetDef.formulas) {
          const cell = sheet.getCell(f.cell);
          cell.value = { formula: f.formula };
          cell.font  = { bold: true, color: { argb: 'FF' + C_CONCEPT_COLORS.violet } };
        }
      }

      if (sheetDef.headers) {
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to:   { row: 1, column: sheetDef.headers.length },
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

// ─── Generate ZIP ─────────────────────────────────────────────────────────────

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

// ─── Generate Image (Workers AI FLUX) ────────────────────────────────────────
// POST /generate-image
// Body : { prompt: string, width?: number, height?: number }
// Returns : { dataUrl: "data:image/png;base64,...", prompt }
async function handleGenerateImage(request, env) {
  if (!env.AI) return jsonErr('AI binding not configured', 500);

  let prompt;
  try {
    ({ prompt } = await request.json());
    if (!prompt || typeof prompt !== 'string') return jsonErr('prompt required', 400);
  } catch (e) {
    return jsonErr('Invalid JSON body', 400);
  }

  prompt = prompt.trim().substring(0, 500);

  try {
    // FLUX Schnell — d'après doc CF : retourne { image: base64string }
    // https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
    const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt,
      num_steps: 4,
    });

    // Cas 1 (doc officielle) : { image: "base64..." }
    if (result && typeof result === 'object' && result.image) {
      return json({ dataUrl: 'data:image/png;base64,' + result.image, prompt });
    }

    // Cas 2 : ReadableStream (ancien binding)
    if (result && typeof result.getReader === 'function') {
      const reader = result.getReader();
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let b64 = '';
      const sz = 0x8000;
      for (let i = 0; i < bytes.length; i += sz) b64 += String.fromCharCode(...bytes.subarray(i, i + sz));
      return json({ dataUrl: 'data:image/png;base64,' + btoa(b64), prompt });
    }

    // Cas 3 : ArrayBuffer
    if (result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
      const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : new Uint8Array(result.buffer);
      let b64 = '';
      const sz = 0x8000;
      for (let i = 0; i < bytes.length; i += sz) b64 += String.fromCharCode(...bytes.subarray(i, i + sz));
      return json({ dataUrl: 'data:image/png;base64,' + btoa(b64), prompt });
    }

    // Debug : retourner le type reçu pour diagnostic
    return jsonErr('Unexpected AI response type: ' + typeof result + ' keys=' + Object.keys(result||{}).join(','), 500);

  } catch (err) {
    return jsonErr('Image generation failed: ' + err.message, 500);
  }
}

// ─── Fetch Image (Pexels proxy) ───────────────────────────────────────────────
// GET /fetch-image?q=children+therapy&per_page=3&orientation=landscape
// Returns : { photos: [{ url, thumb, photographer, alt }] }
async function handleFetchImage(url, env) {
  const key = env.PEXELS_API_KEY;
  if (!key) return jsonErr('PEXELS_API_KEY secret not configured', 500);

  const q           = url.searchParams.get('q') || 'therapy';
  const perPage     = Math.min(parseInt(url.searchParams.get('per_page') || '3'), 10);
  const orientation = url.searchParams.get('orientation') || 'landscape'; // landscape | portrait | square

  // Sanitize
  const safeQ = q.replace(/[^a-zA-Z0-9 \-+éèàâêîôùûïë]/g, '').substring(0, 100);

  try {
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQ)}&per_page=${perPage}&orientation=${orientation}`;
    const resp = await fetch(pexelsUrl, {
      headers: { Authorization: key }
    });

    if (!resp.ok) return jsonErr('Pexels API error: ' + resp.status, 502);

    const data = await resp.json();
    const photos = (data.photos || []).map(p => ({
      url:          p.src?.large  || p.src?.original || '',
      thumb:        p.src?.medium || p.src?.small    || '',
      photographer: p.photographer || '',
      alt:          p.alt || safeQ,
    }));

    return json({ photos, total: data.total_results || photos.length, query: safeQ });

  } catch (err) {
    return jsonErr('Pexels fetch failed: ' + err.message, 500);
  }
}

// ─── Session Memory (P1-1) ────────────────────────────────────────────────────
// Clé KV : session:{patientId}  TTL 30 jours
// POST /session-save  : { patientId, summary }
// POST /session-load  : { patientId }
// POST /session-list  : {}  → liste toutes les clés session:*

const SESSION_TTL = 30 * 24 * 3600; // 30 jours

async function handleSessionSave(request, env) {
  if (!env.CLONE_KV) return jsonErr('KV binding CLONE_KV not configured', 500);
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { patientId, summary, therapistId } = body;
  if (!patientId) return jsonErr('Missing patientId', 400);
  if (!summary)   return jsonErr('Missing summary', 400);

  // P3-3 : namespace par thérapeute si therapistId fourni
  const key      = therapistId ? 'session:' + therapistId + ':' + patientId : 'session:' + patientId;
  const existing = await env.CLONE_KV.get(key);
  let history    = [];
  if (existing) {
    try { history = JSON.parse(existing).history || []; } catch {}
  }

  // Nouvelle séance en tête, 10 séances max
  history.unshift({ date: new Date().toISOString().slice(0, 10), summary });
  if (history.length > 10) history = history.slice(0, 10);

  await env.CLONE_KV.put(
    key,
    JSON.stringify({ patientId, history, updated: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL }
  );
  return json({ ok: true, patientId, sessions: history.length });
}

async function handleSessionLoad(request, env) {
  if (!env.CLONE_KV) return jsonErr('KV binding CLONE_KV not configured', 500);
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { patientId, therapistId } = body;
  if (!patientId) return jsonErr('Missing patientId', 400);

  // P3-3 : namespace par thérapeute
  const kvKey = therapistId ? 'session:' + therapistId + ':' + patientId : 'session:' + patientId;
  const raw = await env.CLONE_KV.get(kvKey);
  if (!raw) return json({ patientId, history: [], found: false });
  try {
    return json({ ...JSON.parse(raw), found: true });
  } catch {
    return jsonErr('Corrupted session data', 500);
  }
}

async function handleSessionList(request, env) {
  if (!env.CLONE_KV) return jsonErr('KV binding CLONE_KV not configured', 500);
  // P3-3 : filtrer par thérapeute ou lister tous
  let body2 = {};
  try { body2 = await request.json(); } catch {}
  const therapistId2 = body2?.therapistId;
  const prefix = therapistId2 ? 'session:' + therapistId2 + ':' : 'session:';
  const list = await env.CLONE_KV.list({ prefix });
  const keys = (list.keys || []).map(k => {
    const raw = k.name.replace('session:', '');
    // raw = "therapistId:patientId" ou "patientId" (legacy)
    const parts = raw.split(':');
    return {
      patientId  : parts.length > 1 ? parts.slice(1).join(':') : parts[0],
      therapistId: parts.length > 1 ? parts[0] : null,
      key        : k.name,
      expiration : k.expiration,
    };
  });
  return json({ sessions: keys, count: keys.length });
}

// ─── Sync-Check D1 ↔ Vectorize (P3-2) ───────────────────────────────────────
// GET /sync-check
// Compare COUNT D1 vs COUNT Vectorize par approach
// Retourne les book_ids potentiellement manquants dans Vectorize
// Note : Vectorize ne supporte pas COUNT direct → on échantillonne par approach

async function handleSyncCheck(request, env) {
  if (!env.DB)           return jsonErr('D1 not configured', 500);
  if (!env.AI)           return jsonErr('AI binding not configured (needed for test embed)', 500);
  if (!env.VECTOR_INDEX) return jsonErr('VECTOR_INDEX not configured', 500);

  try {
    // 1. Stats D1 par approach
    const d1Stats = await env.DB.prepare(
      'SELECT approach, COUNT(*) as chunks, COUNT(DISTINCT book_id) as livres FROM chunks GROUP BY approach ORDER BY chunks DESC'
    ).all();

    const d1Total = await env.DB.prepare('SELECT COUNT(*) as n FROM chunks').first();

    // 2. Vérifier Vectorize par sondage — on cherche des IDs D1 dans Vectorize
    // Prendre 5 IDs aléatoires par approach et vérifier leur présence
    const approaches = (d1Stats.results || []).map(r => r.approach);
    const sampleSize = 5;
    const syncResults = [];

    for (const approach of approaches.slice(0, 8)) { // max 8 approaches pour éviter timeout
      const sample = await env.DB.prepare(
        `SELECT id FROM chunks WHERE approach = ? ORDER BY RANDOM() LIMIT ${sampleSize}`
      ).bind(approach).all();

      const ids = (sample.results || []).map(r => r.id);
      if (!ids.length) continue;

      // Vérifier dans Vectorize via getByIds
      let foundCount = 0;
      try {
        const vecResults = await env.VECTOR_INDEX.getByIds(ids);
        foundCount = (vecResults || []).length;
      } catch {}

      const d1Row = (d1Stats.results || []).find(r => r.approach === approach);
      syncResults.push({
        approach,
        d1_chunks    : d1Row?.chunks || 0,
        d1_livres    : d1Row?.livres || 0,
        sample_size  : ids.length,
        vec_found    : foundCount,
        sync_rate    : ids.length > 0 ? Math.round((foundCount / ids.length) * 100) : 0,
        status       : foundCount === ids.length ? 'ok' : foundCount === 0 ? 'missing' : 'partial',
      });
    }

    // 3. Résumé global
    const totalD1  = d1Total?.n || 0;
    const allOk    = syncResults.every(r => r.status === 'ok');
    const missing  = syncResults.filter(r => r.status === 'missing').map(r => r.approach);
    const partial  = syncResults.filter(r => r.status === 'partial').map(r => r.approach);

    return json({
      d1_total       : totalD1,
      approaches_checked: syncResults.length,
      all_synced     : allOk,
      missing_approaches: missing,
      partial_approaches: partial,
      details        : syncResults,
      note           : 'Sondage par échantillon (5 IDs/approach) — non exhaustif',
    });

  } catch (err) {
    return jsonErr('sync-check failed: ' + err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL RAG API + LLM PROXY + GENERATE-PRESENTATION v5.13.1
// Fix : Pexels parallèle, timeout protection, meilleure gestion d'erreurs
// ═══════════════════════════════════════════════════════════════════════════════

// ─── /rag-search ──────────────────────────────────────────────────────────────
async function handleRagSearch(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { query, approach, exclude_approach, language='fr', topK=10, include_content=true, fts_terms, book_title } = body;
  if (!query) return jsonErr('Missing query', 400);
  if (!env.AI || !env.VECTOR_INDEX || !env.DB) return jsonErr('Bindings AI, VECTOR_INDEX, DB requis', 500);

  try {
    // 1. Vectorize + FTS5 en parallèle
    const embedPromise = env.AI.run('@cf/baai/bge-m3', { text: [query] });

    const terms    = fts_terms || query.split(/\s+/).filter(w => w.length > 3).slice(0, 6);
    const ftsQuery = terms.map(t => t.replace(/['"]/g, '')).join(' OR ');
    let ftsPromise = Promise.resolve({ results: [] });

    if (ftsQuery) {
      let sql = `SELECT c.id, c.book_title, c.author, c.page_number, c.approach, c.content
        FROM chunks_fts JOIN chunks c ON c.rowid = chunks_fts.rowid
        WHERE chunks_fts MATCH ?`;
      const params = [ftsQuery];
      if (approach)         { sql += ` AND c.approach = ?`;      params.push(approach); }
      if (exclude_approach) { sql += ` AND c.approach != ?`;     params.push(exclude_approach); }
      if (book_title)       { sql += ` AND c.book_title LIKE ?`; params.push(book_title + '%'); }
      if (language !== 'all') { sql += ` AND c.language = ?`;    params.push(language); }
      sql += ` ORDER BY rank LIMIT ${Math.min(topK * 2, 40)}`;
      ftsPromise = env.DB.prepare(sql).bind(...params).all().catch(() => ({ results: [] }));
    }

    const [embedResult, ftsRes] = await Promise.all([embedPromise, ftsPromise]);
    if (!embedResult?.data?.[0]) return jsonErr('Embedding failed', 500);

    // Fix v5.13.2 : Vectorize sans filtre approach (les métadonnées peuvent être incomplètes)
    // On filtre approach côté D1/FTS5 uniquement — plus fiable
    const vq = { topK: Math.min(topK * 3, 60), returnMetadata: 'all' };
    const matches   = await env.VECTOR_INDEX.query(embedResult.data[0], vq);

    const vecChunks = (matches.matches || []).map(m => ({
      id: m.id, score: m.score,
      book_title: m.metadata?.book_title, author: m.metadata?.author,
      page_number: m.metadata?.page_number, approach: m.metadata?.approach,
      _source: 'vector',
    }));
    const ftsChunks = (ftsRes.results || []).map(r => ({ ...r, _source: 'fts5', score: 0.7 }));

    // Fusion dédoublonnée + filtre approach post-hoc sur vecChunks
    const seen = new Set();
    const merged = [];
    for (const chunk of [...vecChunks, ...ftsChunks]) {
      if (seen.has(chunk.id)) continue;
      // Filtre approach sur vecChunks si spécifié (FTS5 filtre déjà en SQL)
      if (approach && chunk._source === 'vector' && chunk.approach && chunk.approach !== approach) continue;
      seen.add(chunk.id);
      merged.push(chunk);
    }

    // Enrichir contenu
    const ids = merged.filter(c => !c.content).map(c => c.id);
    if (ids.length) {
      const ph   = ids.map(() => '?').join(',');
      const rows = await env.DB.prepare(`SELECT id, content FROM chunks WHERE id IN (${ph})`).bind(...ids).all();
      const cm   = Object.fromEntries((rows.results || []).map(r => [r.id, r.content]));
      merged.forEach(c => { if (!c.content) c.content = cm[c.id] || ''; });
    }

    const finalChunks = merged.slice(0, topK).map((c, i) => {
      const out = { index: i+1, book_title: c.book_title||'', author: c.author||'',
        page_number: c.page_number||null, approach: c.approach||'',
        score: Math.round((c.score||0)*1000)/1000, source: c._source||'unknown' };
      if (include_content) out.content = (c.content||'').substring(0, 800);
      return out;
    });

    return json({ query, chunks: finalChunks,
      stats: { total: finalChunks.length, vector: vecChunks.length, fts5: ftsChunks.length, approach: approach||'all', topK } });
  } catch (err) {
    return jsonErr('rag-search failed: ' + err.message, 500);
  }
}

// ─── /rag-stats ───────────────────────────────────────────────────────────────
async function handleRagStats(env) {
  if (!env.DB) return jsonErr('DB not configured', 500);
  try {
    const [stats, total, topBooks] = await Promise.all([
      env.DB.prepare('SELECT approach, COUNT(*) as chunks, COUNT(DISTINCT book_id) as books FROM chunks GROUP BY approach ORDER BY chunks DESC').all(),
      env.DB.prepare('SELECT COUNT(*) as n, COUNT(DISTINCT book_id) as b FROM chunks').first(),
      env.DB.prepare('SELECT book_title, author, approach, COUNT(*) as chunks FROM chunks GROUP BY book_id ORDER BY chunks DESC LIMIT 20').all(),
    ]);
    return json({ total_chunks: total?.n||0, total_books: total?.b||0,
      by_approach: stats.results||[], top_books: topBooks.results||[] });
  } catch (err) { return jsonErr('rag-stats failed: ' + err.message, 500); }
}

// ─── /llm-proxy ───────────────────────────────────────────────────────────────
async function handleLLMProxy(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const { provider='anthropic', model, messages, system, max_tokens=4096,
          temperature=0.7, stream=false, tools, tool_choice } = body;
  if (!messages?.length) return jsonErr('Missing messages', 400);

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) return jsonErr('ANTHROPIC_API_KEY not configured', 500);
    const ab = { model: model||'claude-sonnet-4-20250514', messages, max_tokens, temperature };
    if (system) ab.system = system;
    if (stream) ab.stream = stream;
    if (tools) ab.tools = tools;
    if (tool_choice) ab.tool_choice = tool_choice;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json' },
      body: JSON.stringify(ab),
    });
    if (stream) return new Response(res.body, { status:res.status, headers:{...CORS,'Content-Type':'text/event-stream','Cache-Control':'no-cache'} });
    return new Response(await res.text(), { status:res.status, headers:{...CORS,'Content-Type':'application/json'} });
  }

  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) return jsonErr('OPENAI_API_KEY not configured', 500);
    const oaiMessages = [];
    if (system) oaiMessages.push({ role:'system', content:system });
    for (const m of messages) {
      const content = Array.isArray(m.content) ? m.content.map(b=>b.text||b.content||'').join('\n') : m.content;
      oaiMessages.push({ role:m.role, content });
    }
    const oaiBody = { model:model||'gpt-4o', messages:oaiMessages, max_tokens, temperature, stream };
    if (tools) oaiBody.tools = tools.map(t=>({ type:'function', function:{ name:t.name, description:t.description, parameters:t.input_schema||t.parameters||{} } }));
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json' },
      body: JSON.stringify(oaiBody),
    });
    if (stream) return new Response(res.body, { status:res.status, headers:{...CORS,'Content-Type':'text/event-stream','Cache-Control':'no-cache'} });
    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify(data), { status:res.status, headers:{...CORS,'Content-Type':'application/json'} });
    return json({ id:data.id, type:'message', role:'assistant', model:data.model,
      content:[{ type:'text', text:data.choices?.[0]?.message?.content||'' }],
      usage:{ input_tokens:data.usage?.prompt_tokens||0, output_tokens:data.usage?.completion_tokens||0 },
      stop_reason:data.choices?.[0]?.finish_reason||'end_turn', _provider:'openai' });
  }

  return jsonErr(`Unknown provider: ${provider}`, 400);
}

// ─── /rag-query ───────────────────────────────────────────────────────────────
async function handleRagQuery(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }
  const { question, approach, language='fr', topK=15, provider='anthropic', model, max_tokens=2000, system_extra } = body;
  if (!question) return jsonErr('Missing question', 400);

  const ragReq = new Request('https://proxy/rag-search', {
    method:'POST', body:JSON.stringify({ query:question, approach, language, topK, include_content:true }),
    headers:{'Content-Type':'application/json'},
  });
  const ragData = await (await handleRagSearch(ragReq, env)).json();
  if (!ragData.chunks?.length) return json({ answer:'Aucun document pertinent trouvé.', chunks_used:0, provider });

  const context = ragData.chunks.map(c =>
    `[${c.index}] ${c.book_title}${c.author?' — '+c.author:''}${c.page_number?', p.'+c.page_number:''} (${c.approach})\n${c.content}`
  ).join('\n\n');

  const systemPrompt = `Tu es un assistant clinique expert. Cite les sources avec [n] après chaque affirmation. Réponds en ${language==='fr'?'français':language}.`
    + (system_extra ? '\n'+system_extra : '');

  const llmReq = new Request('https://proxy/llm-proxy', {
    method:'POST',
    body:JSON.stringify({ provider, model:model||(provider==='openai'?'gpt-4o':'claude-sonnet-4-20250514'),
      system:systemPrompt, messages:[{role:'user',content:`Question : ${question}\n\n${context}`}], max_tokens }),
    headers:{'Content-Type':'application/json'},
  });
  const llmData = await (await handleLLMProxy(llmReq, env)).json();
  return json({ answer:llmData.content?.[0]?.text||'', chunks_used:ragData.chunks.length,
    sources:ragData.chunks.map(c=>({index:c.index,book:c.book_title,author:c.author,page:c.page_number})),
    usage:llmData.usage||{}, provider:llmData._provider||provider, model:llmData.model||model });
}

// ─── /generate-presentation ───────────────────────────────────────────────────
// Fix v5.13.1 :
//   - Pexels en parallèle (Promise.all) → réduit le temps de ~4×
//   - Protection CPU : embedding + FTS5 en parallèle dans RAG
//   - return_json par défaut false (retourne PPTX binaire direct)
//   - Meilleure gestion erreurs avec étape précise

async function handleGeneratePresentation(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonErr('Invalid JSON', 400); }

  const {
    topic,
    approach,
    nb_slides    = 4,
    provider     = 'anthropic',
    model,
    language     = 'fr',
    pexels_queries,
    return_json  = false,
    filename     = 'presentation',
    audience     = 'professionnels de santé mentale',
    style        = 'congrès scientifique',
  } = body;

  if (!topic) return jsonErr('Missing topic', 400);
  if (!env.DB || !env.AI || !env.VECTOR_INDEX) return jsonErr('Bindings DB, AI, VECTOR_INDEX requis', 500);

  try {
    // ── Étape 1 : RAG ─────────────────────────────────────────────────────────
    // Fix : language='all' pour ne pas filtrer par langue (chunks en fr ET en)
    // approach passé uniquement au FTS5, pas au filtre Vectorize (métadonnées Vectorize incomplètes)
    const ragReq  = new Request('https://proxy/rag-search', {
      method:'POST', body:JSON.stringify({ query:topic, approach, language:'all', topK:20, include_content:true }),
      headers:{'Content-Type':'application/json'},
    });
    const ragData = await (await handleRagSearch(ragReq, env)).json();
    const chunks  = ragData.chunks || [];

    if (chunks.length < 3)
      return jsonErr(`RAG insuffisant pour "${topic}" — ${chunks.length} chunks. Essayez sans filtrer par approche, ou avec un topic plus large.`, 422);

    // ── Étape 2 : Plan LLM (Haiku pour vitesse + économie) ───────────────────
    const plannerModel = provider === 'openai' ? (model||'gpt-4o-mini') : 'claude-haiku-4-5-20251001';

    const ragContext = chunks.slice(0, 12).map(c =>
      `[${c.index}] ${c.book_title}${c.author?' — '+c.author:''}${c.page_number?' p.'+c.page_number:''}\n${c.content}`
    ).join('\n\n');

    const plannerSystem = `Tu es expert en présentation scientifique. Public: ${audience}. Style: ${style}. Langue: ${language}.
RÈGLE CRITIQUE : retourne UNIQUEMENT du JSON valide, sans backticks, sans markdown, sans texte avant ou après.`;

    const plannerPrompt =
`Crée une présentation sur "${topic}" en ${nb_slides} slides en utilisant UNIQUEMENT les extraits ci-dessous.

EXTRAITS :
${ragContext}

FORMAT JSON (strictement, pas de backticks) :
{"presentation_title":"...","presentation_subtitle":"...","slides":[{"title":"...","bullets":["...","...","..."],"citation":"Auteur, Titre, p.XX","image_query":"therapy professional calm"}]}`;

    const planReq  = new Request('https://proxy/llm-proxy', {
      method:'POST',
      body:JSON.stringify({ provider, model:plannerModel, system:plannerSystem,
        messages:[{role:'user',content:plannerPrompt}], max_tokens:2000, temperature:0.3 }),
      headers:{'Content-Type':'application/json'},
    });
    const planData = await (await handleLLMProxy(planReq, env)).json();
    const planText = planData.content?.[0]?.text || '';

    let plan;
    try {
      // Nettoyage robuste : supprimer backticks, trouver le JSON entre { }
      let clean = planText.replace(/```json|```/g, '').trim();
      const start = clean.indexOf('{');
      const end   = clean.lastIndexOf('}');
      if (start >= 0 && end > start) clean = clean.slice(start, end+1);
      plan = JSON.parse(clean);
    } catch {
      return jsonErr('LLM plan invalide — réponse non-JSON: ' + planText.substring(0, 300), 500);
    }
    if (!plan?.slides?.length) return jsonErr('Plan vide — pas de slides retournées', 500);

    // ── Étape 3 : Images Pexels en parallèle ─────────────────────────────────
    if (env.PEXELS_API_KEY) {
      await Promise.all(plan.slides.map(async (slide, i) => {
        const q = (pexels_queries?.[i]) || slide.image_query || topic + ' therapy';
        // Queries plus précises — évite les faux positifs Pexels
        const safeQ = (q + ' psychology').replace(/[^a-zA-Z0-9 \-+]/g, '').substring(0, 80);
        try {
          const pRes = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQ)}&per_page=3&orientation=landscape`,
            { headers:{ Authorization:env.PEXELS_API_KEY } }
          );
          if (pRes.ok) {
            const pData = await pRes.json();
            // Prendre la 2ème photo si disponible (moins générique que la 1ère)
            const photo = pData.photos?.[1] || pData.photos?.[0];
            slide.image_url = photo?.src?.large2x || photo?.src?.large || null;
          }
        } catch (_) { slide.image_url = null; }
      }));
    }

    // ── Étape 4 : Assemblage PPTX ─────────────────────────────────────────────
    const pptxContent = {
      title    : plan.presentation_title || topic,
      subtitle : (plan.presentation_subtitle || audience) + ` — ${style}`,
      slides   : plan.slides.map(s => ({
        title   : s.title,
        bullets : s.bullets || [],
        content : (s.bullets || []).join('\n'),
        image   : s.image_url || null,
        footer  : s.citation ? `📚 ${s.citation}` : '',
        notes   : s.speaker_notes || '',
      })),
    };

    const pptxReq = new Request('https://proxy/generate-pptx', {
      method:'POST', body:JSON.stringify({ content:pptxContent, filename }),
      headers:{'Content-Type':'application/json'},
    });
    const pptxRes = await handleGeneratePPTX(pptxReq, env);

    if (!pptxRes.ok) {
      const errText = await pptxRes.text();
      return jsonErr('PPTX generation failed: ' + errText.substring(0, 300), 500);
    }

    const pptxBuf = await pptxRes.arrayBuffer();

    if (return_json) {
      return json({
        ok: true, slides_json: plan,
        pptx_base64 : btoa(String.fromCharCode(...new Uint8Array(pptxBuf))),
        chunks_used : chunks.length,
        sources     : chunks.slice(0, 8).map(c=>({book:c.book_title,author:c.author,page:c.page_number})),
      });
    }

    return new Response(pptxBuf, {
      status:200,
      headers:{
        ...CORS,
        'Content-Type'        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition' : `attachment; filename="${filename}.pptx"`,
        'X-Chunks-Used'       : String(chunks.length),
        'X-Sources'           : chunks.slice(0,5).map(c=>c.book_title).join(' | '),
      },
    });

  } catch (err) {
    return jsonErr('generate-presentation error [' + (err.name||'Error') + ']: ' + err.message, 500);
  }
}
