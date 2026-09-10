import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Vercel already supplies HSTS. These are the ones it does not: stop the browser
 * sniffing a content type, stop the app being framed, and keep referrers off
 * third parties. The permissions policy denies capabilities this app has no use
 * for, so a compromised dependency cannot quietly reach for them.
 *
 * The CSP is not here. It needs a fresh nonce per request, which a static
 * header table cannot produce, so it is built in the middleware — see
 * `lib/csp.ts`. `X-Frame-Options` below and the policy's `frame-ancestors`
 * say the same thing to browsers of different ages.
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
