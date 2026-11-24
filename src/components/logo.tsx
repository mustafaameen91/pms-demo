import { cn } from "@/lib/utils";

/**
 * The tamm mark: a T whose stem bends into a check mark, on a rounded square.
 * Same drawing as brand/logo/tamm-mark.svg. On dark surfaces the tile turns white and the bar
 * graphite (brand/logo/tamm-mark-on-dark.svg); `onDark` forces that look, e.g. on graphite bands.
 */
export function LogoMark({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="40" height="40" rx="10" className={onDark ? "fill-white" : "fill-[#1f2933] dark:fill-white"} />
      <path
        d="M11 13H29"
        fill="none"
        strokeWidth="4.5"
        strokeLinecap="round"
        className={onDark ? "stroke-[#1f2933]" : "stroke-white dark:stroke-[#1f2933]"}
      />
      <path d="M20 13v11l4.5 4.5" fill="none" stroke="#f2545b" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + wordmark: lowercase "tamm", or تمّ on Arabic pages. */
export function Logo({ className, compact, onDark }: { className?: string; compact?: boolean; onDark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="tamm" role="img">
      <LogoMark onDark={onDark} />
      {!compact && (
        <span aria-hidden className="text-xl leading-none font-extrabold tracking-[-0.02em] rtl:font-semibold rtl:tracking-normal">
          <span className="rtl:hidden">tamm</span>
          <span className="ltr:hidden">تمّ</span>
        </span>
      )}
    </span>
  );
}
