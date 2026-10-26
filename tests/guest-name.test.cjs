const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Load the actual browser functions without bootstrapping unrelated page features.
const app = fs.readFileSync(path.join(__dirname, "../deploy/app.js"), "utf8");
assert.match(app, /\binitializeInvitation\(\);\s*$/u);
const context = vm.createContext({ URLSearchParams });
vm.runInContext(app.replace(/\binitializeInvitation\(\);\s*$/u, ""), context);

const cases = [
  ["root defaults to Quý khách", "/", "", "Quý khách", false],
  ["Vietnamese path and raw plus", "/guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3", "", "Bạn Thắng A3", true],
  ["unescaped Vietnamese", "/guest=bạn+Thắng+A3", "", "Bạn Thắng A3", true],
  ["optional trailing slash", "/guest=bạn+Thắng+A3/", "", "Bạn Thắng A3", true],
  ["encoded spaces", "/guest=bạn%20Thắng%20A3", "", "Bạn Thắng A3", true],
  ["old query links", "/", "?guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3", "Bạn Thắng A3", true],
  ["encoded query key", "/", "?%67uest=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["unrelated query parameters", "/", "?source=invite&guest=bạn+Thắng+A3&preview=1", "Bạn Thắng A3", true],
  ["dinner path accepts the empty query key", "/dinner", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner trailing slash accepts the empty query key", "/dinner/", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner dot path accepts the empty query key", "/dinner.", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner dot path allows a trailing slash", "/dinner./", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner guest path accepts the empty query key", "/dinner.guest", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner guest path allows a trailing slash", "/dinner.guest/", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["local dinner html path accepts the empty query key", "/dinner.html", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["local dinner html path allows a trailing slash", "/dinner.html/", "?=bạn+Thắng+A3", "Bạn Thắng A3", true],
  ["dinner empty-key links can include unrelated parameters", "/dinner", "?source=invite&=bạn+Thắng+A3&preview=1", "Bạn Thắng A3", true],
  ["dinner empty-key plus remains literal", "/dinner", "?=a%2Bb", "A+b", true],
  ["dinner empty-key value is decoded once", "/dinner", "?=bạn+%2520", "Bạn %20", true],
  ["normal guest key wins over an earlier dinner empty key", "/dinner", "?=An&guest=Bình", "Bình", true],
  ["encoded normal guest key wins over dinner empty key", "/dinner", "?=An&%67uest=Bình", "Bình", true],
  ["blank normal guest key blocks dinner empty-key fallback", "/dinner", "?guest=&=An", "Quý khách", false],
  ["malformed normal guest key blocks dinner empty-key fallback", "/dinner", "?guest=%ZZ&=An", "Quý khách", false],
  ["first duplicate dinner empty key wins", "/dinner", "?=an&=Bình", "An", true],
  ["blank dinner empty key falls back", "/dinner", "?=", "Quý khách", false],
  ["malformed dinner empty key falls back", "/dinner", "?=%ZZ", "Quý khách", false],
  ["malformed UTF-8 dinner empty key falls back", "/dinner", "?=%E0%A4%A", "Quý khách", false],
  ["root path does not accept the empty query key", "/", "?=An", "Quý khách", false],
  ["unknown dinner extension does not accept the empty query key", "/dinner.css", "?=An", "Quý khách", false],
  ["nested dinner path does not accept the empty query key", "/dinner/extra", "?=An", "Quý khách", false],
  ["dinner path matching stays case-sensitive", "/Dinner", "?=An", "Quý khách", false],
  ["path wins over query", "/guest=an", "?guest=Bình", "An", true],
  ["empty path does not fall back to query", "/guest=", "?guest=Bình", "Quý khách", false],
  ["blank path", "/guest=++%20/", "", "Quý khách", false],
  ["empty query", "/", "?guest=", "Quý khách", false],
  ["query without equals", "/", "?guest", "Quý khách", false],
  ["unrelated parameter", "/", "?Guest=An", "Quý khách", false],
  ["first duplicate query wins", "/", "?guest=an&guest=Bình", "An", true],
  ["malformed percent", "/guest=%ZZ", "?guest=An", "Quý khách", false],
  ["malformed UTF-8", "/guest=%E0%A4%A", "", "Quý khách", false],
  ["malformed query", "/", "?guest=%ZZ", "Quý khách", false],
  ["replacement character", "/guest=%EF%BF%BD", "", "Quý khách", false],
  ["extra literal path segment", "/guest=An/extra", "?guest=Bình", "Quý khách", false],
  ["literal plus remains literal", "/guest=a%2Bb", "", "A+b", true],
  ["query plus remains literal", "/", "?guest=a%2Bb", "A+b", true],
  ["one decode only", "/guest=bạn+%2520", "", "Bạn %20", true],
  ["query decoded once", "/", "?guest=bạn+%2520", "Bạn %20", true],
  ["path ampersand is part of name", "/guest=anh+%26+chị", "", "Anh & chị", true],
  ["path equals is part of name", "/guest=an=binh", "", "An=binh", true],
  ["NFD normalized to NFC", "/guest=" + encodeURIComponent("ba\u0323n Thắng A3"), "", "Bạn Thắng A3", true],
  ["capitalize only first letter", "/guest=nguyễn+văn+a", "", "Nguyễn văn a", true],
  ["preserve suffix case", "/guest=nGUYỄN+A3", "", "NGUYỄN A3", true],
  ["capitalize Vietnamese đ", "/guest=đức+Anh", "", "Đức Anh", true],
  ["uppercase class label", "/guest=a3", "", "A3", true],
  ["remove controls and collapse whitespace", "/guest=%00bạn%0A%20Thắng%20%20A3%E2%80%AE", "", "Bạn Thắng A3", true],
  ["only controls", "/guest=%00%0A%E2%80%AE", "", "Quý khách", false],
  ["80 code-point limit", "/guest=" + "a".repeat(81), "", "A" + "a".repeat(79), true],
  ["emoji stays whole at the length limit", "/guest=" + "💌".repeat(81), "", "💌".repeat(80), true],
  ["uppercase expansion remains limited", "/guest=" + "ß".repeat(80), "", "SS" + "ß".repeat(78), true],
  ["HTML is preserved as text", "/guest=" + encodeURIComponent('<img src=x onerror="alert(1)">'), "", '<Img src=x onerror="alert(1)">', true],
];

for (const [name, pathname, search, displayName, supplied] of cases) {
  test(name, () => {
    const actual = context.readGuestParam(search, pathname);
    assert.equal(actual.displayName, displayName);
    assert.equal(actual.supplied, supplied);
  });
}

test("updates every invitation name and both forms using text only", () => {
  const labels = [{}, {}, {}];
  const rsvp = { value: "" };
  const wish = { value: "" };
  context.document = {
    querySelectorAll: () => labels,
    querySelector: selector => ({ "#rsvpName": rsvp, "#guestName": wish })[selector],
  };
  const guest = context.readGuestParam("", "/guest=bạn+Thắng+A3");
  context.applyGuestName(guest);
  for (const label of labels) {
    assert.equal(label.textContent, "Bạn Thắng A3");
    assert.equal(Object.hasOwn(label, "innerHTML"), false);
  }
  assert.equal(rsvp.value, "Bạn Thắng A3");
  assert.equal(wish.value, "Bạn Thắng A3");
});

test("default invitation does not prefill forms with Quý khách", () => {
  const label = {};
  context.document = {
    querySelectorAll: () => [label],
    querySelector: () => { assert.fail("Fallback must not change a form name"); },
  };
  context.applyGuestName(context.readGuestParam("", "/"));
  assert.equal(label.textContent, "Quý khách");
});
