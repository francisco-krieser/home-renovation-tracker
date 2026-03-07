import { gql } from "../helpers/gql";
import {
  createContractor,
  createJob,
  assignHomeowner,
  signToken,
  softDeleteUser,
  truncateAll,
} from "../helpers/db";

// ── GraphQL operations ────────────────────────────────────────────────────────

const LOGIN = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      role
      user {
        id
        name
        email
        role
      }
    }
  }
`;

const ME = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
      role
    }
  }
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Auth", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  // ── login mutation ──────────────────────────────────────────────────────────

  describe("login mutation", () => {
    it("returns a JWT and user payload for a valid contractor", async () => {
      const contractor = await createContractor({ email: "contractor@test.com" });

      const { data, errors } = await gql(LOGIN, {
        email: "contractor@test.com",
        password: "mock123",
      });

      expect(errors).toBeUndefined();
      expect(data.login.token).toBeDefined();
      expect(typeof data.login.token).toBe("string");
      expect(data.login.role).toBe("CONTRACTOR");
      expect(data.login.user.id).toBe(contractor.id);
      expect(data.login.user.email).toBe("contractor@test.com");
    });

    it("returns a JWT with HOMEOWNER role for a homeowner", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id, { email: "homeowner@test.com" });

      const { data, errors } = await gql(LOGIN, {
        email: "homeowner@test.com",
        password: "mock123",
      });

      expect(errors).toBeUndefined();
      expect(data.login.role).toBe("HOMEOWNER");
      expect(data.login.user.id).toBe(homeowner.id);
    });

    it("returns UNAUTHENTICATED for wrong password", async () => {
      await createContractor({ email: "contractor@test.com" });

      const { errors } = await gql(LOGIN, {
        email: "contractor@test.com",
        password: "wrong",
      });

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });

    it("returns UNAUTHENTICATED for a non-existent email", async () => {
      const { errors } = await gql(LOGIN, {
        email: "nobody@test.com",
        password: "mock123",
      });

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });

    it("returns UNAUTHENTICATED for a soft-deleted user", async () => {
      const contractor = await createContractor({ email: "deleted@test.com" });
      await softDeleteUser(contractor.id);

      const { errors } = await gql(LOGIN, {
        email: "deleted@test.com",
        password: "mock123",
      });

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });
  });

  // ── me query ────────────────────────────────────────────────────────────────

  describe("me query", () => {
    it("returns the current user for a valid token", async () => {
      const contractor = await createContractor({ name: "Alice" });
      const token = signToken(contractor.id, contractor.role);

      const { data, errors } = await gql(ME, {}, token);

      expect(errors).toBeUndefined();
      expect(data.me.id).toBe(contractor.id);
      expect(data.me.name).toBe("Alice");
      expect(data.me.role).toBe("CONTRACTOR");
    });

    it("returns UNAUTHENTICATED without a token", async () => {
      const { errors } = await gql(ME);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });

    it("returns UNAUTHENTICATED for a malformed token", async () => {
      const { errors } = await gql(ME, {}, "not.a.jwt");

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });

    it("returns UNAUTHENTICATED when the token references a deleted user", async () => {
      const contractor = await createContractor();
      const token = signToken(contractor.id, contractor.role);
      await softDeleteUser(contractor.id);

      // buildContext cannot find the soft-deleted user, so currentUser is null
      const { errors } = await gql(ME, {}, token);

      expect(errors).toBeDefined();
      expect(errors![0].extensions?.code).toBe("UNAUTHENTICATED");
    });
  });
});
