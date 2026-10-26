"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_FILE = path.join(PROJECT_ROOT, "deploy", "index.html");
const DEFAULT_OUTPUT_FILE = path.join(PROJECT_ROOT, "deploy", "dinner.html");

const DINNER_BODY_ATTRIBUTES =
  'data-invitation-variant="dinner" data-wedding-start="2026-11-14T18:00:00+07:00" data-wedding-end="2026-11-14T21:00:00+07:00"';

const ROOT_TIMELINE_ROWS = [
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
];

const DINNER_TIMELINE_ROWS = [
  {
    datetime: "2026-11-14T17:30:00+07:00",
    displayTime: "17:30",
    label: "Đón khách",
  },
  {
    datetime: "2026-11-14T18:00:00+07:00",
    displayTime: "18:00",
    label: "Khai tiệc",
  },
];

function countLiteral(value, search) {
  if (!search) throw new TypeError("Cannot count an empty source anchor");
  return value.split(search).length - 1;
}

function replaceLiteral(value, search, replacement, expectedCount, label) {
  const actualCount = countLiteral(value, search);
  if (actualCount !== expectedCount) {
    throw new Error(
      `Dinner generator expected ${expectedCount} ${label} anchor(s), found ${actualCount}`,
    );
  }
  return value.split(search).join(replacement);
}

function getSingleMatch(value, pattern, label) {
  const matches = [...value.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Dinner generator expected 1 ${label}, found ${matches.length}`);
  }
  return matches[0];
}

function parseTimelineRows(listContents) {
  const rows = [...listContents.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)];
  const remainingMarkup = listContents.replace(/<li\b[^>]*>[\s\S]*?<\/li>/gu, "").trim();

  if (remainingMarkup) {
    throw new Error("Dinner generator found unexpected markup in the source timeline list");
  }

  return rows.map((row, index) => {
    const time = getSingleMatch(
      row[1],
      /<time\b[^>]*datetime="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/time>/gu,
      `time element in source timeline row ${index + 1}`,
    );
    const label = getSingleMatch(
      row[1],
      /<span\b[^>]*class="[^"]*\bwedding-timeline__label\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/gu,
      `label element in source timeline row ${index + 1}`,
    );

    return {
      datetime: time[1],
      displayTime: time[2].trim(),
      label: label[1].trim(),
    };
  });
}

function assertTimelineRows(actualRows) {
  if (actualRows.length !== ROOT_TIMELINE_ROWS.length) {
    throw new Error(
      `Dinner generator expected ${ROOT_TIMELINE_ROWS.length} source timeline rows, found ${actualRows.length}`,
    );
  }

  ROOT_TIMELINE_ROWS.forEach((expected, index) => {
    const actual = actualRows[index];
    for (const key of ["datetime", "displayTime", "label"]) {
      if (actual[key] !== expected[key]) {
        throw new Error(
          `Dinner generator source timeline row ${index + 1} has unexpected ${key}: ${JSON.stringify(actual[key])}`,
        );
      }
    }
  });
}

function renderTimelineList(listMatch, eol) {
  const listContents = listMatch[2];
  assertTimelineRows(parseTimelineRows(listContents));

  const firstRowIndent = listContents.match(/^(?:\r?\n)([ \t]*)<li\b/u)?.[1];
  const closingIndent = listContents.match(/\r?\n([ \t]*)$/u)?.[1];
  if (firstRowIndent === undefined || closingIndent === undefined) {
    throw new Error("Dinner generator could not determine source timeline indentation");
  }

  const childIndent = `${firstRowIndent}  `;
  const rows = DINNER_TIMELINE_ROWS.map(
    (row) =>
      [
        `${firstRowIndent}<li>`,
        `${childIndent}<time datetime="${row.datetime}">${row.displayTime}</time>`,
        `${childIndent}<span class="wedding-timeline__marker" aria-hidden="true"></span>`,
        `${childIndent}<span class="wedding-timeline__label">${row.label}</span>`,
        `${firstRowIndent}</li>`,
      ].join(eol),
  ).join(eol);

  return `${listMatch[1]}${eol}${rows}${eol}${closingIndent}${listMatch[3]}`;
}

function transformTimeline(html, eol) {
  const articleMatch = getSingleMatch(
    html,
    /<article\b[^>]*class="[^"]*\bwedding-timeline\b[^"]*"[^>]*>[\s\S]*?<\/article>/gu,
    "wedding timeline article",
  );
  const sourceArticle = articleMatch[0];
  let dinnerArticle = replaceLiteral(
    sourceArticle,
    '<p class="wedding-timeline__date">Chủ Nhật · 15.11.2026</p>',
    '<p class="wedding-timeline__date">Thứ Bảy · 14.11.2026</p>',
    1,
    "timeline date",
  );

  const listMatch = getSingleMatch(
    dinnerArticle,
    /(<ol\b[^>]*class="[^"]*\bwedding-timeline__events\b[^"]*"[^>]*>)([\s\S]*?)(<\/ol>)/gu,
    "timeline event list",
  );
  const dinnerList = renderTimelineList(listMatch, eol);
  dinnerArticle = replaceLiteral(
    dinnerArticle,
    listMatch[0],
    dinnerList,
    1,
    "timeline event list",
  );

  return replaceLiteral(html, sourceArticle, dinnerArticle, 1, "wedding timeline article");
}

function addDinnerBodyAttributes(html) {
  const bodyMatch = getSingleMatch(html, /<body\b[^>]*>/gu, "body opening tag");
  const sourceBodyTag = bodyMatch[0];

  for (const attribute of [
    "data-invitation-variant",
    "data-wedding-start",
    "data-wedding-end",
  ]) {
    if (new RegExp(`\\b${attribute}\\s*=`, "u").test(sourceBodyTag)) {
      throw new Error(`Dinner generator source body must not already define ${attribute}`);
    }
  }

  const dinnerBodyTag = `${sourceBodyTag.slice(0, -1)} ${DINNER_BODY_ATTRIBUTES}>`;
  return replaceLiteral(html, sourceBodyTag, dinnerBodyTag, 1, "body opening tag");
}

function assertNoStaleWeddingValues(html) {
  const staleValues = [
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
  ];

  const remaining = staleValues.filter((value) => html.includes(value));
  if (remaining.length > 0) {
    throw new Error(
      `Dinner generator left stale wedding value(s): ${remaining.map(JSON.stringify).join(", ")}`,
    );
  }
}

function renderDinnerHtml(sourceHtml) {
  if (typeof sourceHtml !== "string") {
    throw new TypeError("Dinner generator source HTML must be a string");
  }

  const eol = sourceHtml.includes("\r\n") ? "\r\n" : "\n";
  let html = addDinnerBodyAttributes(sourceHtml);

  html = replaceLiteral(
    html,
    '<time class="opening-invitation__date" datetime="2026-11-15T09:00:00+07:00">',
    '<time class="opening-invitation__date" datetime="2026-11-14T18:00:00+07:00">',
    1,
    "opening invitation datetime",
  );
  html = replaceLiteral(
    html,
    "09:00 · Chủ Nhật · 15.11.2026",
    "18:00 · Thứ Bảy · 14.11.2026",
    1,
    "opening invitation date text",
  );
  html = replaceLiteral(
    html,
    "<strong>15 · 11 · 2026</strong>",
    "<strong>14 · 11 · 2026</strong>",
    1,
    "hero date",
  );
  html = replaceLiteral(
    html,
    "<span>Chủ Nhật · 09:00</span>",
    "<span>Thứ Bảy · 18:00</span>",
    1,
    "hero weekday and time",
  );

  html = replaceLiteral(
    html,
    '<p class="reception-card__weekday">Chủ Nhật - 09:00</p>',
    '<p class="reception-card__weekday">Thứ Bảy - 18:00</p>',
    2,
    "reception weekday and time",
  );
  html = replaceLiteral(
    html,
    '<time class="reception-card__date" datetime="2026-11-15T09:00:00+07:00">15 . 11 . 2026</time>',
    '<time class="reception-card__date" datetime="2026-11-14T18:00:00+07:00">14 . 11 . 2026</time>',
    2,
    "reception date",
  );
  html = replaceLiteral(
    html,
    '<p class="reception-card__lunar">Tức ngày 07 tháng 10 năm Bính Ngọ</p>',
    '<p class="reception-card__lunar">Tức ngày 06 tháng 10 năm Bính Ngọ</p>',
    2,
    "reception lunar date",
  );

  html = transformTimeline(html, eol);

  html = replaceLiteral(
    html,
    "<strong>Chủ Nhật · 15.11.2026</strong>",
    "<strong>Thứ Bảy · 14.11.2026</strong>",
    1,
    "calendar footer date",
  );
  html = replaceLiteral(
    html,
    "20261115T020000Z%2F20261115T050000Z",
    "20261114T110000Z%2F20261114T140000Z",
    2,
    "Google Calendar date range",
  );
  html = replaceLiteral(
    html,
    'aria-label="Đếm ngược đến 09:00 ngày 15 tháng 11 năm 2026"',
    'aria-label="Đếm ngược đến 18:00 ngày 14 tháng 11 năm 2026"',
    1,
    "countdown accessible label",
  );
  html = replaceLiteral(
    html,
    '<p class="sr-only" id="countdownStatus" role="status">Ngày cưới: 09:00, Chủ Nhật, 15/11/2026.</p>',
    '<p class="sr-only" id="countdownStatus" role="status">Ngày cưới: 18:00, Thứ Bảy, 14/11/2026.</p>',
    1,
    "countdown status",
  );
  html = replaceLiteral(
    html,
    "Hẹn gặp bạn vào ngày 15 tháng 11 năm 2026.",
    "Hẹn gặp bạn vào ngày 14 tháng 11 năm 2026.",
    1,
    "closing date",
  );

  assertNoStaleWeddingValues(html);
  return html;
}

const generateDinnerHtml = renderDinnerHtml;

function writeFileIfChanged(outputFile, content) {
  let existing = null;
  try {
    existing = fs.readFileSync(outputFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (existing === content) return false;

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, content, "utf8");
  return true;
}

function generateDinnerFile({ sourceFile, outputFile } = {}) {
  const resolvedSourceFile = path.resolve(sourceFile || DEFAULT_SOURCE_FILE);
  const resolvedOutputFile = path.resolve(outputFile || DEFAULT_OUTPUT_FILE);
  if (resolvedSourceFile === resolvedOutputFile) {
    throw new Error("Dinner generator source and output files must be different");
  }

  const sourceHtml = fs.readFileSync(resolvedSourceFile, "utf8");
  const content = renderDinnerHtml(sourceHtml);
  const changed = writeFileIfChanged(resolvedOutputFile, content);

  return {
    sourceFile: resolvedSourceFile,
    outputFile: resolvedOutputFile,
    content,
    changed,
  };
}

if (require.main === module) {
  const [sourceFile, outputFile] = process.argv.slice(2);
  const result = generateDinnerFile({ sourceFile, outputFile });
  const verb = result.changed ? "Generated" : "Verified";
  console.log(`${verb} ${path.relative(process.cwd(), result.outputFile)} from ${path.relative(process.cwd(), result.sourceFile)}.`);
}

module.exports = {
  DEFAULT_OUTPUT_FILE,
  DEFAULT_SOURCE_FILE,
  DINNER_BODY_ATTRIBUTES,
  DINNER_TIMELINE_ROWS,
  ROOT_TIMELINE_ROWS,
  generateDinnerFile,
  generateDinnerHtml,
  renderDinnerHtml,
  writeFileIfChanged,
};
