import { z } from "zod";

/**
 * Optional non-negative decimal from a form/JSON value ("1,500.5" ok).
 * Returns a fixed-2 string for numeric columns, or null when empty.
 */
export const optionalDecimal = (max: number, message: string) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === "") return null;
      const n = Number(String(v).replace(/,/g, "").trim());
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n.toFixed(2);
    });

/** Same, but empty means 0. */
export const decimalOrZero = (max: number, message: string) =>
  optionalDecimal(max, message).transform((v) => v ?? "0.00");

export const MAX_MONEY = 999_999_999_999;
export const MAX_QTY = 999_999_999;
