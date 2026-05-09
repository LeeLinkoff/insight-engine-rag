// highlight-safe.js
// Export: injectHighlight(html, needle, { baseHref?, maxGap?, diag? })
//
// Works with server.js as-is:
//   const { injectHighlight } = require('./highlight-safe')
//
// Behavior:
// - Strips CSP <meta> that would block inline scripts.
// - Ensures <head> and <body> exist; injects <base href="..."> if baseHref provided.
// - Injects a small boot <script> with window.__needle / __hlOpt / __hlDiag,
//   then injects a standalone client highlighter (no external fetches).
// - Client highlights ALL ordered matches (tokens in order) with fuzzy tolerance
//   (edit distance <= 1 for tokens >= 4 chars).
// - If maxGap is too small and nothing is found, retries once with 800.
//

function stripCspMeta(html) {
  return String(html || '').replace(
    /<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>\s*/gi,
    ''
  );
}

function ensureHead(html) {
  return /<head[\s>]/i.test(html)
    ? html
    : html.replace(/<html[^>]*>/i, m => `${m}<head></head>`);
}

function ensureBody(html) {
  return /<body[\s>]/i.test(html)
    ? html
    : html.replace(/<\/head>/i, '</head><body></body>');
}

function removeExistingBase(html) {
  return String(html || '').replace(/<base[^>]*>\s*/gi, '');
}

/* ---------- CLIENT (runs inside the proxied page) ---------- */
const CLIENT_JS = `(function(){
  "use strict";
  try {
    var needle = (window.__needle || "").trim();
    var opt    = (window.__hlOpt  || {});
    var diag   = (window.__hlDiag || { enabled:false, mode:"console" });

    // Take server-provided maxGap; if it yields zero matches, we'll retry with 800.
    var MAXTOK_INITIAL = (typeof opt.maxGap === "number" && opt.maxGap > 0) ? opt.maxGap : 800;
    var OBS_MS = 8000;         // watch for late DOM up to 8s (helps on SPA-ish pages)
    var MAX_DOC_TOK = 300000;  // hard safety cap

    if (!needle) return;

    // --- diagnostics (optional) ---
    function log(info){ try { console.log("[HL]", info); } catch(_e){} }

    // --- token helpers ---
    function qTokensFrom(s){
      s = String(s||"").toLowerCase().replace(/\\u00A0/g," ").replace(/\\s+/g," ").trim();
      var arr = s.match(/[a-z0-9]+/g);
      return arr ? arr : [];
    }
    function docTokensFrom(all){
      var out=[], m, re=/[a-z0-9]+/gi;
      while((m=re.exec(all))!==null){
        out.push({ raw:m[0].toLowerCase(), start:m.index, end:m.index+m[0].length });
        if (out.length > MAX_DOC_TOK) break;
      }
      return out;
    }
    function editLeq1(a,b){
      if (a===b) return true;
      var la=a.length, lb=b.length, d=la-lb; if (d>1||d<-1) return false;
      var i=0,j=0,e=0;
      while(i<la && j<lb){
        if (a.charCodeAt(i)===b.charCodeAt(j)){ i++; j++; continue; }
        e++; if (e>1) return false;
        if (la===lb){ i++; j++; } else if (la>lb){ i++; } else { j++; }
      }
      if (i<la || j<lb) e++;
      return e<=1;
    }
    function approxEq(a,b){
      if (a===b) return true;
      // allow small typos only on reasonably long tokens to avoid over-highlighting
      if (a.length>=4 && b.length>=4) return editLeq1(a,b);
      return false;
    }

    // --- linearize visible text of <body> ---
    function collect(){
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var nodes=[], starts=[], parts=[], acc=0, n;
      while (walker.nextNode()){
        n = walker.currentNode;
        var t = n.nodeValue || "";
        if (!t.trim()) continue;
        nodes.push(n);
        starts.push(acc);
        parts.push(t);
        acc += t.length + 1; // single space separator
      }
      return { nodes:nodes, starts:starts, parts:parts };
    }

    // --- find ALL ordered fuzzy windows within MAXTOK token span ---
    function findAllWindows(docToks, qToks, MAXTOK){
      var ranges = [];
      if (!docToks.length || !qToks.length) return ranges;
      for (var i=0; i<docToks.length; i++){
        if (!approxEq(docToks[i].raw, qToks[0])) continue;
        var qi=1, k=i+1;
        while(qi<qToks.length && k<docToks.length){
          if (approxEq(docToks[k].raw, qToks[qi])) qi++;
          k++;
          if ((k - i) > MAXTOK) break; // window too wide
        }
        if (qi === qToks.length){
          ranges.push({ start: docToks[i].start, end: docToks[k-1].end });
        }
      }
      // merge overlaps
      if (ranges.length > 1){
        ranges.sort(function(a,b){ return a.start - b.start; });
        var merged = [ranges[0]];
        for (var r=1; r<ranges.length; r++){
          var last = merged[merged.length-1], cur = ranges[r];
          if (cur.start <= last.end){
            if (cur.end > last.end) last.end = cur.end;
          } else merged.push(cur);
        }
        ranges = merged;
      }
      return ranges;
    }

    // --- wrap helpers (avoid surroundContents for robustness) ---
    function wrapSlice(node, from, to){
      var txt = node.nodeValue || "";
      if (from < 0) from = 0;
      if (to > txt.length) to = txt.length;
      if (from >= to) return null;
      var mid  = node.splitText(from);
      var tail = mid.splitText(to - from);
      var mark = document.createElement("mark"); // default browser styling
      mark.appendChild(mid);
      tail.parentNode.insertBefore(mark, tail);
      return mark;
    }
    function applyRange(nodes, starts, parts, gStart, gEnd){
      var si=0;
      while (si<starts.length && (starts[si] + (parts[si]?parts[si].length:0)) <= gStart) si++;
      if (si>0) si--;
      if (si>=nodes.length) return null;

      var ei=si;
      while (ei<starts.length && (starts[ei] + (parts[ei]?parts[ei].length:0)) < gEnd) ei++;
      if (ei>=nodes.length) ei=nodes.length-1;

      var first=null;
      for (var idx=si; idx<=ei; idx++){
        var node      = nodes[idx];
        var nodeStart = starts[idx];
        var nodeLen   = (node.nodeValue||"").length;
        var from = Math.max(0, gStart - nodeStart);
        var to   = Math.min(nodeLen, gEnd - nodeStart);
        if (to <= 0 || from >= nodeLen) continue;
        var m = wrapSlice(node, from, to);
        if (!first && m) first = m;
      }
      return first;
    }

    function runOnceWithMaxGap(MAXTOK){
      var c = collect();
      if (c.parts.length === 0) return 0;

      var all     = c.parts.join(" ");
      var docToks = docTokensFrom(all);
      var qToks   = qTokensFrom(needle);
      if (!qToks.length || !docToks.length) return 0;

      var ranges  = findAllWindows(docToks, qToks, MAXTOK);
      if (!ranges.length) return 0;

      // apply from end -> start to keep indexes stable
      for (var i=ranges.length-1; i>=0; i--){
        applyRange(c.nodes, c.starts, c.parts, ranges[i].start, ranges[i].end);
      }
      // scroll first mark into view
      var first = document.querySelector("mark");
      if (first && first.scrollIntoView) first.scrollIntoView({ behavior: "auto", block: "center" });
      return ranges.length;
    }

    function ready(fn){
      if (document.readyState === "complete" || document.readyState === "interactive"){
        setTimeout(fn, 0);
      } else {
        document.addEventListener("DOMContentLoaded", fn, { once:true });
      }
    }

    ready(function(){
      // First attempt: user/server-provided maxGap
      var count = runOnceWithMaxGap(MAXTOK_INITIAL);
      if (!count && MAXTOK_INITIAL < 800){
        // Safety retry with 800 (fixes too-small windows on long pages)
        if (diag.enabled) log({ retry: true, prevMaxGap: MAXTOK_INITIAL, newMaxGap: 800 });
        count = runOnceWithMaxGap(800);
      }
      if (count) return;

      // Watch for late content (SPAs)
      var deadline = Date.now() + OBS_MS;
      var mo = new MutationObserver(function(){
        if (Date.now() > deadline){ mo.disconnect(); return; }
        var c = runOnceWithMaxGap(800);
        if (c){ mo.disconnect(); }
      });
      try { mo.observe(document.body, { childList:true, subtree:true, characterData:true }); } catch(_e){}

      // Light polling as last resort
      var tries = 20;
      (function tick(){
        var c = runOnceWithMaxGap(800);
        if (c) return;
        if (--tries <= 0) return;
        setTimeout(tick, 200);
      })();
    });

  } catch(_e){}
})();`;

/**
 * injectHighlight(html, needle, opts)
 * @param {string} html
 * @param {string} needle
 * @param {object} opts - { baseHref?, maxGap?, diag? }
 * @returns {string} modified HTML with inline <script> boot + client highlighter
 */
function injectHighlight(html, needle, opts = {}) {
  const {
    baseHref,
    maxGap, // number (tokens); if too small and no match, client retries at 800 automatically
    diag = { enabled: false, mode: 'console' } // or 'overlay' if you later add an overlay
  } = opts;

  let out = stripCspMeta(String(html || ''));
  out = ensureHead(out);
  out = ensureBody(out);

  if (baseHref) {
    out = removeExistingBase(out);
    out = out.replace(/<head[^>]*>/i, m => `${m}<base href="${baseHref}">`);
  }

  // Inject boot script at END of body
  const boot = `
<script>
  window.__needle = ${JSON.stringify(String(needle || ''))};
  window.__hlOpt  = { ${typeof maxGap === 'number' && maxGap > 0 ? `maxGap:${Math.floor(maxGap)}` : ''} };
  window.__hlDiag = ${JSON.stringify(diag || { enabled:false, mode:'console' })};
</script>
<script>${CLIENT_JS}</script>`;

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, boot + '</body>');
  } else {
    out += boot;
  }

  return out;
}

module.exports = { injectHighlight };
