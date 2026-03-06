"use strict";

// Plain JS so Jest can require() it without TypeScript transform
module.exports = async function globalSetup() {
  const { PostgreSqlContainer } = require("@testcontainers/postgresql");
  const { RedisContainer } = require("@testcontainers/redis");
  const { execSync } = require("child_process");
  const fs = require("fs");
  const path = require("path");
  const cwd = process.cwd();

  console.log("\n[integration] Starting PostgreSQL and Redis containers...");

  // Start both containers in parallel — no sequential dependency between them
  const [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  const dbUrl = pgContainer.getConnectionUri();
  const redisUrl = redisContainer.getConnectionUrl();

  console.log("[integration] Containers started. Applying schema...");

  // The existing migration SQL references old table structure (contractors/homeowners tables)
  // that no longer matches the current Prisma schema, so we use db push instead of migrate deploy.
  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  console.log("[integration] Schema applied. Tests ready.\n");

  // Write URLs to temp files so test workers can read them from setupFile.ts.
  // We cannot pass via process.env because globalSetup runs in a separate
  // process from the test workers and environment mutations don't cross that boundary.
  fs.writeFileSync(path.join(cwd, ".test-db-url"), dbUrl, "utf-8");
  fs.writeFileSync(path.join(cwd, ".test-redis-url"), redisUrl, "utf-8");
};
