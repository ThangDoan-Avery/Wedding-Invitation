"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const URL_PREFIX = "/assets/optimized/";
const INLINE_WIDTHS = Object.freeze([640, 960, 1280]);
const INLINE_SIZES = "(max-width: 500px) 100vw, 500px";
const SHARP_VERSION = sharp.versions.sharp;
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

const SETTINGS = Object.freeze({
  format: "webp",
  colourspace: "srgb",
  icc: "srgb",
  thumb: Object.freeze({ width: 160, quality: 76, effort: 5 }),
  inline: Object.freeze({ widths: INLINE_WIDTHS, quality: 84, effort: 5 }),
  full: Object.freeze({ width: 1920, quality: 88, effort: 5 }),
});

function isExcludedFilename(filename) {
  const basename = path.basename(filename);
  return /^(?:qr-|favicon(?:[.-]|$)|fav(?:[.-]|$)|apple-touch-icon(?:[.-]|$)|chu-hy-vector-18(?:[.-]|$))/iu.test(basename);
}

function isPathInside(parentDirectory, candidatePath) {
  const relative = path.relative(parentDirectory, candidatePath);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveSourcePath(assetsDirectory, filename) {
  const sourcePath = path.resolve(assetsDirectory, filename);
  if (!isPathInside(assetsDirectory, sourcePath)) {
    throw new Error(`Image filename must stay inside assetsDirectory: ${JSON.stringify(filename)}`);
  }
  return sourcePath;
}

function slugifyFilename(filename) {
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  const slug = basename
    .replace(/[đĐ]/gu, (character) => (character === "Đ" ? "D" : "d"))
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "image";
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function createContentHash(filename, sourceHash) {
  return crypto
    .createHash("sha256")
    .update(filename)
    .update("\0")
    .update(sourceHash)
    .update("\0")
    .update(JSON.stringify(SETTINGS))
    .update("\0")
    .update(SHARP_VERSION)
    .digest("hex")
    .slice(0, 20);
}

function getOrientedDimensions(metadata) {
  const orientedWidth = metadata.autoOrient?.width;
  const orientedHeight = metadata.autoOrient?.height;
  if (Number.isInteger(orientedWidth) && Number.isInteger(orientedHeight)) {
    return { width: orientedWidth, height: orientedHeight };
  }

  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
    throw new Error("Image metadata does not contain valid dimensions");
  }

  const swapsAxes = new Set([5, 6, 7, 8]).has(metadata.orientation);
  return swapsAxes
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

function createVariantPlans(sourceWidth) {
  const requestedPlans = [
    {
      role: "thumb",
      requestedWidth: SETTINGS.thumb.width,
      quality: SETTINGS.thumb.quality,
      effort: SETTINGS.thumb.effort,
    },
    ...SETTINGS.inline.widths.map((requestedWidth) => ({
      role: "inline",
      requestedWidth,
      quality: SETTINGS.inline.quality,
      effort: SETTINGS.inline.effort,
    })),
    {
      role: "full",
      requestedWidth: SETTINGS.full.width,
      quality: SETTINGS.full.quality,
      effort: SETTINGS.full.effort,
    },
  ];

  const uniquePlans = new Map();
  for (const plan of requestedPlans) {
    const width = Math.min(sourceWidth, plan.requestedWidth);
    const key = `${width}:${plan.quality}:${plan.effort}`;
    if (!uniquePlans.has(key)) {
      uniquePlans.set(key, { ...plan, width });
    }
  }
  return [...uniquePlans.values()];
}

function createOutputFilename({ slug, contentHash, role, width, quality }) {
  return `${slug}.${contentHash}.${role}-${width}w-q${quality}.webp`;
}

async function readMetadata(sourcePath, filename) {
  try {
    return await sharp(sourcePath, { sequentialRead: true }).metadata();
  } catch (error) {
    throw new Error(`Unable to read image ${JSON.stringify(filename)}: ${error.message}`, {
      cause: error,
    });
  }
}

async function writeVariant({ sourcePath, outputPath, width, quality, effort, filename }) {
  try {
    return await sharp(sourcePath, { sequentialRead: true })
      .autoOrient()
      .resize({ width, withoutEnlargement: true })
      .toColourspace("srgb")
      .withIccProfile("srgb")
      .webp({ quality, effort })
      .toFile(outputPath);
  } catch (error) {
    throw new Error(`Unable to optimize image ${JSON.stringify(filename)}: ${error.message}`, {
      cause: error,
    });
  }
}

function addImageEntry(images, filename, entry) {
  Object.defineProperty(images, filename, {
    configurable: true,
    enumerable: true,
    value: entry,
    writable: true,
  });
}

async function optimizeImages({ assetsDirectory, outputDirectory, filenames } = {}) {
  if (typeof assetsDirectory !== "string" || assetsDirectory.length === 0) {
    throw new TypeError("assetsDirectory must be a non-empty string");
  }
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
    throw new TypeError("outputDirectory must be a non-empty string");
  }
  if (!Array.isArray(filenames)) {
    throw new TypeError("filenames must be an array");
  }

  const resolvedAssetsDirectory = path.resolve(assetsDirectory);
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  await fs.promises.mkdir(resolvedOutputDirectory, { recursive: true });

  const images = {};
  const report = {
    sharpVersion: SHARP_VERSION,
    requested: filenames.length,
    optimized: [],
    skipped: [],
    sourceBytes: 0,
    outputBytes: 0,
  };
  const seenFilenames = new Set();

  // Intentionally sequential: source photos can exceed 30 MP and each Sharp pipeline decodes independently.
  for (const filename of filenames) {
    if (typeof filename !== "string" || filename.length === 0) {
      throw new TypeError("Every image filename must be a non-empty string");
    }
    if (seenFilenames.has(filename)) continue;
    seenFilenames.add(filename);

    if (isExcludedFilename(filename)) {
      report.skipped.push({ filename, reason: "excluded-name" });
      continue;
    }

    const extension = path.extname(filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      report.skipped.push({ filename, reason: "unsupported-extension" });
      continue;
    }

    const sourcePath = resolveSourcePath(resolvedAssetsDirectory, filename);
    const sourceStat = await fs.promises.stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error(`Image source is not a regular file: ${JSON.stringify(filename)}`);
    }

    const sourceHash = await hashFile(sourcePath);
    const metadata = await readMetadata(sourcePath, filename);
    if (Number(metadata.pages || 1) > 1) {
      report.skipped.push({ filename, reason: "animated-image" });
      continue;
    }
    if (!SUPPORTED_FORMATS.has(metadata.format)) {
      report.skipped.push({ filename, reason: `unsupported-format:${metadata.format || "unknown"}` });
      continue;
    }

    const { width, height } = getOrientedDimensions(metadata);
    const contentHash = createContentHash(filename, sourceHash);
    const slug = slugifyFilename(filename);
    const variants = [];
    const variantsByRole = new Map();

    for (const plan of createVariantPlans(width)) {
      const outputFilename = createOutputFilename({
        slug,
        contentHash,
        role: plan.role,
        width: plan.width,
        quality: plan.quality,
      });
      const outputPath = path.join(resolvedOutputDirectory, outputFilename);
      const info = await writeVariant({
        sourcePath,
        outputPath,
        width: plan.width,
        quality: plan.quality,
        effort: plan.effort,
        filename,
      });
      const variant = {
        src: `${URL_PREFIX}${encodePathSegment(outputFilename)}`,
        width: info.width,
        height: info.height,
        bytes: info.size,
        role: plan.role,
      };
      variants.push(variant);
      if (!variantsByRole.has(plan.role)) variantsByRole.set(plan.role, []);
      variantsByRole.get(plan.role).push(variant);
    }

    const inlineVariants = variantsByRole.get("inline") || [];
    inlineVariants.sort((left, right) => left.width - right.width);
    const defaultVariant = inlineVariants.at(-1);
    const thumbVariant = variantsByRole.get("thumb")?.[0];
    const fullVariant = variantsByRole.get("full")?.[0];
    if (!defaultVariant || !thumbVariant || !fullVariant) {
      throw new Error(`Image variants are incomplete for ${JSON.stringify(filename)}`);
    }

    const outputBytes = variants.reduce((total, variant) => total + variant.bytes, 0);
    const entry = {
      src: defaultVariant.src,
      srcset: inlineVariants.map((variant) => `${variant.src} ${variant.width}w`).join(", "),
      sizes: INLINE_SIZES,
      thumbSrc: thumbVariant.src,
      fullSrc: fullVariant.src,
      width,
      height,
      variants,
      sourceBytes: sourceStat.size,
      sourceHash,
    };
    addImageEntry(images, filename, entry);

    report.optimized.push({
      filename,
      sourceBytes: sourceStat.size,
      outputBytes,
      variants: variants.length,
    });
    report.sourceBytes += sourceStat.size;
    report.outputBytes += outputBytes;
  }

  return { images, report };
}

module.exports = {
  INLINE_SIZES,
  INLINE_WIDTHS,
  SETTINGS,
  URL_PREFIX,
  optimizeImages,
};
