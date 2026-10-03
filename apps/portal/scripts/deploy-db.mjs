// Runs before `next build` on Vercel: brings this environment's database (its own DATABASE_URL: dev previews the
// dev database, production the production one) up to the schema, the same as `npm run db:push` by hand:
// indexes, the partial unique indexes and null backfill (packages/db/scripts/after-push.ts), then readable IDs.
// If it fails the build fails, so the new code never goes live on a database it doesn't match; the old version
// stays live. A change db push can't apply safely (e.g. a new unique index on duplicate data) fails here too:
// fix the data and redeploy. Seed data is not touched (npm run db:seed stays a one-off, by hand).
//
// Off the Vercel build (a local `npm run build`) it does nothing. SKIP_DB_PUSH=1 skips it in an emergency.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL) {
  console.log("deploy-db: not a Vercel build, database left alone");
  process.exit(0);
}
if (process.env.SKIP_DB_PUSH === "1") {
  console.log("deploy-db: SKIP_DB_PUSH=1, database left alone");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error(`deploy-db: DATABASE_URL is not set for the ${process.env.VERCEL_ENV ?? "?"} environment`);
  process.exit(1);
}

// Which database, without the password, for the build log.
const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") || "(default)";
  } catch {
    return "(unreadable URL)";
  }
})();
console.log(`deploy-db: updating the ${process.env.VERCEL_ENV ?? "?"} database "${dbName}"`);

const root = fileURLToPath(new URL("../../../", import.meta.url));
execSync("npm run db:push", { cwd: root, stdio: "inherit" });
console.log("deploy-db: done");
