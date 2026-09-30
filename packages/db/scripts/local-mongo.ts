// Local MongoDB for development (no Docker or admin install needed).
//
//   npm run db:local            (from the repo root; keep it running in its own terminal)
//
// - Downloads a mongod binary on first run (cached in ~/.cache/mongodb-binaries).
// - Runs a single-node replica set, because Prisma needs one for transactions.
// - Keeps data in <repo>/.mongo-data, so it survives restarts (ignored by git).
// - Matching .env line:
//     DATABASE_URL="mongodb://127.0.0.1:27017/genclover?replicaSet=rs0&directConnection=true"
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = Number(process.env.LOCAL_MONGO_PORT ?? 27017);
const dbPath = path.resolve(__dirname, "../../../.mongo-data");
mkdirSync(dbPath, { recursive: true });

async function main() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, dbPath, ip: "127.0.0.1" }],
  });
  console.log(`Local MongoDB ready on 127.0.0.1:${PORT} (replica set rs0), data in ${dbPath}`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    // doCleanup: false keeps the data folder.
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  if (/DBPathInUse|EADDRINUSE|already in use/i.test(String(e))) {
    console.error(`Local MongoDB is already running (port ${PORT} or ${dbPath} is in use). Use that one, or stop it first.`);
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
