import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Vercel already supplies HSTS. These are the ones it does not: stop the browser
 * sniffing a content type, stop the app being framed, and keep referrers off
 * third parties. The permissions policy denies capabilities this app has no use
 * for, so a compromised dependency cannot quietly reach for them.
 *
 * No CSP yet. Next injects inline scripts for hydration and the theme boot
 * script is inline by design, so a correct policy needs nonce plumbing — worth
 * doing, but not worth shipping half of.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
