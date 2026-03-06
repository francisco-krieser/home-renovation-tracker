# Tech Design: Home Renovation Project Tracker

## Overview

Backend system for a tool that allows contractors and homeowners to collaborate on renovation projects.

**Stack:**

- Language: Node.js + TypeScript
- API: GraphQL (Apollo Server 5, Express middleware, Pothos Plugin Prisma)
- Real-time: GraphQL subscriptions via `graphql-ws` (WebSocket) + Redis Pub/Sub
- Database: PostgreSQL + Prisma ORM
- Cache/Pub-Sub: Redis 7
- Auth: JWT (shared mock password)
- Runtime: Node 20+

---

## Project Structure

```text
home-renovation-tracker/
├── prisma/
│   ├── schema.prisma          # data model
│   └── seed.ts                # seeds the initial contractor user
├── src/
│   ├── config/
│   │   └── env.ts             # env parsing/validation (Zod)
│   ├── context/
│   │   └── index.ts           # builds context from JWT (HTTP + WebSocket); instantiates services per request
│   ├── graphql/
│   │   ├── builder.ts         # Pothos SchemaBuilder (PrismaPlugin + ScopeAuthPlugin; Query/Mutation/Subscription root types)
│   │   ├── scalars.ts         # custom scalars: Decimal, DateTime
│   │   └── schema.ts          # imports module resolvers; calls builder.toSchema()
│   ├── modules/
│   │   ├── job/
│   │   │   ├── resolvers.ts   # Pothos types, inputs, Query/Mutation fields
│   │   │   ├── service.ts     # business logic for all job operations
│   │   │   └── repository.ts
│   │   ├── user/
│   │   │   ├── resolvers.ts
│   │   │   ├── service.ts
│   │   │   └── repository.ts
│   │   └── message/
│   │       ├── resolvers.ts   # sendMessage mutation + messageSent subscription
│   │       ├── service.ts     # business logic; publishes to Redis on send
│   │       └── repository.ts
│   ├── lib/
│   │   ├── prisma.ts          # prisma client + soft-delete extension
│   │   └── pubsub.ts          # Redis PubSub singleton (graphql-redis-subscriptions)
│   ├── errors/
│   │   └── appErrors.ts       # domain error classes
│   └── index.ts               # Apollo Server setup: Express middleware + WebSocket server
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml         # postgres container for local dev
├── package.json
└── README.md
```

---

## Application Layers

- **Resolvers (transport layer):** define Pothos types, inputs, and Query/Mutation fields; keep thin — map GraphQL args/context to service calls only. N+1 avoidance is handled by the Pothos Prisma plugin's `prismaField` / `relation` helpers, which propagate Prisma `include`/`select` from the query plan.
- **Services (business layer):** enforce domain rules, ownership/permission-sensitive behavior, and multi-step use cases.
- **Repositories (data layer):** Prisma-only persistence operations; no domain policy decisions.
- **Context:** per-request object containing auth identity (`currentUser: { userId, role }`) and instantiated services.

---

## Database Schema

```sql
-- Users
users
- id          (uuid, PK)
- name        (varchar, not null)
- email       (varchar, unique, not null)
- role        (enum: CONTRACTOR, HOMEOWNER, not null)
- created_at  (timestamp, default now())
- updated_at  (timestamp, default now())
- deleted_at  (timestamp, nullable)

-- Jobs
jobs
- id            (uuid, PK)
- contractor_id (uuid, not null, FK → users)
- homeowner_id  (uuid, unique, nullable, FK → users)
- description   (text, not null)
- address       (varchar, nullable)
- status        (enum: PLANNING, IN_PROGRESS, COMPLETED, CANCELED, default PLANNING)
- cost          (decimal, not null)
- created_at    (timestamp, default now())
- updated_at    (timestamp, default now())
- deleted_at    (timestamp, nullable)

-- Messages
messages
- id          (uuid, PK)
- job_id      (uuid, not null, FK → jobs)
- sender_id   (uuid, not null, FK → users)
- content     (text, not null)
- created_at  (timestamp, default now())
- updated_at  (timestamp, nullable)
```

### Design Decisions

- All identity data (`name`, `email`, `role`) lives on `users`. No separate contractor or homeowner profile tables — role is expressed via the `role` enum and `jobs` FKs pointing directly to `users`.
- `jobs.contractor_id` and `jobs.homeowner_id` both reference `users.id` directly.
- `jobs.homeowner_id` is `UNIQUE` — enforces one homeowner per job at the database level (1:1).
- `address` lives on `jobs` — it is the job site location, provided when the homeowner is added.
- `messages.sender_id` points to `users`; sender role is derived from the related user.
- Soft delete on `users` and `jobs` (`deleted_at`) preserves history while preventing deleted actors from authenticating or appearing in queries.

---

## Authentication

Authentication resolves identities from the `users` table through `src/auth/provider.ts`.

Design for this exercise:

- One mocked contractor identity seeded in the `users` table
- Users authenticate with `email` as login
- Homeowners created through `addHomeowner` are immediately login-enabled via their `users` row
- All users share one mock password constant: `DEFAULT_MOCK_PASSWORD`
- Passwords are mocked (plain text) for local/test use only

```typescript
export const DEFAULT_MOCK_PASSWORD = 'mock123'
```

**Login flow:**

1. Client calls `login(email, password)` mutation
2. Service validates provided password against `DEFAULT_MOCK_PASSWORD`
3. Resolves identity and role from `users` by email (soft-deleted users are rejected)
4. Returns JWT containing `{ userId, role }` where `userId` is `users.id`
5. All subsequent requests include JWT in `Authorization: Bearer <token>` header
6. Apollo context function validates JWT and populates `ctx.userId` and `ctx.role`

**Single login endpoint for both roles** — the resolver determines who is logging in by email and resolved role, not by separate endpoint per role.

---

## Authorization

Authorization is implemented in two levels:

- **Pothos scope-auth** (`@pothos/plugin-scope-auth`) enforces high-level access at the GraphQL field level:
  - `authScopes: { authenticated: true }` — requires a valid JWT-backed identity in context
  - `authScopes: { contractor: true }` — additionally requires `role === CONTRACTOR`
  - Scopes are declared per Query/Mutation field in `resolvers.ts`; the plugin runs checks before the resolver executes
- **Service-layer permission checks** enforce object-level and domain-specific rules:
  - homeowner can access only the job they are assigned to
  - contractor can mutate only jobs they own
  - cross-job messaging is forbidden
  - soft-deleted users are treated as inaccessible

Resolver flow:

- Pothos scope-auth validates high-level authn/authz before the resolver body runs
- Resolver remains thin and delegates use-case logic to a module service
- Service applies object-level authorization and domain invariants

---

## GraphQL Schema

The schema is defined programmatically via Pothos (`src/graphql/builder.ts` + module `resolvers.ts` files) and compiled to a standard GraphQL schema at startup. The effective types and fields are documented below.

### Enums

```graphql
enum JobStatus {
  PLANNING
  IN_PROGRESS
  COMPLETED
  CANCELED
}

enum UserRole {
  CONTRACTOR
  HOMEOWNER
}
```

### Types

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  role: UserRole!
  createdAt: String!
  updatedAt: String!
}

type Message {
  id: ID!
  jobId: ID!
  sender: User!
  content: String!
  createdAt: String!
}

type Job {
  id: ID!
  description: String!
  address: String
  status: JobStatus!
  cost: Float!
  contractor: User!
  homeowner: User
  messages: [Message!]!
  createdAt: String!
  updatedAt: String!
}

type AuthPayload {
  token: String!
  role: UserRole!
  user: User!
}
```

### Inputs

```graphql
input CreateJobInput {
  description: String!
  cost: Float!
}

input UpdateJobInput {
  description: String
  status: JobStatus
  cost: Float
}

input AddHomeownerInput {
  name: String!
  email: String!
  address: String!
}
```

### Queries

```graphql
type Query {
  # authScopes: { authenticated }
  # Contractor: returns all their jobs; Homeowner: returns only their assigned job
  jobs: [Job!]!

  # authScopes: { authenticated }
  # Both roles: get a single job by id
  job(id: ID!): Job

  # authScopes: { authenticated }
  # Current authenticated identity
  me: User!
}
```

### Mutations

```graphql
type Mutation {
  # No auth required
  login(email: String!, password: String!): AuthPayload!

  # authScopes: { contractor }
  createJob(input: CreateJobInput!): Job!
  updateJob(id: ID!, input: UpdateJobInput!): Job!
  deleteJob(id: ID!): Boolean!
  addHomeowner(jobId: ID!, input: AddHomeownerInput!): Job!

  # authScopes: { authenticated }
  sendMessage(jobId: ID!, content: String!): Message!
}
```

### Subscriptions

```graphql
type Subscription {
  # authScopes: { authenticated }
  # Streams new messages for a job in real time via WebSocket.
  # Enforces the same ownership rules as sendMessage.
  messageSent(jobId: ID!): Message!
}
```

---

## Key Use-Case Behaviors

### `jobs` query

- `JobService.listJobsForActor(ctx)` applies actor-aware filters:
  - Contractor: `WHERE jobs.contractor_id = ctx.userId AND jobs.deleted_at IS NULL`
  - Homeowner: `WHERE jobs.homeowner_id = ctx.userId AND jobs.deleted_at IS NULL`
- Resolver stays thin and delegates branching logic to service layer

### `job` query

- `JobService.getJobForActor(id, ctx)` enforces:
  - Contractor can fetch only their own job (`job.contractor_id = ctx.userId`)
  - Homeowner can fetch only their assigned job (`job.homeowner_id = ctx.userId`)
  - Soft-deleted jobs treated as not found
  - Authenticated-but-not-allowed requests return `FORBIDDEN`

### `addHomeowner` mutation

- `JobService.addHomeowner(jobId, input, ctx)`:
  - Verifies contractor owns the job
  - Throws if job already has a homeowner assigned (no silent overwrite)
  - Throws if a user with that email already exists
  - Creates `users` record with role `HOMEOWNER`
  - Sets `jobs.homeowner_id` and `jobs.address` atomically in a transaction
  - Enables homeowner login immediately via `DEFAULT_MOCK_PASSWORD`

### `deleteJob` mutation

- `JobService.softDelete(id)` sets `jobs.deleted_at = now()`
- Returns success boolean; idempotent for already-deleted jobs
- Preserves messages/history and excludes deleted jobs from standard queries

### `updateJob` mutation

- `JobService.update(id, input, ctx)`:
  - Contractor-only access
  - Partial update semantics (only provided fields change)

### `sendMessage` mutation

- `MessageService.send(jobId, content, ctx)` enforces:
  - Contractor can message only on jobs they own
  - Homeowner can message only on their assigned job
  - Cross-job message access is forbidden
  - Creates message with `sender_id = ctx.userId`
  - After persisting, publishes to Redis channel `MESSAGE_SENT.<jobId>`

### `messageSent` subscription

- Client opens a WebSocket connection to `/graphql` and provides a JWT in `connectionParams.authorization`
- The `subscribe` function verifies job access via `JobService.getJob` (same rules as `sendMessage`)
  - Unauthorized or unknown job: subscription fails immediately with the appropriate error
- On success, the client receives `Message` events whenever `sendMessage` is called on that job
- Uses Redis Pub/Sub as the event bus — supports multiple server instances without missed events
- Topic format: `MESSAGE_SENT.<jobId>` — scoped per job to avoid cross-job leakage

---

## Testing Strategy

Testing should focus on service-layer business rules and end-to-end GraphQL behavior.

### Test Stack

- Test runner: Jest (TypeScript support via ts-jest)
- API testing: Apollo Server integration tests (GraphQL operations against test server)
- Database integration: Testcontainers (PostgreSQL container) + Prisma
- Unit test DB policy: no container required for service unit tests (mock repositories/external dependencies)
- Fixtures: deterministic seed data for users, jobs, and messages

### Test Types

#### 1) Unit Tests (Services)

Scope:

- Business rules in module services (`job`, `user`, `message`)
- Authorization-sensitive domain behavior (role + ownership constraints)
- Soft-delete semantics and state transition rules
- Error paths and edge conditions

Examples:

- `JobService.addHomeowner` throws when job already has homeowner
- `JobService.addHomeowner` throws when email already exists
- `JobService.getJobForActor` returns forbidden for cross-ownership access

#### 2) Integration Tests (Primary)

Scope:

- GraphQL schema + resolvers + context + Prisma with a real PostgreSQL instance via Testcontainers
- Context generation from JWT
- Directive enforcement for `@authenticated` and `@hasRole`
- End-to-end authorization and service orchestration through GraphQL operations
- Prisma migrations applied against the containerized DB before integration specs run
- Repository behavior validated through real database execution in integration tests

Coverage matrix:

- `login`: success/failure for contractor and homeowner; rejected for soft-deleted user
- `jobs`: contractor sees own jobs; homeowner sees only their assigned job
- `job(id)`: forbidden when authenticated user is not the owner/assignee
- `createJob/updateJob/deleteJob`: contractor-only enforcement
- `addHomeowner`: assigns homeowner + sets address; rejects if already assigned or email exists
- `sendMessage`: role-based access by job ownership/assignment; persists `sender_id`
- partial updates in `updateJob` only mutate provided fields

Notes:

- Resolver unit tests are not part of the default strategy because resolvers stay thin and are covered by integration tests.
- Dedicated repository tests are optional; add only if complex reusable query logic emerges.

#### 3) Negative/Edge Case Coverage

- invalid/expired JWT
- non-existent `jobId` in read/write operations
- duplicate homeowner email on `addHomeowner`
- `users` soft delete prevents login for both roles
- unauthorized cross-job message attempts
- soft deleting a job with existing messages (messages retained, job hidden from default queries)

### Test Data and Isolation

- Start PostgreSQL via Testcontainers for integration test runs (never use local dev DB)
- Run Prisma migrations against the containerized DB before integration suite
- Prefer one container per suite for speed, then reset DB state between tests (transaction rollback or truncate strategy)
- Optionally run per-test containers for maximum isolation when debugging flaky tests
- Seed minimal deterministic fixtures to keep tests fast and stable

### CI Expectations

- CI runner must support Docker because integration tests use Testcontainers
- `npm run test` runs full unit and integration suite
- CI blocks merge on failing tests
- Optional: add coverage thresholds (e.g., 80% lines/functions) once baseline is stable

### Out of Scope (for this exercise)

- Load/performance testing
- Contract tests for external services (none in current architecture)
- Browser/UI tests (backend-focused project)

---
