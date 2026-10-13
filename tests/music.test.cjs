const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "../deploy/app.js"), "utf8");
assert.match(appSource, /\binitializeInvitation\(\);\s*$/u);
const musicSource = appSource.replace(/\binitializeInvitation\(\);\s*$/u, "");

class MockNode {}

class MockElement extends MockNode {
  constructor({ editable = false } = {}) {
    super();
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        if (force) this.classList.values.add(name);
        else this.classList.values.delete(name);
      },
    };
    this.dataset = {};
    this.editable = editable;
    this.hidden = false;
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners ||= new Map();
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners?.get(type) || [];
    this.listeners?.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners?.get(type) || [])]) {
      listener.call(this, { type, target: this, ...event });
    }
  }

  contains(target) {
    return target === this;
  }

  closest(selector) {
    return this.editable && selector.includes("input") ? this : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

class MockAudio extends MockElement {
  constructor() {
    super();
    this.currentTime = 0;
    this.error = null;
    this.loadCalls = 0;
    this.paused = true;
    this.pauseCalls = 0;
    this.playCalls = 0;
    this.playQueue = [];
  }

  enqueuePlay(factory) {
    this.playQueue.push(factory);
  }

  play() {
    this.playCalls += 1;
    this.paused = false;
    const factory = this.playQueue.shift();
    return factory ? factory() : Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  load() {
    this.loadCalls += 1;
    this.error = null;
    this.paused = true;
  }
}

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
  });
}

function notAllowedError() {
  const error = new Error("autoplay blocked");
  error.name = "NotAllowedError";
  return error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness({ playFactories = [] } = {}) {
  const audio = new MockAudio();
  playFactories.forEach((factory) => audio.enqueuePlay(factory));
  const controls = new MockElement();
  controls.hidden = true;
  const toggle = new MockElement();
  const label = new MockElement();
  const status = new MockElement();
  const ordinaryTarget = new MockElement();
  const editableTarget = new MockElement({ editable: true });
  const document = createEventTarget({
    openDialog: false,
    querySelector(selector) {
      if (selector === "dialog[open]") return this.openDialog ? new MockElement() : null;
      return {
        "#musicControls": controls,
        "#musicToggle": toggle,
        "#musicToggleLabel": label,
        "#musicStatus": status,
        "#weddingAudio": audio,
      }[selector] || null;
    },
    querySelectorAll() {
      return [];
    },
  });
  const window = createEventTarget({});
  const context = vm.createContext({
    console,
    document,
    Element: MockElement,
    Node: MockNode,
    URLSearchParams,
    window,
  });

  vm.runInContext(musicSource, context);
  context.setupMusic();

  return {
    audio,
    context,
    controls,
    document,
    editableTarget,
    label,
    ordinaryTarget,
    status,
    toggle,
    window,
  };
}

test("production music uses native audio with no remote player remnants", () => {
  assert.doesNotMatch(appSource, /youtube|iframe_api|\bYT\.|soundcloud|SC\.Widget|MUSIC_EMBED_URL/iu);

  const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
  const audioTag = html.match(/<audio\b[^>]*\bid="weddingAudio"[^>]*>/u)?.[0];
  assert.ok(audioTag);
  assert.match(audioTag, /\bsrc="\/assets\/Anh-nang-cua-anh\.mp3"/u);
  assert.match(audioTag, /\bpreload="metadata"/u);
  assert.match(audioTag, /\bloop\b/u);
});

test("autoplay stays loading until the native playing event", async () => {
  const harness = createHarness();

  assert.equal(harness.controls.hidden, false);
  assert.equal(harness.controls.dataset.state, "loading");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "true");
  assert.equal(harness.label.textContent, "Đang tải…");
  assert.equal(harness.audio.playCalls, 1);

  await flushPromises();
  assert.equal(harness.controls.dataset.state, "loading");

  harness.audio.dispatch("playing");
  assert.equal(harness.controls.dataset.state, "playing");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "true");
  assert.equal(harness.label.textContent, "Tắt nhạc");
  assert.match(harness.toggle.title, /Ánh Nắng Của Anh – Đức Phúc/u);
  assert.match(harness.status.textContent, /Ánh Nắng Của Anh – Đức Phúc/u);
});

test("blocked autoplay retries once on a trusted non-editable gesture", async () => {
  const first = notAllowedError();
  const second = notAllowedError();
  const harness = createHarness({
    playFactories: [
      () => Promise.reject(first),
      () => Promise.reject(second),
    ],
  });

  await flushPromises();
  assert.equal(harness.controls.dataset.state, "blocked");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");

  const callsBeforeSynthetic = harness.audio.playCalls;
  harness.document.dispatch("pointerup", { isTrusted: false, target: harness.ordinaryTarget });
  harness.document.dispatch("keydown", {
    isTrusted: true,
    key: "a",
    target: harness.editableTarget,
  });
  harness.document.openDialog = true;
  harness.document.dispatch("click", { isTrusted: true, target: harness.ordinaryTarget });
  harness.document.openDialog = false;
  assert.equal(harness.audio.playCalls, callsBeforeSynthetic);

  harness.document.dispatch("pointerup", { isTrusted: true, target: harness.ordinaryTarget });
  await flushPromises();
  assert.equal(harness.audio.playCalls, callsBeforeSynthetic + 1);
  assert.equal(harness.controls.dataset.state, "blocked");
  assert.match(harness.status.textContent, /Bật nhạc/u);

  harness.document.dispatch("click", { isTrusted: true, target: harness.ordinaryTarget });
  assert.equal(harness.audio.playCalls, callsBeforeSynthetic + 1);

  harness.audio.enqueuePlay(() => Promise.resolve());
  harness.toggle.dispatch("click");
  assert.equal(harness.audio.playCalls, callsBeforeSynthetic + 2);
  assert.equal(harness.controls.dataset.state, "loading");
  harness.audio.dispatch("playing");
  assert.equal(harness.controls.dataset.state, "playing");
});

test("explicit stop wins stale play work and only the button can restart", async () => {
  const firstPlay = deferred();
  const secondPlay = deferred();
  const harness = createHarness({
    playFactories: [
      () => firstPlay.promise,
      () => secondPlay.promise,
    ],
  });
  harness.audio.currentTime = 17;
  harness.toggle.dispatch("click");
  assert.equal(harness.controls.dataset.state, "off");
  assert.equal(harness.audio.currentTime, 17);
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");

  firstPlay.reject(notAllowedError());
  await flushPromises();
  harness.audio.dispatch("playing");
  assert.equal(harness.controls.dataset.state, "off");
  harness.audio.error = { code: 2 };
  harness.audio.dispatch("error");
  assert.equal(harness.controls.dataset.state, "off");

  const callsAfterStop = harness.audio.playCalls;
  harness.document.dispatch("pointerup", { isTrusted: true, target: harness.ordinaryTarget });
  harness.document.dispatch("keydown", { isTrusted: true, key: "Enter", target: harness.ordinaryTarget });
  assert.equal(harness.audio.playCalls, callsAfterStop);

  harness.toggle.dispatch("click");
  assert.equal(harness.controls.dataset.state, "loading");
  harness.audio.dispatch("pause");
  assert.equal(harness.controls.dataset.state, "loading");
  secondPlay.resolve();
  await flushPromises();
  harness.audio.dispatch("playing");
  assert.equal(harness.controls.dataset.state, "playing");
});

test("media errors are truthful and the button reloads before retrying", async () => {
  const harness = createHarness();
  harness.audio.error = { code: 2 };
  harness.audio.dispatch("error");

  assert.equal(harness.controls.dataset.state, "error");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");
  assert.match(harness.status.textContent, /Không tải được nhạc/u);

  harness.audio.enqueuePlay(() => Promise.resolve());
  harness.toggle.dispatch("click");
  assert.equal(harness.audio.loadCalls, 1);
  assert.equal(harness.controls.dataset.state, "loading");
  harness.audio.dispatch("playing");
  assert.equal(harness.controls.dataset.state, "playing");
});

test("an actual native pause while waiting leaves a truthful off state", () => {
  const harness = createHarness();
  harness.audio.dispatch("playing");
  harness.audio.dispatch("waiting");
  assert.equal(harness.controls.dataset.state, "loading");

  harness.audio.paused = true;
  harness.audio.dispatch("pause");
  assert.equal(harness.controls.dataset.state, "off");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");
});

test("pagehide pauses and pageshow does not restart music", () => {
  const harness = createHarness();
  harness.audio.dispatch("playing");
  const playCalls = harness.audio.playCalls;

  harness.window.dispatch("pagehide");
  assert.equal(harness.controls.dataset.state, "off");
  assert.equal(harness.toggle.getAttribute("aria-pressed"), "false");
  assert.ok(harness.audio.pauseCalls >= 1);

  harness.window.dispatch("pageshow");
  assert.equal(harness.audio.playCalls, playCalls);
  assert.equal(harness.controls.dataset.state, "off");
});
