const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const coverSource = fs.readFileSync(path.join(__dirname, "../deploy/cover.js"), "utf8");

function createEventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign(properties, {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    removeEventListener(type, listener) {
      const callbacks = listeners.get(type) || [];
      listeners.set(type, callbacks.filter((candidate) => candidate !== listener));
    },
    dispatch(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) {
        listener.call(this, { type, target: this, ...event });
      }
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  });
}

class FakeClassList {
  constructor(names = []) {
    this.names = new Set(names);
  }

  add(name) {
    this.names.add(name);
  }

  contains(name) {
    return this.names.has(name);
  }

  remove(name) {
    this.names.delete(name);
  }
}

class FakeElement {
  constructor(document, { hidden = false, inert = false } = {}) {
    Object.assign(this, createEventTarget());
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.document = document;
    this.focusOptions = null;
    this.hidden = hidden;
    this.inert = inert;
    this.selectors = new Map();
    if (inert) this.attributes.set("inert", "");
  }

  append(...children) {
    this.children.push(...children);
  }

  contains(candidate) {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }

  focus(options) {
    this.focusOptions = options;
    this.document.activeElement = this;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  querySelector(selector) {
    return this.selectors.get(selector) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, due: this.now + Number(delay) });
    return id;
  }

  tick(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.due;
      task.callback();
    }
    this.now = target;
  }
}

function createHarness({
  coverPresent = true,
  heartsInitiallyInert = true,
  invitationInitiallyInert = false,
  reducedMotion = false,
  rootInitiallyLocked = false,
} = {}) {
  const clock = new FakeClock();
  const document = {
    activeElement: null,
    querySelector(selector) {
      return this.selectors.get(selector) || null;
    },
    querySelectorAll(selector) {
      return selector === ".invitation, #musicControls, #heartsToggle" ? this.backgroundNodes : [];
    },
    selectors: new Map(),
  };
  document.documentElement = new FakeElement(document);
  if (rootInitiallyLocked) document.documentElement.classList.add("has-invitation-cover");

  const invitation = new FakeElement(document, { inert: invitationInitiallyInert });
  const musicControls = new FakeElement(document);
  const heartsToggle = new FakeElement(document, { inert: heartsInitiallyInert });
  const outside = new FakeElement(document);
  document.backgroundNodes = [invitation, musicControls, heartsToggle];
  document.selectors.set(".invitation", invitation);

  let cover = null;
  let leftPanel = null;
  let openButton = null;
  let rightPanel = null;
  if (coverPresent) {
    cover = new FakeElement(document, { hidden: true });
    const stage = new FakeElement(document);
    leftPanel = new FakeElement(document);
    rightPanel = new FakeElement(document);
    openButton = new FakeElement(document);
    stage.append(leftPanel, rightPanel);
    cover.append(stage, openButton);
    cover.selectors.set(".invitation-cover__stage", stage);
    cover.selectors.set(".invitation-cover__panel--left", leftPanel);
    cover.selectors.set(".invitation-cover__panel--right", rightPanel);
    cover.selectors.set("#openInvitation", openButton);
    document.selectors.set("#invitationCover", cover);
  }

  document.activeElement = outside;
  const window = createEventTarget({
    clearTimeout: clock.clearTimeout.bind(clock),
    matchMedia(query) {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return { matches: reducedMotion };
    },
    setTimeout: clock.setTimeout.bind(clock),
  });
  const context = vm.createContext({ Array, console, document, window });
  vm.runInContext(coverSource, context);

  return {
    clock,
    context,
    cover,
    document,
    heartsToggle,
    invitation,
    leftPanel,
    musicControls,
    openButton,
    outside,
    rightPanel,
    window,
  };
}

test("activates progressively and begins automatic opening at exactly one second", () => {
  const harness = createHarness();

  assert.equal(harness.cover.hidden, false);
  assert.equal(harness.cover.dataset.state, "closed");
  assert.equal(harness.document.documentElement.classList.contains("has-invitation-cover"), true);
  assert.equal(harness.invitation.inert, true);
  assert.equal(harness.musicControls.inert, true);
  assert.equal(harness.heartsToggle.inert, true);
  assert.equal(harness.document.activeElement, harness.openButton);
  assert.equal(harness.openButton.focusOptions?.preventScroll, true);

  harness.clock.tick(999);
  assert.equal(harness.cover.dataset.state, "closed");
  harness.clock.tick(1);
  assert.equal(harness.cover.dataset.state, "opening");
  assert.equal(harness.cover.classList.contains("is-opening"), true);
  assert.equal(harness.cover.hidden, false);
});

test("an early pointer opens once, cancels auto-open, and uses the 1200ms fallback", () => {
  const harness = createHarness();
  harness.clock.tick(400);
  harness.openButton.dispatch("pointerup", { isTrusted: true });
  harness.openButton.dispatch("click", { isTrusted: true });
  harness.openButton.dispatch("keydown", { isTrusted: true, key: "Enter" });
  harness.context.initializeInvitationCover();

  assert.equal(harness.cover.dataset.state, "opening");
  assert.equal(harness.clock.tasks.size, 1);
  harness.clock.tick(600);
  assert.equal(harness.cover.dataset.state, "opening", "the canceled one-second timer must not reopen");
  harness.clock.tick(599);
  assert.equal(harness.cover.hidden, false);
  harness.clock.tick(1);
  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.cover.hidden, true);
  assert.equal(harness.clock.tasks.size, 0);
});

test("click, Escape, Enter, and Space each open the cover", () => {
  const gestures = [
    ["click", {}],
    ["keydown", { key: "Escape" }],
    ["keydown", { key: "Enter" }],
    ["keydown", { key: " " }],
  ];

  for (const [type, event] of gestures) {
    const harness = createHarness();
    harness.openButton.dispatch(type, { isTrusted: true, ...event });
    assert.equal(harness.cover.dataset.state, "opening", `${type}:${event.key || "pointer"}`);
  }
});

test("only transform completion from both panels finishes the cover", () => {
  const harness = createHarness();
  harness.openButton.dispatch("click", { isTrusted: true });

  harness.leftPanel.dispatch("transitionend", { propertyName: "opacity" });
  assert.equal(harness.cover.dataset.state, "opening");
  harness.leftPanel.dispatch("transitionend", { propertyName: "transform" });
  assert.equal(harness.cover.dataset.state, "opening");
  harness.rightPanel.dispatch("transitionend", { propertyName: "transform" });

  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.cover.hidden, true);
  assert.equal(harness.invitation.inert, false);
  assert.equal(harness.musicControls.inert, false);
  assert.equal(harness.heartsToggle.inert, true, "pre-existing inert state must be restored");
  assert.equal(harness.document.documentElement.classList.contains("has-invitation-cover"), false);
  assert.equal(harness.document.activeElement, harness.invitation);
  assert.equal(harness.invitation.focusOptions?.preventScroll, true);
  assert.equal(harness.openButton.listenerCount("pointerup"), 0);
  assert.equal(harness.openButton.listenerCount("click"), 0);
  assert.equal(harness.openButton.listenerCount("keydown"), 0);
  assert.equal(harness.leftPanel.listenerCount("transitionend"), 0);
  assert.equal(harness.rightPanel.listenerCount("transitionend"), 0);
  assert.equal(harness.window.listenerCount("pagehide"), 0);
});

test("reduced motion skips panel animation and restores prior states immediately", () => {
  const harness = createHarness({
    invitationInitiallyInert: true,
    reducedMotion: true,
    rootInitiallyLocked: true,
  });

  harness.openButton.dispatch("keydown", { isTrusted: true, key: " " });
  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.cover.hidden, true);
  assert.equal(harness.cover.classList.contains("is-opening"), false);
  assert.equal(harness.invitation.inert, true);
  assert.equal(harness.document.documentElement.classList.contains("has-invitation-cover"), true);
  assert.equal(harness.document.activeElement, harness.openButton, "an inert main must not receive focus");
  assert.equal(harness.clock.tasks.size, 0);
});

test("completion does not steal focus that already moved outside the cover", () => {
  const harness = createHarness();
  harness.openButton.dispatch("click", { isTrusted: true });
  harness.outside.focus({ preventScroll: true });
  harness.clock.tick(1200);

  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.document.activeElement, harness.outside);
});

test("pagehide fails open safely and a repeated init never relocks or replays", () => {
  const harness = createHarness();
  harness.window.dispatch("pagehide");

  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.cover.hidden, true);
  assert.equal(harness.invitation.inert, false);
  assert.equal(harness.document.documentElement.classList.contains("has-invitation-cover"), false);
  assert.equal(harness.document.activeElement, harness.openButton, "pagehide must not redirect focus");
  assert.equal(harness.clock.tasks.size, 0);

  harness.context.initializeInvitationCover();
  harness.clock.tick(5000);
  assert.equal(harness.cover.dataset.state, "opened");
  assert.equal(harness.cover.hidden, true);
});

test("missing cover markup remains a progressive-enhancement no-op", () => {
  const harness = createHarness({ coverPresent: false });

  assert.equal(harness.clock.tasks.size, 0);
  assert.equal(harness.invitation.inert, false);
  assert.equal(harness.musicControls.inert, false);
  assert.equal(harness.document.documentElement.classList.contains("has-invitation-cover"), false);
});

test("opening gestures never suppress the document event used by music fallback", () => {
  assert.doesNotMatch(coverSource, /\.(?:preventDefault|stopPropagation|stopImmediatePropagation)\s*\(/u);
});

test("static cover markup starts hidden and keeps the page readable when JS is absent", () => {
  const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
  const coverTag = html.match(/<div\b[^>]*\bid="invitationCover"[^>]*>/u)?.[0];
  const mainTag = html.match(/<main\b[^>]*\bclass="invitation"[^>]*>/u)?.[0];
  const leftPanel = html.match(/<div\b[^>]*invitation-cover__panel--left[^>]*>/u)?.[0];
  const rightPanel = html.match(/<div\b[^>]*invitation-cover__panel--right[^>]*>/u)?.[0];

  assert.ok(coverTag);
  assert.match(coverTag, /\bhidden\b/u);
  assert.match(coverTag, /\brole="dialog"/u);
  assert.match(coverTag, /\baria-modal="true"/u);
  assert.match(coverTag, /\baria-label="Mở thiệp cưới"/u);
  assert.ok(leftPanel);
  assert.ok(rightPanel);
  assert.match(leftPanel, /\baria-hidden="true"/u);
  assert.match(rightPanel, /\baria-hidden="true"/u);
  assert.ok(mainTag);
  assert.match(mainTag, /\btabindex="-1"/u);
  assert.match(html, /<button\b[^>]*\bid="openInvitation"[^>]*\btype="button"/u);
  assert.match(html, /<script\b[^>]*\bsrc="\/cover\.js[^"?]*(?:\?[^" ]*)?"[^>]*\bdefer\b/u);
});
