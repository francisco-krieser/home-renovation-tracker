import { JobHistory, JobStatus, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import prisma, { TransactionClient } from "../../lib/prisma";

type Client = TransactionClient | typeof prisma;

export interface CreateHistoryEntryData {
  jobId: string;
  version: number;
  description: string;
  address: string;
  status: JobStatus;
  cost: Decimal;
  changedById: string;
}

export interface IJobHistoryRepository {
  createEntry(data: CreateHistoryEntryData, tx?: Client): Promise<JobHistory>;
  findByJobId(jobId: string, tx?: Client): Promise<JobHistory[]>;
  findByVersion(jobId: string, version: number, tx?: Client): Promise<JobHistory | null>;
  deleteAfterVersion(jobId: string, version: number, tx?: Client): Promise<Prisma.BatchPayload>;
}

export class JobHistoryRepository implements IJobHistoryRepository {
  createEntry(data: CreateHistoryEntryData, tx: Client = prisma) {
    return tx.jobHistory.create({ data });
  }

  findByJobId(jobId: string, tx: Client = prisma) {
    return tx.jobHistory.findMany({
      where: { jobId },
      orderBy: { version: "asc" },
    });
  }

  findByVersion(jobId: string, version: number, tx: Client = prisma) {
    return tx.jobHistory.findFirst({ where: { jobId, version } });
  }

  deleteAfterVersion(jobId: string, version: number, tx: Client = prisma) {
    return tx.jobHistory.deleteMany({
      where: { jobId, version: { gt: version } },
    });
  }
}

export const jobHistoryRepository = new JobHistoryRepository();
