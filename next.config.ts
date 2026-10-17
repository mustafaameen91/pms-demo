import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Receipts are uploaded through a Server Action (max 8 MB file, see lib/uploads.ts).
    // Proxy buffers request bodies up to 10 MB by default, so stay within that.
    serverActions: { bodySizeLimit: "10mb" },
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
