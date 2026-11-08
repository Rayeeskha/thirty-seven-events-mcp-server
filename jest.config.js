/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
        module: { type: 'commonjs' },
      },
    ],
  },
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/after-env.ts'],
  globalSetup: '<rootDir>/tests/setup/global-setup.ts',
  testTimeout: 30000,
  // All integration tests share one MySQL test database, so test files must not run in parallel.
  maxWorkers: 1,
  coverageProvider: 'v8',
  // src/server.ts runs as a child process in entrypoints.test.ts, which Jest's counter cannot see.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/database/migrations/**',
    '!src/database/seeders/**',
    '!src/config/sequelize-cli.config.ts',
  ],
};
