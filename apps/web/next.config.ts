import type { NextConfig } from "next";

// Security headers, mainly for hosted access (docs/hosting.md). The CSP is production-only
// because the dev server needs eval for hot reload.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // same origin when hosted; the local API port when opened on this computer
  "connect-src 'self' http://127.0.0.1:4317",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  transpilePackages: ["@agent-town/core", "@agent-town/pixel-office"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [{ source: "/:path*", headers: process.env.NODE_ENV === "production" ? [...base, { key: "Content-Security-Policy", value: csp }] : base }];
  },
};

export default config;
