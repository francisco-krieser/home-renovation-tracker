/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/*.integration.test.ts'],
  globalSetup: './src/tests/integration/setup/globalSetup.js',
  globalTeardown: './src/tests/integration/setup/globalTeardown.js',
  // setupFiles runs before each test file loads its modules — critical so that
  // DATABASE_URL is set before env.ts is imported and the Prisma client is created
  setupFiles: ['./src/tests/integration/setup/setupFile.ts'],
  testTimeout: 60000,
};
