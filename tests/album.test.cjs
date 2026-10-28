const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "../deploy/app.js"), "utf8");
assert.match(appSource, /\binitializeInvitation\(\);\s*$/u);
const appWithoutInitialization = appSource.replace(/\binitializeInvitation\(\);\s*$/u, "");
const setupAlbumSource = appSource.match(
  /function setupAlbum\(\) \{[\s\S]*?\n\}\n\nfunction setupPhotoDialog/u,
)?.[0];

class MockNode {}

class MockElement extends MockNode {
  constructor(tagName = "div") {
    super();
    this.attributes = new Map();
    this.mutations = [];
    this._src = "";
    this.children = [];
    this.clientWidth = tagName.toLowerCase() === "button" ? 80 : 200;
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
    this.offsetLeft = 0;
    this.offsetWidth = 80;
    this.open = false;
    this.parentElement = null;
    this.scrollCalls = [];
    this.scrollLeft = 0;
    this.style = {};
    this.tagName = tagName.toUpperCase();
    this.textContent = "";
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = String(value);
    this.mutations.push({ type: "src", value: this._src });
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      child.offsetLeft = this.children.length * 100;
      this.children.push(child);
    });
  }

  close() {
    this.open = false;
    this.attributes.delete("open");
  }

  dispatch(type, event = {}) {
    const dispatchedEvent = { type, target: this, ...event };
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener.call(this, dispatchedEvent);
    }
    return dispatchedEvent;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    return {
      left: this.offsetLeft - Number(this.parentElement?.scrollLeft || 0),
      width: this.clientWidth,
    };
  }

  querySelector(selector) {
    if (selector === "img") {
      return this.children.find((child) => child.tagName === "IMG") || null;
    }
    return null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    this.mutations.push({ type: "removeAttribute", name });
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.append(...children);
  }

  scrollTo(options) {
    this.scrollCalls.push(options);
    this.scrollLeft = Number(options.left || 0);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.mutations.push({ type: "setAttribute", name, value: String(value) });
  }

  showModal() {
    this.open = true;
    this.attributes.set("open", "");
  }
}

function makePhotos(count = 7) {
  return Array.from({ length: count }, (_, index) => ({
    src: `/assets/list${index + 1}.jpg`,
    alt: `Ảnh cưới Hữu Thắng và Thu Trang ${index + 1}`,
    position: "50% 50%",
  }));
}

function makeOptimizedPhoto(index = 1) {
  return {
    src: `/assets/optimized/list${index}-main.hash.webp`,
    srcset: [
      `/assets/optimized/list${index}-small.hash.webp 480w`,
      `/assets/optimized/list${index}-main.hash.webp 960w`,
    ].join(", "),
    sizes: "(max-width: 640px) 92vw, 720px",
    thumbSrc: `/assets/optimized/list${index}-thumb.hash.webp`,
    fullSrc: `/assets/optimized/list${index}-full.hash.webp`,
    width: 4609,
    height: 6913,
    alt: `Ảnh cưới Hữu Thắng và Thu Trang ${index}`,
    position: "50% 50%",
  };
}

function createHarness({ includeManifest = true, manifest = makePhotos() } = {}) {
  const album = new MockElement("section");
  const viewer = new MockElement("div");
  const emptyState = new MockElement("p");
  emptyState.hidden = true;
  const mainButton = new MockElement("button");
  const mainImage = new MockElement("img");
  mainImage.src = "/assets/placeholder.jpg";
  mainImage.alt = "Placeholder";
  mainButton.append(mainImage);
  const previousButton = new MockElement("button");
  const nextButton = new MockElement("button");
  const counter = new MockElement("p");
  counter.textContent = "stale";
  const thumbContainer = new MockElement("div");
  thumbContainer.append(new MockElement("button"));
  const dialog = new MockElement("dialog");
  const dialogPhoto = new MockElement("img");
  const closePhoto = new MockElement("button");
  const optimizedStoryButton = new MockElement("button");
  const optimizedStoryImage = new MockElement("img");
  optimizedStoryImage.src = "/assets/optimized/story-small.hash.webp";
  optimizedStoryImage.currentSrc = "/assets/optimized/story-main.hash.webp";
  optimizedStoryImage.dataset.fullSrc = "/assets/optimized/story-full.hash.webp";
  optimizedStoryImage.alt = "Ảnh câu chuyện đã tối ưu";
  optimizedStoryButton.append(optimizedStoryImage);
  const responsiveFallbackButton = new MockElement("button");
  const responsiveFallbackImage = new MockElement("img");
  responsiveFallbackImage.src = "/assets/story-fallback.jpg";
  responsiveFallbackImage.currentSrc = "/assets/story-current.webp";
  responsiveFallbackImage.alt = "Ảnh responsive legacy";
  responsiveFallbackButton.append(responsiveFallbackImage);

  const selectors = new Map([
    ["[data-album]", album],
    ["#albumViewer", viewer],
    ["#albumEmpty", emptyState],
    ["#albumImage", mainImage],
    ["#albumPrev", previousButton],
    ["#albumNext", nextButton],
    ["#albumCounter", counter],
    ["#albumThumbs", thumbContainer],
    ["#photoDialog", dialog],
    ["#dialogPhoto", dialogPhoto],
    ["#closePhoto", closePhoto],
  ]);

  const document = {
    createElement(tagName) {
      return new MockElement(tagName);
    },
    querySelector(selector) {
      return selectors.get(selector) || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-photo-open]"
        ? [mainButton, optimizedStoryButton, responsiveFallbackButton]
        : [];
    },
  };
  const window = {};
  const globals = {
    console,
    document,
    Element: MockElement,
    Node: MockNode,
    URLSearchParams,
    window,
  };
  if (includeManifest) globals.INVITATION_ALBUM_PHOTOS = manifest;

  const context = vm.createContext(globals);
  vm.runInContext(appWithoutInitialization, context);
  context.setupAlbum();

  return {
    album,
    closePhoto,
    context,
    counter,
    dialog,
    dialogPhoto,
    emptyState,
    mainButton,
    mainImage,
    nextButton,
    optimizedStoryButton,
    optimizedStoryImage,
    previousButton,
    responsiveFallbackButton,
    responsiveFallbackImage,
    thumbContainer,
    viewer,
  };
}

test("seven manifest photos render dynamic thumbnails and the first image without an initial scroll", () => {
  const harness = createHarness();

  assert.equal(harness.viewer.hidden, false);
  assert.equal(harness.emptyState.hidden, true);
  assert.equal(harness.previousButton.disabled, false);
  assert.equal(harness.nextButton.disabled, false);
  assert.equal(harness.thumbContainer.children.length, 7);
  assert.equal(harness.mainImage.src, "/assets/list1.jpg");
  assert.equal(harness.mainImage.alt, "Ảnh cưới Hữu Thắng và Thu Trang 1");
  assert.equal(harness.mainImage.style.objectPosition, "50% 50%");
  assert.equal(harness.mainImage.dataset.fullSrc, "/assets/list1.jpg");
  assert.equal(harness.mainImage.getAttribute("srcset"), null);
  assert.equal(harness.mainImage.getAttribute("sizes"), null);
  assert.equal(harness.counter.textContent, "1 / 7");
  assert.equal(harness.thumbContainer.scrollCalls.length, 0);

  harness.thumbContainer.children.forEach((button, index) => {
    const image = button.querySelector("img");
    assert.equal(button.type, "button");
    assert.equal(button.dataset.albumIndex, String(index));
    assert.equal(button.getAttribute("aria-label"), `Xem ảnh ${index + 1}`);
    assert.equal(button.getAttribute("aria-current"), index === 0 ? "true" : "false");
    assert.equal(image.src, `/assets/list${index + 1}.jpg`);
    assert.equal(image.alt, "");
    assert.equal(image.loading, "lazy");
    assert.equal(image.decoding, "async");
    assert.equal(image.style.objectPosition, "50% 50%");
    assert.equal(image.getAttribute("srcset"), null);
    assert.equal(image.getAttribute("sizes"), null);
  });
});

test("optimized entries use responsive main sources and thumbnail-only rail images", () => {
  const optimized = makeOptimizedPhoto(1);
  const legacy = makePhotos(2)[1];
  const harness = createHarness({ manifest: [optimized, legacy] });
  const optimizedThumb = harness.thumbContainer.children[0].querySelector("img");
  const legacyThumb = harness.thumbContainer.children[1].querySelector("img");
  const normalizedPhotos = JSON.parse(
    vm.runInContext("JSON.stringify(ALBUM_PHOTOS)", harness.context),
  );

  assert.equal(harness.mainImage.src, optimized.src);
  assert.equal(harness.mainImage.getAttribute("srcset"), optimized.srcset);
  assert.equal(harness.mainImage.getAttribute("sizes"), optimized.sizes);
  assert.equal(harness.mainImage.dataset.fullSrc, optimized.fullSrc);
  assert.equal(optimizedThumb.src, optimized.thumbSrc);
  assert.equal(optimizedThumb.getAttribute("srcset"), null);
  assert.equal(optimizedThumb.getAttribute("sizes"), null);
  assert.equal(legacyThumb.src, legacy.src);
  assert.equal(normalizedPhotos[0].width, optimized.width);
  assert.equal(normalizedPhotos[0].height, optimized.height);
  assert.equal(normalizedPhotos[1].thumbSrc, legacy.src);
  assert.equal(normalizedPhotos[1].fullSrc, legacy.src);
  assert.equal(Object.hasOwn(normalizedPhotos[1], "srcset"), false);
  assert.equal(Object.hasOwn(normalizedPhotos[1], "sizes"), false);

  harness.nextButton.dispatch("click");
  assert.equal(harness.mainImage.src, legacy.src);
  assert.equal(harness.mainImage.getAttribute("srcset"), null);
  assert.equal(harness.mainImage.getAttribute("sizes"), null);
  assert.equal(harness.mainImage.dataset.fullSrc, legacy.src);

  harness.previousButton.dispatch("click");
  assert.equal(harness.mainImage.src, optimized.src);
  assert.equal(harness.mainImage.getAttribute("srcset"), optimized.srcset);
  assert.equal(harness.mainImage.getAttribute("sizes"), optimized.sizes);
  assert.equal(harness.mainImage.dataset.fullSrc, optimized.fullSrc);
});

test("missing and empty manifests show the empty state without navigation or modulo work", () => {
  for (const options of [
    { includeManifest: false },
    { manifest: [] },
    { manifest: { src: "/assets/list1.jpg" } },
    { manifest: [null, [], {}, { src: "   " }, { src: 42 }] },
  ]) {
    const harness = createHarness(options);
    assert.equal(harness.viewer.hidden, true);
    assert.equal(harness.emptyState.hidden, false);
    assert.equal(harness.previousButton.disabled, true);
    assert.equal(harness.nextButton.disabled, true);
    assert.equal(harness.counter.textContent, "");
    assert.equal(harness.thumbContainer.children.length, 0);
    assert.doesNotThrow(() => {
      harness.previousButton.dispatch("click");
      harness.nextButton.dispatch("click");
      harness.album.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
    });
    assert.equal(harness.thumbContainer.scrollCalls.length, 0);
  }
});

test("one photo disables both arrows and remains stable under arrow keys", () => {
  const harness = createHarness({ manifest: makePhotos(1) });
  let prevented = 0;

  assert.equal(harness.previousButton.disabled, true);
  assert.equal(harness.nextButton.disabled, true);
  assert.equal(harness.counter.textContent, "1 / 1");
  harness.album.dispatch("keydown", {
    key: "ArrowRight",
    preventDefault() {
      prevented += 1;
    },
  });

  assert.equal(prevented, 0);
  assert.equal(harness.mainImage.src, "/assets/list1.jpg");
  assert.equal(harness.counter.textContent, "1 / 1");
  assert.equal(harness.thumbContainer.scrollCalls.length, 0);
});

test("buttons wrap, keyboard navigation is preserved, and only explicit navigation scrolls thumbs", () => {
  const harness = createHarness();
  let prevented = 0;

  harness.previousButton.dispatch("click");
  assert.equal(harness.mainImage.src, "/assets/list7.jpg");
  assert.equal(harness.counter.textContent, "7 / 7");
  assert.equal(harness.thumbContainer.children[6].getAttribute("aria-current"), "true");
  assert.equal(harness.thumbContainer.scrollCalls.at(-1).left, 540);
  assert.equal(harness.thumbContainer.scrollCalls.at(-1).behavior, "auto");

  harness.nextButton.dispatch("click");
  assert.equal(harness.mainImage.src, "/assets/list1.jpg");
  assert.equal(harness.counter.textContent, "1 / 7");

  harness.album.dispatch("keydown", {
    key: "ArrowRight",
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(harness.mainImage.src, "/assets/list2.jpg");
  harness.album.dispatch("keydown", {
    key: "ArrowLeft",
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(harness.mainImage.src, "/assets/list1.jpg");
  assert.equal(prevented, 2);
  assert.equal(harness.thumbContainer.scrollCalls.length, 4);
});

test("thumbnail clicks update image, counter, current state, and horizontal scroll", () => {
  const harness = createHarness();
  harness.thumbContainer.children[4].dispatch("click");

  assert.equal(harness.mainImage.src, "/assets/list5.jpg");
  assert.equal(harness.mainImage.alt, "Ảnh cưới Hữu Thắng và Thu Trang 5");
  assert.equal(harness.counter.textContent, "5 / 7");
  assert.equal(harness.thumbContainer.children[0].getAttribute("aria-current"), "false");
  assert.equal(harness.thumbContainer.children[4].getAttribute("aria-current"), "true");
  assert.equal(harness.thumbContainer.scrollCalls.length, 1);
  assert.equal(harness.thumbContainer.scrollCalls[0].left, 340);
  assert.equal(harness.thumbContainer.scrollCalls[0].behavior, "auto");
});

test("invalid manifest entries are ignored and safe text fallbacks use DOM properties", () => {
  const harness = createHarness({
    manifest: [
      null,
      { alt: "No source" },
      { src: "  /assets/list1.jpg  ", alt: "", position: "" },
      {
        src: "/assets/list2.jpeg",
        alt: "<strong>Ảnh thứ hai</strong>",
        position: " 25% 75% ",
      },
    ],
  });

  assert.equal(harness.thumbContainer.children.length, 2);
  assert.equal(harness.mainImage.src, "/assets/list1.jpg");
  assert.equal(harness.mainImage.alt, "Ảnh cưới Hữu Thắng và Thu Trang 1");
  assert.equal(harness.mainImage.style.objectPosition, "50% 50%");
  harness.nextButton.dispatch("click");
  assert.equal(harness.mainImage.alt, "<strong>Ảnh thứ hai</strong>");
  assert.equal(harness.mainImage.style.objectPosition, "25% 75%");
  assert.doesNotMatch(setupAlbumSource, /innerHTML/u);
});

test("photo dialog reads the album image source after dynamic navigation", () => {
  const harness = createHarness();
  harness.thumbContainer.children[3].dispatch("click");
  harness.context.setupPhotoDialog();
  harness.mainButton.dispatch("click");

  assert.equal(harness.dialogPhoto.src, "/assets/list4.jpg");
  assert.equal(harness.dialogPhoto.alt, "Ảnh cưới Hữu Thắng và Thu Trang 4");
  assert.equal(harness.dialog.open, true);
});

test("photo dialog prefers fullSrc and clears responsive candidates before assigning it", () => {
  const optimized = makeOptimizedPhoto(1);
  const harness = createHarness({ manifest: [optimized] });
  harness.context.setupPhotoDialog();
  harness.dialogPhoto.setAttribute("srcset", "/assets/optimized/dialog-old.webp 480w");
  harness.dialogPhoto.setAttribute("sizes", "100vw");
  harness.dialogPhoto.mutations = [];

  harness.mainButton.dispatch("click");

  assert.equal(harness.dialogPhoto.src, optimized.fullSrc);
  assert.equal(harness.dialogPhoto.alt, optimized.alt);
  assert.equal(harness.dialogPhoto.getAttribute("srcset"), null);
  assert.equal(harness.dialogPhoto.getAttribute("sizes"), null);
  const srcMutationIndex = harness.dialogPhoto.mutations.findIndex(({ type }) => type === "src");
  const removeSrcsetIndex = harness.dialogPhoto.mutations.findIndex(
    ({ type, name }) => type === "removeAttribute" && name === "srcset",
  );
  const removeSizesIndex = harness.dialogPhoto.mutations.findIndex(
    ({ type, name }) => type === "removeAttribute" && name === "sizes",
  );
  assert.ok(removeSrcsetIndex >= 0 && removeSrcsetIndex < srcMutationIndex);
  assert.ok(removeSizesIndex >= 0 && removeSizesIndex < srcMutationIndex);
});

test("photo dialog supports optimized static images and currentSrc legacy fallback", () => {
  const harness = createHarness();
  harness.context.setupPhotoDialog();

  harness.optimizedStoryButton.dispatch("click");
  assert.equal(harness.dialogPhoto.src, harness.optimizedStoryImage.dataset.fullSrc);
  assert.equal(harness.dialogPhoto.alt, harness.optimizedStoryImage.alt);

  harness.responsiveFallbackButton.dispatch("click");
  assert.equal(harness.dialogPhoto.src, harness.responsiveFallbackImage.currentSrc);
  assert.equal(harness.dialogPhoto.alt, harness.responsiveFallbackImage.alt);

  harness.responsiveFallbackImage.currentSrc = "";
  harness.responsiveFallbackButton.dispatch("click");
  assert.equal(harness.dialogPhoto.src, harness.responsiveFallbackImage.src);
});

test("album markup exposes empty dynamic containers and loads its manifest before the app", () => {
  const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
  const viewerTag = html.match(/<div\b[^>]*\bid="albumViewer"[^>]*>/u)?.[0];
  const emptyTag = html.match(/<p\b[^>]*\bid="albumEmpty"[^>]*>/u)?.[0];
  const mainImageTag = html.match(/<img\b[^>]*\bid="albumImage"[^>]*>/u)?.[0];
  const counterContents = html.match(
    /<p\b[^>]*\bid="albumCounter"[^>]*>([\s\S]*?)<\/p>/u,
  )?.[1];
  const thumbContents = html.match(
    /<div\b[^>]*\bid="albumThumbs"[^>]*>([\s\S]*?)<\/div>/u,
  )?.[1];

  assert.ok(viewerTag);
  assert.ok(emptyTag);
  assert.match(emptyTag, /\bhidden\b/u);
  assert.ok(mainImageTag);
  assert.match(mainImageTag, /\bsrc="\/assets\/[^"\s]+"/u);
  assert.equal(counterContents?.trim(), "");
  assert.equal(thumbContents?.trim(), "");

  const manifestScript = html.indexOf('src="/album-data.js');
  const appScript = html.indexOf('src="/app.js');
  assert.ok(manifestScript >= 0 && appScript > manifestScript);
});

test("album setup stays local and does not enumerate directories or scroll the window", () => {
  assert.ok(setupAlbumSource);
  assert.doesNotMatch(setupAlbumSource, /fetch\s*\(|XMLHttpRequest|readdir|scrollIntoView|window\.scroll/iu);
  assert.match(setupAlbumSource, /thumbContainer\.scrollTo/u);
});
