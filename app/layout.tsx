import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { copy } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: copy.app.name,
};

/**
 * Runs before first paint so the correct theme class is on <html> when the
 * first frame lands. Without this the page flashes the default theme on every
 * cold load. Dark is the default; anything unreadable in storage falls back.
 */
const themeScript = `
try {
  var t = localStorage.getItem('kua-theme');
  document.documentElement.classList.add(t === 'light' ? 'light' : 'dark');
} catch (e) {
  document.documentElement.classList.add('dark');
}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // lang matters for screen readers and for the browser's own date inputs
    <html
      lang="fr-CA"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
