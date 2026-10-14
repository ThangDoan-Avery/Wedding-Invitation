const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../deploy/styles.css"), "utf8");
const opening = html.match(
  /<section\b[^>]*class="[^"]*\bopening-invitation\b[^"]*"[^>]*>[\s\S]*?<\/section>/u,
)?.[0];

test("minimal opening preserves names, schedule, guest hook, and destination", () => {
  assert.ok(opening, "Opening invitation section is missing");
  assert.match(opening, /<section\b[^>]*\baria-labelledby="invitationTitle"/u);
  assert.match(opening, /<p\b[^>]*class="opening-invitation__eyebrow"[^>]*>\s*Lễ thành hôn\s*<\/p>/u);
  assert.match(opening, /<div\b[^>]*class="opening-invitation__names"[^>]*>/u);
  assert.match(
    opening,
    /<h1\b[^>]*id="invitationTitle"[^>]*>\s*<b>Hữu Thắng<\/b>\s*<i>&amp;<\/i>\s*<b>Thu Trang<\/b>\s*<\/h1>/u,
  );
  assert.match(
    opening,
    /<time\b[^>]*datetime="2026-11-15T09:00:00\+07:00"[^>]*>\s*09:00 · Chủ Nhật · 15\.11\.2026\s*<\/time>/u,
  );
  assert.match(opening, /<strong\b[^>]*\bdata-guest-name\b[^>]*>\s*Quý khách\s*<\/strong>/u);
  assert.match(opening, /<a\b[^>]*href="#weddingDetails"[^>]*>/u);
  assert.match(html, /\bid="weddingDetails"/u);
});

test("opening decoration is a hidden semantic heart without portrait media", () => {
  const heart = opening.match(
    /<svg\b[^>]*class="[^"]*\bopening-invitation__heart\b[^"]*"[^>]*>/u,
  )?.[0];

  assert.ok(heart, "Decorative opening heart is missing");
  assert.match(heart, /\baria-hidden="true"/u);
  assert.match(heart, /\bfocusable="false"/u);
  assert.doesNotMatch(opening, /<(?:img|picture|video)\b/u);
  assert.doesNotMatch(opening, /opening-invitation__(?:seal|ring)/u);
});

test("opening styling is minimal and no longer loads floral or circular seal assets", () => {
  const openingRule = css.match(/\.opening-invitation\s*\{([\s\S]*?)\}/u)?.[1];
  const borderRule = css.match(/\.opening-invitation::before\s*\{([\s\S]*?)\}/u)?.[1];

  assert.ok(openingRule, "Opening invitation CSS rule is missing");
  assert.match(openingRule, /\bbackground:\s*#f5f5f5\s*;/iu);
  assert.ok(borderRule, "Thin opening border rule is missing");
  assert.match(borderRule, /\bborder:\s*1px\s+solid\s+(?:var\(--wine\)|#611010|rgba\(97,\s*16,\s*16,\s*[\d.]+\))/iu);
  assert.doesNotMatch(css, /\.opening-invitation__seal\b|\.opening-invitation__ring\b/u);
  assert.doesNotMatch(css, /\.opening-invitation::after\b/u);
  assert.doesNotMatch(html, /<link\b[^>]*\brel="preload"[^>]*silk-floral-bg/u);
  assert.doesNotMatch(css, /silk-floral-bg/u);
});

test("opening redesign leaves music and falling-heart controls in the document", () => {
  for (const id of ["fallingHearts", "heartsToggle", "weddingAudio", "musicControls", "musicToggle"]) {
    assert.match(html, new RegExp(`\\bid="${id}"`, "u"));
  }
});
