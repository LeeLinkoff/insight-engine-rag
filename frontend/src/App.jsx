import React, { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import AboutCard from './AboutCard.jsx'
import PageUrlCard from './PageUrlCard.jsx'
import RoutingErrorNotice from './RoutingErrorNotice.jsx'
import HighlighterTab from './HighlighterTab.jsx'
import AskQuestionTab from './AskQuestionTab.jsx'
import SystemCheckDialog from './SystemCheckDialog.jsx'
import HowItWorksDialog from './HowItWorksDialog.jsx'
import './App.css'

// VITE_API_BASE lets us point the frontend at different backends without touching code.
// In production this is empty (blank string) because Apache proxies /api/* on the same origin.
// In local dev, set it to http://localhost:3001 in .env.local so the frontend hits the local Express server.
const API_BASE = import.meta.env.VITE_API_BASE;

// Guards against a whole class of bug: if VITE_API_BASE was never set
// (e.g. no .env.local in dev), API_BASE is `undefined`, and every URL
// built from it silently contains the literal text "undefined" instead
// of throwing, so requests fail in a confusing way with no clear signal.
// Checked once here rather than re-validated on every prox() call.
const API_BASE_ERROR = (typeof API_BASE === 'undefined')
  ? {
      message: 'The frontend doesn\u2019t know where the backend is running, so links like "Open highlighted" would build a broken URL instead of a real one.',
      details:
        'VITE_API_BASE is undefined.\n\n' +
        'Fix: create frontend/.env.local with:\n' +
        '  VITE_API_BASE=http://localhost:3001\n\n' +
        'Then restart the dev server (Vite only reads .env.local on startup).'
    }
  : null;

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

// App owns all shared state and the handlers that talk to the backend.
// Everything visual is delegated to child components (About/PageUrl cards,
// the two tabs, the two dialogs), which receive only the state and
// callbacks they actually need as props. This file is the orchestration
// layer, not the layout — see the individual component files for markup.
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
  const [safety, setSafety] = useState(null)              // Moderation result for the last answer: { flagged, categories }
  const [sourceDiversity, setSourceDiversity] = useState(null) // { unique_sources, total_chunks_used, single_source_warning }
  const [health, setHealth] = useState(null)             // Raw health check payload from the backend
  const [healthDialogOpen, setHealthDialogOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false) // Gates the "How it works" detailed instructions dialog

  // Builds the highlight proxy URL for a given source URL and query string.
  // The proxy fetches the original page server-side, injects the highlighter script,
  // and serves the result back so the browser can render it inside an iframe.
  // This sidesteps CORS and CSP restrictions that would block a direct iframe embed.
  // Returns null if API_BASE is misconfigured, rather than a broken URL containing
  // the literal text "undefined" — callers check for null and bail out gracefully.
  const prox = (u, query) => {
    if (API_BASE_ERROR) return null
    return `${API_BASE}/api/highlight-proxy?url=${encodeURIComponent(u)}&q=${encodeURIComponent(query)}`
  }

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
    setStatus('Ingesting…'); setAnswer(''); setSources([]); setSafety(null); setSourceDiversity(null)
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
      if (!j.ok) { setStatus(`Load failed: ${j.error || 'unknown error'}`); return }
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
    } catch (e) { setStatus(`System check error: ${e?.message || e}`) }
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
    setStatus('Searching…'); setAnswer(''); setSources([]); setSafety(null); setSourceDiversity(null)
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
      if (!j.ok) { setStatus(`Search failed: ${j.error || 'unknown error'}`); return }
      const cleaned = (j.answer || '').replace(/\[\d+\|[^\]]*\]/g, '').trim()
      setAnswer(cleaned); setSources(Array.isArray(j.sources) ? j.sources : [])
      // safety and source_diversity are only present once the moderation
      // and diversity checks were added server-side; guard with || null so
      // older backend responses without these fields don't break the UI.
      setSafety(j.safety || null)
      setSourceDiversity(j.source_diversity || null)
      setStatus('Results ready')
    } catch (e) { setStatus(`Query error: ${e?.message || e}`) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Layout: About card, single URL input shared across both tabs, then a
  // tabbed interface (Highlighter / Ask a Question), then two dialogs
  // (System Check, How It Works) mounted at the end so they can be opened
  // from anywhere in the tree above.
  return (
    <div className="rag-grid">

      <h2 className="rag-title" style={{ textAlign: 'center' }}>Insight Engine</h2>

      {/* System Check lives here, centered right below the title, since it's
          a whole-app/system-level action, not specific to a page or a question. */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: -8 }}>
        <button className={btnClass('health', 'secondary')} onClick={() => flash('health', getHealth)}>
          System Check
        </button>
      </div>

      {API_BASE_ERROR && (
        <RoutingErrorNotice message={API_BASE_ERROR.message} details={API_BASE_ERROR.details} />
      )}

      <AboutCard onShowInstructions={() => setInstructionsOpen(true)} />

      <PageUrlCard
        url={url}
        onChange={e => setUrl(e.target.value)}
        onLoadPage={() => flash('ingest', ingestUrl)}
        loadBtnClass={btnClass('ingest', 'primary')}
        loadStatus={status}
      />

      <Tabs.Root defaultValue="highlighter" className="rag-tabs-root">

        <Tabs.List className="rag-tabs-list">
          <Tabs.Trigger value="highlighter" className="rag-tabs-trigger">Highlighter</Tabs.Trigger>
          <Tabs.Trigger value="rag" className="rag-tabs-trigger">Ask a Question</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="highlighter" className="rag-tabs-content">
          <HighlighterTab
            url={url}
            q={q}
            setQ={setQ}
            previewSrc={previewSrc}
            setPreviewSrc={setPreviewSrc}
            prox={prox}
            btnClass={btnClass}
            flash={flash}
          />
        </Tabs.Content>

        <Tabs.Content value="rag" className="rag-tabs-content">
          <AskQuestionTab
            question={question}
            setQuestion={setQuestion}
            runQuery={runQuery}
            ingested={ingested}
            status={status}
            btnClass={btnClass}
            flash={flash}
            answer={answer}
            safety={safety}
            sourceDiversity={sourceDiversity}
            sources={sources}
            q={q}
            prox={prox}
          />
        </Tabs.Content>

      </Tabs.Root>

      <SystemCheckDialog open={healthDialogOpen} onOpenChange={setHealthDialogOpen} health={health} />

      <HowItWorksDialog open={instructionsOpen} onOpenChange={setInstructionsOpen} />

    </div>
  )
}
