const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const heartsSource = fs.readFileSync(path.join(__dirname, "../deploy/hearts.js"), "utf8");

function createEventTarget(properties = {}) {
  const listeners = new Map();

  return Object.assign(properties, {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener.call(this, { type, target: this, ...event });
      }
    },
  });
}

function createElement(tagName) {
  const attributes = new Map();
  const styleValues = new Map();
  const element = createEventTarget({
    tagName: tagName.toUpperCase(),
    children: [],
    className: "",
    dataset: {},
    hidden: false,
    title: "",
    style: {
      setProperty(name, value) {
        styleValues.set(name, String(value));
      },
      getPropertyValue(name) {
        return styleValues.get(name) || "";
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    append(...nodes) {
      for (const node of nodes) {
        if (node && node.isDocumentFragment) {
          this.children.push(...node.children);
          node.children.length = 0;
        } else {
          this.children.push(node);
        }
      }
    },
    replaceChildren(...nodes) {
      this.children.length = 0;
      this.append(...nodes);
    },
  });

  Object.defineProperty(element, "childElementCount", {
    get() {
      return this.children.length;
    },
  });

  return element;
}

function createDocumentFragment() {
  return {
    isDocumentFragment: true,
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
  };
}

function createHarness({ reducedMotion = false, hidden = false } = {}) {
  const layer = createElement("div");
  const toggle = createElement("button");
  const mediaQuery = createEventTarget({ matches: reducedMotion });
  const document = createEventTarget({
    hidden,
    querySelector(selector) {
      return { "#fallingHearts": layer, "#heartsToggle": toggle }[selector] || null;
    },
    createDocumentFragment,
    createElement,
  });
  const window = createEventTarget({
    matchMedia(query) {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return mediaQuery;
    },
  });

  vm.runInContext(heartsSource, vm.createContext({ document, window }));

  return {
    document,
    layer,
    mediaQuery,
    toggle,
    window,
    setReducedMotion(matches) {
      mediaQuery.matches = matches;
      mediaQuery.dispatch("change", { matches });
    },
    setVisibility(isHidden) {
      document.hidden = isHidden;
      document.dispatch("visibilitychange");
    },
  };
}

function assertParticlePool(layer, expectedCount = 8) {
  assert.equal(layer.childElementCount, expectedCount);
  const customProperties = [
    "--heart-x",
    "--heart-size",
    "--heart-duration",
    "--heart-delay",
    "--heart-drift",
    "--heart-rotation",
    "--heart-opacity",
  ];

  for (const particle of layer.children) {
    assert.equal(particle.className, "heart-particle");
    for (const property of customProperties) {
      assert.notEqual(particle.style.getPropertyValue(property), "");
    }
  }
}

test("creates one fixed pool of eight particles", () => {
  const { layer, toggle } = createHarness();

  assertParticlePool(layer);
  assert.equal(layer.hidden, false);
  assert.equal(layer.dataset.paused, "false");
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(toggle.title, toggle.getAttribute("aria-label"));
});

test("visibility and page lifecycle events never duplicate the pool", () => {
  const harness = createHarness();
  const originalParticles = [...harness.layer.children];

  harness.setVisibility(true);
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.dataset.paused, "true");

  harness.setVisibility(false);
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.dataset.paused, "false");

  harness.window.dispatch("pagehide");
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.dataset.paused, "true");

  harness.window.dispatch("pageshow");
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.dataset.paused, "false");

  assert.equal(harness.layer.children.length, originalParticles.length);
  harness.layer.children.forEach((particle, index) => {
    assert.equal(particle, originalParticles[index]);
  });
});

test("a hidden document pauses without clearing particles", () => {
  const harness = createHarness();
  const originalParticles = [...harness.layer.children];

  harness.setVisibility(true);

  assert.equal(harness.layer.hidden, false);
  assert.equal(harness.layer.dataset.paused, "true");
  assert.deepEqual(harness.layer.children, originalParticles);
});

test("the user toggle clears the pool and restarts exactly eight particles", () => {
  const harness = createHarness();
  const originalParticles = [...harness.layer.children];

  harness.toggle.dispatch("click");
  assert.equal(harness.layer.childElementCount, 0);
  assert.equal(harness.layer.hidden, true);
  assert.equal(harness.layer.dataset.paused, "true");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(harness.toggle.title, harness.toggle.getAttribute("aria-label"));

  harness.toggle.dispatch("click");
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.hidden, false);
  assert.equal(harness.layer.dataset.paused, "false");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "true");
  assert.notEqual(harness.layer.children[0], originalParticles[0]);
});

test("a user-disabled effect stays off across visibility and page events", () => {
  const harness = createHarness();

  harness.toggle.dispatch("click");
  harness.setVisibility(true);
  harness.window.dispatch("pagehide");
  harness.window.dispatch("pageshow");
  harness.setVisibility(false);

  assert.equal(harness.layer.childElementCount, 0);
  assert.equal(harness.layer.hidden, true);
  assert.equal(harness.layer.dataset.paused, "true");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");
});

test("reduced motion at startup hides controls and creates no particles", () => {
  const { layer, toggle } = createHarness({ reducedMotion: true });

  assert.equal(layer.childElementCount, 0);
  assert.equal(layer.hidden, true);
  assert.equal(layer.dataset.paused, "true");
  assert.equal(toggle.hidden, true);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
});

test("runtime reduced-motion changes clear and restore the fixed pool", () => {
  const harness = createHarness();

  harness.setReducedMotion(true);
  assert.equal(harness.layer.childElementCount, 0);
  assert.equal(harness.layer.hidden, true);
  assert.equal(harness.layer.dataset.paused, "true");
  assert.equal(harness.toggle.hidden, true);
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");

  harness.setReducedMotion(false);
  assertParticlePool(harness.layer);
  assert.equal(harness.layer.hidden, false);
  assert.equal(harness.layer.dataset.paused, "false");
  assert.equal(harness.toggle.hidden, false);
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "true");
});

test("static overlay markup starts hidden and remains decorative", () => {
  const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
  const layerTag = html.match(/<div\b[^>]*\bid="fallingHearts"[^>]*>/u)?.[0];
  const toggleTag = html.match(/<button\b[^>]*\bid="heartsToggle"[^>]*>/u)?.[0];

  assert.ok(layerTag);
  assert.match(layerTag, /\baria-hidden="true"/u);
  assert.match(layerTag, /\bhidden\b/u);
  assert.ok(toggleTag);
  assert.match(toggleTag, /\btype="button"/u);
  assert.match(toggleTag, /\baria-pressed="true"/u);
  assert.match(toggleTag, /\bhidden\b/u);
});
