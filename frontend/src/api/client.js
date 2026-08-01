// api.js
//
// All backend communication lives here, separate from App.jsx's state and
// rendering. Every exported function is plain JavaScript with no React
// dependency: no useState, no setState calls, nothing UI-specific. Each
// one returns a plain result object ({ ok: true, ...data } or
// { ok: false, message }) and never throws, so callers (App.jsx) can
// always branch on `result.ok` without a try/catch of their own.
//
// This keeps "how do we talk to the backend" separate from "what do we do
// with the response," which is what App.jsx's setState calls are for.

// VITE_API_BASE lets us point the frontend at different backends without touching code.
// In production this is empty (blank string) because Apache proxies /api/* on the same origin.
// In local dev, set it to http://localhost:3001 in .env.local so the frontend hits the local Express server.
export const API_BASE = import.meta.env.VITE_API_BASE

// Guards against a whole class of bug: if VITE_API_BASE was never set
// (e.g. no .env.local in dev), API_BASE is `undefined`, and every URL
// built from it silently contains the literal text "undefined" instead
// of throwing, so requests fail in a confusing way with no clear signal.
// Checked once here rather than re-validated on every call.
export const API_BASE_ERROR = (typeof API_BASE === 'undefined')
  ? {
      message: 'The frontend doesn\u2019t know where the backend is running, so links like "Open highlighted" would build a broken URL instead of a real one.',
      details:
        'VITE_API_BASE is undefined.\n\n' +
        'Fix: create frontend/.env.local with:\n' +
        '  VITE_API_BASE=http://localhost:3001\n\n' +
        'Then restart the dev server (Vite only reads .env.local on startup).'
    }
  : null

// Wraps every backend call with retry logic.
// The core problem this solves: on first load, the backend may be cold (Docker just started,
// OpenAI connection not yet warmed). A single fetch attempt would fail and show an error.
// Instead, we retry up to 5 times with 3-second gaps before giving up.
// Retries also fire on empty body responses, not just thrown network errors — that was the
// real failure mode that caused false "server not running" errors on slow ingest calls.
// Returns a response-like object with text() and json() so callers don't need to change.
async function fetchWithRetry(url, options = {}, retries = 5, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, options)
      const text = await r.text()
      if (!text) {
        if (i < retries - 1) { await new Promise(res => setTimeout(res, delayMs)); continue }
        throw new Error('Empty response after retries')
      }
      return { ok: r.ok, status: r.status, text: async () => text, json: async () => JSON.parse(text) }
    } catch (e) {
      if (i < retries - 1) { await new Promise(res => setTimeout(res, delayMs)) }
      else { throw e }
    }
  }
}

// Translates known raw backend/OpenAI error strings into plain-language
// messages a non-technical user can actually act on, and strips out
// anything that shouldn't be shown on screen (masked keys, OpenAI account
// URLs, etc). The raw message is still logged to the console for real
// debugging, this only changes what appears in the UI. Falls through to
// the raw message unchanged for anything not recognized, rather than
// hiding genuinely useful detail for an unrecognized error.
export function friendlyErrorMessage(rawError) {
  const msg = String(rawError || '')
  console.error('Raw backend error:', msg)

  if (/incorrect api key|invalid_api_key/i.test(msg)) {
    return 'The server\u2019s OpenAI API key is missing or invalid. This is a backend configuration issue, not something wrong with what you entered. Contact the site administrator.'
  }
  if (/insufficient_quota|exceeded your current quota/i.test(msg)) {
    return 'The OpenAI account behind this server has run out of credits. This is a backend billing issue, not something wrong with what you entered.'
  }
  if (/rate limit/i.test(msg)) {
    return 'Too many requests right now. Please wait a moment and try again.'
  }
  if (/econnrefused|fetch failed|network/i.test(msg)) {
    return 'Could not reach the backend server. It may be starting up, restarting, or temporarily down.'
  }

  return msg
}

// Builds the highlight-proxy URL for a given source URL and query string.
// The proxy fetches the original page server-side, injects the highlighter script,
// and serves the result back so the browser can render it inside an iframe.
// This sidesteps CORS and CSP restrictions that would block a direct iframe embed.
// Returns null if API_BASE is misconfigured, rather than a broken URL containing
// the literal text "undefined" — callers check for null and bail out gracefully.
export function buildHighlightProxyUrl(u, query) {
  if (API_BASE_ERROR) return null
  return `${API_BASE}/api/highlight-proxy?url=${encodeURIComponent(u)}&q=${encodeURIComponent(query)}`
}

// ── Ingest ────────────────────────────────────────────────────────────────
// Sends the target URL to the backend for fetch, parse, chunk, and embed.
// The backend fetches the page with Axios, extracts readable text with Cheerio,
// splits it into ~1200-char chunks, and sends all chunks to OpenAI in a single
// batch embedding call.
export async function apiIngestUrl(url) {
  try {
    const r = await fetchWithRetry('/api/ingest-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: [url] })
    })
    const text = await r.text()
    if (!text) return { ok: false, message: 'Load failed: no response from server. Is the backend running?' }
    let j
    try { j = JSON.parse(text) } catch { return { ok: false, message: 'Load failed: invalid response from server' } }
    if (!j.ok) return { ok: false, message: `Load failed: ${friendlyErrorMessage(j.error || 'unknown error')}` }
    return { ok: true, chunksAdded: j.chunks_added }
  } catch (e) {
    return { ok: false, message: `Ingest error: ${e?.message || e}` }
  }
}

// ── Health Check ──────────────────────────────────────────────────────────
// Hits /api/health. Useful before a demo to confirm the backend is up and
// content is loaded.
export async function apiGetHealth() {
  try {
    const r = await fetchWithRetry('/api/health')
    const j = await r.json()
    return { ok: true, data: j }
  } catch (e) {
    return { ok: false, message: `System check error: ${e?.message || e}` }
  }
}

// ── RAG Query ─────────────────────────────────────────────────────────────
// Embeds the question on the backend, runs cosine similarity against all stored
// chunks, assembles the top matches into a CONTEXT block, and asks the model to
// answer strictly from that context with bracket citations.
// Strips the bracket citations from the returned answer (they're used
// internally for source attribution) so the caller gets clean prose.
export async function apiRunQuery(question) {
  try {
    const r = await fetchWithRetry('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, topK: 4 })
    })
    const text = await r.text()
    if (!text) return { ok: false, message: 'Search failed: no response from server. Is the backend running?' }
    let j
    try { j = JSON.parse(text) } catch { return { ok: false, message: 'Search failed: invalid response from server' } }
    if (!j.ok) return { ok: false, message: `Search failed: ${friendlyErrorMessage(j.error || 'unknown error')}` }
    const cleaned = (j.answer || '').replace(/\[\d+\|[^\]]*\]/g, '').trim()
    return {
      ok: true,
      answer: cleaned,
      sources: Array.isArray(j.sources) ? j.sources : [],
      // safety and source_diversity are only present once the moderation
      // and diversity checks were added server-side; guard with || null so
      // older backend responses without these fields don't break the UI.
      safety: j.safety || null,
      sourceDiversity: j.source_diversity || null
    }
  } catch (e) {
    return { ok: false, message: `Query error: ${e?.message || e}` }
  }
}

// ── Clear Store ──────────────────────────────────────────────────────────
// Hits DELETE /api/clear, wiping the in-memory vector store on the backend.
// Necessary because the store has no persistence and no other way to reset
// mid-session, restarting the server is the only other way to get an empty
// store, which isn't practical for someone actually using the app.
export async function apiClearStore() {
  try {
    const r = await fetchWithRetry('/api/clear', { method: 'DELETE' })
    const text = await r.text()
    if (!text) return { ok: false, message: 'Clear failed: no response from server. Is the backend running?' }
    let j
    try { j = JSON.parse(text) } catch { return { ok: false, message: 'Clear failed: invalid response from server' } }
    if (!j.ok) return { ok: false, message: `Clear failed: ${friendlyErrorMessage(j.error || 'unknown error')}` }
    return { ok: true, clearedChunks: j.cleared_chunks, clearedSources: j.cleared_sources }
  } catch (e) {
    return { ok: false, message: `Clear error: ${e?.message || e}` }
  }
}