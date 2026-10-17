import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor } from "../src/lib/access";

const today = "2026-10-17";

test("pending / missing / cancelled are locked", () => {
  assert.equal(accessFor(null, today).allowed, false);
  assert.equal(accessFor({ status: "pending", paidUntil: null }, today).kind, "pending");
  assert.equal(accessFor({ status: "cancelled", paidUntil: "2027-01-01" }, today).allowed, false);
});

test("active with no end date is complimentary", () => {
  assert.deepEqual(accessFor({ status: "active", paidUntil: null }, today), { allowed: true, kind: "complimentary" });
});

test("paid until today still works; tomorrow's expiry warns", () => {
  const a = accessFor({ status: "active", paidUntil: "2026-10-17" }, today);
  assert.equal(a.allowed, true);
  assert.equal(a.allowed && a.kind === "active" && a.daysLeft, 0);
  const b = accessFor({ status: "active", paidUntil: "2026-10-24" }, today);
  assert.equal(b.allowed && b.kind === "active" && b.endingSoon, true);
  const c = accessFor({ status: "active", paidUntil: "2026-11-30" }, today);
  assert.equal(c.allowed && c.kind === "active" && c.endingSoon, false);
});

test("past paid-until is expired; trial behaves the same", () => {
  assert.equal(accessFor({ status: "active", paidUntil: "2026-10-16" }, today).kind, "expired");
  assert.equal(accessFor({ status: "trial", paidUntil: "2026-10-20" }, today).kind, "trial");
  assert.equal(accessFor({ status: "trial", paidUntil: "2026-10-01" }, today).allowed, false);
});
