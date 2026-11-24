import type { Metadata } from "next";
import { Manrope, Readex_Pro, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { dirOf } from "@/i18n/config";
import { dictionaryFor, getLocale } from "@/i18n/server";
import "./globals.css";

// tamm identity (brand/README.md): Manrope for Latin text and digits…
const sans = Manrope({
  variable: "--font-latin",
  subsets: ["latin"],
});

// …and Readex Pro for Arabic letters (Latin text and digits keep Manrope).
const arabic = Readex_Pro({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "tamm", template: "%s · tamm" },
  description: "Project management · تمّ",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${sans.variable} ${arabic.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers locale={locale} dict={dictionaryFor(locale)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
