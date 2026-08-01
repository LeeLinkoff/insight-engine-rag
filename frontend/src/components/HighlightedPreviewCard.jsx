import React from 'react'

// Shared iframe target for the Ask a Question tab's "Preview highlighted
// below" buttons (see SourcesCard). Starts blank; SourcesCard writes
// directly to this iframe's src by DOM id when a source is previewed,
// so this component itself takes no props and holds no state.
export default function HighlightedPreviewCard() {
  return (
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
  )
}
