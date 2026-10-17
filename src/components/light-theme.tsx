/**
 * Forces the light palette for pages that must look the same for everyone and on
 * paper (client view, printed reports), whatever theme the viewer uses.
 */
export function LightTheme({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`report-light min-h-dvh w-full bg-background text-foreground ${className ?? ""}`}>
      <style>{`
        .report-light {
          --background: oklch(1 0 0); --foreground: oklch(0.21 0.02 230);
          --card: oklch(1 0 0); --muted: oklch(0.965 0.006 200);
          --muted-foreground: oklch(0.45 0.02 230); --border: oklch(0.88 0.008 210);
          --primary: oklch(0.511 0.086 186.4); --primary-foreground: oklch(0.99 0 0);
          --destructive: oklch(0.55 0.22 27); color-scheme: light;
        }
        @media print { html, body { background: white !important; } }
      `}</style>
      {children}
    </div>
  );
}
