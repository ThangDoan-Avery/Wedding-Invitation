"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { optimizeImages } = require("./optimize-images.cjs");
const { scanAlbumFiles, generateAlbumData, encodePathSegment } = require("./generate-album.cjs");
const { generateDinnerFile } = require("./generate-dinner.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_MARKER = ".invitation-build-output.json";
const GENERATOR_ID = "tnt-invitation-optimized-build-v1";
const PHOTO_FILE = /^(?:anh\d+|list.*)\.(?:jpe?g|png|webp|avif|gif|svg|bmp)$/iu;
const RASTER_FILE = /\.(?:jpe?g|png|webp|avif|gif|bmp)$/iu;

function hashFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function activeHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/gu, "");
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "isu"));
  return match?.[2] ?? null;
}

function escapeAttribute(value) {
  return String(value).replace(/&/gu, "&amp;").replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function setAttribute(tag, name, value) {
  const attribute = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "isu");
  if (value === null) return tag.replace(attribute, "");
  const replacement = ` ${name}="${escapeAttribute(value)}"`;
  if (attribute.test(tag)) return tag.replace(attribute, () => replacement);
  return tag.replace(/\s*\/?>$/u, (end) => `${replacement}${end}`);
}

function assetFilename(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/^\/?assets\/([^/?#]+)(?:[?#].*)?$/u);
  if (!match) return null;
  const filename = decodeURIComponent(match[1]);
  if (filename.includes("/") || filename.includes("\\") || filename === "..") {
    throw new Error("Asset paths must name a top-level source file");
  }
  return filename;
}

function replaceAlbumPlaceholders(html, firstAlbumFilename) {
  return html.replace(/<!--[\s\S]*?-->|<img\b[^>]*>/giu, (tag) => {
    if (tag.startsWith("<!--")) return tag;
    if (!["albumImage", "dialogPhoto"].includes(readAttribute(tag, "id"))) return tag;
    return setAttribute(tag, "src", firstAlbumFilename
      ? `/assets/${encodePathSegment(firstAlbumFilename)}` : null);
  });
}

function rewriteHtmlImages(html, imageAssets) {
  return html.replace(/<!--[\s\S]*?-->|<(?:img|link|a)\b[^>]*>/giu, (tag) => {
    if (tag.startsWith("<!--")) return tag;
    if (!/^<img\b/iu.test(tag)) {
      const filename = assetFilename(readAttribute(tag, "href"));
      const image = filename && imageAssets[filename];
      if (!image) return tag;
      let result = setAttribute(tag, "href", /^<a\b/iu.test(tag) ? image.fullSrc : image.src);
      if (readAttribute(tag, "as") === "image") {
        if (image.srcset) result = setAttribute(result, "imagesrcset", image.srcset);
        if (image.sizes) result = setAttribute(result, "imagesizes", image.sizes);
      }
      return result;
    }
    const filename = assetFilename(readAttribute(tag, "src"));
    const image = filename && imageAssets[filename];
    if (!image) return tag;
    let result = setAttribute(tag, "src", image.src);
    for (const name of ["srcset", "sizes", "width", "height"]) {
      if (image[name]) result = setAttribute(result, name, image[name]);
    }
    result = setAttribute(result, "data-full-src", image.fullSrc);
    result = setAttribute(result, "decoding", "async");
    // The dialog starts with a lazy preview. Runtime switches to fullSrc on open.
    return result;
  });
}

function rewriteCssImages(css, imageAssets) {
  return css.replace(/\/\*[\s\S]*?\*\/|url\(\s*(["']?)([^)"']+)\1\s*\)/giu, (original, quote, url) => {
    if (original.startsWith("/*")) return original;
    const filename = assetFilename(url.trim());
    const image = filename && imageAssets[filename];
    return image ? `url("${image.src}")` : original;
  });
}

function collectAssetReferences(html, css) {
  const result = new Set();
  for (const match of activeHtml(html).matchAll(/\s(?:src|href)\s*=\s*(["'])([^"']+)\1/giu)) {
    const name = assetFilename(match[2]);
    if (name) result.add(name);
  }
  for (const match of css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/giu)) {
    const name = assetFilename(match[1]);
    if (name) result.add(name);
  }
  return result;
}

function prepareOutput(projectRoot) {
  const root = fs.realpathSync(projectRoot);
  const output = path.resolve(root, "dist");
  if (path.dirname(output) !== root || path.basename(output) !== "dist") {
    throw new Error("Unsafe build output path");
  }
  if (fs.existsSync(output)) {
    if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output) {
      throw new Error("Refusing to clean a linked build output directory");
    }
    const marker = path.join(output, OUTPUT_MARKER);
    if (fs.readdirSync(output).length) {
      if (!fs.existsSync(marker)
        || JSON.parse(fs.readFileSync(marker, "utf8")).generator !== GENERATOR_ID) {
        throw new Error("dist contains non-generated files; move them before building");
      }
    }
    // Only this validated, explicitly managed project-root/dist may be removed.
    fs.rmSync(output, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(output, "assets", "optimized"), { recursive: true });
  fs.writeFileSync(path.join(output, OUTPUT_MARKER), JSON.stringify({ generator: GENERATOR_ID }));
  return output;
}

function directoryBytes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const filename = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directoryBytes(filename) : fs.statSync(filename).size);
  }, 0);
}

async function buildSite({ projectRoot = PROJECT_ROOT } = {}) {
  const source = path.join(projectRoot, "deploy");
  const assets = path.join(source, "assets");
  const sourceFiles = fs.readdirSync(assets, { withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => entry.name);
  const originals = sourceFiles.map((filename) => ({
    filename, bytes: fs.statSync(path.join(assets, filename)).size,
    sha256: hashFile(path.join(assets, filename)),
  }));
  const albumFiles = scanAlbumFiles(assets);
  const html = replaceAlbumPlaceholders(fs.readFileSync(path.join(source, "index.html"), "utf8"), albumFiles[0]);
  const css = fs.readFileSync(path.join(source, "styles.css"), "utf8");
  const references = collectAssetReferences(html, css);
  albumFiles.forEach((filename) => references.add(filename));
  sourceFiles.filter((filename) => /^qr-/iu.test(filename)).forEach((filename) => references.add(filename));
  for (const filename of references) {
    if (!sourceFiles.includes(filename)) throw new Error(`Referenced asset is missing: ${filename}`);
  }
  const targets = [...references].filter((filename) =>
    !/^qr-/iu.test(filename) && filename !== "chu-hy-vector-18.jpg"
    && (PHOTO_FILE.test(filename) || RASTER_FILE.test(filename)));
  const output = prepareOutput(projectRoot);
  const { images, report: optimizerReport } = await optimizeImages({
    assetsDirectory: assets, outputDirectory: path.join(output, "assets", "optimized"), filenames: targets,
  });
  for (const filename of references) {
    if (!images[filename]) fs.copyFileSync(path.join(assets, filename), path.join(output, "assets", filename));
  }
  // Copy source runtime files only, never source assets/temp folders or original photos.
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || ["index.html", "dinner.html", "album-data.js", "styles.css"].includes(entry.name)) continue;
    fs.copyFileSync(path.join(source, entry.name), path.join(output, entry.name));
  }
  fs.writeFileSync(path.join(output, "index.html"), rewriteHtmlImages(html, images), "utf8");
  fs.writeFileSync(path.join(output, "styles.css"), rewriteCssImages(css, images), "utf8");
  const album = generateAlbumData({ assetsDirectory: assets, outputFile: path.join(output, "album-data.js"), imageAssets: images });
  generateDinnerFile({ sourceFile: path.join(output, "index.html"), outputFile: path.join(output, "dinner.html") });
  for (const original of originals) {
    if (hashFile(path.join(assets, original.filename)) !== original.sha256) throw new Error(`Original was changed: ${original.filename}`);
  }
  const sourceBytes = originals.reduce((sum, file) => sum + file.bytes, 0);
  const publishedBytes = directoryBytes(path.join(output, "assets"));
  const report = {
    sourceBytes, publishedBytes, bytesSaved: sourceBytes - publishedBytes,
    reductionPercent: Number(((1 - publishedBytes / sourceBytes) * 100).toFixed(2)),
    originalFilesPreserved: originals.length,
    optimizedImages: Object.keys(images).length,
    albumPhotos: album.manifest.length,
    settings: { inlineWidths: [640, 960, 1280], inlineQuality: 84, fullWidth: 1920, fullQuality: 88, thumbnailWidth: 160, thumbnailQuality: 76 },
    images, originals,
    skipped: optimizerReport.skipped,
  };
  fs.writeFileSync(path.join(output, "image-optimization-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Built dist: ${(sourceBytes / 1048576).toFixed(2)} MiB source assets -> ${(publishedBytes / 1048576).toFixed(2)} MiB published assets (${report.reductionPercent}% smaller).`);
  console.log(`Preserved ${originals.length} originals; ${report.optimizedImages} optimized images; ${report.albumPhotos} album photos.`);
  return { outputDirectory: output, imageAssets: images, report };
}

if (require.main === module) buildSite().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { activeHtml, assetFilename, buildSite, collectAssetReferences, prepareOutput, replaceAlbumPlaceholders, rewriteCssImages, rewriteHtmlImages };
