import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page building blocks in the dashboard's style (brand/README.md): one header per page with a
 * graphite icon tile, rounded-2xl panels, stat tiles and friendly empty states. Server-safe.
 */

/** The page's padding and vertical rhythm. */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid w-full grid-cols-1 content-start gap-6 px-4 py-6 sm:px-6 lg:py-8", className)}>{children}</div>;
}

/** The graphite brand tile with a white icon (a hairline lifts it off dark cards). */
export function GradientIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-md shadow-brand/25 dark:shadow-black/30 dark:ring-1 dark:ring-white/10",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * The brand band (brand/README.md "Graphite band"): graphite, a faint dot grid, a soft coral glow and a
 * quiet light one. White text on it is 14.8 : 1 in light and dark. The dashboard hero and every page header.
 */
export function BrandBand({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-brand text-white", className)}>
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.14] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      <div aria-hidden className="absolute -top-24 -z-10 size-80 rounded-full bg-brand-accent/20 blur-3xl inset-e-[-5rem]" />
      <div aria-hidden className="absolute -bottom-32 -z-10 size-96 rounded-full bg-white/[0.06] blur-3xl inset-s-[-6rem]" />
      {children}
    </div>
  );
}

/**
 * Buttons placed on the band: the solid one turns white, outline and ghost ones turn glassy, so
 * every action stays readable on the band without each page restyling it.
 */
export const ON_BAND =
  "[&_[data-variant=default]]:bg-white [&_[data-variant=default]]:text-brand [&_[data-variant=default]]:shadow-sm [&_[data-variant=default]:hover]:bg-white/90 " +
  "[&_[data-variant=outline]]:border-white/25 [&_[data-variant=outline]]:bg-white/10 [&_[data-variant=outline]]:text-white [&_[data-variant=outline]:hover]:bg-white/20 [&_[data-variant=outline]:hover]:text-white " +
  "[&_[data-variant=ghost]]:text-white [&_[data-variant=ghost]:hover]:bg-white/15 [&_[data-variant=ghost]:hover]:text-white " +
  "[&_[data-variant=secondary]]:bg-white/15 [&_[data-variant=secondary]]:text-white [&_[data-variant=secondary]:hover]:bg-white/25 " +
  "[&_[data-variant=destructive]]:bg-white [&_[data-variant=destructive]]:text-destructive [&_[data-variant=destructive]:hover]:bg-white/90 " +
  // Fields keep their own (card) text colour; quiet text turns translucent white.
  "[&_input]:text-foreground [&_select]:text-foreground [&_.text-muted-foreground]:text-white/80";

/** A pill on the band (a status, a kind): white, dark text, so its own colours never clash with the band. */
export const BAND_PILL = "bg-white text-brand shadow-sm dark:text-brand";

/** A white icon on a glassy tile, for the band. */
export function BandIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white shadow-lg shadow-black/10 ring-1 ring-white/25 backdrop-blur-sm", className)}>
      <Icon className="size-6" />
    </span>
  );
}

/** Title band in the dashboard's style: icon, title and a short description; actions sit at the end. */
export function PageHeader({
  children,
  ...band
}: React.ComponentProps<typeof BandHeading> & {
  /** The section tabs, in a white strip under the band. */
  children?: React.ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-2xl bg-card shadow-lg shadow-brand/15 ring-1 ring-border dark:shadow-black/30">
      <BandHeading {...band} />
      {children && <div className="px-3 py-2 sm:px-4">{children}</div>}
    </header>
  );
}

/** The band with an icon (or any leading mark), a title, a line under it and actions. */
export function BandHeading({
  icon,
  mark,
  back,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  /** Replaces the icon tile: an avatar, initials, a project key. */
  mark?: React.ReactNode;
  /** The page this one belongs to, shown as a small link above the title. */
  back?: { href: string; label: React.ReactNode };
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <BrandBand className={className}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6 sm:py-7">
        <div className="flex min-w-0 items-center gap-4">
          {mark ?? (icon && <BandIcon icon={icon} />)}
          <div className="min-w-0">
            {back && (
              <Link href={back.href} className="mb-1 inline-flex w-fit items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white">
                <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                {back.label}
              </Link>
            )}
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
            {description && <div className="mt-1 text-sm text-white/85 sm:text-base">{description}</div>}
          </div>
        </div>
        {actions && <div className={cn("flex flex-wrap items-center gap-2", ON_BAND)}>{actions}</div>}
      </div>
    </BrandBand>
  );
}

/** A card with a title row. */
export function Panel({
  title,
  icon: Icon,
  action,
  className,
  children,
  id,
  count,
  tone,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  id: string;
  count?: number;
  tone?: "danger";
}) {
  return (
    <section aria-labelledby={id} className={cn("overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 id={id} className={cn("flex items-center gap-2 font-semibold", tone === "danger" && "text-destructive")}>
          {Icon && <Icon className={cn("size-4", tone === "danger" ? "text-destructive" : "text-muted-foreground")} aria-hidden />}
          {title}
          {count !== undefined && (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone === "danger" ? "bg-destructive/10" : "bg-muted text-muted-foreground")}>
              {count.toLocaleString()}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  default: { chip: "bg-primary/10 text-primary", value: "text-foreground", bar: "bg-primary" },
  bad: { chip: "bg-destructive/10 text-destructive", value: "text-destructive", bar: "bg-destructive" },
  good: { chip: "bg-green-600/10 text-green-700 dark:text-green-400", value: "text-foreground", bar: "bg-green-600" },
} as const;
export type Tone = keyof typeof TONES;

/** A headline number with an icon chip, a hint and (optionally) its share of a whole. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  share,
  shareLabel,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  /** 0–1: e.g. projects behind out of open projects. */
  share?: number;
  shareLabel?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <span aria-hidden className={cn("grid size-9 place-items-center rounded-xl", t.chip)}>
          <Icon className="size-4.5" />
        </span>
      </div>
      <dd className={cn("mt-2 text-4xl font-bold tracking-tight tabular-nums", t.value)}>{typeof value === "number" ? value.toLocaleString() : value}</dd>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {share !== undefined && (
        <div
          role="meter"
          aria-label={shareLabel}
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.min(100, Math.max(share > 0 ? 4 : 0, share * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

/** A small count with a label, used in summary rows under a page header. */
export function SummaryChip({ label, value, tone = "default", icon: Icon }: { label: string; value: number; tone?: Tone; icon?: LucideIcon }) {
  const t = TONES[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-sm">
      {Icon && (
        <span aria-hidden className={cn("grid size-6 place-items-center rounded-lg", t.chip)}>
          <Icon className="size-3.5" />
        </span>
      )}
      <span className={cn("font-bold tabular-nums", tone === "bad" && value > 0 && "text-destructive")}>{value.toLocaleString()}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/** Nothing here yet: a soft brand-tinted icon, a sentence and (optionally) the next step. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate flex flex-col items-center overflow-hidden rounded-2xl border border-dashed bg-card px-6 py-14 text-center", className)}>
      <div aria-hidden className="absolute -top-16 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <span aria-hidden className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5">
        <Icon className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
