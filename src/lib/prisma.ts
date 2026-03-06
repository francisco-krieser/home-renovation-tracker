import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { basePrisma: PrismaClient | undefined };

// Raw client — use only when you explicitly need to query soft-deleted records
export const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.basePrisma = basePrisma;
}

// Extended client — findFirst and findMany on job and user auto-filter deletedAt: null
export const prisma = basePrisma.$extends({
  query: {
    job: {
      findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
    },
    user: {
      findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
    },
  },
});

// Transaction client type for the extended prisma — use this in repository Client types
// instead of Prisma.TransactionClient so it matches what prisma.$transaction() yields
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Named Prisma error codes — extend as needed
export const PRISMA_ERROR = {
  UNIQUE_CONSTRAINT_VIOLATION: "P2002",
  RECORD_NOT_FOUND: "P2025",
} as const;

export default prisma;
