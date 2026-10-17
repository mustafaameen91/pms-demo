import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 4h4M3 8h7M3 12h10" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && <span className="text-lg">PMS</span>}
    </span>
  );
}
