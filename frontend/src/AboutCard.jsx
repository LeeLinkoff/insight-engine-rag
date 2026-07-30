import React from 'react'

// Short first-time-visitor orientation, shown above the URL input.
// Hands off to the full walkthrough via the How It Works dialog rather
// than cramming the whole explanation onto the main page.
export default function AboutCard({ onShowInstructions }) {
  return (
    <div className="rag-card">
      <div className="rag-label">About This App</div>
      <p style={{ margin: '0 0 14px 0', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
        Insight Engine reads web pages and answers questions about them with a grounded,
        source-cited response, not a guess. Load one page, or load several, each one adds to
        what's searchable rather than replacing it, then either highlight a phrase directly on
        a page or ask a question. Questions are checked against every page you've loaded so
        far, and the answer is backed by the exact sections it came from, whether that's one
        page or several.
      </p>
      <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
        Every answer runs through two automatic checks first: a content safety review, and a
        source-diversity check that flags answers grounded in only one document, even if
        multiple pages are loaded, in case the question only matched one of them. You&rsquo;ll
        see a banner if either check flags something, otherwise both passed silently.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="btn-primary" onClick={onShowInstructions}>
          How It Works
        </button>
      </div>
    </div>
  )
}
