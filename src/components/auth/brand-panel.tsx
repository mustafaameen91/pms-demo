import { cn } from "@/lib/utils";

/** The graphite band of the tamm identity ("logo on dark"); a hairline keeps it apart from the dark page. */
const BAND = "bg-brand dark:ring-1 dark:ring-white/10";

/** Faint dot grid, a soft coral glow (the check mark's colour) and a quiet light one, over graphite. */
function Texture() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.14] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      <div aria-hidden className="absolute -top-24 -z-10 size-80 rounded-full bg-brand-accent/20 blur-3xl inset-e-[-5rem]" />
      <div aria-hidden className="absolute -bottom-32 -z-10 size-96 rounded-full bg-white/[0.06] blur-3xl inset-s-[-6rem]" />
    </>
  );
}

/** The sign-in side panel: graphite, white text (14.8 : 1). */
export function BrandPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside className={cn("relative isolate flex-col justify-between gap-10 overflow-hidden p-10 text-white lg:p-14", BAND, className)}>
      <Texture />
      {children}
    </aside>
  );
}

/** Pages outside the app (onboarding, invitations, client links, request forms): a brand band
 *  across the top with the content card overlapping it. */
export function BrandBackdrop({ children, band, className }: { children: React.ReactNode; band?: React.ReactNode; className?: string }) {
  return (
    <main className={cn("relative min-h-dvh bg-muted/40", className)}>
      <div className={cn("relative isolate overflow-hidden text-white", BAND)}>
        <Texture />
        <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-28 sm:px-6">{band}</div>
      </div>
      <div className="relative mx-auto -mt-20 w-full max-w-5xl px-4 pb-12 sm:px-6">{children}</div>
    </main>
  );
}
