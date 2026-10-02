import type { NextConfig } from "next";
import path from "node:path";

// One .env for the whole repo, at its root. Variables already set (e.g. by the host) win.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // No .env file: rely on the environment (production hosts).
}

const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  // Tools and shared packages are TypeScript source in the workspace: compile them with the app.
  transpilePackages: ["@genclover/auth", "@genclover/clients", "@genclover/db", "@genclover/delivery", "@genclover/finance", "@genclover/governance", "@genclover/ids", "@genclover/lead-finder", "@genclover/people", "@genclover/ui"],
  // Prisma's engine must stay a runtime dependency, not be bundled.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  experimental: {
    // Only load the parts of big libraries a page actually uses (faster dev compiles and smaller bundles).
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
