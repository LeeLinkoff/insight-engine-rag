import React from 'react'

// A single numbered step used inside the "How It Works" dialog.
// Pulled out as its own component so the instructions read as a clean,
// reusable list rather than one long block of inline JSX.
export default function InstructionStep({ number, title, children }) {
  return (
    <div className="rag-instruction-step">
      <div className="rag-instruction-num">{number}</div>
      <div>
        <div className="rag-instruction-title">{title}</div>
        <div className="rag-instruction-body">{children}</div>
      </div>
    </div>
  )
}
