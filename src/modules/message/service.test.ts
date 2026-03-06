import { Role } from "@prisma/client";
import { MessageService } from "./service";
import { IMessageRepository } from "./repository";
import { JobService } from "../job/service";
import { CurrentUser } from "../../context";
import { ForbiddenError, NotFoundError } from "../../errors/appErrors";

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {},
  PRISMA_ERROR: {
    RECORD_NOT_FOUND: "P2025",
    UNIQUE_CONSTRAINT_VIOLATION: "P2002",
  },
}));

const contractorUser: CurrentUser = { userId: "contractor-1", role: Role.CONTRACTOR };
const homeownerUser: CurrentUser = { userId: "homeowner-1", role: Role.HOMEOWNER };

describe("MessageService", () => {
  let messageRepo: jest.Mocked<IMessageRepository>;
  let jobService: jest.Mocked<Pick<JobService, "getJob">>;
  let service: MessageService;

  beforeEach(() => {
    messageRepo = {
      create: jest.fn(),
    };
    jobService = {
      getJob: jest.fn(),
    };
    service = new MessageService(messageRepo, jobService as unknown as JobService);
  });

  describe("send", () => {
    it("verifies job access then creates message for a contractor", async () => {
      const message = {
        id: "msg-1",
        jobId: "job-1",
        senderId: "contractor-1",
        content: "Hello!",
        createdAt: new Date(),
        updatedAt: null,
      } as any;
      jobService.getJob.mockResolvedValue(undefined as any);
      messageRepo.create.mockResolvedValue(message);

      const result = await service.send("job-1", "Hello!", contractorUser);

      expect(jobService.getJob).toHaveBeenCalledWith("job-1", contractorUser);
      expect(messageRepo.create).toHaveBeenCalledWith(
        { jobId: "job-1", senderId: "contractor-1", content: "Hello!" },
        expect.anything(),
        {},
      );
      expect(result).toBe(message);
    });

    it("verifies job access then creates message for a homeowner", async () => {
      const message = {
        id: "msg-2",
        jobId: "job-1",
        senderId: "homeowner-1",
        content: "Thanks!",
        createdAt: new Date(),
        updatedAt: null,
      } as any;
      jobService.getJob.mockResolvedValue(undefined as any);
      messageRepo.create.mockResolvedValue(message);

      const result = await service.send("job-1", "Thanks!", homeownerUser);

      expect(jobService.getJob).toHaveBeenCalledWith("job-1", homeownerUser);
      expect(messageRepo.create).toHaveBeenCalledWith(
        { jobId: "job-1", senderId: "homeowner-1", content: "Thanks!" },
        expect.anything(),
        {},
      );
      expect(result).toBe(message);
    });

    it("propagates ForbiddenError when user has no access to the job", async () => {
      jobService.getJob.mockRejectedValue(new ForbiddenError());

      await expect(service.send("job-1", "Hello!", contractorUser)).rejects.toThrow(ForbiddenError);
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it("propagates NotFoundError when job does not exist", async () => {
      jobService.getJob.mockRejectedValue(new NotFoundError("Job not found"));

      await expect(service.send("job-1", "Hello!", contractorUser)).rejects.toThrow(NotFoundError);
      expect(messageRepo.create).not.toHaveBeenCalled();
    });
  });
});
