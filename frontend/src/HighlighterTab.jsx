import React from 'react'

// Tab 1: Highlighter. No AI involved — the user types a word or phrase,
// the backend proxy fetches the target page and injects a token-matching
// script, and the result renders in an iframe with every match highlighted
// and scrolled into view. "Test Connection" loads a local deterministic
// test page so the proxy itself can be verified before touching any
// external site.
export default function HighlighterTab({ url, q, setQ, previewSrc, setPreviewSrc, prox, btnClass, flash }) {
  return (
    <div className="rag-grid">
      <div className="rag-card rag-form-group">
        <label>
          Words (phrase) to Highlight
          <input value={q} onChange={e => setQ(e.target.value)} />
        </label>

        <div className="btn-row">
          <button
            className={btnClass('preview', 'primary')}
            onClick={() => flash('preview', () => { const p = prox(url, q); if (p) setPreviewSrc(p) })}>
            Preview below
          </button>
          <button
            className={btnClass('newtab', 'primary')}
            onClick={() => flash('newtab', () => { const p = prox(url, q); if (p) window.open(p, '_blank', 'noopener,noreferrer') })}>
            Open in new tab
          </button>
          <button
            className={btnClass('test', 'primary')}
            onClick={() => flash('test', () => { const p = prox(`${window.location.origin}/api/testpage`, 'quick brown fox'); if (p) setPreviewSrc(p) })}>
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
  )
}
