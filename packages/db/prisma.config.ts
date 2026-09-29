import path from "node:path";
import { defineConfig } from "prisma/config";

// One .env for the whole repo, at its root. Variables already set win.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // No .env file: rely on the environment.
}

export default defineConfig({
  // Multi-file schema: core.prisma (shared tables) + one file per tool.
  schema: path.join("prisma", "schema"),
  migrations: { seed: "tsx prisma/seed.ts" },
});
