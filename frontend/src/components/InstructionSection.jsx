import React from 'react'

// Groups a set of InstructionStep components under a labeled section
// (e.g. "Highlighter" vs "Ask a Question") inside the How It Works dialog.
export default function InstructionSection({ label, children }) {
  return (
    <div className="rag-instruction-section">
      <div className="rag-label">{label}</div>
      {children}
    </div>
  )
}
