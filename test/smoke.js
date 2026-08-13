/* Headless smoke test for MDGraph — runs in CI with a minimal DOM/SVG shim.
   No browser, no dependencies. Exits non-zero on the first failed assertion. */
'use strict';

/* ---- minimal DOM/SVG shim ---- */
function El(tag) {
  this.tag = tag; this.children = []; this.attrs = {}; this.style = {};
  this.classList = { _s: new Set(), add() { for (const a of arguments) this._s.add(a); }, remove() { for (const a of arguments) this._s.delete(a); }, contains(c) { return this._s.has(c); } };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
El.prototype.replaceWith = function () {}; El.prototype.remove = function () {};
El.prototype.addEventListener = function () {};
El.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); };
El.prototype.cloneNode = function () { return new El(this.tag); };
El.prototype.getTotalLength = function () { return 240; };
El.prototype.getPointAtLength = function (l) { return { x: l, y: l }; };
El.prototype.animate = function () { return { onfinish: null }; };
El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 300, height: 200 }; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text || ''; }, set(v) { this._text = v; } });
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html || ''; }, set(v) { this._html = v; } });
Object.defineProperty(El.prototype, 'className', { get() { return this.attrs.class || ''; }, set(v) { this.attrs.class = v; } });
global.document = {
  readyState: 'complete',
  createElement: function (t) { const e = new El(t); if (t === 'canvas') e.getContext = () => ({ font: '', measureText: s => ({ width: (s || '').length * 7 }) }); return e; },
  createElementNS: (ns, t) => new El(t),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  head: new El('head'), body: new El('body')
};
global.self = global;
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

/* ---- tiny assert ---- */
let passed = 0;
function ok(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } passed++; console.log('  ok - ' + msg); }

const MDGraph = require('../mdgraph.js');
const D = () => new El('div');

console.log('MDGraph v' + MDGraph.version);

// parsing
const g = MDGraph.parse(`
flowchart LR
  A([:user: Client]) --> B{Auth?}
  B -->|yes| C[Handler]
  B -->|no| D[Reject]
  C --> E[(DB)]
`);
ok(g.type === 'graph', 'flowchart parses as graph');
ok(g.nodes.length === 5, 'five nodes');
ok(g.edges.length === 4 && g.edges[1].label === 'yes', 'labeled edges parse');
ok(g.nodes[0].icon === 'user', 'icon prefix parsed');

// layout
MDGraph.layout(g, { theme: MDGraph.themes.dark, iconPos: 'top' });
ok(g._layout.width > 0 && g._layout.height > 0, 'layout has size');

// icons
ok(MDGraph.iconNames().length >= 190, '190+ icons bundled');
ok(MDGraph.hasIcon('database') && !MDGraph.hasIcon('nope'), 'icon lookup works');

// subgraphs
const gs = MDGraph.parse(`flowchart LR
  subgraph Front
    U[Users] --> W[Web]
  end
  subgraph Back
    S[API] --> DB[(DB)]
  end
  W --> S`);
MDGraph.layout(gs, { theme: MDGraph.themes.dark });
ok((gs._layout.groups || []).length === 2, 'two subgraph boxes');

// sequence
const seq = MDGraph.parse(`sequenceDiagram
  participant U as User
  participant A as App
  U->>A: hi
  A-->>U: bye
  Note over A: think`);
ok(seq.type === 'sequence', 'sequenceDiagram detected');
ok(seq.participants.length === 2 && seq.messages.length === 3, 'participants + messages parsed');

// render (core paths, controls off to avoid shim querySelector gap)
const pg = MDGraph.render(D(), g, { autoplay: false, controls: false });
ok(Object.keys(pg.nodeEls).length === 5, 'graph render builds node elements');
pg.next(); pg.seek(1); pg.prev(); pg.reset();
ok(pg.stepIndex === -1, 'graph transport works');
pg.zoomBy(1.5); pg.resetView();
ok(pg._view.k === 1, 'zoom reset works');

const ps = MDGraph.render(D(), seq, { autoplay: false, controls: false });
ok(ps.steps.length === seq.messages.length + 1, 'sequence timeline = messages + intro');
ps.next(); ps.next(); ps.reset();
ok(ps.stepIndex === -1, 'sequence transport works');

// programmatic animate + auto theme
const pa = MDGraph.render(D(), 'flowchart TB\n X-->Y', { theme: 'auto', autoplay: false, controls: false });
pa.animate([{ action: 'flow', targets: 'X->Y', dur: 500 }]);
ok(pa.steps.length === 1, 'programmatic animate() works');

console.log('\n' + passed + ' assertions passed.');
