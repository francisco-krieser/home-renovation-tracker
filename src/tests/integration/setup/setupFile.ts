// This file is executed by Jest (via setupFiles) before each integration test file
// is loaded. Setting DATABASE_URL here ensures that when env.ts is first imported it
// receives the Testcontainers connection string, not the local dev value.
import fs from "fs";
import path from "path";

const urlFile = path.join(process.cwd(), ".test-db-url");

if (!fs.existsSync(urlFile)) {
  throw new Error(
    "Integration test setup failed: .test-db-url not found. " +
      "Make sure globalSetup ran successfully.",
  );
}

process.env.DATABASE_URL = fs.readFileSync(urlFile, "utf-8").trim();
// Disable dotenv from overwriting DATABASE_URL when env.ts calls dotenv.config()
process.env.NODE_ENV = "test";
