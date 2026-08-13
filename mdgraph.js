/*!
 * MDGraph — standalone Markdown-style diagram renderer with a presentation
 * animation timeline. Zero dependencies. Works as a <script> global (MDGraph)
 * or as an ES module (import MDGraph from './mdgraph.js').
 *
 * Pipeline:  text -> parse() -> layout() -> render() -> Player
 *
 * Supported input:
 *   - Flowchart / graph definitions (mermaid-flavoured, a practical subset)
 *   - Markdown pipe tables (rendered, animatable by row)
 *   - An animation timeline (inline `@step` directives, or the JS API)
 *
 * License: MIT
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.MDGraph = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ------------------------------------------------------------------ *
   * Themes
   * ------------------------------------------------------------------ */
  var THEMES = {
    light: {
      bg: '#ffffff', surface: '#f4f6fb', text: '#0f172a', subtext: '#475569',
      node: '#eef2ff', nodeStroke: '#6366f1', edge: '#94a3b8', edgeLabel: '#334155',
      accent: '#6366f1', flow: '#6366f1', glow: '#6366f1',
      palette: ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899'],
      font: '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      grid: 'rgba(15,23,42,0.05)'
    },
    dark: {
      bg: '#0b1020', surface: '#141a2e', text: '#e2e8f0', subtext: '#94a3b8',
      node: '#1e2440', nodeStroke: '#7c8cff', edge: '#4b5578', edgeLabel: '#cbd5e1',
      accent: '#7c8cff', flow: '#8ab4ff', glow: '#7c8cff',
      palette: ['#7c8cff', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#c084fc', '#2dd4bf', '#f472b6'],
      font: '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      grid: 'rgba(255,255,255,0.04)'
    },
    neon: {
      bg: '#05060a', surface: '#0b0f1c', text: '#e8fbff', subtext: '#7bdff2',
      node: '#0d1830', nodeStroke: '#22d3ee', edge: '#1f7a8c', edgeLabel: '#9becff',
      accent: '#22d3ee', flow: '#39ff14', glow: '#22d3ee',
      palette: ['#22d3ee', '#39ff14', '#ff2e97', '#ffe600', '#9d4edd', '#00e5ff', '#ff6b00', '#ff477e'],
      font: '700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      grid: 'rgba(34,211,238,0.06)'
    },
    blueprint: {
      bg: '#0a2540', surface: '#0e2f52', text: '#dbeafe', subtext: '#93c5fd',
      node: '#123a63', nodeStroke: '#7dd3fc', edge: '#5aa0d6', edgeLabel: '#bfdbfe',
      accent: '#7dd3fc', flow: '#e0f2fe', glow: '#7dd3fc',
      palette: ['#7dd3fc', '#a5f3fc', '#bae6fd', '#e0f2fe', '#38bdf8', '#0ea5e9', '#60a5fa', '#93c5fd'],
      font: '600 14px ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif',
      grid: 'rgba(125,211,252,0.10)'
    },
    mono: {
      bg: '#ffffff', surface: '#fafafa', text: '#111111', subtext: '#555555',
      node: '#f2f2f2', nodeStroke: '#111111', edge: '#888888', edgeLabel: '#333333',
      accent: '#111111', flow: '#111111', glow: '#555555',
      palette: ['#111111', '#444444', '#777777', '#999999', '#222222', '#555555', '#333333', '#666666'],
      font: '600 14px ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif',
      grid: 'rgba(0,0,0,0.05)'
    }
  };

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    return el;
  }
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i]; if (!s) continue;
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var _measureCtx = null;
  function measureText(text, font) {
    text = text == null ? '' : String(text);
    if (typeof document === 'undefined') return { w: text.length * 8, h: 16, lines: [text], fontSize: 14 };
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    _measureCtx.font = font;
    var lines = String(text).split('\n');
    var w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, _measureCtx.measureText(lines[i]).width);
    var fs = parseInt(/(\d+)px/.exec(font) ? /(\d+)px/.exec(font)[1] : 14, 10);
    return { w: w, h: lines.length * (fs + 4), lines: lines, fontSize: fs };
  }

  /* ------------------------------------------------------------------ *
   * PARSER
   * ------------------------------------------------------------------ */
  var SHAPE_PATTERNS = [
    { re: /^\(\[(.*)\]\)$/, shape: 'stadium' },
    { re: /^\[\[(.*)\]\]$/, shape: 'subroutine' },
    { re: /^\[\((.*)\)\]$/, shape: 'cylinder' },
    { re: /^\(\((.*)\)\)$/, shape: 'circle' },
    { re: /^\{\{(.*)\}\}$/, shape: 'hexagon' },
    { re: /^\{(.*)\}$/, shape: 'diamond' },
    { re: /^\[(.*)\]$/, shape: 'rect' },
    { re: /^\((.*)\)$/, shape: 'round' },
    { re: /^>(.*)\]$/, shape: 'flag' }
  ];

  // Edge operator: captures optional inline label ` -->|txt| ` or `-- txt -->`
  var DIR_ALIASES = {
    TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL'
  };

  function unquote(s) {
    s = s.trim();
    if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))
      return s.slice(1, -1);
    return s;
  }

  function parseNodeToken(tok, nodes, order) {
    tok = tok.trim();
    if (!tok) return null;
    // id + optional shape+label
    var m = /^([A-Za-z0-9_.\-]+)\s*(.*)$/.exec(tok);
    if (!m) return null;
    var id = m[1], rest = m[2].trim();
    var shape = 'rect', label = id, hasDef = false;
    if (rest) {
      for (var i = 0; i < SHAPE_PATTERNS.length; i++) {
        var sm = SHAPE_PATTERNS[i].re.exec(rest);
        if (sm) { shape = SHAPE_PATTERNS[i].shape; label = unquote(sm[1]); hasDef = true; break; }
      }
    }
    if (!nodes[id]) {
      nodes[id] = { id: id, label: label, shape: shape, klass: null };
      order.push(id);
    } else if (hasDef) {
      nodes[id].label = label; nodes[id].shape = shape;
    }
    return id;
  }

  // Split a graph line into node/edge tokens by recognising edge operators.
  // Returns list of {type:'node',token} | {type:'edge', op, label, bidir, style, arrow}
  var EDGE_RE = /\s*(<?[=\-.o x]*[=\->ox|]*(?:\|[^|]*\|)?[=\->ox]*)\s*/;

  function classifyEdge(opRaw, explicitLabel) {
    // opRaw is the raw operator text between two nodes, may contain |label|
    var label = explicitLabel != null ? unquote(explicitLabel) : null;
    var op = opRaw;
    var lm = /\|([^|]*)\|/.exec(op);
    if (lm && label == null) { label = unquote(lm[1]); }
    op = op.replace(/\|[^|]*\|/, '').trim();
    var style = 'solid';
    if (/\./.test(op)) style = 'dotted';
    else if (/=/.test(op)) style = 'thick';
    var startArrow = /^</.test(op) || /^o/.test(op) || /^x/.test(op);
    var endArrow = />$/.test(op) || /o$/.test(op) || /x$/.test(op) || />/.test(op);
    var bidir = startArrow && endArrow;
    var endTip = />$/.test(op) ? 'arrow' : /o$/.test(op) ? 'circle' : /x$/.test(op) ? 'cross' : 'none';
    var startTip = /^</.test(op) ? 'arrow' : /^o/.test(op) ? 'circle' : /^x/.test(op) ? 'cross' : 'none';
    // plain `---` line with no head
    if (!/[<>ox]/.test(op)) { endTip = 'none'; startTip = 'none'; }
    return { label: label, style: style, bidir: bidir, endTip: endTip, startTip: startTip };
  }

  // Robust edge tokeniser: splits a line into node / edge tokens.
  // Supports:  A --> B   A -->|label| B   A -- label --> B   A <--> B   A -.-> B   A ==> B
  function tokenizeGraphLine(line) {
    // Normalise the middle-label form "A -- text --> B" into the pipe form
    // "A --->|text| B" so a single operator regex can handle everything.
    line = line.replace(/([-.=]{2,})\s+([^\s|<>=.-][^|<>]*?)\s+([-.=]{2,}[>ox]?)(?=\s|$)/g, '$1$3|$2|');
    // operator, then an optional trailing |label|
    var re = /\s*([<ox]?[-.=]{2,}[>ox]?)\s*(?:\|([^|]*)\|)?\s*/g;
    var parts = [];
    var last = 0, m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push({ type: 'node', token: line.slice(last, m.index) });
      parts.push({ type: 'edge', op: m[1], label: m[2] != null ? m[2] : null });
      last = re.lastIndex;
    }
    if (last < line.length) parts.push({ type: 'node', token: line.slice(last) });
    return parts;
  }

  function parse(text, opts) {
    opts = opts || {};
    var lines = String(text).replace(/\r\n/g, '\n').split('\n');
    var nodes = {}, order = [], edges = [];
    var classes = {};        // classDef
    var nodeClass = {};      // id -> class name
    var direction = 'TB';
    var anim = [];
    var tables = [];
    var title = null;
    var mode = 'graph';
    var tableBuf = [];
    var edgeSeq = 0;

    function flushTable() {
      if (tableBuf.length >= 2) {
        var rows = tableBuf.map(function (r) {
          return r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
        });
        // second row is the separator ---|---
        var isSep = /^[\s:|-]+$/.test(tableBuf[1]);
        var header = rows[0];
        var body = isSep ? rows.slice(2) : rows.slice(1);
        tables.push({ header: header, rows: body });
      }
      tableBuf = [];
    }

    for (var li = 0; li < lines.length; li++) {
      var raw = lines[li];
      var line = raw.trim();
      if (!line) { if (tableBuf.length) flushTable(); continue; }

      // Animation directive
      if (/^@/.test(line)) { var st = parseAnimDirective(line); if (st) anim.push(st); continue; }

      // Title
      var tm = /^title\s*:\s*(.+)$/i.exec(line);
      if (tm) { title = unquote(tm[1]); continue; }

      // classDef  name  fill:#..,stroke:#..
      var cd = /^classDef\s+([A-Za-z0-9_]+)\s+(.+)$/.exec(line);
      if (cd) { classes[cd[1]] = parseStyleProps(cd[2]); continue; }
      // class  id1,id2  name
      var cl = /^class\s+([A-Za-z0-9_,.\-\s]+)\s+([A-Za-z0-9_]+)$/.exec(line);
      if (cl) { cl[1].split(',').forEach(function (id) { nodeClass[id.trim()] = cl[2]; }); continue; }

      // header
      var hm = /^(graph|flowchart)\s+([A-Za-z]{2})\b(.*)$/i.exec(line);
      if (hm) { direction = DIR_ALIASES[hm[2].toUpperCase()] || 'TB'; mode = 'graph'; continue; }

      // comment
      if (/^%%/.test(line) || /^\/\//.test(line)) continue;

      // Markdown table row
      if (/^\|.*\|/.test(line) || (tableBuf.length && /\|/.test(line))) {
        if (/\|/.test(line)) { tableBuf.push(line); continue; }
      } else if (tableBuf.length) { flushTable(); }

      // Graph line
      var parts = tokenizeGraphLine(line);
      if (parts.length === 1) {
        // pure node declaration(s), maybe `A[x]` or standalone id
        parseNodeToken(parts[0].token, nodes, order);
        continue;
      }
      // chain: node (edge node)*
      var prevId = null;
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        if (p.type === 'node') {
          var nid = parseNodeToken(p.token, nodes, order);
          if (prevId && nid && p._pendingEdge) {
            edges.push(makeEdge(prevId, nid, p._pendingEdge, edgeSeq++));
          }
          if (nid) prevId = nid;
        } else if (p.type === 'edge') {
          // attach to next node
          if (pi + 1 < parts.length && parts[pi + 1].type === 'node') {
            parts[pi + 1]._pendingEdge = classifyEdge(p.op, p.label);
          }
        }
      }
    }
    if (tableBuf.length) flushTable();

    // resolve node classes / palette colours
    var nodeList = order.map(function (id, i) {
      var n = nodes[id];
      var cls = nodeClass[id];
      n.style = cls && classes[cls] ? classes[cls] : null;
      n._i = i;
      return n;
    });

    return {
      direction: direction, nodes: nodeList, nodeMap: nodes, edges: edges,
      classes: classes, tables: tables, anim: anim, title: title
    };
  }

  function makeEdge(from, to, info, seq) {
    return {
      id: 'e' + seq, from: from, to: to,
      label: info.label, style: info.style, bidir: info.bidir,
      endTip: info.endTip, startTip: info.startTip
    };
  }

  function parseStyleProps(str) {
    var o = {};
    str.split(/[,;]/).forEach(function (kv) {
      var m = /^\s*([\w-]+)\s*:\s*(.+)\s*$/.exec(kv);
      if (m) o[m[1].trim()] = m[2].trim();
    });
    return o;
  }

  /* ------------------------------------------------------------------ *
   * Animation directive grammar
   *   @<action> <targets> [tokens...]
   *   targets: A  |  A->B  |  A,B  |  A->B,C->D  |  *
   *   tokens:  2s 1500ms  color:#f80  color:red  both bidir  back
   *            delay:0.5s width:4  say:"caption"  hold
   * ------------------------------------------------------------------ */
  function parseAnimDirective(line) {
    var m = /^@(\w+)\s*(.*)$/.exec(line);
    if (!m) return null;
    var action = m1lower(m[1]);
    var rest = m[2].trim();
    // pull say:"..." first (may contain spaces)
    var say = null;
    var sm = /\bsay:\s*("([^"]*)"|'([^']*)'|(\S+))/.exec(rest);
    if (sm) { say = sm[2] != null ? sm[2] : sm[3] != null ? sm[3] : sm[4]; rest = rest.replace(sm[0], '').trim(); }
    var toks = rest.length ? rest.split(/\s+/) : [];
    var step = {
      action: action, targets: [], nodes: [], edges: [],
      dur: null, delay: 0, color: null, width: null,
      dir: 'forward', bidir: false, say: say, hold: false
    };
    var targetToken = null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (/^\d+(\.\d+)?m?s$/.test(t)) { step.dur = parseDur(t); continue; }
      if (/^delay:/.test(t)) { step.delay = parseDur(t.slice(6)); continue; }
      if (/^color:/.test(t)) { step.color = t.slice(6); continue; }
      if (/^c:/.test(t)) { step.color = t.slice(2); continue; }
      if (/^width:/.test(t)) { step.width = parseFloat(t.slice(6)); continue; }
      if (/^(both|bidir|bi)$/i.test(t)) { step.bidir = true; continue; }
      if (/^(back|reverse|rev)$/i.test(t)) { step.dir = 'backward'; continue; }
      if (/^(fwd|forward)$/i.test(t)) { step.dir = 'forward'; continue; }
      if (/^hold$/i.test(t)) { step.hold = true; continue; }
      // otherwise treat as target spec
      targetToken = targetToken ? targetToken + ' ' + t : t;
    }
    if (targetToken) parseTargets(targetToken, step);
    return step;
  }
  function m1lower(s) { return String(s).toLowerCase(); }
  function parseDur(t) {
    var m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(t.trim());
    if (!m) return null;
    var v = parseFloat(m[1]);
    return m[2] === 'ms' ? v : v * 1000;
  }
  function parseTargets(str, step) {
    str.split(',').forEach(function (chunk) {
      chunk = chunk.trim(); if (!chunk) return;
      var em = /^([A-Za-z0-9_.]+)\s*(?:->|~>|=>|>)\s*([A-Za-z0-9_.]+)$/.exec(chunk);
      if (em) { step.edges.push({ from: em[1], to: em[2] }); step.targets.push(chunk); }
      else { step.nodes.push(chunk); step.targets.push(chunk); }
    });
  }

  /* ------------------------------------------------------------------ *
   * LAYOUT  (layered / Sugiyama-lite)
   * ------------------------------------------------------------------ */
  function layout(graph, cfg) {
    cfg = cfg || {};
    var theme = cfg.theme;
    var horiz = graph.direction === 'LR' || graph.direction === 'RL';
    var rankSep = cfg.rankSep != null ? cfg.rankSep : (horiz ? 110 : 90);
    var nodeSep = cfg.nodeSep != null ? cfg.nodeSep : 44;
    var padX = 28, padY = 28;

    var nodes = graph.nodes, edges = graph.edges, map = {};
    nodes.forEach(function (n) { map[n.id] = n; });

    // ensure endpoints exist
    edges.forEach(function (e) {
      [e.from, e.to].forEach(function (id) {
        if (id == null) return;
        if (!map[id]) { var n = { id: id, label: id, shape: 'rect', _i: nodes.length }; map[id] = n; nodes.push(n); }
      });
    });

    // size nodes
    nodes.forEach(function (n) { sizeNode(n, theme); });

    // adjacency
    var adj = {}, indeg = {};
    nodes.forEach(function (n) { adj[n.id] = []; indeg[n.id] = 0; });
    edges.forEach(function (e) { if (map[e.from] && map[e.to]) { adj[e.from].push(e.to); } });

    // detect back edges via DFS to break cycles for ranking
    var color = {}, back = {};
    function dfs(u) {
      color[u] = 1;
      adj[u].forEach(function (v) {
        if (color[v] === 1) back[u + '->' + v] = true; // back edge
        else if (!color[v]) dfs(v);
      });
      color[u] = 2;
    }
    nodes.forEach(function (n) { if (!color[n.id]) dfs(n.id); });

    // longest-path ranking ignoring back edges
    var rank = {};
    nodes.forEach(function (n) { indeg[n.id] = 0; });
    edges.forEach(function (e) { if (map[e.from] && map[e.to] && !back[e.from + '->' + e.to]) indeg[e.to]++; });
    var queue = nodes.filter(function (n) { return indeg[n.id] === 0; }).map(function (n) { return n.id; });
    nodes.forEach(function (n) { rank[n.id] = 0; });
    var seen = {}, guard = 0, maxGuard = nodes.length * nodes.length + 10;
    while (queue.length && guard++ < maxGuard) {
      var u = queue.shift();
      adj[u].forEach(function (v) {
        if (back[u + '->' + v]) return;
        if (rank[v] < rank[u] + 1) rank[v] = rank[u] + 1;
        if (--indeg[v] <= 0 && !seen[v]) { seen[v] = 1; queue.push(v); }
      });
    }

    // group by rank
    var maxRank = 0;
    nodes.forEach(function (n) { maxRank = Math.max(maxRank, rank[n.id]); });
    var layers = [];
    for (var r = 0; r <= maxRank; r++) layers.push([]);
    // stable initial order by declaration index
    nodes.slice().sort(function (a, b) { return a._i - b._i; }).forEach(function (n) {
      layers[rank[n.id]].push(n.id);
    });

    // crossing reduction: median heuristic sweeps
    var pos = {};
    function reindex() { layers.forEach(function (L) { L.forEach(function (id, i) { pos[id] = i; }); }); }
    reindex();
    var pred = {}, succ = {};
    nodes.forEach(function (n) { pred[n.id] = []; succ[n.id] = []; });
    edges.forEach(function (e) {
      if (!map[e.from] || !map[e.to]) return;
      if (back[e.from + '->' + e.to]) { succ[e.to].push(e.from); pred[e.from].push(e.to); }
      else { succ[e.from].push(e.to); pred[e.to].push(e.from); }
    });
    function median(nes) {
      if (!nes.length) return -1;
      var ps = nes.map(function (id) { return pos[id]; }).sort(function (a, b) { return a - b; });
      var m = Math.floor(ps.length / 2);
      return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
    }
    for (var sweep = 0; sweep < 6; sweep++) {
      var down = sweep % 2 === 0;
      var range = down ? rangeArr(1, layers.length) : rangeArr(layers.length - 2, -1);
      range.forEach(function (ri) {
        var neighbours = down ? pred : succ;
        layers[ri] = layers[ri].map(function (id) { return { id: id, m: median(neighbours[id]) }; })
          .sort(function (a, b) { return (a.m < 0 ? 1e9 : a.m) - (b.m < 0 ? 1e9 : b.m); })
          .map(function (o) { return o.id; });
      });
      reindex();
    }

    // coordinate assignment
    // cross-axis position per node within layer, main-axis per layer
    var layerMain = [];   // main coordinate for each layer
    var mainCursor = (horiz ? padX : padY);
    for (var r2 = 0; r2 < layers.length; r2++) {
      // layer extent on main axis = max node main-size
      var ext = 0;
      layers[r2].forEach(function (id) { ext = Math.max(ext, horiz ? map[id].w : map[id].h); });
      layerMain[r2] = mainCursor + ext / 2;
      mainCursor += ext + rankSep;
    }

    // cross positions: pack within each layer, then center layers
    var crossExtent = 0;
    layers.forEach(function (L, r3) {
      var c = (horiz ? padY : padX);
      L.forEach(function (id) {
        var n = map[id];
        var half = (horiz ? n.h : n.w) / 2;
        c += half;
        n._cross = c;
        c += half + nodeSep;
      });
      crossExtent = Math.max(crossExtent, c - nodeSep);
    });
    // center each layer around crossExtent/2
    layers.forEach(function (L) {
      if (!L.length) return;
      var first = map[L[0]], last = map[L[L.length - 1]];
      var lo = first._cross - (horiz ? first.h : first.w) / 2;
      var hi = last._cross + (horiz ? last.h : last.w) / 2;
      var shift = (crossExtent - (hi - lo)) / 2 - lo + (horiz ? padY : padX);
      L.forEach(function (id) { map[id]._cross += shift; });
    });

    // assign x/y and handle direction reversal (RL / BT)
    var totalMain = mainCursor - rankSep + (horiz ? padX : padY);
    nodes.forEach(function (n) {
      var m = layerMain[rank[n.id]];
      var c = n._cross;
      if (horiz) {
        n.x = graph.direction === 'RL' ? (totalMain - m) : m;
        n.y = c;
      } else {
        n.y = graph.direction === 'BT' ? (totalMain - m) : m;
        n.x = c;
      }
      n.rank = rank[n.id];
    });

    var width = horiz ? totalMain + padX : crossExtent + padX * 2;
    var height = horiz ? crossExtent + padY * 2 : totalMain + padY;

    // compute edge geometry
    edges.forEach(function (e) {
      var a = map[e.from], b = map[e.to];
      if (!a || !b) return;
      e._a = a; e._b = b;
      e.path = edgePath(a, b, horiz, graph.direction);
    });

    graph._layout = {
      width: Math.max(width, 120), height: Math.max(height, 120),
      horiz: horiz, layers: layers, rank: rank, map: map
    };
    return graph;
  }

  function rangeArr(a, b) { var out = [], step = a < b ? 1 : -1; for (var i = a; i !== b; i += step) out.push(i); return out; }

  function sizeNode(n, theme) {
    var m = measureText(n.label || n.id, theme ? theme.font : '600 14px sans-serif');
    var padW = 30, padH = 20;
    var w = m.w + padW, h = m.h + padH;
    if (n.shape === 'circle') { var d = Math.max(w, h, 54); w = d; h = d; }
    if (n.shape === 'diamond') { w += 24; h += 18; }
    if (n.shape === 'hexagon') { w += 22; }
    if (n.shape === 'cylinder') { h += 14; }
    if (n.shape === 'stadium' || n.shape === 'round') { w += 10; }
    n.w = Math.max(w, 48); n.h = Math.max(h, 38);
    n._text = m;
  }

  // intersection of segment center->target with node rect, returns border point
  function borderPoint(node, tx, ty) {
    var dx = tx - node.x, dy = ty - node.y;
    if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
    var w = node.w / 2, h = node.h / 2;
    var scale = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }

  function edgePath(a, b, horiz) {
    var p1 = borderPoint(a, b.x, b.y);
    var p2 = borderPoint(b, a.x, a.y);
    var c1, c2;
    if (horiz) {
      var mx = (p1.x + p2.x) / 2;
      c1 = { x: mx, y: p1.y }; c2 = { x: mx, y: p2.y };
    } else {
      var my = (p1.y + p2.y) / 2;
      c1 = { x: p1.x, y: my }; c2 = { x: p2.x, y: my };
    }
    return {
      p1: p1, p2: p2, c1: c1, c2: c2,
      d: 'M' + p1.x + ',' + p1.y + ' C' + c1.x + ',' + c1.y + ' ' + c2.x + ',' + c2.y + ' ' + p2.x + ',' + p2.y
    };
  }

  /* ------------------------------------------------------------------ *
   * RENDER
   * ------------------------------------------------------------------ */
  function shapePath(n) {
    var x = n.x - n.w / 2, y = n.y - n.h / 2, w = n.w, h = n.h, r = 10;
    switch (n.shape) {
      case 'round': return roundRect(x, y, w, h, 14);
      case 'stadium': return roundRect(x, y, w, h, h / 2);
      case 'rect': return roundRect(x, y, w, h, 6);
      case 'subroutine': return roundRect(x, y, w, h, 4); // extra lines drawn separately
      case 'circle': return null; // uses ellipse
      case 'cylinder': return cylinderPath(x, y, w, h);
      case 'diamond': return 'M' + n.x + ',' + y + ' L' + (x + w) + ',' + n.y + ' L' + n.x + ',' + (y + h) + ' L' + x + ',' + n.y + ' Z';
      case 'hexagon':
        var o = 14;
        return 'M' + (x + o) + ',' + y + ' L' + (x + w - o) + ',' + y + ' L' + (x + w) + ',' + n.y +
          ' L' + (x + w - o) + ',' + (y + h) + ' L' + (x + o) + ',' + (y + h) + ' L' + x + ',' + n.y + ' Z';
      case 'flag':
        var f = 14;
        return 'M' + x + ',' + y + ' L' + (x + w - f) + ',' + y + ' L' + (x + w) + ',' + n.y +
          ' L' + (x + w - f) + ',' + (y + h) + ' L' + x + ',' + (y + h) + ' Z';
      default: return roundRect(x, y, w, h, 6);
    }
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return 'M' + (x + r) + ',' + y +
      ' H' + (x + w - r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + w) + ',' + (y + r) +
      ' V' + (y + h - r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + w - r) + ',' + (y + h) +
      ' H' + (x + r) + ' A' + r + ',' + r + ' 0 0 1 ' + x + ',' + (y + h - r) +
      ' V' + (y + r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + y + ' Z';
  }
  function cylinderPath(x, y, w, h) {
    var ry = 7;
    return 'M' + x + ',' + (y + ry) +
      ' A' + (w / 2) + ',' + ry + ' 0 0 1 ' + (x + w) + ',' + (y + ry) +
      ' V' + (y + h - ry) + ' A' + (w / 2) + ',' + ry + ' 0 0 1 ' + x + ',' + (y + h - ry) + ' Z';
  }

  function render(container, input, options) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('MDGraph: container not found');
    options = options || {};
    var theme = assign({}, THEMES[options.theme] || THEMES.dark, options.themeOverrides || {});
    var graph = typeof input === 'string' ? parse(input, options) : input;
    layout(graph, { theme: theme, rankSep: options.rankSep, nodeSep: options.nodeSep });

    container.innerHTML = '';
    container.classList.add('mdgraph-root');
    var L = graph._layout;
    var pad = 20;
    var vbW = L.width + pad * 2, vbH = L.height + pad * 2;

    var svg = svgEl('svg', {
      class: 'mdgraph-svg',
      viewBox: (-pad) + ' ' + (-pad) + ' ' + vbW + ' ' + vbH,
      preserveAspectRatio: 'xMidYMid meet',
      width: '100%', height: '100%'
    });
    svg.style.background = theme.bg;
    svg.style.font = theme.font;

    // defs: arrow markers, glow filter, grid
    var defs = svgEl('defs');
    defs.appendChild(marker('mdg-arrow', theme.edge, 'arrow'));
    defs.appendChild(marker('mdg-arrow-accent', theme.flow, 'arrow'));
    defs.appendChild(marker('mdg-circle', theme.edge, 'circle'));
    defs.appendChild(marker('mdg-cross', theme.edge, 'cross'));
    var glow = svgEl('filter', { id: 'mdg-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    glow.innerHTML = '<feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>';
    defs.appendChild(glow);
    svg.appendChild(defs);

    if (options.grid !== false) {
      var gp = svgEl('pattern', { id: 'mdg-grid', width: 26, height: 26, patternUnits: 'userSpaceOnUse' });
      gp.innerHTML = '<path d="M26 0H0V26" fill="none" stroke="' + theme.grid + '" stroke-width="1"/>';
      defs.appendChild(gp);
      svg.appendChild(svgEl('rect', { x: -pad, y: -pad, width: vbW, height: vbH, fill: 'url(#mdg-grid)' }));
    }

    if (graph.title) {
      var t = svgEl('text', { x: L.width / 2, y: -4, 'text-anchor': 'middle', fill: theme.subtext, 'font-size': 16, 'font-weight': 700 });
      t.textContent = graph.title; svg.appendChild(t);
    }

    var gEdges = svgEl('g', { class: 'mdg-edges' });
    var gNodes = svgEl('g', { class: 'mdg-nodes' });
    svg.appendChild(gEdges); svg.appendChild(gNodes);

    var edgeEls = {};
    graph.edges.forEach(function (e) {
      if (!e.path) return;
      var g = svgEl('g', { class: 'mdg-edge', 'data-id': e.id, 'data-from': e.from, 'data-to': e.to });
      var base = svgEl('path', {
        d: e.path.d, fill: 'none', stroke: theme.edge,
        'stroke-width': e.style === 'thick' ? 3.5 : 1.8,
        'stroke-dasharray': e.style === 'dotted' ? '4 5' : null,
        'stroke-linecap': 'round'
      });
      if (e.endTip !== 'none') base.setAttribute('marker-end', 'url(#mdg-' + e.endTip + ')');
      if (e.startTip !== 'none') base.setAttribute('marker-start', 'url(#mdg-' + e.startTip + ')');
      var flow = svgEl('path', {
        d: e.path.d, fill: 'none', stroke: theme.flow, 'stroke-width': (e.style === 'thick' ? 4 : 2.4),
        'stroke-linecap': 'round', class: 'mdg-flow', opacity: 0
      });
      g.appendChild(base); g.appendChild(flow);
      if (e.label) {
        var mid = pointOnCurve(e.path, 0.5);
        var lg = svgEl('g', { class: 'mdg-edge-label' });
        var tw = measureText(e.label, theme.font).w + 10;
        lg.appendChild(svgEl('rect', { x: mid.x - tw / 2, y: mid.y - 11, width: tw, height: 20, rx: 5, fill: theme.bg, opacity: 0.9 }));
        var lt = svgEl('text', { x: mid.x, y: mid.y + 4, 'text-anchor': 'middle', fill: theme.edgeLabel, 'font-size': 12 });
        lt.textContent = e.label; lg.appendChild(lt);
        g.appendChild(lg);
      }
      gEdges.appendChild(g);
      edgeEls[e.id] = { g: g, base: base, flow: flow, edge: e };
    });

    var nodeEls = {};
    graph.nodes.forEach(function (n) {
      var g = svgEl('g', { class: 'mdg-node', 'data-id': n.id });
      var fill = (n.style && n.style.fill) || theme.node;
      var stroke = (n.style && n.style.stroke) || pick(theme.palette, n._i) || theme.nodeStroke;
      var shapeEl;
      if (n.shape === 'circle') {
        shapeEl = svgEl('ellipse', { cx: n.x, cy: n.y, rx: n.w / 2, ry: n.h / 2 });
      } else {
        shapeEl = svgEl('path', { d: shapePath(n) });
      }
      shapeEl.setAttribute('fill', fill);
      shapeEl.setAttribute('stroke', stroke);
      shapeEl.setAttribute('stroke-width', 2);
      shapeEl.setAttribute('class', 'mdg-shape');
      g.appendChild(shapeEl);
      if (n.shape === 'subroutine') {
        g.appendChild(svgEl('line', { x1: n.x - n.w / 2 + 6, y1: n.y - n.h / 2, x2: n.x - n.w / 2 + 6, y2: n.y + n.h / 2, stroke: stroke, 'stroke-width': 2 }));
        g.appendChild(svgEl('line', { x1: n.x + n.w / 2 - 6, y1: n.y - n.h / 2, x2: n.x + n.w / 2 - 6, y2: n.y + n.h / 2, stroke: stroke, 'stroke-width': 2 }));
      }
      // label (multi-line)
      var tm = n._text, fs = tm.fontSize || 14;
      var txt = svgEl('text', { 'text-anchor': 'middle', fill: (n.style && n.style.color) || theme.text, 'font-size': fs, 'font-weight': 600 });
      var lines = tm.lines || [n.label];
      var startY = n.y - (lines.length - 1) * (fs + 4) / 2 + fs / 3;
      lines.forEach(function (ln, i) {
        var ts = svgEl('tspan', { x: n.x, y: startY + i * (fs + 4) });
        ts.textContent = ln; txt.appendChild(ts);
      });
      g.appendChild(txt);
      gNodes.appendChild(g);
      nodeEls[n.id] = { g: g, shape: shapeEl, text: txt, node: n, baseFill: fill, baseStroke: stroke };
    });

    // tables
    var tableWrap = null;
    if (graph.tables && graph.tables.length) {
      tableWrap = document.createElement('div');
      tableWrap.className = 'mdgraph-tables';
      graph.tables.forEach(function (tb, ti) { tableWrap.appendChild(buildTable(tb, ti, theme)); });
    }

    container.appendChild(svg);
    if (tableWrap) container.appendChild(tableWrap);

    injectStyles();

    var instance = new Player({
      container: container, svg: svg, graph: graph, theme: theme,
      nodeEls: nodeEls, edgeEls: edgeEls, tableWrap: tableWrap, options: options
    });
    if (options.controls !== false) instance.mountControls();
    if (options.autoplay) instance.play();
    else instance.reset();
    return instance;
  }

  function pick(arr, i) { return arr && arr.length ? arr[i % arr.length] : null; }

  function marker(id, color, kind) {
    var m = svgEl('marker', { id: id, viewBox: '0 0 10 10', refX: kind === 'arrow' ? 9 : 5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    if (kind === 'arrow') m.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
    else if (kind === 'circle') m.appendChild(svgEl('circle', { cx: 5, cy: 5, r: 4, fill: color }));
    else m.innerHTML = '<path d="M1,1 L9,9 M9,1 L1,9" stroke="' + color + '" stroke-width="2"/>';
    return m;
  }

  function pointOnCurve(path, t) {
    // cubic bezier point
    var p0 = path.p1, p1 = path.c1, p2 = path.c2, p3 = path.p2;
    var mt = 1 - t;
    var x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    var y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
    return { x: x, y: y };
  }

  function buildTable(tb, ti, theme) {
    var tbl = document.createElement('table');
    tbl.className = 'mdgraph-table';
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    tb.header.forEach(function (h) { var th = document.createElement('th'); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); tbl.appendChild(thead);
    var tbody = document.createElement('tbody');
    tb.rows.forEach(function (r, ri) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-table', ti); tr.setAttribute('data-row', ri);
      r.forEach(function (c) { var td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  /* ------------------------------------------------------------------ *
   * PLAYER  (animation timeline)
   * ------------------------------------------------------------------ */
  function Player(ctx) {
    this.container = ctx.container;
    this.svg = ctx.svg;
    this.graph = ctx.graph;
    this.theme = ctx.theme;
    this.nodeEls = ctx.nodeEls;
    this.edgeEls = ctx.edgeEls;
    this.tableWrap = ctx.tableWrap;
    this.options = ctx.options;
    this.speed = ctx.options.speed || 1;
    this.stepIndex = -1;
    this.playing = false;
    this._listeners = {};
    this._raf = [];
    this.steps = this._buildSteps(ctx.graph.anim);
    this._buildCaption();
  }

  Player.prototype._buildSteps = function (anim) {
    if (anim && anim.length) return anim.map(normalizeStep);
    if (this.options.autoAnimate === false) return [];
    return this._autoTimeline();
  };

  function normalizeStep(s) {
    return assign({ action: 'show', nodes: [], edges: [], dur: null, delay: 0, color: null, dir: 'forward', bidir: false, say: null, hold: false, targets: [] }, s);
  }

  // Auto reveal: rank by rank, showing nodes then flowing their outgoing edges.
  Player.prototype._autoTimeline = function () {
    var g = this.graph, L = g._layout, steps = [];
    if (!L) return steps;
    var byRank = L.layers;
    var edgesByFrom = {};
    g.edges.forEach(function (e) { (edgesByFrom[e.from] = edgesByFrom[e.from] || []).push(e); });
    byRank.forEach(function (layer, r) {
      if (!layer.length) return;
      steps.push({ action: 'show', nodes: layer.slice(), edges: [], dur: 500, say: null });
      var flows = [];
      layer.forEach(function (id) {
        (edgesByFrom[id] || []).forEach(function (e) { flows.push({ from: e.from, to: e.to }); });
      });
      if (flows.length) steps.push({ action: 'flow', nodes: [], edges: flows, dur: 800, say: null });
    });
    return steps.map(normalizeStep);
  };

  Player.prototype.on = function (ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); return this; };
  Player.prototype._emit = function (ev, data) { (this._listeners[ev] || []).forEach(function (cb) { cb(data); }); };

  Player.prototype._findEdge = function (spec) {
    var id = spec.from + '->' + spec.to;
    for (var k in this.edgeEls) {
      var e = this.edgeEls[k].edge;
      if (e.from === spec.from && e.to === spec.to) return this.edgeEls[k];
      if (e.bidir && e.from === spec.to && e.to === spec.from) return this.edgeEls[k];
    }
    return null;
  };

  // Hide everything for a clean presentation start
  Player.prototype.reset = function () {
    this._cancelRaf();
    var hasTimeline = this.steps.length > 0;
    for (var id in this.nodeEls) {
      var ne = this.nodeEls[id];
      ne.g.style.transition = 'none';
      ne.g.style.opacity = hasTimeline ? 0 : 1;
      ne.g.style.transform = hasTimeline ? 'scale(0.85)' : 'none';
      ne.shape.setAttribute('fill', ne.baseFill);
      ne.shape.setAttribute('stroke', ne.baseStroke);
      ne.g.classList.remove('mdg-on', 'mdg-focus', 'mdg-dim');
    }
    for (var ek in this.edgeEls) {
      var ee = this.edgeEls[ek];
      ee.g.style.opacity = hasTimeline ? 0 : 1;
      ee.flow.setAttribute('opacity', 0);
      ee.base.setAttribute('stroke', this.theme.edge);
    }
    this.stepIndex = -1;
    this.playing = false;
    if (this.tableWrap) {
      var rows = this.tableWrap.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) { rows[i].style.opacity = hasTimeline ? 0.15 : 1; }
    }
    this._setCaption('');
    this._updateProgress();
    this._emit('reset');
  };

  Player.prototype._cancelRaf = function () { this._raf.forEach(function (id) { cancelAnimationFrame(id); }); this._raf = []; };

  // Apply the RESULT state of steps 0..i instantly (no animation). Used for seek/prev.
  Player.prototype._applyUpTo = function (target) {
    this.reset();
    for (var id in this.nodeEls) this.nodeEls[id].g.style.transition = 'none';
    for (var i = 0; i <= target; i++) this._applyStepInstant(this.steps[i]);
    this.stepIndex = target;
    this._updateProgress();
  };

  Player.prototype._applyStepInstant = function (s) {
    var self = this;
    s.nodes.forEach(function (nid) {
      var ne = self.nodeEls[nid]; if (!ne) return;
      if (s.action === 'hide') { ne.g.style.opacity = 0; return; }
      ne.g.style.opacity = 1; ne.g.style.transform = 'none';
      if (s.action === 'color' && s.color) { ne.shape.setAttribute('fill', s.color); }
      if ((s.action === 'pulse' || s.action === 'glow') && s.color) ne.shape.setAttribute('stroke', s.color);
    });
    s.edges.forEach(function (spec) {
      var ee = self._findEdge(spec); if (!ee) return;
      if (s.action === 'hide') { ee.g.style.opacity = 0; return; }
      ee.g.style.opacity = 1;
      // reveal endpoints
      [ee.edge.from, ee.edge.to].forEach(function (id) { if (self.nodeEls[id]) { self.nodeEls[id].g.style.opacity = 1; self.nodeEls[id].g.style.transform = 'none'; } });
      if (s.color) ee.base.setAttribute('stroke', s.color);
    });
    if (s.action === 'row' && this.tableWrap) { /* handled in animate */ }
    if (s.say != null) this._setCaption(s.say);
  };

  /* ---- transport ---- */
  Player.prototype.play = function () {
    if (this.playing) return this;
    if (this.stepIndex >= this.steps.length - 1) this.reset();
    this.playing = true;
    this._emit('play');
    this._tick();
    this._syncButtons();
    return this;
  };
  Player.prototype.pause = function () {
    this.playing = false; this._cancelRaf();
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._emit('pause'); this._syncButtons();
    return this;
  };
  Player.prototype.toggle = function () { return this.playing ? this.pause() : this.play(); };

  Player.prototype._tick = function () {
    var self = this;
    if (!this.playing) return;
    if (this.stepIndex >= this.steps.length - 1) { this.playing = false; this._emit('end'); this._syncButtons(); return; }
    this.next(function () {
      if (!self.playing) return;
      var gap = self.options.stepGap != null ? self.options.stepGap : 250;
      self._timer = setTimeout(function () { self._tick(); }, gap / self.speed);
    });
  };

  // Advance one step, animating it. cb() when the step's animation completes.
  Player.prototype.next = function (cb) {
    if (this.stepIndex >= this.steps.length - 1) { if (cb) cb(); return this; }
    this.stepIndex++;
    var s = this.steps[this.stepIndex];
    this._emit('step', { index: this.stepIndex, step: s });
    this._animateStep(s, cb);
    this._updateProgress();
    this._syncButtons();
    return this;
  };

  Player.prototype.prev = function () {
    if (this.stepIndex <= 0) { this._applyUpTo(-1); this.stepIndex = -1; this._updateProgress(); this._syncButtons(); return this; }
    this._applyUpTo(this.stepIndex - 1);
    this._syncButtons();
    return this;
  };

  Player.prototype.seek = function (i) {
    i = clamp(i, -1, this.steps.length - 1);
    this.pause();
    this._applyUpTo(i);
    this._syncButtons();
    return this;
  };

  Player.prototype.restart = function () { this.pause(); this.reset(); return this; };
  Player.prototype.setSpeed = function (x) { this.speed = x; this._emit('speed', x); return this; };

  Player.prototype._animateStep = function (s, cb) {
    var self = this;
    var dur = (s.dur != null ? s.dur : defaultDur(s.action)) / this.speed;
    var done = after(1, cb);
    if (s.say != null) this._setCaption(s.say);

    // focus: dim everything then highlight targets
    if (s.action === 'focus') {
      for (var id in this.nodeEls) this.nodeEls[id].g.classList.add('mdg-dim');
      s.nodes.forEach(function (nid) { var ne = self.nodeEls[nid]; if (ne) { ne.g.classList.remove('mdg-dim'); ne.g.classList.add('mdg-focus'); revealNode(ne); } });
      setTimeout(done, dur); return;
    }
    if (s.action === 'unfocus' || s.action === 'clear') {
      for (var id2 in this.nodeEls) this.nodeEls[id2].g.classList.remove('mdg-dim', 'mdg-focus');
      setTimeout(done, dur); return;
    }
    if (s.action === 'row') { this._animateRows(s, dur, done); return; }

    var pending = [];
    // node targets
    s.nodes.forEach(function (nid) {
      var ne = self.nodeEls[nid]; if (!ne) return;
      pending.push(1);
      self._animateNode(ne, s, dur, popPending);
    });
    // edge targets
    s.edges.forEach(function (spec) {
      var ee = self._findEdge(spec); if (!ee) return;
      // ensure endpoints visible
      [ee.edge.from, ee.edge.to].forEach(function (nid) { var ne = self.nodeEls[nid]; if (ne) revealNode(ne); });
      pending.push(1);
      self._animateEdge(ee, s, dur, popPending);
    });
    if (!pending.length) { setTimeout(done, dur); return; }
    var remaining = pending.length;
    function popPending() { if (--remaining <= 0) done(); }
  };

  function revealNode(ne) {
    ne.g.style.transition = 'opacity .4s ease, transform .4s cubic-bezier(.2,.8,.2,1)';
    ne.g.style.opacity = 1; ne.g.style.transform = 'none';
    ne.g.classList.add('mdg-on');
  }

  Player.prototype._animateNode = function (ne, s, dur, cb) {
    var theme = this.theme;
    if (s.action === 'hide') {
      ne.g.style.transition = 'opacity .3s ease'; ne.g.style.opacity = 0; setTimeout(cb, dur); return;
    }
    revealNode(ne);
    if (s.action === 'color' && s.color) {
      ne.shape.style.transition = 'fill .4s ease'; ne.shape.setAttribute('fill', s.color); setTimeout(cb, dur); return;
    }
    if (s.action === 'pulse' || s.action === 'glow' || s.action === 'focus') {
      var col = s.color || theme.glow;
      var shape = ne.shape;
      var prevStroke = shape.getAttribute('stroke');
      shape.setAttribute('filter', 'url(#mdg-glow)');
      if (s.color) shape.setAttribute('stroke', col);
      if (shape.animate) {
        var a = shape.animate(
          [{ strokeWidth: 2 }, { strokeWidth: 6 }, { strokeWidth: 2 }],
          { duration: dur, iterations: s.action === 'glow' ? 1 : 1, easing: 'ease-in-out' }
        );
        a.onfinish = function () { shape.removeAttribute('filter'); if (!s.color && !s.hold) shape.setAttribute('stroke', prevStroke); cb(); };
      } else { setTimeout(function () { shape.removeAttribute('filter'); cb(); }, dur); }
      return;
    }
    // default 'show'
    setTimeout(cb, dur);
  };

  Player.prototype._animateEdge = function (ee, s, dur, cb) {
    var theme = this.theme, edge = ee.edge;
    ee.g.style.transition = 'opacity .3s ease'; ee.g.style.opacity = 1;
    if (s.action === 'hide') { ee.g.style.opacity = 0; setTimeout(cb, dur); return; }
    if (s.action === 'color' && s.color) { ee.base.style.transition = 'stroke .3s'; ee.base.setAttribute('stroke', s.color); setTimeout(cb, dur); return; }

    // flow / trace / show-with-flow
    var flow = ee.flow, base = ee.base;
    var color = s.color || theme.flow;
    flow.setAttribute('stroke', color);
    if (s.width) flow.setAttribute('stroke-width', s.width);
    var len = 0;
    try { len = base.getTotalLength(); } catch (e) { len = 300; }

    var reverse = s.dir === 'backward';
    var bidir = s.bidir || edge.bidir;

    // draw-on effect: dasharray reveal
    var seg = Math.max(len * 0.28, 40);
    flow.setAttribute('opacity', 1);
    flow.setAttribute('stroke-dasharray', seg + ' ' + (len + seg));
    var self = this;
    var start = null;
    var fromOff = reverse ? -(len + seg) : (len + seg);
    var toOff = 0;
    // comet particle
    var particle = svgEl('circle', { r: (s.width || 3) + 1.5, fill: color, filter: 'url(#mdg-glow)', class: 'mdg-particle' });
    ee.g.appendChild(particle);
    var particle2 = null;
    if (bidir) { particle2 = svgEl('circle', { r: (s.width || 3) + 1.5, fill: color, filter: 'url(#mdg-glow)', class: 'mdg-particle' }); ee.g.appendChild(particle2); }

    function frame(ts) {
      if (!start) start = ts;
      var p = clamp((ts - start) / dur, 0, 1);
      var e = easeInOut(p);
      flow.setAttribute('stroke-dashoffset', fromOff + (toOff - fromOff) * e);
      var lp = reverse ? (1 - e) : e;
      var pt = base.getPointAtLength(len * clamp(lp, 0, 1));
      particle.setAttribute('cx', pt.x); particle.setAttribute('cy', pt.y);
      if (particle2) { var pt2 = base.getPointAtLength(len * clamp(1 - lp, 0, 1)); particle2.setAttribute('cx', pt2.x); particle2.setAttribute('cy', pt2.y); }
      if (p < 1) { self._raf.push(requestAnimationFrame(frame)); }
      else {
        // leave the edge highlighted, fade the moving flow
        base.style.transition = 'stroke .3s'; base.setAttribute('stroke', color);
        if (edge.endTip !== 'none') base.setAttribute('marker-end', 'url(#mdg-arrow-accent)');
        flow.setAttribute('opacity', 0);
        if (particle.parentNode) particle.parentNode.removeChild(particle);
        if (particle2 && particle2.parentNode) particle2.parentNode.removeChild(particle2);
        cb();
      }
    }
    this._raf.push(requestAnimationFrame(frame));
  };

  Player.prototype._animateRows = function (s, dur, done) {
    if (!this.tableWrap) { setTimeout(done, dur); return; }
    var rows = this.tableWrap.querySelectorAll('tbody tr');
    var idxs = s.nodes.length ? s.nodes.map(Number) : Array.prototype.map.call(rows, function (_, i) { return i; });
    var per = dur / Math.max(idxs.length, 1);
    idxs.forEach(function (ri, k) {
      var tr = rows[ri]; if (!tr) return;
      setTimeout(function () {
        tr.style.transition = 'opacity .4s, background .4s';
        tr.style.opacity = 1;
        if (s.color) { tr.style.background = s.color; }
        tr.classList.add('mdg-row-on');
      }, per * k);
    });
    setTimeout(done, dur);
  };

  function defaultDur(action) {
    switch (action) { case 'flow': case 'trace': return 900; case 'pulse': case 'glow': return 700; case 'show': return 450; case 'color': return 400; case 'focus': return 500; default: return 500; }
  }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function after(n, cb) { var c = 0; return function () { if (++c >= n && cb) cb(); }; }

  /* ---- controls UI + caption ---- */
  Player.prototype._buildCaption = function () {
    var cap = document.createElement('div');
    cap.className = 'mdgraph-caption';
    this.captionEl = cap;
    this.container.appendChild(cap);
  };
  Player.prototype._setCaption = function (txt) {
    if (!this.captionEl) return;
    this.captionEl.textContent = txt || '';
    this.captionEl.style.opacity = txt ? 1 : 0;
  };

  Player.prototype.mountControls = function () {
    var self = this;
    var bar = document.createElement('div');
    bar.className = 'mdgraph-controls';
    bar.innerHTML =
      '<button data-a="restart" title="Restart">⟲</button>' +
      '<button data-a="prev" title="Previous">⏮</button>' +
      '<button data-a="toggle" title="Play/Pause" class="mdg-play">▶</button>' +
      '<button data-a="next" title="Next">⏭</button>' +
      '<div class="mdg-progress"><div class="mdg-progress-fill"></div></div>' +
      '<span class="mdg-count">0/' + this.steps.length + '</span>' +
      '<select class="mdg-speed" title="Speed">' +
      '<option value="0.5">0.5×</option><option value="1" selected>1×</option>' +
      '<option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select>';
    this.container.appendChild(bar);
    this.controlBar = bar;
    this.progressFill = bar.querySelector('.mdg-progress-fill');
    this.countEl = bar.querySelector('.mdg-count');
    this.playBtn = bar.querySelector('.mdg-play');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'toggle') self.toggle();
      else if (a === 'next') { self.pause(); self.next(); }
      else if (a === 'prev') self.prev();
      else if (a === 'restart') self.restart();
    });
    bar.querySelector('.mdg-progress').addEventListener('click', function (e) {
      var rect = this.getBoundingClientRect();
      var frac = (e.clientX - rect.left) / rect.width;
      self.seek(Math.round(frac * (self.steps.length - 1)));
    });
    bar.querySelector('.mdg-speed').addEventListener('change', function () { self.setSpeed(parseFloat(this.value)); });
    // keyboard
    this.container.tabIndex = 0;
    this.container.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); self.toggle(); }
      else if (e.key === 'ArrowRight') { self.pause(); self.next(); }
      else if (e.key === 'ArrowLeft') self.prev();
      else if (e.key === 'r' || e.key === 'R') self.restart();
    });
    this._syncButtons();
  };

  Player.prototype._updateProgress = function () {
    var frac = this.steps.length <= 1 ? (this.stepIndex >= 0 ? 1 : 0) : (this.stepIndex + 1) / this.steps.length;
    if (this.progressFill) this.progressFill.style.width = clamp(frac * 100, 0, 100) + '%';
    if (this.countEl) this.countEl.textContent = (this.stepIndex + 1) + '/' + this.steps.length;
  };
  Player.prototype._syncButtons = function () {
    if (this.playBtn) this.playBtn.textContent = this.playing ? '❚❚' : '▶';
  };

  Player.prototype.destroy = function () { this._cancelRaf(); if (this._timer) clearTimeout(this._timer); this.container.innerHTML = ''; };

  // Programmatic timeline API: player.animate([{action,targets,...}])
  Player.prototype.animate = function (steps) {
    this.steps = (steps || []).map(function (s) {
      if (typeof s === 'string') { return normalizeStep(parseAnimDirective(s.replace(/^@?/, '@')) || {}); }
      // allow {action, targets:'A->B', dur:1000, ...}
      var st = assign({}, s);
      if (typeof st.targets === 'string') { var tmp = { nodes: [], edges: [], targets: [] }; parseTargets(st.targets, tmp); st.nodes = tmp.nodes; st.edges = tmp.edges; }
      return normalizeStep(st);
    });
    if (this.countEl) this.countEl.textContent = '0/' + this.steps.length;
    this.reset();
    return this;
  };

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected || typeof document === 'undefined') return;
    _stylesInjected = true;
    var css =
      '.mdgraph-root{position:relative;display:flex;flex-direction:column;width:100%;height:100%;font-family:ui-sans-serif,system-ui,sans-serif;outline:none;border-radius:12px;overflow:hidden}' +
      '.mdgraph-svg{display:block;flex:1;min-height:0}' +
      '.mdg-node{cursor:default}' +
      '.mdg-node.mdg-dim{opacity:.18 !important;transition:opacity .4s}' +
      '.mdg-node.mdg-focus .mdg-shape{filter:url(#mdg-glow)}' +
      '.mdgraph-caption{position:absolute;left:50%;transform:translateX(-50%);bottom:64px;max-width:80%;padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 14px ui-sans-serif,system-ui,sans-serif;opacity:0;transition:opacity .35s;pointer-events:none;text-align:center;backdrop-filter:blur(6px)}' +
      '.mdgraph-controls{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,.28);backdrop-filter:blur(8px)}' +
      '.mdgraph-controls button{width:34px;height:34px;border:none;border-radius:9px;background:rgba(255,255,255,.12);color:#fff;font-size:15px;cursor:pointer;transition:background .15s,transform .1s;display:flex;align-items:center;justify-content:center}' +
      '.mdgraph-controls button:hover{background:rgba(255,255,255,.24)}' +
      '.mdgraph-controls button:active{transform:scale(.92)}' +
      '.mdg-progress{flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.15);cursor:pointer;overflow:hidden}' +
      '.mdg-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#6366f1,#22d3ee);border-radius:999px;transition:width .25s ease}' +
      '.mdg-count{color:#fff;font:600 12px ui-monospace,monospace;min-width:44px;text-align:center;opacity:.85}' +
      '.mdg-speed{background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:8px;padding:6px;font-size:12px;cursor:pointer}' +
      '.mdg-speed option{color:#111}' +
      '.mdgraph-tables{padding:14px;overflow:auto}' +
      '.mdgraph-table{border-collapse:collapse;margin:8px 0;font:14px ui-sans-serif,system-ui,sans-serif;width:100%}' +
      '.mdgraph-table th,.mdgraph-table td{border:1px solid rgba(128,128,128,.3);padding:8px 12px;text-align:left}' +
      '.mdgraph-table th{background:rgba(128,128,128,.15);font-weight:700}' +
      '.mdgraph-table tbody tr{transition:opacity .4s,background .4s}' +
      '.mdg-particle{pointer-events:none}';
    var st = document.createElement('style');
    st.setAttribute('data-mdgraph', '');
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------------ *
   * Public API + auto-init
   * ------------------------------------------------------------------ */
  function init(selector, options) {
    var els = typeof selector === 'string' ? document.querySelectorAll(selector) : [selector];
    var out = [];
    Array.prototype.forEach.call(els, function (el) {
      var src = el.getAttribute('data-mdgraph-src');
      var text = src ? document.querySelector(src).textContent : el.textContent;
      var opts = assign({}, options);
      ['theme', 'speed', 'autoplay'].forEach(function (k) {
        var v = el.getAttribute('data-' + k); if (v != null) opts[k] = k === 'autoplay' ? v !== 'false' : v;
      });
      var host = document.createElement('div');
      host.style.cssText = el.getAttribute('style') || '';
      el.replaceWith(host);
      out.push(render(host, text, opts));
    });
    return out.length === 1 ? out[0] : out;
  }

  function autoInit() {
    if (typeof document === 'undefined') return;
    injectStyles();
    document.querySelectorAll('[data-mdgraph],pre.mdgraph,.language-mdgraph').forEach(function (el) {
      if (el.__mdg) return; el.__mdg = 1;
      try { init(el); } catch (e) { console.error('MDGraph auto-init failed', e); }
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
    else setTimeout(autoInit, 0);
  }

  return {
    version: VERSION,
    themes: THEMES,
    parse: parse,
    layout: layout,
    render: render,
    init: init,
    Player: Player
  };
});
