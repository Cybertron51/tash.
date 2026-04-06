import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Lock the app root to this folder (Ledger), not a parent lockfile (e.g. ~/package-lock.json).
 * Without this, Next infers rootDir = ~ and PostCSS/Tailwind resolve from the wrong node_modules.
 */
const dirOfConfig = path.dirname(fileURLToPath(import.meta.url));
const appRoot = fs.existsSync(path.join(dirOfConfig, "package.json"))
  ? path.resolve(dirOfConfig)
  : path.resolve(process.cwd());

const nextConfig: NextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
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
    /** Cap Turbopack RAM when using `npm run dev:turbo` (bytes). Helps avoid swapping the whole machine. */
    ...(isDev ? { turbopackMemoryLimit: 2 * 1024 * 1024 * 1024 } : {}),
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
