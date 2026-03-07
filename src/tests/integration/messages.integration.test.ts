import WebSocket from "ws";
import { createClient } from "graphql-ws";
import { gql } from "../helpers/gql";
import { startTestServer, type TestServer } from "../helpers/server";
import {
  createContractor,
  createJob,
  assignHomeowner,
  signToken,
  truncateAll,
} from "../helpers/db";
import { closePubSub, initializePubSub } from "../../lib/pubsub";

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

  // ── Subscription tests ────────────────────────────────────────────────────
  // These tests use a real HTTP+WS server (startTestServer) because
  // server.executeOperation() does not support WebSocket subscriptions.
  // The server shares the pubsub singleton with gql(), so mutations fired
  // via gql() publish through the same Redis that the WS server subscribes on.

  describe("messageSent subscription", () => {
    type MessageSentPayload = {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    };

    let testServer: TestServer | null = null;

    beforeAll(async () => {
      await initializePubSub();
      testServer = await startTestServer();
    });

    afterAll(async () => {
      try {
        if (testServer) {
          await testServer.stop();
        }
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "Server is not running.") {
          throw err;
        }
      } finally {
        closePubSub();
      }
    });

    function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          timeoutMs,
        );
        promise.then(
          (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          (err: unknown) => {
            clearTimeout(timeout);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      });
    }

    function makeClient(token: string) {
      return createClient({
        url: testServer!.wsUrl,
        webSocketImpl: WebSocket,
        connectionParams: { authorization: `Bearer ${token}` },
        lazy: false,
      });
    }

    it("delivers a new message to an authenticated subscriber in real time", async () => {
      const contractor = await createContractor({ name: "Bob Builder" });
      const job = await createJob(contractor.id);
      const token = signToken(contractor.id, contractor.role);

      const client = makeClient(token);
      const subscription = client.iterate({
        query: /* GraphQL */ `
          subscription MessageSent($jobId: ID!) {
            messageSent(jobId: $jobId) {
              id
              content
              sender {
                id
                name
              }
            }
          }
        `,
        variables: { jobId: job.id },
      });

      try {
        const nextMessage = withTimeout(subscription.next(), 5000, "subscription event");
        await new Promise((resolve) => setTimeout(resolve, 150));
        const sentMessage = gql(
          SEND_MESSAGE,
          { jobId: job.id, content: "Tiles arrive Thursday." },
          token,
        );

        const [subResult, mutationResult] = (await Promise.all([nextMessage, sentMessage])) as [
          IteratorResult<MessageSentPayload>,
          Awaited<ReturnType<typeof gql>>,
        ];
        expect(mutationResult.errors).toBeUndefined();
        expect(subResult.done).toBe(false);

        if (subResult.done || !subResult.value.data) {
          throw new Error("Expected subscription payload data");
        }

        expect(subResult.value.errors).toBeUndefined();
        const payload = subResult.value.data;
        expect(payload.messageSent).toMatchObject({
          content: "Tiles arrive Thursday.",
          sender: { id: contractor.id, name: "Bob Builder" },
        });
      } finally {
        await subscription.return?.();
        await client.dispose();
      }
    });

    it("homeowner receives messages on their assigned job", async () => {
      const contractor = await createContractor();
      const job = await createJob(contractor.id);
      const homeowner = await assignHomeowner(job.id, { name: "Alice Owner" });
      const homeownerToken = signToken(homeowner.id, homeowner.role);
      const contractorToken = signToken(contractor.id, contractor.role);

      const client = makeClient(homeownerToken);
      const subscription = client.iterate({
        query: /* GraphQL */ `
          subscription MessageSent($jobId: ID!) {
            messageSent(jobId: $jobId) {
              content
              sender {
                role
              }
            }
          }
        `,
        variables: { jobId: job.id },
      });

      try {
        const nextMessage = withTimeout(subscription.next(), 5000, "subscription event");
        await new Promise((resolve) => setTimeout(resolve, 150));
        const sentMessage = gql(
          SEND_MESSAGE,
          { jobId: job.id, content: "All done!" },
          contractorToken,
        );
        const [subResult] = (await Promise.all([nextMessage, sentMessage])) as [
          IteratorResult<MessageSentPayload>,
          Awaited<ReturnType<typeof gql>>,
        ];

        expect(subResult.done).toBe(false);
        if (subResult.done || !subResult.value.data) {
          throw new Error("Expected subscription payload data");
        }

        expect(subResult.value.errors).toBeUndefined();
        const payload = subResult.value.data;
        expect(payload.messageSent).toMatchObject({
          content: "All done!",
          sender: { role: "CONTRACTOR" },
        });
      } finally {
        await subscription.return?.();
        await client.dispose();
      }
    });

    it("rejects subscription for a user who cannot access the job", async () => {
      const c1 = await createContractor();
      const c2 = await createContractor();
      const job = await createJob(c1.id);
      const intruderToken = signToken(c2.id, c2.role); // c2 does not own this job

      const client = makeClient(intruderToken);
      const subscription = client.iterate({
        query: /* GraphQL */ `
          subscription MessageSent($jobId: ID!) {
            messageSent(jobId: $jobId) {
              id
            }
          }
        `,
        variables: { jobId: job.id },
      });

      try {
        const nextMessage = withTimeout(subscription.next(), 5000, "forbidden subscription event");
        await new Promise((resolve) => setTimeout(resolve, 150));
        const subResult = (await nextMessage) as IteratorResult<MessageSentPayload>;
        expect(subResult.done).toBe(false);

        if (subResult.done) {
          throw new Error("Expected forbidden subscription to return GraphQL errors payload");
        }

        expect(subResult.value.errors).toBeDefined();
        expect(subResult.value.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
      } finally {
        await subscription.return?.();
        await client.dispose();
      }
    });
  });
});
