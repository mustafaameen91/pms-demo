import { z } from "zod";
import type { FormConfig, FormQuestion } from "@/lib/db/schema/pm";

/** Request-form rules (pure): config, submission validation, rate limit, task text. */

const ask = z.enum(["off", "optional", "required"]);

export const formConfigSchema = z.object({
  askName: ask,
  askEmail: ask,
  askPhone: ask,
  askPriority: z.boolean(),
  askNeededBy: z.boolean(),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().trim().min(1, "Every question needs a label").max(200),
        type: z.enum(["text", "textarea", "choice"]),
        options: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
        required: z.boolean(),
      }),
    )
    .max(15, "At most 15 questions")
    .refine((qs) => qs.every((q) => q.type !== "choice" || (q.options?.length ?? 0) >= 2), "Choice questions need at least 2 options"),
}) satisfies z.ZodType<FormConfig>;

export const DEFAULT_FORM_CONFIG: FormConfig = {
  askName: "required",
  askEmail: "optional",
  askPhone: "optional",
  askPriority: true,
  askNeededBy: true,
  questions: [],
};

const field = (mode: "off" | "optional" | "required", base: z.ZodString, label: string) =>
  mode === "required"
    ? base.min(1, `${label} is required`)
    : base.optional().transform((v) => v || undefined);

/** Zod schema for one submission of a form with this config. */
export function submissionSchema(config: FormConfig) {
  const answers: Record<string, z.ZodType<string | undefined>> = {};
  for (const q of config.questions) {
    let s: z.ZodType<string | undefined> = z.string().trim().max(q.type === "textarea" ? 5000 : 500);
    if (q.type === "choice") {
      s = z.string().refine((v) => v === "" || (q.options ?? []).includes(v), `Choose an option for “${q.label}”`);
    }
    answers[q.id] = q.required
      ? (s as z.ZodString).refine((v) => Boolean(v && v.trim()), `“${q.label}” is required`)
      : s.optional().transform((v) => (v ? v : undefined));
  }
  return z.object({
    subject: z.string().trim().min(3, "Describe the request in a few words").max(200),
    details: z.string().trim().max(5000).optional().transform((v) => v || undefined),
    name: config.askName === "off" ? z.undefined().optional() : field(config.askName, z.string().trim().max(120), "Your name"),
    email:
      config.askEmail === "off"
        ? z.undefined().optional()
        : config.askEmail === "required"
          ? z.string().trim().email("Enter a valid email")
          : z.string().trim().email("Enter a valid email").optional().or(z.literal("").transform(() => undefined)),
    phone: config.askPhone === "off" ? z.undefined().optional() : field(config.askPhone, z.string().trim().max(40), "Phone"),
    priority: config.askPriority ? z.enum(["low", "medium", "high", "urgent"]).optional() : z.undefined().optional(),
    neededBy: config.askNeededBy
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined))
      : z.undefined().optional(),
    answers: z.object(answers),
  });
}

/** Task description built from a submission (shown to the team). */
export function describeSubmission(
  questions: FormQuestion[],
  data: { details?: string; name?: string; email?: string; phone?: string; answers: Record<string, string | undefined> },
) {
  const lines: string[] = [];
  if (data.details) lines.push(data.details, "");
  for (const q of questions) {
    const a = data.answers[q.id];
    if (a) lines.push(`${q.label}: ${a}`);
  }
  const who = [data.name, data.email, data.phone].filter(Boolean).join(" · ");
  if (who) lines.push("", `Requested by: ${who}`);
  return lines.join("\n").trim();
}

/**
 * Small in-memory rate limiter (per server process): at most `limit` recorded
 * hits per key within `windowMs`. `allowed` only checks; `record` counts one —
 * so attempts rejected for typos don't use up the allowance.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  return {
    allowed(key: string, now = Date.now()) {
      return recent(key, now).length < limit;
    },
    record(key: string, now = Date.now()) {
      if (hits.size > 10_000) hits.clear(); // keep memory bounded
      hits.set(key, [...recent(key, now), now]);
    },
  };
}

/** Bots submit instantly; people need a few seconds. */
export const MIN_FILL_MS = 2500;
