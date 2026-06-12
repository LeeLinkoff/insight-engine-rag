import React, { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import './App.css'

// VITE_API_BASE lets us point the frontend at different backends without touching code.
// In production this is empty (blank string) because Apache proxies /api/* on the same origin.
// In local dev, set it to http://localhost:3001 in .env.local so the frontend hits the local Express server.
const API_BASE = import.meta.env.VITE_API_BASE;

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


// Converts low-level backend or OpenAI errors into
// messages that are understandable to non-technical users.
//
// Examples:
//   "401 Incorrect API key provided..." -> "The AI service could not start because the server configuration is invalid."
//
// The original error is preserved in the Details section for troubleshooting.
//
function friendlyError(raw, fallback = 'Something went wrong.') {
  const text = String(raw || fallback)
  const lower = text.toLowerCase()

  let message = fallback

  // Invalid or expired OpenAI API key.
  if (lower.includes('incorrect api key') || lower.includes('401')) {
    message =
      'The AI service could not start because the server API key is invalid or has expired. Please update the server configuration and try again.'
  }

  // Request timeout.
  else if (lower.includes('timeout')) {
    message =
      'The request took too long to complete. Please try again in a few moments.'
  }

  // Backend unavailable.
  else if (lower.includes('no response')) {
    message =
      'The server did not return a response. The backend may be unavailable.'
  }

  return {
    title: 'Unable to load content',
    message,

    // Prevent accidental display of API keys or other secrets.
    details: text.replace(
      /sk-[A-Za-z0-9_*.-]+/g,
      '[API key hidden]'
    )
  }
}

/**
 * Opens the user-friendly error dialog and resets
 * the Details section to collapsed.
 */
function showFriendlyError(raw, fallback) {
  setShowErrorDetails(false)
  setErrorDialog(friendlyError(raw, fallback))
}


export default function App() {

  // ── Shared state ──────────────────────────────────────────────────────────
  // url and q are shared across both tabs. The user sets the target URL once
  // and it drives both the highlighter and the RAG ingest without duplication.
  const [url, setUrl] = useState('https://en.wikipedia.org/wiki/Return_policy')
  const [q, setQ] = useState('return policies')                                  // Highlighter query term
  const [previewSrc, setPreviewSrc] = useState('')                               // iframe src for highlighter preview
  const [question, setQuestion] = useState('What does the page say about return policies?') // RAG question

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeBtn, setActiveBtn] = useState(null)       // Tracks which button is mid-click for the flash effect
  const [ingested, setIngested] = useState(false)        // Gates the Ask button — user must load a page first
  const [status, setStatus] = useState('')               // Single status line shown below the action buttons
  const [answer, setAnswer] = useState('')               // The grounded answer returned from the RAG query
  const [sources, setSources] = useState([])             // Ranked source chunks that backed the answer
  const [health, setHealth] = useState(null)             // Raw health check payload from the backend
  const [healthDialogOpen, setHealthDialogOpen] = useState(false)

  // ── Error Dialog State ──────────────────────────────────────────────────────
  const [errorDialog, setErrorDialog] = useState(null)   // Current error dialog contents; null when no error dialog is displayed
  const [showErrorDetails, setShowErrorDetails] = useState(false) // Shows/hides low-level technical error details

  // Builds the highlight proxy URL for a given source URL and query string.
  // The proxy fetches the original page server-side, injects the highlighter script,
  // and serves the result back so the browser can render it inside an iframe.
  // This sidesteps CORS and CSP restrictions that would block a direct iframe embed.
  const prox = (u, query) =>
    `${API_BASE}/api/highlight-proxy?url=${encodeURIComponent(u)}&q=${encodeURIComponent(query)}`

  // Gives buttons a brief dark flash on click for tactile feedback.
  // Purely cosmetic — makes the UI feel snappy and responsive.
  function flash(id, fn) {
    setActiveBtn(id)
    fn()
    setTimeout(() => setActiveBtn(null), 150)
  }

  // Returns the correct CSS class for a button, injecting the active flash class
  // when that button is the one currently being clicked.
  function btnClass(id, variant = 'secondary') {
    const base = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
    return activeBtn === id ? `${base} btn-active` : base
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  // Sends the target URL to the backend for fetch, parse, chunk, and embed.
  // The backend fetches the page with Axios, extracts readable text with Cheerio,
  // splits it into ~1200-char chunks, and sends all chunks to OpenAI in a single
  // batch embedding call. This used to be 33 serial calls — now it's 1.
  // On success, unlocks the Ask button via setIngested(true).
  async function ingestUrl() {
    if (!url) { setStatus('Enter a URL'); return }
    setStatus('Ingesting…'); setAnswer(''); setSources([])
    try {
      const r = await fetchWithRetry('/api/ingest-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls: [url] })
      })
      const text = await r.text()
      if (!text) { setStatus('Load failed: no response from server. Is the backend running?'); return }
      let j
      try { j = JSON.parse(text) } catch { setStatus('Load failed: invalid response from server'); return }
      if (!j.ok)
	  {
		showFriendlyError(j.error || 'unknown error', 'The page could not be loaded.')
		setStatus('Load failed')
		return
	  }
	 
      setIngested(true)
      setStatus(`Page loaded successfully — ${j.chunks_added} section${j.chunks_added !== 1 ? 's' : ''} indexed`)
    } catch (e) { setStatus(`Ingest error: ${e?.message || e}`) }
  }

  // ── Health Check ──────────────────────────────────────────────────────────
  // Hits /api/health and shows a dialog with the result.
  // Useful before a demo to confirm the backend is up and content is loaded.
  // The dialog distinguishes between "running but empty" and "running with data" —
  // a subtle but important difference when diagnosing why Ask returns nothing.
  async function getHealth() {
    try {
      const r = await fetchWithRetry('/api/health')
      const j = await r.json()
      setHealth(j)
      setHealthDialogOpen(true)
    } catch (e) {
	  showFriendlyError(e?.message || e, 'The page could not be loaded.')
	  setStatus('Load failed')
	}
  }

  // ── RAG Query ─────────────────────────────────────────────────────────────
  // Embeds the question on the backend, runs cosine similarity against all stored
  // chunks, assembles the top 4 into a CONTEXT block, and asks GPT-4o-mini to
  // answer strictly from that context with bracket citations.
  // The frontend strips the bracket citations from the displayed answer (they're
  // used internally for source attribution) so the user sees clean prose.
  // Sources are rendered separately with relevance scores and direct highlight links.
  async function runQuery() {
    if (!question) { setStatus('Enter a question'); return }
    setStatus('Searching…'); setAnswer(''); setSources([])
    try {
      const r = await fetchWithRetry('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, topK: 4 })
      })
      const text = await r.text()
      if (!text) { setStatus('Search failed: no response from server. Is the backend running?'); return }
      let j
      try { j = JSON.parse(text) } catch { setStatus('Search failed: invalid response from server'); return }
      if (!j.ok) {
		showFriendlyError(j.error || 'unknown error', 'The question could not be answered.')
		setStatus('Search failed')
		return
	  }
      const cleaned = (j.answer || '').replace(/\[\d+\|[^\]]*\]/g, '').trim()
      setAnswer(cleaned); setSources(Array.isArray(j.sources) ? j.sources : [])
      setStatus('Results ready')
    } catch (e) {
	  showFriendlyError(e?.message || e,'The question could not be answered.')
	  setStatus('Search failed')
	}
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Layout: single URL input shared across both tabs, then a tabbed interface.
  // Tab 1 (Highlighter): type a phrase, preview the source page with that phrase
  //   marked in yellow. No AI involved — pure proxy + client-side DOM injection.
  // Tab 2 (Ask a Question): load a page, ask a question, get a grounded answer
  //   with sources. Each source has three ways to verify: open raw, open highlighted,
  //   or preview highlighted inline below the results.
  return (
    <div className="rag-grid">

      <h2 className="rag-title" style={{ textAlign: 'center' }}>Insight Engine</h2>

      {/* Single URL input at the top, shared by both tabs.
          Highlighter uses it as the page to proxy and highlight.
          RAG tab uses it as the page to ingest and query against. */}
      <div className="rag-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#111827', whiteSpace: 'nowrap' }}>Page URL:</span>
          <input value={url} onChange={e => setUrl(e.target.value)} style={{ margin: 0 }} />
        </div>
      </div>

      <Tabs.Root defaultValue="highlighter" className="rag-tabs-root">

        <Tabs.List className="rag-tabs-list">
          <Tabs.Trigger value="highlighter" className="rag-tabs-trigger">Highlighter</Tabs.Trigger>
          <Tabs.Trigger value="rag" className="rag-tabs-trigger">Ask a Question</Tabs.Trigger>
        </Tabs.List>

        {/* ── Tab 1: Highlighter ───────────────────────────────────────────
            No AI. The user types a word or phrase, and the proxy fetches the
            target page, injects a token-matching script, and renders it in an
            iframe with every match highlighted and scrolled into view.
            "Test Connection" loads a local deterministic test page so you can
            verify the proxy is working before touching any external site. */}
        <Tabs.Content value="highlighter" className="rag-tabs-content">
          <div className="rag-grid">
            <div className="rag-card rag-form-group">
              <label>
                Words (phrase) to Highlight
                <input value={q} onChange={e => setQ(e.target.value)} />
              </label>

              <div className="btn-row">
                <button
                  className={btnClass('preview', 'primary')}
                  onClick={() => flash('preview', () => setPreviewSrc(prox(url, q)))}>
                  Preview below
                </button>
                <button
                  className={btnClass('newtab', 'primary')}
                  onClick={() => flash('newtab', () => window.open(prox(url, q), '_blank', 'noopener,noreferrer'))}>
                  Open in new tab
                </button>
                <button
                  className={btnClass('test', 'primary')}
                  onClick={() => flash('test', () => setPreviewSrc(prox(`${window.location.origin}/api/testpage`, 'quick brown fox')))}>
                  Test Connection
                </button>
              </div>
            </div>

            {/* iframe renders the proxied + highlighted page.
                Empty state shown until the user triggers a preview. */}
            <div className="rag-preview-frame">
              {previewSrc
                ? <iframe title="preview" src={previewSrc} />
                : <div className="rag-preview-empty">Use "Preview below" to load a page here.</div>}
            </div>
          </div>
        </Tabs.Content>

        {/* ── Tab 2: Ask a Question (RAG) ──────────────────────────────────
            Two-step flow, enforced by the UI:
            Step 1 — Load Page: fetches, parses, chunks, and embeds the target URL.
                     The Ask button stays disabled until this succeeds.
            Step 2 — Ask: embeds the question, retrieves the top 4 matching chunks,
                     and generates a grounded answer with citations.
            Sources render below the answer with relevance scores and three
            verification options per source. */}
        <Tabs.Content value="rag" className="rag-tabs-content">
          <div className="rag-grid">
            <div className="rag-card rag-form-group">
              <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
                Step 1: Click <strong>Load Page</strong> to analyze the URL above. Step 2: Type your question and click <strong>Ask</strong>.
              </p>

              <div className="btn-row" style={{ marginTop: 0 }}>
                <button className={btnClass('ingest', 'primary')} onClick={() => flash('ingest', ingestUrl)}>
                  Load Page
                </button>
                <button className={btnClass('health', 'primary')} onClick={() => flash('health', getHealth)}>
                  System Check
                </button>
              </div>

              <label>
                Question
                <input value={question} onChange={e => setQuestion(e.target.value)} />
              </label>

              {/* Ask is disabled until a page has been successfully ingested.
                  Visual opacity change signals the state clearly without extra copy. */}
              <div className="btn-row">
                <button
                  className="btn-primary"
                  onClick={runQuery}
                  disabled={!ingested}
                  style={{ opacity: ingested ? 1 : 0.4, cursor: ingested ? 'pointer' : 'not-allowed' }}>
                  Ask
                </button>
                {status && <span className="rag-status">{status}</span>}
              </div>
            </div>

            {/* Answer panel. Bracket citations are stripped before display —
                they exist in the raw response for source attribution but
                would be noise in the rendered answer. */}
            <div className="rag-card">
              <div className="rag-label">Answer</div>
              {answer
                ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14, color: '#111827' }}>{answer}</div>
                : <div className="rag-empty">No answer yet.</div>}
            </div>

            {/* Sources panel. Each entry is a chunk of the source page that scored
                above the 0.25 cosine similarity threshold, ranked by relevance.
                Three verification options per source:
                  - Open source: raw original page in a new tab
                  - Open highlighted: proxied page with query terms marked, new tab
                  - Preview highlighted below: loads proxied page into the iframe below */}
            <div className="rag-card">
              <div className="rag-label">Sources</div>
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#4b5563' }}>
                Each result below is a <strong>different section</strong> of the source page that matched your question. Multiple results from the same page means that page was highly relevant.
              </p>
              {sources.length ? (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {sources.map((s, i) => (
                    <li key={s.idx} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                        Section {i + 1} of {sources.length}
                      </div>
                      <div className="source-title">
                        {s.title || '(untitled)'}{' '}
                        <span className="source-meta">
                          — {s.company || 'Unknown'} · {Math.round(Number(s.score) * 100)}% relevance
                        </span>
                      </div>

                      {s.source_url && (
                        <div className="source-links">
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>Open source</a>
                          <a href={prox(s.source_url, q)} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>Open highlighted</a>
                          {/* Appends a timestamp to bust the iframe cache so clicking
                              a different source always forces a fresh proxy load */}
                          <button
                            className={btnClass(`src-${s.idx}`, 'primary')}
                            onClick={() => flash(`src-${s.idx}`, () => {
                              const f = document.getElementById('rag-preview')
                              if (f) f.src = prox(s.source_url, q) + '&_ts=' + Date.now()
                            })}>
                            Preview highlighted below
                          </button>
                        </div>
                      )}

                      {/* First 200 chars of the matching chunk, with internal citation
                          markers and footnote artifacts stripped for clean display */}
                      {s.snippet && (
                        <div className="source-snippet">
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Section preview: </span>
                          {s.snippet.replace(/\[\d+\]/g, '').replace(/\^[\s\w]+/g, '').trim()}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rag-empty">No sources yet.</div>
              )}
            </div>

            {/* Inline iframe for proxied source preview.
                Starts blank. Populated when the user clicks "Preview highlighted below"
                on any source. Cache-busted with a timestamp on each click. */}
            <div className="rag-card">
              <div className="rag-label">Highlighted Source Preview</div>
              <div className="rag-preview-frame" style={{ marginTop: 8 }}>
                <iframe
                  id="rag-preview"
                  title="rag-preview"
                  src="about:blank"
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                />
              </div>
            </div>
          </div>
        </Tabs.Content>

      </Tabs.Root>

      {/* ── System Check Dialog ───────────────────────────────────────────────
          Three states:
          - Passed with data: backend up, chunks in store, ready to query
          - Running but empty: backend up, nothing ingested yet, Ask will return nothing
          - Unknown: health call itself failed, backend may be down */}
      <Dialog.Root open={healthDialogOpen} onOpenChange={setHealthDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">
              {health && health.ok && health.chunks > 0 ? '✅ System Check Passed' : '⚠️ System Check'}
            </Dialog.Title>
            <Dialog.Description className="dialog-description">
              {health && health.ok && health.chunks > 0
                ? `All systems operational. ${health.chunks} content chunk${health.chunks !== 1 ? 's' : ''} ready for search.`
                : health && (!health.ok || health.chunks === 0)
                ? 'System is running but no content has been loaded yet. Click Load Page first.'
                : 'Could not retrieve system status.'}
            </Dialog.Description>
            <Dialog.Close className="btn-primary dialog-close">OK</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Error Dialog ──────────────────────────────────────────────────────
          Displays user-friendly error messages while keeping technical
          details available for troubleshooting when needed. */}
      <Dialog.Root open={!!errorDialog} onOpenChange={(open) => {if (!open) setErrorDialog(null)}}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">
              {errorDialog?.title}
            </Dialog.Title>
            <Dialog.Description className="dialog-description">
              {errorDialog?.message}
            </Dialog.Description>
            <button className="btn-secondary dialog-details-toggle" onClick={() => setShowErrorDetails(v => !v)}>
              {showErrorDetails ? 'Hide Details' : 'Details'}
            </button>
            {showErrorDetails && (
              <pre className="dialog-error-details">
                {errorDialog?.details}
              </pre>
            )}
            <Dialog.Close className="btn-primary dialog-close">
              OK
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
	  
    </div>
  )
}
