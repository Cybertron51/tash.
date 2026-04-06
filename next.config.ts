import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Pokémon TCG API — official card artwork
        protocol: "https",
        hostname: "images.pokemontcg.io",
        pathname: "/**",
      },
    ],
  },
  productionBrowserSourceMaps: false,
  experimental: {
    // Slightly slower compiles, lower webpack heap (e.g. `next build --webpack`)
    webpackMemoryOptimizations: true,
    ...(isDev ? { turbopackSourceMaps: false } : {}),
  },
  ...(isDev
    ? {
        // Drop the default ~50MB in-memory ISR/data cache while developing locally
        cacheMaxMemorySize: 0,
        // Evict compiled routes sooner and keep fewer in memory than the 60s / 5-page defaults
        onDemandEntries: {
          maxInactiveAge: 30_000,
          pagesBufferLength: 2,
        },
      }
    : {}),
};

export default nextConfig;
