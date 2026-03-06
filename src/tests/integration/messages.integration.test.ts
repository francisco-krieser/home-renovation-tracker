import { gql } from "../helpers/gql";
import {
  createContractor,
  createJob,
  assignHomeowner,
  signToken,
  truncateAll,
} from "../helpers/db";

// ── GraphQL operations ────────────────────────────────────────────────────────

const SEND_MESSAGE = /* GraphQL */ `
  mutation SendMessage($jobId: ID!, $content: NonEmptyString!) {
    sendMessage(jobId: $jobId, content: $content) {
      id
      jobId
      content
      createdAt
      sender {
        id
        name
        role
      }
    }
  }
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Messages", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("sendMessage mutation", () => {
    it("contractor sends a message on their own job", async () => {
      const contractor = await createContractor({ name: "Bob Builder" });
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        SEND_MESSAGE,
        { jobId: job.id, content: "Renovation starts Monday." },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.sendMessage.id).toBeDefined();
      expect(data.sendMessage.jobId).toBe(job.id);
      expect(data.sendMessage.content).toBe("Renovation starts Monday.");
      expect(data.sendMessage.sender.id).toBe(contractor.id);
      expect(data.sendMessage.sender.name).toBe("Bob Builder");
      expect(data.sendMessage.sender.role).toBe("CONTRACTOR");
    });

    it("homeowner sends a message on their assigned job", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id, { name: "Alice Owner" });
      const token = signToken(homeowner.id, homeowner.role);

      const { data, errors } = await gql(
        SEND_MESSAGE,
        { jobId: job.id, content: "When will it be done?" },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.sendMessage.sender.id).toBe(homeowner.id);
      expect(data.sendMessage.sender.name).toBe("Alice Owner");
      expect(data.sendMessage.sender.role).toBe("HOMEOWNER");
    });

    it("message content is persisted with the correct sender_id", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { data } = await gql(SEND_MESSAGE, { jobId: job.id, content: "Important note" }, token);

      const { basePrisma } = await import("../../lib/prisma");
      const saved = await basePrisma.message.findFirst({ where: { id: data.sendMessage.id } });
      expect(saved?.senderId).toBe(contractor.id);
      expect(saved?.content).toBe("Important note");
    });

    it("returns UNAUTHENTICATED without a token", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);

      const { errors } = await gql(SEND_MESSAGE, { jobId: job.id, content: "Hello" });

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });

    it("returns FORBIDDEN when a contractor messages on another contractor's job", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      const job = await createJob(c1.id);
      const token = signToken(c2.id, c2.role);

      const { errors } = await gql(SEND_MESSAGE, { jobId: job.id, content: "Intrude" }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns FORBIDDEN when a homeowner messages on a job they are not assigned to", async () => {
      const contractor = await createContractor();
      const job1 = await createJob(contractor.id);
      const job2 = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job1.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(SEND_MESSAGE, { jobId: job2.id, content: "Wrong job" }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns NOT_FOUND for a non-existent job id", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);

      const { errors } = await gql(
        SEND_MESSAGE,
        { jobId: "00000000-0000-0000-0000-000000000000", content: "Hello?" },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("NOT_FOUND");
    });
  });
});
