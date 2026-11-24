/**
 * Forces the light palette for pages that must look the same for everyone and on
 * paper (client view, printed reports), whatever theme the viewer uses.
 */
export function LightTheme({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`report-light min-h-dvh w-full bg-background text-foreground ${className ?? ""}`}>
      <style>{`
        .report-light {
          /* tamm's light palette (same as :root in globals.css), a touch darker for paper. */
          --background: #ffffff; --foreground: #1f2933;
          --card: #ffffff; --card-foreground: #1f2933;
          --muted: #f3f4f6; --muted-foreground: #4a5663;
          --accent: #eceef1; --accent-foreground: #1f2933;
          --border: #dde1e6; --input: #d5d9df;
          --primary: #1f2933; --primary-foreground: #ffffff; --ring: #52606d;
          --brand: #1f2933; --brand-foreground: #ffffff; --brand-accent: #f2545b; --brand-accent-text: #c93841; --brand-tint: #fde2e3;
          --destructive: #b42318; color-scheme: light;
        }
        @media print { html, body { background: white !important; } }
      `}</style>
      {children}
    </div>
  );
}
