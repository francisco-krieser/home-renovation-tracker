"use strict";

// Plain JS so Jest can require() it without TypeScript transform
module.exports = async function globalSetup() {
  const { PostgreSqlContainer } = require("@testcontainers/postgresql");
  const { execSync } = require("child_process");
  const fs = require("fs");
  const path = require("path");

  console.log("\n[integration] Starting PostgreSQL container...");
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();
  console.log("[integration] Container started. Applying schema...");

  // The existing migration SQL references old table structure (contractors/homeowners tables)
  // that no longer matches the current Prisma schema, so we use db push instead of migrate deploy.
  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  console.log("[integration] Schema applied. Tests ready.\n");

  // Write URL to a temp file so test workers can read it from setupFile.ts.
  // We cannot pass it via process.env because globalSetup runs in a separate
  // process from the test workers and environment mutations don't cross that boundary.
  const urlFile = path.join(process.cwd(), ".test-db-url");
  fs.writeFileSync(urlFile, url, "utf-8");
};
