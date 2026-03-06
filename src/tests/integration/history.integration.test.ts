import { gql } from "../helpers/gql";
import {
  assignHomeowner,
  createContractor,
  createJob,
  signToken,
  truncateAll,
} from "../helpers/db";

// ── GraphQL operations ────────────────────────────────────────────────────────

const UPDATE_JOB = /* GraphQL */ `
  mutation UpdateJob($id: ID!, $input: UpdateJobInput!) {
    updateJob(id: $id, input: $input) {
      id
      description
      address
      status
      cost
      currentVersion
    }
  }
`;

const UNDO_JOB = /* GraphQL */ `
  mutation UndoJob($id: ID!) {
    undoJob(id: $id) {
      id
      description
      address
      status
      cost
      currentVersion
    }
  }
`;

const REDO_JOB = /* GraphQL */ `
  mutation RedoJob($id: ID!) {
    redoJob(id: $id) {
      id
      description
      address
      status
      cost
      currentVersion
    }
  }
`;

const JOB_HISTORY = /* GraphQL */ `
  query JobHistory($jobId: ID!) {
    jobHistory(jobId: $jobId) {
      id
      version
      description
      address
      status
      cost
      createdAt
      changedBy {
        id
        role
      }
    }
  }
`;

const CREATE_JOB = /* GraphQL */ `
  mutation CreateJob($input: CreateJobInput!) {
    createJob(input: $input) {
      id
      description
      address
      status
      cost
      currentVersion
    }
  }
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Job History", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  // ── createJob writes version-0 snapshot ─────────────────────────────────────

  describe("createJob", () => {
    it("writes a version-0 history entry on creation", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        CREATE_JOB,
        { input: { description: "New kitchen", address: "5 Cook St", cost: "8000" } },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.createJob.currentVersion).toBe(0);

      const { data: histData } = await gql(JOB_HISTORY, { jobId: data.createJob.id }, token);

      expect(histData.jobHistory).toHaveLength(1);
      expect(histData.jobHistory[0].version).toBe(0);
      expect(histData.jobHistory[0].description).toBe("New kitchen");
      expect(histData.jobHistory[0].address).toBe("5 Cook St");
      expect(histData.jobHistory[0].status).toBe("PLANNING");
      expect(histData.jobHistory[0].changedBy.id).toBe(contractor.id);
    });
  });

  // ── updateJob increments version and writes snapshot ────────────────────────

  describe("updateJob", () => {
    it("increments currentVersion and appends a history entry on each update", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "Old desc", address: "1 St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      const { data: u1 } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { description: "Updated once" } },
        token,
      );
      expect(u1.updateJob.currentVersion).toBe(1);

      const { data: u2 } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { description: "Updated twice" } },
        token,
      );
      expect(u2.updateJob.currentVersion).toBe(2);

      const { data: histData } = await gql(JOB_HISTORY, { jobId: job.id }, token);
      expect(histData.jobHistory).toHaveLength(3); // versions 0, 1, 2
      expect(histData.jobHistory[0].version).toBe(0);
      expect(histData.jobHistory[1].version).toBe(1);
      expect(histData.jobHistory[1].description).toBe("Updated once");
      expect(histData.jobHistory[2].version).toBe(2);
      expect(histData.jobHistory[2].description).toBe("Updated twice");
    });
  });

  // ── undoJob ──────────────────────────────────────────────────────────────────

  describe("undoJob", () => {
    it("restores the previous state and decrements currentVersion", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "Original", address: "1 First St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      await gql(UPDATE_JOB, { id: job.id, input: { description: "Modified" } }, token);

      const { data, errors } = await gql(UNDO_JOB, { id: job.id }, token);

      expect(errors).toBeUndefined();
      expect(data.undoJob.description).toBe("Original");
      expect(data.undoJob.currentVersion).toBe(0);
    });

    it("returns BAD_REQUEST when already at version 0", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { errors } = await gql(UNDO_JOB, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("BAD_REQUEST");
    });

    it("can undo multiple times through the version history", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "v0", address: "1 St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      await gql(UPDATE_JOB, { id: job.id, input: { description: "v1" } }, token);
      await gql(UPDATE_JOB, { id: job.id, input: { description: "v2" } }, token);

      await gql(UNDO_JOB, { id: job.id }, token); // back to v1
      const { data } = await gql(UNDO_JOB, { id: job.id }, token); // back to v0

      expect(data.undoJob.description).toBe("v0");
      expect(data.undoJob.currentVersion).toBe(0);
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const { basePrisma } = await import("../../lib/prisma");
      const homeowner = await basePrisma.user.create({
        data: {
          name: "HO",
          email: `ho-${Date.now()}@test.com`,
          role: "HOMEOWNER",
        },
      });
      await basePrisma.job.update({ where: { id: job.id }, data: { homeownerId: homeowner.id } });
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(UNDO_JOB, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });
  });

  // ── redoJob ──────────────────────────────────────────────────────────────────

  describe("redoJob", () => {
    it("reapplies the undone state and increments currentVersion", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "Original", address: "1 St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      await gql(UPDATE_JOB, { id: job.id, input: { description: "Modified" } }, token);
      await gql(UNDO_JOB, { id: job.id }, token);

      const { data, errors } = await gql(REDO_JOB, { id: job.id }, token);

      expect(errors).toBeUndefined();
      expect(data.redoJob.description).toBe("Modified");
      expect(data.redoJob.currentVersion).toBe(1);
    });

    it("returns BAD_REQUEST when there is nothing to redo", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { errors } = await gql(REDO_JOB, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("BAD_REQUEST");
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const { basePrisma } = await import("../../lib/prisma");
      const homeowner = await basePrisma.user.create({
        data: {
          name: "HO",
          email: `ho-${Date.now()}@test.com`,
          role: "HOMEOWNER",
        },
      });
      await basePrisma.job.update({ where: { id: job.id }, data: { homeownerId: homeowner.id } });
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(REDO_JOB, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });
  });

  // ── branching: update after undo truncates redo stack ───────────────────────

  describe("undo then update (branching)", () => {
    it("truncates the redo stack when a new update is made after an undo", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "v0", address: "1 St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      await gql(UPDATE_JOB, { id: job.id, input: { description: "v1" } }, token);
      await gql(UPDATE_JOB, { id: job.id, input: { description: "v2" } }, token);

      // Undo back to v1, then make a new edit (branches off from v1)
      await gql(UNDO_JOB, { id: job.id }, token);
      await gql(UPDATE_JOB, { id: job.id, input: { description: "v1-branch" } }, token);

      // Redo stack (v2) should be gone
      const { errors } = await gql(REDO_JOB, { id: job.id }, token);
      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("BAD_REQUEST");

      // History should only have v0, v1, and the new branch
      const { data: histData } = await gql(JOB_HISTORY, { jobId: job.id }, token);
      expect(histData.jobHistory).toHaveLength(3);
      expect(histData.jobHistory[2].description).toBe("v1-branch");
    });
  });

  // ── jobHistory query ─────────────────────────────────────────────────────────

  describe("jobHistory query", () => {
    it("returns history entries ordered by version ASC", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "start", address: "1 St", cost: "1000" } },
        token,
      );
      const job = created.createJob;

      await gql(UPDATE_JOB, { id: job.id, input: { description: "middle" } }, token);
      await gql(UPDATE_JOB, { id: job.id, input: { description: "end" } }, token);

      const { data, errors } = await gql(JOB_HISTORY, { jobId: job.id }, token);

      expect(errors).toBeUndefined();
      expect(data.jobHistory).toHaveLength(3);
      expect(data.jobHistory[0].version).toBe(0);
      expect(data.jobHistory[1].version).toBe(1);
      expect(data.jobHistory[2].version).toBe(2);
    });

    it("returns history for the assigned homeowner", async () => {
      const contractor = await createContractor();
      const contractorToken = signToken(contractor.id, contractor.role);
      const { data: created } = await gql(
        CREATE_JOB,
        { input: { description: "start", address: "1 St", cost: "1000" } },
        contractorToken,
      );
      const job = created.createJob;
      const homeowner = await assignHomeowner(job.id);

      await gql(UPDATE_JOB, { id: job.id, input: { description: "updated" } }, contractorToken);

      const homeownerToken = signToken(homeowner.id, homeowner.role);
      const { data, errors } = await gql(JOB_HISTORY, { jobId: job.id }, homeownerToken);

      expect(errors).toBeUndefined();
      expect(data.jobHistory).toHaveLength(2);
      expect(data.jobHistory[0].version).toBe(0);
      expect(data.jobHistory[1].version).toBe(1);
    });

    it("returns FORBIDDEN for a homeowner not assigned to the job", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const otherJob = await createJob(contractor.id);
      const homeowner = await assignHomeowner(otherJob.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(JOB_HISTORY, { jobId: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns FORBIDDEN for a different contractor", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      const job = await createJob(c1.id);
      const token = signToken(c2.id, c2.role);

      const { errors } = await gql(JOB_HISTORY, { jobId: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns UNAUTHENTICATED without a token", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);

      const { errors } = await gql(JOB_HISTORY, { jobId: job.id });

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });
  });
});
