import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { copy } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: copy.app.name,
  description: copy.app.description,
  // a private tool: never index it, whatever robots.txt says
  robots: { index: false, follow: false },
  manifest: "/site.webmanifest",
  appleWebApp: { capable: true, title: copy.app.name },
};

/**
 * viewport-fit=cover is what makes env(safe-area-inset-*) mean anything, which
 * the mobile bar depends on. themeColor matches the two grounds so the browser
 * chrome does not sit as a bright band above a near-black app.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
