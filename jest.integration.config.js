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
  // DATABASE_URL and REDIS_URL are set before env.ts is imported
  setupFiles: ['./src/tests/integration/setup/setupFile.ts'],
  testTimeout: 60000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // graphql-ws ships both ESM (.js) and CJS (.cjs) files. Jest runs in CJS mode,
  // so redirect all graphql-ws imports to their .cjs equivalents.
  moduleNameMapper: {
    '^graphql-ws/dist/(.*)$': '<rootDir>/node_modules/graphql-ws/dist/$1.cjs',
    '^graphql-ws$': '<rootDir>/node_modules/graphql-ws/dist/index.cjs',
  },
};
