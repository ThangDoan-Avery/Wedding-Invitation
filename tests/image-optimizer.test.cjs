"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");

// Avoid Windows file-handle retention from libvips' input cache during temporary-fixture cleanup.
sharp.cache(false);

const {
  INLINE_SIZES,
  URL_PREFIX,
  optimizeImages,
} = require("../scripts/optimize-images.cjs");

function createWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-image-optimizer-"));
  const assetsDirectory = path.join(root, "assets");
  const outputDirectory = path.join(root, "optimized");
  fs.mkdirSync(assetsDirectory, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return { assetsDirectory, outputDirectory };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function outputPathFromUrl(outputDirectory, url) {
  assert.ok(url.startsWith(URL_PREFIX), `Unexpected optimized URL: ${url}`);
  return path.join(outputDirectory, decodeURIComponent(url.slice(URL_PREFIX.length)));
}

async function createImage(filename, width, height, format = "png") {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 165, b: 205 },
    },
  });
  await pipeline[format]().toFile(filename);
}

test("creates responsive WebP variants without cropping, enlargement, or source mutation", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const largeFilename = "large-photo.png";
  const smallFilename = "small-photo.png";
  await createImage(path.join(assetsDirectory, largeFilename), 1300, 650);
  await createImage(path.join(assetsDirectory, smallFilename), 320, 180);

  const largeBefore = fs.readFileSync(path.join(assetsDirectory, largeFilename));
  const smallBefore = fs.readFileSync(path.join(assetsDirectory, smallFilename));
  const { images, report } = await optimizeImages({
    assetsDirectory,
    outputDirectory,
    filenames: [largeFilename, smallFilename],
  });

  assert.equal(Object.getPrototypeOf(images), Object.prototype);
  assert.deepEqual(Object.keys(images), [largeFilename, smallFilename]);
  assert.deepEqual(fs.readFileSync(path.join(assetsDirectory, largeFilename)), largeBefore);
  assert.deepEqual(fs.readFileSync(path.join(assetsDirectory, smallFilename)), smallBefore);

  const large = images[largeFilename];
  assert.equal(large.width, 1300);
  assert.equal(large.height, 650);
  assert.equal(large.sourceBytes, largeBefore.length);
  assert.equal(large.sourceHash, sha256(largeBefore));
  assert.equal(large.sizes, INLINE_SIZES);
  assert.deepEqual(
    large.variants.map(({ role, width, height }) => ({ role, width, height })),
    [
      { role: "thumb", width: 160, height: 80 },
      { role: "inline", width: 640, height: 320 },
      { role: "inline", width: 960, height: 480 },
      { role: "inline", width: 1280, height: 640 },
      { role: "full", width: 1300, height: 650 },
    ],
  );
  assert.equal(large.src, large.variants[3].src);
  assert.equal(large.thumbSrc, large.variants[0].src);
  assert.equal(large.fullSrc, large.variants[4].src);
  assert.equal(
    large.srcset,
    large.variants
      .filter((variant) => variant.role === "inline")
      .map((variant) => `${variant.src} ${variant.width}w`)
      .join(", "),
  );

  const small = images[smallFilename];
  assert.deepEqual(
    small.variants.map(({ role, width, height }) => ({ role, width, height })),
    [
      { role: "thumb", width: 160, height: 90 },
      { role: "inline", width: 320, height: 180 },
      { role: "full", width: 320, height: 180 },
    ],
  );
  assert.equal(small.srcset, `${small.src} 320w`);

  for (const entry of Object.values(images)) {
    for (const variant of entry.variants) {
      assert.deepEqual(Object.keys(variant), ["src", "width", "height", "bytes", "role"]);
      assert.ok(variant.bytes > 0);
      const outputPath = outputPathFromUrl(outputDirectory, variant.src);
      assert.equal(fs.statSync(outputPath).size, variant.bytes);
      const metadata = await sharp(outputPath).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, variant.width);
      assert.equal(metadata.height, variant.height);
      assert.equal(metadata.hasProfile, true);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.orientation, undefined);
    }
  }

  assert.equal(report.sharpVersion, "0.35.5");
  assert.equal(report.requested, 2);
  assert.equal(report.optimized.length, 2);
  assert.deepEqual(report.skipped, []);
  assert.equal(report.sourceBytes, largeBefore.length + smallBefore.length);
  assert.equal(
    report.outputBytes,
    [...large.variants, ...small.variants].reduce((total, variant) => total + variant.bytes, 0),
  );
});

test("auto-orients EXIF images and strips EXIF while keeping an sRGB ICC profile", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const filename = "oriented.jpg";
  const sourcePath = path.join(assetsDirectory, filename);
  await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 3,
      background: { r: 210, g: 90, b: 45 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 100 })
    .toFile(sourcePath);

  const sourceMetadata = await sharp(sourcePath).metadata();
  assert.equal(sourceMetadata.width, 4);
  assert.equal(sourceMetadata.height, 2);
  assert.equal(sourceMetadata.orientation, 6);
  assert.deepEqual(sourceMetadata.autoOrient, { width: 2, height: 4 });

  const sourceBefore = fs.readFileSync(sourcePath);
  const { images } = await optimizeImages({
    assetsDirectory,
    outputDirectory,
    filenames: [filename],
  });
  const entry = images[filename];
  assert.equal(entry.width, 2);
  assert.equal(entry.height, 4);
  assert.deepEqual(
    entry.variants.map(({ role, width, height }) => ({ role, width, height })),
    [
      { role: "thumb", width: 2, height: 4 },
      { role: "inline", width: 2, height: 4 },
      { role: "full", width: 2, height: 4 },
    ],
  );

  for (const variant of entry.variants) {
    const metadata = await sharp(outputPathFromUrl(outputDirectory, variant.src)).metadata();
    assert.equal(metadata.width, 2);
    assert.equal(metadata.height, 4);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.hasProfile, true);
  }
  assert.deepEqual(fs.readFileSync(sourcePath), sourceBefore);
});

test("special filenames produce safe, collision-resistant URLs keyed by the original filename", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const jpegName = "Cô dâu #1.JPG";
  const pngName = "Cô dâu #1.png";
  const sharedImage = await sharp({
    create: {
      width: 48,
      height: 32,
      channels: 3,
      background: "#ead8ca",
    },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(assetsDirectory, jpegName), sharedImage);
  fs.writeFileSync(path.join(assetsDirectory, pngName), sharedImage);

  const { images } = await optimizeImages({
    assetsDirectory,
    outputDirectory,
    filenames: [jpegName, pngName],
  });
  assert.deepEqual(Object.keys(images), [jpegName, pngName]);
  assert.equal(images[jpegName].sourceHash, images[pngName].sourceHash);
  assert.notEqual(images[jpegName].src, images[pngName].src);

  for (const entry of Object.values(images)) {
    for (const variant of entry.variants) {
      assert.match(variant.src, /^\/assets\/optimized\/co-dau-1\.[a-f0-9]{20}\.[a-z]+-\d+w-q\d+\.webp$/u);
      assert.doesNotMatch(variant.src, /[ #()]/u);
      assert.doesNotThrow(() => new URL(variant.src, "https://example.test"));
    }
  }
});

test("defensively skips QR, favicon, and unsupported formats without decoding them", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const filenames = [
    "qr-bride.png",
    "favicon.jpg",
    "chu-hy-vector-18.jpg",
    "animation.gif",
    "photo.avif",
    "art.svg",
    "scan.bmp",
  ];
  for (const filename of filenames) {
    fs.writeFileSync(path.join(assetsDirectory, filename), "not decoded");
  }

  const { images, report } = await optimizeImages({
    assetsDirectory,
    outputDirectory,
    filenames,
  });
  assert.deepEqual(images, {});
  assert.deepEqual(report.skipped, [
    { filename: "qr-bride.png", reason: "excluded-name" },
    { filename: "favicon.jpg", reason: "excluded-name" },
    { filename: "chu-hy-vector-18.jpg", reason: "excluded-name" },
    { filename: "animation.gif", reason: "unsupported-extension" },
    { filename: "photo.avif", reason: "unsupported-extension" },
    { filename: "art.svg", reason: "unsupported-extension" },
    { filename: "scan.bmp", reason: "unsupported-extension" },
  ]);
  assert.deepEqual(fs.readdirSync(outputDirectory), []);
});

test("skips a multi-frame WebP instead of flattening its animation", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const frameSource = path.join(assetsDirectory, "frames.tiff");
  const filename = "motion.webp";
  const pixels = Buffer.alloc(4 * 8 * 3);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const offset = (y * 4 + x) * 3;
      pixels[offset] = y < 4 ? 255 : 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = y < 4 ? 0 : 255;
    }
  }
  await sharp(pixels, { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } })
    .tiff()
    .toFile(frameSource);
  await sharp(frameSource, { pages: -1 })
    .webp({ loop: 0, delay: [100, 100] })
    .toFile(path.join(assetsDirectory, filename));
  assert.equal((await sharp(path.join(assetsDirectory, filename)).metadata()).pages, 2);

  const { images, report } = await optimizeImages({
    assetsDirectory,
    outputDirectory,
    filenames: [filename],
  });
  assert.deepEqual(images, {});
  assert.deepEqual(report.skipped, [{ filename, reason: "animated-image" }]);
  assert.deepEqual(fs.readdirSync(outputDirectory), []);
});

test("a corrupt eligible image fails instead of disappearing from the map", async (t) => {
  const { assetsDirectory, outputDirectory } = createWorkspace(t);
  const filename = "broken.jpg";
  const sourcePath = path.join(assetsDirectory, filename);
  const sourceBefore = Buffer.from("definitely not an image");
  fs.writeFileSync(sourcePath, sourceBefore);

  await assert.rejects(
    optimizeImages({ assetsDirectory, outputDirectory, filenames: [filename] }),
    /Unable to read image "broken\.jpg"/u,
  );
  assert.deepEqual(fs.readFileSync(sourcePath), sourceBefore);
  assert.deepEqual(fs.readdirSync(outputDirectory), []);
});
