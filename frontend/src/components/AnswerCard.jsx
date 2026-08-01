import React from 'react'

// Renders the grounded answer from the last query, plus two independent
// server-side warning states:
//   - safety.flagged: the answer failed OpenAI moderation and was withheld.
//     The backend already swaps in a safe placeholder message; this just
//     styles it as a clear warning instead of plain text.
//   - sourceDiversity.single_source_warning: the answer was grounded in
//     only one document. Not an error, just a robustness/bias note — a
//     single skewed or outdated source could otherwise read as if it were
//     broadly supported.
export default function AnswerCard({ answer, safety, sourceDiversity }) {
  return (
    <div className="rag-card">
      <div className="rag-label">Answer</div>
      {answer
        ? (
          <>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14, color: '#111827' }}>{answer}</div>
            {safety && safety.flagged && (
              <div className="rag-safety-warning">
                ⚠ This response was withheld by a content safety check
                {safety.categories && safety.categories.length ? ` (${safety.categories.join(', ')})` : ''}.
              </div>
            )}
            {sourceDiversity && sourceDiversity.single_source_warning && !(safety && safety.flagged) && (
              <div className="rag-diversity-warning">
                ⚠ This answer is grounded in a single source only ({sourceDiversity.total_chunks_used} matching section{sourceDiversity.total_chunks_used !== 1 ? 's' : ''} from one page). Treat it as one page's perspective, not broadly confirmed.
              </div>
            )}
            {safety && !safety.flagged && sourceDiversity && !sourceDiversity.single_source_warning && (
              <div className="rag-checks-passed">
                ✓ Passed content safety and source-diversity checks
              </div>
            )}
          </>
        )
        : <div className="rag-empty">No answer yet.</div>}
    </div>
  )
}
