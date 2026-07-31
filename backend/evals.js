// evals.js
//
// Minimal eval harness for Insight Engine's /api/query endpoint.
//
// What this checks
// -----------------
// For each test case, we know in advance:
//   - the question
//   - which source_id(s) SHOULD be cited in a correct answer
//   - whether the correct behavior is an ANSWER or a REFUSAL
//     (refusal = the strict "I'm not certain from the provided documents." fallback)
//
// We call the live /api/query endpoint, then check:
//   1. Refusal correctness: did the model refuse when it should have, and answer when it should have?
//   2. Citation correctness: for answered questions, did the returned sources include
//      at least one of the expected source_id(s)? (grounding check, not exact-match,
//      since chunk boundaries can shift wording)
//   3. Retrieval precision: of the chunks actually retrieved (topK), what fraction
//      came from an expected source_id vs. an irrelevant one
//
// This is intentionally simple: no external eval framework, no LLM-graded scoring.
// Deterministic, cheap to run, and easy to extend with more cases.
//
// Usage
// -----
//   1. Start the server (node server.js)
//   2. Ingest the docs referenced in TEST_CASES below via /api/ingest or /api/ingest-urls
//   3. node evals.js
//
// Exit code is 0 if all cases pass, 1 if any fail (so this can gate CI).

'use strict';

const BASE_URL = process.env.EVAL_BASE_URL || 'http://127.0.0.1:3001';

// ─── Test Cases ────────────────────────────────────────────────────────────
// Fill in real source_ids that exist in your vector store after ingestion.
// expect: 'answer' means the model should produce a grounded answer citing
//         one of expected_source_ids. expect: 'refusal' means no ingested
//         content should support an answer, and the model must say so.
const TEST_CASES = [
  {
    name: 'known_fact_in_store',
    // Real ingested page: https://en.wikipedia.org/wiki/Return_policy
    // Broad, central question for that page so retrieval reliably pulls
    // from it regardless of which specific chunks score highest.
    question: 'What does this document explain about return policies?',
    expect: 'answer',
    // Real source_id, verified deterministic (SHA-256 hash of the URL,
    // not random/time-based — same URL always produces this exact id).
    // If the URL ever changes or the hashing logic in server.js changes,
    // this needs updating to match.
    expected_source_ids: ['url_9jZgqnjjV0uNjzFv']
  },
  {
    name: 'question_with_no_grounding',
    question: 'What is the capital of a country never mentioned in any ingested document?',
    expect: 'refusal',
    expected_source_ids: []
  }
  // Add more cases here as real documents get ingested.
];

const REFUSAL_TEXT = "I'm not certain from the provided documents"; // no trailing period: the empty-store message appends "(none ingested yet)." right after this phrase, so matching without the period catches both refusal variants

async function runCase(tc) {
  const resp = await fetch(BASE_URL + '/api/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: tc.question, topK: 4 })
  });
  const data = await resp.json();

  const result = {
    name: tc.name,
    question: tc.question,
    pass: true,
    reasons: []
  };

  if (!data.ok) {
    result.pass = false;
    result.reasons.push('Request failed: ' + (data.error || 'unknown error'));
    return result;
  }

  const gotRefusal = (data.answer || '').indexOf(REFUSAL_TEXT) !== -1;

  // 1. Refusal correctness
  if (tc.expect === 'refusal' && !gotRefusal) {
    result.pass = false;
    result.reasons.push('Expected refusal but got an answer: "' + data.answer + '"');
  }
  if (tc.expect === 'answer' && gotRefusal) {
    result.pass = false;
    result.reasons.push('Expected a grounded answer but model refused');
  }

  // 2. Citation correctness (only meaningful when an answer was expected)
  if (tc.expect === 'answer' && !gotRefusal) {
    const returnedSourceIds = (data.sources || []).map(s => s.source_id);
    const hasExpectedSource = tc.expected_source_ids.some(id => returnedSourceIds.indexOf(id) !== -1);
    if (tc.expected_source_ids.length && !hasExpectedSource) {
      result.pass = false;
      result.reasons.push(
        'Answer did not cite any expected source. Expected one of ' +
        JSON.stringify(tc.expected_source_ids) + ', got ' + JSON.stringify(returnedSourceIds)
      );
    }

    // 3. Retrieval precision: fraction of retrieved chunks from an expected source
    if (tc.expected_source_ids.length && returnedSourceIds.length) {
      const relevant = returnedSourceIds.filter(id => tc.expected_source_ids.indexOf(id) !== -1).length;
      result.retrieval_precision = Number((relevant / returnedSourceIds.length).toFixed(2));
    }
  }

  // Surface safety/bias flags from the server so a failing eval run also
  // catches responses that were withheld or built from a single source.
  if (data.safety && data.safety.flagged) {
    result.reasons.push('Response was flagged by moderation and withheld');
  }
  if (data.source_diversity && data.source_diversity.single_source_warning) {
    result.reasons.push('Warning: answer grounded in a single source only');
  }

  return result;
}

async function main() {
  console.log('Running', TEST_CASES.length, 'eval case(s) against', BASE_URL);
  const results = [];
  for (const tc of TEST_CASES) {
    const r = await runCase(tc);
    results.push(r);
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name + (r.retrieval_precision != null ? ' (precision=' + r.retrieval_precision + ')' : ''));
    if (r.reasons.length) r.reasons.forEach(msg => console.log('   - ' + msg));
  }
  const failed = results.filter(r => !r.pass).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('EVAL RUNNER ERROR:', e);
  process.exit(1);
});
