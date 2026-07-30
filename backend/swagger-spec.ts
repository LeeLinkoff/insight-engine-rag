// swagger-spec.ts
//
// Static OpenAPI 3.0 spec for Insight Engine's backend. Kept as a plain
// object rather than parsed from inline JSDoc comments (swagger-jsdoc
// style) so the spec can't silently drift out of sync with a comment
// nobody updated, this is the single source of truth for the docs page.
//
// Served at /api/docs via swagger-ui-express (see server.ts).

'use strict';

// swagger-ui-express accepts a loosely-typed JSON object (its own types
// package doesn't export a strict OpenAPI document type), so this is
// typed as a plain object here rather than forcing a full OpenAPI 3.0
// TypeScript definition dependency just for a static docs payload.
const swaggerSpec: Record<string, unknown> = {
  openapi: '3.0.3',
  info: {
    title: 'Insight Engine API',
    description:
      'A minimal RAG (retrieval-augmented generation) service with source highlighting. ' +
      'Ingest a web page, ask a question about it, and get a grounded answer with citations ' +
      'you can verify against the exact source text.\n\n' +
      '**Safety & bias guardrails on every /api/query response:**\n' +
      '- Every generated answer is run through OpenAI\u2019s moderation endpoint before being returned; flagged answers are withheld rather than shown (see the `safety` field below).\n' +
      '- Answers are flagged when grounded in a single source only, since one skewed or outdated document could otherwise appear broadly confirmed (see `source_diversity`).\n' +
      '- A standalone eval harness (`evals.js` / `evals.ts`, not an HTTP endpoint) checks refusal correctness, citation correctness, and retrieval precision against a fixed test set, and can gate CI.',
    version: '1.0.0'
  },
  externalDocs: {
    description: 'Full write-up of the safety/bias guardrails and eval harness in the project README',
    url: '/README.md'
  },
  servers: [
    { url: '/', description: 'Same-origin (Apache proxy in production, Vite proxy in dev)' }
  ],
  tags: [
    { name: 'Ingest', description: 'Load content into the in-memory vector store' },
    { name: 'Query', description: 'Ask questions against ingested content' },
    { name: 'Highlight', description: 'Proxy and highlight source pages' },
    { name: 'Health & Debug', description: 'Inspect server and store state' }
  ],
  paths: {
    '/api/ingest': {
      post: {
        tags: ['Ingest'],
        summary: 'Ingest pre-parsed documents',
        description: 'Use this when you already have clean text and don\u2019t need the server to fetch or parse anything.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['docs'],
                properties: {
                  docs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['text'],
                      properties: {
                        id: { type: 'string', description: 'Optional stable id for this document' },
                        text: { type: 'string' },
                        meta: {
                          type: 'object',
                          properties: {
                            title: { type: 'string', nullable: true },
                            company: { type: 'string', nullable: true },
                            source_url: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  }
                }
              },
              example: {
                docs: [
                  { text: 'Returns are accepted within 30 days of purchase.', meta: { title: 'Return Policy', source_url: 'https://example.com/returns' } }
                ]
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Chunked, embedded, and stored',
            content: {
              'application/json': {
                example: { ok: true, chunks_added: 1, total_chunks: 1 }
              }
            }
          },
          400: { description: 'No docs provided' },
          500: { description: 'Embedding or server error' }
        }
      }
    },
    '/api/ingest-urls': {
      post: {
        tags: ['Ingest'],
        summary: 'Fetch, extract, and ingest one or more URLs',
        description:
          'Fetches each URL with Axios, extracts readable text with Cheerio, chunks it, ' +
          'and embeds it in a single batch call per document. Returns per-URL errors so a ' +
          'partial failure doesn\u2019t kill the whole batch.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['urls'],
                properties: {
                  urls: { type: 'array', items: { type: 'string', format: 'uri' } }
                }
              },
              example: { urls: ['https://en.wikipedia.org/wiki/Return_policy'] }
            }
          }
        },
        responses: {
          200: {
            description: 'Ingest result, may be partially successful',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  urls_received: 1,
                  urls_ingested: 1,
                  chunks_added: 12,
                  total_chunks: 12,
                  errors: []
                }
              }
            }
          },
          400: { description: 'No urls provided' },
          500: { description: 'Server error' }
        }
      }
    },
    '/api/query': {
      post: {
        tags: ['Query'],
        summary: 'Ask a grounded question against ingested content',
        description:
          'Embeds the question, ranks stored chunks by cosine similarity, and asks the chat ' +
          'model to answer strictly from the top matching chunks, with bracket citations. ' +
          'Every generated answer is passed through OpenAI moderation before being returned, ' +
          'and the response flags when an answer was grounded in a single source only.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: { type: 'string' },
                  topK: { type: 'integer', minimum: 1, maximum: 8, default: 4 }
                }
              },
              example: { question: 'What does the page say about return policies?', topK: 4 }
            }
          }
        },
        responses: {
          200: {
            description: 'Grounded answer with sources, safety flag, and source-diversity flag',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  answer: 'Returns are accepted within 30 days of purchase.',
                  safety: { flagged: false, categories: [] },
                  source_diversity: { unique_sources: 1, total_chunks_used: 2, single_source_warning: false },
                  sources: [
                    {
                      idx: 1,
                      company: 'Example',
                      source_id: 'url_abc123',
                      title: 'Return Policy',
                      source_url: 'https://example.com/returns',
                      score: 0.8421,
                      snippet: 'Returns are accepted within 30 days\u2026',
                      text_fragment_urls: ['https://example.com/returns#:~:text=Returns%20are%20accepted']
                    }
                  ]
                }
              }
            }
          },
          400: { description: 'Missing question' },
          500: { description: 'Embedding or chat completion error' }
        }
      }
    },
    '/api/highlight-proxy': {
      get: {
        tags: ['Highlight'],
        summary: 'Proxy a page and highlight matching text client-side',
        description:
          'Fetches the raw HTML of the given URL and injects a client-side highlighter script ' +
          'that finds and marks every occurrence of the query terms, then scrolls to the first ' +
          'match. Cheerio is deliberately not used here, raw HTML in, raw HTML out, injection only.',
        parameters: [
          { name: 'url', in: 'query', required: true, schema: { type: 'string', format: 'uri' } },
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Text to find and highlight' }
        ],
        responses: {
          200: { description: 'Proxied HTML page with highlighter injected', content: { 'text/html': {} } },
          400: { description: 'Missing url or q' },
          502: { description: 'Proxy fetch failed' }
        }
      }
    },
    '/api/health': {
      get: {
        tags: ['Health & Debug'],
        summary: 'Store size and per-source chunk counts',
        description: 'Use this to verify ingestion actually stored content before running queries.',
        responses: {
          200: {
            description: 'Health payload',
            content: {
              'application/json': {
                example: { ok: true, chunks: 12, sources: { 'Example|url_abc123': 12 } }
              }
            }
          }
        }
      }
    },
    '/api/debug/peek': {
      get: {
        tags: ['Health & Debug'],
        summary: 'Peek at a few stored rows',
        description: 'Quick sanity check on what actually got indexed after an ingest.',
        parameters: [
          { name: 'company', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 5, default: 2 } }
        ],
        responses: {
          200: {
            description: 'A few raw stored rows',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  count: 1,
                  rows: [{ company: 'Example', source_id: 'url_abc123', title: 'Return Policy', snippet: 'Returns are accepted within\u2026' }]
                }
              }
            }
          }
        }
      }
    },
    '/api/testpage': {
      get: {
        tags: ['Health & Debug'],
        summary: 'Static local test page',
        description: 'Deterministic local HTML page used to verify the highlight proxy works end-to-end without depending on any external site.',
        responses: {
          200: { description: 'Static HTML test page', content: { 'text/html': {} } }
        }
      }
    }
  }
};

export default swaggerSpec;
