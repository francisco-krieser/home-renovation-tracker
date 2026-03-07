"use strict";

module.exports = async function globalTeardown() {
  const fs = require("fs");
  const path = require("path");
  const cwd = process.cwd();

  for (const file of [".test-db-url", ".test-redis-url"]) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  // The Testcontainers Ryuk reaper service automatically removes labelled containers
  // when the test process exits, so no explicit container.stop() is needed here.
};
