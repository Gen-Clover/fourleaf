import { PrismaClient } from "@prisma/client";
import { sqlNulls } from "./sql-nulls";

export { Prisma } from "@prisma/client";
export type * from "@prisma/client";

function createClient() {
  // Interactive transactions run several round trips to MongoDB Atlas: allow for network latency.
  return new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 20_000 } }).$extends(sqlNulls);
}

export type DbClient = ReturnType<typeof createClient>;
/** The client handed to `prisma.$transaction(async (tx) => …)` callbacks. */
export type Tx = Parameters<Parameters<DbClient["$transaction"]>[0]>[0];

const globalForPrisma = globalThis as unknown as { prisma?: DbClient };

export const prisma = globalForPrisma.prisma ?? createClient();

// Reuse one client (and its MongoDB connection pool) across hot reloads in dev.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
