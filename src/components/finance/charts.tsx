"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";

/*
 * Finance charts (plain HTML/SVG). Colours validated with the dataviz checker:
 * income graphite #1F2933 / dark #CBD2D9 (the tamm primary), costs #0891B2 / dark #0E9FB8 — told apart by
 * lightness as well as hue, so they survive colour-vision deficiency;
 * a cash shortfall uses the reserved critical red with an icon and a label.
 */
const INCOME = "fill-[#1F2933] dark:fill-[#CBD2D9]";
const COSTS = "fill-[#0891B2] dark:fill-[#0E9FB8]";
const INCOME_BG = "bg-[#1F2933] dark:bg-[#CBD2D9]";
const COSTS_BG = "bg-[#0891B2] dark:bg-[#0E9FB8]";

/** Rounded-top bar path anchored to the baseline (4px data end). */
function bar(x: number, y0: number, y1: number, w: number) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const r = Math.min(4, h, w / 2);
  const up = y1 < y0;
  return up
    ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z`
    : `M${x},${y0} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + w - r} Q${x + w},${top + h} ${x + w},${top + h - r} V${y0} Z`;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
};

function Tooltip({ x, children }: { x: number; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-44 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
      style={{ left: `clamp(5.5rem, ${x}%, calc(100% - 5.5rem))` }}
    >
      {children}
    </div>
  );
}

/** Cash expected at the end of each week (one series; shortfalls marked). */
export function CashForecastChart({ rows, currency }: { rows: { start: string; inflow: number; outflow: number; cash: number }[]; currency: string }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const m = (c: number) => formatMoney(c / 100, currency, t.intl);
  const W = 640;
  const H = 200;
  const pad = { top: 12, bottom: 24, left: 4, right: 4 };
  const max = niceMax(Math.max(...rows.map((r) => r.cash), 0));
  const min = Math.min(...rows.map((r) => r.cash), 0);
  const lo = min < 0 ? -niceMax(-min) : 0;
  const y = (v: number) => pad.top + ((max - v) / (max - lo)) * (H - pad.top - pad.bottom);
  const step = (W - pad.left - pad.right) / rows.length;
  const bw = Math.min(36, step - 6);
  const h = hover !== null ? rows[hover] : null;
  return (
    <figure className="grid gap-2">
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label={t("Cash expected at the end of each of the next {weeks} weeks", { weeks: rows.length })}>
          {[max, max / 2, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-border" : "stroke-border/50"} strokeDasharray={v === 0 ? undefined : "2 4"} />
            </g>
          ))}
          {rows.map((r, i) => {
            const x = pad.left + i * step + (step - bw) / 2;
            const short = r.cash < 0;
            return (
              <g key={r.start}>
                <path d={bar(x, y(0), y(r.cash), bw)} className={cn(short ? "fill-destructive" : INCOME, hover !== null && hover !== i && "opacity-40", "transition-opacity")} />
                <rect
                  x={pad.left + i * step}
                  y={0}
                  width={step}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatDate(r.start, t.intl)}: ${m(r.cash)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="cursor-default outline-none focus-visible:stroke-ring focus-visible:stroke-2"
                />
                {(i === 0 || i % 3 === 0) && (
                  <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {new Date(r.start).toLocaleDateString(t.intl, { day: "numeric", month: "short" })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <Tooltip x={((hover + 0.5) / rows.length) * 100}>
            <p className="font-semibold">{t("Week of {date}", { date: formatDate(h.start, t.intl) })}</p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("Coming in")}</span>
              <span className="tabular-nums">{m(h.inflow)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("Going out")}</span>
              <span className="tabular-nums">{m(h.outflow)}</span>
            </p>
            <p className={cn("mt-1 flex justify-between gap-4 border-t pt-1 font-semibold", h.cash < 0 && "text-destructive")}>
              <span>{h.cash < 0 ? t("Short by") : t("Cash at week end")}</span>
              <span className="tabular-nums">{m(Math.abs(h.cash))}</span>
            </p>
          </Tooltip>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("Show as table")}</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-start font-medium">{t("Week of")}</th>
              <th className="py-1 text-end font-medium">{t("Coming in")}</th>
              <th className="py-1 text-end font-medium">{t("Going out")}</th>
              <th className="py-1 text-end font-medium">{t("Cash at week end")}</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {rows.map((r) => (
              <tr key={r.start} className="border-t">
                <td className="py-1">{formatDate(r.start, t.intl)}</td>
                <td className="py-1 text-end tabular-nums">{m(r.inflow)}</td>
                <td className="py-1 text-end tabular-nums">{m(r.outflow)}</td>
                <td className={cn("py-1 text-end tabular-nums", r.cash < 0 && "font-semibold text-destructive")}>
                  {r.cash < 0 && <AlertTriangle className="me-1 inline size-3" aria-hidden />}
                  {m(r.cash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Income and costs per month, side by side (two series, legend + table). */
export function IncomeCostChart({ months, currency }: { months: { month: string; income: number; costs: number }[]; currency: string }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const m = (c: number) => formatMoney(c / 100, currency, t.intl);
  const W = 640;
  const H = 200;
  const pad = { top: 12, bottom: 24, left: 4, right: 4 };
  const max = niceMax(Math.max(...months.flatMap((x) => [x.income, x.costs]), 0));
  const y = (v: number) => pad.top + ((max - v) / max) * (H - pad.top - pad.bottom);
  const step = (W - pad.left - pad.right) / months.length;
  const bw = Math.min(26, (step - 14) / 2);
  const label = (mo: string) => new Date(Number(mo.slice(0, 4)), Number(mo.slice(5)) - 1, 1).toLocaleDateString(t.intl, { month: "short" });
  const h = hover !== null ? months[hover] : null;
  return (
    <figure className="grid gap-2">
      <ul className="flex gap-4 text-xs text-muted-foreground" aria-label={t("Legend")}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", INCOME_BG)} />
          {t("Income")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", COSTS_BG)} />
          {t("Costs")}
        </li>
      </ul>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label={t("Income and costs for the last {count} months", { count: months.length })}>
          {[max, max / 2].map((v) => (
            <line key={v} x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="stroke-border/50" strokeDasharray="2 4" />
          ))}
          <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} className="stroke-border" />
          {months.map((mo, i) => {
            const x = pad.left + i * step + (step - (bw * 2 + 2)) / 2;
            const dim = hover !== null && hover !== i && "opacity-40";
            return (
              <g key={mo.month}>
                <path d={bar(x, y(0), y(mo.income), bw)} className={cn(INCOME, dim, "transition-opacity")} />
                <path d={bar(x + bw + 2, y(0), y(mo.costs), bw)} className={cn(COSTS, dim, "transition-opacity")} />
                <rect
                  x={pad.left + i * step}
                  y={0}
                  width={step}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${label(mo.month)}: ${t("Income")} ${m(mo.income)}, ${t("Costs")} ${m(mo.costs)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
                />
                <text x={pad.left + i * step + step / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {label(mo.month)}
                </text>
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <Tooltip x={((hover + 0.5) / months.length) * 100}>
            <p className="font-semibold">{new Date(Number(h.month.slice(0, 4)), Number(h.month.slice(5)) - 1, 1).toLocaleDateString(t.intl, { month: "long", year: "numeric" })}</p>
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className={cn("size-2 rounded-sm", INCOME_BG)} />
                {t("Income")}
              </span>
              <span className="tabular-nums">{m(h.income)}</span>
            </p>
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className={cn("size-2 rounded-sm", COSTS_BG)} />
                {t("Costs")}
              </span>
              <span className="tabular-nums">{m(h.costs)}</span>
            </p>
            <p className={cn("mt-1 flex justify-between gap-4 border-t pt-1 font-semibold", h.income - h.costs < 0 && "text-destructive")}>
              <span>{h.income - h.costs < 0 ? t("Loss") : t("Profit")}</span>
              <span className="tabular-nums">{m(Math.abs(h.income - h.costs))}</span>
            </p>
          </Tooltip>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("Show as table")}</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr>
              <th className="py-1 text-start font-medium">{t("Month")}</th>
              <th className="py-1 text-end font-medium">{t("Income")}</th>
              <th className="py-1 text-end font-medium">{t("Costs")}</th>
              <th className="py-1 text-end font-medium">{t("Profit")}</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {months.map((mo) => (
              <tr key={mo.month} className="border-t">
                <td className="py-1">{label(mo.month)}</td>
                <td className="py-1 text-end tabular-nums">{m(mo.income)}</td>
                <td className="py-1 text-end tabular-nums">{m(mo.costs)}</td>
                <td className={cn("py-1 text-end tabular-nums", mo.income - mo.costs < 0 && "text-destructive")}>{m(mo.income - mo.costs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
