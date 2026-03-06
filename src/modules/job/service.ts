import { JobStatus, Prisma, Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import prisma, { PRISMA_ERROR } from "../../lib/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/appErrors";
import { CurrentUser } from "../../context";
import { IJobRepository, JobQuery } from "./repository";
import { IUserRepository } from "../user/repository";

export interface CreateJobInput {
  description: string;
  address: string;
  cost: Decimal;
}

export interface UpdateJobInput {
  description?: string | null;
  address?: string | null;
  status?: JobStatus | null;
  cost?: Decimal | null;
}

export interface AddHomeownerInput {
  name: string;
  email: string;
}

type JobOwnership = { contractorId: string; homeownerId: string | null };

export class JobService {
  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  private assertJobAccess(job: JobOwnership, currentUser: CurrentUser): void {
    if (currentUser.role === Role.CONTRACTOR) {
      if (job.contractorId !== currentUser.userId) throw new ForbiddenError();
    } else {
      if (job.homeownerId !== currentUser.userId) throw new ForbiddenError();
    }
  }

  listContractorJobs(currentUser: CurrentUser, query: JobQuery = {}) {
    return this.jobRepo.findAllByContractorId(currentUser.userId, prisma, query);
  }

  async getJob(id: string, currentUser: CurrentUser, query: JobQuery = {}) {
    const job = await this.jobRepo.findById(id, prisma, query);
    if (!job) throw new NotFoundError("Job not found");

    this.assertJobAccess(job, currentUser);

    return job;
  }

  async create(input: CreateJobInput, currentUser: CurrentUser, query: JobQuery = {}) {
    return this.jobRepo.create(
      {
        contractorId: currentUser.userId,
        description: input.description,
        address: input.address,
        cost: input.cost,
      },
      prisma,
      query,
    );
  }

  async update(id: string, input: UpdateJobInput, currentUser: CurrentUser, query: JobQuery = {}) {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined && v !== null),
    );

    if (Object.keys(data).length === 0)
      throw new BadRequestError("At least one field must be provided");

    // Auth check only — no query needed, contractorId/homeownerId are base fields
    await this.getJob(id, currentUser);

    try {
      return await this.jobRepo.update(id, data, prisma, query);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === PRISMA_ERROR.RECORD_NOT_FOUND
      ) {
        throw new NotFoundError("Job not found");
      }
      throw e;
    }
  }

  async softDelete(id: string, currentUser: CurrentUser): Promise<boolean> {
    await this.getJob(id, currentUser);
    const { count } = await this.jobRepo.softDelete(id);
    if (count === 0) throw new NotFoundError("Job not found");
    return true;
  }

  async addHomeowner(
    jobId: string,
    input: AddHomeownerInput,
    currentUser: CurrentUser,
    query: JobQuery = {},
  ) {
    return prisma.$transaction(async (tx) => {
      const job = await this.jobRepo.findById(jobId, tx);

      if (!job) throw new NotFoundError("Job not found");
      if (job.contractorId !== currentUser.userId) throw new ForbiddenError();

      let homeowner;
      try {
        homeowner = await this.userRepo.create({ name: input.name, email: input.email }, tx);
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === PRISMA_ERROR.UNIQUE_CONSTRAINT_VIOLATION
        ) {
          throw new BadRequestError("A user with that email already exists");
        }
        throw e;
      }

      const assigned = await this.jobRepo.assignHomeowner(jobId, homeowner.id, tx);
      if (assigned.count !== 1) throw new BadRequestError("Job already has a homeowner assigned");

      return this.jobRepo.findById(jobId, tx, query);
    });
  }
}
