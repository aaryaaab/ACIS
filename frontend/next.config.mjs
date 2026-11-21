// BACKEND_URL and CSP_REPORT_ONLY are read when the app is BUILT (Next bakes rewrites and headers into the build).
// In Docker they are build arguments. Neither is a secret.
const backend = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const isProd = process.env.NODE_ENV === "production";

// Content Security Policy. 'unsafe-inline' is needed because Next.js writes small inline scripts and the charts use inline styles.
// Everything else is locked to this website. All API calls go to the same origin through /api.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The voice journal needs the microphone on this site only.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=()" },
  ...(isProd ? [{ key: process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",                      // a small self-contained server for the Docker image
  async rewrites() {
    // The browser only ever talks to this website. /api/* is forwarded to the backend, so the login cookie is first-party.
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
