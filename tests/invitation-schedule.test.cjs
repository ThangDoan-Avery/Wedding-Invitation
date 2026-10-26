const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "../deploy/app.js"), "utf8");
assert.match(appSource, /\binitializeInvitation\(\);\s*$/u);
const appWithoutInitialization = appSource.replace(/\binitializeInvitation\(\);\s*$/u, "");

const DEFAULT_DATE = { year: 2026, month: 11, day: 15 };
const DEFAULT_COUNTDOWN = "2026-11-15T09:00:00+07:00";
const DEFAULT_EVENT_TIMES = {
  startUtc: "20261115T020000Z",
  endUtc: "20261115T050000Z",
};
const DINNER_START = "2026-11-14T18:00:00+07:00";
const DINNER_END = "2026-11-14T21:00:00+07:00";

function createContext(dataset, { includeDocument = true } = {}) {
  const globals = {
    console,
    URL,
    URLSearchParams,
  };
  if (includeDocument) {
    globals.document = dataset === undefined ? {} : { body: { dataset } };
  }
  const context = vm.createContext(globals);
  vm.runInContext(appWithoutInitialization, context);
  return context;
}

function readWedding(context) {
  return JSON.parse(vm.runInContext("JSON.stringify(WEDDING)", context));
}

function dinnerDataset(overrides = {}) {
  return {
    invitationVariant: "dinner",
    weddingStart: DINNER_START,
    weddingEnd: DINNER_END,
    ...overrides,
  };
}

function withTimezone(timeZone, callback) {
  const hadTimezone = Object.hasOwn(process.env, "TZ");
  const previousTimezone = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return callback();
  } finally {
    if (hadTimezone) process.env.TZ = previousTimezone;
    else delete process.env.TZ;
  }
}

test("default wedding schedule remains the current 09:00 ceremony on 15 November", () => {
  const context = createContext();
  const wedding = readWedding(context);

  assert.deepEqual(wedding.date, DEFAULT_DATE);
  assert.equal(wedding.countdownTargetISO, DEFAULT_COUNTDOWN);
  assert.deepEqual(
    { startUtc: wedding.events.Th.startUtc, endUtc: wedding.events.Th.endUtc },
    DEFAULT_EVENT_TIMES,
  );
  assert.deepEqual(
    { startUtc: wedding.events.Tr.startUtc, endUtc: wedding.events.Tr.endUtc },
    DEFAULT_EVENT_TIMES,
  );
  assert.equal(wedding.events.Th.title, "Tiệc cưới Hữu Thắng & Thu Trang - Nhà trai");
  assert.equal(
    wedding.events.Th.location,
    "Tư gia nhà trai, thôn 3 An Quý, xã Vĩnh Hải, thành phố Hải Phòng",
  );
  assert.equal(wedding.events.Tr.title, "Tiệc cưới Hữu Thắng & Thu Trang - Nhà gái");
  assert.equal(
    wedding.events.Tr.location,
    "Thôn Ấp Giáo, xã Vĩnh Hải, thành phố Hải Phòng",
  );
});

test("valid dinner data applies before rendering and remains timezone-independent", () => {
  withTimezone("Pacific/Auckland", () => {
    const context = createContext(dinnerDataset());
    const before = readWedding(context);

    assert.equal(context.applyInvitationSchedule(), true);
    const wedding = readWedding(context);

    assert.deepEqual(wedding.date, { year: 2026, month: 11, day: 14 });
    assert.equal(wedding.countdownTargetISO, DINNER_START);
    for (const side of ["Th", "Tr"]) {
      assert.equal(wedding.events[side].startUtc, "20261114T110000Z");
      assert.equal(wedding.events[side].endUtc, "20261114T140000Z");
      assert.equal(wedding.events[side].title, before.events[side].title);
      assert.equal(wedding.events[side].location, before.events[side].location);
    }

    const groomCalendar = new URL(
      vm.runInContext("buildCalendarUrl(WEDDING.events.Th)", context),
    );
    const brideCalendar = new URL(
      vm.runInContext("buildCalendarUrl(WEDDING.events.Tr)", context),
    );
    assert.equal(groomCalendar.searchParams.get("dates"), "20261114T110000Z/20261114T140000Z");
    assert.equal(brideCalendar.searchParams.get("dates"), "20261114T110000Z/20261114T140000Z");
    assert.equal(groomCalendar.searchParams.get("text"), before.events.Th.title);
    assert.equal(groomCalendar.searchParams.get("location"), before.events.Th.location);
    assert.equal(brideCalendar.searchParams.get("text"), before.events.Tr.title);
    assert.equal(brideCalendar.searchParams.get("location"), before.events.Tr.location);
  });
});

test("missing, invalid, and non-dinner schedule data never partially mutates defaults", () => {
  const invalidCases = [
    ["missing body", undefined],
    ["missing variant", { weddingStart: DINNER_START, weddingEnd: DINNER_END }],
    ["wrong variant", { invitationVariant: "default", weddingStart: DINNER_START, weddingEnd: DINNER_END }],
    ["missing start", { invitationVariant: "dinner", weddingEnd: DINNER_END }],
    ["missing end", { invitationVariant: "dinner", weddingStart: DINNER_START }],
    ["blank start", dinnerDataset({ weddingStart: "" })],
    ["malformed start", dinnerDataset({ weddingStart: "not-a-date" })],
    ["malformed end", dinnerDataset({ weddingEnd: "2026-11-14T21:00:00" })],
    ["end before start", dinnerDataset({ weddingEnd: "2026-11-14T17:00:00+07:00" })],
    ["same start and end", dinnerDataset({ weddingEnd: DINNER_START })],
  ];

  for (const [name, dataset] of invalidCases) {
    const context = createContext(dataset);
    const before = readWedding(context);
    assert.equal(context.applyInvitationSchedule(), false, name);
    assert.deepEqual(readWedding(context), before, name);
  }
});

test("app source remains VM-loadable without a DOM when bootstrap is stripped", () => {
  assert.doesNotThrow(() => createContext(undefined, { includeDocument: false }));
});

test("invitation schedule is configured before guest, calendar, links, and countdown setup", () => {
  const initializeBody = appSource.match(
    /function initializeInvitation\(\) \{([\s\S]*?)\n\}/u,
  )?.[1];
  assert.ok(initializeBody, "initializeInvitation body is missing");

  const scheduleIndex = initializeBody.indexOf("applyInvitationSchedule()");
  assert.ok(scheduleIndex >= 0, "applyInvitationSchedule must run during initialization");
  for (const laterCall of [
    "readGuestParam()",
    "fillCalendar()",
    "setupCalendarLinks()",
    "setupCountdown()",
  ]) {
    const laterIndex = initializeBody.indexOf(laterCall);
    assert.ok(laterIndex > scheduleIndex, `${laterCall} must run after schedule configuration`);
  }
  assert.equal(
    initializeBody.match(/\bapplyInvitationSchedule\(\)/gu)?.length,
    1,
    "schedule configuration must run exactly once",
  );
});
