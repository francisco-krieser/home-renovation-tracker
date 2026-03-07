# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Node Version

Always use Node 20 when running any commands. The default shell node version may be incompatible with the code base. 

## Commands

```bash
# Development
npm run dev          # start with hot reload (tsx watch)
npm run build        # compile TypeScript to dist/
npm start            # run compiled server

# Database
docker compose up -d  # start PostgreSQL (binds to port 5433)
npm run db:migrate    # apply Prisma migrations
npm run db:seed       # seed initial contractor user
npm run db:studio     # open Prisma Studio

# Tests
npm test             # run unit tests only (Jest)
npm run test:integration  # run integration tests only (Testcontainers)
npm run test:all     # run unit + integration tests (always use this after any code change)

# Lint & Format
npm run lint         # check for lint errors (ESLint + typescript-eslint)
npm run lint:fix     # auto-fix lint errors
npm run format       # format all src files (Prettier)
npm run format:check # check formatting without writing (use in CI)
```


## Linting & Formatting

- **ESLint** (`eslint.config.mjs`): flat config with `typescript-eslint` type-checked rules (`recommendedTypeChecked`). Prettier conflicts disabled via `eslint-config-prettier`.
- **Prettier** (`.prettierrc`): 100-char width, double quotes, trailing commas, 2-space indent.
- Test files (`*.test.ts`, `src/__mocks__/**`, `src/tests/**`) have relaxed `unsafe-*` and `any` rules. CJS `.js` setup files are ignored entirely.
- Run `npm run lint` and `npm run format:check` before committing.

## Architecture

Three-layer module structure. Each module (`job`, `user`, `message`) has three files with strict role separation:

- **`resolvers.ts`** — thin transport layer; defines Pothos types, inputs, and Query/Mutation fields; maps GraphQL args/context to service calls only
- **`service.ts`** — all business rules, ownership checks, domain invariants
- **`repository.ts`** — Prisma queries only; zero policy decisions

Cross-cutting concerns:
- **`src/graphql/builder.ts`** — Pothos `SchemaBuilder` with `PrismaPlugin` and `ScopeAuthPlugin`; defines `authScopes` (`authenticated`, `contractor`)
- **`src/graphql/schema.ts`** — imports all module resolvers and calls `builder.toSchema()`
- **`src/graphql/scalars.ts`** — custom scalar types (`Decimal`, `DateTime`)
- **`src/context/index.ts`** — builds per-request context: validates JWT → populates `{ currentUser, services }`; services are module-level singletons shared across requests
- **`src/errors/appErrors.ts`** — typed error classes: `Unauthorized`, `Forbidden`, `NotFound`, `BadRequest`

## Authorization Model

Two-level system — both must pass:

1. **Pothos scope-auth** (declared on each field via `authScopes`): `{ authenticated: true }` requires valid JWT; `{ contractor: true }` gates contractor-only fields
2. **Service-layer checks**: object-level ownership (contractor owns job, homeowner assigned to job)

Key rules:
- Contractors see all their own jobs; homeowners see only their assigned job
- `addHomeowner` creates a `users` row + sets `jobs.homeowner_id` atomically in a transaction
- Soft deletes (`deleted_at`) on `users` and `jobs` — all queries filter `deleted_at IS NULL`

## Auth

All users share mock password `mock123` (constant in `src/auth/constants.ts`). JWT contains `{ userId, role }`. Login flow: `login` mutation → JWT → `Authorization: Bearer <token>` header.

Seeded contractor: `contractor@example.com` / `mock123`. Homeowners are created via `addHomeowner` mutation and are immediately login-enabled.

## Testing Strategy

- **Unit tests**: service layer with mocked repositories (no DB needed)
- **Integration tests**: full GraphQL operations against Testcontainers PostgreSQL instance with Prisma migrations applied; this is the primary test type
- Resolver unit tests are intentionally skipped (covered by integration tests)
- One container per suite, reset state between tests via transaction rollback or truncate
