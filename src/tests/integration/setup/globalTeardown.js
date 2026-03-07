"use strict";

module.exports = async function globalTeardown() {
  const fs = require("fs");
  const path = require("path");

  const urlFile = path.join(process.cwd(), ".test-db-url");
  if (fs.existsSync(urlFile)) {
    fs.unlinkSync(urlFile);
  }
  // The Testcontainers Ryuk reaper service automatically removes labelled containers
  // when the test process exits, so no explicit container.stop() is needed here.
};
