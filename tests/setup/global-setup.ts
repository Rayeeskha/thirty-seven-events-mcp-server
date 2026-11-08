import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SEQUELIZE_CLI = path.resolve('node_modules/sequelize-cli/lib/sequelize');

/** Rebuilds the schema of the dedicated test database once per test run. */
export default function globalSetup(): void {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: process.env.TEST_DB_NAME ?? 'thirty_seven_events_test',
  };
  if (!env.DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to migrate "${env.DB_NAME}": the database name must end with "_test".`);
  }
  for (const command of ['db:migrate:undo:all', 'db:migrate']) {
    execFileSync('node', ['--import', 'tsx', SEQUELIZE_CLI, command], { env, stdio: 'pipe' });
  }
}
