import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FORM_CONFIG, createRateLimiter, describeSubmission, formConfigSchema, submissionSchema } from "../src/lib/forms";

const config = {
  ...DEFAULT_FORM_CONFIG,
  askEmail: "required" as const,
  questions: [
    { id: "room", label: "Room", type: "text" as const, required: true },
    { id: "kind", label: "Kind", type: "choice" as const, options: ["AC", "Lights"], required: false },
  ],
};

test("valid submission", () => {
  const r = submissionSchema(config).safeParse({
    subject: "AC not cooling",
    name: "Sara",
    email: "sara@example.com",
    phone: "",
    answers: { room: "3B", kind: "AC" },
  });
  assert.ok(r.success);
  assert.equal(r.success && r.data.phone, undefined);
});

test("required fields and choices are enforced", () => {
  const r = submissionSchema(config).safeParse({ subject: "AC", name: "", email: "x", answers: { room: "", kind: "Heater" } });
  assert.ok(!r.success);
  const messages = r.error!.issues.map((i) => i.message).join(" | ");
  assert.match(messages, /a few words/);
  assert.match(messages, /Your name is required/);
  assert.match(messages, /valid email/);
  assert.match(messages, /“Room” is required/);
  assert.match(messages, /Choose an option for “Kind”/);
});

test("config validation", () => {
  assert.ok(!formConfigSchema.safeParse({ ...config, questions: [{ id: "a", label: "X", type: "choice", options: ["one"], required: false }] }).success);
  assert.ok(formConfigSchema.safeParse(config).success);
});

test("task description lists answers and requester", () => {
  const text = describeSubmission(config.questions, {
    details: "Since Monday",
    name: "Sara",
    email: "sara@example.com",
    answers: { room: "3B", kind: undefined },
  });
  assert.equal(text, "Since Monday\n\nRoom: 3B\n\nRequested by: Sara · sara@example.com");
});

test("rate limiter counts only recorded hits", () => {
  const limiter = createRateLimiter(2, 1000);
  assert.equal(limiter.allowed("ip", 0), true);
  limiter.record("ip", 0);
  assert.equal(limiter.allowed("ip", 5), true); // a rejected attempt in between doesn't count
  limiter.record("ip", 10);
  assert.equal(limiter.allowed("ip", 20), false);
  assert.equal(limiter.allowed("ip", 1500), true); // window passed
  assert.equal(limiter.allowed("other", 20), true);
});
