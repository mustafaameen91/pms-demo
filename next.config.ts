import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Files are uploaded through Server Actions: receipts up to 8 MB, project files
    // (drawings, scans) up to 25 MB — see lib/uploads.ts. The proxy buffers request
    // bodies too, so both limits leave room for the 25 MB file plus the form around it.
    serverActions: { bodySizeLimit: "30mb" },
    proxyClientMaxBodySize: "30mb",
  },
  // Cache Components is off: nearly every page is per-user/per-workspace,
  // so pages render dynamically on each request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
