import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
