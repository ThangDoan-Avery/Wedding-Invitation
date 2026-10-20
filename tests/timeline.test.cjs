const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../deploy/index.html"), "utf8");
const timeline = html.match(
  /<article\b[^>]*class="[^"]*\bwedding-timeline\b[^"]*"[^>]*>[\s\S]*?<\/article>/u,
)?.[0];

test("wedding timeline keeps the date and exactly three ordered events", () => {
  assert.ok(timeline, "Wedding timeline article is missing");
  assert.match(
    timeline,
    /<p\b[^>]*class="wedding-timeline__date"[^>]*>\s*Chủ Nhật · 15\.11\.2026\s*<\/p>/u,
  );

  const list = timeline.match(
    /<ol\b[^>]*class="[^"]*\bwedding-timeline__events\b[^"]*"[^>]*>([\s\S]*?)<\/ol>/u,
  )?.[1];
  assert.ok(list, "Wedding timeline event list is missing");

  const rows = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)].map((match) => match[1]);
  assert.equal(rows.length, 3);

  const actual = rows.map((row) => {
    const time = row.match(/<time\b[^>]*datetime="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/time>/u);
    const label = row.match(
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

  assert.deepEqual(actual, [
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
  ]);
});
