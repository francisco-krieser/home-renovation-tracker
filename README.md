# Home Renovation Project Tracker

A GraphQL API for contractors and homeowners to collaborate on renovation projects.

---

## Walkthrough Videos

- [Overall Architecture](https://www.loom.com/share/baff0c343c92468fbf2e0ecce4a52135)
- [Decisions, Tradeoffs and Solutions](https://www.loom.com/share/07b5572926ff4af38883dc2f6f43ce3c)
- [Demo - Real-time Messaging](https://www.loom.com/share/94e7aae7dfe24eeeb25e706bd9cb7f55)

---

## Setup

### Prerequisites

- Node.js 20+
- Docker

### 1. Install dependencies

```bash
npm install
```

### 2. Start the database and Redis

```bash
docker compose up -d
```

> Postgres binds to **port 5433** on your host to avoid conflicts with other running instances.
> Redis binds to **port 6379** (standard Redis port).

### 3. Configure environment

```bash
cp .env.example .env
```

The defaults work out of the box for local development.

### 4. Run migrations and seed

```bash
npm run db:migrate   # creates all tables
npm run db:seed      # seeds the contractor user
```

### 5. Start the dev server

```bash
npm run dev
```

Server is available at **http://localhost:4000/graphql**

### Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed contractor user |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run unit tests (mocked Prisma) |
| `npm run test:integration` | Run integration tests (Testcontainers PostgreSQL) |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | `dev-secret-change-in-production` | Secret for signing JWTs |
| `PORT` | `4000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (used for subscription pub/sub) |

---

## API Usage

THE CURRENT AUTH IMPLEMENTATION SHOULD BE REPLACED BEFORE GOING TO PRODUCTION:

All users share a single mock password: `mock123` while we don't implement proper authentication.
Also there is a contractor (inserted on DB via seed) that allows login for testing purposes.
Homeowner users can be created via addHomeonwer mutation. Those created users will be available for login using the shared mock password above.

| Role | Email |
|---|---|
| Contractor | `contractor@example.com` |
| Homeowner | created via `addHomeowner` mutation |

Protected operations require `Authorization: Bearer <token>` header.

### Authentication

**Login and get a token:**

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { login(email: \"contractor@example.com\", password: \"mock123\") { token role user { id name email } } }"
  }'
```

Use the returned `token` in subsequent requests via `-H "Authorization: Bearer <token>"`.

---

### Queries

**Get current user:**

```graphql
query {
  me { id name email role }
}
```

**List jobs** (contractor: all their jobs):

```graphql
query {
  jobs {
    id
    description
    status
    cost
    homeowner { id name email }
    messages { sender { name } content createdAt }
  }
}
```

**Get a single job:** (contractor: all fields; homeowner: only id, status, messages)

```graphql
query {
  job(id: "<job-id>") {
    id
    description
    status
    cost
    address
    homeowner { id name email }
  }
}
```

---

### Mutations

**Create a job** (contractor only):

```graphql
mutation {
  createJob(input: {
    description: "Kitchen remodel"
    cost: "15000.00"
  }) {
    id
    status
    cost
  }
}
```

**Update a job** (contractor only; only provided fields change):

```graphql
mutation {
  updateJob(id: "<job-id>", input: {
    status: IN_PROGRESS
    cost: "16500.00"
  }) {
    id
    status
    cost
  }
}
```

**Delete a job** (contractor only; soft-delete, idempotent):

```graphql
mutation {
  deleteJob(id: "<job-id>")
}
```

**Add a homeowner to a job** (contractor only; creates user + assigns atomically):

```graphql
mutation {
  addHomeowner(jobId: "<job-id>", input: {
    name: "Jane Smith"
    email: "jane@example.com"
    address: "123 Main St, Springfield"
  }) {
    id
    address
    homeowner { id name email }
  }
}
```

**Remove homeowner from a job** (unlinks without deleting the user):

```graphql
mutation {
  removeHomeownerFromJob(jobId: "<job-id>") {
    id
    homeowner { id }
  }
}
```

**Delete a homeowner** (soft-deletes user + unassigns from active jobs):

```graphql
mutation {
  deleteHomeowner(id: "<homeowner-user-id>")
}
```

**Send a message** (both roles; only on jobs the caller owns or is assigned to):

```graphql
mutation {
  sendMessage(jobId: "<job-id>", content: "Tiles arrive Thursday.") {
    id
    content
    sender { name }
    createdAt
  }
}
```

### Curl example — full flow

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(email: \"contractor@example.com\", password: \"mock123\") { token } }"}' \
  | jq -r '.data.login.token')

# 2. Create a job
JOB_ID=$(curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { createJob(input: { description: \"Bathroom remodel\", cost: \"8500.00\" }) { id } }"}' \
  | jq -r '.data.createJob.id')

# 3. Add a homeowner
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation { addHomeowner(jobId: \\\"$JOB_ID\\\", input: { name: \\\"Alice\\\", email: \\\"alice@example.com\\\", address: \\\"456 Oak Ave\\\" }) { id homeowner { email } } }\"}"
```

### GraphQL Playground

Open **http://localhost:4000/graphql** in your browser. Run `login` first, then set the HTTP Headers panel:

```json
{ "Authorization": "Bearer <token>" }
```

### Subscriptions

Real-time messaging is delivered via GraphQL subscriptions over WebSocket (`graphql-ws` protocol). Apollo Sandbox (available at the GraphQL endpoint) supports subscriptions natively — no extra tooling needed.

**Subscribe to new messages on a job:**

```graphql
subscription {
  messageSent(jobId: "<job-id>") {
    id
    content
    createdAt
    sender { id name role }
  }
}
```

Set the connection params in Apollo Sandbox (under the "Headers" / "Connection params" tab):

```json
{ "authorization": "Bearer <token>" }
```

The subscription filters by `jobId` and enforces the same ownership rules as `sendMessage` — contractors see messages on their jobs, homeowners on their assigned job. Unauthorized subscription attempts fail immediately during the handshake.

---

## Key Assumptions, Risks, and Technical Tradeoffs

### Why GraphQL

The domain naturally has variable data needs per role: contractors need full job details (cost, address, all messages), while homeowners only need status and messaging. GraphQL's field-level selection and the ability to declare per-field authorization (`authScopes`) made it a clean fit compared to building multiple REST endpoints.

### Code-first (Pothos) over SDL-first

SDL-first requires keeping typeDefs and resolvers in sync manually, and authorization logic lives separately from the field declaration — easy to miss a field. Pothos co-locates the type definition, authorization scope, and resolver in one place. The `PrismaPlugin` also derives object types directly from the Prisma schema, which eliminates a whole class of drift between the database model and the GraphQL schema. The tradeoff is that the schema itself isn't a plain `.graphql` file you can read in isolation — but the SDL can be introspected at runtime.

### Pothos PrismaPlugin over manual DataLoaders

The `PrismaPlugin` propagates Prisma's `include`/`select` up through the resolver chain via the `query` parameter. When a resolver calls `t.prismaField()`, Pothos inspects what fields the client requested and passes the corresponding `include` clauses down to the repository. This avoids N+1 queries without hand-writing a DataLoader per relation. The tradeoff is that this only works cleanly when the root resolver owns the query — ad-hoc queries outside `prismaField` still need care.

### Data model decisions

**No separate contractor/homeowner tables.** The initial instinct was `contractors` and `homeowners` tables with profiles. After modelling the actual domain, both entities are users with a role — their profile data was empty beyond name and email. A `role` enum on `users` with direct foreign keys on `jobs` (`contractor_id`, `homeowner_id`) keeps the schema flat and avoids joins through junction tables for every lookup.

**One homeowner per job, one job per homeowner** (`homeowner_id UNIQUE` on `jobs`). In the home renovation domain a homeowner hires a contractor for a specific project — they're not managing a portfolio of simultaneous renovations. The `UNIQUE` constraint on `homeowner_id` enforces both sides of this: a job has at most one homeowner, and a homeowner is tied to at most one job. This keeps authorization simple (a homeowner's "their job" is unambiguous) and the constraint is enforced at the database level rather than relying solely on application logic. That can be reviewed in the future if needed.

**Address on `jobs`, not `users`.** Address is the job site location provided at assignment time. In the future we could have a separate model for homes and have job referencing home to avoid duplicating address when multiple jobs are made in the same home but now, for simplicity, jobs contains the address.

**Soft deletes on `users` and `jobs`.** Hard-deleting a user would orphan message history. Soft delete preserves the audit trail while preventing deleted users from authenticating (the Prisma extension auto-filters `deleted_at: null` on every `findMany`/`findFirst`).

### `addHomeowner` transaction isolation level

`addHomeowner` creates a user and assigns them to a job inside a single `$transaction`. Prisma's default transaction isolation is **Read Committed**. A theoretical race condition exists: two concurrent requests could both check that `homeowner_id IS NULL` and both attempt to assign. The `assignHomeowner` repository method uses `updateMany` with `WHERE homeowner_id IS NULL` as a conditional update — only one will update one row; the other will see `count === 0` and throw `BadRequestError('Job already has homeowner')`. This handles the race correctly without needing `SERIALIZABLE` isolation. `SERIALIZABLE` would block concurrent transactions on the same rows, becoming a throughput bottleneck under any meaningful concurrency. The current optimistic approach avoids that: conflicts are rare in practice (a contractor double-submitting), and when one does occur the application already throws a clear, actionable error — giving the client the signal to retry if needed, without any DB-level blocking.

---

## What I'd Improve With More Time

- Replace mock password auth with bcrypt hashing, JWT expiry, and refresh token rotation
- Add cursor-based pagination to `jobs`, `jobHistory`, and `messages` — all currently unbounded
- Structured logging with correlation IDs instead of raw `console.error`
- CI/CD pipeline gating on lint + test + build