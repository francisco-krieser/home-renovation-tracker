import { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { basePrisma } from "../../lib/prisma";
import { env } from "../../config/env";

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function signToken(userId: string, role: Role): string {
  return jwt.sign({ userId, role }, env.JWT_SECRET, { expiresIn: "1h" });
}

// ── Database reset ────────────────────────────────────────────────────────────

/** Wipe all rows between tests. Cascade handles FK ordering automatically. */
export async function truncateAll(): Promise<void> {
  await basePrisma.$executeRawUnsafe("TRUNCATE TABLE messages, jobs, users CASCADE");
}

// ── Fixture creators ──────────────────────────────────────────────────────────

export async function createContractor(overrides: { name?: string; email?: string } = {}) {
  return basePrisma.user.create({
    data: {
      name: overrides.name ?? "Test Contractor",
      // Timestamp suffix keeps emails unique without needing an external UUID lib
      email: overrides.email ?? `contractor-${Date.now()}-${Math.random()}@test.com`,
      role: Role.CONTRACTOR,
    },
  });
}

export async function createJob(
  contractorId: string,
  overrides: { description?: string; address?: string; cost?: number } = {},
) {
  return basePrisma.job.create({
    data: {
      contractorId,
      description: overrides.description ?? "Test renovation job",
      address: overrides.address ?? "123 Test Street",
      cost: overrides.cost ?? 5000,
    },
  });
}

/**
 * Create a HOMEOWNER user and assign them to a job directly via Prisma.
 * This is the fixture path; the resolver path is tested via addHomeowner mutation.
 */
export async function assignHomeowner(
  jobId: string,
  overrides: { name?: string; email?: string } = {},
) {
  const homeowner = await basePrisma.user.create({
    data: {
      name: overrides.name ?? "Test Homeowner",
      email: overrides.email ?? `homeowner-${Date.now()}-${Math.random()}@test.com`,
      role: Role.HOMEOWNER,
    },
  });
  // basePrisma.job.update bypasses the soft-delete extension (which only adds
  // deletedAt filters to findFirst/findMany) so it works correctly here.
  await basePrisma.job.update({
    where: { id: jobId },
    data: { homeownerId: homeowner.id },
  });
  return homeowner;
}

export async function softDeleteUser(userId: string) {
  await basePrisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });
}
