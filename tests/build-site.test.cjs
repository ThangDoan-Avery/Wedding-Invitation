"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const sharp = require("sharp");

const {
  activeHtml,
  buildSite,
  collectAssetReferences,
  prepareOutput,
  replaceAlbumPlaceholders,
  rewriteCssImages,
  rewriteHtmlImages,
} = require("../scripts/build-site.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_DEPLOY = path.join(PROJECT_ROOT, "deploy");
const SOURCE_ASSETS = path.join(SOURCE_DEPLOY, "assets");
const RASTER_EXTENSION = /\.(?:jpe?g|png|webp)$/iu;

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "isu"));
  return match?.[2] ?? null;
}

function imageTags(html) {
  return [...html.matchAll(/<img\b[^>]*>/giu)].map((match) => match[0]);
}

function imageTagById(html, id) {
  return imageTags(activeHtml(html)).find((tag) => readAttribute(tag, "id") === id) || null;
}

function evaluateAlbumData(filename) {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return JSON.parse(JSON.stringify(context.globalThis.INVITATION_ALBUM_PHOTOS));
}

function snapshotTree(directory) {
  const snapshot = {};

  const visit = (currentDirectory) => {
    fs.readdirSync(currentDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .forEach((entry) => {
        const filename = path.join(currentDirectory, entry.name);
        const relative = path.relative(directory, filename).split(path.sep).join("/");
        if (entry.isDirectory()) visit(filename);
        else if (entry.isFile()) snapshot[relative] = sha256(filename);
        else snapshot[relative] = `special:${entry.isSymbolicLink() ? "link" : "other"}`;
      });
  };

  visit(directory);
  return snapshot;
}

async function withTemporaryDirectory(prefix, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    assert.equal(fs.existsSync(directory), false, `Temporary directory was not removed: ${directory}`);
  }
}

async function writeTinyRaster(filename, seed = 1) {
  const extension = path.extname(filename).toLowerCase();
  let pipeline = sharp({
    create: {
      width: 24,
      height: 36,
      channels: 4,
      background: {
        r: (seed * 37) % 255,
        g: (seed * 73) % 255,
        b: (seed * 109) % 255,
        alpha: 1,
      },
    },
  });
  if ([".jpg", ".jpeg"].includes(extension)) pipeline = pipeline.jpeg({ quality: 80 });
  else if (extension === ".png") pipeline = pipeline.png();
  else if (extension === ".webp") pipeline = pipeline.webp({ quality: 80 });
  else throw new Error(`Unsupported fixture raster extension: ${extension}`);
  await pipeline.toFile(filename);
}

async function createFixtureProject(temporaryRoot) {
  const projectRoot = path.join(temporaryRoot, "project");
  const deploy = path.join(projectRoot, "deploy");
  const assets = path.join(deploy, "assets");
  fs.mkdirSync(assets, { recursive: true });

  for (const entry of fs.readdirSync(SOURCE_DEPLOY, { withFileTypes: true })) {
    if (!entry.isFile() || ["album-data.js", "dinner.html"].includes(entry.name)) continue;
    fs.copyFileSync(path.join(SOURCE_DEPLOY, entry.name), path.join(deploy, entry.name));
  }

  const html = fs.readFileSync(path.join(deploy, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(deploy, "styles.css"), "utf8");
  const requiredAssets = collectAssetReferences(html, css);
  requiredAssets.add("list2.jpg");
  fs.readdirSync(SOURCE_ASSETS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^qr-/iu.test(entry.name))
    .forEach((entry) => requiredAssets.add(entry.name));

  let seed = 1;
  for (const filename of [...requiredAssets].sort()) {
    const destination = path.join(assets, filename);
    if (/^qr-/iu.test(filename)) {
      fs.copyFileSync(path.join(SOURCE_ASSETS, filename), destination);
    } else if (RASTER_EXTENSION.test(filename)) {
      await writeTinyRaster(destination, seed);
      seed += 1;
    } else if (path.extname(filename).toLowerCase() === ".svg") {
      fs.copyFileSync(path.join(SOURCE_ASSETS, filename), destination);
    } else {
      fs.writeFileSync(destination, Buffer.from("ID3\u0004fixture", "utf8"));
    }
  }

  return { projectRoot, deploy, assets };
}

function outputFilename(outputDirectory, url) {
  assert.match(url, /^\/assets\//u);
  const segments = url.slice(1).split("/").map((segment) => decodeURIComponent(segment));
  return path.join(outputDirectory, ...segments);
}

function assertSourceUnchanged(deploy, before) {
  assert.deepEqual(snapshotTree(deploy), before, "Build must not mutate source deploy files");
}

test("HTML and CSS transforms ignore comments and produce responsive local references", () => {
  const imageAssets = {
    "photo.jpg": {
      src: "/assets/optimized/photo.main.webp",
      srcset: "/assets/optimized/photo.small.webp 480w, /assets/optimized/photo.main.webp 960w",
      sizes: "(max-width: 640px) 92vw, 720px",
      fullSrc: "/assets/optimized/photo.full.webp",
      width: 960,
      height: 1440,
    },
    "paper.png": {
      src: "/assets/optimized/paper.main.webp",
      fullSrc: "/assets/optimized/paper.full.webp",
      width: 800,
      height: 800,
    },
    "commented.jpg": {
      src: "/assets/optimized/commented.webp",
      fullSrc: "/assets/optimized/commented-full.webp",
      width: 10,
      height: 10,
    },
    "commented-paper.png": {
      src: "/assets/optimized/commented-paper.webp",
      fullSrc: "/assets/optimized/commented-paper-full.webp",
      width: 10,
      height: 10,
    },
  };
  const html = [
    '<!-- <img src="/assets/commented.jpg" alt="comment only"> -->',
    '<link id="preload" rel="preload" as="image" href="/assets/photo.jpg">',
    '<img id="hero" src="/assets/photo.jpg" srcset="/assets/stale.jpg 1x" sizes="1px" width="1" height="1">',
    '<img id="qr" src="/assets/qr-groom.svg" alt="QR">',
  ].join("\n");
  const css = [
    '/* .comment-only { background-image: url("/assets/commented-paper.png"); } */',
    '.paper { background-image: url("/assets/paper.png"); }',
    '.qr { background-image: url("/assets/qr-groom.svg"); }',
  ].join("\n");

  const rewrittenHtml = rewriteHtmlImages(html, imageAssets);
  const rewrittenCss = rewriteCssImages(css, imageAssets);
  const hero = imageTagById(rewrittenHtml, "hero");
  const qr = imageTagById(rewrittenHtml, "qr");
  const preload = activeHtml(rewrittenHtml).match(/<link\b[^>]*\bid="preload"[^>]*>/u)?.[0];

  assert.match(rewrittenHtml, /<!-- <img src="\/assets\/commented\.jpg"/u);
  assert.equal(readAttribute(hero, "src"), imageAssets["photo.jpg"].src);
  assert.equal(readAttribute(hero, "srcset"), imageAssets["photo.jpg"].srcset);
  assert.equal(readAttribute(hero, "sizes"), imageAssets["photo.jpg"].sizes);
  assert.equal(readAttribute(hero, "data-full-src"), imageAssets["photo.jpg"].fullSrc);
  assert.equal(readAttribute(hero, "width"), "960");
  assert.equal(readAttribute(hero, "height"), "1440");
  assert.equal(readAttribute(hero, "decoding"), "async");
  assert.ok(preload);
  assert.equal(readAttribute(preload, "href"), imageAssets["photo.jpg"].src);
  assert.doesNotMatch(activeHtml(rewrittenHtml), /\/assets\/(?:photo|stale)\.jpg/u);
  assert.equal(readAttribute(qr, "src"), "/assets/qr-groom.svg");
  assert.match(rewrittenCss, /\/\* \.comment-only \{ background-image: url\("\/assets\/commented-paper\.png"\); \} \*\//u);
  assert.match(rewrittenCss, /\.paper \{ background-image: url\("\/assets\/optimized\/paper\.main\.webp"\); \}/u);
  assert.match(rewrittenCss, /\.qr \{ background-image: url\("\/assets\/qr-groom\.svg"\); \}/u);

  assert.deepEqual(
    [...collectAssetReferences(html, css)].sort(),
    ["paper.png", "photo.jpg", "qr-groom.svg"],
  );
});

test("album placeholders use the first filename and remove src when the album is empty", () => {
  const html = [
    '<!-- <img id="albumImage" src="/assets/commented.jpg"> -->',
    '<img id="albumImage" src="/assets/old.jpg" alt="Album">',
    '<img id="dialogPhoto" src="/assets/old.jpg" alt="Dialog">',
    '<img id="other" src="/assets/keep.jpg" alt="Other">',
  ].join("\n");
  const populated = replaceAlbumPlaceholders(html, "list 1 #Hạnh.jpg");
  assert.equal(readAttribute(imageTagById(populated, "albumImage"), "src"),
    "/assets/list%201%20%23H%E1%BA%A1nh.jpg");
  assert.equal(readAttribute(imageTagById(populated, "dialogPhoto"), "src"),
    "/assets/list%201%20%23H%E1%BA%A1nh.jpg");
  assert.equal(readAttribute(imageTagById(populated, "other"), "src"), "/assets/keep.jpg");
  assert.match(populated, /<!-- <img id="albumImage" src="\/assets\/commented\.jpg"> -->/u);

  const empty = replaceAlbumPlaceholders(html, null);
  assert.equal(readAttribute(imageTagById(empty, "albumImage"), "src"), null);
  assert.equal(readAttribute(imageTagById(empty, "dialogPhoto"), "src"), null);
  assert.equal(readAttribute(imageTagById(empty, "other"), "src"), "/assets/keep.jpg");
});

test("Netlify publishes only the managed dist build", () => {
  const netlify = fs.readFileSync(path.join(PROJECT_ROOT, "netlify.toml"), "utf8");
  assert.match(netlify, /\[build\][\s\S]*?command\s*=\s*"npm run build"/u);
  assert.match(netlify, /\[build\][\s\S]*?publish\s*=\s*"dist"/u);
  assert.doesNotMatch(netlify, /publish\s*=\s*"deploy"/u);
});

test("prepareOutput refuses unowned content without deleting it", async () => {
  await withTemporaryDirectory("invitation-build-safety-", async (temporaryRoot) => {
    const projectRoot = path.join(temporaryRoot, "project");
    const dist = path.join(projectRoot, "dist");
    fs.mkdirSync(dist, { recursive: true });
    const sentinel = path.join(dist, "keep.txt");
    fs.writeFileSync(sentinel, "user-owned", "utf8");

    assert.throws(() => prepareOutput(projectRoot), /dist contains non-generated files/u);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "user-owned");

    fs.rmSync(dist, { recursive: true, force: true });
    const managed = prepareOutput(projectRoot);
    fs.writeFileSync(path.join(managed, "stale.txt"), "stale", "utf8");
    prepareOutput(projectRoot);
    assert.equal(fs.existsSync(path.join(managed, "stale.txt")), false);
  });
});

test("prepareOutput refuses a linked dist without touching its target", async (t) => {
  await withTemporaryDirectory("invitation-build-link-", async (temporaryRoot) => {
    const projectRoot = path.join(temporaryRoot, "project");
    const external = path.join(temporaryRoot, "external");
    const dist = path.join(projectRoot, "dist");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(external);
    const sentinel = path.join(external, "keep.txt");
    fs.writeFileSync(sentinel, "external", "utf8");
    try {
      fs.symlinkSync(external, dist, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.skip(`Directory links are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    assert.throws(() => prepareOutput(projectRoot), /linked build output directory/u);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "external");
  });
});

test("source validation fails before an existing managed dist is cleaned", async () => {
  await withTemporaryDirectory("invitation-build-validation-", async (temporaryRoot) => {
    const projectRoot = path.join(temporaryRoot, "project");
    const deploy = path.join(projectRoot, "deploy");
    fs.mkdirSync(path.join(deploy, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(deploy, "index.html"),
      '<!doctype html><html><body><img src="/assets/missing.jpg" alt="Missing"></body></html>',
      "utf8",
    );
    fs.writeFileSync(path.join(deploy, "styles.css"), "", "utf8");
    const dist = prepareOutput(projectRoot);
    const sentinel = path.join(dist, "previous-good-build.txt");
    fs.writeFileSync(sentinel, "keep until validation succeeds", "utf8");

    await assert.rejects(buildSite({ projectRoot }), /Referenced asset is missing: missing\.jpg/u);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "keep until validation succeeds");
  });
});

test("buildSite optimizes a disposable project, preserves sources, and cleans album variants", {
  timeout: 60_000,
}, async () => {
  await withTemporaryDirectory("invitation-build-integration-", async (temporaryRoot) => {
    const { projectRoot, deploy, assets } = await createFixtureProject(temporaryRoot);
    const qrFilenames = fs.readdirSync(assets).filter((filename) => /^qr-/iu.test(filename));
    const firstSourceSnapshot = snapshotTree(deploy);

    const firstBuild = await buildSite({ projectRoot });
    const dist = firstBuild.outputDirectory;
    assertSourceUnchanged(deploy, firstSourceSnapshot);
    const rootHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    const dinnerHtml = fs.readFileSync(path.join(dist, "dinner.html"), "utf8");
    assert.match(rootHtml, /2026-11-15T09:00:00\+07:00/u);
    assert.doesNotMatch(rootHtml, /data-invitation-variant="dinner"/u);
    assert.match(dinnerHtml, /data-invitation-variant="dinner"/u);
    assert.match(dinnerHtml, /2026-11-14T17:00:00\+07:00/u);
    assert.deepEqual(imageTags(dinnerHtml), imageTags(rootHtml));

    const firstManifest = evaluateAlbumData(path.join(dist, "album-data.js"));
    assert.equal(firstManifest.length, 2);
    assert.equal(firstManifest[0].src, firstBuild.imageAssets["list1.png"].src);
    assert.equal(firstManifest[0].thumbSrc, firstBuild.imageAssets["list1.png"].thumbSrc);
    assert.equal(firstManifest[0].fullSrc, firstBuild.imageAssets["list1.png"].fullSrc);
    const albumImage = imageTagById(rootHtml, "albumImage");
    const dialogPhoto = imageTagById(rootHtml, "dialogPhoto");
    for (const tag of [albumImage, dialogPhoto]) {
      assert.equal(readAttribute(tag, "src"), firstBuild.imageAssets["list1.png"].src);
      assert.equal(readAttribute(tag, "srcset"), firstBuild.imageAssets["list1.png"].srcset);
      assert.equal(readAttribute(tag, "sizes"), firstBuild.imageAssets["list1.png"].sizes);
      assert.equal(readAttribute(tag, "data-full-src"), firstBuild.imageAssets["list1.png"].fullSrc);
    }

    for (const [filename, image] of Object.entries(firstBuild.imageAssets)) {
      assert.equal(fs.existsSync(path.join(dist, "assets", filename)), false,
        `Optimized original leaked into dist: ${filename}`);
      image.variants.forEach((variant) => {
        assert.equal(fs.existsSync(outputFilename(dist, variant.src)), true, variant.src);
      });
    }
    for (const filename of qrFilenames) {
      assert.equal(Object.hasOwn(firstBuild.imageAssets, filename), false);
      assert.equal(sha256(path.join(dist, "assets", filename)), sha256(path.join(assets, filename)));
    }
    imageTags(rootHtml)
      .filter((tag) => readAttribute(tag, "src")?.startsWith("/assets/optimized/"))
      .forEach((tag) => assert.match(tag, /\sdata-full-src="\/assets\/optimized\//u));

    const oldAlbumVariants = firstBuild.imageAssets["list1.png"].variants
      .map((variant) => path.basename(outputFilename(dist, variant.src)));
    fs.unlinkSync(path.join(assets, "list1.png"));
    await writeTinyRaster(path.join(assets, "list0.jpg"), 99);
    const secondSourceSnapshot = snapshotTree(deploy);
    const secondBuild = await buildSite({ projectRoot });
    assertSourceUnchanged(deploy, secondSourceSnapshot);
    const secondManifest = evaluateAlbumData(path.join(dist, "album-data.js"));
    assert.equal(secondManifest.length, 2);
    assert.equal(secondManifest[0].src, secondBuild.imageAssets["list0.jpg"].src);
    assert.equal(secondManifest.some((photo) => /list1/iu.test(photo.src)), false);
    const secondRootHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    assert.equal(readAttribute(imageTagById(secondRootHtml, "albumImage"), "src"),
      secondBuild.imageAssets["list0.jpg"].src);
    oldAlbumVariants.forEach((filename) => {
      assert.equal(fs.existsSync(path.join(dist, "assets", "optimized", filename)), false,
        `Stale optimized variant survived rebuild: ${filename}`);
    });

    for (const filename of fs.readdirSync(assets).filter((name) => /^list/iu.test(name))) {
      fs.unlinkSync(path.join(assets, filename));
    }
    const emptySourceSnapshot = snapshotTree(deploy);
    const emptyBuild = await buildSite({ projectRoot });
    assertSourceUnchanged(deploy, emptySourceSnapshot);
    assert.equal(emptyBuild.report.albumPhotos, 0);
    assert.deepEqual(evaluateAlbumData(path.join(dist, "album-data.js")), []);
    const emptyRootHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    const emptyDinnerHtml = fs.readFileSync(path.join(dist, "dinner.html"), "utf8");
    assert.equal(readAttribute(imageTagById(emptyRootHtml, "albumImage"), "src"), null);
    assert.equal(readAttribute(imageTagById(emptyRootHtml, "dialogPhoto"), "src"), null);
    assert.deepEqual(imageTags(emptyDinnerHtml), imageTags(emptyRootHtml));
    assert.equal(
      fs.readdirSync(path.join(dist, "assets", "optimized")).some((filename) => /^list/iu.test(filename)),
      false,
    );
  });
});
