// swagger-spec.js
//
// Static OpenAPI 3.0 spec for Insight Engine's backend.
//
// This file is the single source of truth for the Swagger/OpenAPI
// documentation. Whenever an endpoint implementation changes in
// server.js, update this file in the same commit so the documentation
// cannot drift from the implementation.
//

'use strict';

const swaggerSpec = {
  openapi: '3.0.3',

  info: {
    title: 'Insight Engine API',
    version: '1.1.0',

    description:
      'A lightweight Retrieval Augmented Generation (RAG) service with source highlighting.\n\n' +

      'Workflow:\n' +
      '• Ingest documents or web pages.\n' +
      '• Ask natural language questions.\n' +
      '• Retrieve the most relevant chunks.\n' +
      '• Generate a grounded answer.\n' +
      '• Verify the answer directly against the original source.\n\n' +

      'Every answer includes bracket citations using the format:\n' +
      '`[index|Company|source_id]`\n\n' +

      'Every generated answer is moderated before being returned.\n' +
      'Responses also include source-diversity information so callers can detect when an answer relies on only a single document.'
  },

  servers: [
    {
      url: '/',
      description: 'Same-origin'
    }
  ],

  tags: [
    {
      name: 'Ingest',
      description: 'Load documents into the in-memory vector store'
    },
    {
      name: 'Query',
      description: 'Question answering against ingested documents'
    },
    {
      name: 'Highlight',
      description: 'Highlight original source pages'
    },
    {
      name: 'Health & Debug',
      description: 'Diagnostics'
    }
  ],

  components: {
    schemas: {

      ErrorResponse: {
        type: 'object',
        required: ['ok','error'],
        properties: {
          ok: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'string'
          }
        }
      },

      Safety: {
        type: 'object',
        description:
          'Result returned from the moderation endpoint.',

        properties: {

          flagged: {
            type: 'boolean',
            description:
              'True when the generated answer was blocked.'
          },

          categories: {
            type: 'array',
            description:
              'Triggered moderation categories.',
            items: {
              type: 'string'
            }
          }
        }
      },

      SourceDiversity: {
        type: 'object',

        description:
          'Information describing how many independent documents supported the answer.',

        properties: {

          unique_sources: {
            type: 'integer',
            description:
              'Distinct source_ids used.'
          },

          total_chunks_used: {
            type: 'integer',
            description:
              'Total retrieved chunks passed to the model.'
          },

          single_source_warning: {
            type: 'boolean',
            description:
              'True when every retrieved chunk originated from one document.'
          }
        }
      },

      Source: {
        type: 'object',

        properties: {

          idx: {
            type: 'integer'
          },

          company: {
            type: 'string'
          },

          source_id: {
            type: 'string'
          },

          title: {
            type: 'string',
            nullable: true
          },

          source_url: {
            type: 'string',
            nullable: true
          },

          score: {
            type: 'number',
            format: 'float'
          },

          snippet: {
            type: 'string'
          },

          text_fragment_urls: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      },

      QueryResponse: {
        type: 'object',

        required: [
          'ok',
          'answer',
          'safety',
          'source_diversity',
          'sources'
        ],

        properties: {

          ok: {
            type: 'boolean'
          },

          answer: {
            type: 'string',
            description:
              'Grounded answer. Citations appear as [index|Company|source_id].'
          },

          safety: {
            $ref: '#/components/schemas/Safety'
          },

          source_diversity: {
            $ref: '#/components/schemas/SourceDiversity'
          },

          sources: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Source'
            }
          }
        }
      }
    }
  },

  paths: {