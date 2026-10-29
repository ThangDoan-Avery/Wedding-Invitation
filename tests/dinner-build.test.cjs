"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  generateDinnerHtml,
  renderDinnerHtml,
} = require("../scripts/generate-dinner.cjs");

const ROOT_HTML_FILE = path.join(__dirname, "../deploy/index.html");
const DINNER_HTML_FILE = path.join(__dirname, "../deploy/dinner.html");
const NETLIFY_FILE = path.join(__dirname, "../netlify.toml");
const rootHtml = fs.readFileSync(ROOT_HTML_FILE, "utf8");
const dinnerHtml = fs.readFileSync(DINNER_HTML_FILE, "utf8");

function countLiteral(value, search) {
  return value.split(search).length - 1;
}

function getTimeline(html) {
  const article = html.match(
    /<article\b[^>]*class="[^"]*\bwedding-timeline\b[^"]*"[^>]*>[\s\S]*?<\/article>/u,
  )?.[0];
  assert.ok(article, "Wedding timeline article is missing");

  const date = article.match(
    /<p\b[^>]*class="[^"]*\bwedding-timeline__date\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/p>/u,
  )?.[1].trim();
  assert.ok(date, "Wedding timeline date is missing");

  const list = article.match(
    /<ol\b[^>]*class="[^"]*\bwedding-timeline__events\b[^"]*"[^>]*>([\s\S]*?)<\/ol>/u,
  )?.[1];
  assert.ok(list, "Wedding timeline event list is missing");

  const rows = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)].map((match) => {
    const time = match[1].match(
      /<time\b[^>]*datetime="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/time>/u,
    );
    const label = match[1].match(
      /<span\b[^>]*class="[^"]*\bwedding-timeline__label\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/u,
    );
    assert.ok(time, "Timeline row is missing its time element");
    assert.ok(label, "Timeline row is missing its label");
    return {
      datetime: time[1],
      displayTime: time[2].trim(),
      label: label[1].trim(),
    };
  });

  return { date, rows };
}

function replaceChecked(value, pattern, replacement, expectedCount, label) {
  const matches = [...value.matchAll(pattern)];
  assert.equal(matches.length, expectedCount, `Unexpected ${label} count while comparing variants`);
  return value.replace(pattern, replacement);
}

function maskVariantFields(html) {
  let masked = html.replace(
    ' data-invitation-variant="dinner" data-wedding-start="2026-11-14T17:00:00+07:00" data-wedding-end="2026-11-14T21:00:00+07:00"',
    "",
  );

  masked = replaceChecked(
    masked,
    /(<time\b[^>]*class="[^"]*\bopening-invitation__date\b[^"]*"[^>]*datetime=")[^"]+("[^>]*>)[\s\S]*?(<\/time>)/gu,
    "$1{{OPENING_DATETIME}}$2{{OPENING_TEXT}}$3",
    1,
    "opening date",
  );
  masked = replaceChecked(
    masked,
    /<strong>\d{2} · 11 · 2026<\/strong>/gu,
    "<strong>{{HERO_DATE}}</strong>",
    1,
    "hero date",
  );
  masked = replaceChecked(
    masked,
    /<span>(?:Chủ Nhật · 09:00|Thứ Bảy · 17:00)<\/span>/gu,
    "<span>{{HERO_WEEKDAY_TIME}}</span>",
    1,
    "hero weekday and time",
  );
  masked = replaceChecked(
    masked,
    /(<p\b[^>]*class="[^"]*\breception-card__weekday\b[^"]*"[^>]*>)[^<]+(<\/p>)/gu,
    "$1{{RECEPTION_WEEKDAY_TIME}}$2",
    2,
    "reception weekday and time",
  );
  masked = replaceChecked(
    masked,
    /(<time\b[^>]*class="[^"]*\breception-card__date\b[^"]*"[^>]*datetime=")[^"]+("[^>]*>)[^<]+(<\/time>)/gu,
    "$1{{RECEPTION_DATETIME}}$2{{RECEPTION_DATE}}$3",
    2,
    "reception date",
  );
  masked = replaceChecked(
    masked,
    /(<p\b[^>]*class="[^"]*\breception-card__lunar\b[^"]*"[^>]*>)[^<]+(<\/p>)/gu,
    "$1{{RECEPTION_LUNAR_DATE}}$2",
    2,
    "reception lunar date",
  );
  masked = replaceChecked(
    masked,
    /(<p\b[^>]*class="[^"]*\bwedding-timeline__date\b[^"]*"[^>]*>)[^<]+(<\/p>)/gu,
    "$1{{TIMELINE_DATE}}$2",
    1,
    "timeline date",
  );
  masked = replaceChecked(
    masked,
    /(<ol\b[^>]*class="[^"]*\bwedding-timeline__events\b[^"]*"[^>]*>)[\s\S]*?(<\/ol>)/gu,
    "$1{{TIMELINE_EVENTS}}$2",
    1,
    "timeline event list",
  );
  masked = replaceChecked(
    masked,
    /(<div\b[^>]*class="[^"]*\bcalendar-section__footer\b[^"]*"[^>]*>[\s\S]*?<strong>)[^<]+(<\/strong>)/gu,
    "$1{{CALENDAR_FOOTER_DATE}}$2",
    1,
    "calendar footer date",
  );
  masked = replaceChecked(
    masked,
    /(&amp;dates=)[^"&]+/gu,
    "$1{{GOOGLE_CALENDAR_DATES}}",
    2,
    "Google Calendar date range",
  );
  masked = replaceChecked(
    masked,
    /(<div\b[^>]*class="[^"]*\bwedding-countdown\b[^"]*"[^>]*\baria-label=")[^"]+("[^>]*>)/gu,
    "$1{{COUNTDOWN_LABEL}}$2",
    1,
    "countdown label",
  );
  masked = replaceChecked(
    masked,
    /(<p\b[^>]*id="countdownStatus"[^>]*>)[^<]+(<\/p>)/gu,
    "$1{{COUNTDOWN_STATUS}}$2",
    1,
    "countdown status",
  );
  masked = replaceChecked(
    masked,
    /Hẹn gặp bạn vào ngày \d{2} tháng 11 năm 2026\./gu,
    "{{CLOSING_DATE}}",
    1,
    "closing date",
  );

  return masked;
}

test("generated dinner artifact is deterministic and current", () => {
  const firstRender = renderDinnerHtml(rootHtml);
  const secondRender = renderDinnerHtml(rootHtml);
  assert.equal(firstRender, secondRender);
  assert.equal(generateDinnerHtml(rootHtml), firstRender);
  assert.equal(dinnerHtml, firstRender);
});

test("root invitation remains the four-event Sunday source", () => {
  assert.doesNotMatch(rootHtml, /\bdata-invitation-variant=/u);
  assert.deepEqual(getTimeline(rootHtml), {
    date: "Chủ Nhật · 15.11.2026",
    rows: [
      {
        datetime: "2026-11-15T09:00:00+07:00",
        displayTime: "09:00",
        label: "Đón khách",
      },
      {
        datetime: "2026-11-15T09:30:00+07:00",
        displayTime: "09:30",
        label: "Khai tiệc",
      },
      {
        datetime: "2026-11-15T11:30:00+07:00",
        displayTime: "11:30",
        label: "Đón dâu",
      },
      {
        datetime: "2026-11-15T12:00:00+07:00",
        displayTime: "12:00",
        label: "Lễ thành hôn",
      },
    ],
  });
});

test("dinner invitation uses Saturday evening body metadata and two events", () => {
  assert.match(
    dinnerHtml,
    /<body data-invitation-variant="dinner" data-wedding-start="2026-11-14T17:00:00\+07:00" data-wedding-end="2026-11-14T21:00:00\+07:00">/u,
  );
  assert.equal(countLiteral(dinnerHtml, 'data-invitation-variant="dinner"'), 1);
  assert.equal(countLiteral(dinnerHtml, 'data-wedding-start="2026-11-14T17:00:00+07:00"'), 1);
  assert.equal(countLiteral(dinnerHtml, 'data-wedding-end="2026-11-14T21:00:00+07:00"'), 1);
  assert.deepEqual(getTimeline(dinnerHtml), {
    date: "Thứ Bảy · 14.11.2026",
    rows: [
      {
        datetime: "2026-11-14T17:00:00+07:00",
        displayTime: "17:00",
        label: "Đón tiếp",
      },
      {
        datetime: "2026-11-14T17:30:00+07:00",
        displayTime: "17:30",
        label: "Khai tiệc",
      },
    ],
  });
});

test("all dinner date and time surfaces are updated", () => {
  assert.match(
    dinnerHtml,
    /<time class="opening-invitation__date" datetime="2026-11-14T17:00:00\+07:00">\s*17:00 · Thứ Bảy · 14\.11\.2026\s*<\/time>/u,
  );
  assert.match(
    dinnerHtml,
    /<div class="template-hero__schedule">[\s\S]*?<strong>14 · 11 · 2026<\/strong>\s*<span>Thứ Bảy · 17:00<\/span>/u,
  );
  assert.equal(
    countLiteral(dinnerHtml, '<p class="reception-card__weekday">Thứ Bảy - 17:00</p>'),
    2,
  );
  assert.equal(
    countLiteral(
      dinnerHtml,
      '<time class="reception-card__date" datetime="2026-11-14T17:00:00+07:00">14 . 11 . 2026</time>',
    ),
    2,
  );
  assert.equal(
    countLiteral(
      dinnerHtml,
      '<p class="reception-card__lunar">Tức ngày 06 tháng 10 năm Bính Ngọ</p>',
    ),
    2,
  );
  assert.equal(countLiteral(dinnerHtml, "<strong>Thứ Bảy · 14.11.2026</strong>"), 1);
  assert.equal(
    countLiteral(dinnerHtml, "20261114T100000Z%2F20261114T140000Z"),
    2,
  );
  assert.match(
    dinnerHtml,
    /aria-label="Đếm ngược đến 17:00 ngày 14 tháng 11 năm 2026"/u,
  );
  assert.match(
    dinnerHtml,
    />Ngày cưới: 17:00, Thứ Bảy, 14\/11\/2026\.<\/p>/u,
  );
  assert.match(dinnerHtml, /Hẹn gặp bạn vào ngày 14 tháng 11 năm 2026\./u);

  for (const staleValue of [
    "18:00",
    "20261114T110000Z",
    "2026-11-15T",
    "20261115T",
    "15.11.2026",
    "15 . 11 . 2026",
    "15/11/2026",
    "15 tháng 11 năm 2026",
    "Chủ Nhật",
    "09:00",
    "09:30",
    "11:30",
    "12:00",
    "ngày 07 tháng 10 năm Bính Ngọ",
  ]) {
    assert.equal(dinnerHtml.includes(staleValue), false, `Dinner contains stale value: ${staleValue}`);
  }
});

test("dinner keeps every non-variant byte from the root invitation", () => {
  assert.equal(maskVariantFields(dinnerHtml), maskVariantFields(rootHtml));
});

test("generator fails loudly when a required source anchor drifts", () => {
  const changedOpening = rootHtml.replace(
    "09:00 · Chủ Nhật · 15.11.2026",
    "09:01 · Chủ Nhật · 15.11.2026",
  );
  assert.throws(
    () => renderDinnerHtml(changedOpening),
    /expected 1 opening invitation date text anchor\(s\), found 0/u,
  );

  const changedTimeline = rootHtml.replace(
    '<span class="wedding-timeline__label">Đón dâu</span>',
    '<span class="wedding-timeline__label">Đón nhà gái</span>',
  );
  assert.throws(
    () => renderDinnerHtml(changedTimeline),
    /source timeline row 3 has unexpected label/u,
  );
});

test("all public dinner paths rewrite to dinner.html without consuming the guest query", () => {
  const netlify = fs.readFileSync(NETLIFY_FILE, "utf8");
  const redirects = [...netlify.matchAll(/\[\[redirects\]\]([\s\S]*?)(?=\r?\n\[\[|$)/gu)].map(
    (match) => {
      const block = match[1];
      return {
        from: block.match(/^\s*from\s*=\s*"([^"]+)"/mu)?.[1],
        to: block.match(/^\s*to\s*=\s*"([^"]+)"/mu)?.[1],
        status: Number(block.match(/^\s*status\s*=\s*(\d+)/mu)?.[1]),
        force: block.match(/^\s*force\s*=\s*(true|false)/mu)?.[1] === "true",
      };
    },
  );
  const dinnerRedirects = redirects.filter((redirect) => redirect.to === "/dinner.html");

  assert.deepEqual(
    dinnerRedirects.map((redirect) => redirect.from),
    ["/dinner.", "/dinner./", "/dinner.guest", "/dinner.guest/", "/dinner", "/dinner/"],
  );
  for (const redirect of dinnerRedirects) {
    assert.equal(redirect.status, 200);
    assert.equal(redirect.force, true);
    assert.equal(redirect.from.includes("?"), false);
    assert.equal(redirect.to.includes("?"), false);
  }
});
