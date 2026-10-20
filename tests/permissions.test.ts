import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageProject, canSeeProject, taskEdits } from "../src/lib/permissions";

const project = { leadId: "lead" };

test("who manages and who sees a project", () => {
  assert.equal(canManageProject("admin", "x", project), true);
  assert.equal(canManageProject("member", "lead", project), true);
  assert.equal(canManageProject("member", "x", project), false);
  assert.equal(canSeeProject("member", "x", project, false), false);
  assert.equal(canSeeProject("member", "x", project, true), true);
  assert.equal(canSeeProject("owner", "x", project, false), true);
});

test("managers can do everything, but only plan a blocked task", () => {
  assert.equal(taskEdits({ manager: true, assignee: false, blocked: false }).has("title"), true);
  const blocked = taskEdits({ manager: true, assignee: false, blocked: true });
  for (const e of ["dates", "assignee", "weight", "priority", "dependencies", "delete"] as const) assert.ok(blocked.has(e), e);
  for (const e of ["status", "progress", "title", "subtasks", "fields"] as const) assert.ok(!blocked.has(e), e);
});

test("members only update their own tasks, and nothing while blocked", () => {
  const own = taskEdits({ manager: false, assignee: true, blocked: false });
  assert.deepEqual([...own].sort(), ["progress", "status", "subtasks"]);
  assert.equal(taskEdits({ manager: false, assignee: true, blocked: true }).size, 0);
  assert.equal(taskEdits({ manager: false, assignee: false, blocked: false }).size, 0);
});
