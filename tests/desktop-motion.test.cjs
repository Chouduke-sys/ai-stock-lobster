const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function mount({ desktop = true, reduced = false } = {}) {
  const media = [desktop, reduced].map(matches => ({ matches, addEventListener(_, fn) { this.change = fn; }, removeEventListener() {} }));
  const listeners = new Map();
  const classes = new Set();
  const card = { getBoundingClientRect: () => ({ top: 1600 }), classList: {
    add: (...names) => names.forEach(n => classes.add(n)),
    remove: (...names) => names.forEach(n => classes.delete(n)),
  } };
  const layers = [0, 1, 2].map(() => ({ style: { removeProperty(key) { delete this[key]; } } }));
  let effect, queued, intersection, disconnected = false;
  const window = {
    scrollY: 0, innerHeight: 1000,
    matchMedia: query => media[query.includes('min-width') ? 0 : 1],
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/DesktopAtmosphere.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require: name => name === 'react' ? {
      useRef: () => ({ current: { children: layers } }), useEffect: fn => { effect = fn; },
    } : { jsx: () => null, jsxs: () => null },
    window, document: { hidden: false, querySelectorAll: () => [card], addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: fn => { queued = fn; return 1; }, cancelAnimationFrame: () => { queued = undefined; },
    IntersectionObserver: class {
      constructor(fn) { intersection = fn; }
      observe() {} unobserve() {} disconnect() { disconnected = true; }
    },
  });
  exports.default();
  const unmount = effect();
  return { media, listeners, classes, layers, window, unmount,
    tick: () => { const fn = queued; queued = undefined; fn?.(); },
    reveal: () => intersection([{ isIntersecting: true, target: card }]),
    disconnected: () => disconnected,
  };
}

test('desktop scroll moves independent layers, reveals once and cleans up on unmount', () => {
  const app = mount();
  assert(app.classes.has('reveal-pending'));
  app.window.scrollY = 1800;
  app.listeners.get('scroll')();
  app.tick();
  const transforms = app.layers.map(layer => layer.style.transform);
  assert.equal(new Set(transforms).size, 3);
  assert(transforms.every(value => value.includes('translate3d(0, -')));
  app.reveal();
  assert(!app.classes.has('reveal-pending'));
  app.unmount();
  assert.equal(app.listeners.size, 0);
  assert(app.disconnected());
  assert(app.layers.every(layer => layer.style.transform === undefined));
});

test('mobile and reduced motion attach no scroll listener or hidden reveal classes', () => {
  for (const options of [{ desktop: false }, { reduced: true }]) {
    const app = mount(options);
    assert.equal(app.listeners.size, 0);
    assert.equal(app.classes.size, 0);
    app.unmount();
  }
});

test('live preference changes cancel pending work and restore visible static content', () => {
  const app = mount();
  app.listeners.get('scroll')();
  app.media[1].matches = true;
  app.media[1].change();
  app.tick();
  assert.equal(app.classes.size, 0);
  assert.equal(app.listeners.size, 0);
  assert(app.layers.every(layer => layer.style.transform === undefined));
  app.media[1].matches = false;
  app.media[1].change();
  assert(app.listeners.has('scroll'));
  app.media[0].matches = false;
  app.media[0].change();
  assert.equal(app.listeners.size, 0);
  app.unmount();
});
