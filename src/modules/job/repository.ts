import { Job, JobStatus, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import prisma, { TransactionClient } from "../../lib/prisma";

type Client = TransactionClient | typeof prisma;

export type JobQuery = Pick<Prisma.JobFindFirstArgs, "include" | "select">;

export interface UpdateJobData {
  description?: string;
  address?: string;
  status?: JobStatus;
  cost?: Decimal;
  currentVersion: number;
}

export interface IJobRepository {
  findAllByContractorId(contractorId: string, tx?: Client, query?: JobQuery): Promise<Job[]>;
  findById(id: string, tx?: Client, query?: JobQuery): Promise<Job | null>;
  create(
    data: { contractorId: string; description: string; address: string; cost: Decimal },
    tx?: Client,
    query?: JobQuery,
  ): Promise<Job>;
  update(
    id: string,
    expectedCurrentVersion: number,
    data: UpdateJobData,
    tx?: Client,
    query?: JobQuery,
  ): Promise<Job | null>;
  assignHomeowner(jobId: string, homeownerId: string, tx?: Client): Promise<{ count: number }>;
  softDelete(id: string, tx?: Client): Promise<{ count: number }>;
}

export class JobRepository implements IJobRepository {
  findAllByContractorId(contractorId: string, tx: Client = prisma, query: JobQuery = {}) {
    return tx.job.findMany({
      ...query,
      where: { contractorId },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string, tx: Client = prisma, query: JobQuery = {}) {
    return tx.job.findFirst({
      ...query,
      where: { id },
    });
  }

  create(
    data: { contractorId: string; description: string; address: string; cost: Decimal },
    tx: Client = prisma,
    query: JobQuery = {},
  ) {
    return tx.job.create({ ...query, data });
  }

  async update(
    id: string,
    expectedCurrentVersion: number,
    data: UpdateJobData,
    tx: Client = prisma,
    query: JobQuery = {},
  ): Promise<Job | null> {
    const { count } = await tx.job.updateMany({
      where: { id, deletedAt: null, currentVersion: expectedCurrentVersion },
      data,
    });
    if (count === 0) return null;
    return tx.job.findFirst({ ...query, where: { id } });
  }

  assignHomeowner(jobId: string, homeownerId: string, tx: Client = prisma) {
    return tx.job.updateMany({
      where: { id: jobId, deletedAt: null, homeownerId: null },
      data: { homeownerId },
    });
  }

  softDelete(id: string, tx: Client = prisma) {
    return tx.job.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}

export const jobRepository = new JobRepository();
