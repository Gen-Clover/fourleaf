import type { NextConfig } from "next";
import path from "node:path";

// One .env for the whole repo, at its root. Variables already set (e.g. by the host) win.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // No .env file: rely on the environment (production hosts).
}

const nextConfig: NextConfig = {};

export default nextConfig;
