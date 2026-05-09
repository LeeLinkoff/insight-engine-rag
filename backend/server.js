// server.js

/**
 * High-level overview: Minimal RAG + Highlight Proxy (server.js)
 *
 * What this service does
 * ----------------------
 * 1) Ingest web pages or raw docs:
 *    - Fetches HTML via Axios (no JS execution), extracts readable text with Cheerio.
 *    - Cleans/normalizes text, splits into chunks (≈ up to 1200 chars) for better recall.
 *    - Creates OpenAI embeddings per chunk (text-embedding-3-small).
 *    - Stores {text, embedding, metadata} in an in-memory array ("vector store").
 *
 * 2) Retrieve + answer (RAG):
 *    - For a user question, embeds the question.
 *    - Computes cosine similarity between the question embedding and all chunk embeddings in memory.
 *    - Selects top-K chunks above a minimum similarity threshold.
 *    - Builds a compact CONTEXT string and calls Chat Completions (gpt-4o-mini).
 *    - Response is constrained to cite from the given CONTEXT; if insufficient, it must say:
 *      "I'm not certain from the provided documents."
 *    - Returns both the final answer and a structured list of sources (with scores/snippets/links).
 *
 * 3) Source highlighting (browser-visible):
 *    - /api/highlight-proxy fetches the original page HTML and injects a minimal highlighter script + CSS.
 *    - The proxy preserves the page's original HTML/CSS/JS as much as possible (no Cheerio rewriting here),
 *      and adds a client-side script that finds and marks the query tokens, then scrolls them into view.
 *    - Useful for visually verifying where an answer fact came from.
 *
 * Core data structures
 * --------------------
 * - Vector store (in memory only):
 *   [{ id, source_id, text, meta:{title?, company?, source_url?}, embedding:number[] }]
 * - No persistence: restarting the server clears everything.
 *
 * Endpoints (JSON unless noted)
 * -----------------------------
 * - POST /api/ingest
 *     body: { docs: [{ id?, text, meta? }] }
 *     effect: chunk + embed + append to vector store
 *
 * - POST /api/ingest-urls
 *     body: { urls: [ "https://..." ] }
 *     effect: fetch + extract text + chunk + embed + append; returns per-URL errors if any
 *
 * - POST /api/query
 *     body: { question: string, topK?: number(1..8) }
 *     flow: embed Q → cosine rank → topK → ChatCompletion with strict CONTEXT rules
 *     returns: { ok, answer, sources:[{idx,company,source_id,title,source_url,score,snippet,text_fragment_urls}] }
 *
 * - GET  /api/highlight-proxy?url=<...>&q=<...>   (HTML)
 *     effect: serves proxied page with client-side highlighter applied to the query text
 *
 * - GET  /api/health
 *     returns store size and per-source chunk counts
 *
 * - GET  /api/debug/peek?company=<...>&limit=N
 *     quick peek at a few stored rows (for debugging)
 *
 * - GET  /api/testpage   (HTML)
 *     deterministic local test page for highlighter verification
 *
 * Models + knobs
 * --------------
 * - Embedding model: text-embedding-3-small (low-cost, 1536-dim)
 * - Chat model: gpt-4o-mini (fast/cheap RAG completion)
 * - Chunk size: ~1200 chars (see chunkText)
 * - Similarity: cosine; MIN_SIM threshold ~0.25; topK default 4
 * - Timeouts: Axios fetch ~8–10s; OpenAI client ~20s; watchdog response 120s
 *
 * Why in-memory vectors (and tradeoffs)
 * -------------------------------------
 * - Pros: dead simple, zero infra, great for demos/small data.
 * - Cons: not persistent; linear scan per query; single-process only; not production-scale.
 * - Upgrade path: swap the array for a proper vector DB (FAISS, Qdrant, Pinecone, etc.)
 *
 * Security & reliability notes
 * ----------------------------
 * - Cheerio ingestion never executes site JS, reducing risk and keeping content stable for embeddings.
 * - Highlight proxy serves third-party HTML; it injects minimal script/style and removes strict CSP meta
 *   to allow client-side highlighting. Use cautiously for untrusted pages.
 * - CORS enabled for UI dev; restrict in production.
 * - Rate limit + auth are not implemented here (add before exposing publicly).
 *
 * Operational guidance
 * --------------------
 * - This is a minimal demonstration server—optimize/lock down before production:
 *   * add persistence and a vector DB
 *   * add caching and concurrency controls for ingestion
 *   * add auth, rate limits, logging/metrics, and error reporting
 *   * validate/normalize inputs more strictly
 *
 * Environment
 * -----------
 * - .env:
 *     OPENAI_API_KEY=sk-...
 *     PORT=3001
 *
 *
 * TL;DR
 * -----
 * - Ingest: fetch → extract → chunk → embed → store in RAM
 * - Query : embed Q → cosine search → topK → ChatCompletion with strict CONTEXT + citations
 * - Verify: open sources via highlight proxy to see the exact text on the page
 */


'use strict';

// ─── Dependencies ────────────────────────────────────────────────────────────
// Load environment variables from .env (OPENAI_API_KEY, PORT)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const cheerio = require('cheerio'); // Used for HTML parsing at ingest time ONLY — never in the highlight proxy
const OpenAI  = require('openai');
const path    = require('path');
const { injectHighlight } = require('./highlight-safe'); // Injects highlight script into raw proxied HTML

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());                              // Allow all origins (lock this down before going public)
app.use(express.json({ limit: '2mb' }));     // Accept JSON bodies up to 2MB

// ─── Request Logger ───────────────────────────────────────────────────────────
// Logs every request with method, path, response code, and elapsed milliseconds.
// Useful for spotting slow OpenAI calls during development and demos.
app.use(function (req, res, next) {
  const start = process.hrtime.bigint();
  console.log(new Date().toISOString(), 'START', req.method, req.originalUrl);
  res.on('finish', function () {
    const ms = Number((process.hrtime.bigint() - start) / 1000000n);
    console.log(new Date().toISOString(), 'END  ', req.method, req.originalUrl, '->', res.statusCode, ms + 'ms');
  });
  next();
});

// ─── Watchdog Timeout ────────────────────────────────────────────────────────
// Safety net: if any request takes longer than 2 minutes, force a 504 response.
// Prevents the server from hanging silently on a stalled OpenAI call or slow page fetch.
const WATCHDOG_MS = 120000;

app.use(function (_req, res, next) {
  const t = setTimeout(function () {
    if (!res.headersSent) {
      console.error("WATCHDOG TIMEOUT HIT");
      res.status(504).json({
        ok: false,
        error: "Gateway timeout (server watchdog 120s)"
      });
    }
  }, WATCHDOG_MS);

  res.on('finish', function () {
    clearTimeout(t); // Cancel the watchdog as soon as a response goes out
  });

  next();
});

// ─── OpenAI Client + Model Config ────────────────────────────────────────────
// text-embedding-3-small: cheap, fast, 1536-dimensional vectors. Good enough for RAG at this scale.
// gpt-4o-mini: fast and cheap for constrained Q&A. Not a reasoning model — it follows the prompt rules.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL      = 'gpt-4o-mini';

// ─── In-Memory Vector Store ───────────────────────────────────────────────────
// All ingested content lives here as an array of objects.
// Shape: { id, source_id, text, meta:{title?, company?, source_url?}, embedding:number[] }
// WARNING: this resets every time the server restarts. Not for production use.
const store = [];

// ─── Cosine Similarity ────────────────────────────────────────────────────────
// Measures how semantically close two embedding vectors are.
// Returns a value between -1 and 1. Above 0.25 is considered a relevant match (see MIN_SIM below).
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i], bi = b[i];
    dot += ai * bi; na += ai * ai; nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? (dot / denom) : 0;
}

// ─── Text Chunking ────────────────────────────────────────────────────────────
// Splits a long page into smaller pieces so each embedding covers a focused idea.
// Splits on paragraph breaks and sentence endings. Target: ~1200 chars per chunk.
// Hard ceiling: 5000 chars (~1250 tokens), safely under the embedding model's 8192-token limit.
const CHUNK_MAX_CHARS = 5000;

function chunkText(text, maxLen = 1200) {
  const parts = String(text || '').split(/(\n{2,}|(?<=\.)\s+)/g).filter(Boolean);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > maxLen && buf) { out.push(buf.trim()); buf = p; }
    else { buf += p; }
  }
  if (buf.trim()) out.push(buf.trim());
  // Hard-truncate any chunk that somehow still exceeds the embedding model's safe input size
  return out.map(c => c.length > CHUNK_MAX_CHARS ? c.slice(0, CHUNK_MAX_CHARS) : c);
}

// ─── Company Name Extraction ──────────────────────────────────────────────────
// Derives a human-readable company name from the source URL's domain.
// Example: "https://www.acmecorp.com/policy" → "Acmecorp"
// Used to label sources in query results when no explicit company name is provided.
function deriveCompanyFromUrl(url) {
  try {
    if (!url) return null;
    const hostname = new URL(url).hostname;
    const parts = hostname.replace(/^www\./, '').split('.');
    // Use second-to-last part (domain name) not first part (subdomain)
    const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return base ? (base.charAt(0).toUpperCase() + base.slice(1)) : null;
  } catch (_e) { return null; }
}

// ─── Text Fragment URL Builder ────────────────────────────────────────────────
// Generates Chrome-style "#:~:text=" deep-link URLs from a chunk of text.
// These let the browser scroll directly to and highlight a specific sentence on the source page.
// Tries to pick up to 3 unique representative sentences from the chunk.
// Falls back to slicing the head and middle of the text if no clean sentences are found.
function buildTextFragmentUrls(sourceUrl, text) {
  try {
    if (!sourceUrl || !text) return [];
    function norm(s) {
      return String(s || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/["""„‟]/g, '"')
        .replace(/['‚‛]/g, "'")
        .trim();
    }
    const plain = norm(text);
    if (!plain) return [];
    const sentences = plain.split(/(?<=[.!?])\s+/).map(norm).filter(s => s.length >= 40 && s.length <= 160);
    if (!sentences.length) {
      // Fallback: use the beginning and middle of the chunk as anchor text
      const head = plain.slice(0, 120);
      const midStart = Math.max(0, Math.floor(plain.length / 2) - 80);
      const mid = plain.slice(midStart, midStart + 160);
      return [
        sourceUrl + '#:~:text=' + encodeURIComponent(head),
        sourceUrl + '#:~:text=' + encodeURIComponent(mid)
      ];
    }
    const seen = new Set();
    const uniq = [];
    for (let i = 0; i < sentences.length && uniq.length < 3; i++) {
      const s = sentences[i];
      if (!seen.has(s)) { seen.add(s); uniq.push(s); }
    }
    return uniq.map(s => sourceUrl + '#:~:text=' + encodeURIComponent(s));
  } catch (_e) { return []; }
}

// ─── HTML Fetch + Text Extraction (Ingest Only) ───────────────────────────────
// Fetches a web page with Axios and strips it down to readable text using Cheerio.
// Cheerio parses static HTML only — it never executes JavaScript on the page.
// This keeps ingestion fast, safe, and consistent (no browser needed).
// Prefers <main> and <article> content over raw <body> to reduce nav/footer noise.
// Throws if the extracted text is too short or looks like a JS-required blocking page.
async function fetchHtmlTextCheerio(url, timeoutMs = 8000) {
  try {
    const resp = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      responseType: 'text',
      headers: {
        'user-agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control':   'no-cache',
        'pragma':          'no-cache'
      },
      validateStatus: s => s >= 200 && s < 400
    });
    let html = resp.data || '';
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000); // Cap at 2MB to avoid runaway memory
    const $ = cheerio.load(html);
    const title   = $('title').first().text().trim() || url;
    const main    = $('main').text();
    const article = $('article').text();
    const body    = $('body').text();
    const combined = [main, article, body].filter(Boolean).join(' ');
    const text = combined.replace(/\s+/g, ' ').trim();
    const ok = text && text.length > 120 && !/enable javascript/i.test(text);
    if (!ok) throw new Error('Cheerio extract too small/blocked');
    return { title, text, ok: true };
  } catch (e) {
    throw new Error('Cheerio fetch failed: ' + (e.code || '') + ' ' + (e.message || e));
  }
}

// ─── Single Embedding ─────────────────────────────────────────────────────────
// Embeds a single string (used for query embedding at search time).
// Truncates to 5000 chars as a safeguard before sending to OpenAI.
async function embedOne(text) {
  const safe = String(text || '').slice(0, 5000);
  const r = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: safe });
  return r.data[0].embedding;
}

// ─── Batch Embed + Store ──────────────────────────────────────────────────────
// Takes an array of parsed docs, chunks each one, and sends ALL chunks to OpenAI
// in a single batch embedding call per doc. This is the key performance win:
// a 33-chunk page = 1 OpenAI round trip instead of 33 serial calls.
// Each chunk is stored in the in-memory vector store with its metadata.
async function embedAndStoreDocs(docs) {
  let chunksAdded = 0;
  for (const doc of docs) {
    const baseId = doc.id || ('doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    const companyFromUrl = deriveCompanyFromUrl(doc.meta && doc.meta.source_url);
    const meta = {
      title:      (doc.meta && doc.meta.title)      || null,
      source_url: (doc.meta && doc.meta.source_url) || null,
      company:    (doc.meta && doc.meta.company)    || companyFromUrl || 'Unknown'
    };
    const chunks = chunkText(doc.text);
    // Single batch call — all chunks for this doc go in one OpenAI request
    const r = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: chunks.map(c => c.slice(0, 5000)) });
    for (let j = 0; j < chunks.length; j++) {
      store.push({ id: baseId + '#' + j, source_id: baseId, text: chunks[j], meta, embedding: r.data[j].embedding });
    }
    chunksAdded += chunks.length;
  }
  return chunksAdded;
}

// ─── RAG Routes ───────────────────────────────────────────────────────────────

// POST /api/ingest
// Accepts pre-parsed docs as JSON. Use this when you already have clean text
// and don't need the server to fetch or parse anything.
app.post('/api/ingest', async function (req, res) {
  try {
    const docs = Array.isArray(req.body.docs) ? req.body.docs : [];
    if (!docs.length) return res.status(400).json({ ok: false, error: 'No docs provided' });
    const added = await embedAndStoreDocs(docs);
    res.json({ ok: true, chunks_added: added, total_chunks: store.length });
  } catch (e) {
    console.error('INGEST ERROR:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/ingest-urls
// Accepts a list of URLs, fetches and extracts each one via Cheerio, then embeds and stores.
// Returns a per-URL error list so partial failures don't kill the whole batch.
app.post('/api/ingest-urls', async function (req, res) {
  try {
    const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
    if (!urls.length) return res.status(400).json({ ok: false, error: 'No urls provided' });

    const docs = [], errors = [];
    for (const url of urls) {
      try {
        const got = await fetchHtmlTextCheerio(url, 8000);
        console.log('INGEST OK:', url, 'chars=', got.text.length);
        docs.push({
          id:   'url_' + Buffer.from(url).toString('base64').slice(0, 12),
          text: got.text,
          meta: { title: got.title, source_url: url }
        });
      } catch (e) {
        console.error('INGEST FAIL:', url, String(e.message || e));
        errors.push({ url, error: String(e.message || e) });
      }
    }
    const added = docs.length ? await embedAndStoreDocs(docs) : 0;
    res.json({
      ok:            docs.length > 0,
      urls_received: urls.length,
      urls_ingested: docs.length,
      chunks_added:  added,
      total_chunks:  store.length,
      errors
    });
  } catch (e) {
    console.error('INGEST-URLS ERROR:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/query
// The core RAG endpoint. Embeds the question, finds the most semantically similar chunks
// in the store (cosine similarity, threshold 0.25), builds a CONTEXT block, and asks
// gpt-4o-mini to answer strictly from that context with bracket citations.
// Returns the answer plus a structured source list with scores, snippets, and deep-link URLs.
app.post('/api/query', async function (req, res) {
  try {
    const question = req.body && req.body.question;
    const topK = Math.min(Math.max(1, Number((req.body && req.body.topK) || 4)), 8);
    if (!question) return res.status(400).json({ ok: false, error: 'Missing question' });
    if (!store.length) return res.json({ ok: true, answer: "I'm not certain from the provided documents (none ingested yet).", sources: [] });

    const qemb = await embedOne(question);
    const MIN_SIM = 0.25; // Chunks below this cosine score are treated as not relevant
    const scored = store
      .map(d => ({ row: d, score: cosineSim(qemb, d.embedding) }))
      .sort((a, b) => b.score - a.score)
      .filter(s => s.score >= MIN_SIM)
      .slice(0, topK)
      .map(s => { s.row.score = s.score; return s.row; });

    // Build the CONTEXT block passed to the model.
    // Each chunk is labeled with its index, company, and source ID for citation tracking.
    const parts = [];
    for (let i = 0; i < scored.length; i++) {
      const d = scored[i];
      parts.push('[' + (i + 1) + '|' + (d.meta && d.meta.company ? d.meta.company : 'Unknown') + '|' + d.source_id + '] ' + d.text);
    }
    const context = parts.join('\n\n');

    // Strict prompt: model must cite from CONTEXT or say it doesn't know.
    // Temperature 0 keeps answers deterministic and grounded.
    const prompt =
      'You answer strictly from CONTEXT. If the answer is not fully supported by CONTEXT, reply exactly:\n' +
      '"I\'m not certain from the provided documents."\n' +
      'Rules:\n' +
      '- Quote exact numbers/dates/policy names from CONTEXT.\n' +
      '- After each fact, add a bracket citation like [1|<Company>|<source_id>].\n' +
      '- Keep the answer concise (2–5 sentences).\n\n' +
      'CONTEXT:\n' + (context || '(no matching context)') + '\n\n' +
      'QUESTION:\n' + question;

    const chat = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You answer strictly from CONTEXT and include bracket citations." },
        { role: "user",   content: prompt }
      ],
      temperature: 0
    });
    const answer = (chat.choices && chat.choices[0] && chat.choices[0].message && chat.choices[0].message.content || '').trim();

    res.json({
      ok: true,
      answer,
      sources: scored.map((d, i) => ({
        idx:                i + 1,
        company:            (d.meta && d.meta.company)    || 'Unknown',
        source_id:          d.source_id,
        title:              (d.meta && d.meta.title)      || null,
        source_url:         (d.meta && d.meta.source_url) || null,
        score:              Number((d.score || 0).toFixed(4)),
        snippet:            d.text.length > 200 ? (d.text.slice(0, 200) + '…') : d.text,
        text_fragment_urls: buildTextFragmentUrls((d.meta && d.meta.source_url) || null, d.text)
      }))
    });
  } catch (e) {
    console.error('QUERY ERROR:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Health + Debug ───────────────────────────────────────────────────────────

// GET /api/health
// Returns total chunk count and a breakdown by source. Use this to verify
// that ingestion actually stored content before running queries.
app.get('/api/health', function (_req, res) {
  const bySource = {};
  for (const r of store) {
    const key = ((r.meta && r.meta.company) || 'Unknown') + '|' + r.source_id;
    bySource[key] = (bySource[key] || 0) + 1;
  }
  res.json({ ok: true, chunks: store.length, sources: bySource });
});

// GET /api/debug/peek?company=<name>&limit=N
// Returns a few raw stored rows filtered by company name.
// Useful for sanity-checking what actually got indexed after an ingest.
app.get('/api/debug/peek', function (req, res) {
  const company = req.query.company;
  const limit = Math.max(1, Math.min(5, Number(req.query.limit || 2)));
  const rows = store
    .filter(function (r) {
      if (!company) return true;
      const c = (r.meta && r.meta.company) || 'Unknown';
      return String(c).toLowerCase().indexOf(String(company).toLowerCase()) !== -1;
    })
    .slice(0, limit)
    .map(function (r) {
      return { company: (r.meta && r.meta.company) || 'Unknown', source_id: r.source_id, title: (r.meta && r.meta.title) || null, snippet: r.text.slice(0, 300) };
    });
  res.json({ ok: true, count: rows.length, rows });
});

// ─── Test Page ────────────────────────────────────────────────────────────────
// GET /api/testpage
// A local, static HTML page used to verify the highlight proxy works end-to-end
// without depending on any external site. Always contains the same known text.
app.get('/api/testpage', function (_req, res) {
  res.set('content-type', 'text/html; charset=utf-8').send([
    '<!doctype html><html><head><meta charset="utf-8"><title>RAG HL Test</title>',
    '<style>body{font:16px system-ui,Arial;margin:2rem;line-height:1.5} h1{margin-top:0}</style>',
    '</head><body>',
    '<h1>Highlight Test Page</h1>',
    '<p id="p1">This is a simple paragraph for highlight verification. The quick brown fox jumps over the lazy dog.</p>',
    '<p id="p2">Another line to ensure multiple text nodes exist. Searching across nodes should still work.</p>',
    '<p id="p3">Keywords: quick, brown, fox, lazy, dog.</p>',
    '</body></html>'
  ].join(''));
});

// ─── Highlight Proxy ──────────────────────────────────────────────────────────
// GET /api/highlight-proxy?url=<...>&q=<...>
// Fetches the raw HTML of any URL and injects a client-side highlighting script
// that finds and marks every occurrence of the query terms, then scrolls to the first match.
//
// IMPORTANT: Cheerio is deliberately NOT used here. Cheerio rewrites and normalizes
// HTML structure, which would break the page's original rendering and cause the
// highlighter to fail to find DOM nodes. Raw HTML in, raw HTML out, injection only.
//
// The base href is set to the source origin so relative asset paths (images, CSS, JS)
// continue to resolve correctly inside the iframe.
app.get('/api/highlight-proxy', async function (req, res) {
  try {
    const url = req.query.url;
    const q   = req.query.q || '';
    if (!url || !q) return res.status(400).send('Missing url or q');

    const resp = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: s => s >= 200 && s < 400,
      headers: {
        'user-agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control':   'no-cache',
        'pragma':          'no-cache'
      }
    });

    const origin = new URL(url).origin + '/'; // Resolve relative asset paths (e.g. Wikipedia /w/load.php)
    const htmlOut = injectHighlight(resp.data, q, {
      baseHref: origin,
      maxGap:   80,
      diag:     { enabled: true, mode: 'overlay' } // Set mode to 'console' to suppress the on-page overlay
    });
    res.set('content-type', 'text/html; charset=utf-8').send(htmlOut);
  } catch (e) {
    res.status(502).send('Proxy fetch failed: ' + (e && e.message ? e.message : e));
  }
});

// ─── Static Frontend ──────────────────────────────────────────────────────────
// Serves the built React app from the /public directory.
// In dev, Vite handles this separately. This is for the production Docker build.
app.use(express.static(path.join(__dirname, 'public')));

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, function () {
  console.log('Server running at http://127.0.0.1:' + PORT);
  console.log('UI:', 'http://127.0.0.1:' + PORT + '/');
  console.log('Test page:', 'http://127.0.0.1:' + PORT + '/api/testpage');
});
