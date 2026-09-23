import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

// Env lives in the monorepo root .env (shared with the other services);
// Next.js only reads .env files from the app directory by default, and caches
// that result — forceReload so the root files are actually read.
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
