// This file is executed by Jest (via setupFiles) before each integration test file
// is loaded. Setting DATABASE_URL and REDIS_URL here ensures that when env.ts is
// first imported it receives the Testcontainers connection strings, not local dev values.
import fs from "fs";
import path from "path";

const cwd = process.cwd();

const dbUrlFile = path.join(cwd, ".test-db-url");
if (!fs.existsSync(dbUrlFile)) {
  throw new Error(
    "Integration test setup failed: .test-db-url not found. " +
      "Make sure globalSetup ran successfully.",
  );
}

const redisUrlFile = path.join(cwd, ".test-redis-url");
if (!fs.existsSync(redisUrlFile)) {
  throw new Error(
    "Integration test setup failed: .test-redis-url not found. " +
      "Make sure globalSetup ran successfully.",
  );
}

process.env.DATABASE_URL = fs.readFileSync(dbUrlFile, "utf-8").trim();
process.env.REDIS_URL = fs.readFileSync(redisUrlFile, "utf-8").trim();
// Disable dotenv from overwriting DATABASE_URL / REDIS_URL when env.ts calls dotenv.config()
process.env.NODE_ENV = "test";
