"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  createAlbumManifest,
  encodePathSegment,
  escapeJsonForJavaScript,
  generateAlbumData,
  naturalCompareFilenames,
  scanAlbumFiles,
} = require("../scripts/generate-album.cjs");

function createFixture(testContext) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-album-"));
  const assetsDirectory = path.join(temporaryRoot, "assets");
  const outputFile = path.join(temporaryRoot, "album-data.js");
  fs.mkdirSync(assetsDirectory);

  testContext.after(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  return { temporaryRoot, assetsDirectory, outputFile };
}

function addFile(directory, filename) {
  fs.writeFileSync(path.join(directory, filename), "fixture", "utf8");
}

function evaluateGeneratedData(content) {
  const context = { globalThis: {} };
  vm.runInNewContext(content, context, { filename: "album-data.js" });
  return JSON.parse(JSON.stringify(context.globalThis.INVITATION_ALBUM_PHOTOS));
}

test("natural sorting orders numeric portions deterministically", () => {
  const filenames = ["list10.jpg", "list2.jpg", "List11.jpeg", "list1.jpg"];
  assert.deepEqual(filenames.sort(naturalCompareFilenames), [
    "list1.jpg",
    "list2.jpg",
    "list10.jpg",
    "List11.jpeg",
  ]);
  assert.equal(naturalCompareFilenames("LIST2.JPG", "list2.jpg") < 0, true);
  assert.notEqual(naturalCompareFilenames("listé2.jpg", "liste\u03012.jpg"), 0);
});

test("scanner accepts supported extensions case-insensitively and only top-level regular files", (t) => {
  const { assetsDirectory } = createFixture(t);
  const accepted = [
    "List1.JPG",
    "list2.jpeg",
    "LIST3.PNG",
    "list4.WeBp",
    "list5.AVIF",
    "list6.gif",
    "list7.SvG",
    "list8.BMP",
  ];

  accepted.forEach((filename) => addFile(assetsDirectory, filename));
  addFile(assetsDirectory, "list9.txt");
  addFile(assetsDirectory, "photo10.jpg");
  fs.mkdirSync(path.join(assetsDirectory, "list0.jpg"));
  fs.mkdirSync(path.join(assetsDirectory, "nested"));
  addFile(path.join(assetsDirectory, "nested"), "list00.jpg");

  assert.deepEqual(scanAlbumFiles(assetsDirectory), accepted);
});

test("manifest preserves filenames through safe path-segment encoding", (t) => {
  const { assetsDirectory } = createFixture(t);
  const filename = "list 9 #Hạnh's(1).jpg";
  addFile(assetsDirectory, filename);

  const filenames = scanAlbumFiles(assetsDirectory);
  const manifest = createAlbumManifest(filenames);

  assert.deepEqual(filenames, [filename]);
  assert.equal(fs.existsSync(path.join(assetsDirectory, filename)), true);
  assert.equal(
    manifest[0].src,
    "/assets/list%209%20%23H%E1%BA%A1nh%27s%281%29.jpg",
  );
  assert.deepEqual(manifest[0], {
    src: "/assets/list%209%20%23H%E1%BA%A1nh%27s%281%29.jpg",
    alt: "Ảnh cưới Hữu Thắng và Thu Trang 1",
    position: "50% 50%",
  });
  assert.equal(encodePathSegment("a&b<c>.jpg"), "a%26b%3Cc%3E.jpg");
});

test("optimized image metadata merges by exact original filename while legacy entries stay exact", () => {
  const filenames = ["list1.jpg", "list2.jpeg"];
  const imageAssets = {
    "list1.jpg": {
      src: " /assets/optimized/list1-main.hash.webp ",
      srcset: " /assets/optimized/list1-small.hash.webp 480w, /assets/optimized/list1-main.hash.webp 960w ",
      sizes: " (max-width: 640px) 92vw, 720px ",
      thumbSrc: " /assets/optimized/list1-thumb.hash.webp ",
      fullSrc: " /assets/optimized/list1-full.hash.webp ",
      width: 4609,
      height: 6913,
      alt: "Mapping must not replace canonical alt text",
      position: "10% 20%",
      unknown: "ignored",
    },
  };

  const manifest = createAlbumManifest(filenames, imageAssets);
  assert.deepEqual(manifest[0], {
    src: "/assets/optimized/list1-main.hash.webp",
    alt: "Ảnh cưới Hữu Thắng và Thu Trang 1",
    position: "50% 50%",
    srcset: "/assets/optimized/list1-small.hash.webp 480w, /assets/optimized/list1-main.hash.webp 960w",
    sizes: "(max-width: 640px) 92vw, 720px",
    thumbSrc: "/assets/optimized/list1-thumb.hash.webp",
    fullSrc: "/assets/optimized/list1-full.hash.webp",
    width: 4609,
    height: 6913,
  });
  assert.deepEqual(manifest[1], {
    src: "/assets/list2.jpeg",
    alt: "Ảnh cưới Hữu Thắng và Thu Trang 2",
    position: "50% 50%",
  });
  assert.deepEqual(Object.keys(manifest[1]), ["src", "alt", "position"]);
});

test("invalid optimized fields are omitted without changing the legacy fallback", () => {
  const manifest = createAlbumManifest(["list1.jpg"], {
    "list1.jpg": {
      src: " ",
      srcset: null,
      sizes: 42,
      thumbSrc: [],
      fullSrc: {},
      width: 0,
      height: 12.5,
    },
  });

  assert.deepEqual(manifest, [{
    src: "/assets/list1.jpg",
    alt: "Ảnh cưới Hữu Thắng và Thu Trang 1",
    position: "50% 50%",
  }]);
});

test("empty asset sets generate an executable empty global manifest", (t) => {
  const { assetsDirectory, outputFile } = createFixture(t);
  const result = generateAlbumData({ assetsDirectory, outputFile });

  assert.deepEqual(result.filenames, []);
  assert.deepEqual(result.manifest, []);
  assert.deepEqual(evaluateGeneratedData(result.content), []);
  assert.match(result.content, /globalThis\.INVITATION_ALBUM_PHOTOS = \[\];/u);
});

test("generator reruns deterministically and tracks additions and removals", (t) => {
  const { assetsDirectory, outputFile } = createFixture(t);
  addFile(assetsDirectory, "list10.jpg");
  addFile(assetsDirectory, "list1.jpg");

  const first = generateAlbumData({ assetsDirectory, outputFile });
  const firstBytes = fs.readFileSync(outputFile, "utf8");
  const second = generateAlbumData({ assetsDirectory, outputFile });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.content, firstBytes);
  assert.deepEqual(second.filenames, ["list1.jpg", "list10.jpg"]);

  addFile(assetsDirectory, "list2.jpeg");
  const afterAddition = generateAlbumData({ assetsDirectory, outputFile });
  assert.equal(afterAddition.changed, true);
  assert.deepEqual(afterAddition.filenames, ["list1.jpg", "list2.jpeg", "list10.jpg"]);
  assert.deepEqual(
    evaluateGeneratedData(afterAddition.content).map((photo) => photo.src),
    ["/assets/list1.jpg", "/assets/list2.jpeg", "/assets/list10.jpg"],
  );

  fs.unlinkSync(path.join(assetsDirectory, "list1.jpg"));
  const afterRemoval = generateAlbumData({ assetsDirectory, outputFile });
  assert.equal(afterRemoval.changed, true);
  assert.deepEqual(afterRemoval.filenames, ["list2.jpeg", "list10.jpg"]);
});

test("generator forwards optimized image mappings into serialized album data", (t) => {
  const { assetsDirectory, outputFile } = createFixture(t);
  addFile(assetsDirectory, "list1.jpg");
  addFile(assetsDirectory, "list2.jpeg");
  const imageAssets = {
    "list1.jpg": {
      src: "/assets/optimized/list1-main.hash.webp",
      srcset: "/assets/optimized/list1-small.hash.webp 480w, /assets/optimized/list1-main.hash.webp 960w",
      sizes: "(max-width: 640px) 92vw, 720px",
      thumbSrc: "/assets/optimized/list1-thumb.hash.webp",
      fullSrc: "/assets/optimized/list1-full.hash.webp",
      width: 4609,
      height: 6913,
    },
  };

  const result = generateAlbumData({ assetsDirectory, outputFile, imageAssets });
  const generated = evaluateGeneratedData(result.content);
  assert.deepEqual(generated, result.manifest);
  assert.equal(generated[0].fullSrc, "/assets/optimized/list1-full.hash.webp");
  assert.equal(generated[0].thumbSrc, "/assets/optimized/list1-thumb.hash.webp");
  assert.equal(generated[0].width, 4609);
  assert.deepEqual(generated[1], {
    src: "/assets/list2.jpeg",
    alt: "Ảnh cưới Hữu Thắng và Thu Trang 2",
    position: "50% 50%",
  });
});

test("JavaScript serialization escapes HTML-sensitive and line-separator characters", () => {
  const serialized = escapeJsonForJavaScript(["<&>", "line\u2028separator", "paragraph\u2029separator"]);

  assert.equal(serialized.includes("<"), false);
  assert.equal(serialized.includes(">"), false);
  assert.equal(serialized.includes("&"), false);
  assert.equal(serialized.includes("\u2028"), false);
  assert.equal(serialized.includes("\u2029"), false);
  assert.match(serialized, /\\u003C\\u0026\\u003E/u);
  assert.match(serialized, /\\u2028/u);
  assert.match(serialized, /\\u2029/u);
});
