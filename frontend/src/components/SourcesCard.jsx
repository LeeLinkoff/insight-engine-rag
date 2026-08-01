import React from 'react'

// Renders the ranked list of source chunks that backed the last answer.
// Each entry offers three ways to verify it: open the raw page, open a
// proxied+highlighted copy in a new tab, or preview the highlighted copy
// inline in the shared #rag-preview iframe below.
//
// prox, btnClass, and flash are passed down from App rather than duplicated
// here, since they're shared with the Highlighter tab and depend on state
// (activeBtn, API_BASE) that lives in App.
export default function SourcesCard({ sources, q, prox, btnClass, flash }) {
  return (
    <div className="rag-card">
      <div className="rag-label">Sources</div>
      <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#4b5563' }}>
        Each result below is a <strong>different section</strong> of the source page that matched your question. Multiple results from the same page means that page was highly relevant.
      </p>
      {sources.length ? (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {sources.map((s, i) => (
            <li key={s.idx} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Section {i + 1} of {sources.length}
              </div>
              <div className="source-title">
                {s.title || '(untitled)'}{' '}
                <span className="source-meta">
                  — {s.company || 'Unknown'} · {Math.round(Number(s.score) * 100)}% relevance
                </span>
              </div>

              {s.source_url && (() => {
                const highlightUrl = prox(s.source_url, q)
                return (
                  <div className="source-links">
                    <a href={s.source_url} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>Open source</a>
                    {highlightUrl && (
                      <>
                        <a href={highlightUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none' }}>Open highlighted</a>
                        {/* Appends a timestamp to bust the iframe cache so clicking
                            a different source always forces a fresh proxy load */}
                        <button
                          className={btnClass(`src-${s.idx}`, 'primary')}
                          onClick={() => flash(`src-${s.idx}`, () => {
                            const f = document.getElementById('rag-preview')
                            if (f) f.src = highlightUrl + '&_ts=' + Date.now()
                          })}>
                          Preview highlighted below
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* First 200 chars of the matching chunk, with internal citation
                  markers and footnote artifacts stripped for clean display */}
              {s.snippet && (
                <div className="source-snippet">
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Section preview: </span>
                  {s.snippet.replace(/\[\d+\]/g, '').replace(/\^[\s\w]+/g, '').trim()}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="rag-empty">No sources yet.</div>
      )}
    </div>
  )
}
