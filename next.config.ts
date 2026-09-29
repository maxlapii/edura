import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  typescript: { ignoreBuildErrors: false },
  // The floating dev badge covers the sidebar's bottom controls; errors still show in the overlay.
  devIndicators: false,
};

export default nextConfig;
