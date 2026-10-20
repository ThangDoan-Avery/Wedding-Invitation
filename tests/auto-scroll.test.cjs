const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const autoScrollSource = fs.readFileSync(path.join(__dirname, "../deploy/auto-scroll.js"), "utf8");

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
        listener.call(this, {
          type,
          target: this,
          composedPath: () => [this],
          ...event,
        });
      }
    },
  });
}

class MockNode {}

class MockElement extends MockNode {
  constructor({ editable = false, hidden = false, inert = false, interactive = "" } = {}) {
    super();
    Object.assign(this, createEventTarget());
    this.attributes = new Map();
    this.children = [];
    this.classList = {
      values: new Set(),
      add: name => this.classList.values.add(name),
      contains: name => this.classList.values.has(name),
      remove: name => this.classList.values.delete(name),
    };
    this.dataset = {};
    this.disabled = false;
    this.editable = editable;
    this.hidden = hidden;
    this.inert = inert;
    this.interactive = interactive;
    this.scrollHeight = 0;
    this.textContent = "";
    this.title = "";
    if (inert) this.attributes.set("inert", "");
  }

  append(...children) {
    this.children.push(...children);
  }

  closest(selector) {
    if (this.editable && selector.includes("input")) return this;
    if (this.interactive === "button" && selector.includes("button")) return this;
    if (this.interactive === "anchor" && (selector.includes("a[href]") || selector.includes("a"))) {
      return this;
    }
    return null;
  }

  contains(candidate) {
    return candidate === this || this.children.some(child => child.contains(candidate));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
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

class FakeRaf {
  constructor() {
    this.nextId = 1;
    this.frames = new Map();
  }

  cancel(id) {
    this.frames.delete(id);
  }

  request(callback) {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  }

  step(timestamp) {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach(callback => callback(timestamp));
  }
}

function createHarness({
  coverPresent = true,
  coverOpened = false,
  dialogOpen = false,
  documentHidden = false,
  hash = "",
  innerHeight = 500,
  readyState = "loading",
  reducedMotion = false,
  scrollHeight = 2500,
  scrollY = 0,
} = {}) {
  const clock = new FakeClock();
  const raf = new FakeRaf();
  const invitation = new MockElement({ inert: coverPresent && !coverOpened });
  invitation.scrollHeight = scrollHeight;
  const body = new MockElement();
  body.scrollHeight = scrollHeight;
  const root = new MockElement();
  root.scrollHeight = scrollHeight;
  if (coverPresent && !coverOpened) root.classList.add("has-invitation-cover");
  const cover = coverPresent ? new MockElement({ hidden: coverOpened }) : null;
  if (cover) cover.dataset.state = coverOpened ? "opened" : "closed";
  const coverButton = new MockElement();
  cover?.append(coverButton);
  const ordinaryTarget = new MockElement();
  const editableTarget = new MockElement({ editable: true });
  const externalButton = new MockElement({ interactive: "button" });
  const externalLink = new MockElement({ interactive: "anchor" });
  invitation.append(externalButton, externalLink);
  const dialog = new MockElement();
  const mediaQuery = createEventTarget({ matches: reducedMotion });
  const observers = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    disconnect() {
      this.disconnected = true;
    }

    observe(target, options) {
      this.options = options;
      this.target = target;
    }
  }

  const document = createEventTarget({
    activeElement: coverOpened ? invitation : coverButton,
    body,
    dialogOpen,
    documentElement: root,
    hidden: documentHidden,
    readyState,
    querySelector(selector) {
      if (selector === ".invitation") return invitation;
      if (selector === "#invitationCover") return cover;
      if (selector === "dialog[open]") return this.dialogOpen ? dialog : null;
      return null;
    },
  });

  const window = createEventTarget({
    innerHeight,
    location: { hash },
    scrollCalls: [],
    scrollX: 0,
    scrollY,
    cancelAnimationFrame: raf.cancel.bind(raf),
    clearTimeout: clock.clearTimeout.bind(clock),
    matchMedia(query) {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return mediaQuery;
    },
    requestAnimationFrame: raf.request.bind(raf),
    scrollTo(options) {
      this.scrollCalls.push(options);
      this.scrollY = Number(options.top);
      this.dispatch("scroll", { isTrusted: true, target: this });
    },
    setTimeout: clock.setTimeout.bind(clock),
  });

  const context = vm.createContext({
    Array,
    console,
    document,
    Element: MockElement,
    Math,
    MutationObserver: FakeMutationObserver,
    Node: MockNode,
    Number,
    window,
  });
  vm.runInContext(autoScrollSource, context);

  return {
    body,
    clock,
    context,
    cover,
    coverButton,
    document,
    editableTarget,
    externalButton,
    externalLink,
    invitation,
    mediaQuery,
    observers,
    ordinaryTarget,
    raf,
    root,
    window,
    dispatchUser(type, target = ordinaryTarget, extra = {}) {
      document.dispatch(type, {
        isTrusted: true,
        target,
        composedPath: () => [target],
        ...extra,
      });
    },
    fireDomReady() {
      document.readyState = "interactive";
      document.dispatch("DOMContentLoaded", { isTrusted: true });
    },
    openCover({ focusTarget = invitation } = {}) {
      if (!cover) return;
      cover.dataset.state = "opened";
      cover.hidden = true;
      invitation.inert = false;
      invitation.attributes.delete("inert");
      root.classList.remove("has-invitation-cover");
      document.activeElement = focusTarget;
      this.notifyMutations();
    },
    notifyMutations() {
      observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback([]));
    },
  };
}

function startAutomatically(harness) {
  harness.fireDomReady();
  harness.openCover();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");
  harness.clock.tick(1200);
  assert.equal(harness.invitation.dataset.autoScrollState, "running");
}

test("cover mutation and DOM readiness gate the delayed automatic start without control DOM", () => {
  const harness = createHarness();

  assert.equal(harness.invitation.dataset.autoScrollInitialized, "true");
  assert.equal(harness.invitation.dataset.autoScrollState, "idle");
  assert.equal(harness.clock.tasks.size, 0);

  harness.openCover();
  assert.equal(harness.invitation.dataset.autoScrollState, "idle", "main app must initialize first");
  harness.fireDomReady();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");

  harness.clock.tick(1199);
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");
  harness.clock.tick(1);
  assert.equal(harness.invitation.dataset.autoScrollState, "running");
  assert.equal(harness.root.classList.contains("is-auto-scrolling"), true);
  assert.equal(harness.raf.frames.size, 1);
});

test("RAF uses fractional 20px/s motion, caps long frames, and ignores own scroll events", () => {
  const harness = createHarness();
  startAutomatically(harness);

  harness.raf.step(1000);
  harness.raf.step(1016);
  assert.equal(harness.invitation.dataset.autoScrollState, "running");
  assert.ok(Math.abs(harness.window.scrollY - 0.32) < 1e-9);
  assert.equal(harness.window.scrollCalls.at(-1).behavior, "auto");

  harness.raf.step(1116);
  assert.ok(Math.abs(harness.window.scrollY - 1.6) < 1e-9, "100ms frame must be capped at 64ms");
  assert.equal(
    harness.invitation.dataset.autoScrollState,
    "running",
    "programmatic scroll events must not self-stop",
  );
  assert.equal(harness.raf.frames.size, 1);
});

test("trusted input during waiting permanently cancels automatic scrolling", () => {
  const harness = createHarness();
  harness.fireDomReady();
  harness.openCover();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");

  harness.dispatchUser("wheel");
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  harness.clock.tick(5000);
  harness.notifyMutations();
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.raf.frames.size, 0);
});

test("trusted navigation inputs stop while synthetic, modifier-only, and neutral focus do not", () => {
  const stopEvents = [
    ["pointerdown", {}],
    ["touchstart", {}],
    ["wheel", {}],
    ["click", {}],
    ["keydown", { key: "Tab" }],
    ["keydown", { key: "ArrowDown" }],
  ];

  for (const [type, event] of stopEvents) {
    const harness = createHarness();
    harness.fireDomReady();
    harness.openCover();
    harness.dispatchUser(type, harness.ordinaryTarget, event);
    assert.equal(harness.invitation.dataset.autoScrollState, "paused", `${type}:${event.key || ""}`);
  }

  for (const targetName of ["editableTarget", "externalButton", "externalLink"]) {
    const harness = createHarness();
    harness.fireDomReady();
    harness.openCover();
    const target = harness[targetName];
    harness.document.dispatch("focusin", {
      isTrusted: true,
      target,
      composedPath: () => [target, harness.invitation],
    });
    assert.equal(harness.invitation.dataset.autoScrollState, "paused", targetName);
  }

  const mainFocusHarness = createHarness();
  mainFocusHarness.fireDomReady();
  mainFocusHarness.openCover();
  mainFocusHarness.document.dispatch("focusin", {
    isTrusted: true,
    target: mainFocusHarness.invitation,
    composedPath: () => [mainFocusHarness.invitation],
  });
  assert.equal(mainFocusHarness.invitation.dataset.autoScrollState, "waiting");

  for (const event of [
    { isTrusted: false, key: "ArrowDown" },
    { isTrusted: true, key: "Shift" },
    { isTrusted: true, isComposing: true, key: "Process" },
  ]) {
    const harness = createHarness();
    harness.fireDomReady();
    harness.openCover();
    harness.document.dispatch("keydown", {
      target: harness.ordinaryTarget,
      composedPath: () => [harness.ordinaryTarget],
      ...event,
    });
    assert.equal(harness.invitation.dataset.autoScrollState, "waiting");
  }
});

test("native scroll divergence during the 1200ms wait cancels the pending start", () => {
  const harness = createHarness();
  harness.fireDomReady();
  harness.openCover();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");

  harness.window.scrollY = 20;
  harness.window.dispatch("scroll", { isTrusted: true, target: harness.window });
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.clock.tasks.size, 0);
  harness.clock.tick(1200);
  assert.equal(harness.raf.frames.size, 0);
});

test("gate waits for external inert or lock removal and a dialog cancels waiting permanently", () => {
  const harness = createHarness({ coverOpened: true });
  harness.invitation.inert = true;
  harness.root.classList.add("has-invitation-cover");
  harness.fireDomReady();
  assert.equal(harness.invitation.dataset.autoScrollState, "idle");

  harness.invitation.inert = false;
  harness.root.classList.remove("has-invitation-cover");
  harness.notifyMutations();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");

  harness.document.dialogOpen = true;
  harness.notifyMutations();
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.clock.tasks.size, 0);
  harness.document.dialogOpen = false;
  harness.notifyMutations();
  harness.clock.tick(5000);
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.raf.frames.size, 0);
});

test("a dialog already open at initialization permanently disables automatic scrolling", () => {
  const harness = createHarness({ dialogOpen: true });
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");

  harness.document.dialogOpen = false;
  harness.fireDomReady();
  harness.openCover();
  harness.notifyMutations();
  harness.clock.tick(5000);

  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.raf.frames.size, 0);
});

test("cover gestures do not count as reading input", () => {
  const harness = createHarness();
  harness.fireDomReady();

  for (const type of ["pointerdown", "click"]) {
    harness.document.dispatch(type, {
      isTrusted: true,
      target: harness.coverButton,
      composedPath: () => [harness.coverButton, harness.cover],
    });
  }
  harness.openCover();
  assert.equal(harness.invitation.dataset.autoScrollState, "waiting");
});

test("visitor input during running is sticky across return, mutations, and reinitialization", () => {
  const harness = createHarness();
  startAutomatically(harness);
  harness.raf.step(0);
  harness.raf.step(64);
  const stoppedAt = harness.window.scrollY;
  const observerCount = harness.observers.length;

  harness.dispatchUser("pointerdown");
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.raf.frames.size, 0);
  assert.equal(harness.root.classList.contains("is-auto-scrolling"), false);

  harness.window.dispatch("pageshow", { isTrusted: true });
  harness.root.classList.add("has-invitation-cover");
  harness.root.classList.remove("has-invitation-cover");
  harness.notifyMutations();
  harness.context.initializeAutoScroll();
  harness.clock.tick(5000);
  harness.raf.step(6000);

  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.window.scrollY, stoppedAt);
  assert.equal(harness.raf.frames.size, 0);
  assert.equal(harness.observers.length, observerCount, "reinitialization must remain idempotent");
});

test("manual scroll divergence stops, but expected programmatic scroll does not", () => {
  const harness = createHarness();
  startAutomatically(harness);
  harness.raf.step(0);
  harness.raf.step(64);
  assert.equal(harness.invitation.dataset.autoScrollState, "running");

  harness.window.scrollY += 12;
  harness.window.dispatch("scroll", { isTrusted: true, target: harness.window });
  assert.equal(harness.invitation.dataset.autoScrollState, "paused");
  assert.equal(harness.raf.frames.size, 0);
});

test("dialog, cover lock, or inert main pauses a running session without auto-resume", () => {
  for (const block of ["dialog", "cover", "inert"]) {
    const harness = createHarness();
    startAutomatically(harness);
    if (block === "dialog") harness.document.dialogOpen = true;
    if (block === "cover") harness.root.classList.add("has-invitation-cover");
    if (block === "inert") harness.invitation.inert = true;

    harness.raf.step(0);
    assert.equal(harness.invitation.dataset.autoScrollState, "paused", block);
    if (block === "dialog") harness.document.dialogOpen = false;
    if (block === "cover") harness.root.classList.remove("has-invitation-cover");
    if (block === "inert") harness.invitation.inert = false;
    harness.notifyMutations();
    harness.clock.tick(5000);
    harness.raf.step(6000);
    assert.equal(harness.invitation.dataset.autoScrollState, "paused", `${block} must not auto-resume`);
    assert.equal(harness.raf.frames.size, 0);
  }
});

test("hidden page, pagehide, and runtime reduced motion stop without returning automatically", () => {
  const idlePagehideHarness = createHarness();
  idlePagehideHarness.window.dispatch("pagehide", { isTrusted: true });
  assert.equal(idlePagehideHarness.invitation.dataset.autoScrollState, "paused");
  idlePagehideHarness.fireDomReady();
  idlePagehideHarness.openCover();
  idlePagehideHarness.clock.tick(5000);
  assert.equal(idlePagehideHarness.invitation.dataset.autoScrollState, "paused");
  assert.equal(idlePagehideHarness.raf.frames.size, 0);

  const hiddenHarness = createHarness();
  hiddenHarness.fireDomReady();
  hiddenHarness.openCover();
  hiddenHarness.document.hidden = true;
  hiddenHarness.document.dispatch("visibilitychange", { isTrusted: true });
  assert.equal(hiddenHarness.invitation.dataset.autoScrollState, "paused");
  hiddenHarness.document.hidden = false;
  hiddenHarness.document.dispatch("visibilitychange", { isTrusted: true });
  assert.equal(hiddenHarness.invitation.dataset.autoScrollState, "paused");

  const pagehideHarness = createHarness();
  startAutomatically(pagehideHarness);
  pagehideHarness.window.dispatch("pagehide", { isTrusted: true });
  assert.equal(pagehideHarness.invitation.dataset.autoScrollState, "paused");

  const reducedHarness = createHarness();
  startAutomatically(reducedHarness);
  reducedHarness.mediaQuery.matches = true;
  reducedHarness.mediaQuery.dispatch("change", { matches: true });
  assert.equal(reducedHarness.invitation.dataset.autoScrollState, "paused");
  reducedHarness.mediaQuery.matches = false;
  reducedHarness.mediaQuery.dispatch("change", { matches: false });
  assert.equal(reducedHarness.invitation.dataset.autoScrollState, "paused");
});

test("reduced-motion default and missing cover never auto-start", () => {
  const reducedHarness = createHarness({ reducedMotion: true });
  reducedHarness.fireDomReady();
  reducedHarness.openCover();
  reducedHarness.clock.tick(5000);
  assert.equal(reducedHarness.invitation.dataset.autoScrollState, "paused");
  assert.equal(reducedHarness.raf.frames.size, 0);

  const missingCoverHarness = createHarness({ coverPresent: false });
  missingCoverHarness.fireDomReady();
  missingCoverHarness.clock.tick(5000);
  assert.equal(missingCoverHarness.invitation.dataset.autoScrollState, "idle");
  assert.equal(missingCoverHarness.raf.frames.size, 0);
});

test("deep scroll, URL hash, or deep focus disables surprising automatic movement", () => {
  const cases = [
    createHarness({ scrollY: 120 }),
    createHarness({ hash: "#rsvp" }),
    createHarness(),
  ];

  cases.forEach((harness, index) => {
    harness.fireDomReady();
    harness.openCover(index === 2 ? { focusTarget: harness.editableTarget } : undefined);
    assert.equal(harness.invitation.dataset.autoScrollState, "paused");
    assert.equal(harness.clock.tasks.size, 0);
  });
});

test("reaching the bottom finishes once and never restarts after scrolling up", () => {
  const harness = createHarness({ innerHeight: 500, scrollHeight: 501 });
  startAutomatically(harness);
  harness.raf.step(0);
  harness.raf.step(64);

  assert.equal(harness.window.scrollY, 1);
  assert.equal(harness.invitation.dataset.autoScrollState, "finished");
  assert.equal(harness.raf.frames.size, 0);
  const calls = harness.window.scrollCalls.length;

  harness.window.scrollY = 0;
  harness.window.dispatch("scroll", { isTrusted: true, target: harness.window });
  harness.notifyMutations();
  harness.context.initializeAutoScroll();
  harness.clock.tick(5000);
  harness.raf.step(6000);

  assert.equal(harness.invitation.dataset.autoScrollState, "finished");
  assert.equal(harness.window.scrollCalls.length, calls);
  assert.equal(harness.raf.frames.size, 0);
});

test("implementation has no control dependency and preserves startup order", () => {
  const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
  assert.doesNotMatch(autoScrollSource, /autoScrollControls|autoScrollToggle|autoScrollLabel/u);
  assert.doesNotMatch(html, /\bid="autoScroll(?:Controls|Toggle|Label)"/u);

  const coverScript = html.indexOf('src="/cover.js');
  const autoScrollScript = html.indexOf('src="/auto-scroll.js');
  const sdkScript = html.indexOf("@supabase/supabase-js");
  assert.ok(coverScript >= 0 && autoScrollScript > coverScript && sdkScript > autoScrollScript);
});

test("implementation uses RAF without suppressing native input", () => {
  assert.match(autoScrollSource, /requestAnimationFrame/u);
  assert.doesNotMatch(autoScrollSource, /setInterval/u);
  assert.doesNotMatch(autoScrollSource, /\.(?:preventDefault|stopPropagation|stopImmediatePropagation)\s*\(/u);
});
