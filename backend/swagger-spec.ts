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
  openapi: "3.0.3",

  info: {
    title: "Insight Engine API",
    version: "1.0.0",
    description:
      "Minimal Retrieval-Augmented Generation (RAG) server supporting document ingestion, semantic search, source highlighting, and diagnostics.\n\n" +
      "**Safety & bias guardrails on every /api/query response:**\n" +
      "- Every generated answer is run through OpenAI's moderation endpoint before being returned; flagged answers are withheld rather than shown (see the `safety` field below).\n" +
      "- Answers are flagged when grounded in a single source only, since one skewed or outdated document could otherwise appear broadly confirmed (see `source_diversity`).\n" +
      "- A standalone eval harness (`evals.js` / `evals.ts`, not an HTTP endpoint) checks refusal correctness, citation correctness, and retrieval precision against a fixed test set, and can gate CI."
  },

  externalDocs: {
    description: "Full write-up of the safety/bias guardrails and eval harness in the project README",
    url: "/README.md"
  },

  servers: [
    {
      url: "/",
      description: "Same-origin (Apache proxy in production, Vite proxy in dev)"
    }
  ],

  tags: [
    {
      name: "RAG",
      description: "Document ingestion and semantic querying"
    },
    {
      name: "Diagnostics",
      description: "Health and debugging endpoints"
    },
    {
      name: "Utility",
      description: "Highlighting and testing"
    }
  ],

  paths: {

    "/api/clear": {
      delete: {
        tags: ["RAG"],
        summary: "Clear the vector store",
        description:
          "Empties the in-memory vector store without requiring a full server restart. Added after real friction during testing: the store had no other way to reset between test rounds, so old ingested content silently stacked up forever and could dominate retrieval for unrelated later questions, with no visible signal that it was happening. Note: this endpoint has no authentication, same as every other endpoint in this MVP, anyone who finds it can wipe the store with one request.",
        responses: {
          "200": {
            description: "Store cleared",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    cleared_chunks: { type: "integer", description: "How many chunks were in the store before clearing." },
                    cleared_sources: { type: "integer", description: "How many distinct sources were in the store before clearing." }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/ingest": {
      post: {
        tags: ["RAG"],
        summary: "Ingest raw documents",
        description:
          "Splits supplied documents into chunks, creates embeddings, and stores them in the in-memory vector database.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["docs"],
                properties: {
                  docs: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["text"],
                      properties: {
                        id: {
                          type: "string"
                        },
                        text: {
                          type: "string"
                        },
                        meta: {
                          type: "object",
                          properties: {
                            title: {
                              type: "string"
                            },
                            company: {
                              type: "string"
                            },
                            source_url: {
                              type: "string",
                              format: "uri"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Documents ingested successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    chunks_added: { type: "integer" },
                    total_chunks: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/ingest-urls": {
      post: {
        tags: ["RAG"],
        summary: "Ingest web pages",
        description:
          "Downloads each URL, extracts readable text, creates embeddings, and stores them. Returns per-URL errors so a partial failure doesn't kill the whole batch. Each source's id is a SHA-256 hash of its full URL, not a truncated prefix, so two URLs sharing a long common path (e.g. two pages under the same /wiki/ path) can never collide into the same source.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["urls"],
                properties: {
                  urls: {
                    type: "array",
                    items: {
                      type: "string",
                      format: "uri"
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "URLs processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    urls_received: { type: "integer" },
                    urls_ingested: { type: "integer" },
                    chunks_added: { type: "integer" },
                    total_chunks: { type: "integer" },
                    errors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                          error: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/query": {
      post: {
        tags: ["RAG"],
        summary: "Query the vector store",
        description:
          "Performs semantic search over stored chunks and generates an answer grounded strictly in retrieved context. Every answer passes through two guardrails before being returned: a content-safety moderation check, and a source-diversity check (see the safety and source_diversity fields in the response).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["question"],
                properties: {
                  question: {
                    type: "string"
                  },
                  topK: {
                    type: "integer",
                    minimum: 1,
                    maximum: 8,
                    default: 4
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Answer generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: {
                      type: "boolean"
                    },
                    answer: {
                      type: "string",
                      description: "The grounded answer. If the safety check flagged it, this is replaced with a withheld-content notice instead of the original text."
                    },
                    safety: {
                      type: "object",
                      description: "Result of running the answer through OpenAI's moderation endpoint before returning it.",
                      properties: {
                        flagged: {
                          type: "boolean",
                          description: "True if the moderation check flagged this answer. When true, `answer` is replaced with a withheld-content message rather than the original text."
                        },
                        categories: {
                          type: "array",
                          items: { type: "string" },
                          description: "Which moderation categories were flagged, if any."
                        },
                        checked: {
                          type: "boolean",
                          description: "Present and false only if the moderation call itself errored out. The system fails closed on moderation errors: it does not block the response, but records that the check didn't actually run."
                        }
                      }
                    },
                    source_diversity: {
                      type: "object",
                      description: "Flags when an answer is grounded in a single source only, so a single skewed or outdated document isn't mistaken for broadly confirmed information.",
                      properties: {
                        unique_sources: {
                          type: "integer",
                          description: "How many distinct ingested sources contributed to this answer."
                        },
                        total_chunks_used: {
                          type: "integer",
                          description: "How many retrieved chunks were used to build the answer."
                        },
                        single_source_warning: {
                          type: "boolean",
                          description: "True if every chunk used came from the same single source."
                        }
                      }
                    },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          idx: {
                            type: "integer"
                          },
                          company: {
                            type: "string"
                          },
                          source_id: {
                            type: "string"
                          },
                          title: {
                            type: "string"
                          },
                          source_url: {
                            type: "string"
                          },
                          score: {
                            type: "number"
                          },
                          snippet: {
                            type: "string"
                          },
                          text_fragment_urls: {
                            type: "array",
                            items: {
                              type: "string"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/highlight-proxy": {
      get: {
        tags: ["Utility"],
        summary: "Highlight source text",
        description:
          "Fetches a page and injects a client-side highlighter so matching text is visually marked.",
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            schema: {
              type: "string",
              format: "uri"
            }
          },
          {
            name: "q",
            in: "query",
            required: true,
            schema: {
              type: "string"
            }
          }
        ],
        responses: {
          "200": {
            description: "HTML page"
          }
        }
      }
    },

    "/api/health": {
      get: {
        tags: ["Diagnostics"],
        summary: "Health check",
        description:
          "Returns vector store statistics and chunk counts.",
        responses: {
          "200": {
            description: "Server health"
          }
        }
      }
    },

    "/api/debug/peek": {
      get: {
        tags: ["Diagnostics"],
        summary: "Inspect stored chunks",
        parameters: [
          {
            name: "company",
            in: "query",
            schema: {
              type: "string"
            }
          },
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              default: 2,
              minimum: 1,
              maximum: 5
            }
          }
        ],
        responses: {
          "200": {
            description: "Stored chunks"
          }
        }
      }
    },

    "/api/testpage": {
      get: {
        tags: ["Utility"],
        summary: "Highlight test page",
        description:
          "Returns a deterministic HTML page for testing highlighting.",
        responses: {
          "200": {
            description: "HTML"
          }
        }
      }
    }

  }
};

export default swaggerSpec;
