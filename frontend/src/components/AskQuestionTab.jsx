import React from 'react'
import AnswerCard from './AnswerCard.jsx'
import SourcesCard from './SourcesCard.jsx'
import HighlightedPreviewCard from './HighlightedPreviewCard.jsx'

// Tab 2: Ask a Question (RAG). Assumes the page has already been loaded via
// the Load Page button on the PageUrlCard above (shared across both tabs).
// This tab only owns the question form and results:
//   Ask: embeds the question, retrieves the top 4 matching chunks, and
//        generates a grounded answer with citations.
// Results (AnswerCard, SourcesCard, HighlightedPreviewCard) render below,
// each already its own component — this tab just wires the query form to
// them and passes the query state down.
export default function AskQuestionTab({
  question, setQuestion, runQuery,
  ingested, status, btnClass, flash,
  answer, safety, sourceDiversity, sources, q, prox
}) {
  return (
    <div className="rag-grid">
      <div className="rag-card rag-form-group">
        <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
          Type your question and click <strong>Ask</strong>. Requires a page to already be loaded via <strong>Load Page</strong> above.
        </p>

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

      <AnswerCard answer={answer} safety={safety} sourceDiversity={sourceDiversity} />

      <SourcesCard sources={sources} q={q} prox={prox} btnClass={btnClass} flash={flash} />

      <HighlightedPreviewCard />
    </div>
  )
}
