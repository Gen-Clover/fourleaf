// One-off for databases created before October 2026: activates the final allocation and adds the
// expense subcategories (prisma/allocation.ts). Safe to re-run. Run: npm run allocation -w @genclover/db
import { applyFinalAllocation } from "../prisma/allocation";
import { prisma } from "../src/index";

applyFinalAllocation(prisma, console.log)
  .then(() => console.log("Allocation checked."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
