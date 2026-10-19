import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { dirOf } from "@/i18n/config";
import { dictionaryFor, getLocale } from "@/i18n/server";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
});

// Arabic letters fall back to this; Latin text and digits keep Plus Jakarta Sans.
const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "PMS", template: "%s · PMS" },
  description: "Project management for teams",
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
