import * as Tabs from '@radix-ui/react-tabs'
import React, { useState } from 'react'

import AboutCard from './components/AboutCard.jsx'
import PageUrlCard from './components/PageUrlCard.jsx'
import RoutingErrorNotice from './components/RoutingErrorNotice.jsx'
import HighlighterTab from './components/HighlighterTab.jsx'
import AskQuestionTab from './components/AskQuestionTab.jsx'
import SystemCheckDialog from './components/SystemCheckDialog.jsx'
import HowItWorksDialog from './components/HowItWorksDialog.jsx'
import ErrorDialog from './components/ErrorDialog.jsx'
import ConfirmClearDialog from './components/ConfirmClearDialog.jsx'
import SuccessDialog from './components/SuccessDialog.jsx'

import './App.css'

import {API_BASE_ERROR, buildHighlightProxyUrl, apiIngestUrl, apiGetHealth, apiRunQuery, apiClearStore} from './api/client.js'


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
  const [ingestStatus, setIngestStatus] = useState('')   // Status line shown in PageUrlCard, for load-page actions only
  const [queryStatus, setQueryStatus] = useState('')     // Status line shown in AskQuestionTab, for ask-question actions only
  const [answer, setAnswer] = useState('')               // The grounded answer returned from the RAG query
  const [sources, setSources] = useState([])             // Ranked source chunks that backed the answer
  const [safety, setSafety] = useState(null)              // Moderation result for the last answer: { flagged, categories }
  const [sourceDiversity, setSourceDiversity] = useState(null) // { unique_sources, total_chunks_used, single_source_warning }
  const [health, setHealth] = useState(null)             // Raw health check payload from the backend
  const [healthDialogOpen, setHealthDialogOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false) // Gates the "How it works" detailed instructions dialog
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  
  // Builds the highlight proxy URL for a given source URL and query string.
  // The proxy fetches the original page server-side, injects the highlighter script,
  // Returns null if API_BASE is misconfigured, rather than a broken URL containing
  // the literal text "undefined" — callers check for null and bail out gracefully.
  const prox = (u, query) => buildHighlightProxyUrl(u, query)

  // Gives buttons a brief dark flash on click for tactile feedback.
  // Purely cosmetic — makes the UI feel snappy and responsive.
  function flash(id, fn) {
    setActiveBtn(id)
    fn()
    setTimeout(() => setActiveBtn(null), 150)
  }

  // Sets a success message and opens the success dialog. Mirrors showError
  // below, used for actions like Clear Store where a small inline status
  // line could easily go unnoticed.
  function showSuccess(message) {
    setSuccessMessage(message)
    setSuccessDialogOpen(true)
  }
  
  // Returns the correct CSS class for a button, injecting the active flash class
  // when that button is the one currently being clicked.
  function btnClass(id, variant = 'secondary') {
    const base = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
    return activeBtn === id ? `${base} btn-active` : base
  }

   // Sets an error message and opens error dialog. Mirrors showSuccess above.
  function showError(message) {
    setErrorMessage(message)
    setErrorDialogOpen(true)
  }
  
  // ── Ingest ────────────────────────────────────────────────────────────────
  // Sends the target URL to the backend for fetch, parse, chunk, and embed.
  // The backend fetches the page with Axios, extracts readable text with Cheerio,
  // splits it into ~1200-char chunks, and sends all chunks to OpenAI in a single
  // batch embedding call. This used to be 33 serial calls — now it's 1.
  // On success, unlocks the Ask button via setIngested(true).
  async function ingestUrl() {
    if (!url) { setIngestStatus('Enter a URL'); return }
    setIngestStatus('Ingesting…'); setAnswer(''); setSources([]); setSafety(null); setSourceDiversity(null)
    const result = await apiIngestUrl(url)
    if (!result.ok) { setIngestStatus(''); showError(result.message); return }
    setIngested(true)
    setIngestStatus(`Page loaded successfully — ${result.chunksAdded} section${result.chunksAdded !== 1 ? 's' : ''} indexed`)
  }

  // ── Health Check ──────────────────────────────────────────────────────────
  // Hits /api/health and shows a dialog with the result.
  // Useful before a demo to confirm the backend is up and content is loaded.
  // The dialog distinguishes between "running but empty" and "running with data" —
  // a subtle but important difference when diagnosing why Ask returns nothing.
  async function getHealth() {
    const result = await apiGetHealth()
    if (!result.ok) { showError(result.message); return }
    setHealth(result.data)
    setHealthDialogOpen(true)
  }

  // ── Clear Store ──────────────────────────────────────────────────────────
  // Opens a confirm dialog before wiping the backend's in-memory vector
  // store, since it's destructive and can't be undone without re-ingesting
  // every page.
  function clearStore() {
    setConfirmClearOpen(true)
  }

  // Actually performs the clear, called only after the user confirms via
  // ConfirmClearDialog. Resets ingested/answer/sources state back to empty
  // so the UI doesn't keep showing results for content that's now gone from
  // the backend, then surfaces the result via the success or error dialog.
  async function doClearStore() {
    const result = await apiClearStore()
    if (!result.ok) { showError(result.message); return }
    setIngested(false)
    setAnswer(''); setSources([]); setSafety(null); setSourceDiversity(null)
    setIngestStatus('')
    showSuccess(`Store cleared — ${result.clearedChunks} chunk${result.clearedChunks !== 1 ? 's' : ''} removed`)
  }
  
  // ── RAG Query ─────────────────────────────────────────────────────────────
  // Embeds the question on the backend, runs cosine similarity against all stored
  // chunks, assembles the top 4 into a CONTEXT block, and asks GPT-4o-mini to
  // answer strictly from that context with bracket citations.
  // The frontend strips the bracket citations from the displayed answer (they're
  // used internally for source attribution) so the user sees clean prose.
  // Sources are rendered separately with relevance scores and direct highlight links.
  async function runQuery() {
    if (!question) { setQueryStatus('Enter a question'); return }
    setQueryStatus('Searching…'); setAnswer(''); setSources([]); setSafety(null); setSourceDiversity(null)
    const result = await apiRunQuery(question)
    if (!result.ok) { setQueryStatus(''); showError(result.message); return }
    setAnswer(result.answer); setSources(result.sources)
    setSafety(result.safety)
    setSourceDiversity(result.sourceDiversity)
    setQueryStatus('Results ready')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Layout: System Check / Clear Store buttons, About card, single URL input
  // shared across both tabs, then a tabbed interface (Highlighter / Ask a
  // Question), then five dialogs (System Check, How It Works, Error, Confirm
  // Clear, Success) mounted at the end so they can be opened from anywhere
  // in the tree above.
  return (
    <div className="rag-grid">

      <h2 className="rag-title" style={{ textAlign: 'center' }}>Insight Engine</h2>

      {/* System Check and Clear Store both live here, centered right below
          the title, since they're whole-app/system-level actions, not
          specific to a page or a question. Clear Store wipes the backend's
          in-memory vector store, necessary because the store has no
          persistence and no other reset path short of restarting the server,
          which isn't practical for someone actually using the app. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: -8 }}>
        <button className={btnClass('health', 'secondary')} onClick={() => flash('health', getHealth)}>
          System Check
        </button>
        <button className={btnClass('clear', 'secondary')} onClick={() => flash('clear', clearStore)}>
          Clear Store
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
        loadStatus={ingestStatus}
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
            status={queryStatus}
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

	  {/* Dialogs mounted at the end, outside the main layout flow, so they
          can be opened from anywhere in the tree above regardless of which
          tab or card triggered them. Each is fully controlled by its own
          open/onOpenChange state, rendering nothing when closed. */}
	  <SystemCheckDialog open={healthDialogOpen} onOpenChange={setHealthDialogOpen} health={health} />
      <HowItWorksDialog open={instructionsOpen} onOpenChange={setInstructionsOpen} />
      <ErrorDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen} message={errorMessage} />
      <ConfirmClearDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen} onConfirm={doClearStore} />
      <SuccessDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen} message={successMessage} />
 
    </div>
  )
}
