import React from 'react'

// Single shared URL input, used by both the Highlighter and Ask a Question
// tabs. Kept as a controlled input — value and onChange are owned by App
// so both tabs stay in sync off the same URL. Load Page lives here now,
// right next to the field it acts on, since it's a page-level action, not
// something specific to the question-asking flow.
export default function PageUrlCard({ url, onChange, onLoadPage, loadBtnClass, loadStatus }) {
  return (
    <div className="rag-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#111827', whiteSpace: 'nowrap' }}>Page URL:</span>
        <input value={url} onChange={onChange} style={{ margin: 0, flex: 1 }} />
        <button className={loadBtnClass} onClick={onLoadPage} style={{ whiteSpace: 'nowrap' }}>
          Load Page
        </button>
      </div>
      {loadStatus && (
        <div className="rag-status" style={{ marginTop: 8, textAlign: 'right' }}>{loadStatus}</div>
      )}
    </div>
  )
}
