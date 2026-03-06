/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    // Map before the broader @prisma/client pattern so the runtime mock is used for direct imports
    '^@prisma/client/runtime/library$': '<rootDir>/src/__mocks__/prisma-runtime.ts',
    '^@prisma/client$': '<rootDir>/src/__mocks__/prisma-client.ts',
  },
};
