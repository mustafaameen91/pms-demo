import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attentionList,
  buildOrgTree,
  daysToNextYearly,
  employeeCode,
  expiryState,
  grossPay,
  profileCompleteness,
  tenure,
  upcomingCelebrations,
  wouldCreateLoop,
  type EmployeeLike,
} from "../src/lib/hr";

const emp = (o: Partial<EmployeeLike> & { id: string }): EmployeeLike => ({
  name: o.id,
  managerId: null,
  endDate: null,
  hireDate: null,
  birthDate: null,
  probationEndDate: null,
  contractEndDate: null,
  jobTitle: "Engineer",
  departmentId: "d1",
  phone: "1",
  nationalId: "1",
  emergencyPhone: "1",
  basicPay: "1000",
  bankAccount: "1",
  photoPath: "p",
  ...o,
});

test("employee codes", () => {
  assert.equal(employeeCode(7), "EMP-007");
  assert.equal(employeeCode(1234), "EMP-1234");
});

test("expiry state", () => {
  assert.equal(expiryState(null, "2026-11-04"), "none");
  assert.equal(expiryState("2026-11-03", "2026-11-04"), "expired");
  assert.equal(expiryState("2026-11-04", "2026-11-04"), "expiring");
  assert.equal(expiryState("2026-12-04", "2026-11-04"), "expiring");
  assert.equal(expiryState("2026-12-05", "2026-11-04"), "valid");
});

test("tenure in years and months", () => {
  assert.deepEqual(tenure("2023-08-15", "2026-11-04"), { years: 3, months: 2 });
  assert.deepEqual(tenure("2026-11-04", "2026-11-04"), { years: 0, months: 0 });
  assert.equal(tenure("2027-01-01", "2026-11-04"), null);
});

test("next yearly date, including Feb 29", () => {
  assert.equal(daysToNextYearly("1990-11-04", "2026-11-04"), 0);
  assert.equal(daysToNextYearly("1990-11-10", "2026-11-04"), 6);
  assert.equal(daysToNextYearly("1990-11-01", "2026-11-04"), 362);
  assert.equal(daysToNextYearly("2000-02-29", "2027-02-01"), 27);
});

test("gross pay adds allowances", () => {
  assert.equal(grossPay({ basicPay: "1000", allowances: [{ amount: "200" }, { amount: "50.5" }] }), 1250.5);
  assert.equal(grossPay({ basicPay: null, allowances: [] }), 0);
});

test("profile completeness lists what's missing", () => {
  const c = profileCompleteness(emp({ id: "a", hireDate: "2020-01-01", birthDate: "1990-01-01", phone: null, photoPath: null }));
  assert.equal(c.percent, 80);
  assert.deepEqual(c.missing, ["Phone", "Photo"]);
});

test("attention list: urgent first, people who left ignored", () => {
  const today = "2026-11-04";
  const list = attentionList(
    [
      emp({ id: "a", probationEndDate: "2026-11-20" }),
      emp({ id: "b", contractEndDate: "2026-10-30" }),
      emp({ id: "c", jobTitle: null, departmentId: null, phone: null, nationalId: null, emergencyPhone: null }),
      emp({ id: "gone", endDate: "2026-01-01", contractEndDate: "2026-10-01" }),
    ],
    [
      { employeeId: "a", type: "passport", expiryDate: "2026-10-01" },
      { employeeId: "b", type: "visa", expiryDate: "2026-11-10" },
      { employeeId: "a", type: "residency", expiryDate: "2027-06-01" },
      { employeeId: "gone", type: "visa", expiryDate: "2026-01-02" },
    ],
    today,
  );
  assert.deepEqual(
    list.map((i) => [i.kind, i.employeeId, i.days]),
    [
      ["doc_expired", "a", -34],
      ["contract_ended", "b", -5],
      ["doc_expiring", "b", 6],
      ["probation_ending", "a", 16],
      ["incomplete", "c", null],
    ],
  );
});

test("birthdays and anniversaries coming up", () => {
  const list = upcomingCelebrations(
    [
      emp({ id: "a", birthDate: "1990-11-10", hireDate: "2024-11-04" }),
      emp({ id: "b", hireDate: "2026-11-04" }),
      emp({ id: "c", birthDate: "1985-01-15" }),
    ],
    "2026-11-04",
  );
  assert.deepEqual(list, [
    { employeeId: "a", kind: "anniversary", days: 0, years: 2 },
    { employeeId: "a", kind: "birthday", days: 6, years: 36 },
  ]);
});

test("org chart: everyone once, loops broken", () => {
  const people = [
    { id: "ceo", name: "CEO", managerId: null },
    { id: "a", name: "A", managerId: "ceo" },
    { id: "b", name: "B", managerId: "a" },
    { id: "x", name: "X", managerId: "y" },
    { id: "y", name: "Y", managerId: "x" },
    { id: "z", name: "Z", managerId: "missing" },
  ];
  const tree = buildOrgTree(people);
  const ids: string[] = [];
  const walk = (n: (typeof tree)[number]) => {
    ids.push(n.employee.id);
    n.reports.forEach(walk);
  };
  tree.forEach(walk);
  assert.deepEqual([...ids].sort(), ["a", "b", "ceo", "x", "y", "z"]);
  assert.equal(tree[0].employee.id, "ceo");
  assert.equal(tree[0].reports[0].reports[0].employee.id, "b");
});

test("manager loops are detected", () => {
  const people = [
    { id: "ceo", managerId: null },
    { id: "a", managerId: "ceo" },
    { id: "b", managerId: "a" },
  ];
  assert.equal(wouldCreateLoop(people, "ceo", "b"), true);
  assert.equal(wouldCreateLoop(people, "a", "a"), true);
  assert.equal(wouldCreateLoop(people, "b", "ceo"), false);
});
