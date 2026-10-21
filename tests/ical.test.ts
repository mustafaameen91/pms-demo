import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, escapeText, foldLine } from "../src/lib/ical";

test("text is escaped", () => {
  assert.equal(escapeText("Walls, roof; plan\\v2\nnext line"), "Walls\\, roof\\; plan\\\\v2\\nnext line");
});

test("long lines fold at 75 bytes without breaking Arabic letters", () => {
  const ascii = "SUMMARY:" + "x".repeat(200);
  const folded = foldLine(ascii).split("\r\n");
  assert.ok(folded.every((l) => Buffer.byteLength(l) <= 75));
  assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(""), ascii);
  const arabic = "SUMMARY:" + "تجهيز الموقع وصب الخرسانة للأساسات ".repeat(4);
  const parts = foldLine(arabic).split("\r\n");
  assert.ok(parts.length > 1);
  assert.ok(parts.every((l) => Buffer.byteLength(l) <= 75));
  assert.ok(parts.every((l) => !l.includes("�")));
  assert.equal(parts.map((l, i) => (i ? l.slice(1) : l)).join(""), arabic);
});

test("a calendar with one-day and multi-day all-day events", () => {
  const ics = buildCalendar({
    name: "PMS — Omar",
    now: new Date("2026-10-21T08:30:00Z"),
    events: [
      { uid: "t1@pms", title: "CL-3 Pour slab", start: "2026-10-25", end: "2026-10-25", url: "https://pms.example/w/a/p/CL?task=CL-3" },
      { uid: "t2@pms", title: "CL-4 Walls", description: "Clinic", start: "2026-10-26", end: "2026-10-30" },
    ],
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "only CRLF line endings");
  assert.match(ics, /DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261031/);
  assert.match(ics, /DTSTAMP:20261021T083000Z/);
  assert.match(ics, /X-WR-CALNAME:PMS — Omar/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)!.length, 2);
});
