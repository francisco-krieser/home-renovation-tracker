import { JobStatus, Prisma, Role } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { JobService } from "./service";
import { IJobRepository } from "./repository";
import { IUserRepository } from "../user/repository";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/appErrors";
import { CurrentUser } from "../../context";

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
  PRISMA_ERROR: {
    RECORD_NOT_FOUND: "P2025",
    UNIQUE_CONSTRAINT_VIOLATION: "P2002",
  },
}));

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  contractorId: "contractor-1",
  homeownerId: null as string | null,
  description: "Test job",
  address: null as string | null,
  status: JobStatus.PLANNING,
  cost: new Decimal("100.00"),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "homeowner-new",
  name: "New Owner",
  email: "new@example.com",
  role: Role.HOMEOWNER,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

const contractor: CurrentUser = { userId: "contractor-1", role: Role.CONTRACTOR };
const _otherContractor: CurrentUser = { userId: "contractor-2", role: Role.CONTRACTOR };
const homeowner: CurrentUser = { userId: "homeowner-1", role: Role.HOMEOWNER };

describe("JobService", () => {
  let jobRepo: jest.Mocked<IJobRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let service: JobService;

  beforeEach(() => {
    jobRepo = {
      findAllByContractorId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      assignHomeowner: jest.fn(),
      softDelete: jest.fn(),
    };
    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    service = new JobService(jobRepo, userRepo);
  });

  describe("listContractorJobs", () => {
    it("returns all jobs for the current contractor", async () => {
      const jobs = [makeJob()] as any[];
      jobRepo.findAllByContractorId.mockResolvedValue(jobs);

      const result = await service.listContractorJobs(contractor);

      expect(jobRepo.findAllByContractorId).toHaveBeenCalledWith(
        "contractor-1",
        expect.anything(),
        {},
      );
      expect(result).toBe(jobs);
    });
  });

  describe("getJob", () => {
    it("returns the job for the contractor who owns it", async () => {
      const job = makeJob() as any;
      jobRepo.findById.mockResolvedValue(job);

      const result = await service.getJob("job-1", contractor);

      expect(jobRepo.findById).toHaveBeenCalledWith("job-1", expect.anything(), {});
      expect(result).toBe(job);
    });

    it("throws ForbiddenError when contractor does not own the job", async () => {
      const job = makeJob({ contractorId: "contractor-2" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      await expect(service.getJob("job-1", contractor)).rejects.toThrow(ForbiddenError);
    });

    it("returns the job for the assigned homeowner", async () => {
      const job = makeJob({ homeownerId: "homeowner-1" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      const result = await service.getJob("job-1", homeowner);

      expect(result).toBe(job);
    });

    it("throws ForbiddenError when homeowner is not assigned to the job", async () => {
      const job = makeJob({ homeownerId: "homeowner-2" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      await expect(service.getJob("job-1", homeowner)).rejects.toThrow(ForbiddenError);
    });

    it("throws NotFoundError when job does not exist", async () => {
      jobRepo.findById.mockResolvedValue(null);

      await expect(service.getJob("job-1", contractor)).rejects.toThrow(NotFoundError);
    });
  });

  describe("create", () => {
    it("creates a job owned by the current contractor", async () => {
      const job = makeJob() as any;
      jobRepo.create.mockResolvedValue(job);

      const result = await service.create(
        { description: "Test job", cost: new Decimal("100.00") },
        contractor,
      );

      expect(jobRepo.create).toHaveBeenCalledWith(
        { contractorId: "contractor-1", description: "Test job", cost: new Decimal("100.00") },
        expect.anything(),
        {},
      );
      expect(result).toBe(job);
    });
  });

  describe("update", () => {
    it("updates job fields for the owning contractor", async () => {
      const job = makeJob() as any;
      const updated = makeJob({ description: "Updated" }) as any;
      jobRepo.findById.mockResolvedValue(job);
      jobRepo.update.mockResolvedValue(updated);

      const result = await service.update("job-1", { description: "Updated" }, contractor);

      expect(jobRepo.update).toHaveBeenCalledWith(
        "job-1",
        { description: "Updated" },
        expect.anything(),
        {},
      );
      expect(result).toBe(updated);
    });

    it("filters out null values and updates only defined fields", async () => {
      const job = makeJob() as any;
      const updated = makeJob({ status: JobStatus.IN_PROGRESS }) as any;
      jobRepo.findById.mockResolvedValue(job);
      jobRepo.update.mockResolvedValue(updated);

      await service.update(
        "job-1",
        { description: null, status: JobStatus.IN_PROGRESS, cost: null },
        contractor,
      );

      expect(jobRepo.update).toHaveBeenCalledWith(
        "job-1",
        { status: JobStatus.IN_PROGRESS },
        expect.anything(),
        {},
      );
    });

    it("throws BadRequestError when no fields are provided", async () => {
      await expect(service.update("job-1", {}, contractor)).rejects.toThrow(BadRequestError);
      expect(jobRepo.findById).not.toHaveBeenCalled();
    });

    it("throws BadRequestError when all fields are null", async () => {
      await expect(
        service.update("job-1", { description: null, status: null, cost: null }, contractor),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws ForbiddenError when contractor does not own the job", async () => {
      const job = makeJob({ contractorId: "contractor-2" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      await expect(service.update("job-1", { description: "Updated" }, contractor)).rejects.toThrow(
        ForbiddenError,
      );
      expect(jobRepo.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when job does not exist", async () => {
      jobRepo.findById.mockResolvedValue(null);

      await expect(service.update("job-1", { description: "Updated" }, contractor)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("converts Prisma P2025 error to NotFoundError on update", async () => {
      const job = makeJob() as any;
      jobRepo.findById.mockResolvedValue(job);
      const prismaError = new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "5.0.0",
      });
      jobRepo.update.mockRejectedValue(prismaError);

      await expect(service.update("job-1", { description: "Updated" }, contractor)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("softDelete", () => {
    it("soft-deletes an owned job and returns true", async () => {
      const job = makeJob() as any;
      jobRepo.findById.mockResolvedValue(job);
      jobRepo.softDelete.mockResolvedValue({ count: 1 });

      const result = await service.softDelete("job-1", contractor);

      expect(jobRepo.softDelete).toHaveBeenCalledWith("job-1");
      expect(result).toBe(true);
    });

    it("throws ForbiddenError when contractor does not own the job", async () => {
      const job = makeJob({ contractorId: "contractor-2" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      await expect(service.softDelete("job-1", contractor)).rejects.toThrow(ForbiddenError);
      expect(jobRepo.softDelete).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when job does not exist", async () => {
      jobRepo.findById.mockResolvedValue(null);

      await expect(service.softDelete("job-1", contractor)).rejects.toThrow(NotFoundError);
    });
  });

  describe("addHomeowner", () => {
    it("creates a homeowner user and assigns them to the job atomically", async () => {
      const job = makeJob() as any;
      const newHomeowner = makeUser() as any;
      const updatedJob = makeJob({ homeownerId: "homeowner-new", address: "123 Main St" }) as any;

      jobRepo.findById
        .mockResolvedValueOnce(job) // ownership check inside tx
        .mockResolvedValueOnce(updatedJob); // final return
      userRepo.create.mockResolvedValue(newHomeowner);
      jobRepo.assignHomeowner.mockResolvedValue({ count: 1 });

      const result = await service.addHomeowner(
        "job-1",
        { name: "New Owner", email: "new@example.com", address: "123 Main St" },
        contractor,
      );

      expect(userRepo.create).toHaveBeenCalledWith(
        { name: "New Owner", email: "new@example.com" },
        expect.anything(),
      );
      expect(jobRepo.assignHomeowner).toHaveBeenCalledWith(
        "job-1",
        "homeowner-new",
        "123 Main St",
        expect.anything(),
      );
      expect(result).toBe(updatedJob);
    });

    it("throws NotFoundError when job does not exist", async () => {
      jobRepo.findById.mockResolvedValue(null);

      await expect(
        service.addHomeowner("job-1", { name: "N", email: "n@t.com", address: "1 St" }, contractor),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when contractor does not own the job", async () => {
      const job = makeJob({ contractorId: "contractor-2" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      await expect(
        service.addHomeowner("job-1", { name: "N", email: "n@t.com", address: "1 St" }, contractor),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws BadRequestError when homeowner email is already taken", async () => {
      const job = makeJob() as any;
      jobRepo.findById.mockResolvedValue(job);
      const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint violation", {
        code: "P2002",
        clientVersion: "5.0.0",
      });
      userRepo.create.mockRejectedValue(uniqueError);

      await expect(
        service.addHomeowner(
          "job-1",
          { name: "N", email: "dup@t.com", address: "1 St" },
          contractor,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws BadRequestError when job already has a homeowner assigned", async () => {
      const job = makeJob() as any;
      const newHomeowner = makeUser() as any;
      jobRepo.findById.mockResolvedValue(job);
      userRepo.create.mockResolvedValue(newHomeowner);
      jobRepo.assignHomeowner.mockResolvedValue({ count: 0 }); // already assigned

      await expect(
        service.addHomeowner("job-1", { name: "N", email: "n@t.com", address: "1 St" }, contractor),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws ForbiddenError when a homeowner tries to add a homeowner", async () => {
      const job = makeJob({ homeownerId: "homeowner-1" }) as any;
      jobRepo.findById.mockResolvedValue(job);

      // homeowner-1's contractorId check: job.contractorId ('contractor-1') !== homeowner.userId ('homeowner-1')
      await expect(
        service.addHomeowner("job-1", { name: "N", email: "n@t.com", address: "1 St" }, homeowner),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
