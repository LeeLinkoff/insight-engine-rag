import React from 'react'

// Friendly error banner for routing/config problems (e.g. a missing
// VITE_API_BASE producing URLs that literally contain the text
// "undefined"). Shows a plain-language message up top, with the raw
// technical detail tucked behind a native <details> disclosure so it
// doesn't scare a non-technical viewer but is still one click away
// for whoever actually needs to debug it.
export default function RoutingErrorNotice({ title = 'Routing Error', message, details }) {
  return (
    <div className="rag-card rag-routing-error">
      <div className="rag-routing-error-title">⚠ {title}</div>
      <div className="rag-routing-error-message">{message}</div>
      {details && (
        <details className="rag-routing-error-details">
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      )}
    </div>
  )
}
