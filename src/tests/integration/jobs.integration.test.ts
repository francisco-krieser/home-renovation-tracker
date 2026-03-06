import { gql } from "../helpers/gql";
import {
  createContractor,
  createJob,
  assignHomeowner,
  signToken,
  truncateAll,
} from "../helpers/db";

// ── GraphQL operations ────────────────────────────────────────────────────────

// Contractor-only fields: description, cost, address, contractor, homeowner, createdAt, updatedAt
const JOBS = /* GraphQL */ `
  query Jobs {
    jobs {
      id
      description
      status
      cost
    }
  }
`;

// Contractor field selection for job(id)
const JOB_CONTRACTOR = /* GraphQL */ `
  query Job($id: ID!) {
    job(id: $id) {
      id
      description
      status
      cost
    }
  }
`;

// Homeowner field selection — only fields without contractor-level authScopes
const JOB_HOMEOWNER = /* GraphQL */ `
  query Job($id: ID!) {
    job(id: $id) {
      id
      status
    }
  }
`;

const CREATE_JOB = /* GraphQL */ `
  mutation CreateJob($input: CreateJobInput!) {
    createJob(input: $input) {
      id
      description
      status
      cost
    }
  }
`;

const UPDATE_JOB = /* GraphQL */ `
  mutation UpdateJob($id: ID!, $input: UpdateJobInput!) {
    updateJob(id: $id, input: $input) {
      id
      description
      status
      cost
    }
  }
`;

const DELETE_JOB = /* GraphQL */ `
  mutation DeleteJob($id: ID!) {
    deleteJob(id: $id)
  }
`;

const ADD_HOMEOWNER = /* GraphQL */ `
  mutation AddHomeowner($jobId: ID!, $input: AddHomeownerInput!) {
    addHomeowner(jobId: $jobId, input: $input) {
      id
      address
      homeowner {
        id
        name
        email
        role
      }
    }
  }
`;

const LOGIN = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      role
    }
  }
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Jobs", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  // ── jobs query (contractor-only) ────────────────────────────────────────────

  describe("jobs query", () => {
    it("returns all jobs belonging to the authenticated contractor", async () => {
      const contractor = await createContractor();
      await createJob(contractor.id, { description: "Job A" });
      await createJob(contractor.id, { description: "Job B" });
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(JOBS, {}, token);

      expect(errors).toBeUndefined();
      expect(data.jobs).toHaveLength(2);
      const descriptions = data.jobs.map((j: any) => j.description);
      expect(descriptions).toContain("Job A");
      expect(descriptions).toContain("Job B");
    });

    it("does not return jobs owned by a different contractor", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      await createJob(c1.id);
      await createJob(c2.id);
      const token = signToken(c1.id, c1.role);

      const { data } = await gql(JOBS, {}, token);

      expect(data.jobs).toHaveLength(1);
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(JOBS, {}, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns UNAUTHENTICATED without a token", async () => {
      const { errors } = await gql(JOBS);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });
  });

  // ── job(id) query ───────────────────────────────────────────────────────────

  describe("job(id) query", () => {
    it("returns the job for the owning contractor", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id, { description: "My Reno" });
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(JOB_CONTRACTOR, { id: job.id }, token);

      expect(errors).toBeUndefined();
      expect(data.job.id).toBe(job.id);
      expect(data.job.description).toBe("My Reno");
      expect(data.job.status).toBe("PLANNING");
      // Decimal.toFixed() strips trailing zeros
      expect(data.job.cost).toBe("5000");
    });

    it("returns only accessible fields for the assigned homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { data, errors } = await gql(JOB_HOMEOWNER, { id: job.id }, token);

      expect(errors).toBeUndefined();
      expect(data.job.id).toBe(job.id);
      expect(data.job.status).toBe("PLANNING");
    });

    it("returns FORBIDDEN when a contractor queries another contractor's job", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      const job = await createJob(c1.id);
      const token = signToken(c2.id, c2.role);

      const { errors } = await gql(JOB_CONTRACTOR, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns FORBIDDEN when a homeowner queries a job they are not assigned to", async () => {
      const contractor = await createContractor();
      const job1 = await createJob(contractor.id);
      const job2 = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job1.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(JOB_HOMEOWNER, { id: job2.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns NOT_FOUND for a non-existent job id", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);

      // The service throws NotFoundError (rather than returning null) when the job does
      // not exist, so the resolver propagates an error even though the field is nullable.
      const { errors } = await gql(
        JOB_CONTRACTOR,
        { id: "00000000-0000-0000-0000-000000000000" },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("NOT_FOUND");
    });
  });

  // ── createJob mutation ──────────────────────────────────────────────────────

  describe("createJob mutation", () => {
    it("creates a job and returns it with correct fields", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        CREATE_JOB,
        { input: { description: "New bathroom", cost: "12000.50" } },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.createJob.id).toBeDefined();
      expect(data.createJob.description).toBe("New bathroom");
      expect(data.createJob.status).toBe("PLANNING");
      expect(data.createJob.cost).toBe("12000.5");
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(
        CREATE_JOB,
        { input: { description: "Attempt", cost: "100" } },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });
  });

  // ── updateJob mutation ──────────────────────────────────────────────────────

  describe("updateJob mutation", () => {
    it("updates only the provided fields (partial update semantics)", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id, { description: "Old description", cost: 5000 });
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { status: "IN_PROGRESS" } },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.updateJob.status).toBe("IN_PROGRESS");
      // description and cost must be unchanged
      expect(data.updateJob.description).toBe("Old description");
      expect(data.updateJob.cost).toBe("5000");
    });

    it("updates description when provided", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { description: "Updated description" } },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.updateJob.description).toBe("Updated description");
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { status: "IN_PROGRESS" } },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("returns FORBIDDEN for a contractor who does not own the job", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      const job = await createJob(c1.id);
      const token = signToken(c2.id, c2.role);

      const { errors } = await gql(
        UPDATE_JOB,
        { id: job.id, input: { status: "IN_PROGRESS" } },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });
  });

  // ── deleteJob mutation ──────────────────────────────────────────────────────

  describe("deleteJob mutation", () => {
    it("soft-deletes a job so it no longer appears in listings", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { data: deleteData, errors: deleteErrors } = await gql(
        DELETE_JOB,
        { id: job.id },
        token,
      );

      expect(deleteErrors).toBeUndefined();
      expect(deleteData.deleteJob).toBe(true);

      // Deleted job must not appear in the jobs list
      const { data: listData } = await gql(JOBS, {}, token);
      expect(listData.jobs).toHaveLength(0);
    });

    it("returns FORBIDDEN for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(DELETE_JOB, { id: job.id }, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });

    it("retains messages on a soft-deleted job (history preserved)", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const _homeowner = await assignHomeowner(job.id);
      const { basePrisma } = await import("../../lib/prisma");
      await basePrisma.message.create({
        data: { jobId: job.id, senderId: contractor.id, content: "Note before deletion" },
      });
      const token = signToken(contractor.id, contractor.role);

      await gql(DELETE_JOB, { id: job.id }, token);

      // Messages still exist in the DB even though the job is soft-deleted
      const messages = await basePrisma.message.findMany({ where: { jobId: job.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Note before deletion");
    });
  });

  // ── addHomeowner mutation ───────────────────────────────────────────────────

  describe("addHomeowner mutation", () => {
    it("creates a homeowner user and assigns them to the job", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(
        ADD_HOMEOWNER,
        {
          jobId: job.id,
          input: { name: "Jane Doe", email: "jane@example.com", address: "42 Elm Street" },
        },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.addHomeowner.id).toBe(job.id);
      expect(data.addHomeowner.address).toBe("42 Elm Street");
      expect(data.addHomeowner.homeowner.name).toBe("Jane Doe");
      expect(data.addHomeowner.homeowner.email).toBe("jane@example.com");
      expect(data.addHomeowner.homeowner.role).toBe("HOMEOWNER");
    });

    it("homeowner created via addHomeowner can log in immediately", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      await gql(
        ADD_HOMEOWNER,
        {
          jobId: job.id,
          input: { name: "Bob", email: "bob@example.com", address: "1 Main St" },
        },
        token,
      );

      const { data, errors } = await gql(LOGIN, {
        email: "bob@example.com",
        password: "mock123",
      });

      expect(errors).toBeUndefined();
      expect(data.login.role).toBe("HOMEOWNER");
    });

    it("returns BAD_REQUEST when the email is already taken", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      await createContractor({ email: "taken@example.com" }); // pre-existing user
      const token = signToken(contractor.id, contractor.role);

      const { errors } = await gql(
        ADD_HOMEOWNER,
        {
          jobId: job.id,
          input: { name: "Alice", email: "taken@example.com", address: "1 St" },
        },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("BAD_REQUEST");
    });

    it("returns BAD_REQUEST when the job already has a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      await assignHomeowner(job.id);
      const token = signToken(contractor.id, contractor.role);

      const { errors } = await gql(
        ADD_HOMEOWNER,
        {
          jobId: job.id,
          input: { name: "Second", email: "second@example.com", address: "2 St" },
        },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("BAD_REQUEST");
    });

    it("returns FORBIDDEN for a homeowner attempting to add another homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id);
      const token = signToken(homeowner.id, homeowner.role);

      const { errors } = await gql(
        ADD_HOMEOWNER,
        {
          jobId: job.id,
          input: { name: "Another", email: "another@example.com", address: "3 St" },
        },
        token,
      );

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("FORBIDDEN");
    });
  });
});
