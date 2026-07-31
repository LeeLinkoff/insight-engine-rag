# Insight Engine

A minimal RAG (retrieval-augmented generation) service with source highlighting, plus an eval harness for checking answer quality against a live document store.

## What it does

1. **Ingest** web pages or raw docs. Fetches HTML via Axios, extracts readable text with Cheerio, chunks it (~1200 chars per chunk), embeds each chunk (`text-embedding-3-small`), and stores it in an in-memory vector store.
2. **Retrieve and answer.** Embeds the incoming question, ranks stored chunks by cosine similarity, takes the top-K above a similarity threshold, and asks `gpt-4o-mini` to answer strictly from that context, citing sources. If the context doesn't support an answer, the model is required to say so rather than guess.
3. **Highlight sources.** A proxy endpoint re-serves the original source page with the relevant text highlighted client-side, so an answer can be visually traced back to where it came from.

## Guardrails

RAG systems fail in specific, known ways. This service has explicit checks for the main ones:

| Failure mode | Guardrail |
|---|---|
| Hallucination | Model is restricted to CONTEXT only, must cite each fact, and has a required fallback ("I'm not certain from the provided documents.") when context is insufficient |
| Non-deterministic output | `temperature: 0` on the chat completion |
| Irrelevant retrieval | Minimum cosine similarity threshold (`MIN_SIM = 0.25`) filters weak matches before they reach the model |
| Unsafe content | Every generated answer is run through OpenAI's moderation endpoint before being returned; flagged answers are withheld |
| Single-source bias | Response includes a `source_diversity` field flagging when an answer was grounded in only one source, so a skewed or outdated single document can't quietly dominate an answer |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ingest` | Ingest pre-parsed docs (`{ docs: [{ id?, text, meta? }] }`) |
| POST | `/api/ingest-urls` | Fetch, extract, and ingest a list of URLs |
| POST | `/api/query` | Ask a question; returns a grounded answer, sources, safety flag, and source diversity info |
| GET | `/api/highlight-proxy?url=&q=` | Serves a proxied source page with the answer text highlighted |
| GET | `/api/health` | Store size and per-source chunk counts |
| GET | `/api/debug/peek?company=&limit=` | Peek at a few stored rows for debugging |
| GET | `/api/testpage` | Static local page for verifying the highlighter |

## API Documentation

Interactive OpenAPI (Swagger) documentation is available while the server is running:

```
http://127.0.0.1:3001/api/docs
```

The OpenAPI specification (`swagger-spec.js`) is maintained manually as a static specification rather than generated from inline comments. This keeps the documentation explicit, version controlled, and synchronized with the implementation.

The current Swagger documentation reflects the implemented API endpoints, request payloads, response structures, and query parameters.

## Running the server

```bash
# .env
OPENAI_API_KEY=sk-...
PORT=3001
```

```bash
node server.js
```

Server starts at `http://127.0.0.1:3001`.

## Running the evals

`evals.js` is a standalone script that hits the live `/api/query` endpoint with a fixed set of test questions and checks:

- **Refusal correctness** — did the model refuse when nothing in the store supports an answer, and answer when it should?
- **Citation correctness** — did an answered question cite at least one of the expected source IDs?
- **Retrieval precision** — of the chunks actually retrieved, what fraction came from an expected source?
- **Safety/bias flags** — surfaces any response that was withheld by moderation or grounded in a single source only.

### Setup

1. Start the server: `node server.js`
2. Ingest the documents referenced by your test cases via `/api/ingest` or `/api/ingest-urls`.
3. Open `evals.js` and fill in `TEST_CASES` with real questions and the actual `source_id`s you expect to be cited. Get real source IDs from `GET /api/health` or `GET /api/debug/peek?company=<name>` while the server is running.

### Run

```bash
node evals.js
```

Or against a non-default port:

```bash
EVAL_BASE_URL=http://127.0.0.1:4000 node evals.js
```

Prints PASS/FAIL per case plus retrieval precision, and exits with code `1` if any case fails (`0` if all pass), so it can gate a CI step.

## Known limitations

- **No persistence.** The vector store is in memory only; restarting the server clears everything.
- **Single-process only.** Not designed for concurrent scaling or production load.
- **No auth or rate limiting.** Add both before exposing this publicly.
- **CORS is fully open.** Restrict allowed origins before production use.
- **Reference implementation.** This project is intended as an engineering demonstration and learning/reference implementation. While the API and documentation are complete, additional operational hardening (authentication, observability, deployment automation, scaling, etc.) would be recommended before production deployment.

## Upgrade path

- Swap the in-memory array for a real vector database (FAISS, Qdrant, Pinecone, etc.)
- Add persistence, caching, and concurrency controls for ingestion
- Add auth, rate limits, structured logging, and error reporting
- Expand `evals.js` into a larger, versioned regression suite as more documents are ingested
