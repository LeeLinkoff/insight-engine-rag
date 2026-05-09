# Insight Engine — Retrieval-Augmented Generation (RAG) MVP

A fully custom RAG pipeline with a source-highlighting proxy, built from scratch. No frameworks, no wrappers, no vibe-coded shortcuts.

## What It Does

Insight Engine lets you ingest any public web page and ask questions about it. The system retrieves the most relevant content, generates a grounded answer with citations, and lets you verify every answer against the original source with one click.

## Live MVP

[https://leelinkoff.com/mvps/rag/](https://leelinkoff.com/mvps/rag/)

## Core Features

### Intelligent Ingestion
- Fetches any public URL and extracts readable text using Axios and Cheerio
- Cleans and normalizes content, then splits it into semantically meaningful chunks
- Each chunk is embedded using OpenAI's text-embedding-3-small model and stored in an in-memory vector store

### Retrieval-Augmented Answering
- User questions are embedded and compared against all stored chunks using cosine similarity
- The top matching chunks are assembled into a grounded context block
- GPT-4o-mini generates a concise answer strictly from that context, with bracket citations
- If the answer is not supported by the retrieved content, the system says so explicitly rather than hallucinating

### Source Highlighting Proxy

This is the most innovative feature and solves a real trust problem with RAG systems.

Standard RAG products return an answer and a source URL. The user has no way to verify whether the answer is grounded without manually searching the original page.

Insight Engine solves this with a server-side highlight proxy. After receiving an answer, the user can open any cited source in a proxy view that fetches the original HTML, injects a client-side token-matching script, and scrolls the browser directly to the relevant passage on the page. Verification becomes a one-click operation instead of a manual ctrl+F exercise.

### Production-Grade Backend
- Full request lifecycle logging with timestamps
- 120-second watchdog with clean error response on timeout
- Token-safe chunk truncation to stay within OpenAI embedding limits
- Restart-safe Docker containerization with environment variable isolation
- Apache reverse proxy for clean routing, no CORS issues, and no public port exposure

## Architecture

    Browser
      |
      v
    Apache (HTTPS) -- leelinkoff.com
      |
      |-- /api/*           --->  Docker container (127.0.0.1:3001, internal only)
      |
      |-- /mvps/rag/*      --->  /home/leelinko/public_html/mvps/rag (static files)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Embeddings | OpenAI text-embedding-3-small |
| Chat completion | OpenAI GPT-4o-mini |
| HTML extraction | Cheerio |
| HTTP client | Axios |
| Containerization | Docker |
| Web server | Apache with mod_proxy |
| Deployment | Bluehost VPS |

## Code Quality

Every function, endpoint, and architectural decision is documented inline. The server.js opens with a full architectural overview covering endpoints, model choices, tradeoff analysis on the in-memory vector store, and production hardening guidance. New developers can orient themselves without asking a single question.

See `DEPLOYMENT_AND_ARCHITECTURE.md` for the full deployment guide including VPS environment constraints, Docker build process, Apache configuration, and security notes.

## What This Is Not

- Not a ChatGPT wrapper
- Not a tutorial project
- Not vibe-coded
- Not deployed on a clean server with everything pre-installed

This was built locally, then deployed on a VPS with a broken Node environment, missing system libraries, and no native build capability. Every constraint was diagnosed and solved with a real engineering decision.

## Author

Lee Linkoff
https://leelinkoff.com
lee@leelinkoff.com